#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const strict = process.argv.includes('--strict');
const ASSET_ROOTS = ['app/assets/', 'assets/'];
const AUDITED_EXTENSIONS = new Set([
  '.csv', '.glb', '.gltf', '.ico', '.jpeg', '.jpg', '.png', '.svg',
  '.ttf', '.webp', '.woff', '.woff2'
]);
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs']);

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8'
  }).split('\0').filter(Boolean);
}

function isAuditedAsset(file) {
  return ASSET_ROOTS.some((root) => file.startsWith(root)) &&
    AUDITED_EXTENSIONS.has(path.extname(file).toLowerCase());
}

async function readSearchCorpus(files) {
  const parts = [];
  for (const file of files) {
    if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    parts.push(await fs.readFile(path.join(ROOT, file), 'utf8'));
  }
  return parts.join('\n');
}

function dynamicPbrAssets(corpus) {
  const reached = new Set();
  const rootMatch = corpus.match(/EARTH_TEXTURE_ROOT\s*=\s*['"]([^'"]+)['"]/);
  const root = String(rootMatch?.[1] || '').replace(/^\/+|\/+$/g, '');
  if (!root) return reached;
  const inventory = corpus.match(
    /LOCAL_PBR_ASSET_IDS\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/
  );
  const assetIds = inventory
    ? [...inventory[1].matchAll(/:\s*['"]([^'"]+)['"]/g)].map((match) => match[1])
    : [];
  for (const assetId of assetIds) {
    for (const channel of ['diffuse', 'normal', 'roughness']) {
      reached.add(`app/${root}/${assetId}_${channel}.jpg`);
    }
  }
  return reached;
}

const tracked = trackedFiles();
const existence = await Promise.all(tracked.map(async (file) => {
  try {
    await fs.access(path.join(ROOT, file));
    return file;
  } catch {
    return null;
  }
}));
const files = existence.filter(Boolean);
const assets = files.filter(isAuditedAsset).sort();
const corpus = await readSearchCorpus(files);
const dynamicAssets = dynamicPbrAssets(corpus);
const unreachable = assets.filter((file) =>
  !corpus.includes(path.basename(file)) && !dynamicAssets.has(file)
);
const result = {
  ok: !strict || unreachable.length === 0,
  contract: 'tracked-hosting-asset-reachability',
  assetFiles: assets.length,
  dynamicPbrAssets: dynamicAssets.size,
  unreachableAssets: unreachable
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
