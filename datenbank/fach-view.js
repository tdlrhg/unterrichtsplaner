// ── Fach-Ansicht ──────────────────────────────────────────────────
// fach-sel.js    — Multi-Select State + Fingerprint + Delete
// fach-table.js  — buildTableHead + reorderRowCells
// fach-row.js    — renderRow + _appendLkChip
// fach-filter.js — buildFilterBar

async function buildFachView(container) {
  const f = fachInfo(DB.fach);

  // ── Header ────────────────────────────────────────────────────
  const hdr = mk('div', 'c-hdr');
  const hdrLeft = mk('div', '');
  hdrLeft.appendChild(tx('div', 'c-title', f.icon + ' ' + f.label));
  const subT = tx('div', 'c-sub', '');
  hdrLeft.appendChild(subT);
  hdr.appendChild(hdrLeft);
  const colPickerBtn = btn('⚙ Spalten', 'btn btn-ghost btn-sm');
  colPickerBtn.style.cssText = 'margin-left:auto;flex-shrink:0;font-size:11px;position:relative;';
  hdr.appendChild(colPickerBtn);
  const neuBtn = btn('+ Neu', 'btn btn-sm');
  neuBtn.style.cssText = 'flex-shrink:0;';
  hdr.appendChild(neuBtn);
  container.appendChild(hdr);

  // ── Suche (wird in Filterleiste eingebaut) ────────────────────
  const searchInp = document.createElement('input');
  searchInp.type = 'text'; searchInp.className = 'finp';
  searchInp.placeholder = '🔍 Suchen…';
  searchInp.value = DB.suchtext;
  searchInp.style.cssText = 'width:160px;flex-shrink:0;font-size:12px;padding:3px 8px;height:28px;';

  // ── Filter-Leiste (Platzhalter, wird nach load-Definition befüllt) ─
  const filterContainer = mk('div', '');
  container.appendChild(filterContainer);

  // ── Tabellen-Bereich ──────────────────────────────────────────
  const tableWrap = mk('div', '');
  tableWrap.style.cssText = 'padding:8px 16px 16px;';
  container.appendChild(tableWrap);

  // ── Auswahl-Aktionsleiste ─────────────────────────────────────
  var oldAB = document.getElementById('db-sel-action-bar');
  if (oldAB && oldAB.parentNode) oldAB.parentNode.removeChild(oldAB);
  _selGroups   = {};
  _selLoadGrps = [];
  var actionBar = mk('div', '');
  actionBar.id = 'db-sel-action-bar';
  actionBar.style.cssText = 'display:none;position:fixed;bottom:0;left:265px;right:0;'
    + 'background:var(--surf);border-top:2px solid var(--pri);'
    + 'padding:9px 20px;align-items:center;gap:10px;z-index:200;'
    + 'box-shadow:0 -4px 16px rgba(0,0,0,.12);';
  _actionBar = actionBar;
  var abCount = tx('span', 'ab-count', '');
  abCount.style.cssText = 'font-size:13px;font-weight:600;color:var(--tx1);min-width:100px;';
  actionBar.appendChild(abCount);
  var abFpBtn = btn('🔍 KI-Fingerprint', 'btn btn-sm');
  abFpBtn.title = 'Unterrichts-Fingerprint mit KI analysieren';
  abFpBtn.onclick = function() { _runFingerprint(load); };
  actionBar.appendChild(abFpBtn);
  var abDupBtn = btn('⎘ Duplizieren', 'btn btn-sm');
  abDupBtn.title = 'Ausgewählte Aufgaben duplizieren';
  abDupBtn.onclick = function() { _runDuplicate(load); };
  actionBar.appendChild(abDupBtn);
  var abDelBtn = btn('🗑 Löschen', 'btn btn-sm');
  abDelBtn.style.cssText += 'background:#fee2e2;color:#b91c1c;border-color:#fca5a5;';
  abDelBtn.onclick = function() { _runDelete(load); };
  actionBar.appendChild(abDelBtn);
  var abProg = tx('span', 'ab-prog', '');
  abProg.style.cssText = 'font-size:12px;color:var(--tx3);';
  actionBar.appendChild(abProg);
  var abClearBtn = btn('✕ Aufheben', 'btn btn-ghost btn-sm');
  abClearBtn.style.cssText += 'margin-left:auto;font-size:11px;';
  abClearBtn.onclick = function() { _clearSel(); };
  actionBar.appendChild(abClearBtn);
  document.body.appendChild(actionBar);

  // Sort-Callback: Klick auf Spaltenheader → Auf/Absteigend wechseln
  function onSortChange(field) {
    if (DB.sortCol === field) {
      if (DB.sortDir === 'asc') { DB.sortDir = 'desc'; }
      else { DB.sortCol = null; DB.sortDir = 'asc'; } // dritter Klick → kein Sort
    } else {
      DB.sortCol = field; DB.sortDir = 'asc';
    }
    DB.offset = 0;
    var oldHead = tableWrap.querySelector('.db-table-head');
    if (oldHead) oldHead.replaceWith(buildTableHead(onSortChange));
    load();
  }

  // ── Spalten-Picker ────────────────────────────────────────────
  colPickerBtn.onclick = function(e) {
    e.stopPropagation();
    var existing = document.getElementById('db-col-picker');
    if (existing) { existing.remove(); return; }
    var picker = mk('div', '');
    picker.id = 'db-col-picker';
    picker.style.cssText = 'position:absolute;top:calc(100% + 4px);right:0;z-index:200;'
      + 'background:var(--surf);border:1px solid var(--bord);border-radius:10px;'
      + 'padding:10px 14px;box-shadow:0 8px 24px rgba(0,0,0,.18);min-width:170px;';
    picker.appendChild(tx('div', '', 'Spalten anzeigen')).style.cssText =
      'font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;';
    COLS.forEach(function(col, idx) {
      if (col.mandatory) return; // "Aufgabe" immer sichtbar
      var row = mk('div', '');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;';
      var chk = document.createElement('input');
      chk.type = 'checkbox'; chk.checked = COL_CONFIG.hidden.indexOf(idx) === -1;
      chk.style.cssText = 'width:14px;height:14px;cursor:pointer;accent-color:var(--pri);flex-shrink:0;';
      var lbl = tx('span', '', col.label);
      lbl.style.cssText = 'font-size:13px;color:var(--tx1);';
      row.appendChild(chk); row.appendChild(lbl);
      row.onclick = function() { chk.checked = !chk.checked; toggle(); };
      chk.onclick = function(ev) { ev.stopPropagation(); toggle(); };
      function toggle() {
        var h = COL_CONFIG.hidden.indexOf(idx);
        if (chk.checked) { if (h !== -1) COL_CONFIG.hidden.splice(h, 1); }
        else              { if (h === -1) COL_CONFIG.hidden.push(idx); }
        // Spalte auch in order halten (falls neu)
        if (COL_CONFIG.order.indexOf(idx) === -1) COL_CONFIG.order.push(idx);
        saveColConfig();
        var oldHead = tableWrap.querySelector('.db-table-head');
        if (oldHead) oldHead.replaceWith(buildTableHead(onSortChange));
        document.querySelectorAll('.db-row').forEach(reorderRowCells);
      }
      picker.appendChild(row);
    });
    colPickerBtn.style.position = 'relative';
    colPickerBtn.appendChild(picker);
    var close = function(ev) { if (!picker.contains(ev.target) && ev.target !== colPickerBtn) { picker.remove(); document.removeEventListener('click', close); } };
    setTimeout(function() { document.addEventListener('click', close); }, 0);
  };

  tableWrap.appendChild(buildTableHead(onSortChange));

  const wrap = mk('div', '');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;margin-top:4px;';
  tableWrap.appendChild(wrap);

  const LIMIT = 500;

  var _loadSeq = 0;
  async function load(opts) {
    var _seq = ++_loadSeq;
    try {
    var _savedScroll = (opts && opts.keepScroll) ? container.scrollTop : null;
    wrap.innerHTML = '<div style="padding:20px;color:var(--tx3);text-align:center">⏳ Lädt…</div>';
    const filters = { fach: f.key };
    if (DB.quelle_typ)    filters.quelle_typ    = DB.quelle_typ;
    if (DB.quelle_name)   filters.quelle_name   = DB.quelle_name;
    if (DB.operator)      filters.operator      = DB.operator;
    if (DB.schwierigkeit) filters.schwierigkeit = DB.schwierigkeit;
    if (DB.niveau)        filters.niveau        = DB.niveau;
    if (DB.umfang)        filters.umfang        = DB.umfang;
    var rawParams = [];
    if (DB.jahrgang) {
      var jg = DB.jahrgang;
      // Exakter Match + Bereichsschreibweisen wie "5/6" oder "5-10"
      rawParams.push('or=' + encodeURIComponent(
        '(jahrgang.eq.' + jg +
        ',jahrgang.like.' + jg + '/*' +
        ',jahrgang.like.' + jg + '-*' +
        ',jahrgang.like.*/' + jg +
        ',jahrgang.like.*/' + jg + '/*)'
      ));
    }
    if (DB.kapitel) filters.kapitel = DB.kapitel;
    if (DB.uk_titel)      filters.uk_titel      = DB.uk_titel;
    if (DB.inhaltstyp)    filters.inhaltstyp    = DB.inhaltstyp;
    if (DB.seite != null) filters.seite         = DB.seite;

    // Sortier-Reihenfolge aufbauen
    var orderStr;
    if (DB.sortCol) {
      var nulls = DB.sortDir === 'asc' ? 'nullslast' : 'nullsfirst';
      orderStr = DB.sortCol + '.' + DB.sortDir + '.' + nulls;
      if (DB.sortCol === 'seite') orderStr = 'quelle_name.asc,' + orderStr;
    } else {
      orderStr = 'quelle_typ,quelle_name,seite';
    }

    var loadFailed = false;
    var rows = await sbSelect('inhalte', {
      fts: DB.suchtext || null,
      filters,
      nullFilters: [],
      rawParams,
      limit: LIMIT,
      offset: DB.offset,
      order: orderStr,
    }).catch(function(err) {
      console.error('[Datenbank] Laden fehlgeschlagen (inhalte):', err, { filters: filters, fts: DB.suchtext || null });
      loadFailed = true;
      return [];
    });
    if (_seq !== _loadSeq) return;

    // nr natürlich sortieren: 8 < 8a < 8b < 9 < 10
    // Custom-Sort: Server-Reihenfolge beibehalten; nr-Sort nur innerhalb gleicher Gruppe
    // (gleicher Sort-Feldwert + gleiche Quelle), damit Teilaufgaben korrekt nummeriert bleiben.
    rows.sort(function(a, b) {
      if (!DB.sortCol) {
        if (a.quelle_name !== b.quelle_name) return (a.quelle_name || '') < (b.quelle_name || '') ? -1 : 1;
        if (a.seite !== b.seite) return (a.seite || 0) - (b.seite || 0);
      } else if (DB.sortCol === 'seite') {
        if (a.quelle_name !== b.quelle_name || a.seite !== b.seite) return 0;
      } else {
        var av = a[DB.sortCol], bv = b[DB.sortCol];
        if ((av || '') !== (bv || '') || a.quelle_name !== b.quelle_name) return 0;
      }
      return cmpNr(a.nr, b.nr);
    });

    wrap.innerHTML = '';
    var parts = [];
    if (DB.quelle_name)   parts.push('📖 ' + DB.quelle_name);
    else if (DB.quelle_typ && HERKUNFT[DB.quelle_typ]) parts.push(HERKUNFT[DB.quelle_typ].label);
    if (DB.operator)      parts.push(DB.operator);
    if (DB.schwierigkeit) parts.push(DB.schwierigkeit);
    if (DB.niveau)        parts.push(DB.niveau);
    if (DB.umfang)        parts.push(DB.umfang);
    if (DB.kapitel)       parts.push(DB.kapitel);
    if (DB.uk_titel)      parts.push(DB.uk_titel);
    if (DB.inhaltstyp)    parts.push(TYP_LABELS[DB.inhaltstyp] || DB.inhaltstyp);
    if (DB.seite != null) parts.push('S.\xa0' + DB.seite);
    if (DB.suchtext)      parts.push('„' + DB.suchtext + '"');
    var suffix = parts.length ? ' · ' + parts.join(' · ') : '';

    // Gruppen jetzt berechnen — für korrekte Aufgaben-Zählung
    var groups = dbGroupByParent(rows);

    // Materialset: alleinstehende LK-Gruppen in eine passende nicht-LK-Gruppe
    // eingliedern. Matching zweistufig: erst quelle_name+kapitel+uk_titel+seite,
    // dann ohne seite. Kein Match → LK bleibt eigenständige Gruppe (nie falsch anhängen).
    (function() {
      function findTarget(g, matchSeite) {
        var r0 = g.items[0];
        for (var j = 0; j < groups.length; j++) {
          var cg = groups[j]; if (cg === g) continue;
          var cr = cg.items[0]; if (!cr) continue;
          if ((cr.quelle_typ === 'materialset' || cr.quelle_typ === 'handreichung') &&
              cr.quelle_name === r0.quelle_name && cr.kapitel === r0.kapitel &&
              cr.uk_titel === r0.uk_titel &&
              (!matchSeite || cr.seite === r0.seite) &&
              !cg.items.every(function(r) { return r.inhaltstyp === 'lehrerkommentar'; })) {
            return cg;
          }
        }
        return null;
      }
      var keep = [];
      groups.forEach(function(g) {
        var r0 = g.items[0];
        if (!r0 || (r0.quelle_typ !== 'materialset' && r0.quelle_typ !== 'handreichung')) { keep.push(g); return; }
        var allLK = g.items.every(function(r) { return r.inhaltstyp === 'lehrerkommentar'; });
        if (!allLK) { keep.push(g); return; }
        var target = findTarget(g, true) || findTarget(g, false);
        if (target) { g.items.forEach(function(lk) { target.items.push(lk); }); }
        else { keep.push(g); }
      });
      groups = keep;
    })();

    if (loadFailed) {
      subT.textContent = 'Fehler beim Laden' + suffix;
    } else if (rows.length >= LIMIT) {
      subT.textContent = 'Aufgaben werden gezählt…' + suffix;
      sbSelect('inhalte', { select: 'gruppen_key', filters, fts: DB.suchtext || null, rawParams, limit: 10000 })
        .then(function(allRows) {
          var distinct = new Set(allRows.map(function(r) { return r.gruppen_key || r.id; })).size;
          subT.textContent = distinct + ' Aufgaben' + suffix;
        })
        .catch(function(err) {
          console.warn('[Datenbank] Zählung fehlgeschlagen:', err);
          subT.textContent = groups.length + '+ Aufgaben' + suffix;  // wenigstens die geladenen
        });
    } else {
      subT.textContent = groups.length + ' Aufgaben' + suffix;
    }

    // Fehler ≠ „leer": getrennt anzeigen, damit ein Ausfall nicht wie eine
    // leere Datenbank aussieht. Mit „Erneut versuchen" für transiente Aussetzer.
    if (loadFailed) {
      var ebox = mk('div', '');
      ebox.style.cssText = 'padding:36px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;';
      var emsg = tx('div', '', '⚠ Konnte nicht laden — Supabase nicht erreichbar?');
      emsg.style.cssText = 'color:#b91c1c;font-size:14px;font-weight:600;';
      var ehint = tx('div', '', 'Prüfe die Internetverbindung. Details stehen in der Browser-Konsole.');
      ehint.style.cssText = 'color:var(--tx3);font-size:12px;';
      var retry = btn('↻ Erneut versuchen', 'btn btn-sm');
      retry.onclick = function() { load({ keepScroll: true }); };
      ebox.appendChild(emsg); ebox.appendChild(ehint); ebox.appendChild(retry);
      wrap.appendChild(ebox);
      return;
    }

    if (!rows.length) {
      const e = tx('div', '', 'Keine Einträge gefunden.');
      e.style.cssText = 'padding:40px;text-align:center;color:var(--tx3);font-size:14px;';
      wrap.appendChild(e);
      return;
    }

    var _lastSeiteBuch = null; // für Seiten-Trenner
    groups.forEach(function(g, i) {
      // Für Materialsets: LKs vom Inhalt trennen und als Chips anhängen
      var isMat0 = g.items[0] && (g.items[0].quelle_typ === 'materialset' || g.items[0].quelle_typ === 'handreichung');
      var lkItems = [], contentItems = g.items;
      if (isMat0) {
        var _lkList = g.items.filter(function(r) { return r.inhaltstyp === 'lehrerkommentar'; });
        if (_lkList.length) {
          var _cList = g.items.filter(function(r) { return r.inhaltstyp !== 'lehrerkommentar'; });
          if (_cList.length) { lkItems = _lkList; contentItems = _cList; }
        }
      }

      var ref0 = contentItems[0] || g.items[0];
      var hasSubtasks = contentItems.length > 1 || (contentItems.length === 1 && g.key !== '?' && contentItems[0].nr !== g.key);

      // ── Seiten-Trenner ───────────────────────────────────────────
      // Nur wenn kein einzelner Seiten-Filter aktiv ist, seite bekannt, und kein Materialset
      if (!DB.seite && ref0 && ref0.seite != null && ref0.quelle_typ !== 'materialset' && ref0.quelle_typ !== 'handreichung') {
        var seiteBuchKey = (ref0.quelle_name || '') + '::' + ref0.seite;
        if (seiteBuchKey !== _lastSeiteBuch) {
          if (_lastSeiteBuch !== null) {
            // Trennlinie zwischen Seiten
            var sep = mk('div', '');
            sep.style.cssText = 'margin:6px 0 2px;border-top:1px solid var(--bord);';
            wrap.appendChild(sep);
          }
          // Seiten-Header
          var pageHdr = mk('div', '');
          pageHdr.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px 2px;';
          var pagePill = tx('span', '', 'Seite ' + ref0.seite);
          pagePill.style.cssText = 'font-size:13px;font-weight:800;letter-spacing:.04em;'
            + 'color:var(--pri);background:rgba(15,118,110,.10);border:1px solid rgba(15,118,110,.22);'
            + 'border-radius:20px;padding:4px 14px;';
          pageHdr.appendChild(pagePill);
          if (!DB.quelle_name && ref0.quelle_name) {
            var buchLabel = tx('span', '', ref0.quelle_name);
            buchLabel.style.cssText = 'font-size:11px;color:var(--tx3);font-weight:500;';
            pageHdr.appendChild(buchLabel);
          }
          wrap.appendChild(pageHdr);
          _lastSeiteBuch = seiteBuchKey;
        }
      }

      var showSeiteInHdr = DB.seite || !ref0 || ref0.seite == null;
      var seitePrefix = (showSeiteInHdr && ref0 && ref0.seite != null ? 'S. ' + ref0.seite + ' · ' : '');

      if (hasSubtasks) {
        // Gruppe: Header wie Einzelaufgaben-Row (gleiche Grid-Struktur), ohne Chips
        var gHdrItem = { inhalt: g.aufgabenstellung || '', inhaltstyp: ref0.inhaltstyp || 'aufgabe', quelle_typ: ref0.quelle_typ, kapitel: ref0.kapitel, uk_titel: ref0.uk_titel };
        var ghdr = renderRow(gHdrItem, null, true, seitePrefix + grpTypLabel(g));
        ghdr.title = 'Alle Teilaufgaben ansehen';
        ghdr.onclick = function() { openGroupModal(g, function() { load({ keepScroll: true }); }, groups, i); };
        ghdr.insertBefore(_mkSelCell(g.gruppen_key, g), ghdr.firstChild);

        // Teilaufgaben-Container (standardmäßig eingeklappt)
        var subContainer = mk('div', '');
        subContainer.style.display = 'none';
        var subCollapsed = true;
        var chevron = tx('span', '', '▸');
        chevron.style.cssText = 'font-size:15px;color:var(--tx3);cursor:pointer;margin-right:4px;'
          + 'flex-shrink:0;padding:1px 3px;border-radius:3px;user-select:none;line-height:1;';
        chevron.title = 'Teilaufgaben ein-/ausblenden';
        chevron.onclick = function(e) {
          e.stopPropagation();
          subCollapsed = !subCollapsed;
          subContainer.style.display = subCollapsed ? 'none' : '';
          chevron.textContent = subCollapsed ? '▸' : '▾';
        };
        var srcCell = ghdr.querySelector('[data-col-idx="0"]');
        if (srcCell) {
          var matTopEl = srcCell.querySelector('.mat-top-row');
          if (matTopEl) {
            matTopEl.insertBefore(chevron, matTopEl.firstChild);
          } else {
            // Schulbuch: glEl in flex-Row mit Chevron zusammenfassen
            var firstChild = srcCell.firstChild;
            var topRow = mk('div', '');
            topRow.style.cssText = 'display:flex;align-items:center;gap:4px;';
            srcCell.insertBefore(topRow, firstChild);
            topRow.appendChild(chevron);
            if (firstChild) topRow.appendChild(firstChild);
          }
        }

        wrap.appendChild(ghdr);
        if (lkItems.length) _appendLkChip(ghdr, lkItems, wrap, function() { load({ keepScroll: true }); });
        contentItems.forEach(function(row) {
          var rowEl = renderRow(row, function() { load({ keepScroll: true }); }, true);
          // Spacer hält die Grid-Ausrichtung; Einrückung geht auf die erste Datenspalte
          var _subSpacer = mk('div', 'db-col-sel'); _subSpacer.dataset.selCell = '1';
          rowEl.insertBefore(_subSpacer, rowEl.firstChild);
          if (rowEl.children[1]) rowEl.children[1].style.paddingLeft = '18px';
          rowEl.onclick = function() { openGroupModal(g, function() { load({ keepScroll: true }); }, groups, i); };
          subContainer.appendChild(rowEl);
        });
        wrap.appendChild(subContainer);
      } else {
        // Einzelaufgabe: „Aufgabe N" + Text in einer Zeile (kein separater Header)
        var singleItem = contentItems[0] || g.items[0];
        var rowEl = renderRow(singleItem, function() { load({ keepScroll: true }); }, true, seitePrefix + grpTypLabel(g));
        rowEl.onclick = function() { openGroupModal(g, function() { load({ keepScroll: true }); }, groups, i); };
        rowEl.insertBefore(_mkSelCell(g.gruppen_key, g), rowEl.firstChild);
        // Unsichtbarer Platzhalter damit Chips mit Chevron-Zeilen ausgerichtet bleiben
        var srcCell0 = rowEl.querySelector('[data-col-idx="0"]');
        if (srcCell0) {
          var matTopEl0 = srcCell0.querySelector('.mat-top-row');
          if (matTopEl0) {
            var ph = mk('span', '');
            ph.style.cssText = 'display:inline-block;font-size:15px;padding:1px 3px;margin-right:4px;flex-shrink:0;visibility:hidden;';
            ph.textContent = '▾';
            matTopEl0.insertBefore(ph, matTopEl0.firstChild);
          }
        }
        wrap.appendChild(rowEl);
        if (lkItems.length) _appendLkChip(rowEl, lkItems, wrap, function() { load({ keepScroll: true }); });
      }
    });

    _selLoadGrps = groups;
    _syncSel();

    if (rows.length === LIMIT) {
      const mehr = btn('Weitere ' + LIMIT + ' laden…', 'btn btn-ghost btn-sm');
      mehr.style.cssText = 'margin:8px auto;display:block;';
      mehr.onclick = function() { DB.offset += LIMIT; load(); };
      wrap.appendChild(mehr);
    }

    if (_savedScroll !== null) requestAnimationFrame(function() { container.scrollTop = _savedScroll; });
    } catch (err) {
      console.error('[Datenbank] Unerwarteter Fehler in load() #' + _seq + ':', err);
      wrap.innerHTML = '';
      var errDiv = tx('div', '', '⚠ Fehler beim Rendern. Details in der Browser-Konsole.');
      errDiv.style.cssText = 'padding:36px;color:#b91c1c;text-align:center;font-size:14px;';
      wrap.appendChild(errDiv);
    }
  }

  // Suche: Debounce
  var _debounce;
  searchInp.oninput = function() {
    clearTimeout(_debounce);
    _debounce = setTimeout(function() { DB.suchtext = searchInp.value.trim(); DB.offset = 0; load(); }, 400);
  };

  // Neu-Button
  neuBtn.onclick = function() { openEntryModal(null, 'create', function() { DB.offset = 0; load(); }); }; // neuer Eintrag → zurück nach oben ok

  // Filter-Leiste einbauen
  buildFilterBar(filterContainer, load, searchInp, f.key);

  load();
}
