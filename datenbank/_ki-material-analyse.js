// ── KI-Materialanalyse – Referenz für spätere DB-Integration ─────
//
// Ziel: Einträge aus der `inhalte`-Tabelle (oder hochgeladene PDFs)
// von der Datenbank-Oberfläche aus KI-gestützt analysieren und mit
// didaktischen Metadaten anreichern.
//
// Diese Datei ist NICHT geladen – sie dient als Vorlage.
// Ursprung: views/mat-import.js + views/mat-overlay.js (entfernt 2026-06)

// ── Metadaten-Schema ──────────────────────────────────────────────
// Felder, die die KI pro Material liefert (alle arrays außer strings):
//
// fach:                    ["Bio"|"Ch"|"M"]
// titel:                   string  – exakter Drucktitel
// beschreibung:            string  – 2-3 Sätze was SuS tun
// rolleImKontext:          string  – 1 Satz pädagogische Funktion
// themen:                  string[] – fachliche Kernthemen
// jahrgang:                string[] – z.B. ["7","8"] oder ["SII"]
// unterrichtsphase:        ["Einstieg"|"Erarbeitung"|"Sicherung"|"Vertiefung"|"Übung"|"Anwendung"|"Diagnose"]
// sozialformenGeeignet:    string[]
// methodenGeeignet:        string[]
// schueleraktivitaeten:    string[]
// artDerGeistigenTaetigkeit: string[]
// darstellungsformen:      string[]
// voraussetzungenFachlich: string[]
// voraussetzungenMethodisch: string[]
// kognitiveBeanspruchung:  "niedrig"|"mittel"|"hoch"
// sprachlicheAnforderungen: "niedrig"|"mittel"|"hoch"
// lautstaerke:             "leise"|"mittel"|"laut"
// differenzierungsformen:  string[]
// loesung:                 string  – Musterlösung aus Lehrerhandreichung
// loesungHinweis:          string
// erlaeuterung:            string  – methodische Hinweise für Lehrkraft

// ── KI-Prompt ─────────────────────────────────────────────────────
function buildKiMaterialPrompt({ fach = [], materialtyp = '', titel = '', blockTitel = null } = {}) {
  const known = `Bekannt: Fach=${fach.join(',') || '–'}, Typ=${materialtyp || '–'}, Dateiname=${titel || '–'}${blockTitel ? ', Themenblock="' + blockTitel + '"' : ''}`;
  return `Analysiere dieses Unterrichtsmaterial für eine NRW-Gymnasiallehrerin.
${known}

SCHRITT 1 – JAHRGANG (vor allem anderen lesen!):
Suche auf dem Material nach einer expliziten Klassen- oder Jahrgangsangabe: "Klasse 9/10", "Jg. 7", "für die 8.", "9./10. Schuljahr" o.ä.
- Gefunden → exakt übernehmen, NICHT aufgrund von Thema oder Schwierigkeitsgrad überschreiben
- "9/10" → ["9","10"] | "7/8" → ["7","8"] | "Klasse 9" → ["9"]
- Nicht gefunden → aus Niveau/Thema schätzen | wirklich unklar → []

FELDREGELN:
- "titel" = der tatsächliche Titel wie er auf dem Blatt gedruckt steht; kein Drucktitel → Thema + Aufgabentyp (z.B. "Fotosynthese – Lückentext"). NIEMALS eine Rolle als Titel ("Einführungsmaterial", "Erarbeitungsphase" o.ä.)
- "rolleImKontext" = 1 kurzer Satz zur pädagogischen Funktion
- "fach" = erlaubte Werte: "Bio", "Ch", "M" — aus Fachsprache/Formeln/Konzepten bestimmen; fast immer eindeutig; immer einen Wert angeben, nie []
- "themen" = fachspezifische Kernthemen aus dem MATERIAL — IGNORIERE den KONTEXT vollständig
- "unterrichtsphase" = NUR: "Einstieg","Erarbeitung","Sicherung","Vertiefung","Übung","Anwendung","Diagnose"
- "kognitiveBeanspruchung" = genau "niedrig" | "mittel" | "hoch"
- "sprachlicheAnforderungen" = genau "niedrig" | "mittel" | "hoch"
- "lautstaerke" = genau "leise" | "mittel" | "laut"
- "loesung", "loesungHinweis", "erlaeuterung" nur aus KONTEXT/Lehrerhinweisen; wenn keine Lösung erkennbar: ""
Antworte NUR mit JSON (kein Text davor/danach):
{"fach":["Bio"],"titel":"exakter Titel vom Blatt","rolleImKontext":"1 Satz zur Funktion","beschreibung":"2-3 Sätze was SuS tun","themen":["Fotosynthese"],"jahrgang":["7"],"unterrichtsphase":["Erarbeitung"],"sozialformenGeeignet":["Einzelarbeit"],"methodenGeeignet":[],"schueleraktivitaeten":[],"artDerGeistigenTaetigkeit":[],"darstellungsformen":[],"voraussetzungenFachlich":[],"voraussetzungenMethodisch":[],"kognitiveBeanspruchung":"mittel","sprachlicheAnforderungen":"mittel","lautstaerke":"leise","differenzierungsformen":[],"loesung":"","loesungHinweis":"","erlaeuterung":""}`;
}

// ── Normalisierung KI-Antwort ─────────────────────────────────────
function normalizeKiMaterialResult(raw) {
  const out = Object.assign({}, raw);
  const ARR = ['fach','themen','jahrgang','unterrichtsphase','sozialformenGeeignet',
    'methodenGeeignet','schueleraktivitaeten','artDerGeistigenTaetigkeit','darstellungsformen',
    'voraussetzungenFachlich','voraussetzungenMethodisch','differenzierungsformen'];
  ARR.forEach(k => { if (!Array.isArray(out[k])) out[k] = out[k] ? [String(out[k])] : []; });
  const STR = ['titel','rolleImKontext','beschreibung','kognitiveBeanspruchung',
    'sprachlicheAnforderungen','lautstaerke','loesung','loesungHinweis','erlaeuterung'];
  STR.forEach(k => { if (typeof out[k] !== 'string') out[k] = out[k] != null ? String(out[k]) : ''; });
  const FACH_MAP = { biologie:'Bio',bio:'Bio',biology:'Bio',chemie:'Ch',ch:'Ch',chemistry:'Ch',
    mathematik:'M',mathe:'M',math:'M',m:'M' };
  out.fach = out.fach.map(f => FACH_MAP[f.toLowerCase()] || null).filter(Boolean);
  const SII = new Set(['sii','ef','q1','q2','oberstufe','einführungsphase']);
  out.jahrgang = [...new Set(out.jahrgang.map(j => SII.has((j||'').toLowerCase().trim()) ? 'SII' : j))];
  return out;
}
