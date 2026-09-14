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
    // Das Feld heißt in der Tabelle noch mathematische_objekte, meint aber die
    // fachlichen Objekte des jeweiligen Fachs — in Bio Ökosystem oder Population,
    // in Chemie Reaktionsgleichung oder Bindungstyp.
    + '"mathematische_objekte":"<kommagetrennt: die fachlichen Objekte und Begriffe, '
    + 'um die es in diesem Material geht — in ' + fachLabel + ' also z.B. '
    + ({ Mathematik: 'Bruch, Term, lineare Funktion',
         Biologie:   'Ökosystem, Population, Enzym',
         Chemie:     'Reaktionsgleichung, Bindungstyp, Redoxreaktion' }[fachLabel]
        || 'die zentralen Fachbegriffe') + '>",'
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

// ── Fach wechseln ────────────────────────────────────────────────
// Ein beim Import falsch gesetztes Fach trifft immer einen ganzen Stapel.
// Die Korrektur sitzt deshalb in der Mehrfachauswahl: markieren, Zielfach
// wählen, umtragen. Geändert wird ausschließlich das Feld `fach` — alle
// übrigen Metadaten und die Gruppenzugehörigkeit bleiben unberührt.
function _runFachWechsel(reloadFn) {
  var gs = Object.values(_selGroups);
  if (!gs.length) return;
  var itemCount = gs.reduce(function(s, g) { return s + g.items.length; }, 0);

  // Fächer, in denen die Auswahl aktuell liegt. In der Fach-Ansicht ist das
  // genau eines — die Zählung deckt eine gemischte Auswahl mit ab.
  var istFach = {};
  gs.forEach(function(g) {
    g.items.forEach(function(it) { if (it.fach) istFach[it.fach] = (istFach[it.fach] || 0) + 1; });
  });

  var ziel   = null;
  var closed = false;
  var laeuft = false;

  var ov = mk('div', 'db-modal-overlay');
  ov.style.zIndex = '9600';   // über der Aktionsleiste (z-index 200)
  ov.onclick = function(e) { if (e.target === ov) close(); };

  var box = mk('div', 'db-modal');
  box.style.cssText = 'max-width:460px;height:auto;max-height:none;';

  var hdr = mk('div', 'db-modal-hdr');
  hdr.appendChild(tx('div', 'db-modal-title', '⇄ Fach wechseln'));
  var closeX = btn('✕', 'btn btn-ghost btn-sm');
  closeX.style.cssText += 'margin-left:auto;font-size:13px;padding:3px 8px;';
  closeX.onclick = function() { close(); };
  hdr.appendChild(closeX);
  box.appendChild(hdr);

  var body = mk('div', '');
  body.style.cssText = 'padding:18px 22px;display:flex;flex-direction:column;gap:14px;';
  var info = tx('div', '', gs.length + ' Aufgabe' + (gs.length === 1 ? '' : 'n')
    + ' mit ' + itemCount + ' Eintr' + (itemCount === 1 ? 'ag' : 'ägen') + ' umtragen nach:');
  info.style.cssText = 'font-size:13px;color:var(--tx2);';
  body.appendChild(info);

  var btnRow = mk('div', '');
  btnRow.style.cssText = 'display:flex;gap:10px;';
  var fachBtns = [];
  FAECHER.forEach(function(f) {
    // Liegt die gesamte Auswahl bereits in diesem Fach, ist es kein Ziel.
    var istAktuell = istFach[f.key] === itemCount;
    var b = mk('button', '');
    b.disabled = istAktuell;
    b.title = istAktuell ? f.label + ' — aktuelles Fach' : 'Nach ' + f.label + ' umtragen';
    var ic = tx('span', '', f.icon);
    ic.style.cssText = 'font-size:26px;line-height:1;';
    var lb = tx('span', '', istAktuell ? f.label + ' (aktuell)' : f.label);
    lb.style.cssText = 'font-size:11.5px;font-weight:600;';
    b.appendChild(ic); b.appendChild(lb);
    b.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;gap:7px;'
      + 'padding:14px 6px;border-radius:10px;border:1.5px solid var(--bord);background:transparent;'
      + 'color:var(--tx2);transition:all .12s;'
      + (istAktuell ? 'opacity:.45;cursor:default;' : 'cursor:pointer;');
    if (!istAktuell) b.onclick = function() { ziel = f.key; syncBtns(); };
    btnRow.appendChild(b);
    fachBtns.push({ k: f.key, b: b, f: f, aus: istAktuell });
  });
  body.appendChild(btnRow);

  var stat = tx('div', '', '');
  stat.style.cssText = 'font-size:12px;color:var(--tx3);min-height:16px;line-height:1.4;';
  body.appendChild(stat);
  box.appendChild(body);

  var foot = mk('div', 'db-modal-footer');
  var goBtn = btn('Umtragen', 'btn btn-pri btn-sm');
  goBtn.disabled = true;
  goBtn.onclick = function() { run(); };
  var abBtn = btn('Abbrechen', 'btn btn-ghost btn-sm');
  abBtn.onclick = function() { close(); };
  foot.appendChild(goBtn); foot.appendChild(abBtn);
  box.appendChild(foot);

  function syncBtns() {
    fachBtns.forEach(function(t) {
      if (t.aus) return;
      var an = ziel === t.k;
      t.b.style.background  = an ? t.f.color + '20' : 'transparent';
      t.b.style.borderColor = an ? t.f.color : 'var(--bord)';
      t.b.style.borderWidth = an ? '2.5px' : '1.5px';
      t.b.style.color       = an ? t.f.color : 'var(--tx2)';
    });
    goBtn.disabled = !ziel;
  }

  function esc(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
  document.addEventListener('keydown', esc);

  function close() {
    if (closed || laeuft) return;   // während des Umtragens nicht schließbar
    closed = true;
    document.removeEventListener('keydown', esc);
    ov.remove();
  }

  // Jede Zeile einzeln — sbUpdate arbeitet per id. Ein Fehlschlag bricht den
  // Lauf nicht ab; erneutes Ausführen ist gefahrlos, weil derselbe Wert
  // geschrieben wird.
  async function run() {
    if (!ziel || laeuft) return;
    laeuft = true;
    goBtn.disabled = true; goBtn.textContent = '⏳ Trägt um…';
    abBtn.disabled = true; closeX.disabled = true;
    stat.style.color = 'var(--tx3)';
    var ok = 0, fehler = 0;
    for (var i = 0; i < gs.length; i++) {
      for (var j = 0; j < gs[i].items.length; j++) {
        try {
          await sbUpdate('inhalte', gs[i].items[j].id, { fach: ziel });
          ok++;
        } catch (e) {
          fehler++;
          console.error('[Fach-Wechsel] Fehler bei', gs[i].items[j].id, e);
        }
        stat.textContent = (ok + fehler) + '/' + itemCount + ' verarbeitet'
          + (fehler ? ' · ' + fehler + ' fehlgeschlagen' : '');
      }
    }
    laeuft = false;
    if (fehler) {
      stat.style.color = '#dc2626';
      stat.textContent = ok + ' von ' + itemCount + ' umgetragen, ' + fehler
        + ' fehlgeschlagen. Details in der Konsole — erneut versuchen ist gefahrlos.';
      goBtn.disabled = false; goBtn.textContent = '↻ Erneut versuchen';
      abBtn.disabled = false; closeX.disabled = false;
      return;
    }
    close();
    _clearSel();
    if (reloadFn) reloadFn();
  }

  ov.appendChild(box);
  document.body.appendChild(ov);
  syncBtns();
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
