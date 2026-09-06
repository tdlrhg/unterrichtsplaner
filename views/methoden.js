// ── Methodendatenbank ─────────────────────────────────────────────
function viewMethoden() {
  const div = mk('div', '');

  let filterPhase = null;
  let filterSozial = null;
  let filterMat = null;
  let filterAufwand = null;
  let filterFormat  = null;
  let filterText = '';
  let editMode = false;

  // ── Header ────────────────────────────────────────────────────
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Methodendatenbank'));
  left.appendChild(tx('div', 'c-sub', METHDB.length + ' Methoden'));
  hdr.appendChild(left);

  const hdrRight = mk('div', 'c-hdr-right');
  const kiBtn = btn('📷 Aus Bild', 'btn btn-sm');
  kiBtn.onclick = () => openKiImport();
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
  hdrRight.appendChild(kiBtn);
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

  const fRow = chipRow('Format',
    FORMATE.map(f => ({ val: f, label: (FORMAT_ICON[f] || '') + ' ' + f })),
    () => filterFormat, v => filterFormat = v);

  filterBody.appendChild(pRow);
  filterBody.appendChild(sRow);
  filterBody.appendChild(mRow);
  filterBody.appendChild(aRow);
  filterBody.appendChild(fRow);
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

  const TYP_ORDER = ['vermitteln','erarbeiten','austauschen','anwenden','strukturieren','reflektieren'];
  const TYP_LABEL = { vermitteln:'Vermitteln', erarbeiten:'Erarbeiten', austauschen:'Austauschen', anwenden:'Anwenden', strukturieren:'Strukturieren', reflektieren:'Reflektieren' };
  const TYP_DESC  = { vermitteln:'Wissen einführen & erklären', erarbeiten:'Selbstständig erkunden & erschließen', austauschen:'Kommunizieren & diskutieren', anwenden:'Üben & transferieren', strukturieren:'Ordnen & zusammenfassen', reflektieren:'Rückblicken & bewerten' };

  function refresh() {
    [pRow, sRow, mRow, aRow, fRow].forEach(row => {
      row.querySelectorAll('.meth-filter-chip').forEach(c => {
        const isOn = c.textContent === filterPhase
          || c.textContent === filterSozial
          || c.textContent === filterMat
          || (filterAufwand !== null && c.textContent === AUFWAND_LABEL[filterAufwand])
          || (filterFormat && c.textContent === (FORMAT_ICON[filterFormat] || '') + ' ' + filterFormat);
        c.className = 'meth-filter-chip' + (isOn ? ' on' : '');
      });
    });

    const filtered = [...METHDB].sort((a, b) => a.name.localeCompare(b.name, 'de')).filter(m => {
      if (filterFormat && !(m.formate || []).includes(filterFormat)) return false;
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

    // Nach Typ gruppieren und pro Gruppe rendern
    const byTyp = {};
    TYP_ORDER.forEach(t => { byTyp[t] = []; });
    filtered.forEach(m => { (byTyp[m.typ] || byTyp['erarbeiten']).push(m); });

    TYP_ORDER.forEach(typ => {
      const group = byTyp[typ];
      if (!group.length) return;

      const secHdr = mk('div', '');
      secHdr.style.cssText = 'grid-column:1/-1;display:flex;align-items:baseline;gap:10px;margin-top:8px;padding-bottom:6px;border-bottom:2px solid var(--bdr);';
      const secTitle = tx('span', '', TYP_LABEL[typ]);
      secTitle.style.cssText = 'font-size:16px;font-weight:700;';
      const secDesc = tx('span', '', TYP_DESC[typ]);
      secDesc.style.cssText = 'font-size:12px;color:var(--tx3);';
      const secCount = tx('span', '', group.length + (group.length === 1 ? ' Methode' : ' Methoden'));
      secCount.style.cssText = 'font-size:11px;color:var(--tx3);margin-left:auto;';
      secHdr.appendChild(secTitle);
      secHdr.appendChild(secDesc);
      secHdr.appendChild(secCount);
      listWrap.appendChild(secHdr);

      group.forEach(m => {
        const card = mk('div', 'meth-card');

        const nameRow = mk('div', '');
        nameRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;';
        nameRow.appendChild(tx('div', 'meth-card-name', formatIcons(m.formate) + m.name));
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
        if (m.einfuehrung) detBody.appendChild(tx('div', '', '🎓 Einführung: ' + m.einfuehrung));
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
      : { id:'', name: prefill.name || '', beschreibung: prefill.beschreibung || '', ziel: prefill.ziel || '', hinweise: prefill.hinweise || '', einfuehrung: prefill.einfuehrung || '', zeitbedarf:'variabel', aufwand:1, sozialform:[], phasen:[], materialtyp:[], typ: null, formate:[], quelle:'' };

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
    // Wie die Methode das erste Mal beigebracht wird. Steht hier etwas, weiß
    // die Planungs-KI, dass eine Einführung nötig ist und wie sie aussieht.
    const inpEinf   = textarea(m.einfuehrung, 3);
    const inpZeit   = textInput(m.zeitbedarf, 'z.B. 10–15 min');
    const inpQuelle = textInput(m.quelle, 'https://…');

    const selAufwand = mk('select', 'meth-form-input');
    [{v:1,l:'● gering'},{v:2,l:'●● mittel'},{v:3,l:'●●● hoch'},{v:4,l:'●●●● sehr hoch'}].forEach(o => {
      const opt = mk('option',''); opt.value = o.v; opt.textContent = o.l;
      if (m.aufwand === o.v) opt.selected = true;
      selAufwand.appendChild(opt);
    });

    const selTyp = mk('select', 'meth-form-input');
    [{v:'',l:'– kein Typ –'},{v:'vermitteln',l:'Vermitteln'},{v:'erarbeiten',l:'Erarbeiten'},{v:'austauschen',l:'Austauschen'},{v:'anwenden',l:'Anwenden'},{v:'strukturieren',l:'Strukturieren'},{v:'reflektieren',l:'Reflektieren'}].forEach(o => {
      const opt = mk('option',''); opt.value = o.v; opt.textContent = o.l;
      if ((m.typ || '') === o.v) opt.selected = true;
      selTyp.appendChild(opt);
    });

    const cbFormate = checkGroup(FORMATE.map(f => (FORMAT_ICON[f] || '') + ' ' + f),
      (m.formate || []).map(f => (FORMAT_ICON[f] || '') + ' ' + f));

    const cbSoz  = checkGroup(SOZ_ALL,  m.sozialform);
    const cbPhas = checkGroup(PHAS_ALL, m.phasen);
    const cbMat  = checkGroup(MAT_ALL,  m.materialtyp);

    const form = mk('div', '');
    form.style.cssText = 'display:flex;flex-direction:column;gap:10px;overflow-y:auto;flex:1;';
    form.appendChild(field('Name', inpName));
    form.appendChild(field('Beschreibung', inpDesc));
    form.appendChild(field('Ziel', inpZiel));
    form.appendChild(field('Hinweise', inpHinw));
    form.appendChild(field('Einführung — wie wird die Methode beigebracht?', inpEinf));
    form.appendChild(field('Zeitbedarf', inpZeit));
    form.appendChild(field('Aufwand', selAufwand));
    form.appendChild(field('Typ', selTyp));
    form.appendChild(field('Format', cbFormate));
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
        einfuehrung: inpEinf.value.trim() || null,
        zeitbedarf: inpZeit.value.trim() || 'variabel',
        aufwand: parseInt(selAufwand.value),
        typ: selTyp.value || null,
        formate: getChecked(cbFormate).map(l => l.replace(/^\S+\s/, '')),
        sozialform: getChecked(cbSoz),
        phasen: getChecked(cbPhas),
        materialtyp: getChecked(cbMat),
        quelle: inpQuelle.value.trim(),
      };
      saveBtn.textContent = 'Speichert…'; saveBtn.disabled = true;
      await saveMethod(updated, isNew);
      closeOverlay();
    };
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    inpName.focus();
  }

  async function saveMethod(updated, isNew) {
    await sbInsert('methoden', [updated]);
    if (isNew) {
      METHDB.push(updated);
    } else {
      const i = METHDB.findIndex(x => x.id === updated.id);
      if (i >= 0) METHDB[i] = updated;
    }
    refresh();
  }

  async function deleteMethod(id) {
    if (!confirm('Methode wirklich löschen?')) return;
    await sbDelete('methoden', id);
    const i = METHDB.findIndex(m => m.id === id);
    if (i >= 0) METHDB.splice(i, 1);
    refresh();
  }

  // ── KI-Import aus Bildern ─────────────────────────────────────
  function openKiImport() {
    const ov = mk('div', 'meth-overlay');
    ov.classList.add('open');
    div.appendChild(ov);

    const panel = mk('div', 'meth-form-panel');
    panel.style.maxWidth = '560px';

    const fhdr = mk('div', '');
    fhdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;';
    fhdr.appendChild(tx('strong', '', '📷 Methoden aus Bild extrahieren'));
    const xBtn = btn('✕', '');
    xBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;color:var(--tx3);padding:0;';
    const closeOv = () => ov.remove();
    xBtn.onclick = closeOv;
    fhdr.appendChild(xBtn);
    panel.appendChild(fhdr);

    const body = mk('div', '');
    body.style.cssText = 'display:flex;flex-direction:column;gap:12px;overflow-y:auto;flex:1;';

    const hint = tx('div', '', 'Lade Seiten aus einem Methodenheft oder -buch hoch. Die KI erkennt alle Methoden und trägt sie direkt ein.');
    hint.style.cssText = 'font-size:13px;color:var(--tx2);line-height:1.5;';
    body.appendChild(hint);

    let images = [];

    async function resizeImgKi(dataUrl, maxW, q) {
      return new Promise(res => {
        const img = new Image();
        img.onload = () => {
          const sc = Math.min(1, maxW / img.width);
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          res(cv.toDataURL('image/jpeg', q));
        };
        img.src = dataUrl;
      });
    }

    const fileInp = document.createElement('input');
    fileInp.type = 'file'; fileInp.accept = 'image/*'; fileInp.multiple = true; fileInp.style.display = 'none';
    body.appendChild(fileInp);

    const uploadArea = mk('div', 'did-upload-area');

    async function addFiles(files) {
      for (const f of Array.from(files)) {
        const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(f); });
        const resized = await resizeImgKi(dataUrl, 1200, 0.82);
        images.push({ dataUrl: resized, name: f.name });
      }
      renderUpload();
    }

    function renderUpload() {
      uploadArea.innerHTML = '';
      images.forEach((img, i) => {
        const wrap = mk('div', 'did-thumb-wrap');
        const imgEl = document.createElement('img');
        imgEl.src = img.dataUrl; imgEl.className = 'did-thumb';
        const del = mk('button', 'did-thumb-del'); del.textContent = '✕';
        del.onclick = e => { e.stopPropagation(); images.splice(i, 1); renderUpload(); };
        const lbl = tx('div', 'did-thumb-lbl', 'Seite ' + (i + 1));
        wrap.appendChild(imgEl); wrap.appendChild(del); wrap.appendChild(lbl);
        uploadArea.appendChild(wrap);
      });
      const addTile = mk('div', 'did-thumb-wrap did-thumb-add');
      addTile.innerHTML = images.length
        ? '<div style="font-size:22px;color:var(--tx3)">+</div>'
        : '<div style="font-size:28px;margin-bottom:6px">🖼</div><div style="font-size:12px;font-weight:600;color:var(--tx2)">Seiten ablegen</div><div style="font-size:11px;color:var(--tx3);margin-top:2px">oder klicken</div>';
      addTile.onclick = () => fileInp.click();
      uploadArea.appendChild(addTile);
    }

    uploadArea.ondragover = e => { e.preventDefault(); uploadArea.classList.add('drag-over'); };
    uploadArea.ondragleave = e => { if (!uploadArea.contains(e.relatedTarget)) uploadArea.classList.remove('drag-over'); };
    uploadArea.ondrop = async e => { e.preventDefault(); uploadArea.classList.remove('drag-over'); await addFiles(e.dataTransfer.files); };
    fileInp.onchange = async () => { await addFiles(fileInp.files); fileInp.value = ''; };
    renderUpload();
    body.appendChild(uploadArea);

    const actRow = mk('div', '');
    actRow.style.cssText = 'display:flex;gap:8px;align-items:center;';
    const extractBtn = btn('✨ KI extrahiert', 'btn btn-pri btn-sm');
    const cancelBtn = btn('Abbrechen', 'btn btn-ghost btn-sm');
    cancelBtn.onclick = closeOv;
    const statusEl = tx('span', '', '');
    statusEl.style.cssText = 'font-size:12px;color:var(--tx3);';
    actRow.appendChild(extractBtn);
    actRow.appendChild(cancelBtn);
    actRow.appendChild(statusEl);
    body.appendChild(actRow);

    extractBtn.onclick = async () => {
      if (!images.length) { alert('Bitte mindestens ein Bild hochladen.'); return; }
      const antKey = localStorage.getItem('ant_key');
      if (!antKey) { alert('Bitte API-Key in den Einstellungen hinterlegen.'); return; }

      extractBtn.disabled = true; extractBtn.textContent = '⏳ Liest…'; statusEl.textContent = '';

      const prompt = `Du analysierst Seiten aus einem Buch oder Heft über Unterrichtsmethoden (Gymnasium).
Extrahiere ALLE vorhandenen Methoden vollständig.

Antworte NUR mit validem JSON — alle Strings einzeilig:
{"methoden": [
  {
    "name": "Name der Methode",
    "beschreibung": "Wie läuft sie ab? 2-4 Sätze.",
    "ziel": "Welches Lernziel oder welche Funktion hat sie?",
    "hinweise": "Tipps zur Durchführung, Varianten, Stolpersteine",
    "zeitbedarf": "z.B. 10-15 min oder variabel",
    "aufwand": 1,
    "sozialform": [],
    "phasen": [],
    "materialtyp": [],
    "formate": []
  }
]}

aufwand: 1=gering 2=mittel 3=hoch 4=sehr hoch
sozialform: aus ["Einzelarbeit","Partnerarbeit","Gruppenarbeit","Plenum"]
phasen: aus ["Einstieg","Erarbeitung","Übung","Sicherung"]
materialtyp: aus ["Kein Material","Texte","Karten","Arbeitsblätter","Experimente","Plakate/Papier","Bilder/Comics","Objekte/Modelle","Digitale Medien"]
formate: Liste aus ["Spiel","Rätsel","Experiment","Wettbewerb"] — nur setzen wenn zutreffend, sonst []`;

      try {
        const contentBlocks = [
          ...images.map(img => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.dataUrl.split(',')[1] } })),
          { type: 'text', text: prompt },
        ];
        const raw = await callKI(contentBlocks, { maxTokens: 8000, label: 'methoden-import' });
        let jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
        jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
        let parsed;
        try { parsed = JSON.parse(jsonStr); }
        catch(_) {
          const op = (jsonStr.match(/\[/g)||[]).length - (jsonStr.match(/\]/g)||[]).length;
          const oc = (jsonStr.match(/\{/g)||[]).length - (jsonStr.match(/\}/g)||[]).length;
          jsonStr += ']'.repeat(Math.max(0, op)) + '}'.repeat(Math.max(0, oc));
          jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
          parsed = JSON.parse(jsonStr);
        }
        const methoden = (parsed.methoden || []).filter(m => m.name);
        if (!methoden.length) throw new Error('Keine Methoden erkannt.');

        // Vorschau
        body.innerHTML = '';
        const vorschauTitel = tx('div', '', methoden.length + ' Methode' + (methoden.length !== 1 ? 'n' : '') + ' gefunden:');
        vorschauTitel.style.cssText = 'font-weight:700;font-size:14px;margin-bottom:4px;';
        body.appendChild(vorschauTitel);

        const list = mk('div', '');
        list.style.cssText = 'max-height:340px;overflow-y:auto;border:1px solid var(--bord);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:6px;margin-bottom:12px;';
        methoden.forEach(m => {
          const item = mk('div', '');
          item.style.cssText = 'padding:8px 10px;background:var(--surf2);border-radius:6px;';
          const nameEl = tx('div', '', m.name);
          nameEl.style.cssText = 'font-weight:600;font-size:13px;margin-bottom:2px;';
          item.appendChild(nameEl);
          if (m.beschreibung) item.appendChild(tx('div', '', m.beschreibung));
          const chips = mk('div', 'meth-card-chips');
          (m.phasen||[]).forEach(p => chips.appendChild(tx('span', 'meth-chip meth-chip-phase', p)));
          (m.sozialform||[]).forEach(s => chips.appendChild(tx('span', 'meth-chip meth-chip-soz', SOZ_ABK[s] || s)));
          if (chips.children.length) item.appendChild(chips);
          list.appendChild(item);
        });
        body.appendChild(list);

        const saveRow = mk('div', ''); saveRow.style.cssText = 'display:flex;gap:8px;';
        const saveAllBtn = btn('Alle ' + methoden.length + ' speichern', 'btn btn-pri btn-sm');
        saveAllBtn.onclick = async () => {
          saveAllBtn.disabled = true; saveAllBtn.textContent = '⏳ Speichert…';
          const newRows = methoden.map(m => ({
            id: uid(),
            name: m.name,
            beschreibung: m.beschreibung || '',
            ziel: m.ziel || '',
            hinweise: m.hinweise || '',
            zeitbedarf: m.zeitbedarf || 'variabel',
            aufwand: parseInt(m.aufwand) || 1,
            sozialform: Array.isArray(m.sozialform) ? m.sozialform : [],
            phasen: Array.isArray(m.phasen) ? m.phasen : [],
            materialtyp: Array.isArray(m.materialtyp) ? m.materialtyp : [],
            typ: null,
            formate: Array.isArray(m.formate) ? m.formate : [],
            quelle: '',
          }));
          await sbInsert('methoden', newRows);
          newRows.forEach(r => METHDB.push(r));
          closeOv();
          refresh();
        };
        const discardBtn2 = btn('Verwerfen', 'btn btn-ghost btn-sm');
        discardBtn2.onclick = closeOv;
        saveRow.appendChild(saveAllBtn);
        saveRow.appendChild(discardBtn2);
        body.appendChild(saveRow);

      } catch(e) {
        showKIError(statusEl, e, 'Fehler: ');
        extractBtn.disabled = false; extractBtn.textContent = '✨ KI extrahiert';
      }
    };

    panel.appendChild(body);
    ov.appendChild(panel);
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
