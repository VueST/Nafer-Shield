/**
 * Ad Networks Registry — Nafer Shield v3.1 (Safe Edition)
 *
 * This file contains domains of alternative ad networks (ExoClick, TrafficJunky, etc.)
 * and CSS patterns for cosmetic filtering.
 *
 * CRITICAL: Google/YouTube infrastructure domains are EXCLUDED here to prevent breaking
 * mainstream site UIs. EasyList handles those via static DNR rules.
 */

export const AD_NETWORK_DOMAINS = [
  // ─── Alternative Ad Networks (The "Hard" Ones) ───────────────────────────
  'exoclick.com',
  'trafficjunky.com',
  'trafficjunky.net',
  'juicyads.com',
  'juicyads.net',
  'adnium.com',
  'propellerads.com',
  'popcash.net',
  'popads.net',
  'hilltopads.com',
  'hilltopads.net',
  'ero-advertising.com',
  'trafficstars.com',
  'plugrush.com',
  'adspyglass.com',
  'revcontent.com',
  'mgid.com',
  'onclickmax.com',
  'clickadu.com',
  'adskeeper.com',
  'adf.ly',
  'linkbucks.com',
  'shorte.st',
  'coinhive.com',
  'coin-hive.com',
  'cpx.to',
  'popcash.net',
  'taboola.com',
  'outbrain.com',
  'natpal.com',
];

export const COSMETIC_PATTERNS = [
  // ─── Generic Ad Selectors (Standard industry names) ───────────────────────
  'ins.adsbygoogle',
  'amp-ad',
  '[id^="div-gpt-ad"]',
  '[data-ad-unit]',
  '[data-ad-slot]',
  '[data-ad-client]',

  // ─── Aggressive Structural Selectors ──────────────────────────────────────
  'iframe[src*="exoclick"]',
  'iframe[src*="trafficjunky"]',
  'iframe[src*="juicyads"]',
  'a[href*="exoclick"]',
  'a[href*="trafficjunky"]',
  'a[href*="juicyads"]',

  // ─── Common Ad Container Classes ──────────────────────────────────────────
  '.ad-container',
  '.ad-wrapper',
  '.ad-banner',
  '.ad-placement',
  '[class*="AdBox"]',
  '[class*="AdContainer"]',
  '[class*="AdWrapper"]',
];
