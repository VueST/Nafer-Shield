/**
 * Network Rules Engine — Nafer Shield v3.1
 * Manages declarativeNetRequest dynamic rules for ad networks.
 */

import { AD_NETWORK_DOMAINS } from './AdNetworks.js';

const _api = globalThis.chrome ?? globalThis.browser;

export class NetworkRulesEngine {
  constructor() {
    this.BASE_RULE_ID = 100000; // Start dynamic rules high to avoid conflicts
  }

  /**
   * Installs dynamic rules for the registered ad network domains.
   */
  async installAdNetworkRules() {
    if (!_api.declarativeNetRequest) return;

    try {
      // 1. Get existing dynamic rules from this engine
      const existing = await _api.declarativeNetRequest.getDynamicRules();
      const toRemove = existing
        .filter(r => r.id >= this.BASE_RULE_ID)
        .map(r => r.id);

      // 2. Build new rules
      const addRules = AD_NETWORK_DOMAINS.map((domain, index) => ({
        id: this.BASE_RULE_ID + index,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: domain,
          resourceTypes: ['script', 'sub_frame', 'image', 'xmlhttprequest', 'ping', 'other'],
        },
      }));

      // 3. Atomic update
      await _api.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: toRemove,
        addRules: addRules,
      });

      console.log(`[NetworkEngine] Installed ${addRules.length} dynamic ad network rules.`);
    } catch (err) {
      console.error('[NetworkEngine] Failed to install dynamic rules:', err.message);
    }
  }

  /**
   * Completely removes all dynamic ad network rules.
   */
  async uninstallAdNetworkRules() {
    if (!_api.declarativeNetRequest) return;

    try {
      const existing = await _api.declarativeNetRequest.getDynamicRules();
      const toRemove = existing
        .filter(r => r.id >= this.BASE_RULE_ID)
        .map(r => r.id);

      if (toRemove.length > 0) {
        await _api.declarativeNetRequest.updateDynamicRules({ removeRuleIds: toRemove });
        console.log(`[NetworkEngine] Uninstalled ${toRemove.length} dynamic rules.`);
      }
    } catch (err) {
      console.error('[NetworkEngine] Failed to uninstall dynamic rules:', err.message);
    }
  }
}
