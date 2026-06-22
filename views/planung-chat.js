// ── Planungs-Chat (Fachplanungs-Ebene) ───────────────────────────
// KI-Agent mit Tool-Use: plant Blöcke → Reihen → Stunden auf Basis
// eines freien Dialogs. Schreibt direkt in die Fachplanung.

const PC_FACH      = { M:'Mathematik', Ch:'Chemie', Bio:'Biologie', Ch_GK:'Chemie', Ch_LK:'Chemie', Bio_GK:'Biologie', Bio_LK:'Biologie' };
const PC_NATURWISS = new Set(['Ch','Bio','Ch_GK','Ch_LK','Bio_GK','Bio_LK']);

let _pcMsgs      = [];   // UI: { role, text, toolCalls?, isThinking? }
let _pcApi       = [];   // Anthropic API message history
let _pcFpId      = null;
let _pcConfig    = null; // Planungsrahmendaten aus dem Konfigurationsformular
let _pcCollapsed = false;
let _pcRunning   = false;

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
    name: 'readMethoden',
    description: 'Liest die Methodendatenbank. Gibt Methoden mit Name, Beschreibung, Unterrichtsphase und Sozialform zurück.',
    input_schema: {
      type: 'object',
      properties: {
        phase:     { type: 'string', description: 'Filter auf Unterrichtsphase, z.B. einstieg, erarbeitung, sicherung (optional)' },
        sozialform:{ type: 'string', description: 'Filter auf Sozialform, z.B. einzelarbeit, partnerarbeit, gruppenarbeit, plenum (optional)' }
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
        themen: { type: 'string', description: 'Kommagetrennte didaktische Themen, z.B. differenzierung,motivation,problemlösen (optional)' }
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

// Kompakter Steckbrief der Config für die Begrüßungsnachricht
function _pcConfigText(cfg) {
  if (!cfg) return '';
  const parts = [
    cfg.stundenGesamt + ' Stunden gesamt',
    cfg.stundenProWoche + '×/Woche',
    cfg.lernzeitProWoche + ' Min. Lernzeit',
    'Format: ' + (cfg.format === '45' ? '45 Min.' : cfg.format === '90' ? '90 Min.' : 'gemischt'),
    cfg.puffer + ' Pufferstunden',
    'iPad: ' + cfg.ipad + (cfg.ipadWofuer ? ' (' + cfg.ipadWofuer + ')' : ''),
  ];
  if (cfg.versuche) parts.push('Schülerversuche: ' + cfg.versuche);
  parts.push('Gruppenarbeit: ' + cfg.gruppenarbeit);
  return parts.join(' · ');
}

// Abschnitt für den System-Prompt
function _pcConfigToSystem(cfg) {
  if (!cfg) return '';
  return `\nRahmenbedingungen für die Planung:
- Gesamtstunden: ${cfg.stundenGesamt} (davon ${cfg.puffer} Pufferstunden für Klassenarbeiten/Klausuren)
- ${cfg.stundenProWoche} Stunden/Woche, ${cfg.lernzeitProWoche} Min. Nettolernzeit/Woche
- Format: ${cfg.format === '45' ? 'nur 45-Min.-Stunden' : cfg.format === '90' ? 'nur Doppelstunden (90 Min.)' : 'gemischt (45 und 90 Min.)'}
- iPad-Einsatz: ${cfg.ipad}${cfg.ipadWofuer ? ', vor allem für: ' + cfg.ipadWofuer : ''}
${cfg.versuche ? '- Schülerversuche: ' + cfg.versuche + '\n' : ''}- Gruppenarbeit: ${cfg.gruppenarbeit}
Richte alle Reihen- und Stundenplanungen an diesen Rahmenbedingungen aus.`;
}

// Konfigurationsformular vor dem ersten Chat
function _pcBuildConfigForm(fp, onDone) {
  const hatVersuche = PC_NATURWISS.has(fp.fach);
  const form = mk('div', 'pc-config');

  function cfgRow(label, el) {
    const r = mk('div', 'pc-cfg-row');
    r.appendChild(tx('label', 'pc-cfg-label', label));
    r.appendChild(el);
    return r;
  }

  function cfgSel(options, defVal) {
    const s = document.createElement('select');
    s.className = 'finp pc-cfg-sel';
    options.forEach(([v, t]) => {
      const o = document.createElement('option');
      o.value = v; o.textContent = t;
      if (v === defVal) o.selected = true;
      s.appendChild(o);
    });
    return s;
  }

  function cfgNum(def, min) {
    const i = document.createElement('input');
    i.type = 'number'; i.className = 'finp pc-cfg-num';
    i.value = def; i.min = min !== undefined ? min : 0;
    return i;
  }

  function cfgTxt(placeholder) {
    const i = document.createElement('input');
    i.type = 'text'; i.className = 'finp pc-cfg-txt';
    i.placeholder = placeholder;
    return i;
  }

  const stundenGesamt    = cfgNum(60, 1);
  const stundenProWoche  = cfgNum(3, 1);
  const lernzeitProWoche = cfgNum(135, 1);
  const formatSel = cfgSel([
    ['gemischt', 'Gemischt (45 + 90 Min.)'],
    ['45',       'Nur 45 Min.'],
    ['90',       'Nur 90 Min. (Doppelstunden)']
  ], 'gemischt');
  const puffer = cfgNum(4, 0);
  const ipadSel = cfgSel([
    ['gelegentlich', 'gelegentlich'],
    ['häufig',       'häufig'],
    ['immer',        'immer'],
    ['nie',          'nie']
  ], 'gelegentlich');
  const ipadWofuer  = cfgTxt('z.B. Recherche, Präsentation, Übungsapps');
  const versucheSel = hatVersuche ? cfgSel([
    ['gelegentlich', 'gelegentlich'],
    ['häufig',       'häufig'],
    ['immer',        'immer'],
    ['nie',          'nie']
  ], 'gelegentlich') : null;
  const gaSel = cfgSel([
    ['regelmäßig',   'regelmäßig'],
    ['oft',          'oft'],
    ['gelegentlich', 'gelegentlich'],
    ['kaum',         'kaum']
  ], 'regelmäßig');

  const g1 = mk('div', 'pc-cfg-group');
  g1.appendChild(tx('div', 'pc-cfg-ghdr', 'Zeitrahmen'));
  g1.appendChild(cfgRow('Stunden gesamt', stundenGesamt));
  g1.appendChild(cfgRow('Stunden / Woche', stundenProWoche));
  g1.appendChild(cfgRow('Lernzeit / Woche (Min.)', lernzeitProWoche));
  g1.appendChild(cfgRow('Stundenformat', formatSel));
  g1.appendChild(cfgRow('Pufferstunden', puffer));
  form.appendChild(g1);

  const g2 = mk('div', 'pc-cfg-group');
  g2.appendChild(tx('div', 'pc-cfg-ghdr', 'Methodik & Ausstattung'));
  g2.appendChild(cfgRow('iPad-Nutzung', ipadSel));
  g2.appendChild(cfgRow('iPad wofür', ipadWofuer));
  if (versucheSel) g2.appendChild(cfgRow('Schülerversuche', versucheSel));
  g2.appendChild(cfgRow('Gruppenarbeit', gaSel));
  form.appendChild(g2);

  const submitBtn = btn('Planung starten →', 'btn btn-primary pc-cfg-submit');
  submitBtn.onclick = () => {
    _pcConfig = {
      stundenGesamt:    +stundenGesamt.value    || 60,
      stundenProWoche:  +stundenProWoche.value  || 3,
      lernzeitProWoche: +lernzeitProWoche.value || 135,
      format:           formatSel.value,
      puffer:           +puffer.value           || 0,
      ipad:             ipadSel.value,
      ipadWofuer:       ipadWofuer.value.trim(),
      versuche:         versucheSel ? versucheSel.value : null,
      gruppenarbeit:    gaSel.value
    };
    const fachName = PC_FACH[fp.fach] || fp.fach;
    _pcMsgs.push({
      role: 'assistant',
      text: `Wir sind im Jahrgang **${fp.jahrgang}** im Fach **${fachName}**.\n${_pcConfigText(_pcConfig)}\n\nWas soll ich planen?`
    });
    onDone();
    setTimeout(_pcRender, 0);
  };
  form.appendChild(submitBtn);
  return form;
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

async function _pcSend(fp, text) {
  if (_pcRunning || !text.trim()) return;
  _pcRunning = true;

  const fachName = PC_FACH[fp.fach] || fp.fach;

  _pcMsgs.push({ role: 'user', text: text.trim() });
  _pcApi.push({ role: 'user', content: text.trim() });

  const thinkMsg = { role: 'assistant', text: '', isThinking: true, toolCalls: [] };
  _pcMsgs.push(thinkMsg);
  _pcRender();

  const system = `Du bist Planungsassistentin für ${fachName} Jahrgang ${fp.jahrgang} an einem NRW-Gymnasium.${_pcConfigToSystem(_pcConfig)}
Hilf der Lehrerin, ein Schuljahr strukturiert zu planen: Blöcke (Themenbereiche) → Reihen (Unterrichtssequenzen, 6–15 Stunden) → Stunden.
Gehe immer so vor:
1. Rufe readPlan und readKLP je genau EINMAL auf – zu Beginn, ohne Filter. Wiederhole diese Aufrufe nicht für einzelne Blöcke oder Reihen.
2. Plane danach die gesamte Struktur im Kopf durch, bevor du mit createBlock/createReihe/createStunde anfängst.
3. Erstelle dann alle Blöcke und Reihen in einem Durchgang mit den Tools.
4. Berücksichtige jahresübergreifende Leitlinien (Methodenvariation, Schülerversuche, Präsentationstechniken) über alle Reihen hinweg.
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
  if (_pcFpId !== fp.id) {
    _pcMsgs = []; _pcApi = []; _pcFpId = fp.id; _pcConfig = null; _pcCollapsed = false;
  }

  const wrap = mk('div', 'pc-wrap card');

  const hdr = cardHdr('✨ Planungs-Assistent');
  const sub = tx('span', 'pc-hdr-sub', fachLabel(fp.fach) + ' · Jg. ' + fp.jahrgang);
  hdr.appendChild(sub);
  const toggleBtn = tx('button', 'btn btn-ghost btn-xs pc-toggle', _pcCollapsed ? '▶' : '▼');
  toggleBtn.title = _pcCollapsed ? 'Aufklappen' : 'Einklappen';
  toggleBtn.onclick = () => { _pcCollapsed = !_pcCollapsed; render(); };
  hdr.appendChild(toggleBtn);
  wrap.appendChild(hdr);

  if (_pcCollapsed) { wrap.appendChild(mk('div', 'card-body pc-body-collapsed')); return wrap; }

  const body = mk('div', 'card-body pc-body');

  if (!_pcConfig) {
    body.appendChild(_pcBuildConfigForm(fp, () => render()));
  } else {
    const msgs = mk('div', 'pc-messages');
    msgs.id = 'pc-messages';
    body.appendChild(msgs);

    const inputRow = mk('div', 'pc-input-row');

    const ta = document.createElement('textarea');
    ta.id = 'pc-input';
    ta.className = 'finp pc-input';
    ta.placeholder = 'z.B. "Plane das 1. Halbjahr: Elektrochemie. Pro Reihe ein Schülerversuch."';
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
  }

  wrap.appendChild(body);
  _pcRender();
  return wrap;
}
