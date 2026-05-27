// ── Spalten-Layout Helpers ────────────────────────────────────────
function makeCol(title, onAdd) {
  const col = mk('div', 'col-panel');
  const hdr = mk('div', 'col-panel-hdr');
  hdr.appendChild(tx('span', 'col-panel-title', title));
  if (onAdd) {
    const ab = btn('+ Neu', 'btn btn-xs btn-pri');
    ab.style.cssText = 'background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.3);';
    ab.onclick = onAdd;
    hdr.appendChild(ab);
  }
  col.appendChild(hdr);
  const body = mk('div', 'col-panel-body');
  col.appendChild(body);
  return { col, body };
}

function makeColItem(title, sub, isActive, onSelect, onUp, onDown, onDelete, isFirst, isLast, onEdit, dragPayload, onDrop) {
  const item = mk('div', 'col-item' + (isActive ? ' active' : ''));
  const label = mk('div', 'col-item-label');
  label.appendChild(tx('div', 'col-item-title', title));
  if (sub) label.appendChild(tx('div', 'col-item-sub', sub));
  label.onclick = onSelect;
  item.appendChild(label);

  const actions = mk('div', 'col-item-actions');
  if (onEdit) {
    const editBtn = mk('button', 'col-action-btn');
    editBtn.textContent = '✏'; editBtn.title = 'Umbenennen';
    editBtn.onclick = e => { e.stopPropagation(); onEdit(); };
    actions.appendChild(editBtn);
  }
  const upBtn = mk('button', 'col-action-btn');
  upBtn.textContent = '↑'; upBtn.title = 'Nach oben'; upBtn.disabled = isFirst;
  upBtn.onclick = e => { e.stopPropagation(); onUp(); };
  const downBtn = mk('button', 'col-action-btn');
  downBtn.textContent = '↓'; downBtn.title = 'Nach unten'; downBtn.disabled = isLast;
  downBtn.onclick = e => { e.stopPropagation(); onDown(); };
  const delBtn = mk('button', 'col-action-btn danger');
  delBtn.textContent = '✕'; delBtn.title = 'Löschen';
  delBtn.onclick = e => { e.stopPropagation(); onDelete(); };
  actions.appendChild(upBtn); actions.appendChild(downBtn); actions.appendChild(delBtn);
  item.appendChild(actions);

  // Drag (Quelle)
  if (dragPayload) {
    item.draggable = true;
    item.ondragstart = e => {
      e.dataTransfer.setData('application/x-fp-item', JSON.stringify(dragPayload));
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => item.classList.add('col-item-dragging'), 0);
    };
    item.ondragend = () => item.classList.remove('col-item-dragging');
  }

  // Drop (Ziel)
  if (onDrop) {
    item.ondragover = e => {
      if (e.dataTransfer.types.includes('application/x-fp-item')) {
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
        item.classList.add('col-item-drop');
      }
    };
    item.ondragleave = e => { if (!item.contains(e.relatedTarget)) item.classList.remove('col-item-drop'); };
    item.ondrop = e => {
      e.preventDefault(); item.classList.remove('col-item-drop');
      try { onDrop(JSON.parse(e.dataTransfer.getData('application/x-fp-item'))); } catch(_) {}
    };
  }

  return item;
}

// ── Fachplanung-Ansicht (Spalten) ────────────────────────────────────
function viewFachplanung() {
  const lp = getFachplanung(S.aktFpId);
  if (!lp) {
    const first = (S.data.fachplanungen || [])[0];
    if (first) { S.aktFpId = first.id; return viewFachplanung(); }
    return mk('div', '');
  }

  const div = mk('div', '');
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', fachLabel(lp.fach) + ' · Jahrgang ' + lp.jahrgang));
  left.appendChild(tx('div', 'c-sub', 'Fachplanung · wird in ' + kurseForFachplanung(lp.id).length + ' Kurs/Kursen verwendet'));
  hdr.appendChild(left);
  const freieBtn = btn('+ Freie Stunde', 'btn btn-ghost btn-sm');
  freieBtn.onclick = () => {
    if (!lp.freieStunden) lp.freieStunden = [];
    const s = { id: uid(), titel: '', prioritaet: 'pflicht', dauer: 45, phasen: [], klpInhalt: [], klpProzess: [], material: [] };
    lp.freieStunden.unshift(s);
    scheduleSave();
    S.view = 'freieStunden'; S.sel = { type: 'freieStunde', ids: [lp.id, s.id] };
    render();
  };
  hdr.appendChild(freieBtn);
  const exportBtn = btn('⬇ Export', 'btn btn-ghost btn-sm');
  exportBtn.title = 'Als Markdown exportieren';
  exportBtn.onclick = () => exportFachplanung(lp.id);
  hdr.appendChild(exportBtn);
  div.appendChild(hdr);

  const sel = S.sel || {};
  const selBlockId   = sel.ids && sel.ids[1];
  const selReiheId   = sel.ids && sel.ids[2];
  const selEinheitId = sel.ids && sel.ids[3];
  const selBlock   = selBlockId   && (lp.blocks || []).find(b => b.id === selBlockId);
  const selReihe   = selBlock     && (selBlock.reihen || []).find(r => r.id === selReiheId);
  const selEinheit = selReihe     && (selReihe.einheiten || []).find(e => e.id === selEinheitId);

  const cols = mk('div', 'col-layout');

  // Spalte 1: Blöcke
  const { col: c1, body: b1 } = makeCol('Themenblöcke', () => {
    S.modal = { type: 'newBlock', data: { fpId: lp.id } }; render();
  });
  (lp.blocks || []).length === 0
    ? b1.appendChild(gray('Noch keine Blöcke.'))
    : (lp.blocks || []).forEach((block, i) => {
        const rn = (block.reihen || []).length;
        const angelegte = (block.reihen || []).reduce((s,r)=>(r.einheiten||[]).reduce((s2,e)=>s2+(e.stunden||[]).length,s),0);
        const geplant = block.stundenGesamt ? parseInt(block.stundenGesamt) : null;
        const subLabel = rn + ' Reihe' + (rn !== 1 ? 'n' : '') +
          (geplant ? ' · ' + angelegte + '/' + geplant + ' Std.' : (angelegte > 0 ? ' · ' + angelegte + ' Std.' : ''));
        b1.appendChild(makeColItem(
          block.titel, subLabel,
          selBlockId === block.id,
          () => { S.sel = { type: 'block', ids: [lp.id, block.id] }; render(); },
          () => { swap(lp.blocks, i, i-1); scheduleSave(); render(); },
          () => { swap(lp.blocks, i, i+1); scheduleSave(); render(); },
          () => { if(confirm('Block "'+block.titel+'" löschen?')){ lp.blocks=lp.blocks.filter(b=>b.id!==block.id); if(selBlockId===block.id)S.sel=null; scheduleSave(); render(); }},
          i===0, i===lp.blocks.length-1,
          () => { S.modal={type:'umbenennen',data:{obj:block,feld:'titel',label:'Themenblock'}}; render(); },
          null, // Blöcke werden nicht gezogen
          p => { // Drop: Reihe in diesen Block verschieben
            if (p.type !== 'reihe' || p.srcBlockId === block.id) return;
            const src = (lp.blocks||[]).find(b=>b.id===p.srcBlockId);
            if (!src) return;
            const reihe = (src.reihen||[]).find(r=>r.id===p.reiheId);
            if (!reihe) return;
            src.reihen = src.reihen.filter(r=>r.id!==p.reiheId);
            if (!block.reihen) block.reihen = [];
            block.reihen.push(reihe);
            S.sel = { type: 'reihe', ids: [lp.id, block.id, reihe.id] };
            scheduleSave(); render();
          }
        ));
      });
  cols.appendChild(c1);

  // Spalte 2: Reihen
  if (selBlock) {
    const { col: c2, body: b2 } = makeCol(selBlock.titel, () => {
      S.modal = { type: 'newReihe', data: { fpId: lp.id, blockId: selBlock.id } }; render();
    });
    (selBlock.reihen || []).length === 0
      ? b2.appendChild(gray('Noch keine Reihen.'))
      : (selBlock.reihen || []).forEach((reihe, i) => {
          const en = (reihe.einheiten || []).length;
          b2.appendChild(makeColItem(
            reihe.titel, en + ' Einheit' + (en !== 1 ? 'en' : ''),
            selReiheId === reihe.id,
            () => { S.sel = { type: 'reihe', ids: [lp.id, selBlock.id, reihe.id] }; render(); },
            () => { swap(selBlock.reihen, i, i-1); scheduleSave(); render(); },
            () => { swap(selBlock.reihen, i, i+1); scheduleSave(); render(); },
            () => { if(confirm('Reihe löschen?')){ selBlock.reihen=selBlock.reihen.filter(r=>r.id!==reihe.id); if(selReiheId===reihe.id)S.sel={type:'block',ids:[lp.id,selBlock.id]}; scheduleSave(); render(); }},
            i===0, i===selBlock.reihen.length-1,
            () => { S.modal={type:'umbenennen',data:{obj:reihe,feld:'titel',label:'Unterrichtsreihe'}}; render(); },
            { type: 'reihe', srcBlockId: selBlock.id, reiheId: reihe.id }, // ziehbar
            p => { // Drop: Einheit in diese Reihe verschieben
              if (p.type !== 'einheit' || p.srcReiheId === reihe.id) return;
              const srcReihe = (selBlock.reihen||[]).find(r=>r.id===p.srcReiheId);
              if (!srcReihe) return;
              const einheit = (srcReihe.einheiten||[]).find(e=>e.id===p.einheitId);
              if (!einheit) return;
              srcReihe.einheiten = srcReihe.einheiten.filter(e=>e.id!==p.einheitId);
              if (!reihe.einheiten) reihe.einheiten = [];
              reihe.einheiten.push(einheit);
              S.sel = { type: 'einheit', ids: [lp.id, selBlock.id, reihe.id, einheit.id] };
              scheduleSave(); render();
            }
          ));
        });
    cols.appendChild(c2);
  }

  // Spalte 3: Einheiten
  if (selReihe) {
    const { col: c3, body: b3 } = makeCol(selReihe.titel, () => {
      S.modal = { type: 'newEinheit', data: { fpId: lp.id, blockId: selBlock.id, reiheId: selReihe.id } }; render();
    });
    (selReihe.einheiten || []).length === 0
      ? b3.appendChild(gray('Noch keine Einheiten.'))
      : (selReihe.einheiten || []).forEach((einheit, i) => {
          const sn = (einheit.stunden || []).length;
          b3.appendChild(makeColItem(
            einheit.titel, sn + ' Stunde' + (sn !== 1 ? 'n' : ''),
            selEinheitId === einheit.id,
            () => { S.sel = { type: 'einheit', ids: [lp.id, selBlock.id, selReihe.id, einheit.id] }; render(); },
            () => { swap(selReihe.einheiten, i, i-1); scheduleSave(); render(); },
            () => { swap(selReihe.einheiten, i, i+1); scheduleSave(); render(); },
            () => { if(confirm('Einheit löschen?')){ selReihe.einheiten=selReihe.einheiten.filter(e=>e.id!==einheit.id); if(selEinheitId===einheit.id)S.sel={type:'reihe',ids:[lp.id,selBlock.id,selReihe.id]}; scheduleSave(); render(); }},
            i===0, i===selReihe.einheiten.length-1,
            () => { S.modal={type:'umbenennen',data:{obj:einheit,feld:'titel',label:'Unterrichtseinheit'}}; render(); },
            { type: 'einheit', srcReiheId: selReihe.id, einheitId: einheit.id }, // ziehbar
            p => { // Drop: Stunde in diese Einheit verschieben
              if (p.type !== 'stunde' || p.srcEinheitId === einheit.id) return;
              const srcEinheit = (selReihe.einheiten||[]).find(e=>e.id===p.srcEinheitId);
              if (!srcEinheit) return;
              const stunde = (srcEinheit.stunden||[]).find(s=>s.id===p.stundeId);
              if (!stunde) return;
              srcEinheit.stunden = srcEinheit.stunden.filter(s=>s.id!==p.stundeId);
              if (!einheit.stunden) einheit.stunden = [];
              einheit.stunden.push(stunde);
              S.sel = { type: 'stunde', ids: [lp.id, selBlock.id, selReihe.id, einheit.id, stunde.id] };
              scheduleSave(); render();
            }
          ));
        });
    cols.appendChild(c3);
  }

  // Spalte 4: Stunden
  if (selEinheit) {
    const { col: c4, body: b4 } = makeCol(selEinheit.titel, () => {
      S.modal = { type: 'newStunde', data: { fpId: lp.id, blockId: selBlock.id, reiheId: selReihe.id, einheitId: selEinheit.id } }; render();
    });
    (selEinheit.stunden || []).length === 0
      ? b4.appendChild(gray('Noch keine Stunden.'))
      : (selEinheit.stunden || []).forEach((stunde, i) => {
          const isAct = sel.ids && sel.ids[4] === stunde.id;
          const prioIcon = {pflicht:'🟢',optional:'🟡',puffer:'🔵',klassenarbeit:'📝',rueckgabe:'📋'}[stunde.prioritaet||'pflicht']||'🟢';
          b4.appendChild(makeColItem(
            prioIcon + ' ' + (stunde.titel || '(ohne Titel)'),
            stunde.lernziel ? stunde.lernziel.slice(0,50)+'…' : null,
            isAct,
            () => { S.sel = { type: 'stunde', ids: [lp.id, selBlock.id, selReihe.id, selEinheit.id, stunde.id] }; render(); },
            () => { swap(selEinheit.stunden, i, i-1); scheduleSave(); render(); },
            () => { swap(selEinheit.stunden, i, i+1); scheduleSave(); render(); },
            () => { if(confirm('Stunde löschen?')){ selEinheit.stunden=selEinheit.stunden.filter(s=>s.id!==stunde.id); if(sel.ids&&sel.ids[4]===stunde.id)S.sel={type:'einheit',ids:[lp.id,selBlock.id,selReihe.id,selEinheit.id]}; scheduleSave(); render(); }},
            i===0, i===selEinheit.stunden.length-1,
            () => { S.modal={type:'umbenennen',data:{obj:stunde,feld:'titel',label:'Stunde'}}; render(); },
            { type: 'stunde', srcEinheitId: selEinheit.id, stundeId: stunde.id }, // ziehbar
            null // Stunden sind kein Drop-Ziel
          ));
        });
    cols.appendChild(c4);
  }

  div.appendChild(cols);

  // ── Notizen zur ausgewählten Ebene ────────────────────────────
  const KI_EBENEN = {
    block:   { label: 'Reihen',   childKey: 'reihen',   childLabel: 'Reihe' },
    reihe:   { label: 'Einheiten',childKey: 'einheiten',childLabel: 'Einheit' },
    einheit: { label: 'Stunden',  childKey: 'stunden',  childLabel: 'Stunde' },
  };
  const notizObj = selEinheit || selReihe || selBlock;
  const notizTyp = selEinheit ? 'einheit' : selReihe ? 'reihe' : selBlock ? 'block' : null;
  const notizLabel = notizObj ? 'Notizen · ' + notizObj.titel : null;

  if (notizObj && notizTyp) {
    const nc = mk('div', 'card');
    const nhdr = cardHdr(notizLabel);

    const ebene = KI_EBENEN[notizTyp];
    const kiBtn = btn('✨ KI → ' + ebene.label + ' vorschlagen', 'btn btn-ghost btn-xs');
    kiBtn.onclick = () => kiPlanung(lp, notizObj, notizTyp, nta, kiResultDiv, {
      selBlock, selReihe, selEinheit
    });
    nhdr.appendChild(kiBtn);
    nc.appendChild(nhdr);

    const nb = mk('div', 'card-body');
    const nta = document.createElement('textarea');
    nta.className = 'finp fp-notizen';
    nta.placeholder = 'Stichworte, Ideen, Materialhinweise, offene Fragen…';
    nta.value = notizObj.notizen || '';
    nta.onblur = () => { notizObj.notizen = nta.value; scheduleSave(); };
    nb.appendChild(nta);
    nc.appendChild(nb);

    const kiResultDiv = mk('div', '');
    nc.appendChild(kiResultDiv);
    div.appendChild(nc);
  }

  // ── KLP-Referenz ─────────────────────────────────────────────
  const klpOpenKey = 'klpRef_' + lp.id;
  const klpCard = mk('div', 'card klp-ref-card');

  const klpHdr = cardHdr('');
  klpHdr.style.cursor = 'pointer';
  const klpHdrInner = mk('div', 'klp-ref-hdr-inner');
  klpHdrInner.appendChild(tx('span', 'klp-ref-arrow', S.open[klpOpenKey] ? '▾' : '›'));
  klpHdrInner.appendChild(tx('span', '', 'KLP-Kompetenzen · ' + fachLabel(lp.fach) + ' · Jg. ' + lp.jahrgang));
  if (KLPDB.length === 0) klpHdrInner.appendChild(tx('span', 'klp-ref-empty-hint', '(KLP-Datenbank nicht geladen)'));
  klpHdr.appendChild(klpHdrInner);
  klpHdr.onclick = () => { S.open[klpOpenKey] = !S.open[klpOpenKey]; render(); };
  klpCard.appendChild(klpHdr);

  if (S.open[klpOpenKey] && KLPDB.length > 0) {
    const fachNameMap = { 'M': 'Mathematik', 'Ch': 'Chemie', 'Bio': 'Biologie', 'Ch_GK': 'Chemie', 'Ch_LK': 'Chemie', 'Bio_GK': 'Biologie', 'Bio_LK': 'Biologie' };
    const fachName = fachNameMap[lp.fach] || lp.fach;
    const isSII = ['EF', 'Q1', 'Q2', 'SII'].includes(lp.jahrgang);
    const isGK = lp.fach.includes('GK');
    const isLK = lp.fach.includes('LK');

    let hits = KLPDB.filter(e => {
      if (e.fach !== fachName) return false;
      const entryIsSII = e.stufe === 'SII' || (e.id && e.id.toUpperCase().includes('SII'));
      if (isSII !== entryIsSII) return false;
      if (isSII) {
        if (isGK && e.id.toUpperCase().includes('LK')) return false;
        if (isLK && e.id.toUpperCase().includes('GK')) return false;
      }
      return true;
    });

    // Suchfeld
    const klpSearch = mk('div', 'klp-ref-search-wrap');
    const klpInp = document.createElement('input');
    klpInp.type = 'text'; klpInp.className = 'finp klp-ref-search';
    klpInp.placeholder = 'Kompetenz suchen…';
    klpSearch.appendChild(klpInp);
    klpCard.appendChild(klpSearch);

    const klpBody = mk('div', 'klp-ref-body');

    function renderKlpBody(q) {
      klpBody.innerHTML = '';
      const filtered = q ? hits.filter(e =>
        e.beschreibung.toLowerCase().includes(q) ||
        e.inhaltsfeld.toLowerCase().includes(q) ||
        e.kompetenzcodes.join(' ').toLowerCase().includes(q)
      ) : hits;

      const grouped = {};
      filtered.forEach(e => {
        const key = e.inhaltsfeld;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(e);
      });

      if (!Object.keys(grouped).length) {
        klpBody.appendChild(tx('div', 'klp-ref-empty', 'Keine Treffer.'));
        return;
      }

      Object.entries(grouped).forEach(([inhaltsfeld, entries]) => {
        const groupKey = 'klpIF_' + lp.id + '_' + inhaltsfeld;
        const isIfOpen = S.open[groupKey] || !!q;

        const groupHdr = mk('div', 'klp-ref-group-hdr');
        groupHdr.appendChild(tx('span', 'klp-ref-arrow', isIfOpen ? '▾' : '›'));
        groupHdr.appendChild(tx('span', 'klp-ref-group-label', inhaltsfeld));
        groupHdr.appendChild(tx('span', 'klp-ref-group-count', entries.length));
        groupHdr.onclick = () => { S.open[groupKey] = !isIfOpen; renderKlpBody(klpInp.value.toLowerCase().trim()); };
        klpBody.appendChild(groupHdr);

        if (isIfOpen) {
          entries.forEach(e => {
            const row = mk('div', 'klp-ref-entry');
            row.appendChild(tx('span', 'klp-ref-codes', e.kompetenzcodes.join(', ')));
            row.appendChild(tx('span', 'klp-ref-desc', e.beschreibung));
            klpBody.appendChild(row);
          });
        }
      });
    }

    klpInp.oninput = () => renderKlpBody(klpInp.value.toLowerCase().trim());
    renderKlpBody('');
    klpCard.appendChild(klpBody);
  }

  div.appendChild(klpCard);
  return div;
}

function swap(arr, i, j) {
  const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
}

function kurseForFachplanung(fpId) {
  return (S.data.kurse || []).filter(k => k.fachplanungId === fpId);
}

// ── Kurse-Übersicht ───────────────────────────────────────────────
function viewKurse() {
  const div = mk('div', '');
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Meine Kurse'));
  left.appendChild(tx('div', 'c-sub', 'Klassen und Schuljahre'));
  hdr.appendChild(left);
  const ab = btn('+ Kurs anlegen', 'btn btn-pri btn-sm');
  ab.onclick = () => { S.modal = { type: 'newKurs' }; render(); };
  hdr.appendChild(ab);
  div.appendChild(hdr);

  if (!S.data.kurse || S.data.kurse.length === 0) {
    const empty = mk('div', 'empty');
    empty.appendChild(tx('div', 'empty-ico', '📋'));
    empty.appendChild(tx('div', 'empty-txt', 'Noch keine Kurse angelegt.'));
    div.appendChild(empty);
    return div;
  }

  const grid = mk('div', 'ov-grid');
  S.data.kurse.forEach(kurs => {
    const lp = getFachplanung(kurs.fachplanungId);
    const card = mk('div', 'ov-card');
    card.appendChild(tx('div', 'ov-title', kurs.klasse));
    card.appendChild(tx('div', 'ov-sub', (lp ? fachLabel(lp.fach) + ' Jg. ' + lp.jahrgang : '–') + ' · ' + kurs.schuljahr));
    const del = btn('Löschen', 'btn btn-danger btn-xs');
    del.style.marginTop = '8px';
    del.onclick = () => {
      if (confirm('Kurs "' + kurs.klasse + '" löschen?')) {
        S.data.kurse = S.data.kurse.filter(k => k.id !== kurs.id);
        scheduleSave(); render();
      }
    };
    card.appendChild(del);
    grid.appendChild(card);
  });
  div.appendChild(grid);
  return div;
}

// ── Fachplanung Export als Markdown ──────────────────────────────
function exportFachplanung(fpId) {
  const fp = getFachplanung(fpId);
  if (!fp) return;

  const PRIO_LABEL = {
    pflicht: 'Pflicht',
    optional: 'Optional',
    puffer: 'Puffer',
    klassenarbeit: 'Klassenarbeit',
    rueckgabe: 'Rückgabe/Besprechung'
  };

  let md = '';
  md += '# ' + fachLabel(fp.fach) + ' · Jahrgang ' + fp.jahrgang + '\n\n';
  md += '> Exportiert am ' + new Date().toLocaleDateString('de-DE') + '\n\n';
  md += '---\n\n';

  if (!fp.blocks || fp.blocks.length === 0) {
    md += '_Keine Blöcke angelegt._\n';
  } else {
    fp.blocks.forEach((block, bi) => {
      const std = parseInt(block.stundenGesamt) || 0;
      md += '## ' + (bi+1) + '. ' + block.titel;
      if (std > 0) md += ' (' + std + ' Std.)';
      md += '\n\n';

      if (!block.reihen || block.reihen.length === 0) {
        md += '_Keine Reihen angelegt._\n\n';
      } else {
        block.reihen.forEach((reihe, ri) => {
          md += '### ' + (bi+1) + '.' + (ri+1) + ' ' + reihe.titel + '\n\n';

          if (!reihe.einheiten || reihe.einheiten.length === 0) {
            md += '_Keine Einheiten angelegt._\n\n';
          } else {
            reihe.einheiten.forEach((einheit, ei) => {
              md += '#### ' + (bi+1) + '.' + (ri+1) + '.' + (ei+1) + ' ' + einheit.titel + '\n\n';

              if (!einheit.stunden || einheit.stunden.length === 0) {
                md += '_Keine Stunden angelegt._\n\n';
              } else {
                einheit.stunden.forEach((stunde, si2) => {
                  const prio = PRIO_LABEL[stunde.prioritaet] || 'Pflicht';
                  md += '- **' + (si2+1) + '. ' + (stunde.titel || '(ohne Titel)') + '**';
                  md += ' [' + prio + ']';
                  if (stunde.lernziel) md += '\n  _Lernziel: ' + stunde.lernziel + '_';
                  if (stunde.klpInhalt && stunde.klpInhalt.length > 0) md += '\n  KLP Inhalt: ' + stunde.klpInhalt.join(', ');
                  if (stunde.klpProzess && stunde.klpProzess.length > 0) md += '\n  KLP Prozess: ' + stunde.klpProzess.join(', ');
                  md += '\n';
                });
                md += '\n';
              }
            });
          }
        });
      }
    });
  }

  // Download
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fachLabel(fp.fach) + '_Jg' + fp.jahrgang + '_Fachplanung.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── KI-Planung (generisch für Block → Reihen, Reihe → Einheiten, Einheit → Stunden) ──
async function kiPlanung(lp, obj, typ, nta, resultDiv, { selBlock, selReihe, selEinheit }) {
  const antKey = localStorage.getItem('ant_key');
  if (!antKey) { alert('Bitte zuerst Anthropic API-Key in den Einstellungen hinterlegen.'); return; }

  const notizen = nta.value.trim();
  if (!notizen) { alert('Bitte zuerst Stichworte und Ideen in das Notizfeld schreiben.'); return; }
  obj.notizen = notizen; scheduleSave();

  resultDiv.innerHTML = '';
  const CHILD = { block: 'Reihen', reihe: 'Einheiten', einheit: 'Stunden' };
  const statusEl = tx('div', 'ki-plan-status', '✨ Schlage ' + CHILD[typ] + ' vor…');
  resultDiv.appendChild(statusEl);

  // KLP-Kontext
  const fachNameMap = { 'M': 'Mathematik', 'Ch': 'Chemie', 'Bio': 'Biologie', 'Ch_GK': 'Chemie', 'Ch_LK': 'Chemie', 'Bio_GK': 'Biologie', 'Bio_LK': 'Biologie' };
  const fachName = fachNameMap[lp.fach] || lp.fach;
  const isSII = lp.jahrgang === 'SII';
  const isGK = lp.fach.includes('GK'), isLK = lp.fach.includes('LK');
  const klpHits = KLPDB.filter(e => {
    if (e.fach !== fachName) return false;
    const eIsSII = e.stufe === 'SII' || e.id?.toUpperCase().includes('SII');
    if (isSII !== eIsSII) return false;
    if (isSII && isGK && e.id?.toUpperCase().includes('LK')) return false;
    if (isSII && isLK && e.id?.toUpperCase().includes('GK')) return false;
    return true;
  });
  const klpText = klpHits.map(e =>
    `[${e.id}] ${e.kompetenzcodes.join(', ')} | ${e.inhaltsfeld}: ${e.beschreibung}`
  ).join('\n');

  // Kontext-Hierarchie
  const pfad = [fachName + ' ' + lp.jahrgang];
  if (selBlock)   pfad.push('Block: ' + selBlock.titel);
  if (selReihe)   pfad.push('Reihe: ' + selReihe.titel);
  if (selEinheit) pfad.push('Einheit: ' + selEinheit.titel);

  // Geschwister-Kontext: andere Reihen im selben Block / andere Einheiten in derselben Reihe
  let geschwisterHinweis = '';
  if (typ === 'reihe' && selBlock) {
    const andereReihen = (selBlock.reihen || []).filter(r => r.id !== obj.id);
    if (andereReihen.length) {
      geschwisterHinweis = `\nWICHTIG – Andere Reihen im selben Block (bereits geplant, NICHT abdecken):\n` +
        andereReihen.map((r, i) => {
          const eins = (r.einheiten || []).map(e => e.titel).join(', ');
          return `- ${r.titel}` + (eins ? ` (Einheiten: ${eins})` : '');
        }).join('\n') +
        `\nDiese Themen sind in anderen Reihen bereits vorgesehen. Plane nur, was zur aktuellen Reihe "${obj.titel}" gehört.\n`;
    }
  }
  if (typ === 'einheit' && selReihe) {
    const andereEinheiten = (selReihe.einheiten || []).filter(e => e.id !== obj.id);
    if (andereEinheiten.length) {
      geschwisterHinweis = `\nWICHTIG – Andere Einheiten in derselben Reihe (bereits geplant, NICHT abdecken):\n` +
        andereEinheiten.map(e => `- ${e.titel}`).join('\n') +
        `\nDiese Themen sind in anderen Einheiten bereits vorgesehen. Plane nur, was zur aktuellen Einheit "${obj.titel}" gehört.\n`;
    }
  }
  if (typ === 'block' && lp) {
    const andereBlöcke = (lp.blocks || []).filter(b => b.id !== obj.id);
    if (andereBlöcke.length) {
      geschwisterHinweis = `\nWICHTIG – Andere Themenblöcke im Kurs (bereits geplant, NICHT abdecken):\n` +
        andereBlöcke.map(b => `- ${b.titel}`).join('\n') +
        `\nDiese Themen sind in anderen Blöcken bereits vorgesehen.\n`;
    }
  }

  // Bereits vorhandene Kinder: Aufbau-Kontext für Fortsetzungsplanung
  if (typ === 'einheit' && (obj.stunden || []).length > 0) {
    const bereitsGeplant = obj.stunden.map((s, i) => {
      let zeile = `  Stunde ${i + 1}: "${s.titel}"`;
      if (s.lernziel) zeile += `\n    Lernziel: ${s.lernziel}`;
      if (s.intention) zeile += `\n    Intention: ${s.intention}`;
      return zeile;
    }).join('\n');
    geschwisterHinweis += `\nBEREITS GEPLANTE STUNDEN in dieser Einheit (baue darauf auf):\n${bereitsGeplant}\n` +
      `Die neuen Stunden sollen inhaltlich und didaktisch an Stunde ${obj.stunden.length} anknüpfen.\n`;
  }
  if (typ === 'reihe' && (obj.einheiten || []).length > 0) {
    const bereitsGeplant = obj.einheiten.map((e, i) => {
      let zeile = `  Einheit ${i + 1}: "${e.titel}"`;
      const stundenTitel = (e.stunden || []).map(s => s.titel).filter(Boolean);
      if (stundenTitel.length) zeile += ` (Stunden: ${stundenTitel.join(', ')})`;
      return zeile;
    }).join('\n');
    geschwisterHinweis += `\nBEREITS GEPLANTE EINHEITEN in dieser Reihe (baue darauf auf):\n${bereitsGeplant}\n` +
      `Die neuen Einheiten sollen an Einheit ${obj.einheiten.length} anknüpfen.\n`;
  }

  // Aufgabe und Ausgabeformat je nach Ebene
  const AUFGABEN = {
    block: {
      aufgabe: `Schlage eine Gliederung des Blocks in Unterrichtsreihen vor.

HIERARCHIE dieser Lehrerin (verbindlich):
- STUNDE = 45 Min. (Einzelstunde) oder 90 Min. (Doppelstunde)
- EINHEIT = 2–4 Stunden, didaktisch zusammengehörig – alles was über eine Doppelstunde hinausgeht
- REIHE = mehrere Einheiten, thematischer Bogen über mehrere Wochen
- BLOCK = mehrere Reihen, großes Thema (das ist die aktuelle Ebene)

Ein Block hat typischerweise 2–4 Reihen. Beispiel für "Thermodynamik": Reihe 1 "Reaktionsenthalpie", Reihe 2 "Entropie und Gibbs-Energie". Keine Stunden oder Einheiten vorschlagen – nur Reihen.

Berücksichtige alle Stichworte, besondere Elemente (Referate, Klassenarbeiten…) und ordne jeder Reihe passende KLP-Kompetenzen zu.

TITEL: Kurz und prägnant – ein Oberbegriff, kein vollständiger Satz. Maximal 4–5 Wörter.`,
      childKey: 'items',
      childLabel: 'Reihe',
      anlegen: (parsed, parentObj) => {
        if (!parentObj.reihen) parentObj.reihen = [];
        parsed.items.forEach(e => parentObj.reihen.push({
          id: uid(), titel: e.titel, notizen: e.beschreibung || '', einheiten: []
        }));
      },
    },
    reihe: {
      aufgabe: `Schlage eine Gliederung der Reihe in Unterrichtseinheiten vor.

HIERARCHIE dieser Lehrerin (verbindlich):
- STUNDE = 45 Min. (Einzelstunde) oder 90 Min. (Doppelstunde)
- EINHEIT = 2–4 Stunden, didaktisch zusammengehörig – alles was über eine Doppelstunde hinausgeht
- REIHE = mehrere Einheiten (das ist die aktuelle Ebene)

Eine Reihe hat typischerweise 2–5 Einheiten. Keine einzelnen Stunden als Einheiten vorschlagen – eine Einheit hat immer mindestens 2 Stunden.

Berücksichtige alle Stichworte und ordne jeder Einheit passende KLP-Kompetenzen zu.

TITEL: Kurz und prägnant – ein Oberbegriff, kein vollständiger Satz. Maximal 4–5 Wörter.`,
      childKey: 'items',
      childLabel: 'Einheit',
      anlegen: (parsed, parentObj) => {
        if (!parentObj.einheiten) parentObj.einheiten = [];
        parsed.items.forEach(e => parentObj.einheiten.push({
          id: uid(), titel: e.titel, notizen: e.beschreibung || '', stunden: []
        }));
      },
    },
    einheit: {
      aufgabe: `Schlage eine Gliederung der Einheit in Unterrichtsstunden vor.

HIERARCHIE dieser Lehrerin (verbindlich):
- STUNDE = 45 Min. (Einzelstunde) oder 90 Min. (Doppelstunde)
- EINHEIT = 2–4 Stunden (das ist die aktuelle Ebene)

Eine Einheit hat 2–4 Stunden. Jede Stunde hat einen klaren Fokus und ein konkretes Lernziel. Gib bei jeder Stunde an ob es eine Einzel- (45 Min.) oder Doppelstunde (90 Min.) ist. Berücksichtige didaktische Progression.

TITEL: Kurz und prägnant – ein Oberbegriff, kein vollständiger Satz. Beispiel: "Hess'scher Satz" statt "Berechnung der Reaktionsenthalpie mithilfe des Hess'schen Satzes". Maximal 4–5 Wörter.`,
      childKey: 'items',
      childLabel: 'Stunde',
      anlegen: (parsed, parentObj) => {
        if (!parentObj.stunden) parentObj.stunden = [];
        parsed.items.forEach(e => parentObj.stunden.push({
          id: uid(), titel: e.titel, lernziel: e.beschreibung || '',
          prioritaet: 'pflicht', dauer: 45, phasen: [], klpInhalt: [], klpProzess: [], material: []
        }));
      },
    },
  };
  const cfg = AUFGABEN[typ];

  const prompt = `Du bist Didaktik-Expertin für NRW-Gymnasien.

KONTEXT: ${pfad.join(' › ')}
KURS: ${fachName}, ${lp.fach.includes('GK') ? 'Grundkurs' : lp.fach.includes('LK') ? 'Leistungskurs' : 'Kurs'}, Jahrgang ${lp.jahrgang}
${geschwisterHinweis}
NOTIZEN DER LEHRERIN:
${notizen}

VERFÜGBARE KLP-KOMPETENZEN:
${klpText || '(keine geladen)'}

AUFGABE: ${cfg.aufgabe}

Antworte NUR mit einem JSON-Objekt:
{
  "begruendung": "1-2 Sätze zur Gesamtstruktur",
  "items": [
    {
      "titel": "Titel der ${cfg.childLabel}",
      "beschreibung": "Kurze Beschreibung – was, wie, warum hier",
      "stunden": 2,
      "klpIds": ["ID1", "ID2"]
    }
  ]
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': antKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error((await res.json())?.error?.message || res.statusText);
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
    if (!parsed.items?.length) throw new Error('Keine Vorschläge erhalten.');

    resultDiv.innerHTML = '';
    const rb = mk('div', 'ki-plan-result');
    if (parsed.begruendung) rb.appendChild(tx('div', 'ki-plan-begr', '💡 ' + parsed.begruendung));

    parsed.items.forEach((e, i) => {
      const row = mk('div', 'ki-plan-row');
      const nr = tx('span', 'ki-plan-nr', (i + 1) + '.');
      const info = mk('div', 'ki-plan-info');
      info.appendChild(tx('div', 'ki-plan-titel', e.titel));
      if (e.beschreibung) info.appendChild(tx('div', 'ki-plan-desc', e.beschreibung));
      const meta = [];
      if (e.stunden) meta.push(e.stunden + ' Std.');
      if (e.klpIds?.length) meta.push(e.klpIds.join(', '));
      if (meta.length) info.appendChild(tx('div', 'ki-plan-meta', meta.join(' · ')));
      row.appendChild(nr); row.appendChild(info);
      rb.appendChild(row);
    });

    const actRow = mk('div', 'ki-plan-actions');
    const applyBtn = btn('✓ Übernehmen', 'btn btn-pri btn-sm');
    applyBtn.onclick = () => {
      const childArr = obj[{ block: 'reihen', reihe: 'einheiten', einheit: 'stunden' }[typ]] || [];
      if (childArr.length && !confirm('Vorhandene ' + CHILD[typ] + ' bleiben erhalten – neue werden hinzugefügt. Fortfahren?')) return;
      cfg.anlegen(parsed, obj);
      scheduleSave(); render();
    };
    const discardBtn = btn('Verwerfen', 'btn btn-ghost btn-sm');
    discardBtn.onclick = () => { resultDiv.innerHTML = ''; };
    actRow.appendChild(applyBtn); actRow.appendChild(discardBtn);
    rb.appendChild(actRow);

    // Iterationsfeld
    const iterWrap = mk('div', 'ki-iter-wrap');
    iterWrap.appendChild(tx('div', 'ki-iter-label', 'Feedback an die KI – was soll anders sein?'));
    const iterInp = document.createElement('textarea');
    iterInp.className = 'finp ki-iter-inp';
    iterInp.placeholder = 'z.B. „Lieber 2 Doppelstunden statt 3 Einzelstunden, wir haben wenig Zeit vor den Ferien"';
    iterWrap.appendChild(iterInp);
    const iterBtn = btn('↩ Überarbeiten', 'btn btn-ghost btn-sm');
    iterBtn.onclick = async () => {
      const feedback = iterInp.value.trim();
      if (!feedback) return;
      iterBtn.disabled = true; iterBtn.textContent = '…';
      try {
        const vorschlagText = parsed.items.map((e, i) =>
          `${i+1}. ${e.titel} (${e.stunden || '?'} Std.): ${e.beschreibung || ''}`
        ).join('\n');
        const iterPrompt = `Du hast folgenden Planungsvorschlag gemacht:\n\n${vorschlagText}\n\nDie Lehrerin hat folgendes Feedback:\n„${feedback}"\n\nBitte überarbeite den Vorschlag entsprechend. Halte dich weiterhin an die Hierarchie (Stunde=45/90 Min, Einheit=2-4 Std, kurze prägnante Titel). Antworte NUR mit dem gleichen JSON-Format:\n{"begruendung": "...", "items": [{"titel": "...", "beschreibung": "...", "stunden": 2, "klpIds": []}]}`;
        const res2 = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': antKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content: iterPrompt }] }),
        });
        const d2 = await res2.json();
        const t2 = d2.content?.[0]?.text || '';
        const p2 = JSON.parse(t2.match(/\{[\s\S]*\}/)?.[0] || '{}');
        if (!p2.items?.length) throw new Error('Kein Vorschlag erhalten.');
        parsed.items = p2.items;
        if (p2.begruendung) parsed.begruendung = p2.begruendung;
        // Neu rendern
        resultDiv.innerHTML = '';
        // Rekursiv neu aufrufen mit gleichem parsed – einfacher: render() triggert alles neu
        // Aber wir haben parsed lokal – also DOM direkt updaten
        rb.querySelector('.ki-plan-begr') && (rb.querySelector('.ki-plan-begr').textContent = '💡 ' + parsed.begruendung);
        rb.querySelectorAll('.ki-plan-row').forEach(r => r.remove());
        const insertBefore = rb.querySelector('.ki-plan-actions');
        parsed.items.forEach((e, i) => {
          const row = mk('div', 'ki-plan-row');
          const nr = tx('span', 'ki-plan-nr', (i + 1) + '.');
          const info = mk('div', 'ki-plan-info');
          info.appendChild(tx('div', 'ki-plan-titel', e.titel));
          if (e.beschreibung) info.appendChild(tx('div', 'ki-plan-desc', e.beschreibung));
          const meta = [];
          if (e.stunden) meta.push(e.stunden + ' Std.');
          if (e.klpIds?.length) meta.push(e.klpIds.join(', '));
          if (meta.length) info.appendChild(tx('div', 'ki-plan-meta', meta.join(' · ')));
          row.appendChild(nr); row.appendChild(info);
          rb.insertBefore(row, insertBefore);
        });
        resultDiv.appendChild(rb);
        iterInp.value = '';
      } catch(e) {
        iterBtn.textContent = '⚠ ' + e.message;
      } finally {
        iterBtn.disabled = false;
        if (iterBtn.textContent === '…') iterBtn.textContent = '↩ Überarbeiten';
      }
    };
    iterWrap.appendChild(iterBtn);
    rb.appendChild(iterWrap);
    resultDiv.appendChild(rb);

  } catch(e) {
    resultDiv.innerHTML = '';
    const err = tx('div', 'ki-plan-status', '⚠ Fehler: ' + e.message);
    err.style.color = '#dc2626';
    resultDiv.appendChild(err);
  }
}
