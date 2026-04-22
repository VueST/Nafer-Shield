/**
 * AdNetworks — Core Domain Layer
 * Central registry of known ad network domains and their cosmetic patterns.
 *
 * Philosophy: We block the AD NETWORK itself, not the sites using it.
 * Adding an entry here blocks that network on EVERY website automatically.
 *
 * Organized by category for maintainability.
 */

// ─── Ad Network Domains (for DNR Dynamic Rules) ───────────────────────────────
// These will be blocked at the network level via declarativeNetRequest.
export const AD_NETWORK_DOMAINS = [
  // ── Mainstream Ad Networks ───────────────────────────────────────────────
  // NOTE: Google/YouTube infrastructure domains (doubleclick, googlesyndication)
  // are intentionally EXCLUDED here. They are already covered by EasyList static
  // rules with smarter per-context matching. Blocking them at domain level breaks
  // YouTube and other Google-powered sites.

  // ── Taboola / Outbrain ───────────────────────────────────────────────────
  'taboola.com',
  'trc.taboola.com',
  'cdn.taboola.com',
  'outbrain.com',
  'widgets.outbrain.com',
  'odb.outbrain.com',

  // ── Alternative / Adult-Friendly Ad Networks ─────────────────────────────
  // These networks operate on sites that are rejected by mainstream ad networks.
  'exoclick.com',
  'static.exoclick.com',
  'syndication.exoclick.com',
  'trafficjunky.com',
  'trafficjunky.net',
  'tjcrs.trafficjunky.com',
  'juicyads.com',
  'juicyads.net',
  'adnium.com',
  'ads.adnium.com',
  'cdn.adnium.com',
  'propellerads.com',
  'cdn.propellerads.com',
  'popcash.net',
  'cdn.popcash.net',
  'popads.net',
  'cpx.to',
  'hilltopads.com',
  'hilltopads.net',
  'adspyglass.com',
  'plugrush.com',
  'ero-advertising.com',

  // ── Tracker & Malware Networks ────────────────────────────────────────────
  'adf.ly',
  'linkbucks.com',
  'shorte.st',
  'ouo.io',
  'bc.vc',
  'sh.st',
  'adrinolinks.in',
  'shrink.pe',
  'cutfly.com',
  'upbam.com',

  // ── Popup / Push Notification Networks ───────────────────────────────────
  'onclickmax.com',
  'clickadu.com',
  'adskeeper.com',
  'dntx.com',
  'ad-stir.com',
  'content.ad',
  'revcontent.com',
  'mgid.com',
  'adx1.com',
  'natpal.com',
  'trafficstars.com',

  // ── Crypto Mining Scripts ─────────────────────────────────────────────────
  'coinhive.com',
  'coin-hive.com',
  'cryptonight.wasm.stream',
  'webmr.com',
  'monerominer.rocks',
  'minero.cc',
];


// ─── Cosmetic Patterns (for CSS-based element hiding) ────────────────────────
// These selectors target ad containers by their structural patterns,
// not by domain. Works even when the ad image is served from a CDN.

export const COSMETIC_PATTERNS = [
  // ── Google AdSense (safe selectors — won't match YouTube UI) ─────────────
  'ins.adsbygoogle',
  'amp-ad',
  '[id^="div-gpt-ad"]',
  '[data-ad-unit]',
  '[data-ad-slot]',
  '[data-ad-client]',

  // ── Structural Patterns (ad containers identified by size/attributes) ─────
  'iframe[src*="exoclick"]',
  'iframe[src*="trafficjunky"]',
  'iframe[src*="juicyads"]',
  'iframe[src*="adnium"]',
  'iframe[src*="propellerads"]',
  'iframe[src*="popcash"]',
  'iframe[src*="popads"]',
  'iframe[src*="hilltopads"]',
  'iframe[src*="ero-advertising"]',
  'iframe[src*="trafficstars"]',
  'iframe[src*="revcontent"]',
  'iframe[src*="mgid"]',

  // ── Structural Patterns — attribute-based ─────────────────────────────────
  '[data-ad-unit]',
  '[data-ad-slot]',
  '[data-ad-client]',
  '[data-banner-type]',
  'div[class*="ExoClick"]',
  'div[id*="ExoClick"]',
  'div[class*="ad-container"]',
  'div[class*="ad_container"]',
  'div[id*="ad-container"]',
  'div[id*="ad_container"]',
  'div[class*="ad-wrapper"]',
  'div[class*="ad_wrapper"]',
  'div[class*="banner-ad"]',
  'div[class*="banner_ad"]',
  'div[class*="sponsored-content"]',
  'div[class*="sponsored_content"]',

  // ── Taboola / Outbrain containers ─────────────────────────────────────────
  '.trc_rbox_container',
  '.trc_rbox_div',
  '.trc_related_container',
  '.outbrain',
  '.OUTBRAIN',
  '[data-widget-id*="ob_"]',
  '.mgid-widget',

  // ── Popup / Overlay Patterns ───────────────────────────────────────────────
  'div[class*="popup-ad"]',
  'div[id*="popup-ad"]',
  'div[class*="overlay-ad"]',
  'div[id*="overlay-ad"]',
  '.ad-overlay',
  '#ad-overlay',
];


// ─── Image Source Patterns (for aggressive img blocking in content script) ────
// When an <img> src matches any of these patterns, the image is hidden.
// This catches ads loaded as regular images bypassing DNR.
export const AD_IMAGE_PATTERNS = [
  /exoclick\.com/i,
  /trafficjunky\.(com|net)/i,
  /juicyads\.(com|net)/i,
  /adnium\.com/i,
  /propellerads\.com/i,
  /popcash\.net/i,
  /popads\.net/i,
  /hilltopads\.(com|net)/i,
  /ero-advertising\.com/i,
  /trafficstars\.com/i,
  /plugrush\.com/i,
  /adspyglass\.com/i,
  /revcontent\.com/i,
  /googlesyndication\.com/i,
  /doubleclick\.net/i,
];
