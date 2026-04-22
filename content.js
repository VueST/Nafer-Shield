/**
 * Content Script — Nafer Shield
 * Aggressive cosmetic + element blocking. Runs at document_start in every frame.
 *
 * Strategy (layered):
 *   Layer 1 — CSS Injection: hide known ad containers via CSS before they render.
 *   Layer 2 — Image Guard: intercept <img> elements whose src matches ad networks.
 *   Layer 3 — Iframe Guard: block iframes loading from ad network domains.
 *   Layer 4 — MutationObserver: catch dynamically injected ads (SPAs, lazy-load).
 *   Layer 5 — Popup Guard: block window.open() calls used for pop-under ads.
 */

(function () {
  'use strict';

  const _api = globalThis.chrome ?? globalThis.browser;
  if (!_api?.runtime) return;

  // ─── Layer 5: Popup Guard (inject BEFORE any page script runs) ─────────────
  // Override window.open immediately at document_start to kill pop-unders.
  const _originalOpen = window.open.bind(window);
  window.open = function (url, ...args) {
    if (url && isAdUrl(url)) {
      console.debug('[Nafer] Blocked popup:', url);
      return null;
    }
    return _originalOpen(url, ...args);
  };

  // ─── Ad Network URL patterns (must be inline for document_start timing) ────
  // We duplicate the patterns here because content scripts cannot import modules.
  const AD_DOMAIN_PATTERNS = [
    'exoclick.com', 'trafficjunky.com', 'trafficjunky.net',
    'juicyads.com', 'juicyads.net', 'adnium.com', 'propellerads.com',
    'popcash.net', 'popads.net', 'hilltopads.com', 'hilltopads.net',
    'ero-advertising.com', 'trafficstars.com', 'plugrush.com',
    'adspyglass.com', 'revcontent.com', 'mgid.com', 'onclickmax.com',
    'clickadu.com', 'adskeeper.com', 'googlesyndication.com',
    'doubleclick.net', 'googleadservices.com', 'taboola.com',
    'outbrain.com', 'adf.ly', 'linkbucks.com', 'shorte.st',
    'coinhive.com', 'coin-hive.com',
  ];

  const AD_IMAGE_PATTERNS = AD_DOMAIN_PATTERNS.map(d => d.replace('.', '\\.'));
  const AD_REGEX = new RegExp(AD_IMAGE_PATTERNS.join('|'), 'i');

  function isAdUrl(url) {
    try {
      if (!url) return false;
      return AD_REGEX.test(url);
    } catch { return false; }
  }

  // ─── Layer 1: Early CSS Injection ───────────────────────────────────────────
  let _injectedStyle = null;

  function ensureStyleNode() {
    if (_injectedStyle && _injectedStyle.isConnected) return;
    _injectedStyle = document.createElement('style');
    _injectedStyle.id = 'nafer-cosmetic';
    _injectedStyle.setAttribute('data-nafer', '1');
    (document.head ?? document.documentElement).prepend(_injectedStyle);
  }

  function applyCSS(css) {
    ensureStyleNode();
    if (_injectedStyle.textContent !== css) {
      _injectedStyle.textContent = css;
    }
  }

  // Request cosmetic CSS from background (has full filter list knowledge)
  function fetchAndApplyCosmetics() {
    _api.runtime.sendMessage(
      { type: 'GET_COSMETIC_CSS', payload: { hostname: location.hostname } },
      (response) => {
        if (_api.runtime.lastError) return;
        if (response?.css) applyCSS(response.css);
      }
    );
  }

  fetchAndApplyCosmetics();

  // ─── Layer 2 & 3: Element Guard (img + iframe) ───────────────────────────────
  function guardElement(el) {
    const src = el.src || el.getAttribute('data-src') || '';
    if (!src) return;

    if (isAdUrl(src)) {
      el.style.cssText = 'display:none!important;visibility:hidden!important;width:0!important;height:0!important;';
      el.removeAttribute('src');
      el.removeAttribute('data-src');
      console.debug('[Nafer] Blocked element:', el.tagName, src.slice(0, 60));
    }
  }

  function guardIframe(el) {
    const src = el.src || el.getAttribute('src') || '';
    if (isAdUrl(src)) {
      el.style.cssText = 'display:none!important;';
      el.setAttribute('src', 'about:blank');
      el.sandbox = 'allow-nothing'; // non-standard but extra safety
      console.debug('[Nafer] Blocked iframe:', src.slice(0, 60));
    }
  }

  function scanNode(node) {
    if (!(node instanceof Element)) return;

    if (node.tagName === 'IMG') { guardElement(node); return; }
    if (node.tagName === 'IFRAME') { guardIframe(node); return; }
    if (node.tagName === 'SCRIPT' && isAdUrl(node.src)) {
      node.remove();
      return;
    }

    // Scan children
    node.querySelectorAll('img').forEach(guardElement);
    node.querySelectorAll('iframe').forEach(guardIframe);
  }

  // ─── Layer 4: MutationObserver ───────────────────────────────────────────────
  let _debounce = null;
  const _pendingNodes = [];

  const observer = new MutationObserver((mutations) => {
    let hasNew = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) { // Element nodes only
          _pendingNodes.push(node);
          hasNew = true;
        }
      }
    }

    if (!hasNew) return;

    clearTimeout(_debounce);
    _debounce = setTimeout(() => {
      const nodes = _pendingNodes.splice(0);
      for (const node of nodes) scanNode(node);
      // Re-apply cosmetic CSS in case a SPA replaced the head
      fetchAndApplyCosmetics();
    }, 150);
  });

  function startObserver() {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    // Scan existing DOM on load
    scanNode(document.documentElement);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }

})();
