// ── Materialien-Datenbank ─────────────────────────────────────────
function getBlockTitel(blockId) {
  if (!blockId) return null;
  for (const fp of (S.data.fachplanungen || [])) {
    const b = (fp.blocks || []).find(b => b.id === blockId);
    if (b) return b.titel || b.name || null;
  }
  return null;
}

const PHASE_COLOR = {
  'Einstieg':    { bg: '#ede9fe', tx: '#5b21b6' },
  'Erarbeitung': { bg: '#dbeafe', tx: '#1e40af' },
  'Sicherung':   { bg: '#dcfce7', tx: '#166534' },
  'Vertiefung':  { bg: '#cffafe', tx: '#0e7490' },
  'Übung':       { bg: '#fef3c7', tx: '#92400e' },
  'Anwendung':   { bg: '#fce7f3', tx: '#9d174d' },
  'Diagnose':    { bg: '#f3f4f6', tx: '#374151' },
};
const TYP_COLOR = {
  'Arbeitsblatt':         { bg: '#eff6ff', tx: '#1d4ed8' },
  'Schülerversuch':       { bg: '#fef0e7', tx: '#9a3412' },
  'Informationsblatt':    { bg: '#f0fdf4', tx: '#15803d' },
  'Übungsblatt':          { bg: '#fefce8', tx: '#854d0e' },
  'Tafelbild':            { bg: '#fdf2f8', tx: '#86198f' },
  'Lehrerhandreichung':   { bg: '#ede9fe', tx: '#5b21b6' },
  'Selbsttest / Diagnosebogen / Kompetenzcheck': { bg: '#f0f9ff', tx: '#0369a1' },
  'Faltheft / Merkheft / Lernhilfe': { bg: '#fef9ec', tx: '#92400e' },
};

function typBadge(typ) {
  const c = TYP_COLOR[typ] || { bg: 'var(--surf2)', tx: 'var(--tx2)' };
  const s = tx('span', 'matc-typ-badge', typ);
  s.style.background = c.bg; s.style.color = c.tx;
  return s;
}

function viewMaterialien() {
  const div = mk('div', '');

  // ── Overlay für Detail-Ansicht ────────────────────────────────
  const overlay = mk('div', 'matd-overlay');
  const panel   = mk('div', 'matd-panel');
  const panHdr  = mk('div', 'matd-panel-hdr');
  const panTitle = tx('span', 'matd-panel-title', '');
  const closeBtn = btn('✕', 'btn btn-ghost btn-sm matd-close');
  closeBtn.onclick = () => { overlay.classList.remove('open'); panel.querySelector('.matd-panel-body')?.remove(); };
  overlay.onclick  = e => { if (e.target === overlay) closeBtn.onclick(); };
  function _esc(e) {
    if (!overlay.isConnected) { document.removeEventListener('keydown', _esc); return; }
    if (e.key === 'Escape') closeBtn.onclick();
  }
  document.addEventListener('keydown', _esc);
  panHdr.appendChild(panTitle); panHdr.appendChild(closeBtn);
  panel.appendChild(panHdr);
  overlay.appendChild(panel);
  div.appendChild(overlay);

  // ── Header ───────────────────────────────────────────────────
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Materialdatenbank'));
  const subTitle = tx('div', 'c-sub', MATDB.length + ' Einträge');
  left.appendChild(subTitle);
  hdr.appendChild(left);

  const hdrBtns = mk('div', ''); hdrBtns.style.cssText = 'display:flex;gap:8px;';

  const importBtn = btn('➕ Importieren', 'btn btn-pri btn-sm');
  importBtn.onclick = () => { buildImportAssistent(subTitle, renderCards); };

  const cleanupBtn = btn('🧹 Aufräumen', 'btn btn-ghost btn-sm');
  cleanupBtn.onclick = async () => {
    cleanupBtn.disabled = true; cleanupBtn.textContent = '⏳ Suche verwaiste Dateien…';

    // Alle referenzierten R2-Keys sammeln
    const referenced = new Set();
    MATDB.forEach(m => {
      if (m.r2key) referenced.add(m.r2key);
      if (m.dateipfad) referenced.add(m.dateipfad);
      if (m.kontextR2key) referenced.add(m.kontextR2key);
      if (m.kontextPfad) referenced.add(m.kontextPfad);
      (m.dateipfadeWeitere || []).forEach(k => { if (k) referenced.add(k); });
    });

    try {
      // delimiter='' → flaches Listing aller Keys, paginiert (kein rekursiver Folder-Scan)
      const { files: allFiles } = await r2ListAll('', '');
      const allKeys = allFiles.map(f => f.key);
      const orphans = allKeys.filter(k => !referenced.has(k));

      if (!orphans.length) {
        alert('✓ Keine verwaisten Dateien gefunden. R2 ist sauber.');
        cleanupBtn.textContent = '🧹 Aufräumen'; cleanupBtn.disabled = false;
        return;
      }

      // Overlay aufbauen
      const ov = mk('div', 'matd-overlay'); ov.style.zIndex = '9999';
      const pan = mk('div', 'matd-panel');
      const phdr = mk('div', 'matd-panel-hdr');
      phdr.appendChild(tx('span', 'matd-panel-title', orphans.length + ' verwaiste Dateien'));
      const cls = btn('✕', 'btn btn-ghost btn-sm matd-close');
      cls.onclick = () => ov.remove();
      phdr.appendChild(cls); pan.appendChild(phdr);

      const pbody = mk('div', 'matd-panel-body');
      pbody.style.padding = '16px';

      const hint = tx('p', '', 'Diese Dateien sind in R2 vorhanden, aber in keinem MATDB-Eintrag referenziert.');
      hint.style.cssText = 'color:var(--tx2);font-size:12px;margin:0 0 12px 0;';
      pbody.appendChild(hint);

      const list = mk('div', ''); list.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:16px;max-height:400px;overflow-y:auto;';
      const checked = new Set(orphans);
      orphans.forEach(key => {
        const row = mk('div', ''); row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;';
        const cb = mk('input', ''); cb.type = 'checkbox'; cb.checked = true;
        cb.onchange = () => cb.checked ? checked.add(key) : checked.delete(key);
        row.appendChild(cb);
        row.appendChild(tx('span', '', key));
        list.appendChild(row);
      });
      pbody.appendChild(list);

      const delAllBtn = btn('🗑 Markierte löschen (' + orphans.length + ')', 'btn btn-danger btn-sm');
      delAllBtn.onclick = async () => {
        delAllBtn.disabled = true; delAllBtn.textContent = '⏳ Lösche…';
        let n = 0;
        for (const key of checked) {
          try { await r2Delete(key); n++; } catch(e) { console.warn('Löschen fehlgeschlagen:', key, e); }
        }
        ov.remove();
        alert('✓ ' + n + ' Datei' + (n !== 1 ? 'en' : '') + ' gelöscht.');
      };
      pbody.appendChild(delAllBtn);
      pan.appendChild(pbody); ov.appendChild(pan);
      ov.onclick = e => { if (e.target === ov) ov.remove(); };
      div.appendChild(ov); ov.classList.add('open');
    } catch(e) {
      alert('Fehler beim Auflisten: ' + e.message);
    }
    cleanupBtn.textContent = '🧹 Aufräumen'; cleanupBtn.disabled = false;
  };

  hdrBtns.appendChild(importBtn);
  hdrBtns.appendChild(cleanupBtn);
  hdr.appendChild(hdrBtns);
  div.appendChild(hdr);

  // ── Filter ───────────────────────────────────────────────────
  const sf = mk('div', 'card');
  const sb2 = mk('div', 'card-body');
  sb2.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;';

  const si = document.createElement('input');
  si.type = 'text'; si.placeholder = 'Suche nach Titel, Thema, Beschreibung…';
  si.className = 'finp'; si.style.flex = '1 1 200px';

  const fachSel = document.createElement('select'); fachSel.className = 'finp'; fachSel.style.width = 'auto';
  [['', 'Alle Fächer'], ['bio', '🌿 Bio'], ['chemie', '🧪 Chemie'], ['mathe', '📐 Mathe']].forEach(([v, l]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = l; fachSel.appendChild(o);
  });

  const typSel = document.createElement('select'); typSel.className = 'finp'; typSel.style.width = 'auto';
  const typen2 = ['', ...new Set(MATDB.map(m => m.materialtyp).filter(Boolean))];
  typen2.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t || 'Alle Typen'; typSel.appendChild(o); });

  const jgSel = document.createElement('select'); jgSel.className = 'finp'; jgSel.style.width = 'auto';
  const jgVals = ['', ...[...new Set(MATDB.flatMap(m => m.jahrgang || []).filter(Boolean))].sort((a, b) => {
    const order = ['5','6','7','8','9','10','SII'];
    return (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99);
  })];
  jgVals.forEach(j => { const o = document.createElement('option'); o.value = j; o.textContent = j ? 'Jg. ' + j : 'Alle Jg.'; jgSel.appendChild(o); });

  const phaseSel = document.createElement('select'); phaseSel.className = 'finp'; phaseSel.style.width = 'auto';
  const phases = ['', ...new Set(MATDB.flatMap(m => m.unterrichtsphase || []).filter(Boolean))].sort();
  phases.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p || 'Alle Phasen'; phaseSel.appendChild(o); });

  const sortSel = document.createElement('select'); sortSel.className = 'finp'; sortSel.style.width = 'auto';
  [['neu', 'Neueste zuerst'], ['alt', 'Älteste zuerst'], ['az', 'A → Z']].forEach(([v, l]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = l; sortSel.appendChild(o);
  });

  sb2.appendChild(si); sb2.appendChild(fachSel); sb2.appendChild(jgSel); sb2.appendChild(typSel); sb2.appendChild(phaseSel); sb2.appendChild(sortSel);
  sf.appendChild(sb2);
  div.appendChild(sf);

  // ── Karten-Grid ──────────────────────────────────────────────
  const gridWrap = mk('div', '');
  const countRow = mk('div', 'matc-count');
  countRow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
  const countTxt = tx('span', '', '');
  const selToggle = btn('Auswählen', 'btn btn-ghost btn-xs');
  const bulkDelBtn = btn('', 'btn btn-danger btn-xs');
  bulkDelBtn.style.display = 'none';
  countRow.appendChild(countTxt);
  countRow.appendChild(selToggle);
  countRow.appendChild(bulkDelBtn);
  gridWrap.appendChild(countRow);
  const grid = mk('div', 'matc-grid');
  gridWrap.appendChild(grid);
  div.appendChild(gridWrap);

  let selMode = false;
  const selIds = new Set();

  selToggle.onclick = () => {
    selMode = !selMode;
    selIds.clear();
    selToggle.textContent = selMode ? 'Abbrechen' : 'Auswählen';
    selToggle.className = selMode ? 'btn btn-ghost btn-xs' : 'btn btn-ghost btn-xs';
    bulkDelBtn.style.display = 'none';
    renderCards();
  };

  function updateBulkBtn() {
    const n = selIds.size;
    if (n === 0) { bulkDelBtn.style.display = 'none'; return; }
    bulkDelBtn.textContent = n + (n === 1 ? ' Eintrag löschen' : ' Einträge löschen');
    bulkDelBtn.style.display = '';
  }

  bulkDelBtn.onclick = () => {
    const n = selIds.size;
    if (!confirm(n + (n === 1 ? ' Eintrag' : ' Einträge') + ' löschen?')) return;
    MATDB = MATDB.filter(m => !selIds.has(m.id));
    selIds.clear();
    saveMatDB();
    selMode = false;
    selToggle.textContent = 'Auswählen';
    bulkDelBtn.style.display = 'none';
    renderCards();
  };

  function filteredList() {
    const q = si.value.toLowerCase().trim();
    const fach = fachSel.value; const typ = typSel.value;
    const jg = jgSel.value;    const phase = phaseSel.value;
    const sort = sortSel.value;
    const list = MATDB.filter(m => {
      if (fach  && !(m.fach || []).some(f => { const l = f.toLowerCase(); return l.includes(fach) || fach.includes(l); })) return false;
      if (typ   && m.materialtyp !== typ) return false;
      if (jg    && !(m.jahrgang || []).includes(jg)) return false;
      if (phase && !(m.unterrichtsphase || []).includes(phase)) return false;
      if (q && !m.titel.toLowerCase().includes(q) &&
               !(m.themen || []).join(' ').toLowerCase().includes(q) &&
               !(m.beschreibung || '').toLowerCase().includes(q) &&
               !(m.rolleImKontext || '').toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === 'az')  list.sort((a, b) => (a.titel || '').localeCompare(b.titel || '', 'de'));
    else if (sort === 'alt') list.sort((a, b) => (a.importiertAm || '').localeCompare(b.importiertAm || ''));
    else list.sort((a, b) => (b.importiertAm || '').localeCompare(a.importiertAm || '')); // neu = default
    return list;
  }

  function renderCards() {
    grid.innerHTML = '';
    const hits = filteredList();
    countTxt.textContent = hits.length + ' von ' + MATDB.length + ' Materialien';
    if (!hits.length) {
      const empty = tx('div', '', 'Keine Einträge gefunden.');
      empty.style.cssText = 'padding:20px;color:var(--tx3);grid-column:1/-1;';
      grid.appendChild(empty); return;
    }
    hits.forEach(mat => {
      const card = mk('div', 'matc-card');
      const needsReview = mat.review && Object.values(mat.review).some(r => r?.needsReview);

      // Block per blockId; Einheit per einheitId
      let einheitTitel = null, reiheTitel = null;
      if (mat.blockId) {
        outer: for (const fp of (S.data.fachplanungen || [])) {
          const b = (fp.blocks || []).find(b => b.id === mat.blockId);
          if (b) { reiheTitel = b.titel || b.name || null; break outer; }
        }
      }
      if (mat.einheitId) {
        outer2: for (const fp of (S.data.fachplanungen || [])) {
          for (const block of (fp.blocks || [])) {
            for (const reihe of (block.reihen || [])) {
              const e = (reihe.einheiten || []).find(e => e.id === mat.einheitId);
              if (e) { einheitTitel = e.titel || null; break outer2; }
            }
          }
        }
      }

      // ─ Zeile 1: Quelle (links, klein grau) + Fach (rechts, prominent) ─
      const topRow = mk('div', 'matc-top-row');
      if (mat.quelle) topRow.appendChild(tx('span', 'matc-quelle', mat.quelle));
      const fachArr = mat.fach || [];
      if (fachArr.length) {
        const fachBadge = tx('span', 'matc-fach-prominent', fachArr.map(fachIcon).join(' '));
        topRow.appendChild(fachBadge);
      }
      if (topRow.children.length) card.appendChild(topRow);

      // ─ Kopfzeile: [Nr – ]Titel + Del-Button ─
      const cardHdr = mk('div', 'matc-card-hdr');
      const titleText = mat.materialnummer ? mat.materialnummer + ' – ' + (mat.titel || '–') : (mat.titel || '–');
      const titleEl = tx('span', 'matc-title', titleText);
      if (needsReview) {
        const rb = tx('span', 'mat-review-badge', '⚠'); rb.title = 'Felder prüfen';
        titleEl.appendChild(rb);
      }
      cardHdr.appendChild(titleEl);
      const delBtn = btn('✕', 'matc-del');
      delBtn.title = 'Löschen';
      delBtn.onclick = e => {
        e.stopPropagation();
        if (!confirm('„' + mat.titel + '" löschen?')) return;
        MATDB = MATDB.filter(m => m.id !== mat.id);
        saveMatDB(); card.remove();
        countTxt.textContent = filteredList().length + ' von ' + MATDB.length + ' Materialien';
      };
      cardHdr.appendChild(delBtn);
      card.appendChild(cardHdr);

      // ─ Untertitel: Block-Chip + Einheitsname ─
      const subLine = mk('div', 'matc-sub-line');
      if (reiheTitel) subLine.appendChild(tx('span', 'matc-reihe-chip', reiheTitel));
      if (einheitTitel) subLine.appendChild(tx('span', 'matc-unit-inline', einheitTitel));
      if (subLine.children.length) card.appendChild(subLine);

      // ─ Typ-Badge + Jahrgang ─
      const metaRow = mk('div', 'matc-meta');
      if (mat.materialtyp) metaRow.appendChild(typBadge(mat.materialtyp));
      if ((mat.jahrgang || []).length) {
        const SII_JG = new Set(['EF','Q1','Q2','SII','Q1/Q2']);
        const jgLabel = mat.jahrgang.every(j => SII_JG.has(j)) ? mat.jahrgang.join('/') : 'Jg. ' + mat.jahrgang.join('/');
        metaRow.appendChild(tx('span', 'matc-jg', jgLabel));
      }
      card.appendChild(metaRow);


      // ─ Footer: nur KLP-Anzahl ─
      const klpCount = (mat.kompetenzenKLP || []).length;
      if (klpCount) {
        const footer = mk('div', 'matc-footer');
        footer.appendChild(tx('span', 'matc-klp-count', klpCount + ' KLP'));
        card.appendChild(footer);
      }

      if (selMode) {
        const isSel = selIds.has(mat.id);
        card.style.outline = isSel ? '3px solid #6366f1' : '';
        card.style.background = isSel ? '#ede9fe' : '';
        card.onclick = () => {
          if (selIds.has(mat.id)) selIds.delete(mat.id); else selIds.add(mat.id);
          updateBulkBtn(); renderCards();
        };
      } else {
        card.onclick = () => openMatOverlay(mat, card, overlay, panel, panTitle, renderCards);
      }
      grid.appendChild(card);
    });
  }

  si.oninput = renderCards; fachSel.onchange = renderCards;
  typSel.onchange = renderCards; jgSel.onchange = renderCards; phaseSel.onchange = renderCards; sortSel.onchange = renderCards;
  renderCards();
  return div;
}

function saveMatDB() {
  sbUpload('materialien.json', MATDB).catch(e => console.error('Speichern fehlgeschlagen:', e));
}
async function extractPdfText(blob) {
  try {
    const buf = await blob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
    const lines = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      lines.push(content.items.map(it => it.str).join(' '));
    }
    return lines.join('\n').trim();
  } catch(e) { return ''; }
}
