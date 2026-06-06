// ── Einstellungen ────────────────────────────────────────────────
function viewEinstellungen() {
  const div = mk('div', '');
  const hdr = mk('div', 'c-hdr');
  hdr.appendChild(tx('div', 'c-title', 'Technische Einstellungen'));
  div.appendChild(hdr);

  // ── Technische Einstellungen ──────────────────────────────────

  function keyField(label, storageKey, placeholder, isSecret = true, hint = '') {
    const fg = mk('div', 'fg');
    fg.appendChild(tx('label', 'fl', label));
    const wrap = mk('div', ''); wrap.style.cssText = 'display:flex;gap:8px;align-items:center;';
    const inp = document.createElement('input');
    inp.type = isSecret ? 'password' : 'text'; inp.className = 'finp';
    inp.placeholder = placeholder; inp.value = localStorage.getItem(storageKey) || '';
    inp.style.flex = '1';
    const saveBtn = btn('Speichern', 'btn btn-pri btn-sm');
    saveBtn.onclick = () => {
      const val = inp.value.trim();
      if (val) { localStorage.setItem(storageKey, val); saveBtn.textContent = '✓ Gespeichert'; }
      else { localStorage.removeItem(storageKey); saveBtn.textContent = '✓ Gelöscht'; }
      setTimeout(() => { saveBtn.textContent = 'Speichern'; }, 2000);
    };
    wrap.appendChild(inp); wrap.appendChild(saveBtn);
    fg.appendChild(wrap);
    if (hint) { const h = tx('div', '', hint); h.style.cssText = 'font-size:11px;color:var(--tx3);margin-top:4px;'; fg.appendChild(h); }
    return fg;
  }

  // KI-Keys
  const aiCard = mk('div', 'card');
  aiCard.appendChild(cardHdr('KI-Schnittstellen'));
  const aib = mk('div', 'card-body');
  aib.appendChild(keyField('Anthropic API-Key (Claude)', 'ant_key', 'sk-ant-...', true, 'Wird nur lokal gespeichert – verlässt dieses Gerät nicht.'));
  aib.appendChild(keyField('OpenAI API-Key', 'oai_key', 'sk-proj-...', true, 'Wird nur lokal gespeichert – verlässt dieses Gerät nicht.'));

  // Modell-Tester
  const modelTestRow = mk('div', ''); modelTestRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap;';
  const MODELS_TO_TEST = [
    { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
    { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6' },
  ];
  const modelTestStatus = tx('span', '', ''); modelTestStatus.style.cssText = 'font-size:12px;color:var(--tx2);';
  MODELS_TO_TEST.forEach(({ id, label }) => {
    const b = btn('🔍 ' + label + ' testen', 'btn btn-ghost btn-sm');
    b.onclick = async () => {
      const key = localStorage.getItem('ant_key');
      if (!key) { modelTestStatus.textContent = '⚠ Kein API-Key hinterlegt.'; modelTestStatus.style.color = '#d97706'; return; }
      b.disabled = true; modelTestStatus.textContent = '⏳ Teste ' + label + '…'; modelTestStatus.style.color = 'var(--tx2)';
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
          body: JSON.stringify({ model: id, max_tokens: 16, messages: [{ role: 'user', content: 'Hi' }] }),
        });
        const d = await res.json();
        if (res.ok) {
          modelTestStatus.textContent = '✓ ' + label + ' funktioniert.';
          modelTestStatus.style.color = 'var(--grn)';
        } else {
          modelTestStatus.textContent = label + ': ' + res.status + ' – ' + (d.error?.message || d.error?.type || res.statusText);
          modelTestStatus.style.color = '#dc2626';
        }
      } catch(e) {
        modelTestStatus.textContent = label + ': Netzwerkfehler – ' + e.message;
        modelTestStatus.style.color = '#dc2626';
      }
      b.disabled = false;
    };
    modelTestRow.appendChild(b);
  });
  modelTestRow.appendChild(modelTestStatus);
  aib.appendChild(modelTestRow);
  aiCard.appendChild(aib);
  div.appendChild(aiCard);

  // R2-Zugangsdaten
  const r2Card = mk('div', 'card');
  r2Card.appendChild(cardHdr('Cloudflare R2 – Materialspeicher'));
  const r2b = mk('div', 'card-body');
  r2b.appendChild(keyField('S3 Endpoint', 'r2_endpoint', 'https://xxxx.r2.cloudflarestorage.com', false));
  r2b.appendChild(keyField('Bucket-Name', 'r2_bucket', 'unterrichtsplaner-materialien', false));
  r2b.appendChild(keyField('Access Key ID', 'r2_access_key', 'xxxxxxxxxxxx', false));
  r2b.appendChild(keyField('Secret Access Key', 'r2_secret_key', '••••••••••••••••••••', true));
  r2b.appendChild(keyField('Öffentliche URL (optional)', 'r2_public_url', 'https://pub-xxxx.r2.dev', false));
  const r2hint = tx('div', '', '💡 Bucket muss CORS für diese Seite erlauben. Öffentliche URL nur nötig wenn Dateien direkt verlinkt werden sollen.');
  r2hint.style.cssText = 'font-size:11px;color:var(--tx3);margin-top:8px;';
  r2b.appendChild(r2hint);
  const testRow = mk('div', ''); testRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:12px;';
  const testBtn = btn('Verbindung testen', 'btn btn-ghost btn-sm');
  const testStatus = tx('span', '', ''); testStatus.style.cssText = 'font-size:12px;';
  testBtn.onclick = async () => {
    testBtn.disabled = true; testStatus.textContent = '…'; testStatus.style.color = 'var(--tx3)';
    try {
      await r2Upload('_test.txt', new Blob(['ok'], { type: 'text/plain' }), 'text/plain');
      await r2Delete('_test.txt');
      testStatus.textContent = '✓ Verbindung erfolgreich'; testStatus.style.color = 'var(--grn)';
    } catch(e) { testStatus.textContent = '✗ ' + e.message; testStatus.style.color = '#dc2626'; }
    testBtn.disabled = false;
  };
  testRow.appendChild(testBtn); testRow.appendChild(testStatus);
  r2b.appendChild(testRow);
  r2Card.appendChild(r2b);
  div.appendChild(r2Card);

  // ── KI-Wissenszuordnung ───────────────────────────────────────
  const KI_ROUTING = [
    {
      name: 'Reihen / Stunden vorschlagen',
      ort: 'Fachplanung · Notizen-Karte',
      ebenen: ['reihe', 'stunde'],
      werkzeuge: false,
      hinweis: '„reihe" wenn Blöcke geplant werden, „stunde" + „reihe" wenn Reihen geplant werden',
    },
    {
      name: 'Nächste Stunde planen',
      ort: 'Stundenansicht · Header-Button',
      ebenen: ['stunde', 'reihe'],
      werkzeuge: false,
    },
    {
      name: 'Methoden vorschlagen (alle 3 Phasen)',
      ort: 'Stundenansicht · Sektion 3 Methoden',
      ebenen: ['stunde'],
      werkzeuge: true,
      hinweis: 'Heuristiken und Darstellungsformen aus Werkzeugen werden mitgegeben',
    },
    {
      name: 'Phasen generieren (KI)',
      ort: 'Stundenansicht · Sektion 5 Phasen',
      ebenen: ['stunde'],
      werkzeuge: true,
      hinweis: 'Heuristiken und Darstellungsformen aus Werkzeugen werden mitgegeben',
    },
    {
      name: 'Planungsrahmen ausfüllen',
      ort: 'Stundenansicht · Sektion 4',
      ebenen: ['stunde'],
      werkzeuge: false,
    },
  ];

  const wzCard = mk('div', 'card');
  wzCard.appendChild(cardHdr('KI-Wissenszuordnung'));
  const wzb = mk('div', 'card-body');

  const wzHint = tx('div', '', 'Hier siehst du, welche Didaktik-Bausteine jeder KI-Button aus der Wissensdatenbank zieht. Klicke auf „Vorschau" um den exakten Text zu sehen, der der KI mitgegeben wird.');
  wzHint.style.cssText = 'font-size:13px;color:var(--tx2);margin-bottom:14px;line-height:1.5;';
  wzb.appendChild(wzHint);

  const tbl = document.createElement('table');
  tbl.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['KI-Funktion', 'Wo', 'Planungsebenen', 'Bausteine', ''].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    th.style.cssText = 'padding:6px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.4px;background:var(--surf2);border-bottom:2px solid var(--bord);';
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');
  KI_ROUTING.forEach((r, i) => {
    const ctx = getDIDContext(r.ebenen, [], r.werkzeuge || false);
    const bausteinAnz = ctx ? ctx.split('\n').filter(l => l.startsWith('•') || l.startsWith('→') || l.startsWith('Heuristiken') || l.startsWith('Darstellungs')).length : 0;

    const tr = document.createElement('tr');
    tr.style.cssText = i % 2 === 0 ? '' : 'background:var(--surf2);';

    const tdName = document.createElement('td'); tdName.style.cssText = 'padding:8px 10px;vertical-align:top;font-weight:600;';
    tdName.textContent = r.name;
    if (r.hinweis) {
      const h = tx('div', '', r.hinweis); h.style.cssText = 'font-size:11px;color:var(--tx3);font-weight:400;margin-top:2px;';
      tdName.appendChild(h);
    }
    tr.appendChild(tdName);

    const tdOrt = document.createElement('td'); tdOrt.style.cssText = 'padding:8px 10px;vertical-align:top;color:var(--tx2);font-size:12px;';
    tdOrt.textContent = r.ort;
    tr.appendChild(tdOrt);

    const tdEbenen = document.createElement('td'); tdEbenen.style.cssText = 'padding:8px 10px;vertical-align:top;';
    r.ebenen.forEach(e => {
      const b = tx('span', 'did-ebene-badge', e);
      b.style.background = (PLANUNGSEBENE_FARBE?.[e] || '#94a3b8') + '22';
      b.style.color = PLANUNGSEBENE_FARBE?.[e] || '#94a3b8';
      b.style.marginRight = '4px';
      tdEbenen.appendChild(b);
    });
    if (r.werkzeuge) {
      const wb = tx('span', 'did-thema-badge', '+ Werkzeuge');
      wb.style.marginRight = '4px';
      tdEbenen.appendChild(wb);
    }
    tr.appendChild(tdEbenen);

    const tdAnz = document.createElement('td'); tdAnz.style.cssText = 'padding:8px 10px;vertical-align:top;text-align:center;';
    const anzEl = tx('span', '', bausteinAnz > 0 ? bausteinAnz + '' : '–');
    anzEl.style.cssText = bausteinAnz > 0 ? 'font-weight:700;color:var(--grn);' : 'color:var(--tx3);';
    tdAnz.appendChild(anzEl);
    tr.appendChild(tdAnz);

    const tdBtn = document.createElement('td'); tdBtn.style.cssText = 'padding:8px 10px;vertical-align:top;';
    const prevBtn = btn('Vorschau', 'btn btn-ghost btn-xs');
    prevBtn.onclick = () => {
      const existing = tbl.querySelector('.ki-wz-preview');
      if (existing && existing.dataset.row === String(i)) { existing.remove(); return; }
      tbl.querySelectorAll('.ki-wz-preview').forEach(el => el.remove());
      const previewTr = document.createElement('tr');
      previewTr.className = 'ki-wz-preview';
      previewTr.dataset.row = String(i);
      const previewTd = document.createElement('td');
      previewTd.colSpan = 5;
      previewTd.style.cssText = 'padding:0;';
      const pre = document.createElement('pre');
      pre.style.cssText = 'margin:0;padding:10px 14px;background:#f8faff;border-top:1px solid var(--bord);border-bottom:1px solid var(--bord);font-size:11px;color:var(--tx2);white-space:pre-wrap;line-height:1.6;max-height:200px;overflow-y:auto;';
      pre.textContent = ctx || '(Didaktik-Datenbank ist leer – keine Bausteine verfügbar)';
      previewTd.appendChild(pre);
      previewTr.appendChild(previewTd);
      tr.after(previewTr);
    };
    tdBtn.appendChild(prevBtn);
    tr.appendChild(tdBtn);

    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  wzb.appendChild(tbl);

  const leerHint = tx('div', '', DIDARTDB.length === 0 ? '⚠ Die Didaktik-Wissensdatenbank ist noch leer. Füge Artikel hinzu damit hier Bausteine angezeigt werden.' : `✓ ${DIDARTDB.length} Artikel in der Wissensdatenbank`);
  leerHint.style.cssText = 'font-size:12px;margin-top:12px;color:' + (DIDARTDB.length === 0 ? 'var(--tx3)' : 'var(--grn)') + ';';
  wzb.appendChild(leerHint);

  wzCard.appendChild(wzb);
  div.appendChild(wzCard);

  // ── Datenbank-Migration ──────────────────────────────────────
  const migCard = mk('div', 'card');
  migCard.style.marginTop = '24px';
  migCard.appendChild(cardHdr('Supabase-Tabellen: Migration'));
  const migBody = mk('div', 'card-body');

  const migHint = tx('div', '', 'Überträgt SCHULBUCHDB und MATDB einmalig in echte Supabase-Tabellen für Volltextsuche. Bestehende Zeilen werden aktualisiert (upsert).');
  migHint.style.cssText = 'font-size:12px;color:var(--tx3);margin-bottom:12px;';
  migBody.appendChild(migHint);

  const migRow = mk('div', ''); migRow.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;';
  const migStatus = tx('span', '', ''); migStatus.style.cssText = 'font-size:12px;color:var(--tx2);';

  async function runMigration(what) {
    migStatus.style.color = 'var(--tx2)';
    try {
      if (what === 'schulbuch' || what === 'all') {
        migStatus.textContent = '⏳ Schulbücher werden übertragen…';
        const rows = [];
        (SCHULBUCHDB || []).forEach(buch => {
          const jahrgang = Array.isArray(buch.jahrgang) ? buch.jahrgang[0] : (buch.jahrgang || null);
          const addAufgaben = (kap, ukId, ukTitel) => {
            (kap.aufgaben || []).forEach(a => {
              if (!a.id && !a.inhalt && !a.thema) return;
              rows.push({
                id: a.id || (buch.id + '_' + (kap.id||'') + '_' + (a.seite||'') + '_' + (a.nr||Math.random())),
                fach: buch.fach || null,
                buch: buch.titel,
                kapitel_id: kap.id || null,
                kapitel_titel: kap.titel || null,
                uk_id: ukId || null,
                uk_titel: ukTitel || null,
                seite: a.seite || null,
                nr: a.nr ? String(a.nr) : null,
                typ: a.typ || null,
                thema: a.thema || null,
                inhalt: a.inhalt || a.aufgabenstellung || a.text || null,
                jahrgang: typeof jahrgang === 'number' ? jahrgang : (parseInt(jahrgang) || null),
                anforderung: a.anforderung || null,
                operator: a.operator || null,
                umfang: a.umfang || null,
                schwierigkeit: a.schwierigkeitsstufe || null,
              });
            });
          };
          (buch.kapitel || []).forEach(kap => {
            addAufgaben(kap, null, null);
            (kap.unterkapitel || []).forEach(u => addAufgaben(u, u.id, u.titel));
          });
        });
        const dedupedRows = [...new Map(rows.map(r => [r.id, r])).values()];
        if (dedupedRows.length) {
          await sbInsert('schulbuch_aufgaben', dedupedRows);
          migStatus.textContent = `✓ ${dedupedRows.length} Schulbuch-Aufgaben übertragen (${rows.length - dedupedRows.length} Duplikate übersprungen).`;
        } else {
          migStatus.textContent = '⚠ Keine Schulbuch-Aufgaben gefunden.';
        }
      }
      if (what === 'mat' || what === 'all') {
        migStatus.textContent = '⏳ Materialien werden übertragen…';
        const rows = (MATDB || []).map(m => ({
          id: m.id,
          dateiname: m.dateiname || m.titel || null,
          r2_pfad: m.r2Key || m.pfad || null,
          fach: m.fach || null,
          titel: m.titel || null,
          themen: Array.isArray(m.themen) ? m.themen : [],
          jahrgang: Array.isArray(m.jahrgang) ? m.jahrgang : (m.jahrgang ? [String(m.jahrgang)] : []),
          beschreibung: m.beschreibung || m.kurzinhalt || null,
          rolle: m.rolleImKontext || m.rolle || null,
          unterrichtsphase: m.unterrichtsphase || null,
          kognitive_beanspruchung: m.kognitiveBeanspruchung || null,
          hat_loesung: m.hatLoesung ?? null,
        })).filter(m => m.id);
        if (rows.length) {
          await sbInsert('materialien', rows);
          migStatus.textContent = `✓ ${rows.length} Materialien übertragen.`;
        } else {
          migStatus.textContent = '⚠ Keine Materialien gefunden.';
        }
      }
      if (what === 'all') {
        const [cntSA, cntMat] = await Promise.all([sbCount('schulbuch_aufgaben'), sbCount('materialien')]);
        migStatus.textContent = `✓ Fertig — ${cntSA ?? '?'} Schulbuch-Aufgaben, ${cntMat ?? '?'} Materialien in Supabase.`;
        migStatus.style.color = '#16a34a';
      }
    } catch(e) {
      migStatus.textContent = '✗ Fehler: ' + e.message;
      migStatus.style.color = '#dc2626';
    }
  }

  const btnSB = btn('Schulbücher migrieren', 'btn btn-ghost btn-sm');
  btnSB.onclick = () => runMigration('schulbuch');
  const btnMat = btn('Materialien migrieren', 'btn btn-ghost btn-sm');
  btnMat.onclick = () => runMigration('mat');
  const btnAll = btn('Alles migrieren', 'btn btn-pri btn-sm');
  btnAll.onclick = () => runMigration('all');
  migRow.appendChild(btnSB); migRow.appendChild(btnMat); migRow.appendChild(btnAll); migRow.appendChild(migStatus);
  migBody.appendChild(migRow);
  migCard.appendChild(migBody);
  div.appendChild(migCard);

  return div;
}

// ── Kurs-Einstellungen (eigene Ansicht) ───────────────────────────
function viewKursEinstellungen(kursId) {
  const kurs = (S.data.kurse || []).find(k => k.id === kursId);
  if (!kurs) return tx('div', '', 'Kurs nicht gefunden.');
  const fp = getFachplanung(kurs.fachplanungId);
  if (!kurs.ressourcen) kurs.ressourcen = {};
  const res = kurs.ressourcen;

  const div = mk('div', '');

  // Breadcrumb
  div.appendChild(breadcrumb([
    { label: 'Einstellungen', action: () => { S.view = 'einstellungen'; S.aktKursDetailId = null; render(); } },
  ]));

  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', kurs.klasse));
  left.appendChild(tx('div', 'c-sub', (fp ? fachLabel(fp.fach) + ' · Jg. ' + fp.jahrgang + ' · ' : '') + (kurs.schuljahr || '')));
  hdr.appendChild(left);
  const editBtn = btn('✏️ Bearbeiten', 'btn btn-ghost btn-sm');
  editBtn.onclick = () => { S.modal = { type: 'editKurs', data: { kurs } }; render(); };
  hdr.appendChild(editBtn);
  div.appendChild(hdr);

  const grid = mk('div', 'stunden-grid');
  div.appendChild(grid);

  // ── Ressourcen ────────────────────────────────────────────────
  const resCard = mk('div', 'card');
  resCard.appendChild(cardHdr('Ressourcen'));
  const resBody = mk('div', 'card-body');

  function resSection(title) {
    const h = tx('div', '', title);
    h.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin:14px 0 8px;';
    resBody.appendChild(h);
  }

  function resCheck(key, label, withTitle, titleKey, titlePlaceholder) {
    const row = mk('div', 'res-check-row');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!res[key];
    cb.onchange = () => { res[key] = cb.checked; scheduleSave(); if (withTitle) titleInp.style.display = cb.checked ? '' : 'none'; };
    const lbl = tx('label', 'res-check-label', label);
    lbl.prepend(cb);
    row.appendChild(lbl);
    if (withTitle) {
      const titleInp = document.createElement('input');
      titleInp.type = 'text'; titleInp.className = 'finp res-title-inp';
      titleInp.placeholder = titlePlaceholder || 'Titel…';
      titleInp.value = res[titleKey] || '';
      titleInp.style.display = res[key] ? '' : 'none';
      titleInp.oninput = e => { res[titleKey] = e.target.value; scheduleSave(); };
      row.appendChild(titleInp);
    }
    resBody.appendChild(row);
  }

  resSection('Schülermaterialien');
  resCheck('schulbuch',   'Schulbuch',  true, 'schulbuchTitel',   'Titel des Schulbuchs…');
  resCheck('arbeitsheft', 'Arbeitsheft', true, 'arbeitsheftTitel', 'Titel des Arbeitshefts…');
  resCheck('ipad',        'iPad / Tablet', false);
  resCheck('smartphone',  'Smartphone', false);
  resCheck('internet',    'Internetzugang', false);

  resSection('Raumausstattung');
  resCheck('beamer',     'Beamer / Projektor', false);
  resCheck('elmo',       'Elmo / Dokumentenkamera', false);
  resCheck('smartboard', 'Smartboard / Interaktives Whiteboard', false);

  resSection('Apps & Software');
  if (!res.apps) res.apps = [];
  const appsWrap = mk('div', 'res-apps-wrap');
  function renderApps() {
    appsWrap.innerHTML = '';
    res.apps.forEach((app, i) => {
      const chip = mk('div', 'res-app-chip');
      chip.appendChild(tx('span', '', app));
      const del = mk('button', ''); del.textContent = '✕'; del.style.cssText = 'border:none;background:none;cursor:pointer;color:var(--tx3);font-size:11px;padding:0 0 0 4px;';
      del.onclick = () => { res.apps.splice(i, 1); scheduleSave(); renderApps(); };
      chip.appendChild(del);
      appsWrap.appendChild(chip);
    });
    const addRow = mk('div', ''); addRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
    const appInp = document.createElement('input');
    appInp.type = 'text'; appInp.className = 'finp'; appInp.style.flex = '1';
    appInp.placeholder = 'App-Name…';
    const addBtn = btn('+ Hinzufügen', 'btn btn-ghost btn-xs');
    addBtn.onclick = () => {
      const v = appInp.value.trim();
      if (v && !res.apps.includes(v)) { res.apps.push(v); scheduleSave(); renderApps(); }
    };
    appInp.onkeydown = e => { if (e.key === 'Enter') addBtn.onclick(); };
    addRow.appendChild(appInp); addRow.appendChild(addBtn);
    appsWrap.appendChild(addRow);
  }
  renderApps();
  resBody.appendChild(appsWrap);

  resSection('Sonstiges');
  resBody.appendChild(fieldArea('', res.sonstiges || '', v => { res.sonstiges = v; scheduleSave(); }, '', 'Weitere Ressourcen, Besonderheiten…'));

  resCard.appendChild(resBody);
  resCard.classList.add('card-half');
  grid.appendChild(resCard);

  // ── Lerngruppenanalyse ────────────────────────────────────────
  const lgCard = mk('div', 'card card-half');
  lgCard.appendChild(cardHdr('Lerngruppenanalyse'));
  const lgBody = mk('div', 'card-body');
  if (!kurs.lerngruppe) kurs.lerngruppe = {};
  const lg = kurs.lerngruppe;

  function lgSec(title) {
    const h = tx('div', '', title);
    h.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin:14px 0 8px;';
    lgBody.appendChild(h);
  }
  function lgChips(label, key, options) {
    if (label) { const l = tx('div', '', label); l.style.cssText = 'font-size:12px;color:var(--tx2);margin-bottom:6px;'; lgBody.appendChild(l); }
    const wrap = mk('div', ''); wrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;';
    options.forEach(opt => {
      const b = mk('button', 'btn btn-xs ' + (lg[key] === opt ? 'btn-pri' : 'btn-ghost'));
      b.textContent = opt;
      b.onclick = () => { lg[key] = (lg[key] === opt ? null : opt); scheduleSave(); render(); };
      wrap.appendChild(b);
    });
    lgBody.appendChild(wrap);
  }
  function lgMulti(label, key, options) {
    if (!lg[key]) lg[key] = [];
    if (label) { const l = tx('div', '', label); l.style.cssText = 'font-size:12px;color:var(--tx2);margin-bottom:6px;'; lgBody.appendChild(l); }
    const wrap = mk('div', ''); wrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;';
    options.forEach(opt => {
      const active = lg[key].includes(opt);
      const b = mk('button', 'btn btn-xs ' + (active ? 'btn-pri' : 'btn-ghost'));
      b.textContent = opt;
      b.onclick = () => {
        if (lg[key].includes(opt)) lg[key] = lg[key].filter(x => x !== opt);
        else lg[key].push(opt);
        scheduleSave(); render();
      };
      wrap.appendChild(b);
    });
    lgBody.appendChild(wrap);
  }
  function lgText(label, key, placeholder) {
    lgBody.appendChild(fieldArea(label, lg[key] || '', v => { lg[key] = v; scheduleSave(); }, '', placeholder));
  }
  function lgNum(label, key) {
    const fg = mk('div', 'fg'); fg.style.display = 'inline-block'; fg.style.marginRight = '16px';
    fg.appendChild(tx('label', 'fl', label));
    const inp = document.createElement('input');
    inp.type = 'number'; inp.value = lg[key] || ''; inp.className = 'finp'; inp.style.maxWidth = '80px';
    inp.oninput = e => { lg[key] = e.target.value; scheduleSave(); };
    fg.appendChild(inp);
    lgBody.appendChild(fg);
  }

  lgSec('Strukturdaten');
  const numRow = mk('div', ''); numRow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;';
  ['Klassengröße:anzahl','davon w:anzahlW','davon m:anzahlM'].forEach(s => {
    const [label, key] = s.split(':');
    const fg = mk('div', 'fg'); fg.style.display = 'inline-block';
    fg.appendChild(tx('label', 'fl', label));
    const inp = document.createElement('input');
    inp.type = 'number'; inp.value = lg[key] || ''; inp.className = 'finp'; inp.style.maxWidth = '80px';
    inp.oninput = e => { lg[key] = e.target.value; scheduleSave(); };
    fg.appendChild(inp); numRow.appendChild(fg);
  });
  lgBody.appendChild(numRow);
  lgText('Raum / Ausstattung', 'raum', 'z.B. Chemieraum 204, Abzug vorhanden, Beamer');

  lgSec('Leistungsstand');
  lgChips('Allgemeines Leistungsniveau', 'leistung', ['eher schwach', 'heterogen', 'durchschnittlich', 'eher stark']);
  lgText('Erläuterung', 'leistungText', 'z.B. Oberes Drittel sehr stark, unteres Drittel zeigt Lücken…');

  lgSec('Lern- und Arbeitsverhalten');
  lgChips('Mitarbeit / Motivation', 'motivation', ['gering', 'uneinheitlich', 'gut', 'sehr aktiv']);
  lgChips('Konzentration / Arbeitstempo', 'tempo', ['langsam', 'variabel', 'zügig']);
  lgText('Erläuterung', 'lernverhaltenText', 'z.B. Tendenz zur Ablenkung, Gruppenarbeit funktioniert gut…');

  lgSec('Sozialverhalten');
  lgChips(null, 'sozial', ['angespannt', 'unauffällig', 'kooperativ']);
  lgText('Erläuterung', 'sozialText', 'z.B. Einzelne Konflikte zwischen Teilgruppen…');

  lgSec('Methodenkompetenz');
  lgMulti('Erfahrung mit Sozialformen / Methoden', 'methoden', ['Gruppenarbeit', 'Partnerarbeit', 'Stationsarbeit', 'Experimente', 'Schülerpräsentation', 'Think-Pair-Share']);

  lgSec('Motivation und Interesse');
  lgChips('Fachinteresse', 'fachinteresse', ['gering', 'uneinheitlich', 'vorhanden', 'ausgeprägt']);
  lgMulti('Bevorzugte Arbeitsweisen', 'arbeitsweisen', ['Experimente', 'Problemlösen', 'Kreatives Arbeiten', 'Diskussion', 'Digitale Medien']);

  lgSec('Sprachliche Voraussetzungen');
  lgChips('Fachsprachliche Kompetenz', 'fachsprache', ['gering', 'entwickelt sich', 'gut', 'sehr sicher']);
  lgMulti('Besonderheiten', 'sprachBesonderheiten', ['DaZ', 'Schwierigkeiten bei komplexen Aufgaben', 'Fachvokabular lückenhaft']);

  lgSec('Förderbedarf');
  lgMulti('Diagnostizierte Förderbedarfe', 'foerderung', ['LRS', 'DaZ', 'ADHS', 'Inklusion', 'Hochbegabung', 'Nachteilsausgleich']);
  lgText('Weitere Hinweise', 'besonderheitenText', 'Weitere relevante Informationen…');

  lgSec('Konsequenzen für die Planung');
  const aiRow = mk('div', ''); aiRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;';
  const aiBtn = btn('✨ KI → Konsequenzen ableiten', 'btn btn-ghost btn-sm');
  const aiStatus = tx('span', '', '');
  aiStatus.style.cssText = 'font-size:12px;color:var(--tx3);';
  aiRow.appendChild(aiBtn); aiRow.appendChild(aiStatus);
  lgBody.appendChild(aiRow);
  const konsTa = document.createElement('textarea');
  konsTa.className = 'finp'; konsTa.rows = 5; konsTa.style.width = '100%'; konsTa.style.resize = 'vertical';
  konsTa.placeholder = 'Was folgt aus der Analyse für die konkrete Planung?';
  konsTa.value = lg.konsequenzen || '';
  konsTa.oninput = e => { lg.konsequenzen = e.target.value; scheduleSave(); };
  lgBody.appendChild(konsTa);

  aiBtn.onclick = async () => {
    const key = localStorage.getItem('ant_key');
    if (!key) { alert('Kein Anthropic API-Key hinterlegt.'); return; }
    aiBtn.disabled = true; aiStatus.textContent = '…';
    try {
      let p = 'Du bist Fachleiter an einem NRW-Gymnasium. Leite aus der Lerngruppenanalyse konkrete didaktische Konsequenzen ab. Präzise, praxisnah, max. 200 Wörter.\n\n';
      p += 'Kurs: ' + kurs.klasse + (fp ? ' · ' + fachLabel(fp.fach) + ' Jg. ' + fp.jahrgang : '') + '\n';
      if (lg.anzahl) p += 'Klassengröße: ' + lg.anzahl + '\n';
      if (lg.leistung) p += 'Leistungsniveau: ' + lg.leistung + (lg.leistungText ? ' – ' + lg.leistungText : '') + '\n';
      if (lg.motivation) p += 'Mitarbeit: ' + lg.motivation + '\n';
      if (lg.tempo) p += 'Arbeitstempo: ' + lg.tempo + '\n';
      if (lg.sozial) p += 'Sozialverhalten: ' + lg.sozial + '\n';
      if (lg.methoden?.length) p += 'Methodenerfahrung: ' + lg.methoden.join(', ') + '\n';
      if (lg.fachinteresse) p += 'Fachinteresse: ' + lg.fachinteresse + '\n';
      if (lg.fachsprache) p += 'Fachsprache: ' + lg.fachsprache + '\n';
      if (lg.foerderung?.length) p += 'Förderbedarf: ' + lg.foerderung.join(', ') + '\n';
      if (lg.besonderheitenText) p += 'Besonderheiten: ' + lg.besonderheitenText + '\n';
      const res2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 600, messages: [{ role: 'user', content: p }] })
      });
      const d = await res2.json();
      lg.konsequenzen = d.content?.[0]?.text || '';
      konsTa.value = lg.konsequenzen;
      scheduleSave(); aiStatus.textContent = '✓';
    } catch(e) { aiStatus.textContent = 'Fehler: ' + e.message; }
    aiBtn.disabled = false;
  };

  lgCard.appendChild(lgBody);
  grid.appendChild(lgCard);

  return div;
}

// ── KLP-Ansicht ───────────────────────────────────────────────────
function viewKlp() {
  const div = mk('div', '');
  const hdr = mk('div', 'c-hdr');
  hdr.appendChild(tx('div', 'c-title', 'Kernlehrpläne NRW'));
  div.appendChild(hdr);

  if (!KLPDB.length) {
    div.appendChild(tx('div', 'empty-hint', 'Keine KLP-Daten geladen.'));
    return div;
  }

  const FACH_LABELS  = { 'Bio': 'Biologie', 'Ch': 'Chemie', 'M': 'Mathematik' };
  const FACH_COLOR   = { 'Bio': '#16a34a', 'Ch': '#d97706', 'M': '#2563eb' };
  const FACH_BG      = { 'Bio': '#f0fdf4', 'Ch': '#fffbeb', 'M': '#eff6ff' };

  function codeChip(code) {
    const chip = tx('span', 'klp-code-chip', code);
    const c = code[0].toUpperCase();
    if (c === 'U') chip.style.cssText = 'background:#dbeafe;color:#1e40af;';
    else if (c === 'E') chip.style.cssText = 'background:#d1fae5;color:#065f46;';
    else if (c === 'K') chip.style.cssText = 'background:#fef3c7;color:#92400e;';
    else if (c === 'B') chip.style.cssText = 'background:#ede9fe;color:#5b21b6;';
    else chip.style.cssText = 'background:#f3f4f6;color:#374151;';
    return chip;
  }

  const klpFaecher = [...new Set(KLPDB.map(e => e.fach))].sort();
  let klpFach = null, klpJg = null;

  // ── Filterleiste ─────────────────────────────────────────────
  const filterBar = mk('div', 'klp-filter-bar');

  const fachRow = mk('div', 'klp-filter-row');
  const jgRow   = mk('div', 'klp-filter-row');
  const searchInp = document.createElement('input');
  searchInp.type = 'text'; searchInp.className = 'finp';
  searchInp.placeholder = '🔍 Kompetenz oder Inhaltsfeld suchen…';
  searchInp.style.cssText = 'width:100%;';

  filterBar.appendChild(fachRow);
  filterBar.appendChild(jgRow);
  filterBar.appendChild(searchInp);
  div.appendChild(filterBar);

  const list = mk('div', 'klp-list');
  div.appendChild(list);

  function renderJgRow() {
    jgRow.innerHTML = '';
    const jgs = [...new Set(KLPDB.filter(e => !klpFach || e.fach === klpFach).map(e => e.jahrgang))].sort();
    if (!jgs.length) return;
    jgRow.appendChild(tx('span', 'klp-filter-label', 'Jahrgang'));
    jgs.forEach(jg => {
      const b = btn(jg, 'btn btn-xs ' + (klpJg === jg ? 'btn-pri' : 'btn-ghost'));
      b.onclick = () => { klpJg = klpJg === jg ? null : jg; renderJgRow(); renderList(); };
      jgRow.appendChild(b);
    });
  }

  function renderList() {
    list.innerHTML = '';
    const q = searchInp.value.trim().toLowerCase();
    if (!klpFach && !klpJg && !q) {
      list.appendChild(tx('div', 'empty-hint', 'Fach wählen oder Suchbegriff eingeben.'));
      return;
    }
    const entries = KLPDB.filter(e => {
      if (klpFach && e.fach !== klpFach) return false;
      if (klpJg  && e.jahrgang !== klpJg) return false;
      if (q) {
        const txt = (e.beschreibung + ' ' + e.inhaltsfeld + ' ' + e.kompetenzcodes.join(' ')).toLowerCase();
        if (!txt.includes(q)) return false;
      }
      return true;
    });
    if (!entries.length) { list.appendChild(tx('div', 'empty-hint', 'Keine Einträge gefunden.')); return; }

    const grouped = new Map();
    entries.forEach(e => {
      const key = e.fach + '|' + (e.inhaltsfeldNummer || e.inhaltsfeld);
      if (!grouped.has(key)) grouped.set(key, { fach: e.fach, if: e.inhaltsfeld, ifNr: e.inhaltsfeldNummer || '', list: [] });
      grouped.get(key).list.push(e);
    });

    // Bei Suche alles aufklappen, sonst zugeklappt starten
    const expandAll = !!q;

    grouped.forEach(g => {
      const color = FACH_COLOR[g.fach] || 'var(--pri)';
      const bg    = FACH_BG[g.fach]    || '#f8f8ff';
      let open = expandAll;

      const section = mk('div', 'klp-section');
      section.style.borderLeftColor = color;

      // ── Header ──
      const ghdr = mk('div', 'klp-section-hdr');
      ghdr.style.background = bg;
      ghdr.style.cursor = 'pointer';

      const arrow = tx('span', 'klp-arrow', open ? '▾' : '›');
      arrow.style.color = color;
      ghdr.appendChild(arrow);

      if (!klpFach) {
        const fb = tx('span', 'klp-fach-badge', FACH_LABELS[g.fach] || g.fach);
        fb.style.cssText = 'background:' + color + ';color:#fff;';
        ghdr.appendChild(fb);
      }
      const ifTitle = tx('span', 'klp-if-title', (g.ifNr ? 'IF ' + g.ifNr + ' · ' : '') + g.if);
      const count = tx('span', 'klp-if-count', g.list.length + ' Kompetenz' + (g.list.length !== 1 ? 'en' : ''));
      ghdr.appendChild(ifTitle);
      ghdr.appendChild(count);
      section.appendChild(ghdr);

      // ── Einträge ──
      const body = mk('div', 'klp-section-body');
      body.style.display = open ? '' : 'none';

      g.list.forEach(e => {
        const row = mk('div', 'klp-entry');
        const codesWrap = mk('div', 'klp-codes');
        e.kompetenzcodes.forEach(c => codesWrap.appendChild(codeChip(c)));
        const desc = tx('p', 'klp-desc', e.beschreibung);
        row.appendChild(codesWrap);
        row.appendChild(desc);
        if (!klpJg) {
          const jgPill = tx('span', 'klp-jg-pill', e.jahrgang);
          row.appendChild(jgPill);
        }
        body.appendChild(row);
      });

      ghdr.onclick = () => {
        open = !open;
        body.style.display = open ? '' : 'none';
        arrow.textContent = open ? '▾' : '›';
      };

      section.appendChild(body);
      list.appendChild(section);
    });
  }

  const fachBtns = {};
  fachRow.appendChild(tx('span', 'klp-filter-label', 'Fach'));
  klpFaecher.forEach(f => {
    const b = btn(FACH_LABELS[f] || f, 'btn btn-xs btn-ghost');
    b.onclick = () => {
      klpFach = klpFach === f ? null : f;
      klpJg = null;
      klpFaecher.forEach(x => { fachBtns[x].className = 'btn btn-xs ' + (klpFach === x ? 'btn-pri' : 'btn-ghost'); });
      renderJgRow();
      renderList();
    };
    fachBtns[f] = b;
    fachRow.appendChild(b);
  });

  searchInp.oninput = () => renderList();
  renderJgRow();
  renderList();
  return div;
}
