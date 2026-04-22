/**
 * Build Tool — Nafer Shield Extension
 * Bundles background.js and content.js using esbuild.
 * Usage:
 *   node tools/build.js [--watch] [--target=chrome|firefox]
 */

import esbuild from 'esbuild';
import fs      from 'fs';
import path    from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const DIST      = path.join(ROOT, 'dist');

const args   = process.argv.slice(2);
const watch  = args.includes('--watch');
const target = args.find(a => a.startsWith('--target='))?.split('=')[1] ?? 'chrome';

// ─── Ensure dist/ exists ──────────────────────────────────────────────────────
fs.mkdirSync(DIST, { recursive: true });

const sharedOptions = {
  bundle:   true,
  format:   'esm',
  target:   ['chrome93', 'firefox109'],
  charset:  'utf8',
  treeShaking: true,
  logLevel: 'info',
};

// ─── Entry Points ─────────────────────────────────────────────────────────────
const entries = [
  {
    entryPoints: [path.join(ROOT, 'background.js')],
    outfile:     path.join(DIST, 'background.js'),
    platform:    'browser',
  },
  {
    entryPoints: [path.join(ROOT, 'content.js')],
    outfile:     path.join(DIST, 'content.js'),
    platform:    'browser',
    // Content scripts cannot use ES module syntax — use IIFE
    format:      'iife',
  },
];

// ─── Firefox: copy correct manifest ───────────────────────────────────────────
function copyManifest() {
  const src = target === 'firefox'
    ? path.join(ROOT, 'manifest.firefox.json')
    : path.join(ROOT, 'manifest.json');
  fs.copyFileSync(src, path.join(ROOT, 'manifest.json'));
  if (target === 'firefox') {
    console.log('[build] Using Firefox manifest (MV2)');
  }
}

// ─── Build ────────────────────────────────────────────────────────────────────
async function build() {
  const contexts = [];

  for (const entry of entries) {
    const ctx = await esbuild.context({ ...sharedOptions, ...entry });
    if (watch) {
      await ctx.watch();
      console.log(`[watch] Watching ${path.basename(entry.entryPoints[0])}…`);
    } else {
      await ctx.rebuild();
      await ctx.dispose();
    }
    contexts.push(ctx);
  }

  if (!watch) {
    // Print bundle sizes
    for (const entry of entries) {
      const stat = fs.statSync(entry.outfile);
      const kb   = (stat.size / 1024).toFixed(1);
      console.log(`[build] ${path.basename(entry.outfile)} → ${kb} KB`);
    }
    console.log('[build] ✅ Done');
  }
}

copyManifest();
build().catch(err => { console.error(err); process.exit(1); });
