import {
  boundsIntersect,
  polylineBounds,
  polylineDistances,
  segmentIntersection2D
} from './geometry.js?v=2';
import {
  compileTransportNetworkModel
} from '../world/compiler/transport-network-model.js?v=9';

function structureFeatureStableKey(candidate) {
  const sourceId = String(candidate?.sourceFeatureId || candidate?.id || '').trim();
  if (sourceId) return sourceId;
  const points = Array.isArray(candidate?.pts) ? candidate.pts : [];
  const first = points[0] || {};
  const last = points[points.length - 1] || {};
  return [
    Number(first.x || 0).toFixed(3),
    Number(first.z || 0).toFixed(3),
    Number(last.x || 0).toFixed(3),
    Number(last.z || 0).toFixed(3),
    String(candidate?.type || '')
  ].join(':');
}

function spatialCandidatePairs(features = [], padding = 8, cellSize = 240) {
  const buckets = new Map();
  for (let index = 0; index < features.length; index += 1) {
    const feature = features[index];
    const points = Array.isArray(feature?.pts) ? feature.pts : [];
    const bounds = feature?.bounds || polylineBounds(points, (Number(feature?.width) || 4) + padding);
    if (!bounds) continue;
    const minColumn = Math.floor((Number(bounds.minX) - padding) / cellSize);
    const maxColumn = Math.floor((Number(bounds.maxX) + padding) / cellSize);
    const minRow = Math.floor((Number(bounds.minZ) - padding) / cellSize);
    const maxRow = Math.floor((Number(bounds.maxZ) + padding) / cellSize);
    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        const key = `${column}:${row}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(index);
      }
    }
  }
  const pairKeys = new Set();
  const pairs = [];
  for (const indices of buckets.values()) {
    for (let left = 0; left < indices.length; left += 1) {
      for (let right = left + 1; right < indices.length; right += 1) {
        const leftIndex = Math.min(indices[left], indices[right]);
        const rightIndex = Math.max(indices[left], indices[right]);
        const key = `${leftIndex}:${rightIndex}`;
        if (pairKeys.has(key)) continue;
        pairKeys.add(key);
        pairs.push([leftIndex, rightIndex]);
      }
    }
  }
  return pairs;
}

function featureCrossingsAwayFromSharedEndpoint(feature, other, areRoadsConnected) {
  const points = Array.isArray(feature?.pts) ? feature.pts : [];
  const otherPoints = Array.isArray(other?.pts) ? other.pts : [];
  if (points.length < 2 || otherPoints.length < 2) return [];
  const featureBounds = feature.bounds || polylineBounds(points, Number(feature.width) || 4);
  const otherBounds = other.bounds || polylineBounds(otherPoints, Number(other.width) || 4);
  if (!boundsIntersect(featureBounds, otherBounds, 4)) return [];

  const crossings = [];
  for (let segA = 0; segA < points.length - 1; segA += 1) {
    for (let segB = 0; segB < otherPoints.length - 1; segB += 1) {
      const intersection = segmentIntersection2D(
        points[segA],
        points[segA + 1],
        otherPoints[segB],
        otherPoints[segB + 1]
      );
      if (!intersection) continue;
      const atFeatureEndpointA =
        (segA === 0 && intersection.t <= 0.02) ||
        (segA === points.length - 2 && intersection.t >= 0.98);
      const atFeatureEndpointB =
        (segB === 0 && intersection.u <= 0.02) ||
        (segB === otherPoints.length - 2 && intersection.u >= 0.98);
      if ((atFeatureEndpointA || atFeatureEndpointB) && areRoadsConnected(feature, other)) continue;
      crossings.push({ ...intersection, segA, segB });
    }
  }
  return crossings;
}

function assignStructureStackRanks(features = [], sampleTerrainY = null, options = {}) {
  const areRoadsConnected = typeof options.areRoadsConnected === 'function'
    ? options.areRoadsConnected
    : () => false;
  const areRoadsStackContinuous = typeof options.areRoadsStackContinuous === 'function'
    ? options.areRoadsStackContinuous
    : areRoadsConnected;
  const structureFeatures = features.filter((feature) =>
    feature?.structureSemantics?.gradeSeparated &&
    Array.isArray(feature?.pts) &&
    feature.pts.length >= 2
  );
  for (const feature of structureFeatures) {
    feature.structureStackRank = 0;
    feature.structureStackOffset = 0;
  }

  const groups = new Map();
  for (const feature of structureFeatures) {
    const semantics = feature.structureSemantics;
    const key = `${semantics.terrainMode}:${Number(semantics.verticalOrder) || 0}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(feature);
  }

  for (const group of groups.values()) {
    // OSM commonly splits one physical ramp/deck into several ways. Stack
    // ownership belongs to the connected deck, not each source fragment.
    const parent = new Map(group.map((feature) => [feature, feature]));
    const find = (feature) => {
      let root = parent.get(feature);
      while (root !== parent.get(root)) root = parent.get(root);
      let current = feature;
      while (parent.get(current) !== root) {
        const next = parent.get(current);
        parent.set(current, root);
        current = next;
      }
      return root;
    };
    const union = (left, right) => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot === rightRoot) return;
      const leftOwnsComponent =
        structureFeatureStableKey(leftRoot).localeCompare(structureFeatureStableKey(rightRoot)) <= 0;
      parent.set(leftOwnsComponent ? rightRoot : leftRoot, leftOwnsComponent ? leftRoot : rightRoot);
    };
    const candidatePairs = spatialCandidatePairs(group);
    for (const [leftIndex, rightIndex] of candidatePairs) {
      if (areRoadsStackContinuous(group[leftIndex], group[rightIndex])) {
        union(group[leftIndex], group[rightIndex]);
      }
    }

    const componentsByRoot = new Map();
    for (const feature of group) {
      const root = find(feature);
      if (!componentsByRoot.has(root)) componentsByRoot.set(root, []);
      componentsByRoot.get(root).push(feature);
    }
    const components = [...componentsByRoot.values()];
    const componentFor = new Map();
    for (const component of components) {
      component.sort((left, right) =>
        structureFeatureStableKey(left).localeCompare(structureFeatureStableKey(right))
      );
      for (const feature of component) componentFor.set(feature, component);
    }

    const adjacency = new Map(components.map((component) => [component, new Set()]));
    const crossingEdges = [];
    for (const [leftIndex, rightIndex] of candidatePairs) {
      const left = group[leftIndex];
      const right = group[rightIndex];
      const leftComponent = componentFor.get(left);
      const rightComponent = componentFor.get(right);
      if (leftComponent === rightComponent) continue;
      const crossings = featureCrossingsAwayFromSharedEndpoint(left, right, areRoadsConnected);
      if (crossings.length === 0) continue;
      adjacency.get(leftComponent).add(rightComponent);
      adjacency.get(rightComponent).add(leftComponent);
      crossingEdges.push({ left, right, leftComponent, rightComponent, crossings });
    }

    const ordered = [...components].sort((left, right) =>
      structureFeatureStableKey(left[0]).localeCompare(structureFeatureStableKey(right[0]))
    );
    const colors = new Map();
    for (const component of ordered) {
      const used = new Set();
      for (const neighbor of adjacency.get(component) || []) {
        if (colors.has(neighbor)) used.add(colors.get(neighbor));
      }
      let color = 0;
      while (used.has(color)) color += 1;
      colors.set(component, color);
      const semantics = component[0].structureSemantics;
      const clearance =
        semantics.featureCategory === 'road' ? 5.5 :
        semantics.featureCategory === 'railway' ? 6.2 :
        4.2;
      for (const feature of component) {
        feature.structureStackRank = color;
        // Graph coloring separates overlapping structure components for
        // deterministic ownership; it is not vertical survey data. Mapped
        // layer/order, accepted terrain, explicit elevations, water surfaces,
        // and local crossing stations own height. Converting an arbitrary
        // color into metres made whole ramps float and changed their height
        // when provider completeness changed.
        feature.structureStackOffset = 0;
      }
    }

    if (typeof sampleTerrainY !== 'function' || group[0]?.structureSemantics?.terrainMode !== 'elevated') {
      continue;
    }
    const profileCache = new Map();
    const profileFor = (feature) => {
      if (profileCache.has(feature)) return profileCache.get(feature);
      const profile = polylineDistances(feature.pts);
      const start = feature.pts[0];
      const end = feature.pts[feature.pts.length - 1];
      profile.endpointStartY = Number(sampleTerrainY(start.x, start.z));
      profile.endpointEndY = Number(sampleTerrainY(end.x, end.z));
      profileCache.set(feature, profile);
      return profile;
    };
    const baseSurfaceAtCrossing = (feature, crossing, side) => {
      const profile = profileFor(feature);
      const segmentIndex = side === 'left' ? crossing.segA : crossing.segB;
      const t = side === 'left' ? crossing.t : crossing.u;
      const p1 = feature.pts[segmentIndex];
      const p2 = feature.pts[segmentIndex + 1];
      const segmentLength = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      const distance = Number(profile.distances[segmentIndex] || 0) + segmentLength * t;
      const progress = profile.total > 1e-6 ? distance / profile.total : 0;
      const chordY =
        profile.endpointStartY + (profile.endpointEndY - profile.endpointStartY) * progress;
      return chordY +
        Math.max(0, Number(feature.structureSemantics?.deckClearance) || 0) +
        Math.max(0, Number(feature.structureStackOffset) || 0);
    };

    // Do not turn graph-color ordering into a component-wide elevation. Local
    // crossing stations below apply the modeled clearance only where two
    // mapped paths actually cross, preventing provider-order changes from
    // lifting an entire connected roadway.
  }
  return structureFeatures;
}

function assignFeatureConnections(features = [], options = {}) {
  return compileTransportNetworkModel(features, options);
}

export { assignFeatureConnections, assignStructureStackRanks };
