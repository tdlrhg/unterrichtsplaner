// ── Seitenumbruch ────────────────────────────────────────────────
// Verteilt den Block-Fluss auf echte A4-Seiten. Misst dafür im
// tatsächlichen Seitenkasten – deshalb stimmt die Vorschau mit dem
// Druck überein (WYSIWYG). Aufgaben werden nur dann getrennt, wenn
// sie allein keine Seite füllen können.

function dvUeberlauf(box) {
  return box.scrollHeight > box.clientHeight + 1;
}

// ── Kopf-/Fußband ────────────────────────────────────────────────
function dvBand(art, cfg) {
  var band = mk('div', 'dv-band dv-band-' + art + (cfg.linie ? ' dv-band-linie' : ''));
  // Leere Spalten gar nicht erst anlegen – sonst beansprucht z.B. eine leere
  // "rechts"-Spalte trotzdem ihr flex:1 und drängt "links" auf ein Drittel
  // der Breite zusammen, obwohl der Platz ungenutzt bliebe.
  ['links', 'mitte', 'rechts'].forEach(function (pos) {
    if (!cfg[pos]) return;
    var el = tx('div', 'dv-band-' + pos, '');
    el.setAttribute('data-tpl', cfg[pos]);
    band.appendChild(el);
  });
  return band;
}

// Erkennt, ob ein (evtl. selbst wieder aufgetrenntes) Element nur noch aus
// Leerraum besteht (::: linien/platz/raster), ohne echten neuen Aufgaben-
// text – rekursiv, weil eine Teilaufgabe, die selbst schon aufgetrennt
// wurde, wieder nur ihren restBody mit reinem Leerraum enthalten kann.
function dvIstNurLeerraum(el) {
  if (el.classList && el.classList.contains('dv-raster')) return true;
  var body = el.querySelector && el.querySelector('[data-splitbody]');
  if (!body) return false;
  return Array.prototype.every.call(body.children, dvIstNurLeerraum);
}

// ── Block am Seitenende auftrennen ───────────────────────────────
// Schiebt so lange Kinder aus dem Block heraus, bis der Kopfteil auf die
// Seite passt. Trennt sobald nötig, auch wenn dadurch nur ein einzelnes
// Kind oben oder unten allein steht (keine Schusterjungen/Waisenkind-
// Mindestzahl). Gibt das Reststück mit wiederholtem Kopf zurück, oder null.
function dvAbschneiden(el, box) {
  var body = el.querySelector('[data-splitbody]');
  var min = 1;
  if (!body || !body.children.length) return null;

  var verschoben = [];
  while (body.children.length > min && dvUeberlauf(box)) {
    var letztes = body.lastElementChild;
    body.removeChild(letztes);
    verschoben.unshift(letztes);
  }

  // Reicht grobes Verschieben nicht (oder war gar nicht möglich, weil nur
  // 1 Kind da ist – z.B. eine Aufgabe mit nur einer Teilaufgabe): das
  // letzte verbliebene Kind selbst rekursiv auftrennen, falls es einen
  // eigenen [data-splitbody] hat (Text/Bild bleiben dann auf der Seite,
  // nur der überschüssige Rest – meist Leerraum – wandert weiter).
  if (dvUeberlauf(box) && body.lastElementChild) {
    var kandidat = body.lastElementChild;
    if (kandidat.querySelector && kandidat.querySelector('[data-splitbody]')) {
      var kindRest = dvAbschneiden(kandidat, box);
      if (kindRest) { kindRest.__kindRest = true; verschoben.unshift(kindRest); }
    }
  }

  if (!verschoben.length || dvUeberlauf(box)) {
    // Nur echte body-Kinder zurücklegen – ein kindRest-Fragment war nie
    // Kind von body (dessen Ursprung "kandidat" bleibt selbst im body und
    // wurde von seinem eigenen dvAbschneiden()-Aufruf bereits korrekt
    // gekürzt, dafür ist dort nichts zurückzulegen).
    verschoben.forEach(function (k) { if (!k.__kindRest) body.appendChild(k); });
    return null;
  }

  // Feinschliff: Das zuerst grob verschobene Kind (direkt am Seitenende)
  // hat selbst evtl. einen eigenen [data-splitbody] (z.B. eine Teilaufgabe
  // mit Text, Bild und Leerraum). Statt es komplett auf die nächste Seite
  // zu schieben, testweise zurückholen und selbst auftrennen – dann bleibt
  // z.B. Text+Bild auf der Seite und nur der überschüssige Leerraum wandert.
  // (Ein bereits rekursiv aufgetrenntes kindRest-Fragment hier zu übergehen
  // ist richtig: das steckt nicht mehr im body und wurde schon behandelt.)
  var erstes = verschoben[0];
  if (!erstes.__kindRest && erstes.querySelector && erstes.querySelector('[data-splitbody]')) {
    body.appendChild(erstes);
    var feinRest = dvAbschneiden(erstes, box);
    if (feinRest) verschoben[0] = feinRest;
    else body.removeChild(erstes);
  }

  var rest = el.cloneNode(false);
  // Punktwert nur auf dem LETZTEN Fragment zeigen – dort, wo die Aufgabe/
  // Teilaufgabe endgültig endet. Sonst doppelt in der Punkte-Spalte, und die
  // Zahl soll ans Ende des zugehörigen Inhalts wandern (kurz vor die
  // Gesamtbox), nicht mitten auf der Seite hängen bleiben, während der Rest
  // noch weiterläuft. Aufgabennummer bleibt in jedem Fall erhalten
  // (data-aufgabe-nr), die wird für die Gesamtbox über alle Fragmente
  // hinweg gebraucht.
  el.removeAttribute('data-punkte');

  // Nur Leerraum verschoben (::: linien/platz/raster), kein neuer Aufgaben-
  // text? Dann keinen wiederholten Kopf zeigen – der Leerraum läuft dann
  // kommentarlos weiter, ohne Marke/Titel/"(Fortsetzung)" erneut zu nennen.
  var nurLeerraum = verschoben.every(dvIstNurLeerraum);

  // Auf Aufgabe-Ebene nie einen wiederholten Kopf zeigen (kein "Aufgabe X
  // (Fortsetzung)") - trägt keine Information, die die Teilaufgaben-Marke
  // ("a) (Fortsetzung)") nicht schon liefert. Auf Teilaufgaben-Ebene bleibt
  // der Hinweis (dort ist er die einzige Orientierung, welcher Buchstabe
  // weiterläuft).
  var hdr = el.firstElementChild;
  var istTeilHdr = hdr && hdr.classList.contains('dv-teil-hdr');
  if (!nurLeerraum && istTeilHdr) {
    var kopie = hdr.cloneNode(true);
    var pk = kopie.querySelector('.dv-punkte-kasten, .dv-punkte-klammer');
    if (pk) pk.remove();
    var ti = kopie.querySelector('.dv-aufgabe-titel, .dv-teil-titel');
    if (ti) ti.remove();
    // Themen-Titel (bei aktivem titelUnten unter Label+Punkten) trägt keine
    // neue Information – nie wiederholen, egal was danach folgt.
    var tu = kopie.querySelector('.dv-aufgabe-titel-unten');
    if (tu) tu.remove();
    var lead = kopie.querySelector('.dv-teil-leader');
    if (lead) lead.remove();
    // Als eigenes Element anhängen statt in die Marke ("c)") hineinzuschreiben:
    // deren Spalte ist bei Teilaufgaben schmal auf den Buchstaben zugeschnitten
    // und würde den Hinweistext abschneiden bzw. umbrechen.
    var zeile = kopie.classList.contains('dv-teil-hdr') ? kopie : kopie.querySelector('.dv-aufgabe-kopfzeile');
    if (zeile && !zeile.querySelector('.dv-fortsetzung-hinweis')) {
      zeile.appendChild(tx('span', 'dv-fortsetzung-hinweis', '(Fortsetzung)'));
    }
    rest.appendChild(kopie);
  }
  var restBody = body.cloneNode(false);
  verschoben.forEach(function (k) { restBody.appendChild(k); });
  rest.appendChild(restBody);
  return rest;
}

// ── Punkte-Spalte füllen ─────────────────────────────────────────
// Läuft NACH der Seitenaufteilung über das fertige DOM: sucht pro Seite
// alle Elemente mit Punktwert (Teilaufgaben, oder Aufgaben ohne Teile)
// und setzt daneben eine Zelle in Höhe des jeweiligen Blocks. Wenn eine
// Aufgabe auf einer Seite endgültig fertig ist (kein späteres Fortsetzung-
// Fragment mehr), kommt zusätzlich eine Gesamtbox mit der Summe.
function dvPunkteSpalteFuellen(seiten, v, aufgabenSummen) {
  seiten.forEach(function (seite) {
    var spalte = seite.querySelector('.dv-punkte-spalte');
    var content = seite.querySelector('.dv-content');
    if (!spalte || !content) return;
    // offsetTop/offsetHeight statt getBoundingClientRect(): Letzteres liefert
    // bereits mit dem Seiten-Zoom (transform:scale) skalierte Werte – als
    // Inline-px erneut gesetzt, würde die Zoom-Skalierung der Seite das ein
    // zweites Mal anwenden und die Zelle bei jedem Zoom ≠ 100% verschieben.
    // offsetTop/-Height sind transform-unabhängige Layout-Werte, offsetParent
    // von [data-punkte]-Elementen ist .dv-content (position: absolute).
    var zellen = Array.prototype.filter.call(content.querySelectorAll('[data-punkte]'), function (el) {
      return !el.querySelector('[data-punkte]');
    });
    zellen.forEach(function (el) {
      var zelle = mk('div', 'dv-punkte-zelle');
      zelle.style.top = el.offsetTop + 'px';
      zelle.style.height = Math.max(el.offsetHeight, 1) + 'px';
      zelle.appendChild(tx('span', '', '/' + dvZahl(el.getAttribute('data-punkte'))));
      spalte.appendChild(zelle);
    });
  });

  if (!v.punkteSpalte.gesamtbox) return;

  // Letztes Fragment jeder Aufgabennummer über alle Seiten hinweg finden.
  var letztesFragment = {};
  seiten.forEach(function (seite) {
    seite.querySelectorAll('.dv-aufgabe[data-aufgabe-nr]').forEach(function (el) {
      letztesFragment[el.getAttribute('data-aufgabe-nr')] = { seite: seite, el: el };
    });
  });

  Object.keys(letztesFragment).forEach(function (nr) {
    var summe = aufgabenSummen[nr];
    if (summe == null) return;
    var f = letztesFragment[nr];
    var spalte = f.seite.querySelector('.dv-punkte-spalte');
    var content = f.seite.querySelector('.dv-content');
    if (!spalte || !content) return;
    var box = mk('div', 'dv-punkte-gesamt');
    var boxTop = f.el.offsetTop + f.el.offsetHeight;
    box.style.top = boxTop + 'px';
    box.appendChild(tx('div', 'dv-punkte-gesamt-label', 'Aufgabe ' + nr));
    box.appendChild(tx('div', 'dv-punkte-gesamt-wert', '/' + dvZahl(summe)));
    spalte.appendChild(box);

    // Falls im Hauptinhalt direkt danach schon der nächste Block beginnt
    // (z.B. die nächste Aufgabe), bevor die Gesamtbox in der Punkte-Spalte
    // fertig ist, dessen Abstand nach oben vergrößern – sonst wirkt es so,
    // als würde die nächste Aufgabe schon anfangen, während die Box der
    // vorherigen noch nicht zu Ende ist. Direkt auf den gewünschten
    // Gesamtabstand setzen (nicht addieren!): angrenzende vertikale Margins
    // kollabieren in CSS zum GRÖSSEREN der beiden statt sich zu summieren,
    // daher reicht max(bisheriger Abstand, Boxhöhe) als neuer marginTop.
    var naechstes = f.el.nextElementSibling;
    if (naechstes) {
      var bisherigerAbstand = naechstes.offsetTop - boxTop;
      var benoetigterAbstand = Math.max(bisherigerAbstand, box.offsetHeight + 4 * DV_PX_PRO_MM);
      if (benoetigterAbstand > bisherigerAbstand) naechstes.style.marginTop = benoetigterAbstand + 'px';
    }
  });
}

// ── Hauptfunktion ────────────────────────────────────────────────
function docPaginate(container, nodes, v, meta, aufgabenSummen, titelblock) {
  container.innerHTML = '';
  dvApplyVorlage(container, v);
  var punkteAn = !!(v.punkteSpalte && v.punkteSpalte.zeigen);

  var seiten = [];
  var box = null;

  function neueSeite() {
    var nr = seiten.length + 1;
    var seite = mk('div', 'dv-page');
    container.appendChild(seite); // sofort anhängen: offsetHeight-Messungen unten brauchen ein verbundenes Element
    if (v.seite.rahmen) seite.appendChild(mk('div', 'dv-seiten-rahmen'));
    var kopfDa = v.kopf.zeigen && nr >= (v.kopf.abSeite || 1);
    var fussDa = v.fuss.zeigen && nr >= (v.fuss.abSeite || 1);
    if (kopfDa) seite.appendChild(dvBand('kopf', v.kopf));
    var obenStart = kopfDa ? 'calc(var(--dv-rand-o) + var(--dv-kopf-h))' : 'var(--dv-rand-o)';

    // Wenn die große Seitenzahl in den Titelkasten eingebettet ist
    // (siehe dvTitelblock), braucht die Seite selbst keine eigene mehr.
    var szImTitelblock = nr === 1 && titelblock && v.seitenzahlGross && v.seitenzahlGross.zeigen && (v.seitenzahlGross.abSeite || 1) <= 1;

    // Titelblock läuft über die VOLLE Breite (auch über die Punkte-
    // Spalte hinweg) und schiebt Inhalt + Punkte-Spalte erst darunter.
    if (nr === 1 && titelblock) {
      titelblock.style.position = 'absolute';
      titelblock.style.left = 'var(--dv-titel-rand-l)';
      titelblock.style.right = 'var(--dv-titel-rand-r)';
      titelblock.style.top = v.seite.rahmen ? 'calc(var(--dv-rahmen-abstand) + 1mm)' : obenStart;
      seite.appendChild(titelblock);
      obenStart = (titelblock.offsetTop + titelblock.offsetHeight + 6 * DV_PX_PRO_MM) + 'px';
    }

    var content = mk('div', 'dv-content' + (v.seite.kaestchen ? ' dv-kaestchen' : ''));
    content.style.top = obenStart;
    content.style.bottom = fussDa ? 'calc(var(--dv-rand-u) + var(--dv-fuss-h))' : 'var(--dv-rand-u)';
    if (punkteAn) content.style.right = 'calc(var(--dv-rand-r) + var(--dv-punkte-breite))';
    seite.appendChild(content);
    if (punkteAn) {
      var spalte = mk('div', 'dv-punkte-spalte' + (v.punkteSpalte.trennlinie ? ' dv-punkte-trennlinie' : ''));
      spalte.style.top = content.style.top;
      spalte.style.bottom = content.style.bottom;
      seite.appendChild(spalte);
    }
    if (fussDa) seite.appendChild(dvBand('fuss', v.fuss));
    if (v.seitenzahlGross && v.seitenzahlGross.zeigen && nr >= (v.seitenzahlGross.abSeite || 1) && !szImTitelblock) {
      seite.appendChild(tx('div', 'dv-sz-gross', String(nr)));
    }
    seiten.push(seite);
    box = content;
  }

  neueSeite();

  var queue = nodes.slice();
  var schutz = 0;

  while (queue.length && schutz++ < 4000) {
    var el = queue.shift();

    if (el.classList && el.classList.contains('dv-brk')) {
      if (box.children.length) neueSeite();
      continue;
    }

    box.appendChild(el);
    if (!dvUeberlauf(box)) continue;

    // 1) Auf dieser Seite trennen, sobald nötig
    var rest = dvAbschneiden(el, box);
    if (rest) { queue.unshift(rest); continue; }

    // 2) Nicht trennbar (0-1 Kinder) → ganzen Block auf die nächste Seite
    if (box.children.length > 1) {
      box.removeChild(el);
      neueSeite();
      box.appendChild(el);
      if (!dvUeberlauf(box)) continue;
    }

    // 3) Auch allein zu groß → auf der neuen Seite trennen
    rest = dvAbschneiden(el, box);
    if (rest) queue.unshift(rest);
  }

  // Leere letzte Seite entfernen
  var letzte = seiten[seiten.length - 1];
  if (seiten.length > 1 && letzte.querySelector('.dv-content').children.length === 0) {
    letzte.remove();
    seiten.pop();
  }

  // Leerraum mit h=auto (::: platz/raster/kaestchen) bis zum unteren Rand
  // des Inhaltsbereichs strecken – dort ist er jetzt final platziert, also
  // steht fest, wie viel Platz bis zur Seite (bzw. bis zum Rahmen) noch
  // übrig ist. Nur der jeweils letzte Auto-Block einer Seite wird gestreckt,
  // das deckt den üblichen Fall (Leerraum als letztes Element) ab.
  seiten.forEach(function (seite) {
    var content = seite.querySelector('.dv-content');
    var autoBloecke = content.querySelectorAll('[data-auto-hoehe]');
    if (!autoBloecke.length) return;
    var letzterBlock = autoBloecke[autoBloecke.length - 1];
    var verfuegbar = content.clientHeight - letzterBlock.offsetTop;
    if (verfuegbar > letzterBlock.offsetHeight) letzterBlock.style.height = verfuegbar + 'px';
  });

  // Platzhalter inkl. Seitenzahlen füllen
  var basis = dvPlatzhalter(v, meta);
  seiten.forEach(function (s, idx) {
    var werte = Object.assign({}, basis, { seite: idx + 1, seiten: seiten.length });
    s.querySelectorAll('[data-tpl]').forEach(function (e) {
      e.textContent = dvFuellen(e.getAttribute('data-tpl'), werte);
    });
  });

  if (punkteAn) dvPunkteSpalteFuellen(seiten, v, aufgabenSummen || {});

  return seiten;
}
