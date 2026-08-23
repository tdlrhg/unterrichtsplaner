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

// ── Hauptfunktion ────────────────────────────────────────────────
function docPaginate(container, nodes, v, meta) {
  container.innerHTML = '';
  dvApplyVorlage(container, v);

  var seiten = [];
  var box = null;

  function neueSeite() {
    var nr = seiten.length + 1;
    var seite = mk('div', 'dv-page');
    var kopfDa = v.kopf.zeigen && nr >= (v.kopf.abSeite || 1);
    var fussDa = v.fuss.zeigen && nr >= (v.fuss.abSeite || 1);
    if (kopfDa) seite.appendChild(dvBand('kopf', v.kopf));
    var content = mk('div', 'dv-content' + (v.seite.kaestchen ? ' dv-kaestchen' : ''));
    content.style.top = kopfDa ? 'calc(var(--dv-rand-o) + var(--dv-kopf-h))' : 'var(--dv-rand-o)';
    content.style.bottom = fussDa ? 'calc(var(--dv-rand-u) + var(--dv-fuss-h))' : 'var(--dv-rand-u)';
    seite.appendChild(content);
    if (fussDa) seite.appendChild(dvBand('fuss', v.fuss));
    container.appendChild(seite);
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

  return seiten;
}
