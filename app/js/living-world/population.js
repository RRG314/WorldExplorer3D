import { selectVehicleVariant, VEHICLE_ROOT_TO_GROUND_METERS } from '../engine/vehicle-catalog.js?v=6';
import { resolveVehicleRoadContactPose } from '../engine/vehicle-road-attitude.js?v=2';
import {
  attachCuratedTrafficVehicle,
  disposeCuratedTrafficVehicle
} from '../urban-sandbox/curated-traffic-vehicle.js?v=4';
import {
  attachCuratedExplorerCharacter,
  disposeCuratedCharacter,
  NEARBY_NPC_ASSET_IDS,
  updateCuratedCharacterAnimation
} from '../walking/curated-explorer-character.js?v=7';

const POPULATION_STEP_SECONDS = 1 / 30;

const POPULATION_BUDGET_BY_TIER = Object.freeze({
  low: Object.freeze({ pedestrians: 6, vehicles: 4 }),
  performance: Object.freeze({ pedestrians: 12, vehicles: 8 }),
  balanced: Object.freeze({ pedestrians: 24, vehicles: 14 }),
  quality: Object.freeze({ pedestrians: 38, vehicles: 24 })
});

const POPULATION_VISIBILITY_POLICY = Object.freeze({
  enterDistance: 980,
  exitDistance: 1380,
  fadeInPerSecond: 1.7,
  fadeOutPerSecond: 1.05,
  relocationHideSeconds: 1.25
});

const PEDESTRIAN_ARCHETYPES = Object.freeze([
  Object.freeze({ id: 'city-casual', label: 'City casual', torso: 1, leg: 1, pack: 0 }),
  Object.freeze({ id: 'field-walker', label: 'Field walker', torso: 1.05, leg: 1.04, pack: 1 }),
  Object.freeze({ id: 'commuter', label: 'Commuter', torso: .96, leg: 1.02, pack: .7 }),
  Object.freeze({ id: 'weekend-explorer', label: 'Weekend explorer', torso: 1.08, leg: .96, pack: 1.15 }),
  Object.freeze({ id: 'local-runner', label: 'Local runner', torso: .9, leg: 1.08, pack: 0 }),
  Object.freeze({ id: 'service-worker', label: 'Service worker', torso: 1.04, leg: .98, pack: .3 }),
  Object.freeze({ id: 'office-worker', label: 'Office worker', torso: .97, leg: 1.01, pack: .65 }),
  Object.freeze({ id: 'student', label: 'Student', torso: .94, leg: 1.04, pack: .95 }),
  Object.freeze({ id: 'traveler', label: 'Traveler', torso: 1.02, leg: .97, pack: 1.05 }),
  Object.freeze({ id: 'neighborhood-local', label: 'Neighborhood local', torso: 1.06, leg: .94, pack: 0 })
]);

const OUTFIT_PALETTE = Object.freeze([0x3f5961, 0x8d6048, 0x3f6577, 0x6b7550, 0x73566f, 0x8a783f, 0x48536a]);
const PANTS_PALETTE = Object.freeze([0x202832, 0x34393d, 0x3e4854, 0x443b36, 0x273746]);
const HAIR_PALETTE = Object.freeze([0x171513, 0x38271d, 0x6b4a2f, 0x8b735b, 0x2d2422]);
const VEHICLE_PALETTE = Object.freeze([0x4f7588, 0x718269, 0xa64b41, 0xbdb59d, 0x536270, 0x886d50, 0x705d85, 0xc5b94d]);

function edgeLookup(graph, options = {}) {
  const outgoing = new Map();
  if (!Array.isArray(graph?.edges)) return outgoing;
  for (let index = 0; index < graph.edges.length; index += 1) {
    const edge = graph.edges[index];
    const list = outgoing.get(edge.from) || [];
    list.push(index);
    outgoing.set(edge.from, list);
  }
  if (options.connectNearby !== true) return outgoing;
  for (let index = 0; index < graph.edges.length; index += 1) {
    const edge = graph.edges[index];
    if ((outgoing.get(edge.to) || []).length) continue;
    const heading = Math.atan2(edge.p2.x - edge.p1.x, edge.p2.z - edge.p1.z);
    const candidates = graph.edges.map((candidate, candidateIndex) => {
      if (candidateIndex === index) return null;
      const distance = Math.hypot(candidate.p1.x - edge.p2.x, candidate.p1.z - edge.p2.z);
      if (distance > 18) return null;
      const candidateHeading = Math.atan2(candidate.p2.x - candidate.p1.x, candidate.p2.z - candidate.p1.z);
      const headingDelta = Math.abs(Math.atan2(Math.sin(candidateHeading - heading), Math.cos(candidateHeading - heading)));
      return { candidateIndex, score: distance + headingDelta * 3.5 };
    }).filter(Boolean).sort((left, right) => left.score - right.score);
    if (candidates.length) outgoing.set(edge.to, candidates.slice(0, 3).map((candidate) => candidate.candidateIndex));
  }
  return outgoing;
}

function edgeSpawnWeight(edge, kind) {
  if (kind === 'pedestrian') {
    if (edge.role === 'entrance') return edge.commercial ? 4 : 2;
    if (edge.provenance === 'mapped_path') return 2.2;
    if (edge.role === 'crossing') return .55;
    return 1;
  }
  const roadClass = String(edge.roadClass || '').toLowerCase();
  if (/motorway|trunk|primary/.test(roadClass)) return 2.8;
  if (/secondary|tertiary/.test(roadClass)) return 1.8;
  if (/service|track/.test(roadClass)) return .45;
  return 1;
}

function selectSpawnEdgeIndex(graph, random, kind, reference = null) {
  const allIndexes = graph.edges.map((_, index) => index);
  const localIndexes = reference ? allIndexes.filter((index) => {
    const edge = graph.edges[index];
    const x = (Number(edge?.p1?.x || 0) + Number(edge?.p2?.x || 0)) * .5;
    const z = (Number(edge?.p1?.z || 0) + Number(edge?.p2?.z || 0)) * .5;
    return Math.hypot(x - Number(reference.x || 0), z - Number(reference.z || 0)) <= 720;
  }) : [];
  const indexes = localIndexes.length ? localIndexes : allIndexes;
  const weights = indexes.map((index) => edgeSpawnWeight(graph.edges[index], kind));
  let target = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < weights.length; index += 1) {
    target -= weights[index];
    if (target <= 0) return indexes[index];
  }
  return indexes[0] || 0;
}

function paletteColor(palette, random) {
  return new THREE.Color(palette[Math.floor(random() * palette.length) % palette.length]);
}

function vehicleColor(variant, random) {
  const serviceColors = { taxi: 0xd4b82d, delivery_van: 0xc8c7bd, box_truck: 0xaeb9bd, city_bus: 0x3f6685 };
  return new THREE.Color(serviceColors[variant?.id] || VEHICLE_PALETTE[Math.floor(random() * VEHICLE_PALETTE.length) % VEHICLE_PALETTE.length]);
}

function createAgents(count, graph, random, kind, reference = null) {
  if (!graph?.edges?.length) return [];
  const agents = [];
  for (let index = 0; index < count; index += 1) {
    const edgeIndex = selectSpawnEdgeIndex(graph, random, kind, reference);
    const edge = graph.edges[edgeIndex];
    const variant = kind === 'vehicle'
      ? selectVehicleVariant(random, { majorRoad: /motorway|trunk|primary|secondary/i.test(edge.roadClass || '') })
      : null;
    const archetype = kind === 'pedestrian' ? PEDESTRIAN_ARCHETYPES[Math.floor(random() * PEDESTRIAN_ARCHETYPES.length)] : null;
    const heightScale = kind === 'pedestrian' ? .86 + random() * .28 : 1;
    agents.push({
      id: `${kind}:${index}`,
      edgeIndex,
      progress: (.08 + random() * .78) * edge.length,
      speed: kind === 'vehicle'
        ? Math.min(edge.speedLimit || 12, (6.5 + random() * 5.5) * variant.speedFactor)
        : .8 + random() * .65,
      variant,
      archetype,
      heightScale,
      color: kind === 'vehicle' ? vehicleColor(variant, random) : paletteColor(OUTFIT_PALETTE, random),
      secondaryColor: paletteColor(PANTS_PALETTE, random),
      hairColor: paletteColor(HAIR_PALETTE, random),
      skinColor: kind === 'pedestrian' ? new THREE.Color().setHSL(.045 + random() * .045, .28 + random() * .26, .34 + random() * .42) : null,
      activityAffinity: random(),
      visibility: 0,
      visibleTarget: false,
      relocationCooldown: 0,
      motionTime: random() * Math.PI * 2,
      waiting: false,
      promoted: false,
      detailPromoted: false,
      currentSpeed: null,
      bridge: null,
      reaction: '',
      reactionRemaining: 0,
      reactionTarget: null
    });
  }
  return agents;
}

function agentPose(agent, graph, sampleVehicleSurface = null) {
  const edge = agent.bridge || graph.edges[agent.edgeIndex];
  if (!edge) return null;
  const t = Math.max(0, Math.min(1, agent.progress / Math.max(.01, edge.length)));
  const x = edge.p1.x + (edge.p2.x - edge.p1.x) * t;
  const y = edge.p1.y + (edge.p2.y - edge.p1.y) * t;
  const z = edge.p1.z + (edge.p2.z - edge.p1.z) * t;
  let yaw = Math.atan2(edge.p2.x - edge.p1.x, edge.p2.z - edge.p1.z);
  if (agent.reactionRemaining > 0 && agent.reactionTarget) {
    yaw = Math.atan2(agent.reactionTarget.x - x, agent.reactionTarget.z - z);
  }
  const edgePose = {
    x,
    y,
    z,
    yaw,
    pitch: Number.isFinite(Number(edge.surfacePitch)) ? Number(edge.surfacePitch) : 0,
    roll: 0
  };
  if (!agent.variant || typeof sampleVehicleSurface !== 'function') return edgePose;
  return resolveVehicleRoadContactPose({
    ...edgePose,
    variant: agent.variant,
    sampleSurface: (sampleX, sampleZ) => sampleVehicleSurface(edge, sampleX, sampleZ)
  });
}

function selectSafeRelocationEdge(graph, random, kind, reference) {
  const distant = reference ? graph.edges.map((edge, index) => ({ edge, index })).filter(({ edge }) => {
    const x = (edge.p1.x + edge.p2.x) * .5;
    const z = (edge.p1.z + edge.p2.z) * .5;
    return Math.hypot(x - reference.x, z - reference.z) > 420;
  }) : [];
  if (distant.length) return distant[Math.floor(random() * distant.length) % distant.length].index;
  return selectSpawnEdgeIndex(graph, random, kind);
}

function relocateAgent(agent, graph, random, kind, reference) {
  agent.edgeIndex = selectSafeRelocationEdge(graph, random, kind, reference);
  agent.progress = Math.max(.05, random() * .3) * (graph.edges[agent.edgeIndex]?.length || 1);
  agent.visibleTarget = false;
  agent.relocationCooldown = POPULATION_VISIBILITY_POLICY.relocationHideSeconds;
}

function advanceAgents(agents, graph, outgoing, random, dt, kind, behavior = {}) {
  const occupancy = new Map();
  if (kind === 'vehicle') {
    agents.forEach((agent) => {
      const list = occupancy.get(agent.edgeIndex) || [];
      list.push(agent);
      occupancy.set(agent.edgeIndex, list);
    });
    occupancy.forEach((list) => list.sort((a, b) => b.progress - a.progress));
  }
  for (const agent of agents) {
    if (agent.promoted && !agent.detailPromoted) {
      agent.currentSpeed = 0;
      continue;
    }
    agent.relocationCooldown = Math.max(0, agent.relocationCooldown - dt);
    if (agent.bridge) {
      const bridgeSpeed = agent.speed * .72;
      agent.currentSpeed = bridgeSpeed;
      agent.motionTime += bridgeSpeed * dt * (kind === 'vehicle' ? .42 : 3.1);
      agent.bridge.progress += bridgeSpeed * dt;
      if (agent.bridge.progress >= agent.bridge.length) {
        const overflow = agent.bridge.progress - agent.bridge.length;
        agent.edgeIndex = agent.bridge.nextEdgeIndex;
        agent.progress = overflow;
        agent.bridge = null;
      }
      continue;
    }
    const edge = graph.edges[agent.edgeIndex];
    if (!edge) continue;
    const pose = agentPose(agent, graph, kind === 'vehicle' ? behavior.sampleVehicleSurface : null);
    const reference = behavior.reference;
    const distance = pose && reference ? Math.hypot(pose.x - reference.x, pose.z - reference.z) : 0;
    const stride = kind === 'vehicle' ? 1 : distance > 900 ? 8 : distance > 480 ? 4 : distance > 220 ? 2 : 1;
    if (behavior.tick % stride !== 0) continue;
    let speed = agent.speed;
    if (kind === 'vehicle') {
      const sameEdge = occupancy.get(agent.edgeIndex) || [];
      const rank = sameEdge.indexOf(agent);
      const leader = rank > 0 ? sameEdge[rank - 1] : null;
      if (leader && leader.progress - agent.progress < 7.5) speed *= .12;
      if (edge.structure?.terrainMode === 'subgrade') speed *= .82;
      if (agent.progress > edge.length * .78 && (outgoing.get(edge.to)?.length || 0) > 1) speed *= .55;
      if (reference && pose && Math.hypot(pose.x - reference.x, pose.z - reference.z) < 7) speed *= .12;
    } else {
      if (agent.reactionRemaining > 0) {
        agent.reactionRemaining = Math.max(0, agent.reactionRemaining - dt * stride);
        if (agent.reaction === 'reporting' || agent.reaction === 'watching') speed = 0;
        else if (agent.reaction === 'startled') speed *= 1.65;
        if (agent.reactionRemaining <= 0) {
          agent.reaction = '';
          agent.reactionTarget = null;
        }
      }
      if (edge.role === 'crossing') speed *= behavior.crossingBlocked?.(edge) ? 0 : .86;
    }
    agent.waiting = speed < agent.speed * .5;
    agent.currentSpeed = speed;
    agent.motionTime += speed * dt * stride * (kind === 'vehicle' ? .42 : 3.1);
    agent.progress += speed * dt * stride;
    while (agent.progress >= edge.length) {
      agent.progress -= edge.length;
      const next = outgoing.get(edge.to) || [];
      if (kind === 'pedestrian' && edge.role === 'entrance' && graph.nodes?.[edge.to]?.role === 'entrance') {
        relocateAgent(agent, graph, random, kind, reference);
        agent.virtualizedEntries = Number(agent.virtualizedEntries || 0) + 1;
        break;
      }
      if (next.length === 0) {
        relocateAgent(agent, graph, random, kind, reference);
        break;
      }
      const nextEdgeIndex = next[Math.floor(random() * next.length) % next.length];
      const nextEdge = graph.edges[nextEdgeIndex];
      const gap = nextEdge ? Math.hypot(nextEdge.p1.x - edge.p2.x, nextEdge.p1.z - edge.p2.z) : 0;
      if (nextEdge && gap > .08) {
        agent.bridge = {
          p1: { x: edge.p2.x, y: edge.p2.y, z: edge.p2.z },
          p2: { x: nextEdge.p1.x, y: nextEdge.p1.y, z: nextEdge.p1.z },
          length: gap,
          progress: Math.min(gap, agent.progress),
          nextEdgeIndex
        };
        agent.progress = 0;
        break;
      }
      agent.edgeIndex = nextEdgeIndex;
      if (!nextEdge || agent.progress < nextEdge.length) break;
    }
  }
}

function updateAgentVisibility(agent, distance, activeRatio, dt) {
  const withinDistance = agent.visibleTarget
    ? distance <= POPULATION_VISIBILITY_POLICY.exitDistance
    : distance <= POPULATION_VISIBILITY_POLICY.enterDistance;
  agent.visibleTarget = agent.relocationCooldown <= 0 && withinDistance && agent.activityAffinity <= activeRatio;
  const rate = agent.visibleTarget ? POPULATION_VISIBILITY_POLICY.fadeInPerSecond : POPULATION_VISIBILITY_POLICY.fadeOutPerSecond;
  const target = agent.visibleTarget ? 1 : 0;
  if (agent.visibility < target) agent.visibility = Math.min(target, agent.visibility + rate * dt);
  else if (agent.visibility > target) agent.visibility = Math.max(target, agent.visibility - rate * dt);
}

export function createLivingWorldPopulation(options = {}) {
  const tier = String(options.tier || 'balanced').toLowerCase();
  const budget = POPULATION_BUDGET_BY_TIER[tier] || POPULATION_BUDGET_BY_TIER.balanced;
  const pedestrianGraph = options.pedestrianGraph;
  const trafficGraph = options.trafficGraph;
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const sampleVehicleSurface = typeof options.sampleVehicleSurface === 'function' ? options.sampleVehicleSurface : null;
  const initialReference = options.getReferencePosition?.() || null;
  const pedestrians = createAgents(budget.pedestrians, pedestrianGraph, random, 'pedestrian', initialReference);
  const vehicles = createAgents(budget.vehicles, trafficGraph, random, 'vehicle', initialReference);
  const group = new THREE.Group();
  group.name = 'Living World Population';
  let disposed = false;
  const pedestrianHosts = pedestrians.map((agent, index) => {
    const host = new THREE.Group();
    const assetId = NEARBY_NPC_ASSET_IDS[index % NEARBY_NPC_ASSET_IDS.length];
    host.name = `${agent.archetype.label} curated pedestrian host`;
    host.userData.characterStyle = 'curated-only-local-model';
    host.userData.proceduralCharacterMeshCount = 0;
    host.userData.disposeCuratedCharacter = () => disposeCuratedCharacter(host);
    host.userData.updateCuratedCharacterAnimation = (moving, deltaTime, running) =>
      updateCuratedCharacterAnimation(host, moving, deltaTime, running);
    agent.visualHost = host;
    agent.curatedAssetId = assetId;
    group.add(host);
    void attachCuratedExplorerCharacter(THREE, host, {
      assetId,
      role: 'nearby-npc-character',
      variation: 'ambient-pedestrian',
      failClosed: true,
      palette: {
        uniform: agent.color?.getHex?.(),
        secondary: agent.secondaryColor?.getHex?.()
      },
      isCurrent: () => !disposed && agent.visualHost === host
    });
    return host;
  });
  const vehicleHosts = vehicles.map((agent) => {
    const host = new THREE.Group();
    host.name = `${agent.variant.label || agent.variant.id} curated traffic host`;
    host.userData.vehiclePresentation = 'curated-only-local-model';
    host.userData.proceduralVehicleMeshCount = 0;
    host.userData.disposeCuratedTrafficVehicle = () => disposeCuratedTrafficVehicle(host);
    agent.visualHost = host;
    group.add(host);
    void attachCuratedTrafficVehicle(THREE, host, {
      variantId: agent.variant.id,
      color: agent.color?.getHex?.() ?? 0x566675,
      dimensionsMeters: agent.variant,
      isCurrent: () => !disposed && agent.visualHost === host
    });
    return host;
  });
  const pedestrianOutgoing = edgeLookup(pedestrianGraph);
  const trafficOutgoing = edgeLookup(trafficGraph, { connectNearby: true });
  let accumulator = 0;
  let tick = 0;
  const referencePosition = () => options.getReferencePosition?.() || null;
  const activeRatio = () => {
    const phase = String(options.getTimePhase?.() || 'day');
    return phase === 'night' ? .58 : phase === 'sunrise' || phase === 'sunset' ? .76 : 1;
  };

  const vehicleSnapshot = (agent) => {
    const pose = agentPose(agent, trafficGraph, sampleVehicleSurface);
    if (!pose) return null;
    return Object.freeze({
      id: agent.id,
      x: pose.x,
      y: pose.y,
      z: pose.z,
      yaw: pose.yaw,
      pitch: pose.pitch,
      roll: pose.roll,
      renderedPitch: Number(agent.renderedPitch || 0),
      renderedRoll: Number(agent.renderedRoll || 0),
      renderedGroundY: Number(agent.renderedGroundY || 0),
      wheelContact: agent.wheelContact || null,
      speed: Number(Number.isFinite(agent.currentSpeed) ? agent.currentSpeed : agent.speed || 0),
      visible: agent.detailPromoted === true || agent.visibility > 0.08,
      promoted: agent.promoted === true,
      detailPromoted: agent.detailPromoted === true,
      variant: agent.variant,
      color: agent.color?.getHex?.() ?? 0x566675
    });
  };

  const pedestrianSnapshot = (agent) => {
    const pose = agentPose(agent, pedestrianGraph);
    if (!pose) return null;
    return Object.freeze({
      id: agent.id,
      x: pose.x,
      y: pose.y,
      z: pose.z,
      yaw: pose.yaw,
      visible: agent.visibility > 0.08,
      promoted: agent.promoted === true,
      archetype: agent.archetype?.id || 'pedestrian',
      outfitColor: agent.color?.getHex?.() ?? 0x496673,
      pantsColor: agent.secondaryColor?.getHex?.() ?? 0x29333d,
      hairColor: agent.hairColor?.getHex?.() ?? 0x241d18,
      skinColor: agent.skinColor?.getHex?.() ?? 0x9a6d52,
      heightScale: Number(agent.heightScale || 1),
      reaction: agent.reaction || '',
      reactionRemaining: Number(Math.max(0, agent.reactionRemaining || 0).toFixed(2))
    });
  };

  const updateCuratedPedestrianHosts = (dt = POPULATION_STEP_SECONDS) => {
    const reference = referencePosition();
    const ratio = activeRatio();
    pedestrians.forEach((agent) => {
      const pose = agentPose(agent, pedestrianGraph);
      const host = agent.visualHost;
      if (!pose || !host) return;
      const distance = reference ? Math.hypot(pose.x - reference.x, pose.z - reference.z) : 0;
      if (agent.promoted) {
        agent.visibleTarget = false;
        agent.visibility = 0;
      } else {
        updateAgentVisibility(agent, distance, ratio, dt);
      }
      host.position.set(pose.x, pose.y, pose.z);
      host.rotation.set(0, pose.yaw, 0);
      host.scale.setScalar(Math.max(.001, Number(agent.heightScale || 1) * agent.visibility));
      host.visible = agent.visibility > .01 && agent.promoted !== true;
      host.userData.reaction = String(agent.reaction || '');
      if (host.visible) {
        updateCuratedCharacterAnimation(
          host,
          Number(agent.currentSpeed || 0) > .05,
          dt,
          Number(agent.currentSpeed || 0) > 1.45
        );
      }
    });
  };

  const updateCuratedVehicleHosts = (dt = POPULATION_STEP_SECONDS) => {
    const reference = referencePosition();
    const ratio = activeRatio();
    vehicles.forEach((agent) => {
      const pose = agentPose(agent, trafficGraph, sampleVehicleSurface);
      const host = agent.visualHost;
      if (!pose || !host) return;
      const distance = reference ? Math.hypot(pose.x - reference.x, pose.z - reference.z) : 0;
      if (agent.promoted) {
        agent.visibleTarget = false;
        agent.visibility = 0;
      } else {
        updateAgentVisibility(agent, distance, ratio, dt);
      }
      agent.renderedPitch = Number(pose.pitch || 0);
      agent.renderedRoll = Number(pose.roll || 0);
      agent.renderedGroundY = Number(pose.y || 0);
      agent.wheelContact = Object.freeze({
        authority: String(pose.authority || 'edge-plane-fallback'),
        sampledWheelContacts: Number(pose.sampledWheelContacts || 0),
        maximumWheelPenetration: Number(pose.maximumWheelPenetration || 0),
        maximumWheelGap: Number(pose.maximumWheelGap || 0),
        previousMaximumWheelPenetration: Number(pose.previousMaximumWheelPenetration || 0)
      });
      host.position.set(pose.x, pose.y + VEHICLE_ROOT_TO_GROUND_METERS, pose.z);
      host.rotation.order = 'YXZ';
      host.rotation.set(Number(pose.pitch || 0), pose.yaw, Number(pose.roll || 0));
      host.visible = agent.visibility > .01 && agent.promoted !== true;
      host.scale.setScalar(Math.max(.001, agent.visibility));
    });
  };

  const refreshVehiclePresentation = () => updateCuratedVehicleHosts(POPULATION_STEP_SECONDS);
  updateCuratedPedestrianHosts(.1);
  refreshVehiclePresentation();

  return Object.freeze({
    group,
    diagnostics: Object.freeze({
      tier,
      pedestrians: pedestrians.length,
      vehicles: vehicles.length,
      drawCalls: pedestrianHosts.length + vehicles.length,
      pedestrianRenderedParts: 0,
      pedestrianRepresentation: 'curated-only-local-models',
      pedestrianLegacyBlockFallback: false,
      proceduralPedestrianMeshes: 0,
      curatedPedestrianHosts: pedestrianHosts.length,
      pedestrianPartRoles: Object.freeze([]),
      vehicleRenderedParts: 0,
      vehiclePresentation: 'curated-only-local-models',
      proceduralVehicleMeshes: 0,
      curatedVehicleHosts: vehicleHosts.length,
      simulationHz: 30,
      vehicleAttitudeAuthority: 'published-road-four-wheel-contact',
      visibilityPolicy: POPULATION_VISIBILITY_POLICY,
      characterArchetypes: Object.freeze([...new Set(pedestrians.map((agent) => agent.archetype.id))].sort()),
      vehicleCategories: Object.freeze([...new Set(vehicles.map((agent) => agent.variant.id))].sort()),
      vehicleDimensions: Object.freeze([...new Map(vehicles.map((agent) => [agent.variant.id, Object.freeze({
        id: agent.variant.id,
        width: Number(agent.variant.width),
        height: Number(agent.variant.height),
        length: Number(agent.variant.length)
      })])).values()])
    }),
    nearbyVehicles(reference, radius = 8) {
      const origin = reference || referencePosition();
      if (!origin) return Object.freeze([]);
      const safeRadius = Math.max(1, Math.min(220, Number(radius) || 8));
      return Object.freeze(vehicles.map(vehicleSnapshot).filter((vehicle) => (
        vehicle && !vehicle.promoted && vehicle.visible &&
        Math.hypot(vehicle.x - origin.x, vehicle.z - origin.z) <= safeRadius
      )).sort((a, b) => (
        Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z)
      )));
    },
    nearbyPedestrians(reference, radius = 8) {
      const origin = reference || referencePosition();
      if (!origin) return Object.freeze([]);
      const safeRadius = Math.max(1, Math.min(180, Number(radius) || 8));
      return Object.freeze(pedestrians.map(pedestrianSnapshot).filter((pedestrian) => (
        pedestrian && pedestrian.visible && !pedestrian.promoted &&
        Math.hypot(pedestrian.x - origin.x, pedestrian.z - origin.z) <= safeRadius
      )).sort((a, b) => (
        Math.hypot(a.x - origin.x, a.z - origin.z) - Math.hypot(b.x - origin.x, b.z - origin.z)
      )));
    },
    vehicleSnapshots() {
      return Object.freeze(vehicles.map(vehicleSnapshot).filter(Boolean));
    },
    pedestrianSnapshots() {
      return Object.freeze(pedestrians.map(pedestrianSnapshot).filter(Boolean));
    },
    promotePedestrian(agentId) {
      const agent = pedestrians.find((entry) => entry.id === String(agentId || ''));
      if (!agent || agent.promoted) return null;
      const promoted = pedestrianSnapshot(agent);
      agent.promoted = true;
      agent.visibility = 0;
      agent.visibleTarget = false;
      updateCuratedPedestrianHosts(.1);
      return promoted ? Object.freeze({ ...promoted, promoted: true }) : null;
    },
    releasePedestrian(agentId) {
      const agent = pedestrians.find((entry) => entry.id === String(agentId || ''));
      if (!agent || !agent.promoted) return false;
      agent.promoted = false;
      agent.reaction = '';
      agent.reactionRemaining = 0;
      agent.reactionTarget = null;
      // Restore the same curated actor immediately after close-detail release.
      agent.relocationCooldown = 0;
      agent.visibility = 1;
      agent.visibleTarget = true;
      updateCuratedPedestrianHosts(.1);
      return true;
    },
    retirePedestrian(agentId) {
      const agent = pedestrians.find((entry) => entry.id === String(agentId || ''));
      if (!agent || !agent.promoted) return false;
      agent.promoted = false;
      agent.reaction = '';
      agent.reactionRemaining = 0;
      agent.reactionTarget = null;
      relocateAgent(agent, pedestrianGraph, random, 'pedestrian', referencePosition());
      agent.visibility = 0;
      updateCuratedPedestrianHosts(.1);
      return true;
    },
    witnessEvent(event = {}) {
      const position = event.position;
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return Object.freeze([]);
      const radius = Math.max(4, Math.min(60, Number(event.radius) || 30));
      const audibleRadius = Math.max(0, Math.min(radius, Number(event.audibleRadius) || 8));
      const maximum = Math.max(1, Math.min(4, Number(event.maximumWitnesses) || 3));
      const candidates = pedestrians.map((agent) => {
        const pose = agentPose(agent, pedestrianGraph);
        if (!pose || agent.visibility <= .2) return null;
        const dx = position.x - pose.x;
        const dz = position.z - pose.z;
        const distance = Math.hypot(dx, dz);
        if (distance > radius) return null;
        const facing = distance <= audibleRadius || distance <= .01 ||
          (Math.sin(pose.yaw) * dx + Math.cos(pose.yaw) * dz) / distance >= -0.08;
        if (!facing || options.hasPedestrianLineOfSight?.(pose, position) === false) return null;
        return { agent, pose, distance };
      }).filter(Boolean).sort((a, b) => a.distance - b.distance).slice(0, maximum);
      candidates.forEach(({ agent }, index) => {
        agent.reaction = index === 0 ? 'reporting' : event.kind === 'reckless_driving' ? 'startled' : 'watching';
        agent.reactionRemaining = index === 0 ? 5.5 : 3.8;
        agent.reactionTarget = { x: position.x, z: position.z };
        agent.waiting = agent.reaction !== 'startled';
      });
      if (candidates.length) {
        updateCuratedPedestrianHosts(.1);
      }
      return Object.freeze(candidates.map(({ agent, distance }) => Object.freeze({
        ...pedestrianSnapshot(agent),
        distance: Number(distance.toFixed(2))
      })));
    },
    promoteVehicle(agentId) {
      const agent = vehicles.find((entry) => entry.id === String(agentId || ''));
      if (!agent || agent.promoted && !agent.detailPromoted) return null;
      const promoted = vehicleSnapshot(agent);
      agent.promoted = true;
      agent.detailPromoted = false;
      agent.currentSpeed = 0;
      agent.visibility = 0;
      agent.visibleTarget = false;
      refreshVehiclePresentation();
      return promoted ? Object.freeze({ ...promoted, promoted: true, speed: 0 }) : null;
    },
    promoteVehicleDetail(agentId) {
      const agent = vehicles.find((entry) => entry.id === String(agentId || ''));
      if (!agent || agent.promoted) return null;
      const promoted = vehicleSnapshot(agent);
      agent.promoted = true;
      agent.detailPromoted = true;
      agent.visibility = 0;
      agent.visibleTarget = false;
      refreshVehiclePresentation();
      return promoted ? Object.freeze({ ...promoted, promoted: true, detailPromoted: true }) : null;
    },
    releaseVehicleDetail(agentId) {
      const agent = vehicles.find((entry) => entry.id === String(agentId || ''));
      if (!agent || !agent.detailPromoted) return false;
      agent.promoted = false;
      agent.detailPromoted = false;
      // The detailed and instanced visuals are two LODs of this same agent.
      // Hand the pose back in the same frame instead of fading from zero.
      agent.relocationCooldown = 0;
      agent.visibility = 1;
      agent.visibleTarget = true;
      refreshVehiclePresentation();
      return true;
    },
    retireVehicleDetail(agentId) {
      const agent = vehicles.find((entry) => entry.id === String(agentId || ''));
      if (!agent || !agent.detailPromoted) return false;
      agent.promoted = false;
      agent.detailPromoted = false;
      relocateAgent(agent, trafficGraph, random, 'vehicle', referencePosition());
      agent.visibility = 0;
      refreshVehiclePresentation();
      return true;
    },
    fixedUpdate(dt) {
      accumulator += dt;
      if (accumulator < POPULATION_STEP_SECONDS) return;
      const stepCount = Math.min(4, Math.floor(accumulator / POPULATION_STEP_SECONDS));
      accumulator -= stepCount * POPULATION_STEP_SECONDS;
      for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
        tick += 1;
        const reference = referencePosition();
        advanceAgents(vehicles, trafficGraph, trafficOutgoing, random, POPULATION_STEP_SECONDS, 'vehicle', { reference, tick, sampleVehicleSurface });
        const vehiclePoses = vehicles.map((agent) => agentPose(agent, trafficGraph, sampleVehicleSurface)).filter(Boolean);
        advanceAgents(pedestrians, pedestrianGraph, pedestrianOutgoing, random, POPULATION_STEP_SECONDS, 'pedestrian', {
          reference,
          tick,
          crossingBlocked: (edge) => {
            const x = (edge.p1.x + edge.p2.x) * .5;
            const z = (edge.p1.z + edge.p2.z) * .5;
            return vehiclePoses.some((pose) => Math.hypot(pose.x - x, pose.z - z) < 9);
          }
        });
      }
      updateCuratedPedestrianHosts(stepCount * POPULATION_STEP_SECONDS);
      updateCuratedVehicleHosts(stepCount * POPULATION_STEP_SECONDS);
    },
    activeCounts() {
      const vehicleAttitudeMismatches = vehicles.filter((agent) => {
        const pose = agentPose(agent, trafficGraph, sampleVehicleSurface);
        return pose && (
          Math.abs(Number(agent.renderedPitch || 0) - Number(pose.pitch || 0)) > 0.001 ||
          Math.abs(Number(agent.renderedRoll || 0) - Number(pose.roll || 0)) > 0.001 ||
          Math.abs(Number(agent.renderedGroundY || 0) - Number(pose.y || 0)) > 0.001
        );
      }).length;
      const contactSamples = vehicles.map((agent) => agent.wheelContact).filter((contact) => contact?.sampledWheelContacts === 4);
      return Object.freeze({
        pedestrians: pedestrians.filter((agent) => !agent.promoted && agent.visibility > .08).length,
        vehicles: vehicles.filter((agent) => !agent.promoted && agent.visibility > .08).length,
        promotedPedestrians: pedestrians.filter((agent) => agent.promoted).length,
        promotedVehicles: vehicles.filter((agent) => agent.promoted).length,
        detailedMovingVehicles: vehicles.filter((agent) => agent.detailPromoted).length,
        slopedVehicles: vehicles.filter((agent) => {
          const pose = agentPose(agent, trafficGraph, sampleVehicleSurface);
          return pose && (Math.abs(Number(pose.pitch || 0)) > 0.01 || Math.abs(Number(pose.roll || 0)) > 0.01);
        }).length,
        vehicleAttitudeMismatches,
        fourWheelContactVehicles: contactSamples.length,
        maximumWheelPenetration: Math.max(0, ...contactSamples.map((contact) => Number(contact.maximumWheelPenetration || 0))),
        maximumWheelGap: Math.max(0, ...contactSamples.map((contact) => Number(contact.maximumWheelGap || 0))),
        previousMaximumWheelPenetration: Math.max(0, ...contactSamples.map((contact) => Number(contact.previousMaximumWheelPenetration || 0))),
        entranceVirtualizations: pedestrians.reduce((sum, agent) => sum + Number(agent.virtualizedEntries || 0), 0)
      });
    },
    dispose() {
      disposed = true;
      group.removeFromParent?.();
      vehicles.forEach((agent) => {
        disposeCuratedTrafficVehicle(agent.visualHost);
        agent.visualHost = null;
      });
      pedestrians.forEach((agent) => {
        disposeCuratedCharacter(agent.visualHost);
        agent.visualHost = null;
      });
    }
  });
}

export { PEDESTRIAN_ARCHETYPES, POPULATION_BUDGET_BY_TIER, POPULATION_VISIBILITY_POLICY };
