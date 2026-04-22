/**
 * Background Service Worker — Entry Point
 * Nafer Shield Extension v3.1 (Safe Edition)
 *
 * Fixes:
 * - Instant Toggle (On/Off) via syncDNRState() and broadcastToTabs().
 * - Safe Ad Blocking (Google/YouTube excluded from dynamic lists).
 * - Self-healing via HealthService.
 */

import { FilterEngine }       from './src/core/FilterEngine.js';
import { NetworkRulesEngine } from './src/core/NetworkRulesEngine.js';
import { StorageAdapter }     from './src/infrastructure/storage/StorageAdapter.js';
import { StatsService }       from './src/application/services/StatsService.js';
import { FilterListService }  from './src/application/services/FilterListService.js';
import { HealthService }      from './src/application/services/HealthService.js';
import { MessageRouter }      from './src/background/MessageRouter.js';
import { AD_NETWORK_DOMAINS } from './src/core/AdNetworks.js';

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
  statsService:      stats,
  filterListService: filterLists,
  onEnabledChanged:  () => syncDNRState(), // Immediate re-sync on toggle
});

const MANIFEST_RULESETS = ['nafer-base', 'easylist-1', 'easylist-2'];

/**
 * Syncs the Declarative Net Request (DNR) state with current settings.
 * Lightweight function called on every toggle.
 */
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

      // Layer 2: Dynamic ad network rules
      await netEngine.installAdNetworkRules();
      console.log('[Nafer] 🛡️ Protection ENABLED');
    } else {
      // Complete shutdown
      await _api.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: MANIFEST_RULESETS,
      });
      await netEngine.uninstallAdNetworkRules();
      console.log('[Nafer] ⛔ Protection DISABLED');
    }

    // Notify all tabs to remove/re-apply cosmetic CSS immediately
    broadcastToTabs(isEnabled);
  } catch (err) {
    console.error('[Nafer] DNR sync failed:', err.message);
  }
}

/**
 * Notifies all open tabs about the current protection state.
 */
async function broadcastToTabs(enabled) {
  try {
    const tabs = await _api.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || tab.id < 0) continue;
      _api.tabs.sendMessage(tab.id, { type: 'PROTECTION_TOGGLED', enabled })
        .catch(() => {}); // Ignore errors for tabs without content script
    }
  } catch (err) {
    console.warn('[Nafer] Broadcast failed:', err.message);
  }
}

// ─── Initialization ───────────────────────────────────────────────────────────
async function initialize() {
  console.log('[Nafer v3.1] Initializing engine...');
  
  try {
    await engine.initialize();
    await filterLists.initializeDefaultLists();
    await syncDNRState();

    // Badge configuration
    if (_api.declarativeNetRequest?.setExtensionActionOptions) {
      await _api.declarativeNetRequest.setExtensionActionOptions({
        displayActionCountAsBadgeText: true
      });
    }

    // Stats listener
    if (_api.declarativeNetRequest?.onRuleMatchedDebug) {
      _api.declarativeNetRequest.onRuleMatchedDebug.removeListener(handleRuleMatch);
      _api.declarativeNetRequest.onRuleMatchedDebug.addListener(handleRuleMatch);
    }

    console.log('[Nafer v3.1] ✅ Ready');
  } catch (err) {
    console.error('[Nafer] Init error:', err.message);
  }
}

function handleRuleMatch(info) {
  stats.increment(info.tabId);
}

// ─── Lifecycle Events ─────────────────────────────────────────────────────────
_api.runtime.onInstalled.addListener(() => initialize());
_api.runtime.onStartup.addListener(() => initialize());
initialize();

// ─── Alarms (KeepAlive & Health) ─────────────────────────────────────────────
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

// ─── Message Handling ─────────────────────────────────────────────────────────
_api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  router.handle(message, sender)
    .then(sendResponse)
    .catch(err => sendResponse({ error: err.message }));
  return true;
});

// ─── Tab Cleanup ──────────────────────────────────────────────────────────────
_api.tabs.onRemoved.addListener(tabId => stats.clearTab(tabId));
