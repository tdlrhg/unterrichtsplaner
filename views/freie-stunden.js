// ── Freie Stunden ─────────────────────────────────────────────────
function viewFreieStunden(fpId) {
  const fp = getFachplanung(fpId);
  if (!fp) return tx('div', 'c-hdr', 'Fachplanung nicht gefunden.');
  if (!fp.freieStunden) fp.freieStunden = [];

  const div = mk('div', '');

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Freie Stunden'));
  left.appendChild(tx('div', 'c-sub', fachLabel(fp.fach) + ' · Jg. ' + fp.jahrgang + ' · ' + fp.freieStunden.length + ' Stunde' + (fp.freieStunden.length !== 1 ? 'n' : '')));
  hdr.appendChild(left);

  const addBtn = btn('+ Neue Stunde', 'btn btn-pri btn-sm');
  addBtn.onclick = () => {
    const s = { id: uid(), titel: '', prioritaet: 'pflicht', dauer: 45, phasen: [], klpInhalt: [], klpProzess: [], material: [] };
    fp.freieStunden.unshift(s);
    scheduleSave();
    S.view = 'freieStunden'; S.aktFpId = fpId;
    S.sel = { type: 'freieStunde', ids: [fpId, s.id] };
    render();
  };
  hdr.appendChild(addBtn);
  div.appendChild(hdr);

  const card = mk('div', 'card');
  const cb = mk('div', 'card-body');

  if (!fp.freieStunden.length) {
    const empty = tx('div', '', 'Noch keine freien Stunden. Klicke „+ Neue Stunde" um eine anzulegen.');
    empty.style.cssText = 'color:var(--tx3);padding:12px 0;';
    cb.appendChild(empty);
  } else {
    const list = mk('div', 'std-list');
    fp.freieStunden.forEach((s, i) => {
      const item = mk('div', 'std-item');
      const PRIO_ICON = { pflicht: '🟢', optional: '🟡', puffer: '🔵', klassenarbeit: '📝', rueckgabe: '📋' };
      item.appendChild(tx('div', 'std-nr', (PRIO_ICON[s.prioritaet] || '') + ' ' + (i + 1)));
      item.appendChild(tx('div', 'std-title', s.titel || '(ohne Titel)'));
      if (s.lernziel) item.appendChild(tx('div', 'std-meta', s.lernziel.slice(0, 80) + (s.lernziel.length > 80 ? '…' : '')));
      item.onclick = () => { S.sel = { type: 'freieStunde', ids: [fpId, s.id] }; render(); };
      list.appendChild(item);
    });
    cb.appendChild(list);
  }

  card.appendChild(cb);
  div.appendChild(card);
  return div;
}
