/**
 * Background Service Worker — Nafer Shield v3.0
 * Three-layer blocking: Static DNR + Dynamic Network Rules + Cosmetic CSS.
 * HealthService ensures the engine self-heals if Chrome disables rules silently.
 */

import { FilterEngine }        from './src/core/FilterEngine.js';
import { NetworkRulesEngine }  from './src/core/NetworkRulesEngine.js';
import { StorageAdapter }      from './src/infrastructure/storage/StorageAdapter.js';
import { StatsService }        from './src/application/services/StatsService.js';
import { FilterListService }   from './src/application/services/FilterListService.js';
import { HealthService }       from './src/application/services/HealthService.js';
import { MessageRouter }       from './src/background/MessageRouter.js';
import { AD_NETWORK_DOMAINS }  from './src/core/AdNetworks.js';

const _api = globalThis.chrome ?? globalThis.browser;

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const storage       = new StorageAdapter();
const engine        = new FilterEngine(storage);
const netEngine     = new NetworkRulesEngine();
const stats         = new StatsService(storage);
const filterLists   = new FilterListService(storage);
const health        = new HealthService(storage, () => initialize());
const router        = new MessageRouter({ engine, statsService: stats, filterListService: filterLists });

const MANIFEST_RULESETS = ['nafer-base', 'easylist-1', 'easylist-2'];

// ─── Core Initialization ──────────────────────────────────────────────────────
async function initialize() {
  console.log('[Nafer v3] Initializing...');

  try {
    await engine.initialize();
    await filterLists.initializeDefaultLists();

    const isEnabled = await engine.isEnabled();

    if (isEnabled) {
      // Layer 1: Static Rulesets (EasyList shards)
      const allLists = await filterLists.getAll();
      const toEnable = [];
      for (const list of allLists) {
        if (!list.enabled) continue;
        if (list.id === 'easylist')      toEnable.push('easylist-1', 'easylist-2');
        else if (MANIFEST_RULESETS.includes(list.id)) toEnable.push(list.id);
      }
      if (toEnable.length === 0) toEnable.push('nafer-base');
      const toDisable = MANIFEST_RULESETS.filter(id => !toEnable.includes(id));

      await _api.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: toEnable,
        disableRulesetIds: toDisable,
      });

      // Layer 2: Dynamic network rules (ad network domains)
      await netEngine.installAdNetworkRules();

      // Badge counter
      if (_api.declarativeNetRequest?.setExtensionActionOptions) {
        await _api.declarativeNetRequest.setExtensionActionOptions({
          displayActionCountAsBadgeText: true,
        });
      }

      // Real-time stats tracking
      if (_api.declarativeNetRequest?.onRuleMatchedDebug) {
        _api.declarativeNetRequest.onRuleMatchedDebug.removeListener(onRuleMatch);
        _api.declarativeNetRequest.onRuleMatchedDebug.addListener(onRuleMatch);
      }

      console.log(`[Nafer v3] 🛡️ Active: static=[${toEnable.join(',')}] + dynamic=${AD_NETWORK_DOMAINS.length} domains`);
    } else {
      await _api.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: MANIFEST_RULESETS,
      });
      await netEngine.uninstallAdNetworkRules();
      console.log('[Nafer v3] Protection disabled by user.');
    }
  } catch (err) {
    console.error('[Nafer v3] Init error:', err.message);
  }
}

function onRuleMatch(info) {
  stats.increment(info.tabId);
}

// ─── Startup Triggers ─────────────────────────────────────────────────────────
_api.runtime.onInstalled.addListener(() => initialize());
_api.runtime.onStartup.addListener(() => initialize());
initialize();

// ─── Alarms ───────────────────────────────────────────────────────────────────
_api.alarms?.create('nafer-keepalive',    { periodInMinutes: 0.5 });
_api.alarms?.create('nafer-health-check', { periodInMinutes: 5 });

_api.alarms?.onAlarm?.addListener(async (alarm) => {
  if (alarm.name === 'nafer-keepalive') {
    if (!engine.isReady()) await initialize();
    return;
  }

  if (alarm.name === 'nafer-health-check') {
    const isEnabled = await engine.isEnabled();
    if (!isEnabled) return; // no check needed when disabled

    await health.runCheck(
      MANIFEST_RULESETS,
      Math.floor(AD_NETWORK_DOMAINS.length * 0.9) // allow 10% margin
    );
  }
});

// ─── Message Router ───────────────────────────────────────────────────────────
_api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  router.handle(message, sender)
    .then(sendResponse)
    .catch(err => sendResponse({ error: err.message }));
  return true;
});

// ─── Tab Cleanup ──────────────────────────────────────────────────────────────
_api.tabs.onRemoved.addListener(tabId => stats.clearTab(tabId));
