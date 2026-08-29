const TRANSPORT_CATALOG_SCHEMA_VERSION = 1;

const TRANSPORT_DOMAINS = Object.freeze(['road', 'aviation', 'maritime']);
const TRANSPORT_DURABILITY_POLICIES = Object.freeze({
  EXPLORATION_UNLIMITED: 'exploration_unlimited',
  STANDARD: 'standard',
  HEAVY_DUTY: 'heavy_duty'
});

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function defineTransportCatalogEntry(definition = {}) {
  const id = String(definition.id || '').trim();
  const domain = String(definition.domain || '').trim();
  if (!id) throw new TypeError('Transport catalog entries require a stable id.');
  if (!TRANSPORT_DOMAINS.includes(domain)) throw new TypeError(`Unsupported transport domain: ${domain || 'missing'}`);

  const dimensions = Object.freeze({
    width: finitePositive(definition.width ?? definition.dimensions?.width, 1),
    height: finitePositive(definition.height ?? definition.dimensions?.height, 1),
    length: finitePositive(definition.length ?? definition.dimensions?.length, 1),
    massKg: finitePositive(definition.massKg ?? definition.dimensions?.massKg, 1000),
    draft: Math.max(0, Number(definition.draft ?? definition.dimensions?.draft) || 0),
    wingspan: Math.max(0, Number(definition.wingspan ?? definition.dimensions?.wingspan) || 0),
    rotorDiameter: Math.max(0, Number(definition.rotorDiameter ?? definition.dimensions?.rotorDiameter) || 0)
  });
  const performance = Object.freeze({
    topSpeed: finitePositive(definition.topSpeedMph ?? definition.performance?.topSpeed, 1),
    topSpeedUnit: String(definition.performance?.topSpeedUnit || (domain === 'maritime' ? 'knots' : domain === 'aviation' ? 'knots-ias' : 'mph')),
    accelerationScale: finitePositive(definition.accelerationScale ?? definition.performance?.accelerationScale, 1),
    steeringScale: finitePositive(definition.steeringScale ?? definition.performance?.steeringScale, 1),
    gripScale: finitePositive(definition.gripScale ?? definition.performance?.gripScale, 1),
    brakeScale: finitePositive(definition.brakeScale ?? definition.performance?.brakeScale, 1),
    turningRadius: finitePositive(definition.turningRadius ?? definition.performance?.turningRadius, dimensions.length)
  });
  const interaction = Object.freeze({
    playable: definition.playable !== false,
    enterable: definition.enterable !== false,
    seatCount: Math.max(1, Math.floor(Number(definition.seatCount ?? definition.interaction?.seatCount) || 1)),
    boardingPoints: Object.freeze((definition.boardingPoints || definition.interaction?.boardingPoints || ['driver']).map(String)),
    companionAboard: definition.companionAboard !== false
  });
  const damage = Object.freeze({
    durabilityPolicy: String(definition.durabilityPolicy || definition.damage?.durabilityPolicy || TRANSPORT_DURABILITY_POLICIES.STANDARD),
    resistance: finitePositive(definition.resistance ?? definition.damage?.resistance, 160),
    zones: Object.freeze((definition.damageZones || definition.damage?.zones || ['front', 'rear', 'left', 'right', 'running-gear']).map(String)),
    recovery: String(definition.recovery || definition.damage?.recovery || 'nearby-safe-surface')
  });
  const visual = Object.freeze({
    recipeId: String(definition.visualRecipeId || definition.visual?.recipeId || `${domain}:${id}`),
    lods: Object.freeze([...(definition.visual?.lods || ['promoted', 'ambient', 'distant'])]),
    mobileBudget: String(definition.visual?.mobileBudget || 'bounded'),
    referenceEvidence: String(definition.visual?.referenceEvidence || '')
  });
  const rights = Object.freeze({
    kind: String(definition.rights?.kind || 'original-generic-design'),
    brand: String(definition.rights?.brand || 'unbranded'),
    attribution: String(definition.rights?.attribution || '')
  });

  return Object.freeze({
    ...definition,
    schemaVersion: TRANSPORT_CATALOG_SCHEMA_VERSION,
    id,
    domain,
    width: dimensions.width,
    height: dimensions.height,
    length: dimensions.length,
    massKg: dimensions.massKg,
    playable: interaction.playable,
    enterable: interaction.enterable,
    durabilityPolicy: damage.durabilityPolicy,
    resistance: damage.resistance,
    dimensions,
    performance,
    interaction,
    damage,
    visual,
    rights
  });
}

function transportCatalogEntryIsPlayable(entry) {
  return entry?.interaction?.playable === true && entry?.interaction?.enterable === true;
}

export {
  TRANSPORT_CATALOG_SCHEMA_VERSION,
  TRANSPORT_DOMAINS,
  TRANSPORT_DURABILITY_POLICIES,
  defineTransportCatalogEntry,
  transportCatalogEntryIsPlayable
};
