import { directedSurfacePitch } from '../engine/vehicle-road-attitude.js?v=2';
import {
  MIN_DRIVEABLE_ROAD_WIDTH_METERS,
  minimumRoadWidthOnInterval,
  roadSegmentIsDriveable
} from '../world/road-cross-section-profile.js?v=1';

const GRAPH_BUDGET_BY_TIER = Object.freeze({
  low: Object.freeze({ pedestrianEdges: 180, trafficEdges: 140 }),
  performance: Object.freeze({ pedestrianEdges: 320, trafficEdges: 260 }),
  balanced: Object.freeze({ pedestrianEdges: 680, trafficEdges: 520 }),
  quality: Object.freeze({ pedestrianEdges: 1100, trafficEdges: 900 })
});

const LEFT_DRIVING_COUNTRY_CODES = new Set([
  'AG', 'AI', 'AU', 'BB', 'BD', 'BM', 'BN', 'BS', 'BT', 'BW', 'CY', 'DM',
  'FJ', 'FK', 'GB', 'GD', 'GG', 'GY', 'HK', 'ID', 'IE', 'IM', 'IN', 'JE',
  'JM', 'JP', 'KE', 'KI', 'KN', 'KY', 'LC', 'LK', 'LS', 'MO', 'MS', 'MT',
  'MU', 'MV', 'MW', 'MY', 'MZ', 'NA', 'NR', 'NP', 'NZ', 'PG', 'PK', 'PN',
  'SB', 'SC', 'SG', 'SH', 'SR', 'SZ', 'TC', 'TH', 'TK', 'TO', 'TT', 'TV',
  'TZ', 'UG', 'VC', 'VG', 'VI', 'WS', 'ZA', 'ZM', 'ZW'
]);

export function resolveDrivingSide(selection = {}) {
  const details = selection?.locationDetails || selection?.details || {};
  const countryCode = String(
    selection?.countryCode || details?.countryCode || details?.country_code || ''
  ).trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(countryCode)) {
    return Object.freeze({
      driveOnLeft: LEFT_DRIVING_COUNTRY_CODES.has(countryCode),
      source: 'country-code',
      countryCode
    });
  }
  const label = [selection?.name, details?.country].filter(Boolean).join(' ').toLowerCase();
  const leftByLabel = /\b(?:united kingdom|england|scotland|wales|northern ireland|australia|japan|new zealand|singapore|india|ireland|south africa|hong kong|thailand|malaysia|indonesia|pakistan|bangladesh|sri lanka|kenya|tanzania|uganda|zimbabwe|zambia|botswana|namibia|mozambique|london|tokyo|sydney|melbourne|auckland|wellington|dublin|edinburgh|glasgow)\b/.test(label);
  return Object.freeze({
    driveOnLeft: leftByLabel,
    source: leftByLabel ? 'location-label' : 'right-driving-fallback',
    countryCode: null
  });
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function featureKind(feature) {
  return String(feature?.networkKind || feature?.kind || 'road').toLowerCase();
}

function featureId(feature, fallback) {
  return String(
    feature?.transportRecord?.identity ||
    feature?.sourceFeatureId ||
    feature?.sourceRoadId ||
    feature?.id ||
    fallback
  );
}

function structureState(feature) {
  const semantics = feature?.structureSemantics || {};
  return Object.freeze({
    terrainMode: String(semantics.terrainMode || 'at_grade'),
    structureKind: String(semantics.structureKind || 'none'),
    gradeSeparated: semantics.gradeSeparated === true,
    verticalOrder: finite(semantics.verticalOrder, 0)
  });
}

function makeNodeStore() {
  const nodes = [];
  const byKey = new Map();
  const upsert = (point, role = 'network') => {
    const key = `${Math.round(point.x * 4)},${Math.round(point.y * 4)},${Math.round(point.z * 4)}:${role}`;
    let id = byKey.get(key);
    if (id !== undefined) return id;
    id = nodes.length;
    byKey.set(key, id);
    nodes.push(Object.freeze({ id: `${role}:${id}`, x: point.x, y: point.y, z: point.z, role }));
    return id;
  };
  return { nodes, upsert };
}

function surfaceY(sampleSurface, segment, point, t) {
  if (typeof sampleSurface !== 'function') return finite(point.y, 0);
  const y = sampleSurface(segment.feature, point.x, point.z, {
    x: point.x,
    z: point.z,
    dist: 0,
    segIndex: segment.segIndex,
    t
  });
  return Number.isFinite(y) ? Number(y) : finite(point.y, 0);
}

function edgePointPair(segment, offset, sampleSurface) {
  const dx = segment.p2.x - segment.p1.x;
  const dz = segment.p2.z - segment.p1.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 0.5)) return null;
  const normalX = -dz / length;
  const normalZ = dx / length;
  return {
    p1: {
      x: segment.p1.x + normalX * offset,
      y: surfaceY(sampleSurface, segment, segment.p1, segment.sourceTStart) + 0.08,
      z: segment.p1.z + normalZ * offset
    },
    p2: {
      x: segment.p2.x + normalX * offset,
      y: surfaceY(sampleSurface, segment, segment.p2, segment.sourceTEnd) + 0.08,
      z: segment.p2.z + normalZ * offset
    },
    length,
    normalX,
    normalZ
  };
}

function segmentPriority(segment) {
  const midpointX = (segment.p1.x + segment.p2.x) * 0.5;
  const midpointZ = (segment.p1.z + segment.p2.z) * 0.5;
  return Math.hypot(midpointX, midpointZ);
}

function nearestActivity(segment, anchors = []) {
  const x = (segment.p1.x + segment.p2.x) * .5;
  const z = (segment.p1.z + segment.p2.z) * .5;
  let best = null;
  for (const anchor of anchors) {
    const distance = Math.hypot(finite(anchor?.x) - x, finite(anchor?.z) - z);
    if (distance > 180) continue;
    const score = Math.max(0, finite(anchor?.weight, 1)) * (1 - distance / 220);
    if (!best || score > best.score) best = { score, kind: String(anchor?.kind || 'local-place') };
  }
  return best || { score: 0, kind: '' };
}

function roadHighwayClass(feature) {
  return String(
    feature?.transportRecord?.sourceTags?.highway ||
    feature?.transportRecord?.rawTags?.highway ||
    feature?.type ||
    ''
  ).trim().toLowerCase();
}

function pedestrianSegmentMode(segment) {
  const feature = segment?.feature;
  if (!feature) return '';
  if (feature.walkable === false || feature?.transportGraphRef?.walkable === false) return '';
  if (feature?.transportRecord?.access?.pedestrian === 'prohibited') return '';
  const structure = structureState(feature);
  const ordinaryAtGradeKind = structure.structureKind === 'none' || structure.structureKind === 'at_grade';
  if (structure.terrainMode !== 'at_grade' || !ordinaryAtGradeKind ||
    feature?.structureSemantics?.rampCandidate === true) return '';
  if (featureKind(feature) === 'footway') return 'mapped_path';
  if (featureKind(feature) !== 'road') return '';
  const tags = feature?.transportRecord?.sourceTags || feature?.transportRecord?.rawTags || {};
  const sidewalk = String(tags.sidewalk || '').trim().toLowerCase();
  if (['no', 'none', 'separate'].includes(sidewalk)) return '';
  const highway = roadHighwayClass(feature);
  if (/^(?:motorway|motorway_link|trunk|trunk_link|raceway|construction|proposed)$/.test(highway)) return '';
  if (/^(?:primary|primary_link)$/.test(highway) && !['yes', 'both', 'left', 'right'].includes(sidewalk)) return '';
  return /^(?:secondary|secondary_link|tertiary|tertiary_link|residential|living_street|service|unclassified|road|pedestrian)$/.test(highway)
    ? 'inferred_sidewalk'
    : '';
}

function pedestrianSegmentAllowed(segment) {
  return pedestrianSegmentMode(segment) !== '';
}

export function compilePedestrianGraph(options = {}) {
  const tier = String(options.tier || 'balanced').toLowerCase();
  const budget = GRAPH_BUDGET_BY_TIER[tier] || GRAPH_BUDGET_BY_TIER.balanced;
  const traversalSegments = Array.isArray(options.traversal?.segments) ? options.traversal.segments : [];
  const sourceSegments = traversalSegments
    .filter((segment) => segment?.p1 && segment?.p2 && pedestrianSegmentAllowed(segment) && segmentPriority(segment) <= 900)
    .sort((a, b) => segmentPriority(a) - segmentPriority(b));
  const store = makeNodeStore();
  const edges = [];
  const runtimeFeatureByEdge = new Map();
  const entranceReserve = Math.min(
    Math.floor(budget.pedestrianEdges * 0.24),
    (Array.isArray(options.entrances) ? options.entrances.length : 0) * 2
  );
  const networkEdgeLimit = Math.max(8, budget.pedestrianEdges - entranceReserve);

  const addEdge = (pair, segment, suffix, fromPoint, toPoint, provenance, role = 'sidewalk') => {
    if (edges.length >= networkEdgeLimit && role !== 'entrance') return;
    if (edges.length >= budget.pedestrianEdges) return;
    const from = store.upsert(fromPoint, role);
    const to = store.upsert(toPoint, role);
    const id = `ped:${featureId(segment.feature, 'feature')}:${segment.segIndex}:${suffix}:${edges.length}`;
    const activity = nearestActivity(segment, options.activityAnchors);
    edges.push(Object.freeze({
      id,
      from,
      to,
      p1: Object.freeze({ ...fromPoint }),
      p2: Object.freeze({ ...toPoint }),
      length: Math.hypot(toPoint.x - fromPoint.x, toPoint.z - fromPoint.z),
      role,
      provenance,
      activityScore: Number(activity.score.toFixed(3)),
      activityKind: activity.kind,
      structure: structureState(segment.feature)
    }));
    runtimeFeatureByEdge.set(id, segment.feature);
  };

  for (let index = 0; index < sourceSegments.length && edges.length < networkEdgeLimit; index += 1) {
    const segment = sourceSegments[index];
    const mode = pedestrianSegmentMode(segment);
    const offsets = mode === 'mapped_path' ? [0] : (() => {
      const width = minimumRoadWidthOnInterval(
        segment.feature,
        segment.segIndex,
        segment.sourceTStart,
        segment.sourceTEnd
      );
      const sidewalkOffset = Math.min(8, Math.max(2.4, width * .5 + 1.2));
      const tags = segment.feature?.transportRecord?.sourceTags || segment.feature?.transportRecord?.rawTags || {};
      const sidewalk = String(tags.sidewalk || '').trim().toLowerCase();
      // OSM roadway geometry is the source authority. Where no separately
      // mapped footway exists, publish a clearly attributed inferred sidewalk
      // outside the road cross-section; never claim provider-mapped geometry.
      if (sidewalk === 'left') return [sidewalkOffset];
      if (sidewalk === 'right') return [-sidewalkOffset];
      return [-sidewalkOffset, sidewalkOffset];
    })();
    for (const offset of offsets) {
      if (edges.length >= networkEdgeLimit) break;
      const pair = edgePointPair(segment, offset, options.sampleSurface);
      if (!pair) continue;
      if (typeof options.isBlockedPoint === 'function' && (
        options.isBlockedPoint(pair.p1.x, pair.p1.z) || options.isBlockedPoint(pair.p2.x, pair.p2.z)
      )) continue;
      const side = offset < 0 ? 'right' : offset > 0 ? 'left' : 'mapped';
      addEdge(pair, segment, `${side}:forward`, pair.p1, pair.p2, mode);
      addEdge(pair, segment, `${side}:reverse`, pair.p2, pair.p1, mode);
    }
  }

  for (const entrance of Array.isArray(options.entrances) ? options.entrances : []) {
    if (edges.length + 1 >= budget.pedestrianEdges || store.nodes.length === 0) break;
    let nearest = null;
    for (let index = 0; index < store.nodes.length; index += 1) {
      const node = store.nodes[index];
      if (node.role === 'entrance') continue;
      const distance = Math.hypot(entrance.approachX - node.x, entrance.approachZ - node.z);
      if (!nearest || distance < nearest.distance) nearest = { index, node, distance };
    }
    if (!nearest || nearest.distance > 55) continue;
    const entrancePoint = { x: entrance.approachX, y: entrance.approachY + 0.08, z: entrance.approachZ };
    const entranceNode = store.upsert(entrancePoint, 'entrance');
    const edgeBase = {
      buildingSourceId: entrance.buildingSourceId,
      commercial: entrance.commercial === true,
      activityScore: entrance.commercial === true ? 6 : 2.5,
      activityKind: entrance.commercial === true ? 'storefront' : 'building-entrance',
      role: 'entrance',
      provenance: entrance.provenance
    };
    const outward = Object.freeze({
      id: `ped:${entrance.id}:out`,
      from: entranceNode,
      to: nearest.index,
      p1: Object.freeze(entrancePoint),
      p2: Object.freeze({ x: nearest.node.x, y: nearest.node.y, z: nearest.node.z }),
      length: nearest.distance,
      ...edgeBase
    });
    const inward = Object.freeze({
      ...outward,
      id: `ped:${entrance.id}:in`,
      from: nearest.index,
      to: entranceNode,
      p1: outward.p2,
      p2: outward.p1
    });
    edges.push(outward, inward);
  }

  return Object.freeze({
    publication: Object.freeze({
      type: 'PedestrianGraph',
      schemaVersion: 1,
      nodes: Object.freeze(store.nodes),
      edges: Object.freeze(edges),
      provenance: Object.freeze({
        authority: options.traversal?.authority || 'compiled-traversal',
        mappedPaths: edges.filter((edge) => edge.provenance === 'mapped_path').length,
        inferredSidewalks: edges.filter((edge) => edge.provenance === 'inferred_sidewalk').length,
        inferredCrossings: edges.filter((edge) => edge.provenance === 'inferred_crossing').length,
        entranceConnections: edges.filter((edge) => edge.role === 'entrance').length,
        additionalProviderQueries: 0
      }),
      diagnostics: Object.freeze({
        tier,
        sourceSegments: sourceSegments.length,
        excludedNonPedestrianSegments: traversalSegments.filter((segment) =>
          segment?.p1 && segment?.p2 && !pedestrianSegmentAllowed(segment)
        ).length,
        excludedVehicleTransportSegments: traversalSegments.filter((segment) =>
          segment?.p1 && segment?.p2 && featureKind(segment.feature) === 'road'
        ).length,
        excludedEngineeredTransportSegments: traversalSegments.filter((segment) => {
          if (!segment?.p1 || !segment?.p2) return false;
          const structure = structureState(segment.feature);
          const ordinaryAtGradeKind = structure.structureKind === 'none' || structure.structureKind === 'at_grade';
          return structure.terrainMode !== 'at_grade' || !ordinaryAtGradeKind ||
            segment?.feature?.structureSemantics?.rampCandidate === true;
        }).length,
        edgeLimit: budget.pedestrianEdges
      })
    }),
    runtimeFeatureByEdge
  });
}

export function compileTrafficGraph(options = {}) {
  const tier = String(options.tier || 'balanced').toLowerCase();
  const budget = GRAPH_BUDGET_BY_TIER[tier] || GRAPH_BUDGET_BY_TIER.balanced;
  const sourceSegments = (Array.isArray(options.traversal?.segments) ? options.traversal.segments : [])
    .filter((segment) =>
      segment?.p1 && segment?.p2 &&
      segmentPriority(segment) <= 1200 &&
      segment.feature?.driveable !== false &&
      roadSegmentIsDriveable(
        segment.feature,
        segment.segIndex,
        segment.sourceTStart,
        segment.sourceTEnd
      )
    )
    .sort((a, b) => segmentPriority(a) - segmentPriority(b));
  const store = makeNodeStore();
  const edges = [];
  const runtimeFeatureByEdge = new Map();
  const driveOnLeft = options.driveOnLeft === true;

  const addDirected = (segment, pair, reverse, directionName, roadWidth, laneOffset) => {
    if (edges.length >= budget.trafficEdges) return;
    const p1 = reverse ? pair.p2 : pair.p1;
    const p2 = reverse ? pair.p1 : pair.p2;
    const from = store.upsert(p1, 'lane');
    const to = store.upsert(p2, 'lane');
    const record = segment.feature?.transportRecord;
    const id = `traffic:${featureId(segment.feature, 'feature')}:${segment.segIndex}:${directionName}:${edges.length}`;
    const outwardSign = laneOffset < 0 ? -1 : 1;
    const activity = nearestActivity(segment, options.activityAnchors);
    edges.push(Object.freeze({
      id,
      from,
      to,
      p1: Object.freeze({ ...p1 }),
      p2: Object.freeze({ ...p2 }),
      length: pair.length,
      speedLimit: Math.max(4.5, Math.min(24, finite(record?.speed?.metersPerSecond, finite(segment.feature?.speedLimit, 12.5)))),
      roadWidth,
      laneOffset: Math.abs(laneOffset),
      centerlineOffset: laneOffset,
      // This vector points from the lane center toward its actual outside curb.
      // It is source-geometry data, so downstream parking never has to infer a
      // side from a directed-edge yaw (which flips on reverse lanes).
      curbNormalX: pair.normalX * outwardSign,
      curbNormalZ: pair.normalZ * outwardSign,
      laneCount: Math.max(1, Math.round(finite(record?.crossSection?.lanes, 1))),
      roadClass: String(segment.feature?.type || segment.feature?.networkKind || record?.classification?.highway || 'road'),
      sourceFeatureId: featureId(segment.feature, 'feature'),
      activityScore: Number(activity.score.toFixed(3)),
      activityKind: activity.kind,
      laneProvenance: record?.crossSection?.lanesSource ? 'mapped' : 'inferred',
      direction: directionName,
      sourceDirection: String(segment.direction || 'both'),
      // Preserve the exact source segment that owns this lane. Runtime wheel
      // samples must not re-project onto a nearby hairpin or crossing segment.
      sourceSegIndex: Number(segment.segIndex),
      sourceTStart: Number(segment.sourceTStart),
      sourceTEnd: Number(segment.sourceTEnd),
      structure: structureState(segment.feature),
      surfacePitch: directedSurfacePitch(p1, p2),
      provenance: record?.completeness === 'lossless' ? 'mapped_transport' : 'compiled_transport'
    }));
    runtimeFeatureByEdge.set(id, segment.feature);
  };

  for (const segment of sourceSegments) {
    if (edges.length >= budget.trafficEdges) break;
    const direction = String(segment.direction || 'both');
    const width = minimumRoadWidthOnInterval(
      segment.feature,
      segment.segIndex,
      segment.sourceTStart,
      segment.sourceTEnd
    );
    if (width < MIN_DRIVEABLE_ROAD_WIDTH_METERS) continue;
    const laneOffset = Math.min(2.25, width * 0.24);
    const forwardOffset = driveOnLeft ? laneOffset : -laneOffset;
    const reverseOffset = -forwardOffset;
    if (direction !== 'reverse') {
      const pair = edgePointPair(segment, forwardOffset, options.sampleSurface);
      if (pair) addDirected(segment, pair, false, 'forward', width, forwardOffset);
    }
    if (direction !== 'forward' && edges.length < budget.trafficEdges) {
      const pair = edgePointPair(segment, reverseOffset, options.sampleSurface);
      if (pair) addDirected(segment, pair, true, 'reverse', width, reverseOffset);
    }
  }

  return Object.freeze({
    publication: Object.freeze({
      type: 'TrafficGraph',
      schemaVersion: 2,
      nodes: Object.freeze(store.nodes),
      edges: Object.freeze(edges),
      provenance: Object.freeze({
        authority: options.traversal?.authority || 'compiled-transport',
        mappedLaneEdges: edges.filter((edge) => edge.laneProvenance === 'mapped').length,
        inferredLaneEdges: edges.filter((edge) => edge.laneProvenance === 'inferred').length,
        driveOnLeft,
        additionalProviderQueries: 0
      }),
      diagnostics: Object.freeze({
        tier,
        sourceSegments: sourceSegments.length,
        edgeLimit: budget.trafficEdges,
        slopedEdges: edges.filter((edge) => Math.abs(Number(edge.surfacePitch) || 0) > 0.01).length
      })
    }),
    runtimeFeatureByEdge
  });
}

export { GRAPH_BUDGET_BY_TIER };
