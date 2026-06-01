// ── Schulbücher-Datenbank ─────────────────────────────────────────
// SCHULBUCHDB wird in core/state.js deklariert

// Zeichenweiser JSON-String-Reparateur (Steuerzeichen in Strings escapen)
function repairJsonStrings(s) {
  let out = '';
  let inStr = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') { out += ch + (s[i+1] || ''); i += 2; continue; }
      if (ch === '"') { inStr = false; out += ch; i++; continue; }
      if (ch === '\n') { out += '\\n'; i++; continue; }
      if (ch === '\r') { out += '\\r'; i++; continue; }
      if (ch === '\t') { out += '\\t'; i++; continue; }
      if (ch.charCodeAt(0) < 0x20) { i++; continue; }
    } else {
      if (ch === '"') inStr = true;
    }
    out += ch;
    i++;
  }
  return out;
}

function robustJsonParse(raw) {
  // Erstes { finden und per Bracket-Counting (String-aware) das Ende bestimmen
  function extractTopObject(text) {
    const s = text.indexOf('{');
    if (s < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = s; i < text.length; i++) {
      const ch = text[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return text.slice(s, i + 1); }
    }
    return text.slice(s); // Truncation — schließende Klammern fehlen
  }

  const extracted = extractTopObject(raw);
  if (!extracted) throw new Error('Kein JSON in der Antwort');

  // Offene Klammern schließen (Truncation)
  let jsonStr = extracted;
  const opens = (jsonStr.match(/\[/g)||[]).length - (jsonStr.match(/\]/g)||[]).length;
  const opensCurl = (jsonStr.match(/\{/g)||[]).length - (jsonStr.match(/\}/g)||[]).length;
  jsonStr += ']'.repeat(Math.max(0, opens)) + '}'.repeat(Math.max(0, opensCurl));
  jsonStr = repairJsonStrings(jsonStr);

  try { return JSON.parse(jsonStr); }
  catch(e) {
    // Fallback: alle Top-Level-Objekte einzeln extrahieren
    const items = [];
    let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') { if (depth === 0) start = i; depth++; }
      else if (ch === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          const objStr = repairJsonStrings(raw.slice(start, i + 1));
          try { const o = JSON.parse(objStr); if (o.typ || o.nr || o.titel) items.push(o); } catch(e2) {}
          start = -1;
        }
      }
    }
    if (items.length) return { aufgaben: items };
    throw new Error('KI-Antwort konnte nicht als JSON gelesen werden');
  }
}

function sortAufgaben(aufgaben) {
  aufgaben.sort((a, b) => {
    if ((a.seite || 0) !== (b.seite || 0)) return (a.seite || 0) - (b.seite || 0);
    const an = parseInt(a.nr) || 0, bn = parseInt(b.nr) || 0;
    if (an !== bn) return an - bn;
    return (a.nr || '').localeCompare(b.nr || '', 'de', { numeric: true });
  });
}

function saveSchulbuchDB() {
  sbUpload('schulbuecher.json', SCHULBUCHDB).catch(e => console.error('Schulbücher speichern fehlgeschlagen:', e));
}

function viewSchulbuecher() {
  const div = mk('div', '');
  let aktBuchId = null;

  // ── Header ────────────────────────────────────────────────────
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Bücher & Sammlungen'));
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

  // ── UI-Helpers ────────────────────────────────────────────────
  function makeStatusEl() {
    const el = tx('div', '', '');
    el.style.cssText = 'font-size:13px;color:var(--tx2);min-height:18px;';
    return el;
  }

  function makeBtnRow(saveLabel, onCancel) {
    const row = mk('div', ''); row.style.cssText = 'display:flex;gap:8px;margin-top:4px;';
    const saveBtn = btn(saveLabel, 'btn btn-pri btn-sm');
    const cancelB = btn('Abbrechen', 'btn btn-ghost btn-sm'); cancelB.onclick = onCancel;
    row.appendChild(saveBtn); row.appendChild(cancelB);
    return { row, saveBtn };
  }

  const FACH_OPTS = [['mathe','📐 Mathematik'],['bio','🌿 Biologie'],['chemie','🧪 Chemie']];
  const JG_OPTS   = ['5','6','7','8','9','10','SII'];

  function makeFachSelect(selected) {
    const sel = document.createElement('select'); sel.className = 'finp';
    FACH_OPTS.forEach(([v,l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; if (v === selected) o.selected = true; sel.appendChild(o); });
    return sel;
  }

  function makeJahrgangSelect(selected) {
    const sel = document.createElement('select'); sel.className = 'finp';
    JG_OPTS.forEach(j => { const o = document.createElement('option'); o.value = j; o.textContent = j === 'SII' ? 'SII (Oberstufe)' : 'Jahrgang ' + j; if (j === selected) o.selected = true; sel.appendChild(o); });
    return sel;
  }

  // ── KI-Extraktion ─────────────────────────────────────────────
  const KI_PROMPT_VERBATIM = `Du liest Seiten aus einem Unterrichtsmaterial (Arbeitsblätter, Schülerversuche, Lehrerhandreichungen).

Übertrage den VOLLSTÄNDIGEN Text jeder Seite wortwörtlich. Fasse nichts zusammen, lasse nichts weg.

Antworte in diesem Format — eine Seite = ein Block:
=== Seite 8 | M1 – Korrosion auf dem Meer ===
[vollständiger Originaltext der Seite, genau so wie er auf der Seite steht]
GRAFIK: [kurze Beschreibung von Fotos/Abbildungen, oder "keine"]

=== Seite 9 | M2 – Die Korrosion von Eisen ===
[vollständiger Text]
GRAFIK: keine

Regeln:
- Nach === kommt zuerst die Seitenzahl, dann | dann der Titel/die Überschrift der Seite
- Text vollständig und wörtlich übernehmen
- Ignoriere Kopf- und Fußzeilen: Website-URLs, Seitennummern im Stil "7 von 22", Verlagsangaben, Druckdaten, Hash-Codes — diese nicht ins inhalt-Feld aufnehmen
- Keine JSON, kein Markdown, nur dieses Format`;

  const KI_PROMPT_AUFGABEN = `Du analysierst Seiten aus einem Schulbuch oder Unterrichtsmaterial (Gymnasium, Mathematik oder Naturwissenschaften).

Jede Seite enthält entweder Aufgaben, Lehrtext/Erklärungen oder beides. Erfasse BEIDES vollständig.

── TYP 1: AUFGABEN ──
Für jede Aufgabe / Teilaufgabe ein Eintrag mit typ:"aufgabe":
- nr: Aufgabennummer inkl. Teilaufgabe (z.B. "7a") — bei Hauptaufgabe ohne Buchstabe (z.B. "7")
- seite: Seitennummer falls erkennbar, sonst null
- aufgabenstellung: gemeinsame Aufgabenstellung bei Hauptaufgaben-Eintrag, sonst null
- text: NUR der individuelle Teil bei Teilaufgaben (die Formel/Frage), bei Einzelaufgaben der volle Text. Immer einzeilig, Formeln als Text (z.B. "2x - 1 = -0,5x + 2").
- schwierigkeit: Kreissymbol exakt: "○" einfach, "◒" mittel, "●" anspruchsvoll
- grafik: Beschreibung des visuellen Elements (1 Satz), null wenn keins
- kompetenzen: Array z.B. ["UF1","K2"], sonst []

── TYP 2: LEHRTEXT ──
Für jeden Abschnitt mit Erklärungen, Definitionen, Musterlösungen oder einführenden Texten ein Eintrag mit typ:"lehrtext":
- seite: Seitennummer
- thema: Thema des Abschnitts (z.B. "Gleichsetzungsverfahren")
- inhalt: Detaillierte Beschreibung — WAS erklärt wird, WIE (welche Methode/Schritte), welche Beispiele verwendet werden, welcher didaktische Ansatz (z.B. Schülerdialog, Musterlösung, Definition). Mindestens 3-5 Sätze. Formeln als Text. Diese Beschreibung soll einen späteren Vergleich mit anderen Schulbüchern ermöglichen.
- grafik: Beschreibung visueller Elemente (Koordinatensysteme, Diagramme), null wenn keine

Alle Strings JSON-valide: einzeilig, keine rohen Anführungszeichen.

Antworte NUR mit validem JSON:
{"aufgaben": [
  {"typ":"lehrtext","seite":145,"thema":"Gleichsetzungsverfahren","inhalt":"Einführung über Schülerdialog (Anna/Sina) mit Koordinatengraph. Erklärt den Ablauf in drei Schritten: 1) beide Gleichungen nach derselben Variable auflösen, 2) gleichsetzen, 3) nach x auflösen und y berechnen. Musterlösung: I: y-2x=-1, II: 2y+x=4, Umformen zu Ia: y=2x-1, IIa: y=-0,5x+2, Gleichsetzen ergibt x=1,2 und y=1,4.","grafik":"Koordinatensystem mit zwei sich schneidenden Geraden y=2x-1 und y=-0,5x+2"},
  {"typ":"aufgabe","nr":"1","seite":146,"aufgabenstellung":null,"text":"Löse das Gleichungssystem grafisch und rechnerisch.","schwierigkeit":"○","grafik":null,"kompetenzen":["UF1"]}
]}`;

  async function callKI(blocks, maxTokens) {
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) throw new Error('Kein API-Key hinterlegt (Einstellungen).');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': antKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, messages: [{ role: 'user', content: blocks }] }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message || res.statusText); }
    const data = await res.json();
    return data.content?.[0]?.text || '';
  }

  function imgBlock(dataUrl) {
    return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: dataUrl.split(',')[1] } };
  }

  async function extractAufgaben(images, statusEl, buchTyp) {
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) throw new Error('Kein API-Key hinterlegt (Einstellungen).');

    const verbatim = buchTyp === 'sammlung' || buchTyp === 'aufgabenpool';
    const prompt = verbatim ? KI_PROMPT_VERBATIM : KI_PROMPT_AUFGABEN;
    const BATCH = 4;
    const allAufgaben = [];

    for (let start = 0; start < images.length; start += BATCH) {
      const batch = images.slice(start, start + BATCH);
      const end = Math.min(start + BATCH, images.length);
      if (statusEl) statusEl.textContent = `⏳ Lese Seite ${start + 1}–${end} von ${images.length}…`;

      // Alle Bilder im Batch parallel resizen
      const resized = await Promise.all(batch.map(img => resizeImg(img.dataUrl, 1200, 0.82)));
      const blocks = [];
      resized.forEach((r, i) => {
        blocks.push(imgBlock(r));
        if (i < batch.length - 1) blocks.push({ type: 'text', text: '--- Nächste Seite ---' });
      });
      blocks.push({ type: 'text', text: prompt });

      const raw = await callKI(blocks, 8000);
      let batchAufgaben = [];

      if (verbatim) {
        // Trennzeichen-Format parsen: === Seite X | Titel ===
        const blocks2 = raw.split(/\n(?===)/);
        for (const block of blocks2) {
          const headerMatch = block.match(/^===\s*Seite\s*(\d+)\s*\|\s*(.+?)\s*===/i);
          if (!headerMatch) continue;
          const seite = parseInt(headerMatch[1]) || null;
          const thema = headerMatch[2].trim();
          const rest = block.slice(block.indexOf('===', 3) + 3).trim();
          const grafikMatch = rest.match(/\nGRAFIK:\s*(.+)$/im);
          const grafik = grafikMatch ? (grafikMatch[1].trim().toLowerCase() === 'keine' ? null : grafikMatch[1].trim()) : null;
          const inhalt = grafikMatch ? rest.slice(0, grafikMatch.index).trim() : rest;
          if (inhalt) batchAufgaben.push({ typ: 'lehrtext', seite, thema, inhalt, grafik });
        }
        if (!batchAufgaben.length) throw new Error('Keine Einträge erkannt (Seiten ' + (start+1) + '–' + end + ')');
      } else {
        let parsed;
        try {
          parsed = robustJsonParse(raw);
        } catch(e) {
          throw new Error('KI-Antwort konnte nicht als JSON gelesen werden (Seiten ' + (start+1) + '–' + end + ')');
        }
        batchAufgaben = parsed.aufgaben || [];
      }

      batchAufgaben.forEach(a => { a.id = uid(); });
      allAufgaben.push(...batchAufgaben);
    }

    if (statusEl) statusEl.textContent = '✓ ' + allAufgaben.length + ' Einträge aus ' + images.length + ' Seiten extrahiert';
    return allAufgaben;
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
  const BUCH_TYPEN = [
    { val: 'schulbuch',      icon: '📚', label: 'Schulbuch' },
    { val: 'sammlung',       icon: '📂', label: 'Materialsammlung' },
    { val: 'aufgabenpool',   icon: '🗃',  label: 'Aufgabenpool' },
  ];
  function buchTypIcon(typ) { return (BUCH_TYPEN.find(t => t.val === typ) || BUCH_TYPEN[0]).icon; }
  function buchTypLabel(typ) { return (BUCH_TYPEN.find(t => t.val === typ) || BUCH_TYPEN[0]).label; }

  function showNewBuch() {
    openOverlay('Neues Buch / Sammlung', 480, (body, close) => {
      body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.gap = '12px';

      const typSel = document.createElement('select'); typSel.className = 'finp';
      BUCH_TYPEN.forEach(t => {
        const o = document.createElement('option'); o.value = t.val; o.textContent = t.icon + ' ' + t.label; typSel.appendChild(o);
      });
      body.appendChild(field('Typ', typSel));

      const titelInp = document.createElement('input'); titelInp.className = 'finp'; titelInp.placeholder = 'z.B. Lambacher Schweizer 7';
      body.appendChild(field('Titel *', titelInp));

      const verlagInp = document.createElement('input'); verlagInp.className = 'finp'; verlagInp.placeholder = 'z.B. Klett';
      body.appendChild(field('Verlag', verlagInp));

      const fachSel = makeFachSelect(null);
      body.appendChild(field('Fach', fachSel));

      const jgSel = makeJahrgangSelect('7');
      body.appendChild(field('Jahrgang', jgSel));

      const { row, saveBtn } = makeBtnRow('Anlegen', close);
      body.appendChild(row);

      saveBtn.onclick = () => {
        const titel = titelInp.value.trim();
        if (!titel) { alert('Bitte einen Titel eingeben.'); return; }
        const buch = { id: uid(), typ: typSel.value, titel, verlag: verlagInp.value.trim() || null, fach: fachSel.value, jahrgang: jgSel.value, kapitel: [], erstellt: new Date().toISOString() };
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

      const statusEl = makeStatusEl();
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
          try { aufgaben = await extractAufgaben(imgs, statusEl, buch.typ); }
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
        sortAufgaben(kap.aufgaben);
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

      const statusEl = makeStatusEl();
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
          const neueAufgaben = await extractAufgaben(imgs, statusEl, buch.typ);
          if (!kap.aufgaben) kap.aufgaben = [];
          kap.aufgaben.push(...neueAufgaben);
          sortAufgaben(kap.aufgaben);
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

  // ── Inhaltsverzeichnis importieren ───────────────────────────
  function showInhaltsverzeichnis(buch, onDone) {
    openOverlay('Kapitelstruktur aus Inhaltsverzeichnis', 560, (body, close) => {
      body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.gap = '12px';

      const hint = tx('div', '', 'Lade ein Foto des Inhaltsverzeichnisses hoch. Die KI legt alle Kapitel und Unterkapitel automatisch an.');
      hint.style.cssText = 'font-size:13px;color:var(--tx2);line-height:1.5;';
      body.appendChild(hint);

      const uploadWidget = buildImageUpload(body);
      const statusEl = makeStatusEl();
      body.appendChild(statusEl);

      // Vorschau der erkannten Struktur
      const previewWrap = mk('div', '');
      previewWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto;';
      body.appendChild(previewWrap);

      const btnRow = mk('div', ''); btnRow.style.cssText = 'display:flex;gap:8px;margin-top:4px;';
      const kiBtn = btn('✨ KI liest aus', 'btn btn-pri btn-sm');
      const cancelB = btn('Abbrechen', 'btn btn-ghost btn-sm'); cancelB.onclick = close;
      btnRow.appendChild(kiBtn); btnRow.appendChild(cancelB);
      body.appendChild(btnRow);

      let erkannteStruktur = null;

      kiBtn.onclick = async () => {
        const imgs = uploadWidget.getImages();
        if (!imgs.length) { alert('Bitte ein Bild hochladen.'); return; }
        const antKey = localStorage.getItem('ant_key');
        if (!antKey) { alert('Kein API-Key hinterlegt.'); return; }

        kiBtn.disabled = true; kiBtn.textContent = '⏳ Liest…';
        statusEl.textContent = 'KI liest das Inhaltsverzeichnis…';
        previewWrap.innerHTML = '';

        const resizedImgs = await Promise.all(imgs.map(img => resizeImg(img.dataUrl, 1200, 0.85)));
        const blocks = [
          ...resizedImgs.map(imgBlock),
          { type: 'text', text: `Lies dieses Inhaltsverzeichnis aus.
Antworte NUR mit Zeilen im Format: nr|titel|seiteVon|seiteBis
Eine Zeile pro Kapitel/Unterkapitel. Keine Erklärungen, kein Markdown, keine Leerzeilen.

Beispiel:
1|Einführung|6|24
1.1|Was ist Chemie?|6|12
1.2|Stoffe und Teilchen|13|24
2|Atome und Moleküle|25|48
2.1|Atombau|25|36

Regeln:
- nr: exakt wie im Buch (z.B. "3" oder "3.2" oder "A")
- seiteVon/seiteBis: Zahlen aus dem Verzeichnis, leer lassen wenn nicht angegeben
- Erfasse ALLE Kapitel und Unterkapitel vollständig` },
        ];

        try {
          const raw = await callKI(blocks, 4000);

          // Parse Pipe-Format: nr|titel|seiteVon|seiteBis
          const lines = raw.split('\n').map(l => l.trim()).filter(l => l && l.includes('|'));
          if (!lines.length) throw new Error('Keine Einträge erkannt.\n\nKI-Antwort: ' + raw.slice(0, 300));

          // Kapitel-Hierarchie aufbauen: Punkt in nr = Unterkapitel
          const kapitelMap = {};
          const kapitel = [];
          for (const line of lines) {
            const parts = line.split('|');
            const nr = (parts[0] || '').trim();
            const titel = (parts[1] || '').trim();
            const seiteVon = parseInt(parts[2]) || null;
            const seiteBis = parseInt(parts[3]) || null;
            if (!nr || !titel) continue;
            const dotCount = (nr.match(/\./g) || []).length;
            if (dotCount === 0) {
              // Hauptkapitel
              const k = { nr, titel, seiteVon, seiteBis, unterkapitel: [] };
              kapitelMap[nr] = k;
              kapitel.push(k);
            } else {
              // Unterkapitel — Eltern-Nr ist alles vor dem letzten Punkt
              const parentNr = nr.slice(0, nr.lastIndexOf('.'));
              const u = { nr, titel, seiteVon, seiteBis };
              if (kapitelMap[parentNr]) {
                kapitelMap[parentNr].unterkapitel.push(u);
              } else {
                // Elternteil nicht gefunden → als Hauptkapitel anhängen
                const k = { nr, titel, seiteVon, seiteBis, unterkapitel: [] };
                kapitelMap[nr] = k;
                kapitel.push(k);
              }
            }
          }

          if (!kapitel.length) throw new Error('Keine Kapitel erkannt.');

          erkannteStruktur = kapitel;
          statusEl.textContent = '✓ ' + kapitel.length + ' Kapitel erkannt — Vorschau:';

          // Vorschau anzeigen
          previewWrap.innerHTML = '';
          kapitel.forEach(k => {
            const row = mk('div', '');
            row.style.cssText = 'padding:5px 8px;background:var(--surf2);border-radius:4px;font-size:12px;';
            const seiten = k.seiteVon ? ' (S. ' + k.seiteVon + (k.seiteBis ? '–' + k.seiteBis : '') + ')' : '';
            row.appendChild(tx('div', '', k.nr + ' ' + k.titel + seiten));
            (k.unterkapitel || []).forEach(u => {
              const sub = mk('div', '');
              sub.style.cssText = 'padding-left:16px;color:var(--tx2);margin-top:2px;';
              const useiten = u.seiteVon ? ' (S. ' + u.seiteVon + (u.seiteBis ? '–' + u.seiteBis : '') + ')' : '';
              sub.textContent = u.nr + ' ' + u.titel + useiten;
              row.appendChild(sub);
            });
            previewWrap.appendChild(row);
          });

          // Speichern-Button
          const saveBtn = btn('✓ Alle ' + kapitel.length + ' Kapitel anlegen', 'btn btn-pri btn-sm');
          saveBtn.onclick = () => {
            erkannteStruktur.forEach(k => {
              const kap = {
                id: uid(),
                nr: k.nr || '',
                titel: k.titel || '',
                seiteVon: k.seiteVon || null,
                seiteBis: k.seiteBis || null,
                aufgaben: [],
                unterkapitel: (k.unterkapitel || []).map(u => ({
                  id: uid(),
                  nr: u.nr || '',
                  titel: u.titel || '',
                  seiteVon: u.seiteVon || null,
                  seiteBis: u.seiteBis || null,
                  aufgaben: [],
                })),
              };
              if (!buch.kapitel) buch.kapitel = [];
              buch.kapitel.push(kap);
            });
            saveSchulbuchDB();
            close();
            onDone();
          };
          btnRow.innerHTML = '';
          btnRow.appendChild(saveBtn);
          btnRow.appendChild(btn('Abbrechen', 'btn btn-ghost btn-sm')).onclick = close;

        } catch(e) {
          statusEl.textContent = '⚠ ' + e.message;
          kiBtn.disabled = false; kiBtn.textContent = '✨ KI liest aus';
        }
      };
    });
  }

  // ── Aufgaben einer Seite bearbeiten ───────────────────────────
  function showEditAufgaben(entry, seite, onDone) {
    openOverlay('Aufgaben S. ' + seite + ' bearbeiten', 640, (body, close) => {
      body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.gap = '10px';
      body.style.maxHeight = '70vh'; body.style.overflowY = 'auto';

      const aufgaben = (entry.aufgaben || []).filter(a => a.seite === seite);

      aufgaben.forEach(aufg => {
        const box = mk('div', '');
        box.style.cssText = 'border:1px solid var(--bd);border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;';

        // Kopfzeile: Nr + Schwierigkeit
        const topRow = mk('div', '');
        topRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
        topRow.appendChild(tx('strong', '', aufg.nr));

        const schwSel = document.createElement('select'); schwSel.className = 'finp'; schwSel.style.cssText = 'width:auto;font-size:13px;padding:2px 6px;';
        [['○','○ einfach'],['◒','◒ mittel'],['●','● anspruchsvoll'],['','– unbekannt']].forEach(([v,l]) => {
          const o = document.createElement('option'); o.value = v; o.textContent = l;
          if (aufg.schwierigkeit === v) o.selected = true;
          schwSel.appendChild(o);
        });
        topRow.appendChild(schwSel);
        box.appendChild(topRow);

        // Aufgabenstellung (falls vorhanden)
        if (aufg.aufgabenstellung != null) {
          const aLabel = tx('label', 'fl', 'Aufgabenstellung');
          aLabel.style.fontSize = '11px';
          box.appendChild(aLabel);
          const aTa = document.createElement('textarea'); aTa.className = 'finp';
          aTa.value = aufg.aufgabenstellung || ''; aTa.rows = 2; aTa.style.fontSize = '13px';
          aTa.oninput = () => { aufg.aufgabenstellung = aTa.value; };
          box.appendChild(aTa);
        }

        // Text
        const tLabel = tx('label', 'fl', aufg.aufgabenstellung != null ? 'Individueller Teil' : 'Aufgabentext');
        tLabel.style.fontSize = '11px';
        box.appendChild(tLabel);
        const tTa = document.createElement('textarea'); tTa.className = 'finp';
        tTa.value = aufg.text || ''; tTa.rows = 2; tTa.style.fontSize = '13px';
        tTa.oninput = () => { aufg.text = tTa.value; };
        box.appendChild(tTa);

        // Grafik
        if (aufg.grafik != null) {
          const gLabel = tx('label', 'fl', '🖼 Grafik');
          gLabel.style.fontSize = '11px';
          box.appendChild(gLabel);
          const gInp = document.createElement('input'); gInp.className = 'finp'; gInp.value = aufg.grafik || ''; gInp.style.fontSize = '13px';
          gInp.oninput = () => { aufg.grafik = gInp.value || null; };
          box.appendChild(gInp);
        }

        schwSel.onchange = () => { aufg.schwierigkeit = schwSel.value; };
        box.appendChild(topRow);
        body.appendChild(box);
      });

      const row = mk('div', ''); row.style.cssText = 'display:flex;gap:8px;padding-top:4px;position:sticky;bottom:0;background:var(--bg);';
      const saveBtn = btn('Speichern', 'btn btn-pri btn-sm');
      const cancelB = btn('Abbrechen', 'btn btn-ghost btn-sm'); cancelB.onclick = close;
      row.appendChild(saveBtn); row.appendChild(cancelB);
      body.appendChild(row);

      saveBtn.onclick = () => { saveSchulbuchDB(); close(); onDone(); };
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

      // ── Seiten-Checkliste ──────────────────────────────────────
      const seitenSec = mk('div', '');
      body.appendChild(seitenSec);

      function renderSeitenListe() {
        seitenSec.innerHTML = '';
        const von = vonInp.value ? parseInt(vonInp.value) : entry.seiteVon;
        const bis = bisInp.value ? parseInt(bisInp.value) : entry.seiteBis;
        if (!von || !bis || bis < von || (bis - von) > 40) return;

        seitenSec.appendChild(tx('label', 'fl', 'Seiten'));
        const grid = mk('div', '');
        grid.style.cssText = 'display:flex;flex-direction:column;gap:3px;max-height:200px;overflow-y:auto;';

        for (let s = von; s <= bis; s++) {
          const aufgOnPage = (entry.aufgaben || []).filter(a => a.seite === s);
          const row = mk('div', '');
          row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:5px;font-size:13px;background:var(--surf2);';

          const status = tx('span', '', aufgOnPage.length ? '✓' : '○');
          status.style.cssText = 'font-size:14px;color:' + (aufgOnPage.length ? '#16a34a' : 'var(--tx3)') + ';width:16px;';
          row.appendChild(status);
          row.appendChild(tx('span', '', 'S. ' + s));

          if (aufgOnPage.length) {
            const cnt = tx('span', '', aufgOnPage.length + ' Aufg.');
            cnt.style.cssText = 'color:var(--tx3);font-size:12px;flex:1;';
            row.appendChild(cnt);
            const editSBtn = btn('✎', 'btn btn-ghost btn-xs');
            editSBtn.title = 'Aufgaben bearbeiten';
            editSBtn.onclick = () => showEditAufgaben(entry, s, renderSeitenListe);
            row.appendChild(editSBtn);
            const clrBtn = btn('✕', 'btn btn-ghost btn-xs');
            clrBtn.style.color = 'var(--red)'; clrBtn.title = 'Seite leeren';
            clrBtn.onclick = () => {
              if (!confirm('Alle Aufgaben von S. ' + s + ' löschen?')) return;
              entry.aufgaben = (entry.aufgaben || []).filter(a => a.seite !== s);
              saveSchulbuchDB();
              renderSeitenListe();
            };
            row.appendChild(clrBtn);
          } else {
            row.appendChild(tx('span', '', '–'));
          }
          grid.appendChild(row);
        }
        seitenSec.appendChild(grid);
      }

      vonInp.oninput = renderSeitenListe;
      bisInp.oninput = renderSeitenListe;
      renderSeitenListe();

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

      const statusEl = makeStatusEl();
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
          try { aufgaben = await extractAufgaben(imgs, statusEl, buch.typ); }
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
        sortAufgaben(ukap.aufgaben);
        if (!kap.unterkapitel) kap.unterkapitel = [];
        kap.unterkapitel.push(ukap);
        saveSchulbuchDB();
        close();
        onDone();
      };
    });
  }

  // ── Aufgaben-Toggle (eingeklappt, aufklappbar) ────────────────
  function buildToggleAufgaben(aufgaben, count) {
    const wrap = mk('div', '');
    wrap.style.cssText = 'margin-top:6px;';
    let offen = false;
    const toggleBtn = mk('div', '');
    toggleBtn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--tx3);padding:2px 0;user-select:none;';
    const arrow = tx('span', '', '▶');
    arrow.style.cssText = 'font-size:10px;transition:transform .15s;';
    const label = tx('span', '', count + ' Aufgaben anzeigen');
    toggleBtn.appendChild(arrow);
    toggleBtn.appendChild(label);
    wrap.appendChild(toggleBtn);

    const listWrap = mk('div', '');
    listWrap.style.display = 'none';
    listWrap.style.marginTop = '6px';
    wrap.appendChild(listWrap);

    let built = false;
    toggleBtn.onclick = () => {
      offen = !offen;
      arrow.style.transform = offen ? 'rotate(90deg)' : '';
      label.textContent = offen ? count + ' Aufgaben ausblenden' : count + ' Aufgaben anzeigen';
      listWrap.style.display = offen ? '' : 'none';
      if (offen && !built) { listWrap.appendChild(buildAufgabenListe(aufgaben)); built = true; }
    };
    return wrap;
  }

  // ── Aufgaben-Liste (wiederverwendbar, gruppiert) ──────────────
  function buildAufgabenListe(aufgaben) {
    const SC = { '○': '#16a34a', '◒': '#2563eb', '●': '#9d174d' };

    function aufgRow(aufg, eingerueckt) {
      const arow = mk('div', '');
      arow.style.cssText = 'display:flex;gap:0;align-items:baseline;padding:3px 8px;border-radius:5px;font-size:13px;' + (eingerueckt ? 'padding-left:32px;' : 'background:var(--surf2);');

      if (eingerueckt) {
        // Symbol (feste Breite) → Buchstabe (feste Breite) → Text
        const sym = tx('span', '', aufg.schwierigkeit || '');
        sym.style.cssText = 'width:18px;flex-shrink:0;font-size:13px;color:' + (SC[aufg.schwierigkeit] || 'var(--tx3)') + ';';
        arow.appendChild(sym);

        // Nur den Buchstaben-Teil der Nr extrahieren (z.B. "20a" → "a")
        const buchstabe = aufg.nr.replace(/^\d+/, '') || aufg.nr;
        const nrSpan = tx('strong', '', buchstabe);
        nrSpan.style.cssText = 'width:20px;flex-shrink:0;';
        arow.appendChild(nrSpan);
      } else {
        arow.appendChild(tx('strong', '', 'Aufg. ' + aufg.nr));
        if (aufg.schwierigkeit) { const sw = tx('span', '', aufg.schwierigkeit); sw.style.cssText = 'font-size:14px;color:' + (SC[aufg.schwierigkeit] || 'var(--tx3)') + ';flex-shrink:0;margin:0 4px;'; arow.appendChild(sw); }
      }

      const textWrap = mk('div', '');
      textWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:2px;margin-left:6px;';
      const textSpan = tx('span', '', aufg.text || aufg.aufgabenstellung || '');
      textSpan.style.color = 'var(--tx2)';
      textWrap.appendChild(textSpan);
      if (aufg.grafik) {
        const grafSpan = tx('span', '', '🖼 ' + aufg.grafik);
        grafSpan.style.cssText = 'font-size:11px;color:var(--tx3);font-style:italic;';
        textWrap.appendChild(grafSpan);
      }
      arow.appendChild(textWrap);
      if (!eingerueckt && aufg.seite) {
        const s = tx('span', 'matc-jg', 'S. ' + aufg.seite);
        s.style.cssText = 'margin-left:auto;flex-shrink:0;padding-left:8px;';
        arow.appendChild(s);
      }
      return arow;
    }

    const aufgList = mk('div', '');
    aufgList.style.cssText = 'display:flex;flex-direction:column;gap:3px;max-height:320px;overflow-y:auto;';

    // Lehrtexte zuerst
    const lehrtexte = aufgaben.filter(a => a.typ === 'lehrtext');
    const aufgabenOnly = aufgaben.filter(a => a.typ !== 'lehrtext');

    lehrtexte.forEach(lt => {
      const box = mk('div', '');
      box.style.cssText = 'background:linear-gradient(135deg,#fdf4ff,#faf5ff);border:1px solid #e9d5ff;border-left:3px solid #7c3aed;border-radius:6px;padding:8px 12px;margin-bottom:4px;font-size:12px;';
      const head = mk('div', '');
      head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';
      head.appendChild(tx('span', '', '📖'));
      head.appendChild(tx('strong', '', lt.thema || 'Lehrtext'));
      if (lt.seite) head.appendChild(tx('span', 'matc-jg', 'S. ' + lt.seite));
      box.appendChild(head);
      if (lt.inhalt) {
        const inhalt = tx('p', '', lt.inhalt);
        inhalt.style.cssText = 'color:var(--tx2);line-height:1.5;margin:0;';
        box.appendChild(inhalt);
      }
      if (lt.grafik) {
        const grf = tx('p', '', '🖼 ' + lt.grafik);
        grf.style.cssText = 'color:var(--tx3);font-style:italic;font-size:11px;margin:4px 0 0;';
        box.appendChild(grf);
      }
      aufgList.appendChild(box);
    });

    // Aufgaben gruppieren nach Basisnummer (z.B. "17" für "17a", "17b")
    const groups = [];
    const groupMap = {};
    aufgabenOnly.forEach(aufg => {
      const base = aufg.nr.match(/^(\d+)/)?.[1] || aufg.nr;
      if (!groupMap[base]) { groupMap[base] = []; groups.push(base); }
      groupMap[base].push(aufg);
    });

    groups.forEach(base => {
      const gruppe = groupMap[base];
      if (gruppe.length === 1) {
        // Einzelne Aufgabe → flach anzeigen
        aufgList.appendChild(aufgRow(gruppe[0], false));
      } else {
        // Gruppe → Kopfzeile + eingerückte Teilaufgaben
        // Hauptaufgaben-Eintrag (ohne Buchstabe) als Header verwenden falls vorhanden
        const hauptEintrag = gruppe.find(a => a.nr === base);
        const teilaufgaben = gruppe.filter(a => a.nr !== base);
        const anzeigeGruppe = teilaufgaben.length ? teilaufgaben : gruppe;

        const header = mk('div', '');
        header.style.cssText = 'display:flex;gap:8px;align-items:baseline;padding:3px 8px;background:var(--surf2);border-radius:5px 5px 0 0;font-size:13px;font-weight:600;flex-wrap:wrap;';
        header.appendChild(tx('span', '', 'Aufg. ' + base));
        const aufgStellung = hauptEintrag?.aufgabenstellung || null;
        if (aufgStellung) {
          const desc = tx('span', '', aufgStellung);
          desc.style.cssText = 'font-weight:400;color:var(--tx2);font-size:12px;flex:1;';
          header.appendChild(desc);
        } else {
          const spacer = mk('span', ''); spacer.style.flex = '1';
          header.appendChild(spacer);
        }
        if (gruppe[0].seite) {
          const s = tx('span', 'matc-jg', 'S. ' + gruppe[0].seite);
          s.style.flexShrink = '0';
          header.appendChild(s);
        }
        aufgList.appendChild(header);

        const subWrap = mk('div', '');
        subWrap.style.cssText = 'background:var(--surf2);border-radius:0 0 5px 5px;padding:2px 0 4px 0;margin-bottom:1px;';
        anzeigeGruppe.forEach(aufg => subWrap.appendChild(aufgRow(aufg, true)));
        aufgList.appendChild(subWrap);
      }
    });

    return aufgList;
  }

  // ── Buch-Liste ────────────────────────────────────────────────
  function countAufgaben(buch) {
    return (buch.kapitel || []).reduce((n, k) =>
      n + (k.aufgaben || []).length +
      (k.unterkapitel || []).reduce((m, u) => m + (u.aufgaben || []).length, 0), 0);
  }

  const FACH_FARBEN = {
    mathe:  { spine: ['#1e3a8a','#1d4ed8'], text: '#bfdbfe', icon: '📐' },
    bio:    { spine: ['#14532d','#166534'], text: '#bbf7d0', icon: '🌿' },
    chemie: { spine: ['#7c2d12','#c2410c'], text: '#fed7aa', icon: '🧪' },
  };
  const TYP_SYMBOL = { schulbuch: '📚', sammlung: '📂', aufgabenpool: '🗃' };

  function renderBuchListe() {
    subT.textContent = SCHULBUCHDB.length + ' Bücher';
    main.innerHTML = '';
    if (!SCHULBUCHDB.length) {
      const empty = tx('div', '', 'Noch keine Bücher angelegt. Klicke „Neues Buch" um zu beginnen.');
      empty.style.cssText = 'padding:40px;color:var(--tx3);text-align:center;';
      main.appendChild(empty); return;
    }

    // Nach Fach gruppieren
    const fachOrder = ['mathe', 'bio', 'chemie'];
    const byFach = {};
    SCHULBUCHDB.forEach(b => {
      const f = b.fach || 'sonstige';
      if (!byFach[f]) byFach[f] = [];
      byFach[f].push(b);
    });

    const faecher = [...fachOrder.filter(f => byFach[f]), ...Object.keys(byFach).filter(f => !fachOrder.includes(f))];

    // Gemeinsamer Rahmen für alle Regale
    const buecherWand = mk('div', '');
    buecherWand.style.cssText = 'background:#0f0f12;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.4);';
    main.appendChild(buecherWand);

    faecher.forEach(fach => {
      const farbe = FACH_FARBEN[fach] || { bg: '#374151', grad: 'linear-gradient(135deg,#374151,#6b7280)', icon: '📖' };
      const buecher = byFach[fach];


      // Bücherregal
      const regalWrap = mk('div', '');
      regalWrap.style.cssText = 'position:relative;';

      const regal = mk('div', '');
      regal.style.cssText = 'display:flex;align-items:flex-end;gap:3px;padding:16px 16px 0;background:linear-gradient(to bottom,#1a1a1f,#0a0a0e);height:220px;position:relative;overflow:hidden;';

      // Fach-Schriftzug auf der Regalwand
      const wandText = tx('div', '', fachLabel(fach).toUpperCase());
      wandText.style.cssText = `position:absolute;bottom:10px;left:50%;transform:translateX(-50%);font-size:72px;font-weight:900;letter-spacing:0.15em;color:${farbe.spine[1]};opacity:0.15;white-space:nowrap;pointer-events:none;user-select:none;line-height:1;`;

      regal.appendChild(wandText);

      // Schatten-Overlay am Boden (Bücher werfen Schatten aufs Brett)
      const bodenSchatten = mk('div', '');
      bodenSchatten.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:30px;background:linear-gradient(to top,rgba(0,0,0,.6),transparent);pointer-events:none;z-index:2;';
      regal.appendChild(bodenSchatten);

      const TYP_ORDER = { schulbuch: 0, sammlung: 1, aufgabenpool: 2 };
      buecher.sort((a, b) => (TYP_ORDER[a.typ] ?? 1) - (TYP_ORDER[b.typ] ?? 1));

      buecher.forEach(buch => {
        const kap = Math.max(1, (buch.kapitel || []).length);
        const aufg = countAufgaben(buch);
        // Breite: 40–80px je nach Kapitelanzahl
        const breite = Math.min(80, Math.max(40, 36 + kap * 4));
        const hoehe = Math.min(190, Math.max(140, 130 + kap * 3));

        const buch_el = mk('div', '');
        buch_el.style.cssText = `width:${breite}px;height:${hoehe}px;border-radius:3px 6px 6px 3px;cursor:pointer;position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:transform .15s,filter .15s;background:linear-gradient(to right,${farbe.spine[0]},${farbe.spine[1]});box-shadow:inset -3px 0 6px rgba(0,0,0,.4),inset 3px 0 4px rgba(255,255,255,.08),2px 2px 8px rgba(0,0,0,.5);overflow:hidden;`;

        // Buchrücken-Linien (Dekoration)
        const deko = mk('div','');
        deko.style.cssText = `position:absolute;top:0;left:0;right:0;bottom:0;background:repeating-linear-gradient(to bottom,transparent,transparent 20px,rgba(255,255,255,.04) 20px,rgba(255,255,255,.04) 21px);pointer-events:none;`;
        buch_el.appendChild(deko);

        // Titel vertikal
        const titelEl = tx('div', '', buch.titel || '–');
        titelEl.style.cssText = `writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;font-weight:700;color:${farbe.text};text-align:center;padding:8px 4px;line-height:1.3;max-height:${hoehe - 40}px;overflow:hidden;z-index:1;`;
        buch_el.appendChild(titelEl);

        // Jahrgang unten
        if (buch.jahrgang) {
          const jgEl = tx('div', '', 'Jg.' + buch.jahrgang);
          jgEl.style.cssText = `position:absolute;bottom:6px;font-size:9px;color:${farbe.text};opacity:.7;z-index:1;`;
          buch_el.appendChild(jgEl);
        }

        // Typ-Symbol oben
        const typEl = tx('div', '', TYP_SYMBOL[buch.typ] || '📖');
        typEl.style.cssText = 'position:absolute;top:6px;font-size:14px;z-index:1;';
        buch_el.appendChild(typEl);

        buch_el.onmouseenter = () => { buch_el.style.transform = 'translateY(-12px)'; buch_el.style.filter = 'brightness(1.2)'; };
        buch_el.onmouseleave = () => { buch_el.style.transform = ''; buch_el.style.filter = ''; };

        // Tooltip mit Details
        buch_el.title = buch.titel + (buch.verlag ? ' · ' + buch.verlag : '') + '\n' + kap + ' Kapitel · ' + aufg + ' Aufgaben';

        buch_el.onclick = () => { aktBuchId = buch.id; renderMain(); };

        // Rechtsklick = Löschen (Kontextmenü)
        buch_el.oncontextmenu = e => {
          e.preventDefault();
          if (!confirm('"' + buch.titel + '" löschen?')) return;
          SCHULBUCHDB = SCHULBUCHDB.filter(b => b.id !== buch.id);
          saveSchulbuchDB(); renderMain();
        };

        regal.appendChild(buch_el);
      });

      regalWrap.appendChild(regal);

      // Regal-Brett
      const brett = mk('div', '');
      brett.style.cssText = 'height:22px;background:linear-gradient(to bottom,#6b2d3e,#3d1525);border-top:1px solid rgba(255,255,255,.1);box-shadow:0 4px 10px rgba(0,0,0,.5);';
      regalWrap.appendChild(brett);

      buecherWand.appendChild(regalWrap);
    });
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
    const titelEl = tx('strong', '', buch.titel);
    titelEl.title = 'Klicken zum Bearbeiten';
    titelEl.style.cursor = 'pointer';
    titelEl.onclick = () => {
      const inp = document.createElement('input');
      inp.className = 'finp';
      inp.value = buch.titel;
      inp.style.cssText = 'font-weight:600;font-size:inherit;min-width:200px;';
      titelEl.replaceWith(inp);
      inp.focus(); inp.select();
      const save = () => {
        const v = inp.value.trim();
        if (v) { buch.titel = v; subT.textContent = v; scheduleSave(); }
        inp.replaceWith(titelEl);
        titelEl.textContent = buch.titel;
      };
      inp.onblur = save;
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { inp.replaceWith(titelEl); } };
    };
    infoBody.appendChild(titelEl);
    if (buch.verlag) infoBody.appendChild(tx('span', 'c-sub', buch.verlag));
    if (buch.jahrgang) infoBody.appendChild(tx('span', 'matc-jg', 'Jg. ' + buch.jahrgang));
    infoBody.appendChild(tx('span', 'matc-jg', buchTypIcon(buch.typ) + ' ' + buchTypLabel(buch.typ)));

    const editMetaBtn = btn('✎', 'matc-del');
    editMetaBtn.title = 'Metadaten bearbeiten'; editMetaBtn.style.cssText = 'color:var(--tx2);margin-left:auto;';
    editMetaBtn.onclick = () => {
      openOverlay('Buch bearbeiten', 420, (body, close) => {
        body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.gap = '10px';

        const typSel = document.createElement('select'); typSel.className = 'finp';
        BUCH_TYPEN.forEach(t => { const o = document.createElement('option'); o.value = t.val; o.textContent = t.icon + ' ' + t.label; if (buch.typ === t.val) o.selected = true; typSel.appendChild(o); });
        body.appendChild(field('Typ', typSel));

        const titelInp = document.createElement('input'); titelInp.className = 'finp'; titelInp.value = buch.titel || '';
        body.appendChild(field('Titel', titelInp));

        const verlagInp = document.createElement('input'); verlagInp.className = 'finp'; verlagInp.value = buch.verlag || '';
        body.appendChild(field('Verlag', verlagInp));

        const fachSel = makeFachSelect(buch.fach);
        body.appendChild(field('Fach', fachSel));

        const jgSel = makeJahrgangSelect(buch.jahrgang);
        body.appendChild(field('Jahrgang', jgSel));

        const { row, saveBtn } = makeBtnRow('Speichern', close);
        saveBtn.onclick = () => {
          const t = titelInp.value.trim();
          if (!t) { alert('Bitte einen Titel eingeben.'); return; }
          buch.typ = typSel.value;
          buch.titel = t;
          buch.verlag = verlagInp.value.trim() || null;
          buch.fach = fachSel.value;
          buch.jahrgang = jgSel.value;
          saveSchulbuchDB();
          close();
          renderBuchDetail(buchId);
        };
        body.appendChild(row);
      });
    };
    infoBody.appendChild(editMetaBtn);
    infoCard.appendChild(infoBody);
    main.appendChild(infoCard);

    // Kapitel-Abschnitt
    const kapSec = mk('div', '');
    kapSec.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:20px 0 8px 0;';
    kapSec.appendChild(tx('div', 'card-title', 'Kapitel'));
    const btnRow = mk('div', ''); btnRow.style.cssText = 'display:flex;gap:6px;';
    const addKapBtn = btn('+ Kapitel', 'btn btn-pri btn-sm');
    const inhaltsBtn = btn('📋 Aus Inhaltsverzeichnis', 'btn btn-sm');
    inhaltsBtn.onclick = () => showInhaltsverzeichnis(buch, renderKapitel);
    btnRow.appendChild(addKapBtn);
    btnRow.appendChild(inhaltsBtn);
    kapSec.appendChild(btnRow);
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

        // Kapitel-Header (mit Einklapp-Toggle)
        let kapOffen = false;
        const hrow = mk('div', '');
        hrow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;cursor:pointer;';
        const kapArrow = tx('span', '', '▶');
        kapArrow.style.cssText = 'font-size:10px;color:var(--tx3);transition:transform .15s;flex-shrink:0;';
        hrow.appendChild(kapArrow);
        hrow.appendChild(tx('strong', '', 'Kap. ' + kap.nr + ': ' + kap.titel));
        if (kap.seiteVon && kap.seiteBis) hrow.appendChild(tx('span', 'matc-jg', 'S. ' + kap.seiteVon + '–' + kap.seiteBis));
        const aufgCount = (kap.aufgaben || []).length +
          (kap.unterkapitel || []).reduce((s, u) => s + (u.aufgaben || []).length, 0);
        hrow.appendChild(tx('span', 'matc-klp-count', aufgCount + ' Aufgaben'));

        const btnGrp = mk('div', '');
        btnGrp.style.cssText = 'display:flex;align-items:center;gap:4px;margin-left:auto;flex-shrink:0;';

        const addUkapBtn = btn('+ Unterkapitel', 'btn btn-ghost btn-xs');
        addUkapBtn.onclick = () => showAddUnterkapitel(buch, kap, renderKapitel);
        btnGrp.appendChild(addUkapBtn);

        const moreBtn = btn('+ Seiten', 'btn btn-ghost btn-xs');
        moreBtn.onclick = () => showAddSeiten(buch, kap, renderKapitel);
        btnGrp.appendChild(moreBtn);

        const editKapBtn = btn('✎', 'matc-del');
        editKapBtn.title = 'Bearbeiten'; editKapBtn.style.color = 'var(--tx2)';
        editKapBtn.onclick = () => showEditEntry('Kapitel bearbeiten', kap, renderKapitel);
        btnGrp.appendChild(editKapBtn);

        if ((kap.aufgaben || []).length) {
          const clearBtn = btn('⊘', 'matc-del');
          clearBtn.title = 'Alle Einträge leeren';
          clearBtn.style.color = 'var(--tx2)';
          clearBtn.onclick = () => {
            if (!confirm('Alle Einträge aus "' + kap.titel + '" löschen?')) return;
            kap.aufgaben = [];
            saveSchulbuchDB(); renderKapitel();
          };
          btnGrp.appendChild(clearBtn);
        }

        const delKapBtn = btn('✕', 'matc-del');
        delKapBtn.onclick = () => {
          if (!confirm('Kapitel "' + kap.titel + '" löschen?')) return;
          buch.kapitel = buch.kapitel.filter(k => k.id !== kap.id);
          saveSchulbuchDB(); renderKapitel();
        };
        btnGrp.appendChild(delKapBtn);
        hrow.appendChild(btnGrp);
        body.appendChild(hrow);

        const kapContent = mk('div', '');
        kapContent.style.display = 'none';
        body.appendChild(kapContent);

        hrow.onclick = e => {
          if (e.target.closest('button')) return; // Buttons nicht abfangen
          kapOffen = !kapOffen;
          kapArrow.style.transform = kapOffen ? 'rotate(90deg)' : '';
          kapContent.style.display = kapOffen ? '' : 'none';
        };

        // Direkte Aufgaben am Kapitel (eingeklappt)
        const dirCount = (kap.aufgaben || []).length;
        if (dirCount) kapContent.appendChild(buildToggleAufgaben(kap.aufgaben, dirCount));

        // Unterkapitel
        const ukaps = kap.unterkapitel || [];
        if (ukaps.length) {
          const uList = mk('div', '');
          uList.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:10px;padding-left:16px;border-left:3px solid var(--bd);';
          ukaps.forEach(ukap => {
            const uCard = mk('div', '');
            uCard.style.cssText = 'background:var(--surf2);border-radius:6px;padding:8px 10px;';

            const uHrow = mk('div', '');
            uHrow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
            uHrow.appendChild(tx('strong', '', ukap.nr + ' ' + ukap.titel));
            if (ukap.seiteVon && ukap.seiteBis) uHrow.appendChild(tx('span', 'matc-jg', 'S. ' + ukap.seiteVon + '–' + ukap.seiteBis));
            const uAufgCount = (ukap.aufgaben || []).length;

            const uBtnGrp = mk('div', '');
            uBtnGrp.style.cssText = 'display:flex;align-items:center;gap:4px;margin-left:auto;flex-shrink:0;';

            const uMoreBtn = btn('+ Seiten', 'btn btn-ghost btn-xs');
            uMoreBtn.onclick = () => showAddSeiten(buch, ukap, renderKapitel);
            uBtnGrp.appendChild(uMoreBtn);

            const uEditBtn = btn('✎', 'matc-del');
            uEditBtn.title = 'Bearbeiten'; uEditBtn.style.color = 'var(--tx2)';
            uEditBtn.onclick = () => showEditEntry('Unterkapitel bearbeiten', ukap, renderKapitel);
            uBtnGrp.appendChild(uEditBtn);

            const uDelBtn = btn('✕', 'matc-del');
            uDelBtn.onclick = () => {
              if (!confirm('Unterkapitel "' + ukap.titel + '" löschen?')) return;
              kap.unterkapitel = kap.unterkapitel.filter(u => u.id !== ukap.id);
              saveSchulbuchDB(); renderKapitel();
            };
            uBtnGrp.appendChild(uDelBtn);
            uHrow.appendChild(uBtnGrp);
            uCard.appendChild(uHrow);

            if (uAufgCount) uCard.appendChild(buildToggleAufgaben(ukap.aufgaben, uAufgCount));
            uList.appendChild(uCard);
          });
          kapContent.appendChild(uList);
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
