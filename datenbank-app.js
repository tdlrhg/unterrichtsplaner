// ── Material-Datenbank – Einstiegspunkt ───────────────────────────
// Teile: datenbank/config.js · nav.js · regal.js · import.js
//        datenbank/fach-view.js · modal.js  (geladen vor dieser Datei)

// ── Render ────────────────────────────────────────────────────────
function dbRender() {
  var _oldAB = document.getElementById('db-sel-action-bar');
  if (_oldAB && _oldAB.parentNode) _oldAB.parentNode.removeChild(_oldAB);
  const oldTop = document.querySelector('.topbar');
  if (oldTop) oldTop.replaceWith(buildDBTopbar());

  const sb = document.getElementById('db-sidebar');
  if (sb) buildDBSidebar(sb);

  const content = document.getElementById('db-content');
  if (!content) return;

  if (DB.view === 'import') {
    var holder = document.getElementById('_import_bg_holder');
    if (holder && holder.firstChild) {
      content.innerHTML = '';
      while (holder.firstChild) content.appendChild(holder.firstChild);
      holder.remove();
      _importHideBadge();
    } else {
      content.innerHTML = '';
      buildImportView(content);
    }
    return;
  }

  if (window._importActive) {
    var holder = document.getElementById('_import_bg_holder');
    if (!holder) { holder = document.createElement('div'); holder.id = '_import_bg_holder'; holder.style.display = 'none'; document.body.appendChild(holder); }
    while (content.firstChild) holder.appendChild(content.firstChild);
    _importShowBadge();
  } else {
    content.innerHTML = '';
  }

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

function _importShowBadge() {
  var b = document.getElementById('_import_badge');
  var isRunning = !!window._importAnalysisRunning;
  if (!b) {
    b = document.createElement('div');
    b.id = '_import_badge';
    b.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;color:#fff;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2);transition:background .2s;';
    b.onclick = function() { DB.view = 'import'; dbRender(); };
    document.body.appendChild(b);
  }
  b.style.background = isRunning ? 'var(--pri,#0f766e)' : '#b45309';
  b.textContent = isRunning ? '⏳ Import läuft…' : '📋 Ergebnisse noch nicht gespeichert';
}

function _importHideBadge() {
  var b = document.getElementById('_import_badge');
  if (b) b.remove();
}

function _importFinishBadge() {
  var b = document.getElementById('_import_badge');
  if (!b) return;
  b.style.background = '#b45309';
  b.textContent = '📋 Ergebnisse noch nicht gespeichert';
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

  // Versions-Check: alle 60s version.json pollen — bei Änderung neu laden
  var _dbStarted = Date.now();
  var _initialBuilt = null;
  async function checkDBVersion() {
    var v = await fetch('version.json?_=' + Date.now(), { cache: 'no-store' }).then(function(r) { return r.json(); }).catch(function() { return null; });
    if (!v) { setTimeout(checkDBVersion, 60000); return; }
    DB_VERSION = v.built;
    if (_initialBuilt === null) {
      _initialBuilt = v.built;
      DB_VERSION_STATUS = 'current';
      var oldTop = document.querySelector('.topbar');
      if (oldTop) oldTop.replaceWith(buildDBTopbar());
    } else if (v.built !== _initialBuilt && Date.now() - _dbStarted > 10000) {
      if (window._importActive || window._importAnalysisRunning) { setTimeout(checkDBVersion, 60000); return; }
      location.reload(true); return;
    }
    setTimeout(checkDBVersion, 60000);
  }
  checkDBVersion();

  // Methoden + Didaktik nachladen → Regal aktualisieren
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
    sbSelectAll('methoden').catch(function() { return []; }),
    dl('didaktik-artikel.json'),
  ]).then(function(res) {
    if (Array.isArray(res[0])) METHDB   = res[0];
    if (Array.isArray(res[1])) DIDARTDB = res[1];
    reloadLanding();
  });
})();
