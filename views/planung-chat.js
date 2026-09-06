// ── Planungs-Chat (Block-, Reihen- und Einheiten-Ebene) ─────────────
// Block-Chat: plant Reihen für einen Block (Themensequenzen)
// Reihen-Chat: plant Stundenthemen, -abfolge und Materialzuordnung
// Einheiten-Chat: Feinplanung einzelner Stunden — Didaktik statt Fachlichkeit

const PC_FACH = { M:'Mathematik', Ch:'Chemie', Bio:'Biologie', Ch_GK:'Chemie', Ch_LK:'Chemie', Bio_GK:'Biologie', Bio_LK:'Biologie' };

let _pcMsgs    = [];
let _pcApi     = [];
let _pcFpId      = null;
let _pcBlockId   = null;
let _pcReiheId   = null;  // null = Block-Chat, reihe.id = Reihen- oder Einheiten-Chat
let _pcEinheitId = null;  // Gruppen-ID, oder null = Feinplanung über die ganze Reihe
let _pcFeinModus = false; // true = Einheiten-Chat (Feinplanung), unabhängig von Gruppen
let _pcRunning   = false;
let _pcMaterialCache = { key: null, roh: '' };  // Materialabfrage je Gespräch
let _pcAbort     = null;   // AbortController des laufenden KI-Aufrufs
let _pcStop      = false;  // Stopp gedrückt: Schleife nach dem aktuellen Schritt beenden

// Bricht den laufenden Agenten ab. Der aktuelle KI-Aufruf wird sofort beendet,
// ein gerade laufendes Tool läuft noch zu Ende — abgebrochen wird davor und
// danach, nie mittendrin. Bereits Angelegtes bleibt bestehen.
function _pcStoppen() {
  if (!_pcRunning) return;
  _pcStop = true;
  if (_pcAbort) { try { _pcAbort.abort(); } catch (e) {} }
  _pcRender();
}

// ── Persistenz ───────────────────────────────────────────────────────
// Verläufe liegen in der Supabase-Tabelle „chats", adressiert über
// "<ebene>_<objektId>". Dadurch bestehen Block-, Reihen- und später
// Einheiten-Gespräche unabhängig nebeneinander und überleben einen Reload.
let _pcChatKey   = null;   // Verlauf, der gerade angezeigt wird
let _pcLoadedKey = null;   // Verlauf, der bereits geladen ist
let _pcLoading   = false;

const PC_SAVE_MAX_MSGS = 60;    // ältere Züge werden beim Speichern verworfen
const PC_SAVE_MAX_TOOL = 4000;  // lange Tool-Ergebnisse werden gekürzt

function _pcKey(ebene, objektId) { return ebene + '_' + objektId; }

// Lädt den Verlauf, sobald ein anderer angezeigt werden soll als geladen ist.
function _pcEnsureLoaded(key) {
  if (_pcLoadedKey === key || _pcLoading) return;
  _pcLoading = true;
  _pcMsgs = []; _pcApi = [];
  sbSelect('chats', { filters: { id: key }, limit: 1 })
    .then(function(rows) {
      if (_pcChatKey !== key) return;   // inzwischen woanders hingeklickt
      const row = rows && rows[0];
      _pcMsgs = row && Array.isArray(row.msgs) ? row.msgs : [];
      _pcApi  = row && Array.isArray(row.api)  ? row.api  : [];
      _pcLoadedKey = key;
    })
    .catch(function() { _pcLoadedKey = key; })  // ohne Verlauf weiterarbeiten
    .then(function() { _pcLoading = false; _pcRender(); });
}

// Verlauf verwerfen — für den Neuanlauf: Voraussetzungen ändern, dann noch
// einmal von vorn, damit ein Vorschlag wirklich von der KI kommt und nicht
// aus dem, was im selben Gespräch schon vorgesagt wurde.
// Löscht nur das Gespräch, nichts an der Planung.
async function _pcVerlaufVerwerfen() {
  if (!_pcChatKey || _pcRunning) return;
  const key = _pcChatKey;
  _pcMsgs = []; _pcApi = [];
  _pcLoadedKey = key;          // nicht erneut aus der Tabelle nachladen
  // Auch das gemerkte Material vergessen: Wer neu ansetzt, hat oft gerade
  // etwas am Material geändert und bekäme sonst den alten Stand.
  _pcMaterialCache = { key: null, roh: '' };
  _pcRender();
  try {
    await sbDelete('chats', key);
  } catch (e) {
    console.warn('[Chat] Verlauf konnte nicht gelöscht werden:', e.message);
  }
}

// Kürzt sehr lange Tool-Ergebnisse (readDatenbank liefert schnell 100 kB),
// damit ein Verlauf nicht unbegrenzt wächst. Die KI kann das Tool bei Bedarf
// erneut aufrufen.
function _pcTrimApi(api) {
  return api.slice(-PC_SAVE_MAX_MSGS).map(function(m) {
    if (!Array.isArray(m.content)) return m;
    return {
      role: m.role,
      content: m.content.map(function(b) {
        if (b.type === 'tool_result' && typeof b.content === 'string' && b.content.length > PC_SAVE_MAX_TOOL) {
          return Object.assign({}, b, {
            content: b.content.slice(0, PC_SAVE_MAX_TOOL) + '\n… (gekürzt — bei Bedarf Tool erneut aufrufen)'
          });
        }
        return b;
      })
    };
  });
}

async function _pcPersist(titel) {
  if (!_pcChatKey) return;
  const msgs = _pcMsgs.slice(-PC_SAVE_MAX_MSGS).map(function(m) {
    return { role: m.role, text: m.text || '', toolCalls: m.toolCalls || [] };
  });
  try {
    await sbInsert('chats', [{
      id: _pcChatKey,
      ebene: _pcFeinModus ? 'einheit' : (_pcReiheId ? 'reihe' : 'block'),
      objekt_id: _pcEinheitId || _pcReiheId || _pcBlockId,
      fp_id: _pcFpId,
      titel: titel || '',
      msgs: msgs,
      api: _pcTrimApi(_pcApi),
      aktualisiert: new Date().toISOString()
    }]);
  } catch(e) {
    console.warn('[Chat] Verlauf konnte nicht gespeichert werden:', e.message);
  }
}

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
    description: 'Liest die Methodendatenbank. Ohne Filter kommen nur die ersten 60 von über hundert Methoden — suche gezielt, wenn du eine bestimmte meinst. Steht bei einer Methode das Feld „einfuehrung", muss sie der Lerngruppe erst beigebracht werden.',
    input_schema: {
      type: 'object',
      properties: {
        name:       { type: 'string', description: 'Sucht im Namen und in der Beschreibung, z.B. „Tabu" oder „Placemat" (optional)' },
        phase:      { type: 'string', description: 'Filter auf Unterrichtsphase (optional)' },
        sozialform: { type: 'string', description: 'Filter auf Sozialform (optional)' },
        format:     { type: 'string', description: 'Nach Form filtern: Spiel | Rätsel | Experiment | Wettbewerb (optional)' }
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
        thema: { type: 'string', description: 'Suchbegriff für Thema, Kapitel oder Stichwort. OHNE thema bekommst du eine Übersicht: welche Quelle deckt welche Themen wie stark ab — gut, um sich einen Überblick zu verschaffen. MIT thema bekommst du die einzelnen Materialien dazu. Zweischrittig vorgehen: erst Übersicht, dann gezielt nachfragen.' },
        jahrgang: { type: 'string', description: 'Nach Jahrgang filtern, z.B. "9" (optional)' },
        inhaltstyp: { type: 'string', description: 'Nach Typ filtern: arbeitsblatt|loesung|lehrerkommentar|lzk|lehrtext (optional)' },
        format:     { type: 'string', description: 'Nach Form filtern: Spiel | Rätsel | Experiment | Wettbewerb (optional)' }
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
    description: 'Liest die Methodendatenbank. Ohne Filter kommen nur die ersten 60 von über hundert Methoden — suche gezielt, wenn du eine bestimmte meinst. Steht bei einer Methode das Feld „einfuehrung", muss sie der Lerngruppe erst beigebracht werden.',
    input_schema: {
      type: 'object',
      properties: {
        name:       { type: 'string', description: 'Sucht im Namen und in der Beschreibung, z.B. „Tabu" oder „Placemat" (optional)' },
        phase:      { type: 'string', description: 'Filter auf Unterrichtsphase (optional)' },
        sozialform: { type: 'string', description: 'Filter auf Sozialform (optional)' },
        format:     { type: 'string', description: 'Nach Form filtern: Spiel | Rätsel | Experiment | Wettbewerb (optional)' }
      }
    }
  },
  {
    name: 'createStunde',
    description: 'Erstellt eine Unterrichtsstunde in dieser Reihe (Thema, Lernziel, Methode – noch keine Phasen). Eine Doppelstunde ist EIN Eintrag mit dauer=90, nicht zwei Einträge mit „[1/2]" und „[2/2]" im Titel — das Werkzeug rechnet sie selbst als zwei Unterrichtsstunden.',
    input_schema: {
      type: 'object',
      properties: {
        titel:    { type: 'string', description: 'Stundenthema' },
        lernziel: { type: 'string', description: 'Lernziel der Stunde (optional)' },
        dauer:    { type: 'number', description: '45 für eine Einzelstunde, 90 für eine Doppelstunde. Nichts anderes.' },
        intention:{ type: 'string', description: 'Didaktische Begründung (optional)' },
        methode:  { type: 'string', description: 'Hauptmethode (optional)' },
        prioritaet: { type: 'string', description: 'pflicht | optional | puffer — „optional" markiert eine Stunde, die entfallen könnte. Nutze es, wenn ihr euch noch nicht sicher seid, und begründe es in notizen.' },
        notizen:  { type: 'string', description: 'Materialhinweise, offene Fragen — sichtbar im Stunden-Editor unter „Material & Notizen"' }
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
        methode:  { type: 'string' },
        prioritaet: { type: 'string', description: 'pflicht | optional | puffer — „optional" markiert eine Stunde, die entfallen könnte. Nutze es, wenn ihr euch noch nicht sicher seid, und begründe es in notizen.' },
        notizen:  { type: 'string' }
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
    description: 'Durchsucht die Materialdatenbank nach verfügbarem Unterrichtsmaterial für dieses Fach (Arbeitsblätter, Materialsets, Handreichungen, Schulbuch-Aufgaben). Bei Bildmaterial steht unter abbildung, was darauf zu sehen ist — verlasse dich darauf und erfinde keine Bildinhalte; das Bild selbst siehst du nicht. Ein Teil des Materials ist zusaetzlich didaktisch erschlossen — dann stehen bei einem Eintrag Felder wie rolleInReihe (einstieg/aufbauend/abschliessend), didaktischeFunktion (motivation, vorwissen, begriffsbildung, sichern …), offenheit, sozialform, niveau und differenzierung. Nutze sie bei der Auswahl. Hier steht ALLES, was erfasst wurde — Schulbücher ebenso wie eigenes Material der Lehrerin (quelle_typ eigenmaterial). Behaupte nie, eigenes Material sei hier grundsätzlich nicht zu finden. Findest du nichts, lag es am Suchbegriff.',
    input_schema: {
      type: 'object',
      properties: {
        thema: { type: 'string', description: 'Suchbegriff für Thema, Kapitel oder Stichwort. OHNE thema bekommst du eine Übersicht: welche Quelle deckt welche Themen wie stark ab — gut, um sich einen Überblick zu verschaffen. MIT thema bekommst du die einzelnen Materialien dazu. Zweischrittig vorgehen: erst Übersicht, dann gezielt nachfragen.' },
        jahrgang: { type: 'string', description: 'Nach Jahrgang filtern, z.B. "9" (optional)' },
        inhaltstyp: { type: 'string', description: 'Nach Typ filtern: arbeitsblatt|loesung|lehrerkommentar|lzk|lehrtext (optional)' },
        format:     { type: 'string', description: 'Nach Form filtern: Spiel | Rätsel | Experiment | Wettbewerb (optional)' }
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
        themen: { type: 'string', description: 'Kommagetrennte Themen, z.B. differenzierung,motivation (optional)' }
      }
    }
  },
  {
    name: 'materialZuordnen',
    description: 'Hält fest, welches Material zu einer Stunde gehört und wie es eingesetzt wird. Bewusst freitextlich: Das Material muss NICHT in der Materialdatenbank stehen. Nutze das, sobald ihr euch über eine Zuordnung einig seid — auch für Teilverwendung („nur Aufgabe 2–4") und nötige Anpassungen.',
    input_schema: {
      type: 'object',
      properties: {
        stundeId:  { type: 'string', description: 'ID der Stunde (aus readPlan)' },
        quelle:    { type: 'string', description: 'Um welches Material es geht, so wie die Lehrerin es nennt, z.B. „RAAbits Chemie M4" oder „eigenes Kopfrechenblatt"' },
        teile:     { type: 'string', description: 'Welcher Teil verwendet wird, falls nicht alles — z.B. „nur Aufgabe 2–4" (optional)' },
        anpassung: { type: 'string', description: 'Was vorher angepasst werden muss — kürzen, umformulieren, ergänzen (optional)' }
      },
      required: ['stundeId', 'quelle']
    }
  },
  {
    name: 'materialEntfernen',
    description: 'Entfernt eine Materialzuordnung von einer Stunde.',
    input_schema: {
      type: 'object',
      properties: {
        stundeId:   { type: 'string', description: 'ID der Stunde' },
        materialId: { type: 'string', description: 'ID der Zuordnung (aus readPlan)' }
      },
      required: ['stundeId', 'materialId']
    }
  }
];

// ── Tools für den Einheiten-Chat (Feinplanung einzelner Stunden) ─────
// Bewusst ohne readKLP: Auf dieser Ebene tritt die Fachlichkeit zurück.
const PC_EINHEIT_TOOLS = [
  {
    name: 'readPlan',
    description: 'Liest die Stunden dieser Einheit samt Phasen und zugeordnetem Material, dazu die Nachbarstunden der Reihe.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'readMethoden',
    description: 'Liest die Methodendatenbank. Nutze sie, wenn eine konkrete Form gesucht ist — etwa eine kurze Wiederholung ohne Vorbereitungsaufwand. Ohne Filter kommen nur die ersten 60 von über hundert Methoden — suche gezielt, wenn du eine bestimmte meinst. Steht bei einer Methode das Feld „einfuehrung", muss sie der Lerngruppe erst beigebracht werden.',
    input_schema: {
      type: 'object',
      properties: {
        name:       { type: 'string', description: 'Sucht im Namen und in der Beschreibung, z.B. „Tabu" oder „Placemat" (optional)' },
        phase:      { type: 'string', description: 'Filter auf Unterrichtsphase (optional)' },
        sozialform: { type: 'string', description: 'Filter auf Sozialform (optional)' },
        format:     { type: 'string', description: 'Nach Form filtern: Spiel | Rätsel | Experiment | Wettbewerb (optional)' }
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
        themen: { type: 'string', description: 'Kommagetrennte Themen, z.B. differenzierung,motivation (optional)' }
      }
    }
  },
  {
    name: 'readDatenbank',
    description: 'Durchsucht die Materialdatenbank. Bei Bildmaterial steht unter abbildung, was darauf zu sehen ist — verlasse dich darauf und erfinde keine Bildinhalte; das Bild selbst siehst du nicht. Ein Teil des Materials ist zusaetzlich didaktisch erschlossen — dann stehen bei einem Eintrag Felder wie rolleInReihe (einstieg/aufbauend/abschliessend), didaktischeFunktion (motivation, vorwissen, begriffsbildung, sichern …), offenheit, sozialform, niveau und differenzierung. Nutze sie bei der Auswahl. Hier steht ALLES, was erfasst wurde — Schulbücher ebenso wie eigenes Material der Lehrerin (quelle_typ eigenmaterial). Behaupte nie, eigenes Material sei hier grundsätzlich nicht zu finden. Findest du nichts, lag es am Suchbegriff.',
    input_schema: {
      type: 'object',
      properties: {
        thema:      { type: 'string', description: 'Suchbegriff für Thema, Kapitel oder Stichwort. Ohne thema kommt nur eine Übersicht der Quellen — auf dieser Ebene brauchst du fast immer einen Suchbegriff.' },
        jahrgang:   { type: 'string', description: 'Nach Jahrgang filtern (optional)' },
        inhaltstyp: { type: 'string', description: 'Nach Typ filtern (optional)' },
        format:     { type: 'string', description: 'Nach Form filtern: Spiel | Rätsel | Experiment | Wettbewerb (optional)' }
      }
    }
  },
  {
    name: 'updateStunde',
    description: 'Aktualisiert eine Stunde dieser Einheit. Erst schreiben, wenn ihr euch einig seid.',
    input_schema: {
      type: 'object',
      properties: {
        stundeId: { type: 'string', description: 'ID der Stunde (aus readPlan)' },
        titel:    { type: 'string' },
        lernziel: { type: 'string' },
        dauer:    { type: 'number', description: '45 oder 90' },
        intention:{ type: 'string' },
        methode:  { type: 'string' },
        prioritaet: { type: 'string', description: 'pflicht | optional | puffer — „optional" markiert eine Stunde, die entfallen könnte. Nutze es, wenn ihr euch noch nicht sicher seid, und begründe es in notizen.' },
        notizen:  { type: 'string', description: 'Offene Punkte und Hinweise — sichtbar im Stunden-Editor' }
      },
      required: ['stundeId']
    }
  },
  {
    name: 'setPhasen',
    description: 'Schreibt den Phasenverlauf einer Stunde. Ersetzt vorhandene Phasen vollständig — lies vorher mit readPlan, was schon da ist.',
    input_schema: {
      type: 'object',
      properties: {
        stundeId: { type: 'string', description: 'ID der Stunde' },
        phasen: {
          type: 'array',
          description: 'Die Phasen in Reihenfolge',
          items: {
            type: 'object',
            properties: {
              titel:      { type: 'string', description: 'z.B. Einstieg, Erarbeitung, Sicherung' },
              inhalt:     { type: 'string', description: 'Was in dieser Phase passiert — und was die Lernenden dabei tun' },
              methode:    { type: 'string', description: 'Methode oder Form (optional)' },
              sozialform: { type: 'string', description: 'Plenum, Einzelarbeit, Partnerarbeit, Gruppenarbeit (optional)' },
              minuten:    { type: 'number', description: 'Dauer in Minuten' }
            },
            required: ['titel']
          }
        }
      },
      required: ['stundeId', 'phasen']
    }
  },
  {
    name: 'materialZuordnen',
    description: 'Hält fest, welches Material zu einer Stunde gehört und wie es eingesetzt wird — auch Teilverwendung und nötige Anpassungen. Das Material muss NICHT in der Datenbank stehen.',
    input_schema: {
      type: 'object',
      properties: {
        stundeId:  { type: 'string', description: 'ID der Stunde' },
        quelle:    { type: 'string', description: 'Um welches Material es geht, so wie die Lehrerin es nennt' },
        teile:     { type: 'string', description: 'Welcher Teil verwendet wird, falls nicht alles (optional)' },
        anpassung: { type: 'string', description: 'Was vorher angepasst werden muss (optional)' }
      },
      required: ['stundeId', 'quelle']
    }
  },
  {
    name: 'materialEntfernen',
    description: 'Entfernt eine Materialzuordnung von einer Stunde.',
    input_schema: {
      type: 'object',
      properties: {
        stundeId:   { type: 'string', description: 'ID der Stunde' },
        materialId: { type: 'string', description: 'ID der Zuordnung (aus readPlan)' }
      },
      required: ['stundeId', 'materialId']
    }
  },
  {
    name: 'createStunde',
    description: 'Legt eine zusätzliche Stunde in dieser Einheit an. Nur wenn sich in der Feinplanung zeigt, dass eine fehlt — und nur nach Absprache.',
    input_schema: {
      type: 'object',
      properties: {
        titel:    { type: 'string', description: 'Stundenthema' },
        lernziel: { type: 'string' },
        dauer:    { type: 'number', description: '45 oder 90' },
        prioritaet: { type: 'string', description: 'pflicht | optional | puffer — „optional" markiert eine Stunde, die entfallen könnte. Nutze es, wenn ihr euch noch nicht sicher seid, und begründe es in notizen.' },
        notizen:  { type: 'string' }
      },
      required: ['titel']
    }
  }
];

async function _pcExecTool(name, input, fp) {
  switch (name) {

    case 'readPlan': {
      const blk = (fp.blocks || []).find(b => b.id === _pcBlockId);
      if (_pcFeinModus) {
        // Feinplanung: Stunden im Detail, übrige Stunden der Reihe nur als Titel.
        // Ohne Gruppe umfasst die Feinplanung die ganze Reihe.
        const rei = blk && (blk.reihen || []).find(r => r.id === _pcReiheId);
        if (!rei) return JSON.stringify({});
        const einh = _pcEinheitId && (rei.einheiten || []).find(e => e.id === _pcEinheitId);
        const alleStunden = rei.stunden || [];
        const eigene = _pcEinheitId
          ? alleStunden.filter(s => s.einheitId === _pcEinheitId)
          : alleStunden;
        const eigeneIds = new Set(eigene.map(s => s.id));
        return JSON.stringify({
          reihe: { titel: rei.titel, stundenAnzahl: rei.stundenAnzahl, notizen: rei.notizen || '' },
          einheit: _pcEinheitId
            ? { id: _pcEinheitId, titel: einh ? einh.titel : '' }
            : { id: null, titel: 'ganze Reihe (keine Gruppen angelegt)' },
          stunden: eigene.map(s => ({
            id: s.id, titel: s.titel, lernziel: s.lernziel || '',
            dauer: s.dauer, einheiten: stundeEinheiten(s),
            intention: s.intention || '', methoden: stundeMethodenText(s),
            prioritaet: s.prioritaet || 'pflicht',
            notizen: s.notizen || '',
            material: (s.material || []).map(m => ({
              id: m.id, quelle: m.quelle, teile: m.teile || '', anpassung: m.anpassung || ''
            })),
            phasen: (s.phasen || []).map(p => ({
              titel: p.titel || '', inhalt: p.inhalt || '', methode: p.methode || '',
              sozialform: p.sozialform || '', minuten: p.minuten || 0
            }))
          })),
          nachbarstunden: alleStunden
            .filter(s => !eigeneIds.has(s.id))
            .map(s => ({ titel: s.titel, dauer: s.dauer }))
        });
      }

      if (_pcReiheId) {
        // Reihen-Kontext: diese Reihe samt Nachbarn im Block
        const rei = blk && (blk.reihen || []).find(r => r.id === _pcReiheId);
        if (!rei) return JSON.stringify({});
        const alle = (blk.reihen || []);
        const pos = alle.findIndex(r => r.id === _pcReiheId);
        return JSON.stringify({
          block: {
            titel: blk.titel,
            reihenfolge: alle.map((r, i) => ({
              position: i + 1,
              titel: r.titel,
              stundenAnzahl: r.stundenAnzahl,
              aktuell: r.id === _pcReiheId
            }))
          },
          davor:  pos > 0 ? alle[pos - 1].titel : null,
          danach: pos >= 0 && pos < alle.length - 1 ? alle[pos + 1].titel : null,
          id: rei.id, titel: rei.titel, beschreibung: rei.beschreibung || '',
          schwerpunkt: rei.schwerpunkt || '', stundenAnzahl: rei.stundenAnzahl,
          notizen: rei.notizen || '',
          // Fertig gerechnet, damit die KI nicht selbst zählen muss: Eine
          // Doppelstunde ist ein Eintrag, zählt aber zwei Unterrichtsstunden.
          budget: {
            soll: rei.stundenAnzahl || null,
            belegt: summeStundenEinheiten(rei.stunden),
            offen: (rei.stundenAnzahl || 0) - summeStundenEinheiten(rei.stunden)
          },
          stunden: (rei.stunden || []).map(s => ({
            id: s.id, titel: s.titel, lernziel: s.lernziel || '',
            dauer: s.dauer, einheiten: stundeEinheiten(s),
            intention: s.intention || '', methoden: stundeMethodenText(s),
            prioritaet: s.prioritaet || 'pflicht',
            notizen: s.notizen || '',
            material: (s.material || []).map(m => ({
              id: m.id, quelle: m.quelle, teile: m.teile || '', anpassung: m.anpassung || ''
            }))
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
          stunden: (r.stunden || []).map(s => ({ id: s.id, titel: s.titel, lernziel: s.lernziel, dauer: s.dauer, methoden: stundeMethodenText(s), notizen: s.notizen || '' }))
        }))
      }]);
    }

    case 'readKLP': {
      let hits = KLPDB.filter(e => e.fach === fp.fach);
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
      // Frisch laden statt aus dem Speicher: METHDB wird einmal beim Seitenstart
      // gefüllt. Eine Methode, die die Lehrerin danach in der Datenbank anlegt,
      // wäre sonst bis zum nächsten Neuladen unsichtbar.
      try {
        const _frisch = await sbSelectAll('methoden');
        if (Array.isArray(_frisch) && _frisch.length) METHDB = _frisch;
      } catch (e) {
        console.warn('[Chat] Methoden nicht aktualisierbar:', e.message);
      }
      let hits = [...METHDB];
      if (input.name) {
        const q = input.name.toLowerCase();
        hits = hits.filter(m => (m.name || '').toLowerCase().includes(q)
          || (m.beschreibung || '').toLowerCase().includes(q));
      }
      if (input.phase)      hits = hits.filter(m => (m.phasen || []).some(p => p.toLowerCase().includes(input.phase.toLowerCase())));
      if (input.sozialform) hits = hits.filter(m => (m.sozialform || []).some(s => s.toLowerCase().includes(input.sozialform.toLowerCase())));
      if (input.format) hits = hits.filter(m => (m.formate || []).includes(input.format));
      return JSON.stringify(hits.slice(0, 60).map(m => {
        const o = {
          name: m.name, beschreibung: (m.beschreibung || '').slice(0, 120),
          phasen: m.phasen, sozialform: m.sozialform, zeitbedarf: m.zeitbedarf,
          formate: m.formate || []
        };
        // Steht hier etwas, muss die Methode erst beigebracht werden — und so
        // geht es. Fehlt das Feld, ist sie ohne Weiteres einsetzbar.
        if (m.einfuehrung) o.einfuehrung = String(m.einfuehrung).slice(0, 400);
        return o;
      }));
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
        notizen: input.notizen || '',
        prioritaet: input.prioritaet || 'pflicht',
        phasen: [], klpInhalt: [], klpProzess: [], material: []
      };
      if (_pcEinheitId) s.einheitId = _pcEinheitId;  // im Einheiten-Chat der Gruppe zuordnen
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
      if (input.notizen   !== undefined) stunde.notizen   = input.notizen;
      if (input.prioritaet!== undefined) stunde.prioritaet = input.prioritaet;
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

    case 'setPhasen': {
      const blk = (fp.blocks || []).find(b => b.id === _pcBlockId);
      const rei = blk && (blk.reihen || []).find(r => r.id === _pcReiheId);
      const stunde = rei && (rei.stunden || []).find(s => s.id === input.stundeId);
      if (!stunde) return JSON.stringify({ error: 'Stunde nicht gefunden: ' + input.stundeId });
      if (!Array.isArray(input.phasen)) return JSON.stringify({ error: 'phasen muss eine Liste sein' });
      stunde.phasen = input.phasen.map(p => ({
        id: uid(),
        titel: p.titel || '',
        inhalt: p.inhalt || '',
        methode: p.methode || '',
        sozialform: p.sozialform || '',
        minuten: parseInt(p.minuten) || 0,
        materialIds: []
      }));
      const summe = stunde.phasen.reduce((s, p) => s + p.minuten, 0);
      scheduleSave(); render();
      return JSON.stringify({ ok: true, anzahl: stunde.phasen.length, minutenGesamt: summe });
    }

    case 'materialZuordnen': {
      const blk = (fp.blocks || []).find(b => b.id === _pcBlockId);
      const rei = blk && (blk.reihen || []).find(r => r.id === _pcReiheId);
      const stunde = rei && (rei.stunden || []).find(s => s.id === input.stundeId);
      if (!stunde) return JSON.stringify({ error: 'Stunde nicht gefunden: ' + input.stundeId });
      if (!Array.isArray(stunde.material)) stunde.material = [];
      const eintrag = {
        id: uid(),
        quelle: input.quelle,
        teile: input.teile || '',
        anpassung: input.anpassung || ''
      };
      stunde.material.push(eintrag);
      scheduleSave(); render();
      return JSON.stringify({ ok: true, materialId: eintrag.id, stunde: stunde.titel });
    }

    case 'materialEntfernen': {
      const blk = (fp.blocks || []).find(b => b.id === _pcBlockId);
      const rei = blk && (blk.reihen || []).find(r => r.id === _pcReiheId);
      const stunde = rei && (rei.stunden || []).find(s => s.id === input.stundeId);
      if (!stunde) return JSON.stringify({ error: 'Stunde nicht gefunden: ' + input.stundeId });
      const before = (stunde.material || []).length;
      stunde.material = (stunde.material || []).filter(m => m.id !== input.materialId);
      if (stunde.material.length === before) return JSON.stringify({ error: 'Zuordnung nicht gefunden: ' + input.materialId });
      scheduleSave(); render();
      return JSON.stringify({ ok: true });
    }

    case 'readDatenbank': {
      try {
        var _dbFach = fachKeyFuerDatenbank(fp.fach);
        var _dbFilters = _dbFach ? { fach: _dbFach } : {};
        var _dbRawParams = [];
        if (input.inhaltstyp) _dbFilters.inhaltstyp = input.inhaltstyp;
        if (input.jahrgang)   _dbFilters.jahrgang   = input.jahrgang;
        if (input.format)     _dbRawParams.push('formate=cs.{' + encodeURIComponent(input.format) + '}');

        var _rows = await sbSelectAll('inhalte', { filters: _dbFilters, rawParams: _dbRawParams, limit: 500 });

        // Thema-Suche client-seitig
        var _alleRows = _rows;
        var _wortSuche = null;
        if (input.thema) {
          var _passt = function(r, q) {
            return (r.thema || '').toLowerCase().includes(q) ||
                   (r.kapitel || '').toLowerCase().includes(q) ||
                   (r.uk_titel || '').toLowerCase().includes(q) ||
                   (r.nr || '').toLowerCase().includes(q) ||
                   (r.aufgabenstellung || '').toLowerCase().includes(q) ||
                   (r.inhalt || '').toLowerCase().includes(q);
          };
          var _q = input.thema.toLowerCase().trim();
          _rows = _alleRows.filter(function(r) { return _passt(r, _q); });

          // Wenige oder keine Treffer? Ein Stundentitel wie
          // „Ökosystem-Grundbegriffe: Ökosystem, Biotop, Biozönose" steht so
          // in keinem Feld, und ein einzelner Treffer heißt nicht, dass es
          // nicht mehr gibt: „Ökosystem" trifft eins, „Ökologie" sechs.
          // Deshalb ab hier zusätzlich mit den Einzelwörtern suchen und die
          // Ergebnisse zusammenführen.
          var PC_BREIT_AB = 5;
          if (_rows.length < PC_BREIT_AB) {
            var _woerter = _q.split(/[^0-9a-zäöüßáéíóúàèìòùâêîôûç]+/i)
              .filter(function(w) { return w.length >= 4; });
            if (_woerter.length) {
              var _schonDa = {};
              _rows.forEach(function(r) { _schonDa[r.id] = true; });
              var _mehr = _alleRows.filter(function(r) {
                return !_schonDa[r.id] && _woerter.some(function(w) { return _passt(r, w); });
              });
              if (_mehr.length) {
                _rows = _rows.concat(_mehr);
                _wortSuche = _woerter;
              }
            }
          }

          // Immer noch wenig? Dann das Kapitel der Treffer dazunehmen. „Ökosystem"
          // trifft genau einen Lehrtext — der steht aber im Kapitel „Ökologie",
          // und dort liegen fünf weitere, darunter der Goldfisch-Text, den kein
          // Wort des Stundentitels trifft.
          var _kapitelBreit = null;
          if (_rows.length > 0 && _rows.length < PC_BREIT_AB) {
            var _kaps = [];
            _rows.forEach(function(r) {
              if (r.kapitel && _kaps.indexOf(r.kapitel) < 0) _kaps.push(r.kapitel);
            });
            var _drin = {};
            _rows.forEach(function(r) { _drin[r.id] = true; });
            var _ausKapitel = _alleRows.filter(function(r) {
              return !_drin[r.id] && r.kapitel && _kaps.indexOf(r.kapitel) >= 0;
            }).slice(0, 40);
            if (_ausKapitel.length) {
              _rows = _rows.concat(_ausKapitel);
              _kapitelBreit = _kaps;
            }
          }

          // Immer noch nichts: nicht einfach „keine Treffer" melden, sondern
          // zeigen, welche Themen es in diesem Fach überhaupt gibt. Sonst
          // schließt die KI auf eine leere Datenbank, obwohl nur das Wort
          // nicht passte.
          if (!_rows.length) {
            var _vorhanden = [];
            _alleRows.forEach(function(r) {
              var t = r.kapitel || r.thema;
              if (t && _vorhanden.indexOf(t) < 0) _vorhanden.push(t);
            });
            return JSON.stringify({
              gesamt: 0,
              gesucht: input.thema,
              hinweis: 'Kein Treffer für diesen Suchbegriff — das heißt NICHT, dass es '
                + 'kein Material gibt. Die Suche vergleicht Zeichenketten: Suche mit '
                + 'einzelnen deutschen Begriffen statt mit ganzen Stundentiteln, und '
                + 'nimm einen der unten aufgeführten Themenbegriffe.',
              vorhandeneThemen: _vorhanden.slice(0, 80),
              materialInsgesamt: _alleRows.length
            });
          }
        }

        // Ohne Suchbegriff wird nicht der ganze Katalog ausgeliefert, sondern
        // eine Landkarte: welche Quelle deckt welche Themen wie stark ab.
        // Der Katalog eines Fachs sind bei Mathe 1399 Einträge ≈ 96.000 Tokens,
        // die dann in JEDEM weiteren Zug des Gesprächs erneut mitgeschickt
        // werden. Für den Reihenschnitt genügt die Landkarte; Einzeltreffer
        // holt man mit einem zweiten Aufruf mit thema.
        if (!input.thema) {
          // Gezählt wird in Aufgaben, nicht in Datenbankzeilen: „21a" bis „21h"
          // sind acht Zeilen, aber eine Aufgabe. Dieselbe Regel wie in der
          // Datenbankansicht (dbGroupByParent in core/ui.js) — sonst nennt die
          // KI der Lehrerin eine Zahl, die sie in ihrer Datenbank nicht sieht.
          var _aufgProQuelle = {};
          dbGroupByParent(_rows).forEach(function(g) {
            var qn = (g.items[0] && g.items[0].quelle_name) || '(ohne Quelle)';
            _aufgProQuelle[qn] = (_aufgProQuelle[qn] || 0) + 1;
          });

          var _ueb = {}, _uOrder = [];
          _rows.forEach(function(r) {
            var qn = r.quelle_name || '(ohne Quelle)';
            if (!_ueb[qn]) {
              _ueb[qn] = { quelle: qn, typ: r.quelle_typ, anzahl: 0,
                           typen: {}, themen: [], jahrgaenge: [], formate: [] };
              _uOrder.push(qn);
            }
            var b = _ueb[qn];
            b.anzahl++;
            var it = r.inhaltstyp || 'ohne Typ';
            b.typen[it] = (b.typen[it] || 0) + 1;
            var th = r.kapitel || r.thema;
            if (th && b.themen.indexOf(th) < 0) b.themen.push(th);
            if (r.jahrgang && b.jahrgaenge.indexOf(r.jahrgang) < 0) b.jahrgaenge.push(r.jahrgang);
            (r.formate || []).forEach(function(f) { if (b.formate.indexOf(f) < 0) b.formate.push(f); });
          });
          var _aufgGesamt = Object.keys(_aufgProQuelle).reduce(function(s, k) {
            return s + _aufgProQuelle[k];
          }, 0);

          return JSON.stringify({
            uebersicht: true,
            aufgaben: _aufgGesamt,
            teilaufgaben: _rows.length,
            hinweis: 'Landkarte des vorhandenen Materials, keine Einzeltreffer. '
              + 'Gezählt wird in Aufgaben — Teilaufgaben (21a, 21b, …) gehören zu einer. '
              + 'Für konkrete Aufgaben, Arbeitsblätter oder Texte rufe readDatenbank '
              + 'erneut mit thema auf (z.B. thema: "Prozentrechnung").',
            quellen: _uOrder.map(function(qn) {
              var b = _ueb[qn];
              return {
                quelle: b.quelle, typ: b.typ,
                aufgaben: _aufgProQuelle[qn] || 0,
                teilaufgaben: b.anzahl,
                typen: b.typen,
                jahrgaenge: b.jahrgaenge.sort(),
                formate: b.formate,
                themen: b.themen.slice(0, 40),
                weitereThemen: Math.max(0, b.themen.length - 40)
              };
            })
          });
        }

        // Mit Suchbegriff: Einzeltreffer wie bisher, aber gedeckelt — auch eine
        // breite Suche darf das Gespräch nicht fluten.
        var _MAX = 60;
        var _gekuerzt = _rows.length > _MAX;
        var _zeige = _rows.slice(0, _MAX);

        var _byQ = {}, _qOrder = [];
        _zeige.forEach(function(r) {
          var qn = r.quelle_name || '(ohne Quelle)';
          if (!_byQ[qn]) { _byQ[qn] = { typ: r.quelle_typ, items: [] }; _qOrder.push(qn); }
          var _it = {
            inhaltstyp: r.inhaltstyp,
            nr: r.nr,
            thema: r.thema,
            kapitel: r.kapitel,
            jahrgang: r.jahrgang,
            schwierigkeit: r.schwierigkeit,
            formate: r.formate || [],
            methode: r.methode || null,
            // Die von Hand gepflegte Beschreibung geht vor: Dort steht, wie die
            // Lehrerin das Material einsetzt — die Aufgabenstellung sagt nur,
            // was darauf gedruckt ist.
            beschreibung: (r.beschreibung || r.aufgabenstellung || r.inhalt || '').slice(0, 220)
          };
          // Was auf dem Material ZU SEHEN ist. Ohne dieses Feld plant die KI
          // blind über Bildmaterial und erfindet, was darauf sein könnte.
          if (r.abbildung) _it.abbildung = String(r.abbildung).slice(0, 300);
          // Felder aus dem KI-Fingerprint. Nur die planungsrelevanten und nur,
          // wenn gefüllt — sonst blaeht sich die Antwort mit null-Feldern auf.
          // mathematische_objekte heißt historisch so, enthält aber die
          // fachlichen Objekte des Fachs; rechenbarkeit bleibt draußen.
          [['rolle_in_reihe','rolleInReihe'], ['didaktische_funktion','didaktischeFunktion'],
           ['unterrichtsphase','unterrichtsphase'], ['sozialform','sozialform'],
           ['offenheit','offenheit'], ['kognitive_anforderung','kognitiveAnforderung'],
           ['differenzierungspotenzial','differenzierung'],
           ['sprachliche_zugaenglichkeit','sprache'], ['unterstuetzung','unterstuetzung'],
           ['niveau','niveau'], ['umfang','umfang'], ['operator','operator'],
           ['hat_loesung','hatLoesung'], ['kontext','kontext'],
           ['mathematische_objekte','fachobjekte'], ['vorkenntnisse','vorkenntnisse']
          ].forEach(function(p) {
            var v = r[p[0]];
            if (v !== null && v !== undefined && v !== '') _it[p[1]] = v;
          });
          _byQ[qn].items.push(_it);
        });

        var _out = {
          gesamt: _rows.length,
          quellen: _qOrder.map(function(qn) {
            return { quelle: qn, typ: _byQ[qn].typ, materialien: _byQ[qn].items };
          })
        };
        var _hinweise = [];
        if (_wortSuche) {
          _hinweise.push('Wenige direkte Treffer für „' + input.thema + '" — zusätzlich '
            + 'nach den Einzelwörtern gesucht (' + _wortSuche.join(', ') + ').');
        }
        if (_kapitelBreit) {
          _hinweise.push('Ebenfalls wenig — deshalb ist das ganze Kapitel „'
            + _kapitelBreit.join('", „') + '" mit aufgeführt. Dort liegt oft Material, '
            + 'dessen Bezeichnung den Suchbegriff nicht enthält.');
        }
        if (_hinweise.length) {
          _out.hinweis = _hinweise.join(' ') + ' Prüfe die Liste selbst; Randtreffer sind möglich.';
        }
        if (_gekuerzt) {
          _out.gezeigt = _MAX;
          _out.hinweis = 'Nur die ersten ' + _MAX + ' von ' + _rows.length
            + ' Treffern. Grenze mit einem genaueren thema, jahrgang oder inhaltstyp weiter ein.';
        }
        return JSON.stringify(_out);
      } catch(e) {
        return JSON.stringify({ error: 'Datenbank nicht verfügbar: ' + e.message });
      }
    }

    default:
      return JSON.stringify({ error: 'Unbekanntes Tool: ' + name });
  }
}

// Zwei Fassungen: während der Ausführung und danach. Im fertigen Verlauf soll
// stehen, was passiert IST — nicht, was gerade passiert.
const _PC_TOOL_LABELS = {
  readPlan:       '📋 Lese aktuellen Plan …',
  readKLP:        '📖 Lese Kernlehrplan …',
  readMethoden:   '🔍 Suche Methoden …',
  readDidaktik:   '📚 Lese didaktische Hinweise …',
  readDatenbank:  '🔍 Suche Materialien in der Datenbank …',
  createStunde:   '✏ Lege Stunde an …',
  createReihe:    '✏ Lege Reihe an …',
  updateStunde:   '✏ Ändere Stunde …',
  updateReihe:    '✏ Ändere Reihe …',
  deleteStunde:   '🗑 Lösche Stunde …',
  deleteReihe:    '🗑 Lösche Reihe …',
  setPhasen:      '🧩 Lege Phasen fest …',
  materialZuordnen: '📎 Ordne Material zu …',
  materialEntfernen:'📎 Entferne Material …',
};

const _PC_TOOL_FERTIG = {
  readPlan:       '📋 Plan gelesen',
  readKLP:        '📖 Kernlehrplan gelesen',
  readMethoden:   '🔍 Methoden durchsucht',
  readDidaktik:   '📚 Didaktik gelesen',
  readDatenbank:  '🔍 Material gesucht',
  createStunde:   '✏ Stunde angelegt',
  createReihe:    '✏ Reihe angelegt',
  updateStunde:   '✏ Stunde geändert',
  updateReihe:    '✏ Reihe geändert',
  deleteStunde:   '🗑 Stunde gelöscht',
  deleteReihe:    '🗑 Reihe gelöscht',
  setPhasen:      '🧩 Phasen festgelegt',
  materialZuordnen: '📎 Material zugeordnet',
  materialEntfernen:'📎 Material entfernt',
};

// Titel zu einer ID aus dem aktuellen Plan — damit im Chat nicht nur „Stunde
// geändert" steht, sondern welche.
function _pcTitelZuId(fp, art, id) {
  if (!fp || !id) return '';
  let treffer = '';
  (fp.blocks || []).forEach(b => (b.reihen || []).forEach(r => {
    if (art === 'reihe' && r.id === id) treffer = r.titel || '';
    if (art === 'stunde') (r.stunden || []).forEach(s => {
      if (s.id === id) treffer = s.titel || '';
    });
  }));
  return treffer;
}

// Der Zusatz hinter dem Label. Wird VOR der Ausführung bestimmt, damit auch
// bei einer Löschung noch dasteht, was gelöscht wurde.
function _pcToolDetail(name, input, fp) {
  if (!input) return '';
  const kurz = t => (t && t.length > 60) ? t.slice(0, 59) + '…' : (t || '');
  switch (name) {
    case 'createStunde':
    case 'createReihe':
      return kurz(input.titel);
    case 'updateStunde':
    case 'deleteStunde':
      return kurz(input.titel || _pcTitelZuId(fp, 'stunde', input.stundeId));
    case 'updateReihe':
    case 'deleteReihe':
      return kurz(input.titel || _pcTitelZuId(fp, 'reihe', input.reiheId));
    case 'setPhasen':
      return kurz(_pcTitelZuId(fp, 'stunde', input.stundeId));
    case 'materialZuordnen':
    case 'materialEntfernen': {
      const stunde = _pcTitelZuId(fp, 'stunde', input.stundeId);
      return kurz([input.quelle, stunde].filter(Boolean).join(' → '));
    }
    case 'readDatenbank':
    case 'readMethoden':
      return kurz(input.thema || input.suchbegriff);
    default:
      return '';
  }
}

// laeuft === true → Verlaufsform, sonst Vergangenheit. Alte gespeicherte
// Verlaeufe haben kein Flag; die sind zwangslaeufig fertig.
function _pcToolText(tc) {
  const basis = tc.laeuft
    ? (_PC_TOOL_LABELS[tc.name] || ('🔧 ' + tc.name + ' …'))
    : (_PC_TOOL_FERTIG[tc.name] || _PC_TOOL_LABELS[tc.name] || ('🔧 ' + tc.name));
  if (!tc.detail) return basis;
  // Die Auslassungspunkte gehören ans Ende, nicht vor den Titel
  return basis.replace(/ …$/, '') + ': ' + tc.detail + (tc.laeuft ? ' …' : '');
}

// Markiert den laufenden Zug im Verlauf als abgebrochen. Die bis dahin
// ausgeführten Tools bleiben sichtbar — sie sind ja auch tatsächlich passiert.
function _pcAbbruchAnzeigen(thinkMsg) {
  thinkMsg.isThinking = false;
  thinkMsg.abgebrochen = true;
  _pcRender();
}

function _pcRender() {
  const el = document.getElementById('pc-messages');
  if (!el) return;
  el.innerHTML = '';

  if (!_pcMsgs.length) {
    const hatPlanAll = !!document.getElementById('pc-planall');
    const leer = tx('div', '', _pcLoading
      ? 'Lade Verlauf …'
      : 'Noch kein Gespräch. Schreib, woran du gerade arbeitest'
        + (hatPlanAll ? ' — oder lass unten in einem Zug durchplanen.' : '.'));
    leer.style.cssText = 'color:var(--tx3);font-size:13px;padding:10px 2px;line-height:1.5;';
    el.appendChild(leer);
  }

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
        d.appendChild(tx('div', 'pc-tool-badge', _pcToolText(tc)));
      });
    }
    if (m.isThinking) {
      const row = mk('div', 'pc-thinking-row');
      const spinner = mk('span', 'pc-spinner');
      row.appendChild(spinner);
      row.appendChild(tx('span', 'pc-thinking', _pcStop
        ? 'Abbruch läuft …'
        : (m.toolCalls && m.toolCalls.length ? 'Warte auf Antwort …' : 'KI denkt …')));
      d.appendChild(row);
    }
    if (m.abgebrochen) d.appendChild(tx('div', 'pc-abbruch', '⏹ Abgebrochen'));
    el.appendChild(d);
  });
  el.scrollTop = el.scrollHeight;

  const inp  = document.getElementById('pc-input');
  const sbtn = document.getElementById('pc-send');
  const pbtn = document.getElementById('pc-planall');
  if (inp)  inp.disabled  = _pcRunning;
  if (pbtn) pbtn.disabled = _pcRunning;
  // Der Senden-Knopf wird während des Laufs zum Stopp-Knopf
  if (sbtn) {
    if (_pcRunning) {
      sbtn.textContent = _pcStop ? 'Bricht ab …' : '⏹ Stopp';
      sbtn.className = 'btn btn-danger btn-sm';
      sbtn.disabled = _pcStop;
      sbtn.title = 'Bricht die laufende Antwort ab. Bereits Angelegtes bleibt bestehen.';
    } else {
      sbtn.textContent = 'Senden ↵';
      sbtn.className = 'btn btn-primary btn-sm';
      sbtn.disabled = false;
      sbtn.title = '';
    }
  }
}

async function _pcSend(fp, context, text) {
  // context = { block } für Block-Chat, { block, reihe } für Reihen-Chat
  if (_pcRunning || !text.trim()) return;
  _pcRunning = true;

  _pcMsgs.push({ role: 'user', text: text.trim() });
  _pcApi.push({ role: 'user', content: text.trim() });

  const thinkMsg = { role: 'assistant', text: '', isThinking: true, toolCalls: [] };
  _pcMsgs.push(thinkMsg);
  _pcRender();

  const { block, reihe, einheit, stunde } = context;
  const fachName = PC_FACH[fp.fach] || fp.fach;

  // Ohne ausdrückliche Ansage siezt das Modell im Deutschen. Unter Kolleginnen,
  // die zusammen an einer Planung sitzen, ist das schief.
  const anrede = '\nSprich sie mit Du an. Kein Siezen.\n';

  // Vorhandenes Material fest in den Prompt legen, statt darauf zu hoffen, dass
  // die KI readDatenbank aufruft. Die Anweisung dazu stand im Prompt und wurde
  // trotzdem übergangen — mit dem Ergebnis, dass am Bestand vorbeigeplant wurde.
  // Gesucht wird nach dem Stundenthema, sonst nach dem Reihentitel; die Suche
  // verbreitert sich bei wenigen Treffern von selbst.
  let materialBlock = '';
  if (stunde || reihe) {
    const suchthema = (stunde && stunde.titel) || (reihe && reihe.titel) || '';
    if (suchthema) {
      try {
        // Innerhalb eines Gesprächs nur einmal abfragen — der Prompt wird bei
        // jedem Zug neu gebaut, die Datenbank ändert sich dabei nicht.
        const cacheKey = _pcChatKey + '|' + suchthema;
        if (_pcMaterialCache.key !== cacheKey) {
          _pcMaterialCache = { key: cacheKey, roh: await _pcExecTool('readDatenbank', { thema: suchthema }, fp) };
        }
        const roh = _pcMaterialCache.roh;
        const dat = JSON.parse(roh);
        if (dat && dat.gesamt > 0) {
          materialBlock = '\nVorhandenes Material zu diesem Thema — bereits für dich '
            + 'abgefragt, du musst readDatenbank dafür nicht erneut aufrufen '
            + '(für andere Themen schon):\n' + roh + '\n'
            + 'Beziehe dich in deinen Vorschlägen auf diese Titel, nicht auf gedachtes '
            + 'Material. Passt nichts davon, sag das ausdrücklich.\n';
        } else {
          materialBlock = '\nZu diesem Thema liegt in ihrer Materialdatenbank nichts vor '
            + '(bereits geprüft). Plane ohne vorhandenes Material und sag ihr das.\n';
        }
      } catch (e) {
        console.warn('[Chat] Material konnte nicht geladen werden:', e.message);
      }
    }
  }

  // Was in diesem Fach und Jahrgang immer gilt — von der Lehrerin gepflegt
  const grundlagen = (fp.grundlagen || '').trim();
  const grundlagenBlock = grundlagen
    ? `\nPlanungsgrundlagen für dieses Fach und diesen Jahrgang — von der Lehrerin
hinterlegt, gelten durchgehend und müssen nicht erfragt werden:\n\n${grundlagen}\n`
    : '';

  let tools, system;

  if (einheit) {
    // Einheiten-Chat: Feinplanung — Didaktik und Classroom Management im Vordergrund
    tools = PC_EINHEIT_TOOLS;
    // Kommt der Chat aus der Stundenansicht, ist der Gegenstand genau diese eine
    // Stunde. Die Reihe bleibt Kontext — readPlan liefert sie weiterhin ganz.
    const gegenstand = stunde
      ? `die Stunde „${stunde.titel || 'ohne Titel'}" aus der Reihe „${reihe.titel}"`
      : (einheit.id
          ? `die Einheit „${einheit.titel}" aus der Reihe „${reihe.titel}"`
          : `die Stunden der Reihe „${reihe.titel}"`);
    system = `Du bist Fachleiterin für ${fachName} und berätst eine erfahrene Kollegin an einem
NRW-Gymnasium. Ihr plant gemeinsam ${gegenstand}, Jahrgang ${fp.jahrgang}.
${grundlagenBlock}
Das ist kein Unterrichtsbesuch und keine Prüfungssituation — ihr arbeitet auf
Augenhöhe an einer Planung, die noch nicht steht. Du bringst den geschulten Blick
auf Stundenaufbau mit; was die Klasse trägt, weiß sie besser als du.

Worum es grob geht, steht fest: Thema und Reihenfolge kommen aus der Reihenplanung.
Die inhaltliche Ausgestaltung ist damit aber nicht festgelegt — sie folgt oft erst
aus den didaktischen Entscheidungen. Wenn eine Methode einen Inhalt anders
zuschneidet, ein Schwerpunkt wegfällt oder ein Aspekt dazukommt, ist das ein
legitimes Ergebnis eurer Planung, kein Fehler.

Fachliche Fehler weist du weiterhin hin, bewertest die Planung aber nicht primär
danach. Du sagst klar, wenn etwas nicht funktionieren wird, und begründest es an
der konkreten Stelle. Zustimmung sparst du dir, wenn du nichts beizutragen hast.

Worauf du achtest:

1. Was tun die Schülerinnen und Schüler? Wenn eine Planung überwiegend beschreibt,
   was die Lehrkraft tut, frage nach. Benenne für jede längere Phase, was die
   Lernenden konkret machen: schreiben, sortieren, erklären, messen, diskutieren.
   Lehrervortrag ist legitim, wenn er begründet ist — dann reicht ein Hinweis,
   keine Diskussion.

2. Rhythmisierung. Konzentrationsphasen sind begrenzt — in Jahrgang 5/6 etwa
   10–15 Minuten, in der Oberstufe länger. Nach einer anstrengenden Phase kommt
   eine leichtere.

   Doppelstunden sind durch eine 5-Minuten-Pause geteilt. Berücksichtige sie in der
   Zeitplanung. Ob danach fortgesetzt oder neu angesetzt wird, hängt von der Phase
   ab: Eine laufende Arbeitsphase kann weiterlaufen; ist ein Gedankengang
   abgeschlossen, braucht es einen Wiedereinstieg.

3. Sozialformen und Übergänge. Jeder Wechsel der Sozialform kostet real 2–3 Minuten
   und ist der Ort, an dem Unruhe entsteht: Gruppenbildung, Materialverteilung,
   Umbau. Plane diese Zeit ein und sag, wie der Übergang organisiert wird.

   Fällt dir am Verlauf etwas auf — sehr lange in einer Sozialform, oder viele
   Wechsel dicht hintereinander —, sprich es an. Ob es passt, entscheidet sie.

4. Einstieg und Sicherung. Der Einstieg knüpft ans Vorwissen an. Ist er als
   Hinführung gedacht, halte ihn kurz — fünf Minuten reichen meist. Ist er selbst
   Teil der Erarbeitung, sag das deutlich, damit die Zeit dafür eingeplant ist.

   Eine gezielte Wiederholung der Vorstunde ist ein legitimer Einstieg. Wenn du
   dafür eine Form vorschlägst, achte darauf, dass sie in wenigen Minuten läuft und
   kaum Vorbereitung braucht — readMethoden kennt solche Formate.

   Nicht jeder Einstieg führt zum Thema hin. Wiederkehrende Rituale — Kopfrechnen,
   Einheiten umrechnen, Fachbegriffe auffrischen — halten Fertigkeiten aus früheren
   Themen wach und lassen die Klasse ankommen. Das ist ein legitimer Stundenbeginn,
   gerade weil er themenunabhängig ist; die Länge lässt sich an die verbleibende
   Zeit anpassen.

   Achte darauf, dass am Ende etwas bleibt, und sag, in welcher Form: Heft, Plakat,
   mündlich, Foto. Endet eine Stunde bewusst offen und die Sicherung kommt in der
   nächsten, ist das in Ordnung — dann sollte es aber so geplant sein und nicht aus
   Zeitmangel passieren.

   Stehen in den Planungsgrundlagen Rituale mit einer Häufigkeit — etwa wöchentlich
   Kopfrechnen oder monatlich ein Spiel —, ist es deine Aufgabe, sie konkret zu
   platzieren. Die Reihenplanung hat nur das Budget reserviert, nicht den Ort.
   Prüfe zuerst, ob das Ritual thematisch andockt: Passt das Kopfrechnen zum Inhalt
   dieser Woche, bau es dort ein. Passt es nicht, läuft es als themenunabhängiger
   Einstieg — auch das ist richtig, nicht ein Notbehelf.

   Gibt es fertiges Material dafür, setz es ein. Gibt es nur ein passendes Format
   ohne Inhalt — etwa Tabu zu einem anderen Thema —, sag das: Formate lassen sich
   übertragen, und du begleitest sie beim Anpassen. Rituale mit Vorlauf, etwa
   Kurzreferate, brauchen eine frühere Stunde, in der die Themen vergeben werden;
   plane die mit ein.

5. Differenzierung. Der Schwerpunkt liegt bei denen, die schnell fertig sind.
   Förderung der Schwächeren findet zu großen Teilen an anderer Stelle statt — in
   Förderstunden und in eigenen Phasen des Schuljahres. Im regulären Unterricht
   sollen deshalb die Starken in den Blick.

   Das Angebot für sie muss zweierlei zugleich sein: attraktiv genug, dass sich
   Schnellsein lohnt, und inhaltlich sinnvoll. Also weder mehr Aufgaben derselben
   Art noch Beschäftigung um ihrer selbst willen — sondern etwas Kniffliges, eine
   offene Frage, ein Transfer, eine Wahlmöglichkeit, oder die Rolle, anderen etwas
   zu erklären.

   Bevorzuge wiederkehrende Formate gegenüber Einzellösungen pro Stunde. Ein
   Angebot, das immer dieselbe Form hat und bei dem nur der Inhalt wechselt, wird
   durchgehalten; ein neues Konzept pro Stunde nicht.

   Methoden, die erst beigebracht werden müssen: Trägt eine Methode in
   readMethoden das Feld „einfuehrung", ist sie nicht voraussetzungslos
   einsetzbar. Der erste Einsatz ist dann die Einführung — sie kostet Zeit, und
   der Inhalt sollte dabei bewusst leicht sein, damit die Aufmerksamkeit bei der
   Methode bleibt. Steht in den Planungsgrundlagen ein Methodencurriculum
   (welche Methoden diese Lerngruppe wann lernen soll), richte dich danach:
   Methoden im Aufbau setzt du bewusst wiederholt ein, auch wenn eine andere
   Methode für diese eine Stunde etwas besser passen würde. Sag jeweils dazu, ob
   du eine Methode einführst oder als bekannt voraussetzt.

   Differenzierung ist meist keine eigene Phase, sondern eine Eigenschaft der
   Aufgabe: wie viele Aufgaben bearbeitet werden, welche Schwierigkeit sie haben,
   ob Hilfen dabeiliegen, was nach der Pflicht kommt. Das kostet keine zusätzliche
   Unterrichtszeit. Streiche Differenzierung deshalb nie mit der Begründung, die
   Zeit reiche nicht — knappe Zeit ist ein Grund, sie ins Material zu legen statt
   in eine eigene Phase. Und bevor du sagst, dir falle nichts ein, sieh mit
   readDidaktik und readMethoden nach.

   Wer nicht mitkommt, braucht zuerst eine Diagnose: Verstehen, Tempo oder Sprache?
   Danach richtet sich, was hilft. Du kennst diese Lerngruppe nicht — frag nach,
   wenn sie ein konkretes Problem anspricht, statt allgemeine Vorschläge zu machen.

6. Realistische Zeit. Feste Rahmenzeiten gehen von der Stunde ab: zu Beginn
   Begrüßungsritual, Material und Anwesenheit, am Ende drei Minuten zum Aufräumen.
   Rechne unterrichtlich mit 40 Minuten in der Sekundarstufe II und etwa 35 in der
   Sekundarstufe I. Die Übergangszeiten aus Punkt 3 zählen in dieses Budget hinein,
   nicht obendrauf.

   In einer Doppelstunde fallen die Rahmenzeiten nur einmal an — abzüglich der
   Pause bleiben dort spürbar mehr als zwei Einzelstunden hergeben.

   Liegen die Phasenzeiten in Summe darüber, sag es deutlich und benenne, was
   gekürzt, verschoben oder als „wenn Zeit bleibt" markiert wird. Eine Planung, die
   auf die Minute aufgeht, geht in der Praxis nicht auf: Plane lieber eine Phase
   ein, die wegfallen kann, als eine, die unbedingt noch reinmuss.

Material: Vorrang und Reihenfolge

Material, das sie vorschlägt, hat Vorrang. Setze es ein, wenn es trägt.

Hältst du es für ungeeignet, brauchst du einen konkreten, benennbaren Grund — nicht
„passt nicht recht", sondern woran es scheitert. Und bevor du es verwirfst, prüfst
du die Anpassung: Lässt sich ein Teil weglassen, eine Aufgabe umformulieren, etwas
ergänzen? Sag, welche Teile tragen und welche nicht. Erst wenn auch Anpassung nichts
rettet, sagst du, dass das Material hier nicht funktioniert.

Hat sie Material genannt, drängst du ihr keine Alternativen auf. Nach anderem schaust
du dann nur, wenn sie zweifelt oder danach fragt — bist du unsicher, ob sie zweifelt,
frag nach („soll ich nach Alternativen schauen?"), statt es zu unterstellen.

Hat sie kein Material genannt, siehst du von dir aus mit readDatenbank nach, BEVOR du
planst. Sag ihr, was da ist und was du davon nimmst — auch, wenn du nichts Passendes
findest. Ohne diesen Blick planst du an ihrem Bestand vorbei.

Material neu zu gestalten ist die letzte Option, nicht die erste.

Hat sie eine eigene Idee für selbst gestaltetes Material, begleitest du sie dabei:
mitdenken, schärfen, auf Stolperstellen hinweisen. Du entwirfst nicht an ihrer
Stelle etwas anderes.

So arbeitest du:

- Das ist ein fortlaufendes Gespräch, kein Auftrag. Plane nicht ungefragt die ganze
  Einheit durch. Warte ab, womit sie einsteigt, und arbeite an dem, was gerade
  ansteht.

- Stell nicht mehrere Rückfragen auf einmal. Wenn dir etwas fehlt, frag das eine,
  was dich wirklich blockiert — der Rest klärt sich unterwegs.

- Die Standardausstattung kannst du voraussetzen: Rechner und Beamer, Schülerstrom,
  iPads, Whiteboard. Frag nur nach, wenn eine Planung darüber hinausgeht — Fachraum,
  Versuchsmaterial, Räume außerhalb.

- Rufe readPlan zu Beginn einmal auf, um die Stunden dieser Einheit und ihre
  Nachbarstunden zu sehen. Direkt danach readDatenbank mit dem Thema der Stunde —
  es sei denn, sie hat selbst Material genannt. readMethoden und readDidaktik nutzt
  du gezielt bei einer konkreten Frage, nicht auf Vorrat.

- Achte auf Stunden mit prioritaet „optional": Dort ist bei der Reihenplanung eine
  Frage offen geblieben, die erst hier beantwortbar ist — meist, ob der Inhalt in
  einer anderen Stunde mit untergebracht werden kann. Die Begründung steht in
  notizen. Sprich diese Fälle von dir aus an, sobald die umliegenden Stunden
  ausgearbeitet genug sind, um es zu beurteilen. Fällt die Entscheidung, setz
  prioritaet entsprechend um und halte das Ergebnis in notizen fest.

- Änderungen schreibst du erst, wenn ihr euch einig seid: updateStunde für Lernziel,
  Methode und Notizen, setPhasen für den Phasenverlauf.

- Hat sie eine Entscheidung getroffen, respektiere sie. Widersprich nur, wenn du
  einen konkreten Grund nennen kannst — nicht aus Prinzip.

- Arbeite an dem, was gerade Thema ist. Du musst nicht bei jeder Antwort alle
  Kriterien durchgehen — nenne, was an dieser Stelle wirklich auffällt, und lass
  den Rest weg. Kurze Antworten sind die Regel, lange die Ausnahme.`;
  } else if (reihe) {
    // Reihen-Chat: Stundenthemen und -abfolge planen
    const reiheInfo = `„${reihe.titel}"${reihe.stundenAnzahl ? ' (' + reihe.stundenAnzahl + ' Stunden)' : ''}`;
    const ctx = [
      reihe.schwerpunkt  ? 'Schwerpunkt: '           + reihe.schwerpunkt  : '',
      reihe.beschreibung ? 'Didaktische Begründung: ' + reihe.beschreibung : '',
      reihe.notizen      ? 'Notizen: '                + reihe.notizen      : ''
    ].filter(Boolean).join('\n');
    tools = PC_STUNDEN_TOOLS;
    system = `Du bist Planungspartnerin für ${fachName} Jahrgang ${fp.jahrgang} an einem NRW-Gymnasium.
Ihr plant gemeinsam die Unterrichtsreihe ${reiheInfo}.
${ctx ? ctx + '\n' : ''}${grundlagenBlock}
Das ist ein fortlaufendes Gespräch, kein Auftrag. Die Lehrerin arbeitet über Tage
hinweg an dieser Reihe und bringt Material nach und nach ein — oft unsortiert und
nicht in der Reihenfolge der Stunden. Plane nicht ungefragt die ganze Reihe durch.
Arbeite an dem, was gerade ansteht, und warte ab, womit sie einsteigt.

Rechne die Stundenzahl nie selbst nach: readPlan liefert unter „budget" soll,
belegt und offen — fertig gerechnet, Doppelstunden bereits als zwei gezählt. Jede
Stunde trägt zusätzlich „einheiten" (1 oder 2). Nimm diese Zahlen und behaupte
nichts über das Budget, was ihnen widerspricht.

Wenn sie ausdrücklich darum bittet, die Reihe komplett durchzuplanen, tu es: Lege
dann Stunden an, bis stundenAnzahl aufgebraucht ist. stundenAnzahl ist das Budget in
Unterrichtsstunden à 45 Minuten: Eine Einzelstunde (dauer=45) verbraucht eine, eine
Doppelstunde (dauer=90) verbraucht zwei. Eine Doppelstunde ist EIN Eintrag mit
dauer=90 — lege dafür nie zwei Stunden mit „[1/2]" und „[2/2]" an. Wie sie die im
Stundenplan verteilt, entscheidest nicht du.

Zum Einstieg rufst du readPlan einmal auf, um den Stand zu sehen — welche Stunden es
gibt, welches Material schon zugeordnet ist, und welche Reihen davor und danach
kommen. Steht das Planen von Stunden an und sie hat kein Material genannt, rufst du
danach readDatenbank auf — ohne Blick auf ihren Bestand planst du daran vorbei.
readKLP, readMethoden und readDidaktik nutzt du gezielt, wenn eine konkrete Frage
ansteht, nicht auf Vorrat.

Der KLP ist Hintergrundwissen, keine Vorgabe: Wenn das vorhandene Material oder die
Notizen der Lehrerin bewusst von der KLP-Reihenfolge oder -Schwerpunktsetzung
abweichen, folge dem Material und den Notizen — versuche nicht, die Struktur wieder
an den KLP anzugleichen.

Material: Vorrang und Reihenfolge

Material, das sie vorschlägt, hat Vorrang. Setze es ein, wenn es trägt.

Hältst du es für ungeeignet, brauchst du einen konkreten, benennbaren Grund — nicht
„passt nicht recht", sondern woran es scheitert. Und bevor du es verwirfst, prüfst du
die Anpassung: Lässt sich ein Teil weglassen, eine Aufgabe umformulieren, etwas
ergänzen? Sag, welche Teile tragen und welche nicht. Erst wenn auch Anpassung nichts
rettet, sagst du, dass das Material hier nicht funktioniert.

Hat sie Material genannt, drängst du ihr keine Alternativen auf. Nach anderem schaust
du dann nur, wenn sie zweifelt oder danach fragt — bist du unsicher, ob sie zweifelt,
frag nach („soll ich nach Alternativen schauen?"), statt es zu unterstellen.

Hat sie kein Material genannt, siehst du von dir aus mit readDatenbank nach, BEVOR du
planst. Sag ihr, was da ist und was du davon nimmst — auch, wenn du nichts Passendes
findest. Ohne diesen Blick planst du an ihrem Bestand vorbei.

Material neu zu gestalten ist die letzte Option, nicht die erste.

Hat sie eine eigene Idee für selbst gestaltetes Material, begleitest du sie dabei:
mitdenken, schärfen, auf Stolperstellen hinweisen. Du entwirfst nicht an ihrer Stelle
etwas anderes.

Sobald ihr euch über eine Zuordnung einig seid, hältst du sie mit materialZuordnen
fest — auch Teilverwendung („nur Aufgabe 2–4") und nötige Anpassungen. Das Material
muss dafür nicht in der Datenbank stehen; es zählt, wie die Lehrerin es nennt.

Rituale einplanen

Stehen in den Planungsgrundlagen wiederkehrende Rituale mit einer Häufigkeit, sorge
dafür, dass die Zeit dafür da ist. Rechne aus, wie viele Wochen die Reihe umfasst —
die Wochenstundenzahl steht in den Grundlagen — und reserviere entsprechend: bei
wöchentlichem Kopfrechnen zehn Minuten je Woche, bei einem monatlichen Spiel eine
ganze Stunde je vier Wochen.

Wo genau das Ritual liegt, entscheidest du nicht. Das ist Sache der Feinplanung, die
beurteilen kann, ob es thematisch andockt oder als themenunabhängiger Einstieg läuft.
Halte in notizen fest, was reserviert ist, damit die Feinplanung es findet.

Offene Fragen an die Feinplanung weiterreichen

Manche Entscheidungen lassen sich hier noch nicht treffen, weil die Information erst
bei der Ausarbeitung entsteht — etwa ob ein kleines Thema in einer anderen Stunde
mit untergebracht werden kann. Sag das nicht nur im Gespräch: Die Feinplanung ist
ein eigener Chat und sieht diesen Verlauf nicht.

Halte solche Fälle stattdessen an der Stunde fest: prioritaet auf „optional", und in
notizen, worum es geht und wovon die Entscheidung abhängt. Dann taucht die Frage
genau dann wieder auf, wenn sie beantwortbar ist.

Weiteres Vorgehen:
- Erstelle keine Duplikate. Prüfe mit readPlan, was schon da ist.
- Änderungen an bestehenden Stunden schreibst du mit updateStunde, wenn ihr euch
  einig seid. Was noch offen ist, gehört in notizen — das sieht sie im Stunden-Editor.
- Phasen und Feinplanung gehören nicht hierher. Hier geht es um Stundenthemen,
  Abfolge und Materialzuordnung.
- Arbeite an dem, was gerade Thema ist. Kurze Antworten sind die Regel, lange die
  Ausnahme.`;
  } else {
    // Block-Chat: Reihen planen
    const blockInfo = `„${block.titel}"${block.stundenGesamt ? ' (' + block.stundenGesamt + ' Stunden)' : ''}`;
    const notizInfo = block.notizen ? `\nNotizen der Lehrerin zu diesem Block:\n${block.notizen}\n` : '';
    tools = PC_TOOLS;
    system = `Du bist Planungsassistentin für ${fachName} Jahrgang ${fp.jahrgang} an einem NRW-Gymnasium.
Dein Auftrag: Plane Unterrichtsreihen für den Block ${blockInfo}.${notizInfo}${grundlagenBlock}
Gehe immer so vor:
1. Rufe readPlan, readKLP und readDatenbank je einmal auf – zu Beginn. readDatenbank ohne thema liefert eine Übersicht, welche Quelle welche Themen wie stark abdeckt; für die Reihenstruktur reicht das. Nur wenn du für eine bestimmte Reihe wissen musst, was konkret vorliegt, rufe readDatenbank ein zweites Mal mit thema auf. Nicht mehr als drei solcher Nachfragen, und keine ohne Anlass.
2. Werte das Materialangebot aus readDatenbank aus: Welche Themen sind durch vorhandenes Material gut abgedeckt? Stundenverläufe (inhaltstyp stundenverlauf) sind ausgearbeitete Unterrichtskonzepte — ein Thema mit einem Stundenverlauf ist besonders gut ausgestattet. Orientiere die Reihenstruktur am tatsächlich vorhandenen Material — gut ausgestattete Themen verdienen eine eigene Reihe, schwach ausgestattete können zusammengefasst oder als Hinweis markiert werden. Der KLP (readKLP) ist Hintergrundwissen, keine Vorgabe: Wenn das vorhandene Material oder die Notizen der Lehrerin bewusst von der KLP-Reihenfolge oder -Schwerpunktsetzung abweichen, folge dem Material und den Notizen — versuche nicht, die Struktur wieder an den KLP anzugleichen.
3. Prüfe, welche Reihen bereits vorhanden sind. Erstelle KEINE Duplikate bestehender Reihen.
4. Wenn der Block bereits vollständig geplant ist, bestätige das kurz – lege nichts Neues an.
5. Wenn Reihen fehlen: Plane die fehlende Struktur durch, dann erstelle sie mit createReihe (stundenAnzahl immer angeben).
Blöcke legt die Lehrerin manuell an – lege keine neuen Blöcke an.`;
  }

  system += anrede + materialBlock;   // gilt für alle drei Ebenen

  try {
    while (true) {
      _pcAbort = new AbortController();
      const resp = await callKIAgent({ messages: _pcApi, tools, system, maxTokens: 8192,
        label: 'planungs-agent', signal: _pcAbort.signal });
      _pcAbort = null;

      _pcApi.push({ role: 'assistant', content: resp.content });

      const textBlock = resp.content.find(b => b.type === 'text');
      const toolUses  = resp.content.filter(b => b.type === 'tool_use');

      if (textBlock) { thinkMsg.text = textBlock.text; _pcRender(); }

      if (resp.stop_reason === 'end_turn' || !toolUses.length) {
        thinkMsg.isThinking = false;
        _pcRender();
        break;
      }

      // Stopp direkt vor den Tools: nichts mehr anlegen, was du nicht willst.
      if (_pcStop) { _pcAbbruchAnzeigen(thinkMsg); break; }

      const results = [];
      for (const tu of toolUses) {
        // Detail vor der Ausführung bestimmen — danach ist Gelöschtes weg
        const tc = { name: tu.name, detail: _pcToolDetail(tu.name, tu.input, fp), laeuft: true };
        thinkMsg.toolCalls.push(tc);
        _pcRender();
        const res = await _pcExecTool(tu.name, tu.input, fp);
        tc.laeuft = false;
        _pcRender();
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: res });
        if (_pcStop) break;   // Rest der Tool-Liste nicht mehr ausführen
      }

      if (_pcStop) {
        // Die Historie muss zu jedem tool_use ein tool_result enthalten, sonst
        // lehnt die API den nächsten Aufruf ab. Fehlende nachtragen.
        toolUses.slice(results.length).forEach(tu => {
          results.push({ type: 'tool_result', tool_use_id: tu.id,
            content: 'Von der Lehrerin abgebrochen — nicht ausgeführt.' });
        });
        _pcApi.push({ role: 'user', content: results });
        _pcAbbruchAnzeigen(thinkMsg);
        break;
      }

      _pcApi.push({ role: 'user', content: results });
    }
  } catch (e) {
    thinkMsg.isThinking = false;
    if (e.message === KI_ABBRUCH) {
      // Abgebrochene Antwort: es gibt keinen assistant-Zug dazu, die Historie
      // bleibt also gültig. Der Verlauf endet mit der Nutzerfrage.
      _pcAbbruchAnzeigen(thinkMsg);
    } else {
      thinkMsg.text = (thinkMsg.text ? thinkMsg.text + '\n\n' : '') + '⚠ Fehler: ' + e.message;
    }
    _pcRender();
  }

  _pcAbort = null;
  _pcStop = false;
  _pcRunning = false;
  _pcRender();
  _pcPersist(stunde ? (stunde.titel || 'Stunde')
    : (einheit ? einheit.titel : (reihe ? reihe.titel : block.titel)));
}

// Das Chatfeld scrollt für sich. Ist es am Ende angekommen, hört der Browser
// erst nach einer Pause auf, die Bewegung darin festzuhalten — man muss die
// Maus aus dem Chat herausbewegen, um die Seite zu scrollen. Hier wird der
// Rest der Bewegung stattdessen direkt an die Seite weitergegeben.
function _pcScrollWeiterreichen(el) {
  el.addEventListener('wheel', function (e) {
    if (e.ctrlKey) return;                       // Zoom-Geste nicht anfassen
    // Das Trackpad scrollt in Bruchteilen: scrollTop steht dann auf 0.4 statt
    // auf 0, und eine Prüfung auf „genau am Anfang" greift nie. Deshalb 2px
    // Spielraum an beiden Enden.
    const rest = el.scrollHeight - el.clientHeight - el.scrollTop;
    const amEnde   = e.deltaY > 0 && rest <= 2;
    const amAnfang = e.deltaY < 0 && el.scrollTop <= 2;
    if (!amEnde && !amAnfang) return;            // im Chat ist noch Weg
    const seite = document.querySelector('.content');
    if (!seite) return;
    // deltaY kommt je nach Maus und Browser in Pixeln, Zeilen oder Seiten.
    // Ungerechnet wären das bei einem klassischen Mausrad drei Pixel.
    const faktor = e.deltaMode === 1 ? 16          // Zeilen
                 : e.deltaMode === 2 ? seite.clientHeight   // Seiten
                 : 1;                              // Pixel
    seite.scrollTop += e.deltaY * faktor;
    e.preventDefault();
  }, { passive: false });
}

function _pcBuildChatUI(wrap, sendFn, placeholder, planAllFn) {
  // Einklappen: der Chat steht unter dem Plan und verdeckt ihn beim Scrollen.
  // Zugeklappt bleibt nur die Überschrift stehen. Der Zustand hängt am Chat,
  // nicht an der Seite, und überlebt darum einen Reload.
  const zuKey = 'chatZu_' + _pcChatKey;
  const zu = !!S.open[zuKey];

  const hdr = wrap.querySelector('.card-hdr');
  if (hdr) {
    hdr.style.cursor = 'pointer';
    hdr.title = zu ? 'Chat aufklappen' : 'Chat einklappen';
    const pfeil = tx('span', 'pc-klapp', zu ? '▸' : '▾');
    hdr.insertBefore(pfeil, hdr.firstChild);
    hdr.onclick = () => { S.open[zuKey] = !zu; render(); };

    if (!zu) {
      const neu = btn('↺ Verlauf verwerfen', 'btn btn-ghost btn-xs pc-neu');
      neu.title = 'Gespräch löschen und neu ansetzen — an der Planung ändert sich nichts';
      neu.onclick = (e) => {
        e.stopPropagation();          // sonst klappt der Kopf zu
        if (_pcRunning) return;
        if (!_pcMsgs.length) return;
        if (!confirm('Diesen Gesprächsverlauf verwerfen?\n\n'
          + _pcMsgs.length + ' Nachrichten werden gelöscht. Angelegte Reihen, Stunden '
          + 'und Materialzuordnungen bleiben bestehen — nur das Gespräch ist weg.')) return;
        _pcVerlaufVerwerfen();
      };
      hdr.appendChild(neu);
    }
  }
  if (zu) return;   // Körper gar nicht erst aufbauen

  const body = mk('div', 'card-body pc-body');

  const msgs = mk('div', 'pc-messages');
  msgs.id = 'pc-messages';
  _pcScrollWeiterreichen(msgs);
  body.appendChild(msgs);

  const inputRow = mk('div', 'pc-input-row');
  const ta = document.createElement('textarea');
  ta.id = 'pc-input'; ta.className = 'finp pc-input';
  ta.placeholder = placeholder; ta.rows = 3;
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFn(); } };

  const sendBtn = btn('Senden ↵', 'btn btn-primary btn-sm');
  sendBtn.id = 'pc-send';
  sendBtn.onclick = () => { if (_pcRunning) _pcStoppen(); else sendFn(); };

  inputRow.appendChild(ta);
  inputRow.appendChild(sendBtn);
  body.appendChild(inputRow);

  // Der frühere Auto-Start als ausdrückliche Aktion
  if (planAllFn) {
    const planRow = mk('div', '');
    planRow.style.cssText = 'display:flex;justify-content:flex-end;margin-top:6px;';
    const planBtn = btn('Komplett durchplanen', 'btn btn-ghost btn-xs');
    planBtn.id = 'pc-planall';
    planBtn.title = 'Die KI plant in einem Zug durch, ohne Rückfragen.';
    planBtn.onclick = planAllFn;
    planRow.appendChild(planBtn);
    body.appendChild(planRow);
  }

  wrap.appendChild(body);
}

function buildBlockChat(fp, block) {
  const key = _pcKey('block', block.id);
  if (_pcChatKey !== key) {
    _pcChatKey = key;
    _pcFpId = fp.id; _pcBlockId = block.id; _pcReiheId = null;
    _pcEinheitId = null; _pcFeinModus = false;
    _pcRunning = false;
    _pcLoadedKey = null;
  }
  _pcEnsureLoaded(key);

  const wrap = mk('div', 'pc-wrap card');
  const hdr = cardHdr('✨ Reihen planen');
  hdr.appendChild(tx('span', 'pc-hdr-sub', block.titel + (block.stundenGesamt ? ' · ' + block.stundenGesamt + ' Std.' : '')));
  wrap.appendChild(hdr);

  _pcBuildChatUI(wrap, () => {
    const ta = document.getElementById('pc-input');
    const text = ta ? ta.value.trim() : '';
    if (!text || _pcRunning) return;
    ta.value = '';
    _pcSend(fp, { block }, text);
  }, 'z.B. „Füge eine weitere Reihe mit Schülerversuch hinzu."',
  () => {
    if (_pcRunning) return;
    _pcSend(fp, { block }, 'Analysiere den Block und erstelle einen vollständigen Reihenplan.');
  });

  // Erst zeichnen, wenn das Element im Dokument hängt — beim Bauen ist es noch los.
  setTimeout(_pcRender, 0);
  return wrap;
}

function buildReiheChat(fp, block, reihe) {
  const key = _pcKey('reihe', reihe.id);
  if (_pcChatKey !== key) {
    _pcChatKey = key;
    _pcFpId = fp.id; _pcBlockId = block.id; _pcReiheId = reihe.id;
    _pcEinheitId = null; _pcFeinModus = false;
    _pcRunning = false;
    _pcLoadedKey = null;
  }
  _pcEnsureLoaded(key);

  const wrap = mk('div', 'pc-wrap card');
  const hdr = cardHdr('✨ Stunden planen');
  hdr.appendChild(tx('span', 'pc-hdr-sub', reihe.titel + (reihe.stundenAnzahl ? ' · ' + reihe.stundenAnzahl + ' Std.' : '')));
  wrap.appendChild(hdr);

  _pcBuildChatUI(wrap, () => {
    const ta = document.getElementById('pc-input');
    const text = ta ? ta.value.trim() : '';
    if (!text || _pcRunning) return;
    ta.value = '';
    _pcSend(fp, { block, reihe }, text);
  }, 'z.B. „Ich habe ein Arbeitsblatt zu X — wo passt das hin?"',
  () => {
    if (_pcRunning) return;
    _pcSend(fp, { block, reihe }, 'Analysiere die Reihe und erstelle einen vollständigen Stundenplan.');
  });

  // Erst zeichnen, wenn das Element im Dokument hängt — beim Bauen ist es noch los.
  setTimeout(_pcRender, 0);
  return wrap;
}

// einheit = Gruppen-Objekt, oder null für die Feinplanung der ganzen Reihe
// einheit : Gruppe, oder null für die ganze Reihe
// stunde  : optional — dann dreht sich das Gespräch um genau diese Stunde und
//           bekommt einen eigenen Verlauf. Aufgerufen aus der Stundenansicht.
function buildEinheitChat(fp, block, reihe, einheit, stunde) {
  const key = stunde
    ? _pcKey('stunde', stunde.id)
    : _pcKey('einheit', einheit ? einheit.id : reihe.id);
  if (_pcChatKey !== key) {
    _pcChatKey = key;
    _pcFpId = fp.id; _pcBlockId = block.id; _pcReiheId = reihe.id;
    _pcEinheitId = einheit ? einheit.id : null;
    _pcFeinModus = true;
    _pcRunning = false;
    _pcLoadedKey = null;
  }
  _pcEnsureLoaded(key);

  const eigene = einheit
    ? (reihe.stunden || []).filter(s => s.einheitId === einheit.id)
    : (reihe.stunden || []);
  const std = summeStundenEinheiten(eigene);

  const wrap = mk('div', 'pc-wrap card');
  const hdr = cardHdr('💬 Feinplanung');
  hdr.appendChild(tx('span', 'pc-hdr-sub', stunde
    ? (stunde.titel || 'Stunde') + ' · ' + reihe.titel
    : (einheit
        ? einheit.titel + ' · ' + std + ' Std. · ' + reihe.titel
        : reihe.titel + ' · ' + std + ' Std. · ganze Reihe')));
  wrap.appendChild(hdr);

  // Kein „Komplett durchplanen" — auf dieser Ebene wird besprochen, nicht abgearbeitet.
  _pcBuildChatUI(wrap, () => {
    const ta = document.getElementById('pc-input');
    const text = ta ? ta.value.trim() : '';
    if (!text || _pcRunning) return;
    ta.value = '';
    // id: null signalisiert „ganze Reihe" — der Prompt formuliert entsprechend
    _pcSend(fp, { block, reihe, einheit: einheit || { id: null, titel: reihe.titel }, stunde }, text);
  }, stunde
      ? 'z.B. „Schau mal, ob in der Datenbank Material für diese Stunde liegt."'
      : 'z.B. „Schau dir Stunde 2 an — der Einstieg kommt mir zu lang vor."');

  setTimeout(_pcRender, 0);
  return wrap;
}
