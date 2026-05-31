// ── Methodendatenbank ─────────────────────────────────────────────
function viewMethoden() {
  const div = mk('div', '');

  let filterPhase = null;
  let filterSozial = null;
  let filterMat = null;
  let filterAufwand = null;
  let filterText = '';
  let editMode = false;

  // ── Header ────────────────────────────────────────────────────
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Methodendatenbank'));
  left.appendChild(tx('div', 'c-sub', METHDB.length + ' Methoden'));
  hdr.appendChild(left);

  const hdrRight = mk('div', 'c-hdr-right');
  const editToggle = btn('Bearbeiten', 'btn btn-sm');
  editToggle.onclick = () => {
    editMode = !editMode;
    editToggle.textContent = editMode ? 'Fertig' : 'Bearbeiten';
    editToggle.className = editMode ? 'btn btn-sm btn-pri' : 'btn btn-sm';
    addBtn.style.display = editMode ? '' : 'none';
    refresh();
  };
  const addBtn = btn('+ Methode', 'btn btn-sm btn-pri');
  addBtn.style.display = 'none';
  addBtn.onclick = () => openForm(null);
  hdrRight.appendChild(editToggle);
  hdrRight.appendChild(addBtn);
  hdr.appendChild(hdrRight);
  div.appendChild(hdr);

  // ── Filter-Leiste ─────────────────────────────────────────────
  const filterBar = mk('div', 'card');
  filterBar.style.marginBottom = '12px';
  const filterBody = mk('div', 'card-body');
  filterBody.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:10px 14px;';

  const searchInput = mk('input', '');
  searchInput.type = 'text';
  searchInput.placeholder = 'Suchen …';
  searchInput.style.cssText = 'width:100%;padding:6px 10px;border:1px solid var(--bdr);border-radius:6px;font-size:13px;outline:none;box-sizing:border-box;';
  searchInput.oninput = () => { filterText = searchInput.value.toLowerCase(); refresh(); };
  filterBody.appendChild(searchInput);

  function chipRow(label, options, getVal, setVal) {
    const row = mk('div', '');
    row.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:wrap;';
    const lbl = tx('span', '', label);
    lbl.style.cssText = 'font-size:11px;color:var(--tx3);min-width:52px;';
    row.appendChild(lbl);
    options.forEach(opt => {
      const c = mk('button', 'meth-filter-chip' + (getVal() === opt.val ? ' on' : ''));
      c.textContent = opt.label;
      c.onclick = () => { setVal(getVal() === opt.val ? null : opt.val); refresh(); };
      row.appendChild(c);
    });
    return row;
  }

  const pRow = chipRow('Phase',
    ['Einstieg','Erarbeitung','Übung','Sicherung'].map(v => ({val:v,label:v})),
    () => filterPhase, v => filterPhase = v);
  const sRow = chipRow('Sozialform',
    ['Einzelarbeit','Partnerarbeit','Gruppenarbeit','Plenum'].map(v => ({val:v,label:v})),
    () => filterSozial, v => filterSozial = v);
  const mRow = chipRow('Material',
    ['Kein Material','Texte','Karten','Arbeitsblätter','Experimente','Plakate/Papier','Bilder/Comics','Objekte/Modelle','Digitale Medien'].map(v => ({val:v,label:v})),
    () => filterMat, v => filterMat = v);
  const aRow = chipRow('Aufwand',
    [{val:1,label:'● gering'},{val:2,label:'●● mittel'},{val:3,label:'●●● hoch'},{val:4,label:'●●●● sehr hoch'}],
    () => filterAufwand, v => filterAufwand = v);

  filterBody.appendChild(pRow);
  filterBody.appendChild(sRow);
  filterBody.appendChild(mRow);
  filterBody.appendChild(aRow);
  filterBar.appendChild(filterBody);
  div.appendChild(filterBar);

  // ── Zähler + Grid ─────────────────────────────────────────────
  const countLine = tx('div', '', '');
  countLine.style.cssText = 'font-size:11px;color:var(--tx3);margin-bottom:6px;';
  div.appendChild(countLine);

  const listWrap = mk('div', 'meth-grid');
  div.appendChild(listWrap);

  const AUFWAND_LABEL = ['', '● gering', '●● mittel', '●●● hoch', '●●●● sehr hoch'];
  const AUFWAND_COLOR = ['', '#16a34a', '#eab308', '#f97316', '#dc2626'];
  const SOZ_ABK = { 'Einzelarbeit':'EA', 'Partnerarbeit':'PA', 'Gruppenarbeit':'GA', 'Plenum':'PL' };

  const SOZ_ALL  = ['Einzelarbeit','Partnerarbeit','Gruppenarbeit','Plenum'];
  const PHAS_ALL = ['Einstieg','Erarbeitung','Übung','Sicherung'];
  const MAT_ALL  = ['Kein Material','Texte','Karten','Arbeitsblätter','Experimente','Plakate/Papier','Bilder/Comics','Objekte/Modelle','Digitale Medien'];

  function refresh() {
    [pRow, sRow, mRow, aRow].forEach(row => {
      row.querySelectorAll('.meth-filter-chip').forEach(c => {
        const isOn = c.textContent === filterPhase
          || c.textContent === filterSozial
          || c.textContent === filterMat
          || (filterAufwand !== null && c.textContent === AUFWAND_LABEL[filterAufwand]);
        c.className = 'meth-filter-chip' + (isOn ? ' on' : '');
      });
    });

    const filtered = [...METHDB].sort((a, b) => a.name.localeCompare(b.name, 'de')).filter(m => {
      if (filterPhase   && !m.phasen.includes(filterPhase))       return false;
      if (filterSozial  && !m.sozialform.includes(filterSozial))  return false;
      if (filterMat     && !m.materialtyp.includes(filterMat))    return false;
      if (filterAufwand && m.aufwand !== filterAufwand)           return false;
      if (filterText    && !m.name.toLowerCase().includes(filterText)
                        && !m.beschreibung.toLowerCase().includes(filterText)
                        && !m.ziel.toLowerCase().includes(filterText)) return false;
      return true;
    });

    countLine.textContent = filtered.length + ' Methoden';
    listWrap.innerHTML = '';

    if (filtered.length === 0) {
      const empty = tx('div', '', 'Keine Methoden gefunden.');
      empty.style.cssText = 'color:var(--tx3);font-size:13px;grid-column:1/-1;padding:8px 0;';
      listWrap.appendChild(empty);
      return;
    }

    filtered.forEach(m => {
      const card = mk('div', 'meth-card');

      const nameRow = mk('div', '');
      nameRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;';
      nameRow.appendChild(tx('div', 'meth-card-name', m.name));
      if (m.aufwand) {
        const aw = mk('span', 'meth-aufwand');
        for (let i = 1; i <= 4; i++) {
          const dot = tx('span', 'meth-aufwand-dot', '●');
          dot.style.color = i <= m.aufwand ? AUFWAND_COLOR[m.aufwand] : 'var(--bord)';
          aw.appendChild(dot);
        }
        nameRow.appendChild(aw);
      }
      card.appendChild(nameRow);

      const chips = mk('div', 'meth-card-chips');
      m.phasen.forEach(p => chips.appendChild(tx('span', 'meth-chip meth-chip-phase', p)));
      m.sozialform.forEach(s => chips.appendChild(tx('span', 'meth-chip meth-chip-soz', SOZ_ABK[s] || s)));
      m.materialtyp.forEach(mt => {
        if (mt !== 'Kein Material') chips.appendChild(tx('span', 'meth-chip meth-chip-mat', mt));
      });
      card.appendChild(chips);

      card.appendChild(tx('div', 'meth-card-desc', m.beschreibung));

      const details = mk('details', '');
      const summary = mk('summary', '');
      summary.textContent = 'Ziel & Hinweise';
      details.appendChild(summary);
      const detBody = mk('div', 'meth-card-det');
      if (m.zeitbedarf && m.zeitbedarf !== 'variabel') detBody.appendChild(tx('div', '', '⏱ ' + m.zeitbedarf));
      if (m.ziel) detBody.appendChild(tx('div', '', '🎯 ' + m.ziel));
      if (m.hinweise) detBody.appendChild(tx('div', '', '💡 ' + m.hinweise));
      const ql = mk('a', '');
      ql.href = m.quelle; ql.target = '_blank';
      ql.textContent = '↗ Methodenkartei';
      ql.style.cssText = 'font-size:11px;color:var(--pri);';
      detBody.appendChild(ql);
      details.appendChild(detBody);
      card.appendChild(details);

      if (editMode) {
        const editRow = mk('div', '');
        editRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;border-top:1px solid var(--bord);padding-top:6px;';
        const eb = btn('Bearbeiten', 'btn btn-sm');
        eb.onclick = () => openForm(m);
        const db = btn('Löschen', 'btn btn-sm');
        db.style.color = 'var(--red)';
        db.onclick = () => deleteMethod(m.id);
        editRow.appendChild(eb);
        editRow.appendChild(db);
        card.appendChild(editRow);
      }

      listWrap.appendChild(card);
    });
  }

  // ── Formular-Overlay ──────────────────────────────────────────
  const overlay = mk('div', 'meth-overlay');
  div.appendChild(overlay);

  function closeOverlay() { overlay.innerHTML = ''; overlay.classList.remove('open'); }

  function openForm(existing, prefill) {
    prefill = prefill || {};
    const isNew = !existing;
    const m = existing ? JSON.parse(JSON.stringify(existing))
      : { id:'', name: prefill.name || '', beschreibung: prefill.beschreibung || '', ziel: prefill.ziel || '', hinweise: prefill.hinweise || '', zeitbedarf:'variabel', aufwand:1, sozialform:[], phasen:[], materialtyp:[], quelle:'' };

    overlay.innerHTML = '';
    overlay.classList.add('open');

    const panel = mk('div', 'meth-form-panel');

    const fhdr = mk('div', '');
    fhdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;';
    fhdr.appendChild(tx('div', '', isNew ? 'Neue Methode' : 'Methode bearbeiten').cloneNode ? tx('strong','',isNew ? 'Neue Methode' : 'Methode bearbeiten') : null);
    const closeBtn = btn('✕', '');
    closeBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;color:var(--tx3);padding:0;';
    closeBtn.onclick = closeOverlay;
    fhdr.appendChild(tx('strong', '', isNew ? 'Neue Methode' : 'Methode bearbeiten'));
    fhdr.appendChild(closeBtn);
    panel.appendChild(fhdr);

    function field(labelTxt, inputEl) {
      const w = mk('div', '');
      w.style.cssText = 'display:flex;flex-direction:column;gap:3px;';
      w.appendChild(tx('label', 'meth-form-label', labelTxt));
      w.appendChild(inputEl);
      return w;
    }

    function textInput(val, placeholder) {
      const el = mk('input', 'meth-form-input');
      el.type = 'text'; el.value = val || ''; el.placeholder = placeholder || '';
      return el;
    }

    function textarea(val, rows) {
      const el = mk('textarea', 'meth-form-input');
      el.value = val || ''; el.rows = rows || 2;
      el.style.resize = 'vertical';
      return el;
    }

    function checkGroup(options, selected) {
      const w = mk('div', '');
      w.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
      options.forEach(opt => {
        const lbl = mk('label', 'meth-form-check');
        const cb = mk('input', '');
        cb.type = 'checkbox'; cb.value = opt; cb.checked = selected.includes(opt);
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(' ' + opt));
        w.appendChild(lbl);
      });
      return w;
    }

    const inpName   = textInput(m.name, 'Methodenname');
    const inpDesc   = textarea(m.beschreibung, 2);
    const inpZiel   = textarea(m.ziel, 2);
    const inpHinw   = textarea(m.hinweise, 2);
    const inpZeit   = textInput(m.zeitbedarf, 'z.B. 10–15 min');
    const inpQuelle = textInput(m.quelle, 'https://…');

    const selAufwand = mk('select', 'meth-form-input');
    [{v:1,l:'● gering'},{v:2,l:'●● mittel'},{v:3,l:'●●● hoch'},{v:4,l:'●●●● sehr hoch'}].forEach(o => {
      const opt = mk('option',''); opt.value = o.v; opt.textContent = o.l;
      if (m.aufwand === o.v) opt.selected = true;
      selAufwand.appendChild(opt);
    });

    const cbSoz  = checkGroup(SOZ_ALL,  m.sozialform);
    const cbPhas = checkGroup(PHAS_ALL, m.phasen);
    const cbMat  = checkGroup(MAT_ALL,  m.materialtyp);

    const form = mk('div', '');
    form.style.cssText = 'display:flex;flex-direction:column;gap:10px;overflow-y:auto;flex:1;';
    form.appendChild(field('Name', inpName));
    form.appendChild(field('Beschreibung', inpDesc));
    form.appendChild(field('Ziel', inpZiel));
    form.appendChild(field('Hinweise', inpHinw));
    form.appendChild(field('Zeitbedarf', inpZeit));
    form.appendChild(field('Aufwand', selAufwand));
    form.appendChild(field('Sozialform', cbSoz));
    form.appendChild(field('Phasen', cbPhas));
    form.appendChild(field('Material', cbMat));
    form.appendChild(field('Quelle (URL)', inpQuelle));
    panel.appendChild(form);

    const footer = mk('div', '');
    footer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:14px;padding-top:12px;border-top:1px solid var(--bord);flex-shrink:0;';
    const cancelBtn = btn('Abbrechen', 'btn btn-sm');
    cancelBtn.onclick = closeOverlay;
    const saveBtn = btn('Speichern', 'btn btn-sm btn-pri');
    saveBtn.onclick = async () => {
      const name = inpName.value.trim();
      if (!name) { inpName.style.borderColor = 'var(--red)'; return; }
      const getChecked = cb => [...cb.querySelectorAll('input:checked')].map(x => x.value);
      const updated = {
        id: m.id || name.toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),
        name,
        beschreibung: inpDesc.value.trim(),
        ziel: inpZiel.value.trim(),
        hinweise: inpHinw.value.trim(),
        zeitbedarf: inpZeit.value.trim() || 'variabel',
        aufwand: parseInt(selAufwand.value),
        sozialform: getChecked(cbSoz),
        phasen: getChecked(cbPhas),
        materialtyp: getChecked(cbMat),
        quelle: inpQuelle.value.trim(),
      };
      saveBtn.textContent = 'Speichert…'; saveBtn.disabled = true;
      await saveMethod(updated, isNew);
      // Wenn aus Material-Analyse kommend: Material verknüpfen
      if (isNew && prefill.linkMatId) {
        const matIdx = MATDB.findIndex(m => m.id === prefill.linkMatId);
        if (matIdx >= 0) {
          if (!MATDB[matIdx].methodenIds) MATDB[matIdx].methodenIds = [];
          if (!MATDB[matIdx].methodenIds.includes(updated.id)) MATDB[matIdx].methodenIds.push(updated.id);
          saveMatDB();
        }
      }
      closeOverlay();
    };
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    inpName.focus();
  }

  async function saveMethod(updated, isNew) {
    if (isNew) {
      METHDB.push(updated);
    } else {
      const i = METHDB.findIndex(x => x.id === updated.id);
      if (i >= 0) METHDB[i] = updated;
    }
    await sbUpload('methoden.json', METHDB);
    refresh();
  }

  async function deleteMethod(id) {
    if (!confirm('Methode wirklich löschen?')) return;
    const i = METHDB.findIndex(m => m.id === id);
    if (i >= 0) METHDB.splice(i, 1);
    await sbUpload('methoden.json', METHDB);
    refresh();
  }

  refresh();

  // Auto-Formular wenn aus Methoden-Check kommend
  if (S._pendingNewMethod) {
    const pending = S._pendingNewMethod;
    S._pendingNewMethod = null;
    openForm(null, pending);
  }

  return div;
}
