// A small, explicit mutation experiment. No source or artifact is modified.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), 'we3d-test-sensitivity-'));
const loader = path.join(temporary, 'mutant-loader.mjs');
const target = new URL('../../app/js/world/building-exterior-details.js', import.meta.url).href;
writeFileSync(loader, `export async function load(url, context, next) {
  const result = await next(url, context);
  if (url.split('?')[0] === ${JSON.stringify(target)}) {
    const original = String(result.source);
    const source = original.replace('export function clearBuildingExteriorDetails(appCtx) {',
      'export function clearBuildingExteriorDetails(appCtx) { return; // injected cleanup defect\\n');
    if (source === original) throw new Error('Mutation target was not found');
    return { ...result, source };
  }
  return result;
}
`);
const testFile = 'tests/building-exterior-integration-current.test.mjs';
const reports = [];
try {
  for (const [name, mutate, pattern, expectedStatus] of [
    ['normal-runtime-cleanup', false, '^runtime exterior cleanup', 0],
    ['disabled-cleanup-source-contracts', true, 'building publication owns|detail geometry has|facade material selection|open-ocean and world-reset', 0],
    ['disabled-cleanup-runtime-check', true, '^runtime exterior cleanup', 1]
  ]) {
    const args = [...(mutate ? ['--experimental-loader', pathToFileURL(loader).href] : []),
      '--test', '--test-concurrency=1', '--test-reporter=tap', `--test-name-pattern=${pattern}`, testFile];
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, expectedStatus, `${name}: ${result.stdout}\n${result.stderr}`);
    if (expectedStatus === 1) {
      assert.match(result.stdout, /not ok .*runtime exterior cleanup/);
      assert.match(result.stdout, /failureType: 'testCodeFailure'/);
    }
    reports.push({ name, injectedDefect: mutate ? 'exterior cleanup returns without detaching or disposing' : null,
      exitCode: result.status, expectedStatus, output: result.stdout });
  }
  const directory = path.join(root, 'output/verification/current-contracts');
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'sensitivity.json'), JSON.stringify({
    ok: true, scope: 'One targeted cleanup mutation; not a whole-suite mutation score', reports
  }, null, 2) + '\n');
  console.log('Cleanup defect survives source-text checks and is caught by the runtime check. Production source was never changed.');
} finally { rmSync(temporary, { recursive: true, force: true }); }
