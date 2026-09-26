import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePromotion, hash, PROMOTION_RECEIPT, promotedEvidenceIdentity } from '../scripts/verification/production-promotion.mjs';
import { generatedFirebaseFiles } from '../scripts/lib/firebase-artifact-config.mjs';
import { hostingPromotionSource } from '../scripts/lib/hosting-promotion-plan.mjs';
import { currentBaseline } from '../scripts/verification/execution-evidence.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

function directory(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'we3d-production-promotion-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, data) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), data);
  };
  const commit = () => {
    const git = args => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
    git(['init', '-q']); git(['add', '.']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture']);
  };
  write('.gitignore', 'dist/\noutput/\n');
  return { root, write, commit };
}

function fixture() {
  const baseline = { headCommit: 'fixture-commit', workspaceFingerprint: 'fixture-tree', dirty: false };
  const config = environment => ({ projectId: `fixture-${environment}`, apiKey: environment });
  const build = environment => ({ commit: baseline.headCommit, version: '5.3.0', sourceDirty: false,
    sourceReleaseManifestSha256: 'data-hash', dependencyLockSha256: 'lock-hash',
    firebaseEnvironment: environment, firebaseProjectId: config(environment).projectId });
  const assets = environment => ({ files: { 'app/game.js': hash('real game'), 'app/index.html': hash('real html'),
    ...Object.fromEntries(Object.entries(generatedFirebaseFiles(environment, config(environment))).map(([file, bytes]) => [file, hash(bytes)])) } });
  const stagingBuildJson = JSON.stringify(build('staging')), stagingAssetsJson = JSON.stringify(assets('staging'));
  const productionBuild = build('production'), productionAssets = assets('production');
  const productionIdentity = { buildManifestSha256: hash(JSON.stringify(productionBuild)), assetManifestSha256: hash(JSON.stringify(productionAssets)) };
  return { baseline, productionBuild, productionAssets, productionIdentity, stagingConfig: config('staging'), productionConfig: config('production'),
    receipt: { contract: 'world-explorer-production-promotion-v1', baseline: { ...baseline }, stagingBuildJson, stagingAssetsJson,
      stagingIdentity: { buildManifestSha256: hash(stagingBuildJson), assetManifestSha256: hash(stagingAssetsJson) }, productionIdentity: { ...productionIdentity } } };
}
test('configuration-only promotion preserves the original staging evidence identity', () => {
  const f = fixture(); assert.deepEqual(validatePromotion(f), f.receipt.stagingIdentity);
});
test('promotion rejects altered code, backend scripts, assets, source and artifact identities', () => {
  const mutations = [
    f => { f.productionAssets.files['app/game.js'] = hash('broken game'); },
    f => { f.productionAssets.files['js/firebase-project-config.js'] = hash('arbitrary script'); },
    f => { f.productionAssets.files['extra.js'] = hash('extra'); },
    f => { delete f.productionAssets.files['app/index.html']; },
    f => { f.baseline.dirty = true; },
    f => { f.baseline.headCommit = 'other'; },
    f => { f.productionBuild.firebaseProjectId = 'other'; },
    f => { f.productionBuild.sourceDirty = true; },
    f => { f.productionBuild.dependencyLockSha256 = 'different'; },
    f => { f.productionIdentity.assetManifestSha256 = 'other'; },
    f => { f.receipt.stagingAssetsJson += ' '; },
    f => { f.receipt.stagingBuildJson += ' '; }
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); assert.throws(() => validatePromotion(f)); }
});
test('hosting promotion pins the reviewed version and rejects mismatches or a moving channel', () => {
  const projectId = 'fixture-production', channelId = 'review';
  const channel = { name: `sites/${projectId}/channels/review`, release: { version: { name: `sites/${projectId}/versions/test123` } } };
  const local = { 'build-manifest.json': JSON.stringify({ firebaseEnvironment: 'production', firebaseProjectId: projectId }), 'asset-manifest.json': '{}' };
  const f = { projectId, channelId, channel, after: channel, local, remote: { ...local } };
  assert.equal(hostingPromotionSource(f), `${projectId}@test123`);
  assert.throws(() => hostingPromotionSource({ ...f, remote: { ...local, 'asset-manifest.json': '{"changed":true}' } }));
  assert.throws(() => hostingPromotionSource({ ...f, after: { release: { version: { name: 'other' } } } }));
  assert.throws(() => hostingPromotionSource({ ...f, projectId: 'other' }));
  assert.throws(() => hostingPromotionSource({ ...f, channelId: 'live' }));
});

test('promotion receipt rechecks actual packaged bytes and source instead of trusting manifest claims', t => {
  const { root, write, commit } = directory(t);
  const f = fixture();
  write('config/firebase.staging.json', JSON.stringify(f.stagingConfig));
  write('config/firebase.production.json', JSON.stringify(f.productionConfig));
  commit();
  f.baseline = currentBaseline(root);
  f.receipt.baseline = f.baseline;
  const stagingBuild = JSON.parse(f.receipt.stagingBuildJson);
  stagingBuild.commit = f.baseline.headCommit;
  f.receipt.stagingBuildJson = JSON.stringify(stagingBuild);
  f.receipt.stagingIdentity.buildManifestSha256 = hash(f.receipt.stagingBuildJson);
  f.productionBuild.commit = f.baseline.headCommit;
  f.productionIdentity.buildManifestSha256 = hash(JSON.stringify(f.productionBuild));
  f.receipt.productionIdentity = f.productionIdentity;
  write(PROMOTION_RECEIPT, JSON.stringify(f.receipt));
  write('dist/build-manifest.json', JSON.stringify(f.productionBuild));
  write('dist/asset-manifest.json', JSON.stringify(f.productionAssets));
  write('dist/app/game.js', 'real game'); write('dist/app/index.html', 'real html');
  for (const [name, data] of Object.entries(generatedFirebaseFiles('production', f.productionConfig))) write(`dist/${name}`, data);
  assert.deepEqual(promotedEvidenceIdentity(root), f.receipt.stagingIdentity);
  write('dist/app/game.js', 'broken game');
  assert.throws(() => promotedEvidenceIdentity(root), /Production bytes changed/);
  write('dist/app/game.js', 'real game');
  write('config/firebase.production.json', '{}');
  assert.throws(() => promotedEvidenceIdentity(root), /clean source/);
});

test('production preparation stops at failed readiness without replacing the staged artifact', t => {
  const { root, write, commit } = directory(t);
  write('dist/build-manifest.json', JSON.stringify({ firebaseEnvironment: 'staging' }));
  write('scripts/hosting-artifact.mjs', "import fs from 'node:fs'; if(process.argv.includes('build')) fs.writeFileSync('dist/BUILD_STARTED', 'yes');");
  write('scripts/verification/release-scope.mjs', "import assert from 'node:assert/strict'; assert.ok(process.argv.includes('--require-ready')); process.exit(7);");
  commit();
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/prepare-production-artifact.mjs', import.meta.url))],
    { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Production preparation failed: scripts\/verification\/release-scope/);
  assert.equal(existsSync(path.join(root, 'dist/BUILD_STARTED')), false);
  assert.equal(existsSync(path.join(root, PROMOTION_RECEIPT)), false);
  assert.equal(JSON.parse(readFileSync(path.join(root, 'dist/build-manifest.json'))).firebaseEnvironment, 'staging');
});

test('direct hosting promotion fails before invoking Firebase without release acceptance', t => {
  const { root, write } = directory(t);
  write('scripts/placeholder', '');
  copyFileSync(fileURLToPath(new URL('../scripts/release-finalize.mjs', import.meta.url)), path.join(root, 'scripts/release-finalize.mjs'));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/firebase-hosting-promote.mjs', import.meta.url)), 'fixture-review'], {
    cwd: root, encoding: 'utf8', timeout: 10000, env: { ...process.env, WE3D_RELEASE_APPROVAL_FILE: '' }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /WE3D_RELEASE_APPROVAL_FILE is required/);
  assert.doesNotMatch(result.stdout, /Promoting Firebase Hosting/);
});

test('production preview cannot rebuild or skip acceptance, and refuses a mismatched target', t => {
  const { root, write } = directory(t);
  write('dist/build-manifest.json', JSON.stringify({ firebaseEnvironment: 'production', firebaseProjectId: 'worldexplorer3d-d9b83' }));
  write('scripts/placeholder', '');
  copyFileSync(fileURLToPath(new URL('../scripts/release-finalize.mjs', import.meta.url)), path.join(root, 'scripts/release-finalize.mjs'));
  const script = fileURLToPath(new URL('../scripts/firebase-hosting-preview.mjs', import.meta.url));
  const run = args => spawnSync(process.execPath, [script, 'fixture-review', ...args], {
    cwd: root, encoding: 'utf8', timeout: 10000, env: { ...process.env, WE3D_RELEASE_APPROVAL_FILE: '' }
  });
  const target = ['--project', 'worldexplorer3d-d9b83', '--config-env', 'production'];
  const rebuilding = run(target);
  assert.notEqual(rebuilding.status, 0);
  assert.match(rebuilding.stderr, /requires --use-existing-artifact/);
  const skipped = run([...target, '--use-existing-artifact', '--skip-checks']);
  assert.notEqual(skipped.status, 0);
  assert.match(skipped.stderr, /WE3D_RELEASE_APPROVAL_FILE is required/);
  const mismatched = run(['--project', 'other', '--config-env', 'staging', '--use-existing-artifact', '--skip-checks']);
  assert.notEqual(mismatched.status, 0);
  assert.match(mismatched.stderr, /does not match the packaged Firebase configuration/);
});
