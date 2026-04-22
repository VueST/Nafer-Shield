/**
 * compile-rules.js — Nafer Shield v3
 * Downloads filter lists, compiles them to DNR JSON, and AUTO-SPLITS
 * any list exceeding Chrome's 30K rule-per-file limit.
 *
 * It also PATCHES manifest.json automatically with the correct ruleset entries.
 *
 * Run: node tools/compile-rules.js
 * Requires Node 18+ (native fetch).
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const OUT_DIR   = path.join(ROOT, 'assets', 'rules');
const MANIFEST  = path.join(ROOT, 'manifest.json');

// ─── Filter List Sources ───────────────────────────────────────────────────────
// Add any new list here. The compiler handles splitting automatically.
const LISTS = [
  {
    id:  'easylist',
    url: 'https://easylist.to/easylist/easylist.txt',
  },
];

// Chrome MV3 hard limit per static ruleset file
const MAX_RULES_PER_SHARD = 28_000;

// DNR resource types to apply rules to
const RESOURCE_TYPES = [
  'script', 'image', 'xmlhttprequest', 'sub_frame',
  'stylesheet', 'media', 'websocket', 'other',
];

// ─── Line Parser ──────────────────────────────────────────────────────────────
function parseLine(line, id) {
  const raw = line.trim();
  if (!raw || raw.startsWith('!') || raw.startsWith('[') || raw.startsWith('#')) return null;
  if (raw.includes('##') || raw.includes('#@#')) return null; // cosmetic, skip
  if (raw.startsWith('@@')) return null;                       // exceptions, skip

  // Only handle safe ||domain^ patterns
  if (!raw.startsWith('||') || !raw.includes('^')) return null;

  const urlFilter = raw
    .replace('||', '')
    .replace(/\^.*/, '')
    .replace(/\*$/, '');

  if (!urlFilter || urlFilter.length < 4) return null;

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

// ─── Compiler + Auto-Splitter ─────────────────────────────────────────────────
async function compileList(listDef) {
  const { id, url } = listDef;
  console.log(`\n[compile] Fetching ${url}…`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const text = await res.text();

  // Parse all rules
  const allRules = [];
  let ruleId = 1;
  for (const line of text.split('\n')) {
    const rule = parseLine(line, ruleId);
    if (rule) { allRules.push(rule); ruleId++; }
  }

  console.log(`[compile] Parsed ${allRules.length} rules for "${id}"`);

  // Auto-split into shards ≤ MAX_RULES_PER_SHARD
  const shards = [];
  for (let i = 0; i < allRules.length; i += MAX_RULES_PER_SHARD) {
    shards.push(allRules.slice(i, i + MAX_RULES_PER_SHARD));
  }

  // Re-number rule IDs within each shard to avoid collisions
  shards.forEach((shard, shardIdx) => {
    shard.forEach((rule, ruleIdx) => {
      rule.id = shardIdx * MAX_RULES_PER_SHARD + ruleIdx + 1;
    });
  });

  // Write shard files
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const generatedShards = [];

  shards.forEach((shard, i) => {
    const shardId   = shards.length === 1 ? id : `${id}-${i + 1}`;
    const fileName  = `${shardId}.json`;
    const filePath  = path.join(OUT_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(shard, null, 2));
    console.log(`[compile]   ✅ Shard ${i + 1}/${shards.length}: ${shard.length} rules → ${fileName}`);
    generatedShards.push({ shardId, fileName });
  });

  return generatedShards;
}

// ─── Manifest Patcher ─────────────────────────────────────────────────────────
function patchManifest(generatedShards) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

  // Keep non-compiled rulesets (nafer-base stays)
  const preserved = (manifest.declarative_net_request?.rule_resources ?? [])
    .filter(r => r.id === 'nafer-base');

  // Add newly compiled shards
  const compiled = generatedShards.map(({ shardId, fileName }) => ({
    id:      shardId,
    enabled: true,
    path:    `assets/rules/${fileName}`,
  }));

  manifest.declarative_net_request = {
    rule_resources: [...preserved, ...compiled],
  };

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`\n[compile] ✅ manifest.json patched with ${compiled.length} ruleset(s).`);
}

// ─── Entry ────────────────────────────────────────────────────────────────────
(async () => {
  const allShards = [];

  for (const list of LISTS) {
    const shards = await compileList(list);
    allShards.push(...shards);
  }

  patchManifest(allShards);

  console.log('\n[compile] 🎉 All done. Run "npm run build" to rebuild the extension.\n');
})().catch(err => {
  console.error('[compile] ❌ Fatal error:', err.message);
  process.exit(1);
});
