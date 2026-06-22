// ── Filter-Leiste ─────────────────────────────────────────────────

function buildFilterBar(containerEl, loadFn, searchInp, fach) {
  containerEl.innerHTML = '';
  const bar = mk('div', 'db-filter-bar');

  function refresh() { loadFn(); buildFilterBar(containerEl, loadFn, searchInp, fach); }

  // Suchfeld + Seitenfilter
  if (searchInp) bar.appendChild(searchInp);

  var seiteInp = document.createElement('input');
  seiteInp.type = 'number'; seiteInp.placeholder = 'S.';
  seiteInp.title = 'Nach Seite filtern';
  seiteInp.value = DB.seite != null ? DB.seite : '';
  seiteInp.style.cssText = 'width:52px;flex-shrink:0;font-size:12px;padding:3px 6px;height:28px;border:1px solid var(--bord);border-radius:6px;background:var(--surf);color:var(--tx1);';
  var _seiteDebounce;
  seiteInp.oninput = function() {
    clearTimeout(_seiteDebounce);
    _seiteDebounce = setTimeout(function() {
      var v = seiteInp.value.trim();
      DB.seite = v !== '' ? Number(v) : null;
      DB.offset = 0;
      loadFn(); // kein rebuild der Filterleiste — sonst geht Fokus verloren
    }, 400);
  };
  bar.appendChild(seiteInp);
  bar.appendChild(mk('div', 'db-filter-sep'));

  function fchipGroup(opts, dbKey) {
    const g = mk('div', 'db-filter-group');
    opts.forEach(function(opt) {
      const active = DB[dbKey] === opt.val;
      const chip = mk('div', 'db-fchip' + (active ? ' on' : ''));
      var _chipIc = mkTypIconEl(opt.val, 12);
      if (_chipIc) { _chipIc.style.marginRight = '3px'; chip.appendChild(_chipIc); }
      chip.appendChild(document.createTextNode(opt.label));
      if (active && opt.color) {
        chip.style.cssText = 'background:' + opt.color + '18;color:' + opt.color + ';border-color:' + opt.color + '60;';
      }
      chip.onclick = function() {
        DB[dbKey] = (DB[dbKey] === opt.val) ? null : opt.val;
        DB.offset = 0;
        refresh();
      };
      g.appendChild(chip);
    });
    return g;
  }

  function sep() {
    const s = mk('div', 'db-filter-sep');
    return s;
  }

  // Schulbuch-Dropdown
  var buchSel = document.createElement('select');
  buchSel.className = 'db-filter-sel';
  var buchOptDefault = document.createElement('option');
  buchOptDefault.value = ''; buchOptDefault.textContent = '📖 Werk';
  buchSel.appendChild(buchOptDefault);
  buchSel.onchange = function() {
    DB.quelle_name = buchSel.value || null;
    DB.quelle_typ = null;
    DB.kapitel = null; DB.uk_titel = null;
    DB.offset = 0; refresh();
  };
  // Bücher laden (gecacht pro Fach)
  function populateBuchSel(books) {
    books.forEach(function(b) {
      var o = document.createElement('option');
      o.value = b; o.textContent = b;
      if (DB.quelle_name === b) o.selected = true;
      buchSel.appendChild(o);
    });
    if (DB.quelle_name) buchSel.value = DB.quelle_name;
  }
  if (fach) {
    sbSelectAll('inhalte', { select: 'quelle_name', filters: { fach: fach }, order: 'quelle_name' })
      .then(function(rows) {
        var seen = {}, books = [];
        rows.forEach(function(r) { if (r.quelle_name && !seen[r.quelle_name]) { seen[r.quelle_name] = true; books.push(r.quelle_name); } });
        books.sort();
        populateBuchSel(books);
      });
  }
  bar.appendChild(buchSel);

  // Kapitel-Dropdown (nur wenn Werk gewählt)
  if (DB.quelle_name && fach) {
    var kapSel = document.createElement('select');
    kapSel.className = 'db-filter-sel';
    var kapDef = document.createElement('option'); kapDef.value = ''; kapDef.textContent = 'Kapitel';
    kapSel.appendChild(kapDef);
    kapSel.onchange = function() {
      DB.kapitel = kapSel.value || null; DB.uk_titel = null; DB.seite = null; DB.offset = 0; refresh();
    };
    sbSelect('inhalte', { select: 'kapitel', filters: { fach: fach, quelle_name: DB.quelle_name }, limit: 1000 })
      .then(function(rows) {
        var seen = {}, kaps = [];
        rows.forEach(function(r) { if (r.kapitel && !seen[r.kapitel]) { seen[r.kapitel] = true; kaps.push(r.kapitel); } });
        kaps.sort();
        kaps.forEach(function(k) {
          var o = document.createElement('option'); o.value = k; o.textContent = k;
          if (DB.kapitel === k) o.selected = true;
          kapSel.appendChild(o);
        });
      });
    bar.appendChild(kapSel);
  }

  // Unterkapitel-Dropdown (nur wenn Kapitel gewählt)
  if (DB.kapitel && fach) {
    var ukSel = document.createElement('select');
    ukSel.className = 'db-filter-sel';
    var ukDef = document.createElement('option'); ukDef.value = ''; ukDef.textContent = 'Unterkapitel';
    ukSel.appendChild(ukDef);
    ukSel.onchange = function() {
      DB.uk_titel = ukSel.value || null; DB.seite = null; DB.offset = 0; refresh();
    };
    sbSelect('inhalte', { select: 'uk_titel', filters: { fach: fach, quelle_name: DB.quelle_name, kapitel: DB.kapitel }, limit: 500 })
      .then(function(rows) {
        var seen = {}, uks = [];
        rows.forEach(function(r) { if (r.uk_titel && !seen[r.uk_titel]) { seen[r.uk_titel] = true; uks.push(r.uk_titel); } });
        uks.sort();
        uks.forEach(function(u) {
          var o = document.createElement('option'); o.value = u; o.textContent = u;
          if (DB.uk_titel === u) o.selected = true;
          ukSel.appendChild(o);
        });
        if (!uks.length) ukSel.style.display = 'none'; // verstecken wenn keine Unterkapitel vorhanden
      });
    bar.appendChild(ukSel);
  }

  // Herkunft-Chips (Schulbuch ist die Standardansicht → kein eigener Chip)
  var herkGroup = mk('div', 'db-filter-group');
  ['handreichung', 'aufgabenpool', 'materialset', 'eigenmaterial'].forEach(function(hk) {
    var meta = HERKUNFT[hk];
    var active = DB.quelle_typ === hk;
    var chip = tx('div', 'db-fchip' + (active ? ' on' : ''), meta.icon + ' ' + meta.label);
    if (active) chip.style.cssText = 'background:' + meta.color + '18;color:' + meta.color + ';border-color:' + meta.color + '60;';
    chip.onclick = function() {
      DB.quelle_typ = active ? null : hk;
      DB.quelle_name = null;
      DB.offset = 0; refresh();
    };
    herkGroup.appendChild(chip);
  });
  bar.appendChild(herkGroup);

  bar.appendChild(sep());

  // Anforderungsbereich (NRW AFB I–III)
  bar.appendChild(fchipGroup([
    { val: 'grundlegend',   label: '○ AFB I',   color: SCHW_FARBEN.grundlegend },
    { val: 'standard',      label: '◑ AFB II',  color: SCHW_FARBEN.standard },
    { val: 'anspruchsvoll', label: '● AFB III', color: SCHW_FARBEN.anspruchsvoll },
  ], 'schwierigkeit'));

  bar.appendChild(sep());

  // Aufgabenniveau
  bar.appendChild(fchipGroup([
    { val: 'leicht',  label: '▽ leicht',  color: NIVEAU_FARBEN.leicht },
    { val: 'mittel',  label: '▾ mittel',  color: NIVEAU_FARBEN.mittel },
    { val: 'schwer',  label: '▼ schwer',  color: NIVEAU_FARBEN.schwer },
  ], 'niveau'));

  bar.appendChild(sep());

  // Inhaltstyp
  bar.appendChild(fchipGroup([
    { val: 'aufgabe',         label: '📝 Aufgabe',          color: TYP_FARBEN.aufgabe },
    { val: 'lehrtext',        label: '📖 Lehrtext',         color: TYP_FARBEN.lehrtext },
    { val: 'arbeitsblatt',    label: '📋 Arbeitsblatt',     color: TYP_FARBEN.arbeitsblatt },
    { val: 'loesung',         label: '✅ Lösung',           color: TYP_FARBEN.loesung },
    { val: 'lehrerkommentar', label: 'Lehrerkommentar', color: TYP_FARBEN.lehrerkommentar },
    { val: 'lzk',             label: '📝 Lernzielkontrolle',color: TYP_FARBEN.lzk },
    { val: 'infotext',        label: 'ℹ️ Infotext',          color: TYP_FARBEN.infotext },
    { val: 'methode',         label: '🔧 Methode',           color: TYP_FARBEN.methode },
  ], 'inhaltstyp'));

  // Filter löschen (nur wenn aktiv)
  var anyActive = DB.quelle_name || DB.quelle_typ || DB.schwierigkeit || DB.niveau || DB.inhaltstyp || DB.umfang || DB.jahrgang || DB.kapitel || DB.uk_titel || DB.seite != null;
  if (anyActive) {
    bar.appendChild(sep());
    const clrBtn = btn('✕ Filter', 'btn btn-ghost btn-sm');
    clrBtn.style.cssText += 'font-size:10.5px;padding:2px 8px;color:var(--tx3);';
    clrBtn.onclick = function() {
      resetFilters();
      refresh();
    };
    bar.appendChild(clrBtn);
  }

  containerEl.appendChild(bar);
}
