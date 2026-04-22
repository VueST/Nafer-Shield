/**
 * CosmeticFilter — Core Domain Layer
 * Generates CSS to hide ad containers that bypass network-level blocking.
 *
 * Two-pass approach:
 * 1. COSMETIC_PATTERNS from AdNetworks.js — generic structural selectors.
 * 2. Dynamic rules loaded from parsed filter lists (EasyList ##selectors).
 */

import { COSMETIC_PATTERNS } from './AdNetworks.js';

export class CosmeticFilter {
  constructor() {
    /** @type {Map<string, Set<string>>} domain → selectors */
    this._domainRules = new Map();
    /** @type {Set<string>} generic selectors (all domains) */
    this._genericRules = new Set(COSMETIC_PATTERNS); // pre-seed with known patterns
    /** @type {Set<string>} exception selectors */
    this._exceptions = new Set();
  }

  /**
   * Load cosmetic rules from parsed filter list (EasyList ## format).
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
            this._domainRules.set(domain, new Set());
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

    // Match domain and all parent domains
    const parts = hostname.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      const domain = parts.slice(i).join('.');
      const domainSelectors = this._domainRules.get(domain);
      if (domainSelectors) {
        for (const s of domainSelectors) selectors.add(s);
      }
    }

    // Remove exceptions
    for (const ex of this._exceptions) selectors.delete(ex);

    if (selectors.size === 0) return '';

    // Generate CSS with !important on all key properties to override inline styles
    return `${[...selectors].join(',\n')} {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  height: 0 !important;
  width: 0 !important;
  max-height: 0 !important;
  max-width: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
}`;
  }

  /** Serialize to plain object for storage */
  serialize() {
    return {
      generic: [...this._genericRules],
      domain: Object.fromEntries(
        [...this._domainRules.entries()].map(([k, v]) => [k, [...v]])
      ),
      exceptions: [...this._exceptions],
    };
  }

  /** Deserialize from storage */
  static fromSerialized(data) {
    const filter = new CosmeticFilter();
    // Always include the built-in patterns even after deserialization
    for (const pattern of COSMETIC_PATTERNS) filter._genericRules.add(pattern);
    for (const s of (data.generic ?? [])) filter._genericRules.add(s);
    filter._exceptions = new Set(data.exceptions ?? []);
    for (const [domain, selectors] of Object.entries(data.domain ?? {})) {
      filter._domainRules.set(domain, new Set(selectors));
    }
    return filter;
  }
}
