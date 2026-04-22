/**
 * Background Service Worker — Entry Point
 * Nafer Shield Extension v2.2
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

const MANIFEST_RULESETS = ['nafer-base', 'easylist-1', 'easylist-2'];

// ─── Initialization ───────────────────────────────────────────────────────────
async function initialize() {
  console.log('[Nafer Shield] Initializing hardened engine...');
  
  try {
    await engine.initialize();
    await filterLists.initializeDefaultLists();

    const isEnabled = await engine.isEnabled();
    
    if (isEnabled) {
      const allLists = await filterLists.getAll();
      let toEnable = [];

      allLists.forEach(list => {
        if (!list.enabled) return;
        
        if (list.id === 'easylist') {
          toEnable.push('easylist-1', 'easylist-2');
        } else if (MANIFEST_RULESETS.includes(list.id)) {
          toEnable.push(list.id);
        }
      });

      // Guarantee nafer-base is always tried if enabled
      if (toEnable.length === 0) toEnable.push('nafer-base');

      const toDisable = MANIFEST_RULESETS.filter(id => !toEnable.includes(id));

      await _api.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: toEnable,
        disableRulesetIds: toDisable
      });
      
      console.log(`[Nafer Shield] Protection ON. Active: ${toEnable.join(', ')}`);
    } else {
      await _api.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: MANIFEST_RULESETS
      });
      console.log('[Nafer Shield] Protection OFF.');
    }

    // Badge
    if (_api.declarativeNetRequest?.setExtensionActionOptions) {
      await _api.declarativeNetRequest.setExtensionActionOptions({
        displayActionCountAsBadgeText: true
      });
    }

    // Listener
    if (_api.declarativeNetRequest?.onRuleMatchedDebug) {
      _api.declarativeNetRequest.onRuleMatchedDebug.removeListener(handleRuleMatch);
      _api.declarativeNetRequest.onRuleMatchedDebug.addListener(handleRuleMatch);
    }

  } catch (err) {
    console.error('[Nafer Shield] Init error:', err.message);
  }
}

function handleRuleMatch(info) {
  stats.increment(info.tabId);
}

initialize();

_api.alarms?.create('nafer-keepalive', { periodInMinutes: 0.5 });
_api.alarms?.onAlarm?.addListener(async (alarm) => {
  if (alarm.name === 'nafer-keepalive' && !engine.isReady()) await initialize();
});

_api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  router.handle(message, sender).then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true;
});

_api.tabs.onRemoved.addListener(tabId => stats.clearTab(tabId));
