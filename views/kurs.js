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

function makeColItem(title, sub, isActive, onSelect, onUp, onDown, onDelete, isFirst, isLast, onEdit) {
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
          () => { S.modal={type:'umbenennen',data:{obj:block,feld:'titel',label:'Themenblock'}}; render(); }
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
            () => { S.modal={type:'umbenennen',data:{obj:reihe,feld:'titel',label:'Unterrichtsreihe'}}; render(); }
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
            () => { S.modal={type:'umbenennen',data:{obj:einheit,feld:'titel',label:'Unterrichtseinheit'}}; render(); }
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
            () => { S.modal={type:'umbenennen',data:{obj:stunde,feld:'titel',label:'Stunde'}}; render(); }
          ));
        });
    cols.appendChild(c4);
  }

  div.appendChild(cols);

  // ── Notizen zur ausgewählten Ebene ────────────────────────────
  const notizObj = selEinheit || selReihe || selBlock;
  const notizLabel = selEinheit ? 'Notizen · ' + selEinheit.titel
                   : selReihe  ? 'Notizen · ' + selReihe.titel
                   : selBlock  ? 'Notizen · ' + selBlock.titel
                   : null;
  if (notizObj && notizLabel) {
    const nc = mk('div', 'card');
    nc.appendChild(cardHdr(notizLabel));
    const nb = mk('div', 'card-body');
    const nta = document.createElement('textarea');
    nta.className = 'finp fp-notizen';
    nta.placeholder = 'Stichworte, Ideen, Materialhinweise, offene Fragen…';
    nta.value = notizObj.notizen || '';
    nta.onblur = () => { notizObj.notizen = nta.value; scheduleSave(); };
    nb.appendChild(nta);
    nc.appendChild(nb);
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
    const isSII = ['EF', 'Q1', 'Q2'].includes(lp.jahrgang);
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
