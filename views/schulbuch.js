// ── Schulbücher-Datenbank ─────────────────────────────────────────
// SCHULBUCHDB wird in core/state.js deklariert

function saveSchulbuchDB() {
  sbUpload('schulbuecher.json', SCHULBUCHDB).catch(e => console.error('Schulbücher speichern fehlgeschlagen:', e));
}

function viewSchulbuecher() {
  const div = mk('div', '');
  let aktBuchId = null;

  // ── Header ────────────────────────────────────────────────────
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Schulbücher'));
  const subT = tx('div', 'c-sub', '');
  left.appendChild(subT);
  hdr.appendChild(left);
  const addBuchBtn = btn('+ Neues Buch', 'btn btn-pri btn-sm');
  hdr.appendChild(addBuchBtn);
  div.appendChild(hdr);

  const main = mk('div', '');
  div.appendChild(main);

  // ── Hilfsfunktion: Bild resize ────────────────────────────────
  function resizeImg(dataUrl, maxW, q) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const scale = img.width > maxW ? maxW / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        res(canvas.toDataURL('image/jpeg', q));
      };
      img.onerror = rej;
      img.src = dataUrl;
    });
  }

  // ── KI-Extraktion ─────────────────────────────────────────────
  async function extractAufgaben(images, statusEl) {
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) throw new Error('Kein API-Key hinterlegt (Einstellungen).');

    if (statusEl) statusEl.textContent = '⏳ Bilder vorbereiten…';
    const blocks = [];
    for (let i = 0; i < images.length; i++) {
      const resized = await resizeImg(images[i].dataUrl, 1200, 0.82);
      blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: resized.split(',')[1] } });
      if (i < images.length - 1) blocks.push({ type: 'text', text: '--- Nächste Seite ---' });
    }
    blocks.push({ type: 'text', text: `Du analysierst Seiten aus einem Schulbuch (Gymnasium, Mathematik oder Naturwissenschaften).

Extrahiere ALLE Aufgaben vollständig. Jede Teilaufgabe (a, b, c, d …) wird als eigener Eintrag erfasst.

Für jeden Eintrag:
- nr: Aufgabennummer inkl. Teilaufgabe (z.B. "7a", "7b", "7c") — wenn keine Teilaufgaben, dann nur "7"
- seite: Seitennummer falls erkennbar, sonst null
- text: VOLLSTÄNDIGER Aufgabentext, exakt wie im Buch (keine Kürzung, keine Paraphrase). Wichtig: Kein Zeilenumbruch innerhalb des text-Feldes — alles in einer Zeile, Formeln als Text (z.B. "x^2 + 3x - 4 = 0" oder "3/4 * 8").
- schwierigkeit: "einfach" | "mittel" | "anspruchsvoll" — einschätzen anhand Anforderungsniveau
- kompetenzen: Array mit Kompetenzkürzel falls erkennbar (z.B. ["UF1","K2"]), sonst []

Wichtig: Nichts weglassen. Auch Beispielaufgaben, Wiederholungsaufgaben und Knobelaufgaben erfassen.
Alle Strings müssen JSON-valide sein: keine rohen Anführungszeichen, keine Zeilenumbrüche in Stringwerten.

Antworte NUR mit validem JSON:
{"aufgaben": [{"nr":"7a","seite":35,"text":"Berechne den Umfang des Rechtecks mit a = 5 cm und b = 3 cm.","schwierigkeit":"einfach","kompetenzen":["UF1"]}]}` });

    if (statusEl) statusEl.textContent = '✨ KI analysiert Aufgaben…';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': antKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 8000, messages: [{ role: 'user', content: blocks }] }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message || res.statusText); }
    const data = await res.json();
    const raw = data.content?.[0]?.text || '';
    let jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] || '{}';

    // Reparatur 1: offene Klammern schließen (Truncation)
    const opens = (jsonStr.match(/\[/g)||[]).length - (jsonStr.match(/\]/g)||[]).length;
    const opensCurl = (jsonStr.match(/\{/g)||[]).length - (jsonStr.match(/\}/g)||[]).length;
    jsonStr += ']'.repeat(Math.max(0, opens)) + '}'.repeat(Math.max(0, opensCurl));

    // Reparatur 2: Steuerzeichen in Strings escapen (Zeilenumbrüche, Tabs)
    jsonStr = jsonStr.replace(/("(?:[^"\\]|\\.)*")|[\x00-\x1F]/g, (m, str) => {
      if (str) return str; // kompletter String-Token → unverändert
      if (m === '\n') return '\\n';
      if (m === '\r') return '\\r';
      if (m === '\t') return '\\t';
      return '';
    });

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch(e) {
      // Fallback: einzelne Aufgaben-Objekte per Regex extrahieren
      const matches = [...raw.matchAll(/\{[^{}]*"nr"\s*:\s*"[^"]*"[^{}]*\}/g)];
      if (!matches.length) throw new Error('KI-Antwort konnte nicht als JSON gelesen werden');
      parsed = { aufgaben: matches.map(m => { try { return JSON.parse(m[0]); } catch(e2) { return null; } }).filter(Boolean) };
    }

    const aufgaben = parsed.aufgaben || [];
    aufgaben.forEach(a => { a.id = uid(); });
    if (statusEl) statusEl.textContent = '✓ ' + aufgaben.length + ' Aufgaben extrahiert';
    return aufgaben;
  }

  // ── Image-Upload-Widget ───────────────────────────────────────
  function buildImageUpload(container) {
    let images = [];
    const area = mk('div', '');
    area.style.cssText = 'border:2px dashed var(--bd);border-radius:8px;padding:20px;text-align:center;cursor:pointer;color:var(--tx3);min-height:80px;display:flex;align-items:center;justify-content:center;';
    area.textContent = 'Seiten als Bilder hochladen (optional) — hierhin ziehen oder klicken';
    const fileInp = document.createElement('input');
    fileInp.type = 'file'; fileInp.accept = 'image/*'; fileInp.multiple = true; fileInp.style.display = 'none';
    const thumbsRow = mk('div', '');
    thumbsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;';

    function update() {
      area.innerHTML = '';
      if (!images.length) { area.textContent = 'Seiten als Bilder hochladen (optional) — hierhin ziehen oder klicken'; }
      else { area.appendChild(tx('span', '', images.length + ' Bild(er) ausgewählt')); }
      thumbsRow.innerHTML = '';
      images.forEach((img, i) => {
        const th = mk('img', '');
        th.src = img.dataUrl; th.style.cssText = 'width:60px;height:60px;object-fit:cover;border-radius:4px;cursor:pointer;';
        th.title = 'Klicken zum Entfernen';
        th.onclick = e => { e.stopPropagation(); images.splice(i, 1); update(); };
        thumbsRow.appendChild(th);
      });
    }

    async function addFiles(files) {
      for (const f of files) {
        const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(f); });
        images.push({ dataUrl, name: f.name });
      }
      update();
    }

    area.onclick = () => fileInp.click();
    area.ondragover = e => { e.preventDefault(); area.style.borderColor = 'var(--pri)'; };
    area.ondragleave = () => { area.style.borderColor = 'var(--bd)'; };
    area.ondrop = async e => { e.preventDefault(); area.style.borderColor = 'var(--bd)'; await addFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('image/'))); };
    fileInp.onchange = async () => { await addFiles([...fileInp.files]); fileInp.value = ''; };

    container.appendChild(area);
    container.appendChild(thumbsRow);
    container.appendChild(fileInp);
    return { getImages: () => images };
  }

  // ── Overlay-Helfer ────────────────────────────────────────────
  function openOverlay(title, maxWidth, buildFn) {
    const ov = mk('div', 'matd-overlay');
    const pan = mk('div', 'matd-panel');
    if (maxWidth) pan.style.maxWidth = maxWidth + 'px';
    const phdr = mk('div', 'matd-panel-hdr');
    phdr.appendChild(tx('span', 'matd-panel-title', title));
    const cls = btn('✕', 'btn btn-ghost btn-sm matd-close');
    const close = () => ov.remove();
    cls.onclick = close;
    phdr.appendChild(cls);
    pan.appendChild(phdr);
    ov.onclick = e => { if (e.target === ov) close(); };
    const body = mk('div', 'matd-panel-body');
    body.style.padding = '16px';
    pan.appendChild(body);
    ov.appendChild(pan);
    div.appendChild(ov);
    buildFn(body, close);
    ov.classList.add('open');
  }

  function field(label, inp) {
    const fg = mk('div', 'fg');
    fg.appendChild(tx('label', 'fl', label));
    fg.appendChild(inp);
    return fg;
  }

  // ── Neues Buch ────────────────────────────────────────────────
  function showNewBuch() {
    openOverlay('Neues Schulbuch', 480, (body, close) => {
      body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.gap = '12px';

      const titelInp = document.createElement('input'); titelInp.className = 'finp'; titelInp.placeholder = 'z.B. Lambacher Schweizer 7';
      body.appendChild(field('Titel *', titelInp));

      const verlagInp = document.createElement('input'); verlagInp.className = 'finp'; verlagInp.placeholder = 'z.B. Klett';
      body.appendChild(field('Verlag', verlagInp));

      const fachSel = document.createElement('select'); fachSel.className = 'finp';
      [['mathe','📐 Mathematik'],['bio','🌿 Biologie'],['chemie','🧪 Chemie']].forEach(([v,l]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = l; fachSel.appendChild(o);
      });
      body.appendChild(field('Fach', fachSel));

      const jgSel = document.createElement('select'); jgSel.className = 'finp';
      ['5','6','7','8','9','10','SII'].forEach(j => {
        const o = document.createElement('option'); o.value = j; o.textContent = j === 'SII' ? 'SII (Oberstufe)' : 'Jahrgang ' + j; jgSel.appendChild(o);
      });
      jgSel.value = '7';
      body.appendChild(field('Jahrgang', jgSel));

      const row = mk('div', ''); row.style.cssText = 'display:flex;gap:8px;margin-top:4px;';
      const saveBtn = btn('Anlegen', 'btn btn-pri btn-sm');
      const cancelB = btn('Abbrechen', 'btn btn-ghost btn-sm'); cancelB.onclick = close;
      row.appendChild(saveBtn); row.appendChild(cancelB);
      body.appendChild(row);

      saveBtn.onclick = () => {
        const titel = titelInp.value.trim();
        if (!titel) { alert('Bitte einen Titel eingeben.'); return; }
        const buch = { id: uid(), titel, verlag: verlagInp.value.trim() || null, fach: fachSel.value, jahrgang: jgSel.value, kapitel: [], erstellt: new Date().toISOString() };
        SCHULBUCHDB.push(buch);
        saveSchulbuchDB();
        aktBuchId = buch.id;
        close();
        renderMain();
      };
    });
  }

  // ── Kapitel hinzufügen ────────────────────────────────────────
  function showAddKapitel(buch, onDone) {
    openOverlay('Kapitel hinzufügen', 600, (body, close) => {
      body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.gap = '12px';

      const nrInp = document.createElement('input'); nrInp.className = 'finp'; nrInp.placeholder = 'z.B. 3';
      body.appendChild(field('Kapitelnummer', nrInp));

      const titelInp = document.createElement('input'); titelInp.className = 'finp'; titelInp.placeholder = 'z.B. Terme und Gleichungen';
      body.appendChild(field('Titel *', titelInp));

      const sRow = mk('div', ''); sRow.style.cssText = 'display:flex;gap:8px;';
      const vonInp = document.createElement('input'); vonInp.type = 'number'; vonInp.className = 'finp'; vonInp.placeholder = 'Seite von';
      const bisInp = document.createElement('input'); bisInp.type = 'number'; bisInp.className = 'finp'; bisInp.placeholder = 'Seite bis';
      sRow.appendChild(vonInp); sRow.appendChild(bisInp);
      const sFg = mk('div', 'fg'); sFg.appendChild(tx('label', 'fl', 'Seitenbereich (optional)')); sFg.appendChild(sRow);
      body.appendChild(sFg);

      const uploadWidget = buildImageUpload(body);

      const statusEl = tx('div', '', ''); statusEl.style.cssText = 'font-size:13px;color:var(--tx2);min-height:18px;';
      body.appendChild(statusEl);

      const row = mk('div', ''); row.style.cssText = 'display:flex;gap:8px;';
      const saveBtn = btn('Kapitel anlegen', 'btn btn-pri btn-sm');
      const cancelB = btn('Abbrechen', 'btn btn-ghost btn-sm'); cancelB.onclick = close;
      row.appendChild(saveBtn); row.appendChild(cancelB);
      body.appendChild(row);

      saveBtn.onclick = async () => {
        const titel = titelInp.value.trim();
        if (!titel) { alert('Bitte einen Titel eingeben.'); return; }
        saveBtn.disabled = true;
        let aufgaben = [];
        const imgs = uploadWidget.getImages();
        if (imgs.length) {
          try { aufgaben = await extractAufgaben(imgs, statusEl); }
          catch(e) { statusEl.textContent = 'KI-Fehler: ' + e.message; await new Promise(r => setTimeout(r, 2000)); }
        }
        const kap = {
          id: uid(),
          nr: nrInp.value.trim() || String((buch.kapitel || []).length + 1),
          titel,
          seiteVon: vonInp.value ? parseInt(vonInp.value) : null,
          seiteBis: bisInp.value ? parseInt(bisInp.value) : null,
          aufgaben,
        };
        if (!buch.kapitel) buch.kapitel = [];
        buch.kapitel.push(kap);
        saveSchulbuchDB();
        close();
        onDone();
      };
    });
  }

  // ── Seiten zu bestehendem Kapitel ─────────────────────────────
  function showAddSeiten(buch, kap, onDone) {
    openOverlay('Seiten zu "' + kap.titel + '" hinzufügen', 520, (body, close) => {
      body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.gap = '12px';

      const uploadWidget = buildImageUpload(body);

      const statusEl = tx('div', '', ''); statusEl.style.cssText = 'font-size:13px;color:var(--tx2);min-height:18px;';
      body.appendChild(statusEl);

      const row = mk('div', ''); row.style.cssText = 'display:flex;gap:8px;';
      const startBtn = btn('Aufgaben extrahieren', 'btn btn-pri btn-sm');
      const cancelB = btn('Abbrechen', 'btn btn-ghost btn-sm'); cancelB.onclick = close;
      row.appendChild(startBtn); row.appendChild(cancelB);
      body.appendChild(row);

      startBtn.onclick = async () => {
        const imgs = uploadWidget.getImages();
        if (!imgs.length) { alert('Bitte Bilder hochladen.'); return; }
        startBtn.disabled = true;
        try {
          const neueAufgaben = await extractAufgaben(imgs, statusEl);
          if (!kap.aufgaben) kap.aufgaben = [];
          kap.aufgaben.push(...neueAufgaben);
          saveSchulbuchDB();
          close();
          onDone();
        } catch(e) {
          statusEl.textContent = 'Fehler: ' + e.message;
          startBtn.disabled = false;
        }
      };
    });
  }

  // ── Eintrag bearbeiten (Kapitel oder Unterkapitel) ───────────
  function showEditEntry(overlayTitle, entry, onDone) {
    openOverlay(overlayTitle, 480, (body, close) => {
      body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.gap = '12px';

      const nrInp = document.createElement('input'); nrInp.className = 'finp';
      nrInp.value = entry.nr || '';
      body.appendChild(field('Nummer', nrInp));

      const titelInp = document.createElement('input'); titelInp.className = 'finp';
      titelInp.value = entry.titel || '';
      body.appendChild(field('Titel *', titelInp));

      const sRow = mk('div', ''); sRow.style.cssText = 'display:flex;gap:8px;';
      const vonInp = document.createElement('input'); vonInp.type = 'number'; vonInp.className = 'finp'; vonInp.placeholder = 'Seite von';
      vonInp.value = entry.seiteVon || '';
      const bisInp = document.createElement('input'); bisInp.type = 'number'; bisInp.className = 'finp'; bisInp.placeholder = 'Seite bis';
      bisInp.value = entry.seiteBis || '';
      sRow.appendChild(vonInp); sRow.appendChild(bisInp);
      const sFg = mk('div', 'fg'); sFg.appendChild(tx('label', 'fl', 'Seitenbereich')); sFg.appendChild(sRow);
      body.appendChild(sFg);

      const row = mk('div', ''); row.style.cssText = 'display:flex;gap:8px;margin-top:4px;';
      const saveBtn = btn('Speichern', 'btn btn-pri btn-sm');
      const cancelB = btn('Abbrechen', 'btn btn-ghost btn-sm'); cancelB.onclick = close;
      row.appendChild(saveBtn); row.appendChild(cancelB);
      body.appendChild(row);

      saveBtn.onclick = () => {
        const titel = titelInp.value.trim();
        if (!titel) { alert('Bitte einen Titel eingeben.'); return; }
        entry.nr = nrInp.value.trim() || entry.nr;
        entry.titel = titel;
        entry.seiteVon = vonInp.value ? parseInt(vonInp.value) : null;
        entry.seiteBis = bisInp.value ? parseInt(bisInp.value) : null;
        saveSchulbuchDB();
        close();
        onDone();
      };
    });
  }

  // ── Unterkapitel hinzufügen ───────────────────────────────────
  function showAddUnterkapitel(buch, kap, onDone) {
    openOverlay('Unterkapitel hinzufügen', 600, (body, close) => {
      body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.gap = '12px';

      const nrInp = document.createElement('input'); nrInp.className = 'finp'; nrInp.placeholder = 'z.B. 3.1';
      body.appendChild(field('Nummer', nrInp));

      const titelInp = document.createElement('input'); titelInp.className = 'finp'; titelInp.placeholder = 'z.B. Terme aufstellen';
      body.appendChild(field('Titel *', titelInp));

      const sRow = mk('div', ''); sRow.style.cssText = 'display:flex;gap:8px;';
      const vonInp = document.createElement('input'); vonInp.type = 'number'; vonInp.className = 'finp'; vonInp.placeholder = 'Seite von';
      const bisInp = document.createElement('input'); bisInp.type = 'number'; bisInp.className = 'finp'; bisInp.placeholder = 'Seite bis';
      sRow.appendChild(vonInp); sRow.appendChild(bisInp);
      const sFg = mk('div', 'fg'); sFg.appendChild(tx('label', 'fl', 'Seitenbereich (optional)')); sFg.appendChild(sRow);
      body.appendChild(sFg);

      const uploadWidget = buildImageUpload(body);

      const statusEl = tx('div', '', ''); statusEl.style.cssText = 'font-size:13px;color:var(--tx2);min-height:18px;';
      body.appendChild(statusEl);

      const row = mk('div', ''); row.style.cssText = 'display:flex;gap:8px;';
      const saveBtn = btn('Unterkapitel anlegen', 'btn btn-pri btn-sm');
      const cancelB = btn('Abbrechen', 'btn btn-ghost btn-sm'); cancelB.onclick = close;
      row.appendChild(saveBtn); row.appendChild(cancelB);
      body.appendChild(row);

      saveBtn.onclick = async () => {
        const titel = titelInp.value.trim();
        if (!titel) { alert('Bitte einen Titel eingeben.'); return; }
        saveBtn.disabled = true;
        let aufgaben = [];
        const imgs = uploadWidget.getImages();
        if (imgs.length) {
          try { aufgaben = await extractAufgaben(imgs, statusEl); }
          catch(e) { statusEl.textContent = 'KI-Fehler: ' + e.message; await new Promise(r => setTimeout(r, 2000)); }
        }
        const ukap = {
          id: uid(),
          nr: nrInp.value.trim() || (kap.nr + '.' + ((kap.unterkapitel || []).length + 1)),
          titel,
          seiteVon: vonInp.value ? parseInt(vonInp.value) : null,
          seiteBis: bisInp.value ? parseInt(bisInp.value) : null,
          aufgaben,
        };
        if (!kap.unterkapitel) kap.unterkapitel = [];
        kap.unterkapitel.push(ukap);
        saveSchulbuchDB();
        close();
        onDone();
      };
    });
  }

  // ── Aufgaben-Liste (wiederverwendbar) ─────────────────────────
  function buildAufgabenListe(aufgaben) {
    const aufgList = mk('div', '');
    aufgList.style.cssText = 'display:flex;flex-direction:column;gap:3px;max-height:240px;overflow-y:auto;';
    aufgaben.forEach(aufg => {
      const arow = mk('div', '');
      arow.style.cssText = 'display:flex;gap:8px;align-items:baseline;padding:4px 8px;background:var(--surf2);border-radius:5px;font-size:13px;';
      arow.appendChild(tx('strong', '', 'Aufg. ' + aufg.nr));
      if (aufg.seite) arow.appendChild(tx('span', 'matc-jg', 'S. ' + aufg.seite));
      if (aufg.schwierigkeit) {
        const sw = tx('span', 'matc-typ-badge', aufg.schwierigkeit);
        const sc = { einfach: { bg: '#dcfce7', tx: '#166534' }, mittel: { bg: '#dbeafe', tx: '#1e40af' }, anspruchsvoll: { bg: '#fce7f3', tx: '#9d174d' } }[aufg.schwierigkeit];
        if (sc) { sw.style.background = sc.bg; sw.style.color = sc.tx; }
        arow.appendChild(sw);
      }
      const textSpan = tx('span', '', aufg.text || '');
      textSpan.style.cssText = 'flex:1;color:var(--tx2);';
      arow.appendChild(textSpan);
      aufgList.appendChild(arow);
    });
    return aufgList;
  }

  // ── Buch-Liste ────────────────────────────────────────────────
  function countAufgaben(buch) {
    return (buch.kapitel || []).reduce((n, k) =>
      n + (k.aufgaben || []).length +
      (k.unterkapitel || []).reduce((m, u) => m + (u.aufgaben || []).length, 0), 0);
  }

  function renderBuchListe() {
    subT.textContent = SCHULBUCHDB.length + ' Bücher';
    main.innerHTML = '';
    if (!SCHULBUCHDB.length) {
      const empty = tx('div', '', 'Noch keine Schulbücher angelegt. Klicke „Neues Buch" um zu beginnen.');
      empty.style.cssText = 'padding:40px;color:var(--tx3);text-align:center;';
      main.appendChild(empty); return;
    }
    const grid = mk('div', 'matc-grid');
    SCHULBUCHDB.forEach(buch => {
      const card = mk('div', 'matc-card');
      const kap = (buch.kapitel || []).length;
      const aufg = countAufgaben(buch);

      const topRow = mk('div', 'matc-top-row');
      if (buch.verlag) topRow.appendChild(tx('span', 'matc-quelle', buch.verlag));
      topRow.appendChild(tx('span', 'matc-fach-prominent', fachIcon(buch.fach)));
      card.appendChild(topRow);

      card.appendChild(tx('div', 'matc-title', buch.titel || '–'));

      const metaRow = mk('div', 'matc-meta');
      if (buch.jahrgang) metaRow.appendChild(tx('span', 'matc-jg', 'Jg. ' + buch.jahrgang));
      if (kap) metaRow.appendChild(tx('span', 'matc-klp-count', kap + ' Kapitel'));
      if (aufg) metaRow.appendChild(tx('span', 'matc-klp-count', aufg + ' Aufgaben'));
      card.appendChild(metaRow);

      const delBtn = btn('✕', 'matc-del');
      delBtn.title = 'Löschen';
      delBtn.onclick = e => {
        e.stopPropagation();
        if (!confirm('"' + buch.titel + '" löschen?')) return;
        SCHULBUCHDB = SCHULBUCHDB.filter(b => b.id !== buch.id);
        saveSchulbuchDB(); renderMain();
      };
      card.appendChild(delBtn);
      card.onclick = () => { aktBuchId = buch.id; renderMain(); };
      grid.appendChild(card);
    });
    main.appendChild(grid);
  }

  // ── Buch-Detail ───────────────────────────────────────────────
  function renderBuchDetail(buchId) {
    const buch = SCHULBUCHDB.find(b => b.id === buchId);
    if (!buch) { aktBuchId = null; renderMain(); return; }
    main.innerHTML = '';
    subT.textContent = buch.titel;

    // Zurück
    const backRow = mk('div', '');
    backRow.style.cssText = 'margin-bottom:16px;';
    const backBtn = btn('← Alle Bücher', 'btn btn-ghost btn-sm');
    backBtn.onclick = () => { aktBuchId = null; renderMain(); };
    backRow.appendChild(backBtn);
    main.appendChild(backRow);

    // Buch-Info
    const infoCard = mk('div', 'card');
    const infoBody = mk('div', 'card-body');
    infoBody.style.cssText = 'display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;';
    infoBody.appendChild(tx('span', '', fachIcon(buch.fach)));
    infoBody.appendChild(tx('strong', '', buch.titel));
    if (buch.verlag) infoBody.appendChild(tx('span', 'c-sub', buch.verlag));
    if (buch.jahrgang) infoBody.appendChild(tx('span', 'matc-jg', 'Jg. ' + buch.jahrgang));
    infoCard.appendChild(infoBody);
    main.appendChild(infoCard);

    // Kapitel-Abschnitt
    const kapSec = mk('div', '');
    kapSec.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:20px 0 8px 0;';
    kapSec.appendChild(tx('div', 'card-title', 'Kapitel'));
    const addKapBtn = btn('+ Kapitel hinzufügen', 'btn btn-pri btn-sm');
    kapSec.appendChild(addKapBtn);
    main.appendChild(kapSec);

    const kapitelList = mk('div', '');
    kapitelList.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    main.appendChild(kapitelList);

    function renderKapitel() {
      kapitelList.innerHTML = '';
      if (!(buch.kapitel || []).length) {
        const empty = tx('div', '', 'Noch keine Kapitel. Füge das erste Kapitel hinzu.');
        empty.style.cssText = 'padding:20px;color:var(--tx3);text-align:center;';
        kapitelList.appendChild(empty); return;
      }
      buch.kapitel.forEach(kap => {
        const card = mk('div', 'card');
        const body = mk('div', 'card-body');

        // Kapitel-Header
        const hrow = mk('div', '');
        hrow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;';
        hrow.appendChild(tx('strong', '', 'Kap. ' + kap.nr + ': ' + kap.titel));
        if (kap.seiteVon && kap.seiteBis) hrow.appendChild(tx('span', 'matc-jg', 'S. ' + kap.seiteVon + '–' + kap.seiteBis));
        const aufgCount = (kap.aufgaben || []).length;
        hrow.appendChild(tx('span', 'matc-klp-count', aufgCount + ' Aufgaben'));

        const addUkapBtn = btn('+ Unterkapitel', 'btn btn-ghost btn-xs');
        addUkapBtn.style.marginLeft = 'auto';
        addUkapBtn.onclick = () => showAddUnterkapitel(buch, kap, renderKapitel);
        hrow.appendChild(addUkapBtn);

        const moreBtn = btn('+ Seiten', 'btn btn-ghost btn-xs');
        moreBtn.onclick = () => showAddSeiten(buch, kap, renderKapitel);
        hrow.appendChild(moreBtn);

        const editKapBtn = btn('✎', 'matc-del');
        editKapBtn.title = 'Bearbeiten'; editKapBtn.style.color = 'var(--tx2)';
        editKapBtn.onclick = () => showEditEntry('Kapitel bearbeiten', kap, renderKapitel);
        hrow.appendChild(editKapBtn);

        const delKapBtn = btn('✕', 'matc-del');
        delKapBtn.onclick = () => {
          if (!confirm('Kapitel "' + kap.titel + '" löschen?')) return;
          buch.kapitel = buch.kapitel.filter(k => k.id !== kap.id);
          saveSchulbuchDB(); renderKapitel();
        };
        hrow.appendChild(delKapBtn);
        body.appendChild(hrow);

        // Direkte Aufgaben am Kapitel
        if (aufgCount) body.appendChild(buildAufgabenListe(kap.aufgaben));

        // Unterkapitel
        const ukaps = kap.unterkapitel || [];
        if (ukaps.length) {
          const uList = mk('div', '');
          uList.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:10px;padding-left:16px;border-left:3px solid var(--bd);';
          ukaps.forEach(ukap => {
            const uCard = mk('div', '');
            uCard.style.cssText = 'background:var(--surf2);border-radius:6px;padding:8px 10px;';

            const uHrow = mk('div', '');
            uHrow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;';
            uHrow.appendChild(tx('strong', '', ukap.nr + ' ' + ukap.titel));
            if (ukap.seiteVon && ukap.seiteBis) uHrow.appendChild(tx('span', 'matc-jg', 'S. ' + ukap.seiteVon + '–' + ukap.seiteBis));
            const uAufgCount = (ukap.aufgaben || []).length;
            uHrow.appendChild(tx('span', 'matc-klp-count', uAufgCount + ' Aufg.'));

            const uMoreBtn = btn('+ Seiten', 'btn btn-ghost btn-xs');
            uMoreBtn.style.marginLeft = 'auto';
            uMoreBtn.onclick = () => showAddSeiten(buch, ukap, renderKapitel);
            uHrow.appendChild(uMoreBtn);

            const uEditBtn = btn('✎', 'matc-del');
            uEditBtn.title = 'Bearbeiten'; uEditBtn.style.color = 'var(--tx2)';
            uEditBtn.onclick = () => showEditEntry('Unterkapitel bearbeiten', ukap, renderKapitel);
            uHrow.appendChild(uEditBtn);

            const uDelBtn = btn('✕', 'matc-del');
            uDelBtn.onclick = () => {
              if (!confirm('Unterkapitel "' + ukap.titel + '" löschen?')) return;
              kap.unterkapitel = kap.unterkapitel.filter(u => u.id !== ukap.id);
              saveSchulbuchDB(); renderKapitel();
            };
            uHrow.appendChild(uDelBtn);
            uCard.appendChild(uHrow);

            if (uAufgCount) uCard.appendChild(buildAufgabenListe(ukap.aufgaben));
            uList.appendChild(uCard);
          });
          body.appendChild(uList);
        }

        card.appendChild(body);
        kapitelList.appendChild(card);
      });
    }

    renderKapitel();
    addKapBtn.onclick = () => showAddKapitel(buch, renderKapitel);
  }

  // ── Haupt-Render ──────────────────────────────────────────────
  function renderMain() {
    if (aktBuchId) renderBuchDetail(aktBuchId);
    else renderBuchListe();
  }

  addBuchBtn.onclick = showNewBuch;
  renderMain();
  return div;
}
