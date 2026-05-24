// ── Einstellungen ────────────────────────────────────────────────
function viewEinstellungen() {
  const div = mk('div', '');
  const hdr = mk('div', 'c-hdr');
  hdr.appendChild(tx('div', 'c-title', 'Einstellungen'));
  div.appendChild(hdr);

  // ── Kurse als Kacheln ─────────────────────────────────────────
  const kCard = mk('div', 'card');
  const kHdr = cardHdr('Meine Kurse');
  const addKBtn = btn('+ Neuer Kurs', 'btn btn-pri btn-xs');
  addKBtn.onclick = () => { S.modal = { type: 'newKurs' }; render(); };
  kHdr.appendChild(addKBtn);
  kCard.appendChild(kHdr);
  const kb = mk('div', 'card-body');

  const kurse = S.data.kurse || [];
  if (kurse.length === 0) {
    kb.appendChild(tx('div', 'empty-hint', 'Noch keine Kurse angelegt.'));
  } else {
    const grid = mk('div', 'kurs-kachel-grid');
    kurse.forEach(kurs => {
      const fp = getFachplanung(kurs.fachplanungId);
      const kachel = mk('div', 'kurs-kachel');
      const top = mk('div', 'kurs-kachel-top');
      top.appendChild(tx('div', 'kurs-kachel-name', kurs.klasse));
      top.appendChild(tx('div', 'kurs-kachel-sj', kurs.schuljahr || ''));
      kachel.appendChild(top);
      if (fp) kachel.appendChild(tx('div', 'kurs-kachel-fach', fachLabel(fp.fach) + ' · Jg. ' + fp.jahrgang));
      const indicators = mk('div', 'kurs-kachel-ind');
      const hasRes = kurs.ressourcen && Object.keys(kurs.ressourcen).length > 0;
      const hasLg  = kurs.lerngruppe && Object.keys(kurs.lerngruppe).some(k => kurs.lerngruppe[k]);
      if (hasRes) indicators.appendChild(tx('span', 'kurs-ind-chip', '📦 Ressourcen'));
      if (hasLg)  indicators.appendChild(tx('span', 'kurs-ind-chip', '👥 Lerngruppe'));
      kachel.appendChild(indicators);
      kachel.onclick = () => { S.view = 'kursEinstellungen'; S.aktKursDetailId = kurs.id; render(); };
      const delBtn = mk('button', 'kurs-kachel-del');
      delBtn.textContent = '✕'; delBtn.title = 'Kurs löschen';
      delBtn.onclick = e => {
        e.stopPropagation();
        if (confirm('Kurs "' + kurs.klasse + '" löschen?')) { S.data.kurse = S.data.kurse.filter(k => k.id !== kurs.id); scheduleSave(); render(); }
      };
      kachel.appendChild(delBtn);
      grid.appendChild(kachel);
    });
    kb.appendChild(grid);
  }
  kCard.appendChild(kb);
  div.appendChild(kCard);

  // ── Technische Einstellungen ──────────────────────────────────
  const techHdr = mk('div', 'einst-section-hdr');
  techHdr.textContent = 'Technische Einstellungen';
  div.appendChild(techHdr);

  function keyField(label, storageKey, placeholder, isSecret = true, hint = '') {
    const fg = mk('div', 'fg');
    fg.appendChild(tx('label', 'fl', label));
    const wrap = mk('div', ''); wrap.style.cssText = 'display:flex;gap:8px;align-items:center;';
    const inp = document.createElement('input');
    inp.type = isSecret ? 'password' : 'text'; inp.className = 'finp';
    inp.placeholder = placeholder; inp.value = localStorage.getItem(storageKey) || '';
    inp.style.flex = '1';
    const saveBtn = btn('Speichern', 'btn btn-pri btn-sm');
    saveBtn.onclick = () => {
      const val = inp.value.trim();
      if (val) { localStorage.setItem(storageKey, val); saveBtn.textContent = '✓ Gespeichert'; }
      else { localStorage.removeItem(storageKey); saveBtn.textContent = '✓ Gelöscht'; }
      setTimeout(() => { saveBtn.textContent = 'Speichern'; }, 2000);
    };
    wrap.appendChild(inp); wrap.appendChild(saveBtn);
    fg.appendChild(wrap);
    if (hint) { const h = tx('div', '', hint); h.style.cssText = 'font-size:11px;color:var(--tx3);margin-top:4px;'; fg.appendChild(h); }
    return fg;
  }

  // KI-Keys
  const aiCard = mk('div', 'card');
  aiCard.appendChild(cardHdr('KI-Schnittstellen'));
  const aib = mk('div', 'card-body');
  aib.appendChild(keyField('Anthropic API-Key (Claude)', 'ant_key', 'sk-ant-...', true, 'Wird nur lokal gespeichert – verlässt dieses Gerät nicht.'));
  aib.appendChild(keyField('OpenAI API-Key', 'oai_key', 'sk-proj-...', true, 'Wird nur lokal gespeichert – verlässt dieses Gerät nicht.'));

  // Modell-Tester
  const testRow = mk('div', ''); testRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap;';
  const MODELS_TO_TEST = [
    { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
    { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6' },
  ];
  const testStatus = tx('span', '', ''); testStatus.style.cssText = 'font-size:12px;color:var(--tx2);';
  MODELS_TO_TEST.forEach(({ id, label }) => {
    const b = btn('🔍 ' + label + ' testen', 'btn btn-ghost btn-sm');
    b.onclick = async () => {
      const key = localStorage.getItem('ant_key');
      if (!key) { testStatus.textContent = '⚠ Kein API-Key hinterlegt.'; testStatus.style.color = '#d97706'; return; }
      b.disabled = true; testStatus.textContent = '⏳ Teste ' + label + '…'; testStatus.style.color = 'var(--tx2)';
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
          body: JSON.stringify({ model: id, max_tokens: 16, messages: [{ role: 'user', content: 'Hi' }] }),
        });
        const d = await res.json();
        if (res.ok) {
          testStatus.textContent = '✓ ' + label + ' funktioniert.';
          testStatus.style.color = 'var(--grn)';
        } else {
          testStatus.textContent = label + ': ' + res.status + ' – ' + (d.error?.message || d.error?.type || res.statusText);
          testStatus.style.color = '#dc2626';
        }
      } catch(e) {
        testStatus.textContent = label + ': Netzwerkfehler – ' + e.message;
        testStatus.style.color = '#dc2626';
      }
      b.disabled = false;
    };
    testRow.appendChild(b);
  });
  testRow.appendChild(testStatus);
  aib.appendChild(testRow);
  aiCard.appendChild(aib);
  div.appendChild(aiCard);

  // Regeln für die Materialanalyse
  const rulesCard = mk('div', 'card');
  rulesCard.appendChild(cardHdr('Regeln für die Materialanalyse'));
  const rulesBody = mk('div', 'card-body');
  const rulesHint = tx('div', '', 'Diese Regeln werden bei jeder KI-Analyse im Import-Assistenten angehängt. Hier kannst du z.B. festlegen, wie Jahrgang, Thema oder Quelle ermittelt werden sollen.');
  rulesHint.style.cssText = 'font-size:12px;color:var(--tx2);margin-bottom:10px;line-height:1.5;';
  const rulesTA = document.createElement('textarea'); rulesTA.className = 'finp';
  rulesTA.style.cssText = 'width:100%;min-height:100px;resize:vertical;font-size:13px;font-family:inherit;';
  rulesTA.placeholder = 'z.B. Jahrgang immer aus dem Dateinamen ableiten. Bei fehlendem Jahrgang ["SII"] setzen. Quelle immer aus dem Cover-Bild lesen.';
  rulesTA.value = localStorage.getItem('mat_ki_regeln') || '';
  const rulesRow = mk('div', ''); rulesRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:8px;';
  const rulesSave = btn('Speichern', 'btn btn-pri btn-sm');
  const rulesMsg = tx('span', '', ''); rulesMsg.style.cssText = 'font-size:12px;color:var(--grn);';
  rulesSave.onclick = () => {
    const v = rulesTA.value.trim();
    if (v) localStorage.setItem('mat_ki_regeln', v); else localStorage.removeItem('mat_ki_regeln');
    rulesMsg.textContent = '✓ Gespeichert'; setTimeout(() => { rulesMsg.textContent = ''; }, 2000);
  };
  rulesRow.appendChild(rulesSave); rulesRow.appendChild(rulesMsg);
  rulesBody.appendChild(rulesHint); rulesBody.appendChild(rulesTA); rulesBody.appendChild(rulesRow);
  rulesCard.appendChild(rulesBody);
  div.appendChild(rulesCard);

  // R2-Zugangsdaten
  const r2Card = mk('div', 'card');
  r2Card.appendChild(cardHdr('Cloudflare R2 – Materialspeicher'));
  const r2b = mk('div', 'card-body');
  r2b.appendChild(keyField('S3 Endpoint', 'r2_endpoint', 'https://xxxx.r2.cloudflarestorage.com', false));
  r2b.appendChild(keyField('Bucket-Name', 'r2_bucket', 'unterrichtsplaner-materialien', false));
  r2b.appendChild(keyField('Access Key ID', 'r2_access_key', 'xxxxxxxxxxxx', false));
  r2b.appendChild(keyField('Secret Access Key', 'r2_secret_key', '••••••••••••••••••••', true));
  r2b.appendChild(keyField('Öffentliche URL (optional)', 'r2_public_url', 'https://pub-xxxx.r2.dev', false));
  const r2hint = tx('div', '', '💡 Bucket muss CORS für diese Seite erlauben. Öffentliche URL nur nötig wenn Dateien direkt verlinkt werden sollen.');
  r2hint.style.cssText = 'font-size:11px;color:var(--tx3);margin-top:8px;';
  r2b.appendChild(r2hint);
  const testRow = mk('div', ''); testRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:12px;';
  const testBtn = btn('Verbindung testen', 'btn btn-ghost btn-sm');
  const testStatus = tx('span', '', ''); testStatus.style.cssText = 'font-size:12px;';
  testBtn.onclick = async () => {
    testBtn.disabled = true; testStatus.textContent = '…'; testStatus.style.color = 'var(--tx3)';
    try {
      await r2Upload('_test.txt', new Blob(['ok'], { type: 'text/plain' }), 'text/plain');
      await r2Delete('_test.txt');
      testStatus.textContent = '✓ Verbindung erfolgreich'; testStatus.style.color = 'var(--grn)';
    } catch(e) { testStatus.textContent = '✗ ' + e.message; testStatus.style.color = '#dc2626'; }
    testBtn.disabled = false;
  };
  testRow.appendChild(testBtn); testRow.appendChild(testStatus);
  r2b.appendChild(testRow);
  r2Card.appendChild(r2b);
  div.appendChild(r2Card);

  return div;
}

// ── Kurs-Einstellungen (eigene Ansicht) ───────────────────────────
function viewKursEinstellungen(kursId) {
  const kurs = (S.data.kurse || []).find(k => k.id === kursId);
  if (!kurs) return tx('div', '', 'Kurs nicht gefunden.');
  const fp = getFachplanung(kurs.fachplanungId);
  if (!kurs.ressourcen) kurs.ressourcen = {};
  const res = kurs.ressourcen;

  const div = mk('div', '');

  // Breadcrumb
  div.appendChild(breadcrumb([
    { label: 'Einstellungen', action: () => { S.view = 'einstellungen'; S.aktKursDetailId = null; render(); } },
  ]));

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', kurs.klasse));
  left.appendChild(tx('div', 'c-sub', (fp ? fachLabel(fp.fach) + ' · Jg. ' + fp.jahrgang + ' · ' : '') + (kurs.schuljahr || '')));
  hdr.appendChild(left);
  const editBtn = btn('✏️ Bearbeiten', 'btn btn-ghost btn-sm');
  editBtn.onclick = () => { S.modal = { type: 'editKurs', data: { kurs } }; render(); };
  hdr.appendChild(editBtn);
  div.appendChild(hdr);

  const grid = mk('div', 'stunden-grid');
  div.appendChild(grid);

  // ── Ressourcen ────────────────────────────────────────────────
  const resCard = mk('div', 'card');
  resCard.appendChild(cardHdr('Ressourcen'));
  const resBody = mk('div', 'card-body');

  function resSection(title) {
    const h = tx('div', '', title);
    h.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin:14px 0 8px;';
    resBody.appendChild(h);
  }

  function resCheck(key, label, withTitle, titleKey, titlePlaceholder) {
    const row = mk('div', 'res-check-row');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!res[key];
    cb.onchange = () => { res[key] = cb.checked; scheduleSave(); if (withTitle) titleInp.style.display = cb.checked ? '' : 'none'; };
    const lbl = tx('label', 'res-check-label', label);
    lbl.prepend(cb);
    row.appendChild(lbl);
    if (withTitle) {
      const titleInp = document.createElement('input');
      titleInp.type = 'text'; titleInp.className = 'finp res-title-inp';
      titleInp.placeholder = titlePlaceholder || 'Titel…';
      titleInp.value = res[titleKey] || '';
      titleInp.style.display = res[key] ? '' : 'none';
      titleInp.oninput = e => { res[titleKey] = e.target.value; scheduleSave(); };
      row.appendChild(titleInp);
    }
    resBody.appendChild(row);
  }

  resSection('Schülermaterialien');
  resCheck('schulbuch',   'Schulbuch',  true, 'schulbuchTitel',   'Titel des Schulbuchs…');
  resCheck('arbeitsheft', 'Arbeitsheft', true, 'arbeitsheftTitel', 'Titel des Arbeitshefts…');
  resCheck('ipad',        'iPad / Tablet', false);
  resCheck('smartphone',  'Smartphone', false);
  resCheck('internet',    'Internetzugang', false);

  resSection('Raumausstattung');
  resCheck('beamer',     'Beamer / Projektor', false);
  resCheck('elmo',       'Elmo / Dokumentenkamera', false);
  resCheck('smartboard', 'Smartboard / Interaktives Whiteboard', false);

  resSection('Apps & Software');
  if (!res.apps) res.apps = [];
  const appsWrap = mk('div', 'res-apps-wrap');
  function renderApps() {
    appsWrap.innerHTML = '';
    res.apps.forEach((app, i) => {
      const chip = mk('div', 'res-app-chip');
      chip.appendChild(tx('span', '', app));
      const del = mk('button', ''); del.textContent = '✕'; del.style.cssText = 'border:none;background:none;cursor:pointer;color:var(--tx3);font-size:11px;padding:0 0 0 4px;';
      del.onclick = () => { res.apps.splice(i, 1); scheduleSave(); renderApps(); };
      chip.appendChild(del);
      appsWrap.appendChild(chip);
    });
    const addRow = mk('div', ''); addRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
    const appInp = document.createElement('input');
    appInp.type = 'text'; appInp.className = 'finp'; appInp.style.flex = '1';
    appInp.placeholder = 'App-Name…';
    const addBtn = btn('+ Hinzufügen', 'btn btn-ghost btn-xs');
    addBtn.onclick = () => {
      const v = appInp.value.trim();
      if (v && !res.apps.includes(v)) { res.apps.push(v); scheduleSave(); renderApps(); }
    };
    appInp.onkeydown = e => { if (e.key === 'Enter') addBtn.onclick(); };
    addRow.appendChild(appInp); addRow.appendChild(addBtn);
    appsWrap.appendChild(addRow);
  }
  renderApps();
  resBody.appendChild(appsWrap);

  resSection('Sonstiges');
  resBody.appendChild(fieldArea('', res.sonstiges || '', v => { res.sonstiges = v; scheduleSave(); }, '', 'Weitere Ressourcen, Besonderheiten…'));

  resCard.appendChild(resBody);
  resCard.classList.add('card-half');
  grid.appendChild(resCard);

  // ── Lerngruppenanalyse ────────────────────────────────────────
  const lgCard = mk('div', 'card card-half');
  lgCard.appendChild(cardHdr('Lerngruppenanalyse'));
  const lgBody = mk('div', 'card-body');
  if (!kurs.lerngruppe) kurs.lerngruppe = {};
  const lg = kurs.lerngruppe;

  function lgSec(title) {
    const h = tx('div', '', title);
    h.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin:14px 0 8px;';
    lgBody.appendChild(h);
  }
  function lgChips(label, key, options) {
    if (label) { const l = tx('div', '', label); l.style.cssText = 'font-size:12px;color:var(--tx2);margin-bottom:6px;'; lgBody.appendChild(l); }
    const wrap = mk('div', ''); wrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;';
    options.forEach(opt => {
      const b = mk('button', 'btn btn-xs ' + (lg[key] === opt ? 'btn-pri' : 'btn-ghost'));
      b.textContent = opt;
      b.onclick = () => { lg[key] = (lg[key] === opt ? null : opt); scheduleSave(); render(); };
      wrap.appendChild(b);
    });
    lgBody.appendChild(wrap);
  }
  function lgMulti(label, key, options) {
    if (!lg[key]) lg[key] = [];
    if (label) { const l = tx('div', '', label); l.style.cssText = 'font-size:12px;color:var(--tx2);margin-bottom:6px;'; lgBody.appendChild(l); }
    const wrap = mk('div', ''); wrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;';
    options.forEach(opt => {
      const active = lg[key].includes(opt);
      const b = mk('button', 'btn btn-xs ' + (active ? 'btn-pri' : 'btn-ghost'));
      b.textContent = opt;
      b.onclick = () => {
        if (lg[key].includes(opt)) lg[key] = lg[key].filter(x => x !== opt);
        else lg[key].push(opt);
        scheduleSave(); render();
      };
      wrap.appendChild(b);
    });
    lgBody.appendChild(wrap);
  }
  function lgText(label, key, placeholder) {
    lgBody.appendChild(fieldArea(label, lg[key] || '', v => { lg[key] = v; scheduleSave(); }, '', placeholder));
  }
  function lgNum(label, key) {
    const fg = mk('div', 'fg'); fg.style.display = 'inline-block'; fg.style.marginRight = '16px';
    fg.appendChild(tx('label', 'fl', label));
    const inp = document.createElement('input');
    inp.type = 'number'; inp.value = lg[key] || ''; inp.className = 'finp'; inp.style.maxWidth = '80px';
    inp.oninput = e => { lg[key] = e.target.value; scheduleSave(); };
    fg.appendChild(inp);
    lgBody.appendChild(fg);
  }

  lgSec('Strukturdaten');
  const numRow = mk('div', ''); numRow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;';
  ['Klassengröße:anzahl','davon w:anzahlW','davon m:anzahlM'].forEach(s => {
    const [label, key] = s.split(':');
    const fg = mk('div', 'fg'); fg.style.display = 'inline-block';
    fg.appendChild(tx('label', 'fl', label));
    const inp = document.createElement('input');
    inp.type = 'number'; inp.value = lg[key] || ''; inp.className = 'finp'; inp.style.maxWidth = '80px';
    inp.oninput = e => { lg[key] = e.target.value; scheduleSave(); };
    fg.appendChild(inp); numRow.appendChild(fg);
  });
  lgBody.appendChild(numRow);
  lgText('Raum / Ausstattung', 'raum', 'z.B. Chemieraum 204, Abzug vorhanden, Beamer');

  lgSec('Leistungsstand');
  lgChips('Allgemeines Leistungsniveau', 'leistung', ['eher schwach', 'heterogen', 'durchschnittlich', 'eher stark']);
  lgText('Erläuterung', 'leistungText', 'z.B. Oberes Drittel sehr stark, unteres Drittel zeigt Lücken…');

  lgSec('Lern- und Arbeitsverhalten');
  lgChips('Mitarbeit / Motivation', 'motivation', ['gering', 'uneinheitlich', 'gut', 'sehr aktiv']);
  lgChips('Konzentration / Arbeitstempo', 'tempo', ['langsam', 'variabel', 'zügig']);
  lgText('Erläuterung', 'lernverhaltenText', 'z.B. Tendenz zur Ablenkung, Gruppenarbeit funktioniert gut…');

  lgSec('Sozialverhalten');
  lgChips(null, 'sozial', ['angespannt', 'unauffällig', 'kooperativ']);
  lgText('Erläuterung', 'sozialText', 'z.B. Einzelne Konflikte zwischen Teilgruppen…');

  lgSec('Methodenkompetenz');
  lgMulti('Erfahrung mit Sozialformen / Methoden', 'methoden', ['Gruppenarbeit', 'Partnerarbeit', 'Stationsarbeit', 'Experimente', 'Schülerpräsentation', 'Think-Pair-Share']);

  lgSec('Motivation und Interesse');
  lgChips('Fachinteresse', 'fachinteresse', ['gering', 'uneinheitlich', 'vorhanden', 'ausgeprägt']);
  lgMulti('Bevorzugte Arbeitsweisen', 'arbeitsweisen', ['Experimente', 'Problemlösen', 'Kreatives Arbeiten', 'Diskussion', 'Digitale Medien']);

  lgSec('Sprachliche Voraussetzungen');
  lgChips('Fachsprachliche Kompetenz', 'fachsprache', ['gering', 'entwickelt sich', 'gut', 'sehr sicher']);
  lgMulti('Besonderheiten', 'sprachBesonderheiten', ['DaZ', 'Schwierigkeiten bei komplexen Aufgaben', 'Fachvokabular lückenhaft']);

  lgSec('Förderbedarf');
  lgMulti('Diagnostizierte Förderbedarfe', 'foerderung', ['LRS', 'DaZ', 'ADHS', 'Inklusion', 'Hochbegabung', 'Nachteilsausgleich']);
  lgText('Weitere Hinweise', 'besonderheitenText', 'Weitere relevante Informationen…');

  lgSec('Konsequenzen für die Planung');
  const aiRow = mk('div', ''); aiRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;';
  const aiBtn = btn('✨ KI → Konsequenzen ableiten', 'btn btn-ghost btn-sm');
  const aiStatus = tx('span', '', '');
  aiStatus.style.cssText = 'font-size:12px;color:var(--tx3);';
  aiRow.appendChild(aiBtn); aiRow.appendChild(aiStatus);
  lgBody.appendChild(aiRow);
  const konsTa = document.createElement('textarea');
  konsTa.className = 'finp'; konsTa.rows = 5; konsTa.style.width = '100%'; konsTa.style.resize = 'vertical';
  konsTa.placeholder = 'Was folgt aus der Analyse für die konkrete Planung?';
  konsTa.value = lg.konsequenzen || '';
  konsTa.oninput = e => { lg.konsequenzen = e.target.value; scheduleSave(); };
  lgBody.appendChild(konsTa);

  aiBtn.onclick = async () => {
    const key = localStorage.getItem('ant_key');
    if (!key) { alert('Kein Anthropic API-Key hinterlegt.'); return; }
    aiBtn.disabled = true; aiStatus.textContent = '…';
    try {
      let p = 'Du bist Fachleiter an einem NRW-Gymnasium. Leite aus der Lerngruppenanalyse konkrete didaktische Konsequenzen ab. Präzise, praxisnah, max. 200 Wörter.\n\n';
      p += 'Kurs: ' + kurs.klasse + (fp ? ' · ' + fachLabel(fp.fach) + ' Jg. ' + fp.jahrgang : '') + '\n';
      if (lg.anzahl) p += 'Klassengröße: ' + lg.anzahl + '\n';
      if (lg.leistung) p += 'Leistungsniveau: ' + lg.leistung + (lg.leistungText ? ' – ' + lg.leistungText : '') + '\n';
      if (lg.motivation) p += 'Mitarbeit: ' + lg.motivation + '\n';
      if (lg.tempo) p += 'Arbeitstempo: ' + lg.tempo + '\n';
      if (lg.sozial) p += 'Sozialverhalten: ' + lg.sozial + '\n';
      if (lg.methoden?.length) p += 'Methodenerfahrung: ' + lg.methoden.join(', ') + '\n';
      if (lg.fachinteresse) p += 'Fachinteresse: ' + lg.fachinteresse + '\n';
      if (lg.fachsprache) p += 'Fachsprache: ' + lg.fachsprache + '\n';
      if (lg.foerderung?.length) p += 'Förderbedarf: ' + lg.foerderung.join(', ') + '\n';
      if (lg.besonderheitenText) p += 'Besonderheiten: ' + lg.besonderheitenText + '\n';
      const res2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 600, messages: [{ role: 'user', content: p }] })
      });
      const d = await res2.json();
      lg.konsequenzen = d.content?.[0]?.text || '';
      konsTa.value = lg.konsequenzen;
      scheduleSave(); aiStatus.textContent = '✓';
    } catch(e) { aiStatus.textContent = 'Fehler: ' + e.message; }
    aiBtn.disabled = false;
  };

  lgCard.appendChild(lgBody);
  grid.appendChild(lgCard);

  return div;
}
