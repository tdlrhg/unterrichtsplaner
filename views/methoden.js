// ── Methodendatenbank ─────────────────────────────────────────────
function viewMethoden() {
  const div = mk('div', '');

  let filterPhase = null;
  let filterSozial = null;
  let filterMat = null;
  let filterText = '';

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Methodendatenbank'));
  left.appendChild(tx('div', 'c-sub', METHDB.length + ' Methoden'));
  hdr.appendChild(left);
  div.appendChild(hdr);

  // ── Filter-Leiste ─────────────────────────────────────────────
  const filterBar = mk('div', 'card');
  filterBar.style.marginBottom = '12px';
  const filterBody = mk('div', 'card-body');
  filterBody.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:10px 14px;';

  const searchInput = mk('input', '');
  searchInput.type = 'text';
  searchInput.placeholder = 'Suchen …';
  searchInput.style.cssText = 'width:100%;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;font-size:13px;outline:none;box-sizing:border-box;';
  searchInput.oninput = () => { filterText = searchInput.value.toLowerCase(); refresh(); };
  filterBody.appendChild(searchInput);

  function chipRow(label, options, getVal, setVal) {
    const row = mk('div', '');
    row.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:wrap;';
    const lbl = tx('span', '', label);
    lbl.style.cssText = 'font-size:11px;color:var(--tx3);min-width:52px;';
    row.appendChild(lbl);
    options.forEach(opt => {
      const c = mk('button', 'meth-filter-chip' + (getVal() === opt ? ' on' : ''));
      c.textContent = opt;
      c.onclick = () => { setVal(getVal() === opt ? null : opt); refresh(); };
      row.appendChild(c);
    });
    return row;
  }

  const pRow = chipRow('Phase', ['Einstieg', 'Erarbeitung', 'Sicherung'], () => filterPhase, v => filterPhase = v);
  const sRow = chipRow('Sozialform', ['Einzelarbeit', 'Partnerarbeit', 'Gruppenarbeit', 'Plenum'], () => filterSozial, v => filterSozial = v);
  const mRow = chipRow('Material', ['Kein Material', 'Texte', 'Karten', 'Arbeitsblätter', 'Experimente', 'Plakate/Papier', 'Bilder/Comics', 'Objekte/Modelle', 'Digitale Medien'], () => filterMat, v => filterMat = v);
  filterBody.appendChild(pRow);
  filterBody.appendChild(sRow);
  filterBody.appendChild(mRow);
  filterBar.appendChild(filterBody);
  div.appendChild(filterBar);

  // ── Ergebnisliste ─────────────────────────────────────────────
  const listWrap = mk('div', 'card');
  div.appendChild(listWrap);

  function refresh() {
    // Filter-Chips aktualisieren
    [pRow, sRow, mRow].forEach(row => {
      row.querySelectorAll('.meth-filter-chip').forEach(c => {
        c.className = 'meth-filter-chip' + (
          c.textContent === filterPhase || c.textContent === filterSozial || c.textContent === filterMat ? ' on' : ''
        );
      });
    });

    const filtered = METHDB.filter(m => {
      if (filterPhase  && !m.phasen.includes(filterPhase))       return false;
      if (filterSozial && !m.sozialform.includes(filterSozial))  return false;
      if (filterMat    && !m.materialtyp.includes(filterMat))    return false;
      if (filterText   && !m.name.toLowerCase().includes(filterText)
                       && !m.beschreibung.toLowerCase().includes(filterText)
                       && !m.ziel.toLowerCase().includes(filterText)) return false;
      return true;
    });

    listWrap.innerHTML = '';

    if (filtered.length === 0) {
      const empty = tx('div', '', 'Keine Methoden gefunden.');
      empty.style.cssText = 'color:var(--tx3);padding:16px;font-size:13px;';
      listWrap.appendChild(empty);
      return;
    }

    filtered.forEach((m, i) => {
      const row = mk('div', 'meth-row');
      if (i < filtered.length - 1) row.classList.add('meth-row-sep');

      // Kopfzeile: Name + Chips
      const top = mk('div', 'meth-row-top');
      const name = tx('span', 'meth-row-name', m.name);
      top.appendChild(name);

      const chips = mk('div', 'meth-row-chips');
      m.phasen.forEach(p => {
        const c = tx('span', 'meth-chip meth-chip-phase', p);
        chips.appendChild(c);
      });
      m.sozialform.forEach(s => {
        const c = tx('span', 'meth-chip meth-chip-soz', s);
        chips.appendChild(c);
      });
      m.materialtyp.forEach(mt => {
        if (mt !== 'Kein Material') {
          const c = tx('span', 'meth-chip meth-chip-mat', mt);
          chips.appendChild(c);
        }
      });
      top.appendChild(chips);
      row.appendChild(top);

      // Beschreibung
      const desc = tx('div', 'meth-row-desc', m.beschreibung);
      row.appendChild(desc);

      // Ausklappbare Details
      const details = mk('details', '');
      const summary = mk('summary', '');
      summary.textContent = 'Ziel & Hinweise';
      summary.style.cssText = 'font-size:11px;color:var(--tx3);cursor:pointer;margin-top:4px;';
      details.appendChild(summary);

      const detBody = mk('div', '');
      detBody.style.cssText = 'margin-top:5px;font-size:12px;color:var(--tx2);display:flex;flex-direction:column;gap:3px;';
      if (m.zeitbedarf && m.zeitbedarf !== 'variabel') detBody.appendChild(tx('div', '', '⏱ ' + m.zeitbedarf));
      if (m.ziel) detBody.appendChild(tx('div', '', '🎯 ' + m.ziel));
      if (m.hinweise) detBody.appendChild(tx('div', '', '💡 ' + m.hinweise));
      const ql = mk('a', '');
      ql.href = m.quelle; ql.target = '_blank';
      ql.textContent = '↗ Methodenkartei';
      ql.style.cssText = 'font-size:11px;color:var(--pri);';
      detBody.appendChild(ql);
      details.appendChild(detBody);
      row.appendChild(details);

      listWrap.appendChild(row);
    });
  }

  refresh();
  return div;
}
