// ── Modal: Fachplanung & Inhalte ──────────────────────────────────
const GRUPPEN_FARBEN = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];

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
      block.reihen.push({ id: uid(), titel: t, einheiten: [], stunden: [] });
      S.modal = null; scheduleSave(); render();
    };
    footer.appendChild(sv); m.appendChild(footer);
    return true;
  }

  // Neue Gruppe (ehem. Einheit) – nur noch Metadaten, keine stunden[]
  if (type === 'newGruppe') {
    m.appendChild(tx('div', 'modal-title', 'Neue Gruppe'));
    const hint = tx('div', 'modal-hint', 'Gruppen fassen Stunden einer Reihe thematisch zusammen.');
    m.appendChild(hint);
    m.appendChild(modalInput('mt', 'Name der Gruppe', 'z.B. Einführung, Vertiefung …'));
    const footer = mk('div', 'modal-footer');
    footer.appendChild(cancelBtn());
    const sv = btn('Anlegen', 'btn btn-pri');
    sv.onclick = () => {
      const t = document.getElementById('mt').value.trim();
      if (!t) return;
      const reihe = findReihe(data.fpId, data.blockId, data.reiheId);
      if (!reihe.einheiten) reihe.einheiten = [];
      // Nächste freie Farbe wählen
      const usedColors = new Set((reihe.einheiten || []).map(e => e.farbe));
      const farbe = GRUPPEN_FARBEN.find(c => !usedColors.has(c)) || GRUPPEN_FARBEN[reihe.einheiten.length % GRUPPEN_FARBEN.length];
      reihe.einheiten.push({ id: uid(), titel: t, farbe });
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
      const reihe = findReihe(data.fpId, data.blockId, data.reiheId);
      if (!reihe) return;
      if (!reihe.stunden) reihe.stunden = [];
      const ns = { id: uid(), titel: t, lernziel: '', dauer: 45, phasen: [], klpInhalt: [], klpProzess: [], material: [], tafelbild: '', lehrerkommentar: '' };
      if (data.einheitId) ns.einheitId = data.einheitId; // optionale Gruppen-Zuweisung
      reihe.stunden.push(ns);
      S.modal = null;
      S.sel = { type: 'stunde', ids: [data.fpId, data.blockId, data.reiheId, ns.id] };
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
    const { fpId, blockId, reiheId, stundeId } = data;
    const fp = getFachplanung(fpId);
    const srcReihe = findReihe(fpId, blockId, reiheId);
    const stunde = findStunde(fpId, blockId, reiheId, stundeId);
    if (!fp || !srcReihe || !stunde) return false;

    m.appendChild(tx('div', 'modal-title', '↗ Stunde verschieben'));
    m.appendChild(tx('div', 'modal-hint', '"' + (stunde.titel || 'Stunde') + '" in eine andere Reihe verschieben'));

    // Alle Reihen sammeln (außer der Quelle)
    const reiheOpts = [['', '— Reihe wählen —']];
    (fp.blocks || []).forEach(bl => {
      (bl.reihen || []).forEach(r => {
        if (bl.id === blockId && r.id === reiheId) return; // Quelle ausschließen
        reiheOpts.push([bl.id + '|' + r.id, bl.titel + ' › ' + r.titel]);
      });
    });

    const rSel = modalSelect('ms-reihe', 'Ziel-Reihe', reiheOpts, '');
    m.appendChild(rSel);

    const footer = mk('div', 'modal-footer');
    const okb = btn('Verschieben', 'btn btn-pri');
    okb.onclick = () => {
      const rKey = rSel.querySelector('select').value;
      if (!rKey) { alert('Bitte Ziel-Reihe wählen.'); return; }
      const [tgtBlockId, tgtReiheId] = rKey.split('|');
      const tgtReihe = findReihe(fpId, tgtBlockId, tgtReiheId);
      if (!tgtReihe) return;
      srcReihe.stunden = (srcReihe.stunden || []).filter(s => s.id !== stundeId);
      if (!tgtReihe.stunden) tgtReihe.stunden = [];
      // Gruppe aufheben beim Verschieben (Gruppe gilt nur innerhalb der Reihe)
      delete stunde.einheitId;
      tgtReihe.stunden.push(stunde);
      S.modal = null;
      S.sel = { type: 'stunde', ids: [fpId, tgtBlockId, tgtReiheId, stundeId] };
      scheduleSave(); render();
    };
    footer.appendChild(cancelBtn());
    footer.appendChild(okb);
    m.appendChild(footer);
    return true;
  }

  return false;
}
