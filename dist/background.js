// src/core/FilterEngine.js
var _api = globalThis.chrome ?? globalThis.browser;
var FilterEngine = class {
  /** @param {import('../infrastructure/storage/StorageAdapter.js').StorageAdapter} storage */
  constructor(storage2) {
    this._storage = storage2;
    this._enabled = true;
    this._pausedDomains = [];
    this._isReady = false;
  }
  async initialize() {
    this._enabled = await this._storage.get("nafer_enabled") ?? true;
    this._pausedDomains = await this._storage.get("nafer_paused_domains") ?? [];
    this._isReady = true;
  }
  isReady() {
    return this._isReady;
  }
  async isEnabled() {
    return await this._storage.get("nafer_enabled") ?? this._enabled;
  }
  async isDomainPaused(hostname) {
    const paused = await this._storage.get("nafer_paused_domains") || [];
    return paused.includes(hostname);
  }
  async setEnabled(enabled) {
    this._enabled = enabled;
    await this._storage.set("nafer_enabled", enabled);
  }
  async toggleDomainPause(hostname) {
    let paused = await this._storage.get("nafer_paused_domains") || [];
    if (paused.includes(hostname)) {
      paused = paused.filter((d) => d !== hostname);
    } else {
      paused.push(hostname);
    }
    await this._storage.set("nafer_paused_domains", paused);
    return paused.includes(hostname);
  }
  /**
   * Generates powerful cosmetic CSS to hide ad containers.
   * In a full implementation, this would parse real filter lists.
   */
  getCSSForHost(hostname) {
    const genericSelectors = [
      'div[class*="ad-"]',
      'div[id*="ad-"]',
      'aside[class*="ad"]',
      'section[class*="ad"]',
      'iframe[src*="googleads"]',
      "ins.adsbygoogle",
      ".trc_rbox_container",
      ".outbrain",
      ".taboola-ad",
      "div[data-ad-unit]",
      'div[id^="google_ads_iframe"]',
      'div[class*="Sponsored"]',
      'div[class*="promoted"]'
    ];
    return `${genericSelectors.join(",\n")} { display: none !important; height: 0 !important; width: 0 !important; visibility: hidden !important; pointer-events: none !important; }`;
  }
};

// src/core/AdNetworks.js
var AD_NETWORK_DOMAINS = [
  // ── Mainstream Ad Networks ───────────────────────────────────────────────
  // NOTE: Google/YouTube infrastructure domains (doubleclick, googlesyndication)
  // are intentionally EXCLUDED here. They are already covered by EasyList static
  // rules with smarter per-context matching. Blocking them at domain level breaks
  // YouTube and other Google-powered sites.
  // ── Taboola / Outbrain ───────────────────────────────────────────────────
  "taboola.com",
  "trc.taboola.com",
  "cdn.taboola.com",
  "outbrain.com",
  "widgets.outbrain.com",
  "odb.outbrain.com",
  // ── Alternative / Adult-Friendly Ad Networks ─────────────────────────────
  // These networks operate on sites that are rejected by mainstream ad networks.
  "exoclick.com",
  "static.exoclick.com",
  "syndication.exoclick.com",
  "trafficjunky.com",
  "trafficjunky.net",
  "tjcrs.trafficjunky.com",
  "juicyads.com",
  "juicyads.net",
  "adnium.com",
  "ads.adnium.com",
  "cdn.adnium.com",
  "propellerads.com",
  "cdn.propellerads.com",
  "popcash.net",
  "cdn.popcash.net",
  "popads.net",
  "cpx.to",
  "hilltopads.com",
  "hilltopads.net",
  "adspyglass.com",
  "plugrush.com",
  "ero-advertising.com",
  // ── Tracker & Malware Networks ────────────────────────────────────────────
  "adf.ly",
  "linkbucks.com",
  "shorte.st",
  "ouo.io",
  "bc.vc",
  "sh.st",
  "adrinolinks.in",
  "shrink.pe",
  "cutfly.com",
  "upbam.com",
  // ── Popup / Push Notification Networks ───────────────────────────────────
  "onclickmax.com",
  "clickadu.com",
  "adskeeper.com",
  "dntx.com",
  "ad-stir.com",
  "content.ad",
  "revcontent.com",
  "mgid.com",
  "adx1.com",
  "natpal.com",
  "trafficstars.com",
  // ── Crypto Mining Scripts ─────────────────────────────────────────────────
  "coinhive.com",
  "coin-hive.com",
  "cryptonight.wasm.stream",
  "webmr.com",
  "monerominer.rocks",
  "minero.cc"
];

// src/core/NetworkRulesEngine.js
var _api2 = globalThis.chrome ?? globalThis.browser;
var DYNAMIC_RULE_ID_START = 1e5;
var NetworkRulesEngine = class {
  /**
   * Install all ad network block rules as DNR dynamic rules.
   * This is idempotent — calling it multiple times is safe.
   */
  async installAdNetworkRules() {
    if (!_api2?.declarativeNetRequest?.updateDynamicRules) {
      console.warn("[Nafer] Dynamic rules API not available.");
      return;
    }
    const newRules = AD_NETWORK_DOMAINS.map((domain, index) => ({
      id: DYNAMIC_RULE_ID_START + index,
      priority: 10,
      // Higher priority than static rules
      action: { type: "block" },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: [
          "main_frame",
          "sub_frame",
          "script",
          "image",
          "stylesheet",
          "xmlhttprequest",
          "media",
          "websocket",
          "other"
        ]
      }
    }));
    const existingRules = await _api2.declarativeNetRequest.getDynamicRules();
    const toRemove = existingRules.filter((r) => r.id >= DYNAMIC_RULE_ID_START).map((r) => r.id);
    await _api2.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: toRemove,
      addRules: newRules
    });
    console.log(`[Nafer] Installed ${newRules.length} dynamic ad network block rules.`);
  }
  /**
   * Remove all dynamic ad network rules (e.g. when protection is disabled).
   */
  async uninstallAdNetworkRules() {
    if (!_api2?.declarativeNetRequest?.updateDynamicRules)
      return;
    const existingRules = await _api2.declarativeNetRequest.getDynamicRules();
    const toRemove = existingRules.filter((r) => r.id >= DYNAMIC_RULE_ID_START).map((r) => r.id);
    if (toRemove.length > 0) {
      await _api2.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: toRemove,
        addRules: []
      });
      console.log(`[Nafer] Removed ${toRemove.length} dynamic rules.`);
    }
  }
};

// src/infrastructure/storage/StorageAdapter.js
var StorageAdapter = class {
  constructor() {
    this._api = (globalThis.chrome ?? globalThis.browser).storage.local;
  }
  /**
   * Get a value by key. Returns null on error (never throws).
   * @param {string} key
   * @returns {Promise<any>}
   */
  async get(key) {
    try {
      return await new Promise((resolve, reject) => {
        this._api.get(key, (result) => {
          const err = (globalThis.chrome ?? globalThis.browser).runtime.lastError;
          if (err)
            return reject(new Error(err.message));
          resolve(result[key] ?? null);
        });
      });
    } catch (e) {
      console.error(`[Nafer Shield] StorageAdapter.get("${key}") failed:`, e.message);
      return null;
    }
  }
  /**
   * Set a value. Silently fails on quota error (logs warning).
   * @param {string} key
   * @param {*} value
   */
  async set(key, value) {
    try {
      await new Promise((resolve, reject) => {
        this._api.set({ [key]: value }, () => {
          const err = (globalThis.chrome ?? globalThis.browser).runtime.lastError;
          if (err)
            return reject(new Error(err.message));
          resolve();
        });
      });
    } catch (e) {
      console.error(`[Nafer Shield] StorageAdapter.set("${key}") failed:`, e.message);
    }
  }
  /**
   * Remove a key. Safe — never throws.
   * @param {string} key
   */
  async remove(key) {
    try {
      await new Promise((resolve, reject) => {
        this._api.remove(key, () => {
          const err = (globalThis.chrome ?? globalThis.browser).runtime.lastError;
          if (err)
            return reject(new Error(err.message));
          resolve();
        });
      });
    } catch (e) {
      console.error(`[Nafer Shield] StorageAdapter.remove("${key}") failed:`, e.message);
    }
  }
  /**
   * Get multiple keys at once. Returns {} on error.
   * @param {string[]} keys
   * @returns {Promise<object>}
   */
  async getMany(keys) {
    try {
      return await new Promise((resolve, reject) => {
        this._api.get(keys, (result) => {
          const err = (globalThis.chrome ?? globalThis.browser).runtime.lastError;
          if (err)
            return reject(new Error(err.message));
          resolve(result);
        });
      });
    } catch (e) {
      console.error("[Nafer Shield] StorageAdapter.getMany() failed:", e.message);
      return {};
    }
  }
  /**
   * Get storage quota usage (bytes used / bytes total).
   * Useful for diagnostics.
   * @returns {Promise<{used: number, quota: number}>}
   */
  async getQuotaUsage() {
    try {
      return await new Promise((resolve) => {
        this._api.getBytesInUse(null, (used) => {
          resolve({ used, quota: this._api.QUOTA_BYTES ?? 10485760 });
        });
      });
    } catch {
      return { used: 0, quota: 0 };
    }
  }
};

// src/application/services/StatsService.js
var StatsService = class {
  /** @param {import('../../infrastructure/storage/StorageAdapter.js').StorageAdapter} storage */
  constructor(storage2) {
    this._storage = storage2;
    this._sessionCounts = /* @__PURE__ */ new Map();
    this._totalBlocked = 0;
    this._initialized = false;
  }
  /** Initialize total count from storage */
  async _ensureInitialized() {
    if (this._initialized)
      return;
    this._totalBlocked = await this._storage.get("nafer_total_blocked") ?? 0;
    this._initialized = true;
    console.log("[Nafer Shield] StatsService initialized. Total:", this._totalBlocked);
  }
  /**
   * Increment blocked count for a tab.
   * @param {number} tabId
   */
  async increment(tabId) {
    await this._ensureInitialized();
    const currentSession = this._sessionCounts.get(tabId) ?? 0;
    this._sessionCounts.set(tabId, currentSession + 1);
    this._totalBlocked++;
    this._storage.set("nafer_total_blocked", this._totalBlocked).catch(console.error);
    console.log(`[Nafer Shield] Stats ++ | Tab: ${this._sessionCounts.get(tabId)} | Total: ${this._totalBlocked}`);
  }
  /**
   * Sync a delta to the total count (used when popup detects more blocks than tracked).
   * @param {number} delta
   */
  async syncDelta(delta) {
    if (delta <= 0)
      return;
    await this._ensureInitialized();
    this._totalBlocked += delta;
    this._storage.set("nafer_total_blocked", this._totalBlocked).catch(console.error);
    console.log(`[Nafer Shield] Stats Sync | Added: ${delta} | New Total: ${this._totalBlocked}`);
  }
  /**
   * Get stats for a specific tab.
   * @param {number} tabId
   * @returns {{ session: number, total: number }}
   */
  async getForTab(tabId) {
    await this._ensureInitialized();
    const session = this._sessionCounts.get(tabId) ?? 0;
    return { session, total: this._totalBlocked };
  }
  /** Get global all-time blocked count */
  async getTotal() {
    await this._ensureInitialized();
    return this._totalBlocked;
  }
  /** Clear session stats for a closed tab */
  clearTab(tabId) {
    this._sessionCounts.delete(tabId);
  }
  /** Reset all statistics */
  async reset() {
    this._sessionCounts.clear();
    this._totalBlocked = 0;
    await this._storage.set("nafer_total_blocked", 0);
  }
};

// src/application/services/FilterListService.js
var _api3 = globalThis.chrome ?? globalThis.browser;
var BUILT_IN_LISTS = [
  {
    id: "nafer-base",
    name: "Nafer Base Filters",
    url: null,
    enabled: true,
    builtIn: true
  },
  {
    id: "easylist",
    name: "EasyList",
    url: "https://easylist.to/easylist/easylist.txt",
    enabled: true,
    builtIn: true
  }
];
var FilterListService = class {
  /** @param {import('../../infrastructure/storage/StorageAdapter.js').StorageAdapter} storage */
  constructor(storage2) {
    this._storage = storage2;
  }
  async initializeDefaultLists() {
    const existing = await this._storage.get("nafer_filter_lists");
    if (!existing) {
      await this._storage.set("nafer_filter_lists", BUILT_IN_LISTS);
    }
  }
  async getAll() {
    return await this._storage.get("nafer_filter_lists") ?? BUILT_IN_LISTS;
  }
  async toggle(id) {
    const lists = await this.getAll();
    const list = lists.find((l) => l.id === id);
    if (!list)
      return null;
    list.enabled = !list.enabled;
    await this._storage.set("nafer_filter_lists", lists);
    if (_api3?.declarativeNetRequest?.updateEnabledRulesets) {
      try {
        const rulesetIds = id === "easylist" ? ["easylist-1", "easylist-2"] : [id];
        await _api3.declarativeNetRequest.updateEnabledRulesets({
          enableRulesetIds: list.enabled ? rulesetIds : [],
          disableRulesetIds: list.enabled ? [] : rulesetIds
        });
      } catch (e) {
        console.warn(`[Nafer Shield] Toggle error for ${id}:`, e.message);
      }
    }
    return list;
  }
  async addCustom(name, url) {
    const lists = await this.getAll();
    const id = `custom-${Date.now()}`;
    lists.push({ id, name, url, enabled: true, builtIn: false });
    await this._storage.set("nafer_filter_lists", lists);
    return id;
  }
  async remove(id) {
    const lists = await this.getAll();
    const filtered = lists.filter((l) => l.id !== id);
    await this._storage.set("nafer_filter_lists", filtered);
  }
};

// src/application/services/HealthService.js
var _api4 = globalThis.chrome ?? globalThis.browser;
var HealthService = class {
  /**
   * @param {import('../../infrastructure/storage/StorageAdapter.js').StorageAdapter} storage
   * @param {Function} onUnhealthy - Callback to re-initialize the engine
   */
  constructor(storage2, onUnhealthy) {
    this._storage = storage2;
    this._onUnhealthy = onUnhealthy;
  }
  /**
   * Check that expected rulesets are actually active in the browser.
   * @param {string[]} expectedRulesetIds
   * @returns {Promise<boolean>} true if healthy
   */
  async checkRulesets(expectedRulesetIds) {
    if (!_api4?.declarativeNetRequest?.getEnabledRulesets)
      return true;
    try {
      const enabled = await _api4.declarativeNetRequest.getEnabledRulesets();
      const allActive = expectedRulesetIds.every((id) => enabled.includes(id));
      if (!allActive) {
        const missing = expectedRulesetIds.filter((id) => !enabled.includes(id));
        console.warn("[Nafer Health] Missing rulesets detected:", missing);
        return false;
      }
      await this._storage.set("nafer_last_healthy", Date.now());
      return true;
    } catch (err) {
      console.error("[Nafer Health] Ruleset check failed:", err.message);
      return false;
    }
  }
  /**
   * Check dynamic rules count to ensure they're still installed.
   * @param {number} expectedMinCount - Minimum number of dynamic rules expected
   * @returns {Promise<boolean>}
   */
  async checkDynamicRules(expectedMinCount) {
    if (!_api4?.declarativeNetRequest?.getDynamicRules)
      return true;
    try {
      const rules = await _api4.declarativeNetRequest.getDynamicRules();
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
      this.checkDynamicRules(expectedDynamicMin)
    ]);
    if (!rulesetsOk || !dynamicOk) {
      console.warn("[Nafer Health] Unhealthy state detected. Triggering re-init...");
      try {
        await this._onUnhealthy();
        console.log("[Nafer Health] Re-init successful.");
      } catch (err) {
        console.error("[Nafer Health] Re-init failed:", err.message);
      }
    } else {
      console.debug("[Nafer Health] All systems healthy ✅");
    }
  }
  /** Get last healthy timestamp for UI display */
  async getLastHealthy() {
    return this._storage.get("nafer_last_healthy");
  }
};

// src/background/MessageRouter.js
var MessageRouter = class {
  /**
   * @param {{
   *   engine: import('../core/FilterEngine.js').FilterEngine,
   *   statsService: import('../application/services/StatsService.js').StatsService,
   *   filterListService: import('../application/services/FilterListService.js').FilterListService,
   *   onEnabledChanged?: () => Promise<void>,
   * }} deps
   */
  constructor({ engine: engine2, statsService, filterListService, onEnabledChanged }) {
    this._engine = engine2;
    this._stats = statsService;
    this._lists = filterListService;
    this._onEnabledChanged = onEnabledChanged ?? (() => Promise.resolve());
  }
  /**
   * Handle an incoming message.
   * @param {{ type: string, payload?: * }} message
   * @param {chrome.runtime.MessageSender} sender
   * @returns {Promise<*>}
   */
  async handle(message, sender) {
    const { type, payload } = message;
    switch (type) {
      case "GET_STATUS": {
        const tabId = payload?.tabId;
        const domain = payload?.domain;
        const [enabled, paused, stats2] = await Promise.all([
          this._engine.isEnabled(),
          domain ? this._engine.isDomainPaused(domain) : false,
          tabId ? this._stats.getForTab(tabId) : { session: 0, total: 0 }
        ]);
        return { enabled, paused, stats: stats2 };
      }
      case "SET_ENABLED": {
        await this._engine.setEnabled(payload.enabled);
        await this._onEnabledChanged();
        return { ok: true };
      }
      case "TOGGLE_DOMAIN_PAUSE": {
        const isPaused = await this._engine.toggleDomainPause(payload.domain);
        return { isPaused };
      }
      case "GET_FILTER_LISTS": {
        const lists = await this._lists.getAll();
        const lastUpdated = await this._lists.getLastUpdated();
        return { lists, lastUpdated };
      }
      case "TOGGLE_FILTER_LIST": {
        const list = await this._lists.toggle(payload.id);
        return { list };
      }
      case "ADD_CUSTOM_LIST": {
        const id = await this._lists.addCustom(payload.name, payload.url);
        return { id };
      }
      case "REMOVE_CUSTOM_LIST": {
        await this._lists.remove(payload.id);
        return { ok: true };
      }
      case "GET_STATS": {
        const total = await this._stats.getTotal();
        return { total };
      }
      case "SYNC_STATS": {
        await this._stats.syncDelta(payload.delta);
        return { ok: true };
      }
      case "RESET_STATS": {
        await this._stats.reset();
        return { ok: true };
      }
      case "GET_COSMETIC_CSS": {
        const css = this._engine.getCSSForHost(payload.hostname);
        return { css };
      }
      case "PING":
        return { pong: true };
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  }
};

// background.js
var _api5 = globalThis.chrome ?? globalThis.browser;
var storage = new StorageAdapter();
var engine = new FilterEngine(storage);
var netEngine = new NetworkRulesEngine();
var stats = new StatsService(storage);
var filterLists = new FilterListService(storage);
var health = new HealthService(storage, () => initialize());
var router = new MessageRouter({
  engine,
  statsService: stats,
  filterListService: filterLists,
  onEnabledChanged: () => syncDNRState()
  // ← Toggle wired here
});
var MANIFEST_RULESETS = ["nafer-base", "easylist-1", "easylist-2"];
async function syncDNRState() {
  try {
    const isEnabled2 = await engine.isEnabled();
    if (isEnabled2) {
      const allLists = await filterLists.getAll();
      const toEnable = [];
      for (const list of allLists) {
        if (!list.enabled)
          continue;
        if (list.id === "easylist")
          toEnable.push("easylist-1", "easylist-2");
        else if (MANIFEST_RULESETS.includes(list.id))
          toEnable.push(list.id);
      }
      if (toEnable.length === 0)
        toEnable.push("nafer-base");
      const toDisable = MANIFEST_RULESETS.filter((id) => !toEnable.includes(id));
      await _api5.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: toEnable,
        disableRulesetIds: toDisable
      });
      await netEngine.installAdNetworkRules();
      console.log("[Nafer] 🛡️ Protection ON");
    } else {
      await _api5.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: MANIFEST_RULESETS
      });
      await netEngine.uninstallAdNetworkRules();
      console.log("[Nafer] ⛔ Protection OFF");
    }
  } catch (err) {
    console.error("[Nafer] syncDNRState error:", err.message);
  }
  broadcastToTabs(isEnabled);
}
async function broadcastToTabs(enabled) {
  try {
    const tabs = await _api5.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || tab.id < 0)
        continue;
      _api5.tabs.sendMessage(tab.id, { type: "PROTECTION_TOGGLED", enabled }).catch(() => {
      });
    }
  } catch {
  }
}
async function initialize() {
  console.log("[Nafer v3.1] Initializing...");
  try {
    await engine.initialize();
    await filterLists.initializeDefaultLists();
    await syncDNRState();
    if (_api5.declarativeNetRequest?.setExtensionActionOptions) {
      await _api5.declarativeNetRequest.setExtensionActionOptions({
        displayActionCountAsBadgeText: true
      });
    }
    if (_api5.declarativeNetRequest?.onRuleMatchedDebug) {
      _api5.declarativeNetRequest.onRuleMatchedDebug.removeListener(onRuleMatch);
      _api5.declarativeNetRequest.onRuleMatchedDebug.addListener(onRuleMatch);
    }
    console.log("[Nafer v3.1] ✅ Ready");
  } catch (err) {
    console.error("[Nafer] Init error:", err.message);
  }
}
function onRuleMatch(info) {
  stats.increment(info.tabId);
}
_api5.runtime.onInstalled.addListener(() => initialize());
_api5.runtime.onStartup.addListener(() => initialize());
initialize();
_api5.alarms?.create("nafer-keepalive", { periodInMinutes: 0.5 });
_api5.alarms?.create("nafer-health-check", { periodInMinutes: 5 });
_api5.alarms?.onAlarm?.addListener(async (alarm) => {
  if (alarm.name === "nafer-keepalive") {
    if (!engine.isReady())
      await initialize();
    return;
  }
  if (alarm.name === "nafer-health-check") {
    const isEnabled2 = await engine.isEnabled();
    if (!isEnabled2)
      return;
    await health.runCheck(
      MANIFEST_RULESETS,
      Math.floor(AD_NETWORK_DOMAINS.length * 0.9)
    );
  }
});
_api5.runtime.onMessage.addListener((message, sender, sendResponse) => {
  router.handle(message, sender).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
  return true;
});
_api5.tabs.onRemoved.addListener((tabId) => stats.clearTab(tabId));
