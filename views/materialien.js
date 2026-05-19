// ── Materialien-Datenbank ─────────────────────────────────────────
let _kontextFiles = [];

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

function phaseChip(phase) {
  const c = PHASE_COLOR[phase] || { bg: 'var(--surf2)', tx: 'var(--tx2)' };
  const s = tx('span', 'matc-phase-chip', phase);
  s.style.background = c.bg; s.style.color = c.tx;
  return s;
}
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
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBtn.onclick(); });
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

  const schemaBtn = btn('📋 Schema kopieren', 'btn btn-ghost btn-sm');
  schemaBtn.onclick = async () => {
    const schema = await sbDownload('schema.json');
    await navigator.clipboard.writeText(JSON.stringify(schema, null, 2));
    schemaBtn.textContent = '✓ Kopiert!';
    setTimeout(() => { schemaBtn.textContent = '📋 Schema kopieren'; }, 2000);
  };

  const importBtn = btn('📥 Import', 'btn btn-pri btn-sm');
  importBtn.onclick = () => {
    const existing = div.querySelector('.mat-import-panel');
    if (existing) { existing.remove(); return; }
    const p = mk('div', 'mat-import-panel');
    p.appendChild(tx('div', 'mat-import-hint', 'JSON-Eintrag oder Array einfügen (aus KI-generiertem Schema):'));
    const ta = document.createElement('textarea');
    ta.className = 'mat-import-ta'; ta.placeholder = '{ "id": "...", "titel": "...", ... }';
    p.appendChild(ta);
    const actions = mk('div', ''); actions.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
    const errMsg = tx('span', 'mat-import-err', '');
    const addBtn2 = btn('Hinzufügen', 'btn btn-pri btn-sm');
    addBtn2.onclick = () => {
      errMsg.textContent = '';
      let parsed;
      try { parsed = JSON.parse(ta.value.trim()); } catch { errMsg.textContent = 'Ungültiges JSON.'; return; }
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      const invalid = entries.filter(e => !e.id || !e.titel);
      if (invalid.length) { errMsg.textContent = 'Jeder Eintrag braucht mindestens "id" und "titel".'; return; }
      const now = new Date().toISOString();
      entries.forEach(e => {
        if (!e.importiertAm) e.importiertAm = now;
        const idx = MATDB.findIndex(m => m.id === e.id);
        if (idx >= 0) MATDB[idx] = e; else MATDB.unshift(e);
      });
      saveMatDB();
      p.remove();
      S.view = 'materialien'; render();
    };
    const cancelBtn2 = btn('Abbrechen', 'btn btn-ghost btn-sm');
    cancelBtn2.onclick = () => p.remove();
    actions.appendChild(addBtn2); actions.appendChild(cancelBtn2); actions.appendChild(errMsg);
    p.appendChild(actions);
    div.insertBefore(p, div.children[1]);
  };

  const scanBtn = btn('📸 Aus Bild', 'btn btn-pri btn-sm');
  scanBtn.onclick = () => {
    const existing = div.querySelector('.mat-scan-panel');
    if (existing) { existing.remove(); return; }
    const oaiKey = localStorage.getItem('oai_key');
    if (!oaiKey) { alert('Bitte zuerst den OpenAI API-Key in den Einstellungen hinterlegen.'); return; }

    const p = mk('div', 'mat-scan-panel');
    function makeDropzone(label, hint, { initialFiles = [], onFilesChange = null, clearAllBtn: showClearAll = false } = {}) {
      const wrap = mk('div', 'mat-scan-group');
      const labelRow = mk('div', 'mat-scan-group-hdr');
      labelRow.appendChild(tx('div', 'mat-scan-group-label', label));
      let files = [...initialFiles];
      function notifyChange() { if (onFilesChange) onFilesChange([...files]); }
      function renderPreview() {
        preview.innerHTML = '';
        files.forEach((f, i) => {
          const thumb = mk('div', 'mat-scan-thumb');
          const img = document.createElement('img'); img.src = URL.createObjectURL(f); img.className = 'mat-scan-img';
          const rm = mk('button', 'mat-scan-rm'); rm.textContent = '✕';
          rm.onclick = () => { files.splice(i, 1); notifyChange(); renderPreview(); updateBtn(); };
          thumb.appendChild(img); thumb.appendChild(rm); preview.appendChild(thumb);
        });
        zone.textContent = files.length ? '+ Weitere Bilder' : '📂 Bilder hierher ziehen oder klicken';
        zone.style.padding = files.length ? '8px 14px' : '';
      }
      function addFiles(newFiles) { files = [...files, ...Array.from(newFiles)]; notifyChange(); renderPreview(); updateBtn(); }
      function clearFiles() { files = []; notifyChange(); renderPreview(); updateBtn(); }
      if (showClearAll) {
        const clrBtn = btn('Leeren', 'btn btn-ghost btn-xs');
        clrBtn.onclick = clearFiles; labelRow.appendChild(clrBtn);
      }
      wrap.appendChild(labelRow);
      wrap.appendChild(tx('div', 'mat-scan-group-hint', hint));
      const zone = mk('div', 'mat-scan-drop'); zone.textContent = '📂 Bilder hierher ziehen oder klicken';
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.style.display = 'none';
      zone.onclick = () => inp.click();
      zone.ondragover = e => { e.preventDefault(); zone.classList.add('drag-over'); };
      zone.ondragleave = () => zone.classList.remove('drag-over');
      zone.ondrop = e => { e.preventDefault(); zone.classList.remove('drag-over'); addFiles(e.dataTransfer.files); };
      inp.onchange = () => addFiles(inp.files);
      const preview = mk('div', 'mat-scan-preview');
      wrap.appendChild(zone); wrap.appendChild(inp); wrap.appendChild(preview);
      renderPreview();
      return { wrap, getFiles: () => files, clearFiles };
    }

    const { wrap: w1, getFiles: getKontext } = makeDropzone('📋 Kontext', 'Titelseite, Lehrerhandreichung, Erläuterungen & Lösungsseiten', { initialFiles: _kontextFiles, onFilesChange: f => { _kontextFiles = f; }, clearAllBtn: true });
    const { wrap: w2, getFiles: getSchuelermaterial, clearFiles: clearSchuelermaterial } = makeDropzone('📚 Schülermaterialien', 'M1, M2, M3 … – die eigentlichen Arbeitsblätter und Versuchsanleitungen');
    const groupsWrap = mk('div', 'mat-scan-groups');
    groupsWrap.appendChild(w1); groupsWrap.appendChild(w2);
    p.appendChild(groupsWrap);

    const statusRow = mk('div', ''); statusRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:12px;';
    const analyzeBtn = btn('✨ Analysieren & Importieren', 'btn btn-pri btn-sm');
    analyzeBtn.disabled = true;
    const statusMsg = tx('span', 'mat-import-err', '');
    const cancelBtn = btn('Abbrechen', 'btn btn-ghost btn-sm'); cancelBtn.onclick = () => p.remove();
    statusRow.appendChild(analyzeBtn); statusRow.appendChild(cancelBtn); statusRow.appendChild(statusMsg);
    p.appendChild(statusRow);

    function updateBtn() { analyzeBtn.disabled = getSchuelermaterial().length === 0; }

    analyzeBtn.onclick = async () => {
      const kontextFiles = getKontext(); const matFiles = getSchuelermaterial();
      if (!matFiles.length) return;
      const totalFiles = kontextFiles.length + matFiles.length;
      analyzeBtn.disabled = true; statusMsg.style.color = 'var(--tx3)';
      let elapsed = 0;
      const timer = setInterval(() => { elapsed++; statusMsg.textContent = '⏳ Analysiere ' + totalFiles + ' Bild(er)… ' + elapsed + ' Sek.'; }, 1000);
      statusMsg.textContent = '⏳ Analysiere ' + totalFiles + ' Bild(er)… 0 Sek.';
      try {
        const schema = await sbDownload('schema.json');
        const schemaStr = JSON.stringify(schema, null, 2);
        const toImgContent = f => new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = e => res({ type: 'image_url', image_url: { url: e.target.result, detail: 'high' } });
          reader.onerror = rej; reader.readAsDataURL(f);
        });
        const kontextImgs = await Promise.all(kontextFiles.map(toImgContent));
        const matImgs     = await Promise.all(matFiles.map(toImgContent));
        const idBase = Date.now();
        const prompt = `Du bist Assistent für eine Lehrerin an einem deutschen Gymnasium (NRW). Du erhältst zwei Gruppen von Bildern.\n\nGRUPPE 1 – KONTEXT (${kontextFiles.length} Bild${kontextFiles.length !== 1 ? 'er' : ''}): Titelseite, Lehrerhandreichung, Erläuterungen und Lösungsseiten. Lese daraus: Lösungen, Erwartungshorizonte, methodische Hinweise, Zeitplanung, didaktische Tipps.\n\nGRUPPE 2 – SCHÜLERMATERIALIEN (${matFiles.length} Bild${matFiles.length !== 1 ? 'er' : ''}): M1, M2, M3 usw. – die eigentlichen Arbeitsblätter.\n\nSCHEMA:\n${schemaStr}\n\nREGELN:\n- Gib ein JSON-Array aus, kein Text davor/danach\n- id Format: mat_${idBase}_1, mat_${idBase}_2 usw.\n- Erkenne selbst welche Bilder zusammengehören (z.B. M1 Seite 1+2 → ein Eintrag)\n- Kein Unterrichtseinheit-Eintrag, nur Einzelmaterialien\n- Titel: "Einheitstitel – M1", Lehrerhandreichung: "Einheitstitel – LH"\n- SII/Oberstufe → immer ["EF","Q1","Q2"]\n- loesung, loesungHinweis, erlaeuterung vollständig aus Kontext übernehmen\n- schueleraktivitaeten, artDerGeistigenTaetigkeit, darstellungsformen: alle vollständig aufführen`;
        const contentParts = [{ type: 'text', text: prompt }];
        if (kontextImgs.length) { contentParts.push({ type: 'text', text: '=== GRUPPE 1: KONTEXT ===' }); contentParts.push(...kontextImgs); }
        contentParts.push({ type: 'text', text: '=== GRUPPE 2: SCHÜLERMATERIALIEN ===' });
        contentParts.push(...matImgs);
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + oaiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4o', max_tokens: 16000, messages: [{ role: 'user', content: contentParts }] })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'OpenAI-Fehler');
        const choice = data.choices?.[0];
        const text2 = choice?.message?.content || '';
        const match = text2.match(/\[[\s\S]*\]/);
        if (!match) throw new Error('Kein JSON-Array in der Antwort gefunden.');
        const entries = JSON.parse(match[0]);
        if (!entries.length) throw new Error('Keine Einträge generiert.');
        const truncated = choice?.finish_reason === 'length';
        const now = new Date().toISOString();
        entries.forEach(e => {
          if (!e.id) e.id = 'mat_' + Date.now() + '_' + Math.random().toString(36).slice(2,5);
          if (!e.importiertAm) e.importiertAm = now;
          const idx = MATDB.findIndex(m => m.id === e.id);
          if (idx >= 0) MATDB[idx] = e; else MATDB.unshift(e);
        });
        clearInterval(timer);
        saveMatDB();
        clearSchuelermaterial();
        subTitle.textContent = MATDB.length + ' Einträge';
        renderCards();
        statusMsg.style.color = truncated ? '#d97706' : 'var(--grn)';
        statusMsg.textContent = truncated
          ? `⚠ Antwort abgeschnitten – ggf. nicht alle Materialien importiert.`
          : `✓ ${entries.length} Material${entries.length !== 1 ? 'ien' : ''} importiert.`;
        analyzeBtn.disabled = true;
      } catch(e) {
        clearInterval(timer);
        statusMsg.style.color = '#dc2626'; statusMsg.textContent = 'Fehler: ' + e.message;
        analyzeBtn.disabled = false;
      }
    };
    div.insertBefore(p, div.children[1]);
  };

  hdrBtns.appendChild(schemaBtn); hdrBtns.appendChild(scanBtn); hdrBtns.appendChild(importBtn);
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
  [['', 'Alle Fächer'], ['Mathematik','Mathematik'], ['Chemie','Chemie'], ['Biologie','Biologie']].forEach(([v, l]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = l; fachSel.appendChild(o);
  });

  const typSel = document.createElement('select'); typSel.className = 'finp'; typSel.style.width = 'auto';
  const typen2 = ['', ...new Set(MATDB.map(m => m.materialtyp).filter(Boolean))];
  typen2.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t || 'Alle Typen'; typSel.appendChild(o); });

  const jgSel = document.createElement('select'); jgSel.className = 'finp'; jgSel.style.width = 'auto';
  const jgVals = ['', ...[...new Set(MATDB.flatMap(m => m.jahrgang || []).filter(Boolean))].sort((a, b) => {
    const order = ['5','6','7','8','9','10','EF','Q1','Q2'];
    return (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99);
  })];
  jgVals.forEach(j => { const o = document.createElement('option'); o.value = j; o.textContent = j ? 'Jg. ' + j : 'Alle Jg.'; jgSel.appendChild(o); });

  const phaseSel = document.createElement('select'); phaseSel.className = 'finp'; phaseSel.style.width = 'auto';
  const phases = ['', ...new Set(MATDB.flatMap(m => m.unterrichtsphase || []).filter(Boolean))].sort();
  phases.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p || 'Alle Phasen'; phaseSel.appendChild(o); });

  sb2.appendChild(si); sb2.appendChild(fachSel); sb2.appendChild(jgSel); sb2.appendChild(typSel); sb2.appendChild(phaseSel);
  sf.appendChild(sb2);
  div.appendChild(sf);

  // ── Karten-Grid ──────────────────────────────────────────────
  const gridWrap = mk('div', '');
  const countRow = tx('div', 'matc-count', '');
  gridWrap.appendChild(countRow);
  const grid = mk('div', 'matc-grid');
  gridWrap.appendChild(grid);
  div.appendChild(gridWrap);

  function filteredList() {
    const q = si.value.toLowerCase().trim();
    const fach = fachSel.value; const typ = typSel.value;
    const jg = jgSel.value;    const phase = phaseSel.value;
    return MATDB.filter(m => {
      if (fach  && !(m.fach || []).includes(fach)) return false;
      if (typ   && m.materialtyp !== typ) return false;
      if (jg    && !(m.jahrgang || []).includes(jg)) return false;
      if (phase && !(m.unterrichtsphase || []).includes(phase)) return false;
      if (q && !m.titel.toLowerCase().includes(q) &&
               !(m.themen || []).join(' ').toLowerCase().includes(q) &&
               !(m.beschreibung || '').toLowerCase().includes(q) &&
               !(m.rolleImKontext || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderCards() {
    grid.innerHTML = '';
    const hits = filteredList();
    countRow.textContent = hits.length + ' von ' + MATDB.length + ' Materialien';
    if (!hits.length) {
      const empty = tx('div', '', 'Keine Einträge gefunden.');
      empty.style.cssText = 'padding:20px;color:var(--tx3);grid-column:1/-1;';
      grid.appendChild(empty); return;
    }
    hits.forEach(mat => {
      const card = mk('div', 'matc-card');
      const needsReview = mat.review && Object.values(mat.review).some(r => r?.needsReview);

      // Kopfzeile: Nr-Badge + Titel + Del-Button
      const cardHdr = mk('div', 'matc-card-hdr');
      if (mat.materialnummer) cardHdr.appendChild(tx('span', 'matc-nr', mat.materialnummer));
      // Haupttitel: rolleImKontext wenn vorhanden, sonst Titel
      const displayTitle = mat.rolleImKontext || mat.titel;
      const titleEl = tx('span', 'matc-title', displayTitle);
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
        countRow.textContent = filteredList().length + ' von ' + MATDB.length + ' Materialien';
      };
      cardHdr.appendChild(delBtn);
      card.appendChild(cardHdr);

      // Einheitstitel als Untertitel (nur wenn rolleImKontext genutzt wird)
      if (mat.rolleImKontext) {
        const unitTitle = mat.titel.replace(/\s*–\s*[A-Z]{1,2}\d*\s*$/, '').trim();
        if (unitTitle && unitTitle !== mat.rolleImKontext) card.appendChild(tx('div', 'matc-unit', unitTitle));
      }

      // Typ-Badge + Fach + Jahrgang
      const metaRow = mk('div', 'matc-meta');
      if (mat.materialtyp) metaRow.appendChild(typBadge(mat.materialtyp));
      (mat.fach || []).forEach(f => {
        const key = Object.keys(FACH_ICONS || {}).find(k => k === f || FACH_ICONS[k] === f);
        const icon = key ? FACH_ICONS[key] : '';
        metaRow.appendChild(tx('span', 'matc-fach', icon + ' ' + f));
      });
      if ((mat.jahrgang || []).length) {
        metaRow.appendChild(tx('span', 'matc-jg', 'Jg. ' + mat.jahrgang.join('/')));
      }
      card.appendChild(metaRow);

      // Phasen
      if ((mat.unterrichtsphase || []).length) {
        const phRow = mk('div', 'matc-phases');
        mat.unterrichtsphase.forEach(p => phRow.appendChild(phaseChip(p)));
        card.appendChild(phRow);
      }

      // Footer: KLP-Anzahl + Kognition
      const footer = mk('div', 'matc-footer');
      const klpCount = (mat.kompetenzenKLP || []).length;
      if (klpCount) {
        const klpBadge = tx('span', 'matc-klp-count', klpCount + ' KLP');
        footer.appendChild(klpBadge);
      }
      if (mat.kognitiveBeanspruchung) {
        footer.appendChild(tx('span', 'matc-kogn', mat.kognitiveBeanspruchung));
      }
      if (mat.lautstaerke) {
        const icons = { 'leise': '🔇', 'mittel': '🔉', 'laut': '🔊' };
        footer.appendChild(tx('span', 'matc-laut', icons[mat.lautstaerke] || mat.lautstaerke));
      }
      if (footer.children.length) card.appendChild(footer);

      card.onclick = () => openMatOverlay(mat, card, overlay, panel, panTitle, renderCards);
      grid.appendChild(card);
    });
  }

  si.oninput = renderCards; fachSel.onchange = renderCards;
  typSel.onchange = renderCards; jgSel.onchange = renderCards; phaseSel.onchange = renderCards;
  renderCards();
  return div;
}

function saveMatDB() {
  sbUpload('materialien.json', MATDB).catch(e => console.error('Speichern fehlgeschlagen:', e));
}

// ── Detail-Overlay öffnen ────────────────────────────────────────
function openMatOverlay(mat, card, overlay, panel, panTitle, renderCards) {
  panel.querySelector('.matd-panel-body')?.remove();
  panTitle.textContent = mat.titel;
  const body = mk('div', 'matd-panel-body');

  const needsAny = mat.review && Object.values(mat.review).some(rv => rv?.needsReview);
  if (needsAny) {
    const reviewBar = mk('div', 'mat-review-bar');
    reviewBar.appendChild(tx('span', '', '⚠ Einige Felder wurden zur Prüfung markiert.'));
    const clearBtn = btn('✓ Alles geprüft', 'btn btn-pri btn-xs');
    clearBtn.onclick = () => {
      Object.values(mat.review).forEach(rv => { if (rv) rv.needsReview = false; });
      saveMatDB(); reviewBar.remove();
      body.querySelectorAll('.needs-review').forEach(el => el.classList.remove('needs-review'));
      body.querySelectorAll('.mat-review-inline').forEach(el => el.remove());
    };
    reviewBar.appendChild(clearBtn);
    body.appendChild(reviewBar);
  }

  function editRow(label, get, set, isArea, reviewKey) {
    const needsCheck = reviewKey && mat.review?.[reviewKey]?.needsReview;
    const r = mk('div', 'mat-detail-row' + (needsCheck ? ' needs-review' : ''));
    const lbl = tx('span', 'mat-detail-label', label);
    if (needsCheck) { const h = tx('span', 'mat-review-inline', '⚠'); h.title = mat.review[reviewKey].reason || 'Bitte prüfen'; lbl.appendChild(h); }
    r.appendChild(lbl);
    function onSave(v) {
      set(v);
      if (reviewKey && mat.review?.[reviewKey]) {
        mat.review[reviewKey].needsReview = false;
        r.classList.remove('needs-review'); r.querySelector('.mat-review-inline')?.remove();
      }
      saveMatDB();
      if (label === 'Titel') { panTitle.textContent = mat.titel; }
      renderCards();
    }
    if (isArea) {
      const ta = document.createElement('textarea'); ta.className = 'mat-edit-inp'; ta.value = get();
      ta.onblur = () => onSave(ta.value); r.appendChild(ta);
    } else {
      const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'mat-edit-inp'; inp.value = get();
      inp.onblur = () => onSave(inp.value); r.appendChild(inp);
    }
    body.appendChild(r);
  }

  function arrGet(key) { return (mat[key] || []).join(', '); }
  function arrSet(key) { return v => { mat[key] = v.split(',').map(s => s.trim()).filter(Boolean); }; }

  // Teil von Einheit
  if (mat.einheitId) {
    const einheit = MATDB.find(m => m.id === mat.einheitId);
    if (einheit) {
      const r = mk('div', 'mat-detail-row mat-einheit-ref');
      r.appendChild(tx('span', 'mat-detail-label', 'Teil von'));
      const link = tx('span', 'mat-einheit-link', '📦 ' + einheit.titel);
      link.onclick = () => openMatOverlay(einheit, null, overlay, panel, panTitle, renderCards);
      r.appendChild(link); body.appendChild(r);
    }
  }

  editRow('Titel',                () => mat.titel || '',             v => { mat.titel = v; },           false, 'titel');
  editRow('Fach',                 () => arrGet('fach'),              arrSet('fach'),                    false, 'fach');
  editRow('Jahrgang',             () => arrGet('jahrgang'),          arrSet('jahrgang'),                false, 'jahrgang');
  editRow('Themen',               () => arrGet('themen'),            arrSet('themen'));
  editRow('Materialtyp',          () => mat.materialtyp || '',       v => { mat.materialtyp = v; });
  editRow('Beschreibung',         () => mat.beschreibung || '',      v => { mat.beschreibung = v; },    true);
  editRow('Materialnummer',       () => mat.materialnummer || '',    v => { mat.materialnummer = v; });
  editRow('Rolle im Kontext',     () => mat.rolleImKontext || '',    v => { mat.rolleImKontext = v; });

  const optR = mk('div', 'mat-detail-row');
  optR.appendChild(tx('span', 'mat-detail-label', 'Optional'));
  const optChk = document.createElement('input'); optChk.type = 'checkbox'; optChk.checked = !!mat.optional; optChk.style.marginTop = '3px';
  optChk.onchange = () => { mat.optional = optChk.checked; saveMatDB(); renderCards(); };
  optR.appendChild(optChk); body.appendChild(optR);

  editRow('Unterrichtsphase',       () => arrGet('unterrichtsphase'),           arrSet('unterrichtsphase'),           false, 'unterrichtsphase');
  editRow('Sozialform geeignet',    () => arrGet('sozialformenGeeignet'),        arrSet('sozialformenGeeignet'));
  editRow('Methoden geeignet',      () => arrGet('methodenGeeignet'),            arrSet('methodenGeeignet'));
  editRow('Schüleraktivitäten',     () => arrGet('schueleraktivitaeten'),        arrSet('schueleraktivitaeten'));
  editRow('Art der Tätigkeit',      () => arrGet('artDerGeistigenTaetigkeit'),   arrSet('artDerGeistigenTaetigkeit'));
  editRow('Darstellungsformen',     () => arrGet('darstellungsformen'),          arrSet('darstellungsformen'));
  editRow('Fachliche Voraussetzung',() => arrGet('voraussetzungenFachlich'),     arrSet('voraussetzungenFachlich'));
  editRow('Method. Voraussetzung',  () => arrGet('voraussetzungenMethodisch'),   arrSet('voraussetzungenMethodisch'));

  klpRow(mat, body, { querySelector: () => null });

  editRow('Kognit. Beanspruchung',  () => mat.kognitiveBeanspruchung || '',     v => { mat.kognitiveBeanspruchung = v; });
  editRow('Sprachl. Anforderungen', () => mat.sprachlicheAnforderungen || '',   v => { mat.sprachlicheAnforderungen = v; });
  editRow('Lautstärke',             () => mat.lautstaerke || '',                v => { mat.lautstaerke = v; });
  editRow('Differenzierung',        () => arrGet('differenzierungsformen'),     arrSet('differenzierungsformen'));
  editRow('Anmerkungen',            () => mat.persoenlicheAnmerkungen || '',    v => { mat.persoenlicheAnmerkungen = v; }, true);

  if (mat.materialtyp !== 'Unterrichtseinheit') {
    const loeHdr = mk('div', 'mat-loe-sec-hdr'); loeHdr.textContent = 'Lösung & Erläuterung';
    body.appendChild(loeHdr);
    editRow('Lösung (Text)',     () => mat.loesung || '',        v => { mat.loesung = v; },        true);
    editRow('Lösung (Verweis)', () => mat.loesungHinweis || '', v => { mat.loesungHinweis = v; }, false);
    editRow('Erläuterung',      () => mat.erlaeuterung || '',   v => { mat.erlaeuterung = v; },   true);
  }

  if (mat.materialtyp === 'Unterrichtseinheit') {
    const members = MATDB.filter(m => m.einheitId === mat.id)
      .sort((a, b) => (a.materialnummer || '').localeCompare(b.materialnummer || '', undefined, { numeric: true }));
    const secHdr = mk('div', 'mat-einheit-sec-hdr');
    secHdr.appendChild(tx('span', '', '📋 Enthaltene Materialien'));
    secHdr.appendChild(tx('span', 'mat-einheit-count', members.length + ' Einträge'));
    body.appendChild(secHdr);
    if (!members.length) {
      const hint = tx('div', '', 'Noch keine Materialien mit dieser Einheit verknüpft.');
      hint.style.cssText = 'font-size:12px;color:var(--tx3);padding:6px 0;';
      body.appendChild(hint);
    } else {
      const tbl = mk('div', 'mat-einheit-tbl');
      members.forEach(m => {
        const mRow = mk('div', 'mat-einheit-member');
        mRow.appendChild(tx('span', 'mat-einheit-nr', m.materialnummer || '–'));
        mRow.appendChild(tx('span', 'mat-einheit-titel', m.titel));
        mRow.appendChild(tx('span', 'mat-einheit-rolle', m.rolleImKontext || ''));
        const badges = mk('span', '');
        if (m.optional) badges.appendChild(tx('span', 'mat-einheit-badge opt', 'optional'));
        if (m.materialtyp === 'Lehrerhandreichung') badges.appendChild(tx('span', 'mat-einheit-badge lh', 'LH'));
        mRow.appendChild(badges);
        mRow.onclick = () => openMatOverlay(m, null, overlay, panel, panTitle, renderCards);
        tbl.appendChild(mRow);
      });
      body.appendChild(tbl);
    }
  }

  if (mat.importiertAm) {
    const ts = new Date(mat.importiertAm);
    body.appendChild(tx('div', 'mat-detail-ts', 'Importiert am ' + ts.toLocaleDateString('de-DE') + ', ' + ts.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })));
  }

  // Löschen
  const delBar = mk('div', 'mat-detail-delbar');
  const delBtn2 = btn('🗑 Eintrag löschen', 'btn btn-danger btn-xs');
  delBtn2.onclick = () => {
    if (!confirm('„' + mat.titel + '" aus der Datenbank löschen?')) return;
    MATDB = MATDB.filter(m => m.id !== mat.id);
    saveMatDB(); overlay.classList.remove('open'); body.remove(); renderCards();
  };
  delBar.appendChild(delBtn2); body.appendChild(delBar);

  panel.appendChild(body);
  overlay.classList.add('open');
}

async function klpKiVorschlag(mat, onResult) {
  const key = localStorage.getItem('ant_key');
  if (!key) { alert('Bitte zuerst den Anthropic API-Key in den Einstellungen speichern.'); return; }
  const faecher = (mat.fach || []).map(f => f.toLowerCase());
  const kandidaten = KLPDB.filter(e => !faecher.length || faecher.includes(e.fach.toLowerCase()));
  const klpText = kandidaten.map(e =>
    `ID: ${e.id}\nJg: ${e.jahrgang} | IF: ${e.inhaltsfeld} | Codes: ${e.kompetenzcodes.join(', ')}\n${e.beschreibung}`
  ).join('\n\n');
  const prompt = `Du bist Assistent für NRW-Lehrkräfte. Analysiere das Unterrichtsmaterial und wähle passende KLP-Kompetenzen.\n\nMaterial:\n- Titel: ${mat.titel || '–'}\n- Fach: ${(mat.fach || []).join(', ') || '–'}\n- Jahrgang: ${(mat.jahrgang || []).join(', ') || '–'}\n- Themen: ${(mat.themen || []).join(', ') || '–'}\n- Beschreibung: ${mat.beschreibung || '–'}\n\nWähle 2–6 passende KLP-Einträge. Antworte NUR mit JSON-Array der IDs: ["ID1","ID2"]\n\nKLP-Einträge:\n${klpText}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 256, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error((await res.json())?.error?.message || res.statusText);
  const data = await res.json();
  const text = data.content?.[0]?.text || '[]';
  const ids = JSON.parse(text.match(/\[.*\]/s)?.[0] || '[]');
  onResult(ids.filter(id => KLPDB.some(e => e.id === id) && !(mat.kompetenzenKLP || []).includes(id)));
}

function klpRow(mat, detail, _row) {
  if (!mat.kompetenzenKLP) mat.kompetenzenKLP = [];
  const r = mk('div', 'mat-detail-row');
  r.appendChild(tx('span', 'mat-detail-label', 'KLP-Kompetenzen'));
  const wrap = mk('div', 'klp-selector');

  function rebuildChips() {
    wrap.innerHTML = '';
    const chipsDiv = mk('div', 'klp-chips');
    (mat.kompetenzenKLP || []).forEach(id => {
      const entry = KLPDB.find(e => e.id === id);
      const chip = mk('div', 'klp-chip');
      chip.textContent = entry ? `[${entry.kompetenzcodes.join(', ')}] ${entry.beschreibung}` : id;
      chip.title = entry ? entry.beschreibung : id;
      const x = tx('span', 'klp-chip-x', '×');
      x.onclick = () => { mat.kompetenzenKLP = mat.kompetenzenKLP.filter(i => i !== id); saveMatDB(); rebuildChips(); };
      chip.appendChild(x); chipsDiv.appendChild(chip);
    });
    wrap.appendChild(chipsDiv);

    const searchWrap = mk('div', 'klp-search-wrap');
    const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'mat-edit-inp'; inp.placeholder = 'Kompetenz suchen…';
    searchWrap.appendChild(inp);
    const dd = mk('div', 'klp-dd'); dd.style.display = 'none';
    searchWrap.appendChild(dd);

    function showDropdown(q) {
      dd.innerHTML = '';
      const faecher = (mat.fach || []).map(f => f.toLowerCase());
      let hits = KLPDB.filter(e => {
        if ((mat.kompetenzenKLP || []).includes(e.id)) return false;
        if (faecher.length && !faecher.includes(e.fach.toLowerCase())) return false;
        if (q.length >= 2) { const txt = (e.beschreibung + ' ' + e.inhaltsfeld + ' ' + e.kompetenzcodes.join(' ')).toLowerCase(); if (!txt.includes(q.toLowerCase())) return false; }
        return true;
      });
      if (q.length < 2) {
        dd.appendChild(tx('div', 'klp-dd-hint', hits.length + ' Kompetenzen – tippe zum Eingrenzen'));
        dd.style.display = 'block'; return;
      }
      if (!hits.length) { dd.appendChild(tx('div', 'klp-dd-hint', 'Keine Treffer.')); dd.style.display = 'block'; return; }
      const grouped = {};
      hits.forEach(e => { if (!grouped[e.inhaltsfeld]) grouped[e.inhaltsfeld] = []; grouped[e.inhaltsfeld].push(e); });
      Object.entries(grouped).forEach(([ifName, entries]) => {
        dd.appendChild(tx('div', 'klp-dd-group', ifName));
        entries.forEach(entry => {
          const item = mk('div', 'klp-dd-item');
          item.appendChild(tx('span', 'klp-dd-codes', entry.kompetenzcodes.join(', ')));
          item.appendChild(tx('span', 'klp-dd-desc', entry.beschreibung));
          item.title = `Jg. ${entry.jahrgang} · ${entry.inhaltsfeld}`;
          item.onmousedown = e => {
            e.preventDefault();
            mat.kompetenzenKLP.push(entry.id); saveMatDB();
            inp.value = ''; dd.style.display = 'none'; rebuildChips();
          };
          dd.appendChild(item);
        });
      });
      dd.style.display = 'block';
    }
    inp.oninput = () => showDropdown(inp.value);
    inp.onfocus = () => showDropdown(inp.value);
    inp.onblur = () => setTimeout(() => { dd.style.display = 'none'; }, 150);
    wrap.appendChild(searchWrap);

    const kiBtn = btn('✨ KI-Vorschlag', 'btn btn-ghost btn-xs klp-ki-btn');
    kiBtn.onclick = async () => {
      kiBtn.textContent = '…'; kiBtn.disabled = true;
      try {
        await klpKiVorschlag(mat, ids => {
          if (!ids.length) { kiBtn.textContent = 'Keine Vorschläge'; setTimeout(() => rebuildChips(), 1500); return; }
          const suggestDiv = mk('div', 'klp-suggestions');
          suggestDiv.appendChild(tx('div', 'klp-suggest-hint', `✨ ${ids.length} Vorschlag${ids.length !== 1 ? 'schläge' : ''} – klicke zum Übernehmen:`));
          ids.forEach(id => {
            const entry = KLPDB.find(e => e.id === id); if (!entry) return;
            const chip = mk('div', 'klp-chip klp-chip-suggest');
            chip.textContent = `[${entry.kompetenzcodes.join(', ')}] ${entry.beschreibung.slice(0,70)}${entry.beschreibung.length > 70 ? '…' : ''}`;
            chip.title = entry.beschreibung;
            chip.onclick = () => {
              mat.kompetenzenKLP.push(id); saveMatDB();
              chip.remove(); if (!suggestDiv.querySelectorAll('.klp-chip-suggest').length) suggestDiv.remove();
              rebuildChips();
            };
            suggestDiv.appendChild(chip);
          });
          const addAll = btn('Alle übernehmen', 'btn btn-pri btn-xs'); addAll.style.marginTop = '6px';
          addAll.onclick = () => { ids.forEach(id => { if (!mat.kompetenzenKLP.includes(id)) mat.kompetenzenKLP.push(id); }); saveMatDB(); suggestDiv.remove(); rebuildChips(); };
          suggestDiv.appendChild(addAll); wrap.appendChild(suggestDiv);
        });
      } catch (e) { kiBtn.textContent = '⚠ Fehler'; console.error(e); setTimeout(() => rebuildChips(), 2000); return; }
      kiBtn.textContent = '✨ KI-Vorschlag'; kiBtn.disabled = false;
    };
    wrap.appendChild(kiBtn);
    r.appendChild(wrap);
  }
  rebuildChips();
  detail.appendChild(r);
}
