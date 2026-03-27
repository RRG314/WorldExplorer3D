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

  if (Number.isFinite(explicitHeight)) return Math.max(0.2, explicitHeight);
  if (Number.isFinite(buildingLevels)) return Math.max(0.2, buildingLevels * levelHeight);
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
  const buildingPartTag = normalizedTagValue(tags?.['building:part']);
  const intentionalVerticalStructure = hasIntentionalVerticalStructure(tags);
  const elevatedPart =
    !!buildingPartTag ||
    partKind !== 'full';

  let heightCapped = false;
  if (!intentionalVerticalStructure && elevatedPart) {
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
  computeBuildingBaseOffset,
  computeBuildingHeight,
  inferBuildingPartKind,
  hasIntentionalVerticalStructure,
  interpretBuildingSemantics
};
