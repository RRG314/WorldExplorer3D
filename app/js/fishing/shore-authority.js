const SHORE_FISHING_POLICY = Object.freeze({
  maximumBankDistanceMeters: 42,
  maximumCastCorridorMeters: 48,
  corridorSamples: 7
});

function sourceTags(candidate) {
  return candidate?.source?.tags || candidate?.source?.properties || candidate?.source?.rawTags || {};
}

function restrictedOutcome(tags = {}) {
  const fishing = String(tags.fishing || '').toLowerCase();
  const access = String(tags.access || tags.foot || '').toLowerCase();
  if (fishing === 'no' || String(tags.protected || '').toLowerCase() === 'yes') return 'protected_or_closed';
  if (fishing === 'private' || access === 'private' || access === 'no') return 'private_or_excluded';
  return null;
}

function explicitFishingAccess(tags = {}) {
  const fishing = String(tags.fishing || '').toLowerCase();
  const leisure = String(tags.leisure || '').toLowerCase();
  return ['yes', 'designated', 'catch_and_release', 'permit'].includes(fishing) || leisure === 'fishing';
}

function corridorBlocked(appCtx, position, target) {
  if (typeof appCtx?.checkBuildingCollision !== 'function') return false;
  for (let index = 1; index < SHORE_FISHING_POLICY.corridorSamples; index += 1) {
    const amount = index / SHORE_FISHING_POLICY.corridorSamples;
    const x = position.x + (target.x - position.x) * amount;
    const z = position.z + (target.z - position.z) * amount;
    const surfaceY = appCtx.sampleSurfaceY?.(x, z) ?? position.y ?? 0;
    const result = appCtx.checkBuildingCollision(x, z, 0.75, {
      actorBaseY: Number(surfaceY) || 0,
      actorHeight: 2.1
    });
    if (result?.collision === true) return true;
  }
  return false;
}

function messageForOutcome(outcome, distanceMeters = null) {
  if (outcome === 'shore_eligible') return 'Mapped shoreline and explicit fishing access support virtual shore fishing here.';
  if (outcome === 'access_unknown') return 'The mapped bank is reachable, but fishing permission is unknown. Virtual practice is available without location reward; check local signs and rules.';
  if (outcome === 'boat_only') return 'This position is on the water. Use Boat Mode for this fishing area.';
  if (outcome === 'private_or_excluded') return 'Mapped access restrictions exclude this bank.';
  if (outcome === 'protected_or_closed') return 'Mapped fishing restrictions close this water to shore fishing.';
  if (outcome === 'no_safe_bank') return distanceMeters == null ? 'No safe mapped bank was found nearby.' : `Nearest mapped water is ${Math.ceil(distanceMeters)} m away; move closer on a public walking surface.`;
  return 'No supported mapped waterbody is available at this position.';
}

function evaluateShoreFishing(appCtx, position = {}, options = {}) {
  const liveGps = appCtx?.getLiveGpsSnapshot?.() || { active: false };
  const effectivePosition = liveGps.active && Number.isFinite(liveGps.fieldWorld?.x) && Number.isFinite(liveGps.fieldWorld?.z)
    ? { ...position, x: liveGps.fieldWorld.x, z: liveGps.fieldWorld.z }
    : position;
  const x = Number(effectivePosition?.x);
  const z = Number(effectivePosition?.z);
  if (!Number.isFinite(x) || !Number.isFinite(z) || typeof appCtx?.inspectBoatCandidate !== 'function') {
    return Object.freeze({ outcome: 'not_supported', playable: false, rewardEligible: false, message: messageForOutcome('not_supported') });
  }
  const candidate = appCtx.inspectBoatCandidate(x, z, SHORE_FISHING_POLICY.maximumBankDistanceMeters, {
    allowSynthetic: false,
    requireContainment: false,
    referenceY: Number(effectivePosition?.y),
    maximumVerticalDelta: 8
  });
  if (!candidate || candidate.synthetic || candidate.source?.synthetic) {
    return Object.freeze({ outcome: 'no_safe_bank', playable: false, rewardEligible: false, message: messageForOutcome('no_safe_bank') });
  }
  if (candidate.inside) {
    return Object.freeze({ outcome: 'boat_only', playable: false, rewardEligible: false, message: messageForOutcome('boat_only') });
  }
  const distanceMeters = Number(candidate.distanceToWater);
  if (!Number.isFinite(distanceMeters) || distanceMeters > SHORE_FISHING_POLICY.maximumBankDistanceMeters) {
    const target = candidate.entryPoint || { x: candidate.spawnX, z: candidate.spawnZ };
    return Object.freeze({
      outcome: 'no_safe_bank', playable: false, rewardEligible: false, distanceMeters,
      waterbodyId: String(candidate.source?.registryId || candidate.source?.sourceFeatureId || candidate.source?.id || 'mapped-water'),
      waterKind: String(candidate.waterKind || 'water'),
      castTarget: Number.isFinite(target?.x) && Number.isFinite(target?.z) ? Object.freeze({ x: Number(target.x), z: Number(target.z) }) : null,
      message: messageForOutcome('no_safe_bank', distanceMeters)
    });
  }
  const target = candidate.entryPoint || { x: candidate.spawnX, z: candidate.spawnZ };
  if (!Number.isFinite(target?.x) || !Number.isFinite(target?.z) || corridorBlocked(appCtx, effectivePosition, target)) {
    return Object.freeze({ outcome: 'no_safe_bank', playable: false, rewardEligible: false, distanceMeters, message: 'A mapped structure blocks the cast corridor from this bank.' });
  }
  const tags = sourceTags(candidate);
  const restriction = restrictedOutcome(tags);
  if (restriction) {
    return Object.freeze({ outcome: restriction, playable: false, rewardEligible: false, distanceMeters, message: messageForOutcome(restriction) });
  }
  if (liveGps.active && liveGps.fieldSession?.eligible !== true) {
    return Object.freeze({
      outcome: 'gps_held', playable: false, rewardEligible: false, distanceMeters,
      message: `Live GPS shore fishing is held: ${String(liveGps.fieldSession?.pauseReason || 'waiting for an eligible fix').replaceAll('-', ' ')}.`
    });
  }
  const outcome = explicitFishingAccess(tags) ? 'shore_eligible' : 'access_unknown';
  return Object.freeze({
    type: 'ShoreFishingEligibility', schemaVersion: 1, outcome,
    playable: true,
    rewardEligible: outcome === 'shore_eligible',
    accessTruth: outcome === 'shore_eligible' ? 'mapped-explicit' : 'data-insufficient',
    waterbodyId: String(candidate.source?.registryId || candidate.source?.sourceFeatureId || candidate.source?.id || 'mapped-water'),
    waterKind: String(candidate.waterKind || 'water'),
    waterLabel: String(candidate.label || candidate.waterKind || 'Mapped water'),
    distanceMeters: Number(distanceMeters.toFixed(1)),
    castTarget: Object.freeze({ x: Number(target.x), z: Number(target.z) }),
    sourceDataset: String(candidate.source?.provenance?.dataset || candidate.source?.registryProvenance?.geometrySource || 'mapped-water'),
    message: messageForOutcome(outcome, distanceMeters)
  });
}

export { SHORE_FISHING_POLICY, evaluateShoreFishing };
