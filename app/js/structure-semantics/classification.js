function normalizedTagValue(value = '') {
  return String(value || '').trim().toLowerCase();
}

function isTruthyTag(value = '') {
  const normalized = normalizedTagValue(value);
  if (!normalized) return false;
  return !/^(no|false|0|none)$/i.test(normalized);
}

function parseNumericTag(value, fallback = NaN) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const first = raw.split(/[;,]/)[0]?.trim();
  const parsed = Number.parseFloat(first);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIntegerTag(value, fallback = 0) {
  const parsed = parseNumericTag(value, fallback);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function featureTypeCategory(featureKind = 'road', subtype = '') {
  const kind = normalizedTagValue(featureKind);
  const type = normalizedTagValue(subtype);
  if (kind === 'railway') return 'railway';
  if (kind === 'building') return 'building';
  if (kind === 'connector') return 'connector';
  if (kind === 'footway' || kind === 'cycleway') return kind;
  if (kind === 'road') return 'road';
  if (/^(footway|pedestrian|path|steps|corridor)$/.test(type)) return 'footway';
  if (type === 'cycleway') return 'cycleway';
  if (/^(rail|light_rail|tram|subway|narrow_gauge)$/.test(type)) return 'railway';
  return kind || 'road';
}

function baseClearanceForCategory(category = 'road') {
  switch (category) {
    case 'railway':
      return 6.2;
    case 'cycleway':
      return 4.5;
    case 'footway':
    case 'connector':
      return 4.2;
    case 'building':
      return 0;
    default:
      return 5.5;
  }
}

function baseDepthForCategory(category = 'road') {
  switch (category) {
    case 'railway':
      return 5.2;
    case 'cycleway':
      return 3.4;
    case 'footway':
    case 'connector':
      return 3.0;
    case 'building':
      return 0;
    default:
      return 4.6;
  }
}

function classifyStructureSemantics(tags = {}, options = {}) {
  const featureCategory = featureTypeCategory(options.featureKind, options.subtype || tags?.highway || tags?.railway || tags?.building);
  const highway = normalizedTagValue(tags?.highway);
  const bridgeTag = normalizedTagValue(tags?.bridge);
  const tunnelTag = normalizedTagValue(tags?.tunnel);
  const coveredTag = normalizedTagValue(tags?.covered);
  const indoorTag = normalizedTagValue(tags?.indoor);
  const location = normalizedTagValue(tags?.location);
  const manMade = normalizedTagValue(tags?.man_made);
  const placement = normalizedTagValue(tags?.placement);
  const rampTag = normalizedTagValue(tags?.ramp);
  const passage = normalizedTagValue(tags?.passage || tags?.building_passage);
  const cutting = isTruthyTag(tags?.cutting);
  const embankment = isTruthyTag(tags?.embankment);
  const layer = parseIntegerTag(tags?.layer, 0);
  const level = parseNumericTag(tags?.level, NaN);
  const minHeight = parseNumericTag(tags?.min_height, NaN);
  const buildingMinLevel = parseNumericTag(tags?.['building:min_level'], NaN);
  const culvert = tunnelTag === 'culvert' || normalizedTagValue(tags?.culvert) === 'yes';
  const isBridge = isTruthyTag(bridgeTag) || manMade === 'bridge';
  const buildingPassage = tunnelTag === 'building_passage' || passage === 'yes';
  const underground = location === 'underground' || location === 'underwater';
  const isTunnel = (isTruthyTag(tunnelTag) && !buildingPassage) || underground;
  const isCovered = isTruthyTag(coveredTag) || buildingPassage;
  const isIndoor = isTruthyTag(indoorTag);
  const isPedestrianConnector = /^(footway|pedestrian|path|corridor|steps)$/.test(highway) || featureCategory === 'connector';
  const rampCandidate =
    rampTag === 'yes' ||
    placement === 'transition' ||
    /_link$/.test(highway);
  const explicitBaseOffset =
    Number.isFinite(minHeight) ? minHeight :
    Number.isFinite(buildingMinLevel) ? buildingMinLevel * 3.4 :
    Number.isFinite(level) && level > 0 ? level * 3.4 :
    0;

  const baseClearance = baseClearanceForCategory(featureCategory);
  const baseDepth = baseDepthForCategory(featureCategory);
  const verticalOrder =
    layer !== 0 ? layer :
    isTunnel || culvert ? -1 :
    isBridge || explicitBaseOffset > 2.5 || (Number.isFinite(level) && level > 0) ? 1 :
    0;

  const deckClearance = Math.max(
    explicitBaseOffset,
    verticalOrder > 0 ? baseClearance * verticalOrder : 0
  );
  const cutDepth = Math.max(
    verticalOrder < 0 ? baseDepth * Math.abs(verticalOrder) : 0,
    culvert ? 2.4 : 0
  );

  const elevatedConnectorCandidate =
    isPedestrianConnector &&
    !isTunnel &&
    !culvert &&
    (
      isBridge ||
      verticalOrder > 0 ||
      explicitBaseOffset > 2.5 ||
      location === 'roof'
    );

  // `layer` describes relative ordering, not a physical deck height. Keep it
  // available to topology, but require an explicit bridge/level/roof signal
  // before publishing pedestrian structure geometry. This prevents incomplete
  // OSM tagging from becoming invented skywalks worldwide.
  const physicalStructureEvidence =
    isBridge ||
    isTunnel ||
    culvert ||
    explicitBaseOffset > 0 ||
    location === 'roof' ||
    underground ||
    buildingPassage;

  const skywalk =
    elevatedConnectorCandidate &&
    (isBridge || isIndoor || isCovered || location === 'roof' || explicitBaseOffset > 2.5);

  let structureKind = 'at_grade';
  let terrainMode = 'at_grade';
  if (culvert) {
    structureKind = 'culvert';
    terrainMode = 'subgrade';
  } else if (isTunnel) {
    structureKind = 'tunnel';
    terrainMode = 'subgrade';
  } else if (skywalk) {
    structureKind = 'skywalk';
    terrainMode = 'elevated';
  } else if (isBridge) {
    structureKind = 'bridge';
    terrainMode = 'elevated';
  } else if (explicitBaseOffset > 2.5 || location === 'roof') {
    structureKind = isPedestrianConnector ? 'connector' : 'elevated';
    terrainMode = 'elevated';
  } else if (verticalOrder > 0) {
    // A positive layer without bridge/level/min-height evidence is only an
    // ordering hint. Preserve that order for topology while draping the way
    // to terrain so incomplete OSM tags cannot fabricate a floating deck.
    structureKind = 'layer';
  } else if (isCovered || isIndoor) {
    structureKind = 'covered';
  }

  return {
    featureCategory,
    structureKind,
    terrainMode,
    gradeSeparated: terrainMode !== 'at_grade',
    topologySeparated: terrainMode !== 'at_grade' || layer !== 0,
    isBridge,
    isTunnel,
    culvert,
    covered: isCovered,
    indoor: isIndoor,
    buildingPassage,
    underground,
    cutting,
    embankment,
    skywalk,
    placement,
    layer,
    level: Number.isFinite(level) ? level : null,
    verticalOrder,
    deckClearance,
    cutDepth,
    explicitBaseOffset,
    physicalStructureEvidence,
    elevatedConnectorCandidate,
    rampCandidate,
    verticalGroup: `${terrainMode}:${verticalOrder}:${structureKind}`
  };
}


export { classifyStructureSemantics, normalizedTagValue };
