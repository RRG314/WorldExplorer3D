import { deterministicUnit } from './model.js?v=1';
import { animateAnimalModel, createAnimalModel } from './animal-models.js?v=1';
import { sampleDiscoverySurfaceY } from './surface.js?v=1';

const WILDLIFE_CONTEXTS = new Set(['urban', 'urban-core', 'park', 'field', 'forest', 'wetland', 'riverbank', 'fresh-water', 'coast', 'mountain', 'desert']);

function archetypeForCell(cell, seed) {
  const contexts = new Set(cell.contexts || []);
  if (contexts.has('fresh-water') || contexts.has('wetland') || contexts.has('coast')) return 'waterbird';
  if (contexts.has('urban') || contexts.has('urban-core')) return deterministicUnit(`${seed}:domestic`) > 0.55 ? 'domestic-wanderer' : 'flying-bird';
  if (contexts.has('forest') || contexts.has('field') || contexts.has('park')) return deterministicUnit(`${seed}:ground`) > 0.46 ? 'small-mammal' : 'flying-bird';
  return 'flying-bird';
}

function compileAmbientWildlifePlan(environment, options = {}) {
  if (environment?.type !== 'EnvironmentContextPublication') throw new TypeError('Ambient wildlife requires an EnvironmentContextPublication.');
  const maxActors = Math.max(0, Math.min(12, Number(options.maxActors) || 8));
  const actors = [];
  const candidateCells = environment.cells.slice().sort((a, b) =>
    Math.hypot(a.center.x, a.center.z) - Math.hypot(b.center.x, b.center.z) || a.cellId.localeCompare(b.cellId)
  );
  for (const cell of candidateCells) {
    if (actors.length >= maxActors || !cell.contexts.some((context) => WILDLIFE_CONTEXTS.has(context))) continue;
    const seed = `${environment.worldIdentity.id}|ambient-wildlife-v1|${cell.cellId}`;
    if (deterministicUnit(`${seed}:presence`) < 0.16) continue;
    const margin = 0.22;
    const x = cell.bounds.minX + (cell.bounds.maxX - cell.bounds.minX) * (margin + deterministicUnit(`${seed}:x`) * (1 - margin * 2));
    const z = cell.bounds.minZ + (cell.bounds.maxZ - cell.bounds.minZ) * (margin + deterministicUnit(`${seed}:z`) * (1 - margin * 2));
    const archetype = archetypeForCell(cell, seed);
    actors.push(Object.freeze({
      id: `wildlife:${cell.cellId}:${actors.length}`,
      cellId: cell.cellId,
      archetype,
      speciesId: archetype === 'domestic-wanderer' ? 'trail-hound' : archetype === 'waterbird' ? 'mallard' : archetype === 'small-mammal' ? 'small-mammal' : 'rock-pigeon',
      label: archetype === 'domestic-wanderer' ? 'Virtual trail hound' : archetype === 'waterbird' ? 'Procedural mallard encounter' : archetype === 'small-mammal' ? 'Procedural small mammal encounter' : 'Procedural rock pigeon encounter',
      home: Object.freeze({ x, z }),
      phase: deterministicUnit(`${seed}:phase`) * Math.PI * 2,
      evidenceClass: 'procedural-game-encounter',
      supportingEvidence: Object.freeze(['habitat-plausible']),
      companionPolicy: archetype === 'domestic-wanderer' ? 'trust-sequence-required' : 'observe-only'
    }));
  }
  return Object.freeze({
    type: 'AmbientWildlifePlan', schemaVersion: 1,
    requestId: environment.requestId, sequence: environment.sequence,
    worldIdentity: environment.worldIdentity,
    actors: Object.freeze(actors),
    diagnostics: Object.freeze({ logicalActors: actors.length, maxActors, generatedWithAdditionalProviderQueries: false })
  });
}

function disposeObject(object) {
  object?.parent?.remove?.(object);
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material?.dispose?.();
  });
}

function createActorMesh(THREE, actor) {
  const group = createAnimalModel(THREE, actor.speciesId);
  group.name = `World Discovery ${actor.label}`;
  group.scale.setScalar(actor.archetype === 'domestic-wanderer' ? .62 : actor.archetype === 'small-mammal' ? .7 : actor.archetype === 'waterbird' ? .7 : .68);
  group.userData.worldDiscoveryWildlife = { id: actor.id, evidenceClass: actor.evidenceClass };
  return { group, profile: group.userData.performanceProfile || {} };
}

function createAmbientWildlifeRuntime(appCtx, plan) {
  const THREE = globalThis.THREE;
  if (!THREE || plan?.type !== 'AmbientWildlifePlan') return Object.freeze({ update() {}, dispose() {}, snapshot: () => ({ active: 0, logical: plan?.actors?.length || 0 }) });
  const presentations = plan.actors.map((actor) => {
    const mesh = createActorMesh(THREE, actor);
    const surfaceY = sampleDiscoverySurfaceY(appCtx, actor.home.x, actor.home.z);
    appCtx.addEarthWorldObject?.(mesh.group);
    return { actor, ...mesh, surfaceY: Number.isFinite(surfaceY) ? surfaceY : 0, active: false };
  });
  let elapsed = 0;
  let active = 0;
  function update(player, dt, environment = 'EARTH') {
    elapsed += Math.max(0, Number(dt) || 0);
    active = 0;
    presentations.forEach((entry, index) => {
      const { actor, group } = entry;
      const dx = Number(player?.x || 0) - actor.home.x;
      const dz = Number(player?.z || 0) - actor.home.z;
      const distanceSq = dx * dx + dz * dz;
      const tooCloseForWildlife = actor.companionPolicy === 'observe-only' && distanceSq < 3.2 * 3.2;
      const visibilityDistance = entry.active ? 230 : 175;
      entry.active = environment === 'EARTH' && distanceSq < visibilityDistance * visibilityDistance && !tooCloseForWildlife;
      group.visible = entry.active;
      if (!group.visible) return;
      active++;
      const time = elapsed * (actor.archetype.includes('bird') ? 0.7 : 0.32) + actor.phase;
      const radius = actor.archetype.includes('bird') ? 5.5 : 2.2;
      group.position.x = actor.home.x + Math.cos(time) * radius;
      group.position.z = actor.home.z + Math.sin(time * 0.83) * radius;
      group.position.y = entry.surfaceY + (actor.archetype === 'flying-bird' ? 3.2 + Math.sin(time * 1.7) * 0.7 : actor.archetype === 'waterbird' ? 0.22 : 0);
      group.rotation.y = -time + Math.PI / 2;
      animateAnimalModel(group, elapsed + index * .31, actor.archetype.includes('bird') ? 1 : .7);
    });
  }
  return Object.freeze({
    update,
    snapshot: () => Object.freeze({ active, logical: plan.actors.length, maxActors: plan.diagnostics.maxActors, models: presentations.map((entry) => ({ speciesId: entry.actor.speciesId, ...entry.profile })), generatedWithAdditionalProviderQueries: false }),
    dispose() { presentations.forEach((entry) => disposeObject(entry.group)); }
  });
}

export { compileAmbientWildlifePlan, createAmbientWildlifeRuntime };
