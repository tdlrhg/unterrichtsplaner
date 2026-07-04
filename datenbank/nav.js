// ── Topbar ────────────────────────────────────────────────────────
function buildDBTopbar() {
  const bar = mk('div', 'topbar');
  bar.appendChild(buildAppNav('db'));
  const right = mk('div', 'topbar-right');
  if (DB_VERSION) {
    const d = new Date(DB_VERSION);
    const label = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })
      + ' ' + d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
    const indicator = DB_VERSION_STATUS === 'current' ? ' ✓' : '';
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
