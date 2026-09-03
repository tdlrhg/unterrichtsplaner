// ── Zeitachse: Gantt-Diagramm für Unterrichtsplanung ─────────────
function viewZeitachse(kursId) {
  const kurs = (S.data.kurse || []).find(k => k.id === kursId);
  if (!kurs) return mk('div', '');

  const fp = getFachplanung(kurs.fachplanungId);
  if (!fp) return gray('Keine Fachplanung zugewiesen.');

  const kal = S.data.kalender || {};
  const schuljahr = kurs.schuljahr || kal.schuljahr || '2025/26';
  const ausfalltage = kal.ausfalltage || [];
  const einzelAusfaelle = (kal.einzelAusfaelle || []).filter(a => a.kursId === kursId);
  const klassenarbeiten = (kal.klassenarbeiten || []).filter(k => k.kursId === kursId);

  const ferien = NRW_FERIEN[schuljahr] || [];
  if (!ferien.length) return gray('Keine Feriendaten für ' + schuljahr);

  const sjStart = strToDate(ferien[0].bis);
  sjStart.setUTCDate(sjStart.getUTCDate() + 1);
  const sjEnd = strToDate(ferien[ferien.length - 1].von);
  sjEnd.setUTCDate(sjEnd.getUTCDate() - 1);

  // ── Alle tatsächlichen Unterrichtsstunden chronologisch ──────
  function alleStunden() {
    const result = [];
    const cur = new Date(sjStart);
    while (cur <= sjEnd) {
      if (isSchultag(cur, schuljahr, ausfalltage)) {
        const dw = cur.getUTCDay();
        const dwStr = ['','Mo','Di','Mi','Do','Fr'][dw];
        const gerade = isGeradeKW(cur);
        const ds = dateToStr(cur);
        (kurs.stundenplan || []).forEach(slot => {
          if (slot.tag !== dwStr) return;
          if (slot.kwTyp === 'gerade' && !gerade) return;
          if (slot.kwTyp === 'ungerade' && gerade) return;
          if (!einzelAusfaelle.some(a => a.datum === ds && a.stunde === slot.stunde)) {
            result.push({ datum: ds, tag: dwStr, stunde: slot.stunde, kw: getKW(cur), year: cur.getUTCFullYear() });
          }
        });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return result.sort((a,b) => a.datum.localeCompare(b.datum) || parseInt(a.stunde)-parseInt(b.stunde));
  }

  const stundenGesamt = alleStunden();

  // ── Blockdauer ───────────────────────────────────────────────
  // Rohe Anzahl tatsächlich angelegter Stunden in 45-Min-Einheiten (Doppelstunde = 2),
  // ignoriert stundenGesamt-Schätzung. Stunden liegen flach in reihe.stunden[].
  function zaehleEchteStundenBlock(block) {
    let count = 0;
    (block.reihen || []).forEach(r => { count += summeStundenEinheiten(r.stunden); });
    return count;
  }

  // Geplant/Ist pro Reihe eines Blocks (roh, ohne Max-Kombination)
  function reihenSegmente(block) {
    return (block.reihen || []).map(r => {
      const geplant = parseInt(r.stundenAnzahl) || 0;
      const echte = summeStundenEinheiten(r.stunden);
      return { reihe: r, geplant, echte };
    });
  }

  // Gesamtdauer eines Blocks für die Zeitachsen-Platzierung: Summe der
  // Reihen-Segmente (max aus geplant/echt je Reihe), sonst block.stundenGesamt,
  // sonst tatsächlich angelegte Stunden.
  function zaehleBlockStunden(block) {
    const segs = reihenSegmente(block);
    const sumDauer = segs.reduce((s, x) => s + Math.max(x.geplant, x.echte), 0);
    if (sumDauer > 0) return sumDauer;
    const geplant = parseInt(block.stundenGesamt);
    if (geplant > 0) return geplant;
    return zaehleEchteStundenBlock(block);
  }

  // ── Platzierungen ────────────────────────────────────────────
  if (!S.data.zeitplanung) S.data.zeitplanung = {};
  if (!S.data.zeitplanung[kursId]) S.data.zeitplanung[kursId] = {};
  const planung = S.data.zeitplanung[kursId];

  function blockStartIdx(block) {
    const start = planung[block.id];
    if (!start) return -1;
    // Exakter Treffer
    const exact = stundenGesamt.findIndex(s => s.datum === start.datum && s.stunde === start.stunde);
    if (exact >= 0) return exact;
    // Fallback: nächste verfügbare Stunde ab dem gespeicherten Datum
    return stundenGesamt.findIndex(s => s.datum >= start.datum);
  }

  function blockEndIdx(block) {
    const si = blockStartIdx(block);
    if (si < 0) return -1;
    const dauer = zaehleBlockStunden(block);
    if (dauer === 0) return si;
    return Math.min(si + dauer - 1, stundenGesamt.length - 1);
  }

  // ── Wochen aufbauen ──────────────────────────────────────────
  const wochenMap = new Map();
  stundenGesamt.forEach(s => {
    const key = s.kw + '-' + s.year;
    if (!wochenMap.has(key)) wochenMap.set(key, { kw: s.kw, year: s.year, stunden: [] });
    wochenMap.get(key).stunden.push(s);
  });

  const wochen = [];
  const cur2 = new Date(sjStart);
  const dow0 = cur2.getUTCDay();
  if (dow0 !== 1) cur2.setUTCDate(cur2.getUTCDate() - (dow0 === 0 ? 6 : dow0 - 1));
  while (cur2 <= sjEnd) {
    const kw = getKW(cur2); const year = cur2.getUTCFullYear(); const key = kw + '-' + year;
    const w = wochenMap.get(key) || { kw, year, stunden: [] };
    const ds = dateToStr(cur2);
    let isFerie = false;
    ferien.forEach(f => { if (ds >= f.von && ds <= f.bis) isFerie = true; });
    wochen.push({ ...w, key, datum: new Date(cur2), isFerie });
    cur2.setUTCDate(cur2.getUTCDate() + 7);
  }

  // ── Block-Layouts (Mehrspurigkeit) ───────────────────────────
  const blockLayouts = {};
  const belegtPerWoche = {};

  (fp.blocks || []).forEach(block => {
    const si = blockStartIdx(block);
    const ei = blockEndIdx(block);
    if (si < 0) return;
    const startW = wochen.findIndex(w => stundenGesamt[si] && w.key === stundenGesamt[si].kw + '-' + stundenGesamt[si].year);
    const endW = wochen.findIndex(w => stundenGesamt[ei] && w.key === stundenGesamt[ei].kw + '-' + stundenGesamt[ei].year);
    if (startW < 0) return;
    const endWIdx = endW < 0 ? startW : endW;

    let row = 0;
    while (true) {
      let frei = true;
      for (let i = startW; i <= endWIdx; i++) { if ((belegtPerWoche[i]||[]).includes(row)) { frei=false; break; } }
      if (frei) break;
      row++;
    }
    blockLayouts[block.id] = { startW, endW: endWIdx, row, si };
    for (let i = startW; i <= endWIdx; i++) { if (!belegtPerWoche[i]) belegtPerWoche[i]=[]; belegtPerWoche[i].push(row); }
  });

  const maxRow = Math.max(0, ...Object.values(blockLayouts).map(l => l.row)) + 1;
  const FARBEN = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1'];

  function pastellize(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    const mix = c => Math.round(c + (255-c)*0.62);
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  }

  // ── UI ───────────────────────────────────────────────────────
  const div = mk('div', '');

  // Ungeplante Blöcke
  const ungeplant = (fp.blocks || []).filter(b => !planung[b.id]);
  if (ungeplant.length > 0) {
    const lt = tx('div', '', 'Noch nicht eingeplant – auf Zeitachse ziehen:');
    lt.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;';
    div.appendChild(lt);
    const chips = mk('div', '');
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;';
    ungeplant.forEach(block => {
      const bi = (fp.blocks||[]).indexOf(block);
      const farbe = FARBEN[bi % FARBEN.length];
      const std = zaehleBlockStunden(block);
      const chip = mk('div', '');
      chip.style.cssText = `padding:5px 12px;border-radius:6px;font-size:12px;font-weight:700;color:white;background:${farbe};cursor:grab;user-select:none;`;
      chip.textContent = block.titel + (std > 0 ? ' (' + std + ' Std.)' : '');
      chip.draggable = true;
      chip.dataset.blockId = block.id;
      chip.ondragstart = e => { e.dataTransfer.setData('blockId', block.id); e.dataTransfer.effectAllowed = 'move'; };
      chips.appendChild(chip);
    });
    div.appendChild(chips);
  }

  // SVG
  const WBREITE = 38; const ZHOEHE = 26; const HEADER_H = 58;  // extra Platz für KA-Icons
  const totalW = wochen.length * WBREITE;
  const totalH = HEADER_H + maxRow * ZHOEHE + 12;

  const container = mk('div', '');
  container.style.cssText = 'overflow-x:auto;border:1px solid var(--bord);border-radius:8px;position:relative;';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', totalW); svg.setAttribute('height', totalH);
  svg.style.display = 'block';

  function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v));
    return el;
  }

  svg.appendChild(svgEl('rect', {width:totalW, height:totalH, fill:'#f8fafc'}));

  const MONATE_KURZ = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const heute = new Date();
  const aktKW = getKW(heute); const aktYear = heute.getFullYear();
  let letzterMonat = -1;

  wochen.forEach((woche, i) => {
    const x = i * WBREITE;
    const istAktKW = woche.kw === aktKW && woche.year === aktYear;

    if (woche.isFerie) svg.appendChild(svgEl('rect', {x, y:0, width:WBREITE, height:totalH, fill:'#e5e7eb'}));
    else if (woche.kw % 2 === 0) svg.appendChild(svgEl('rect', {x, y:0, width:WBREITE, height:totalH, fill:'rgba(59,130,246,0.03)'}));

    if (istAktKW) {
      svg.appendChild(svgEl('rect', {x:x+1, y:HEADER_H+1, width:WBREITE-2, height:totalH-HEADER_H-2, fill:'rgba(59,130,246,0.06)', rx:'2'}));
      svg.appendChild(svgEl('rect', {x:x+1, y:HEADER_H+1, width:WBREITE-2, height:totalH-HEADER_H-2, fill:'none', stroke:'#3b82f6', 'stroke-width':'1.5', rx:'2'}));
    }

    svg.appendChild(svgEl('line', {x1:x, y1:HEADER_H, x2:x, y2:totalH, stroke:'#e2e8f0', 'stroke-width':'1'}));

    const kwTxt = svgEl('text', {x:x+WBREITE/2, y:16, 'text-anchor':'middle', 'font-size':'9', fill:istAktKW?'#1d4ed8':woche.isFerie?'#9ca3af':'#64748b', 'font-weight':istAktKW?'900':'700'});
    kwTxt.textContent = 'KW' + woche.kw;
    svg.appendChild(kwTxt);

    const monat = woche.datum.getUTCMonth();
    if (monat !== letzterMonat) {
      const mTxt = svgEl('text', {x:x+2, y:30, 'font-size':'10', fill:'#1e3a5f', 'font-weight':'700'});
      mTxt.textContent = MONATE_KURZ[monat] + ' ' + woche.datum.getUTCFullYear();
      svg.appendChild(mTxt);
      letzterMonat = monat;
    }

    const anzahl = woche.stunden ? woche.stunden.length : 0;
    if (!woche.isFerie) {
      const sTxt = svgEl('text', {x:x+WBREITE/2, y:45, 'text-anchor':'middle', 'font-size':'8', fill:'#94a3b8'});
      sTxt.textContent = anzahl + 'h';
      svg.appendChild(sTxt);
    }
  });

  svg.appendChild(svgEl('line', {x1:0, y1:HEADER_H, x2:totalW, y2:HEADER_H, stroke:'#cbd5e1', 'stroke-width':'2'}));

  // Index in stundenGesamt → Wochen-Index (geclampt auf Schuljahresende)
  function idxToWeekIdx(idx) {
    if (idx < 0) return -1;
    const clamped = Math.min(idx, stundenGesamt.length - 1);
    if (clamped < 0 || !stundenGesamt[clamped]) return -1;
    const s = stundenGesamt[clamped];
    return wochen.findIndex(w => w.key === s.kw + '-' + s.year);
  }

  // Zeichnet einen Geplant/Ist-Balken ab startIdx: Pastell = geplante Dauer,
  // kräftige Farbe obendrauf = tatsächlich angelegte Stunden.
  function zeichneGeplantIstBalken(farbe, y, h, startIdx, dauerGeplant, dauerEcht, labelTxt) {
    const dauer = Math.max(dauerGeplant, dauerEcht);
    if (dauer <= 0 || startIdx < 0 || startIdx >= stundenGesamt.length) return;
    const startWIdx = idxToWeekIdx(startIdx);
    if (startWIdx < 0) return;
    const x = startWIdx * WBREITE + 2;

    function breite(d) {
      const endWIdx = idxToWeekIdx(startIdx + d - 1);
      const endWClamped = endWIdx < 0 ? startWIdx : endWIdx;
      return (endWClamped - startWIdx + 1) * WBREITE - 4;
    }

    if (dauerGeplant > 0) {
      svg.appendChild(svgEl('rect', {x, y, width:Math.max(breite(dauerGeplant),4), height:h, rx:'4', fill:pastellize(farbe)}));
    }
    if (dauerEcht > 0) {
      svg.appendChild(svgEl('rect', {x, y, width:Math.max(breite(dauerEcht),4), height:h, rx:'4', fill:farbe, opacity:'0.9'}));
    }

    const wTotal = breite(dauer);
    const maxChars = Math.floor(Math.max(wTotal-10, 0) / 6.5);
    if (maxChars > 2 && labelTxt) {
      const txt = labelTxt.length > maxChars ? labelTxt.slice(0, Math.max(maxChars-1,0))+'…' : labelTxt;
      const lbl = svgEl('text', {x:x+5, y:y+h/2+4, 'font-size':'10', fill:'white', 'font-weight':'700'});
      lbl.textContent = txt;
      lbl.style.pointerEvents = 'none';
      svg.appendChild(lbl);
    }
  }

  // Blöcke zeichnen — pro Block in Reihen-Segmente aufgeteilt, wenn Reihen existieren
  (fp.blocks || []).forEach((block, bi) => {
    const layout = blockLayouts[block.id];
    if (!layout) return;
    const farbe = FARBEN[bi % FARBEN.length];
    const y = HEADER_H + layout.row * ZHOEHE + 3;
    const h = ZHOEHE - 6;

    const segs = reihenSegmente(block).filter(s => Math.max(s.geplant, s.echte) > 0);

    if (segs.length) {
      let cursor = layout.si;
      segs.forEach(seg => {
        zeichneGeplantIstBalken(farbe, y, h, cursor, seg.geplant, seg.echte, seg.reihe.titel || '');
        cursor += Math.max(seg.geplant, seg.echte);
      });
    } else {
      const geplantBlock = parseInt(block.stundenGesamt) || 0;
      const echteBlock = zaehleEchteStundenBlock(block);
      zeichneGeplantIstBalken(farbe, y, h, layout.si, geplantBlock, echteBlock, block.titel);
    }
  });

  container.appendChild(svg);

  // Drop-Grid + HTML-Overlays für platzierte Blöcke
  const dropGrid = mk('div', '');
  dropGrid.style.cssText = `position:absolute;top:0;left:0;width:${totalW}px;height:${totalH}px;pointer-events:none;`;

  // Drop-Zellen (unterer Bereich)
  const dropRow = mk('div', '');
  dropRow.style.cssText = `position:absolute;top:${HEADER_H}px;left:0;display:flex;height:${totalH-HEADER_H}px;pointer-events:none;`;
  wochen.forEach((woche, i) => {
    const cell = mk('div', '');
    cell.style.cssText = `width:${WBREITE}px;height:100%;flex-shrink:0;pointer-events:auto;`;
    if (!woche.isFerie && woche.stunden && woche.stunden.length > 0) {
      cell.ondragover = e => { e.preventDefault(); cell.style.background='rgba(59,130,246,0.15)'; };
      cell.ondragleave = () => { cell.style.background=''; };
      cell.ondrop = e => {
        e.preventDefault(); cell.style.background='';
        const blockId = e.dataTransfer.getData('blockId');
        if (!blockId) return;
        S.modal = { type: 'waehlStartstunde', data: { kursId, blockId, woche } };
        render();
      };
    }
    dropRow.appendChild(cell);
  });
  dropGrid.appendChild(dropRow);

  // HTML-Overlays für platzierte Blöcke (draggable)
  (fp.blocks || []).forEach((block, bi) => {
    const layout = blockLayouts[block.id];
    if (!layout) return;
    const farbe = FARBEN[bi % FARBEN.length];
    const x = layout.startW * WBREITE + 2;
    const y = HEADER_H + layout.row * ZHOEHE + 3;
    const w = (layout.endW - layout.startW + 1) * WBREITE - 4;
    const h = ZHOEHE - 6;

    const overlay = mk('div', '');
    overlay.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${Math.max(w,4)}px;height:${h}px;cursor:grab;pointer-events:auto;border-radius:4px;z-index:10;`;
    overlay.draggable = true;
    overlay.title = block.titel;
    overlay.dataset.blockId = block.id;

    overlay.ondragstart = e => {
      e.dataTransfer.setData('blockId', block.id);
      e.dataTransfer.effectAllowed = 'move';
      overlay.style.opacity = '0.4';
    };
    overlay.ondragend = () => { overlay.style.opacity = '1'; };

    // Klick → Modal mit Optionen
    overlay.onclick = () => {
      S.modal = { type: 'blockOptionen', data: { block, fpId: fp.id, kursId } };
      render();
    };

    dropGrid.appendChild(overlay);
  });

  container.appendChild(dropGrid);
  div.appendChild(container);

  // ── Klassenarbeiten als Marker ───────────────────────────────
  klassenarbeiten.forEach(ka => {
    const kaDate = strToDate(ka.datum);
    const kaKW = getKW(kaDate);
    const kaYear = kaDate.getUTCFullYear();
    const wIdx = wochen.findIndex(w => w.kw === kaKW && w.year === kaYear);
    if (wIdx < 0) return;
    const x = wIdx * WBREITE + WBREITE / 2;

    // Marker-Linie
    svg.appendChild(svgEl('line', {
      x1: x, y1: HEADER_H, x2: x, y2: totalH,
      stroke: '#7c3aed', 'stroke-width': '2', 'stroke-dasharray': '3,3', opacity: '0.6'
    }));

    // Icon + Tooltip
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    marker.setAttribute('x', x);
    marker.setAttribute('y', HEADER_H - 4);
    marker.setAttribute('text-anchor', 'middle');
    marker.setAttribute('font-size', '13');
    marker.textContent = '📝';
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = (ka.titel || 'Klassenarbeit') + ' · ' + ka.datum + (ka.doppelstunde ? ' (Doppelstunde)' : '');
    marker.appendChild(title);
    svg.appendChild(marker);
  });

  const hint = tx('div', '', 'Block ziehen zum Verschieben · Klick auf Block für Optionen');
  hint.style.cssText = 'font-size:11px;color:var(--tx3);margin-top:6px;';
  div.appendChild(hint);

  // Auto-scroll zur aktuellen KW
  const aktWocheIdx = wochen.findIndex(w => w.kw === aktKW && w.year === aktYear);
  if (aktWocheIdx >= 0) {
    setTimeout(() => { container.scrollLeft = Math.max(0, aktWocheIdx * WBREITE - 100); }, 50);
  }

  return div;
}
