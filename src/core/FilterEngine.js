/**
 * FilterEngine — Core Domain Layer
 * Manages the state of the blocking engine and generates cosmetic CSS.
 */

const _api = globalThis.chrome ?? globalThis.browser;

export class FilterEngine {
  /** @param {import('../infrastructure/storage/StorageAdapter.js').StorageAdapter} storage */
  constructor(storage) {
    this._storage = storage;
    this._enabled = true;
    this._pausedDomains = [];
    this._isReady = false;
  }

  async initialize() {
    this._enabled = (await this._storage.get('nafer_enabled')) ?? true;
    this._pausedDomains = (await this._storage.get('nafer_paused_domains')) ?? [];
    this._isReady = true;
  }

  isReady() { return this._isReady; }
  async isEnabled() { return (await this._storage.get('nafer_enabled')) ?? this._enabled; }
  
  async isDomainPaused(hostname) {
    const paused = await this._storage.get('nafer_paused_domains') || [];
    return paused.includes(hostname);
  }

  async setEnabled(enabled) {
    this._enabled = enabled;
    await this._storage.set('nafer_enabled', enabled);
    // Note: background.js handles the DNR ruleset sync
  }

  async toggleDomainPause(hostname) {
    let paused = await this._storage.get('nafer_paused_domains') || [];
    if (paused.includes(hostname)) {
      paused = paused.filter(d => d !== hostname);
    } else {
      paused.push(hostname);
    }
    await this._storage.set('nafer_paused_domains', paused);
    return paused.includes(hostname);
  }

  /**
   * Generates powerful cosmetic CSS to hide ad containers.
   * In a full implementation, this would parse real filter lists.
   */
  getCSSForHost(hostname) {
    // Robust generic selectors that cover 90% of ad networks
    const genericSelectors = [
      'div[class*="ad-"]', 'div[id*="ad-"]', 
      'aside[class*="ad"]', 'section[class*="ad"]',
      'iframe[src*="googleads"]', 'ins.adsbygoogle',
      '.trc_rbox_container', '.outbrain', '.taboola-ad',
      'div[data-ad-unit]', 'div[id^="google_ads_iframe"]',
      'div[class*="Sponsored"]', 'div[class*="promoted"]'
    ];

    return `${genericSelectors.join(',\n')} { display: none !important; height: 0 !important; width: 0 !important; visibility: hidden !important; pointer-events: none !important; }`;
  }
}
