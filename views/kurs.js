// Zum Chat springen — aber nur, wenn er gerade geöffnet wurde. Die Seite wird
// bei jeder Kleinigkeit neu gezeichnet (Reihe auf- oder zuklappen, Speichern,
// Antwort der KI). Ohne diese Merkung springt die Ansicht jedes Mal weg.
let _chatGescrolltKey = null;
function _chatHinscrollen(chatEl, key) {
  if (_chatGescrolltKey === key) return;
  setTimeout(() => {
    // Wurde die Seite in der Zwischenzeit neu gezeichnet, hängt dieses Element
    // nicht mehr im Dokument — dann ist nichts passiert, und der Schlüssel darf
    // NICHT als erledigt gelten. Sonst öffnet sich der Chat unterhalb des
    // sichtbaren Bereichs und die Ansicht bleibt oben stehen: Chat scheinbar weg.
    if (!chatEl.isConnected) return;
    _chatGescrolltKey = key;
    chatEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

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
            dragPayload, dropType, onDrop, onEdit, editLabel, onChat, chatTitle, chatLabel,
            onFein, onUp, onDown, onDelete,
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
      const eb = mk('button', 'fp-tree-act-btn' + (editLabel ? ' fp-tree-act-btn--label' : ''));
      eb.textContent = editLabel || '✏'; eb.title = editLabel ? '' : 'Umbenennen';
      eb.onclick = e => { e.stopPropagation(); onEdit(); };
      actions.appendChild(eb);
    }
    if (onChat) {
      const cb = mk('button', 'fp-tree-act-btn' + (chatLabel ? ' fp-tree-act-btn--label' : ''));
      cb.textContent = chatLabel || '💬'; cb.title = chatTitle || 'Reihen planen';
      cb.onclick = e => { e.stopPropagation(); onChat(); };
      actions.appendChild(cb);
    }
    if (onFein) {
      const fb = mk('button', 'fp-tree-act-btn fp-tree-act-btn--label');
      fb.textContent = '💬 Fein';
      fb.title = 'Feinplanung besprechen — Didaktik, Methoden, Phasen';
      fb.onclick = e => { e.stopPropagation(); onFein(); };
      actions.appendChild(fb);
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
    const r = parseInt(farbe.slice(1,3),16), g = parseInt(farbe.slice(3,5),16), b = parseInt(farbe.slice(5,7),16);
    const div = mk('div', 'fp-gruppe-divider');
    div.style.paddingLeft = (16 + 2 * 44) + 'px';
    div.style.background = `rgba(${r},${g},${b},0.18)`;

    const dot = mk('span', 'fp-gruppe-dot');
    dot.style.background = farbe;
    div.appendChild(dot);

    div.appendChild(tx('span', 'fp-gruppe-label', gruppe.titel));

    const acts = mk('div', 'fp-gruppe-actions');
    const addS = mk('button', 'fp-tree-act-btn fp-tree-add');
    addS.textContent = '+ Stunde'; addS.title = 'Stunde in dieser Gruppe anlegen';
    addS.onclick = () => { S.modal = { type: 'newStunde', data: { fpId, blockId, reiheId: reihe.id, einheitId: gruppe.id } }; render(); };
    acts.appendChild(addS);
    const chat = mk('button', 'fp-tree-act-btn');
    chat.textContent = '💬'; chat.title = 'Feinplanung besprechen';
    chat.onclick = () => {
      const k = 'einheitChat_' + gruppe.id;
      // Immer nur ein Feinplanungs-Chat offen
      (reihe.einheiten || []).forEach(e => { if (e.id !== gruppe.id) delete S.open['einheitChat_' + e.id]; });
      delete S.open['feinChat_' + reihe.id];
      S.open[k] = !S.open[k];
      S.sel = { type: 'reihe', ids: [fpId, blockId, reihe.id] };
      render();
    };
    acts.appendChild(chat);
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
    const angelegte = (block.reihen || []).reduce((s, r) => s + summeStundenEinheiten(r.stunden), 0);
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
      const sn = summeStundenEinheiten(reihe.stunden);
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
        onEdit: () => { S.modal = { type: 'editReihe', data: { reihe, fpId: lp.id, blockId: block.id } }; render(); },
        editLabel: '✏ Bearbeiten',
        // Der Stunden-Chat war bisher nur über „Bearbeiten" im Overlay erreichbar
        chatLabel: '💬 Stunden',
        chatTitle: 'Stunden planen — Themen, Abfolge, Material',
        onChat: () => {
          const k = 'reiheChat_' + reihe.id;
          S.open[k] = !S.open[k];
          // Nur ein Chat je Reihe: Feinplanung schließen, sonst verdeckt sie diesen
          if (S.open[k]) {
            delete S.open['feinChat_' + reihe.id];
            (reihe.einheiten || []).forEach(e => { delete S.open['einheitChat_' + e.id]; });
          }
          S.sel = { type: 'reihe', ids: [lp.id, block.id, reihe.id] };
          if (!isOpen(rKey)) S._treeOffen[rKey] = true;
          render();
        },
        onFein: () => {
          const k = 'feinChat_' + reihe.id;
          // Ein Feinplanungs-Chat zur Zeit: Gruppen-Chats dieser Reihe schließen
          (reihe.einheiten || []).forEach(e => { delete S.open['einheitChat_' + e.id]; });
          S.open[k] = !S.open[k];
          if (S.open[k]) delete S.open['reiheChat_' + reihe.id];   // sonst bliebe der Stunden-Chat verdeckt offen
          S.sel = { type: 'reihe', ids: [lp.id, block.id, reihe.id] };
          if (!isOpen(rKey)) S._treeOffen[rKey] = true;
          render();
        },
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
          const { row: sRow } = makeRow({
            level: 2,
            title: (si + 1) + '. ' + (stunde.titel || '(ohne Titel)'),
            sub: stunde.lernziel ? stunde.lernziel.slice(0, 55) + '…' : null,
            isActive: selStundeId === stunde.id && !S.multisel.length,
            hasChildren: false,
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
            onEdit: () => { S.modal = { type: 'editStunde', data: { stunde } }; render(); },
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
          if (farbe) {
            const r = parseInt(farbe.slice(1,3),16), g = parseInt(farbe.slice(3,5),16), b = parseInt(farbe.slice(5,7),16);
            const indent = 16 + 2 * 44;
            sRow.style.background = `linear-gradient(to right, transparent ${indent}px, rgba(${r},${g},${b},0.09) ${indent}px)`;
          }
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

  // ── Planungsgrundlagen ──────────────────────────────────────
  // Was in diesem Fach und Jahrgang immer gilt: Rituale, schulinterner
  // Lehrplan, eigene Schwerpunkte. Alle drei Planungs-Chats lesen das mit.
  const grKey = 'grundlagen_' + lp.id;
  const grOffen = !!S.open[grKey];
  const grCard = mk('div', 'card');
  grCard.style.marginBottom = '12px';

  const grHdr = mk('div', '');
  grHdr.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;';
  grHdr.onclick = () => { S.open[grKey] = !grOffen; render(); };
  grHdr.appendChild(tx('span', '', grOffen ? '▾' : '▸')).style.cssText = 'color:var(--tx3);font-size:11px;';
  const grTitel = tx('span', '', 'Planungsgrundlagen');
  grTitel.style.cssText = 'font-size:13px;font-weight:700;';
  grHdr.appendChild(grTitel);
  const gefuellt = (lp.grundlagen || '').trim().length;
  const grHint = tx('span', '', gefuellt
    ? gefuellt + ' Zeichen · fließt in alle Planungs-Chats ein'
    : 'Rituale, schulinterner Lehrplan, eigene Schwerpunkte — noch leer');
  grHint.style.cssText = 'font-size:11.5px;color:var(--tx3);';
  grHdr.appendChild(grHint);
  grCard.appendChild(grHdr);

  if (grOffen) {
    const grBody = mk('div', '');
    grBody.style.cssText = 'padding:0 14px 14px;';
    const grTA = document.createElement('textarea');
    grTA.className = 'finp'; grTA.rows = 8;
    grTA.value = lp.grundlagen || '';
    grTA.placeholder = '4 Wochenstunden.\n\nRituale:\n- 1× pro Woche 10 Minuten Kopfrechnen. Wenn es thematisch passt, dort einbauen,\n  sonst als themenunabhängiger Stundeneinstieg.\n- 1× pro Monat ein Mathespiel (ganze Stunde). Spielformate wie Tabu lassen sich\n  auf andere Themen übertragen, wenn kein fertiges Material vorliegt.\n\nSchulinterner Lehrplan / eigene Schwerpunkte:\n- …';
    grTA.style.cssText = 'font-size:13px;width:100%;resize:vertical;line-height:1.6;';
    grTA.oninput = () => { lp.grundlagen = grTA.value; scheduleSave(); };
    grBody.appendChild(grTA);
    grCard.appendChild(grBody);
  }
  div.appendChild(grCard);

  const treePanel = mk('div', 'fp-tree-panel');
  treePanel.appendChild(buildFpTree(lp, sel));
  div.appendChild(treePanel);

  // ── Feinplanung: pro Gruppe (✨ auf der Gruppenzeile) oder für die ganze Reihe
  const offeneEinheit = selReihe && (selReihe.einheiten || []).find(e => S.open['einheitChat_' + e.id]);
  const feinGanzeReihe = selReihe && !offeneEinheit && S.open['feinChat_' + selReihe.id];
  let chatOffenKey = null;
  if (offeneEinheit || feinGanzeReihe) {
    const chatEl = buildEinheitChat(lp, selBlock, selReihe, offeneEinheit || null);
    div.appendChild(chatEl);
    chatOffenKey = 'fein_' + (offeneEinheit ? offeneEinheit.id : selReihe.id);
    _chatHinscrollen(chatEl, chatOffenKey);
  }

  // ── Reihen-Chat (wenn aus Modal geöffnet) ───────────────────
  else if (selReihe && S.open['reiheChat_' + selReihe.id]) {
    const chatEl = buildReiheChat(lp, selBlock, selReihe);
    div.appendChild(chatEl);
    chatOffenKey = 'reihe_' + selReihe.id;
    _chatHinscrollen(chatEl, chatOffenKey);
  }

  if (!chatOffenKey) _chatGescrolltKey = null;   // zu: beim nächsten Öffnen wieder springen

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

          function stundenListe(md, liste) {
            liste.forEach((stunde, si2) => {
              const prio = PRIO_LABEL[stunde.prioritaet] || 'Pflicht';
              md += '- **' + (si2+1) + '. ' + (stunde.titel || '(ohne Titel)') + '**';
              md += ' [' + prio + ']';
              if (stunde.lernziel) md += '\n  _Lernziel: ' + stunde.lernziel + '_';
              if (stunde.klpInhalt && stunde.klpInhalt.length > 0) md += '\n  KLP Inhalt: ' + stunde.klpInhalt.join(', ');
              if (stunde.klpProzess && stunde.klpProzess.length > 0) md += '\n  KLP Prozess: ' + stunde.klpProzess.join(', ');
              md += '\n';
            });
            return md;
          }

          if (!(reihe.stunden || []).length) {
            md += '_Keine Stunden angelegt._\n\n';
          } else {
            (reihe.einheiten || []).forEach((einheit, ei) => {
              const stundenInEinheit = (reihe.stunden || []).filter(s => s.einheitId === einheit.id);
              if (!stundenInEinheit.length) return;
              md += '#### ' + (bi+1) + '.' + (ri+1) + '.' + (ei+1) + ' ' + einheit.titel + '\n\n';
              md = stundenListe(md, stundenInEinheit);
              md += '\n';
            });

            const ohneGruppe = (reihe.stunden || []).filter(s => !s.einheitId);
            if (ohneGruppe.length) {
              if ((reihe.einheiten || []).length) md += '#### ' + (bi+1) + '.' + (ri+1) + '.x Ohne Gruppe\n\n';
              md = stundenListe(md, ohneGruppe);
              md += '\n';
            }
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
