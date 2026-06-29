// ── Nr-Parsing für natürliche Sortierung ─────────────────────────
// Gibt [zahl, buchstaben] zurück, versteht alle Formate:
//   "8a"  → [8,  "a"]    "10bc" → [10, "bc"]
//   "8"   → [8,  ""]     "a"    → [0,  "a"]   (Teilaufgabe ohne Elternnummer)
//   "B1"  → [1,  "b"]    "B"    → [0,  "b"]   (Beispiel-Nummerierung)
function parseNr(s) {
  s = String(s || '').trim().toLowerCase();
  var m;
  m = s.match(/^(\d+)([a-z]*)$/);   if (m) return [parseInt(m[1], 10), m[2]];
  m = s.match(/^([a-z]+)(\d+)$/);   if (m) return [parseInt(m[2], 10), m[1]];
  m = s.match(/^([a-z]+)$/);        if (m) return [0, m[1]];
  return [0, s];
}

function cmpNr(aNr, bNr) {
  var pa = parseNr(aNr), pb = parseNr(bNr);
  var nd = pa[0] - pb[0];
  if (nd !== 0) return nd;
  return pa[1] < pb[1] ? -1 : pa[1] > pb[1] ? 1 : 0;
}

// ── Aufgaben-Gruppierung ──────────────────────────────────────────
// Gruppiert Zeilen nach führender Nummer: "8a","8b" → Gruppe "8"; "9" → Gruppe "9"
function dbGroupByParent(rows) {
  var groups = {}, order = [];
  rows.forEach(function(r) {
    var _nr = String(r.nr || ''); var _m = _nr.match(/^(.*\d)[a-zA-Z]+$/);
    var parentNr = (_m ? _m[1] : _nr).trim() || '?';
    var isMat = r.quelle_typ === 'materialset' || r.quelle_typ === 'handreichung';
    // Materialset-Untereinträge (z.B. M 3a/M 3b) über verschiedene Seiten zusammenfassen
    // Ausnahme: Duplikate (gruppen_key 'dup_…') immer als eigene Gruppe behandeln
    var key = (_m && isMat && !(r.gruppen_key && /^dup_/.test(r.gruppen_key)))
      ? ((r.quelle_name || '') + '||' + (r.kapitel || '') + '||' + parentNr)
      : (r.gruppen_key || ((r.quelle_name || '') + '|' + (r.seite != null ? r.seite : '') + '|' + parentNr));
    if (!groups[key]) { groups[key] = { key: parentNr, gruppen_key: key, aufgabenstellung: null, items: [] }; order.push(key); }
    if (!groups[key].aufgabenstellung && r.aufgabenstellung) groups[key].aufgabenstellung = r.aufgabenstellung;
    groups[key].items.push(r);
  });
  return order.map(function(k) { return groups[k]; });
}

// ── Import-View ───────────────────────────────────────────────────

const IMP_KI_PROMPT = `Du analysierst eine Seite aus einem Schulbuch oder Unterrichtsmaterial (Gymnasium, Mathematik oder Naturwissenschaften).

Erfasse ALLE Inhalte der Seite: Aufgaben, Beispiele UND Lehrtexte.

VERBATIM-REGEL (gilt für ALLE Typen):
Gib jeden Text EXAKT so wieder, wie er im Buch steht — Wort für Wort, Zeichen für Zeichen. Kürze NICHTS, lasse NICHTS weg, formuliere NICHTS um. Auch kurze Sätze, Einschübe oder Fußnoten müssen vollständig erfasst werden.

WICHTIG — Aufgaben: Teilaufgaben immer einzeln erfassen:
Hat eine Aufgabe Teilaufgaben (a, b, c, d …) — egal ob als Absätze ODER als Spalten in einer Tabelle — erstelle für jede Teilaufgabe einen eigenen Eintrag mit nr "8a", "8b" usw. Nie eine Aufgabe mit Teilaufgaben als einzelnen Eintrag erfassen.

WICHTIG — Lehrtexte: Absätze als separate Einträge erfassen:
Hat ein Lehrtext mehrere klar getrennte Abschnitte (z.B. Einführung + Definition + Merksatz), erstelle für jeden Abschnitt einen eigenen Eintrag. Zusammengehörende Sätze desselben Abschnitts bleiben in einem Eintrag.

Für jeden Eintrag:
- inhaltstyp: genau eines von: aufgabe|lehrtext|lehrerkommentar
  · aufgabe         = Übungsaufgabe, die Schüler selbst lösen sollen
  · lehrtext        = Erklärung, Definition, Merksatz, Fließtext, Einführung, Musterrechnung mit Lösung
  · lehrerkommentar = Erläuterungen/Hinweise für die Lehrkraft (Hintergrundinformation, methodische Hinweise)
- nr: Aufgaben-/Beispielnummer inkl. Teilaufgabe (z.B. "8a", "B2") — bei Lehrtexten die Überschrift oder Typ (z.B. "Definition", "Merksatz", "1.1 Terme")
- aufgabenstellung: gemeinsamer Obersatz der Hauptaufgabe, VERBATIM — nur wenn er für alle Teilaufgaben gilt; bei Lehrtexten und Beispielen null
- text: der vollständige Text des Eintrags, VERBATIM und VOLLSTÄNDIG aus dem Buch. Zeilenumbrüche innerhalb des Textes durch " | " ersetzen. Bei Aufgaben NIEMALS aufgabenstellung wiederholen.
- anforderung: Ein Satz was Schüler konkret tun müssen — bei Lehrtexten null
- operator: genau eines von: berechnen|begründen|erklären|zeichnen|messen|konstruieren|beschreiben|vergleichen|ausfüllen|MC — bei Lehrtexten/Beispielen null
- umfang: genau eines von: kurz|mittel|lang — bei Lehrtexten null
- schwierigkeit: genau eines von: grundlegend|standard|anspruchsvoll — bei Lehrtexten null
- abbildung: Kurze Beschreibung einer Abbildung, die für das Verständnis der Aufgabe notwendig ist (z.B. „Koordinatensystem mit eingezeichnetem Dreieck ABC", „Foto einer rostenden Eisenbrücke"). Nur ausfüllen wenn die Abbildung inhaltlich relevant ist — nicht für rein dekorative Bilder, Cliparts oder Randgestaltung. Sonst null.

JSON-FORMAT — sehr wichtig:
- Antworte AUSSCHLIESSLICH mit rohem JSON, kein Markdown, keine Codeblöcke
- Alle Stringwerte einzeilig (keine Zeilenumbrüche — stattdessen " | " verwenden)
- Keine Anführungszeichen innerhalb von Stringwerten
- Keine LaTeX-Notation (schreibe z.B. "x^2" statt "\frac{x}{2}")
- Keine Backslashes in Stringwerten

{"aufgaben": [
  {"inhaltstyp":"lehrtext","nr":"Merksatz","aufgabenstellung":null,"text":"Der Flächeninhalt eines Rechtecks mit den Seiten a und b berechnet sich mit der Formel A = a · b. | Die Einheit des Flächeninhalts ist cm², m² oder mm².","anforderung":null,"operator":null,"umfang":null,"schwierigkeit":null,"abbildung":null},
  {"inhaltstyp":"aufgabe","nr":"8a","aufgabenstellung":"Berechne den Flächeninhalt der Figuren.","text":"Berechne den Flächeninhalt der Fig. 1.","anforderung":"Schüler berechnen den Flächeninhalt einer Figur.","operator":"berechnen","umfang":"kurz","schwierigkeit":"grundlegend","abbildung":"Koordinatensystem mit drei eingezeichneten Figuren, beschriftet mit Fig. 1, Fig. 2, Fig. 3"}
]}`;

// ── KI-Prompt für Materialsets / Handreichungen ───────────────────
const MAT_KI_PROMPT = `Du analysierst eine Seite aus einem Unterrichtsmaterialset oder einer Lehrerhandreichung (z.B. Raabe, Klett-Lehrerservice, eigenes Lehrermaterial).

GRUNDREGEL: Erfasse jede Seite als EINEN Eintrag.
AUSNAHME ABSCHNITTSWECHSEL: Wenn auf einer Seite zwei klar voneinander getrennte Abschnitte stehen — erkennbar an einer neuen, visuell abgesetzten Überschrift — erstelle ZWEI Einträge mit je eigenem nr, inhaltstyp und text. Beide Einträge beziehen sich auf dieselbe Seite.

WASSERZEICHEN UND KOPF-/FUSSZEILEN IGNORIEREN:
Ignoriere vollständig und erfasse NICHT im text-Feld: Verlagswebseiten (z.B. "www.meinunterricht.de"), Seitenzähler wie "1 von 22" oder "Seite 3 von 10", Copyright- und Download-Hinweise, Logos, Kopf- und Fußzeilen mit Verlagsangaben.

VERBATIM-REGEL: Gib alle Texte EXAKT so wieder wie sie auf der Seite stehen — Wort für Wort, ohne Kürzungen. Gilt für den eigentlichen Seiteninhalt (Kopf-/Fußzeilen und Wasserzeichen ausgenommen).

Für jeden Eintrag:
- inhaltstyp: genau eines von: arbeitsblatt|loesung|lehrerkommentar|lehrtext|lzk
  · arbeitsblatt    = Schülerarbeitsblatt mit Aufgaben zum Bearbeiten (Materialien M 1, M 2 … die Schülerinnen bearbeiten)
  · loesung         = Musterlösung, Erwartungshorizont, Lösungsblatt, Erläuterungen zu Materialien
  · lehrerkommentar = Seiten NUR für die Lehrkraft: Hintergrundinformation, Methodik/Didaktik, Kompetenzübersicht, Quellenangaben, Materialübersicht
  · lehrtext        = Informationstext oder Sachtext als Lesematerial für Schülerinnen ohne Aufgaben
  · lzk             = Lernzielkontrolle, Test, Quiz, Leistungsüberprüfung
  FAUSTREGEL: Bearbeiten Schülerinnen diese Seite zum Üben? → arbeitsblatt. Ist es eine Leistungsüberprüfung? → lzk. Enthält sie Lösungen/Erwartungen? → loesung. Ist sie nur für die Lehrkraft? → lehrerkommentar.

- nr: Bezeichnung der Seite VERBATIM aus dem Dokument.
  Raabe-Beispiele: "M 1", "M 2", "M 3", "Lösung M 1", "Lösung M 2", "Hintergrundinformation", "Hinweise zu Methodik und Didaktik", "Kompetenzübersicht", "Quellenangaben", "Materialübersicht"
  Falls keine Bezeichnung: Typ + laufende Nummer, z.B. "Arbeitsblatt 1", "Lehrerkommentar 1"

- aufgabenstellung: Überschrift oder Titel der Seite, VERBATIM — null wenn keine vorhanden

- text: VOLLSTÄNDIGER Seiteninhalt VERBATIM (Kopf-/Fußzeilen und Wasserzeichen ausgenommen).
  Absätze und Zeilenumbrüche durch " | " ersetzen.

- anforderung: Was Schülerinnen mit diesem Material tun (ein Satz, Präsens) — bei Lehrer-, Lösungs- und Bewertungsseiten null

- niveau: Differenzierungsstufe falls angegeben ("A", "B", "C", "Basis", "Standard", "Erweiterung") — sonst null

- schwierigkeit: grundlegend|standard|anspruchsvoll — wenn erkennbar, sonst null

- thema: Fachliches Kernthema dieser Seite, max. 5 Wörter (z.B. "Bruchrechnung", "Textaufgaben – Verhältnisse", "Korrosion – Grundlagen")

- abbildung: Kurze Beschreibung einer Abbildung, die für das Verständnis des Materials notwendig ist (z.B. „Foto einer rostenden Eisenbrücke", „Diagramm: Temperaturverlauf über 24h"). Nur ausfüllen wenn die Abbildung inhaltlich relevant ist — nicht für rein dekorative Bilder oder Randgestaltung. Sonst null.

JSON-FORMAT:
- Antworte AUSSCHLIESSLICH mit rohem JSON, kein Markdown, keine Codeblöcke
- Alle Stringwerte einzeilig (Zeilenumbrüche → " | ")
- Keine Anführungszeichen innerhalb von Stringwerten
- Keine Backslashes in Stringwerten

{"aufgaben": [
  {"inhaltstyp":"lehrerkommentar","nr":"Hintergrundinformation","aufgabenstellung":null,"text":"Korrosion bezeichnet die Reaktion eines metallischen Werkstoffs mit seiner Umgebung. | Im Meerwasser wird sie durch den hohen Salzgehalt beschleunigt, da gelöste Ionen die elektrische Leitfähigkeit erhöhen und galvanische Elemente entstehen können.","anforderung":null,"niveau":null,"schwierigkeit":null,"thema":"Korrosion – Grundlagen","abbildung":null},
  {"inhaltstyp":"arbeitsblatt","nr":"M 1","aufgabenstellung":"Korrosion im Meerwasser","text":"Schiffe werden im Meerwasser besonders stark von Korrosion befallen. | 1. Erkläre, warum Salzwasser die Korrosion beschleunigt. | 2. Nenne zwei Schutzmaßnahmen gegen Korrosion an Schiffshüllen.","anforderung":"Schülerinnen erklären Korrosionsvorgänge und nennen Schutzmaßnahmen.","niveau":null,"schwierigkeit":"standard","thema":"Korrosion im Meerwasser","abbildung":"Foto einer stark korrodierten Schiffshülle mit roten Rostflecken"},
  {"inhaltstyp":"loesung","nr":"Lösung M 1","aufgabenstellung":"Korrosion im Meerwasser – Erwartungshorizont","text":"1. Salzwasser leitet Strom, da Ionen als Ladungsträger wirken. Es bilden sich galvanische Elemente. | 2. Mögliche Schutzmaßnahmen: Schutzanstrich, kathodischer Korrosionsschutz (Opferanode).","anforderung":null,"niveau":null,"schwierigkeit":null,"thema":"Korrosion im Meerwasser","abbildung":null}
]}`;

// Welcher Prompt passt zum gewählten Quellentyp? contextNr = nr-Wert der vorherigen Seite (für Fortsetzungserkennung)
function impPromptFor(quellentyp, contextNr) {
  var base = (quellentyp === 'materialset' || quellentyp === 'handreichung') ? MAT_KI_PROMPT : IMP_KI_PROMPT;
  if (contextNr) {
    base += '\n\nKONTEXT VORHERIGE SEITE: "' + contextNr + '" — Falls diese Seite ohne neue Überschrift beginnt und offensichtlich eine Fortsetzung davon ist, verwende denselben nr-Wert.';
  }
  return base;
}

function _mergeKontinuierungen(aufgaben) {
  var merged = [];
  aufgaben.forEach(function(a) {
    var prev = merged.length ? merged[merged.length - 1] : null;
    if (prev && prev.nr === a.nr && prev.inhaltstyp === a.inhaltstyp) {
      prev.text = (prev.text || '') + (prev.text && a.text ? ' | ' : '') + (a.text || '');
      if (!prev.abbildung && a.abbildung) prev.abbildung = a.abbildung;
    } else {
      merged.push(Object.assign({}, a));
    }
  });
  return merged;
}

function _impResizeImg(dataUrl, maxW, q) {
  return new Promise(function(res, rej) {
    var img = new Image();
    img.onload = function() {
      var scale = img.width > maxW ? maxW / img.width : 1;
      var c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = rej; img.src = dataUrl;
  });
}

function buildImportView(container) {
  // ── Header ────────────────────────────────────────────────────
  var hdr = mk('div', 'c-hdr');
  var hLeft = mk('div', '');
  var backBtn = btn('← Übersicht', 'btn btn-ghost btn-sm');
  backBtn.onclick = function() { DB.view = 'landing'; dbRender(); };
  hLeft.appendChild(backBtn);
  hLeft.appendChild(tx('div', 'c-title', 'Material importieren'));
  hdr.appendChild(hLeft);
  container.appendChild(hdr);

  var wrap = mk('div', '');
  wrap.style.cssText = 'padding:0 28px 40px;max-width:860px;display:flex;flex-direction:column;gap:20px;';
  container.appendChild(wrap);

  // ── Hilfsfunktionen ───────────────────────────────────────────
  function row2() {
    var r = mk('div', ''); r.style.cssText = 'display:flex;gap:10px;';
    Array.from(arguments).forEach(function(e) { r.appendChild(e); }); return r;
  }
  function fg(label, el) {
    var g = mk('div', 'fg'); g.style.flex = '1';
    g.appendChild(tx('label', 'fl', label)); g.appendChild(el); return g;
  }
  function finp(ph, type) {
    var i = document.createElement('input'); i.className = 'finp';
    i.placeholder = ph; if (type) i.type = type; return i;
  }
  function fsel(opts) {
    var s = document.createElement('select'); s.className = 'finp';
    opts.forEach(function(o) {
      var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; s.appendChild(op);
    }); return s;
  }

  // ── Metadaten-Karte ───────────────────────────────────────────
  var metaCard = mk('div', '');
  metaCard.style.cssText = 'background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:12px;';
  var metaTitle = tx('div', '', 'Quelle');
  metaTitle.style.cssText = 'font-weight:600;font-size:13px;color:var(--tx2);';
  metaCard.appendChild(metaTitle);
  wrap.appendChild(metaCard);

  // Hidden selects — halten den Wert, werden im restlichen Code via .value gelesen
  var typSel  = fsel(HERKUNFT_OPTS); typSel.style.display = 'none';
  var fachSel = fsel(FAECHER.map(function(f) { return [f.key, f.icon + ' ' + f.label]; })); fachSel.style.display = 'none';
  var buchInp  = finp('z.B. Lambacher Schweizer 8');
  var jgInp    = finp('z.B. 7/8'); jgInp.style.maxWidth = '80px';
  var kapInp   = finp('Kapitel (optional)');
  var ukInp    = finp('Unterkapitel (optional)');
  var seiteInp = finp('z.B. 142', 'number'); seiteInp.style.maxWidth = '110px';

  // ── Quellentyp-Buttons ────────────────────────────────────────
  var typBtnRow = mk('div', '');
  typBtnRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
  var _typBtns = [];
  Object.keys(HERKUNFT).forEach(function(k) {
    var h = HERKUNFT[k];
    var b = mk('button', '');
    b.textContent = h.icon + ' ' + h.label;
    b.style.cssText = 'padding:5px 11px;border-radius:7px;border:1.5px solid var(--border);background:transparent;font-size:12.5px;cursor:pointer;transition:all .12s;white-space:nowrap;color:var(--tx2);';
    b.addEventListener('click', function() {
      typSel.value = k;
      typSel.dispatchEvent(new Event('change'));
    });
    typBtnRow.appendChild(b);
    _typBtns.push({ k: k, b: b, h: h });
  });
  function refreshTypBtns() {
    _typBtns.forEach(function(t) {
      var active = typSel.value === t.k;
      t.b.style.background   = active ? t.h.color + '20' : 'transparent';
      t.b.style.borderColor  = active ? t.h.color : 'var(--border)';
      t.b.style.color        = active ? t.h.color : 'var(--tx2)';
      t.b.style.fontWeight   = active ? '600' : '400';
    });
  }
  refreshTypBtns();
  typSel.addEventListener('change', refreshTypBtns);
  metaCard.appendChild(typBtnRow);

  // ── Modus-Hinweis ─────────────────────────────────────────────
  var modeHint = tx('div', '', '');
  modeHint.style.cssText = 'font-size:12px;color:var(--tx3);margin-top:-4px;';
  function updateModeHint() {
    var isMat = typSel.value === 'materialset' || typSel.value === 'handreichung';
    modeHint.textContent = isMat
      ? '📋 Materialset-Modus: jede Seite wird als ganzer Eintrag erfasst'
      : '📖 Schulbuch-Modus: Aufgaben und Lehrtexte werden einzeln erfasst';
  }
  updateModeHint();
  typSel.addEventListener('change', updateModeHint);
  metaCard.appendChild(modeHint);

  // ── Fach-Buttons (links) + Eingabefelder (rechts) ─────────────
  var bodyRow = mk('div', '');
  bodyRow.style.cssText = 'display:flex;gap:120px;align-items:flex-start;';

  var fachCol = mk('div', '');
  fachCol.style.cssText = 'display:flex;flex-direction:column;gap:14px;flex-shrink:0;margin-left:16px;margin-top:10px;';
  var _fachBtns = [];
  FAECHER.forEach(function(f) {
    var b = mk('button', '');
    b.title = f.label;
    b.textContent = f.icon;
    b.style.cssText = 'width:58px;height:58px;border-radius:10px;border:1.5px solid var(--border);background:transparent;font-size:28px;cursor:pointer;transition:all .12s;display:flex;align-items:center;justify-content:center;';
    b.addEventListener('click', function() {
      fachSel.value = f.key;
      fachSel.dispatchEvent(new Event('change'));
    });
    fachCol.appendChild(b);
    _fachBtns.push({ k: f.key, b: b, f: f });
  });
  function refreshFachBtns() {
    _fachBtns.forEach(function(t) {
      var active = fachSel.value === t.k;
      t.b.style.background  = active ? t.f.color + '30' : t.f.color + '18';
      t.b.style.borderColor = active ? t.f.color : t.f.color + '60';
      t.b.style.borderWidth = active ? '4px' : '1.5px';
      t.b.style.boxShadow   = active ? '0 0 0 3px ' + t.f.color : 'none';
      t.b.style.transform   = active ? 'scale(1.08)' : 'scale(1)';
    });
  }
  refreshFachBtns();
  fachSel.addEventListener('change', refreshFachBtns);
  bodyRow.appendChild(fachCol);

  var inputCol = mk('div', '');
  inputCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;flex:1;min-width:0;max-width:380px;';
  inputCol.appendChild(fg('Werk / Titel', buchInp));
  inputCol.appendChild(fg('Kapitel', kapInp));
  inputCol.appendChild(fg('Unterkapitel', ukInp));
  bodyRow.appendChild(inputCol);
  metaCard.appendChild(bodyRow);

  // ── Jahrgang + Erste Seite ────────────────────────────────────
  var jgRow = mk('div', ''); jgRow.style.cssText = 'display:flex;gap:10px;';
  var _jgFg = fg('Jahrgang', jgInp); _jgFg.style.flex = '0 0 auto';
  var _seiteFg = fg('Erste Seite', seiteInp); _seiteFg.style.flex = '0 0 auto';
  jgRow.appendChild(_jgFg); jgRow.appendChild(_seiteFg);
  metaCard.appendChild(jgRow);

  // Autocomplete
  attachAutocomplete(buchInp, function() { return suggestBooks(fachSel.value); });
  attachAutocomplete(kapInp, function() { return suggestKapitel(buchInp.value.trim()); });
  attachAutocomplete(ukInp,  function() { return suggestUnterkapitel(buchInp.value.trim(), kapInp.value.trim()); });

  buchInp.addEventListener('blur', function() {
    if (buchInp.value.trim()) {
      kapInp.dispatchEvent(new Event('input', { bubbles: true }));
      ukInp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  // ── Datei-Upload (rechts neben den Feldern) ───────────────────
  var fileCard = mk('div', '');
  fileCard.style.cssText = 'border:2px dashed var(--border);border-radius:12px;padding:16px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s;flex:1;align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-width:140px;';
  bodyRow.appendChild(fileCard);
  var fileLabel = tx('div', '', '📄 PDF oder Bild hierher ziehen — oder klicken');
  fileLabel.style.cssText = 'font-size:13px;color:var(--tx2);line-height:1.4;';
  fileCard.appendChild(fileLabel);
  var fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = '.pdf,image/*'; fileInput.style.display = 'none';
  fileCard.appendChild(fileInput);

  var _files = [];
  fileCard.onclick = function() { fileInput.click(); };
  fileCard.ondragover = function(e) { e.preventDefault(); fileCard.style.borderColor = 'var(--acc)'; };
  fileCard.ondragleave = function() { fileCard.style.borderColor = ''; };
  fileCard.ondrop = function(e) {
    e.preventDefault(); fileCard.style.borderColor = '';
    if (e.dataTransfer.files.length) setFiles(e.dataTransfer.files);
  };
  fileInput.multiple = true;
  fileInput.onchange = function() { if (fileInput.files.length) setFiles(fileInput.files); fileInput.value = ''; };
  function setFiles(fileList) {
    _files = Array.from(fileList);
    fileLabel.textContent = _files.length === 1
      ? '✓ ' + _files[0].name
      : '✓ ' + _files.length + ' Dateien ausgewählt (' + _files.map(function(f) { return f.name; }).join(', ') + ')';
    fileLabel.style.color = 'var(--acc)';
  }

  // ── Analyse-Button + Status ───────────────────────────────────
  var bottomRow = mk('div', ''); bottomRow.style.cssText = 'display:flex;align-items:center;gap:14px;flex-wrap:wrap;';
  var analyseBtn = btn('⚡ Seite analysieren', 'btn btn-pri');
  var statusEl = tx('div', '', ''); statusEl.style.cssText = 'font-size:13px;color:var(--tx2);';
  var skipLkLabel = mk('label', '');
  skipLkLabel.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--tx2);cursor:pointer;white-space:nowrap;margin-left:auto;';
  var skipLkChk = mk('input', ''); skipLkChk.type = 'checkbox';
  skipLkChk.addEventListener('change', function() { if (_aufgaben.length) renderResults(); });
  skipLkLabel.appendChild(skipLkChk);
  skipLkLabel.appendChild(document.createTextNode('Lehrerkommentare nicht importieren'));
  bottomRow.appendChild(analyseBtn);
  bottomRow.appendChild(statusEl);
  bottomRow.appendChild(skipLkLabel);
  metaCard.appendChild(bottomRow);

  // ── Ergebnis-Bereich ──────────────────────────────────────────
  var resultsWrap = mk('div', '');
  resultsWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
  wrap.appendChild(resultsWrap);

  var _aufgaben = [];
  var _lastSavedNr = null; // nr-Wert der zuletzt gespeicherten Seite — als Kontext für die nächste Analyse

  var IMP_BATCH_SIZE = 6; // max Seiten pro KI-Aufruf

  function parseKiJson(raw) {
    var cleaned = raw.trim().replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
    // Pre-fix: KI schreibt manchmal \" (Backslash + Quote) wo der String enden soll.
    // Entferne den Backslash vor "  wenn danach ein strukturelles Token folgt.
    cleaned = cleaned.replace(/\\"(?=[ \t\r\n]*[}\]])/g, '"');
    cleaned = cleaned.replace(/\\"(?=[ \t\r\n]*,[ \t\r\n]*"[a-z_][^"\n]*"[ \t]*:)/g, '"');
    // Rohe Anführungszeichen innerhalb von JSON-Strings escapen (KI nutzt sie für Betonung).
    // inValue: true wenn der letzte strukturelle Token ':' war → nächster String ist ein Wert,
    // kein Schlüssel. Damit wird "„Inco": text" im Wert korrekt als Text erkannt (nicht als
    // Schlüsselende), weil "key": nur strukturell ist wenn wir einen Schlüssel lesen.
    var out = ''; var qi = 0; var qn = cleaned.length;
    var inValue = false;
    while (qi < qn) {
      var qch = cleaned[qi];
      if (qch === ':') { out += qch; qi++; inValue = true; continue; }
      if (qch === '{' || qch === '[' || qch === '}' || qch === ']' || qch === ',') {
        out += qch; qi++; inValue = false; continue;
      }
      if (qch !== '"') { out += qch; qi++; continue; }
      out += '"'; qi++;
      var wasValue = inValue; inValue = false;
      while (qi < qn) {
        var qc = cleaned[qi];
        if (qc === '\\') { out += qc; qi++; if (qi < qn) { out += cleaned[qi]; qi++; } }
        else if (qc === '"') {
          var qj = qi + 1;
          while (qj < qn && (cleaned[qj] === ' ' || cleaned[qj] === '\t' || cleaned[qj] === '\r' || cleaned[qj] === '\n')) qj++;
          var qnxt = qj < qn ? cleaned[qj] : '';
          var isStructural = false;
          if (qnxt === '}' || qnxt === ']' || qj >= qn) {
            isStructural = true;
          } else if (qnxt === ':') {
            isStructural = !wasValue; // Schlüsselende nur wenn wir keinen Wert lesen
          } else if (qnxt === ',') {
            var qk = qj + 1;
            while (qk < qn && (cleaned[qk] === ' ' || cleaned[qk] === '\t' || cleaned[qk] === '\r' || cleaned[qk] === '\n')) qk++;
            var qnxt2 = qk < qn ? cleaned[qk] : '';
            if (qnxt2 === '"') {
              // Strukturell nur wenn nächster String ein JSON-Schlüssel ist (gefolgt von ':').
              var qm = qk + 1;
              while (qm < qn && cleaned[qm] !== '"') { if (cleaned[qm] === '\\') qm++; qm++; }
              var qm2 = qm + 1;
              while (qm2 < qn && (cleaned[qm2] === ' ' || cleaned[qm2] === '\t')) qm2++;
              isStructural = (qm < qn && cleaned[qm2] === ':');
            } else if (!wasValue) {
              // Innerhalb eines Schlüssel-Strings: strukturell vor JSON-Werten
              isStructural = (qnxt2 === '{' || qnxt2 === '[' ||
                (qnxt2 >= '0' && qnxt2 <= '9') || qnxt2 === '-' ||
                (qnxt2 === 't' && cleaned.slice(qk,qk+4) === 'true'  && !/[a-zA-Z]/.test(cleaned[qk+4]||'')) ||
                (qnxt2 === 'f' && cleaned.slice(qk,qk+5) === 'false' && !/[a-zA-Z]/.test(cleaned[qk+5]||'')) ||
                (qnxt2 === 'n' && cleaned.slice(qk,qk+4) === 'null'  && !/[a-zA-Z]/.test(cleaned[qk+4]||'')));
            }
            // wasValue === true + Buchstabe nach Komma → immer Anführungszeichen im Text, nie strukturell
          }
          if (isStructural) { out += '"'; qi++; break; }
          else { out += '\\"'; qi++; }
        } else { out += qc; qi++; }
      }
    }
    cleaned = out;
    cleaned = cleaned.replace(/"((?:[^"\\]|\\.)*)"/g, function(m, inner) {
      return '"' + inner.replace(/\n/g, '\\n').replace(/\r/g, '').replace(/\t/g, '\\t') + '"';
    });
    cleaned = cleaned.replace(/"",/g, '",')
                     .replace(/""\s*\n\s*"/g, '",\n  "')
                     .replace(/""\s*}/g, '"}')
                     .replace(/""\s*]/g, '"]');
    cleaned = cleaned.replace(/\\(?!["\\/bfnrtu0-9])/g, '\\\\');
    try { return robustJsonParsePr(cleaned); } catch(e) {}
    try { return JSON.parse(cleaned); } catch(e2) {
      var pos = parseInt((e2.message.match(/position (\d+)/i) || [])[1]) || 0;
      console.error('[Import] Parse-Fehler:', e2.message);
      console.error('[Import] Zeichen an Pos ' + pos + ':', JSON.stringify(cleaned.slice(Math.max(0,pos-40), pos+40)));
      throw new Error('KI-Antwort nicht lesbar — Zeichen an Pos ' + pos + ': ' + JSON.stringify(cleaned.slice(Math.max(0,pos-20), pos+20)));
    }
  }

  // ── KI-Analyse ────────────────────────────────────────────────
  async function analyseFile(f, fileSeite, prefix, contextNr) {
    statusEl.textContent = prefix + '⏳ Datei wird gelesen…';
    var imgs = await fileToDataURLs(f, { longEdge: 1568, quality: 0.88 });
    var resized = await Promise.all(imgs.map(function(u) { return _impResizeImg(u, 1200, 0.82); }));

    var allAufg = [];
    // Materialsets/Handreichungen: jede PDF-Seite einzeln → korrekte Seitennummer pro Seite.
    // Schulbücher: bis zu IMP_BATCH_SIZE Seiten pro KI-Aufruf (Schulbücher werden i.d.R. seitenweise hochgeladen).
    var isMat = typSel.value === 'materialset' || typSel.value === 'handreichung';
    var batchSize = isMat ? 1 : IMP_BATCH_SIZE;
    var totalBatches = Math.ceil(resized.length / batchSize);

    for (var bi = 0; bi < totalBatches; bi++) {
      var batch = resized.slice(bi * batchSize, (bi + 1) * batchSize);
      var batchLabel = totalBatches > 1
        ? prefix + '⏳ Seite ' + (bi + 1) + ' von ' + resized.length + '…'
        : prefix + '⏳ KI analysiert…';
      statusEl.textContent = batchLabel;

      var blocks = [];
      batch.forEach(function(r, i) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: r.split(',')[1] } });
        if (i < batch.length - 1) blocks.push({ type: 'text', text: '--- Nächste Seite ---' });
      });
      // Kontext nur für ersten Batch übergeben (erste Seite dieser Datei)
      blocks.push({ type: 'text', text: impPromptFor(typSel.value, bi === 0 ? contextNr : null) });

      var raw = await callKI(blocks, { maxTokens: 16000 });
      var parsed = parseKiJson(raw);
      var batchAufg = parsed.aufgaben || [];
      var batchSeite = fileSeite != null ? fileSeite + bi * batchSize : null;
      batchAufg.forEach(function(a) { a._seite = batchSeite; });
      allAufg = allAufg.concat(batchAufg);
    }

    return allAufg;
  }

  analyseBtn.onclick = async function() {
    if (!_files.length) { statusEl.textContent = '⚠️ Bitte zuerst eine Datei auswählen.'; return; }
    if (!buchInp.value.trim()) { statusEl.textContent = '⚠️ Bitte Werk / Titel eingeben.'; return; }
    analyseBtn.disabled = true;
    analyseBtn.textContent = _files.length > 1 ? '⏳ Analysiere ' + _files.length + ' Dateien…' : '⏳ Analysiere…';
    statusEl.textContent = ''; statusEl.style.color = 'var(--tx2)';
    resultsWrap.innerHTML = ''; _aufgaben = [];
    var baseSeite = seiteInp.value ? Number(seiteInp.value) : null;
    try {
      var contextNr = _lastSavedNr; // Kontext aus vorheriger gespeicherter Seite
      for (var fi = 0; fi < _files.length; fi++) {
        var prefix = _files.length > 1 ? '(' + (fi + 1) + '/' + _files.length + ') ' : '';
        var fileSeite = baseSeite != null ? baseSeite + fi : null;
        var aufg = await analyseFile(_files[fi], fileSeite, prefix, contextNr);
        if (aufg.length) contextNr = aufg[aufg.length - 1].nr || null; // für nächste Datei
        if (!aufg.length && _files.length === 1) {
          statusEl.textContent = '⚠️ Keine Einträge erkannt — bitte Bild prüfen.'; return;
        }
        _aufgaben = _aufgaben.concat(aufg);
      }
      if (!_aufgaben.length) { statusEl.textContent = '⚠️ Keine Einträge erkannt — bitte Bilder prüfen.'; return; }
      _aufgaben = _mergeKontinuierungen(_aufgaben);
      statusEl.textContent = '';
      renderResults();
    } catch(e) {
      statusEl.textContent = '❌ ' + e.message;
    } finally {
      analyseBtn.disabled = false; analyseBtn.textContent = '⚡ Seite analysieren';
    }
  };

  // ── Ergebnis rendern ──────────────────────────────────────────
  var TYP_CYCLE = ['aufgabe', 'lehrtext', 'arbeitsblatt', 'loesung', 'lehrerkommentar', 'lzk'];

  function buildAufgabeCard(a, indent, idx, mergeBtn) {
    var row = mk('div', '');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0 2px '
      + (indent ? '20px' : '4px') + ';';

    // Checkbox — Merge-Auswahl (unverändert)
    var cb = mk('input', '');
    cb.type = 'checkbox';
    cb.style.cssText = 'flex-shrink:0;cursor:pointer;accent-color:var(--pri);';
    cb.onclick = function(e) { e.stopPropagation(); };
    cb.onchange = function() {
      if (cb.checked) _impSelected.add(idx); else _impSelected.delete(idx);
      mergeBtn.style.display = _impSelected.size >= 2 ? '' : 'none';
    };
    row.appendChild(cb);

    // Editierbare Nr.
    var nrInp = mk('input', '');
    nrInp.type = 'text';
    nrInp.value = a.nr || '';
    nrInp.style.cssText = 'width:46px;font-weight:700;font-size:12px;color:var(--tx2);flex-shrink:0;'
      + 'border:none;border-bottom:1px solid transparent;background:transparent;padding:1px 2px;border-radius:0;';
    nrInp.title = 'Nr. bearbeiten';
    nrInp.addEventListener('focus', function() { nrInp.style.borderBottomColor = 'var(--pri)'; });
    nrInp.addEventListener('blur',  function() { nrInp.style.borderBottomColor = 'transparent'; a.nr = nrInp.value.trim(); });
    row.appendChild(nrInp);

    // Editierbarer Text (span → bei Klick textarea)
    var editField = indent ? 'text' : 'aufgabenstellung';
    var fullText = indent
      ? (a.text || '')
      : ([a.aufgabenstellung, a.text].filter(Boolean).join(' '));
    var textSpan = tx('span', '', fullText.slice(0, 140) + (fullText.length > 140 ? '…' : ''));
    textSpan.style.cssText = 'font-size:12px;color:var(--tx1);line-height:1.4;flex:1;min-width:0;cursor:text;';
    textSpan.title = 'Klicken zum Bearbeiten';
    textSpan.onclick = function() {
      var ta = document.createElement('textarea');
      ta.value = a[editField] || '';
      ta.style.cssText = 'font-size:12px;color:var(--tx1);flex:1;min-width:0;width:100%;'
        + 'border:1px solid var(--pri);border-radius:4px;padding:3px 5px;'
        + 'resize:vertical;min-height:36px;box-sizing:border-box;';
      ta.rows = 2;
      row.replaceChild(ta, textSpan);
      ta.focus(); ta.select();
      ta.addEventListener('blur', function() {
        a[editField] = ta.value.trim();
        var newFull = indent ? (a.text || '') : ([a.aufgabenstellung, a.text].filter(Boolean).join(' '));
        textSpan.textContent = newFull.slice(0, 140) + (newFull.length > 140 ? '…' : '');
        row.replaceChild(textSpan, ta);
      });
    };
    row.appendChild(textSpan);

    // ✕ — Eintrag aus Importliste entfernen
    var delBtn = mk('button', '');
    delBtn.textContent = '✕';
    delBtn.title = 'Aus Import entfernen';
    delBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:12px;padding:0 4px;'
      + 'color:var(--tx3);flex-shrink:0;line-height:1;opacity:.45;transition:opacity .1s,color .1s;';
    delBtn.onmouseover = function() { delBtn.style.opacity = '1'; delBtn.style.color = '#b91c1c'; };
    delBtn.onmouseout  = function() { delBtn.style.opacity = '.45'; delBtn.style.color = 'var(--tx3)'; };
    delBtn.onclick = function(e) {
      e.stopPropagation();
      _aufgaben = _aufgaben.filter(function(x) { return x !== a; });
      renderResults();
    };
    row.appendChild(delBtn);

    return row;
  }

  // Typ-Badge für Gruppe: zeigt aktuellen Typ, Klick → nächster Typ
  function mkTypBadge(groupItems, onUpdate) {
    var cur = groupItems[0].inhaltstyp || 'aufgabe';
    var badge = document.createElement('span');
    function render() {
      var c = TYP_FARBEN[cur] || '#64748b';
      badge.textContent = (TYP_ICONS[cur] ? TYP_ICONS[cur] + ' ' : '') + (TYP_LABELS[cur] || cur);
      badge.style.cssText = 'display:inline-block;font-size:10px;font-weight:700;padding:2px 9px;'
        + 'border-radius:20px;cursor:pointer;user-select:none;'
        + 'background:' + c + '18;color:' + c + ';border:1px solid ' + c + '38;'
        + 'text-transform:uppercase;letter-spacing:.06em;';
      badge.title = 'Typ ändern (klicken)';
    }
    render();
    badge.onclick = function(e) {
      e.stopPropagation();
      var idx = TYP_CYCLE.indexOf(cur);
      cur = TYP_CYCLE[(idx + 1) % TYP_CYCLE.length];
      groupItems.forEach(function(item) { item.inhaltstyp = cur; });
      render();
      if (onUpdate) onUpdate(cur);
    };
    return badge;
  }

  var _impSelected = new Set();

  function renderResults() {
    _impSelected.clear();
    resultsWrap.innerHTML = '';
    var _visibleAufgHdr = skipLkChk.checked
      ? _aufgaben.filter(function(a) { return a.inhaltstyp !== 'lehrerkommentar'; })
      : _aufgaben;
    var rHdr = mk('div', '');
    rHdr.style.cssText = 'display:flex;align-items:center;gap:8px;justify-content:space-between;padding:4px 0;';
    var rTitle = tx('div', '', _visibleAufgHdr.length + ' Einträge erkannt — bitte prüfen und speichern');
    rTitle.style.cssText = 'font-weight:600;font-size:14px;flex:1;';
    rHdr.appendChild(rTitle);

    var mergeBtn = btn('⊕ Zusammenführen', 'btn btn-sm');
    mergeBtn.style.display = 'none';
    mergeBtn.onclick = function() {
      if (_impSelected.size < 2) return;
      var indices = Array.from(_impSelected).sort(function(a,b){return a-b;});
      var first = _aufgaben[indices[0]];
      indices.slice(1).forEach(function(idx) {
        var other = _aufgaben[idx];
        first.text = (first.text || '') + (first.text && other.text ? ' | ' : '') + (other.text || '');
        if (!first.abbildung && other.abbildung) first.abbildung = other.abbildung;
      });
      // Zusammengeführte Einträge (außer dem ersten) entfernen
      _aufgaben = _aufgaben.filter(function(_, i) {
        return i === indices[0] || !_impSelected.has(i);
      });
      renderResults();
    };
    rHdr.appendChild(mergeBtn);

    var saveAllBtn = btn('✓ Alle ' + _visibleAufgHdr.length + ' speichern', 'btn btn-pri btn-sm');
    saveAllBtn.onclick = saveAll;
    rHdr.appendChild(saveAllBtn);
    resultsWrap.appendChild(rHdr);

    // Metadaten-Zusammenfassung: zeigt was tatsächlich gespeichert wird
    var metaSummary = mk('div', '');
    metaSummary.style.cssText = 'font-size:12px;color:var(--tx2);padding:4px 2px 8px;border-bottom:1px solid var(--border);margin-bottom:4px;';
    function metaRefresh() {
      var hMeta = HERKUNFT[typSel.value] || HERKUNFT.schulbuch;
      var parts = [
        (hMeta.icon + ' ' + hMeta.label),
        buchInp.value.trim() || '–',
      ];
      if (jgInp.value.trim()) parts.push('Jg. ' + jgInp.value.trim());
      if (fachSel.value) { var fi = fachInfo(fachSel.value); parts.push(fi.icon + ' ' + fi.label); }
      metaSummary.textContent = parts.join(' · ');
    }
    metaRefresh();
    typSel.addEventListener('change', metaRefresh);
    buchInp.addEventListener('input', metaRefresh);
    jgInp.addEventListener('input', metaRefresh);
    fachSel.addEventListener('change', metaRefresh);
    resultsWrap.appendChild(metaSummary);

    var groups = dbGroupByParent(_visibleAufgHdr);
    groups.forEach(function(g) {
      var hasSubtasks = g.items.length > 1 || (g.items.length === 1 && g.items[0].nr !== g.key);
      var groupWrap = mk('div', '');
      groupWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;padding:4px 0;';

      // Gruppenheader mit klickbarem Typ-Badge
      var groupHdr = mk('div', '');
      groupHdr.style.cssText = 'display:flex;align-items:center;gap:7px;padding:4px 4px 2px;';
      var typBadge = mkTypBadge(g.items, function(newTyp) {
        // Gruppenheader-Text ggf. aktualisieren — kein re-render nötig
      });
      groupHdr.appendChild(typBadge);
      var hdrText = tx('span', '', g.key + (g.aufgabenstellung ? ' · ' + g.aufgabenstellung.slice(0, 80) : ''));
      hdrText.style.cssText = 'font-weight:700;font-size:12px;color:var(--tx2);letter-spacing:.02em;';
      groupHdr.appendChild(hdrText);
      groupWrap.appendChild(groupHdr);

      g.items.forEach(function(a) {
        var idx = _aufgaben.indexOf(a);
        groupWrap.appendChild(buildAufgabeCard(a, hasSubtasks, idx, mergeBtn));
      });

      resultsWrap.appendChild(groupWrap);
    });
  }

  // ── Speichern ─────────────────────────────────────────────────
  async function saveAll() {
    var buch     = buchInp.value.trim();
    var herkunft = HERKUNFT[typSel.value] ? typSel.value : 'schulbuch';
    if ((HERKUNFT[herkunft] || {}).hasBuch && !buch) {
      statusEl.style.color = '#dc2626';
      statusEl.textContent = '⚠️ Bitte Werk / Titel eingeben.';
      buchInp.focus();
      return;
    }
    var fach     = fachSel.value;
    var jg       = normJahrgang(jgInp.value.trim()) || null;
    var kap      = kapInp.value.trim() || null;
    var uk       = ukInp.value.trim() || null;
    var baseSeite = seiteInp.value ? Number(seiteInp.value) : null;
    var ts       = Date.now();

    var _saveAufg = skipLkChk.checked
      ? _aufgaben.filter(function(a) { return a.inhaltstyp !== 'lehrerkommentar'; })
      : _aufgaben;
    var rows = _saveAufg.map(function(a, i) {
      var seite = a._seite !== undefined ? a._seite : baseSeite;
      var nr   = String(a.nr || (i + 1));
      var nrBase = nr.replace(/[a-zA-Z]+$/, '').trim() || nr;
      var gKey = buch && seite != null ? buch + '||' + seite + '||' + nrBase : 'db_' + ts + '_' + nrBase;
      return {
        id:           'db_' + ts + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
        fach:         fach,
        quelle_typ:   herkunft,
        quelle_name:  buch || null,
        kapitel:      kap,
        uk_titel:     uk,
        seite:        seite,
        nr:           nr,
        gruppen_key:  gKey,
        aufgabenstellung: a.aufgabenstellung || null,
        inhalt:       a.text || a.aufgabenstellung || null,
        anforderung:  a.anforderung || null,
        operator:     a.operator || null,
        niveau:       a.niveau || null,
        schwierigkeit: a.schwierigkeit || a.schwierigkeitsstufe || null,
        umfang:       a.umfang || null,
        jahrgang:     jg,
        thema:        a.thema || null,
        abbildung:    a.abbildung || null,
        inhaltstyp:   a.inhaltstyp || 'aufgabe',
      };
    });
    var lastSeite = rows.length ? rows[rows.length - 1].seite : baseSeite;

    var saveBtn = resultsWrap.querySelector('.btn-pri');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Speichert…'; }
    statusEl.style.color = 'var(--tx2)';

    try {
      await sbInsert('inhalte', rows);
      _buchCache = {}; // Cache leeren damit neues Buch im Filter erscheint
      if (rows.length) _lastSavedNr = rows[rows.length - 1].nr || null;
      _aufgaben = [];

      // ── Ende-Screen ───────────────────────────────────────────
      wrap.innerHTML = '';
      var done = mk('div', '');
      done.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:28px;padding:60px 20px;text-align:center;';

      var check = tx('div', '', '✓');
      check.style.cssText = 'font-size:48px;color:#16a34a;line-height:1;';
      done.appendChild(check);

      var msg = tx('div', '', rows.length + ' Aufgaben gespeichert');
      msg.style.cssText = 'font-size:22px;font-weight:700;color:var(--tx1);';
      done.appendChild(msg);

      var sub = tx('div', '', buch + (baseSeite ? ' · Seite ' + baseSeite + (rows.length && lastSeite !== baseSeite ? '–' + lastSeite : '') : ''));
      sub.style.cssText = 'font-size:14px;color:var(--tx2);margin-top:-16px;';
      done.appendChild(sub);

      var actions = mk('div', '');
      actions.style.cssText = 'display:flex;flex-direction:column;gap:10px;width:100%;max-width:360px;';

      function actionBtn(label, desc, onclick) {
        var b = mk('div', '');
        b.style.cssText = 'background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 18px;cursor:pointer;text-align:left;transition:background .15s;';
        b.onmouseenter = function() { b.style.background = 'var(--hover,#f1f5f9)'; };
        b.onmouseleave = function() { b.style.background = 'var(--card)'; };
        b.appendChild(tx('div', '', label)).style.cssText = 'font-weight:600;font-size:14px;';
        b.appendChild(tx('div', '', desc)).style.cssText = 'font-size:12px;color:var(--tx2);margin-top:2px;';
        b.onclick = onclick;
        return b;
      }

      actions.appendChild(actionBtn(
        '↑ Nächste Seite hochladen',
        'Gleiche Quelle · Seite ' + (lastSeite ? lastSeite + 1 : '?'),
        function() {
          seiteInp.value = lastSeite ? lastSeite + 1 : '';
          fileLabel.textContent = '📄 PDF oder Bild hierher ziehen — oder klicken zum Auswählen';
          fileLabel.style.color = 'var(--tx2)';
          _files = [];
          statusEl.textContent = ''; statusEl.style.color = 'var(--tx2)';
          wrap.innerHTML = '';
          // Formular-Elemente wieder einbauen (fileCard zurück in bodyRow, nicht auf wrap-Ebene)
          bodyRow.appendChild(fileCard);
          wrap.appendChild(metaCard);
          wrap.appendChild(bottomRow);
          wrap.appendChild(resultsWrap);
        }
      ));

      actions.appendChild(actionBtn(
        '→ Gespeicherte Einträge ansehen',
        fachInfo(fach).icon + ' ' + fachInfo(fach).label + ' · ' + buch,
        function() {
          DB.view = 'fach'; DB.fach = fach; DB.quelle_name = buch || null;
          DB.quelle_typ = herkunft; DB.suchtext = ''; DB.offset = 0;
          dbRender();
        }
      ));

      actions.appendChild(actionBtn(
        '✕ Neues Material importieren',
        'Andere Quelle, anderes Fach',
        function() { DB.view = 'import'; dbRender(); }
      ));

      done.appendChild(actions);
      wrap.appendChild(done);

    } catch(e) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '✓ Alle ' + rows.length + ' speichern'; }
      statusEl.textContent = '❌ Speichern fehlgeschlagen: ' + e.message;
      statusEl.style.color = '#dc2626';
    }
  }
}

function grpTypLabel(g) {
  return (g && g.key !== '?') ? g.key : '';
}

// ── Autocomplete-Dropdown für Eingabefelder ───────────────────────
// Hängt ein Custom-Dropdown an ein <input>-Element.
// fetchFn() → Promise<string[]>  (wird beim ersten Öffnen einmal aufgerufen)
function attachAutocomplete(inp, fetchFn) {
  var dropdown = null;
  var _timer   = null;
  var _fetchId = 0;
  var _active  = false; // zuverlässiger als document.activeElement

  function reposition() {
    if (!dropdown) return;
    var r = inp.getBoundingClientRect();
    // Sicherheit: falls Input noch nicht gerendert oder nicht sichtbar
    if (!r.width && !r.height) return;
    dropdown.style.left  = r.left + 'px';
    dropdown.style.top   = (r.bottom + 2) + 'px';
    dropdown.style.width = Math.max(r.width, 180) + 'px';
  }

  function showDropdown(allOpts, filter) {
    removeDropdown();
    var lower    = (filter || '').toLowerCase();
    var filtered = lower
      ? allOpts.filter(function(o) { return o.toLowerCase().includes(lower); })
      : allOpts;
    if (!filtered.length) return;

    dropdown = mk('div', '');
    dropdown.style.cssText = 'position:fixed;z-index:99999;'
      + 'background:#fff;color:#111;'
      + 'border:1px solid #ccc;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.22);'
      + 'max-height:220px;overflow-y:auto;font-family:inherit;';
    filtered.forEach(function(o) {
      var item = tx('div', '', o);
      item.style.cssText = 'padding:8px 13px;font-size:13px;cursor:pointer;'
        + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      item.onmouseenter = function() { item.style.background = '#f0fdf4'; };
      item.onmouseleave = function() { item.style.background = ''; };
      item.onmousedown  = function(e) {
        e.preventDefault();
        inp.value = o;
        inp.dispatchEvent(new Event('input',  { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        removeDropdown();
      };
      dropdown.appendChild(item);
    });
    document.body.appendChild(dropdown);
    reposition();
    window.addEventListener('scroll', reposition, { passive: true, capture: true });
  }

  function removeDropdown() {
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
      window.removeEventListener('scroll', reposition, { capture: true });
    }
  }

  function trigger(filter) {
    clearTimeout(_timer);
    _timer = setTimeout(function() {
      var id = ++_fetchId;
      fetchFn().then(function(opts) {
        if (id !== _fetchId) return;  // veralteter Fetch verwerfen
        if (_active) showDropdown(opts || [], filter);
      }).catch(function(err) {
        console.warn('[Autocomplete] Vorschläge konnten nicht geladen werden:', err);
        removeDropdown();
      });
    }, 80);
  }

  inp.removeAttribute('list');

  inp.addEventListener('focus', function() {
    _active = true;
    trigger(inp.value);
  });
  inp.addEventListener('click', function() {
    // erneuter Klick auf bereits fokussiertes Feld
    if (!dropdown) trigger(inp.value);
  });
  inp.addEventListener('input', function() {
    trigger(inp.value);
  });
  inp.addEventListener('blur', function() {
    _active = false;
    clearTimeout(_timer);
    setTimeout(removeDropdown, 200);
  });
  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { removeDropdown(); inp.blur(); }
    if (e.key === 'ArrowDown' && dropdown) {
      var first = dropdown.firstChild;
      if (first) { first.style.background = '#f0fdf4'; first.focus && first.focus(); }
    }
    if (e.key === 'Enter' && dropdown) {
      var active = dropdown.querySelector('[style*="f0fdf4"]');
      if (active) { active.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }
    }
  });
}

