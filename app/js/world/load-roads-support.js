import { isPointInsideWaterFootprint } from "../boat-mode/water-query.js?v=21";

export function createWorldRoadLoaderSupport({
  addBuildingToSpatialIndex,
  appCtx,
  pointInPolygon
}) {
  function registerBuildingCollision(pts, height, options = {}) {
    if (!Array.isArray(pts) || pts.length < 3) return null;
    const detail = options.detail === 'bbox' ? 'bbox' : 'full';
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let sumX = 0;
    let sumZ = 0;

    pts.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
      sumX += point.x;
      sumZ += point.z;
    });

    const centerX = Number.isFinite(options.centerX) ? options.centerX : sumX / pts.length;
    const centerZ = Number.isFinite(options.centerZ) ? options.centerZ : sumZ / pts.length;
    const baseY = Number.isFinite(options.baseY) ? options.baseY : null;
    const building = {
      pts: detail === 'full' ? pts : null,
      minX,
      maxX,
      minZ,
      maxZ,
      height,
      centerX,
      centerZ,
      colliderDetail: detail,
      sourceBuildingId: options.sourceBuildingId || null,
      name: String(options.name || '').trim(),
      address: options.address && typeof options.address === 'object' ? { ...options.address } : null,
      buildingType: options.buildingType || 'yes',
      buildingPartKind: options.buildingPartKind || 'full',
      collisionKind: options.collisionKind || 'solid',
      allowsPassageBelow: options.allowsPassageBelow === true,
      levels: Number.isFinite(options.levels) ? options.levels : null,
      levelsSource: options.levelsSource || null,
      heightSource: options.heightSource || null,
      roofShape: options.roofShape || '',
      roofHeight: Number.isFinite(options.roofHeight) ? options.roofHeight : null,
      roofHeightSource: options.roofHeightSource || null,
      geometrySource: options.geometrySource || 'osm',
      inferenceBasis: options.inferenceBasis || '',
      overtureBuildingId: options.overtureBuildingId || '',
      overtureParentBuildingId: options.overtureParentBuildingId || '',
      metadataSourceId: options.metadataSourceId || '',
      buildingProvenance: options.buildingProvenance || null,
      minLevels: Number.isFinite(options.minLevels) ? options.minLevels : null,
      baseY,
      minY: baseY,
      maxY: Number.isFinite(baseY) ? baseY + height : null,
      buildingSemantics: options.buildingSemantics || null,
      structureSemantics: options.structureSemantics || null
    };
    appCtx.buildings.push(building);
    addBuildingToSpatialIndex(building);
    return building;
  }

  function isVehicleRoad(road) {
    return !!road && road.driveable !== false && (!road.networkKind || road.networkKind === 'road');
  }

  function isInsideWaterArea(x, z) {
    return isPointInsideWaterFootprint(x, z);
  }

  return {
    isInsideWaterArea,
    isVehicleRoad,
    registerBuildingCollision
  };
}
