// ── Dokument-Parser ──────────────────────────────────────────────
// Markdown-Dialekt → Dokumentmodell (reines JSON, kein DOM).
// Der Parser kennt kein Design: er erkennt nur, WAS ein Block ist.
// Das Layout entscheidet allein die Vorlage (core/doc-vorlagen.js).

function docEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Inline-Auszeichnung ──────────────────────────────────────────
function docInline(s) {
  var h = docEsc(s);
  // Bruch: {Zähler/Nenner} → gestapelte Darstellung mit Bruchstrich (siehe
  // .dv-bruch in dokument.css). Vor den anderen Regeln, damit z.B. * in
  // Zähler/Nenner (kaum vorkommend) nicht versehentlich als Kursiv gilt.
  h = h.replace(/\{([^{}/\n]{1,12})\/([^{}/\n]{1,12})\}/g,
    '<span class="dv-bruch"><span class="dv-bruch-z">$1</span><span class="dv-bruch-n">$2</span></span>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  h = h.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');
  h = h.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  h = h.replace(/\s\\\\\s*$/, '<br>');
  h = h.replace(/_{3,}/g, '<span class="dv-luecke"></span>');
  return h;
}

// ── Punkteangabe am Zeilenende: [8P] (8 P) [2,5 BE] [4] ──────────
function docPunkte(text) {
  var m = String(text).match(/[\[(]\s*(\d+(?:[.,]\d+)?)\s*(?:P|BE|Pkt\.?|Punkte?)?\s*[\])]\s*$/i);
  if (!m) return { text: String(text).trim(), punkte: null };
  return {
    text: String(text).slice(0, m.index).trim().replace(/[–—:-]\s*$/, '').trim(),
    punkte: parseFloat(m[1].replace(',', '.'))
  };
}

// ── Optionen einer Fence-Zeile: ::: linien n=6 titel="Merke" ─────
function docOpts(rest) {
  var o = {};
  var re = /([\wäöü]+)\s*=\s*("([^"]*)"|'([^']*)'|[^\s]+)/g, m;
  while ((m = re.exec(rest))) o[m[1].toLowerCase()] = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[2]);
  return o;
}

// ── Hauptparser ──────────────────────────────────────────────────
function docParse(src) {
  var lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  var i = 0;
  var meta = {};
  var warnungen = [];

  // Front-Matter (--- key: value ---)
  if ((lines[0] || '').trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') {
      var fm = lines[i].match(/^\s*([\wäöüÄÖÜß.-]+)\s*:\s*(.*)$/);
      if (fm) meta[fm[1].toLowerCase()] = fm[2].trim();
      i++;
    }
    i++;
  }

  var wurzel = [];
  var stack = [wurzel];          // Ziel-Stack für verschachtelte Blöcke
  var aktAufgabe = null;
  var aktTeil = null;
  var aufgabeNr = 0;
  var teilNr = 0;

  // Aktuelle Quellzeile (1-indiziert), wird jede Schleifen-Iteration unten
  // aktualisiert – pushBlock() markiert damit jeden Block mit der Zeile
  // seines Beginns, für die Editor↔Vorschau-Synchronisation (dokument-app.js).
  var zeileAktuell = 0;
  function pushBlock(arr, obj) {
    if (obj && typeof obj === 'object' && obj.zeile == null) obj.zeile = zeileAktuell;
    arr.push(obj);
    return obj;
  }

  function ziel() { return stack[stack.length - 1]; }
  function zurueckAufWurzel() { stack = [wurzel]; aktAufgabe = null; aktTeil = null; }
  function zurueckAufAufgabe() {
    if (!aktAufgabe) { zurueckAufWurzel(); return; }
    stack = [wurzel, aktAufgabe.kinder];
    aktTeil = null;
  }

  for (; i < lines.length; i++) {
    var raw = lines[i];
    var line = raw.trim();
    zeileAktuell = i + 1;

    // Leerzeile
    if (!line) continue;

    // Kommentar
    if (line.indexOf('//') === 0) continue;

    // ── Fence-Ende ──
    if (line === ':::') {
      if (stack.length > 1 && stack[stack.length - 1].__fence) stack.pop();
      else if (stack.length > 1) stack.pop();
      continue;
    }

    // ── Fence-Start: ::: name opt=wert ──
    var fence = line.match(/^:::\s*([\wäöü]+)\s*(.*)$/i);
    if (fence) {
      var name = fence[1].toLowerCase();
      var opt = docOpts(fence[2]);

      if (name === 'linien' || name === 'zeilen') {
        pushBlock(ziel(), { t: 'linien', anzahl: parseInt(opt.n || opt.anzahl || fence[2].trim(), 10) || 5 });
        continue;
      }
      if (name === 'raster' || name === 'kaestchen' || name === 'zeichnung' || name === 'platz' || name === 'leerraum' || name === 'leerzeile' || name === 'leerzeilen') {
        // platz/leerraum/leerzeile(n)/zeichnung: reine Leerfläche ohne
        // eigenes Gitter – gedacht für Seiten mit Kästchenpapier-Hintergrund,
        // wo die Zeilen schon da sind und ein zweites Gitter nur stören würde.
        var ohneGitter = name !== 'raster' && name !== 'kaestchen';
        // h=auto: Höhe wird erst bei der Seitenaufteilung final bestimmt –
        // füllt automatisch bis zum unteren Rand der Seite, statt eine
        // feste mm-Zahl erraten zu müssen.
        var hoeheRoh = opt.h || opt.hoehe;
        var autoHoehe = hoeheRoh === 'auto';
        // Nicht "parseInt(x) || 60": die Zahl 0 ist falsy in JS, h=0 würde
        // sonst fälschlich zu 60 – stattdessen explizit auf NaN prüfen.
        var hoeheZahl = parseInt(hoeheRoh, 10);
        pushBlock(ziel(), { t: 'raster', hoehe: autoHoehe ? null : (isNaN(hoeheZahl) ? 60 : hoeheZahl), autoHoehe: autoHoehe, gitter: !ohneGitter });
        continue;
      }
      if (name === 'abschluss') {
        // Bewertungs-/Abschlussseite: Formfehler-Hinweis (Standardtext,
        // durch eigenen Inhalt zwischen ::: abschluss und ::: überschreibbar)
        // plus feste Punkte/Note/Datum/Signatur-Zeile, siehe doc-render.js.
        // Immer auf Dokumentebene, unabhängig davon in welcher Aufgabe/
        // Teilaufgabe der Fence-Start steht - sonst landet der Block als
        // Kind der zuletzt offenen Aufgabe statt in doc.blocks, und
        // docRender() findet ihn dort nicht für die Gesamtpunktzahl.
        zurueckAufWurzel();
        var abschluss = { t: 'abschluss', kinder: [] };
        pushBlock(ziel(), abschluss);
        abschluss.kinder.__fence = true;
        stack.push(abschluss.kinder);
        continue;
      }
      if (name === 'text' || name === 'absatz') {
        // Absatz mit demselben Einzug wie eine Teilaufgabe, aber ohne
        // Buchstabe/Punkte und ohne die Buchstaben-Zählung zu beeinflussen –
        // für Zusatztext, der zu einer Teilaufgabe gehört, aber selbst
        // keine eigene (bewertete) Teilaufgabe sein soll.
        var teiltext = { t: 'teiltext', kinder: [] };
        pushBlock(ziel(), teiltext);
        teiltext.kinder.__fence = true;
        stack.push(teiltext.kinder);
        continue;
      }
      if (name === 'kasten' || name === 'merke' || name === 'material' || name === 'hinweis' || name === 'loesung') {
        var kasten = { t: 'kasten', variante: name, titel: opt.titel || '', kinder: [] };
        pushBlock(ziel(), kasten);
        kasten.kinder.__fence = true;
        stack.push(kasten.kinder);
        continue;
      }
      warnungen.push('Zeile ' + (i + 1) + ': unbekannter Block ":::' + name + '"');
      continue;
    }

    // ── Seitenumbruch ──
    if (line === '+++' || /^\\(pagebreak|newpage)$/i.test(line)) {
      zurueckAufWurzel();
      pushBlock(wurzel, { t: 'brk' });
      continue;
    }

    // ── Trennlinie ──
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { pushBlock(ziel(), { t: 'hr' }); continue; }

    // ── Aufgabe (##) ──
    var h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      var p2 = docPunkte(h2[1]);
      var txt = p2.text;
      var nrM = txt.match(/^Aufgabe\s*(\d+)?\s*[:.–—-]?\s*/i);
      var nr = null;
      if (nrM) { nr = nrM[1] ? parseInt(nrM[1], 10) : null; txt = txt.slice(nrM[0].length).trim(); }
      aufgabeNr = nr != null ? nr : aufgabeNr + 1;
      teilNr = 0;
      zurueckAufWurzel();
      aktAufgabe = { t: 'aufgabe', nr: aufgabeNr, titel: txt, punkte: p2.punkte, kinder: [] };
      pushBlock(wurzel, aktAufgabe);
      stack = [wurzel, aktAufgabe.kinder];
      continue;
    }

    // ── Teilaufgabe (###) ──
    var h3 = line.match(/^###\s+(.*)$/);
    if (h3) {
      var p3 = docPunkte(h3[1]);
      var t3 = p3.text;
      var lm = t3.match(/^([a-z])\s*[).:]\s*/i);
      if (lm) { teilNr = lm[1].toLowerCase().charCodeAt(0) - 96; t3 = t3.slice(lm[0].length).trim(); }
      else teilNr++;
      zurueckAufAufgabe();
      aktTeil = { t: 'teil', marke: String.fromCharCode(96 + Math.max(1, teilNr)) + ')', titel: t3, punkte: p3.punkte, kinder: [] };
      pushBlock(ziel(), aktTeil);
      stack.push(aktTeil.kinder);
      continue;
    }

    // ── Dokumenttitel (#) ──
    var h1 = line.match(/^#\s+(.*)$/);
    if (h1) {
      if (!meta.titel) meta.titel = h1[1].trim();
      else { zurueckAufWurzel(); pushBlock(wurzel, { t: 'h', level: 1, html: docInline(h1[1]) }); }
      continue;
    }

    // ── Meta-Kurzform: :: schluessel: wert ──
    var mk2 = line.match(/^::\s*([\wäöüÄÖÜß.-]+)\s*:\s*(.*)$/);
    if (mk2) { meta[mk2[1].toLowerCase()] = mk2[2].trim(); continue; }

    // ── Bild: ![Alt](src), optional Breite und/oder Ausrichtung:
    // ![Alt](src 60%) · ![Alt](src links) · ![Alt](src 60% rechts) ──
    // Gleiches Muster als DV_BILD_MUSTER in dokument-app.js (Bilder-Panel) –
    // bei Änderung hier bitte dort mitziehen.
    var img = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+(\d+)%)?(?:\s+(links|mitte|rechts))?\)$/);
    if (img) {
      pushBlock(ziel(), {
        t: 'bild', alt: img[1], src: img[2],
        breite: img[3] ? parseInt(img[3], 10) : null,
        ausrichtung: img[4] || null
      });
      continue;
    }

    // ── Tabelle ──
    if (line.indexOf('|') === 0 || /\|.*\|/.test(line) && lines[i + 1] && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1])) {
      var tRows = [];
      while (i < lines.length && lines[i].trim().indexOf('|') === 0) { tRows.push(lines[i].trim()); i++; }
      i--;
      if (tRows.length) {
        var zellen = tRows.map(function (r) {
          return r.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
        });
        var kopf = null;
        if (zellen[1] && zellen[1].every(function (c) { return /^:?-{2,}:?$/.test(c); })) { kopf = zellen[0]; zellen.splice(0, 2); }
        pushBlock(ziel(), {
          t: 'tabelle',
          kopf: kopf ? kopf.map(docInline) : null,
          zeilen: zellen.map(function (r) { return r.map(docInline); })
        });
        continue;
      }
    }

    // ── Zitat / Merkkasten (>) ──
    if (line.indexOf('>') === 0) {
      var qz = [];
      while (i < lines.length && lines[i].trim().indexOf('>') === 0) { qz.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
      i--;
      pushBlock(ziel(), { t: 'kasten', variante: 'merke', titel: '', kinder: [{ t: 'p', html: docInline(qz.join(' ')) }] });
      continue;
    }

    // ── Liste (auch Ankreuzoptionen: - [ ] Text / - [x] Text) ──
    if (/^([-*+]|\d+[.)])\s+/.test(line)) {
      var ordered = /^\d/.test(line);
      var items = [];
      var mc = false;
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        var roh = lines[i].trim().replace(/^([-*+]|\d+[.)])\s+/, '');
        var mcM = roh.match(/^\[([ xX])\]\s+(.*)$/);
        if (mcM) { mc = true; items.push({ text: docInline(mcM[2]), angekreuzt: /x/i.test(mcM[1]) }); }
        else items.push({ text: docInline(roh), angekreuzt: false });
        i++;
      }
      i--;
      pushBlock(ziel(), { t: 'liste', ordered: ordered, items: items, mc: mc });
      continue;
    }

    // ── Absatz (Folgezeilen anhängen) ──
    var abs = [line];
    while (i + 1 < lines.length) {
      var nx = lines[i + 1].trim();
      if (!nx || /^(#|##|###|:::|::|>|\+\+\+|!\[|\||[-*+]\s|\d+[.)]\s)/.test(nx) || /^(-{3,}|_{3,})$/.test(nx)) break;
      abs.push(nx); i++;
    }
    pushBlock(ziel(), { t: 'p', html: docInline(abs.join(' ')) });
  }

  return { meta: meta, blocks: wurzel, warnungen: warnungen };
}
