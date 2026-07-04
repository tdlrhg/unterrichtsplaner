// ── Planungs-Chat (Block-Ebene) ───────────────────────────────────────
// KI-Agent mit Tool-Use: plant Reihen für einen Block.
// Startet automatisch beim Öffnen; kein Konfigformular.

const PC_FACH = { M:'Mathematik', Ch:'Chemie', Bio:'Biologie', Ch_GK:'Chemie', Ch_LK:'Chemie', Bio_GK:'Biologie', Bio_LK:'Biologie' };

let _pcMsgs    = [];
let _pcApi     = [];
let _pcFpId    = null;
let _pcBlockId = null;
let _pcRunning = false;

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
    description: 'Liest die Methodendatenbank. Gibt Methoden mit Name, Beschreibung, Unterrichtsphase und Sozialform zurück.',
    input_schema: {
      type: 'object',
      properties: {
        phase:      { type: 'string', description: 'Filter auf Unterrichtsphase, z.B. einstieg, erarbeitung, sicherung (optional)' },
        sozialform: { type: 'string', description: 'Filter auf Sozialform, z.B. einzelarbeit, partnerarbeit, gruppenarbeit, plenum (optional)' }
      }
    }
  },
  {
    name: 'readDidaktik',
    description: 'Liest didaktische Leitlinien, Kernaussagen und Unterrichtsmuster aus der Didaktik-Wissensbasis.',
    input_schema: {
      type: 'object',
      properties: {
        ebenen: { type: 'string', description: 'Kommagetrennte Planungsebenen: reihe, stunde, material, situation (optional)' },
        themen:  { type: 'string', description: 'Kommagetrennte didaktische Themen, z.B. differenzierung,motivation,problemlösen (optional)' }
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
        schwerpunkt:  { type: 'string', description: 'Pädagogischer Schwerpunkt, z.B. Schülerversuch, Präsentation (optional)' },
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
        titel:        { type: 'string', description: 'Neuer Titel (optional)' },
        beschreibung: { type: 'string', description: 'Didaktische Begründung (optional)' },
        schwerpunkt:  { type: 'string', description: 'Methodischer Schwerpunkt (optional)' },
        stundenAnzahl:{ type: 'number', description: 'Geplante Stunden (optional)' }
      },
      required: ['reiheId']
    }
  },
  {
    name: 'createStunde',
    description: 'Erstellt eine einzelne Unterrichtsstunde in einer Reihe.',
    input_schema: {
      type: 'object',
      properties: {
        reiheId:  { type: 'string', description: 'ID der Reihe (aus readPlan oder createReihe)' },
        titel:    { type: 'string', description: 'Stundenthema' },
        lernziel: { type: 'string', description: 'Lernziel (optional)' },
        dauer:    { type: 'number', description: '45 oder 90 Minuten' },
        intention:{ type: 'string', description: 'Didaktische Begründung (optional)' },
        methode:  { type: 'string', description: 'Hauptmethode (optional)' }
      },
      required: ['reiheId', 'titel']
    }
  }
];

function _pcExecTool(name, input, fp) {
  switch (name) {
    case 'readPlan': {
      const blk = (fp.blocks || []).find(b => b.id === _pcBlockId);
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

    case 'createStunde': {
      const blk = (fp.blocks || []).find(b => b.id === _pcBlockId);
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

async function _pcSend(fp, block, text, autoStart) {
  if (_pcRunning || !text.trim()) return;
  _pcRunning = true;

  if (!autoStart) {
    _pcMsgs.push({ role: 'user', text: text.trim() });
  }
  _pcApi.push({ role: 'user', content: text.trim() });

  const thinkMsg = { role: 'assistant', text: '', isThinking: true, toolCalls: [] };
  _pcMsgs.push(thinkMsg);
  _pcRender();

  const fachName  = PC_FACH[fp.fach] || fp.fach;
  const blockInfo = `„${block.titel}"${block.stundenGesamt ? ' (' + block.stundenGesamt + ' Stunden)' : ''}`;
  const notizInfo = block.notizen ? `\nNotizen der Lehrerin zu diesem Block:\n${block.notizen}\n` : '';

  const system = `Du bist Planungsassistentin für ${fachName} Jahrgang ${fp.jahrgang} an einem NRW-Gymnasium.
Dein Auftrag: Plane Unterrichtsreihen für den Block ${blockInfo}.${notizInfo}
Gehe immer so vor:
1. Rufe readPlan und readKLP je genau EINMAL auf – zu Beginn, ohne Filter. Wiederhole diese Aufrufe nicht.
2. Prüfe, welche Reihen bereits vorhanden sind. Erstelle KEINE Duplikate bestehender Reihen.
3. Wenn der Block bereits vollständig geplant ist, bestätige das kurz – lege nichts Neues an.
4. Wenn Reihen fehlen: Plane die fehlende Struktur durch, dann erstelle sie in einem Durchgang mit createReihe (stundenAnzahl immer angeben).
Blöcke legt die Lehrerin manuell an – lege keine neuen Blöcke an.`;

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

function buildBlockChat(fp, block) {
  if (_pcFpId !== fp.id || _pcBlockId !== block.id) {
    _pcMsgs = []; _pcApi = [];
    _pcFpId = fp.id; _pcBlockId = block.id;
    _pcRunning = false;
  }

  // Beim ersten Öffnen sofort loslegen
  if (_pcMsgs.length === 0 && !_pcRunning) {
    const capturedBlockId = block.id;
    setTimeout(() => {
      if (_pcBlockId === capturedBlockId) {
        _pcSend(fp, block, 'Analysiere den Block und erstelle einen vollständigen Reihenplan.', true);
      }
    }, 50);
  }

  const wrap = mk('div', 'pc-wrap card');

  const hdr = cardHdr('✨ Reihen planen');
  hdr.appendChild(tx('span', 'pc-hdr-sub', block.titel + (block.stundenGesamt ? ' · ' + block.stundenGesamt + ' Std.' : '')));
  wrap.appendChild(hdr);

  const body = mk('div', 'card-body pc-body');

  const msgs = mk('div', 'pc-messages');
  msgs.id = 'pc-messages';
  body.appendChild(msgs);

  const inputRow = mk('div', 'pc-input-row');

  const ta = document.createElement('textarea');
  ta.id = 'pc-input';
  ta.className = 'finp pc-input';
  ta.placeholder = 'z.B. "Füge eine weitere Reihe mit Schülerversuch hinzu."';
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
    _pcSend(fp, block, text, false);
  }

  inputRow.appendChild(ta);
  inputRow.appendChild(sendBtn);
  body.appendChild(inputRow);

  wrap.appendChild(body);
  _pcRender();
  return wrap;
}
