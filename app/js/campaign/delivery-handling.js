// Personal driving distinction, never money or competitive proof. Samples come
// from the same live actor/road query that admits delivery progress.
export const DELIVERY_HANDLING_LIMITS = Object.freeze({ speed: 14, braking: 6, lateral: 5 });

export function validHandling(value) {
  return !!value && typeof value.complete === 'boolean'
    && ['distance', 'seconds', 'maxSpeed', 'hardBrakes', 'roadDepartures', 'sharpTurns'].every(key =>
      Number.isFinite(value[key]) && value[key] >= 0 && value[key] < 1e7);
}

export function createDeliveryHandling(saved = null) {
  let previous = null;
  let value = validHandling(saved) ? { ...saved, complete: false } : {
    distance: 0, seconds: 0, maxSpeed: 0, hardBrakes: 0, roadDepartures: 0, sharpTurns: 0, complete: true
  };
  let wasOffRoad = false, wasBraking = false, wasTurning = false;
  return {
    sample(pose, seconds, distance) {
      if (!pose || !Number.isFinite(seconds) || seconds <= 0 || seconds > .8
          || !Number.isFinite(distance) || distance < 0 || distance > 65 * seconds + 2
          || !Number.isFinite(pose.speed) || pose.mode !== 'drive') {
        value.complete = false; previous = null; return;
      }
      const speed = Math.abs(pose.speed);
      if (previous) {
        if (distance > Math.max(speed, Math.abs(previous.speed)) * seconds + 1) value.complete = false;
        const braking = (Math.abs(previous.speed) - speed) / seconds > DELIVERY_HANDLING_LIMITS.braking;
        const angle = Number.isFinite(pose.yaw) && Number.isFinite(previous.yaw)
          ? Math.abs(Math.atan2(Math.sin(pose.yaw - previous.yaw), Math.cos(pose.yaw - previous.yaw))) : 0;
        const turning = angle / seconds * speed > DELIVERY_HANDLING_LIMITS.lateral;
        if (braking && !wasBraking) value.hardBrakes++;
        if (turning && !wasTurning) value.sharpTurns++;
        wasBraking = braking; wasTurning = turning;
        value.distance += distance; value.seconds += seconds;
      }
      const offRoad = pose.road !== true;
      if (offRoad && !wasOffRoad) value.roadDepartures++;
      wasOffRoad = offRoad;
      value.maxSpeed = Math.max(value.maxSpeed, speed);
      previous = { speed: pose.speed, yaw: pose.yaw };
    },
    interrupt() { previous = null; value.complete = false; },
    snapshot() { return { ...value }; }
  };
}

export function deliveryDistinction(handling, routeDistance) {
  return validHandling(handling) && handling.complete && handling.distance >= routeDistance * .85
    && handling.seconds >= routeDistance / DELIVERY_HANDLING_LIMITS.speed * .85
    && handling.maxSpeed <= DELIVERY_HANDLING_LIMITS.speed && handling.hardBrakes === 0
    && handling.roadDepartures === 0 && handling.sharpTurns === 0 ? 'steady-cargo' : null;
}
