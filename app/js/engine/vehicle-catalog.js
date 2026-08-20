// One authoritative, meter-based vehicle catalog for traffic, parked,
// enterable, and responder presentation. Dimensions retain the existing
// real-world scale; renderers must fit their geometry inside this envelope.
const VEHICLE_ROOT_TO_GROUND_METERS = 1.12;

const VEHICLE_CATALOG = Object.freeze([
  Object.freeze({ id: 'compact', label: 'Compact hatchback', bodyStyle: 'compact', width: 1.65, height: 1.42, length: 3.65, cabinScale: 0.48, wheelRadius: .34, speedFactor: 1.04, acceleration: 2.8, turningRadius: 4.6, weight: 18, color: 0x8a3f45, parkedEligible: true }),
  Object.freeze({ id: 'sedan', label: 'Four-door sedan', bodyStyle: 'sedan', width: 1.78, height: 1.45, length: 4.45, cabinScale: 0.5, wheelRadius: .36, speedFactor: 1, acceleration: 2.5, turningRadius: 5.2, weight: 22, color: 0x315f79, parkedEligible: true }),
  Object.freeze({ id: 'suv', label: 'Trail SUV', bodyStyle: 'suv', width: 1.9, height: 1.72, length: 4.65, cabinScale: 0.54, wheelRadius: .41, speedFactor: 0.94, acceleration: 2.2, turningRadius: 5.6, weight: 15, color: 0x7a5141, parkedEligible: true }),
  Object.freeze({ id: 'pickup', label: 'Utility pickup', bodyStyle: 'pickup', width: 1.92, height: 1.68, length: 5.05, cabinScale: 0.42, wheelRadius: .42, speedFactor: 0.92, acceleration: 2.1, turningRadius: 5.9, weight: 10, color: 0x596a48, parkedEligible: true }),
  Object.freeze({ id: 'van', label: 'Passenger van', bodyStyle: 'van', width: 1.95, height: 2.12, length: 5.15, cabinScale: 0.68, wheelRadius: .4, speedFactor: 0.86, acceleration: 1.8, turningRadius: 6.2, weight: 10, color: 0x52697a, parkedEligible: true }),
  Object.freeze({ id: 'delivery_van', label: 'Delivery van', bodyStyle: 'van', width: 2.02, height: 2.35, length: 5.5, cabinScale: 0.62, wheelRadius: .42, speedFactor: 0.82, acceleration: 1.7, turningRadius: 6.5, weight: 8, color: 0xc8c7bd, parkedEligible: true }),
  Object.freeze({ id: 'taxi', label: 'City taxi', bodyStyle: 'taxi', width: 1.78, height: 1.5, length: 4.5, cabinScale: 0.5, wheelRadius: .36, speedFactor: 1, acceleration: 2.4, turningRadius: 5.2, weight: 7, color: 0xd4b82d, parkedEligible: true }),
  Object.freeze({ id: 'box_truck', label: 'Local box truck', bodyStyle: 'box-truck', width: 2.25, height: 2.85, length: 6.8, cabinScale: 0.7, wheelRadius: .48, speedFactor: 0.72, acceleration: 1.25, turningRadius: 8.2, weight: 5, color: 0xaeb9bd, parkedEligible: false }),
  Object.freeze({ id: 'city_bus', label: 'City bus', bodyStyle: 'bus', width: 2.45, height: 3.05, length: 10.4, cabinScale: 0.76, wheelRadius: .52, speedFactor: 0.64, acceleration: 1.05, turningRadius: 10.5, weight: 3, color: 0x3f6685, parkedEligible: false, majorRoadOnly: true })
]);

const VEHICLE_BY_ID = Object.freeze(Object.fromEntries(VEHICLE_CATALOG.map((entry) => [entry.id, entry])));
const PARKED_VEHICLE_CATALOG = Object.freeze(VEHICLE_CATALOG.filter((entry) => entry.parkedEligible === true));

function vehicleDefinitionById(id, fallbackId = 'sedan') {
  return VEHICLE_BY_ID[String(id || '')] || VEHICLE_BY_ID[fallbackId] || VEHICLE_CATALOG[0];
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
  vehicleDefinitionById
};
