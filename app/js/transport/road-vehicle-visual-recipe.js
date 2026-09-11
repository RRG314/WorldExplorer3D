import { VEHICLE_ROOT_TO_GROUND_METERS, vehicleWheelContactLayout } from '../engine/vehicle-catalog.js?v=6';

function roadVehicleVisualRecipe(variant = {}) {
  const width = Math.max(.8, Number(variant.width) || 1.8);
  const height = Math.max(.8, Number(variant.height) || 1.48);
  const length = Math.max(1.8, Number(variant.length) || 4.4);
  const wheelRadius = Math.max(.2, Number(variant.wheelRadius) || .36);
  const style = String(variant.bodyStyle || variant.id || 'sedan');
  const flags = Object.freeze({
    compact: style === 'compact',
    pickup: style === 'pickup',
    crossover: style === 'crossover' || style === 'suv',
    van: style === 'van',
    taxi: style === 'taxi',
    boxTruck: style === 'box-truck',
    bus: style === 'bus'
  });
  const bodyBottom = wheelRadius * .42;
  const bodyTop = Math.min(
    height * (flags.bus ? .34 : flags.boxTruck ? .33 : flags.van ? .42 : flags.crossover || flags.pickup ? .46 : .5),
    height - .42
  );
  const bodyHeight = Math.max(.42, bodyTop - bodyBottom);
  const cabinLength = flags.bus ? length * .9
    : flags.boxTruck ? length * .27
      : flags.van ? length * .7
        : flags.pickup ? length * .38
          : flags.compact ? length * .49 : length * .5;
  const cabinZ = flags.bus ? 0
    : flags.boxTruck ? length * .34
      : flags.van ? length * .02
        : flags.pickup ? length * .18 : -length * .08;
  const cabinBottom = bodyTop - .08;
  const cabinHeight = Math.max(.32, height - cabinBottom - .055);
  return Object.freeze({
    id: String(variant.id || 'sedan'),
    style,
    flags,
    width,
    height,
    length,
    wheelRadius,
    wheelLayout: vehicleWheelContactLayout(variant),
    rootToGround: VEHICLE_ROOT_TO_GROUND_METERS,
    roofY: height,
    bodyBottom,
    bodyTop,
    bodyHeight,
    bodyY: bodyBottom + bodyHeight * .5,
    cabinLength,
    cabinZ,
    cabinBottom,
    cabinHeight,
    cabinY: cabinBottom + cabinHeight * .5
  });
}

export { roadVehicleVisualRecipe };
