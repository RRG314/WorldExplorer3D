function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value)));
}

function stableUnit(value = '') {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function axisDelta(a, b) {
  const difference = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  return Math.min(difference, Math.abs(Math.PI - difference));
}

function projectControlToEdge(control, edge) {
  const dx = finite(edge?.p2?.x) - finite(edge?.p1?.x);
  const dz = finite(edge?.p2?.z) - finite(edge?.p1?.z);
  const lengthSquared = dx * dx + dz * dz;
  if (!(lengthSquared > .01)) return null;
  const t = clamp(
    ((finite(control.x) - finite(edge.p1.x)) * dx + (finite(control.z) - finite(edge.p1.z)) * dz) / lengthSquared,
    0,
    1
  );
  const x = finite(edge.p1.x) + dx * t;
  const z = finite(edge.p1.z) + dz * t;
  return {
    t,
    distance: Math.hypot(x - finite(control.x), z - finite(control.z)),
    stopProgress: Math.max(0, finite(edge.length, Math.sqrt(lengthSquared)) * t)
  };
}

function signalAspect(controller, group, elapsedSeconds) {
  if (controller.kind === 'stop_sign') return 'stop';
  const phase = (Math.max(0, finite(elapsedSeconds)) + controller.offsetSeconds) % 34;
  if (group === 0) {
    if (phase < 12) return 'green';
    if (phase < 14) return 'amber';
    return 'red';
  }
  if (phase >= 16 && phase < 28) return 'green';
  if (phase >= 28 && phase < 30) return 'amber';
  return 'red';
}

function compileTrafficControlSystem(options = {}) {
  const graph = options.graph || {};
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const controls = (Array.isArray(options.controls) ? options.controls : [])
    .filter((control) => (
      (control?.kind === 'traffic_signal' || control?.kind === 'stop_sign') &&
      Number.isFinite(Number(control.x)) && Number.isFinite(Number(control.z))
    ));
  const controllers = [];
  const approachByEdge = new Map();

  controls.forEach((control, controlIndex) => {
    const approaches = edges.map((edge, edgeIndex) => {
      const projection = projectControlToEdge(control, edge);
      if (!projection || projection.distance > 8 || projection.stopProgress < 3 || edge?.structure?.terrainMode === 'subgrade') return null;
      const heading = Math.atan2(finite(edge.p2.x) - finite(edge.p1.x), finite(edge.p2.z) - finite(edge.p1.z));
      return { edgeIndex, distance: projection.distance, heading, stopProgress: projection.stopProgress };
    }).filter(Boolean).sort((left, right) => left.distance - right.distance).slice(0, 8);
    const minimumApproaches = control.kind === 'traffic_signal' ? 2 : 1;
    if (approaches.length < minimumApproaches) return;
    const referenceHeading = approaches[0].heading;
    const record = {
      id: String(control.id || `traffic-control:${controlIndex}`),
      kind: String(control.kind),
      x: finite(control.x),
      z: finite(control.z),
      provenance: String(control.provenance || 'inferred'),
      offsetSeconds: stableUnit(control.id || `${control.x}:${control.z}`) * 8,
      approaches: approaches.map((approach) => ({
        ...approach,
        group: axisDelta(approach.heading, referenceHeading) <= Math.PI * .25 ? 0 : 1
      }))
    };
    controllers.push(Object.freeze({ ...record, approaches: Object.freeze(record.approaches.map(Object.freeze)) }));
    record.approaches.forEach((approach) => {
      const existing = approachByEdge.get(approach.edgeIndex);
      if (!existing || approach.distance < existing.approach.distance) {
        approachByEdge.set(approach.edgeIndex, { controller: record, approach });
      }
    });
  });

  function directive(edgeIndex, progress, speed, elapsedSeconds) {
    const assigned = approachByEdge.get(Number(edgeIndex));
    if (!assigned) return Object.freeze({ controlled: false, speedScale: 1, aspect: 'none', mustStop: false });
    const edge = edges[edgeIndex];
    const remainingRaw = finite(assigned.approach.stopProgress, finite(edge?.length)) - finite(progress);
    if (remainingRaw < -4) return Object.freeze({ controlled: false, speedScale: 1, aspect: 'none', mustStop: false });
    const remaining = Math.max(0, remainingRaw);
    const aspect = signalAspect(assigned.controller, assigned.approach.group, elapsedSeconds);
    const speedValue = Math.max(0, finite(speed));
    const stoppingDistance = clamp(5 + speedValue * 1.35, 8, 32);
    if (assigned.controller.kind === 'stop_sign') {
      const speedScale = remaining <= stoppingDistance
        ? clamp((remaining - 2.8) / Math.max(1, stoppingDistance - 2.8), 0, 1)
        : 1;
      return Object.freeze({
        controlled: true,
        controllerId: assigned.controller.id,
        kind: assigned.controller.kind,
        group: assigned.approach.group,
        aspect: 'stop',
        remaining,
        stoppingDistance,
        mustStop: true,
        speedScale
      });
    }
    const unsafeToStopForAmber = aspect === 'amber' && remaining < Math.max(5.5, speedValue * .72);
    const mustStop = aspect === 'red' || aspect === 'amber' && !unsafeToStopForAmber;
    const speedScale = mustStop && remaining <= stoppingDistance
      ? clamp((remaining - 2.8) / Math.max(1, stoppingDistance - 2.8), 0, 1)
      : 1;
    return Object.freeze({
      controlled: true,
      controllerId: assigned.controller.id,
      kind: assigned.controller.kind,
      group: assigned.approach.group,
      aspect,
      remaining,
      stoppingDistance,
      mustStop,
      speedScale
    });
  }

  function states(elapsedSeconds) {
    return Object.freeze(controllers.map((controller) => Object.freeze({
      id: controller.id,
      kind: controller.kind,
      x: controller.x,
      z: controller.z,
      group0: signalAspect(controller, 0, elapsedSeconds),
      group1: signalAspect(controller, 1, elapsedSeconds)
    })));
  }

  return Object.freeze({
    controllers: Object.freeze(controllers),
    controlledApproaches: approachByEdge.size,
    directive,
    states
  });
}

export { compileTrafficControlSystem, signalAspect };
