import { selectNpcVehicleVariant } from './vehicle-catalog.js?v=1';

const POPULATION_BUDGET_BY_TIER = Object.freeze({
  low: Object.freeze({ pedestrians: 6, vehicles: 4 }),
  performance: Object.freeze({ pedestrians: 12, vehicles: 8 }),
  balanced: Object.freeze({ pedestrians: 24, vehicles: 14 }),
  quality: Object.freeze({ pedestrians: 38, vehicles: 24 })
});

function createMesh(geometry, material, count, name) {
  if (count <= 0) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
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
    if (edge.role === 'crossing') return 0.55;
    return 1;
  }
  const roadClass = String(edge.roadClass || '').toLowerCase();
  if (/motorway|trunk|primary/.test(roadClass)) return 2.8;
  if (/secondary|tertiary/.test(roadClass)) return 1.8;
  if (/service|track/.test(roadClass)) return 0.45;
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

function createAgents(count, graph, random, kind) {
  if (!graph?.edges?.length) return [];
  const agents = [];
  for (let index = 0; index < count; index += 1) {
    const edgeIndex = selectSpawnEdgeIndex(graph, random, kind);
    const edge = graph.edges[edgeIndex];
    const variant = kind === 'vehicle'
      ? selectNpcVehicleVariant(random, { majorRoad: /motorway|trunk|primary|secondary/i.test(edge.roadClass || '') })
      : null;
    const heightScale = kind === 'pedestrian' ? 0.86 + random() * 0.28 : 1;
    agents.push({
      id: `${kind}:${index}`,
      edgeIndex,
      progress: (0.08 + random() * 0.78) * edge.length,
      speed: kind === 'vehicle'
        ? Math.min(edge.speedLimit || 12, (6.5 + random() * 5.5) * variant.speedFactor)
        : 0.8 + random() * 0.65,
      variant,
      heightScale,
      color: new THREE.Color().setHSL(random(), kind === 'vehicle' ? 0.62 : 0.42, kind === 'vehicle' ? 0.46 : 0.56),
      skinColor: kind === 'pedestrian' ? new THREE.Color().setHSL(0.055 + random() * 0.035, 0.32 + random() * 0.22, 0.38 + random() * 0.34) : null,
      waiting: false
    });
  }
  return agents;
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
      if (leader && leader.progress - agent.progress < 7.5) speed *= 0.12;
      if (edge.structure?.terrainMode === 'subgrade') speed *= 0.82;
      if (agent.progress > edge.length * 0.78 && (outgoing.get(edge.to)?.length || 0) > 1) speed *= 0.55;
      if (reference && pose && Math.hypot(pose.x - reference.x, pose.z - reference.z) < 7) speed *= 0.12;
    } else if (edge.role === 'crossing') {
      speed *= behavior.crossingBlocked?.(edge) ? 0 : 0.86;
    }
    agent.waiting = speed < agent.speed * 0.5;
    agent.progress += speed * dt * stride;
    while (agent.progress >= edge.length) {
      agent.progress -= edge.length;
      const next = outgoing.get(edge.to) || [];
      if (kind === 'pedestrian' && edge.role === 'entrance' && graph.nodes?.[edge.to]?.role === 'entrance') {
        agent.edgeIndex = Math.floor(random() * graph.edges.length) % graph.edges.length;
        agent.progress = 0;
        agent.virtualizedEntries = Number(agent.virtualizedEntries || 0) + 1;
        break;
      }
      if (next.length === 0) {
        agent.edgeIndex = Math.floor(random() * graph.edges.length) % graph.edges.length;
        agent.progress = 0;
        break;
      }
      agent.edgeIndex = next[Math.floor(random() * next.length) % next.length];
      const nextEdge = graph.edges[agent.edgeIndex];
      if (!nextEdge) break;
      if (agent.progress < nextEdge.length) break;
    }
  }
}

function agentPose(agent, graph) {
  const edge = graph.edges[agent.edgeIndex];
  if (!edge) return null;
  const t = Math.max(0, Math.min(1, agent.progress / Math.max(0.01, edge.length)));
  const x = edge.p1.x + (edge.p2.x - edge.p1.x) * t;
  const y = edge.p1.y + (edge.p2.y - edge.p1.y) * t;
  const z = edge.p1.z + (edge.p2.z - edge.p1.z) * t;
  return { x, y, z, yaw: Math.atan2(edge.p2.x - edge.p1.x, edge.p2.z - edge.p1.z) };
}

function updateInstances(agents, graph, meshes, kind, options = {}) {
  const axis = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  agents.forEach((agent, index) => {
    const pose = agentPose(agent, graph);
    if (!pose) return;
    const reference = options.reference;
    const distance = reference ? Math.hypot(pose.x - reference.x, pose.z - reference.z) : 0;
    const activeRatio = Number(options.activeRatio ?? 1);
    const visible = index < Math.ceil(agents.length * activeRatio) && distance <= 940;
    quaternion.setFromAxisAngle(axis, pose.yaw);
    for (const part of meshes) {
      const dimensions = typeof part.dimensions === 'function'
        ? part.dimensions(agent)
        : { x: part.sx, y: part.sy, z: part.sz, offsetY: part.y };
      position.set(pose.x, pose.y + dimensions.offsetY, pose.z);
      scale.set(
        visible ? dimensions.x : 0,
        visible ? dimensions.y : 0,
        visible ? dimensions.z : 0
      );
      matrix.compose(position, quaternion, scale);
      part.mesh.setMatrixAt(index, matrix);
      if (part.color) part.mesh.setColorAt(index, agent.color);
      if (part.skinColor) part.mesh.setColorAt(index, agent.skinColor);
    }
  });
  meshes.forEach((part) => {
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

  const peopleMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, vertexColors: true });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: true });
  const vehicleMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.18, vertexColors: true });
  const vehicleGlassMaterial = new THREE.MeshStandardMaterial({ color: 0x253844, roughness: 0.34, metalness: 0.35 });
  const pedestrianParts = [
    { mesh: createMesh(new THREE.BoxGeometry(1, 1, 1), peopleMaterial, pedestrians.length, 'Living World Pedestrian Bodies'), color: true, dimensions: (agent) => ({ x: 0.38 + agent.heightScale * 0.05, y: 1.15 * agent.heightScale, z: 0.27, offsetY: 0.88 * agent.heightScale }) },
    { mesh: createMesh(new THREE.SphereGeometry(0.5, 7, 5), skinMaterial, pedestrians.length, 'Living World Pedestrian Heads'), skinColor: true, dimensions: (agent) => ({ x: 0.33, y: 0.36, z: 0.33, offsetY: 1.61 * agent.heightScale }) }
  ].filter((part) => part.mesh);
  const vehicleParts = [
    { mesh: createMesh(new THREE.BoxGeometry(1, 1, 1), vehicleMaterial, vehicles.length, 'Living World Traffic Bodies'), color: true, dimensions: (agent) => ({ x: agent.variant.width, y: agent.variant.height * 0.46, z: agent.variant.length, offsetY: agent.variant.height * 0.26 }) },
    { mesh: createMesh(new THREE.BoxGeometry(1, 1, 1), vehicleGlassMaterial, vehicles.length, 'Living World Traffic Cabins'), dimensions: (agent) => ({ x: agent.variant.width * 0.82, y: agent.variant.height * 0.43, z: agent.variant.length * agent.variant.cabinScale, offsetY: agent.variant.height * 0.67 }) }
  ].filter((part) => part.mesh);
  [...pedestrianParts, ...vehicleParts].forEach((part) => group.add(part.mesh));
  const pedestrianOutgoing = edgeLookup(pedestrianGraph);
  const trafficOutgoing = edgeLookup(trafficGraph);
  let accumulator = 0;
  let tick = 0;
  const referencePosition = () => options.getReferencePosition?.() || null;
  const activeRatio = () => {
    const phase = String(options.getTimePhase?.() || 'day');
    return phase === 'night' ? 0.58 : phase === 'sunrise' || phase === 'sunset' ? 0.76 : 1;
  };
  updateInstances(pedestrians, pedestrianGraph, pedestrianParts, 'pedestrian', { reference: referencePosition(), activeRatio: activeRatio() });
  updateInstances(vehicles, trafficGraph, vehicleParts, 'vehicle', { reference: referencePosition(), activeRatio: activeRatio() });

  return Object.freeze({
    group,
    diagnostics: Object.freeze({
      tier,
      pedestrians: pedestrians.length,
      vehicles: vehicles.length,
      drawCalls: pedestrianParts.length + vehicleParts.length,
      simulationHz: 10,
      vehicleCategories: Object.freeze([...new Set(vehicles.map((agent) => agent.variant.id))].sort())
    }),
    fixedUpdate(dt) {
      accumulator += dt;
      if (accumulator < 0.1) return;
      const step = Math.min(0.2, accumulator);
      accumulator = 0;
      tick += 1;
      const reference = referencePosition();
      advanceAgents(vehicles, trafficGraph, trafficOutgoing, random, step, 'vehicle', { reference, tick });
      const vehiclePoses = vehicles.map((agent) => agentPose(agent, trafficGraph)).filter(Boolean);
      advanceAgents(pedestrians, pedestrianGraph, pedestrianOutgoing, random, step, 'pedestrian', {
        reference,
        tick,
        crossingBlocked: (edge) => {
          const x = (edge.p1.x + edge.p2.x) * 0.5;
          const z = (edge.p1.z + edge.p2.z) * 0.5;
          return vehiclePoses.some((pose) => Math.hypot(pose.x - x, pose.z - z) < 9);
        }
      });
      const ratio = activeRatio();
      updateInstances(pedestrians, pedestrianGraph, pedestrianParts, 'pedestrian', { reference, activeRatio: ratio });
      updateInstances(vehicles, trafficGraph, vehicleParts, 'vehicle', { reference, activeRatio: ratio });
    },
    activeCounts() {
      const ratio = activeRatio();
      return Object.freeze({
        pedestrians: Math.ceil(pedestrians.length * ratio),
        vehicles: Math.ceil(vehicles.length * ratio),
        entranceVirtualizations: pedestrians.reduce((sum, agent) => sum + Number(agent.virtualizedEntries || 0), 0)
      });
    },
    dispose() {
      group.removeFromParent?.();
      [...pedestrianParts, ...vehicleParts].forEach((part) => part.mesh.geometry?.dispose?.());
      peopleMaterial.dispose();
      skinMaterial.dispose();
      vehicleMaterial.dispose();
      vehicleGlassMaterial.dispose();
    }
  });
}

export { POPULATION_BUDGET_BY_TIER };
