// ── Prüfung Detail ────────────────────────────────────────────────
function buildPrDetail(pr) {
  const div = mk('div', '');

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', pr.titel || '–'));
  if (pr.thema) left.appendChild(tx('div', '', pr.thema)).style || (left.lastChild.style.cssText = 'font-size:15px;color:var(--tx2);margin-top:2px;');
  const datumStr = pr.datum ? new Date(pr.datum).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) : null;
  const dauerStr = pr.dauerVon
    ? (pr.dauerBis && pr.dauerBis !== pr.dauerVon ? pr.dauerVon + '–' + pr.dauerBis : pr.dauerVon) + ' Min.'
    : null;
  const meta = [
    pr.typ === 'klausur' ? 'Klausur' : 'Klassenarbeit',
    pr.kursLabel,
    datumStr,
    dauerStr,
  ].filter(Boolean).join(' · ');
  left.appendChild(tx('div', 'c-sub', meta));
  hdr.appendChild(left);
  div.appendChild(hdr);

  let aktiverTab = 'lernziele';
  const tabRow = mk('div', '');
  tabRow.style.cssText = 'display:flex;gap:6px;margin-bottom:20px;border-bottom:2px solid var(--bord);padding-bottom:8px;';
  const tabContent = mk('div', '');
  div.appendChild(tabRow);
  div.appendChild(tabContent);

  const TABS = [
    { id: 'lernziele', label: '📋 Lernziele' },
    { id: 'quellen',   label: '📚 Quellen' },
    { id: 'aufgaben',  label: '✏️ Aufgaben' },
    { id: 'vorschau',  label: '👁 Vorschau' },
  ];

  function renderTab() {
    tabRow.innerHTML = '';
    TABS.forEach(t => {
      const tb = btn(t.label, 'btn btn-sm ' + (aktiverTab === t.id ? 'btn-pri' : 'btn-ghost'));
      tb.onclick = () => { aktiverTab = t.id; renderTab(); };
      tabRow.appendChild(tb);
    });
    tabContent.innerHTML = '';
    if (aktiverTab === 'lernziele') tabContent.appendChild(buildLernzieleTab(pr));
    else if (aktiverTab === 'quellen') tabContent.appendChild(buildQuellenTab(pr));
    else if (aktiverTab === 'aufgaben') tabContent.appendChild(buildAufgabenGenTab(pr));
    else {
      const ph = tx('div', '', 'Vorschau — folgt');
      ph.style.cssText = 'padding:40px;text-align:center;color:var(--tx3);';
      tabContent.appendChild(ph);
    }
  }
  renderTab();

  return div;
}
