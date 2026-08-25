// ── Dokument-Renderer ────────────────────────────────────────────
// Dokumentmodell + Vorlage → Fluss von DOM-Blöcken.
// Erzeugt NUR Struktur und Klassen; jede Maßangabe kommt aus den
// Custom Properties der Vorlage (siehe core/doc-vorlagen.js).

function dvZahl(n) {
  if (n == null) return '';
  return String(n).replace('.', ',');
}

function dvGesamtpunkte(blocks) {
  var summe = 0, gefunden = false;
  blocks.forEach(function (b) {
    if (b.t !== 'aufgabe') return;
    var s = dvAufgabeSumme(b);
    if (s != null) { summe += s; gefunden = true; }
  });
  return gefunden ? summe : null;
}

// Punktesumme einer einzelnen Aufgabe (eigene Punkte oder Summe ihrer Teile).
function dvAufgabeSumme(aufgabe) {
  // Punkte der Teilaufgaben ersetzen die eigene Punktzahl der Aufgabe, statt
  // dazuaddiert zu werden: "## Aufgabe 1 [8P]" mit "### a) [5P]" + "### b)
  // [3P]" ergibt 8, nicht 16 - die [8P] an der Aufgabe ist dann nur die
  // (redundante) Gesamtangabe, keine zusätzlichen Punkte obendrauf.
  var summeTeile = 0, gefundenTeile = false;
  (aufgabe.kinder || []).forEach(function (k) {
    if (k.t === 'teil' && k.punkte != null) { summeTeile += k.punkte; gefundenTeile = true; }
  });
  if (gefundenTeile) return summeTeile;
  return aufgabe.punkte != null ? aufgabe.punkte : null;
}

// Aufgabennummer → Gesamtpunktzahl. Wird VOR der Seitenaufteilung aus dem
// unzerteilten Dokumentmodell berechnet, damit die Summe stimmt, egal wie
// eine Aufgabe später über mehrere Seiten verteilt wird.
function dvAufgabenSummen(blocks) {
  var map = {};
  blocks.forEach(function (b) {
    if (b.t !== 'aufgabe') return;
    var s = dvAufgabeSumme(b);
    if (s != null) map[b.nr] = s;
  });
  return map;
}

// ── Punkteanzeige ────────────────────────────────────────────────
function dvPunkteEl(punkte, v) {
  if (punkte == null || v.aufgabe.punkte === 'keine') return null;
  if (v.aufgabe.punkte === 'klammer') {
    return tx('span', 'dv-punkte-klammer', '(' + dvZahl(punkte) + ' P)');
  }
  var k = mk('span', 'dv-punkte-kasten');
  k.appendChild(tx('span', 'dv-punkte-feld', ''));
  k.appendChild(tx('span', 'dv-punkte-max', '/ ' + dvZahl(punkte) + ' P'));
  return k;
}

// ── Einzelne Blöcke ──────────────────────────────────────────────
// dvBlock() ist ein dünner Wrapper um dvBlockRoh(): markiert jedes erzeugte
// Element mit data-zeile (Quellzeile aus dem Parser, siehe pushBlock() in
// doc-parser.js), damit Editor-Cursor ↔ Vorschau in beide Richtungen
// synchronisiert werden können (siehe dvCursorZuVorschau()/dvVorschauZuCursor()
// in dokument-app.js).
function dvBlock(b, v) {
  var el = dvBlockRoh(b, v);
  if (el && el.setAttribute && b && b.zeile != null) el.setAttribute('data-zeile', b.zeile);
  return el;
}
function dvBlockRoh(b, v) {
  if (b.t === 'p') {
    var p = mk('p', 'dv-p'); p.innerHTML = b.html; return p;
  }

  if (b.t === 'h') {
    var h = mk('div', 'dv-h' + b.level); h.innerHTML = b.html; return h;
  }

  if (b.t === 'liste') {
    var l = mk(b.ordered ? 'ol' : 'ul', 'dv-liste' + (b.mc ? ' dv-liste-mc' : ''));
    b.items.forEach(function (it) {
      var li = mk('li', '');
      if (b.mc) {
        li.appendChild(mk('span', 'dv-mc-kaestchen' + (it.angekreuzt ? ' dv-mc-angekreuzt' : '')));
        var text = mk('span', '');
        text.innerHTML = it.text;
        li.appendChild(text);
      } else {
        li.innerHTML = it.text;
      }
      l.appendChild(li);
    });
    return l;
  }

  if (b.t === 'tabelle') {
    var wrap = mk('div', 'dv-tabelle-wrap');
    var t = mk('table', 'dv-tabelle');
    if (b.kopf) {
      var th = mk('thead', ''); var trh = mk('tr', '');
      b.kopf.forEach(function (c) { var e = mk('th', ''); e.innerHTML = c; trh.appendChild(e); });
      th.appendChild(trh); t.appendChild(th);
    }
    var tb = mk('tbody', '');
    tb.setAttribute('data-splitbody', '1');
    b.zeilen.forEach(function (row) {
      var tr = mk('tr', '');
      row.forEach(function (c) { var e = mk('td', ''); e.innerHTML = c; tr.appendChild(e); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t);
    return wrap;
  }

  if (b.t === 'abschluss') {
    var ab = mk('div', 'dv-abschluss');

    var formfehler = mk('div', 'dv-abschluss-formfehler');
    if (b.kinder && b.kinder.length) {
      b.kinder.forEach(function (k) { formfehler.appendChild(dvBlock(k, v)); });
    } else {
      formfehler.appendChild(tx('p', '', 'Abzüge für Formfehler kann es geben bei:'));
      var ul = mk('ul', 'dv-liste');
      // Text kommt aus der Vorlage (Gruppe "Abschluss", Feld Hinweistext),
      // jede Zeile wird ein eigener Aufzählungspunkt – DV_ABSCHLUSS_STANDARDTEXT
      // (core/doc-vorlagen.js) nur als Rückfallebene für Vorlagen, die das
      // Feld (noch) gar nicht kennen.
      var text = (v.abschluss && v.abschluss.hinweistext) || DV_ABSCHLUSS_STANDARDTEXT;
      text.split('\n').map(function (t) { return t.trim(); }).filter(Boolean).forEach(function (t) {
        var li = mk('li', ''); li.innerHTML = docInline(t); ul.appendChild(li);
      });
      formfehler.appendChild(ul);
    }
    ab.appendChild(formfehler);

    var tabelle = mk('div', 'dv-abschluss-tabelle');
    var punkteZelle = mk('div', 'dv-abschluss-zelle dv-abschluss-punkte');
    punkteZelle.appendChild(tx('div', 'dv-abschluss-label', 'Gesamtpunktzahl:'));
    punkteZelle.appendChild(tx('div', 'dv-abschluss-punktewert', '/' + (b.gesamtpunkte != null ? dvZahl(b.gesamtpunkte) : '')));
    tabelle.appendChild(punkteZelle);

    tabelle.appendChild(tx('div', 'dv-abschluss-zelle', 'Note:'));

    var notenschluessel = mk('div', 'dv-abschluss-zelle dv-abschluss-notenschluessel');
    notenschluessel.appendChild(tx('div', '', 'deine Note ab ______ Punkte'));
    notenschluessel.appendChild(tx('div', '', 'bessere Note ab ______ Punkte'));
    tabelle.appendChild(notenschluessel);

    tabelle.appendChild(tx('div', 'dv-abschluss-zelle', 'Datum:'));
    tabelle.appendChild(tx('div', 'dv-abschluss-zelle', 'Signatur:'));
    ab.appendChild(tabelle);

    ab.appendChild(tx('div', 'dv-abschluss-unterschrift', 'Datum, Unterschrift Erziehungsberechtigter:'));
    return ab;
  }

  if (b.t === 'teiltext') {
    var tt = mk('div', 'dv-teiltext');
    (b.kinder || []).forEach(function (k) { tt.appendChild(dvBlock(k, v)); });
    return tt;
  }

  if (b.t === 'frei') {
    var frei = mk('div', 'dv-frei');
    (b.kinder || []).forEach(function (k) { frei.appendChild(dvBlock(k, v)); });
    return frei;
  }

  if (b.t === 'kasten') {
    var kb = mk('div', 'dv-kasten dv-kasten-' + b.variante);
    if (b.titel) kb.appendChild(tx('div', 'dv-kasten-titel', b.titel));
    var kbody = mk('div', 'dv-kasten-body');
    (b.kinder || []).forEach(function (k) { kbody.appendChild(dvBlock(k, v)); });
    kb.appendChild(kbody);
    return kb;
  }

  if (b.t === 'linien') {
    var ln = mk('div', 'dv-linien');
    for (var i = 0; i < b.anzahl; i++) ln.appendChild(mk('div', 'dv-linie'));
    return ln;
  }

  if (b.t === 'raster') {
    var r = mk('div', 'dv-raster');
    if (b.autoHoehe) {
      // Platzhalterhöhe für die Seitenaufteilung – docPaginate streckt
      // diesen Block danach auf die tatsächlich verfügbare Resthöhe.
      r.setAttribute('data-auto-hoehe', '1');
      r.style.height = '20mm';
    } else {
      r.style.height = b.hoehe + 'mm';
    }
    return r;
  }

  if (b.t === 'bild') {
    // Alt-Text ist nur fürs img-alt-Attribut (Barrierefreiheit) gedacht,
    // erscheint NICHT als sichtbare Unterschrift im Dokument. Wer eine
    // echte Bildunterschrift will, schreibt sie als normalen Absatz
    // direkt unter das Bild in den Text.
    var bw = mk('div', 'dv-bild dv-bild-' + (b.ausrichtung || 'mitte'));
    var img = document.createElement('img');
    img.src = b.src; img.alt = b.alt || '';
    if (b.breite) img.style.width = b.breite + '%';
    bw.appendChild(img);
    return bw;
  }

  if (b.t === 'hr') return mk('div', 'dv-hr');

  if (b.t === 'teil') {
    var te = mk('div', 'dv-teil');
    var kopfz = mk('div', 'dv-teil-hdr');
    kopfz.appendChild(tx('span', 'dv-teil-marke', dvFuellen(v.teil.marke, { marke: b.marke })));
    if (b.titel) { var tt = mk('span', 'dv-teil-titel'); tt.innerHTML = docInline(b.titel); kopfz.appendChild(tt); }
    if (b.punkte != null) te.setAttribute('data-punkte', b.punkte);
    var tp = dvPunkteEl(b.punkte, v);
    if (tp) { kopfz.appendChild(mk('span', 'dv-teil-leader')); kopfz.appendChild(tp); }
    te.appendChild(kopfz);
    var tbody2 = mk('div', 'dv-teil-body');
    tbody2.setAttribute('data-splitbody', '1');
    (b.kinder || []).forEach(function (k) { tbody2.appendChild(dvBlock(k, v)); });
    te.appendChild(tbody2);
    return te;
  }

  if (b.t === 'aufgabe') {
    var a = mk('section', 'dv-aufgabe' + (v.aufgabe.trennlinie ? ' dv-aufgabe-linie' : ''));
    var titelUnten = !!v.aufgabe.titelUnten;
    var hdr = mk('div', 'dv-aufgabe-hdr' + (v.aufgabe.zentriert ? ' dv-aufgabe-hdr-zentriert' : ''));
    var kopfzeile = mk('div', 'dv-aufgabe-kopfzeile');
    kopfzeile.appendChild(tx('span', 'dv-aufgabe-label', dvFuellen(v.aufgabe.label, { nr: b.nr })));
    if (b.titel && !titelUnten) { var at = mk('span', 'dv-aufgabe-titel'); at.innerHTML = docInline(b.titel); kopfzeile.appendChild(at); }
    a.setAttribute('data-aufgabe-nr', b.nr);
    if (b.punkte != null) a.setAttribute('data-punkte', b.punkte);
    var ap = dvPunkteEl(b.punkte, v);
    if (ap) kopfzeile.appendChild(ap);
    hdr.appendChild(kopfzeile);
    if (b.titel && titelUnten) {
      var atUnten = mk('div', 'dv-aufgabe-titel-unten'); atUnten.innerHTML = docInline(b.titel);
      hdr.appendChild(atUnten);
    }
    a.appendChild(hdr);
    var abody = mk('div', 'dv-aufgabe-body');
    abody.setAttribute('data-splitbody', '1');
    (b.kinder || []).forEach(function (k) { abody.appendChild(dvBlock(k, v)); });
    a.appendChild(abody);
    return a;
  }

  if (b.t === 'brk') return mk('div', 'dv-brk');

  var unbekannt = tx('div', 'dv-p', '');
  return unbekannt;
}

// ── Titelblock ───────────────────────────────────────────────────
function dvTitelblock(doc, v) {
  var m = doc.meta;
  var tb = mk('div', 'dv-titelblock');
  // Umrandeter Kasten fasst NUR Titel+Meta+Namensfeld. Hinweistext und
  // schräger Zusatztext stehen außerhalb, offen auf der Seite. Namensfeld
  // ist immer an (auf einer Klassenarbeit/einem Arbeitsblatt will man es
  // praktisch nie ausblenden) – nur der Stil (Zeile vs. kompaktes Label)
  // bleibt wählbar.
  var box = mk('div', 'dv-titelblock-kasten');

  var kompaktesLabel = v.titelblock.namensfeldStil === 'label';
  var werte = dvPlatzhalter(v, m);

  var zeile1 = mk('div', 'dv-tb-zeile1');
  var links = mk('div', 'dv-tb-links');
  links.appendChild(tx('div', 'dv-tb-titel', m.titel || 'Ohne Titel'));
  var sub = kompaktesLabel ? '' : (m.klasse || '');
  if (sub) links.appendChild(tx('div', 'dv-tb-sub', sub));

  var gp = dvGesamtpunkte(doc.blocks);
  if (kompaktesLabel) {
    // Klasse/Schuljahr/Datum/Bearbeitungszeit als 2×2-Raster unter dem
    // Titel; rechts bleibt frei für das Namensfeld (siehe unten).
    // Feste Position je Feld (grid-area in CSS) statt Reihenfolge im DOM –
    // sonst rutscht z.B. das Datum in die Schuljahr-Zelle, sobald kein
    // Schuljahr eingetragen ist (CSS-Grid-Auto-Placement füllt die Lücke).
    var grid = mk('div', 'dv-tb-datengrid');
    if (m.klasse) grid.appendChild(tx('div', 'dv-tb-meta-links dv-tb-meta-klasse', 'Klasse ' + m.klasse));
    if (m.schuljahr) grid.appendChild(tx('div', 'dv-tb-meta-links dv-tb-meta-schuljahr', 'Schuljahr ' + m.schuljahr));
    if (werte.datum) grid.appendChild(tx('div', 'dv-tb-meta-links dv-tb-meta-datum', 'Datum: ' + werte.datum));
    if (m.zeit) grid.appendChild(tx('div', 'dv-tb-meta-links dv-tb-meta-zeit', m.zeit + (/\D/.test(m.zeit) ? '' : ' Minuten')));
    if (grid.children.length) links.appendChild(grid);
  }
  zeile1.appendChild(links);

  var rechts = mk('div', 'dv-tb-rechts' + (kompaktesLabel ? ' dv-tb-rechts-geteilt' : ''));
  if (kompaktesLabel) {
    rechts.appendChild(tx('div', 'dv-tb-nf-label-kompakt', 'Nach-, Vorname:'));
    rechts.appendChild(mk('div', 'dv-tb-nf-kompakt-flaeche'));
  } else {
    if (werte.datum) rechts.appendChild(tx('div', 'dv-tb-meta', werte.datum));
    if (m.zeit) rechts.appendChild(tx('div', 'dv-tb-meta', 'Bearbeitungszeit: ' + m.zeit + (/\D/.test(m.zeit) ? '' : ' Minuten')));
    if (gp != null && v.aufgabe.punkte !== 'keine') {
      rechts.appendChild(tx('div', 'dv-tb-meta', 'Erreichbare Punkte: ' + dvZahl(gp)));
    }
  }
  zeile1.appendChild(rechts);
  box.appendChild(zeile1);

  // Große Seitenzahl gehört in den Titelkasten, nicht in eine eigene
  // Lücke davor – sonst bleibt Platz ungenutzt.
  if (v.seitenzahlGross && v.seitenzahlGross.zeigen && (v.seitenzahlGross.abSeite || 1) <= 1) {
    box.appendChild(tx('div', 'dv-sz-gross dv-sz-gross-imkasten', '1'));
  }

  if (!kompaktesLabel) {
    var nf = mk('div', 'dv-tb-namensfeld');
    nf.appendChild(tx('span', 'dv-tb-nf-label', 'Name:'));
    nf.appendChild(mk('span', 'dv-tb-nf-linie'));
    nf.appendChild(tx('span', 'dv-tb-nf-label', 'Punkte:'));
    nf.appendChild(mk('span', 'dv-tb-nf-kurz'));
    nf.appendChild(tx('span', 'dv-tb-nf-label', 'Note:'));
    nf.appendChild(mk('span', 'dv-tb-nf-kurz'));
    box.appendChild(nf);
  }
  tb.appendChild(box);

  if (v.titelblock.hinweistext || v.titelblock.vielErfolg) {
    var unten = mk('div', 'dv-tb-unten');
    if (v.titelblock.hinweistext) {
      var hinweis = mk('div', 'dv-tb-hinweis');
      hinweis.innerHTML = docInline(dvFuellen(v.titelblock.hinweistext, werte));
      unten.appendChild(hinweis);
    }
    if (v.titelblock.vielErfolg) {
      unten.appendChild(tx('div', 'dv-tb-schraeg', v.titelblock.vielErfolg));
    }
    tb.appendChild(unten);
  }

  return tb;
}

// ── Dokument → Titelblock (separat) + Array von Fluss-Elementen ──
// Der Titelblock wird NICHT mit in den Fluss gehängt: er soll über die
// volle Seitenbreite gehen, auch wenn die Punkte-Spalte den restlichen
// Inhalt schmaler macht. docPaginate() platziert ihn deshalb gesondert.
function docRender(doc, v) {
  var nodes = [];
  var gesamt = dvGesamtpunkte(doc.blocks);
  var hatAbschluss = false;
  doc.blocks.forEach(function (b) {
    if (b.t === 'abschluss') { b.gesamtpunkte = gesamt; hatAbschluss = true; }
    nodes.push(dvBlock(b, v));
  });
  // Abschlussseite ist – wie der Titelblock – ein Vorlagen-Schalter, kein
  // manuell einzufügender Baustein: automatisch anhängen, wenn die Vorlage
  // das vorsieht. Nur wenn nicht schon manuell im Dokument vorhanden
  // (::: abschluss :::, z.B. in älteren Dokumenten) – sonst doppelt.
  if (!hatAbschluss && v.abschluss && v.abschluss.zeigen) {
    nodes.push(dvBlock({ t: 'abschluss', kinder: [], gesamtpunkte: gesamt }, v));
  }
  return {
    titelblock: v.titelblock.zeigen ? dvTitelblock(doc, v) : null,
    nodes: nodes
  };
}
