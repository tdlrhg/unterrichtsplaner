// ── Didaktik-Wissensdatenbank ─────────────────────────────────────

// Schema eines Wissensartikels:
// {
//   id, erstellt,
//   quelle: { titel, autoren[], jahr, zeitschrift, ausgabe, fach[], stufe[] },
//   kernaussagen: [{ id, aussage, planungsebene[], themen[] }],
//   muster: [{ id, name, geeignet_wenn[], prinzip, umsetzung[], planungsebene[], themen[] }],
//   werkzeuge: { heuristiken[], repraesentationen[], methoden[] },
//   einwaende: [{ id, einwand, antwort, themen[] }]
// }

const PLANUNGSEBENEN = ['reihe', 'stunde', 'material', 'situation'];
const PLANUNGSEBENE_LABEL = { reihe: 'Reihe', stunde: 'Stunde', material: 'Material', situation: 'Situation' };
const PLANUNGSEBENE_FARBE = { reihe: '#3b82f6', stunde: '#10b981', material: '#f59e0b', situation: '#8b5cf6' };

function viewDidaktik() {
  const div = mk('div', '');
  const hdr = mk('div', 'c-hdr');
  const left = mk('div', '');
  left.appendChild(tx('div', 'c-title', 'Didaktik-Wissensdatenbank'));
  left.appendChild(tx('div', 'c-sub', DIDARTDB.length + ' Artikel · ' + DIDARTDB.reduce((s,a) => s + (a.kernaussagen||[]).length + (a.muster||[]).length + (a.einwaende||[]).length, 0) + ' Wissensbausteine'));
  hdr.appendChild(left);
  const neuBtn = btn('+ Artikel extrahieren', 'btn btn-pri btn-sm');
  neuBtn.onclick = () => { S._didaktikView = 'neu'; render(); };
  hdr.appendChild(neuBtn);
  div.appendChild(hdr);

  // ── Tabs ──────────────────────────────────────────────────────────
  const tabBar = mk('div', 'did-tabs');
  const tabArt = mk('button', 'did-tab' + (S._didaktikTab !== 'phasen' ? ' active' : ''));
  tabArt.textContent = '📚 Artikeldatenbank';
  tabArt.onclick = () => { S._didaktikTab = 'artikel'; S._didaktikView = null; render(); };
  const tabPh = mk('button', 'did-tab' + (S._didaktikTab === 'phasen' ? ' active' : ''));
  tabPh.textContent = '📐 Phasenmodelle';
  tabPh.onclick = () => { S._didaktikTab = 'phasen'; S._didaktikView = null; render(); };
  tabBar.appendChild(tabArt); tabBar.appendChild(tabPh);
  div.appendChild(tabBar);

  if (S._didaktikTab === 'phasen') {
    div.appendChild(buildPhasenTab());
    return div;
  }

  // ── Extraktions-UI ────────────────────────────────────────────────
  if (S._didaktikView === 'neu') {
    div.appendChild(buildExtraktionUI());
    return div;
  }

  // ── Artikelliste + Detail ─────────────────────────────────────────
  const layout = mk('div', 'did-layout');

  // Linke Spalte: Liste
  const listCol = mk('div', 'did-list');
  if (!DIDARTDB.length) {
    const empty = mk('div', 'did-empty');
    empty.innerHTML = '<div style="font-size:32px;margin-bottom:12px">📚</div><div style="font-weight:700;margin-bottom:6px">Noch keine Artikel</div><div style="font-size:13px;color:var(--tx3)">Klicke „+ Artikel extrahieren" um loszulegen.</div>';
    listCol.appendChild(empty);
  } else {
    DIDARTDB.forEach(art => {
      const isAct = S._didaktikSel === art.id;
      const item = mk('div', 'did-list-item' + (isAct ? ' active' : ''));
      item.appendChild(tx('div', 'did-list-titel', art.quelle?.titel || '(ohne Titel)'));
      const meta = [art.quelle?.autoren?.join(', '), art.quelle?.jahr].filter(Boolean).join(' · ');
      if (meta) item.appendChild(tx('div', 'did-list-meta', meta));
      const badges = mk('div', 'did-list-badges');
      const alle = [...(art.kernaussagen||[]), ...(art.muster||[]), ...(art.einwaende||[])];
      const ebenen = [...new Set(alle.flatMap(b => b.planungsebene||[]))];
      ebenen.forEach(e => {
        const b = tx('span', 'did-ebene-badge', PLANUNGSEBENE_LABEL[e] || e);
        b.style.background = PLANUNGSEBENE_FARBE[e] + '22';
        b.style.color = PLANUNGSEBENE_FARBE[e];
        badges.appendChild(b);
      });
      item.appendChild(badges);
      item.onclick = () => { S._didaktikSel = art.id; render(); };
      listCol.appendChild(item);
    });
  }
  layout.appendChild(listCol);

  // Rechte Spalte: Detail
  const detailCol = mk('div', 'did-detail');
  const selArt = DIDARTDB.find(a => a.id === S._didaktikSel);
  if (selArt) {
    detailCol.appendChild(buildArtikelDetail(selArt));
  } else {
    const hint = mk('div', 'did-empty');
    hint.style.marginTop = '60px';
    hint.innerHTML = '<div style="font-size:24px;margin-bottom:8px">←</div><div style="color:var(--tx3);font-size:13px">Artikel links auswählen</div>';
    detailCol.appendChild(hint);
  }
  layout.appendChild(detailCol);

  div.appendChild(layout);
  return div;
}

// ── Artikel-Detailansicht ─────────────────────────────────────────
function buildArtikelDetail(art) {
  const div = mk('div', '');

  // Header
  const hdr = mk('div', 'did-detail-hdr');
  const titleEl = tx('div', 'did-detail-titel', art.quelle?.titel || '(ohne Titel)');
  hdr.appendChild(titleEl);
  const meta = [
    art.quelle?.autoren?.join(', '),
    art.quelle?.zeitschrift,
    art.quelle?.ausgabe,
    art.quelle?.jahr
  ].filter(Boolean).join(' · ');
  if (meta) hdr.appendChild(tx('div', 'did-detail-meta', meta));

  const actRow = mk('div', '');
  actRow.style.cssText = 'display:flex;gap:8px;margin-top:10px;';
  const delBtn = btn('🗑 Löschen', 'btn btn-danger btn-xs');
  delBtn.onclick = () => {
    if (!confirm('Artikel löschen?')) return;
    const i = DIDARTDB.findIndex(a => a.id === art.id);
    if (i >= 0) DIDARTDB.splice(i, 1);
    S._didaktikSel = null;
    sbUpload('didaktik-artikel.json', DIDARTDB).then(() => render());
  };
  actRow.appendChild(delBtn);
  hdr.appendChild(actRow);
  div.appendChild(hdr);

  // Kernaussagen
  if ((art.kernaussagen||[]).length) {
    div.appendChild(didSection('Kernaussagen'));
    art.kernaussagen.forEach(k => {
      const row = mk('div', 'did-baustein');
      row.appendChild(tx('div', 'did-baustein-text', k.aussage));
      row.appendChild(buildEbenenBadges(k.planungsebene, k.themen));
      div.appendChild(row);
    });
  }

  // Didaktische Muster
  if ((art.muster||[]).length) {
    div.appendChild(didSection('Didaktische Muster'));
    art.muster.forEach(m => {
      const card = mk('div', 'did-muster-card');
      card.appendChild(tx('div', 'did-muster-name', m.name));
      if (m.geeignet_wenn?.length) {
        const gw = mk('div', 'did-muster-body');
        gw.appendChild(tx('span', 'did-muster-label', 'Geeignet wenn: '));
        gw.appendChild(tx('span', '', m.geeignet_wenn.join(' · ')));
        card.appendChild(gw);
      }
      if (m.prinzip) card.appendChild(tx('div', 'did-muster-prinzip', m.prinzip));
      if (m.umsetzung?.length) {
        const ul = document.createElement('ul');
        ul.style.cssText = 'margin:4px 0 0 16px;font-size:12px;color:var(--tx2);';
        m.umsetzung.forEach(u => { const li = document.createElement('li'); li.textContent = u; ul.appendChild(li); });
        card.appendChild(ul);
      }
      card.appendChild(buildEbenenBadges(m.planungsebene, m.themen));
      div.appendChild(card);
    });
  }

  // Werkzeuge
  const wz = art.werkzeuge || {};
  if ((wz.heuristiken||[]).length || (wz.repraesentationen||[]).length || (wz.methoden||[]).length) {
    div.appendChild(didSection('Werkzeuge'));
    const wzCard = mk('div', 'did-wz-card');
    if ((wz.heuristiken||[]).length) {
      wzCard.appendChild(tx('div', 'did-wz-label', 'Heuristiken'));
      const tags = mk('div', 'did-tag-wrap');
      wz.heuristiken.forEach(h => tags.appendChild(tx('span', 'did-tag', h)));
      wzCard.appendChild(tags);
    }
    if ((wz.repraesentationen||[]).length) {
      wzCard.appendChild(tx('div', 'did-wz-label', 'Darstellungsformen'));
      const tags = mk('div', 'did-tag-wrap');
      wz.repraesentationen.forEach(r => tags.appendChild(tx('span', 'did-tag', r)));
      wzCard.appendChild(tags);
    }
    if ((wz.methoden||[]).length) {
      wzCard.appendChild(tx('div', 'did-wz-label', 'Methoden'));
      const tags = mk('div', 'did-tag-wrap');
      wz.methoden.forEach(m => tags.appendChild(tx('span', 'did-tag', m)));
      wzCard.appendChild(tags);
    }
    div.appendChild(wzCard);
  }

  // Einwände
  if ((art.einwaende||[]).length) {
    div.appendChild(didSection('Einwände & Antworten'));
    art.einwaende.forEach(e => {
      const card = mk('div', 'did-einwand-card');
      const q = mk('div', 'did-einwand-q');
      q.appendChild(tx('span', 'did-einwand-icon', '?'));
      q.appendChild(tx('span', '', e.einwand));
      card.appendChild(q);
      const a = mk('div', 'did-einwand-a');
      a.appendChild(tx('span', 'did-einwand-icon green', '→'));
      a.appendChild(tx('span', '', e.antwort));
      card.appendChild(a);
      if (e.themen?.length) {
        const tags = mk('div', 'did-tag-wrap'); tags.style.marginTop = '6px';
        e.themen.forEach(t => tags.appendChild(tx('span', 'did-tag', t)));
        card.appendChild(tags);
      }
      div.appendChild(card);
    });
  }

  return div;
}

function didSection(label) {
  const h = tx('div', 'did-section-hdr', label);
  return h;
}

function buildEbenenBadges(ebenen, themen) {
  const wrap = mk('div', 'did-badges-row');
  (ebenen||[]).forEach(e => {
    const b = tx('span', 'did-ebene-badge', PLANUNGSEBENE_LABEL[e] || e);
    b.style.background = (PLANUNGSEBENE_FARBE[e] || '#94a3b8') + '22';
    b.style.color = PLANUNGSEBENE_FARBE[e] || '#94a3b8';
    wrap.appendChild(b);
  });
  (themen||[]).forEach(t => wrap.appendChild(tx('span', 'did-thema-badge', t)));
  return wrap;
}

// ── Extraktions-UI ────────────────────────────────────────────────
function buildExtraktionUI() {
  const div = mk('div', '');
  const card = mk('div', 'card');
  card.appendChild(cardHdr('✨ Artikel extrahieren'));
  const body = mk('div', 'card-body');

  // Hint
  const hint = tx('div', '', 'Lade die Seiten als Bilder hoch (Screenshots oder aus PDF exportiert). Die KI liest sie und extrahiert Kernaussagen, Muster, Werkzeuge und Einwände.');
  hint.style.cssText = 'font-size:13px;color:var(--tx2);margin-bottom:14px;line-height:1.5;';
  body.appendChild(hint);

  // Upload-Zone
  let uploadedImages = []; // [{name, dataUrl, mediaType}]

  const uploadZone = mk('div', 'did-upload-zone');
  uploadZone.innerHTML = '<div style="font-size:28px;margin-bottom:8px">🖼</div><div style="font-weight:600;margin-bottom:4px">Bilder hier ablegen</div><div style="font-size:12px;color:var(--tx3)">oder klicken zum Auswählen · JPG, PNG · mehrere Seiten möglich</div>';

  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.multiple = true;
  fileInput.style.display = 'none';
  uploadZone.onclick = () => fileInput.click();
  uploadZone.ondragover = e => { e.preventDefault(); uploadZone.classList.add('drag-over'); };
  uploadZone.ondragleave = () => uploadZone.classList.remove('drag-over');
  uploadZone.ondrop = e => { e.preventDefault(); uploadZone.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); };

  const thumbsWrap = mk('div', 'did-thumbs');

  function handleFiles(files) {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target.result;
        const mediaType = file.type || 'image/jpeg';
        uploadedImages.push({ name: file.name, dataUrl, mediaType });
        renderThumbs();
      };
      reader.readAsDataURL(file);
    });
  }

  function renderThumbs() {
    thumbsWrap.innerHTML = '';
    uploadedImages.forEach((img, i) => {
      const wrap = mk('div', 'did-thumb-wrap');
      const imgEl = document.createElement('img');
      imgEl.src = img.dataUrl; imgEl.className = 'did-thumb';
      const del = mk('button', 'did-thumb-del'); del.textContent = '✕';
      del.onclick = e => { e.stopPropagation(); uploadedImages.splice(i, 1); renderThumbs(); };
      const lbl = tx('div', 'did-thumb-lbl', 'Seite ' + (i + 1));
      wrap.appendChild(imgEl); wrap.appendChild(del); wrap.appendChild(lbl);
      thumbsWrap.appendChild(wrap);
    });
    if (uploadedImages.length) {
      uploadZone.style.display = 'none';
      thumbsWrap.style.display = 'flex';
    } else {
      uploadZone.style.display = '';
      thumbsWrap.style.display = 'none';
    }
  }

  fileInput.onchange = () => { handleFiles(fileInput.files); fileInput.value = ''; };
  thumbsWrap.style.display = 'none';

  const addMoreBtn = mk('button', 'did-add-more');
  addMoreBtn.textContent = '+ Weitere Seiten';
  addMoreBtn.onclick = () => fileInput.click();

  body.appendChild(uploadZone);
  body.appendChild(thumbsWrap);
  body.appendChild(addMoreBtn);
  body.appendChild(fileInput);

  const actRow = mk('div', '');
  actRow.style.cssText = 'display:flex;gap:8px;margin-top:14px;align-items:center;';

  const kiBtn = btn('✨ KI extrahiert', 'btn btn-pri btn-sm');
  const cancelBtn2 = btn('Abbrechen', 'btn btn-ghost btn-sm');
  cancelBtn2.onclick = () => { S._didaktikView = null; render(); };
  const statusEl = tx('span', '', '');
  statusEl.style.cssText = 'font-size:12px;color:var(--tx3);';

  kiBtn.onclick = async () => {
    if (!uploadedImages.length) { alert('Bitte mindestens ein Bild hochladen.'); return; }
    const antKey = localStorage.getItem('ant_key');
    if (!antKey) { alert('Bitte API-Key hinterlegen.'); return; }

    kiBtn.disabled = true; kiBtn.textContent = '⏳ Liest…';
    statusEl.textContent = 'KI liest die Bilder…';

    const prompt = `Du bist Experte für Didaktik und Unterrichtsplanung. Analysiere diesen Fachartikel und extrahiere strukturiertes Wissen für eine Didaktik-Datenbank.

Ziel: Eine Planungs-KI soll später aus diesen Bausteinen konkrete Entscheidungen beim Unterrichtsplanen treffen können.

Antworte NUR mit einem JSON-Objekt in exakt diesem Format:

{
  "quelle": {
    "titel": "Vollständiger Artikeltitel",
    "autoren": ["Nachname1", "Nachname2"],
    "jahr": 2025,
    "zeitschrift": "Name der Zeitschrift oder null",
    "ausgabe": "Heft/Band oder null",
    "fach": [],
    "stufe": []
  },
  "kernaussagen": [
    {
      "aussage": "Handlungsanleitende Aussage (Imperativ: 'Starte mit...', 'Wähle...', 'Nutze...')",
      "planungsebene": ["reihe"],
      "themen": ["schlagwort1", "schlagwort2"]
    }
  ],
  "muster": [
    {
      "name": "Kurzer Mustername",
      "geeignet_wenn": ["Situation 1", "Situation 2"],
      "prinzip": "2-3 Sätze: Was wird wie gemacht und warum.",
      "umsetzung": ["Schritt 1", "Schritt 2"],
      "planungsebene": ["stunde"],
      "themen": ["schlagwort"]
    }
  ],
  "werkzeuge": {
    "heuristiken": ["Heuristik 1", "Heuristik 2"],
    "repraesentationen": ["Darstellung 1"],
    "methoden": ["Methode 1"]
  },
  "einwaende": [
    {
      "einwand": "Typischer Einwand aus dem Artikel",
      "antwort": "Gegenargument in 1-2 Sätzen",
      "themen": ["schlagwort"]
    }
  ]
}

Regeln:
- planungsebene: nur Werte aus ["reihe", "stunde", "material", "situation"]
- Kernaussagen: handlungsanleitend formulieren (Imperativ), nicht beschreibend
- fach/stufe: leer lassen wenn der Artikel fach-/stufenunabhängig ist
- Leere Arrays [] wenn keine Einträge vorhanden
- Maximal 8 Kernaussagen, 5 Muster, 5 Einwände

Die Seiten des Artikels sind als Bilder beigefügt.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': antKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          messages: [{
            role: 'user',
            content: [
              // Alle Bilder als content blocks
              ...uploadedImages.map(img => ({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: img.mediaType,
                  data: img.dataUrl.split(',')[1],
                }
              })),
              { type: 'text', text: prompt }
            ]
          }],
        }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message || res.statusText);
      const data = await res.json();
      const rawText = data.content?.[0]?.text || '';
      let jsonStr = rawText.match(/\{[\s\S]*\}/)?.[0] || '{}';
      // Robuste Bereinigung: trailing commas, abgeschnittene Arrays/Objekte schließen
      jsonStr = jsonStr
        .replace(/,\s*([\]}])/g, '$1')   // trailing commas entfernen
        .replace(/,\s*$/g, '');           // trailing comma am Ende
      // Falls JSON abgeschnitten: versuche aufzufüllen
      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch(_) {
        // Notfall: schließe offene Klammern
        const opens = (jsonStr.match(/\{/g)||[]).length - (jsonStr.match(/\}/g)||[]).length;
        const openArr = (jsonStr.match(/\[/g)||[]).length - (jsonStr.match(/\]/g)||[]).length;
        jsonStr += ']'.repeat(Math.max(0, openArr)) + '}'.repeat(Math.max(0, opens));
        jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
        parsed = JSON.parse(jsonStr);
      }
      if (!parsed.quelle) throw new Error('Ungültige Antwort von der KI.');

      // Vorschau anzeigen
      statusEl.textContent = '';
      body.innerHTML = '';
      body.appendChild(buildExtraktionVorschau(parsed, body));

    } catch(e) {
      statusEl.textContent = 'Fehler: ' + e.message;
      kiBtn.disabled = false; kiBtn.textContent = '✨ KI extrahiert';
    }
  };

  actRow.appendChild(kiBtn);
  actRow.appendChild(cancelBtn2);
  actRow.appendChild(statusEl);
  body.appendChild(actRow);
  card.appendChild(body);
  div.appendChild(card);
  return div;
}

function buildExtraktionVorschau(parsed, container) {
  const wrap = mk('div', '');

  const head = mk('div', '');
  head.style.cssText = 'margin-bottom:16px;';
  head.appendChild(tx('div', 'did-detail-titel', parsed.quelle?.titel || '(ohne Titel)'));
  const meta = [parsed.quelle?.autoren?.join(', '), parsed.quelle?.zeitschrift, parsed.quelle?.jahr].filter(Boolean).join(' · ');
  if (meta) head.appendChild(tx('div', 'did-detail-meta', meta));
  wrap.appendChild(head);

  // Zähler
  const stats = tx('div', '', `${(parsed.kernaussagen||[]).length} Kernaussagen · ${(parsed.muster||[]).length} Muster · ${(parsed.einwaende||[]).length} Einwände`);
  stats.style.cssText = 'font-size:13px;color:var(--tx2);margin-bottom:16px;';
  wrap.appendChild(stats);

  // Vorschau des extrahierten Artikels
  const preview = mk('div', '');
  preview.style.cssText = 'max-height:400px;overflow-y:auto;border:1px solid var(--bord);border-radius:var(--r);padding:12px;margin-bottom:16px;';
  const tempArt = { ...parsed, id: '_preview', quelle: parsed.quelle };
  tempArt.kernaussagen = (parsed.kernaussagen||[]).map(k => ({ ...k, id: '_p' }));
  tempArt.muster = (parsed.muster||[]).map(m => ({ ...m, id: '_p' }));
  tempArt.einwaende = (parsed.einwaende||[]).map(e => ({ ...e, id: '_p' }));
  preview.appendChild(buildArtikelDetail(tempArt));
  wrap.appendChild(preview);

  const actRow = mk('div', '');
  actRow.style.cssText = 'display:flex;gap:8px;';

  const saveBtn = btn('✓ Speichern', 'btn btn-pri btn-sm');
  saveBtn.onclick = async () => {
    saveBtn.disabled = true; saveBtn.textContent = '⏳ Speichert…';
    const entry = {
      id: uid(),
      erstellt: new Date().toISOString(),
      quelle: parsed.quelle,
      kernaussagen: (parsed.kernaussagen||[]).map(k => ({ id: uid(), ...k })),
      muster: (parsed.muster||[]).map(m => ({ id: uid(), ...m })),
      werkzeuge: parsed.werkzeuge || { heuristiken: [], repraesentationen: [], methoden: [] },
      einwaende: (parsed.einwaende||[]).map(e => ({ id: uid(), ...e })),
    };
    DIDARTDB.push(entry);
    try {
      await sbUpload('didaktik-artikel.json', DIDARTDB);
      S._didaktikView = null;
      S._didaktikSel = entry.id;
      render();
    } catch(e) {
      alert('Speichern fehlgeschlagen: ' + e.message);
      saveBtn.disabled = false; saveBtn.textContent = '✓ Speichern';
    }
  };

  const discardBtn = btn('Verwerfen', 'btn btn-ghost btn-sm');
  discardBtn.onclick = () => { S._didaktikView = null; render(); };

  actRow.appendChild(saveBtn);
  actRow.appendChild(discardBtn);
  wrap.appendChild(actRow);

  return wrap;
}

// ── Phasenmodelle-Tab (alter Inhalt) ──────────────────────────────
const DIDAKTIK_DEFAULTS = {
  '3-Phasen': `Theoretischer Hintergrund: Das 3-Phasen-Modell (Einstieg – Erarbeitung – Sicherung) geht auf die Herbart'schen Formalstufen zurück. Hilbert Meyer beschreibt es als strukturgebenden Rahmen für Lehrende und Lernende.

Geeignet wenn: Klar umrissenes Lernziel · Neue Inhalte in überschaubarem Umfang · Heterogene Lerngruppen brauchen Struktur · Zeitdruck

Taxonomiestufen: Erinnern, Verstehen, Anwenden

Grenzen: Gefahr der Lehrerzentrierung; wenig geeignet für offene Problemstellungen.`,

  'AVIVA': `Theoretischer Hintergrund: AVIVA (Ankommen – Vorwissen – Informieren – Verarbeiten – Auswerten) basiert auf konstruktivistischen Lerntheorien und betont die Aktivierung von Vorwissen (vgl. Ausubel: „advance organizer").

Geeignet wenn: SuS bringen relevantes Vorwissen mit · Vernetzung neuer Inhalte mit bestehendem Wissen · Selbstreflexion und Metakognition · Heterogene Lernstände

Taxonomiestufen: Verstehen, Analysieren, Bewerten

Grenzen: Erfordert mehr Zeit; setzt Vorwissen voraus.`,

  'Direkte Instruktion': `Theoretischer Hintergrund: I do – We do – You do, basiert auf Rosenshine (2012) und Hattie (Visible Learning, 2009). Prinzip des graduellen Rückzugs der Lehrkraft (Scaffolding/Fading).

Geeignet wenn: Prozedurale Fertigkeiten · Wenig Vorwissen · Hohe Fehlerrisiken · Klare Kompetenzerwartungen

Taxonomiestufen: Erinnern, Verstehen, Anwenden

Grenzen: Wenig geeignet für explorative Aufgaben; kann Eigeninitiative einschränken.`,

  'Forschend-entdeckend': `Theoretischer Hintergrund: Inquiry-Based Learning nach Deweys „Learning by doing". Lernweg: Phänomen – Frage – Hypothese – Untersuchung – Auswertung – Schlussfolgerung.

Geeignet wenn: Naturwissenschaftliche Denk- und Arbeitsweisen · Erkenntnisse selbst konstruieren · Komplexe Probleme · Fachspezifische Methoden

Taxonomiestufen: Analysieren, Bewerten, Erstellen

Grenzen: Zeitintensiv; erfordert Selbststeuerungsfähigkeit; Gefahr von Fehlkonzepten.`,
};

function buildPhasenTab() {
  const div = mk('div', '');
  const hint = mk('div', 'card');
  const hb = mk('div', 'card-body');
  hb.appendChild(tx('p', '', 'Diese Texte nutzt die KI beim Phasierungsvorschlag als Entscheidungsgrundlage. Ergänze oder ersetze sie durch eigene Literatur.'));
  hint.appendChild(hb);
  div.appendChild(hint);

  const taRefs = {};
  Object.keys(DIDAKTIK_DEFAULTS).forEach(modell => {
    const card = mk('div', 'card');
    card.appendChild(cardHdr(modell));
    const cb = mk('div', 'card-body');
    const ta = document.createElement('textarea');
    ta.className = 'finp didaktik-ta';
    ta.value = DIDAKTIKDB[modell] !== undefined ? DIDAKTIKDB[modell] : DIDAKTIK_DEFAULTS[modell];
    ta.rows = 8;
    ta.oninput = () => { DIDAKTIKDB[modell] = ta.value; };
    taRefs[modell] = ta;
    cb.appendChild(ta);
    card.appendChild(cb);
    div.appendChild(card);
  });

  const saveCard = mk('div', 'card');
  const sb2 = mk('div', 'card-body');
  sb2.style.cssText = 'display:flex;gap:8px;align-items:center;';
  const saveBtn = btn('Speichern', 'btn btn-pri btn-sm');
  const saveStatus = tx('span', '', '');
  saveStatus.style.cssText = 'font-size:12px;color:var(--tx3);';
  saveBtn.onclick = async () => {
    saveBtn.disabled = true; saveStatus.textContent = 'Wird gespeichert…';
    try {
      await sbUpload('didaktik.json', DIDAKTIKDB);
      saveStatus.textContent = '✓ Gespeichert';
    } catch(e) { saveStatus.textContent = 'Fehler: ' + e.message; }
    saveBtn.disabled = false;
    setTimeout(() => { saveStatus.textContent = ''; }, 3000);
  };
  const resetBtn = btn('Zurücksetzen', 'btn btn-ghost btn-sm');
  resetBtn.onclick = () => {
    if (!confirm('Alle Texte zurücksetzen?')) return;
    Object.keys(DIDAKTIK_DEFAULTS).forEach(m => { DIDAKTIKDB[m] = DIDAKTIK_DEFAULTS[m]; taRefs[m].value = DIDAKTIK_DEFAULTS[m]; });
  };
  sb2.appendChild(saveBtn); sb2.appendChild(resetBtn); sb2.appendChild(saveStatus);
  saveCard.appendChild(sb2);
  div.appendChild(saveCard);
  return div;
}
