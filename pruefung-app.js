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
  const opens = (jsonStr.match(/\[/g)||[]).length - (jsonStr.match(/\]/g)||[]).length;
  const opensCurl = (jsonStr.match(/\{/g)||[]).length - (jsonStr.match(/\}/g)||[]).length;
  jsonStr += ']'.repeat(Math.max(0,opens)) + '}'.repeat(Math.max(0,opensCurl));
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

  // ── Referenzzeitraum ──────────────────────────────────────────
  const zeitRow = mk('div', '');
  zeitRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:20px;font-size:13px;color:var(--tx2);flex-wrap:wrap;';
  zeitRow.appendChild(tx('span', '', 'Die KI nutzt die Arbeiten der letzten'));
  const jahrInp = document.createElement('input');
  jahrInp.type = 'number'; jahrInp.step = '0.5'; jahrInp.min = '0.5'; jahrInp.max = '10';
  jahrInp.value = pr.referenzJahre ?? 2;
  jahrInp.style.cssText = 'width:58px;padding:4px 8px;border:1px solid var(--bord);border-radius:5px;background:var(--surf2);color:var(--tx1);font-size:13px;text-align:center;';
  jahrInp.onchange = () => { pr.referenzJahre = parseFloat(jahrInp.value) || 2; savePruefungsDB(); };
  zeitRow.appendChild(jahrInp);
  zeitRow.appendChild(tx('span', '', 'Jahre als Referenz für den Kompositionsstil.'));
  div.appendChild(zeitRow);

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
  div.appendChild(stilSec);

  const statusEl = mk('div', '');
  statusEl.style.cssText = 'font-size:13px;color:var(--tx2);min-height:18px;margin:8px 0 16px;';

  const genBtn = btn('✨ Aufgaben generieren', 'btn btn-pri btn-sm');
  div.appendChild(genBtn);
  div.appendChild(statusEl);

  const aufgabenWrap = mk('div', '');
  aufgabenWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
  div.appendChild(aufgabenWrap);

  function renderGenAufgaben() {
    aufgabenWrap.innerHTML = '';
    if (!pr.genAufgaben.length) return;
    pr.genAufgaben.forEach(aufg => {
      const card = mk('div', 'card');
      const body = mk('div', 'card-body');
      // Header
      const hrow = mk('div', '');
      hrow.style.cssText = 'display:flex;align-items:baseline;gap:10px;margin-bottom:6px;';
      const titSpan = tx('strong', '', 'Aufgabe ' + aufg.nr + (aufg.titel ? ': ' + aufg.titel : aufg.thema ? ': ' + aufg.thema : ''));
      hrow.appendChild(titSpan);
      if (aufg.zeitMinuten) {
        const zt = tx('span', '', '⏱ ' + aufg.zeitMinuten + ' Min');
        zt.style.cssText = 'font-size:11px;color:var(--tx3);';
        hrow.appendChild(zt);
      }
      if (aufg.gesamtpunkte) {
        const pt = tx('span', '', aufg.gesamtpunkte + ' P');
        pt.style.cssText = 'font-size:11px;color:var(--tx3);';
        hrow.appendChild(pt);
      }
      body.appendChild(hrow);
      if (aufg.aufgabenstellung) {
        const as = tx('div', '', aufg.aufgabenstellung);
        as.style.cssText = 'font-size:13px;color:var(--tx2);font-style:italic;margin-bottom:8px;';
        body.appendChild(as);
      }
      // Unteraufgaben
      const SC = { '○': '#16a34a', '◒': '#2563eb', '●': '#9d174d' };
      (aufg.unteraufgaben || []).forEach(ua => {
        const urow = mk('div', '');
        urow.style.cssText = 'display:flex;gap:10px;align-items:baseline;padding:5px 0;border-top:1px solid var(--bord);font-size:13px;';
        const nrS = tx('strong', '', ua.nr || ''); nrS.style.cssText = 'flex-shrink:0;min-width:28px;';
        urow.appendChild(nrS);
        if (ua.schwierigkeit) {
          const sw = tx('span', '', ua.schwierigkeit);
          sw.style.cssText = 'flex-shrink:0;color:' + (SC[ua.schwierigkeit] || 'var(--tx3)') + ';';
          urow.appendChild(sw);
        }
        const col = mk('div', ''); col.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:1px;';
        if (ua.titel) { const tit = tx('span', '', ua.titel); tit.style.cssText = 'font-size:11px;font-weight:600;color:var(--tx2);'; col.appendChild(tit); }
        const utxt = tx('span', '', ua.text || ''); utxt.style.cssText = 'color:var(--tx2);';
        col.appendChild(utxt);
        urow.appendChild(col);
        if (ua.typ) { const ty = tx('span', 'matc-jg', ua.typ); urow.appendChild(ty); }
        if (ua.punkte) { const pu = tx('span', '', ua.punkte + ' P'); pu.style.cssText = 'flex-shrink:0;font-size:11px;color:var(--tx3);'; urow.appendChild(pu); }
        body.appendChild(urow);
      });
      card.appendChild(body); aufgabenWrap.appendChild(card);
    });
  }
  renderGenAufgaben();

  genBtn.onclick = async () => {
    genBtn.disabled = true;
    statusEl.textContent = '⏳ Sammle Quellen…';
    try {
      const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
      const cutoff = new Date(Date.now() - (pr.referenzJahre ?? 2) * msPerYear);

      // Referenz-Arbeiten (Kompositionsstil)
      const refArbeiten = ALTE_ARBEITEN_DB.filter(aa => aa.datum && new Date(aa.datum) >= cutoff);

      // Quellen-Arbeiten (Ideenpool)
      const quellenAA = (pr.quellen?.alteArbeiten || [])
        .map(id => ALTE_ARBEITEN_DB.find(aa => aa.id === id)).filter(Boolean);

      // Schulbuch-Kapitel (Ideenpool)
      const quellenKap = [];
      (pr.quellen?.kapitel || []).forEach(kapId => {
        SCHULBUCHDB.forEach(buch => {
          (buch.kapitel || []).forEach(kap => {
            if (kap.id === kapId) quellenKap.push({ buch: buch.titel, kap });
            (kap.unterkapitel || []).forEach(u => { if (u.id === kapId) quellenKap.push({ buch: buch.titel, kap: u }); });
          });
        });
      });

      // Lernziele
      const lernziele = [];
      (pr.ausgewaehlteLernziele || []).forEach(lzId => {
        CHECKLISTDB.forEach(cl => {
          (cl.lernziele || []).forEach(lz => { if (lz.id === lzId) lernziele.push(lz.text); });
        });
      });

      // Prompt
      let prompt = 'Du bist ein erfahrener Gymnasiallehrer und entwirfst eine Klassenarbeit.\n\n';

      // Kompositionsstil immer einbauen
      prompt += `## MEIN KOMPOSITIONSSTIL (verbindliche Vorgaben)\n${KOMPOSITIONSSTIL}\n\n`;

      if (refArbeiten.length) {
        prompt += `## REFERENZARBEITEN (analysiere Aufbau und Stil dieser ${refArbeiten.length} aktuellen Arbeit${refArbeiten.length > 1 ? 'en' : ''})\n`;
        refArbeiten.forEach(aa => {
          prompt += `\n### ${aa.titel}${aa.datum ? ' (' + new Date(aa.datum).getFullYear() + ')' : ''}\n`;
          (aa.aufgaben || []).slice(0, 30).forEach(a => {
            prompt += `- Aufg. ${a.nr ?? '?'}: ${a.aufgabenstellung || a.text || ''} [${a.punkte ?? '?'} P, ${a.schwierigkeit || '?'}]\n`;
          });
        });
        prompt += '\n';
      }

      if (lernziele.length) {
        prompt += '## LERNZIELE (alle abdecken)\n';
        lernziele.forEach((lz, i) => { prompt += `${i + 1}. ${lz}\n`; });
        prompt += '\n';
      }

      if (pr.thema) prompt += `## THEMA\n${pr.thema}\n\n`;

      const ideenPool = [];
      quellenAA.forEach(aa => (aa.aufgaben || []).forEach(a => {
        if (a.text || a.aufgabenstellung) ideenPool.push(`[${aa.titel}] ${a.aufgabenstellung || ''} ${a.text || ''}`.trim());
      }));
      quellenKap.forEach(({ buch, kap }) => (kap.aufgaben || []).forEach(a => {
        if (a.text || a.aufgabenstellung) ideenPool.push(`[${buch} / ${kap.titel}] ${a.aufgabenstellung || ''} ${a.text || ''}`.trim());
      }));

      if (ideenPool.length) {
        prompt += `## AUFGABEN-IDEENPOOL (adaptiere passende Ideen — nicht 1:1 kopieren, neue Zahlen verwenden)\n`;
        ideenPool.slice(0, 50).forEach(idea => { prompt += `- ${idea}\n`; });
        prompt += '\n';
      }

      prompt += `## FORMAT
Antworte NUR mit reinem JSON — kein Markdown, keine Erklärungen, kein \`\`\`json:
{"aufgaben":[
  {"nr":1,"titel":"Titel der Aufgabe","zeitMinuten":10,"aufgabenstellung":"Gemeinsame Einleitung oder null","gesamtpunkte":8,"unteraufgaben":[
    {"nr":"1a","titel":null,"text":"Aufgabentext","punkte":2,"schwierigkeit":"○","typ":"Rechnung"},
    {"nr":"1b","titel":"Titel der Unteraufgabe","text":"Aufgabentext","punkte":3,"schwierigkeit":"◒","typ":"Sachaufgabe"},
    {"nr":"1c","titel":"Titel der Unteraufgabe","text":"Aufgabentext","punkte":3,"schwierigkeit":"●","typ":"Begründung"}
  ]}
]}
Schwierigkeit: "○" Reproduktion/einfach · "◒" Anwendung/mittel · "●" Transfer/schwer
Typen: "Rechnung" · "Sachaufgabe" · "Begründung" · "Multiple Choice" · "Diagramm" · "Lückentext"
Unteraufgaben sind thematisch verbunden, aber RECHNERISCH UNABHÄNGIG (eigene neue Zahlen).
titel bei Unteraufgaben: null wenn Typ "Rechnung", sonst kurzer beschreibender Titel.`;

      statusEl.textContent = '⏳ KI generiert Aufgaben…';
      const raw = await callKI([{ type: 'text', text: prompt }], 10000);

      // Markdown-Codeblöcke entfernen (```json ... ```)
      const cleaned = raw.replace(/^```[a-z]*\n?/m, '').replace(/```\s*$/m, '').trim();

      let parsed;
      try { parsed = robustJsonParsePr(cleaned); }
      catch (e) {
        const preview = cleaned ? cleaned.slice(0, 300).replace(/\n/g, ' ') : '(leer)';
        throw new Error('JSON-Fehler. Antwort-Anfang: ' + preview);
      }

      pr.genAufgaben = parsed.aufgaben || [];
      savePruefungsDB();
      renderGenAufgaben();
      statusEl.textContent = '✓ ' + pr.genAufgaben.length + ' Aufgaben generiert';
    } catch (e) {
      statusEl.textContent = '⚠ ' + e.message;
    }
    genBtn.disabled = false;
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
