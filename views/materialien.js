// ── Materialien-Datenbank ─────────────────────────────────────────
function viewMaterialien() {
  const div = mk('div', '');

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Materialdatenbank'));
  left.appendChild(tx('div', 'c-sub', MATDB.length + ' Einträge'));
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
    const panel = mk('div', 'mat-import-panel');
    panel.appendChild(tx('div', 'mat-import-hint',
      'JSON-Eintrag oder Array einfügen (aus KI-generiertem Schema):'));
    const ta = document.createElement('textarea');
    ta.className = 'mat-import-ta'; ta.placeholder = '{ "id": "...", "titel": "...", ... }';
    panel.appendChild(ta);
    const actions = mk('div', ''); actions.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
    const errMsg = tx('span', 'mat-import-err', '');
    const addBtn = btn('Hinzufügen', 'btn btn-pri btn-sm');
    addBtn.onclick = () => {
      errMsg.textContent = '';
      let parsed;
      try { parsed = JSON.parse(ta.value.trim()); } catch { errMsg.textContent = 'Ungültiges JSON.'; return; }
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      const invalid = entries.filter(e => !e.id || !e.titel);
      if (invalid.length) { errMsg.textContent = 'Jeder Eintrag braucht mindestens "id" und "titel".'; return; }
      const now = new Date().toISOString();
      entries.forEach(e => {
        if (!e.importiertAm) e.importiertAm = now;
        const existing = MATDB.findIndex(m => m.id === e.id);
        if (existing >= 0) MATDB[existing] = e; else MATDB.unshift(e);
      });
      saveMatDB();
      panel.remove();
      S.view = 'materialien'; render();
    };
    const cancelBtn2 = btn('Abbrechen', 'btn btn-ghost btn-sm');
    cancelBtn2.onclick = () => panel.remove();
    actions.appendChild(addBtn); actions.appendChild(cancelBtn2); actions.appendChild(errMsg);
    panel.appendChild(actions);
    div.insertBefore(panel, div.children[1]);
  };

  const scanBtn = btn('📸 Aus Bild', 'btn btn-pri btn-sm');
  scanBtn.onclick = () => {
    const existing = div.querySelector('.mat-scan-panel');
    if (existing) { existing.remove(); return; }

    const oaiKey = localStorage.getItem('oai_key');
    if (!oaiKey) { alert('Bitte zuerst den OpenAI API-Key in den Einstellungen hinterlegen.'); return; }

    const panel = mk('div', 'mat-scan-panel');

    function makeDropzone(label, hint) {
      const wrap = mk('div', 'mat-scan-group');
      wrap.appendChild(tx('div', 'mat-scan-group-label', label));
      wrap.appendChild(tx('div', 'mat-scan-group-hint', hint));
      const zone = mk('div', 'mat-scan-drop');
      zone.textContent = '📂 Bilder hierher ziehen oder klicken';
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.style.display = 'none';
      zone.onclick = () => inp.click();
      zone.ondragover = e => { e.preventDefault(); zone.classList.add('drag-over'); };
      zone.ondragleave = () => zone.classList.remove('drag-over');
      const preview = mk('div', 'mat-scan-preview');
      let files = [];
      function addFiles(newFiles) {
        files = [...files, ...Array.from(newFiles)];
        renderPreview();
        updateBtn();
      }
      function renderPreview() {
        preview.innerHTML = '';
        files.forEach((f, i) => {
          const thumb = mk('div', 'mat-scan-thumb');
          const img = document.createElement('img'); img.src = URL.createObjectURL(f); img.className = 'mat-scan-img';
          const rm = mk('button', 'mat-scan-rm'); rm.textContent = '✕';
          rm.onclick = () => { files.splice(i, 1); renderPreview(); updateBtn(); };
          thumb.appendChild(img); thumb.appendChild(rm); preview.appendChild(thumb);
        });
        zone.textContent = files.length ? '' : '📂 Bilder hierher ziehen oder klicken';
      }
      zone.ondrop = e => { e.preventDefault(); zone.classList.remove('drag-over'); addFiles(e.dataTransfer.files); };
      inp.onchange = () => addFiles(inp.files);
      wrap.appendChild(zone); wrap.appendChild(inp); wrap.appendChild(preview);
      return { wrap, getFiles: () => files };
    }

    const { wrap: w1, getFiles: getKontext } = makeDropzone(
      '📋 Kontext',
      'Titelseite, Lehrerhandreichung, Erläuterungen & Lösungsseiten – GPT-4o liest daraus Lösungen und Hinweise für die Schülermaterialien'
    );
    const { wrap: w2, getFiles: getSchuelermaterial } = makeDropzone(
      '📚 Schülermaterialien',
      'M1, M2, M3 … – die eigentlichen Arbeitsblätter und Versuchsanleitungen'
    );

    const groupsWrap = mk('div', 'mat-scan-groups');
    groupsWrap.appendChild(w1); groupsWrap.appendChild(w2);
    panel.appendChild(groupsWrap);

    const statusRow = mk('div', ''); statusRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:12px;';
    const analyzeBtn = btn('✨ Analysieren & Importieren', 'btn btn-pri btn-sm');
    analyzeBtn.disabled = true;
    const statusMsg = tx('span', 'mat-import-err', '');
    const cancelBtn = btn('Abbrechen', 'btn btn-ghost btn-sm'); cancelBtn.onclick = () => panel.remove();
    statusRow.appendChild(analyzeBtn); statusRow.appendChild(cancelBtn); statusRow.appendChild(statusMsg);
    panel.appendChild(statusRow);

    function updateBtn() {
      analyzeBtn.disabled = getSchuelermaterial().length === 0;
    }

    analyzeBtn.onclick = async () => {
      const kontextFiles = getKontext();
      const matFiles = getSchuelermaterial();
      if (!matFiles.length) return;
      const totalFiles = kontextFiles.length + matFiles.length;
      analyzeBtn.disabled = true; statusMsg.style.color = 'var(--tx3)';
      let elapsed = 0;
      const timer = setInterval(() => { elapsed++; statusMsg.textContent = '⏳ Analysiere ' + totalFiles + ' Bild(er)… ' + elapsed + ' Sek.'; }, 1000);
      statusMsg.textContent = '⏳ Analysiere ' + totalFiles + ' Bild(er)… 0 Sek.';

      try {
        const schema = await sbDownload('schema.json');
        const schemaStr = JSON.stringify(schema, null, 2);

        // Bilder als base64 – erst Kontext, dann Schülermaterialien
        const toImgContent = f => new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = e => res({ type: 'image_url', image_url: { url: e.target.result, detail: 'high' } });
          reader.onerror = rej;
          reader.readAsDataURL(f);
        });
        const kontextImgs = await Promise.all(kontextFiles.map(toImgContent));
        const matImgs     = await Promise.all(matFiles.map(toImgContent));

        const idBase = Date.now();
        const prompt = `Du bist Assistent für eine Lehrerin an einem deutschen Gymnasium (NRW). Du erhältst zwei Gruppen von Bildern.

GRUPPE 1 – KONTEXT (${kontextFiles.length} Bild${kontextFiles.length !== 1 ? 'er' : ''}): Titelseite, Lehrerhandreichung, Erläuterungen und Lösungsseiten. Lese daraus: Lösungen, Erwartungshorizonte, methodische Hinweise, Zeitplanung, didaktische Tipps. Verwende diese Informationen, um die Felder loesung, loesungHinweis und erlaeuterung in den Einträgen der Schülermaterialien zu füllen.

GRUPPE 2 – SCHÜLERMATERIALIEN (${matFiles.length} Bild${matFiles.length !== 1 ? 'er' : ''}): M1, M2, M3 usw. – die eigentlichen Arbeitsblätter. Erstelle für jedes eigenständige Material einen vollständigen Datenbankeintrag.

SCHEMA (halte dich exakt daran):
${schemaStr}

REGELN – ALLGEMEIN:
- Gib ein JSON-Array aus, direkt importierbar, kein Text davor/danach
- Jeder Eintrag braucht eine eindeutige id (Format: mat_${idBase}_1, mat_${idBase}_2 usw.)
- Erkenne selbst, welche Bilder zusammengehören (z.B. „M1 Seite 1" und „M1 Seite 2" → ein Eintrag). Erstelle einen Eintrag pro eigenständigem Material, nicht pro Bild
- Gruppe 2 enthält ${matFiles.length} Bild${matFiles.length !== 1 ? 'er' : ''} – daraus können mehr oder weniger Einträge entstehen, je nachdem wie viele eigenständige Materialien erkennbar sind
- Erstelle KEINEN Unterrichtseinheit-Eintrag (materialtyp "Unterrichtseinheit"), nur Einzelmaterialien und ggf. Lehrerhandreichungen

REGELN – TITEL:
- Wenn Materialien zu einer Einheit gehören: "Einheitstitel – M1", "Einheitstitel – M2", Lehrerhandreichung: "Einheitstitel – LH"
- Einheitstitel aus der Titelseite oder dem Kopf der Materialien entnehmen
- rolleImKontext: knapper inhaltlicher Untertitel (was das Material konkret verlangt/zeigt)

REGELN – JAHRGANG (sehr wichtig, lies genau):
- Lies Jahrgangsstufe aus dem Material, der Titelseite oder dem Kopf der Seiten – niemals raten
- "Sekundarstufe I" oder "SI" ohne weitere Angabe → stattdessen die konkret genannte Klasse suchen (z.B. "Klasse 9/10" → ["9","10"])
- "Sekundarstufe II" oder "SII" ohne weitere Spezifikation → ["EF","Q1","Q2"]
- Konkrete SII-Angabe: "EF" → ["EF"], "Q1" → ["Q1"], "Q2" → ["Q2"], "Q1/Q2" → ["Q1","Q2"]
- Konkrete SI-Angabe: "Klasse 9/10" → ["9","10"], "Jahrgang 8" → ["8"]
- Im Zweifel lieber die ganze Stufe angeben als falsch raten

REGELN – LÖSUNGEN (aus Gruppe 1 übernehmen):
- loesung: Erwartungshorizont und Lösungstabellen VOLLSTÄNDIG übertragen – Tabelleninhalt Zeile für Zeile, nichts weglassen
- loesungHinweis: Seitenangabe aus der Lehrerhandreichung, z.B. "LH S. 15–16"
- erlaeuterung: Methodische Lehrerhinweise VOLLSTÄNDIG – Methodik, Zeitplanung, didaktische Empfehlungen, typische Schülerfehler

REGELN – INHALTE (niemals kürzen oder zusammenfassen):
- schueleraktivitaeten: alle konkreten Tätigkeiten aus dem Material aufführen, so spezifisch wie möglich
- artDerGeistigenTaetigkeit: alle kognitiven Prozesse vollständig benennen (Beobachten, Vergleichen, Hypothesen bilden, Analysieren, Transferieren usw.)
- darstellungsformen: alle vorkommenden Darstellungsformen einzeln aufführen (Sachtext, Versuchsanleitung, Tabelle, Schemazeichnung usw.)
- voraussetzungenFachlich: alle fachlichen Voraussetzungen konkret benennen, nicht weglassen
- voraussetzungenMethodisch: alle methodischen Voraussetzungen konkret benennen, nicht weglassen
- themen: alle inhaltlichen Themen und Unterthemen des Materials aufführen
- Fach, Methoden, Sozialformen sorgfältig aus dem Bildinhalt ableiten – nicht raten
- Bei Lehrerhandreichungen: materialtyp "Lehrerhandreichung", materialnummer "LH"`;

        // Kontext zuerst senden, dann Schülermaterialien
        const contentParts = [{ type: 'text', text: prompt }];
        if (kontextImgs.length) {
          contentParts.push({ type: 'text', text: '=== GRUPPE 1: KONTEXT ===' });
          contentParts.push(...kontextImgs);
        }
        contentParts.push({ type: 'text', text: '=== GRUPPE 2: SCHÜLERMATERIALIEN ===' });
        contentParts.push(...matImgs);

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + oaiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o',
            max_tokens: 16000,
            messages: [{ role: 'user', content: contentParts }]
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'OpenAI-Fehler');
        const choice = data.choices?.[0];
        const text = choice?.message?.content || '';
        const match = text.match(/\[[\s\S]*\]/);
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
        if (truncated) {
          statusMsg.style.color = '#d97706';
          statusMsg.textContent = `⚠ Nur ${entries.length} von ${matFiles.length} Materialien erhalten – ggf. nicht alle importiert.`;
          analyzeBtn.disabled = false;
        } else {
          panel.remove();
          S.view = 'materialien'; render();
        }

      } catch(e) {
        clearInterval(timer);
        statusMsg.style.color = '#dc2626'; statusMsg.textContent = 'Fehler: ' + e.message;
        analyzeBtn.disabled = false;
      }
    };

    div.insertBefore(panel, div.children[1]);
  };

  hdrBtns.appendChild(schemaBtn); hdrBtns.appendChild(scanBtn); hdrBtns.appendChild(importBtn);
  hdr.appendChild(hdrBtns);
  div.appendChild(hdr);

  // ── Suchzeile ────────────────────────────────────────────────
  const sf = mk('div', 'card');
  const sb2 = mk('div', 'card-body');
  sb2.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:center;';

  const si = document.createElement('input');
  si.type = 'text'; si.placeholder = 'Suche nach Titel, Fach, Thema…';
  si.className = 'finp'; si.style.flex = '1';

  const fachSel = document.createElement('select');
  fachSel.className = 'finp'; fachSel.style.width = 'auto';
  [['', 'Alle Fächer'], ['Mathematik', 'Mathematik'], ['Chemie', 'Chemie'], ['Biologie', 'Biologie']].forEach(([v, l]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = l;
    fachSel.appendChild(o);
  });

  const typSel = document.createElement('select');
  typSel.className = 'finp'; typSel.style.width = 'auto';
  const typen = ['', ...new Set(MATDB.map(m => m.materialtyp).filter(Boolean))];
  typen.forEach(t => {
    const o = document.createElement('option'); o.value = t; o.textContent = t || 'Alle Typen';
    typSel.appendChild(o);
  });

  const jgSel = document.createElement('select');
  jgSel.className = 'finp'; jgSel.style.width = 'auto';
  const jahrgaenge = ['', ...new Set(MATDB.flatMap(m => m.jahrgang || []).filter(Boolean)).values()].sort((a, b) => +a - +b);
  jahrgaenge.forEach(j => {
    const o = document.createElement('option'); o.value = j; o.textContent = j ? 'Jg. ' + j : 'Alle Jg.';
    jgSel.appendChild(o);
  });

  const einheitSel = document.createElement('select');
  einheitSel.className = 'finp'; einheitSel.style.width = 'auto';
  const einheiten = MATDB.filter(m => m.materialtyp === 'Unterrichtseinheit');
  const eoEmpty = document.createElement('option'); eoEmpty.value = ''; eoEmpty.textContent = 'Alle Einheiten';
  einheitSel.appendChild(eoEmpty);
  einheiten.forEach(e => {
    const o = document.createElement('option'); o.value = e.id; o.textContent = e.titel;
    einheitSel.appendChild(o);
  });

  sb2.appendChild(si); sb2.appendChild(fachSel); sb2.appendChild(jgSel); sb2.appendChild(typSel); sb2.appendChild(einheitSel);
  sf.appendChild(sb2);
  div.appendChild(sf);

  // ── Materialliste ─────────────────────────────────────────────
  const listCard = mk('div', 'card');
  const listBody = mk('div', 'mat-list-grid'); listBody.style.padding = '0';

  function filteredList() {
    const q = si.value.toLowerCase().trim();
    const fach = fachSel.value;
    const typ = typSel.value;
    const jg = jgSel.value;
    const einheitId = einheitSel.value;
    return MATDB.filter(m => {
      if (fach && !(m.fach || []).includes(fach)) return false;
      if (typ && m.materialtyp !== typ) return false;
      if (jg && !(m.jahrgang || []).includes(jg)) return false;
      if (einheitId && m.einheitId !== einheitId && m.id !== einheitId) return false;
      if (q && !m.titel.toLowerCase().includes(q) &&
               !(m.themen || []).join(' ').toLowerCase().includes(q) &&
               !(m.beschreibung || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderList() {
    listBody.innerHTML = '';
    const hits = filteredList();
    if (!hits.length) {
      const empty = tx('div', '', 'Keine Einträge gefunden.');
      empty.style.cssText = 'padding:20px;color:var(--tx3);text-align:center;';
      listBody.appendChild(empty); return;
    }
    hits.forEach(mat => {
      const row = mk('div', 'mat-db-row');

      const needsReview = mat.review && Object.values(mat.review).some(r => r.needsReview);

      const top = mk('div', 'mat-db-top');
      const titleWrap = mk('div', 'mat-db-title-wrap');
      const fachIcon = (mat.fach || []).map(f => {
        const key = Object.keys(FACH_ICONS).find(k => fachLabel(k) === f || k === f);
        return key ? FACH_ICONS[key] : '';
      }).filter(Boolean).join('');
      if (fachIcon) titleWrap.appendChild(tx('span', 'mat-db-fach-icon', fachIcon));
      titleWrap.appendChild(tx('span', 'mat-db-title', mat.titel));
      if (mat.rolleImKontext) titleWrap.appendChild(tx('span', 'mat-db-rolle', mat.rolleImKontext));
      if (needsReview) {
        const badge = tx('span', 'mat-review-badge', '⚠');
        badge.title = 'Felder prüfen';
        titleWrap.appendChild(badge);
      }
      top.appendChild(titleWrap);

      const meta = tx('div', 'mat-db-meta',
        [(mat.fach || []).join(', '), (mat.jahrgang || []).length ? 'Jg. ' + (mat.jahrgang || []).join('/') : '', mat.materialtyp].filter(Boolean).join(' · ')
      );
      top.appendChild(meta);
      row.appendChild(top);

      const rowDelBtn = btn('🗑', 'btn btn-danger btn-xs mat-row-del');
      rowDelBtn.title = 'Eintrag löschen';
      rowDelBtn.onclick = e => {
        e.stopPropagation();
        if (!confirm('„' + mat.titel + '" löschen?')) return;
        MATDB = MATDB.filter(m => m.id !== mat.id);
        saveMatDB();
        row.remove();
      };
      top.appendChild(rowDelBtn);

      row.onclick = e => { if (!e.target.closest('.mat-detail')) openMatDetail(mat, row); };
      listBody.appendChild(row);
    });
  }

  si.oninput = renderList;
  fachSel.onchange = renderList;
  typSel.onchange = renderList;
  jgSel.onchange = renderList;
  einheitSel.onchange = renderList;

  listCard.appendChild(listBody);
  div.appendChild(listCard);
  renderList();

  return div;
}

function saveMatDB() {
  sbUpload('materialien.json', MATDB).catch(e => console.error('Speichern fehlgeschlagen:', e));
}

async function klpKiVorschlag(mat, onResult) {
  const key = localStorage.getItem('ant_key');
  if (!key) {
    alert('Bitte zuerst den Anthropic API-Key in den Einstellungen speichern.');
    return;
  }
  const faecher = (mat.fach || []).map(f => f.toLowerCase());
  const kandidaten = KLPDB.filter(e => !faecher.length || faecher.includes(e.fach.toLowerCase()));
  const klpText = kandidaten.map(e =>
    `ID: ${e.id}\nJg: ${e.jahrgang} | IF: ${e.inhaltsfeld} | Codes: ${e.kompetenzcodes.join(', ')}\n${e.beschreibung}`
  ).join('\n\n');

  const prompt = `Du bist Assistent für NRW-Lehrkräfte. Analysiere das folgende Unterrichtsmaterial und wähle die am besten passenden KLP-Kompetenzen aus.

Material:
- Titel: ${mat.titel || '–'}
- Fach: ${(mat.fach || []).join(', ') || '–'}
- Jahrgang: ${(mat.jahrgang || []).join(', ') || '–'}
- Themen: ${(mat.themen || []).join(', ') || '–'}
- Beschreibung: ${mat.beschreibung || '–'}

Wähle 3–8 passende KLP-Einträge aus. Antworte NUR mit einem JSON-Array der IDs, z.B.: ["BIO_SI_IF1_001","BIO_SI_IF2_003"]

KLP-Einträge:
${klpText}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error((await res.json())?.error?.message || res.statusText);
  const data = await res.json();
  const text = data.content?.[0]?.text || '[]';
  const ids = JSON.parse(text.match(/\[.*\]/s)?.[0] || '[]');
  onResult(ids.filter(id => KLPDB.some(e => e.id === id) && !mat.kompetenzenKLP.includes(id)));
}

function klpRow(mat, detail, row) {
  if (!mat.kompetenzenKLP) mat.kompetenzenKLP = [];

  const labelRow = mk('div', ''); labelRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';
  const r = mk('div', 'mat-detail-row');
  r.appendChild(tx('span', 'mat-detail-label', 'KLP-Kompetenzen'));

  const wrap = mk('div', 'klp-selector');

  function rebuildChips() {
    wrap.innerHTML = '';

    // Chips für bereits verknüpfte Kompetenzen
    const chipsDiv = mk('div', 'klp-chips');
    (mat.kompetenzenKLP || []).forEach(id => {
      const entry = KLPDB.find(e => e.id === id);
      const chip = mk('div', 'klp-chip');
      const label = entry
        ? `[${entry.kompetenzcodes.join(', ')}] ${entry.beschreibung}`
        : id;
      chip.textContent = label;
      chip.title = entry ? entry.beschreibung : id;
      const x = tx('span', 'klp-chip-x', '×');
      x.onclick = () => {
        mat.kompetenzenKLP = mat.kompetenzenKLP.filter(i => i !== id);
        saveMatDB();
        rebuildChips();
      };
      chip.appendChild(x);
      chipsDiv.appendChild(chip);
    });
    wrap.appendChild(chipsDiv);

    // Suchfeld
    const searchWrap = mk('div', 'klp-search-wrap');
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'mat-edit-inp';
    inp.placeholder = 'Kompetenz suchen…';
    searchWrap.appendChild(inp);

    const dd = mk('div', 'klp-dd');
    dd.style.display = 'none';
    searchWrap.appendChild(dd);

    function showDropdown(q) {
      dd.innerHTML = '';
      const faecher = (mat.fach || []).map(f => f.toLowerCase());

      if (q.length < 2 && !faecher.length) {
        const hint = tx('div', 'klp-dd-hint', 'Mind. 2 Zeichen eingeben…');
        dd.appendChild(hint);
        dd.style.display = 'block';
        return;
      }

      let hits = KLPDB.filter(e => {
        if (mat.kompetenzenKLP.includes(e.id)) return false;
        if (faecher.length && !faecher.includes(e.fach.toLowerCase())) return false;
        if (q.length >= 2) {
          const txt = (e.beschreibung + ' ' + e.inhaltsfeld + ' ' + e.kompetenzcodes.join(' ')).toLowerCase();
          if (!txt.includes(q.toLowerCase())) return false;
        }
        return true;
      });

      if (!hits.length) {
        const none = tx('div', 'klp-dd-hint', 'Keine Treffer.');
        dd.appendChild(none);
        dd.style.display = 'block';
        return;
      }

      if (q.length < 2) {
        const info = tx('div', 'klp-dd-hint', hits.length + ' Kompetenzen – tippe zum Eingrenzen');
        dd.appendChild(info);
        dd.style.display = 'block';
        return;
      }

      // Group by inhaltsfeld
      const grouped = {};
      hits.forEach(e => {
        if (!grouped[e.inhaltsfeld]) grouped[e.inhaltsfeld] = [];
        grouped[e.inhaltsfeld].push(e);
      });

      Object.entries(grouped).forEach(([ifName, entries]) => {
        const grpHdr = tx('div', 'klp-dd-group', ifName);
        dd.appendChild(grpHdr);
        entries.forEach(entry => {
          const item = mk('div', 'klp-dd-item');
          const codes = tx('span', 'klp-dd-codes', entry.kompetenzcodes.join(', '));
          const desc = tx('span', 'klp-dd-desc', entry.beschreibung);
          item.appendChild(codes);
          item.appendChild(desc);
          item.title = `Jg. ${entry.jahrgang} · ${entry.inhaltsfeld}`;
          item.onmousedown = e => {
            e.preventDefault();
            mat.kompetenzenKLP.push(entry.id);
            if (mat.review?.kompetenzenKLP) mat.review.kompetenzenKLP.needsReview = false;
            saveMatDB();
            inp.value = '';
            dd.style.display = 'none';
            rebuildChips();
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

    // KI-Vorschlag-Button
    const kiBtn = btn('✨ KI-Vorschlag', 'btn btn-ghost btn-xs klp-ki-btn');
    kiBtn.onclick = async () => {
      kiBtn.textContent = '…';
      kiBtn.disabled = true;
      try {
        await klpKiVorschlag(mat, ids => {
          if (!ids.length) { kiBtn.textContent = 'Keine Vorschläge'; setTimeout(() => rebuildChips(), 1500); return; }
          // Vorschläge als separate Chips anzeigen
          const suggestDiv = mk('div', 'klp-suggestions');
          const hint = tx('div', 'klp-suggest-hint', `✨ ${ids.length} Vorschlag${ids.length !== 1 ? 'schläge' : ''} – klicke zum Übernehmen:`);
          suggestDiv.appendChild(hint);
          ids.forEach(id => {
            const entry = KLPDB.find(e => e.id === id);
            if (!entry) return;
            const chip = mk('div', 'klp-chip klp-chip-suggest');
            chip.textContent = `[${entry.kompetenzcodes.join(', ')}] ${entry.beschreibung.slice(0, 70)}${entry.beschreibung.length > 70 ? '…' : ''}`;
            chip.title = entry.beschreibung;
            chip.onclick = () => {
              mat.kompetenzenKLP.push(id);
              if (mat.review?.kompetenzenKLP) mat.review.kompetenzenKLP.needsReview = false;
              saveMatDB();
              chip.remove();
              if (!suggestDiv.querySelectorAll('.klp-chip-suggest').length) suggestDiv.remove();
              rebuildChips();
            };
            suggestDiv.appendChild(chip);
          });
          const addAll = btn('Alle übernehmen', 'btn btn-pri btn-xs');
          addAll.style.marginTop = '6px';
          addAll.onclick = () => {
            ids.forEach(id => { if (!mat.kompetenzenKLP.includes(id)) mat.kompetenzenKLP.push(id); });
            if (mat.review?.kompetenzenKLP) mat.review.kompetenzenKLP.needsReview = false;
            saveMatDB();
            suggestDiv.remove();
            rebuildChips();
          };
          suggestDiv.appendChild(addAll);
          wrap.appendChild(suggestDiv);
        });
      } catch (e) {
        kiBtn.textContent = '⚠ Fehler';
        console.error(e);
        setTimeout(() => rebuildChips(), 2000);
        return;
      }
      kiBtn.textContent = '✨ KI-Vorschlag';
      kiBtn.disabled = false;
    };
    wrap.appendChild(kiBtn);

    r.appendChild(wrap);
  }

  rebuildChips();
  detail.appendChild(r);
}

function openMatDetail(mat, row) {
  const existing = row.querySelector('.mat-detail');
  if (existing) { existing.remove(); row.classList.remove('expanded'); return; }
  row.classList.add('expanded');

  const detail = mk('div', 'mat-detail');
  detail.onclick = e => e.stopPropagation();

  // Löschen-Button
  const delBar = mk('div', 'mat-detail-delbar');
  const delBtn = btn('🗑 Eintrag löschen', 'btn btn-danger btn-xs');
  delBtn.onclick = () => {
    if (!confirm('„' + mat.titel + '" aus der Datenbank löschen?')) return;
    MATDB = MATDB.filter(m => m.id !== mat.id);
    saveMatDB();
    row.remove();
  };
  delBar.appendChild(delBtn);
  detail.appendChild(delBar);

  const needsAny = mat.review && Object.values(mat.review).some(rv => rv?.needsReview);
  if (needsAny) {
    const reviewBar = mk('div', 'mat-review-bar');
    reviewBar.appendChild(tx('span', '', '⚠ Einige Felder wurden zur Prüfung markiert.'));
    const clearBtn = btn('✓ Alles geprüft', 'btn btn-pri btn-xs');
    clearBtn.onclick = () => {
      Object.values(mat.review).forEach(rv => { if (rv) rv.needsReview = false; });
      saveMatDB();
      reviewBar.remove();
      row.querySelector('.mat-review-badge')?.remove();
      detail.querySelectorAll('.needs-review').forEach(el => el.classList.remove('needs-review'));
      detail.querySelectorAll('.mat-review-inline').forEach(el => el.remove());
    };
    reviewBar.appendChild(clearBtn);
    detail.appendChild(reviewBar);
  }

  function editRow(label, get, set, isArea, reviewKey) {
    const needsCheck = reviewKey && mat.review?.[reviewKey]?.needsReview;
    const r = mk('div', 'mat-detail-row' + (needsCheck ? ' needs-review' : ''));
    const lbl = tx('span', 'mat-detail-label', label);
    if (needsCheck) {
      const hint = tx('span', 'mat-review-inline', '⚠');
      hint.title = mat.review[reviewKey].reason || 'Bitte prüfen';
      lbl.appendChild(hint);
    }
    r.appendChild(lbl);
    const val = get();
    function onSave(v) {
      set(v);
      if (reviewKey && mat.review?.[reviewKey]) {
        mat.review[reviewKey].needsReview = false;
        r.classList.remove('needs-review');
        r.querySelector('.mat-review-inline')?.remove();
        const stillAny = Object.values(mat.review).some(rv => rv.needsReview);
        if (!stillAny) row.querySelector('.mat-review-badge')?.remove();
      }
      saveMatDB();
    }
    if (isArea) {
      const ta = document.createElement('textarea');
      ta.className = 'mat-edit-inp'; ta.value = val;
      ta.onblur = () => onSave(ta.value);
      r.appendChild(ta);
    } else {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'mat-edit-inp'; inp.value = val;
      inp.onblur = () => onSave(inp.value);
      r.appendChild(inp);
    }
    detail.appendChild(r);
  }

  function arrGet(key) { return (mat[key] || []).join(', '); }
  function arrSet(key) { return v => { mat[key] = v.split(',').map(s => s.trim()).filter(Boolean); }; }

  // ── Teil von (Unterrichtseinheit) ────────────────────────────
  if (mat.einheitId) {
    const einheit = MATDB.find(m => m.id === mat.einheitId);
    if (einheit) {
      const r = mk('div', 'mat-detail-row mat-einheit-ref');
      r.appendChild(tx('span', 'mat-detail-label', 'Teil von'));
      const link = tx('span', 'mat-einheit-link', '📦 ' + einheit.titel);
      link.onclick = () => {
        const einheitRow = [...document.querySelectorAll('.mat-db-row')].find(el =>
          el.querySelector('.mat-db-title')?.textContent === einheit.titel
        );
        if (einheitRow) {
          einheitRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          openMatDetail(einheit, einheitRow);
        }
      };
      r.appendChild(link);
      detail.appendChild(r);
    }
  }

  editRow('Titel',                () => mat.titel || '',              v => { mat.titel = v; row.querySelector('.mat-db-title').textContent = v; }, false, 'titel');
  editRow('Fach',                 () => arrGet('fach'),               arrSet('fach'),           false, 'fach');
  editRow('Jahrgang',             () => arrGet('jahrgang'),           arrSet('jahrgang'),       false, 'jahrgang');
  editRow('Themen',               () => arrGet('themen'),             arrSet('themen'));
  editRow('Materialtyp',          () => mat.materialtyp || '',        v => { mat.materialtyp = v; });
  editRow('Beschreibung',         () => mat.beschreibung || '',       v => { mat.beschreibung = v; }, true);
  editRow('Materialnummer',       () => mat.materialnummer || '',     v => { mat.materialnummer = v; });
  editRow('Rolle im Kontext',     () => mat.rolleImKontext || '',     v => { mat.rolleImKontext = v; });

  // Optional-Toggle
  const optR = mk('div', 'mat-detail-row');
  optR.appendChild(tx('span', 'mat-detail-label', 'Optional'));
  const optChk = document.createElement('input');
  optChk.type = 'checkbox'; optChk.checked = !!mat.optional; optChk.style.marginTop = '3px';
  optChk.onchange = () => { mat.optional = optChk.checked; saveMatDB(); };
  optR.appendChild(optChk);
  detail.appendChild(optR);

  editRow('Unterrichtsphase',       () => arrGet('unterrichtsphase'),           arrSet('unterrichtsphase'),           false, 'unterrichtsphase');
  editRow('Sozialform geeignet',    () => arrGet('sozialformenGeeignet'),        arrSet('sozialformenGeeignet'));
  editRow('Sozialform weniger',     () => arrGet('sozialformenWenigerGeeignet'), arrSet('sozialformenWenigerGeeignet'));
  editRow('Methoden geeignet',      () => arrGet('methodenGeeignet'),            arrSet('methodenGeeignet'));
  editRow('Methoden weniger',       () => arrGet('methodenWenigerGeeignet'),     arrSet('methodenWenigerGeeignet'));
  editRow('Schüleraktivitäten',     () => arrGet('schueleraktivitaeten'),        arrSet('schueleraktivitaeten'));
  editRow('Art der Tätigkeit',      () => arrGet('artDerGeistigenTaetigkeit'),   arrSet('artDerGeistigenTaetigkeit'));
  editRow('Darstellungsformen',     () => arrGet('darstellungsformen'),          arrSet('darstellungsformen'));
  editRow('Fachliche Voraussetzung',() => arrGet('voraussetzungenFachlich'),     arrSet('voraussetzungenFachlich'));
  editRow('Method. Voraussetzung',  () => arrGet('voraussetzungenMethodisch'),   arrSet('voraussetzungenMethodisch'));
  // ── KLP-Kompetenzen (strukturierter Selector) ─────────────────
  klpRow(mat, detail, row);
  editRow('Kognit. Beanspruchung',  () => mat.kognitiveBeanspruchung || '',      v => { mat.kognitiveBeanspruchung = v; });
  editRow('Sprachl. Anforderungen', () => mat.sprachlicheAnforderungen || '',    v => { mat.sprachlicheAnforderungen = v; });
  editRow('Lautstärke',             () => mat.lautstaerke || '',                 v => { mat.lautstaerke = v; });
  editRow('Differenzierung',        () => arrGet('differenzierungsformen'),      arrSet('differenzierungsformen'));
  editRow('Anmerkungen',            () => mat.persoenlicheAnmerkungen || '',   v => { mat.persoenlicheAnmerkungen = v; }, true);

  // ── Lösung & Erläuterung ──────────────────────────────────────
  if (mat.materialtyp !== 'Unterrichtseinheit') {
    const loeSecHdr = mk('div', 'mat-loe-sec-hdr');
    loeSecHdr.textContent = 'Lösung & Erläuterung';
    detail.appendChild(loeSecHdr);
    editRow('Lösung (Text)',     () => mat.loesung || '',        v => { mat.loesung = v; },        true);
    editRow('Lösung (Verweis)', () => mat.loesungHinweis || '', v => { mat.loesungHinweis = v; }, false);
    editRow('Erläuterung',      () => mat.erlaeuterung || '',   v => { mat.erlaeuterung = v; },   true);
  }

  // ── Enthaltene Materialien (nur bei Unterrichtseinheit) ───────
  if (mat.materialtyp === 'Unterrichtseinheit') {
    const members = MATDB
      .filter(m => m.einheitId === mat.id)
      .sort((a, b) => (a.materialnummer || '').localeCompare(b.materialnummer || '', undefined, { numeric: true }));

    const secHdr = mk('div', 'mat-einheit-sec-hdr');
    secHdr.appendChild(tx('span', '', '📋 Enthaltene Materialien'));
    secHdr.appendChild(tx('span', 'mat-einheit-count', members.length + ' Einträge'));
    detail.appendChild(secHdr);

    if (!members.length) {
      const hint = tx('div', '', 'Noch keine Materialien mit dieser Einheit verknüpft (einheitId setzen).');
      hint.style.cssText = 'font-size:12px;color:var(--tx3);padding:6px 0;';
      detail.appendChild(hint);
    } else {
      const tbl = mk('div', 'mat-einheit-tbl');
      members.forEach(m => {
        const mRow = mk('div', 'mat-einheit-member');
        const nr = tx('span', 'mat-einheit-nr', m.materialnummer || '–');
        const titel = tx('span', 'mat-einheit-titel', m.titel);
        const rolle = tx('span', 'mat-einheit-rolle', m.rolleImKontext || '');
        const badges = mk('span', '');
        if (m.optional) badges.appendChild(tx('span', 'mat-einheit-badge opt', 'optional'));
        if (m.materialtyp === 'Lehrerhandreichung') badges.appendChild(tx('span', 'mat-einheit-badge lh', 'LH'));
        mRow.appendChild(nr); mRow.appendChild(titel); mRow.appendChild(rolle); mRow.appendChild(badges);
        mRow.onclick = () => {
          const mDomRow = [...document.querySelectorAll('.mat-db-row')].find(el =>
            el.querySelector('.mat-db-title')?.textContent === m.titel
          );
          if (mDomRow) { mDomRow.scrollIntoView({ behavior: 'smooth', block: 'center' }); openMatDetail(m, mDomRow); }
        };
        tbl.appendChild(mRow);
      });
      detail.appendChild(tbl);
    }
  }

  if (mat.importiertAm) {
    const ts = new Date(mat.importiertAm);
    const label = ts.toLocaleDateString('de-DE') + ', ' + ts.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const tsRow = tx('div', 'mat-detail-ts', 'Importiert am ' + label);
    detail.appendChild(tsRow);
  }

  row.appendChild(detail);
}
