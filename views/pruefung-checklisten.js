// ── Checklisten Overview ──────────────────────────────────────────
function buildChecklistenOverview() {
  const div = mk('div', '');
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', ''); left.style.flex = '1';
  left.appendChild(tx('div', 'c-title', 'Checklisten'));
  left.appendChild(tx('div', 'c-sub', CHECKLISTDB.length + ' gespeichert'));
  hdr.appendChild(left);
  const newBtn = btn('+ Neue Checkliste', 'btn btn-pri btn-sm');
  newBtn.onclick = () => showNewChecklistModal();
  hdr.appendChild(newBtn);
  div.appendChild(hdr);

  if (!CHECKLISTDB.length) {
    const empty = tx('div', '', 'Noch keine Checklisten. Lade eine Checkliste hoch und die KI liest sie aus.');
    empty.style.cssText = 'padding:40px;text-align:center;color:var(--tx3);';
    div.appendChild(empty);
    return div;
  }

  const groups = groupByJahrgang(CHECKLISTDB, cl => cl.jahrgang);
  groups.forEach(({ jahrgang, items }) => {
    div.appendChild(jahrgangSecHdr(jahrgang, items.length));
    const grid = mk('div', '');
    grid.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:16px;';
    items.forEach(cl => {
      const row = mk('div', 'card');
      const body = mk('div', 'card-body');
      body.style.cssText = 'display:flex;align-items:center;gap:12px;cursor:pointer;padding:10px 14px;';
      body.appendChild(tx('span', '', '☑️'));
      const info = mk('div', ''); info.style.flex = '1';
      info.appendChild(tx('div', '', cl.titel || '–')).style.fontWeight = '600';
      const abschnitte = [...new Set((cl.lernziele||[]).map(l => l.abschnitt))].length;
      info.appendChild(tx('div', '', (cl.lernziele?.length||0) + ' Lernziele · ' + abschnitte + ' Abschnitte')).style.cssText = 'font-size:12px;color:var(--tx3);';
      body.appendChild(info);
      const del = btn('✕', 'matc-del'); del.style.color = 'var(--tx3)';
      del.onclick = e => { e.stopPropagation(); if (!confirm('"'+cl.titel+'" löschen?')) return; CHECKLISTDB=CHECKLISTDB.filter(c=>c.id!==cl.id); saveChecklistDB(); renderPr(); };
      body.appendChild(del);
      body.onclick = e => { if (e.target===del||del.contains(e.target)) return; PR.view='checkliste'; PR.aktCheckId=cl.id; renderPr(); };
      row.appendChild(body); grid.appendChild(row);
    });
    div.appendChild(grid);
  });
  return div;
}

// ── Checkliste Detail ─────────────────────────────────────────────
function buildChecklistDetail(cl) {
  const div = mk('div', '');
  let editMode = false;

  function render() {
    div.innerHTML = '';

    const hdr = mk('div', 'c-hdr');
    const left = mk('div', ''); left.style.flex = '1';
    const backBtn = btn('← Checklisten', 'btn btn-ghost btn-sm');
    backBtn.style.marginBottom = '4px';
    backBtn.onclick = () => { PR.view = 'checklisten_overview'; PR.aktCheckId = null; renderPr(); };
    left.appendChild(backBtn);

    if (editMode) {
      const titelInp = document.createElement('input'); titelInp.className = 'finp';
      titelInp.value = cl.titel || ''; titelInp.style.cssText = 'font-size:20px;font-weight:700;margin-bottom:4px;';
      titelInp.oninput = () => { cl.titel = titelInp.value.trim(); saveChecklistDB(); };
      left.appendChild(titelInp);
    } else {
      left.appendChild(tx('div', 'c-title', cl.titel || '–'));
    }
    left.appendChild(tx('div', 'c-sub', (cl.lernziele?.length || 0) + ' Lernziele in ' + ([...new Set((cl.lernziele||[]).map(l => l.abschnitt))].length) + ' Abschnitten'));
    hdr.appendChild(left);

    const editBtn = btn(editMode ? '✓ Fertig' : '✎ Bearbeiten', 'btn btn-ghost btn-sm');
    editBtn.onclick = () => { editMode = !editMode; render(); };
    hdr.appendChild(editBtn);
    div.appendChild(hdr);

    const abschnitte = [...new Set((cl.lernziele||[]).map(l => l.abschnitt))];
    abschnitte.forEach(abschnitt => {
      const items = cl.lernziele.filter(l => l.abschnitt === abschnitt);
      const sec = mk('div', ''); sec.style.cssText = 'margin-bottom:20px;';

      const secHdrRow = mk('div', ''); secHdrRow.style.cssText = 'display:flex;align-items:center;gap:8px;border-bottom:2px solid var(--pri);margin-bottom:6px;';
      if (editMode) {
        const abschnittInp = document.createElement('input'); abschnittInp.className = 'finp';
        abschnittInp.value = abschnitt; abschnittInp.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);border:none;background:transparent;flex:1;padding:4px 0;';
        abschnittInp.oninput = () => {
          cl.lernziele.filter(l => l.abschnitt === abschnitt).forEach(l => l.abschnitt = abschnittInp.value);
          saveChecklistDB();
        };
        secHdrRow.appendChild(abschnittInp);
      } else {
        const secHdrTx = tx('div', '', abschnitt);
        secHdrTx.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);padding:6px 0 4px;flex:1;';
        secHdrRow.appendChild(secHdrTx);
      }
      sec.appendChild(secHdrRow);

      items.forEach(lz => {
        const row = mk('div', ''); row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:4px 6px;border-radius:5px;';
        const nrSpan = tx('span', '', lz.nr + '.'); nrSpan.style.cssText = 'color:var(--tx3);font-size:12px;flex-shrink:0;min-width:20px;margin-top:3px;';
        row.appendChild(nrSpan);

        if (editMode) {
          const ta = document.createElement('textarea'); ta.className = 'finp';
          ta.value = lz.text; ta.rows = 2; ta.style.cssText = 'font-size:13px;flex:1;resize:vertical;';
          ta.oninput = () => { lz.text = ta.value.trim(); saveChecklistDB(); };
          row.appendChild(ta);
          const delBtn = btn('✕', 'matc-del'); delBtn.style.cssText = 'color:var(--red);align-self:flex-start;margin-top:4px;';
          delBtn.onclick = () => { cl.lernziele = cl.lernziele.filter(l => l.id !== lz.id); saveChecklistDB(); render(); };
          row.appendChild(delBtn);
        } else {
          const textSpan = tx('span', '', lz.text); textSpan.style.cssText = 'font-size:13px;line-height:1.5;color:var(--tx2);';
          row.appendChild(textSpan);
        }
        sec.appendChild(row);
      });

      if (editMode) {
        const addBtn = btn('+ Lernziel', 'btn btn-ghost btn-xs');
        addBtn.style.marginTop = '4px';
        addBtn.onclick = () => {
          const maxNr = Math.max(0, ...items.map(l => l.nr));
          cl.lernziele.push({ id: uid(), abschnitt, nr: maxNr + 1, text: 'Neues Lernziel' });
          saveChecklistDB(); render();
        };
        sec.appendChild(addBtn);
      }

      div.appendChild(sec);
    });

    if (editMode) {
      const addSecBtn = btn('+ Abschnitt', 'btn btn-ghost btn-sm');
      addSecBtn.onclick = () => {
        cl.lernziele.push({ id: uid(), abschnitt: 'Neuer Abschnitt', nr: 1, text: 'Neues Lernziel' });
        saveChecklistDB(); render();
      };
      div.appendChild(addSecBtn);
    }
  }

  render();
  return div;
}

// ── Neue Checkliste Modal ─────────────────────────────────────────
function showNewChecklistModal() {
  const ov = mk('div', 'matd-overlay');
  const pan = mk('div', 'matd-panel'); pan.style.maxWidth = '520px';
  const phdr = mk('div', 'matd-panel-hdr');
  phdr.appendChild(tx('span', 'matd-panel-title', 'Neue Checkliste'));
  const cls = btn('✕', 'btn btn-ghost btn-sm matd-close');
  const close = () => ov.remove();
  cls.onclick = close; phdr.appendChild(cls); pan.appendChild(phdr);
  ov.onclick = e => { if (e.target === ov) close(); };

  const body = mk('div', 'matd-panel-body');
  body.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:12px;';

  const titelInp = document.createElement('input'); titelInp.className = 'finp'; titelInp.placeholder = 'z.B. Zuordnungen (7.2)';
  const fg = mk('div', 'fg'); fg.appendChild(tx('label', 'fl', 'Titel *')); fg.appendChild(titelInp);
  body.appendChild(fg);

  const jahrgangSel = document.createElement('select'); jahrgangSel.className = 'finp';
  const noJg = document.createElement('option'); noJg.value = ''; noJg.textContent = '– kein Jahrgang –'; jahrgangSel.appendChild(noJg);
  JAHRGAENGE.forEach(jg => { const o = document.createElement('option'); o.value = jg; o.textContent = 'Jahrgang ' + jg; jahrgangSel.appendChild(o); });
  const fgJg = mk('div', 'fg'); fgJg.appendChild(tx('label', 'fl', 'Jahrgang')); fgJg.appendChild(jahrgangSel);
  body.appendChild(fgJg);

  let uploadedImgs = [];
  const zone = mk('div', '');
  zone.style.cssText = 'border:2px dashed var(--bord);border-radius:8px;padding:20px;text-align:center;cursor:pointer;color:var(--tx3);';
  zone.textContent = 'Checklist-Seiten hochladen — hierhin ziehen oder klicken';
  const fileInp = document.createElement('input'); fileInp.type = 'file'; fileInp.accept = 'image/*,.pdf'; fileInp.multiple = true; fileInp.style.display = 'none';
  zone.onclick = () => fileInp.click();
  zone.ondragover = e => { e.preventDefault(); zone.style.borderColor = 'var(--pri)'; };
  zone.ondragleave = () => { zone.style.borderColor = 'var(--bord)'; };
  const thumbsRow = mk('div', ''); thumbsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';

  async function addImgs(files) {
    for (const f of files) {
      if (f.type === 'application/pdf' || f.name.endsWith('.pdf')) {
        zone.textContent = '⏳ PDF wird eingelesen…';
        const pages = await pdfToImages(f);
        uploadedImgs.push(...pages);
      } else {
        await new Promise(res => { const r=new FileReader(); r.onload=e=>{uploadedImgs.push(e.target.result);res();}; r.readAsDataURL(f); });
      }
    }
    updateZone();
  }
  function updateZone() {
    zone.textContent = uploadedImgs.length ? uploadedImgs.length + ' Seite(n) bereit' : 'Checklist-Seiten hochladen — hierhin ziehen oder klicken';
    thumbsRow.innerHTML = '';
    uploadedImgs.forEach((src, i) => {
      const th = mk('img', ''); th.src = src; th.style.cssText = 'width:55px;height:55px;object-fit:cover;border-radius:4px;cursor:pointer;';
      th.onclick = () => { uploadedImgs.splice(i, 1); updateZone(); }; thumbsRow.appendChild(th);
    });
  }
  zone.ondrop = e => { e.preventDefault(); zone.style.borderColor = 'var(--bord)'; addImgs(e.dataTransfer.files); };
  fileInp.onchange = () => { addImgs(fileInp.files); fileInp.value = ''; };
  body.appendChild(zone); body.appendChild(thumbsRow); body.appendChild(fileInp);

  const statusEl = mk('div', ''); statusEl.style.cssText = 'font-size:13px;color:var(--tx2);min-height:18px;';
  body.appendChild(statusEl);

  const btnRow = mk('div', ''); btnRow.style.cssText = 'display:flex;gap:8px;';
  const saveBtn = btn('✨ KI liest aus & speichern', 'btn btn-pri btn-sm');
  const cancelB = btn('Abbrechen', 'btn btn-ghost btn-sm'); cancelB.onclick = close;
  btnRow.appendChild(saveBtn); btnRow.appendChild(cancelB);
  body.appendChild(btnRow);

  saveBtn.onclick = async () => {
    const titel = titelInp.value.trim();
    if (!titel) { alert('Bitte einen Titel eingeben.'); return; }
    if (!uploadedImgs.length) { alert('Bitte Bilder hochladen.'); return; }
    saveBtn.disabled = true; statusEl.textContent = '⏳ KI liest Checkliste…';
    try {
      const lernziele = await extrahiereChecklist(uploadedImgs, statusEl);
      if (!lernziele.length) throw new Error('Keine Lernziele erkannt.');
      const cl = { id: uid(), titel, jahrgang: jahrgangSel.value || null, lernziele, erstellt: new Date().toISOString() };
      CHECKLISTDB.push(cl);
      saveChecklistDB();
      PR.aktCheckId = cl.id; PR.view = 'checkliste'; PR.aktId = null;
      close(); renderPr();
    } catch(e) {
      showKIError(statusEl, e);
      saveBtn.disabled = false;
    }
  };

  pan.appendChild(body); ov.appendChild(pan);
  document.getElementById('root').appendChild(ov);
  ov.classList.add('open');
}
