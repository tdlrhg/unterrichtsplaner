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

  const kursRow = mk('div', ''); kursRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;';
  kursRow.appendChild(tx('span', '', 'Kurs:')).style.cssText = 'font-size:12px;color:var(--tx3);';
  const kursSel = document.createElement('select'); kursSel.className = 'finp';
  kursSel.style.cssText = 'max-width:220px;font-size:12px;padding:3px 6px;';
  const noK = document.createElement('option'); noK.value = ''; noK.textContent = '– kein Kurs –'; kursSel.appendChild(noK);
  (S.data?.kurse || []).forEach(k => {
    const fp = (S.data?.fachplanungen||[]).find(f => f.id === k.fachplanungId);
    const o = document.createElement('option'); o.value = k.id;
    o.textContent = k.klasse + ' · ' + (fp ? fp.fach : '?') + ' ' + k.schuljahr;
    if (aa.kursId === k.id) o.selected = true;
    kursSel.appendChild(o);
  });
  kursSel.onchange = () => {
    const kursId = kursSel.value || null;
    const kurs = kursId ? (S.data?.kurse||[]).find(k=>k.id===kursId) : null;
    const fp = kurs ? (S.data?.fachplanungen||[]).find(f=>f.id===kurs.fachplanungId) : null;
    aa.kursId = kursId;
    aa.kursLabel = kurs ? kurs.klasse+(fp?' · '+fp.fach:'') : null;
    saveAlteArbeitenDB();
  };
  kursRow.appendChild(kursSel);

  const sjInp = document.createElement('input'); sjInp.className = 'finp'; sjInp.type = 'text';
  sjInp.placeholder = 'Schuljahr'; sjInp.value = aa.schuljahr || '';
  sjInp.style.cssText = 'max-width:90px;font-size:12px;padding:3px 6px;';
  sjInp.onchange = () => { aa.schuljahr = sjInp.value.trim() || null; saveAlteArbeitenDB(); };
  kursRow.appendChild(sjInp);

  const artSel = document.createElement('select'); artSel.className = 'finp';
  artSel.style.cssText = 'max-width:130px;font-size:12px;padding:3px 6px;';
  [{v:'regulaer',l:'Regulär'},{v:'nachschreiber',l:'Nachschreiber'}].forEach(o => {
    const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l;
    if ((aa.art || 'regulaer') === o.v) opt.selected = true;
    artSel.appendChild(opt);
  });
  artSel.onchange = () => { aa.art = artSel.value; saveAlteArbeitenDB(); };
  kursRow.appendChild(artSel);

  left.appendChild(kursRow);
  hdr.appendChild(left); div.appendChild(hdr);

  if (aa.aufgaben?.length) {
    const wrap = mk('div',''); wrap.style.cssText='display:flex;flex-direction:column;gap:3px;';
    div.appendChild(wrap);

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

      const hrow = mk('div',''); hrow.style.cssText='display:flex;align-items:baseline;gap:8px;margin-bottom:4px;';
      hrow.appendChild(tx('strong','','Aufgabe ' + base));
      const hauptEintrag = gruppe.find(a => String(a.nr) === base);
      const gesamtP = gruppe.reduce((s,a) => s + (a.punkte||0), 0);
      if (gesamtP) { const pt = tx('span','',gesamtP+' P'); pt.style.cssText='font-size:11px;color:var(--tx3);'; hrow.appendChild(pt); }
      const spacer = mk('span',''); spacer.style.flex='1'; hrow.appendChild(spacer);
      if (seite) { const s = tx('span','matc-jg','S. '+seite); hrow.appendChild(s); }
      body.appendChild(hrow);

      const stellung = hauptEintrag?.aufgabenstellung || (gruppe.length === 1 ? gruppe[0].aufgabenstellung : null);
      if (stellung) { const st = tx('div','',stellung); st.style.cssText='font-size:13px;color:var(--tx2);font-style:italic;margin-bottom:6px;'; body.appendChild(st); }

      const teilaufgaben = gruppe.filter(a => String(a.nr) !== base);
      const anzeigeGruppe = teilaufgaben.length ? teilaufgaben : (hauptEintrag ? [] : gruppe);

      if (gruppe.length === 1) {
        const a = gruppe[0];
        if (a.text) { const t = tx('div','',a.text); t.style.cssText='font-size:13px;color:var(--tx1);line-height:1.5;'; body.appendChild(t); }
        if (a.grafik) { const g = tx('div','','🖼 '+a.grafik); g.style.cssText='font-size:11px;color:var(--tx3);margin-top:3px;'; body.appendChild(g); }
      } else {
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

// ── Alte Arbeiten Overview ────────────────────────────────────────
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

  const groups = groupByJahrgang(ALTE_ARBEITEN_DB, aa => jahrgangOfKurs(aa.kursId));
  groups.forEach(({ jahrgang, items }) => {
    div.appendChild(jahrgangSecHdr(jahrgang, items.length));
    const grid = mk('div', '');
    grid.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:16px;';
    items.forEach(aa => {
      const row = mk('div', 'card');
      const body = mk('div', 'card-body');
      body.style.cssText = 'display:flex;align-items:center;gap:12px;cursor:pointer;padding:10px 14px;';
      body.appendChild(tx('span', '', '📝'));
      const info = mk('div', ''); info.style.flex = '1';
      const titelRow = mk('div', ''); titelRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
      titelRow.appendChild(tx('span', '', aa.titel || '–')).style.fontWeight = '600';
      if (aa.art === 'nachschreiber') titelRow.appendChild(tx('span', 'matc-jg', 'Nachschreiber'));
      info.appendChild(titelRow);
      const sub = [aa.kursLabel, aa.schuljahr, aa.datum ? new Date(aa.datum).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}) : null, aa.dauer ? aa.dauer+' Min.' : null].filter(Boolean).join(' · ');
      if (sub) info.appendChild(tx('div', '', sub)).style.cssText = 'font-size:12px;color:var(--tx3);';
      body.appendChild(info);
      const del = btn('✕', 'matc-del'); del.style.color = 'var(--tx3)';
      del.onclick = e => { e.stopPropagation(); if (!confirm('"'+aa.titel+'" löschen?')) return; ALTE_ARBEITEN_DB=ALTE_ARBEITEN_DB.filter(a=>a.id!==aa.id); saveAlteArbeitenDB(); renderPr(); };
      body.appendChild(del);
      body.onclick = e => { if (e.target===del||del.contains(e.target)) return; PR.view='alte_arbeit'; PR.aktAlteArbeitId=aa.id; renderPr(); };
      row.appendChild(body); grid.appendChild(row);
    });
    div.appendChild(grid);
  });
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

  const sjInp = document.createElement('input'); sjInp.className = 'finp'; sjInp.type = 'text'; sjInp.placeholder = 'z.B. 2025/26';
  body.appendChild(field('Schuljahr', sjInp));

  const artSel = document.createElement('select'); artSel.className = 'finp';
  [{v:'regulaer',l:'Regulär'},{v:'nachschreiber',l:'Nachschreiber'}].forEach(o => {
    const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; artSel.appendChild(opt);
  });
  body.appendChild(field('Art', artSel));

  const datumInp = document.createElement('input'); datumInp.type = 'date'; datumInp.className = 'finp';
  body.appendChild(field('Datum', datumInp));

  const dauerInp = document.createElement('input'); dauerInp.type = 'number'; dauerInp.className = 'finp'; dauerInp.placeholder = 'Minuten'; dauerInp.step = 5;
  body.appendChild(field('Dauer (Min.)', dauerInp));

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
        const raw = await callKI(blocks, { maxTokens: 6000, label: 'alte-arbeit-import' });
        let parsed;
        try { parsed = robustJsonParsePr(raw); }
        catch(e) { throw new Error('KI-Antwort konnte nicht gelesen werden (Seiten ' + (i+1) + '–' + end + ')'); }
        (parsed.aufgaben || []).forEach(a => { a.id = uid(); allAufgaben.push(a); });
      }
      statusEl.textContent = '✓ ' + allAufgaben.length + ' Aufgaben aus ' + uploadedImgs.length + ' Seiten extrahiert';

      const aa = {
        id: uid(), titel,
        kursId, kursLabel: kurs ? kurs.klasse+(fp?' · '+fp.fach:'') : null,
        schuljahr: sjInp.value.trim() || null,
        art: artSel.value,
        datum: datumInp.value || null,
        dauer: dauerInp.value ? parseInt(dauerInp.value) : null,
        aufgaben: allAufgaben, erstellt: new Date().toISOString(),
      };
      ALTE_ARBEITEN_DB.push(aa);
      saveAlteArbeitenDB();
      PR.aktAlteArbeitId = aa.id; PR.view = 'alte_arbeit'; PR.aktId = null;
      close(); renderPr();
    } catch(e) {
      showKIError(statusEl, e);
      saveBtn.disabled = false;
    }
  };

  pan.appendChild(body); ov.appendChild(pan);
  document.getElementById('root').appendChild(ov);
  ov.classList.add('open');
}
