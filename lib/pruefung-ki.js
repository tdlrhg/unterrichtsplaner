// callKI kommt aus core/ki.js (global geladen)

// ── Prompt für Alte Arbeiten ──────────────────────────────────────
const KI_PROMPT_ALTE_ARBEIT = `Du analysierst Seiten einer Klassenarbeit (Gymnasium, Mathematik oder Naturwissenschaften).

Extrahiere jede Aufgabe und Teilaufgabe als eigenen Eintrag.

Für jede Aufgabe / Teilaufgabe:
- nr: Aufgabennummer inkl. Teilaufgabe (z.B. "3b") — Hauptaufgabe ohne Buchstabe (z.B. "3")
- seite: Seitennummer falls erkennbar, sonst null
- aufgabenstellung: gemeinsame Aufgabenstellung bei Hauptaufgaben, sonst null
- text: der Aufgabentext (Teilaufgabe: nur der individuelle Teil; Einzelaufgabe: voller Text). Formeln als Text, z.B. "2x - 1 = 5". Einzeilig.
- punkte: Punktzahl falls auf der Arbeit angegeben, sonst null
- grafik: kurze Beschreibung eines Fotos/Diagramms (1 Satz), null wenn keins

Antworte NUR mit validem JSON:
{"aufgaben": [
  {"nr":"1","seite":1,"aufgabenstellung":"Löse die folgenden Gleichungen.","text":null,"punkte":8,"grafik":null},
  {"nr":"1a","seite":1,"aufgabenstellung":null,"text":"3x + 5 = 14","punkte":2,"grafik":null},
  {"nr":"1b","seite":1,"aufgabenstellung":null,"text":"2x - 1 = -0,5x + 5","punkte":3,"grafik":null}
]}`;

// ── KI: Checkliste aus Bildern extrahieren ────────────────────────
async function extrahiereChecklist(imgs) {
  const resized = await Promise.all(imgs.map(img => new Promise((res, rej) => {
    const image = new Image(); image.onload = () => {
      const scale = image.width > 1200 ? 1200 / image.width : 1;
      const c = document.createElement('canvas');
      c.width = Math.round(image.width * scale); c.height = Math.round(image.height * scale);
      c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.85));
    }; image.onerror = rej; image.src = img;
  })));
  const blocks = [
    ...resized.map(r => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: r.split(',')[1] } })),
    { type: 'text', text: `Lies diese Lernziel-Checkliste aus.
Antworte NUR in diesem Format:
ABSCHNITT: [Titel des Abschnitts]
1|[Lernziel-Text]
2|[Lernziel-Text]
ABSCHNITT: [Titel des nächsten Abschnitts]
1|[Lernziel-Text]

Regeln:
- Jeden Abschnitt mit "ABSCHNITT:" einleiten
- Jedes Lernziel als Nummer|Text (die "Ich kann..."-Sätze vollständig)
- Kein Markdown, keine Erklärungen, nur dieses Format` }
  ];
  const raw = await callKI(blocks, { maxTokens: 4000 });
  const lernziele = [];
  let aktAbschnitt = '';
  for (const line of raw.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (line.startsWith('ABSCHNITT:')) {
      aktAbschnitt = line.slice('ABSCHNITT:'.length).trim();
    } else if (line.includes('|')) {
      const [nr, ...rest] = line.split('|');
      const text = rest.join('|').trim();
      if (text) lernziele.push({ id: uid(), abschnitt: aktAbschnitt, nr: parseInt(nr) || lernziele.length + 1, text });
    }
  }
  return lernziele;
}
