/**
 * FilterListService — Application Layer
 * Manages filter list metadata and state.
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
    builtIn: true,
  }
];

export class FilterListService {
  /** @param {import('../../infrastructure/storage/StorageAdapter.js').StorageAdapter} storage */
  constructor(storage) {
    this._storage = storage;
  }

  async initializeDefaultLists() {
    const existing = await this._storage.get('nafer_filter_lists');
    if (!existing) {
      await this._storage.set('nafer_filter_lists', BUILT_IN_LISTS);
    }
  }

  async getAll() {
    return (await this._storage.get('nafer_filter_lists')) ?? BUILT_IN_LISTS;
  }

  async toggle(id) {
    const lists = await this.getAll();
    const list  = lists.find(l => l.id === id);
    if (!list) return null;

    list.enabled = !list.enabled;
    await this._storage.set('nafer_filter_lists', lists);

    if (_api?.declarativeNetRequest?.updateEnabledRulesets) {
      try {
        // Special mapping for split lists
        const rulesetIds = (id === 'easylist') ? ['easylist-1', 'easylist-2'] : [id];
        
        await _api.declarativeNetRequest.updateEnabledRulesets({
          enableRulesetIds:  list.enabled ? rulesetIds : [],
          disableRulesetIds: list.enabled ? [] : rulesetIds,
        });
      } catch (e) {
        console.warn(`[Nafer Shield] Toggle error for ${id}:`, e.message);
      }
    }

    return list;
  }

  async addCustom(name, url) {
    const lists = await this.getAll();
    const id    = `custom-${Date.now()}`;
    lists.push({ id, name, url, enabled: true, builtIn: false });
    await this._storage.set('nafer_filter_lists', lists);
    return id;
  }

  async remove(id) {
    const lists = await this.getAll();
    const filtered = lists.filter(l => l.id !== id);
    await this._storage.set('nafer_filter_lists', filtered);
  }
}
