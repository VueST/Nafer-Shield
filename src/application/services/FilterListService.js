/**
 * FilterListService — Application Layer
 * Manages filter list metadata and state.
 *
 * Fix 3 applied: `toggle()` now calls DNR updateEnabledRulesets() so toggling
 * a list in the settings UI actually changes what the browser blocks.
 */

const _api = globalThis.chrome ?? globalThis.browser;

export const BUILT_IN_LISTS = [
  {
    id: 'nafer-base',
    name: 'Nafer Base Filters',
    url: null,
    enabled: true,
    builtIn: true,
  },
  {
    id: 'easylist',
    name: 'EasyList',
    url: 'https://easylist.to/easylist/easylist.txt',
    enabled: true,
    builtIn: false,
  },
  {
    id: 'easyprivacy',
    name: 'EasyPrivacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    enabled: true,
    builtIn: false,
  },
  {
    id: 'ublock-filters',
    name: 'uBlock Filters',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
    enabled: true,
    builtIn: false,
  },
  {
    id: 'arabic-filters',
    name: 'Arabic Ads & Trackers',
    url: 'https://raw.githubusercontent.com/easylist/easylistArabic/master/easylistarabic.txt',
    enabled: true,
    builtIn: false,
  },
  {
    id: 'annoyances',
    name: 'Fanboy Annoyances',
    url: 'https://easylist.to/easylist/fanboy-annoyance.txt',
    enabled: false,
    builtIn: false,
  },
];

export class FilterListService {
  /** @param {import('../../infrastructure/storage/StorageAdapter.js').StorageAdapter} storage */
  constructor(storage) {
    this._storage = storage;
  }

  /** Initialize default lists on first install */
  async initializeDefaultLists() {
    const existing = await this._storage.get('nafer_filter_lists');
    if (!existing) {
      await this._storage.set('nafer_filter_lists', BUILT_IN_LISTS);
    }
  }

  /** Get all filter lists */
  async getAll() {
    return (await this._storage.get('nafer_filter_lists')) ?? BUILT_IN_LISTS;
  }

  /**
   * Toggle a list enabled/disabled.
   * Fix 3: also updates DNR rulesets so the change takes effect immediately.
   * @param {string} id
   */
  async toggle(id) {
    const lists = await this.getAll();
    const list  = lists.find(l => l.id === id);
    if (!list) return null;

    list.enabled = !list.enabled;
    await this._storage.set('nafer_filter_lists', lists);

    // ── Fix 3: Wire to DNR API ────────────────────────────────────────────────
    // Only static rulesets declared in manifest.json can be toggled this way.
    // Custom/remote lists would require dynamic rules (different flow).
    if (_api?.declarativeNetRequest?.updateEnabledRulesets) {
      try {
        await _api.declarativeNetRequest.updateEnabledRulesets({
          enableRulesetIds:  list.enabled ? [id] : [],
          disableRulesetIds: list.enabled ? [] : [id],
        });
        console.log(`[Nafer Shield] Ruleset "${id}" ${list.enabled ? 'enabled' : 'disabled'}`);
      } catch (e) {
        // Ruleset may not be declared in manifest — log and continue
        console.warn(`[Nafer Shield] Could not toggle ruleset "${id}":`, e.message);
      }
    }

    return list;
  }

  /** Add a custom filter list */
  async addCustom(name, url) {
    const lists = await this.getAll();
    const id    = `custom-${Date.now()}`;
    lists.push({ id, name, url, enabled: true, builtIn: false });
    await this._storage.set('nafer_filter_lists', lists);
    return id;
  }

  /** Remove a custom list */
  async remove(id) {
    const lists    = await this.getAll();
    const filtered = lists.filter(l => l.id !== id);
    await this._storage.set('nafer_filter_lists', filtered);
  }

  /** Get last update timestamp */
  async getLastUpdated() {
    return this._storage.get('nafer_lists_last_updated');
  }

  /** Mark lists as updated now */
  async markUpdated() {
    await this._storage.set('nafer_lists_last_updated', Date.now());
  }
}
