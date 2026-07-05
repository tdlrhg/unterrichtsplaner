// ── Planungs-Chat (Block- und Reihen-Ebene) ──────────────────────────
// Block-Chat: plant Reihen für einen Block (Themensequenzen)
// Reihen-Chat: plant Stundenthemen und -abfolge für eine Reihe

const PC_FACH = { M:'Mathematik', Ch:'Chemie', Bio:'Biologie', Ch_GK:'Chemie', Ch_LK:'Chemie', Bio_GK:'Biologie', Bio_LK:'Biologie' };

let _pcMsgs    = [];
let _pcApi     = [];
let _pcFpId    = null;
let _pcBlockId = null;
let _pcReiheId = null;  // null = Block-Chat, reihe.id = Reihen-Chat
let _pcRunning = false;

// ── Tools für den Block-Chat (plant Reihen) ──────────────────────────
const PC_TOOLS = [
  {
    name: 'readPlan',
    description: 'Liest den aktuellen Planungsstand dieses Blocks: alle Reihen und ihre Stunden.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'readKLP',
    description: 'Liest KLP-Kompetenzerwartungen (NRW) für dieses Fach.',
    input_schema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Optionaler Suchbegriff (Inhaltsfeld oder Kompetenz)' }
      }
    }
  },
  {
    name: 'readMethoden',
    description: 'Liest die Methodendatenbank.',
    input_schema: {
      type: 'object',
      properties: {
        phase:      { type: 'string', description: 'Filter auf Unterrichtsphase (optional)' },
        sozialform: { type: 'string', description: 'Filter auf Sozialform (optional)' }
      }
    }
  },
  {
    name: 'readDidaktik',
    description: 'Liest didaktische Leitlinien aus der Wissensbasis.',
    input_schema: {
      type: 'object',
      properties: {
        ebenen: { type: 'string', description: 'Kommagetrennte Planungsebenen: reihe, stunde, material, situation (optional)' },
        themen:  { type: 'string', description: 'Kommagetrennte Themen, z.B. differenzierung,motivation (optional)' }
      }
    }
  },
  {
    name: 'createReihe',
    description: 'Erstellt eine Unterrichtsreihe im aktuellen Block (typisch 6–15 Stunden).',
    input_schema: {
      type: 'object',
      properties: {
        titel:        { type: 'string', description: 'Titel der Reihe' },
        beschreibung: { type: 'string', description: 'Didaktische Begründung (optional)' },
        schwerpunkt:  { type: 'string', description: 'Pädagogischer Schwerpunkt (optional)' },
        stundenAnzahl:{ type: 'number', description: 'Geplante Unterrichtsstunden – immer angeben' }
      },
      required: ['titel']
    }
  },
  {
    name: 'updateReihe',
    description: 'Aktualisiert Felder einer bestehenden Reihe.',
    input_schema: {
      type: 'object',
      properties: {
        reiheId:      { type: 'string', description: 'ID der Reihe (aus readPlan)' },
        titel:        { type: 'string' },
        beschreibung: { type: 'string' },
        schwerpunkt:  { type: 'string' },
        stundenAnzahl:{ type: 'number' }
      },
      required: ['reiheId']
    }
  },
  {
    name: 'deleteReihe',
    description: 'Löscht eine Reihe. Nur wenn sie wirklich überflüssig oder ein Duplikat ist.',
    input_schema: {
      type: 'object',
      properties: {
        reiheId: { type: 'string', description: 'ID der zu löschenden Reihe' }
      },
      required: ['reiheId']
    }
  },
  {
    name: 'readDatenbank',
    description: 'Durchsucht die Materialdatenbank nach verfügbarem Unterrichtsmaterial für dieses Fach (Arbeitsblätter, Materialsets, Handreichungen, Schulbuch-Aufgaben). Rufe dies IMMER auf bevor du planst — berücksichtige nur Material, das tatsächlich vorhanden ist.',
    input_schema: {
      type: 'object',
      properties: {
        thema: { type: 'string', description: 'Suchbegriff für Thema, Kapitel oder Stichwort — leer lassen für alle Materialien des Fachs' },
        jahrgang: { type: 'string', description: 'Nach Jahrgang filtern, z.B. "9" (optional)' },
        inhaltstyp: { type: 'string', description: 'Nach Typ filtern: arbeitsblatt|loesung|lehrerkommentar|lzk|lehrtext (optional)' }
      }
    }
  }
];

// ── Tools für den Reihen-Chat (plant Stundenthemen und -abfolge) ─────
const PC_STUNDEN_TOOLS = [
  {
    name: 'readPlan',
    description: 'Liest den aktuellen Stand dieser Reihe: alle bereits geplanten Stunden.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'readKLP',
    description: 'Liest KLP-Kompetenzerwartungen (NRW) für dieses Fach.',
    input_schema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Optionaler Suchbegriff' }
      }
    }
  },
  {
    name: 'readMethoden',
    description: 'Liest die Methodendatenbank.',
    input_schema: {
      type: 'object',
      properties: {
        phase:      { type: 'string', description: 'Filter auf Unterrichtsphase (optional)' },
        sozialform: { type: 'string', description: 'Filter auf Sozialform (optional)' }
      }
    }
  },
  {
    name: 'createStunde',
    description: 'Erstellt eine Unterrichtsstunde in dieser Reihe (Thema, Lernziel, Methode – noch keine Phasen). Immer dauer=45 verwenden – ob zwei Stunden als Doppelstunde zusammengelegt werden, entscheidet die Lehrerin.',
    input_schema: {
      type: 'object',
      properties: {
        titel:    { type: 'string', description: 'Stundenthema' },
        lernziel: { type: 'string', description: 'Lernziel der Stunde (optional)' },
        dauer:    { type: 'number', description: 'Immer 45 – nie 90 angeben' },
        intention:{ type: 'string', description: 'Didaktische Begründung (optional)' },
        methode:  { type: 'string', description: 'Hauptmethode (optional)' }
      },
      required: ['titel']
    }
  },
  {
    name: 'updateStunde',
    description: 'Aktualisiert eine bestehende Stunde.',
    input_schema: {
      type: 'object',
      properties: {
        stundeId: { type: 'string', description: 'ID der Stunde (aus readPlan)' },
        titel:    { type: 'string' },
        lernziel: { type: 'string' },
        dauer:    { type: 'number' },
        intention:{ type: 'string' },
        methode:  { type: 'string' }
      },
      required: ['stundeId']
    }
  },
  {
    name: 'deleteStunde',
    description: 'Löscht eine Stunde. Nur wenn sie wirklich überflüssig oder ein Duplikat ist.',
    input_schema: {
      type: 'object',
      properties: {
        stundeId: { type: 'string', description: 'ID der zu löschenden Stunde' }
      },
      required: ['stundeId']
    }
  },
  {
    name: 'readDatenbank',
    description: 'Durchsucht die Materialdatenbank nach verfügbarem Unterrichtsmaterial für dieses Fach (Arbeitsblätter, Materialsets, Handreichungen, Schulbuch-Aufgaben). Rufe dies IMMER auf bevor du planst — berücksichtige nur Material, das tatsächlich vorhanden ist.',
    input_schema: {
      type: 'object',
      properties: {
        thema: { type: 'string', description: 'Suchbegriff für Thema, Kapitel oder Stichwort — leer lassen für alle Materialien des Fachs' },
        jahrgang: { type: 'string', description: 'Nach Jahrgang filtern, z.B. "9" (optional)' },
        inhaltstyp: { type: 'string', description: 'Nach Typ filtern: arbeitsblatt|loesung|lehrerkommentar|lzk|lehrtext (optional)' }
      }
    }
  }
];

async function _pcExecTool(name, input, fp) {
  switch (name) {

    case 'readPlan': {
      const blk = (fp.blocks || []).find(b => b.id === _pcBlockId);
      if (_pcReiheId) {
        // Reihen-Kontext: nur diese Reihe zurückgeben
        const rei = blk && (blk.reihen || []).find(r => r.id === _pcReiheId);
        if (!rei) return JSON.stringify({});
        return JSON.stringify({
          id: rei.id, titel: rei.titel, beschreibung: rei.beschreibung || '',
          schwerpunkt: rei.schwerpunkt || '', stundenAnzahl: rei.stundenAnzahl,
          notizen: rei.notizen || '',
          stunden: (rei.stunden || []).map(s => ({
            id: s.id, titel: s.titel, lernziel: s.lernziel || '',
            dauer: s.dauer, intention: s.intention || '', methode: s.methode || ''
          }))
        });
      }
      // Block-Kontext: ganzen Block zurückgeben
      if (!blk) return JSON.stringify([]);
      return JSON.stringify([{
        id: blk.id, titel: blk.titel, beschreibung: blk.beschreibung,
        stundenGesamt: blk.stundenGesamt || null, notizen: blk.notizen || '',
        reihen: (blk.reihen || []).map(r => ({
          id: r.id, titel: r.titel, beschreibung: r.beschreibung,
          schwerpunkt: r.schwerpunkt, stundenAnzahl: r.stundenAnzahl,
          notizen: r.notizen || '',
          stunden: (r.stunden || []).map(s => ({ id: s.id, titel: s.titel, lernziel: s.lernziel, dauer: s.dauer, methode: s.methode }))
        }))
      }]);
    }

    case 'readKLP': {
      const fachName = PC_FACH[fp.fach] || fp.fach;
      let hits = KLPDB.filter(e => e.fach === fachName);
      if (input.filter) {
        const q = input.filter.toLowerCase();
        hits = hits.filter(e =>
          (e.inhaltsfeld || '').toLowerCase().includes(q) ||
          (e.beschreibung || '').toLowerCase().includes(q)
        );
      }
      return JSON.stringify(hits.slice(0, 60).map(e => ({
        id: e.id, inhaltsfeld: e.inhaltsfeld,
        codes: e.kompetenzcodes, text: (e.beschreibung || '').slice(0, 120)
      })));
    }

    case 'readMethoden': {
      let hits = [...METHDB];
      if (input.phase)      hits = hits.filter(m => (m.phasen || []).some(p => p.toLowerCase().includes(input.phase.toLowerCase())));
      if (input.sozialform) hits = hits.filter(m => (m.sozialform || []).some(s => s.toLowerCase().includes(input.sozialform.toLowerCase())));
      return JSON.stringify(hits.slice(0, 60).map(m => ({
        name: m.name, beschreibung: (m.beschreibung || '').slice(0, 120),
        phasen: m.phasen, sozialform: m.sozialform, zeitbedarf: m.zeitbedarf
      })));
    }

    case 'readDidaktik': {
      const ebenen = input.ebenen ? input.ebenen.split(',').map(s => s.trim()) : ['reihe', 'stunde'];
      const themen  = input.themen  ? input.themen.split(',').map(s => s.trim())  : [];
      const text = getDIDContext(ebenen, themen);
      return text || '(keine passenden Einträge gefunden)';
    }

    case 'createReihe': {
      const blk = (fp.blocks || []).find(b => b.id === _pcBlockId);
      if (!blk) return JSON.stringify({ error: 'Aktueller Block nicht gefunden' });
      const r = {
        id: uid(), titel: input.titel, beschreibung: input.beschreibung || '',
        schwerpunkt: input.schwerpunkt || '', stundenAnzahl: input.stundenAnzahl || null,
        stunden: [], einheiten: []
      };
      if (!blk.reihen) blk.reihen = [];
      blk.reihen.push(r);
      scheduleSave(); render();
      return JSON.stringify({ ok: true, id: r.id, titel: r.titel });
    }

    case 'updateReihe': {
      const blk = (fp.blocks || []).find(b => b.id === _pcBlockId);
      const rei = blk && (blk.reihen || []).find(r => r.id === input.reiheId);
      if (!rei) return JSON.stringify({ error: 'Reihe nicht gefunden: ' + input.reiheId });
      if (input.titel         !== undefined) rei.titel         = input.titel;
      if (input.beschreibung  !== undefined) rei.beschreibung  = input.beschreibung;
      if (input.schwerpunkt   !== undefined) rei.schwerpunkt   = input.schwerpunkt;
      if (input.stundenAnzahl !== undefined) rei.stundenAnzahl = input.stundenAnzahl;
      scheduleSave(); render();
      return JSON.stringify({ ok: true, id: rei.id, titel: rei.titel });
    }

    case 'deleteReihe': {
      const blk = (fp.blocks || []).find(b => b.id === _pcBlockId);
      if (!blk) return JSON.stringify({ error: 'Block nicht gefunden' });
      const before = (blk.reihen || []).length;
      blk.reihen = (blk.reihen || []).filter(r => r.id !== input.reiheId);
      if (blk.reihen.length === before) return JSON.stringify({ error: 'Reihe nicht gefunden: ' + input.reiheId });
      scheduleSave(); render();
      return JSON.stringify({ ok: true });
    }

    case 'createStunde': {
      const blk = (fp.blocks || []).find(b => b.id === _pcBlockId);
      const rei = blk && (blk.reihen || []).find(r => r.id === _pcReiheId);
      if (!rei) return JSON.stringify({ error: 'Aktuelle Reihe nicht gefunden' });
      const s = {
        id: uid(), titel: input.titel, lernziel: input.lernziel || '',
        dauer: input.dauer || 45, intention: input.intention || '', methode: input.methode || '',
        phasen: [], klpInhalt: [], klpProzess: [], material: []
      };
      if (!rei.stunden) rei.stunden = [];
      rei.stunden.push(s);
      scheduleSave(); render();
      return JSON.stringify({ ok: true, id: s.id, titel: s.titel });
    }

    case 'updateStunde': {
      const blk = (fp.blocks || []).find(b => b.id === _pcBlockId);
      const rei = blk && (blk.reihen || []).find(r => r.id === _pcReiheId);
      const stunde = rei && (rei.stunden || []).find(s => s.id === input.stundeId);
      if (!stunde) return JSON.stringify({ error: 'Stunde nicht gefunden: ' + input.stundeId });
      if (input.titel     !== undefined) stunde.titel     = input.titel;
      if (input.lernziel  !== undefined) stunde.lernziel  = input.lernziel;
      if (input.dauer     !== undefined) stunde.dauer     = input.dauer;
      if (input.intention !== undefined) stunde.intention = input.intention;
      if (input.methode   !== undefined) stunde.methode   = input.methode;
      scheduleSave(); render();
      return JSON.stringify({ ok: true, id: stunde.id });
    }

    case 'deleteStunde': {
      const blk = (fp.blocks || []).find(b => b.id === _pcBlockId);
      const rei = blk && (blk.reihen || []).find(r => r.id === _pcReiheId);
      if (!rei) return JSON.stringify({ error: 'Aktuelle Reihe nicht gefunden' });
      const before = (rei.stunden || []).length;
      rei.stunden = (rei.stunden || []).filter(s => s.id !== input.stundeId);
      if (rei.stunden.length === before) return JSON.stringify({ error: 'Stunde nicht gefunden: ' + input.stundeId });
      scheduleSave(); render();
      return JSON.stringify({ ok: true });
    }

    case 'readDatenbank': {
      try {
        var _dbFilters = { fach: fp.fach };
        if (input.inhaltstyp) _dbFilters.inhaltstyp = input.inhaltstyp;
        if (input.jahrgang)   _dbFilters.jahrgang   = input.jahrgang;

        var _rows = await sbSelectAll('inhalte', { filters: _dbFilters, limit: 500 });

        // Thema-Suche client-seitig
        if (input.thema) {
          var _q = input.thema.toLowerCase();
          _rows = _rows.filter(function(r) {
            return (r.thema || '').toLowerCase().includes(_q) ||
                   (r.kapitel || '').toLowerCase().includes(_q) ||
                   (r.uk_titel || '').toLowerCase().includes(_q) ||
                   (r.nr || '').toLowerCase().includes(_q) ||
                   (r.aufgabenstellung || '').toLowerCase().includes(_q) ||
                   (r.inhalt || '').toLowerCase().includes(_q);
          });
        }

        // Nach Quelle gruppieren für kompakte Ausgabe
        var _byQ = {}, _qOrder = [];
        _rows.forEach(function(r) {
          var qn = r.quelle_name || '(ohne Quelle)';
          if (!_byQ[qn]) { _byQ[qn] = { typ: r.quelle_typ, items: [] }; _qOrder.push(qn); }
          _byQ[qn].items.push({
            inhaltstyp: r.inhaltstyp,
            nr: r.nr,
            thema: r.thema,
            kapitel: r.kapitel,
            jahrgang: r.jahrgang,
            schwierigkeit: r.schwierigkeit,
            beschreibung: (r.aufgabenstellung || r.inhalt || '').slice(0, 150)
          });
        });

        return JSON.stringify({
          gesamt: _rows.length,
          quellen: _qOrder.map(function(qn) {
            return { quelle: qn, typ: _byQ[qn].typ, materialien: _byQ[qn].items };
          })
        });
      } catch(e) {
        return JSON.stringify({ error: 'Datenbank nicht verfügbar: ' + e.message });
      }
    }

    default:
      return JSON.stringify({ error: 'Unbekanntes Tool: ' + name });
  }
}

function _pcRender() {
  const el = document.getElementById('pc-messages');
  if (!el) return;
  el.innerHTML = '';
  _pcMsgs.forEach(m => {
    const d = mk('div', 'pc-msg pc-' + m.role);
    if (m.text) {
      const t = mk('div', 'pc-msg-text');
      t.innerHTML = m.text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
      d.appendChild(t);
    }
    if (m.toolCalls && m.toolCalls.length) {
      m.toolCalls.forEach(tc => {
        d.appendChild(tx('div', 'pc-tool-badge', '🔧 ' + tc.name));
      });
    }
    if (m.isThinking) {
      d.appendChild(tx('span', 'pc-thinking', '…'));
    }
    el.appendChild(d);
  });
  el.scrollTop = el.scrollHeight;

  const inp  = document.getElementById('pc-input');
  const sbtn = document.getElementById('pc-send');
  if (inp)  inp.disabled  = _pcRunning;
  if (sbtn) sbtn.disabled = _pcRunning;
}

async function _pcSend(fp, context, text, autoStart) {
  // context = { block } für Block-Chat, { block, reihe } für Reihen-Chat
  if (_pcRunning || !text.trim()) return;
  _pcRunning = true;

  if (!autoStart) {
    _pcMsgs.push({ role: 'user', text: text.trim() });
  }
  _pcApi.push({ role: 'user', content: text.trim() });

  const thinkMsg = { role: 'assistant', text: '', isThinking: true, toolCalls: [] };
  _pcMsgs.push(thinkMsg);
  _pcRender();

  const { block, reihe } = context;
  const fachName = PC_FACH[fp.fach] || fp.fach;

  let tools, system;

  if (reihe) {
    // Reihen-Chat: Stundenthemen und -abfolge planen
    const reiheInfo = `„${reihe.titel}"${reihe.stundenAnzahl ? ' (' + reihe.stundenAnzahl + ' Stunden)' : ''}`;
    const ctx = [
      reihe.schwerpunkt  ? 'Schwerpunkt: '           + reihe.schwerpunkt  : '',
      reihe.beschreibung ? 'Didaktische Begründung: ' + reihe.beschreibung : '',
      reihe.notizen      ? 'Notizen: '                + reihe.notizen      : ''
    ].filter(Boolean).join('\n');
    tools = PC_STUNDEN_TOOLS;
    system = `Du bist Planungsassistentin für ${fachName} Jahrgang ${fp.jahrgang} an einem NRW-Gymnasium.
Dein Auftrag: Plane die Stundenthemen und Abfolge für die Unterrichtsreihe ${reiheInfo}.
${ctx ? ctx + '\n' : ''}
Gehe immer so vor:
1. Rufe readPlan, readKLP und readDatenbank je genau EINMAL auf – zu Beginn. Wiederhole diese Aufrufe nicht.
2. Werte das Materialangebot aus readDatenbank sorgfältig aus: Welche Arbeitsblätter, Materialsets oder Handreichungen gibt es für dieses Thema? Plane die Stundenstruktur so, dass das vorhandene Material optimal eingesetzt wird — z.B. ein AB pro Stunde, mehrere Aspekte in einer Stunde wenn ein Materialset sie abdeckt, Hinführungsstunde wenn Material eine Vorbereitung erfordert. Wenn für einen Schwerpunkt kein Material vorhanden ist, weise darauf hin.
3. Prüfe, welche Stunden bereits vorhanden sind. Erstelle keine Duplikate.
4. Wenn die Reihe bereits vollständig geplant ist, bestätige das kurz – lege nichts Neues an.
5. Plane die Stundenabfolge vollständig durch, dann erstelle alle Stunden mit createStunde. Verwende immer dauer=45 – plane also genau stundenAnzahl Einzelstunden. Ob zwei davon als Doppelstunde zusammengelegt werden, entscheidet die Lehrerin – das ist nicht deine Aufgabe.
Plane nur Stundenthemen und -abfolge – noch keine Phasen oder Materialien.
Arbeite proaktiv und erstelle direkt einen vollständigen Stundenplan für die Reihe.`;
  } else {
    // Block-Chat: Reihen planen
    const blockInfo = `„${block.titel}"${block.stundenGesamt ? ' (' + block.stundenGesamt + ' Stunden)' : ''}`;
    const notizInfo = block.notizen ? `\nNotizen der Lehrerin zu diesem Block:\n${block.notizen}\n` : '';
    tools = PC_TOOLS;
    system = `Du bist Planungsassistentin für ${fachName} Jahrgang ${fp.jahrgang} an einem NRW-Gymnasium.
Dein Auftrag: Plane Unterrichtsreihen für den Block ${blockInfo}.${notizInfo}
Gehe immer so vor:
1. Rufe readPlan, readKLP und readDatenbank je genau EINMAL auf – zu Beginn. Wiederhole diese Aufrufe nicht.
2. Werte das Materialangebot aus readDatenbank aus: Welche Themen sind durch vorhandenes Material gut abgedeckt? Orientiere die Reihenstruktur am tatsächlich vorhandenen Material — gut ausgestattete Themen verdienen eine eigene Reihe, schwach ausgestattete können zusammengefasst oder als Hinweis markiert werden.
3. Prüfe, welche Reihen bereits vorhanden sind. Erstelle KEINE Duplikate bestehender Reihen.
4. Wenn der Block bereits vollständig geplant ist, bestätige das kurz – lege nichts Neues an.
5. Wenn Reihen fehlen: Plane die fehlende Struktur durch, dann erstelle sie mit createReihe (stundenAnzahl immer angeben).
Blöcke legt die Lehrerin manuell an – lege keine neuen Blöcke an.`;
  }

  try {
    while (true) {
      const resp = await callKIAgent({ messages: _pcApi, tools, system, maxTokens: 8192 });

      _pcApi.push({ role: 'assistant', content: resp.content });

      const textBlock = resp.content.find(b => b.type === 'text');
      const toolUses  = resp.content.filter(b => b.type === 'tool_use');

      if (textBlock) { thinkMsg.text = textBlock.text; _pcRender(); }

      if (resp.stop_reason === 'end_turn' || !toolUses.length) {
        thinkMsg.isThinking = false;
        _pcRender();
        break;
      }

      const results = [];
      for (const tu of toolUses) {
        thinkMsg.toolCalls.push({ name: tu.name });
        _pcRender();
        const res = await _pcExecTool(tu.name, tu.input, fp);
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: res });
      }
      _pcApi.push({ role: 'user', content: results });
    }
  } catch (e) {
    thinkMsg.isThinking = false;
    thinkMsg.text = (thinkMsg.text ? thinkMsg.text + '\n\n' : '') + '⚠ Fehler: ' + e.message;
    _pcRender();
  }

  _pcRunning = false;
  _pcRender();
}

function _pcBuildChatUI(wrap, sendFn, placeholder) {
  const body = mk('div', 'card-body pc-body');

  const msgs = mk('div', 'pc-messages');
  msgs.id = 'pc-messages';
  body.appendChild(msgs);

  const inputRow = mk('div', 'pc-input-row');
  const ta = document.createElement('textarea');
  ta.id = 'pc-input'; ta.className = 'finp pc-input';
  ta.placeholder = placeholder; ta.rows = 3;
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFn(); } };

  const sendBtn = btn('Senden ↵', 'btn btn-primary btn-sm');
  sendBtn.id = 'pc-send';
  sendBtn.onclick = sendFn;

  inputRow.appendChild(ta);
  inputRow.appendChild(sendBtn);
  body.appendChild(inputRow);
  wrap.appendChild(body);
}

function buildBlockChat(fp, block) {
  if (_pcFpId !== fp.id || _pcBlockId !== block.id || _pcReiheId !== null) {
    _pcMsgs = []; _pcApi = [];
    _pcFpId = fp.id; _pcBlockId = block.id; _pcReiheId = null;
    _pcRunning = false;
  }

  if (_pcMsgs.length === 0 && !_pcRunning) {
    const capturedBlockId = block.id;
    setTimeout(() => {
      if (_pcBlockId === capturedBlockId && _pcReiheId === null) {
        _pcSend(fp, { block }, 'Analysiere den Block und erstelle einen vollständigen Reihenplan.', true);
      }
    }, 50);
  }

  const wrap = mk('div', 'pc-wrap card');
  const hdr = cardHdr('✨ Reihen planen');
  hdr.appendChild(tx('span', 'pc-hdr-sub', block.titel + (block.stundenGesamt ? ' · ' + block.stundenGesamt + ' Std.' : '')));
  wrap.appendChild(hdr);

  _pcBuildChatUI(wrap, () => {
    const ta = document.getElementById('pc-input');
    const text = ta ? ta.value.trim() : '';
    if (!text || _pcRunning) return;
    ta.value = '';
    _pcSend(fp, { block }, text, false);
  }, 'z.B. "Füge eine weitere Reihe mit Schülerversuch hinzu."');

  _pcRender();
  return wrap;
}

function buildReiheChat(fp, block, reihe) {
  if (_pcFpId !== fp.id || _pcBlockId !== block.id || _pcReiheId !== reihe.id) {
    _pcMsgs = []; _pcApi = [];
    _pcFpId = fp.id; _pcBlockId = block.id; _pcReiheId = reihe.id;
    _pcRunning = false;
  }

  if (_pcMsgs.length === 0 && !_pcRunning) {
    const capturedReiheId = reihe.id;
    setTimeout(() => {
      if (_pcReiheId === capturedReiheId) {
        _pcSend(fp, { block, reihe }, 'Analysiere die Reihe und erstelle einen vollständigen Stundenplan.', true);
      }
    }, 50);
  }

  const wrap = mk('div', 'pc-wrap card');
  const hdr = cardHdr('✨ Stunden planen');
  hdr.appendChild(tx('span', 'pc-hdr-sub', reihe.titel + (reihe.stundenAnzahl ? ' · ' + reihe.stundenAnzahl + ' Std.' : '')));
  wrap.appendChild(hdr);

  _pcBuildChatUI(wrap, () => {
    const ta = document.getElementById('pc-input');
    const text = ta ? ta.value.trim() : '';
    if (!text || _pcRunning) return;
    ta.value = '';
    _pcSend(fp, { block, reihe }, text, false);
  }, 'z.B. "Verschiebe Stunde 3 ans Ende" oder "Füge eine Wiederholungsstunde ein."');

  _pcRender();
  return wrap;
}
