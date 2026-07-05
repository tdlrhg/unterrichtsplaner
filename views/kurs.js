// ── Fachplanung-Baum ────────────────────────────────────────────────
function buildFpTree(lp, sel) {
  // Migration: altes Format (einheit.stunden[]) → flach (reihe.stunden[])
  migrateToFlatStunden(lp);

  if (!S._treeOffen) S._treeOffen = {};
  const isOpen = key => S._treeOffen[key] === true; // default: closed
  const toggleOpen = key => { S._treeOffen[key] = !isOpen(key); render(); };

  const selBlockId  = sel.ids && sel.ids[1];
  const selReiheId  = sel.ids && sel.ids[2];
  // ids[3] ist jetzt stundeId (kein Einheit-Level mehr in der Navigation)
  const selStundeId = sel.type === 'stunde' && sel.ids && sel.ids[3];

  const tree = mk('div', 'fp-tree');

  function makeDrop(row, acceptType, onDropFn) {
    row.ondragover = e => {
      if (e.dataTransfer.types.includes('application/x-fp-item')) {
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
        row.classList.add('fp-tree-row-drop');
      }
    };
    row.ondragleave = e => { if (!row.contains(e.relatedTarget)) row.classList.remove('fp-tree-row-drop'); };
    row.ondrop = e => {
      e.preventDefault(); row.classList.remove('fp-tree-row-drop');
      try {
        const p = JSON.parse(e.dataTransfer.getData('application/x-fp-item'));
        if (p.type === acceptType) onDropFn(p);
      } catch(_) {}
    };
  }

  function makeRow(opts) {
    const { level, title, sub, isActive, hasChildren, openKey, onSelect,
            dragPayload, dropType, onDrop, onEdit, onChat, onUp, onDown, onDelete,
            isFirst, isLast, onAdd, addLabel, accentColor } = opts;
    const open = openKey ? isOpen(openKey) : false;

    const row = mk('div', 'fp-tree-row fp-tree-level-' + level + (isActive ? ' active' : ''));
    row.style.paddingLeft = (16 + level * 44) + 'px';
    if (accentColor) row.style.setProperty('--row-accent', accentColor);

    // Toggle
    const tog = mk('span', 'fp-tree-toggle');
    if (hasChildren && openKey) {
      tog.textContent = open ? '▾' : '▸';
      tog.onclick = e => { e.stopPropagation(); toggleOpen(openKey); };
    } else {
      tog.textContent = '';
      tog.style.opacity = '0'; tog.style.pointerEvents = 'none';
    }
    row.appendChild(tog);

    // Label
    const label = mk('div', 'fp-tree-label');
    label.appendChild(tx('span', 'fp-tree-title', title));
    if (sub) label.appendChild(tx('span', 'fp-tree-sub', sub));
    label.onclick = e => { e.stopPropagation(); onSelect && onSelect(e); };
    row.appendChild(label);

    // Actions
    const actions = mk('div', 'fp-tree-actions');
    if (onAdd) {
      const ab = mk('button', 'fp-tree-act-btn fp-tree-add');
      ab.textContent = addLabel || '+ Neu'; ab.title = 'Anlegen';
      ab.onclick = e => { e.stopPropagation(); onAdd(); };
      actions.appendChild(ab);
    }
    if (onEdit) {
      const eb = mk('button', 'fp-tree-act-btn');
      eb.textContent = '✏'; eb.title = 'Umbenennen';
      eb.onclick = e => { e.stopPropagation(); onEdit(); };
      actions.appendChild(eb);
    }
    if (onChat) {
      const cb = mk('button', 'fp-tree-act-btn');
      cb.textContent = '✨'; cb.title = 'Reihen planen';
      cb.onclick = e => { e.stopPropagation(); onChat(); };
      actions.appendChild(cb);
    }
    if (onUp !== undefined) {
      const ub = mk('button', 'fp-tree-act-btn'); ub.textContent = '↑'; ub.title = 'Nach oben';
      if (isFirst) ub.disabled = true;
      ub.onclick = e => { e.stopPropagation(); onUp(); };
      actions.appendChild(ub);
    }
    if (onDown !== undefined) {
      const db = mk('button', 'fp-tree-act-btn'); db.textContent = '↓'; db.title = 'Nach unten';
      if (isLast) db.disabled = true;
      db.onclick = e => { e.stopPropagation(); onDown(); };
      actions.appendChild(db);
    }
    if (onDelete) {
      const dlb = mk('button', 'fp-tree-act-btn danger'); dlb.textContent = '✕'; dlb.title = 'Löschen';
      dlb.onclick = e => { e.stopPropagation(); onDelete(); };
      actions.appendChild(dlb);
    }
    row.appendChild(actions);

    // Drag
    if (dragPayload) {
      row.draggable = true;
      row.ondragstart = e => {
        e.dataTransfer.setData('application/x-fp-item', JSON.stringify(dragPayload));
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => row.classList.add('fp-tree-row-dragging'), 0);
      };
      row.ondragend = () => row.classList.remove('fp-tree-row-dragging');
    }
    if (dropType && onDrop) makeDrop(row, dropType, onDrop);

    return { row, open };
  }

  // Farbige Gruppentrennzeile (nicht anklickbar, kein Toggle)
  function makeGruppenDivider(gruppe, reihe, gi, fpId, blockId) {
    const farbe = gruppe.farbe || '#94a3b8';
    const div = mk('div', 'fp-gruppe-divider');
    div.style.paddingLeft = (16 + 2 * 44) + 'px';

    const dot = mk('span', 'fp-gruppe-dot');
    dot.style.background = farbe;
    div.appendChild(dot);

    div.appendChild(tx('span', 'fp-gruppe-label', gruppe.titel));

    const acts = mk('div', 'fp-gruppe-actions');
    const addS = mk('button', 'fp-tree-act-btn fp-tree-add');
    addS.textContent = '+ Stunde'; addS.title = 'Stunde in dieser Gruppe anlegen';
    addS.onclick = () => { S.modal = { type: 'newStunde', data: { fpId, blockId, reiheId: reihe.id, einheitId: gruppe.id } }; render(); };
    acts.appendChild(addS);
    const ren = mk('button', 'fp-tree-act-btn');
    ren.textContent = '✏'; ren.title = 'Umbenennen';
    ren.onclick = () => { S.modal = { type: 'umbenennen', data: { obj: gruppe, feld: 'titel', label: 'Gruppe' } }; render(); };
    acts.appendChild(ren);
    const del = mk('button', 'fp-tree-act-btn danger');
    del.textContent = '✕'; del.title = 'Gruppe löschen (Stunden bleiben ungroupiert)';
    del.onclick = () => {
      if (confirm('Gruppe "' + gruppe.titel + '" löschen? Die Stunden bleiben erhalten, verlieren aber ihre Gruppe.')) {
        (reihe.stunden || []).forEach(s => { if (s.einheitId === gruppe.id) delete s.einheitId; });
        reihe.einheiten = reihe.einheiten.filter(e => e.id !== gruppe.id);
        scheduleSave(); render();
      }
    };
    acts.appendChild(del);
    div.appendChild(acts);
    return div;
  }

  // ── Blöcke ────────────────────────────────────────────────────────
  if (!(lp.blocks || []).length) {
    tree.appendChild(tx('div', 'fp-tree-empty', 'Noch keine Blöcke angelegt.'));
  }

  (lp.blocks || []).forEach((block, bi) => {
    const bKey = 'b_' + block.id;
    const rn = (block.reihen || []).length;
    const angelegte = (block.reihen || []).reduce((s, r) => s + (r.stunden || []).length, 0);
    const bSub = rn + ' Reihe' + (rn !== 1 ? 'n' : '') +
      (block.stundenGesamt ? ' · ' + angelegte + '/' + parseInt(block.stundenGesamt) + ' Std.' : (angelegte > 0 ? ' · ' + angelegte + ' Std.' : ''));

    const { row: bRow, open: bOpen } = makeRow({
      level: 0, title: block.titel, sub: bSub,
      isActive: selBlockId === block.id && !selReiheId,
      hasChildren: rn > 0, openKey: bKey,
      onSelect: () => {
        S.sel = { type: 'block', ids: [lp.id, block.id] };
        if (!isOpen(bKey)) S._treeOffen[bKey] = true;
        render();
      },
      dropType: 'reihe',
      onDrop: p => {
        if (p.srcBlockId === block.id) return;
        const src = (lp.blocks||[]).find(b => b.id === p.srcBlockId);
        const reihe = src && (src.reihen||[]).find(r => r.id === p.reiheId);
        if (!reihe) return;
        src.reihen = src.reihen.filter(r => r.id !== p.reiheId);
        if (!block.reihen) block.reihen = [];
        block.reihen.push(reihe);
        S.sel = { type: 'reihe', ids: [lp.id, block.id, reihe.id] };
        scheduleSave(); render();
      },
      onEdit: () => { S.modal = { type: 'editBlock', data: { block } }; render(); },
      onChat: () => { S.open['blockChat_' + block.id] = !S.open['blockChat_' + block.id]; render(); },
      onUp: () => { swap(lp.blocks, bi, bi-1); scheduleSave(); render(); },
      onDown: () => { swap(lp.blocks, bi, bi+1); scheduleSave(); render(); },
      isFirst: bi === 0, isLast: bi === lp.blocks.length-1,
      onDelete: () => {
        if (confirm('Block "' + block.titel + '" löschen?')) {
          lp.blocks = lp.blocks.filter(b => b.id !== block.id);
          if (selBlockId === block.id) S.sel = null;
          scheduleSave(); render();
        }
      },
      onAdd: () => { S.modal = { type: 'newReihe', data: { fpId: lp.id, blockId: block.id } }; render(); },
      addLabel: '+ Reihe',
    });
    tree.appendChild(bRow);
    if (!bOpen) return;

    // ── Reihen ──────────────────────────────────────────────────────
    if (!(block.reihen || []).length) {
      const emp = tx('div', 'fp-tree-empty', 'Keine Reihen.');
      emp.style.paddingLeft = (16 + 1 * 44) + 'px';
      tree.appendChild(emp);
    }

    (block.reihen || []).forEach((reihe, ri) => {
      const rKey = 'r_' + reihe.id;
      const sn = (reihe.stunden || []).length;
      const gn = (reihe.einheiten || []).length;
      const rSub = (reihe.stundenAnzahl ? sn + '/' + reihe.stundenAnzahl + ' Std.' : sn + ' Stunde' + (sn !== 1 ? 'n' : ''))
                + (gn > 0 ? ' · ' + gn + ' Gruppe' + (gn !== 1 ? 'n' : '') : '');

      const { row: rRow, open: rOpen } = makeRow({
        level: 1, title: reihe.titel, sub: rSub,
        isActive: selReiheId === reihe.id && !selStundeId,
        hasChildren: true, openKey: rKey,
        onSelect: () => {
          S.sel = { type: 'reihe', ids: [lp.id, block.id, reihe.id] };
          if (!isOpen(rKey)) S._treeOffen[rKey] = true;
          render();
        },
        dragPayload: { type: 'reihe', srcBlockId: block.id, reiheId: reihe.id },
        onEdit: () => { S.modal = { type: 'editReihe', data: { reihe } }; render(); },
        onUp: () => { swap(block.reihen, ri, ri-1); scheduleSave(); render(); },
        onDown: () => { swap(block.reihen, ri, ri+1); scheduleSave(); render(); },
        isFirst: ri === 0, isLast: ri === block.reihen.length-1,
        onDelete: () => {
          if (confirm('Reihe löschen?')) {
            block.reihen = block.reihen.filter(r => r.id !== reihe.id);
            if (selReiheId === reihe.id) S.sel = { type: 'block', ids: [lp.id, block.id] };
            scheduleSave(); render();
          }
        },
        onAdd: () => { S.modal = { type: 'newStunde', data: { fpId: lp.id, blockId: block.id, reiheId: reihe.id } }; render(); },
        addLabel: '+ Stunde',
      });
      tree.appendChild(rRow);
      if (!rOpen) return;

      // ── Stunden (flach in Originalreihenfolge, Gruppenheader inline) ──
      if (!(reihe.stunden || []).length) {
        const emp = tx('div', 'fp-tree-empty', 'Noch keine Stunden.');
        emp.style.paddingLeft = (16 + 2 * 44) + 'px';
        tree.appendChild(emp);
      } else {
        if (!S.multisel) S.multisel = [];
        const gruppenMap = {};
        (reihe.einheiten || []).forEach(e => { gruppenMap[e.id] = e; });
        let lastGrpId = null;
        const allSn = reihe.stunden;

        allSn.forEach((stunde, si) => {
          const grpId = stunde.einheitId || null;
          // Gruppenheader vor erster Stunde der Gruppe
          if (grpId !== lastGrpId && grpId && gruppenMap[grpId]) {
            tree.appendChild(makeGruppenDivider(gruppenMap[grpId], reihe, si, lp.id, block.id));
          }
          lastGrpId = grpId;

          const gruppe = grpId ? gruppenMap[grpId] : null;
          const farbe = gruppe ? gruppe.farbe : null;
          const isMSel = S.multisel.includes(stunde.id);
          const prioIcon = { pflicht:'🟢', optional:'🟡', puffer:'🔵', klassenarbeit:'📝', rueckgabe:'📋' }[stunde.prioritaet || 'pflicht'] || '🟢';
          const { row: sRow } = makeRow({
            level: 2,
            title: prioIcon + ' ' + (stunde.titel || '(ohne Titel)'),
            sub: stunde.lernziel ? stunde.lernziel.slice(0, 55) + '…' : null,
            isActive: selStundeId === stunde.id && !S.multisel.length,
            hasChildren: false, accentColor: farbe,
            onSelect: e => {
              if (e && (e.ctrlKey || e.metaKey)) {
                if (!S.multisel) S.multisel = [];
                S.multisel = isMSel
                  ? S.multisel.filter(id => id !== stunde.id)
                  : [...S.multisel, stunde.id];
                const sc = document.querySelector('.content');
                const top = sc ? sc.scrollTop : 0;
                render();
                if (sc) sc.scrollTop = top;
                return;
              }
              S.multisel = [];
              S.sel = { type: 'stunde', ids: [lp.id, block.id, reihe.id, stunde.id] };
              render();
            },
            dragPayload: { type: 'stunde', srcReiheId: reihe.id, stundeId: stunde.id },
            onEdit: () => { S.modal = { type: 'umbenennen', data: { obj: stunde, feld: 'titel', label: 'Stunde' } }; render(); },
            onUp:   () => { swap(allSn, si, si - 1); scheduleSave(); render(); },
            onDown: () => { swap(allSn, si, si + 1); scheduleSave(); render(); },
            isFirst: si === 0, isLast: si === allSn.length - 1,
            onDelete: () => {
              if (confirm('Stunde löschen?')) {
                reihe.stunden = reihe.stunden.filter(s => s.id !== stunde.id);
                if (selStundeId === stunde.id) S.sel = { type: 'reihe', ids: [lp.id, block.id, reihe.id] };
                scheduleSave(); render();
              }
            },
          });
          if (isMSel) sRow.classList.add('fp-tree-row-multisel');
          if (farbe) sRow.style.borderLeft = '3px solid ' + farbe;
          tree.appendChild(sRow);
        });

        // Aktionsleiste bei Multi-Selektion
        if (S.multisel.length >= 2) {
          const bar = mk('div', 'fp-multisel-bar');
          bar.style.paddingLeft = (16 + 2 * 44) + 'px';
          bar.appendChild(tx('span', 'fp-multisel-count', S.multisel.length + ' Stunden ausgewählt'));
          const grpBtn = btn('Zu Gruppe zusammenfassen', 'btn btn-primary btn-sm');
          grpBtn.onclick = () => {
            const name = prompt('Gruppenname:');
            if (!name || !name.trim()) return;
            if (!reihe.einheiten) reihe.einheiten = [];
            const usedColors = new Set(reihe.einheiten.map(e => e.farbe));
            const farbe = GRUPPEN_FARBEN.find(c => !usedColors.has(c)) || GRUPPEN_FARBEN[reihe.einheiten.length % GRUPPEN_FARBEN.length];
            const grp = { id: uid(), titel: name.trim(), farbe };
            reihe.einheiten.push(grp);
            (reihe.stunden || []).forEach(s => { if (S.multisel.includes(s.id)) s.einheitId = grp.id; });
            S.multisel = [];
            scheduleSave(); render();
          };
          bar.appendChild(grpBtn);
          const clrBtn = btn('Auswahl aufheben', 'btn btn-ghost btn-sm');
          clrBtn.onclick = () => {
            const sc = document.querySelector('.content');
            const top = sc ? sc.scrollTop : 0;
            S.multisel = []; render();
            if (sc) sc.scrollTop = top;
          };
          bar.appendChild(clrBtn);
          tree.appendChild(bar);
        }
      }
    });
  });

  const addBlockBtn = mk('button', 'fp-tree-add-top');
  addBlockBtn.textContent = '+ Themenblock anlegen';
  addBlockBtn.onclick = () => { S.modal = { type: 'newBlock', data: { fpId: lp.id } }; render(); };
  tree.appendChild(addBlockBtn);

  return tree;
}

// ── Fachplanung-Ansicht ───────────────────────────────────────────────
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
  const kurse = kurseForFachplanung(lp.id);
  const aktKurs = getAktKurs(lp.id);
  left.appendChild(tx('div', 'c-sub', 'Fachplanung · ' + kurse.length + ' Kurs/Kurse'));
  hdr.appendChild(left);

  // Kurs-Selector — nur wenn mehrere Kurse verknüpft
  if (kurse.length > 1) {
    const kSel = mk('div', '');
    kSel.style.cssText = 'display:flex;align-items:center;gap:8px;';
    kSel.appendChild(tx('span', '', 'Planung für:'));
    kSel.lastChild.style.cssText = 'font-size:12px;color:var(--tx2);';
    const sel = document.createElement('select');
    sel.className = 'finp';
    sel.style.cssText = 'width:auto;padding:4px 8px;font-size:13px;';
    kurse.forEach(k => {
      const o = document.createElement('option');
      o.value = k.id; o.textContent = k.klasse + (k.schuljahr ? ' · ' + k.schuljahr : '');
      if (aktKurs?.id === k.id) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = () => { S.aktKursId = sel.value; render(); };
    kSel.appendChild(sel);
    hdr.appendChild(kSel);
  }
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
  const selBlockId  = sel.ids && sel.ids[1];
  const selReiheId  = sel.ids && sel.ids[2];
  const selBlock  = selBlockId  && (lp.blocks || []).find(b => b.id === selBlockId);
  const selReihe  = selBlock    && (selBlock.reihen || []).find(r => r.id === selReiheId);

  const treePanel = mk('div', 'fp-tree-panel');
  treePanel.appendChild(buildFpTree(lp, sel));
  div.appendChild(treePanel);

  // ── Detailbereich für ausgewählte Reihe ─────────────────────
  if (selReihe) {
    const nc = mk('div', 'card');
    const hdr = cardHdr(selReihe.titel);
    const editBtn = btn('✏', 'btn btn-ghost btn-xs');
    editBtn.title = 'Reihe bearbeiten';
    editBtn.onclick = () => { S.modal = { type: 'editReihe', data: { reihe: selReihe } }; render(); };
    hdr.appendChild(editBtn);
    nc.appendChild(hdr);

    const nb = mk('div', 'card-body');
    nb.style.cssText = 'padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;';

    // kompakte Infos
    if (selReihe.stundenAnzahl) {
      nb.appendChild(tx('span', 'fp-detail-chip', selReihe.stundenAnzahl + ' Std.'));
    }
    if (selReihe.schwerpunkt) {
      const sp = tx('span', 'fp-detail-chip', selReihe.schwerpunkt);
      sp.style.color = 'var(--tx2)';
      nb.appendChild(sp);
    }

    // ✨ Stunden planen
    const reiheChat = !!S.open['reiheChat_' + selReihe.id];
    const stundenBtn = btn('✨ Stunden planen' + (reiheChat ? ' ▼' : ' ›'), 'btn btn-primary btn-sm');
    stundenBtn.onclick = () => { S.open['reiheChat_' + selReihe.id] = !reiheChat; render(); };
    nb.appendChild(stundenBtn);

    nc.appendChild(nb);
    div.appendChild(nc);

    if (reiheChat) {
      div.appendChild(buildReiheChat(lp, selBlock, selReihe));
    }
  }

  // ── Block-Chat (unterhalb des Baums, wenn ✨ aktiv) ──────────
  if (selBlock && !selReihe && S.open['blockChat_' + selBlock.id]) {
    div.appendChild(buildBlockChat(lp, selBlock));
  }

  return div;
}

function swap(arr, i, j) {
  const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
}

function kurseForFachplanung(fpId) {
  return (S.data.kurse || []).filter(k => k.fachplanungId === fpId);
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

  // Didaktik-Kontext: Ebene je nach Typ + LG-Tags des aktiven Kurses
  const didEbenen = typ === 'block' ? ['reihe'] : ['stunde', 'reihe'];
  const aktKurs = getAktKurs(lp.id);
  const lgThemen = aktKurs ? getLGThemen(aktKurs.id) : [];
  const didCtx = getDIDContext(didEbenen, lgThemen);

  const prompt = `Du bist Didaktik-Expertin für NRW-Gymnasien.

KONTEXT: ${pfad.join(' › ')}
KURS: ${fachName}, ${lp.fach.includes('GK') ? 'Grundkurs' : lp.fach.includes('LK') ? 'Leistungskurs' : 'Kurs'}, Jahrgang ${lp.jahrgang}
${geschwisterHinweis}
NOTIZEN DER LEHRERIN:
${notizen}

VERFÜGBARE KLP-KOMPETENZEN:
${klpText || '(keine geladen)'}
${didCtx}
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
    const text = await callKI(prompt, { maxTokens: 2000 });
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
        const t2 = await callKI(iterPrompt, { maxTokens: 1500 });
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
