// ── Formatvorlagen ───────────────────────────────────────────────
// Eine Vorlage ist DATEN, kein CSS. Sie wird zur Laufzeit in CSS
// Custom Properties übersetzt – dadurch ist später ein Vorlagen-
// Editor mit Live-Vorschau möglich, ohne eine Zeile CSS zu schreiben.

var DV_FORMATE = {
  A4:        { breite: 210, hoehe: 297 },
  A4quer:    { breite: 297, hoehe: 210 },
  A5:        { breite: 148, hoehe: 210 }
};

var DV_VORLAGEN = [
  {
    id: 'ka-klassisch',
    name: 'Klassenarbeit klassisch',
    beschreibung: 'Kopfzeile mit Namensfeld, Punktekästchen rechts, Fußzeile mit Seitenzahl.',
    seite: { format: 'A4', rand: { oben: 16, unten: 15, links: 22, rechts: 18 }, kaestchen: false, kaestchenGroesse: 5 },
    typo: {
      font: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
      groesse: 11, zeilenabstand: 1.45, absatzabstand: 3.2, ausrichtung: 'left'
    },
    titelblock: { zeigen: true, variante: 'kasten', namensfeld: true, hinweistext: '', vielErfolg: '' },
    kopf: { zeigen: true, abSeite: 2, links: '{{fach}} · {{klasse}}', mitte: '', rechts: '{{titel}}', linie: true },
    fuss: { zeigen: true, abSeite: 1, links: 'Name: ________________________', mitte: '', rechts: 'Seite {{seite}} von {{seiten}}', linie: true },
    aufgabe: { label: 'Aufgabe {{nr}}', punkte: 'kasten', abstand: 7, trennlinie: false, farbe: '#1c1917' },
    teil: { marke: '{{marke}}', einzug: 8 },
    kasten: { rahmen: true, fuellung: '#f5f2ed' },
    punkteSpalte: { zeigen: false, breite: 16, trennlinie: true, gesamtbox: true },
    seitenzahlGross: { zeigen: false, abSeite: 1, groesse: 40, farbe: '#d4cec2' }
  },
  {
    id: 'ab-schlicht',
    name: 'Arbeitsblatt schlicht',
    beschreibung: 'Enge Ränder, Aufgaben ohne Punkte, große Schrift – für Arbeitsblätter.',
    seite: { format: 'A4', rand: { oben: 14, unten: 14, links: 18, rechts: 16 }, kaestchen: false, kaestchenGroesse: 5 },
    typo: {
      font: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
      groesse: 12, zeilenabstand: 1.55, absatzabstand: 3.6, ausrichtung: 'left'
    },
    titelblock: { zeigen: true, variante: 'linie', namensfeld: false, hinweistext: '', vielErfolg: '' },
    kopf: { zeigen: false, abSeite: 2, links: '', mitte: '', rechts: '', linie: false },
    fuss: { zeigen: true, abSeite: 2, links: '{{titel}}', mitte: '', rechts: '{{seite}}', linie: false },
    aufgabe: { label: '{{nr}}', punkte: 'keine', abstand: 9, trennlinie: false, farbe: '#be185d' },
    teil: { marke: '{{marke}}', einzug: 10 },
    kasten: { rahmen: false, fuellung: '#f1ede7' },
    punkteSpalte: { zeigen: false, breite: 16, trennlinie: true, gesamtbox: true },
    seitenzahlGross: { zeigen: false, abSeite: 1, groesse: 40, farbe: '#d4cec2' }
  }
];

function dvVorlage(id) {
  return DV_VORLAGEN.find(function (v) { return v.id === id; }) || DV_VORLAGEN[0];
}

// ── Vorlage → CSS Custom Properties ──────────────────────────────
function dvApplyVorlage(el, v) {
  var fmt = DV_FORMATE[v.seite.format] || DV_FORMATE.A4;
  var r = v.seite.rand;
  var kopfH = v.kopf.zeigen ? 9 : 0;
  var fussH = v.fuss.zeigen ? 9 : 0;
  var s = el.style;
  s.setProperty('--dv-breite', fmt.breite + 'mm');
  s.setProperty('--dv-hoehe', fmt.hoehe + 'mm');
  s.setProperty('--dv-rand-o', r.oben + 'mm');
  s.setProperty('--dv-rand-u', r.unten + 'mm');
  s.setProperty('--dv-rand-l', r.links + 'mm');
  s.setProperty('--dv-rand-r', r.rechts + 'mm');
  s.setProperty('--dv-kaestchen-groesse', (v.seite.kaestchenGroesse || 5) + 'mm');
  s.setProperty('--dv-punkte-breite', ((v.punkteSpalte && v.punkteSpalte.breite) || 16) + 'mm');
  s.setProperty('--dv-sz-gross-groesse', ((v.seitenzahlGross && v.seitenzahlGross.groesse) || 40) + 'pt');
  s.setProperty('--dv-sz-gross-farbe', (v.seitenzahlGross && v.seitenzahlGross.farbe) || '#d4cec2');
  s.setProperty('--dv-kopf-h', kopfH + 'mm');
  s.setProperty('--dv-fuss-h', fussH + 'mm');
  s.setProperty('--dv-font', v.typo.font);
  s.setProperty('--dv-size', v.typo.groesse + 'pt');
  s.setProperty('--dv-lh', String(v.typo.zeilenabstand));
  s.setProperty('--dv-abs', v.typo.absatzabstand + 'mm');
  s.setProperty('--dv-align', v.typo.ausrichtung);
  s.setProperty('--dv-auf-abstand', v.aufgabe.abstand + 'mm');
  s.setProperty('--dv-auf-farbe', v.aufgabe.farbe);
  s.setProperty('--dv-teil-einzug', v.teil.einzug + 'mm');
  s.setProperty('--dv-kasten-bg', v.kasten.fuellung);
  s.setProperty('--dv-kasten-rahmen', v.kasten.rahmen ? '1px solid #cfc8bd' : 'none');
}

// ── Platzhalter in Kopf-/Fußzeilen ───────────────────────────────
function dvPlatzhalter(vorlage, meta) {
  var datum = meta.datum || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    datum = new Date(datum + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return {
    titel: meta.titel || '', fach: meta.fach || '', klasse: meta.klasse || '',
    datum: datum, zeit: meta.zeit || '', name: meta.name || '', lehrer: meta.lehrer || '',
    punkte: '', seite: '', seiten: ''
  };
}

function dvFuellen(vorlageText, werte) {
  return String(vorlageText || '').replace(/\{\{\s*([\wäöü]+)\s*\}\}/g, function (_, k) {
    var w = werte[k.toLowerCase()];
    return w == null ? '' : String(w);
  });
}

// ── Standard- vs. eigene Vorlagen ────────────────────────────────
// Die beiden oben definierten Vorlagen sind schreibgeschützt. Eigene
// Vorlagen entstehen als Kopie und liegen in Supabase (Datei
// vorlagen.json im selben Bucket wie data.json/pruefungen.json).
// localStorage dient nur als Sofort-Cache, damit die App offline
// startet und nicht auf die erste Netzwerkantwort warten muss.

var DV_STANDARD_IDS = DV_VORLAGEN.map(function (v) { return v.id; });

function dvIstStandard(id) { return DV_STANDARD_IDS.indexOf(id) >= 0; }

function dvUid() {
  return 'eig-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function dvEigene() {
  return DV_VORLAGEN.filter(function (v) { return !dvIstStandard(v.id); });
}

// Eigene Vorlagen im globalen Array durch eine neue Liste ersetzen,
// ohne die schreibgeschützten Standardvorlagen anzufassen.
function dvErsetzeEigene(liste) {
  for (var i = DV_VORLAGEN.length - 1; i >= 0; i--) {
    if (!dvIstStandard(DV_VORLAGEN[i].id)) DV_VORLAGEN.splice(i, 1);
  }
  (liste || []).forEach(function (v) {
    if (v && v.id && !dvIstStandard(v.id)) DV_VORLAGEN.push(v);
  });
}

// Sofort verfügbar aus dem lokalen Cache (synchron, kein Warten).
function dvVorlagenCacheLaden() {
  var roh = localStorage.getItem('dv_vorlagen_cache') || localStorage.getItem('dv_vorlagen');
  if (!roh) return;
  try {
    var eigene = JSON.parse(roh);
    if (Array.isArray(eigene)) dvErsetzeEigene(eigene);
  } catch (e) { /* defekter Cache wird ignoriert */ }
}

// sbDownload() setzt kein cache:'no-store' – der Browser kann eine
// veraltete (z.B. leere) Antwort aus dem HTTP-Cache liefern. Für die
// Vorlagen wäre das fatal: eine gerade gespeicherte Vorlage würde beim
// nächsten Laden durch den alten Cache-Stand wieder gelöscht aussehen.
// Deshalb hier ein eigener, cache-loser Download statt sbDownload().
async function dvVorlagenFrischLaden() {
  var url = _URL + '/storage/v1/object/' + BUCKET + '/vorlagen.json?_=' + Date.now();
  var res = await fetch(url, {
    cache: 'no-store',
    headers: { apikey: _KEY, Authorization: 'Bearer ' + _KEY }
  });
  if (!res.ok) return null;
  return await res.json();
}

// Aus Supabase nachladen (Quelle der Wahrheit). Gibt true zurück,
// wenn sich der Bestand gegenüber dem Cache geändert hat.
async function dvVorlagenVonCloudLaden() {
  var vorher = JSON.stringify(dvEigene());
  var cloud;
  try {
    cloud = await dvVorlagenFrischLaden();
  } catch (e) { return false; } // offline: lokaler Cache bleibt gültig

  if (!Array.isArray(cloud)) {
    // Noch keine Cloud-Datei – lokalen Altbestand einmalig hochladen
    // (Migration aus der Zeit, als Vorlagen nur lokal lagen).
    var lokal = dvEigene();
    if (lokal.length) sbUpload('vorlagen.json', lokal).catch(function () {});
    return false;
  }

  dvErsetzeEigene(cloud);
  localStorage.setItem('dv_vorlagen_cache', JSON.stringify(cloud));
  localStorage.removeItem('dv_vorlagen'); // alter, rein lokaler Schlüssel
  return JSON.stringify(cloud) !== vorher;
}

function dvVorlagenSpeichern() {
  var eigene = dvEigene();
  localStorage.setItem('dv_vorlagen_cache', JSON.stringify(eigene));
  sbUpload('vorlagen.json', eigene).catch(function (e) {
    console.error('Vorlagen speichern fehlgeschlagen:', e);
  });
}

// ── Kopie anlegen ────────────────────────────────────────────────
function dvKopie(v, name) {
  var k = JSON.parse(JSON.stringify(v));
  k.id = dvUid();
  k.name = name || (v.name + ' (Kopie)');
  DV_VORLAGEN.push(k);
  dvVorlagenSpeichern();
  return k;
}

function dvLoeschen(id) {
  if (dvIstStandard(id)) return false;
  var i = DV_VORLAGEN.findIndex(function (v) { return v.id === id; });
  if (i < 0) return false;
  DV_VORLAGEN.splice(i, 1);
  dvVorlagenSpeichern();
  return true;
}

// ── Wert über Pfad lesen/setzen: 'seite.rand.oben' ───────────────
function dvHole(obj, pfad) {
  return pfad.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
}

function dvSetze(obj, pfad, wert) {
  var teile = pfad.split('.');
  var letztes = teile.pop();
  var ziel = teile.reduce(function (o, k) {
    if (o[k] == null) o[k] = {};
    return o[k];
  }, obj);
  ziel[letztes] = wert;
}
