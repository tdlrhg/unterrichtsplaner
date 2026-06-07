// ── Zentraler KI-Transport (Anthropic Messages API) ──────────────
// Alle KI-Aufrufe im Unterrichtsplaner laufen über diese Funktion,
// damit Modellwahl, Header und Fehlerbehandlung einheitlich bleiben.

const KI_MODEL_SONNET = 'claude-sonnet-4-6';
const KI_MODEL_HAIKU  = 'claude-haiku-4-5';

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
