// ── Vorlagen-Editor ──────────────────────────────────────────────
// Formularfelder → Vorlagen-JSON → Live-Vorschau rechts.
// Kein Feld kennt CSS: jedes schreibt nur einen Wert in die Vorlage,
// den Rest erledigt dvApplyVorlage() in core/doc-vorlagen.js.

var DV_SCHRIFTEN = [
  ["'Plus Jakarta Sans', 'Segoe UI', sans-serif", 'Plus Jakarta Sans (App-Schrift)'],
  ["Arial, Helvetica, sans-serif", 'Arial'],
  ["'Helvetica Neue', Helvetica, Arial, sans-serif", 'Helvetica'],
  ["Verdana, Geneva, sans-serif", 'Verdana (breit, gut lesbar)'],
  ["Georgia, 'Times New Roman', serif", 'Georgia (Serife)'],
  ["'Times New Roman', Times, serif", 'Times New Roman (Serife)'],
  ["'Courier New', Courier, monospace", 'Courier New (Schreibmaschine)']
];

// ── Feldbeschreibung ─────────────────────────────────────────────
var DV_FELDER = [
  { gruppe: 'Seite' },
  { pfad: 'seite.format', label: 'Format', typ: 'select', optionen: [['A4', 'A4 hoch'], ['A4quer', 'A4 quer'], ['A5', 'A5']] },
  { pfad: 'seite.rand.oben',   label: 'Rand oben',   typ: 'zahl', min: 5, max: 60, schritt: 1, einheit: 'mm', halb: true },
  { pfad: 'seite.rand.unten',  label: 'Rand unten',  typ: 'zahl', min: 5, max: 60, schritt: 1, einheit: 'mm', halb: true },
  { pfad: 'seite.rand.links',  label: 'Rand links',  typ: 'zahl', min: 5, max: 60, schritt: 1, einheit: 'mm', halb: true },
  { pfad: 'seite.rand.rechts', label: 'Rand rechts', typ: 'zahl', min: 5, max: 60, schritt: 1, einheit: 'mm', halb: true },
  { pfad: 'seite.kaestchen',       label: 'Kästchenpapier als Hintergrund', typ: 'check', halb: true },
  { pfad: 'seite.kaestchenGroesse', label: 'Kästchengröße', typ: 'zahl', min: 2, max: 15, schritt: 0.5, einheit: 'mm', halb: true },

  { gruppe: 'Schrift' },
  { pfad: 'typo.font', label: 'Schriftart', typ: 'select', optionen: DV_SCHRIFTEN },
  { pfad: 'typo.groesse',       label: 'Schriftgröße',  typ: 'zahl', min: 7, max: 20, schritt: 0.5, einheit: 'pt', halb: true },
  { pfad: 'typo.zeilenabstand', label: 'Zeilenabstand', typ: 'zahl', min: 1, max: 2.5, schritt: 0.05, einheit: '×', halb: true },
  { pfad: 'typo.absatzabstand', label: 'Absatzabstand', typ: 'zahl', min: 0, max: 12, schritt: 0.2, einheit: 'mm', halb: true },
  { pfad: 'typo.ausrichtung',   label: 'Ausrichtung',   typ: 'select', halb: true, optionen: [['left', 'Linksbündig'], ['justify', 'Blocksatz']] },

  { gruppe: 'Titelblock' },
  { pfad: 'titelblock.zeigen',     label: 'Titelblock anzeigen', typ: 'check' },
  { pfad: 'titelblock.variante',   label: 'Darstellung', typ: 'select', optionen: [['kasten', 'Umrandeter Kasten'], ['linie', 'Nur Trennlinie']] },
  { pfad: 'titelblock.namensfeld', label: 'Zeile für Name / Punkte / Note', typ: 'check' },

  { gruppe: 'Kopfzeile', hinweis: 'Platzhalter: {{titel}} {{fach}} {{klasse}} {{datum}} {{zeit}} {{seite}} {{seiten}}' },
  { pfad: 'kopf.zeigen',  label: 'Kopfzeile anzeigen', typ: 'check', halb: true },
  { pfad: 'kopf.abSeite', label: 'Erst ab Seite',      typ: 'zahl', min: 1, max: 9, schritt: 1, einheit: '', halb: true },
  { pfad: 'kopf.links',   label: 'Links',  typ: 'text' },
  { pfad: 'kopf.mitte',   label: 'Mitte',  typ: 'text' },
  { pfad: 'kopf.rechts',  label: 'Rechts', typ: 'text' },
  { pfad: 'kopf.linie',   label: 'Trennlinie darunter', typ: 'check' },

  { gruppe: 'Fußzeile' },
  { pfad: 'fuss.zeigen',  label: 'Fußzeile anzeigen', typ: 'check', halb: true },
  { pfad: 'fuss.abSeite', label: 'Erst ab Seite',     typ: 'zahl', min: 1, max: 9, schritt: 1, einheit: '', halb: true },
  { pfad: 'fuss.links',   label: 'Links',  typ: 'text' },
  { pfad: 'fuss.mitte',   label: 'Mitte',  typ: 'text' },
  { pfad: 'fuss.rechts',  label: 'Rechts', typ: 'text' },
  { pfad: 'fuss.linie',   label: 'Trennlinie darüber', typ: 'check' },

  { gruppe: 'Aufgaben', hinweis: 'Platzhalter in der Beschriftung: {{nr}}' },
  { pfad: 'aufgabe.label',      label: 'Beschriftung', typ: 'text' },
  { pfad: 'aufgabe.punkte',     label: 'Punkte', typ: 'select', optionen: [['kasten', 'Kästchen zum Eintragen'], ['klammer', 'Zahl in Klammern'], ['keine', 'Nicht anzeigen']] },
  { pfad: 'aufgabe.abstand',    label: 'Abstand danach', typ: 'zahl', min: 0, max: 30, schritt: 0.5, einheit: 'mm', halb: true },
  { pfad: 'aufgabe.farbe',      label: 'Akzentfarbe',    typ: 'farbe', halb: true },
  { pfad: 'aufgabe.trennlinie', label: 'Trennlinie vor jeder Aufgabe', typ: 'check' },

  { gruppe: 'Teilaufgaben', hinweis: 'Platzhalter in der Marke: {{marke}} (a, b, c …)' },
  { pfad: 'teil.marke',  label: 'Marke',  typ: 'text', halb: true },
  { pfad: 'teil.einzug', label: 'Einzug', typ: 'zahl', min: 0, max: 30, schritt: 1, einheit: 'mm', halb: true },

  { gruppe: 'Kästen', hinweis: 'Betrifft ::: merke, ::: hinweis, ::: material, ::: loesung' },
  { pfad: 'kasten.rahmen',   label: 'Rahmen', typ: 'check', halb: true },
  { pfad: 'kasten.fuellung', label: 'Füllfarbe', typ: 'farbe', halb: true },

  { gruppe: 'Punkte-Spalte', hinweis: 'Durchlaufende Spalte am rechten Rand statt Punkte im Text' },
  { pfad: 'punkteSpalte.zeigen',     label: 'Punkte-Spalte anzeigen', typ: 'check', halb: true },
  { pfad: 'punkteSpalte.breite',     label: 'Breite',                typ: 'zahl', min: 10, max: 40, schritt: 1, einheit: 'mm', halb: true },
  { pfad: 'punkteSpalte.trennlinie', label: 'Trennlinie',            typ: 'check', halb: true },
  { pfad: 'punkteSpalte.gesamtbox',  label: 'Summen-Kasten je Aufgabe', typ: 'check', halb: true }
];

// ── Formular-Bausteine ───────────────────────────────────────────
function dvFeldHuelle(label, inpEl, halb) {
  var fg = mk('div', 'dv-fg' + (halb ? ' halb' : ''));
  if (label) fg.appendChild(tx('label', 'fl', label));
  fg.appendChild(inpEl);
  return fg;
}

function dvBauFeld(feld, v, gesperrt) {
  var wert = dvHole(v, feld.pfad);

  if (feld.typ === 'check') {
    var lbl = mk('label', 'dv-check');
    var cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!wert; cb.disabled = gesperrt;
    cb.onchange = function () { dvFeldGeaendert(feld.pfad, cb.checked); };
    lbl.appendChild(cb);
    lbl.appendChild(tx('span', '', feld.label));
    var fg = mk('div', 'dv-fg' + (feld.halb ? ' halb' : ''));
    fg.appendChild(lbl);
    return fg;
  }

  if (feld.typ === 'select') {
    var sel = document.createElement('select');
    sel.className = 'finp'; sel.disabled = gesperrt;
    feld.optionen.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      if (o[0] === wert) op.selected = true;
      sel.appendChild(op);
    });
    sel.onchange = function () { dvFeldGeaendert(feld.pfad, sel.value); };
    return dvFeldHuelle(feld.label, sel, feld.halb);
  }

  if (feld.typ === 'zahl') {
    var wrap = mk('div', 'dv-zahl-wrap');
    var inp = document.createElement('input');
    inp.type = 'number'; inp.className = 'finp';
    inp.value = wert; inp.min = feld.min; inp.max = feld.max; inp.step = feld.schritt;
    inp.disabled = gesperrt;
    inp.oninput = function () {
      var z = parseFloat(inp.value);
      if (isNaN(z)) return;
      dvFeldGeaendert(feld.pfad, Math.min(feld.max, Math.max(feld.min, z)));
    };
    wrap.appendChild(inp);
    if (feld.einheit) wrap.appendChild(tx('span', 'dv-einheit', feld.einheit));
    return dvFeldHuelle(feld.label, wrap, feld.halb);
  }

  if (feld.typ === 'farbe') {
    var fwrap = mk('div', 'dv-zahl-wrap');
    var ci = document.createElement('input');
    ci.type = 'color'; ci.className = 'dv-farbe'; ci.value = wert || '#000000';
    ci.disabled = gesperrt;
    ci.oninput = function () { dvFeldGeaendert(feld.pfad, ci.value); };
    var ct = document.createElement('input');
    ct.type = 'text'; ct.className = 'finp'; ct.value = wert || '';
    ct.disabled = gesperrt;
    ct.oninput = function () {
      if (/^#[0-9a-f]{6}$/i.test(ct.value)) { ci.value = ct.value; dvFeldGeaendert(feld.pfad, ct.value); }
    };
    fwrap.appendChild(ci); fwrap.appendChild(ct);
    return dvFeldHuelle(feld.label, fwrap, feld.halb);
  }

  // Text
  var ti = document.createElement('input');
  ti.type = 'text'; ti.className = 'finp'; ti.value = wert == null ? '' : wert;
  ti.disabled = gesperrt;
  ti.oninput = function () { dvFeldGeaendert(feld.pfad, ti.value); };
  return dvFeldHuelle(feld.label, ti, feld.halb);
}

// ── Änderung eines Feldes ────────────────────────────────────────
var _dvFormTimer = null;
function dvFeldGeaendert(pfad, wert) {
  var v = dvVorlage(DV.vorlageId);
  if (dvIstStandard(v.id)) return;   // Standardvorlagen sind schreibgeschützt
  dvSetze(v, pfad, wert);
  clearTimeout(_dvFormTimer);
  _dvFormTimer = setTimeout(function () {
    dvVorlagenSpeichern();
    dvUpdate();
  }, 120);
}

// ── Auswahlliste im Werkzeugkasten neu aufbauen ──────────────────
function dvSelectAktualisieren() {
  var sel = document.getElementById('dv-vorlage-sel');
  if (!sel) return;
  sel.innerHTML = '';
  DV_VORLAGEN.forEach(function (v) {
    var o = document.createElement('option');
    o.value = v.id;
    o.textContent = v.name + (dvIstStandard(v.id) ? ' (Standard)' : '');
    if (v.id === DV.vorlageId) o.selected = true;
    sel.appendChild(o);
  });
  var info = document.getElementById('dv-vorlage-info');
  if (info) info.textContent = dvVorlage(DV.vorlageId).beschreibung || '';
}

// ── Panel ────────────────────────────────────────────────────────
function dvVorlagenPanel() {
  var v = dvVorlage(DV.vorlageId);
  var standard = dvIstStandard(v.id);

  var panel = mk('div', 'dv-form');

  // Kopfbereich: Name + Aktionen
  var kopf = mk('div', 'dv-form-kopf');

  if (standard) {
    var banner = mk('div', 'dv-banner');
    banner.appendChild(tx('div', '', 'Standardvorlagen sind schreibgeschützt, damit du immer einen sauberen Ausgangspunkt hast.'));
    var kopBtn = btn('✎ Als eigene Vorlage kopieren', 'btn btn-pri btn-sm');
    kopBtn.onclick = function () {
      var neu = dvKopie(v);
      DV.vorlageId = neu.id;
      localStorage.setItem('dv_vorlage', neu.id);
      dvSelectAktualisieren();
      dvVorlagenPanelNeu();
      dvUpdate();
    };
    banner.appendChild(kopBtn);
    kopf.appendChild(banner);
  } else {
    var nameFg = mk('div', 'dv-fg');
    nameFg.appendChild(tx('label', 'fl', 'Name der Vorlage'));
    var nameInp = document.createElement('input');
    nameInp.type = 'text'; nameInp.className = 'finp'; nameInp.value = v.name;
    nameInp.oninput = function () {
      v.name = nameInp.value;
      clearTimeout(_dvFormTimer);
      _dvFormTimer = setTimeout(function () { dvVorlagenSpeichern(); dvSelectAktualisieren(); }, 200);
    };
    nameFg.appendChild(nameInp);
    kopf.appendChild(nameFg);

    var aktionen = mk('div', 'dv-form-aktionen');
    var dupBtn = btn('Duplizieren', 'btn btn-ghost btn-sm');
    dupBtn.onclick = function () {
      var neu = dvKopie(v);
      DV.vorlageId = neu.id;
      localStorage.setItem('dv_vorlage', neu.id);
      dvSelectAktualisieren();
      dvVorlagenPanelNeu();
      dvUpdate();
    };
    var delBtn = btn('Löschen', 'btn btn-danger btn-sm');
    delBtn.onclick = function () {
      if (!confirm('Vorlage "' + v.name + '" wirklich löschen?')) return;
      dvLoeschen(v.id);
      DV.vorlageId = DV_VORLAGEN[0].id;
      localStorage.setItem('dv_vorlage', DV.vorlageId);
      dvSelectAktualisieren();
      dvVorlagenPanelNeu();
      dvUpdate();
    };
    aktionen.appendChild(dupBtn);
    aktionen.appendChild(delBtn);
    kopf.appendChild(aktionen);
  }
  panel.appendChild(kopf);

  // Felder gruppenweise
  var gruppe = null;
  DV_FELDER.forEach(function (feld) {
    if (feld.gruppe) {
      gruppe = mk('div', 'dv-gruppe');
      gruppe.appendChild(tx('div', 'dv-gruppe-titel', feld.gruppe));
      if (feld.hinweis) gruppe.appendChild(tx('div', 'dv-gruppe-hinweis', feld.hinweis));
      var felder = mk('div', 'dv-gruppe-felder');
      gruppe.appendChild(felder);
      gruppe.__felder = felder;
      panel.appendChild(gruppe);
      return;
    }
    if (!gruppe) return;
    gruppe.__felder.appendChild(dvBauFeld(feld, v, standard));
  });

  return panel;
}

// ── Panel im DOM ersetzen ────────────────────────────────────────
function dvVorlagenPanelNeu() {
  var alt = document.getElementById('dv-vorlage-pane');
  if (!alt) return;
  var neu = dvVorlagenPanel();
  neu.id = 'dv-vorlage-pane';
  neu.style.display = alt.style.display;
  alt.replaceWith(neu);
}
