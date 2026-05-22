// ── Block-Ansicht ────────────────────────────────────────────────
function viewBlock(kursId, blockId) {
  const kurs = getKurs(kursId);
  const block = findBlock(kursId, blockId);
  if (!kurs || !block) { S.sel = null; render(); return mk('div', ''); }
  const div = mk('div', '');

  div.appendChild(breadcrumb([
    { label: kurs.name, action: () => { S.sel = { type: 'kurs', ids: [kursId] }; render(); } }
  ]));

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', block.titel));
  left.appendChild(tx('div', 'c-sub', 'Themenblock'));
  hdr.appendChild(left);

  const grp = mk('div', 'btn-grp');
  const ar = btn('+ Reihe', 'btn btn-pri btn-sm');
  ar.onclick = () => { S.modal = { type: 'newReihe', data: { kursId, blockId } }; render(); };
  grp.appendChild(ar);
  const db = btn('🗑 Löschen', 'btn btn-danger btn-sm');
  db.onclick = () => {
    if (confirm('Block löschen?')) {
      const p = getPlan(kursId);
      p.blocks = p.blocks.filter(b => b.id !== blockId);
      S.sel = { type: 'kurs', ids: [kursId] };
      scheduleSave(); render();
    }
  };
  grp.appendChild(db);
  hdr.appendChild(grp);
  div.appendChild(hdr);

  const card = mk('div', 'card');
  card.appendChild(cardHdr('Unterrichtsreihen'));
  const cb = mk('div', 'card-body');
  if (!(block.reihen || []).length) {
    cb.appendChild(gray('Noch keine Reihen.'));
  } else {
    const grid = mk('div', 'ov-grid');
    (block.reihen || []).forEach(r => {
      const en = (r.einheiten || []).length;
      grid.appendChild(ovCard(
        r.titel,
        `${en} Einheit${en !== 1 ? 'en' : ''}`,
        () => { S.sel = { type: 'reihe', ids: [kursId, blockId, r.id] }; render(); }
      ));
    });
    cb.appendChild(grid);
  }
  card.appendChild(cb);
  div.appendChild(card);
  return div;
}
