const CREATURE_QUALITY_SCHEMA_VERSION = 1;

const CREATURE_QUALITY_TIERS = Object.freeze({
  'reference-fallback': Object.freeze({
    id: 'reference-fallback', label: 'Reference fallback', assetKinds: Object.freeze(['none']),
    maxMobileBudget: Object.freeze({ drawCalls: 0, textureBytes: 0, geometryBytes: 0 }),
    requiresBehaviorReview: false, requiresLodLevels: 0
  }),
  'reviewed-2d': Object.freeze({
    id: 'reviewed-2d', label: 'Reviewed identification image', assetKinds: Object.freeze(['image']),
    maxMobileBudget: Object.freeze({ drawCalls: 0, textureBytes: 524_288, geometryBytes: 0 }),
    requiresBehaviorReview: false, requiresLodLevels: 0
  }),
  'mobile-3d': Object.freeze({
    id: 'mobile-3d', label: 'Reviewed mobile creature', assetKinds: Object.freeze(['model']),
    maxMobileBudget: Object.freeze({ drawCalls: 2, textureBytes: 2_097_152, geometryBytes: 1_048_576 }),
    requiresBehaviorReview: true, requiresLodLevels: 2
  }),
  'showcase-3d': Object.freeze({
    id: 'showcase-3d', label: 'Reviewed showcase creature', assetKinds: Object.freeze(['model']),
    maxMobileBudget: Object.freeze({ drawCalls: 4, textureBytes: 4_194_304, geometryBytes: 2_097_152 }),
    requiresBehaviorReview: true, requiresLodLevels: 3
  })
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function approvedReview(review = {}) {
  return review.status === 'approved' && !!String(review.reviewer || '').trim() && /^\d{4}-\d{2}-\d{2}/.test(String(review.reviewedAt || ''));
}

function evaluateCreaturePresentation(input = {}) {
  const tier = CREATURE_QUALITY_TIERS[input.tier];
  const failures = [];
  if (!tier) failures.push('unknown-quality-tier');
  const budget = input.mobileBudget || {};
  if (tier) {
    for (const field of ['drawCalls', 'textureBytes', 'geometryBytes']) {
      const value = Math.max(0, Number(budget[field]) || 0);
      if (value > tier.maxMobileBudget[field]) failures.push(`mobile-budget-exceeded:${field}`);
    }
  }
  if (input.tier === 'reference-fallback') {
    if (input.assetStatus !== 'no-media-bundled') failures.push('fallback-must-not-bundle-media');
    if (input.rightsStatus !== 'no-media-bundled') failures.push('fallback-rights-status-invalid');
    if (Object.values(budget).some((value) => Number(value) !== 0)) failures.push('fallback-budget-must-be-zero');
  } else if (tier) {
    if (!tier.assetKinds.includes(input.asset?.kind)) failures.push('asset-kind-not-allowed');
    if (!String(input.asset?.id || '').trim() || !String(input.asset?.sourceUrl || '').trim()) failures.push('asset-provenance-incomplete');
    if (!['CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'WE3D-ORIGINAL'].includes(input.asset?.license)) failures.push('asset-license-not-approved');
    if (input.rightsStatus !== 'approved-commercial') failures.push('commercial-rights-not-approved');
    if (!String(input.attribution || '').trim()) failures.push('attribution-missing');
    if (!approvedReview(input.reviews?.anatomyScale)) failures.push('anatomy-scale-review-missing');
    if (!approvedReview(input.reviews?.rightsAttribution)) failures.push('rights-review-missing');
    if (tier.requiresBehaviorReview && !approvedReview(input.reviews?.behaviorAnimation)) failures.push('behavior-animation-review-missing');
    if (Number(input.lod?.levels) < tier.requiresLodLevels || input.lod?.mobileFallback !== true) failures.push('lod-policy-incomplete');
    if (input.rollback?.fallbackTier !== 'reference-fallback' || !String(input.rollback?.disableAssetId || '').trim()) failures.push('rollback-incomplete');
  }
  return deepFreeze({
    ok: failures.length === 0,
    schemaVersion: CREATURE_QUALITY_SCHEMA_VERSION,
    tier: input.tier || null,
    releaseable: failures.length === 0,
    failures
  });
}

function auditRegionalCreatureQuality(pack) {
  const rows = (pack?.taxa || []).map((taxon) => ({ taxonId: taxon.id, ...evaluateCreaturePresentation(taxon.presentation) }));
  const tiers = {};
  rows.forEach((row) => { tiers[row.tier] = (tiers[row.tier] || 0) + 1; });
  return deepFreeze({
    type: 'CreatureQualityAudit',
    schemaVersion: CREATURE_QUALITY_SCHEMA_VERSION,
    packId: pack?.id || null,
    packVersion: pack?.version || null,
    taxonCount: rows.length,
    releaseableCount: rows.filter((row) => row.releaseable).length,
    promotionReadyCount: rows.filter((row) => row.releaseable && row.tier !== 'reference-fallback').length,
    tiers,
    failures: rows.filter((row) => !row.releaseable)
  });
}

export {
  CREATURE_QUALITY_SCHEMA_VERSION,
  CREATURE_QUALITY_TIERS,
  auditRegionalCreatureQuality,
  evaluateCreaturePresentation
};
