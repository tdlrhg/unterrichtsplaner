// ── Modal: Fachplanung & Inhalte ──────────────────────────────────
function modalHandlerPlanung(type, data, m) {
  if (type === 'newBlock') {
    m.appendChild(tx('div', 'modal-title', 'Neuer Themenblock'));
    m.appendChild(modalInput('mt', 'Titel', 'z.B. Rationale Zahlen'));
    m.appendChild(modalInput('ms', 'Geplante Stunden', '', '', 'number'));
    const footer = mk('div', 'modal-footer');
    footer.appendChild(cancelBtn());
    const sv = btn('Anlegen', 'btn btn-pri');
    sv.onclick = () => {
      const t = document.getElementById('mt').value.trim();
      if (!t) return;
      const lp = getFachplanung(data.fpId);
      if (!lp.blocks) lp.blocks = [];
      lp.blocks.push({ id: uid(), titel: t, stundenGesamt: document.getElementById('ms').value, reihen: [] });
      S.modal = null; scheduleSave(); render();
    };
    footer.appendChild(sv); m.appendChild(footer);
    return true;
  }

  if (type === 'newReihe') {
    m.appendChild(tx('div', 'modal-title', 'Neue Unterrichtsreihe'));
    m.appendChild(modalInput('mt', 'Titel', ''));
    const footer = mk('div', 'modal-footer');
    footer.appendChild(cancelBtn());
    const sv = btn('Anlegen', 'btn btn-pri');
    sv.onclick = () => {
      const t = document.getElementById('mt').value.trim();
      if (!t) return;
      const block = findBlock(data.fpId, data.blockId);
      if (!block.reihen) block.reihen = [];
      block.reihen.push({ id: uid(), titel: t, einheiten: [] });
      S.modal = null; scheduleSave(); render();
    };
    footer.appendChild(sv); m.appendChild(footer);
    return true;
  }

  if (type === 'newEinheit') {
    m.appendChild(tx('div', 'modal-title', 'Neue Unterrichtseinheit'));
    m.appendChild(modalInput('mt', 'Titel', ''));
    const footer = mk('div', 'modal-footer');
    footer.appendChild(cancelBtn());
    const sv = btn('Anlegen', 'btn btn-pri');
    sv.onclick = () => {
      const t = document.getElementById('mt').value.trim();
      if (!t) return;
      const reihe = findReihe(data.fpId, data.blockId, data.reiheId);
      if (!reihe.einheiten) reihe.einheiten = [];
      reihe.einheiten.push({ id: uid(), titel: t, stunden: [] });
      S.modal = null; scheduleSave(); render();
    };
    footer.appendChild(sv); m.appendChild(footer);
    return true;
  }

  if (type === 'newStunde') {
    m.appendChild(tx('div', 'modal-title', 'Neue Stunde'));
    m.appendChild(modalInput('mt', 'Titel', 'z.B. Einführung Prozentrechnung'));
    const footer = mk('div', 'modal-footer');
    footer.appendChild(cancelBtn());
    const sv = btn('Anlegen & öffnen', 'btn btn-pri');
    sv.onclick = () => {
      const t = document.getElementById('mt').value.trim();
      const einheit = findEinheit(data.fpId, data.blockId, data.reiheId, data.einheitId);
      if (!einheit.stunden) einheit.stunden = [];
      const ns = { id: uid(), titel: t, lernziel: '', dauer: 45, phasen: [], klpInhalt: [], klpProzess: [], material: [], tafelbild: '', lehrerkommentar: '' };
      einheit.stunden.push(ns);
      S.modal = null;
      S.sel = { type: 'stunde', ids: [data.fpId, data.blockId, data.reiheId, data.einheitId, ns.id] };
      scheduleSave(); render();
    };
    footer.appendChild(sv); m.appendChild(footer);
    return true;
  }

  if (type === 'umbenennen') {
    const { obj, feld, label } = data;
    const istBlock = label === 'Themenblock';
    m.appendChild(tx('div', 'modal-title', label + ' bearbeiten'));
    const fg = mk('div', 'fg');
    fg.appendChild(tx('label', 'fl', 'Name'));
    const inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'mumb'; inp.className = 'finp';
    inp.value = obj[feld] || '';
    inp.onkeydown = e => { if (e.key === 'Enter' && !istBlock) sv.click(); };
    fg.appendChild(inp);
    m.appendChild(fg);
    if (istBlock) {
      const fg2 = mk('div', 'fg');
      fg2.appendChild(tx('label', 'fl', 'Geplante Stunden'));
      const stdInp = document.createElement('input');
      stdInp.type = 'number'; stdInp.id = 'mstd'; stdInp.className = 'finp';
      stdInp.value = obj.stundenGesamt || ''; stdInp.placeholder = 'z.B. 12';
      stdInp.style.maxWidth = '120px';
      fg2.appendChild(stdInp);
      const hint = tx('div', '', 'Wird für die Zeitachse verwendet solange noch keine Stunden angelegt sind.');
      hint.style.cssText = 'font-size:11px;color:var(--tx3);margin-top:4px;';
      fg2.appendChild(hint);
      m.appendChild(fg2);
    }
    const footer = mk('div', 'modal-footer');
    footer.appendChild(cancelBtn());
    const sv = btn('Speichern', 'btn btn-pri');
    sv.onclick = () => {
      const val = document.getElementById('mumb').value.trim();
      if (!val) return;
      obj[feld] = val;
      if (istBlock) obj.stundenGesamt = document.getElementById('mstd').value;
      S.modal = null; scheduleSave(); render();
    };
    footer.appendChild(sv); m.appendChild(footer);
    setTimeout(() => { const i = document.getElementById('mumb'); if(i){i.focus();i.select();} }, 50);
    return true;
  }

  if (type === 'blockOptionen') {
    const { block, fpId, kursId } = data;
    m.appendChild(tx('div', 'modal-title', block.titel));
    const optGrid = mk('div', '');
    optGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px;';
    const optA = mk('div', '');
    optA.style.cssText = 'padding:16px;border:2px solid var(--bord);border-radius:8px;cursor:pointer;text-align:center;transition:all .15s;';
    optA.innerHTML = '<div style="font-size:24px">📘</div><div style="font-weight:700;margin-top:6px;">Zur Fachplanung</div>';
    optA.onmouseenter = () => { optA.style.borderColor='var(--pri)'; optA.style.background='#eff6ff'; };
    optA.onmouseleave = () => { optA.style.borderColor='var(--bord)'; optA.style.background=''; };
    optA.onclick = () => { S.aktFpId=fpId; S.view='fachplanung'; S.sel={type:'block',ids:[fpId,block.id]}; S.modal=null; render(); };
    const optB = mk('div', '');
    optB.style.cssText = 'padding:16px;border:2px solid var(--bord);border-radius:8px;cursor:pointer;text-align:center;transition:all .15s;';
    optB.innerHTML = '<div style="font-size:24px">✕</div><div style="font-weight:700;margin-top:6px;">Platzierung aufheben</div>';
    optB.onmouseenter = () => { optB.style.borderColor='var(--red)'; optB.style.background='#fff5f5'; };
    optB.onmouseleave = () => { optB.style.borderColor='var(--bord)'; optB.style.background=''; };
    optB.onclick = () => { if(!S.data.zeitplanung[kursId])S.data.zeitplanung[kursId]={}; delete S.data.zeitplanung[kursId][block.id]; S.modal=null; scheduleSave(); render(); };
    optGrid.appendChild(optA); optGrid.appendChild(optB);
    m.appendChild(optGrid);
    const footer = mk('div', 'modal-footer'); footer.appendChild(cancelBtn()); m.appendChild(footer);
    return true;
  }

  if (type === 'moveStunde') {
    const { fpId, blockId, reiheId, einheitId, stundeId } = data;
    const fp = getFachplanung(fpId);
    const srcEinheit = findEinheit(fpId, blockId, reiheId, einheitId);
    const stunde = findStunde(fpId, blockId, reiheId, einheitId, stundeId);
    if (!fp || !srcEinheit || !stunde) return false;

    m.appendChild(tx('div', 'modal-title', '↗ Stunde verschieben'));
    m.appendChild(tx('div', 'modal-hint', '"' + (stunde.titel || 'Stunde') + '" in eine andere Einheit verschieben'));

    // Alle Reihen+Einheiten sammeln (außer der Quelle)
    const reiheOpts = [['', '— Reihe wählen —']];
    const einheitOptsMap = {}; // reiheKey → [[val,lbl]]
    (fp.blocks || []).forEach(bl => {
      (bl.reihen || []).forEach(r => {
        const rKey = bl.id + '|' + r.id;
        reiheOpts.push([rKey, bl.titel + ' › ' + r.titel]);
        einheitOptsMap[rKey] = [['', '— Einheit wählen —']];
        (r.einheiten || []).forEach(e => {
          // Quelle ausschließen
          if (bl.id === blockId && r.id === reiheId && e.id === einheitId) return;
          einheitOptsMap[rKey].push([e.id, e.titel]);
        });
      });
    });

    const rSel = modalSelect('ms-reihe', 'Ziel-Reihe', reiheOpts, '');
    const eSel = modalSelect('ms-einheit', 'Ziel-Einheit', [['', '— erst Reihe wählen —']], '');
    m.appendChild(rSel);
    m.appendChild(eSel);

    // Einheit-Select dynamisch befüllen wenn Reihe gewählt
    const rEl = rSel.querySelector('select');
    const eEl = eSel.querySelector('select');
    rEl.onchange = () => {
      eEl.innerHTML = '';
      const opts = einheitOptsMap[rEl.value] || [['', '— keine Einheiten —']];
      opts.forEach(([v, l]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = l; eEl.appendChild(o);
      });
    };

    const footer = mk('div', 'modal-footer');
    const okb = btn('Verschieben', 'btn btn-pri');
    okb.onclick = () => {
      const rKey = rEl.value;
      const tgtEinheitId = eEl.value;
      if (!rKey || !tgtEinheitId) { alert('Bitte Reihe und Einheit auswählen.'); return; }
      const [tgtBlockId, tgtReiheId] = rKey.split('|');
      const tgtEinheit = findEinheit(fpId, tgtBlockId, tgtReiheId, tgtEinheitId);
      if (!tgtEinheit) return;
      // Verschieben
      srcEinheit.stunden = srcEinheit.stunden.filter(s => s.id !== stundeId);
      if (!tgtEinheit.stunden) tgtEinheit.stunden = [];
      tgtEinheit.stunden.push(stunde);
      S.modal = null;
      S.sel = { type: 'stunde', ids: [fpId, tgtBlockId, tgtReiheId, tgtEinheitId, stundeId] };
      scheduleSave(); render();
    };
    footer.appendChild(cancelBtn());
    footer.appendChild(okb);
    m.appendChild(footer);
    return true;
  }

  return false;
}
