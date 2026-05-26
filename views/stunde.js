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
  const grid = mk('div', 'stunden-grid');
  div.appendChild(grid);

  // ── Grunddaten ─────────────────────────────────────────────────
  const gc = mk('div', 'card');
  gc.appendChild(cardHdr('Grunddaten'));
  const gb = mk('div', 'card-body');
  gb.appendChild(fieldInput('Kurztitel', stunde.titel || '', v => { stunde.titel = v; scheduleSave(); }));
  gb.appendChild(fieldInput('Langtitel', stunde.langtitel || '', v => { stunde.langtitel = v; scheduleSave(); }));
  gb.appendChild(fieldArea('Intention', stunde.intention || '', v => { stunde.intention = v; scheduleSave(); }, '', 'Worum geht es in dieser Stunde? Worauf soll sie hinauslaufen?'));

  const prioFg = mk('div', 'fg');
  prioFg.appendChild(tx('label', 'fl', 'Typ / Priorität'));
  const prioWrap = mk('div', 'prio-wrap');
  const PRIOS = [
    { val: 'pflicht', label: '🟢 Pflicht', title: 'Muss gemacht werden' },
    { val: 'optional', label: '🟡 Optional', title: 'Kann bei Zeitmangel entfallen' },
    { val: 'puffer', label: '🔵 Puffer', title: 'Wiederholung / Reserve' },
    { val: 'klassenarbeit', label: '📝 Klassenarbeit', title: 'Klassenarbeit' },
    { val: 'rueckgabe', label: '📋 Rückgabe', title: 'Rückgabe / Besprechung' },
  ];
  if (!stunde.prioritaet) stunde.prioritaet = 'pflicht';
  PRIOS.forEach(p => {
    const b = mk('button', 'prio-btn' + (stunde.prioritaet === p.val ? ' active' : ''));
    b.textContent = p.label; b.title = p.title;
    b.onclick = () => { stunde.prioritaet = p.val; scheduleSave(); render(); };
    prioWrap.appendChild(b);
  });
  prioFg.appendChild(prioWrap);
  gb.appendChild(prioFg);

  gb.appendChild(fieldArea('Stundenbeschreibung', stunde.lernziel || '', v => { stunde.lernziel = v; scheduleSave(); }, '', 'Inhaltliche Zusammenfassung – was passiert in dieser Stunde?'));
  gc.appendChild(gb);
  gc.classList.add('card-half');
  grid.appendChild(gc);

  // ── Lernziele ──────────────────────────────────────────────────
  const lzCard = mk('div', 'card');
  const lzHdr = cardHdr('Lernziele');

  const lzKiBtn = btn('✨ KI → Lernziele ableiten', 'btn btn-ki btn-xs');
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

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': antKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 800,
          messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const parsed = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || '[]');
      if (!parsed.length) throw new Error('Keine Lernziele erhalten');
      const neu = parsed.map(z => ({ id: uid(), text: typeof z === 'string' ? z : (z.text || '') }));
      if (stunde.lernziele.length > 0 && !confirm('Vorhandene Lernziele ersetzen?')) {
        lzKiBtn.textContent = '✨ KI → Lernziele ableiten'; lzKiBtn.disabled = false; return;
      }
      stunde.lernziele = neu;
      scheduleSave(); render();
    } catch(e) {
      alert('Fehler: ' + e.message);
      lzKiBtn.textContent = '✨ KI → Lernziele ableiten'; lzKiBtn.disabled = false;
    }
  };
  lzHdr.appendChild(lzKiBtn);

  const lzAddBtn = btn('+ Manuell', 'btn btn-pri btn-xs');
  lzAddBtn.onclick = () => {
    stunde.lernziele.push({ id: uid(), text: '', indikator: '' });
    scheduleSave(); render();
  };
  lzHdr.appendChild(lzAddBtn);
  lzCard.appendChild(lzHdr);

  const lzBody = mk('div', 'card-body');
  if (stunde.lernziele.length === 0) {
    lzBody.appendChild(tx('div', 'empty-hint', 'Noch keine Lernziele – KI ableiten oder manuell hinzufügen.'));
  } else {
    stunde.lernziele.forEach((lz, i) => {
      const row = mk('div', 'lz-row');
      const nr = tx('div', 'lz-nr', (i + 1) + '.');
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

      const delBtn = btn('🗑', 'btn btn-danger btn-xs lz-del');
      delBtn.onclick = () => {
        stunde.lernziele = stunde.lernziele.filter(z => z.id !== lz.id);
        scheduleSave(); render();
      };

      row.appendChild(nr);
      row.appendChild(fields);
      row.appendChild(delBtn);
      lzBody.appendChild(row);
    });
  }
  lzCard.appendChild(lzBody);
  lzCard.classList.add('card-half');
  grid.appendChild(lzCard);

  // ── Material ───────────────────────────────────────────────────
  const matCard = mk('div', 'card');
  const matHdr = cardHdr('Material');
  const kiVorschlBtn = btn('✨ Vorschlagen', 'btn btn-ki btn-xs');
  const matSucheBtn = btn('🔍 Suchen', 'btn btn-ghost btn-xs');
  matHdr.appendChild(kiVorschlBtn);
  matHdr.appendChild(matSucheBtn);
  matCard.appendChild(matHdr);
  const matBody = mk('div', 'card-body');

  // Zugewiesene Materialien (immer sichtbar)
  const zugewiesenWrap = mk('div', ''); zugewiesenWrap.style.marginBottom = '8px';
  function renderZugewiesene() {
    zugewiesenWrap.innerHTML = '';
    if (!stunde.materialIds.length) {
      zugewiesenWrap.appendChild(tx('div', '', 'Noch kein Material zugewiesen.'));
      zugewiesenWrap.querySelector('div').style.cssText = 'font-size:12px;color:var(--tx3);padding:2px 0;';
      return;
    }
    stunde.materialIds.forEach(mid => {
      const mat = MATDB.find(m => m.id === mid);
      if (!mat) return;
      const row = mk('div', ''); row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--bord);';
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
  matBody.appendChild(zugewiesenWrap);

  // Suchbereich (toggle)
  const sucheWrap = mk('div', ''); sucheWrap.style.display = 'none';

  const filterRow = mk('div', ''); filterRow.style.marginBottom = '10px';
  const suchInp = document.createElement('input'); suchInp.type = 'text'; suchInp.className = 'finp';
  suchInp.placeholder = 'Titel, Thema, Beschreibung…'; suchInp.style.width = '100%';
  filterRow.appendChild(suchInp);
  sucheWrap.appendChild(filterRow);

  // KI-Vorschläge (erscheint über der manuellen Suche)
  const kiVorschlaegeListe = mk('div', '');
  kiVorschlaegeListe.style.cssText = 'max-height:320px;overflow-y:auto;border:1px solid var(--bord);border-radius:6px;margin-bottom:10px;display:none;';
  sucheWrap.insertBefore(kiVorschlaegeListe, filterRow);

  kiVorschlBtn.onclick = async () => {
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) { alert('Bitte API-Key in den Einstellungen hinterlegen.'); return; }
    // sucheWrap öffnen
    sucheWrap.style.display = 'block';
    matSucheBtn.textContent = '▲ Schließen';
    kiVorschlaegeListe.style.display = 'block';
    kiVorschlaegeListe.innerHTML = '';
    const spin = tx('div', '', '⏳ KI sucht passende Materialien…');
    spin.style.cssText = 'padding:12px;color:var(--tx3);font-size:12px;';
    kiVorschlaegeListe.appendChild(spin);
    kiVorschlBtn.disabled = true; kiVorschlBtn.textContent = '⏳';

    const EXCL = ['Lehrerhandreichung', 'Lösung'];
    const safe = s => (s||'').replace(/[|\n\r\t]/g, ' ').trim();
    const matSummary = MATDB
      .filter(m => !EXCL.includes(m.materialtyp))
      .map(m => `id:${m.id}|${safe(m.titel)}|${(m.themen||[]).map(safe).join(',')}|${(m.fach||[]).join(',')}|Jg:${(m.jahrgang||[]).join(',')}|${safe(m.materialtyp)}`)
      .join('\n');

    const lernziele = (stunde.lernziele||[]).map(z=>z.text).join(', ') || '–';
    const prompt = `Du hilfst einer NRW-Gymnasiallehrerin beim Planen einer Unterrichtsstunde.

Stunde: Fach ${fp.fach||'–'}, Jahrgang ${fp.jahrgang||'–'}, ${stunde.dauer||45} Min
Thema/Intention: ${stunde.intention||'–'}
Lernziele: ${lernziele}

Wähle 5–8 passende Materialien aus der folgenden Datenbank. Bevorzuge Erarbeitungsmaterial. Gib für jedes eine kurze Begründung (1 Satz, z.B. was an dem Material für diese Stunde nützlich ist – auch wenn es Anpassung braucht).

Antworte NUR als JSON:
{"vorschlaege": [{"id": "mat_xxx", "grund": "ein Satz"}]}

Materialdatenbank (id|Titel|Themen|Fach|Jahrgang|Typ):
${matSummary}`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': antKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error?.message || res.statusText);
      const raw = (d.content?.[0]?.text || '').match(/\{[\s\S]*\}/)?.[0];
      if (!raw) throw new Error('Kein JSON erhalten');
      const sanitized = raw.replace(/[\x00-\x1F\x7F]/g, c => (c==='\n'||c==='\r'||c==='\t') ? ' ' : '');
      let vorschlaege;
      try {
        ({ vorschlaege } = JSON.parse(sanitized));
      } catch(_) {
        // Fallback: IDs per Regex extrahieren wenn JSON malformed
        const ids = [...sanitized.matchAll(/"id"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
        const grounds = [...sanitized.matchAll(/"grund"\s*:\s*"([^"]*)"/g)].map(m => m[1]);
        vorschlaege = ids.map((id, i) => ({ id, grund: grounds[i] || '' }));
        if (!vorschlaege.length) throw new Error('JSON konnte nicht geparst werden');
      }
      kiVorschlaegeListe.innerHTML = '';
      const hdr = mk('div', '');
      hdr.style.cssText = 'padding:6px 10px;font-size:11px;font-weight:600;color:var(--tx2);background:var(--bg2);border-bottom:1px solid var(--bord);display:flex;justify-content:space-between;align-items:center;';
      hdr.appendChild(tx('span', '', `✨ ${vorschlaege?.length || 0} KI-Vorschläge`));
      const closeKi = btn('✕', 'btn btn-ghost btn-xs');
      closeKi.onclick = () => { kiVorschlaegeListe.style.display = 'none'; kiVorschlaegeListe.innerHTML = ''; };
      hdr.appendChild(closeKi);
      kiVorschlaegeListe.appendChild(hdr);
      if (!vorschlaege?.length) {
        const hint = tx('div', '', 'Keine Vorschläge – Thema/Intention der Stunde ergänzen?');
        hint.style.cssText = 'padding:12px;color:var(--tx3);font-size:12px;';
        kiVorschlaegeListe.appendChild(hint);
      } else {
        vorschlaege.forEach(v => {
          const mat = MATDB.find(m => m.id === v.id);
          if (!mat) return;

          const card = mk('div', '');
          card.style.cssText = 'border:1px solid var(--bord);border-radius:6px;padding:8px 10px;margin-bottom:6px;background:var(--surf);';

          const inner = mk('div', '');
          inner.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start;';

          // Linke Spalte: Checkbox + Titel + Themen + Badges
          const left = mk('div', '');
          const titleRow = mk('div', '');
          titleRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px;';
          const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = selected.has(mat.id);
          cb.dataset.matId = mat.id;
          cb.onclick = e => e.stopPropagation();
          cb.onchange = () => {
            if (cb.checked) selected.add(mat.id); else selected.delete(mat.id);
            kiBtn.disabled = selected.size === 0;
            kiBtn.textContent = `✨ KI bewertet (${selected.size})`;
          };
          const titleEl = tx('span', '', mat.titel);
          titleEl.style.cssText = 'font-size:13px;font-weight:500;cursor:pointer;text-decoration:underline;text-underline-offset:2px;';
          titleEl.onclick = () => openMatOverlayStandalone(mat);
          titleRow.appendChild(cb); titleRow.appendChild(titleEl);
          left.appendChild(titleRow);

          if (mat.themen?.length) {
            const t = tx('div', '', mat.themen.slice(0,4).join(', '));
            t.style.cssText = 'font-size:11px;color:var(--tx2);margin-bottom:3px;';
            left.appendChild(t);
          }
          const badgeRow = mk('div', ''); badgeRow.style.cssText = 'display:flex;gap:5px;align-items:center;flex-wrap:wrap;';
          const fi = (mat.fach||[]).map(fachIcon).join('');
          if (fi) { const s = tx('span','',fi); s.style.fontSize='13px'; badgeRow.appendChild(s); }
          if (mat.jahrgang?.length) {
            const jg = tx('span','',mat.jahrgang.join('/'));
            jg.style.cssText='font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;background:#f3f4f6;color:#374151;';
            badgeRow.appendChild(jg);
          }
          if (mat.quelle) {
            const q = tx('span','',mat.quelle); q.style.cssText='font-size:10px;color:var(--tx3);';
            badgeRow.appendChild(q);
          }
          left.appendChild(badgeRow);

          // Rechte Spalte: KI-Kommentar
          const right = mk('div', '');
          const grundEl = tx('div', '', v.grund);
          grundEl.style.cssText = 'font-size:12px;color:var(--tx2);font-style:italic;line-height:1.4;';
          right.appendChild(grundEl);

          inner.appendChild(left); inner.appendChild(right);
          card.appendChild(inner);

          // Zuweisen-Button
          const foot = mk('div', ''); foot.style.cssText = 'display:flex;justify-content:flex-end;margin-top:6px;';
          const useBtn = btn('+ Zuweisen', 'btn btn-pri btn-xs');
          useBtn.onclick = () => {
            if (!stunde.materialIds.includes(mat.id)) { stunde.materialIds.push(mat.id); scheduleSave(); renderZugewiesene(); }
            useBtn.textContent = '✓'; useBtn.disabled = true;
          };
          if (stunde.materialIds.includes(mat.id)) { useBtn.textContent = '✓'; useBtn.disabled = true; }
          foot.appendChild(useBtn);
          card.appendChild(foot);

          kiVorschlaegeListe.appendChild(card);
        });
      }
    } catch(e) {
      kiVorschlaegeListe.innerHTML = '';
      const err = tx('div', '', '⚠ Fehler: ' + e.message);
      err.style.cssText = 'padding:12px;color:#dc2626;font-size:12px;';
      kiVorschlaegeListe.appendChild(err);
    }
    kiVorschlBtn.disabled = false; kiVorschlBtn.textContent = '✨ Vorschlagen';
  };

  const ergebnisListe = mk('div', '');
  ergebnisListe.style.cssText = 'max-height:300px;overflow-y:auto;border:1px solid var(--bord);border-radius:6px;';
  const selected = new Set();
  const kiBewertungen = new Map();

  function buildMatRow(mat) {
    const row = mk('div', '');
    row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-bottom:1px solid var(--bord);cursor:pointer;';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = selected.has(mat.id);
    cb.dataset.matId = mat.id;
    cb.style.marginTop = '3px';
    cb.onclick = e => e.stopPropagation();
    cb.onchange = () => { if (cb.checked) selected.add(mat.id); else selected.delete(mat.id); kiBtn.disabled = selected.size === 0; kiBtn.textContent = `✨ KI bewertet (${selected.size})`; };
    const info = mk('div', ''); info.style.flex = '1';
    const titleEl = tx('span', '', mat.titel); titleEl.style.cssText = 'font-size:13px;font-weight:500;display:block;cursor:pointer;text-decoration:underline;text-underline-offset:2px;';
    titleEl.onclick = e => { e.stopPropagation(); openMatOverlayStandalone(mat); };
    info.appendChild(titleEl);
    if (mat.themen?.length) { const t = tx('div', '', mat.themen.slice(0,4).join(', ')); t.style.cssText = 'font-size:11px;color:var(--tx2);'; info.appendChild(t); }
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
    if (kiBewertungen.has(mat.id)) {
      const bew = kiBewertungen.get(mat.id);
      const COL = { gut:'#166534', anpassung:'#92400e', ungeeignet:'#dc2626' };
      const ICO = { gut:'✓ gut', anpassung:'⚠ Anpassung', ungeeignet:'✗ ungeeignet' };
      const kiWrap = mk('div', ''); kiWrap.style.marginTop = '3px';
      const badge = tx('span', '', ICO[bew.bewertung] || bew.bewertung);
      badge.style.cssText = `font-size:11px;font-weight:600;color:${COL[bew.bewertung]||'var(--tx3)'};`;
      kiWrap.appendChild(badge);
      if (bew.hinweis) {
        const hinweis = tx('span', '', ' – ' + bew.hinweis);
        hinweis.style.cssText = 'font-size:11px;color:var(--tx2);font-style:italic;';
        kiWrap.appendChild(hinweis);
      }
      info.appendChild(kiWrap);
    }
    const useBtn = btn('+ Zuweisen', 'btn btn-pri btn-xs');
    useBtn.style.marginTop = '2px';
    useBtn.onclick = e => {
      e.stopPropagation();
      if (!stunde.materialIds.includes(mat.id)) { stunde.materialIds.push(mat.id); scheduleSave(); renderZugewiesene(); }
      useBtn.textContent = '✓'; useBtn.disabled = true;
    };
    if (stunde.materialIds.includes(mat.id)) { useBtn.textContent = '✓'; useBtn.disabled = true; }
    row.onclick = () => { cb.checked = !cb.checked; cb.onchange(); };
    row.appendChild(cb); row.appendChild(info); row.appendChild(useBtn);
    return row;
  }

  function renderErgebnisse() {
    ergebnisListe.innerHTML = '';
    alleCb.checked = false;
    const q = suchInp.value.toLowerCase().trim();
    const EXCL = ['Lehrerhandreichung', 'Lösung'];
    let hits = MATDB.filter(mat => {
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
    // Geschwister: gleiche Quelle oder gleicher Block
    const hitIds = new Set(hits.map(m => m.id));
    const hitQuellen = new Set(hits.map(m => m.quelle).filter(Boolean));
    const hitBlocks = new Set(hits.map(m => m.blockId).filter(Boolean));
    const siblings = MATDB.filter(mat => {
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
    const selMats = [...selected].map(id => MATDB.find(m=>m.id===id)).filter(Boolean);
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

Antworte NUR als JSON-Array:
[{"id":"...","bewertung":"gut"|"anpassung"|"ungeeignet","hinweis":"ein Satz warum / wie anpassen"}]`;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': antKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error?.message || res.statusText);
      const results = JSON.parse((d.content?.[0]?.text||'[]').match(/\[[\s\S]*\]/)?.[0]||'[]');
      results.forEach(r => { if (r.id) kiBewertungen.set(r.id, { bewertung: r.bewertung, hinweis: r.hinweis }); });
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

  matBody.appendChild(sucheWrap);
  matCard.appendChild(matBody);
  grid.appendChild(matCard);

  // ── Planungsrahmen ─────────────────────────────────────────────
  const pr = stunde.planungsrahmen;
  if (!pr.sozialformen) pr.sozialformen = [];
  if (!pr.kiGewählt) pr.kiGewählt = [];

  const prCard = mk('div', 'card');
  const prHdr = cardHdr('Planungsrahmen');

  const prKiBtn = btn('✨ KI wählt', 'btn btn-ki btn-xs');
  prKiBtn.onclick = async () => {
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) { alert('Bitte zuerst Anthropic API-Key hinterlegen.'); return; }
    prKiBtn.textContent = '…'; prKiBtn.disabled = true;

    // Kurs-Ressourcen ermitteln
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

    const lernzieleText = (stunde.lernziele || []).map(z => z.text).join('\n') || '–';

    const prompt = `Du planst eine Unterrichtsstunde und wählst passende Planungsparameter.

Stunde:
- Fach: ${fp.fach || '–'}, Jahrgang: ${fp.jahrgang || '–'}
- Dauer: ${stunde.dauer || 45} Minuten
- Intention: ${stunde.intention || '–'}
- Lernziele: ${lernzieleText}
- Verfügbare Ressourcen: ${resText}

Wähle NUR Parameter, die noch nicht gesetzt sind:
${!pr.sozialformen?.length ? '- sozialformen: Array aus ["Plenum","Partnerarbeit","Gruppenarbeit","Einzelarbeit"]' : ''}
${!pr.schwerpunkt ? '- schwerpunkt: einer von ["Einführung","Erarbeitung","Übung & Festigung","Sicherung","Experiment","Diskussion","Präsentation"]' : ''}
${pr.differenzierung === undefined || pr.differenzierung === null ? '- differenzierung: einer von ["Keine","Leicht (1 Niveau)","Stark (2+ Niveaus)"]' : ''}
${pr.hausaufgaben === undefined || pr.hausaufgaben === null ? '- hausaufgaben: true oder false' : ''}

Antworte NUR als JSON mit den Feldern die du wählst. Keine Zeilenumbrüche in Strings:
{}`;

    try {
      const res2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': antKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res2.json();
      const text = data.content?.[0]?.text || '';
      const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
      const gewählt = [];
      if (parsed.sozialformen?.length && !pr.sozialformen?.length) { pr.sozialformen = parsed.sozialformen; gewählt.push('sozialformen'); }
      if (parsed.schwerpunkt && !pr.schwerpunkt) { pr.schwerpunkt = parsed.schwerpunkt; gewählt.push('schwerpunkt'); }
      if (parsed.differenzierung && pr.differenzierung == null) { pr.differenzierung = parsed.differenzierung; gewählt.push('differenzierung'); }
      if (parsed.hausaufgaben != null && pr.hausaufgaben == null) { pr.hausaufgaben = parsed.hausaufgaben; gewählt.push('hausaufgaben'); }
      pr.kiGewählt = [...new Set([...(pr.kiGewählt || []), ...gewählt])];
      scheduleSave(); render();
    } catch(e) { alert('Fehler: ' + e.message); }
    prKiBtn.textContent = '✨ KI wählt'; prKiBtn.disabled = false;
  };
  prHdr.appendChild(prKiBtn);
  prCard.appendChild(prHdr);

  const prBody = mk('div', 'card-body');

  function prSection(label) {
    const h = tx('div', '', label);
    h.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px;margin-top:4px;';
    prBody.appendChild(h);
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
        // Manuelle Änderung → nicht mehr als KI-gesetzt markieren
        pr.kiGewählt = (pr.kiGewählt || []).filter(k => k !== key);
        scheduleSave(); render();
      };
      wrap.appendChild(b);
    });
    prBody.appendChild(wrap);
  }

  prSection('Sozialformen');
  prChips('sozialformen', ['Plenum', 'Partnerarbeit', 'Gruppenarbeit', 'Einzelarbeit'], true);

  prSection('Schwerpunkt');
  prChips('schwerpunkt', ['Einführung', 'Erarbeitung', 'Übung & Festigung', 'Sicherung', 'Experiment', 'Diskussion', 'Präsentation'], false);

  prSection('Differenzierung');
  prChips('differenzierung', ['Keine', 'Leicht (1 Niveau)', 'Stark (2+ Niveaus)'], false);

  prSection('Hausaufgaben');
  const haWrap = mk('div', 'pr-chip-wrap');
  const kiHa = (pr.kiGewählt || []).includes('hausaufgaben');
  [true, false].forEach(val => {
    const label = val ? 'Ja' : 'Nein';
    const isActive = pr.hausaufgaben === val;
    const b = mk('button', 'btn btn-xs pr-chip' + (isActive ? ' active' : '') + (isActive && kiHa ? ' ki' : ''));
    b.textContent = isActive && kiHa ? '✨ ' + label : label;
    b.onclick = () => { pr.hausaufgaben = isActive ? null : val; pr.kiGewählt = (pr.kiGewählt||[]).filter(k=>k!=='hausaufgaben'); scheduleSave(); render(); };
    haWrap.appendChild(b);
  });
  prBody.appendChild(haWrap);

  prSection('Dauer');
  const dfg = mk('div', 'fg'); dfg.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
  const di = document.createElement('input');
  di.type = 'number'; di.value = stunde.dauer || 45; di.className = 'finp';
  di.style.maxWidth = '100px';
  di.oninput = e => { stunde.dauer = parseInt(e.target.value) || 45; scheduleSave(); };
  dfg.appendChild(di);
  dfg.appendChild(tx('span', '', 'Minuten'));
  prBody.appendChild(dfg);

  prSection('Besondere Hinweise');
  const hinweisTA = document.createElement('textarea');
  hinweisTA.className = 'finp'; hinweisTA.rows = 2; hinweisTA.style.cssText = 'resize:none;font-size:13px;';
  hinweisTA.placeholder = 'z.B. Heute kein Beamer, Max fehlt, Raumwechsel…';
  hinweisTA.value = pr.hinweise || '';
  hinweisTA.oninput = e => { pr.hinweise = e.target.value; scheduleSave(); };
  prBody.appendChild(hinweisTA);

  prCard.appendChild(prBody);
  grid.appendChild(prCard);

  // ── Phasen ─────────────────────────────────────────────────────
  const pc = mk('div', 'card');
  const phdr = cardHdr('Unterrichtsphasen');

  const PHASEN_VORLAGEN = {
    '3-Phasen': [
      { titel: 'Einstieg', minuten: 10 },
      { titel: 'Erarbeitung', minuten: 25 },
      { titel: 'Sicherung', minuten: 10 },
    ],
    'AVIVA': [
      { titel: 'Ankommen & Einstimmen', minuten: 5 },
      { titel: 'Vorwissen aktivieren', minuten: 8 },
      { titel: 'Informieren', minuten: 15 },
      { titel: 'Verarbeiten', minuten: 12 },
      { titel: 'Auswerten', minuten: 5 },
    ],
    'Direkte Instruktion': [
      { titel: 'I do (Modellieren)', minuten: 15 },
      { titel: 'We do (Gemeinsam üben)', minuten: 15 },
      { titel: 'You do (Selbstständig üben)', minuten: 15 },
    ],
    'Forschend-entdeckend': [
      { titel: 'Phänomen / Einstieg', minuten: 8 },
      { titel: 'Hypothesenbildung', minuten: 7 },
      { titel: 'Experiment / Erarbeitung', minuten: 20 },
      { titel: 'Auswertung & Schlussfolgerung', minuten: 10 },
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
      id: uid(), titel: p.titel, inhalt: '', methode: '', sozialform: '', minuten: p.minuten, materialIds: []
    }));
    scheduleSave(); render();
    return true;
  }

  // Modell-Kacheln
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

  // KI-Begruendung anzeigen falls vorhanden
  if (stunde.phasenModellBegruendung) {
    const begr = mk('div', 'modell-ki-begr');
    begr.appendChild(tx('span', 'modell-ki-begr-icon', '✨'));
    begr.appendChild(tx('span', '', stunde.phasenModellBegruendung));
    modellGrid.appendChild(begr);
  }

  pc.appendChild(modellGrid);

  const kiVorlageBtn = btn('✨ KI entscheidet', 'btn btn-ki btn-xs');
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

Didaktisches Hintergrundwissen:
${wissenText}

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

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': antKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1400,
          messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
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
  phdr.appendChild(kiVorlageBtn);

  const apb = btn('+ Phase', 'btn btn-pri btn-xs');
  apb.onclick = () => {
    stunde.phasen.push({ id: uid(), titel: '', inhalt: '', methode: '', sozialform: '', minuten: 0, materialIds: [] });
    scheduleSave(); render();
  };
  phdr.appendChild(apb);
  pc.appendChild(phdr);
  const pb = mk('div', 'card-body');
  pb.appendChild(phasenTable(stunde));
  pc.appendChild(pb);
  grid.appendChild(pc);

  // ── Tafelbild ──────────────────────────────────────────────────
  const tc = mk('div', 'card card-half');
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
  grid.appendChild(tc);

  // ── Lehrerkommentar ────────────────────────────────────────────
  const lc = mk('div', 'card');
  lc.appendChild(cardHdr('Erläuterungen für die Lehrkraft'));
  const lb = mk('div', 'card-body');
  lb.appendChild(fieldArea('', stunde.lehrerkommentar || '',
    v => { stunde.lehrerkommentar = v; scheduleSave(); }, 'min-height:120px;'));
  lc.appendChild(lb);
  grid.appendChild(lc);
}

function viewStunde(fpId, blockId, reiheId, einheitId, stundeId) {
  const fp = getFachplanung(fpId);
  const block = findBlock(fpId, blockId);
  const reihe = findReihe(fpId, blockId, reiheId);
  const einheit = findEinheit(fpId, blockId, reiheId, einheitId);
  const stunde = findStunde(fpId, blockId, reiheId, einheitId, stundeId);
  if (!fp || !block || !reihe || !einheit || !stunde) {
    S.sel = null; render(); return mk('div', '');
  }
  initStunde(stunde);

  const div = mk('div', '');
  div.appendChild(breadcrumb([
    { label: fachLabel(fp.fach) + ' ' + fp.jahrgang, action: () => { S.sel = null; render(); } },
    { label: block.titel, action: () => { S.sel = { type: 'block', ids: [fpId, blockId] }; render(); } },
    { label: reihe.titel, action: () => { S.sel = { type: 'reihe', ids: [fpId, blockId, reiheId] }; render(); } },
    { label: einheit.titel, action: () => { S.sel = { type: 'einheit', ids: [fpId, blockId, reiheId, einheitId] }; render(); } },
  ]));

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', stunde.titel || 'Stunde'));
  left.appendChild(tx('div', 'c-sub', 'Unterrichtsstunde · ' + einheit.titel));
  hdr.appendChild(left);
  const db = btn('🗑 Löschen', 'btn btn-danger btn-sm');
  db.onclick = () => {
    if (confirm('Stunde löschen?')) {
      einheit.stunden = einheit.stunden.filter(s => s.id !== stundeId);
      S.sel = { type: 'einheit', ids: [fpId, blockId, reiheId, einheitId] };
      scheduleSave(); render();
    }
  };
  hdr.appendChild(db);
  div.appendChild(hdr);

  renderStundenBody(div, stunde, fp);
  return div;
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
