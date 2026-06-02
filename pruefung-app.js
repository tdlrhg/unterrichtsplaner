// ── Prüfungsplaner App ────────────────────────────────────────────
let PRUEFUNGSDB = [];
let CHECKLISTDB = [];
let ALTE_ARBEITEN_DB = [];
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

  // ── Checklisten ───────────────────────────────────────────────
  sb.appendChild(mk('div', 'pr-sb-sep'));
  const clHdr = mk('div', 'pr-sb-hdr');
  clHdr.appendChild(tx('div', 'pr-sb-title', 'Checklisten'));
  clHdr.appendChild(tx('div', 'pr-sb-sub', CHECKLISTDB.length + ' gespeichert'));
  sb.appendChild(clHdr);

  const newClBtn = btn('+ Neue Checkliste', 'btn btn-ghost btn-sm pr-new-btn');
  newClBtn.onclick = () => showNewChecklistModal();
  sb.appendChild(newClBtn);

  CHECKLISTDB.forEach(cl => {
    const row = mk('div', 'pr-item' + (PR.view === 'checkliste' && PR.aktCheckId === cl.id ? ' active' : ''));
    const icon = tx('span', 'pr-item-icon', '☑️');
    row.appendChild(icon);
    const info = mk('div', ''); info.style.flex = '1'; info.style.minWidth = '0';
    info.appendChild(tx('div', 'pr-item-label', cl.titel || '–'));
    info.appendChild(tx('div', 'pr-item-sub', cl.lernziele?.length + ' Lernziele'));
    row.appendChild(info);
    const del = btn('✕', 'pr-item-del');
    del.onclick = e => {
      e.stopPropagation();
      if (!confirm('"' + cl.titel + '" löschen?')) return;
      CHECKLISTDB = CHECKLISTDB.filter(c => c.id !== cl.id);
      if (PR.aktCheckId === cl.id) { PR.aktCheckId = null; PR.view = 'pruefung'; }
      saveChecklistDB(); renderPr();
    };
    row.appendChild(del);
    row.onclick = () => { PR.aktCheckId = cl.id; PR.view = 'checkliste'; PR.aktId = null; renderPr(); };
    sb.appendChild(row);
  });

  // ── Alte Arbeiten ─────────────────────────────────────────────
  sb.appendChild(mk('div', 'pr-sb-sep'));
  const aaHdr = mk('div', 'pr-sb-hdr');
  aaHdr.appendChild(tx('div', 'pr-sb-title', 'Alte Arbeiten'));
  aaHdr.appendChild(tx('div', 'pr-sb-sub', ALTE_ARBEITEN_DB.length + ' gespeichert'));
  sb.appendChild(aaHdr);

  const newAaBtn = btn('+ Arbeit hinzufügen', 'btn btn-ghost btn-sm pr-new-btn');
  newAaBtn.onclick = () => showNeueAlteArbeitModal();
  sb.appendChild(newAaBtn);

  ALTE_ARBEITEN_DB.forEach(aa => {
    const row = mk('div', 'pr-item' + (PR.view === 'alte_arbeit' && PR.aktAlteArbeitId === aa.id ? ' active' : ''));
    row.appendChild(tx('span', 'pr-item-icon', '📝'));
    const info = mk('div', ''); info.style.flex = '1'; info.style.minWidth = '0';
    info.appendChild(tx('div', 'pr-item-label', aa.titel || '–'));
    const sub = [aa.kursLabel, aa.datum ? new Date(aa.datum).toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'}) : null].filter(Boolean).join(' · ');
    if (sub) info.appendChild(tx('div', 'pr-item-sub', sub));
    row.appendChild(info);
    const del = btn('✕', 'pr-item-del');
    del.onclick = e => {
      e.stopPropagation();
      if (!confirm('"' + aa.titel + '" löschen?')) return;
      ALTE_ARBEITEN_DB = ALTE_ARBEITEN_DB.filter(a => a.id !== aa.id);
      if (PR.aktAlteArbeitId === aa.id) { PR.aktAlteArbeitId = null; PR.view = 'pruefung'; }
      saveAlteArbeitenDB(); renderPr();
    };
    row.appendChild(del);
    row.onclick = () => { PR.aktAlteArbeitId = aa.id; PR.view = 'alte_arbeit'; PR.aktId = null; renderPr(); };
    sb.appendChild(row);
  });

  return sb;
}

// ── Content ───────────────────────────────────────────────────────
function buildPrContent() {
  const c = mk('div', 'pr-content');
  if (PR.view === 'checkliste' && PR.aktCheckId) {
    const cl = CHECKLISTDB.find(c => c.id === PR.aktCheckId);
    if (cl) c.appendChild(buildChecklistDetail(cl));
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
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', aa.titel || '–'));
  const sub = [aa.kursLabel, aa.datum ? new Date(aa.datum).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}) : null, aa.dauer ? aa.dauer + ' Min.' : null].filter(Boolean).join(' · ');
  if (sub) left.appendChild(tx('div', 'c-sub', sub));
  hdr.appendChild(left); div.appendChild(hdr);

  if (aa.seiten?.length) {
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
  const fileInp = document.createElement('input'); fileInp.type='file'; fileInp.accept='image/*'; fileInp.multiple=true; fileInp.style.display='none';
  zone.onclick = () => fileInp.click();
  zone.ondragover = e => { e.preventDefault(); zone.style.borderColor='var(--pri)'; };
  zone.ondragleave = () => { zone.style.borderColor='var(--bord)'; };
  const thumbsRow = mk('div',''); thumbsRow.style.cssText='display:flex;flex-wrap:wrap;gap:6px;';
  function addImgs(files) { [...files].forEach(f => { const r=new FileReader(); r.onload=e=>{uploadedImgs.push(e.target.result);updateZone();}; r.readAsDataURL(f); }); }
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
      // Verbatim-Extraktion (wie Materialsammlungen)
      const seiten = [];
      for (let i = 0; i < uploadedImgs.length; i += 4) {
        const batch = uploadedImgs.slice(i, i+4);
        statusEl.textContent = `⏳ Lese Seite ${i+1}–${Math.min(i+4,uploadedImgs.length)} von ${uploadedImgs.length}…`;
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
          { type:'text', text:`Lies diese Seiten einer Klassenarbeit wortwörtlich aus.
Antworte im Format:
=== Seite ${i+1} | [Titel/Überschrift der Seite] ===
[vollständiger Text]
GRAFIK: [Beschreibung oder "keine"]

Kopf-/Fußzeilen, Seitenzahlen und Schul-URLs weglassen.` }
        ];
        const raw = await callKI(blocks, 6000);
        const bloecke = raw.split(/\n(?===)/);
        for (const block of bloecke) {
          const m = block.match(/^===\s*Seite\s*(\d+)\s*\|\s*(.+?)\s*===/i);
          if (!m) continue;
          const rest = block.slice(block.indexOf('===',3)+3).trim();
          const grafikM = rest.match(/\nGRAFIK:\s*(.+)$/im);
          const grafik = grafikM ? (grafikM[1].trim().toLowerCase()==='keine'?null:grafikM[1].trim()) : null;
          const inhalt = grafikM ? rest.slice(0,grafikM.index).trim() : rest;
          seiten.push({ seite: parseInt(m[1]), thema: m[2].trim(), inhalt, grafik });
        }
      }

      const aa = {
        id: uid(), titel,
        kursId, kursLabel: kurs ? kurs.klasse+(fp?' · '+fp.fach:'') : null,
        datum: datumInp.value || null,
        dauer: dauerInp.value ? parseInt(dauerInp.value) : null,
        seiten, erstellt: new Date().toISOString(),
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

  // ── Alte Arbeiten ──────────────────────────────────────────────
  const aaHdr = tx('div', '', 'Alte Arbeiten als Vorlage');
  aaHdr.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);padding:6px 0 4px;border-bottom:2px solid var(--pri);margin-bottom:8px;';
  div.appendChild(aaHdr);

  if (!ALTE_ARBEITEN_DB.length) {
    const hint = tx('div', '', 'Noch keine alten Arbeiten gespeichert.');
    hint.style.cssText = 'font-size:13px;color:var(--tx3);margin-bottom:16px;';
    div.appendChild(hint);
  } else {
    ALTE_ARBEITEN_DB.forEach(aa => {
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
    });
  }

  // ── Schulbücher ────────────────────────────────────────────────
  div.appendChild(mk('div','').setAttribute||(() => {
    const spacer = mk('div',''); spacer.style.height='16px'; div.appendChild(spacer);
  })());
  const sbHdr = tx('div', '', 'Schulbuch-Kapitel');
  sbHdr.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);padding:6px 0 4px;border-bottom:2px solid var(--pri);margin-bottom:8px;margin-top:8px;';
  div.appendChild(sbHdr);

  if (!SCHULBUCHDB.length) {
    div.appendChild(tx('div','','Keine Schulbücher in der Datenbank.')).style.cssText='font-size:13px;color:var(--tx3);';
  } else {
    SCHULBUCHDB.forEach(buch => {
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
    else {
      const ph = tx('div', '', aktiverTab === 'aufgaben' ? 'Aufgaben — folgt' : 'Vorschau — folgt');
      ph.style.cssText = 'padding:40px;text-align:center;color:var(--tx3);';
      tabContent.appendChild(ph);
    }
  }
  renderTab();

  return div;
}

// ── Checkliste Detail ─────────────────────────────────────────────
function buildChecklistDetail(cl) {
  const div = mk('div', '');

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', cl.titel || '–'));
  left.appendChild(tx('div', 'c-sub', (cl.lernziele?.length || 0) + ' Lernziele in ' + ([...new Set((cl.lernziele||[]).map(l => l.abschnitt))].length) + ' Abschnitten'));
  hdr.appendChild(left);
  div.appendChild(hdr);

  const abschnitte = [...new Set((cl.lernziele||[]).map(l => l.abschnitt))];
  abschnitte.forEach(abschnitt => {
    const items = cl.lernziele.filter(l => l.abschnitt === abschnitt);
    const sec = mk('div', ''); sec.style.cssText = 'margin-bottom:16px;';
    const secHdr = tx('div', '', abschnitt);
    secHdr.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);padding:6px 0 4px;border-bottom:2px solid var(--pri);margin-bottom:6px;';
    sec.appendChild(secHdr);
    items.forEach(lz => {
      const row = tx('div', '', lz.nr + '. ' + lz.text);
      row.style.cssText = 'font-size:13px;line-height:1.5;padding:5px 8px;color:var(--tx2);';
      sec.appendChild(row);
    });
    div.appendChild(sec);
  });

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
  const fileInp = document.createElement('input'); fileInp.type = 'file'; fileInp.accept = 'image/*'; fileInp.multiple = true; fileInp.style.display = 'none';
  zone.onclick = () => fileInp.click();
  zone.ondragover = e => { e.preventDefault(); zone.style.borderColor = 'var(--pri)'; };
  zone.ondragleave = () => { zone.style.borderColor = 'var(--bord)'; };
  const thumbsRow = mk('div', ''); thumbsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';

  function addImgs(files) {
    [...files].forEach(f => {
      const r = new FileReader(); r.onload = e => { uploadedImgs.push(e.target.result); updateZone(); }; r.readAsDataURL(f);
    });
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

  const [data, pruefungen, checklisten, alteArbeiten, matdb, schulbuecher, klpdb] = await Promise.all([
    sbDownload('data.json').catch(() => ({ fachplanungen: [], kurse: [] })),
    sbDownload('pruefungen.json').catch(() => []),
    sbDownload('checklisten.json').catch(() => []),
    sbDownload('alte_arbeiten.json').catch(() => []),
    sbDownload('materialien.json').catch(() => []),
    sbDownload('schulbuecher.json').catch(() => []),
    fetch('klp.json', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
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

  renderPr();

  // Version prüfen
  fetch('https://api.github.com/repos/tdlrhg/unterrichtsplaner/commits/main',
    { headers: { 'Accept': 'application/vnd.github.v3+json' } })
    .then(r => r.json()).catch(() => null)
    .then(gh => { prCheckVersion(gh?.commit?.committer?.date || null); });
})();
