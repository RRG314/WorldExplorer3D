import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const RUNTIME_READINESS_MINIMUMS = Object.freeze({
  checkedRoadSamples: 100,
  driveJourneys: 12,
  maximumBlockedDriveRatePct: 10,
  maximumLaneCollisionRatePct: 3.5
});

function finiteAtLeast(value, minimum) {
  return Number.isFinite(Number(value)) && Number(value) >= minimum;
}

function finiteAtMost(value, maximum) {
  return Number.isFinite(Number(value)) && Number(value) <= maximum;
}

export function evaluateRuntimeReadiness(report = {}, preWaterMetrics = {}) {
  const acceptedGround = report.acceptedGroundRuntimeBoundary || {};
  const acceptedGroundSnapshot = acceptedGround.snapshot || {};
  const activeGroundSample = acceptedGround.activeSample || null;
  const linearFeatureCount =
    Number(report.linearFeatures || 0) +
    Number(preWaterMetrics.linearFeatures || 0);
  const linearFeaturePolicyDisabled = report.linearFeaturePolicyEnabled === false;
  const disabledLinearFeaturePolicyHonored =
    linearFeaturePolicyDisabled &&
    linearFeatureCount === 0 &&
    Number(report.linearFeatureMeshCount || 0) === 0 &&
    !report.walkFeatureRoute &&
    !report.walkSurfaceSample;

  return Object.freeze({
    roadCenterDriveable:
      finiteAtLeast(
        report.checkedSamples,
        RUNTIME_READINESS_MINIMUMS.checkedRoadSamples
      ) &&
      finiteAtLeast(
        report.driveSampleCount,
        RUNTIME_READINESS_MINIMUMS.driveJourneys
      ) &&
      finiteAtMost(
        report.blockedDriveRatePct,
        RUNTIME_READINESS_MINIMUMS.maximumBlockedDriveRatePct
      ),
    laneEdgeReasonable:
      finiteAtLeast(
        report.checkedSamples,
        RUNTIME_READINESS_MINIMUMS.checkedRoadSamples
      ) &&
      finiteAtMost(
        report.laneHitRatePct,
        RUNTIME_READINESS_MINIMUMS.maximumLaneCollisionRatePct
      ),
    linearFeatureNavigationReady:
      disabledLinearFeaturePolicyHonored || (
        linearFeatureCount > 0 &&
        finiteAtLeast(report.linearFeatureMeshCount, 1) &&
        report.solidLinearMaterials === true &&
        report.walkFeatureRoute?.ok === true &&
        finiteAtLeast(report.walkFeatureRoute?.pointCount, 2) &&
        Number.isFinite(Number(report.walkSurfaceSample?.yDelta)) &&
        Math.abs(Number(report.walkSurfaceSample.yDelta)) <= 1
      ),
    acceptedGroundRuntimeReady:
      acceptedGround.prepareExposed === true &&
      acceptedGround.coverageGateExposed === true &&
      acceptedGroundSnapshot.status === 'accepted' &&
      typeof acceptedGroundSnapshot.artifactId === 'string' &&
      acceptedGroundSnapshot.artifactId.length > 0 &&
      typeof acceptedGroundSnapshot.providerId === 'string' &&
      acceptedGroundSnapshot.providerId.length > 0 &&
      typeof acceptedGroundSnapshot.sourceRelease === 'string' &&
      acceptedGroundSnapshot.sourceRelease.length > 0 &&
      typeof acceptedGroundSnapshot.verticalDatum === 'string' &&
      acceptedGroundSnapshot.verticalDatum.length > 0 &&
      activeGroundSample?.status === 'available' &&
      Number.isFinite(Number(activeGroundSample?.groundElevationMeters))
  });
}

async function sha256(filePath) {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function invalidVisualReview(reason, details = {}) {
  return Object.freeze({
    status: 'invalid',
    approved: false,
    releaseEligible: false,
    reason,
    ...details
  });
}

export async function verifyVisualReview({
  manifestPath,
  outputDir,
  expectedFiles
} = {}) {
  const normalizedExpected = [...new Set((expectedFiles || [])
    .map((file) => path.relative(outputDir, file))
    .filter((file) => file && !file.startsWith('..'))
    .sort())];

  if (!manifestPath) {
    return Object.freeze({
      status: 'missing',
      approved: false,
      releaseEligible: false,
      reason: 'visual-review-manifest-required',
      expectedFiles: normalizedExpected
    });
  }

  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    return invalidVisualReview('visual-review-manifest-unreadable', {
      error: String(error?.message || error),
      expectedFiles: normalizedExpected
    });
  }

  if (manifest?.schemaVersion !== 1) {
    return invalidVisualReview('visual-review-schema-invalid');
  }
  if (!String(manifest.reviewer || '').trim()) {
    return invalidVisualReview('visual-review-reviewer-required');
  }
  if (!Number.isFinite(Date.parse(String(manifest.reviewedAt || '')))) {
    return invalidVisualReview('visual-review-timestamp-invalid');
  }

  const decisions = Array.isArray(manifest.decisions) ? manifest.decisions : [];
  const decisionByFile = new Map(
    decisions.map((decision) => [String(decision?.file || ''), decision])
  );
  const missing = [];
  const stale = [];
  const rejected = [];

  for (const relativeFile of normalizedExpected) {
    const decision = decisionByFile.get(relativeFile);
    if (!decision) {
      missing.push(relativeFile);
      continue;
    }
    const actualSha256 = await sha256(path.join(outputDir, relativeFile));
    if (String(decision.sha256 || '').toLowerCase() !== actualSha256) {
      stale.push(relativeFile);
    }
    if (decision.outcome !== 'approved') {
      rejected.push({
        file: relativeFile,
        outcome: decision.outcome || 'missing',
        notes: String(decision.notes || '')
      });
    }
  }

  if (missing.length > 0) {
    return invalidVisualReview('visual-review-decisions-missing', { missing });
  }
  if (stale.length > 0) {
    return invalidVisualReview('visual-review-screenshot-hash-mismatch', { stale });
  }
  if (rejected.length > 0) {
    return Object.freeze({
      status: 'rejected',
      approved: false,
      releaseEligible: false,
      reason: 'visual-review-rejected',
      rejected
    });
  }

  return Object.freeze({
    status: 'approved',
    approved: true,
    releaseEligible: true,
    reason: null,
    reviewer: String(manifest.reviewer).trim(),
    reviewedAt: String(manifest.reviewedAt),
    reviewedFiles: normalizedExpected
  });
}

export function classifyEvidence({
  kind,
  realInput = false,
  wallClockSeconds = 0,
  softwareRenderer = false,
  visualReviewApproved = false
} = {}) {
  const releaseEligible =
    kind === 'player-gameplay' &&
    realInput === true &&
    Number(wallClockSeconds) > 0 &&
    softwareRenderer === false &&
    visualReviewApproved === true;
  return Object.freeze({
    kind: String(kind || 'unknown'),
    realInput: realInput === true,
    wallClockSeconds: Number(wallClockSeconds) || 0,
    softwareRenderer: softwareRenderer === true,
    visualReviewApproved: visualReviewApproved === true,
    releaseEligible
  });
}
