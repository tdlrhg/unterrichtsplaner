// ── Multi-Select State ────────────────────────────────────────────
var _selGroups   = {};  // gruppen_key → group object
var _selLoadGrps = [];  // groups from last load() — for select-all
var _actionBar   = null;

function _selCount() { return Object.keys(_selGroups).length; }

function _clearSel() {
  _selGroups = {};
  _syncSel();
}

function _syncSel() {
  var count = _selCount();
  if (_actionBar) {
    _actionBar.style.display = count > 0 ? 'flex' : 'none';
    var lbl = _actionBar.querySelector('.ab-count');
    if (lbl) lbl.textContent = count + ' ausgewählt';
  }
  document.querySelectorAll('input[data-gkey]').forEach(function(chk) {
    chk.checked = !!_selGroups[chk.dataset.gkey];
  });
  var allChks = Array.from(document.querySelectorAll('input[data-gkey]'));
  var selAllChk = document.querySelector('input[data-selall]');
  if (selAllChk) {
    var n = allChks.filter(function(c) { return c.checked; }).length;
    selAllChk.indeterminate = n > 0 && n < allChks.length;
    selAllChk.checked = allChks.length > 0 && n === allChks.length;
  }
}

function _mkSelCell(gKey, g) {
  var cell = mk('div', 'db-col-sel');
  cell.dataset.selCell = '1';
  var chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.dataset.gkey = gKey;
  chk.style.cssText = 'cursor:pointer;accent-color:var(--pri);width:14px;height:14px;';
  chk.checked = !!_selGroups[gKey];
  chk.addEventListener('change', function(e) {
    e.stopPropagation();
    if (chk.checked) { _selGroups[gKey] = g; } else { delete _selGroups[gKey]; }
    _syncSel();
  });
  chk.addEventListener('click', function(e) { e.stopPropagation(); });
  cell.appendChild(chk);
  return cell;
}

async function _runFingerprint(reloadFn) {
  var gs = Object.values(_selGroups);
  if (!gs.length) return;
  var progEl = _actionBar && _actionBar.querySelector('.ab-prog');
  var total = gs.length;
  for (var i = 0; i < gs.length; i++) {
    if (progEl) progEl.textContent = (i + 1) + '/' + total + ' analysiert…';
    try {
      var fp = await _analyzeFingerprint(gs[i]);
      var grpPatch = fp.gruppe || fp;
      for (var j = 0; j < gs[i].items.length; j++) {
        var itPatch = (fp.items && fp.items[j]) ? fp.items[j] : {};
        await sbUpdate('inhalte', gs[i].items[j].id, Object.assign({}, grpPatch, itPatch));
      }
    } catch (e) {
      console.error('[KI-FP] Fehler:', e);
      if (progEl) progEl.textContent = '⚠ Fehler (' + (i + 1) + '): ' + e.message;
    }
  }
  if (progEl) {
    progEl.textContent = total + ' fertig ✓';
    setTimeout(function() { progEl.textContent = ''; }, 3000);
  }
  _clearSel();
  if (reloadFn) reloadFn({ keepScroll: true });
}

async function _analyzeFingerprint(g) {
  var first = g.items[0] || {};
  var fach = first.fach || DB.fach || 'mathe';
  var fachLabel = { mathe: 'Mathematik', bio: 'Biologie', chemie: 'Chemie' }[fach] || fach;
  var isMultiItem = g.items.length > 1;

  var aufgabeText = g.items.map(function(it, idx) {
    var parts = [];
    if (isMultiItem && it.nr) parts.push('(' + it.nr + ')');
    if (it.aufgabenstellung && idx === 0) parts.push(it.aufgabenstellung);
    if (it.inhalt && it.inhalt !== it.aufgabenstellung) parts.push(it.inhalt);
    return parts.filter(Boolean).join(' ');
  }).join('\n');

  var opValues = Object.keys(OP_FARBEN2).join('|');
  var prompt = 'Du bist Fachdidaktiker. Antworte auf Standarddeutsch (ß, nicht ss). Analysiere diese Aufgabe (Fach: ' + fachLabel
    + (first.jahrgang ? ', Jg. ' + first.jahrgang : '') + ') und gib einen JSON-Fingerprint zurück.\n\n'
    + (first.kapitel ? 'Kapitel: ' + first.kapitel + '\n' : '')
    + (first.thema ? 'Thema: ' + first.thema + '\n' : '')
    + 'Aufgabe:\n' + aufgabeText + '\n\n'
    + 'Gib NUR valides JSON zurück:\n'
    + '{"gruppe":{'
    + '"kontext":"<innermathematisch|sachbezogen|realitaetsnah|faecheruebergreifend>",'
    + '"offenheit":"<geschlossen|halboffen|offen>",'
    + '"unterstuetzung":"<Differenzierungsform in der Aufgabe: hilfestellungen=Hilfekarten/Scaffolding, teilaufgaben=in Teilschritte gegliedert, tipps=Hinweise vorhanden, ohne=keine Differenzierung>",'
    + '"kognitive_anforderung":"<routine|problemloesen|entdecken>",'
    + '"loesungswege":"<einer|mehrere>",'
    + '"rechenbarkeit":"<kopf|schriftlich|nur_tr>",'
    + '"rolle_in_reihe":"<einstieg|aufbauend|vernetzend|abschliessend|uebertragend|ueberleitend|flexibel — flexibel wenn das Material unabhängig vom Reihenkontext einsetzbar ist>",'
    + '"didaktische_funktion":"<kommagetrennt aus: motivation,interesse,vorwissen,diagnose,fehlvorstellungen,konflikt,begriffsbildung,entdecken,erarbeiten,zusammenhaenge,vertiefen,strukturieren,sichern,ueben,automatisieren,anwenden,transfer,reflexion,vergleichen>",'
    + '"strukturtyp":"<kommagetrennt aus: fermi,modellierung,problemloesen,offen,mc,beweis,konstruktion,zuordnung>",'
    + '"sozialform":"<einzel|partner|gruppe|plenum>",'
    + '"prozessbezogene_kompetenz":"<kommagetrennt aus: argumentieren,problemloesen,modellieren,darstellen,kommunizieren,symbole>",'
    + '"hilfsmittel":"<ohne|tr|geodreieck|formelsammlung|alle>",'
    + '"differenzierungspotenzial":"<niedrig|mittel|hoch>",'
    + '"sprachliche_zugaenglichkeit":"<zugaenglich|eingeschraenkt|komplex>",'
    + '"mathematische_objekte":"<kommagetrennt>",'
    + '"vorkenntnisse":"<kommagetrennt>",'
    + '"klp_kompetenz":"<konkretisierte Kompetenzerwartung, 1 Satz>",'
    + '"thema":"<fachliches Kernthema, max. 5 Wörter, z.B. Bruchrechnung oder Korrosion – Grundlagen>"'
    + '},"items":['
    + g.items.map(function() {
        return '{"operator":"<' + opValues + '>","schwierigkeit":"<grundlegend|standard|anspruchsvoll>","umfang":"<kurz|mittel|lang>","niveau":"<leicht|mittel|schwer>"}';
      }).join(',')
    + ']}';

  var raw = await callKI(prompt, { model: KI_MODEL_HAIKU, maxTokens: 1200, label: 'fach-sel-vorschlag' });
  var m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Kein JSON erhalten');
  return JSON.parse(m[0]);
}

async function _runDuplicate(reloadFn) {
  var gs = Object.values(_selGroups);
  if (!gs.length) return;
  var progEl = _actionBar && _actionBar.querySelector('.ab-prog');
  var ts = Date.now();
  for (var i = 0; i < gs.length; i++) {
    var g = gs[i];
    var dupKey = 'dup_' + ts + '_' + i;
    var newRows = g.items.map(function(it, j) {
      var row = Object.assign({}, it);
      row.id = 'db_' + ts + '_dup' + i + '_' + j + '_' + Math.random().toString(36).slice(2, 6);
      row.gruppen_key = dupKey;
      return row;
    });
    if (progEl) progEl.textContent = (i + 1) + '/' + gs.length + ' dupliziert…';
    await sbInsert('inhalte', newRows);
  }
  if (progEl) {
    progEl.textContent = gs.length + ' dupliziert ✓';
    setTimeout(function() { progEl.textContent = ''; }, 3000);
  }
  _clearSel();
  if (reloadFn) reloadFn({ keepScroll: true });
}

async function _runDelete(reloadFn) {
  var gs = Object.values(_selGroups);
  if (!gs.length) return;
  var itemCount = gs.reduce(function(s, g) { return s + g.items.length; }, 0);
  if (!confirm(gs.length + ' Aufgabe(n) mit ' + itemCount + ' Einträgen löschen?\nDiese Aktion kann nicht rückgängig gemacht werden.')) return;
  for (var i = 0; i < gs.length; i++) {
    for (var j = 0; j < gs[i].items.length; j++) {
      await sbDelete('inhalte', gs[i].items[j].id);
    }
  }
  _clearSel();
  if (reloadFn) reloadFn();
}
