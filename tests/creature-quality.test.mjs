import assert from 'node:assert/strict';
import test from 'node:test';
import { BALTIMORE_ECOLOGY_PACK } from '../app/js/discovery/ecology/baltimore-pack.js';
import { auditRegionalCreatureQuality, evaluateCreaturePresentation } from '../app/js/discovery/creature-quality.js';

test('all 60 Baltimore taxa pass only as zero-budget reference fallbacks', () => {
  const audit = auditRegionalCreatureQuality(BALTIMORE_ECOLOGY_PACK);
  assert.equal(audit.taxonCount, 60);
  assert.equal(audit.releaseableCount, 60);
  assert.equal(audit.promotionReadyCount, 0);
  assert.deepEqual(audit.tiers, { 'reference-fallback': 60 });
  assert.deepEqual(audit.failures, []);
});

test('a creature cannot be promoted without commercial rights, attribution, and domain reviews', () => {
  const result = evaluateCreaturePresentation({
    tier: 'mobile-3d', asset: { id: 'unreviewed-fox', kind: 'model', sourceUrl: '/asset.glb', license: 'CC-BY-NC-4.0' },
    rightsStatus: 'pending', attribution: '', mobileBudget: { drawCalls: 8, textureBytes: 8_000_000, geometryBytes: 4_000_000 },
    reviews: {}, lod: { levels: 1, mobileFallback: false }, rollback: {}
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('asset-license-not-approved'));
  assert.ok(result.failures.includes('commercial-rights-not-approved'));
  assert.ok(result.failures.includes('anatomy-scale-review-missing'));
  assert.ok(result.failures.includes('behavior-animation-review-missing'));
  assert.ok(result.failures.includes('rollback-incomplete'));
});

test('a fully evidenced mobile creature can pass without changing the pack fallback', () => {
  const review = { status: 'approved', reviewer: 'Domain reviewer', reviewedAt: '2026-08-25' };
  const result = evaluateCreaturePresentation({
    tier: 'mobile-3d',
    asset: { id: 'reviewed-fox-v1', kind: 'model', sourceUrl: 'https://assets.example.test/reviewed-fox-v1.glb', license: 'CC-BY-4.0' },
    rightsStatus: 'approved-commercial', attribution: 'Example Artist · CC BY 4.0',
    mobileBudget: { drawCalls: 2, textureBytes: 1_000_000, geometryBytes: 800_000 },
    reviews: { anatomyScale: review, rightsAttribution: review, behaviorAnimation: review },
    lod: { levels: 2, mobileFallback: true },
    rollback: { fallbackTier: 'reference-fallback', disableAssetId: 'reviewed-fox-v1' }
  });
  assert.equal(result.ok, true);
  assert.equal(result.releaseable, true);
});
