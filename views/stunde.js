// ── Stunden-Ansicht ──────────────────────────────────────────────
function initStunde(stunde) {
  if (!stunde.klpInhalt) stunde.klpInhalt = [];
  if (!stunde.klpProzess) stunde.klpProzess = [];
  if (!stunde.phasen) stunde.phasen = [];
  if (!stunde.material) stunde.material = [];
  if (!stunde.lernziele) stunde.lernziele = [];
}

function renderStundenBody(div, stunde, fp) {
  // ── Grunddaten ─────────────────────────────────────────────────
  const gc = mk('div', 'card');
  gc.appendChild(cardHdr('Grunddaten'));
  const gb = mk('div', 'card-body');
  gb.appendChild(fieldInput('Kurztitel', stunde.titel || '', v => { stunde.titel = v; scheduleSave(); }));
  gb.appendChild(fieldInput('Langtitel', stunde.langtitel || '', v => { stunde.langtitel = v; scheduleSave(); }));
  gb.appendChild(fieldArea('Intention', stunde.intention || '', v => { stunde.intention = v; scheduleSave(); }, '', 'Worum geht es in dieser Stunde? Worauf soll sie hinauslaufen?'));

  const prioFg = mk('div', 'fg');
  prioFg.appendChild(tx('label', 'fl', 'Typ / Priorität'));
  const prioWrap = mk('div', 'prio-wrap');
  const PRIOS = [
    { val: 'pflicht', label: '🟢 Pflicht', title: 'Muss gemacht werden' },
    { val: 'optional', label: '🟡 Optional', title: 'Kann bei Zeitmangel entfallen' },
    { val: 'puffer', label: '🔵 Puffer', title: 'Wiederholung / Reserve' },
    { val: 'klassenarbeit', label: '📝 Klassenarbeit', title: 'Klassenarbeit' },
    { val: 'rueckgabe', label: '📋 Rückgabe', title: 'Rückgabe / Besprechung' },
  ];
  if (!stunde.prioritaet) stunde.prioritaet = 'pflicht';
  PRIOS.forEach(p => {
    const b = mk('button', 'prio-btn' + (stunde.prioritaet === p.val ? ' active' : ''));
    b.textContent = p.label; b.title = p.title;
    b.onclick = () => { stunde.prioritaet = p.val; scheduleSave(); render(); };
    prioWrap.appendChild(b);
  });
  prioFg.appendChild(prioWrap);
  gb.appendChild(prioFg);

  gb.appendChild(fieldArea('Stundenbeschreibung', stunde.lernziel || '', v => { stunde.lernziel = v; scheduleSave(); }, '', 'Inhaltliche Zusammenfassung – was passiert in dieser Stunde?'));
  const dfg = mk('div', 'fg');
  dfg.appendChild(tx('label', 'fl', 'Dauer (Minuten)'));
  const di = document.createElement('input');
  di.type = 'number'; di.value = stunde.dauer || 45; di.className = 'finp';
  di.style.maxWidth = '120px';
  di.oninput = e => { stunde.dauer = parseInt(e.target.value) || 45; scheduleSave(); };
  dfg.appendChild(di);
  gb.appendChild(dfg);
  gc.appendChild(gb);
  div.appendChild(gc);

  // ── Lernziele ──────────────────────────────────────────────────
  const lzCard = mk('div', 'card');
  const lzHdr = cardHdr('Lernziele');

  const lzKiBtn = btn('✨ KI → Lernziele ableiten', 'btn btn-ghost btn-xs');
  lzKiBtn.onclick = async () => {
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) { alert('Bitte zuerst Anthropic API-Key in den Einstellungen hinterlegen.'); return; }
    if (!stunde.intention) { alert('Bitte zuerst die Intention ausfüllen.'); return; }
    lzKiBtn.textContent = '…'; lzKiBtn.disabled = true;
    try {
      const prompt = `Du bist erfahrene Lehrerin an einem NRW-Gymnasium (${fp.fach || 'Naturwissenschaft'}, ${fp.jahrgang || ''}).

Aus der folgenden Intention einer Unterrichtsstunde leitest du 2–3 operationalisierte Lernziele ab.

Format: Jedes Lernziel besteht aus:
- "text": "Die SuS können/wissen …" (präzise, fachlich korrekt)
- "indikator": "Das ist erkennbar, wenn …" (konkret beobachtbares Schülerverhalten oder Produkt)

Intention der Stunde:
${stunde.intention}

${stunde.lernziel ? 'Stundenbeschreibung (Kontext):\n' + stunde.lernziel : ''}

Antworte NUR als JSON-Array:
[
  { "text": "Die SuS können …", "indikator": "Das ist erkennbar, wenn …" }
]`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': antKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 800,
          messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const parsed = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || '[]');
      if (!parsed.length) throw new Error('Keine Lernziele erhalten');
      const neu = parsed.map(z => ({ id: uid(), text: z.text || '', indikator: z.indikator || '' }));
      if (stunde.lernziele.length > 0 && !confirm('Vorhandene Lernziele ersetzen?')) {
        lzKiBtn.textContent = '✨ KI → Lernziele ableiten'; lzKiBtn.disabled = false; return;
      }
      stunde.lernziele = neu;
      scheduleSave(); render();
    } catch(e) {
      alert('Fehler: ' + e.message);
      lzKiBtn.textContent = '✨ KI → Lernziele ableiten'; lzKiBtn.disabled = false;
    }
  };
  lzHdr.appendChild(lzKiBtn);

  const lzAddBtn = btn('+ Manuell', 'btn btn-pri btn-xs');
  lzAddBtn.onclick = () => {
    stunde.lernziele.push({ id: uid(), text: '', indikator: '' });
    scheduleSave(); render();
  };
  lzHdr.appendChild(lzAddBtn);
  lzCard.appendChild(lzHdr);

  const lzBody = mk('div', 'card-body');
  if (stunde.lernziele.length === 0) {
    lzBody.appendChild(tx('div', 'empty-hint', 'Noch keine Lernziele – KI ableiten oder manuell hinzufügen.'));
  } else {
    stunde.lernziele.forEach((lz, i) => {
      const row = mk('div', 'lz-row');
      const nr = tx('div', 'lz-nr', (i + 1) + '.');
      const fields = mk('div', 'lz-fields');

      const ta1 = document.createElement('textarea');
      ta1.className = 'lz-text finp';
      ta1.placeholder = 'Die SuS können/wissen …';
      ta1.value = lz.text;
      ta1.oninput = e => { lz.text = e.target.value; scheduleSave(); };
      fields.appendChild(ta1);

      const ta2 = document.createElement('textarea');
      ta2.className = 'lz-indikator finp';
      ta2.placeholder = 'Das ist erkennbar, wenn …';
      ta2.value = lz.indikator;
      ta2.oninput = e => { lz.indikator = e.target.value; scheduleSave(); };
      fields.appendChild(ta2);

      const delBtn = btn('🗑', 'btn btn-danger btn-xs lz-del');
      delBtn.onclick = () => {
        stunde.lernziele = stunde.lernziele.filter(z => z.id !== lz.id);
        scheduleSave(); render();
      };

      row.appendChild(nr);
      row.appendChild(fields);
      row.appendChild(delBtn);
      lzBody.appendChild(row);
    });
  }
  lzCard.appendChild(lzBody);
  div.appendChild(lzCard);

  // ── Phasen ─────────────────────────────────────────────────────
  const pc = mk('div', 'card');
  const phdr = cardHdr('Unterrichtsphasen');

  const PHASEN_VORLAGEN = {
    '3-Phasen': [
      { titel: 'Einstieg', minuten: 10 },
      { titel: 'Erarbeitung', minuten: 25 },
      { titel: 'Sicherung', minuten: 10 },
    ],
    'AVIVA': [
      { titel: 'Ankommen & Einstimmen', minuten: 5 },
      { titel: 'Vorwissen aktivieren', minuten: 8 },
      { titel: 'Informieren', minuten: 15 },
      { titel: 'Verarbeiten', minuten: 12 },
      { titel: 'Auswerten', minuten: 5 },
    ],
    'Direkte Instruktion': [
      { titel: 'I do (Modellieren)', minuten: 15 },
      { titel: 'We do (Gemeinsam üben)', minuten: 15 },
      { titel: 'You do (Selbstständig üben)', minuten: 15 },
    ],
    'Forschend-entdeckend': [
      { titel: 'Phänomen / Einstieg', minuten: 8 },
      { titel: 'Hypothesenbildung', minuten: 7 },
      { titel: 'Experiment / Erarbeitung', minuten: 20 },
      { titel: 'Auswertung & Schlussfolgerung', minuten: 10 },
    ],
  };

  function applyVorlage(key) {
    if (stunde.phasen.length > 0 && !confirm('Vorhandene Phasen ersetzen?')) return;
    stunde.phasen = PHASEN_VORLAGEN[key].map(p => ({
      id: uid(), titel: p.titel, inhalt: '', methode: '', sozialform: '', minuten: p.minuten, materialIds: []
    }));
    scheduleSave(); render();
  }

  const vorlagenWrap = mk('div', 'phasen-vorlage-wrap');
  const vorlagenSel = document.createElement('select');
  vorlagenSel.className = 'finp phasen-vorlage-sel';
  const emptyOpt = document.createElement('option');
  emptyOpt.value = ''; emptyOpt.textContent = '📋 Vorlage wählen…';
  vorlagenSel.appendChild(emptyOpt);
  Object.keys(PHASEN_VORLAGEN).forEach(key => {
    const o = document.createElement('option'); o.value = key; o.textContent = key;
    vorlagenSel.appendChild(o);
  });
  vorlagenSel.onchange = () => {
    if (vorlagenSel.value) { applyVorlage(vorlagenSel.value); vorlagenSel.value = ''; }
  };
  vorlagenWrap.appendChild(vorlagenSel);

  const kiVorlageBtn = btn('✨ KI', 'btn btn-ghost btn-xs');
  kiVorlageBtn.title = 'KI wählt passendes Modell anhand von Titel und Lernziel';
  kiVorlageBtn.onclick = async () => {
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) { alert('Bitte zuerst Anthropic API-Key in den Einstellungen hinterlegen.'); return; }
    kiVorlageBtn.textContent = '…'; kiVorlageBtn.disabled = true;
    try {
      const wissenText = Object.keys(PHASEN_VORLAGEN).map(key =>
        `## ${key}\n${DIDAKTIKDB[key] || '(kein Hintergrundwissen hinterlegt)'}`
      ).join('\n\n');

      const prompt = `Du bist Didaktik-Experte für NRW-Gymnasien. Wähle für diese Unterrichtsstunde das passende Phasierungsmodell aus und befülle die Phasen sinnvoll. Stütze deine Entscheidung auf das didaktische Wissensmodell unten.

Stunde:
- Titel: ${stunde.titel || '–'}
- Lernziel: ${stunde.lernziel || '–'}
- Intention: ${stunde.intention || '–'}
- Fach: ${fp.fach || '–'}
- Dauer: ${stunde.dauer || 45} Minuten

Didaktisches Wissensmodell:
${wissenText}

Verfügbare Modelle:
- 3-Phasen: Einstieg / Erarbeitung / Sicherung
- AVIVA: Ankommen / Vorwissen / Informieren / Verarbeiten / Auswerten
- Direkte Instruktion: I do / We do / You do
- Forschend-entdeckend: Phänomen / Hypothese / Experiment / Auswertung

Antworte NUR als JSON-Objekt:
{
  "modell": "3-Phasen",
  "begruendung": "kurze Begründung (1 Satz)",
  "phasen": [
    { "titel": "Einstieg", "inhalt": "konkrete Beschreibung der Aktivität", "methode": "z.B. Lehrervortrag", "sozialform": "z.B. Plenum", "minuten": 10 }
  ]
}`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': antKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1200,
          messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
      if (!parsed.phasen?.length) throw new Error('Keine Phasen erhalten');

      if (stunde.phasen.length > 0 && !confirm(`KI wählt: ${parsed.modell}\n„${parsed.begruendung}"\n\nVorhandene Phasen ersetzen?`)) {
        kiVorlageBtn.textContent = '✨ KI'; kiVorlageBtn.disabled = false; return;
      }
      stunde.phasen = parsed.phasen.map(p => ({
        id: uid(), titel: p.titel || '', inhalt: p.inhalt || '',
        methode: p.methode || '', sozialform: p.sozialform || '',
        minuten: parseInt(p.minuten) || 0, materialIds: []
      }));
      scheduleSave(); render();
    } catch(e) {
      alert('Fehler: ' + e.message);
      kiVorlageBtn.textContent = '✨ KI'; kiVorlageBtn.disabled = false;
    }
  };
  vorlagenWrap.appendChild(kiVorlageBtn);
  phdr.appendChild(vorlagenWrap);

  const apb = btn('+ Phase', 'btn btn-pri btn-xs');
  apb.onclick = () => {
    stunde.phasen.push({ id: uid(), titel: '', inhalt: '', methode: '', sozialform: '', minuten: 0, materialIds: [] });
    scheduleSave(); render();
  };
  phdr.appendChild(apb);
  pc.appendChild(phdr);
  const pb = mk('div', 'card-body');
  pb.appendChild(phasenTable(stunde));
  pc.appendChild(pb);
  div.appendChild(pc);

  // ── Tafelbild ──────────────────────────────────────────────────
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
  div.appendChild(tc);

  // ── Material ───────────────────────────────────────────────────
  const mc = mk('div', 'card');
  const mhdr = cardHdr('Material & Links');
  const amb = btn('+ Material', 'btn btn-pri btn-xs');
  amb.onclick = () => { S.modal = { type: 'addMat', data: { stunde } }; render(); };
  mhdr.appendChild(amb);
  mc.appendChild(mhdr);
  const mbd = mk('div', 'card-body');
  mbd.appendChild(materialList(stunde));
  mc.appendChild(mbd);
  div.appendChild(mc);

  // ── Lehrerkommentar ────────────────────────────────────────────
  const lc = mk('div', 'card');
  lc.appendChild(cardHdr('Erläuterungen für die Lehrkraft'));
  const lb = mk('div', 'card-body');
  lb.appendChild(fieldArea('', stunde.lehrerkommentar || '',
    v => { stunde.lehrerkommentar = v; scheduleSave(); }, 'min-height:120px;'));
  lc.appendChild(lb);
  div.appendChild(lc);
}

function viewStunde(fpId, blockId, reiheId, einheitId, stundeId) {
  const fp = getFachplanung(fpId);
  const block = findBlock(fpId, blockId);
  const reihe = findReihe(fpId, blockId, reiheId);
  const einheit = findEinheit(fpId, blockId, reiheId, einheitId);
  const stunde = findStunde(fpId, blockId, reiheId, einheitId, stundeId);
  initStunde(stunde);

  const div = mk('div', '');
  div.appendChild(breadcrumb([
    { label: fachLabel(fp.fach) + ' ' + fp.jahrgang, action: () => { S.sel = null; render(); } },
    { label: block.titel, action: () => { S.sel = { type: 'block', ids: [fpId, blockId] }; render(); } },
    { label: reihe.titel, action: () => { S.sel = { type: 'reihe', ids: [fpId, blockId, reiheId] }; render(); } },
    { label: einheit.titel, action: () => { S.sel = { type: 'einheit', ids: [fpId, blockId, reiheId, einheitId] }; render(); } },
  ]));

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', stunde.titel || 'Stunde'));
  left.appendChild(tx('div', 'c-sub', 'Unterrichtsstunde · ' + einheit.titel));
  hdr.appendChild(left);
  const db = btn('🗑 Löschen', 'btn btn-danger btn-sm');
  db.onclick = () => {
    if (confirm('Stunde löschen?')) {
      einheit.stunden = einheit.stunden.filter(s => s.id !== stundeId);
      S.sel = { type: 'einheit', ids: [fpId, blockId, reiheId, einheitId] };
      scheduleSave(); render();
    }
  };
  hdr.appendChild(db);
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
