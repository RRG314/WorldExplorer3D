const MPH_PER_MPS = 2.2369362921;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vector(input = {}) {
  return { x: finite(input.x), z: finite(input.z) };
}

function normalized(input = {}, fallback = { x: 0, z: 1 }) {
  const value = vector(input);
  const length = Math.hypot(value.x, value.z);
  if (length <= .000001) return normalized(fallback, { x: 0, z: 1 });
  return { x: value.x / length, z: value.z / length };
}

function classifyCrash(energyJoules, closingMps) {
  const speedMph = Math.max(0, finite(closingMps)) * MPH_PER_MPS;
  const energy = Math.max(0, finite(energyJoules));
  if (speedMph < 3 || energy < 900) return 'contact';
  if (energy < 12000) return 'minor';
  if (energy < 52000) return 'major';
  return 'severe';
}

function resolveCrashImpact(options = {}) {
  const moverMassKg = Math.max(40, finite(options.moverMassKg, 1520));
  const targetMassKg = Math.max(40, finite(options.targetMassKg, 1520));
  const moverVelocity = vector(options.moverVelocity);
  const targetVelocity = vector(options.targetVelocity);
  const normal = normalized(options.normal, moverVelocity);
  const tangent = { x: -normal.z, z: normal.x };
  const relative = {
    x: moverVelocity.x - targetVelocity.x,
    z: moverVelocity.z - targetVelocity.z
  };
  const closingMps = relative.x * normal.x + relative.z * normal.z;
  if (closingMps <= .01) {
    return Object.freeze({ applied: false, severity: 'contact', closingMps: 0, energyJoules: 0 });
  }

  const targetKind = String(options.targetKind || 'vehicle');
  const restitution = Math.max(0, Math.min(.35, finite(options.restitution, targetKind.includes('npc') ? .04 : .16)));
  const inverseMass = 1 / moverMassKg + 1 / targetMassKg;
  const normalImpulse = (1 + restitution) * closingMps / inverseMass;
  const relativeTangent = relative.x * tangent.x + relative.z * tangent.z;
  const desiredFrictionImpulse = relativeTangent / inverseMass;
  const frictionLimit = normalImpulse * Math.max(.05, Math.min(.8, finite(options.friction, .42)));
  const frictionImpulse = Math.max(-frictionLimit, Math.min(frictionLimit, desiredFrictionImpulse));
  const impulse = {
    x: normal.x * normalImpulse + tangent.x * frictionImpulse,
    z: normal.z * normalImpulse + tangent.z * frictionImpulse
  };
  const moverAfter = {
    x: moverVelocity.x - impulse.x / moverMassKg,
    z: moverVelocity.z - impulse.z / moverMassKg
  };
  const targetAfterRaw = {
    x: targetVelocity.x + impulse.x / targetMassKg,
    z: targetVelocity.z + impulse.z / targetMassKg
  };
  const targetCap = targetKind.includes('npc') ? 18 : 28;
  const targetSpeed = Math.hypot(targetAfterRaw.x, targetAfterRaw.z);
  const targetScale = targetSpeed > targetCap ? targetCap / targetSpeed : 1;
  const targetAfter = { x: targetAfterRaw.x * targetScale, z: targetAfterRaw.z * targetScale };
  const reducedMass = 1 / inverseMass;
  const energyJoules = .5 * reducedMass * closingMps * closingMps;
  let severity = classifyCrash(energyJoules, closingMps);
  if (targetKind.includes('npc')) {
    const closingMph = closingMps * MPH_PER_MPS;
    severity = closingMph >= 45 ? 'severe' : closingMph >= 22 ? 'major' : closingMph >= 3 ? 'minor' : 'contact';
  }
  const glancing = Math.max(-1, Math.min(1, relativeTangent / Math.max(.1, Math.hypot(relative.x, relative.z))));
  const energyRoot = Math.sqrt(energyJoules);

  return Object.freeze({
    applied: true,
    severity,
    closingMps,
    closingMph: closingMps * MPH_PER_MPS,
    energyJoules,
    normalImpulse,
    moverVelocity: Object.freeze(moverAfter),
    targetVelocity: Object.freeze(targetAfter),
    moverYawImpulse: Math.max(-.72, Math.min(.72, -glancing * closingMps * .045)),
    targetYawImpulse: Math.max(-1.4, Math.min(1.4, glancing * closingMps * .085)),
    moverDamageForce: severity === 'contact' ? 0 : Math.min(105, energyRoot * .18),
    targetDamageForce: severity === 'contact'
      ? 0
      : Math.min(150, energyRoot * (targetKind.includes('npc') ? 1.08 : .34)),
    knockdownSeconds: targetKind.includes('npc') && severity !== 'contact'
      ? Math.min(8, 1.4 + closingMps * .28)
      : 0
  });
}

function dampCrashMotion(body = {}, dt = 0, options = {}) {
  const step = Math.max(0, Math.min(.1, finite(dt)));
  const drag = Math.max(.1, finite(options.drag, options.kind === 'npc' ? 4.8 : 2.15));
  const angularDrag = Math.max(.1, finite(options.angularDrag, 3.1));
  const factor = Math.exp(-drag * step);
  const angularFactor = Math.exp(-angularDrag * step);
  return Object.freeze({
    velocityX: finite(body.velocityX) * factor,
    velocityZ: finite(body.velocityZ) * factor,
    angularVelocity: finite(body.angularVelocity) * angularFactor
  });
}

export { classifyCrash, dampCrashMotion, resolveCrashImpact };
