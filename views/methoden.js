// ── Methodendatenbank ─────────────────────────────────────────────
function viewMethoden() {
  const div = mk('div', '');

  let filterPhase = null;
  let filterSozial = null;
  let filterMat = null;
  let filterAufwand = null;
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
      const c = mk('button', 'meth-filter-chip' + (getVal() === opt.val ? ' on' : ''));
      c.textContent = opt.label;
      c.onclick = () => { setVal(getVal() === opt.val ? null : opt.val); refresh(); };
      row.appendChild(c);
    });
    return row;
  }

  const pRow = chipRow('Phase',
    ['Einstieg','Erarbeitung','Sicherung'].map(v => ({val:v,label:v})),
    () => filterPhase, v => filterPhase = v);
  const sRow = chipRow('Sozialform',
    ['Einzelarbeit','Partnerarbeit','Gruppenarbeit','Plenum'].map(v => ({val:v,label:v})),
    () => filterSozial, v => filterSozial = v);
  const mRow = chipRow('Material',
    ['Kein Material','Texte','Karten','Arbeitsblätter','Experimente','Plakate/Papier','Bilder/Comics','Objekte/Modelle','Digitale Medien'].map(v => ({val:v,label:v})),
    () => filterMat, v => filterMat = v);
  const aRow = chipRow('Aufwand',
    [{val:1,label:'● gering'},{val:2,label:'●● mittel'},{val:3,label:'●●● hoch'},{val:4,label:'●●●● sehr hoch'}],
    () => filterAufwand, v => filterAufwand = v);

  filterBody.appendChild(pRow);
  filterBody.appendChild(sRow);
  filterBody.appendChild(mRow);
  filterBody.appendChild(aRow);
  filterBar.appendChild(filterBody);
  div.appendChild(filterBar);

  // ── Ergebniszähler + Grid ─────────────────────────────────────
  const countLine = tx('div', '', '');
  countLine.style.cssText = 'font-size:11px;color:var(--tx3);margin-bottom:6px;';
  div.appendChild(countLine);

  const listWrap = mk('div', 'meth-grid');
  div.appendChild(listWrap);

  const AUFWAND_LABEL = ['', '● gering', '●● mittel', '●●● hoch', '●●●● sehr hoch'];
  const AUFWAND_COLOR = ['', '#16a34a', '#eab308', '#f97316', '#dc2626'];

  function refresh() {
    [pRow, sRow, mRow, aRow].forEach(row => {
      row.querySelectorAll('.meth-filter-chip').forEach(c => {
        const isOn = c.textContent === filterPhase
          || c.textContent === filterSozial
          || c.textContent === filterMat
          || (filterAufwand !== null && c.textContent === AUFWAND_LABEL[filterAufwand]);
        c.className = 'meth-filter-chip' + (isOn ? ' on' : '');
      });
    });

    const filtered = [...METHDB].sort((a, b) => a.name.localeCompare(b.name, 'de')).filter(m => {
      if (filterPhase   && !m.phasen.includes(filterPhase))       return false;
      if (filterSozial  && !m.sozialform.includes(filterSozial))  return false;
      if (filterMat     && !m.materialtyp.includes(filterMat))    return false;
      if (filterAufwand && m.aufwand !== filterAufwand)           return false;
      if (filterText    && !m.name.toLowerCase().includes(filterText)
                        && !m.beschreibung.toLowerCase().includes(filterText)
                        && !m.ziel.toLowerCase().includes(filterText)) return false;
      return true;
    });

    countLine.textContent = filtered.length + ' Methoden';
    listWrap.innerHTML = '';

    if (filtered.length === 0) {
      const empty = tx('div', '', 'Keine Methoden gefunden.');
      empty.style.cssText = 'color:var(--tx3);font-size:13px;grid-column:1/-1;padding:8px 0;';
      listWrap.appendChild(empty);
      return;
    }

    filtered.forEach(m => {
      const card = mk('div', 'meth-card');

      // Name + Aufwand-Indikator
      const nameRow = mk('div', '');
      nameRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;';
      nameRow.appendChild(tx('div', 'meth-card-name', m.name));
      if (m.aufwand) {
        const aw = mk('span', 'meth-aufwand');
        for (let i = 1; i <= 4; i++) {
          const dot = tx('span', 'meth-aufwand-dot', '●');
          dot.style.color = i <= m.aufwand ? AUFWAND_COLOR[m.aufwand] : 'var(--bord)';
          aw.appendChild(dot);
        }
        nameRow.appendChild(aw);
      }
      card.appendChild(nameRow);

      const chips = mk('div', 'meth-card-chips');
      m.phasen.forEach(p => chips.appendChild(tx('span', 'meth-chip meth-chip-phase', p)));
      const SOZ_ABK = { 'Einzelarbeit':'EA', 'Partnerarbeit':'PA', 'Gruppenarbeit':'GA', 'Plenum':'PL' };
      m.sozialform.forEach(s => chips.appendChild(tx('span', 'meth-chip meth-chip-soz', SOZ_ABK[s] || s)));
      m.materialtyp.forEach(mt => {
        if (mt !== 'Kein Material') chips.appendChild(tx('span', 'meth-chip meth-chip-mat', mt));
      });
      card.appendChild(chips);

      card.appendChild(tx('div', 'meth-card-desc', m.beschreibung));

      const details = mk('details', '');
      const summary = mk('summary', '');
      summary.textContent = 'Ziel & Hinweise';
      details.appendChild(summary);
      const detBody = mk('div', 'meth-card-det');
      if (m.zeitbedarf && m.zeitbedarf !== 'variabel') detBody.appendChild(tx('div', '', '⏱ ' + m.zeitbedarf));
      if (m.ziel) detBody.appendChild(tx('div', '', '🎯 ' + m.ziel));
      if (m.hinweise) detBody.appendChild(tx('div', '', '💡 ' + m.hinweise));
      const ql = mk('a', '');
      ql.href = m.quelle; ql.target = '_blank';
      ql.textContent = '↗ Methodenkartei';
      ql.style.cssText = 'font-size:11px;color:var(--pri);';
      detBody.appendChild(ql);
      details.appendChild(detBody);
      card.appendChild(details);

      listWrap.appendChild(card);
    });
  }

  refresh();
  return div;
}
