// ── Render ────────────────────────────────────────────────────────
function renderPr() {
  const root = document.getElementById('root');
  root.innerHTML = '';
  root.appendChild(buildPrTopbar());
  const layout = mk('div', 'pr-layout');
  layout.appendChild(buildPrSidebar());
  layout.appendChild(buildPrContent());
  root.appendChild(layout);
}

// ── Topbar ────────────────────────────────────────────────────────
function buildPrTopbar() {
  const bar = mk('div', 'topbar');
  const titleWrap = mk('div', '');
  titleWrap.style.cssText = 'display:flex;align-items:baseline;gap:12px;';
  titleWrap.appendChild(tx('div', 'topbar-title', 'Prüfungsplaner'));
  const dbLink2 = mk('a', 'topbar-app-link'); dbLink2.href = 'datenbank.html'; dbLink2.textContent = '📚 Datenbank';
  titleWrap.appendChild(dbLink2);
  const upLink = mk('a', 'topbar-app-link');
  upLink.href = 'index.html';
  upLink.textContent = '📐 Unterrichtsplaner';
  titleWrap.appendChild(upLink);
  bar.appendChild(titleWrap);
  const right = mk('div', 'topbar-right');
  if (PR_VERSION) {
    const d = new Date(PR_VERSION);
    const label = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })
      + ' ' + d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
    const indicator = PR_VERSION_STATUS === 'current' ? ' ✓' : PR_VERSION_STATUS === 'deploying' ? ' ⏳' : '';
    const vSpan = tx('span', 'topbar-version', label + indicator);
    vSpan.title = 'Klicken zum Neu laden'; vSpan.style.cursor = 'pointer';
    vSpan.onclick = () => location.reload(true);
    right.appendChild(vSpan);
  }
  bar.appendChild(right);
  return bar;
}

// ── Sidebar ───────────────────────────────────────────────────────
function buildPrSidebar() {
  const sb = mk('div', 'pr-sidebar');

  const resizeHandle = mk('div', 'sb-resize-handle');
  sb.appendChild(resizeHandle);
  const savedW = localStorage.getItem('pr_sb_width');
  if (savedW) sb.style.width = savedW + 'px';
  resizeHandle.addEventListener('mousedown', e => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = e => { sb.style.width = Math.min(400, Math.max(160, e.clientX - sb.getBoundingClientRect().left)) + 'px'; };
    const onUp = () => { localStorage.setItem('pr_sb_width', parseInt(sb.style.width)); document.body.style.cursor = ''; document.body.style.userSelect = ''; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  const hdr = mk('div', 'pr-sb-hdr');
  hdr.appendChild(tx('div', 'pr-sb-title', 'Prüfungen'));
  hdr.appendChild(tx('div', 'pr-sb-sub', PRUEFUNGSDB.length + ' Einträge'));
  sb.appendChild(hdr);

  const newBtn = btn('+ Neue Prüfung', 'btn btn-pri btn-sm pr-new-btn');
  newBtn.onclick = () => showNewPruefungModal();
  sb.appendChild(newBtn);

  sb.appendChild(mk('div', 'pr-sb-sep'));

  if (!PRUEFUNGSDB.length) {
    const empty = tx('div', '', 'Noch keine Prüfungen angelegt.');
    empty.style.cssText = 'padding:16px;font-size:12px;color:var(--sb-tx2);text-align:center;';
    sb.appendChild(empty);
  } else {
    PRUEFUNGSDB.forEach(pr => {
      const row = mk('div', 'pr-item' + (PR.aktId === pr.id ? ' active' : ''));

      const icon = tx('span', 'pr-item-icon', pr.typ === 'klausur' ? '📋' : '📝');
      row.appendChild(icon);

      const info = mk('div', ''); info.style.flex = '1'; info.style.minWidth = '0';
      info.appendChild(tx('div', 'pr-item-label', pr.titel || '–'));
      if (pr.kursLabel || pr.datum) {
        const prDatum = pr.datum ? new Date(pr.datum).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) : null;
        info.appendChild(tx('div', 'pr-item-sub', [pr.kursLabel, prDatum].filter(Boolean).join(' · ')));
      }
      row.appendChild(info);

      const badge = tx('span', 'pr-typ-badge ' + (pr.typ === 'klausur' ? 'pr-typ-kl' : 'pr-typ-ka'), pr.typ === 'klausur' ? 'Klausur' : 'KA');
      row.appendChild(badge);

      const del = btn('✕', 'pr-item-del');
      del.onclick = e => {
        e.stopPropagation();
        if (!confirm('"' + pr.titel + '" löschen?')) return;
        PRUEFUNGSDB = PRUEFUNGSDB.filter(p => p.id !== pr.id);
        if (PR.aktId === pr.id) PR.aktId = null;
        savePruefungsDB();
        renderPr();
      };
      row.appendChild(del);

      row.onclick = () => { PR.aktId = pr.id; PR.view = 'pruefung'; renderPr(); };
      sb.appendChild(row);
    });
  }

  sb.appendChild(mk('div', 'pr-sb-sep'));
  sb.appendChild(tx('div', 'pr-sb-hdr', '')).appendChild(tx('div', 'pr-sb-title', 'Datenbanken'));

  const clLink = mk('div', 'pr-item' + (PR.view === 'checklisten_overview' ? ' active' : ''));
  clLink.appendChild(tx('span', 'pr-item-icon', '☑️'));
  const clInfo = mk('div', ''); clInfo.style.flex = '1';
  clInfo.appendChild(tx('div', 'pr-item-label', 'Checklisten'));
  clInfo.appendChild(tx('div', 'pr-item-sub', CHECKLISTDB.length + ' gespeichert'));
  clLink.appendChild(clInfo);
  clLink.onclick = () => { PR.view = 'checklisten_overview'; PR.aktId = null; renderPr(); };
  sb.appendChild(clLink);

  const aaLink = mk('div', 'pr-item' + (PR.view === 'alte_arbeiten_overview' ? ' active' : ''));
  aaLink.appendChild(tx('span', 'pr-item-icon', '📝'));
  const aaInfo = mk('div', ''); aaInfo.style.flex = '1';
  aaInfo.appendChild(tx('div', 'pr-item-label', 'Alte Arbeiten'));
  aaInfo.appendChild(tx('div', 'pr-item-sub', ALTE_ARBEITEN_DB.length + ' gespeichert'));
  aaLink.appendChild(aaInfo);
  aaLink.onclick = () => { PR.view = 'alte_arbeiten_overview'; PR.aktId = null; renderPr(); };
  sb.appendChild(aaLink);

  return sb;
}

// ── Content ───────────────────────────────────────────────────────
function buildPrContent() {
  const c = mk('div', 'pr-content');
  if (PR.view === 'checklisten_overview') {
    c.appendChild(buildChecklistenOverview());
  } else if (PR.view === 'checkliste' && PR.aktCheckId) {
    const cl = CHECKLISTDB.find(x => x.id === PR.aktCheckId);
    if (cl) c.appendChild(buildChecklistDetail(cl));
  } else if (PR.view === 'alte_arbeiten_overview') {
    c.appendChild(buildAlteArbeitenOverview());
  } else if (PR.view === 'alte_arbeit' && PR.aktAlteArbeitId) {
    const aa = ALTE_ARBEITEN_DB.find(a => a.id === PR.aktAlteArbeitId);
    if (aa) c.appendChild(buildAlteArbeitDetail(aa));
  } else if (PR.aktId) {
    const pr = PRUEFUNGSDB.find(p => p.id === PR.aktId);
    if (pr) c.appendChild(buildPrDetail(pr));
  } else {
    c.appendChild(buildPrEmpty());
  }
  return c;
}

function buildPrEmpty() {
  const wrap = mk('div', '');
  wrap.style.cssText = 'max-width:480px;margin:60px auto;text-align:center;';
  const ico = tx('div', '', '📋');
  ico.style.fontSize = '48px';
  wrap.appendChild(ico);
  const h = tx('div', '', 'Prüfungsplaner');
  h.style.cssText = 'font-family:"Playfair Display",serif;font-size:28px;font-weight:700;color:var(--pri);margin:16px 0 8px;';
  wrap.appendChild(h);
  const p = tx('p', '', 'Erstelle Klassenarbeiten und Klausuren auf Basis deiner Schulbücher, Materialien und Lernziel-Checklisten.');
  p.style.cssText = 'color:var(--tx2);line-height:1.6;margin-bottom:24px;';
  wrap.appendChild(p);
  const b = btn('+ Erste Prüfung anlegen', 'btn btn-pri');
  b.onclick = () => showNewPruefungModal();
  wrap.appendChild(b);
  return wrap;
}
