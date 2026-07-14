function normalizedTagValue(value = '') {
  return String(value || '').trim().toLowerCase();
}

function parseNumericTag(value, fallback = NaN) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const first = raw.split(/[;,]/)[0]?.trim();
  const parsed = Number.parseFloat(first);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseLinearMetersTag(value, fallback = NaN) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const first = raw.split(/[;,]/)[0]?.trim().toLowerCase();
  if (!first) return fallback;

  const parsed = Number.parseFloat(first);
  if (!Number.isFinite(parsed)) return fallback;

  if (
    first.includes('ft') ||
    first.includes('foot') ||
    first.includes('feet') ||
    first.includes('\'')
  ) {
    return parsed * 0.3048;
  }

  return parsed;
}

const DEFAULT_LEVEL_HEIGHT_METERS = 3.2;

function clampPositive(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, next);
}

function footprintSizeFactor(footprintArea = 0, footprintWidth = 0, footprintDepth = 0) {
  const safeArea = clampPositive(footprintArea, 0);
  const safeWidth = clampPositive(footprintWidth, 0);
  const safeDepth = clampPositive(footprintDepth, 0);
  const minSpan =
    safeWidth > 0 && safeDepth > 0 ?
      Math.min(safeWidth, safeDepth) :
      safeWidth > 0 ?
        safeWidth :
        safeDepth;
  const areaFactor = safeArea > 0 ? Math.max(0, Math.min(1, (safeArea - 90) / 900)) : 0;
  const spanFactor = minSpan > 0 ? Math.max(0, Math.min(1, (minSpan - 9) / 28)) : 0;
  return Math.max(areaFactor, spanFactor);
}

function buildingSeedFromIdentity(identity, worldSeed = 0) {
  const value = String(identity ?? '');
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash ^ (Number(worldSeed) >>> 0)) >>> 0;
}

function inferFallbackBuildingHeightMeters(buildingType, footprintArea, footprintWidth, footprintDepth, seedValue) {
  const type = normalizedTagValue(buildingType);
  const safeArea = clampPositive(footprintArea, 0);
  const safeWidth = clampPositive(footprintWidth, 0);
  const safeDepth = clampPositive(footprintDepth, 0);
  const minSpan = safeWidth > 0 && safeDepth > 0 ? Math.min(safeWidth, safeDepth) : safeWidth || safeDepth;
  const sizeFactor = footprintSizeFactor(safeArea, safeWidth, safeDepth);

  let minHeight = 7;
  let maxHeight = 15;
  if (type === 'house' || type === 'residential' || type === 'detached') {
    minHeight = 5.4;
    maxHeight = 9.2;
  } else if (type === 'apartments') {
    minHeight = 10;
    maxHeight = 20 + sizeFactor * 10;
  } else if (type === 'commercial' || type === 'retail') {
    minHeight = 8.5;
    maxHeight = 18 + sizeFactor * 10;
  } else if (type === 'office') {
    minHeight = 12;
    maxHeight = 22 + sizeFactor * 12;
  } else if (type === 'hotel') {
    minHeight = 12;
    maxHeight = 22 + sizeFactor * 10;
  } else if (type === 'industrial' || type === 'warehouse') {
    minHeight = 7.5;
    maxHeight = 14 + sizeFactor * 5;
  } else if (type === 'church' || type === 'cathedral') {
    minHeight = 12;
    maxHeight = 22 + sizeFactor * 8;
  } else if (type === 'school' || type === 'stadium') {
    minHeight = 8.5;
    maxHeight = 16 + sizeFactor * 6;
  } else if (type === 'service') {
    minHeight = 5;
    maxHeight = 8.5;
  }

  const blend = Math.max(0, Math.min(1, Number(seedValue) || 0));
  return Math.max(minHeight, Math.min(maxHeight, minHeight + (maxHeight - minHeight) * blend));
}

function fallbackFullBuildingHeightCap(buildingType = '', footprintArea = 0, footprintWidth = 0, footprintDepth = 0) {
  const type = normalizedTagValue(buildingType);
  const sizeFactor = footprintSizeFactor(footprintArea, footprintWidth, footprintDepth);

  let baseCap = 18;
  let rangeCap = 8;
  if (type === 'house' || type === 'residential' || type === 'detached') {
    baseCap = 10.5;
    rangeCap = 3.5;
  } else if (type === 'apartments') {
    baseCap = 20;
    rangeCap = 10;
  } else if (type === 'commercial' || type === 'retail') {
    baseCap = 18;
    rangeCap = 10;
  } else if (type === 'office') {
    baseCap = 22;
    rangeCap = 12;
  } else if (type === 'hotel') {
    baseCap = 22;
    rangeCap = 10;
  } else if (type === 'industrial' || type === 'warehouse') {
    baseCap = 14;
    rangeCap = 6;
  } else if (type === 'church' || type === 'cathedral') {
    baseCap = 24;
    rangeCap = 8;
  } else if (type === 'school' || type === 'stadium') {
    baseCap = 16;
    rangeCap = 8;
  }

  return baseCap + rangeCap * sizeFactor;
}

function inferBuildingPartKind(tags = {}) {
  const part = normalizedTagValue(tags?.['building:part']);
  if (!part) return 'full';
  if (part === 'roof') return 'roof';
  if (part === 'balcony') return 'balcony';
  if (part === 'canopy' || part === 'awning') return 'canopy';
  return 'part';
}

function hasIntentionalVerticalStructure(tags = {}) {
  const manMade = normalizedTagValue(tags?.man_made);
  const towerType = normalizedTagValue(tags?.['tower:type']);
  const roofShape = normalizedTagValue(tags?.['roof:shape']);
  const building = normalizedTagValue(tags?.building);
  const amenity = normalizedTagValue(tags?.amenity);

  if (towerType) return true;
  if ([
    'antenna',
    'bridge_tower',
    'chimney',
    'communications_tower',
    'cooling_tower',
    'lighthouse',
    'mast',
    'minaret',
    'silo',
    'tower',
    'water_tower'
  ].includes(manMade)) {
    return true;
  }
  if (['spire', 'onion', 'dome'].includes(roofShape)) return true;
  if ((building === 'church' || building === 'cathedral') && amenity === 'place_of_worship') return true;
  return false;
}

function computeBuildingBaseOffset(tags = {}, options = {}) {
  const levelHeight = clampPositive(options.levelHeightMeters, DEFAULT_LEVEL_HEIGHT_METERS) || DEFAULT_LEVEL_HEIGHT_METERS;
  const partKind = inferBuildingPartKind(tags);
  const minHeight = parseLinearMetersTag(tags?.min_height, NaN);
  const minLevel = parseNumericTag(tags?.['building:min_level'], NaN);
  const level = parseNumericTag(tags?.level, NaN);

  if (Number.isFinite(minHeight)) return Math.max(0, minHeight);
  if (Number.isFinite(minLevel)) return Math.max(0, minLevel) * levelHeight;
  if (partKind === 'roof' && Number.isFinite(level)) return Math.max(0, level) * levelHeight;
  if (partKind === 'balcony' && Number.isFinite(level)) return Math.max(0, level - 1) * levelHeight;
  if (Number.isFinite(level) && level > 0) return level * levelHeight;
  return 0;
}

function computeBuildingHeight(tags = {}, options = {}) {
  const levelHeight = clampPositive(options.levelHeightMeters, DEFAULT_LEVEL_HEIGHT_METERS) || DEFAULT_LEVEL_HEIGHT_METERS;
  const partKind = inferBuildingPartKind(tags);
  const explicitHeight = parseLinearMetersTag(tags?.height, NaN);
  const buildingLevels = parseNumericTag(tags?.['building:levels'], NaN);
  const buildingMinLevel = parseNumericTag(tags?.['building:min_level'], NaN);
  const baseOffsetMeters = clampPositive(options.baseOffsetMeters, 0);

  if (Number.isFinite(explicitHeight)) {
    return Math.max(0.2, explicitHeight - baseOffsetMeters);
  }
  if (Number.isFinite(buildingLevels)) {
    const effectiveLevels = Number.isFinite(buildingMinLevel) ?
      Math.max(0.0625, buildingLevels - buildingMinLevel) :
      buildingLevels;
    return Math.max(0.2, effectiveLevels * levelHeight);
  }
  if (partKind === 'roof') return 0.35;
  if (partKind === 'balcony') return 0.32;
  if (partKind === 'canopy') return 0.45;
  if (normalizedTagValue(tags?.['building:part'])) return Math.max(1.8, clampPositive(options.fallbackPartHeight, 3.2));
  return Math.max(3.2, clampPositive(options.fallbackHeight, 10));
}

function constrainBuildingHeightMeters(tags = {}, rawHeightMeters, options = {}) {
  let heightMeters = Math.max(0.2, Number(rawHeightMeters) || 0.2);
  const partKind = options.partKind || inferBuildingPartKind(tags);
  const baseOffsetMeters = clampPositive(options.baseOffsetMeters, 0);
  const footprintArea = clampPositive(options.footprintArea, 0);
  const footprintWidth = clampPositive(options.footprintWidth, 0);
  const footprintDepth = clampPositive(options.footprintDepth, 0);
  const minSpan =
    footprintWidth > 0 && footprintDepth > 0 ?
      Math.min(footprintWidth, footprintDepth) :
    footprintWidth > 0 ?
      footprintWidth :
      footprintDepth;
  const heightSource = String(options.heightSource || 'fallback');
  const buildingType = normalizedTagValue(options.buildingType || tags?.building || tags?.['building:part'] || '');
  const buildingPartTag = normalizedTagValue(tags?.['building:part']);
  const intentionalVerticalStructure = hasIntentionalVerticalStructure(tags);
  const elevatedPart =
    !!buildingPartTag ||
    partKind !== 'full';

  let heightCapped = false;
  if (
    !intentionalVerticalStructure &&
    elevatedPart &&
    (heightSource === 'fallback_part' || heightSource === 'fallback')
  ) {
    const compactFootprint =
      (footprintArea > 0 && footprintArea <= 180) ||
      (Number.isFinite(minSpan) && minSpan <= 10.5);
    if (compactFootprint) {
      const areaCap = footprintArea > 0 ? Math.max(4.8, Math.sqrt(footprintArea) * 2.3) : 6.5;
      const spanCap = Number.isFinite(minSpan) ? Math.max(5.5, minSpan * 2.8) : 8.5;
      let cap = Math.max(areaCap, spanCap);
      if (heightSource === 'fallback_part' || heightSource === 'fallback') {
        cap = Math.min(cap, 12);
      } else if (baseOffsetMeters >= 1.8) {
        cap = Math.min(Math.max(cap, 10), 18);
      } else {
        cap = Math.min(Math.max(cap, 12), 22);
      }
      if (partKind === 'roof' || partKind === 'balcony' || partKind === 'canopy') {
        cap = Math.min(cap, 3.2);
      }
      if (heightMeters > cap) {
        heightMeters = cap;
        heightCapped = true;
      }
    }
  }

  if (!intentionalVerticalStructure && !elevatedPart && heightSource === 'fallback') {
    const fallbackCap = fallbackFullBuildingHeightCap(
      buildingType,
      footprintArea,
      footprintWidth,
      footprintDepth
    );
    if (heightMeters > fallbackCap) {
      heightMeters = fallbackCap;
      heightCapped = true;
    }
  }

  return {
    heightMeters,
    heightCapped,
    intentionalVerticalStructure
  };
}

function interpretBuildingSemantics(tags = {}, options = {}) {
  const levelHeightMeters = clampPositive(options.levelHeightMeters, DEFAULT_LEVEL_HEIGHT_METERS) || DEFAULT_LEVEL_HEIGHT_METERS;
  const partKind = inferBuildingPartKind(tags);
  const level = parseNumericTag(tags?.level, NaN);
  const buildingLevels = parseNumericTag(tags?.['building:levels'], NaN);
  const buildingMinLevel = parseNumericTag(tags?.['building:min_level'], NaN);
  const baseOffsetMeters = computeBuildingBaseOffset(tags, { levelHeightMeters });
  const explicitHeight = parseLinearMetersTag(tags?.height, NaN);
  const rawHeightMeters = computeBuildingHeight(tags, {
    levelHeightMeters,
    baseOffsetMeters,
    fallbackHeight: options.fallbackHeight,
    fallbackPartHeight: options.fallbackPartHeight
  });
  const heightSource =
    Number.isFinite(explicitHeight) ? 'explicit_height' :
    Number.isFinite(buildingLevels) ? 'levels' :
    normalizedTagValue(tags?.['building:part']) ? 'fallback_part' :
    'fallback';
  const constrainedHeight = constrainBuildingHeightMeters(tags, rawHeightMeters, {
    partKind,
    baseOffsetMeters,
    buildingType: options.buildingType,
    footprintArea: options.footprintArea,
    footprintWidth: options.footprintWidth,
    footprintDepth: options.footprintDepth,
    heightSource
  });
  const heightMeters = constrainedHeight.heightMeters;
  const topOffsetMeters = baseOffsetMeters + heightMeters;
  const roofLike = partKind === 'roof' || partKind === 'balcony' || partKind === 'canopy';
  const elevatedPart = baseOffsetMeters > 0.4;

  return {
    partKind,
    level: Number.isFinite(level) ? level : null,
    buildingLevels: Number.isFinite(buildingLevels) ? buildingLevels : null,
    buildingMinLevel: Number.isFinite(buildingMinLevel) ? buildingMinLevel : null,
    levelHeightMeters,
    baseOffsetMeters,
    mappedTopOffsetMeters: Number.isFinite(explicitHeight) ? explicitHeight : null,
    rawHeightMeters,
    heightMeters,
    heightSource,
    heightCapped: constrainedHeight.heightCapped,
    intentionalVerticalStructure: constrainedHeight.intentionalVerticalStructure,
    topOffsetMeters,
    roofLike,
    elevatedPart,
    thinPart: roofLike,
    allowsPassageBelow: roofLike || baseOffsetMeters >= 2.8,
    shouldCreateGroundPatch: !roofLike && baseOffsetMeters < 0.35,
    shouldCreateRoofDetail: !roofLike,
    collisionKind: roofLike ? 'thin_part' : elevatedPart ? 'elevated_part' : 'solid'
  };
}

export {
  DEFAULT_LEVEL_HEIGHT_METERS,
  buildingSeedFromIdentity,
  computeBuildingBaseOffset,
  computeBuildingHeight,
  inferFallbackBuildingHeightMeters,
  inferBuildingPartKind,
  hasIntentionalVerticalStructure,
  interpretBuildingSemantics
};
