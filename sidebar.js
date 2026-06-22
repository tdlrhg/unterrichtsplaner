// ── Sidebar ──────────────────────────────────────────────────────
function buildSidebar() {
  const sb = mk('div', 'sidebar');

  function sbSection(label, onAdd) {
    const hdr = mk('div', 'sb-section-hdr');
    const lbl = mk('span', '');
    const dot = tx('span', 'sb-section-dot', '◆');
    lbl.appendChild(dot);
    lbl.appendChild(document.createTextNode(' ' + label));
    hdr.appendChild(lbl);
    if (onAdd) {
      const b = btn('+ Neu', 'btn btn-xs btn-ghost');
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

  // ── Fachplanungen (gruppiert nach Fach) ───────────────────────
  sb.appendChild(sbSection('Fachplanungen', () => { S.modal = { type: 'newFachplanung' }; render(); }));

  const FACH_BASIS = { 'Ch_GK': 'Ch', 'Ch_LK': 'Ch', 'Bio_GK': 'Bio', 'Bio_LK': 'Bio' };
  const FACH_ZUSATZ = { 'Ch_GK': 'GK', 'Ch_LK': 'LK', 'Bio_GK': 'GK', 'Bio_LK': 'LK' };

  const byFach = {};
  (S.data.fachplanungen || []).forEach(lp => {
    const gruppe = FACH_BASIS[lp.fach] || lp.fach;
    if (!byFach[gruppe]) byFach[gruppe] = [];
    byFach[gruppe].push(lp);
  });

  Object.entries(byFach).forEach(([fach, planungen]) => {
    const openKey = 'fach_' + fach;
    const isOpen = S.open[openKey];
    const isActiveFach = planungen.some(lp => lp.id === S.aktFpId && S.view === 'fachplanung');

    const fachRow = mk('div', 'sb-fach' + (isActiveFach && !isOpen ? ' active' : ''));
    const icon = tx('span', 'sb-fach-icon', fachIcon(fach));
    const label = tx('span', 'sb-fach-label', fachLabel(fach));
    const arrow = tx('span', 'sb-fach-arrow', isOpen ? '▾' : '›');
    fachRow.appendChild(icon);
    fachRow.appendChild(label);
    fachRow.appendChild(arrow);
    fachRow.onclick = () => { S.open[openKey] = !S.open[openKey]; render(); };
    sb.appendChild(fachRow);

    if (isOpen) {
      let dragSrcId = null;
      planungen.forEach(lp => {
        const zusatz = FACH_ZUSATZ[lp.fach] ? ' · ' + FACH_ZUSATZ[lp.fach] : '';
        const row = mk('div', 'sb-item sb-item-indent' + (S.aktFpId === lp.id && S.view === 'fachplanung' ? ' active' : ''));
        row.draggable = true;

        const grip = tx('span', 'sb-drag-grip', '⠿');
        row.appendChild(grip);

        const info = mk('div', ''); info.style.flex = '1';
        info.appendChild(tx('div', 'sb-item-label', 'Jg. ' + lp.jahrgang + zusatz));
        row.appendChild(info);
        const del = mk('button', 'sb-item-del'); del.textContent = '✕';
        del.onclick = e => {
          e.stopPropagation();
          if (confirm('Fachplanung löschen? Alle Inhalte gehen verloren.')) {
            S.data.fachplanungen = S.data.fachplanungen.filter(l => l.id !== lp.id);
            if (S.aktFpId === lp.id) S.aktFpId = S.data.fachplanungen[0]?.id || null;
            scheduleSave(); render();
          }
        };
        row.appendChild(del);
        row.onclick = () => { S.aktFpId = lp.id; S.view = 'fachplanung'; S.sel = null; render(); };

        row.addEventListener('dragstart', e => { dragSrcId = lp.id; e.dataTransfer.effectAllowed = 'move'; row.classList.add('sb-drag-src'); });
        row.addEventListener('dragend', () => { dragSrcId = null; row.classList.remove('sb-drag-src'); document.querySelectorAll('.sb-drag-over').forEach(el => el.classList.remove('sb-drag-over')); });
        row.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('sb-drag-over'); });
        row.addEventListener('dragleave', () => row.classList.remove('sb-drag-over'));
        row.addEventListener('drop', e => {
          e.preventDefault(); row.classList.remove('sb-drag-over');
          if (!dragSrcId || dragSrcId === lp.id) return;
          const fps = S.data.fachplanungen;
          const srcIdx = fps.findIndex(f => f.id === dragSrcId);
          const tgtIdx = fps.findIndex(f => f.id === lp.id);
          if (srcIdx < 0 || tgtIdx < 0) return;
          const [moved] = fps.splice(srcIdx, 1);
          fps.splice(tgtIdx, 0, moved);
          scheduleSave(); render();
        });

        sb.appendChild(row);


      });
    }
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

  // ── Datenbanken ───────────────────────────────────────────────
  sb.appendChild(mk('div', 'sb-sep'));
  sb.appendChild(sbSection('Datenbanken'));
  var _dbRow = sbRow('Datenbank', null, false, () => { window.location.href = 'datenbank.html'; });
  (function() {
    var lbl = _dbRow.querySelector('.sb-item-label');
    if (!lbl) return;
    var img = document.createElement('img');
    img.src = 'datenbank/icons/datenbank.png';
    img.style.cssText = 'width:20px;height:20px;vertical-align:middle;margin-right:6px;object-fit:contain;';
    lbl.insertBefore(img, lbl.firstChild);
  })();
  sb.appendChild(_dbRow);

  // ── Einstellungen ─────────────────────────────────────────────
  sb.appendChild(mk('div', 'sb-sep'));
  sb.appendChild(sbSection('Einstellungen'));
  sb.appendChild(sbRow(
    'Kalender & Stundenplan', null,
    S.view === 'kalender',
    () => { S.view = 'kalender'; S.sel = null; render(); }
  ));
  sb.appendChild(sbRow(
    'KLP', null,
    S.view === 'klp',
    () => { S.view = 'klp'; S.sel = null; render(); }
  ));
  sb.appendChild(sbRow(
    'Technisch', null,
    S.view === 'einstellungen' || S.view === 'kursEinstellungen',
    () => { S.view = 'einstellungen'; S.aktKursDetailId = null; S.sel = null; render(); }
  ));

  // ── Resize-Anfasser ───────────────────────────────────────────
  const handle = mk('div', 'sb-resize-handle');
  sb.appendChild(handle);

  // Gespeicherte Breite wiederherstellen
  const savedWidth = localStorage.getItem('up_sb_width');
  if (savedWidth) sb.style.width = savedWidth + 'px';

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = e => {
      const rect = sb.getBoundingClientRect();
      const newWidth = Math.min(400, Math.max(160, e.clientX - rect.left));
      sb.style.width = newWidth + 'px';
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('up_sb_width', parseInt(sb.style.width));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  return sb;
}
