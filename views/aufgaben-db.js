// ── Aufgaben-Datenbank ────────────────────────────────────────────

function viewAufgabenDB() {
  const div = mk('div', '');

  // ── Header ────────────────────────────────────────────────────
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Aufgaben-Datenbank'));
  const subT = tx('div', 'c-sub', '');
  left.appendChild(subT);
  hdr.appendChild(left);
  div.appendChild(hdr);

  // ── Filter + Suche ────────────────────────────────────────────
  const filterBar = mk('div', '');
  filterBar.style.cssText = 'padding:12px 16px 8px;display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--bord);';

  const searchInp = document.createElement('input');
  searchInp.type = 'text';
  searchInp.className = 'finp';
  searchInp.placeholder = '🔍 Volltextsuche in Aufgaben und Themen…';
  filterBar.appendChild(searchInp);

  const chipBar = mk('div', '');
  chipBar.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;align-items:center;';

  let filterFach = '', filterOperator = '', filterSchwierigkeit = '', filterUmfang = '';

  function chipGroup(options, getVal, setVal) {
    const group = mk('div', '');
    group.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;';
    const render = () => {
      group.innerHTML = '';
      [['', 'Alle'], ...options].forEach(([val, lbl]) => {
        const active = getVal() === val;
        const b = btn(lbl, 'btn btn-xs ' + (active ? 'btn-pri' : 'btn-ghost'));
        b.onclick = () => { setVal(val); renderChips(); refresh(); };
        group.appendChild(b);
      });
    };
    group._render = render;
    render();
    return group;
  }

  const fachGroup = chipGroup(
    [['mathe','📐 Mathe'],['bio','🌿 Bio'],['chemie','🧪 Chemie']],
    () => filterFach, v => { filterFach = v; }
  );
  const opGroup = chipGroup(
    [['berechnen','berechnen'],['begründen','begründen'],['erklären','erklären'],
     ['zeichnen','zeichnen'],['messen','messen'],['konstruieren','konstruieren'],
     ['beschreiben','beschreiben'],['vergleichen','vergleichen'],['ausfüllen','ausfüllen'],['MC','MC']],
    () => filterOperator, v => { filterOperator = v; }
  );
  const schwGroup = chipGroup(
    [['grundlegend','grundlegend'],['standard','standard'],['anspruchsvoll','anspruchsvoll']],
    () => filterSchwierigkeit, v => { filterSchwierigkeit = v; }
  );
  const umfangGroup = chipGroup(
    [['kurz','kurz'],['mittel','mittel'],['lang','lang']],
    () => filterUmfang, v => { filterUmfang = v; }
  );

  function renderChips() {
    [fachGroup, opGroup, schwGroup, umfangGroup].forEach(g => g._render());
  }

  function labelRow(label, group) {
    const row = mk('div', '');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
    const l = tx('span', '', label);
    l.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;min-width:60px;';
    row.appendChild(l);
    row.appendChild(group);
    return row;
  }

  chipBar.appendChild(labelRow('Fach', fachGroup));
  chipBar.appendChild(labelRow('Operator', opGroup));
  chipBar.appendChild(labelRow('Schwierigkeit', schwGroup));
  chipBar.appendChild(labelRow('Umfang', umfangGroup));
  filterBar.appendChild(chipBar);
  div.appendChild(filterBar);

  // ── Ergebnis-Bereich ──────────────────────────────────────────
  const resultsWrap = mk('div', '');
  resultsWrap.style.cssText = 'padding:12px 16px;display:flex;flex-direction:column;gap:8px;';
  div.appendChild(resultsWrap);

  const LIMIT = 30;
  let offset = 0;
  let isLoading = false;
  let hasMore = true;

  const OP_FARBE = {
    berechnen: '#2563eb', begründen: '#7c3aed', erklären: '#0891b2',
    zeichnen: '#16a34a', messen: '#d97706', konstruieren: '#dc2626',
    beschreiben: '#4f46e5', vergleichen: '#db2777', ausfüllen: '#64748b', MC: '#374151',
  };
  const SCHW_FARBE = { grundlegend: '#16a34a', standard: '#2563eb', anspruchsvoll: '#9d174d' };
  const UMFANG_ICON = { kurz: '⚡', mittel: '⏱', lang: '🕐' };

  function chip(text, color) {
    const c = tx('span', '', text);
    c.style.cssText = `display:inline-block;padding:1px 7px;border-radius:20px;font-size:11px;font-weight:600;background:${color}22;color:${color};white-space:nowrap;`;
    return c;
  }

  function renderKarte(a) {
    const card = mk('div', '');
    card.style.cssText = 'border:1px solid var(--bord);border-radius:8px;padding:10px 14px;display:flex;flex-direction:column;gap:6px;cursor:pointer;transition:background .1s;';
    card.onmouseenter = () => { card.style.background = 'var(--surf2)'; };
    card.onmouseleave = () => { card.style.background = ''; };

    // Kopfzeile: Buch + Kontext
    const meta = mk('div', '');
    meta.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--tx3);';
    if (a.buch) meta.appendChild(tx('span', '', '📖 ' + a.buch));
    if (a.kapitel_titel) {
      meta.appendChild(tx('span', '', '›'));
      meta.appendChild(tx('span', '', a.kapitel_titel));
    }
    if (a.uk_titel) {
      meta.appendChild(tx('span', '', '›'));
      meta.appendChild(tx('span', '', a.uk_titel));
    }
    if (a.seite) meta.appendChild(tx('span', '', '· S.' + a.seite));
    if (a.nr) meta.appendChild(tx('span', '', '· Aufg. ' + a.nr));
    card.appendChild(meta);

    // Aufgabentext
    const inhalt = a.inhalt || a.thema || '';
    if (inhalt) {
      const t = tx('div', '', inhalt);
      t.style.cssText = 'font-size:13px;color:var(--tx1);line-height:1.5;';
      card.appendChild(t);
    }

    // Anforderung
    if (a.anforderung) {
      const anf = tx('div', '', '→ ' + a.anforderung);
      anf.style.cssText = 'font-size:12px;color:var(--tx2);font-style:italic;line-height:1.4;';
      card.appendChild(anf);
    }

    // Chips
    const chips = mk('div', '');
    chips.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-top:2px;';
    if (a.operator)       chips.appendChild(chip(a.operator, OP_FARBE[a.operator] || '#64748b'));
    if (a.schwierigkeit)  chips.appendChild(chip(a.schwierigkeit, SCHW_FARBE[a.schwierigkeit] || '#64748b'));
    if (a.umfang)         chips.appendChild(chip((UMFANG_ICON[a.umfang] || '') + ' ' + a.umfang, '#64748b'));
    if (a.fach)           chips.appendChild(chip(a.fach, '#94a3b8'));
    if (chips.children.length) card.appendChild(chips);

    // Aufklapp-Logik für Bearbeitung (zukünftig)
    card.onclick = () => {
      const existing = card.querySelector('.aufg-detail');
      if (existing) { existing.remove(); return; }
      const detail = mk('div', 'aufg-detail');
      detail.style.cssText = 'margin-top:6px;padding-top:8px;border-top:1px solid var(--bord);display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--tx2);';
      if (a.typ)       detail.appendChild(tx('div', '', 'Typ: ' + a.typ));
      if (a.jahrgang)  detail.appendChild(tx('div', '', 'Jahrgang: ' + a.jahrgang));
      if (a.grafik)    detail.appendChild(tx('div', '', '🖼 ' + a.grafik));
      card.appendChild(detail);
    };

    return card;
  }

  async function loadMore(reset = false) {
    if (isLoading) return;
    if (!reset && !hasMore) return;
    isLoading = true;

    if (reset) {
      offset = 0;
      hasMore = true;
      resultsWrap.innerHTML = '';
    }

    const loadingEl = tx('div', '', '⏳ Lädt…');
    loadingEl.style.cssText = 'padding:20px;color:var(--tx3);text-align:center;font-size:13px;';
    resultsWrap.appendChild(loadingEl);

    try {
      const filters = {};
      if (filterFach)         filters.fach = filterFach;
      if (filterOperator)     filters.operator = filterOperator;
      if (filterSchwierigkeit) filters.schwierigkeit = filterSchwierigkeit;
      if (filterUmfang)       filters.umfang = filterUmfang;

      const suchText = searchInp.value.trim();
      const rows = await sbSelect('schulbuch_aufgaben', {
        fts: suchText || null,
        filters,
        limit: LIMIT,
        offset,
        order: 'buch,seite,nr',
      });

      loadingEl.remove();

      if (reset && rows.length === 0) {
        const empty = tx('div', '', 'Keine Aufgaben gefunden.');
        empty.style.cssText = 'padding:40px;text-align:center;color:var(--tx3);';
        resultsWrap.appendChild(empty);
        subT.textContent = '0 Aufgaben';
        isLoading = false;
        return;
      }

      rows.forEach(a => resultsWrap.appendChild(renderKarte(a)));
      offset += rows.length;
      hasMore = rows.length === LIMIT;

      // Mehr-laden-Button
      const oldMore = resultsWrap.querySelector('.mehr-btn');
      if (oldMore) oldMore.remove();

      if (hasMore) {
        const mehrBtn = btn('Weitere 30 laden…', 'btn btn-ghost btn-sm mehr-btn');
        mehrBtn.style.cssText = 'margin:8px auto;display:block;';
        mehrBtn.onclick = () => loadMore(false);
        resultsWrap.appendChild(mehrBtn);
      }

      // Zähler im Subheader
      const shown = resultsWrap.querySelectorAll('[style*="border-radius:8px"]').length;
      subT.textContent = shown + (hasMore ? '+' : '') + ' Aufgaben' + (suchText ? ' für „' + suchText + '"' : '');

    } catch(e) {
      loadingEl.remove();
      const err = tx('div', '', '⚠ Fehler: ' + e.message);
      err.style.cssText = 'padding:20px;color:#dc2626;font-size:13px;';
      resultsWrap.appendChild(err);
    }
    isLoading = false;
  }

  // ── Suche mit Debounce ────────────────────────────────────────
  let debounceTimer = null;
  searchInp.oninput = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => refresh(), 400);
  };

  function refresh() { loadMore(true); }

  // Initial laden
  loadMore(true);

  return div;
}
