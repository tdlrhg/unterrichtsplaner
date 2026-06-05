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
  pan.style.cssText = 'max-width:820px;width:95vw;max-height:90vh;display:flex;flex-direction:column;';

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
        lineRow.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:grab;';
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
        text.style.cssText = 'flex:1;font-size:12px;color:var(--tx2);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;';
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

// ── Aufgaben-Tab: KI-Generierung ─────────────────────────────────
function buildAufgabenGenTab(pr) {
  const div = mk('div', '');
  if (!pr.genAufgaben) pr.genAufgaben = [];
  if (!pr.strukturVorschlag) pr.strukturVorschlag = [];
  if (!pr.feinstruktur) pr.feinstruktur = [];
  if (typeof pr.grobstrukturLocked !== 'boolean') pr.grobstrukturLocked = !!pr.feinstruktur.length;

  function getActiveTasks() {
    return pr.strukturVorschlag.filter(a => !a._removed);
  }
  function ensureTaskMeta() {
    pr.strukturVorschlag.forEach(aufg => {
      if (!aufg.taskId) aufg.taskId = uid();
      if (typeof aufg._grobUnlocked !== 'boolean') aufg._grobUnlocked = !pr.grobstrukturLocked;
      if (typeof aufg._needsFeinUpdate !== 'boolean') aufg._needsFeinUpdate = false;
    });
    const aktive = getActiveTasks();
    pr.feinstruktur.forEach((fs, idx) => {
      if (!fs.taskId && aktive[idx]) fs.taskId = aktive[idx].taskId;
    });
    pr.genAufgaben.forEach((ga, idx) => {
      if (!ga.taskId) {
        const fsMatch = pr.feinstruktur.find(fs => fs.nr === ga.nr) || pr.feinstruktur[idx];
        ga.taskId = fsMatch?.taskId || aktive[idx]?.taskId || uid();
      }
    });
    pr.feinstruktur.forEach(fs => {
      if (typeof fs._feinLocked !== 'boolean') fs._feinLocked = false;
    });
  }
  function isTaskFeinLocked(taskId) {
    return !!pr.feinstruktur.find(fs => fs.taskId === taskId)?._feinLocked;
  }
  function styleLockButton(el, isLocked, compact = false) {
    el.style.cssText = [
      'border:none',
      `background:${isLocked ? '#dc2626' : '#16a34a'}`,
      'color:#fff',
      'cursor:pointer',
      `font-size:${compact ? '13px' : '15px'}`,
      `padding:${compact ? '4px 8px' : '5px 10px'}`,
      'border-radius:999px',
      'font-weight:700',
      'line-height:1',
      'box-shadow:0 1px 2px rgba(0,0,0,.12)',
      'flex-shrink:0',
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      `min-width:${compact ? '34px' : '40px'}`,
    ].join(';');
  }
  function syncDerivedOrder() {
    const order = getActiveTasks().map(a => a.taskId);
    const orderIdx = id => {
      const idx = order.indexOf(id);
      return idx < 0 ? 9999 : idx;
    };
    pr.feinstruktur.sort((a, b) => orderIdx(a.taskId) - orderIdx(b.taskId));
    pr.genAufgaben.sort((a, b) => orderIdx(a.taskId) - orderIdx(b.taskId));
    pr.feinstruktur.forEach((fs, idx) => { fs.nr = idx + 1; });
    pr.genAufgaben.forEach((ga, idx) => {
      ga.nr = idx + 1;
      const fs = pr.feinstruktur.find(x => x.taskId === ga.taskId);
      if (fs) ga.titel = fs.titel;
    });
  }
  function invalidateGeneratedTask(taskId) {
    pr.genAufgaben = pr.genAufgaben.filter(ga => ga.taskId !== taskId);
  }
  function markTaskDirty(aufg) {
    aufg._needsFeinUpdate = true;
    invalidateGeneratedTask(aufg.taskId);
    savePruefungsDB();
  }
  function syncTaskAcrossViews(taskId, patch) {
    const sv = pr.strukturVorschlag.find(a => a.taskId === taskId);
    if (sv) Object.assign(sv, patch);
    const fs = pr.feinstruktur.find(a => a.taskId === taskId);
    if (fs) Object.assign(fs, patch);
    const ga = pr.genAufgaben.find(a => a.taskId === taskId);
    if (ga) Object.assign(ga, patch);
  }
  function buildFeinstrukturPrompt(aufg, aufgNr, lernziele, quellenTexte) {
    let p = `Du planst Aufgabe ${aufgNr} einer Klassenarbeit.\n`;
    p += `Thema/Titel: ${aufg.titel}\n`;
    p += `Beschreibung: ${aufg.beschreibung}\n`;
    p += `Zeit: ${aufg.zeitMinuten ?? '?'} Min, ${aufg.gesamtpunkte ?? '?'} Punkte\n`;
    p += `Aufgabentypen: ${(aufg.typen||[]).join(', ')}\n`;
    const anf2 = aufg.anforderung || {};
    const erlaubt2 = Object.keys(AB_KEY_MAP).filter(k => (anf2[k] || 0) > 0);
    const verboten2 = Object.keys(AB_KEY_MAP).filter(k => (anf2[k] || 0) === 0);
    if (erlaubt2.length) {
      p += `\n## ANFORDERUNGSBEREICHE — VERBINDLICH\nErlaubt: ${erlaubt2.join(', ')}\n`;
      if (verboten2.length) p += `VERBOTEN (keinesfalls verwenden): ${verboten2.join(', ')}\n`;
    }
    p += '\n';
    if (lernziele.length) { p += '## LERNZIELE\n'; lernziele.slice(0,8).forEach(lz => { p += `- ${lz}\n`; }); p += '\n'; }
    if (quellenTexte.trim()) {
      p += `## AUFGABEN AUS DEINEN QUELLEN\nOrientiere dich an Schwierigkeitsgrad, Aufgabentypen und Formulierungen dieser Vorlagen:\n${quellenTexte}\n`;
    }
    p += `Beschreibe die Unteraufgaben in kompakter Kurzform.
Für jede Unteraufgabe mit Pfeil: zuerst Anforderungsbereich (NUR erlaubte: ${erlaubt2.length ? erlaubt2.join(', ') : 'alle'}), dann | dann Kennung: Vorgabe → Schülertätigkeit.
Allgemeine Hinweise (Gesamtzahl, Reihenfolge) als eigene Zeile ohne Pfeil und ohne |.

FORMAT (genau so, kein Fließtext):
anforderungsbereich|Kennung: Vorgabe → Schülertätigkeit · ggf. weiteres

Antworte NUR mit reinem JSON:
{"spezifikation":"5 Unteraufgaben, steigend schwerer\\nreproduktion|1a–1c: Bruch → Dezimalzahl · Prozent\\nleichteAnwendung|1d–1e: Dezimalzahl → Bruch · Prozent\\nmittlereAnwendung|1f: Sachtext (Prozentwert gegeben) → Grundwert berechnen"}`;
    return p;
  }
  async function generateFeinstrukturForTask(aufg, aufgNr, lernziele, quellenTexte) {
    let spezifikation = '';
    try {
      const raw = await callKI([{ type: 'text', text: buildFeinstrukturPrompt(aufg, aufgNr, lernziele, quellenTexte) }], 1500);
      const parsed = parseKI(raw);
      spezifikation = parsed.spezifikation || '';
    } catch (parseErr) {
      spezifikation = '⚠ KI-Fehler: ' + parseErr.message.slice(0, 80);
    }
    return {
      taskId: aufg.taskId,
      nr: aufgNr,
      titel: aufg.titel,
      zeitMinuten: aufg.zeitMinuten,
      gesamtpunkte: aufg.gesamtpunkte,
      typen: aufg.typen,
      anforderung: aufg.anforderung,
      spezifikation,
    };
  }
  // Prüft ob eine Zeile eine strukturierte AFB-Aufgabenzeile ist (hat AFB-Präfix, mit oder ohne →)
  function isAfbLine(line) {
    const pipeIdx = line.indexOf('|');
    if (pipeIdx < 0) return false;
    const afbKey = line.slice(0, pipeIdx).trim();
    return !!AB_KEY_MAP[afbKey];
  }
  function countSpecStats(specText) {
    const lines = (specText || '').split('\n').map(l => l.replace(/^[-–•]\s*/, '').trim()).filter(Boolean);
    let teilaufgaben = 0;
    let punkte = 0;
    lines.forEach(line => {
      if (!isAfbLine(line)) return;
      teilaufgaben++;
      const lastPipe = line.lastIndexOf('|');
      // lastPipe muss hinter dem ersten | liegen (sonst ist es nur der AFB-Trenner)
      const firstPipe = line.indexOf('|');
      if (lastPipe > firstPipe) {
        const maybeP = line.slice(lastPipe + 1).trim();
        if (/^\d+$/.test(maybeP)) punkte += parseInt(maybeP);
      }
    });
    return { teilaufgaben, punkte };
  }
  function distributePointsAcrossSpec(fs) {
    const lines = (fs.spezifikation || '').split('\n').map(l => l.replace(/^[-–•]\s*/, '').trim()).filter(Boolean);
    const idxs = lines.map((line, idx) => isAfbLine(line) ? idx : -1).filter(idx => idx > -1);
    if (!idxs.length || !fs.gesamtpunkte) return false;
    const base = Math.floor(fs.gesamtpunkte / idxs.length);
    let rest = fs.gesamtpunkte - base * idxs.length;
    idxs.forEach((lineIdx, pos) => {
      let line = lines[lineIdx];
      const lastPipe = line.lastIndexOf('|');
      if (lastPipe > -1) {
        const maybeP = line.slice(lastPipe + 1).trim();
        if (/^\d+$/.test(maybeP)) line = line.slice(0, lastPipe).trim();
      }
      const p = base + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      lines[lineIdx] = line + '|' + p;
    });
    fs.spezifikation = lines.map(l => '- ' + l).join('\n');
    return true;
  }
  async function reviseFeinstrukturTask(fs, instruction, label) {
    const erlaubt = Object.keys(AB_KEY_MAP).filter(k => (fs.anforderung?.[k] || 0) > 0);
    let p = `Du überarbeitest die Feinstruktur einer einzelnen Klassenarbeits-Aufgabe.\n\n`;
    p += `Aufgabe ${fs.nr}: ${fs.titel}\n`;
    p += `Zeit: ${fs.zeitMinuten ?? '?'} Min, ${fs.gesamtpunkte ?? '?'} Punkte\n`;
    if (erlaubt.length) p += `Erlaubte Anforderungsbereiche: ${erlaubt.join(', ')}\n`;
    p += `\nAKTUELLE FEINSTRUKTUR\n${fs.spezifikation}\n\n`;
    p += `AUFTRAG\n${instruction}\n\n`;
    p += `WICHTIG\n- Behalte Thema und Grundidee der Aufgabe bei\n- Überarbeite nur die Feinstruktur, nicht die ganze Klassenarbeit\n- Wenn Punkteangaben vorhanden sind, liefere weiter Punkte pro Teilaufgabe mit |Zahl\n- Verwende nur diese Anforderungsbereiche: ${erlaubt.length ? erlaubt.join(', ') : 'reproduktion, leichteAnwendung, mittlereAnwendung, transfer'}\n- Gib nur die neue Feinstruktur zurück, kein Kommentar\n\n`;
    p += `Antworte NUR mit reinem JSON:\n{"spezifikation":"reproduktion|1a: ... → ...|2\\nleichteAnwendung|1b: ... → ...|3"}`;
    statusEl.textContent = `⏳ Feinstruktur wird überarbeitet (${label})...`;
    const raw = await callKI([{ type: 'text', text: p }], 1800);
    const parsed = parseKI(raw);
    if (!parsed.spezifikation) throw new Error('Keine neue Feinstruktur erhalten');
    fs.spezifikation = parsed.spezifikation;
    invalidateGeneratedTask(fs.taskId);
    savePruefungsDB();
  }

  ensureTaskMeta();
  syncDerivedOrder();

  // AB_KEY_MAP ist auf Modulebene definiert (ganz oben in dieser Datei)

  // ── Sub-Tab-Gerüst ────────────────────────────────────────────
  const panel1 = mk('div', '');
  const panel2 = mk('div', '');
  const panel3 = mk('div', '');
  const panel4 = mk('div', '');
  let aktiverSubTab = pr.genAufgaben.length ? 3 : pr.feinstruktur.length ? 2 : 1;

  const subTabBar = mk('div', '');
  subTabBar.style.cssText = 'display:flex;gap:0;border-bottom:2px solid var(--bord);margin-bottom:18px;';

  function switchSubTab(n) {
    aktiverSubTab = n;
    [panel1, panel2, panel3, panel4].forEach((p, i) => { p.style.display = i + 1 === n ? '' : 'none'; });
    subTabBar.querySelectorAll('.ag-subtab').forEach((b, i) => {
      const active = i + 1 === n;
      b.style.borderBottom = active ? '2px solid var(--pri)' : '2px solid transparent';
      b.style.color = active ? 'var(--pri)' : 'var(--tx2)';
      b.style.fontWeight = active ? '700' : '400';
    });
  }

  [
    ['① Grobstruktur', 1],
    ['② Feinstruktur', 2],
    ['③ Aufgaben',     3],
    ['⚙ Einstellungen', 4],
  ].forEach(([label, n]) => {
    const b = mk('button', 'btn btn-ghost btn-sm ag-subtab');
    b.textContent = label;
    b.style.cssText = 'border-radius:6px 6px 0 0;border-bottom:2px solid transparent;margin-bottom:-2px;padding:6px 14px;font-size:13px;';
    b.onclick = () => switchSubTab(n);
    subTabBar.appendChild(b);
  });

  // ── Referenzzeitraum ──────────────────────────────────────────
  const zeitRow = mk('div', '');
  zeitRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:13px;color:var(--tx2);flex-wrap:wrap;';
  zeitRow.appendChild(tx('span', '', 'Die KI nutzt die Arbeiten der letzten'));
  const jahrInp = document.createElement('input');
  jahrInp.type = 'number'; jahrInp.step = '0.5'; jahrInp.min = '0.5'; jahrInp.max = '10';
  jahrInp.value = pr.referenzJahre ?? 2;
  jahrInp.style.cssText = 'width:58px;padding:4px 8px;border:1px solid var(--bord);border-radius:5px;background:var(--surf2);color:var(--tx1);font-size:13px;text-align:center;';
  jahrInp.onchange = () => { pr.referenzJahre = parseFloat(jahrInp.value) || 2; savePruefungsDB(); };
  zeitRow.appendChild(jahrInp);
  zeitRow.appendChild(tx('span', '', 'Jahre als Referenz für den Kompositionsstil.'));
  panel4.appendChild(zeitRow);

  // ── Kompositionsstil ─────────────────────────────────────────
  const stilSec = mk('div', '');
  stilSec.style.cssText = 'margin-bottom:20px;';
  const stilHdr = mk('div', '');
  stilHdr.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
  stilHdr.appendChild(tx('span', '', 'Mein Kompositionsstil'));
  stilHdr.lastChild.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);';
  const resetBtn = btn('Zurücksetzen', 'btn btn-ghost btn-xs');
  resetBtn.style.marginLeft = 'auto';
  stilHdr.appendChild(resetBtn);
  stilSec.appendChild(stilHdr);

  const stilArea = document.createElement('textarea');
  stilArea.value = KOMPOSITIONSSTIL;
  stilArea.style.cssText = 'width:100%;min-height:110px;padding:10px;font-size:13px;line-height:1.6;border:1px solid var(--bord);border-radius:6px;background:var(--surf2);color:var(--tx1);resize:vertical;box-sizing:border-box;';
  stilArea.oninput = () => { KOMPOSITIONSSTIL = stilArea.value; saveKompositionsstil(); };
  resetBtn.onclick = () => { KOMPOSITIONSSTIL = KOMPOSITIONSSTIL_DEFAULT; stilArea.value = KOMPOSITIONSSTIL; saveKompositionsstil(); };
  stilSec.appendChild(stilArea);

  const stilHint = tx('div', '', 'Gilt für alle Prüfungen. Die KI nutzt dies zusätzlich zur Analyse deiner Referenzarbeiten.');
  stilHint.style.cssText = 'font-size:11px;color:var(--tx3);margin-top:4px;';
  stilSec.appendChild(stilHint);
  panel4.appendChild(stilSec);

  // ── AFB-Zielkorridore in Einstellungen ────────────────────────
  const afbZielSec = mk('div', '');
  afbZielSec.style.cssText = 'margin-top:24px;';
  const afbZielHdr = tx('div', '', 'Zielkorridore Anforderungsbereiche');
  afbZielHdr.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);margin-bottom:10px;';
  afbZielSec.appendChild(afbZielHdr);

  if (!pr.afbZiele) pr.afbZiele = { afb1: { min: 30, max: 50 }, afb2: { min: 35, max: 50 }, afb3: { min: 15, max: 25 } };

  [
    { key: 'afb1', label: 'AFB I', sub: 'Reproduktion + Leichte Anwendung', color: '#ca8a04' },
    { key: 'afb2', label: 'AFB II', sub: 'Mittlere Anwendung', color: '#ea580c' },
    { key: 'afb3', label: 'AFB III', sub: 'Transfer', color: '#dc2626' },
  ].forEach(({ key, label, sub, color }) => {
    const row = mk('div', '');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;';
    const lbl = mk('div', '');
    lbl.style.cssText = 'min-width:80px;';
    lbl.appendChild(tx('span', '', label)).style || (lbl.lastChild.style.cssText = `font-size:13px;font-weight:700;color:${color};`);
    lbl.appendChild(tx('div', '', sub)).style || (lbl.lastChild.style.cssText = 'font-size:11px;color:var(--tx3);');
    row.appendChild(lbl);
    const makeZielInp = (field) => {
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = 0; inp.max = 100; inp.step = 5;
      inp.value = pr.afbZiele[key][field];
      inp.style.cssText = 'width:54px;padding:4px 8px;border:1px solid var(--bord);border-radius:5px;background:var(--surf2);color:var(--tx1);font-size:13px;text-align:center;';
      inp.onchange = () => { pr.afbZiele[key][field] = parseInt(inp.value) || 0; savePruefungsDB(); renderAFBBanner(); };
      return inp;
    };
    row.appendChild(tx('span', '', 'Min'));
    row.lastChild.style.cssText = 'font-size:12px;color:var(--tx3);';
    row.appendChild(makeZielInp('min'));
    row.appendChild(tx('span', '', '%  —  Max'));
    row.lastChild.style.cssText = 'font-size:12px;color:var(--tx3);';
    row.appendChild(makeZielInp('max'));
    row.appendChild(tx('span', '', '%'));
    row.lastChild.style.cssText = 'font-size:12px;color:var(--tx3);';
    afbZielSec.appendChild(row);
  });
  panel4.appendChild(afbZielSec);

  const statusEl = mk('div', '');
  statusEl.style.cssText = 'font-size:13px;color:var(--tx2);min-height:18px;margin:8px 0 12px;';

  // ── Quellen-Kontext aufbauen (shared) ─────────────────────────
  function buildKontext() {
    const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - (pr.referenzJahre ?? 2) * msPerYear);
    const refArbeiten = ALTE_ARBEITEN_DB.filter(aa => aa.datum && new Date(aa.datum) >= cutoff);
    const quellenAA = (pr.quellen?.alteArbeiten || []).map(id => ALTE_ARBEITEN_DB.find(aa => aa.id === id)).filter(Boolean);
    const quellenKap = [];
    (pr.quellen?.kapitel || []).forEach(kapId => {
      SCHULBUCHDB.forEach(buch => {
        (buch.kapitel || []).forEach(kap => {
          if (kap.id === kapId) quellenKap.push({ buch: buch.titel, kap });
          (kap.unterkapitel || []).forEach(u => { if (u.id === kapId) quellenKap.push({ buch: buch.titel, kap: u }); });
        });
      });
    });
    const lernziele = [];
    (pr.ausgewaehlteLernziele || []).forEach(lzId => {
      CHECKLISTDB.forEach(cl => { (cl.lernziele || []).forEach(lz => { if (lz.id === lzId) lernziele.push(lz.text); }); });
    });
    // Quellen als strukturierten Text aufbereiten — vollständige Aufgaben, nach Quelle geordnet
    let quellenTexte = '';
    quellenAA.forEach(aa => {
      const aufgaben = (aa.aufgaben || []).filter(a => a.text || a.aufgabenstellung);
      if (!aufgaben.length) return;
      quellenTexte += `\n### ${aa.titel}${aa.dauer ? ' (' + aa.dauer + ' Min)' : ''}\n`;
      // Hauptaufgaben gruppieren
      const hauptNrSet = new Set(aufgaben.map(a => String(a.nr || '').match(/^\d+/)?.[0]).filter(Boolean));
      hauptNrSet.forEach(base => {
        const gruppe = aufgaben.filter(a => String(a.nr || '').match(/^\d+/)?.[0] === base);
        const haupt = gruppe.find(a => String(a.nr) === base);
        const gesamtP = gruppe.reduce((s, a) => s + (a.punkte || 0), 0);
        quellenTexte += `Aufgabe ${base}${gesamtP ? ' · ' + gesamtP + 'P' : ''}`;
        if (haupt?.aufgabenstellung) quellenTexte += `: ${haupt.aufgabenstellung}`;
        quellenTexte += '\n';
        gruppe.filter(a => String(a.nr) !== base).forEach(a => {
          quellenTexte += `  ${a.nr}${a.punkte ? ' · ' + a.punkte + 'P' : ''}: ${a.aufgabenstellung || ''}${a.text ? ' ' + a.text : ''}\n`;
        });
        if (gruppe.length === 1 && haupt?.text) quellenTexte += `  ${haupt.text}\n`;
      });
      // Aufgaben ohne erkennbare Nummer
      aufgaben.filter(a => !String(a.nr || '').match(/^\d+/)).forEach(a => {
        quellenTexte += `  – ${a.aufgabenstellung || ''}${a.text ? ' ' + a.text : ''}\n`;
      });
    });
    quellenKap.forEach(({ buch, kap }) => {
      const aufgaben = (kap.aufgaben || []).filter(a => a.text || a.aufgabenstellung);
      if (!aufgaben.length) return;
      quellenTexte += `\n### ${buch} / ${kap.titel}\n`;
      aufgaben.slice(0, 40).forEach(a => {
        const nr = a.nr ? `${a.nr}` : '–';
        const p = a.punkte ? ` · ${a.punkte}P` : '';
        quellenTexte += `  ${nr}${p}: ${a.aufgabenstellung || ''}${a.text ? ' ' + a.text : ''}\n`;
      });
    });
    return { refArbeiten, lernziele, quellenTexte };
  }

  function parseKI(raw) {
    const cleaned = raw.replace(/^```[a-z]*\n?/m, '').replace(/```\s*$/m, '').trim();
    try { return robustJsonParsePr(cleaned); }
    catch (e) {
      const preview = cleaned.slice(0, 200).replace(/\n/g, ' ');
      throw new Error('JSON-Fehler: ' + preview);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // STUFE 1: Grobstruktur
  // ════════════════════════════════════════════════════════════════
  const strukturWrap = mk('div', ''); strukturWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:10px;';
  panel1.appendChild(strukturWrap);

  const gesamtEl = mk('div', ''); // laufende Summe Zeit + Punkte
  gesamtEl.style.cssText = 'font-size:12px;font-weight:600;padding:6px 0;min-height:18px;';

  function updateGesamt() {
    const aktiv = pr.strukturVorschlag.filter(a => !a._removed);
    const zeit = aktiv.reduce((s, a) => s + (a.zeitMinuten || 0), 0);
    const punkte = aktiv.reduce((s, a) => s + (a.gesamtpunkte || 0), 0);
    const zMin = pr.dauerVon || 0, zMax = pr.dauerBis || pr.dauerVon || 999;
    const zeitOk = zeit >= zMin && zeit <= zMax;
    gesamtEl.textContent = `Gesamt: ${zeit} Min. · ${punkte} P`;
    gesamtEl.style.color = zMin && !zeitOk ? '#dc2626' : '#16a34a';
    if (zMin) gesamtEl.textContent += ` (Ziel: ${zMin}${zMax !== zMin ? '–'+zMax : ''} Min.)`;
  }

  // Anforderungs-Stempel
  const AB_CFG = [
    { key: 'reproduktion',     letter: 'R', color: '#16a34a', title: 'Reproduktion' },
    { key: 'leichteAnwendung', letter: 'A', color: '#ca8a04', title: 'Leichte Anwendung' },
    { key: 'mittlereAnwendung',letter: 'A', color: '#ea580c', title: 'Mittlere Anwendung' },
    { key: 'transfer',         letter: 'T', color: '#dc2626', title: 'Transfer' },
  ];
  function makeStempel(anforderung, onToggle) {
    if (!anforderung) anforderung = {};
    const wrap = mk('div', ''); wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;align-items:center;flex-shrink:0;margin-right:4px;padding-top:2px;';
    AB_CFG.forEach(cfg => {
      const active = !!(anforderung[cfg.key]);
      const s = tx('div', '', cfg.letter);
      s.title = (active ? 'Aktiv – klicken zum Deaktivieren: ' : 'Inaktiv – klicken zum Aktivieren: ') + cfg.title;
      s.style.cssText = `width:22px;height:22px;border-radius:50%;background:${active ? cfg.color : 'var(--bord)'};color:${active ? '#fff' : 'var(--tx3)'};font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;transition:background .15s,color .15s;`;
      if (onToggle) s.onclick = e => { e.stopPropagation(); onToggle(cfg.key); };
      wrap.appendChild(s);
    });
    return wrap;
  }

  // Drag-to-Reorder
  let dragSrc = null;
  function addDragHandlers(card, handle, index) {
    handle.draggable = true;
    handle.ondragstart = e => { dragSrc = index; card.style.opacity = '.5'; e.dataTransfer.effectAllowed = 'move'; };
    handle.ondragend = () => { card.style.opacity = ''; };
    card.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; card.style.background = 'var(--surf)'; };
    card.ondragleave = () => { card.style.background = ''; };
    card.ondrop = e => {
      e.preventDefault(); card.style.background = '';
      if (dragSrc === null || dragSrc === index) return;
      const arr = pr.strukturVorschlag;
      const [moved] = arr.splice(dragSrc, 1);
      arr.splice(index, 0, moved);
      savePruefungsDB(); renderStruktur(); renderAFBBanner();
    };
  }

  function renderStruktur() {
    strukturWrap.innerHTML = '';
    if (!pr.strukturVorschlag.length) { updateGesamt(); return; }
    let posNr = 0;
    pr.strukturVorschlag.forEach((aufg, idx) => {
      const feinLocked = isTaskFeinLocked(aufg.taskId);
      const taskUnlocked = !feinLocked && (!pr.grobstrukturLocked || !!aufg._grobUnlocked);
      if (!aufg._removed) posNr++;
      const card = mk('div', '');
      card.style.cssText = 'border:1px solid var(--bord);border-radius:8px;background:var(--surf2);padding:10px 12px;display:flex;gap:0;' + (aufg._removed ? 'opacity:.35;' : '');

      // Linke Spalte: Drag-Handle + Stempel
      const leftCol = mk('div', ''); leftCol.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;margin-right:10px;flex-shrink:0;';
      const dragHandle = tx('div', '', '⠿'); // braille dots = drag indicator
      dragHandle.title = taskUnlocked ? 'Reihenfolge ändern' : 'Grobstruktur gesperrt';
      dragHandle.style.cssText = 'font-size:16px;color:var(--tx3);cursor:' + (taskUnlocked ? 'grab' : 'not-allowed') + ';user-select:none;line-height:1;' + (taskUnlocked ? '' : 'opacity:.45;');
      leftCol.appendChild(dragHandle);
      const stempel = makeStempel(aufg.anforderung, taskUnlocked ? key => {
        if (!aufg.anforderung) aufg.anforderung = {};
        aufg.anforderung[key] = aufg.anforderung[key] ? 0 : 1;
        if (pr.grobstrukturLocked) markTaskDirty(aufg); else savePruefungsDB();
        renderStruktur(); renderAFBBanner();
      } : null);
      leftCol.appendChild(stempel);
      card.appendChild(leftCol);

      // Rechte Spalte: Inhalt
      const rightCol = mk('div', ''); rightCol.style.flex = '1';

      // Titelzeile + Streichen-Button
      const hrow = mk('div', ''); hrow.style.cssText = 'display:flex;align-items:baseline;gap:8px;margin-bottom:4px;';
      const nrSpan = tx('strong', '', 'Aufgabe ' + (aufg._removed ? '–' : posNr) + ': ');
      // Titel editierbar per Klick
      const titelSpan = tx('strong', '', aufg.titel || '–');
      titelSpan.style.cssText = 'cursor:text;border-bottom:1px dashed transparent;';
      titelSpan.onmouseenter = () => titelSpan.style.borderBottomColor = 'var(--tx3)';
      titelSpan.onmouseleave = () => titelSpan.style.borderBottomColor = 'transparent';
      titelSpan.onclick = () => {
        const inp = document.createElement('input'); inp.type = 'text'; inp.value = aufg.titel || '';
        inp.style.cssText = 'font-size:inherit;font-weight:700;font-family:inherit;border:none;border-bottom:1px solid var(--pri);outline:none;background:transparent;color:var(--tx1);width:200px;';
        titelSpan.replaceWith(inp); inp.focus(); inp.select();
        const done = () => { aufg.titel = inp.value || aufg.titel; savePruefungsDB(); renderStruktur(); };
        inp.onblur = done; inp.onkeydown = e => { if (e.key === 'Enter' || e.key === 'Escape') inp.blur(); };
      };
      hrow.appendChild(nrSpan); hrow.appendChild(titelSpan);
      const spacer = mk('span', ''); spacer.style.flex = '1'; hrow.appendChild(spacer);
      if (pr.grobstrukturLocked) {
        const lockBtn = btn(feinLocked ? '🔐' : (taskUnlocked ? '🔓' : '🔒'), '');
        styleLockButton(lockBtn, feinLocked || !taskUnlocked, true);
        lockBtn.title = feinLocked ? 'Feinstruktur dieser Aufgabe ist gesperrt' : (taskUnlocked ? 'Aufgabe wieder sperren' : 'Diese Aufgabe zum Überarbeiten entsperren');
        lockBtn.onclick = () => {
          if (feinLocked) return;
          aufg._grobUnlocked = !aufg._grobUnlocked;
          if (!aufg._grobUnlocked) aufg._needsFeinUpdate = false;
          savePruefungsDB();
          renderStruktur();
        };
        hrow.appendChild(lockBtn);
      }
      const toggleBtn = btn(aufg._removed ? '+ Aufnehmen' : '✕', 'btn btn-ghost btn-xs');
      toggleBtn.title = aufg._removed ? 'Wieder aufnehmen' : 'Aufgabe streichen';
      toggleBtn.disabled = !taskUnlocked;
      toggleBtn.style.opacity = taskUnlocked ? '1' : '.45';
      toggleBtn.onclick = () => {
        aufg._removed = !aufg._removed;
        if (pr.grobstrukturLocked) markTaskDirty(aufg); else savePruefungsDB();
        syncDerivedOrder();
        renderStruktur(); renderAFBBanner();
      };
      hrow.appendChild(toggleBtn);
      // ↺ Neu vorschlagen — direkt neben ✕
      const grobRegenBtn = mk('button', '');
      grobRegenBtn.textContent = '↺';
      grobRegenBtn.title = 'Alternative Aufgabe vorschlagen';
      grobRegenBtn.style.cssText = 'border:none;background:none;color:var(--tx3);cursor:pointer;font-size:13px;padding:2px 4px;flex-shrink:0;';
      grobRegenBtn.onclick = async () => {
        grobRegenBtn.textContent = '⏳'; grobRegenBtn.disabled = true;
        const anf = aufg.anforderung || {};
        const erlaubt = Object.keys(AB_KEY_MAP).filter(k => (anf[k] || 0) > 0);
        const verboten = Object.keys(AB_KEY_MAP).filter(k => (anf[k] || 0) === 0);
        const alleTitel = pr.strukturVorschlag.filter(a => !a._removed).map(a => a.titel).filter(Boolean);
        let p = `Du planst eine Klassenarbeit über "${pr.thema || pr.titel || '?'}".\n\n`;
        p += `Folgende Themen sind bereits vergeben — schlage KEINES davon vor:\n`;
        alleTitel.forEach(t => { p += `- ${t}\n`; });
        p += `\nGesucht: eine neue Aufgabe mit einem ANDEREN Themenbereich, der zum Lerngebiet passt aber noch nicht vorkommt.\n`;
        p += `Rahmenbedingungen: ${aufg.zeitMinuten ?? '?'} Min, ${aufg.gesamtpunkte ?? '?'} Punkte\n`;
        if (erlaubt.length) p += `Anforderungsbereiche – Erlaubt: ${erlaubt.join(', ')} | VERBOTEN: ${verboten.join(', ')}\n`;
        p += `\nAntworte NUR mit reinem JSON:\n{"titel":"Kurzer Titel","beschreibung":"Was Schüler hier tun (1 Satz)"}`;
        try {
          const raw = await callKI([{ type: 'text', text: p }], 600);
          const parsed = parseKI(raw);
          if (parsed.titel) aufg.titel = parsed.titel;
          if (parsed.beschreibung) aufg.beschreibung = parsed.beschreibung;
          savePruefungsDB(); renderStruktur(); renderAFBBanner();
        } catch(e) { statusEl.textContent = '⚠ ' + e.message; }
        grobRegenBtn.textContent = '↺'; grobRegenBtn.disabled = false;
      };
      hrow.appendChild(grobRegenBtn);
      rightCol.appendChild(hrow);

      // Beschreibung editierbar
      const beschrEl = tx('div', '', aufg.beschreibung || '');
      beschrEl.style.cssText = 'font-size:12px;color:var(--tx2);font-style:italic;margin-bottom:8px;cursor:text;min-height:16px;';
      beschrEl.title = 'Klicken zum Bearbeiten';
      beschrEl.onclick = () => {
        const area = document.createElement('textarea'); area.value = aufg.beschreibung || '';
        area.style.cssText = 'width:100%;font-size:12px;font-family:inherit;line-height:1.5;border:1px solid var(--pri);border-radius:4px;padding:4px;background:var(--surf2);color:var(--tx1);resize:none;box-sizing:border-box;';
        area.rows = 2;
        beschrEl.replaceWith(area); area.focus();
        const done = () => { aufg.beschreibung = area.value; savePruefungsDB(); renderStruktur(); };
        area.onblur = done; area.onkeydown = e => { if (e.key === 'Escape') area.blur(); };
      };
      rightCol.appendChild(beschrEl);

      if (pr.grobstrukturLocked && !taskUnlocked) {
        const lockHint = tx('div', '', feinLocked ? 'Feinstruktur gesperrt' : 'Grobstruktur gesperrt');
        lockHint.style.cssText = 'font-size:11px;color:var(--tx3);margin-bottom:8px;';
        rightCol.appendChild(lockHint);
      }
      if (pr.grobstrukturLocked && taskUnlocked) {
        const unlockHint = tx('div', '', aufg._needsFeinUpdate ? 'Aenderungen offen - Feinplanung fuer diese Aufgabe neu laufen lassen.' : 'Diese Aufgabe ist entsperrt.');
        unlockHint.style.cssText = 'font-size:11px;color:var(--pri);margin-bottom:8px;';
        rightCol.appendChild(unlockHint);
      }

      // Regler Zeit + Punkte
      function makeSlider(label, unit, val, min, max, disabled, onChange) {
        const wrap = mk('div', ''); wrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;';
        const lbl = tx('span', '', label); lbl.style.cssText = 'font-size:11px;color:var(--tx3);width:38px;flex-shrink:0;';
        wrap.appendChild(lbl);
        const slider = document.createElement('input'); slider.type = 'range';
        slider.min = min; slider.max = max; slider.step = 1; slider.value = val;
        slider.disabled = disabled;
        slider.style.cssText = 'flex:1;accent-color:var(--pri);height:4px;cursor:' + (disabled ? 'not-allowed' : 'pointer') + ';' + (disabled ? 'opacity:.45;' : '');
        const valEl = tx('span', '', val + ' ' + unit);
        valEl.style.cssText = 'font-size:12px;font-weight:600;width:48px;text-align:right;flex-shrink:0;' + (disabled ? 'opacity:.45;' : '');
        slider.oninput = () => { const n = parseInt(slider.value); valEl.textContent = n + ' ' + unit; onChange(n); updateGesamt(); renderAFBBanner(); };
        wrap.appendChild(slider); wrap.appendChild(valEl);
        return wrap;
      }
      rightCol.appendChild(makeSlider('⏱ Zeit', 'Min', aufg.zeitMinuten || 5, 1, 30, !taskUnlocked, v => {
        aufg.zeitMinuten = v;
        if (pr.grobstrukturLocked) markTaskDirty(aufg); else savePruefungsDB();
      }));
      rightCol.appendChild(makeSlider('Punkte', 'P', aufg.gesamtpunkte || 8, 2, 25, !taskUnlocked, v => {
        aufg.gesamtpunkte = v;
        if (pr.grobstrukturLocked) markTaskDirty(aufg); else savePruefungsDB();
      }));

      if (pr.grobstrukturLocked && taskUnlocked) {
        const refreshBtn = btn('↺ Feinplanung fuer diese Aufgabe', 'btn btn-pri btn-xs');
        refreshBtn.onclick = async () => {
          refreshBtn.disabled = true;
          refreshBtn.textContent = '⏳';
          try {
            const { lernziele, quellenTexte } = buildKontext();
            const aktive = getActiveTasks();
            const aufgNr = aktive.findIndex(a => a.taskId === aufg.taskId) + 1;
            statusEl.textContent = `⏳ Feinstruktur fuer Aufgabe ${aufgNr} wird aktualisiert...`;
            const fsEntry = await generateFeinstrukturForTask(aufg, aufgNr, lernziele, quellenTexte);
            const fsIdx = pr.feinstruktur.findIndex(fs => fs.taskId === aufg.taskId);
            if (fsIdx > -1) pr.feinstruktur[fsIdx] = fsEntry;
            else pr.feinstruktur.push(fsEntry);
            invalidateGeneratedTask(aufg.taskId);
            aufg._grobUnlocked = false;
            aufg._needsFeinUpdate = false;
            syncDerivedOrder();
            savePruefungsDB();
            renderStruktur(); renderFeinstruktur(); renderGenAufgaben(); renderAFBBanner();
            switchSubTab(2);
            statusEl.textContent = `✓ Feinstruktur fuer Aufgabe ${aufgNr} aktualisiert.`;
          } catch (e) {
            statusEl.textContent = '⚠ ' + e.message;
          }
          refreshBtn.disabled = false;
          refreshBtn.textContent = '↺ Feinplanung fuer diese Aufgabe';
        };
        rightCol.appendChild(refreshBtn);
      }

      card.appendChild(rightCol);
      if (taskUnlocked) addDragHandlers(card, dragHandle, idx);
      strukturWrap.appendChild(card);
    });
    updateGesamt();
  }
  renderStruktur();
  // gesamtEl jetzt in renderAFBBanner oben

  const btnRow1 = mk('div', ''); btnRow1.style.cssText = 'display:flex;gap:8px;margin-bottom:4px;flex-wrap:wrap;margin-top:8px;';
  const strukturBtn = btn('✨ Grobstruktur vorschlagen', 'btn btn-pri btn-sm');
  btnRow1.appendChild(strukturBtn);
  const zuFeinBtn = btn('→ Feinstruktur vorschlagen', 'btn btn-sm');
  zuFeinBtn.style.display = pr.strukturVorschlag.length ? '' : 'none';
  btnRow1.appendChild(zuFeinBtn);
  panel1.appendChild(btnRow1);
  const lockInfo = tx('div', '', '');
  lockInfo.style.cssText = 'font-size:12px;color:var(--tx3);margin-bottom:10px;';
  panel1.appendChild(lockInfo);

  // ── Panels in div einsetzen ───────────────────────────────────
  // ── AFB-Auswertungsbalken (dauerhaft sichtbar) ────────────────
  const afbBanner = mk('div', '');
  afbBanner.style.cssText = 'margin-bottom:12px;';

  function parseFeinPunkte() {
    // Liest Zeilenpunkte aus pr.feinstruktur (AFB-Zeilen mit oder ohne →)
    const result = [];
    pr.feinstruktur.forEach(fs => {
      (fs.spezifikation || '').split('\n').forEach(line => {
        const stripped = line.trim().replace(/^[-–•]\s*/, '');
        const pipeIdx = stripped.indexOf('|');
        if (pipeIdx < 0) return;
        const afbKey = stripped.slice(0, pipeIdx).trim();
        if (!AB_KEY_MAP[afbKey]) return;
        const rest = stripped.slice(pipeIdx + 1);
        const lastPipe = rest.lastIndexOf('|');
        if (lastPipe < 0) return; // kein Punkte-Anhang
        const maybeP = rest.slice(lastPipe + 1).trim();
        if (/^\d+$/.test(maybeP)) result.push({ afbKey, punkte: parseInt(maybeP) });
      });
    });
    return result;
  }

  function calcAFB() {
    const t = { afb1: 0, afb2: 0, afb3: 0, total: 0, min1: 0, min2: 0, min3: 0 };
    if (pr.genAufgaben.length) {
      pr.genAufgaben.forEach(a => {
        const uas = a.unteraufgaben || [];
        const taskP = uas.reduce((s, ua) => s + (ua.punkte || 0), 0);
        const taskMin = a.zeitMinuten || 0;
        uas.forEach(ua => {
          const p = ua.punkte || 0;
          const minAnteil = taskP ? taskMin * p / taskP : 0;
          if (ua.anforderungsbereich === 'reproduktion' || ua.anforderungsbereich === 'leichteAnwendung') { t.afb1 += p; t.min1 += minAnteil; }
          else if (ua.anforderungsbereich === 'mittlereAnwendung') { t.afb2 += p; t.min2 += minAnteil; }
          else if (ua.anforderungsbereich === 'transfer') { t.afb3 += p; t.min3 += minAnteil; }
          t.total += p;
        });
      });
    } else {
      const feinPunkte = parseFeinPunkte();
      if (feinPunkte.length) {
        // Feinstruktur-Zeilenpunkte vorhanden → diese verwenden
        feinPunkte.forEach(({ afbKey, punkte }) => {
          if (afbKey === 'reproduktion' || afbKey === 'leichteAnwendung') t.afb1 += punkte;
          else if (afbKey === 'mittlereAnwendung') t.afb2 += punkte;
          else if (afbKey === 'transfer') t.afb3 += punkte;
          t.total += punkte;
        });
      } else {
        pr.strukturVorschlag.filter(a => !a._removed).forEach(a => {
          const anf = a.anforderung || {};
          const p1 = (anf.reproduktion || 0) + (anf.leichteAnwendung || 0);
          const p2 = anf.mittlereAnwendung || 0;
          const p3 = anf.transfer || 0;
          const taskP = (a.gesamtpunkte || 0);
          const taskMin = a.zeitMinuten || 0;
          t.afb1 += p1; t.min1 += taskP ? taskMin * p1 / taskP : 0;
          t.afb2 += p2; t.min2 += taskP ? taskMin * p2 / taskP : 0;
          t.afb3 += p3; t.min3 += taskP ? taskMin * p3 / taskP : 0;
          t.total += taskP;
        });
      }
    }
    return t;
  }

  function renderAFBBanner() {
    afbBanner.innerHTML = '';
    const t = calcAFB();
    if (!t.total) return;
    const z = pr.afbZiele || { afb1: { min: 30, max: 50 }, afb2: { min: 35, max: 50 }, afb3: { min: 15, max: 25 } };
    const rows = [
      { key: 'afb1', badges: ['reproduktion','leichteAnwendung'],  color: '#ca8a04', punkte: t.afb1, min: t.min1 },
      { key: 'afb2', badges: ['mittlereAnwendung'],                color: '#ea580c', punkte: t.afb2, min: t.min2 },
      { key: 'afb3', badges: ['transfer'],                         color: '#dc2626', punkte: t.afb3, min: t.min3 },
    ];
    const grid = mk('div', '');
    grid.style.cssText = 'display:grid;grid-template-columns:52px 1fr 70px 44px 70px;gap:4px 8px;align-items:center;padding:10px 14px;background:var(--surf2);border-radius:8px;border:1px solid var(--bord);';
    rows.forEach(({ key, badges, color, punkte, min }) => {
      const pct = t.total ? Math.round(punkte / t.total * 100) : 0;
      const ziel = z[key] || { min: 0, max: 100 };
      const ok = pct >= ziel.min && pct <= ziel.max;
      const lbl = mk('div', ''); lbl.style.cssText = 'display:flex;gap:3px;align-items:center;';
      badges.forEach(bkey => {
        const cfg = AB_KEY_MAP[bkey];
        const b = tx('div', '', cfg.letter);
        b.style.cssText = `width:18px;height:18px;border-radius:50%;background:${cfg.color};color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
        b.title = cfg.title;
        lbl.appendChild(b);
      });
      grid.appendChild(lbl);
      const barWrap = mk('div', '');
      barWrap.style.cssText = 'position:relative;height:10px;background:var(--bord);border-radius:5px;overflow:visible;';
      // Zielkorridor als heller Hintergrundbereich
      const zielBar = mk('div', '');
      zielBar.style.cssText = `position:absolute;left:${ziel.min}%;width:${ziel.max - ziel.min}%;height:100%;background:${color}22;border-radius:5px;`;
      barWrap.appendChild(zielBar);
      const fillBar = mk('div', '');
      fillBar.style.cssText = `position:absolute;left:0;width:${Math.min(pct, 100)}%;height:100%;background:${ok ? color : '#ef4444'};border-radius:5px;transition:width .3s;`;
      barWrap.appendChild(fillBar);
      grid.appendChild(barWrap);
      const pmEl = mk('div', ''); pmEl.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:1px;';
      const pEl = tx('span', '', punkte + ' P'); pEl.style.cssText = `font-size:11px;font-weight:700;color:${color};`;
      const mEl = tx('span', '', Math.round(min) + ' Min'); mEl.style.cssText = 'font-size:10px;color:var(--tx3);';
      pmEl.appendChild(pEl); pmEl.appendChild(mEl);
      grid.appendChild(pmEl);
      const pctEl = tx('span', '', pct + ' %');
      pctEl.style.cssText = `font-size:12px;font-weight:700;color:${ok ? color : '#ef4444'};text-align:right;`;
      grid.appendChild(pctEl);
      const hint = tx('span', '', ok ? '✓' : (pct < ziel.min ? '↑ ' + ziel.min + '%' : '↓ ' + ziel.max + '%'));
      hint.style.cssText = `font-size:11px;color:${ok ? '#16a34a' : '#ef4444'};`;
      grid.appendChild(hint);
    });
    afbBanner.appendChild(grid);

    // Zeit/Punkte-Zeile
    const aktiv = pr.strukturVorschlag.filter(a => !a._removed);
    const zeitGes = aktiv.reduce((s, a) => s + (a.zeitMinuten || 0), 0);
    const pktGes  = aktiv.reduce((s, a) => s + (a.gesamtpunkte || 0), 0);
    if (zeitGes || pktGes) {
      const zMin = pr.dauerVon || 0, zMax = pr.dauerBis || pr.dauerVon || 999;
      const zeitOk = !zMin || (zeitGes >= zMin && zeitGes <= zMax);
      const row2 = mk('div', '');
      row2.style.cssText = 'display:flex;gap:12px;align-items:center;padding:6px 14px 2px;flex-wrap:wrap;';
      const zeitChip = tx('span', '', `⏱ ${zeitGes} Min${zMin ? ` · Ziel ${zMin}${zMax !== zMin ? '–'+zMax : ''} Min` : ''}`);
      zeitChip.style.cssText = `font-size:12px;font-weight:600;color:${zeitOk ? '#2563eb' : '#ef4444'};`;
      const pktChip = tx('span', '', `${pktGes} P gesamt`);
      pktChip.style.cssText = 'font-size:12px;font-weight:600;color:var(--pri);';
      row2.appendChild(zeitChip); row2.appendChild(pktChip);
      afbBanner.appendChild(row2);
    }
  }

  renderAFBBanner();

  div.appendChild(statusEl);
  div.appendChild(afbBanner);
  div.appendChild(subTabBar);
  div.appendChild(panel1);
  div.appendChild(panel2);
  div.appendChild(panel3);
  div.appendChild(panel4);
  switchSubTab(aktiverSubTab);

  // ════════════════════════════════════════════════════════════════
  // STUFE 2: Feinstruktur (pädagogische Spezifikation, editierbar)
  // ════════════════════════════════════════════════════════════════
  const stufe2Sec = panel2;
  const feinHint = tx('div', '', 'Die KI hat für jede Aufgabe beschrieben was sie vorhat. Korrigiere den Text wenn nötig.');
  feinHint.style.cssText = 'font-size:12px;color:var(--tx3);margin-bottom:8px;';
  // ── Toolbar oben in Panel 2 (immer sichtbar) ─────────────────
  const fein2Toolbar = mk('div', '');
  fein2Toolbar.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;';
  const restrBtnTop = btn('⇄ Umstrukturieren', 'btn btn-ghost btn-sm');
  restrBtnTop.title = 'Aufgaben zusammenführen, trennen, Teilaufgaben verschieben';
  restrBtnTop.onclick = () => {
    showRestrukturierungOverlay(pr, () => {
      syncDerivedOrder();
      renderStruktur();
      renderFeinstruktur();
      renderGenAufgaben();
      renderAFBBanner();
    });
  };
  fein2Toolbar.appendChild(restrBtnTop);
  stufe2Sec.appendChild(fein2Toolbar);

  stufe2Sec.appendChild(feinHint);
  const feinWrap = mk('div', ''); feinWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:10px;';
  stufe2Sec.appendChild(feinWrap);

  function renderFeinstruktur() {
    feinWrap.innerHTML = '';
    syncDerivedOrder();
    const zuBearbeiten = getActiveTasks();
    pr.feinstruktur.forEach((fs, idx) => {
      const sv = zuBearbeiten.find(a => a.taskId === fs.taskId) || zuBearbeiten[idx];
      const feinLocked = !!fs._feinLocked;
      const card = mk('div', '');
      card.style.cssText = 'border-radius:10px;background:var(--surf2);overflow:hidden;';

      // ── Schlanker Kopf: Nr | Titel | Zeit | Punkte | Schloss ────
      const head = mk('div', '');
      head.style.cssText = 'display:flex;align-items:center;gap:8px;padding:9px 14px;background:rgba(124,58,237,.06);border-bottom:1px solid var(--bord);';

      const nrBadge = tx('div', '', String(fs.nr));
      nrBadge.style.cssText = 'width:22px;height:22px;border-radius:50%;background:var(--pri);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
      head.appendChild(nrBadge);

      const titel = tx('span', '', fs.titel || '–');
      titel.style.cssText = 'font-size:13px;font-weight:700;color:var(--tx1);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      head.appendChild(titel);

      // Zeit-Chip (klick → Slider)
      const zeitValEl = tx('span', '', `⏱ ${fs.zeitMinuten || 5} Min`);
      zeitValEl.style.cssText = 'font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:#2563eb1a;color:#2563eb;cursor:' + (feinLocked ? 'default' : 'pointer') + ';flex-shrink:0;' + (feinLocked ? 'opacity:.5;' : '');
      const zeitSlider = document.createElement('input'); zeitSlider.type = 'range';
      zeitSlider.min = 1; zeitSlider.max = 45; zeitSlider.step = 1; zeitSlider.value = fs.zeitMinuten || 5;
      zeitSlider.disabled = feinLocked;
      zeitSlider.style.cssText = 'width:60px;accent-color:#2563eb;height:3px;display:none;flex-shrink:0;';
      zeitValEl.onclick = () => { if (!feinLocked) zeitSlider.style.display = zeitSlider.style.display ? '' : 'none'; };
      zeitSlider.oninput = () => { fs.zeitMinuten = parseInt(zeitSlider.value); zeitValEl.textContent = `⏱ ${zeitSlider.value} Min`; savePruefungsDB(); renderAFBBanner(); };
      zeitSlider.onblur = () => { zeitSlider.style.display = 'none'; };
      head.appendChild(zeitValEl); head.appendChild(zeitSlider);

      // Punkte-Chip (klick → Slider)
      const pktValEl = tx('span', '', `${fs.gesamtpunkte || 8} P`);
      pktValEl.style.cssText = 'font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:#7c3aed1a;color:#7c3aed;cursor:' + (feinLocked ? 'default' : 'pointer') + ';flex-shrink:0;' + (feinLocked ? 'opacity:.5;' : '');
      const pktSlider = document.createElement('input'); pktSlider.type = 'range';
      pktSlider.min = 2; pktSlider.max = 30; pktSlider.step = 1; pktSlider.value = fs.gesamtpunkte || 8;
      pktSlider.disabled = feinLocked;
      pktSlider.style.cssText = 'width:60px;accent-color:#7c3aed;height:3px;display:none;flex-shrink:0;';
      pktValEl.onclick = () => { if (!feinLocked) pktSlider.style.display = pktSlider.style.display ? '' : 'none'; };
      pktSlider.oninput = () => { fs.gesamtpunkte = parseInt(pktSlider.value); pktValEl.textContent = pktSlider.value + ' P'; savePruefungsDB(); renderAFBBanner(); };
      pktSlider.onblur = () => { pktSlider.style.display = 'none'; };
      head.appendChild(pktValEl); head.appendChild(pktSlider);

      // Schloss-Icon (kein langer Text-Button)
      const lockIcon = btn(feinLocked ? '🔐' : '🔓', '');
      lockIcon.title = feinLocked ? 'Entsperren' : 'Sperren';
      lockIcon.style.cssText = 'border:none;background:none;cursor:pointer;font-size:15px;padding:2px 4px;flex-shrink:0;line-height:1;';
      lockIcon.onclick = () => {
        fs._feinLocked = !fs._feinLocked;
        if (fs._feinLocked && sv) sv._grobUnlocked = false;
        savePruefungsDB();
        renderStruktur(); renderFeinstruktur();
      };
      head.appendChild(lockIcon);
      card.appendChild(head);

      // updatePunkteSum: aktualisiert Punkte-Chip und Stats-Chip aus Zeilenpunkten
      const updatePunkteSum = (listWrap) => {
        const sum = Array.from(listWrap.querySelectorAll('input[type=number]'))
          .reduce((s, inp) => s + (parseInt(inp.value) || 0), 0);
        if (sum > 0) {
          pktValEl.textContent = sum + ' P';
          pktSlider.value = Math.min(sum, 30);
          fs.gesamtpunkte = sum;
          savePruefungsDB();
        }
        const chip = card.querySelector('.fs-stats-chip');
        if (chip) {
          const stats = countSpecStats(fs.spezifikation);
          const ok = !fs.gesamtpunkte || stats.punkte === fs.gesamtpunkte;
          chip.textContent = `${stats.teilaufgaben} TA · ${stats.punkte || 0}/${fs.gesamtpunkte || 0} P`;
          chip.style.background = ok ? 'rgba(22,163,74,.1)' : 'rgba(239,68,68,.08)';
          chip.style.color = ok ? '#15803d' : '#dc2626';
        }
        renderAFBBanner();
      };

      // KI-Aktionen als Funktionen (werden im Aktionen-Menü aufgerufen)
      const doCardRegen = async (labelEl) => {
        const aufg = sv || {};
        const { lernziele, quellenTexte } = buildKontext();
        const anf2 = aufg.anforderung || {};
        const erlaubt2 = Object.keys(AB_KEY_MAP).filter(k => (anf2[k] || 0) > 0);
        const verboten2 = Object.keys(AB_KEY_MAP).filter(k => (anf2[k] || 0) === 0);
        let p = `Du planst Aufgabe ${fs.nr} einer Klassenarbeit.\n`;
        p += `Thema/Titel: ${fs.titel}\nZeit: ${fs.zeitMinuten ?? '?'} Min, ${fs.gesamtpunkte ?? '?'} Punkte\n`;
        if (erlaubt2.length) { p += `\n## ANFORDERUNGSBEREICHE — VERBINDLICH\nErlaubt: ${erlaubt2.join(', ')}\nVERBOTEN: ${verboten2.join(', ')}\n`; }
        if (lernziele.length) { p += '\n## LERNZIELE\n'; lernziele.slice(0,6).forEach(lz => { p += `- ${lz}\n`; }); }
        if (quellenTexte.trim()) { p += `\n## AUFGABEN AUS DEINEN QUELLEN\n${quellenTexte}\n`; }
        p += `\nBeschreibe die Unteraufgaben in kompakter Kurzform.\nFür jede Unteraufgabe: NUR erlaubte Anforderungsbereiche (${erlaubt2.join(', ')}), dann | dann Kennung: Vorgabe → Schülertätigkeit.\n`;
        p += `\nAntworte NUR mit reinem JSON:\n{"spezifikation":"reproduktion|1a: ... → ...\\nleichteAnwendung|1b: ... → ..."}`;
        const raw = await callKI([{ type: 'text', text: p }], 1500);
        const parsed = parseKI(raw);
        fs.spezifikation = parsed.spezifikation || fs.spezifikation;
        savePruefungsDB(); renderFeinstruktur(); renderAFBBanner();
      };
      const doCardGen = async () => {
        const anf3 = fs.anforderung || {};
        const erlaubt3 = Object.keys(AB_KEY_MAP).filter(k => (anf3[k] || 0) > 0);
        const verboten3 = Object.keys(AB_KEY_MAP).filter(k => (anf3[k] || 0) === 0);
        let p = `Erstelle konkrete Aufgabe ${fs.nr} "${fs.titel}" für eine Klassenarbeit.\n\n`;
        p += `## PÄDAGOGISCHE SPEZIFIKATION\n${fs.spezifikation}\n\n`;
        p += `Zeit: ${fs.zeitMinuten ?? '?'} Min, ${fs.gesamtpunkte ?? '?'} Punkte gesamt\n`;
        p += `Aufgabentypen: ${(fs.typen||[]).join(', ')}\n`;
        if (erlaubt3.length) { p += `\n## ANFORDERUNGSBEREICHE — VERBINDLICH\nErlaubt: ${erlaubt3.join(', ')}\nVERBOTEN: ${verboten3.join(', ')}\n`; }
        p += `\n## WICHTIG\n- Unteraufgaben rechnerisch unabhängig\n- Progression leicht→schwer\n- Konkrete Zahlen, kein Platzhalter\n\n`;
        p += `Antworte NUR mit reinem JSON:\n{"aufgabenstellung":null,"unteraufgaben":[\n  {"nr":"${fs.nr}a","titel":null,"text":"...","loesung":"kurze Loesung oder Ergebnis","punkte":3,"anforderungsbereich":"reproduktion","typ":"Rechnung"}\n]}\nanforderungsbereich: ${erlaubt3.length ? erlaubt3.join(' | ') : 'reproduktion | leichteAnwendung | mittlereAnwendung | transfer'}\nloesung: kurze Musterloesung oder Ergebnis in 1 Zeile`;
        const raw = await callKI([{ type: 'text', text: p }], 3000);
        const parsed = parseKI(raw);
        const existingIdx = pr.genAufgaben.findIndex(a => a.taskId === fs.taskId);
        const entry = { taskId: fs.taskId, nr: fs.nr, titel: fs.titel, zeitMinuten: fs.zeitMinuten, gesamtpunkte: fs.gesamtpunkte, aufgabenstellung: parsed.aufgabenstellung || null, unteraufgaben: parsed.unteraufgaben || [] };
        if (existingIdx > -1) pr.genAufgaben[existingIdx] = entry;
        else pr.genAufgaben.push(entry);
        syncDerivedOrder();
        savePruefungsDB(); renderGenAufgaben(); renderAFBBanner();
        switchSubTab(3);
      };

      if (feinLocked) {
        const lockNote = tx('div', '', 'Diese Aufgabe ist in der Feinstruktur gesperrt. Ihre Vorgaben werden nicht mehr verändert.');
        lockNote.style.cssText = 'font-size:11px;color:var(--tx3);padding:8px 14px 0;';
        card.appendChild(lockNote);
      }

      // Spezifikation als editierbare Stichpunktliste
      const listWrap = mk('div', '');
      listWrap.style.cssText = 'padding:8px 14px 4px;display:flex;flex-direction:column;gap:2px;';

      function getLines() {
        return (fs.spezifikation || '').split('\n').map(l => l.replace(/^[-–•]\s*/, '').trim()).filter(l => l);
      }
      function saveLines(lines) {
        fs.spezifikation = lines.map(l => '- ' + l).join('\n');
        savePruefungsDB();
      }

      function buildList() {
        listWrap.innerHTML = '';
        const lines = getLines();
        lines.forEach((line, li) => {
          // Zeile gilt als strukturiert wenn → vorhanden ODER wenn ein gültiger AFB-Schlüssel als Präfix steht
          const _pipeCheck = line.indexOf('|');
          const _potentialKey = _pipeCheck > -1 ? line.slice(0, _pipeCheck).trim().replace(/^[-–•]\s*/, '') : null;
          const hasPfeil = line.includes('→') || !!(_potentialKey && AB_KEY_MAP[_potentialKey]);
          const row = mk('div', '');
          row.style.cssText = 'display:flex;align-items:flex-start;gap:6px;padding:3px 0;';

          if (hasPfeil) {
            // AFB-Präfix parsen: "reproduktion|1a: Vorgabe → Ergänzung" oder "reproduktion|1a: Vorgabe → Ergänzung|4"
            let afbKey = null, lineRest = line, zeilenPunkte = null;
            const pipeIdx = line.indexOf('|');
            if (pipeIdx > -1) {
              const candidate = line.slice(0, pipeIdx).trim();
              if (AB_KEY_MAP[candidate]) {
                afbKey = candidate;
                lineRest = line.slice(pipeIdx + 1).trim();
                // Punkte am Ende: "content|4"
                const lastPipe = lineRest.lastIndexOf('|');
                if (lastPipe > -1) {
                  const maybeP = lineRest.slice(lastPipe + 1).trim();
                  if (/^\d+$/.test(maybeP)) { zeilenPunkte = parseInt(maybeP); lineRest = lineRest.slice(0, lastPipe).trim(); }
                }
              }
            }
            const abCfg2 = afbKey ? AB_KEY_MAP[afbKey] : null;
            const buildLine = () => (afbKey ? afbKey + '|' : '') + lineRest + (zeilenPunkte != null ? '|' + zeilenPunkte : '');

            // Badge
            const badge2 = tx('div', '', abCfg2 ? abCfg2.letter : '·');
            badge2.title = abCfg2?.title || 'Anforderungsbereich';
            badge2.style.cssText = `width:20px;height:20px;border-radius:50%;background:${abCfg2 ? abCfg2.color + '33' : 'var(--bord)'};color:${abCfg2?.color || 'var(--tx3)'};font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;cursor:pointer;`;
            // Klick auf Badge wechselt AFB
            badge2.onclick = () => {
              if (feinLocked) return;
              const keys = Object.keys(AB_KEY_MAP);
              const next = keys[(keys.indexOf(afbKey) + 1) % keys.length];
              const ls = getLines(); ls[li] = next + '|' + lineRest; saveLines(ls); buildList();
            };
            row.appendChild(badge2);

            // Kennung · Vorgabe → Ergänzung
            const colonIdx = lineRest.indexOf(':');
            const kennung = colonIdx > -1 ? lineRest.slice(0, colonIdx).trim() : '';
            const rest = colonIdx > -1 ? lineRest.slice(colonIdx + 1).trim() : lineRest;
            const [vorgabe, ergaenzung] = rest.split('→').map(s => s.trim());

            const preview = mk('div', '');
            preview.style.cssText = 'flex:1;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;padding:2px 0;font-size:13px;cursor:text;';
            if (kennung) {
              const kEl = tx('span', '', kennung + ':');
              kEl.style.cssText = 'font-weight:700;color:var(--tx2);flex-shrink:0;';
              preview.appendChild(kEl);
            }
            const vEl = tx('span', '', vorgabe || '');
            vEl.style.cssText = 'font-weight:700;color:var(--tx1);';
            preview.appendChild(vEl);
            if (line.includes('→')) {
              const arrEl = tx('span', '', '→');
              arrEl.style.cssText = 'color:var(--pri);font-weight:700;flex-shrink:0;';
              preview.appendChild(arrEl);
              const eEl = tx('span', '', ergaenzung || '');
              eEl.style.cssText = 'color:var(--tx3);';
              preview.appendChild(eEl);
            }

            // Punkte-Feld
            const pInp = document.createElement('input');
            pInp.type = 'number'; pInp.min = 1; pInp.max = 20; pInp.step = 1;
            pInp.value = zeilenPunkte ?? '';
            pInp.placeholder = 'P';
            pInp.disabled = feinLocked;
            pInp.style.cssText = 'width:38px;font-size:11px;font-family:inherit;border:1px solid var(--bord);border-radius:4px;background:var(--surf2);color:var(--tx1);padding:1px 4px;text-align:center;flex-shrink:0;';
            pInp.title = 'Punkte für diese Teilaufgabe';
            pInp.oninput = () => {
              zeilenPunkte = pInp.value ? parseInt(pInp.value) : null;
              const ls = getLines(); ls[li] = buildLine(); saveLines(ls);
              updatePunkteSum(listWrap);
            };
            row.appendChild(pInp);

            // Klick öffnet Inline-Editor (zeigt nur Inhalt ohne AFB-Präfix und Punkte)
            const inp = document.createElement('input');
            inp.type = 'text'; inp.value = lineRest;
            inp.style.cssText = 'flex:1;font-size:13px;font-family:inherit;border:none;outline:none;background:var(--surf);color:var(--tx1);padding:2px 4px;border-radius:4px;display:none;';
            inp.oninput = () => { lineRest = inp.value; const ls = getLines(); ls[li] = buildLine(); saveLines(ls); };
            inp.onblur = () => { buildList(); };
            inp.onkeydown = e => {
              if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
              if (e.key === 'Escape') { inp.blur(); }
            };
            preview.onclick = () => {
              if (feinLocked) return;
              preview.style.display = 'none'; inp.style.display = 'block'; pInp.style.display = 'none'; inp.focus(); inp.select();
            };
            inp.onblur = () => { pInp.style.display = ''; buildList(); };
            row.appendChild(preview);
            row.appendChild(inp);
          } else {
            // Einfache Textzeile (Hinweis, Gesamtanzahl etc.)
            const bullet = tx('span', '', '–');
            bullet.style.cssText = 'color:var(--tx3);flex-shrink:0;padding-top:3px;font-size:13px;';
            row.appendChild(bullet);
            const inp = document.createElement('textarea');
            inp.value = line;
            inp.rows = 1;
            inp.disabled = feinLocked;
            inp.style.cssText = 'flex:1;font-size:13px;font-family:inherit;line-height:1.5;border:none;outline:none;background:transparent;color:var(--tx2);resize:none;overflow:hidden;padding:0;font-style:italic;';
            const grow = () => { inp.style.height = 'auto'; inp.style.height = inp.scrollHeight + 'px'; };
            inp.oninput = () => { const ls = getLines(); ls[li] = inp.value; saveLines(ls); grow(); };
            inp.onkeydown = e => {
              if (e.key === 'Enter') { e.preventDefault(); const ls = getLines(); ls.splice(li + 1, 0, ''); saveLines(ls); buildList(); listWrap.querySelectorAll('textarea')[li + 1]?.focus(); }
              if (e.key === 'Backspace' && inp.value === '' && lines.length > 1) { e.preventDefault(); const ls = getLines(); ls.splice(li, 1); saveLines(ls); buildList(); listWrap.querySelectorAll('textarea')[Math.max(0, li - 1)]?.focus(); }
            };
            row.appendChild(inp);
            requestAnimationFrame(grow);
          }

          const del = mk('button', '');
          del.textContent = '✕';
          del.style.cssText = 'border:none;background:none;color:var(--tx3);cursor:pointer;font-size:11px;padding:2px 4px;flex-shrink:0;opacity:0;transition:opacity .1s;';
          row.onmouseenter = () => { del.style.opacity = '1'; };
          row.onmouseleave = () => { del.style.opacity = '0'; };
          del.disabled = feinLocked;
          del.onclick = () => { const ls = getLines(); ls.splice(li, 1); saveLines(ls); buildList(); };
          row.appendChild(del);
          listWrap.appendChild(row);
        });
      }

      buildList();
      card.appendChild(listWrap);

      // ── Kartenfu­ß: + Zeile | Stats | Aktionen ▾ ────────────────
      const foot = mk('div', '');
      foot.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 14px 8px;border-top:1px solid var(--bord);flex-wrap:wrap;';

      // + Zeile
      const addLineBtn = btn('+ Zeile', 'btn btn-ghost btn-xs');
      addLineBtn.disabled = feinLocked;
      addLineBtn.onclick = () => {
        const ls = getLines(); ls.push('reproduktion| → '); saveLines(ls); buildList();
        const inps = listWrap.querySelectorAll('input[type=text]');
        const last = inps[inps.length-1]; if (last) { last.style.display='block'; last.focus(); last.select(); }
      };
      foot.appendChild(addLineBtn);

      // Stats-Chip
      const stats = countSpecStats(fs.spezifikation);
      const statsOk = !fs.gesamtpunkte || stats.punkte === fs.gesamtpunkte;
      const statsChip = tx('span', 'fs-stats-chip', `${stats.teilaufgaben} TA · ${stats.punkte || 0}/${fs.gesamtpunkte || 0} P`);
      statsChip.style.cssText = `font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:${statsOk ? 'rgba(22,163,74,.1)' : 'rgba(239,68,68,.08)'};color:${statsOk ? '#15803d' : '#dc2626'};`;
      foot.appendChild(statsChip);

      const footSpacer = mk('span', ''); footSpacer.style.flex = '1'; foot.appendChild(footSpacer);

      // Aktionen ▾ Dropdown
      const aktMenuWrap = mk('div', ''); aktMenuWrap.style.cssText = 'position:relative;';
      const aktBtn = btn('Aktionen ▾', 'btn btn-ghost btn-xs');
      const aktMenu = mk('div', '');
      aktMenu.style.cssText = 'position:absolute;bottom:calc(100% + 4px);right:0;background:var(--surf);border:1px solid var(--bord);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:200;min-width:210px;padding:4px 0;display:none;';

      function menuItem(label, onclick, disabled) {
        const mi = mk('button', '');
        mi.textContent = label;
        mi.style.cssText = 'display:block;width:100%;text-align:left;padding:7px 14px;font-size:13px;border:none;background:none;cursor:pointer;color:var(--tx1);white-space:nowrap;';
        if (disabled) { mi.disabled = true; mi.style.opacity = '.4'; mi.style.cursor = 'default'; }
        mi.onmouseenter = () => { if (!disabled) mi.style.background = 'var(--surf2)'; };
        mi.onmouseleave = () => { mi.style.background = ''; };
        mi.onclick = (e) => { e.stopPropagation(); aktMenu.style.display = 'none'; if (!disabled) onclick(); };
        return mi;
      }
      function menuSep() {
        const s = mk('div', ''); s.style.cssText = 'height:1px;background:var(--bord);margin:3px 0;'; return s;
      }

      const runKI = async (label, fn) => {
        aktBtn.textContent = `⏳ ${label}…`; aktBtn.disabled = true;
        try { await fn(); } catch(e) { statusEl.textContent = '⚠ ' + e.message; }
        aktBtn.textContent = 'Aktionen ▾'; aktBtn.disabled = false;
      };

      aktMenu.appendChild(menuItem('↺ Feinstruktur neu generieren', () => runKI('Regeneriere', doCardRegen), feinLocked));
      aktMenu.appendChild(menuItem('→ Konkrete Aufgabe generieren', () => runKI('Generiere', doCardGen), false));
      aktMenu.appendChild(menuSep());
      [
        { label: 'Klarer formulieren',    instruction: 'Formuliere die Teilaufgaben klarer und operatorenklarer. Behalte Niveau und Punkteverteilung moeglichst bei.' },
        { label: 'Mehr Teilaufgaben',     instruction: 'Teile die Aufgabe feiner auf und erhoehe die Zahl der Teilaufgaben leicht. Behalte Gesamtpunkte und Progression bei.' },
        { label: 'Weniger Teilaufgaben',  instruction: 'Fasse Teilaufgaben zusammen und reduziere ihre Zahl. Behalte Gesamtpunkte und die wesentliche Struktur bei.' },
        { label: 'Mehr Transfer',         instruction: 'Erhoehe den Transferanteil leicht. Mindestens eine spaetere Teilaufgabe soll anspruchsvoller werden. Behalte Gesamtidee und Gesamtpunkte bei.' },
        { label: 'Kompakter',             instruction: 'Vereinfache die innere Struktur leicht und fasse sie kompakter. Weniger Redundanz, klarer Aufbau, gleiche Grundidee.' },
      ].forEach(({ label, instruction }) => {
        aktMenu.appendChild(menuItem(label, () => runKI(label, () => reviseFeinstrukturTask(fs, instruction, label).then(() => { renderFeinstruktur(); renderAFBBanner(); })), feinLocked));
      });
      aktMenu.appendChild(menuSep());
      aktMenu.appendChild(menuItem('⟳ Punkte gleichmäßig verteilen', () => {
        if (distributePointsAcrossSpec(fs)) { savePruefungsDB(); buildList(); updatePunkteSum(listWrap); }
      }, feinLocked));
      aktMenu.appendChild(menuSep());
      aktMenu.appendChild(menuItem(feinLocked ? '🔓 Entsperren' : '🔐 Sperren', () => {
        fs._feinLocked = !fs._feinLocked;
        if (fs._feinLocked && sv) sv._grobUnlocked = false;
        savePruefungsDB(); renderStruktur(); renderFeinstruktur();
      }, false));

      aktBtn.onclick = (e) => {
        e.stopPropagation();
        const open = aktMenu.style.display !== 'none';
        document.querySelectorAll('.fs-aktionen-menu').forEach(m => { m.style.display = 'none'; });
        aktMenu.style.display = open ? 'none' : '';
        if (!open) { setTimeout(() => { document.addEventListener('click', () => { aktMenu.style.display = 'none'; }, { once: true }); }, 0); }
      };
      aktMenu.classList.add('fs-aktionen-menu');
      aktMenuWrap.appendChild(aktBtn); aktMenuWrap.appendChild(aktMenu);
      foot.appendChild(aktMenuWrap);
      card.appendChild(foot);
      feinWrap.appendChild(card);
    });
  }
  renderFeinstruktur(); renderAFBBanner();

  // ════════════════════════════════════════════════════════════════
  // STUFE 3: Konkrete Aufgaben
  // ════════════════════════════════════════════════════════════════
  const stufe3Sec = panel3;
  const aufgabenWrap = mk('div', '');
  aufgabenWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
  stufe3Sec.appendChild(aufgabenWrap);

  function renderGenAufgaben() {
    aufgabenWrap.innerHTML = '';
    pr.genAufgaben.forEach(aufg => {
      const card = mk('div', '');
      card.style.cssText = 'border-radius:10px;background:var(--surf2);overflow:hidden;';

      // Kopfzeile
      const head = mk('div', '');
      head.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(124,58,237,.06);border-bottom:1px solid var(--bord);';
      const nrBadge = tx('div', '', String(aufg.nr));
      nrBadge.style.cssText = 'width:24px;height:24px;border-radius:50%;background:var(--pri);color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
      head.appendChild(nrBadge);
      const titel = tx('span', '', aufg.titel || '–');
      titel.style.cssText = 'font-size:14px;font-weight:700;color:var(--tx1);flex:1;';
      head.appendChild(titel);
      if (aufg.zeitMinuten) {
        const zt = tx('span', '', '⏱ ' + aufg.zeitMinuten + ' Min');
        zt.style.cssText = 'font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:rgba(37,99,235,.1);color:#2563eb;flex-shrink:0;';
        head.appendChild(zt);
      }
      if (aufg.gesamtpunkte) {
        const pt = tx('span', '', aufg.gesamtpunkte + ' P');
        pt.style.cssText = 'font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:rgba(124,58,237,.12);color:var(--pri);flex-shrink:0;';
        head.appendChild(pt);
      }
      card.appendChild(head);

      // Aufgabenstellung
      if (aufg.aufgabenstellung) {
        const as = tx('div', '', aufg.aufgabenstellung);
        as.style.cssText = 'font-size:13px;color:var(--tx2);font-style:italic;padding:8px 14px 4px;';
        card.appendChild(as);
      }

      // Teilaufgaben
      const uas = aufg.unteraufgaben || [];
      uas.forEach(ua => {
        const urow = mk('div', '');
        urow.style.cssText = 'display:flex;gap:8px;align-items:flex-start;padding:7px 14px;border-top:1px solid var(--bord);font-size:13px;';

        // Anforderungsbereich-Badge (R/A/A/T)
        const abCfg = AB_KEY_MAP[ua.anforderungsbereich];
        const badge = tx('div', '', abCfg ? abCfg.letter : '·');
        badge.title = abCfg?.title || '';
        badge.style.cssText = `width:20px;height:20px;border-radius:50%;background:${abCfg ? abCfg.color + '33' : 'var(--bord)'};color:${abCfg?.color || 'var(--tx3)'};font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;`;
        urow.appendChild(badge);

        // Nr + Text
        const col = mk('div', ''); col.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:2px;';
        const nrLine = mk('div', ''); nrLine.style.cssText = 'display:flex;align-items:baseline;gap:6px;';
        nrLine.appendChild(tx('strong', '', ua.nr || ''));
        if (ua.titel) { const tit = tx('span', '', ua.titel); tit.style.cssText = 'font-size:11px;font-weight:600;color:var(--tx2);'; nrLine.appendChild(tit); }
        if (ua.typ) nrLine.appendChild(tx('span', 'matc-jg', ua.typ));
        col.appendChild(nrLine);
        const utxt = tx('div', '', ua.text || ''); utxt.style.cssText = 'color:var(--tx2);line-height:1.5;'; col.appendChild(utxt);
        if (ua.loesung) {
          const uloes = tx('div', '', ua.loesung);
          uloes.style.cssText = 'color:#dc2626;line-height:1.5;font-weight:600;';
          col.appendChild(uloes);
        }
        urow.appendChild(col);

        // Punkte
        if (ua.punkte) {
          const pu = tx('span', '', ua.punkte + ' P');
          pu.style.cssText = `flex-shrink:0;font-size:12px;font-weight:700;color:${abCfg?.color || 'var(--tx3)'};padding-top:1px;`;
          urow.appendChild(pu);
        }
        card.appendChild(urow);
      });

      // Auswertungszeile Punkte nach Schwierigkeit
      const summary = {};
      uas.forEach(ua => {
        if (ua.anforderungsbereich && ua.punkte) {
          summary[ua.anforderungsbereich] = (summary[ua.anforderungsbereich] || 0) + ua.punkte;
        }
      });
      if (Object.keys(summary).length) {
        const foot = mk('div', '');
        foot.style.cssText = 'display:flex;gap:8px;align-items:center;padding:6px 14px;border-top:1px solid var(--bord);background:rgba(0,0,0,.02);flex-wrap:wrap;';
        const lbl = tx('span', '', 'Verteilung:');
        lbl.style.cssText = 'font-size:11px;color:var(--tx3);';
        foot.appendChild(lbl);
        ['reproduktion','leichteAnwendung','mittlereAnwendung','transfer'].forEach(key => {
          if (!summary[key]) return;
          const cfg = AB_KEY_MAP[key];
          const chip = tx('span', '', cfg.letter + ' ' + summary[key] + ' P');
          chip.title = cfg.title;
          chip.style.cssText = `font-size:12px;font-weight:700;padding:2px 8px;border-radius:20px;background:${cfg.color}22;color:${cfg.color};`;
          foot.appendChild(chip);
        });
        card.appendChild(foot);
      }

      aufgabenWrap.appendChild(card);
    });
  }
  renderGenAufgaben(); renderAFBBanner();
  lockInfo.textContent = pr.grobstrukturLocked
    ? 'Grobstruktur ist nach der ersten Feinplanung gesperrt. Zum Aendern einzelne Aufgaben entsperren.'
    : 'Zeit und Punkte hier grob anpassen, dann einmal die Feinplanung fuer alle Aufgaben laufen lassen.';

  // ── Handler: Stufe 1 — Grobstruktur ──────────────────────────
  strukturBtn.onclick = async () => {
    strukturBtn.disabled = true;
    statusEl.textContent = '⏳ KI schlägt Grobstruktur vor…';
    try {
      const { refArbeiten, lernziele, quellenTexte } = buildKontext();
      const dauerMin = pr.dauerVon || null;
      const dauerMax = pr.dauerBis || pr.dauerVon || null;
      let p = 'Du entwirfst eine Klassenarbeit. Schlage NUR die Hauptaufgaben vor — keine Unteraufgaben, keine Details.\n\n';
      if (dauerMin) {
        p += `## ZEITVORGABE (verbindlich)\nDie Klassenarbeit dauert ${dauerMin}${dauerMax && dauerMax !== dauerMin ? '–' + dauerMax : ''} Minuten. `;
        p += `Die Summe aller zeitMinuten-Werte MUSS in diesem Bereich liegen. Plane entsprechend viele und kurze Aufgaben.\n\n`;
      }
      p += `## KOMPOSITIONSSTIL\n${KOMPOSITIONSSTIL}\n\n`;
      if (refArbeiten.length) {
        p += '## REFERENZARBEITEN (Stil & Struktur)\n';
        refArbeiten.forEach(aa => {
          const hauptNrSet = [...new Set((aa.aufgaben||[]).map(a => (String(a.nr||'')).match(/^\d+/)?.[0]).filter(Boolean))];
          const gesamtP = (aa.aufgaben||[]).reduce((s,a) => s + (a.punkte||0), 0);
          p += `${aa.titel}: ${hauptNrSet.length} Hauptaufgaben${gesamtP ? ', ' + gesamtP + ' P gesamt' : ''}${aa.dauer ? ', ' + aa.dauer + ' Min' : ''}\n`;
        });
        p += '\n';
      }
      if (lernziele.length) { p += '## LERNZIELE\n'; lernziele.forEach((lz,i) => { p += `${i+1}. ${lz}\n`; }); p += '\n'; }
      if (pr.thema) p += `## THEMA\n${pr.thema}\n\n`;
      if (quellenTexte.trim()) {
        p += `## AUFGABEN AUS DEINEN QUELLEN\nNutze diese Vorlagen als Ausgangspunkt für Themen, Typen und Schwierigkeitsgrad:\n${quellenTexte}\n`;
      }
      p += `Antworte NUR mit reinem JSON:
{"hauptaufgaben":[
  {"nr":1,"titel":"Kurzer Titel","beschreibung":"Was Schüler hier tun (1 Satz)","zeitMinuten":8,"gesamtpunkte":10,"typen":["Rechnung","Multiple Choice"],
   "anforderung":{"reproduktion":4,"leichteAnwendung":4,"mittlereAnwendung":2,"transfer":0}}
]}
anforderung: Punktverteilung auf vier Bereiche (Summe = gesamtpunkte, 0 wenn nicht vorhanden):
reproduktion | leichteAnwendung | mittlereAnwendung | transfer`;
      const raw = await callKI([{ type: 'text', text: p }], 2000);
      const parsed = parseKI(raw);
      pr.strukturVorschlag = (parsed.hauptaufgaben || []).map(a => ({
        ...a,
        taskId: uid(),
        _removed: false,
        _grobUnlocked: true,
        _needsFeinUpdate: false,
      }));
      pr.grobstrukturLocked = false;
      pr.feinstruktur = []; pr.genAufgaben = [];
      switchSubTab(1);
      savePruefungsDB();
      renderStruktur(); renderAFBBanner();
      zuFeinBtn.style.display = '';
      lockInfo.textContent = 'Zeit und Punkte hier grob anpassen, dann einmal die Feinplanung fuer alle Aufgaben laufen lassen.';
      const gesamtzeit = pr.strukturVorschlag.reduce((s, a) => s + (a.zeitMinuten || 0), 0);
      const zeitHinweis = gesamtzeit ? ` (${gesamtzeit} Min. gesamt)` : '';
      statusEl.textContent = '✓ ' + pr.strukturVorschlag.length + ' Aufgaben vorgeschlagen' + zeitHinweis + '. Streiche unerwünschte, dann → Feinstruktur.';
    } catch(e) { statusEl.textContent = '⚠ ' + e.message; }
    strukturBtn.disabled = false;
  };

  // ── Handler: Stufe 2 — Feinstruktur ──────────────────────────
  zuFeinBtn.onclick = async () => {
    const zuBearbeiten = getActiveTasks();
    if (!zuBearbeiten.length) { statusEl.textContent = '⚠ Keine Aufgaben ausgewählt.'; return; }
    zuFeinBtn.disabled = true; strukturBtn.disabled = true;
    pr.feinstruktur = []; switchSubTab(2);
    const { lernziele, quellenTexte } = buildKontext();
    try {
      for (let i = 0; i < zuBearbeiten.length; i++) {
        const aufg = zuBearbeiten[i];
        const aufgNr = i + 1;
        statusEl.textContent = `⏳ Feinstruktur für Aufgabe ${aufgNr}… (${aufgNr}/${zuBearbeiten.length})`;
        pr.feinstruktur.push(await generateFeinstrukturForTask(aufg, aufgNr, lernziele, quellenTexte));
        savePruefungsDB();
        renderFeinstruktur(); renderAFBBanner();
      }
      pr.grobstrukturLocked = true;
      pr.strukturVorschlag.forEach(aufg => {
        aufg._grobUnlocked = false;
        aufg._needsFeinUpdate = false;
      });
      syncDerivedOrder();
      savePruefungsDB();
      renderStruktur();
      renderFeinstruktur();
      renderGenAufgaben();
      renderAFBBanner();
      lockInfo.textContent = 'Grobstruktur ist nach der ersten Feinplanung gesperrt. Zum Aendern einzelne Aufgaben entsperren.';
      statusEl.textContent = '✓ Feinstruktur fertig. Korrigiere wenn nötig, dann → Aufgaben generieren.';
    } catch(e) { statusEl.textContent = '⚠ ' + e.message; }
    zuFeinBtn.disabled = false; strukturBtn.disabled = false;
  };

  // ── Handler: Stufe 3 — Konkrete Aufgaben ─────────────────────
  zuAufgBtn.onclick = async () => {
    if (!pr.feinstruktur.length) { statusEl.textContent = '⚠ Erst Feinstruktur vorschlagen.'; return; }
    zuAufgBtn.disabled = true;
    pr.genAufgaben = []; switchSubTab(3);
    try {
      for (let i = 0; i < pr.feinstruktur.length; i++) {
        const fs = pr.feinstruktur[i];
        statusEl.textContent = `⏳ Generiere Aufgabe ${fs.nr}… (${i+1}/${pr.feinstruktur.length})`;
        let p = `Erstelle konkrete Aufgabe ${fs.nr} "${fs.titel}" für eine Klassenarbeit.\n\n`;
        p += `## PÄDAGOGISCHE SPEZIFIKATION\n${fs.spezifikation}\n\n`;
        p += `Zeit: ${fs.zeitMinuten ?? '?'} Min, ${fs.gesamtpunkte ?? '?'} Punkte gesamt\n`;
        p += `Aufgabentypen: ${(fs.typen||[]).join(', ')}\n`;
        const anf3 = fs.anforderung || {};
        const erlaubt3 = Object.keys(AB_KEY_MAP).filter(k => (anf3[k] || 0) > 0);
        const verboten3 = Object.keys(AB_KEY_MAP).filter(k => (anf3[k] || 0) === 0);
        if (erlaubt3.length) {
          p += `\n## ANFORDERUNGSBEREICHE — VERBINDLICH\nErlaubt: ${erlaubt3.join(', ')}\nVERBOTEN (niemals verwenden): ${verboten3.join(', ')}\n`;
        }
        p += `\n## WICHTIG\n- Unteraufgaben rechnerisch unabhängig (neue Zahlen pro Unteraufgabe)\n- Progression leicht→schwer innerhalb der Aufgabe\n- Konkrete Zahlen und Texte — kein Platzhalter\n\n`;
        p += `Antworte NUR mit reinem JSON:
{"aufgabenstellung":null,"unteraufgaben":[
  {"nr":"${fs.nr}a","titel":null,"text":"konkreter Aufgabentext mit Zahlen","loesung":"kurze Loesung oder Ergebnis","punkte":3,"anforderungsbereich":"reproduktion","typ":"Rechnung"},
  {"nr":"${fs.nr}b","titel":"Kurzer Titel","text":"konkreter Aufgabentext","loesung":"kurze Loesung oder Ergebnis","punkte":4,"anforderungsbereich":"leichteAnwendung","typ":"Sachaufgabe"}
]}
anforderungsbereich: "reproduktion" | "leichteAnwendung" | "mittlereAnwendung" | "transfer"
titel: null wenn Typ "Rechnung", sonst kurzer beschreibender Titel
Unteraufgaben rechnerisch unabhängig (neue Zahlen).
loesung: kurze Musterloesung oder Ergebnis in 1 Zeile.`;
        const raw = await callKI([{ type: 'text', text: p }], 3000);
        const parsed = parseKI(raw);
        pr.genAufgaben.push({
          taskId: fs.taskId, nr: fs.nr, titel: fs.titel, zeitMinuten: fs.zeitMinuten, gesamtpunkte: fs.gesamtpunkte,
          aufgabenstellung: parsed.aufgabenstellung || null,
          unteraufgaben: parsed.unteraufgaben || [],
        });
        syncDerivedOrder();
        savePruefungsDB();
        renderGenAufgaben(); renderAFBBanner();
      }
      statusEl.textContent = '✓ ' + pr.genAufgaben.length + ' Aufgaben generiert';
    } catch(e) { statusEl.textContent = '⚠ ' + e.message; }
    zuAufgBtn.disabled = false; strukturBtn.disabled = false;
  };

  return div;
}
