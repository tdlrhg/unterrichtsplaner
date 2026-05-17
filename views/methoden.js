// ── Methoden-Datenbank (Platzhalter) ─────────────────────────────
function viewMethoden() {
  const div = mk('div', '');

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Methodendatenbank'));
  left.appendChild(tx('div', 'c-sub', 'Noch keine Einträge'));
  hdr.appendChild(left);
  div.appendChild(hdr);

  const card = mk('div', 'card');
  const body = mk('div', 'card-body');
  const info = tx('div', '', 'Die Methodendatenbank ist noch leer. Einträge können später per JSON-Import oder KI-Analyse hinzugefügt werden.');
  info.style.color = 'var(--tx3)';
  body.appendChild(info);
  card.appendChild(body);
  div.appendChild(card);

  return div;
}
