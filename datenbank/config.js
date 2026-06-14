// ── Material-Datenbank App ────────────────────────────────────────

// Shims damit methoden.js / didaktik.js ohne Änderung funktionieren
var METHDB     = [];
var DIDARTDB   = [];
var DIDAKTIKDB = {};
var _regalGen = 0;
var S = null; // wird nach DB-Init gesetzt
function render() { dbRender(); }

var DB_VERSION = null;
var DB_VERSION_STATUS = null;

const FAECHER = [
  { key: 'mathe',  label: 'Mathematik', icon: '📐', color: '#2563eb' },
  { key: 'bio',    label: 'Biologie',   icon: '🌿', color: '#16a34a' },
  { key: 'chemie', label: 'Chemie',     icon: '🧪', color: '#d97706' },
];

// ── Spalten-Konfiguration ──────────────────────────────────────────
const COLS = [
  { key: 'src',      label: 'Aufgabe',      hCls: 'db-col-hdr-src',    cCls: 'db-col-src',    sortField: 'seite',         mandatory: true  },
  { key: 'inhalt',   label: 'Inhalt',       hCls: 'db-col-hdr-inhalt', cCls: 'db-col-inhalt', sortField: 'inhalt'                          },
  { key: 'schw',     label: 'AFB / Niveau', hCls: 'db-col-hdr-schw',   cCls: 'db-col-schw',   sortField: 'schwierigkeit'                   },
  { key: 'operator', label: 'Operator',     hCls: 'db-col-hdr-op',     cCls: 'db-col-op',     sortField: 'operator',      defaultOff: true },
  { key: 'umfang',   label: 'Umfang',       hCls: 'db-col-hdr-umfang', cCls: 'db-col-umfang', sortField: null,            defaultOff: true },
  { key: 'kapitel',  label: 'Kapitel',      hCls: 'db-col-hdr-kap',    cCls: 'db-col-kap',    sortField: 'kapitel'                         },
  { key: 'uk_titel', label: 'Unterkapitel', hCls: 'db-col-hdr-uk',     cCls: 'db-col-uk',     sortField: 'uk_titel'                        },
];

var COL_CONFIG = (function() {
  try {
    var s = JSON.parse(localStorage.getItem('db_col_config') || 'null');
    if (s && s.v === 5 && Array.isArray(s.order) && Array.isArray(s.widths) && Array.isArray(s.hidden)) return s;
  } catch(e) {}
  return { v: 5, order: [0,1,2,3,4,5,6], widths: [210, null, 160, 110, 80, 130, 120], hidden: [3,4] };
})();

function saveColConfig() {
  try { localStorage.setItem('db_col_config', JSON.stringify(COL_CONFIG)); } catch(e) {}
}

function visibleCols() {
  return COL_CONFIG.order.filter(function(i) { return COL_CONFIG.hidden.indexOf(i) === -1; });
}

function colTemplate() {
  return visibleCols().map(function(i) {
    var w = COL_CONFIG.widths[i];
    return w ? w + 'px' : '1fr';
  }).join(' ');
}

function applyColTemplate() {
  var tpl = colTemplate();
  document.querySelectorAll('.db-table-head, .db-row').forEach(function(el) {
    el.style.gridTemplateColumns = tpl;
  });
}

const DB = {
  view: 'landing',       // 'landing' | 'fach'
  fach: null,
  quelle_name: null,     // null | Buchtitel-String → Filter auf eine Quelle
  quelle_typ: null,      // null | 'schulbuch' | 'eigenmaterial'
  operator: null,
  schwierigkeit: null,
  niveau: null,
  umfang: null,
  jahrgang: null,
  kapitel: null,
  uk_titel: null,
  inhaltstyp: null,      // null | 'aufgabe' | 'lehrtext' | 'hinweis'
  seite: null,
  sortCol: null,   // null | 'seite' | 'inhalt' | 'schwierigkeit'
  sortDir: 'asc',  // 'asc' | 'desc'
  suchtext: '',
  offset: 0,
};

function fachInfo(key) {
  return FAECHER.find(f => f.key === key) || FAECHER[0];
}

// ── Zentrale Filter-Reset-Funktion ────────────────────────────────
// Setzt alle Filter zurück — Navigation (view, fach) bleibt unberührt.
function resetFilters() {
  DB.quelle_name   = null;
  DB.quelle_typ    = null;
  DB.operator      = null;
  DB.schwierigkeit = null;
  DB.niveau        = null;
  DB.inhaltstyp    = null;
  DB.umfang        = null;
  DB.jahrgang      = null;
  DB.kapitel       = null;
  DB.uk_titel      = null;
  DB.seite         = null;
  DB.suchtext      = '';
  DB.sortCol       = null;
  DB.sortDir      = 'asc';
  DB.offset       = 0;
}

// ── Zentrale Autocomplete-Suggest-Funktionen ─────────────────────
function suggestBooks(fach) {
  return sbSelectAll('inhalte', { select: 'quelle_name', filters: fach ? { fach: fach } : {}, order: 'quelle_name' })
    .then(function(rows) {
      var seen = {}, books = [];
      rows.forEach(function(r) { if (r.quelle_name && !seen[r.quelle_name]) { seen[r.quelle_name] = true; books.push(r.quelle_name); } });
      return books.sort();
    });
}
function suggestKapitel(buch) {
  if (!buch) return Promise.resolve([]);
  return sbSelectAll('inhalte', { select: 'kapitel', filters: { quelle_name: buch } })
    .then(function(rows) {
      var seen = {}, kaps = [];
      rows.forEach(function(r) { if (r.kapitel && !seen[r.kapitel]) { seen[r.kapitel] = true; kaps.push(r.kapitel); } });
      return kaps.sort();
    });
}
function suggestUnterkapitel(buch, kapitel) {
  if (!buch) return Promise.resolve([]);
  var filters = { quelle_name: buch };
  if (kapitel) filters.kapitel = kapitel;
  return sbSelectAll('inhalte', { select: 'uk_titel', filters: filters })
    .then(function(rows) {
      var seen = {}, uks = [];
      rows.forEach(function(r) { if (r.uk_titel && !seen[r.uk_titel]) { seen[r.uk_titel] = true; uks.push(r.uk_titel); } });
      return uks.sort();
    });
}

// ── Chip ──────────────────────────────────────────────────────────
function mkChip(text, color, icon) {
  const c = tx('span', '', (icon ? icon + ' ' : '') + text);
  c.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:600;background:' + color + '18;color:' + color + ';border:1px solid ' + color + '38;white-space:nowrap;letter-spacing:.01em;';
  return c;
}

// ── Farb-Lookups ─────────────────────────────────────────────────
const OP_FARBEN   = { berechnen:'#2563eb', begruenden:'#7c3aed', erklaeren:'#0891b2', zeichnen:'#16a34a', messen:'#d97706', konstruieren:'#dc2626', beschreiben:'#4f46e5', vergleichen:'#db2777', ausfuellen:'#0d9488', MC:'#374151' };
const OP_FARBEN2  = { 'berechnen':'#2563eb', 'begründen':'#7c3aed', 'erklären':'#0891b2', 'zeichnen':'#16a34a', 'messen':'#d97706', 'konstruieren':'#dc2626', 'beschreiben':'#4f46e5', 'vergleichen':'#db2777', 'ausfüllen':'#0d9488', 'MC':'#374151' };
const SCHW_FARBEN = { 'grundlegend':'#16a34a', 'standard':'#2563eb', 'anspruchsvoll':'#b45309' };
const SCHW_ICONS  = { 'grundlegend':'○', 'standard':'◑', 'anspruchsvoll':'●' };
const SCHW_BG     = { 'grundlegend':'rgba(22,163,74,.05)', 'standard':'rgba(37,99,235,.05)', 'anspruchsvoll':'rgba(180,83,9,.05)' };
const NIVEAU_FARBEN = { 'leicht':'#0891b2', 'mittel':'#7c3aed', 'schwer':'#be123c' };
const NIVEAU_ICONS  = { 'leicht':'▽', 'mittel':'▾', 'schwer':'▼' };
const TYP_FARBEN  = { 'aufgabe':'#0f766e', 'lehrtext':'#2563eb',
                      'arbeitsblatt':'#0f766e', 'loesung':'#7c3aed', 'lehrerkommentar':'#92400e', 'lzk':'#b45309' };
const TYP_LABELS  = { 'aufgabe':'Aufgabe', 'lehrtext':'Lehrtext',
                      'arbeitsblatt':'Arbeitsblatt', 'loesung':'Lösung', 'lehrerkommentar':'Lehrerkommentar', 'lzk':'Lernzielkontrolle' };
const TYP_ICONS   = { 'aufgabe':'', 'lehrtext':'📖',
                      'arbeitsblatt':'📋', 'loesung':'✅', 'lehrerkommentar':'🧑‍🏫', 'lzk':'📝' };

function opColor(op) { return OP_FARBEN2[op] || '#64748b'; }
