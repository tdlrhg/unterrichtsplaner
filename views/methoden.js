// ── Methodendatenbank ─────────────────────────────────────────────
function viewMethoden() {
  const div = mk('div', '');

  // Filter-State (lokal, kein Re-render des ganzen App)
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

  // ── Suche + Filter ────────────────────────────────────────────
  const filterCard = mk('div', 'card');
  filterCard.style.marginBottom = '12px';
  const filterBody = mk('div', 'card-body');
  filterBody.style.display = 'flex';
  filterBody.style.flexDirection = 'column';
  filterBody.style.gap = '10px';

  // Suchfeld
  const searchWrap = mk('div', '');
  const searchInput = mk('input', '');
  searchInput.type = 'text';
  searchInput.placeholder = 'Methode suchen …';
  searchInput.style.cssText = 'width:100%;padding:7px 10px;border:1px solid var(--bdr);border-radius:6px;font-size:14px;outline:none;';
  searchInput.oninput = () => { filterText = searchInput.value.toLowerCase(); refresh(); };
  searchWrap.appendChild(searchInput);
  filterBody.appendChild(searchWrap);

  function filterRow(label, options, getter, setter) {
    const row = mk('div', '');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
    row.appendChild(tx('span', '', label + ':'));
    (row.lastChild).style.cssText = 'font-size:12px;color:var(--tx3);white-space:nowrap;min-width:60px;';
    options.forEach(opt => {
      const chip = mk('button', 'pr-chip' + (getter() === opt ? ' active' : ''));
      chip.textContent = opt;
      chip.onclick = () => { setter(getter() === opt ? null : opt); refresh(); };
      row.appendChild(chip);
    });
    return row;
  }

  const phasenRow = filterRow('Phase',
    ['Einstieg', 'Erarbeitung', 'Sicherung'],
    () => filterPhase, v => { filterPhase = v; }
  );
  const sozialRow = filterRow('Sozialform',
    ['Einzelarbeit', 'Partnerarbeit', 'Gruppenarbeit', 'Plenum'],
    () => filterSozial, v => { filterSozial = v; }
  );
  const matRow = filterRow('Material',
    ['Kein Material', 'Texte', 'Karten', 'Arbeitsblätter', 'Experimente', 'Plakate/Papier', 'Bilder/Comics', 'Objekte/Modelle', 'Digitale Medien'],
    () => filterMat, v => { filterMat = v; }
  );
  filterBody.appendChild(phasenRow);
  filterBody.appendChild(sozialRow);
  filterBody.appendChild(matRow);
  filterCard.appendChild(filterBody);
  div.appendChild(filterCard);

  // ── Ergebnisliste ─────────────────────────────────────────────
  const listWrap = mk('div', '');
  div.appendChild(listWrap);

  function refresh() {
    // Filter-Chips neu rendern
    [phasenRow, sozialRow, matRow].forEach(row => {
      Array.from(row.querySelectorAll('.pr-chip')).forEach(chip => {
        chip.className = 'pr-chip' + (
          chip.textContent === filterPhase ||
          chip.textContent === filterSozial ||
          chip.textContent === filterMat ? ' active' : ''
        );
      });
    });

    // Gefilterte Methoden
    const filtered = METHDB.filter(m => {
      if (filterPhase && !m.phasen.includes(filterPhase)) return false;
      if (filterSozial && !m.sozialform.includes(filterSozial)) return false;
      if (filterMat && !m.materialtyp.includes(filterMat)) return false;
      if (filterText && !m.name.toLowerCase().includes(filterText) && !m.beschreibung.toLowerCase().includes(filterText) && !m.ziel.toLowerCase().includes(filterText)) return false;
      return true;
    });

    listWrap.innerHTML = '';

    if (filtered.length === 0) {
      const empty = tx('div', '', 'Keine Methoden gefunden.');
      empty.style.cssText = 'color:var(--tx3);padding:20px;text-align:center;';
      listWrap.appendChild(empty);
      return;
    }

    filtered.forEach(m => {
      const card = mk('div', 'card');
      card.style.marginBottom = '8px';
      const body = mk('div', 'card-body');

      // Name + Quelle
      const titleRow = mk('div', '');
      titleRow.style.cssText = 'display:flex;align-items:baseline;gap:8px;margin-bottom:4px;';
      const nameEl = tx('strong', '', m.name);
      nameEl.style.fontSize = '15px';
      titleRow.appendChild(nameEl);
      const quelle = mk('a', '');
      quelle.href = m.quelle;
      quelle.target = '_blank';
      quelle.textContent = '↗';
      quelle.style.cssText = 'font-size:12px;color:var(--pri);text-decoration:none;';
      titleRow.appendChild(quelle);
      body.appendChild(titleRow);

      // Beschreibung
      body.appendChild(tx('div', '', m.beschreibung));
      (body.lastChild).style.cssText = 'font-size:13px;color:var(--tx2);margin-bottom:8px;';

      // Chips
      const chips = mk('div', '');
      chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';

      m.phasen.forEach(p => {
        const c = tx('span', 'pr-chip active', p);
        c.style.cssText += ';cursor:default;font-size:11px;padding:2px 7px;';
        chips.appendChild(c);
      });
      m.sozialform.forEach(s => {
        const c = tx('span', '', s);
        c.style.cssText = 'background:var(--surf2);border-radius:10px;font-size:11px;padding:2px 7px;color:var(--tx2);';
        chips.appendChild(c);
      });
      m.materialtyp.forEach(mt => {
        const c = tx('span', '', mt);
        c.style.cssText = 'background:#fef3c7;border-radius:10px;font-size:11px;padding:2px 7px;color:#92400e;';
        chips.appendChild(c);
      });
      body.appendChild(chips);

      // Zeitbedarf + Hinweise (ausklappbar)
      const details = mk('details', '');
      details.style.marginTop = '8px';
      const summary = mk('summary', '');
      summary.textContent = 'Details';
      summary.style.cssText = 'font-size:12px;color:var(--tx3);cursor:pointer;';
      details.appendChild(summary);

      const detBody = mk('div', '');
      detBody.style.cssText = 'margin-top:6px;font-size:12px;color:var(--tx2);display:flex;flex-direction:column;gap:4px;';
      if (m.zeitbedarf) detBody.appendChild(tx('div', '', '⏱ ' + m.zeitbedarf));
      if (m.ziel) detBody.appendChild(tx('div', '', '🎯 ' + m.ziel));
      if (m.hinweise) detBody.appendChild(tx('div', '', '💡 ' + m.hinweise));
      details.appendChild(detBody);
      body.appendChild(details);

      card.appendChild(body);
      listWrap.appendChild(card);
    });
  }

  refresh();
  return div;
}
