// ── Prüfungsplaner App ────────────────────────────────────────────
let PRUEFUNGSDB = [];
let PR = {
  aktId: null,   // aktuell geöffnete Prüfung
};
let PR_VERSION = null;
let PR_VERSION_STATUS = null;
const _prStarted = Date.now();

function savePruefungsDB() {
  sbUpload('pruefungen.json', PRUEFUNGSDB).catch(e => console.error('Prüfungen speichern fehlgeschlagen:', e));
}

// ── Render ────────────────────────────────────────────────────────
function renderPr() {
  const root = document.getElementById('root');
  root.innerHTML = '';
  root.appendChild(buildPrTopbar());
  const layout = mk('div', 'pr-layout');
  layout.appendChild(buildPrSidebar());
  layout.appendChild(buildPrContent());
  root.appendChild(layout);
}

// ── Topbar ────────────────────────────────────────────────────────
function buildPrTopbar() {
  const bar = mk('div', 'topbar');
  const titleWrap = mk('div', '');
  titleWrap.style.cssText = 'display:flex;align-items:baseline;gap:12px;';
  titleWrap.appendChild(tx('div', 'topbar-title', 'Prüfungsplaner'));
  const upLink = mk('a', 'topbar-app-link');
  upLink.href = 'index.html';
  upLink.textContent = '📐 Unterrichtsplaner';
  titleWrap.appendChild(upLink);
  bar.appendChild(titleWrap);
  const right = mk('div', 'topbar-right');
  if (PR_VERSION) {
    const d = new Date(PR_VERSION);
    const label = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })
      + ' ' + d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
    const indicator = PR_VERSION_STATUS === 'current' ? ' ✓' : PR_VERSION_STATUS === 'deploying' ? ' ⏳' : '';
    const vSpan = tx('span', 'topbar-version', label + indicator);
    vSpan.title = 'Klicken zum Neu laden'; vSpan.style.cursor = 'pointer';
    vSpan.onclick = () => location.reload(true);
    right.appendChild(vSpan);
  }
  bar.appendChild(right);
  return bar;
}

// ── Sidebar ───────────────────────────────────────────────────────
function buildPrSidebar() {
  const sb = mk('div', 'pr-sidebar');

  // Titel
  const hdr = mk('div', 'pr-sb-hdr');
  hdr.appendChild(tx('div', 'pr-sb-title', 'Prüfungen'));
  hdr.appendChild(tx('div', 'pr-sb-sub', PRUEFUNGSDB.length + ' Einträge'));
  sb.appendChild(hdr);

  // Neue Prüfung
  const newBtn = btn('+ Neue Prüfung', 'btn btn-pri btn-sm pr-new-btn');
  newBtn.onclick = () => showNewPruefungModal();
  sb.appendChild(newBtn);

  sb.appendChild(mk('div', 'pr-sb-sep'));

  // Liste
  if (!PRUEFUNGSDB.length) {
    const empty = tx('div', '', 'Noch keine Prüfungen angelegt.');
    empty.style.cssText = 'padding:16px;font-size:12px;color:var(--sb-tx2);text-align:center;';
    sb.appendChild(empty);
  } else {
    PRUEFUNGSDB.forEach(pr => {
      const row = mk('div', 'pr-item' + (PR.aktId === pr.id ? ' active' : ''));

      const icon = tx('span', 'pr-item-icon', pr.typ === 'klausur' ? '📋' : '📝');
      row.appendChild(icon);

      const info = mk('div', ''); info.style.flex = '1'; info.style.minWidth = '0';
      info.appendChild(tx('div', 'pr-item-label', pr.titel || '–'));
      if (pr.kursLabel || pr.datum) {
        const prDatum = pr.datum ? new Date(pr.datum).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) : null;
        info.appendChild(tx('div', 'pr-item-sub', [pr.kursLabel, prDatum].filter(Boolean).join(' · ')));
      }
      row.appendChild(info);

      const badge = tx('span', 'pr-typ-badge ' + (pr.typ === 'klausur' ? 'pr-typ-kl' : 'pr-typ-ka'), pr.typ === 'klausur' ? 'Klausur' : 'KA');
      row.appendChild(badge);

      const del = btn('✕', 'pr-item-del');
      del.onclick = e => {
        e.stopPropagation();
        if (!confirm('"' + pr.titel + '" löschen?')) return;
        PRUEFUNGSDB = PRUEFUNGSDB.filter(p => p.id !== pr.id);
        if (PR.aktId === pr.id) PR.aktId = null;
        savePruefungsDB();
        renderPr();
      };
      row.appendChild(del);

      row.onclick = () => { PR.aktId = pr.id; renderPr(); };
      sb.appendChild(row);
    });
  }

  return sb;
}

// ── Content ───────────────────────────────────────────────────────
function buildPrContent() {
  const c = mk('div', 'pr-content');
  if (!PR.aktId) {
    c.appendChild(buildPrEmpty());
  } else {
    const pr = PRUEFUNGSDB.find(p => p.id === PR.aktId);
    if (pr) c.appendChild(buildPrDetail(pr));
  }
  return c;
}

function buildPrEmpty() {
  const wrap = mk('div', '');
  wrap.style.cssText = 'max-width:480px;margin:60px auto;text-align:center;';
  const ico = tx('div', '', '📋');
  ico.style.fontSize = '48px';
  wrap.appendChild(ico);
  const h = tx('div', '', 'Prüfungsplaner');
  h.style.cssText = 'font-family:"Playfair Display",serif;font-size:28px;font-weight:700;color:var(--pri);margin:16px 0 8px;';
  wrap.appendChild(h);
  const p = tx('p', '', 'Erstelle Klassenarbeiten und Klausuren auf Basis deiner Schulbücher, Materialien und Lernziel-Checklisten.');
  p.style.cssText = 'color:var(--tx2);line-height:1.6;margin-bottom:24px;';
  wrap.appendChild(p);
  const b = btn('+ Erste Prüfung anlegen', 'btn btn-pri');
  b.onclick = () => showNewPruefungModal();
  wrap.appendChild(b);
  return wrap;
}

function buildPrDetail(pr) {
  const div = mk('div', '');

  // Header
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', pr.titel || '–'));
  if (pr.thema) left.appendChild(tx('div', '', pr.thema)).style || (left.lastChild.style.cssText = 'font-size:15px;color:var(--tx2);margin-top:2px;');
  const datumStr = pr.datum ? new Date(pr.datum).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) : null;
  const dauerStr = pr.dauerVon
    ? (pr.dauerBis && pr.dauerBis !== pr.dauerVon ? pr.dauerVon + '–' + pr.dauerBis : pr.dauerVon) + ' Min.'
    : null;
  const meta = [
    pr.typ === 'klausur' ? 'Klausur' : 'Klassenarbeit',
    pr.kursLabel,
    datumStr,
    dauerStr,
  ].filter(Boolean).join(' · ');
  left.appendChild(tx('div', 'c-sub', meta));
  hdr.appendChild(left);
  div.appendChild(hdr);

  // Tabs (Platzhalter)
  const tabs = ['📋 Lernziele', '✏️ Aufgaben', '👁 Vorschau'];
  const tabRow = mk('div', '');
  tabRow.style.cssText = 'display:flex;gap:8px;margin-bottom:20px;';
  tabs.forEach(t => {
    const tb = btn(t, 'btn btn-ghost btn-sm');
    tabRow.appendChild(tb);
  });
  div.appendChild(tabRow);

  // Platzhalter
  const placeholder = mk('div', 'card');
  const pb = mk('div', 'card-body');
  pb.style.cssText = 'text-align:center;padding:40px;color:var(--tx3);';
  pb.textContent = 'Wird aufgebaut…';
  placeholder.appendChild(pb);
  div.appendChild(placeholder);

  return div;
}

// ── Neue Prüfung Modal ────────────────────────────────────────────
function showNewPruefungModal() {
  const ov = mk('div', 'matd-overlay');
  const pan = mk('div', 'matd-panel'); pan.style.maxWidth = '480px';
  const phdr = mk('div', 'matd-panel-hdr');
  phdr.appendChild(tx('span', 'matd-panel-title', 'Neue Prüfung'));
  const cls = btn('✕', 'btn btn-ghost btn-sm matd-close');
  const close = () => ov.remove();
  cls.onclick = close;
  phdr.appendChild(cls);
  pan.appendChild(phdr);
  ov.onclick = e => { if (e.target === ov) close(); };

  const body = mk('div', 'matd-panel-body');
  body.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:12px;';

  function field(label, inp) {
    const fg = mk('div', 'fg');
    fg.appendChild(tx('label', 'fl', label));
    fg.appendChild(inp);
    return fg;
  }

  const titelInp = document.createElement('input'); titelInp.className = 'finp'; titelInp.placeholder = 'z.B. Klassenarbeit 5';
  body.appendChild(field('Titel *', titelInp));

  const themaInp = document.createElement('input'); themaInp.className = 'finp'; themaInp.placeholder = 'z.B. Lineare Gleichungssysteme, Terme';
  body.appendChild(field('Thema', themaInp));

  const typSel = document.createElement('select'); typSel.className = 'finp';
  [['klassenarbeit','📝 Klassenarbeit'],['klausur','📋 Klausur']].forEach(([v,l]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = l; typSel.appendChild(o);
  });
  body.appendChild(field('Typ', typSel));

  // Kurs-Auswahl
  const kursSel = document.createElement('select'); kursSel.className = 'finp';
  const noKurs = document.createElement('option'); noKurs.value = ''; noKurs.textContent = '– kein Kurs –'; kursSel.appendChild(noKurs);
  (S.data?.kurse || []).forEach(k => {
    const fp = (S.data?.fachplanungen || []).find(f => f.id === k.fachplanungId);
    const o = document.createElement('option'); o.value = k.id;
    o.textContent = k.klasse + ' · ' + (fp ? fp.fach : '?') + ' ' + k.schuljahr;
    kursSel.appendChild(o);
  });
  body.appendChild(field('Kurs (optional)', kursSel));

  const datumInp = document.createElement('input'); datumInp.type = 'date'; datumInp.className = 'finp';
  body.appendChild(field('Datum', datumInp));

  const dauerRow = mk('div', ''); dauerRow.style.cssText = 'display:flex;gap:8px;align-items:center;';
  const dauerVonInp = document.createElement('input'); dauerVonInp.type = 'number'; dauerVonInp.className = 'finp'; dauerVonInp.placeholder = 'von'; dauerVonInp.min = 5; dauerVonInp.step = 5; dauerVonInp.value = '45';
  const dauerBisInp = document.createElement('input'); dauerBisInp.type = 'number'; dauerBisInp.className = 'finp'; dauerBisInp.placeholder = 'bis'; dauerBisInp.min = 5; dauerBisInp.step = 5; dauerBisInp.value = '45';
  dauerRow.appendChild(dauerVonInp);
  dauerRow.appendChild(tx('span', '', '–'));
  dauerRow.appendChild(dauerBisInp);
  dauerRow.appendChild(tx('span', '', 'Min.'));
  const dauerFg = mk('div', 'fg'); dauerFg.appendChild(tx('label', 'fl', 'Dauer')); dauerFg.appendChild(dauerRow);
  body.appendChild(dauerFg);

  const btnRow = mk('div', ''); btnRow.style.cssText = 'display:flex;gap:8px;margin-top:4px;';
  const saveBtn = btn('Anlegen', 'btn btn-pri btn-sm');
  const cancelB = btn('Abbrechen', 'btn btn-ghost btn-sm'); cancelB.onclick = close;
  btnRow.appendChild(saveBtn); btnRow.appendChild(cancelB);
  body.appendChild(btnRow);

  saveBtn.onclick = () => {
    const titel = titelInp.value.trim();
    if (!titel) { alert('Bitte einen Titel eingeben.'); return; }
    const kursId = kursSel.value || null;
    const kurs = kursId ? (S.data?.kurse || []).find(k => k.id === kursId) : null;
    const fp = kurs ? (S.data?.fachplanungen || []).find(f => f.id === kurs.fachplanungId) : null;
    const dauerVon = dauerVonInp.value ? parseInt(dauerVonInp.value) : null;
    const dauerBis = dauerBisInp.value ? parseInt(dauerBisInp.value) : null;
    const pr = {
      id: uid(),
      titel,
      thema: themaInp.value.trim() || null,
      typ: typSel.value,
      kursId,
      kursLabel: kurs ? kurs.klasse + (fp ? ' · ' + fp.fach : '') : null,
      datum: datumInp.value || null,
      dauerVon,
      dauerBis: dauerBis && dauerBis >= dauerVon ? dauerBis : dauerVon,
      lernziele: [],
      aufgaben: [],
      erstellt: new Date().toISOString(),
    };
    PRUEFUNGSDB.push(pr);
    savePruefungsDB();
    PR.aktId = pr.id;
    close();
    renderPr();
  };

  pan.appendChild(body);
  ov.appendChild(pan);
  document.getElementById('root').appendChild(ov);
  ov.classList.add('open');
}

// ── Version Check ─────────────────────────────────────────────────
async function prCheckVersion(ghDate) {
  const v = await fetch('version.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  if (!v) return;
  const prev = PR_VERSION_STATUS;
  PR_VERSION = v.built;
  if (ghDate) PR_VERSION_STATUS = new Date(v.built) >= new Date(ghDate) ? 'current' : 'deploying';
  if (prev === 'deploying' && PR_VERSION_STATUS === 'current' && Date.now() - _prStarted > 10000) { location.reload(true); return; }
  renderPr();
  if (PR_VERSION_STATUS === 'deploying') setTimeout(() => prCheckVersion(ghDate), 30000);
}

// ── Init ──────────────────────────────────────────────────────────
(async () => {
  renderPr(); // Lade-State zeigen

  const [data, pruefungen, matdb, schulbuecher, klpdb] = await Promise.all([
    sbDownload('data.json').catch(() => ({ fachplanungen: [], kurse: [] })),
    sbDownload('pruefungen.json').catch(() => []),
    sbDownload('materialien.json').catch(() => []),
    sbDownload('schulbuecher.json').catch(() => []),
    fetch('klp.json', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
  ]);

  S.data = data || { fachplanungen: [], kurse: [] };
  if (!S.data.fachplanungen) S.data.fachplanungen = [];
  if (!S.data.kurse) S.data.kurse = [];

  PRUEFUNGSDB = Array.isArray(pruefungen) ? pruefungen : [];
  MATDB = Array.isArray(matdb) ? matdb : [];
  SCHULBUCHDB = Array.isArray(schulbuecher) ? schulbuecher : [];
  KLPDB = Array.isArray(klpdb) ? klpdb : [];

  renderPr();

  // Version prüfen
  fetch('https://api.github.com/repos/tdlrhg/unterrichtsplaner/commits/main',
    { headers: { 'Accept': 'application/vnd.github.v3+json' } })
    .then(r => r.json()).catch(() => null)
    .then(gh => { prCheckVersion(gh?.commit?.committer?.date || null); });
})();
