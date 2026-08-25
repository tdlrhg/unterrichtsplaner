// ── Dokumentgenerator: Seiten-App ────────────────────────────────
// Werkstatt links (Quelltext), Vorschau rechts. Die Vorschau ist
// bereits das Druckergebnis – gedruckt wird exakt dieses DOM.

var DV = {
  tab: 'inhalt',
  quelle: '',
  bilder: {}, // Bild-ID → Data-URL, getrennt vom Text gehalten (sonst wird der
              // Editor bei jedem Bild durch eine riesige Base64-Zeile unbedienbar)
  vorlageId: 'ka-klassisch',
  zoom: 0.72,
  seiten: 0,
  warnungen: [],
  version: null
};

var DV_PX_PRO_MM = 96 / 25.4;

var DV_DEMO = `---
titel: Klassenarbeit Nr. 2 – Flächeninhalte
fach: Mathematik
klasse: 8b
datum: 2026-09-14
zeit: 45
---

## Aufgabe 1: Grundlagen [6P]
Kreuze an, welche Formel zum jeweiligen Körper gehört.

| Figur | Formel |
|---|---|
| Rechteck | A = a · b |
| Dreieck | A = ½ · g · h |
| Parallelogramm | A = g · h |

### a) Erkläre in einem Satz, warum im Dreieck der Faktor ½ steht. [2P]
::: linien n=3

### b) Zeichne in das Parallelogramm die Höhe h ein. [1P]
::: raster h=45

## Aufgabe 2: Berechnungen [8P]
Ein Parallelogramm hat die Grundseite g = 7,5 cm und die Höhe h = 4 cm.

### a) Berechne den Flächeninhalt. [3P]
::: linien n=4

### b) Die Grundseite wird verdoppelt. Begründe, wie sich der Flächeninhalt verändert. [3P]
::: linien n=5

### c) Gib ein Beispiel für ein Parallelogramm mit demselben Flächeninhalt, aber anderen Maßen. [2P]
::: linien n=3

::: hinweis titel="Hinweis"
Alle Ergebnisse müssen mit Rechenweg und Einheit angegeben werden.
:::

## Aufgabe 3: Anwendung [10P]
Ein Grundstück hat die unten skizzierte Form. Es soll neu eingezäunt und mit Rasen bepflanzt werden.

- Der Zaun kostet 24 € pro laufendem Meter.
- Der Rasen kostet 8 € pro Quadratmeter.

### a) Berechne den Flächeninhalt des Grundstücks. Zerlege es dazu in Teilflächen. [5P]
::: linien n=8

### b) Berechne die Gesamtkosten. [3P]
::: linien n=5

### c) Beurteile, ob eine Zerlegung in Dreiecke hier sinnvoller gewesen wäre. [2P]
::: linien n=4
`;

// ── Vorschau neu aufbauen ────────────────────────────────────────
// Ersetzt Bild-IDs im geparsten Baum durch die tatsächliche Data-URL aus
// DV.bilder. Im Text steht nur die kurze ID (siehe dvBildEinfuegen).
function dvBilderInBlocksAufloesen(blocks) {
  (blocks || []).forEach(function (b) {
    if (b.t === 'bild' && DV.bilder[b.src] != null) b.src = DV.bilder[b.src];
    if (b.kinder) dvBilderInBlocksAufloesen(b.kinder);
  });
}

// ── Syntax-Einfärbung im Quelltext-Editor ────────────────────────
// Backdrop-Technik: hinter dem Textfeld (Textfarbe transparent, nur der
// Cursor bleibt sichtbar) liegt ein div mit denselben Schrift- und Box-
// Maßen, das denselben Text eingefärbt rendert. Deshalb dürfen hier NUR
// Eigenschaften gesetzt werden, die die Textmetrik nicht verändern:
// Farbe, Hintergrund und – bei Monospace – font-weight. font-size,
// letter-spacing oder Innenabstände würden den Zeilenumbruch von Textfeld
// und Backdrop auseinanderlaufen lassen.
function dvEscapeHtml(s) {
  return s.replace(/[&<>]/g, function (c) {
    return c === '&' ? '&amp;' : (c === '<' ? '&lt;' : '&gt;');
  });
}

function dvPunkteMarkieren(escaped) {
  return escaped.replace(/(\[|\()\s*\d+(?:[.,]\d+)?\s*P?\s*(\]|\))/gi, '<span class="hl-punkte">$&</span>');
}

function dvQuelleHervorheben(text) {
  var zeilen = text.split('\n');
  var imFm = false, fmFertig = false;
  var raus = [];

  for (var i = 0; i < zeilen.length; i++) {
    var z = zeilen[i], t = z.trim(), e = dvEscapeHtml(z);

    // Frontmatter (--- … ---) ganz am Anfang
    if (!fmFertig && !imFm && i === 0 && t === '---') { imFm = true; raus.push('<span class="hl-meta">' + e + '</span>'); continue; }
    if (imFm) {
      if (t === '---') { imFm = false; fmFertig = true; }
      raus.push('<span class="hl-meta">' + e + '</span>');
      continue;
    }

    var cls = null;
    if (/^:::/.test(t)) cls = 'hl-fence';
    else if (/^###\s/.test(t)) cls = 'hl-teil';
    else if (/^##\s/.test(t)) cls = 'hl-aufgabe';
    else if (/^#\s/.test(t)) cls = 'hl-titel';
    else if (/^\+\+\+$/.test(t)) cls = 'hl-brk';
    else if (/^!\[/.test(t)) cls = 'hl-bild';
    else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) cls = 'hl-hr';
    else if (/^\|/.test(t)) cls = 'hl-tabelle';
    else if (/^([-*+]\s|\d+[.)]\s)/.test(t)) cls = 'hl-liste';
    else if (/^>/.test(t)) cls = 'hl-zitat';

    var inhalt = (cls === 'hl-aufgabe' || cls === 'hl-teil') ? dvPunkteMarkieren(e) : e;
    raus.push(cls ? '<span class="' + cls + '">' + inhalt + '</span>' : inhalt);
  }
  // Ein Textfeld zeigt nach einem abschließenden Zeilenumbruch noch eine
  // leere Zeile, ein div erzeugt dafür keine Zeilenbox mehr. Ohne dieses
  // Leerzeichen wäre das Backdrop am Ende eine Zeile kürzer und die
  // Einfärbung liefe beim Scrollen gegen Ende aus dem Takt.
  return raus.join('\n') + (/\n$/.test(text) ? ' ' : '');
}

function dvHighlightAktualisieren() {
  var hl = document.getElementById('dv-ed-hl');
  var ta = document.getElementById('dv-ta');
  if (!hl || !ta) return;
  hl.innerHTML = dvQuelleHervorheben(ta.value);
  hl.parentNode.scrollTop = ta.scrollTop;
  hl.parentNode.scrollLeft = ta.scrollLeft;
}

// ── Formatier-Bausteine (Einfüge-Leiste) ─────────────────────────
// DV_CURSOR markiert, wo der Cursor nach dem Einfügen stehen soll; das
// Zeichen selbst wird beim Einfügen entfernt. Ohne Marke landet der Cursor
// am Ende des Bausteins.
var DV_CURSOR = '\u00ab';
var DV_BAUSTEINE = [
  { label: 'Fett',    titel: 'Fett (**Text**) – markierten Text umschließen',   wrap: '**', cls: 'dv-format-fett' },
  { label: 'Kursiv',  titel: 'Kursiv (*Text*) – markierten Text umschließen',   wrap: '*',  cls: 'dv-format-kursiv' },
  { label: 'Bruch',   titel: 'Bruch mit Bruchstrich ({Zähler/Nenner})',        aktion: 'bruch' },
  { trenner: true },
  { label: 'Aufgabe',    titel: 'Neue Aufgabe (##)',                       text: '## Aufgabe ' + DV_CURSOR + '[P]\n' },
  { label: 'a)',         titel: 'Neue Teilaufgabe (###)',                  text: '### ' + DV_CURSOR + '[P]\n' },
  { label: 'Absatz',     titel: 'Absatz ohne eigene Teilaufgabe (::: text)', text: '::: text\n' + DV_CURSOR + '\n:::\n' },
  { trenner: true },
  { label: 'Linien',     titel: 'Schreiblinien (::: linien)',              text: '::: linien n=4\n' },
  { label: 'Platz',      titel: 'Freiraum ohne eigenes Gitter (::: platz h=0)',                              text: '::: platz h=0\n' },
  { label: 'Kästchen',   titel: 'Kästchenfläche, füllt bis zum Seitenende (::: raster h=auto)',             text: '::: raster h=auto\n' },
  { trenner: true },
  { label: 'Hinweis',    titel: 'Hinweiskasten (::: hinweis)',             text: '::: hinweis titel="Hinweis"\n' + DV_CURSOR + '\n:::\n' },
  { label: 'Tabelle',    titel: 'Tabelle',                                 text: '| ' + DV_CURSOR + 'Spalte 1 | Spalte 2 |\n|---|---|\n| Zelle | Zelle |\n' },
  { label: 'Ankreuzen',  titel: 'Ankreuzoptionen (MC): - [ ] Text',        text: '- [ ] ' + DV_CURSOR + 'Option A\n- [ ] Option B\n- [ ] Option C\n' },
  { label: 'Seite',      titel: 'Seitenumbruch (+++)',                     text: '+++\n' },
  { label: 'Abschluss',  titel: 'Abschlussseite: Formfehler-Hinweis + Punkte/Note/Datum/Signatur (::: abschluss)', text: '::: abschluss\n:::\n' }
];

// Baustein an der Cursorposition einfügen – immer auf eigener Zeile,
// damit der Parser ihn als Block erkennt.
function dvBausteinEinfuegen(vorlage) {
  var ta = document.getElementById('dv-ta');
  if (!ta) return;
  var start = ta.selectionStart, ende = ta.selectionEnd;
  var vorher = ta.value.slice(0, start);
  var nachher = ta.value.slice(ende);

  var cursorRel = vorlage.indexOf(DV_CURSOR);
  var text = vorlage.replace(DV_CURSOR, '');
  if (cursorRel < 0) cursorRel = text.length;

  var davor = (vorher && !/\n$/.test(vorher)) ? '\n' : '';
  var danach = (nachher && !/^\n/.test(nachher)) ? '\n' : '';
  text = davor + text + danach;
  cursorRel += davor.length;

  DV.quelle = vorher + text + nachher;
  ta.value = DV.quelle;
  var pos = vorher.length + cursorRel;
  ta.setSelectionRange(pos, pos);
  ta.focus();
  localStorage.setItem('dv_quelle', DV.quelle);
  dvUpdate();
}

// Markierten Text im Editor mit einem Zeichenpaar umschließen (z.B. ** für
// fett). Ohne Auswahl wird ein Platzhaltertext eingefügt und markiert,
// damit man direkt weitertippen kann.
function dvFormatUmschliessen(marker) {
  var ta = document.getElementById('dv-ta');
  if (!ta) return;
  var start = ta.selectionStart, ende = ta.selectionEnd;
  var ausgewaehlt = ta.value.slice(start, ende) || 'Text';
  var text = marker + ausgewaehlt + marker;

  DV.quelle = ta.value.slice(0, start) + text + ta.value.slice(ende);
  ta.value = DV.quelle;
  var neuStart = start + marker.length;
  ta.setSelectionRange(neuStart, neuStart + ausgewaehlt.length);
  ta.focus();
  localStorage.setItem('dv_quelle', DV.quelle);
  dvUpdate();
}

// Bruch an der Cursorposition einfügen ({Zähler/Nenner}). Anders als
// dvFormatUmschliessen (symmetrisches Zeichenpaar) braucht ein Bruch drei
// unterschiedliche Teile – eine markierte Auswahl wird als Zähler
// übernommen, der Nenner-Platzhalter danach markiert zum Weitertippen.
function dvBruchEinfuegen() {
  var ta = document.getElementById('dv-ta');
  if (!ta) return;
  var start = ta.selectionStart, ende = ta.selectionEnd;
  var zaehler = ta.value.slice(start, ende) || '3';
  var nenner = '4';
  var text = '{' + zaehler + '/' + nenner + '}';

  DV.quelle = ta.value.slice(0, start) + text + ta.value.slice(ende);
  ta.value = DV.quelle;
  var nennerStart = start + 1 + zaehler.length + 1;
  ta.setSelectionRange(nennerStart, nennerStart + nenner.length);
  ta.focus();
  localStorage.setItem('dv_quelle', DV.quelle);
  dvUpdate();
}

// ── Editor ↔ Vorschau-Synchronisation ─────────────────────────────
// Jeder gerenderte Block trägt data-zeile (Quellzeile, siehe pushBlock()
// in core/doc-parser.js). Cursor im Editor → Vorschau scrollt zum
// zugehörigen Block; Klick in der Vorschau → Editor springt zur Zeile.
// _dvSyncAktiv verhindert, dass ein programmatischer Sprung (z.B. das
// Setzen der Cursorposition beim Vorschau-Klick) sofort den jeweils
// anderen Handler erneut auslöst (Ping-Pong).
var _dvSyncAktiv = false;
var _dvSyncTimer = null;

function dvCursorZuVorschau() {
  if (_dvSyncAktiv) return;
  clearTimeout(_dvSyncTimer);
  _dvSyncTimer = setTimeout(function () {
    var ta = document.getElementById('dv-ta');
    var pages = document.getElementById('dv-pages');
    if (!ta || !pages || document.activeElement !== ta) return;
    var zeile = ta.value.slice(0, ta.selectionStart).split('\n').length;
    var bloecke = pages.querySelectorAll('[data-zeile]');
    var treffer = null;
    for (var i = 0; i < bloecke.length; i++) {
      if (parseInt(bloecke[i].getAttribute('data-zeile'), 10) <= zeile) treffer = bloecke[i];
      else break; // data-zeile-Elemente stehen in Dokumentreihenfolge
    }
    if (!treffer) treffer = bloecke[0];
    if (!treffer) return;
    // behavior:'smooth' bewusst vermieden: die Animation kann durch danach
    // laufenden Code (z.B. weitere Events) abgebrochen werden, bevor sie
    // fertig ist, und das Scrollen bleibt dann sichtbar aus.
    treffer.scrollIntoView({ block: 'center' });
    treffer.classList.add('dv-sync-blitz');
    setTimeout(function () { treffer.classList.remove('dv-sync-blitz'); }, 900);
  }, 150);
}

function dvVorschauZuCursor(e) {
  var ziel = e.target.closest && e.target.closest('[data-zeile]');
  if (!ziel) return;
  var zeile = parseInt(ziel.getAttribute('data-zeile'), 10);
  if (!zeile) return;
  var ta = document.getElementById('dv-ta');
  if (!ta) return;
  var zeilen = ta.value.split('\n');
  var pos = 0;
  for (var i = 0; i < zeile - 1 && i < zeilen.length; i++) pos += zeilen[i].length + 1;
  _dvSyncAktiv = true;
  ta.focus();
  ta.setSelectionRange(pos, pos);
  setTimeout(function () { _dvSyncAktiv = false; }, 300);
}

function dvUpdate() {
  dvHighlightAktualisieren();
  var v = dvVorlage(DV.vorlageId);
  var doc = docParse(DV.quelle);
  dvBilderInBlocksAufloesen(doc.blocks);
  var gerendert = docRender(doc, v);
  var pages = document.getElementById('dv-pages');
  if (!pages) return;

  // docPaginate baut #dv-pages komplett neu auf – dabei schrumpft der Inhalt
  // kurzzeitig auf 0, wodurch der Browser die Scroll-Position der Vorschau
  // zurücksetzt. Also merken und danach wiederherstellen.
  var vorschau = document.querySelector('.dv-preview');
  var scrollVorher = vorschau ? vorschau.scrollTop : 0;

  var seiten = docPaginate(pages, gerendert.nodes, v, doc.meta, dvAufgabenSummen(doc.blocks), gerendert.titelblock);
  pages.style.setProperty('--dv-zoom', String(DV.zoom));
  if (vorschau) vorschau.scrollTop = scrollVorher;

  DV.seiten = seiten.length;
  DV.warnungen = doc.warnungen;

  // @page passend zum Format der Vorlage
  var fmt = DV_FORMATE[v.seite.format] || DV_FORMATE.A4;
  var st = document.getElementById('dv-print-rule');
  if (st) st.textContent = '@page { size: ' + fmt.breite + 'mm ' + fmt.hoehe + 'mm; margin: 0; }';

  dvStatus(doc, v);
  dvBilderPanelAktualisieren();
}

function dvStatus(doc, v) {
  var el = document.getElementById('dv-status');
  if (!el) return;
  el.innerHTML = '';
  var aufgaben = doc.blocks.filter(function (b) { return b.t === 'aufgabe'; }).length;
  var gp = dvGesamtpunkte(doc.blocks);
  var teile = [
    DV.seiten + (DV.seiten === 1 ? ' Seite' : ' Seiten'),
    aufgaben + (aufgaben === 1 ? ' Aufgabe' : ' Aufgaben')
  ];
  if (gp != null) teile.push(dvZahl(gp) + ' Punkte');
  el.appendChild(tx('span', '', teile.join(' · ')));
  if (DV.warnungen.length) {
    el.appendChild(tx('span', 'dv-warn', '⚠ ' + DV.warnungen[0]));
  }
}

var _dvTimer = null;
function dvUpdateSpaeter() {
  clearTimeout(_dvTimer);
  _dvTimer = setTimeout(function () {
    localStorage.setItem('dv_quelle', DV.quelle);
    dvUpdate();
  }, 250);
}

// ── Zoom ─────────────────────────────────────────────────────────
function dvSetZoom(z) {
  DV.zoom = Math.min(1.5, Math.max(0.25, z));
  localStorage.setItem('dv_zoom', String(DV.zoom));
  var pages = document.getElementById('dv-pages');
  if (pages) pages.style.setProperty('--dv-zoom', String(DV.zoom));
  var lbl = document.getElementById('dv-zoom-lbl');
  if (lbl) lbl.textContent = Math.round(DV.zoom * 100) + ' %';
}

function dvZoomAnpassen() {
  var pv = document.querySelector('.dv-preview');
  var v = dvVorlage(DV.vorlageId);
  var fmt = DV_FORMATE[v.seite.format] || DV_FORMATE.A4;
  if (!pv) return;
  dvSetZoom((pv.clientWidth - 60) / (fmt.breite * DV_PX_PRO_MM));
}

// ── Datei importieren ────────────────────────────────────────────
function dvDateiLaden(file) {
  if (!file) return;
  var r = new FileReader();
  r.onload = function () {
    DV.quelle = dvBilderAusTextAuslagern(String(r.result || ''));
    var ta = document.getElementById('dv-ta');
    if (ta) ta.value = DV.quelle;
    localStorage.setItem('dv_quelle', DV.quelle);
    localStorage.setItem('dv_bilder', JSON.stringify(DV.bilder));
    dvUpdate();
  };
  r.readAsText(file, 'utf-8');
}

// ── Bild einfügen (Upload oder Drag&Drop) ─────────────────────────
// Bettet das Bild als Data-URL direkt im Dokumenttext ein – kein
// Cloud-Upload nötig, funktioniert mit jeder lokalen Datei.
async function dvBildEinfuegen(file, cursorPos) {
  // Dem vom Browser erkannten MIME-Typ vertrauen, wenn vorhanden – deckt
  // z.B. HEIC (iPhone-Fotos) und andere Formate ab, die nicht in der
  // festen Endungsliste von mediaIsImage() stehen. Nur wenn der Browser
  // gar keinen Typ liefert (manche Drag&Drop-Quellen), auf die Endung
  // zurückfallen.
  var istBild = file && (file.type ? file.type.indexOf('image/') === 0 : mediaIsImage(file.name));
  if (!istBild) { alert('„' + (file ? file.name : '') + '" wird nicht als Bild erkannt. Unterstützt werden z.B. jpg, png, gif, webp, heic.'); return; }
  var ta = document.getElementById('dv-ta');
  var pos = cursorPos != null ? cursorPos : (ta ? ta.selectionStart : DV.quelle.length);
  // Position 0 nur akzeptieren, wenn dort kein Frontmatter (---...---) steht –
  // sonst rutscht das Bild davor und zerstört die Metadaten. Stattdessen
  // direkt hinter das Frontmatter setzen.
  if (pos === 0) {
    var fm = DV.quelle.match(/^---\n[\s\S]*?\n---\n?/);
    if (fm) pos = fm[0].length;
  }

  var istSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  var dataUrl;
  try {
    // SVG ist Vektorgrafik – direkt einlesen statt rastern, sonst geht
    // die Schärfe verloren (wichtig z.B. bei GeoGebra-Exporten).
    dataUrl = istSvg ? await new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        // Data-URL selbst bauen (statt readAsDataURL): manche Systeme
        // melden für .svg keinen oder einen falschen MIME-Typ, dann
        // würde der Browser das eingebettete Bild nicht anzeigen.
        var b64 = btoa(unescape(encodeURIComponent(String(r.result))));
        resolve('data:image/svg+xml;base64,' + b64);
      };
      r.onerror = function () { reject(new Error('Datei konnte nicht gelesen werden.')); };
      r.readAsText(file);
    }) : await resizeImageFile(file);
  } catch (e) {
    alert('Bild konnte nicht geladen werden: ' + e.message);
    return;
  }

  var alt = file.name.replace(/\.[^.]+$/, '');
  var id = dvBildNeueId();
  DV.bilder[id] = dataUrl;
  localStorage.setItem('dv_bilder', JSON.stringify(DV.bilder));
  var markdown = '![' + alt + '](' + id + ')\n';
  var vorher = DV.quelle.slice(0, pos);
  var nachher = DV.quelle.slice(pos);
  // Auf eigener Zeile einfügen, mit Leerzeile davor falls nötig
  if (vorher && !/\n\n$/.test(vorher)) markdown = (/\n$/.test(vorher) ? '\n' : '\n\n') + markdown;
  DV.quelle = vorher + markdown + nachher;

  if (ta) {
    ta.value = DV.quelle;
    var neuePos = (vorher + markdown).length;
    ta.setSelectionRange(neuePos, neuePos);
    ta.focus();
  }
  localStorage.setItem('dv_quelle', DV.quelle);
  dvUpdate();
}

// ── Bilder-Panel: Breite/Ausrichtung per Auswahlfeld statt Text-Fummelei ──
// Muss zum Bild-Muster in core/doc-parser.js passen (dort die Referenz).
var DV_BILD_MUSTER = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+(\d+)%)?(?:\s+(links|mitte|rechts))?\)$/;

function dvBildNeueId() {
  var max = 0;
  Object.keys(DV.bilder).forEach(function (k) {
    var m = k.match(/^b(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'b' + (max + 1);
}

// Alte/importierte Dokumente können Bilder noch als eingebettete Data-URL im
// Text haben (eine riesige Base64-Zeile) – vor dem Anzeigen im Editor in
// DV.bilder auslagern und im Text durch eine kurze ID ersetzen.
function dvBilderAusTextAuslagern(text) {
  return text.split('\n').map(function (zeile) {
    var m = zeile.match(DV_BILD_MUSTER);
    if (!m || m[2].indexOf('data:') !== 0) return zeile;
    var id = dvBildNeueId();
    DV.bilder[id] = m[2];
    return dvBildZeileBauen(m[1], id, m[3] ? parseInt(m[3], 10) : null, m[4] || 'mitte');
  }).join('\n');
}

function dvBilderImText() {
  return DV.quelle.split('\n').reduce(function (liste, zeile) {
    var m = zeile.match(DV_BILD_MUSTER);
    if (m) liste.push({
      alt: m[1], src: m[2], anzeigeSrc: DV.bilder[m[2]] || m[2],
      breite: m[3] ? parseInt(m[3], 10) : null, ausrichtung: m[4] || 'mitte'
    });
    return liste;
  }, []);
}

function dvBildZeileBauen(alt, src, breite, ausrichtung) {
  var klammer = src;
  if (breite) klammer += ' ' + breite + '%';
  if (ausrichtung && ausrichtung !== 'mitte') klammer += ' ' + ausrichtung;
  return '![' + alt + '](' + klammer + ')';
}

function dvBildUebernehmen(src, breite, ausrichtung) {
  var zeilen = DV.quelle.split('\n');
  for (var i = 0; i < zeilen.length; i++) {
    var m = zeilen[i].match(DV_BILD_MUSTER);
    if (m && m[2] === src) { zeilen[i] = dvBildZeileBauen(m[1], src, breite, ausrichtung); break; }
  }
  DV.quelle = zeilen.join('\n');
  var ta = document.getElementById('dv-ta');
  if (ta) ta.value = DV.quelle;
  localStorage.setItem('dv_quelle', DV.quelle);
  dvUpdate();
}

function dvBildAusDokumentEntfernen(src) {
  if (!confirm('Dieses Bild aus dem Dokument entfernen?')) return;
  DV.quelle = DV.quelle.split('\n').filter(function (zeile) {
    var m = zeile.match(DV_BILD_MUSTER);
    return !(m && m[2] === src);
  }).join('\n');
  delete DV.bilder[src];
  var ta = document.getElementById('dv-ta');
  if (ta) ta.value = DV.quelle;
  localStorage.setItem('dv_quelle', DV.quelle);
  localStorage.setItem('dv_bilder', JSON.stringify(DV.bilder));
  dvUpdate();
}

// Erkennt und entfernt einfarbigen/transparenten Rand automatisch – kein
// externes Bildbearbeitungsprogramm nötig. callback(neueDataUrl, fehler).
function dvBildWeissraumErkennenUndZuschneiden(src, callback) {
  var img = new Image();
  img.onload = function () {
    var breite = img.naturalWidth, hoehe = img.naturalHeight;
    var canvas = document.createElement('canvas');
    canvas.width = breite; canvas.height = hoehe;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var daten;
    try { daten = ctx.getImageData(0, 0, breite, hoehe).data; }
    catch (e) { callback(null, 'Bild kann nicht analysiert werden (Herkunft blockiert Zugriff).'); return; }

    var SCHWELLE = 248; // ab diesem Helligkeitswert gilt ein Pixel als "leer"
    function istLeer(x, y) {
      var i = (y * breite + x) * 4;
      if (daten[i + 3] < 10) return true; // transparent
      return daten[i] >= SCHWELLE && daten[i + 1] >= SCHWELLE && daten[i + 2] >= SCHWELLE;
    }

    var oben = 0, unten = hoehe - 1, links = 0, rechts = breite - 1;
    var x, y, gefunden;
    for (; oben < hoehe; oben++) { gefunden = false; for (x = 0; x < breite; x++) if (!istLeer(x, oben)) { gefunden = true; break; } if (gefunden) break; }
    for (; unten > oben; unten--) { gefunden = false; for (x = 0; x < breite; x++) if (!istLeer(x, unten)) { gefunden = true; break; } if (gefunden) break; }
    for (; links < breite; links++) { gefunden = false; for (y = oben; y <= unten; y++) if (!istLeer(links, y)) { gefunden = true; break; } if (gefunden) break; }
    for (; rechts > links; rechts--) { gefunden = false; for (y = oben; y <= unten; y++) if (!istLeer(rechts, y)) { gefunden = true; break; } if (gefunden) break; }

    var POLSTER = 6;
    oben = Math.max(0, oben - POLSTER);
    links = Math.max(0, links - POLSTER);
    unten = Math.min(hoehe - 1, unten + POLSTER);
    rechts = Math.min(breite - 1, rechts + POLSTER);
    var neueBreite = rechts - links + 1, neueHoehe = unten - oben + 1;

    if (neueBreite >= breite - 2 * POLSTER + 1 && neueHoehe >= hoehe - 2 * POLSTER + 1) {
      callback(null, 'Kein nennenswerter Weißraum gefunden.');
      return;
    }

    var aus = document.createElement('canvas');
    aus.width = neueBreite; aus.height = neueHoehe;
    aus.getContext('2d').drawImage(canvas, links, oben, neueBreite, neueHoehe, 0, 0, neueBreite, neueHoehe);
    callback(aus.toDataURL('image/png'), null);
  };
  img.onerror = function () { callback(null, 'Bild konnte nicht geladen werden.'); };
  img.src = src;
}

var DV_BILD_BREITEN = [['', 'Originalgröße'], ['25', '25%'], ['50', '50%'], ['75', '75%'], ['100', '100%']];
var DV_BILD_AUSRICHTUNGEN = [['links', 'Links'], ['mitte', 'Mitte'], ['rechts', 'Rechts']];

var _dvBilderOffen = localStorage.getItem('dv_bilder_offen') !== 'false';

function dvBilderPanelAktualisieren() {
  var wrap = document.getElementById('dv-bilder-panel');
  if (!wrap) return;
  wrap.innerHTML = '';
  var bilder = dvBilderImText();
  if (!bilder.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  wrap.classList.toggle('dv-bilder-eingeklappt', !_dvBilderOffen);

  var titelZeile = mk('div', 'dv-bilder-titel');
  titelZeile.appendChild(tx('span', 'dv-bilder-pfeil', _dvBilderOffen ? '▾' : '▸'));
  titelZeile.appendChild(tx('span', '', '🖼 Bilder im Dokument (' + bilder.length + ')'));
  titelZeile.onclick = function () {
    _dvBilderOffen = !_dvBilderOffen;
    localStorage.setItem('dv_bilder_offen', String(_dvBilderOffen));
    dvBilderPanelAktualisieren();
  };
  wrap.appendChild(titelZeile);
  if (!_dvBilderOffen) return;

  bilder.forEach(function (b) {
    var row = mk('div', 'dv-bild-row');

    var thumb = document.createElement('img');
    thumb.src = b.anzeigeSrc; thumb.className = 'dv-bild-thumb';
    row.appendChild(thumb);

    var mitte = mk('div', 'dv-bild-row-mitte');
    mitte.appendChild(tx('div', 'dv-bild-row-alt', b.alt || '(ohne Beschreibung)'));

    var regler = mk('div', 'dv-bild-row-regler');

    var breiteSel = document.createElement('select');
    breiteSel.className = 'finp';
    DV_BILD_BREITEN.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      if (String(b.breite || '') === o[0]) op.selected = true;
      breiteSel.appendChild(op);
    });

    var ausrichtungSel = document.createElement('select');
    ausrichtungSel.className = 'finp';
    DV_BILD_AUSRICHTUNGEN.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      if (b.ausrichtung === o[0]) op.selected = true;
      ausrichtungSel.appendChild(op);
    });

    var uebernehmen = function () {
      dvBildUebernehmen(b.src, breiteSel.value ? parseInt(breiteSel.value, 10) : null, ausrichtungSel.value);
    };
    breiteSel.onchange = uebernehmen;
    ausrichtungSel.onchange = uebernehmen;

    regler.appendChild(breiteSel);
    regler.appendChild(ausrichtungSel);
    mitte.appendChild(regler);
    row.appendChild(mitte);

    var schneidenBtn = btn('✂', 'btn btn-ghost btn-xs');
    schneidenBtn.title = 'Weißraum am Rand automatisch zuschneiden';
    schneidenBtn.onclick = function () {
      schneidenBtn.disabled = true;
      var vorherText = schneidenBtn.textContent;
      schneidenBtn.textContent = '…';
      dvBildWeissraumErkennenUndZuschneiden(b.anzeigeSrc, function (neuerSrc, fehler) {
        schneidenBtn.disabled = false;
        schneidenBtn.textContent = vorherText;
        if (fehler) { alert(fehler); return; }
        DV.bilder[b.src] = neuerSrc;
        localStorage.setItem('dv_bilder', JSON.stringify(DV.bilder));
        dvUpdate();
      });
    };
    row.appendChild(schneidenBtn);

    var delBtn = btn('✕', 'btn btn-danger btn-xs');
    delBtn.title = 'Bild entfernen';
    delBtn.onclick = function () { dvBildAusDokumentEntfernen(b.src); };
    row.appendChild(delBtn);

    wrap.appendChild(row);
  });
}

// ── Reiter umschalten ────────────────────────────────────────────
function dvTab(name) {
  DV.tab = name;
  localStorage.setItem('dv_tab', name);
  var ip = document.getElementById('dv-inhalt-pane');
  var vp = document.getElementById('dv-vorlage-pane');
  if (ip) ip.style.display = name === 'inhalt' ? 'flex' : 'none';
  if (vp) vp.style.display = name === 'vorlage' ? 'block' : 'none';
  document.querySelectorAll('.dv-tab').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === name);
  });
}

// ── Oberfläche ───────────────────────────────────────────────────
function dvRenderApp() {
  var root = document.getElementById('root');
  root.innerHTML = '';

  // Topbar
  var bar = mk('div', 'topbar');
  bar.appendChild(buildAppNav('dok'));
  var right = mk('div', 'topbar-right');
  if (DV.version) {
    var d = new Date(DV.version);
    var vs = tx('span', 'topbar-version', d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' ✓');
    vs.style.cursor = 'pointer';
    vs.onclick = function () { location.reload(true); };
    right.appendChild(vs);
  }
  bar.appendChild(right);
  root.appendChild(bar);

  var layout = mk('div', 'dv-layout');

  // ── Links: Reiter „Inhalt" / „Vorlage" ──
  var ed = mk('div', 'dv-editor');

  var tabs = mk('div', 'dv-tabs');
  [['inhalt', '📝 Inhalt'], ['vorlage', '🎨 Vorlage']].forEach(function (t) {
    var b = btn(t[1], 'dv-tab' + (DV.tab === t[0] ? ' active' : ''));
    b.setAttribute('data-tab', t[0]);
    b.onclick = function () { dvTab(t[0]); };
    tabs.appendChild(b);
  });
  ed.appendChild(tabs);

  // Reiter 1: Quelltext
  var inhalt = mk('div', 'dv-pane-inhalt');
  inhalt.id = 'dv-inhalt-pane';

  var edHdr = mk('div', 'dv-editor-hdr');
  edHdr.appendChild(tx('span', 'fl', 'Inhalt'));
  var sep1 = mk('div', ''); sep1.style.flex = '1'; edHdr.appendChild(sep1);

  var fileInp = document.createElement('input');
  fileInp.type = 'file';
  fileInp.accept = '.md,.markdown,.txt,text/plain';
  fileInp.style.display = 'none';
  fileInp.onchange = function (e) { dvDateiLaden(e.target.files[0]); e.target.value = ''; };
  edHdr.appendChild(fileInp);

  var ladeBtn = btn('📂 Datei laden', 'btn btn-ghost btn-sm');
  ladeBtn.onclick = function () { fileInp.click(); };
  edHdr.appendChild(ladeBtn);

  var bildInp = document.createElement('input');
  bildInp.type = 'file';
  bildInp.accept = 'image/*';
  bildInp.style.display = 'none';
  // Cursor-Position, die beim Klick auf den Button galt – der Button nimmt
  // beim Öffnen des Dateidialogs den Fokus weg, danach ist selectionStart
  // nicht mehr verlässlich. Deshalb hier merken statt erst im onchange lesen.
  bildInp.onchange = function (e) {
    dvBildEinfuegen(e.target.files[0], bildInp.__cursorPos);
    e.target.value = '';
  };
  edHdr.appendChild(bildInp);

  var bildBtn = btn('🖼 Bild einfügen', 'btn btn-ghost btn-sm');
  bildBtn.onclick = function () {
    bildInp.__cursorPos = ta.selectionStart;
    bildInp.click();
  };
  edHdr.appendChild(bildBtn);

  var demoBtn = btn('Beispiel', 'btn btn-ghost btn-sm');
  demoBtn.onclick = function () {
    if (DV.quelle.trim() && !confirm('Aktuellen Inhalt durch das Beispiel ersetzen?')) return;
    DV.quelle = DV_DEMO;
    document.getElementById('dv-ta').value = DV.quelle;
    localStorage.setItem('dv_quelle', DV.quelle);
    dvUpdate();
  };
  edHdr.appendChild(demoBtn);
  inhalt.appendChild(edHdr);

  var bilderPanel = mk('div', 'dv-bilder-panel');
  bilderPanel.id = 'dv-bilder-panel';
  bilderPanel.style.display = 'none';
  inhalt.appendChild(bilderPanel);

  var formatLeiste = mk('div', 'dv-format-leiste');
  DV_BAUSTEINE.forEach(function (b) {
    if (b.trenner) { formatLeiste.appendChild(mk('span', 'dv-format-trenner')); return; }
    var fb = btn(b.label, 'btn btn-ghost btn-xs dv-format-btn' + (b.cls ? ' ' + b.cls : ''));
    fb.title = b.titel;
    fb.onclick = b.wrap ? function () { dvFormatUmschliessen(b.wrap); }
      : b.aktion === 'bruch' ? function () { dvBruchEinfuegen(); }
      : function () { dvBausteinEinfuegen(b.text); };
    formatLeiste.appendChild(fb);
  });
  inhalt.appendChild(formatLeiste);

  // Textfeld + farbiges Backdrop (siehe dvQuelleHervorheben)
  var edWrap = mk('div', 'dv-ed-wrap');
  var backdrop = mk('div', 'dv-ed-backdrop');
  var hl = mk('div', 'dv-ed-hl');
  hl.id = 'dv-ed-hl';
  backdrop.appendChild(hl);
  edWrap.appendChild(backdrop);

  var ta = document.createElement('textarea');
  ta.id = 'dv-ta';
  ta.className = 'dv-editor-ta';
  ta.spellcheck = false;
  ta.value = DV.quelle;
  ta.placeholder = '# Titel\n\n## Aufgabe 1 [5P]\nAufgabentext …\n\n::: linien n=4';
  ta.oninput = function (e) { DV.quelle = e.target.value; dvHighlightAktualisieren(); dvUpdateSpaeter(); };
  ta.addEventListener('scroll', function () {
    backdrop.scrollTop = ta.scrollTop;
    backdrop.scrollLeft = ta.scrollLeft;
  });
  ta.addEventListener('click', dvCursorZuVorschau);
  ta.addEventListener('keyup', dvCursorZuVorschau);
  ta.addEventListener('dragover', function (e) { e.preventDefault(); });
  ta.addEventListener('drop', function (e) {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    var datei = e.dataTransfer.files[0];
    var istBild = datei.type ? datei.type.indexOf('image/') === 0 : mediaIsImage(datei.name);
    if (istBild) dvBildEinfuegen(datei, ta.selectionStart);
    else dvDateiLaden(datei);
  });
  edWrap.appendChild(ta);
  inhalt.appendChild(edWrap);

  var edFuss = mk('div', 'dv-editor-fuss');
  edFuss.appendChild(tx('span', '', '## Aufgabe · ### a) · [8P] · ::: linien n=5 · ::: raster h=60 · +++ Seitenumbruch'));
  inhalt.appendChild(edFuss);
  ed.appendChild(inhalt);

  // Reiter 2: Vorlagen-Editor
  var vpane = dvVorlagenPanel();
  vpane.id = 'dv-vorlage-pane';
  ed.appendChild(vpane);

  layout.appendChild(ed);

  // ── Rechts: Vorlage + Vorschau ──
  var rechts = mk('div', 'dv-right');

  var tb = mk('div', 'dv-toolbar');
  tb.appendChild(tx('span', 'fl', 'Vorlage'));

  var sel = document.createElement('select');
  sel.className = 'finp';
  sel.id = 'dv-vorlage-sel';
  var info = tx('div', 'dv-vorlage-info', '');
  info.id = 'dv-vorlage-info';
  sel.onchange = function () {
    DV.vorlageId = sel.value;
    localStorage.setItem('dv_vorlage', DV.vorlageId);
    dvSelectAktualisieren();
    dvVorlagenPanelNeu();
    dvUpdate();
  };
  tb.appendChild(sel);
  tb.appendChild(info);
  tb.appendChild(mk('div', 'dv-toolbar-sep'));

  var zoom = mk('div', 'dv-zoom');
  var zMinus = btn('–', 'btn btn-ghost btn-xs');
  zMinus.onclick = function () { dvSetZoom(DV.zoom - 0.1); };
  var zLbl = tx('span', '', Math.round(DV.zoom * 100) + ' %');
  zLbl.id = 'dv-zoom-lbl';
  zLbl.style.minWidth = '42px';
  zLbl.style.textAlign = 'center';
  var zPlus = btn('+', 'btn btn-ghost btn-xs');
  zPlus.onclick = function () { dvSetZoom(DV.zoom + 0.1); };
  var zFit = btn('Breite', 'btn btn-ghost btn-xs');
  zFit.onclick = dvZoomAnpassen;
  zoom.appendChild(zMinus); zoom.appendChild(zLbl); zoom.appendChild(zPlus); zoom.appendChild(zFit);
  tb.appendChild(zoom);

  var status = tx('div', 'dv-editor-fuss', '');
  status.id = 'dv-status';
  status.style.cssText = 'border:none;padding:0;gap:12px;';
  tb.appendChild(status);

  var hinweis = tx('div', 'dv-vorlage-info', 'Druckdialog: Ränder „Keine", Hintergrundgrafiken an');
  hinweis.style.maxWidth = '150px';
  tb.appendChild(hinweis);

  var printBtn = btn('🖨 Drucken / PDF', 'btn btn-pri btn-sm');
  printBtn.title = 'Im Druckdialog: Ränder auf „Keine" und Hintergrundgrafiken aktivieren';
  printBtn.onclick = function () { window.print(); };
  tb.appendChild(printBtn);
  rechts.appendChild(tb);

  var pv = mk('div', 'dv-preview');
  var pages = mk('div', 'dv-pages');
  pages.id = 'dv-pages';
  pages.addEventListener('click', dvVorschauZuCursor);
  pv.appendChild(pages);
  rechts.appendChild(pv);

  layout.appendChild(rechts);
  root.appendChild(layout);

  var pr = document.createElement('style');
  pr.id = 'dv-print-rule';
  document.head.appendChild(pr);
}

// ── Version ──────────────────────────────────────────────────────
async function dvCheckVersion() {
  var v = await fetch('version.json?_=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return null; });
  if (v && v.built !== DV.version) {
    DV.version = v.built;
    var el = document.querySelector('.topbar-version');
    if (el) {
      var d = new Date(v.built);
      el.textContent = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' ✓';
    }
  }
}

// ── Init ─────────────────────────────────────────────────────────
(async function () {
  DV.quelle = localStorage.getItem('dv_quelle');
  if (DV.quelle == null) DV.quelle = DV_DEMO;
  try { DV.bilder = JSON.parse(localStorage.getItem('dv_bilder')) || {}; } catch (e) { DV.bilder = {}; }
  // Bestehende Dokumente aus der Zeit vor der Bild-ID-Trennung migrieren:
  // eingebettete Data-URLs im Text nach DV.bilder auslagern.
  var quelleVorher = DV.quelle;
  DV.quelle = dvBilderAusTextAuslagern(DV.quelle);
  if (DV.quelle !== quelleVorher) {
    localStorage.setItem('dv_quelle', DV.quelle);
    localStorage.setItem('dv_bilder', JSON.stringify(DV.bilder));
  }

  dvVorlagenCacheLaden(); // sofort verfügbar, ohne auf das Netz zu warten
  var gewuenschteVorlageId = localStorage.getItem('dv_vorlage') || 'ka-klassisch';
  DV.vorlageId = gewuenschteVorlageId;
  if (!DV_VORLAGEN.some(function (v) { return v.id === DV.vorlageId; })) DV.vorlageId = DV_VORLAGEN[0].id;
  var z = parseFloat(localStorage.getItem('dv_zoom'));
  if (z) DV.zoom = z;
  var gespeicherterTab = localStorage.getItem('dv_tab');
  if (gespeicherterTab === 'inhalt' || gespeicherterTab === 'vorlage') DV.tab = gespeicherterTab;

  dvRenderApp();
  dvSelectAktualisieren();
  dvTab(DV.tab);
  dvUpdate();

  var wTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(wTimer);
    wTimer = setTimeout(dvUpdate, 200);
  });

  dvCheckVersion();

  // Cloud-Stand nachladen (z.B. Vorlagen von einem anderen Gerät)
  var geaendert = await dvVorlagenVonCloudLaden();
  if (geaendert) {
    // Ursprünglich gewünschte Vorlage erneut versuchen – sie kann erst
    // durch den Cloud-Abgleich aufgetaucht sein (z.B. auf einem neuen Gerät).
    if (DV_VORLAGEN.some(function (v) { return v.id === gewuenschteVorlageId; })) {
      DV.vorlageId = gewuenschteVorlageId;
    } else if (!DV_VORLAGEN.some(function (v) { return v.id === DV.vorlageId; })) {
      DV.vorlageId = DV_VORLAGEN[0].id;
    }
    dvSelectAktualisieren();
    dvVorlagenPanelNeu();
    dvUpdate();
  }
})();
