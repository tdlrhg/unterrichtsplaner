// ── Cache-busting Script Loader ───────────────────────────────────
// Lädt alle Seiten-Scripts mit ?v=<built> aus version.json,
// damit GitHub Pages CDN-Cache bei jedem Deploy umgangen wird.
(async function () {
  const v = await fetch('version.json?_=' + Date.now(), { cache: 'no-store' })
    .then(function(r) { return r.json(); })
    .catch(function() { return {}; });
  const q = v.built ? '?v=' + encodeURIComponent(v.built) : '';
  window.__VERSION_Q__ = q; // für Inline-Funktionen (z.B. pdfjsLib.workerSrc)

  // CSS-<link>-Tags bekamen bisher KEIN Cache-Busting (nur die Scripts oben) –
  // Browser/CDN konnten dadurch nach einem Deploy noch beliebig lange eine
  // veraltete dokument.css/style.css ausliefern, obwohl der Build längst
  // durch war. Href neu setzen erzwingt denselben Re-Fetch wie bei Scripts.
  if (q) {
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
      var href = l.getAttribute('href');
      if (href && !/^https?:/.test(href)) l.href = href.split('?')[0] + q;
    });
  }

  for (const item of (window.__SCRIPTS__ || [])) {
    await new Promise(function(ok) {
      // Inline-Funktion direkt ausführen
      if (typeof item === 'function') {
        try { item(); } catch(e) {}
        ok(); return;
      }
      const s = document.createElement('script');
      // Externe URLs (http/https) ohne Cache-Busting
      s.src = /^https?:/.test(item) ? item : (item + q);
      s.onload = ok;
      s.onerror = ok; // Fehler nicht blockieren
      document.head.appendChild(s);
    });
  }
})();
