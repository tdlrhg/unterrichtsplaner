// ── KLP NRW Gymnasium ────────────────────────────────────────────
const KLP = {
  M: {
    label: 'Mathematik',
    inhalt: [
      { id: 'ZO', label: 'Zahlen und Operationen' },
      { id: 'GM', label: 'Größen und Messen' },
      { id: 'RF', label: 'Raum und Form' },
      { id: 'GF', label: 'Gleichungen und Funktionen' },
      { id: 'DZ', label: 'Daten und Zufall' },
    ],
    prozess: [
      { id: 'ARG', label: 'Mathematisch argumentieren' },
      { id: 'PRO', label: 'Mathematisch problemlösen' },
      { id: 'MOD', label: 'Mathematisch modellieren' },
      { id: 'DAR', label: 'Mathematisch darstellen' },
      { id: 'MED', label: 'Mit Medien und Werkzeugen umgehen' },
      { id: 'KOM', label: 'Mathematisch kommunizieren' },
    ]
  },
  Ch: {
    label: 'Chemie',
    inhalt: [
      { id: 'SF', label: 'Stoffe und ihre Eigenschaften' },
      { id: 'SU', label: 'Stoff- und Energieumsätze' },
      { id: 'CR', label: 'Chemische Reaktion' },
      { id: 'AB', label: 'Atombau und Periodensystem' },
      { id: 'CB', label: 'Chemie und Lebenswelt' },
    ],
    prozess: [
      { id: 'EK', label: 'Erkenntnisgewinnung' },
      { id: 'KO', label: 'Kommunikation' },
      { id: 'BW', label: 'Bewertung' },
      { id: 'UF', label: 'Umgang mit Fachwissen' },
    ]
  },
  Bio: {
    label: 'Biologie',
    inhalt: [
      { id: 'LB', label: 'Lebewesen und Lebensräume' },
      { id: 'KG', label: 'Körper und Gesundheit' },
      { id: 'EV', label: 'Evolution und Vielfalt' },
      { id: 'OE', label: 'Ökologie' },
      { id: 'GE', label: 'Genetik' },
    ],
    prozess: [
      { id: 'EK', label: 'Erkenntnisgewinnung' },
      { id: 'KO', label: 'Kommunikation' },
      { id: 'BW', label: 'Bewertung' },
      { id: 'UF', label: 'Umgang mit Fachwissen' },
    ]
  },
  Ch_GK: {
    label: 'Chemie GK (SII)',
    inhalt: [
      { id: 'SA', label: 'Stoff- und Energieumsätze' },
      { id: 'BS', label: 'Bindung und Struktur' },
      { id: 'SB', label: 'Säuren, Basen, Salze' },
      { id: 'RG', label: 'Reaktionsgeschwindigkeit und Gleichgewicht' },
      { id: 'EC', label: 'Elektrochemie' },
      { id: 'OC', label: 'Organische Chemie' },
    ],
    prozess: [
      { id: 'UF', label: 'Umgang mit Fachwissen' },
      { id: 'EK', label: 'Erkenntnisgewinnung' },
      { id: 'KO', label: 'Kommunikation' },
      { id: 'BW', label: 'Bewertung' },
    ]
  },
  Ch_LK: {
    label: 'Chemie LK (SII)',
    inhalt: [
      { id: 'SA', label: 'Stoff- und Energieumsätze' },
      { id: 'BS', label: 'Bindung und Struktur' },
      { id: 'SB', label: 'Säuren, Basen, Salze' },
      { id: 'RG', label: 'Reaktionsgeschwindigkeit und Gleichgewicht' },
      { id: 'EC', label: 'Elektrochemie' },
      { id: 'OC', label: 'Organische Chemie' },
      { id: 'AN', label: 'Analytische Chemie' },
    ],
    prozess: [
      { id: 'UF', label: 'Umgang mit Fachwissen' },
      { id: 'EK', label: 'Erkenntnisgewinnung' },
      { id: 'KO', label: 'Kommunikation' },
      { id: 'BW', label: 'Bewertung' },
    ]
  },
  Bio_GK: {
    label: 'Biologie GK (SII)',
    inhalt: [
      { id: 'ZB', label: 'Zelle und Zellstoffwechsel' },
      { id: 'GE', label: 'Genetik' },
      { id: 'NE', label: 'Neurobiologie und Evolution' },
      { id: 'OE', label: 'Ökologie' },
    ],
    prozess: [
      { id: 'UF', label: 'Umgang mit Fachwissen' },
      { id: 'EK', label: 'Erkenntnisgewinnung' },
      { id: 'KO', label: 'Kommunikation' },
      { id: 'BW', label: 'Bewertung' },
    ]
  },
  Bio_LK: {
    label: 'Biologie LK (SII)',
    inhalt: [
      { id: 'ZB', label: 'Zelle und Zellstoffwechsel' },
      { id: 'GE', label: 'Genetik' },
      { id: 'NE', label: 'Neurobiologie und Evolution' },
      { id: 'OE', label: 'Ökologie' },
      { id: 'BI', label: 'Biotechnologie und Immunbiologie' },
    ],
    prozess: [
      { id: 'UF', label: 'Umgang mit Fachwissen' },
      { id: 'EK', label: 'Erkenntnisgewinnung' },
      { id: 'KO', label: 'Kommunikation' },
      { id: 'BW', label: 'Bewertung' },
    ]
  },
};

const FAECHER = ['M', 'Ch', 'Bio', 'Ch_GK', 'Ch_LK', 'Bio_GK', 'Bio_LK'];
const JAHRGAENGE = ['5', '6', '7', '8', '9', '10', 'SII'];
const SOZIALFORMEN = ['Einzelarbeit', 'Partnerarbeit', 'Gruppenarbeit', 'Plenum', 'Lehrervortrag'];
const METHODEN = ['Einführung', 'Erarbeitung', 'Übung', 'Sicherung', 'Wiederholung', 'Diskussion', 'Experiment', 'Lernzirkel', 'Präsentation'];
const MATTYPEN = ['Arbeitsblatt', 'Lösung', 'Präsentation', 'Link', 'Buch', 'Video', 'Software', 'Sonstiges'];

function fachLabel(f) {
  const labels = {
    'M': 'Mathematik', 'Ch': 'Chemie', 'Bio': 'Biologie',
    'Ch_GK': 'Chemie GK', 'Ch_LK': 'Chemie LK',
    'Bio_GK': 'Biologie GK', 'Bio_LK': 'Biologie LK'
  };
  return labels[f] || f;
}
