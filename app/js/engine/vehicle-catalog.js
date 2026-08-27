// One authoritative, meter-based vehicle catalog for traffic, parked,
// enterable, and responder presentation. Dimensions retain the existing
// real-world scale; renderers must fit their geometry inside this envelope.
const VEHICLE_ROOT_TO_GROUND_METERS = 1.12;

const VEHICLE_CATALOG = Object.freeze([
  Object.freeze({ id: 'compact', label: 'Compact hatchback', bodyStyle: 'compact', handlingLabel: 'Nimble', width: 1.65, height: 1.42, length: 3.65, cabinScale: 0.48, wheelRadius: .34, speedFactor: 1.04, acceleration: 2.8, turningRadius: 4.6, accelerationScale: 1.13, steeringScale: 1.14, gripScale: .98, brakeScale: 1.04, topSpeedMph: 120, weight: 18, color: 0x8a3f45, parkedEligible: true }),
  Object.freeze({ id: 'sedan', label: 'Four-door sedan', bodyStyle: 'sedan', handlingLabel: 'Balanced', width: 1.78, height: 1.45, length: 4.45, cabinScale: 0.5, wheelRadius: .36, speedFactor: 1, acceleration: 2.5, turningRadius: 5.2, accelerationScale: 1, steeringScale: 1, gripScale: 1, brakeScale: 1, topSpeedMph: 120, weight: 22, color: 0x315f79, parkedEligible: true }),
  Object.freeze({ id: 'suv', label: 'Trail SUV', bodyStyle: 'suv', handlingLabel: 'Planted', width: 1.9, height: 1.72, length: 4.65, cabinScale: 0.54, wheelRadius: .41, speedFactor: 0.94, acceleration: 2.2, turningRadius: 5.6, accelerationScale: .96, steeringScale: .92, gripScale: 1.1, brakeScale: 1.08, topSpeedMph: 120, weight: 15, color: 0x7a5141, parkedEligible: true }),
  Object.freeze({ id: 'pickup', label: 'Utility pickup', bodyStyle: 'pickup', handlingLabel: 'Torque-heavy', width: 1.92, height: 1.68, length: 5.05, cabinScale: 0.42, wheelRadius: .42, speedFactor: 0.92, acceleration: 2.1, turningRadius: 5.9, accelerationScale: 1.02, steeringScale: .87, gripScale: .96, brakeScale: .95, topSpeedMph: 120, weight: 10, color: 0x596a48, parkedEligible: true }),
  Object.freeze({ id: 'van', label: 'Passenger van', bodyStyle: 'van', handlingLabel: 'Steady', width: 1.95, height: 2.12, length: 5.15, cabinScale: 0.68, wheelRadius: .4, speedFactor: 0.86, acceleration: 1.8, turningRadius: 6.2, accelerationScale: .86, steeringScale: .82, gripScale: 1.04, brakeScale: .93, topSpeedMph: 112, weight: 10, color: 0x52697a, parkedEligible: true }),
  Object.freeze({ id: 'delivery_van', label: 'Delivery van', bodyStyle: 'van', handlingLabel: 'Cargo-weighted', width: 2.02, height: 2.35, length: 5.5, cabinScale: 0.62, wheelRadius: .42, speedFactor: 0.82, acceleration: 1.7, turningRadius: 6.5, accelerationScale: .8, steeringScale: .77, gripScale: .98, brakeScale: .9, topSpeedMph: 108, weight: 8, color: 0xc8c7bd, parkedEligible: true }),
  Object.freeze({ id: 'taxi', label: 'City taxi', bodyStyle: 'taxi', handlingLabel: 'City-responsive', width: 1.78, height: 1.5, length: 4.5, cabinScale: 0.5, wheelRadius: .36, speedFactor: 1, acceleration: 2.4, turningRadius: 5.2, accelerationScale: 1.08, steeringScale: 1.07, gripScale: .98, brakeScale: 1.03, topSpeedMph: 120, weight: 7, color: 0xd4b82d, parkedEligible: true }),
  Object.freeze({ id: 'box_truck', label: 'Local box truck', bodyStyle: 'box-truck', handlingLabel: 'Heavy', width: 2.25, height: 2.85, length: 6.8, cabinScale: 0.7, wheelRadius: .48, speedFactor: 0.72, acceleration: 1.25, turningRadius: 8.2, accelerationScale: .64, steeringScale: .61, gripScale: .92, brakeScale: .84, topSpeedMph: 94, weight: 5, color: 0xaeb9bd, parkedEligible: false }),
  Object.freeze({ id: 'city_bus', label: 'City bus', bodyStyle: 'bus', handlingLabel: 'Transit-heavy', width: 2.45, height: 3.05, length: 10.4, cabinScale: 0.76, wheelRadius: .52, speedFactor: 0.64, acceleration: 1.05, turningRadius: 10.5, accelerationScale: .52, steeringScale: .48, gripScale: .9, brakeScale: .8, topSpeedMph: 82, weight: 3, color: 0x3f6685, parkedEligible: false, majorRoadOnly: true })
]);

const VEHICLE_BY_ID = Object.freeze(Object.fromEntries(VEHICLE_CATALOG.map((entry) => [entry.id, entry])));
const PARKED_VEHICLE_CATALOG = Object.freeze(VEHICLE_CATALOG.filter((entry) => entry.parkedEligible === true));

function vehicleDefinitionById(id, fallbackId = 'sedan') {
  return VEHICLE_BY_ID[String(id || '')] || VEHICLE_BY_ID[fallbackId] || VEHICLE_CATALOG[0];
}

function vehicleHandlingProfile(variantOrId = 'sedan', options = {}) {
  const variant = typeof variantOrId === 'string'
    ? vehicleDefinitionById(variantOrId)
    : variantOrId || vehicleDefinitionById('sedan');
  const responder = String(options.serviceType || '') === 'responder';
  return Object.freeze({
    id: responder ? `response-${variant.id}` : variant.id,
    label: responder ? 'Response-tuned' : String(variant.handlingLabel || 'Balanced'),
    topSpeedMph: responder ? 120 : Math.max(40, Math.min(120, Number(variant.topSpeedMph) || 120)),
    accelerationScale: Math.max(.35, Number(variant.accelerationScale) || 1) * (responder ? 1.18 : 1),
    steeringScale: Math.max(.35, Number(variant.steeringScale) || 1) * (responder ? 1.1 : 1),
    gripScale: Math.max(.55, Number(variant.gripScale) || 1) * (responder ? 1.06 : 1),
    brakeScale: Math.max(.45, Number(variant.brakeScale) || 1) * (responder ? 1.08 : 1),
    massKg: vehicleMassKg(variant) + (responder ? 140 : 0),
    wheelBase: Math.max(1.9, Math.min(4.8, Number(variant.length || 4.45) * .58)),
    turningRadius: Math.max(3.8, Number(variant.turningRadius) || 5.2)
  });
}

function vehicleMassKg(variantOrId = 'sedan') {
  const variant = typeof variantOrId === 'string'
    ? vehicleDefinitionById(variantOrId)
    : variantOrId || vehicleDefinitionById('sedan');
  const style = String(variant.bodyStyle || variant.id || 'sedan');
  const masses = {
    compact: 1240,
    sedan: 1520,
    suv: 1980,
    pickup: 2240,
    van: 2350,
    taxi: 1640,
    'box-truck': 5200,
    bus: 11800
  };
  return masses[style] || (style.includes('van') ? 2480 : 1520);
}

function vehicleConditionDynamics(condition = 1) {
  const normalized = Math.max(0, Math.min(1, Number(condition) || 0));
  return Object.freeze({
    operable: normalized > .05,
    topSpeedScale: .5 + normalized * .5,
    accelerationScale: .3 + normalized * .7,
    steeringScale: .72 + normalized * .28,
    gripScale: .78 + normalized * .22,
    brakeScale: .65 + normalized * .35
  });
}

// Rendered wheels and road-contact sampling must use the same physical layout.
// Keeping axle placement in individual LOD renderers previously let a vehicle
// pass an attitude check even when the visible wheels sampled different parts
// of a curved road surface.
function vehicleWheelContactLayout(variant = {}) {
  const width = Math.max(0.8, Number(variant.width) || 1.8);
  const length = Math.max(1.8, Number(variant.length) || 4.4);
  const style = String(variant.bodyStyle || variant.id || 'sedan');
  const axleFactor = style === 'bus' ? 0.37 : style === 'box-truck' ? 0.35 : style === 'compact' ? 0.3 : 0.32;
  return Object.freeze({
    halfTrack: width * 0.43,
    halfWheelbase: length * axleFactor,
    wheelRadius: Math.max(0.2, Number(variant.wheelRadius) || 0.36)
  });
}

function selectVehicleVariant(random, options = {}) {
  const source = VEHICLE_CATALOG.filter((entry) => !entry.majorRoadOnly || options.majorRoad === true);
  const total = source.reduce((sum, entry) => sum + entry.weight, 0);
  let target = Math.max(0, Math.min(.999999, Number(random?.()) || 0)) * total;
  for (const entry of source) {
    target -= entry.weight;
    if (target <= 0) return entry;
  }
  return source[0];
}

export {
  PARKED_VEHICLE_CATALOG,
  VEHICLE_BY_ID,
  VEHICLE_CATALOG,
  VEHICLE_ROOT_TO_GROUND_METERS,
  selectVehicleVariant,
  vehicleDefinitionById,
  vehicleConditionDynamics,
  vehicleHandlingProfile,
  vehicleMassKg,
  vehicleWheelContactLayout
};
