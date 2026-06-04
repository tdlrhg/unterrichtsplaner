// ── Lernziele-Tab ─────────────────────────────────────────────────
function buildLernzieleTab(pr) {
  const div = mk('div', '');

  function renderLernziele() {
    div.innerHTML = '';

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
            pr.ausgewaehlteLernziele = cl.lernziele.map(l => l.id);
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

// ── Quellen-Tab ───────────────────────────────────────────────────
function buildQuellenTab(pr) {
  const div = mk('div', '');
  if (!pr.quellen) pr.quellen = { kapitel: [], material: [], alteArbeiten: [] };

  const prKurs = pr.kursId ? (S.data?.kurse||[]).find(k=>k.id===pr.kursId) : null;
  const prFp   = prKurs ? (S.data?.fachplanungen||[]).find(f=>f.id===prKurs.fachplanungId) : null;
  const prFach = prFp?.fach || null;
  function toSchulbuchFach(f) {
    if (!f) return null;
    if (f === 'M') return 'mathe';
    if (f.startsWith('Ch')) return 'chemie';
    if (f.startsWith('Bio')) return 'bio';
    return null;
  }
  const prFachSb = toSchulbuchFach(prFach);

  const aaHdr = tx('div', '', 'Alte Arbeiten als Vorlage');
  aaHdr.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);padding:6px 0 4px;border-bottom:2px solid var(--pri);margin-bottom:8px;';
  div.appendChild(aaHdr);

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

  const spacer = mk('div',''); spacer.style.height='16px'; div.appendChild(spacer);
  const sbHdr = tx('div', '', 'Schulbuch-Kapitel');
  sbHdr.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);padding:6px 0 4px;border-bottom:2px solid var(--pri);margin-bottom:8px;';
  div.appendChild(sbHdr);

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
