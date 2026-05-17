// ── Einstellungen ────────────────────────────────────────────────
function viewEinstellungen() {
  const div = mk('div', '');
  const hdr = mk('div', 'c-hdr');
  hdr.appendChild(tx('div', 'c-title', 'Einstellungen'));
  div.appendChild(hdr);

  // ── KI-Einstellungen ──────────────────────────────────────────
  const aiCard = mk('div', 'card');
  aiCard.appendChild(cardHdr('KI-Einstellungen'));
  const aib = mk('div', 'card-body');

  // Anthropic Key
  const antFg = mk('div', 'fg');
  antFg.appendChild(tx('label', 'fl', 'Anthropic API-Key (Claude)'));
  const antWrap = mk('div', ''); antWrap.style.cssText = 'display:flex;gap:8px;align-items:center;';
  const antInp = document.createElement('input');
  antInp.type = 'password'; antInp.className = 'finp'; antInp.placeholder = 'sk-ant-...';
  antInp.value = localStorage.getItem('ant_key') || '';
  antInp.style.flex = '1';
  const antSave = btn('Speichern', 'btn btn-pri btn-sm');
  antSave.onclick = () => {
    const val = antInp.value.trim();
    if (val) { localStorage.setItem('ant_key', val); antSave.textContent = '✓ Gespeichert'; setTimeout(() => { antSave.textContent = 'Speichern'; }, 2000); }
    else { localStorage.removeItem('ant_key'); antSave.textContent = '✓ Gelöscht'; setTimeout(() => { antSave.textContent = 'Speichern'; }, 2000); }
  };
  antWrap.appendChild(antInp); antWrap.appendChild(antSave);
  antFg.appendChild(antWrap);
  const antHint = tx('div', '', 'Für KI-Vorschläge im KLP-Selector. Wird nur lokal gespeichert – verlässt dieses Gerät nicht.');
  antHint.style.cssText = 'font-size:11px;color:var(--tx3);margin-top:4px;';
  antFg.appendChild(antHint);
  aib.appendChild(antFg);

  // OpenAI Key
  const oaiFg = mk('div', 'fg');
  oaiFg.appendChild(tx('label', 'fl', 'OpenAI API-Key'));
  const oaiWrap = mk('div', ''); oaiWrap.style.cssText = 'display:flex;gap:8px;align-items:center;';
  const oaiInp = document.createElement('input');
  oaiInp.type = 'password'; oaiInp.className = 'finp'; oaiInp.placeholder = 'sk-proj-...';
  oaiInp.value = localStorage.getItem('oai_key') || '';
  oaiInp.style.flex = '1';
  const oaiSave = btn('Speichern', 'btn btn-pri btn-sm');
  oaiSave.onclick = () => {
    const val = oaiInp.value.trim();
    if (val) { localStorage.setItem('oai_key', val); oaiSave.textContent = '✓ Gespeichert'; setTimeout(() => { oaiSave.textContent = 'Speichern'; }, 2000); }
    else { localStorage.removeItem('oai_key'); oaiSave.textContent = '✓ Gelöscht'; setTimeout(() => { oaiSave.textContent = 'Speichern'; }, 2000); }
  };
  oaiWrap.appendChild(oaiInp); oaiWrap.appendChild(oaiSave);
  oaiFg.appendChild(oaiWrap);
  const oaiHint = tx('div', '', 'Wird nur lokal in deinem Browser gespeichert – verlässt dieses Gerät nicht.');
  oaiHint.style.cssText = 'font-size:11px;color:var(--tx3);margin-top:4px;';
  oaiFg.appendChild(oaiHint);
  aib.appendChild(oaiFg);

  aiCard.appendChild(aib);
  div.appendChild(aiCard);

  // ── Fachplanungen ─────────────────────────────────────────────
  const fpCard = mk('div', 'card');
  fpCard.appendChild(cardHdr('Fachplanungen'));
  const fpb = mk('div', 'card-body');

  const fpList = mk('div', '');
  fpList.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  (S.data.fachplanungen || []).forEach((lp, i) => {
    const row = mk('div', '');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--bord);border-radius:6px;background:var(--surf2);';

    // Reihenfolge
    const orderBtns = mk('div', '');
    orderBtns.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
    const upBtn = mk('button', 'col-action-btn');
    upBtn.textContent = '↑'; upBtn.title = 'Nach oben';
    upBtn.disabled = i === 0;
    upBtn.onclick = () => {
      const tmp = S.data.fachplanungen[i-1];
      S.data.fachplanungen[i-1] = S.data.fachplanungen[i];
      S.data.fachplanungen[i] = tmp;
      scheduleSave(); render();
    };
    const downBtn = mk('button', 'col-action-btn');
    downBtn.textContent = '↓'; downBtn.title = 'Nach unten';
    downBtn.disabled = i === S.data.fachplanungen.length - 1;
    downBtn.onclick = () => {
      const tmp = S.data.fachplanungen[i+1];
      S.data.fachplanungen[i+1] = S.data.fachplanungen[i];
      S.data.fachplanungen[i] = tmp;
      scheduleSave(); render();
    };
    orderBtns.appendChild(upBtn);
    orderBtns.appendChild(downBtn);
    row.appendChild(orderBtns);

    // Info
    const info = mk('div', '');
    info.style.flex = '1';
    info.appendChild(tx('div', '', fachLabel(lp.fach) + ' · Jahrgang ' + lp.jahrgang)).style.fontWeight = '600';
    const kurseCount = (S.data.kurse || []).filter(k => k.fachplanungId === lp.id).length;
    info.appendChild(tx('div', '', kurseCount + ' Kurs' + (kurseCount !== 1 ? 'e' : '') + ' verwenden diese Planung')).style.cssText = 'font-size:12px;color:var(--tx3);margin-top:2px;';
    row.appendChild(info);

    // Löschen
    const delBtn = btn('🗑', 'btn btn-danger btn-xs');
    delBtn.title = 'Fachplanung löschen';
    delBtn.onclick = () => {
      if (confirm('Fachplanung "' + fachLabel(lp.fach) + ' ' + lp.jahrgang + '" löschen? Alle Inhalte gehen verloren.')) {
        S.data.fachplanungen = S.data.fachplanungen.filter(l => l.id !== lp.id);
        if (S.aktFpId === lp.id) S.aktFpId = S.data.fachplanungen[0]?.id || null;
        scheduleSave(); render();
      }
    };
    row.appendChild(delBtn);
    fpList.appendChild(row);
  });
  fpb.appendChild(fpList);

  const addFpBtn = btn('+ Neue Fachplanung', 'btn btn-ghost btn-sm');
  addFpBtn.style.marginTop = '10px';
  addFpBtn.onclick = () => { S.modal = { type: 'newFachplanung' }; render(); };
  fpb.appendChild(addFpBtn);
  fpCard.appendChild(fpb);
  div.appendChild(fpCard);

  // ── Kurse ─────────────────────────────────────────────────────
  const kCard = mk('div', 'card');
  kCard.appendChild(cardHdr('Kurse'));
  const kb = mk('div', 'card-body');

  const kList = mk('div', '');
  kList.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  (S.data.kurse || []).forEach((kurs, i) => {
    const fp = getFachplanung(kurs.fachplanungId);
    const row = mk('div', '');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--bord);border-radius:6px;background:var(--surf2);';

    // Reihenfolge
    const orderBtns = mk('div', '');
    orderBtns.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
    const upBtn = mk('button', 'col-action-btn');
    upBtn.textContent = '↑'; upBtn.disabled = i === 0;
    upBtn.onclick = () => {
      const tmp = S.data.kurse[i-1];
      S.data.kurse[i-1] = S.data.kurse[i];
      S.data.kurse[i] = tmp;
      scheduleSave(); render();
    };
    const downBtn = mk('button', 'col-action-btn');
    downBtn.textContent = '↓'; downBtn.disabled = i === S.data.kurse.length - 1;
    downBtn.onclick = () => {
      const tmp = S.data.kurse[i+1];
      S.data.kurse[i+1] = S.data.kurse[i];
      S.data.kurse[i] = tmp;
      scheduleSave(); render();
    };
    orderBtns.appendChild(upBtn);
    orderBtns.appendChild(downBtn);
    row.appendChild(orderBtns);

    // Info
    const info = mk('div', '');
    info.style.flex = '1';
    const name = tx('div', '', kurs.klasse + ' · ' + kurs.schuljahr);
    name.style.fontWeight = '600';
    info.appendChild(name);
    const sub = tx('div', '', fp ? fachLabel(fp.fach) + ' · Jahrgang ' + fp.jahrgang : '– keine Fachplanung –');
    sub.style.cssText = 'font-size:12px;color:var(--tx3);margin-top:2px;';
    info.appendChild(sub);
    row.appendChild(info);

    // Bearbeiten
    const editBtn = btn('✏️', 'btn btn-ghost btn-xs');
    editBtn.title = 'Kurs bearbeiten';
    editBtn.onclick = () => { S.modal = { type: 'editKurs', data: { kurs } }; render(); };
    row.appendChild(editBtn);

    // Lerngruppe
    const lgBtn = btn('👥', 'btn btn-ghost btn-xs');
    lgBtn.title = 'Lerngruppenanalyse';
    lgBtn.onclick = () => { S.modal = { type: 'lerngruppe', data: { kurs } }; render(); };
    row.appendChild(lgBtn);

    // Löschen
    const delBtn = btn('🗑', 'btn btn-danger btn-xs');
    delBtn.title = 'Kurs löschen';
    delBtn.onclick = () => {
      if (confirm('Kurs "' + kurs.klasse + '" löschen?')) {
        S.data.kurse = S.data.kurse.filter(k => k.id !== kurs.id);
        scheduleSave(); render();
      }
    };
    row.appendChild(delBtn);
    kList.appendChild(row);
  });
  kb.appendChild(kList);

  const addKBtn = btn('+ Neuen Kurs', 'btn btn-ghost btn-sm');
  addKBtn.style.marginTop = '10px';
  addKBtn.onclick = () => { S.modal = { type: 'newKurs' }; render(); };
  kb.appendChild(addKBtn);
  kCard.appendChild(kb);
  div.appendChild(kCard);

  // ── Didaktisches Wissensmodell ────────────────────────────────
  const DIDAKTIK_DEFAULTS = {
    '3-Phasen': `Theoretischer Hintergrund: Das 3-Phasen-Modell (Einstieg – Erarbeitung – Sicherung) geht auf die Herbart'schen Formalstufen zurück und ist das in Deutschland am weitesten verbreitete Unterrichtsmodell. Hilbert Meyer beschreibt es als strukturgebenden Rahmen, der Orientierung für Lehrende und Lernende schafft.

Geeignet wenn:
- Ein klar umrissenes Lernziel im Vordergrund steht (Konzept einführen, Regel erarbeiten, Verfahren üben)
- Neue Inhalte in überschaubarem Umfang vermittelt werden sollen
- Heterogene Lerngruppen eine klare Struktur brauchen
- Zeitdruck besteht und Effizienz wichtig ist

Besonders geeignet für Kompetenzbereiche: Sachkompetenz (Wissen aufbauen, Zusammenhänge verstehen), prozedurale Kompetenz (Verfahren einüben)

Taxonomiestufen nach Bloom: Erinnern, Verstehen, Anwenden

Grenzen: Gefahr der Lehrerzentrierung in der Erarbeitungsphase; wenig geeignet für offene Problemstellungen oder wenn Schülerentwicklung von Fragestellungen im Vordergrund steht.`,

    'AVIVA': `Theoretischer Hintergrund: AVIVA (Ankommen – Vorwissen aktivieren – Informieren – Verarbeiten – Auswerten) wurde von Städeli, Grassi, Rhiner und Obrecht im Rahmen der schweizerischen Lehrerausbildung entwickelt. Das Modell basiert auf konstruktivistischen Lerntheorien und betont die Aktivierung von Vorwissen als Voraussetzung für bedeutungsvolles Lernen (vgl. Ausubel: „advance organizer").

Geeignet wenn:
- Schülerinnen und Schüler bereits relevantes Vorwissen mitbringen, das aktiviert und erweitert werden soll
- Vernetzung neuer Inhalte mit bestehendem Wissen didaktisches Ziel ist
- Selbstreflexion und Metakognition gefördert werden sollen
- Heterogene Lernstände in einer Gruppe vorhanden sind

Besonders geeignet für Kompetenzbereiche: Kommunikations- und Reflexionskompetenz, konzeptuelles Verstehen, Transfer

Taxonomiestufen nach Bloom: Verstehen, Analysieren, Bewerten

Grenzen: Erfordert mehr Zeit als das 3-Phasen-Modell; setzt voraus, dass Schülerinnen und Schüler Vorwissen mitbringen – sonst läuft die Aktivierungsphase ins Leere.`,

    'Direkte Instruktion': `Theoretischer Hintergrund: Die Direkte Instruktion (I do – We do – You do) basiert auf den Forschungsarbeiten von Rosenshine (Principles of Instruction, 2012) und wurde durch John Hatties Metaanalyse „Visible Learning" (2009) als eine der wirksamsten Unterrichtsmethoden identifiziert (Effektstärke d > 0,6). Das Modell folgt dem Prinzip des graduellen Rückzugs der Lehrkraft (Scaffolding/Fading).

Geeignet wenn:
- Prozedurale Fertigkeiten und Algorithmen eingeführt werden (Rechenverfahren, Labortechniken, Schreibverfahren)
- Schülerinnen und Schüler wenig Vorwissen in einem Bereich haben
- Hohe Fehlerrisiken bestehen, die durch Modellieren vermieden werden sollen
- Klare, messbare Kompetenzerwartungen im Vordergrund stehen

Besonders geeignet für Kompetenzbereiche: Erkenntnisgewinnungskompetenz (Methoden und Verfahren anwenden), prozedurale Sachkompetenz

Taxonomiestufen nach Bloom: Erinnern, Verstehen, Anwenden

Grenzen: Wenig geeignet für explorative oder kreative Aufgaben; kann Schüleraktivität und Eigeninitiative einschränken, wenn zu lange in der „I do"-Phase verweilt wird.`,

    'Forschend-entdeckend': `Theoretischer Hintergrund: Das forschend-entdeckende Lernen (Inquiry-Based Learning) geht auf Deweys „Learning by doing" zurück und ist didaktisches Leitprinzip der naturwissenschaftlichen Bildung (vgl. KMK-Bildungsstandards, NRW-KLP Biologie/Chemie). Im deutschen Gymnasium entspricht es dem Konzept der „Scientific Inquiry". Der Lernweg folgt dem naturwissenschaftlichen Erkenntnisweg: Phänomen – Frage – Hypothese – Untersuchung – Auswertung – Schlussfolgerung.

Geeignet wenn:
- Naturwissenschaftliche Denk- und Arbeitsweisen im Vordergrund stehen (Hypothesenbildung, Experimentieren, Auswerten)
- Schülerinnen und Schüler Erkenntnisse selbst konstruieren sollen statt sie zu reproduzieren
- Komplexe, mehrstufige Probleme bearbeitet werden
- Fachspezifische Methoden (Mikroskopie, Titration, Statistik) eingeübt werden sollen

Besonders geeignet für Kompetenzbereiche: Erkenntnisgewinnungskompetenz (E-Kompetenzen im KLP), Kommunikationskompetenz (Ergebnisse darstellen und diskutieren)

Taxonomiestufen nach Bloom: Analysieren, Bewerten, Erstellen (höhere Ordnung)

Grenzen: Zeitintensiv; erfordert Selbststeuerungsfähigkeit der Lerngruppe; Gefahr von Fehlkonzepten ohne ausreichende Scaffolding-Phasen; setzt oft Materialien und Raum (Labor) voraus.`,
  };

  const dCard = mk('div', 'card');
  const dHdr = cardHdr('Didaktisches Wissensmodell (KI-Grundlage)');
  const dHint = tx('div', '', 'Diese Texte nutzt die KI als Entscheidungsgrundlage bei der Phasengenerierung. Ersetze sie jederzeit durch eigene Literatur oder Seminarunterlagen.');
  dHint.style.cssText = 'font-size:12px;color:var(--tx3);padding:10px 18px 0;';
  dCard.appendChild(dHdr);
  dCard.appendChild(dHint);
  const db = mk('div', 'card-body');
  db.style.display = 'flex'; db.style.flexDirection = 'column'; db.style.gap = '16px';

  const taRefs = {};
  Object.keys(DIDAKTIK_DEFAULTS).forEach(modell => {
    const fg = mk('div', 'fg');
    fg.appendChild(tx('label', 'fl', modell));
    const ta = document.createElement('textarea');
    ta.className = 'finp didaktik-ta';
    ta.value = (DIDAKTIKDB[modell] !== undefined ? DIDAKTIKDB[modell] : DIDAKTIK_DEFAULTS[modell]);
    ta.rows = 6;
    ta.oninput = () => { DIDAKTIKDB[modell] = ta.value; };
    taRefs[modell] = ta;
    fg.appendChild(ta);
    db.appendChild(fg);
  });

  const dFooter = mk('div', ''); dFooter.style.cssText = 'display:flex;gap:8px;align-items:center;';
  const saveAllBtn = btn('Speichern', 'btn btn-pri btn-sm');
  const saveStatus = tx('span', '', '');
  saveStatus.style.cssText = 'font-size:12px;color:var(--tx3);';
  saveAllBtn.onclick = async () => {
    saveAllBtn.disabled = true; saveStatus.textContent = 'Wird gespeichert…';
    try {
      await sbUpload('didaktik.json', DIDAKTIKDB);
      saveStatus.textContent = '✓ Gespeichert';
    } catch(e) {
      saveStatus.textContent = 'Fehler: ' + e.message;
    }
    saveAllBtn.disabled = false;
    setTimeout(() => { saveStatus.textContent = ''; }, 3000);
  };
  const resetAllBtn = btn('Zurücksetzen', 'btn btn-ghost btn-sm');
  resetAllBtn.onclick = () => {
    if (!confirm('Alle Texte auf den Standardentwurf zurücksetzen?')) return;
    Object.keys(DIDAKTIK_DEFAULTS).forEach(m => {
      DIDAKTIKDB[m] = DIDAKTIK_DEFAULTS[m];
      taRefs[m].value = DIDAKTIK_DEFAULTS[m];
    });
  };
  dFooter.appendChild(saveAllBtn); dFooter.appendChild(resetAllBtn); dFooter.appendChild(saveStatus);
  db.appendChild(dFooter);

  dCard.appendChild(db);
  div.appendChild(dCard);


  return div;
}
