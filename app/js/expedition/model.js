import { getPropulsionProfile, getShipProfile } from './catalog.js?v=2';
import { calculateExpeditionTravel } from './travel-calculator.js?v=1';

const EXPEDITION_SCHEMA_VERSION = 1;
const RESOURCE_KEYS = Object.freeze([
  'foodKg', 'waterKg', 'powerMWh', 'propellantKg', 'medicalUnits',
  'maintenanceKg', 'feedstockKg', 'scienceCargoKg'
]);

function clone(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function crewRoleCoverage(crew = []) {
  const coverage = new Map();
  for (const member of crew) {
    if (!member || member.status === 'dead') continue;
    for (const role of member.roles || []) coverage.set(role, (coverage.get(role) || 0) + 1);
  }
  return coverage;
}

function recommendedResources(expected, margin = 0.2) {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, Number(expected[key] || 0) * (1 + margin)]));
}

function totalCargoMass(resources) {
  return RESOURCE_KEYS.reduce((sum, key) => {
    if (key === 'powerMWh' || key === 'medicalUnits' || key === 'propellantKg') return sum;
    return sum + Math.max(0, Number(resources?.[key]) || 0);
  }, 0);
}

function assessExpeditionReadiness({ ship, propulsion, crew, resources, calculation }) {
  const failures = [];
  const warnings = [];
  if (!ship || ship.releaseStatus !== 'playable-slice') failures.push('This ship is not available in the current Expedition slice.');
  if (!propulsion?.crewedInterstellarEligible) failures.push('This propulsion system cannot support a crewed interstellar route.');
  if (ship && propulsion && !ship.supportedPropulsionIds.includes(propulsion.id)) failures.push('The selected propulsion system does not fit this ship.');
  if ((crew?.length || 0) < Number(ship?.minCrew || 1)) failures.push(`At least ${ship?.minCrew || 1} crew members are required.`);
  if ((crew?.length || 0) > Number(ship?.maxCrew || 0)) failures.push(`This ship supports no more than ${ship?.maxCrew || 0} crew members.`);
  const coverage = crewRoleCoverage(crew);
  for (const role of ship?.requiredRoles || []) {
    if (!coverage.has(role)) failures.push(`Crew coverage is missing: ${role}.`);
    else if (coverage.get(role) === 1) warnings.push(`Only one crew member covers ${role}.`);
  }
  for (const key of RESOURCE_KEYS) {
    const available = Math.max(0, Number(resources?.[key]) || 0);
    const expected = Math.max(0, Number(calculation?.expectedResources?.[key]) || 0);
    if (available + 1e-9 < expected) failures.push(`${key} is below the route forecast.`);
    else if (available < expected * 1.15) warnings.push(`${key} has less than a 15% reserve.`);
  }
  if (ship && totalCargoMass(resources) > ship.cargoCapacityKg) failures.push('Provisioned cargo exceeds ship capacity.');
  if (ship && Number(resources?.propellantKg || 0) > ship.propellantCapacityKg) failures.push('Propulsion resource exceeds the ship tank capacity.');
  return Object.freeze({
    status: failures.length ? 'insufficient' : warnings.length ? 'marginal' : 'ready',
    failures: Object.freeze(failures),
    warnings: Object.freeze(warnings),
    roleCoverage: Object.freeze(Object.fromEntries(coverage))
  });
}

function createExpeditionPlan({
  destinationId,
  shipId = 'long-range-research-vessel',
  propulsionId = 'radiant-plasma-field-drive',
  crew = [],
  resources = null,
  realism = 'science-inspired',
  survival = 'forgiving',
  createdAtMs = Date.now(),
  id = `expedition-${createdAtMs}`
}) {
  const ship = getShipProfile(shipId);
  const propulsion = getPropulsionProfile(propulsionId);
  const calculation = calculateExpeditionTravel({ destinationId, ship, propulsion, crewCount: crew.length });
  const provisioned = resources ? clone(resources) : recommendedResources(calculation.expectedResources, survival === 'severe' ? 0.08 : 0.25);
  const readiness = assessExpeditionReadiness({ ship, propulsion, crew, resources: provisioned, calculation });
  const systems = Object.fromEntries((ship?.systems || []).map((systemId) => [systemId, { condition: 1, status: 'optimal' }]));
  return Object.freeze({
    type: 'InterstellarExpedition',
    schemaVersion: EXPEDITION_SCHEMA_VERSION,
    id,
    createdAtMs,
    updatedAtMs: createdAtMs,
    originId: 'sol',
    destinationId,
    realism,
    survival,
    state: 'planned',
    ship: Object.freeze({ id: `${id}-ship`, profileId: shipId, name: 'Surveyor', interiorSeed: ship?.interiorSeed || 0 }),
    propulsionId,
    crew: Object.freeze(clone(crew)),
    resources: Object.freeze(provisioned),
    systems: Object.freeze(systems),
    calculation,
    readiness,
    strategicElapsedS: 0,
    progress: 0,
    pendingEvent: null,
    voyagePhase: 'departure',
    eventFlags: Object.freeze({}),
    operationFlags: Object.freeze({}),
    routeContacts: Object.freeze([]),
    discoveries: Object.freeze([]),
    log: Object.freeze([{ atMissionS: 0, kind: 'planned', message: `Expedition planned for ${destinationId}.` }]),
    failureChain: Object.freeze([])
  });
}

function withExpeditionChanges(expedition, changes) {
  return Object.freeze({ ...expedition, ...changes, updatedAtMs: Number(changes.updatedAtMs) || Date.now() });
}

export {
  assessExpeditionReadiness,
  createExpeditionPlan,
  crewRoleCoverage,
  EXPEDITION_SCHEMA_VERSION,
  recommendedResources,
  RESOURCE_KEYS,
  totalCargoMass,
  withExpeditionChanges
};
