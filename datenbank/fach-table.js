// ── Tabellen-Header mit Resize + Drag-Reorder ─────────────────────
var _colDragFromPos = null;

function buildTableHead(onSortChange) {
  const head = mk('div', 'db-table-head');
  head.style.gridTemplateColumns = colTemplate();

  // Select-all checkbox
  var selAllHdrCell = mk('div', 'db-col-hdr db-col-sel');
  var selAllChkEl = document.createElement('input');
  selAllChkEl.type = 'checkbox';
  selAllChkEl.dataset.selall = '1';
  selAllChkEl.title = 'Alle auswählen / abwählen';
  selAllChkEl.style.cssText = 'cursor:pointer;accent-color:var(--pri);width:14px;height:14px;';
  selAllChkEl.addEventListener('change', function() {
    if (selAllChkEl.checked) {
      _selLoadGrps.forEach(function(g) { _selGroups[g.gruppen_key] = g; });
    } else {
      _selGroups = {};
    }
    _syncSel();
  });
  selAllHdrCell.appendChild(selAllChkEl);
  head.appendChild(selAllHdrCell);

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

    // ── Resize-Handle ─────────────────────────────────────────────
    {
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
  var selCell = rowEl.querySelector('[data-sel-cell]');
  var cellMap = {};
  Array.from(rowEl.children).forEach(function(cell) {
    var idx = cell.dataset.colIdx;
    if (idx !== undefined) cellMap[idx] = cell;
  });
  while (rowEl.firstChild) rowEl.removeChild(rowEl.firstChild);
  if (selCell) rowEl.appendChild(selCell);
  visibleCols().forEach(function(colIdx) {
    if (cellMap[colIdx]) rowEl.appendChild(cellMap[colIdx]);
  });
  rowEl.style.gridTemplateColumns = colTemplate();
}
