// ── Sidebar ──────────────────────────────────────────────────────
function buildSidebar() {
  const sb = mk('div', 'sidebar');

  function sbSection(label, onAdd) {
    const hdr = mk('div', '');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px 4px;';
    const lbl = tx('span', '', label);
    lbl.style.cssText = 'font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.8px;';
    hdr.appendChild(lbl);
    if (onAdd) {
      const b = btn('+ Neu', 'btn btn-xs btn-ghost');
      b.style.cssText = 'padding:2px 8px;font-size:11px;';
      b.onclick = onAdd;
      hdr.appendChild(b);
    }
    return hdr;
  }

  function sbRow(label, sub, isActive, onClick, onDelete) {
    const row = mk('div', 'sb-item' + (isActive ? ' active' : ''));
    const info = mk('div', '');
    info.style.cssText = 'flex:1;min-width:0;';
    info.appendChild(tx('div', 'sb-item-label', label));
    if (sub) info.appendChild(tx('div', 'sb-item-sub', sub));
    row.appendChild(info);
    if (onDelete) {
      const del = mk('button', 'sb-item-del');
      del.textContent = '✕';
      del.onclick = e => { e.stopPropagation(); onDelete(); };
      row.appendChild(del);
    }
    row.onclick = onClick;
    return row;
  }

  // ── Fachplanungen ─────────────────────────────────────────────
  sb.appendChild(sbSection('Fachplanungen', () => { S.modal = { type: 'newFachplanung' }; render(); }));
  (S.data.fachplanungen || []).forEach(lp => {
    sb.appendChild(sbRow(
      fachLabel(lp.fach), 'Jahrgang ' + lp.jahrgang,
      S.aktFpId === lp.id && S.view === 'fachplanung',
      () => { S.aktFpId = lp.id; S.view = 'fachplanung'; S.sel = null; render(); },
      () => { if (confirm('Fachplanung löschen? Alle Inhalte gehen verloren.')) {
        S.data.fachplanungen = S.data.fachplanungen.filter(l => l.id !== lp.id);
        if (S.aktFpId === lp.id) S.aktFpId = S.data.fachplanungen[0]?.id || null;
        scheduleSave(); render();
      }}
    ));
  });

  // ── Kurse ─────────────────────────────────────────────────────
  sb.appendChild(mk('div', 'sb-sep'));
  sb.appendChild(sbSection('Kurse', () => { S.modal = { type: 'newKurs' }; render(); }));
  (S.data.kurse || []).forEach(kurs => {
    const fp = getFachplanung(kurs.fachplanungId);
    sb.appendChild(sbRow(
      kurs.klasse + ' · ' + (fp ? fachLabel(fp.fach) : '–'),
      kurs.schuljahr,
      S.view === 'kursDetail' && S.aktKursDetailId === kurs.id,
      () => { S.view = 'kursDetail'; S.aktKursDetailId = kurs.id; S.sel = null; render(); },
      () => { if (confirm('Kurs löschen?')) {
        S.data.kurse = S.data.kurse.filter(k => k.id !== kurs.id);
        scheduleSave(); render();
      }}
    ));
  });

  // ── Einstellungen ─────────────────────────────────────────────
  sb.appendChild(mk('div', 'sb-sep'));
  sb.appendChild(sbSection('Einstellungen'));
  sb.appendChild(sbRow(
    'Kalender & Stundenplan', null,
    S.view === 'kalender',
    () => { S.view = 'kalender'; S.sel = null; render(); }
  ));
  sb.appendChild(sbRow(
    'Kurse & Fachplanungen', null,
    S.view === 'einstellungen',
    () => { S.view = 'einstellungen'; S.sel = null; render(); }
  ));

  return sb;
}
