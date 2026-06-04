// ── Globaler Zustand ──────────────────────────────────────────────
let PRUEFUNGSDB = [];
let CHECKLISTDB = [];
let ALTE_ARBEITEN_DB = [];

const KOMPOSITIONSSTIL_DEFAULT = `4–7 Hauptaufgaben, jeweils mit Teilaufgaben.
Teilaufgaben sind thematisch verbunden, aber rechnerisch unabhängig (neue Zahlen pro Teilaufgabe).
Punkteverteilung: 40–50 % Reproduktion/einfache Anwendung (○), 10–15 % schwieriger Transfer (●), Rest mittlere Anwendung (◒).
Progression: gesamt leicht→schwer, auch innerhalb jeder Aufgabe leicht→schwer.
Abwechslungsreiche Aufgabentypen: Rechnung, Sachaufgabe, Multiple Choice, Diagramm, Begründung/Erklärung.`;

let KOMPOSITIONSSTIL = KOMPOSITIONSSTIL_DEFAULT;

function saveKompositionsstil() {
  sbUpload('kompositionsstil.json', { text: KOMPOSITIONSSTIL }).catch(() => {});
}

let PR = {
  aktId: null,
  aktCheckId: null,
  aktAlteArbeitId: null,
  view: 'pruefung',   // 'pruefung' | 'checkliste' | 'alte_arbeit'
};

let PR_VERSION = null;
let PR_VERSION_STATUS = null;
const _prStarted = Date.now();

function savePruefungsDB() {
  sbUpload('pruefungen.json', PRUEFUNGSDB).catch(e => console.error('Prüfungen speichern fehlgeschlagen:', e));
}
function saveChecklistDB() {
  sbUpload('checklisten.json', CHECKLISTDB).catch(e => console.error('Checklisten speichern:', e));
}
function saveAlteArbeitenDB() {
  sbUpload('alte_arbeiten.json', ALTE_ARBEITEN_DB).catch(e => console.error('Alte Arbeiten speichern:', e));
}
