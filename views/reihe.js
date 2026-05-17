// ── Reihen-Ansicht ───────────────────────────────────────────────
function viewReihe(kursId, blockId, reiheId) {
  const kurs = getKurs(kursId);
  const block = findBlock(kursId, blockId);
  const reihe = findReihe(kursId, blockId, reiheId);
  const div = mk('div', '');

  div.appendChild(breadcrumb([
    { label: kurs.name, action: () => { S.sel = { type: 'kurs', ids: [kursId] }; render(); } },
    { label: block.titel, action: () => { S.sel = { type: 'block', ids: [kursId, blockId] }; render(); } },
  ]));

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', reihe.titel));
  left.appendChild(tx('div', 'c-sub', 'Unterrichtsreihe'));
  hdr.appendChild(left);

  const grp = mk('div', 'btn-grp');
  const ae = btn('+ Einheit', 'btn btn-pri btn-sm');
  ae.onclick = () => { S.modal = { type: 'newEinheit', data: { kursId, blockId, reiheId } }; render(); };
  grp.appendChild(ae);
  const db = btn('🗑 Löschen', 'btn btn-danger btn-sm');
  db.onclick = () => {
    if (confirm('Reihe löschen?')) {
      block.reihen = block.reihen.filter(r => r.id !== reiheId);
      S.sel = { type: 'block', ids: [kursId, blockId] };
      scheduleSave(); render();
    }
  };
  grp.appendChild(db);
  hdr.appendChild(grp);
  div.appendChild(hdr);

  const card = mk('div', 'card');
  card.appendChild(cardHdr('Unterrichtseinheiten'));
  const cb = mk('div', 'card-body');
  const grid = mk('div', 'ov-grid');
  (reihe.einheiten || []).forEach(e => {
    const sn = (e.stunden || []).length;
    grid.appendChild(ovCard(
      e.titel,
      `${sn} Stunde${sn !== 1 ? 'n' : ''}`,
      () => { S.sel = { type: 'einheit', ids: [kursId, blockId, reiheId, e.id] }; render(); }
    ));
  });
  cb.appendChild(grid);
  card.appendChild(cb);
  div.appendChild(card);
  return div;
}
