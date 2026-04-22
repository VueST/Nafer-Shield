/**
 * FilterEngine — Domain Layer
 * Orchestrates network + cosmetic filtering.
 *
 * Fix 5 applied: `initialize()` now restores `enabled` state from storage on
 * every service worker wake-up, so the user's choice is never lost after ~30s.
 */
import { CosmeticFilter }   from './CosmeticFilter.js';
import { FilterListParser }  from './FilterListParser.js';

const _api = globalThis.chrome ?? globalThis.browser;

// IDs of rule sets declared in manifest.json that we manage
const STATIC_RULESETS = ['nafer-base', 'easylist'];

export class FilterEngine {
  /** @param {import('../infrastructure/storage/StorageAdapter.js').StorageAdapter} storage */
  constructor(storage) {
    this._storage     = storage;
    this._cosmetic    = new CosmeticFilter();
    this._initialized = false;
    this._enabled     = true;
  }

  /**
   * Initialize from stored data.
   * Called on every service worker wake-up — restores state from storage.
   */
  async initialize() {
    // ── Fix 5: Restore persisted enabled state ────────────────────────────────
    const storedEnabled = await this._storage.get('nafer_enabled');
    this._enabled = storedEnabled !== false; // default: enabled

    // Reapply to DNR on every worker startup (state may have drifted after sleep)
    await this._applyEnabledState(this._enabled);

    // ── Cosmetic rules ────────────────────────────────────────────────────────
    const cosmeticData = await this._storage.get('nafer_cosmetic_rules');
    if (cosmeticData) {
      this._cosmetic = CosmeticFilter.fromSerialized(cosmeticData);
    }

    this._initialized = true;
    console.log(`[Nafer Shield] FilterEngine ready. enabled=${this._enabled}`);
  }

  /** Returns true if engine has been initialized this worker lifetime */
  isReady() {
    return this._initialized;
  }

  /**
   * Load and index a raw filter list text.
   * @param {string} _id  unique list ID (unused for DNR — rules are pre-compiled)
   * @param {string} text raw EasyList text
   */
  async loadFilterList(_id, text) {
    const { cosmetic } = FilterListParser.parse(text);
    this._cosmetic.load(cosmetic);
    await this._storage.set('nafer_cosmetic_rules', this._cosmetic.serialize());
  }

  /**
   * Get CSS to inject for a hostname.
   * @param {string} hostname
   * @returns {string}
   */
  getCSSForHost(hostname) {
    if (!this._initialized) return '';
    return this._cosmetic.getCSSForHost(hostname);
  }

  /** Check if a domain is paused (allowlisted) */
  async isDomainPaused(domain) {
    const paused = (await this._storage.get('nafer_paused_domains')) ?? [];
    return paused.includes(domain);
  }

  /** Toggle pause state for a domain */
  async toggleDomainPause(domain) {
    const paused = (await this._storage.get('nafer_paused_domains')) ?? [];
    const idx = paused.indexOf(domain);
    if (idx === -1) {
      paused.push(domain);
    } else {
      paused.splice(idx, 1);
    }
    await this._storage.set('nafer_paused_domains', paused);
    await this._syncDomainAllowlist(paused);
    return idx === -1; // true = now paused
  }

  /** @private Sync DNR dynamic rules with paused domains list */
  async _syncDomainAllowlist(pausedDomains) {
    if (!_api?.declarativeNetRequest) return;

    const existing   = await _api.declarativeNetRequest.getDynamicRules();
    const toRemove   = existing.filter(r => r.id >= 90000).map(r => r.id);
    const toAdd      = pausedDomains.map((domain, i) => ({
      id: 90000 + i,
      priority: 9999,
      action: { type: 'allow' },
      condition: { requestDomains: [domain] },
    }));

    await _api.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: toRemove,
      addRules: toAdd,
    });
  }

  /** Global enable / disable */
  async setEnabled(enabled) {
    this._enabled = enabled;
    await this._storage.set('nafer_enabled', enabled);
    await this._applyEnabledState(enabled);
  }

  /** Get enabled state (from memory — always correct after initialize()) */
  async isEnabled() {
    return this._enabled;
  }

  /** @private Apply enabled state to DNR static rulesets */
  async _applyEnabledState(enabled) {
    if (!_api?.declarativeNetRequest?.updateEnabledRulesets) return;
    try {
      await _api.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds:  enabled ? STATIC_RULESETS : [],
        disableRulesetIds: enabled ? [] : STATIC_RULESETS,
      });
    } catch (e) {
      // Ruleset IDs not matching manifest are silently ignored
      console.warn('[Nafer Shield] updateEnabledRulesets:', e.message);
    }
  }
}
