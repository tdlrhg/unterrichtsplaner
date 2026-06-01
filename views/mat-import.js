// ── mat-import.js – Import-Assistent, Scan-Panel, R2-Browser ──
// ── Materialien-Datenbank ─────────────────────────────────────────
let _kontextFiles  = [];
const MAT_ANALYSIS_LONG_EDGE = 1568;


// ── KI-Analyse: zentraler Prompt + Normalisierung ────────────────

// Kanonische Unterrichtsphasen (müssen mit PHASE_COLOR in materialien.js übereinstimmen)
const CANONICAL_PHASES = ['Einstieg','Erarbeitung','Sicherung','Vertiefung','Übung','Anwendung','Diagnose'];

function mapToCanonicalPhase(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  // Exakter Treffer (case-insensitive)
  const exact = CANONICAL_PHASES.find(p => p.toLowerCase() === lower);
  if (exact) return exact;
  // Präfix-Treffer: "Erarbeitungsphase II" → "Erarbeitung"
  for (const cp of CANONICAL_PHASES) {
    if (lower.startsWith(cp.toLowerCase())) return cp;
  }
  // Bekannte Aliase
  const ALIAS = {
    'hinführung':'Einstieg','motivation':'Einstieg','problemstellung':'Einstieg',
    'informationsphase':'Erarbeitung','inhaltliche erarbeitung':'Erarbeitung',
    'ergebnissicherung':'Sicherung','zusammenfassung':'Sicherung',
    'transfer':'Anwendung','anwendungsorientierung':'Anwendung','anwendung und transfer':'Anwendung',
    'üben':'Übung','training':'Übung',
    'leistungsüberprüfung':'Diagnose','selbstevaluation':'Diagnose','test':'Diagnose',
  };
  return ALIAS[lower] || null;
}

/**
 * Zentraler Analyse-Prompt für ein einzelnes Unterrichtsmaterial.
 * Wird von mat-overlay.js (Neu analysieren) verwendet.
 */
function buildMaterialAnalysisPrompt({ fach = [], materialtyp = '', titel = '', blockTitel = null } = {}) {
  const known = `Bekannt: Fach=${fach.join(',') || '–'}, Typ=${materialtyp || '–'}, Dateiname=${titel || '–'}${blockTitel ? ', Themenblock="' + blockTitel + '"' : ''}`;
  return `Analysiere dieses Unterrichtsmaterial für eine NRW-Gymnasiallehrerin.
${known}

SCHRITT 1 – JAHRGANG (vor allem anderen lesen!):
Suche auf dem Material nach einer expliziten Klassen- oder Jahrgangsangabe: "Klasse 9/10", "Jg. 7", "für die 8.", "9./10. Schuljahr" o.ä.
- Gefunden → exakt übernehmen, NICHT aufgrund von Thema oder Schwierigkeitsgrad überschreiben
- "9/10" → ["9","10"] | "7/8" → ["7","8"] | "Klasse 9" → ["9"]
- Nicht gefunden → aus Niveau/Thema schätzen | wirklich unklar → []

FELDREGELN:
- "titel" = der tatsächliche Titel wie er auf dem Blatt gedruckt steht; kein Drucktitel → Thema + Aufgabentyp (z.B. "Fotosynthese – Lückentext"). NIEMALS eine Rolle als Titel ("Einführungsmaterial", "Erarbeitungsphase" o.ä.)
- "rolleImKontext" = 1 kurzer Satz zur pädagogischen Funktion
- "fach" = erlaubte Werte: "Bio", "Ch", "M" — aus Fachsprache/Formeln/Konzepten bestimmen; fast immer eindeutig; immer einen Wert angeben, nie []
- "themen" = fachspezifische Kernthemen aus dem MATERIAL — IGNORIERE den KONTEXT vollständig. Beispiel: Kontext=Korallenriffe, Material=Beckenumfang → ["Umfang","Rechteck"], nie ökologische Begriffe
- "unterrichtsphase" = NUR diese Werte verwenden: "Einstieg","Erarbeitung","Sicherung","Vertiefung","Übung","Anwendung","Diagnose"
- "kognitiveBeanspruchung" = genau "niedrig" | "mittel" | "hoch"
- "sprachlicheAnforderungen" = genau "niedrig" | "mittel" | "hoch"
- "lautstaerke" = genau "leise" | "mittel" | "laut"
- "loesung", "loesungHinweis", "erlaeuterung" nur aus KONTEXT/Lehrerhinweisen; wenn keine Lösung erkennbar: ""
Antworte NUR mit JSON (kein Text davor/danach):
{"fach":["Bio"],"titel":"exakter Titel vom Blatt","rolleImKontext":"1 Satz zur Funktion","beschreibung":"2-3 Sätze was SuS tun","themen":["Fotosynthese"],"jahrgang":["7"],"unterrichtsphase":["Erarbeitung"],"sozialformenGeeignet":["Einzelarbeit"],"methodenGeeignet":[],"schueleraktivitaeten":[],"artDerGeistigenTaetigkeit":[],"darstellungsformen":[],"voraussetzungenFachlich":[],"voraussetzungenMethodisch":[],"kognitiveBeanspruchung":"mittel","sprachlicheAnforderungen":"mittel","lautstaerke":"leise","differenzierungsformen":[],"loesung":"","loesungHinweis":"","erlaeuterung":""}`;
}

/**
 * Validiert und normalisiert das KI-Analyseergebnis.
 * Repariert falsche Typen, mappt Phasen auf kanonische Werte,
 * normalisiert Fach-Kürzel und Enum-Felder.
 */
function normalizeMaterialResult(raw) {
  const out = Object.assign({}, raw);

  // Arrays sicherstellen
  const ARR_FIELDS = ['fach','themen','jahrgang','unterrichtsphase','sozialformenGeeignet',
    'methodenGeeignet','schueleraktivitaeten','artDerGeistigenTaetigkeit','darstellungsformen',
    'voraussetzungenFachlich','voraussetzungenMethodisch','differenzierungsformen'];
  ARR_FIELDS.forEach(k => {
    if (!Array.isArray(out[k])) out[k] = out[k] ? [String(out[k])] : [];
  });

  // Strings sicherstellen
  const STR_FIELDS = ['titel','rolleImKontext','beschreibung','kognitiveBeanspruchung',
    'sprachlicheAnforderungen','lautstaerke','loesung','loesungHinweis','erlaeuterung'];
  STR_FIELDS.forEach(k => {
    if (typeof out[k] !== 'string') out[k] = out[k] != null ? String(out[k]) : '';
  });

  // Fach normalisieren – ungültige Werte verwerfen (leeres Array ist besser als "Chemie" in der DB)
  const FACH_MAP = {
    'biologie':'Bio','bio':'Bio','biology':'Bio',
    'chemie':'Ch','ch':'Ch','chemistry':'Ch','chemi':'Ch',
    'mathematik':'M','mathe':'M','math':'M','m':'M','mathematics':'M',
  };
  out.fach = out.fach.map(f => FACH_MAP[f.toLowerCase()] || null).filter(f => f !== null);

  // Jahrgang normalisieren – alle SII-Varianten → 'SII'
  const SII_JG = new Set(['sii','ef','q1','q2','q (gk)','q (lk)','q-phase','oberstufe','einführungsphase','einfuhrungsphase']);
  const SII_NUM = /^(10\/11|11\/12|12\/13|11|12|13)$/;
  out.jahrgang = [...new Set(out.jahrgang.map(j => {
    const jl = (j || '').toLowerCase().trim();
    if (SII_JG.has(jl) || SII_NUM.test(jl)) return 'SII';
    return j;
  }))];

  // Unterrichtsphasen auf kanonische Werte mappen, Unbekanntes verwerfen
  out.unterrichtsphase = [...new Set(out.unterrichtsphase.map(mapToCanonicalPhase).filter(Boolean))];

  // Enum-Felder normalisieren
  const LEVEL = { niedrig:'niedrig', low:'niedrig', gering:'niedrig', mittel:'mittel', medium:'mittel', hoch:'hoch', high:'hoch' };
  out.kognitiveBeanspruchung = LEVEL[(out.kognitiveBeanspruchung||'').toLowerCase()] || 'mittel';
  out.sprachlicheAnforderungen = LEVEL[(out.sprachlicheAnforderungen||'').toLowerCase()] || 'mittel';
  const LAUT = { leise:'leise', still:'leise', ruhig:'leise', mittel:'mittel', laut:'laut', lautstark:'laut' };
  out.lautstaerke = LAUT[(out.lautstaerke||'').toLowerCase()] || 'mittel';

  return out;
}

async function renderPdfPageDataURL(page, longEdge = MAT_ANALYSIS_LONG_EDGE, quality = 0.88) {
  const vp0 = page.getViewport({ scale: 1 });
  const scale = longEdge / Math.max(vp0.width, vp0.height);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  const dataURL = canvas.toDataURL('image/jpeg', quality);
  canvas.width = 0; canvas.height = 0;
  page.cleanup();
  return dataURL;
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

// ── Import-Assistent ─────────────────────────────────────────────
function buildImportAssistent(subTitle, renderCards) {
  const ov = mk('div', 'mat-import-overlay');
  document.body.appendChild(ov);
  const dlg = mk('div', 'mat-import-dialog');
  ov.appendChild(dlg);

  document.body.style.overflow = 'hidden';
  function close() { ov.remove(); document.body.style.overflow = ''; }
  ov.onclick = e => { if (e.target === ov) close(); };
  const _esc = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', _esc); } };
  document.addEventListener('keydown', _esc);

  // Header
  const hdr = mk('div', 'mat-import-hdr');
  const titleEl = tx('span', 'mat-import-title', '📥 Material importieren');
  const stepEl = tx('span', 'mat-import-step', '');
  const closeBtn = btn('✕', 'btn btn-ghost btn-sm'); closeBtn.onclick = close;
  hdr.appendChild(titleEl); hdr.appendChild(stepEl); hdr.appendChild(closeBtn);
  dlg.appendChild(hdr);

  const body = mk('div', 'mat-import-body');
  dlg.appendChild(body);

  // Shared state across steps
  const S = {
    source: null,
    meta: { fach: 'Chemie SI', unter: '', thema: '', quelle: '' },
    types: [],
    defaultType: 'material',
    pageDataURLs: [],
    pdfFile: null,
    pdfDoc: null,
    pdfArrayBuffer: null,
    splitPoints: new Set(),
    segTypes: {},
    zsSegments: [],  // [{id,name,type,blob,heft,thumb,r2Path}]
    zsAusgabe: '',
  };

  function goto(n) { step = n; body.innerHTML = ''; (STEPS[n] || (() => {}))(); }
  let step = 0;

  // ── Schritt 0: Quellauswahl ───────────────────────────────────
  function step0() {
    stepEl.textContent = '';
    body.appendChild(tx('div', 'mat-import-section-title', 'Welche Art von Material möchtest du importieren?'));
    const grid = mk('div', 'mat-import-sources');
    [
      { id: 'pdf',  icon: '📄', title: 'PDF importieren', quelle: '',
        desc: 'Ein oder mehrere PDFs hochladen, aufteilen, als Kontext oder Material zuweisen und matchen',
        target: 13 },
      { id: 'r2',   icon: '📂', title: 'Aus R2',          quelle: '',
        desc: 'Dateien die bereits in Cloudflare R2 liegen in die Datenbank eintragen',
        target: 11 },
      { id: 'bild', icon: '📸', title: 'Aus Bild',         quelle: '',
        desc: 'Fotos von Arbeitsblättern per GPT-4o analysieren und importieren',
        target: 12 },
    ].forEach(src => {
      const card = mk('div', 'mat-import-source-card');
      card.appendChild(tx('div', 'mat-import-source-icon', src.icon));
      card.appendChild(tx('div', 'mat-import-source-title', src.title));
      card.appendChild(tx('div', 'mat-import-source-desc', src.desc));
      card.onclick = () => {
        S.source = src.id; S.meta.quelle = src.quelle; S.types = []; S.defaultType = 'material';
        S.pageDataURLs.length = 0; S.splitPoints.clear(); S.segTypes = {}; S.pdfFile = null;
        goto(src.target);
      };
      grid.appendChild(card);
    });
    body.appendChild(grid);
  }

  // ── Schritt 11: Aus R2 ────────────────────────────────────────
  function step11() {
    stepEl.textContent = 'Aus R2';
    const panel = buildR2Browser(subTitle, renderCards);
    const x = panel.querySelector('.btn-ghost.btn-xs'); if (x) x.onclick = () => goto(0);
    body.appendChild(panel);
  }

  // ── Schritt 12: Aus Bild ──────────────────────────────────────
  function step12() {
    stepEl.textContent = 'Aus Bild';
    const panel = buildScanPanel(subTitle, renderCards, () => goto(0));
    body.appendChild(panel);
  }

  // ── Schritt 13: PDF laden + kategorisieren ───────────────────
  function step13() {
    stepEl.textContent = 'PDFs laden';
    const SPLIT_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6'];
    const CAT = [
      { key: 'material', icon: '📄', label: 'Schülermaterial', color: '#3b82f6' },
      { key: 'kontext',  icon: '📋', label: 'Kontext',         color: '#10b981' },
      { key: 'didaktik', icon: '🎓', label: 'Didaktik',        color: '#8b5cf6' },
      { key: 'skip',     icon: '⊘',  label: 'Überspringen',    color: '#94a3b8' },
    ];
    let activeCategory = 'material';

    // ── Upload-Zone (eine, ganze Breite) ───────────────────────
    const zone = mk('div', 'mat-upload-drop');
    zone.textContent = '📄 PDFs hierher ziehen oder klicken — mehrere gleichzeitig möglich';
    const pdfInp = document.createElement('input');
    pdfInp.type = 'file'; pdfInp.accept = 'application/pdf'; pdfInp.multiple = true;
    pdfInp.style.display = 'none';
    zone.onclick = () => pdfInp.click();
    zone.ondragover = e => { e.preventDefault(); zone.classList.add('drag-over'); };
    zone.ondragleave = () => zone.classList.remove('drag-over');

    // ── Kategorie-Leiste ───────────────────────────────────────
    const catBar = mk('div', '');
    catBar.style.cssText = 'display:none;gap:6px;align-items:center;flex-wrap:wrap;padding:8px 10px;background:var(--surf);border-radius:8px;border:1px solid var(--bord);margin:10px 0 4px;';
    const catLabel = tx('span', '', 'Kategorie aktivieren, dann Thumbnails anklicken:');
    catLabel.style.cssText = 'font-size:11px;color:var(--tx3);width:100%;';
    catBar.appendChild(catLabel);
    const catBtns = {};
    function setCatActive(key) {
      activeCategory = key;
      CAT.forEach(c => {
        const b = catBtns[c.key];
        if (c.key === key) {
          b.style.cssText = 'background:' + c.color + ';color:white;border-color:' + c.color + ';';
        } else {
          b.style.cssText = '';
          b.className = 'btn btn-sm btn-ghost';
        }
      });
    }
    CAT.forEach(cat => {
      const b = btn(cat.icon + ' ' + cat.label, 'btn btn-sm btn-ghost');
      b.onclick = () => setCatActive(cat.key);
      catBtns[cat.key] = b;
      catBar.appendChild(b);
    });

    // ── Thumbnail-Grid ─────────────────────────────────────────
    const grid = mk('div', '');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-top:4px;';

    // ── Navigation ─────────────────────────────────────────────
    const navWrap = mk('div', ''); navWrap.style.cssText = 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;';
    function renderNav() {
      navWrap.innerHTML = '';
      if (S.zsSegments.filter(s => s.type !== 'skip').length > 0) {
        const matchBtn = btn('→ Zum Matching', 'btn btn-pri btn-sm');
        matchBtn.onclick = () => goto(14);
        navWrap.appendChild(matchBtn);
      }
      const backBtn = btn('← Zurück', 'btn btn-ghost btn-sm');
      backBtn.onclick = () => { S.zsSegments = []; S.zsAusgabe = ''; goto(0); };
      navWrap.appendChild(backBtn);
    }

    // ── Thumbnail-Karte ────────────────────────────────────────
    function makeThumbCard(seg) {
      const card = mk('div', '');
      card.style.cssText = 'width:180px;border-radius:8px;overflow:hidden;cursor:pointer;border:3px solid var(--bord);transition:border-color .12s;user-select:none;box-shadow:0 1px 5px rgba(0,0,0,.1);flex-shrink:0;';
      card.dataset.segId = seg.id;

      const imgArea = mk('div', '');
      imgArea.style.cssText = 'background:var(--surf2);position:relative;min-height:200px;display:flex;align-items:center;justify-content:center;';
      const spinner = tx('div', '', '⏳');
      spinner.style.cssText = 'font-size:28px;';
      imgArea.appendChild(spinner);
      card.appendChild(imgArea);

      const footer = mk('div', '');
      footer.style.cssText = 'padding:5px 8px;background:var(--surf);';
      const nameEl = tx('div', '', seg.name);
      nameEl.style.cssText = 'font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx1);';
      const badge = mk('div', '');
      badge.style.cssText = 'font-size:10px;color:white;border-radius:4px;padding:2px 7px;margin-top:3px;display:inline-block;font-weight:600;';

      // Splitter-Button (klein, im Footer)
      const splitRow = mk('div', ''); splitRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-top:4px;';
      const splitBtn = btn('✂ Aufteilen', 'btn btn-xs btn-ghost');
      splitBtn.onclick = async e => {
        e.stopPropagation();
        const existing = card.nextElementSibling?.dataset?.splitterId === seg.id ? card.nextElementSibling : null;
        if (existing) { existing.remove(); return; }
        splitBtn.disabled = true; splitBtn.textContent = '⏳';
        const splitter = await buildSegSplitter(seg, () => { renderAllCards(); renderNav(); });
        splitter.style.cssText = 'width:100%;margin-bottom:8px;order:' + card.style.order + ';flex-basis:100%;';
        splitter.dataset.splitterId = seg.id;
        card.insertAdjacentElement('afterend', splitter);
        splitBtn.disabled = false; splitBtn.textContent = '✂ Aufteilen';
      };
      const delBtn = btn('✕', 'btn btn-xs btn-ghost'); delBtn.style.color = '#dc2626';
      delBtn.onclick = e => {
        e.stopPropagation();
        S.zsSegments = S.zsSegments.filter(s => s.id !== seg.id);
        card.nextElementSibling?.dataset?.splitterId === seg.id && card.nextElementSibling.remove();
        card.remove();
        renderNav();
        if (!S.zsSegments.length) { catBar.style.display = 'none'; zone.textContent = '📄 PDFs hierher ziehen oder klicken — mehrere gleichzeitig möglich'; }
      };
      splitRow.appendChild(splitBtn); splitRow.appendChild(delBtn);

      footer.appendChild(nameEl); footer.appendChild(badge); footer.appendChild(splitRow);
      card.appendChild(footer);

      function updateCard() {
        const cat = CAT.find(c => c.key === seg.type) || CAT[0];
        card.style.borderColor = cat.color;
        badge.style.background = cat.color;
        badge.textContent = cat.icon + ' ' + cat.label;
      }
      updateCard();

      card.onclick = () => { seg.type = activeCategory; updateCard(); };

      // Thumbnail asynchron rendern
      (async () => {
        try {
          const blobUrl = URL.createObjectURL(seg.blob);
          const pdfDoc = await pdfjsLib.getDocument(blobUrl).promise;
          const page = await pdfDoc.getPage(1);
          const vp0 = page.getViewport({ scale: 1 });
          const scale = 360 / vp0.width;
          const vp = page.getViewport({ scale });
          const cv = document.createElement('canvas');
          cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
          await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
          const dataURL = cv.toDataURL('image/jpeg', 0.90);
          cv.width = 0; cv.height = 0;
          page.cleanup(); await pdfDoc.destroy(); URL.revokeObjectURL(blobUrl);
          const img = document.createElement('img');
          img.src = dataURL; img.style.cssText = 'width:100%;display:block;';
          imgArea.innerHTML = ''; imgArea.style.minHeight = ''; imgArea.appendChild(img);
          seg.thumb = dataURL;
        } catch(e) { spinner.textContent = '⚠'; }
      })();

      return card;
    }

    function renderAllCards() {
      grid.innerHTML = '';
      S.zsSegments.forEach(seg => grid.appendChild(makeThumbCard(seg)));
    }

    async function loadFiles(files) {
      const pdfs = [...files].filter(f => f.type === 'application/pdf');
      if (!pdfs.length) return;
      catBar.style.display = 'flex';
      setCatActive('material');
      zone.textContent = '✓ Geladen — weitere PDFs hier ablegen um sie hinzuzufügen';
      for (const f of pdfs) {
        const seg = { id: uid(), name: f.name.replace(/\.pdf$/i, ''), type: 'material', blob: f, heft: 1, thumb: null, r2Path: null };
        S.zsSegments.push(seg);
        grid.appendChild(makeThumbCard(seg));
      }
      renderNav();
    }

    zone.ondrop = async e => { e.preventDefault(); zone.classList.remove('drag-over'); await loadFiles(e.dataTransfer.files); };
    pdfInp.onchange = async () => { await loadFiles(pdfInp.files); pdfInp.value = ''; };

    body.appendChild(zone); body.appendChild(pdfInp);
    body.appendChild(catBar);
    body.appendChild(grid);
    body.appendChild(navWrap);

    // Bereits vorhandene Segmente (z.B. nach Zurück-Navigation) anzeigen
    if (S.zsSegments.length) { catBar.style.display = 'flex'; setCatActive('material'); renderAllCards(); renderNav(); }

    // ── Segment nachträglich splitten ─────────────────────────────

    // ── Segment nachträglich splitten ─────────────────────────────
    async function buildSegSplitter(seg, onDone) {
      const TYPE_OPTS = [{key:'kontext',label:'📋 Kontext'},{key:'material',label:'📄 Schülermaterial'},{key:'didaktik',label:'🎓 Didaktik'},{key:'skip',label:'⊘ Skip'}];
      const wrap = mk('div','');
      wrap.style.cssText='width:100%;flex-basis:100%;border-top:2px solid var(--pri);background:var(--surf);padding:14px;margin-top:4px;border-radius:0 0 8px 8px;';
      const hdrEl=mk('div',''); hdrEl.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:10px;font-weight:600;font-size:13px;';
      hdrEl.appendChild(tx('span','','✂ Aufteilen: '+seg.name));
      const cancBtn=btn('Abbrechen','btn btn-ghost btn-xs'); cancBtn.onclick=()=>wrap.remove();
      hdrEl.appendChild(cancBtn); wrap.appendChild(hdrEl);
      const loadStatus = tx('div','','⏳ Lade Seiten…');
      loadStatus.style.cssText='font-size:13px;color:var(--tx3);padding:8px 0;';
      wrap.appendChild(loadStatus);
      const splitArea=mk('div',''); wrap.appendChild(splitArea);

      const pageDataURLs2=[]; const splitPoints2=new Set();
      const segNames2={}, segTypes2={};

      let loadOk=false;
      try {
        const blobUrl=URL.createObjectURL(seg.blob);
        const pdfDoc=await pdfjsLib.getDocument(blobUrl).promise;
        loadStatus.textContent='⏳ Rendere ' + pdfDoc.numPages + ' Seiten…';
        for(let i=1;i<=pdfDoc.numPages;i++){
          const page=await pdfDoc.getPage(i);
          const vp0=page.getViewport({scale:1});
          const cv=document.createElement('canvas');
          const vp=page.getViewport({scale:480/vp0.width});
          cv.width=vp.width; cv.height=vp.height;
          await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
          const dataURL=cv.toDataURL('image/jpeg',0.90);
          cv.width=0; cv.height=0; page.cleanup();
          pageDataURLs2.push(dataURL);
        }
        await pdfDoc.destroy(); URL.revokeObjectURL(blobUrl);
        loadStatus.remove();
        loadOk=true;
      } catch(e) {
        loadStatus.textContent='⚠ ' + e.message;
        loadStatus.style.color='#dc2626';
        return wrap;
      }

      if(!loadOk) return wrap;

      function getGroups2(){
        const g=[]; let s=1;
        for(const pt of [...splitPoints2].sort((a,b)=>a-b)){g.push({start:s,end:pt});s=pt+1;}
        g.push({start:s,end:pageDataURLs2.length}); return g;
      }

      function renderSplitUI2(){
        splitArea.innerHTML='';

        // ── Seiten-Leiste: Thumbnails klickbar + Trenner ───────────
        const groups2 = getGroups2();
        const pagesRow = mk('div','');
        pagesRow.style.cssText='display:flex;flex-wrap:wrap;gap:10px;padding:4px 0 12px;';
        let gi = 0;
        for(let i=1;i<=pageDataURLs2.length;i++){
          const color = SPLIT_COLORS[gi%SPLIT_COLORS.length];
          const curGrpIdx = gi; // Index der aktuellen Gruppe (für Closure)
          const img=document.createElement('img'); img.src=pageDataURLs2[i-1];
          img.style.cssText='width:160px;height:auto;display:block;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.15);pointer-events:none;';
          const tw=mk('div','');
          tw.style.cssText='display:flex;flex-direction:column;align-items:center;gap:3px;border-left:3px solid '+color+';padding-left:4px;cursor:pointer;transition:opacity .1s;';
          tw.title = 'Klicken um aktive Kategorie zuzuweisen';
          tw.appendChild(img);
          tw.appendChild(tx('div','mat-upload-thumb-nr','S.'+i));
          // Klick = aktive Kategorie der ganzen Gruppe zuweisen
          tw.onclick=()=>{
            segTypes2[curGrpIdx]=activeCategory;
            renderSplitUI2();
          };
          tw.onmouseenter=()=>{ tw.style.opacity='.75'; };
          tw.onmouseleave=()=>{ tw.style.opacity=''; };
          pagesRow.appendChild(tw);
          if(i<pageDataURLs2.length){
            const divEl=mk('div','mat-split-divider'); divEl.dataset.page=String(i);
            const icon=tx('span','mat-split-div-icon',splitPoints2.has(i)?'✂':'+');
            if(splitPoints2.has(i)){divEl.classList.add('active'); gi++;}
            divEl.appendChild(icon);
            divEl.onclick=()=>{
              const pg=parseInt(divEl.dataset.page);
              if(splitPoints2.has(pg)) splitPoints2.delete(pg); else splitPoints2.add(pg);
              renderSplitUI2();
            };
            pagesRow.appendChild(divEl);
          }
        }
        splitArea.appendChild(pagesRow);

        // ── Segment-Übersicht: Name + aktueller Typ (kein Doppel-Buttonblock) ──
        const segRows = mk('div','');
        segRows.style.cssText='display:flex;flex-direction:column;gap:4px;margin-bottom:10px;';
        groups2.forEach((g,gi2)=>{
          const color=SPLIT_COLORS[gi2%SPLIT_COLORS.length];
          const curType=segTypes2[gi2]!==undefined?segTypes2[gi2]:seg.type;
          const catInfo=CAT.find(c=>c.key===curType)||CAT[0];
          const row=mk('div',''); row.style.cssText='display:flex;align-items:center;gap:8px;padding:5px 8px;border-left:3px solid '+color+';background:var(--surf2);border-radius:0 4px 4px 0;';
          const rangeLbl=tx('span','mat-split-range','S.'+g.start+(g.end>g.start?'–'+g.end:''));
          const nameInp=document.createElement('input'); nameInp.type='text'; nameInp.className='finp';
          nameInp.style.cssText='flex:1;min-width:100px;font-size:12px;';
          nameInp.value=segNames2[gi2]!==undefined?segNames2[gi2]:(gi2===0?seg.name:seg.name+'_'+(gi2+1));
          nameInp.oninput=()=>{segNames2[gi2]=nameInp.value;};
          const badge=mk('span','');
          badge.style.cssText='font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:'+catInfo.color+';color:white;white-space:nowrap;';
          badge.textContent=catInfo.icon+' '+catInfo.label;
          row.appendChild(rangeLbl); row.appendChild(nameInp); row.appendChild(badge);
          segRows.appendChild(row);
        });
        splitArea.appendChild(segRows);

        // ── Speichern ───────────────────────────────────────────────
        const n=groups2.length;
        const actRow=mk('div',''); actRow.style.cssText='display:flex;gap:8px;align-items:center;';
        const saveBtn=btn(`✓ ${n} Segment${n!==1?'e':''} übernehmen`,'btn btn-pri btn-sm');
        const saveStatus=tx('span','',''); saveStatus.style.cssText='font-size:12px;color:var(--tx3);';
        saveBtn.onclick=async()=>{
          if(typeof PDFLib==='undefined'){alert('pdf-lib nicht geladen.');return;}
          saveBtn.disabled=true; saveBtn.textContent='⏳ Teile auf…';
          try{
            const pdfBuf2=await seg.blob.arrayBuffer();
            const srcDoc=await PDFLib.PDFDocument.load(pdfBuf2);
            const newSegs=[];
            for(let gi2=0;gi2<groups2.length;gi2++){
              const type2=segTypes2[gi2]!==undefined?segTypes2[gi2]:seg.type;
              if(type2==='skip') continue;
              const g2=groups2[gi2];
              const name2=(segNames2[gi2]?.trim())||(gi2===0?seg.name:seg.name+'_'+(gi2+1));
              const newDoc=await PDFLib.PDFDocument.create();
              const idxs=[]; for(let pg=g2.start-1;pg<g2.end;pg++) idxs.push(pg);
              const copied=await newDoc.copyPages(srcDoc,idxs); copied.forEach(pg=>newDoc.addPage(pg));
              newSegs.push({id:uid(),name:name2,type:type2,blob:new Blob([await newDoc.save()],{type:'application/pdf'}),heft:seg.heft,thumb:null,r2Path:null});
            }
            const idx=S.zsSegments.findIndex(s=>s.id===seg.id);
            if(idx>=0) S.zsSegments.splice(idx,1,...newSegs); else S.zsSegments.push(...newSegs);
            wrap.remove(); onDone();
          }catch(e2){saveStatus.textContent='⚠ '+e2.message;saveBtn.disabled=false;saveBtn.textContent=`✓ ${n} Segment${n!==1?'e':''} übernehmen`;}
        };
        actRow.appendChild(saveBtn); actRow.appendChild(saveStatus); splitArea.appendChild(actRow);
      }
      renderSplitUI2();
      return wrap;
    }
  }

  // ── Schritt 14: Visuelles Matching ───────────────────────────
  function step14() {
    stepEl.textContent = 'Matching';
    const MATCH_COLORS=['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6','#0ea5e9'];
    let kontextSegs=S.zsSegments.filter(s=>s.type==='kontext');
    let materialSegs=S.zsSegments.filter(s=>s.type==='material');
    let didaktikSegs=S.zsSegments.filter(s=>s.type==='didaktik');

    function refreshSegs(){
      kontextSegs=S.zsSegments.filter(s=>s.type==='kontext');
      materialSegs=S.zsSegments.filter(s=>s.type==='material');
      didaktikSegs=S.zsSegments.filter(s=>s.type==='didaktik');
      // Stale matches bereinigen
      for(const [mid,kid] of matches){
        if(!materialSegs.find(s=>s.id===mid)||!kontextSegs.find(s=>s.id===kid)) matches.delete(mid);
      }
    }

    // Ausgabe-Name
    const ausgabeWrap=mk('div',''); ausgabeWrap.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:16px;';
    const ausgabeInp=document.createElement('input'); ausgabeInp.type='text'; ausgabeInp.className='finp';
    ausgabeInp.placeholder='Ausgabe / Ordnername'; ausgabeInp.value=S.zsAusgabe;
    ausgabeInp.style.cssText='flex:1;max-width:400px;';
    const ausgabeHint=tx('span','',''); ausgabeHint.style.cssText='font-size:11px;color:var(--tx3);white-space:nowrap;';
    function updateAusgabeHint(){
      const safe=r2safe(ausgabeInp.value.trim());
      const raw=ausgabeInp.value.trim();
      ausgabeHint.textContent = (raw && safe!==raw) ? '→ Ordner: '+safe : '';
    }
    ausgabeInp.oninput=()=>{S.zsAusgabe=ausgabeInp.value.trim();updateUploadBtn();updateAusgabeHint();};
    updateAusgabeHint();
    ausgabeWrap.appendChild(tx('span','','Ausgabe:')); ausgabeWrap.appendChild(ausgabeInp); ausgabeWrap.appendChild(ausgabeHint);
    body.appendChild(ausgabeWrap);

    // Matching-State
    const matches=new Map(); // materialId → kontextId
    const pairColors=new Map(); let colorIdx=0;
    let selId=null, selSide=null;

    function pairColor(kid){
      if(!pairColors.has(kid)) pairColors.set(kid,MATCH_COLORS[colorIdx++%MATCH_COLORS.length]);
      return pairColors.get(kid);
    }

    // Zwei-Spalten-Layout
    const cols=mk('div',''); cols.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:16px;min-height:0;';
    const leftWrap=mk('div',''); const rightWrap=mk('div','');
    const leftHdr=tx('div','','📋 Kontext');
    leftHdr.style.cssText='font-weight:700;font-size:13px;margin-bottom:8px;color:var(--tx2);';
    const rightHdr=tx('div','','📄 Material');
    rightHdr.style.cssText='font-weight:700;font-size:13px;margin-bottom:8px;color:var(--tx2);';
    leftWrap.appendChild(leftHdr); rightWrap.appendChild(rightHdr);
    const leftCards=mk('div',''); const rightCards=mk('div','');
    leftWrap.appendChild(leftCards); rightWrap.appendChild(rightCards);
    cols.appendChild(leftWrap); cols.appendChild(rightWrap);
    body.appendChild(cols);

    // Didaktik-Sektion
    if(didaktikSegs.length>0){
      const dSec=mk('div',''); dSec.style.cssText='margin-top:16px;padding:12px;border:1px solid var(--bord);border-radius:8px;background:var(--surf);';
      const dHdr=tx('div','',`🎓 Didaktik-Artikel (${didaktikSegs.length}) – werden als Wissenstext gespeichert`);
      dHdr.style.cssText='font-size:12px;font-weight:700;color:var(--tx2);margin-bottom:8px;';
      dSec.appendChild(dHdr);
      didaktikSegs.forEach(seg=>{
        const row=tx('div','',seg.name); row.style.cssText='font-size:12px;color:var(--tx2);padding:2px 0;';
        dSec.appendChild(row);
      });
      body.appendChild(dSec);
    }

    // Status + Buttons
    const statusRow=mk('div',''); statusRow.style.cssText='display:flex;align-items:center;gap:12px;margin-top:20px;flex-wrap:wrap;';
    const statusEl=tx('span','','');
    const uploadBtn=btn('📤 Hochladen','btn btn-pri btn-sm'); uploadBtn.disabled=true;
    const didaktikBtn=didaktikSegs.length>0?btn(`🎓 ${didaktikSegs.length} Didaktik hochladen`,'btn btn-ghost btn-sm'):null;
    const restBtn=btn('📤 Restliche einzeln hochladen','btn btn-ghost btn-sm');
    const backBtn3=btn('← Zurück','btn btn-ghost btn-sm'); backBtn3.onclick=()=>goto(13);
    statusRow.appendChild(uploadBtn);
    if(didaktikBtn) statusRow.appendChild(didaktikBtn);
    statusRow.appendChild(restBtn); statusRow.appendChild(statusEl); statusRow.appendChild(backBtn3);
    body.appendChild(statusRow);

    function updateUploadBtn(){ updateUploadLabel(); }

    function makeCard(seg, side) {
      const isKtx=side==='kontext';
      const kid=isKtx?seg.id:matches.get(seg.id);
      const color=kid?pairColor(kid):null;
      const isSel=selId===seg.id&&selSide===side;
      const card=mk('div','');
      card.style.cssText=`border:2px solid ${isSel?'#6366f1':color||'var(--bord)'};border-radius:8px;padding:8px;margin-bottom:12px;cursor:pointer;background:${isSel?'#ede9fe':'var(--surf)'};transition:border-color .15s;`;
      if(seg.thumb){
        const img=document.createElement('img'); img.src=seg.thumb;
        img.style.cssText='width:100%;border-radius:4px;display:block;'; card.appendChild(img);
      } else {
        const ph=tx('div','','⏳'); ph.style.cssText='height:120px;display:flex;align-items:center;justify-content:center;color:var(--tx3);font-size:24px;';
        card.appendChild(ph);
      }
      const nameRow=mk('div',''); nameRow.style.cssText='font-size:12px;font-weight:600;margin-top:6px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;';
      nameRow.appendChild(tx('span','',seg.name));
      if(isKtx){
        // alle gematchten Materialien anzeigen
        [...matches.entries()].filter(([mid,k])=>k===seg.id).forEach(([mid])=>{
          const ms=materialSegs.find(s=>s.id===mid);
          if(ms){ const badge=tx('span','',ms.name); badge.style.cssText=`background:${color};color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;`; nameRow.appendChild(badge); }
        });
      } else if(kid){
        const ktxSeg=kontextSegs.find(s=>s.id===kid);
        if(ktxSeg){ const badge=tx('span','',ktxSeg.name); badge.style.cssText=`background:${color};color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;`; nameRow.appendChild(badge); }
      }
      card.appendChild(nameRow);
      // Typ-Wechsel-Badge
      const TYPE_CYCLE={kontext:'material',material:'didaktik',didaktik:'skip',skip:'kontext'};
      const TYPE_ICON={kontext:'📋',material:'📄',didaktik:'🎓',skip:'⊘'};
      const typBadge=tx('span','',TYPE_ICON[seg.type]+' '+seg.type);
      typBadge.style.cssText='font-size:10px;color:var(--tx3);cursor:pointer;margin-top:2px;display:inline-block;';
      typBadge.title='Klicken zum Ändern';
      typBadge.onclick=e=>{
        e.stopPropagation();
        seg.type=TYPE_CYCLE[seg.type]||'kontext';
        refreshSegs(); renderMatchCards();
      };
      card.appendChild(typBadge);
      card.onclick=()=>handleClick(seg.id,side);
      return card;
    }

    function renderMatchCards(){
      leftCards.innerHTML=''; rightCards.innerHTML='';
      leftHdr.textContent=`📋 Kontext (${kontextSegs.length})`;
      rightHdr.textContent=`📄 Material (${materialSegs.length})`;
      kontextSegs.forEach(seg=>leftCards.appendChild(makeCard(seg,'kontext')));
      materialSegs.forEach(seg=>rightCards.appendChild(makeCard(seg,'material')));
      statusEl.textContent=matches.size>0?matches.size+' Paar'+(matches.size>1?'e':'')+' verbunden':'';
      updateUploadLabel();
    }

    function handleClick(id,side){
      if(selId===null){ selId=id; selSide=side; }
      else if(selId===id&&selSide===side){ selId=null; selSide=null; }
      else if(selSide!==side){
        const kid=side==='kontext'?id:selId;
        const mid=side==='material'?id:selId;
        if(matches.get(mid)===kid){ matches.delete(mid); selId=null; selSide=null; }
        else { matches.delete(mid); matches.set(mid,kid); selId=kid; selSide='kontext'; }
      } else { selId=id; selSide=side; }
      renderMatchCards();
    }

    // Thumbnails laden (höhere Auflösung) – sequenziell, mit createObjectURL + destroy
    async function loadThumbs(){
      for(const seg of S.zsSegments.filter(s=>s.type!=='skip'&&!s.thumb)){
        let blobUrl=null; let doc=null;
        try{
          blobUrl=URL.createObjectURL(seg.blob);
          doc=await pdfjsLib.getDocument(blobUrl).promise;
          const page=await doc.getPage(1);
          const vp0=page.getViewport({scale:1});
          const cv=document.createElement('canvas');
          const vp=page.getViewport({scale:480/vp0.width});
          cv.width=vp.width; cv.height=vp.height;
          await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
          page.cleanup();
          seg.thumb=cv.toDataURL('image/jpeg',0.85);
          cv.width=0; cv.height=0;
          await doc.destroy(); doc=null;
          URL.revokeObjectURL(blobUrl); blobUrl=null;
          renderMatchCards();
        }catch(e){
          if(doc) doc.destroy().catch(()=>{});
          if(blobUrl) URL.revokeObjectURL(blobUrl);
          seg.thumb='';
        }
      }
    }

    function updateUploadLabel(){
      const n=matches.size;
      uploadBtn.textContent=n>0?`📤 ${n} Paar${n>1?'e':''} hochladen`:'📤 Hochladen';
      uploadBtn.disabled=n===0;
    }

    renderMatchCards();
    loadThumbs();

    // R2-sichere Pfadkomponente: nur Alphanumerisch, Bindestrich, Unterstrich, Punkt, Leerzeichen
    // Apostrophe, !, (, ) etc. werden von encodeURIComponent nicht kodiert → Signaturfehler
    function r2safe(s){ return s.replace(/[^a-zA-Z0-9äöüÄÖÜß\-_. ]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').trim(); }

    // Didaktik-Artikel hochladen
    if(didaktikBtn) didaktikBtn.onclick=async()=>{
      if(!S.zsAusgabe){ ausgabeInp.focus(); statusEl.textContent='⚠ Bitte zuerst den Ausgabe-Namen eingeben.'; statusEl.style.color='#dc2626'; return; }
      didaktikBtn.disabled=true;
      const folder=r2safe(S.zsAusgabe);
      try{
        const newEntries=[];
        for(const seg of didaktikSegs){
          statusEl.textContent='🎓 '+seg.name+'…';
          if(!seg.r2Path){
            seg.r2Path='didaktik/'+folder+'/'+r2safe(seg.name)+'.pdf';
            await r2Upload(seg.r2Path,seg.blob,'application/pdf');
          }
          statusEl.textContent='🎓 Text extrahieren: '+seg.name+'…';
          const text=await extractPdfText(seg.blob);
          newEntries.push({id:uid(),titel:seg.name,themen:[],quelle:S.zsAusgabe,
            dateipfad:seg.r2Path,text,importiertAm:new Date().toISOString()});
        }
        newEntries.forEach(e=>DIDARTDB.push(e));
        await sbUpload('didaktik-artikel.json',DIDARTDB);
        const didIds=new Set(didaktikSegs.map(s=>s.id));
        S.zsSegments=S.zsSegments.filter(s=>!didIds.has(s.id));
        statusEl.textContent='✓ '+newEntries.length+' Didaktik-Artikel gespeichert';
        statusEl.style.color='var(--grn)';
        goto(14);
      }catch(e){ statusEl.textContent='✗ '+e.message; statusEl.style.color='#dc2626'; didaktikBtn.disabled=false; }
    };

    // Restliche (ungematchte) Segmente einzeln hochladen
    restBtn.onclick=async()=>{
      if(!S.zsAusgabe){ ausgabeInp.focus(); statusEl.textContent='⚠ Bitte zuerst den Ausgabe-Namen eingeben.'; statusEl.style.color='#dc2626'; return; }
      const matchedIds=new Set([...matches.keys(),...matches.values()]);
      const rest=S.zsSegments.filter(s=>s.type!=='skip'&&!matchedIds.has(s.id));
      if(!rest.length){ statusEl.textContent='Keine ungematchten Segmente.'; return; }
      restBtn.disabled=true;
      const folder=r2safe(S.zsAusgabe);
      try{
        for(const seg of rest.filter(s=>!s.r2Path)){
          const subdir=seg.type==='kontext'?'kontexte':'materialien';
          seg.r2Path=subdir+'/'+folder+'/'+r2safe(seg.name)+'.pdf';
          statusEl.textContent='Lade hoch: '+seg.name+'…';
          await r2Upload(seg.r2Path,seg.blob,'application/pdf');
        }
        const newEntries=[];
        for(const seg of rest.filter(s=>s.r2Path)){
          newEntries.push({id:uid(),titel:seg.name,beschreibung:'',themen:[],fach:[],jahrgang:[],
            materialtyp:seg.type==='kontext'?'Kontext':'Arbeitsblatt',
            quelle:S.zsAusgabe,dateipfad:seg.r2Path,kontextPfad:null,
            importiertAm:new Date().toISOString(),
            unterrichtsphase:[],sozialformenGeeignet:[],methodenGeeignet:[],blockId:null});
        }
        newEntries.forEach(e=>MATDB.push(e));
        await sbUpload('materialien.json',MATDB);
        const restIds=new Set(rest.map(s=>s.id));
        S.zsSegments=S.zsSegments.filter(s=>!restIds.has(s.id));
        statusEl.textContent='✓ '+newEntries.length+' Einträge angelegt';
        statusEl.style.color='var(--grn)';
        if(S.zsSegments.filter(s=>s.type!=='skip').length===0){ S.zsAusgabe=''; }
        goto(14);
      }catch(e){ statusEl.textContent='✗ '+e.message; statusEl.style.color='#dc2626'; restBtn.disabled=false; }
    };

    // Upload: gematchte Paare hochladen
    uploadBtn.onclick=async()=>{
      if(!S.zsAusgabe){
        ausgabeInp.focus();
        statusEl.textContent='⚠ Bitte zuerst den Ausgabe-Namen eingeben.';
        statusEl.style.color='#dc2626';
        return;
      }
      uploadBtn.disabled=true;
      const folder=r2safe(S.zsAusgabe);
      try{
        // Nur die gematchten Segmente hochladen
        const matchedMidSet=new Set(matches.keys());
        const matchedKidSet=new Set(matches.values());
        const matchedSegIds=new Set([...matchedMidSet,...matchedKidSet]);
        const toUpload=S.zsSegments.filter(s=>matchedSegIds.has(s.id)&&!s.r2Path);
        for(const seg of toUpload){
          const subdir=seg.type==='kontext'?'kontexte':'materialien';
          seg.r2Path=subdir+'/'+folder+'/'+r2safe(seg.name)+'.pdf';
          statusEl.textContent='Lade hoch: '+seg.name+'…';
          await r2Upload(seg.r2Path,seg.blob,'application/pdf');
        }
        // MATDB-Einträge: nach Kontext gruppieren → ein Eintrag pro Kontext
        const byKid=new Map(); // kid → [matSeg, ...]
        for(const [mid,kid] of matches){
          const matSeg=materialSegs.find(s=>s.id===mid);
          if(!byKid.has(kid)) byKid.set(kid,[]);
          if(matSeg?.r2Path) byKid.get(kid).push(matSeg);
        }
        const newEntries=[];
        for(const [kid,mats] of byKid){
          const ktxSeg=kontextSegs.find(s=>s.id===kid);
          const [first,...rest]=mats;
          const entry={id:uid(),titel:first.name,beschreibung:'',themen:[],fach:[],jahrgang:[],
            materialtyp:'Arbeitsblatt',quelle:S.zsAusgabe,dateipfad:first.r2Path,
            kontextPfad:ktxSeg?.r2Path||null,importiertAm:new Date().toISOString(),
            unterrichtsphase:[],sozialformenGeeignet:[],methodenGeeignet:[],blockId:null};
          if(rest.length) entry.dateipfadeWeitere=rest.map(m=>m.r2Path);
          newEntries.push(entry);
        }
        newEntries.forEach(e=>MATDB.push(e));
        await sbUpload('materialien.json',MATDB);
        // Gematchte Segmente entfernen (egal ob gerade oder schon früher hochgeladen)
        S.zsSegments=S.zsSegments.filter(s=>!matchedSegIds.has(s.id));
        matches.clear(); selId=null; selSide=null;
        const restliche=S.zsSegments.filter(s=>s.type!=='skip').length;
        statusEl.textContent='✓ '+newEntries.length+' Einträge angelegt'+(restliche?' · '+restliche+' gesichert, noch nicht gematcht':'');
        statusEl.style.color='var(--grn)';
        if(restliche===0){ S.zsAusgabe=''; uploadBtn.textContent='✓ Fertig'; }
        else { goto(14); }
      }catch(e){statusEl.textContent='✗ '+e.message;statusEl.style.color='#dc2626';uploadBtn.disabled=false;}
    };
  }

  const STEPS = { 0: step0, 11: step11, 12: step12, 13: step13, 14: step14 };
  goto(0);
  return ov;
}


function buildScanPanel(subTitle, renderCards, onClose) {
  const oaiKey = localStorage.getItem('oai_key');
  const p = mk('div', 'mat-scan-panel');
  if (!oaiKey) {
    const warn = tx('div', '', '⚠ Bitte zuerst den OpenAI API-Key in den Einstellungen hinterlegen.');
    warn.style.cssText = 'padding:16px;color:#d97706;';
    p.appendChild(warn); return p;
  }
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
    if (showClearAll) { const clrBtn = btn('Leeren', 'btn btn-ghost btn-xs'); clrBtn.onclick = clearFiles; labelRow.appendChild(clrBtn); }
    wrap.appendChild(labelRow);
    wrap.appendChild(tx('div', 'mat-scan-group-hint', hint));
    const zone = mk('div', 'mat-scan-drop'); zone.textContent = '📂 Bilder hierher ziehen oder klicken';
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,application/pdf'; inp.multiple = true; inp.style.display = 'none';
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

  // ── Standard-Fach wählen ─────────────────────────────────────
  const fachRow = mk('div', '');
  fachRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;';
  const fachLabel = tx('span', '', 'Fach:');
  fachLabel.style.cssText = 'font-size:13px;font-weight:600;color:var(--tx2);min-width:34px;';
  fachRow.appendChild(fachLabel);
  let defaultFach = null; // null = KI entscheidet
  const FACH_OPTS = [
    { val: null,  label: 'Auto (KI)' },
    { val: 'Bio', label: '🌿 Bio' },
    { val: 'Ch',  label: '⚗️ Ch' },
    { val: 'M',   label: '📐 M' },
  ];
  const fachBtns = FACH_OPTS.map(o => {
    const b = mk('button', 'btn btn-xs pr-chip' + (defaultFach === o.val ? ' active' : ''));
    b.textContent = o.label;
    b.onclick = () => {
      defaultFach = o.val;
      fachBtns.forEach((fb, i) => fb.className = 'btn btn-xs pr-chip' + (FACH_OPTS[i].val === defaultFach ? ' active' : ''));
    };
    fachRow.appendChild(b);
    return b;
  });
  p.appendChild(fachRow);

  const statusRow = mk('div', ''); statusRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:12px;';
  const analyzeBtn = btn('✨ Analysieren & Importieren', 'btn btn-ki btn-sm');
  analyzeBtn.disabled = true;
  const statusMsg = tx('span', 'mat-import-err', '');
  const cancelBtn = btn('Abbrechen', 'btn btn-ghost btn-sm');
  cancelBtn.onclick = () => { if (onClose) onClose(); else p.remove(); };
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
      const fachHinweis = defaultFach
        ? `- Fach wurde von der Lehrerin auf "${defaultFach}" voreingestellt → setze "fach": ["${defaultFach}"] für alle Einträge\n`
        : `- Fachwerte: "Bio", "Ch", "M"; wenn fachlich erkennbar, nie [] zurückgeben\n`;
      const prompt = `Du bist Assistent für eine Lehrerin an einem deutschen Gymnasium (NRW). Du erhältst zwei Gruppen von Bildern.\n\nGRUPPE 1 – KONTEXT (${kontextFiles.length} Bild${kontextFiles.length !== 1 ? 'er' : ''}): Titelseite, Lehrerhandreichung, Erläuterungen und Lösungsseiten. Lese daraus: Lösungen, Erwartungshorizonte, methodische Hinweise, Zeitplanung, didaktische Tipps.\n\nGRUPPE 2 – SCHÜLERMATERIALIEN (${matFiles.length} Bild${matFiles.length !== 1 ? 'er' : ''}): M1, M2, M3 usw. – die eigentlichen Arbeitsblätter.\n\nSCHEMA:\n${schemaStr}\n\nREGELN:\n- Gib ein JSON-Array aus, kein Text davor/danach\n- id Format: mat_${idBase}_1, mat_${idBase}_2 usw.\n- Erkenne selbst welche Bilder zusammengehören (z.B. M1 Seite 1+2 → ein Eintrag)\n- Kein Unterrichtseinheit-Eintrag, nur Einzelmaterialien\n- Titel: tatsächlichen Drucktitel verwenden; falls keiner erkennbar ist, Thema + Aufgabentyp bilden. Keine Rollen-Titel wie "Einführungsmaterial" oder "Erarbeitungsphase".\n- Jahrgang: zuerst explizite Angaben auf dem Material lesen ("Klasse 9/10", "Jg. 7"); nur sonst aus Niveau/Thema schätzen. SII/Oberstufe → immer ["SII"].\n${fachHinweis}- Themen stammen aus GRUPPE 2, nicht aus dem Kontext. Kontext darf Lösungen/Hinweise liefern, aber nicht die Themen des Materials überschreiben.\n- loesung, loesungHinweis, erlaeuterung vollständig aus Kontext übernehmen; wenn keine Lösung erkennbar ist: "".\n- schueleraktivitaeten, artDerGeistigenTaetigkeit, darstellungsformen: alle vollständig aufführen`;
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
      // Robust parse: sanitize + fallback
      let rawEntries;
      try {
        rawEntries = JSON.parse(match[0].replace(/[\x00-\x1F\x7F]/g, c => (c==='\n'||c==='\r'||c==='\t') ? ' ' : ''));
      } catch(_) {
        // Fallback: einzelne Objekte per Regex extrahieren
        rawEntries = [];
        const re = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/g;
        let m2;
        while ((m2 = re.exec(match[0])) !== null) {
          try { rawEntries.push(JSON.parse(m2[0])); } catch(_2) {}
        }
        if (!rawEntries.length) throw new Error('JSON-Array konnte nicht gelesen werden – bitte erneut versuchen');
      }
      if (!rawEntries.length) throw new Error('Keine Einträge generiert.');
      const truncated = choice?.finish_reason === 'length';
      const now = new Date().toISOString();
      const entries = rawEntries.map(e => {
        const normalized = normalizeMaterialResult(e);
        if (defaultFach && (!normalized.fach || !normalized.fach.length)) {
          normalized.fach = [defaultFach];
        }
        return normalized;
      });

      // ── Bilder auf R2 hochladen ──────────────────────────────────
      statusMsg.textContent = '⏳ Lade Bilder hoch…';

      // Hilfsfunktion: dataURL → Blob
      function dataURLtoBlob(dataUrl) {
        const [header, b64] = dataUrl.split(',');
        const mime = header.match(/:(.*?);/)[1];
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
      }

      // Material-Bilder hochladen
      const matFileObjects = matFiles; // die Original-File-Objekte
      const matUploadKeys = [];
      for (let i = 0; i < matFiles.length; i++) {
        const f = matFiles[i];
        const ext = f.name.split('.').pop().toLowerCase() || 'jpg';
        const key = `scan_${idBase}_mat_${i + 1}.${ext}`;
        try {
          await r2Upload(key, f, f.type || 'image/jpeg');
          matUploadKeys.push(key);
        } catch(_) { matUploadKeys.push(null); }
      }

      // Kontext-Bilder hochladen (ein gemeinsamer Satz für alle Einträge)
      const kontextUploadKeys = [];
      for (let i = 0; i < kontextFiles.length; i++) {
        const f = kontextFiles[i];
        const ext = f.name.split('.').pop().toLowerCase() || 'jpg';
        const key = `scan_${idBase}_kontext_${i + 1}.${ext}`;
        try {
          await r2Upload(key, f, f.type || 'image/jpeg');
          kontextUploadKeys.push(key);
        } catch(_) { kontextUploadKeys.push(null); }
      }

      // Hochgeladene Keys auf Einträge verteilen:
      // Bei einem Eintrag: alle Mat-Bilder → erster als r2key, Rest als dateipfadeWeitere
      // Bei mehreren Einträgen: Bilder gleichmäßig aufteilen, Kontext für alle
      const validMatKeys = matUploadKeys.filter(Boolean);
      const validKontextKeys = kontextUploadKeys.filter(Boolean);
      entries.forEach((e, i) => {
        if (!e.id) e.id = 'mat_' + Date.now() + '_' + Math.random().toString(36).slice(2,5);
        if (!e.importiertAm) e.importiertAm = now;

        if (entries.length === 1) {
          // Ein Eintrag bekommt alle Material-Bilder
          if (validMatKeys[0]) e.r2key = validMatKeys[0];
          if (validMatKeys.length > 1) e.dateipfadeWeitere = validMatKeys.slice(1);
        } else {
          // Mehrere Einträge: Bilder gleichmäßig aufteilen
          const perEntry = Math.max(1, Math.ceil(validMatKeys.length / entries.length));
          const myKeys = validMatKeys.slice(i * perEntry, (i + 1) * perEntry);
          if (myKeys[0]) e.r2key = myKeys[0];
          if (myKeys.length > 1) e.dateipfadeWeitere = myKeys.slice(1);
        }

        // Kontext für alle Einträge
        if (validKontextKeys[0]) {
          e.kontextR2key = validKontextKeys[0];
          if (validKontextKeys.length > 1) e.kontextWeitere = validKontextKeys.slice(1);
        }

        const idx = MATDB.findIndex(m => m.id === e.id);
        if (idx >= 0) MATDB[idx] = e; else MATDB.unshift(e);
      });

      clearInterval(timer);
      saveMatDB();
      clearSchuelermaterial();
      if (subTitle) subTitle.textContent = MATDB.length + ' Einträge';
      if (renderCards) renderCards();
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
  return p;
}

