// ── State ────────────────────────────────────────────────────────
const S = {
  data: null,        // { fachplanungen: [], kurse: [] }
  loaded: false,
  saving: false,
  aktFpId: null,     // aktiver Fachplanung
  sel: null,         // { type, ids }
  modal: null,
  open: {},
  view: 'fachplanung',  // 'fachplanung' | 'kurse'
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// ── Data helpers ─────────────────────────────────────────────────
function getFachplanung(id) {
  return (S.data.fachplanungen || []).find(l => l.id === id);
}

function getKurs(id) {
  return (S.data.kurse || []).find(k => k.id === id);
}

function findBlock(fpId, blockId) {
  const lp = getFachplanung(fpId);
  return lp && (lp.blocks || []).find(b => b.id === blockId);
}

function findReihe(fpId, blockId, reiheId) {
  const block = findBlock(fpId, blockId);
  return block && (block.reihen || []).find(r => r.id === reiheId);
}

function findEinheit(fpId, blockId, reiheId, einheitId) {
  const reihe = findReihe(fpId, blockId, reiheId);
  return reihe && (reihe.einheiten || []).find(e => e.id === einheitId);
}

function findStunde(fpId, blockId, reiheId, einheitId, stundeId) {
  const einheit = findEinheit(fpId, blockId, reiheId, einheitId);
  return einheit && (einheit.stunden || []).find(s => s.id === stundeId);
}

function getAlleStunden(fpId) {
  const lp = getFachplanung(fpId);
  if (!lp) return [];
  const alle = [];
  (lp.blocks || []).forEach(b =>
    (b.reihen || []).forEach(r =>
      (r.einheiten || []).forEach(e =>
        (e.stunden || []).forEach(s => alle.push(s))
      )
    )
  );
  return alle;
}

// ── Persistence ──────────────────────────────────────────────────
let _saveTimer = null;

function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(doPersist, 800);
}

async function doPersist() {
  S.saving = true;
  refreshTopbar();
  try {
    await sbUpload('data.json', S.data);
  } catch (e) {
    console.error('Speichern fehlgeschlagen:', e);
  }
  S.saving = false;
  refreshTopbar();
}
