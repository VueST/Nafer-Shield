/**
 * Health Service — Nafer Shield v3.1
 * Monitors the extension state to ensure protection remains active.
 */

const _api = globalThis.chrome ?? globalThis.browser;

export class HealthService {
  constructor(storage, onRecover) {
    this.storage = storage;
    this.onRecover = onRecover;
  }

  /**
   * Checks if DNR rulesets and dynamic rules are correctly loaded.
   * If not, triggers recovery (initialization).
   */
  async runCheck(manifestRulesetIds, expectedDynamicCount) {
    console.log('[Health] Running state check...');

    try {
      // 1. Check static rulesets
      const enabledSets = await _api.declarativeNetRequest.getEnabledRulesets();
      const hasStatic = manifestRulesetIds.some(id => enabledSets.includes(id));

      // 2. Check dynamic rules
      const dynamicRules = await _api.declarativeNetRequest.getDynamicRules();
      const hasDynamic = dynamicRules.length >= expectedDynamicCount;

      if (!hasStatic || !hasDynamic) {
        console.warn('[Health] Missing active rules! Triggering recovery...', { hasStatic, hasDynamic });
        await this.onRecover();
        return false;
      }

      console.log('[Health] All systems healthy.');
      return true;
    } catch (err) {
      console.error('[Health] Check failed:', err.message);
      return false;
    }
  }
}
