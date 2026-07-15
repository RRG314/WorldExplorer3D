export function collectBuildingDimensions(buildings = []) {
  const dimensions = {
    heightSources: {},
    levelSources: {},
    buildingTypes: {},
    geometrySources: {},
    inferenceBases: {},
    metadataMatched: 0,
    mappedNames: 0,
    buildingParts: 0,
    mappedRoofs: 0,
    mappedRoofHeights: 0,
    minHeight: null,
    maxHeight: null,
    maxHeightBySource: {},
    tallestBuilding: null,
    maxTopOffset: null,
    maxCenterDistance: 0,
    outerRingCount: 0,
    inferredCount: 0,
    inferredMinHeight: null,
    inferredMaxHeight: null,
    inferredHeightBuckets: {}
  };

  for (const building of buildings) {
    if (building?.collisionKind === 'barrier') {
      dimensions.infrastructureColliders = Number(dimensions.infrastructureColliders || 0) + 1;
      continue;
    }
    dimensions.architecturalCount = Number(dimensions.architecturalCount || 0) + 1;
    const heightSource = String(building?.heightSource || building?.buildingSemantics?.heightSource || 'unknown');
    const levelSource = String(building?.levelsSource || 'unknown');
    const buildingType = String(building?.buildingType || 'yes');
    const height = Number(building?.height);
    const geometrySource = String(building?.geometrySource || 'unknown');
    dimensions.heightSources[heightSource] = (dimensions.heightSources[heightSource] || 0) + 1;
    dimensions.levelSources[levelSource] = (dimensions.levelSources[levelSource] || 0) + 1;
    dimensions.buildingTypes[buildingType] = (dimensions.buildingTypes[buildingType] || 0) + 1;
    dimensions.geometrySources[geometrySource] = (dimensions.geometrySources[geometrySource] || 0) + 1;
    if (building?.inferenceBasis) {
      const inferenceBasis = String(building.inferenceBasis);
      dimensions.inferenceBases[inferenceBasis] = (dimensions.inferenceBases[inferenceBasis] || 0) + 1;
    }
    if (building?.metadataSourceId) dimensions.metadataMatched += 1;
    if (building?.name) dimensions.mappedNames += 1;
    if (building?.buildingPartKind && building.buildingPartKind !== 'full') dimensions.buildingParts += 1;
    if (building?.roofShape) dimensions.mappedRoofs += 1;
    if (Number.isFinite(building?.roofHeight)) dimensions.mappedRoofHeights += 1;
    const topOffset = Number(building?.buildingSemantics?.topOffsetMeters);
    if (Number.isFinite(topOffset)) {
      dimensions.maxTopOffset = dimensions.maxTopOffset === null ? topOffset : Math.max(dimensions.maxTopOffset, topOffset);
    }
    const centerDistance = Math.hypot(Number(building?.centerX || 0), Number(building?.centerZ || 0));
    if (Number.isFinite(centerDistance)) {
      dimensions.maxCenterDistance = Math.max(dimensions.maxCenterDistance, centerDistance);
      if (centerDistance >= 1200) dimensions.outerRingCount += 1;
    }
    if (!Number.isFinite(height)) continue;

    dimensions.minHeight = dimensions.minHeight === null ? height : Math.min(dimensions.minHeight, height);
    dimensions.maxHeight = dimensions.maxHeight === null ? height : Math.max(dimensions.maxHeight, height);
    dimensions.maxHeightBySource[heightSource] = Math.max(
      Number(dimensions.maxHeightBySource[heightSource] || 0),
      height
    );
    if (!dimensions.tallestBuilding || height > dimensions.tallestBuilding.height) {
      dimensions.tallestBuilding = {
        height,
        heightSource,
        geometrySource,
        name: building?.name || null,
        metadataSourceId: building?.metadataSourceId || null,
        buildingType
      };
    }
    if (heightSource !== 'fallback') continue;

    const bucket = String(Math.round(height * 2) / 2);
    dimensions.inferredCount += 1;
    dimensions.inferredMinHeight = dimensions.inferredMinHeight === null ? height : Math.min(dimensions.inferredMinHeight, height);
    dimensions.inferredMaxHeight = dimensions.inferredMaxHeight === null ? height : Math.max(dimensions.inferredMaxHeight, height);
    dimensions.inferredHeightBuckets[bucket] = (dimensions.inferredHeightBuckets[bucket] || 0) + 1;
  }

  return dimensions;
}
