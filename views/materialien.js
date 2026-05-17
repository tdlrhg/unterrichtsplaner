// ── Materialien-Datenbank ─────────────────────────────────────────
function viewMaterialien() {
  const div = mk('div', '');

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Materialdatenbank'));
  left.appendChild(tx('div', 'c-sub', MATDB.length + ' Einträge'));
  hdr.appendChild(left);
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
        const badge = tx('span', 'mat-review-badge', '⚠ prüfen');
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

function openMatDetail(mat, row) {
  const existing = row.querySelector('.mat-detail');
  if (existing) { existing.remove(); return; }

  const detail = mk('div', 'mat-detail');
  detail.onclick = e => e.stopPropagation();

  function editRow(label, get, set, isArea) {
    const r = mk('div', 'mat-detail-row');
    r.appendChild(tx('span', 'mat-detail-label', label));
    const val = get();
    if (isArea) {
      const ta = document.createElement('textarea');
      ta.className = 'mat-edit-inp'; ta.value = val;
      ta.onblur = () => { set(ta.value); saveMatDB(); };
      r.appendChild(ta);
    } else {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'mat-edit-inp'; inp.value = val;
      inp.onblur = () => { set(inp.value); saveMatDB(); };
      r.appendChild(inp);
    }
    detail.appendChild(r);
  }

  function arrGet(key) { return (mat[key] || []).join(', '); }
  function arrSet(key) { return v => { mat[key] = v.split(',').map(s => s.trim()).filter(Boolean); }; }

  editRow('Titel',                () => mat.titel || '',              v => { mat.titel = v; row.querySelector('.mat-db-title').textContent = v; });
  editRow('Fach',                 () => arrGet('fach'),               arrSet('fach'));
  editRow('Jahrgang',             () => arrGet('jahrgang'),           arrSet('jahrgang'));
  editRow('Themen',               () => arrGet('themen'),             arrSet('themen'));
  editRow('Materialtyp',          () => mat.materialtyp || '',        v => { mat.materialtyp = v; });
  editRow('Beschreibung',         () => mat.beschreibung || '',       v => { mat.beschreibung = v; }, true);
  editRow('Unterrichtsphase',       () => arrGet('unterrichtsphase'),         arrSet('unterrichtsphase'));
  editRow('Sozialform geeignet',    () => arrGet('sozialformenGeeignet'),      arrSet('sozialformenGeeignet'));
  editRow('Sozialform weniger',     () => arrGet('sozialformenWenigerGeeignet'), arrSet('sozialformenWenigerGeeignet'));
  editRow('Methoden geeignet',      () => arrGet('methodenGeeignet'),          arrSet('methodenGeeignet'));
  editRow('Methoden weniger',       () => arrGet('methodenWenigerGeeignet'),   arrSet('methodenWenigerGeeignet'));
  editRow('Schüleraktivitäten',     () => arrGet('schueleraktivitaeten'),      arrSet('schueleraktivitaeten'));
  editRow('Art der Tätigkeit',      () => arrGet('artDerGeistigenTaetigkeit'), arrSet('artDerGeistigenTaetigkeit'));
  editRow('Darstellungsformen',     () => arrGet('darstellungsformen'),        arrSet('darstellungsformen'));
  editRow('Fachliche Voraussetzung',() => arrGet('voraussetzungenFachlich'),   arrSet('voraussetzungenFachlich'));
  editRow('Method. Voraussetzung',  () => arrGet('voraussetzungenMethodisch'), arrSet('voraussetzungenMethodisch'));
  editRow('Kognit. Beanspruchung',  () => mat.kognitiveBeanspruchung || '',    v => { mat.kognitiveBeanspruchung = v; });
  editRow('Sprachl. Anforderungen', () => mat.sprachlicheAnforderungen || '',  v => { mat.sprachlicheAnforderungen = v; });
  editRow('Lautstärke',             () => mat.lautstaerke || '',               v => { mat.lautstaerke = v; });
  editRow('Differenzierung',        () => arrGet('differenzierungsformen'),    arrSet('differenzierungsformen'));
  editRow('Anmerkungen',            () => mat.persoenlicheAnmerkungen || '',   v => { mat.persoenlicheAnmerkungen = v; }, true);

  row.appendChild(detail);
}
