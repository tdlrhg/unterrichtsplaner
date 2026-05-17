// ── Content-Routing ───────────────────────────────────────────────
function buildContent() {
  const c = mk('div', 'content');
  if (S.view === 'kalender') { c.appendChild(viewKalender()); return c; }
  if (S.view === 'einstellungen') { c.appendChild(viewEinstellungen()); return c; }
  if (S.view === 'materialien') { c.appendChild(viewMaterialien()); return c; }
  if (S.view === 'methoden') { c.appendChild(viewMethoden()); return c; }
  if (S.view === 'didaktik') { c.appendChild(viewDidaktik()); return c; }
  if (S.view === 'kursDetail' && S.aktKursDetailId) { c.appendChild(viewKursDetail(S.aktKursDetailId)); return c; }
  if (!S.aktFpId) { c.appendChild(viewFachplanung()); return c; }
  const type = S.sel ? S.sel.type : 'fachplanung';
  if (type === 'stunde' && S.sel) {
    const ids = S.sel.ids;
    c.appendChild(viewStunde(ids[0], ids[1], ids[2], ids[3], ids[4]));
  } else {
    c.appendChild(viewFachplanung());
  }
  return c;
}
