// ── Kursansicht: Fachplanung trifft Zeitplanung ──────────────────
function viewKursDetail(kursId) {
  const kurs = (S.data.kurse || []).find(k => k.id === kursId);
  if (!kurs) return mk('div', '');

  const fp = getFachplanung(kurs.fachplanungId);
  const kal = S.data.kalender || {};
  const schuljahr = kurs.schuljahr || kal.schuljahr || '2025/26';
  const ausfalltage = kal.ausfalltage || [];
  const einzelAusfaelle = kal.einzelAusfaelle || [];

  const hjEnde = getHalbjahrEnde(schuljahr);
  const ferien = NRW_FERIEN[schuljahr] || [];
  const sjEnde = ferien.length ? strToDate(ferien[ferien.length - 1].von) : null;
  if (sjEnde) sjEnde.setUTCDate(sjEnde.getUTCDate() - 1);

  const gesamt  = berechneStunden(kurs, fp, schuljahr, ausfalltage, einzelAusfaelle);
  const restHj  = hjEnde ? berechneRestStunden(kurs, fp, schuljahr, ausfalltage, einzelAusfaelle, hjEnde) : null;
  const restSj  = sjEnde ? berechneRestStunden(kurs, fp, schuljahr, ausfalltage, einzelAusfaelle, sjEnde) : null;

  // Geplante Stunden aus Fachplanung zählen
  let geplantPflicht = 0, geplantOptional = 0, geplantPuffer = 0, geplantKA = 0;
  if (fp) {
    (fp.blocks || []).forEach(b => (b.reihen || []).forEach(r => (r.einheiten || []).forEach(e => (e.stunden || []).forEach(s => {
      const p = s.prioritaet || 'pflicht';
      if (p === 'pflicht') geplantPflicht++;
      else if (p === 'optional') geplantOptional++;
      else if (p === 'puffer') geplantPuffer++;
      else if (p === 'klassenarbeit' || p === 'rueckgabe') geplantKA++;
    }))));
  }
  const geplantGesamt = geplantPflicht + geplantOptional + geplantPuffer + geplantKA;

  const div = mk('div', '');

  // Header
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', kurs.klasse));
  left.appendChild(tx('div', 'c-sub',
    (fp ? fachLabel(fp.fach) + ' · Jg. ' + fp.jahrgang + ' · ' : '') + schuljahr
  ));
  hdr.appendChild(left);
  const einstellBtn = btn('⚙ Kurseinstellungen', 'btn btn-ghost btn-sm');
  einstellBtn.onclick = () => { S.view = 'kursEinstellungen'; S.aktKursDetailId = kursId; render(); };
  hdr.appendChild(einstellBtn);
  div.appendChild(hdr);

  // ── Klassenarbeiten ──────────────────────────────────────────
  const kal2 = S.data.kalender || {};
  const klassenarbeiten = (kal2.klassenarbeiten || []).filter(k => k.kursId === kursId);

  const kaCard = mk('div', 'card');
  const kaHdr = cardHdr('Klassenarbeiten');
  const addKaBtn = btn('+ Hinzufügen', 'btn btn-pri btn-xs');
  addKaBtn.onclick = () => { S.modal = { type: 'newKlassenarbeit', data: { kursId } }; render(); };
  kaHdr.appendChild(addKaBtn);
  kaCard.appendChild(kaHdr);
  const kab = mk('div', 'card-body');

  if (klassenarbeiten.length === 0) {
    kab.appendChild(gray('Noch keine Klassenarbeiten eingetragen.'));
  } else {
    const list = mk('div', '');
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    [...klassenarbeiten].sort((a,b) => a.datum.localeCompare(b.datum)).forEach(ka => {
      const row = mk('div', '');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--bord);border-radius:6px;background:var(--surf2);';
      const icon = tx('span', '', '📝');
      const info = mk('div', '');
      info.style.flex = '1';
      const titel = tx('div', '', (ka.titel || 'Klassenarbeit') + (ka.doppelstunde ? ' (Doppelstunde)' : ''));
      titel.style.fontWeight = '600';
      const sub = tx('div', '', ka.datum + ' · ' + ka.stunde + '. Stunde' + (ka.doppelstunde ? ' + ' + (parseInt(ka.stunde)+1) + '. Stunde' : ''));
      sub.style.cssText = 'font-size:12px;color:var(--tx3);';
      info.appendChild(titel); info.appendChild(sub);
      const del = btn('✕', 'col-action-btn danger');
      del.onclick = () => {
        S.data.kalender.klassenarbeiten = S.data.kalender.klassenarbeiten.filter(k => k.id !== ka.id);
        scheduleSave(); render();
      };
      row.appendChild(icon); row.appendChild(info); row.appendChild(del);
      list.appendChild(row);
    });
    kab.appendChild(list);
  }
  kaCard.appendChild(kab);
  div.appendChild(kaCard);

  // ── Zeitachse ─────────────────────────────────────────────────
  if (fp && (kurs.stundenplan || []).length > 0) {
    const zaCard = mk('div', 'card');
    zaCard.appendChild(cardHdr('Jahresplanung – Zeitachse'));
    const zab = mk('div', 'card-body');
    zab.appendChild(viewZeitachse(kursId));
    zaCard.appendChild(zab);
    div.appendChild(zaCard);
  } else if (fp) {
    const zaCard = mk('div', 'card');
    zaCard.appendChild(cardHdr('Jahresplanung – Zeitachse'));
    const zab = mk('div', 'card-body');
    zab.appendChild(gray('Stundenplan muss zuerst eingetragen werden (Kalender & Stundenplan).'));
    zaCard.appendChild(zab);
    div.appendChild(zaCard);
  }

  // ── Stunden-Übersicht ────────────────────────────────────────
  const stCard = mk('div', 'card');
  stCard.appendChild(cardHdr('Stunden-Übersicht'));
  const stb = mk('div', 'card-body');

  // ── Kopfzeile: drei Kennzahlen ───────────────────────────────
  const heute0 = new Date(); heute0.setHours(0,0,0,0);
  const zeigHj = hjEnde && hjEnde >= heute0;

  // Soll-Stunden aus Blöcken (stundenGesamt)
  let sollGesamt = 0;
  (fp ? fp.blocks || [] : []).forEach(b => {
    const g = parseInt(b.stundenGesamt);
    if (g > 0) sollGesamt += g;
  });

  // Klassenarbeits-Stunden
  let kaStunden = 0;
  klassenarbeiten.forEach(ka => { kaStunden += ka.doppelstunde ? 2 : 1; });

  const reserve = gesamt !== null && sollGesamt > 0 ? gesamt - sollGesamt - kaStunden : null;

  const kopf = mk('div', '');
  kopf.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;';

  function kennzahl(label, wert, farbe) {
    const box = mk('div', '');
    box.style.cssText = 'flex:1;min-width:120px;padding:10px 14px;border-radius:8px;border:1px solid var(--bord);background:var(--surf2);';
    const v = tx('div', '', wert !== null ? wert + ' Std.' : '–');
    v.style.cssText = 'font-size:20px;font-weight:800;color:' + (farbe || 'var(--pri)') + ';';
    const l = tx('div', '', label);
    l.style.cssText = 'font-size:11px;color:var(--tx2);margin-top:2px;font-weight:600;';
    box.appendChild(v); box.appendChild(l);
    return box;
  }

  kopf.appendChild(kennzahl('Verfügbar gesamt', gesamt));
  if (zeigHj) kopf.appendChild(kennzahl('Rest bis Hj-Ende', restHj));
  kopf.appendChild(kennzahl('Rest bis Sj-Ende', restSj));
  if (kaStunden > 0) {
    kopf.appendChild(kennzahl('Klassenarbeiten', kaStunden));
  }
  if (reserve !== null) {
    kopf.appendChild(kennzahl('Reserve', reserve, reserve >= 0 ? 'var(--grn)' : 'var(--red)'));
  }
  stb.appendChild(kopf);

  // ── Aufklappbarer Baum ───────────────────────────────────────
  if (!S._baumOffen) S._baumOffen = {};

  function offenColor(offen) {
    if (offen === null) return 'var(--tx3)';
    if (offen < 0) return 'var(--red)';
    if (offen === 0) return 'var(--grn)';
    return 'var(--tx)';
  }

  function tblRow(cols, opts) {
    // cols: [{text, align, bold, color, indent}]
    // opts: {bg, borderTop, borderBottom, clickable, onclick}
    const tr = document.createElement('tr');
    tr.style.cssText = 'border-bottom:1px solid ' + (opts.borderBottom || 'var(--surf2)') + ';' +
      (opts.borderTop ? 'border-top:2px solid var(--bord);' : '') +
      (opts.bg ? 'background:' + opts.bg + ';' : '') +
      (opts.clickable ? 'cursor:pointer;' : '');
    if (opts.clickable) {
      tr.onmouseenter = () => { tr.style.background = 'var(--surf2)'; };
      tr.onmouseleave = () => { tr.style.background = opts.bg || ''; };
      tr.onclick = opts.onclick;
    }
    cols.forEach(col => {
      const td = document.createElement('td');
      td.style.cssText = 'padding:' + (col.pad || '7px 10px') + ';text-align:' + (col.align || 'left') + ';' +
        (col.bold ? 'font-weight:700;' : '') +
        (col.color ? 'color:' + col.color + ';' : '') +
        (col.indent ? 'padding-left:' + col.indent + 'px;' : '');
      td.textContent = col.text;
      tr.appendChild(td);
    });
    return tr;
  }

  if (fp && (fp.blocks || []).length > 0) {
    const tbl = document.createElement('table');
    tbl.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;';

    // Header
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['Struktur', 'Soll', 'Geplant', 'Offen'].forEach((h, i) => {
      const th = document.createElement('th');
      th.textContent = h;
      th.style.cssText = 'padding:6px 10px;text-align:' + (i === 0 ? 'left' : 'right') +
        ';font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--bord);';
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    tbl.appendChild(thead);

    const tbody = document.createElement('tbody');
    let sumSoll = 0, sumGeplant = 0;

    (fp.blocks || []).forEach(block => {
      const blockId = kursId + '_b_' + block.id;
      const blockOffen = !!S._baumOffen[blockId];

      const soll = parseInt(block.stundenGesamt) || 0;
      const geplant = (block.reihen || []).reduce((s,r) =>
        s + (r.einheiten || []).reduce((s2,e) => s2 + (e.stunden||[]).length, 0), 0);
      const offen = soll > 0 ? soll - geplant : null;
      sumSoll += soll; sumGeplant += geplant;

      // Block-Zeile
      const blockPfeilCell = { text: '▶ ' + block.titel, bold: true };
      const blockRow = tblRow([
        blockPfeilCell,
        { text: soll || '–', align: 'right' },
        { text: geplant, align: 'right' },
        { text: offen !== null ? offen : '–', align: 'right', color: offenColor(offen), bold: offen !== null && offen !== 0 }
      ], { clickable: true, onclick: () => {} });
      tbody.appendChild(blockRow);

      // Reihen-Zeilen (initial versteckt)
      const reiheRows = [];
      (block.reihen || []).forEach(reihe => {
        const rgeplant = (reihe.einheiten || []).reduce((s,e) => s+(e.stunden||[]).length, 0);
        const rsoll = parseInt(reihe.stundenAnzahl) || 0;
        const roffen = rsoll > 0 ? rsoll - rgeplant : null;
        const reiheRow = tblRow([
          { text: '▶ ' + reihe.titel, indent: 24 },
          { text: rsoll || '–', align: 'right', color: rsoll ? undefined : 'var(--tx3)' },
          { text: rgeplant, align: 'right' },
          { text: roffen !== null ? roffen : '–', align: 'right', color: offenColor(roffen), bold: roffen !== null && roffen !== 0 }
        ], { clickable: true, bg: '#fafafa', onclick: () => {} });
        reiheRow.style.display = 'none';
        tbody.appendChild(reiheRow);

        // Einheit-Zeilen
        const einheitRows = [];
        (reihe.einheiten || []).forEach(einheit => {
          const egeplant = (einheit.stunden || []).length;
          const einheitRow = tblRow([
            { text: einheit.titel, indent: 48, color: 'var(--tx2)' },
            { text: '–', align: 'right', color: 'var(--tx3)' },
            { text: egeplant, align: 'right', color: 'var(--tx2)' },
            { text: '–', align: 'right', color: 'var(--tx3)' }
          ], { bg: '#f5f5f5' });
          einheitRow.style.display = 'none';
          tbody.appendChild(einheitRow);

          // Stunden-Zeilen
          const stundenRows = [];
          (einheit.stunden || []).forEach((stunde, si2) => {
            const PRIO = {pflicht:'🟢',optional:'🟡',puffer:'🔵',klassenarbeit:'📝',rueckgabe:'📋'};
            const icon = PRIO[stunde.prioritaet||'pflicht'] || '🟢';
            const stundeRow = tblRow([
              { text: icon + ' ' + (si2+1) + '. ' + (stunde.titel||'(ohne Titel)'), indent: 72, color: 'var(--tx3)' },
              { text: '–', align: 'right', color: 'var(--tx3)' },
              { text: '1', align: 'right', color: 'var(--tx3)' },
              { text: '–', align: 'right', color: 'var(--tx3)' }
            ], { bg: '#f0f0f0' });
            stundeRow.style.display = 'none';
            tbody.appendChild(stundeRow);
            stundenRows.push(stundeRow);
          });

          einheitRows.push({ row: einheitRow, stundenRows });

          // Einheit toggle
          einheitRow.style.cursor = 'pointer';
          einheitRow.onclick = () => {
            const open = stundenRows.length > 0 && stundenRows[0].style.display !== 'none';
            stundenRows.forEach(r => r.style.display = open ? 'none' : '');
            einheitRow.cells[0].textContent = (open ? '' : '') + einheit.titel;
          };
        });

        // Reihe toggle
        reiheRow.onclick = () => {
          const open = einheitRows.length > 0 && einheitRows[0].row.style.display !== 'none';
          einheitRows.forEach(({ row, stundenRows }) => {
            row.style.display = open ? 'none' : '';
            stundenRows.forEach(r => r.style.display = 'none');
          });
          reiheRow.cells[0].textContent = (open ? '▶ ' : '▼ ') + reihe.titel;
          reiheRow.cells[0].style.paddingLeft = '24px';
        };

        reiheRows.push({ row: reiheRow, einheitRows });
      });

      // Block toggle
      blockRow.onclick = () => {
        const open = reiheRows.length > 0 && reiheRows[0].row.style.display !== 'none';
        reiheRows.forEach(({ row, einheitRows }) => {
          row.style.display = open ? 'none' : '';
          einheitRows.forEach(({ row: er, stundenRows }) => {
            er.style.display = 'none';
            stundenRows.forEach(r => r.style.display = 'none');
          });
        });
        blockRow.cells[0].textContent = (open ? '▶ ' : '▼ ') + block.titel;
        blockRow.cells[0].style.fontWeight = '700';
      };
    });

    // Klassenarbeiten-Zeilen
    if (klassenarbeiten.length > 0) {
      klassenarbeiten.sort((a,b) => a.datum.localeCompare(b.datum)).forEach(ka => {
        const kaStd = ka.doppelstunde ? 2 : 1;
        tbody.appendChild(tblRow([
          { text: '📝 ' + (ka.titel || 'Klassenarbeit') + ' · ' + ka.datum, color: '#7c3aed' },
          { text: kaStd, align: 'right', color: '#7c3aed' },
          { text: kaStd, align: 'right', color: '#7c3aed' },
          { text: '0', align: 'right', color: 'var(--tx3)' }
        ], { bg: '#faf5ff' }));
      });
    }

    // Summenzeile
    const sumDiff = sumSoll > 0 ? sumSoll - sumGeplant - kaStunden : null;
    tbody.appendChild(tblRow([
      { text: 'Summe inkl. Klassenarbeiten', bold: true },
      { text: (sumSoll + kaStunden) || '–', align: 'right', bold: true },
      { text: sumGeplant + kaStunden, align: 'right', bold: true },
      { text: sumDiff !== null ? sumDiff : '–', align: 'right', bold: true, color: offenColor(sumDiff) }
    ], { borderTop: true, bg: 'var(--surf2)' }));

    tbl.appendChild(tbody);
    stb.appendChild(tbl);
  } else if (fp) {
    stb.appendChild(gray('Noch keine Blöcke in der Fachplanung.'));
  }

  stCard.appendChild(stb);
  div.appendChild(stCard);

  // ── Einzelausfälle dieses Kurses ────────────────────────────
  const kursAusfaelle = einzelAusfaelle.filter(a => a.kursId === kurs.id);
  const ausCard = mk('div', 'card');
  const ausHdr = cardHdr('Einzelausfälle');
  const addAusBtn = btn('+ Hinzufügen', 'btn btn-pri btn-xs');
  addAusBtn.onclick = () => { S.modal = { type: 'einzelStunden', data: { kursId: kurs.id } }; render(); };
  ausHdr.appendChild(addAusBtn);
  ausCard.appendChild(ausHdr);
  const ausb = mk('div', 'card-body');

  if (kursAusfaelle.length === 0) {
    ausb.appendChild(gray('Keine Einzelausfälle eingetragen.'));
  } else {
    const list = mk('div', '');
    list.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    [...kursAusfaelle].sort((a,b) => a.datum.localeCompare(b.datum)).forEach(a => {
      const chip = mk('div', '');
      chip.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 10px;background:#fee2e2;border:1px solid #fca5a5;border-radius:20px;font-size:12px;color:#dc2626;';
      const grund = ((kal2.einzelAusfaelleGruende || {})[kursId + '_' + a.datum] || '');
      chip.appendChild(tx('span', '', a.datum + ' · Std. ' + a.stunde + (grund ? ' · ' + grund : '')));
      const del = mk('button', '');
      del.textContent = '✕'; del.style.cssText = 'border:none;background:none;cursor:pointer;color:#dc2626;font-size:11px;padding:0;';
      del.onclick = () => {
        S.data.kalender.einzelAusfaelle = einzelAusfaelle.filter(x =>
          !(x.kursId === a.kursId && x.datum === a.datum && x.stunde === a.stunde)
        );
        scheduleSave(); render();
      };
      chip.appendChild(del);
      list.appendChild(chip);
    });
    ausb.appendChild(list);
  }
  ausCard.appendChild(ausb);
  div.appendChild(ausCard);

  return div;
}
