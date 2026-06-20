// ── Eintrag-Zeile (Tabellen-Grid) ────────────────────────────────
// groupLabel (optional): bei Einzelaufgaben „Aufgabe N" in Spalte 0,
// damit Nr. und Aufgabentext in einer Zeile stehen (Text bricht um).
function renderRow(a, onSaved, compact, groupLabel) {
  const hMeta = herkunftMeta(a.quelle_typ);
  const hasBuch = hMeta.hasBuch;
  const accentColor = hMeta.color;

  const row = mk('div', 'db-row');
  var isMat = a.quelle_typ === 'materialset' || a.quelle_typ === 'handreichung';
  row.style.background = (!isMat && SCHW_BG[a.schwierigkeit]) || 'transparent';
  row.style.gridTemplateColumns = colTemplate();

  var cells = [];

  var isMatLK = isMat && a.inhaltstyp === 'lehrerkommentar';

  // Zelle 0: Quelle — im compact-Modus nur die Nr
  var src = mk('div', 'db-col-src'); src.dataset.colIdx = 0;
  if (compact) {
    if (groupLabel) {
      if (isMat) {
        // Materialset: [Chip] [Nr] in einer Zeile, Thema darunter
        var matTop = mk('div', 'mat-top-row');
        matTop.style.cssText = 'display:flex;align-items:center;gap:5px;padding:2px 0;';
        if (a.inhaltstyp && !isMatLK) {
          var matTypColor = TYP_FARBEN[a.inhaltstyp] || '#64748b';
          var matChip = tx('span', '', (TYP_ICONS[a.inhaltstyp] ? TYP_ICONS[a.inhaltstyp] + ' ' : '') + (TYP_LABELS[a.inhaltstyp] || a.inhaltstyp));
          matChip.style.cssText = 'flex-shrink:0;font-size:9px;font-weight:700;padding:1px 6px;border-radius:20px;'
            + 'background:' + matTypColor + '18;color:' + matTypColor + ';border:1px solid ' + matTypColor + '38;'
            + 'text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;';
          matTop.appendChild(matChip);
        }
        var matNr = tx('span', '', groupLabel);
        matNr.style.cssText = 'font-weight:700;font-size:12px;color:var(--tx2);letter-spacing:.02em;';
        matTop.appendChild(matNr);
        src.appendChild(matTop);
        if (a.thema) {
          var themaRow = mk('div', '');
          themaRow.style.cssText = 'display:flex;align-items:center;';
          var thmPh = mk('span', '');
          thmPh.style.cssText = 'display:inline-block;font-size:15px;padding:1px 3px;margin-right:4px;flex-shrink:0;visibility:hidden;';
          thmPh.textContent = '▾';
          themaRow.appendChild(thmPh);
          var themaEl = tx('div', '', a.thema);
          themaEl.style.cssText = 'font-size:11px;color:var(--tx3);padding:1px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          themaRow.appendChild(themaEl);
          src.appendChild(themaRow);
        }
      } else {
        // Aufgabe: „Aufgabe N" als Zeilenlabel in Spalte 0
        var glEl = tx('div', '', groupLabel);
        glEl.style.cssText = 'font-weight:700;font-size:12px;color:var(--tx2);letter-spacing:.02em;padding:2px 0;';
        src.appendChild(glEl);
      }
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

  // Typ-Badge — nicht für Aufgaben, nicht für MatLK, nicht für Materialset compact-Zeilen (Chip dort inline in matTop)
  if (a.inhaltstyp && a.inhaltstyp !== 'aufgabe' && !isMatLK && !(isMat && compact)) {
    var typBadge = tx('span', '', (TYP_ICONS[a.inhaltstyp] ? TYP_ICONS[a.inhaltstyp] + ' ' : '') + (TYP_LABELS[a.inhaltstyp] || a.inhaltstyp));
    var typColor = TYP_FARBEN[a.inhaltstyp] || '#64748b';
    typBadge.style.cssText = 'display:inline-block;font-size:9.5px;font-weight:700;padding:1px 7px;border-radius:20px;'
      + 'background:' + typColor + '18;color:' + typColor + ';border:1px solid ' + typColor + '38;'
      + 'text-transform:uppercase;letter-spacing:.06em;';
    src.appendChild(typBadge);
  }

  // Zelle 1: Inhalt
  var mid = mk('div', 'db-col-inhalt'); mid.dataset.colIdx = 1;
  if (!isMatLK) {
    var inhaltText, inhaltLimit;
    if (isMat && a.inhaltstyp === 'arbeitsblatt') {
      // Header-Zeile (groupLabel gesetzt): Aufgabenstellung; Teilaufgaben: eigener inhalt
      inhaltText = (compact && !groupLabel) ? (a.inhalt || '–') : (a.aufgabenstellung || a.inhalt || '–');
      inhaltLimit = groupLabel ? 400 : 80;
    } else if (isMat) {
      // Andere Materialset-Typen: eine Zeile Inhalt
      inhaltText = a.inhalt || a.thema || '–';
      inhaltLimit = 80;
    } else {
      inhaltText = compact ? (a.inhalt || '–') : (a.inhalt || a.thema || a.beschreibung || '–');
      inhaltLimit = groupLabel ? 400 : 150;
    }
    var inhaltCls = 'db-inhalt-text' + (compact && groupLabel ? ' wrap' : '');
    mid.appendChild(tx('div', inhaltCls, inhaltText.replace(/ \| /g, ' · ').slice(0, inhaltLimit)));
    if (!compact && !isMat && a.anforderung) mid.appendChild(tx('div', 'db-anf-text', a.anforderung.slice(0, 120)));
  }
  cells[1] = mid;

  // Zelle 2: Anforderungsbereich + Niveau
  var schwCol = mk('div', 'db-col-schw'); schwCol.dataset.colIdx = 2;
  schwCol.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;';
  if (a.schwierigkeit) schwCol.appendChild(mkChip(a.schwierigkeit, SCHW_FARBEN[a.schwierigkeit] || '#64748b', SCHW_ICONS[a.schwierigkeit] || ''));
  if (a.niveau)        schwCol.appendChild(mkChip(a.niveau, NIVEAU_FARBEN[a.niveau] || '#64748b', NIVEAU_ICONS[a.niveau] || ''));
  if (a.kontext)       schwCol.appendChild(mkChip(KONTEXT_LABELS[a.kontext] || a.kontext, KONTEXT_FARBEN[a.kontext] || '#64748b', ''));
  if (a.unterstuetzung) schwCol.appendChild(mkChip(UNTERSTUETZ_LABELS[a.unterstuetzung] || a.unterstuetzung, UNTERSTUETZ_FARBEN[a.unterstuetzung] || '#64748b', ''));
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

  // Zelle 5: Kapitel — bei Teilaufgaben (compact ohne groupLabel) leer
  var kapCol = mk('div', 'db-col-kap'); kapCol.dataset.colIdx = 5;
  var kapText = (!compact || groupLabel) ? (a.kapitel || '') : '';
  if (kapText) {
    var kapEl = tx('div', 'db-col-kap-text', kapText);
    kapEl.title = kapText;
    kapCol.appendChild(kapEl);
  }
  cells[5] = kapCol;

  // Zelle 6: Unterkapitel — bei Teilaufgaben (compact ohne groupLabel) leer
  var ukCol = mk('div', 'db-col-uk'); ukCol.dataset.colIdx = 6;
  if ((!compact || groupLabel) && a.uk_titel) {
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

// ── Lehrerkommentar-Chip (Materialset) ───────────────────────────
// Hängt einen aufklappbaren Chip an die Inhalt-Zelle einer Tabellenzeile.
// expDiv wird direkt nach rowEl in wrap eingefügt.
function _appendLkChip(rowEl, lks, wrap) {
  var midCell = rowEl.querySelector('[data-col-idx="1"]');
  if (!midCell || !lks.length) return;
  var chip = mk('span', '');
  chip.style.cssText = 'display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:500;'
    + 'background:#faeeda;color:#854f0b;border-radius:4px;padding:2px 7px;cursor:pointer;flex-shrink:0;margin-left:6px;';
  chip.textContent = (TYP_ICONS.lehrerkommentar || '🧑‍🏫') + ' ' + lks.length;
  chip.title = 'Lehrerkommentar anzeigen';
  // Bestehende Kinder in Wrapper packen → Chip daneben in einer Zeile
  var textWrap = mk('div', '');
  textWrap.style.cssText = 'flex:1;min-width:0;';
  while (midCell.firstChild) textWrap.appendChild(midCell.firstChild);
  midCell.appendChild(textWrap);
  midCell.style.cssText = 'display:flex;flex-direction:row;align-items:center;';
  midCell.appendChild(chip);
  var expDiv = mk('div', '');
  expDiv.style.cssText = 'display:none;padding:7px 12px 7px 36px;border-bottom:1px solid var(--bord);'
    + 'background:rgba(180,83,9,.04);';
  lks.forEach(function(lk) {
    var line = mk('div', '');
    line.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:3px 0;font-size:12px;';
    var badge = tx('span', '', 'Lehrerkommentar');
    badge.style.cssText = 'flex-shrink:0;font-size:10px;font-weight:600;background:#faeeda;color:#854f0b;'
      + 'padding:2px 7px;border-radius:4px;white-space:nowrap;';
    var text = tx('span', '', lk.inhalt || lk.aufgabenstellung || lk.thema || '–');
    text.style.cssText = 'color:var(--tx1);line-height:1.4;';
    line.appendChild(badge); line.appendChild(text);
    expDiv.appendChild(line);
  });
  wrap.appendChild(expDiv);
  chip.onclick = function(e) {
    e.stopPropagation();
    var open = expDiv.style.display !== 'none';
    expDiv.style.display = open ? 'none' : 'block';
    chip.style.background = open ? '#faeeda' : '#f5c4b3';
  };
}
