/**
 * Background Service Worker — Entry Point
 * Nafer Shield Extension v2
 */

import { FilterEngine }      from './src/core/FilterEngine.js';
import { StorageAdapter }    from './src/infrastructure/storage/StorageAdapter.js';
import { StatsService }      from './src/application/services/StatsService.js';
import { FilterListService } from './src/application/services/FilterListService.js';
import { MessageRouter }     from './src/background/MessageRouter.js';

const _api = globalThis.chrome ?? globalThis.browser;

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const storage     = new StorageAdapter();
const engine      = new FilterEngine(storage);
const stats       = new StatsService(storage);
const filterLists = new FilterListService(storage);
const router      = new MessageRouter({ engine, statsService: stats, filterListService: filterLists });

// ─── Initialization ───────────────────────────────────────────────────────────
async function initialize() {
  console.log('[Nafer Shield] Waking up and synchronizing state...');
  
  await engine.initialize();
  await filterLists.initializeDefaultLists();

  // Sync all enabled rulesets
  const isEnabled = await engine.isEnabled();
  if (isEnabled) {
    const allLists = await filterLists.getAll();
    const enabledIds = allLists.filter(l => l.enabled).map(l => l.id);
    const disabledIds = allLists.filter(l => !l.enabled).map(l => l.id);

    try {
      await _api.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: enabledIds,
        disableRulesetIds: disabledIds
      });
      console.log(`[Nafer Shield] Synced ${enabledIds.length} rulesets.`);
    } catch (e) {
      console.warn('[Nafer Shield] Ruleset sync warning:', e.message);
    }
  }

  // Set badge options
  _api.declarativeNetRequest?.setExtensionActionOptions?.({
    displayActionCountAsBadgeText: true,
  });

  // ── Stats Tracking ──
  // Works in Unpacked/Developer mode extensions with declarativeNetRequestFeedback permission.
  if (_api.declarativeNetRequest?.onRuleMatchedDebug) {
    _api.declarativeNetRequest.onRuleMatchedDebug.removeListener(handleRuleMatch);
    _api.declarativeNetRequest.onRuleMatchedDebug.addListener(handleRuleMatch);
  }

  console.log('[Nafer Shield] Engine initialized and ready.');
}

function handleRuleMatch(info) {
  stats.increment(info.tabId);
}

initialize().catch(err => console.error('[Nafer Shield] Init error:', err));

// ─── Service Worker Keepalive ─────────────────────────────────────────────────
_api.alarms?.create('nafer-keepalive', { periodInMinutes: 0.4 });

_api.alarms?.onAlarm?.addListener(async (alarm) => {
  if (alarm.name === 'nafer-keepalive') {
    if (!engine.isReady()) await initialize();
    return;
  }
  if (alarm.name === 'nafer-update-lists') {
    await filterLists.markUpdated();
  }
});

// ─── Message Listener ─────────────────────────────────────────────────────────
_api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  router
    .handle(message, sender)
    .then(sendResponse)
    .catch(err => sendResponse({ error: err.message }));
  return true;
});

_api.tabs.onRemoved.addListener((tabId) => {
  stats.clearTab(tabId);
});
