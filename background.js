/**
 * Background Service Worker — Nafer Shield v3.1
 * Fixes: Toggle On/Off now works instantly via syncDNRState().
 * Fixes: YouTube no longer broken (removed Google CDN from dynamic blocklist).
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
const storage     = new StorageAdapter();
const engine      = new FilterEngine(storage);
const netEngine   = new NetworkRulesEngine();
const stats       = new StatsService(storage);
const filterLists = new FilterListService(storage);
const health      = new HealthService(storage, () => initialize());
const router      = new MessageRouter({
  engine,
  statsService:     stats,
  filterListService: filterLists,
  onEnabledChanged: () => syncDNRState(), // ← Toggle wired here
});

const MANIFEST_RULESETS = ['nafer-base', 'easylist-1', 'easylist-2'];

// ─── DNR Sync (lightweight — called on toggle) ────────────────────────────────
// Called whenever the user flips the global On/Off switch.
// Does NOT re-initialize engine state — only syncs DNR rules.
async function syncDNRState() {
  try {
    const isEnabled = await engine.isEnabled();

    if (isEnabled) {
      const allLists = await filterLists.getAll();
      const toEnable = [];
      for (const list of allLists) {
        if (!list.enabled) continue;
        if (list.id === 'easylist') toEnable.push('easylist-1', 'easylist-2');
        else if (MANIFEST_RULESETS.includes(list.id)) toEnable.push(list.id);
      }
      if (toEnable.length === 0) toEnable.push('nafer-base');
      const toDisable = MANIFEST_RULESETS.filter(id => !toEnable.includes(id));

      await _api.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds:  toEnable,
        disableRulesetIds: toDisable,
      });
      await netEngine.installAdNetworkRules();
      console.log('[Nafer] 🛡️ Protection ON');
    } else {
      // Disable everything immediately
      await _api.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: MANIFEST_RULESETS,
      });
      await netEngine.uninstallAdNetworkRules();
      console.log('[Nafer] ⛔ Protection OFF');
    }
  } catch (err) {
    console.error('[Nafer] syncDNRState error:', err.message);
  }
}

// ─── Full Initialization (called on startup/install) ─────────────────────────
async function initialize() {
  console.log('[Nafer v3.1] Initializing...');
  try {
    await engine.initialize();
    await filterLists.initializeDefaultLists();
    await syncDNRState(); // reuse the same logic

    // Badge counter
    if (_api.declarativeNetRequest?.setExtensionActionOptions) {
      await _api.declarativeNetRequest.setExtensionActionOptions({
        displayActionCountAsBadgeText: true,
      });
    }

    // Real-time stats
    if (_api.declarativeNetRequest?.onRuleMatchedDebug) {
      _api.declarativeNetRequest.onRuleMatchedDebug.removeListener(onRuleMatch);
      _api.declarativeNetRequest.onRuleMatchedDebug.addListener(onRuleMatch);
    }

    console.log('[Nafer v3.1] ✅ Ready');
  } catch (err) {
    console.error('[Nafer] Init error:', err.message);
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
_api.alarms?.create('nafer-health-check', { periodInMinutes: 5   });

_api.alarms?.onAlarm?.addListener(async (alarm) => {
  if (alarm.name === 'nafer-keepalive') {
    if (!engine.isReady()) await initialize();
    return;
  }
  if (alarm.name === 'nafer-health-check') {
    const isEnabled = await engine.isEnabled();
    if (!isEnabled) return;
    await health.runCheck(
      MANIFEST_RULESETS,
      Math.floor(AD_NETWORK_DOMAINS.length * 0.9)
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
