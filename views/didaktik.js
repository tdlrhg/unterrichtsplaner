// ── Didaktik-Wissensmodell ────────────────────────────────────────
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

  'Forschend-entdeckend': `Theoretischer Hintergrund: Das forschend-entdeckende Lernen (Inquiry-Based Learning) geht auf Deweys „Learning by doing" zurück und ist didaktisches Leitprinzip der naturwissenschaftlichen Bildung (vgl. KMK-Bildungsstandards, NRW-KLP Biologie/Chemie). Der Lernweg folgt dem naturwissenschaftlichen Erkenntnisweg: Phänomen – Frage – Hypothese – Untersuchung – Auswertung – Schlussfolgerung.

Geeignet wenn:
- Naturwissenschaftliche Denk- und Arbeitsweisen im Vordergrund stehen (Hypothesenbildung, Experimentieren, Auswerten)
- Schülerinnen und Schüler Erkenntnisse selbst konstruieren sollen statt sie zu reproduzieren
- Komplexe, mehrstufige Probleme bearbeitet werden
- Fachspezifische Methoden (Mikroskopie, Titration, Statistik) eingeübt werden sollen

Besonders geeignet für Kompetenzbereiche: Erkenntnisgewinnungskompetenz (E-Kompetenzen im KLP), Kommunikationskompetenz (Ergebnisse darstellen und diskutieren)

Taxonomiestufen nach Bloom: Analysieren, Bewerten, Erstellen (höhere Ordnung)

Grenzen: Zeitintensiv; erfordert Selbststeuerungsfähigkeit der Lerngruppe; Gefahr von Fehlkonzepten ohne ausreichende Scaffolding-Phasen; setzt oft Materialien und Raum (Labor) voraus.`,
};

function viewDidaktik() {
  const div = mk('div', '');

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Didaktisches Wissensmodell'));
  left.appendChild(tx('div', 'c-sub', 'KI-Grundlage für die Phasengenerierung'));
  hdr.appendChild(left);
  div.appendChild(hdr);

  const hint = mk('div', 'card');
  const hb = mk('div', 'card-body');
  hb.appendChild(tx('p', '', 'Diese Texte nutzt die KI beim „✨ KI"-Button in der Stundenansicht als Entscheidungsgrundlage – welches Phasierungsmodell für welches Lernziel und welche Kompetenzstufe geeignet ist. Ersetze oder ergänze sie jederzeit durch eigene Literatur oder Seminarunterlagen.'));
  hint.appendChild(hb);
  div.appendChild(hint);

  const taRefs = {};

  Object.keys(DIDAKTIK_DEFAULTS).forEach(modell => {
    const card = mk('div', 'card');
    card.appendChild(cardHdr(modell));
    const cb = mk('div', 'card-body');

    const ta = document.createElement('textarea');
    ta.className = 'finp didaktik-ta';
    ta.value = DIDAKTIKDB[modell] !== undefined ? DIDAKTIKDB[modell] : DIDAKTIK_DEFAULTS[modell];
    ta.rows = 10;
    ta.oninput = () => { DIDAKTIKDB[modell] = ta.value; };
    taRefs[modell] = ta;
    cb.appendChild(ta);
    card.appendChild(cb);
    div.appendChild(card);
  });

  const saveCard = mk('div', 'card');
  const sb2 = mk('div', 'card-body');
  sb2.style.cssText = 'display:flex;gap:8px;align-items:center;';

  const saveBtn = btn('Speichern', 'btn btn-pri btn-sm');
  const saveStatus = tx('span', '', '');
  saveStatus.style.cssText = 'font-size:12px;color:var(--tx3);';

  saveBtn.onclick = async () => {
    saveBtn.disabled = true; saveStatus.textContent = 'Wird gespeichert…';
    try {
      await sbUpload('didaktik.json', DIDAKTIKDB);
      saveStatus.textContent = '✓ Gespeichert';
    } catch(e) {
      saveStatus.textContent = 'Fehler: ' + e.message;
    }
    saveBtn.disabled = false;
    setTimeout(() => { saveStatus.textContent = ''; }, 3000);
  };

  const resetBtn = btn('Auf Standardentwurf zurücksetzen', 'btn btn-ghost btn-sm');
  resetBtn.onclick = () => {
    if (!confirm('Alle Texte auf den Standardentwurf zurücksetzen?')) return;
    Object.keys(DIDAKTIK_DEFAULTS).forEach(m => {
      DIDAKTIKDB[m] = DIDAKTIK_DEFAULTS[m];
      taRefs[m].value = DIDAKTIK_DEFAULTS[m];
    });
  };

  sb2.appendChild(saveBtn); sb2.appendChild(resetBtn); sb2.appendChild(saveStatus);
  saveCard.appendChild(sb2);
  div.appendChild(saveCard);

  return div;
}
