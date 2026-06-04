// ── JSON-Repair-Helfer ────────────────────────────────────────────
function repairJsonStringsPr(s) {
  let out = ''; let inStr = false; let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') { out += ch + (s[i+1] || ''); i += 2; continue; }
      if (ch === '"') { inStr = false; out += ch; i++; continue; }
      if (ch === '\n') { out += '\\n'; i++; continue; }
      if (ch === '\r') { out += '\\r'; i++; continue; }
      if (ch === '\t') { out += '\\t'; i++; continue; }
      if (ch.charCodeAt(0) < 0x20) { i++; continue; }
    } else { if (ch === '"') inStr = true; }
    out += ch; i++;
  }
  return out;
}

function robustJsonParsePr(raw) {
  function extractTop(text) {
    const s = text.indexOf('{'); if (s < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = s; i < text.length; i++) {
      const ch = text[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return text.slice(s, i + 1); }
    }
    return text.slice(s);
  }
  const extracted = extractTop(raw);
  if (!extracted) throw new Error('Kein JSON in der Antwort');
  let jsonStr = extracted;
  { let inS = false, esc = false, stack = [];
    for (let i = 0; i < jsonStr.length; i++) {
      const c = jsonStr[i];
      if (esc) { esc = false; continue; }
      if (c === '\\' && inS) { esc = true; continue; }
      if (c === '"') { inS = !inS; continue; }
      if (inS) continue;
      if (c === '{') stack.push('}');
      else if (c === '[') stack.push(']');
      else if ((c === '}' || c === ']') && stack.length && stack[stack.length-1] === c) stack.pop();
    }
    if (inS) jsonStr += '"';
    jsonStr += stack.reverse().join('');
  }
  jsonStr = repairJsonStringsPr(jsonStr);
  try { return JSON.parse(jsonStr); } catch(e) {
    const items = [];
    let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') { if (depth === 0) start = i; depth++; }
      else if (ch === '}') { depth--; if (depth === 0 && start >= 0) {
        const objStr = repairJsonStringsPr(raw.slice(start, i + 1));
        try { const o = JSON.parse(objStr); if (o.typ || o.nr) items.push(o); } catch(e2) {}
        start = -1;
      }}
    }
    if (items.length) return { aufgaben: items };
    throw new Error('KI-Antwort konnte nicht als JSON gelesen werden');
  }
}

// PDF → Array von dataURL-Strings (eine pro Seite)
async function pdfToImages(file, scale = 1.5) {
  const blobUrl = URL.createObjectURL(file);
  const pdfDoc = await pdfjsLib.getDocument(blobUrl).promise;
  const images = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const vp = page.getViewport({ scale });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    images.push(cv.toDataURL('image/jpeg', 0.88));
    cv.width = 0; cv.height = 0; page.cleanup();
  }
  await pdfDoc.destroy(); URL.revokeObjectURL(blobUrl);
  return images;
}
