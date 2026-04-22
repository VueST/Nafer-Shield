/**
 * MessageRouter — Background Layer
 * Routes messages from popup/settings/content to the appropriate handler.
 */
export class MessageRouter {
  /**
   * @param {{
   *   engine: import('../core/FilterEngine.js').FilterEngine,
   *   statsService: import('../application/services/StatsService.js').StatsService,
   *   filterListService: import('../application/services/FilterListService.js').FilterListService,
   *   onEnabledChanged?: (enabled: boolean) => void,
   * }} deps
   */
  constructor({ engine, statsService, filterListService, onEnabledChanged }) {
    this._engine = engine;
    this._stats = statsService;
    this._lists = filterListService;
    this._onEnabledChanged = onEnabledChanged;
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
      case 'GET_STATUS': {
        const tabId = payload?.tabId;
        const domain = payload?.domain;
        const [enabled, paused, stats] = await Promise.all([
          this._engine.isEnabled(),
          domain ? this._engine.isDomainPaused(domain) : false,
          tabId ? this._stats.getForTab(tabId) : { session: 0, total: 0 },
        ]);
        return { enabled, paused, stats };
      }

      case 'SET_ENABLED': {
        await this._engine.setEnabled(payload.enabled);
        if (this._onEnabledChanged) {
          this._onEnabledChanged(payload.enabled);
        }
        return { ok: true };
      }

      case 'TOGGLE_DOMAIN_PAUSE': {
        const isPaused = await this._engine.toggleDomainPause(payload.domain);
        return { isPaused };
      }

      case 'GET_FILTER_LISTS': {
        const lists = await this._lists.getAll();
        const lastUpdated = await this._lists.getLastUpdated();
        return { lists, lastUpdated };
      }

      case 'TOGGLE_FILTER_LIST': {
        const list = await this._lists.toggle(payload.id);
        if (this._onEnabledChanged) {
          this._onEnabledChanged(true); // Trigger re-sync if list toggled
        }
        return { list };
      }

      case 'ADD_CUSTOM_LIST': {
        const id = await this._lists.addCustom(payload.name, payload.url);
        return { id };
      }

      case 'REMOVE_CUSTOM_LIST': {
        await this._lists.remove(payload.id);
        return { ok: true };
      }

      case 'GET_STATS': {
        const total = await this._stats.getTotal();
        return { total };
      }

      case 'SYNC_STATS': {
        await this._stats.syncDelta(payload.delta);
        return { ok: true };
      }

      case 'RESET_STATS': {
        await this._stats.reset();
        return { ok: true };
      }

      case 'GET_COSMETIC_CSS': {
        const css = this._engine.getCSSForHost(payload.hostname);
        return { css };
      }

      case 'PING':
        return { pong: true };

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  }
}
