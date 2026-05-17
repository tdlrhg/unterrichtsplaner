// ── Modal: Kalender & Ausfälle ────────────────────────────────────
function modalHandlerKalender(type, data, m) {
  if (type === 'newAusfalltag') {
    m.appendChild(tx('div', 'modal-title', 'Ausfalltag hinzufügen'));
    m.appendChild(modalInput('mdat', 'Datum', '', '', 'date'));
    m.appendChild(modalInput('mgrd', 'Grund (optional)', 'z.B. Pädagogischer Tag'));
    const footer = mk('div', 'modal-footer');
    footer.appendChild(cancelBtn());
    const sv = btn('Hinzufügen', 'btn btn-pri');
    sv.onclick = () => {
      const dat = document.getElementById('mdat').value;
      if (!dat) return;
      const grd = document.getElementById('mgrd').value.trim();
      if (!S.data.kalender) S.data.kalender = {};
      if (!S.data.kalender.ausfalltage) S.data.kalender.ausfalltage = [];
      if (!S.data.kalender.ausfalltageGruende) S.data.kalender.ausfalltageGruende = {};
      if (!S.data.kalender.ausfalltage.includes(dat)) S.data.kalender.ausfalltage.push(dat);
      if (grd) S.data.kalender.ausfalltageGruende[dat] = grd;
      S.modal = null; scheduleSave(); render();
    };
    footer.appendChild(sv); m.appendChild(footer);
    return true;
  }

  if (type === 'tagPanel') {
    const WOCHENTAGE_LANG = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
    const d = new Date(data.datum + 'T12:00:00');
    m.appendChild(tx('div', 'modal-title', WOCHENTAGE_LANG[d.getDay()] + ', ' + data.datum));
    if (data.isAusfall) {
      const kal = S.data.kalender || {};
      const grund = (kal.ausfalltageGruende || {})[data.datum] || '–';
      const info = mk('div', '');
      info.style.cssText = 'padding:12px;background:#fee2e2;border-radius:6px;margin-bottom:16px;font-size:13px;color:#dc2626;';
      info.appendChild(tx('div', '', '🔴 Schulweiter Ausfalltag'));
      info.appendChild(tx('div', '', 'Grund: ' + grund));
      m.appendChild(info);
      const removeBtn = btn('Ausfalltag aufheben', 'btn btn-ghost');
      removeBtn.onclick = () => {
        S.data.kalender.ausfalltage = S.data.kalender.ausfalltage.filter(t => t !== data.datum);
        if (S.data.kalender.ausfalltageGruende) delete S.data.kalender.ausfalltageGruende[data.datum];
        scheduleSave(); S.modal = null; render();
      };
      m.appendChild(removeBtn);
      const footer = mk('div', 'modal-footer'); footer.appendChild(cancelBtn()); m.appendChild(footer);
    } else {
      const optGrid = mk('div', '');
      optGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;';
      function optBox(icon, titel, sub, onClick) {
        const opt = mk('div', '');
        opt.style.cssText = 'padding:16px;border:2px solid var(--bord);border-radius:8px;cursor:pointer;text-align:center;transition:all .15s;';
        opt.innerHTML = '<div style="font-size:28px">' + icon + '</div><div style="font-weight:700;margin-top:6px;">' + titel + '</div><div style="font-size:12px;color:var(--tx2);margin-top:2px;">' + sub + '</div>';
        opt.onmouseenter = () => { opt.style.borderColor='var(--pri)'; opt.style.background='#eff6ff'; };
        opt.onmouseleave = () => { opt.style.borderColor='var(--bord)'; opt.style.background=''; };
        opt.onclick = onClick;
        return opt;
      }
      optGrid.appendChild(optBox('📅', 'Ganzer Tag', 'Schulweiter Ausfall', () => { S.modal={type:'grundAusfalltag',data:{datum:data.datum}}; render(); }));
      optGrid.appendChild(optBox('🕐', 'Einzelne Stunden', 'Ausfälle oder Zusatzstunden', () => { S.modal={type:'einzelStunden',data:{datum:data.datum}}; render(); }));
      m.appendChild(optGrid);
      const footer = mk('div', 'modal-footer'); footer.appendChild(cancelBtn()); m.appendChild(footer);
    }
    return true;
  }

  if (type === 'grundAusfalltag') {
    m.appendChild(tx('div', 'modal-title', 'Schulweiter Ausfall · ' + data.datum));
    const fg = mk('div', 'fg');
    fg.appendChild(tx('label', 'fl', 'Grund'));
    const presets = ['Pädagogischer Tag', 'Beweglicher Ferientag', 'Wandertag', 'Exkursion', 'Krankheit', 'Fachkonferenz', 'Vertretung entfällt'];
    const chips = mk('div', '');
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;';
    presets.forEach(p => { const c = btn(p, 'btn btn-ghost btn-xs'); c.onclick = () => { document.getElementById('mgrd').value = p; }; chips.appendChild(c); });
    fg.appendChild(chips);
    const inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'mgrd'; inp.className = 'finp';
    inp.placeholder = 'Grund eingeben oder oben auswählen…';
    fg.appendChild(inp); m.appendChild(fg);
    const footer = mk('div', 'modal-footer');
    const skip = btn('Ohne Grund speichern', 'btn btn-ghost');
    skip.onclick = () => {
      if (!S.data.kalender) S.data.kalender = {};
      if (!S.data.kalender.ausfalltage) S.data.kalender.ausfalltage = [];
      if (!S.data.kalender.ausfalltage.includes(data.datum)) S.data.kalender.ausfalltage.push(data.datum);
      scheduleSave(); S.modal = null; render();
    };
    footer.appendChild(skip);
    const sv = btn('Speichern', 'btn btn-pri');
    sv.onclick = () => {
      if (!S.data.kalender) S.data.kalender = {};
      if (!S.data.kalender.ausfalltage) S.data.kalender.ausfalltage = [];
      if (!S.data.kalender.ausfalltageGruende) S.data.kalender.ausfalltageGruende = {};
      if (!S.data.kalender.ausfalltage.includes(data.datum)) S.data.kalender.ausfalltage.push(data.datum);
      const grd = document.getElementById('mgrd').value.trim();
      if (grd) S.data.kalender.ausfalltageGruende[data.datum] = grd;
      scheduleSave(); S.modal = null; render();
    };
    footer.appendChild(sv); m.appendChild(footer);
    return true;
  }

  if (type === 'einzelStunden') {
    const kal = S.data.kalender || {};
    const einzelAusfaelle = kal.einzelAusfaelle || [];
    if (data.kursId && !data.datum) {
      m.appendChild(tx('div', 'modal-title', 'Ausfall eintragen'));

      const datFg = mk('div', 'fg');
      datFg.appendChild(tx('label', 'fl', 'Datum'));
      const datInp = document.createElement('input');
      datInp.type = 'date'; datInp.id = 'mdat'; datInp.className = 'finp';
      datFg.appendChild(datInp);
      m.appendChild(datFg);

      m.appendChild(modalInput('mgrd', 'Grund (optional)', 'z.B. Krankheit'));

      const stundenPreview = mk('div', '');
      stundenPreview.style.cssText = 'margin-top:8px;';
      m.appendChild(stundenPreview);

      const kursEA = (S.data.kurse || []).find(k => k.id === data.kursId);
      const kalEA = S.data.kalender || {};
      const selectedStunden = new Set();

      function updatePreview() {
        const dat = datInp.value;
        stundenPreview.innerHTML = '';
        if (!dat || !kursEA) return;
        const d = new Date(dat + 'T12:00:00');
        const dw = ['','Mo','Di','Mi','Do','Fr'][d.getDay()];
        if (!dw) { stundenPreview.appendChild(gray('Kein Unterrichtstag.')); return; }
        const gerade = isGeradeKW(strToDate(dat));
        const slotsHeute = (kursEA.stundenplan || [])
          .filter(slot => {
            if (slot.tag !== dw) return false;
            if (slot.kwTyp === 'gerade' && !gerade) return false;
            if (slot.kwTyp === 'ungerade' && gerade) return false;
            return true;
          })
          .sort((a,b) => parseInt(a.stunde)-parseInt(b.stunde));
        if (slotsHeute.length === 0) { stundenPreview.appendChild(gray('Kein Unterricht laut Stundenplan.')); return; }
        if (selectedStunden.size === 0) slotsHeute.forEach(s => selectedStunden.add(s.stunde));
        const lbl = tx('div', '', 'Betroffene Stunden (Klick zum Abwählen):');
        lbl.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);margin-bottom:6px;';
        stundenPreview.appendChild(lbl);
        const chips = mk('div', ''); chips.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
        slotsHeute.forEach(slot => {
          const isAus = selectedStunden.has(slot.stunde);
          const chip = mk('button', 'btn btn-xs ' + (isAus ? 'btn-danger' : 'btn-ghost'));
          chip.textContent = slot.stunde + '. Std';
          chip.onclick = () => { if(selectedStunden.has(slot.stunde))selectedStunden.delete(slot.stunde); else selectedStunden.add(slot.stunde); updatePreview(); };
          chips.appendChild(chip);
        });
        stundenPreview.appendChild(chips);
      }
      datInp.onchange = updatePreview;

      const footer = mk('div', 'modal-footer'); footer.appendChild(cancelBtn());
      const sv = btn('Speichern', 'btn btn-pri');
      sv.onclick = () => {
        const dat = document.getElementById('mdat').value;
        if (!dat || selectedStunden.size === 0) return;
        const grund = document.getElementById('mgrd').value.trim();
        if (!S.data.kalender) S.data.kalender = {};
        if (!S.data.kalender.einzelAusfaelle) S.data.kalender.einzelAusfaelle = [];
        if (!S.data.kalender.einzelAusfaelleGruende) S.data.kalender.einzelAusfaelleGruende = {};
        S.data.kalender.einzelAusfaelle = S.data.kalender.einzelAusfaelle.filter(
          a => !(a.kursId === data.kursId && a.datum === dat)
        );
        selectedStunden.forEach(stunde => {
          S.data.kalender.einzelAusfaelle.push({ datum: dat, kursId: data.kursId, stunde });
        });
        if (grund) S.data.kalender.einzelAusfaelleGruende[data.kursId + '_' + dat] = grund;
        S.modal = null; scheduleSave(); render();
      };
      footer.appendChild(sv); m.appendChild(footer);
      return true;
    }
    m.appendChild(tx('div', 'modal-title', 'Einzelne Stunden · ' + data.datum));
    const d3 = new Date(data.datum + 'T12:00:00');
    const dw3 = ['','Mo','Di','Mi','Do','Fr'][d3.getDay()] || '';
    const vorher = einzelAusfaelle.filter(a => a.datum === data.datum);
    const tmpAusfaelle = new Set(vorher.map(a => a.kursId + '_' + a.stunde));
    const kurseHeute = (S.data.kurse || []).flatMap(kurs => (kurs.stundenplan||[]).filter(slot=>slot.tag===dw3).map(slot=>({kurs,slot})));
    const list = mk('div', ''); list.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:16px;';
    if (kurseHeute.length === 0) { list.appendChild(gray('Keine Kurse an diesem Tag laut Stundenplan.')); }
    else {
      kurseHeute.forEach(({kurs,slot}) => {
        const fp = getFachplanung(kurs.fachplanungId);
        const label = kurs.klasse+' · '+(fp?fachLabel(fp.fach):'?')+' · '+slot.stunde+'. Std';
        const key = kurs.id+'_'+slot.stunde;
        const row = mk('div',''); row.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--bord);border-radius:6px;background:'+(tmpAusfaelle.has(key)?'#fff5f5':'var(--surf2)')+';';
        const lbl=tx('span','',label); lbl.style.flex='1'; row.appendChild(lbl);
        const toggleBtn=mk('button','btn btn-xs '+(tmpAusfaelle.has(key)?'btn-danger':'btn-ghost'));
        toggleBtn.textContent=tmpAusfaelle.has(key)?'✓ Fällt aus':'Fällt aus';
        toggleBtn.onclick=()=>{
          if(tmpAusfaelle.has(key)){tmpAusfaelle.delete(key);toggleBtn.textContent='Fällt aus';toggleBtn.className='btn btn-xs btn-ghost';row.style.background='var(--surf2)';}
          else{tmpAusfaelle.add(key);toggleBtn.textContent='✓ Fällt aus';toggleBtn.className='btn btn-xs btn-danger';row.style.background='#fff5f5';}
        };
        row.appendChild(toggleBtn); list.appendChild(row);
      });
    }
    m.appendChild(list);
    const footerEA = mk('div','modal-footer');
    footerEA.style.cssText='display:flex;justify-content:flex-end;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--bord);padding-bottom:16px;';
    const cancelEA=btn('Abbrechen','btn btn-ghost'); cancelEA.onclick=()=>{S.modal=null;render();}; footerEA.appendChild(cancelEA);
    const saveEA=btn('Speichern','btn btn-pri');
    saveEA.onclick=()=>{
      if(!S.data.kalender)S.data.kalender={};
      if(!S.data.kalender.einzelAusfaelle)S.data.kalender.einzelAusfaelle=[];
      S.data.kalender.einzelAusfaelle=S.data.kalender.einzelAusfaelle.filter(a=>a.datum!==data.datum);
      tmpAusfaelle.forEach(key=>{const[kursId,stunde]=key.split('_');S.data.kalender.einzelAusfaelle.push({datum:data.datum,kursId,stunde});});
      S.modal=null; scheduleSave(); render();
    };
    footerEA.appendChild(saveEA); m.appendChild(footerEA);
    const addSec=mk('div',''); addSec.style.cssText='border-top:1px solid var(--bord);padding-top:12px;';
    addSec.appendChild(tx('div','','+ Zusatzstunde für diesen Tag')).style.cssText='font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;';
    const addRow=mk('div',''); addRow.style.cssText='display:flex;gap:8px;align-items:center;';
    const kursSel=document.createElement('select'); kursSel.className='finp'; kursSel.style.flex='1';
    (S.data.kurse||[]).forEach(k=>{const fp=getFachplanung(k.fachplanungId);const o=document.createElement('option');o.value=k.id;o.textContent=k.klasse+' · '+(fp?fachLabel(fp.fach):'?');kursSel.appendChild(o);});
    const addZBtn=btn('+ Zusatz','btn btn-pri btn-xs');
    addZBtn.onclick=()=>{if(!S.data.kalender)S.data.kalender={};if(!S.data.kalender.einzelZusatz)S.data.kalender.einzelZusatz=[];S.data.kalender.einzelZusatz.push({datum:data.datum,kursId:kursSel.value});scheduleSave();S.modal={type:'einzelStunden',data};render();};
    addRow.appendChild(kursSel); addRow.appendChild(addZBtn); addSec.appendChild(addRow); m.appendChild(addSec);
    const footer=mk('div','modal-footer'); footer.appendChild(cancelBtn()); m.appendChild(footer);
    return true;
  }

  if (type === 'waehlStartstunde') {
    const { kursId, blockId, woche } = data;
    const kurs = (S.data.kurse||[]).find(k=>k.id===kursId);
    const fp = getFachplanung(kurs&&kurs.fachplanungId);
    const block = fp&&(fp.blocks||[]).find(b=>b.id===blockId);
    const einzelAusfaelle = ((S.data.kalender||{}).einzelAusfaelle||[]).filter(a=>a.kursId===kursId);
    m.appendChild(tx('div','modal-title','Startstunde wählen'));
    const sub=tx('div','','KW '+woche.kw+' · '+(block?block.titel:''));
    sub.style.cssText='font-size:13px;color:var(--tx2);margin-bottom:16px;'; m.appendChild(sub);
    const stundenDerWoche=(woche.stunden||[]).sort((a,b)=>['Mo','Di','Mi','Do','Fr'].indexOf(a.tag)-['Mo','Di','Mi','Do','Fr'].indexOf(b.tag)||parseInt(a.stunde)-parseInt(b.stunde));
    if(stundenDerWoche.length===0){m.appendChild(gray('Keine Unterrichtsstunden in dieser Woche.'));}
    else{
      const list=mk('div',''); list.style.cssText='display:flex;flex-direction:column;gap:6px;';
      stundenDerWoche.forEach(std=>{
        const ausgefallen=einzelAusfaelle.some(a=>a.datum===std.datum&&a.stunde===std.stunde);
        const btn2=mk('button','btn btn-ghost'); btn2.style.cssText='text-align:left;'+(ausgefallen?'opacity:.4;cursor:not-allowed;':'');
        btn2.textContent=std.tag+', '+std.datum+' · '+std.stunde+'. Stunde'+(ausgefallen?' (ausgefallen)':'');
        if(!ausgefallen){btn2.onclick=()=>{if(!S.data.zeitplanung)S.data.zeitplanung={};if(!S.data.zeitplanung[kursId])S.data.zeitplanung[kursId]={};S.data.zeitplanung[kursId][blockId]={datum:std.datum,stunde:std.stunde};S.modal=null;scheduleSave();render();};}
        list.appendChild(btn2);
      });
      m.appendChild(list);
    }
    const footer=mk('div','modal-footer'); footer.appendChild(cancelBtn()); m.appendChild(footer);
    return true;
  }

  if (type === 'newKlassenarbeit') {
    const { kursId } = data;
    m.appendChild(tx('div', 'modal-title', 'Klassenarbeit eintragen'));
    m.appendChild(modalInput('mdat', 'Datum', '', '', 'date'));
    m.appendChild(modalInput('mtit', 'Titel (optional)', 'z.B. KA 1: Elektrochemie'));
    const stdFg = mk('div', 'fg');
    stdFg.appendChild(tx('label', 'fl', 'Erste Stunde'));
    const stdSel = document.createElement('select'); stdSel.id = 'mstd'; stdSel.className = 'finp';
    ['1','2','3','4','5','6','7','8','9'].forEach(s => { const o = document.createElement('option'); o.value=s; o.textContent=s+'. Stunde'; stdSel.appendChild(o); });
    stdFg.appendChild(stdSel); m.appendChild(stdFg);
    const dsFg = mk('div', 'fg');
    dsFg.appendChild(tx('label', 'fl', 'Umfang'));
    const dsWrap = mk('div', ''); dsWrap.style.cssText = 'display:flex;gap:8px;';
    ['Einzelstunde', 'Doppelstunde'].forEach((label, i) => {
      const rb = document.createElement('input'); rb.type='radio'; rb.name='mds'; rb.id='mds'+i; rb.value=i===1?'1':'0'; if(i===0)rb.checked=true;
      const lbl = document.createElement('label'); lbl.htmlFor='mds'+i; lbl.textContent=label;
      lbl.style.cssText='display:flex;align-items:center;gap:4px;cursor:pointer;font-size:13px;padding:6px 12px;border:1px solid var(--bord);border-radius:6px;';
      lbl.prepend(rb); dsWrap.appendChild(lbl);
    });
    dsFg.appendChild(dsWrap); m.appendChild(dsFg);
    const footer = mk('div', 'modal-footer'); footer.appendChild(cancelBtn());
    const sv = btn('Eintragen', 'btn btn-pri');
    sv.onclick = () => {
      const dat = document.getElementById('mdat').value;
      if (!dat) return;
      const stunde = document.getElementById('mstd').value;
      const titel = document.getElementById('mtit').value.trim();
      const doppel = document.querySelector('input[name="mds"]:checked').value === '1';
      if (!S.data.kalender) S.data.kalender = {};
      if (!S.data.kalender.klassenarbeiten) S.data.kalender.klassenarbeiten = [];
      S.data.kalender.klassenarbeiten.push({ id: uid(), kursId, datum: dat, stunde, doppelstunde: doppel, titel: titel || 'Klassenarbeit' });
      S.modal = null; scheduleSave(); render();
    };
    footer.appendChild(sv); m.appendChild(footer);
    return true;
  }

  return false;
}
