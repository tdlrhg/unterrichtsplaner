// ── Planungs-Chat (Fachplanungs-Ebene) ───────────────────────────
// KI-Agent mit Tool-Use: plant Blöcke → Reihen → Stunden auf Basis
// eines freien Dialogs. Schreibt direkt in die Fachplanung.

const PC_FACH = { M:'Mathematik', Ch:'Chemie', Bio:'Biologie', Ch_GK:'Chemie', Ch_LK:'Chemie', Bio_GK:'Biologie', Bio_LK:'Biologie' };

let _pcMsgs    = [];   // UI: { role, text, toolCalls?, isThinking? }
let _pcApi     = [];   // Anthropic API message history
let _pcFpId    = null;
let _pcRunning = false;

const PC_TOOLS = [
  {
    name: 'readPlan',
    description: 'Liest den aktuellen Planungsstand: alle Blöcke mit ihren Reihen und Stunden.',
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
    name: 'createBlock',
    description: 'Erstellt einen neuen Themenblock in der Fachplanung (oberste Ebene, z.B. "1. Halbjahr: Elektrochemie").',
    input_schema: {
      type: 'object',
      properties: {
        titel:        { type: 'string', description: 'Titel des Blocks' },
        beschreibung: { type: 'string', description: 'Kurzbeschreibung des Themenbereichs (optional)' }
      },
      required: ['titel']
    }
  },
  {
    name: 'createReihe',
    description: 'Erstellt eine Unterrichtsreihe in einem Block (mittlere Ebene, typisch 6–15 Stunden).',
    input_schema: {
      type: 'object',
      properties: {
        blockId:       { type: 'string', description: 'ID des Eltern-Blocks (aus readPlan oder createBlock)' },
        titel:         { type: 'string', description: 'Titel der Reihe' },
        beschreibung:  { type: 'string', description: 'Didaktische Begründung (optional)' },
        schwerpunkt:   { type: 'string', description: 'Pädagogischer Schwerpunkt, z.B. Schülerversuch, Präsentation, eigenverantwortliches Arbeiten (optional)' },
        stundenAnzahl: { type: 'number', description: 'Geplante Unterrichtsstunden' }
      },
      required: ['blockId', 'titel']
    }
  },
  {
    name: 'createStunde',
    description: 'Erstellt eine einzelne Unterrichtsstunde in einer Reihe.',
    input_schema: {
      type: 'object',
      properties: {
        blockId:   { type: 'string', description: 'ID des Blocks' },
        reiheId:   { type: 'string', description: 'ID der Reihe (aus readPlan oder createReihe)' },
        titel:     { type: 'string', description: 'Stundenthema' },
        lernziel:  { type: 'string', description: 'Lernziel (optional)' },
        dauer:     { type: 'number', description: '45 oder 90 Minuten' },
        intention: { type: 'string', description: 'Didaktische Begründung für diese Stunde (optional)' },
        methode:   { type: 'string', description: 'Hauptmethode (optional)' }
      },
      required: ['blockId', 'reiheId', 'titel']
    }
  }
];

function _pcExecTool(name, input, fp) {
  switch (name) {
    case 'readPlan':
      return JSON.stringify((fp.blocks || []).map(b => ({
        id: b.id, titel: b.titel, beschreibung: b.beschreibung,
        reihen: (b.reihen || []).map(r => ({
          id: r.id, titel: r.titel, beschreibung: r.beschreibung,
          schwerpunkt: r.schwerpunkt, stundenAnzahl: r.stundenAnzahl,
          stunden: (r.stunden || []).map(s => ({ id: s.id, titel: s.titel, lernziel: s.lernziel, dauer: s.dauer, methode: s.methode }))
        }))
      })));

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

    case 'createBlock': {
      const b = { id: uid(), titel: input.titel, beschreibung: input.beschreibung || '', reihen: [] };
      if (!fp.blocks) fp.blocks = [];
      fp.blocks.push(b);
      scheduleSave(); render();
      return JSON.stringify({ ok: true, id: b.id, titel: b.titel });
    }

    case 'createReihe': {
      const blk = (fp.blocks || []).find(b => b.id === input.blockId);
      if (!blk) return JSON.stringify({ error: 'Block nicht gefunden: ' + input.blockId });
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

    case 'createStunde': {
      const blk = (fp.blocks || []).find(b => b.id === input.blockId);
      const rei = blk && (blk.reihen || []).find(r => r.id === input.reiheId);
      if (!rei) return JSON.stringify({ error: 'Reihe nicht gefunden: ' + input.reiheId });
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

    default:
      return JSON.stringify({ error: 'Unbekanntes Tool: ' + name });
  }
}

// Aktualisiert die Nachrichtenliste im DOM anhand von _pcMsgs.
// Verwendet eine feste ID, damit Re-Renders durch render() kein Problem sind.
function _pcRender() {
  const el = document.getElementById('pc-messages');
  if (!el) return;
  el.innerHTML = '';
  _pcMsgs.forEach(m => {
    const d = mk('div', 'pc-msg pc-' + m.role);
    if (m.text) {
      const t = mk('div', 'pc-msg-text');
      // Einfaches Markdown: **fett** und Zeilenumbrüche
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

  // Input-Zustand synchronisieren
  const inp = document.getElementById('pc-input');
  const sbtn = document.getElementById('pc-send');
  if (inp)  inp.disabled  = _pcRunning;
  if (sbtn) sbtn.disabled = _pcRunning;
}

async function _pcSend(fp, text) {
  if (_pcRunning || !text.trim()) return;
  _pcRunning = true;

  const fachName = PC_FACH[fp.fach] || fp.fach;

  _pcMsgs.push({ role: 'user', text: text.trim() });
  _pcApi.push({ role: 'user', content: text.trim() });

  const thinkMsg = { role: 'assistant', text: '', isThinking: true, toolCalls: [] };
  _pcMsgs.push(thinkMsg);
  _pcRender();

  const system = `Du bist Planungsassistentin für ${fachName} Jahrgang ${fp.jahrgang} an einem NRW-Gymnasium.
Hilf der Lehrerin, ein Schuljahr strukturiert zu planen: Blöcke (Themenbereiche) → Reihen (Unterrichtssequenzen, 6–15 Stunden) → Stunden.
Gehe immer so vor:
1. Lese zuerst den aktuellen Plan (readPlan) und die KLP-Kompetenzen (readKLP).
2. Setze dann die Vorgaben der Lehrerin um und erstelle die Struktur Schritt für Schritt mit den Tools.
3. Berücksichtige jahresübergreifende Leitlinien (z.B. Methodenvariation, Schülerversuche, Präsentationstechniken) über alle Reihen hinweg.
Arbeite proaktiv: Wenn die Lehrerin grobe Vorgaben macht, erstelle direkt den vollständigen Plan.`;

  try {
    while (true) {
      const resp = await callKIAgent({ messages: _pcApi, tools: PC_TOOLS, system, maxTokens: 8192 });

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
        const res = _pcExecTool(tu.name, tu.input, fp);
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

function buildPlanungsChat(fp) {
  // Historie zurücksetzen wenn Fachplanung wechselt
  if (_pcFpId !== fp.id) {
    _pcMsgs = [];
    _pcApi  = [];
    _pcFpId = fp.id;
  }

  const wrap = mk('div', 'pc-wrap card');

  const hdr = cardHdr('✨ Planungs-Assistent');
  const sub = tx('span', 'pc-hdr-sub', fachLabel(fp.fach) + ' · Jg. ' + fp.jahrgang);
  hdr.appendChild(sub);
  wrap.appendChild(hdr);

  const body = mk('div', 'card-body pc-body');

  const msgs = mk('div', 'pc-messages');
  msgs.id = 'pc-messages';
  body.appendChild(msgs);

  const inputRow = mk('div', 'pc-input-row');

  const ta = document.createElement('textarea');
  ta.id = 'pc-input';
  ta.className = 'finp pc-input';
  ta.placeholder = 'z.B. "Plane das Schuljahr Chemie EF. Pro Reihe ein Schülerversuch. Präsentationstechniken schrittweise aufbauen."';
  ta.rows = 3;
  ta.onkeydown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const sendBtn = btn('Senden ↵', 'btn btn-primary btn-sm');
  sendBtn.id = 'pc-send';
  sendBtn.onclick = send;

  function send() {
    const text = ta.value.trim();
    if (!text || _pcRunning) return;
    ta.value = '';
    _pcSend(fp, text);
  }

  inputRow.appendChild(ta);
  inputRow.appendChild(sendBtn);
  body.appendChild(inputRow);
  wrap.appendChild(body);

  _pcRender();
  return wrap;
}
