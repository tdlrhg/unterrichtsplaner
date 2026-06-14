// ── Fach-Ansicht ──────────────────────────────────────────────────
// ── Tabellen-Header mit Resize + Drag-Reorder ─────────────────────
var _colDragFromPos = null;

function buildTableHead(onSortChange) {
  const head = mk('div', 'db-table-head');
  head.style.gridTemplateColumns = colTemplate();

  var visCols = visibleCols();
  visCols.forEach(function(colIdx, visualPos) {
    const col = COLS[colIdx];
    const hCell = mk('div', 'db-col-hdr ' + col.hCls);
    hCell.dataset.colIdx = colIdx;
    hCell.dataset.vpos = visualPos;
    hCell.draggable = true;

    // Label mit Sort-Pfeil
    var sortArrow = '';
    if (col.sortField && DB.sortCol === col.sortField) {
      sortArrow = DB.sortDir === 'asc' ? ' ▲' : ' ▼';
      hCell.style.cssText += 'cursor:pointer;';
    } else if (col.sortField) {
      hCell.style.cssText += 'cursor:pointer;';
    }
    const lbl = tx('span', '', col.label + sortArrow);
    lbl.style.pointerEvents = 'none';
    hCell.appendChild(lbl);

    // Sort-Klick (nur wenn kein Drag läuft)
    if (onSortChange && col.sortField) {
      hCell.addEventListener('click', function() {
        if (_colDragFromPos !== null) return;
        onSortChange(col.sortField);
      });
    }

    // ── Resize-Handle (nicht nach der letzten Spalte) ──────────────
    if (visualPos < visCols.length - 1) {
      const rh = mk('div', 'db-col-resize-handle');
      rh.title = 'Spaltenbreite ziehen';
      rh.draggable = false;
      rh.addEventListener('mousedown', function(e) {
        e.preventDefault();   // unterbindet Browser-Drag auf dem draggable-Parent
        e.stopPropagation();
        var startX = e.clientX;
        var startW = COL_CONFIG.widths[colIdx];
        if (!startW) {
          // 1fr → einmalig gemessene Pixel-Breite fixieren
          startW = Math.round(hCell.getBoundingClientRect().width);
          COL_CONFIG.widths[colIdx] = startW;
        }
        hCell.classList.add('db-resize-active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        function onMove(ev) {
          var newW = Math.max(60, Math.round(startW + ev.clientX - startX));
          COL_CONFIG.widths[colIdx] = newW;
          applyColTemplate();
        }
        function onUp() {
          hCell.classList.remove('db-resize-active');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          saveColConfig();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      hCell.appendChild(rh);
    }

    // ── Drag-Events für Spalten-Reorder ───────────────────────────
    hCell.addEventListener('dragstart', function(e) {
      _colDragFromPos = visualPos;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(visualPos));
      // Kurz verzögert, damit der Drag-Ghost noch normal aussieht
      requestAnimationFrame(function() { hCell.classList.add('db-col-dragging'); });
    });
    hCell.addEventListener('dragend', function() {
      _colDragFromPos = null;
      hCell.classList.remove('db-col-dragging');
      document.querySelectorAll('.db-col-drag-over').forEach(function(el) {
        el.classList.remove('db-col-drag-over');
      });
    });
    hCell.addEventListener('dragover', function(e) {
      if (_colDragFromPos === null || _colDragFromPos === visualPos) return; // eslint-disable-line
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      hCell.classList.add('db-col-drag-over');
    });
    hCell.addEventListener('dragleave', function() {
      hCell.classList.remove('db-col-drag-over');
    });
    hCell.addEventListener('drop', function(e) {
      e.preventDefault();
      hCell.classList.remove('db-col-drag-over');
      var fromPos = _colDragFromPos;
      var toPos = visualPos;
      if (fromPos === null || fromPos === toPos) return;
      // Reorder nur innerhalb der sichtbaren Spalten, Rest bleibt am Ende
      var vis = visibleCols();
      var fromIdx = vis[fromPos], toIdx = vis[toPos];
      var newOrder = COL_CONFIG.order.filter(function(i) { return vis.indexOf(i) === -1; });
      vis.splice(fromPos, 1); vis.splice(toPos, 0, fromIdx);
      COL_CONFIG.order = vis.concat(newOrder);
      saveColConfig();
      head.replaceWith(buildTableHead(onSortChange));
      document.querySelectorAll('.db-row').forEach(reorderRowCells);
    });

    head.appendChild(hCell);
  });

  return head;
}

function reorderRowCells(rowEl) {
  var cellMap = {};
  Array.from(rowEl.children).forEach(function(cell) {
    var idx = cell.dataset.colIdx;
    if (idx !== undefined) cellMap[idx] = cell;
  });
  while (rowEl.firstChild) rowEl.removeChild(rowEl.firstChild);
  visibleCols().forEach(function(colIdx) {
    if (cellMap[colIdx]) rowEl.appendChild(cellMap[colIdx]);
  });
  rowEl.style.gridTemplateColumns = colTemplate();
}

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

  async function load(opts) {
    var _savedScroll = (opts && opts.keepScroll) ? container.scrollTop : null;
    wrap.innerHTML = '<div style="padding:20px;color:var(--tx3);text-align:center">⏳ Lädt…</div>';
    const filters = { fach: f.key };
    if (DB.quelle_typ)    filters.quelle_typ    = DB.quelle_typ;
    if (DB.quelle_name)   filters.quelle_name   = DB.quelle_name;
    if (DB.operator)      filters.operator      = DB.operator;
    if (DB.schwierigkeit) filters.schwierigkeit = DB.schwierigkeit;
    if (DB.niveau)        filters.niveau        = DB.niveau;
    if (DB.umfang)        filters.umfang        = DB.umfang;
    if (DB.jahrgang)      filters.jahrgang      = DB.jahrgang;
    var rawParams = [];
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

    // nr natürlich sortieren: 8 < 8a < 8b < 9 < 10
    // Bei Custom-Sort: Server-Reihenfolge beibehalten, nur innerhalb gleicher Seite nr-sortieren
    rows.sort(function(a, b) {
      if (!DB.sortCol) {
        if (a.quelle_name !== b.quelle_name) return (a.quelle_name || '') < (b.quelle_name || '') ? -1 : 1;
        if (a.seite !== b.seite) return (a.seite || 0) - (b.seite || 0);
      } else {
        if (a.quelle_name !== b.quelle_name || a.seite !== b.seite) return 0;
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
      var hasSubtasks = g.items.length > 1 || (g.items.length === 1 && g.key !== '?' && g.items[0].nr !== g.key);
      var ref0 = g.items[0];

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
        var gHdrItem = { inhalt: g.aufgabenstellung || '', inhaltstyp: ref0.inhaltstyp || 'aufgabe' };
        var ghdr = renderRow(gHdrItem, null, true, seitePrefix + grpTypLabel(g));
        ghdr.title = 'Alle Teilaufgaben ansehen';
        ghdr.onclick = function() { openGroupModal(g, function() { load({ keepScroll: true }); }, groups, i); };
        wrap.appendChild(ghdr);
        g.items.forEach(function(row) {
          var rowEl = renderRow(row, function() { load({ keepScroll: true }); }, true);
          // Nur die erste Spalte einrücken (zeigt Zugehörigkeit zur Gruppe),
          // NICHT die ganze Zeile — sonst verrutschen alle anderen Spalten.
          if (rowEl.firstChild) rowEl.firstChild.style.paddingLeft = '18px';
          rowEl.onclick = function() { openGroupModal(g, function() { load({ keepScroll: true }); }, groups, i); };
          wrap.appendChild(rowEl);
        });
      } else {
        // Einzelaufgabe: „Aufgabe N" + Text in einer Zeile (kein separater Header)
        var rowEl = renderRow(g.items[0], function() { load({ keepScroll: true }); }, true, seitePrefix + grpTypLabel(g));
        rowEl.onclick = function() { openGroupModal(g, function() { load({ keepScroll: true }); }, groups, i); };
        wrap.appendChild(rowEl);
      }
    });

    if (rows.length === LIMIT) {
      const mehr = btn('Weitere ' + LIMIT + ' laden…', 'btn btn-ghost btn-sm');
      mehr.style.cssText = 'margin:8px auto;display:block;';
      mehr.onclick = function() { DB.offset += LIMIT; load(); };
      wrap.appendChild(mehr);
    }

    if (_savedScroll !== null) requestAnimationFrame(function() { container.scrollTop = _savedScroll; });
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

// ── Eintrag-Zeile (Tabellen-Grid) ────────────────────────────────
// groupLabel (optional): bei Einzelaufgaben „Aufgabe N" in Spalte 0,
// damit Nr. und Aufgabentext in einer Zeile stehen (Text bricht um).
function renderRow(a, onSaved, compact, groupLabel) {
  const hMeta = herkunftMeta(a.quelle_typ);
  const hasBuch = hMeta.hasBuch;
  const accentColor = hMeta.color;

  const row = mk('div', 'db-row');
  row.style.background = SCHW_BG[a.schwierigkeit] || 'transparent';
  row.style.gridTemplateColumns = colTemplate();

  var cells = [];

  // Zelle 0: Quelle — im compact-Modus nur die Nr
  var src = mk('div', 'db-col-src'); src.dataset.colIdx = 0;
  if (compact) {
    if (groupLabel) {
      // Einzelaufgabe: „Aufgabe N" als Zeilenlabel in Spalte 0
      var glEl = tx('div', '', groupLabel);
      glEl.style.cssText = 'font-weight:700;font-size:12px;color:var(--tx2);letter-spacing:.02em;padding:2px 0;';
      src.appendChild(glEl);
    } else {
      var nrMatch = String(a.nr || '').match(/[a-zA-Z]+$/);
      if (nrMatch) {
        var nrEl = tx('div', '', nrMatch[0]);
        nrEl.style.cssText = 'font-weight:700;font-size:13px;color:var(--tx2);padding:2px 0;';
        src.appendChild(nrEl);
      }
    }
  } else if (DB.quelle_name && hasBuch) {
    // Werk ist bereits gefiltert — nur Seite zeigen
    var seiteEl = tx('div', 'db-kap-name', a.seite ? 'S. ' + a.seite : '–');
    seiteEl.style.fontSize = '13px';
    src.appendChild(seiteEl);
  } else {
    var hBadge = tx('div', 'db-herkunft-badge', hMeta.icon + ' ' + hMeta.label);
    hBadge.style.color = accentColor;
    src.appendChild(hBadge);
    if (hasBuch) {
      src.appendChild(tx('div', 'db-buch-name', a.quelle_name || '–'));
      var sub = (a.uk_titel || a.kapitel || '') + (a.seite ? ' · S. ' + a.seite : '');
      if (sub.trim()) src.appendChild(tx('div', 'db-kap-name', sub));
    } else {
      src.appendChild(tx('div', 'db-buch-name', a.titel || a.dateiname || '–'));
    }
  }
  cells[0] = src;

  // Typ-Badge (nur für Beispiele und Lehrtexte, nicht für Aufgaben / null)
  if (a.inhaltstyp && a.inhaltstyp !== 'aufgabe') {
    var typBadge = tx('span', '', (TYP_ICONS[a.inhaltstyp] ? TYP_ICONS[a.inhaltstyp] + ' ' : '') + (TYP_LABELS[a.inhaltstyp] || a.inhaltstyp));
    var typColor = TYP_FARBEN[a.inhaltstyp] || '#64748b';
    typBadge.style.cssText = 'display:inline-block;font-size:9.5px;font-weight:700;padding:1px 7px;border-radius:20px;'
      + 'background:' + typColor + '18;color:' + typColor + ';border:1px solid ' + typColor + '38;'
      + 'text-transform:uppercase;letter-spacing:.06em;';
    src.appendChild(typBadge);
  }

  // Zelle 1: Inhalt — im compact-Modus nur den individuellen Text
  // Materialset-Lehrerkommentare werden ohne Textvorschau angezeigt (kompakte Zeile)
  var mid = mk('div', 'db-col-inhalt'); mid.dataset.colIdx = 1;
  var isMatLK = (a.quelle_typ === 'materialset' || a.quelle_typ === 'handreichung') && a.inhaltstyp === 'lehrerkommentar';
  if (!isMatLK) {
    var inhaltText = compact
      ? (a.inhalt || '–')
      : (a.inhalt || a.thema || a.beschreibung || '–');
    var inhaltCls = 'db-inhalt-text' + (compact && groupLabel ? ' wrap' : '');
    mid.appendChild(tx('div', inhaltCls, inhaltText.replace(/ \| /g, ' · ').slice(0, groupLabel ? 400 : 150)));
    if (!compact && a.anforderung) mid.appendChild(tx('div', 'db-anf-text', a.anforderung.slice(0, 120)));
  }
  cells[1] = mid;

  // Zelle 2: Anforderungsbereich + Niveau
  var schwCol = mk('div', 'db-col-schw'); schwCol.dataset.colIdx = 2;
  schwCol.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;';
  if (a.schwierigkeit) schwCol.appendChild(mkChip(a.schwierigkeit, SCHW_FARBEN[a.schwierigkeit] || '#64748b', SCHW_ICONS[a.schwierigkeit] || ''));
  if (a.niveau)        schwCol.appendChild(mkChip(a.niveau, NIVEAU_FARBEN[a.niveau] || '#64748b', NIVEAU_ICONS[a.niveau] || ''));
  cells[2] = schwCol;

  // Zelle 3: Operator (optional)
  var opCol = mk('div', 'db-col-op'); opCol.dataset.colIdx = 3;
  if (a.operator) opCol.appendChild(mkChip(a.operator, opColor(a.operator)));
  cells[3] = opCol;

  // Zelle 4: Umfang (optional)
  var umfCol = mk('div', 'db-col-umfang'); umfCol.dataset.colIdx = 4;
  umfCol.style.cssText = 'display:flex;justify-content:center;align-items:center;';
  if (a.umfang) {
    var umfEl = tx('div', '', a.umfang);
    umfEl.style.cssText = 'font-size:11px;color:var(--tx3);font-weight:600;';
    umfCol.appendChild(umfEl);
  }
  cells[4] = umfCol;

  // Zelle 5: Kapitel
  var kapCol = mk('div', 'db-col-kap'); kapCol.dataset.colIdx = 5;
  var kapText = a.kapitel || '';
  if (kapText) {
    var kapEl = tx('div', 'db-col-kap-text', kapText);
    kapEl.title = kapText;
    kapCol.appendChild(kapEl);
  }
  cells[5] = kapCol;

  // Zelle 6: Unterkapitel
  var ukCol = mk('div', 'db-col-uk'); ukCol.dataset.colIdx = 6;
  if (a.uk_titel) {
    var ukEl = tx('div', 'db-col-kap-text', a.uk_titel);
    ukEl.title = a.uk_titel;
    ukCol.appendChild(ukEl);
  }
  cells[6] = ukCol;

  // Nur sichtbare Spalten in konfigurierter Reihenfolge einhängen
  visibleCols().forEach(function(i) { row.appendChild(cells[i]); });

  // Klick → Vollbild-Modal
  row.onclick = function() { openEntryModal(a, 'edit', onSaved); };
  return row;
}

// ── Filter-Leiste ─────────────────────────────────────────────────
var _buchCache = {}; // fach → [buchtitel]

function buildFilterBar(containerEl, loadFn, searchInp, fach) {
  containerEl.innerHTML = '';
  const bar = mk('div', 'db-filter-bar');

  function refresh() { loadFn(); buildFilterBar(containerEl, loadFn, searchInp, fach); }

  // Suchfeld + Seitenfilter
  if (searchInp) bar.appendChild(searchInp);

  var seiteInp = document.createElement('input');
  seiteInp.type = 'number'; seiteInp.placeholder = 'S.';
  seiteInp.title = 'Nach Seite filtern';
  seiteInp.value = DB.seite != null ? DB.seite : '';
  seiteInp.style.cssText = 'width:52px;flex-shrink:0;font-size:12px;padding:3px 6px;height:28px;border:1px solid var(--bord);border-radius:6px;background:var(--surf);color:var(--tx1);';
  var _seiteDebounce;
  seiteInp.oninput = function() {
    clearTimeout(_seiteDebounce);
    _seiteDebounce = setTimeout(function() {
      var v = seiteInp.value.trim();
      DB.seite = v !== '' ? Number(v) : null;
      DB.offset = 0;
      loadFn(); // kein rebuild der Filterleiste — sonst geht Fokus verloren
    }, 400);
  };
  bar.appendChild(seiteInp);
  bar.appendChild(mk('div', 'db-filter-sep'));

  function fchipGroup(opts, dbKey) {
    const g = mk('div', 'db-filter-group');
    opts.forEach(function(opt) {
      const active = DB[dbKey] === opt.val;
      const chip = tx('div', 'db-fchip' + (active ? ' on' : ''), opt.label);
      if (active && opt.color) {
        chip.style.cssText = 'background:' + opt.color + '18;color:' + opt.color + ';border-color:' + opt.color + '60;';
      }
      chip.onclick = function() {
        DB[dbKey] = (DB[dbKey] === opt.val) ? null : opt.val;
        DB.offset = 0;
        refresh();
      };
      g.appendChild(chip);
    });
    return g;
  }

  function sep() {
    const s = mk('div', 'db-filter-sep');
    return s;
  }

  // Schulbuch-Dropdown
  var buchSel = document.createElement('select');
  buchSel.className = 'db-filter-sel';
  var buchOptDefault = document.createElement('option');
  buchOptDefault.value = ''; buchOptDefault.textContent = '📖 Werk';
  buchSel.appendChild(buchOptDefault);
  buchSel.onchange = function() {
    DB.quelle_name = buchSel.value || null;
    DB.quelle_typ = null;
    DB.kapitel = null; DB.uk_titel = null;
    DB.offset = 0; refresh();
  };
  // Bücher laden (gecacht pro Fach)
  function populateBuchSel(books) {
    books.forEach(function(b) {
      var o = document.createElement('option');
      o.value = b; o.textContent = b;
      if (DB.quelle_name === b) o.selected = true;
      buchSel.appendChild(o);
    });
    if (DB.quelle_name) buchSel.value = DB.quelle_name;
  }
  if (fach) {
    if (_buchCache[fach] && _buchCache[fach].length) {
      populateBuchSel(_buchCache[fach]);
    } else {
      sbSelect('inhalte', { select: 'quelle_name', filters: { fach: fach }, limit: 5000, order: 'quelle_name' })
        .then(function(rows) {
          var seen = {}, books = [];
          rows.forEach(function(r) { if (r.quelle_name && !seen[r.quelle_name]) { seen[r.quelle_name] = true; books.push(r.quelle_name); } });
          books.sort();
          _buchCache[fach] = books.length ? books : null;
          populateBuchSel(books);
        });
    }
  }
  bar.appendChild(buchSel);

  // Kapitel-Dropdown (nur wenn Werk gewählt)
  if (DB.quelle_name && fach) {
    var kapSel = document.createElement('select');
    kapSel.className = 'db-filter-sel';
    var kapDef = document.createElement('option'); kapDef.value = ''; kapDef.textContent = 'Kapitel';
    kapSel.appendChild(kapDef);
    kapSel.onchange = function() {
      DB.kapitel = kapSel.value || null; DB.uk_titel = null; DB.seite = null; DB.offset = 0; refresh();
    };
    sbSelect('inhalte', { select: 'kapitel', filters: { fach: fach, quelle_name: DB.quelle_name }, limit: 1000 })
      .then(function(rows) {
        var seen = {}, kaps = [];
        rows.forEach(function(r) { if (r.kapitel && !seen[r.kapitel]) { seen[r.kapitel] = true; kaps.push(r.kapitel); } });
        kaps.sort();
        kaps.forEach(function(k) {
          var o = document.createElement('option'); o.value = k; o.textContent = k;
          if (DB.kapitel === k) o.selected = true;
          kapSel.appendChild(o);
        });
      });
    bar.appendChild(kapSel);
  }

  // Unterkapitel-Dropdown (nur wenn Kapitel gewählt)
  if (DB.kapitel && fach) {
    var ukSel = document.createElement('select');
    ukSel.className = 'db-filter-sel';
    var ukDef = document.createElement('option'); ukDef.value = ''; ukDef.textContent = 'Unterkapitel';
    ukSel.appendChild(ukDef);
    ukSel.onchange = function() {
      DB.uk_titel = ukSel.value || null; DB.seite = null; DB.offset = 0; refresh();
    };
    sbSelect('inhalte', { select: 'uk_titel', filters: { fach: fach, quelle_name: DB.quelle_name, kapitel: DB.kapitel }, limit: 500 })
      .then(function(rows) {
        var seen = {}, uks = [];
        rows.forEach(function(r) { if (r.uk_titel && !seen[r.uk_titel]) { seen[r.uk_titel] = true; uks.push(r.uk_titel); } });
        uks.sort();
        uks.forEach(function(u) {
          var o = document.createElement('option'); o.value = u; o.textContent = u;
          if (DB.uk_titel === u) o.selected = true;
          ukSel.appendChild(o);
        });
        if (!uks.length) ukSel.style.display = 'none'; // verstecken wenn keine Unterkapitel vorhanden
      });
    bar.appendChild(ukSel);
  }

  // Herkunft-Chips (Schulbuch ist die Standardansicht → kein eigener Chip)
  var herkGroup = mk('div', 'db-filter-group');
  ['handreichung', 'aufgabenpool', 'materialset', 'eigenmaterial'].forEach(function(hk) {
    var meta = HERKUNFT[hk];
    var active = DB.quelle_typ === hk;
    var chip = tx('div', 'db-fchip' + (active ? ' on' : ''), meta.icon + ' ' + meta.label);
    if (active) chip.style.cssText = 'background:' + meta.color + '18;color:' + meta.color + ';border-color:' + meta.color + '60;';
    chip.onclick = function() {
      DB.quelle_typ = active ? null : hk;
      DB.quelle_name = null;
      DB.offset = 0; refresh();
    };
    herkGroup.appendChild(chip);
  });
  bar.appendChild(herkGroup);

  bar.appendChild(sep());

  // Anforderungsbereich (NRW AFB I–III)
  bar.appendChild(fchipGroup([
    { val: 'grundlegend',   label: '○ AFB I',   color: SCHW_FARBEN.grundlegend },
    { val: 'standard',      label: '◑ AFB II',  color: SCHW_FARBEN.standard },
    { val: 'anspruchsvoll', label: '● AFB III', color: SCHW_FARBEN.anspruchsvoll },
  ], 'schwierigkeit'));

  bar.appendChild(sep());

  // Aufgabenniveau
  bar.appendChild(fchipGroup([
    { val: 'leicht',  label: '▽ leicht',  color: NIVEAU_FARBEN.leicht },
    { val: 'mittel',  label: '▾ mittel',  color: NIVEAU_FARBEN.mittel },
    { val: 'schwer',  label: '▼ schwer',  color: NIVEAU_FARBEN.schwer },
  ], 'niveau'));

  bar.appendChild(sep());

  // Inhaltstyp
  bar.appendChild(fchipGroup([
    { val: 'aufgabe',         label: '📝 Aufgabe',          color: TYP_FARBEN.aufgabe },
    { val: 'lehrtext',        label: '📖 Lehrtext',         color: TYP_FARBEN.lehrtext },
    { val: 'arbeitsblatt',    label: '📋 Arbeitsblatt',     color: TYP_FARBEN.arbeitsblatt },
    { val: 'loesung',         label: '✅ Lösung',           color: TYP_FARBEN.loesung },
    { val: 'lehrerkommentar', label: '🧑‍🏫 Lehrerkommentar', color: TYP_FARBEN.lehrerkommentar },
    { val: 'lzk',             label: '📝 Lernzielkontrolle',color: TYP_FARBEN.lzk },
  ], 'inhaltstyp'));

  // Filter löschen (nur wenn aktiv)
  var anyActive = DB.quelle_name || DB.quelle_typ || DB.schwierigkeit || DB.niveau || DB.inhaltstyp || DB.umfang || DB.jahrgang || DB.kapitel || DB.uk_titel || DB.seite != null;
  if (anyActive) {
    bar.appendChild(sep());
    const clrBtn = btn('✕ Filter', 'btn btn-ghost btn-sm');
    clrBtn.style.cssText += 'font-size:10.5px;padding:2px 8px;color:var(--tx3);';
    clrBtn.onclick = function() {
      resetFilters();
      refresh();
    };
    bar.appendChild(clrBtn);
  }

  containerEl.appendChild(bar);
}
