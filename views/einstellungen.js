// ── Einstellungen ────────────────────────────────────────────────
function viewEinstellungen() {
  const div = mk('div', '');
  const hdr = mk('div', 'c-hdr');
  hdr.appendChild(tx('div', 'c-title', 'Einstellungen'));
  div.appendChild(hdr);

  // ── KI-Einstellungen ──────────────────────────────────────────
  const aiCard = mk('div', 'card');
  aiCard.appendChild(cardHdr('KI-Einstellungen'));
  const aib = mk('div', 'card-body');

  // Anthropic Key
  const antFg = mk('div', 'fg');
  antFg.appendChild(tx('label', 'fl', 'Anthropic API-Key (Claude)'));
  const antWrap = mk('div', ''); antWrap.style.cssText = 'display:flex;gap:8px;align-items:center;';
  const antInp = document.createElement('input');
  antInp.type = 'password'; antInp.className = 'finp'; antInp.placeholder = 'sk-ant-...';
  antInp.value = localStorage.getItem('ant_key') || '';
  antInp.style.flex = '1';
  const antSave = btn('Speichern', 'btn btn-pri btn-sm');
  antSave.onclick = () => {
    const val = antInp.value.trim();
    if (val) { localStorage.setItem('ant_key', val); antSave.textContent = '✓ Gespeichert'; setTimeout(() => { antSave.textContent = 'Speichern'; }, 2000); }
    else { localStorage.removeItem('ant_key'); antSave.textContent = '✓ Gelöscht'; setTimeout(() => { antSave.textContent = 'Speichern'; }, 2000); }
  };
  antWrap.appendChild(antInp); antWrap.appendChild(antSave);
  antFg.appendChild(antWrap);
  const antHint = tx('div', '', 'Für KI-Vorschläge im KLP-Selector. Wird nur lokal gespeichert – verlässt dieses Gerät nicht.');
  antHint.style.cssText = 'font-size:11px;color:var(--tx3);margin-top:4px;';
  antFg.appendChild(antHint);
  aib.appendChild(antFg);

  // OpenAI Key
  const oaiFg = mk('div', 'fg');
  oaiFg.appendChild(tx('label', 'fl', 'OpenAI API-Key'));
  const oaiWrap = mk('div', ''); oaiWrap.style.cssText = 'display:flex;gap:8px;align-items:center;';
  const oaiInp = document.createElement('input');
  oaiInp.type = 'password'; oaiInp.className = 'finp'; oaiInp.placeholder = 'sk-proj-...';
  oaiInp.value = localStorage.getItem('oai_key') || '';
  oaiInp.style.flex = '1';
  const oaiSave = btn('Speichern', 'btn btn-pri btn-sm');
  oaiSave.onclick = () => {
    const val = oaiInp.value.trim();
    if (val) { localStorage.setItem('oai_key', val); oaiSave.textContent = '✓ Gespeichert'; setTimeout(() => { oaiSave.textContent = 'Speichern'; }, 2000); }
    else { localStorage.removeItem('oai_key'); oaiSave.textContent = '✓ Gelöscht'; setTimeout(() => { oaiSave.textContent = 'Speichern'; }, 2000); }
  };
  oaiWrap.appendChild(oaiInp); oaiWrap.appendChild(oaiSave);
  oaiFg.appendChild(oaiWrap);
  const oaiHint = tx('div', '', 'Wird nur lokal in deinem Browser gespeichert – verlässt dieses Gerät nicht.');
  oaiHint.style.cssText = 'font-size:11px;color:var(--tx3);margin-top:4px;';
  oaiFg.appendChild(oaiHint);
  aib.appendChild(oaiFg);

  aiCard.appendChild(aib);
  div.appendChild(aiCard);

  // ── Fachplanungen ─────────────────────────────────────────────
  const fpCard = mk('div', 'card');
  fpCard.appendChild(cardHdr('Fachplanungen'));
  const fpb = mk('div', 'card-body');

  const fpList = mk('div', '');
  fpList.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  (S.data.fachplanungen || []).forEach((lp, i) => {
    const row = mk('div', '');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--bord);border-radius:6px;background:var(--surf2);';

    // Reihenfolge
    const orderBtns = mk('div', '');
    orderBtns.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
    const upBtn = mk('button', 'col-action-btn');
    upBtn.textContent = '↑'; upBtn.title = 'Nach oben';
    upBtn.disabled = i === 0;
    upBtn.onclick = () => {
      const tmp = S.data.fachplanungen[i-1];
      S.data.fachplanungen[i-1] = S.data.fachplanungen[i];
      S.data.fachplanungen[i] = tmp;
      scheduleSave(); render();
    };
    const downBtn = mk('button', 'col-action-btn');
    downBtn.textContent = '↓'; downBtn.title = 'Nach unten';
    downBtn.disabled = i === S.data.fachplanungen.length - 1;
    downBtn.onclick = () => {
      const tmp = S.data.fachplanungen[i+1];
      S.data.fachplanungen[i+1] = S.data.fachplanungen[i];
      S.data.fachplanungen[i] = tmp;
      scheduleSave(); render();
    };
    orderBtns.appendChild(upBtn);
    orderBtns.appendChild(downBtn);
    row.appendChild(orderBtns);

    // Info
    const info = mk('div', '');
    info.style.flex = '1';
    info.appendChild(tx('div', '', fachLabel(lp.fach) + ' · Jahrgang ' + lp.jahrgang)).style.fontWeight = '600';
    const kurseCount = (S.data.kurse || []).filter(k => k.fachplanungId === lp.id).length;
    info.appendChild(tx('div', '', kurseCount + ' Kurs' + (kurseCount !== 1 ? 'e' : '') + ' verwenden diese Planung')).style.cssText = 'font-size:12px;color:var(--tx3);margin-top:2px;';
    row.appendChild(info);

    // Löschen
    const delBtn = btn('🗑', 'btn btn-danger btn-xs');
    delBtn.title = 'Fachplanung löschen';
    delBtn.onclick = () => {
      if (confirm('Fachplanung "' + fachLabel(lp.fach) + ' ' + lp.jahrgang + '" löschen? Alle Inhalte gehen verloren.')) {
        S.data.fachplanungen = S.data.fachplanungen.filter(l => l.id !== lp.id);
        if (S.aktFpId === lp.id) S.aktFpId = S.data.fachplanungen[0]?.id || null;
        scheduleSave(); render();
      }
    };
    row.appendChild(delBtn);
    fpList.appendChild(row);
  });
  fpb.appendChild(fpList);

  const addFpBtn = btn('+ Neue Fachplanung', 'btn btn-ghost btn-sm');
  addFpBtn.style.marginTop = '10px';
  addFpBtn.onclick = () => { S.modal = { type: 'newFachplanung' }; render(); };
  fpb.appendChild(addFpBtn);
  fpCard.appendChild(fpb);
  div.appendChild(fpCard);

  // ── Kurse ─────────────────────────────────────────────────────
  const kCard = mk('div', 'card');
  kCard.appendChild(cardHdr('Kurse'));
  const kb = mk('div', 'card-body');

  const kList = mk('div', '');
  kList.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  (S.data.kurse || []).forEach((kurs, i) => {
    const fp = getFachplanung(kurs.fachplanungId);
    const row = mk('div', '');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--bord);border-radius:6px;background:var(--surf2);';

    // Reihenfolge
    const orderBtns = mk('div', '');
    orderBtns.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
    const upBtn = mk('button', 'col-action-btn');
    upBtn.textContent = '↑'; upBtn.disabled = i === 0;
    upBtn.onclick = () => {
      const tmp = S.data.kurse[i-1];
      S.data.kurse[i-1] = S.data.kurse[i];
      S.data.kurse[i] = tmp;
      scheduleSave(); render();
    };
    const downBtn = mk('button', 'col-action-btn');
    downBtn.textContent = '↓'; downBtn.disabled = i === S.data.kurse.length - 1;
    downBtn.onclick = () => {
      const tmp = S.data.kurse[i+1];
      S.data.kurse[i+1] = S.data.kurse[i];
      S.data.kurse[i] = tmp;
      scheduleSave(); render();
    };
    orderBtns.appendChild(upBtn);
    orderBtns.appendChild(downBtn);
    row.appendChild(orderBtns);

    // Info
    const info = mk('div', '');
    info.style.flex = '1';
    const name = tx('div', '', kurs.klasse + ' · ' + kurs.schuljahr);
    name.style.fontWeight = '600';
    info.appendChild(name);
    const sub = tx('div', '', fp ? fachLabel(fp.fach) + ' · Jahrgang ' + fp.jahrgang : '– keine Fachplanung –');
    sub.style.cssText = 'font-size:12px;color:var(--tx3);margin-top:2px;';
    info.appendChild(sub);
    row.appendChild(info);

    // Bearbeiten
    const editBtn = btn('✏️', 'btn btn-ghost btn-xs');
    editBtn.title = 'Kurs bearbeiten';
    editBtn.onclick = () => { S.modal = { type: 'editKurs', data: { kurs } }; render(); };
    row.appendChild(editBtn);

    // Lerngruppe
    const lgBtn = btn('👥', 'btn btn-ghost btn-xs');
    lgBtn.title = 'Lerngruppenanalyse';
    lgBtn.onclick = () => { S.modal = { type: 'lerngruppe', data: { kurs } }; render(); };
    row.appendChild(lgBtn);

    // Löschen
    const delBtn = btn('🗑', 'btn btn-danger btn-xs');
    delBtn.title = 'Kurs löschen';
    delBtn.onclick = () => {
      if (confirm('Kurs "' + kurs.klasse + '" löschen?')) {
        S.data.kurse = S.data.kurse.filter(k => k.id !== kurs.id);
        scheduleSave(); render();
      }
    };
    row.appendChild(delBtn);
    kList.appendChild(row);
  });
  kb.appendChild(kList);

  const addKBtn = btn('+ Neuen Kurs', 'btn btn-ghost btn-sm');
  addKBtn.style.marginTop = '10px';
  addKBtn.onclick = () => { S.modal = { type: 'newKurs' }; render(); };
  kb.appendChild(addKBtn);
  kCard.appendChild(kb);
  div.appendChild(kCard);

  return div;
}
