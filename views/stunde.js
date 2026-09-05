// ── Hilfsfunktionen ──────────────────────────────────────────────
function safeParseArray(jsonStr) {
  try { return JSON.parse(jsonStr); } catch(_) {}
  // Fallback: Objekte per Regex aus malformed JSON extrahieren
  const items = [];
  const re = /\{[^{}]*\}/g;
  let m;
  while ((m = re.exec(jsonStr)) !== null) {
    try { items.push(JSON.parse(m[0])); } catch(_) {}
  }
  return items;
}

// ── Stunden-Ansicht ──────────────────────────────────────────────
function initStunde(stunde) {
  if (!stunde.klpInhalt) stunde.klpInhalt = [];
  if (!stunde.klpProzess) stunde.klpProzess = [];
  if (!stunde.phasen) stunde.phasen = [];
  if (!stunde.lernziele) stunde.lernziele = [];
  if (!stunde.planungsrahmen) stunde.planungsrahmen = {};
}

function renderStundenBody(div, stunde, fp) {
  if (!stunde._uiOpen) stunde._uiOpen = {};
  const secs = mk('div', 'plan-sections');
  div.appendChild(secs);

  // ── Accordion-Helper ───────────────────────────────────────────
  function mkSec(num, title, key, statusText, fertig) {
    const isOpen = stunde._uiOpen[key] !== false;
    const sec = mk('div', 'plan-sec');
    const hdr = mk('div', 'plan-sec-hdr');
    hdr.appendChild(tx('div', 'plan-sec-num', String(num)));
    hdr.appendChild(tx('div', 'plan-sec-ttl', title));
    hdr.appendChild(tx('div', 'plan-sec-st' + (fertig ? ' fertig' : ''), statusText));
    const acts = mk('div', 'plan-sec-actions');
    hdr.appendChild(acts);
    const arrEl = tx('div', 'plan-sec-arr', isOpen ? '▲' : '▼');
    hdr.appendChild(arrEl);
    const body = mk('div', 'plan-sec-body');
    if (!isOpen) body.style.display = 'none';
    hdr.onclick = e => {
      if (e.target.closest('button,input,select,textarea,a,label')) return;
      const nowOpen = body.style.display === 'none';
      body.style.display = nowOpen ? '' : 'none';
      arrEl.textContent = nowOpen ? '▲' : '▼';
      stunde._uiOpen[key] = nowOpen;
    };
    sec.appendChild(hdr);
    sec.appendChild(body);
    secs.appendChild(sec);
    return { body, acts };
  }

  // ── Status-Labels ──────────────────────────────────────────────
  const gdFertig = !!stunde.intention;
  if (!('methode' in stunde)) stunde.methode = null;
  if (!('methodeKiVorschlag' in stunde)) stunde.methodeKiVorschlag = null;
  if (!('methodeKiBewertung' in stunde)) stunde.methodeKiBewertung = null;
  const methFertig = !!stunde.methode;
  const pr = stunde.planungsrahmen;
  if (!pr.sozialformen) pr.sozialformen = [];
  if (!pr.kiGewählt) pr.kiGewählt = [];
  const prFertig = !!(pr.sozialformen?.length || pr.schwerpunkt);
  const phFertig = (stunde.phasen || []).length > 0;

  // ══════════════════════════════════════════════════════════════════
  // SEKTION 1: Grunddaten & Lernziele
  // ══════════════════════════════════════════════════════════════════
  const lzKiBtn  = btn('✨ KI → Lernziele', 'btn btn-ki btn-xs');
  const lzAddBtn = btn('+ Manuell', 'btn btn-pri btn-xs');

  const { body: s1body, acts: s1acts } = mkSec(1, 'Grunddaten & Lernziele', 'grunddaten',
    gdFertig ? '✓ fertig' : 'offen', gdFertig);
  s1acts.appendChild(lzKiBtn);
  s1acts.appendChild(lzAddBtn);

  const s1grid = mk('div', 's1-grid');

  // Linke Spalte: Grunddaten
  const s1left = mk('div', '');
  s1left.appendChild(fieldInput('Kurztitel', stunde.titel || '', v => { stunde.titel = v; scheduleSave(); }));
  s1left.appendChild(fieldInput('Langtitel', stunde.langtitel || '', v => { stunde.langtitel = v; scheduleSave(); }));
  s1left.appendChild(fieldArea('Intention', stunde.intention || '', v => { stunde.intention = v; scheduleSave(); }, '', 'Worum geht es in dieser Stunde? Worauf soll sie hinauslaufen?'));

  const prioFg = mk('div', 'fg');
  prioFg.appendChild(tx('label', 'fl', 'Typ / Priorität'));
  const prioWrap = mk('div', 'prio-wrap');
  const PRIOS = [
    { val: 'pflicht',      label: '🟢 Pflicht',      title: 'Muss gemacht werden' },
    { val: 'optional',     label: '🟡 Optional',     title: 'Kann bei Zeitmangel entfallen' },
    { val: 'puffer',       label: '🔵 Puffer',       title: 'Wiederholung / Reserve' },
    { val: 'klassenarbeit',label: '📝 Klassenarbeit',title: 'Klassenarbeit' },
    { val: 'rueckgabe',    label: '📋 Rückgabe',     title: 'Rückgabe / Besprechung' },
  ];
  if (!stunde.prioritaet) stunde.prioritaet = 'pflicht';
  PRIOS.forEach(p => {
    const b = mk('button', 'prio-btn' + (stunde.prioritaet === p.val ? ' active' : ''));
    b.textContent = p.label; b.title = p.title;
    b.onclick = () => { stunde.prioritaet = p.val; scheduleSave(); render(); };
    prioWrap.appendChild(b);
  });
  prioFg.appendChild(prioWrap);
  s1left.appendChild(prioFg);
  s1left.appendChild(fieldArea('Stundenbeschreibung', stunde.lernziel || '', v => { stunde.lernziel = v; scheduleSave(); }, '', 'Inhaltliche Zusammenfassung – was passiert in dieser Stunde?'));

  // Rechte Spalte: Lernziele
  const s1right = mk('div', '');
  const lzBody = mk('div', '');

  function renderLzBody() {
    lzBody.innerHTML = '';
    if (stunde.lernziele.length === 0) {
      lzBody.appendChild(tx('div', 'empty-hint', 'Noch keine Lernziele – KI ableiten oder manuell hinzufügen.'));
    } else {
      stunde.lernziele.forEach((lz, i) => {
        const row = mk('div', 'lz-row');
        row.appendChild(tx('div', 'lz-nr', (i + 1) + '.'));
        const fields = mk('div', 'lz-fields');
        const ta1 = document.createElement('textarea');
        ta1.className = 'lz-text finp';
        ta1.placeholder = 'Die SuS können/wissen … und zeigen dies, indem sie …';
        ta1.value = lz.text;
        ta1.rows = 1;
        const autoResize = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
        ta1.oninput = e => { lz.text = e.target.value; scheduleSave(); autoResize(e.target); };
        requestAnimationFrame(() => autoResize(ta1));
        fields.appendChild(ta1);
        row.appendChild(fields);
        const delBtn = btn('🗑', 'btn btn-danger btn-xs lz-del');
        delBtn.onclick = () => {
          stunde.lernziele = stunde.lernziele.filter(z => z.id !== lz.id);
          scheduleSave(); renderLzBody();
        };
        row.appendChild(delBtn);
        lzBody.appendChild(row);
      });
    }
  }
  renderLzBody();
  s1right.appendChild(lzBody);

  lzKiBtn.onclick = async () => {
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) { alert('Bitte zuerst Anthropic API-Key in den Einstellungen hinterlegen.'); return; }
    if (!stunde.intention) { alert('Bitte zuerst die Intention ausfüllen.'); return; }
    lzKiBtn.textContent = '…'; lzKiBtn.disabled = true;
    try {
      const prompt = `Du bist erfahrene Lehrerin an einem NRW-Gymnasium (${fp.fach || 'Naturwissenschaft'}, ${fp.jahrgang || ''}).

Aus der folgenden Intention einer Unterrichtsstunde leitest du 2–3 operationalisierte Lernziele ab.

Format: Jedes Lernziel ist EIN Satz nach diesem Muster:
"Die SuS können/wissen … und zeigen dies, indem sie …"

Wichtig: kompakt, ein einziger Satz, kein Punkt nach "können/wissen"-Teil.

Intention der Stunde:
${stunde.intention}

${stunde.lernziel ? 'Stundenbeschreibung (Kontext):\n' + stunde.lernziel : ''}

Antworte NUR als JSON-Array von Strings:
["Die SuS können … und zeigen dies, indem sie …"]`;

      const text = await callKI(prompt, { maxTokens: 800, label: 'lernziele-generieren' });
      const parsed = safeParseArray(text.match(/\[[\s\S]*\]/)?.[0] || '[]');
      if (!parsed.length) throw new Error('Keine Lernziele erhalten');
      const neu = parsed.map(z => ({ id: uid(), text: typeof z === 'string' ? z : (z.text || '') }));
      if (stunde.lernziele.length > 0 && !confirm('Vorhandene Lernziele ersetzen?')) {
        lzKiBtn.textContent = '✨ KI → Lernziele'; lzKiBtn.disabled = false; return;
      }
      stunde.lernziele = neu;
      scheduleSave(); renderLzBody();
    } catch(e) {
      alert('Fehler: ' + e.message);
    }
    lzKiBtn.textContent = '✨ KI → Lernziele'; lzKiBtn.disabled = false;
  };

  lzAddBtn.onclick = () => {
    stunde.lernziele.push({ id: uid(), text: '', indikator: '' });
    scheduleSave(); renderLzBody();
  };

  s1grid.appendChild(s1left);
  s1grid.appendChild(s1right);
  s1body.appendChild(s1grid);

  // ══════════════════════════════════════════════════════════════════
  // SEKTION 2: Material & Notizen
  // ══════════════════════════════════════════════════════════════════
  if (!Array.isArray(stunde.material)) stunde.material = [];
  const matAnz = stunde.material.length;
  const { body: s2body, acts: s2acts } = mkSec(2, 'Material & Notizen', 'material',
    matAnz ? '✓ ' + matAnz : 'offen', matAnz > 0);

  const matAddBtn = btn('+ Material', 'btn btn-ghost btn-xs');
  s2acts.appendChild(matAddBtn);

  const matListe = mk('div', '');
  matListe.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  s2body.appendChild(matListe);

  function renderMaterial() {
    matListe.innerHTML = '';
    if (!stunde.material.length) {
      const leer = tx('div', '', 'Noch kein Material zugeordnet. Im Reihen-Chat kann die KI das eintragen, sobald ihr euch einig seid.');
      leer.style.cssText = 'font-size:12px;color:var(--tx3);line-height:1.5;';
      matListe.appendChild(leer);
    }
    stunde.material.forEach(m => {
      const row = mk('div', '');
      row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:8px 10px;'
        + 'background:var(--surf2);border-radius:6px;';

      const col = mk('div', ''); col.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:3px;min-width:0;';

      const qInp = document.createElement('input');
      qInp.className = 'finp'; qInp.value = m.quelle || ''; qInp.placeholder = 'Material';
      qInp.style.cssText = 'font-size:13px;font-weight:600;padding:3px 6px;';
      qInp.oninput = () => { m.quelle = qInp.value; scheduleSave(); };
      col.appendChild(qInp);

      const detail = mk('div', ''); detail.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
      const tInp = document.createElement('input');
      tInp.className = 'finp'; tInp.value = m.teile || ''; tInp.placeholder = 'nur Teil …';
      tInp.style.cssText = 'font-size:12px;padding:3px 6px;flex:1;min-width:120px;';
      tInp.oninput = () => { m.teile = tInp.value; scheduleSave(); };
      const aInp = document.createElement('input');
      aInp.className = 'finp'; aInp.value = m.anpassung || ''; aInp.placeholder = 'anzupassen …';
      aInp.style.cssText = 'font-size:12px;padding:3px 6px;flex:1;min-width:120px;';
      aInp.oninput = () => { m.anpassung = aInp.value; scheduleSave(); };
      detail.appendChild(tInp); detail.appendChild(aInp);
      col.appendChild(detail);
      row.appendChild(col);

      const del = mk('button', 'matc-del');
      del.textContent = '✕'; del.title = 'Zuordnung entfernen';
      del.style.cssText = 'color:var(--tx3);flex-shrink:0;';
      del.onclick = () => {
        stunde.material = stunde.material.filter(x => x.id !== m.id);
        scheduleSave(); renderMaterial();
      };
      row.appendChild(del);
      matListe.appendChild(row);
    });
  }
  matAddBtn.onclick = () => {
    stunde.material.push({ id: uid(), quelle: '', teile: '', anpassung: '' });
    scheduleSave(); renderMaterial();
  };
  renderMaterial();

  // Notizen — die KI schreibt hier hinein (createStunde/updateStunde)
  const notLabel = tx('div', '', 'Notizen');
  notLabel.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;'
    + 'letter-spacing:.5px;margin:14px 0 6px;';
  s2body.appendChild(notLabel);
  const notTA = document.createElement('textarea');
  notTA.className = 'finp'; notTA.rows = 3;
  notTA.value = stunde.notizen || '';
  notTA.placeholder = 'Materialhinweise, offene Fragen, Erinnerungen …';
  notTA.style.cssText = 'font-size:13px;width:100%;resize:vertical;';
  notTA.oninput = () => { stunde.notizen = notTA.value; scheduleSave(); };
  s2body.appendChild(notTA);

  // ══════════════════════════════════════════════════════════════════
  // SEKTION 3: Methode
  // ══════════════════════════════════════════════════════════════════
  // Migration: altes stunde.methode → stunde.methoden.Erarbeitung
  if (!stunde.methoden) {
    stunde.methoden = { Einstieg: null, Erarbeitung: null, Sicherung: null };
    if (stunde.methode) stunde.methoden.Erarbeitung = { name: stunde.methode, id: null, begr: '' };
  }
  const methAnz = ['Einstieg','Erarbeitung','Sicherung'].filter(t => stunde.methoden[t]?.name).length;
  const methFertigNeu = methAnz > 0;
  const methStatusText = methFertigNeu ? '✓ ' + methAnz + '/3' : 'offen';
  const { body: s3body } = mkSec(3, 'Methoden', 'methoden', methStatusText, methFertigNeu);

  const METH_FARBE = { Einstieg: '#3b82f6', Erarbeitung: '#10b981', Sicherung: '#f59e0b' };

  function renderMethodeBody() {
    s3body.innerHTML = '';

    // ── KI: alle drei auf einmal ────────────────────────────────────
    const kiAlleBtn = btn('✨ KI schlägt alle drei vor', 'btn btn-ki btn-sm');
    kiAlleBtn.style.marginBottom = '14px';
    kiAlleBtn.onclick = async () => {
      const antKey = localStorage.getItem('ant_key');
      if (!antKey) { alert('Bitte API-Key hinterlegen.'); return; }
      kiAlleBtn.textContent = '⏳ KI denkt…'; kiAlleBtn.disabled = true;
      const methPool = typ => (METHDB.length
        ? METHDB.filter(m => !m.phasen?.length || m.phasen.includes(typ))
        : METHDB
      ).map(m => `ID:${m.id}|${m.name}${m.beschreibung?' – '+m.beschreibung.slice(0,80):''}`).join('\n') || '(keine)';
      const _lgT = getLGThemen((getAktKurs(fp.id)||{}).id||'');
      const prompt = `Du bist Didaktik-Experte. Schlage für diese Unterrichtsstunde je eine Methode für Einstieg, Erarbeitung und Sicherung vor.
Fach: ${fp.fach}, Jahrgang: ${fp.jahrgang}
Lernziel: ${stunde.lernziel||'–'}, Intention: ${stunde.intention||'–'}
${getDIDContext(['stunde'], _lgT, true)}
Methoden für Einstieg:\n${methPool('Einstieg')}
Methoden für Erarbeitung:\n${methPool('Erarbeitung')}
Methoden für Sicherung:\n${methPool('Sicherung')}

Antworte NUR mit JSON:
{"Einstieg":{"id":"ID-oder-null","name":"Name","begr":"1 Satz"},"Erarbeitung":{"id":"ID-oder-null","name":"Name","begr":"1 Satz"},"Sicherung":{"id":"ID-oder-null","name":"Name","begr":"1 Satz"}}`;
      try {
        const parsed = JSON.parse((await callKI(prompt, { model: KI_MODEL_HAIKU, maxTokens: 500 })).match(/\{[\s\S]*\}/)?.[0] || '{}');
        ['Einstieg','Erarbeitung','Sicherung'].forEach(t => { if (parsed[t]?.name) stunde.methoden[t] = parsed[t]; });
        scheduleSave(); renderMethodeBody();
      } catch(e) { alert('Fehler: ' + e.message); kiAlleBtn.textContent = '✨ KI schlägt alle drei vor'; kiAlleBtn.disabled = false; }
    };
    s3body.appendChild(kiAlleBtn);

    // ── Drei Slots ──────────────────────────────────────────────────
    ['Einstieg','Erarbeitung','Sicherung'].forEach(typ => {
      const farbe = METH_FARBE[typ];
      const slot = mk('div', 'meth-slot');
      slot.style.borderLeft = '3px solid ' + farbe;

      const badge = tx('span', 'meth-slot-badge', typ);
      badge.style.color = farbe;
      slot.appendChild(badge);

      const gesetzt = stunde.methoden[typ];
      if (gesetzt?.name) {
        const nameRow = mk('div', 'meth-slot-set');
        nameRow.appendChild(tx('span', 'meth-slot-name', gesetzt.name));
        const clrBtn = mk('button', 'meth-slot-clr'); clrBtn.textContent = '✕';
        clrBtn.onclick = () => { stunde.methoden[typ] = null; scheduleSave(); renderMethodeBody(); };
        nameRow.appendChild(clrBtn);
        slot.appendChild(nameRow);
        if (gesetzt.begr) slot.appendChild(tx('div', 'meth-slot-begr', '✨ ' + gesetzt.begr));
        const info = METHDB.find(m => m.id === gesetzt.id || m.name === gesetzt.name);
        if (info?.beschreibung) slot.appendChild(tx('div', 'meth-slot-info', info.beschreibung));
      } else {
        const row = mk('div', 'meth-slot-pick');
        const pool = METHDB.filter(m => !m.phasen?.length || m.phasen.includes(typ));
        const si = document.createElement('input');
        si.type = 'text'; si.placeholder = 'Methode suchen…'; si.className = 'mat-search-inp'; si.style.flex = '1';
        const dd = mk('div', 'mat-dd');
        si.oninput = () => {
          const q = si.value.toLowerCase().trim();
          dd.innerHTML = ''; dd.style.display = 'none';
          if (!q) return;
          const hits = (pool.length ? pool : METHDB).filter(m => m.name.toLowerCase().includes(q) || (m.beschreibung||'').toLowerCase().includes(q)).slice(0,8);
          if (!hits.length) return;
          hits.forEach(m => {
            const it = mk('div', 'mat-dd-item');
            it.appendChild(tx('strong', '', m.name));
            if (m.beschreibung) it.appendChild(tx('div', 'mat-dd-sub', m.beschreibung.slice(0,70)));
            it.onmousedown = () => { stunde.methoden[typ] = { id: m.id, name: m.name, begr: '' }; scheduleSave(); renderMethodeBody(); };
            dd.appendChild(it);
          });
          dd.style.display = 'block';
        };
        si.onblur = () => setTimeout(() => { dd.style.display = 'none'; }, 150);
        const sw = mk('div', 'mat-search-wrap'); sw.style.flex = '1';
        sw.appendChild(si); sw.appendChild(dd);
        row.appendChild(sw);
        const kiBtn = mk('button', 'ph-meth-ki'); kiBtn.textContent = '✨'; kiBtn.title = 'KI wählt';
        kiBtn.onclick = async () => {
          const antKey = localStorage.getItem('ant_key');
          if (!antKey) { alert('Bitte API-Key hinterlegen.'); return; }
          kiBtn.textContent = '⏳'; kiBtn.disabled = true;
          const mp = (pool.length ? pool : METHDB).map(m => `ID:${m.id}|${m.name}${m.beschreibung?' – '+m.beschreibung.slice(0,80):''}`).join('\n');
          const p = `Wähle die passendste Methode für die ${typ}-Phase. Fach: ${fp.fach}, Jg: ${fp.jahrgang}, Lernziel: ${stunde.lernziel||'–'}\nMethoden:\n${mp}\nJSON: {"id":"ID","name":"Name","begr":"1 Satz"}`;
          try {
            const parsed = JSON.parse((await callKI(p, { model: KI_MODEL_HAIKU, maxTokens: 200 })).match(/\{[\s\S]*\}/)?.[0] || '{}');
            if (parsed.name) { stunde.methoden[typ] = parsed; scheduleSave(); renderMethodeBody(); }
          } catch(e) { alert('Fehler: ' + e.message); kiBtn.textContent = '✨'; kiBtn.disabled = false; }
        };
        row.appendChild(kiBtn);
        slot.appendChild(row);
      }
      s3body.appendChild(slot);
    });
  }
  renderMethodeBody();

  // Auto-KI: wenn alle Slots noch leer sind, direkt loslegen
  const alleSlotLeer = ['Einstieg','Erarbeitung','Sicherung'].every(t => !stunde.methoden[t]?.name);
  if (alleSlotLeer && !stunde._methKiTriggered && localStorage.getItem('ant_key')) {
    stunde._methKiTriggered = true;
    setTimeout(() => s3body.querySelector('.btn-ki')?.click(), 200);
  }

  // ══════════════════════════════════════════════════════════════════
  // SEKTION 4: Planungsrahmen
  // ══════════════════════════════════════════════════════════════════
  const prStatusText = prFertig ? '✓ fertig' : 'offen';
  const prKiBtn = btn('✨ KI wählt', 'btn btn-ki btn-xs');
  const { body: s4body, acts: s4acts } = mkSec(4, 'Planungsrahmen', 'planungsrahmen', prStatusText, prFertig);
  s4acts.appendChild(prKiBtn);

  prKiBtn.onclick = async () => {
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) { alert('Bitte zuerst Anthropic API-Key hinterlegen.'); return; }
    prKiBtn.textContent = '…'; prKiBtn.disabled = true;
    const kurs = (S.data.kurse || []).find(k => getFachplanung(k.fachplanungId)?.id === fp.id);
    const res = kurs?.ressourcen || {};
    const resText = [
      res.schulbuch ? 'Schulbuch' + (res.schulbuchTitel ? ' (' + res.schulbuchTitel + ')' : '') : '',
      res.arbeitsheft ? 'Arbeitsheft' : '',
      res.ipad ? 'iPad' : '',
      res.internet ? 'Internet' : '',
      res.beamer ? 'Beamer' : '',
      res.elmo ? 'Elmo' : '',
      ...(res.apps || []),
    ].filter(Boolean).join(', ') || '–';

    // Nutzervorgaben (bereits gesetzt = Einschränkung für KI)
    const dauerVorgabe = stunde.dauer ? `${stunde.dauer} Minuten (Vorgabe)` : 'offen – du entscheidest';
    const sozVorgabe   = pr.sozialformen?.length ? pr.sozialformen.join(', ') + ' (Vorgabe)' : 'offen – du entscheidest';
    const schwVorgabe  = pr.schwerpunkt ? pr.schwerpunkt + ' (Vorgabe)' : 'offen – du entscheidest';

    const prompt = `Du planst eine Unterrichtsstunde. Wähle für alle offenen Parameter den besten Wert.

Fach: ${fp.fach || '–'}, Jahrgang: ${fp.jahrgang || '–'}
Lernziel: ${stunde.lernziel || '–'}
Intention: ${stunde.intention || '–'}
Verfügbare Ressourcen: ${resText}
${getDIDContext(['stunde'])}
Parameter (Vorgaben musst du einhalten, offene darfst du frei wählen):
- Dauer: ${dauerVorgabe}
- Sozialformen: ${sozVorgabe}
- Schwerpunkt: ${schwVorgabe}

Für offene Parameter wähle aus:
- dauer: 45 oder 90
- sozialformen: Array aus ["Plenum","Partnerarbeit","Gruppenarbeit","Einzelarbeit"]
- schwerpunkt: einer von ["Einführung","Erarbeitung","Übung & Festigung","Sicherung","Experiment","Diskussion","Präsentation"]

Antworte NUR als JSON mit den offenen Feldern (Vorgaben weglassen):
{}`;
    try {
      const parsed = JSON.parse((await callKI(prompt, { model: KI_MODEL_HAIKU, maxTokens: 200 })).match(/\{[\s\S]*\}/)?.[0] || '{}');
      const gewählt = [];
      if (parsed.dauer && !stunde.dauer) { stunde.dauer = parsed.dauer; gewählt.push('dauer'); }
      if (parsed.sozialformen?.length && !pr.sozialformen?.length) { pr.sozialformen = parsed.sozialformen; gewählt.push('sozialformen'); }
      if (parsed.schwerpunkt && !pr.schwerpunkt) { pr.schwerpunkt = parsed.schwerpunkt; gewählt.push('schwerpunkt'); }
      pr.kiGewählt = [...new Set([...(pr.kiGewählt || []), ...gewählt])];
      scheduleSave(); render();
    } catch(e) { alert('Fehler: ' + e.message); }
    prKiBtn.textContent = '✨ KI wählt'; prKiBtn.disabled = false;
  };

  function prSection(label, hint) {
    const h = mk('div', '');
    h.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px;margin-top:12px;display:flex;align-items:center;gap:6px;';
    h.appendChild(tx('span', '', label));
    if (hint) h.appendChild(tx('span', '', '· ' + hint).style && h.lastChild || (() => { const s = tx('span','',hint); s.style.cssText='font-weight:400;text-transform:none;color:var(--tx3);'; return s; })());
    s4body.appendChild(h);
  }
  function prChips(key, options, multi) {
    const wrap = mk('div', 'pr-chip-wrap');
    const kiSet = (pr.kiGewählt || []).includes(key);
    options.forEach(opt => {
      const isActive = multi ? (pr[key] || []).includes(opt) : pr[key] === opt;
      const b = mk('button', 'btn btn-xs pr-chip' + (isActive ? ' active' : '') + (isActive && kiSet ? ' ki' : ''));
      b.textContent = isActive && kiSet ? '✨ ' + opt : opt;
      b.onclick = () => {
        if (multi) {
          if (!pr[key]) pr[key] = [];
          pr[key] = pr[key].includes(opt) ? pr[key].filter(x => x !== opt) : [...pr[key], opt];
        } else {
          pr[key] = pr[key] === opt ? null : opt;
        }
        pr.kiGewählt = (pr.kiGewählt || []).filter(k => k !== key);
        scheduleSave(); render();
      };
      wrap.appendChild(b);
    });
    s4body.appendChild(wrap);
  }

  // ── Dauer (Checkboxen 45 / 90, leer = KI entscheidet) ──────────
  prSection('Dauer');
  const dauerWrap = mk('div', 'pr-chip-wrap');
  const kiDauer = (pr.kiGewählt || []).includes('dauer');
  [45, 90].forEach(min => {
    const isActive = stunde.dauer === min;
    const b = mk('button', 'btn btn-xs pr-chip' + (isActive ? ' active' : '') + (isActive && kiDauer ? ' ki' : ''));
    b.textContent = (isActive && kiDauer ? '✨ ' : '') + min + ' min';
    b.onclick = () => {
      stunde.dauer = isActive ? null : min;
      pr.kiGewählt = (pr.kiGewählt || []).filter(k => k !== 'dauer');
      scheduleSave(); render();
    };
    dauerWrap.appendChild(b);
  });
  s4body.appendChild(dauerWrap);

  // ── Sozialformen ────────────────────────────────────────────────
  prSection('Sozialformen');
  prChips('sozialformen', ['Plenum', 'Partnerarbeit', 'Gruppenarbeit', 'Einzelarbeit'], true);

  // ── Schwerpunkt ─────────────────────────────────────────────────
  prSection('Schwerpunkt');
  prChips('schwerpunkt', ['Einführung', 'Erarbeitung', 'Übung & Festigung', 'Sicherung', 'Experiment', 'Diskussion', 'Präsentation'], false);

  prSection('Besondere Hinweise');
  const hinweisTA = document.createElement('textarea');
  hinweisTA.className = 'finp'; hinweisTA.rows = 2; hinweisTA.style.cssText = 'resize:none;font-size:13px;';
  hinweisTA.placeholder = 'z.B. Heute kein Beamer, Max fehlt, Raumwechsel…';
  hinweisTA.value = pr.hinweise || '';
  hinweisTA.oninput = e => { pr.hinweise = e.target.value; scheduleSave(); };
  s4body.appendChild(hinweisTA);

  // ══════════════════════════════════════════════════════════════════
  // SEKTION 5: Phasen
  // ══════════════════════════════════════════════════════════════════
  const phStatusText = phFertig ? `✓ ${stunde.phasen.length} Phasen` : 'offen';
  const kiVorlageBtn = btn('✨ KI entscheidet', 'btn btn-ki btn-xs');
  const apb = btn('+ Phase', 'btn btn-pri btn-xs');
  const { body: s5body, acts: s5acts } = mkSec(5, 'Phasen', 'phasen', phStatusText, phFertig);
  s5acts.appendChild(kiVorlageBtn);
  s5acts.appendChild(apb);

  const PHASEN_VORLAGEN = {
    '3-Phasen': [
      { titel: 'Einstieg',    minuten: 10, typ: 'Einstieg' },
      { titel: 'Erarbeitung', minuten: 25, typ: 'Erarbeitung' },
      { titel: 'Sicherung',   minuten: 10, typ: 'Sicherung' },
    ],
    'AVIVA': [
      { titel: 'Ankommen & Einstimmen', minuten: 5,  typ: 'Einstieg' },
      { titel: 'Vorwissen aktivieren',  minuten: 8,  typ: 'Einstieg' },
      { titel: 'Informieren',           minuten: 15, typ: 'Erarbeitung' },
      { titel: 'Verarbeiten',           minuten: 12, typ: 'Erarbeitung' },
      { titel: 'Auswerten',             minuten: 5,  typ: 'Sicherung' },
    ],
    'Direkte Instruktion': [
      { titel: 'I do (Modellieren)',        minuten: 15, typ: 'Einstieg' },
      { titel: 'We do (Gemeinsam üben)',    minuten: 15, typ: 'Erarbeitung' },
      { titel: 'You do (Selbstständig üben)', minuten: 15, typ: 'Sicherung' },
    ],
    'Forschend-entdeckend': [
      { titel: 'Phänomen / Einstieg',          minuten: 8,  typ: 'Einstieg' },
      { titel: 'Hypothesenbildung',             minuten: 7,  typ: 'Einstieg' },
      { titel: 'Experiment / Erarbeitung',      minuten: 20, typ: 'Erarbeitung' },
      { titel: 'Auswertung & Schlussfolgerung', minuten: 10, typ: 'Sicherung' },
    ],
  };
  const MODELL_META = {
    '3-Phasen':             { icon: '📐', phasen: 'Einstieg · Erarbeitung · Sicherung',                         hinweis: 'Klassisch, vielseitig' },
    'AVIVA':                { icon: '🔄', phasen: 'Ankommen · Vorwissen · Informieren · Verarbeiten · Auswerten', hinweis: 'Lernprozessorientiert' },
    'Direkte Instruktion':  { icon: '🎯', phasen: 'I do · We do · You do',                                       hinweis: 'Schrittweise Übergabe' },
    'Forschend-entdeckend': { icon: '🔬', phasen: 'Phänomen · Hypothese · Experiment · Auswertung',              hinweis: 'Entdeckendes Lernen' },
  };
  function applyVorlage(key, skipConfirm) {
    if (!skipConfirm && stunde.phasen.length > 0 && !confirm('Vorhandene Phasen ersetzen?')) return false;
    stunde.phasenModell = key;
    stunde.phasen = PHASEN_VORLAGEN[key].map(p => ({
      id: uid(), titel: p.titel, inhalt: '', methode: '', sozialform: '', minuten: p.minuten, materialIds: [], typ: p.typ || ''
    }));
    scheduleSave(); render();
    return true;
  }

  const modellGrid = mk('div', 'modell-grid');
  Object.keys(MODELL_META).forEach(key => {
    const meta = MODELL_META[key];
    const kachel = mk('div', 'modell-kachel' + (stunde.phasenModell === key ? ' active' : ''));
    kachel.appendChild(tx('div', 'modell-icon', meta.icon));
    kachel.appendChild(tx('div', 'modell-name', key));
    kachel.appendChild(tx('div', 'modell-phasen', meta.phasen));
    kachel.appendChild(tx('div', 'modell-hinweis', meta.hinweis));
    kachel.onclick = () => applyVorlage(key);
    modellGrid.appendChild(kachel);
  });
  if (stunde.phasenModellBegruendung) {
    const begr = mk('div', 'modell-ki-begr');
    begr.appendChild(tx('span', 'modell-ki-begr-icon', '✨'));
    begr.appendChild(tx('span', '', stunde.phasenModellBegruendung));
    modellGrid.appendChild(begr);
  }
  s5body.appendChild(modellGrid);

  kiVorlageBtn.onclick = async () => {
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) { alert('Bitte zuerst Anthropic API-Key in den Einstellungen hinterlegen.'); return; }
    kiVorlageBtn.textContent = '…'; kiVorlageBtn.disabled = true;
    try {
      const wissenText = Object.keys(PHASEN_VORLAGEN).map(key =>
        `## ${key}\n${DIDAKTIKDB[key] || '(kein Hintergrundwissen hinterlegt)'}`
      ).join('\n\n');
      const lernzieleText = stunde.lernziele?.length
        ? stunde.lernziele.map((z, i) => `${i+1}. ${z.text}`).join('\n')
        : '–';
      const pr2 = stunde.planungsrahmen || {};
      const prText = [
        pr2.sozialformen?.length ? 'Sozialformen: ' + pr2.sozialformen.join(', ') : '',
        pr2.schwerpunkt ? 'Schwerpunkt: ' + pr2.schwerpunkt : '',
        pr2.differenzierung ? 'Differenzierung: ' + pr2.differenzierung : '',
        pr2.hausaufgaben != null ? 'Hausaufgaben: ' + (pr2.hausaufgaben ? 'Ja' : 'Nein') : '',
        pr2.hinweise ? 'Hinweise: ' + pr2.hinweise : '',
      ].filter(Boolean).join('\n') || '–';
      const prompt = `Du bist Didaktik-Experte für NRW-Gymnasien. Wähle für diese Unterrichtsstunde das passende Phasierungsmodell und befülle die Phasen konkret und sinnvoll.

Stunde:
- Fach: ${fp.fach || '–'}, Jahrgang: ${fp.jahrgang || '–'}
- Titel: ${stunde.titel || '–'}
- Dauer: ${stunde.dauer || 45} Minuten
- Intention: ${stunde.intention || '–'}
- Lernziele:
${lernzieleText}
- Planungsrahmen:
${prText}

Didaktisches Hintergrundwissen (Phasenmodelle):
${wissenText}
${getDIDContext(['stunde'], getLGThemen((getAktKurs(fp.id)||{}).id||''), true)}

Verfügbare Modelle (nur eines wählen):
- 3-Phasen: Einstieg / Erarbeitung / Sicherung
- AVIVA: Ankommen / Vorwissen / Informieren / Verarbeiten / Auswerten
- Direkte Instruktion: I do / We do / You do
- Forschend-entdeckend: Phänomen / Hypothese / Experiment / Auswertung

Antworte NUR als JSON-Objekt. WICHTIG: Keine Zeilenumbrüche innerhalb von Strings – schreibe alles in einer Zeile pro Feld:
{
  "modell": "3-Phasen",
  "begruendung": "Ein Satz, warum dieses Modell passt.",
  "phasen": [
    { "titel": "Einstieg", "inhalt": "Konkrete Beschreibung in einem Satz ohne Zeilenumbruch", "methode": "z.B. Unterrichtsgespräch", "sozialform": "z.B. Plenum", "minuten": 10 }
  ]
}`;
      const text = await callKI(prompt, { maxTokens: 1400, label: 'stunde-vorschlag' });
      const raw = text.match(/\{[\s\S]*\}/)?.[0] || '{}';
      const sanitized = raw.replace(/[\r\n\t]+/g, ' ');
      const parsed = JSON.parse(sanitized);
      if (!parsed.phasen?.length) throw new Error('Keine Phasen erhalten');
      if (stunde.phasen.length > 0 && !confirm(`KI wählt: ${parsed.modell}\n„${parsed.begruendung}"\n\nVorhandene Phasen ersetzen?`)) {
        kiVorlageBtn.textContent = '✨ KI entscheidet'; kiVorlageBtn.disabled = false; return;
      }
      stunde.phasenModell = parsed.modell;
      stunde.phasenModellBegruendung = parsed.begruendung || '';
      stunde.phasen = parsed.phasen.map(p => ({
        id: uid(), titel: p.titel || '', inhalt: p.inhalt || '',
        methode: p.methode || '', sozialform: p.sozialform || '',
        minuten: parseInt(p.minuten) || 0, materialIds: []
      }));
      scheduleSave(); render();
    } catch(e) {
      alert('Fehler: ' + e.message);
      kiVorlageBtn.textContent = '✨ KI entscheidet'; kiVorlageBtn.disabled = false;
    }
  };

  apb.onclick = () => {
    stunde.phasen.push({ id: uid(), titel: '', inhalt: '', methode: '', sozialform: '', minuten: 0, materialIds: [] });
    scheduleSave(); render();
  };

  const pb = mk('div', '');
  pb.appendChild(phasenTable(stunde));
  s5body.appendChild(pb);

  // ══════════════════════════════════════════════════════════════════
  // UNTERHALB DER SEKTIONEN: Tafelbild + Lehrerkommentar
  // ══════════════════════════════════════════════════════════════════
  const below = mk('div', 'plan-below');

  const tc = mk('div', 'card');
  tc.appendChild(cardHdr('Tafelbild'));
  const tb = mk('div', 'card-body');
  const tafel = mk('div', 'tafel');
  const ta = document.createElement('textarea');
  ta.placeholder = 'Tafelbild skizzieren…';
  ta.value = stunde.tafelbild || '';
  ta.oninput = e => { stunde.tafelbild = e.target.value; scheduleSave(); };
  tafel.appendChild(ta);
  tb.appendChild(tafel);
  tc.appendChild(tb);
  below.appendChild(tc);

  const lc = mk('div', 'card');
  lc.appendChild(cardHdr('Erläuterungen für die Lehrkraft'));
  const lb = mk('div', 'card-body');
  lb.appendChild(fieldArea('', stunde.lehrerkommentar || '',
    v => { stunde.lehrerkommentar = v; scheduleSave(); }, 'min-height:120px;'));
  lc.appendChild(lb);
  below.appendChild(lc);

  secs.appendChild(below);
}

function viewStunde(fpId, blockId, reiheId, stundeId) {
  const fp     = getFachplanung(fpId);
  const block  = findBlock(fpId, blockId);
  const reihe  = findReihe(fpId, blockId, reiheId);
  const stunde = findStunde(fpId, blockId, reiheId, stundeId);
  if (!fp || !block || !reihe || !stunde) {
    S.sel = null; render(); return mk('div', '');
  }
  initStunde(stunde);

  // Gruppe (falls vorhanden)
  const gruppe = stunde.einheitId ? findEinheit(fpId, blockId, reiheId, stunde.einheitId) : null;

  const div = mk('div', '');
  div.appendChild(breadcrumb([
    { label: fachLabel(fp.fach) + ' ' + fp.jahrgang, action: () => { S.sel = null; render(); } },
    { label: block.titel, action: () => { S.sel = { type: 'block', ids: [fpId, blockId] }; render(); } },
    { label: reihe.titel, action: () => { S.sel = { type: 'reihe', ids: [fpId, blockId, reiheId] }; render(); } },
  ]));

  // Nachbarstunden in der Reihenfolge der Reihe — für die Blättern-Pfeile
  const alleStunden = reihe.stunden || [];
  const idx    = alleStunden.findIndex(s => s.id === stundeId);
  const vorige = idx > 0 ? alleStunden[idx - 1] : null;
  const naechste = (idx >= 0 && idx < alleStunden.length - 1) ? alleStunden[idx + 1] : null;
  const zuStunde = s => {
    S.sel = { type: 'stunde', ids: [fpId, blockId, reiheId, s.id] };
    render();
    const c = document.querySelector('.content');
    if (c) c.scrollTop = 0;      // oben anfangen, nicht mitten im Vorgänger
  };

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', stunde.titel || 'Stunde'));
  const subTxt = (stundeEinheiten(stunde) > 1 ? 'Doppelstunde' : 'Unterrichtsstunde')
    + (idx >= 0 ? ' ' + (idx + 1) + ' von ' + alleStunden.length : '')
    + (gruppe ? ' · ' + gruppe.titel : '');
  left.appendChild(tx('div', 'c-sub', subTxt));
  hdr.appendChild(left);
  const hdrBtns = mk('div', 'btn-grp');

  // Blättern innerhalb der Reihe
  const zurueck = btn('‹', 'btn btn-ghost btn-sm stunde-pfeil');
  zurueck.title = vorige ? 'Vorherige Stunde: ' + (vorige.titel || 'ohne Titel')
                         : 'Erste Stunde der Reihe';
  zurueck.disabled = !vorige;
  if (vorige) zurueck.onclick = () => zuStunde(vorige);
  hdrBtns.appendChild(zurueck);

  const vor = btn('›', 'btn btn-ghost btn-sm stunde-pfeil');
  vor.title = naechste ? 'Nächste Stunde: ' + (naechste.titel || 'ohne Titel')
                       : 'Letzte Stunde der Reihe';
  vor.disabled = !naechste;
  if (naechste) vor.onclick = () => zuStunde(naechste);
  hdrBtns.appendChild(vor);

  const mvb = btn('↗ Verschieben', 'btn btn-ghost btn-sm');
  mvb.onclick = () => { S.modal = { type: 'moveStunde', data: { fpId, blockId, reiheId, stundeId } }; render(); };
  hdrBtns.appendChild(mvb);
  const db = btn('🗑 Löschen', 'btn btn-danger btn-sm');
  db.onclick = () => {
    if (confirm('Stunde löschen?')) {
      reihe.stunden = (reihe.stunden || []).filter(s => s.id !== stundeId);
      S.sel = { type: 'reihe', ids: [fpId, blockId, reiheId] };
      scheduleSave(); render();
    }
  };
  hdrBtns.appendChild(db);
  hdr.appendChild(hdrBtns);
  div.appendChild(hdr);

  renderStundenBody(div, stunde, fp);
  return div;
}


function viewFreieStunde(fpId, stundeId) {
  const fp = getFachplanung(fpId);
  if (!fp.freieStunden) fp.freieStunden = [];
  const stunde = fp.freieStunden.find(s => s.id === stundeId);
  if (!stunde) return tx('div', 'c-hdr', 'Stunde nicht gefunden.');
  initStunde(stunde);

  const div = mk('div', '');
  div.appendChild(breadcrumb([
    { label: fachLabel(fp.fach) + ' ' + fp.jahrgang, action: () => { S.aktFpId = fpId; S.view = 'fachplanung'; S.sel = null; render(); } },
    { label: 'Freie Stunden', action: () => { S.aktFpId = fpId; S.view = 'freieStunden'; S.sel = null; render(); } },
  ]));

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', stunde.titel || 'Neue Stunde'));
  left.appendChild(tx('div', 'c-sub', 'Freie Stunde · ' + fachLabel(fp.fach) + ' ' + fp.jahrgang));
  hdr.appendChild(left);
  const db = btn('🗑 Löschen', 'btn btn-danger btn-sm');
  db.onclick = () => {
    if (confirm('Stunde löschen?')) {
      fp.freieStunden = fp.freieStunden.filter(s => s.id !== stundeId);
      S.view = 'freieStunden'; S.aktFpId = fpId; S.sel = null;
      scheduleSave(); render();
    }
  };
  hdr.appendChild(db);
  div.appendChild(hdr);

  renderStundenBody(div, stunde, fp);
  return div;
}
