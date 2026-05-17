// ── Einheit-Ansicht ──────────────────────────────────────────────
function viewEinheit(kursId, blockId, reiheId, einheitId) {
  const kurs = getKurs(kursId);
  const block = findBlock(kursId, blockId);
  const reihe = findReihe(kursId, blockId, reiheId);
  const einheit = findEinheit(kursId, blockId, reiheId, einheitId);
  const div = mk('div', '');

  div.appendChild(breadcrumb([
    { label: kurs.name, action: () => { S.sel = { type: 'kurs', ids: [kursId] }; render(); } },
    { label: block.titel, action: () => { S.sel = { type: 'block', ids: [kursId, blockId] }; render(); } },
    { label: reihe.titel, action: () => { S.sel = { type: 'reihe', ids: [kursId, blockId, reiheId] }; render(); } },
  ]));

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', einheit.titel));
  left.appendChild(tx('div', 'c-sub', 'Unterrichtseinheit'));
  hdr.appendChild(left);

  const grp = mk('div', 'btn-grp');
  const as = btn('+ Stunde', 'btn btn-pri btn-sm');
  as.onclick = () => { S.modal = { type: 'newStunde', data: { kursId, blockId, reiheId, einheitId } }; render(); };
  grp.appendChild(as);
  const db = btn('🗑 Löschen', 'btn btn-danger btn-sm');
  db.onclick = () => {
    if (confirm('Einheit löschen?')) {
      reihe.einheiten = reihe.einheiten.filter(e => e.id !== einheitId);
      S.sel = { type: 'reihe', ids: [kursId, blockId, reiheId] };
      scheduleSave(); render();
    }
  };
  grp.appendChild(db);
  hdr.appendChild(grp);
  div.appendChild(hdr);

  const card = mk('div', 'card');
  card.appendChild(cardHdr('Stunden'));
  const cb = mk('div', 'card-body');
  const list = mk('div', 'std-list');
  (einheit.stunden || []).forEach((s, i) => {
    const item = mk('div', 'std-item');
    item.appendChild(tx('div', 'std-nr', 'Std. ' + (i + 1)));
    item.appendChild(tx('div', 'std-title', s.titel || '(ohne Titel)'));
    if (s.lernziel) item.appendChild(tx('div', 'std-meta', s.lernziel.slice(0, 70) + (s.lernziel.length > 70 ? '…' : '')));
    item.onclick = () => { S.sel = { type: 'stunde', ids: [kursId, blockId, reiheId, einheitId, s.id] }; render(); };
    list.appendChild(item);
  });
  cb.appendChild(list);
  card.appendChild(cb);
  div.appendChild(card);
  return div;
}
