// ── Meine Dokumente (Cloud-Speicher) ──────────────────────────────
// Anders als bei den Vorlagen (eine gemeinsame vorlagen.json) bekommt
// hier JEDES Dokument seine eigene Datei (dokumente/<id>.json) – Dokumente
// können durch eingebettete Bilder groß werden, und beim Speichern soll
// nicht jedes Mal der komplette Bestand aller Dokumente neu hochgeladen
// werden müssen. Eine schlanke Indexdatei (dokumente-index.json) hält nur
// die Liste (id, Titel, Datum) für die Auswahl – schnell zu laden, auch
// wenn später viele/große Dokumente existieren.

var DV_DOK_INDEX = []; // [{ id, titel, aktualisiert }], neueste zuerst

function dvDokUid() {
  return 'dok-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Sofort verfügbar aus dem lokalen Cache (synchron, kein Warten).
function dvDokIndexCacheLaden() {
  var roh = localStorage.getItem('dv_dok_index_cache');
  if (!roh) return;
  try {
    var liste = JSON.parse(roh);
    if (Array.isArray(liste)) DV_DOK_INDEX = liste;
  } catch (e) { /* defekter Cache wird ignoriert */ }
}

// Aus Supabase nachladen (Quelle der Wahrheit, ohne HTTP-Cache – sonst
// könnte ein gerade gespeichertes Dokument beim nächsten Laden durch einen
// alten Cache-Stand wieder fehlen, siehe dvVorlagenFrischLaden()).
async function dvDokIndexVonCloudLaden() {
  var url = _URL + '/storage/v1/object/' + BUCKET + '/dokumente-index.json?_=' + Date.now();
  var cloud;
  try {
    var res = await fetch(url, { cache: 'no-store', headers: { apikey: _KEY, Authorization: 'Bearer ' + _KEY } });
    cloud = res.ok ? await res.json() : null;
  } catch (e) { return false; } // offline: lokaler Cache bleibt gültig
  if (!Array.isArray(cloud)) return false;
  var vorher = JSON.stringify(DV_DOK_INDEX);
  DV_DOK_INDEX = cloud;
  localStorage.setItem('dv_dok_index_cache', JSON.stringify(cloud));
  return JSON.stringify(cloud) !== vorher;
}

function dvDokIndexSpeichern() {
  localStorage.setItem('dv_dok_index_cache', JSON.stringify(DV_DOK_INDEX));
  sbUpload('dokumente-index.json', DV_DOK_INDEX).catch(function (e) {
    console.error('Dokumente-Index speichern fehlgeschlagen:', e);
  });
}

// Aktuellen Editor-Inhalt speichern: neues Dokument (kein DV.dokumentId)
// legt einen neuen Eintrag an, sonst wird der bestehende überschrieben.
// Bilder werden wie beim Datei-Export eingebettet (siehe
// dvBilderInTextEinbetten in dokument-app.js), damit das gespeicherte
// Dokument auf jedem Gerät vollständig wieder ladbar ist.
async function dvDokumentSpeichern() {
  var titelMatch = DV.quelle.match(/^titel:\s*(.+)$/m);
  var titel = titelMatch ? titelMatch[1].trim() : 'Ohne Titel';
  var neu = !DV.dokumentId;
  var id = DV.dokumentId || dvDokUid();
  var jetzt = new Date().toISOString();
  var doc = {
    id: id, titel: titel, vorlageId: DV.vorlageId,
    quelle: dvBilderInTextEinbetten(DV.quelle), aktualisiert: jetzt
  };
  await sbUpload('dokumente/' + id + '.json', doc);
  DV.dokumentId = id;
  var eintrag = { id: id, titel: titel, aktualisiert: jetzt };
  var i = DV_DOK_INDEX.findIndex(function (e) { return e.id === id; });
  if (i >= 0) DV_DOK_INDEX[i] = eintrag; else DV_DOK_INDEX.unshift(eintrag);
  dvDokIndexSpeichern();
  return { neu: neu, titel: titel };
}

async function dvDokumentLaden(id) {
  var doc = await sbDownload('dokumente/' + id + '.json');
  if (!doc) throw new Error('Dokument nicht gefunden');
  DV.dokumentId = doc.id;
  DV.quelle = dvBilderAusTextAuslagern(doc.quelle || '');
  localStorage.setItem('dv_quelle', DV.quelle);
  localStorage.setItem('dv_bilder', JSON.stringify(DV.bilder));
  if (doc.vorlageId && DV_VORLAGEN.some(function (v) { return v.id === doc.vorlageId; })) {
    DV.vorlageId = doc.vorlageId;
    localStorage.setItem('dv_vorlage', DV.vorlageId);
  }
  return doc;
}

async function dvDokumentLoeschen(id) {
  DV_DOK_INDEX = DV_DOK_INDEX.filter(function (e) { return e.id !== id; });
  dvDokIndexSpeichern();
  await sbLoeschenObjekt('dokumente/' + id + '.json').catch(function (e) {
    console.error('Dokument-Datei löschen fehlgeschlagen:', e);
  });
  if (DV.dokumentId === id) DV.dokumentId = null;
}
