import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { REQUIRED_ACCEPTANCE, evaluateAcceptanceReceipt, readAcceptanceClasses } from '../scripts/verification/acceptance-classes.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const artifact = { buildManifestSha256: hash('build'), assetManifestSha256: hash('assets'), verifiedContentSha256: hash('content') };
const baseline = { acceptanceFingerprint: hash('source') }, now = Date.parse('2026-10-04T12:00:00Z');
const context = { artifact, baseline, now, verifyEvidence: () => true, verifyFallback: () => true };
function fixture(id) {
  return { contract: 'world-explorer-acceptance-class-v1', evidenceClass: id, result: 'passed', artifactIdentity: artifact,
    acceptanceFingerprint: baseline.acceptanceFingerprint, observedAt: '2026-10-03T12:00:00Z', expiresAt: '2026-10-08T12:00:00Z',
    reviewer: 'SYNTHETIC TEST ONLY', evidenceFiles: [{ path: 'output/release-evidence/fixture.txt', sha256: hash('fixture') }],
    checks: Object.fromEntries(REQUIRED_ACCEPTANCE[id].checks.map(key => [key, true])), attestationMode: 'ordinary',
    providerMode: 'live', debugAttestation: false, device: { physical: true, model: 'test', os: 'test', browser: 'test' },
    coached: false, entitlementReference: 'synthetic-not-a-license', endpointConfigurationSha256: hash('endpoint'),
    fallbackArtifactIdentity: { ...artifact, buildManifestSha256: hash('fallback') }, compatibilityContract: 'synthetic-schema-v5' };
}

test('all acceptance classes remain pending without their own evidence; no automated pass can replace them', () => {
  for (const id of Object.keys(REQUIRED_ACCEPTANCE)) {
    assert.equal(evaluateAcceptanceReceipt(id, null, context).status, 'pending');
    assert.equal(evaluateAcceptanceReceipt(id, { ...fixture(id), evidenceClass: 'automated' }, context).status, 'invalid');
    assert.equal(evaluateAcceptanceReceipt(id, fixture(id), context).status, 'passed');
  }
});

test('changed artifacts, source, evidence, failures and stale receipts invalidate each class', () => {
  for (const id of Object.keys(REQUIRED_ACCEPTANCE)) for (const mutate of [
    receipt => { receipt.artifactIdentity = { ...artifact, verifiedContentSha256: hash('different') }; },
    receipt => { receipt.acceptanceFingerprint = hash('different'); }, receipt => { receipt.result = 'failed'; },
    receipt => { receipt.checks = {}; }, receipt => { receipt.observedAt = '2025-01-01'; },
    receipt => { receipt.expiresAt = '2026-10-04T11:59:59Z'; }, receipt => { receipt.observedAt = '2030-01-01'; },
    receipt => { receipt.reviewer = ''; }, receipt => { receipt.evidenceFiles = []; }
  ]) { const receipt = fixture(id); mutate(receipt); assert.equal(evaluateAcceptanceReceipt(id, receipt, context).status, 'invalid', id); }
  assert.equal(evaluateAcceptanceReceipt('ordinary-hosted', fixture('ordinary-hosted'), { ...context, verifyEvidence: () => false }).status, 'invalid');
  assert.equal(evaluateAcceptanceReceipt('migration-rollback', fixture('migration-rollback'), { ...context, verifyFallback: () => false }).status, 'invalid');
});

test('debug attestation, touch emulation, coaching and incompatible fallback cannot masquerade as external acceptance', () => {
  for (const [id, change] of [
    ['ordinary-hosted', { attestationMode: 'debug' }], ['ordinary-hosted', { debugAttestation: true }],
    ['ordinary-hosted', { providerMode: 'mocked' }], ['physical-ios', { device: { physical: false } }],
    ['physical-android', { device: {} }], ['fresh-player', { coached: true }],
    ['weather-entitlement', { entitlementReference: null }],
    ['migration-rollback', { fallbackArtifactIdentity: artifact }], ['migration-rollback', { compatibilityContract: '' }]
  ]) assert.equal(evaluateAcceptanceReceipt(id, { ...fixture(id), ...change }, context).status, 'invalid');
});

test('receipt file reader hashes the evidence and treats absent or malformed records honestly', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'we3d-acceptance-fixture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const base = path.join(root, 'output/release-evidence'); mkdirSync(path.join(base, 'current/acceptance'), { recursive: true });
  assert.ok(Object.values(readAcceptanceClasses(root, context)).every(result => result.status === 'pending'));
  const receipt = fixture('fresh-player'); writeFileSync(path.join(base, 'fixture.txt'), 'fixture');
  const receiptPath = path.join(base, 'current/acceptance/fresh-player.json'); writeFileSync(receiptPath, JSON.stringify(receipt));
  assert.equal(readAcceptanceClasses(root, context)['fresh-player'].status, 'passed');
  writeFileSync(path.join(base, 'fixture.txt'), 'changed'); assert.equal(readAcceptanceClasses(root, context)['fresh-player'].status, 'invalid');
  writeFileSync(receiptPath, '{'); assert.equal(readAcceptanceClasses(root, context)['fresh-player'].status, 'invalid');
});
