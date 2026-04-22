/**
 * NetworkRulesEngine — Core Domain Layer
 * Manages dynamic DNR rules that block ad networks at the network level.
 *
 * DNR Dynamic Rules vs Static Rulesets:
 * - Static: compiled JSON files, max 30K rules per file, fast but requires rebuild.
 * - Dynamic: injected at runtime via updateDynamicRules(), max 5K rules total,
 *            instant effect, survive extension restarts.
 *
 * We use Dynamic Rules for the ad network domain blocklist because:
 * 1. It survives service worker restarts automatically.
 * 2. No 30K per-file limit concern (we stay well under 5K).
 * 3. Changes take effect immediately without a page reload.
 */

import { AD_NETWORK_DOMAINS } from './AdNetworks.js';

const _api = globalThis.chrome ?? globalThis.browser;

// Rule ID range reserved for dynamic network blocks (avoid collisions with static)
const DYNAMIC_RULE_ID_START = 100_000;

export class NetworkRulesEngine {
  /**
   * Install all ad network block rules as DNR dynamic rules.
   * This is idempotent — calling it multiple times is safe.
   */
  async installAdNetworkRules() {
    if (!_api?.declarativeNetRequest?.updateDynamicRules) {
      console.warn('[Nafer] Dynamic rules API not available.');
      return;
    }

    // Build rules from the centralized AdNetworks registry
    const newRules = AD_NETWORK_DOMAINS.map((domain, index) => ({
      id: DYNAMIC_RULE_ID_START + index,
      priority: 10, // Higher priority than static rules
      action: { type: 'block' },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: [
          'main_frame',
          'sub_frame',
          'script',
          'image',
          'stylesheet',
          'xmlhttprequest',
          'media',
          'websocket',
          'other',
        ],
      },
    }));

    // First remove any previously installed dynamic rules in our range
    const existingRules = await _api.declarativeNetRequest.getDynamicRules();
    const toRemove = existingRules
      .filter(r => r.id >= DYNAMIC_RULE_ID_START)
      .map(r => r.id);

    await _api.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: toRemove,
      addRules: newRules,
    });

    console.log(`[Nafer] Installed ${newRules.length} dynamic ad network block rules.`);
  }

  /**
   * Remove all dynamic ad network rules (e.g. when protection is disabled).
   */
  async uninstallAdNetworkRules() {
    if (!_api?.declarativeNetRequest?.updateDynamicRules) return;

    const existingRules = await _api.declarativeNetRequest.getDynamicRules();
    const toRemove = existingRules
      .filter(r => r.id >= DYNAMIC_RULE_ID_START)
      .map(r => r.id);

    if (toRemove.length > 0) {
      await _api.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: toRemove,
        addRules: [],
      });
      console.log(`[Nafer] Removed ${toRemove.length} dynamic rules.`);
    }
  }
}
