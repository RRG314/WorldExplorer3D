import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const artifactRoot = path.resolve(root, process.env.WE3D_VERIFY_ROOT || 'dist');
const [packageJson, packageLock, gates, buildManifest, landing, game, appShellSource] = await Promise.all([
  readFile(path.join(root, 'package.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'package-lock.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'config/production-program-gates.json'), 'utf8').then(JSON.parse),
  readFile(path.join(artifactRoot, 'build-manifest.json'), 'utf8').then(JSON.parse),
  readFile(path.join(artifactRoot, 'index.html'), 'utf8'),
  readFile(path.join(artifactRoot, 'app/index.html'), 'utf8'),
  readFile(path.join(root, 'app/js/app-shell-fragments.js'), 'utf8')
]);

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const expectedVersion = gates.targetVersion;
const expectedPrefix = `${expectedVersion}+${commit.slice(0, 12)}.`;
const expectedBuildId = String(process.env.WE3D_EXPECT_BUILD_ID || '').trim();
const expectedTag = String(process.env.WE3D_EXPECT_TAG || '').trim();
const bundledAppEntry = buildManifest.runtimePackaging?.entries?.['app-entry'] || '';
const bundledShellEntry = buildManifest.runtimePackaging?.entries?.['app-shell-fragments'] || '';
const checks = {
  packageVersion: packageJson.version === expectedVersion,
  lockVersion: packageLock.version === expectedVersion && packageLock.packages?.['']?.version === expectedVersion,
  manifestVersion: buildManifest.version === expectedVersion,
  manifestCommit: buildManifest.commit === commit,
  immutableCandidateIdentity: buildManifest.buildId === buildManifest.candidateId && buildManifest.buildId.startsWith(expectedPrefix),
  cleanCandidateSource: buildManifest.sourceDirty === false,
  displayedLandingIdentity: landing.includes('id="landingBuildIdentity"') && landing.includes('build-manifest.json'),
  displayedGameIdentity: appShellSource.includes("fetch('/build-manifest.json'") &&
    appShellSource.includes('hudBox.dataset.buildLabel') &&
    !!bundledAppEntry && !!bundledShellEntry &&
    game.includes(bundledShellEntry) &&
    game.includes(`./${path.basename(bundledAppEntry)}`),
  expectedBuildMatches: !expectedBuildId || buildManifest.buildId === expectedBuildId,
  tagMatches: !expectedTag || execFileSync('git', ['rev-list', '-n', '1', expectedTag], { cwd: root, encoding: 'utf8' }).trim() === commit
};

let deployed = null;
const deployedBaseUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
if (deployedBaseUrl) {
  const response = await fetch(`${deployedBaseUrl}/build-manifest.json`, { cache: 'no-store' });
  const manifest = response.ok ? await response.json() : null;
  deployed = { url: deployedBaseUrl, status: response.status, buildId: manifest?.buildId || null };
  checks.deployedBuildMatches = response.ok && manifest?.buildId === buildManifest.buildId;
}

const report = {
  ok: Object.values(checks).every(Boolean),
  contract: 'world-explorer-release-identity-v1',
  expectedVersion,
  commit,
  buildId: buildManifest.buildId,
  firebaseEnvironment: buildManifest.firebaseEnvironment,
  deploymentTarget: buildManifest.deploymentTarget,
  expectedTag: expectedTag || null,
  deployed,
  checks
};
console.log(JSON.stringify(report, null, 2));
assert.equal(report.ok, true, 'Release version, commit, artifact, display, tag, or deployed identity does not match.');
