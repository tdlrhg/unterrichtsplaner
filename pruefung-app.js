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

  const [data, pruefungen, checklisten, alteArbeiten, matdb, schulbuecher, klpdb, stilJson] = await Promise.all([
    sbDownload('data.json').catch(() => ({ fachplanungen: [], kurse: [] })),
    sbDownload('pruefungen.json').catch(() => []),
    sbDownload('checklisten.json').catch(() => []),
    sbDownload('alte_arbeiten.json').catch(() => []),
    sbDownload('materialien.json').catch(() => []),
    sbDownload('schulbuecher.json').catch(() => []),
    fetch('klp.json', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
    sbDownload('kompositionsstil.json').catch(() => null),
  ]);

  S.data = data || { fachplanungen: [], kurse: [] };
  if (!S.data.fachplanungen) S.data.fachplanungen = [];
  if (!S.data.kurse) S.data.kurse = [];

  PRUEFUNGSDB = Array.isArray(pruefungen) ? pruefungen : [];
  CHECKLISTDB = Array.isArray(checklisten) ? checklisten : [];
  ALTE_ARBEITEN_DB = Array.isArray(alteArbeiten) ? alteArbeiten : [];
  MATDB = Array.isArray(matdb) ? matdb : [];
  SCHULBUCHDB = Array.isArray(schulbuecher) ? schulbuecher : [];
  KLPDB = Array.isArray(klpdb) ? klpdb : [];
  if (stilJson?.text) KOMPOSITIONSSTIL = stilJson.text;

  renderPr();

  // Version prüfen
  fetch('https://api.github.com/repos/tdlrhg/unterrichtsplaner/commits/main',
    { headers: { 'Accept': 'application/vnd.github.v3+json' } })
    .then(r => r.json()).catch(() => null)
    .then(gh => { prCheckVersion(gh?.commit?.committer?.date || null); });
})();
