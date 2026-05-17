// ── Modal: Kurse & Fachplanungen ──────────────────────────────────
function modalHandlerKurse(type, data, m) {
  if (type === 'newFachplanung') {
    m.appendChild(tx('div', 'modal-title', 'Neue Fachplanung anlegen'));
    m.appendChild(modalSelect('mf', 'Fach', FAECHER.map(f => [f, fachLabel(f)])));
    m.appendChild(modalSelect('mj', 'Jahrgang', JAHRGAENGE.map(j => [j, j])));
    const footer = mk('div', 'modal-footer'); footer.appendChild(cancelBtn());
    const sv = btn('Anlegen', 'btn btn-pri');
    sv.onclick = () => {
      const f = document.getElementById('mf').value;
      const j = document.getElementById('mj').value;
      const nl = { id: uid(), fach: f, jahrgang: j, blocks: [] };
      S.data.fachplanungen.push(nl);
      S.aktFpId = nl.id; S.view = 'fachplanung'; S.sel = null;
      S.modal = null; scheduleSave(); render();
    };
    footer.appendChild(sv); m.appendChild(footer);
    return true;
  }

  if (type === 'newKurs') {
    m.appendChild(tx('div', 'modal-title', 'Neuen Kurs anlegen'));
    m.appendChild(modalInput('mk', 'Klasse (z.B. 7c, Q1)', ''));
    m.appendChild(modalSelect('mlp', 'Fachplanung', (S.data.fachplanungen||[]).map(lp=>[lp.id,fachLabel(lp.fach)+' Jg. '+lp.jahrgang])));
    m.appendChild(modalInput('msj', 'Schuljahr', '2025/26', '2025/26'));
    const footer = mk('div', 'modal-footer'); footer.appendChild(cancelBtn());
    const sv = btn('Anlegen', 'btn btn-pri');
    sv.onclick = () => {
      const kl = document.getElementById('mk').value.trim();
      if (!kl) return;
      const fpId = document.getElementById('mlp').value;
      const sj = document.getElementById('msj').value.trim();
      S.data.kurse.push({ id: uid(), klasse: kl, fachplanungId: fpId, schuljahr: sj });
      S.modal = null; scheduleSave(); render();
    };
    footer.appendChild(sv); m.appendChild(footer);
    return true;
  }

  if (type === 'editKurs') {
    const { kurs } = data;
    m.appendChild(tx('div', 'modal-title', 'Kurs bearbeiten'));
    m.appendChild(modalInput('mk', 'Klasse', kurs.klasse, kurs.klasse));
    m.appendChild(modalInput('msj', 'Schuljahr', kurs.schuljahr, kurs.schuljahr));
    m.appendChild(modalSelect('mlp', 'Fachplanung', (S.data.fachplanungen||[]).map(lp=>[lp.id,fachLabel(lp.fach)+' Jg. '+lp.jahrgang]), kurs.fachplanungId));
    const footer = mk('div', 'modal-footer'); footer.appendChild(cancelBtn());
    const sv = btn('Speichern', 'btn btn-pri');
    sv.onclick = () => {
      kurs.klasse = document.getElementById('mk').value.trim() || kurs.klasse;
      kurs.schuljahr = document.getElementById('msj').value.trim() || kurs.schuljahr;
      kurs.fachplanungId = document.getElementById('mlp').value;
      S.modal = null; scheduleSave(); render();
    };
    footer.appendChild(sv); m.appendChild(footer);
    return true;
  }

  if (type === 'addSlot') {
    m.appendChild(tx('div', 'modal-title', data.tag + ' · ' + data.stunde + '. Stunde'));
    const fg = mk('div', 'fg'); fg.appendChild(tx('label', 'fl', 'Kurs'));
    const kursSel = document.createElement('select'); kursSel.id = 'mks'; kursSel.className = 'finp';
    (S.data.kurse||[]).forEach(k=>{ const fp=getFachplanung(k.fachplanungId); const o=document.createElement('option'); o.value=k.id; o.textContent=k.klasse+(fp?' · '+fachLabel(fp.fach):''); kursSel.appendChild(o); });
    fg.appendChild(kursSel); m.appendChild(fg);
    m.appendChild(modalSelect('mkw', 'Wochenrhythmus', [['beide','Alle Wochen'],['gerade','Gerade KW'],['ungerade','Ungerade KW']]));
    const footer = mk('div', 'modal-footer'); footer.appendChild(cancelBtn());
    const sv = btn('Hinzufügen', 'btn btn-pri');
    sv.onclick = () => {
      const kursId = document.getElementById('mks').value;
      const kwTyp = document.getElementById('mkw').value;
      const kurs = (S.data.kurse||[]).find(k=>k.id===kursId);
      if (!kurs) return;
      if (!kurs.stundenplan) kurs.stundenplan = [];
      kurs.stundenplan.push({ tag: data.tag, stunde: data.stunde, kwTyp });
      S.modal = null; scheduleSave(); render();
    };
    footer.appendChild(sv); m.appendChild(footer);
    return true;
  }

  if (type === 'editSlot') {
    const fp = getFachplanung(data.kurs.fachplanungId);
    m.appendChild(tx('div', 'modal-title', data.kurs.klasse + (fp?' · '+fachLabel(fp.fach):'')));
    m.appendChild(modalSelect('mkw', 'Wochenrhythmus', [['beide','Alle Wochen'],['gerade','Gerade KW'],['ungerade','Ungerade KW']], data.slot.kwTyp||'beide'));
    const footer = mk('div', 'modal-footer');
    const del = btn('🗑 Stunde entfernen', 'btn btn-danger');
    del.onclick = () => { const sp=data.kurs.stundenplan; const idx=sp.indexOf(data.slot); if(idx>=0)sp.splice(idx,1); S.modal=null; scheduleSave(); render(); };
    footer.appendChild(del); footer.appendChild(cancelBtn());
    const sv = btn('Speichern', 'btn btn-pri');
    sv.onclick = () => { data.slot.kwTyp=document.getElementById('mkw').value; S.modal=null; scheduleSave(); render(); };
    footer.appendChild(sv); m.appendChild(footer);
    return true;
  }


  if (type === 'lerngruppe') {
    const { kurs } = data;
    if (!kurs.lerngruppe) kurs.lerngruppe = {};
    const lg = kurs.lerngruppe;
    const fp = getFachplanung(kurs.fachplanungId);

    m.style.maxWidth = '600px';
    m.appendChild(tx('div', 'modal-title', 'Lerngruppenanalyse · ' + kurs.klasse + (fp ? ' · ' + fachLabel(fp.fach) : '')));

    function lgSection(title) {
      const sec = mk('div', '');
      sec.style.cssText = 'margin-bottom:20px;';
      const h = tx('div', '', title);
      h.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;';
      sec.appendChild(h);
      return sec;
    }

    function lgChips(label, key, options) {
      const fg = mk('div', '');
      fg.style.marginBottom = '10px';
      if (label) { const l = tx('div', '', label); l.style.cssText = 'font-size:12px;color:var(--tx2);margin-bottom:6px;'; fg.appendChild(l); }
      const wrap = mk('div', ''); wrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
      options.forEach(opt => {
        const b = mk('button', 'btn btn-xs ' + (lg[key] === opt ? 'btn-pri' : 'btn-ghost'));
        b.textContent = opt;
        b.onclick = () => { lg[key] = (lg[key] === opt ? null : opt); scheduleSave(); render(); };
        wrap.appendChild(b);
      });
      fg.appendChild(wrap);
      return fg;
    }

    function lgMultiChips(label, key, options) {
      const fg = mk('div', '');
      fg.style.marginBottom = '10px';
      if (!lg[key]) lg[key] = [];
      if (label) { const l = tx('div', '', label); l.style.cssText = 'font-size:12px;color:var(--tx2);margin-bottom:6px;'; fg.appendChild(l); }
      const wrap = mk('div', ''); wrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
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
      fg.appendChild(wrap);
      return fg;
    }

    function lgText(label, key, placeholder) {
      return fieldArea(label, lg[key] || '', v => { lg[key] = v; scheduleSave(); }, '', placeholder);
    }

    function lgNumber(label, key, placeholder) {
      const fg = mk('div', 'fg');
      fg.style.display = 'inline-block';
      fg.style.marginRight = '16px';
      fg.appendChild(tx('label', 'fl', label));
      const inp = document.createElement('input');
      inp.type = 'number'; inp.value = lg[key] || ''; inp.className = 'finp';
      inp.style.maxWidth = '80px';
      inp.placeholder = placeholder || '';
      inp.oninput = e => { lg[key] = e.target.value; scheduleSave(); };
      fg.appendChild(inp);
      return fg;
    }

    const body = mk('div', '');

    // Strukturdaten
    const s1 = lgSection('Strukturdaten');
    const numRow = mk('div', ''); numRow.style.display = 'flex'; numRow.style.gap = '12px'; numRow.style.flexWrap = 'wrap';
    numRow.appendChild(lgNumber('Klassengröße', 'anzahl'));
    numRow.appendChild(lgNumber('davon w', 'anzahlW'));
    numRow.appendChild(lgNumber('davon m', 'anzahlM'));
    s1.appendChild(numRow);
    s1.appendChild(lgText('Raum / Ausstattung', 'raum', 'z.B. Chemieraum 204, Abzug vorhanden, Beamer'));
    body.appendChild(s1);

    // Leistungsstand
    const s2 = lgSection('Leistungsstand');
    s2.appendChild(lgChips('Allgemeines Leistungsniveau', 'leistung', ['eher schwach', 'heterogen', 'durchschnittlich', 'eher stark']));
    s2.appendChild(lgText('Erläuterung', 'leistungText', 'z.B. Oberes Drittel sehr stark, unteres Drittel zeigt Lücken bei Redoxreaktionen...'));
    body.appendChild(s2);

    // Lern- und Arbeitsverhalten
    const s3 = lgSection('Lern- und Arbeitsverhalten');
    s3.appendChild(lgChips('Mitarbeit / Motivation', 'motivation', ['gering', 'uneinheitlich', 'gut', 'sehr aktiv']));
    s3.appendChild(lgChips('Konzentration / Arbeitstempo', 'tempo', ['langsam', 'variabel', 'zügig']));
    s3.appendChild(lgText('Erläuterung', 'lernverhaltenText', 'z.B. Tendenz zur Ablenkung, Gruppenarbeit funktioniert gut...'));
    body.appendChild(s3);

    // Sozialverhalten
    const s4 = lgSection('Sozialverhalten / Klassenklima');
    s4.appendChild(lgChips(null, 'sozial', ['angespannt', 'unauffällig', 'kooperativ']));
    s4.appendChild(lgText('Erläuterung', 'sozialText', 'z.B. Einzelne Konflikte zwischen Teilgruppen...'));
    body.appendChild(s4);

    // Methodenkompetenz
    const s5 = lgSection('Methodenkompetenz');
    s5.appendChild(lgMultiChips('Erfahrung mit Sozialformen / Methoden', 'methoden', ['Gruppenarbeit', 'Partnerarbeit', 'Stationsarbeit', 'Experimente', 'Schülerpräsentation', 'Lerntempoduett', 'Think-Pair-Share']));
    body.appendChild(s5);

    // Motivation und Interesse
    const s5b = lgSection('Motivation und Interesse');
    s5b.appendChild(lgChips('Allgemeines Fachinteresse', 'fachinteresse', ['gering', 'uneinheitlich', 'vorhanden', 'ausgeprägt']));
    s5b.appendChild(lgMultiChips('Bevorzugte Arbeitsweisen', 'arbeitsweisen', ['Experimente', 'Problemlösen', 'Kreatives Arbeiten', 'Diskussion', 'Digitale Medien']));
    s5b.appendChild(lgText('Erläuterung', 'motivationText', 'z.B. Thema Elektrochemie motiviert, da Alltagsbezug; Kreativaufgaben werden eher abgelehnt...'));
    body.appendChild(s5b);

    // Sprachliche Voraussetzungen
    const s5c = lgSection('Sprachliche Voraussetzungen');
    s5c.appendChild(lgChips('Fachsprachliche Kompetenz', 'fachsprache', ['gering', 'entwickelt sich', 'gut', 'sehr sicher']));
    s5c.appendChild(lgMultiChips('Besonderheiten', 'sprachBesonderheiten', ['DaZ', 'Schwierigkeiten bei komplexen Aufgaben', 'Fachvokabular lückenhaft']));
    s5c.appendChild(lgText('Erläuterung', 'sprachText', 'z.B. 3 SuS mit DaZ, Fachbegriffe müssen regelmäßig visualisiert werden...'));
    body.appendChild(s5c);

    // Besonderheiten
    const s6 = lgSection('Förderbedarf und besondere Bedürfnisse');
    s6.appendChild(lgMultiChips('Diagnostizierte Förderbedarfe', 'foerderung', ['LRS', 'DaZ', 'ADHS', 'Inklusion', 'Hochbegabung', 'Nachteilsausgleich']));
    s6.appendChild(lgText('Weitere Hinweise', 'besonderheitenText', 'Weitere relevante Informationen zur Lerngruppe...'));
    body.appendChild(s6);

    // Konsequenzen für die Stunde
    const s7 = lgSection('Konsequenzen für die Unterrichtsplanung');
    const s7hint = tx('div', '', 'Was folgt aus der Analyse für die konkrete Planung?');
    s7hint.style.cssText = 'font-size:12px;color:var(--tx3);margin-bottom:8px;font-style:italic;';
    s7.appendChild(s7hint);

    // KI-Button
    const aiRow = mk('div', ''); aiRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;';
    const modelSel = document.createElement('select'); modelSel.className = 'finp'; modelSel.style.maxWidth = '160px';
    [['claude', '✨ Claude'], ['gpt4o', '✨ GPT-4o'], ['beide', '✨ Beide vergleichen']].forEach(([val, lbl]) => {
      const o = document.createElement('option'); o.value = val; o.textContent = lbl; modelSel.appendChild(o);
    });
    const aiBtn = btn('Konsequenzen ableiten', 'btn btn-pri btn-sm');
    const aiStatus = tx('span', '', '');
    aiStatus.style.cssText = 'font-size:12px;color:var(--tx3);';
    aiRow.appendChild(modelSel); aiRow.appendChild(aiBtn); aiRow.appendChild(aiStatus);
    s7.appendChild(aiRow);

    // Output-Bereich
    const aiOut = mk('div', ''); aiOut.style.cssText = 'display:flex;gap:12px;';
    const claudeOut = mk('div', ''); claudeOut.style.flex = '1'; claudeOut.style.display = 'none';
    const claudeLbl = tx('div', '', 'Claude'); claudeLbl.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);margin-bottom:4px;';
    const claudeTa = document.createElement('textarea'); claudeTa.className = 'finp'; claudeTa.rows = 6; claudeTa.style.width = '100%'; claudeTa.style.resize = 'vertical';
    claudeTa.oninput = e => { lg.konsequenzenClaude = e.target.value; scheduleSave(); };
    claudeOut.appendChild(claudeLbl); claudeOut.appendChild(claudeTa);
    const gptOut = mk('div', ''); gptOut.style.flex = '1'; gptOut.style.display = 'none';
    const gptLbl = tx('div', '', 'GPT-4o'); gptLbl.style.cssText = 'font-size:11px;font-weight:700;color:var(--tx2);margin-bottom:4px;';
    const gptTa = document.createElement('textarea'); gptTa.className = 'finp'; gptTa.rows = 6; gptTa.style.width = '100%'; gptTa.style.resize = 'vertical';
    gptTa.oninput = e => { lg.konsequenzenGPT = e.target.value; scheduleSave(); };
    gptOut.appendChild(gptLbl); gptOut.appendChild(gptTa);
    aiOut.appendChild(claudeOut); aiOut.appendChild(gptOut);
    s7.appendChild(aiOut);

    // Restore saved values
    if (lg.konsequenzenClaude) { claudeTa.value = lg.konsequenzenClaude; claudeOut.style.display = 'block'; }
    if (lg.konsequenzenGPT) { gptTa.value = lg.konsequenzenGPT; gptOut.style.display = 'block'; }

    function buildPrompt() {
      const fp2 = getFachplanung(kurs.fachplanungId);
      let p = 'Du bist Fachleiter an einem Gymnasium in NRW.\n';
      p += 'Leite aus der folgenden Lerngruppenanalyse konkrete didaktische Konsequenzen für die Unterrichtsplanung ab.\n';
      p += 'Schreibe präzise, praxisnah, in ganzen Sätzen. Maximal 200 Wörter.\n\n';
      p += 'Kurs: ' + kurs.klasse + (fp2 ? ' · ' + fachLabel(fp2.fach) + ' Jg. ' + fp2.jahrgang : '') + '\n';
      if (lg.anzahl) p += 'Klassengröße: ' + lg.anzahl + (lg.anzahlW ? ' (' + lg.anzahlW + 'w/' + lg.anzahlM + 'm)' : '') + '\n';
      if (lg.leistung) p += 'Leistungsniveau: ' + lg.leistung + (lg.leistungText ? ' – ' + lg.leistungText : '') + '\n';
      if (lg.motivation) p += 'Mitarbeit: ' + lg.motivation + '\n';
      if (lg.tempo) p += 'Arbeitstempo: ' + lg.tempo + '\n';
      if (lg.lernverhaltenText) p += 'Lernverhalten: ' + lg.lernverhaltenText + '\n';
      if (lg.sozial) p += 'Sozialverhalten: ' + lg.sozial + (lg.sozialText ? ' – ' + lg.sozialText : '') + '\n';
      if (lg.methoden && lg.methoden.length) p += 'Methodenerfahrung: ' + lg.methoden.join(', ') + '\n';
      if (lg.fachinteresse) p += 'Fachinteresse: ' + lg.fachinteresse + (lg.motivationText ? ' – ' + lg.motivationText : '') + '\n';
      if (lg.fachsprache) p += 'Fachsprache: ' + lg.fachsprache + (lg.sprachText ? ' – ' + lg.sprachText : '') + '\n';
      if (lg.foerderung && lg.foerderung.length) p += 'Förderbedarf: ' + lg.foerderung.join(', ') + '\n';
      if (lg.besonderheitenText) p += 'Besonderheiten: ' + lg.besonderheitenText + '\n';
      return p;
    }

    async function callClaude(prompt) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await res.json();
      return data.content?.[0]?.text || 'Fehler';
    }

    async function callGPT(prompt) {
      const key = localStorage.getItem('oai_key');
      if (!key) return 'Kein OpenAI API-Key hinterlegt. Bitte in den Einstellungen eintragen.';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model: 'gpt-4o', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'Fehler';
    }

    aiBtn.onclick = async () => {
      const model = modelSel.value;
      const prompt = buildPrompt();
      aiBtn.disabled = true; aiStatus.textContent = 'Wird generiert…';
      claudeOut.style.display = 'none'; gptOut.style.display = 'none';

      try {
        if (model === 'claude' || model === 'beide') {
          claudeOut.style.display = 'block'; claudeTa.value = '…';
          const text = await callClaude(prompt);
          claudeTa.value = text; lg.konsequenzenClaude = text; scheduleSave();
        }
        if (model === 'gpt4o' || model === 'beide') {
          gptOut.style.display = 'block'; gptTa.value = '…';
          const text = await callGPT(prompt);
          gptTa.value = text; lg.konsequenzenGPT = text; scheduleSave();
        }
        aiStatus.textContent = '✓ Fertig';
      } catch(e) {
        aiStatus.textContent = 'Fehler: ' + e.message;
      }
      aiBtn.disabled = false;
    };

    body.appendChild(s7);

    body.style.cssText = 'max-height:60vh;overflow-y:auto;padding-right:4px;';
    m.appendChild(body);

    const footer = mk('div', 'modal-footer');
    const closeBtn = btn('Schließen', 'btn btn-pri');
    closeBtn.onclick = () => { S.modal = null; render(); };
    footer.appendChild(closeBtn);
    m.appendChild(footer);
    return true;
  }

  return false;
}
