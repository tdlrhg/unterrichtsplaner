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
  homeRow.onclick = () => { DB.view = 'landing'; DB.fach = null; DB.buch = null; DB.herkunft = null; DB.operator = null; DB.schwierigkeit = null; DB.niveau = null; DB.typ = null; DB.umfang = null; DB.jahrgang = null; DB.suchtext = ''; DB.offset = 0; dbRender(); };
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
    row.onclick = () => { DB.view = 'fach'; DB.fach = f.key; DB.buch = null; DB.herkunft = null; DB.operator = null; DB.schwierigkeit = null; DB.niveau = null; DB.typ = null; DB.umfang = null; DB.jahrgang = null; DB.suchtext = ''; DB.offset = 0; dbRender(); };
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
    var key = (r.buch || '') + '|' + (r.seite != null ? r.seite : '') + '|' + parentNr;
    if (!groups[key]) { groups[key] = { key: parentNr, aufgabenstellung: null, items: [] }; order.push(key); }
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
  var buchList = document.createElement('datalist');
  buchList.id = 'imp-buch-list-' + Date.now();
  buchInp.setAttribute('list', buchList.id);
  document.body.appendChild(buchList);
  sbSelect('inhalte', { limit: 500, order: 'buch' }).then(function(rows) {
    var seen = {};
    rows.forEach(function(r) { if (r.buch && !seen[r.buch]) { seen[r.buch] = true; var o = document.createElement('option'); o.value = r.buch; buchList.appendChild(o); } });
  });
  var typSel  = fsel([['schulbuch','📖 Schulbuch'],['aufgabenpool','🗃 Aufgabenpool'],['sammlung','📋 Sammlung'],['eigenmaterial','📄 Eigenmaterial']]);
  var fachSel = fsel(FAECHER.map(function(f) { return [f.key, f.icon + ' ' + f.label]; }));
  var jgInp   = finp('z.B. 8'); jgInp.style.maxWidth = '80px';
  var kapInp   = finp('z.B. IV Flächen (optional)');
  var ukInp    = finp('z.B. Flächeninhalt berechnen (optional)');
  var seiteInp = finp('z.B. 142', 'number'); seiteInp.style.maxWidth = '110px';

  metaCard.appendChild(row2(fg('Buchtitel / Quelle', buchInp), fg('Typ', typSel)));
  metaCard.appendChild(row2(fg('Fach', fachSel), fg('Jahrgang', jgInp)));
  metaCard.appendChild(row2(fg('Kapitel', kapInp), fg('Unterkapitel', ukInp), fg('Erste Seite', seiteInp)));

  // Autocomplete für Kapitel und Unterkapitel (abhängig vom eingetragenen Buch)
  attachAutocomplete(kapInp, function() {
    var buch = buchInp.value.trim();
    if (!buch) return Promise.resolve([]);
    return sbSelect('inhalte', { select: 'kapitel', filters: { buch: buch }, limit: 1000 }).then(function(rows) {
      var seen = {}, kaps = [];
      rows.forEach(function(r) { if (r.kapitel && !seen[r.kapitel]) { seen[r.kapitel] = true; kaps.push(r.kapitel); } });
      return kaps.sort();
    });
  });
  attachAutocomplete(ukInp, function() {
    var buch = buchInp.value.trim();
    if (!buch) return Promise.resolve([]);
    var kap = kapInp.value.trim();
    return sbSelect('inhalte', { select: 'uk_titel', filters: Object.assign({ buch: buch }, kap ? { kapitel: kap } : {}), limit: 500 }).then(function(rows) {
      var seen = {}, uks = [];
      rows.forEach(function(r) { if (r.uk_titel && !seen[r.uk_titel]) { seen[r.uk_titel] = true; uks.push(r.uk_titel); } });
      return uks.sort();
    });
  });

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
    var herkunft = typSel.value === 'eigenmaterial' ? 'eigenmaterial' : 'schulbuch';
    var ts       = Date.now();

    var rows = _aufgaben.map(function(a, i) {
      return {
        id:           'db_' + ts + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
        fach:         fach,
        herkunft:     herkunft,
        buch:         buch || null,
        kapitel:      kap,
        uk_titel:     uk,
        seite:        seite,
        nr:           String(a.nr || (i + 1)),
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

// ── Autocomplete-Dropdown für Eingabefelder ───────────────────────
// Hängt ein Custom-Dropdown an ein <input>-Element.
// fetchFn() → Promise<string[]>  (wird beim ersten Öffnen einmal aufgerufen)
function attachAutocomplete(inp, fetchFn) {
  var allOptions = null;
  var fetching   = false;
  var dropdown   = null;

  function reposition() {
    if (!dropdown) return;
    var r = inp.getBoundingClientRect();
    dropdown.style.left  = r.left + 'px';
    dropdown.style.top   = (r.bottom + 2) + 'px';
    dropdown.style.width = Math.max(r.width, 160) + 'px';
  }

  function showDropdown(filter) {
    removeDropdown();
    var lower = (filter || '').toLowerCase();
    var opts = (allOptions || []).filter(function(o) {
      return !lower || o.toLowerCase().includes(lower);
    });
    if (!opts.length) return;

    dropdown = mk('div', '');
    dropdown.style.cssText = 'position:fixed;z-index:99999;background:var(--surf);'
      + 'border:1px solid var(--bord);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.22);'
      + 'max-height:220px;overflow-y:auto;';
    opts.forEach(function(o) {
      var item = tx('div', '', o);
      item.style.cssText = 'padding:7px 12px;font-size:13px;cursor:pointer;color:var(--tx1);'
        + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      item.onmouseenter = function() { item.style.background = 'var(--surf2)'; };
      item.onmouseleave = function() { item.style.background = ''; };
      item.onmousedown = function(e) {
        e.preventDefault();
        inp.value = o;
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        removeDropdown();
      };
      dropdown.appendChild(item);
    });
    document.body.appendChild(dropdown);
    reposition();
    // Schließen wenn Seite oder Modal gescrollt wird
    window.addEventListener('scroll', removeDropdown, { passive: true, capture: true });
  }

  function removeDropdown() {
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
      window.removeEventListener('scroll', removeDropdown, { capture: true });
    }
  }

  function fetchAndShow() {
    if (fetching) return;
    fetching = true;
    fetchFn().then(function(opts) {
      allOptions = opts;
      fetching = false;
      if (document.activeElement === inp) showDropdown(inp.value);
    }).catch(function() { fetching = false; });
  }

  inp.removeAttribute('list');

  inp.addEventListener('focus', function() {
    if (allOptions) showDropdown(inp.value);
    else fetchAndShow();
  });
  inp.addEventListener('input', function() {
    if (allOptions) showDropdown(inp.value);
    else fetchAndShow();
  });
  inp.addEventListener('blur', function() {
    setTimeout(removeDropdown, 150);
  });
  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { removeDropdown(); inp.blur(); }
    if (e.key === 'ArrowDown' && dropdown) {
      var first = dropdown.firstChild;
      if (first) { first.style.background = 'var(--surf2)'; first.focus && first.focus(); }
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
    if (DB.kapitel)       filters.kapitel       = DB.kapitel;
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

    var rows = await sbSelect('inhalte', {
      fts: DB.suchtext || null,
      filters,
      nullFilters: [],
      limit: LIMIT,
      offset: DB.offset,
      order: orderStr,
    }).catch(function() { return []; });

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
    else if (DB.herkunft === 'schulbuch') parts.push('Schulbuch');
    else if (DB.herkunft === 'eigenmaterial') parts.push('Eigenmaterial');
    if (DB.operator)      parts.push(DB.operator);
    if (DB.schwierigkeit) parts.push(DB.schwierigkeit);
    if (DB.niveau)        parts.push(DB.niveau);
    if (DB.umfang)        parts.push(DB.umfang);
    if (DB.kapitel)       parts.push(DB.kapitel);
    if (DB.uk_titel)      parts.push(DB.uk_titel);
    if (DB.typ)           parts.push(TYP_LABELS[DB.typ] || DB.typ);
    if (DB.seite != null) parts.push('S. ' + DB.seite);
    if (DB.suchtext)      parts.push('„' + DB.suchtext + '"');
    var suffix = parts.length ? ' · ' + parts.join(' · ') : '';
    if (rows.length >= LIMIT) {
      subT.textContent = 'Einträge werden gezählt…' + suffix;
      sbCount('inhalte', { filters }).then(function(total) {
        subT.textContent = (total != null ? total : rows.length + '+') + ' Einträge' + suffix;
      });
    } else {
      subT.textContent = rows.length + ' Einträge' + suffix;
    }

    if (!rows.length) {
      const e = tx('div', '', 'Keine Einträge gefunden.');
      e.style.cssText = 'padding:40px;text-align:center;color:var(--tx3);font-size:14px;';
      wrap.appendChild(e);
      return;
    }

    var groups = dbGroupByParent(rows);
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

      // Gruppenheader (klickbar → Gruppen-Modal)
      var ghdr = mk('div', '');
      ghdr.style.cssText = 'padding:4px 12px 2px;font-weight:700;font-size:12px;color:var(--tx2);letter-spacing:.02em;cursor:pointer;';
      // Wenn kein Seiten-Trenner aktiv (weil seite gefiltert oder null): Seite in Header anzeigen
      var showSeiteInHdr = DB.seite || !ref0 || ref0.seite == null;
      var hText = (showSeiteInHdr && ref0 && ref0.seite != null ? 'S. ' + ref0.seite + ' · ' : '') + 'Aufgabe ' + g.key;
      if (g.aufgabenstellung) hText += ' · ' + g.aufgabenstellung.slice(0, 90);
      ghdr.textContent = hText;
      ghdr.title = hasSubtasks ? 'Alle Teilaufgaben ansehen' : 'Aufgabe ansehen';
      ;(function(grp, sub) {
        ghdr.onclick = function() {
          if (sub) openGroupModal(grp, function() { load({ keepScroll: true }); });
          else openEntryModal(grp.items[0], 'view', function() { load({ keepScroll: true }); });
        };
      })(g, hasSubtasks);
      wrap.appendChild(ghdr);
      g.items.forEach(function(row) {
        var rowEl = renderRow(row, function() { load({ keepScroll: true }); }, true);
        rowEl.style.marginLeft = '16px';
        if (hasSubtasks) {
          rowEl.onclick = function() { openGroupModal(g, function() { DB.offset = 0; load(); }); };
        }
        wrap.appendChild(rowEl);
      });
    });

    if (rows.length === LIMIT) {
      const mehr = btn('Weitere ' + LIMIT + ' laden…', 'btn btn-ghost btn-sm');
      mehr.style.cssText = 'margin:8px auto;display:block;';
      mehr.onclick = function() { DB.offset += LIMIT; load(); };
      wrap.appendChild(mehr);
    }

    if (_savedScroll !== null) container.scrollTop = _savedScroll;
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
function renderRow(a, onSaved, compact) {
  const isSchulbuch = !a.herkunft || a.herkunft === 'schulbuch';
  const accentColor = isSchulbuch ? '#0f766e' : '#16a34a';

  const row = mk('div', 'db-row');
  row.style.background = SCHW_BG[a.schwierigkeit] || 'transparent';
  row.style.gridTemplateColumns = colTemplate();

  var cells = [];

  // Zelle 0: Quelle — im compact-Modus nur die Nr
  var src = mk('div', 'db-col-src'); src.dataset.colIdx = 0;
  if (compact) {
    var nrMatch = String(a.nr || '').match(/[a-zA-Z]+$/);
    if (nrMatch) {
      var nrEl = tx('div', '', nrMatch[0]);
      nrEl.style.cssText = 'font-weight:700;font-size:13px;color:var(--tx2);padding:2px 0;';
      src.appendChild(nrEl);
    }
  } else if (DB.buch && isSchulbuch) {
    // Buch ist bereits gefiltert — nur Seite zeigen
    var seiteEl = tx('div', 'db-kap-name', a.seite ? 'S. ' + a.seite : '–');
    seiteEl.style.fontSize = '13px';
    src.appendChild(seiteEl);
  } else {
    var hBadge = tx('div', 'db-herkunft-badge', isSchulbuch ? '📖 Schulbuch' : '📄 Eigenmaterial');
    hBadge.style.color = accentColor;
    src.appendChild(hBadge);
    if (isSchulbuch) {
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
  mid.appendChild(tx('div', 'db-inhalt-text', inhaltText.replace(/ \| /g, ' · ').slice(0, 150)));
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
  row.onclick = function() { openEntryModal(a, 'view', onSaved); };
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
    sbSelect('inhalte', { select: 'kapitel', filters: { fach: fach, buch: DB.buch }, limit: 1000 })
      .then(function(rows) {
        var seen = {}, kaps = [];
        rows.forEach(function(r) { if (r.kapitel && !seen[r.kapitel]) { seen[r.kapitel] = true; kaps.push(r.kapitel); } });
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
    sbSelect('inhalte', { select: 'uk_titel', filters: { fach: fach, buch: DB.buch, kapitel: DB.kapitel }, limit: 500 })
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

  // Eigenmaterial-Chip
  var emActive = DB.herkunft === 'eigenmaterial';
  var emChip = tx('div', 'db-fchip' + (emActive ? ' on' : ''), '📄 Eigenmaterial');
  if (emActive) emChip.style.cssText = 'background:#16a34a18;color:#16a34a;border-color:#16a34a60;';
  emChip.onclick = function() {
    DB.herkunft = emActive ? null : 'eigenmaterial';
    DB.buch = null;
    DB.offset = 0; refresh();
  };
  bar.appendChild(emChip);

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
      DB.buch = null; DB.herkunft = null; DB.schwierigkeit = null; DB.niveau = null; DB.typ = null; DB.umfang = null; DB.jahrgang = null; DB.kapitel = null; DB.uk_titel = null; DB.seite = null; DB.offset = 0;
      refresh();
    };
    bar.appendChild(clrBtn);
  }

  containerEl.appendChild(bar);
}

// ── Gruppen-Modal (alle Teilaufgaben einer Aufgabe) ───────────────
function openGroupModal(group, onRefresh) {
  closeEntryModal();
  var ref = group.items[0] || {};
  var overlay = mk('div', 'db-modal-overlay');
  overlay.onclick = function(e) { if (e.target === overlay) closeEntryModal(); };
  _modalOverlay = overlay;

  var modal = mk('div', 'db-modal');
  overlay.appendChild(modal);

  // Header
  var hdr = mk('div', 'db-modal-hdr');
  var hdrLeft = mk('div', '');
  hdrLeft.style.cssText = 'display:flex;align-items:center;gap:10px;flex:1;min-width:0;';
  var fi = fachInfo(ref.fach);
  hdrLeft.appendChild(tx('span', '', fi.icon));
  var tp = ['Aufgabe ' + group.key];
  if (ref.buch)  tp.push(ref.buch);
  if (ref.seite) tp.push('S. ' + ref.seite);
  hdrLeft.appendChild(tx('div', 'db-modal-title', tp.join(' · ')));
  hdr.appendChild(hdrLeft);
  var hdrRight = mk('div', '');
  hdrRight.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';
  var editAufgBtn = btn('✏️ Aufgabe bearbeiten', 'btn btn-sm');
  hdrRight.appendChild(editAufgBtn);
  var closeBtn = btn('✕', 'btn btn-ghost btn-sm');
  closeBtn.style.cssText += 'font-size:13px;padding:3px 8px;';
  closeBtn.onclick = closeEntryModal;
  hdrRight.appendChild(closeBtn);
  hdr.appendChild(hdrRight);
  modal.appendChild(hdr);

  // Gemeinsames Edit-Panel (zunächst versteckt)
  var sharedPanel = mk('div', '');
  sharedPanel.style.cssText = 'display:none;padding:16px 20px;border-bottom:1px solid var(--bord);background:var(--surf2);gap:12px;flex-direction:column;';

  function mkInp(labelTxt, key, placeholder) {
    var f = mk('div', 'db-form-field');
    var lbl = document.createElement('label'); lbl.textContent = labelTxt; f.appendChild(lbl);
    var inp = document.createElement('input');
    inp.className = 'db-form-inp'; inp.type = 'text';
    inp.placeholder = placeholder || ''; inp.value = ref[key] || '';
    inp.dataset.key = key; f.appendChild(inp); return f;
  }
  function mkTA(labelTxt, key, placeholder) {
    var f = mk('div', 'db-form-field');
    var lbl = document.createElement('label'); lbl.textContent = labelTxt; f.appendChild(lbl);
    var ta = document.createElement('textarea');
    ta.className = 'db-form-textarea'; ta.rows = 3;
    ta.placeholder = placeholder || ''; ta.value = ref[key] || '';
    ta.dataset.key = key; f.appendChild(ta); return f;
  }

  // Kapitel-Felder mit Autocomplete
  var kapF = mkInp('Kapitel', 'kapitel_titel', 'z.B. IV Lineare Gleichungssysteme');
  var kapInp = kapF.querySelector('input');
  if (ref.buch) {
    attachAutocomplete(kapInp, function() {
      return sbSelect('inhalte', { select: 'kapitel', filters: { buch: ref.buch }, limit: 1000 }).then(function(rows) {
        var seen = {}, kaps = [];
        rows.forEach(function(r) { if (r.kapitel && !seen[r.kapitel]) { seen[r.kapitel] = true; kaps.push(r.kapitel); } });
        return kaps.sort();
      });
    });
  }

  var ukF = mkInp('Unterkapitel', 'uk_titel', 'z.B. Gleichungssysteme grafisch lösen');
  var ukInp = ukF.querySelector('input');
  if (ref.buch) {
    attachAutocomplete(ukInp, function() {
      var kapVal = kapInp.value || ref.kapitel || ref.kapitel_titel;
      return sbSelect('inhalte', { select: 'uk_titel', filters: Object.assign({ buch: ref.buch }, kapVal ? { kapitel: kapVal } : {}), limit: 500 }).then(function(rows) {
        var seen = {}, uks = [];
        rows.forEach(function(r) { if (r.uk_titel && !seen[r.uk_titel]) { seen[r.uk_titel] = true; uks.push(r.uk_titel); } });
        return uks.sort();
      });
    });
  }

  var aufgF = mkTA('Aufgabenstellung', 'aufgabenstellung', 'Gemeinsamer Text aller Teilaufgaben');

  sharedPanel.appendChild(kapF);
  sharedPanel.appendChild(ukF);
  sharedPanel.appendChild(aufgF);

  // Speichern-Zeile
  var panelFooter = mk('div', '');
  panelFooter.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:4px;';
  var cancelPanelBtn = btn('Abbrechen', 'btn btn-ghost btn-sm');
  cancelPanelBtn.onclick = function() { sharedPanel.style.display = 'none'; editAufgBtn.textContent = '✏️ Aufgabe bearbeiten'; };
  var savePanelBtn = btn('✓ Für alle speichern', 'btn btn-sm');
  savePanelBtn.onclick = async function() {
    var patch = {};
    sharedPanel.querySelectorAll('[data-key]').forEach(function(el) {
      patch[el.dataset.key] = el.value.trim() || null;
    });
    savePanelBtn.disabled = true; savePanelBtn.textContent = '⏳';
    try {
      await Promise.all(group.items.map(function(item) { return sbUpdate('inhalte', item.id, patch); }));
      group.items.forEach(function(item) { Object.assign(item, patch); });
      // Anzeige aktualisieren
      closeEntryModal();
      if (onRefresh) onRefresh();
    } catch(e) {
      alert('Fehler: ' + e.message);
      savePanelBtn.disabled = false; savePanelBtn.textContent = '✓ Für alle speichern';
    }
  };
  panelFooter.appendChild(cancelPanelBtn);
  panelFooter.appendChild(savePanelBtn);
  sharedPanel.appendChild(panelFooter);
  modal.appendChild(sharedPanel);

  editAufgBtn.onclick = function() {
    var open = sharedPanel.style.display !== 'none';
    sharedPanel.style.display = open ? 'none' : 'flex';
    editAufgBtn.textContent = open ? '✏️ Aufgabe bearbeiten' : '✕ Abbrechen';
  };

  // Body
  var body = mk('div', 'db-modal-body');
  body.style.cssText = 'padding:0;display:block;overflow-y:auto;';

  // Aufgabenstellung (Lesemodus)
  var aufgst = group.aufgabenstellung || ref.aufgabenstellung;
  if (aufgst) {
    var stBlock = mk('div', '');
    stBlock.style.cssText = 'padding:16px 20px 12px;border-bottom:1px solid var(--sep);';
    stBlock.appendChild(tx('div', 'db-modal-section-title', 'Aufgabenstellung'));
    stBlock.appendChild(tx('div', 'db-modal-text', aufgst));
    body.appendChild(stBlock);
  }
  // Kapitel-Info (falls vorhanden)
  var kapInfo = ref.kapitel || ref.kapitel_titel;
  if (kapInfo || ref.uk_titel) {
    var kapBlock = mk('div', '');
    kapBlock.style.cssText = 'padding:8px 20px 10px;border-bottom:1px solid var(--sep);display:flex;gap:16px;flex-wrap:wrap;';
    if (kapInfo) {
      var ki = mk('div', '');
      ki.appendChild(tx('div', 'db-modal-field-label', 'Kapitel'));
      ki.appendChild(tx('div', 'db-modal-field-value', kapInfo));
      kapBlock.appendChild(ki);
    }
    if (ref.uk_titel) {
      var ui = mk('div', '');
      ui.appendChild(tx('div', 'db-modal-field-label', 'Unterkapitel'));
      ui.appendChild(tx('div', 'db-modal-field-value', ref.uk_titel));
      kapBlock.appendChild(ui);
    }
    body.appendChild(kapBlock);
  }

  // Teilaufgaben-Liste
  var list = mk('div', '');
  list.style.cssText = 'display:flex;flex-direction:column;gap:0;';
  group.items.forEach(function(item, idx) {
    var letter = String(item.nr || '').match(/[a-zA-Z]+$/) ? String(item.nr).match(/[a-zA-Z]+$/)[0] : (item.nr || '?');
    var card = mk('div', '');
    card.style.cssText = 'display:flex;align-items:flex-start;gap:12px;padding:12px 20px;'
      + (idx < group.items.length - 1 ? 'border-bottom:1px solid var(--sep);' : '');
    var letterEl = tx('div', '', letter);
    letterEl.style.cssText = 'font-weight:800;font-size:15px;color:var(--acc,#2563eb);min-width:20px;padding-top:1px;flex-shrink:0;';
    card.appendChild(letterEl);
    var cardMain = mk('div', '');
    cardMain.style.cssText = 'flex:1;min-width:0;';
    if (item.inhalt) {
      var inhEl = tx('div', '', item.inhalt);
      inhEl.style.cssText = 'font-size:13px;color:var(--tx1);line-height:1.5;';
      cardMain.appendChild(inhEl);
    }
    var chips = mk('div', '');
    chips.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;';
    if (item.operator)      chips.appendChild(tx('span', 'db-chip db-chip-op', item.operator));
    if (item.schwierigkeit) chips.appendChild(tx('span', 'db-chip db-chip-' + item.schwierigkeit, item.schwierigkeit));
    if (item.umfang)        chips.appendChild(tx('span', 'db-chip', item.umfang));
    if (chips.children.length) cardMain.appendChild(chips);
    card.appendChild(cardMain);
    var editBtn = btn('✏️', 'btn btn-ghost btn-sm');
    editBtn.title = 'Teilaufgabe ' + item.nr + ' bearbeiten';
    editBtn.style.cssText += 'flex-shrink:0;font-size:12px;padding:3px 7px;';
    editBtn.onclick = function() { openEntryModal(item, 'edit', onRefresh); };
    card.appendChild(editBtn);
    list.appendChild(card);
  });
  body.appendChild(list);
  modal.appendChild(body);
  document.body.appendChild(overlay);
}

// ── Entry-Modal ───────────────────────────────────────────────────
var _modalOverlay = null;

function closeEntryModal() {
  if (_modalOverlay) { _modalOverlay.remove(); _modalOverlay = null; }
}

function openEntryModal(entry, mode, onSaved) {
  closeEntryModal();
  const overlay = mk('div', 'db-modal-overlay');
  overlay.onclick = function(e) { if (e.target === overlay) closeEntryModal(); };
  _modalOverlay = overlay;

  const modal = mk('div', 'db-modal');
  overlay.appendChild(modal);

  function renderModal(curMode, curEntry) {
    modal.innerHTML = '';

    // Header
    const hdr = mk('div', 'db-modal-hdr');
    const hdrLeft = mk('div', '');
    hdrLeft.style.cssText = 'display:flex;align-items:center;gap:10px;flex:1;min-width:0;';
    if (curMode === 'view' && curEntry) {
      const fi = fachInfo(curEntry.fach);
      hdrLeft.appendChild(tx('span', '', fi.icon));
      var tp = [];
      if (curEntry.buch)  tp.push(curEntry.buch);
      if (curEntry.seite) tp.push('S. ' + curEntry.seite);
      if (curEntry.nr)    tp.push('Nr. ' + curEntry.nr);
      hdrLeft.appendChild(tx('div', 'db-modal-title', tp.join(' · ') || (curEntry.inhalt || '').slice(0, 70) || 'Eintrag'));
    } else {
      hdrLeft.appendChild(tx('div', 'db-modal-title', curMode === 'create' ? 'Neuer Eintrag' : 'Eintrag bearbeiten'));
    }
    hdr.appendChild(hdrLeft);

    const hdrRight = mk('div', '');
    hdrRight.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';
    if (curMode === 'view' && curEntry) {
      const editBtn = btn('✏️ Bearbeiten', 'btn btn-sm');
      editBtn.onclick = function() { renderModal('edit', curEntry); };
      hdrRight.appendChild(editBtn);
    }
    const closeBtn = btn('✕', 'btn btn-ghost btn-sm');
    closeBtn.style.cssText += 'font-size:13px;padding:3px 8px;';
    closeBtn.onclick = closeEntryModal;
    hdrRight.appendChild(closeBtn);
    hdr.appendChild(hdrRight);
    modal.appendChild(hdr);

    // Body
    const bodyResult = buildModalBody(curEntry || {}, curMode !== 'view');
    modal.appendChild(bodyResult.bodyEl);

    if (curMode !== 'view') {
      const result = bodyResult; // getData() ist in bodyResult

      // Footer
      const footer = mk('div', 'db-modal-footer');
      if (curMode === 'edit' && curEntry && curEntry.id) {
        const delBtn = btn('🗑 Löschen', 'btn btn-ghost btn-sm');
        delBtn.style.color = '#ef4444';
        delBtn.onclick = async function() {
          if (!confirm('Eintrag wirklich löschen?')) return;
          delBtn.disabled = true; delBtn.textContent = '⏳';
          try {
            await sbDelete('inhalte', curEntry.id);
            closeEntryModal();
            if (onSaved) onSaved();
          } catch(e) {
            alert('Fehler: ' + e.message);
            delBtn.disabled = false; delBtn.textContent = '🗑 Löschen';
          }
        };
        footer.appendChild(delBtn);
      }
      const right = mk('div', '');
      right.style.cssText = 'display:flex;gap:8px;margin-left:auto;';
      const cancelBtn = btn('Abbrechen', 'btn btn-ghost btn-sm');
      cancelBtn.onclick = function() {
        if (curMode === 'create') closeEntryModal();
        else renderModal('view', curEntry);
      };
      right.appendChild(cancelBtn);
      const saveBtn = btn('✓ Speichern', 'btn btn-sm');
      saveBtn.onclick = async function() {
        const data = result.getData();
        if (!data.inhalt && !data.thema) { alert('Inhalt oder Thema ist erforderlich.'); return; }
        saveBtn.disabled = true; saveBtn.textContent = '⏳ Speichert…';
        try {
          let saved;
          if (curMode === 'create') {
            const newRow = Object.assign({ id: 'db_' + Date.now() + '_' + Math.random().toString(36).slice(2), fach: DB.fach }, data);
            await sbInsert('inhalte', [newRow]);
            saved = newRow;
          } else {
            saved = await sbUpdate('inhalte', curEntry.id, data);
            if (!saved) saved = Object.assign({}, curEntry, data);
            // Strukturfelder auf alle Geschwister übertragen (aufgabenstellung, kapitel, uk_titel)
            var strukturChanged = data.aufgabenstellung != null || data.kapitel_titel != null || data.uk_titel != null;
            if (strukturChanged && curEntry.buch && curEntry.seite != null) {
              var parentNr = parseNr(curEntry.nr)[0];
              sbSelect('inhalte', { filters: { fach: curEntry.fach, buch: curEntry.buch, seite: curEntry.seite }, limit: 50 })
                .then(function(siblings) {
                  siblings.forEach(function(s) {
                    if (s.id === curEntry.id) return;
                    var sParent = parseNr(s.nr)[0];
                    if (sParent !== parentNr) return;
                    var patch = {};
                    if (data.aufgabenstellung != null && s.aufgabenstellung !== data.aufgabenstellung)
                      patch.aufgabenstellung = data.aufgabenstellung;
                    if (data.kapitel_titel != null && s.kapitel_titel !== data.kapitel_titel)
                      patch.kapitel_titel = data.kapitel_titel;
                    if (data.uk_titel != null && s.uk_titel !== data.uk_titel)
                      patch.uk_titel = data.uk_titel;
                    if (Object.keys(patch).length) sbUpdate('inhalte', s.id, patch);
                  });
                });
            }
          }
          closeEntryModal();
          if (onSaved) onSaved(saved);
        } catch(e) {
          alert('Fehler beim Speichern: ' + e.message);
          saveBtn.disabled = false; saveBtn.textContent = '✓ Speichern';
        }
      };
      right.appendChild(saveBtn);
      footer.appendChild(right);
      modal.appendChild(footer);
    }
  }

  renderModal(mode, entry);
  document.body.appendChild(overlay);

  function onEsc(e) { if (e.key === 'Escape') { closeEntryModal(); document.removeEventListener('keydown', onEsc); } }
  document.addEventListener('keydown', onEsc);
}

// ── Modal: kombinierter Ansichts-/Bearbeitungs-Body ──────────────
// editable=false → Lesemodus  |  editable=true → Eingabefelder inline
function buildModalBody(a, editable) {
  const wrap = mk('div', 'db-modal-tabwrap');

  const tabbar = mk('div', 'db-modal-tabbar');
  const tabs = [], panes = [];
  ['📋 Grunddaten', '📚 Unterrichtsdaten', '✏️ Prüfungsdaten'].forEach(function(label, idx) {
    const tab = document.createElement('button');
    tab.className = 'db-modal-tab' + (idx === 0 ? ' active' : '');
    tab.textContent = label;
    tab.onclick = function() {
      tabs.forEach(function(t, i) { t.classList.toggle('active', i === idx); });
      panes.forEach(function(p, i) { p.classList.toggle('active', i === idx); });
    };
    tabs.push(tab); tabbar.appendChild(tab);
  });
  wrap.appendChild(tabbar);
  const tabBody = mk('div', 'db-modal-tab-body');
  wrap.appendChild(tabBody);

  // Layout-Helfer
  function mkL() { return mk('div', 'db-modal-left'); }
  function mkR() { return mk('div', 'db-modal-right'); }
  function sec(parent, title) { parent.appendChild(tx('div', 'db-modal-section-title', title)); }

  // Lesemodus-Felder
  function vfld(parent, label, val, chip) {
    const f = mk('div', 'db-modal-field');
    f.appendChild(tx('div', 'db-modal-field-label', label));
    if (chip) f.appendChild(chip);
    else f.appendChild(tx('div', 'db-modal-field-value', val != null ? String(val) : '–'));
    parent.appendChild(f);
  }
  function vempty(parent, text) {
    const d = tx('div', 'db-modal-text', text); d.style.color = 'var(--tx3)'; parent.appendChild(d);
  }

  // Eingabefelder
  function efld(parent, label, key, type, placeholder) {
    const f = mk('div', 'db-form-field');
    if (label) { const lbl = document.createElement('label'); lbl.textContent = label; f.appendChild(lbl); }
    const inp = document.createElement('input');
    inp.className = 'db-form-inp'; inp.type = type || 'text';
    inp.placeholder = placeholder || ''; inp.value = a[key] != null ? String(a[key]) : '';
    inp.dataset.key = key; f.appendChild(inp); parent.appendChild(f); return f;
  }
  function etarea(parent, label, key, rows, placeholder) {
    const f = mk('div', 'db-form-field');
    if (label) { const lbl = document.createElement('label'); lbl.textContent = label; f.appendChild(lbl); }
    const ta = document.createElement('textarea');
    ta.className = 'db-form-textarea'; ta.rows = rows || 4;
    ta.placeholder = placeholder || ''; ta.value = (a[key] || '').replace(/ \| /g, '\n');
    ta.dataset.key = key; f.appendChild(ta); parent.appendChild(f); return f;
  }
  // Eingabefeld mit Autocomplete-Dropdown
  function efldSuggest(parent, label, key, placeholder, fetchFn) {
    const f = mk('div', 'db-form-field');
    if (label) { const lbl = document.createElement('label'); lbl.textContent = label; f.appendChild(lbl); }
    const inp = document.createElement('input');
    inp.className = 'db-form-inp'; inp.type = 'text';
    inp.placeholder = placeholder || ''; inp.value = a[key] != null ? String(a[key]) : '';
    inp.dataset.key = key;
    f.appendChild(inp); parent.appendChild(f);
    if (fetchFn) attachAutocomplete(inp, fetchFn);
    return { f, inp };
  }

  function esel(parent, label, key, opts) {
    const f = mk('div', 'db-form-field');
    if (label) { const lbl = document.createElement('label'); lbl.textContent = label; f.appendChild(lbl); }
    const sel = document.createElement('select');
    sel.className = 'db-form-sel'; sel.dataset.key = key;
    [['', '–']].concat(opts).forEach(function(opt) {
      const o = document.createElement('option');
      o.value = opt[0]; o.textContent = opt[1];
      if (String(a[key] || '') === opt[0]) o.selected = true;
      sel.appendChild(o);
    });
    f.appendChild(sel); parent.appendChild(f); return f;
  }

  // ── Pane 0: Grunddaten ────────────────────────────────────────
  var p0 = mk('div', 'db-modal-tab-pane split active');
  panes.push(p0);
  {
    const R = mkR(); // linke Spalte 300px – Metadaten
    sec(R, 'Quelle');
    if (editable) {
      esel(R, 'Herkunft', 'herkunft', [['schulbuch','📖 Schulbuch'],['eigenmaterial','📄 Eigenmaterial']]);
      efld(R, 'Buch / Titel', 'buch', 'text', 'z.B. Lambacher Schweizer 7');
      var kapResult = efldSuggest(R, 'Kapitel', 'kapitel_titel', 'z.B. IV Lineare Gleichungssysteme',
        function() {
          if (!a.buch) return Promise.resolve([]);
          return sbSelect('inhalte', { select: 'kapitel', filters: { buch: a.buch }, limit: 1000 })
            .then(function(rows) {
              var seen = {}, kaps = [];
              rows.forEach(function(r) { if (r.kapitel && !seen[r.kapitel]) { seen[r.kapitel] = true; kaps.push(r.kapitel); } });
              return kaps.sort();
            });
        });
      efldSuggest(R, 'Unterkapitel', 'uk_titel', 'z.B. Gleichungssysteme grafisch lösen',
        function() {
          if (!a.buch) return Promise.resolve([]);
          var kapVal = kapResult.inp.value || a.kapitel || a.kapitel_titel;
          return sbSelect('inhalte', { select: 'uk_titel', filters: Object.assign({ buch: a.buch }, kapVal ? { kapitel: kapVal } : {}), limit: 500 })
            .then(function(rows) {
              var seen = {}, uks = [];
              rows.forEach(function(r) { if (r.uk_titel && !seen[r.uk_titel]) { seen[r.uk_titel] = true; uks.push(r.uk_titel); } });
              return uks.sort();
            });
        });
      const seiteNr = mk('div', 'db-form-row');
      efld(seiteNr, 'Seite', 'seite', 'number', ''); efld(seiteNr, 'Nr.', 'nr', 'text', 'z.B. 7a');
      R.appendChild(seiteNr);
    } else {
      vfld(R, 'Herkunft', (!a.herkunft || a.herkunft === 'schulbuch') ? '📖 Schulbuch' : '📄 Eigenmaterial');
      if (a.buch)                        vfld(R, 'Buch', a.buch);
      if (a.kapitel || a.kapitel_titel)  vfld(R, 'Kapitel', a.kapitel || a.kapitel_titel);
      if (a.uk_titel)                    vfld(R, 'Unterkapitel', a.uk_titel);
      if (a.seite != null)               vfld(R, 'Seite', a.seite);
      if (a.nr)                          vfld(R, 'Nr.', a.nr);
    }
    sec(R, 'Einordnung');
    if (editable) {
      esel(R, 'Fach', 'fach', FAECHER.map(function(f) { return [f.key, f.icon + ' ' + f.label]; }));
      efld(R, 'Jahrgang', 'jahrgang', 'number', '5–10');
      esel(R, 'Inhaltstyp', 'typ', [['aufgabe','📝 Aufgabe'],['beispiel','📐 Beispiel'],['lehrtext','📖 Lehrtext']]);
    } else {
      var fi = fachInfo(a.fach);
      vfld(R, 'Fach', fi.icon + ' ' + fi.label);
      if (a.jahrgang) vfld(R, 'Jahrgang', 'Klasse ' + a.jahrgang);
      if (a.typ && a.typ !== 'aufgabe') {
        var typLabelEl = (TYP_ICONS[a.typ] ? TYP_ICONS[a.typ] + ' ' : '') + (TYP_LABELS[a.typ] || a.typ);
        vfld(R, 'Inhaltstyp', null, mkChip(typLabelEl, TYP_FARBEN[a.typ] || '#64748b'));
      }
    }
    p0.appendChild(R);

    const L = mkL(); // rechte Spalte 1fr – Aufgabentext
    if (editable) {
      sec(L, 'Aufgabe');
      etarea(L, 'Aufgabenstellung (gemeinsamer Obersatz)', 'aufgabenstellung', 2, 'Gemeinsamer Text aller Teilaufgaben — leer lassen bei Einzelaufgaben');
      etarea(L, 'Inhalt / Teilaufgabe', 'inhalt', 6, 'Was steht in der Aufgabe?');
    } else {
      if (a.aufgabenstellung) {
        sec(L, 'Aufgabenstellung');
        L.appendChild(tx('div', 'db-modal-text', a.aufgabenstellung));
      }
      sec(L, a.aufgabenstellung ? 'Teilaufgabe' : 'Inhalt / Aufgabe');
      if (a.inhalt) L.appendChild(tx('div', 'db-modal-text', a.inhalt.replace(/ \| /g, '\n')));
      else vempty(L, '(Kein Inhalt hinterlegt)');
    }
    p0.appendChild(L);
  }
  tabBody.appendChild(p0);

  // ── Pane 1: Unterrichtsdaten ──────────────────────────────────
  var p1 = mk('div', 'db-modal-tab-pane split');
  panes.push(p1);
  {
    const L = mkL();
    sec(L, 'Anforderung');
    if (editable) {
      etarea(L, '', 'anforderung', 5, 'Was sollen Schülerinnen konkret tun?');
      efld(L, 'Thema', 'thema', 'text', 'z.B. Gleichsetzungsverfahren');
    } else {
      if (a.anforderung) L.appendChild(tx('div', 'db-modal-text db-modal-anforderung', a.anforderung));
      else vempty(L, '(Noch keine Anforderung hinterlegt)');
      if (a.thema) { sec(L, 'Thema'); L.appendChild(tx('div', 'db-modal-text', a.thema)); }
    }
    p1.appendChild(L);

    const R = mkR();
    sec(R, 'Aufgabenniveau');
    if (editable) {
      esel(R, '', 'niveau', [['leicht','▽ leicht'],['mittel','▾ mittel'],['schwer','▼ schwer']]);
    } else {
      if (a.niveau) vfld(R, 'Niveau', null, mkChip(a.niveau, NIVEAU_FARBEN[a.niveau] || '#64748b', NIVEAU_ICONS[a.niveau]));
      else vempty(R, '(Noch kein Niveau eingetragen)');
    }
    var hasKomp = a.kompetenzen && a.kompetenzen.length;
    if (!editable) {
      if (hasKomp) {
        sec(R, 'Kompetenzen');
        const chips = mk('div', ''); chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
        (Array.isArray(a.kompetenzen) ? a.kompetenzen : [a.kompetenzen]).forEach(function(k) { chips.appendChild(mkChip(k, '#6d28d9')); });
        R.appendChild(chips);
      }
      if (a.inhaltsfeld) { sec(R, 'Inhaltsfeld'); vfld(R, 'Inhaltsfeld', a.inhaltsfeld); }
    }
    p1.appendChild(R);
  }
  tabBody.appendChild(p1);

  // ── Pane 2: Prüfungsdaten ─────────────────────────────────────
  var p2 = mk('div', 'db-modal-tab-pane split');
  panes.push(p2);
  {
    const L = mkL();
    if (a.inhalt || a.thema) {
      sec(L, 'Aufgabe (Referenz)');
      var refText = tx('div', 'db-modal-text', (a.inhalt || a.thema || '').slice(0, 400) + ((a.inhalt || '').length > 400 ? ' …' : ''));
      refText.style.color = 'var(--tx2)'; L.appendChild(refText);
    }
    p2.appendChild(L);

    const R = mkR();
    sec(R, 'Klassifikation');
    if (editable) {
      esel(R, 'Operator', 'operator', Object.keys(OP_FARBEN2).map(function(k) { return [k, k]; }));
      esel(R, 'Anforderungsbereich', 'schwierigkeit', [['grundlegend','○ grundlegend (AFB I)'],['standard','◑ standard (AFB II)'],['anspruchsvoll','● anspruchsvoll (AFB III)']]);
      esel(R, 'Umfang', 'umfang', [['kurz','kurz (1–2 min)'],['mittel','mittel (3–7 min)'],['lang','lang (8+ min)']]);
      const loesW = mk('div', 'db-form-field');
      const loesLbl = document.createElement('label'); loesLbl.textContent = 'Mit Lösung'; loesW.appendChild(loesLbl);
      const loesChk = document.createElement('input');
      loesChk.type = 'checkbox'; loesChk.dataset.key = 'hat_loesung';
      loesChk.checked = !!a.hat_loesung;
      loesChk.style.cssText = 'width:16px;height:16px;cursor:pointer;accent-color:var(--pri);margin-top:4px;';
      loesW.appendChild(loesChk); R.appendChild(loesW);
    } else {
      if (a.operator)      vfld(R, 'Operator',            null, mkChip(a.operator, opColor(a.operator)));
      if (a.schwierigkeit) vfld(R, 'Anforderungsbereich', null, mkChip(a.schwierigkeit, SCHW_FARBEN[a.schwierigkeit] || '#64748b', SCHW_ICONS[a.schwierigkeit]));
      if (a.umfang)        vfld(R, 'Umfang', a.umfang);
      if (a.hat_loesung != null) vfld(R, 'Lösung', a.hat_loesung ? '✓ vorhanden' : '✗ ohne');
      if (!a.operator && !a.schwierigkeit && !a.umfang && a.hat_loesung == null) vempty(R, '(Noch keine Prüfungsdaten hinterlegt)');
    }
    p2.appendChild(R);
  }
  tabBody.appendChild(p2);

  function getData() {
    const data = {};
    wrap.querySelectorAll('[data-key]').forEach(function(el) {
      const k = el.dataset.key;
      if (el.type === 'checkbox') data[k] = el.checked;
      else if (el.type === 'number') data[k] = el.value !== '' ? Number(el.value) : null;
      else if (el.tagName === 'TEXTAREA') data[k] = el.value.replace(/\r?\n/g, ' | ').replace(/ \|  \| /g, ' | ').trim() || null;
      else data[k] = el.value.trim() || null;
    });
    return data;
  }

  return { bodyEl: wrap, getData };
}

// ── (buildModalViewBody – ersetzt durch buildModalBody oben) ──────
function buildModalViewBody(a) {
  const wrap = mk('div', 'db-modal-tabwrap');

  // ── Tab-Leiste ────────────────────────────────────────────────
  const tabbar = mk('div', 'db-modal-tabbar');
  const tabs = [], panes = [];

  [
    { label: '📋 Grunddaten' },
    { label: '📚 Unterrichtsdaten' },
    { label: '✏️ Prüfungsdaten' },
  ].forEach(function(def, idx) {
    const tab = document.createElement('button');
    tab.className = 'db-modal-tab' + (idx === 0 ? ' active' : '');
    tab.textContent = def.label;
    tab.onclick = function() {
      tabs.forEach(function(t, i) { t.classList.toggle('active', i === idx); });
      panes.forEach(function(p, i) { p.classList.toggle('active', i === idx); });
    };
    tabs.push(tab);
    tabbar.appendChild(tab);
  });
  wrap.appendChild(tabbar);

  const tabBody = mk('div', 'db-modal-tab-body');
  wrap.appendChild(tabBody);

  // Shared helpers
  function mkL() { return mk('div', 'db-modal-left'); }
  function mkR() { return mk('div', 'db-modal-right'); }
  function sec(parent, title) { parent.appendChild(tx('div', 'db-modal-section-title', title)); }
  function fld(parent, label, val, chip) {
    const f = mk('div', 'db-modal-field');
    f.appendChild(tx('div', 'db-modal-field-label', label));
    if (chip) f.appendChild(chip);
    else f.appendChild(tx('div', 'db-modal-field-value', val != null ? String(val) : '–'));
    parent.appendChild(f);
  }
  function empty(parent, text) {
    const d = tx('div', 'db-modal-text', text);
    d.style.color = 'var(--tx3)';
    parent.appendChild(d);
  }

  // ── Pane 0: Grunddaten ────────────────────────────────────────
  var p0 = mk('div', 'db-modal-tab-pane split active');
  panes.push(p0);
  {
    const R = mkR();
    sec(R, 'Quelle');
    fld(R, 'Herkunft', (!a.herkunft || a.herkunft === 'schulbuch') ? '📖 Schulbuch' : '📄 Eigenmaterial');
    if (a.buch)                        fld(R, 'Buch', a.buch);
    if (a.kapitel || a.kapitel_titel)  fld(R, 'Kapitel', a.kapitel || a.kapitel_titel);
    if (a.uk_titel)                    fld(R, 'Unterkapitel', a.uk_titel);
    if (a.seite != null)               fld(R, 'Seite', a.seite);
    if (a.nr)                          fld(R, 'Nr.', a.nr);
    sec(R, 'Einordnung');
    if (a.thema)    fld(R, 'Thema', a.thema);
    var fi = fachInfo(a.fach);
    fld(R, 'Fach', fi.icon + ' ' + fi.label);
    if (a.jahrgang) fld(R, 'Jahrgang', 'Klasse ' + a.jahrgang);
    if (a.typ)      fld(R, 'Typ', a.typ);
    p0.appendChild(R);

    const L = mkL();
    if (a.inhalt) {
      sec(L, 'Inhalt / Aufgabe');
      L.appendChild(tx('div', 'db-modal-text', a.inhalt));
    }
    if (a.thema && a.thema !== a.inhalt) {
      sec(L, 'Thema');
      L.appendChild(tx('div', 'db-modal-text', a.thema));
    }
    if (!a.inhalt && !a.thema) empty(L, '(Kein Inhalt hinterlegt)');
    p0.appendChild(L);
  }
  tabBody.appendChild(p0);

  // ── Pane 1: Unterrichtsdaten ──────────────────────────────────
  var p1 = mk('div', 'db-modal-tab-pane split');
  panes.push(p1);
  {
    const L = mkL();
    sec(L, 'Anforderung');
    if (a.anforderung) {
      L.appendChild(tx('div', 'db-modal-text db-modal-anforderung', a.anforderung));
    } else {
      empty(L, '(Noch keine Anforderung hinterlegt)');
    }
    p1.appendChild(L);

    const R = mkR();
    var hasKomp = a.kompetenzen && a.kompetenzen.length;
    if (hasKomp) {
      sec(R, 'Kompetenzen');
      const chips = mk('div', '');
      chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
      (Array.isArray(a.kompetenzen) ? a.kompetenzen : [a.kompetenzen]).forEach(function(k) {
        chips.appendChild(mkChip(k, '#6d28d9'));
      });
      R.appendChild(chips);
    }
    if (a.inhaltsfeld) {
      sec(R, 'Inhaltsfeld');
      fld(R, 'Inhaltsfeld', a.inhaltsfeld);
    }
    if (!hasKomp && !a.inhaltsfeld) {
      empty(R, '(Noch keine Unterrichtsdaten hinterlegt)');
    }
    p1.appendChild(R);
  }
  tabBody.appendChild(p1);

  // ── Pane 2: Prüfungsdaten ─────────────────────────────────────
  var p2 = mk('div', 'db-modal-tab-pane split');
  panes.push(p2);
  {
    const L = mkL();
    if (a.inhalt || a.thema) {
      sec(L, 'Aufgabe (Referenz)');
      var refText = tx('div', 'db-modal-text', (a.inhalt || a.thema || '').slice(0, 400) + ((a.inhalt || '').length > 400 ? ' …' : ''));
      refText.style.color = 'var(--tx2)';
      L.appendChild(refText);
    }
    p2.appendChild(L);

    const R = mkR();
    sec(R, 'Klassifikation');
    if (a.operator)      fld(R, 'Operator',      null, mkChip(a.operator, opColor(a.operator)));
    if (a.schwierigkeit) fld(R, 'Schwierigkeit', null, mkChip(a.schwierigkeit, SCHW_FARBEN[a.schwierigkeit] || '#64748b', SCHW_ICONS[a.schwierigkeit]));
    if (a.umfang)        fld(R, 'Umfang', a.umfang);
    if (a.hat_loesung != null) fld(R, 'Lösung', a.hat_loesung ? '✓ vorhanden' : '✗ ohne');
    if (!a.operator && !a.schwierigkeit && !a.umfang && a.hat_loesung == null) {
      empty(R, '(Noch keine Prüfungsdaten hinterlegt)');
    }
    p2.appendChild(R);
  }
  tabBody.appendChild(p2);

  return wrap;
}

// ── Modal: Formular ───────────────────────────────────────────────
function buildModalForm(a, mode) {
  const body = mk('div', 'db-modal-body db-modal-form');

  // Links: Textfelder
  const left = mk('div', 'db-modal-left');

  function fldTextarea(label, key, placeholder, rows) {
    const w = mk('div', 'db-form-field');
    const lbl = document.createElement('label'); lbl.textContent = label;
    w.appendChild(lbl);
    const ta = document.createElement('textarea');
    ta.className = 'db-form-textarea'; ta.rows = rows || 5;
    ta.placeholder = placeholder || ''; ta.value = (a[key] || '').replace(/ \| /g, '\n');
    ta.dataset.key = key;
    w.appendChild(ta);
    return w;
  }

  function fldInp(label, key, placeholder, type) {
    const w = mk('div', 'db-form-field');
    const lbl = document.createElement('label'); lbl.textContent = label;
    w.appendChild(lbl);
    const inp = document.createElement('input');
    inp.className = 'db-form-inp'; inp.type = type || 'text';
    inp.placeholder = placeholder || ''; inp.value = a[key] != null ? a[key] : '';
    inp.dataset.key = key;
    w.appendChild(inp);
    return w;
  }

  left.appendChild(fldTextarea('Aufgabenstellung (gemeinsamer Obersatz)', 'aufgabenstellung', 'Gemeinsamer Text aller Teilaufgaben — leer lassen bei Einzelaufgaben', 2));
  left.appendChild(fldTextarea('Inhalt / Teilaufgabe', 'inhalt', 'Was steht in der Aufgabe?', 5));
  left.appendChild(fldTextarea('Anforderung', 'anforderung', 'Was sollen Schülerinnen konkret tun?', 3));
  left.appendChild(fldInp('Thema', 'thema', 'z.B. Gleichsetzungsverfahren'));

  // Rechts: Metadaten (wird zuerst ins DOM eingefügt → linke Spalte in 300px|1fr Grid)
  const right = mk('div', 'db-modal-right');

  function fldSel(label, key, opts) {
    const w = mk('div', 'db-form-field');
    const lbl = document.createElement('label'); lbl.textContent = label;
    w.appendChild(lbl);
    const sel = document.createElement('select');
    sel.className = 'db-form-sel'; sel.dataset.key = key;
    [['', '–']].concat(opts).forEach(function(opt) {
      const o = document.createElement('option');
      o.value = opt[0]; o.textContent = opt[1];
      if (String(a[key] || '') === opt[0]) o.selected = true;
      sel.appendChild(o);
    });
    w.appendChild(sel);
    return w;
  }

  // Quelle
  right.appendChild(tx('div', 'db-form-section-title', 'Quelle'));
  right.appendChild(fldSel('Herkunft', 'herkunft', [['schulbuch','📖 Schulbuch'],['eigenmaterial','📄 Eigenmaterial']]));
  right.appendChild(fldInp('Buch / Titel', 'buch', 'z.B. Lambacher Schweizer 7'));
  right.appendChild(fldInp('Kapitel', 'kapitel_titel', 'z.B. Lineare Gleichungssysteme'));

  const seiteNr = mk('div', 'db-form-row');
  seiteNr.appendChild(fldInp('Seite', 'seite', '', 'number'));
  seiteNr.appendChild(fldInp('Nr.', 'nr', 'z.B. 7a'));
  right.appendChild(seiteNr);

  // Klassifizierung
  right.appendChild(tx('div', 'db-form-section-title', 'Klassifizierung'));
  right.appendChild(fldSel('Fach', 'fach', FAECHER.map(function(f) { return [f.key, f.icon + ' ' + f.label]; })));
  right.appendChild(fldInp('Jahrgang', 'jahrgang', '5–10', 'number'));
  right.appendChild(fldSel('Operator', 'operator', Object.keys(OP_FARBEN2).map(function(k) { return [k, k]; })));
  right.appendChild(fldSel('Schwierigkeit', 'schwierigkeit', [['grundlegend','○ grundlegend'],['standard','◑ standard'],['anspruchsvoll','● anspruchsvoll']]));
  right.appendChild(fldSel('Umfang', 'umfang', [['kurz','kurz (1–2 min)'],['mittel','mittel (3–7 min)'],['lang','lang (8+ min)']]));

  const loesW = mk('div', 'db-form-field');
  const loesLbl = document.createElement('label'); loesLbl.textContent = 'Mit Lösung';
  loesW.appendChild(loesLbl);
  const loesChk = document.createElement('input');
  loesChk.type = 'checkbox'; loesChk.dataset.key = 'hat_loesung';
  loesChk.checked = !!a.hat_loesung;
  loesChk.style.cssText = 'width:16px;height:16px;cursor:pointer;accent-color:var(--pri);margin-top:2px;';
  loesW.appendChild(loesChk);
  right.appendChild(loesW);

  // Reihenfolge: right (Metadaten, 300px) zuerst, left (Aufgabe, 1fr) zweite Spalte
  body.appendChild(right);
  body.appendChild(left);

  function getData() {
    const data = {};
    body.querySelectorAll('[data-key]').forEach(function(el) {
      const k = el.dataset.key;
      if (el.type === 'checkbox') data[k] = el.checked;
      else if (el.type === 'number') data[k] = el.value !== '' ? Number(el.value) : null;
      else data[k] = el.value.trim() || null;
    });
    return data;
  }

  return { formEl: body, getData };
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
  Promise.all([
    sbDownload('schulbuecher.json').catch(function() { return null; }),
    sbDownload('methoden.json').catch(function() { return null; }),
    sbDownload('didaktik-artikel.json').catch(function() { return null; }),
  ]).then(function(res) {
    if (Array.isArray(res[0])) SCHULBUCHDB = res[0];
    if (Array.isArray(res[1])) METHDB      = res[1];
    if (Array.isArray(res[2])) DIDARTDB    = res[2];
    if (DB.view === 'landing') {
      var c = document.getElementById('db-content');
      if (c) { c.innerHTML = ''; buildLanding(c); }
    }
  });
})();
