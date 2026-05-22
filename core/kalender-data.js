// ── NRW Ferientermine ────────────────────────────────────────────
// Quelle: BASS NRW 12-65 Nr. 1, bass.schule.nrw/19662.htm
const NRW_FERIEN = {
  '2025/26': [
    { name: 'Sommerferien 2025', von: '2025-07-14', bis: '2025-08-26' },
    { name: 'Herbstferien',      von: '2025-10-13', bis: '2025-10-25' },
    { name: 'Weihnachtsferien',  von: '2025-12-22', bis: '2026-01-06' },
    { name: 'Osterferien',       von: '2026-03-30', bis: '2026-04-11' },
    { name: 'Pfingstferien',     von: '2026-05-26', bis: '2026-05-26' },
    { name: 'Sommerferien 2026', von: '2026-07-20', bis: '2026-09-01' },
  ],
  '2026/27': [
    { name: 'Sommerferien 2026', von: '2026-07-20', bis: '2026-09-01' },
    { name: 'Herbstferien',      von: '2026-10-17', bis: '2026-10-31' },
    { name: 'Weihnachtsferien',  von: '2026-12-23', bis: '2027-01-06' },
    { name: 'Osterferien',       von: '2027-03-22', bis: '2027-04-03' },
    { name: 'Pfingstferien',     von: '2027-05-18', bis: '2027-05-18' },
    { name: 'Sommerferien 2027', von: '2027-07-19', bis: '2027-08-31' },
  ]
};

// Gesetzliche Feiertage NRW
const NRW_FEIERTAGE = {
  '2025/26': [
    '2025-10-03', // Tag der Deutschen Einheit
    '2025-11-01', // Allerheiligen
    '2026-04-03', // Karfreitag
    '2026-04-06', // Ostermontag
    '2026-05-01', // Tag der Arbeit
    '2026-05-14', // Christi Himmelfahrt
    '2026-05-25', // Pfingstmontag
    '2026-06-04', // Fronleichnam
  ],
  '2026/27': [
    '2026-10-03', // Tag der Deutschen Einheit
    '2026-11-01', // Allerheiligen
    '2027-03-26', // Karfreitag
    '2027-03-29', // Ostermontag
    '2027-05-01', // Tag der Arbeit
    '2027-05-13', // Christi Himmelfahrt
    '2027-05-24', // Pfingstmontag
    '2027-06-03', // Fronleichnam
  ]
};

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
const STUNDEN = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const KW_TYP = ['beide', 'gerade', 'ungerade'];

// ── KW berechnen ─────────────────────────────────────────────────
function getKW(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function isGeradeKW(date) {
  return getKW(date) % 2 === 0;
}

// ── Prüfen ob Schultag ───────────────────────────────────────────
function isSchultag(date, schuljahr, ausfalltage) {
  const dw = date.getUTCDay();
  if (dw === 0 || dw === 6) return false;

  const ds = dateToStr(date);

  // Feiertage
  const ft = NRW_FEIERTAGE[schuljahr] || [];
  if (ft.includes(ds)) return false;

  // Ferien
  const ferien = NRW_FERIEN[schuljahr] || [];
  for (const f of ferien) {
    if (ds >= f.von && ds <= f.bis) return false;
  }

  // Schulweite Ausfalltage
  if (ausfalltage && ausfalltage.includes(ds)) return false;

  return true;
}

function dateToStr(date) {
  return date.toISOString().slice(0, 10);
}

function strToDate(str) {
  // UTC verwenden um Timezone-Verschiebungen zu vermeiden
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// ── Shared: Stunden in einem Zeitraum zählen ────────────────────
function _zaehleStunden(kurs, schuljahr, ausfalltage, einzelAusfaelle, start, end) {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (isSchultag(cur, schuljahr, ausfalltage)) {
      const dw = cur.getUTCDay();
      const dwStr = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr'][dw];
      const gerade = isGeradeKW(cur);
      const ds = dateToStr(cur);
      kurs.stundenplan.forEach(slot => {
        if (slot.tag !== dwStr) return;
        if (slot.kwTyp === 'gerade' && !gerade) return;
        if (slot.kwTyp === 'ungerade' && gerade) return;
        const ausgefallen = (einzelAusfaelle || []).some(a =>
          a.kursId === kurs.id && a.datum === ds && a.stunde === slot.stunde
        );
        if (!ausgefallen) count++;
      });
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

// ── Unterrichtsstunden pro Kurs berechnen ────────────────────────
function berechneStunden(kurs, fp, schuljahr, ausfalltage, einzelAusfaelle, klassenarbeiten) {
  const ferien = NRW_FERIEN[schuljahr] || [];
  if (!ferien.length) return 0;
  if (!kurs.stundenplan || kurs.stundenplan.length === 0) return null;

  // Schuljahresbeginn: Tag nach den ersten Sommerferien
  const start = strToDate(ferien[0].bis);
  start.setUTCDate(start.getUTCDate() + 1);
  // Schuljahresende: letzter Tag vor den letzten Sommerferien
  const end = strToDate(ferien[ferien.length - 1].von);
  end.setUTCDate(end.getUTCDate() - 1);

  return _zaehleStunden(kurs, schuljahr, ausfalltage, einzelAusfaelle, start, end);
}


// ── Halbjahresende ───────────────────────────────────────────────
function getHalbjahrEnde(schuljahr) {
  // Zeugnisausgabe laut BASS: 06.02.2026 für 2025/26, 05.02.2027 für 2026/27
  if (schuljahr === '2025/26') return new Date(Date.UTC(2026, 1, 6));
  if (schuljahr === '2026/27') return new Date(Date.UTC(2027, 1, 5));
  return null;
}

// ── Stunden ab heute berechnen ───────────────────────────────────
function berechneRestStunden(kurs, fp, schuljahr, ausfalltage, einzelAusfaelle, bis) {
  const ferien = NRW_FERIEN[schuljahr] || [];
  if (!ferien.length) return null;
  if (!kurs.stundenplan || kurs.stundenplan.length === 0) return null;

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  if (start > bis) return 0;

  return _zaehleStunden(kurs, schuljahr, ausfalltage, einzelAusfaelle, start, bis);
}
