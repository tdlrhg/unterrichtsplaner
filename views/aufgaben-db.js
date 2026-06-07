// ── Material-Datenbank ────────────────────────────────────────────
// Durchsucht schulbuch_aufgaben + materialien in einer Ansicht

function viewAufgabenDB() {
  const div = mk('div', '');

  // ── Header ────────────────────────────────────────────────────
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Material-Datenbank'));
  const subT = tx('div', 'c-sub', '');
  left.appendChild(subT);
  hdr.appendChild(left);
  div.appendChild(hdr);

  // ── Filter + Suche ────────────────────────────────────────────
  const filterBar = mk('div', '');
  filterBar.style.cssText = 'padding:12px 16px 10px;display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--bord);';

  const searchInp = document.createElement('input');
  searchInp.type = 'text';
  searchInp.className = 'finp';
  searchInp.placeholder = '🔍 Volltextsuche in Aufgaben und Materialien…';
  filterBar.appendChild(searchInp);

  const chipBar = mk('div', '');
  chipBar.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;';

  let filterQuelle = '';   // '' = Alle, 'schulbuch' = nur Aufgaben, 'material' = nur Materialien
  let filterFach = '';
  let filterOperator = '';
  let filterSchwierigkeit = '';

  // Chip-Gruppe: Label + Buttons
  function chipGroup(options, getVal, setVal) {
    const group = mk('div', '');
    group.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;';
    const renderBtns = () => {
      group.innerHTML = '';
      [['', 'Alle'], ...options].forEach(([val, lbl]) => {
        const active = getVal() === val;
        const b = btn(lbl, 'btn btn-xs ' + (active ? 'btn-pri' : 'btn-ghost'));
        b.onclick = () => { setVal(val); renderAllChips(); refresh(); };
        group.appendChild(b);
      });
    };
    group._render = renderBtns;
    renderBtns();
    return group;
  }

  function labelRow(label, group) {
    const row = mk('div', '');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
    const l = tx('span', '', label);
    l.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;min-width:55px;';
    row.appendChild(l);
    row.appendChild(group);
    return row;
  }

  const quelleGroup = chipGroup(
    [['schulbuch','📖 Schulbuch'],['material','📄 Material']],
    () => filterQuelle, v => { filterQuelle = v; }
  );
  const fachGroup = chipGroup(
    [['mathe','📐 Mathe'],['bio','🌿 Bio'],['chemie','🧪 Chemie']],
    () => filterFach, v => { filterFach = v; }
  );
  const opGroup = chipGroup(
    [['berechnen','berechnen'],['begründen','begründen'],['erklären','erklären'],
     ['zeichnen','zeichnen'],['messen','messen'],['konstruieren','konstruieren'],
     ['beschreiben','beschreiben'],['vergleichen','vergleichen'],['MC','MC']],
    () => filterOperator, v => { filterOperator = v; }
  );
  const schwGroup = chipGroup(
    [['grundlegend','grundlegend'],['standard','standard'],['anspruchsvoll','anspruchsvoll']],
    () => filterSchwierigkeit, v => { filterSchwierigkeit = v; }
  );

  // Operator und Schwierigkeit nur zeigen wenn Schulbuch aktiv (oder Alle)
  const opRow = labelRow('Operator', opGroup);
  const schwRow = labelRow('Schwierigkeit', schwGroup);

  chipBar.appendChild(labelRow('Quelle', quelleGroup));
  chipBar.appendChild(labelRow('Fach', fachGroup));
  chipBar.appendChild(opRow);
  chipBar.appendChild(schwRow);
  filterBar.appendChild(chipBar);
  div.appendChild(filterBar);

  function renderAllChips() {
    [quelleGroup, fachGroup, opGroup, schwGroup].forEach(g => g._render());
    // Operator + Schwierigkeit nur bei Schulbuch oder Alle sinnvoll
    const showAufgabenFilter = filterQuelle !== 'material';
    opRow.style.display = showAufgabenFilter ? '' : 'none';
    schwRow.style.display = showAufgabenFilter ? '' : 'none';
  }
  renderAllChips();

  // ── Karten ────────────────────────────────────────────────────
  const OP_FARBE = {
    berechnen: '#2563eb', begründen: '#7c3aed', erklären: '#0891b2',
    zeichnen: '#16a34a', messen: '#d97706', konstruieren: '#dc2626',
    beschreiben: '#4f46e5', vergleichen: '#db2777', ausfüllen: '#64748b', MC: '#374151',
  };
  const SCHW_FARBE = { grundlegend: '#16a34a', standard: '#2563eb', anspruchsvoll: '#9d174d' };
  const UMFANG_ICON = { kurz: '⚡', mittel: '⏱', lang: '🕐' };

  function smallChip(text, color) {
    const c = tx('span', '', text);
    c.style.cssText = `display:inline-block;padding:1px 7px;border-radius:20px;font-size:11px;font-weight:600;background:${color}22;color:${color};white-space:nowrap;`;
    return c;
  }

  // Karte für Schulbuch-Aufgabe
  function renderAufgabeKarte(a) {
    const card = mk('div', '');
    card.style.cssText = 'border:1px solid var(--bord);border-left:3px solid #2563eb;border-radius:8px;padding:10px 14px;display:flex;flex-direction:column;gap:5px;cursor:pointer;transition:background .1s;';
    card.onmouseenter = () => { card.style.background = 'var(--surf2)'; };
    card.onmouseleave = () => { card.style.background = ''; };

    // Meta: Buch › Kapitel › UK · S.X · Aufg.Y
    const meta = mk('div', '');
    meta.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:11px;color:var(--tx3);';
    meta.appendChild(tx('span', '', '📖'));
    if (a.buch) meta.appendChild(tx('span', '', a.buch));
    if (a.kapitel_titel) { meta.appendChild(tx('span', '', '›')); meta.appendChild(tx('span', '', a.kapitel_titel)); }
    if (a.uk_titel) { meta.appendChild(tx('span', '', '›')); meta.appendChild(tx('span', '', a.uk_titel)); }
    if (a.seite) meta.appendChild(tx('span', '', '· S.' + a.seite));
    if (a.nr)    meta.appendChild(tx('span', '', '· Aufg. ' + a.nr));
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
    if (a.operator)      chips.appendChild(smallChip(a.operator, OP_FARBE[a.operator] || '#64748b'));
    if (a.schwierigkeit) chips.appendChild(smallChip(a.schwierigkeit, SCHW_FARBE[a.schwierigkeit] || '#64748b'));
    if (a.umfang)        chips.appendChild(smallChip((UMFANG_ICON[a.umfang] || '') + ' ' + a.umfang, '#64748b'));
    if (a.fach)          chips.appendChild(smallChip(a.fach, '#94a3b8'));
    if (chips.children.length) card.appendChild(chips);

    // Aufklapp-Detail
    card.onclick = () => {
      const existing = card.querySelector('.card-detail');
      if (existing) { existing.remove(); return; }
      const detail = mk('div', 'card-detail');
      detail.style.cssText = 'margin-top:6px;padding-top:8px;border-top:1px solid var(--bord);display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--tx2);';
      if (a.typ)     detail.appendChild(tx('div', '', 'Typ: ' + a.typ));
      if (a.jahrgang) detail.appendChild(tx('div', '', 'Jahrgang: ' + a.jahrgang));
      if (a.grafik)  detail.appendChild(tx('div', '', '🖼 ' + a.grafik));
      card.appendChild(detail);
    };
    return card;
  }

  // Karte für Material
  function renderMaterialKarte(m) {
    const card = mk('div', '');
    card.style.cssText = 'border:1px solid var(--bord);border-left:3px solid #16a34a;border-radius:8px;padding:10px 14px;display:flex;flex-direction:column;gap:5px;cursor:pointer;transition:background .1s;';
    card.onmouseenter = () => { card.style.background = 'var(--surf2)'; };
    card.onmouseleave = () => { card.style.background = ''; };

    // Titel + Dateiname
    const titleRow = mk('div', '');
    titleRow.style.cssText = 'display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;';
    titleRow.appendChild(tx('span', '', '📄'));
    const titelEl = tx('strong', '', m.titel || m.dateiname || '–');
    titelEl.style.cssText = 'font-size:13px;color:var(--tx1);';
    titleRow.appendChild(titelEl);
    if (m.titel && m.dateiname && m.titel !== m.dateiname) {
      const fn = tx('span', '', m.dateiname);
      fn.style.cssText = 'font-size:11px;color:var(--tx3);';
      titleRow.appendChild(fn);
    }
    card.appendChild(titleRow);

    // Beschreibung
    if (m.beschreibung) {
      const desc = tx('div', '', m.beschreibung);
      desc.style.cssText = 'font-size:12px;color:var(--tx2);line-height:1.5;';
      card.appendChild(desc);
    }

    // Chips: Themen, Rolle, Unterrichtsphase, Fach, Jahrgang
    const chips = mk('div', '');
    chips.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-top:2px;';
    if (m.fach)             chips.appendChild(smallChip(m.fach, '#94a3b8'));
    const jgArr = Array.isArray(m.jahrgang) ? m.jahrgang : (m.jahrgang ? [m.jahrgang] : []);
    if (jgArr.length)       chips.appendChild(smallChip('Jg. ' + jgArr.join('/'), '#94a3b8'));
    if (m.rolle)            chips.appendChild(smallChip(m.rolle, '#2563eb'));
    if (m.unterrichtsphase) chips.appendChild(smallChip(m.unterrichtsphase, '#7c3aed'));
    if (m.kognitive_beanspruchung) chips.appendChild(smallChip(m.kognitive_beanspruchung, '#d97706'));
    const themen = Array.isArray(m.themen) ? m.themen : [];
    themen.slice(0, 4).forEach(t => chips.appendChild(smallChip(t, '#0891b2')));
    if (chips.children.length) card.appendChild(chips);

    // Aufklapp-Detail
    card.onclick = () => {
      const existing = card.querySelector('.card-detail');
      if (existing) { existing.remove(); return; }
      const detail = mk('div', 'card-detail');
      detail.style.cssText = 'margin-top:6px;padding-top:8px;border-top:1px solid var(--bord);display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--tx2);';
      if (m.hat_loesung != null) detail.appendChild(tx('div', '', 'Mit Lösung: ' + (m.hat_loesung ? 'ja' : 'nein')));
      if (m.r2_pfad) {
        const link = document.createElement('a');
        link.href = '#'; link.textContent = '↗ Datei öffnen';
        link.style.cssText = 'color:var(--pri);font-size:12px;';
        link.onclick = e => { e.stopPropagation(); e.preventDefault(); window.open(m.r2_pfad); };
        detail.appendChild(link);
      }
      card.appendChild(detail);
    };
    return card;
  }

  // ── Ergebnis-Bereich ──────────────────────────────────────────
  const resultsWrap = mk('div', '');
  resultsWrap.style.cssText = 'padding:12px 16px;display:flex;flex-direction:column;gap:8px;';
  div.appendChild(resultsWrap);

  const LIMIT = 25;
  let offsetSB = 0, offsetMat = 0;
  let moreSB = true, moreMat = true;
  let isLoading = false;

  async function loadMore(reset = false) {
    if (isLoading) return;
    isLoading = true;

    if (reset) {
      offsetSB = 0; offsetMat = 0;
      moreSB = true; moreMat = true;
      resultsWrap.innerHTML = '';
    }

    const loadingEl = tx('div', '', '⏳ Lädt…');
    loadingEl.style.cssText = 'padding:20px;color:var(--tx3);text-align:center;font-size:13px;';
    resultsWrap.appendChild(loadingEl);

    const suchText = searchInp.value.trim() || null;
    const fachFilter = filterFach ? { fach: filterFach } : {};

    try {
      const promises = [];
      const quelleSB  = filterQuelle !== 'material';
      const quelleMat = filterQuelle !== 'schulbuch';

      if (quelleSB && moreSB) {
        const sbFilter = { ...fachFilter };
        if (filterOperator)     sbFilter.operator = filterOperator;
        if (filterSchwierigkeit) sbFilter.schwierigkeit = filterSchwierigkeit;
        promises.push(sbSelect('inhalte', { fts: suchText, filters: sbFilter, limit: LIMIT, offset: offsetSB, order: 'buch,seite,nr' }));
      } else {
        promises.push(Promise.resolve(null));
      }

      if (quelleMat && moreMat) {
        promises.push(sbSelect('materialien', { fts: suchText, filters: fachFilter, limit: LIMIT, offset: offsetMat }));
      } else {
        promises.push(Promise.resolve(null));
      }

      const [sbRows, matRows] = await Promise.all(promises);
      loadingEl.remove();

      let total = 0;

      if (sbRows && sbRows.length) {
        // Trennzeile wenn gemischt und schon Material da
        if (filterQuelle === '' && offsetSB === 0 && sbRows.length) {
          const sep = tx('div', '', '📖 Schulbuch-Aufgaben');
          sep.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.4px;padding:4px 0 2px;border-top:1px solid var(--bord);margin-top:4px;';
          if (offsetSB === 0) resultsWrap.appendChild(sep);
        }
        sbRows.forEach(a => resultsWrap.appendChild(renderAufgabeKarte(a)));
        offsetSB += sbRows.length;
        moreSB = sbRows.length === LIMIT;
        total += sbRows.length;
      } else if (sbRows) {
        moreSB = false;
      }

      if (matRows && matRows.length) {
        if (filterQuelle === '' && matRows.length) {
          const sep2 = tx('div', '', '📄 Materialien');
          sep2.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.4px;padding:4px 0 2px;border-top:1px solid var(--bord);margin-top:4px;';
          if (offsetMat === 0) resultsWrap.appendChild(sep2);
        }
        matRows.forEach(m => resultsWrap.appendChild(renderMaterialKarte(m)));
        offsetMat += matRows.length;
        moreMat = matRows.length === LIMIT;
        total += matRows.length;
      } else if (matRows) {
        moreMat = false;
      }

      // Leer-Zustand
      if (reset && total === 0) {
        const empty = tx('div', '', 'Keine Ergebnisse gefunden.');
        empty.style.cssText = 'padding:40px;text-align:center;color:var(--tx3);font-size:14px;';
        resultsWrap.appendChild(empty);
        subT.textContent = '0 Ergebnisse';
        isLoading = false;
        return;
      }

      // Mehr-laden-Button
      resultsWrap.querySelector('.mehr-btn')?.remove();
      if (moreSB || moreMat) {
        const mehrBtn = btn('Weitere laden…', 'btn btn-ghost btn-sm mehr-btn');
        mehrBtn.style.cssText = 'margin:8px auto;display:block;';
        mehrBtn.onclick = () => loadMore(false);
        resultsWrap.appendChild(mehrBtn);
      }

      // Zähler
      const shown = resultsWrap.querySelectorAll('[style*="border-left:3px"]').length;
      subT.textContent = shown + (moreSB || moreMat ? '+' : '') + ' Einträge'
        + (suchText ? ' für „' + suchText + '"' : '');

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
