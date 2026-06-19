// ── Methodendatenbank ─────────────────────────────────────────────
let METHDB = [];

// ── KLP-Datenbank ─────────────────────────────────────────────────
let KLPDB = [];

// ── Didaktik-Wissensmodell ────────────────────────────────────────
let DIDAKTIKDB = {};

// ── Didaktik-Artikel (aus Zeitschriften) ─────────────────────────
let DIDARTDB = [];

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

// Gruppe (ehem. Einheit) – nur noch Metadaten, keine stunden[] mehr
function findEinheit(fpId, blockId, reiheId, einheitId) {
  const reihe = findReihe(fpId, blockId, reiheId);
  return reihe && (reihe.einheiten || []).find(e => e.id === einheitId);
}

// Stunden liegen direkt in reihe.stunden[], mit optionalem einheitId-Feld
function findStunde(fpId, blockId, reiheId, stundeId) {
  const reihe = findReihe(fpId, blockId, reiheId);
  return reihe && (reihe.stunden || []).find(s => s.id === stundeId);
}

// ── Didaktik-Kontext für KI-Prompts ─────────────────────────────
// Gibt passende Kernaussagen + Muster aus DIDARTDB als kompakten Text zurück.
// ebenen: ['reihe','stunde','material','situation'] - welche Planungsebene
// themen: ['problemlösen','differenzierung',...] - optional, filtert zusätzlich
// werkzeuge: true → Heuristiken + Darstellungsformen einschließen
// Leitet Didaktik-Tags aus der Lerngruppenanalyse eines Kurses ab
function getLGThemen(kursId) {
  const kurs = getKurs(kursId);
  if (!kurs?.lerngruppe) return [];
  const lg = kurs.lerngruppe;
  const tags = new Set();
  if (['heterogen','eher schwach'].includes(lg.leistung)) tags.add('differenzierung');
  if (lg.leistung === 'eher stark') { tags.add('differenzierung'); tags.add('hochbegabung'); }
  if ((lg.foerderung||[]).includes('DaZ') || (lg.sprachBesonderheiten||[]).includes('DaZ')) tags.add('sprachsensibel');
  if (['gering','entwickelt sich'].includes(lg.fachsprache)) tags.add('sprachsensibel');
  if ((lg.foerderung||[]).includes('ADHS')) { tags.add('neurodiversität'); tags.add('classroom-management'); }
  if ((lg.foerderung||[]).includes('Inklusion')) { tags.add('inklusion'); tags.add('differenzierung'); }
  if ((lg.foerderung||[]).includes('Hochbegabung')) { tags.add('differenzierung'); tags.add('hochbegabung'); }
  if ((lg.foerderung||[]).includes('LRS')) tags.add('differenzierung');
  if (lg.sozial === 'angespannt') tags.add('classroom-management');
  if (lg.motivation === 'gering') tags.add('motivation');
  if ((lg.arbeitsweisen||[]).includes('Problemlösen')) tags.add('problemlösen');
  return [...tags];
}

// Gibt aktiven Kurs für eine Fachplanung zurück
function getAktKurs(fpId) {
  const kurse = kurseForFachplanung(fpId);
  if (!kurse.length) return null;
  if (S.aktKursId) {
    const k = kurse.find(k => k.id === S.aktKursId);
    if (k) return k;
  }
  return kurse[0];
}

function getDIDContext(ebenen = [], themen = [], werkzeuge = false) {
  if (!DIDARTDB.length) return '';
  const lines = [];
  DIDARTDB.forEach(art => {
    (art.kernaussagen || []).forEach(k => {
      const eOk = !ebenen.length || (k.planungsebene||[]).some(e => ebenen.includes(e));
      const tOk = !themen.length || (k.themen||[]).some(t => themen.some(th => t.includes(th) || th.includes(t)));
      if (eOk && tOk) lines.push('• ' + k.aussage);
    });
    (art.muster || []).forEach(m => {
      const eOk = !ebenen.length || (m.planungsebene||[]).some(e => ebenen.includes(e));
      const tOk = !themen.length || (m.themen||[]).some(t => themen.some(th => t.includes(th) || th.includes(t)));
      if (eOk && tOk) lines.push(`→ ${m.name}: ${m.prinzip}`);
    });
    if (werkzeuge) {
      const wz = art.werkzeuge || {};
      if (wz.heuristiken?.length) lines.push(`Problemlöseheuristiken: ${wz.heuristiken.join(', ')}`);
      if (wz.repraesentationen?.length) lines.push(`Darstellungsformen: ${wz.repraesentationen.join(', ')}`);
    }
  });
  if (!lines.length) return '';
  return '\nDidaktische Leitlinien:\n' + lines.join('\n') + '\n';
}

// ── Migration: altes Format (einheit.stunden[]) → flach (reihe.stunden[]) ──
function migrateToFlatStunden(lp) {
  (lp.blocks || []).forEach(block => {
    (block.reihen || []).forEach(reihe => {
      if (!reihe.stunden) reihe.stunden = [];
      (reihe.einheiten || []).forEach(einheit => {
        if (Array.isArray(einheit.stunden) && einheit.stunden.length > 0) {
          einheit.stunden.forEach(s => {
            s.einheitId = einheit.id;
            reihe.stunden.push(s);
          });
          delete einheit.stunden;
        }
      });
    });
  });
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
