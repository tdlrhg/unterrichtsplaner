// ── Prüfungsplaner App ────────────────────────────────────────────
let PRUEFUNGSDB = [];

// ── JSON-Repair-Helfer (analog zu schulbuch.js) ───────────────────
function repairJsonStringsPr(s) {
  let out = ''; let inStr = false; let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') { out += ch + (s[i+1] || ''); i += 2; continue; }
      if (ch === '"') { inStr = false; out += ch; i++; continue; }
      if (ch === '\n') { out += '\\n'; i++; continue; }
      if (ch === '\r') { out += '\\r'; i++; continue; }
      if (ch === '\t') { out += '\\t'; i++; continue; }
      if (ch.charCodeAt(0) < 0x20) { i++; continue; }
    } else { if (ch === '"') inStr = true; }
    out += ch; i++;
  }
  return out;
}
function robustJsonParsePr(raw) {
  function extractTop(text) {
    const s = text.indexOf('{'); if (s < 0) return null;
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
    return text.slice(s);
  }
  const extracted = extractTop(raw);
  if (!extracted) throw new Error('Kein JSON in der Antwort');
  let jsonStr = extracted;
  // Stack-basierte Reparatur: offene Strings und Klammern in korrekter Reihenfolge schließen
  { let inS = false, esc = false, stack = [];
    for (let i = 0; i < jsonStr.length; i++) {
      const c = jsonStr[i];
      if (esc) { esc = false; continue; }
      if (c === '\\' && inS) { esc = true; continue; }
      if (c === '"') { inS = !inS; continue; }
      if (inS) continue;
      if (c === '{') stack.push('}');
      else if (c === '[') stack.push(']');
      else if ((c === '}' || c === ']') && stack.length && stack[stack.length-1] === c) stack.pop();
    }
    if (inS) jsonStr += '"'; // offenen String schließen
    jsonStr += stack.reverse().join(''); // Klammern in korrekter Reihenfolge schließen
  }
  jsonStr = repairJsonStringsPr(jsonStr);
  try { return JSON.parse(jsonStr); } catch(e) {
    const items = [];
    let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') { if (depth === 0) start = i; depth++; }
      else if (ch === '}') { depth--; if (depth === 0 && start >= 0) {
        const objStr = repairJsonStringsPr(raw.slice(start, i + 1));
        try { const o = JSON.parse(objStr); if (o.typ || o.nr) items.push(o); } catch(e2) {}
        start = -1;
      }}
    }
    if (items.length) return { aufgaben: items };
    throw new Error('KI-Antwort konnte nicht als JSON gelesen werden');
  }
}

// Prompt für Alte Arbeiten
const KI_PROMPT_ALTE_ARBEIT = `Du analysierst Seiten einer Klassenarbeit (Gymnasium, Mathematik oder Naturwissenschaften).

Extrahiere jede Aufgabe und Teilaufgabe als eigenen Eintrag.

Für jede Aufgabe / Teilaufgabe:
- nr: Aufgabennummer inkl. Teilaufgabe (z.B. "3b") — Hauptaufgabe ohne Buchstabe (z.B. "3")
- seite: Seitennummer falls erkennbar, sonst null
- aufgabenstellung: gemeinsame Aufgabenstellung bei Hauptaufgaben, sonst null
- text: der Aufgabentext (Teilaufgabe: nur der individuelle Teil; Einzelaufgabe: voller Text). Formeln als Text, z.B. "2x - 1 = 5". Einzeilig.
- punkte: Punktzahl falls auf der Arbeit angegeben, sonst null
- grafik: kurze Beschreibung eines Fotos/Diagramms (1 Satz), null wenn keins

Antworte NUR mit validem JSON:
{"aufgaben": [
  {"nr":"1","seite":1,"aufgabenstellung":"Löse die folgenden Gleichungen.","text":null,"punkte":8,"grafik":null},
  {"nr":"1a","seite":1,"aufgabenstellung":null,"text":"3x + 5 = 14","punkte":2,"grafik":null},
  {"nr":"1b","seite":1,"aufgabenstellung":null,"text":"2x - 1 = -0,5x + 5","punkte":3,"grafik":null}
]}`;
let CHECKLISTDB = [];
let ALTE_ARBEITEN_DB = [];

const KOMPOSITIONSSTIL_DEFAULT = `4–7 Hauptaufgaben, jeweils mit Teilaufgaben.
Teilaufgaben sind thematisch verbunden, aber rechnerisch unabhängig (neue Zahlen pro Teilaufgabe).
Punkteverteilung: 40–50 % Reproduktion/einfache Anwendung (○), 10–15 % schwieriger Transfer (●), Rest mittlere Anwendung (◒).
Progression: gesamt leicht→schwer, auch innerhalb jeder Aufgabe leicht→schwer.
Abwechslungsreiche Aufgabentypen: Rechnung, Sachaufgabe, Multiple Choice, Diagramm, Begründung/Erklärung.`;

let KOMPOSITIONSSTIL = KOMPOSITIONSSTIL_DEFAULT;

function saveKompositionsstil() {
  sbUpload('kompositionsstil.json', { text: KOMPOSITIONSSTIL }).catch(() => {});
}
let PR = {
  aktId: null,
  aktCheckId: null,
  aktAlteArbeitId: null,
  view: 'pruefung',   // 'pruefung' | 'checkliste' | 'alte_arbeit'
};

function saveChecklistDB() {
  sbUpload('checklisten.json', CHECKLISTDB).catch(e => console.error('Checklisten speichern:', e));
}
function saveAlteArbeitenDB() {
  sbUpload('alte_arbeiten.json', ALTE_ARBEITEN_DB).catch(e => console.error('Alte Arbeiten speichern:', e));
}
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

// PDF → Array von dataURL-Strings (eine pro Seite)
async function pdfToImages(file, scale = 1.5) {
  const blobUrl = URL.createObjectURL(file);
  const pdfDoc = await pdfjsLib.getDocument(blobUrl).promise;
  const images = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const vp = page.getViewport({ scale });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    images.push(cv.toDataURL('image/jpeg', 0.88));
    cv.width = 0; cv.height = 0; page.cleanup();
  }
  await pdfDoc.destroy(); URL.revokeObjectURL(blobUrl);
  return images;
}

let PR_VERSION = null;
let PR_VERSION_STATUS = null;
const _prStarted = Date.now();

function savePruefungsDB() {
  sbUpload('pruefungen.json', PRUEFUNGSDB).catch(e => console.error('Prüfungen speichern fehlgeschlagen:', e));
}

// ── Render ────────────────────────────────────────────────────────
function renderPr() {
  const root = document.getElementById('root');
  root.innerHTML = '';
  root.appendChild(buildPrTopbar());
  const layout = mk('div', 'pr-layout');
  layout.appendChild(buildPrSidebar());
  layout.appendChild(buildPrContent());
  root.appendChild(layout);
}

// ── Topbar ────────────────────────────────────────────────────────
function buildPrTopbar() {
  const bar = mk('div', 'topbar');
  const titleWrap = mk('div', '');
  titleWrap.style.cssText = 'display:flex;align-items:baseline;gap:12px;';
  titleWrap.appendChild(tx('div', 'topbar-title', 'Prüfungsplaner'));
  const upLink = mk('a', 'topbar-app-link');
  upLink.href = 'index.html';
  upLink.textContent = '📐 Unterrichtsplaner';
  titleWrap.appendChild(upLink);
  bar.appendChild(titleWrap);
  const right = mk('div', 'topbar-right');
  if (PR_VERSION) {
    const d = new Date(PR_VERSION);
    const label = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })
      + ' ' + d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
    const indicator = PR_VERSION_STATUS === 'current' ? ' ✓' : PR_VERSION_STATUS === 'deploying' ? ' ⏳' : '';
    const vSpan = tx('span', 'topbar-version', label + indicator);
    vSpan.title = 'Klicken zum Neu laden'; vSpan.style.cursor = 'pointer';
    vSpan.onclick = () => location.reload(true);
    right.appendChild(vSpan);
  }
  bar.appendChild(right);
  return bar;
}

// ── Sidebar ───────────────────────────────────────────────────────
function buildPrSidebar() {
  const sb = mk('div', 'pr-sidebar');

  // Resize-Handle (wie Hauptplaner)
  const resizeHandle = mk('div', 'sb-resize-handle');
  sb.appendChild(resizeHandle);
  const savedW = localStorage.getItem('pr_sb_width');
  if (savedW) sb.style.width = savedW + 'px';
  resizeHandle.addEventListener('mousedown', e => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = e => { sb.style.width = Math.min(400, Math.max(160, e.clientX - sb.getBoundingClientRect().left)) + 'px'; };
    const onUp = () => { localStorage.setItem('pr_sb_width', parseInt(sb.style.width)); document.body.style.cursor = ''; document.body.style.userSelect = ''; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Titel
  const hdr = mk('div', 'pr-sb-hdr');
  hdr.appendChild(tx('div', 'pr-sb-title', 'Prüfungen'));
  hdr.appendChild(tx('div', 'pr-sb-sub', PRUEFUNGSDB.length + ' Einträge'));
  sb.appendChild(hdr);

  // Neue Prüfung
  const newBtn = btn('+ Neue Prüfung', 'btn btn-pri btn-sm pr-new-btn');
  newBtn.onclick = () => showNewPruefungModal();
  sb.appendChild(newBtn);

  sb.appendChild(mk('div', 'pr-sb-sep'));

  // Liste
  if (!PRUEFUNGSDB.length) {
    const empty = tx('div', '', 'Noch keine Prüfungen angelegt.');
    empty.style.cssText = 'padding:16px;font-size:12px;color:var(--sb-tx2);text-align:center;';
    sb.appendChild(empty);
  } else {
    PRUEFUNGSDB.forEach(pr => {
      const row = mk('div', 'pr-item' + (PR.aktId === pr.id ? ' active' : ''));

      const icon = tx('span', 'pr-item-icon', pr.typ === 'klausur' ? '📋' : '📝');
      row.appendChild(icon);

      const info = mk('div', ''); info.style.flex = '1'; info.style.minWidth = '0';
      info.appendChild(tx('div', 'pr-item-label', pr.titel || '–'));
      if (pr.kursLabel || pr.datum) {
        const prDatum = pr.datum ? new Date(pr.datum).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) : null;
        info.appendChild(tx('div', 'pr-item-sub', [pr.kursLabel, prDatum].filter(Boolean).join(' · ')));
      }
      row.appendChild(info);

      const badge = tx('span', 'pr-typ-badge ' + (pr.typ === 'klausur' ? 'pr-typ-kl' : 'pr-typ-ka'), pr.typ === 'klausur' ? 'Klausur' : 'KA');
      row.appendChild(badge);

      const del = btn('✕', 'pr-item-del');
      del.onclick = e => {
        e.stopPropagation();
        if (!confirm('"' + pr.titel + '" löschen?')) return;
        PRUEFUNGSDB = PRUEFUNGSDB.filter(p => p.id !== pr.id);
        if (PR.aktId === pr.id) PR.aktId = null;
        savePruefungsDB();
        renderPr();
      };
      row.appendChild(del);

      row.onclick = () => { PR.aktId = pr.id; PR.view = 'pruefung'; renderPr(); };
      sb.appendChild(row);
    });
  }

  // ── Datenbanken ───────────────────────────────────────────────
  sb.appendChild(mk('div', 'pr-sb-sep'));
  sb.appendChild(tx('div', 'pr-sb-hdr', '')).appendChild(tx('div', 'pr-sb-title', 'Datenbanken'));

  const clLink = mk('div', 'pr-item' + (PR.view === 'checklisten_overview' ? ' active' : ''));
  clLink.appendChild(tx('span', 'pr-item-icon', '☑️'));
  const clInfo = mk('div', ''); clInfo.style.flex = '1';
  clInfo.appendChild(tx('div', 'pr-item-label', 'Checklisten'));
  clInfo.appendChild(tx('div', 'pr-item-sub', CHECKLISTDB.length + ' gespeichert'));
  clLink.appendChild(clInfo);
  clLink.onclick = () => { PR.view = 'checklisten_overview'; PR.aktId = null; renderPr(); };
  sb.appendChild(clLink);

  const aaLink = mk('div', 'pr-item' + (PR.view === 'alte_arbeiten_overview' ? ' active' : ''));
  aaLink.appendChild(tx('span', 'pr-item-icon', '📝'));
  const aaInfo = mk('div', ''); aaInfo.style.flex = '1';
  aaInfo.appendChild(tx('div', 'pr-item-label', 'Alte Arbeiten'));
  aaInfo.appendChild(tx('div', 'pr-item-sub', ALTE_ARBEITEN_DB.length + ' gespeichert'));
  aaLink.appendChild(aaInfo);
  aaLink.onclick = () => { PR.view = 'alte_arbeiten_overview'; PR.aktId = null; renderPr(); };
  sb.appendChild(aaLink);

  return sb;
}

// ── Content ───────────────────────────────────────────────────────
function buildPrContent() {
  const c = mk('div', 'pr-content');
  if (PR.view === 'checklisten_overview') {
    c.appendChild(buildChecklistenOverview());
  } else if (PR.view === 'checkliste' && PR.aktCheckId) {
    const cl = CHECKLISTDB.find(x => x.id === PR.aktCheckId);
    if (cl) c.appendChild(buildChecklistDetail(cl));
  } else if (PR.view === 'alte_arbeiten_overview') {
    c.appendChild(buildAlteArbeitenOverview());
  } else if (PR.view === 'alte_arbeit' && PR.aktAlteArbeitId) {
    const aa = ALTE_ARBEITEN_DB.find(a => a.id === PR.aktAlteArbeitId);
    if (aa) c.appendChild(buildAlteArbeitDetail(aa));
  } else if (PR.aktId) {
    const pr = PRUEFUNGSDB.find(p => p.id === PR.aktId);
    if (pr) c.appendChild(buildPrDetail(pr));
  } else {
    c.appendChild(buildPrEmpty());
  }
  return c;
}

function buildPrEmpty() {
  const wrap = mk('div', '');
  wrap.style.cssText = 'max-width:480px;margin:60px auto;text-align:center;';
  const ico = tx('div', '', '📋');
  ico.style.fontSize = '48px';
  wrap.appendChild(ico);
  const h = tx('div', '', 'Prüfungsplaner');
  h.style.cssText = 'font-family:"Playfair Display",serif;font-size:28px;font-weight:700;color:var(--pri);margin:16px 0 8px;';
  wrap.appendChild(h);
  const p = tx('p', '', 'Erstelle Klassenarbeiten und Klausuren auf Basis deiner Schulbücher, Materialien und Lernziel-Checklisten.');
  p.style.cssText = 'color:var(--tx2);line-height:1.6;margin-bottom:24px;';
  wrap.appendChild(p);
  const b = btn('+ Erste Prüfung anlegen', 'btn btn-pri');
  b.onclick = () => showNewPruefungModal();
  wrap.appendChild(b);
  return wrap;
}

// ── KI: Checkliste aus Bildern extrahieren ────────────────────────
async function extrahiereChecklist(imgs) {
  const resized = await Promise.all(imgs.map(img => new Promise((res, rej) => {
    const image = new Image(); image.onload = () => {
      const scale = image.width > 1200 ? 1200 / image.width : 1;
      const c = document.createElement('canvas');
      c.width = Math.round(image.width * scale); c.height = Math.round(image.height * scale);
      c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.85));
    }; image.onerror = rej; image.src = img;
  })));
  const blocks = [
    ...resized.map(r => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: r.split(',')[1] } })),
    { type: 'text', text: `Lies diese Lernziel-Checkliste aus.
Antworte NUR in diesem Format:
ABSCHNITT: [Titel des Abschnitts]
1|[Lernziel-Text]
2|[Lernziel-Text]
ABSCHNITT: [Titel des nächsten Abschnitts]
1|[Lernziel-Text]

Regeln:
- Jeden Abschnitt mit "ABSCHNITT:" einleiten
- Jedes Lernziel als Nummer|Text (die "Ich kann..."-Sätze vollständig)
- Kein Markdown, keine Erklärungen, nur dieses Format` }
  ];
  const raw = await callKI(blocks, 4000);
  const lernziele = [];
  let aktAbschnitt = '';
  for (const line of raw.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (line.startsWith('ABSCHNITT:')) {
      aktAbschnitt = line.slice('ABSCHNITT:'.length).trim();
    } else if (line.includes('|')) {
      const [nr, ...rest] = line.split('|');
      const text = rest.join('|').trim();
      if (text) lernziele.push({ id: uid(), abschnitt: aktAbschnitt, nr: parseInt(nr) || lernziele.length + 1, text });
    }
  }
  return lernziele;
}

// ── Lernziele-Tab ─────────────────────────────────────────────────
function buildLernzieleTab(pr) {
  const div = mk('div', '');

  function renderLernziele() {
    div.innerHTML = '';

    // Keine Checkliste verknüpft
    if (!pr.checklistId) {
      const wrap = mk('div', ''); wrap.style.cssText = 'max-width:520px;';
      const hint = tx('div', '', !CHECKLISTDB.length
        ? 'Noch keine Checklisten gespeichert. Lege zuerst eine Checkliste in der Sidebar an.'
        : 'Wähle eine Checkliste für diese Prüfung:');
      hint.style.cssText = 'font-size:13px;color:var(--tx2);margin-bottom:14px;line-height:1.5;';
      wrap.appendChild(hint);

      if (CHECKLISTDB.length) {
        CHECKLISTDB.forEach(cl => {
          const clBtn = mk('div', '');
          clBtn.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--bord);border-radius:8px;cursor:pointer;margin-bottom:8px;transition:border-color .15s;';
          clBtn.onmouseenter = () => { clBtn.style.borderColor = 'var(--pri)'; };
          clBtn.onmouseleave = () => { clBtn.style.borderColor = 'var(--bord)'; };
          clBtn.appendChild(tx('span', '', '☑️'));
          const info = mk('div', '');
          info.appendChild(tx('div', '', cl.titel)); info.lastChild.style.fontWeight = '600';
          info.appendChild(tx('div', '', cl.lernziele?.length + ' Lernziele')); info.lastChild.style.cssText = 'font-size:12px;color:var(--tx3);';
          clBtn.appendChild(info);
          clBtn.onclick = () => {
            pr.checklistId = cl.id;
            pr.ausgewaehlteLernziele = cl.lernziele.map(l => l.id); // alle vorausgewählt
            savePruefungsDB(); renderLernziele();
          };
          wrap.appendChild(clBtn);
        });
      }

      const newClLink = btn('+ Neue Checkliste anlegen', 'btn btn-ghost btn-sm');
      newClLink.onclick = () => showNewChecklistModal();
      wrap.appendChild(newClLink);
      div.appendChild(wrap);
      return;
    }

    // Checkliste verknüpft — Lernziele anzeigen
    const cl = CHECKLISTDB.find(c => c.id === pr.checklistId);
    if (!cl) {
      pr.checklistId = null; pr.ausgewaehlteLernziele = [];
      savePruefungsDB(); renderLernziele(); return;
    }

    if (!pr.ausgewaehlteLernziele) pr.ausgewaehlteLernziele = cl.lernziele.map(l => l.id);
    const selSet = new Set(pr.ausgewaehlteLernziele);

    const toolbar = mk('div', '');
    toolbar.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap;';
    const infoSpan = tx('span', '', selSet.size + ' von ' + cl.lernziele.length + ' ausgewählt · ' + cl.titel);
    infoSpan.style.cssText = 'font-size:13px;color:var(--tx2);flex:1;';
    toolbar.appendChild(infoSpan);
    const alleBtn = btn('Alle', 'btn btn-ghost btn-xs');
    alleBtn.onclick = () => { pr.ausgewaehlteLernziele = cl.lernziele.map(l => l.id); savePruefungsDB(); renderLernziele(); };
    toolbar.appendChild(alleBtn);
    const keineBtn = btn('Keine', 'btn btn-ghost btn-xs');
    keineBtn.onclick = () => { pr.ausgewaehlteLernziele = []; savePruefungsDB(); renderLernziele(); };
    toolbar.appendChild(keineBtn);
    const wechselnBtn = btn('↩ Checkliste wechseln', 'btn btn-ghost btn-xs');
    wechselnBtn.onclick = () => { pr.checklistId = null; pr.ausgewaehlteLernziele = []; savePruefungsDB(); renderLernziele(); };
    toolbar.appendChild(wechselnBtn);
    div.appendChild(toolbar);

    const abschnitte = [...new Set(cl.lernziele.map(l => l.abschnitt))];
    abschnitte.forEach(abschnitt => {
      const items = cl.lernziele.filter(l => l.abschnitt === abschnitt);
      const sec = mk('div', ''); sec.style.cssText = 'margin-bottom:16px;';
      const secHdr = tx('div', '', abschnitt);
      secHdr.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);padding:6px 0 4px;border-bottom:2px solid var(--pri);margin-bottom:6px;';
      sec.appendChild(secHdr);

      items.forEach(lz => {
        const sel = selSet.has(lz.id);
        const row = mk('div', '');
        row.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer;';
        row.onmouseenter = () => { row.style.background = 'var(--surf2)'; };
        row.onmouseleave = () => { row.style.background = ''; };

        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = sel;
        cb.style.cssText = 'margin-top:3px;flex-shrink:0;accent-color:var(--pri);width:15px;height:15px;cursor:pointer;';
        cb.onchange = () => {
          if (cb.checked) pr.ausgewaehlteLernziele.push(lz.id);
          else pr.ausgewaehlteLernziele = pr.ausgewaehlteLernziele.filter(id => id !== lz.id);
          textSpan.style.color = cb.checked ? 'var(--tx1)' : 'var(--tx3)';
          infoSpan.textContent = pr.ausgewaehlteLernziele.length + ' von ' + cl.lernziele.length + ' ausgewählt · ' + cl.titel;
          savePruefungsDB();
        };
        const nrSpan = tx('span', '', lz.nr + '.'); nrSpan.style.cssText = 'color:var(--tx3);font-size:12px;flex-shrink:0;min-width:18px;';
        const textSpan = tx('span', '', lz.text); textSpan.style.cssText = 'font-size:13px;line-height:1.5;color:' + (sel ? 'var(--tx1)' : 'var(--tx3)') + ';';
        row.onclick = e => { if (e.target === cb) return; cb.checked = !cb.checked; cb.onchange(); };
        row.appendChild(cb); row.appendChild(nrSpan); row.appendChild(textSpan);
        sec.appendChild(row);
      });
      div.appendChild(sec);
    });
  }

  renderLernziele();
  return div;
}

// ── Alte Arbeit Detail ────────────────────────────────────────────
function buildAlteArbeitDetail(aa) {
  const div = mk('div', '');
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', ''); left.style.flex = '1';
  const backBtn = btn('← Alte Arbeiten', 'btn btn-ghost btn-sm');
  backBtn.style.marginBottom = '4px';
  backBtn.onclick = () => { PR.view = 'alte_arbeiten_overview'; PR.aktAlteArbeitId = null; renderPr(); };
  left.appendChild(backBtn);
  left.appendChild(tx('div', 'c-title', aa.titel || '–'));
  const sub = [aa.kursLabel, aa.datum ? new Date(aa.datum).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}) : null, aa.dauer ? aa.dauer + ' Min.' : null].filter(Boolean).join(' · ');
  if (sub) left.appendChild(tx('div', 'c-sub', sub));
  hdr.appendChild(left); div.appendChild(hdr);

  // Neue Aufgaben-Darstellung — gruppiert wie Schulbuch
  if (aa.aufgaben?.length) {
    const wrap = mk('div',''); wrap.style.cssText='display:flex;flex-direction:column;gap:3px;';
    div.appendChild(wrap);

    // Gruppieren nach (Seite + Basisnummer)
    const groupMap = {}, groups = [];
    aa.aufgaben.forEach(a => {
      const nrStr = a.nr != null ? String(a.nr) : '?';
      const base = nrStr.match(/^([\d]+)/)?.[1] || nrStr;
      const key = (a.seite ?? '?') + '_' + base;
      if (!groupMap[key]) { groupMap[key] = { base, seite: a.seite, aufgaben: [] }; groups.push(key); }
      groupMap[key].aufgaben.push(a);
    });

    groups.forEach(key => {
      const { base, seite, aufgaben: gruppe } = groupMap[key];
      const card = mk('div','card');
      const body = mk('div','card-body'); body.style.padding = '8px 12px';

      // Header-Zeile
      const hrow = mk('div',''); hrow.style.cssText='display:flex;align-items:baseline;gap:8px;margin-bottom:4px;';
      hrow.appendChild(tx('strong','','Aufgabe ' + base));
      const hauptEintrag = gruppe.find(a => String(a.nr) === base);
      const gesamtP = gruppe.reduce((s,a) => s + (a.punkte||0), 0);
      if (gesamtP) { const pt = tx('span','',gesamtP+' P'); pt.style.cssText='font-size:11px;color:var(--tx3);'; hrow.appendChild(pt); }
      const spacer = mk('span',''); spacer.style.flex='1'; hrow.appendChild(spacer);
      if (seite) { const s = tx('span','matc-jg','S. '+seite); hrow.appendChild(s); }
      body.appendChild(hrow);

      // Gemeinsame Aufgabenstellung
      const stellung = hauptEintrag?.aufgabenstellung || (gruppe.length === 1 ? gruppe[0].aufgabenstellung : null);
      if (stellung) { const st = tx('div','',stellung); st.style.cssText='font-size:13px;color:var(--tx2);font-style:italic;margin-bottom:6px;'; body.appendChild(st); }

      const teilaufgaben = gruppe.filter(a => String(a.nr) !== base);
      const anzeigeGruppe = teilaufgaben.length ? teilaufgaben : (hauptEintrag ? [] : gruppe);

      // Einzelne Aufgabe ohne Teilaufgaben
      if (gruppe.length === 1) {
        const a = gruppe[0];
        if (a.text) { const t = tx('div','',a.text); t.style.cssText='font-size:13px;color:var(--tx1);line-height:1.5;'; body.appendChild(t); }
        if (a.grafik) { const g = tx('div','','🖼 '+a.grafik); g.style.cssText='font-size:11px;color:var(--tx3);margin-top:3px;'; body.appendChild(g); }
      } else {
        // Teilaufgaben eingerückt
        anzeigeGruppe.forEach(a => {
          const urow = mk('div',''); urow.style.cssText='display:flex;gap:8px;align-items:baseline;padding:4px 0;border-top:1px solid var(--bord);font-size:13px;';
          const nrS = tx('strong','',String(a.nr||'?')); nrS.style.cssText='flex-shrink:0;min-width:32px;color:var(--tx2);';
          urow.appendChild(nrS);
          const col = mk('div',''); col.style.cssText='flex:1;display:flex;flex-direction:column;gap:2px;';
          if (a.aufgabenstellung) { const as = tx('span','',a.aufgabenstellung); as.style.cssText='font-style:italic;color:var(--tx2);'; col.appendChild(as); }
          if (a.text) { const t = tx('span','',a.text); t.style.color='var(--tx1)'; col.appendChild(t); }
          if (a.grafik) { const g = tx('span','','🖼 '+a.grafik); g.style.cssText='font-size:11px;color:var(--tx3);'; col.appendChild(g); }
          urow.appendChild(col);
          if (a.punkte) { const pt = tx('span','',a.punkte+'P'); pt.style.cssText='flex-shrink:0;font-size:11px;color:var(--tx3);'; urow.appendChild(pt); }
          body.appendChild(urow);
        });
      }
      card.appendChild(body); wrap.appendChild(card);
    });
  // Rückwärtskompatibilität: alte seiten-Daten
  } else if (aa.seiten?.length) {
    aa.seiten.forEach(s => {
      const card = mk('div', 'card');
      const body = mk('div', 'card-body');
      if (s.thema) { const h = tx('div', '', s.thema); h.style.cssText = 'font-weight:600;margin-bottom:6px;'; body.appendChild(h); }
      const p = tx('p', '', s.inhalt || '');
      p.style.cssText = 'font-size:13px;line-height:1.6;color:var(--tx2);white-space:pre-wrap;';
      body.appendChild(p);
      card.appendChild(body); div.appendChild(card);
    });
  }
  return div;
}

// ── Neue Alte Arbeit Modal ────────────────────────────────────────
function showNeueAlteArbeitModal() {
  const ov = mk('div', 'matd-overlay');
  const pan = mk('div', 'matd-panel'); pan.style.maxWidth = '520px';
  const phdr = mk('div', 'matd-panel-hdr');
  phdr.appendChild(tx('span', 'matd-panel-title', 'Alte Arbeit hinzufügen'));
  const cls = btn('✕', 'btn btn-ghost btn-sm matd-close');
  const close = () => ov.remove(); cls.onclick = close; phdr.appendChild(cls); pan.appendChild(phdr);
  ov.onclick = e => { if (e.target === ov) close(); };

  const body = mk('div', 'matd-panel-body');
  body.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:10px;';

  function field(label, inp) { const fg = mk('div','fg'); fg.appendChild(tx('label','fl',label)); fg.appendChild(inp); return fg; }

  const titelInp = document.createElement('input'); titelInp.className = 'finp'; titelInp.placeholder = 'z.B. Klassenarbeit 3 – Terme';
  body.appendChild(field('Titel *', titelInp));

  const kursSel = document.createElement('select'); kursSel.className = 'finp';
  const noK = document.createElement('option'); noK.value = ''; noK.textContent = '– kein Kurs –'; kursSel.appendChild(noK);
  (S.data?.kurse || []).forEach(k => {
    const fp = (S.data?.fachplanungen||[]).find(f => f.id === k.fachplanungId);
    const o = document.createElement('option'); o.value = k.id;
    o.textContent = k.klasse + ' · ' + (fp ? fp.fach : '?') + ' ' + k.schuljahr;
    kursSel.appendChild(o);
  });
  body.appendChild(field('Kurs', kursSel));

  const datumInp = document.createElement('input'); datumInp.type = 'date'; datumInp.className = 'finp';
  body.appendChild(field('Datum', datumInp));

  const dauerInp = document.createElement('input'); dauerInp.type = 'number'; dauerInp.className = 'finp'; dauerInp.placeholder = 'Minuten'; dauerInp.step = 5;
  body.appendChild(field('Dauer (Min.)', dauerInp));

  // Upload
  let uploadedImgs = [];
  const zone = mk('div',''); zone.style.cssText = 'border:2px dashed var(--bord);border-radius:8px;padding:20px;text-align:center;cursor:pointer;color:var(--tx3);';
  zone.textContent = 'Seiten der Arbeit hochladen — hierhin ziehen oder klicken';
  const fileInp = document.createElement('input'); fileInp.type='file'; fileInp.accept='image/*,.pdf'; fileInp.multiple=true; fileInp.style.display='none';
  zone.onclick = () => fileInp.click();
  zone.ondragover = e => { e.preventDefault(); zone.style.borderColor='var(--pri)'; };
  zone.ondragleave = () => { zone.style.borderColor='var(--bord)'; };
  const thumbsRow = mk('div',''); thumbsRow.style.cssText='display:flex;flex-wrap:wrap;gap:6px;';
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
    zone.textContent = uploadedImgs.length ? uploadedImgs.length+' Seite(n) bereit' : 'Seiten der Arbeit hochladen — hierhin ziehen oder klicken';
    thumbsRow.innerHTML='';
    uploadedImgs.forEach((src,i)=>{ const th=mk('img',''); th.src=src; th.style.cssText='width:55px;height:55px;object-fit:cover;border-radius:4px;cursor:pointer;'; th.onclick=()=>{uploadedImgs.splice(i,1);updateZone();}; thumbsRow.appendChild(th); });
  }
  zone.ondrop = e => { e.preventDefault(); zone.style.borderColor='var(--bord)'; addImgs(e.dataTransfer.files); };
  fileInp.onchange = () => { addImgs(fileInp.files); fileInp.value=''; };
  body.appendChild(zone); body.appendChild(thumbsRow); body.appendChild(fileInp);

  const statusEl = mk('div',''); statusEl.style.cssText='font-size:13px;color:var(--tx2);min-height:18px;';
  body.appendChild(statusEl);

  const btnRow = mk('div',''); btnRow.style.cssText='display:flex;gap:8px;';
  const saveBtn = btn('✨ KI liest aus & speichern', 'btn btn-pri btn-sm');
  const cancelB = btn('Abbrechen','btn btn-ghost btn-sm'); cancelB.onclick=close;
  btnRow.appendChild(saveBtn); btnRow.appendChild(cancelB); body.appendChild(btnRow);

  saveBtn.onclick = async () => {
    const titel = titelInp.value.trim();
    if (!titel) { alert('Bitte Titel eingeben.'); return; }
    if (!uploadedImgs.length) { alert('Bitte Seiten hochladen.'); return; }
    saveBtn.disabled = true;

    const kursId = kursSel.value || null;
    const kurs = kursId ? (S.data?.kurse||[]).find(k=>k.id===kursId) : null;
    const fp = kurs ? (S.data?.fachplanungen||[]).find(f=>f.id===kurs.fachplanungId) : null;

    try {
      // Aufgaben-Extraktion (JSON, mit Nummer + Punkte)
      const allAufgaben = [];
      for (let i = 0; i < uploadedImgs.length; i += 4) {
        const batch = uploadedImgs.slice(i, i+4);
        const end = Math.min(i+4, uploadedImgs.length);
        statusEl.textContent = `⏳ Lese Seite ${i+1}–${end} von ${uploadedImgs.length}…`;
        const resized = await Promise.all(batch.map(img => new Promise((res,rej) => {
          const image=new Image(); image.onload=()=>{
            const scale=image.width>1200?1200/image.width:1;
            const c=document.createElement('canvas'); c.width=Math.round(image.width*scale); c.height=Math.round(image.height*scale);
            c.getContext('2d').drawImage(image,0,0,c.width,c.height); res(c.toDataURL('image/jpeg',0.85));
          }; image.onerror=rej; image.src=img;
        })));
        const blocks = [
          ...resized.map((r,j) => [
            { type:'image', source:{type:'base64',media_type:'image/jpeg',data:r.split(',')[1]} },
            ...(j<batch.length-1?[{type:'text',text:'--- Nächste Seite ---'}]:[])
          ]).flat(),
          { type:'text', text: KI_PROMPT_ALTE_ARBEIT }
        ];
        const raw = await callKI(blocks, 6000);
        let parsed;
        try { parsed = robustJsonParsePr(raw); }
        catch(e) { throw new Error('KI-Antwort konnte nicht gelesen werden (Seiten ' + (i+1) + '–' + end + ')'); }
        (parsed.aufgaben || []).forEach(a => { a.id = uid(); allAufgaben.push(a); });
      }
      statusEl.textContent = '✓ ' + allAufgaben.length + ' Aufgaben aus ' + uploadedImgs.length + ' Seiten extrahiert';

      const aa = {
        id: uid(), titel,
        kursId, kursLabel: kurs ? kurs.klasse+(fp?' · '+fp.fach:'') : null,
        datum: datumInp.value || null,
        dauer: dauerInp.value ? parseInt(dauerInp.value) : null,
        aufgaben: allAufgaben, erstellt: new Date().toISOString(),
      };
      ALTE_ARBEITEN_DB.push(aa);
      saveAlteArbeitenDB();
      PR.aktAlteArbeitId = aa.id; PR.view = 'alte_arbeit'; PR.aktId = null;
      close(); renderPr();
    } catch(e) {
      statusEl.textContent = '⚠ ' + e.message;
      saveBtn.disabled = false;
    }
  };

  pan.appendChild(body); ov.appendChild(pan);
  document.getElementById('root').appendChild(ov);
  ov.classList.add('open');
}

// ── Quellen-Tab ───────────────────────────────────────────────────
function buildQuellenTab(pr) {
  const div = mk('div', '');
  if (!pr.quellen) pr.quellen = { kapitel: [], material: [], alteArbeiten: [] };

  // Fach der Prüfung ermitteln (für Filterung)
  const prKurs = pr.kursId ? (S.data?.kurse||[]).find(k=>k.id===pr.kursId) : null;
  const prFp   = prKurs ? (S.data?.fachplanungen||[]).find(f=>f.id===prKurs.fachplanungId) : null;
  const prFach = prFp?.fach || null;
  // Fachplanung-Code ('M','Ch','Bio',...) → Schulbuch-Code ('mathe','chemie','bio')
  function toSchulbuchFach(f) {
    if (!f) return null;
    if (f === 'M') return 'mathe';
    if (f.startsWith('Ch')) return 'chemie';
    if (f.startsWith('Bio')) return 'bio';
    return null;
  }
  const prFachSb = toSchulbuchFach(prFach);

  // ── Alte Arbeiten ──────────────────────────────────────────────
  const aaHdr = tx('div', '', 'Alte Arbeiten als Vorlage');
  aaHdr.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);padding:6px 0 4px;border-bottom:2px solid var(--pri);margin-bottom:8px;';
  div.appendChild(aaHdr);

  // Alte Arbeiten nach Klasse gruppieren
  const aaGleiche  = ALTE_ARBEITEN_DB.filter(aa => aa.kursId && aa.kursId === pr.kursId);
  const aaAndere   = ALTE_ARBEITEN_DB.filter(aa => !(aa.kursId && aa.kursId === pr.kursId));

  function addAaRow(aa) {
    const row = mk('div',''); row.style.cssText='display:flex;align-items:center;gap:10px;padding:5px 8px;border-radius:6px;cursor:pointer;';
    row.onmouseenter=()=>{row.style.background='var(--surf2)';}; row.onmouseleave=()=>{row.style.background='';};
    const cb = document.createElement('input'); cb.type='checkbox'; cb.style.cssText='accent-color:var(--pri);width:15px;height:15px;flex-shrink:0;';
    cb.checked = pr.quellen.alteArbeiten.includes(aa.id);
    cb.onchange = () => {
      if (cb.checked) pr.quellen.alteArbeiten.push(aa.id);
      else pr.quellen.alteArbeiten = pr.quellen.alteArbeiten.filter(id=>id!==aa.id);
      savePruefungsDB();
    };
    const info = mk('div','');
    info.appendChild(tx('div','',aa.titel)); info.lastChild.style.cssText='font-size:13px;font-weight:500;';
    if (aa.kursLabel) { info.appendChild(tx('div','',aa.kursLabel)); info.lastChild.style.cssText='font-size:11px;color:var(--tx3);'; }
    row.onclick = e => { if(e.target===cb)return; cb.checked=!cb.checked; cb.onchange(); };
    row.appendChild(cb); row.appendChild(info);
    div.appendChild(row);
  }

  if (!ALTE_ARBEITEN_DB.length) {
    const hint = tx('div', '', 'Noch keine alten Arbeiten gespeichert.');
    hint.style.cssText = 'font-size:13px;color:var(--tx3);margin-bottom:16px;';
    div.appendChild(hint);
  } else {
    if (aaGleiche.length) {
      const gl = tx('div','','Diese Klasse'); gl.style.cssText='font-size:11px;color:var(--tx3);font-weight:600;margin:4px 0 2px 8px;';
      div.appendChild(gl);
      aaGleiche.forEach(addAaRow);
    }
    if (aaAndere.length) {
      const an = tx('div','','Andere'); an.style.cssText='font-size:11px;color:var(--tx3);font-weight:600;margin:8px 0 2px 8px;';
      div.appendChild(an);
      aaAndere.forEach(addAaRow);
    }
  }

  // ── Schulbücher ────────────────────────────────────────────────
  const spacer = mk('div',''); spacer.style.height='16px'; div.appendChild(spacer);
  const sbHdr = tx('div', '', 'Schulbuch-Kapitel');
  sbHdr.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);padding:6px 0 4px;border-bottom:2px solid var(--pri);margin-bottom:8px;';
  div.appendChild(sbHdr);

  // Nur Bücher zum gleichen Fach anzeigen
  const passendeBuecher = SCHULBUCHDB.filter(b => !prFachSb || b.fach === prFachSb);

  if (!passendeBuecher.length) {
    const noSb = tx('div','', prFachSb ? 'Keine Schulbücher für dieses Fach.' : 'Keine Schulbücher in der Datenbank.');
    noSb.style.cssText='font-size:13px;color:var(--tx3);'; div.appendChild(noSb);
  } else {
    passendeBuecher.forEach(buch => {
      const buchHdr = tx('div','', (buch.titel||'–'));
      buchHdr.style.cssText='font-size:12px;font-weight:600;color:var(--tx2);margin:6px 0 3px 0;';
      div.appendChild(buchHdr);
      (buch.kapitel||[]).forEach(kap => {
        const row = mk('div',''); row.style.cssText='display:flex;align-items:center;gap:10px;padding:3px 8px;border-radius:5px;cursor:pointer;';
        row.onmouseenter=()=>{row.style.background='var(--surf2)';}; row.onmouseleave=()=>{row.style.background='';};
        const cb = document.createElement('input'); cb.type='checkbox'; cb.style.cssText='accent-color:var(--pri);width:14px;height:14px;flex-shrink:0;';
        cb.checked = pr.quellen.kapitel.includes(kap.id);
        cb.onchange = () => {
          if (cb.checked) pr.quellen.kapitel.push(kap.id);
          else pr.quellen.kapitel = pr.quellen.kapitel.filter(id=>id!==kap.id);
          savePruefungsDB();
        };
        const lbl = tx('span','', 'Kap. '+kap.nr+': '+kap.titel+(kap.seiteVon&&kap.seiteBis?' (S.'+kap.seiteVon+'–'+kap.seiteBis+')':''));
        lbl.style.cssText='font-size:12px;color:var(--tx2);';
        row.onclick=e=>{if(e.target===cb)return;cb.checked=!cb.checked;cb.onchange();};
        row.appendChild(cb); row.appendChild(lbl); div.appendChild(row);
      });
    });
  }

  return div;
}

// ── Aufgaben-Tab: KI-Generierung ─────────────────────────────────
function buildAufgabenGenTab(pr) {
  const div = mk('div', '');
  if (!pr.genAufgaben) pr.genAufgaben = [];
  if (!pr.strukturVorschlag) pr.strukturVorschlag = [];
  if (!pr.feinstruktur) pr.feinstruktur = [];
  if (typeof pr.grobstrukturLocked !== 'boolean') pr.grobstrukturLocked = !!pr.feinstruktur.length;

  function getActiveTasks() {
    return pr.strukturVorschlag.filter(a => !a._removed);
  }
  function ensureTaskMeta() {
    pr.strukturVorschlag.forEach(aufg => {
      if (!aufg.taskId) aufg.taskId = uid();
      if (typeof aufg._grobUnlocked !== 'boolean') aufg._grobUnlocked = !pr.grobstrukturLocked;
      if (typeof aufg._needsFeinUpdate !== 'boolean') aufg._needsFeinUpdate = false;
    });
    const aktive = getActiveTasks();
    pr.feinstruktur.forEach((fs, idx) => {
      if (!fs.taskId && aktive[idx]) fs.taskId = aktive[idx].taskId;
    });
    pr.genAufgaben.forEach((ga, idx) => {
      if (!ga.taskId) {
        const fsMatch = pr.feinstruktur.find(fs => fs.nr === ga.nr) || pr.feinstruktur[idx];
        ga.taskId = fsMatch?.taskId || aktive[idx]?.taskId || uid();
      }
    });
    pr.feinstruktur.forEach(fs => {
      if (typeof fs._feinLocked !== 'boolean') fs._feinLocked = false;
    });
  }
  function isTaskFeinLocked(taskId) {
    return !!pr.feinstruktur.find(fs => fs.taskId === taskId)?._feinLocked;
  }
  function syncDerivedOrder() {
    const order = getActiveTasks().map(a => a.taskId);
    const orderIdx = id => {
      const idx = order.indexOf(id);
      return idx < 0 ? 9999 : idx;
    };
    pr.feinstruktur.sort((a, b) => orderIdx(a.taskId) - orderIdx(b.taskId));
    pr.genAufgaben.sort((a, b) => orderIdx(a.taskId) - orderIdx(b.taskId));
    pr.feinstruktur.forEach((fs, idx) => { fs.nr = idx + 1; });
    pr.genAufgaben.forEach((ga, idx) => {
      ga.nr = idx + 1;
      const fs = pr.feinstruktur.find(x => x.taskId === ga.taskId);
      if (fs) ga.titel = fs.titel;
    });
  }
  function invalidateGeneratedTask(taskId) {
    pr.genAufgaben = pr.genAufgaben.filter(ga => ga.taskId !== taskId);
  }
  function markTaskDirty(aufg) {
    aufg._needsFeinUpdate = true;
    invalidateGeneratedTask(aufg.taskId);
    savePruefungsDB();
  }
  function buildFeinstrukturPrompt(aufg, aufgNr, lernziele, ideenPool) {
    let p = `Du planst Aufgabe ${aufgNr} einer Klassenarbeit.\n`;
    p += `Thema/Titel: ${aufg.titel}\n`;
    p += `Beschreibung: ${aufg.beschreibung}\n`;
    p += `Zeit: ${aufg.zeitMinuten ?? '?'} Min, ${aufg.gesamtpunkte ?? '?'} Punkte\n`;
    p += `Aufgabentypen: ${(aufg.typen||[]).join(', ')}\n`;
    const anf2 = aufg.anforderung || {};
    const erlaubt2 = Object.keys(AB_KEY_MAP).filter(k => (anf2[k] || 0) > 0);
    const verboten2 = Object.keys(AB_KEY_MAP).filter(k => (anf2[k] || 0) === 0);
    if (erlaubt2.length) {
      p += `\n## ANFORDERUNGSBEREICHE — VERBINDLICH\nErlaubt: ${erlaubt2.join(', ')}\n`;
      if (verboten2.length) p += `VERBOTEN (keinesfalls verwenden): ${verboten2.join(', ')}\n`;
    }
    p += '\n';
    if (lernziele.length) { p += 'Relevante Lernziele:\n'; lernziele.slice(0,8).forEach(lz => { p += `- ${lz}\n`; }); p += '\n'; }
    const relevanteIdeen = ideenPool.filter(idea => idea.toLowerCase().includes((aufg.titel||'').toLowerCase().split(' ')[0])).slice(0,8);
    if (relevanteIdeen.length) { p += 'Ähnliche Aufgaben aus Quellen (zur Inspiration):\n'; relevanteIdeen.forEach(idea => { p += `- ${idea}\n`; }); p += '\n'; }
    p += `Beschreibe die Unteraufgaben in kompakter Kurzform.
Für jede Unteraufgabe mit Pfeil: zuerst Anforderungsbereich (NUR erlaubte: ${erlaubt2.length ? erlaubt2.join(', ') : 'alle'}), dann | dann Kennung: Vorgabe → Schülertätigkeit.
Allgemeine Hinweise (Gesamtzahl, Reihenfolge) als eigene Zeile ohne Pfeil und ohne |.

FORMAT (genau so, kein Fließtext):
anforderungsbereich|Kennung: Vorgabe → Schülertätigkeit · ggf. weiteres

Antworte NUR mit reinem JSON:
{"spezifikation":"5 Unteraufgaben, steigend schwerer\\nreproduktion|1a–1c: Bruch → Dezimalzahl · Prozent\\nleichteAnwendung|1d–1e: Dezimalzahl → Bruch · Prozent\\nmittlereAnwendung|1f: Sachtext (Prozentwert gegeben) → Grundwert berechnen"}`;
    return p;
  }
  async function generateFeinstrukturForTask(aufg, aufgNr, lernziele, ideenPool) {
    let spezifikation = '';
    try {
      const raw = await callKI([{ type: 'text', text: buildFeinstrukturPrompt(aufg, aufgNr, lernziele, ideenPool) }], 1500);
      const parsed = parseKI(raw);
      spezifikation = parsed.spezifikation || '';
    } catch (parseErr) {
      spezifikation = '⚠ KI-Fehler: ' + parseErr.message.slice(0, 80);
    }
    return {
      taskId: aufg.taskId,
      nr: aufgNr,
      titel: aufg.titel,
      zeitMinuten: aufg.zeitMinuten,
      gesamtpunkte: aufg.gesamtpunkte,
      typen: aufg.typen,
      anforderung: aufg.anforderung,
      spezifikation,
    };
  }
  function countSpecStats(specText) {
    const lines = (specText || '').split('\n').map(l => l.replace(/^[-–•]\s*/, '').trim()).filter(Boolean);
    let teilaufgaben = 0;
    let punkte = 0;
    lines.forEach(line => {
      if (!line.includes('→')) return;
      teilaufgaben++;
      const lastPipe = line.lastIndexOf('|');
      if (lastPipe > -1) {
        const maybeP = line.slice(lastPipe + 1).trim();
        if (/^\d+$/.test(maybeP)) punkte += parseInt(maybeP);
      }
    });
    return { teilaufgaben, punkte };
  }
  function distributePointsAcrossSpec(fs) {
    const lines = (fs.spezifikation || '').split('\n').map(l => l.replace(/^[-–•]\s*/, '').trim()).filter(Boolean);
    const idxs = lines.map((line, idx) => line.includes('→') ? idx : -1).filter(idx => idx > -1);
    if (!idxs.length || !fs.gesamtpunkte) return false;
    const base = Math.floor(fs.gesamtpunkte / idxs.length);
    let rest = fs.gesamtpunkte - base * idxs.length;
    idxs.forEach((lineIdx, pos) => {
      let line = lines[lineIdx];
      const lastPipe = line.lastIndexOf('|');
      if (lastPipe > -1) {
        const maybeP = line.slice(lastPipe + 1).trim();
        if (/^\d+$/.test(maybeP)) line = line.slice(0, lastPipe).trim();
      }
      const p = base + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      lines[lineIdx] = line + '|' + p;
    });
    fs.spezifikation = lines.map(l => '- ' + l).join('\n');
    return true;
  }
  async function reviseFeinstrukturTask(fs, instruction, label) {
    const erlaubt = Object.keys(AB_KEY_MAP).filter(k => (fs.anforderung?.[k] || 0) > 0);
    let p = `Du überarbeitest die Feinstruktur einer einzelnen Klassenarbeits-Aufgabe.\n\n`;
    p += `Aufgabe ${fs.nr}: ${fs.titel}\n`;
    p += `Zeit: ${fs.zeitMinuten ?? '?'} Min, ${fs.gesamtpunkte ?? '?'} Punkte\n`;
    if (erlaubt.length) p += `Erlaubte Anforderungsbereiche: ${erlaubt.join(', ')}\n`;
    p += `\nAKTUELLE FEINSTRUKTUR\n${fs.spezifikation}\n\n`;
    p += `AUFTRAG\n${instruction}\n\n`;
    p += `WICHTIG\n- Behalte Thema und Grundidee der Aufgabe bei\n- Überarbeite nur die Feinstruktur, nicht die ganze Klassenarbeit\n- Wenn Punkteangaben vorhanden sind, liefere weiter Punkte pro Teilaufgabe mit |Zahl\n- Verwende nur diese Anforderungsbereiche: ${erlaubt.length ? erlaubt.join(', ') : 'reproduktion, leichteAnwendung, mittlereAnwendung, transfer'}\n- Gib nur die neue Feinstruktur zurück, kein Kommentar\n\n`;
    p += `Antworte NUR mit reinem JSON:\n{"spezifikation":"reproduktion|1a: ... → ...|2\\nleichteAnwendung|1b: ... → ...|3"}`;
    statusEl.textContent = `⏳ Feinstruktur wird überarbeitet (${label})...`;
    const raw = await callKI([{ type: 'text', text: p }], 1800);
    const parsed = parseKI(raw);
    if (!parsed.spezifikation) throw new Error('Keine neue Feinstruktur erhalten');
    fs.spezifikation = parsed.spezifikation;
    invalidateGeneratedTask(fs.taskId);
    savePruefungsDB();
  }

  ensureTaskMeta();
  syncDerivedOrder();

  const AB_KEY_MAP = {
    reproduktion:      { letter: 'R', color: '#16a34a', title: 'Reproduktion' },
    leichteAnwendung:  { letter: 'A', color: '#ca8a04', title: 'Leichte Anwendung' },
    mittlereAnwendung: { letter: 'A', color: '#ea580c', title: 'Mittlere Anwendung' },
    transfer:          { letter: 'T', color: '#dc2626', title: 'Transfer' },
  };

  // ── Sub-Tab-Gerüst ────────────────────────────────────────────
  const panel1 = mk('div', '');
  const panel2 = mk('div', '');
  const panel3 = mk('div', '');
  const panel4 = mk('div', '');
  let aktiverSubTab = pr.genAufgaben.length ? 3 : pr.feinstruktur.length ? 2 : 1;

  const subTabBar = mk('div', '');
  subTabBar.style.cssText = 'display:flex;gap:0;border-bottom:2px solid var(--bord);margin-bottom:18px;';

  function switchSubTab(n) {
    aktiverSubTab = n;
    [panel1, panel2, panel3, panel4].forEach((p, i) => { p.style.display = i + 1 === n ? '' : 'none'; });
    subTabBar.querySelectorAll('.ag-subtab').forEach((b, i) => {
      const active = i + 1 === n;
      b.style.borderBottom = active ? '2px solid var(--pri)' : '2px solid transparent';
      b.style.color = active ? 'var(--pri)' : 'var(--tx2)';
      b.style.fontWeight = active ? '700' : '400';
    });
  }

  [
    ['① Grobstruktur', 1],
    ['② Feinstruktur', 2],
    ['③ Aufgaben',     3],
    ['⚙ Einstellungen', 4],
  ].forEach(([label, n]) => {
    const b = mk('button', 'btn btn-ghost btn-sm ag-subtab');
    b.textContent = label;
    b.style.cssText = 'border-radius:6px 6px 0 0;border-bottom:2px solid transparent;margin-bottom:-2px;padding:6px 14px;font-size:13px;';
    b.onclick = () => switchSubTab(n);
    subTabBar.appendChild(b);
  });

  // ── Referenzzeitraum ──────────────────────────────────────────
  const zeitRow = mk('div', '');
  zeitRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:13px;color:var(--tx2);flex-wrap:wrap;';
  zeitRow.appendChild(tx('span', '', 'Die KI nutzt die Arbeiten der letzten'));
  const jahrInp = document.createElement('input');
  jahrInp.type = 'number'; jahrInp.step = '0.5'; jahrInp.min = '0.5'; jahrInp.max = '10';
  jahrInp.value = pr.referenzJahre ?? 2;
  jahrInp.style.cssText = 'width:58px;padding:4px 8px;border:1px solid var(--bord);border-radius:5px;background:var(--surf2);color:var(--tx1);font-size:13px;text-align:center;';
  jahrInp.onchange = () => { pr.referenzJahre = parseFloat(jahrInp.value) || 2; savePruefungsDB(); };
  zeitRow.appendChild(jahrInp);
  zeitRow.appendChild(tx('span', '', 'Jahre als Referenz für den Kompositionsstil.'));
  panel4.appendChild(zeitRow);

  // ── Kompositionsstil ─────────────────────────────────────────
  const stilSec = mk('div', '');
  stilSec.style.cssText = 'margin-bottom:20px;';
  const stilHdr = mk('div', '');
  stilHdr.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
  stilHdr.appendChild(tx('span', '', 'Mein Kompositionsstil'));
  stilHdr.lastChild.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);';
  const resetBtn = btn('Zurücksetzen', 'btn btn-ghost btn-xs');
  resetBtn.style.marginLeft = 'auto';
  stilHdr.appendChild(resetBtn);
  stilSec.appendChild(stilHdr);

  const stilArea = document.createElement('textarea');
  stilArea.value = KOMPOSITIONSSTIL;
  stilArea.style.cssText = 'width:100%;min-height:110px;padding:10px;font-size:13px;line-height:1.6;border:1px solid var(--bord);border-radius:6px;background:var(--surf2);color:var(--tx1);resize:vertical;box-sizing:border-box;';
  stilArea.oninput = () => { KOMPOSITIONSSTIL = stilArea.value; saveKompositionsstil(); };
  resetBtn.onclick = () => { KOMPOSITIONSSTIL = KOMPOSITIONSSTIL_DEFAULT; stilArea.value = KOMPOSITIONSSTIL; saveKompositionsstil(); };
  stilSec.appendChild(stilArea);

  const stilHint = tx('div', '', 'Gilt für alle Prüfungen. Die KI nutzt dies zusätzlich zur Analyse deiner Referenzarbeiten.');
  stilHint.style.cssText = 'font-size:11px;color:var(--tx3);margin-top:4px;';
  stilSec.appendChild(stilHint);
  panel4.appendChild(stilSec);

  // ── AFB-Zielkorridore in Einstellungen ────────────────────────
  const afbZielSec = mk('div', '');
  afbZielSec.style.cssText = 'margin-top:24px;';
  const afbZielHdr = tx('div', '', 'Zielkorridore Anforderungsbereiche');
  afbZielHdr.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);margin-bottom:10px;';
  afbZielSec.appendChild(afbZielHdr);

  if (!pr.afbZiele) pr.afbZiele = { afb1: { min: 30, max: 50 }, afb2: { min: 35, max: 50 }, afb3: { min: 15, max: 25 } };

  [
    { key: 'afb1', label: 'AFB I', sub: 'Reproduktion + Leichte Anwendung', color: '#ca8a04' },
    { key: 'afb2', label: 'AFB II', sub: 'Mittlere Anwendung', color: '#ea580c' },
    { key: 'afb3', label: 'AFB III', sub: 'Transfer', color: '#dc2626' },
  ].forEach(({ key, label, sub, color }) => {
    const row = mk('div', '');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;';
    const lbl = mk('div', '');
    lbl.style.cssText = 'min-width:80px;';
    lbl.appendChild(tx('span', '', label)).style || (lbl.lastChild.style.cssText = `font-size:13px;font-weight:700;color:${color};`);
    lbl.appendChild(tx('div', '', sub)).style || (lbl.lastChild.style.cssText = 'font-size:11px;color:var(--tx3);');
    row.appendChild(lbl);
    const makeZielInp = (field) => {
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = 0; inp.max = 100; inp.step = 5;
      inp.value = pr.afbZiele[key][field];
      inp.style.cssText = 'width:54px;padding:4px 8px;border:1px solid var(--bord);border-radius:5px;background:var(--surf2);color:var(--tx1);font-size:13px;text-align:center;';
      inp.onchange = () => { pr.afbZiele[key][field] = parseInt(inp.value) || 0; savePruefungsDB(); renderAFBBanner(); };
      return inp;
    };
    row.appendChild(tx('span', '', 'Min'));
    row.lastChild.style.cssText = 'font-size:12px;color:var(--tx3);';
    row.appendChild(makeZielInp('min'));
    row.appendChild(tx('span', '', '%  —  Max'));
    row.lastChild.style.cssText = 'font-size:12px;color:var(--tx3);';
    row.appendChild(makeZielInp('max'));
    row.appendChild(tx('span', '', '%'));
    row.lastChild.style.cssText = 'font-size:12px;color:var(--tx3);';
    afbZielSec.appendChild(row);
  });
  panel4.appendChild(afbZielSec);

  const statusEl = mk('div', '');
  statusEl.style.cssText = 'font-size:13px;color:var(--tx2);min-height:18px;margin:8px 0 12px;';

  // ── Quellen-Kontext aufbauen (shared) ─────────────────────────
  function buildKontext() {
    const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - (pr.referenzJahre ?? 2) * msPerYear);
    const refArbeiten = ALTE_ARBEITEN_DB.filter(aa => aa.datum && new Date(aa.datum) >= cutoff);
    const quellenAA = (pr.quellen?.alteArbeiten || []).map(id => ALTE_ARBEITEN_DB.find(aa => aa.id === id)).filter(Boolean);
    const quellenKap = [];
    (pr.quellen?.kapitel || []).forEach(kapId => {
      SCHULBUCHDB.forEach(buch => {
        (buch.kapitel || []).forEach(kap => {
          if (kap.id === kapId) quellenKap.push({ buch: buch.titel, kap });
          (kap.unterkapitel || []).forEach(u => { if (u.id === kapId) quellenKap.push({ buch: buch.titel, kap: u }); });
        });
      });
    });
    const lernziele = [];
    (pr.ausgewaehlteLernziele || []).forEach(lzId => {
      CHECKLISTDB.forEach(cl => { (cl.lernziele || []).forEach(lz => { if (lz.id === lzId) lernziele.push(lz.text); }); });
    });
    const ideenPool = [];
    quellenAA.forEach(aa => (aa.aufgaben || []).forEach(a => {
      if (a.text || a.aufgabenstellung) ideenPool.push(`[${aa.titel}] ${(a.aufgabenstellung || '') + ' ' + (a.text || '')}`.trim().slice(0, 120));
    }));
    quellenKap.forEach(({ buch, kap }) => (kap.aufgaben || []).forEach(a => {
      if (a.text || a.aufgabenstellung) ideenPool.push(`[${buch}/${kap.titel}] ${(a.aufgabenstellung || '') + ' ' + (a.text || '')}`.trim().slice(0, 120));
    }));
    return { refArbeiten, lernziele, ideenPool };
  }

  function parseKI(raw) {
    const cleaned = raw.replace(/^```[a-z]*\n?/m, '').replace(/```\s*$/m, '').trim();
    try { return robustJsonParsePr(cleaned); }
    catch (e) {
      const preview = cleaned.slice(0, 200).replace(/\n/g, ' ');
      throw new Error('JSON-Fehler: ' + preview);
    }
  }

  function stufenLabel(n) {
    const el = tx('div', '', 'Stufe ' + n);
    el.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);padding:16px 0 6px;border-top:2px solid var(--bord);margin-top:8px;';
    return el;
  }

  // ════════════════════════════════════════════════════════════════
  // STUFE 1: Grobstruktur
  // ════════════════════════════════════════════════════════════════
  const strukturWrap = mk('div', ''); strukturWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:10px;';
  panel1.appendChild(strukturWrap);

  const gesamtEl = mk('div', ''); // laufende Summe Zeit + Punkte
  gesamtEl.style.cssText = 'font-size:12px;font-weight:600;padding:6px 0;min-height:18px;';

  function updateGesamt() {
    const aktiv = pr.strukturVorschlag.filter(a => !a._removed);
    const zeit = aktiv.reduce((s, a) => s + (a.zeitMinuten || 0), 0);
    const punkte = aktiv.reduce((s, a) => s + (a.gesamtpunkte || 0), 0);
    const zMin = pr.dauerVon || 0, zMax = pr.dauerBis || pr.dauerVon || 999;
    const zeitOk = zeit >= zMin && zeit <= zMax;
    gesamtEl.textContent = `Gesamt: ${zeit} Min. · ${punkte} P`;
    gesamtEl.style.color = zMin && !zeitOk ? '#dc2626' : '#16a34a';
    if (zMin) gesamtEl.textContent += ` (Ziel: ${zMin}${zMax !== zMin ? '–'+zMax : ''} Min.)`;
  }

  // Anforderungs-Stempel
  const AB_CFG = [
    { key: 'reproduktion',     letter: 'R', color: '#16a34a', title: 'Reproduktion' },
    { key: 'leichteAnwendung', letter: 'A', color: '#ca8a04', title: 'Leichte Anwendung' },
    { key: 'mittlereAnwendung',letter: 'A', color: '#ea580c', title: 'Mittlere Anwendung' },
    { key: 'transfer',         letter: 'T', color: '#dc2626', title: 'Transfer' },
  ];
  function makeStempel(anforderung, onToggle) {
    if (!anforderung) anforderung = {};
    const wrap = mk('div', ''); wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;align-items:center;flex-shrink:0;margin-right:4px;padding-top:2px;';
    AB_CFG.forEach(cfg => {
      const active = !!(anforderung[cfg.key]);
      const s = tx('div', '', cfg.letter);
      s.title = (active ? 'Aktiv – klicken zum Deaktivieren: ' : 'Inaktiv – klicken zum Aktivieren: ') + cfg.title;
      s.style.cssText = `width:22px;height:22px;border-radius:50%;background:${active ? cfg.color : 'var(--bord)'};color:${active ? '#fff' : 'var(--tx3)'};font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;transition:background .15s,color .15s;`;
      if (onToggle) s.onclick = e => { e.stopPropagation(); onToggle(cfg.key); };
      wrap.appendChild(s);
    });
    return wrap;
  }

  // Drag-to-Reorder
  let dragSrc = null;
  function addDragHandlers(card, handle, index) {
    handle.draggable = true;
    handle.ondragstart = e => { dragSrc = index; card.style.opacity = '.5'; e.dataTransfer.effectAllowed = 'move'; };
    handle.ondragend = () => { card.style.opacity = ''; };
    card.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; card.style.background = 'var(--surf)'; };
    card.ondragleave = () => { card.style.background = ''; };
    card.ondrop = e => {
      e.preventDefault(); card.style.background = '';
      if (dragSrc === null || dragSrc === index) return;
      const arr = pr.strukturVorschlag;
      const [moved] = arr.splice(dragSrc, 1);
      arr.splice(index, 0, moved);
      savePruefungsDB(); renderStruktur(); renderAFBBanner();
    };
  }

  function renderStruktur() {
    strukturWrap.innerHTML = '';
    if (!pr.strukturVorschlag.length) { updateGesamt(); return; }
    let posNr = 0;
    pr.strukturVorschlag.forEach((aufg, idx) => {
      const feinLocked = isTaskFeinLocked(aufg.taskId);
      const taskUnlocked = !feinLocked && (!pr.grobstrukturLocked || !!aufg._grobUnlocked);
      if (!aufg._removed) posNr++;
      const card = mk('div', '');
      card.style.cssText = 'border:1px solid var(--bord);border-radius:8px;background:var(--surf2);padding:10px 12px;display:flex;gap:0;' + (aufg._removed ? 'opacity:.35;' : '');

      // Linke Spalte: Drag-Handle + Stempel
      const leftCol = mk('div', ''); leftCol.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;margin-right:10px;flex-shrink:0;';
      const dragHandle = tx('div', '', '⠿'); // braille dots = drag indicator
      dragHandle.title = taskUnlocked ? 'Reihenfolge ändern' : 'Grobstruktur gesperrt';
      dragHandle.style.cssText = 'font-size:16px;color:var(--tx3);cursor:' + (taskUnlocked ? 'grab' : 'not-allowed') + ';user-select:none;line-height:1;' + (taskUnlocked ? '' : 'opacity:.45;');
      leftCol.appendChild(dragHandle);
      const stempel = makeStempel(aufg.anforderung, taskUnlocked ? key => {
        if (!aufg.anforderung) aufg.anforderung = {};
        aufg.anforderung[key] = aufg.anforderung[key] ? 0 : 1;
        if (pr.grobstrukturLocked) markTaskDirty(aufg); else savePruefungsDB();
        renderStruktur(); renderAFBBanner();
      } : null);
      leftCol.appendChild(stempel);
      card.appendChild(leftCol);

      // Rechte Spalte: Inhalt
      const rightCol = mk('div', ''); rightCol.style.flex = '1';

      // Titelzeile + Streichen-Button
      const hrow = mk('div', ''); hrow.style.cssText = 'display:flex;align-items:baseline;gap:8px;margin-bottom:4px;';
      hrow.appendChild(tx('strong', '', 'Aufgabe ' + (aufg._removed ? '–' : posNr) + ': ' + (aufg.titel || '–')));
      const spacer = mk('span', ''); spacer.style.flex = '1'; hrow.appendChild(spacer);
      if (pr.grobstrukturLocked) {
        const lockBtn = btn(feinLocked ? '🔐' : (taskUnlocked ? '🔓' : '🔒'), 'btn btn-ghost btn-xs');
        lockBtn.title = feinLocked ? 'Feinstruktur dieser Aufgabe ist gesperrt' : (taskUnlocked ? 'Aufgabe wieder sperren' : 'Diese Aufgabe zum Überarbeiten entsperren');
        lockBtn.onclick = () => {
          if (feinLocked) return;
          aufg._grobUnlocked = !aufg._grobUnlocked;
          if (!aufg._grobUnlocked) aufg._needsFeinUpdate = false;
          savePruefungsDB();
          renderStruktur();
        };
        hrow.appendChild(lockBtn);
      }
      const toggleBtn = btn(aufg._removed ? '+ Aufnehmen' : '✕', 'btn btn-ghost btn-xs');
      toggleBtn.title = aufg._removed ? 'Wieder aufnehmen' : 'Aufgabe streichen';
      toggleBtn.disabled = !taskUnlocked;
      toggleBtn.style.opacity = taskUnlocked ? '1' : '.45';
      toggleBtn.onclick = () => {
        aufg._removed = !aufg._removed;
        if (pr.grobstrukturLocked) markTaskDirty(aufg); else savePruefungsDB();
        syncDerivedOrder();
        renderStruktur(); renderAFBBanner();
      };
      hrow.appendChild(toggleBtn);
      rightCol.appendChild(hrow);

      if (aufg.beschreibung) { const b = tx('div', '', aufg.beschreibung); b.style.cssText = 'font-size:12px;color:var(--tx2);font-style:italic;margin-bottom:8px;'; rightCol.appendChild(b); }
      if (pr.grobstrukturLocked && !taskUnlocked) {
        const lockHint = tx('div', '', feinLocked ? 'Feinstruktur gesperrt' : 'Grobstruktur gesperrt');
        lockHint.style.cssText = 'font-size:11px;color:var(--tx3);margin-bottom:8px;';
        rightCol.appendChild(lockHint);
      }
      if (pr.grobstrukturLocked && taskUnlocked) {
        const unlockHint = tx('div', '', aufg._needsFeinUpdate ? 'Aenderungen offen - Feinplanung fuer diese Aufgabe neu laufen lassen.' : 'Diese Aufgabe ist entsperrt.');
        unlockHint.style.cssText = 'font-size:11px;color:var(--pri);margin-bottom:8px;';
        rightCol.appendChild(unlockHint);
      }

      // Regler Zeit + Punkte
      function makeSlider(label, unit, val, min, max, disabled, onChange) {
        const wrap = mk('div', ''); wrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';
        const lbl = tx('span', '', label); lbl.style.cssText = 'font-size:11px;color:var(--tx3);width:38px;flex-shrink:0;';
        wrap.appendChild(lbl);
        const slider = document.createElement('input'); slider.type = 'range';
        slider.min = min; slider.max = max; slider.step = 1; slider.value = val;
        slider.disabled = disabled;
        slider.style.cssText = 'flex:1;accent-color:var(--pri);height:4px;cursor:' + (disabled ? 'not-allowed' : 'pointer') + ';' + (disabled ? 'opacity:.45;' : '');
        const valEl = tx('span', '', val + ' ' + unit);
        valEl.style.cssText = 'font-size:12px;font-weight:600;width:48px;text-align:right;flex-shrink:0;' + (disabled ? 'opacity:.45;' : '');
        slider.oninput = () => { const n = parseInt(slider.value); valEl.textContent = n + ' ' + unit; onChange(n); updateGesamt(); };
        wrap.appendChild(slider); wrap.appendChild(valEl);
        return wrap;
      }
      rightCol.appendChild(makeSlider('⏱ Zeit', 'Min', aufg.zeitMinuten || 5, 1, 30, !taskUnlocked, v => {
        aufg.zeitMinuten = v;
        if (pr.grobstrukturLocked) markTaskDirty(aufg); else savePruefungsDB();
      }));
      rightCol.appendChild(makeSlider('Punkte', 'P', aufg.gesamtpunkte || 8, 2, 25, !taskUnlocked, v => {
        aufg.gesamtpunkte = v;
        if (pr.grobstrukturLocked) markTaskDirty(aufg); else savePruefungsDB();
      }));

      if (pr.grobstrukturLocked && taskUnlocked) {
        const refreshBtn = btn('↺ Feinplanung fuer diese Aufgabe', 'btn btn-pri btn-xs');
        refreshBtn.onclick = async () => {
          refreshBtn.disabled = true;
          refreshBtn.textContent = '⏳';
          try {
            const { lernziele, ideenPool } = buildKontext();
            const aktive = getActiveTasks();
            const aufgNr = aktive.findIndex(a => a.taskId === aufg.taskId) + 1;
            statusEl.textContent = `⏳ Feinstruktur fuer Aufgabe ${aufgNr} wird aktualisiert...`;
            const fsEntry = await generateFeinstrukturForTask(aufg, aufgNr, lernziele, ideenPool);
            const fsIdx = pr.feinstruktur.findIndex(fs => fs.taskId === aufg.taskId);
            if (fsIdx > -1) pr.feinstruktur[fsIdx] = fsEntry;
            else pr.feinstruktur.push(fsEntry);
            invalidateGeneratedTask(aufg.taskId);
            aufg._grobUnlocked = false;
            aufg._needsFeinUpdate = false;
            syncDerivedOrder();
            savePruefungsDB();
            renderStruktur(); renderFeinstruktur(); renderGenAufgaben(); renderAFBBanner();
            switchSubTab(2);
            statusEl.textContent = `✓ Feinstruktur fuer Aufgabe ${aufgNr} aktualisiert.`;
          } catch (e) {
            statusEl.textContent = '⚠ ' + e.message;
          }
          refreshBtn.disabled = false;
          refreshBtn.textContent = '↺ Feinplanung fuer diese Aufgabe';
        };
        rightCol.appendChild(refreshBtn);
      }

      card.appendChild(rightCol);
      if (taskUnlocked) addDragHandlers(card, dragHandle, idx);
      strukturWrap.appendChild(card);
    });
    updateGesamt();
  }
  renderStruktur();
  panel1.appendChild(gesamtEl);

  const btnRow1 = mk('div', ''); btnRow1.style.cssText = 'display:flex;gap:8px;margin-bottom:4px;flex-wrap:wrap;margin-top:8px;';
  const strukturBtn = btn('✨ Grobstruktur vorschlagen', 'btn btn-pri btn-sm');
  btnRow1.appendChild(strukturBtn);
  const zuFeinBtn = btn('→ Feinstruktur vorschlagen', 'btn btn-sm');
  zuFeinBtn.style.display = pr.strukturVorschlag.length ? '' : 'none';
  btnRow1.appendChild(zuFeinBtn);
  panel1.appendChild(btnRow1);
  const lockInfo = tx('div', '', '');
  lockInfo.style.cssText = 'font-size:12px;color:var(--tx3);margin-bottom:10px;';
  panel1.appendChild(lockInfo);

  // ── Panels in div einsetzen ───────────────────────────────────
  // ── AFB-Auswertungsbalken (dauerhaft sichtbar) ────────────────
  const afbBanner = mk('div', '');
  afbBanner.style.cssText = 'margin-bottom:12px;';

  function parseFeinPunkte() {
    // Liest Zeilenpunkte aus pr.feinstruktur
    const result = [];
    pr.feinstruktur.forEach(fs => {
      (fs.spezifikation || '').split('\n').forEach(line => {
        if (!line.includes('→')) return;
        const pipeIdx = line.indexOf('|');
        if (pipeIdx < 0) return;
        const afbKey = line.slice(0, pipeIdx).trim().replace(/^[-–•]\s*/, '');
        if (!AB_KEY_MAP[afbKey]) return;
        const rest = line.slice(pipeIdx + 1);
        const lastPipe = rest.lastIndexOf('|');
        if (lastPipe < 0) return;
        const maybeP = rest.slice(lastPipe + 1).trim();
        if (/^\d+$/.test(maybeP)) result.push({ afbKey, punkte: parseInt(maybeP) });
      });
    });
    return result;
  }

  function calcAFB() {
    const t = { afb1: 0, afb2: 0, afb3: 0, total: 0, min1: 0, min2: 0, min3: 0 };
    if (pr.genAufgaben.length) {
      pr.genAufgaben.forEach(a => {
        const uas = a.unteraufgaben || [];
        const taskP = uas.reduce((s, ua) => s + (ua.punkte || 0), 0);
        const taskMin = a.zeitMinuten || 0;
        uas.forEach(ua => {
          const p = ua.punkte || 0;
          const minAnteil = taskP ? taskMin * p / taskP : 0;
          if (ua.anforderungsbereich === 'reproduktion' || ua.anforderungsbereich === 'leichteAnwendung') { t.afb1 += p; t.min1 += minAnteil; }
          else if (ua.anforderungsbereich === 'mittlereAnwendung') { t.afb2 += p; t.min2 += minAnteil; }
          else if (ua.anforderungsbereich === 'transfer') { t.afb3 += p; t.min3 += minAnteil; }
          t.total += p;
        });
      });
    } else {
      const feinPunkte = parseFeinPunkte();
      if (feinPunkte.length) {
        // Feinstruktur-Zeilenpunkte vorhanden → diese verwenden
        feinPunkte.forEach(({ afbKey, punkte }) => {
          if (afbKey === 'reproduktion' || afbKey === 'leichteAnwendung') t.afb1 += punkte;
          else if (afbKey === 'mittlereAnwendung') t.afb2 += punkte;
          else if (afbKey === 'transfer') t.afb3 += punkte;
          t.total += punkte;
        });
      } else {
        pr.strukturVorschlag.filter(a => !a._removed).forEach(a => {
          const anf = a.anforderung || {};
          const p1 = (anf.reproduktion || 0) + (anf.leichteAnwendung || 0);
          const p2 = anf.mittlereAnwendung || 0;
          const p3 = anf.transfer || 0;
          const taskP = (a.gesamtpunkte || 0);
          const taskMin = a.zeitMinuten || 0;
          t.afb1 += p1; t.min1 += taskP ? taskMin * p1 / taskP : 0;
          t.afb2 += p2; t.min2 += taskP ? taskMin * p2 / taskP : 0;
          t.afb3 += p3; t.min3 += taskP ? taskMin * p3 / taskP : 0;
          t.total += taskP;
        });
      }
    }
    return t;
  }

  function renderAFBBanner() {
    afbBanner.innerHTML = '';
    const t = calcAFB();
    if (!t.total) return;
    const z = pr.afbZiele || { afb1: { min: 30, max: 50 }, afb2: { min: 35, max: 50 }, afb3: { min: 15, max: 25 } };
    const rows = [
      { key: 'afb1', badges: ['reproduktion','leichteAnwendung'],  color: '#ca8a04', punkte: t.afb1, min: t.min1 },
      { key: 'afb2', badges: ['mittlereAnwendung'],                color: '#ea580c', punkte: t.afb2, min: t.min2 },
      { key: 'afb3', badges: ['transfer'],                         color: '#dc2626', punkte: t.afb3, min: t.min3 },
    ];
    const grid = mk('div', '');
    grid.style.cssText = 'display:grid;grid-template-columns:52px 1fr 70px 44px 70px;gap:4px 8px;align-items:center;padding:10px 14px;background:var(--surf2);border-radius:8px;border:1px solid var(--bord);';
    rows.forEach(({ key, badges, color, punkte, min }) => {
      const pct = t.total ? Math.round(punkte / t.total * 100) : 0;
      const ziel = z[key] || { min: 0, max: 100 };
      const ok = pct >= ziel.min && pct <= ziel.max;
      const lbl = mk('div', ''); lbl.style.cssText = 'display:flex;gap:3px;align-items:center;';
      badges.forEach(bkey => {
        const cfg = AB_KEY_MAP[bkey];
        const b = tx('div', '', cfg.letter);
        b.style.cssText = `width:18px;height:18px;border-radius:50%;background:${cfg.color};color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
        b.title = cfg.title;
        lbl.appendChild(b);
      });
      grid.appendChild(lbl);
      const barWrap = mk('div', '');
      barWrap.style.cssText = 'position:relative;height:10px;background:var(--bord);border-radius:5px;overflow:visible;';
      // Zielkorridor als heller Hintergrundbereich
      const zielBar = mk('div', '');
      zielBar.style.cssText = `position:absolute;left:${ziel.min}%;width:${ziel.max - ziel.min}%;height:100%;background:${color}22;border-radius:5px;`;
      barWrap.appendChild(zielBar);
      const fillBar = mk('div', '');
      fillBar.style.cssText = `position:absolute;left:0;width:${Math.min(pct, 100)}%;height:100%;background:${ok ? color : '#ef4444'};border-radius:5px;transition:width .3s;`;
      barWrap.appendChild(fillBar);
      grid.appendChild(barWrap);
      const pmEl = mk('div', ''); pmEl.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:1px;';
      const pEl = tx('span', '', punkte + ' P'); pEl.style.cssText = `font-size:11px;font-weight:700;color:${color};`;
      const mEl = tx('span', '', Math.round(min) + ' Min'); mEl.style.cssText = 'font-size:10px;color:var(--tx3);';
      pmEl.appendChild(pEl); pmEl.appendChild(mEl);
      grid.appendChild(pmEl);
      const pctEl = tx('span', '', pct + ' %');
      pctEl.style.cssText = `font-size:12px;font-weight:700;color:${ok ? color : '#ef4444'};text-align:right;`;
      grid.appendChild(pctEl);
      const hint = tx('span', '', ok ? '✓' : (pct < ziel.min ? '↑ ' + ziel.min + '%' : '↓ ' + ziel.max + '%'));
      hint.style.cssText = `font-size:11px;color:${ok ? '#16a34a' : '#ef4444'};`;
      grid.appendChild(hint);
    });
    afbBanner.appendChild(grid);
  }

  renderAFBBanner();

  div.appendChild(statusEl);
  div.appendChild(afbBanner);
  div.appendChild(subTabBar);
  div.appendChild(panel1);
  div.appendChild(panel2);
  div.appendChild(panel3);
  div.appendChild(panel4);
  switchSubTab(aktiverSubTab);

  // ════════════════════════════════════════════════════════════════
  // STUFE 2: Feinstruktur (pädagogische Spezifikation, editierbar)
  // ════════════════════════════════════════════════════════════════
  const stufe2Sec = panel2;
  const feinHint = tx('div', '', 'Die KI hat für jede Aufgabe beschrieben was sie vorhat. Korrigiere den Text wenn nötig.');
  feinHint.style.cssText = 'font-size:12px;color:var(--tx3);margin-bottom:8px;';
  stufe2Sec.appendChild(feinHint);
  const feinWrap = mk('div', ''); feinWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:10px;';
  stufe2Sec.appendChild(feinWrap);

  function renderFeinstruktur() {
    feinWrap.innerHTML = '';
    syncDerivedOrder();
    const zuBearbeiten = getActiveTasks();
    pr.feinstruktur.forEach((fs, idx) => {
      const sv = zuBearbeiten.find(a => a.taskId === fs.taskId) || zuBearbeiten[idx];
      const feinLocked = !!fs._feinLocked;
      const card = mk('div', '');
      card.style.cssText = 'border-radius:10px;background:var(--surf2);overflow:hidden;';

      // Kopfzeile
      const head = mk('div', '');
      head.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(124,58,237,.06);border-bottom:1px solid var(--bord);';

      // Anforderungsbereich-Stempel (read-only, aus Stufe 1)
      if (sv?.anforderung) {
        const stempelWrap = makeStempel(sv.anforderung);
        stempelWrap.style.flexDirection = 'row';
        stempelWrap.style.gap = '3px';
        stempelWrap.style.marginRight = '2px';
        head.appendChild(stempelWrap);
      }

      // Nummer-Badge
      const nrBadge = tx('div', '', String(fs.nr));
      nrBadge.style.cssText = 'width:24px;height:24px;border-radius:50%;background:var(--pri);color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
      head.appendChild(nrBadge);

      // Titel
      const titel = tx('span', '', fs.titel || '–');
      titel.style.cssText = 'font-size:14px;font-weight:700;color:var(--tx1);flex:1;';
      head.appendChild(titel);

      const feinLockBtn = btn(feinLocked ? '🔐' : '🔓', 'btn btn-ghost btn-xs');
      feinLockBtn.title = feinLocked ? 'Diese Feinstruktur ist gesperrt' : 'Diese Feinstruktur sperren';
      feinLockBtn.onclick = () => {
        fs._feinLocked = !fs._feinLocked;
        if (fs._feinLocked && sv) sv._grobUnlocked = false;
        savePruefungsDB();
        renderStruktur(); renderFeinstruktur();
      };
      head.appendChild(feinLockBtn);

      // Zeit + Punkte editierbar
      const makeFeinSlider = (icon, unit, val, min, max, color, disabled, onChange) => {
        const wrap = mk('div', '');
        wrap.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0;';
        const valEl = tx('span', '', icon + ' ' + val + ' ' + unit);
        valEl.style.cssText = `font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:${color}1a;color:${color};cursor:${disabled ? 'default' : 'pointer'};${disabled ? 'opacity:.5;' : ''}`;
        const slider = document.createElement('input'); slider.type = 'range';
        slider.min = min; slider.max = max; slider.step = 1; slider.value = val;
        slider.disabled = disabled;
        slider.style.cssText = `width:70px;accent-color:${color};height:3px;display:none;`;
        valEl.onclick = () => { if (!disabled) slider.style.display = slider.style.display ? '' : 'none'; };
        slider.oninput = () => { valEl.textContent = icon + ' ' + slider.value + ' ' + unit; onChange(parseInt(slider.value)); renderAFBBanner(); };
        slider.onblur = () => { slider.style.display = 'none'; };
        wrap.appendChild(valEl); wrap.appendChild(slider);
        return wrap;
      };
      head.appendChild(makeFeinSlider('⏱', 'Min', fs.zeitMinuten || 5, 1, 45, '#2563eb', feinLocked, v => { fs.zeitMinuten = v; if (sv) sv.zeitMinuten = v; savePruefungsDB(); }));

      // Punkte-Chip mit Update-Funktion
      const pktWrap = mk('div', ''); pktWrap.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0;';
      const pktValEl = tx('span', '', (fs.gesamtpunkte || 8) + ' P');
      pktValEl.style.cssText = 'font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:#7c3aed1a;color:#7c3aed;cursor:' + (feinLocked ? 'default' : 'pointer') + ';' + (feinLocked ? 'opacity:.5;' : '');
      const pktSlider = document.createElement('input'); pktSlider.type = 'range';
      pktSlider.min = 2; pktSlider.max = 30; pktSlider.step = 1; pktSlider.value = fs.gesamtpunkte || 8;
      pktSlider.disabled = feinLocked;
      pktSlider.style.cssText = 'width:70px;accent-color:#7c3aed;height:3px;display:none;';
      pktValEl.onclick = () => { if (!feinLocked) pktSlider.style.display = pktSlider.style.display ? '' : 'none'; };
      pktSlider.oninput = () => { fs.gesamtpunkte = parseInt(pktSlider.value); if (sv) sv.gesamtpunkte = fs.gesamtpunkte; pktValEl.textContent = fs.gesamtpunkte + ' P'; savePruefungsDB(); renderAFBBanner(); };
      pktSlider.onblur = () => { pktSlider.style.display = 'none'; };
      pktWrap.appendChild(pktValEl); pktWrap.appendChild(pktSlider);
      head.appendChild(pktWrap);

      // Funktion zum Aktualisieren des Punkte-Chips aus Zeilenpunkten
      const updatePunkteSum = (listWrap) => {
        const sum = Array.from(listWrap.querySelectorAll('input[type=number]'))
          .reduce((s, inp) => s + (parseInt(inp.value) || 0), 0);
        if (sum > 0) { pktValEl.textContent = sum + ' P'; pktSlider.value = Math.min(sum, 30); fs.gesamtpunkte = sum; if (sv) sv.gesamtpunkte = sum; savePruefungsDB(); }
        renderAFBBanner();
      };

      // ↺ Diese Aufgabe einzeln neu generieren
      const cardRegenBtn = mk('button', '');
      cardRegenBtn.textContent = '↺';
      cardRegenBtn.title = 'Diese Aufgabe neu generieren';
      cardRegenBtn.style.cssText = 'border:none;background:none;color:var(--tx3);cursor:pointer;font-size:14px;padding:2px 6px;flex-shrink:0;';
      cardRegenBtn.disabled = feinLocked;
      if (feinLocked) cardRegenBtn.style.opacity = '.45';
      cardRegenBtn.onclick = async () => {
        if (feinLocked) return;
        cardRegenBtn.textContent = '⏳'; cardRegenBtn.disabled = true;
        const aufg = sv || {};
        const { lernziele, ideenPool } = buildKontext();
        const anf2 = aufg.anforderung || {};
        const erlaubt2 = Object.keys(AB_KEY_MAP).filter(k => (anf2[k] || 0) > 0);
        const verboten2 = Object.keys(AB_KEY_MAP).filter(k => (anf2[k] || 0) === 0);
        let p = `Du planst Aufgabe ${fs.nr} einer Klassenarbeit.\n`;
        p += `Thema/Titel: ${fs.titel}\nZeit: ${fs.zeitMinuten ?? '?'} Min, ${fs.gesamtpunkte ?? '?'} Punkte\n`;
        if (erlaubt2.length) { p += `\n## ANFORDERUNGSBEREICHE — VERBINDLICH\nErlaubt: ${erlaubt2.join(', ')}\nVERBOTEN: ${verboten2.join(', ')}\n`; }
        if (lernziele.length) { p += '\nLernziele:\n'; lernziele.slice(0,6).forEach(lz => { p += `- ${lz}\n`; }); }
        p += `\nBeschreibe die Unteraufgaben in kompakter Kurzform.\nFür jede Unteraufgabe: NUR erlaubte Anforderungsbereiche (${erlaubt2.join(', ')}), dann | dann Kennung: Vorgabe → Schülertätigkeit.\n`;
        p += `\nAntworte NUR mit reinem JSON:\n{"spezifikation":"reproduktion|1a: ... → ...\\nleichteAnwendung|1b: ... → ..."}`;
        try {
          const raw = await callKI([{ type: 'text', text: p }], 1500);
          const parsed = parseKI(raw);
          fs.spezifikation = parsed.spezifikation || fs.spezifikation;
          savePruefungsDB(); renderFeinstruktur(); renderAFBBanner();
        } catch(e) { statusEl.textContent = '⚠ ' + e.message; }
        cardRegenBtn.textContent = '↺'; cardRegenBtn.disabled = false;
      };
      head.appendChild(cardRegenBtn);

      // → Konkrete Aufgabe für Stufe 3 generieren
      const cardGenBtn = btn('→', 'btn btn-pri btn-xs');
      cardGenBtn.title = 'Konkrete Aufgabe für Panel 3 generieren';
      cardGenBtn.style.flexShrink = '0';
      cardGenBtn.onclick = async () => {
        cardGenBtn.disabled = true; cardGenBtn.textContent = '⏳';
        const anf3 = fs.anforderung || {};
        const erlaubt3 = Object.keys(AB_KEY_MAP).filter(k => (anf3[k] || 0) > 0);
        const verboten3 = Object.keys(AB_KEY_MAP).filter(k => (anf3[k] || 0) === 0);
        let p = `Erstelle konkrete Aufgabe ${fs.nr} "${fs.titel}" für eine Klassenarbeit.\n\n`;
        p += `## PÄDAGOGISCHE SPEZIFIKATION\n${fs.spezifikation}\n\n`;
        p += `Zeit: ${fs.zeitMinuten ?? '?'} Min, ${fs.gesamtpunkte ?? '?'} Punkte gesamt\n`;
        p += `Aufgabentypen: ${(fs.typen||[]).join(', ')}\n`;
        if (erlaubt3.length) { p += `\n## ANFORDERUNGSBEREICHE — VERBINDLICH\nErlaubt: ${erlaubt3.join(', ')}\nVERBOTEN: ${verboten3.join(', ')}\n`; }
        p += `\n## WICHTIG\n- Unteraufgaben rechnerisch unabhängig\n- Progression leicht→schwer\n- Konkrete Zahlen, kein Platzhalter\n\n`;
        p += `Antworte NUR mit reinem JSON:\n{"aufgabenstellung":null,"unteraufgaben":[\n  {"nr":"${fs.nr}a","titel":null,"text":"...","punkte":3,"anforderungsbereich":"reproduktion","typ":"Rechnung"}\n]}\nanforderungsbereich: ${erlaubt3.length ? erlaubt3.join(' | ') : 'reproduktion | leichteAnwendung | mittlereAnwendung | transfer'}`;
        try {
          const raw = await callKI([{ type: 'text', text: p }], 3000);
          const parsed = parseKI(raw);
          // Vorhandenen Eintrag für diese Aufgabe ersetzen oder neu anlegen
          const existingIdx = pr.genAufgaben.findIndex(a => a.taskId === fs.taskId);
          const entry = { taskId: fs.taskId, nr: fs.nr, titel: fs.titel, zeitMinuten: fs.zeitMinuten, gesamtpunkte: fs.gesamtpunkte, aufgabenstellung: parsed.aufgabenstellung || null, unteraufgaben: parsed.unteraufgaben || [] };
          if (existingIdx > -1) pr.genAufgaben[existingIdx] = entry;
          else pr.genAufgaben.push(entry);
          syncDerivedOrder();
          savePruefungsDB(); renderGenAufgaben(); renderAFBBanner();
          switchSubTab(3);
        } catch(e) { statusEl.textContent = '⚠ ' + e.message; }
        cardGenBtn.disabled = false; cardGenBtn.textContent = '→';
      };
      head.appendChild(cardGenBtn);
      card.appendChild(head);

      if (feinLocked) {
        const lockNote = tx('div', '', 'Diese Aufgabe ist in der Feinstruktur gesperrt. Ihre Vorgaben werden nicht mehr verändert.');
        lockNote.style.cssText = 'font-size:11px;color:var(--tx3);padding:8px 14px 0;';
        card.appendChild(lockNote);
      }

      // Spezifikation als editierbare Stichpunktliste
      const listWrap = mk('div', '');
      listWrap.style.cssText = 'padding:8px 14px 4px;display:flex;flex-direction:column;gap:2px;';

      function getLines() {
        return (fs.spezifikation || '').split('\n').map(l => l.replace(/^[-–•]\s*/, '').trim()).filter(l => l);
      }
      function saveLines(lines) {
        fs.spezifikation = lines.map(l => '- ' + l).join('\n');
        savePruefungsDB();
      }

      function buildList() {
        listWrap.innerHTML = '';
        const lines = getLines();
        lines.forEach((line, li) => {
          const hasPfeil = line.includes('→');
          const row = mk('div', '');
          row.style.cssText = 'display:flex;align-items:flex-start;gap:6px;padding:3px 0;';

          if (hasPfeil) {
            // AFB-Präfix parsen: "reproduktion|1a: Vorgabe → Ergänzung" oder "reproduktion|1a: Vorgabe → Ergänzung|4"
            let afbKey = null, lineRest = line, zeilenPunkte = null;
            const pipeIdx = line.indexOf('|');
            if (pipeIdx > -1) {
              const candidate = line.slice(0, pipeIdx).trim();
              if (AB_KEY_MAP[candidate]) {
                afbKey = candidate;
                lineRest = line.slice(pipeIdx + 1).trim();
                // Punkte am Ende: "content|4"
                const lastPipe = lineRest.lastIndexOf('|');
                if (lastPipe > -1) {
                  const maybeP = lineRest.slice(lastPipe + 1).trim();
                  if (/^\d+$/.test(maybeP)) { zeilenPunkte = parseInt(maybeP); lineRest = lineRest.slice(0, lastPipe).trim(); }
                }
              }
            }
            const abCfg2 = afbKey ? AB_KEY_MAP[afbKey] : null;
            const buildLine = () => (afbKey ? afbKey + '|' : '') + lineRest + (zeilenPunkte != null ? '|' + zeilenPunkte : '');

            // Badge
            const badge2 = tx('div', '', abCfg2 ? abCfg2.letter : '·');
            badge2.title = abCfg2?.title || 'Anforderungsbereich';
            badge2.style.cssText = `width:20px;height:20px;border-radius:50%;background:${abCfg2 ? abCfg2.color + '33' : 'var(--bord)'};color:${abCfg2?.color || 'var(--tx3)'};font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;cursor:pointer;`;
            // Klick auf Badge wechselt AFB
            badge2.onclick = () => {
              if (feinLocked) return;
              const keys = Object.keys(AB_KEY_MAP);
              const next = keys[(keys.indexOf(afbKey) + 1) % keys.length];
              const ls = getLines(); ls[li] = next + '|' + lineRest; saveLines(ls); buildList();
            };
            row.appendChild(badge2);

            // Kennung · Vorgabe → Ergänzung
            const colonIdx = lineRest.indexOf(':');
            const kennung = colonIdx > -1 ? lineRest.slice(0, colonIdx).trim() : '';
            const rest = colonIdx > -1 ? lineRest.slice(colonIdx + 1).trim() : lineRest;
            const [vorgabe, ergaenzung] = rest.split('→').map(s => s.trim());

            const preview = mk('div', '');
            preview.style.cssText = 'flex:1;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;padding:2px 0;font-size:13px;cursor:text;';
            if (kennung) {
              const kEl = tx('span', '', kennung + ':');
              kEl.style.cssText = 'font-weight:700;color:var(--tx2);flex-shrink:0;';
              preview.appendChild(kEl);
            }
            const vEl = tx('span', '', vorgabe || '');
            vEl.style.cssText = 'font-weight:700;color:var(--tx1);';
            preview.appendChild(vEl);
            const arrEl = tx('span', '', '→');
            arrEl.style.cssText = 'color:var(--pri);font-weight:700;flex-shrink:0;';
            preview.appendChild(arrEl);
            const eEl = tx('span', '', ergaenzung || '');
            eEl.style.cssText = 'color:var(--tx3);';
            preview.appendChild(eEl);

            // Punkte-Feld
            const pInp = document.createElement('input');
            pInp.type = 'number'; pInp.min = 1; pInp.max = 20; pInp.step = 1;
            pInp.value = zeilenPunkte ?? '';
            pInp.placeholder = 'P';
            pInp.disabled = feinLocked;
            pInp.style.cssText = 'width:38px;font-size:11px;font-family:inherit;border:1px solid var(--bord);border-radius:4px;background:var(--surf2);color:var(--tx1);padding:1px 4px;text-align:center;flex-shrink:0;';
            pInp.title = 'Punkte für diese Teilaufgabe';
            pInp.oninput = () => {
              zeilenPunkte = pInp.value ? parseInt(pInp.value) : null;
              const ls = getLines(); ls[li] = buildLine(); saveLines(ls);
              updatePunkteSum(listWrap);
            };
            row.appendChild(pInp);

            // Klick öffnet Inline-Editor (zeigt nur Inhalt ohne AFB-Präfix und Punkte)
            const inp = document.createElement('input');
            inp.type = 'text'; inp.value = lineRest;
            inp.style.cssText = 'flex:1;font-size:13px;font-family:inherit;border:none;outline:none;background:var(--surf);color:var(--tx1);padding:2px 4px;border-radius:4px;display:none;';
            inp.oninput = () => { lineRest = inp.value; const ls = getLines(); ls[li] = buildLine(); saveLines(ls); };
            inp.onblur = () => { buildList(); };
            inp.onkeydown = e => {
              if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
              if (e.key === 'Escape') { inp.blur(); }
            };
            preview.onclick = () => {
              if (feinLocked) return;
              preview.style.display = 'none'; inp.style.display = 'block'; pInp.style.display = 'none'; inp.focus(); inp.select();
            };
            inp.onblur = () => { pInp.style.display = ''; buildList(); };
            row.appendChild(preview);
            row.appendChild(inp);

            // ↺ Alternativvorschlag generieren
            const regenBtn = mk('button', '');
            regenBtn.textContent = '↺';
            regenBtn.title = 'Alternative auf gleichem Niveau vorschlagen';
            regenBtn.style.cssText = 'border:none;background:none;color:var(--pri);cursor:pointer;font-size:13px;padding:2px 4px;flex-shrink:0;opacity:0;transition:opacity .1s;';
            regenBtn.disabled = feinLocked;
            regenBtn.onclick = async () => {
              if (feinLocked) return;
              // Vorhandene Vorschau entfernen
              row.nextSibling?.classList?.contains('regen-prev') && row.nextSibling.remove();
              regenBtn.textContent = '⏳'; regenBtn.disabled = true;
              try {
                const p = `Du planst Aufgabe "${fs.titel}" für eine Klassenarbeit.
Anforderungsbereich dieser Teilaufgabe: "${AB_KEY_MAP[afbKey]?.title || afbKey}"

Die Lehrerin hat folgende Anforderung notiert:
"${lineRest}"

Generiere eine konkrete Teilaufgabe, die GENAU dieser Anforderung entspricht.
Wichtig:
- Enthält die Anforderung Schwierigkeitshinweise (z.B. "schwieriger als X", "weniger geläufig als Y"), halte dich STRIKT daran.
- Orientiere dich am Anforderungsbereich "${AB_KEY_MAP[afbKey]?.title || afbKey}" — nicht einfacher, nicht schwieriger.
- Keine Erklärungen, nur die eine Zeile.

Antworte NUR mit:
${afbKey}|Kennung: Vorgabe → Schülertätigkeit`;
                const raw = await callKI([{ type: 'text', text: p }], 500);
                const suggestion = raw.replace(/^```.*\n?/m, '').replace(/```\s*$/m, '').trim().split('\n')[0];

                // Vorschau-Zeile
                const prevRow = mk('div', 'regen-prev');
                prevRow.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px 4px 28px;background:rgba(124,58,237,.06);border-radius:6px;margin:2px 0;';
                const prevCfg = AB_KEY_MAP[suggestion.split('|')[0]?.trim()] || AB_KEY_MAP[afbKey];
                const pb = tx('div', '', prevCfg.letter);
                pb.style.cssText = `width:16px;height:16px;border-radius:50%;background:${prevCfg.color};color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
                prevRow.appendChild(pb);
                const pipeI = suggestion.indexOf('|');
                const suggRest = pipeI > -1 ? suggestion.slice(pipeI + 1) : suggestion;
                const pt = tx('span', '', suggRest); pt.style.cssText = 'flex:1;font-size:12px;color:var(--tx2);font-style:italic;';
                prevRow.appendChild(pt);
                const acceptBtn = mk('button', ''); acceptBtn.textContent = '✓ Übernehmen';
                acceptBtn.style.cssText = 'border:none;background:#16a34a;color:#fff;cursor:pointer;font-size:11px;padding:2px 8px;border-radius:4px;flex-shrink:0;';
                acceptBtn.onclick = () => { const ls = getLines(); ls[li] = suggestion; saveLines(ls); prevRow.remove(); buildList(); };
                prevRow.appendChild(acceptBtn);
                const rejectBtn = mk('button', ''); rejectBtn.textContent = '✗';
                rejectBtn.style.cssText = 'border:none;background:none;color:var(--tx3);cursor:pointer;font-size:13px;padding:2px 6px;';
                rejectBtn.onclick = () => { prevRow.remove(); regenBtn.textContent = '↺'; regenBtn.disabled = false; };
                prevRow.appendChild(rejectBtn);
                row.after(prevRow);
              } catch(e) {
                const errDiv = mk('div', 'regen-prev');
                errDiv.style.cssText = 'font-size:11px;color:#ef4444;padding:2px 28px;';
                errDiv.textContent = '⚠ ' + e.message.slice(0, 80);
                row.after(errDiv);
                setTimeout(() => errDiv.remove(), 3000);
              }
              regenBtn.textContent = '↺'; regenBtn.disabled = false;
            };
            row._regenBtn = regenBtn; // für hover-handler unten
          } else {
            // Einfache Textzeile (Hinweis, Gesamtanzahl etc.)
            const bullet = tx('span', '', '–');
            bullet.style.cssText = 'color:var(--tx3);flex-shrink:0;padding-top:3px;font-size:13px;';
            row.appendChild(bullet);
            const inp = document.createElement('textarea');
            inp.value = line;
            inp.rows = 1;
            inp.disabled = feinLocked;
            inp.style.cssText = 'flex:1;font-size:13px;font-family:inherit;line-height:1.5;border:none;outline:none;background:transparent;color:var(--tx2);resize:none;overflow:hidden;padding:0;font-style:italic;';
            const grow = () => { inp.style.height = 'auto'; inp.style.height = inp.scrollHeight + 'px'; };
            inp.oninput = () => { const ls = getLines(); ls[li] = inp.value; saveLines(ls); grow(); };
            inp.onkeydown = e => {
              if (e.key === 'Enter') { e.preventDefault(); const ls = getLines(); ls.splice(li + 1, 0, ''); saveLines(ls); buildList(); listWrap.querySelectorAll('textarea')[li + 1]?.focus(); }
              if (e.key === 'Backspace' && inp.value === '' && lines.length > 1) { e.preventDefault(); const ls = getLines(); ls.splice(li, 1); saveLines(ls); buildList(); listWrap.querySelectorAll('textarea')[Math.max(0, li - 1)]?.focus(); }
            };
            row.appendChild(inp);
            requestAnimationFrame(grow);
          }

          const del = mk('button', '');
          del.textContent = '✕';
          del.style.cssText = 'border:none;background:none;color:var(--tx3);cursor:pointer;font-size:11px;padding:2px 4px;flex-shrink:0;opacity:0;transition:opacity .1s;';
          row.onmouseenter = () => { del.style.opacity = '1'; if (row._regenBtn) row._regenBtn.style.opacity = '1'; };
          row.onmouseleave = () => { del.style.opacity = '0'; if (row._regenBtn) row._regenBtn.style.opacity = '0'; };
          del.disabled = feinLocked;
          del.onclick = () => { const ls = getLines(); ls.splice(li, 1); saveLines(ls); buildList(); };
          if (row._regenBtn) row.appendChild(row._regenBtn);
          row.appendChild(del);
          listWrap.appendChild(row);
        });
        // + neue Zeile
        const addRow = mk('button', '');
        addRow.textContent = '+ Zeile';
        addRow.style.cssText = 'border:none;background:none;color:var(--tx3);cursor:pointer;font-size:11px;padding:4px 0 8px;text-align:left;';
        addRow.disabled = feinLocked;
        addRow.onclick = () => { const ls = getLines(); ls.push('reproduktion| → '); saveLines(ls); buildList(); const inps = listWrap.querySelectorAll('input[type=text]'); const last = inps[inps.length-1]; if (last) { last.style.display='block'; last.focus(); last.select(); } };
        listWrap.appendChild(addRow);

        const stats = countSpecStats(fs.spezifikation);
        const infoRow = mk('div', '');
        infoRow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:2px 0 10px;';
        const statsChip = tx('span', '', `${stats.teilaufgaben} Teilaufgaben · ${stats.punkte || 0} / ${fs.gesamtpunkte || 0} P`);
        const statsOk = !fs.gesamtpunkte || stats.punkte === fs.gesamtpunkte;
        statsChip.style.cssText = `font-size:11px;font-weight:600;padding:3px 8px;border-radius:999px;background:${statsOk ? 'rgba(22,163,74,.1)' : 'rgba(239,68,68,.08)'};color:${statsOk ? '#15803d' : '#dc2626'};`;
        infoRow.appendChild(statsChip);
        if (!statsOk) {
          const distBtn = btn('Punkte verteilen', 'btn btn-ghost btn-xs');
          distBtn.disabled = feinLocked;
          distBtn.onclick = () => {
            if (distributePointsAcrossSpec(fs)) {
              savePruefungsDB();
              buildList();
              updatePunkteSum(listWrap);
            }
          };
          infoRow.appendChild(distBtn);
        }
        listWrap.appendChild(infoRow);

        const actionRow = mk('div', '');
        actionRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding:0 0 10px;';
        [
          { label: 'Klarer', instruction: 'Formuliere die Teilaufgaben klarer und operatorenklarer. Behalte Niveau und Punkteverteilung moeglichst bei.' },
          { label: '+ Transfer', instruction: 'Erhoehe den Transferanteil leicht. Mindestens eine spaetere Teilaufgabe soll anspruchsvoller werden. Behalte Gesamtidee und Gesamtpunkte bei.' },
          { label: '+ Teilaufgaben', instruction: 'Teile die Aufgabe feiner auf und erhoehe die Zahl der Teilaufgaben leicht. Behalte Gesamtpunkte und Progression bei.' },
          { label: 'Kompakter', instruction: 'Vereinfache die innere Struktur leicht und fasse sie kompakter. Weniger Redundanz, klarer Aufbau, gleiche Grundidee.' },
        ].forEach(({ label, instruction }) => {
          const b = btn(label, 'btn btn-ghost btn-xs');
          b.disabled = feinLocked;
          b.onclick = async () => {
            if (feinLocked) return;
            b.disabled = true;
            try {
              await reviseFeinstrukturTask(fs, instruction, label);
              renderFeinstruktur();
              renderAFBBanner();
            } catch (e) {
              statusEl.textContent = '⚠ ' + e.message;
            }
            b.disabled = false;
          };
          actionRow.appendChild(b);
        });
        listWrap.appendChild(actionRow);
      }

      buildList();
      card.appendChild(listWrap);
      feinWrap.appendChild(card);
    });
  }
  renderFeinstruktur(); renderAFBBanner();

  const btnRow2 = mk('div', ''); btnRow2.style.cssText = 'display:flex;gap:8px;margin-bottom:4px;flex-wrap:wrap;';
  const zuAufgBtn = btn('→ Aufgaben generieren', 'btn btn-sm');
  btnRow2.appendChild(zuAufgBtn);
  stufe2Sec.appendChild(btnRow2);

  // ════════════════════════════════════════════════════════════════
  // STUFE 3: Konkrete Aufgaben
  // ════════════════════════════════════════════════════════════════
  const stufe3Sec = panel3;
  const aufgabenWrap = mk('div', '');
  aufgabenWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
  stufe3Sec.appendChild(aufgabenWrap);

  function renderGenAufgaben() {
    aufgabenWrap.innerHTML = '';
    pr.genAufgaben.forEach(aufg => {
      const card = mk('div', '');
      card.style.cssText = 'border-radius:10px;background:var(--surf2);overflow:hidden;';

      // Kopfzeile
      const head = mk('div', '');
      head.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(124,58,237,.06);border-bottom:1px solid var(--bord);';
      const nrBadge = tx('div', '', String(aufg.nr));
      nrBadge.style.cssText = 'width:24px;height:24px;border-radius:50%;background:var(--pri);color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
      head.appendChild(nrBadge);
      const titel = tx('span', '', aufg.titel || '–');
      titel.style.cssText = 'font-size:14px;font-weight:700;color:var(--tx1);flex:1;';
      head.appendChild(titel);
      if (aufg.zeitMinuten) {
        const zt = tx('span', '', '⏱ ' + aufg.zeitMinuten + ' Min');
        zt.style.cssText = 'font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:rgba(37,99,235,.1);color:#2563eb;flex-shrink:0;';
        head.appendChild(zt);
      }
      if (aufg.gesamtpunkte) {
        const pt = tx('span', '', aufg.gesamtpunkte + ' P');
        pt.style.cssText = 'font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:rgba(124,58,237,.12);color:var(--pri);flex-shrink:0;';
        head.appendChild(pt);
      }
      card.appendChild(head);

      // Aufgabenstellung
      if (aufg.aufgabenstellung) {
        const as = tx('div', '', aufg.aufgabenstellung);
        as.style.cssText = 'font-size:13px;color:var(--tx2);font-style:italic;padding:8px 14px 4px;';
        card.appendChild(as);
      }

      // Teilaufgaben
      const uas = aufg.unteraufgaben || [];
      uas.forEach(ua => {
        const urow = mk('div', '');
        urow.style.cssText = 'display:flex;gap:8px;align-items:flex-start;padding:7px 14px;border-top:1px solid var(--bord);font-size:13px;';

        // Anforderungsbereich-Badge (R/A/A/T)
        const abCfg = AB_KEY_MAP[ua.anforderungsbereich];
        const badge = tx('div', '', abCfg ? abCfg.letter : '·');
        badge.title = abCfg?.title || '';
        badge.style.cssText = `width:20px;height:20px;border-radius:50%;background:${abCfg ? abCfg.color + '33' : 'var(--bord)'};color:${abCfg?.color || 'var(--tx3)'};font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;`;
        urow.appendChild(badge);

        // Nr + Text
        const col = mk('div', ''); col.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:2px;';
        const nrLine = mk('div', ''); nrLine.style.cssText = 'display:flex;align-items:baseline;gap:6px;';
        nrLine.appendChild(tx('strong', '', ua.nr || ''));
        if (ua.titel) { const tit = tx('span', '', ua.titel); tit.style.cssText = 'font-size:11px;font-weight:600;color:var(--tx2);'; nrLine.appendChild(tit); }
        if (ua.typ) nrLine.appendChild(tx('span', 'matc-jg', ua.typ));
        col.appendChild(nrLine);
        const utxt = tx('div', '', ua.text || ''); utxt.style.cssText = 'color:var(--tx2);line-height:1.5;'; col.appendChild(utxt);
        urow.appendChild(col);

        // Punkte
        if (ua.punkte) {
          const pu = tx('span', '', ua.punkte + ' P');
          pu.style.cssText = `flex-shrink:0;font-size:12px;font-weight:700;color:${abCfg?.color || 'var(--tx3)'};padding-top:1px;`;
          urow.appendChild(pu);
        }
        card.appendChild(urow);
      });

      // Auswertungszeile Punkte nach Schwierigkeit
      const summary = {};
      uas.forEach(ua => {
        if (ua.anforderungsbereich && ua.punkte) {
          summary[ua.anforderungsbereich] = (summary[ua.anforderungsbereich] || 0) + ua.punkte;
        }
      });
      if (Object.keys(summary).length) {
        const foot = mk('div', '');
        foot.style.cssText = 'display:flex;gap:8px;align-items:center;padding:6px 14px;border-top:1px solid var(--bord);background:rgba(0,0,0,.02);flex-wrap:wrap;';
        const lbl = tx('span', '', 'Verteilung:');
        lbl.style.cssText = 'font-size:11px;color:var(--tx3);';
        foot.appendChild(lbl);
        ['reproduktion','leichteAnwendung','mittlereAnwendung','transfer'].forEach(key => {
          if (!summary[key]) return;
          const cfg = AB_KEY_MAP[key];
          const chip = tx('span', '', cfg.letter + ' ' + summary[key] + ' P');
          chip.title = cfg.title;
          chip.style.cssText = `font-size:12px;font-weight:700;padding:2px 8px;border-radius:20px;background:${cfg.color}22;color:${cfg.color};`;
          foot.appendChild(chip);
        });
        card.appendChild(foot);
      }

      aufgabenWrap.appendChild(card);
    });
  }
  renderGenAufgaben(); renderAFBBanner();
  lockInfo.textContent = pr.grobstrukturLocked
    ? 'Grobstruktur ist nach der ersten Feinplanung gesperrt. Zum Aendern einzelne Aufgaben entsperren.'
    : 'Zeit und Punkte hier grob anpassen, dann einmal die Feinplanung fuer alle Aufgaben laufen lassen.';

  // ── Handler: Stufe 1 — Grobstruktur ──────────────────────────
  strukturBtn.onclick = async () => {
    strukturBtn.disabled = true;
    statusEl.textContent = '⏳ KI schlägt Grobstruktur vor…';
    try {
      const { refArbeiten, lernziele, ideenPool } = buildKontext();
      const dauerMin = pr.dauerVon || null;
      const dauerMax = pr.dauerBis || pr.dauerVon || null;
      let p = 'Du entwirfst eine Klassenarbeit. Schlage NUR die Hauptaufgaben vor — keine Unteraufgaben, keine Details.\n\n';
      if (dauerMin) {
        p += `## ZEITVORGABE (verbindlich)\nDie Klassenarbeit dauert ${dauerMin}${dauerMax && dauerMax !== dauerMin ? '–' + dauerMax : ''} Minuten. `;
        p += `Die Summe aller zeitMinuten-Werte MUSS in diesem Bereich liegen. Plane entsprechend viele und kurze Aufgaben.\n\n`;
      }
      p += `## KOMPOSITIONSSTIL\n${KOMPOSITIONSSTIL}\n\n`;
      if (refArbeiten.length) {
        p += '## REFERENZARBEITEN\n';
        refArbeiten.forEach(aa => {
          const aufgNr = [...new Set((aa.aufgaben||[]).map(a => (String(a.nr||'')).match(/^\d+/)?.[0]).filter(Boolean))];
          p += `${aa.titel}: ${aufgNr.length} Hauptaufgaben\n`;
        });
        p += '\n';
      }
      if (lernziele.length) { p += '## LERNZIELE\n'; lernziele.forEach((lz,i) => { p += `${i+1}. ${lz}\n`; }); p += '\n'; }
      if (pr.thema) p += `## THEMA\n${pr.thema}\n\n`;
      if (ideenPool.length) { p += '## IDEENPOOL (Themen)\n'; ideenPool.slice(0,20).forEach(idea => { p += `- ${idea}\n`; }); p += '\n'; }
      p += `Antworte NUR mit reinem JSON:
{"hauptaufgaben":[
  {"nr":1,"titel":"Kurzer Titel","beschreibung":"Was Schüler hier tun (1 Satz)","zeitMinuten":8,"gesamtpunkte":10,"typen":["Rechnung","Multiple Choice"],
   "anforderung":{"reproduktion":4,"leichteAnwendung":4,"mittlereAnwendung":2,"transfer":0}}
]}
anforderung: Punktverteilung auf vier Bereiche (Summe = gesamtpunkte, 0 wenn nicht vorhanden):
reproduktion | leichteAnwendung | mittlereAnwendung | transfer`;
      const raw = await callKI([{ type: 'text', text: p }], 2000);
      const parsed = parseKI(raw);
      pr.strukturVorschlag = (parsed.hauptaufgaben || []).map(a => ({
        ...a,
        taskId: uid(),
        _removed: false,
        _grobUnlocked: true,
        _needsFeinUpdate: false,
      }));
      pr.grobstrukturLocked = false;
      pr.feinstruktur = []; pr.genAufgaben = [];
      switchSubTab(1);
      savePruefungsDB();
      renderStruktur(); renderAFBBanner();
      zuFeinBtn.style.display = '';
      lockInfo.textContent = 'Zeit und Punkte hier grob anpassen, dann einmal die Feinplanung fuer alle Aufgaben laufen lassen.';
      const gesamtzeit = pr.strukturVorschlag.reduce((s, a) => s + (a.zeitMinuten || 0), 0);
      const zeitHinweis = gesamtzeit ? ` (${gesamtzeit} Min. gesamt)` : '';
      statusEl.textContent = '✓ ' + pr.strukturVorschlag.length + ' Aufgaben vorgeschlagen' + zeitHinweis + '. Streiche unerwünschte, dann → Feinstruktur.';
    } catch(e) { statusEl.textContent = '⚠ ' + e.message; }
    strukturBtn.disabled = false;
  };

  // ── Handler: Stufe 2 — Feinstruktur ──────────────────────────
  zuFeinBtn.onclick = async () => {
    const zuBearbeiten = getActiveTasks();
    if (!zuBearbeiten.length) { statusEl.textContent = '⚠ Keine Aufgaben ausgewählt.'; return; }
    zuFeinBtn.disabled = true; strukturBtn.disabled = true;
    pr.feinstruktur = []; switchSubTab(2);
    const { lernziele, ideenPool } = buildKontext();
    try {
      for (let i = 0; i < zuBearbeiten.length; i++) {
        const aufg = zuBearbeiten[i];
        const aufgNr = i + 1;
        statusEl.textContent = `⏳ Feinstruktur für Aufgabe ${aufgNr}… (${aufgNr}/${zuBearbeiten.length})`;
        pr.feinstruktur.push(await generateFeinstrukturForTask(aufg, aufgNr, lernziele, ideenPool));
        savePruefungsDB();
        renderFeinstruktur(); renderAFBBanner();
      }
      pr.grobstrukturLocked = true;
      pr.strukturVorschlag.forEach(aufg => {
        aufg._grobUnlocked = false;
        aufg._needsFeinUpdate = false;
      });
      syncDerivedOrder();
      savePruefungsDB();
      renderStruktur();
      renderFeinstruktur();
      renderGenAufgaben();
      renderAFBBanner();
      lockInfo.textContent = 'Grobstruktur ist nach der ersten Feinplanung gesperrt. Zum Aendern einzelne Aufgaben entsperren.';
      statusEl.textContent = '✓ Feinstruktur fertig. Korrigiere wenn nötig, dann → Aufgaben generieren.';
    } catch(e) { statusEl.textContent = '⚠ ' + e.message; }
    zuFeinBtn.disabled = false; strukturBtn.disabled = false;
  };

  // ── Handler: Stufe 3 — Konkrete Aufgaben ─────────────────────
  zuAufgBtn.onclick = async () => {
    if (!pr.feinstruktur.length) { statusEl.textContent = '⚠ Erst Feinstruktur vorschlagen.'; return; }
    zuAufgBtn.disabled = true;
    pr.genAufgaben = []; switchSubTab(3);
    try {
      for (let i = 0; i < pr.feinstruktur.length; i++) {
        const fs = pr.feinstruktur[i];
        statusEl.textContent = `⏳ Generiere Aufgabe ${fs.nr}… (${i+1}/${pr.feinstruktur.length})`;
        let p = `Erstelle konkrete Aufgabe ${fs.nr} "${fs.titel}" für eine Klassenarbeit.\n\n`;
        p += `## PÄDAGOGISCHE SPEZIFIKATION\n${fs.spezifikation}\n\n`;
        p += `Zeit: ${fs.zeitMinuten ?? '?'} Min, ${fs.gesamtpunkte ?? '?'} Punkte gesamt\n`;
        p += `Aufgabentypen: ${(fs.typen||[]).join(', ')}\n`;
        const anf3 = fs.anforderung || {};
        const erlaubt3 = Object.keys(AB_KEY_MAP).filter(k => (anf3[k] || 0) > 0);
        const verboten3 = Object.keys(AB_KEY_MAP).filter(k => (anf3[k] || 0) === 0);
        if (erlaubt3.length) {
          p += `\n## ANFORDERUNGSBEREICHE — VERBINDLICH\nErlaubt: ${erlaubt3.join(', ')}\nVERBOTEN (niemals verwenden): ${verboten3.join(', ')}\n`;
        }
        p += `\n## WICHTIG\n- Unteraufgaben rechnerisch unabhängig (neue Zahlen pro Unteraufgabe)\n- Progression leicht→schwer innerhalb der Aufgabe\n- Konkrete Zahlen und Texte — kein Platzhalter\n\n`;
        p += `Antworte NUR mit reinem JSON:
{"aufgabenstellung":null,"unteraufgaben":[
  {"nr":"${fs.nr}a","titel":null,"text":"konkreter Aufgabentext mit Zahlen","punkte":3,"anforderungsbereich":"reproduktion","typ":"Rechnung"},
  {"nr":"${fs.nr}b","titel":"Kurzer Titel","text":"konkreter Aufgabentext","punkte":4,"anforderungsbereich":"leichteAnwendung","typ":"Sachaufgabe"}
]}
anforderungsbereich: "reproduktion" | "leichteAnwendung" | "mittlereAnwendung" | "transfer"
titel: null wenn Typ "Rechnung", sonst kurzer beschreibender Titel
Unteraufgaben rechnerisch unabhängig (neue Zahlen).`;
        const raw = await callKI([{ type: 'text', text: p }], 3000);
        const parsed = parseKI(raw);
        pr.genAufgaben.push({
          taskId: fs.taskId, nr: fs.nr, titel: fs.titel, zeitMinuten: fs.zeitMinuten, gesamtpunkte: fs.gesamtpunkte,
          aufgabenstellung: parsed.aufgabenstellung || null,
          unteraufgaben: parsed.unteraufgaben || [],
        });
        syncDerivedOrder();
        savePruefungsDB();
        renderGenAufgaben(); renderAFBBanner();
      }
      statusEl.textContent = '✓ ' + pr.genAufgaben.length + ' Aufgaben generiert';
    } catch(e) { statusEl.textContent = '⚠ ' + e.message; }
    zuAufgBtn.disabled = false; strukturBtn.disabled = false;
  };

  return div;
}

function buildPrDetail(pr) {
  const div = mk('div', '');

  // Header
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', pr.titel || '–'));
  if (pr.thema) left.appendChild(tx('div', '', pr.thema)).style || (left.lastChild.style.cssText = 'font-size:15px;color:var(--tx2);margin-top:2px;');
  const datumStr = pr.datum ? new Date(pr.datum).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) : null;
  const dauerStr = pr.dauerVon
    ? (pr.dauerBis && pr.dauerBis !== pr.dauerVon ? pr.dauerVon + '–' + pr.dauerBis : pr.dauerVon) + ' Min.'
    : null;
  const meta = [
    pr.typ === 'klausur' ? 'Klausur' : 'Klassenarbeit',
    pr.kursLabel,
    datumStr,
    dauerStr,
  ].filter(Boolean).join(' · ');
  left.appendChild(tx('div', 'c-sub', meta));
  hdr.appendChild(left);
  div.appendChild(hdr);

  // Tabs
  let aktiverTab = 'lernziele';
  const tabRow = mk('div', '');
  tabRow.style.cssText = 'display:flex;gap:6px;margin-bottom:20px;border-bottom:2px solid var(--bord);padding-bottom:8px;';
  const tabContent = mk('div', '');
  div.appendChild(tabRow);
  div.appendChild(tabContent);

  const TABS = [
    { id: 'lernziele', label: '📋 Lernziele' },
    { id: 'quellen',   label: '📚 Quellen' },
    { id: 'aufgaben',  label: '✏️ Aufgaben' },
    { id: 'vorschau',  label: '👁 Vorschau' },
  ];

  function renderTab() {
    tabRow.innerHTML = '';
    TABS.forEach(t => {
      const tb = btn(t.label, 'btn btn-sm ' + (aktiverTab === t.id ? 'btn-pri' : 'btn-ghost'));
      tb.onclick = () => { aktiverTab = t.id; renderTab(); };
      tabRow.appendChild(tb);
    });
    tabContent.innerHTML = '';
    if (aktiverTab === 'lernziele') tabContent.appendChild(buildLernzieleTab(pr));
    else if (aktiverTab === 'quellen') tabContent.appendChild(buildQuellenTab(pr));
    else if (aktiverTab === 'aufgaben') tabContent.appendChild(buildAufgabenGenTab(pr));
    else {
      const ph = tx('div', '', 'Vorschau — folgt');
      ph.style.cssText = 'padding:40px;text-align:center;color:var(--tx3);';
      tabContent.appendChild(ph);
    }
  }
  renderTab();

  return div;
}

// ── Checkliste Detail ─────────────────────────────────────────────
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

  const grid = mk('div', '');
  grid.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:8px;';
  CHECKLISTDB.forEach(cl => {
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
  return div;
}

function buildAlteArbeitenOverview() {
  const div = mk('div', '');
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', ''); left.style.flex = '1';
  left.appendChild(tx('div', 'c-title', 'Alte Arbeiten'));
  left.appendChild(tx('div', 'c-sub', ALTE_ARBEITEN_DB.length + ' gespeichert'));
  hdr.appendChild(left);
  const newBtn = btn('+ Arbeit hinzufügen', 'btn btn-pri btn-sm');
  newBtn.onclick = () => showNeueAlteArbeitModal();
  hdr.appendChild(newBtn);
  div.appendChild(hdr);

  if (!ALTE_ARBEITEN_DB.length) {
    const empty = tx('div', '', 'Noch keine alten Arbeiten. Lade Fotos oder PDFs deiner früheren Klassenarbeiten hoch.');
    empty.style.cssText = 'padding:40px;text-align:center;color:var(--tx3);';
    div.appendChild(empty);
    return div;
  }

  const grid = mk('div', '');
  grid.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:8px;';
  ALTE_ARBEITEN_DB.forEach(aa => {
    const row = mk('div', 'card');
    const body = mk('div', 'card-body');
    body.style.cssText = 'display:flex;align-items:center;gap:12px;cursor:pointer;padding:10px 14px;';
    body.appendChild(tx('span', '', '📝'));
    const info = mk('div', ''); info.style.flex = '1';
    info.appendChild(tx('div', '', aa.titel || '–')).style.fontWeight = '600';
    const sub = [aa.kursLabel, aa.datum ? new Date(aa.datum).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}) : null, aa.dauer ? aa.dauer+' Min.' : null].filter(Boolean).join(' · ');
    if (sub) info.appendChild(tx('div', '', sub)).style.cssText = 'font-size:12px;color:var(--tx3);';
    body.appendChild(info);
    const del = btn('✕', 'matc-del'); del.style.color = 'var(--tx3)';
    del.onclick = e => { e.stopPropagation(); if (!confirm('"'+aa.titel+'" löschen?')) return; ALTE_ARBEITEN_DB=ALTE_ARBEITEN_DB.filter(a=>a.id!==aa.id); saveAlteArbeitenDB(); renderPr(); };
    body.appendChild(del);
    body.onclick = e => { if (e.target===del||del.contains(e.target)) return; PR.view='alte_arbeit'; PR.aktAlteArbeitId=aa.id; renderPr(); };
    row.appendChild(body); grid.appendChild(row);
  });
  div.appendChild(grid);
  return div;
}

function buildChecklistDetail(cl) {
  const div = mk('div', '');
  let editMode = false;

  function render() {
    div.innerHTML = '';

    // Header
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

    // Abschnitte
    const abschnitte = [...new Set((cl.lernziele||[]).map(l => l.abschnitt))];
    abschnitte.forEach(abschnitt => {
      const items = cl.lernziele.filter(l => l.abschnitt === abschnitt);
      const sec = mk('div', ''); sec.style.cssText = 'margin-bottom:20px;';

      // Abschnitts-Header
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

      // Lernziele
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

      // Neues Lernziel hinzufügen (nur im Edit-Modus)
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

    // Neuen Abschnitt hinzufügen (nur im Edit-Modus)
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

  // Upload
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
      const cl = { id: uid(), titel, lernziele, erstellt: new Date().toISOString() };
      CHECKLISTDB.push(cl);
      saveChecklistDB();
      PR.aktCheckId = cl.id; PR.view = 'checkliste'; PR.aktId = null;
      close(); renderPr();
    } catch(e) {
      statusEl.textContent = '⚠ ' + e.message;
      saveBtn.disabled = false;
    }
  };

  pan.appendChild(body); ov.appendChild(pan);
  document.getElementById('root').appendChild(ov);
  ov.classList.add('open');
}

// ── Neue Prüfung Modal ────────────────────────────────────────────
function showNewPruefungModal() {
  const ov = mk('div', 'matd-overlay');
  const pan = mk('div', 'matd-panel'); pan.style.maxWidth = '480px';
  const phdr = mk('div', 'matd-panel-hdr');
  phdr.appendChild(tx('span', 'matd-panel-title', 'Neue Prüfung'));
  const cls = btn('✕', 'btn btn-ghost btn-sm matd-close');
  const close = () => ov.remove();
  cls.onclick = close;
  phdr.appendChild(cls);
  pan.appendChild(phdr);
  ov.onclick = e => { if (e.target === ov) close(); };

  const body = mk('div', 'matd-panel-body');
  body.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:12px;';

  function field(label, inp) {
    const fg = mk('div', 'fg');
    fg.appendChild(tx('label', 'fl', label));
    fg.appendChild(inp);
    return fg;
  }

  const titelInp = document.createElement('input'); titelInp.className = 'finp'; titelInp.placeholder = 'z.B. Klassenarbeit 5';
  body.appendChild(field('Titel *', titelInp));

  const themaInp = document.createElement('input'); themaInp.className = 'finp'; themaInp.placeholder = 'z.B. Lineare Gleichungssysteme, Terme';
  body.appendChild(field('Thema', themaInp));

  const typSel = document.createElement('select'); typSel.className = 'finp';
  [['klassenarbeit','📝 Klassenarbeit'],['klausur','📋 Klausur']].forEach(([v,l]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = l; typSel.appendChild(o);
  });
  body.appendChild(field('Typ', typSel));

  // Kurs-Auswahl
  const kursSel = document.createElement('select'); kursSel.className = 'finp';
  const noKurs = document.createElement('option'); noKurs.value = ''; noKurs.textContent = '– kein Kurs –'; kursSel.appendChild(noKurs);
  (S.data?.kurse || []).forEach(k => {
    const fp = (S.data?.fachplanungen || []).find(f => f.id === k.fachplanungId);
    const o = document.createElement('option'); o.value = k.id;
    o.textContent = k.klasse + ' · ' + (fp ? fp.fach : '?') + ' ' + k.schuljahr;
    kursSel.appendChild(o);
  });
  body.appendChild(field('Kurs (optional)', kursSel));

  const datumInp = document.createElement('input'); datumInp.type = 'date'; datumInp.className = 'finp';
  body.appendChild(field('Datum', datumInp));

  const dauerRow = mk('div', ''); dauerRow.style.cssText = 'display:flex;gap:8px;align-items:center;';
  const dauerVonInp = document.createElement('input'); dauerVonInp.type = 'number'; dauerVonInp.className = 'finp'; dauerVonInp.placeholder = 'von'; dauerVonInp.min = 5; dauerVonInp.step = 5; dauerVonInp.value = '45';
  const dauerBisInp = document.createElement('input'); dauerBisInp.type = 'number'; dauerBisInp.className = 'finp'; dauerBisInp.placeholder = 'bis'; dauerBisInp.min = 5; dauerBisInp.step = 5; dauerBisInp.value = '45';
  dauerRow.appendChild(dauerVonInp);
  dauerRow.appendChild(tx('span', '', '–'));
  dauerRow.appendChild(dauerBisInp);
  dauerRow.appendChild(tx('span', '', 'Min.'));
  const dauerFg = mk('div', 'fg'); dauerFg.appendChild(tx('label', 'fl', 'Dauer')); dauerFg.appendChild(dauerRow);
  body.appendChild(dauerFg);

  const btnRow = mk('div', ''); btnRow.style.cssText = 'display:flex;gap:8px;margin-top:4px;';
  const saveBtn = btn('Anlegen', 'btn btn-pri btn-sm');
  const cancelB = btn('Abbrechen', 'btn btn-ghost btn-sm'); cancelB.onclick = close;
  btnRow.appendChild(saveBtn); btnRow.appendChild(cancelB);
  body.appendChild(btnRow);

  saveBtn.onclick = () => {
    const titel = titelInp.value.trim();
    if (!titel) { alert('Bitte einen Titel eingeben.'); return; }
    const kursId = kursSel.value || null;
    const kurs = kursId ? (S.data?.kurse || []).find(k => k.id === kursId) : null;
    const fp = kurs ? (S.data?.fachplanungen || []).find(f => f.id === kurs.fachplanungId) : null;
    const dauerVon = dauerVonInp.value ? parseInt(dauerVonInp.value) : null;
    const dauerBis = dauerBisInp.value ? parseInt(dauerBisInp.value) : null;
    const pr = {
      id: uid(),
      titel,
      thema: themaInp.value.trim() || null,
      typ: typSel.value,
      kursId,
      kursLabel: kurs ? kurs.klasse + (fp ? ' · ' + fp.fach : '') : null,
      datum: datumInp.value || null,
      dauerVon,
      dauerBis: dauerBis && dauerBis >= dauerVon ? dauerBis : dauerVon,
      lernziele: [],
      aufgaben: [],
      erstellt: new Date().toISOString(),
    };
    PRUEFUNGSDB.push(pr);
    savePruefungsDB();
    PR.aktId = pr.id;
    close();
    renderPr();
  };

  pan.appendChild(body);
  ov.appendChild(pan);
  document.getElementById('root').appendChild(ov);
  ov.classList.add('open');
}

// ── Version Check ─────────────────────────────────────────────────
async function prCheckVersion(ghDate) {
  const v = await fetch('version.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  if (!v) return;
  const prev = PR_VERSION_STATUS;
  PR_VERSION = v.built;
  if (ghDate) PR_VERSION_STATUS = new Date(v.built) >= new Date(ghDate) ? 'current' : 'deploying';
  if (prev === 'deploying' && PR_VERSION_STATUS === 'current' && Date.now() - _prStarted > 10000) { location.reload(true); return; }
  renderPr();
  if (PR_VERSION_STATUS === 'deploying') setTimeout(() => prCheckVersion(ghDate), 30000);
}

// ── Init ──────────────────────────────────────────────────────────
(async () => {
  renderPr(); // Lade-State zeigen

  const [data, pruefungen, checklisten, alteArbeiten, matdb, schulbuecher, klpdb, stilJson] = await Promise.all([
    sbDownload('data.json').catch(() => ({ fachplanungen: [], kurse: [] })),
    sbDownload('pruefungen.json').catch(() => []),
    sbDownload('checklisten.json').catch(() => []),
    sbDownload('alte_arbeiten.json').catch(() => []),
    sbDownload('materialien.json').catch(() => []),
    sbDownload('schulbuecher.json').catch(() => []),
    fetch('klp.json', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
    sbDownload('kompositionsstil.json').catch(() => null),
  ]);

  S.data = data || { fachplanungen: [], kurse: [] };
  if (!S.data.fachplanungen) S.data.fachplanungen = [];
  if (!S.data.kurse) S.data.kurse = [];

  PRUEFUNGSDB = Array.isArray(pruefungen) ? pruefungen : [];
  CHECKLISTDB = Array.isArray(checklisten) ? checklisten : [];
  ALTE_ARBEITEN_DB = Array.isArray(alteArbeiten) ? alteArbeiten : [];
  MATDB = Array.isArray(matdb) ? matdb : [];
  SCHULBUCHDB = Array.isArray(schulbuecher) ? schulbuecher : [];
  KLPDB = Array.isArray(klpdb) ? klpdb : [];
  if (stilJson?.text) KOMPOSITIONSSTIL = stilJson.text;

  renderPr();

  // Version prüfen
  fetch('https://api.github.com/repos/tdlrhg/unterrichtsplaner/commits/main',
    { headers: { 'Accept': 'application/vnd.github.v3+json' } })
    .then(r => r.json()).catch(() => null)
    .then(gh => { prCheckVersion(gh?.commit?.committer?.date || null); });
})();
