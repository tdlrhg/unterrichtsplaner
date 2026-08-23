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
  var summe = 0, gefunden = false;
  if (aufgabe.punkte != null) { summe += aufgabe.punkte; gefunden = true; }
  (aufgabe.kinder || []).forEach(function (k) {
    if (k.t === 'teil' && k.punkte != null) { summe += k.punkte; gefunden = true; }
  });
  return gefunden ? summe : null;
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
function dvBlock(b, v) {
  if (b.t === 'p') {
    var p = mk('p', 'dv-p'); p.innerHTML = b.html; return p;
  }

  if (b.t === 'h') {
    var h = mk('div', 'dv-h' + b.level); h.innerHTML = b.html; return h;
  }

  if (b.t === 'liste') {
    var l = mk(b.ordered ? 'ol' : 'ul', 'dv-liste');
    b.items.forEach(function (it) { var li = mk('li', ''); li.innerHTML = it; l.appendChild(li); });
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
    b.zeilen.forEach(function (row) {
      var tr = mk('tr', '');
      row.forEach(function (c) { var e = mk('td', ''); e.innerHTML = c; tr.appendChild(e); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t);
    return wrap;
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
    var r = mk('div', 'dv-raster' + (b.gitter ? ' dv-raster-gitter' : ''));
    r.style.height = b.hoehe + 'mm';
    return r;
  }

  if (b.t === 'bild') {
    var bw = mk('div', 'dv-bild');
    var img = document.createElement('img');
    img.src = b.src; img.alt = b.alt || '';
    if (b.breite) img.style.width = b.breite + '%';
    bw.appendChild(img);
    if (b.alt) bw.appendChild(tx('div', 'dv-bild-bu', b.alt));
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
    if (tp) kopfz.appendChild(tp);
    te.appendChild(kopfz);
    var tbody2 = mk('div', 'dv-teil-body');
    tbody2.setAttribute('data-splitbody', '1');
    (b.kinder || []).forEach(function (k) { tbody2.appendChild(dvBlock(k, v)); });
    te.appendChild(tbody2);
    return te;
  }

  if (b.t === 'aufgabe') {
    var a = mk('section', 'dv-aufgabe' + (v.aufgabe.trennlinie ? ' dv-aufgabe-linie' : ''));
    var hdr = mk('div', 'dv-aufgabe-hdr');
    hdr.appendChild(tx('span', 'dv-aufgabe-label', dvFuellen(v.aufgabe.label, { nr: b.nr })));
    if (b.titel) { var at = mk('span', 'dv-aufgabe-titel'); at.innerHTML = docInline(b.titel); hdr.appendChild(at); }
    a.setAttribute('data-aufgabe-nr', b.nr);
    if (b.punkte != null) a.setAttribute('data-punkte', b.punkte);
    var ap = dvPunkteEl(b.punkte, v);
    if (ap) hdr.appendChild(ap);
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
  // Der umrandete/unterstrichene Kasten fasst NUR Titel+Meta+Namensfeld.
  // Hinweistext und schräger Zusatztext stehen außerhalb, offen auf der Seite.
  var box = mk('div', 'dv-titelblock-' + v.titelblock.variante);

  var kompaktesLabel = v.titelblock.namensfeld && v.titelblock.namensfeldStil === 'label';
  var werte = dvPlatzhalter(v, m);

  var zeile1 = mk('div', 'dv-tb-zeile1');
  var links = mk('div', 'dv-tb-links');
  links.appendChild(tx('div', 'dv-tb-titel', m.titel || 'Ohne Titel'));
  var sub = kompaktesLabel ? (m.fach || '') : [m.fach, m.klasse].filter(Boolean).join(' · ');
  if (sub) links.appendChild(tx('div', 'dv-tb-sub', sub));

  var gp = dvGesamtpunkte(doc.blocks);
  if (kompaktesLabel) {
    // Klasse/Schuljahr/Datum/Bearbeitungszeit als 2×2-Raster unter dem
    // Titel; rechts bleibt frei für das Namensfeld (siehe unten).
    var grid = mk('div', 'dv-tb-datengrid');
    if (m.klasse) grid.appendChild(tx('div', 'dv-tb-meta-links', 'Klasse ' + m.klasse));
    if (m.schuljahr) grid.appendChild(tx('div', 'dv-tb-meta-links dv-tb-meta-re', 'Schuljahr ' + m.schuljahr));
    if (werte.datum) grid.appendChild(tx('div', 'dv-tb-meta-links', 'Datum: ' + werte.datum));
    if (m.zeit) grid.appendChild(tx('div', 'dv-tb-meta-links dv-tb-meta-re', 'Bearbeitungszeit: ' + m.zeit + (/\D/.test(m.zeit) ? '' : ' Minuten')));
    if (grid.children.length) links.appendChild(grid);
    if (gp != null && v.aufgabe.punkte !== 'keine') {
      links.appendChild(tx('div', 'dv-tb-meta-links', 'Erreichbare Punkte: ' + dvZahl(gp)));
    }
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

  if (v.titelblock.namensfeld && !kompaktesLabel) {
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
  doc.blocks.forEach(function (b) { nodes.push(dvBlock(b, v)); });
  return {
    titelblock: v.titelblock.zeigen ? dvTitelblock(doc, v) : null,
    nodes: nodes
  };
}
