// ── Aufgaben-Tab: KI-Generierung ─────────────────────────────────
// AB_KEY_MAP + showRestrukturierungOverlay → views/pruefung-restruktur.js

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
      p += `## AUFGABEN AUS DEINEN QUELLEN\nOrientiere dich an Schwierigkeitsgrad, Aufgabentypen und Formulierungen dieser Vorlagen:\n${quellenTexte.slice(0, 2500)}\n`;
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
      const raw = await callKI([{ type: 'text', text: buildFeinstrukturPrompt(aufg, aufgNr, lernziele, quellenTexte) }], { maxTokens: 1500 });
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
  ensureTaskMeta();
  syncDerivedOrder();

  // AB_KEY_MAP ist auf Modulebene definiert (ganz oben in dieser Datei)

  // ── Sub-Tab-Gerüst ────────────────────────────────────────────
  const panel1 = mk('div', '');
  const panel2 = mk('div', '');
  const panel3 = mk('div', '');
  const panel4 = mk('div', '');
  const hatKonkret = pr.feinstruktur.some(fs => fs.konkret?.some(k => k.aufgabe?.trim() || k.loesung?.trim()));
  let aktiverSubTab = hatKonkret ? 3 : pr.feinstruktur.length ? 2 : 1;

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

  // ── AFB-Erklärung ─────────────────────────────────────────────
  const afbInfoSec = mk('div', '');
  afbInfoSec.style.cssText = 'margin-top:24px;';
  const afbInfoHdr = tx('div', '', 'Anforderungsbereiche – was steckt dahinter?');
  afbInfoHdr.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--pri);margin-bottom:10px;';
  afbInfoSec.appendChild(afbInfoHdr);

  [
    { key: 'reproduktion',      letter: 'R', color: '#16a34a', label: 'Reproduktion',
      text: 'Gelerntes direkt wiedergeben: Definitionen nennen, Verfahren nach Vorlage ausführen, Fakten abrufen. Der Lösungsweg wurde so oder sehr ähnlich eingeübt.' },
    { key: 'leichteAnwendung',  letter: 'A', color: '#ca8a04', label: 'Leichte Anwendung',
      text: 'Bekannte Verfahren auf eine neue, aber ähnliche Situation übertragen. Kleinere Denkschritte nötig, der Kontext ist aber noch vertraut.' },
    { key: 'mittlereAnwendung', letter: 'A', color: '#ea580c', label: 'Mittlere Anwendung',
      text: 'Mehrere Konzepte verknüpfen, strukturiertere Probleme eigenständig lösen. Die Aufgabe ist neu, aber lösbar mit dem gelernten Repertoire.' },
    { key: 'transfer',          letter: 'T', color: '#dc2626', label: 'Transfer',
      text: 'Wissen auf unbekannte Situationen übertragen, Zusammenhänge beurteilen, begründen oder gestalten. Hohes Maß an Eigenständigkeit.' },
  ].forEach(({ letter, color, label, text }) => {
    const row = mk('div', '');
    row.style.cssText = 'display:grid;grid-template-columns:28px 1fr;gap:8px;align-items:start;padding:8px 10px;border-radius:7px;margin-bottom:6px;background:var(--surf2);border:1px solid var(--bord);';
    const badge = tx('div', '', letter);
    badge.style.cssText = `width:22px;height:22px;border-radius:50%;background:${color}22;color:${color};font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;`;
    row.appendChild(badge);
    const col = mk('div', '');
    const lbl = tx('div', '', label);
    lbl.style.cssText = `font-size:13px;font-weight:700;color:${color};margin-bottom:2px;`;
    const desc = tx('div', '', text);
    desc.style.cssText = 'font-size:12px;color:var(--tx2);line-height:1.5;';
    col.appendChild(lbl); col.appendChild(desc);
    row.appendChild(col);
    afbInfoSec.appendChild(row);
  });
  panel4.appendChild(afbInfoSec);

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
  async function buildKontext() {
    const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - (pr.referenzJahre ?? 2) * msPerYear);
    const refArbeiten = ALTE_ARBEITEN_DB.filter(aa => aa.datum && new Date(aa.datum) >= cutoff);
    const quellenAA = (pr.quellen?.alteArbeiten || []).map(id => ALTE_ARBEITEN_DB.find(aa => aa.id === id)).filter(Boolean);
    const lernziele = [];
    (pr.ausgewaehlteLernziele || []).forEach(lzId => {
      CHECKLISTDB.forEach(cl => { (cl.lernziele || []).forEach(lz => { if (lz.id === lzId) lernziele.push(lz.text); }); });
    });

    // Fach aus Kurs → Fachplanung ableiten
    const prKurs = pr.kursId ? (S.data?.kurse || []).find(k => k.id === pr.kursId) : null;
    const prFp   = prKurs ? (S.data?.fachplanungen || []).find(f => f.id === prKurs.fachplanungId) : null;
    const prFach = prFp?.fach || null;

    // Suchanfrage: Thema zuerst, dann lange Wörter aus Lernzielen (Fachbegriffe ≥ 6 Zeichen)
    const STOPPWOERTER = new Set(['haben','werden','können','sollen','wissen','kennen','verstehen',
      'nutzen','dabei','sowie','durch','ihrer','seine','einer','keine','diese','welche',
      'wozu','meint','weiß','Begriff','besteht','enthält','anhand']);
    const themaWoerter = (pr.thema || pr.titel || '').replace(/[^\wäöüÄÖÜß\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOPPWOERTER.has(w));
    const lzWoerter = lernziele.slice(0, 3).join(' ').replace(/[^\wäöüÄÖÜß\s]/g, ' ').split(/\s+/).filter(w => w.length >= 6 && !STOPPWOERTER.has(w));
    const suchBegriffe = [...new Set([...themaWoerter, ...lzWoerter])].slice(0, 6).join(' ');

    let quellenTexte = '';

    // 1. Schulbuch-Aufgaben — Supabase FTS (thematisch relevant) oder in-memory Fallback
    const hatKapitelAusgewaehlt = (pr.quellen?.kapitel || []).length > 0;
    if (hatKapitelAusgewaehlt) {
      let ftsErgebnis = [];
      try {
        if (suchBegriffe) {
          ftsErgebnis = await sbQueryFTS('inhalte', suchBegriffe, {}, 15);
        }
      } catch(_) { /* Fallback auf in-memory */ }

      if (ftsErgebnis.length) {
        // FTS-Ergebnis: nach Buch/Kapitel gruppiert ausgeben
        quellenTexte += '\n### Schulbuch-Aufgaben (thematisch passend)\n';
        ftsErgebnis.forEach(a => {
          const nr = a.nr ? a.nr : (a.seite ? `S.${a.seite}` : '–');
          const thema = a.thema ? ` [${a.thema}]` : '';
          const text = a.inhalt || '';
          quellenTexte += `  ${nr}${thema}: ${text}\n`;
        });
      } else {
        // Fallback: in-memory Zufalls-Sample aus ausgewählten Kapiteln
        const quellenKap = [];
        (pr.quellen?.kapitel || []).forEach(kapId => {
          SCHULBUCHDB.forEach(buch => {
            (buch.kapitel || []).forEach(kap => {
              if (kap.id === kapId) quellenKap.push({ buch: buch.titel, kap });
              (kap.unterkapitel || []).forEach(u => { if (u.id === kapId) quellenKap.push({ buch: buch.titel, kap: u }); });
            });
          });
        });
        quellenKap.forEach(({ buch, kap }) => {
          const alleAufgaben = [];
          const filterFn = a => a.inhalt || a.text || a.aufgabenstellung;
          (kap.aufgaben || []).filter(filterFn).forEach(a => alleAufgaben.push({ ukTitel: null, a }));
          (kap.unterkapitel || []).forEach(u => {
            (u.aufgaben || []).filter(filterFn).forEach(a => alleAufgaben.push({ ukTitel: u.titel, a }));
          });
          if (!alleAufgaben.length) return;
          quellenTexte += `\n### ${buch} / ${kap.titel}\n`;
          const n = 10;
          const sample = alleAufgaben.length <= n ? alleAufgaben : (() => {
            const stride = alleAufgaben.length / n;
            const offset = Math.floor(Math.random() * stride);
            return Array.from({ length: n }, (_, i) => alleAufgaben[Math.floor(offset + i * stride) % alleAufgaben.length]);
          })();
          let lastUkTitel = null;
          sample.forEach(({ ukTitel, a }) => {
            if (ukTitel && ukTitel !== lastUkTitel) { quellenTexte += `#### ${ukTitel}\n`; lastUkTitel = ukTitel; }
            const nr = a.nr ? `${a.nr}` : (a.seite ? `S.${a.seite}` : '–');
            const thema = a.thema ? ` [${a.thema}]` : '';
            const text = a.inhalt || a.aufgabenstellung || a.text || '';
            quellenTexte += `  ${nr}${thema}: ${text}\n`;
          });
        });
      }
    }
    // 2. Alte Arbeiten
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
          const raw = await callKI([{ type: 'text', text: p }], { model: KI_MODEL_HAIKU, maxTokens: 600 });
          const parsed = parseKI(raw);
          if (parsed.titel) aufg.titel = parsed.titel;
          if (parsed.beschreibung) aufg.beschreibung = parsed.beschreibung;
          savePruefungsDB(); renderStruktur(); renderAFBBanner();
        } catch(e) { showKIError(statusEl, e); }
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
            const { lernziele, quellenTexte } = await buildKontext();
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
            renderStruktur(); renderFeinstruktur(); renderKonkret(); renderAFBBanner();
            switchSubTab(2);
            statusEl.textContent = `✓ Feinstruktur fuer Aufgabe ${aufgNr} aktualisiert.`;
          } catch (e) {
            showKIError(statusEl, e);
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
    // Einzige Quelle: pr.feinstruktur
    // Priorität: Zeilenpunkte aus spezifikation (wenn vorhanden) → fs.gesamtpunkte als Fallback
    const t = { afb1: 0, afb2: 0, afb3: 0, total: 0 };
    const aktiv = pr.feinstruktur.filter(fs => !fs._removed);

    const feinPunkte = parseFeinPunkte();
    if (feinPunkte.length) {
      // Zeilenpunkte vorhanden → AFB-genaue Verteilung
      feinPunkte.forEach(({ afbKey, punkte }) => {
        if (afbKey === 'reproduktion' || afbKey === 'leichteAnwendung') t.afb1 += punkte;
        else if (afbKey === 'mittlereAnwendung') t.afb2 += punkte;
        else if (afbKey === 'transfer') t.afb3 += punkte;
        t.total += punkte;
      });
    } else {
      // Fallback: gesamtpunkte aus Feinstruktur + AFB-Anteile aus anforderung
      aktiv.forEach(fs => {
        const anf = fs.anforderung || {};
        const taskP = fs.gesamtpunkte || 0;
        const anf1 = (anf.reproduktion || 0) + (anf.leichteAnwendung || 0);
        const anf2 = anf.mittlereAnwendung || 0;
        const anf3 = anf.transfer || 0;
        const anf_sum = anf1 + anf2 + anf3;
        if (anf_sum > 0) {
          t.afb1 += taskP * anf1 / anf_sum;
          t.afb2 += taskP * anf2 / anf_sum;
          t.afb3 += taskP * anf3 / anf_sum;
        } else {
          // keine AFB-Infos → Punkte nur zu total zählen
        }
        t.total += taskP;
      });
      t.afb1 = Math.round(t.afb1);
      t.afb2 = Math.round(t.afb2);
      t.afb3 = Math.round(t.afb3);
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
    grid.style.cssText = 'display:grid;grid-template-columns:52px 1fr 44px 44px 70px;gap:4px 8px;align-items:center;padding:10px 14px;background:var(--surf2);border-radius:8px;border:1px solid var(--bord);';
    rows.forEach(({ key, badges, color, punkte, min }) => {
      const pct = t.total ? Math.round(punkte / t.total * 100) : 0;
      const ziel = z[key] || { min: 0, max: 100 };
      const ok = pct >= ziel.min && pct <= ziel.max;
      const signalColor = '#ef4444';
      const neutralTx = 'var(--tx2)';
      const neutralTx3 = 'var(--tx3)';

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
      barWrap.style.cssText = 'position:relative;height:8px;background:var(--bord);border-radius:4px;overflow:visible;';
      const zielBar = mk('div', '');
      zielBar.style.cssText = `position:absolute;left:${ziel.min}%;width:${ziel.max - ziel.min}%;height:100%;background:rgba(0,0,0,.07);border-radius:4px;`;
      barWrap.appendChild(zielBar);
      const fillBar = mk('div', '');
      fillBar.style.cssText = `position:absolute;left:0;width:${Math.min(pct, 100)}%;height:100%;background:${ok ? 'var(--tx3)' : signalColor};border-radius:4px;transition:width .3s;`;
      barWrap.appendChild(fillBar);
      grid.appendChild(barWrap);

      const pEl = tx('span', '', punkte + ' P'); pEl.style.cssText = `font-size:11px;font-weight:600;color:${ok ? neutralTx : signalColor};`;
      grid.appendChild(pEl);

      const pctEl = tx('span', '', pct + ' %');
      pctEl.style.cssText = `font-size:12px;font-weight:600;color:${ok ? neutralTx : signalColor};text-align:right;`;
      grid.appendChild(pctEl);

      const hint = tx('span', '', ok ? '' : (pct < ziel.min ? '↑ ' + ziel.min + '%' : '↓ ' + ziel.max + '%'));
      hint.style.cssText = `font-size:11px;color:${signalColor};`;
      grid.appendChild(hint);
    });
    afbBanner.appendChild(grid);

    // Zeit/Punkte-Zeile — immer aus pr.feinstruktur
    const aktivFein = pr.feinstruktur.filter(a => !a._removed);
    const zeitGes = aktivFein.reduce((s, a) => s + (a.zeitMinuten || 0), 0);
    // Punkte: Zeilensumme wenn vorhanden, sonst gesamtpunkte-Slider
    const zeilenSumme = parseFeinPunkte().reduce((s, fp) => s + fp.punkte, 0);
    const pktGes = zeilenSumme || aktivFein.reduce((s, a) => s + (a.gesamtpunkte || 0), 0);
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
      renderKonkret();
      renderAFBBanner();
    });
  };
  fein2Toolbar.appendChild(restrBtnTop);
  stufe2Sec.appendChild(fein2Toolbar);

  stufe2Sec.appendChild(feinHint);
  const feinWrap = mk('div', ''); feinWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:10px;';
  stufe2Sec.appendChild(feinWrap);

  // ── Overlay: Aufgabe vollständig bearbeiten ───────────────────────
  function showAufgabeEditOverlay(fs, sv) {
    const feinLocked = !!fs._feinLocked;
    const ov = mk('div', 'matd-overlay');
    const pan = mk('div', 'matd-panel');
    pan.style.cssText = 'max-width:860px;width:95vw;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;';

    // Header
    const phdr = mk('div', 'matd-panel-hdr');
    const hLeft = mk('div', ''); hLeft.style.cssText = 'display:flex;align-items:baseline;gap:8px;flex:1;min-width:0;';
    const nrSpan = tx('span', '', `Aufgabe ${fs.nr}`);
    nrSpan.style.cssText = 'font-size:12px;font-weight:600;color:var(--tx3);flex-shrink:0;';
    hLeft.appendChild(nrSpan);
    hLeft.appendChild(tx('span', 'matd-panel-title', fs.titel || '–'));
    phdr.appendChild(hLeft);
    const cls = btn('✕', 'btn btn-ghost btn-sm matd-close');
    const closeOv = () => { savePruefungsDB(); renderFeinstruktur(); renderAFBBanner(); ov.remove(); };
    cls.onclick = closeOv;
    ov.onclick = e => { if (e.target === ov) closeOv(); };
    phdr.appendChild(cls);
    pan.appendChild(phdr);

    const body = mk('div', '');
    body.style.cssText = 'padding:16px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:16px;';

    // ── Titel ──────────────────────────────────────────────────────
    const titelFg = mk('div', 'fg');
    titelFg.appendChild(tx('label', 'fl', 'Titel'));
    const titelInp = document.createElement('input');
    titelInp.type = 'text'; titelInp.value = fs.titel || ''; titelInp.className = 'finp';
    titelInp.disabled = feinLocked;
    titelInp.oninput = () => { fs.titel = titelInp.value.trim(); };
    titelFg.appendChild(titelInp);
    body.appendChild(titelFg);

    // ── Zeit + Punkte ───────────────────────────────────────────────
    const metaRow = mk('div', '');
    metaRow.style.cssText = 'display:flex;gap:24px;align-items:center;flex-wrap:wrap;';

    const zeitVal = tx('span', '', (fs.zeitMinuten || 5) + ' Min');
    zeitVal.style.cssText = 'font-size:13px;font-weight:700;color:var(--tx1);min-width:52px;';
    const zeitSlider = document.createElement('input'); zeitSlider.type = 'range';
    zeitSlider.min = 1; zeitSlider.max = 45; zeitSlider.step = 1; zeitSlider.value = fs.zeitMinuten || 5;
    zeitSlider.disabled = feinLocked;
    zeitSlider.style.cssText = 'width:80px;accent-color:#2563eb;';
    zeitSlider.oninput = () => { fs.zeitMinuten = parseInt(zeitSlider.value); zeitVal.textContent = zeitSlider.value + ' Min'; renderAFBBanner(); };
    const zeitWrap = mk('div', ''); zeitWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
    zeitWrap.appendChild(tx('span', '', '⏱ Zeit')).style || (zeitWrap.lastChild.style.cssText = 'font-size:13px;color:var(--tx2);flex-shrink:0;');
    zeitWrap.appendChild(zeitSlider); zeitWrap.appendChild(zeitVal);
    metaRow.appendChild(zeitWrap);

    const pktVal = tx('span', '', (fs.gesamtpunkte || 8) + ' P');
    pktVal.style.cssText = 'font-size:13px;font-weight:700;color:var(--tx1);min-width:40px;';
    const pktMismatch = tx('span', '', '');
    pktMismatch.style.cssText = 'font-size:12px;font-weight:600;color:#dc2626;display:none;';
    const pktSlider = document.createElement('input'); pktSlider.type = 'range';
    pktSlider.min = 2; pktSlider.max = 30; pktSlider.step = 1; pktSlider.value = fs.gesamtpunkte || 8;
    pktSlider.disabled = feinLocked;
    pktSlider.style.cssText = 'width:80px;accent-color:#7c3aed;';
    const getSubtaskSum = () => getLines().reduce((s, l) => {
      const parts = l.split('|'); const last = parts[parts.length - 1].trim();
      return s + (parts.length > 1 && /^\d+$/.test(last) ? parseInt(last) : 0);
    }, 0);
    const updatePktMismatch = () => {
      const sum = getSubtaskSum();
      if (sum > 0 && sum !== fs.gesamtpunkte) {
        pktMismatch.textContent = `≠ Summe TA: ${sum} P`;
        pktMismatch.style.display = '';
      } else {
        pktMismatch.style.display = 'none';
      }
    };
    pktSlider.oninput = () => { fs.gesamtpunkte = parseInt(pktSlider.value); pktVal.textContent = pktSlider.value + ' P'; renderAFBBanner(); updatePktMismatch(); };
    const pktWrap = mk('div', ''); pktWrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
    pktWrap.appendChild(tx('span', '', 'Punkte')).style || (pktWrap.lastChild.style.cssText = 'font-size:13px;color:var(--tx2);flex-shrink:0;');
    pktWrap.appendChild(pktSlider); pktWrap.appendChild(pktVal); pktWrap.appendChild(pktMismatch);
    metaRow.appendChild(pktWrap);
    body.appendChild(metaRow);

    // ── Beschreibung ────────────────────────────────────────────────
    const beschFg = mk('div', 'fg');
    beschFg.appendChild(tx('label', 'fl', 'Beschreibung (Briefing für dich und die KI)'));
    const beschArea = document.createElement('textarea');
    beschArea.value = fs.beschreibung || '';
    beschArea.rows = 3;
    beschArea.disabled = feinLocked;
    beschArea.placeholder = 'Was soll diese Aufgabe leisten? Welche Inhalte, welcher Schwerpunkt, besondere Anforderungen…';
    beschArea.className = 'finp';
    beschArea.style.cssText = 'resize:vertical;font-family:inherit;font-size:13px;line-height:1.5;';
    beschArea.oninput = () => { fs.beschreibung = beschArea.value; savePruefungsDB(); };
    beschFg.appendChild(beschArea);
    body.appendChild(beschFg);

    // ── Teilaufgaben ────────────────────────────────────────────────
    const taHdrRow = mk('div', '');
    taHdrRow.style.cssText = 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;';
    const taHdr = mk('div', '');
    taHdr.style.cssText = 'font-size:13px;font-weight:700;color:var(--tx1);';
    taHdr.textContent = 'Teilaufgaben';
    taHdrRow.appendChild(taHdr);
    const taHint = tx('span', '', '⚠ Metaebene: konkrete Zahlenwerte gehören in Panel ③');
    taHint.style.cssText = 'font-size:11px;color:#ca8a04;font-weight:600;';
    taHdrRow.appendChild(taHint);
    body.appendChild(taHdrRow);

    const taWrap = mk('div', '');
    taWrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

    function getLines() {
      return (fs.spezifikation || '').split('\n').map(l => l.replace(/^[-–•]\s*/, '').trim()).filter(l => l);
    }
    function saveLines(lines) {
      fs.spezifikation = lines.map(l => '- ' + l).join('\n');
      savePruefungsDB();
    }
    function recalcPunkte() {
      const sum = getSubtaskSum();
      if (sum > 0) { fs.gesamtpunkte = sum; pktVal.textContent = sum + ' P'; pktSlider.value = Math.min(sum, 30); renderAFBBanner(); }
      updatePktMismatch();
    }

    // Buchstaben automatisch neu vergeben (a, b, c …) nach Position
    function reletter() {
      const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
      let afbIdx = 0;
      const updated = getLines().map(line => {
        const pipeIdx = line.indexOf('|');
        const cand = pipeIdx > -1 ? line.slice(0, pipeIdx).trim() : null;
        const afbKey = cand && AB_KEY_MAP[cand] ? cand : null;
        if (!afbKey) return line;
        let rest = line.slice(pipeIdx + 1).trim();
        let pts = null;
        const lp = rest.lastIndexOf('|');
        if (lp > -1 && /^\d+$/.test(rest.slice(lp + 1).trim())) { pts = rest.slice(lp + 1).trim(); rest = rest.slice(0, lp).trim(); }
        // Vorhandene Kennung abstreifen (alles vor erstem ':' das kurz ist)
        const ci = rest.indexOf(':');
        if (ci > -1 && ci <= 5) rest = rest.slice(ci + 1).trim();
        const letter = LETTERS[afbIdx] ?? String(afbIdx + 1);
        afbIdx++;
        return afbKey + '|' + fs.nr + letter + ': ' + rest + (pts != null ? '|' + pts : '');
      });
      saveLines(updated);
    }

    function buildTaList() {
      reletter(); // Buchstaben vor dem Rendern synchronisieren
      taWrap.innerHTML = '';

      // Spaltenheader
      const colHdr = mk('div', '');
      colHdr.style.cssText = 'display:grid;grid-template-columns:22px 36px 1fr 16px 1fr 42px 24px;gap:0 6px;padding:0 8px 2px;';
      colHdr.appendChild(mk('div', ''));
      colHdr.appendChild(mk('div', ''));
      const vHdr = tx('div', '', 'Vorgabe / Kontext (abstrakt – keine Zahlenwerte)');
      vHdr.style.cssText = 'font-size:11px;font-weight:600;color:var(--tx3);';
      colHdr.appendChild(vHdr);
      colHdr.appendChild(mk('div', ''));
      const oHdr = tx('div', '', 'Geplante Schülertätigkeit (abstrakt)');
      oHdr.style.cssText = 'font-size:11px;font-weight:600;color:var(--tx3);';
      colHdr.appendChild(oHdr);
      taWrap.appendChild(colHdr);

      const lines = getLines();
      lines.forEach((line, li) => {
        const pipeIdx = line.indexOf('|');
        const candidate = pipeIdx > -1 ? line.slice(0, pipeIdx).trim() : null;
        let afbKey = candidate && AB_KEY_MAP[candidate] ? candidate : null;
        let lineRest = afbKey ? line.slice(pipeIdx + 1).trim() : line;
        let zeilenPunkte = null;
        if (afbKey) {
          const lastPipe = lineRest.lastIndexOf('|');
          if (lastPipe > -1) {
            const maybeP = lineRest.slice(lastPipe + 1).trim();
            if (/^\d+$/.test(maybeP)) { zeilenPunkte = parseInt(maybeP); lineRest = lineRest.slice(0, lastPipe).trim(); }
          }
        }
        // Kennung + Inhalt trennen
        const colonIdx = lineRest.indexOf(':');
        const kennung = (colonIdx > -1 && colonIdx <= 5) ? lineRest.slice(0, colonIdx).trim() : '';
        let content = kennung ? lineRest.slice(colonIdx + 1).trim() : lineRest;
        // Vorgabe → Output trennen
        const arrowIdx = content.indexOf('→');
        let vorgabe = arrowIdx > -1 ? content.slice(0, arrowIdx).trim() : content;
        let output  = arrowIdx > -1 ? content.slice(arrowIdx + 1).trim() : '';

        const buildStr = () => {
          const mid = vorgabe + (output ? ' → ' + output : '');
          return (afbKey ? afbKey + '|' : '') + (kennung ? kennung + ': ' : '') + mid + (zeilenPunkte != null ? '|' + zeilenPunkte : '');
        };

        const row = mk('div', '');
        // Grid: badge | kennung | vorgabe | → | output | P | del
        row.style.cssText = 'display:grid;grid-template-columns:22px 36px 1fr 16px 1fr 42px 24px;gap:0 6px;align-items:center;padding:4px 8px;background:var(--surf);border-radius:6px;border:1px solid var(--bord);';

        // AFB-Badge
        const abCfg = afbKey ? AB_KEY_MAP[afbKey] : null;
        const badge = tx('div', '', abCfg ? abCfg.letter : '–');
        badge.style.cssText = `width:22px;height:22px;border-radius:50%;background:${abCfg ? abCfg.color + '33' : 'var(--bord)'};color:${abCfg?.color || 'var(--tx3)'};font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;${feinLocked ? '' : 'cursor:pointer;'}`;
        badge.title = feinLocked ? (abCfg?.title || '') : 'Klicken zum Wechseln';
        if (!feinLocked) {
          badge.onclick = () => {
            const keys = Object.keys(AB_KEY_MAP);
            afbKey = afbKey ? keys[(keys.indexOf(afbKey) + 1) % keys.length] : keys[0];
            const ls = getLines(); ls[li] = buildStr(); saveLines(ls); buildTaList();
          };
        }
        row.appendChild(badge);

        // Kennung-Label
        const kennEl = tx('span', '', kennung ? kennung + ':' : '');
        kennEl.style.cssText = 'font-size:12px;font-weight:700;color:var(--tx3);';
        row.appendChild(kennEl);

        // Vorgabe-Input
        const vInp = document.createElement('input');
        vInp.type = 'text'; vInp.value = vorgabe; vInp.disabled = feinLocked;
        vInp.placeholder = 'z.B. „p und w gegeben" – abstrakt, keine Zahlenwerte';
        vInp.style.cssText = 'width:100%;font-size:13px;font-family:inherit;border:none;border-bottom:1px solid transparent;outline:none;background:transparent;color:var(--tx1);padding:1px 0;';
        vInp.onfocus = () => { vInp.style.borderBottomColor = 'var(--pri)'; };
        vInp.onblur  = () => { vInp.style.borderBottomColor = 'transparent'; };
        vInp.oninput = () => { vorgabe = vInp.value; const ls = getLines(); ls[li] = buildStr(); saveLines(ls); };
        vInp.onkeydown = e => {
          if (e.key === 'Enter') { e.preventDefault(); const ls = getLines(); ls.splice(li + 1, 0, afbKey ? afbKey + '| → ' : ''); saveLines(ls); buildTaList(); }
          if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); row.querySelectorAll('input[type=text]')[1]?.focus(); }
        };
        row.appendChild(vInp);

        // Pfeil
        const arrEl = tx('span', '', '→');
        arrEl.style.cssText = 'color:var(--pri);font-weight:700;font-size:13px;text-align:center;';
        row.appendChild(arrEl);

        // Output-Input
        const oInp = document.createElement('input');
        oInp.type = 'text'; oInp.value = output; oInp.disabled = feinLocked;
        oInp.placeholder = 'z.B. „Berechnung g" – Tätigkeit, kein Ergebnis';
        oInp.style.cssText = 'width:100%;font-size:13px;font-family:inherit;border:none;border-bottom:1px solid transparent;outline:none;background:transparent;color:var(--tx1);padding:1px 0;';
        oInp.onfocus = () => { oInp.style.borderBottomColor = 'var(--pri)'; };
        oInp.onblur  = () => { oInp.style.borderBottomColor = 'transparent'; };
        oInp.oninput = () => { output = oInp.value; const ls = getLines(); ls[li] = buildStr(); saveLines(ls); };
        oInp.onkeydown = e => {
          if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); row.querySelectorAll('input[type=text]')[0]?.focus(); }
        };
        row.appendChild(oInp);

        // Punkte
        const pInp = document.createElement('input');
        pInp.type = 'number'; pInp.min = 1; pInp.max = 20; pInp.step = 1;
        pInp.value = zeilenPunkte ?? ''; pInp.placeholder = 'P'; pInp.disabled = feinLocked;
        pInp.style.cssText = 'width:42px;font-size:12px;font-family:inherit;border:1px solid var(--bord);border-radius:4px;background:var(--surf2);color:var(--tx1);padding:2px 4px;text-align:center;flex-shrink:0;';
        pInp.title = 'Punkte für diese Teilaufgabe';
        pInp.oninput = () => { zeilenPunkte = pInp.value ? parseInt(pInp.value) : null; const ls = getLines(); ls[li] = buildStr(); saveLines(ls); recalcPunkte(); };
        row.appendChild(pInp);

        // Löschen
        if (!feinLocked) {
          const delBtn = btn('✕', '');
          delBtn.style.cssText = 'border:none;background:none;color:var(--tx3);cursor:pointer;font-size:12px;padding:2px 6px;flex-shrink:0;';
          delBtn.onclick = () => { const ls = getLines(); ls.splice(li, 1); saveLines(ls); buildTaList(); };
          row.appendChild(delBtn);
        }
        taWrap.appendChild(row);
      });

      if (!feinLocked) {
        const addBtn = btn('+ Teilaufgabe hinzufügen', 'btn btn-ghost btn-xs');
        addBtn.style.marginTop = '4px';
        addBtn.onclick = () => {
          const ls = getLines(); ls.push('reproduktion| → '); saveLines(ls); buildTaList();
          const inps = taWrap.querySelectorAll('input[type=text]');
          inps[inps.length - 1]?.focus();
        };
        taWrap.appendChild(addBtn);
      }
    }
    body.appendChild(taWrap);
    buildTaList();
    updatePktMismatch(); // beim Öffnen sofort prüfen

    // ── ✨ KI-Überarbeitung ─────────────────────────────────────────
    const kiSec = mk('div', '');
    kiSec.style.cssText = 'border-top:1px solid var(--bord);padding-top:14px;display:flex;flex-direction:column;gap:8px;';
    const kiHdr = mk('div', '');
    kiHdr.style.cssText = 'display:flex;align-items:center;gap:6px;';
    kiHdr.appendChild(tx('span', '', '✨ KI-Überarbeitung')).style || (kiHdr.lastChild.style.cssText = 'font-size:13px;font-weight:700;color:var(--tx1);');
    const kiStatus = tx('span', '', '');
    kiStatus.style.cssText = 'font-size:12px;color:var(--tx3);flex:1;';
    kiHdr.appendChild(kiStatus);
    kiSec.appendChild(kiHdr);

    const kiBtns = mk('div', '');
    kiBtns.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

    const runKIOverlay = async (label, fn) => {
      kiStatus.textContent = `⏳ ${label}…`;
      kiBtns.querySelectorAll('button').forEach(b => { b.disabled = true; });
      try { await fn(); buildTaList(); kiStatus.textContent = '✓ ' + label; }
      catch(e) { showKIError(kiStatus, { message: e.message.slice(0, 80) }); }
      kiBtns.querySelectorAll('button').forEach(b => { b.disabled = false; });
    };

    // ↺ Neu generieren (nutzt Beschreibung + hält Teilaufgaben-Anzahl ein)
    const regenBtn2 = btn('↺ Neu generieren', 'btn btn-ghost btn-xs');
    regenBtn2.title = 'Teilaufgaben von KI neu vorschlagen lassen – Anzahl bleibt gleich';
    regenBtn2.onclick = () => runKIOverlay('Neu generieren', async () => {
      const { lernziele, quellenTexte } = await buildKontext();
      // AFB-Sequenz aus aktuellen Zeilen lesen
      const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
      const afbLines = getLines().map(l => { const p = l.indexOf('|'); return p > -1 ? l.slice(0, p).trim() : null; }).filter(k => k && AB_KEY_MAP[k]);
      const anzahl = afbLines.length || getLines().length;
      const AFB_DEFS = {
        reproduktion:      'Gelerntes direkt wiedergeben: Definitionen, Verfahren, Fakten so wie eingeübt abrufen.',
        leichteAnwendung:  'Bekannte Verfahren auf eine neue, aber ähnliche Situation übertragen.',
        mittlereAnwendung: 'Mehrere Konzepte verknüpfen, strukturierte Probleme eigenständig lösen.',
        transfer:          'Wissen auf unbekannte Situationen übertragen, beurteilen, begründen, gestalten.',
      };
      let p = `Du planst Aufgabe ${fs.nr} einer Klassenarbeit.\nTitel: ${fs.titel}\nZeit: ${fs.zeitMinuten ?? '?'} Min, ${fs.gesamtpunkte ?? '?'} Punkte\n`;
      p += `\n## ANFORDERUNGSBEREICHE – DEFINITIONEN\n`;
      Object.entries(AFB_DEFS).forEach(([k, def]) => { p += `- ${k}: ${def}\n`; });
      if (fs.beschreibung?.trim()) p += `\n## AUFGABENBESCHREIBUNG (Hauptgrundlage)\n${fs.beschreibung}\n`;
      if (afbLines.length) {
        p += `\n## ANFORDERUNGSBEREICHE PRO TEILAUFGABE (VERBINDLICH – exakt so übernehmen)\n`;
        afbLines.forEach((k, i) => { p += `- Teilaufgabe ${fs.nr}${LETTERS[i]}: ${AB_KEY_MAP[k].title} (${k}) – ${AFB_DEFS[k]}\n`; });
      }
      if (lernziele.length) { p += '\n## LERNZIELE\n'; lernziele.slice(0, 4).forEach(lz => { p += `- ${lz}\n`; }); }
      if (quellenTexte.trim()) p += `\n## QUELLEN\n${quellenTexte.slice(0, 2500)}\n`;
      p += `\nERZEUGE GENAU ${anzahl} Teilaufgabe(n). Nicht mehr, nicht weniger.\n`;
      const example = afbLines.map((k, i) => `${k}|${fs.nr}${LETTERS[i]}: Vorgabe → Schülertätigkeit`).join('\\n') || `leichteAnwendung|${fs.nr}a: Vorgabe → Schülertätigkeit`;
      p += `Antworte NUR mit reinem JSON:\n{"spezifikation":"${example}"}`;
      const raw = await callKI([{ type: 'text', text: p }], { maxTokens: 1500 });
      fs.spezifikation = (parseKI(raw).spezifikation) || fs.spezifikation;
      savePruefungsDB();
    });
    kiBtns.appendChild(regenBtn2);

    kiSec.appendChild(kiBtns);
    body.appendChild(kiSec);
    pan.appendChild(body);

    // ── Footer: Sperren | Schließen ────────────────────────────────
    const foot = mk('div', '');
    foot.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid var(--bord);';
    const lockToggle = btn(feinLocked ? '🔓 Entsperren' : '🔐 Sperren', '');
    lockToggle.style.cssText = 'cursor:pointer;font-size:13px;font-weight:700;padding:5px 14px;border-radius:999px;border:none;line-height:1.4;' + (feinLocked ? 'background:rgba(239,68,68,.15);color:#dc2626;' : 'background:rgba(22,163,74,.12);color:#15803d;');
    lockToggle.title = feinLocked ? 'Aufgabe entsperren – Bearbeitung wieder erlauben' : 'Aufgabe sperren – vor weiteren Änderungen schützen';
    lockToggle.onclick = () => {
      fs._feinLocked = !fs._feinLocked;
      if (fs._feinLocked && sv) sv._grobUnlocked = false;
      savePruefungsDB(); renderStruktur(); renderFeinstruktur(); renderAFBBanner(); ov.remove();
    };
    foot.appendChild(lockToggle);
    const footSp = mk('span', ''); footSp.style.flex = '1'; foot.appendChild(footSp);
    const closeBtn2 = btn('Schließen', 'btn btn-pri btn-sm');
    closeBtn2.onclick = closeOv;
    foot.appendChild(closeBtn2);
    pan.appendChild(foot);
    ov.appendChild(pan);
    document.getElementById('root').appendChild(ov);
    ov.classList.add('open');
  }

  // ── Karten (read-only) ────────────────────────────────────────────
  function renderFeinstruktur() {
    feinWrap.innerHTML = '';
    syncDerivedOrder();
    const zuBearbeiten = getActiveTasks();
    pr.feinstruktur.forEach((fs, idx) => {
      const sv = zuBearbeiten.find(a => a.taskId === fs.taskId) || zuBearbeiten[idx];
      const feinLocked = !!fs._feinLocked;
      const card = mk('div', '');
      card.style.cssText = 'border-radius:10px;background:var(--surf2);overflow:hidden;cursor:pointer;transition:box-shadow .15s;';
      card.onmouseenter = () => { card.style.boxShadow = '0 2px 8px rgba(0,0,0,.1)'; };
      card.onmouseleave = () => { card.style.boxShadow = ''; };
      card.onclick = () => showAufgabeEditOverlay(fs, sv);

      // ── Header ────────────────────────────────────────────────────
      const head = mk('div', '');
      head.style.cssText = 'display:flex;align-items:center;gap:8px;padding:9px 14px;background:rgba(124,58,237,.06);border-bottom:1px solid var(--bord);';
      const nrBadge = tx('div', '', String(fs.nr));
      nrBadge.style.cssText = 'width:22px;height:22px;border-radius:50%;background:var(--pri);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
      head.appendChild(nrBadge);
      const titelEl = tx('span', '', fs.titel || '–');
      titelEl.style.cssText = 'font-size:13px;font-weight:700;color:var(--tx1);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      head.appendChild(titelEl);
      const zeitChip = tx('span', '', `⏱ ${fs.zeitMinuten || 5} Min`);
      zeitChip.style.cssText = 'font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:#2563eb1a;color:#2563eb;flex-shrink:0;';
      head.appendChild(zeitChip);
      const pktChip = tx('span', '', `${fs.gesamtpunkte || 8} P`);
      pktChip.style.cssText = 'font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:#7c3aed1a;color:#7c3aed;flex-shrink:0;';
      head.appendChild(pktChip);
      const lockBadge = tx('span', '', feinLocked ? '🔐 Gesperrt' : '🔓 Offen');
      lockBadge.style.cssText = 'font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;flex-shrink:0;line-height:1.4;' + (feinLocked ? 'background:rgba(239,68,68,.15);color:#dc2626;' : 'background:rgba(22,163,74,.12);color:#15803d;');
      head.appendChild(lockBadge);
      card.appendChild(head);

      // ── Zeilen (read-only) ─────────────────────────────────────────
      const listWrap = mk('div', '');
      listWrap.style.cssText = 'padding:8px 14px 10px;display:flex;flex-direction:column;gap:3px;';
      const lines = (fs.spezifikation || '').split('\n').map(l => l.replace(/^[-–•]\s*/, '').trim()).filter(l => l);
      if (!lines.length) {
        const empty = tx('div', '', 'Keine Teilaufgaben – klicken zum Bearbeiten');
        empty.style.cssText = 'font-size:12px;color:var(--tx3);font-style:italic;';
        listWrap.appendChild(empty);
      }
      lines.forEach(line => {
        const pipeIdx = line.indexOf('|');
        const candidate = pipeIdx > -1 ? line.slice(0, pipeIdx).trim() : null;
        const afbKey = candidate && AB_KEY_MAP[candidate] ? candidate : null;
        let lineRest = afbKey ? line.slice(pipeIdx + 1).trim() : line;
        let zeilenPunkte = null;
        if (afbKey) {
          const lastPipe = lineRest.lastIndexOf('|');
          if (lastPipe > -1) {
            const maybeP = lineRest.slice(lastPipe + 1).trim();
            if (/^\d+$/.test(maybeP)) { zeilenPunkte = parseInt(maybeP); lineRest = lineRest.slice(0, lastPipe).trim(); }
          }
        }
        const row = mk('div', '');
        row.style.cssText = 'display:flex;align-items:baseline;gap:6px;font-size:12px;line-height:1.5;';
        const abCfg = afbKey ? AB_KEY_MAP[afbKey] : null;
        const badge = tx('div', '', abCfg ? abCfg.letter : '–');
        badge.style.cssText = `width:18px;height:18px;border-radius:50%;background:${abCfg ? abCfg.color + '22' : 'transparent'};color:${abCfg?.color || 'var(--tx3)'};font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;`;
        row.appendChild(badge);
        const textEl = tx('span', '', lineRest);
        textEl.style.cssText = 'color:var(--tx2);flex:1;';
        row.appendChild(textEl);
        if (zeilenPunkte != null) {
          const pEl = tx('span', '', zeilenPunkte + ' P');
          pEl.style.cssText = 'color:var(--tx3);font-size:11px;flex-shrink:0;';
          row.appendChild(pEl);
        }
        listWrap.appendChild(row);
      });
      card.appendChild(listWrap);

      // ── Footer: Konkrete Aufgabe erstellen ────────────────────────
      const cardFoot = mk('div', '');
      cardFoot.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;padding:6px 10px;border-top:1px solid var(--bord);background:rgba(0,0,0,.02);';
      const konkretBtn = btn('✨ Konkrete Aufgabe erstellen', 'btn btn-ghost btn-xs');
      konkretBtn.style.cssText += ';font-size:12px;color:var(--pri);font-weight:600;';
      konkretBtn.title = 'KI erstellt konkreten Aufgabentext mit Zahlenwerten → Panel ③';
      konkretBtn.onclick = async (e) => {
        e.stopPropagation();
        konkretBtn.disabled = true;
        konkretBtn.textContent = '⏳ KI arbeitet…';
        try {
          const specLines = parseSpecLines(fs);
          if (!specLines.length) {
            konkretBtn.textContent = '⚠ Keine Teilaufgaben in Feinstruktur';
            setTimeout(() => { konkretBtn.textContent = '✨ Konkrete Aufgabe erstellen'; konkretBtn.disabled = false; }, 2500);
            return;
          }
          const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
          let lernziele = [], quellenTexte = '';
          try { ({ lernziele, quellenTexte } = await buildKontext()); } catch(_) {}
          let p = `Du bist Mathematiklehrerin und erstellst konkrete Aufgabentexte fuer eine Klassenarbeit.\n`;
          p += `Aufgabe ${fs.nr}: ${fs.titel || ''}\nZeit: ${fs.zeitMinuten ?? '?'} Min, ${fs.gesamtpunkte ?? '?'} Punkte\n`;
          p += `\nWICHTIG: Eine Teilaufgabe kann mehrere Rechenaufgaben, Tabellenzeilen oder Beispiele enthalten.\n`;
          p += `Die BESCHREIBUNG unten gibt vor, wie umfangreich und detailliert die Aufgabe sein soll — halte dich genau daran.\n`;
          if (fs.beschreibung?.trim()) p += `\n## AUFGABENBESCHREIBUNG (verbindlich fuer Umfang und Inhalt)\n${fs.beschreibung}\n`;
          p += `\n## TEILAUFGABEN-STRUKTUR (${specLines.length} Teilaufgabe(n))\n`;
          specLines.forEach((sl, i) => {
            const afbDef = sl.afbKey ? ` [${AB_KEY_MAP[sl.afbKey].title}: ${({reproduktion:'Gelerntes direkt anwenden',leichteAnwendung:'Bekanntes in aehnlicher Situation',mittlereAnwendung:'Konzepte verknuepfen',transfer:'Auf Unbekanntes uebertragen'})[sl.afbKey]||''}]` : '';
            p += `- Teilaufgabe ${fs.nr}${LETTERS[i]}: ${sl.metaVorgabe}${sl.metaOutput ? ' -> ' + sl.metaOutput : ''}${afbDef}${sl.punkte ? ' (' + sl.punkte + ' P)' : ''}\n`;
          });
          if (lernziele.length) { p += `\n## LERNZIELE\n`; lernziele.slice(0, 4).forEach(lz => { p += `- ${lz}\n`; }); }
          if (quellenTexte && quellenTexte.trim()) p += `\n## REFERENZAUFGABEN\n${quellenTexte.slice(0, 2500)}\n`;
          p += `\nErstelle fuer jede der ${specLines.length} Teilaufgabe(n) einen vollstaendigen, schuelergerechten Aufgabentext mit allen konkreten Zahlenwerten.`;
          p += `\nDer Umfang richtet sich nach der Beschreibung (z.B. Tabelle mit 9 Zeilen = 9 Zeilen im Aufgabentext).`;
          p += `\nFuer "loesung": vollstaendiger Loesungsweg mit allen Zwischenschritten und Ergebnissen.`;
          p += `\nAntworte NUR mit reinem JSON:\n{"konkret":[{"aufgabe":"vollstaendiger Aufgabentext","loesung":"vollstaendiger Loesungsweg"}]}`;
          const raw = await callKI([{ type: 'text', text: p }], { maxTokens: 1800 });
          // Eigener Parser für {aufgabe, loesung}-Arrays — unabhängig von robustJsonParsePr
          let items = null;
          const cleaned = raw.replace(/^```[a-zA-Z]*\n?/m, '').replace(/```\s*$/m, '').trim();
          // Versuch 1: standard JSON.parse nach Repair
          try {
            const repaired = repairJsonStringsPr(cleaned);
            const obj = JSON.parse(repaired);
            if (Array.isArray(obj)) items = obj;
            else if (Array.isArray(obj.konkret)) items = obj.konkret;
            else if (obj.aufgabe) items = [obj];
          } catch(_) {}
          // Versuch 2: alle {aufgabe:…, loesung:…}-Objekte per Regex extrahieren
          if (!items || !items.length) {
            items = [];
            const re = /\{\s*"aufgabe"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"loesung"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
            let m;
            while ((m = re.exec(cleaned)) !== null) {
              items.push({ aufgabe: m[1].replace(/\\n/g, '\n'), loesung: m[2].replace(/\\n/g, '\n') });
            }
            // auch umgekehrte Reihenfolge der Keys
            if (!items.length) {
              const re2 = /\{\s*"loesung"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"aufgabe"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
              while ((m = re2.exec(cleaned)) !== null) {
                items.push({ aufgabe: m[2].replace(/\\n/g, '\n'), loesung: m[1].replace(/\\n/g, '\n') });
              }
            }
          }
          if (!items || !items.length) {
            konkretBtn.textContent = '⚠ Kein verwertbares Ergebnis';
            setTimeout(() => { konkretBtn.textContent = '✨ Konkrete Aufgabe erstellen'; konkretBtn.disabled = false; }, 3000);
            return;
          }
          ensureKonkret(fs);
          items.forEach((k, i) => {
            if (i < fs.konkret.length) {
              if (k.aufgabe) fs.konkret[i].aufgabe = k.aufgabe;
              if (k.loesung) fs.konkret[i].loesung = k.loesung;
            }
          });
          savePruefungsDB();
          renderKonkret();
          switchSubTab(3);
        } catch(err) {
          konkretBtn.textContent = '⚠ Fehler: ' + String(err).slice(0, 40);
          setTimeout(() => { konkretBtn.textContent = '✨ Konkrete Aufgabe erstellen'; konkretBtn.disabled = false; }, 4000);
          return;
        }
        konkretBtn.textContent = '✨ Konkrete Aufgabe erstellen';
        konkretBtn.disabled = false;
      };
      cardFoot.appendChild(konkretBtn);
      card.appendChild(cardFoot);
      feinWrap.appendChild(card);
    });
  }
  renderFeinstruktur(); renderAFBBanner();

  // ════════════════════════════════════════════════════════════════
  // STUFE 3: Konkrete Aufgaben (Zahlenwerte + Lösungen)
  // ════════════════════════════════════════════════════════════════
  const stufe3Sec = panel3;

  // Hilfsfunktion: Spezifikationszeilen einer Aufgabe parsen
  // Nur AFB-Zeilen (mit gültigem afbKey) werden zurückgegeben — Artefakte wie "4 Unteraufgaben" werden übersprungen
  function parseSpecLines(fs) {
    return (fs.spezifikation || '').split('\n')
      .map(l => l.replace(/^[-–•]\s*/, '').trim()).filter(l => l)
      .map(line => {
        const pipeIdx = line.indexOf('|');
        const candidate = pipeIdx > -1 ? line.slice(0, pipeIdx).trim() : null;
        const afbKey = candidate && AB_KEY_MAP[candidate] ? candidate : null;
        if (!afbKey) return null; // Nicht-AFB-Zeilen ignorieren
        let rest = afbKey ? line.slice(pipeIdx + 1).trim() : line;
        let punkte = null;
        if (afbKey) {
          const lp = rest.lastIndexOf('|');
          if (lp > -1 && /^\d+$/.test(rest.slice(lp + 1).trim())) {
            punkte = parseInt(rest.slice(lp + 1).trim()); rest = rest.slice(0, lp).trim();
          }
        }
        const ci = rest.indexOf(':');
        const kennung = (ci > -1 && ci <= 5) ? rest.slice(0, ci).trim() : '';
        const content = kennung ? rest.slice(ci + 1).trim() : rest;
        const arrowIdx = content.indexOf('→');
        const metaVorgabe = arrowIdx > -1 ? content.slice(0, arrowIdx).trim() : content;
        const metaOutput  = arrowIdx > -1 ? content.slice(arrowIdx + 1).trim() : '';
        return { afbKey, kennung, metaVorgabe, metaOutput, punkte };
      }).filter(Boolean);
  }

  // Konkrete Daten pro Aufgabe + Zeile initialisieren/synchronisieren
  function ensureKonkret(fs) {
    const lines = parseSpecLines(fs);
    if (!fs.konkret) fs.konkret = [];
    // Länge angleichen
    while (fs.konkret.length < lines.length) fs.konkret.push({ aufgabe: '', loesung: '' });
    if (fs.konkret.length > lines.length) fs.konkret.length = lines.length;
  }

  const aufgabenWrap = mk('div', '');
  aufgabenWrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;';
  stufe3Sec.appendChild(aufgabenWrap);

  function hatKonkretInhalt(fs) {
    return Array.isArray(fs.konkret) && fs.konkret.some(k => k.aufgabe?.trim() || k.loesung?.trim());
  }

  function renderKonkret() {
    aufgabenWrap.innerHTML = '';

    const mitInhalt = pr.feinstruktur.filter(fs => !fs._removed && hatKonkretInhalt(fs));
    if (!mitInhalt.length) {
      const leer = tx('div', '', 'Noch keine konkreten Aufgaben erstellt. In ② Feinstruktur bei einer Aufgabe auf „✨ Konkrete Aufgabe erstellen" klicken.');
      leer.style.cssText = 'font-size:13px;color:var(--tx3);padding:20px 0;line-height:1.6;';
      aufgabenWrap.appendChild(leer);
      return;
    }

    mitInhalt.forEach(fs => {
      // Länge angleichen ohne leere Einträge zu erzeugen
      const lines = parseSpecLines(fs);
      while (fs.konkret.length < lines.length) fs.konkret.push({ aufgabe: '', loesung: '' });
      if (fs.konkret.length > lines.length) fs.konkret.length = lines.length;

      const card = mk('div', '');
      card.style.cssText = 'border-radius:10px;background:var(--surf2);overflow:hidden;border:1px solid var(--bord);';

      // ── Kopfzeile ──
      const head = mk('div', '');
      head.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(124,58,237,.06);border-bottom:1px solid var(--bord);';
      const nrBadge = tx('div', '', String(fs.nr));
      nrBadge.style.cssText = 'width:24px;height:24px;border-radius:50%;background:var(--pri);color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
      head.appendChild(nrBadge);
      const titelEl = tx('span', '', fs.titel || '–');
      titelEl.style.cssText = 'font-size:14px;font-weight:700;color:var(--tx1);flex:1;';
      head.appendChild(titelEl);
      if (fs.zeitMinuten) {
        const zt = tx('span', '', '⏱ ' + fs.zeitMinuten + ' Min');
        zt.style.cssText = 'font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:rgba(37,99,235,.1);color:#2563eb;flex-shrink:0;';
        head.appendChild(zt);
      }
      if (fs.gesamtpunkte) {
        const pt = tx('span', '', fs.gesamtpunkte + ' P');
        pt.style.cssText = 'font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:rgba(124,58,237,.12);color:var(--pri);flex-shrink:0;';
        head.appendChild(pt);
      }
      card.appendChild(head);

      // ── Spaltentitel ──
      const colHdr = mk('div', '');
      colHdr.style.cssText = 'display:grid;grid-template-columns:22px 36px 1fr 1fr;gap:0 10px;padding:6px 14px 2px;border-bottom:1px solid var(--bord);background:rgba(0,0,0,.02);';
      colHdr.appendChild(mk('div', '')); colHdr.appendChild(mk('div', ''));
      const ch1 = tx('div', '', 'Konkreter Aufgabentext (mit Zahlenwerten)');
      ch1.style.cssText = 'font-size:11px;font-weight:600;color:var(--tx3);';
      const ch2 = tx('div', '', 'Lösung / Musterlösung');
      ch2.style.cssText = 'font-size:11px;font-weight:600;color:#dc2626;opacity:.7;';
      colHdr.appendChild(ch1); colHdr.appendChild(ch2);
      card.appendChild(colHdr);

      // ── Teilaufgaben ──
      if (!lines.length) {
        const leer = tx('div', '', 'Keine Teilaufgaben – in ② Feinstruktur eintragen.');
        leer.style.cssText = 'font-size:12px;color:var(--tx3);padding:10px 14px;font-style:italic;';
        card.appendChild(leer);
      }

      lines.forEach((parsed, li) => {
        const { afbKey, kennung, metaVorgabe, metaOutput, punkte } = parsed;
        const abCfg = afbKey ? AB_KEY_MAP[afbKey] : null;
        const ko = fs.konkret[li];

        const wrap = mk('div', '');
        wrap.style.cssText = 'border-top:1px solid var(--bord);';

        // Meta-Zeile (read-only, als Orientierung)
        const metaRow = mk('div', '');
        metaRow.style.cssText = 'display:grid;grid-template-columns:22px 36px 1fr 1fr;gap:0 10px;padding:5px 14px 2px;align-items:center;';
        const badge = tx('div', '', abCfg ? abCfg.letter : '–');
        badge.style.cssText = `width:18px;height:18px;border-radius:50%;background:${abCfg ? abCfg.color + '22' : 'var(--bord)'};color:${abCfg?.color || 'var(--tx3)'};font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;`;
        badge.title = abCfg?.title || '';
        metaRow.appendChild(badge);
        const kennEl = tx('span', '', kennung ? kennung + ':' : '');
        kennEl.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx3);';
        metaRow.appendChild(kennEl);
        const metaDesc = tx('span', '', metaVorgabe + (metaOutput ? ' → ' + metaOutput : ''));
        metaDesc.style.cssText = 'font-size:11px;color:var(--tx3);font-style:italic;grid-column:3/5;';
        metaRow.appendChild(metaDesc);
        wrap.appendChild(metaRow);

        // Eingabe-Zeile
        const inputRow = mk('div', '');
        inputRow.style.cssText = 'display:grid;grid-template-columns:22px 36px 1fr 1fr;gap:0 10px;padding:3px 14px 8px;align-items:start;';
        inputRow.appendChild(mk('div', '')); inputRow.appendChild(mk('div', ''));

        const aufgInp = document.createElement('textarea');
        aufgInp.value = ko.aufgabe || '';
        aufgInp.placeholder = 'Aufgabentext mit konkreten Werten…';
        aufgInp.rows = 2;
        aufgInp.style.cssText = 'width:100%;font-size:13px;font-family:inherit;border:1px solid var(--bord);border-radius:5px;background:var(--surf);color:var(--tx1);padding:5px 7px;resize:vertical;box-sizing:border-box;line-height:1.5;';
        aufgInp.onfocus = () => { aufgInp.style.borderColor = 'var(--pri)'; };
        aufgInp.onblur  = () => { aufgInp.style.borderColor = 'var(--bord)'; };
        aufgInp.oninput = () => { ko.aufgabe = aufgInp.value; savePruefungsDB(); };
        inputRow.appendChild(aufgInp);

        const loesWrap = mk('div', '');
        loesWrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
        const loesInp = document.createElement('textarea');
        loesInp.value = ko.loesung || '';
        loesInp.placeholder = 'Lösung / Musterlösung…';
        loesInp.rows = 2;
        loesInp.style.cssText = 'width:100%;font-size:13px;font-family:inherit;border:1px solid var(--bord);border-radius:5px;background:var(--surf);color:#dc2626;padding:5px 7px;resize:vertical;box-sizing:border-box;line-height:1.5;';
        loesInp.onfocus = () => { loesInp.style.borderColor = '#dc2626'; };
        loesInp.onblur  = () => { loesInp.style.borderColor = 'var(--bord)'; };
        loesInp.oninput = () => { ko.loesung = loesInp.value; savePruefungsDB(); };
        loesWrap.appendChild(loesInp);
        if (punkte != null) {
          const pEl = tx('span', '', punkte + ' P');
          pEl.style.cssText = `font-size:11px;font-weight:700;color:${abCfg?.color || 'var(--tx3)'};text-align:right;`;
          loesWrap.appendChild(pEl);
        }
        inputRow.appendChild(loesWrap);
        wrap.appendChild(inputRow);
        card.appendChild(wrap);
      });

      aufgabenWrap.appendChild(card);
    });
  }
  renderKonkret(); renderAFBBanner();
  lockInfo.textContent = pr.grobstrukturLocked
    ? 'Grobstruktur ist nach der ersten Feinplanung gesperrt. Zum Aendern einzelne Aufgaben entsperren.'
    : 'Zeit und Punkte hier grob anpassen, dann einmal die Feinplanung fuer alle Aufgaben laufen lassen.';

  // ── Handler: Stufe 1 — Grobstruktur ──────────────────────────
  strukturBtn.onclick = async () => {
    strukturBtn.disabled = true;
    statusEl.textContent = '⏳ KI schlägt Grobstruktur vor…';
    try {
      const { refArbeiten, lernziele, quellenTexte } = await buildKontext();
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
        p += `## AUFGABEN AUS DEINEN QUELLEN\nNutze diese Vorlagen als Ausgangspunkt für Themen, Typen und Schwierigkeitsgrad:\n${quellenTexte.slice(0, 2500)}\n`;
      }
      p += `Antworte NUR mit reinem JSON:
{"hauptaufgaben":[
  {"nr":1,"titel":"Kurzer Titel","beschreibung":"Was Schüler hier tun (1 Satz)","zeitMinuten":8,"gesamtpunkte":10,"typen":["Rechnung","Multiple Choice"],
   "anforderung":{"reproduktion":4,"leichteAnwendung":4,"mittlereAnwendung":2,"transfer":0}}
]}
anforderung: Punktverteilung auf vier Bereiche (Summe = gesamtpunkte, 0 wenn nicht vorhanden):
reproduktion | leichteAnwendung | mittlereAnwendung | transfer`;
      const raw = await callKI([{ type: 'text', text: p }], { maxTokens: 2000 });
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
    } catch(e) { showKIError(statusEl, e); }
    strukturBtn.disabled = false;
  };

  // ── Handler: Stufe 2 — Feinstruktur ──────────────────────────
  zuFeinBtn.onclick = async () => {
    const zuBearbeiten = getActiveTasks();
    if (!zuBearbeiten.length) { statusEl.textContent = '⚠ Keine Aufgaben ausgewählt.'; return; }
    zuFeinBtn.disabled = true; strukturBtn.disabled = true;
    pr.feinstruktur = []; switchSubTab(2);
    const { lernziele, quellenTexte } = await buildKontext();
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
      renderKonkret();
      renderAFBBanner();
      lockInfo.textContent = 'Grobstruktur ist nach der ersten Feinplanung gesperrt. Zum Aendern einzelne Aufgaben entsperren.';
      statusEl.textContent = '✓ Feinstruktur fertig. Korrigiere wenn nötig, dann über Aktionen ▾ konkrete Aufgaben generieren.';
    } catch(e) { showKIError(statusEl, e); }
    zuFeinBtn.disabled = false; strukturBtn.disabled = false;
  };

  return div;
}
