import { smoothstep01 } from '../../structure-semantics/geometry.js?v=1';

const TRANSPORT_SURFACE_SCHEMA_VERSION = 1;
const DEFAULT_SURFACE_BIAS = 0.08;
const DEFAULT_SAMPLE_STEP = 2;
const DEFAULT_MAX_GRADE = 0.12;
const DEFAULT_MAX_AT_GRADE_CUT = 4;
const DEFAULT_MAX_AT_GRADE_FILL = 4;
const DEFAULT_VERTICAL_FIT_RADIUS = 14;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function pointAtDistance(points, pathDistances, distance) {
  const total = finiteNumber(pathDistances[pathDistances.length - 1]);
  const target = clamp(finiteNumber(distance), 0, total);
  let segmentIndex = 0;
  while (
    segmentIndex < pathDistances.length - 2 &&
    finiteNumber(pathDistances[segmentIndex + 1]) < target
  ) {
    segmentIndex += 1;
  }
  const start = points[segmentIndex];
  const end = points[Math.min(points.length - 1, segmentIndex + 1)];
  const segmentStart = finiteNumber(pathDistances[segmentIndex]);
  const segmentEnd = finiteNumber(pathDistances[Math.min(pathDistances.length - 1, segmentIndex + 1)]);
  const segmentLength = Math.max(1e-6, segmentEnd - segmentStart);
  const t = clamp((target - segmentStart) / segmentLength, 0, 1);
  return {
    x: start.x + (end.x - start.x) * t,
    z: start.z + (end.z - start.z) * t,
    segmentIndex,
    t
  };
}

function tangentAtDistance(points, pathDistances, distance) {
  const point = pointAtDistance(points, pathDistances, distance);
  const start = points[point.segmentIndex];
  const end = points[Math.min(points.length - 1, point.segmentIndex + 1)];
  const length = Math.hypot(end.x - start.x, end.z - start.z) || 1;
  return {
    x: (end.x - start.x) / length,
    z: (end.z - start.z) / length
  };
}

function createSampleDistances(totalDistance, sampleStep) {
  const total = Math.max(0, finiteNumber(totalDistance));
  const step = Math.max(0.5, finiteNumber(sampleStep, DEFAULT_SAMPLE_STEP));
  const segmentCount = Math.max(1, Math.ceil(total / step));
  const distances = new Float32Array(segmentCount + 1);
  for (let index = 0; index <= segmentCount; index += 1) {
    distances[index] = total * index / segmentCount;
  }
  return distances;
}

function normalizeAnchors(feature, semantics, totalDistance) {
  const total = Math.max(0, finiteNumber(totalDistance));
  const tunnelRoofCover = semantics?.structureKind === 'tunnel' || semantics?.isTunnel === true
    ? 0.4
    : 0;
  const defaultOffset =
    semantics?.terrainMode === 'subgrade'
      // cutDepth describes the usable interior envelope. Keep a physical
      // terrain cover above the compiled shell as well, otherwise the roof
      // sits on the terrain plane and flickers/exposes across hills.
      ? -Math.max(
          0,
          finiteNumber(semantics?.cutDepth) +
            tunnelRoofCover +
            finiteNumber(feature?.structureStackOffset)
        )
      : semantics?.terrainMode === 'elevated'
        ? Math.max(
            0,
            finiteNumber(semantics?.deckClearance, semantics?.explicitBaseOffset) +
              finiteNumber(feature?.structureStackOffset)
          )
        : 0;
  const anchors = [
    { distance: 0, offset: defaultOffset, priority: 0 },
    { distance: total, offset: defaultOffset, priority: 0 }
  ];

  const transitionAnchors = Array.isArray(feature?.structureTransitionAnchors)
    ? feature.structureTransitionAnchors
    : [];
  for (const anchor of transitionAnchors) {
    const offset = Number(anchor?.targetOffset);
    if (!Number.isFinite(offset)) continue;
    anchors.push({
      distance: clamp(finiteNumber(anchor?.distance), 0, total),
      offset,
      priority: anchor?.source === 'transport_graph_node' ? 3 : 2
    });
  }

  const stations = Array.isArray(feature?.structureStations)
    ? feature.structureStations
    : [];
  for (const station of stations) {
    const magnitude = Number(station?.targetOffset);
    if (!Number.isFinite(magnitude)) continue;
    anchors.push({
      distance: clamp(finiteNumber(station?.distance), 0, total),
      offset: semantics?.terrainMode === 'subgrade' ? -Math.abs(magnitude) : Math.abs(magnitude),
      priority: 1
    });
  }

  anchors.sort((left, right) => left.distance - right.distance);
  const merged = [];
  for (const anchor of anchors) {
    const previous = merged[merged.length - 1];
    if (previous && Math.abs(previous.distance - anchor.distance) < 0.25) {
      if (
        anchor.priority > previous.priority ||
        (
          anchor.priority === previous.priority &&
          Math.abs(anchor.offset) > Math.abs(previous.offset)
        )
      ) {
        previous.offset = anchor.offset;
        previous.priority = anchor.priority;
      }
    } else {
      merged.push({ ...anchor });
    }
  }
  return merged;
}

function sampleSmoothAnchors(anchors, distance) {
  if (!Array.isArray(anchors) || anchors.length === 0) return 0;
  if (anchors.length === 1 || distance <= anchors[0].distance) return anchors[0].offset;
  const last = anchors[anchors.length - 1];
  if (distance >= last.distance) return last.offset;
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const left = anchors[index];
    const right = anchors[index + 1];
    if (distance > right.distance) continue;
    const span = Math.max(1e-6, right.distance - left.distance);
    const t = smoothstep01((distance - left.distance) / span);
    return left.offset + (right.offset - left.offset) * t;
  }
  return last.offset;
}

function endpointTransitionGate(feature, distance, totalDistance) {
  const anchors = Array.isArray(feature?.structureTransitionAnchors)
    ? feature.structureTransitionAnchors
    : [];
  let gate = 1;
  for (const anchor of anchors) {
    const span = Math.max(1, finiteNumber(anchor?.span, 1));
    if (anchor?.endpoint === 'start') {
      gate = Math.min(gate, smoothstep01(clamp(distance / span, 0, 1)));
    } else if (anchor?.endpoint === 'end') {
      gate = Math.min(gate, smoothstep01(clamp((totalDistance - distance) / span, 0, 1)));
    }
  }
  return gate;
}

function applyStationInfluence(feature, semantics, distance, totalDistance, initialOffset) {
  let offset = initialOffset;
  const transitionGate = endpointTransitionGate(feature, distance, totalDistance);
  const stations = Array.isArray(feature?.structureStations) ? feature.structureStations : [];
  for (const station of stations) {
    const span = Math.max(1, finiteNumber(station?.span, 1));
    const delta = Math.abs(distance - finiteNumber(station?.distance));
    if (delta > span) continue;
    const weight = 1 - smoothstep01(delta / span);
    const magnitude = Math.abs(finiteNumber(station?.targetOffset)) * weight * transitionGate;
    const contribution = semantics?.terrainMode === 'subgrade' ? -magnitude : magnitude;
    offset = contribution >= 0
      ? Math.max(offset, contribution)
      : Math.min(offset, contribution);
  }
  return semantics?.terrainMode === 'at_grade' ? 0 : offset;
}

function applyEndpointTieIns(
  feature,
  heights,
  distances,
  endpointGroundStart,
  endpointGroundEnd,
  surfaceBias,
  maximumGrade
) {
  const anchors = Array.isArray(feature?.structureTransitionAnchors)
    ? feature.structureTransitionAnchors.filter((anchor) =>
        anchor?.endpoint === 'start' || anchor?.endpoint === 'end')
    : [];
  if (anchors.length === 0 || heights.length === 0) return heights;
  const total = finiteNumber(distances[distances.length - 1]);
  const grade = Math.max(0.01, finiteNumber(maximumGrade, DEFAULT_MAX_GRADE));
  const anchorByEndpoint = new Map(anchors.map((anchor) => [anchor.endpoint, anchor]));
  const desiredByEndpoint = new Map();
  if (anchorByEndpoint.has('start')) {
    desiredByEndpoint.set(
      'start',
      endpointGroundStart + finiteNumber(anchorByEndpoint.get('start').targetOffset) + surfaceBias
    );
  }
  if (anchorByEndpoint.has('end')) {
    desiredByEndpoint.set(
      'end',
      endpointGroundEnd + finiteNumber(anchorByEndpoint.get('end').targetOffset) + surfaceBias
    );
  }
  if (desiredByEndpoint.has('start') && desiredByEndpoint.has('end')) {
    const startAnchor = anchorByEndpoint.get('start');
    const endAnchor = anchorByEndpoint.get('end');
    const startDesired = desiredByEndpoint.get('start');
    const endDesired = desiredByEndpoint.get('end');
    const maximumDelta = grade * total;
    if (Math.abs(endDesired - startDesired) > maximumDelta) {
      const preserveStart =
        startAnchor?.source === 'open_structure_transition' ||
        endAnchor?.source !== 'open_structure_transition' &&
          Math.abs(finiteNumber(startAnchor?.targetOffset)) <= Math.abs(finiteNumber(endAnchor?.targetOffset));
      if (preserveStart) {
        desiredByEndpoint.set(
          'end',
          startDesired + clamp(endDesired - startDesired, -maximumDelta, maximumDelta)
        );
      } else {
        desiredByEndpoint.set(
          'start',
          endDesired + clamp(startDesired - endDesired, -maximumDelta, maximumDelta)
        );
      }
    }
  }
  const corrected = new Float64Array(heights);
  for (const anchor of anchors) {
    const atStart = anchor.endpoint === 'start';
    const endpointIndex = atStart ? 0 : corrected.length - 1;
    const desired = desiredByEndpoint.get(anchor.endpoint);
    const correction = desired - corrected[endpointIndex];
    const span = Math.max(1, Math.min(total, finiteNumber(anchor.span, total * 0.35)));
    for (let index = 0; index < corrected.length; index += 1) {
      const fromEndpoint = atStart ? distances[index] : total - distances[index];
      if (fromEndpoint > span) continue;
      const weight = 1 - smoothstep01(clamp(fromEndpoint / span, 0, 1));
      corrected[index] += correction * weight;
    }
  }
  const startDesired = desiredByEndpoint.get('start');
  const endDesired = desiredByEndpoint.get('end');
  for (let index = 0; index < corrected.length; index += 1) {
    let lower = Number.NEGATIVE_INFINITY;
    let upper = Number.POSITIVE_INFINITY;
    if (Number.isFinite(startDesired)) {
      lower = Math.max(lower, startDesired - grade * distances[index]);
      upper = Math.min(upper, startDesired + grade * distances[index]);
    }
    if (Number.isFinite(endDesired)) {
      const fromEnd = total - distances[index];
      lower = Math.max(lower, endDesired - grade * fromEnd);
      upper = Math.min(upper, endDesired + grade * fromEnd);
    }
    corrected[index] = clamp(corrected[index], lower, upper);
  }

  // Endpoint cones bound every sample relative to a portal, but they do not
  // bound adjacent samples relative to each other. Overlapping crossing
  // stations can therefore leave a short kink inside an otherwise valid
  // approach. Project the completed profile from both fixed endpoints so the
  // transition remains exact and every rendered/drivable segment observes
  // the same engineered grade limit.
  const lastIndex = corrected.length - 1;
  const hasFixedStart = Number.isFinite(startDesired);
  const hasFixedEnd = Number.isFinite(endDesired);
  for (let pass = 0; pass < 12; pass += 1) {
    if (hasFixedStart) corrected[0] = startDesired;
    if (hasFixedStart) {
      for (let index = 1; index < corrected.length; index += 1) {
        if (hasFixedEnd && index === lastIndex) continue;
        const run = Math.max(1e-6, distances[index] - distances[index - 1]);
        corrected[index] = clamp(
          corrected[index],
          corrected[index - 1] - grade * run,
          corrected[index - 1] + grade * run
        );
      }
    }
    if (hasFixedEnd) corrected[lastIndex] = endDesired;
    if (hasFixedEnd) {
      for (let index = lastIndex - 1; index >= 0; index -= 1) {
        if (hasFixedStart && index === 0) continue;
        const run = Math.max(1e-6, distances[index + 1] - distances[index]);
        corrected[index] = clamp(
          corrected[index],
          corrected[index + 1] - grade * run,
          corrected[index + 1] + grade * run
        );
      }
    }
  }
  if (hasFixedStart) corrected[0] = startDesired;
  if (hasFixedEnd) corrected[lastIndex] = endDesired;
  return new Float32Array(corrected);
}

function applyExactGraphNodeConstraints(feature, heights, distances) {
  const anchors = Array.isArray(feature?.structureTransitionAnchors)
    ? feature.structureTransitionAnchors.filter((anchor) =>
        anchor?.source === 'transport_graph_node' && Number.isFinite(Number(anchor?.targetSurfaceY)))
    : [];
  if (anchors.length === 0 || heights.length === 0) return heights;
  const corrected = new Float32Array(heights);
  for (const anchor of anchors) {
    const targetDistance = Math.max(0, finiteNumber(anchor.distance));
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    for (let index = 0; index < distances.length; index += 1) {
      const delta = Math.abs(finiteNumber(distances[index]) - targetDistance);
      if (delta < nearestDistance) {
        nearestDistance = delta;
        nearestIndex = index;
      }
    }
    corrected[nearestIndex] = Number(anchor.targetSurfaceY);
  }
  return corrected;
}

function reconcileExactGraphNodeConstraints(
  feature,
  heights,
  distances,
  lowerBounds,
  maximumGrade
) {
  const anchors = Array.isArray(feature?.structureTransitionAnchors)
    ? feature.structureTransitionAnchors.filter((anchor) =>
        anchor?.source === 'transport_graph_node' && Number.isFinite(Number(anchor?.targetSurfaceY)))
    : [];
  if (anchors.length === 0 || heights.length === 0) return heights;

  const grade = Math.max(0.01, finiteNumber(maximumGrade, DEFAULT_MAX_GRADE));
  const fixedTargets = new Map();
  for (const anchor of anchors) {
    const targetDistance = clamp(
      finiteNumber(anchor.distance),
      0,
      finiteNumber(distances[distances.length - 1])
    );
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    for (let index = 0; index < distances.length; index += 1) {
      const delta = Math.abs(finiteNumber(distances[index]) - targetDistance);
      if (delta < nearestDistance) {
        nearestDistance = delta;
        nearestIndex = index;
      }
    }
    fixedTargets.set(nearestIndex, Number(anchor.targetSurfaceY));
  }

  const fixedEntries = [...fixedTargets.entries()];
  const hasAbsoluteStructuralMinimum = Number.isFinite(Number(feature?.minimumStructureSurfaceY));
  const structureStations = Array.isArray(feature?.structureStations)
    ? feature.structureStations
    : [];
  const hasHardStationAt = (distance) => structureStations.some((station) =>
    Math.abs(finiteNumber(station?.distance) - distance) <= Math.max(1, finiteNumber(station?.span, 1))
  );
  for (let leftIndex = 0; leftIndex < fixedEntries.length; leftIndex += 1) {
    const [leftSample, leftTarget] = fixedEntries[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < fixedEntries.length; rightIndex += 1) {
      const [rightSample, rightTarget] = fixedEntries[rightIndex];
      const run = Math.abs(distances[rightSample] - distances[leftSample]);
      if (Math.abs(rightTarget - leftTarget) > grade * run + 1e-6) return heights;
    }
    for (let index = 0; index < heights.length; index += 1) {
      const structuralLowerBound = finiteNumber(lowerBounds?.[index], Number.NEGATIVE_INFINITY);
      const run = Math.abs(distances[index] - distances[leftSample]);
      if (
        (hasAbsoluteStructuralMinimum || hasHardStationAt(distances[index])) &&
        structuralLowerBound > leftTarget + grade * run + 1e-6
      ) {
        // Crossing clearance outranks a stale or physically impossible graph
        // join. Keep the already grade-limited structural profile rather than
        // cutting a bridge through the road or water beneath it.
        return heights;
      }
    }
  }

  const effectiveLowerBounds = new Float64Array(heights.length);
  const effectiveUpperBounds = new Float64Array(heights.length);
  for (let index = 0; index < heights.length; index += 1) {
    let lower = finiteNumber(lowerBounds?.[index], Number.NEGATIVE_INFINITY);
    let upper = Number.POSITIVE_INFINITY;
    for (const [fixedIndex, target] of fixedTargets) {
      const run = Math.abs(finiteNumber(distances[index]) - finiteNumber(distances[fixedIndex]));
      lower = Math.max(lower, target - grade * run);
      upper = Math.min(upper, target + grade * run);
    }
    // A graph node is the physical join shared by both road surfaces. Keep it
    // exact even when a generic bridge-clearance lower bound reaches the same
    // sample; the grade cone then reconciles the approach instead of leaving
    // a one-sample step at the junction.
    if (fixedTargets.has(index)) {
      lower = fixedTargets.get(index);
      upper = fixedTargets.get(index);
    }
    effectiveLowerBounds[index] = Math.min(lower, upper);
    effectiveUpperBounds[index] = upper;
  }

  const corrected = new Float64Array(heights);
  const clampToBounds = (index, value) => clamp(
    value,
    effectiveLowerBounds[index],
    effectiveUpperBounds[index]
  );
  for (let index = 0; index < corrected.length; index += 1) {
    corrected[index] = clampToBounds(index, corrected[index]);
  }

  const enforceConstrainedGrade = () => {
    for (let index = 1; index < corrected.length; index += 1) {
      const run = Math.max(1e-6, distances[index] - distances[index - 1]);
      corrected[index] = clampToBounds(
        index,
        clamp(corrected[index], corrected[index - 1] - grade * run, corrected[index - 1] + grade * run)
      );
    }
    for (let index = corrected.length - 2; index >= 0; index -= 1) {
      const run = Math.max(1e-6, distances[index + 1] - distances[index]);
      corrected[index] = clampToBounds(
        index,
        clamp(corrected[index], corrected[index + 1] - grade * run, corrected[index + 1] + grade * run)
      );
    }
    for (const [index, target] of fixedTargets) corrected[index] = target;
  };

  for (let pass = 0; pass < 8; pass += 1) enforceConstrainedGrade();
  for (let pass = 0; pass < 6; pass += 1) {
    const next = new Float64Array(corrected);
    for (let index = 1; index < corrected.length - 1; index += 1) {
      if (fixedTargets.has(index)) continue;
      next[index] = clampToBounds(
        index,
        corrected[index] * 0.58 + (corrected[index - 1] + corrected[index + 1]) * 0.21
      );
    }
    corrected.set(next);
    enforceConstrainedGrade();
  }
  return new Float32Array(corrected);
}

function enforceMaximumGrade(heights, lowerBounds, distances, maximumGrade) {
  const grade = Math.max(0.01, finiteNumber(maximumGrade, DEFAULT_MAX_GRADE));
  for (let pass = 0; pass < 3; pass += 1) {
    for (let index = 1; index < heights.length; index += 1) {
      const run = Math.max(1e-6, distances[index] - distances[index - 1]);
      heights[index] = Math.max(
        finiteNumber(lowerBounds?.[index], -Infinity),
        heights[index],
        heights[index - 1] - grade * run
      );
    }
    for (let index = heights.length - 2; index >= 0; index -= 1) {
      const run = Math.max(1e-6, distances[index + 1] - distances[index]);
      heights[index] = Math.max(
        finiteNumber(lowerBounds?.[index], -Infinity),
        heights[index],
        heights[index + 1] - grade * run
      );
    }
  }
}

function smoothGradeLimitedProfile(initialHeights, lowerBounds, distances, maximumGrade) {
  const heights = new Float64Array(initialHeights);
  enforceMaximumGrade(heights, lowerBounds, distances, maximumGrade);
  for (let pass = 0; pass < 6; pass += 1) {
    const next = new Float64Array(heights);
    for (let index = 1; index < heights.length - 1; index += 1) {
      const neighborAverage = (heights[index - 1] + heights[index + 1]) * 0.5;
      next[index] = Math.max(
        finiteNumber(lowerBounds?.[index], -Infinity),
        heights[index] * 0.58 + neighborAverage * 0.42
      );
    }
    heights.set(next);
    enforceMaximumGrade(heights, lowerBounds, distances, maximumGrade);
  }
  return new Float32Array(heights);
}

function smoothSignedCutFillProfile(
  terrainEnvelope,
  lowerBounds,
  upperBounds,
  distances,
  maximumGrade,
  fitRadius
) {
  const radius = Math.max(4, finiteNumber(fitRadius, DEFAULT_VERTICAL_FIT_RADIUS));
  const heights = new Float64Array(terrainEnvelope.length);
  for (let index = 0; index < terrainEnvelope.length; index += 1) {
    let weightedSum = 0;
    let weightTotal = 0;
    for (let candidate = 0; candidate < terrainEnvelope.length; candidate += 1) {
      const delta = Math.abs(distances[candidate] - distances[index]);
      if (delta > radius) continue;
      const weight = 1 - delta / radius;
      weightedSum += terrainEnvelope[candidate] * weight;
      weightTotal += weight;
    }
    const target = weightTotal > 0
      ? weightedSum / weightTotal
      : terrainEnvelope[index];
    heights[index] = clamp(target, lowerBounds[index], upperBounds[index]);
  }

  const grade = Math.max(0.01, finiteNumber(maximumGrade, DEFAULT_MAX_GRADE));
  for (let pass = 0; pass < 8; pass += 1) {
    for (let index = 1; index < heights.length; index += 1) {
      const run = Math.max(1e-6, distances[index] - distances[index - 1]);
      heights[index] = clamp(
        heights[index],
        Math.max(lowerBounds[index], heights[index - 1] - grade * run),
        Math.min(upperBounds[index], heights[index - 1] + grade * run)
      );
    }
    for (let index = heights.length - 2; index >= 0; index -= 1) {
      const run = Math.max(1e-6, distances[index + 1] - distances[index]);
      heights[index] = clamp(
        heights[index],
        Math.max(lowerBounds[index], heights[index + 1] - grade * run),
        Math.min(upperBounds[index], heights[index + 1] + grade * run)
      );
    }
    const next = new Float64Array(heights);
    for (let index = 1; index < heights.length - 1; index += 1) {
      next[index] = clamp(
        heights[index] * 0.45 + (heights[index - 1] + heights[index + 1]) * 0.275,
        lowerBounds[index],
        upperBounds[index]
      );
    }
    heights.set(next);
  }
  return new Float32Array(heights);
}

function profileStats(distances, heights, terrainSamples = null, surfaceBias = 0) {
  let minimumY = Infinity;
  let maximumY = -Infinity;
  let maximumGrade = 0;
  let maximumGradeDelta = 0;
  let maximumCut = 0;
  let maximumFill = 0;
  let previousGrade = null;
  for (let index = 0; index < heights.length; index += 1) {
    minimumY = Math.min(minimumY, heights[index]);
    maximumY = Math.max(maximumY, heights[index]);
    if (terrainSamples?.length) {
      for (const samples of terrainSamples) {
        if (samples?.length !== heights.length) continue;
        const cutFill = heights[index] - (samples[index] + surfaceBias);
        maximumCut = Math.max(maximumCut, -cutFill);
        maximumFill = Math.max(maximumFill, cutFill);
      }
    }
    if (index === 0) continue;
    const run = Math.max(1e-6, distances[index] - distances[index - 1]);
    const grade = (heights[index] - heights[index - 1]) / run;
    maximumGrade = Math.max(maximumGrade, Math.abs(grade));
    if (previousGrade !== null) {
      maximumGradeDelta = Math.max(maximumGradeDelta, Math.abs(grade - previousGrade) / run);
    }
    previousGrade = grade;
  }
  return Object.freeze({
    minimumY,
    maximumY,
    maximumGrade,
    maximumGradeDelta,
    maximumCut,
    maximumFill
  });
}

function sampleTerrainOrThrow(sampleTerrainY, x, z) {
  const value = Number(sampleTerrainY(x, z));
  if (!Number.isFinite(value)) {
    throw new Error(`Transport surface ground sample unavailable at ${x},${z}`);
  }
  return value;
}

export {
  DEFAULT_MAX_AT_GRADE_CUT,
  DEFAULT_MAX_AT_GRADE_FILL,
  DEFAULT_MAX_GRADE,
  DEFAULT_SURFACE_BIAS,
  DEFAULT_VERTICAL_FIT_RADIUS,
  applyEndpointTieIns,
  applyExactGraphNodeConstraints,
  reconcileExactGraphNodeConstraints,
  applyStationInfluence,
  clamp,
  createSampleDistances,
  endpointTransitionGate,
  enforceMaximumGrade,
  finiteNumber,
  normalizeAnchors,
  pointAtDistance,
  profileStats,
  sampleSmoothAnchors,
  sampleTerrainOrThrow,
  smoothGradeLimitedProfile,
  smoothSignedCutFillProfile,
  tangentAtDistance
};
