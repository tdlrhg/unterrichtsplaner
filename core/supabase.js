// ── Supabase via fetch – kein externer CDN ───────────────────────
const _URL = 'https://yjyqmpppwglktvcfcorh.supabase.co';
const _KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeXFtcHBwd2dsa3R2Y2Zjb3JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjI0MDEsImV4cCI6MjA5NDE5ODQwMX0.GHE6wIVw72B7tzx7s6mihKppHCzVKugYo07wOFZvMhg';
const BUCKET = 'unterrichtsplaner';

async function sbUpload(path, obj) {
  const url = _URL + '/storage/v1/object/' + BUCKET + '/' + path;
  const body = new Blob([JSON.stringify(obj)], { type: 'application/octet-stream' });
  const headers = {
    'apikey': _KEY,
    'Authorization': 'Bearer ' + _KEY,
    'Content-Type': 'application/octet-stream',
    'x-upsert': 'true'
  };
  let res = await fetch(url, { method: 'POST', headers, body });
  if (!res.ok) {
    res = await fetch(url, { method: 'PUT', headers, body });
  }
  if (!res.ok) throw new Error(await res.text());
}

async function sbDownload(path) {
  const url = _URL + '/storage/v1/object/' + BUCKET + '/' + path;
  const headers = { 'apikey': _KEY, 'Authorization': 'Bearer ' + _KEY };
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return await res.json();
}

// ── Supabase Tabellen (REST/PostgREST) ───────────────────────────

const _H = () => ({
  'apikey': _KEY,
  'Authorization': 'Bearer ' + _KEY,
  'Content-Type': 'application/json',
});

// Batch-Insert / Upsert (löst Konflikte per id auf)
async function sbInsert(table, rows) {
  if (!rows.length) return { ok: true, count: 0 };
  const url = _URL + '/rest/v1/' + table;
  const headers = { ..._H(), 'Prefer': 'resolution=merge-duplicates' };
  let total = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(chunk) });
    if (!res.ok) { const err = await res.text(); throw new Error(err); }
    total += chunk.length;
  }
  return { ok: true, count: total };
}

// Volltext-Suche (plfts = plainto_tsquery: Leerzeichen → AND)
// filters: { fach: 'Mathematik', jahrgang: 7 } → eq-Filter
async function sbQueryFTS(table, ftsQuery, filters = {}, limit = 10) {
  const params = [];
  if (ftsQuery && ftsQuery.trim()) {
    params.push('search_vector=wfts(german).' + encodeURIComponent(ftsQuery.trim()));
  }
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') {
      params.push(k + '=eq.' + encodeURIComponent(v));
    }
  });
  params.push('limit=' + limit);
  const url = _URL + '/rest/v1/' + table + '?' + params.join('&');
  const res = await fetch(url, { headers: _H() });
  if (!res.ok) return [];
  return await res.json();
}

// Generische SELECT-Abfrage mit eq-Filtern, FTS, Order, Limit, Offset
async function sbSelect(table, { filters = {}, fts = null, limit = 50, offset = 0, order = null } = {}) {
  const params = ['select=*'];
  if (fts && fts.trim()) {
    params.push('search_vector=wfts(german).' + encodeURIComponent(fts.trim()));
  }
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') {
      params.push(k + '=eq.' + encodeURIComponent(v));
    }
  });
  if (order) params.push('order=' + order);
  params.push('limit=' + limit);
  if (offset) params.push('offset=' + offset);
  const url = _URL + '/rest/v1/' + table + '?' + params.join('&');
  const res = await fetch(url, { headers: _H() });
  if (!res.ok) return [];
  return await res.json();
}

// Anzahl Zeilen in einer Tabelle
async function sbCount(table) {
  const url = _URL + '/rest/v1/' + table + '?select=id';
  const res = await fetch(url, { headers: { ..._H(), 'Prefer': 'count=exact' } });
  if (!res.ok) return null;
  const range = res.headers.get('content-range'); // z.B. "0-9/212"
  return range ? parseInt(range.split('/')[1]) : null;
}
