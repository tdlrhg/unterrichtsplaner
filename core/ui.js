
// ── Fachschlüssel übersetzen ─────────────────────────────────────
// Der Unterrichtsplaner führt Fächer als Kürzel (M, Ch, Ch_GK, Bio, Bio_LK …),
// die Materialdatenbank als ausgeschriebene Schlüssel (mathe, chemie, bio).
// Ohne Übersetzung liefert jede Materialabfrage aus der Planung heraus null
// Treffer — die Filter greifen dann auf einen Wert, den es dort nie gibt.
function fachKeyFuerDatenbank(fach) {
  const f = (fach || '').toLowerCase();
  if (f.startsWith('m'))   return 'mathe';
  if (f.startsWith('ch'))  return 'chemie';
  if (f.startsWith('bio')) return 'bio';
  return null;   // unbekannt: lieber ohne Fachfilter suchen als nichts finden
}

// ── Formate ──────────────────────────────────────────────────────
// Quer zur didaktischen Typologie: Ein Domino ist funktional ein
// Anwenden-Format und der Form nach ein Spiel. Die Liste ist erweiterbar,
// ohne dass dafür eine neue Spalte nötig wird.
const FORMATE = ['Spiel', 'Rätsel', 'Experiment', 'Wettbewerb'];
// 🧪 ist als Fach-Symbol für Chemie vergeben, 🔬 für das Phasenmodell
// „Forschend-entdeckend" — deshalb 🥽 für das Format Experiment.
const FORMAT_ICON = { 'Spiel': '🎲', 'Rätsel': '🧩', 'Experiment': '🥽', 'Wettbewerb': '🏆' };

// Symbole für eine Formatliste, z.B. "🎲 🧩 "
function formatIcons(formate) {
  if (!Array.isArray(formate) || !formate.length) return '';
  return formate.map(function(f) { return FORMAT_ICON[f] || ''; }).filter(Boolean).join(' ') + ' ';
}

// ── Fach-Symbol ──────────────────────────────────────────────────
function fachIcon(f) {
  const l = (f || '').toLowerCase();
  if (l.includes('bio')) return '🌿';
  if (l.includes('chem') || l === 'ch') return '🧪';
  if (l.includes('math') || l === 'mathe' || l === 'm') return '📐';
  return '📚';
}

// ── DOM helpers ──────────────────────────────────────────────────
function mk(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function tx(tag, cls, text) {
  const e = mk(tag, cls);
  e.textContent = text;
  return e;
}

function btn(text, cls, style) {
  const b = mk('button', cls);
  b.textContent = text;
  if (style) b.style.cssText = style;
  return b;
}

// ── App-Navigation (alle drei Seiten, feste Reihenfolge) ─────────
function buildAppNav(current) {
  const nav = mk('div', 'topbar-nav');
  [
    { key: 'up', label: '📐 Unterrichtsplaner', href: 'index.html' },
    { key: 'pr', label: '📋 Prüfungsplaner',    href: 'pruefung.html' },
    { key: 'db', label: '📚 Datenbank',          href: 'datenbank.html' },
    { key: 'dok', label: '📄 Dokumente',        href: 'dokument.html' },
  ].forEach(function(item) {
    if (item.key === current) {
      nav.appendChild(tx('span', 'topbar-nav-current', item.label));
    } else {
      const a = mk('a', 'topbar-nav-link');
      a.href = item.href;
      a.textContent = item.label;
      nav.appendChild(a);
    }
  });
  return nav;
}

// ── Aufgaben-Gruppierung ──────────────────────────────────────────
// Gruppiert Zeilen nach führender Nummer: "8a","8b" → Gruppe "8"; "9" → Gruppe "9"
function dbGroupByParent(rows) {
  var groups = {}, order = [];
  rows.forEach(function(r) {
    var _nr = String(r.nr || ''); var _m = _nr.match(/^(.*\d)[a-zA-Z]+$/);
    var parentNr = (_m ? _m[1] : _nr).trim() || '?';
    var isMat = r.quelle_typ === 'materialset' || r.quelle_typ === 'handreichung';
    var key;
    if (isMat) {
      // Normiere auf M-Nummer: "Lösung M 1", "M 1a" → alle in Gruppe "M 1"
      var _mNum = _nr.match(/\b(M\s*\d+)/i);
      if (_mNum) {
        parentNr = _mNum[1].replace(/M\s*(\d+)/i, 'M $1');
        key = (r.quelle_name || '') + '||mat||' + parentNr;
      } else if (r.quelle_typ === 'handreichung') {
        // Zeitschriften/Handreichungen: nach Artikeltitel (nr) gruppieren, nicht nach Seite
        key = (r.quelle_name || '') + '||hand||' + parentNr;
      } else {
        key = r.gruppen_key || ((r.quelle_name || '') + '|' + (r.seite != null ? r.seite : '') + '|' + parentNr);
      }
    } else if (_m && !(r.gruppen_key && /^dup_/.test(r.gruppen_key))) {
      key = (r.quelle_name || '') + '||' + (r.kapitel || '') + '||' + (r.uk_titel || '') + '||' + parentNr;
    } else {
      key = r.gruppen_key || ((r.quelle_name || '') + '|' + (r.seite != null ? r.seite : '') + '|' + parentNr);
    }
    if (!groups[key]) { groups[key] = { key: parentNr, gruppen_key: key, aufgabenstellung: null, items: [] }; order.push(key); }
    if (!groups[key].aufgabenstellung && r.aufgabenstellung) groups[key].aufgabenstellung = r.aufgabenstellung;
    groups[key].items.push(r);
  });
  return order.map(function(k) { return groups[k]; });
}

function cardHdr(title) {
  const h = mk('div', 'card-hdr');
  h.appendChild(tx('div', 'card-title', title));
  return h;
}

function gray(text) {
  const d = tx('div', '', text);
  d.style.color = 'var(--tx3)';
  return d;
}

function cancelBtn() {
  const b = btn('Abbrechen', 'btn btn-ghost');
  b.onclick = () => { S.modal = null; render(); };
  return b;
}

function modalInput(id, label, placeholder, val = '', type = 'text') {
  const fg = mk('div', 'fg');
  if (label) fg.appendChild(tx('label', 'fl', label));
  const i = document.createElement('input');
  i.type = type; i.id = id; i.placeholder = placeholder;
  i.value = val; i.className = 'finp';
  fg.appendChild(i);
  return fg;
}

function modalTextarea(id, label, placeholder, val = '') {
  const fg = mk('div', 'fg');
  if (label) fg.appendChild(tx('label', 'fl', label));
  const ta = document.createElement('textarea');
  ta.id = id; ta.placeholder = placeholder;
  ta.value = val; ta.className = 'finp';
  ta.rows = 4; ta.style.resize = 'vertical';
  fg.appendChild(ta);
  return fg;
}

function modalSelect(id, label, options, selected = '') {
  const fg = mk('div', 'fg');
  if (label) fg.appendChild(tx('label', 'fl', label));
  const s = document.createElement('select');
  s.id = id; s.className = 'finp';
  options.forEach(([val, lbl]) => {
    const o = document.createElement('option');
    o.value = val; o.textContent = lbl;
    if (val === selected) o.selected = true;
    s.appendChild(o);
  });
  fg.appendChild(s);
  return fg;
}

function fieldInput(label, val, onChange) {
  const fg = mk('div', 'fg');
  if (label) fg.appendChild(tx('label', 'fl', label));
  const i = document.createElement('input');
  i.type = 'text'; i.value = val; i.className = 'finp';
  i.oninput = e => onChange(e.target.value);
  fg.appendChild(i);
  return fg;
}

function fieldArea(label, val, onChange, extraStyle = '', placeholder = '') {
  const fg = mk('div', 'fg');
  if (label) fg.appendChild(tx('label', 'fl', label));
  const ta = document.createElement('textarea');
  ta.className = 'finp'; ta.value = val;
  if (extraStyle) ta.style.cssText = extraStyle;
  if (placeholder) ta.placeholder = placeholder;
  ta.oninput = e => onChange(e.target.value);
  fg.appendChild(ta);
  return fg;
}

function breadcrumb(items) {
  const bc = mk('div', 'bc');
  items.forEach((item, i) => {
    const sp = tx('span', 'bc-link', item.label);
    sp.onclick = item.action;
    bc.appendChild(sp);
    if (i < items.length - 1) bc.appendChild(tx('span', 'bc-sep', '›'));
  });
  return bc;
}

// ── Phasen table ─────────────────────────────────────────────────
function phasenTable(stunde) {
  if (!stunde.phasen) stunde.phasen = [];

  const wrap = mk('div', '');
  wrap.style.overflowX = 'auto';

  const tbl = document.createElement('table');
  tbl.className = 'ph-table';

  const PHASEN_TYP_FARBE = { Einstieg: '#3b82f6', Erarbeitung: '#10b981', Sicherung: '#f59e0b' };
  const PHASEN_TYPEN = ['Einstieg', 'Erarbeitung', 'Sicherung'];

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['#', 'Typ', 'Titel / Inhalt', 'Methode', 'Sozialform', 'Min.', 'Material', ''].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');

  function rebuildRow(phase, i) {
    const tr = document.createElement('tr');

    // Nr
    const tnr = document.createElement('td');
    tnr.style.cssText = 'width:30px;text-align:center;font-weight:700;color:var(--tx3);font-size:12px;';
    tnr.textContent = i + 1;
    tr.appendChild(tnr);

    // Typ-Badge (Einstieg / Erarbeitung / Sicherung)
    const ttyp = document.createElement('td');
    ttyp.style.cssText = 'width:90px;vertical-align:top;padding-top:6px;';
    const typSel = document.createElement('select');
    typSel.style.cssText = 'border:none;background:transparent;font-size:11px;font-weight:700;width:90px;cursor:pointer;';
    const emptyOpt = document.createElement('option');
    emptyOpt.value = ''; emptyOpt.textContent = '–';
    typSel.appendChild(emptyOpt);
    PHASEN_TYPEN.forEach(t => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      if (phase.typ === t) o.selected = true;
      typSel.appendChild(o);
    });
    typSel.onchange = () => { phase.typ = typSel.value; scheduleSave(); renderMethCell(); };
    const farbe = PHASEN_TYP_FARBE[phase.typ] || 'var(--tx3)';
    typSel.style.color = farbe;
    typSel.addEventListener('change', () => { typSel.style.color = PHASEN_TYP_FARBE[phase.typ] || 'var(--tx3)'; });
    ttyp.appendChild(typSel);
    tr.appendChild(ttyp);

    // Titel + Inhalt
    const ti = document.createElement('td');
    ti.style.minWidth = '340px';   // die breiteste Spalte — hier steht der Verlauf
    const titI = document.createElement('input');
    titI.type = 'text'; titI.value = phase.titel || ''; titI.placeholder = 'Titel';
    titI.style.cssText = 'border:none;background:transparent;font-size:13px;width:100%;font-family:inherit;display:block;font-weight:600;';
    titI.oninput = e => { phase.titel = e.target.value; scheduleSave(); };
    const inhTA = document.createElement('textarea');
    inhTA.value = phase.inhalt || ''; inhTA.placeholder = 'Inhalt / Aktivität…';
    inhTA.style.cssText = 'border:none;background:transparent;font-size:13px;width:100%;font-family:inherit;resize:none;display:block;overflow:hidden;line-height:1.45;';
    // Mitwachsen statt Rollbalken: In einem 40px hohen Feld war vom Verlauf
    // nur die erste Zeile zu sehen, der Rest verschwand hinter der Bildlaufleiste.
    const inhWachsen = () => {
      inhTA.style.height = 'auto';
      inhTA.style.height = Math.max(38, inhTA.scrollHeight + 2) + 'px';
    };
    inhTA.oninput = e => { phase.inhalt = e.target.value; inhWachsen(); scheduleSave(); };
    setTimeout(inhWachsen, 0);
    ti.appendChild(titI); ti.appendChild(inhTA);
    tr.appendChild(ti);

    // Methode (aus METHDB, gefiltert nach Phasentyp)
    const tm = document.createElement('td');
    tm.style.minWidth = '160px';

    function renderMethCell() {
      tm.innerHTML = '';
      // Aktuelle Methode anzeigen
      if (phase.methodeId) {
        const mObj = METHDB.find(m => m.id === phase.methodeId);
        const nameDiv = mk('div', 'ph-meth-set');
        nameDiv.appendChild(tx('span', '', mObj ? mObj.name : phase.methode || '?'));
        const clr = mk('span', 'ph-meth-clr'); clr.textContent = '✕';
        clr.onclick = () => { phase.methodeId = null; phase.methode = ''; scheduleSave(); renderMethCell(); };
        nameDiv.appendChild(clr);
        tm.appendChild(nameDiv);
        return;
      }

      const wrap = mk('div', 'mat-cell'); // recycle same search-dropdown pattern
      const searchWrap = mk('div', 'mat-search-wrap');
      const si = document.createElement('input');
      si.type = 'text';
      si.placeholder = phase.methode || '+ Methode…';
      si.className = 'mat-search-inp';
      const dd = mk('div', 'mat-dd');

      si.oninput = () => {
        const q = si.value.toLowerCase().trim();
        dd.innerHTML = ''; dd.style.display = 'none';
        // Pool: wenn Typ gesetzt → METHDB gefiltert; sonst alles; Fallback: METHODEN-Liste
        let pool = METHDB.length ? METHDB : METHODEN.map(n => ({ id: null, name: n, phasen: [], beschreibung: '' }));
        if (phase.typ) pool = pool.filter(m => !m.phasen?.length || m.phasen.includes(phase.typ));
        if (q) pool = pool.filter(m => m.name.toLowerCase().includes(q) || (m.beschreibung||'').toLowerCase().includes(q));
        pool = pool.slice(0, 8);
        if (!pool.length) return;
        pool.forEach(m => {
          const it = mk('div', 'mat-dd-item');
          it.appendChild(tx('strong', '', m.name));
          if (m.beschreibung) it.appendChild(tx('div', 'mat-dd-sub', m.beschreibung.slice(0, 60)));
          it.onmousedown = () => {
            phase.methodeId = m.id || null;
            phase.methode = m.name;
            scheduleSave(); si.value = ''; renderMethCell();
          };
          dd.appendChild(it);
        });
        dd.style.display = 'block';
      };
      si.onblur = () => setTimeout(() => { dd.style.display = 'none'; si.value = ''; }, 150);

      searchWrap.appendChild(si); searchWrap.appendChild(dd);
      wrap.appendChild(searchWrap);

      // KI-Vorschlag Button
      const kiBtn = mk('button', 'ph-meth-ki');
      kiBtn.textContent = '✨'; kiBtn.title = 'Methode von KI vorschlagen lassen';
      kiBtn.onclick = () => kiMethVorschlag(phase, renderMethCell);
      wrap.appendChild(kiBtn);

      tm.appendChild(wrap);
    }

    renderMethCell();
    tr.appendChild(tm);

    // Sozialform
    const ts = document.createElement('td');
    const sSel = document.createElement('select');
    sSel.style.cssText = 'border:none;background:transparent;font-size:13px;width:100%;';
    sSel.appendChild(Object.assign(document.createElement('option'), { value: '', textContent: '–' }));
    SOZIALFORMEN.forEach(s => {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      if (phase.sozialform === s) o.selected = true;
      sSel.appendChild(o);
    });
    sSel.onchange = e => { phase.sozialform = e.target.value; scheduleSave(); };
    ts.appendChild(sSel); tr.appendChild(ts);

    // Minuten
    const tmin = document.createElement('td'); tmin.style.width = '60px';
    const minI = document.createElement('input');
    minI.type = 'number'; minI.value = phase.minuten || 0;
    minI.style.cssText = 'width:50px;border:none;background:transparent;font-size:13px;';
    minI.oninput = e => { phase.minuten = parseInt(e.target.value) || 0; scheduleSave(); };
    tmin.appendChild(minI); tr.appendChild(tmin);

    // Löschen
    const td = document.createElement('td');
    const db = btn('✕', 'btn btn-danger btn-xs');
    db.onclick = () => { stunde.phasen.splice(i, 1); scheduleSave(); render(); };
    td.appendChild(db); tr.appendChild(td);

    return tr;
  }

  stunde.phasen.forEach((phase, i) => tbody.appendChild(rebuildRow(phase, i)));
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  return wrap;
}

// ── KI: Methodenvorschlag für eine Phase ─────────────────────────
async function kiMethVorschlag(phase, onDone) {
  const antKey = localStorage.getItem('ant_key');
  if (!antKey) { alert('Bitte zuerst API-Key in den Einstellungen hinterlegen.'); return; }
  if (!METHDB.length) { alert('Methodendatenbank ist leer.'); return; }

  const pool = phase.typ
    ? METHDB.filter(m => !m.phasen?.length || m.phasen.includes(phase.typ))
    : METHDB;

  const methListe = pool.map(m =>
    `ID:${m.id} | ${m.name}` +
    (m.phasen?.length ? ' [' + m.phasen.join('/') + ']' : '') +
    (m.beschreibung ? ' – ' + m.beschreibung.slice(0, 100) : '')
  ).join('\n');

  const prompt = `Du bist Didaktik-Experte. Wähle die am besten passende Unterrichtsmethode für diese Phase.

Phase: "${phase.titel || phase.typ || 'unbekannt'}"
Typ: ${phase.typ || 'nicht festgelegt'}
Dauer: ${phase.minuten || '?'} Minuten
Inhalt/Aktivität: ${phase.inhalt || '(noch kein Inhalt)'}

Verfügbare Methoden:
${methListe}

Antworte NUR mit diesem JSON:
{"id": "exakte-ID-aus-der-Liste", "name": "Methodenname", "begruendung": "1-2 Sätze warum diese Methode hier passt"}`;

  try {
    const parsed = JSON.parse((await callKI(prompt, { model: KI_MODEL_HAIKU, maxTokens: 300 })).match(/\{[\s\S]*\}/)?.[0] || '{}');
    if (!parsed.name) throw new Error('Kein Vorschlag erhalten.');
    phase.methodeId = parsed.id || null;
    phase.methode = parsed.name;
    scheduleSave();
    onDone();
    if (parsed.begruendung) {
      // Kurze Begründung als Tooltip-artiger Hinweis unter der Methode
      setTimeout(() => {
        const cell = document.querySelector('.ph-meth-set');
        if (cell && !cell.querySelector('.ph-meth-begr')) {
          const b = tx('div', 'ph-meth-begr', '✨ ' + parsed.begruendung);
          cell.after(b);
        }
      }, 50);
    }
  } catch(e) {
    alert('Fehler: ' + e.message);
  }
}

