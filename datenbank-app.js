// ── Material-Datenbank App ────────────────────────────────────────

// Shims damit methoden.js / didaktik.js ohne Änderung funktionieren
var METHDB    = [];
var DIDARTDB  = [];
var DIDAKTIKDB = {};
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
    row.onclick = () => { DB.view = 'fach'; DB.fach = f.key; DB.herkunft = null; DB.suchtext = ''; DB.offset = 0; dbRender(); };
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

// ── Landing Page ──────────────────────────────────────────────────
async function buildLanding(container) {
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Material-Datenbank'));
  left.appendChild(tx('div', 'c-sub', 'Schulbücher, Arbeitsblätter und eigene Materialien'));
  hdr.appendChild(left);
  container.appendChild(hdr);

  const grid = mk('div', '');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;padding:28px;';
  container.appendChild(grid);

  for (const f of FAECHER) {
    const tile = mk('div', '');
    tile.style.cssText = 'border:2px solid ' + f.color + '44;border-radius:16px;padding:32px 24px;cursor:pointer;transition:all .2s;background:' + f.color + '0a;display:flex;flex-direction:column;align-items:flex-start;gap:10px;';
    tile.onmouseenter = function() { tile.style.background = f.color + '18'; tile.style.transform = 'translateY(-3px)'; tile.style.boxShadow = '0 8px 24px ' + f.color + '22'; };
    tile.onmouseleave = function() { tile.style.background = f.color + '0a'; tile.style.transform = ''; tile.style.boxShadow = ''; };
    tile.onclick = function() { DB.view = 'fach'; DB.fach = f.key; DB.herkunft = null; DB.suchtext = ''; DB.offset = 0; dbRender(); };

    tile.appendChild(tx('div', '', f.icon)).style.fontSize = '40px';
    tile.appendChild(tx('div', 'db-tile-label', f.label));

    const countWrap = mk('div', '');
    countWrap.style.cssText = 'display:flex;align-items:baseline;gap:6px;';
    const countEl = tx('div', 'db-tile-count', '…');
    countEl.style.color = f.color;
    countWrap.appendChild(countEl);
    countWrap.appendChild(tx('div', 'db-tile-sub', 'Einträge'));
    tile.appendChild(countWrap);

    const subCounts = mk('div', '');
    subCounts.style.cssText = 'display:flex;flex-direction:column;gap:5px;margin-top:6px;border-top:1px solid ' + f.color + '20;padding-top:12px;width:100%;';

    function mkSubRow(icon, label, dotColor) {
      const row = mk('div', ''); row.style.cssText = 'display:flex;align-items:center;gap:7px;';
      const dot = tx('span', '', '●'); dot.style.cssText = 'font-size:8px;color:' + dotColor + ';flex-shrink:0;';
      const lbl = tx('span', '', icon + ' ' + label); lbl.style.cssText = 'font-size:12px;color:var(--tx2);flex:1;';
      row.appendChild(dot); row.appendChild(lbl);
      return row;
    }

    const sbRow  = mkSubRow('📖', '… Schulbuchaufgaben', '#2563eb');
    const matRow = mkSubRow('📄', '… Eigenmaterialien',  '#16a34a');
    subCounts.appendChild(sbRow);
    subCounts.appendChild(matRow);
    tile.appendChild(subCounts);
    grid.appendChild(tile);

    Promise.all([
      sbCount('inhalte', { fach: f.key }),
      sbCount('inhalte', { fach: f.key, herkunft: 'schulbuch' }),
      sbCount('inhalte', { fach: f.key, herkunft: 'eigenmaterial' }),
    ]).then(function(res) {
      var total = res[0]; var sb = res[1]; var mat = res[2];
      countEl.textContent = total != null ? total : '?';
      sbRow.querySelector('span:last-child').textContent  = '📖 ' + (sb  != null ? sb  : '?') + ' Schulbuchaufgaben';
      matRow.querySelector('span:last-child').textContent = '📄 ' + (mat != null ? mat : 0)   + ' Eigenmaterialien';
    }).catch(function() { countEl.textContent = '?'; });
  }

  // ── Methoden & Didaktik Tiles ──────────────────────────────────
  var extraTiles = [
    { key: 'methoden',  icon: '🛠️', label: 'Methoden',  color: '#7c3aed', getCount: function() { return METHDB.length; },   sub: 'Unterrichtsmethoden' },
    { key: 'didaktik',  icon: '🗺️', label: 'Didaktik',  color: '#0891b2', getCount: function() { return DIDARTDB.length; },  sub: 'Artikel & Wissensbausteine' },
  ];
  extraTiles.forEach(function(t) {
    var tile = mk('div', '');
    tile.style.cssText = 'border:2px solid ' + t.color + '44;border-radius:16px;padding:32px 24px;cursor:pointer;transition:all .2s;background:' + t.color + '0a;display:flex;flex-direction:column;align-items:flex-start;gap:10px;';
    tile.onmouseenter = function() { tile.style.background = t.color + '18'; tile.style.transform = 'translateY(-3px)'; tile.style.boxShadow = '0 8px 24px ' + t.color + '22'; };
    tile.onmouseleave = function() { tile.style.background = t.color + '0a'; tile.style.transform = ''; tile.style.boxShadow = ''; };
    tile.onclick = function() { DB.view = t.key; DB.fach = null; dbRender(); };
    tile.appendChild(tx('div', '', t.icon)).style.fontSize = '40px';
    tile.appendChild(tx('div', 'db-tile-label', t.label));
    var cw = mk('div', ''); cw.style.cssText = 'display:flex;align-items:baseline;gap:6px;';
    var cEl = tx('div', 'db-tile-count', t.getCount()); cEl.style.color = t.color;
    cw.appendChild(cEl); cw.appendChild(tx('div', 'db-tile-sub', 'Einträge'));
    tile.appendChild(cw);
    tile.appendChild(tx('div', 'db-tile-sub', t.sub));
    grid.appendChild(tile);
  });
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

    const rows = await sbSelect('inhalte', {
      fts: DB.suchtext || null,
      filters,
      limit: LIMIT,
      offset: DB.offset,
      order: 'herkunft,buch,seite,nr',
    }).catch(function() { return []; });

    wrap.innerHTML = '';
    subT.textContent = rows.length + (rows.length === LIMIT ? '+' : '') + ' Einträge'
      + (DB.suchtext ? ' · „' + DB.suchtext + '"' : '')
      + (DB.herkunft === 'schulbuch' ? ' · Schulbuch' : DB.herkunft === 'eigenmaterial' ? ' · Eigenmaterial' : '');

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
window.addEventListener('DOMContentLoaded', async function() {
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

  // Methoden & Didaktik im Hintergrund laden
  sbDownload('methoden.json').then(function(d) {
    METHDB = Array.isArray(d) ? d : [];
  }).catch(function() {});
  sbDownload('didaktik-artikel.json').then(function(d) {
    DIDARTDB = Array.isArray(d) ? d : [];
  }).catch(function() {});
});
