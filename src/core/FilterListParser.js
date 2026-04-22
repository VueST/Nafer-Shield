/**
 * FilterListParser — Domain Layer
 * Parses Adblock Plus / EasyList syntax into structured rule objects.
 */
export class FilterListParser {
  /**
   * Parse raw filter list text into an array of rule objects.
   * @param {string} text
   * @returns {{ network: NetworkRule[], cosmetic: CosmeticRule[] }}
   */
  static parse(text) {
    const network = [];
    const cosmetic = [];

    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('!') || line.startsWith('[')) continue;

      // Cosmetic filter: ##, #@#, #?#
      const cosmeticMatch = line.match(/^([^#]*)#(@)?#\??(.*)/);
      if (cosmeticMatch) {
        const [, domains, exception, selector] = cosmeticMatch;
        cosmetic.push({
          domains: domains ? domains.split(',').map(d => d.trim()).filter(Boolean) : [],
          selector: selector.trim(),
          isException: Boolean(exception),
        });
        continue;
      }

      // Network filter
      const netRule = this._parseNetworkRule(line);
      if (netRule) network.push(netRule);
    }

    return { network, cosmetic };
  }

  /** @private */
  static _parseNetworkRule(line) {
    if (!line) return null;
    const isException = line.startsWith('@@');
    const pattern = isException ? line.slice(2) : line;

    // Extract options after $
    const dollarIdx = pattern.lastIndexOf('$');
    let urlPattern = pattern;
    const options = {};

    if (dollarIdx !== -1) {
      urlPattern = pattern.slice(0, dollarIdx);
      const opts = pattern.slice(dollarIdx + 1).split(',');
      for (const opt of opts) {
        const [key, val] = opt.trim().split('=');
        options[key.replace(/^~/, '')] = val ?? true;
      }
    }

    if (!urlPattern) return null;

    return {
      pattern: urlPattern,
      isException,
      options,
      // Convert to a simple regex-ready string
      urlFilter: this._toUrlFilter(urlPattern),
    };
  }

  /** @private */
  static _toUrlFilter(pattern) {
    // Handle ||domain^ anchors (most common case)
    if (pattern.startsWith('||')) {
      return pattern.slice(2).replace('^', '');
    }
    return pattern;
  }
}
