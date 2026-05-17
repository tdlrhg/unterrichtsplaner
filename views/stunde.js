// ── Stunden-Ansicht ──────────────────────────────────────────────
function viewStunde(fpId, blockId, reiheId, einheitId, stundeId) {
  const kurs = getFachplanung(fpId);
  const block = findBlock(fpId, blockId);
  const reihe = findReihe(fpId, blockId, reiheId);
  const einheit = findEinheit(fpId, blockId, reiheId, einheitId);
  const stunde = findStunde(fpId, blockId, reiheId, einheitId, stundeId);

  if (!stunde.klpInhalt) stunde.klpInhalt = [];
  if (!stunde.klpProzess) stunde.klpProzess = [];
  if (!stunde.phasen) stunde.phasen = [];
  if (!stunde.material) stunde.material = [];

  const div = mk('div', '');

  div.appendChild(breadcrumb([
    { label: fachLabel(kurs.fach) + ' ' + kurs.jahrgang, action: () => { S.sel = null; render(); } },
    { label: block.titel, action: () => { S.sel = { type: 'block', ids: [fpId, blockId] }; render(); } },
    { label: reihe.titel, action: () => { S.sel = { type: 'reihe', ids: [fpId, blockId, reiheId] }; render(); } },
    { label: einheit.titel, action: () => { S.sel = { type: 'einheit', ids: [fpId, blockId, reiheId, einheitId] }; render(); } },
  ]));

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', stunde.titel || 'Stunde'));
  left.appendChild(tx('div', 'c-sub', 'Unterrichtsstunde · ' + einheit.titel));
  hdr.appendChild(left);
  const db = btn('🗑 Löschen', 'btn btn-danger btn-sm');
  db.onclick = () => {
    if (confirm('Stunde löschen?')) {
      einheit.stunden = einheit.stunden.filter(s => s.id !== stundeId);
      S.sel = { type: 'einheit', ids: [fpId, blockId, reiheId, einheitId] };
      scheduleSave(); render();
    }
  };
  hdr.appendChild(db);
  div.appendChild(hdr);

  // ── Grunddaten ───────────────────────────────────────────────
  const gc = mk('div', 'card');
  gc.appendChild(cardHdr('Grunddaten'));
  const gb = mk('div', 'card-body');
  gb.appendChild(fieldInput('Kurztitel', stunde.titel || '', v => { stunde.titel = v; scheduleSave(); }));
  gb.appendChild(fieldInput('Langtitel', stunde.langtitel || '', v => { stunde.langtitel = v; scheduleSave(); }));
  gb.appendChild(fieldArea('Intention', stunde.intention || '', v => { stunde.intention = v; scheduleSave(); }, '', 'Worum geht es in dieser Stunde? Worauf soll sie hinauslaufen?'));

  // Priorität
  const prioFg = mk('div', 'fg');
  prioFg.appendChild(tx('label', 'fl', 'Typ / Priorität'));
  const prioWrap = mk('div', 'prio-wrap');
  const PRIOS = [
    { val: 'pflicht', label: '🟢 Pflicht', title: 'Muss gemacht werden' },
    { val: 'optional', label: '🟡 Optional', title: 'Kann bei Zeitmangel entfallen' },
    { val: 'puffer', label: '🔵 Puffer', title: 'Wiederholung / Reserve' },
    { val: 'klassenarbeit', label: '📝 Klassenarbeit', title: 'Klassenarbeit' },
    { val: 'rueckgabe', label: '📋 Rückgabe', title: 'Rückgabe / Besprechung' },
  ];
  if (!stunde.prioritaet) stunde.prioritaet = 'pflicht';
  PRIOS.forEach(p => {
    const b = mk('button', 'prio-btn' + (stunde.prioritaet === p.val ? ' active' : ''));
    b.textContent = p.label; b.title = p.title;
    b.onclick = () => { stunde.prioritaet = p.val; scheduleSave(); render(); };
    prioWrap.appendChild(b);
  });
  prioFg.appendChild(prioWrap);
  gb.appendChild(prioFg);

  gb.appendChild(fieldArea('Lernziel', stunde.lernziel || '', v => { stunde.lernziel = v; scheduleSave(); }));
  const dfg = mk('div', 'fg');
  dfg.appendChild(tx('label', 'fl', 'Dauer (Minuten)'));
  const di = document.createElement('input');
  di.type = 'number'; di.value = stunde.dauer || 45; di.className = 'finp';
  di.style.maxWidth = '120px';
  di.oninput = e => { stunde.dauer = parseInt(e.target.value) || 45; scheduleSave(); };
  dfg.appendChild(di);
  gb.appendChild(dfg);
  gc.appendChild(gb);
  div.appendChild(gc);

  // ── KLP ──────────────────────────────────────────────────────
  const kc = mk('div', 'card');
  kc.appendChild(cardHdr('KLP-Kompetenzen'));
  const kb = mk('div', 'card-body');
  kb.appendChild(klpSelector(stunde, kurs.fach));
  kc.appendChild(kb);
  div.appendChild(kc);

  // ── Phasen ───────────────────────────────────────────────────
  const pc = mk('div', 'card');
  const phdr = cardHdr('Unterrichtsphasen');
  const apb = btn('+ Phase', 'btn btn-pri btn-xs');
  apb.onclick = () => {
    stunde.phasen.push({ id: uid(), titel: '', inhalt: '', methode: '', sozialform: '', minuten: 0, material: '' });
    scheduleSave(); render();
  };
  phdr.appendChild(apb);
  pc.appendChild(phdr);
  const pb = mk('div', 'card-body');
  pb.appendChild(phasenTable(stunde));
  pc.appendChild(pb);
  div.appendChild(pc);

  // ── Tafelbild ────────────────────────────────────────────────
  const tc = mk('div', 'card');
  tc.appendChild(cardHdr('Tafelbild'));
  const tb = mk('div', 'card-body');
  const tafel = mk('div', 'tafel');
  const ta = document.createElement('textarea');
  ta.placeholder = 'Tafelbild skizzieren…';
  ta.value = stunde.tafelbild || '';
  ta.oninput = e => { stunde.tafelbild = e.target.value; scheduleSave(); };
  tafel.appendChild(ta);
  tb.appendChild(tafel);
  tc.appendChild(tb);
  div.appendChild(tc);

  // ── Material ─────────────────────────────────────────────────
  const mc = mk('div', 'card');
  const mhdr = cardHdr('Material & Links');
  const amb = btn('+ Material', 'btn btn-pri btn-xs');
  amb.onclick = () => { S.modal = { type: 'addMat', data: { stunde } }; render(); };
  mhdr.appendChild(amb);
  mc.appendChild(mhdr);
  const mbd = mk('div', 'card-body');
  mbd.appendChild(materialList(stunde));
  mc.appendChild(mbd);
  div.appendChild(mc);

  // ── Lehrerkommentar ──────────────────────────────────────────
  const lc = mk('div', 'card');
  lc.appendChild(cardHdr('Erläuterungen für die Lehrkraft'));
  const lb = mk('div', 'card-body');
  lb.appendChild(fieldArea('', stunde.lehrerkommentar || '',
    v => { stunde.lehrerkommentar = v; scheduleSave(); }, 'min-height:120px;'));
  lc.appendChild(lb);
  div.appendChild(lc);

  return div;
}
