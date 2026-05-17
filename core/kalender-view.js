// ── Kalender-Ansicht ─────────────────────────────────────────────
function viewKalender() {
  const div = mk('div', '');
  const hdr = mk('div', 'c-hdr');
  hdr.appendChild(tx('div', 'c-title', 'Kalender & Stundenplan'));
  div.appendChild(hdr);

  const kal = S.data.kalender || {};
  const schuljahr = kal.schuljahr || '2025/26';
  const ausfalltage = kal.ausfalltage || [];
  const einzelAusfaelle = kal.einzelAusfaelle || [];

  // ── Schuljahr wählen ─────────────────────────────────────────
  // Schuljahr-Auswahl kompakt in Header
  const sjRow = mk('div', '');
  sjRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:16px;';
  sjRow.appendChild(tx('span', '', 'Schuljahr:'));
  sjRow.firstChild.style.cssText = 'font-size:13px;font-weight:700;color:var(--tx2);';
  const sjSel = document.createElement('select');
  sjSel.className = 'finp'; sjSel.style.cssText = 'width:120px;padding:5px 8px;';
  ['2025/26', '2026/27'].forEach(sj => {
    const o = document.createElement('option');
    o.value = sj; o.textContent = sj;
    if (sj === schuljahr) o.selected = true;
    sjSel.appendChild(o);
  });
  sjSel.onchange = e => {
    if (!S.data.kalender) S.data.kalender = {};
    S.data.kalender.schuljahr = e.target.value;
    scheduleSave(); render();
  };
  sjRow.appendChild(sjSel);
  div.appendChild(sjRow);

  // ── Ferienübersicht ──────────────────────────────────────────


  // ── Schulweite Ausfalltage (Mini-Kalender) ──────────────────
  const ausCard = mk('div', 'card');
  ausCard.appendChild(cardHdr('Schulweite Ausfalltage – Klick zum Markieren'));
  const ausb = mk('div', 'card-body');

  // Schuljahr-Monate bestimmen
  const sjStart = schuljahr === '2025/26' ? new Date(Date.UTC(2025, 7, 1)) : new Date(Date.UTC(2026, 7, 1));
  const sjEnd   = schuljahr === '2025/26' ? new Date(Date.UTC(2026, 6, 31)) : new Date(Date.UTC(2027, 6, 31));

  const MONATE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const ferienSet = new Set();
  (NRW_FERIEN[schuljahr] || []).forEach(f => {
    const cur = strToDate(f.von);
    const end2 = strToDate(f.bis);
    while (cur <= end2) { ferienSet.add(dateToStr(cur)); cur.setDate(cur.getDate()+1); }
  });
  const ftSet = new Set(NRW_FEIERTAGE[schuljahr] || []);
  const ausSet = new Set(ausfalltage);

  const kalGrid = mk('div', '');
  kalGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;';

  // Alle Monate des Schuljahres
  const months = [];
  const cur2 = new Date(Date.UTC(sjStart.getFullYear(), sjStart.getMonth(), 1));
  while (cur2 <= sjEnd) {
    months.push(new Date(cur2));
    cur2.setMonth(cur2.getMonth() + 1);
  }

  months.forEach(mDate => {
    const mDiv = mk('div', '');
    mDiv.style.cssText = 'border:1px solid var(--bord);border-radius:8px;overflow:hidden;';

    const mHdr = mk('div', '');
    mHdr.style.cssText = 'background:var(--pri);color:white;padding:6px 10px;font-size:12px;font-weight:700;';
    mHdr.textContent = MONATE[mDate.getMonth()] + ' ' + mDate.getFullYear();
    mDiv.appendChild(mHdr);

    const grid = mk('div', '');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:2px;padding:6px;background:var(--surf2);';

    // Wochentag-Header (mit KW-Spalte)
    ['KW','Mo','Di','Mi','Do','Fr','Sa','So'].forEach(d => {
      const h = tx('div', '', d);
      h.style.cssText = 'text-align:center;font-size:10px;font-weight:700;color:var(--tx3);padding:2px;';
      grid.appendChild(h);
    });
    grid.style.gridTemplateColumns = 'repeat(8, 1fr)';

    // Erster Wochentag des Monats
    let firstDow = mDate.getUTCDay(); // 0=So
    firstDow = firstDow === 0 ? 6 : firstDow - 1; // Mo=0

    // Leere Zellen (KW-Spalte + Wochentage)
    // Erst KW-Zelle für erste Zeile
    if (firstDow > 0) {
      const kwEmpty = mk('div', '');
      grid.appendChild(kwEmpty);
    }
    for (let i = 0; i < firstDow; i++) {
      const empty = mk('div', '');
      grid.appendChild(empty);
    }

    const daysInMonth = new Date(Date.UTC(mDate.getFullYear(), mDate.getMonth() + 1, 0)).getUTCDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(Date.UTC(mDate.getFullYear(), mDate.getMonth(), day));
      const ds = dateToStr(d);
      const dw = d.getUTCDay();
      const isWE = dw === 0 || dw === 6;
      const isFerien = ferienSet.has(ds);
      const isFT = ftSet.has(ds);
      const isAusfall = ausSet.has(ds);
      const isSchule = !isWE && !isFerien && !isFT;

      // KW-Label am Montag
      if (dw === 1) {
        const kwCell = mk('div', '');
        kwCell.textContent = getKW(d);
        kwCell.style.cssText = 'text-align:center;font-size:9px;color:var(--tx3);padding:3px 2px;font-weight:700;';
        grid.appendChild(kwCell);
      }
      // Leere KW-Zelle für erste Zeile wenn Monat nicht mit Montag beginnt
      // (wird über firstDow-Logik gehandelt)

      const cell = mk('div', '');
      cell.textContent = day;
      cell.style.cssText = `
        text-align:center;font-size:11px;padding:3px 2px;border-radius:4px;
        cursor:${isSchule ? 'pointer' : 'default'};
        font-weight:${isAusfall ? '700' : 'normal'};
        background:${isAusfall ? '#fca5a5' : isFerien || isFT ? '#e5e7eb' : isWE ? 'transparent' : 'white'};
        color:${isAusfall ? '#dc2626' : isFerien || isFT ? '#9ca3af' : isWE ? '#d1d5db' : 'var(--tx)'};
        border:${isAusfall ? '1px solid #f87171' : '1px solid transparent'};
      `;
      const grund = (kal.ausfalltageGruende || {})[ds];
      if (isAusfall && grund) cell.title = grund;
      if (isFerien) {
        const fer = (NRW_FERIEN[schuljahr] || []).find(f => ds >= f.von && ds <= f.bis);
        if (fer) cell.title = fer.name + ' (' + fer.von + ' – ' + fer.bis + ')';
      }
      if (isFT) cell.title = 'Gesetzlicher Feiertag';

      if (isSchule) {
        cell.onclick = () => {
          S.modal = { type: 'tagPanel', data: { datum: ds, isAusfall: ausSet.has(ds) } };
          render();
        };
        if (!isAusfall) {
          cell.onmouseenter = () => { cell.style.background = '#dbeafe'; };
          cell.onmouseleave = () => { cell.style.background = 'white'; };
        }
      }
      grid.appendChild(cell);
    }

    mDiv.appendChild(grid);

    // Legende unter dem Monat
    const leg = mk('div', '');
    const ausInMonth = ausfalltage.filter(t => t.startsWith(dateToStr(mDate).slice(0,7)));
    if (ausInMonth.length > 0) {
      leg.style.cssText = 'padding:4px 8px;font-size:11px;color:#dc2626;background:#fff5f5;border-top:1px solid #fecaca;';
      leg.textContent = ausInMonth.length + ' Ausfalltag' + (ausInMonth.length !== 1 ? 'e' : '');
    }
    mDiv.appendChild(leg);
    kalGrid.appendChild(mDiv);
  });

  ausb.appendChild(kalGrid);

  // Liste der Ausfalltage darunter
  if (ausfalltage.length > 0) {
    const listTitle = tx('div', '', 'Markierte Ausfalltage:');
    listTitle.style.cssText = 'font-weight:700;font-size:13px;margin-top:16px;margin-bottom:8px;color:var(--pri);';
    ausb.appendChild(listTitle);
    const chips = mk('div', '');
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    [...ausfalltage].sort().forEach(tag => {
      const chip = mk('div', '');
      chip.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 10px;background:#fee2e2;border:1px solid #fca5a5;border-radius:20px;font-size:12px;color:#dc2626;';
      const grund = (kal.ausfalltageGruende || {})[tag];
      chip.appendChild(tx('span', '', tag + (grund ? ' · ' + grund : '')));
      const del = mk('button', '');
      del.textContent = '✕'; del.style.cssText = 'border:none;background:none;cursor:pointer;color:#dc2626;font-size:11px;padding:0;';
      del.onclick = () => {
        S.data.kalender.ausfalltage = S.data.kalender.ausfalltage.filter(t => t !== tag);
        if (S.data.kalender.ausfalltageGruende) delete S.data.kalender.ausfalltageGruende[tag];
        scheduleSave(); render();
      };
      chip.appendChild(del);
      chips.appendChild(chip);
    });
    ausb.appendChild(chips);
  }

  ausCard.appendChild(ausb);
  div.appendChild(ausCard);

  // ── Stundenplan als Raster ───────────────────────────────────
  const spCard = mk('div', 'card');
  spCard.appendChild(cardHdr('Stundenplan'));
  const spb = mk('div', 'card-body');
  spb.style.overflowX = 'auto';

  const hatAB = (S.data.kurse || []).some(k =>
    (k.stundenplan || []).some(s => s.kwTyp && s.kwTyp !== 'beide')
  );

  const STUNDEN9 = ['1','2','3','4','5','6','7','8','9'];
  const TAGE = ['Mo','Di','Mi','Do','Fr'];

  const tbl = document.createElement('table');
  tbl.style.cssText = 'border-collapse:collapse;width:100%;min-width:500px;';

  const thead = document.createElement('thead');
  const hrow = document.createElement('tr');
  const thE = document.createElement('th');
  thE.style.cssText = 'width:36px;';
  hrow.appendChild(thE);
  TAGE.forEach(tag => {
    const th = document.createElement('th');
    th.textContent = tag;
    th.style.cssText = 'padding:8px 4px;text-align:center;font-size:13px;font-weight:700;color:var(--pri);border-bottom:2px solid var(--bord);min-width:110px;';
    hrow.appendChild(th);
  });
  thead.appendChild(hrow);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');
  STUNDEN9.forEach(std => {
    const tr = document.createElement('tr');
    const tdL = document.createElement('td');
    tdL.textContent = std + '.';
    tdL.style.cssText = 'padding:4px 6px;font-size:11px;font-weight:700;color:var(--tx3);text-align:center;border-right:1px solid var(--bord);vertical-align:top;padding-top:10px;';
    tr.appendChild(tdL);

    TAGE.forEach(tag => {
      const td = document.createElement('td');
      td.style.cssText = 'padding:3px;vertical-align:top;border:1px solid var(--surf2);';

      const slotsHier = (S.data.kurse || []).flatMap(kurs =>
        (kurs.stundenplan || [])
          .filter(s => s.tag === tag && s.stunde === std)
          .map(s => ({ kurs, slot: s }))
      );

      slotsHier.forEach(({ kurs, slot }) => {
        const fp = getFachplanung(kurs.fachplanungId);
        const isAB = slot.kwTyp && slot.kwTyp !== 'beide';
        const chip = mk('div', '');
        chip.style.cssText = 'padding:4px 6px;border-radius:5px;margin-bottom:2px;font-size:11px;cursor:pointer;background:' + (isAB ? '#fef3c7' : '#dbeafe') + ';border:1px solid ' + (isAB ? '#fde68a' : '#bfdbfe') + ';';
        const lbl = mk('div', '');
        lbl.style.cssText = 'font-weight:700;color:var(--pri);';
        lbl.textContent = kurs.klasse + (fp ? ' · ' + fachLabel(fp.fach) : '');
        chip.appendChild(lbl);
        if (hatAB && isAB) {
          const kwL = tx('div', '', slot.kwTyp === 'gerade' ? 'Gerade KW' : 'Ungerade KW');
          kwL.style.cssText = 'font-size:10px;color:#92400e;';
          chip.appendChild(kwL);
        }
        chip.onclick = () => { S.modal = { type: 'editSlot', data: { kurs, slot } }; render(); };
        td.appendChild(chip);
      });

      const addBtn = mk('div', '');
      addBtn.style.cssText = 'width:100%;min-height:28px;border-radius:4px;cursor:pointer;opacity:0;transition:opacity .15s;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--tx3);';
      addBtn.textContent = '+';
      addBtn.onmouseenter = () => { addBtn.style.opacity = '1'; addBtn.style.background = 'var(--surf2)'; };
      addBtn.onmouseleave = () => { addBtn.style.opacity = '0'; addBtn.style.background = ''; };
      addBtn.onclick = () => { S.modal = { type: 'addSlot', data: { tag, stunde: std } }; render(); };
      td.appendChild(addBtn);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  spb.appendChild(tbl);



  spCard.appendChild(spb);
  div.appendChild(spCard);

  return div;
}
