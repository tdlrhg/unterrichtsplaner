// ── Materialien-Datenbank ─────────────────────────────────────────
function viewMaterialien() {
  const div = mk('div', '');

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Materialdatenbank'));
  left.appendChild(tx('div', 'c-sub', MATDB.length + ' Einträge'));
  hdr.appendChild(left);

  const hdrBtns = mk('div', ''); hdrBtns.style.cssText = 'display:flex;gap:8px;';

  const schemaBtn = btn('📋 Schema kopieren', 'btn btn-ghost btn-sm');
  schemaBtn.onclick = async () => {
    const schema = await sbDownload('schema.json');
    await navigator.clipboard.writeText(JSON.stringify(schema, null, 2));
    schemaBtn.textContent = '✓ Kopiert!';
    setTimeout(() => { schemaBtn.textContent = '📋 Schema kopieren'; }, 2000);
  };

  const importBtn = btn('📥 Import', 'btn btn-pri btn-sm');
  importBtn.onclick = () => {
    const existing = div.querySelector('.mat-import-panel');
    if (existing) { existing.remove(); return; }
    const panel = mk('div', 'mat-import-panel');
    panel.appendChild(tx('div', 'mat-import-hint',
      'JSON-Eintrag oder Array einfügen (aus KI-generiertem Schema):'));
    const ta = document.createElement('textarea');
    ta.className = 'mat-import-ta'; ta.placeholder = '{ "id": "...", "titel": "...", ... }';
    panel.appendChild(ta);
    const actions = mk('div', ''); actions.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
    const errMsg = tx('span', 'mat-import-err', '');
    const addBtn = btn('Hinzufügen', 'btn btn-pri btn-sm');
    addBtn.onclick = () => {
      errMsg.textContent = '';
      let parsed;
      try { parsed = JSON.parse(ta.value.trim()); } catch { errMsg.textContent = 'Ungültiges JSON.'; return; }
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      const invalid = entries.filter(e => !e.id || !e.titel);
      if (invalid.length) { errMsg.textContent = 'Jeder Eintrag braucht mindestens "id" und "titel".'; return; }
      entries.forEach(e => {
        const existing = MATDB.findIndex(m => m.id === e.id);
        if (existing >= 0) MATDB[existing] = e; else MATDB.push(e);
      });
      saveMatDB();
      panel.remove();
      S.view = 'materialien'; render();
    };
    const cancelBtn2 = btn('Abbrechen', 'btn btn-ghost btn-sm');
    cancelBtn2.onclick = () => panel.remove();
    actions.appendChild(addBtn); actions.appendChild(cancelBtn2); actions.appendChild(errMsg);
    panel.appendChild(actions);
    div.insertBefore(panel, div.children[1]);
  };

  hdrBtns.appendChild(schemaBtn); hdrBtns.appendChild(importBtn);
  hdr.appendChild(hdrBtns);
  div.appendChild(hdr);

  // ── Suchzeile ────────────────────────────────────────────────
  const sf = mk('div', 'card');
  const sb2 = mk('div', 'card-body');
  sb2.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:center;';

  const si = document.createElement('input');
  si.type = 'text'; si.placeholder = 'Suche nach Titel, Fach, Thema…';
  si.className = 'finp'; si.style.flex = '1';

  const fachSel = document.createElement('select');
  fachSel.className = 'finp'; fachSel.style.width = 'auto';
  [['', 'Alle Fächer'], ['Mathematik', 'Mathematik'], ['Chemie', 'Chemie'], ['Biologie', 'Biologie']].forEach(([v, l]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = l;
    fachSel.appendChild(o);
  });

  const typSel = document.createElement('select');
  typSel.className = 'finp'; typSel.style.width = 'auto';
  const typen = ['', ...new Set(MATDB.map(m => m.materialtyp).filter(Boolean))];
  typen.forEach(t => {
    const o = document.createElement('option'); o.value = t; o.textContent = t || 'Alle Typen';
    typSel.appendChild(o);
  });

  sb2.appendChild(si); sb2.appendChild(fachSel); sb2.appendChild(typSel);
  sf.appendChild(sb2);
  div.appendChild(sf);

  // ── Materialliste ─────────────────────────────────────────────
  const listCard = mk('div', 'card');
  const listBody = mk('div', 'card-body'); listBody.style.padding = '0';

  function filteredList() {
    const q = si.value.toLowerCase().trim();
    const fach = fachSel.value;
    const typ = typSel.value;
    return MATDB.filter(m => {
      if (fach && !(m.fach || []).includes(fach)) return false;
      if (typ && m.materialtyp !== typ) return false;
      if (q && !m.titel.toLowerCase().includes(q) &&
               !(m.themen || []).join(' ').toLowerCase().includes(q) &&
               !(m.beschreibung || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderList() {
    listBody.innerHTML = '';
    const hits = filteredList();
    if (!hits.length) {
      const empty = tx('div', '', 'Keine Einträge gefunden.');
      empty.style.cssText = 'padding:20px;color:var(--tx3);text-align:center;';
      listBody.appendChild(empty); return;
    }
    hits.forEach(mat => {
      const row = mk('div', 'mat-db-row');

      const needsReview = mat.review && Object.values(mat.review).some(r => r.needsReview);

      const top = mk('div', 'mat-db-top');
      const titleWrap = mk('div', ''); titleWrap.style.display = 'flex'; titleWrap.style.alignItems = 'center'; titleWrap.style.gap = '6px';
      const fachIcon = (mat.fach || []).map(f => {
        const key = Object.keys(FACH_ICONS).find(k => fachLabel(k) === f || k === f);
        return key ? FACH_ICONS[key] : '';
      }).filter(Boolean).join('');
      if (fachIcon) titleWrap.appendChild(tx('span', 'mat-db-fach-icon', fachIcon));
      titleWrap.appendChild(tx('span', 'mat-db-title', mat.titel));
      if (needsReview) {
        const reviewFields = Object.entries(mat.review || {})
          .filter(([, v]) => v.needsReview)
          .map(([k]) => k).join(', ');
        const badge = tx('span', 'mat-review-badge', '⚠ prüfen');
        badge.title = 'Bitte prüfen: ' + reviewFields;
        titleWrap.appendChild(badge);
      }
      top.appendChild(titleWrap);

      const meta = tx('div', 'mat-db-meta',
        [(mat.fach || []).join(', '), 'Jg. ' + (mat.jahrgang || []).join('/'), mat.materialtyp].filter(Boolean).join(' · ')
      );
      top.appendChild(meta);
      row.appendChild(top);

      if (mat.beschreibung) {
        row.appendChild(tx('div', 'mat-db-desc', mat.beschreibung));
      }

      const tags = mk('div', 'mat-db-tags');
      (mat.themen || []).forEach(t => tags.appendChild(tx('span', 'mat-tag', t)));
      if (tags.children.length) row.appendChild(tags);

      row.onclick = e => { if (!e.target.closest('.mat-detail')) openMatDetail(mat, row); };
      listBody.appendChild(row);
    });
  }

  si.oninput = renderList;
  fachSel.onchange = renderList;
  typSel.onchange = renderList;

  listCard.appendChild(listBody);
  div.appendChild(listCard);
  renderList();

  return div;
}

function saveMatDB() {
  sbUpload('materialien.json', MATDB).catch(e => console.error('Speichern fehlgeschlagen:', e));
}

function klpRow(mat, detail, row) {
  if (!mat.kompetenzenKLP) mat.kompetenzenKLP = [];

  const r = mk('div', 'mat-detail-row');
  r.appendChild(tx('span', 'mat-detail-label', 'KLP-Kompetenzen'));

  const wrap = mk('div', 'klp-selector');

  function rebuildChips() {
    wrap.innerHTML = '';

    // Chips für bereits verknüpfte Kompetenzen
    const chipsDiv = mk('div', 'klp-chips');
    (mat.kompetenzenKLP || []).forEach(id => {
      const entry = KLPDB.find(e => e.id === id);
      const chip = mk('div', 'klp-chip');
      const label = entry
        ? `[${entry.kompetenzcodes.join(', ')}] ${entry.beschreibung.slice(0, 60)}${entry.beschreibung.length > 60 ? '…' : ''}`
        : id;
      chip.textContent = label;
      chip.title = entry ? entry.beschreibung : id;
      const x = tx('span', 'klp-chip-x', '×');
      x.onclick = () => {
        mat.kompetenzenKLP = mat.kompetenzenKLP.filter(i => i !== id);
        saveMatDB();
        rebuildChips();
      };
      chip.appendChild(x);
      chipsDiv.appendChild(chip);
    });
    wrap.appendChild(chipsDiv);

    // Suchfeld
    const searchWrap = mk('div', 'klp-search-wrap');
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'mat-edit-inp';
    inp.placeholder = 'Kompetenz suchen…';
    searchWrap.appendChild(inp);

    const dd = mk('div', 'klp-dd');
    dd.style.display = 'none';
    searchWrap.appendChild(dd);

    function showDropdown(q) {
      dd.innerHTML = '';
      const faecher = mat.fach || [];
      const jahrgaenge = mat.jahrgang || [];

      let hits = KLPDB.filter(e => {
        if (mat.kompetenzenKLP.includes(e.id)) return false;
        if (faecher.length && !faecher.includes(e.fach)) return false;
        if (q.length > 1) {
          const txt = (e.beschreibung + ' ' + e.inhaltsfeld + ' ' + e.kompetenzcodes.join(' ')).toLowerCase();
          if (!txt.includes(q.toLowerCase())) return false;
        }
        return true;
      }).slice(0, 20);

      if (!hits.length) {
        dd.style.display = 'none'; return;
      }

      // Group by inhaltsfeld
      const grouped = {};
      hits.forEach(e => {
        if (!grouped[e.inhaltsfeld]) grouped[e.inhaltsfeld] = [];
        grouped[e.inhaltsfeld].push(e);
      });

      Object.entries(grouped).forEach(([ifName, entries]) => {
        const grpHdr = tx('div', 'klp-dd-group', ifName);
        dd.appendChild(grpHdr);
        entries.forEach(entry => {
          const item = mk('div', 'klp-dd-item');
          const codes = tx('span', 'klp-dd-codes', entry.kompetenzcodes.join(', '));
          const desc = tx('span', 'klp-dd-desc', entry.beschreibung);
          item.appendChild(codes);
          item.appendChild(desc);
          item.title = `Jg. ${entry.jahrgang} · ${entry.inhaltsfeld}`;
          item.onmousedown = e => {
            e.preventDefault();
            mat.kompetenzenKLP.push(entry.id);
            saveMatDB();
            inp.value = '';
            dd.style.display = 'none';
            rebuildChips();
          };
          dd.appendChild(item);
        });
      });
      dd.style.display = 'block';
    }

    inp.oninput = () => showDropdown(inp.value);
    inp.onfocus = () => showDropdown(inp.value);
    inp.onblur = () => setTimeout(() => { dd.style.display = 'none'; }, 150);

    wrap.appendChild(searchWrap);
    r.appendChild(wrap);
  }

  rebuildChips();
  detail.appendChild(r);
}

function openMatDetail(mat, row) {
  const existing = row.querySelector('.mat-detail');
  if (existing) { existing.remove(); return; }

  const detail = mk('div', 'mat-detail');
  detail.onclick = e => e.stopPropagation();

  function editRow(label, get, set, isArea, reviewKey) {
    const needsCheck = reviewKey && mat.review?.[reviewKey]?.needsReview;
    const r = mk('div', 'mat-detail-row' + (needsCheck ? ' needs-review' : ''));
    const lbl = tx('span', 'mat-detail-label', label);
    if (needsCheck) {
      const hint = tx('span', 'mat-review-inline', '⚠');
      hint.title = mat.review[reviewKey].reason || 'Bitte prüfen';
      lbl.appendChild(hint);
    }
    r.appendChild(lbl);
    const val = get();
    function onSave(v) {
      set(v);
      if (reviewKey && mat.review?.[reviewKey]) {
        mat.review[reviewKey].needsReview = false;
        r.classList.remove('needs-review');
        r.querySelector('.mat-review-inline')?.remove();
        const stillAny = Object.values(mat.review).some(rv => rv.needsReview);
        if (!stillAny) row.querySelector('.mat-review-badge')?.remove();
      }
      saveMatDB();
    }
    if (isArea) {
      const ta = document.createElement('textarea');
      ta.className = 'mat-edit-inp'; ta.value = val;
      ta.onblur = () => onSave(ta.value);
      r.appendChild(ta);
    } else {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'mat-edit-inp'; inp.value = val;
      inp.onblur = () => onSave(inp.value);
      r.appendChild(inp);
    }
    detail.appendChild(r);
  }

  function arrGet(key) { return (mat[key] || []).join(', '); }
  function arrSet(key) { return v => { mat[key] = v.split(',').map(s => s.trim()).filter(Boolean); }; }

  editRow('Titel',                () => mat.titel || '',              v => { mat.titel = v; row.querySelector('.mat-db-title').textContent = v; }, false, 'titel');
  editRow('Fach',                 () => arrGet('fach'),               arrSet('fach'),           false, 'fach');
  editRow('Jahrgang',             () => arrGet('jahrgang'),           arrSet('jahrgang'),       false, 'jahrgang');
  editRow('Themen',               () => arrGet('themen'),             arrSet('themen'));
  editRow('Materialtyp',          () => mat.materialtyp || '',        v => { mat.materialtyp = v; });
  editRow('Beschreibung',         () => mat.beschreibung || '',       v => { mat.beschreibung = v; }, true);
  editRow('Unterrichtsphase',       () => arrGet('unterrichtsphase'),           arrSet('unterrichtsphase'),           false, 'unterrichtsphase');
  editRow('Sozialform geeignet',    () => arrGet('sozialformenGeeignet'),        arrSet('sozialformenGeeignet'));
  editRow('Sozialform weniger',     () => arrGet('sozialformenWenigerGeeignet'), arrSet('sozialformenWenigerGeeignet'));
  editRow('Methoden geeignet',      () => arrGet('methodenGeeignet'),            arrSet('methodenGeeignet'));
  editRow('Methoden weniger',       () => arrGet('methodenWenigerGeeignet'),     arrSet('methodenWenigerGeeignet'));
  editRow('Schüleraktivitäten',     () => arrGet('schueleraktivitaeten'),        arrSet('schueleraktivitaeten'));
  editRow('Art der Tätigkeit',      () => arrGet('artDerGeistigenTaetigkeit'),   arrSet('artDerGeistigenTaetigkeit'));
  editRow('Darstellungsformen',     () => arrGet('darstellungsformen'),          arrSet('darstellungsformen'));
  editRow('Fachliche Voraussetzung',() => arrGet('voraussetzungenFachlich'),     arrSet('voraussetzungenFachlich'));
  editRow('Method. Voraussetzung',  () => arrGet('voraussetzungenMethodisch'),   arrSet('voraussetzungenMethodisch'));
  // ── KLP-Kompetenzen (strukturierter Selector) ─────────────────
  klpRow(mat, detail, row);
  editRow('Kognit. Beanspruchung',  () => mat.kognitiveBeanspruchung || '',      v => { mat.kognitiveBeanspruchung = v; });
  editRow('Sprachl. Anforderungen', () => mat.sprachlicheAnforderungen || '',    v => { mat.sprachlicheAnforderungen = v; });
  editRow('Lautstärke',             () => mat.lautstaerke || '',                 v => { mat.lautstaerke = v; });
  editRow('Differenzierung',        () => arrGet('differenzierungsformen'),      arrSet('differenzierungsformen'));
  editRow('Anmerkungen',            () => mat.persoenlicheAnmerkungen || '',   v => { mat.persoenlicheAnmerkungen = v; }, true);

  row.appendChild(detail);
}
