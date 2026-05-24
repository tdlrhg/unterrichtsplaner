// ── mat-overlay.js – Detail-Overlay, KLP-Vorschlag ────────────
function openMatOverlay(mat, card, overlay, panel, panTitle, renderCards) {
  panel.querySelector('.matd-panel-body')?.remove();
  panTitle.textContent = mat.titel;
  const body = mk('div', 'matd-panel-body');
  function closePanel() { overlay.classList.remove('open'); body.remove(); }

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
      inp.onblur = () => onSave(inp.value);
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); onSave(inp.value); inp.blur(); closePanel(); } };
      r.appendChild(inp);
    }
    body.appendChild(r);
  }

  function arrGet(key) { return (mat[key] || []).join(', '); }
  function arrSet(key) { return v => { mat[key] = v.split(',').map(s => s.trim()).filter(Boolean); }; }

  // ── Materialvorschau ─────────────────────────────────────────
  const _matKey = mat.r2key || mat.dateipfad;
  if (_matKey) {
    const prevWrap = mk('div', 'mat-detail-preview');
    const prevBtn = btn('👁 Vorschau laden', 'btn btn-ghost btn-xs');
    const prevPages = mk('div', 'mat-detail-preview-pages');
    prevBtn.onclick = async () => {
      prevBtn.disabled = true; prevBtn.textContent = '⏳ Lade…';
      try {
        const buf = await r2Download(_matKey);
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        prevPages.innerHTML = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const vp0  = page.getViewport({ scale: 1 });
          const scale = 280 / vp0.width;
          const vp   = page.getViewport({ scale });
          const cv   = document.createElement('canvas');
          cv.width = vp.width; cv.height = vp.height;
          await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
          cv.className = 'mat-detail-preview-thumb';
          prevPages.appendChild(cv);
        }
        prevBtn.remove();
      } catch(e2) {
        prevBtn.textContent = '⚠ ' + e2.message; prevBtn.disabled = false;
      }
    };
    prevWrap.appendChild(prevBtn);
    prevWrap.appendChild(prevPages);
    body.appendChild(prevWrap);

    // Weitere Dateien
    (mat.dateipfadeWeitere || []).forEach((wKey, i) => {
      const wWrap = mk('div', 'mat-detail-preview');
      const wBtn = btn(`👁 Datei ${i + 2} laden`, 'btn btn-ghost btn-xs');
      const wPages = mk('div', 'mat-detail-preview-pages');
      wBtn.onclick = async () => {
        wBtn.disabled = true; wBtn.textContent = '⏳ Lade…';
        try {
          const buf = await r2Download(wKey);
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
          wPages.innerHTML = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const vp0 = page.getViewport({ scale: 1 });
            const vp = page.getViewport({ scale: 280 / vp0.width });
            const cv = document.createElement('canvas');
            cv.width = vp.width; cv.height = vp.height;
            await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
            cv.className = 'mat-detail-preview-thumb';
            wPages.appendChild(cv);
          }
          wBtn.remove();
        } catch(e2) { wBtn.textContent = '⚠ ' + e2.message; wBtn.disabled = false; }
      };
      wWrap.appendChild(wBtn); wWrap.appendChild(wPages);
      body.appendChild(wWrap);
    });
  }

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
  editRow('Quelle',               () => mat.quelle || '',            v => { mat.quelle = v; });

  // ── Reihe zuweisen ────────────────────────────────────────────
  const SII_JG2 = new Set(['ef','q1','q2','sii','q1/q2']);
  const matFaecher = (mat.fach || []).map(f => f.toLowerCase());
  const matJgArr   = (mat.jahrgang || []).map(j => j.toLowerCase());
  const matIsSII   = matJgArr.some(j => SII_JG2.has(j));
  const FACH_MAP2  = { 'ch': 'chemie', 'bio': 'biologie', 'm': 'mathematik', 'mathe': 'mathematik' };
  function normFach(f) { const l = (f||'').toLowerCase().split('_')[0].split(' ')[0]; return FACH_MAP2[l] || l; }
  const blockOptionen = [{ value: '', label: '– keine Zuweisung –' }];
  (S.data.fachplanungen || []).forEach(fp => {
    const fpFach = normFach(fp.fach);
    if (matFaecher.length && !matFaecher.some(f => { const nf = normFach(f); return fpFach.includes(nf) || nf.includes(fpFach); })) return;
    const fpJgLower = (fp.jahrgang || '').toLowerCase();
    const fpIsSII = SII_JG2.has(fpJgLower);
    if (matJgArr.length && !(matJgArr.includes(fpJgLower) || (matIsSII && fpIsSII))) return;
    (fp.blocks || []).forEach(block => {
      const label = fp.jahrgang + ' · ' + (block.titel || block.name || 'Block');
      blockOptionen.push({ value: block.id, label });
    });
  });
  const blockRow = mk('div', 'mat-detail-row');
  blockRow.appendChild(tx('span', 'mat-detail-label', 'Block'));
  const blockSel = document.createElement('select'); blockSel.className = 'finp';
  blockSel.style.cssText = 'font-size:12px;padding:3px 6px;max-width:320px;';
  blockOptionen.forEach(o => {
    const opt = document.createElement('option'); opt.value = o.value; opt.textContent = o.label;
    if (mat.blockId && mat.blockId === o.value) opt.selected = true;
    blockSel.appendChild(opt);
  });
  blockSel.onchange = () => {
    mat.blockId = blockSel.value || null;
    saveMatDB(); renderCards();
  };
  blockRow.appendChild(blockSel);
  body.appendChild(blockRow);
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

  // ── Methoden-Verknüpfungen (IDs aus METHDB) ───────────────────
  const methLinkRow = mk('div', 'mat-detail-row');
  const methLinkLbl = mk('div', '');
  methLinkLbl.style.cssText = 'display:flex;flex-direction:column;gap:1px;min-width:120px;';
  methLinkLbl.appendChild(tx('span', 'mat-detail-label', 'Methoden-Links'));
  const methLinkHint = tx('span', '', 'via 🎯 Methoden-Check');
  methLinkHint.style.cssText = 'font-size:10px;color:var(--tx3);';
  methLinkLbl.appendChild(methLinkHint);
  methLinkRow.appendChild(methLinkLbl);
  const methLinkVal = mk('div', '');
  methLinkVal.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;align-items:center;';
  function renderMethLinks() {
    methLinkVal.innerHTML = '';
    (mat.methodenIds || []).forEach(mid => {
      const m = METHDB.find(x => x.id === mid);
      if (!m) return;
      const chip = mk('span', '');
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:3px;background:var(--bg2);border:1px solid var(--bdr);border-radius:4px;padding:2px 7px;font-size:11px;cursor:default;';
      chip.appendChild(document.createTextNode(m.name));
      const unlink = mk('button', '');
      unlink.textContent = '✕'; unlink.title = 'Verknüpfung entfernen';
      unlink.style.cssText = 'border:none;background:none;cursor:pointer;font-size:10px;color:var(--tx3);padding:0 0 0 4px;line-height:1;';
      unlink.onclick = () => {
        mat.methodenIds = (mat.methodenIds || []).filter(x => x !== mid);
        saveMatDB(); renderMethLinks();
      };
      chip.appendChild(unlink);
      methLinkVal.appendChild(chip);
    });
    if (!(mat.methodenIds || []).length) methLinkVal.appendChild(tx('span', '', '–'));
  }
  renderMethLinks();
  methLinkRow.appendChild(methLinkVal);
  body.appendChild(methLinkRow);
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

  // ── Kontext-Datei zuweisen ────────────────────────────────────
  if (_matKey) {
    const ktxSection = mk('div', 'mat-detail-ktx');
    const ktxHdr = mk('div', 'mat-detail-ktx-hdr');
    ktxHdr.appendChild(tx('span', 'mat-detail-label', 'Kontext-Datei'));
    const _ktxDisplay = mat.kontextR2key || mat.kontextPfad;
    const ktxKey = tx('span', 'mat-detail-ktx-key', _ktxDisplay ? '📎 ' + _ktxDisplay.split('/').pop() : 'keine');
    ktxHdr.appendChild(ktxKey);
    const ktxPickBtn = btn('📂 Aus R2 wählen', 'btn btn-ghost btn-xs');
    const ktxClearBtn = btn('✕', 'btn btn-ghost btn-xs');
    ktxClearBtn.title = 'Kontext entfernen';
    ktxClearBtn.style.display = _ktxDisplay ? '' : 'none';
    ktxClearBtn.onclick = () => {
      mat.kontextR2key = null; mat.kontextPfad = null; saveMatDB();
      ktxKey.textContent = 'keine'; ktxClearBtn.style.display = 'none';
      ktxTree.innerHTML = ''; ktxTree.style.display = 'none'; ktxPickBtn.textContent = '📂 Aus R2 wählen';
    };
    ktxHdr.appendChild(ktxPickBtn); ktxHdr.appendChild(ktxClearBtn);
    ktxSection.appendChild(ktxHdr);

    const ktxTree = mk('div', 'mat-r2-tree'); ktxTree.style.display = 'none';
    ktxSection.appendChild(ktxTree);

    ktxPickBtn.onclick = () => {
      if (ktxTree.style.display !== 'none') { ktxTree.style.display = 'none'; ktxPickBtn.textContent = '📂 Aus R2 wählen'; return; }
      ktxTree.style.display = 'block'; ktxPickBtn.textContent = '▲ Schließen';
      ktxTree.innerHTML = '<span style="color:var(--tx3);font-size:12px">⏳ Lade…</span>';

      async function renderKtxFolder(prefix, container) {
        container.innerHTML = '<span style="color:var(--tx3);font-size:12px">⏳</span>';
        const { folders, files } = await r2List(prefix);
        container.innerHTML = '';
        folders.forEach(f => {
          const name = f.slice(prefix.length).replace(/\/$/, '');
          const row = mk('div', 'mat-r2-folder');
          const toggle = tx('span', 'mat-r2-folder-name', '📁 ' + name);
          const sub = mk('div', 'mat-r2-subfolder'); sub.style.display = 'none';
          let loaded = false;
          toggle.onclick = () => {
            const open = sub.style.display !== 'none';
            sub.style.display = open ? 'none' : 'block';
            if (!loaded && !open) { loaded = true; renderKtxFolder(f, sub); }
          };
          row.appendChild(toggle); row.appendChild(sub); container.appendChild(row);
        });
        files.forEach(({ key }) => {
          if (!key.endsWith('.pdf') && !key.endsWith('.png') && !key.endsWith('.jpg')) return;
          const name = key.split('/').pop();
          const wrap = mk('div', 'mat-r2-file-wrap');
          const row = mk('div', 'mat-r2-file');
          row.appendChild(tx('span', 'mat-r2-filename', name));

          // Vorschau-Button
          const prevBtn = btn('👁', 'btn btn-ghost btn-xs');
          prevBtn.title = 'Erste Seite anzeigen';
          const thumbWrap = mk('div', 'mat-r2-ktx-thumb'); thumbWrap.style.display = 'none';
          prevBtn.onclick = async () => {
            if (thumbWrap.style.display !== 'none') { thumbWrap.style.display = 'none'; return; }
            prevBtn.textContent = '⏳'; prevBtn.disabled = true;
            try {
              const buf = await r2Download(key);
              const isPdf = key.endsWith('.pdf');
              thumbWrap.innerHTML = '';
              if (isPdf) {
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
                const page = await pdf.getPage(1);
                const vp0 = page.getViewport({ scale: 1 });
                const cv = document.createElement('canvas');
                const vp = page.getViewport({ scale: 320 / vp0.width });
                cv.width = vp.width; cv.height = vp.height;
                await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
                cv.style.cssText = 'max-width:300px;height:auto;border:1px solid var(--bord);border-radius:4px;';
                thumbWrap.appendChild(cv);
              } else {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(new Blob([buf]));
                img.style.cssText = 'max-width:300px;height:auto;border:1px solid var(--bord);border-radius:4px;';
                thumbWrap.appendChild(img);
              }
              thumbWrap.style.display = 'block';
            } catch(e3) {
              thumbWrap.textContent = '⚠ ' + e3.message; thumbWrap.style.display = 'block';
            } finally { prevBtn.textContent = '👁'; prevBtn.disabled = false; }
          };
          row.appendChild(prevBtn);

          const useBtn = btn('Verwenden', 'btn btn-pri btn-xs');
          useBtn.onclick = () => {
            mat.kontextR2key = key; mat.kontextPfad = null; saveMatDB();
            ktxKey.textContent = '📎 ' + name;
            ktxClearBtn.style.display = '';
            ktxTree.style.display = 'none'; ktxPickBtn.textContent = '📂 Aus R2 wählen';
          };
          row.appendChild(useBtn);
          wrap.appendChild(row); wrap.appendChild(thumbWrap);
          container.appendChild(wrap);
        });
      }
      renderKtxFolder('', ktxTree).catch(e => { ktxTree.innerHTML = '<span style="color:#dc2626;font-size:12px">⚠ ' + e.message + '</span>'; });
    };
    body.appendChild(ktxSection);
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

  // Aktionsleiste
  const delBar = mk('div', 'mat-detail-delbar');

  // Neu analysieren
  if (_matKey) {
    const reBtn = btn('🔄 Neu analysieren', 'btn btn-ghost btn-xs');
    reBtn.onclick = async () => {
      const antKey = localStorage.getItem('ant_key');
      if (!antKey) { alert('Kein Anthropic API-Key in den Einstellungen.'); return; }
      reBtn.disabled = true;

      async function pdfBufToDataURLs(buf) {
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        const urls = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          urls.push(await renderPdfPageDataURL(page));
        }
        await pdf.destroy();
        return urls;
      }

      function toImgContent(dataURL) {
        const [hdr, data] = dataURL.split(',');
        return { type: 'image', source: { type: 'base64', media_type: hdr.match(/data:([^;]+)/)[1], data } };
      }

      try {
        reBtn.textContent = '⏳ Lade Material…';
        const matURLs = await pdfBufToDataURLs(await r2Download(_matKey));

        const weitereURLs = [];
        for (const wKey of (mat.dateipfadeWeitere || [])) {
          reBtn.textContent = '⏳ Lade Datei 2…';
          const urls = await pdfBufToDataURLs(await r2Download(wKey));
          weitereURLs.push(...urls);
        }

        let ktxURLs = [];
        const _ktxKey = mat.kontextR2key || mat.kontextPfad;
        if (_ktxKey) {
          reBtn.textContent = '⏳ Lade Kontext…';
          ktxURLs = await pdfBufToDataURLs(await r2Download(_ktxKey));
        }

        reBtn.textContent = '⏳ KI analysiert…';
        const content = [];
        if (ktxURLs.length) { content.push({ type: 'text', text: '=== KONTEXT ===' }); ktxURLs.forEach(u => content.push(toImgContent(u))); }
        content.push({ type: 'text', text: '=== MATERIAL ===' });
        matURLs.forEach(u => content.push(toImgContent(u)));
        if (weitereURLs.length) { content.push({ type: 'text', text: '=== WEITERES MATERIAL ===' }); weitereURLs.forEach(u => content.push(toImgContent(u))); }
        const blockTitelRe = getBlockTitel(mat.blockId);
        content.push({ type: 'text', text: `Analysiere dieses Unterrichtsmaterial für eine NRW-Gymnasiallehrerin.
Bekannt: Fach=${(mat.fach||[]).join(',')}, Typ=${mat.materialtyp}, Dateiname=${mat.titel}${blockTitelRe ? ', Themenblock="'+blockTitelRe+'"' : ''}

WICHTIG – Titelregeln:
- "titel" = der tatsächliche Titel wie er auf dem Blatt gedruckt steht
- Ist kein Drucktitel erkennbar: erstelle einen beschreibenden Kurztitel aus Thema + Aufgabentyp (z.B. "Fotosynthese – Lückentext", "Aggregatzustände – Stationenarbeit")
- Vermeide kryptische Dateinamen als Titel; übernimm den Dateinamen nur wenn er erkennbar dem Drucktitel entspricht
- NIEMALS eine Rolle als Titel verwenden (nicht "Einführungsmaterial" o.ä.)
- "rolleImKontext" = 1 kurzer Satz zur pädagogischen Funktion
- "jahrgang" = erlaubte Werte: "5","6","7","8","9","10","EF","Q1","Q2" — ZUERST: steht auf dem Material eine explizite Klassen-/Jahrgangsangabe (z.B. "Klasse 9/10", "Jg. 7", "für die 8. Klasse")? Dann diese wörtlich übernehmen. NUR wenn keine explizite Angabe vorhanden: aus Aufgabenniveau und Thema schätzen. Bei "9/10" → ["9","10"], bei "7/8" → ["7","8"]. Wenn wirklich unklar: []
- "fach" = erlaubte Werte: "Bio", "Ch", "M" — anhand von Fachsprache, Formeln, Konzepten und Inhalten bestimmen. Das Fach ist fast immer eindeutig erkennbar (Zellen/Ökologie → "Bio", Reaktionsgleichungen/Atome → "Ch", Geometrie/Algebra/Funktionen → "M"). Immer einen Wert angeben, nie []
- "themen" = fachspezifische Kernthemen, die im MATERIAL-Teil behandelt werden — IGNORIERE den KONTEXT-Teil vollständig für die Themenbestimmung. Kritisches Beispiel: Wenn der Kontext ein Bio-Text über Korallenriffe ist und das Material eine Mathe-Aufgabe zum Beckenumfang, dann sind die Themen ["Umfang", "Rechteck"] — NICHT ["Ökologie", "Korallenriffe", "Biodiversität"]. Die Themen stammen immer aus dem MATERIAL, nie aus dem KONTEXT.
- "loesung", "loesungHinweis", "erlaeuterung" nur aus KONTEXT/Lehrerhinweisen übernehmen. Wenn keine Lösung erkennbar ist: "".
${materialAnalysisRulesBlock()}

Antworte NUR mit JSON (kein Text davor/danach):
{"fach":["Bio"],"titel":"exakter Titel vom Blatt","rolleImKontext":"1 Satz zur Funktion","beschreibung":"2-3 Sätze was SuS tun","themen":["Fotosynthese"],"jahrgang":["7"],"unterrichtsphase":["Erarbeitung"],"sozialformenGeeignet":["Einzelarbeit"],"methodenGeeignet":[],"schueleraktivitaeten":[],"artDerGeistigenTaetigkeit":[],"darstellungsformen":[],"voraussetzungenFachlich":[],"voraussetzungenMethodisch":[],"kognitiveBeanspruchung":"mittel","sprachlicheAnforderungen":"mittel","lautstaerke":"leise","differenzierungsformen":[],"loesung":"","loesungHinweis":"","erlaeuterung":""}` });

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': antKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 3000, messages: [{ role: 'user', content }] })
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error('API ' + res.status + ': ' + (err.error?.message || res.statusText)); }
        const d = await res.json();
        const match = (d.content?.[0]?.text || '').match(/\{[\s\S]*\}/);
        if (!match) throw new Error('Kein JSON in der KI-Antwort.');
        const enriched = JSON.parse(match[0]);
        const idx = MATDB.findIndex(m => m.id === mat.id);
        if (idx < 0) throw new Error('Materialeintrag nicht mehr gefunden.');
        const keep = (({ quelle, materialnummer, r2key, r2url, kontextR2key, dateipfad, dateipfadeWeitere, kontextPfad, seiten, importiertAm, id }) =>
          ({ quelle, materialnummer: materialnummer || null, r2key, r2url, kontextR2key, dateipfad, dateipfadeWeitere, kontextPfad, seiten, importiertAm, id }))(MATDB[idx]);
        // Materialnummer: KI-Wert übernehmen wenn noch nicht gesetzt
        if (!keep.materialnummer) delete keep.materialnummer;
        Object.assign(MATDB[idx], enriched, keep);
        saveMatDB(); renderCards();
        overlay.classList.remove('open'); body.remove();
        const fresh = MATDB.find(m => m.id === mat.id);
        if (fresh) {
          openMatOverlay(fresh, null, overlay, panel, panTitle, renderCards);
        } else {
          throw new Error('Materialeintrag nach der Analyse nicht gefunden.');
        }
      } catch(e2) {
        reBtn.textContent = '✗ Fehler';
        reBtn.disabled = false;
        alert('Fehler: ' + e2.message);
      }
    };
    delBar.appendChild(reBtn);
  }

  // ── Methoden-Check ────────────────────────────────────────────
  if (_matKey) {
    const mchkBtn = btn('🎯 Methoden-Check', 'btn btn-ghost btn-xs');
    let mchkPanel = null;
    mchkBtn.onclick = async () => {
      const antKey = localStorage.getItem('ant_key');
      if (!antKey) { alert('Kein Anthropic API-Key in den Einstellungen.'); return; }
      if (mchkPanel) { mchkPanel.remove(); mchkPanel = null; }
      mchkBtn.disabled = true; mchkBtn.textContent = '⏳ Lade PDF…';

      async function pdfPagesForMchk(r2key) {
        const buf = await r2Download(r2key);
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        const urls = [];
        for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) {
          const page = await pdf.getPage(i);
          const vp0 = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: 240 / vp0.width });
          const cv = document.createElement('canvas');
          cv.width = vp.width; cv.height = vp.height;
          await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
          urls.push(cv.toDataURL('image/jpeg', 0.75));
        }
        return urls;
      }
      function toImgC(dataURL) {
        const [hdr, data] = dataURL.split(',');
        return { type: 'image', source: { type: 'base64', media_type: hdr.match(/data:([^;]+)/)[1], data } };
      }
      function showMchkPanel(el) {
        mchkPanel = mk('div', '');
        mchkPanel.style.cssText = 'margin:8px 0;padding:10px 12px;background:var(--bg2);border:1px solid var(--bdr);border-radius:8px;font-size:12px;display:flex;flex-direction:column;gap:7px;';
        mchkPanel.appendChild(el);
        body.insertBefore(mchkPanel, delBar);
      }

      try {
        const matURLs = await pdfPagesForMchk(_matKey);

        // Call 1: Gibt es eine übertragbare Methode?
        const c1 = [{ type: 'text', text: '=== MATERIAL ===' }];
        matURLs.forEach(u => c1.push(toImgC(u)));
        c1.push({ type: 'text', text: `Analysiere dieses Unterrichtsmaterial für eine NRW-Lehrkraft.
Materialname: "${mat.titel || ''}"

Aufgabe: Erkenne die zentrale didaktische Methode oder das didaktische Konzept dieses Materials.

WICHTIG – was als Methode zählt:
- Benannte Unterrichtsmethoden: Think-Pair-Share, Fishbowl, Jigsaw, Placemat, Lerntempoduett …
- Didaktische Werkzeuge und Konzepte: Kompetenzraster, Portfolio, Lerntagebuch, Concept Map, Lerntheke, Advance Organizer, Growth Mindset …
- Der Materialname ist oft der stärkste Hinweis – wenn dort "Kompetenzraster" steht, ist das die Methode
- Nicht: einzelne Aufgabentypen wie "Lückentext", "Multiple Choice", oder visuelle Elemente wie "Skala"

Schritt 1: Prüfe zuerst den Materialnamen und die Überschriften – gibt es dort eine benannte Methode oder ein didaktisches Konzept?
Schritt 2: Falls nicht im Namen – gibt es im Inhalt eine explizit genannte oder klar erkennbare Methode?
Schritt 3: Falls gar nichts – gibt es eine übertragbare didaktische Idee? Sonst: {"method": null}

Fülle aus:
- name: exakter Methoden-/Konzeptname
- beschreibung: Was tun Schülerinnen und Schüler konkret? (2–3 Sätze)
- ziel: Didaktisches Ziel der Methode (1–2 Sätze)
- hinweise: Durchführungshinweise, Varianten (2–3 Sätze)

Antworte NUR mit JSON (kein Text davor/danach):
{"method": {"name": "...", "beschreibung": "...", "ziel": "...", "hinweise": "..."}} ODER {"method": null}` });

        mchkBtn.textContent = '⏳ KI analysiert…';
        const r1 = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': antKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, messages: [{ role: 'user', content: c1 }] })
        });
        if (!r1.ok) throw new Error('API ' + r1.status);
        const d1 = await r1.json();
        const j1 = (d1.content?.[0]?.text || '').match(/\{[\s\S]*\}/);
        if (!j1) throw new Error('Kein JSON in Antwort');
        const { method } = JSON.parse(j1[0]);

        if (!method) {
          const noM = tx('div', '', 'Kein übertragbares Methodenpotenzial erkannt.');
          noM.style.color = 'var(--tx3)';
          showMchkPanel(noM);
          mchkBtn.textContent = '🎯 Methoden-Check'; mchkBtn.disabled = false;
          return;
        }

        // Call 2: Duplikatcheck gegen METHDB
        mchkBtn.textContent = '⏳ Vergleiche Methoden…';
        const methList = METHDB.map(m => `ID: ${m.id} | ${m.name}${m.beschreibung ? ' – ' + m.beschreibung.slice(0, 80) : ''}`).join('\n');
        const p2 = `Vorgeschlagene neue Methode:\nName: "${method.name}"\nBeschreibung: "${method.beschreibung}"\n\nBereits vorhandene Methoden (${METHDB.length}):\n${methList}\n\nGibt es einen semantisch ähnlichen Eintrag? Antworte NUR mit JSON:\n{"matchId": "exakte-ID-oder-null", "matchName": "Name-oder-null"}`;
        const r2 = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': antKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 120, messages: [{ role: 'user', content: p2 }] })
        });
        if (!r2.ok) throw new Error('API ' + r2.status);
        const d2 = await r2.json();
        const j2 = (d2.content?.[0]?.text || '').match(/\{[\s\S]*\}/);
        const { matchId, matchName } = j2 ? JSON.parse(j2[0]) : { matchId: null, matchName: null };
        const matchEntry = matchId && METHDB.find(x => x.id === matchId);

        // Ergebnis-UI aufbauen
        const resWrap = mk('div', '');
        resWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
        const mName = tx('div', '', '🎯 ' + method.name); mName.style.fontWeight = '600';
        resWrap.appendChild(mName);
        resWrap.appendChild(tx('div', '', method.beschreibung));
        const btnsRow = mk('div', ''); btnsRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:2px;';

        if (matchEntry) {
          const hint = tx('div', '', `Ähnlich zu vorhandener Methode: „${matchName || matchEntry.name}"`);
          hint.style.cssText = 'font-size:11px;color:var(--tx3);';
          resWrap.appendChild(hint);

          const lBtn = btn('🔗 Verknüpfen', 'btn btn-pri btn-xs');
          lBtn.onclick = () => {
            if (!mat.methodenIds) mat.methodenIds = [];
            if (!mat.methodenIds.includes(matchId)) { mat.methodenIds.push(matchId); saveMatDB(); }
            renderMethLinks(); mchkPanel.remove(); mchkPanel = null;
          };
          btnsRow.appendChild(lBtn);

          const nBtn2 = btn('+ Trotzdem neu anlegen', 'btn btn-ghost btn-xs');
          nBtn2.onclick = () => {
            mchkPanel.remove(); mchkPanel = null;
            S.view = 'methoden'; S._pendingNewMethod = { name: method.name, beschreibung: method.beschreibung, ziel: method.ziel || '', hinweise: method.hinweise || '', linkMatId: mat.id };
            render();
          };
          btnsRow.appendChild(nBtn2);
        } else {
          const nBtn = btn('✨ Als neue Methode anlegen', 'btn btn-pri btn-xs');
          nBtn.onclick = () => {
            mchkPanel.remove(); mchkPanel = null;
            S.view = 'methoden'; S._pendingNewMethod = { name: method.name, beschreibung: method.beschreibung, ziel: method.ziel || '', hinweise: method.hinweise || '', linkMatId: mat.id };
            render();
          };
          btnsRow.appendChild(nBtn);
        }

        const ignBtn = btn('Ignorieren', 'btn btn-ghost btn-xs');
        ignBtn.onclick = () => { mchkPanel.remove(); mchkPanel = null; };
        btnsRow.appendChild(ignBtn);
        resWrap.appendChild(btnsRow);
        showMchkPanel(resWrap);

      } catch (e) {
        const errD = tx('div', '', '⚠ Fehler: ' + e.message);
        errD.style.color = 'var(--red)';
        showMchkPanel(errD);
      }
      mchkBtn.textContent = '🎯 Methoden-Check'; mchkBtn.disabled = false;
    };
    delBar.appendChild(mchkBtn);
  }

  const delBtn2 = btn('🗑 Eintrag löschen', 'btn btn-danger btn-xs');
  delBtn2.onclick = () => {
    if (!confirm('„' + mat.titel + '" aus der Datenbank löschen?\nDie zugehörigen Dateien in der Cloud werden ebenfalls gelöscht.')) return;

    // R2-Schlüssel sammeln
    const keysToDelete = [];
    const matR2 = mat.r2key || mat.dateipfad;
    if (matR2) keysToDelete.push(matR2);
    (mat.dateipfadeWeitere || []).forEach(k => { if (k) keysToDelete.push(k); });
    // Kontext nur löschen wenn kein anderer Eintrag dieselbe Datei nutzt
    const ctxKey = mat.kontextR2key || mat.kontextPfad;
    if (ctxKey) {
      const shared = MATDB.some(m => m.id !== mat.id && (m.kontextR2key === ctxKey || m.kontextPfad === ctxKey));
      if (!shared) keysToDelete.push(ctxKey);
    }

    MATDB = MATDB.filter(m => m.id !== mat.id);
    saveMatDB(); overlay.classList.remove('open'); body.remove(); renderCards();

    // R2-Dateien im Hintergrund löschen
    keysToDelete.forEach(k => r2Delete(k).catch(e => console.warn('R2-Löschen fehlgeschlagen:', k, e)));
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
  const blockTitelKlp = getBlockTitel(mat.blockId);
  const prompt = `Du bist Assistent für NRW-Lehrkräfte. Analysiere das Unterrichtsmaterial und wähle passende KLP-Kompetenzen.\n\nMaterial:\n- Titel: ${mat.titel || '–'}\n- Fach: ${(mat.fach || []).join(', ') || '–'}\n- Jahrgang: ${(mat.jahrgang || []).join(', ') || '–'}\n- Themen: ${(mat.themen || []).join(', ') || '–'}\n- Beschreibung: ${mat.beschreibung || '–'}${blockTitelKlp ? '\n- Themenblock: ' + blockTitelKlp : ''}\n\nWähle 2–6 passende KLP-Einträge. Antworte NUR mit JSON-Array der IDs: ["ID1","ID2"]\n\nKLP-Einträge:\n${klpText}`;
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
