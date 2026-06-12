// ── Bücherregal-Helpers ───────────────────────────────────────────
const REGAL_FARBEN = {
  mathe:  { spine: ['#1e3a8a','#1d4ed8'], text: '#bfdbfe' },
  bio:    { spine: ['#14532d','#166534'], text: '#bbf7d0' },
  chemie: { spine: ['#7c2d12','#c2410c'], text: '#fed7aa' },
};
const TYP_SYMBOL = { schulbuch: '📚', materialset: '📂', aufgabenpool: '🗃' };
const TYP_ORDER  = { schulbuch: 0, materialset: 1, aufgabenpool: 2 };
// Herkunft (Quelle) – zentrale Definition für Modal, Badge, Filter, Import
const HERKUNFT = {
  schulbuch:     { label: 'Schulbuch',          icon: '📖', color: '#0f766e', hasBuch: true  },
  handreichung:  { label: 'Lehrerhandreichung', icon: '🧑‍🏫', color: '#0369a1', hasBuch: true  },
  aufgabenpool:  { label: 'Aufgabenpool',       icon: '🗃', color: '#7c3aed', hasBuch: true  },
  materialset:   { label: 'Materialset',        icon: '📋', color: '#b45309', hasBuch: true  },
  eigenmaterial: { label: 'Eigenmaterial',      icon: '📄', color: '#16a34a', hasBuch: false },
};
const HERKUNFT_OPTS = Object.keys(HERKUNFT).map(function(k) { return [k, HERKUNFT[k].icon + ' ' + HERKUNFT[k].label]; });
function herkunftMeta(h) { return HERKUNFT[h] || HERKUNFT.schulbuch; }
const SHELF_H = 155; // Regalhöhe (px)

function jgNorm(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

function countBuchAufgaben(buch) {
  return buch.aufgabenCount || 0;
}

// Buchrücken generisch
function mkSpine(titel, breite, hoehe, grad, textColor, topIcon, bottomLabel, onclick, tooltip) {
  var el = mk('div', '');
  el.style.cssText = 'width:' + breite + 'px;height:' + hoehe + 'px;border-radius:2px 5px 5px 2px;cursor:pointer;position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;transition:transform .15s,filter .15s;background:' + grad + ';box-shadow:inset -2px 0 5px rgba(0,0,0,.45),inset 2px 0 3px rgba(255,255,255,.08),2px 2px 6px rgba(0,0,0,.5);overflow:hidden;';
  var deko = mk('div', '');
  deko.style.cssText = 'position:absolute;inset:0;background:repeating-linear-gradient(to bottom,transparent,transparent 16px,rgba(255,255,255,.04) 16px,rgba(255,255,255,.04) 17px);pointer-events:none;';
  el.appendChild(deko);
  var t = tx('div', '', titel);
  t.style.cssText = 'writing-mode:vertical-rl;transform:rotate(180deg);font-size:10px;font-weight:700;color:' + textColor + ';text-align:center;padding:5px 3px;line-height:1.25;max-height:' + (hoehe - 26) + 'px;overflow:hidden;z-index:1;';
  el.appendChild(t);
  if (topIcon) { var ic = tx('div', '', topIcon); ic.style.cssText = 'position:absolute;top:4px;font-size:11px;z-index:1;'; el.appendChild(ic); }
  if (bottomLabel) { var bl = tx('div', '', bottomLabel); bl.style.cssText = 'position:absolute;bottom:3px;font-size:8px;color:' + textColor + ';opacity:.6;z-index:1;'; el.appendChild(bl); }
  el.onmouseenter = function() { el.style.transform = 'translateY(-10px)'; el.style.filter = 'brightness(1.25)'; };
  el.onmouseleave = function() { el.style.transform = ''; el.style.filter = ''; };
  if (tooltip) el.title = tooltip;
  el.onclick = onclick;
  return el;
}

// Regalzeile: [Pille links] + [Bücherfläche + Brett rechts]
function mkRegalRow(pillCfg, booksFn, hasSep) {
  var row = mk('div', '');
  row.style.cssText = 'display:flex;align-items:stretch;' + (hasSep ? 'border-bottom:1px solid rgba(255,255,255,.05);' : '');

  var pill = mk('div', '');
  pill.style.cssText = 'width:84px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;cursor:pointer;padding:10px 6px;border-right:1px solid rgba(255,255,255,.07);background:' + pillCfg.color + '12;transition:background .15s;';
  pill.onmouseenter = function() { pill.style.background = pillCfg.color + '22'; };
  pill.onmouseleave = function() { pill.style.background = pillCfg.color + '12'; };
  pill.onclick = pillCfg.onclick;
  var pillIco = tx('div', '', pillCfg.icon); pillIco.style.fontSize = '20px';
  var pillLbl = tx('div', '', pillCfg.label);
  pillLbl.style.cssText = 'font-size:10px;font-weight:800;color:' + pillCfg.color + ';text-align:center;letter-spacing:.04em;text-transform:uppercase;line-height:1.2;';
  pill.appendChild(pillIco); pill.appendChild(pillLbl);
  if (pillCfg.sub) { var ps = tx('div', '', pillCfg.sub); ps.style.cssText = 'font-size:9px;color:rgba(255,255,255,.3);text-align:center;'; pill.appendChild(ps); }
  row.appendChild(pill);

  var shelfWrap = mk('div', ''); shelfWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;min-width:0;';
  var area = mk('div', '');
  area.style.cssText = 'flex:1;display:flex;align-items:flex-end;gap:2px;padding:8px 10px 0;background:linear-gradient(to bottom,#1a1a1f,#0a0a0e);height:' + SHELF_H + 'px;position:relative;overflow:hidden;';
  var shadow = mk('div', '');
  shadow.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:20px;background:linear-gradient(to top,rgba(0,0,0,.6),transparent);pointer-events:none;z-index:2;';
  area.appendChild(shadow);
  booksFn(area);
  shelfWrap.appendChild(area);
  var brett = mk('div', '');
  brett.style.cssText = 'height:13px;background:linear-gradient(to bottom,#6b2f3e,#4a1f2c);border-top:1px solid rgba(255,255,255,.12);box-shadow:0 3px 8px rgba(0,0,0,.5);';
  shelfWrap.appendChild(brett);
  row.appendChild(shelfWrap);
  return row;
}

function buildBuecherregal(container) {
  var gen = ++_regalGen;
  sbSelect('inhalte', { select: 'fach,quelle_name,jahrgang,quelle_typ,kapitel,kapitel_titel', limit: 5000 })
    .then(function(rows) {
      if (gen !== _regalGen || !container.isConnected) return;

      // Aggregieren: ein Eintrag pro fach+quelle_name
      var dbSet = {};
      rows.forEach(function(r) {
        if (!r.quelle_name || !r.fach) return;
        var key = r.fach + '::' + r.quelle_name;
        if (!dbSet[key]) dbSet[key] = { fach: r.fach, quelle_name: r.quelle_name, jgSet: {}, quelleTypCount: {}, kapSet: {}, count: 0 };
        var d = dbSet[key];
        if (r.jahrgang) d.jgSet[r.jahrgang] = true;
        if (r.quelle_typ) d.quelleTypCount[r.quelle_typ] = (d.quelleTypCount[r.quelle_typ] || 0) + 1;
        var kap = r.kapitel || r.kapitel_titel;
        if (kap) d.kapSet[kap] = true;
        d.count++;
      });

      var fachOrder = FAECHER.map(function(f) { return f.key; });
      var byFach = {};
      Object.keys(dbSet).forEach(function(key) {
        var d = dbSet[key];
        var jgs = Object.keys(d.jgSet).map(Number).filter(Boolean).sort(function(a, b) { return a - b; });
        var dominantTyp = Object.keys(d.quelleTypCount).reduce(function(best, h) {
          return (d.quelleTypCount[h] > (d.quelleTypCount[best] || 0)) ? h : best;
        }, 'aufgabenpool');
        var b = {
          fach: d.fach, quelle_name: d.quelle_name, quelle_typ: dominantTyp,
          kapitel: Object.keys(d.kapSet),
          jahrgang: jgs.length === 1 ? jgs[0] : (jgs.length ? jgs : null),
          aufgabenCount: d.count,
        };
        var f = b.fach || 'sonstige';
        if (!byFach[f]) byFach[f] = [];
        byFach[f].push(b);
      });

      var faecher = fachOrder.filter(function(f) { return byFach[f] && byFach[f].length; });
      var hasExtra = METHDB.length > 0 || DIDARTDB.length > 0;
      if (!faecher.length && !hasExtra) return;

      var wand = mk('div', '');
      wand.style.cssText = 'background:#0f0f12;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.4);margin:0 28px 28px;';
      container.appendChild(wand);

      // ── Fach-Zeilen ───────────────────────────────────────────────
      faecher.forEach(function(fach, idx) {
        var farbe  = REGAL_FARBEN[fach] || { spine: ['#374151','#6b7280'], text: '#f3f4f6' };
        var fInfo  = fachInfo(fach);
        var buecher = (byFach[fach] || []).slice().sort(function(a, b) { return (TYP_ORDER[a.quelle_typ] || 1) - (TYP_ORDER[b.quelle_typ] || 1); });

        var pill = { icon: fInfo.icon, label: fInfo.label, color: fInfo.color,
          onclick: function() { DB.view = 'fach'; DB.fach = fach; DB.quelle_name = null; DB.quelle_typ = null; DB.suchtext = ''; DB.offset = 0; dbRender(); } };

        var row = mkRegalRow(pill, function(area) {
          var wt = tx('div', '', fInfo.label.toUpperCase());
          wt.style.cssText = 'position:absolute;bottom:5px;left:50%;transform:translateX(-50%);font-size:44px;font-weight:900;letter-spacing:.14em;color:' + farbe.spine[1] + ';opacity:.13;white-space:nowrap;pointer-events:none;user-select:none;';
          area.appendChild(wt);
          buecher.forEach(function(buch) {
            var kap  = Math.max(1, (buch.kapitel || []).length);
            var aufg = countBuchAufgaben(buch);
            var w    = Math.min(60, Math.max(28, 24 + kap * 3));
            var h    = Math.min(SHELF_H - 16, Math.max(85, 80 + kap * 3));
            var jgA  = jgNorm(buch.jahrgang);
            area.appendChild(mkSpine(
              buch.quelle_name || '–', w, h,
              'linear-gradient(to right,' + farbe.spine[0] + ',' + farbe.spine[1] + ')',
              farbe.text, TYP_SYMBOL[buch.quelle_typ] || '📖',
              jgA.length ? 'Jg.' + jgA.join('/') : '–',
              function() { DB.view = 'fach'; DB.fach = buch.fach || fach; DB.quelle_name = buch.quelle_name; DB.quelle_typ = null; DB.suchtext = ''; DB.offset = 0; dbRender(); },
              buch.quelle_name + '\n' + kap + ' Kapitel · ' + aufg + ' Aufg.'
            ));
          });
        }, idx < faecher.length - 1 || hasExtra);

        wand.appendChild(row);
      });

      // ── Methoden + Didaktik nebeneinander ─────────────────────────
      if (hasExtra) {
        var extraRow = mk('div', ''); extraRow.style.cssText = 'display:flex;align-items:stretch;';
        var defs = [
          { key:'methoden', icon:'🛠️', label:'Methoden', color:'#7c3aed', spine:['#3b0764','#6d28d9'], text:'#e9d5ff',
            items: METHDB,   getT: function(m) { return m.name || m.titel || '–'; } },
          { key:'didaktik', icon:'🗺️', label:'Didaktik', color:'#0891b2', spine:['#0c4a6e','#0369a1'], text:'#bae6fd',
            items: DIDARTDB, getT: function(d) { return d.titel || d.name || '–'; } },
        ];
        defs.forEach(function(t, ti) {
          var half = mk('div', '');
          half.style.cssText = 'flex:1;display:flex;flex-direction:column;min-width:0;' + (ti === 0 ? 'border-right:1px solid rgba(255,255,255,.05);' : '');
          var pill2 = { icon: t.icon, label: t.label, color: t.color,
            sub: t.items.length + ' Eintr.',
            onclick: function() { DB.view = t.key; DB.fach = null; dbRender(); } };
          var innerRow = mkRegalRow(pill2, function(area) {
            var wt2 = tx('div', '', t.label.toUpperCase());
            wt2.style.cssText = 'position:absolute;bottom:5px;left:50%;transform:translateX(-50%);font-size:32px;font-weight:900;letter-spacing:.14em;color:' + t.spine[1] + ';opacity:.13;white-space:nowrap;pointer-events:none;user-select:none;';
            area.appendChild(wt2);
            t.items.slice(0, 22).forEach(function(item) {
              var titel = t.getT(item);
              area.appendChild(mkSpine(
                titel, 26, Math.min(SHELF_H - 16, 100),
                'linear-gradient(to right,' + t.spine[0] + ',' + t.spine[1] + ')',
                t.text, null, null,
                function() { DB.view = t.key; DB.fach = null; dbRender(); },
                titel
              ));
            });
            if (!t.items.length) {
              var emp = tx('div', '', 'Noch keine Einträge');
              emp.style.cssText = 'position:absolute;bottom:20px;left:50%;transform:translateX(-50%);font-size:11px;color:rgba(255,255,255,.2);white-space:nowrap;';
              area.appendChild(emp);
            }
          }, false);
          half.appendChild(innerRow);
          extraRow.appendChild(half);
        });
        wand.appendChild(extraRow);
      }
    }).catch(function() {});
}

// ── Landing Page ──────────────────────────────────────────────────
function buildLanding(container) {
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Material-Datenbank'));
  left.appendChild(tx('div', 'c-sub', 'Schulbücher, Arbeitsblätter und eigene Materialien'));
  hdr.appendChild(left);
  const hRight = mk('div', '');
  const impBtn = btn('⬆ Material importieren', 'btn btn-pri btn-sm');
  impBtn.onclick = function() { DB.view = 'import'; dbRender(); };
  hRight.appendChild(impBtn);
  hdr.appendChild(hRight);
  container.appendChild(hdr);

  // Bücherregal — zeigt alle Quellen auf einen Blick
  buildBuecherregal(container);
}
