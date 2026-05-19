// ── AWS Signature V4 – Hilfsfunktionen ──────────────────────────
async function _sha256(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function _hmac(key, msg) {
  const keyBuf = key instanceof Uint8Array ? key : new TextEncoder().encode(key);
  const msgBuf = typeof msg === 'string' ? new TextEncoder().encode(msg) : msg;
  const k = await crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, msgBuf));
}

async function _hmacHex(key, msg) {
  return Array.from(await _hmac(key, msg)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── R2 Upload (S3-kompatibel) ────────────────────────────────────
async function r2Upload(key, blob, contentType = 'application/pdf') {
  const endpoint  = (localStorage.getItem('r2_endpoint') || '').replace(/\/$/, '');
  const bucket    = localStorage.getItem('r2_bucket') || '';
  const accessKey = localStorage.getItem('r2_access_key') || '';
  const secretKey = localStorage.getItem('r2_secret_key') || '';

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    throw new Error('R2-Zugangsdaten fehlen – bitte in den Einstellungen eintragen.');
  }

  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const urlStr = `${endpoint}/${bucket}/${encodedKey}`;
  const urlObj = new URL(urlStr);
  const host   = urlObj.host;

  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const bodyBuf  = await blob.arrayBuffer();
  const bodyHash = await _sha256(new Uint8Array(bodyBuf));

  const canonHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`;
  const signedHdrs   = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonReq     = ['PUT', urlObj.pathname, '', canonHeaders, signedHdrs, bodyHash].join('\n');

  const scope     = `${dateStamp}/auto/s3/aws4_request`;
  const strToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await _sha256(canonReq)}`;

  const kDate    = await _hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion  = await _hmac(kDate, 'auto');
  const kService = await _hmac(kRegion, 's3');
  const kSign    = await _hmac(kService, 'aws4_request');
  const sig      = await _hmacHex(kSign, strToSign);

  const auth = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHdrs}, Signature=${sig}`;

  const res = await fetch(urlStr, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': bodyHash,
      'Authorization': auth,
    },
    body: blob,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`R2 Upload fehlgeschlagen (${res.status}): ${txt}`);
  }

  // Öffentliche URL zurückgeben wenn konfiguriert, sonst interne
  const pub = (localStorage.getItem('r2_public_url') || '').replace(/\/$/, '');
  return pub ? `${pub}/${key}` : urlStr;
}

// ── R2 List (ListObjectsV2) ──────────────────────────────────────
async function r2List(prefix = '', delimiter = '/') {
  const endpoint  = (localStorage.getItem('r2_endpoint') || '').replace(/\/$/, '');
  const bucket    = localStorage.getItem('r2_bucket') || '';
  const accessKey = localStorage.getItem('r2_access_key') || '';
  const secretKey = localStorage.getItem('r2_secret_key') || '';
  if (!endpoint || !bucket || !accessKey || !secretKey) throw new Error('R2-Zugangsdaten fehlen.');

  const params = new URLSearchParams({ 'list-type': '2' });
  if (prefix)    params.set('prefix', prefix);
  if (delimiter) params.set('delimiter', delimiter);

  const urlObj = new URL(`${endpoint}/${bucket}?${params}`);
  const host   = urlObj.host;
  const now    = new Date();
  const amzDate   = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const bodyHash  = await _sha256('');

  const canonQS = [...params.entries()].sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  const canonHeaders = `host:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`;
  const signedHdrs   = 'host;x-amz-content-sha256;x-amz-date';
  const canonReq     = ['GET', '/' + bucket, canonQS, canonHeaders, signedHdrs, bodyHash].join('\n');

  const scope     = `${dateStamp}/auto/s3/aws4_request`;
  const strToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await _sha256(canonReq)}`;
  const kDate    = await _hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion  = await _hmac(kDate, 'auto');
  const kService = await _hmac(kRegion, 's3');
  const kSign    = await _hmac(kService, 'aws4_request');
  const sig      = await _hmacHex(kSign, strToSign);
  const auth = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHdrs}, Signature=${sig}`;

  const res = await fetch(urlObj.toString(), {
    headers: { 'x-amz-date': amzDate, 'x-amz-content-sha256': bodyHash, Authorization: auth }
  });
  if (!res.ok) throw new Error(`R2 List fehlgeschlagen (${res.status})`);
  const xml  = await res.text();
  const doc  = new DOMParser().parseFromString(xml, 'text/xml');
  const folders = [...doc.querySelectorAll('CommonPrefixes Prefix')].map(n => n.textContent);
  const files   = [...doc.querySelectorAll('Contents')].map(n => ({
    key:  n.querySelector('Key')?.textContent || '',
    size: parseInt(n.querySelector('Size')?.textContent || '0'),
  }));
  return { folders, files };
}

// ── R2 Download (GET mit Signatur) ───────────────────────────────
async function r2Download(key) {
  const endpoint  = (localStorage.getItem('r2_endpoint') || '').replace(/\/$/, '');
  const bucket    = localStorage.getItem('r2_bucket') || '';
  const accessKey = localStorage.getItem('r2_access_key') || '';
  const secretKey = localStorage.getItem('r2_secret_key') || '';

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    throw new Error('R2-Zugangsdaten fehlen.');
  }

  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const urlStr = `${endpoint}/${bucket}/${encodedKey}`;
  const urlObj = new URL(urlStr);
  const host   = urlObj.host;

  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const bodyHash  = await _sha256('');

  const canonHeaders = `host:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`;
  const signedHdrs   = 'host;x-amz-content-sha256;x-amz-date';
  const canonReq     = ['GET', urlObj.pathname, '', canonHeaders, signedHdrs, bodyHash].join('\n');

  const scope     = `${dateStamp}/auto/s3/aws4_request`;
  const strToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await _sha256(canonReq)}`;

  const kDate    = await _hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion  = await _hmac(kDate, 'auto');
  const kService = await _hmac(kRegion, 's3');
  const kSign    = await _hmac(kService, 'aws4_request');
  const sig      = await _hmacHex(kSign, strToSign);

  const auth = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHdrs}, Signature=${sig}`;

  const res = await fetch(urlStr, {
    method: 'GET',
    headers: { 'x-amz-date': amzDate, 'x-amz-content-sha256': bodyHash, 'Authorization': auth },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`R2 Download fehlgeschlagen (${res.status}): ${txt}`);
  }
  return await res.arrayBuffer();
}

// ── R2 Delete ────────────────────────────────────────────────────
async function r2Delete(key) {
  const endpoint  = (localStorage.getItem('r2_endpoint') || '').replace(/\/$/, '');
  const bucket    = localStorage.getItem('r2_bucket') || '';
  const accessKey = localStorage.getItem('r2_access_key') || '';
  const secretKey = localStorage.getItem('r2_secret_key') || '';

  if (!endpoint || !bucket || !accessKey || !secretKey) return;

  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const urlStr = `${endpoint}/${bucket}/${encodedKey}`;
  const urlObj = new URL(urlStr);
  const host   = urlObj.host;

  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const bodyHash  = await _sha256('');

  const canonHeaders = `host:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`;
  const signedHdrs   = 'host;x-amz-content-sha256;x-amz-date';
  const canonReq     = ['DELETE', urlObj.pathname, '', canonHeaders, signedHdrs, bodyHash].join('\n');

  const scope     = `${dateStamp}/auto/s3/aws4_request`;
  const strToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await _sha256(canonReq)}`;

  const kDate    = await _hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion  = await _hmac(kDate, 'auto');
  const kService = await _hmac(kRegion, 's3');
  const kSign    = await _hmac(kService, 'aws4_request');
  const sig      = await _hmacHex(kSign, strToSign);

  const auth = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHdrs}, Signature=${sig}`;

  await fetch(urlStr, {
    method: 'DELETE',
    headers: { 'x-amz-date': amzDate, 'x-amz-content-sha256': bodyHash, 'Authorization': auth },
  });
}
