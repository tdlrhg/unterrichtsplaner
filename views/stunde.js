// ── Hilfsfunktionen ──────────────────────────────────────────────
function safeParseArray(jsonStr) {
  try { return JSON.parse(jsonStr); } catch(_) {}
  // Fallback: Objekte per Regex aus malformed JSON extrahieren
  const items = [];
  const re = /\{[^{}]*\}/g;
  let m;
  while ((m = re.exec(jsonStr)) !== null) {
    try { items.push(JSON.parse(m[0])); } catch(_) {}
  }
  return items;
}

// ── Stunden-Ansicht ──────────────────────────────────────────────
function initStunde(stunde) {
  if (!stunde.klpInhalt) stunde.klpInhalt = [];
  if (!stunde.klpProzess) stunde.klpProzess = [];
  if (!stunde.phasen) stunde.phasen = [];
  if (!stunde.materialIds) stunde.materialIds = [];
  if (!stunde.lernziele) stunde.lernziele = [];
  if (!stunde.planungsrahmen) stunde.planungsrahmen = {};
}

function renderStundenBody(div, stunde, fp) {
  if (!stunde._uiOpen) stunde._uiOpen = {};
  const secs = mk('div', 'plan-sections');
  div.appendChild(secs);

  // ── Accordion-Helper ───────────────────────────────────────────
  function mkSec(num, title, key, statusText, fertig) {
    const isOpen = stunde._uiOpen[key] !== false;
    const sec = mk('div', 'plan-sec');
    const hdr = mk('div', 'plan-sec-hdr');
    hdr.appendChild(tx('div', 'plan-sec-num', String(num)));
    hdr.appendChild(tx('div', 'plan-sec-ttl', title));
    hdr.appendChild(tx('div', 'plan-sec-st' + (fertig ? ' fertig' : ''), statusText));
    const acts = mk('div', 'plan-sec-actions');
    hdr.appendChild(acts);
    const arrEl = tx('div', 'plan-sec-arr', isOpen ? '▲' : '▼');
    hdr.appendChild(arrEl);
    const body = mk('div', 'plan-sec-body');
    if (!isOpen) body.style.display = 'none';
    hdr.onclick = e => {
      if (e.target.closest('button,input,select,textarea,a,label')) return;
      const nowOpen = body.style.display === 'none';
      body.style.display = nowOpen ? '' : 'none';
      arrEl.textContent = nowOpen ? '▲' : '▼';
      stunde._uiOpen[key] = nowOpen;
    };
    sec.appendChild(hdr);
    sec.appendChild(body);
    secs.appendChild(sec);
    return { body, acts };
  }

  // ── Status-Labels ──────────────────────────────────────────────
  const gdFertig = !!stunde.intention;
  const matAnz = (stunde.materialIds || []).length;
  const matFertig = matAnz > 0;
  if (!('methode' in stunde)) stunde.methode = null;
  if (!('methodeKiVorschlag' in stunde)) stunde.methodeKiVorschlag = null;
  if (!('methodeKiBewertung' in stunde)) stunde.methodeKiBewertung = null;
  const methFertig = !!stunde.methode;
  const pr = stunde.planungsrahmen;
  if (!pr.sozialformen) pr.sozialformen = [];
  if (!pr.kiGewählt) pr.kiGewählt = [];
  const prFertig = !!(pr.sozialformen?.length || pr.schwerpunkt);
  const phFertig = (stunde.phasen || []).length > 0;

  // ══════════════════════════════════════════════════════════════════
  // SEKTION 1: Grunddaten & Lernziele
  // ══════════════════════════════════════════════════════════════════
  const lzKiBtn  = btn('✨ KI → Lernziele', 'btn btn-ki btn-xs');
  const lzAddBtn = btn('+ Manuell', 'btn btn-pri btn-xs');

  const { body: s1body, acts: s1acts } = mkSec(1, 'Grunddaten & Lernziele', 'grunddaten',
    gdFertig ? '✓ fertig' : 'offen', gdFertig);
  s1acts.appendChild(lzKiBtn);
  s1acts.appendChild(lzAddBtn);

  const s1grid = mk('div', 's1-grid');

  // Linke Spalte: Grunddaten
  const s1left = mk('div', '');
  s1left.appendChild(fieldInput('Kurztitel', stunde.titel || '', v => { stunde.titel = v; scheduleSave(); }));
  s1left.appendChild(fieldInput('Langtitel', stunde.langtitel || '', v => { stunde.langtitel = v; scheduleSave(); }));
  s1left.appendChild(fieldArea('Intention', stunde.intention || '', v => { stunde.intention = v; scheduleSave(); }, '', 'Worum geht es in dieser Stunde? Worauf soll sie hinauslaufen?'));

  const prioFg = mk('div', 'fg');
  prioFg.appendChild(tx('label', 'fl', 'Typ / Priorität'));
  const prioWrap = mk('div', 'prio-wrap');
  const PRIOS = [
    { val: 'pflicht',      label: '🟢 Pflicht',      title: 'Muss gemacht werden' },
    { val: 'optional',     label: '🟡 Optional',     title: 'Kann bei Zeitmangel entfallen' },
    { val: 'puffer',       label: '🔵 Puffer',       title: 'Wiederholung / Reserve' },
    { val: 'klassenarbeit',label: '📝 Klassenarbeit',title: 'Klassenarbeit' },
    { val: 'rueckgabe',    label: '📋 Rückgabe',     title: 'Rückgabe / Besprechung' },
  ];
  if (!stunde.prioritaet) stunde.prioritaet = 'pflicht';
  PRIOS.forEach(p => {
    const b = mk('button', 'prio-btn' + (stunde.prioritaet === p.val ? ' active' : ''));
    b.textContent = p.label; b.title = p.title;
    b.onclick = () => { stunde.prioritaet = p.val; scheduleSave(); render(); };
    prioWrap.appendChild(b);
  });
  prioFg.appendChild(prioWrap);
  s1left.appendChild(prioFg);
  s1left.appendChild(fieldArea('Stundenbeschreibung', stunde.lernziel || '', v => { stunde.lernziel = v; scheduleSave(); }, '', 'Inhaltliche Zusammenfassung – was passiert in dieser Stunde?'));

  // Rechte Spalte: Lernziele
  const s1right = mk('div', '');
  const lzBody = mk('div', '');

  function renderLzBody() {
    lzBody.innerHTML = '';
    if (stunde.lernziele.length === 0) {
      lzBody.appendChild(tx('div', 'empty-hint', 'Noch keine Lernziele – KI ableiten oder manuell hinzufügen.'));
    } else {
      stunde.lernziele.forEach((lz, i) => {
        const row = mk('div', 'lz-row');
        row.appendChild(tx('div', 'lz-nr', (i + 1) + '.'));
        const fields = mk('div', 'lz-fields');
        const ta1 = document.createElement('textarea');
        ta1.className = 'lz-text finp';
        ta1.placeholder = 'Die SuS können/wissen … und zeigen dies, indem sie …';
        ta1.value = lz.text;
        ta1.rows = 1;
        const autoResize = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
        ta1.oninput = e => { lz.text = e.target.value; scheduleSave(); autoResize(e.target); };
        requestAnimationFrame(() => autoResize(ta1));
        fields.appendChild(ta1);
        row.appendChild(fields);
        const delBtn = btn('🗑', 'btn btn-danger btn-xs lz-del');
        delBtn.onclick = () => {
          stunde.lernziele = stunde.lernziele.filter(z => z.id !== lz.id);
          scheduleSave(); renderLzBody();
        };
        row.appendChild(delBtn);
        lzBody.appendChild(row);
      });
    }
  }
  renderLzBody();
  s1right.appendChild(lzBody);

  lzKiBtn.onclick = async () => {
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) { alert('Bitte zuerst Anthropic API-Key in den Einstellungen hinterlegen.'); return; }
    if (!stunde.intention) { alert('Bitte zuerst die Intention ausfüllen.'); return; }
    lzKiBtn.textContent = '…'; lzKiBtn.disabled = true;
    try {
      const prompt = `Du bist erfahrene Lehrerin an einem NRW-Gymnasium (${fp.fach || 'Naturwissenschaft'}, ${fp.jahrgang || ''}).

Aus der folgenden Intention einer Unterrichtsstunde leitest du 2–3 operationalisierte Lernziele ab.

Format: Jedes Lernziel ist EIN Satz nach diesem Muster:
"Die SuS können/wissen … und zeigen dies, indem sie …"

Wichtig: kompakt, ein einziger Satz, kein Punkt nach "können/wissen"-Teil.

Intention der Stunde:
${stunde.intention}

${stunde.lernziel ? 'Stundenbeschreibung (Kontext):\n' + stunde.lernziel : ''}

Antworte NUR als JSON-Array von Strings:
["Die SuS können … und zeigen dies, indem sie …"]`;

      const text = await callKI(prompt, { maxTokens: 800 });
      const parsed = safeParseArray(text.match(/\[[\s\S]*\]/)?.[0] || '[]');
      if (!parsed.length) throw new Error('Keine Lernziele erhalten');
      const neu = parsed.map(z => ({ id: uid(), text: typeof z === 'string' ? z : (z.text || '') }));
      if (stunde.lernziele.length > 0 && !confirm('Vorhandene Lernziele ersetzen?')) {
        lzKiBtn.textContent = '✨ KI → Lernziele'; lzKiBtn.disabled = false; return;
      }
      stunde.lernziele = neu;
      scheduleSave(); renderLzBody();
    } catch(e) {
      alert('Fehler: ' + e.message);
    }
    lzKiBtn.textContent = '✨ KI → Lernziele'; lzKiBtn.disabled = false;
  };

  lzAddBtn.onclick = () => {
    stunde.lernziele.push({ id: uid(), text: '', indikator: '' });
    scheduleSave(); renderLzBody();
  };

  s1grid.appendChild(s1left);
  s1grid.appendChild(s1right);
  s1body.appendChild(s1grid);

  // ══════════════════════════════════════════════════════════════════
  // SEKTION 2: Material
  // ══════════════════════════════════════════════════════════════════
  const matStatusText = matFertig
    ? `✓ ${matAnz} Material${matAnz > 1 ? 'ien' : ''}`
    : 'offen';
  const kiVorschlBtn = btn('✨ Vorschlagen', 'btn btn-ki btn-xs');
  const matSucheBtn  = btn('🔍 Suchen', 'btn btn-ghost btn-xs');

  const { body: s2body, acts: s2acts } = mkSec(2, 'Material', 'material', matStatusText, matFertig);
  s2acts.appendChild(kiVorschlBtn);
  s2acts.appendChild(matSucheBtn);

  // Zugewiesene Materialien
  const zugewiesenWrap = mk('div', ''); zugewiesenWrap.style.marginBottom = '8px';
  function renderZugewiesene() {
    zugewiesenWrap.innerHTML = '';
    if (!stunde.materialIds.length) {
      const hint = tx('div', '', 'Noch kein Material zugewiesen.');
      hint.style.cssText = 'font-size:12px;color:var(--tx3);padding:2px 0;';
      zugewiesenWrap.appendChild(hint);
      return;
    }
    stunde.materialIds.forEach(mid => {
      const mat = matByIdLookup(mid);
      if (!mat) return;
      const row = mk('div', '');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--bord);';
      row.appendChild(tx('span', '', '📄'));
      const info = mk('div', ''); info.style.flex = '1';
      info.appendChild(tx('span', '', mat.titel));
      const meta = tx('div', '', [(mat.fach||[]).join('/'), mat.jahrgang?.length ? 'Jg. '+(mat.jahrgang||[]).join('/') : '', mat.materialtyp].filter(Boolean).join(' · '));
      meta.style.cssText = 'font-size:11px;color:var(--tx3);';
      info.appendChild(meta);
      row.appendChild(info);
      const del = btn('✕', 'btn btn-ghost btn-xs'); del.style.color = '#dc2626';
      del.onclick = () => { stunde.materialIds = stunde.materialIds.filter(id => id !== mid); scheduleSave(); renderZugewiesene(); };
      row.appendChild(del);
      zugewiesenWrap.appendChild(row);
    });
  }
  renderZugewiesene();
  s2body.appendChild(zugewiesenWrap);

  // Suchbereich (toggle)
  const sucheWrap = mk('div', ''); sucheWrap.style.display = 'none';

  // KI-Vorschläge (erscheint über der manuellen Suche)
  const kiVorschlaegeListe = mk('div', '');
  kiVorschlaegeListe.style.cssText = 'max-height:320px;overflow-y:auto;border:1px solid var(--bord);border-radius:6px;margin-bottom:10px;display:none;';
  sucheWrap.appendChild(kiVorschlaegeListe);

  const filterRow = mk('div', ''); filterRow.style.marginBottom = '10px';
  const suchInp = document.createElement('input'); suchInp.type = 'text'; suchInp.className = 'finp';
  suchInp.placeholder = 'Titel, Thema, Beschreibung…'; suchInp.style.width = '100%';
  filterRow.appendChild(suchInp);
  sucheWrap.appendChild(filterRow);

  const ergebnisListe = mk('div', '');
  ergebnisListe.style.cssText = 'max-height:300px;overflow-y:auto;border:1px solid var(--bord);border-radius:6px;';
  const selected = new Set();
  const kiBewertungen = new Map();

  function buildMatRow(mat) {
    const bew = kiBewertungen.get(mat.id);
    const BG     = { gut: '#f0fdf4', anpassung: '#fffbeb', ungeeignet: '#fef2f2' };
    const BG_FAV = '#dcfce7';
    const STAMP_COL  = { gut: '#15803d', anpassung: '#b45309', ungeeignet: '#dc2626' };
    const BORDER_COL = { gut: '#16a34a', anpassung: '#d97706', ungeeignet: '#dc2626' };

    const row = mk('div', '');
    row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-bottom:1px solid var(--bord);cursor:pointer;position:relative;transition:background .15s;';
    if (bew) {
      row.style.background = bew.favorit ? BG_FAV : (BG[bew.bewertung] || '');
      row.style.borderLeft = `4px solid ${BORDER_COL[bew.bewertung] || 'transparent'}`;
    }

    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = selected.has(mat.id);
    cb.dataset.matId = mat.id; cb.style.marginTop = '3px';
    cb.onclick = e => e.stopPropagation();
    cb.onchange = () => {
      if (cb.checked) selected.add(mat.id); else selected.delete(mat.id);
      kiBtn.disabled = selected.size === 0;
      kiBtn.textContent = `✨ KI bewertet (${selected.size})`;
    };

    const info = mk('div', ''); info.style.flex = '1';
    const titleLine = mk('div', ''); titleLine.style.cssText = 'display:flex;align-items:center;gap:5px;';
    const titleEl = tx('span', '', mat.titel);
    titleEl.style.cssText = 'font-size:13px;font-weight:500;cursor:pointer;text-decoration:underline;text-underline-offset:2px;';
    titleEl.onclick = e => { e.stopPropagation(); openMatOverlayStandalone(mat); };
    titleLine.appendChild(titleEl);
    if (bew?.favorit) {
      const star = tx('span', '', '★');
      star.style.cssText = 'color:#15803d;font-size:14px;line-height:1;'; star.title = 'KI-Favorit';
      titleLine.appendChild(star);
    }
    info.appendChild(titleLine);

    if (mat.themen?.length) {
      const t = tx('div', '', mat.themen.slice(0,4).join(', '));
      t.style.cssText = 'font-size:11px;color:var(--tx2);';
      info.appendChild(t);
    }
    const badgeRow = mk('div', ''); badgeRow.style.cssText = 'display:flex;gap:5px;margin-top:3px;align-items:center;flex-wrap:wrap;';
    const fachIcons = (mat.fach||[]).map(fachIcon).join('');
    if (fachIcons) { const fi = tx('span', '', fachIcons); fi.style.fontSize = '13px'; badgeRow.appendChild(fi); }
    if (mat.jahrgang?.length) {
      const jgBadge = tx('span', '', mat.jahrgang.join('/'));
      jgBadge.style.cssText = 'font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;background:#f3f4f6;color:#374151;';
      badgeRow.appendChild(jgBadge);
    }
    if (mat.quelle) {
      const qBadge = tx('span', '', mat.quelle);
      qBadge.style.cssText = 'font-size:10px;color:var(--tx3);';
      badgeRow.appendChild(qBadge);
    }
    info.appendChild(badgeRow);

    const useBtn = btn('+ Zuweisen', 'btn btn-pri btn-xs'); useBtn.style.cssText = 'margin-top:2px;flex-shrink:0;';
    useBtn.onclick = e => {
      e.stopPropagation();
      if (!stunde.materialIds.includes(mat.id)) { stunde.materialIds.push(mat.id); scheduleSave(); renderZugewiesene(); }
      useBtn.textContent = '✓'; useBtn.disabled = true;
    };
    if (stunde.materialIds.includes(mat.id)) { useBtn.textContent = '✓'; useBtn.disabled = true; }
    row.onclick = () => { cb.checked = !cb.checked; cb.onchange(); };
    row.appendChild(cb); row.appendChild(info); row.appendChild(useBtn);

    // Stempel schräg
    if (bew?.hinweis) {
      const stamp = tx('div', '', bew.hinweis);
      const sc = STAMP_COL[bew.bewertung] || '#555';
      stamp.style.cssText = `position:absolute;right:68px;bottom:4px;max-width:210px;transform:rotate(-5deg);border:1.5px solid ${sc};border-radius:3px;padding:2px 7px;font-size:9.5px;font-weight:600;color:${sc};opacity:.65;pointer-events:none;background:white;line-height:1.4;letter-spacing:.2px;white-space:normal;word-break:break-word;`;
      row.appendChild(stamp);
    }
    return row;
  }

  function renderErgebnisse() {
    ergebnisListe.innerHTML = '';
    alleCb.checked = false;
    const q = suchInp.value.toLowerCase().trim();
    const EXCL = ['Lehrerhandreichung', 'Lösung'];
    const hits = MATDB.filter(mat => {
      if (EXCL.includes(mat.materialtyp)) return false;
      if (q.length >= 2) {
        const txt = [mat.titel||'', ...(mat.themen||[]), mat.beschreibung||'', mat.rolleImKontext||''].join(' ').toLowerCase();
        if (!txt.includes(q)) return false;
      }
      return true;
    });
    if (!hits.length || q.length < 2) {
      const hint = tx('div', '', hits.length === 0 ? 'Keine Treffer.' : 'Suchbegriff eingeben (mind. 2 Zeichen)…');
      hint.style.cssText = 'padding:12px;color:var(--tx3);font-size:12px;';
      ergebnisListe.appendChild(hint); return;
    }
    hits.slice(0, 30).forEach(mat => ergebnisListe.appendChild(buildMatRow(mat)));
    if (hits.length > 30) {
      const m = tx('div', '', `+ ${hits.length-30} weitere – Suche verfeinern`);
      m.style.cssText = 'padding:8px 10px;font-size:11px;color:var(--tx3);';
      ergebnisListe.appendChild(m);
    }
    const hitIds    = new Set(hits.map(m => m.id));
    const hitQuellen= new Set(hits.map(m => m.quelle).filter(Boolean));
    const hitBlocks = new Set(hits.map(m => m.blockId).filter(Boolean));
    const siblings  = MATDB.filter(mat => {
      if (hitIds.has(mat.id)) return false;
      if (EXCL.includes(mat.materialtyp)) return false;
      if (mat.quelle && hitQuellen.has(mat.quelle)) return true;
      if (mat.blockId && hitBlocks.has(mat.blockId)) return true;
      return false;
    });
    if (siblings.length) {
      const sep = mk('div', '');
      sep.style.cssText = 'padding:6px 10px;font-size:11px;font-weight:600;color:var(--tx2);background:var(--bg2);border-top:1px solid var(--bord);border-bottom:1px solid var(--bord);';
      sep.textContent = '↳ Weitere aus derselben Quelle / demselben Block';
      ergebnisListe.appendChild(sep);
      siblings.forEach(mat => ergebnisListe.appendChild(buildMatRow(mat)));
    }
  }
  sucheWrap.appendChild(ergebnisListe);

  // Alle auswählen + KI-Bewertet-Zeile
  const kiBtnRow = mk('div', '');
  kiBtnRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;';

  const alleLabel = mk('label', '');
  alleLabel.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:12px;color:var(--tx2);cursor:pointer;user-select:none;';
  const alleCb = document.createElement('input'); alleCb.type = 'checkbox';
  alleCb.onchange = () => {
    if (!alleCb.checked) selected.clear();
    [ergebnisListe, kiVorschlaegeListe].forEach(list => {
      list.querySelectorAll('input[type=checkbox][data-mat-id]').forEach(cb => {
        cb.checked = alleCb.checked;
        if (alleCb.checked && cb.dataset.matId) selected.add(cb.dataset.matId);
      });
    });
    kiBtn.disabled = selected.size === 0;
    kiBtn.textContent = `✨ KI bewertet (${selected.size})`;
  };
  alleLabel.appendChild(alleCb);
  alleLabel.appendChild(document.createTextNode('Alle'));
  kiBtnRow.appendChild(alleLabel);

  const kiBtn = btn('✨ KI bewertet (0)', 'btn btn-ki btn-sm'); kiBtn.disabled = true;
  kiBtn.onclick = async () => {
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) { alert('Bitte API-Key in den Einstellungen hinterlegen.'); return; }
    if (!selected.size) return;
    kiBtn.disabled = true; kiBtn.textContent = '⏳ KI bewertet…';
    const lernzieleText = (stunde.lernziele||[]).map(z=>z.text).join('\n') || '–';
    const selMats = [...selected].map(id => matByIdLookup(id)).filter(Boolean);
    const matListe = selMats.map((m,i) =>
      `[${i+1}] id:"${m.id}" | Titel:"${m.titel}" | Themen:${(m.themen||[]).join(',')||'–'} | Typ:${m.materialtyp||'–'} | Jg:${(m.jahrgang||[]).join('/')||'–'} | Phase:${(m.unterrichtsphase||[]).join('/')||'–'}${m.beschreibung?' | Beschreibung:'+m.beschreibung.slice(0,120):''}`
    ).join('\n');
    const prompt = `Du hilfst einer NRW-Gymnasiallehrerin beim Planen einer Unterrichtsstunde.

Stunde: Fach ${fp.fach||'–'}, Jahrgang ${fp.jahrgang||'–'}, ${stunde.dauer||45} Min
Intention: ${stunde.intention||'–'}
Lernziele: ${lernzieleText}

Bewerte folgende Materialien aus der Datenbank für diese Stunde.
WICHTIG: Geh davon aus, dass du aus fast jedem Material etwas machen kannst – vereinfachen, kürzen, nur Teile oder eine Abbildung verwenden, auf das Thema übertragen. "ungeeignet" nur wenn wirklich keinerlei Verbindung herstellbar ist.

${matListe}

Antworte mit einer Zeile pro Material, kein JSON, kein Markdown:
ID|bewertung|hinweis|favorit
Wobei bewertung = gut, anpassung oder ungeeignet; favorit = ja oder nein (genau einmal "ja" für das beste "gut"-Material); hinweis = ein kurzer Satz ohne Sonderzeichen.
Beispiel:
mat_abc_1|gut|Passt direkt zum Thema Fotosynthese|ja
mat_abc_2|anpassung|Nur Teilaufgabe 1 verwenden|nein`;
    try {
      const text = await callKI(prompt, { maxTokens: 1000 });
      const results = text.split('\n').map(l => l.trim()).filter(l => l.includes('|')).map(l => {
        const parts = l.split('|');
        return { id: parts[0]?.trim(), bewertung: parts[1]?.trim(), hinweis: parts[2]?.trim(), favorit: parts[3]?.trim() === 'ja' };
      }).filter(r => r.id && r.bewertung);
      results.forEach(r => { if (r.id) kiBewertungen.set(r.id, { bewertung: r.bewertung, hinweis: r.hinweis, favorit: r.favorit }); });
      // Vorschläge-Liste neu aufbauen damit Farben/Stempel erscheinen
      if (kiVorschlaegeListe.style.display !== 'none' && kiVorschlaegeListe.dataset.vorschlagIds) {
        const hdrEl = kiVorschlaegeListe.firstChild;
        kiVorschlaegeListe.innerHTML = '';
        if (hdrEl) kiVorschlaegeListe.appendChild(hdrEl);
        kiVorschlaegeListe.dataset.vorschlagIds.split(',').filter(Boolean).forEach(id => {
          const mat = matByIdLookup(id);
          if (mat) kiVorschlaegeListe.appendChild(buildMatRow(mat));
        });
      }
      renderErgebnisse();
    } catch(e) { alert('Fehler: ' + e.message); }
    kiBtn.disabled = false; kiBtn.textContent = `✨ KI bewertet (${selected.size})`;
  };
  kiBtnRow.appendChild(kiBtn);
  sucheWrap.appendChild(kiBtnRow);
  suchInp.oninput = renderErgebnisse;

  matSucheBtn.onclick = () => {
    const open = sucheWrap.style.display !== 'none';
    sucheWrap.style.display = open ? 'none' : 'block';
    matSucheBtn.textContent = open ? '🔍 Suchen' : '▲ Schließen';
    if (!open) { suchInp.focus(); renderErgebnisse(); }
  };

  kiVorschlBtn.onclick = async () => {
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) { alert('Bitte API-Key in den Einstellungen hinterlegen.'); return; }
    sucheWrap.style.display = 'block';
    matSucheBtn.textContent = '▲ Schließen';
    kiVorschlaegeListe.style.display = 'block';
    kiVorschlaegeListe.innerHTML = '';
    kiVorschlBtn.disabled = true; kiVorschlBtn.textContent = '⏳';

    const EXCL = ['Lehrerhandreichung', 'Lösung'];
    const safe = s => (s||'').replace(/[|\n\r\t]/g, ' ').trim();

    // Kontext aus aktueller Selektion (ids: [fpId, blockId, reiheId, stundeId])
    const selIds = S.sel?.ids || [];
    const selReiheId   = selIds[2] || null;
    const selStundeId  = selIds[3] || null;
    // Gruppe der aktuellen Stunde als Proxy für "Einheit"-Filter
    const selStunde    = selStundeId && selReiheId ? findStunde(selIds[0], selIds[1], selReiheId, selStundeId) : null;
    const selEinheitId = selStunde?.einheitId || null;

    // Vorgemerkte Materialien (Gruppe > Reihe)
    const vorgemEinheit = selEinheitId ? MATDB.filter(m => m.einheitId === selEinheitId) : [];
    const vorgemReihe   = selReiheId   ? MATDB.filter(m => !m.einheitId && m.reiheId === selReiheId) : [];
    const vorgemIds     = new Set([...vorgemEinheit, ...vorgemReihe].map(m => m.id));

    // Rest-Pool für KI (alle außer vorgemerkten)
    const pool = MATDB.filter(m => !EXCL.includes(m.materialtyp) && !vorgemIds.has(m.id));

    // ── Card-Helfer ──────────────────────────────────────────────
    function renderMatCard(mat, grund, badge) {
      const card = mk('div', '');
      card.style.cssText = 'border:1px solid var(--bord);border-radius:6px;padding:8px 10px;margin-bottom:6px;background:var(--surf);';
      const inner = mk('div', ''); inner.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start;';
      const left = mk('div', '');
      const titleRow = mk('div', ''); titleRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = selected.has(mat.id);
      cb.onclick = e => e.stopPropagation();
      cb.onchange = () => { if (cb.checked) selected.add(mat.id); else selected.delete(mat.id); kiBtn.disabled = selected.size === 0; kiBtn.textContent = `✨ KI bewertet (${selected.size})`; };
      titleRow.appendChild(cb);
      if (badge) { const b = tx('span', '', badge); b.style.cssText = 'font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;background:#dcfce7;color:#15803d;white-space:nowrap;'; titleRow.appendChild(b); }
      const titleEl = tx('span', '', mat.titel); titleEl.style.cssText = 'font-size:13px;font-weight:500;cursor:pointer;text-decoration:underline;text-underline-offset:2px;';
      titleEl.onclick = () => openMatOverlayStandalone(mat);
      titleRow.appendChild(titleEl);
      left.appendChild(titleRow);
      if (mat.themen?.length) { const t = tx('div', '', mat.themen.slice(0,4).join(', ')); t.style.cssText = 'font-size:11px;color:var(--tx2);margin-bottom:3px;'; left.appendChild(t); }
      const badgeRow = mk('div', ''); badgeRow.style.cssText = 'display:flex;gap:5px;align-items:center;flex-wrap:wrap;';
      const fi = (mat.fach||[]).map(fachIcon).join(''); if (fi) { const s = tx('span','',fi); s.style.fontSize='13px'; badgeRow.appendChild(s); }
      if (mat.jahrgang?.length) { const jg = tx('span','',mat.jahrgang.join('/')); jg.style.cssText='font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;background:#f3f4f6;color:#374151;'; badgeRow.appendChild(jg); }
      if (mat.quelle) { const q = tx('span','',mat.quelle); q.style.cssText='font-size:10px;color:var(--tx3);'; badgeRow.appendChild(q); }
      left.appendChild(badgeRow);
      const right = mk('div', '');
      if (grund) { const g = tx('div', '', grund); g.style.cssText = 'font-size:12px;color:var(--tx2);font-style:italic;line-height:1.4;'; right.appendChild(g); }
      inner.appendChild(left); inner.appendChild(right); card.appendChild(inner);
      const foot = mk('div', ''); foot.style.cssText = 'display:flex;justify-content:flex-end;margin-top:6px;';
      const useBtn = btn('+ Zuweisen', 'btn btn-pri btn-xs');
      useBtn.onclick = () => { if (!stunde.materialIds.includes(mat.id)) { stunde.materialIds.push(mat.id); scheduleSave(); renderZugewiesene(); } useBtn.textContent = '✓'; useBtn.disabled = true; };
      if (stunde.materialIds.includes(mat.id)) { useBtn.textContent = '✓'; useBtn.disabled = true; }
      foot.appendChild(useBtn); card.appendChild(foot);
      return card;
    }

    function sectionHdr(label, withClose) {
      const h = mk('div', ''); h.style.cssText = 'padding:6px 10px;font-size:11px;font-weight:600;color:var(--tx2);background:var(--bg2);border-bottom:1px solid var(--bord);display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
      h.appendChild(tx('span', '', label));
      if (withClose) { const x = btn('✕', 'btn btn-ghost btn-xs'); x.onclick = () => { kiVorschlaegeListe.style.display = 'none'; kiVorschlaegeListe.innerHTML = ''; }; h.appendChild(x); }
      return h;
    }

    // ── 1. Vorgemerkte sofort anzeigen ───────────────────────────
    const hatVorgem = vorgemEinheit.length + vorgemReihe.length > 0;
    if (hatVorgem) {
      kiVorschlaegeListe.appendChild(sectionHdr(`📌 Vorgemerkt (${vorgemEinheit.length + vorgemReihe.length})`, false));
      vorgemEinheit.forEach(m => kiVorschlaegeListe.appendChild(renderMatCard(m, null, '📌 Einheit')));
      vorgemReihe.forEach(m => kiVorschlaegeListe.appendChild(renderMatCard(m, null, '📌 Reihe')));
    }

    // ── 2. KI durchsucht den Rest ────────────────────────────────
    const kiSpin = tx('div', '', '⏳ KI durchsucht den Rest…');
    kiSpin.style.cssText = 'padding:12px;color:var(--tx3);font-size:12px;';
    kiVorschlaegeListe.appendChild(kiSpin);

    const lernziele = (stunde.lernziele||[]).map(z=>z.text).join(', ') || '–';
    const matSummary = pool.map(m => `id:${m.id}|${safe(m.titel)}|${(m.themen||[]).map(safe).join(',')}|${(m.fach||[]).join(',')}|Jg:${(m.jahrgang||[]).join(',')}|${safe(m.materialtyp)}`).join('\n');

    const prompt = `Du hilfst einer NRW-Gymnasiallehrerin beim Planen einer Unterrichtsstunde.

Stunde: Fach ${fp.fach||'–'}, Jahrgang ${fp.jahrgang||'–'}, ${stunde.dauer||45} Min
Thema/Intention: ${stunde.intention||'–'}
Lernziele: ${lernziele}

Wähle 5–8 passende Materialien aus der folgenden Datenbank. Bevorzuge Erarbeitungsmaterial. Gib für jedes eine kurze Begründung (1 Satz). Auch wenn ein Material Anpassung braucht ist es wertvoll. "ungeeignet" nur wenn wirklich kein Bezug.

Antworte NUR als JSON:
{"vorschlaege": [{"id": "mat_xxx", "grund": "ein Satz"}]}

Materialdatenbank (id|Titel|Themen|Fach|Jahrgang|Typ):
${matSummary}`;

    try {
      const raw = (await callKI(prompt, { model: KI_MODEL_HAIKU, maxTokens: 600 })).match(/\{[\s\S]*\}/)?.[0];
      if (!raw) throw new Error('Kein JSON erhalten');
      const sanitized = raw.replace(/[\x00-\x1F\x7F]/g, c => (c==='\n'||c==='\r'||c==='\t') ? ' ' : '');
      let vorschlaege;
      try { ({ vorschlaege } = JSON.parse(sanitized)); }
      catch(_) {
        const ids = [...sanitized.matchAll(/"id"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
        const grounds = [...sanitized.matchAll(/"grund"\s*:\s*"([^"]*)"/g)].map(m => m[1]);
        vorschlaege = ids.map((id, i) => ({ id, grund: grounds[i] || '' }));
        if (!vorschlaege.length) throw new Error('JSON konnte nicht geparst werden');
      }
      kiSpin.remove();
      kiVorschlaegeListe.dataset.vorschlagIds = (vorschlaege||[]).map(v=>v.id).join(',');
      kiVorschlaegeListe.appendChild(sectionHdr(`✨ KI-Vorschläge aus dem Rest (${vorschlaege?.length || 0})`, true));
      if (!vorschlaege?.length) {
        const hint = tx('div', '', 'Keine weiteren Vorschläge – Thema/Intention der Stunde ergänzen?');
        hint.style.cssText = 'padding:12px;color:var(--tx3);font-size:12px;';
        kiVorschlaegeListe.appendChild(hint);
      } else {
        vorschlaege.forEach(v => { const mat = matByIdLookup(v.id); if (mat) kiVorschlaegeListe.appendChild(renderMatCard(mat, v.grund, null)); });
      }
    } catch(e) {
      kiSpin.remove();
      const err = tx('div', '', '⚠ Fehler: ' + e.message); err.style.cssText = 'padding:12px;color:#dc2626;font-size:12px;';
      kiVorschlaegeListe.appendChild(err);
    }
    kiVorschlBtn.disabled = false; kiVorschlBtn.textContent = '✨ Vorschlagen';
  };

  s2body.appendChild(sucheWrap);

  // ══════════════════════════════════════════════════════════════════
  // SEKTION 3: Methode
  // ══════════════════════════════════════════════════════════════════
  // Migration: altes stunde.methode → stunde.methoden.Erarbeitung
  if (!stunde.methoden) {
    stunde.methoden = { Einstieg: null, Erarbeitung: null, Sicherung: null };
    if (stunde.methode) stunde.methoden.Erarbeitung = { name: stunde.methode, id: null, begr: '' };
  }
  const methAnz = ['Einstieg','Erarbeitung','Sicherung'].filter(t => stunde.methoden[t]?.name).length;
  const methFertigNeu = methAnz > 0;
  const methStatusText = methFertigNeu ? '✓ ' + methAnz + '/3' : 'offen';
  const { body: s3body } = mkSec(3, 'Methoden', 'methoden', methStatusText, methFertigNeu);

  const METH_FARBE = { Einstieg: '#3b82f6', Erarbeitung: '#10b981', Sicherung: '#f59e0b' };

  function renderMethodeBody() {
    s3body.innerHTML = '';

    // ── KI: alle drei auf einmal ────────────────────────────────────
    const kiAlleBtn = btn('✨ KI schlägt alle drei vor', 'btn btn-ki btn-sm');
    kiAlleBtn.style.marginBottom = '14px';
    kiAlleBtn.onclick = async () => {
      const antKey = localStorage.getItem('ant_key');
      if (!antKey) { alert('Bitte API-Key hinterlegen.'); return; }
      kiAlleBtn.textContent = '⏳ KI denkt…'; kiAlleBtn.disabled = true;
      const methPool = typ => (METHDB.length
        ? METHDB.filter(m => !m.phasen?.length || m.phasen.includes(typ))
        : METHDB
      ).map(m => `ID:${m.id}|${m.name}${m.beschreibung?' – '+m.beschreibung.slice(0,80):''}`).join('\n') || '(keine)';
      const _lgT = getLGThemen((getAktKurs(fp.id)||{}).id||'');
      const prompt = `Du bist Didaktik-Experte. Schlage für diese Unterrichtsstunde je eine Methode für Einstieg, Erarbeitung und Sicherung vor.
Fach: ${fp.fach}, Jahrgang: ${fp.jahrgang}
Lernziel: ${stunde.lernziel||'–'}, Intention: ${stunde.intention||'–'}
${getDIDContext(['stunde'], _lgT, true)}
Methoden für Einstieg:\n${methPool('Einstieg')}
Methoden für Erarbeitung:\n${methPool('Erarbeitung')}
Methoden für Sicherung:\n${methPool('Sicherung')}

Antworte NUR mit JSON:
{"Einstieg":{"id":"ID-oder-null","name":"Name","begr":"1 Satz"},"Erarbeitung":{"id":"ID-oder-null","name":"Name","begr":"1 Satz"},"Sicherung":{"id":"ID-oder-null","name":"Name","begr":"1 Satz"}}`;
      try {
        const parsed = JSON.parse((await callKI(prompt, { model: KI_MODEL_HAIKU, maxTokens: 500 })).match(/\{[\s\S]*\}/)?.[0] || '{}');
        ['Einstieg','Erarbeitung','Sicherung'].forEach(t => { if (parsed[t]?.name) stunde.methoden[t] = parsed[t]; });
        scheduleSave(); renderMethodeBody();
      } catch(e) { alert('Fehler: ' + e.message); kiAlleBtn.textContent = '✨ KI schlägt alle drei vor'; kiAlleBtn.disabled = false; }
    };
    s3body.appendChild(kiAlleBtn);

    // ── Drei Slots ──────────────────────────────────────────────────
    ['Einstieg','Erarbeitung','Sicherung'].forEach(typ => {
      const farbe = METH_FARBE[typ];
      const slot = mk('div', 'meth-slot');
      slot.style.borderLeft = '3px solid ' + farbe;

      const badge = tx('span', 'meth-slot-badge', typ);
      badge.style.color = farbe;
      slot.appendChild(badge);

      const gesetzt = stunde.methoden[typ];
      if (gesetzt?.name) {
        const nameRow = mk('div', 'meth-slot-set');
        nameRow.appendChild(tx('span', 'meth-slot-name', gesetzt.name));
        const clrBtn = mk('button', 'meth-slot-clr'); clrBtn.textContent = '✕';
        clrBtn.onclick = () => { stunde.methoden[typ] = null; scheduleSave(); renderMethodeBody(); };
        nameRow.appendChild(clrBtn);
        slot.appendChild(nameRow);
        if (gesetzt.begr) slot.appendChild(tx('div', 'meth-slot-begr', '✨ ' + gesetzt.begr));
        const info = METHDB.find(m => m.id === gesetzt.id || m.name === gesetzt.name);
        if (info?.beschreibung) slot.appendChild(tx('div', 'meth-slot-info', info.beschreibung));
      } else {
        const row = mk('div', 'meth-slot-pick');
        const pool = METHDB.filter(m => !m.phasen?.length || m.phasen.includes(typ));
        const si = document.createElement('input');
        si.type = 'text'; si.placeholder = 'Methode suchen…'; si.className = 'mat-search-inp'; si.style.flex = '1';
        const dd = mk('div', 'mat-dd');
        si.oninput = () => {
          const q = si.value.toLowerCase().trim();
          dd.innerHTML = ''; dd.style.display = 'none';
          if (!q) return;
          const hits = (pool.length ? pool : METHDB).filter(m => m.name.toLowerCase().includes(q) || (m.beschreibung||'').toLowerCase().includes(q)).slice(0,8);
          if (!hits.length) return;
          hits.forEach(m => {
            const it = mk('div', 'mat-dd-item');
            it.appendChild(tx('strong', '', m.name));
            if (m.beschreibung) it.appendChild(tx('div', 'mat-dd-sub', m.beschreibung.slice(0,70)));
            it.onmousedown = () => { stunde.methoden[typ] = { id: m.id, name: m.name, begr: '' }; scheduleSave(); renderMethodeBody(); };
            dd.appendChild(it);
          });
          dd.style.display = 'block';
        };
        si.onblur = () => setTimeout(() => { dd.style.display = 'none'; }, 150);
        const sw = mk('div', 'mat-search-wrap'); sw.style.flex = '1';
        sw.appendChild(si); sw.appendChild(dd);
        row.appendChild(sw);
        const kiBtn = mk('button', 'ph-meth-ki'); kiBtn.textContent = '✨'; kiBtn.title = 'KI wählt';
        kiBtn.onclick = async () => {
          const antKey = localStorage.getItem('ant_key');
          if (!antKey) { alert('Bitte API-Key hinterlegen.'); return; }
          kiBtn.textContent = '⏳'; kiBtn.disabled = true;
          const mp = (pool.length ? pool : METHDB).map(m => `ID:${m.id}|${m.name}${m.beschreibung?' – '+m.beschreibung.slice(0,80):''}`).join('\n');
          const p = `Wähle die passendste Methode für die ${typ}-Phase. Fach: ${fp.fach}, Jg: ${fp.jahrgang}, Lernziel: ${stunde.lernziel||'–'}\nMethoden:\n${mp}\nJSON: {"id":"ID","name":"Name","begr":"1 Satz"}`;
          try {
            const parsed = JSON.parse((await callKI(p, { model: KI_MODEL_HAIKU, maxTokens: 200 })).match(/\{[\s\S]*\}/)?.[0] || '{}');
            if (parsed.name) { stunde.methoden[typ] = parsed; scheduleSave(); renderMethodeBody(); }
          } catch(e) { alert('Fehler: ' + e.message); kiBtn.textContent = '✨'; kiBtn.disabled = false; }
        };
        row.appendChild(kiBtn);
        slot.appendChild(row);
      }
      s3body.appendChild(slot);
    });
  }
  renderMethodeBody();

  // Auto-KI: wenn alle Slots noch leer sind, direkt loslegen
  const alleSlotLeer = ['Einstieg','Erarbeitung','Sicherung'].every(t => !stunde.methoden[t]?.name);
  if (alleSlotLeer && !stunde._methKiTriggered && localStorage.getItem('ant_key')) {
    stunde._methKiTriggered = true;
    setTimeout(() => s3body.querySelector('.btn-ki')?.click(), 200);
  }

  // ══════════════════════════════════════════════════════════════════
  // (legacy single-field Methode entfernt)
  // ══════════════════════════════════════════════════════════════════
  if (false) { // dead code — wird nie ausgeführt
    // ── Methode gewählt (legacy, nicht mehr genutzt) ────────────────
    if (stunde.methode) {
      const selBox = mk('div', '');
      selBox.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;margin-bottom:10px;';
      selBox.appendChild(tx('span', '', '✅'));
      const methName = tx('div', '', stunde.methode);
      methName.style.cssText = 'font-weight:700;font-size:14px;color:#15803d;flex:1;';
      selBox.appendChild(methName);
      const aendernBtn = btn('Ändern', 'btn btn-ghost btn-xs');
      aendernBtn.onclick = () => {
        stunde.methode = null; stunde.methodeKiBewertung = null;
        scheduleSave(); renderMethodeBody();
      };
      selBox.appendChild(aendernBtn);
      s3body.appendChild(selBox);

      if (stunde.methodeKiBewertung) {
        const { bewertung, hinweis } = stunde.methodeKiBewertung;
        const COL = { 'kann ich machen': '#15803d', 'schwierig': '#b45309', 'völlig ungeeignet': '#dc2626' };
        const c = COL[bewertung] || '#555';
        const bBox = mk('div', '');
        bBox.style.cssText = `padding:8px 12px;border-left:3px solid ${c};background:#fafafa;border-radius:4px;font-size:12px;color:${c};`;
        bBox.textContent = `KI: ${bewertung}${hinweis ? ' – ' + hinweis : ''}`;
        s3body.appendChild(bBox);
      }

      // Methode-Info aus METHDB
      const methInfo = METHDB.find(m => m.name === stunde.methode);
      if (methInfo?.beschreibung) {
        const infoBox = mk('div', '');
        infoBox.style.cssText = 'margin-top:10px;padding:8px 12px;background:var(--bg2);border-radius:6px;font-size:12px;color:var(--tx2);line-height:1.5;';
        infoBox.textContent = methInfo.beschreibung;
        s3body.appendChild(infoBox);
      }
      return;
    }

    // ── Kein Material ───────────────────────────────────────────────
    if (!hasMat) {
      const hint = tx('div', '', '↑ Zuerst Material zuweisen (Abschnitt 2), damit die KI eine Methode vorschlagen kann.');
      hint.style.cssText = 'color:var(--tx3);font-size:13px;line-height:1.6;';
      s3body.appendChild(hint);
      return;
    }

    // ── KI-Vorschlag anzeigen ───────────────────────────────────────
    if (stunde.methodeKiVorschlag && !methodeManModus) {
      const vorBox = mk('div', '');
      vorBox.style.cssText = 'padding:12px 14px;border:1px solid var(--bord);border-radius:8px;background:var(--bg2);margin-bottom:12px;';
      const vorTitel = tx('div', '', '✨ KI-Vorschlag');
      vorTitel.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;';
      vorBox.appendChild(vorTitel);
      const vorName = tx('div', '', stunde.methodeKiVorschlag.name);
      vorName.style.cssText = 'font-size:15px;font-weight:700;color:var(--pri);margin-bottom:4px;';
      vorBox.appendChild(vorName);
      if (stunde.methodeKiVorschlag.begruendung) {
        const begr = tx('div', '', stunde.methodeKiVorschlag.begruendung);
        begr.style.cssText = 'font-size:12px;color:var(--tx2);font-style:italic;margin-bottom:10px;';
        vorBox.appendChild(begr);
      }
      const actRow = mk('div', '');
      actRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;';

      const uebBtn = btn('✓ Übernehmen', 'btn btn-pri btn-sm');
      uebBtn.onclick = () => { stunde.methode = stunde.methodeKiVorschlag.name; scheduleSave(); renderMethodeBody(); };
      actRow.appendChild(uebBtn);

      const altBtn = btn('↻ Alternativen', 'btn btn-ghost btn-sm');
      altBtn.onclick = async () => {
        const antKey = localStorage.getItem('ant_key');
        if (!antKey) { alert('Bitte API-Key hinterlegen.'); return; }
        altBtn.textContent = '⏳'; altBtn.disabled = true;
        const matInfos = (stunde.materialIds||[]).map(id => matByIdLookup(id)).filter(Boolean);
        const matTexte = matInfos.map(m => `${m.titel}: ${(m.beschreibung||'').slice(0,100)}`).join(' | ');
        const methListe = METHDB.map(m => `${m.name}: ${m.beschreibung}`).join('\n');
        const prompt = `Schlage 3 alternative Unterrichtsmethoden (nicht "${stunde.methodeKiVorschlag?.name}") für folgende Unterrichtsstunde vor.

Fach ${fp.fach}, Jahrgang ${fp.jahrgang}, Intention: ${stunde.intention||'–'}
Material: ${matTexte}

Methoden (nur aus dieser Liste wählen):
${methListe}

Antworte NUR als JSON-Array (keine Zeilenumbrüche in Strings): [{"methode":"Name","begruendung":"Ein Satz"}]`;
        try {
          const text = await callKI(prompt, { maxTokens: 500 });
          const alternativen = safeParseArray(text.match(/\[[\s\S]*\]/)?.[0] || '[]');
          const existingAlt = s3body.querySelector('.methode-alts');
          if (existingAlt) existingAlt.remove();
          if (alternativen.length) {
            const altContainer = mk('div', 'methode-alts');
            altContainer.style.marginTop = '12px;';
            const altTitle = tx('div', '', 'Alternativen:');
            altTitle.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;';
            altContainer.appendChild(altTitle);
            alternativen.forEach(a => {
              if (!a.methode) return;
              const aRow = mk('div', '');
              aRow.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--bord);';
              const aInfo = mk('div', ''); aInfo.style.flex = '1';
              const aN = tx('div', '', a.methode);
              aN.style.cssText = 'font-weight:600;font-size:13px;margin-bottom:2px;';
              aInfo.appendChild(aN);
              if (a.begruendung) {
                const aB = tx('div', '', a.begruendung);
                aB.style.cssText = 'font-size:12px;color:var(--tx2);font-style:italic;';
                aInfo.appendChild(aB);
              }
              const waehlenBtn = btn('Wählen', 'btn btn-pri btn-xs');
              waehlenBtn.onclick = () => { stunde.methode = a.methode; scheduleSave(); renderMethodeBody(); };
              aRow.appendChild(aInfo); aRow.appendChild(waehlenBtn);
              altContainer.appendChild(aRow);
            });
            s3body.appendChild(altContainer);
          }
        } catch(e) { alert('Fehler: ' + e.message); }
        altBtn.textContent = '↻ Alternativen'; altBtn.disabled = false;
      };
      actRow.appendChild(altBtn);

      const manBtn = btn('✏ Manuell', 'btn btn-ghost btn-sm');
      manBtn.onclick = () => { methodeManModus = true; renderMethodeBody(); };
      actRow.appendChild(manBtn);

      const neueAnalBtn = btn('↺ Neu analysieren', 'btn btn-ghost btn-xs');
      neueAnalBtn.style.marginLeft = 'auto';
      neueAnalBtn.onclick = () => { stunde.methodeKiVorschlag = null; scheduleSave(); renderMethodeBody(); };
      actRow.appendChild(neueAnalBtn);

      vorBox.appendChild(actRow);
      s3body.appendChild(vorBox);
      return;
    }

    // ── Manueller Picker ────────────────────────────────────────────
    if (methodeManModus) {
      const manHdr = mk('div', '');
      manHdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
      const manTitle = tx('div', '', 'Methode manuell wählen');
      manTitle.style.cssText = 'font-weight:700;font-size:13px;';
      const manClose = btn('✕', 'btn btn-ghost btn-xs');
      manClose.onclick = () => { methodeManModus = false; renderMethodeBody(); };
      manHdr.appendChild(manTitle); manHdr.appendChild(manClose);
      s3body.appendChild(manHdr);

      const manSuch = document.createElement('input'); manSuch.type = 'text'; manSuch.className = 'finp';
      manSuch.placeholder = 'Methode suchen…'; manSuch.style.cssText = 'width:100%;margin-bottom:8px;';
      s3body.appendChild(manSuch);

      const manList = mk('div', '');
      manList.style.cssText = 'max-height:260px;overflow-y:auto;border:1px solid var(--bord);border-radius:6px;';

      async function waehleMethode(m) {
        stunde.methode = m.name;
        methodeManModus = false;
        scheduleSave();
        renderMethodeBody();
        // KI bewertet im Hintergrund
        const antKey = localStorage.getItem('ant_key');
        if (!antKey || !(stunde.materialIds||[]).length) return;
        try {
          const matInfos = (stunde.materialIds||[]).map(id => matByIdLookup(id)).filter(Boolean);
          const matTexte = matInfos.map(mm => `${mm.titel}: ${(mm.beschreibung||'').slice(0,100)}`).join(' | ');
          const methDetail = `Beschreibung: ${m.beschreibung||''}. Ziel: ${m.ziel||''}`;
          const prompt = `Beurteile, ob diese Unterrichtsmethode für die Stunde geeignet ist.

Stunde: Fach ${fp.fach||'–'}, Jahrgang ${fp.jahrgang||'–'}
Intention: ${stunde.intention||'–'}
Material: ${matTexte}
Gewählte Methode: ${m.name}
${methDetail}

Antworte als: BEWERTUNG|HINWEIS
Bewertung = "kann ich machen" oder "schwierig" oder "völlig ungeeignet"
Hinweis = ein kurzer Satz ohne Sonderzeichen`;
          const text = (await callKI(prompt, { maxTokens: 200 })).trim();
          const parts = text.split('|');
          const bew = parts[0]?.trim().toLowerCase();
          const validBews = ['kann ich machen', 'schwierig', 'völlig ungeeignet'];
          if (validBews.includes(bew)) {
            stunde.methodeKiBewertung = { bewertung: bew, hinweis: (parts[1]||'').trim() };
            scheduleSave(); renderMethodeBody();
          }
        } catch(_) { /* KI-Bewertung optional */ }
      }

      function renderManList() {
        manList.innerHTML = '';
        const q = manSuch.value.toLowerCase().trim();
        const hits = METHDB.filter(m => !q || m.name.toLowerCase().includes(q) || (m.beschreibung||'').toLowerCase().includes(q));
        if (!hits.length) {
          const no = tx('div', '', 'Keine Methoden gefunden.');
          no.style.cssText = 'padding:12px;color:var(--tx3);font-size:12px;';
          manList.appendChild(no); return;
        }
        hits.forEach(m => {
          const mRow = mk('div', '');
          mRow.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-bottom:1px solid var(--bord);';
          const mInfo = mk('div', ''); mInfo.style.flex = '1';
          const mN = tx('div', '', m.name); mN.style.cssText = 'font-weight:600;font-size:13px;margin-bottom:2px;';
          mInfo.appendChild(mN);
          if (m.beschreibung) {
            const mB = tx('div', '', m.beschreibung.slice(0,120) + (m.beschreibung.length>120?'…':''));
            mB.style.cssText = 'font-size:11px;color:var(--tx2);line-height:1.4;';
            mInfo.appendChild(mB);
          }
          const waehlenBtn = btn('Wählen', 'btn btn-pri btn-xs');
          waehlenBtn.onclick = () => waehleMethode(m);
          mRow.appendChild(mInfo); mRow.appendChild(waehlenBtn);
          manList.appendChild(mRow);
        });
      }
      renderManList();
      manSuch.oninput = renderManList;
      s3body.appendChild(manList);
      return;
    }

    // ── Analyse-Button ──────────────────────────────────────────────
    const kiAnalBtn = btn('✨ KI analysiert Materialien', 'btn btn-ki btn-sm');
    kiAnalBtn.style.marginBottom = '10px';
    kiAnalBtn.onclick = async () => {
      const antKey = localStorage.getItem('ant_key');
      if (!antKey) { alert('Bitte API-Key hinterlegen.'); return; }
      kiAnalBtn.textContent = '⏳ Analysiert…'; kiAnalBtn.disabled = true;
      const matInfos = (stunde.materialIds||[]).map(id => matByIdLookup(id)).filter(Boolean);
      const matTexte = matInfos.map(m => [
        'Titel: ' + m.titel,
        m.beschreibung ? 'Beschreibung: ' + m.beschreibung.slice(0,200) : '',
        m.erlaeuterung ? 'Erläuterung: ' + m.erlaeuterung.slice(0,200) : '',
        m.methode ? 'Methodenhinweis: ' + m.methode : '',
      ].filter(Boolean).join('\n')).join('\n---\n');
      const methNamen = METHDB.map(m=>m.name).join(', ');
      const prompt = `Analysiere folgende Unterrichtsmaterialien und empfehle die passendste Unterrichtsmethode.

Stunde: Fach ${fp.fach||'–'}, Jahrgang ${fp.jahrgang||'–'}
Intention: ${stunde.intention||'–'}

Materialien:
${matTexte}

Verfügbare Methoden: ${methNamen}

Antworte NUR als JSON (keine Zeilenumbrüche in Strings):
{"methode":"Methodenname","begruendung":"Ein Satz warum"}`;
      try {
        const parsed = JSON.parse((await callKI(prompt, { maxTokens: 300 })).replace(/\r\n|\r|\n/g,' ').match(/\{[^{}]*\}/)?.[0] || '{}');
        if (!parsed.methode) throw new Error('Keine Methode erhalten');
        stunde.methodeKiVorschlag = { name: parsed.methode, begruendung: parsed.begruendung || '' };
        scheduleSave(); renderMethodeBody();
      } catch(e) {
        alert('Fehler: ' + e.message);
        kiAnalBtn.textContent = '✨ KI analysiert Materialien'; kiAnalBtn.disabled = false;
      }
    };
    s3body.appendChild(kiAnalBtn);

    const orManBtn = btn('✏ Direkt manuell wählen', 'btn btn-ghost btn-xs');
    orManBtn.onclick = () => { methodeManModus = true; renderMethodeBody(); };
    s3body.appendChild(orManBtn);
  } // end if(false) — legacy dead code

  // ══════════════════════════════════════════════════════════════════
  // SEKTION 4: Planungsrahmen
  // ══════════════════════════════════════════════════════════════════
  const prStatusText = prFertig ? '✓ fertig' : 'offen';
  const prKiBtn = btn('✨ KI wählt', 'btn btn-ki btn-xs');
  const { body: s4body, acts: s4acts } = mkSec(4, 'Planungsrahmen', 'planungsrahmen', prStatusText, prFertig);
  s4acts.appendChild(prKiBtn);

  prKiBtn.onclick = async () => {
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) { alert('Bitte zuerst Anthropic API-Key hinterlegen.'); return; }
    prKiBtn.textContent = '…'; prKiBtn.disabled = true;
    const kurs = (S.data.kurse || []).find(k => getFachplanung(k.fachplanungId)?.id === fp.id);
    const res = kurs?.ressourcen || {};
    const resText = [
      res.schulbuch ? 'Schulbuch' + (res.schulbuchTitel ? ' (' + res.schulbuchTitel + ')' : '') : '',
      res.arbeitsheft ? 'Arbeitsheft' : '',
      res.ipad ? 'iPad' : '',
      res.internet ? 'Internet' : '',
      res.beamer ? 'Beamer' : '',
      res.elmo ? 'Elmo' : '',
      ...(res.apps || []),
    ].filter(Boolean).join(', ') || '–';

    // Nutzervorgaben (bereits gesetzt = Einschränkung für KI)
    const dauerVorgabe = stunde.dauer ? `${stunde.dauer} Minuten (Vorgabe)` : 'offen – du entscheidest';
    const sozVorgabe   = pr.sozialformen?.length ? pr.sozialformen.join(', ') + ' (Vorgabe)' : 'offen – du entscheidest';
    const schwVorgabe  = pr.schwerpunkt ? pr.schwerpunkt + ' (Vorgabe)' : 'offen – du entscheidest';

    const prompt = `Du planst eine Unterrichtsstunde. Wähle für alle offenen Parameter den besten Wert.

Fach: ${fp.fach || '–'}, Jahrgang: ${fp.jahrgang || '–'}
Lernziel: ${stunde.lernziel || '–'}
Intention: ${stunde.intention || '–'}
Verfügbare Ressourcen: ${resText}
${getDIDContext(['stunde'])}
Parameter (Vorgaben musst du einhalten, offene darfst du frei wählen):
- Dauer: ${dauerVorgabe}
- Sozialformen: ${sozVorgabe}
- Schwerpunkt: ${schwVorgabe}

Für offene Parameter wähle aus:
- dauer: 45 oder 90
- sozialformen: Array aus ["Plenum","Partnerarbeit","Gruppenarbeit","Einzelarbeit"]
- schwerpunkt: einer von ["Einführung","Erarbeitung","Übung & Festigung","Sicherung","Experiment","Diskussion","Präsentation"]

Antworte NUR als JSON mit den offenen Feldern (Vorgaben weglassen):
{}`;
    try {
      const parsed = JSON.parse((await callKI(prompt, { model: KI_MODEL_HAIKU, maxTokens: 200 })).match(/\{[\s\S]*\}/)?.[0] || '{}');
      const gewählt = [];
      if (parsed.dauer && !stunde.dauer) { stunde.dauer = parsed.dauer; gewählt.push('dauer'); }
      if (parsed.sozialformen?.length && !pr.sozialformen?.length) { pr.sozialformen = parsed.sozialformen; gewählt.push('sozialformen'); }
      if (parsed.schwerpunkt && !pr.schwerpunkt) { pr.schwerpunkt = parsed.schwerpunkt; gewählt.push('schwerpunkt'); }
      pr.kiGewählt = [...new Set([...(pr.kiGewählt || []), ...gewählt])];
      scheduleSave(); render();
    } catch(e) { alert('Fehler: ' + e.message); }
    prKiBtn.textContent = '✨ KI wählt'; prKiBtn.disabled = false;
  };

  function prSection(label, hint) {
    const h = mk('div', '');
    h.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px;margin-top:12px;display:flex;align-items:center;gap:6px;';
    h.appendChild(tx('span', '', label));
    if (hint) h.appendChild(tx('span', '', '· ' + hint).style && h.lastChild || (() => { const s = tx('span','',hint); s.style.cssText='font-weight:400;text-transform:none;color:var(--tx3);'; return s; })());
    s4body.appendChild(h);
  }
  function prChips(key, options, multi) {
    const wrap = mk('div', 'pr-chip-wrap');
    const kiSet = (pr.kiGewählt || []).includes(key);
    options.forEach(opt => {
      const isActive = multi ? (pr[key] || []).includes(opt) : pr[key] === opt;
      const b = mk('button', 'btn btn-xs pr-chip' + (isActive ? ' active' : '') + (isActive && kiSet ? ' ki' : ''));
      b.textContent = isActive && kiSet ? '✨ ' + opt : opt;
      b.onclick = () => {
        if (multi) {
          if (!pr[key]) pr[key] = [];
          pr[key] = pr[key].includes(opt) ? pr[key].filter(x => x !== opt) : [...pr[key], opt];
        } else {
          pr[key] = pr[key] === opt ? null : opt;
        }
        pr.kiGewählt = (pr.kiGewählt || []).filter(k => k !== key);
        scheduleSave(); render();
      };
      wrap.appendChild(b);
    });
    s4body.appendChild(wrap);
  }

  // ── Dauer (Checkboxen 45 / 90, leer = KI entscheidet) ──────────
  prSection('Dauer');
  const dauerWrap = mk('div', 'pr-chip-wrap');
  const kiDauer = (pr.kiGewählt || []).includes('dauer');
  [45, 90].forEach(min => {
    const isActive = stunde.dauer === min;
    const b = mk('button', 'btn btn-xs pr-chip' + (isActive ? ' active' : '') + (isActive && kiDauer ? ' ki' : ''));
    b.textContent = (isActive && kiDauer ? '✨ ' : '') + min + ' min';
    b.onclick = () => {
      stunde.dauer = isActive ? null : min;
      pr.kiGewählt = (pr.kiGewählt || []).filter(k => k !== 'dauer');
      scheduleSave(); render();
    };
    dauerWrap.appendChild(b);
  });
  s4body.appendChild(dauerWrap);

  // ── Sozialformen ────────────────────────────────────────────────
  prSection('Sozialformen');
  prChips('sozialformen', ['Plenum', 'Partnerarbeit', 'Gruppenarbeit', 'Einzelarbeit'], true);

  // ── Schwerpunkt ─────────────────────────────────────────────────
  prSection('Schwerpunkt');
  prChips('schwerpunkt', ['Einführung', 'Erarbeitung', 'Übung & Festigung', 'Sicherung', 'Experiment', 'Diskussion', 'Präsentation'], false);

  prSection('Besondere Hinweise');
  const hinweisTA = document.createElement('textarea');
  hinweisTA.className = 'finp'; hinweisTA.rows = 2; hinweisTA.style.cssText = 'resize:none;font-size:13px;';
  hinweisTA.placeholder = 'z.B. Heute kein Beamer, Max fehlt, Raumwechsel…';
  hinweisTA.value = pr.hinweise || '';
  hinweisTA.oninput = e => { pr.hinweise = e.target.value; scheduleSave(); };
  s4body.appendChild(hinweisTA);

  // ══════════════════════════════════════════════════════════════════
  // SEKTION 5: Phasen
  // ══════════════════════════════════════════════════════════════════
  const phStatusText = phFertig ? `✓ ${stunde.phasen.length} Phasen` : 'offen';
  const kiVorlageBtn = btn('✨ KI entscheidet', 'btn btn-ki btn-xs');
  const apb = btn('+ Phase', 'btn btn-pri btn-xs');
  const { body: s5body, acts: s5acts } = mkSec(5, 'Phasen', 'phasen', phStatusText, phFertig);
  s5acts.appendChild(kiVorlageBtn);
  s5acts.appendChild(apb);

  const PHASEN_VORLAGEN = {
    '3-Phasen': [
      { titel: 'Einstieg',    minuten: 10, typ: 'Einstieg' },
      { titel: 'Erarbeitung', minuten: 25, typ: 'Erarbeitung' },
      { titel: 'Sicherung',   minuten: 10, typ: 'Sicherung' },
    ],
    'AVIVA': [
      { titel: 'Ankommen & Einstimmen', minuten: 5,  typ: 'Einstieg' },
      { titel: 'Vorwissen aktivieren',  minuten: 8,  typ: 'Einstieg' },
      { titel: 'Informieren',           minuten: 15, typ: 'Erarbeitung' },
      { titel: 'Verarbeiten',           minuten: 12, typ: 'Erarbeitung' },
      { titel: 'Auswerten',             minuten: 5,  typ: 'Sicherung' },
    ],
    'Direkte Instruktion': [
      { titel: 'I do (Modellieren)',        minuten: 15, typ: 'Einstieg' },
      { titel: 'We do (Gemeinsam üben)',    minuten: 15, typ: 'Erarbeitung' },
      { titel: 'You do (Selbstständig üben)', minuten: 15, typ: 'Sicherung' },
    ],
    'Forschend-entdeckend': [
      { titel: 'Phänomen / Einstieg',          minuten: 8,  typ: 'Einstieg' },
      { titel: 'Hypothesenbildung',             minuten: 7,  typ: 'Einstieg' },
      { titel: 'Experiment / Erarbeitung',      minuten: 20, typ: 'Erarbeitung' },
      { titel: 'Auswertung & Schlussfolgerung', minuten: 10, typ: 'Sicherung' },
    ],
  };
  const MODELL_META = {
    '3-Phasen':             { icon: '📐', phasen: 'Einstieg · Erarbeitung · Sicherung',                         hinweis: 'Klassisch, vielseitig' },
    'AVIVA':                { icon: '🔄', phasen: 'Ankommen · Vorwissen · Informieren · Verarbeiten · Auswerten', hinweis: 'Lernprozessorientiert' },
    'Direkte Instruktion':  { icon: '🎯', phasen: 'I do · We do · You do',                                       hinweis: 'Schrittweise Übergabe' },
    'Forschend-entdeckend': { icon: '🔬', phasen: 'Phänomen · Hypothese · Experiment · Auswertung',              hinweis: 'Entdeckendes Lernen' },
  };
  function applyVorlage(key, skipConfirm) {
    if (!skipConfirm && stunde.phasen.length > 0 && !confirm('Vorhandene Phasen ersetzen?')) return false;
    stunde.phasenModell = key;
    stunde.phasen = PHASEN_VORLAGEN[key].map(p => ({
      id: uid(), titel: p.titel, inhalt: '', methode: '', sozialform: '', minuten: p.minuten, materialIds: [], typ: p.typ || ''
    }));
    scheduleSave(); render();
    return true;
  }

  const modellGrid = mk('div', 'modell-grid');
  Object.keys(MODELL_META).forEach(key => {
    const meta = MODELL_META[key];
    const kachel = mk('div', 'modell-kachel' + (stunde.phasenModell === key ? ' active' : ''));
    kachel.appendChild(tx('div', 'modell-icon', meta.icon));
    kachel.appendChild(tx('div', 'modell-name', key));
    kachel.appendChild(tx('div', 'modell-phasen', meta.phasen));
    kachel.appendChild(tx('div', 'modell-hinweis', meta.hinweis));
    kachel.onclick = () => applyVorlage(key);
    modellGrid.appendChild(kachel);
  });
  if (stunde.phasenModellBegruendung) {
    const begr = mk('div', 'modell-ki-begr');
    begr.appendChild(tx('span', 'modell-ki-begr-icon', '✨'));
    begr.appendChild(tx('span', '', stunde.phasenModellBegruendung));
    modellGrid.appendChild(begr);
  }
  s5body.appendChild(modellGrid);

  kiVorlageBtn.onclick = async () => {
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) { alert('Bitte zuerst Anthropic API-Key in den Einstellungen hinterlegen.'); return; }
    kiVorlageBtn.textContent = '…'; kiVorlageBtn.disabled = true;
    try {
      const wissenText = Object.keys(PHASEN_VORLAGEN).map(key =>
        `## ${key}\n${DIDAKTIKDB[key] || '(kein Hintergrundwissen hinterlegt)'}`
      ).join('\n\n');
      const lernzieleText = stunde.lernziele?.length
        ? stunde.lernziele.map((z, i) => `${i+1}. ${z.text}`).join('\n')
        : '–';
      const pr2 = stunde.planungsrahmen || {};
      const prText = [
        pr2.sozialformen?.length ? 'Sozialformen: ' + pr2.sozialformen.join(', ') : '',
        pr2.schwerpunkt ? 'Schwerpunkt: ' + pr2.schwerpunkt : '',
        pr2.differenzierung ? 'Differenzierung: ' + pr2.differenzierung : '',
        pr2.hausaufgaben != null ? 'Hausaufgaben: ' + (pr2.hausaufgaben ? 'Ja' : 'Nein') : '',
        pr2.hinweise ? 'Hinweise: ' + pr2.hinweise : '',
      ].filter(Boolean).join('\n') || '–';
      const prompt = `Du bist Didaktik-Experte für NRW-Gymnasien. Wähle für diese Unterrichtsstunde das passende Phasierungsmodell und befülle die Phasen konkret und sinnvoll.

Stunde:
- Fach: ${fp.fach || '–'}, Jahrgang: ${fp.jahrgang || '–'}
- Titel: ${stunde.titel || '–'}
- Dauer: ${stunde.dauer || 45} Minuten
- Intention: ${stunde.intention || '–'}
- Lernziele:
${lernzieleText}
- Planungsrahmen:
${prText}

Didaktisches Hintergrundwissen (Phasenmodelle):
${wissenText}
${getDIDContext(['stunde'], getLGThemen((getAktKurs(fp.id)||{}).id||''), true)}

Verfügbare Modelle (nur eines wählen):
- 3-Phasen: Einstieg / Erarbeitung / Sicherung
- AVIVA: Ankommen / Vorwissen / Informieren / Verarbeiten / Auswerten
- Direkte Instruktion: I do / We do / You do
- Forschend-entdeckend: Phänomen / Hypothese / Experiment / Auswertung

Antworte NUR als JSON-Objekt. WICHTIG: Keine Zeilenumbrüche innerhalb von Strings – schreibe alles in einer Zeile pro Feld:
{
  "modell": "3-Phasen",
  "begruendung": "Ein Satz, warum dieses Modell passt.",
  "phasen": [
    { "titel": "Einstieg", "inhalt": "Konkrete Beschreibung in einem Satz ohne Zeilenumbruch", "methode": "z.B. Unterrichtsgespräch", "sozialform": "z.B. Plenum", "minuten": 10 }
  ]
}`;
      const text = await callKI(prompt, { maxTokens: 1400 });
      const raw = text.match(/\{[\s\S]*\}/)?.[0] || '{}';
      const sanitized = raw.replace(/[\r\n\t]+/g, ' ');
      const parsed = JSON.parse(sanitized);
      if (!parsed.phasen?.length) throw new Error('Keine Phasen erhalten');
      if (stunde.phasen.length > 0 && !confirm(`KI wählt: ${parsed.modell}\n„${parsed.begruendung}"\n\nVorhandene Phasen ersetzen?`)) {
        kiVorlageBtn.textContent = '✨ KI entscheidet'; kiVorlageBtn.disabled = false; return;
      }
      stunde.phasenModell = parsed.modell;
      stunde.phasenModellBegruendung = parsed.begruendung || '';
      stunde.phasen = parsed.phasen.map(p => ({
        id: uid(), titel: p.titel || '', inhalt: p.inhalt || '',
        methode: p.methode || '', sozialform: p.sozialform || '',
        minuten: parseInt(p.minuten) || 0, materialIds: []
      }));
      scheduleSave(); render();
    } catch(e) {
      alert('Fehler: ' + e.message);
      kiVorlageBtn.textContent = '✨ KI entscheidet'; kiVorlageBtn.disabled = false;
    }
  };

  apb.onclick = () => {
    stunde.phasen.push({ id: uid(), titel: '', inhalt: '', methode: '', sozialform: '', minuten: 0, materialIds: [] });
    scheduleSave(); render();
  };

  const pb = mk('div', '');
  pb.appendChild(phasenTable(stunde));
  s5body.appendChild(pb);

  // ══════════════════════════════════════════════════════════════════
  // UNTERHALB DER SEKTIONEN: Tafelbild + Lehrerkommentar
  // ══════════════════════════════════════════════════════════════════
  const below = mk('div', 'plan-below');

  const tc = mk('div', 'card');
  tc.appendChild(cardHdr('Tafelbild'));
  const tb = mk('div', 'card-body');
  const tafel = mk('div', 'tafel');
  const ta = document.createElement('textarea');
  ta.placeholder = 'Tafelbild skizzieren…';
  ta.value = stunde.tafelbild || '';
  ta.oninput = e => { stunde.tafelbild = e.target.value; scheduleSave(); };
  tafel.appendChild(ta);
  tb.appendChild(tafel);
  tc.appendChild(tb);
  below.appendChild(tc);

  const lc = mk('div', 'card');
  lc.appendChild(cardHdr('Erläuterungen für die Lehrkraft'));
  const lb = mk('div', 'card-body');
  lb.appendChild(fieldArea('', stunde.lehrerkommentar || '',
    v => { stunde.lehrerkommentar = v; scheduleSave(); }, 'min-height:120px;'));
  lc.appendChild(lb);
  below.appendChild(lc);

  secs.appendChild(below);
}

function viewStunde(fpId, blockId, reiheId, stundeId) {
  const fp     = getFachplanung(fpId);
  const block  = findBlock(fpId, blockId);
  const reihe  = findReihe(fpId, blockId, reiheId);
  const stunde = findStunde(fpId, blockId, reiheId, stundeId);
  if (!fp || !block || !reihe || !stunde) {
    S.sel = null; render(); return mk('div', '');
  }
  initStunde(stunde);

  // Gruppe (falls vorhanden)
  const gruppe = stunde.einheitId ? findEinheit(fpId, blockId, reiheId, stunde.einheitId) : null;

  const div = mk('div', '');
  div.appendChild(breadcrumb([
    { label: fachLabel(fp.fach) + ' ' + fp.jahrgang, action: () => { S.sel = null; render(); } },
    { label: block.titel, action: () => { S.sel = { type: 'block', ids: [fpId, blockId] }; render(); } },
    { label: reihe.titel, action: () => { S.sel = { type: 'reihe', ids: [fpId, blockId, reiheId] }; render(); } },
  ]));

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', stunde.titel || 'Stunde'));
  const subTxt = 'Unterrichtsstunde' + (gruppe ? ' · ' + gruppe.titel : '');
  left.appendChild(tx('div', 'c-sub', subTxt));
  hdr.appendChild(left);
  const hdrBtns = mk('div', 'btn-grp');
  const nextBtn = btn('✨ Nächste Stunde', 'btn btn-ghost btn-sm');
  nextBtn.onclick = () => kiNaechsteStunde(fp, block, reihe, stunde, gruppe, nextBtn);
  hdrBtns.appendChild(nextBtn);
  const mvb = btn('↗ Verschieben', 'btn btn-ghost btn-sm');
  mvb.onclick = () => { S.modal = { type: 'moveStunde', data: { fpId, blockId, reiheId, stundeId } }; render(); };
  hdrBtns.appendChild(mvb);
  const db = btn('🗑 Löschen', 'btn btn-danger btn-sm');
  db.onclick = () => {
    if (confirm('Stunde löschen?')) {
      reihe.stunden = (reihe.stunden || []).filter(s => s.id !== stundeId);
      S.sel = { type: 'reihe', ids: [fpId, blockId, reiheId] };
      scheduleSave(); render();
    }
  };
  hdrBtns.appendChild(db);
  hdr.appendChild(hdrBtns);
  div.appendChild(hdr);

  renderStundenBody(div, stunde, fp);
  return div;
}

// ── KI: Nächste Stunde planen ─────────────────────────────────────
async function kiNaechsteStunde(fp, block, reihe, aktStunde, gruppe, triggerBtn) {
  const antKey = localStorage.getItem('ant_key');
  if (!antKey) { alert('Bitte zuerst Anthropic API-Key in den Einstellungen hinterlegen.'); return; }

  triggerBtn.disabled = true;
  triggerBtn.textContent = '⏳ KI denkt…';

  try {
    const fachNameMap = { M:'Mathematik', Ch:'Chemie', Bio:'Biologie', Ch_GK:'Chemie', Ch_LK:'Chemie', Bio_GK:'Biologie', Bio_LK:'Biologie' };
    const fachName = fachNameMap[fp.fach] || fp.fach;

    // ── Aktuelle Stunde ──────────────────────────────────────────
    const aktPhasen = (aktStunde.phasen || []).map(p =>
      `  - ${p.bezeichnung || p.typ || ''}${p.dauer ? ' (' + p.dauer + ' min)' : ''}: ${p.inhalt || ''}`
    ).join('\n');

    // ── Alle Stunden in der Reihe (Kontext) ─────────────────────
    const alleStunden = (reihe.stunden || []);
    const aktIdx = alleStunden.findIndex(s => s.id === aktStunde.id);
    const bisherGeplant = alleStunden.slice(0, aktIdx + 1).map((s, i) => {
      let z = `  Stunde ${i + 1}: "${s.titel || '(ohne Titel)'}"`;
      if (s.lernziel) z += `\n    Lernziel: ${s.lernziel}`;
      return z;
    }).join('\n');

    // ── Verfügbares Material im Bucket ──────────────────────────
    const relMat = MATDB.filter(m =>
      m.reiheId === reihe.id ||
      (gruppe && m.einheitId === gruppe.id) ||
      (!m.reiheId && !m.einheitId) // allgemeines Material
    ).slice(0, 30); // max 30 Einträge

    const matText = relMat.length
      ? relMat.map(m =>
          `  [${m.id?.slice(0,6) || '?'}] ${m.titel}` +
          (m.materialtyp ? ' (' + m.materialtyp + ')' : '') +
          (m.beschreibung ? ' – ' + m.beschreibung.slice(0, 80) : '')
        ).join('\n')
      : '  (keine Materialien vorhanden)';

    // ── KLP-Kontext ──────────────────────────────────────────────
    const isSII = ['EF','Q1','Q2','SII'].includes(fp.jahrgang);
    const isGK = fp.fach.includes('GK'), isLK = fp.fach.includes('LK');
    const klpHits = KLPDB.filter(e => {
      if (e.fach !== fachName) return false;
      const eIsSII = e.stufe === 'SII' || e.id?.toUpperCase().includes('SII');
      if (isSII !== eIsSII) return false;
      if (isSII && isGK && e.id?.toUpperCase().includes('LK')) return false;
      if (isSII && isLK && e.id?.toUpperCase().includes('GK')) return false;
      return true;
    }).slice(0, 40);
    const klpText = klpHits.length
      ? klpHits.map(e => `  [${e.id}] ${e.kompetenzcodes.join(',')} ${e.inhaltsfeld}: ${e.beschreibung.slice(0,100)}`).join('\n')
      : '  (kein KLP geladen)';

    const aktKurs = getAktKurs(fp.id);
    const lgThemen = aktKurs ? getLGThemen(aktKurs.id) : [];
    const lgInfo = aktKurs?.lerngruppe ? (() => {
      const lg = aktKurs.lerngruppe;
      return [
        lg.leistung ? 'Leistungsniveau: ' + lg.leistung : '',
        lg.foerderung?.length ? 'Förderbedarf: ' + lg.foerderung.join(', ') : '',
        lg.konsequenzen ? 'Didakt. Konsequenzen: ' + lg.konsequenzen.slice(0, 200) : '',
      ].filter(Boolean).join('\n');
    })() : '';

    const prompt = `Du bist Fachlehrerin für ${fachName} (Jahrgang ${fp.jahrgang}) an einem Gymnasium in NRW.
${lgInfo ? '\nLERNGRUPPE (' + (aktKurs?.klasse||'') + '):\n' + lgInfo + '\n' : ''}
AKTUELLE STUNDE (die gerade abgeschlossene/bearbeitete):
Titel: "${aktStunde.titel || '(ohne Titel)'}"
Lernziel: "${aktStunde.lernziel || '(kein Lernziel)'}"
Dauer: ${aktStunde.dauer || 45} Minuten
${aktPhasen ? 'Phasen:\n' + aktPhasen : ''}
${aktStunde.lehrerkommentar ? 'Lehrerkommentar: ' + aktStunde.lehrerkommentar : ''}

REIHE: "${reihe.titel}"${block ? ' (Block: ' + block.titel + ')' : ''}
${gruppe ? 'Gruppe: "' + gruppe.titel + '"' : ''}

BISHERIGE STUNDEN IN DIESER REIHE:
${bisherGeplant || '  (keine)'}

VERFÜGBARES MATERIAL IM BUCKET:
${matText}

KLP-KOMPETENZERWARTUNGEN (NRW):
${klpText}
${getDIDContext(['stunde', 'reihe'], lgThemen)}
Plane jetzt die NÄCHSTE sinnvolle Unterrichtsstunde in dieser Reihe.
Berücksichtige dabei:
- Was wurde bisher erarbeitet? Was fehlt noch?
- Welches verfügbare Material passt zur nächsten Stunde?
- Welche Kompetenzerwartungen werden adressiert?

Antworte NUR mit diesem JSON (kein Text davor oder danach):
{
  "titel": "Titel der nächsten Stunde",
  "lernziel": "Die SuS können … (vollständige Lernzielformulierung)",
  "dauer": 45,
  "intention": "2-3 Sätze: Warum diese Stunde als nächstes? Welchen didaktischen Schritt macht sie?",
  "material": ["Titel von Material 1 aus dem Bucket", "Titel von Material 2"],
  "klpIds": ["ID1", "ID2"]
}`;

    const text = await callKI(prompt, { model: KI_MODEL_HAIKU, maxTokens: 800 });
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
    if (!parsed.titel) throw new Error('Kein Vorschlag erhalten.');

    // ── Neue Stunde anlegen ──────────────────────────────────────
    const ns = {
      id: uid(),
      titel: parsed.titel,
      lernziel: parsed.lernziel || '',
      dauer: parsed.dauer || 45,
      phasen: [],
      klpInhalt: parsed.klpIds || [],
      klpProzess: [],
      material: [],
      tafelbild: '',
      lehrerkommentar: parsed.intention || '',
    };
    if (aktStunde.einheitId) ns.einheitId = aktStunde.einheitId; // selbe Gruppe

    // Nach der aktuellen Stunde einfügen
    const arr = reihe.stunden || [];
    const idx = arr.findIndex(s => s.id === aktStunde.id);
    arr.splice(idx + 1, 0, ns);

    S.sel = { type: 'stunde', ids: [fp.id, block.id, reihe.id, ns.id] };
    scheduleSave(); render();

  } catch (e) {
    alert('Fehler: ' + e.message);
    triggerBtn.disabled = false;
    triggerBtn.textContent = '✨ Nächste Stunde';
  }
}

function viewFreieStunde(fpId, stundeId) {
  const fp = getFachplanung(fpId);
  if (!fp.freieStunden) fp.freieStunden = [];
  const stunde = fp.freieStunden.find(s => s.id === stundeId);
  if (!stunde) return tx('div', 'c-hdr', 'Stunde nicht gefunden.');
  initStunde(stunde);

  const div = mk('div', '');
  div.appendChild(breadcrumb([
    { label: fachLabel(fp.fach) + ' ' + fp.jahrgang, action: () => { S.aktFpId = fpId; S.view = 'fachplanung'; S.sel = null; render(); } },
    { label: 'Freie Stunden', action: () => { S.aktFpId = fpId; S.view = 'freieStunden'; S.sel = null; render(); } },
  ]));

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', stunde.titel || 'Neue Stunde'));
  left.appendChild(tx('div', 'c-sub', 'Freie Stunde · ' + fachLabel(fp.fach) + ' ' + fp.jahrgang));
  hdr.appendChild(left);
  const db = btn('🗑 Löschen', 'btn btn-danger btn-sm');
  db.onclick = () => {
    if (confirm('Stunde löschen?')) {
      fp.freieStunden = fp.freieStunden.filter(s => s.id !== stundeId);
      S.view = 'freieStunden'; S.aktFpId = fpId; S.sel = null;
      scheduleSave(); render();
    }
  };
  hdr.appendChild(db);
  div.appendChild(hdr);

  renderStundenBody(div, stunde, fp);
  return div;
}
