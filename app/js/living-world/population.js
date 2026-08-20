import { selectVehicleVariant } from '../engine/vehicle-catalog.js?v=1';
import { createBeveledVehicleBoxGeometry, createTaperedPrismGeometry } from '../engine/classic-utility-car.js?v=3';

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

function createMesh(geometry, material, count, name) {
  if (count <= 0) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  // Population instances move continuously. Static automatic instance bounds can
  // otherwise leave the group culled after actors have moved out of the old bound.
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

function edgeLookup(graph) {
  const outgoing = new Map();
  if (!Array.isArray(graph?.edges)) return outgoing;
  for (let index = 0; index < graph.edges.length; index += 1) {
    const edge = graph.edges[index];
    const list = outgoing.get(edge.from) || [];
    list.push(index);
    outgoing.set(edge.from, list);
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

function selectSpawnEdgeIndex(graph, random, kind) {
  const weights = graph.edges.map((edge) => edgeSpawnWeight(edge, kind));
  let target = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < weights.length; index += 1) {
    target -= weights[index];
    if (target <= 0) return index;
  }
  return 0;
}

function paletteColor(palette, random) {
  return new THREE.Color(palette[Math.floor(random() * palette.length) % palette.length]);
}

function vehicleColor(variant, random) {
  const serviceColors = { taxi: 0xd4b82d, delivery_van: 0xc8c7bd, box_truck: 0xaeb9bd, city_bus: 0x3f6685 };
  return new THREE.Color(serviceColors[variant?.id] || VEHICLE_PALETTE[Math.floor(random() * VEHICLE_PALETTE.length) % VEHICLE_PALETTE.length]);
}

function createAgents(count, graph, random, kind) {
  if (!graph?.edges?.length) return [];
  const agents = [];
  for (let index = 0; index < count; index += 1) {
    const edgeIndex = selectSpawnEdgeIndex(graph, random, kind);
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
      reaction: '',
      reactionRemaining: 0,
      reactionTarget: null
    });
  }
  return agents;
}

function agentPose(agent, graph) {
  const edge = graph.edges[agent.edgeIndex];
  if (!edge) return null;
  const t = Math.max(0, Math.min(1, agent.progress / Math.max(.01, edge.length)));
  const x = edge.p1.x + (edge.p2.x - edge.p1.x) * t;
  const y = edge.p1.y + (edge.p2.y - edge.p1.y) * t;
  const z = edge.p1.z + (edge.p2.z - edge.p1.z) * t;
  let yaw = Math.atan2(edge.p2.x - edge.p1.x, edge.p2.z - edge.p1.z);
  if (agent.reactionRemaining > 0 && agent.reactionTarget) {
    yaw = Math.atan2(agent.reactionTarget.x - x, agent.reactionTarget.z - z);
  }
  return { x, y, z, yaw };
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
    const edge = graph.edges[agent.edgeIndex];
    if (!edge) continue;
    const pose = agentPose(agent, graph);
    const reference = behavior.reference;
    const distance = pose && reference ? Math.hypot(pose.x - reference.x, pose.z - reference.z) : 0;
    const stride = distance > 900 ? 8 : distance > 480 ? 4 : distance > 220 ? 2 : 1;
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
      agent.edgeIndex = next[Math.floor(random() * next.length) % next.length];
      const nextEdge = graph.edges[agent.edgeIndex];
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

function localTransform(pose, transform, visibility, output) {
  const yaw = pose.yaw;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const x = Number(transform.x || 0);
  const z = Number(transform.z || 0);
  output.position.set(pose.x + x * cos + z * sin, pose.y + Number(transform.y || 0), pose.z - x * sin + z * cos);
  output.baseQuaternion.setFromAxisAngle(output.yAxis, yaw);
  output.localQuaternion.setFromEuler(output.euler.set(Number(transform.rx || 0), Number(transform.ry || 0), Number(transform.rz || 0), 'XYZ'));
  output.quaternion.multiplyQuaternions(output.baseQuaternion, output.localQuaternion);
  const visibleScale = Math.max(.001, visibility);
  output.scale.set(Number(transform.sx || 1) * visibleScale, Number(transform.sy || 1) * visibleScale, Number(transform.sz || 1) * visibleScale);
  output.matrix.compose(output.position, output.quaternion, output.scale);
  return output.matrix;
}

function pedestrianTransform(role, agent, slot = 0) {
  const h = agent.heightScale;
  const swing = agent.waiting ? 0 : Math.sin(agent.motionTime) * .55;
  const side = slot === 0 ? -1 : 1;
  const torso = agent.archetype.torso;
  if (role === 'torso') return { y: .97 * h, sx: .44 * torso, sy: .64 * h, sz: .28 };
  if (role === 'head') return { y: 1.51 * h, sx: .34, sy: .38, sz: .34 };
  if (role === 'face') return { y: 1.49 * h, z: .16, sx: .23, sy: .27, sz: .055 };
  if (role === 'eyes') {
    const side = slot === 0 ? -1 : 1;
    return { x: side * .085, y: 1.54 * h, z: .206, sx: .032, sy: .038, sz: .022 };
  }
  if (role === 'hair') return { y: 1.66 * h, sx: .35, sy: .14, sz: .35 };
  if (role === 'waist') return { y: .7 * h, sx: .4 * torso, sy: .12 * h, sz: .29 };
  if (role === 'arms') {
    if (agent.reaction === 'reporting' && side > 0) return { x: .28 * torso, y: 1.08 * h, z: .12, sx: .115, sy: .5 * h, sz: .115, rx: -1.12 };
    return { x: side * .29 * torso, y: .98 * h, sx: .115, sy: .5 * h, sz: .115, rx: -side * swing };
  }
  if (role === 'hands') {
    if (agent.reaction === 'reporting' && side > 0) return { x: .29 * torso, y: 1.18 * h, z: .27, sx: .12, sy: .13, sz: .12 };
    return { x: side * .29 * torso, y: .69 * h, z: side * swing * .11, sx: .12, sy: .13, sz: .12 };
  }
  if (role === 'legs') return { x: side * .12, y: .42 * h, z: side * swing * .09, sx: .16, sy: .58 * h * agent.archetype.leg, sz: .17, rx: side * swing };
  if (role === 'shoes') return { x: side * .12, y: .1, z: .07 + side * swing * .11, sx: .2, sy: .14, sz: .34 };
  if (role === 'phone') return agent.reaction === 'reporting'
    ? { x: .3 * torso, y: 1.2 * h, z: .33, sx: .075, sy: .15, sz: .035, rx: -.2 }
    : { sx: 0, sy: 0, sz: 0 };
  return { y: 1.02 * h, z: -.2, sx: .36 * agent.archetype.pack, sy: .48 * h * agent.archetype.pack, sz: .16 * agent.archetype.pack };
}

function vehicleLayout(agent) {
  const variant = agent.variant;
  const style = variant.bodyStyle || variant.id;
  const length = variant.length;
  const height = variant.height;
  const truck = style === 'box-truck';
  const bus = style === 'bus';
  const pickup = style === 'pickup';
  const van = style === 'van';
  const suv = style === 'suv';
  const cabinLength = bus ? length * .88 : truck ? length * .24 : pickup ? length * .34 : van ? length * .7 : suv ? length * .58 : length * .47;
  const cabinZ = truck ? length * .31 : pickup ? length * .17 : van ? -length * .04 : -length * .07;
  const cabinHeight = bus ? height * .7 : truck ? height * .55 : van ? height * .62 : suv ? height * .53 : height * .46;
  return { variant, style, length, height, truck, bus, pickup, van, suv, cabinLength, cabinZ, cabinHeight };
}

function vehicleTransform(role, agent, slot = 0) {
  const l = vehicleLayout(agent);
  const width = l.variant.width;
  const wheelRadius = l.variant.wheelRadius || Math.min(.5, l.height * .23);
  const bodyBottom = wheelRadius * .42;
  const bodyTop = Math.min(l.height * (l.bus ? .34 : l.truck ? .33 : l.van ? .42 : l.suv || l.pickup ? .46 : .5), l.height - .42);
  const bodyHeight = Math.max(.42, bodyTop - bodyBottom);
  const cabinBottom = bodyTop - .08;
  const cabinHeight = Math.max(.32, l.height - cabinBottom - .055);
  const cabinY = cabinBottom + cabinHeight * .5;
  if (role === 'body') return { y: bodyBottom + bodyHeight * .5, sx: width, sy: bodyHeight, sz: l.length };
  if (role === 'cabin') return { y: cabinY, z: l.cabinZ, sx: width * .86, sy: cabinHeight, sz: l.cabinLength };
  if (role === 'glass') return { y: cabinY + cabinHeight * .04, z: l.cabinZ + (l.truck ? .04 : 0), sx: width * .875, sy: Math.max(.24, cabinHeight * .48), sz: l.cabinLength * .82 };
  if (role === 'detail') {
    if (l.bus) return slot === 0
      ? { y: l.height - .045, sx: width * .82, sy: .09, sz: l.length * .78 }
      : { y: bodyTop - .08, z: -l.length * .49, sx: width * .86, sy: .12, sz: .08 };
    if (l.truck) return slot === 0
      ? { y: cabinBottom + (l.height - cabinBottom - .055) * .5, z: -l.length * .15, sx: width * .95, sy: l.height - cabinBottom - .055, sz: l.length * .58 }
      : { y: bodyTop - .08, z: l.length * .47, sx: width * .9, sy: .16, sz: l.length * .1 };
    if (l.pickup) return slot === 0
      ? { y: bodyTop - bodyHeight * .25, z: -l.length * .33, sx: width * .92, sy: bodyHeight * .5, sz: l.length * .34 }
      : { y: bodyTop - bodyHeight * .18, z: l.length * .39, sx: width * .88, sy: bodyHeight * .36, sz: l.length * .19 };
    return slot === 0
      ? { y: bodyTop - bodyHeight * .19, z: l.length * .39, sx: width * .88, sy: bodyHeight * .38, sz: l.length * .2 }
      : { y: bodyTop - bodyHeight * .2, z: -l.length * .43, sx: width * .86, sy: bodyHeight * .34, sz: l.length * .13 };
  }
  if (role === 'wheels') {
    const side = slot % 2 === 0 ? -1 : 1;
    const front = slot < 2 ? 1 : -1;
    return { x: side * width * .43, y: wheelRadius, z: front * l.length * (l.bus ? .35 : l.truck ? .34 : .3), sx: wheelRadius, sy: width * .12, sz: wheelRadius, rz: Math.PI / 2, rx: agent.motionTime };
  }
  if (role === 'bumpers') {
    const front = slot === 0 ? 1 : -1;
    return { y: bodyTop - bodyHeight * .62, z: front * (l.length * .49 - .08), sx: width * .96, sy: .16, sz: .16 };
  }
  if (role === 'mirrors') {
    const side = slot === 0 ? -1 : 1;
    return {
      x: side * width * .46,
      y: cabinY + cabinHeight * .08,
      z: l.cabinZ + l.cabinLength * .27,
      sx: .11,
      sy: .13,
      sz: .2
    };
  }
  if (role === 'headlights' || role === 'taillights') {
    const side = slot === 0 ? -1 : 1;
    const front = role === 'headlights' ? 1 : -1;
    return { x: side * width * .3, y: bodyTop - bodyHeight * .34, z: front * (l.length * .49 - .0275), sx: .22, sy: .14, sz: .055 };
  }
  return { y: 0, sx: 0, sy: 0, sz: 0 };
}

function createPart(spec, material, agentCount, name) {
  const repeats = spec.repeats || 1;
  const mesh = createMesh(spec.geometry, material, agentCount * repeats, name);
  return mesh ? { ...spec, mesh, repeats } : null;
}

function updateInstances(agents, graph, parts, kind, options = {}) {
  const output = {
    position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), baseQuaternion: new THREE.Quaternion(),
    localQuaternion: new THREE.Quaternion(), scale: new THREE.Vector3(), matrix: new THREE.Matrix4(),
    yAxis: new THREE.Vector3(0, 1, 0), euler: new THREE.Euler()
  };
  const reference = options.reference;
  const activeRatio = Number(options.activeRatio ?? 1);
  const dt = Math.max(.016, Number(options.dt) || .1);
  agents.forEach((agent, agentIndex) => {
    const pose = agentPose(agent, graph);
    if (!pose) return;
    const distance = reference ? Math.hypot(pose.x - reference.x, pose.z - reference.z) : 0;
    if (agent.promoted) {
      agent.visibleTarget = false;
      agent.visibility = 0;
    } else {
      updateAgentVisibility(agent, distance, activeRatio, dt);
    }
    for (const part of parts) {
      for (let slot = 0; slot < part.repeats; slot += 1) {
        const instanceIndex = agentIndex * part.repeats + slot;
        const transform = kind === 'pedestrian' ? pedestrianTransform(part.role, agent, slot) : vehicleTransform(part.role, agent, slot);
        part.mesh.setMatrixAt(instanceIndex, localTransform(pose, transform, agent.visibility, output));
        const color = part.colorKey ? agent[part.colorKey] : null;
        if (color) part.mesh.setColorAt(instanceIndex, color);
      }
    }
  });
  parts.forEach((part) => {
    part.mesh.instanceMatrix.needsUpdate = true;
    if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
  });
}

export function createLivingWorldPopulation(options = {}) {
  const tier = String(options.tier || 'balanced').toLowerCase();
  const budget = POPULATION_BUDGET_BY_TIER[tier] || POPULATION_BUDGET_BY_TIER.balanced;
  const pedestrianGraph = options.pedestrianGraph;
  const trafficGraph = options.trafficGraph;
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const pedestrians = createAgents(budget.pedestrians, pedestrianGraph, random, 'pedestrian');
  const vehicles = createAgents(budget.vehicles, trafficGraph, random, 'vehicle');
  const group = new THREE.Group();
  group.name = 'Living World Population';

  const materials = {
    // Ambient people must remain readable before close-detail promotion. A
    // modest light floor prevents daylight shadows/night lighting from
    // collapsing the articulated instanced character into a black two-block
    // silhouette while retaining per-instance outfit and skin colors.
    outfit: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x31434a, emissiveIntensity: .42, roughness: .86, metalness: .02, vertexColors: true }),
    skin: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x4b2c21, emissiveIntensity: .38, roughness: .9, vertexColors: true }),
    cloth: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x2b343a, emissiveIntensity: .34, roughness: .92, metalness: .01, vertexColors: true }),
    hair: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x211915, emissiveIntensity: .3, roughness: .94, vertexColors: true }),
    gear: new THREE.MeshStandardMaterial({ color: 0x53636a, emissive: 0x25343a, emissiveIntensity: .28, roughness: .88, metalness: .03, flatShading: true }),
    device: new THREE.MeshStandardMaterial({ color: 0x18242b, emissive: 0x1c5d82, emissiveIntensity: .38, roughness: .48, metalness: .2, flatShading: true }),
    vehicle: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x26343d, emissiveIntensity: .24, roughness: .54, metalness: .24, vertexColors: true }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2d4b59, emissive: 0x101a1f, emissiveIntensity: .18, roughness: .26, metalness: .3 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151819, roughness: .96, metalness: .01 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x3d4549, roughness: .74, metalness: .34 }),
    headlight: new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffd37a, emissiveIntensity: .38, roughness: .28 }),
    taillight: new THREE.MeshStandardMaterial({ color: 0xb72e2a, emissive: 0x87120f, emissiveIntensity: .42, roughness: .32 })
  };
  const pedestrianParts = [
    createPart({ role: 'torso', geometry: createTaperedPrismGeometry(THREE, { widthBottom: 1, widthTop: .86, height: 1, length: 1, frontInset: .03, rearInset: .03 }), colorKey: 'color' }, materials.outfit, pedestrians.length, 'Living World Pedestrian Bodies'),
    createPart({ role: 'head', geometry: new THREE.SphereGeometry(.5, 8, 6), colorKey: 'skinColor' }, materials.skin, pedestrians.length, 'Living World Pedestrian Heads'),
    createPart({ role: 'face', geometry: new THREE.SphereGeometry(.5, 8, 5), colorKey: 'skinColor' }, materials.skin, pedestrians.length, 'Living World Pedestrian Faces'),
    createPart({ role: 'eyes', repeats: 2, geometry: new THREE.SphereGeometry(.5, 6, 4) }, materials.device, pedestrians.length, 'Living World Pedestrian Eyes'),
    createPart({ role: 'hair', geometry: new THREE.SphereGeometry(.5, 8, 4), colorKey: 'hairColor' }, materials.hair, pedestrians.length, 'Living World Pedestrian Hair'),
    createPart({ role: 'waist', geometry: createTaperedPrismGeometry(THREE, { widthBottom: .9, widthTop: 1, height: 1, length: .92, frontInset: .03, rearInset: .03 }), colorKey: 'secondaryColor' }, materials.cloth, pedestrians.length, 'Living World Pedestrian Waist Details'),
    createPart({ role: 'arms', repeats: 2, geometry: new THREE.CylinderGeometry(.5, .43, 1, 6), colorKey: 'color' }, materials.outfit, pedestrians.length, 'Living World Pedestrian Arms'),
    createPart({ role: 'hands', repeats: 2, geometry: new THREE.SphereGeometry(.5, 6, 4), colorKey: 'skinColor' }, materials.skin, pedestrians.length, 'Living World Pedestrian Hands'),
    createPart({ role: 'legs', repeats: 2, geometry: new THREE.CylinderGeometry(.48, .42, 1, 6), colorKey: 'secondaryColor' }, materials.cloth, pedestrians.length, 'Living World Pedestrian Legs'),
    createPart({ role: 'shoes', repeats: 2, geometry: createBeveledVehicleBoxGeometry(THREE, 1, 1, 1, .18) }, materials.gear, pedestrians.length, 'Living World Pedestrian Shoes'),
    createPart({ role: 'gear', geometry: createTaperedPrismGeometry(THREE, { widthBottom: .92, widthTop: .82, height: 1, length: 1, frontInset: .06, rearInset: .06 }) }, materials.gear, pedestrians.length, 'Living World Pedestrian Gear'),
    createPart({ role: 'phone', geometry: new THREE.BoxGeometry(1, 1, 1) }, materials.device, pedestrians.length, 'Living World Pedestrian Reaction Props')
  ].filter(Boolean);
  const vehicleParts = [
    createPart({ role: 'body', geometry: createBeveledVehicleBoxGeometry(THREE, 1, 1, 1, .15), colorKey: 'color' }, materials.vehicle, vehicles.length, 'Living World Traffic Rounded Bodies'),
    createPart({ role: 'cabin', geometry: createTaperedPrismGeometry(THREE, { widthBottom: 1, widthTop: .82, height: 1, length: 1, frontInset: .13, rearInset: .08 }), colorKey: 'color' }, materials.vehicle, vehicles.length, 'Living World Traffic Cabins'),
    createPart({ role: 'glass', geometry: new THREE.BoxGeometry(1, 1, 1) }, materials.glass, vehicles.length, 'Living World Traffic Windows'),
    createPart({ role: 'detail', repeats: 2, geometry: new THREE.BoxGeometry(1, 1, 1), colorKey: 'color' }, materials.vehicle, vehicles.length, 'Living World Traffic Body Details'),
    createPart({ role: 'wheels', repeats: 4, geometry: new THREE.CylinderGeometry(1, 1, 1, 16) }, materials.rubber, vehicles.length, 'Living World Traffic Wheels'),
    createPart({ role: 'bumpers', repeats: 2, geometry: new THREE.BoxGeometry(1, 1, 1) }, materials.trim, vehicles.length, 'Living World Traffic Bumpers'),
    createPart({ role: 'mirrors', repeats: 2, geometry: new THREE.BoxGeometry(1, 1, 1) }, materials.trim, vehicles.length, 'Living World Traffic Mirrors'),
    createPart({ role: 'headlights', repeats: 2, geometry: new THREE.BoxGeometry(1, 1, 1) }, materials.headlight, vehicles.length, 'Living World Traffic Headlights'),
    createPart({ role: 'taillights', repeats: 2, geometry: new THREE.BoxGeometry(1, 1, 1) }, materials.taillight, vehicles.length, 'Living World Traffic Taillights')
  ].filter(Boolean);
  [...pedestrianParts, ...vehicleParts].forEach((part) => group.add(part.mesh));
  const pedestrianOutgoing = edgeLookup(pedestrianGraph);
  const trafficOutgoing = edgeLookup(trafficGraph);
  let accumulator = 0;
  let tick = 0;
  const referencePosition = () => options.getReferencePosition?.() || null;
  const activeRatio = () => {
    const phase = String(options.getTimePhase?.() || 'day');
    return phase === 'night' ? .58 : phase === 'sunrise' || phase === 'sunset' ? .76 : 1;
  };
  updateInstances(pedestrians, pedestrianGraph, pedestrianParts, 'pedestrian', { reference: referencePosition(), activeRatio: activeRatio(), dt: .1 });
  updateInstances(vehicles, trafficGraph, vehicleParts, 'vehicle', { reference: referencePosition(), activeRatio: activeRatio(), dt: .1 });

  const vehicleSnapshot = (agent) => {
    const pose = agentPose(agent, trafficGraph);
    if (!pose) return null;
    return Object.freeze({
      id: agent.id,
      x: pose.x,
      y: pose.y,
      z: pose.z,
      yaw: pose.yaw,
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

  const refreshVehiclePresentation = () => updateInstances(
    vehicles,
    trafficGraph,
    vehicleParts,
    'vehicle',
    { reference: referencePosition(), activeRatio: activeRatio(), dt: .1 }
  );

  return Object.freeze({
    group,
    diagnostics: Object.freeze({
      tier,
      pedestrians: pedestrians.length,
      vehicles: vehicles.length,
      drawCalls: pedestrianParts.length + vehicleParts.length,
      pedestrianRenderedParts: pedestrianParts.reduce((sum, part) => sum + Number(part.repeats || 1), 0),
      pedestrianRepresentation: 'articulated-instanced-character-v2',
      pedestrianLegacyBlockFallback: false,
      pedestrianPartRoles: Object.freeze(pedestrianParts.map((part) => part.role)),
      vehicleRenderedParts: vehicleParts.reduce((sum, part) => sum + Number(part.repeats || 1), 0),
      simulationHz: 10,
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
      updateInstances(pedestrians, pedestrianGraph, pedestrianParts, 'pedestrian', {
        reference: referencePosition(), activeRatio: activeRatio(), dt: .1
      });
      return promoted ? Object.freeze({ ...promoted, promoted: true }) : null;
    },
    releasePedestrian(agentId) {
      const agent = pedestrians.find((entry) => entry.id === String(agentId || ''));
      if (!agent || !agent.promoted) return false;
      agent.promoted = false;
      agent.reaction = '';
      agent.reactionRemaining = 0;
      agent.reactionTarget = null;
      // Restore the already-positioned instanced actor immediately so a LOD
      // release cannot create a visible empty beat.
      agent.relocationCooldown = 0;
      agent.visibility = 1;
      agent.visibleTarget = true;
      updateInstances(pedestrians, pedestrianGraph, pedestrianParts, 'pedestrian', {
        reference: referencePosition(), activeRatio: activeRatio(), dt: .1
      });
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
        updateInstances(pedestrians, pedestrianGraph, pedestrianParts, 'pedestrian', {
          reference: referencePosition(), activeRatio: activeRatio(), dt: .1
        });
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
    fixedUpdate(dt) {
      accumulator += dt;
      if (accumulator < .1) return;
      const step = Math.min(.2, accumulator);
      accumulator = 0;
      tick += 1;
      const reference = referencePosition();
      advanceAgents(vehicles, trafficGraph, trafficOutgoing, random, step, 'vehicle', { reference, tick });
      const vehiclePoses = vehicles.map((agent) => agentPose(agent, trafficGraph)).filter(Boolean);
      advanceAgents(pedestrians, pedestrianGraph, pedestrianOutgoing, random, step, 'pedestrian', {
        reference,
        tick,
        crossingBlocked: (edge) => {
          const x = (edge.p1.x + edge.p2.x) * .5;
          const z = (edge.p1.z + edge.p2.z) * .5;
          return vehiclePoses.some((pose) => Math.hypot(pose.x - x, pose.z - z) < 9);
        }
      });
      const ratio = activeRatio();
      updateInstances(pedestrians, pedestrianGraph, pedestrianParts, 'pedestrian', { reference, activeRatio: ratio, dt: step });
      updateInstances(vehicles, trafficGraph, vehicleParts, 'vehicle', { reference, activeRatio: ratio, dt: step });
    },
    activeCounts() {
      return Object.freeze({
        pedestrians: pedestrians.filter((agent) => !agent.promoted && agent.visibility > .08).length,
        vehicles: vehicles.filter((agent) => !agent.promoted && agent.visibility > .08).length,
        promotedPedestrians: pedestrians.filter((agent) => agent.promoted).length,
        promotedVehicles: vehicles.filter((agent) => agent.promoted).length,
        detailedMovingVehicles: vehicles.filter((agent) => agent.detailPromoted).length,
        entranceVirtualizations: pedestrians.reduce((sum, agent) => sum + Number(agent.virtualizedEntries || 0), 0)
      });
    },
    dispose() {
      group.removeFromParent?.();
      [...pedestrianParts, ...vehicleParts].forEach((part) => part.mesh.geometry?.dispose?.());
      Object.values(materials).forEach((material) => material.dispose());
    }
  });
}

export { PEDESTRIAN_ARCHETYPES, POPULATION_BUDGET_BY_TIER, POPULATION_VISIBILITY_POLICY };
