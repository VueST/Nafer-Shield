/**
 * StatsService — Application Layer
 * Manages blocked request statistics per tab and globally.
 */
export class StatsService {
  /** @param {import('../../infrastructure/storage/StorageAdapter.js').StorageAdapter} storage */
  constructor(storage) {
    this._storage = storage;
    /** @type {Map<number, number>} tabId → blocked count this session */
    this._sessionCounts = new Map();
    /** @type {number} Global all-time blocked count */
    this._totalBlocked = 0;
    this._initialized = false;
  }

  /** Initialize total count from storage */
  async _ensureInitialized() {
    if (this._initialized) return;
    this._totalBlocked = (await this._storage.get('nafer_total_blocked')) ?? 0;
    this._initialized = true;
    console.log('[Nafer Shield] StatsService initialized. Total:', this._totalBlocked);
  }

  /**
   * Increment blocked count for a tab.
   * @param {number} tabId
   */
  async increment(tabId) {
    await this._ensureInitialized();

    // Increment tab session count
    const currentSession = this._sessionCounts.get(tabId) ?? 0;
    this._sessionCounts.set(tabId, currentSession + 1);

    // Increment global all-time count (memory first to avoid race)
    this._totalBlocked++;
    
    // Fire and forget storage update
    this._storage.set('nafer_total_blocked', this._totalBlocked).catch(console.error);
    
    console.log(`[Nafer Shield] Stats ++ | Tab: ${this._sessionCounts.get(tabId)} | Total: ${this._totalBlocked}`);
  }

  /**
   * Sync a delta to the total count (used when popup detects more blocks than tracked).
   * @param {number} delta
   */
  async syncDelta(delta) {
    if (delta <= 0) return;
    await this._ensureInitialized();
    this._totalBlocked += delta;
    this._storage.set('nafer_total_blocked', this._totalBlocked).catch(console.error);
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
    await this._storage.set('nafer_total_blocked', 0);
  }
}
