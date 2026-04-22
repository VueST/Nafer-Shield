/**
 * compile-rules.js — Nafer Shield
 * Downloads EasyList and compiles it to DNR JSON rules.
 * Run: node tools/compile-rules.js
 *
 * Output: assets/rules/easylist-rules.json
 * Requires Node 18+ (native fetch).
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const OUT_DIR   = path.join(ROOT, 'assets', 'rules');

const LISTS = [
  {
    id:  'easylist',
    url: 'https://easylist.to/easylist/easylist.txt',
    out: 'easylist-rules.json',
  },
];

// Chrome MV3 DNR resource types
const RESOURCE_TYPES = ['script','image','xmlhttprequest','sub_frame','stylesheet','media','websocket'];

// Convert EasyList pattern to DNR urlFilter
function toUrlFilter(pattern) {
  return pattern
    .replace('||', '')
    .replace(/\^.*/, '')
    .replace(/\*$/, '');
}

function parseLine(line, id) {
  const raw = line.trim();
  if (!raw || raw.startsWith('!') || raw.startsWith('[') || raw.startsWith('#')) return null;
  if (raw.includes('##') || raw.includes('#@#')) return null; // cosmetic
  if (raw.startsWith('@@')) return null; // exceptions — skip for now

  // Only handle simple ||domain^ patterns for safety
  if (!raw.startsWith('||') || !raw.includes('^')) return null;

  const urlFilter = toUrlFilter(raw);
  if (!urlFilter || urlFilter.length < 4) return null;
  if (urlFilter.includes('/') && !urlFilter.endsWith('/')) return null; // skip path-specific for now

  return {
    id,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: `||${urlFilter}^`,
      resourceTypes: RESOURCE_TYPES,
    },
  };
}

async function compileList({ id: listId, url, out }) {
  console.log(`[compile] Fetching ${url}…`);
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();

  const lines = text.split('\n');
  const rules = [];
  let ruleId  = 1;

  for (const line of lines) {
    const rule = parseLine(line, ruleId);
    if (rule) {
      rules.push(rule);
      ruleId++;
      // Chrome MV3 static rules limit per ruleset: 30,000
      if (ruleId > 29_000) break;
    }
  }

  const outPath = path.join(OUT_DIR, out);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(rules, null, 2));
  console.log(`[compile] ✅ ${listId}: ${rules.length} rules → ${out}`);
}

(async () => {
  for (const list of LISTS) {
    await compileList(list);
  }
  console.log('[compile] All done.');
})().catch(err => { console.error(err); process.exit(1); });
