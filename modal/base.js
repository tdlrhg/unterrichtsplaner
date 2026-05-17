// ── Modal Router ──────────────────────────────────────────────────
function buildModal() {
  const bg = mk('div', 'modal-bg');
  bg.onclick = e => { if (e.target === bg) { S.modal = null; render(); } };
  const m = mk('div', 'modal');
  const { type, data } = S.modal;

  const handler =
    modalHandlerPlanung(type, data, m) ||
    modalHandlerKalender(type, data, m) ||
    modalHandlerKurse(type, data, m);

  if (!handler) {
    m.appendChild(tx('div', '', 'Unbekannter Modal-Typ: ' + type));
    m.appendChild(mk('div', 'modal-footer')).appendChild(cancelBtn());
  }

  bg.appendChild(m);
  return bg;
}
