import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(rootDir, relativePath), 'utf8'));
}

async function readText(relativePath) {
  return fs.readFile(path.join(rootDir, relativePath), 'utf8');
}

function git(args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8'
  }).trim();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const packageJson = await readJson('package.json');
const packageLock = await readJson('package-lock.json');
const buildManifest = await readJson('dist/build-manifest.json');
const assetManifestText = await readText('dist/asset-manifest.json');
const changelog = await readText('CHANGELOG.md');
const releaseNotesPath = `RELEASE_NOTES_${packageJson.version}.md`;
const releaseNotes = await readText(releaseNotesPath);
const commit = git(['rev-parse', 'HEAD']);
const status = git(['status', '--porcelain']);
const allowDirty = process.env.ALLOW_DIRTY_RELEASE_CANDIDATE === '1';

assert.match(packageJson.version, /^\d+\.\d+\.\d+$/, 'package version must be a release semver');
assert.equal(packageLock.version, packageJson.version, 'package-lock version differs from package version');
assert.equal(
  packageLock.packages?.['']?.version,
  packageJson.version,
  'package-lock root package version differs from package version'
);
assert.match(
  changelog,
  new RegExp(`^## \\[${packageJson.version.replaceAll('.', '\\.')}\\]`, 'm'),
  `CHANGELOG.md has no ${packageJson.version} release section`
);
assert.match(releaseNotes, /^# World Explorer 3D \d+\.\d+\.\d+/m);
assert.match(releaseNotes, /^## Verification$/m);
assert.match(releaseNotes, /^## Rollback$/m);

assert.equal(buildManifest.schemaVersion, 2, 'hosting manifest schema must be version 2');
assert.equal(buildManifest.version, packageJson.version, 'artifact version differs from package version');
assert.equal(buildManifest.commit, commit, 'artifact commit differs from HEAD');
assert.equal(buildManifest.sourceDirty, false, 'release artifact was built from a dirty source tree');
assert.equal(buildManifest.firebaseEnvironment, 'production', 'candidate must use production Firebase configuration');
assert.equal(buildManifest.firebaseProjectId, 'worldexplorer3d-d9b83', 'candidate targets the wrong Firebase project');
assert.equal(buildManifest.deploymentTarget, 'worldexplorer3d-d9b83:live', 'candidate targets the wrong hosting site');
assert.equal(buildManifest.candidateId, buildManifest.buildId, 'candidate/build identity differs');
assert.equal(buildManifest.commitTime, buildManifest.buildTimestamp, 'candidate timestamp is not reproducible');
assert.equal(buildManifest.assetManifestSha256, sha256(assetManifestText), 'asset manifest hash differs');
assert.ok(buildManifest.sourceReleaseManifestCount >= 13, 'accepted source-release manifests are incomplete');
assert.match(buildManifest.sourceReleaseManifestSha256, /^[a-f0-9]{64}$/);
assert.match(buildManifest.contentHash, /^[a-f0-9]{64}$/);
assert.match(buildManifest.dependencyLockSha256, /^[a-f0-9]{64}$/);

if (!allowDirty) {
  assert.equal(status, '', 'release candidate verification requires a clean worktree');
}

console.log(JSON.stringify({
  ok: true,
  version: packageJson.version,
  commit,
  buildId: buildManifest.buildId,
  deploymentTarget: buildManifest.deploymentTarget,
  sourceReleaseManifestCount: buildManifest.sourceReleaseManifestCount,
  sourceReleaseManifestSha256: buildManifest.sourceReleaseManifestSha256,
  contentHash: buildManifest.contentHash,
  dependencyLockSha256: buildManifest.dependencyLockSha256,
  releaseNotes: releaseNotesPath,
  cleanWorktree: status === ''
}, null, 2));
