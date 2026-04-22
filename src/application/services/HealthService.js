/**
 * HealthService — Application Layer
 * Monitors the extension's operational state and self-heals when issues are detected.
 *
 * Responsibilities:
 *   - Verify that DNR rulesets are actually enabled (not silently disabled by Chrome).
 *   - Track last-known-good timestamp.
 *   - Expose health status to the UI.
 */

const _api = globalThis.chrome ?? globalThis.browser;

export class HealthService {
  /**
   * @param {import('../../infrastructure/storage/StorageAdapter.js').StorageAdapter} storage
   * @param {Function} onUnhealthy - Callback to re-initialize the engine
   */
  constructor(storage, onUnhealthy) {
    this._storage     = storage;
    this._onUnhealthy = onUnhealthy;
  }

  /**
   * Check that expected rulesets are actually active in the browser.
   * @param {string[]} expectedRulesetIds
   * @returns {Promise<boolean>} true if healthy
   */
  async checkRulesets(expectedRulesetIds) {
    if (!_api?.declarativeNetRequest?.getEnabledRulesets) return true;

    try {
      const enabled = await _api.declarativeNetRequest.getEnabledRulesets();
      const allActive = expectedRulesetIds.every(id => enabled.includes(id));

      if (!allActive) {
        const missing = expectedRulesetIds.filter(id => !enabled.includes(id));
        console.warn('[Nafer Health] Missing rulesets detected:', missing);
        return false;
      }

      await this._storage.set('nafer_last_healthy', Date.now());
      return true;
    } catch (err) {
      console.error('[Nafer Health] Ruleset check failed:', err.message);
      return false;
    }
  }

  /**
   * Check dynamic rules count to ensure they're still installed.
   * @param {number} expectedMinCount - Minimum number of dynamic rules expected
   * @returns {Promise<boolean>}
   */
  async checkDynamicRules(expectedMinCount) {
    if (!_api?.declarativeNetRequest?.getDynamicRules) return true;

    try {
      const rules = await _api.declarativeNetRequest.getDynamicRules();
      return rules.length >= expectedMinCount;
    } catch {
      return false;
    }
  }

  /**
   * Full health check — runs both ruleset and dynamic rule checks.
   * If unhealthy, calls the onUnhealthy callback to trigger re-initialization.
   * @param {string[]} expectedRulesetIds
   * @param {number} expectedDynamicMin
   */
  async runCheck(expectedRulesetIds, expectedDynamicMin) {
    const [rulesetsOk, dynamicOk] = await Promise.all([
      this.checkRulesets(expectedRulesetIds),
      this.checkDynamicRules(expectedDynamicMin),
    ]);

    if (!rulesetsOk || !dynamicOk) {
      console.warn('[Nafer Health] Unhealthy state detected. Triggering re-init...');
      try {
        await this._onUnhealthy();
        console.log('[Nafer Health] Re-init successful.');
      } catch (err) {
        console.error('[Nafer Health] Re-init failed:', err.message);
      }
    } else {
      console.debug('[Nafer Health] All systems healthy ✅');
    }
  }

  /** Get last healthy timestamp for UI display */
  async getLastHealthy() {
    return this._storage.get('nafer_last_healthy');
  }
}
