// ── Material-Datenbank App ────────────────────────────────────────

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

// ── Topbar ────────────────────────────────────────────────────────
function buildDBTopbar() {
  const bar = mk('div', 'topbar');
  const titleWrap = mk('div', '');
  titleWrap.style.cssText = 'display:flex;align-items:baseline;gap:14px;';
  titleWrap.appendChild(tx('div', 'topbar-title', 'Material-Datenbank'));
  const upLink = mk('a', 'topbar-app-link'); upLink.href = 'index.html'; upLink.textContent = '📐 Unterrichtsplaner';
  const prLink = mk('a', 'topbar-app-link'); prLink.href = 'pruefung.html'; prLink.textContent = '📋 Prüfungsplaner';
  titleWrap.appendChild(upLink);
  titleWrap.appendChild(prLink);
  bar.appendChild(titleWrap);
  bar.appendChild(mk('div', 'topbar-right'));
  return bar;
}

// ── Sidebar ───────────────────────────────────────────────────────
function buildDBSidebar(sb) {
  sb.innerHTML = '';

  // Übersicht
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

    if (isActive) {
      const subItems = [
        [null, 'Alle Einträge'],
        ['schulbuch', '📖 Schulbücher'],
        ['eigenmaterial', '📄 Eigene Materialien'],
      ];
      subItems.forEach(([val, lbl]) => {
        const sub = mk('div', 'sb-item sb-item-indent' + (DB.herkunft === val ? ' active' : ''));
        sub.appendChild(tx('span', 'sb-item-label', lbl));
        sub.onclick = e => { e.stopPropagation(); DB.herkunft = val; DB.offset = 0; dbRender(); };
        sb.appendChild(sub);
      });
    }
  });

  // Resize-Handle
  const handle = mk('div', 'sb-resize-handle');
  sb.appendChild(handle);
  const savedW = localStorage.getItem('db_sb_width');
  if (savedW) sb.style.width = savedW + 'px';
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = e => { sb.style.width = Math.min(380, Math.max(160, e.clientX)) + 'px'; };
    const onUp = () => {
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
    tile.style.cssText = `border:2px solid ${f.color}44;border-radius:16px;padding:32px 24px;cursor:pointer;transition:all .2s;background:${f.color}0a;display:flex;flex-direction:column;align-items:flex-start;gap:10px;`;
    tile.onmouseenter = () => { tile.style.background = f.color + '18'; tile.style.transform = 'translateY(-3px)'; tile.style.boxShadow = `0 8px 24px ${f.color}22`; };
    tile.onmouseleave = () => { tile.style.background = f.color + '0a'; tile.style.transform = ''; tile.style.boxShadow = ''; };
    tile.onclick = () => { DB.view = 'fach'; DB.fach = f.key; DB.herkunft = null; DB.suchtext = ''; DB.offset = 0; dbRender(); };

    tile.appendChild(tx('div', '', f.icon)).style.fontSize = '40px';
    tile.appendChild(tx('div', 'db-tile-label', f.label));

    const countEl = tx('div', 'db-tile-count', '…');
    countEl.style.color = f.color;
    tile.appendChild(countEl);
    tile.appendChild(tx('div', 'db-tile-sub', 'Einträge'));

    // Herkunft-Aufschlüsselung
    const subCounts = mk('div', '');
    subCounts.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-top:4px;border-top:1px solid ' + f.color + '22;padding-top:10px;width:100%;';
    const sbCount_el = tx('div', '', '📖 … Schulbuch');
    sbCount_el.style.cssText = 'font-size:12px;color:var(--tx3);';
    const matCount_el = tx('div', '', '📄 … Eigenmaterial');
    matCount_el.style.cssText = 'font-size:12px;color:var(--tx3);';
    subCounts.appendChild(sbCount_el);
    subCounts.appendChild(matCount_el);
    tile.appendChild(subCounts);

    grid.appendChild(tile);

    // Async counts
    Promise.all([
      sbCount('inhalte', { fach: f.key }),
      sbCount('inhalte', { fach: f.key, herkunft: 'schulbuch' }),
      sbCount('inhalte', { fach: f.key, herkunft: 'eigenmaterial' }),
    ]).then(([total, sb, mat]) => {
      countEl.textContent = total ?? '?';
      sbCount_el.textContent = '📖 ' + (sb ?? '?') + ' Schulbuchaufgaben';
      matCount_el.textContent = '📄 ' + (mat ?? 0) + ' Eigenmaterialien';
    }).catch(() => { countEl.textContent = '?'; });
  }
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

  // Results
  const wrap = mk('div', '');
  wrap.style.cssText = 'padding:12px 16px;display:flex;flex-direction:column;gap:5px;';
  container.appendChild(wrap);

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
    }).catch(() => []);

    wrap.innerHTML = '';
    subT.textContent = rows.length + (rows.length === LIMIT ? '+' : '') + ' Einträge'
      + (DB.suchtext ? ` · „${DB.suchtext}"` : '')
      + (DB.herkunft === 'schulbuch' ? ' · Schulbuch' : DB.herkunft === 'eigenmaterial' ? ' · Eigenmaterial' : '');

    if (!rows.length) {
      const e = tx('div', '', 'Keine Einträge gefunden.');
      e.style.cssText = 'padding:40px;text-align:center;color:var(--tx3);font-size:14px;';
      wrap.appendChild(e);
      return;
    }

    rows.forEach(row => wrap.appendChild(renderRow(row)));

    if (rows.length === LIMIT) {
      const mehr = btn('Weitere ' + LIMIT + ' laden…', 'btn btn-ghost btn-sm');
      mehr.style.cssText = 'margin:8px auto;display:block;';
      mehr.onclick = () => { DB.offset += LIMIT; load(); };
      wrap.appendChild(mehr);
    }
  }

  let debounce;
  searchInp.oninput = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { DB.suchtext = searchInp.value.trim(); DB.offset = 0; load(); }, 400);
  };

  load();
}

// ── Eintrag-Zeile ─────────────────────────────────────────────────
function renderRow(a) {
  const isSchulbuch = !a.herkunft || a.herkunft === 'schulbuch';
  const accentColor = isSchulbuch ? '#2563eb' : '#16a34a';

  const card = mk('div', '');
  card.style.cssText = `border:1px solid var(--bord);border-left:3px solid ${accentColor};border-radius:8px;padding:9px 14px;display:flex;gap:12px;align-items:center;cursor:pointer;transition:background .1s;`;
  card.onmouseenter = () => { card.style.background = 'var(--surf2)'; };
  card.onmouseleave = () => { card.style.background = ''; };

  // Quelle (links, feste Breite)
  const src = mk('div', '');
  src.style.cssText = 'width:180px;flex-shrink:0;overflow:hidden;';
  if (isSchulbuch) {
    const buch = tx('div', '', a.buch || '–');
    buch.style.cssText = 'font-size:12px;font-weight:600;color:var(--tx1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    src.appendChild(buch);
    const kap = tx('div', '', a.uk_titel || a.kapitel_titel || '');
    kap.style.cssText = 'font-size:11px;color:var(--tx3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    src.appendChild(kap);
  } else {
    const titel = tx('div', '', a.titel || a.dateiname || '–');
    titel.style.cssText = 'font-size:12px;font-weight:600;color:var(--tx1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    src.appendChild(titel);
  }
  card.appendChild(src);

  // Inhalt (Mitte, wächst)
  const mid = mk('div', '');
  mid.style.cssText = 'flex:1;min-width:0;';
  const inhaltText = (a.inhalt || a.thema || a.beschreibung || '').slice(0, 130);
  const t = tx('div', '', inhaltText || '–');
  t.style.cssText = 'font-size:13px;color:var(--tx1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  mid.appendChild(t);
  if (a.anforderung) {
    const anf = tx('div', '', '→ ' + a.anforderung.slice(0, 100));
    anf.style.cssText = 'font-size:11px;color:var(--tx2);font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px;';
    mid.appendChild(anf);
  }
  card.appendChild(mid);

  // Chips (rechts)
  const chips = mk('div', '');
  chips.style.cssText = 'display:flex;gap:4px;align-items:center;flex-shrink:0;';
  const OP_FARBEN = { berechnen:'#2563eb', begründen:'#7c3aed', erklären:'#0891b2', zeichnen:'#16a34a', messen:'#d97706', konstruieren:'#dc2626', beschreiben:'#4f46e5', vergleichen:'#db2777', MC:'#374151' };
  const SCHW_FARBEN = { grundlegend:'#16a34a', standard:'#2563eb', anspruchsvoll:'#9d174d' };
  if (a.operator) chips.appendChild(mkChip(a.operator, OP_FARBEN[a.operator] || '#64748b'));
  if (a.schwierigkeit) chips.appendChild(mkChip(a.schwierigkeit, SCHW_FARBEN[a.schwierigkeit] || '#64748b'));
  if (a.seite) chips.appendChild(mkChip('S.' + a.seite, '#94a3b8'));
  card.appendChild(chips);

  // Aufklapp-Detail
  card.onclick = () => {
    const next = card.nextElementSibling;
    if (next && next.classList.contains('row-detail')) { next.remove(); return; }
    document.querySelectorAll('.row-detail').forEach(el => el.remove());

    const detail = mk('div', 'row-detail');
    detail.style.cssText = 'border:1px solid var(--bord);border-top:none;border-radius:0 0 8px 8px;padding:14px 16px;background:var(--surf);margin-top:-1px;';

    const grid = mk('div', '');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:12px;';

    const allFields = [
      ['Inhalt', a.inhalt],
      ['Anforderung', a.anforderung],
      ['Operator', a.operator],
      ['Umfang', a.umfang],
      ['Schwierigkeit', a.schwierigkeit],
      ['Thema', a.thema],
      ['Jahrgang', a.jahrgang],
      ['Buch', a.buch],
      ['Kapitel', a.kapitel_titel],
      ['Unterkapitel', a.uk_titel],
      ['Seite', a.seite],
      ['Aufgabe Nr.', a.nr],
      ['Herkunft', a.herkunft || 'schulbuch'],
      ['Titel', a.titel],
      ['Beschreibung', a.beschreibung],
      ['Themen', Array.isArray(a.themen) ? a.themen.join(', ') : a.themen],
      ['Rolle', a.rolle],
      ['Unterrichtsphase', a.unterrichtsphase],
      ['Mit Lösung', a.hat_loesung != null ? (a.hat_loesung ? 'ja' : 'nein') : null],
      ['Pfad', a.pfad],
    ];

    allFields.forEach(([label, val]) => {
      if (val === null || val === undefined || val === '') return;
      const row = mk('div', '');
      row.style.cssText = 'display:flex;flex-direction:column;gap:1px;';
      const l = tx('div', '', label);
      l.style.cssText = 'font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.4px;';
      const v = tx('div', '', String(val));
      v.style.cssText = 'color:var(--tx1);line-height:1.4;';
      row.appendChild(l); row.appendChild(v);
      grid.appendChild(row);
    });

    detail.appendChild(grid);
    card.after(detail);
  };

  return card;
}

function mkChip(text, color) {
  const c = tx('span', '', text);
  c.style.cssText = `display:inline-block;padding:1px 6px;border-radius:20px;font-size:10px;font-weight:600;background:${color}22;color:${color};white-space:nowrap;`;
  return c;
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
  }
}

// ── Init ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
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
});
