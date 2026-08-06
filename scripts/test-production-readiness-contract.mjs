import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  classifyEvidence,
  evaluateRuntimeReadiness,
  verifyVisualReview
} from './production-readiness.mjs';

const blockedBaseline = evaluateRuntimeReadiness({
  checkedSamples: 1,
  driveSampleCount: 1,
  blockedDriveRatePct: 0,
  laneHitRatePct: 0,
  linearFeatures: 268,
  linearFeatureMeshCount: 0,
  solidLinearMaterials: false,
  walkFeatureRoute: { ok: true, pointCount: 2 },
  walkSurfaceSample: { yDelta: -0.007 },
  acceptedGroundRuntimeBoundary: {
    prepareExposed: true,
    coverageGateExposed: true,
    snapshot: {
      status: 'blocked',
      reason: 'no-ground-artifacts-configured'
    },
    activeSample: {
      status: 'unavailable',
      reason: 'accepted-ground-not-active'
    }
  }
});
assert.equal(blockedBaseline.roadCenterDriveable, false);
assert.equal(blockedBaseline.laneEdgeReasonable, false);
assert.equal(blockedBaseline.linearFeatureNavigationReady, false);

const policyDisabled = evaluateRuntimeReadiness({
  linearFeaturePolicyEnabled: false,
  linearFeatures: 0,
  linearFeatureMeshCount: 0,
  walkFeatureRoute: null,
  walkSurfaceSample: null
});
assert.equal(policyDisabled.linearFeatureNavigationReady, true);
assert.equal(blockedBaseline.acceptedGroundRuntimeReady, false);

const productionReady = evaluateRuntimeReadiness({
  checkedSamples: 400,
  driveSampleCount: 24,
  blockedDriveRatePct: 4.2,
  laneHitRatePct: 1.1,
  linearFeatures: 268,
  linearFeatureMeshCount: 3,
  solidLinearMaterials: true,
  walkFeatureRoute: { ok: true, pointCount: 12 },
  walkSurfaceSample: { yDelta: 0.02 },
  acceptedGroundRuntimeBoundary: {
    prepareExposed: true,
    coverageGateExposed: true,
    snapshot: {
      status: 'accepted',
      artifactId: 'baltimore-ground-2026',
      providerId: 'usgs-3dep-best-available',
      sourceRelease: '2026-07',
      verticalDatum: 'EGM2008'
    },
    activeSample: {
      status: 'available',
      groundElevationMeters: 8.42
    }
  }
});
assert.deepEqual(Object.values(productionReady), [true, true, true, true]);

assert.equal(classifyEvidence({
  kind: 'synthetic-direct-state',
  wallClockSeconds: 120,
  realInput: false,
  visualReviewApproved: true
}).releaseEligible, false);
assert.equal(classifyEvidence({
  kind: 'player-gameplay',
  wallClockSeconds: 120,
  realInput: true,
  softwareRenderer: true,
  visualReviewApproved: true
}).releaseEligible, false);
assert.equal(classifyEvidence({
  kind: 'player-gameplay',
  wallClockSeconds: 120,
  realInput: true,
  softwareRenderer: false,
  visualReviewApproved: true
}).releaseEligible, true);

const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'worldexplorer-visual-review-'));
try {
  const screenshotPath = path.join(fixtureDir, 'known-scene.png');
  const screenshotBytes = Buffer.from('not-a-real-png-but-a-stable-review-fixture');
  await fs.writeFile(screenshotPath, screenshotBytes);
  const digest = crypto.createHash('sha256').update(screenshotBytes).digest('hex');

  const missing = await verifyVisualReview({
    outputDir: fixtureDir,
    expectedFiles: [screenshotPath]
  });
  assert.equal(missing.releaseEligible, false);
  assert.equal(missing.reason, 'visual-review-manifest-required');

  const manifestPath = path.join(fixtureDir, 'visual-review.json');
  await fs.writeFile(manifestPath, JSON.stringify({
    schemaVersion: 1,
    reviewer: 'Release reviewer',
    reviewedAt: '2026-07-28T12:00:00.000Z',
    decisions: [{
      file: 'known-scene.png',
      sha256: digest,
      outcome: 'rejected',
      notes: 'Known floating geometry'
    }]
  }));
  const rejected = await verifyVisualReview({
    manifestPath,
    outputDir: fixtureDir,
    expectedFiles: [screenshotPath]
  });
  assert.equal(rejected.releaseEligible, false);
  assert.equal(rejected.status, 'rejected');

  await fs.writeFile(manifestPath, JSON.stringify({
    schemaVersion: 1,
    reviewer: 'Release reviewer',
    reviewedAt: '2026-07-28T12:00:00.000Z',
    decisions: [{
      file: 'known-scene.png',
      sha256: digest,
      outcome: 'approved',
      notes: 'Inspected at full resolution'
    }]
  }));
  const approved = await verifyVisualReview({
    manifestPath,
    outputDir: fixtureDir,
    expectedFiles: [screenshotPath]
  });
  assert.equal(approved.releaseEligible, true);
  assert.equal(approved.status, 'approved');

  await fs.writeFile(screenshotPath, Buffer.from('changed-after-review'));
  const stale = await verifyVisualReview({
    manifestPath,
    outputDir: fixtureDir,
    expectedFiles: [screenshotPath]
  });
  assert.equal(stale.releaseEligible, false);
  assert.equal(stale.reason, 'visual-review-screenshot-hash-mismatch');
} finally {
  await fs.rm(fixtureDir, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  contract: 'production-readiness',
  knownFalsePositiveRejected: true,
  blockedGroundRejected: true,
  missingPresentationRejected: true,
  syntheticEvidenceIneligible: true,
  softwarePerformanceIneligible: true,
  visualReviewHashBound: true
}, null, 2));
