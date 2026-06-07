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

const DB = {
  view: 'landing',    // 'landing' | 'fach'
  fach: null,
  buch: null,         // null | Buchtitel-String → Filter auf eine Quelle
  herkunft: null,     // null | 'schulbuch' | 'eigenmaterial'
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
  homeRow.onclick = () => { DB.view = 'landing'; DB.fach = null; dbRender(); };
  sb.appendChild(homeRow);

  sb.appendChild(mk('div', 'sb-sep'));

  FAECHER.forEach(f => {
    const isActive = DB.view === 'fach' && DB.fach === f.key;
    const row = mk('div', 'sb-item' + (isActive ? ' active' : ''));
    const inner = mk('div', ''); inner.style.cssText = 'display:flex;gap:8px;align-items:center;flex:1;';
    inner.appendChild(tx('span', '', f.icon));
    inner.appendChild(tx('span', 'sb-item-label', f.label));
    row.appendChild(inner);
    row.onclick = () => { DB.view = 'fach'; DB.fach = f.key; DB.buch = null; DB.herkunft = null; DB.suchtext = ''; DB.offset = 0; dbRender(); };
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
var SHELF_H = 155; // Regalhöhe (px)

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
  var fachOrder = ['mathe', 'bio', 'chemie'];
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
async function buildLanding(container) {
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Material-Datenbank'));
  left.appendChild(tx('div', 'c-sub', 'Schulbücher, Arbeitsblätter und eigene Materialien'));
  hdr.appendChild(left);
  container.appendChild(hdr);

  // Bücherregal — zeigt alle Quellen auf einen Blick
  buildBuecherregal(container);
}

// ── Fach-Ansicht ──────────────────────────────────────────────────
async function buildFachView(container) {
  const f = fachInfo(DB.fach);

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', f.icon + ' ' + f.label));
  const subT = tx('div', 'c-sub', '');
  left.appendChild(subT);
  hdr.appendChild(left);
  container.appendChild(hdr);

  // Toolbar
  const toolbar = mk('div', '');
  toolbar.style.cssText = 'padding:10px 16px;display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--bord);';
  const searchInp = document.createElement('input');
  searchInp.type = 'text'; searchInp.className = 'finp';
  searchInp.placeholder = '🔍 Suchen…';
  searchInp.value = DB.suchtext;
  searchInp.style.cssText = 'flex:1;max-width:400px;';
  toolbar.appendChild(searchInp);
  container.appendChild(toolbar);

  // Tabellen-Bereich
  const tableWrap = mk('div', '');
  tableWrap.style.cssText = 'padding:8px 16px 16px;';
  container.appendChild(tableWrap);

  // Spalten-Header
  const tableHead = mk('div', 'db-table-head');
  [['Quelle','db-col-hdr-src'],['Inhalt','db-col-hdr-inhalt'],['Operator','db-col-hdr-op'],['Schwierigkeit','db-col-hdr-schw']].forEach(function(pair) {
    tableHead.appendChild(tx('div', 'db-col-hdr ' + pair[1], pair[0]));
  });
  tableWrap.appendChild(tableHead);

  const wrap = mk('div', '');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;margin-top:4px;';
  tableWrap.appendChild(wrap);

  const LIMIT = 50;

  async function load() {
    wrap.innerHTML = '<div style="padding:20px;color:var(--tx3);text-align:center">⏳ Lädt…</div>';
    const filters = { fach: f.key };
    if (DB.herkunft) filters.herkunft = DB.herkunft;
    if (DB.buch)     filters.buch     = DB.buch;

    const rows = await sbSelect('inhalte', {
      fts: DB.suchtext || null,
      filters,
      limit: LIMIT,
      offset: DB.offset,
      order: 'herkunft,buch,seite,nr',
    }).catch(function() { return []; });

    wrap.innerHTML = '';
    subT.textContent = rows.length + (rows.length === LIMIT ? '+' : '') + ' Einträge'
      + (DB.buch ? ' · 📖 ' + DB.buch : '')
      + (DB.suchtext ? ' · „' + DB.suchtext + '"' : '')
      + (!DB.buch && DB.herkunft === 'schulbuch' ? ' · Schulbuch' : !DB.buch && DB.herkunft === 'eigenmaterial' ? ' · Eigenmaterial' : '');

    if (!rows.length) {
      const e = tx('div', '', 'Keine Einträge gefunden.');
      e.style.cssText = 'padding:40px;text-align:center;color:var(--tx3);font-size:14px;';
      wrap.appendChild(e);
      return;
    }

    rows.forEach(function(row) { wrap.appendChild(renderRow(row)); });

    if (rows.length === LIMIT) {
      const mehr = btn('Weitere ' + LIMIT + ' laden…', 'btn btn-ghost btn-sm');
      mehr.style.cssText = 'margin:8px auto;display:block;';
      mehr.onclick = function() { DB.offset += LIMIT; load(); };
      wrap.appendChild(mehr);
    }
  }

  let debounce;
  searchInp.oninput = function() {
    clearTimeout(debounce);
    debounce = setTimeout(function() { DB.suchtext = searchInp.value.trim(); DB.offset = 0; load(); }, 400);
  };

  load();
}

// ── Eintrag-Zeile (Tabellen-Grid) ────────────────────────────────
function renderRow(a) {
  const isSchulbuch = !a.herkunft || a.herkunft === 'schulbuch';
  const accentColor = isSchulbuch ? '#0f766e' : '#16a34a';
  const rowBg       = SCHW_BG[a.schwierigkeit] || 'transparent';

  const row = mk('div', 'db-row');
  row.style.background = rowBg;

  // ── Spalte 1: Quelle ──────────────────────────────────────────
  const src = mk('div', 'db-col-src');
  const hBadge = tx('div', 'db-herkunft-badge', isSchulbuch ? '📖 Schulbuch' : '📄 Eigenmaterial');
  hBadge.style.color = accentColor;
  src.appendChild(hBadge);
  if (isSchulbuch) {
    src.appendChild(tx('div', 'db-buch-name', a.buch || '–'));
    var sub = (a.uk_titel || a.kapitel_titel || '') + (a.seite ? ' · S. ' + a.seite : '');
    if (sub.trim()) src.appendChild(tx('div', 'db-kap-name', sub));
  } else {
    src.appendChild(tx('div', 'db-buch-name', a.titel || a.dateiname || '–'));
  }
  row.appendChild(src);

  // ── Spalte 2: Inhalt ──────────────────────────────────────────
  const mid = mk('div', 'db-col-inhalt');
  mid.appendChild(tx('div', 'db-inhalt-text', (a.inhalt || a.thema || a.beschreibung || '–').slice(0, 150)));
  if (a.anforderung) mid.appendChild(tx('div', 'db-anf-text', a.anforderung.slice(0, 120)));
  row.appendChild(mid);

  // ── Spalte 3: Operator ────────────────────────────────────────
  const opCol = mk('div', 'db-col-op');
  if (a.operator) opCol.appendChild(mkChip(a.operator, opColor(a.operator)));
  row.appendChild(opCol);

  // ── Spalte 4: Schwierigkeit ───────────────────────────────────
  const schwCol = mk('div', 'db-col-schw');
  if (a.schwierigkeit) schwCol.appendChild(mkChip(a.schwierigkeit, SCHW_FARBEN[a.schwierigkeit] || '#64748b', SCHW_ICONS[a.schwierigkeit] || ''));
  row.appendChild(schwCol);

  // ── Aufklapper ────────────────────────────────────────────────
  row.onclick = function() {
    var next = row.nextElementSibling;
    if (next && next.classList.contains('row-detail')) {
      next.remove(); row.classList.remove('db-row-active'); return;
    }
    document.querySelectorAll('.row-detail').forEach(function(el) { el.remove(); });
    document.querySelectorAll('.db-row-active').forEach(function(el) { el.classList.remove('db-row-active'); });
    row.classList.add('db-row-active');

    const detail = mk('div', 'row-detail');
    detail.style.cssText = 'border-left:3px solid ' + accentColor + ';border-radius:0 0 8px 8px;padding:16px 20px;background:var(--surf2);margin-bottom:2px;';

    const secWrap = mk('div', '');
    secWrap.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:20px;';

    var sections = [
      { titel: 'Grunddaten', felder: [
        ['Inhalt', a.inhalt || a.beschreibung],
        ['Anforderung', a.anforderung],
        ['Buch / Titel', a.buch || a.titel],
        ['Kapitel', a.uk_titel || a.kapitel_titel],
        ['Seite', a.seite],
        ['Nr.', a.nr],
        ['Jahrgang', a.jahrgang],
        ['Thema', a.thema],
        ['Herkunft', a.herkunft || 'schulbuch'],
      ]},
      { titel: 'Prüfungsperspektive', felder: [
        ['Operator', a.operator],
        ['Schwierigkeit', a.schwierigkeit],
        ['Umfang', a.umfang],
        ['Mit Lösung', a.hat_loesung != null ? (a.hat_loesung ? 'ja' : 'nein') : null],
      ]},
    ];

    sections.forEach(function(sec) {
      const col = mk('div', '');
      const secTitle = tx('div', '', sec.titel);
      secTitle.style.cssText = 'font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:' + accentColor + ';margin-bottom:10px;';
      col.appendChild(secTitle);
      const fieldList = mk('div', '');
      fieldList.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
      sec.felder.forEach(function(pair) {
        var label = pair[0]; var val = pair[1];
        if (val === null || val === undefined || val === '') return;
        const field = mk('div', '');
        field.appendChild(tx('div', 'detail-field-label', label));
        field.appendChild(tx('div', 'detail-field-value', String(val)));
        fieldList.appendChild(field);
      });
      col.appendChild(fieldList);
      secWrap.appendChild(col);
    });

    detail.appendChild(secWrap);
    row.after(detail);
  };

  return row;
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
