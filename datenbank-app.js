// ── Material-Datenbank App ────────────────────────────────────────

// Shims damit methoden.js / didaktik.js ohne Änderung funktionieren
var METHDB     = [];
var DIDARTDB   = [];
var DIDAKTIKDB = {};
var SCHULBUCHDB = [];
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
  view: 'landing',    // 'landing' | 'fach'
  fach: null,
  buch: null,         // null | Buchtitel-String → Filter auf eine Quelle
  herkunft: null,     // null | 'schulbuch' | 'eigenmaterial'
  operator: null,
  schwierigkeit: null,
  niveau: null,
  umfang: null,
  jahrgang: null,
  kapitel: null,
  uk_titel: null,
  typ: null,        // null | 'aufgabe' | 'beispiel' | 'lehrtext'
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
  DB.buch         = null;
  DB.herkunft     = null;
  DB.operator     = null;
  DB.schwierigkeit = null;
  DB.niveau       = null;
  DB.typ          = null;
  DB.umfang       = null;
  DB.jahrgang     = null;
  DB.kapitel      = null;
  DB.uk_titel     = null;
  DB.seite        = null;
  DB.suchtext     = '';
  DB.sortCol      = null;
  DB.sortDir      = 'asc';
  DB.offset       = 0;
}

// ── Zentrale Autocomplete-Suggest-Funktionen ─────────────────────
// Immer aus aktuellem Inputwert lesen, nie aus altem Datensatz-State.
// kapitel/kapitel_titel werden konsistent per OR behandelt.
function suggestBooks(fach) {
  return sbSelect('inhalte', { select: 'buch', filters: fach ? { fach: fach } : {}, limit: 5000, order: 'buch' })
    .then(function(rows) {
      var seen = {}, books = [];
      rows.forEach(function(r) { if (r.buch && !seen[r.buch]) { seen[r.buch] = true; books.push(r.buch); } });
      return books.sort();
    });
}
function suggestKapitel(buch) {
  if (!buch) return Promise.resolve([]);
  return sbSelect('inhalte', { select: 'kapitel,kapitel_titel', filters: { buch: buch }, limit: 1000 })
    .then(function(rows) {
      var seen = {}, kaps = [];
      rows.forEach(function(r) { var k = r.kapitel || r.kapitel_titel; if (k && !seen[k]) { seen[k] = true; kaps.push(k); } });
      return kaps.sort();
    });
}
function suggestUnterkapitel(buch, kapitel) {
  if (!buch) return Promise.resolve([]);
  var raw = kapitel ? ['or=(kapitel.eq.' + encodeURIComponent(kapitel) + ',kapitel_titel.eq.' + encodeURIComponent(kapitel) + ')'] : [];
  return sbSelect('inhalte', { select: 'uk_titel', filters: { buch: buch }, rawParams: raw, limit: 500 })
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
const TYP_FARBEN  = { 'aufgabe':'#0f766e', 'beispiel':'#16a34a', 'lehrtext':'#2563eb' };
const TYP_LABELS  = { 'aufgabe':'Aufgabe', 'beispiel':'Beispiel', 'lehrtext':'Lehrtext' };
const TYP_ICONS   = { 'aufgabe':'', 'beispiel':'📐', 'lehrtext':'📖' };

function opColor(op) { return OP_FARBEN2[op] || '#64748b'; }

// ── Topbar ────────────────────────────────────────────────────────
function buildDBTopbar() {
  const bar = mk('div', 'topbar');
  bar.appendChild(buildAppNav('db'));
  const right = mk('div', 'topbar-right');
  if (DB_VERSION) {
    const d = new Date(DB_VERSION);
    const label = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })
      + ' ' + d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
    const indicator = DB_VERSION_STATUS === 'current' ? ' ✓' : DB_VERSION_STATUS === 'deploying' ? ' ⏳' : '';
    const vSpan = tx('span', 'topbar-version', label + indicator);
    vSpan.title = 'Klicken zum Neu laden'; vSpan.style.cursor = 'pointer';
    vSpan.onclick = function() { location.reload(true); };
    right.appendChild(vSpan);
  }
  bar.appendChild(right);
  return bar;
}

// ── Sidebar ───────────────────────────────────────────────────────
function buildDBSidebar(sb) {
  sb.innerHTML = '';

  const homeRow = mk('div', 'sb-item' + (DB.view === 'landing' ? ' active' : ''));
  const homeInner = mk('div', ''); homeInner.style.cssText = 'display:flex;gap:8px;align-items:center;';
  homeInner.appendChild(tx('span', '', '🏠'));
  homeInner.appendChild(tx('span', 'sb-item-label', 'Übersicht'));
  homeRow.appendChild(homeInner);
  homeRow.onclick = () => { DB.view = 'landing'; DB.fach = null; resetFilters(); dbRender(); };
  sb.appendChild(homeRow);

  const impRow = mk('div', 'sb-item' + (DB.view === 'import' ? ' active' : ''));
  const impInner = mk('div', ''); impInner.style.cssText = 'display:flex;gap:8px;align-items:center;';
  impInner.appendChild(tx('span', '', '⬆'));
  impInner.appendChild(tx('span', 'sb-item-label', 'Importieren'));
  impRow.appendChild(impInner);
  impRow.onclick = function() { DB.view = 'import'; dbRender(); };
  sb.appendChild(impRow);

  sb.appendChild(mk('div', 'sb-sep'));

  FAECHER.forEach(f => {
    const isActive = DB.view === 'fach' && DB.fach === f.key;
    const row = mk('div', 'sb-item' + (isActive ? ' active' : ''));
    const inner = mk('div', ''); inner.style.cssText = 'display:flex;gap:8px;align-items:center;flex:1;';
    inner.appendChild(tx('span', '', f.icon));
    inner.appendChild(tx('span', 'sb-item-label', f.label));
    row.appendChild(inner);
    row.onclick = () => { DB.view = 'fach'; DB.fach = f.key; resetFilters(); dbRender(); };
    sb.appendChild(row);
  });

  sb.appendChild(mk('div', 'sb-sep'));

  var methRow = mk('div', 'sb-item' + (DB.view === 'methoden' ? ' active' : ''));
  var methInner = mk('div', ''); methInner.style.cssText = 'display:flex;gap:8px;align-items:center;';
  methInner.appendChild(tx('span', '', '🛠️'));
  methInner.appendChild(tx('span', 'sb-item-label', 'Methoden'));
  methRow.appendChild(methInner);
  methRow.onclick = function() { DB.view = 'methoden'; DB.fach = null; dbRender(); };
  sb.appendChild(methRow);

  var didRow = mk('div', 'sb-item' + (DB.view === 'didaktik' ? ' active' : ''));
  var didInner = mk('div', ''); didInner.style.cssText = 'display:flex;gap:8px;align-items:center;';
  didInner.appendChild(tx('span', '', '🗺️'));
  didInner.appendChild(tx('span', 'sb-item-label', 'Didaktik'));
  didRow.appendChild(didInner);
  didRow.onclick = function() { DB.view = 'didaktik'; DB.fach = null; dbRender(); };
  sb.appendChild(didRow);

  const handle = mk('div', 'sb-resize-handle');
  sb.appendChild(handle);
  const savedW = localStorage.getItem('db_sb_width');
  if (savedW) sb.style.width = savedW + 'px';
  handle.addEventListener('mousedown', function(e) {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    var onMove = function(e) { sb.style.width = Math.min(380, Math.max(160, e.clientX)) + 'px'; };
    var onUp = function() {
      localStorage.setItem('db_sb_width', parseInt(sb.style.width));
      document.body.style.cursor = ''; document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ── Bücherregal-Helpers ───────────────────────────────────────────
const REGAL_FARBEN = {
  mathe:  { spine: ['#1e3a8a','#1d4ed8'], text: '#bfdbfe' },
  bio:    { spine: ['#14532d','#166534'], text: '#bbf7d0' },
  chemie: { spine: ['#7c2d12','#c2410c'], text: '#fed7aa' },
};
const TYP_SYMBOL = { schulbuch: '📚', sammlung: '📂', aufgabenpool: '🗃' };
const TYP_ORDER  = { schulbuch: 0, sammlung: 1, aufgabenpool: 2 };
// Herkunft (Quelle) – zentrale Definition für Modal, Badge, Filter, Import
const HERKUNFT = {
  schulbuch:     { label: 'Schulbuch',          icon: '📖', color: '#0f766e', hasBuch: true  },
  handreichung:  { label: 'Lehrerhandreichung', icon: '🧑‍🏫', color: '#0369a1', hasBuch: true  },
  aufgabenpool:  { label: 'Aufgabenpool',       icon: '🗃', color: '#7c3aed', hasBuch: true  },
  sammlung:      { label: 'Sammlung',           icon: '📋', color: '#b45309', hasBuch: true  },
  eigenmaterial: { label: 'Eigenmaterial',      icon: '📄', color: '#16a34a', hasBuch: false },
};
const HERKUNFT_OPTS = Object.keys(HERKUNFT).map(function(k) { return [k, HERKUNFT[k].icon + ' ' + HERKUNFT[k].label]; });
function herkunftMeta(h) { return HERKUNFT[h] || HERKUNFT.schulbuch; }
const SHELF_H = 155; // Regalhöhe (px)

function jgNorm(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

function countBuchAufgaben(buch) {
  return (buch.kapitel || []).reduce(function(n, k) {
    return n + (k.aufgaben || []).length +
      (k.unterkapitel || []).reduce(function(m, u) { return m + (u.aufgaben || []).length; }, 0);
  }, 0);
}

// Buchrücken generisch
function mkSpine(titel, breite, hoehe, grad, textColor, topIcon, bottomLabel, onclick, tooltip) {
  var el = mk('div', '');
  el.style.cssText = 'width:' + breite + 'px;height:' + hoehe + 'px;border-radius:2px 5px 5px 2px;cursor:pointer;position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s,filter .15s;background:' + grad + ';box-shadow:inset -2px 0 5px rgba(0,0,0,.45),inset 2px 0 3px rgba(255,255,255,.08),2px 2px 6px rgba(0,0,0,.5);overflow:hidden;';
  var deko = mk('div', '');
  deko.style.cssText = 'position:absolute;inset:0;background:repeating-linear-gradient(to bottom,transparent,transparent 16px,rgba(255,255,255,.04) 16px,rgba(255,255,255,.04) 17px);pointer-events:none;';
  el.appendChild(deko);
  var t = tx('div', '', titel);
  t.style.cssText = 'writing-mode:vertical-rl;transform:rotate(180deg);font-size:10px;font-weight:700;color:' + textColor + ';text-align:center;padding:5px 3px;line-height:1.25;max-height:' + (hoehe - 26) + 'px;overflow:hidden;z-index:1;';
  el.appendChild(t);
  if (topIcon) { var ic = tx('div', '', topIcon); ic.style.cssText = 'position:absolute;top:4px;font-size:11px;z-index:1;'; el.appendChild(ic); }
  if (bottomLabel) { var bl = tx('div', '', bottomLabel); bl.style.cssText = 'position:absolute;bottom:3px;font-size:8px;color:' + textColor + ';opacity:.6;z-index:1;'; el.appendChild(bl); }
  el.onmouseenter = function() { el.style.transform = 'translateY(-10px)'; el.style.filter = 'brightness(1.25)'; };
  el.onmouseleave = function() { el.style.transform = ''; el.style.filter = ''; };
  if (tooltip) el.title = tooltip;
  el.onclick = onclick;
  return el;
}

// Regalzeile: [Pille links] + [Bücherfläche + Brett rechts]
function mkRegalRow(pillCfg, booksFn, hasSep) {
  var row = mk('div', '');
  row.style.cssText = 'display:flex;align-items:stretch;' + (hasSep ? 'border-bottom:1px solid rgba(255,255,255,.05);' : '');

  var pill = mk('div', '');
  pill.style.cssText = 'width:84px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;cursor:pointer;padding:10px 6px;border-right:1px solid rgba(255,255,255,.07);background:' + pillCfg.color + '12;transition:background .15s;';
  pill.onmouseenter = function() { pill.style.background = pillCfg.color + '22'; };
  pill.onmouseleave = function() { pill.style.background = pillCfg.color + '12'; };
  pill.onclick = pillCfg.onclick;
  var pillIco = tx('div', '', pillCfg.icon); pillIco.style.fontSize = '20px';
  var pillLbl = tx('div', '', pillCfg.label);
  pillLbl.style.cssText = 'font-size:10px;font-weight:800;color:' + pillCfg.color + ';text-align:center;letter-spacing:.04em;text-transform:uppercase;line-height:1.2;';
  pill.appendChild(pillIco); pill.appendChild(pillLbl);
  if (pillCfg.sub) { var ps = tx('div', '', pillCfg.sub); ps.style.cssText = 'font-size:9px;color:rgba(255,255,255,.3);text-align:center;'; pill.appendChild(ps); }
  row.appendChild(pill);

  var shelfWrap = mk('div', ''); shelfWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;min-width:0;';
  var area = mk('div', '');
  area.style.cssText = 'flex:1;display:flex;align-items:flex-end;gap:2px;padding:8px 10px 0;background:linear-gradient(to bottom,#1a1a1f,#0a0a0e);height:' + SHELF_H + 'px;position:relative;overflow:hidden;';
  var shadow = mk('div', '');
  shadow.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:20px;background:linear-gradient(to top,rgba(0,0,0,.6),transparent);pointer-events:none;z-index:2;';
  area.appendChild(shadow);
  booksFn(area);
  shelfWrap.appendChild(area);
  var brett = mk('div', '');
  brett.style.cssText = 'height:13px;background:linear-gradient(to bottom,#6b2f3e,#4a1f2c);border-top:1px solid rgba(255,255,255,.12);box-shadow:0 3px 8px rgba(0,0,0,.5);';
  shelfWrap.appendChild(brett);
  row.appendChild(shelfWrap);
  return row;
}

function buildBuecherregal(container) {
  var fachOrder = FAECHER.map(function(f) { return f.key; });
  var byFach = {};
  SCHULBUCHDB.forEach(function(b) {
    var f = b.fach || 'sonstige';
    if (!byFach[f]) byFach[f] = [];
    byFach[f].push(b);
  });
  var faecher = fachOrder.filter(function(f) { return byFach[f] && byFach[f].length; });
  var hasExtra = METHDB.length > 0 || DIDARTDB.length > 0;
  if (!faecher.length && !hasExtra) return;

  var wand = mk('div', '');
  wand.style.cssText = 'background:#0f0f12;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.4);margin:0 28px 28px;';
  container.appendChild(wand);

  // ── Fach-Zeilen ───────────────────────────────────────────────
  faecher.forEach(function(fach, idx) {
    var farbe  = REGAL_FARBEN[fach] || { spine: ['#374151','#6b7280'], text: '#f3f4f6' };
    var fInfo  = fachInfo(fach);
    var buecher = (byFach[fach] || []).slice().sort(function(a, b) { return (TYP_ORDER[a.typ] || 1) - (TYP_ORDER[b.typ] || 1); });

    var pill = { icon: fInfo.icon, label: fInfo.label, color: fInfo.color,
      onclick: function() { DB.view = 'fach'; DB.fach = fach; DB.buch = null; DB.herkunft = null; DB.suchtext = ''; DB.offset = 0; dbRender(); } };

    var row = mkRegalRow(pill, function(area) {
      var wt = tx('div', '', fInfo.label.toUpperCase());
      wt.style.cssText = 'position:absolute;bottom:5px;left:50%;transform:translateX(-50%);font-size:44px;font-weight:900;letter-spacing:.14em;color:' + farbe.spine[1] + ';opacity:.13;white-space:nowrap;pointer-events:none;user-select:none;';
      area.appendChild(wt);
      buecher.forEach(function(buch) {
        var kap  = Math.max(1, (buch.kapitel || []).length);
        var aufg = countBuchAufgaben(buch);
        var w    = Math.min(60, Math.max(28, 24 + kap * 3));
        var h    = Math.min(SHELF_H - 16, Math.max(85, 80 + kap * 3));
        var jgA  = jgNorm(buch.jahrgang);
        area.appendChild(mkSpine(
          buch.titel || '–', w, h,
          'linear-gradient(to right,' + farbe.spine[0] + ',' + farbe.spine[1] + ')',
          farbe.text, TYP_SYMBOL[buch.typ] || '📖',
          jgA.length ? 'Jg.' + jgA.join('/') : null,
          function() { DB.view = 'fach'; DB.fach = buch.fach || fach; DB.buch = buch.titel; DB.herkunft = 'schulbuch'; DB.suchtext = ''; DB.offset = 0; dbRender(); },
          buch.titel + (buch.verlag ? ' · ' + buch.verlag : '') + '\n' + kap + ' Kapitel · ' + aufg + ' Aufg.'
        ));
      });
    }, idx < faecher.length - 1 || hasExtra);

    wand.appendChild(row);
  });

  // ── Methoden + Didaktik nebeneinander ─────────────────────────
  if (hasExtra) {
    var extraRow = mk('div', ''); extraRow.style.cssText = 'display:flex;align-items:stretch;';
    var defs = [
      { key:'methoden', icon:'🛠️', label:'Methoden', color:'#7c3aed', spine:['#3b0764','#6d28d9'], text:'#e9d5ff',
        items: METHDB,   getT: function(m) { return m.name || m.titel || '–'; } },
      { key:'didaktik', icon:'🗺️', label:'Didaktik', color:'#0891b2', spine:['#0c4a6e','#0369a1'], text:'#bae6fd',
        items: DIDARTDB, getT: function(d) { return d.titel || d.name || '–'; } },
    ];
    defs.forEach(function(t, ti) {
      var half = mk('div', '');
      half.style.cssText = 'flex:1;display:flex;flex-direction:column;min-width:0;' + (ti === 0 ? 'border-right:1px solid rgba(255,255,255,.05);' : '');
      var pill2 = { icon: t.icon, label: t.label, color: t.color,
        sub: t.items.length + ' Eintr.',
        onclick: function() { DB.view = t.key; DB.fach = null; dbRender(); } };
      var innerRow = mkRegalRow(pill2, function(area) {
        var wt2 = tx('div', '', t.label.toUpperCase());
        wt2.style.cssText = 'position:absolute;bottom:5px;left:50%;transform:translateX(-50%);font-size:32px;font-weight:900;letter-spacing:.14em;color:' + t.spine[1] + ';opacity:.13;white-space:nowrap;pointer-events:none;user-select:none;';
        area.appendChild(wt2);
        t.items.slice(0, 22).forEach(function(item) {
          var titel = t.getT(item);
          area.appendChild(mkSpine(
            titel, 26, Math.min(SHELF_H - 16, 100),
            'linear-gradient(to right,' + t.spine[0] + ',' + t.spine[1] + ')',
            t.text, null, null,
            function() { DB.view = t.key; DB.fach = null; dbRender(); },
            titel
          ));
        });
        if (!t.items.length) {
          var emp = tx('div', '', 'Noch keine Einträge');
          emp.style.cssText = 'position:absolute;bottom:20px;left:50%;transform:translateX(-50%);font-size:11px;color:rgba(255,255,255,.2);white-space:nowrap;';
          area.appendChild(emp);
        }
      }, false);
      half.appendChild(innerRow);
      extraRow.appendChild(half);
    });
    wand.appendChild(extraRow);
  }
}

// ── Landing Page ──────────────────────────────────────────────────
function buildLanding(container) {
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Material-Datenbank'));
  left.appendChild(tx('div', 'c-sub', 'Schulbücher, Arbeitsblätter und eigene Materialien'));
  hdr.appendChild(left);
  const hRight = mk('div', '');
  const impBtn = btn('⬆ Material importieren', 'btn btn-pri btn-sm');
  impBtn.onclick = function() { DB.view = 'import'; dbRender(); };
  hRight.appendChild(impBtn);
  hdr.appendChild(hRight);
  container.appendChild(hdr);

  // Bücherregal — zeigt alle Quellen auf einen Blick
  buildBuecherregal(container);
}

// ── Nr-Parsing für natürliche Sortierung ─────────────────────────
// Gibt [zahl, buchstaben] zurück, versteht alle Formate:
//   "8a"  → [8,  "a"]    "10bc" → [10, "bc"]
//   "8"   → [8,  ""]     "a"    → [0,  "a"]   (Teilaufgabe ohne Elternnummer)
//   "B1"  → [1,  "b"]    "B"    → [0,  "b"]   (Beispiel-Nummerierung)
function parseNr(s) {
  s = String(s || '').trim().toLowerCase();
  var m;
  m = s.match(/^(\d+)([a-z]*)$/);   if (m) return [parseInt(m[1], 10), m[2]];
  m = s.match(/^([a-z]+)(\d+)$/);   if (m) return [parseInt(m[2], 10), m[1]];
  m = s.match(/^([a-z]+)$/);        if (m) return [0, m[1]];
  return [0, s];
}

function cmpNr(aNr, bNr) {
  var pa = parseNr(aNr), pb = parseNr(bNr);
  var nd = pa[0] - pb[0];
  if (nd !== 0) return nd;
  return pa[1] < pb[1] ? -1 : pa[1] > pb[1] ? 1 : 0;
}

// ── Aufgaben-Gruppierung ──────────────────────────────────────────
// Gruppiert Zeilen nach führender Nummer: "8a","8b" → Gruppe "8"; "9" → Gruppe "9"
function dbGroupByParent(rows) {
  var groups = {}, order = [];
  rows.forEach(function(r) {
    var parentNr = String(r.nr || '').replace(/[a-zA-Z]+$/, '').trim() || String(r.nr || '?');
    // gruppen_key aus DB bevorzugen, Fallback auf Frontend-Berechnung
    var key = r.gruppen_key || ((r.buch || '') + '|' + (r.seite != null ? r.seite : '') + '|' + parentNr);
    if (!groups[key]) { groups[key] = { key: parentNr, gruppen_key: key, aufgabenstellung: null, items: [] }; order.push(key); }
    if (!groups[key].aufgabenstellung && r.aufgabenstellung) groups[key].aufgabenstellung = r.aufgabenstellung;
    groups[key].items.push(r);
  });
  return order.map(function(k) { return groups[k]; });
}

// ── Import-View ───────────────────────────────────────────────────

const IMP_KI_PROMPT = `Du analysierst eine Seite aus einem Schulbuch oder Unterrichtsmaterial (Gymnasium, Mathematik oder Naturwissenschaften).

Erfasse ALLE Inhalte der Seite: Aufgaben, Beispiele UND Lehrtexte.

VERBATIM-REGEL (gilt für ALLE Typen):
Gib jeden Text EXAKT so wieder, wie er im Buch steht — Wort für Wort, Zeichen für Zeichen. Kürze NICHTS, lasse NICHTS weg, formuliere NICHTS um. Auch kurze Sätze, Einschübe oder Fußnoten müssen vollständig erfasst werden.

WICHTIG — Aufgaben: Teilaufgaben immer einzeln erfassen:
Hat eine Aufgabe Teilaufgaben (a, b, c, d …) — egal ob als Absätze ODER als Spalten in einer Tabelle — erstelle für jede Teilaufgabe einen eigenen Eintrag mit nr "8a", "8b" usw. Nie eine Aufgabe mit Teilaufgaben als einzelnen Eintrag erfassen.

WICHTIG — Lehrtexte: Absätze als separate Einträge erfassen:
Hat ein Lehrtext mehrere klar getrennte Abschnitte (z.B. Einführung + Definition + Merksatz), erstelle für jeden Abschnitt einen eigenen Eintrag. Zusammengehörende Sätze desselben Abschnitts bleiben in einem Eintrag.

Für jeden Eintrag:
- typ: genau eines von: aufgabe|beispiel|lehrtext
  · aufgabe = Übungsaufgabe, die Schüler selbst lösen sollen
  · beispiel = Musteraufgabe oder Musterrechnung mit vorgegebener Lösung
  · lehrtext = Erklärung, Definition, Merksatz, Fließtext, Einführung
- nr: Aufgaben-/Beispielnummer inkl. Teilaufgabe (z.B. "8a", "B2") — bei Lehrtexten die Überschrift oder Typ (z.B. "Definition", "Merksatz", "1.1 Terme")
- aufgabenstellung: gemeinsamer Obersatz der Hauptaufgabe, VERBATIM — nur wenn er für alle Teilaufgaben gilt; bei Lehrtexten und Beispielen null
- text: der vollständige Text des Eintrags, VERBATIM und VOLLSTÄNDIG aus dem Buch. Zeilenumbrüche innerhalb des Textes durch " | " ersetzen. Bei Aufgaben NIEMALS aufgabenstellung wiederholen.
- anforderung: Ein Satz was Schüler konkret tun müssen — bei Lehrtexten null
- operator: genau eines von: berechnen|begründen|erklären|zeichnen|messen|konstruieren|beschreiben|vergleichen|ausfüllen|MC — bei Lehrtexten/Beispielen null
- umfang: genau eines von: kurz|mittel|lang — bei Lehrtexten null
- schwierigkeit: genau eines von: grundlegend|standard|anspruchsvoll — bei Lehrtexten null

JSON-FORMAT — sehr wichtig:
- Antworte AUSSCHLIESSLICH mit rohem JSON, kein Markdown, keine Codeblöcke
- Alle Stringwerte einzeilig (keine Zeilenumbrüche — stattdessen " | " verwenden)
- Keine Anführungszeichen innerhalb von Stringwerten
- Keine LaTeX-Notation (schreibe z.B. "x^2" statt "\frac{x}{2}")
- Keine Backslashes in Stringwerten

{"aufgaben": [
  {"typ":"lehrtext","nr":"Merksatz","aufgabenstellung":null,"text":"Der Flächeninhalt eines Rechtecks mit den Seiten a und b berechnet sich mit der Formel A = a · b. | Die Einheit des Flächeninhalts ist cm², m² oder mm².","anforderung":null,"operator":null,"umfang":null,"schwierigkeit":null},
  {"typ":"beispiel","nr":"B1","aufgabenstellung":null,"text":"Berechne den Flächeninhalt des Rechtecks mit a = 6 cm und b = 4 cm. | Lösung: A = a · b = 6 cm · 4 cm = 24 cm²","anforderung":null,"operator":null,"umfang":null,"schwierigkeit":null},
  {"typ":"aufgabe","nr":"8a","aufgabenstellung":"Berechne den Flächeninhalt der Figuren.","text":"Berechne den Flächeninhalt der Fig. 1.","anforderung":"Schüler berechnen den Flächeninhalt einer Figur.","operator":"berechnen","umfang":"kurz","schwierigkeit":"grundlegend"},
  {"typ":"aufgabe","nr":"8b","aufgabenstellung":"Berechne den Flächeninhalt der Figuren.","text":"Schätze den Flächeninhalt der Fig. 2. Bestimme den Flächeninhalt in mm2, indem du die benötigten Längen misst.","anforderung":"Schüler schätzen und messen den Flächeninhalt einer Figur.","operator":"messen","umfang":"mittel","schwierigkeit":"standard"}
]}`;

function _impResizeImg(dataUrl, maxW, q) {
  return new Promise(function(res, rej) {
    var img = new Image();
    img.onload = function() {
      var scale = img.width > maxW ? maxW / img.width : 1;
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = rej; img.src = dataUrl;
  });
}

function buildImportView(container) {
  // ── Header ────────────────────────────────────────────────────
  var hdr = mk('div', 'c-hdr');
  var hLeft = mk('div', '');
  var backBtn = btn('← Übersicht', 'btn btn-ghost btn-sm');
  backBtn.onclick = function() { DB.view = 'landing'; dbRender(); };
  hLeft.appendChild(backBtn);
  hLeft.appendChild(tx('div', 'c-title', 'Material importieren'));
  hdr.appendChild(hLeft);
  container.appendChild(hdr);

  var wrap = mk('div', '');
  wrap.style.cssText = 'padding:0 28px 40px;max-width:860px;display:flex;flex-direction:column;gap:20px;';
  container.appendChild(wrap);

  // ── Hilfsfunktionen ───────────────────────────────────────────
  function row2() {
    var r = mk('div', ''); r.style.cssText = 'display:flex;gap:10px;';
    Array.from(arguments).forEach(function(e) { r.appendChild(e); }); return r;
  }
  function fg(label, el) {
    var g = mk('div', 'fg'); g.style.flex = '1';
    g.appendChild(tx('label', 'fl', label)); g.appendChild(el); return g;
  }
  function finp(ph, type) {
    var i = document.createElement('input'); i.className = 'finp';
    i.placeholder = ph; if (type) i.type = type; return i;
  }
  function fsel(opts) {
    var s = document.createElement('select'); s.className = 'finp';
    opts.forEach(function(o) {
      var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; s.appendChild(op);
    }); return s;
  }

  // ── Metadaten-Karte ───────────────────────────────────────────
  var metaCard = mk('div', '');
  metaCard.style.cssText = 'background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:12px;';
  var metaTitle = tx('div', '', 'Quelle');
  metaTitle.style.cssText = 'font-weight:600;font-size:13px;color:var(--tx2);';
  metaCard.appendChild(metaTitle);
  wrap.appendChild(metaCard);

  var buchInp = finp('z.B. Lambacher Schweizer 8');
  attachAutocomplete(buchInp, function() { return suggestBooks(); });
  var typSel  = fsel(HERKUNFT_OPTS);
  var fachSel = fsel(FAECHER.map(function(f) { return [f.key, f.icon + ' ' + f.label]; }));
  var jgInp   = finp('z.B. 8'); jgInp.style.maxWidth = '80px';
  var kapInp   = finp('z.B. IV Flächen (optional)');
  var ukInp    = finp('z.B. Flächeninhalt berechnen (optional)');
  var seiteInp = finp('z.B. 142', 'number'); seiteInp.style.maxWidth = '110px';

  metaCard.appendChild(row2(fg('Buchtitel / Quelle', buchInp), fg('Typ', typSel)));
  metaCard.appendChild(row2(fg('Fach', fachSel), fg('Jahrgang', jgInp)));
  metaCard.appendChild(row2(fg('Kapitel', kapInp), fg('Unterkapitel', ukInp), fg('Erste Seite', seiteInp)));

  // Autocomplete für Kapitel und Unterkapitel (abhängig vom eingetragenen Buch)
  attachAutocomplete(kapInp, function() { return suggestKapitel(buchInp.value.trim()); });
  attachAutocomplete(ukInp,  function() { return suggestUnterkapitel(buchInp.value.trim(), kapInp.value.trim()); });

  // ── Datei-Upload ──────────────────────────────────────────────
  var fileCard = mk('div', '');
  fileCard.style.cssText = 'background:var(--card);border:2px dashed var(--border);border-radius:12px;padding:36px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s;';
  wrap.appendChild(fileCard);
  var fileLabel = tx('div', '', '📄 PDF oder Bild hierher ziehen — oder klicken zum Auswählen');
  fileLabel.style.cssText = 'font-size:14px;color:var(--tx2);';
  fileCard.appendChild(fileLabel);
  var fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = '.pdf,image/*'; fileInput.style.display = 'none';
  fileCard.appendChild(fileInput);

  var _file = null;
  fileCard.onclick = function() { fileInput.click(); };
  fileCard.ondragover = function(e) { e.preventDefault(); fileCard.style.borderColor = 'var(--acc)'; };
  fileCard.ondragleave = function() { fileCard.style.borderColor = ''; };
  fileCard.ondrop = function(e) {
    e.preventDefault(); fileCard.style.borderColor = '';
    var f = e.dataTransfer.files[0]; if (f) setFile(f);
  };
  fileInput.onchange = function() { if (fileInput.files[0]) setFile(fileInput.files[0]); };
  function setFile(f) {
    _file = f;
    fileLabel.textContent = '✓ ' + f.name;
    fileLabel.style.color = 'var(--acc)';
  }

  // ── Analyse-Button + Status ───────────────────────────────────
  var bottomRow = mk('div', ''); bottomRow.style.cssText = 'display:flex;align-items:center;gap:14px;';
  var analyseBtn = btn('⚡ Seite analysieren', 'btn btn-pri');
  var statusEl = tx('div', '', ''); statusEl.style.cssText = 'font-size:13px;color:var(--tx2);';
  bottomRow.appendChild(analyseBtn);
  bottomRow.appendChild(statusEl);
  wrap.appendChild(bottomRow);

  // ── Ergebnis-Bereich ──────────────────────────────────────────
  var resultsWrap = mk('div', '');
  resultsWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
  wrap.appendChild(resultsWrap);

  var _aufgaben = [];

  // ── KI-Analyse ────────────────────────────────────────────────
  analyseBtn.onclick = async function() {
    if (!_file) { statusEl.textContent = '⚠️ Bitte zuerst eine Datei auswählen.'; return; }
    if (!buchInp.value.trim()) { statusEl.textContent = '⚠️ Bitte Buchtitel eingeben.'; return; }
    analyseBtn.disabled = true; analyseBtn.textContent = '⏳ Analysiere…';
    statusEl.textContent = ''; statusEl.style.color = 'var(--tx2)';
    resultsWrap.innerHTML = ''; _aufgaben = [];
    try {
      statusEl.textContent = '⏳ Datei wird gelesen…';
      var imgs = await fileToDataURLs(_file, { longEdge: 1568, quality: 0.88 });
      statusEl.textContent = '⏳ KI analysiert ' + imgs.length + ' Seite(n)…';
      var resized = await Promise.all(imgs.map(function(u) { return _impResizeImg(u, 1200, 0.82); }));
      var blocks = [];
      resized.forEach(function(r, i) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: r.split(',')[1] } });
        if (i < resized.length - 1) blocks.push({ type: 'text', text: '--- Nächste Seite ---' });
      });
      blocks.push({ type: 'text', text: IMP_KI_PROMPT });
      var raw = await callKI(blocks, { maxTokens: 16000 });
      // Markdown-Codeblock ``` entfernen falls vorhanden
      var cleaned = raw.trim().replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
      // Literal-Newlines/Tabs innerhalb von JSON-Strings escapen
      cleaned = cleaned.replace(/"((?:[^"\\]|\\.)*)"/g, function(m, inner) {
        return '"' + inner.replace(/\n/g, '\\n').replace(/\r/g, '').replace(/\t/g, '\\t') + '"';
      });
      // Doppeltes Anführungszeichen am Stringende (KI-Fehler: "text"" → "text")
      cleaned = cleaned.replace(/"",/g, '",')
                       .replace(/""\s*\n\s*"/g, '",\n  "')
                       .replace(/""\s*}/g, '"}')
                       .replace(/""\s*]/g, '"]');
      // Ungültige Backslashes escapen (z.B. LaTeX \frac, \cdot → \\frac, \\cdot)
      cleaned = cleaned.replace(/\\(?!["\\/bfnrtu0-9])/g, '\\\\');
      var parsed;
      try { parsed = robustJsonParsePr(cleaned); } catch(e) {
        try { parsed = JSON.parse(cleaned); } catch(e2) {
          var pos = parseInt((e2.message.match(/position (\d+)/i) || [])[1]) || 0;
          console.error('[Import] Parse-Fehler:', e2.message);
          console.error('[Import] Zeichen an Pos ' + pos + ':', JSON.stringify(cleaned.slice(Math.max(0,pos-40), pos+40)));
          throw new Error('KI-Antwort nicht lesbar — Zeichen an Pos ' + pos + ': ' + JSON.stringify(cleaned.slice(Math.max(0,pos-20), pos+20)));
        }
      }
      var aufg = parsed.aufgaben || [];
      if (!aufg.length) { statusEl.textContent = '⚠️ Keine Einträge erkannt — bitte Bild prüfen.'; return; }
      _aufgaben = aufg;
      statusEl.textContent = '';
      renderResults();
    } catch(e) {
      statusEl.textContent = '❌ ' + e.message;
    } finally {
      analyseBtn.disabled = false; analyseBtn.textContent = '⚡ Seite analysieren';
    }
  };

  // ── Ergebnis rendern ──────────────────────────────────────────
  function miniSel(opts, current, onChange) {
    var s = document.createElement('select'); s.className = 'finp';
    s.style.cssText = 'font-size:12px;padding:2px 8px;height:auto;width:auto;';
    opts.forEach(function(o) {
      var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1];
      if (current === o[0]) op.selected = true;
      s.appendChild(op);
    });
    s.onchange = function() { onChange(s.value); };
    return s;
  }

  var TYP_CYCLE = ['aufgabe', 'beispiel', 'lehrtext'];

  function buildAufgabeCard(a, indent) {
    var aufgText = (indent ? a.text : [a.aufgabenstellung, a.text].filter(Boolean).join(' ')) || '';
    var row = mk('div', '');
    row.style.cssText = 'display:flex;align-items:baseline;gap:8px;padding:1px 0 1px '
      + (indent ? '20px' : '4px') + ';';

    var nrLabel = tx('span', '', (a.nr || '?'));
    nrLabel.style.cssText = 'font-weight:700;font-size:12px;color:var(--tx2);flex-shrink:0;min-width:32px;';
    row.appendChild(nrLabel);

    if (aufgText) {
      var txt = tx('span', '', aufgText.slice(0, 120) + (aufgText.length > 120 ? '…' : ''));
      txt.style.cssText = 'font-size:12px;color:var(--tx1);line-height:1.4;';
      row.appendChild(txt);
    }
    return row;
  }

  // Typ-Badge für Gruppe: zeigt aktuellen Typ, Klick → nächster Typ
  function mkTypBadge(groupItems, onUpdate) {
    var cur = groupItems[0].typ || 'aufgabe';
    var badge = document.createElement('span');
    function render() {
      var c = TYP_FARBEN[cur] || '#64748b';
      badge.textContent = (TYP_ICONS[cur] ? TYP_ICONS[cur] + ' ' : '') + (TYP_LABELS[cur] || cur);
      badge.style.cssText = 'display:inline-block;font-size:10px;font-weight:700;padding:2px 9px;'
        + 'border-radius:20px;cursor:pointer;user-select:none;'
        + 'background:' + c + '18;color:' + c + ';border:1px solid ' + c + '38;'
        + 'text-transform:uppercase;letter-spacing:.06em;';
      badge.title = 'Typ ändern (klicken)';
    }
    render();
    badge.onclick = function(e) {
      e.stopPropagation();
      var idx = TYP_CYCLE.indexOf(cur);
      cur = TYP_CYCLE[(idx + 1) % TYP_CYCLE.length];
      groupItems.forEach(function(item) { item.typ = cur; });
      render();
      if (onUpdate) onUpdate(cur);
    };
    return badge;
  }

  function renderResults() {
    resultsWrap.innerHTML = '';
    var rHdr = mk('div', '');
    rHdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 0;';
    var rTitle = tx('div', '', _aufgaben.length + ' Einträge erkannt — bitte prüfen und speichern');
    rTitle.style.cssText = 'font-weight:600;font-size:14px;';
    rHdr.appendChild(rTitle);
    var saveAllBtn = btn('✓ Alle ' + _aufgaben.length + ' speichern', 'btn btn-pri btn-sm');
    saveAllBtn.onclick = saveAll;
    rHdr.appendChild(saveAllBtn);
    resultsWrap.appendChild(rHdr);

    var groups = dbGroupByParent(_aufgaben);
    groups.forEach(function(g) {
      var hasSubtasks = g.items.length > 1 || (g.items.length === 1 && g.items[0].nr !== g.key);
      var groupWrap = mk('div', '');
      groupWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;padding:4px 0;';

      // Gruppenheader mit klickbarem Typ-Badge
      var groupHdr = mk('div', '');
      groupHdr.style.cssText = 'display:flex;align-items:center;gap:7px;padding:4px 4px 2px;';
      var typBadge = mkTypBadge(g.items, function(newTyp) {
        // Gruppenheader-Text ggf. aktualisieren — kein re-render nötig
      });
      groupHdr.appendChild(typBadge);
      var hdrText = tx('span', '', g.key + (g.aufgabenstellung ? ' · ' + g.aufgabenstellung.slice(0, 80) : ''));
      hdrText.style.cssText = 'font-weight:700;font-size:12px;color:var(--tx2);letter-spacing:.02em;';
      groupHdr.appendChild(hdrText);
      groupWrap.appendChild(groupHdr);

      g.items.forEach(function(a) {
        groupWrap.appendChild(buildAufgabeCard(a, hasSubtasks));
      });

      resultsWrap.appendChild(groupWrap);
    });
  }

  // ── Speichern ─────────────────────────────────────────────────
  async function saveAll() {
    var buch     = buchInp.value.trim();
    var fach     = fachSel.value;
    var jg       = jgInp.value.trim() || null;
    var kap      = kapInp.value.trim() || null;
    var uk       = ukInp.value.trim() || null;
    var seite    = seiteInp.value ? Number(seiteInp.value) : null;
    // typSel-Wert direkt als Herkunft speichern (schulbuch/aufgabenpool/sammlung/eigenmaterial)
    var herkunft = HERKUNFT[typSel.value] ? typSel.value : 'schulbuch';
    var ts       = Date.now();

    var rows = _aufgaben.map(function(a, i) {
      var nr   = String(a.nr || (i + 1));
      var nrBase = nr.replace(/[a-zA-Z]+$/, '').trim() || nr;
      var gKey = buch && seite != null ? buch + '||' + seite + '||' + nrBase : 'db_' + ts + '_' + nrBase;
      return {
        id:           'db_' + ts + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
        fach:         fach,
        herkunft:     herkunft,
        buch:         buch || null,
        kapitel:      kap,
        uk_titel:     uk,
        seite:        seite,
        nr:           nr,
        gruppen_key:  gKey,
        aufgabenstellung: a.aufgabenstellung || null,
        inhalt:       a.text || a.aufgabenstellung || null,
        anforderung:  a.anforderung || null,
        operator:     a.operator || null,
        schwierigkeit: a.schwierigkeit || a.schwierigkeitsstufe || null,
        umfang:       a.umfang || null,
        jahrgang:     jg,
        typ:          a.typ || 'aufgabe',
      };
    });

    var saveBtn = resultsWrap.querySelector('.btn-pri');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Speichert…'; }
    statusEl.style.color = 'var(--tx2)';

    try {
      await sbInsert('inhalte', rows);
      _buchCache = {}; // Cache leeren damit neues Buch im Filter erscheint
      _aufgaben = [];

      // ── Ende-Screen ───────────────────────────────────────────
      wrap.innerHTML = '';
      var done = mk('div', '');
      done.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:28px;padding:60px 20px;text-align:center;';

      var check = tx('div', '', '✓');
      check.style.cssText = 'font-size:48px;color:#16a34a;line-height:1;';
      done.appendChild(check);

      var msg = tx('div', '', rows.length + ' Aufgaben gespeichert');
      msg.style.cssText = 'font-size:22px;font-weight:700;color:var(--tx1);';
      done.appendChild(msg);

      var sub = tx('div', '', buch + (seite ? ' · Seite ' + seite : ''));
      sub.style.cssText = 'font-size:14px;color:var(--tx2);margin-top:-16px;';
      done.appendChild(sub);

      var actions = mk('div', '');
      actions.style.cssText = 'display:flex;flex-direction:column;gap:10px;width:100%;max-width:360px;';

      function actionBtn(label, desc, onclick) {
        var b = mk('div', '');
        b.style.cssText = 'background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 18px;cursor:pointer;text-align:left;transition:background .15s;';
        b.onmouseenter = function() { b.style.background = 'var(--hover,#f1f5f9)'; };
        b.onmouseleave = function() { b.style.background = 'var(--card)'; };
        b.appendChild(tx('div', '', label)).style.cssText = 'font-weight:600;font-size:14px;';
        b.appendChild(tx('div', '', desc)).style.cssText = 'font-size:12px;color:var(--tx2);margin-top:2px;';
        b.onclick = onclick;
        return b;
      }

      actions.appendChild(actionBtn(
        '↑ Nächste Seite hochladen',
        'Gleiche Quelle · Seite ' + (seite ? seite + 1 : '?'),
        function() {
          seiteInp.value = seite ? seite + 1 : '';
          fileLabel.textContent = '📄 PDF oder Bild hierher ziehen — oder klicken zum Auswählen';
          fileLabel.style.color = 'var(--tx2)';
          _file = null;
          statusEl.textContent = ''; statusEl.style.color = 'var(--tx2)';
          wrap.innerHTML = '';
          // Formular-Elemente wieder einbauen
          wrap.appendChild(metaCard);
          wrap.appendChild(fileCard);
          wrap.appendChild(bottomRow);
          wrap.appendChild(resultsWrap);
        }
      ));

      actions.appendChild(actionBtn(
        '→ Gespeicherte Einträge ansehen',
        fachInfo(fach).icon + ' ' + fachInfo(fach).label + ' · ' + buch,
        function() {
          DB.view = 'fach'; DB.fach = fach; DB.buch = buch || null;
          DB.herkunft = 'schulbuch'; DB.suchtext = ''; DB.offset = 0;
          dbRender();
        }
      ));

      actions.appendChild(actionBtn(
        '✕ Neues Material importieren',
        'Andere Quelle, anderes Fach',
        function() { DB.view = 'import'; dbRender(); }
      ));

      done.appendChild(actions);
      wrap.appendChild(done);

    } catch(e) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✓ Alle ' + rows.length + ' speichern'; }
      statusEl.textContent = '❌ Speichern fehlgeschlagen: ' + e.message;
      statusEl.style.color = '#dc2626';
    }
  }
}

// Gibt den typgerechten Label für eine Gruppe zurück, z.B. "Lehrtext 3"
function grpTypLabel(g) {
  var typ = g && g.items && g.items[0] && g.items[0].typ;
  return (TYP_LABELS[typ] || 'Aufgabe') + ' ' + (g ? g.key : '');
}

// ── Autocomplete-Dropdown für Eingabefelder ───────────────────────
// Hängt ein Custom-Dropdown an ein <input>-Element.
// fetchFn() → Promise<string[]>  (wird beim ersten Öffnen einmal aufgerufen)
function attachAutocomplete(inp, fetchFn) {
  var dropdown = null;
  var _timer   = null;
  var _fetchId = 0;
  var _active  = false; // zuverlässiger als document.activeElement

  function reposition() {
    if (!dropdown) return;
    var r = inp.getBoundingClientRect();
    // Sicherheit: falls Input noch nicht gerendert oder nicht sichtbar
    if (!r.width && !r.height) return;
    dropdown.style.left  = r.left + 'px';
    dropdown.style.top   = (r.bottom + 2) + 'px';
    dropdown.style.width = Math.max(r.width, 180) + 'px';
  }

  function showDropdown(allOpts, filter) {
    removeDropdown();
    var lower    = (filter || '').toLowerCase();
    var filtered = lower
      ? allOpts.filter(function(o) { return o.toLowerCase().includes(lower); })
      : allOpts;
    if (!filtered.length) return;

    dropdown = mk('div', '');
    dropdown.style.cssText = 'position:fixed;z-index:99999;'
      + 'background:#fff;color:#111;'
      + 'border:1px solid #ccc;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.22);'
      + 'max-height:220px;overflow-y:auto;font-family:inherit;';
    filtered.forEach(function(o) {
      var item = tx('div', '', o);
      item.style.cssText = 'padding:8px 13px;font-size:13px;cursor:pointer;'
        + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      item.onmouseenter = function() { item.style.background = '#f0fdf4'; };
      item.onmouseleave = function() { item.style.background = ''; };
      item.onmousedown  = function(e) {
        e.preventDefault();
        inp.value = o;
        inp.dispatchEvent(new Event('input',  { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        removeDropdown();
      };
      dropdown.appendChild(item);
    });
    document.body.appendChild(dropdown);
    reposition();
    window.addEventListener('scroll', reposition, { passive: true, capture: true });
  }

  function removeDropdown() {
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
      window.removeEventListener('scroll', reposition, { capture: true });
    }
  }

  function trigger(filter) {
    clearTimeout(_timer);
    _timer = setTimeout(function() {
      var id = ++_fetchId;
      fetchFn().then(function(opts) {
        if (id !== _fetchId) return;  // veralteter Fetch verwerfen
        if (_active) showDropdown(opts || [], filter);
      }).catch(function(err) {
        console.warn('[Autocomplete] Vorschläge konnten nicht geladen werden:', err);
      });
    }, 80);
  }

  inp.removeAttribute('list');

  inp.addEventListener('focus', function() {
    _active = true;
    trigger(inp.value);
  });
  inp.addEventListener('click', function() {
    // erneuter Klick auf bereits fokussiertes Feld
    if (!dropdown) trigger(inp.value);
  });
  inp.addEventListener('input', function() {
    trigger(inp.value);
  });
  inp.addEventListener('blur', function() {
    _active = false;
    clearTimeout(_timer);
    setTimeout(removeDropdown, 200);
  });
  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { removeDropdown(); inp.blur(); }
    if (e.key === 'ArrowDown' && dropdown) {
      var first = dropdown.firstChild;
      if (first) { first.style.background = '#f0fdf4'; first.focus && first.focus(); }
    }
    if (e.key === 'Enter' && dropdown) {
      var active = dropdown.querySelector('[style*="f0fdf4"]');
      if (active) { active.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }
    }
  });
}

// ── Fach-Ansicht ──────────────────────────────────────────────────
// ── Tabellen-Header mit Resize + Drag-Reorder ─────────────────────
var _colDragFromPos = null;

function buildTableHead(onSortChange) {
  const head = mk('div', 'db-table-head');
  head.style.gridTemplateColumns = colTemplate();

  var visCols = visibleCols();
  visCols.forEach(function(colIdx, visualPos) {
    const col = COLS[colIdx];
    const hCell = mk('div', 'db-col-hdr ' + col.hCls);
    hCell.dataset.colIdx = colIdx;
    hCell.dataset.vpos = visualPos;
    hCell.draggable = true;

    // Label mit Sort-Pfeil
    var sortArrow = '';
    if (col.sortField && DB.sortCol === col.sortField) {
      sortArrow = DB.sortDir === 'asc' ? ' ▲' : ' ▼';
      hCell.style.cssText += 'cursor:pointer;';
    } else if (col.sortField) {
      hCell.style.cssText += 'cursor:pointer;';
    }
    const lbl = tx('span', '', col.label + sortArrow);
    lbl.style.pointerEvents = 'none';
    hCell.appendChild(lbl);

    // Sort-Klick (nur wenn kein Drag läuft)
    if (onSortChange && col.sortField) {
      hCell.addEventListener('click', function() {
        if (_colDragFromPos !== null) return;
        onSortChange(col.sortField);
      });
    }

    // ── Resize-Handle (nicht nach der letzten Spalte) ──────────────
    if (visualPos < visCols.length - 1) {
      const rh = mk('div', 'db-col-resize-handle');
      rh.title = 'Spaltenbreite ziehen';
      rh.draggable = false;
      rh.addEventListener('mousedown', function(e) {
        e.preventDefault();   // unterbindet Browser-Drag auf dem draggable-Parent
        e.stopPropagation();
        var startX = e.clientX;
        var startW = COL_CONFIG.widths[colIdx];
        if (!startW) {
          // 1fr → einmalig gemessene Pixel-Breite fixieren
          startW = Math.round(hCell.getBoundingClientRect().width);
          COL_CONFIG.widths[colIdx] = startW;
        }
        hCell.classList.add('db-resize-active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        function onMove(ev) {
          var newW = Math.max(60, Math.round(startW + ev.clientX - startX));
          COL_CONFIG.widths[colIdx] = newW;
          applyColTemplate();
        }
        function onUp() {
          hCell.classList.remove('db-resize-active');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          saveColConfig();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      hCell.appendChild(rh);
    }

    // ── Drag-Events für Spalten-Reorder ───────────────────────────
    hCell.addEventListener('dragstart', function(e) {
      _colDragFromPos = visualPos;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(visualPos));
      // Kurz verzögert, damit der Drag-Ghost noch normal aussieht
      requestAnimationFrame(function() { hCell.classList.add('db-col-dragging'); });
    });
    hCell.addEventListener('dragend', function() {
      _colDragFromPos = null;
      hCell.classList.remove('db-col-dragging');
      document.querySelectorAll('.db-col-drag-over').forEach(function(el) {
        el.classList.remove('db-col-drag-over');
      });
    });
    hCell.addEventListener('dragover', function(e) {
      if (_colDragFromPos === null || _colDragFromPos === visualPos) return; // eslint-disable-line
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      hCell.classList.add('db-col-drag-over');
    });
    hCell.addEventListener('dragleave', function() {
      hCell.classList.remove('db-col-drag-over');
    });
    hCell.addEventListener('drop', function(e) {
      e.preventDefault();
      hCell.classList.remove('db-col-drag-over');
      var fromPos = _colDragFromPos;
      var toPos = visualPos;
      if (fromPos === null || fromPos === toPos) return;
      // Reorder nur innerhalb der sichtbaren Spalten, Rest bleibt am Ende
      var vis = visibleCols();
      var fromIdx = vis[fromPos], toIdx = vis[toPos];
      var newOrder = COL_CONFIG.order.filter(function(i) { return vis.indexOf(i) === -1; });
      vis.splice(fromPos, 1); vis.splice(toPos, 0, fromIdx);
      COL_CONFIG.order = vis.concat(newOrder);
      saveColConfig();
      head.replaceWith(buildTableHead(onSortChange));
      document.querySelectorAll('.db-row').forEach(reorderRowCells);
    });

    head.appendChild(hCell);
  });

  return head;
}

function reorderRowCells(rowEl) {
  var cellMap = {};
  Array.from(rowEl.children).forEach(function(cell) {
    var idx = cell.dataset.colIdx;
    if (idx !== undefined) cellMap[idx] = cell;
  });
  while (rowEl.firstChild) rowEl.removeChild(rowEl.firstChild);
  visibleCols().forEach(function(colIdx) {
    if (cellMap[colIdx]) rowEl.appendChild(cellMap[colIdx]);
  });
  rowEl.style.gridTemplateColumns = colTemplate();
}

async function buildFachView(container) {
  const f = fachInfo(DB.fach);

  // ── Header ────────────────────────────────────────────────────
  const hdr = mk('div', 'c-hdr');
  const hdrLeft = mk('div', '');
  hdrLeft.appendChild(tx('div', 'c-title', f.icon + ' ' + f.label));
  const subT = tx('div', 'c-sub', '');
  hdrLeft.appendChild(subT);
  hdr.appendChild(hdrLeft);
  const colPickerBtn = btn('⚙ Spalten', 'btn btn-ghost btn-sm');
  colPickerBtn.style.cssText = 'margin-left:auto;flex-shrink:0;font-size:11px;position:relative;';
  hdr.appendChild(colPickerBtn);
  const neuBtn = btn('+ Neu', 'btn btn-sm');
  neuBtn.style.cssText = 'flex-shrink:0;';
  hdr.appendChild(neuBtn);
  container.appendChild(hdr);

  // ── Suche (wird in Filterleiste eingebaut) ────────────────────
  const searchInp = document.createElement('input');
  searchInp.type = 'text'; searchInp.className = 'finp';
  searchInp.placeholder = '🔍 Suchen…';
  searchInp.value = DB.suchtext;
  searchInp.style.cssText = 'width:160px;flex-shrink:0;font-size:12px;padding:3px 8px;height:28px;';

  // ── Filter-Leiste (Platzhalter, wird nach load-Definition befüllt) ─
  const filterContainer = mk('div', '');
  container.appendChild(filterContainer);

  // ── Tabellen-Bereich ──────────────────────────────────────────
  const tableWrap = mk('div', '');
  tableWrap.style.cssText = 'padding:8px 16px 16px;';
  container.appendChild(tableWrap);

  // Sort-Callback: Klick auf Spaltenheader → Auf/Absteigend wechseln
  function onSortChange(field) {
    if (DB.sortCol === field) {
      if (DB.sortDir === 'asc') { DB.sortDir = 'desc'; }
      else { DB.sortCol = null; DB.sortDir = 'asc'; } // dritter Klick → kein Sort
    } else {
      DB.sortCol = field; DB.sortDir = 'asc';
    }
    DB.offset = 0;
    var oldHead = tableWrap.querySelector('.db-table-head');
    if (oldHead) oldHead.replaceWith(buildTableHead(onSortChange));
    load();
  }

  // ── Spalten-Picker ────────────────────────────────────────────
  colPickerBtn.onclick = function(e) {
    e.stopPropagation();
    var existing = document.getElementById('db-col-picker');
    if (existing) { existing.remove(); return; }
    var picker = mk('div', '');
    picker.id = 'db-col-picker';
    picker.style.cssText = 'position:absolute;top:calc(100% + 4px);right:0;z-index:200;'
      + 'background:var(--surf);border:1px solid var(--bord);border-radius:10px;'
      + 'padding:10px 14px;box-shadow:0 8px 24px rgba(0,0,0,.18);min-width:170px;';
    picker.appendChild(tx('div', '', 'Spalten anzeigen')).style.cssText =
      'font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;';
    COLS.forEach(function(col, idx) {
      if (col.mandatory) return; // "Aufgabe" immer sichtbar
      var row = mk('div', '');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;';
      var chk = document.createElement('input');
      chk.type = 'checkbox'; chk.checked = COL_CONFIG.hidden.indexOf(idx) === -1;
      chk.style.cssText = 'width:14px;height:14px;cursor:pointer;accent-color:var(--pri);flex-shrink:0;';
      var lbl = tx('span', '', col.label);
      lbl.style.cssText = 'font-size:13px;color:var(--tx1);';
      row.appendChild(chk); row.appendChild(lbl);
      row.onclick = function() { chk.checked = !chk.checked; toggle(); };
      chk.onclick = function(ev) { ev.stopPropagation(); toggle(); };
      function toggle() {
        var h = COL_CONFIG.hidden.indexOf(idx);
        if (chk.checked) { if (h !== -1) COL_CONFIG.hidden.splice(h, 1); }
        else              { if (h === -1) COL_CONFIG.hidden.push(idx); }
        // Spalte auch in order halten (falls neu)
        if (COL_CONFIG.order.indexOf(idx) === -1) COL_CONFIG.order.push(idx);
        saveColConfig();
        var oldHead = tableWrap.querySelector('.db-table-head');
        if (oldHead) oldHead.replaceWith(buildTableHead(onSortChange));
        document.querySelectorAll('.db-row').forEach(reorderRowCells);
      }
      picker.appendChild(row);
    });
    colPickerBtn.style.position = 'relative';
    colPickerBtn.appendChild(picker);
    var close = function(ev) { if (!picker.contains(ev.target) && ev.target !== colPickerBtn) { picker.remove(); document.removeEventListener('click', close); } };
    setTimeout(function() { document.addEventListener('click', close); }, 0);
  };

  tableWrap.appendChild(buildTableHead(onSortChange));

  const wrap = mk('div', '');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;margin-top:4px;';
  tableWrap.appendChild(wrap);

  const LIMIT = 500;

  async function load(opts) {
    var _savedScroll = (opts && opts.keepScroll) ? container.scrollTop : null;
    wrap.innerHTML = '<div style="padding:20px;color:var(--tx3);text-align:center">⏳ Lädt…</div>';
    const filters = { fach: f.key };
    if (DB.herkunft)      filters.herkunft      = DB.herkunft;
    if (DB.buch)          filters.buch          = DB.buch;
    if (DB.operator)      filters.operator      = DB.operator;
    if (DB.schwierigkeit) filters.schwierigkeit = DB.schwierigkeit;
    if (DB.niveau)        filters.niveau        = DB.niveau;
    if (DB.umfang)        filters.umfang        = DB.umfang;
    if (DB.jahrgang)      filters.jahrgang      = DB.jahrgang;
    // Kapitel: OR über beide Spalten (kapitel + kapitel_titel) für Rückwärtskompatibilität
    var rawParams = [];
    if (DB.kapitel) {
      rawParams.push('or=(kapitel.eq.' + encodeURIComponent(DB.kapitel) + ',kapitel_titel.eq.' + encodeURIComponent(DB.kapitel) + ')');
    }
    if (DB.uk_titel)      filters.uk_titel      = DB.uk_titel;
    if (DB.typ)           filters.typ           = DB.typ;
    if (DB.seite != null) filters.seite         = DB.seite;

    // Sortier-Reihenfolge aufbauen
    var orderStr;
    if (DB.sortCol) {
      var nulls = DB.sortDir === 'asc' ? 'nullslast' : 'nullsfirst';
      orderStr = DB.sortCol + '.' + DB.sortDir + '.' + nulls;
      if (DB.sortCol === 'seite') orderStr = 'buch.asc,' + orderStr;
    } else {
      orderStr = 'herkunft,buch,seite';
    }

    var loadFailed = false;
    var rows = await sbSelect('inhalte', {
      fts: DB.suchtext || null,
      filters,
      nullFilters: [],
      rawParams,
      limit: LIMIT,
      offset: DB.offset,
      order: orderStr,
    }).catch(function(err) {
      console.error('[Datenbank] Laden fehlgeschlagen (inhalte):', err, { filters: filters, fts: DB.suchtext || null });
      loadFailed = true;
      return [];
    });

    // nr natürlich sortieren: 8 < 8a < 8b < 9 < 10
    // Bei Custom-Sort: Server-Reihenfolge beibehalten, nur innerhalb gleicher Seite nr-sortieren
    rows.sort(function(a, b) {
      if (!DB.sortCol) {
        if (a.buch  !== b.buch)  return (a.buch  || '') < (b.buch  || '') ? -1 : 1;
        if (a.seite !== b.seite) return (a.seite || 0)  - (b.seite || 0);
      } else {
        // Server hat sortiert; nur innerhalb gleicher buch+seite nr-sortieren
        if (a.buch !== b.buch || a.seite !== b.seite) return 0;
      }
      return cmpNr(a.nr, b.nr);
    });

    wrap.innerHTML = '';
    var parts = [];
    if (DB.buch)          parts.push('📖 ' + DB.buch);
    else if (DB.herkunft && HERKUNFT[DB.herkunft]) parts.push(HERKUNFT[DB.herkunft].label);
    if (DB.operator)      parts.push(DB.operator);
    if (DB.schwierigkeit) parts.push(DB.schwierigkeit);
    if (DB.niveau)        parts.push(DB.niveau);
    if (DB.umfang)        parts.push(DB.umfang);
    if (DB.kapitel)       parts.push(DB.kapitel);
    if (DB.uk_titel)      parts.push(DB.uk_titel);
    if (DB.typ)           parts.push(TYP_LABELS[DB.typ] || DB.typ);
    if (DB.seite != null) parts.push('S.\xa0' + DB.seite);
    if (DB.suchtext)      parts.push('„' + DB.suchtext + '"');
    var suffix = parts.length ? ' · ' + parts.join(' · ') : '';

    // Gruppen jetzt berechnen — für korrekte Aufgaben-Zählung
    var groups = dbGroupByParent(rows);
    if (loadFailed) {
      subT.textContent = 'Fehler beim Laden' + suffix;
    } else if (rows.length >= LIMIT) {
      subT.textContent = 'Aufgaben werden gezählt…' + suffix;
      sbSelect('inhalte', { select: 'gruppen_key', filters, fts: DB.suchtext || null, rawParams, limit: 10000 })
        .then(function(allRows) {
          var distinct = new Set(allRows.map(function(r) { return r.gruppen_key || r.id; })).size;
          subT.textContent = distinct + ' Aufgaben' + suffix;
        })
        .catch(function(err) {
          console.warn('[Datenbank] Zählung fehlgeschlagen:', err);
          subT.textContent = groups.length + '+ Aufgaben' + suffix;  // wenigstens die geladenen
        });
    } else {
      subT.textContent = groups.length + ' Aufgaben' + suffix;
    }

    // Fehler ≠ „leer": getrennt anzeigen, damit ein Ausfall nicht wie eine
    // leere Datenbank aussieht. Mit „Erneut versuchen" für transiente Aussetzer.
    if (loadFailed) {
      var ebox = mk('div', '');
      ebox.style.cssText = 'padding:36px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;';
      var emsg = tx('div', '', '⚠ Konnte nicht laden — Supabase nicht erreichbar?');
      emsg.style.cssText = 'color:#b91c1c;font-size:14px;font-weight:600;';
      var ehint = tx('div', '', 'Prüfe die Internetverbindung. Details stehen in der Browser-Konsole.');
      ehint.style.cssText = 'color:var(--tx3);font-size:12px;';
      var retry = btn('↻ Erneut versuchen', 'btn btn-sm');
      retry.onclick = function() { load({ keepScroll: true }); };
      ebox.appendChild(emsg); ebox.appendChild(ehint); ebox.appendChild(retry);
      wrap.appendChild(ebox);
      return;
    }

    if (!rows.length) {
      const e = tx('div', '', 'Keine Einträge gefunden.');
      e.style.cssText = 'padding:40px;text-align:center;color:var(--tx3);font-size:14px;';
      wrap.appendChild(e);
      return;
    }

    var _lastSeiteBuch = null; // für Seiten-Trenner
    groups.forEach(function(g) {
      var hasSubtasks = g.items.length > 1 || (g.items.length === 1 && g.items[0].nr !== g.key);
      var ref0 = g.items[0];

      // ── Seiten-Trenner ───────────────────────────────────────────
      // Nur wenn kein einzelner Seiten-Filter aktiv ist und seite bekannt
      if (!DB.seite && ref0 && ref0.seite != null) {
        var seiteBuchKey = (ref0.buch || '') + '::' + ref0.seite;
        if (seiteBuchKey !== _lastSeiteBuch) {
          if (_lastSeiteBuch !== null) {
            // Trennlinie zwischen Seiten
            var sep = mk('div', '');
            sep.style.cssText = 'margin:6px 0 2px;border-top:1px solid var(--bord);';
            wrap.appendChild(sep);
          }
          // Seiten-Header
          var pageHdr = mk('div', '');
          pageHdr.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px 2px;';
          var pagePill = tx('span', '', 'Seite ' + ref0.seite);
          pagePill.style.cssText = 'font-size:13px;font-weight:800;letter-spacing:.04em;'
            + 'color:var(--pri);background:rgba(15,118,110,.10);border:1px solid rgba(15,118,110,.22);'
            + 'border-radius:20px;padding:4px 14px;';
          pageHdr.appendChild(pagePill);
          if (!DB.buch && ref0.buch) {
            var buchLabel = tx('span', '', ref0.buch);
            buchLabel.style.cssText = 'font-size:11px;color:var(--tx3);font-weight:500;';
            pageHdr.appendChild(buchLabel);
          }
          wrap.appendChild(pageHdr);
          _lastSeiteBuch = seiteBuchKey;
        }
      }

      var showSeiteInHdr = DB.seite || !ref0 || ref0.seite == null;
      var seitePrefix = (showSeiteInHdr && ref0 && ref0.seite != null ? 'S. ' + ref0.seite + ' · ' : '');

      if (hasSubtasks) {
        // Gruppe: Header wie Einzelaufgaben-Row (gleiche Grid-Struktur), ohne Chips
        var gHdrItem = { inhalt: g.aufgabenstellung || '', typ: ref0.typ || 'aufgabe' };
        var ghdr = renderRow(gHdrItem, null, true, seitePrefix + grpTypLabel(g));
        ghdr.title = 'Alle Teilaufgaben ansehen';
        ghdr.onclick = function() { openGroupModal(g, function() { load({ keepScroll: true }); }); };
        wrap.appendChild(ghdr);
        g.items.forEach(function(row) {
          var rowEl = renderRow(row, function() { load({ keepScroll: true }); }, true);
          // Nur die erste Spalte einrücken (zeigt Zugehörigkeit zur Gruppe),
          // NICHT die ganze Zeile — sonst verrutschen alle anderen Spalten.
          if (rowEl.firstChild) rowEl.firstChild.style.paddingLeft = '18px';
          rowEl.onclick = function() { openGroupModal(g, function() { load({ keepScroll: true }); }); };
          wrap.appendChild(rowEl);
        });
      } else {
        // Einzelaufgabe: „Aufgabe N" + Text in einer Zeile (kein separater Header)
        var rowEl = renderRow(g.items[0], function() { load({ keepScroll: true }); }, true, seitePrefix + grpTypLabel(g));
        wrap.appendChild(rowEl);
      }
    });

    if (rows.length === LIMIT) {
      const mehr = btn('Weitere ' + LIMIT + ' laden…', 'btn btn-ghost btn-sm');
      mehr.style.cssText = 'margin:8px auto;display:block;';
      mehr.onclick = function() { DB.offset += LIMIT; load(); };
      wrap.appendChild(mehr);
    }

    if (_savedScroll !== null) requestAnimationFrame(function() { container.scrollTop = _savedScroll; });
  }

  // Suche: Debounce
  var _debounce;
  searchInp.oninput = function() {
    clearTimeout(_debounce);
    _debounce = setTimeout(function() { DB.suchtext = searchInp.value.trim(); DB.offset = 0; load(); }, 400);
  };

  // Neu-Button
  neuBtn.onclick = function() { openEntryModal(null, 'create', function() { DB.offset = 0; load(); }); }; // neuer Eintrag → zurück nach oben ok

  // Filter-Leiste einbauen
  buildFilterBar(filterContainer, load, searchInp, f.key);

  load();
}

// ── Eintrag-Zeile (Tabellen-Grid) ────────────────────────────────
// groupLabel (optional): bei Einzelaufgaben „Aufgabe N" in Spalte 0,
// damit Nr. und Aufgabentext in einer Zeile stehen (Text bricht um).
function renderRow(a, onSaved, compact, groupLabel) {
  const hMeta = herkunftMeta(a.herkunft);
  const hasBuch = hMeta.hasBuch;          // schulbuch/aufgabenpool/sammlung zeigen Buchtitel
  const accentColor = hMeta.color;

  const row = mk('div', 'db-row');
  row.style.background = SCHW_BG[a.schwierigkeit] || 'transparent';
  row.style.gridTemplateColumns = colTemplate();

  var cells = [];

  // Zelle 0: Quelle — im compact-Modus nur die Nr
  var src = mk('div', 'db-col-src'); src.dataset.colIdx = 0;
  if (compact) {
    if (groupLabel) {
      // Einzelaufgabe: „Aufgabe N" als Zeilenlabel in Spalte 0
      var glEl = tx('div', '', groupLabel);
      glEl.style.cssText = 'font-weight:700;font-size:12px;color:var(--tx2);letter-spacing:.02em;padding:2px 0;';
      src.appendChild(glEl);
    } else {
      var nrMatch = String(a.nr || '').match(/[a-zA-Z]+$/);
      if (nrMatch) {
        var nrEl = tx('div', '', nrMatch[0]);
        nrEl.style.cssText = 'font-weight:700;font-size:13px;color:var(--tx2);padding:2px 0;';
        src.appendChild(nrEl);
      }
    }
  } else if (DB.buch && hasBuch) {
    // Buch ist bereits gefiltert — nur Seite zeigen
    var seiteEl = tx('div', 'db-kap-name', a.seite ? 'S. ' + a.seite : '–');
    seiteEl.style.fontSize = '13px';
    src.appendChild(seiteEl);
  } else {
    var hBadge = tx('div', 'db-herkunft-badge', hMeta.icon + ' ' + hMeta.label);
    hBadge.style.color = accentColor;
    src.appendChild(hBadge);
    if (hasBuch) {
      src.appendChild(tx('div', 'db-buch-name', a.buch || '–'));
      var sub = (a.uk_titel || a.kapitel || a.kapitel_titel || '') + (a.seite ? ' · S. ' + a.seite : '');
      if (sub.trim()) src.appendChild(tx('div', 'db-kap-name', sub));
    } else {
      src.appendChild(tx('div', 'db-buch-name', a.titel || a.dateiname || '–'));
    }
  }
  cells[0] = src;

  // Typ-Badge (nur für Beispiele und Lehrtexte, nicht für Aufgaben / null)
  if (a.typ && a.typ !== 'aufgabe') {
    var typBadge = tx('span', '', (TYP_ICONS[a.typ] ? TYP_ICONS[a.typ] + ' ' : '') + (TYP_LABELS[a.typ] || a.typ));
    var typColor = TYP_FARBEN[a.typ] || '#64748b';
    typBadge.style.cssText = 'display:inline-block;font-size:9.5px;font-weight:700;padding:1px 7px;border-radius:20px;'
      + 'background:' + typColor + '18;color:' + typColor + ';border:1px solid ' + typColor + '38;'
      + 'text-transform:uppercase;letter-spacing:.06em;';
    src.appendChild(typBadge);
  }

  // Zelle 1: Inhalt — im compact-Modus nur den individuellen Text
  var mid = mk('div', 'db-col-inhalt'); mid.dataset.colIdx = 1;
  var inhaltText = compact
    ? (a.inhalt || '–')
    : (a.inhalt || a.thema || a.beschreibung || '–');
  // Einzelaufgaben (groupLabel) dürfen umbrechen und zeigen mehr Text
  var inhaltCls = 'db-inhalt-text' + (compact && groupLabel ? ' wrap' : '');
  mid.appendChild(tx('div', inhaltCls, inhaltText.replace(/ \| /g, ' · ').slice(0, groupLabel ? 400 : 150)));
  if (!compact && a.anforderung) mid.appendChild(tx('div', 'db-anf-text', a.anforderung.slice(0, 120)));
  cells[1] = mid;

  // Zelle 2: Anforderungsbereich + Niveau
  var schwCol = mk('div', 'db-col-schw'); schwCol.dataset.colIdx = 2;
  schwCol.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;';
  if (a.schwierigkeit) schwCol.appendChild(mkChip(a.schwierigkeit, SCHW_FARBEN[a.schwierigkeit] || '#64748b', SCHW_ICONS[a.schwierigkeit] || ''));
  if (a.niveau)        schwCol.appendChild(mkChip(a.niveau, NIVEAU_FARBEN[a.niveau] || '#64748b', NIVEAU_ICONS[a.niveau] || ''));
  cells[2] = schwCol;

  // Zelle 3: Operator (optional)
  var opCol = mk('div', 'db-col-op'); opCol.dataset.colIdx = 3;
  if (a.operator) opCol.appendChild(mkChip(a.operator, opColor(a.operator)));
  cells[3] = opCol;

  // Zelle 4: Umfang (optional)
  var umfCol = mk('div', 'db-col-umfang'); umfCol.dataset.colIdx = 4;
  umfCol.style.cssText = 'display:flex;justify-content:center;align-items:center;';
  if (a.umfang) {
    var umfEl = tx('div', '', a.umfang);
    umfEl.style.cssText = 'font-size:11px;color:var(--tx3);font-weight:600;';
    umfCol.appendChild(umfEl);
  }
  cells[4] = umfCol;

  // Zelle 5: Kapitel
  var kapCol = mk('div', 'db-col-kap'); kapCol.dataset.colIdx = 5;
  var kapText = a.kapitel || a.kapitel_titel || '';
  if (kapText) {
    var kapEl = tx('div', 'db-col-kap-text', kapText);
    kapEl.title = kapText;
    kapCol.appendChild(kapEl);
  }
  cells[5] = kapCol;

  // Zelle 6: Unterkapitel
  var ukCol = mk('div', 'db-col-uk'); ukCol.dataset.colIdx = 6;
  if (a.uk_titel) {
    var ukEl = tx('div', 'db-col-kap-text', a.uk_titel);
    ukEl.title = a.uk_titel;
    ukCol.appendChild(ukEl);
  }
  cells[6] = ukCol;

  // Nur sichtbare Spalten in konfigurierter Reihenfolge einhängen
  visibleCols().forEach(function(i) { row.appendChild(cells[i]); });

  // Klick → Vollbild-Modal
  row.onclick = function() { openEntryModal(a, 'edit', onSaved); };
  return row;
}

// ── Filter-Leiste ─────────────────────────────────────────────────
var _buchCache = {}; // fach → [buchtitel]

function buildFilterBar(containerEl, loadFn, searchInp, fach) {
  containerEl.innerHTML = '';
  const bar = mk('div', 'db-filter-bar');

  function refresh() { loadFn(); buildFilterBar(containerEl, loadFn, searchInp, fach); }

  // Suchfeld + Seitenfilter
  if (searchInp) bar.appendChild(searchInp);

  var seiteInp = document.createElement('input');
  seiteInp.type = 'number'; seiteInp.placeholder = 'S.';
  seiteInp.title = 'Nach Seite filtern';
  seiteInp.value = DB.seite != null ? DB.seite : '';
  seiteInp.style.cssText = 'width:52px;flex-shrink:0;font-size:12px;padding:3px 6px;height:28px;border:1px solid var(--bord);border-radius:6px;background:var(--surf);color:var(--tx1);';
  var _seiteDebounce;
  seiteInp.oninput = function() {
    clearTimeout(_seiteDebounce);
    _seiteDebounce = setTimeout(function() {
      var v = seiteInp.value.trim();
      DB.seite = v !== '' ? Number(v) : null;
      DB.offset = 0;
      loadFn(); // kein rebuild der Filterleiste — sonst geht Fokus verloren
    }, 400);
  };
  bar.appendChild(seiteInp);
  bar.appendChild(mk('div', 'db-filter-sep'));

  function fchipGroup(opts, dbKey) {
    const g = mk('div', 'db-filter-group');
    opts.forEach(function(opt) {
      const active = DB[dbKey] === opt.val;
      const chip = tx('div', 'db-fchip' + (active ? ' on' : ''), opt.label);
      if (active && opt.color) {
        chip.style.cssText = 'background:' + opt.color + '18;color:' + opt.color + ';border-color:' + opt.color + '60;';
      }
      chip.onclick = function() {
        DB[dbKey] = (DB[dbKey] === opt.val) ? null : opt.val;
        DB.offset = 0;
        refresh();
      };
      g.appendChild(chip);
    });
    return g;
  }

  function sep() {
    const s = mk('div', 'db-filter-sep');
    return s;
  }

  // Schulbuch-Dropdown
  var buchSel = document.createElement('select');
  buchSel.className = 'db-filter-sel';
  var buchOptDefault = document.createElement('option');
  buchOptDefault.value = ''; buchOptDefault.textContent = '📖 Schulbuch';
  buchSel.appendChild(buchOptDefault);
  buchSel.onchange = function() {
    DB.buch = buchSel.value || null;
    DB.herkunft = null;   // Eigenmaterial-Filter beim Buch-Wechsel immer löschen
    DB.kapitel = null; DB.uk_titel = null;
    DB.offset = 0; refresh();
  };
  // Bücher laden (gecacht pro Fach)
  function populateBuchSel(books) {
    books.forEach(function(b) {
      var o = document.createElement('option');
      o.value = b; o.textContent = b;
      if (DB.buch === b) o.selected = true;
      buchSel.appendChild(o);
    });
    if (DB.buch) buchSel.value = DB.buch;
  }
  if (fach) {
    if (_buchCache[fach] && _buchCache[fach].length) {
      populateBuchSel(_buchCache[fach]);
    } else {
      sbSelect('inhalte', { select: 'buch', filters: { fach: fach }, limit: 5000, order: 'buch' })
        .then(function(rows) {
          var seen = {}, books = [];
          rows.forEach(function(r) { if (r.buch && !seen[r.buch]) { seen[r.buch] = true; books.push(r.buch); } });
          books.sort();
          _buchCache[fach] = books.length ? books : null; // leere Arrays nicht cachen
          populateBuchSel(books);
        });
    }
  }
  bar.appendChild(buchSel);

  // Kapitel-Dropdown (nur wenn Buch gewählt)
  if (DB.buch && fach) {
    var kapSel = document.createElement('select');
    kapSel.className = 'db-filter-sel';
    var kapDef = document.createElement('option'); kapDef.value = ''; kapDef.textContent = 'Kapitel';
    kapSel.appendChild(kapDef);
    kapSel.onchange = function() {
      DB.kapitel = kapSel.value || null; DB.uk_titel = null; DB.seite = null; DB.offset = 0; refresh();
    };
    sbSelect('inhalte', { select: 'kapitel,kapitel_titel', filters: { fach: fach, buch: DB.buch }, limit: 1000 })
      .then(function(rows) {
        var seen = {}, kaps = [];
        rows.forEach(function(r) { var k = r.kapitel || r.kapitel_titel; if (k && !seen[k]) { seen[k] = true; kaps.push(k); } });
        kaps.sort();
        kaps.forEach(function(k) {
          var o = document.createElement('option'); o.value = k; o.textContent = k;
          if (DB.kapitel === k) o.selected = true;
          kapSel.appendChild(o);
        });
      });
    bar.appendChild(kapSel);
  }

  // Unterkapitel-Dropdown (nur wenn Kapitel gewählt)
  if (DB.kapitel && fach) {
    var ukSel = document.createElement('select');
    ukSel.className = 'db-filter-sel';
    var ukDef = document.createElement('option'); ukDef.value = ''; ukDef.textContent = 'Unterkapitel';
    ukSel.appendChild(ukDef);
    ukSel.onchange = function() {
      DB.uk_titel = ukSel.value || null; DB.seite = null; DB.offset = 0; refresh();
    };
    sbSelect('inhalte', { select: 'uk_titel', filters: { fach: fach, buch: DB.buch }, rawParams: ['or=(kapitel.eq.' + encodeURIComponent(DB.kapitel) + ',kapitel_titel.eq.' + encodeURIComponent(DB.kapitel) + ')'], limit: 500 })
      .then(function(rows) {
        var seen = {}, uks = [];
        rows.forEach(function(r) { if (r.uk_titel && !seen[r.uk_titel]) { seen[r.uk_titel] = true; uks.push(r.uk_titel); } });
        uks.sort();
        uks.forEach(function(u) {
          var o = document.createElement('option'); o.value = u; o.textContent = u;
          if (DB.uk_titel === u) o.selected = true;
          ukSel.appendChild(o);
        });
        if (!uks.length) ukSel.style.display = 'none'; // verstecken wenn keine Unterkapitel vorhanden
      });
    bar.appendChild(ukSel);
  }

  // Herkunft-Chips (Schulbuch ist die Standardansicht → kein eigener Chip)
  var herkGroup = mk('div', 'db-filter-group');
  ['handreichung', 'aufgabenpool', 'sammlung', 'eigenmaterial'].forEach(function(hk) {
    var meta = HERKUNFT[hk];
    var active = DB.herkunft === hk;
    var chip = tx('div', 'db-fchip' + (active ? ' on' : ''), meta.icon + ' ' + meta.label);
    if (active) chip.style.cssText = 'background:' + meta.color + '18;color:' + meta.color + ';border-color:' + meta.color + '60;';
    chip.onclick = function() {
      DB.herkunft = active ? null : hk;
      DB.buch = null;            // Buchfilter beim Herkunftswechsel zurücksetzen
      DB.offset = 0; refresh();
    };
    herkGroup.appendChild(chip);
  });
  bar.appendChild(herkGroup);

  bar.appendChild(sep());

  // Anforderungsbereich (NRW AFB I–III)
  bar.appendChild(fchipGroup([
    { val: 'grundlegend',   label: '○ AFB I',   color: SCHW_FARBEN.grundlegend },
    { val: 'standard',      label: '◑ AFB II',  color: SCHW_FARBEN.standard },
    { val: 'anspruchsvoll', label: '● AFB III', color: SCHW_FARBEN.anspruchsvoll },
  ], 'schwierigkeit'));

  bar.appendChild(sep());

  // Aufgabenniveau
  bar.appendChild(fchipGroup([
    { val: 'leicht',  label: '▽ leicht',  color: NIVEAU_FARBEN.leicht },
    { val: 'mittel',  label: '▾ mittel',  color: NIVEAU_FARBEN.mittel },
    { val: 'schwer',  label: '▼ schwer',  color: NIVEAU_FARBEN.schwer },
  ], 'niveau'));

  bar.appendChild(sep());

  // Inhaltstyp
  bar.appendChild(fchipGroup([
    { val: 'aufgabe',  label: '📝 Aufgabe',   color: TYP_FARBEN.aufgabe },
    { val: 'beispiel', label: '📐 Beispiel',  color: TYP_FARBEN.beispiel },
    { val: 'lehrtext', label: '📖 Lehrtext',  color: TYP_FARBEN.lehrtext },
  ], 'typ'));

  // Filter löschen (nur wenn aktiv)
  var anyActive = DB.buch || DB.herkunft || DB.schwierigkeit || DB.niveau || DB.typ || DB.umfang || DB.jahrgang || DB.kapitel || DB.uk_titel || DB.seite != null;
  if (anyActive) {
    bar.appendChild(sep());
    const clrBtn = btn('✕ Filter', 'btn btn-ghost btn-sm');
    clrBtn.style.cssText += 'font-size:10.5px;padding:2px 8px;color:var(--tx3);';
    clrBtn.onclick = function() {
      resetFilters();
      refresh();
    };
    bar.appendChild(clrBtn);
  }

  containerEl.appendChild(bar);
}

// ── Gruppen-Modal (alle Teilaufgaben einer Aufgabe) ───────────────
// ── Aufgaben-Modal (Einzelaufgabe ODER Gruppe mit Teilaufgaben) ───
// group: { items:[...], aufgabenstellung? }. items.length>1 → Gruppen-
// Ansicht (Teilaufgaben a/b/c, gemeinsame Grunddaten); sonst flache
// Einzelaufgaben-Ansicht. opts: { mode:'edit'|'create', onRefresh }.
function openTaskModal(group, opts) {
  closeEntryModal();
  opts = opts || {};
  var mode    = opts.mode || 'edit';
  var onDone  = opts.onRefresh;
  var items   = (group.items && group.items.length) ? group.items : [{}];
  var isMulti = items.length > 1;
  var ref = Object.assign({}, items[0] || {});
  if (group.aufgabenstellung) ref.aufgabenstellung = group.aufgabenstellung;
  // Neuer Eintrag aus einer Fach-Ansicht → Fach vorbelegen, sonst landet er bei keinem Fach
  if (mode === 'create' && ref.fach == null && DB.fach) ref.fach = DB.fach;

  var overlay = mk('div', 'db-modal-overlay');
  overlay.onclick = function(e) { if (e.target === overlay) closeEntryModal(); };
  _modalOverlay = overlay;
  var modal = mk('div', 'db-modal');
  overlay.appendChild(modal);

  // ── Header ────────────────────────────────────────────────────
  var hdr = mk('div', 'db-modal-hdr');
  var hdrLeft = mk('div', '');
  hdrLeft.style.cssText = 'display:flex;align-items:center;gap:10px;flex:1;min-width:0;';
  if (mode === 'create') {
    hdrLeft.appendChild(tx('div', 'db-modal-title', 'Neuer Eintrag'));
  } else {
    var fiH = fachInfo(ref.fach);
    hdrLeft.appendChild(tx('span', '', fiH.icon));
    var tp = [];
    if (isMulti)            tp.push(grpTypLabel(group));
    if (ref.buch)           tp.push(ref.buch);
    if (ref.seite != null)  tp.push('S. ' + ref.seite);
    if (!isMulti && ref.nr) tp.push('Nr. ' + ref.nr);
    hdrLeft.appendChild(tx('div', 'db-modal-title', tp.join(' · ') || (ref.inhalt || '').slice(0, 70) || 'Eintrag'));
  }
  hdr.appendChild(hdrLeft);
  var hdrRight = mk('div', '');
  hdrRight.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';
  var closeBtn = btn('✕', 'btn btn-ghost btn-sm');
  closeBtn.style.cssText += 'font-size:13px;padding:3px 8px;';
  closeBtn.onclick = closeEntryModal;
  hdrRight.appendChild(closeBtn);
  hdr.appendChild(hdrRight);
  modal.appendChild(hdr);

  // ── Tab-Struktur ──────────────────────────────────────────────
  var tabWrap = mk('div', 'db-modal-tabwrap');
  var tabBar  = mk('div', 'db-modal-tabbar');
  var tabBodyEl = mk('div', 'db-modal-tab-body');
  var tabs = [], panes = [];
  ['📋 Grunddaten', '📚 Unterrichtsdaten', '✏️ Prüfungsdaten'].forEach(function(label, idx) {
    var tab = document.createElement('button');
    tab.className = 'db-modal-tab' + (idx === 0 ? ' active' : '');
    tab.textContent = label;
    tab.onclick = function() {
      tabs.forEach(function(t, i) { t.classList.toggle('active', i === idx); });
      panes.forEach(function(p, i) { p.classList.toggle('active', i === idx); });
      // Auto-Resize nachziehen — scrollHeight ist 0, solange Pane display:none war
      panes[idx].querySelectorAll('textarea').forEach(function(t) {
        if (_autoTas.indexOf(t) !== -1) autoResize(t);
      });
    };
    tabs.push(tab); tabBar.appendChild(tab);
  });
  tabWrap.appendChild(tabBar);
  tabWrap.appendChild(tabBodyEl);

  // ── Helfer ────────────────────────────────────────────────────
  function mkL() { return mk('div', 'db-modal-left'); }
  function mkR() { return mk('div', 'db-modal-right'); }
  function sec(parent, title) { parent.appendChild(tx('div', 'db-modal-section-title', title)); }
  function decode(v) { return (v || '').replace(/ \| /g, '\n'); }
  function encode(v) { return v.replace(/\r?\n/g, ' | ').replace(/ \|  \| /g, ' | ').trim() || null; }
  // Anzeige-Beschriftung der Teilaufgaben: fortlaufend a) b) c) nach Position
  // (die gespeicherte nr bleibt unberührt). Ab 26 → aa, ab, …
  function posLetter(i) {
    var s = '';
    do { s = String.fromCharCode(97 + (i % 26)) + s; i = Math.floor(i / 26) - 1; } while (i >= 0);
    return s;
  }
  function autoResize(ta) { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; }
  var _autoTas = [];

  function labeled(label, el) {
    var f = mk('div', 'db-form-field');
    if (label) { var l = document.createElement('label'); l.textContent = label; f.appendChild(l); }
    f.appendChild(el); return f;
  }
  function fieldRow() { return mk('div', 'db-form-row'); }

  // Gemeinsame (data-key) Felder – lesen aus ref, werden beim Speichern auf ALLE Items geschrieben
  function sfld(parent, label, key, type, placeholder) {
    var inp = document.createElement('input');
    inp.className = 'db-form-inp'; inp.type = type || 'text';
    inp.placeholder = placeholder || ''; inp.value = ref[key] != null ? String(ref[key]) : '';
    inp.dataset.key = key;
    parent.appendChild(labeled(label, inp)); return inp;
  }
  function ssel(parent, label, key, optList) {
    var sel = mkSelect(ref[key], optList); sel.dataset.key = key;
    parent.appendChild(labeled(label, sel)); return sel;
  }
  function ssuggest(parent, label, key, placeholder, fetchFn) {
    var inp = sfld(parent, label, key, 'text', placeholder);
    if (fetchFn) attachAutocomplete(inp, fetchFn);
    return inp;
  }

  // Element-Fabriken OHNE data-key → pro Teilaufgabe (in itemFields gespeichert)
  function mkSelect(value, optList) {
    var sel = document.createElement('select'); sel.className = 'db-form-sel';
    [['', '–']].concat(optList).forEach(function(o) {
      var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1];
      if (String(value || '') === o[0]) op.selected = true;
      sel.appendChild(op);
    });
    return sel;
  }
  function mkAutoTA(value, placeholder) {
    var ta = document.createElement('textarea');
    ta.className = 'db-form-textarea'; ta.rows = 1;
    ta.style.resize = 'none'; ta.style.overflowY = 'hidden'; ta.style.minHeight = '0';
    ta.placeholder = placeholder || ''; ta.value = decode(value);
    ta.addEventListener('input', function() { autoResize(ta); });
    _autoTas.push(ta); return ta;
  }

  var NIVEAU_OPTS = [['leicht','▽ leicht'],['mittel','▾ mittel'],['schwer','▼ schwer']];
  var SCHW_OPTS   = [['grundlegend','○ grundlegend (AFB I)'],['standard','◑ standard (AFB II)'],['anspruchsvoll','● anspruchsvoll (AFB III)']];
  var UMFANG_OPTS = [['kurz','kurz (1–2 min)'],['mittel','mittel (3–7 min)'],['lang','lang (8+ min)']];
  var OP_OPTS     = Object.keys(OP_FARBEN2).map(function(k) { return [k, k]; });

  // Pro-Teilaufgabe-Felder, parallel zu items (kein data-key)
  var itemFields = items.map(function(it, i) {
    var themaInp = document.createElement('input');
    themaInp.className = 'db-form-inp'; themaInp.type = 'text';
    themaInp.placeholder = 'z.B. Gleichsetzungsverfahren'; themaInp.value = it.thema || '';
    var chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = !!it.hat_loesung;
    chk.style.cssText = 'width:16px;height:16px;cursor:pointer;accent-color:var(--pri);margin-top:8px;';
    return {
      inhalt:        mkAutoTA(it.inhalt, isMulti ? 'Inhalt Teilaufgabe ' + posLetter(i) : 'Was steht in der Aufgabe?'),
      abbildung:     mkAutoTA(it.abbildung, 'Beschreibung der Abbildung (falls vorhanden)'),
      anforderung:   mkAutoTA(it.anforderung, 'Was sollen Schülerinnen konkret tun?'),
      thema:         themaInp,
      niveau:        mkSelect(it.niveau, NIVEAU_OPTS),
      operator:      mkSelect(it.operator, OP_OPTS),
      schwierigkeit: mkSelect(it.schwierigkeit, SCHW_OPTS),
      umfang:        mkSelect(it.umfang, UMFANG_OPTS),
      hat_loesung:   chk
    };
  });
  function itemHeader(i) {
    var h = tx('div', '', posLetter(i) + ')');
    h.style.cssText = 'font-weight:800;font-size:14px;color:var(--acc,#2563eb);margin-bottom:6px;';
    return h;
  }

  // Einzelne Teilaufgabe löschen: DOM-Blöcke aller Panes merken, beim Klick
  // den Eintrag entfernen (Modal bleibt offen). removed[i]=true → Save überspringt ihn.
  var itemNodes = items.map(function() { return []; });
  var removed   = items.map(function() { return false; });
  function delItemBtn(i) {
    var b = btn('🗑', 'btn btn-ghost btn-sm');
    b.title = 'Teilaufgabe ' + posLetter(i) + ' löschen';
    b.style.cssText += 'color:#ef4444;flex-shrink:0;padding:3px 7px;font-size:12px;';
    b.onclick = async function() {
      if (!confirm('Teilaufgabe ' + posLetter(i) + ') löschen?')) return;
      b.disabled = true;
      try {
        if (items[i].id) await sbDelete('inhalte', items[i].id);
        removed[i] = true;
        itemNodes[i].forEach(function(n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
        if (onDone) onDone();   // Tabelle im Hintergrund aktualisieren
      } catch(e) {
        alert('Fehler beim Löschen: ' + e.message); b.disabled = false;
      }
    };
    return b;
  }

  // Abbildungsbeschreibung pro Teilaufgabe: hinter einem 📷-Symbol ausgelagert,
  // damit die Teilaufgaben kompakt bleiben. Klick öffnet ein kleines Overlay
  // ÜBER dem Aufgaben-Modal (Overlay im Overlay).
  function openAbbOverlay(i, onClose) {
    var ta = itemFields[i].abbildung;
    var ov = mk('div', 'db-modal-overlay');
    ov.style.zIndex = '9500';   // über dem Aufgaben-Modal (9000)
    ov.onclick = function(e) { if (e.target === ov) close(); };

    var box = mk('div', 'db-modal');
    box.style.cssText = 'max-width:600px;height:auto;max-height:80vh;';

    var h = mk('div', 'db-modal-hdr');
    h.appendChild(tx('div', 'db-modal-title', '📷 Abbildung — Teilaufgabe ' + posLetter(i) + ')'));
    var x = btn('✕', 'btn btn-ghost btn-sm');
    x.style.cssText += 'margin-left:auto;font-size:13px;padding:3px 8px;';
    x.onclick = close;
    h.appendChild(x);
    box.appendChild(h);

    var bodyWrap = mk('div', '');
    bodyWrap.style.cssText = 'padding:18px 22px;overflow-y:auto;';
    ta.placeholder = 'Beschreibe die Abbildung dieser Teilaufgabe — z.B. „Zahlenstrahl von -5 bis 5, Punkt bei -3 markiert".';
    ta.style.fontSize = '13px'; ta.style.opacity = '1'; ta.style.minHeight = '120px';
    bodyWrap.appendChild(labeled('Beschreibung der Abbildung (optional)', ta));
    box.appendChild(bodyWrap);

    var f = mk('div', 'db-modal-footer');
    var done = btn('✓ Fertig', 'btn btn-sm'); done.onclick = close;
    f.appendChild(done);
    box.appendChild(f);
    ov.appendChild(box);

    // Escape-Stapelung: äußeren Esc-Handler kurz deaktivieren, eigenen setzen
    var outerEsc = _modalEsc;
    if (outerEsc) document.removeEventListener('keydown', outerEsc);
    function innerEsc(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }
    document.addEventListener('keydown', innerEsc);

    var closed = false;
    function close() {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', innerEsc);
      if (outerEsc) document.addEventListener('keydown', outerEsc);  // äußeren wieder aktiv
      ov.remove();
      if (onClose) onClose();
    }

    document.body.appendChild(ov);
    requestAnimationFrame(function() { autoResize(ta); ta.focus(); });
  }

  function abbBtn(i) {
    var b = btn('📷', 'btn btn-ghost btn-sm');
    b.style.cssText += 'flex-shrink:0;padding:3px 8px;font-size:13px;border-radius:7px;';
    function sync() {
      var v = itemFields[i].abbildung.value.trim();
      b.style.opacity = v ? '1' : '.4';
      b.style.background = v ? 'rgba(15,118,110,.12)' : '';
      b.style.boxShadow  = v ? 'inset 0 0 0 1px var(--pri)' : '';
      b.title = v ? 'Abbildung: ' + v.replace(/ \| /g, ' ').slice(0, 80)
                  : 'Abbildung beschreiben (optional)';
    }
    b.onclick = function() { openAbbOverlay(i, sync); };
    sync();
    return b;
  }

  // ── Pane 0: Grunddaten (gemeinsam) ────────────────────────────
  var p0 = mk('div', 'db-modal-tab-pane split active'); panes.push(p0);
  var R0 = mkR();
  sec(R0, 'Quelle');
  ssel(R0, 'Herkunft', 'herkunft', HERKUNFT_OPTS);
  var buchInp = ssuggest(R0, 'Buch / Titel', 'buch', 'z.B. Lambacher Schweizer 7', function() { return suggestBooks(); });
  var kapInp  = ssuggest(R0, 'Kapitel', 'kapitel_titel', 'z.B. IV Lineare Gleichungssysteme', function() { return suggestKapitel(buchInp.value.trim()); });
  ssuggest(R0, 'Unterkapitel', 'uk_titel', 'z.B. Gleichungssysteme grafisch lösen', function() { return suggestUnterkapitel(buchInp.value.trim(), kapInp.value.trim()); });
  var seiteRow = fieldRow();
  sfld(seiteRow, 'Seite', 'seite', 'number', '');
  // Einzelaufgabe: Nr. direkt (data-key 'nr'). Gruppe: Oberaufgabennummer,
  // aus der beim Speichern je Teilaufgabe nr = Obernummer + Buchstabe wird.
  var parentNrInp = null;
  if (!isMulti) {
    sfld(seiteRow, 'Nr.', 'nr', 'text', 'z.B. 7a');
  } else {
    parentNrInp = document.createElement('input');
    parentNrInp.className = 'db-form-inp'; parentNrInp.type = 'text';
    parentNrInp.placeholder = 'z.B. 7'; parentNrInp.value = group.key || '';
    seiteRow.appendChild(labeled('Nr.', parentNrInp));
  }
  R0.appendChild(seiteRow);
  sec(R0, 'Einordnung');
  ssel(R0, 'Fach', 'fach', FAECHER.map(function(f) { return [f.key, f.icon + ' ' + f.label]; }));
  sfld(R0, 'Jahrgang', 'jahrgang', 'number', '5–10');
  ssel(R0, 'Inhaltstyp', 'typ', [['aufgabe','📝 Aufgabe'],['beispiel','📐 Beispiel'],['lehrtext','📖 Lehrtext']]);
  p0.appendChild(R0);

  var L0 = mkL();
  sec(L0, 'Aufgabe');
  var aufgTA = mkAutoTA(ref.aufgabenstellung, 'Gemeinsamer Text aller Teilaufgaben — leer lassen bei Einzelaufgaben');
  aufgTA.dataset.key = 'aufgabenstellung';
  L0.appendChild(labeled('Aufgabenstellung (gemeinsamer Obersatz)', aufgTA));
  if (isMulti) {
    sec(L0, 'Teilaufgaben');
    items.forEach(function(it, i) {
      // Eine Zeile: Buchstabe · Inhaltsfeld (nimmt Restbreite) · 📷 · 🗑
      var blk = mk('div', '');
      blk.style.cssText = 'display:flex;align-items:flex-start;gap:10px;'
        + 'padding:8px 0 12px;border-bottom:1px solid var(--bord);';

      var letter = tx('div', '', posLetter(i) + ')');
      letter.style.cssText = 'font-weight:800;font-size:19px;color:var(--pri);'
        + 'line-height:1;min-width:22px;flex-shrink:0;padding-top:7px;';
      blk.appendChild(letter);

      var ta = itemFields[i].inhalt;
      ta.style.flex = '1'; ta.style.minWidth = '0';
      blk.appendChild(ta);

      var icons = mk('div', '');
      icons.style.cssText = 'display:flex;gap:6px;flex-shrink:0;padding-top:4px;';
      icons.appendChild(abbBtn(i));       // 📷 Abbildung (ausgelagert ins Overlay)
      icons.appendChild(delItemBtn(i));
      blk.appendChild(icons);

      L0.appendChild(blk);
      itemNodes[i].push(blk);
    });
  } else {
    L0.appendChild(labeled('Inhalt / Aufgabe', itemFields[0].inhalt));
    L0.appendChild(labeled('📷 Abbildung', itemFields[0].abbildung));
  }
  // „+ Teilaufgabe"-Button (nur im Edit-Modus): aktuellen Stand in items[] sichern,
  // leere Teilaufgabe anhängen, Modal mit neuem items[] neu öffnen. Single wird so
  // zur Gruppe mit a/b. Speichern erkennt id-lose Items und insert sie als Sibling.
  if (mode !== 'create') {
    var addItemBtn = btn('+ Teilaufgabe hinzufügen', 'btn btn-ghost btn-sm');
    addItemBtn.style.cssText += 'align-self:flex-start;margin-top:4px;font-size:12px;';
    addItemBtn.onclick = function() {
      // Form-State je Teilaufgabe einsammeln (gelöschte überspringen)
      var snap = items.map(function(it, i) {
        if (removed[i]) return null;
        var f = itemFields[i];
        return Object.assign({}, it, {
          inhalt:        encode(f.inhalt.value),
          abbildung:     encode(f.abbildung.value),
          anforderung:   encode(f.anforderung.value),
          thema:         f.thema.value.trim() || null,
          niveau:        f.niveau.value || null,
          operator:      f.operator.value || null,
          schwierigkeit: f.schwierigkeit.value || null,
          umfang:        f.umfang.value || null,
          hat_loesung:   f.hat_loesung.checked
        });
      }).filter(Boolean);
      // Gemeinsame data-key-Felder einsammeln und auf alle Items anwenden
      var sharedSnap = {};
      tabWrap.querySelectorAll('[data-key]').forEach(function(el) {
        var k = el.dataset.key;
        if (el.type === 'number')          sharedSnap[k] = el.value !== '' ? Number(el.value) : null;
        else if (el.tagName === 'TEXTAREA') sharedSnap[k] = encode(el.value);
        else                                sharedSnap[k] = el.value.trim() || null;
      });
      // Oberaufgabennummer ermitteln: aus dem Gruppen-Feld (Multi) oder dem
      // nr-Feld (Single→Multi). Sie landet im Gruppen-Key, nicht auf den Items.
      var parentNrVal = parentNrInp ? parentNrInp.value.trim()
                      : (sharedSnap.nr != null ? String(sharedSnap.nr).trim() : (group.key || ''));
      delete sharedSnap.nr;
      snap = snap.map(function(it) { return Object.assign({}, it, sharedSnap); });
      // Leere neue Teilaufgabe anhängen (kein id → wird beim Speichern eingefügt)
      snap.push({ gruppen_key: ref.gruppen_key });
      var newGroup = Object.assign({}, group, {
        key: parentNrVal,
        items: snap,
        aufgabenstellung: sharedSnap.aufgabenstellung || group.aufgabenstellung
      });
      openTaskModal(newGroup, opts);
    };
    L0.appendChild(addItemBtn);
  }
  p0.appendChild(L0);
  tabBodyEl.appendChild(p0);

  // ── Pane 1: Unterrichtsdaten (pro Teilaufgabe) ────────────────
  var p1 = mk('div', 'db-modal-tab-pane ' + (isMulti ? 'scroll' : 'split')); panes.push(p1);
  if (isMulti) {
    items.forEach(function(it, i) {
      var blk = mk('div', 'db-group-item-block'); blk.appendChild(itemHeader(i));
      blk.appendChild(labeled('Anforderung', itemFields[i].anforderung));
      var row = fieldRow();
      row.appendChild(labeled('Thema', itemFields[i].thema));
      row.appendChild(labeled('Niveau', itemFields[i].niveau));
      blk.appendChild(row);
      p1.appendChild(blk);
      itemNodes[i].push(blk);
    });
  } else {
    var L1 = mkL();
    sec(L1, 'Anforderung');
    L1.appendChild(labeled('', itemFields[0].anforderung));
    L1.appendChild(labeled('Thema', itemFields[0].thema));
    p1.appendChild(L1);
    var R1 = mkR();
    sec(R1, 'Aufgabenniveau');
    R1.appendChild(labeled('', itemFields[0].niveau));
    p1.appendChild(R1);
  }
  tabBodyEl.appendChild(p1);

  // ── Pane 2: Prüfungsdaten (pro Teilaufgabe) ───────────────────
  var p2 = mk('div', 'db-modal-tab-pane ' + (isMulti ? 'scroll' : 'split')); panes.push(p2);
  if (isMulti) {
    items.forEach(function(it, i) {
      var blk = mk('div', 'db-group-item-block'); blk.appendChild(itemHeader(i));
      var row = fieldRow();
      row.appendChild(labeled('Operator', itemFields[i].operator));
      row.appendChild(labeled('Anforderungsbereich', itemFields[i].schwierigkeit));
      row.appendChild(labeled('Umfang', itemFields[i].umfang));
      row.appendChild(labeled('Mit Lösung', itemFields[i].hat_loesung));
      blk.appendChild(row);
      p2.appendChild(blk);
      itemNodes[i].push(blk);
    });
  } else {
    var L2 = mkL();
    if (ref.inhalt || ref.thema) {
      sec(L2, 'Aufgabe (Referenz)');
      var rt = tx('div', 'db-modal-text', (ref.inhalt || ref.thema || '').slice(0, 400) + ((ref.inhalt || '').length > 400 ? ' …' : ''));
      rt.style.color = 'var(--tx2)'; L2.appendChild(rt);
    }
    p2.appendChild(L2);
    var R2 = mkR();
    sec(R2, 'Klassifikation');
    R2.appendChild(labeled('Operator', itemFields[0].operator));
    R2.appendChild(labeled('Anforderungsbereich', itemFields[0].schwierigkeit));
    R2.appendChild(labeled('Umfang', itemFields[0].umfang));
    R2.appendChild(labeled('Mit Lösung', itemFields[0].hat_loesung));
    p2.appendChild(R2);
  }
  tabBodyEl.appendChild(p2);

  requestAnimationFrame(function() { _autoTas.forEach(autoResize); });
  modal.appendChild(tabWrap);

  // ── Footer ────────────────────────────────────────────────────
  // Primäraktionen links (gut erreichbar), Löschen rechts (destruktiv, aus dem Weg)
  var footer = mk('div', 'db-modal-footer');
  var saveBtn = btn('✓ Speichern', 'btn btn-sm');
  var cancelBtn = btn('Abbrechen', 'btn btn-ghost btn-sm'); cancelBtn.onclick = closeEntryModal;
  footer.appendChild(saveBtn);
  footer.appendChild(cancelBtn);
  saveBtn.onclick = async function() {
    // Gemeinsame Felder (data-key) sammeln
    var shared = {};
    tabWrap.querySelectorAll('[data-key]').forEach(function(el) {
      var k = el.dataset.key;
      if (el.type === 'number')          shared[k] = el.value !== '' ? Number(el.value) : null;
      else if (el.tagName === 'TEXTAREA') shared[k] = encode(el.value);
      else                                shared[k] = el.value.trim() || null;
    });
    function itemPatch(i) {
      var f = itemFields[i];
      var p = {
        inhalt:        encode(f.inhalt.value),
        abbildung:     encode(f.abbildung.value),
        anforderung:   encode(f.anforderung.value),
        thema:         f.thema.value.trim() || null,
        niveau:        f.niveau.value || null,
        operator:      f.operator.value || null,
        schwierigkeit: f.schwierigkeit.value || null,
        umfang:        f.umfang.value || null,
        hat_loesung:   f.hat_loesung.checked
      };
      // Teilaufgaben-Nr = Oberaufgabennummer + fortlaufender Buchstabe (1 + a → 1a)
      if (isMulti) {
        var pn = parentNrInp ? parentNrInp.value.trim() : '';
        p.nr = pn ? (pn + posLetter(i)) : null;
      }
      return p;
    }
    if (!isMulti) {
      var probe = Object.assign({}, shared, itemPatch(0));
      if (!probe.inhalt && !probe.thema) { alert('Inhalt oder Thema ist erforderlich.'); return; }
    }
    saveBtn.disabled = true; saveBtn.textContent = '⏳ Speichert…';
    try {
      if (mode === 'create') {
        var newRow = Object.assign({ id: 'db_' + Date.now() + '_' + Math.random().toString(36).slice(2), fach: DB.fach }, shared, itemPatch(0));
        await sbInsert('inhalte', [newRow]);
        closeEntryModal(); if (onDone) onDone(newRow);
      } else {
        await Promise.all(items.map(function(it, i) {
          if (removed[i]) return null;   // bereits gelöschte Teilaufgabe überspringen
          var patch = Object.assign({}, shared, itemPatch(i));
          if (it.id) return sbUpdate('inhalte', it.id, patch);
          // Neu hinzugefügte Teilaufgabe → Insert mit gruppen_key der Gruppe
          var newId = 'db_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6);
          var row = Object.assign({
            id: newId,
            fach: shared.fach || ref.fach || DB.fach,
            gruppen_key: it.gruppen_key || ref.gruppen_key
          }, patch);
          return sbInsert('inhalte', [row]);
        }));
        closeEntryModal(); if (onDone) onDone();
      }
    } catch(e) {
      alert('Fehler beim Speichern: ' + e.message);
      saveBtn.disabled = false; saveBtn.textContent = '✓ Speichern';
    }
  };
  // Löschen-Button rechts (komplette Aufgabe), nur im Edit-Modus
  if (mode !== 'create') {
    var delLabel = isMulti ? '🗑 ' + grpTypLabel(group) + ' komplett löschen' : '🗑 Löschen';
    var delBtn = btn(delLabel, 'btn btn-ghost btn-sm');
    delBtn.style.cssText += 'color:#ef4444;margin-left:auto;';
    delBtn.onclick = async function() {
      var msg = isMulti ? 'Alle ' + items.length + ' Einträge dieser Aufgabe löschen?' : 'Eintrag wirklich löschen?';
      if (!confirm(msg)) return;
      delBtn.disabled = true; delBtn.textContent = '⏳ Löscht…';
      try {
        await Promise.all(items.map(function(it) { return it.id ? sbDelete('inhalte', it.id) : null; }));
        closeEntryModal(); if (onDone) onDone();
      } catch(e) {
        alert('Fehler beim Löschen: ' + e.message);
        delBtn.disabled = false; delBtn.textContent = delLabel;
      }
    };
    footer.appendChild(delBtn);
  }
  modal.appendChild(footer);

  document.body.appendChild(overlay);
  function onEsc(e) { if (e.key === 'Escape') closeEntryModal(); }
  _modalEsc = onEsc;
  document.addEventListener('keydown', onEsc);
}

// ── Gruppen-Modal (alle Teilaufgaben einer Aufgabe) ───────────────
function openGroupModal(group, onRefresh) {
  openTaskModal(group, { mode: 'edit', onRefresh: onRefresh });
}

// ── Entry-Modal ───────────────────────────────────────────────────
var _modalOverlay = null;
var _modalEsc = null;

function closeEntryModal() {
  if (_modalOverlay) { _modalOverlay.remove(); _modalOverlay = null; }
  if (_modalEsc) { document.removeEventListener('keydown', _modalEsc); _modalEsc = null; }
}

function openEntryModal(entry, mode, onSaved) {
  var item = entry || {};
  var parentNr = item.nr ? String(item.nr).replace(/[a-zA-Z]+$/, '').trim() || String(item.nr) : '';
  openTaskModal(
    { key: parentNr, gruppen_key: item.gruppen_key, items: [item], aufgabenstellung: item.aufgabenstellung },
    { mode: mode || 'edit', onRefresh: onSaved }
  );
}


// ── Render ────────────────────────────────────────────────────────
function dbRender() {
  const oldTop = document.querySelector('.topbar');
  if (oldTop) oldTop.replaceWith(buildDBTopbar());

  const sb = document.getElementById('db-sidebar');
  if (sb) buildDBSidebar(sb);

  const content = document.getElementById('db-content');
  if (!content) return;
  content.innerHTML = '';

  if (DB.view === 'landing') {
    buildLanding(content);
  } else if (DB.view === 'import') {
    buildImportView(content);
  } else if (DB.view === 'fach') {
    buildFachView(content);
  } else if (DB.view === 'methoden') {
    content.appendChild(viewMethoden());
  } else if (DB.view === 'didaktik') {
    content.appendChild(viewDidaktik());
  }
}

// ── Init ──────────────────────────────────────────────────────────
(async function() {
  // S-Alias für methoden.js / didaktik.js (die schreiben S._xxx für State)
  S = DB;

  const root = document.getElementById('root');
  root.innerHTML = '';

  root.appendChild(buildDBTopbar());

  const app = mk('div', 'app');
  const sidebar = mk('div', 'sidebar');
  sidebar.id = 'db-sidebar';
  buildDBSidebar(sidebar);
  app.appendChild(sidebar);

  const content = mk('div', 'content');
  content.id = 'db-content';
  app.appendChild(content);

  root.appendChild(app);
  buildLanding(content);

  // Versions-Check (wie in app.js)
  var _dbStarted = Date.now();
  var _ghDate = null;
  async function checkDBVersion() {
    var v = await fetch('version.json', { cache: 'no-store' }).then(function(r) { return r.json(); }).catch(function() { return null; });
    if (!v) return;
    var prev = DB_VERSION_STATUS;
    DB_VERSION = v.built;
    if (_ghDate) DB_VERSION_STATUS = new Date(v.built) >= new Date(_ghDate) ? 'current' : 'deploying';
    if (prev === 'deploying' && DB_VERSION_STATUS === 'current' && Date.now() - _dbStarted > 10000) { location.reload(true); return; }
    var oldTop = document.querySelector('.topbar');
    if (oldTop) oldTop.replaceWith(buildDBTopbar());
    if (DB_VERSION_STATUS === 'deploying') setTimeout(checkDBVersion, 30000);
  }
  fetch('https://api.github.com/repos/tdlrhg/unterrichtsplaner/commits/main', { headers: { 'Accept': 'application/vnd.github.v3+json' } })
    .then(function(r) { return r.json(); }).catch(function() { return null; })
    .then(function(gh) { if (gh && gh.commit && gh.commit.committer) _ghDate = gh.commit.committer.date; checkDBVersion(); });

  // Alle Quelldaten laden, dann Regal einblenden
  function reloadLanding() {
    if (DB.view === 'landing') {
      var c = document.getElementById('db-content');
      if (c) { c.innerHTML = ''; buildLanding(c); }
    }
  }
  function dl(name) {
    return sbDownload(name).catch(function(err) {
      console.warn('[Datenbank] Regal-Daten konnten nicht geladen werden (' + name + '):', err);
      return null;
    });
  }
  Promise.all([
    dl('schulbuecher.json'),
    dl('methoden.json'),
    dl('didaktik-artikel.json'),
  ]).then(function(res) {
    if (Array.isArray(res[0])) SCHULBUCHDB = res[0];
    if (Array.isArray(res[1])) METHDB      = res[1];
    if (Array.isArray(res[2])) DIDARTDB    = res[2];
    // Regal: DB als einzige Wahrheitsquelle — nur Bücher MIT Einträgen anzeigen
    sbSelect('inhalte', { select: 'fach,buch', limit: 5000 }).then(function(rows) {
      // Alle (fach, buch)-Paare die wirklich Einträge haben
      var dbSet = {};
      rows.forEach(function(r) {
        if (r.buch && r.fach) dbSet[r.fach + '::' + r.buch] = { fach: r.fach, buch: r.buch };
      });

      // schulbuecher.json-Einträge: nur behalten wenn DB-Einträge vorhanden
      var merged = SCHULBUCHDB.filter(function(b) {
        return dbSet[b.fach + '::' + b.titel];
      });

      // DB-Bücher die nicht in schulbuecher.json sind → als Aufgabenpool hinzufügen
      Object.keys(dbSet).forEach(function(key) {
        var d = dbSet[key];
        var inJson = SCHULBUCHDB.some(function(b) { return b.fach === d.fach && b.titel === d.buch; });
        if (!inJson) merged.push({ fach: d.fach, titel: d.buch, typ: 'aufgabenpool', kapitel: [], jahrgang: null });
      });

      SCHULBUCHDB = merged;
      reloadLanding();
    }).catch(function() {});
  });
})();
