#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(
  root,
  'app/assets/ground/scenario-catalog.json'
);
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
if (
  catalog.schemaVersion !== 1 ||
  !Array.isArray(catalog.scenarios) ||
  catalog.scenarios.length === 0
) {
  throw new Error('worldwide ground scenario catalog is invalid');
}
const temporaryDirectory = await fs.mkdtemp(
  path.join(os.tmpdir(), 'we3d-worldwide-ground-')
);
try {
  for (const scenario of catalog.scenarios) {
    const planPath = path.join(temporaryDirectory, `${scenario.id}.json`);
    execFileSync(process.execPath, [
      'scripts/build-ground-artifact.mjs',
      'plan',
      '--district-id', scenario.id,
      '--center-lat', String(scenario.latitude),
      '--center-lon', String(scenario.longitude),
      '--width-m', String(catalog.extentMeters),
      '--height-m', String(catalog.extentMeters),
      '--spacing-m', String(catalog.spacingMeters),
      '--output', planPath
    ], { cwd: root, stdio: 'inherit' });
    execFileSync(process.execPath, [
      'scripts/build-ground-artifact.mjs',
      'compile-copernicus',
      '--plan', planPath,
      '--output-dir', path.join(
        root,
        'app/assets/ground',
        scenario.id
      )
    ], { cwd: root, stdio: 'inherit' });
  }
  execFileSync(process.execPath, [
    'scripts/rebuild-ground-catalog.mjs'
  ], { cwd: root, stdio: 'inherit' });
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
