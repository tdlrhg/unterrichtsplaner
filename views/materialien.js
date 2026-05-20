// ── Materialien-Datenbank ─────────────────────────────────────────
let _kontextFiles  = [];
let _uploadPdfFile = null;
let _uploadPdfDoc  = null;

function buildUploadPanel() {
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }

  const p = mk('div', 'mat-upload-panel');
  const pageDataURLs = [];

  // Header
  const pHdr = mk('div', 'mat-upload-hdr');
  const titleSpan = tx('span', 'mat-upload-title', '📄 PDF hochladen');
  pHdr.appendChild(titleSpan);
  const closeP = btn('✕', 'btn btn-ghost btn-xs');
  closeP.onclick = () => p.remove();
  pHdr.appendChild(closeP);
  p.appendChild(pHdr);

  // Path builder
  const pathRow = mk('div', 'mat-upload-path-row');
  const fachOpts = ['Bio SI','Bio SII','Chemie SI','Chemie SII','Mathe'];
  const fachSel2 = document.createElement('select'); fachSel2.className = 'finp mat-upload-sel';
  fachOpts.forEach(f => { const o = document.createElement('option'); o.value = f; o.textContent = f; fachSel2.appendChild(o); });
  const unterInp2 = document.createElement('input'); unterInp2.type = 'text'; unterInp2.className = 'finp mat-upload-sub';
  unterInp2.placeholder = 'Unterordner (z.B. 7-8 oder SII)';
  const themaInp2 = document.createElement('input'); themaInp2.type = 'text'; themaInp2.className = 'finp mat-upload-sub';
  themaInp2.placeholder = 'Thema (z.B. Elektrochemie)';
  pathRow.appendChild(fachSel2);
  pathRow.appendChild(tx('span', 'mat-upload-sep', '/'));
  pathRow.appendChild(unterInp2);
  pathRow.appendChild(tx('span', 'mat-upload-sep', '/'));
  pathRow.appendChild(themaInp2);
  p.appendChild(pathRow);

  const pathPrev = tx('div', 'mat-upload-path-prev', '');
  p.appendChild(pathPrev);

  // Quelle-Feld
  const quelleRow = mk('div', 'mat-upload-path-row');
  quelleRow.appendChild(tx('span', 'mat-upload-sep', 'Quelle:'));
  const quelleInp = document.createElement('input'); quelleInp.type = 'text'; quelleInp.className = 'finp mat-upload-sub';
  quelleInp.placeholder = 'z.B. Rabe, Klett, Eigene, Schroedel…';
  quelleRow.appendChild(quelleInp);
  p.appendChild(quelleRow);

  let currentFn = '';
  function updatePath() {
    const parts = [fachSel2.value, unterInp2.value.trim(), themaInp2.value.trim()].filter(Boolean);
    pathPrev.textContent = '→ ' + parts.join('/') + '/' + (currentFn || '{dateiname}.pdf');
  }
  fachSel2.onchange = updatePath; unterInp2.oninput = updatePath; themaInp2.oninput = updatePath;
  updatePath();

  let uploadMode = 'pdf'; // 'pdf' | 'images'
  const imageSources = []; // originale Image-Files, parallel zu pageDataURLs

  // Drop zone
  const zone2 = mk('div', 'mat-upload-drop');
  zone2.textContent = '📄 PDF oder 🖼 PNG/JPG hierher ziehen oder klicken';
  const pdfInp = document.createElement('input'); pdfInp.type = 'file';
  pdfInp.accept = 'application/pdf,image/png,image/jpeg,image/jpg';
  pdfInp.multiple = true; pdfInp.style.display = 'none';
  zone2.onclick = () => pdfInp.click();
  zone2.ondragover = e => { e.preventDefault(); zone2.classList.add('drag-over'); };
  zone2.ondragleave = () => zone2.classList.remove('drag-over');
  zone2.ondrop = e => {
    e.preventDefault(); zone2.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    if (files[0].type === 'application/pdf') handlePdf(files[0]);
    else handleImages(files);
  };
  pdfInp.onchange = () => {
    const files = Array.from(pdfInp.files);
    if (!files.length) return;
    if (files[0].type === 'application/pdf') handlePdf(files[0]);
    else handleImages(files);
  };
  p.appendChild(zone2); p.appendChild(pdfInp);

  // Thumbnails
  const thumbsWrap = mk('div', 'mat-upload-thumbs');
  p.appendChild(thumbsWrap);

  // Action row (shown after file loaded)
  const acts = mk('div', 'mat-upload-actions');
  acts.style.display = 'none';
  const weiterBtn2 = btn('Weiter: Seiten aufteilen →', 'btn btn-pri btn-sm');
  weiterBtn2.disabled = true;
  acts.appendChild(weiterBtn2);
  p.appendChild(acts);

  // ── Split-Modus ──────────────────────────────────────────────
  const SEGMENT_TYPES = [
    { key: 'material', label: '📚 Schülermaterial', color: '#eff6ff' },
    { key: 'kontext',  label: '🔍 Kontext',         color: '#f3f4f6' },
    { key: 'lh',       label: '📋 Lehrerhandreichung', color: '#fdf2f8' },
    { key: 'skip',     label: '⏭ Überspringen',    color: '#f9fafb' },
  ];
  const SPLIT_COLORS = ['#eff6ff','#f3f0ff','#f0fdf4','#fffbeb','#fdf2f8','#ecfdf5'];

  function showSplitMode() {
    titleSpan.textContent = '✂ Seiten aufteilen';
    zone2.style.display = 'none';
    thumbsWrap.innerHTML = '';
    thumbsWrap.style.maxHeight = '560px';
    acts.innerHTML = '';

    const splitPoints = new Set(); // Seitennummern nach denen getrennt wird
    const segTypes    = {};        // groupIndex → type key (default: 'material')

    thumbsWrap.appendChild(tx('div', 'mat-split-hint', 'Klicke auf + zwischen Seiten um aufzuteilen. Typ pro Abschnitt optional ändern.'));

    const container = mk('div', 'mat-split-container');
    thumbsWrap.appendChild(container);

    function getGroups() {
      const groups = [];
      let start = 1;
      const sorted = [...splitPoints].sort((a, b) => a - b);
      for (const sp of sorted) { groups.push({ start, end: sp }); start = sp + 1; }
      groups.push({ start, end: pageDataURLs.length });
      return groups;
    }

    function renderGroups() {
      container.innerHTML = '';
      const groups = getGroups();

      groups.forEach((g, gi) => {
        const typ = segTypes[gi] || 'material';
        const typDef = SEGMENT_TYPES.find(t => t.key === typ) || SEGMENT_TYPES[0];
        const color = SPLIT_COLORS[gi % SPLIT_COLORS.length];

        const groupEl = mk('div', 'mat-split-group');
        groupEl.style.borderColor = color;

        // Typ-Leiste
        const typRow = mk('div', 'mat-split-typ-row');
        SEGMENT_TYPES.forEach(t => {
          const b = btn(t.label, 'btn btn-xs ' + (t.key === typ ? 'btn-pri' : 'btn-ghost'));
          b.onclick = () => { segTypes[gi] = t.key; renderGroups(); updateInfo(); };
          typRow.appendChild(b);
        });
        const pageRange = tx('span', 'mat-split-range', 'S. ' + g.start + (g.end > g.start ? '–' + g.end : ''));
        typRow.appendChild(pageRange);
        groupEl.appendChild(typRow);

        // Seiten
        const pagesRow = mk('div', 'mat-split-pages-row');
        for (let i = g.start; i <= g.end; i++) {
          const img = document.createElement('img');
          img.src = pageDataURLs[i - 1]; img.className = 'mat-split-thumb';
          const wrap = mk('div', 'mat-split-thumb-wrap');
          wrap.style.opacity = typ === 'skip' ? '0.35' : '1';
          wrap.appendChild(img);
          wrap.appendChild(tx('div', 'mat-upload-thumb-nr', 'S. ' + i));
          pagesRow.appendChild(wrap);

          // Trennzone nach jeder Seite (außer letzter Seite insgesamt)
          if (i < pageDataURLs.length) {
            const divEl = mk('div', 'mat-split-divider');
            divEl.dataset.page = String(i);
            const icon = tx('span', 'mat-split-div-icon', splitPoints.has(i) ? '✂' : '+');
            if (splitPoints.has(i)) divEl.classList.add('active');
            divEl.appendChild(icon);
            divEl.title = splitPoints.has(i) ? 'Trennung entfernen' : 'Hier aufteilen';
            divEl.onclick = () => {
              const pg = parseInt(divEl.dataset.page);
              if (splitPoints.has(pg)) splitPoints.delete(pg);
              else splitPoints.add(pg);
              renderGroups(); updateInfo();
            };
            pagesRow.appendChild(divEl);
          }
        }
        groupEl.appendChild(pagesRow);
        container.appendChild(groupEl);
      });
    }

    renderGroups();

    acts.style.display = 'flex';
    const upBtn = btn('📤 Aufteilen & Hochladen', 'btn btn-pri btn-sm');
    const splitInfo = tx('span', 'mat-split-info', '');
    function updateInfo() {
      const groups = getGroups();
      const matCount = groups.filter((_, gi) => (segTypes[gi] || 'material') === 'material').length;
      splitInfo.textContent = matCount + ' Material' + (matCount !== 1 ? 'ien' : '') + (groups.length > matCount ? ', ' + (groups.length - matCount) + ' weitere Abschnitte' : '');
    }
    updateInfo();
    let uploadedEntries = []; // { entry, matPageURLs }
    let kontextPageURLs = []; // Seiten-Bilder der Kontext-Abschnitte

    upBtn.onclick = async () => {
      if (typeof PDFLib === 'undefined') { alert('pdf-lib nicht geladen – bitte Seite neu laden.'); return; }
      const groups = getGroups();
      const parts = [fachSel2.value, unterInp2.value.trim(), themaInp2.value.trim()].filter(Boolean);
      const folder = parts.join('/');

      upBtn.disabled = true;
      splitInfo.textContent = 'Lade hoch…';
      uploadedEntries = []; kontextPageURLs = [];

      // Hilfsfunktion: Segment → PDF-Blob
      async function segmentToBlob(g, srcDoc) {
        const newDoc = await PDFLib.PDFDocument.create();
        if (uploadMode === 'images') {
          for (let pg = g.start - 1; pg < g.end; pg++) {
            const file = imageSources[pg];
            const buf = await file.arrayBuffer();
            const isPng = (file.type || '').includes('png') || file.name.toLowerCase().endsWith('.png');
            const emb = isPng ? await newDoc.embedPng(buf) : await newDoc.embedJpg(buf);
            const page = newDoc.addPage([emb.width, emb.height]);
            page.drawImage(emb, { x: 0, y: 0, width: emb.width, height: emb.height });
          }
        } else {
          const idxs = [];
          for (let pg = g.start - 1; pg < g.end; pg++) idxs.push(pg);
          const copied = await newDoc.copyPages(srcDoc, idxs);
          copied.forEach(pg => newDoc.addPage(pg));
        }
        return new Blob([await newDoc.save()], { type: 'application/pdf' });
      }

      try {
        const srcDoc = uploadMode === 'pdf' ? await PDFLib.PDFDocument.load(await _uploadPdfFile.arrayBuffer()) : null;
        const baseName = currentFn.replace(/\.pdf$/i, '');

        let matIndex = 1;
        const results = [];
        let kontextR2key = null;

        // Erst Kontext hochladen
        for (let gi = 0; gi < groups.length; gi++) {
          const g   = groups[gi];
          const typ = segTypes[gi] || 'material';
          if (typ !== 'kontext') continue;

          const blob = await segmentToBlob(g, srcDoc);
          const key = folder + '/' + baseName + '_Kontext.pdf';
          splitInfo.textContent = 'Lade hoch: Kontext…';
          await r2Upload(key, blob, 'application/pdf');
          kontextR2key = key;
          for (let pg = g.start; pg <= g.end; pg++) kontextPageURLs.push(pageDataURLs[pg - 1]);
        }

        // Dann Materialien & LH hochladen
        for (let gi = 0; gi < groups.length; gi++) {
          const g   = groups[gi];
          const typ = segTypes[gi] || 'material';
          if (typ === 'skip' || typ === 'kontext') continue;

          const blob = await segmentToBlob(g, srcDoc);

          const suffix = typ === 'lh' ? 'LH' : 'M' + matIndex;
          const key = folder + '/' + baseName + '_' + suffix + '.pdf';

          splitInfo.textContent = 'Lade hoch: ' + suffix + '…';
          const url = await r2Upload(key, blob, 'application/pdf');

          const now = new Date().toISOString();
          const entry = {
            id: 'mat_' + Date.now() + '_' + gi,
            titel: baseName + ' – ' + suffix,
            materialnummer: suffix,
            materialtyp: typ === 'lh' ? 'Lehrerhandreichung' : 'Arbeitsblatt',
            fach: [fachSel2.value.replace(/ S(I{1,2}|i{1,2})$/, '').trim()],
            jahrgang: [],
            themen: themaInp2.value.trim() ? [themaInp2.value.trim()] : [],
            quelle: quelleInp.value.trim() || null,
            r2url: url, r2key: key,
            kontextR2key: kontextR2key || null,
            seiten: g.end - g.start + 1,
            importiertAm: now,
          };
          const matPageURLs = pageDataURLs.slice(g.start - 1, g.end);
          // Vorhandenen Eintrag mit gleichem R2-Key überschreiben
          const existingIdx = MATDB.findIndex(m => m.r2key === key);
          if (existingIdx >= 0) { entry.id = MATDB[existingIdx].id; MATDB[existingIdx] = entry; }
          else MATDB.unshift(entry);
          uploadedEntries.push({ entry, matPageURLs });
          results.push({ suffix, url });
          if (typ === 'material') matIndex++;
        }

        saveMatDB();
        splitInfo.textContent = '✓ ' + results.length + ' Datei' + (results.length !== 1 ? 'en' : '') + ' hochgeladen';
        splitInfo.style.color = 'var(--grn)';
        upBtn.textContent = '✓ Hochgeladen';

        // KI-Analyse Button einblenden
        const aiBtn = btn('✨ KI analysiert alle', 'btn btn-pri btn-sm');
        const aiStatus = tx('span', 'mat-split-info', '');
        aiBtn.onclick = async () => {
          const antKey = localStorage.getItem('ant_key');
          if (!antKey) { alert('Kein Anthropic API-Key in den Einstellungen.'); return; }
          aiBtn.disabled = true;

          function toImgContent(dataURL) {
            const [header, data] = dataURL.split(',');
            const mediaType = header.match(/data:([^;]+)/)[1];
            return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
          }

          for (let ei = 0; ei < uploadedEntries.length; ei++) {
            const { entry, matPageURLs } = uploadedEntries[ei];
            aiStatus.textContent = (ei + 1) + '/' + uploadedEntries.length + ' analysiere…';

            const content = [];
            if (kontextPageURLs.length) {
              content.push({ type: 'text', text: '=== KONTEXT ===' });
              kontextPageURLs.forEach(u => content.push(toImgContent(u)));
            }
            content.push({ type: 'text', text: '=== MATERIAL ===' });
            matPageURLs.forEach(u => content.push(toImgContent(u)));
            content.push({ type: 'text', text: `Analysiere dieses Unterrichtsmaterial für eine NRW-Gymnasiallehrerin.
Bekannt: Fach=${entry.fach?.join(',')}, Typ=${entry.materialtyp}, Dateiname=${entry.titel}

WICHTIG – Titelregeln:
- "titel" = der tatsächliche Titel wie er auf dem Blatt gedruckt steht (z.B. "Wie entsteht Regen?", "M1: Zellatmung", "Station 3 – Fotosynthese")
- Ist kein Titel aufgedruckt, übernimm den Dateinamen: "${entry.titel}"
- NIEMALS eine Rolle als Titel verwenden (also NICHT "Einführungsmaterial", "Vertiefungsaufgabe", "Erarbeitungsphase" o.ä.)
- "rolleImKontext" = 1 kurzer Satz zur pädagogischen Funktion (z.B. "Einstieg in die Fotosynthese als Einzelarbeit")

Antworte NUR mit JSON (kein Text davor/danach):
{"titel":"exakter Titel vom Blatt oder Dateiname","materialnummer":"M1","rolleImKontext":"1 Satz zur Funktion","beschreibung":"2-3 Sätze was SuS tun","themen":["..."],"jahrgang":["SII"],"unterrichtsphase":["Erarbeitung"],"sozialformenGeeignet":["Einzelarbeit"],"methodenGeeignet":[],"schueleraktivitaeten":[],"artDerGeistigenTaetigkeit":[],"darstellungsformen":[],"voraussetzungenFachlich":[],"voraussetzungenMethodisch":[],"kognitiveBeanspruchung":"mittel","sprachlicheAnforderungen":"mittel","lautstaerke":"leise","differenzierungsformen":[],"loesung":"","loesungHinweis":"","erlaeuterung":""}` });

            try {
              const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'x-api-key': antKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
                body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content }] })
              });
              if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error('API ' + res.status + ': ' + (err.error?.message || res.statusText)); }
              const d = await res.json();
              const text = d.content?.[0]?.text || '{}';
              const match = text.match(/\{[\s\S]*\}/);
              if (match) {
                const enriched = JSON.parse(match[0]);
                const idx = MATDB.findIndex(m => m.id === entry.id);
                if (idx >= 0) {
                  const { quelle, materialnummer, r2key, r2url, kontextR2key, seiten, importiertAm, id } = MATDB[idx];
                  Object.assign(MATDB[idx], enriched);
                  // materialnummer: vorhandenen Wert bewahren, sonst KI-Wert behalten
                  const keepFields = { quelle, r2key, r2url, kontextR2key, seiten, importiertAm, id };
                  if (materialnummer) keepFields.materialnummer = materialnummer;
                  Object.assign(MATDB[idx], keepFields);
                }
              }
            } catch(e2) { console.error('Analyse fehlgeschlagen:', entry.id, e2); }
          }
          saveMatDB();
          aiStatus.textContent = '✓ Analyse abgeschlossen';
          aiBtn.textContent = '✓ Fertig – Schließen';
          aiBtn.disabled = false;
          aiBtn.onclick = () => { p.remove(); S.view = 'materialien'; render(); };
        };
        acts.appendChild(aiBtn);
        acts.appendChild(aiStatus);

      } catch(e) {
        splitInfo.textContent = '✗ ' + e.message;
        splitInfo.style.color = '#dc2626';
        upBtn.disabled = false;
      }
    };
    acts.appendChild(upBtn);
    acts.appendChild(splitInfo);
  }

  weiterBtn2.onclick = () => showSplitMode();

  async function handleImages(files) {
    uploadMode = 'images';
    _uploadPdfFile = null;
    imageSources.length = 0;
    pageDataURLs.length = 0;
    thumbsWrap.innerHTML = '';
    currentFn = files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : 'Scan';
    zone2.textContent = '✓ ' + files.length + ' Bild' + (files.length !== 1 ? 'er' : '') + ' geladen';
    zone2.style.cursor = 'default';
    updatePath();
    const spin = tx('div', 'mat-upload-spin', '⏳ Lade Vorschau…');
    thumbsWrap.appendChild(spin);
    for (const file of files) {
      const dataURL = await new Promise((res, rej) => {
        const reader = new FileReader(); reader.onload = e => res(e.target.result); reader.onerror = rej; reader.readAsDataURL(file);
      });
      imageSources.push(file);
      pageDataURLs.push(dataURL);
    }
    thumbsWrap.innerHTML = '';
    pageDataURLs.forEach((url, i) => {
      const thumb = mk('div', 'mat-upload-thumb');
      const img = document.createElement('img');
      img.src = url; img.className = 'mat-split-thumb';
      thumb.appendChild(img);
      thumb.appendChild(tx('div', 'mat-upload-thumb-nr', (i + 1) + ''));
      thumbsWrap.appendChild(thumb);
    });
    acts.style.display = 'flex';
    weiterBtn2.disabled = false;
  }

  async function handlePdf(file) {
    uploadMode = 'pdf';
    _uploadPdfFile = file;
    currentFn = file.name;
    zone2.textContent = '✓ ' + file.name + ' (' + Math.round(file.size / 1024) + ' KB)';
    zone2.style.cursor = 'default';
    updatePath();
    thumbsWrap.innerHTML = '';
    pageDataURLs.length = 0;
    const spin = tx('div', 'mat-upload-spin', '⏳ Lade Vorschau…');
    thumbsWrap.appendChild(spin);
    try {
      if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js nicht geladen.');
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      _uploadPdfDoc = pdf;
      thumbsWrap.innerHTML = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp0 = page.getViewport({ scale: 1 });
        const scale = 280 / vp0.width;
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        pageDataURLs.push(canvas.toDataURL());
        const thumb = mk('div', 'mat-upload-thumb');
        thumb.appendChild(canvas);
        thumb.appendChild(tx('div', 'mat-upload-thumb-nr', 'S. ' + i));
        thumbsWrap.appendChild(thumb);
      }
      acts.style.display = 'flex';
      weiterBtn2.disabled = false;
    } catch(e) {
      thumbsWrap.innerHTML = '';
      const err = tx('div', '', '⚠ ' + e.message);
      err.style.cssText = 'padding:12px;color:#dc2626;font-size:13px;';
      thumbsWrap.appendChild(err);
    }
  }

  return p;
}

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

function buildR2Browser(subTitle, renderCards) {
  const p = mk('div', 'mat-r2browser');

  const hdr = mk('div', 'mat-upload-hdr');
  hdr.appendChild(tx('span', 'mat-upload-title', '📂 R2-Dateien importieren'));
  const closeP = btn('✕', 'btn btn-ghost btn-xs'); closeP.onclick = () => p.remove();
  hdr.appendChild(closeP);
  p.appendChild(hdr);

  const status = tx('div', 'mat-r2-status', '⏳ Lade R2-Inhalte…');
  p.appendChild(status);

  const tree = mk('div', 'mat-r2-tree');
  p.appendChild(tree);

  async function renderFolder(prefix, container) {
    container.innerHTML = '<span style="color:var(--tx3);font-size:12px">⏳ Lade…</span>';
    try {
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
          if (!loaded && !open) { loaded = true; renderFolder(f, sub); }
        };
        row.appendChild(toggle); row.appendChild(sub);
        container.appendChild(row);
      });

      files.forEach(({ key, size }) => {
        const name = key.slice(prefix.length);
        if (!name || (!name.endsWith('.pdf') && !name.endsWith('.png') && !name.endsWith('.jpg'))) return;
        const inDB = MATDB.some(m => m.r2key === key);
        const row = mk('div', 'mat-r2-file' + (inDB ? ' mat-r2-file-exists' : ''));
        const nameEl = tx('span', 'mat-r2-filename', (inDB ? '✓ ' : '') + name);
        row.appendChild(nameEl);
        row.appendChild(tx('span', 'mat-r2-size', Math.round(size / 1024) + ' KB'));
        if (!inDB) {
          const impBtn = btn('Importieren', 'btn btn-pri btn-xs');
          impBtn.onclick = async () => {
            impBtn.disabled = true; impBtn.textContent = '⏳';
            const pub = (localStorage.getItem('r2_public_url') || '').replace(/\/$/, '');
            const endpoint = (localStorage.getItem('r2_endpoint') || '').replace(/\/$/, '');
            const bucket = localStorage.getItem('r2_bucket') || '';
            const r2url = pub ? `${pub}/${key}` : `${endpoint}/${bucket}/${key}`;
            const baseName = name.replace(/\.[^.]+$/, '');
            const entry = {
              id: 'mat_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
              titel: baseName,
              r2key: key, r2url,
              importiertAm: new Date().toISOString(),
            };
            MATDB.unshift(entry);
            saveMatDB(); renderCards();
            subTitle.textContent = MATDB.length + ' Einträge';
            row.classList.add('mat-r2-file-exists');
            nameEl.textContent = '✓ ' + name;
            impBtn.remove();
          };
          row.appendChild(impBtn);
        }
        container.appendChild(row);
      });

      if (!folders.length && !files.length) {
        container.appendChild(tx('span', '', 'Leer'));
        container.style.cssText = 'color:var(--tx3);font-size:12px;padding:4px 0;';
      }
    } catch(e) {
      container.innerHTML = '<span style="color:#dc2626;font-size:12px">⚠ ' + e.message + '</span>';
    }
  }

  renderFolder('', tree).then(() => { status.remove(); }).catch(() => {});

  return p;
}

// ── Kontext-Split: Zeitschrift in Artikel aufteilen ────────────
function buildKontextSplitPanel() {
  const p = mk('div', 'mat-upload-panel');
  const pHdr = mk('div', 'mat-upload-hdr');
  pHdr.appendChild(tx('span', 'mat-upload-title', '📋 Kontext-Split'));
  const closeP = btn('✕', 'btn btn-ghost btn-xs'); closeP.onclick = () => p.remove();
  pHdr.appendChild(closeP); p.appendChild(pHdr);

  const pageDataURLs = [];
  let pdfFile = null, pdfDoc = null;

  const zone = mk('div', 'mat-upload-drop');
  zone.textContent = '📄 Zeitschrift-PDF hierher ziehen oder klicken';
  const pdfInp = document.createElement('input'); pdfInp.type = 'file'; pdfInp.accept = 'application/pdf'; pdfInp.style.display = 'none';
  zone.onclick = () => pdfInp.click();
  zone.ondragover = e => { e.preventDefault(); zone.classList.add('drag-over'); };
  zone.ondragleave = () => zone.classList.remove('drag-over');
  zone.ondrop = e => { e.preventDefault(); zone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleKtxPdf(e.dataTransfer.files[0]); };
  pdfInp.onchange = () => { if (pdfInp.files[0]) handleKtxPdf(pdfInp.files[0]); };
  p.appendChild(zone); p.appendChild(pdfInp);

  const thumbsWrap = mk('div', 'mat-upload-thumbs'); p.appendChild(thumbsWrap);
  const acts = mk('div', 'mat-upload-acts'); acts.style.display = 'none'; p.appendChild(acts);
  const weiterBtn = btn('✂ Aufteilen', 'btn btn-pri btn-sm'); weiterBtn.disabled = true;
  acts.appendChild(weiterBtn);

  async function handleKtxPdf(file) {
    pdfFile = file; pageDataURLs.length = 0;
    zone.textContent = '✓ ' + file.name; thumbsWrap.innerHTML = '';
    thumbsWrap.appendChild(tx('div', 'mat-upload-spin', '⏳ Lade…'));
    try {
      const buf = await file.arrayBuffer();
      pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
      thumbsWrap.innerHTML = '';
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const vp0 = page.getViewport({ scale: 1 });
        const cv = document.createElement('canvas');
        const vp = page.getViewport({ scale: 280 / vp0.width });
        cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        pageDataURLs.push(cv.toDataURL());
        const thumb = mk('div', 'mat-upload-thumb');
        thumb.appendChild(cv); thumb.appendChild(tx('div', 'mat-upload-thumb-nr', 'S. ' + i));
        thumbsWrap.appendChild(thumb);
      }
      acts.style.display = 'flex'; weiterBtn.disabled = false;
    } catch(e) {
      thumbsWrap.innerHTML = '';
      const err = tx('div', '', '⚠ ' + e.message); err.style.cssText = 'padding:12px;color:#dc2626;';
      thumbsWrap.appendChild(err);
    }
  }

  weiterBtn.onclick = () => {
    thumbsWrap.innerHTML = ''; acts.innerHTML = ''; acts.style.display = 'flex';
    const splitPoints = new Set(); const segNames = {};
    const SPLIT_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6'];

    function getGroups() {
      const groups = []; let start = 1;
      for (const pt of [...splitPoints].sort((a,b) => a-b)) { groups.push({ start, end: pt }); start = pt + 1; }
      groups.push({ start, end: pageDataURLs.length }); return groups;
    }

    const container = mk('div', 'mat-split-container'); thumbsWrap.appendChild(container);

    function renderGroups() {
      container.innerHTML = '';
      getGroups().forEach((g, gi) => {
        const groupEl = mk('div', 'mat-split-group'); groupEl.style.borderColor = SPLIT_COLORS[gi % SPLIT_COLORS.length];
        const nameRow = mk('div', ''); nameRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px;';
        const nameInp = document.createElement('input'); nameInp.type = 'text'; nameInp.className = 'finp'; nameInp.style.flex = '1';
        nameInp.placeholder = 'Name des Artikels'; nameInp.value = segNames[gi] !== undefined ? segNames[gi] : ('Artikel ' + (gi + 1));
        nameInp.oninput = () => { segNames[gi] = nameInp.value; };
        nameRow.appendChild(nameInp); nameRow.appendChild(tx('span', 'mat-split-range', 'S. ' + g.start + (g.end > g.start ? '–' + g.end : '')));
        groupEl.appendChild(nameRow);
        const pagesRow = mk('div', 'mat-split-pages-row');
        for (let i = g.start; i <= g.end; i++) {
          const img = document.createElement('img'); img.src = pageDataURLs[i - 1]; img.className = 'mat-split-thumb';
          const wrap = mk('div', 'mat-split-thumb-wrap');
          wrap.appendChild(img); wrap.appendChild(tx('div', 'mat-upload-thumb-nr', 'S. ' + i)); pagesRow.appendChild(wrap);
          if (i < pageDataURLs.length) {
            const divEl = mk('div', 'mat-split-divider'); divEl.dataset.page = String(i);
            const icon = tx('span', 'mat-split-div-icon', splitPoints.has(i) ? '✂' : '+');
            if (splitPoints.has(i)) divEl.classList.add('active'); divEl.appendChild(icon);
            divEl.onclick = () => { const pg = parseInt(divEl.dataset.page); if (splitPoints.has(pg)) splitPoints.delete(pg); else splitPoints.add(pg); renderGroups(); };
            pagesRow.appendChild(divEl);
          }
        }
        groupEl.appendChild(pagesRow); container.appendChild(groupEl);
      });
    }
    renderGroups();

    const upBtn = btn('📤 Hochladen', 'btn btn-pri btn-sm');
    const splitInfo = tx('span', 'mat-split-info', '');
    upBtn.onclick = async () => {
      if (typeof PDFLib === 'undefined') { alert('pdf-lib nicht geladen.'); return; }
      upBtn.disabled = true; splitInfo.style.color = '';
      const groups = getGroups(); const srcDoc = await PDFLib.PDFDocument.load(await pdfFile.arrayBuffer());
      try {
        for (let gi = 0; gi < groups.length; gi++) {
          const g = groups[gi];
          const name = (segNames[gi]?.trim()) || ('Artikel_' + (gi + 1));
          const newDoc = await PDFLib.PDFDocument.create();
          const idxs = []; for (let pg = g.start - 1; pg < g.end; pg++) idxs.push(pg);
          const copied = await newDoc.copyPages(srcDoc, idxs); copied.forEach(pg => newDoc.addPage(pg));
          const blob = new Blob([await newDoc.save()], { type: 'application/pdf' });
          splitInfo.textContent = 'Lade hoch: ' + name + '…';
          await r2Upload('kontexte/' + name + '.pdf', blob, 'application/pdf');
        }
        splitInfo.textContent = '✓ ' + groups.length + ' Kontext' + (groups.length !== 1 ? 'e' : '') + ' hochgeladen';
        splitInfo.style.color = 'var(--grn)'; upBtn.textContent = '✓ Fertig';
      } catch(e) { splitInfo.textContent = '✗ ' + e.message; splitInfo.style.color = '#dc2626'; upBtn.disabled = false; }
    };
    acts.appendChild(upBtn); acts.appendChild(splitInfo);
  };
  return p;
}

// ── Matching: Kontexte mit Materialien verknüpfen ───────────────
function buildMatchingView(subTitle) {
  const p = mk('div', 'mat-matching-panel');
  const pHdr = mk('div', 'mat-upload-hdr');
  pHdr.appendChild(tx('span', 'mat-upload-title', '🔗 Kontext-Matching'));
  const closeP = btn('✕', 'btn btn-ghost btn-xs'); closeP.onclick = () => p.remove();
  pHdr.appendChild(closeP); p.appendChild(pHdr);
  const hint = tx('div', '', '← Kontext wählen (links), dann Material anklicken (rechts) → verknüpft');
  hint.style.cssText = 'font-size:12px;color:var(--tx3);padding:4px 0 10px;';
  p.appendChild(hint);

  const cols = mk('div', 'mat-matching-cols'); p.appendChild(cols);

  // ── Linke Spalte: Kontexte aus R2/kontexte/ ────────────────
  const leftCol = mk('div', 'mat-matching-left');
  leftCol.appendChild(tx('div', 'mat-matching-col-hdr', '📋 Kontexte'));
  const ctxList = mk('div', 'mat-matching-ctx-list'); leftCol.appendChild(ctxList); cols.appendChild(leftCol);
  let selectedCtxKey = null; let selectedCtxEl = null;

  (async () => {
    ctxList.innerHTML = '<span style="color:var(--tx3);font-size:12px">⏳ Lade…</span>';
    try {
      const { files } = await r2List('kontexte/', '');
      ctxList.innerHTML = '';
      const pdfs = files.filter(f => f.key.endsWith('.pdf'));
      if (!pdfs.length) { ctxList.innerHTML = '<span style="color:var(--tx3);font-size:12px">Keine Kontexte in R2/kontexte/ – zuerst Kontext-Split nutzen.</span>'; return; }
      pdfs.forEach(({ key }) => {
        const name = key.split('/').pop().replace(/\.pdf$/i, '');
        const wrap = mk('div', 'mat-r2-file-wrap');
        const row = mk('div', 'mat-matching-ctx-row');
        row.appendChild(tx('span', 'mat-r2-filename', name));
        const thumbWrap = mk('div', 'mat-r2-ktx-thumb'); thumbWrap.style.display = 'none';
        const prevBtn = btn('👁', 'btn btn-ghost btn-xs'); prevBtn.title = 'Vorschau';
        prevBtn.onclick = async e => {
          e.stopPropagation();
          if (thumbWrap.style.display !== 'none') { thumbWrap.style.display = 'none'; return; }
          prevBtn.textContent = '⏳'; prevBtn.disabled = true;
          try {
            const buf = await r2Download(key); thumbWrap.innerHTML = '';
            const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
            const page = await pdf.getPage(1); const vp0 = page.getViewport({ scale: 1 });
            const cv = document.createElement('canvas'); const vp = page.getViewport({ scale: 280 / vp0.width });
            cv.width = vp.width; cv.height = vp.height;
            await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
            cv.style.cssText = 'max-width:280px;height:auto;border:1px solid var(--bord);border-radius:4px;';
            thumbWrap.appendChild(cv); thumbWrap.style.display = 'block';
          } catch(e3) { thumbWrap.textContent = '⚠ ' + e3.message; thumbWrap.style.display = 'block'; }
          finally { prevBtn.textContent = '👁'; prevBtn.disabled = false; }
        };
        row.appendChild(prevBtn);
        row.onclick = () => {
          if (selectedCtxEl) selectedCtxEl.classList.remove('mat-matching-ctx-selected');
          if (selectedCtxKey === key) { selectedCtxKey = null; selectedCtxEl = null; return; }
          selectedCtxKey = key; selectedCtxEl = row; row.classList.add('mat-matching-ctx-selected');
        };
        wrap.appendChild(row); wrap.appendChild(thumbWrap); ctxList.appendChild(wrap);
      });
    } catch(e) { ctxList.innerHTML = '<span style="color:#dc2626;font-size:12px">⚠ ' + e.message + '</span>'; }
  })();

  // ── Rechte Spalte: Materialien ────────────────────────────
  const rightCol = mk('div', 'mat-matching-right');
  const rightHdr = mk('div', 'mat-matching-col-hdr');
  rightHdr.appendChild(tx('span', '', '📚 Materialien'));
  let showAll = false;
  const toggleBtn = btn('Alle anzeigen', 'btn btn-ghost btn-xs');
  toggleBtn.onclick = () => { showAll = !showAll; toggleBtn.textContent = showAll ? 'Nur unverknüpfte' : 'Alle anzeigen'; renderMatList(); };
  rightHdr.appendChild(toggleBtn); rightCol.appendChild(rightHdr);
  const matList = mk('div', 'mat-matching-mat-list'); rightCol.appendChild(matList); cols.appendChild(rightCol);

  function renderMatList() {
    matList.innerHTML = '';
    const items = showAll ? MATDB : MATDB.filter(m => !m.kontextR2key);
    if (!items.length) {
      matList.innerHTML = '<span style="color:var(--tx3);font-size:12px">Alle Materialien haben bereits einen Kontext.</span>';
      return;
    }
    items.forEach(mat => {
      const linked = !!mat.kontextR2key;
      const row = mk('div', 'mat-matching-mat-row' + (linked ? ' mat-matching-linked' : ''));
      row.appendChild(tx('span', 'mat-matching-mat-title', (mat.materialnummer ? mat.materialnummer + ' – ' : '') + (mat.titel || '–')));
      if (linked) row.appendChild(tx('span', 'mat-matching-mat-ctx', '📎 ' + mat.kontextR2key.split('/').pop().replace(/\.pdf$/i, '')));
      row.onclick = () => {
        if (!selectedCtxKey) { alert('Bitte zuerst einen Kontext links auswählen.'); return; }
        mat.kontextR2key = selectedCtxKey;
        saveMatDB(); renderMatList();
      };
      matList.appendChild(row);
    });
  }
  renderMatList(); return p;
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
        const prompt = `Du bist Assistent für eine Lehrerin an einem deutschen Gymnasium (NRW). Du erhältst zwei Gruppen von Bildern.\n\nGRUPPE 1 – KONTEXT (${kontextFiles.length} Bild${kontextFiles.length !== 1 ? 'er' : ''}): Titelseite, Lehrerhandreichung, Erläuterungen und Lösungsseiten. Lese daraus: Lösungen, Erwartungshorizonte, methodische Hinweise, Zeitplanung, didaktische Tipps.\n\nGRUPPE 2 – SCHÜLERMATERIALIEN (${matFiles.length} Bild${matFiles.length !== 1 ? 'er' : ''}): M1, M2, M3 usw. – die eigentlichen Arbeitsblätter.\n\nSCHEMA:\n${schemaStr}\n\nREGELN:\n- Gib ein JSON-Array aus, kein Text davor/danach\n- id Format: mat_${idBase}_1, mat_${idBase}_2 usw.\n- Erkenne selbst welche Bilder zusammengehören (z.B. M1 Seite 1+2 → ein Eintrag)\n- Kein Unterrichtseinheit-Eintrag, nur Einzelmaterialien\n- Titel: "Einheitstitel – M1", Lehrerhandreichung: "Einheitstitel – LH"\n- SII/Oberstufe → immer ["SII"]\n- loesung, loesungHinweis, erlaeuterung vollständig aus Kontext übernehmen\n- schueleraktivitaeten, artDerGeistigenTaetigkeit, darstellungsformen: alle vollständig aufführen`;
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

  const uploadBtn = btn('📄 PDF hochladen', 'btn btn-pri btn-sm');
  uploadBtn.onclick = () => {
    const ex = div.querySelector('.mat-upload-panel');
    if (ex) { ex.remove(); return; }
    div.insertBefore(buildUploadPanel(), div.children[1]);
  };

  const r2Btn = btn('📂 Von R2', 'btn btn-ghost btn-sm');
  r2Btn.onclick = () => {
    const ex = div.querySelector('.mat-r2browser');
    if (ex) { ex.remove(); return; }
    div.insertBefore(buildR2Browser(subTitle, renderCards), div.children[1]);
  };

  const ktxBtn = btn('📋 Kontext-Split', 'btn btn-ghost btn-sm');
  ktxBtn.onclick = () => {
    const ex = div.querySelector('.mat-upload-panel');
    if (ex) { ex.remove(); return; }
    div.insertBefore(buildKontextSplitPanel(), div.children[1]);
  };

  const matchBtn = btn('🔗 Matching', 'btn btn-ghost btn-sm');
  matchBtn.onclick = () => {
    const ex = div.querySelector('.mat-matching-panel');
    if (ex) { ex.remove(); return; }
    div.insertBefore(buildMatchingView(subTitle), div.children[1]);
  };

  hdrBtns.appendChild(uploadBtn); hdrBtns.appendChild(r2Btn); hdrBtns.appendChild(ktxBtn); hdrBtns.appendChild(matchBtn); hdrBtns.appendChild(scanBtn);
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
    const order = ['5','6','7','8','9','10','SII'];
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

      // Block per blockId; Einheit per einheitId
      let einheitTitel = null, reiheTitel = null;
      if (mat.blockId) {
        outer: for (const fp of (S.data.fachplanungen || [])) {
          const b = (fp.blocks || []).find(b => b.id === mat.blockId);
          if (b) { reiheTitel = b.titel || b.name || null; break outer; }
        }
      }
      if (mat.einheitId) {
        outer2: for (const fp of (S.data.fachplanungen || [])) {
          for (const block of (fp.blocks || [])) {
            for (const reihe of (block.reihen || [])) {
              const e = (reihe.einheiten || []).find(e => e.id === mat.einheitId);
              if (e) { einheitTitel = e.titel || null; break outer2; }
            }
          }
        }
      }

      // ─ Zeile 1: Quelle (links, klein grau) + Fach (rechts, prominent) ─
      const topRow = mk('div', 'matc-top-row');
      if (mat.quelle) topRow.appendChild(tx('span', 'matc-quelle', mat.quelle));
      const fachArr = mat.fach || [];
      if (fachArr.length) {
        const fachBadge = tx('span', 'matc-fach-prominent', fachArr.join(' · '));
        topRow.appendChild(fachBadge);
      }
      if (topRow.children.length) card.appendChild(topRow);

      // ─ Kopfzeile: [Nr – ]Titel + Del-Button ─
      const cardHdr = mk('div', 'matc-card-hdr');
      const titleText = mat.materialnummer ? mat.materialnummer + ' – ' + (mat.titel || '–') : (mat.titel || '–');
      const titleEl = tx('span', 'matc-title', titleText);
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

      // ─ Untertitel: Block-Chip + Einheitsname ─
      const subLine = mk('div', 'matc-sub-line');
      if (reiheTitel) subLine.appendChild(tx('span', 'matc-reihe-chip', reiheTitel));
      if (einheitTitel) subLine.appendChild(tx('span', 'matc-unit-inline', einheitTitel));
      if (subLine.children.length) card.appendChild(subLine);

      // ─ Typ-Badge + Jahrgang ─
      const metaRow = mk('div', 'matc-meta');
      if (mat.materialtyp) metaRow.appendChild(typBadge(mat.materialtyp));
      if ((mat.jahrgang || []).length) {
        const SII_JG = new Set(['EF','Q1','Q2','SII']);
        const jgLabel = mat.jahrgang.every(j => SII_JG.has(j)) ? mat.jahrgang.join('/') : 'Jg. ' + mat.jahrgang.join('/');
        metaRow.appendChild(tx('span', 'matc-jg', jgLabel));
      }
      card.appendChild(metaRow);

      // ─ Phasen ─
      if ((mat.unterrichtsphase || []).length) {
        const phRow = mk('div', 'matc-phases');
        mat.unterrichtsphase.forEach(p => phRow.appendChild(phaseChip(p)));
        card.appendChild(phRow);
      }

      // ─ Footer: nur KLP-Anzahl ─
      const klpCount = (mat.kompetenzenKLP || []).length;
      if (klpCount) {
        const footer = mk('div', 'matc-footer');
        footer.appendChild(tx('span', 'matc-klp-count', klpCount + ' KLP'));
        card.appendChild(footer);
      }

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
  if (mat.r2key) {
    const prevWrap = mk('div', 'mat-detail-preview');
    const prevBtn = btn('👁 Vorschau laden', 'btn btn-ghost btn-xs');
    const prevPages = mk('div', 'mat-detail-preview-pages');
    prevBtn.onclick = async () => {
      prevBtn.disabled = true; prevBtn.textContent = '⏳ Lade…';
      try {
        const buf = await r2Download(mat.r2key);
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
  const SII_JG2 = new Set(['EF','Q1','Q2','SII']);
  const matFaecher = (mat.fach || []).map(f => f.toLowerCase());
  const FACH_MAP = { 'Ch': 'chemie', 'Ch_GK': 'chemie', 'Ch_LK': 'chemie', 'Bio': 'biologie', 'Bio_GK': 'biologie', 'Bio_LK': 'biologie', 'M': 'mathematik' };
  const blockOptionen = [{ value: '', label: '– keine Zuweisung –' }];
  (S.data.fachplanungen || []).forEach(fp => {
    if (!SII_JG2.has(fp.jahrgang)) return;
    const fpFach = (FACH_MAP[fp.fach] || fp.fach || '').toLowerCase();
    if (matFaecher.length && !matFaecher.some(f => fpFach.includes(f) || f.includes(fpFach.split(' ')[0]))) return;
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
  if (mat.r2key) {
    const ktxSection = mk('div', 'mat-detail-ktx');
    const ktxHdr = mk('div', 'mat-detail-ktx-hdr');
    ktxHdr.appendChild(tx('span', 'mat-detail-label', 'Kontext-Datei'));
    const ktxKey = tx('span', 'mat-detail-ktx-key', mat.kontextR2key ? '📎 ' + mat.kontextR2key.split('/').pop() : 'keine');
    ktxHdr.appendChild(ktxKey);
    const ktxPickBtn = btn('📂 Aus R2 wählen', 'btn btn-ghost btn-xs');
    const ktxClearBtn = btn('✕', 'btn btn-ghost btn-xs');
    ktxClearBtn.title = 'Kontext entfernen';
    ktxClearBtn.style.display = mat.kontextR2key ? '' : 'none';
    ktxClearBtn.onclick = () => {
      mat.kontextR2key = null; saveMatDB();
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
            mat.kontextR2key = key; saveMatDB();
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
  if (mat.r2key) {
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
          const vp0 = page.getViewport({ scale: 1 });
          const scale = 280 / vp0.width;
          const vp = page.getViewport({ scale });
          const cv = document.createElement('canvas');
          cv.width = vp.width; cv.height = vp.height;
          await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
          urls.push(cv.toDataURL('image/jpeg', 0.85));
        }
        return urls;
      }

      function toImgContent(dataURL) {
        const [hdr, data] = dataURL.split(',');
        return { type: 'image', source: { type: 'base64', media_type: hdr.match(/data:([^;]+)/)[1], data } };
      }

      try {
        reBtn.textContent = '⏳ Lade Material…';
        const matURLs = await pdfBufToDataURLs(await r2Download(mat.r2key));

        let ktxURLs = [];
        if (mat.kontextR2key) {
          reBtn.textContent = '⏳ Lade Kontext…';
          ktxURLs = await pdfBufToDataURLs(await r2Download(mat.kontextR2key));
        }

        reBtn.textContent = '⏳ KI analysiert…';
        const content = [];
        if (ktxURLs.length) { content.push({ type: 'text', text: '=== KONTEXT ===' }); ktxURLs.forEach(u => content.push(toImgContent(u))); }
        content.push({ type: 'text', text: '=== MATERIAL ===' });
        matURLs.forEach(u => content.push(toImgContent(u)));
        content.push({ type: 'text', text: `Analysiere dieses Unterrichtsmaterial für eine NRW-Gymnasiallehrerin.
Bekannt: Fach=${(mat.fach||[]).join(',')}, Typ=${mat.materialtyp}, Dateiname=${mat.titel}

WICHTIG – Titelregeln:
- "titel" = der tatsächliche Titel wie er auf dem Blatt gedruckt steht
- Ist kein Titel aufgedruckt, verwende den Dateinamen: "${mat.titel}"
- NIEMALS eine Rolle als Titel verwenden (nicht "Einführungsmaterial" o.ä.)
- "rolleImKontext" = 1 kurzer Satz zur pädagogischen Funktion

Antworte NUR mit JSON (kein Text davor/danach):
{"titel":"...","rolleImKontext":"...","beschreibung":"...","themen":[...],"jahrgang":["SII"],"unterrichtsphase":[...],"sozialformenGeeignet":[...],"methodenGeeignet":[],"schueleraktivitaeten":[],"artDerGeistigenTaetigkeit":[],"darstellungsformen":[],"voraussetzungenFachlich":[],"voraussetzungenMethodisch":[],"kognitiveBeanspruchung":"mittel","sprachlicheAnforderungen":"mittel","lautstaerke":"leise","differenzierungsformen":[],"loesung":"","loesungHinweis":"","erlaeuterung":""}` });

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': antKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content }] })
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error('API ' + res.status + ': ' + (err.error?.message || res.statusText)); }
        const d = await res.json();
        const match = (d.content?.[0]?.text || '').match(/\{[\s\S]*\}/);
        if (match) {
          const enriched = JSON.parse(match[0]);
          const idx = MATDB.findIndex(m => m.id === mat.id);
          if (idx >= 0) {
            const keep = (({ quelle, materialnummer, r2key, r2url, kontextR2key, seiten, importiertAm, id }) =>
              ({ quelle, materialnummer: materialnummer || null, r2key, r2url, kontextR2key, seiten, importiertAm, id }))(MATDB[idx]);
            // Materialnummer: KI-Wert übernehmen wenn noch nicht gesetzt
            if (!keep.materialnummer) delete keep.materialnummer;
            Object.assign(MATDB[idx], enriched, keep);
          }
          saveMatDB(); renderCards();
          overlay.classList.remove('open'); body.remove();
          const fresh = MATDB.find(m => m.id === mat.id);
          if (fresh) openMatOverlay(fresh, null, overlay, panel, panTitle, renderCards);
        }
      } catch(e2) {
        reBtn.textContent = '✗ Fehler';
        reBtn.disabled = false;
        alert('Fehler: ' + e2.message);
      }
    };
    delBar.appendChild(reBtn);
  }

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
