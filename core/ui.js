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

function ovCard(title, sub, onclick) {
  const c = mk('div', 'ov-card');
  c.appendChild(tx('div', 'ov-title', title));
  c.appendChild(tx('div', 'ov-sub', sub));
  c.onclick = onclick;
  return c;
}

// ── KLP Selector ─────────────────────────────────────────────────
function klpSelector(stunde, fach) {
  const klp = KLP[fach] || KLP.M;
  if (!stunde.klpInhalt) stunde.klpInhalt = [];
  if (!stunde.klpProzess) stunde.klpProzess = [];

  const grid = mk('div', 'klp-grid');

  [['Inhaltsbereiche', klp.inhalt, 'klpInhalt'],
   ['Prozesskompetenzen', klp.prozess, 'klpProzess']].forEach(([label, items, prop]) => {
    const sec = mk('div', '');
    sec.appendChild(tx('div', 'klp-sec', label));
    items.forEach(k => {
      const sel = stunde[prop].includes(k.id);
      const item = mk('div', 'klp-item' + (sel ? ' sel' : ''));
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = sel;
      cb.onchange = () => {
        if (cb.checked) stunde[prop].push(k.id);
        else stunde[prop] = stunde[prop].filter(x => x !== k.id);
        scheduleSave();
        item.className = 'klp-item' + (cb.checked ? ' sel' : '');
      };
      item.appendChild(cb);
      item.appendChild(tx('span', '', k.label));
      item.onclick = e => { if (e.target !== cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); } };
      sec.appendChild(item);
    });
    grid.appendChild(sec);
  });
  return grid;
}

// ── Coverage display ─────────────────────────────────────────────
function klpCoverage(kursId, fach) {
  const klp = KLP[fach] || KLP.M;
  const alle = getAlleStunden(kursId);
  const covI = new Set(alle.flatMap(s => s.klpInhalt || []));
  const covP = new Set(alle.flatMap(s => s.klpProzess || []));

  const grid = mk('div', 'cov-grid');
  [...klp.inhalt, ...klp.prozess].forEach(k => {
    const covered = covI.has(k.id) || covP.has(k.id);
    const item = mk('div', 'cov-item ' + (covered ? 'ok' : 'miss'));
    item.appendChild(tx('span', 'cov-lbl', k.label));
    item.appendChild(tx('span', '', covered ? '✓' : '✗'));
    grid.appendChild(item);
  });
  return grid;
}

// ── Phasen table ─────────────────────────────────────────────────
function phasenTable(stunde) {
  if (!stunde.phasen) stunde.phasen = [];

  const wrap = mk('div', '');
  wrap.style.overflowX = 'auto';

  const tbl = document.createElement('table');
  tbl.className = 'ph-table';

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['#', 'Titel / Inhalt', 'Methode', 'Sozialform', 'Min.', 'Material', ''].forEach(h => {
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

    // Titel + Inhalt
    const ti = document.createElement('td');
    ti.style.minWidth = '180px';
    const titI = document.createElement('input');
    titI.type = 'text'; titI.value = phase.titel || ''; titI.placeholder = 'Titel';
    titI.style.cssText = 'border:none;background:transparent;font-size:13px;width:100%;font-family:inherit;display:block;';
    titI.oninput = e => { phase.titel = e.target.value; scheduleSave(); };
    const inhTA = document.createElement('textarea');
    inhTA.value = phase.inhalt || ''; inhTA.placeholder = 'Inhalt / Aktivität…';
    inhTA.style.cssText = 'border:none;background:transparent;font-size:13px;width:100%;font-family:inherit;min-height:40px;resize:vertical;display:block;';
    inhTA.oninput = e => { phase.inhalt = e.target.value; scheduleSave(); };
    ti.appendChild(titI); ti.appendChild(inhTA);
    tr.appendChild(ti);

    // Methode
    const tm = document.createElement('td');
    const mSel = document.createElement('select');
    mSel.style.cssText = 'border:none;background:transparent;font-size:13px;width:100%;';
    mSel.appendChild(Object.assign(document.createElement('option'), { value: '', textContent: '–' }));
    METHODEN.forEach(m => {
      const o = document.createElement('option');
      o.value = m; o.textContent = m;
      if (phase.methode === m) o.selected = true;
      mSel.appendChild(o);
    });
    mSel.onchange = e => { phase.methode = e.target.value; scheduleSave(); };
    tm.appendChild(mSel); tr.appendChild(tm);

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

    // Material (verknüpft aus MATDB)
    const tmat = document.createElement('td'); tmat.style.minWidth = '150px';
    if (!phase.materialIds) phase.materialIds = [];

    function renderMatCell() {
      tmat.innerHTML = '';
      const wrap = mk('div', 'mat-cell');

      phase.materialIds.forEach(mid => {
        const mat = MATDB.find(m => m.id === mid);
        if (!mat) return;
        const chip = mk('span', 'mat-chip');
        chip.title = [mat.materialtyp, mat.beschreibung].filter(Boolean).join(' · ');
        const lbl = tx('span', '', mat.titel);
        const x = mk('span', 'mat-chip-x'); x.textContent = '✕';
        x.onclick = () => {
          phase.materialIds = phase.materialIds.filter(id => id !== mid);
          scheduleSave(); renderMatCell();
        };
        chip.appendChild(lbl); chip.appendChild(x);
        wrap.appendChild(chip);
      });

      const searchWrap = mk('div', 'mat-search-wrap');
      const si = document.createElement('input');
      si.type = 'text'; si.placeholder = '+ Material…';
      si.className = 'mat-search-inp';

      const dd = mk('div', 'mat-dd');
      si.oninput = () => {
        const q = si.value.toLowerCase().trim();
        dd.innerHTML = ''; dd.style.display = 'none';
        if (!q) return;
        const hits = MATDB.filter(m =>
          !phase.materialIds.includes(m.id) &&
          (m.titel.toLowerCase().includes(q) ||
           (m.themen || []).join(' ').toLowerCase().includes(q) ||
           (m.fach || []).join(' ').toLowerCase().includes(q))
        ).slice(0, 8);
        if (!hits.length) return;
        hits.forEach(m => {
          const it = mk('div', 'mat-dd-item');
          const top = mk('div', '');
          top.innerHTML = '<strong>' + m.titel + '</strong>';
          const sub = tx('div', 'mat-dd-sub', (m.fach || []).join(', ') + ' · ' + m.materialtyp);
          it.appendChild(top); it.appendChild(sub);
          it.onmousedown = () => {
            phase.materialIds.push(m.id);
            scheduleSave(); si.value = ''; renderMatCell();
          };
          dd.appendChild(it);
        });
        dd.style.display = 'block';
      };
      si.onblur = () => setTimeout(() => { dd.style.display = 'none'; si.value = ''; }, 150);

      searchWrap.appendChild(si); searchWrap.appendChild(dd);
      wrap.appendChild(searchWrap);
      tmat.appendChild(wrap);
    }

    renderMatCell(); tr.appendChild(tmat);

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

