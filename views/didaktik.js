// ── Didaktik-Wissensdatenbank ─────────────────────────────────────

// ── Entwurfssicherung ─────────────────────────────────────────────
// Die KI-Auswertung eines Kapitels ist teuer (18 Seiten ≈ 48.000 Tokens) und
// lag bisher nur im Speicher der Seite: Tabwechsel, hängender Upload oder ein
// Neuladen — und sie war weg. Deshalb wird sie sofort nach dem Aufruf lokal
// abgelegt und beim nächsten Öffnen angeboten.
const DID_ENTWURF_KEY = 'did_entwurf';

// uid() steht in core/state.js — das lädt datenbank.html nicht, diese Ansicht
// läuft aber auf beiden Seiten. Ohne eigenen Ersatz warf das Speichern dort
// einen ReferenceError, bevor überhaupt etwas hochgeladen wurde.
function didUid() {
  if (typeof uid === 'function') return uid();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function didSichereEntwurf(parsed) {
  try {
    localStorage.setItem(DID_ENTWURF_KEY, JSON.stringify({
      gesichert: new Date().toISOString(),
      parsed: parsed
    }));
  } catch (e) {
    console.warn('[Didaktik] Entwurf konnte nicht gesichert werden:', e.message);
  }
}

function didLadeEntwurf() {
  try {
    const roh = localStorage.getItem(DID_ENTWURF_KEY);
    if (!roh) return null;
    const d = JSON.parse(roh);
    return (d && d.parsed && d.parsed.quelle) ? d : null;
  } catch (e) { return null; }
}

function didLoescheEntwurf() {
  try { localStorage.removeItem(DID_ENTWURF_KEY); } catch (e) {}
}

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
  const tabs = [
    { id: 'artikel',  label: '📚 Artikel' },
    { id: 'themen',   label: '🏷 Nach Themen' },
    { id: 'phasen',   label: '📐 Phasenmodelle' },
  ];
  const aktTab = S._didaktikTab || 'artikel';
  tabs.forEach(t => {
    const tb = mk('button', 'did-tab' + (aktTab === t.id ? ' active' : ''));
    tb.textContent = t.label;
    tb.onclick = () => { S._didaktikTab = t.id; S._didaktikView = null; render(); };
    tabBar.appendChild(tb);
  });
  div.appendChild(tabBar);

  if (aktTab === 'phasen') { div.appendChild(buildPhasenTab()); return div; }
  if (aktTab === 'themen')  { div.appendChild(buildNachThemenTab()); return div; }

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
    // Gruppieren nach Werk → Zeitschrift → erster Autor → Titel
    const gruppen = {};
    DIDARTDB.forEach(art => {
      const grpKey = art.quelle?.werk || art.quelle?.zeitschrift || art.quelle?.autoren?.[0] || art.quelle?.titel || 'Sonstige';
      if (!gruppen[grpKey]) gruppen[grpKey] = [];
      gruppen[grpKey].push(art);
    });

    Object.entries(gruppen).forEach(([grpLabel, artikel]) => {
      // Gruppen-Header
      const grpHdr = mk('div', '');
      grpHdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 10px 3px;margin-top:8px;border-top:1px solid var(--bord);';
      const grpTitel = tx('span', '', grpLabel);
      grpTitel.style.cssText = 'font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      const grpCount = tx('span', '', artikel.length + '');
      grpCount.style.cssText = 'font-size:10px;font-weight:700;color:var(--tx3);background:var(--surf2);border-radius:8px;padding:1px 6px;flex-shrink:0;';
      grpHdr.appendChild(grpTitel);
      grpHdr.appendChild(grpCount);
      listCol.appendChild(grpHdr);

      artikel.forEach(art => {
        const isAct = S._didaktikSel === art.id;
        const item = mk('div', 'did-list-item' + (isAct ? ' active' : ''));
        item.appendChild(tx('div', 'did-list-titel', art.quelle?.titel || '(ohne Titel)'));
        const werkLabel = art.quelle?.werk || art.quelle?.zeitschrift || null;
        if (werkLabel) item.appendChild(tx('div', 'did-list-meta', werkLabel));
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
        item.onclick = () => {
          S._didaktikSel = art.id;
          // Aktiv-Klasse ohne render() tauschen
          listCol.querySelectorAll('.did-list-item').forEach(el => el.classList.remove('active'));
          item.classList.add('active');
          // Nur rechte Spalte neu bauen
          detailCol.innerHTML = '';
          const found = DIDARTDB.find(a => a.id === art.id);
          if (found) detailCol.appendChild(buildArtikelDetail(found));
        };
        listCol.appendChild(item);
      });

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

  // Werk-Feld (editierbar, für Sammelbände mit Kapitel-Autoren)
  const werkRow = mk('div', '');
  werkRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;';
  werkRow.appendChild(tx('span', '', '📗'));
  const werkLabel = tx('span', '', 'Werk / Sammelband:');
  werkLabel.style.cssText = 'font-size:11px;color:var(--tx3);flex-shrink:0;';
  werkRow.appendChild(werkLabel);
  const werkInp = document.createElement('input');
  werkInp.className = 'finp';
  werkInp.style.cssText = 'font-size:12px;padding:3px 7px;flex:1;';
  werkInp.placeholder = 'z.B. „Guter Unterricht" (Hrsg. Meyer)';
  werkInp.value = art.quelle?.werk || '';
  werkInp.title = 'Buchtitel setzen um mehrere Kapitel eines Sammelbands zu gruppieren';
  const werkSave = async () => {
    const val = werkInp.value.trim();
    if (!art.quelle) art.quelle = {};
    art.quelle.werk = val || null;
    await sbUpload('didaktik-artikel.json', DIDARTDB);
    render();
  };
  werkInp.addEventListener('blur', werkSave);
  werkInp.addEventListener('keydown', e => { if (e.key === 'Enter') { werkInp.blur(); } });
  werkRow.appendChild(werkInp);
  hdr.appendChild(werkRow);

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
  const hint = tx('div', '', 'Lade die Seiten als Bilder hoch. Reihenfolge danach per Drag & Drop anpassen.');
  hint.style.cssText = 'font-size:13px;color:var(--tx2);margin-bottom:14px;line-height:1.5;';
  body.appendChild(hint);

  // Liegengebliebene Auswertung anbieten, statt sie still verfallen zu lassen
  const entwurf = didLadeEntwurf();
  if (entwurf) {
    const box = mk('div', '');
    box.style.cssText = 'border:1px solid var(--bord);border-radius:8px;padding:12px 14px;'
      + 'margin-bottom:14px;background:var(--surf2);display:flex;align-items:center;gap:12px;flex-wrap:wrap;';
    const wann = new Date(entwurf.gesichert);
    box.appendChild(tx('div', '', '↩ Nicht gespeicherte Auswertung: „'
      + (entwurf.parsed.quelle.titel || 'ohne Titel') + '" vom '
      + wann.toLocaleDateString('de-DE') + ' ' + wann.toLocaleTimeString('de-DE', {hour:'2-digit',minute:'2-digit'})));
    const weiter = btn('Weiterbearbeiten', 'btn btn-pri btn-sm');
    weiter.onclick = () => {
      body.innerHTML = '';
      body.appendChild(buildExtraktionVorschau(entwurf.parsed, body));
    };
    const weg = btn('Verwerfen', 'btn btn-ghost btn-sm');
    weg.onclick = () => { didLoescheEntwurf(); render(); };
    box.appendChild(weiter); box.appendChild(weg);
    body.appendChild(box);
  }

  // Upload-Bereich
  let uploadedImages = [];
  let thumbDragSrc = null;

  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.multiple = true;
  fileInput.style.display = 'none';
  fileInput.onchange = async () => { await handleFiles(fileInput.files); fileInput.value = ''; };
  body.appendChild(fileInput);

  const uploadArea = mk('div', 'did-upload-area');
  uploadArea.ondragover = e => {
    if (thumbDragSrc !== null) return; // Thumbnail-Reorder → uploadArea ignorieren
    e.preventDefault(); uploadArea.classList.add('drag-over');
  };
  uploadArea.ondragleave = e => { if (!uploadArea.contains(e.relatedTarget)) uploadArea.classList.remove('drag-over'); };
  uploadArea.ondrop = async e => {
    if (thumbDragSrc !== null) return;
    e.preventDefault(); uploadArea.classList.remove('drag-over');
    await handleFiles(e.dataTransfer.files);
  };

  // Ohne onerror und ohne Zeitgrenze wird das Versprechen bei einer nicht
  // dekodierbaren Datei nie eingelöst — das await davor wartet dann endlos,
  // ohne Fehler und ohne Meldung. Es sieht aus, als hänge die Seite.
  function resizeImage(dataUrl, maxWidth, quality) {
    return new Promise(resolve => {
      let fertig = false;
      const raus = (wert) => { if (!fertig) { fertig = true; resolve(wert); } };
      const uhr = setTimeout(() => raus(null), 20000);
      const img = new Image();
      img.onload = () => {
        clearTimeout(uhr);
        try {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          const url = canvas.toDataURL('image/jpeg', quality);
          canvas.width = 0; canvas.height = 0;
          raus(url && url.length > 100 ? url : null);
        } catch (e) {
          console.warn('[Didaktik] Bild konnte nicht verkleinert werden:', e.message);
          raus(null);
        }
      };
      img.onerror = () => { clearTimeout(uhr); raus(null); };
      img.src = dataUrl;
    });
  }

  // Sequentiell lesen — Reihenfolge bleibt erhalten
  async function handleFiles(files) {
    const alle = Array.from(files);
    const bilder = alle.filter(f => f.type.startsWith('image/'));
    const abgelehnt = alle.filter(f => !f.type.startsWith('image/')).map(f => f.name);
    const gescheitert = [];

    for (const file of bilder) {
      let dataUrl = null;
      try {
        dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = e => res(e.target.result);
          r.onerror = () => rej(new Error('Datei nicht lesbar'));
          r.readAsDataURL(file);
        });
      } catch (e) { dataUrl = null; }

      const resized = dataUrl ? await resizeImage(dataUrl, 1200, 0.82) : null;
      if (!resized) { gescheitert.push(file.name); continue; }

      uploadedImages.push({ name: file.name, dataUrl: resized, mediaType: 'image/jpeg' });
      renderUploadArea();
    }

    // Stilles Verschlucken war das eigentliche Problem — sagen, was nicht ging.
    const meldung = []
      .concat(abgelehnt.length ? ['Keine Bilddatei: ' + abgelehnt.join(', ') + ' (PDF wird hier nicht unterstützt)'] : [])
      .concat(gescheitert.length ? ['Konnte nicht gelesen werden: ' + gescheitert.join(', ')] : []);
    if (meldung.length) alert(meldung.join('\n'));
  }

  function renderUploadArea() {
    uploadArea.innerHTML = '';
    uploadedImages.forEach((img, i) => {
      const wrap = mk('div', 'did-thumb-wrap');
      wrap.draggable = true;
      wrap.style.cursor = 'grab';

      // Drag-and-Drop Reordering
      wrap.addEventListener('dragstart', e => {
        thumbDragSrc = i;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => wrap.style.opacity = '0.4', 0);
      });
      wrap.addEventListener('dragend', () => {
        thumbDragSrc = null;
        wrap.style.opacity = '';
        uploadArea.querySelectorAll('.did-thumb-wrap').forEach(el => el.classList.remove('did-thumb-drop-target'));
      });
      wrap.addEventListener('dragover', e => {
        if (thumbDragSrc === null || thumbDragSrc === i) return;
        e.preventDefault(); e.stopPropagation();
        uploadArea.querySelectorAll('.did-thumb-wrap').forEach(el => el.classList.remove('did-thumb-drop-target'));
        wrap.classList.add('did-thumb-drop-target');
      });
      wrap.addEventListener('dragleave', () => wrap.classList.remove('did-thumb-drop-target'));
      wrap.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation();
        wrap.classList.remove('did-thumb-drop-target');
        if (thumbDragSrc === null || thumbDragSrc === i) return;
        const [moved] = uploadedImages.splice(thumbDragSrc, 1);
        uploadedImages.splice(i, 0, moved);
        thumbDragSrc = null;
        renderUploadArea();
      });

      const imgEl = document.createElement('img');
      imgEl.src = img.dataUrl; imgEl.className = 'did-thumb';
      imgEl.style.pointerEvents = 'none'; // verhindert Browser-Drag des Bildes
      const del = mk('button', 'did-thumb-del'); del.textContent = '✕';
      del.onclick = e => { e.stopPropagation(); uploadedImages.splice(i, 1); renderUploadArea(); };
      const lbl = tx('div', 'did-thumb-lbl', 'Seite ' + (i + 1));
      wrap.appendChild(imgEl); wrap.appendChild(del); wrap.appendChild(lbl);
      uploadArea.appendChild(wrap);
    });
    // „+"-Kachel
    const addTile = mk('div', 'did-thumb-wrap did-thumb-add');
    addTile.draggable = false;
    addTile.innerHTML = uploadedImages.length
      ? '<div style="font-size:22px;color:var(--tx3)">+</div>'
      : '<div style="font-size:28px;margin-bottom:6px">🖼</div><div style="font-size:12px;font-weight:600;color:var(--tx2)">Seiten ablegen</div><div style="font-size:11px;color:var(--tx3);margin-top:2px">oder klicken</div>';
    addTile.onclick = () => fileInput.click();
    uploadArea.appendChild(addTile);
  }

  renderUploadArea();
  body.appendChild(uploadArea);

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
    "titel": "Vollständiger Artikeltitel oder Kapiteltitel",
    "autoren": ["Nachname1", "Nachname2"],
    "jahr": 2025,
    "zeitschrift": "Name der Zeitschrift oder null",
    "werk": "Titel des übergeordneten Buches/Sammelbands oder null (bei Zeitschriftenartikeln null)",
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
- Extrahiere NUR was wirklich im Text steht — erfinde keine Aussagen um eine Mindestanzahl zu füllen
- Kurze Texte (1-3 Seiten): typisch 2-4 Kernaussagen. Lange Artikel (10+ Seiten): bis zu 8
- Qualität vor Quantität: lieber 3 präzise Kernaussagen als 8 verwässerte

Die Seiten des Artikels sind als Bilder beigefügt.`;

    try {
      const _blocks = [
        ...uploadedImages.map(img => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.dataUrl.split(',')[1] }
        })),
        { type: 'text', text: prompt }
      ];
      // Laufende Anzeige: Ein Kapitel mit 18 Seiten sind rund 48.000 Tokens in
      // einer Anfrage. Ohne Rückmeldung ist „rechnet noch" von „hängt" nicht
      // zu unterscheiden.
      const _start = Date.now();
      const _uhr = setInterval(() => {
        const s = Math.round((Date.now() - _start) / 1000);
        statusEl.textContent = 'KI liest ' + uploadedImages.length + ' Seiten … '
          + (s < 60 ? s + ' s' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' min');
      }, 1000);

      let rawText;
      try {
        // 16000 statt 8000: Bei einem langen Kapitel mit vielen Kernaussagen
        // und Mustern brach die Antwort sonst mitten im JSON ab.
        rawText = await callKI(_blocks, { maxTokens: 16000, label: 'didaktik-import' });
      } finally {
        clearInterval(_uhr);
      }
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

      // Sofort lokal sichern — noch vor jedem Netzzugriff. Ein Kapitel mit 18
      // Seiten kostet rund 48.000 Tokens; ein Tabwechsel, ein hängender Upload
      // oder ein Neuladen darf diese Arbeit nicht vernichten.
      didSichereEntwurf(parsed);

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

  const saveMeldung = tx('div', '', '');
  saveMeldung.style.cssText = 'font-size:12px;color:#dc2626;margin-top:8px;line-height:1.5;';

  const saveBtn = btn('✓ Speichern', 'btn btn-pri btn-sm');
  saveBtn.onclick = async () => {
    saveBtn.disabled = true; saveBtn.textContent = '⏳ Speichert… 0 s';
    saveMeldung.textContent = '';
    // Mitlaufende Sekunden: sonst ist „wartet noch" von „hängt" nicht zu
    // unterscheiden — und man sieht, ob die Zeitgrenze überhaupt greift.
    const _t0 = Date.now();
    const _tick = setInterval(() => {
      saveBtn.textContent = '⏳ Speichert… ' + Math.round((Date.now() - _t0) / 1000) + ' s';
    }, 1000);
    // Alles im try: Ein Fehler beim Bauen des Eintrags flog vorher ungefangen
    // heraus, und der Knopf blieb dauerhaft auf „Speichert…" stehen.
    try {
      const entry = {
        id: didUid(),
        erstellt: new Date().toISOString(),
        quelle: parsed.quelle,
        kernaussagen: (parsed.kernaussagen||[]).map(k => ({ id: didUid(), ...k })),
        muster: (parsed.muster||[]).map(m => ({ id: didUid(), ...m })),
        werkzeuge: parsed.werkzeuge || { heuristiken: [], repraesentationen: [], methoden: [] },
        einwaende: (parsed.einwaende||[]).map(e => ({ id: didUid(), ...e })),
      };
      // Erst hochladen, dann in den Bestand übernehmen. Andersherum steht der
      // Artikel nach einem Fehlschlag schon drin und der zweite Versuch legt
      // ihn ein zweites Mal an.
      await sbUpload('didaktik-artikel.json', DIDARTDB.concat([entry]));
      clearInterval(_tick);
      DIDARTDB.push(entry);
      didLoescheEntwurf();          // gespeichert — Entwurf wird nicht mehr gebraucht
      S._didaktikView = null;
      S._didaktikSel = entry.id;
      render();
    } catch(e) {
      clearInterval(_tick);
      // In die Seite schreiben statt alert(): Ein einmal abgelehnter Dialog
      // bleibt im Browser dauerhaft unterdrückt, die Meldung wäre dann weg.
      saveMeldung.textContent = 'Speichern fehlgeschlagen nach '
        + Math.round((Date.now() - _t0) / 1000) + ' s: ' + e.message
        + ' — deine Auswertung bleibt stehen und ist lokal gesichert.';
      saveBtn.disabled = false; saveBtn.textContent = '✓ Speichern';
    }
  };

  const discardBtn = btn('Verwerfen', 'btn btn-ghost btn-sm');
  discardBtn.onclick = () => { S._didaktikView = null; render(); };

  actRow.appendChild(saveBtn);
  actRow.appendChild(discardBtn);
  wrap.appendChild(actRow);
  wrap.appendChild(saveMeldung);

  return wrap;
}

// ── Nach-Themen-Tab ───────────────────────────────────────────────
function buildNachThemenTab() {
  const div = mk('div', '');

  if (!DIDARTDB.length) {
    const empty = mk('div', 'did-empty');
    empty.style.marginTop = '40px';
    empty.innerHTML = '<div style="font-size:32px;margin-bottom:12px">🏷</div><div style="font-weight:700;margin-bottom:6px">Noch keine Artikel in der Datenbank</div><div style="font-size:13px;color:var(--tx3)">Füge Artikel hinzu um hier nach Themen zu suchen.</div>';
    div.appendChild(empty);
    return div;
  }

  // Alle Bausteine aus allen Artikeln sammeln
  const alleBausteine = [];
  DIDARTDB.forEach(art => {
    const quelle = art.quelle?.autoren?.[0]
      ? (art.quelle.autoren[0] + (art.quelle.autoren.length > 1 ? ' u.a.' : ''))
      : art.quelle?.titel || '?';
    (art.kernaussagen || []).forEach(k => alleBausteine.push({
      typ: 'kernaussage', text: k.aussage, planungsebene: k.planungsebene || [],
      themen: k.themen || [], quelle, artikelId: art.id,
    }));
    (art.muster || []).forEach(m => alleBausteine.push({
      typ: 'muster', text: m.name + ': ' + m.prinzip, planungsebene: m.planungsebene || [],
      themen: m.themen || [], quelle, artikelId: art.id,
    }));
    (art.einwaende || []).forEach(e => alleBausteine.push({
      typ: 'einwand', text: '? ' + e.einwand + ' → ' + e.antwort, planungsebene: [],
      themen: e.themen || [], quelle, artikelId: art.id,
    }));
  });

  // Alle vorhandenen Tags sammeln
  const alleThemen = [...new Set(alleBausteine.flatMap(b => b.themen))].sort();
  const alleEbenen = PLANUNGSEBENEN.filter(e => alleBausteine.some(b => b.planungsebene.includes(e)));

  // Filter-State
  if (!S._didThemenFilter) S._didThemenFilter = { ebene: null, thema: null, suche: '' };
  const F = S._didThemenFilter;

  // Suchfeld
  const suchRow = mk('div', '');
  suchRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:12px;';
  const suchInp = document.createElement('input');
  suchInp.type = 'text'; suchInp.className = 'finp';
  suchInp.placeholder = 'Bausteine durchsuchen…';
  suchInp.value = F.suche || '';
  suchInp.style.flex = '1';
  suchInp.oninput = () => { F.suche = suchInp.value; renderBausteine(); };
  suchRow.appendChild(suchInp);
  const resetBtn = btn('Filter zurücksetzen', 'btn btn-ghost btn-xs');
  resetBtn.onclick = () => { F.ebene = null; F.thema = null; F.suche = ''; suchInp.value = ''; renderBausteine(); renderFilter(); };
  suchRow.appendChild(resetBtn);
  div.appendChild(suchRow);

  // Planungsebene-Filter
  const ebenenRow = mk('div', 'did-filter-row');
  ebenenRow.appendChild(tx('span', 'did-filter-label', 'Ebene:'));
  const ebenenChips = mk('div', 'did-tag-wrap');
  function renderFilter() {
    ebenenChips.innerHTML = '';
    alleEbenen.forEach(e => {
      const isOn = F.ebene === e;
      const b = mk('button', 'did-filter-chip' + (isOn ? ' on' : ''));
      b.textContent = PLANUNGSEBENE_LABEL[e] || e;
      if (isOn) { b.style.background = PLANUNGSEBENE_FARBE[e] + '33'; b.style.color = PLANUNGSEBENE_FARBE[e]; b.style.borderColor = PLANUNGSEBENE_FARBE[e]; }
      b.onclick = () => { F.ebene = isOn ? null : e; renderBausteine(); renderFilter(); };
      ebenenChips.appendChild(b);
    });
    themenChips.innerHTML = '';
    const relevantThemen = F.ebene
      ? [...new Set(alleBausteine.filter(b => b.planungsebene.includes(F.ebene)).flatMap(b => b.themen))].sort()
      : alleThemen;
    relevantThemen.forEach(t => {
      const isOn = F.thema === t;
      const b = mk('button', 'did-filter-chip' + (isOn ? ' on' : ''));
      b.textContent = t;
      b.onclick = () => { F.thema = isOn ? null : t; renderBausteine(); renderFilter(); };
      themenChips.appendChild(b);
    });
  }
  ebenenRow.appendChild(ebenenChips);
  div.appendChild(ebenenRow);

  const themenRow = mk('div', 'did-filter-row');
  themenRow.appendChild(tx('span', 'did-filter-label', 'Thema:'));
  const themenChips = mk('div', 'did-tag-wrap');
  themenRow.appendChild(themenChips);
  div.appendChild(themenRow);

  // Bausteine-Liste
  const listeWrap = mk('div', '');
  listeWrap.style.marginTop = '16px';
  div.appendChild(listeWrap);

  const TYP_LABEL = { kernaussage: 'Kernaussage', muster: 'Muster', einwand: 'Einwand' };
  const TYP_FARBE = { kernaussage: 'var(--pri)', muster: 'var(--grn)', einwand: '#8b5cf6' };

  function renderBausteine() {
    listeWrap.innerHTML = '';
    const q = (F.suche || '').toLowerCase().trim();
    const gefiltert = alleBausteine.filter(b => {
      if (F.ebene && !b.planungsebene.includes(F.ebene)) return false;
      if (F.thema && !b.themen.includes(F.thema)) return false;
      if (q && !b.text.toLowerCase().includes(q) && !b.themen.join(' ').includes(q)) return false;
      return true;
    });

    if (!gefiltert.length) {
      listeWrap.appendChild(tx('div', 'did-empty', 'Keine Bausteine gefunden.'));
      return;
    }

    const zaehler = tx('div', '', gefiltert.length + ' Baustein' + (gefiltert.length !== 1 ? 'e' : ''));
    zaehler.style.cssText = 'font-size:12px;color:var(--tx3);margin-bottom:8px;';
    listeWrap.appendChild(zaehler);

    gefiltert.forEach(b => {
      const row = mk('div', 'did-themen-baustein');
      const top = mk('div', '');
      top.style.cssText = 'display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;';
      const typBadge = tx('span', '', TYP_LABEL[b.typ] || b.typ);
      typBadge.style.cssText = `font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:${TYP_FARBE[b.typ]}22;color:${TYP_FARBE[b.typ]};flex-shrink:0;margin-top:2px;`;
      top.appendChild(typBadge);
      top.appendChild(tx('span', '', b.text));
      row.appendChild(top);

      const meta = mk('div', 'did-badges-row');
      (b.planungsebene || []).forEach(e => {
        const badge = tx('span', 'did-ebene-badge', PLANUNGSEBENE_LABEL[e] || e);
        badge.style.background = (PLANUNGSEBENE_FARBE[e] || '#94a3b8') + '22';
        badge.style.color = PLANUNGSEBENE_FARBE[e] || '#94a3b8';
        meta.appendChild(badge);
      });
      (b.themen || []).forEach(t => meta.appendChild(tx('span', 'did-thema-badge', t)));
      const src = tx('span', '', '— ' + b.quelle);
      src.style.cssText = 'font-size:11px;color:var(--tx3);margin-left:4px;';
      meta.appendChild(src);
      row.appendChild(meta);
      listeWrap.appendChild(row);
    });
  }

  renderFilter();
  renderBausteine();
  return div;
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
