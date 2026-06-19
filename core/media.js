// ── Einheitliche Datei → dataURL-Konvertierung ────────────────────
// Einzige Stelle für PDF-Rendering und Bild-Konvertierung.
// Alle Views importieren von hier; kein lokales Nachbauen.

// Lange Kante in Pixeln für KI-Analyse (ausreichend für Texterkennnung)
const MAT_ANALYSIS_LONG_EDGE = 1568;

// ── Hilfsfunktionen ───────────────────────────────────────────────

const _IMG_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','tif','tiff']);
const _MIME_MAP = {
  png:'image/png', gif:'image/gif', webp:'image/webp', bmp:'image/bmp',
  jpg:'image/jpeg', jpeg:'image/jpeg', tif:'image/jpeg', tiff:'image/jpeg',
};

// Gibt true zurück wenn die Datei eine Bild-Datei ist (kein PDF)
function mediaIsImage(filename) {
  return _IMG_EXTS.has((filename.split('.').pop() || '').toLowerCase());
}

// ── PDF-Seite rendern ─────────────────────────────────────────────
// page     : pdfjs-Seitenobjekt
// longEdge : max. Pixel auf der langen Seite (default: MAT_ANALYSIS_LONG_EDGE)
// quality  : JPEG-Qualität 0–1 (default: 0.88)
async function renderPdfPage(page, { longEdge = MAT_ANALYSIS_LONG_EDGE, quality = 0.88 } = {}) {
  const vp0 = page.getViewport({ scale: 1 });
  const scale = longEdge / Math.max(vp0.width, vp0.height);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  const dataURL = canvas.toDataURL('image/jpeg', quality);
  canvas.width = 0; canvas.height = 0;
  page.cleanup();
  return dataURL;
}

// ── ArrayBuffer → dataURL-Array ───────────────────────────────────
// filename : Dateiname (für MIME- und Typ-Erkennung)
// buf      : ArrayBuffer des Dateiinhalts
// maxPages : max. PDF-Seiten (default: alle)
// longEdge, quality: wie renderPdfPage
async function bufToDataURLs(filename, buf, { maxPages = Infinity, longEdge = MAT_ANALYSIS_LONG_EDGE, quality = 0.88 } = {}) {
  if (mediaIsImage(filename)) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const mime = _MIME_MAP[ext] || 'image/jpeg';
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(new Blob([buf], { type: mime }));
    });
    return [dataUrl];
  }
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const urls = [];
  const n = Math.min(pdf.numPages, maxPages);
  for (let i = 1; i <= n; i++) {
    urls.push(await renderPdfPage(await pdf.getPage(i), { longEdge, quality }));
  }
  await pdf.destroy();
  return urls;
}

// ── File-Objekt → dataURL-Array ───────────────────────────────────
// Für lokale Datei-Uploads (File-Input oder Drag & Drop)
async function fileToDataURLs(file, opts = {}) {
  return bufToDataURLs(file.name, await file.arrayBuffer(), opts);
}
