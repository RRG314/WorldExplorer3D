const NPC_VEHICLE_CATALOG = Object.freeze([
  Object.freeze({ id: 'compact', label: 'Compact hatchback', bodyStyle: 'compact', width: 1.65, height: 1.42, length: 3.65, cabinScale: 0.48, wheelRadius: .34, speedFactor: 1.04, acceleration: 2.8, turningRadius: 4.6, weight: 18 }),
  Object.freeze({ id: 'sedan', label: 'Four-door sedan', bodyStyle: 'sedan', width: 1.78, height: 1.45, length: 4.45, cabinScale: 0.5, wheelRadius: .36, speedFactor: 1, acceleration: 2.5, turningRadius: 5.2, weight: 22 }),
  Object.freeze({ id: 'suv', label: 'Trail SUV', bodyStyle: 'suv', width: 1.9, height: 1.72, length: 4.65, cabinScale: 0.54, wheelRadius: .41, speedFactor: 0.94, acceleration: 2.2, turningRadius: 5.6, weight: 15 }),
  Object.freeze({ id: 'pickup', label: 'Utility pickup', bodyStyle: 'pickup', width: 1.92, height: 1.68, length: 5.05, cabinScale: 0.42, wheelRadius: .42, speedFactor: 0.92, acceleration: 2.1, turningRadius: 5.9, weight: 10 }),
  Object.freeze({ id: 'van', label: 'Passenger van', bodyStyle: 'van', width: 1.95, height: 2.12, length: 5.15, cabinScale: 0.68, wheelRadius: .4, speedFactor: 0.86, acceleration: 1.8, turningRadius: 6.2, weight: 10 }),
  Object.freeze({ id: 'delivery_van', label: 'Delivery van', bodyStyle: 'van', width: 2.02, height: 2.35, length: 5.5, cabinScale: 0.62, wheelRadius: .42, speedFactor: 0.82, acceleration: 1.7, turningRadius: 6.5, weight: 8 }),
  Object.freeze({ id: 'taxi', label: 'City taxi', bodyStyle: 'taxi', width: 1.78, height: 1.5, length: 4.5, cabinScale: 0.5, wheelRadius: .36, speedFactor: 1, acceleration: 2.4, turningRadius: 5.2, weight: 7 }),
  Object.freeze({ id: 'box_truck', label: 'Local box truck', bodyStyle: 'box-truck', width: 2.25, height: 2.85, length: 6.8, cabinScale: 0.7, wheelRadius: .48, speedFactor: 0.72, acceleration: 1.25, turningRadius: 8.2, weight: 5 }),
  Object.freeze({ id: 'city_bus', label: 'City bus', bodyStyle: 'bus', width: 2.45, height: 3.05, length: 10.4, cabinScale: 0.76, wheelRadius: .52, speedFactor: 0.64, acceleration: 1.05, turningRadius: 10.5, weight: 3, majorRoadOnly: true })
]);

export function selectNpcVehicleVariant(random, options = {}) {
  const source = NPC_VEHICLE_CATALOG.filter((entry) => !entry.majorRoadOnly || options.majorRoad === true);
  const total = source.reduce((sum, entry) => sum + entry.weight, 0);
  let target = Math.max(0, Math.min(0.999999, Number(random?.()) || 0)) * total;
  for (const entry of source) {
    target -= entry.weight;
    if (target <= 0) return entry;
  }
  return source[0];
}

export { NPC_VEHICLE_CATALOG };
