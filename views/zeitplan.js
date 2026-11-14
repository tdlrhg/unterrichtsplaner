// ── Zeitplan: das Schuljahr eines Kurses, Termin für Termin ──────
// Senkrechte Liste statt Balken: eine Zeile je Unterrichtstermin, Doppelstunden
// zusammengefasst, und alles, was man an einem Termin tun will, direkt dort.
//
// Regeln der Zuordnung:
// · Ein Block beginnt an seinem gespeicherten Starttermin — frühestens aber,
//   wenn der Block davor zu Ende ist. Dauert etwas länger (Ausfall,
//   Verlängerung, Klassenarbeit), rückt alles Folgende von selbst nach;
//   Lücken zwischen Blöcken fangen das zuerst auf.
// · Klassenarbeiten und Ausfälle belegen ihren Termin; der Unterricht fließt
//   um sie herum.
// · Die Fachplanung bleibt, wie sie ist. Kursbezogen gespeichert werden nur
//   Blockstart (zeitplanung), Verlängerungen (zeitdehnung), Ausfälle und
//   Klassenarbeiten (kalender).

const ZP_FARBEN = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1'];

function zpPastell(hex, anteil) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  const mix = c => Math.round(c + (255 - c) * (anteil == null ? 0.82 : anteil));
  return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
}

function zpHeute() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function zpKurzDatum(ds) { return ds.slice(8, 10) + '.' + ds.slice(5, 7) + '.'; }

// ── Daten ────────────────────────────────────────────────────────
function zeitplanDaten(kursId) {
  const kurs = (S.data.kurse || []).find(k => k.id === kursId);
  if (!kurs) return null;
  const fp = getFachplanung(kurs.fachplanungId);
  const kal = S.data.kalender || {};
  const schuljahr = kurs.schuljahr || kal.schuljahr || '2025/26';
  const ferien = NRW_FERIEN[schuljahr] || [];
  if (!fp) return { kurs, fehler: 'Keine Fachplanung zugewiesen.' };
  if (!ferien.length) return { kurs, fp, fehler: 'Keine Feriendaten für ' + schuljahr + '.' };

  const feiertage = NRW_FEIERTAGE[schuljahr] || [];
  const ausfalltage = kal.ausfalltage || [];
  const tagGruende = kal.ausfalltageGruende || {};
  const einzel = (kal.einzelAusfaelle || []).filter(a => a.kursId === kursId);
  const einzelGruende = kal.einzelAusfaelleGruende || {};
  const kas = (kal.klassenarbeiten || []).filter(k => k.kursId === kursId);

  const sjStart = strToDate(ferien[0].bis);
  sjStart.setUTCDate(sjStart.getUTCDate() + 1);
  const sjEnd = strToDate(ferien[ferien.length - 1].von);
  sjEnd.setUTCDate(sjEnd.getUTCDate() - 1);

  // 1) Kalender abschreiten: Rohzeilen in zeitlicher Folge, Unterrichtstermine
  //    zusätzlich durchnummeriert in slots[]
  const roh = [];
  const slots = [];
  const ferienGezeigt = {};
  const cur = new Date(sjStart);
  while (cur <= sjEnd) {
    const ds = dateToStr(cur);
    const dw = cur.getUTCDay();
    const f = ferien.find(x => ds >= x.von && ds <= x.bis);
    if (f) {
      if (!ferienGezeigt[f.von]) { ferienGezeigt[f.von] = true; roh.push({ typ: 'ferien', name: f.name, von: f.von, bis: f.bis, datum: ds }); }
    } else if (dw >= 1 && dw <= 5) {
      const tag = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr'][dw];
      const gerade = isGeradeKW(cur);
      const kw = getKW(cur), year = cur.getUTCFullYear();
      const heuteSlots = (kurs.stundenplan || []).filter(sl => sl.tag === tag
        && !(sl.kwTyp === 'gerade' && !gerade) && !(sl.kwTyp === 'ungerade' && gerade))
        .slice().sort((a, b) => parseInt(a.stunde) - parseInt(b.stunde));
      const kasHeute = kas.filter(k => k.datum === ds);
      const kaGetroffen = {};
      const basis = { datum: ds, tag, kw, year };

      if (heuteSlots.length && feiertage.includes(ds)) {
        roh.push(Object.assign({ typ: 'tagfrei', grund: 'Feiertag', stunden: heuteSlots.map(x => x.stunde) }, basis));
      } else if (heuteSlots.length && ausfalltage.includes(ds)) {
        roh.push(Object.assign({ typ: 'tagfrei', grund: tagGruende[ds] || 'unterrichtsfrei', stunden: heuteSlots.map(x => x.stunde) }, basis));
      } else {
        heuteSlots.forEach(sl => {
          const z = Object.assign({ stunde: sl.stunde }, basis);
          const ka = kasHeute.find(k => String(k.stunde) === String(sl.stunde)
            || (k.doppelstunde && parseInt(k.stunde) + 1 === parseInt(sl.stunde)));
          if (einzel.some(a => a.datum === ds && String(a.stunde) === String(sl.stunde))) {
            roh.push(Object.assign(z, { typ: 'ausfall', grund: einzelGruende[kursId + '_' + ds] || '' }));
          } else if (ka) {
            kaGetroffen[ka.id] = true;
            roh.push(Object.assign(z, { typ: 'ka', ka }));
          } else {
            z.typ = 'slot'; z.idx = slots.length;
            slots.push(z);
            roh.push(z);
          }
        });
      }
      // Klassenarbeiten, die auf keinen Termin des Stundenplans fallen
      kasHeute.filter(k => !kaGetroffen[k.id]).forEach(k => {
        roh.push(Object.assign({ typ: 'ka', ka: k, stunde: k.stunde, ohneTermin: true }, basis));
      });
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  // 2) Blöcke auf die Termine legen
  const planung = (S.data.zeitplanung || {})[kursId] || {};
  const dehnung = (S.data.zeitdehnung || {})[kursId] || {};
  const dehnungVon = st => Math.max(0, parseInt(dehnung[st.id]) || 0);

  function startIdx(p) {
    const exakt = slots.findIndex(s => s.datum === p.datum && String(s.stunde) === String(p.stunde));
    if (exakt >= 0) return exakt;
    const naechster = slots.findIndex(s => s.datum > p.datum
      || (s.datum === p.datum && parseInt(s.stunde) >= parseInt(p.stunde)));
    return naechster < 0 ? slots.length : naechster;
  }

  // Die Termine, die ein Block braucht, als flache Folge
  function blockFolge(block) {
    let ueberspringen = Math.max(0, parseInt((planung[block.id] || {}).versatz) || 0);
    const folge = [];
    const reihen = (block.reihen || []).filter(r =>
      Math.max(parseInt(r.stundenAnzahl) || 0, summeStundenEinheiten(r.stunden)) > 0);
    if (!reihen.length) {
      const n = Math.max(0, (parseInt(block.stundenGesamt) || 0) - ueberspringen);
      for (let i = 0; i < n; i++) folge.push({ art: 'offen', reihe: null });
      return folge;
    }
    reihen.forEach(r => {
      (r.stunden || []).forEach(st => {
        const e = stundeEinheiten(st);
        if (ueberspringen >= e) { ueberspringen -= e; return; }   // schon gehalten
        ueberspringen = 0;
        const d = dehnungVon(st);
        for (let k = 0; k < e + d; k++) folge.push({ art: 'stunde', reihe: r, stunde: st, k, e, d });
      });
      let offen = Math.max(0, (parseInt(r.stundenAnzahl) || 0) - summeStundenEinheiten(r.stunden));
      const weg = Math.min(ueberspringen, offen);
      offen -= weg; ueberspringen -= weg;
      for (let i = 0; i < offen; i++) folge.push({ art: 'offen', reihe: r });
    });
    return folge;
  }

  const belegung = new Array(slots.length).fill(null);
  const blockInfo = {};
  let zeiger = 0;
  (fp.blocks || []).map((block, bi) => ({ block, bi, p: planung[block.id] }))
    .filter(x => x.p)
    .map(x => Object.assign(x, { soll: startIdx(x.p) }))
    .sort((a, b) => a.soll - b.soll || a.bi - b.bi)
    .forEach(x => {
      const folge = blockFolge(x.block);
      const si = Math.max(x.soll, zeiger);
      let ueberhang = 0;
      folge.forEach((item, i) => {
        if (si + i < slots.length) belegung[si + i] = Object.assign({ block: x.block, bi: x.bi }, item);
        else ueberhang++;
      });
      blockInfo[x.block.id] = {
        start: si, soll: x.soll, laenge: folge.length, ueberhang,
        geschoben: si > x.soll && x.soll < slots.length,
        sollDatum: slots[x.soll] ? slots[x.soll].datum : null,
        endeDatum: slots[Math.min(si + folge.length, slots.length) - 1] ? slots[Math.min(si + folge.length, slots.length) - 1].datum : null
      };
      zeiger = si + folge.length;
    });

  // 3) Zeilen bilden: gleiche Sache am selben Tag wird eine Zeile
  const schluessel = z => {
    if (z.typ === 'slot') {
      const b = belegung[z.idx];
      if (!b) return 'frei';
      if (b.art === 'stunde') return 'st:' + b.stunde.id;
      return 'of:' + b.block.id + ':' + (b.reihe ? b.reihe.id : '');
    }
    if (z.typ === 'ausfall') return 'aus';
    if (z.typ === 'ka') return 'ka:' + z.ka.id;
    return null;
  };
  const zeilen = [];
  roh.forEach(z => {
    const key = schluessel(z);
    const letzte = zeilen[zeilen.length - 1];
    if (key && letzte && letzte.key === key && letzte.datum === z.datum) {
      letzte.stunden.push(z.stunde);
      if (z.typ === 'slot') { letzte.idxs.push(z.idx); if (belegung[z.idx]) letzte.teile.push(belegung[z.idx]); }
      return;
    }
    const neu = Object.assign({}, z, { key, stunden: z.stunden ? z.stunden.slice() : [z.stunde], idxs: [], teile: [] });
    if (z.typ === 'slot') { neu.idxs.push(z.idx); if (belegung[z.idx]) neu.teile.push(belegung[z.idx]); }
    zeilen.push(neu);
  });

  return {
    kurs, fp, schuljahr, zeilen, slots, belegung, blockInfo, planung, dehnung,
    ungeplant: (fp.blocks || []).filter(b => !planung[b.id])
  };
}

// ── Kleines Menü an einer Zeile ──────────────────────────────────
function zpMenue(anker, fuellen) {
  document.querySelectorAll('.zp-menue').forEach(m => m.remove());
  const r = anker.getBoundingClientRect();
  const menue = mk('div', 'zp-menue');
  document.body.appendChild(menue);
  const schliessen = () => { menue.remove(); document.removeEventListener('mousedown', aussen); };
  function aussen(e) { if (!menue.contains(e.target)) schliessen(); }
  setTimeout(() => document.addEventListener('mousedown', aussen), 0);

  const api = {
    schliessen,
    titel(text) { menue.appendChild(tx('div', 'zp-m-titel', text)); },
    eintrag(text, fn, opts) {
      const b = mk('button', 'zp-m-eintrag' + (opts && opts.gefahr ? ' gefahr' : ''));
      b.textContent = text;
      if (opts && opts.aus) b.disabled = true;
      if (opts && opts.tipp) b.title = opts.tipp;
      b.onclick = () => { schliessen(); fn(); };
      menue.appendChild(b);
      return b;
    },
    trenner() { menue.appendChild(mk('div', 'zp-m-trenner')); },
    element(el) { menue.appendChild(el); }
  };
  fuellen(api);

  // Platz: unter dem Anker, rechtsbündig; am unteren Rand nach oben klappen
  const mh = menue.offsetHeight, mw = menue.offsetWidth;
  let top = r.bottom + 3;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 3);
  menue.style.top = top + 'px';
  menue.style.left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8)) + 'px';
  return api;
}

// ── Ansicht ──────────────────────────────────────────────────────
function viewZeitplan(kursId) {
  const d = zeitplanDaten(kursId);
  if (!d) return mk('div', '');
  if (d.fehler) return gray(d.fehler);
  const { kurs, fp, zeilen, slots, blockInfo } = d;
  const kal = () => { if (!S.data.kalender) S.data.kalender = {}; return S.data.kalender; };
  const planungSchreibbar = () => {
    if (!S.data.zeitplanung) S.data.zeitplanung = {};
    if (!S.data.zeitplanung[kursId]) S.data.zeitplanung[kursId] = {};
    return S.data.zeitplanung[kursId];
  };
  const fertig = () => { scheduleSave(); render(); };
  const heute = zpHeute();

  const div = mk('div', '');

  // ── Handgriffe ───────────────────────────────────────────────
  function blockBeginnt(block, datum, stunde, versatz) {
    const p = planungSchreibbar();
    const alt = p[block.id] || {};
    p[block.id] = { datum, stunde, versatz: versatz != null ? versatz : (alt.versatz || 0) };
    fertig();
  }
  function ausfallSetzen(z, stunden, grund) {
    const k = kal();
    if (!k.einzelAusfaelle) k.einzelAusfaelle = [];
    stunden.forEach(st => {
      if (!k.einzelAusfaelle.some(a => a.kursId === kursId && a.datum === z.datum && String(a.stunde) === String(st))) {
        k.einzelAusfaelle.push({ datum: z.datum, kursId, stunde: st });
      }
    });
    if (grund) {
      if (!k.einzelAusfaelleGruende) k.einzelAusfaelleGruende = {};
      k.einzelAusfaelleGruende[kursId + '_' + z.datum] = grund;
    }
    fertig();
  }
  function ausfallZurueck(z) {
    const k = kal();
    k.einzelAusfaelle = (k.einzelAusfaelle || []).filter(a =>
      !(a.kursId === kursId && a.datum === z.datum && z.stunden.map(String).includes(String(a.stunde))));
    if (!k.einzelAusfaelle.some(a => a.kursId === kursId && a.datum === z.datum) && k.einzelAusfaelleGruende) {
      delete k.einzelAusfaelleGruende[kursId + '_' + z.datum];
    }
    fertig();
  }
  function kaSetzen(z) {
    const titel = prompt('Titel der Klassenarbeit:', 'Klassenarbeit');
    if (titel === null) return;
    const k = kal();
    if (!k.klassenarbeiten) k.klassenarbeiten = [];
    const doppel = z.stunden.length >= 2 && parseInt(z.stunden[1]) === parseInt(z.stunden[0]) + 1;
    k.klassenarbeiten.push({ id: uid(), kursId, datum: z.datum, stunde: z.stunden[0], doppelstunde: doppel, titel: titel.trim() || 'Klassenarbeit' });
    fertig();
  }
  function laenger(stunde, n) {
    if (!S.data.zeitdehnung) S.data.zeitdehnung = {};
    if (!S.data.zeitdehnung[kursId]) S.data.zeitdehnung[kursId] = {};
    const dd = S.data.zeitdehnung[kursId];
    const neu = Math.max(0, (parseInt(dd[stunde.id]) || 0) + n);
    if (neu) dd[stunde.id] = neu; else delete dd[stunde.id];
    fertig();
  }
  function tauschen(reihe, stunde, richtung) {
    const liste = reihe.stunden || [];
    const i = liste.findIndex(x => x.id === stunde.id), j = i + richtung;
    if (i < 0 || j < 0 || j >= liste.length) return;
    const t = liste[i]; liste[i] = liste[j]; liste[j] = t;
    fertig();
  }
  function oeffnen(teil) {
    S.aktFpId = fp.id; S.view = 'fachplanung';
    S.sel = teil.stunde
      ? { type: 'stunde', ids: [fp.id, teil.block.id, teil.reihe.id, teil.stunde.id] }
      : (teil.reihe ? { type: 'reihe', ids: [fp.id, teil.block.id, teil.reihe.id] } : { type: 'block', ids: [fp.id, teil.block.id] });
    render();
  }
  function stundeAnlegen(reihe) {
    const titel = prompt('Titel der neuen Stunde in „' + (reihe.titel || 'Reihe') + '":');
    if (!titel || !titel.trim()) return;
    if (!reihe.stunden) reihe.stunden = [];
    reihe.stunden.push({ id: uid(), titel: titel.trim(), prioritaet: 'pflicht', dauer: 45, phasen: [], klpInhalt: [], klpProzess: [], material: [] });
    fertig();
  }

  // Menüteile, die an mehreren Zeilenarten vorkommen
  function menueAusfall(m, z) {
    const zeile = mk('div', 'zp-m-zeile');
    const grund = document.createElement('input');
    grund.type = 'text'; grund.className = 'finp'; grund.placeholder = 'Grund (optional)';
    zeile.appendChild(grund);
    m.element(zeile);
    const setze = stunden => { m.schliessen(); ausfallSetzen(z, stunden, grund.value.trim()); };
    if (z.stunden.length > 1) {
      m.eintrag('Fällt aus — alle ' + z.stunden.length + ' Stunden', () => {}).onclick = () => setze(z.stunden);
      z.stunden.forEach(st => { m.eintrag('Fällt aus — nur ' + st + '. Stunde', () => {}).onclick = () => setze([st]); });
    } else {
      m.eintrag('Fällt aus', () => {}).onclick = () => setze(z.stunden);
    }
  }
  function menueBlockStart(m, z) {
    const bloecke = fp.blocks || [];
    if (!bloecke.length) return;
    m.trenner();
    m.titel('Block hier beginnen lassen');
    bloecke.forEach((b, bi) => {
      const platziert = !!d.planung[b.id];
      const e = m.eintrag((platziert ? '↦ ' : '＋ ') + b.titel, () => blockBeginnt(b, z.datum, z.stunden[0]),
        { tipp: platziert ? 'Ist schon eingeplant — der Start wird hierher verlegt.' : 'Noch nicht eingeplant.' });
      e.style.borderLeft = '4px solid ' + ZP_FARBEN[bi % ZP_FARBEN.length];
    });
  }

  // ── Kopf: noch nicht eingeplante Blöcke ──────────────────────
  if (d.ungeplant.length) {
    const kopf = mk('div', 'zp-kopf');
    kopf.appendChild(tx('span', 'zp-kopf-lbl', 'Noch nicht eingeplant:'));
    d.ungeplant.forEach(block => {
      const bi = (fp.blocks || []).indexOf(block);
      const chip = mk('button', 'zp-chip');
      chip.style.background = ZP_FARBEN[bi % ZP_FARBEN.length];
      chip.textContent = block.titel;
      chip.title = 'Starttermin festlegen';
      chip.onclick = () => zpMenue(chip, m => {
        m.titel('„' + block.titel + '" beginnt am');
        const zeile = mk('div', 'zp-m-zeile');
        const dat = document.createElement('input');
        dat.type = 'date'; dat.className = 'finp';
        const naechster = slots.find(s => s.datum >= heute) || slots[0];
        if (naechster) dat.value = naechster.datum;
        zeile.appendChild(dat);
        m.element(zeile);
        const z2 = mk('div', 'zp-m-zeile');
        z2.appendChild(tx('span', '', 'ab Blockstunde'));
        const ab = document.createElement('input');
        ab.type = 'number'; ab.min = '1'; ab.value = '1'; ab.className = 'finp'; ab.style.width = '56px';
        ab.title = '1 = von vorn. Höher, wenn die ersten Stunden schon gehalten sind.';
        z2.appendChild(ab);
        m.element(z2);
        m.eintrag('Einplanen', () => {}).onclick = () => {
          if (!dat.value) return;
          const ziel = slots.find(s => s.datum >= dat.value);
          if (!ziel) { alert('Nach diesem Datum liegt kein Unterrichtstermin mehr im Schuljahr.'); return; }
          m.schliessen();
          blockBeginnt(block, ziel.datum, ziel.stunde, Math.max(0, (parseInt(ab.value) || 1) - 1));
        };
      });
      kopf.appendChild(chip);
    });
    div.appendChild(kopf);
  }

  // ── Liste ────────────────────────────────────────────────────
  const wrap = mk('div', 'zp-wrap');
  let letzteWoche = null, letzterTag = null, letzteReihe = undefined, heuteGesetzt = false, heuteEl = null;
  const blockBegonnen = {};

  function wochenkopf(z) {
    const key = z.kw + '-' + z.year;
    if (key === letzteWoche) return;
    letzteWoche = key;
    const w = tx('div', 'zp-woche', 'KW ' + z.kw);
    wrap.appendChild(w);
  }

  function aktKnopf(text, tipp, fn) {
    const b = mk('button', 'zp-akt-btn');
    b.textContent = text; b.title = tipp;
    b.onclick = e => { e.stopPropagation(); fn(b); };
    return b;
  }

  zeilen.forEach(z => {
    // Heute-Marke vor dem ersten Termin, der heute oder später liegt
    if (!heuteGesetzt && z.datum >= heute) {
      heuteGesetzt = true;
      heuteEl = tx('div', 'zp-heute', 'Heute · ' + zpKurzDatum(heute));
      wrap.appendChild(heuteEl);
    }

    if (z.typ === 'ferien') {
      letzteWoche = null; letzterTag = null;
      wrap.appendChild(tx('div', 'zp-ferien', z.name + ' · ' + zpKurzDatum(z.von) + '–' + zpKurzDatum(z.bis)));
      return;
    }
    wochenkopf(z);

    const teil = z.teile[0] || null;
    const farbe = teil ? ZP_FARBEN[teil.bi % ZP_FARBEN.length] : null;

    // Block- und Reihenkopf, sobald etwas Neues beginnt
    if (z.typ === 'slot' && teil) {
      if (!blockBegonnen[teil.block.id]) {
        blockBegonnen[teil.block.id] = true;
        letzteReihe = undefined;
        const info = blockInfo[teil.block.id];
        const bk = mk('div', 'zp-block');
        bk.style.background = farbe;
        const bt = tx('span', 'zp-block-titel', teil.block.titel);
        bk.appendChild(bt);
        const zusatz = [info.laenge + ' Std.'];
        if (info.endeDatum) zusatz.push('bis ' + zpKurzDatum(info.endeDatum));
        if (info.geschoben && info.sollDatum) zusatz.push('geplant ab ' + zpKurzDatum(info.sollDatum) + ', rückt nach');
        if (info.ueberhang) zusatz.push('⚠ ' + info.ueberhang + ' Std. passen nicht mehr ins Schuljahr');
        bk.appendChild(tx('span', 'zp-block-info', zusatz.join(' · ')));
        const bm = aktKnopf('⋯', 'Block: Optionen', b => zpMenue(b, m => {
          m.titel(teil.block.titel);
          m.eintrag('Zur Fachplanung', () => oeffnen({ block: teil.block }));
          m.eintrag('Ab Blockstunde … beginnen', () => {
            const alt = (d.planung[teil.block.id] || {}).versatz || 0;
            const ein = prompt('Mit welcher Blockstunde beginnt der Block in diesem Kurs?\n(1 = von vorn; höher, wenn die ersten Stunden schon gehalten sind)', String(alt + 1));
            if (ein === null) return;
            const p = planungSchreibbar();
            p[teil.block.id] = Object.assign({}, p[teil.block.id], { versatz: Math.max(0, (parseInt(ein) || 1) - 1) });
            fertig();
          });
          m.trenner();
          m.eintrag('Aus dem Zeitplan nehmen', () => {
            delete planungSchreibbar()[teil.block.id];
            fertig();
          }, { gefahr: true, tipp: 'Der Block bleibt in der Fachplanung, hat aber keinen Termin mehr.' });
        }));
        bk.appendChild(bm);
        wrap.appendChild(bk);
      }
      const reiheId = teil.reihe ? teil.reihe.id : null;
      if (reiheId !== letzteReihe) {
        letzteReihe = reiheId;
        if (teil.reihe) {
          const soll = parseInt(teil.reihe.stundenAnzahl) || 0;
          const ist = summeStundenEinheiten(teil.reihe.stunden);
          const rk = tx('div', 'zp-reihe', teil.reihe.titel || 'Reihe');
          rk.style.background = zpPastell(farbe);
          rk.style.borderLeft = '6px solid ' + farbe;
          rk.appendChild(tx('span', 'zp-reihe-info', (soll ? soll + ' Std. geplant · ' : '') + ist + ' angelegt'));
          wrap.appendChild(rk);
        }
      }
    }

    const zeile = mk('div', 'zp-row zp-' + z.typ);
    if (z.datum < heute) zeile.classList.add('zp-vorbei');
    if (z.datum === letzterTag) zeile.classList.add('zp-folge');
    letzterTag = z.datum;
    if (z.stunden.length >= 2 && z.typ !== 'tagfrei') zeile.classList.add('zp-doppel');

    const strip = mk('div', 'zp-strip');
    if (farbe) strip.style.background = farbe;
    zeile.appendChild(strip);
    zeile.appendChild(tx('div', 'zp-datum', z.tag + ' ' + zpKurzDatum(z.datum)));
    zeile.appendChild(tx('div', 'zp-std', z.typ === 'tagfrei' ? '' : z.stunden.join('./') + '.'));

    const inhalt = mk('div', 'zp-inhalt');
    const akt = mk('div', 'zp-akt');

    if (z.typ === 'tagfrei') {
      inhalt.appendChild(tx('div', 'zp-leise', 'entfällt · ' + z.grund));
    } else if (z.typ === 'ausfall') {
      inhalt.appendChild(tx('div', 'zp-titel zp-durch', 'Ausfall' + (z.grund ? ' · ' + z.grund : '')));
      akt.appendChild(aktKnopf('↺ findet statt', 'Ausfall zurücknehmen', () => ausfallZurueck(z)));
    } else if (z.typ === 'ka') {
      inhalt.appendChild(tx('div', 'zp-titel', '📝 ' + (z.ka.titel || 'Klassenarbeit')
        + (z.ohneTermin ? ' (liegt außerhalb des Stundenplans)' : '')));
      akt.appendChild(aktKnopf('⋯', 'Optionen', b => zpMenue(b, m => {
        m.eintrag('Umbenennen', () => {
          const t = prompt('Titel der Klassenarbeit:', z.ka.titel || 'Klassenarbeit');
          if (t === null) return;
          z.ka.titel = t.trim() || 'Klassenarbeit';
          fertig();
        });
        m.eintrag('Klassenarbeit entfernen', () => {
          kal().klassenarbeiten = (kal().klassenarbeiten || []).filter(k => k.id !== z.ka.id);
          fertig();
        }, { gefahr: true });
      })));
    } else if (teil && teil.art === 'stunde') {
      const st = teil.stunde;
      const basisTeile = z.teile.filter(t => t.k < t.e).length;
      const fortsTeile = z.teile.length - basisTeile;
      const prio = { optional: '🟡 ', puffer: '🔵 ' }[st.prioritaet] || '';
      let titel = prio + (st.titel || '(ohne Titel)');
      if (!basisTeile) titel = '↳ Fortsetzung: ' + (st.titel || '(ohne Titel)');
      else if (basisTeile < teil.e) titel += ' · Teil ' + (z.teile[0].k + 1) + '/' + teil.e;
      const t = tx('div', 'zp-titel', titel);
      if (basisTeile && fortsTeile) t.appendChild(tx('span', 'zp-marke', '+' + fortsTeile + ' länger'));
      inhalt.appendChild(t);
      const subTxt = [];
      if (teil.e >= 2 && basisTeile === teil.e) subTxt.push('Doppelstunde');
      const mat = typeof stundenMaterialKurz === 'function' ? stundenMaterialKurz(st) : null;
      if (mat) subTxt.push(mat);
      if (subTxt.length) inhalt.appendChild(tx('div', 'zp-sub', subTxt.join(' · ')));
      inhalt.classList.add('zp-klick');
      inhalt.title = 'Stunde öffnen';
      inhalt.onclick = () => oeffnen(teil);

      akt.appendChild(aktKnopf('+1', 'Hat länger gedauert: ein Termin mehr (nur dieser Kurs)', () => laenger(st, 1)));
      akt.appendChild(aktKnopf('⋯', 'Alle Optionen', b => zpMenue(b, m => {
        m.titel(st.titel || 'Stunde');
        m.eintrag('Stunde öffnen', () => oeffnen(teil));
        m.trenner();
        const zl = mk('div', 'zp-m-zeile');
        zl.appendChild(tx('span', '', 'Länger gebraucht:'));
        const zahl = document.createElement('input');
        zahl.type = 'number'; zahl.min = '1'; zahl.value = '1'; zahl.className = 'finp'; zahl.style.width = '50px';
        zl.appendChild(zahl);
        const ok = mk('button', 'btn btn-pri btn-xs'); ok.textContent = '+ Termine';
        ok.onclick = () => { const n = parseInt(zahl.value); if (!(n >= 1)) return; m.schliessen(); laenger(st, n); };
        zl.appendChild(ok);
        m.element(zl);
        if (teil.d) m.eintrag('Verlängerung zurücknehmen (bisher +' + teil.d + ')', () => laenger(st, -teil.d));
        m.trenner();
        menueAusfall(m, z);
        m.eintrag('Klassenarbeit an diesem Termin', () => kaSetzen(z));
        m.trenner();
        const liste = teil.reihe.stunden || [];
        const pos = liste.findIndex(x => x.id === st.id);
        const hinweis = 'Ändert die Reihenfolge in der Fachplanung — gilt für alle Kurse mit dieser Planung.';
        m.eintrag('↑ Eine Stunde früher', () => tauschen(teil.reihe, st, -1), { aus: pos <= 0, tipp: hinweis });
        m.eintrag('↓ Eine Stunde später', () => tauschen(teil.reihe, st, 1), { aus: pos < 0 || pos >= liste.length - 1, tipp: hinweis });
        menueBlockStart(m, z);
      })));
    } else {
      // Termin ohne Stunde: offen in einer Reihe, oder gar nicht verplant
      if (teil) {
        inhalt.appendChild(tx('div', 'zp-leise', 'offen' + (teil.reihe ? ' · ' + (teil.reihe.titel || 'Reihe') : ' · ' + teil.block.titel)));
        if (teil.reihe) akt.appendChild(aktKnopf('+ Stunde', 'Stunde in dieser Reihe anlegen', () => stundeAnlegen(teil.reihe)));
      } else {
        inhalt.appendChild(tx('div', 'zp-leise', 'nicht verplant'));
      }
      akt.appendChild(aktKnopf('⋯', 'Alle Optionen', b => zpMenue(b, m => {
        m.titel(z.tag + ' ' + zpKurzDatum(z.datum) + ' · ' + z.stunden.join('./') + '. Std');
        if (teil && teil.reihe) { m.eintrag('Stunde in „' + (teil.reihe.titel || 'Reihe') + '" anlegen', () => stundeAnlegen(teil.reihe)); m.trenner(); }
        menueAusfall(m, z);
        m.eintrag('Klassenarbeit an diesem Termin', () => kaSetzen(z));
        menueBlockStart(m, z);
      })));
    }

    zeile.appendChild(inhalt);
    zeile.appendChild(akt);
    wrap.appendChild(zeile);
  });

  if (!zeilen.length) wrap.appendChild(gray('Keine Unterrichtstermine im Schuljahr.'));
  div.appendChild(wrap);

  const fuss = tx('div', 'zp-fuss', 'Klick auf eine Stunde öffnet sie · „+1" gibt ihr in diesem Kurs einen Termin mehr · ⋯ zeigt alles Weitere (Ausfall, Klassenarbeit, Reihenfolge, Blockstart)');
  div.appendChild(fuss);

  // Rollposition halten; beim ersten Öffnen zur Heute-Marke
  if (!S._zpScroll) S._zpScroll = {};
  wrap.onscroll = () => { S._zpScroll[kursId] = wrap.scrollTop; };
  setTimeout(() => {
    if (S._zpScroll[kursId] != null) wrap.scrollTop = S._zpScroll[kursId];
    else if (heuteEl) wrap.scrollTop = Math.max(0, heuteEl.offsetTop - 40);
  }, 0);

  return div;
}
