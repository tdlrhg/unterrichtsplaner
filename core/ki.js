// ── Zentraler KI-Transport (Anthropic Messages API) ──────────────
// Alle KI-Aufrufe im Unterrichtsplaner laufen über diese Funktion,
// damit Modellwahl, Header und Fehlerbehandlung einheitlich bleiben.

const KI_MODEL_SONNET = 'claude-sonnet-4-6';
const KI_MODEL_HAIKU  = 'claude-haiku-4-5';
const KI_BILLING_URL  = 'https://console.anthropic.com/settings/billing';

function isKICreditError(err) {
  const msg = (err && err.message || '').toLowerCase();
  return msg.includes('credit balance') || msg.includes('insufficient_quota');
}

// Zeigt eine KI-Fehlermeldung in einem Status-Element an. Bei Guthaben-Fehlern
// wird zusätzlich ein klickbarer Link zur Anthropic-Konsole eingeblendet.
function showKIError(el, err, prefix) {
  el.innerHTML = '';
  el.appendChild(document.createTextNode((prefix || '⚠ ') + err.message));
  if (isKICreditError(err)) {
    el.appendChild(document.createTextNode(' — '));
    const a = document.createElement('a');
    a.href = KI_BILLING_URL; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = 'Guthaben aufladen ↗';
    a.style.color = 'var(--pri)';
    el.appendChild(a);
  }
}

// ── Usage-Tracking ────────────────────────────────────────────────
// Protokolliert jeden API-Call (Modell, Label, Token-Zahlen) lokal,
// damit Modellwahl-Entscheidungen auf echten Zahlen statt Vermutungen beruhen.
const KI_USAGE_KEY = 'ki_usage_log';
const KI_USAGE_MAX = 1000;

function logKIUsage(model, label, usage) {
  if (!usage) return;
  try {
    const log = JSON.parse(localStorage.getItem(KI_USAGE_KEY) || '[]');
    log.push({
      t: Date.now(),
      model,
      label: label || null,
      input: usage.input_tokens || 0,
      output: usage.output_tokens || 0,
      cacheWrite: usage.cache_creation_input_tokens || 0,
      cacheRead: usage.cache_read_input_tokens || 0,
    });
    if (log.length > KI_USAGE_MAX) log.splice(0, log.length - KI_USAGE_MAX);
    localStorage.setItem(KI_USAGE_KEY, JSON.stringify(log));
  } catch(e) { /* localStorage voll o.ä. — Tracking ist best-effort */ }
}

// Aggregiert das Usage-Log nach Modell und Label.
function getKIUsageSummary() {
  let log = [];
  try { log = JSON.parse(localStorage.getItem(KI_USAGE_KEY) || '[]'); } catch(e) {}
  const byModel = {};
  log.forEach(e => {
    const key = e.model + '|' + (e.label || '(ohne Label)');
    if (!byModel[key]) byModel[key] = { model: e.model, label: e.label || '(ohne Label)', calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    const b = byModel[key];
    b.calls++; b.input += e.input; b.output += e.output; b.cacheWrite += e.cacheWrite; b.cacheRead += e.cacheRead;
  });
  return { total: log.length, rows: Object.values(byModel).sort((a,b) => (b.input+b.output) - (a.input+a.output)) };
}

function clearKIUsageLog() { localStorage.removeItem(KI_USAGE_KEY); }

// prompt    : String  → wird als Text-Block verpackt
//             Array   → Content-Blocks direkt (Multimodal, z.B. mit Bildern)
// maxTokens : Tokenlimit (default 1024)
// model     : Modell-ID (default KI_MODEL_SONNET)
// label     : Kurzname des Aufrufers für die Usage-Auswertung (z.B. 'checkliste-import')
async function callKI(prompt, { model = KI_MODEL_SONNET, maxTokens = 1024, label = null } = {}) {
  const antKey = localStorage.getItem('ant_key');
  if (!antKey) throw new Error('Kein API-Key hinterlegt (Einstellungen).');
  const content = typeof prompt === 'string'
    ? [{ type: 'text', text: prompt }]
    : prompt;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': antKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || res.statusText);
  }
  const data = await res.json();
  logKIUsage(model, label, data.usage);
  return data.content?.[0]?.text || '';
}

// Multi-turn Agent-Aufruf mit Tool-Use und Gesprächshistorie.
// messages: vollständige Anthropic-Message-Array (wird extern verwaltet).
// signal  : AbortSignal, um einen laufenden Aufruf abzubrechen (Stopp-Knopf).
//           Ein Abbruch wirft KI_ABBRUCH – der Aufrufer soll das nicht als
//           Fehler anzeigen, sondern als bewusste Unterbrechung.
// Gibt das vollständige API-Response-Objekt zurück (nicht nur Text).
const KI_ABBRUCH = 'KI_ABBRUCH';

async function callKIAgent({ messages, tools = [], system = '', model = KI_MODEL_SONNET, maxTokens = 8192, label = null, signal = null } = {}) {
  const antKey = localStorage.getItem('ant_key');
  if (!antKey) throw new Error('Kein API-Key hinterlegt (Einstellungen).');
  const body = { model, max_tokens: maxTokens, messages };
  if (tools.length) body.tools = tools;
  if (system) body.system = system;
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': antKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(KI_ABBRUCH);
    throw e;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || res.statusText);
  }
  let json;
  try {
    json = await res.json();   // kann beim Abbruch mitten im Body reißen
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(KI_ABBRUCH);
    throw e;
  }
  logKIUsage(model, label, json.usage);
  return json;
}
