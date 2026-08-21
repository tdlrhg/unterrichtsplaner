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

// prompt    : String  → wird als Text-Block verpackt
//             Array   → Content-Blocks direkt (Multimodal, z.B. mit Bildern)
// maxTokens : Tokenlimit (default 1024)
// model     : Modell-ID (default KI_MODEL_SONNET)
async function callKI(prompt, { model = KI_MODEL_SONNET, maxTokens = 1024 } = {}) {
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
  return data.content?.[0]?.text || '';
}

// Multi-turn Agent-Aufruf mit Tool-Use und Gesprächshistorie.
// messages: vollständige Anthropic-Message-Array (wird extern verwaltet).
// Gibt das vollständige API-Response-Objekt zurück (nicht nur Text).
async function callKIAgent({ messages, tools = [], system = '', model = KI_MODEL_SONNET, maxTokens = 8192 } = {}) {
  const antKey = localStorage.getItem('ant_key');
  if (!antKey) throw new Error('Kein API-Key hinterlegt (Einstellungen).');
  const body = { model, max_tokens: maxTokens, messages };
  if (tools.length) body.tools = tools;
  if (system) body.system = system;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': antKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || res.statusText);
  }
  return await res.json();
}
