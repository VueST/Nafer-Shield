(() => {
  // content.js
  (function() {
    "use strict";
    const _api = globalThis.chrome ?? globalThis.browser;
    if (!_api?.runtime)
      return;
    const hostname = location.hostname;
    if (!hostname)
      return;
    let _injectedCSS = "";
    function injectCSS(css) {
      if (!css)
        return;
      _injectedCSS = css;
      let style = document.getElementById("nafer-cosmetic");
      if (!style) {
        style = document.createElement("style");
        style.id = "nafer-cosmetic";
        style.setAttribute("data-nafer", "1");
        (document.head ?? document.documentElement).appendChild(style);
      }
      if (style.textContent !== css) {
        style.textContent = css;
      }
    }
    function applyCosmetics() {
      if (_injectedCSS) {
        injectCSS(_injectedCSS);
        return;
      }
      _api.runtime.sendMessage(
        { type: "GET_COSMETIC_CSS", payload: { hostname } },
        (response) => {
          if (_api.runtime.lastError)
            return;
          if (response?.css)
            injectCSS(response.css);
        }
      );
    }
    applyCosmetics();
    let _debounceTimer = null;
    const observer = new MutationObserver((mutations) => {
      const hasNewNodes = mutations.some((m) => m.addedNodes.length > 0);
      if (!hasNewNodes)
        return;
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(applyCosmetics, 200);
    });
    function startObserving() {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
        // catch deeply nested ad injections
      });
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startObserving, { once: true });
    } else {
      startObserving();
    }
  })();
})();
