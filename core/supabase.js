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

async function sbLoeschenObjekt(path) {
  const url = _URL + '/storage/v1/object/' + BUCKET + '/' + path;
  const headers = { 'apikey': _KEY, 'Authorization': 'Bearer ' + _KEY };
  const res = await fetch(url, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(await res.text());
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
// nullFilters: Array von Spalten, die per IS NULL gefiltert werden
// select: Spalten-Auswahl (default '*')
async function sbSelect(table, { select = '*', filters = {}, nullFilters = [], fts = null, limit = 50, offset = 0, order = null, rawParams = [] } = {}) {
  const params = ['select=' + select];
  if (fts && fts.trim()) {
    params.push('search_vector=wfts(german).' + encodeURIComponent(fts.trim()));
  }
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') {
      params.push(k + '=eq.' + encodeURIComponent(v));
    }
  });
  nullFilters.forEach(function(col) { params.push(col + '=is.null'); });
  rawParams.forEach(function(p) { params.push(p); });
  if (order) params.push('order=' + order);
  params.push('limit=' + limit);
  if (offset) params.push('offset=' + offset);
  const url = _URL + '/rest/v1/' + table + '?' + params.join('&');
  const ctrl = new AbortController();
  const timer = setTimeout(function() { ctrl.abort(); }, 15000);
  try {
    const res = await fetch(url, { headers: _H(), signal: ctrl.signal });
    if (!res.ok) return [];
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Alle Zeilen einer Tabelle paginiert laden.
// Nutzt sbSelect in 1000er Schritten, bis keine weiteren Zeilen mehr kommen.
async function sbSelectAll(table, opts = {}) {
  const pageSize = opts.limit && opts.limit > 0 ? opts.limit : 1000;
  let offset = 0;
  let all = [];
  for (;;) {
    const rows = await sbSelect(table, { ...opts, limit: pageSize, offset });
    if (!Array.isArray(rows) || !rows.length) break;
    all = all.concat(rows);
    if (rows.length < pageSize) break;
    offset += rows.length;
  }
  return all;
}

// Einzelne Zeile aktualisieren (PATCH per id)
async function sbUpdate(table, id, changes) {
  const url = _URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ..._H(), 'Prefer': 'return=representation' },
    body: JSON.stringify(changes),
  });
  if (!res.ok) throw new Error(await res.text());
  const arr = await res.json();
  return arr[0] || null;
}

// Einzelne Zeile löschen (DELETE per id)
async function sbDelete(table, id) {
  const url = _URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id);
  const res = await fetch(url, { method: 'DELETE', headers: _H() });
  if (!res.ok) throw new Error(await res.text());
}


// ── Tagessicherung ───────────────────────────────────────────────
// Legt beim ersten Laden des Tages eine datierte Kopie von data.json unter
// backups/ ab — also den Stand VOR den Änderungen des Tages. Genau das
// braucht man, wenn versehentlich etwas gelöscht wurde.
//
// Absichtlich streng: Gesichert wird nur, was nachweislich Inhalt hat.
// Eine fehlgeschlagene Ladung darf niemals eine gute Sicherung überschreiben.
async function tagessicherung(geladen) {
  try {
    if (!geladen || typeof geladen !== 'object') return;
    const fps = geladen.fachplanungen;
    if (!Array.isArray(fps) || fps.length === 0) return;

    const heute = new Date().toISOString().slice(0, 10);
    const marker = 'backup_' + heute;
    if (localStorage.getItem(marker)) return;   // heute schon gesichert

    await sbUpload('backups/data-' + heute + '.json', geladen);
    localStorage.setItem(marker, '1');
    console.log('[Sicherung] Tagesstand abgelegt: backups/data-' + heute + '.json');
  } catch (e) {
    console.warn('[Sicherung] fehlgeschlagen:', e.message);
  }
}

// Listet vorhandene Sicherungen, neueste zuerst.
async function sicherungenListe() {
  const url = _URL + '/storage/v1/object/list/' + BUCKET;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ..._H() },
    body: JSON.stringify({ prefix: 'backups/', limit: 200, sortBy: { column: 'name', order: 'desc' } }),
  });
  if (!res.ok) return [];
  const objs = await res.json();
  return objs.map(o => ({
    name: 'backups/' + o.name,
    datum: (o.name.match(/data-(\d{4}-\d{2}-\d{2})/) || [])[1] || '',
    groesse: (o.metadata || {}).size || 0,
  }));
}

// ── Konfliktschutz ───────────────────────────────────────────────
// data.json enthält die gesamte Planung und wird bei jedem Speichern
// vollständig überschrieben. Sind zwei Sitzungen offen — zwei Geräte, zwei
// Tabs —, gewinnt die zuletzt speichernde, und die Arbeit der anderen ist
// stillschweigend weg. Genau so gehen Daten verloren.
//
// Deshalb: Vor jedem Schreiben prüfen, ob die Datei noch so ist wie beim
// Laden. Hat sie sich geändert, wird NICHT überschrieben.
let _dataFingerprint = null;   // Stand, den diese Sitzung kennt

async function dataFingerprint() {
  const url = _URL + '/storage/v1/object/info/' + BUCKET + '/data.json';
  try {
    const res = await fetch(url, { headers: _H() });
    if (!res.ok) return null;
    const info = await res.json();
    // etag ist eine Prüfsumme des Inhalts — erkennt auch Änderungen, die die
    // Dateigröße nicht verschieben. Die anderen Werte nur als Rückfallebene.
    return (info.etag || '') + '|' + (info.last_modified || '') + '|' + (info.size || '');
  } catch (e) {
    return null;   // Prüfung nicht möglich — Speichern darf trotzdem laufen
  }
}

// Nach dem Laden merken, welchen Stand diese Sitzung gesehen hat.
async function merkeDatenStand() {
  _dataFingerprint = await dataFingerprint();
}

// true = unverändert oder nicht prüfbar (Speichern erlaubt)
// false = jemand anderes hat zwischenzeitlich geschrieben
async function datenStandUnveraendert() {
  if (!_dataFingerprint) return true;      // nie gemerkt: nicht blockieren
  const jetzt = await dataFingerprint();
  if (!jetzt) return true;                 // Prüfung fehlgeschlagen: nicht blockieren
  return jetzt === _dataFingerprint;
}
