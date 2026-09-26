import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { currentArtifactIdentity, sameArtifactIdentity, compareEvidenceToBaseline } from '../scripts/verification/execution-evidence.mjs';

test('release evidence cannot transfer between artifacts from the same source commit', (t) => {
  const previousRoot = process.env.WE3D_VERIFY_ROOT;
  process.env.WE3D_VERIFY_ROOT = 'dist'; // This fixture owns its artifact directory.
  t.after(() => { if (previousRoot === undefined) delete process.env.WE3D_VERIFY_ROOT; else process.env.WE3D_VERIFY_ROOT = previousRoot; });
  const root = mkdtempSync(path.join(tmpdir(), 'we3d-artifact-evidence-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'dist'));
  const build = path.join(root, 'dist/build-manifest.json');
  const assets = path.join(root, 'dist/asset-manifest.json');
  assert.equal(currentArtifactIdentity(root), null);
  writeFileSync(build, JSON.stringify({ buildId: 'staging-candidate', commit: 'same-commit' }));
  writeFileSync(assets, JSON.stringify({ files: { 'index.html': 'content-a' } }));
  const identity = currentArtifactIdentity(root);
  const baseline = { headCommit: 'same-commit', workspaceFingerprint: 'same-source' };
  const evidence = { contract: 'world-explorer-execution-evidence-v1', scope: 'candidate', ok: true, baseline, artifactIdentity: identity };
  assert.deepEqual(compareEvidenceToBaseline(evidence, baseline, 'candidate', identity), []);
  writeFileSync(build, JSON.stringify({ buildId: 'production-candidate', commit: 'same-commit' }));
  assert.equal(sameArtifactIdentity(identity, currentArtifactIdentity(root)), false);
  assert.match(compareEvidenceToBaseline(evidence, baseline, 'candidate', currentArtifactIdentity(root)).join(), /artifact/);
  writeFileSync(build, JSON.stringify({ buildId: 'staging-candidate', commit: 'same-commit' }));
  writeFileSync(assets, JSON.stringify({ files: { 'index.html': 'content-b' } }));
  assert.equal(sameArtifactIdentity(identity, currentArtifactIdentity(root)), false);
  assert.match(compareEvidenceToBaseline({ ...evidence, artifactIdentity: undefined }, baseline, 'candidate', identity).join(), /artifact/);
  assert.equal(sameArtifactIdentity(null, null), false);
});
