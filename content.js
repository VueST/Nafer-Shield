/**
 * Content Script — Nafer Shield v3.2
 * FIXES:
 *   - Removed Google/YouTube infrastructure domains (was breaking YouTube)
 *   - Removed script.remove() (too destructive, DNR handles this at network level)
 *   - Added PROTECTION_TOGGLED listener to remove CSS when user disables extension
 */

(function () {
  'use strict';

  const _api = globalThis.chrome ?? globalThis.browser;
  if (!_api?.runtime) return;

  // ─── Sites where we skip aggressive scanning ────────────────────────────────
  // These sites use Google infrastructure domains legitimately.
  // DNR rules (EasyList) already handle ad blocking there at network level.
  const SAFE_HOSTS = [
    'youtube.com', 'www.youtube.com', 'm.youtube.com',
    'google.com', 'www.google.com',
    'mail.google.com', 'drive.google.com',
    'gmail.com',
  ];
  const hostname    = location.hostname;
  const isSafeHost  = SAFE_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));

  // ─── Ad Network Domains ────────────────────────────────────────────────────
  // NOTE: Google/YouTube infrastructure deliberately excluded.
  // They are blocked at network level by EasyList (DNR static rules).
  // Blocking them here destroys YouTube's UI.
  const AD_DOMAINS = [
    'exoclick.com', 'trafficjunky.com', 'trafficjunky.net',
    'juicyads.com',  'juicyads.net',    'adnium.com',
    'propellerads.com', 'popcash.net',  'popads.net',
    'hilltopads.com',   'hilltopads.net', 'ero-advertising.com',
    'trafficstars.com', 'plugrush.com', 'adspyglass.com',
    'revcontent.com',   'mgid.com',     'onclickmax.com',
    'clickadu.com',     'adskeeper.com','adf.ly',
    'linkbucks.com',    'coinhive.com', 'coin-hive.com',
    'taboola.com',      'outbrain.com', 'natpal.com',
    'cpx.to',           'popcash.net',
  ];

  const AD_REGEX = new RegExp(
    AD_DOMAINS.map(d => d.replace(/\./g, '\\.')).join('|'), 'i'
  );

  function isAdUrl(url) {
    try { return !!(url && AD_REGEX.test(url)); } catch { return false; }
  }

  // ─── Popup Guard ───────────────────────────────────────────────────────────
  const _origOpen = window.open.bind(window);
  window.open = function (url, ...args) {
    if (isAdUrl(url)) { console.debug('[Nafer] Blocked popup:', url); return null; }
    return _origOpen(url, ...args);
  };

  // ─── CSS Injection ─────────────────────────────────────────────────────────
  let _styleEl = null;

  function getStyleEl() {
    if (_styleEl?.isConnected) return _styleEl;
    _styleEl = document.createElement('style');
    _styleEl.id = 'nafer-cosmetic';
    (document.head ?? document.documentElement).prepend(_styleEl);
    return _styleEl;
  }

  function applyCSS(css) {
    const el = getStyleEl();
    if (el.textContent !== css) el.textContent = css;
  }

  function removeCSS() {
    if (_styleEl) { _styleEl.remove(); _styleEl = null; }
  }

  function fetchCosmetics() {
    _api.runtime.sendMessage(
      { type: 'GET_COSMETIC_CSS', payload: { hostname } },
      (res) => { if (!_api.runtime.lastError && res?.css) applyCSS(res.css); }
    );
  }

  // ─── Protection Toggle Listener ─────────────────────────────────────────────
  // When user disables protection, remove injected CSS from this tab immediately.
  _api.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'PROTECTION_TOGGLED') {
      if (msg.enabled) {
        fetchCosmetics(); // re-apply
      } else {
        removeCSS();      // remove CSS so ads can show (protection is off)
      }
    }
  });

  // ─── Element Guards ────────────────────────────────────────────────────────
  function guardImg(el) {
    const src = el.src || el.dataset?.src || el.getAttribute('data-lazy-src') || '';
    if (!src || !isAdUrl(src)) return;
    el.style.cssText = 'display:none!important;visibility:hidden!important;width:0!important;height:0!important;';
    el.removeAttribute('src');
    el.removeAttribute('data-src');
    console.debug('[Nafer] Blocked img:', src.slice(0, 60));
  }

  function guardIframe(el) {
    const src = el.src || el.getAttribute('src') || '';
    if (!src || !isAdUrl(src)) return;
    el.style.cssText = 'display:none!important;';
    el.setAttribute('src', 'about:blank');
    console.debug('[Nafer] Blocked iframe:', src.slice(0, 60));
  }

  function scanElement(node) {
    if (!(node instanceof Element)) return;
    const tag = node.tagName;
    // NOTE: No script.remove() — DNR handles script blocking safely at network level
    if (tag === 'IMG')    { guardImg(node);    return; }
    if (tag === 'IFRAME') { guardIframe(node); return; }
    node.querySelectorAll('img').forEach(guardImg);
    node.querySelectorAll('iframe').forEach(guardIframe);
  }

  // ─── Start ─────────────────────────────────────────────────────────────────
  function start() {
    // Fetch cosmetic CSS first
    fetchCosmetics();

    // Skip aggressive element scanning on safe hosts (YouTube, Google)
    if (isSafeHost) return;

    // Scan existing DOM
    scanElement(document.documentElement);

    // Watch for dynamic injections (SPAs)
    let _debounce = null;
    const _queue  = [];

    new MutationObserver((mutations) => {
      let hasNew = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) { _queue.push(node); hasNew = true; }
        }
      }
      if (!hasNew) return;
      clearTimeout(_debounce);
      _debounce = setTimeout(() => {
        _queue.splice(0).forEach(scanElement);
        fetchCosmetics();
      }, 150);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

})();
