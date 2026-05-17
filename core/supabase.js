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
