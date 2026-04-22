/**
 * Content Script — Entry Point
 * Nafer Shield Extension
 * Runs at document_start in every frame.
 *
 * Fix 4 applied: MutationObserver now watches for new ad nodes injected by
 * SPAs (YouTube, Reddit etc.) and re-applies cosmetic CSS on demand.
 * The observer uses subtree:true so nested mutations are caught.
 * A 200ms debounce prevents thrashing on rapid DOM updates.
 */

(function () {
  'use strict';

  const _api = globalThis.chrome ?? globalThis.browser;
  if (!_api?.runtime) return;

  const hostname = location.hostname;
  if (!hostname) return;

  // ─── Cosmetic CSS Injection ───────────────────────────────────────────────────
  let _injectedCSS = '';

  function injectCSS(css) {
    if (!css) return;
    _injectedCSS = css;
    let style = document.getElementById('nafer-cosmetic');
    if (!style) {
      style = document.createElement('style');
      style.id = 'nafer-cosmetic';
      style.setAttribute('data-nafer', '1');
      (document.head ?? document.documentElement).appendChild(style);
    }
    // Update content (idempotent if css hasn't changed)
    if (style.textContent !== css) {
      style.textContent = css;
    }
  }

  function applyCosmetics() {
    if (_injectedCSS) {
      // Already have CSS — just re-inject the style node if it was removed
      injectCSS(_injectedCSS);
      return;
    }
    _api.runtime.sendMessage(
      { type: 'GET_COSMETIC_CSS', payload: { hostname } },
      (response) => {
        if (_api.runtime.lastError) return;
        if (response?.css) injectCSS(response.css);
      }
    );
  }

  // Initial injection
  applyCosmetics();

  // ─── MutationObserver — Fix 4 ─────────────────────────────────────────────────
  // SPAs (YouTube, Reddit, Twitter) inject new ad containers after page load.
  // We watch for any new nodes and re-apply cosmetics with a 200ms debounce
  // to avoid performance issues during rapid DOM updates.
  let _debounceTimer = null;

  const observer = new MutationObserver((mutations) => {
    // Only act if new nodes were added (not just attribute changes)
    const hasNewNodes = mutations.some(m => m.addedNodes.length > 0);
    if (!hasNewNodes) return;

    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(applyCosmetics, 200);
  });

  function startObserving() {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,   // catch deeply nested ad injections
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserving, { once: true });
  } else {
    startObserving();
  }
})();
