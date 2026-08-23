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
  ['links', 'mitte', 'rechts'].forEach(function (pos) {
    var el = tx('div', 'dv-band-' + pos, '');
    el.setAttribute('data-tpl', cfg[pos] || '');
    band.appendChild(el);
  });
  return band;
}

// ── Block am Seitenende auftrennen ───────────────────────────────
// Schiebt so lange Kinder aus dem Block heraus, bis der Kopfteil auf
// die Seite passt. "minKinder" verhindert Schusterjungen: solange oben
// nicht genug stehen bleibt, wird lieber der ganze Block umbrochen.
// Gibt das Reststück mit wiederholtem Kopf zurück, oder null.
function dvAbschneiden(el, box, minKinder) {
  var body = el.querySelector('[data-splitbody]');
  var min = Math.max(1, minKinder || 1);
  if (!body || body.children.length <= min) return null;

  var verschoben = [];
  while (body.children.length > min && dvUeberlauf(box)) {
    var letztes = body.lastElementChild;
    body.removeChild(letztes);
    verschoben.unshift(letztes);
  }
  if (!verschoben.length || dvUeberlauf(box)) {
    verschoben.forEach(function (k) { body.appendChild(k); });
    return null;
  }

  var rest = el.cloneNode(false);
  // Punktwert nur auf dem ersten Fragment zeigen – sonst doppelt in der
  // Punkte-Spalte. Die Aufgabennummer bleibt erhalten (data-aufgabe-nr),
  // die wird für die Gesamtbox über alle Fragmente hinweg gebraucht.
  rest.removeAttribute('data-punkte');
  var hdr = el.firstElementChild;
  if (hdr && (hdr.classList.contains('dv-aufgabe-hdr') || hdr.classList.contains('dv-teil-hdr'))) {
    var kopie = hdr.cloneNode(true);
    var pk = kopie.querySelector('.dv-punkte-kasten, .dv-punkte-klammer');
    if (pk) pk.remove();
    var ti = kopie.querySelector('.dv-aufgabe-titel, .dv-teil-titel');
    if (ti) ti.remove();
    var lbl = kopie.querySelector('.dv-aufgabe-label, .dv-teil-marke');
    if (lbl && lbl.textContent.indexOf('(Fortsetzung)') < 0) lbl.textContent = lbl.textContent + ' (Fortsetzung)';
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
    var contentRect = content.getBoundingClientRect();

    // Nur "Blätter" der Punkte-Hierarchie zeigen: wenn eine Aufgabe UND ihre
    // Teile beide Punkte tragen, zählen die feineren Teile, nicht die Summe
    // der Aufgabe selbst (die steht ohnehin in der Gesamtbox).
    var zellen = Array.prototype.filter.call(content.querySelectorAll('[data-punkte]'), function (el) {
      return !el.querySelector('[data-punkte]');
    });
    zellen.forEach(function (el) {
      var r = el.getBoundingClientRect();
      var zelle = mk('div', 'dv-punkte-zelle');
      zelle.style.top = (r.top - contentRect.top) + 'px';
      zelle.style.height = Math.max(r.height, 1) + 'px';
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
    var contentRect = content.getBoundingClientRect();
    var elRect = f.el.getBoundingClientRect();
    var box = mk('div', 'dv-punkte-gesamt');
    box.style.top = (elRect.bottom - contentRect.top) + 'px';
    box.appendChild(tx('div', 'dv-punkte-gesamt-label', 'Aufgabe ' + nr));
    box.appendChild(tx('div', 'dv-punkte-gesamt-wert', '/' + dvZahl(summe)));
    spalte.appendChild(box);
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

    // Titelblock läuft über die VOLLE Breite (auch über die Punkte-
    // Spalte hinweg) und schiebt Inhalt + Punkte-Spalte erst darunter.
    if (nr === 1 && titelblock) {
      titelblock.style.position = 'absolute';
      titelblock.style.left = 'var(--dv-rand-l)';
      titelblock.style.right = 'var(--dv-rand-r)';
      titelblock.style.top = obenStart;
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
    if (v.seitenzahlGross && v.seitenzahlGross.zeigen && nr >= (v.seitenzahlGross.abSeite || 1)) {
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

    // 1) Auf dieser Seite trennen – nur wenn oben ein sinnvoller Rest bleibt
    var rest = dvAbschneiden(el, box, 2);
    if (rest) { queue.unshift(rest); continue; }

    // 2) Sonst den ganzen Block auf die nächste Seite umbrechen
    if (box.children.length > 1) {
      box.removeChild(el);
      neueSeite();
      box.appendChild(el);
      if (!dvUeberlauf(box)) continue;
    }

    // 3) Auch allein zu groß → jetzt notfalls überall trennen
    rest = dvAbschneiden(el, box, 1);
    if (rest) queue.unshift(rest);
  }

  // Leere letzte Seite entfernen
  var letzte = seiten[seiten.length - 1];
  if (seiten.length > 1 && letzte.querySelector('.dv-content').children.length === 0) {
    letzte.remove();
    seiten.pop();
  }

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
