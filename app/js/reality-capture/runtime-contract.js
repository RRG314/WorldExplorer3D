const DISALLOWED_BUILDING_ID = /^(fallback-|dynamic:|overlay:|destination:|inferred:)/i;
const DISALLOWED_GEOMETRY_SOURCE = /^(generated|synthetic|inferred|fallback|dynamic|overlay)/i;

function text(value) {
  return String(value || '').trim();
}

function runtimePublicationState(appCtx = {}) {
  const config = appCtx.realityCaptureRuntimeConfig || globalThis.__WE3D_REALITY_CAPTURE_RUNTIME__ || {};
  const enabled = config.publicationEnabled === true && config.stagingProvisioned === true;
  return Object.freeze({
    enabled,
    reason: enabled ? 'staging_provisioned' : 'staging_not_provisioned'
  });
}

function canonicalRoomId(appCtx = {}) {
  const room = typeof appCtx.getCurrentMultiplayerRoom === 'function'
    ? appCtx.getCurrentMultiplayerRoom()
    : null;
  return text(room?.id || room?.code);
}

function hasStableMappedBuildingIdentity(building = {}) {
  const sourceBuildingId = text(building.sourceBuildingId);
  const geometrySource = text(building.geometrySource || building.sourceAuthority).toLowerCase();
  if (!sourceBuildingId || DISALLOWED_BUILDING_ID.test(sourceBuildingId)) return false;
  if (geometrySource && DISALLOWED_GEOMETRY_SOURCE.test(geometrySource)) return false;
  if (building.syntheticInteriorOnly || building.collisionKind === 'barrier' || building.collisionDisabled) return false;
  const points = Array.isArray(building.pts) ? building.pts : [];
  const hasPolygon = points.length >= 3;
  const hasBounds = [building.minX, building.maxX, building.minZ, building.maxZ]
    .every((value) => Number.isFinite(Number(value))) &&
    Number(building.maxX) > Number(building.minX) && Number(building.maxZ) > Number(building.minZ);
  return hasPolygon || hasBounds;
}

function resolveCanonicalMappedBuilding(appCtx = {}, target = {}) {
  const targetSourceId = text(
    target?.object?.userData?.sourceBuildingId ||
    target?.building?.sourceBuildingId ||
    target?.sourceBuildingId ||
    target?.key ||
    target?.id
  );
  if (!targetSourceId || DISALLOWED_BUILDING_ID.test(targetSourceId)) return null;
  const building = (Array.isArray(appCtx.buildings) ? appCtx.buildings : [])
    .find((candidate) => text(candidate?.sourceBuildingId) === targetSourceId) || null;
  if (!building || !hasStableMappedBuildingIdentity(building)) return null;
  return building;
}

export {
  canonicalRoomId,
  hasStableMappedBuildingIdentity,
  resolveCanonicalMappedBuilding,
  runtimePublicationState
};
