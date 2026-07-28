import {
  boundsIntersect,
  polylineBounds,
  polylineDistances,
  segmentIntersection2D
} from './geometry.js?v=1';

function connectionEndpointKey(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return '';
  return `${Math.round(point.x * 10)},${Math.round(point.z * 10)}`;
}

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
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        if (areRoadsStackContinuous(group[leftIndex], group[rightIndex])) {
          union(group[leftIndex], group[rightIndex]);
        }
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
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
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
        feature.structureStackOffset = color * clearance;
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

    crossingEdges.sort((left, right) =>
      Math.max(colors.get(left.leftComponent) || 0, colors.get(left.rightComponent) || 0) -
      Math.max(colors.get(right.leftComponent) || 0, colors.get(right.rightComponent) || 0)
    );
    for (let pass = 0; pass < Math.max(2, group.length); pass += 1) {
      let changed = false;
      for (const edge of crossingEdges) {
        const leftColor = colors.get(edge.leftComponent) || 0;
        const rightColor = colors.get(edge.rightComponent) || 0;
        const lower = leftColor < rightColor ? edge.left : edge.right;
        const upper = lower === edge.left ? edge.right : edge.left;
        const upperComponent = lower === edge.left ? edge.rightComponent : edge.leftComponent;
        const lowerSide = lower === edge.left ? 'left' : 'right';
        const upperSide = lower === edge.left ? 'right' : 'left';
        const clearance = upper.structureSemantics?.featureCategory === 'road' ? 6 : 4.6;
        let requiredLift = 0;
        for (const crossing of edge.crossings) {
          const lowerY = baseSurfaceAtCrossing(lower, crossing, lowerSide);
          const upperY = baseSurfaceAtCrossing(upper, crossing, upperSide);
          requiredLift = Math.max(requiredLift, lowerY + clearance - upperY);
        }
        if (requiredLift <= 1e-4) continue;
        for (const feature of upperComponent) feature.structureStackOffset += requiredLift;
        changed = true;
      }
      if (!changed) break;
    }
  }
  return structureFeatures;
}

function assignFeatureConnections(features = []) {
  const endpointGroups = new Map();
  const endpoints = [];
  for (const feature of features) {
    const points = Array.isArray(feature?.pts) ? feature.pts : null;
    if (!points || points.length < 2) continue;
    feature.connectedFeatures = { start: [], end: [] };
    const featureEndpoints = [
      { endpoint: 'start', endpointIndex: 0, point: points[0] },
      { endpoint: 'end', endpointIndex: points.length - 1, point: points[points.length - 1] }
    ];
    for (const entry of featureEndpoints) {
      const key = connectionEndpointKey(entry.point);
      if (!key) continue;
      if (!endpointGroups.has(key)) endpointGroups.set(key, []);
      const endpointEntry = { feature, ...entry };
      endpointGroups.get(key).push(endpointEntry);
      endpoints.push(endpointEntry);
    }
  }

  endpointGroups.forEach((entries) => {
    for (const entry of entries) {
      const target = entry.feature?.connectedFeatures?.[entry.endpoint];
      if (!Array.isArray(target)) continue;
      target.length = 0;
      for (const other of entries) {
        if (other === entry || other.feature === entry.feature) continue;
        target.push({
          feature: other.feature,
          endpoint: other.endpoint,
          endpointIndex: other.endpointIndex,
          point: other.point
        });
      }
    }
  });

  // Vector-tile road data commonly represents a merge as the endpoint of one
  // way touching the interior of another. Treating only endpoint-to-endpoint
  // pairs as connected makes real ramps look like stacked crossings and lifts
  // the adjoining decks apart.
  const segmentCellSize = 12;
  const joinTolerance = 0.35;
  const segmentCells = new Map();
  const cellKey = (x, z) => `${x},${z}`;
  for (const feature of features) {
    const points = Array.isArray(feature?.pts) ? feature.pts : null;
    if (!points || points.length < 2) continue;
    const profile = polylineDistances(points);
    for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
      const a = points[segmentIndex];
      const b = points[segmentIndex + 1];
      const minCellX = Math.floor((Math.min(a.x, b.x) - joinTolerance) / segmentCellSize);
      const maxCellX = Math.floor((Math.max(a.x, b.x) + joinTolerance) / segmentCellSize);
      const minCellZ = Math.floor((Math.min(a.z, b.z) - joinTolerance) / segmentCellSize);
      const maxCellZ = Math.floor((Math.max(a.z, b.z) + joinTolerance) / segmentCellSize);
      const segment = {
        feature,
        segmentIndex,
        a,
        b,
        distanceBefore: Number(profile.distances[segmentIndex] || 0)
      };
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
          const key = cellKey(cellX, cellZ);
          if (!segmentCells.has(key)) segmentCells.set(key, []);
          segmentCells.get(key).push(segment);
        }
      }
    }
  }

  for (const entry of endpoints) {
    const target = entry.feature?.connectedFeatures?.[entry.endpoint];
    if (!Array.isArray(target)) continue;
    const point = entry.point;
    const candidates = segmentCells.get(cellKey(
      Math.floor(point.x / segmentCellSize),
      Math.floor(point.z / segmentCellSize)
    )) || [];
    const bestByFeature = new Map();
    for (const candidate of candidates) {
      if (candidate.feature === entry.feature) continue;
      const entrySemantics = entry.feature?.structureSemantics || null;
      const candidateSemantics = candidate.feature?.structureSemantics || null;
      if (
        entrySemantics?.terrainMode !== candidateSemantics?.terrainMode ||
        Number(entrySemantics?.verticalOrder || 0) !== Number(candidateSemantics?.verticalOrder || 0)
      ) continue;
      const dx = candidate.b.x - candidate.a.x;
      const dz = candidate.b.z - candidate.a.z;
      const lengthSq = dx * dx + dz * dz;
      if (!(lengthSq > 1e-8)) continue;
      const t = Math.max(0, Math.min(
        1,
        ((point.x - candidate.a.x) * dx + (point.z - candidate.a.z) * dz) / lengthSq
      ));
      // Endpoint-to-endpoint joins were already handled exactly above. This
      // pass is specifically for T/merge junctions on the segment interior.
      if (t <= 0.001 || t >= 0.999) continue;
      const projectedX = candidate.a.x + dx * t;
      const projectedZ = candidate.a.z + dz * t;
      const distance = Math.hypot(projectedX - point.x, projectedZ - point.z);
      if (distance > joinTolerance) continue;
      const previous = bestByFeature.get(candidate.feature);
      if (!previous || distance < previous.distance) {
        bestByFeature.set(candidate.feature, {
          feature: candidate.feature,
          endpoint: 'interior',
          endpointIndex: candidate.segmentIndex,
          segmentIndex: candidate.segmentIndex,
          segmentT: t,
          distanceAlong: candidate.distanceBefore + Math.sqrt(lengthSq) * t,
          point: { x: projectedX, z: projectedZ },
          distance
        });
      }
    }
    for (const connection of bestByFeature.values()) {
      if (target.some((existing) => existing?.feature === connection.feature)) continue;
      target.push(connection);
    }
  }
}

export { assignFeatureConnections, assignStructureStackRanks };
