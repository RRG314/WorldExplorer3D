#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const groundDirectory = path.join(root, 'app/assets/ground');
const directoryEntries = await fs.readdir(groundDirectory, {
  withFileTypes: true
});
const manifests = [];
for (const entry of directoryEntries
  .filter((candidate) => candidate.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name))) {
  const manifestPath = path.join(
    groundDirectory,
    entry.name,
    'ground-manifest.json'
  );
  let text;
  try {
    text = await fs.readFile(manifestPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') continue;
    throw error;
  }
  const manifest = JSON.parse(text);
  manifests.push({
    ...manifest,
    url: `./${entry.name}/ground-artifact.json`
  });
}
if (manifests.length === 0) {
  throw new Error('accepted-ground catalog cannot be empty');
}
const catalog = {
  schemaVersion: 1,
  manifests
};
const output = path.join(groundDirectory, 'manifest-catalog.json');
await fs.writeFile(output, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  output,
  artifactCount: manifests.length,
  artifactIds: manifests.map((manifest) => manifest.artifactId)
}, null, 2));
