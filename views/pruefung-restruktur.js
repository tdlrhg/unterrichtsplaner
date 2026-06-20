// ── Anforderungsbereich-Konfiguration (global) ───────────────────
const AB_KEY_MAP = {
  reproduktion:      { letter: 'R', color: '#16a34a', title: 'Reproduktion' },
  leichteAnwendung:  { letter: 'A', color: '#ca8a04', title: 'Leichte Anwendung' },
  mittlereAnwendung: { letter: 'A', color: '#ea580c', title: 'Mittlere Anwendung' },
  transfer:          { letter: 'T', color: '#dc2626', title: 'Transfer' },
};

// ── Umstrukturierungs-Overlay ─────────────────────────────────────
// Erlaubt: Aufgaben zusammenführen, trennen, Teilaufgaben verschieben,
// Aufgabe hinzufügen/löschen — ohne das Hauptpanel zu verlassen.
function showRestrukturierungOverlay(pr, afterSave) {
  const ov = mk('div', 'matd-overlay');
  const pan = mk('div', 'matd-panel');
  pan.style.cssText = 'max-width:820px;width:95vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;';

  const phdr = mk('div', 'matd-panel-hdr');
  phdr.appendChild(tx('span', 'matd-panel-title', 'Aufgaben umstrukturieren'));
  const cls = btn('✕', 'btn btn-ghost btn-sm matd-close');
  const closeOverlay = () => { savePruefungsDB(); afterSave(); ov.remove(); };
  cls.onclick = closeOverlay;
  ov.onclick = e => { if (e.target === ov) closeOverlay(); };
  phdr.appendChild(cls);
  pan.appendChild(phdr);

  // Hint
  const hint = tx('div', '', 'Zeilen per Drag & Drop zwischen Aufgaben verschieben. Aufgaben zusammenführen oder an einer Zeile trennen.');
  hint.style.cssText = 'font-size:12px;color:var(--tx3);padding:8px 16px 0;';
  pan.appendChild(hint);

  const body = mk('div', '');
  body.style.cssText = 'padding:12px 16px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:10px;';

  let dragSrcTaskIdx = null;
  let dragSrcLineIdx = null;

  function getLines(fs) {
    return (fs.spezifikation || '').split('\n').map(l => l.replace(/^[-–•]\s*/, '').trim()).filter(l => l);
  }
  function saveLines(fs, lines) {
    fs.spezifikation = lines.map(l => '- ' + l).join('\n');
  }
  function syncNrs() {
    pr.feinstruktur.forEach((f, i) => { f.nr = i + 1; });
    pr.genAufgaben.forEach(ga => {
      const fs = pr.feinstruktur.find(f => f.taskId === ga.taskId);
      if (fs) ga.nr = fs.nr;
    });
  }

  function rebuildBody() {
    body.innerHTML = '';

    // + Neue Aufgabe
    const addBtn = btn('+ Neue Aufgabe hinzufügen', 'btn btn-ghost btn-sm');
    addBtn.onclick = () => {
      const maxNr = pr.feinstruktur.reduce((m, f) => Math.max(m, f.nr || 0), 0);
      pr.feinstruktur.push({
        taskId: uid(), nr: maxNr + 1, titel: 'Neue Aufgabe',
        zeitMinuten: 10, gesamtpunkte: 8, spezifikation: '', _feinLocked: false,
      });
      syncNrs(); rebuildBody();
    };
    body.appendChild(addBtn);

    pr.feinstruktur.forEach((fs, taskIdx) => {
      const lines = getLines(fs);

      const taskCard = mk('div', '');
      taskCard.style.cssText = 'border:1px solid var(--bord);border-radius:10px;overflow:hidden;';

      // ── Aufgaben-Header
      const taskHead = mk('div', '');
      taskHead.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(124,58,237,.06);flex-wrap:wrap;';

      const nrBadge = tx('div', '', String(taskIdx + 1));
      nrBadge.style.cssText = 'width:22px;height:22px;border-radius:50%;background:var(--pri);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
      taskHead.appendChild(nrBadge);

      const titelInp = document.createElement('input');
      titelInp.value = fs.titel || '';
      titelInp.style.cssText = 'flex:1;min-width:120px;font-size:13px;font-weight:700;border:none;background:transparent;color:var(--tx1);outline:none;border-bottom:1px dashed transparent;';
      titelInp.onmouseenter = () => { titelInp.style.borderBottomColor = 'var(--tx3)'; };
      titelInp.onmouseleave = () => { if (document.activeElement !== titelInp) titelInp.style.borderBottomColor = 'transparent'; };
      titelInp.onfocus = () => { titelInp.style.borderBottomColor = 'var(--pri)'; };
      titelInp.onblur = () => { titelInp.style.borderBottomColor = 'transparent'; fs.titel = titelInp.value.trim() || fs.titel; };
      taskHead.appendChild(titelInp);

      const spacer = mk('span', ''); spacer.style.flex = '1'; taskHead.appendChild(spacer);

      // Aufgabe nach oben / unten verschieben
      if (taskIdx > 0) {
        const upBtn = btn('↑', 'btn btn-ghost btn-xs');
        upBtn.title = 'Aufgabe nach oben';
        upBtn.onclick = () => {
          pr.feinstruktur.splice(taskIdx - 1, 0, pr.feinstruktur.splice(taskIdx, 1)[0]);
          syncNrs(); rebuildBody();
        };
        taskHead.appendChild(upBtn);
      }
      if (taskIdx < pr.feinstruktur.length - 1) {
        const downBtn = btn('↓', 'btn btn-ghost btn-xs');
        downBtn.title = 'Aufgabe nach unten';
        downBtn.onclick = () => {
          pr.feinstruktur.splice(taskIdx + 1, 0, pr.feinstruktur.splice(taskIdx, 1)[0]);
          syncNrs(); rebuildBody();
        };
        taskHead.appendChild(downBtn);
      }

      // Zusammenführen mit nächster Aufgabe
      if (taskIdx < pr.feinstruktur.length - 1) {
        const mergeBtn = btn('⇣ Zusammenführen', 'btn btn-ghost btn-xs');
        mergeBtn.title = 'Mit der nächsten Aufgabe zusammenführen';
        mergeBtn.onclick = () => {
          const nextFs = pr.feinstruktur[taskIdx + 1];
          saveLines(fs, [...lines, ...getLines(nextFs)]);
          fs.zeitMinuten = (fs.zeitMinuten || 0) + (nextFs.zeitMinuten || 0);
          fs.gesamtpunkte = (fs.gesamtpunkte || 0) + (nextFs.gesamtpunkte || 0);
          pr.feinstruktur.splice(taskIdx + 1, 1);
          syncNrs(); rebuildBody();
        };
        taskHead.appendChild(mergeBtn);
      }

      // Aufgabe löschen
      if (pr.feinstruktur.length > 1) {
        const delTaskBtn = btn('✕', 'btn btn-ghost btn-xs');
        delTaskBtn.style.color = 'var(--tx3)';
        delTaskBtn.title = 'Aufgabe löschen';
        delTaskBtn.onclick = () => {
          if (lines.length && !confirm(`Aufgabe "${fs.titel}" mit ${lines.length} Teilaufgabe(n) löschen?`)) return;
          pr.feinstruktur.splice(taskIdx, 1);
          pr.genAufgaben = pr.genAufgaben.filter(ga => ga.taskId !== fs.taskId);
          syncNrs(); rebuildBody();
        };
        taskHead.appendChild(delTaskBtn);
      }
      taskCard.appendChild(taskHead);

      // ── Zeilen-Drop-Zone
      const linesWrap = mk('div', '');
      linesWrap.style.cssText = 'min-height:36px;padding:6px 10px;display:flex;flex-direction:column;gap:1px;';
      linesWrap.ondragover = e => { e.preventDefault(); linesWrap.style.outline = '2px dashed var(--pri)'; };
      linesWrap.ondragleave = () => { linesWrap.style.outline = ''; };
      linesWrap.ondrop = e => {
        e.preventDefault(); linesWrap.style.outline = '';
        if (dragSrcTaskIdx === null || dragSrcTaskIdx === taskIdx) return;
        const srcFs = pr.feinstruktur[dragSrcTaskIdx];
        const srcLines = getLines(srcFs);
        const [moved] = srcLines.splice(dragSrcLineIdx, 1);
        saveLines(srcFs, srcLines);
        const destLines = getLines(fs);
        destLines.push(moved);
        saveLines(fs, destLines);
        dragSrcTaskIdx = null; dragSrcLineIdx = null;
        rebuildBody();
      };

      if (!lines.length) {
        const empty = tx('div', '', 'Leer — Teilaufgaben hierher ziehen');
        empty.style.cssText = 'font-size:11px;color:var(--tx3);padding:6px 0;font-style:italic;';
        linesWrap.appendChild(empty);
      }

      lines.forEach((line, lineIdx) => {
        const pipeIdx = line.indexOf('|');
        const afbKey = pipeIdx > -1 ? line.slice(0, pipeIdx).trim() : null;
        const abCfg = afbKey ? AB_KEY_MAP[afbKey] : null;
        const afterPipe = afbKey ? line.slice(pipeIdx + 1).trim() : line;
        const lastPipe = afterPipe.lastIndexOf('|');
        const punkte = (lastPipe > -1 && /^\d+$/.test(afterPipe.slice(lastPipe + 1).trim()))
          ? parseInt(afterPipe.slice(lastPipe + 1).trim()) : null;
        const displayText = punkte !== null ? afterPipe.slice(0, lastPipe).trim() : afterPipe;

        const lineRow = mk('div', '');
        lineRow.draggable = true;
        lineRow.style.cssText = 'display:flex;align-items:flex-start;gap:6px;padding:4px 6px;border-radius:6px;cursor:grab;';
        lineRow.ondragstart = () => {
          dragSrcTaskIdx = taskIdx; dragSrcLineIdx = lineIdx;
          lineRow.style.opacity = '.4';
        };
        lineRow.ondragend = () => { lineRow.style.opacity = ''; };
        lineRow.onmouseenter = () => { lineRow.style.background = 'var(--surf2)'; delLineBtn.style.opacity = '1'; if (lineIdx < lines.length - 1) splitBtn.style.opacity = '1'; };
        lineRow.onmouseleave = () => { lineRow.style.background = ''; delLineBtn.style.opacity = '0'; if (lineIdx < lines.length - 1) splitBtn.style.opacity = '0'; };

        const handle = tx('span', '', '⠿');
        handle.style.cssText = 'color:var(--tx3);font-size:13px;flex-shrink:0;';
        lineRow.appendChild(handle);

        const badge = tx('div', '', abCfg ? abCfg.letter : '·');
        badge.title = abCfg?.title || '';
        badge.style.cssText = `width:18px;height:18px;border-radius:50%;background:${abCfg ? abCfg.color+'22' : 'var(--bord)'};color:${abCfg?.color||'var(--tx3)'};font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
        lineRow.appendChild(badge);

        const text = tx('span', '', displayText);
        text.style.cssText = 'flex:1;font-size:12px;color:var(--tx2);word-break:break-word;';
        lineRow.appendChild(text);

        if (punkte !== null) {
          const pt = tx('span', '', punkte + ' P');
          pt.style.cssText = `font-size:11px;font-weight:600;color:${abCfg?.color||'var(--tx3)'};flex-shrink:0;`;
          lineRow.appendChild(pt);
        }

        // Trennen-Button (ab dieser Zeile neue Aufgabe)
        const splitBtn = btn('✂', '');
        splitBtn.title = 'Ab der nächsten Zeile neue Aufgabe beginnen';
        splitBtn.style.cssText = 'border:none;background:none;color:var(--pri);cursor:pointer;font-size:12px;padding:2px 5px;flex-shrink:0;opacity:0;transition:opacity .1s;';
        if (lineIdx < lines.length - 1) {
          splitBtn.onclick = () => {
            const before = lines.slice(0, lineIdx + 1);
            const after = lines.slice(lineIdx + 1);
            const halfZ = Math.max(1, Math.round((fs.zeitMinuten || 10) / 2));
            const halfP = Math.max(1, Math.round((fs.gesamtpunkte || 8) / 2));
            saveLines(fs, before);
            fs.zeitMinuten = halfZ;
            fs.gesamtpunkte = halfP;
            const newFs = {
              taskId: uid(), nr: fs.nr + 1, titel: 'Neue Aufgabe',
              zeitMinuten: halfZ, gesamtpunkte: halfP,
              anforderung: fs.anforderung ? { ...fs.anforderung } : {},
              spezifikation: after.map(l => '- ' + l).join('\n'),
              _feinLocked: false,
            };
            pr.feinstruktur.splice(taskIdx + 1, 0, newFs);
            syncNrs(); rebuildBody();
          };
          lineRow.appendChild(splitBtn);
        }

        // Zeile löschen
        const delLineBtn = btn('✕', '');
        delLineBtn.title = 'Zeile löschen';
        delLineBtn.style.cssText = 'border:none;background:none;color:var(--tx3);cursor:pointer;font-size:11px;padding:2px 4px;flex-shrink:0;opacity:0;transition:opacity .1s;';
        delLineBtn.onclick = () => {
          const ls = [...lines]; ls.splice(lineIdx, 1);
          saveLines(fs, ls); rebuildBody();
        };
        lineRow.appendChild(delLineBtn);

        linesWrap.appendChild(lineRow);
      });

      taskCard.appendChild(linesWrap);
      body.appendChild(taskCard);
    });
  }

  rebuildBody();
  pan.appendChild(body);

  const foot = mk('div', '');
  foot.style.cssText = 'padding:10px 16px;border-top:1px solid var(--bord);display:flex;gap:8px;justify-content:flex-end;background:var(--surf);';
  const doneBtn = btn('Übernehmen & Schließen', 'btn btn-pri btn-sm');
  doneBtn.onclick = closeOverlay;
  foot.appendChild(doneBtn);
  pan.appendChild(foot);

  ov.appendChild(pan);
  document.getElementById('root').appendChild(ov);
  ov.classList.add('open');
}
