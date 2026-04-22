// src/core/CosmeticFilter.js
var CosmeticFilter = class _CosmeticFilter {
  constructor() {
    this._domainRules = /* @__PURE__ */ new Map();
    this._genericRules = /* @__PURE__ */ new Set();
    this._exceptions = /* @__PURE__ */ new Set();
  }
  /**
   * Load cosmetic rules from parsed filter list.
   * @param {Array<{domains: string[], selector: string, isException: boolean}>} rules
   */
  load(rules) {
    for (const rule of rules) {
      if (rule.isException) {
        this._exceptions.add(rule.selector);
        continue;
      }
      if (rule.domains.length === 0) {
        this._genericRules.add(rule.selector);
      } else {
        for (const domain of rule.domains) {
          if (!this._domainRules.has(domain)) {
            this._domainRules.set(domain, /* @__PURE__ */ new Set());
          }
          this._domainRules.get(domain).add(rule.selector);
        }
      }
    }
  }
  /**
   * Get CSS hide rules for a given hostname.
   * @param {string} hostname
   * @returns {string} CSS text to inject
   */
  getCSSForHost(hostname) {
    const selectors = new Set(this._genericRules);
    const parts = hostname.split(".");
    for (let i = 0; i < parts.length - 1; i++) {
      const domain = parts.slice(i).join(".");
      const domainSelectors = this._domainRules.get(domain);
      if (domainSelectors) {
        for (const s of domainSelectors)
          selectors.add(s);
      }
    }
    for (const ex of this._exceptions)
      selectors.delete(ex);
    if (selectors.size === 0)
      return "";
    return [...selectors].join(",\n") + " { display: none !important; }";
  }
  /** Serialize to plain object for storage */
  serialize() {
    return {
      generic: [...this._genericRules],
      domain: Object.fromEntries(
        [...this._domainRules.entries()].map(([k, v]) => [k, [...v]])
      ),
      exceptions: [...this._exceptions]
    };
  }
  /** Deserialize from storage */
  static fromSerialized(data) {
    const filter = new _CosmeticFilter();
    filter._genericRules = new Set(data.generic ?? []);
    filter._exceptions = new Set(data.exceptions ?? []);
    for (const [domain, selectors] of Object.entries(data.domain ?? {})) {
      filter._domainRules.set(domain, new Set(selectors));
    }
    return filter;
  }
};

// src/core/FilterListParser.js
var FilterListParser = class {
  /**
   * Parse raw filter list text into an array of rule objects.
   * @param {string} text
   * @returns {{ network: NetworkRule[], cosmetic: CosmeticRule[] }}
   */
  static parse(text) {
    const network = [];
    const cosmetic = [];
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("!") || line.startsWith("["))
        continue;
      const cosmeticMatch = line.match(/^([^#]*)#(@)?#\??(.*)/);
      if (cosmeticMatch) {
        const [, domains, exception, selector] = cosmeticMatch;
        cosmetic.push({
          domains: domains ? domains.split(",").map((d) => d.trim()).filter(Boolean) : [],
          selector: selector.trim(),
          isException: Boolean(exception)
        });
        continue;
      }
      const netRule = this._parseNetworkRule(line);
      if (netRule)
        network.push(netRule);
    }
    return { network, cosmetic };
  }
  /** @private */
  static _parseNetworkRule(line) {
    if (!line)
      return null;
    const isException = line.startsWith("@@");
    const pattern = isException ? line.slice(2) : line;
    const dollarIdx = pattern.lastIndexOf("$");
    let urlPattern = pattern;
    const options = {};
    if (dollarIdx !== -1) {
      urlPattern = pattern.slice(0, dollarIdx);
      const opts = pattern.slice(dollarIdx + 1).split(",");
      for (const opt of opts) {
        const [key, val] = opt.trim().split("=");
        options[key.replace(/^~/, "")] = val ?? true;
      }
    }
    if (!urlPattern)
      return null;
    return {
      pattern: urlPattern,
      isException,
      options,
      // Convert to a simple regex-ready string
      urlFilter: this._toUrlFilter(urlPattern)
    };
  }
  /** @private */
  static _toUrlFilter(pattern) {
    if (pattern.startsWith("||")) {
      return pattern.slice(2).replace("^", "");
    }
    return pattern;
  }
};

// src/core/FilterEngine.js
var _api = globalThis.chrome ?? globalThis.browser;
var STATIC_RULESETS = ["nafer-base", "easylist"];
var FilterEngine = class {
  /** @param {import('../infrastructure/storage/StorageAdapter.js').StorageAdapter} storage */
  constructor(storage2) {
    this._storage = storage2;
    this._cosmetic = new CosmeticFilter();
    this._initialized = false;
    this._enabled = true;
  }
  /**
   * Initialize from stored data.
   * Called on every service worker wake-up — restores state from storage.
   */
  async initialize() {
    const storedEnabled = await this._storage.get("nafer_enabled");
    this._enabled = storedEnabled !== false;
    await this._applyEnabledState(this._enabled);
    const cosmeticData = await this._storage.get("nafer_cosmetic_rules");
    if (cosmeticData) {
      this._cosmetic = CosmeticFilter.fromSerialized(cosmeticData);
    }
    this._initialized = true;
    console.log(`[Nafer Shield] FilterEngine ready. enabled=${this._enabled}`);
  }
  /** Returns true if engine has been initialized this worker lifetime */
  isReady() {
    return this._initialized;
  }
  /**
   * Load and index a raw filter list text.
   * @param {string} _id  unique list ID (unused for DNR — rules are pre-compiled)
   * @param {string} text raw EasyList text
   */
  async loadFilterList(_id, text) {
    const { cosmetic } = FilterListParser.parse(text);
    this._cosmetic.load(cosmetic);
    await this._storage.set("nafer_cosmetic_rules", this._cosmetic.serialize());
  }
  /**
   * Get CSS to inject for a hostname.
   * @param {string} hostname
   * @returns {string}
   */
  getCSSForHost(hostname) {
    if (!this._initialized)
      return "";
    return this._cosmetic.getCSSForHost(hostname);
  }
  /** Check if a domain is paused (allowlisted) */
  async isDomainPaused(domain) {
    const paused = await this._storage.get("nafer_paused_domains") ?? [];
    return paused.includes(domain);
  }
  /** Toggle pause state for a domain */
  async toggleDomainPause(domain) {
    const paused = await this._storage.get("nafer_paused_domains") ?? [];
    const idx = paused.indexOf(domain);
    if (idx === -1) {
      paused.push(domain);
    } else {
      paused.splice(idx, 1);
    }
    await this._storage.set("nafer_paused_domains", paused);
    await this._syncDomainAllowlist(paused);
    return idx === -1;
  }
  /** @private Sync DNR dynamic rules with paused domains list */
  async _syncDomainAllowlist(pausedDomains) {
    if (!_api?.declarativeNetRequest)
      return;
    const existing = await _api.declarativeNetRequest.getDynamicRules();
    const toRemove = existing.filter((r) => r.id >= 9e4).map((r) => r.id);
    const toAdd = pausedDomains.map((domain, i) => ({
      id: 9e4 + i,
      priority: 9999,
      action: { type: "allow" },
      condition: { requestDomains: [domain] }
    }));
    await _api.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: toRemove,
      addRules: toAdd
    });
  }
  /** Global enable / disable */
  async setEnabled(enabled) {
    this._enabled = enabled;
    await this._storage.set("nafer_enabled", enabled);
    await this._applyEnabledState(enabled);
  }
  /** Get enabled state (from memory — always correct after initialize()) */
  async isEnabled() {
    return this._enabled;
  }
  /** @private Apply enabled state to DNR static rulesets */
  async _applyEnabledState(enabled) {
    if (!_api?.declarativeNetRequest?.updateEnabledRulesets)
      return;
    try {
      await _api.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: enabled ? STATIC_RULESETS : [],
        disableRulesetIds: enabled ? [] : STATIC_RULESETS
      });
    } catch (e) {
      console.warn("[Nafer Shield] updateEnabledRulesets:", e.message);
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
var _api2 = globalThis.chrome ?? globalThis.browser;
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
    builtIn: false
  },
  {
    id: "easyprivacy",
    name: "EasyPrivacy",
    url: "https://easylist.to/easylist/easyprivacy.txt",
    enabled: true,
    builtIn: false
  },
  {
    id: "ublock-filters",
    name: "uBlock Filters",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt",
    enabled: true,
    builtIn: false
  },
  {
    id: "arabic-filters",
    name: "Arabic Ads & Trackers",
    url: "https://raw.githubusercontent.com/easylist/easylistArabic/master/easylistarabic.txt",
    enabled: true,
    builtIn: false
  },
  {
    id: "annoyances",
    name: "Fanboy Annoyances",
    url: "https://easylist.to/easylist/fanboy-annoyance.txt",
    enabled: false,
    builtIn: false
  }
];
var FilterListService = class {
  /** @param {import('../../infrastructure/storage/StorageAdapter.js').StorageAdapter} storage */
  constructor(storage2) {
    this._storage = storage2;
  }
  /** Initialize default lists on first install */
  async initializeDefaultLists() {
    const existing = await this._storage.get("nafer_filter_lists");
    if (!existing) {
      await this._storage.set("nafer_filter_lists", BUILT_IN_LISTS);
    }
  }
  /** Get all filter lists */
  async getAll() {
    return await this._storage.get("nafer_filter_lists") ?? BUILT_IN_LISTS;
  }
  /**
   * Toggle a list enabled/disabled.
   * Fix 3: also updates DNR rulesets so the change takes effect immediately.
   * @param {string} id
   */
  async toggle(id) {
    const lists = await this.getAll();
    const list = lists.find((l) => l.id === id);
    if (!list)
      return null;
    list.enabled = !list.enabled;
    await this._storage.set("nafer_filter_lists", lists);
    if (_api2?.declarativeNetRequest?.updateEnabledRulesets) {
      try {
        await _api2.declarativeNetRequest.updateEnabledRulesets({
          enableRulesetIds: list.enabled ? [id] : [],
          disableRulesetIds: list.enabled ? [] : [id]
        });
        console.log(`[Nafer Shield] Ruleset "${id}" ${list.enabled ? "enabled" : "disabled"}`);
      } catch (e) {
        console.warn(`[Nafer Shield] Could not toggle ruleset "${id}":`, e.message);
      }
    }
    return list;
  }
  /** Add a custom filter list */
  async addCustom(name, url) {
    const lists = await this.getAll();
    const id = `custom-${Date.now()}`;
    lists.push({ id, name, url, enabled: true, builtIn: false });
    await this._storage.set("nafer_filter_lists", lists);
    return id;
  }
  /** Remove a custom list */
  async remove(id) {
    const lists = await this.getAll();
    const filtered = lists.filter((l) => l.id !== id);
    await this._storage.set("nafer_filter_lists", filtered);
  }
  /** Get last update timestamp */
  async getLastUpdated() {
    return this._storage.get("nafer_lists_last_updated");
  }
  /** Mark lists as updated now */
  async markUpdated() {
    await this._storage.set("nafer_lists_last_updated", Date.now());
  }
};

// src/background/MessageRouter.js
var MessageRouter = class {
  /**
   * @param {{
   *   engine: import('../core/FilterEngine.js').FilterEngine,
   *   statsService: import('../application/services/StatsService.js').StatsService,
   *   filterListService: import('../application/services/FilterListService.js').FilterListService,
   * }} deps
   */
  constructor({ engine: engine2, statsService, filterListService }) {
    this._engine = engine2;
    this._stats = statsService;
    this._lists = filterListService;
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
var _api3 = globalThis.chrome ?? globalThis.browser;
var storage = new StorageAdapter();
var engine = new FilterEngine(storage);
var stats = new StatsService(storage);
var filterLists = new FilterListService(storage);
var router = new MessageRouter({ engine, statsService: stats, filterListService: filterLists });
async function initialize() {
  console.log("[Nafer Shield] Waking up and synchronizing state...");
  await engine.initialize();
  await filterLists.initializeDefaultLists();
  const isEnabled = await engine.isEnabled();
  if (isEnabled) {
    const allLists = await filterLists.getAll();
    const enabledIds = allLists.filter((l) => l.enabled).map((l) => l.id);
    const disabledIds = allLists.filter((l) => !l.enabled).map((l) => l.id);
    try {
      await _api3.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: enabledIds,
        disableRulesetIds: disabledIds
      });
      console.log(`[Nafer Shield] Synced ${enabledIds.length} rulesets.`);
    } catch (e) {
      console.warn("[Nafer Shield] Ruleset sync warning:", e.message);
    }
  }
  _api3.declarativeNetRequest?.setExtensionActionOptions?.({
    displayActionCountAsBadgeText: true
  });
  if (_api3.declarativeNetRequest?.onRuleMatchedDebug) {
    _api3.declarativeNetRequest.onRuleMatchedDebug.removeListener(handleRuleMatch);
    _api3.declarativeNetRequest.onRuleMatchedDebug.addListener(handleRuleMatch);
  }
  console.log("[Nafer Shield] Engine initialized and ready.");
}
function handleRuleMatch(info) {
  stats.increment(info.tabId);
}
initialize().catch((err) => console.error("[Nafer Shield] Init error:", err));
_api3.alarms?.create("nafer-keepalive", { periodInMinutes: 0.4 });
_api3.alarms?.onAlarm?.addListener(async (alarm) => {
  if (alarm.name === "nafer-keepalive") {
    if (!engine.isReady())
      await initialize();
    return;
  }
  if (alarm.name === "nafer-update-lists") {
    await filterLists.markUpdated();
  }
});
_api3.runtime.onMessage.addListener((message, sender, sendResponse) => {
  router.handle(message, sender).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
  return true;
});
_api3.tabs.onRemoved.addListener((tabId) => {
  stats.clearTab(tabId);
});
