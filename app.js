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
}

function refreshTopbar() {
  const old = document.querySelector('.topbar');
  if (old) old.replaceWith(buildTopbar());
}

// ── Topbar ───────────────────────────────────────────────────────
function buildTopbar() {
  const bar = mk('div', 'topbar');
  bar.appendChild(tx('div', 'topbar-title', 'Unterrichtsplaner'));
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
  try {
    const [loaded, matdb] = await Promise.all([
      sbDownload('data.json'),
      sbDownload('materialien.json'),
    ]);
    MATDB = matdb || [];
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
  if (S.data.fachplanungen.length > 0) {
    S.aktFpId = S.data.fachplanungen[0].id;
    S.view = 'fachplanung';
  }
  render();
})();
