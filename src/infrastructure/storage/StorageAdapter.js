/**
 * StorageAdapter — Infrastructure Layer
 * Wraps chrome.storage.local with a safe async interface.
 *
 * Fix 6 applied: All operations are wrapped in try/catch with safe defaults.
 * Quota errors and other storage failures no longer crash the service worker.
 */
export class StorageAdapter {
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
          if (err) return reject(new Error(err.message));
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
          if (err) return reject(new Error(err.message));
          resolve();
        });
      });
    } catch (e) {
      // Quota exceeded or other storage error — log but don't crash worker
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
          if (err) return reject(new Error(err.message));
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
          if (err) return reject(new Error(err.message));
          resolve(result);
        });
      });
    } catch (e) {
      console.error('[Nafer Shield] StorageAdapter.getMany() failed:', e.message);
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
}
