import { polylineDistances } from '../../structure-semantics/geometry.js?v=2';

const TRANSPORT_NETWORK_SCHEMA_VERSION = 1;
const DEFAULT_JOIN_TOLERANCE_METERS = 0.75;
const DEFAULT_CROSS_PROVIDER_JOIN_TOLERANCE_METERS = 2.25;
const DEFAULT_SEGMENT_CELL_METERS = 12;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function featureIdentity(feature, index) {
  return String(
    feature?.transportRecord?.identity ||
    feature?.sourceFeatureId ||
    feature?.id ||
    `transport-feature:${index}`
  );
}

function hashIdentities(identities) {
  let hash = 2166136261;
  const value = identities.join('|');
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function verticalCompatible(left, right) {
  const a = left?.structureSemantics || {};
  const b = right?.structureSemantics || {};
  return String(a.terrainMode || 'at_grade') === String(b.terrainMode || 'at_grade') &&
    finite(a.verticalOrder) === finite(b.verticalOrder);
}

function sourceTopologyIsAuthoritative(feature) {
  return feature?.transportRecord?.completeness === 'lossless';
}

function featureIsLink(feature) {
  return /_link$/i.test(String(feature?.type || ''));
}

function sourceCompleteness(feature) {
  return String(feature?.transportRecord?.completeness || 'generalized');
}

function crossProviderPair(leftFeature, rightFeature) {
  const values = new Set([
    sourceCompleteness(leftFeature),
    sourceCompleteness(rightFeature)
  ]);
  return values.has('lossless') && values.has('generalized');
}

function roadFamily(feature) {
  const type = String(
    feature?.transportRecord?.sourceTags?.highway ||
    feature?.transportRecord?.rawTags?.highway ||
    feature?.type ||
    ''
  ).replace(/_link$/i, '').toLowerCase();
  if (type === 'motorway' || type === 'trunk') return 'high_speed';
  if (type === 'primary' || type === 'secondary') return 'arterial';
  if (type === 'tertiary' || type === 'unclassified') return 'collector';
  if (type === 'residential' || type === 'living_street' || type === 'service') return 'local';
  return type || 'unknown';
}

function endpointDirection(descriptor, endpoint) {
  const points = descriptor?.points || [];
  if (points.length < 2) return null;
  const atStart = endpoint === 'start';
  const a = atStart ? points[0] : points[points.length - 2];
  const b = atStart ? points[1] : points[points.length - 1];
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (!(length > 1e-6)) return null;
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
}

function crossProviderEndpointCompatible(leftDescriptor, leftEndpoint, rightDescriptor, rightEndpoint) {
  if (!crossProviderPair(leftDescriptor?.feature, rightDescriptor?.feature)) return false;
  if (rightEndpoint !== 'start' && rightEndpoint !== 'end') return false;
  const leftFamily = roadFamily(leftDescriptor?.feature);
  const rightFamily = roadFamily(rightDescriptor?.feature);
  if (leftFamily !== rightFamily && !featureIsLink(leftDescriptor?.feature) && !featureIsLink(rightDescriptor?.feature)) {
    return false;
  }
  const leftDirection = endpointDirection(leftDescriptor, leftEndpoint);
  const rightDirection = endpointDirection(rightDescriptor, rightEndpoint);
  if (!leftDirection || !rightDirection) return false;
  const alignment = Math.abs(
    leftDirection.x * rightDirection.x + leftDirection.z * rightDirection.z
  );
  const leftPoint = leftEndpoint === 'start'
    ? leftDescriptor.points[0]
    : leftDescriptor.points[leftDescriptor.points.length - 1];
  const rightPoint = rightEndpoint === 'start'
    ? rightDescriptor.points[0]
    : rightDescriptor.points[rightDescriptor.points.length - 1];
  const gapX = rightPoint.x - leftPoint.x;
  const gapZ = rightPoint.z - leftPoint.z;
  const gapLength = Math.hypot(gapX, gapZ);
  const gapFollowsAlignment = gapLength <= 0.15 || (
    Math.abs((gapX * leftDirection.x + gapZ * leftDirection.z) / gapLength) >= 0.72 &&
    Math.abs((gapX * rightDirection.x + gapZ * rightDirection.z) / gapLength) >= 0.72
  );
  // This is endpoint conflation, not proximity topology. Perpendicular and
  // parallel-nearby streets remain separate even when their provider tiles
  // happen to place vertices within the expanded drift envelope.
  return alignment >= 0.82 && gapFollowsAlignment;
}

function sampleCompiledSurface(feature, distance) {
  const model = feature?.transportSurfaceModel;
  const distances = model?.distances;
  const heights = model?.centerHeights;
  if (!distances?.length || distances.length !== heights?.length) return NaN;
  const target = Math.max(0, Math.min(finite(distances[distances.length - 1]), finite(distance)));
  let index = 0;
  while (index < distances.length - 2 && finite(distances[index + 1]) < target) index += 1;
  const startDistance = finite(distances[index]);
  const endDistance = finite(distances[index + 1], startDistance);
  const span = Math.max(1e-6, endDistance - startDistance);
  const t = Math.max(0, Math.min(1, (target - startDistance) / span));
  return finite(heights[index]) + (finite(heights[index + 1]) - finite(heights[index])) * t;
}

function metricConnectionCompatible(leftDescriptor, rightDescriptor, leftDistance, segmentT, distanceAlong, snapDistance) {
  const leftFeature = leftDescriptor.feature;
  const rightFeature = rightDescriptor.feature;
  if (!verticalCompatible(leftFeature, rightFeature)) {
    const leftMode = String(leftFeature?.structureSemantics?.terrainMode || 'at_grade');
    const rightMode = String(rightFeature?.structureSemantics?.terrainMode || 'at_grade');
    // Different OSM layers are explicit non-connection evidence. In
    // particular, two otherwise at-grade ways at different layers describe a
    // crossing, not a ramp, even if provider geometry places vertices at the
    // same horizontal coordinate.
    if (leftMode === 'at_grade' && rightMode === 'at_grade') return false;
    // Generalized vector geometry does not retain OSM node identities. A
    // cross-mode tie-in is still valid at a near-exact ramp endpoint, but a
    // generic nearby crossing is not topology.
    return snapDistance <= 0.35 &&
      (segmentT <= 0.001 || segmentT >= 0.999 || featureIsLink(leftFeature) || featureIsLink(rightFeature));
  }
  if (leftFeature?.structureSemantics?.terrainMode === 'at_grade') return true;
  const leftY = sampleCompiledSurface(leftFeature, leftDistance);
  const rightY = sampleCompiledSurface(rightFeature, distanceAlong);
  return !Number.isFinite(leftY) || !Number.isFinite(rightY) || Math.abs(leftY - rightY) <= 3.5;
}

function occurrenceIsEndpoint(occurrence) {
  return occurrence?.topologyIndex === 0 ||
    occurrence?.topologyIndex === occurrence?.topologyCount - 1;
}

function sharedSourceNodeCompatible(leftOccurrence, rightOccurrence) {
  const leftFeature = leftOccurrence?.descriptor?.feature;
  const rightFeature = rightOccurrence?.descriptor?.feature;
  if (verticalCompatible(leftFeature, rightFeature)) {
    return true;
  }
  const leftMode = String(leftFeature?.structureSemantics?.terrainMode || 'at_grade');
  const rightMode = String(rightFeature?.structureSemantics?.terrainMode || 'at_grade');
  if (leftMode === 'at_grade' && rightMode === 'at_grade') return false;
  // OSM commonly splits one physical route at a bridge, ramp, or layer
  // boundary. Two way endpoints are an explicit topology tie-in. A ramp link
  // may deliberately merge into the interior of its through route. Other
  // endpoint/interior cross-layer pairs are ordinary grade-separated
  // crossings and must remain disconnected.
  const leftEndpoint = occurrenceIsEndpoint(leftOccurrence);
  const rightEndpoint = occurrenceIsEndpoint(rightOccurrence);
  if (leftEndpoint && rightEndpoint) return true;
  return (leftEndpoint || rightEndpoint) &&
    (featureIsLink(leftFeature) || featureIsLink(rightFeature));
}

function sourceNodeProvenance(endpoint, candidate) {
  const endpointNodeId = endpoint.sourceNodeId;
  if (!endpointNodeId) return null;
  if (!candidate.sourceNodeIds?.has(endpointNodeId)) return null;
  return Object.freeze({
    method: 'shared-source-node',
    confidence: 1
  });
}

function metricProvenance(distance, tolerance, kind) {
  const normalized = Math.max(0, Math.min(1, 1 - distance / Math.max(0.01, tolerance)));
  return Object.freeze({
    method: kind === 'endpoint-endpoint' ? 'metric-endpoint-drift' : 'metric-endpoint-interior',
    confidence: Number((0.72 + normalized * 0.23).toFixed(3))
  });
}

function crossProviderProvenance(distance, tolerance) {
  const normalized = Math.max(0, Math.min(1, 1 - distance / Math.max(0.01, tolerance)));
  return Object.freeze({
    method: 'cross-provider-endpoint-conflation',
    confidence: Number((0.76 + normalized * 0.16).toFixed(3))
  });
}

function connectionKey(left, right) {
  const values = [
    `${left.featureId}@${left.segmentIndex}:${left.segmentT.toFixed(5)}`,
    `${right.featureId}@${right.segmentIndex}:${right.segmentT.toFixed(5)}`
  ].sort();
  return values.join('<>');
}

function freezeConnectionSide(side) {
  return Object.freeze({
    featureId: side.featureId,
    endpoint: side.endpoint,
    endpointIndex: side.endpointIndex,
    segmentIndex: side.segmentIndex,
    segmentT: side.segmentT,
    distanceAlong: side.distanceAlong,
    point: Object.freeze({ x: side.point.x, z: side.point.z })
  });
}

function compileTransportNetworkModel(features = [], options = {}) {
  const tolerance = Math.max(
    0.1,
    finite(options.joinToleranceMeters, DEFAULT_JOIN_TOLERANCE_METERS)
  );
  const crossProviderTolerance = Math.max(
    tolerance,
    finite(
      options.crossProviderJoinToleranceMeters,
      DEFAULT_CROSS_PROVIDER_JOIN_TOLERANCE_METERS
    )
  );
  const searchTolerance = Math.max(tolerance, crossProviderTolerance);
  const cellSize = Math.max(
    searchTolerance * 2,
    finite(options.segmentCellMeters, DEFAULT_SEGMENT_CELL_METERS)
  );
  const descriptors = [];
  const featureIdCounts = new Map();

  for (let index = 0; index < features.length; index += 1) {
    const feature = features[index];
    const points = Array.isArray(feature?.pts) ? feature.pts : [];
    if (points.length < 2) continue;
    const profile = polylineDistances(points);
    const sourceNodeIds = sourceTopologyIsAuthoritative(feature) && Array.isArray(feature?.sourceNodeIds)
      ? feature.sourceNodeIds.map(String)
      : [];
    const baseFeatureId = featureIdentity(feature, index);
    const fragmentIndex = featureIdCounts.get(baseFeatureId) || 0;
    featureIdCounts.set(baseFeatureId, fragmentIndex + 1);
    const descriptor = {
      feature,
      featureId: fragmentIndex === 0
        ? baseFeatureId
        : `${baseFeatureId}#fragment:${fragmentIndex}`,
      sourceIdentity: baseFeatureId,
      points,
      pathDistances: profile.distances,
      totalDistance: profile.total,
      sourceNodeIds: new Set(sourceNodeIds),
      endpointSourceNodeIds: {
        start: sourceNodeIds[0] || null,
        end: sourceNodeIds[sourceNodeIds.length - 1] || null
      }
    };
    descriptors.push(descriptor);
  }
  descriptors.sort((left, right) => left.featureId.localeCompare(right.featureId));
  const descriptorByFeatureId = new Map(
    descriptors.map((descriptor) => [descriptor.featureId, descriptor])
  );

  const cellKey = (x, z) => `${x},${z}`;
  const segmentCells = new Map();
  for (const descriptor of descriptors) {
    for (let segmentIndex = 0; segmentIndex < descriptor.points.length - 1; segmentIndex += 1) {
      const a = descriptor.points[segmentIndex];
      const b = descriptor.points[segmentIndex + 1];
      const segment = {
        descriptor,
        segmentIndex,
        a,
        b,
        distanceBefore: finite(descriptor.pathDistances[segmentIndex])
      };
      const minX = Math.floor((Math.min(a.x, b.x) - searchTolerance) / cellSize);
      const maxX = Math.floor((Math.max(a.x, b.x) + searchTolerance) / cellSize);
      const minZ = Math.floor((Math.min(a.z, b.z) - searchTolerance) / cellSize);
      const maxZ = Math.floor((Math.max(a.z, b.z) + searchTolerance) / cellSize);
      for (let x = minX; x <= maxX; x += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          const key = cellKey(x, z);
          if (!segmentCells.has(key)) segmentCells.set(key, []);
          segmentCells.get(key).push(segment);
        }
      }
    }
  }

  const connectionsByKey = new Map();
  const projectPointToDescriptor = (descriptor, point) => {
    let best = null;
    for (let segmentIndex = 0; segmentIndex < descriptor.points.length - 1; segmentIndex += 1) {
      const a = descriptor.points[segmentIndex];
      const b = descriptor.points[segmentIndex + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSq = dx * dx + dz * dz;
      if (!(lengthSq > 1e-8)) continue;
      const segmentT = Math.max(0, Math.min(
        1,
        ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq
      ));
      const projected = {
        x: a.x + dx * segmentT,
        z: a.z + dz * segmentT
      };
      const distance = Math.hypot(projected.x - point.x, projected.z - point.z);
      if (!best || distance < best.distance) {
        best = {
          segmentIndex,
          segmentT,
          point: projected,
          distance,
          distanceAlong: finite(descriptor.pathDistances[segmentIndex]) +
            Math.sqrt(lengthSq) * segmentT
        };
      }
    }
    return best;
  };

  const sourceNodeOccurrences = new Map();
  for (const descriptor of descriptors) {
    const topologyNodes = sourceTopologyIsAuthoritative(descriptor.feature) && Array.isArray(descriptor.feature?.sourceTopologyNodes)
      ? descriptor.feature.sourceTopologyNodes
      : [];
    for (let index = 0; index < topologyNodes.length; index += 1) {
      const topologyNode = topologyNodes[index];
      const sourceNodeId = String(topologyNode?.id || '');
      if (!sourceNodeId) continue;
      if (!sourceNodeOccurrences.has(sourceNodeId)) sourceNodeOccurrences.set(sourceNodeId, []);
      sourceNodeOccurrences.get(sourceNodeId).push({
        descriptor,
        topologyIndex: index,
        topologyCount: topologyNodes.length,
        point: topologyNode
      });
    }
  }
  for (const [sourceNodeId, occurrences] of sourceNodeOccurrences) {
    if (occurrences.length < 2) continue;
    for (let leftIndex = 0; leftIndex < occurrences.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < occurrences.length; rightIndex += 1) {
        const leftOccurrence = occurrences[leftIndex];
        const rightOccurrence = occurrences[rightIndex];
        if (leftOccurrence.descriptor === rightOccurrence.descriptor) continue;
        if (!sharedSourceNodeCompatible(leftOccurrence, rightOccurrence)) continue;
        const leftProjection = projectPointToDescriptor(
          leftOccurrence.descriptor,
          leftOccurrence.point
        );
        const rightProjection = projectPointToDescriptor(
          rightOccurrence.descriptor,
          rightOccurrence.point
        );
        if (!leftProjection || !rightProjection) continue;
        const sideFor = (occurrence, projection) => {
          const endpoint = occurrence.topologyIndex === 0
            ? 'start'
            : occurrence.topologyIndex === occurrence.topologyCount - 1
              ? 'end'
              : 'interior';
          return {
            featureId: occurrence.descriptor.featureId,
            endpoint,
            endpointIndex: endpoint === 'end'
              ? occurrence.descriptor.points.length - 1
              : endpoint === 'start'
                ? 0
                : projection.segmentIndex,
            segmentIndex: projection.segmentIndex,
            segmentT: projection.segmentT,
            distanceAlong: projection.distanceAlong,
            point: projection.point
          };
        };
        const left = sideFor(leftOccurrence, leftProjection);
        const right = sideFor(rightOccurrence, rightProjection);
        const kind = left.endpoint === 'interior' && right.endpoint === 'interior'
          ? 'source-node-intersection'
          : left.endpoint === 'interior' || right.endpoint === 'interior'
            ? 'endpoint-interior'
            : 'endpoint-endpoint';
        const key = connectionKey(left, right);
        connectionsByKey.set(key, {
          key,
          kind,
          left,
          right,
          snapDistanceMeters: Math.max(leftProjection.distance, rightProjection.distance),
          provenance: Object.freeze({
            method: 'shared-source-node',
            sourceNodeId,
            confidence: 1
          })
        });
      }
    }
  }

  for (const descriptor of descriptors) {
    const endpoints = [
      {
        endpoint: 'start',
        endpointIndex: 0,
        point: descriptor.points[0],
        sourceNodeId: descriptor.endpointSourceNodeIds.start
      },
      {
        endpoint: 'end',
        endpointIndex: descriptor.points.length - 1,
        point: descriptor.points[descriptor.points.length - 1],
        sourceNodeId: descriptor.endpointSourceNodeIds.end
      }
    ];
    for (const endpoint of endpoints) {
      const candidates = segmentCells.get(cellKey(
        Math.floor(endpoint.point.x / cellSize),
        Math.floor(endpoint.point.z / cellSize)
      )) || [];
      const bestByFeature = new Map();
      for (const candidate of candidates) {
        if (candidate.descriptor === descriptor) continue;
        const dx = candidate.b.x - candidate.a.x;
        const dz = candidate.b.z - candidate.a.z;
        const lengthSq = dx * dx + dz * dz;
        if (!(lengthSq > 1e-8)) continue;
        const segmentT = Math.max(0, Math.min(
          1,
          ((endpoint.point.x - candidate.a.x) * dx +
            (endpoint.point.z - candidate.a.z) * dz) / lengthSq
        ));
        const projected = {
          x: candidate.a.x + dx * segmentT,
          z: candidate.a.z + dz * segmentT
        };
        const distance = Math.hypot(
          projected.x - endpoint.point.x,
          projected.z - endpoint.point.z
        );
        const projectedEndpoint = segmentT <= 0.001
          ? 'start'
          : segmentT >= 0.999
            ? 'end'
            : 'interior';
        const conflatedEndpoint = distance <= crossProviderTolerance &&
          crossProviderEndpointCompatible(
            descriptor,
            endpoint.endpoint,
            candidate.descriptor,
            projectedEndpoint
          );
        const acceptedTolerance = conflatedEndpoint ? crossProviderTolerance : tolerance;
        if (distance > acceptedTolerance) continue;
        const candidateDistanceAlong = candidate.distanceBefore + Math.sqrt(lengthSq) * segmentT;
        if (!conflatedEndpoint && !metricConnectionCompatible(
          descriptor,
          candidate.descriptor,
          endpoint.endpoint === 'start' ? 0 : descriptor.totalDistance,
          segmentT,
          candidateDistanceAlong,
          distance
        )) continue;
        const previous = bestByFeature.get(candidate.descriptor);
        if (!previous || distance < previous.distance) {
          bestByFeature.set(candidate.descriptor, {
            candidate,
            segmentT,
            projected,
            distance,
            distanceAlong: candidateDistanceAlong,
            conflatedEndpoint,
            acceptedTolerance
          });
        }
      }

      for (const match of bestByFeature.values()) {
        const otherEndpoint = match.segmentT <= 0.001
          ? 'start'
          : match.segmentT >= 0.999
            ? 'end'
            : 'interior';
        const left = {
          featureId: descriptor.featureId,
          endpoint: endpoint.endpoint,
          endpointIndex: endpoint.endpointIndex,
          segmentIndex: endpoint.endpoint === 'start' ? 0 : descriptor.points.length - 2,
          segmentT: endpoint.endpoint === 'start' ? 0 : 1,
          distanceAlong: endpoint.endpoint === 'start' ? 0 : descriptor.totalDistance,
          point: endpoint.point
        };
        const rightDescriptor = match.candidate.descriptor;
        const segmentLength = Math.sqrt(
          (match.candidate.b.x - match.candidate.a.x) ** 2 +
          (match.candidate.b.z - match.candidate.a.z) ** 2
        );
        const right = {
          featureId: rightDescriptor.featureId,
          endpoint: otherEndpoint,
          endpointIndex: otherEndpoint === 'end'
            ? match.candidate.segmentIndex + 1
            : match.candidate.segmentIndex,
          segmentIndex: match.candidate.segmentIndex,
          segmentT: match.segmentT,
          distanceAlong: match.distanceAlong ?? match.candidate.distanceBefore + segmentLength * match.segmentT,
          point: match.projected
        };
        const key = connectionKey(left, right);
        const topologyProvenance = sourceNodeProvenance(endpoint, match.candidate);
        const kind = otherEndpoint === 'interior'
          ? 'endpoint-interior'
          : 'endpoint-endpoint';
        // A lossless endpoint may approach an exact way in plan view without
        // joining it. Once the best candidate and source-node provenance are
        // resolved, reject a cross-layer interior snap that has no shared
        // mapped node. Keep the candidate search itself unchanged: performing
        // provenance work inside that dense loop perturbs complete-world load
        // timing and previously caused the Golden Gate deck binding to miss
        // its publication window.
        if (
          kind === 'endpoint-interior' &&
          topologyProvenance === null &&
          sourceTopologyIsAuthoritative(descriptor.feature) &&
          sourceTopologyIsAuthoritative(rightDescriptor.feature) &&
          !verticalCompatible(descriptor.feature, rightDescriptor.feature)
        ) continue;
        const connection = {
          key,
          kind,
          left,
          right,
          snapDistanceMeters: match.distance,
          provenance: topologyProvenance || (
            match.conflatedEndpoint
              ? crossProviderProvenance(match.distance, match.acceptedTolerance)
              : metricProvenance(match.distance, tolerance, kind)
          )
        };
        const previous = connectionsByKey.get(key);
        if (
          !previous ||
          connection.provenance.confidence > previous.provenance.confidence ||
          connection.snapDistanceMeters < previous.snapDistanceMeters
        ) {
          connectionsByKey.set(key, connection);
        }
      }
    }
  }

  const rawConnections = [...connectionsByKey.values()].sort((left, right) =>
    left.key.localeCompare(right.key)
  );
  const graphId = `transport-network:${hashIdentities(
    descriptors.map((descriptor) => descriptor.featureId)
  )}`;
  const stationsByFeatureId = new Map(
    descriptors.map((descriptor) => [descriptor.featureId, []])
  );
  const connections = rawConnections.map((connection, index) => {
    const nodeId = `${graphId}:join:${index}`;
    const left = freezeConnectionSide(connection.left);
    const right = freezeConnectionSide(connection.right);
    stationsByFeatureId.get(left.featureId)?.push(Object.freeze({
      nodeId,
      connectionKind: connection.kind,
      segmentIndex: left.segmentIndex,
      segmentT: left.segmentT,
      distanceAlong: left.distanceAlong,
      point: left.point
    }));
    stationsByFeatureId.get(right.featureId)?.push(Object.freeze({
      nodeId,
      connectionKind: connection.kind,
      segmentIndex: right.segmentIndex,
      segmentT: right.segmentT,
      distanceAlong: right.distanceAlong,
      point: right.point
    }));
    return Object.freeze({
      id: nodeId,
      kind: connection.kind,
      left,
      right,
      snapDistanceMeters: connection.snapDistanceMeters,
      provenance: connection.provenance
    });
  });

  const featureModels = descriptors.map((descriptor) => {
    const stations = stationsByFeatureId.get(descriptor.featureId) || [];
    stations.sort((left, right) => left.distanceAlong - right.distanceAlong);
    const sourceRecord = descriptor.feature.transportRecord || null;
    const model = Object.freeze({
      featureId: descriptor.featureId,
      sourceIdentity: descriptor.sourceIdentity,
      direction: sourceRecord?.direction || 'both',
      driveable: descriptor.feature.driveable !== false && sourceRecord?.safeForDriving !== false,
      walkable: descriptor.feature.walkable !== false &&
        sourceRecord?.access?.pedestrian !== 'prohibited',
      routeState: sourceRecord?.routeState || 'complete',
      totalDistance: descriptor.totalDistance,
      stations: Object.freeze(stations)
    });
    descriptor.feature.transportGraphRef = Object.freeze({
      graphId,
      ...model
    });
    descriptor.feature.connectedFeatures = { start: [], end: [] };
    descriptor.feature.transportConnections = [];
    return model;
  });
  const featureModelById = new Map(featureModels.map((model) => [model.featureId, model]));

  for (const connection of connections) {
    const leftDescriptor = descriptorByFeatureId.get(connection.left.featureId);
    const rightDescriptor = descriptorByFeatureId.get(connection.right.featureId);
    if (!leftDescriptor || !rightDescriptor) continue;
    const compatibilityEntry = (targetDescriptor, side) => ({
      feature: targetDescriptor.feature,
      endpoint: side.endpoint,
      endpointIndex: side.endpointIndex,
      segmentIndex: side.segmentIndex,
      segmentT: side.segmentT,
      distanceAlong: side.distanceAlong,
      point: side.point,
      distance: connection.snapDistanceMeters,
      provenance: connection.provenance,
      graphConnectionId: connection.id
    });
    leftDescriptor.feature.transportConnections.push(Object.freeze(
      compatibilityEntry(rightDescriptor, connection.right)
    ));
    rightDescriptor.feature.transportConnections.push(Object.freeze(
      compatibilityEntry(leftDescriptor, connection.left)
    ));
    if (connection.left.endpoint !== 'interior') {
      leftDescriptor.feature.connectedFeatures[connection.left.endpoint].push(
        compatibilityEntry(rightDescriptor, connection.right)
      );
    }
    if (connection.right.endpoint !== 'interior') {
      rightDescriptor.feature.connectedFeatures[connection.right.endpoint].push(
        compatibilityEntry(leftDescriptor, connection.left)
      );
    }
  }

  for (const descriptor of descriptors) {
    Object.freeze(descriptor.feature.connectedFeatures.start);
    Object.freeze(descriptor.feature.connectedFeatures.end);
    Object.freeze(descriptor.feature.connectedFeatures);
    Object.freeze(descriptor.feature.transportConnections);
  }

  return Object.freeze({
    schemaVersion: TRANSPORT_NETWORK_SCHEMA_VERSION,
    authority: 'compiled_transport_network',
    id: graphId,
    joinToleranceMeters: tolerance,
    crossProviderJoinToleranceMeters: crossProviderTolerance,
    features: Object.freeze(featureModels),
    connections: Object.freeze(connections),
    stats: Object.freeze({
      featureCount: featureModels.length,
      connectionCount: connections.length,
      endpointInteriorCount: connections.filter((entry) => entry.kind === 'endpoint-interior').length,
      incompleteFeatureCount: featureModels.filter((entry) => entry.routeState !== 'complete').length
    }),
    featureById(featureId) {
      return featureModelById.get(String(featureId)) || null;
    }
  });
}

export {
  DEFAULT_CROSS_PROVIDER_JOIN_TOLERANCE_METERS,
  DEFAULT_JOIN_TOLERANCE_METERS,
  TRANSPORT_NETWORK_SCHEMA_VERSION,
  compileTransportNetworkModel
};
