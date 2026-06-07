let VERSION = null;       // built timestamp from version.json
let VERSION_STATUS = null; // 'current' | 'deploying' | null

// ── Nav-State persistieren ────────────────────────────────────────
const NAV_KEY = 'up_nav';
function saveNav() {
  try {
    localStorage.setItem(NAV_KEY, JSON.stringify({
      view: S.view, aktFpId: S.aktFpId, sel: S.sel, open: S.open
    }));
  } catch(e) {}
}
function restoreNav() {
  try {
    const saved = JSON.parse(localStorage.getItem(NAV_KEY) || 'null');
    if (!saved) return;
    if (saved.view)    S.view    = saved.view;
    if (saved.aktFpId) S.aktFpId = saved.aktFpId;
    if (saved.sel)     S.sel     = saved.sel;
    if (saved.open)    S.open    = saved.open;
  } catch(e) {}
}

// ── Render ───────────────────────────────────────────────────────
function render() {
  const prevContent = document.querySelector('.content');
  const scrollTop = prevContent ? prevContent.scrollTop : 0;

  const root = document.getElementById('root');
  root.innerHTML = '';
  root.appendChild(buildTopbar());
  if (S.modal) { root.appendChild(buildModal()); return; }
  if (!S.data || !S.data.fachplanungen || S.data.fachplanungen.length === 0) {
    root.appendChild(buildSetup());
    return;
  }
  const app = mk('div', 'app');
  app.appendChild(buildSidebar());
  app.appendChild(buildContent());
  root.appendChild(app);

  const newContent = document.querySelector('.content');
  if (newContent && scrollTop) newContent.scrollTop = scrollTop;
  saveNav();
}

function refreshTopbar() {
  const old = document.querySelector('.topbar');
  if (old) old.replaceWith(buildTopbar());
}

// ── Topbar ───────────────────────────────────────────────────────
function buildTopbar() {
  const bar = mk('div', 'topbar');
  bar.appendChild(buildAppNav('up'));
  const right = mk('div', 'topbar-right');
  if (S.saving) {
    const s = mk('div', '');
    s.style.display = 'flex'; s.style.alignItems = 'center'; s.style.gap = '6px';
    s.appendChild(mk('span', 'save-dot'));
    s.appendChild(tx('span', '', 'Speichert…'));
    right.appendChild(s);
  } else if (S.loaded) {
    right.appendChild(tx('span', '', '✓ Gespeichert'));
  }
  if (VERSION) {
    const d = new Date(VERSION);
    const label = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })
      + ' ' + d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
    const indicator = VERSION_STATUS === 'current' ? ' ✓' : VERSION_STATUS === 'deploying' ? ' ⏳' : '';
    const vSpan = tx('span', 'topbar-version', label + indicator);
    vSpan.title = 'Klicken zum Neu laden'; vSpan.style.cursor = 'pointer';
    vSpan.onclick = () => location.reload(true);
    right.appendChild(vSpan);
  }
  bar.appendChild(right);
  return bar;
}

// ── Setup ────────────────────────────────────────────────────────
function buildSetup() {
  const w = mk('div', '');
  w.style.cssText = 'max-width:600px;margin:60px auto;padding:0 20px;';
  const h1 = tx('h1', '', 'Unterrichtsplaner');
  h1.style.cssText = 'font-size:28px;font-weight:800;color:var(--pri);margin-bottom:8px;';
  const p = tx('p', '', 'Leg zunächst eine Fachplanung an (z.B. Mathematik Jahrgang 7).');
  p.style.cssText = 'color:var(--tx2);margin-bottom:24px;';
  const b = btn('+ Erste Fachplanung anlegen', 'btn btn-pri');
  b.onclick = () => { S.modal = { type: 'newFachplanung' }; render(); };
  w.appendChild(h1); w.appendChild(p); w.appendChild(b);
  return w;
}

// ── Init ─────────────────────────────────────────────────────────
(async () => {
  render();
  let _ghDate = null;

  // Zeitpunkt, zu dem die App gestartet wurde (für Auto-Reload-Erkennung)
  const _appStarted = Date.now();

  async function checkVersion() {
    const v = await fetch('version.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
    if (!v) return;
    const prevStatus = VERSION_STATUS;
    VERSION = v.built;
    if (_ghDate) {
      VERSION_STATUS = new Date(v.built) >= new Date(_ghDate) ? 'current' : 'deploying';
    }
    // Auto-Reload: sobald Deployment fertig ist, Seite neu laden
    // (aber nur wenn die App länger als 10s läuft, damit kein Loop beim ersten Load)
    if (prevStatus === 'deploying' && VERSION_STATUS === 'current' && Date.now() - _appStarted > 10000) {
      location.reload(true);
      return;
    }
    refreshTopbar();
    // Solange noch am Deployen: alle 30s erneut prüfen
    if (VERSION_STATUS === 'deploying') setTimeout(checkVersion, 30000);
  }

  fetch('https://api.github.com/repos/tdlrhg/unterrichtsplaner/commits/main',
    { headers: { 'Accept': 'application/vnd.github.v3+json' } })
    .then(r => r.json()).catch(() => null)
    .then(gh => {
      if (gh?.commit?.committer?.date) _ghDate = gh.commit.committer.date;
      checkVersion();
    });

  const [loaded, matdb, klpdb, didaktik, methdb, didart, schulbuecher] = await Promise.all([
    sbDownload('data.json').catch(() => null),
    sbDownload('materialien.json').catch(() => []),
    fetch('klp.json', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
    sbDownload('didaktik.json').catch(() => ({})),
    sbDownload('methoden.json').catch(() => []),
    sbDownload('didaktik-artikel.json').catch(() => []),
    sbDownload('schulbuecher.json').catch(() => []),
  ]);
  MATDB = Array.isArray(matdb) ? matdb : [];
  KLPDB = Array.isArray(klpdb) ? klpdb : [];
  METHDB = Array.isArray(methdb) ? methdb : [];
  DIDAKTIKDB = (didaktik && typeof didaktik === 'object' && !Array.isArray(didaktik)) ? didaktik : {};
  DIDARTDB = Array.isArray(didart) ? didart : [];
  SCHULBUCHDB = Array.isArray(schulbuecher) ? schulbuecher : [];

  // ── Migration: alle SII-Varianten → 'SII' ────────────────────
  const SII_NORM = new Set(['EF','Q1','Q2','Q (GK)','Q (LK)','Q-Phase','Oberstufe','Einführungsphase']);
  const SII_NUM_RE = /^(10\/11|11\/12|12\/13|11|12|13)$/;
  let migrated = false;
  MATDB.forEach(m => {
    if (!Array.isArray(m.jahrgang)) return;
    if (m.jahrgang.some(j => SII_NORM.has(j) || SII_NUM_RE.test(j))) {
      m.jahrgang = [...new Set(m.jahrgang.map(j => (SII_NORM.has(j) || SII_NUM_RE.test(j)) ? 'SII' : j))];
      migrated = true;
    }
  });
  if (migrated) sbUpload('materialien.json', MATDB).catch(() => {});

  try {
    S.data = loaded || { fachplanungen: [], kurse: [] };
    if (S.data.kurse && S.data.planung && !S.data.fachplanungen) {
      S.data = { fachplanungen: [], kurse: [] };
    }
    if (!S.data.fachplanungen) S.data.fachplanungen = [];
    if (!S.data.kurse) S.data.kurse = [];
  } catch (e) {
    S.data = { fachplanungen: [], kurse: [] };
  }
  S.loaded = true;
  restoreNav();
  // Fallback falls gespeicherte IDs nicht mehr existieren
  if (!getFachplanung(S.aktFpId) && S.data.fachplanungen.length > 0) {
    S.aktFpId = S.data.fachplanungen[0].id;
    S.view = 'fachplanung';
    S.sel = null;
  }
  render();
})();
