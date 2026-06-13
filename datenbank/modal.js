// ── Gruppen-Modal (alle Teilaufgaben einer Aufgabe) ───────────────
// ── Aufgaben-Modal (Einzelaufgabe ODER Gruppe mit Teilaufgaben) ───
// group: { items:[...], aufgabenstellung? }. items.length>1 → Gruppen-
// Ansicht (Teilaufgaben a/b/c, gemeinsame Grunddaten); sonst flache
// Einzelaufgaben-Ansicht. opts: { mode:'edit'|'create', onRefresh }.
function openTaskModal(group, opts) {
  closeEntryModal();
  opts = opts || {};
  var mode    = opts.mode || 'edit';
  var onDone  = opts.onRefresh;
  var navList = opts.navList || null;
  var navIdx  = opts.navIdx  != null ? opts.navIdx : -1;
  var doSave; // wird weiter unten zugewiesen – navTo nutzt Closure-Referenz
  function navTo(idx) {
    (doSave ? doSave({ noClose: true, silent: true }) : Promise.resolve())
      .catch(function() {})
      .then(function() {
        openTaskModal(navList[idx], { mode: 'edit', onRefresh: onDone, navList: navList, navIdx: idx });
      });
  }
  var items   = (group.items && group.items.length) ? group.items : [{}];
  var isMulti = items.length > 1;
  var ref = Object.assign({}, items[0] || {});
  if (group.aufgabenstellung) ref.aufgabenstellung = group.aufgabenstellung;
  // Neuer Eintrag aus einer Fach-Ansicht → Fach vorbelegen, sonst landet er bei keinem Fach
  if (mode === 'create' && ref.fach == null && DB.fach) ref.fach = DB.fach;

  var overlay = mk('div', 'db-modal-overlay');
  overlay.onclick = function(e) { if (e.target === overlay) closeEntryModal(); };
  _modalOverlay = overlay;
  var modal = mk('div', 'db-modal');
  overlay.appendChild(modal);

  // ── Header ────────────────────────────────────────────────────
  var hdr = mk('div', 'db-modal-hdr');
  var hdrLeft = mk('div', '');
  hdrLeft.style.cssText = 'display:flex;align-items:center;gap:10px;flex:1;min-width:0;';
  if (mode === 'create') {
    hdrLeft.appendChild(tx('div', 'db-modal-title', 'Neuer Eintrag'));
  } else {
    var fiH = fachInfo(ref.fach);
    hdrLeft.appendChild(tx('span', '', fiH.icon));
    var tp = [];
    if (isMulti)            tp.push(grpTypLabel(group));
    if (ref.quelle_name)    tp.push(ref.quelle_name);
    if (ref.seite != null)  tp.push('S. ' + ref.seite);
    if (!isMulti && ref.nr) tp.push('Nr. ' + ref.nr);
    hdrLeft.appendChild(tx('div', 'db-modal-title', tp.join(' · ') || (ref.inhalt || '').slice(0, 70) || 'Eintrag'));
  }
  hdr.appendChild(hdrLeft);
  var hdrRight = mk('div', '');
  hdrRight.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0;';
  if (navList && navList.length > 1) {
    var prevBtn = btn('←', 'btn btn-ghost btn-sm');
    prevBtn.title = 'Vorherige (←)';
    prevBtn.style.cssText += 'padding:3px 9px;';
    if (navIdx <= 0) prevBtn.disabled = true;
    prevBtn.onclick = function() { if (navIdx > 0) navTo(navIdx - 1); };
    var navInfo = tx('span', '', (navIdx + 1) + ' / ' + navList.length);
    navInfo.style.cssText = 'font-size:11px;color:var(--tx3);min-width:32px;text-align:center;';
    var nextBtn = btn('→', 'btn btn-ghost btn-sm');
    nextBtn.title = 'Nächste (→)';
    nextBtn.style.cssText += 'padding:3px 9px;';
    if (navIdx >= navList.length - 1) nextBtn.disabled = true;
    nextBtn.onclick = function() { if (navIdx < navList.length - 1) navTo(navIdx + 1); };
    hdrRight.appendChild(prevBtn);
    hdrRight.appendChild(navInfo);
    hdrRight.appendChild(nextBtn);
    var divider = mk('div', '');
    divider.style.cssText = 'width:1px;height:16px;background:var(--border);margin:0 4px;';
    hdrRight.appendChild(divider);
  }
  var closeBtn = btn('✕', 'btn btn-ghost btn-sm');
  closeBtn.style.cssText += 'font-size:13px;padding:3px 8px;';
  closeBtn.onclick = closeEntryModal;
  hdrRight.appendChild(closeBtn);
  hdr.appendChild(hdrRight);
  modal.appendChild(hdr);

  // ── Tab-Struktur ──────────────────────────────────────────────
  var tabWrap = mk('div', 'db-modal-tabwrap');
  var tabBar  = mk('div', 'db-modal-tabbar');
  var tabBodyEl = mk('div', 'db-modal-tab-body');
  var tabs = [], panes = [];
  ['📋 Grunddaten', '📚 Unterrichtsdaten', '✏️ Prüfungsdaten'].forEach(function(label, idx) {
    var tab = document.createElement('button');
    tab.className = 'db-modal-tab' + (idx === 0 ? ' active' : '');
    tab.textContent = label;
    tab.onclick = function() {
      tabs.forEach(function(t, i) { t.classList.toggle('active', i === idx); });
      panes.forEach(function(p, i) { p.classList.toggle('active', i === idx); });
      // Auto-Resize nachziehen — scrollHeight ist 0, solange Pane display:none war
      panes[idx].querySelectorAll('textarea').forEach(function(t) {
        if (_autoTas.indexOf(t) !== -1) autoResize(t);
      });
    };
    tabs.push(tab); tabBar.appendChild(tab);
  });
  tabWrap.appendChild(tabBar);
  tabWrap.appendChild(tabBodyEl);

  // ── Helfer ────────────────────────────────────────────────────
  function mkL() { return mk('div', 'db-modal-left'); }
  function mkR() { return mk('div', 'db-modal-right'); }
  function sec(parent, title) { parent.appendChild(tx('div', 'db-modal-section-title', title)); }
  function decode(v) { return (v || '').replace(/ \| /g, '\n'); }
  function encode(v) { return v.replace(/\r?\n/g, ' | ').replace(/ \|  \| /g, ' | ').trim() || null; }
  // Anzeige-Beschriftung der Teilaufgaben: fortlaufend a) b) c) nach Position
  // (die gespeicherte nr bleibt unberührt). Ab 26 → aa, ab, …
  function posLetter(i) {
    var s = '';
    do { s = String.fromCharCode(97 + (i % 26)) + s; i = Math.floor(i / 26) - 1; } while (i >= 0);
    return s;
  }
  function autoResize(ta) { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; }
  var _autoTas = [];

  function labeled(label, el) {
    var f = mk('div', 'db-form-field');
    if (label) { var l = document.createElement('label'); l.textContent = label; f.appendChild(l); }
    f.appendChild(el); return f;
  }
  function fieldRow() { return mk('div', 'db-form-row'); }

  // Gemeinsame (data-key) Felder – lesen aus ref, werden beim Speichern auf ALLE Items geschrieben
  function sfld(parent, label, key, type, placeholder) {
    var inp = document.createElement('input');
    inp.className = 'db-form-inp'; inp.type = type || 'text';
    inp.placeholder = placeholder || ''; inp.value = ref[key] != null ? String(ref[key]) : '';
    inp.dataset.key = key;
    parent.appendChild(labeled(label, inp)); return inp;
  }
  function ssel(parent, label, key, optList) {
    var sel = mkSelect(ref[key], optList); sel.dataset.key = key;
    parent.appendChild(labeled(label, sel)); return sel;
  }
  function ssuggest(parent, label, key, placeholder, fetchFn) {
    var inp = sfld(parent, label, key, 'text', placeholder);
    if (fetchFn) attachAutocomplete(inp, fetchFn);
    return inp;
  }

  // Element-Fabriken OHNE data-key → pro Teilaufgabe (in itemFields gespeichert)
  function mkSelect(value, optList) {
    var sel = document.createElement('select'); sel.className = 'db-form-sel';
    [['', '–']].concat(optList).forEach(function(o) {
      var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1];
      if (String(value || '') === o[0]) op.selected = true;
      sel.appendChild(op);
    });
    return sel;
  }
  function mkAutoTA(value, placeholder) {
    var ta = document.createElement('textarea');
    ta.className = 'db-form-textarea'; ta.rows = 1;
    ta.style.resize = 'none'; ta.style.overflowY = 'hidden'; ta.style.minHeight = '0';
    ta.placeholder = placeholder || ''; ta.value = decode(value);
    ta.addEventListener('input', function() { autoResize(ta); });
    _autoTas.push(ta); return ta;
  }

  var NIVEAU_OPTS = [['leicht','▽ leicht'],['mittel','▾ mittel'],['schwer','▼ schwer']];
  var SCHW_OPTS   = [['grundlegend','○ grundlegend (AFB I)'],['standard','◑ standard (AFB II)'],['anspruchsvoll','● anspruchsvoll (AFB III)']];
  var UMFANG_OPTS = [['kurz','kurz (1–2 min)'],['mittel','mittel (3–7 min)'],['lang','lang (8+ min)']];
  var OP_OPTS     = Object.keys(OP_FARBEN2).map(function(k) { return [k, k]; });

  // Pro-Teilaufgabe-Felder, parallel zu items (kein data-key)
  var itemFields = items.map(function(it, i) {
    var themaInp = document.createElement('input');
    themaInp.className = 'db-form-inp'; themaInp.type = 'text';
    themaInp.placeholder = 'z.B. Gleichsetzungsverfahren'; themaInp.value = it.thema || '';
    var chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = !!it.hat_loesung;
    chk.style.cssText = 'width:16px;height:16px;cursor:pointer;accent-color:var(--pri);margin-top:8px;';
    return {
      inhalt:        mkAutoTA(it.inhalt, isMulti ? 'Inhalt Teilaufgabe ' + posLetter(i) : 'Was steht in der Aufgabe?'),
      abbildung:     mkAutoTA(it.abbildung, 'Beschreibung der Abbildung (falls vorhanden)'),
      anforderung:   mkAutoTA(it.anforderung, 'Was sollen Schülerinnen konkret tun?'),
      thema:         themaInp,
      niveau:        mkSelect(it.niveau, NIVEAU_OPTS),
      operator:      mkSelect(it.operator, OP_OPTS),
      schwierigkeit: mkSelect(it.schwierigkeit, SCHW_OPTS),
      umfang:        mkSelect(it.umfang, UMFANG_OPTS),
      hat_loesung:   chk
    };
  });
  function itemHeader(i) {
    var h = tx('div', '', posLetter(i) + ')');
    h.style.cssText = 'font-weight:800;font-size:14px;color:var(--acc,#2563eb);margin-bottom:6px;';
    return h;
  }

  // Einzelne Teilaufgabe löschen: DOM-Blöcke aller Panes merken, beim Klick
  // den Eintrag entfernen (Modal bleibt offen). removed[i]=true → Save überspringt ihn.
  var itemNodes = items.map(function() { return []; });
  var removed   = items.map(function() { return false; });
  function delItemBtn(i) {
    var b = btn('🗑', 'btn btn-ghost btn-sm');
    b.title = 'Teilaufgabe ' + posLetter(i) + ' löschen';
    b.style.cssText += 'color:#ef4444;flex-shrink:0;padding:3px 7px;font-size:12px;';
    b.onclick = async function() {
      if (!confirm('Teilaufgabe ' + posLetter(i) + ') löschen?')) return;
      b.disabled = true;
      try {
        if (items[i].id) await sbDelete('inhalte', items[i].id);
        removed[i] = true;
        itemNodes[i].forEach(function(n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
        if (onDone) onDone();   // Tabelle im Hintergrund aktualisieren
      } catch(e) {
        alert('Fehler beim Löschen: ' + e.message); b.disabled = false;
      }
    };
    return b;
  }

  // Abbildungsbeschreibung pro Teilaufgabe: hinter einem 📷-Symbol ausgelagert,
  // damit die Teilaufgaben kompakt bleiben. Klick öffnet ein kleines Overlay
  // ÜBER dem Aufgaben-Modal (Overlay im Overlay).
  function openAbbOverlay(i, onClose) {
    var ta = itemFields[i].abbildung;
    var ov = mk('div', 'db-modal-overlay');
    ov.style.zIndex = '9500';   // über dem Aufgaben-Modal (9000)
    ov.onclick = function(e) { if (e.target === ov) close(); };

    var box = mk('div', 'db-modal');
    box.style.cssText = 'max-width:600px;height:auto;max-height:80vh;';

    var h = mk('div', 'db-modal-hdr');
    h.appendChild(tx('div', 'db-modal-title', '📷 Abbildung — Teilaufgabe ' + posLetter(i) + ')'));
    var x = btn('✕', 'btn btn-ghost btn-sm');
    x.style.cssText += 'margin-left:auto;font-size:13px;padding:3px 8px;';
    x.onclick = close;
    h.appendChild(x);
    box.appendChild(h);

    var bodyWrap = mk('div', '');
    bodyWrap.style.cssText = 'padding:18px 22px;overflow-y:auto;';
    ta.placeholder = 'Beschreibe die Abbildung dieser Teilaufgabe — z.B. „Zahlenstrahl von -5 bis 5, Punkt bei -3 markiert".';
    ta.style.fontSize = '13px'; ta.style.opacity = '1'; ta.style.minHeight = '120px';
    bodyWrap.appendChild(labeled('Beschreibung der Abbildung (optional)', ta));
    box.appendChild(bodyWrap);

    var f = mk('div', 'db-modal-footer');
    var done = btn('✓ Fertig', 'btn btn-sm'); done.onclick = close;
    f.appendChild(done);
    box.appendChild(f);
    ov.appendChild(box);

    // Escape-Stapelung: äußeren Esc-Handler kurz deaktivieren, eigenen setzen
    var outerEsc = _modalEsc;
    if (outerEsc) document.removeEventListener('keydown', outerEsc);
    function innerEsc(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }
    document.addEventListener('keydown', innerEsc);

    var closed = false;
    function close() {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', innerEsc);
      if (outerEsc) document.addEventListener('keydown', outerEsc);  // äußeren wieder aktiv
      ov.remove();
      if (onClose) onClose();
    }

    document.body.appendChild(ov);
    requestAnimationFrame(function() { autoResize(ta); ta.focus(); });
  }

  function abbBtn(i) {
    var b = btn('📷', 'btn btn-ghost btn-sm');
    b.style.cssText += 'flex-shrink:0;padding:3px 8px;font-size:13px;border-radius:7px;';
    function sync() {
      var v = itemFields[i].abbildung.value.trim();
      b.style.opacity = v ? '1' : '.4';
      b.style.background = v ? 'rgba(15,118,110,.12)' : '';
      b.style.boxShadow  = v ? 'inset 0 0 0 1px var(--pri)' : '';
      b.title = v ? 'Abbildung: ' + v.replace(/ \| /g, ' ').slice(0, 80)
                  : 'Abbildung beschreiben (optional)';
    }
    b.onclick = function() { openAbbOverlay(i, sync); };
    sync();
    return b;
  }

  // ── Pane 0: Grunddaten (gemeinsam) ────────────────────────────
  var p0 = mk('div', 'db-modal-tab-pane split active'); panes.push(p0);
  var R0 = mkR();
  sec(R0, 'Quelle');
  ssel(R0, 'Herkunft', 'quelle_typ', HERKUNFT_OPTS);
  var buchInp = ssuggest(R0, 'Buch / Titel', 'quelle_name', 'z.B. Lambacher Schweizer 7', function() { return suggestBooks(); });
  var kapInp  = ssuggest(R0, 'Kapitel', 'kapitel_titel', 'z.B. IV Lineare Gleichungssysteme', function() { return suggestKapitel(buchInp.value.trim()); });
  ssuggest(R0, 'Unterkapitel', 'uk_titel', 'z.B. Gleichungssysteme grafisch lösen', function() { return suggestUnterkapitel(buchInp.value.trim(), kapInp.value.trim()); });
  var seiteRow = fieldRow();
  sfld(seiteRow, 'Seite', 'seite', 'number', '');
  // Einzelaufgabe: Nr. direkt (data-key 'nr'). Gruppe: Oberaufgabennummer,
  // aus der beim Speichern je Teilaufgabe nr = Obernummer + Buchstabe wird.
  var parentNrInp = null;
  if (!isMulti) {
    sfld(seiteRow, 'Nr.', 'nr', 'text', 'z.B. 7a');
  } else {
    parentNrInp = document.createElement('input');
    parentNrInp.className = 'db-form-inp'; parentNrInp.type = 'text';
    parentNrInp.placeholder = 'z.B. 7'; parentNrInp.value = group.key || '';
    seiteRow.appendChild(labeled('Nr.', parentNrInp));
  }
  R0.appendChild(seiteRow);
  sec(R0, 'Einordnung');
  ssel(R0, 'Fach', 'fach', FAECHER.map(function(f) { return [f.key, f.icon + ' ' + f.label]; }));
  sfld(R0, 'Jahrgang', 'jahrgang', 'number', '5–10');
  ssel(R0, 'Inhaltstyp', 'inhaltstyp', [['aufgabe','📝 Aufgabe'],['lehrtext','📖 Lehrtext'],['hinweis','ℹ️ Erläuterungen/Hinweise']]);
  p0.appendChild(R0);

  var L0 = mkL();
  sec(L0, 'Aufgabe');
  var aufgTA = mkAutoTA(ref.aufgabenstellung, 'Gemeinsamer Text aller Teilaufgaben — leer lassen bei Einzelaufgaben');
  aufgTA.dataset.key = 'aufgabenstellung';
  L0.appendChild(labeled('Aufgabenstellung (gemeinsamer Obersatz)', aufgTA));
  if (isMulti) {
    sec(L0, 'Teilaufgaben');
    items.forEach(function(it, i) {
      // Eine Zeile: Buchstabe · Inhaltsfeld (nimmt Restbreite) · 📷 · 🗑
      var blk = mk('div', '');
      blk.style.cssText = 'display:flex;align-items:flex-start;gap:10px;'
        + 'padding:8px 0 12px;border-bottom:1px solid var(--bord);';

      var letter = tx('div', '', posLetter(i) + ')');
      letter.style.cssText = 'font-weight:800;font-size:19px;color:var(--pri);'
        + 'line-height:1;min-width:22px;flex-shrink:0;padding-top:7px;';
      blk.appendChild(letter);

      var ta = itemFields[i].inhalt;
      ta.style.flex = '1'; ta.style.minWidth = '0';
      blk.appendChild(ta);

      var icons = mk('div', '');
      icons.style.cssText = 'display:flex;gap:6px;flex-shrink:0;padding-top:4px;';
      icons.appendChild(abbBtn(i));       // 📷 Abbildung (ausgelagert ins Overlay)
      icons.appendChild(delItemBtn(i));
      blk.appendChild(icons);

      L0.appendChild(blk);
      itemNodes[i].push(blk);
    });
  } else {
    L0.appendChild(labeled('Inhalt / Aufgabe', itemFields[0].inhalt));
    L0.appendChild(labeled('📷 Abbildung', itemFields[0].abbildung));
  }
  // „+ Teilaufgabe"-Button (nur im Edit-Modus): aktuellen Stand in items[] sichern,
  // leere Teilaufgabe anhängen, Modal mit neuem items[] neu öffnen. Single wird so
  // zur Gruppe mit a/b. Speichern erkennt id-lose Items und insert sie als Sibling.
  if (mode !== 'create') {
    var addItemBtn = btn('+ Teilaufgabe hinzufügen', 'btn btn-ghost btn-sm');
    addItemBtn.style.cssText += 'align-self:flex-start;margin-top:4px;font-size:12px;';
    addItemBtn.onclick = function() {
      // Form-State je Teilaufgabe einsammeln (gelöschte überspringen)
      var snap = items.map(function(it, i) {
        if (removed[i]) return null;
        var f = itemFields[i];
        return Object.assign({}, it, {
          inhalt:        encode(f.inhalt.value),
          abbildung:     encode(f.abbildung.value),
          anforderung:   encode(f.anforderung.value),
          thema:         f.thema.value.trim() || null,
          niveau:        f.niveau.value || null,
          operator:      f.operator.value || null,
          schwierigkeit: f.schwierigkeit.value || null,
          umfang:        f.umfang.value || null,
          hat_loesung:   f.hat_loesung.checked
        });
      }).filter(Boolean);
      // Gemeinsame data-key-Felder einsammeln und auf alle Items anwenden
      var sharedSnap = {};
      tabWrap.querySelectorAll('[data-key]').forEach(function(el) {
        var k = el.dataset.key;
        if (el.type === 'number')          sharedSnap[k] = el.value !== '' ? Number(el.value) : null;
        else if (el.tagName === 'TEXTAREA') sharedSnap[k] = encode(el.value);
        else                                sharedSnap[k] = el.value.trim() || null;
      });
      // Oberaufgabennummer ermitteln: aus dem Gruppen-Feld (Multi) oder dem
      // nr-Feld (Single→Multi). Sie landet im Gruppen-Key, nicht auf den Items.
      var parentNrVal = parentNrInp ? parentNrInp.value.trim()
                      : (sharedSnap.nr != null ? String(sharedSnap.nr).trim() : (group.key || ''));
      delete sharedSnap.nr;
      snap = snap.map(function(it) { return Object.assign({}, it, sharedSnap); });
      // Leere neue Teilaufgabe anhängen (kein id → wird beim Speichern eingefügt)
      snap.push({ gruppen_key: ref.gruppen_key });
      var newGroup = Object.assign({}, group, {
        key: parentNrVal,
        items: snap,
        aufgabenstellung: sharedSnap.aufgabenstellung || group.aufgabenstellung
      });
      openTaskModal(newGroup, opts);
    };
    L0.appendChild(addItemBtn);
  }
  p0.appendChild(L0);
  tabBodyEl.appendChild(p0);

  // ── Pane 1: Unterrichtsdaten (pro Teilaufgabe) ────────────────
  var p1 = mk('div', 'db-modal-tab-pane ' + (isMulti ? 'scroll' : 'split')); panes.push(p1);
  if (isMulti) {
    items.forEach(function(it, i) {
      var blk = mk('div', 'db-group-item-block'); blk.appendChild(itemHeader(i));
      blk.appendChild(labeled('Anforderung', itemFields[i].anforderung));
      var row = fieldRow();
      row.appendChild(labeled('Thema', itemFields[i].thema));
      row.appendChild(labeled('Niveau', itemFields[i].niveau));
      blk.appendChild(row);
      p1.appendChild(blk);
      itemNodes[i].push(blk);
    });
  } else {
    var L1 = mkL();
    sec(L1, 'Anforderung');
    L1.appendChild(labeled('', itemFields[0].anforderung));
    L1.appendChild(labeled('Thema', itemFields[0].thema));
    p1.appendChild(L1);
    var R1 = mkR();
    sec(R1, 'Aufgabenniveau');
    R1.appendChild(labeled('', itemFields[0].niveau));
    p1.appendChild(R1);
  }
  tabBodyEl.appendChild(p1);

  // ── Pane 2: Prüfungsdaten (pro Teilaufgabe) ───────────────────
  var p2 = mk('div', 'db-modal-tab-pane ' + (isMulti ? 'scroll' : 'split')); panes.push(p2);
  if (isMulti) {
    items.forEach(function(it, i) {
      var blk = mk('div', 'db-group-item-block'); blk.appendChild(itemHeader(i));
      var row = fieldRow();
      row.appendChild(labeled('Operator', itemFields[i].operator));
      row.appendChild(labeled('Anforderungsbereich', itemFields[i].schwierigkeit));
      row.appendChild(labeled('Umfang', itemFields[i].umfang));
      row.appendChild(labeled('Mit Lösung', itemFields[i].hat_loesung));
      blk.appendChild(row);
      p2.appendChild(blk);
      itemNodes[i].push(blk);
    });
  } else {
    var L2 = mkL();
    if (ref.inhalt || ref.thema) {
      sec(L2, 'Aufgabe (Referenz)');
      var rt = tx('div', 'db-modal-text', (ref.inhalt || ref.thema || '').slice(0, 400) + ((ref.inhalt || '').length > 400 ? ' …' : ''));
      rt.style.color = 'var(--tx2)'; L2.appendChild(rt);
    }
    p2.appendChild(L2);
    var R2 = mkR();
    sec(R2, 'Klassifikation');
    R2.appendChild(labeled('Operator', itemFields[0].operator));
    R2.appendChild(labeled('Anforderungsbereich', itemFields[0].schwierigkeit));
    R2.appendChild(labeled('Umfang', itemFields[0].umfang));
    R2.appendChild(labeled('Mit Lösung', itemFields[0].hat_loesung));
    p2.appendChild(R2);
  }
  tabBodyEl.appendChild(p2);

  requestAnimationFrame(function() { _autoTas.forEach(autoResize); });
  modal.appendChild(tabWrap);

  // ── Footer ────────────────────────────────────────────────────
  // Primäraktionen links (gut erreichbar), Löschen rechts (destruktiv, aus dem Weg)
  var footer = mk('div', 'db-modal-footer');
  var saveBtn = btn('✓ Speichern', 'btn btn-sm');
  var cancelBtn = btn('Abbrechen', 'btn btn-ghost btn-sm'); cancelBtn.onclick = closeEntryModal;
  footer.appendChild(saveBtn);
  footer.appendChild(cancelBtn);
  function itemPatch(i) {
    var f = itemFields[i];
    var p = {
      inhalt:        encode(f.inhalt.value),
      abbildung:     encode(f.abbildung.value),
      anforderung:   encode(f.anforderung.value),
      thema:         f.thema.value.trim() || null,
      niveau:        f.niveau.value || null,
      operator:      f.operator.value || null,
      schwierigkeit: f.schwierigkeit.value || null,
      umfang:        f.umfang.value || null,
      hat_loesung:   f.hat_loesung.checked
    };
    if (isMulti) {
      var pn = parentNrInp ? parentNrInp.value.trim() : '';
      p.nr = pn ? (pn + posLetter(i)) : null;
    }
    return p;
  }
  // noClose: true → Modal bleibt offen (Navigation); silent: Validierungsfehler nicht als Alert
  doSave = async function(opts) {
    opts = opts || {};
    var shared = {};
    tabWrap.querySelectorAll('[data-key]').forEach(function(el) {
      var k = el.dataset.key;
      if (el.type === 'number')          shared[k] = el.value !== '' ? Number(el.value) : null;
      else if (el.tagName === 'TEXTAREA') shared[k] = encode(el.value);
      else                                shared[k] = el.value.trim() || null;
    });
    if (!isMulti) {
      var probe = Object.assign({}, shared, itemPatch(0));
      if (!probe.inhalt && !probe.thema) {
        if (!opts.silent) alert('Inhalt oder Thema ist erforderlich.');
        return;
      }
    }
    saveBtn.disabled = true; saveBtn.textContent = '⏳ Speichert…';
    try {
      if (mode === 'create') {
        var newRow = Object.assign({ id: 'db_' + Date.now() + '_' + Math.random().toString(36).slice(2), fach: DB.fach }, shared, itemPatch(0));
        await sbInsert('inhalte', [newRow]);
        if (!opts.noClose) { closeEntryModal(); if (onDone) onDone(newRow); }
        else if (onDone) onDone(newRow);
      } else {
        await Promise.all(items.map(function(it, i) {
          if (removed[i]) return null;
          var patch = Object.assign({}, shared, itemPatch(i));
          if (it.id) return sbUpdate('inhalte', it.id, patch);
          var newId = 'db_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6);
          var row = Object.assign({
            id: newId,
            fach: shared.fach || ref.fach || DB.fach,
            gruppen_key: it.gruppen_key || ref.gruppen_key
          }, patch);
          return sbInsert('inhalte', [row]);
        }));
        if (!opts.noClose) { closeEntryModal(); if (onDone) onDone(); }
        else if (onDone) onDone();
      }
    } catch(e) {
      alert('Fehler beim Speichern: ' + e.message);
      saveBtn.disabled = false; saveBtn.textContent = '✓ Speichern';
      throw e;
    }
    saveBtn.disabled = false; saveBtn.textContent = '✓ Speichern';
  };
  saveBtn.onclick = function() { doSave({}); };
  // Löschen-Button rechts (komplette Aufgabe), nur im Edit-Modus
  if (mode !== 'create') {
    var delLabel = isMulti ? '🗑 ' + grpTypLabel(group) + ' komplett löschen' : '🗑 Löschen';
    var delBtn = btn(delLabel, 'btn btn-ghost btn-sm');
    delBtn.style.cssText += 'color:#ef4444;margin-left:auto;';
    delBtn.onclick = async function() {
      var msg = isMulti ? 'Alle ' + items.length + ' Einträge dieser Aufgabe löschen?' : 'Eintrag wirklich löschen?';
      if (!confirm(msg)) return;
      delBtn.disabled = true; delBtn.textContent = '⏳ Löscht…';
      try {
        await Promise.all(items.map(function(it) { return it.id ? sbDelete('inhalte', it.id) : null; }));
        closeEntryModal(); if (onDone) onDone();
      } catch(e) {
        alert('Fehler beim Löschen: ' + e.message);
        delBtn.disabled = false; delBtn.textContent = delLabel;
      }
    };
    footer.appendChild(delBtn);
  }
  modal.appendChild(footer);

  document.body.appendChild(overlay);
  function onEsc(e) {
    if (e.key === 'Escape') { closeEntryModal(); return; }
    if (navList && navList.length > 1) {
      var el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (e.key === 'ArrowLeft'  && navIdx > 0)                  { e.preventDefault(); navTo(navIdx - 1); }
      if (e.key === 'ArrowRight' && navIdx < navList.length - 1) { e.preventDefault(); navTo(navIdx + 1); }
    }
  }
  _modalEsc = onEsc;
  document.addEventListener('keydown', onEsc);
}

// ── Gruppen-Modal (alle Teilaufgaben einer Aufgabe) ───────────────
function openGroupModal(group, onRefresh, navList, navIdx) {
  openTaskModal(group, { mode: 'edit', onRefresh: onRefresh, navList: navList, navIdx: navIdx });
}

// ── Entry-Modal ───────────────────────────────────────────────────
var _modalOverlay = null;
var _modalEsc = null;

function closeEntryModal() {
  if (_modalOverlay) { _modalOverlay.remove(); _modalOverlay = null; }
  if (_modalEsc) { document.removeEventListener('keydown', _modalEsc); _modalEsc = null; }
}

function openEntryModal(entry, mode, onSaved) {
  var item = entry || {};
  var parentNr = item.nr ? String(item.nr).replace(/[a-zA-Z]+$/, '').trim() || String(item.nr) : '';
  openTaskModal(
    { key: parentNr, gruppen_key: item.gruppen_key, items: [item], aufgabenstellung: item.aufgabenstellung },
    { mode: mode || 'edit', onRefresh: onSaved }
  );
}

