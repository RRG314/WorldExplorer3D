import { deterministicUnit } from './model.js?v=1';
import { animateAnimalModel, createAnimalModel } from './animal-models.js?v=3';
import {
  attachCuratedAnimalVisual,
  disposeCuratedAnimal,
  updateCuratedAnimalAnimation
} from './curated-animal-visual.js?v=1';
import { sampleDiscoverySurfaceY } from './surface.js?v=1';
import { COMPANION_CATALOG } from './catalog.js?v=4';

const WILDLIFE_CONTEXTS = new Set(['urban', 'urban-core', 'park', 'field', 'forest', 'wetland', 'riverbank', 'fresh-water', 'coast', 'mountain', 'desert']);

function archetypeForCell(cell, seed) {
  const contexts = new Set(cell.contexts || []);
  if (contexts.has('farm')) return 'livestock';
  if (contexts.has('fresh-water') || contexts.has('wetland') || contexts.has('coast')) return 'waterbird';
  if (contexts.has('urban') || contexts.has('urban-core')) return deterministicUnit(`${seed}:domestic`) > 0.55 ? 'domestic-wanderer' : 'flying-bird';
  if (contexts.has('forest') || contexts.has('field') || contexts.has('park')) return deterministicUnit(`${seed}:ground`) > 0.46 ? 'small-mammal' : 'flying-bird';
  return 'flying-bird';
}

function livestockSpeciesForCell(seed) {
  const choices = ['pasture-cow', 'wool-sheep', 'hill-goat', 'yard-chicken', 'heritage-pig', 'field-horse'];
  return choices[Math.min(choices.length - 1, Math.floor(deterministicUnit(`${seed}:livestock-species`) * choices.length))];
}

function domesticSpeciesForCell(cell, seed) {
  const contexts = new Set(cell.contexts || []);
  const choices = contexts.has('coast')
    ? ['harbor-cat', 'trail-hound', 'park-terrier']
    : contexts.has('field') || contexts.has('forest')
      ? ['field-retriever', 'trail-hound', 'meadow-tabby']
      : ['trail-hound', 'park-terrier', 'harbor-cat', 'midnight-cat'];
  return choices[Math.min(choices.length - 1, Math.floor(deterministicUnit(`${seed}:domestic-species`) * choices.length))];
}

const WILDLIFE_LABELS = Object.freeze({
  'trail-hound': 'Trail Hound',
  'field-retriever': 'Field Retriever',
  'park-terrier': 'Park Terrier',
  'harbor-cat': 'Harbor Cat',
  'meadow-tabby': 'Meadow Tabby',
  'midnight-cat': 'Midnight Cat',
  'pasture-cow': 'Pasture Cow',
  'wool-sheep': 'Wool Sheep',
  'hill-goat': 'Hill Goat',
  'yard-chicken': 'Yard Chicken',
  'heritage-pig': 'Heritage Pig',
  'field-horse': 'Field Horse',
  mallard: 'Mallard',
  'small-mammal': 'Small Mammal',
  'rock-pigeon': 'Rock Pigeon'
});

function compileAmbientWildlifePlan(environment, options = {}) {
  if (environment?.type !== 'EnvironmentContextPublication') throw new TypeError('Ambient wildlife requires an EnvironmentContextPublication.');
  const maxActors = Math.max(0, Math.min(12, Number(options.maxActors) || 8));
  const isPositionEligible = typeof options.isPositionEligible === 'function'
    ? options.isPositionEligible
    : null;
  const actors = [];
  const candidateCells = environment.cells.slice().sort((a, b) =>
    Math.hypot(a.center.x, a.center.z) - Math.hypot(b.center.x, b.center.z) || a.cellId.localeCompare(b.cellId)
  );
  for (const cell of candidateCells) {
    if (actors.length >= maxActors || !cell.contexts.some((context) => WILDLIFE_CONTEXTS.has(context))) continue;
    const seed = `${environment.worldIdentity.id}|ambient-wildlife-v1|${cell.cellId}`;
    // Always retain the nearest compatible cell so a walking session has one
    // visible nature presence. More distant cells keep deterministic thinning
    // for performance and variety.
    if (actors.length > 0 && deterministicUnit(`${seed}:presence`) < 0.16) continue;
    const margin = 0.22;
    let home = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const suffix = attempt === 0 ? '' : `:${attempt}`;
      const x = cell.bounds.minX + (cell.bounds.maxX - cell.bounds.minX) * (margin + deterministicUnit(`${seed}:x${suffix}`) * (1 - margin * 2));
      const z = cell.bounds.minZ + (cell.bounds.maxZ - cell.bounds.minZ) * (margin + deterministicUnit(`${seed}:z${suffix}`) * (1 - margin * 2));
      if (!isPositionEligible || isPositionEligible({ x, z }, { cell, attempt })) {
        home = { x, z };
        break;
      }
    }
    if (!home) continue;
    const archetype = archetypeForCell(cell, seed);
    const speciesId = archetype === 'livestock'
      ? livestockSpeciesForCell(seed)
      : archetype === 'domestic-wanderer'
      ? domesticSpeciesForCell(cell, seed)
      : archetype === 'waterbird' ? 'mallard' : archetype === 'small-mammal' ? 'small-mammal' : 'rock-pigeon';
    actors.push(Object.freeze({
      id: `wildlife:${cell.cellId}:${actors.length}`,
      cellId: cell.cellId,
      archetype,
      speciesId,
      label: ['domestic-wanderer', 'livestock'].includes(archetype)
        ? WILDLIFE_LABELS[speciesId]
        : `${WILDLIFE_LABELS[speciesId]} field lead`,
      home: Object.freeze(home),
      phase: deterministicUnit(`${seed}:phase`) * Math.PI * 2,
      evidenceClass: 'guided-wildlife-encounter',
      supportingEvidence: Object.freeze(['habitat-plausible']),
      companionPolicy: ['domestic-wanderer', 'livestock'].includes(archetype) ? 'trust-sequence-required' : 'observe-only'
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
  object?.userData?.disposeCuratedAnimal?.();
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
  const rawHeight = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).y;
  const companionScale = COMPANION_CATALOG.find((entry) => entry.id === actor.speciesId)?.worldScale;
  group.scale.setScalar(Number(companionScale || (actor.archetype === 'small-mammal' ? .4 : actor.archetype === 'waterbird' ? .38 : .28)));
  group.userData.worldDiscoveryWildlife = { id: actor.id, evidenceClass: actor.evidenceClass };
  group.userData.disposeCuratedAnimal = () => disposeCuratedAnimal(group);
  return { group, rawHeight, profile: group.userData.performanceProfile || {} };
}

function createAmbientWildlifeRuntime(appCtx, plan) {
  const THREE = globalThis.THREE;
  if (!THREE || plan?.type !== 'AmbientWildlifePlan') return Object.freeze({ update() {}, dispose() {}, snapshot: () => ({ active: 0, logical: plan?.actors?.length || 0 }) });
  let disposed = false;
  const presentations = plan.actors.map((actor) => {
    const mesh = createActorMesh(THREE, actor);
    const surfaceY = sampleDiscoverySurfaceY(appCtx, actor.home.x, actor.home.z);
    appCtx.addEarthWorldObject?.(mesh.group);
    const entry = {
      actor, ...mesh, surfaceY: Number.isFinite(surfaceY) ? surfaceY : 0,
      active: false, completed: false, interactionUntil: 0, completeAfter: 0,
      lastInteraction: ''
    };
    void attachCuratedAnimalVisual(THREE, mesh.group, {
      speciesId: actor.speciesId,
      targetLocalHeight: mesh.rawHeight,
      isCurrent: () => !disposed && mesh.group.parent != null && !entry.completed
    });
    return entry;
  });
  let elapsed = 0;
  let active = 0;
  function update(player, dt, environment = 'EARTH') {
    elapsed += Math.max(0, Number(dt) || 0);
    active = 0;
    presentations.forEach((entry, index) => {
      const { actor, group } = entry;
      if (entry.completeAfter && elapsed >= entry.completeAfter) entry.completed = true;
      if (entry.completed) {
        entry.active = false;
        group.visible = false;
        return;
      }
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
      if (entry.interactionUntil > elapsed) {
        const response = Math.max(0, Math.min(1, (entry.interactionUntil - elapsed) / 1.15));
        group.position.y += actor.companionPolicy === 'trust-sequence-required'
          ? Math.sin(elapsed * 12) * .08 * response
          : .2 * response;
        group.rotation.y += Math.sin(elapsed * 8) * .22 * response;
      }
      const activity = entry.interactionUntil > elapsed ? 'idle' : 'walk';
      if (!updateCuratedAnimalAnimation(group, dt, activity)) {
        animateAnimalModel(group, elapsed + index * .31, actor.archetype.includes('bird') ? 1 : .7);
      }
    });
  }
  function nearest(player, radius = 5.2) {
    if (!player) return null;
    return presentations.map((entry) => {
      if (!entry.active || entry.completed || !entry.group.visible || entry.interactionUntil > elapsed) return null;
      const distance = Math.hypot(entry.group.position.x - Number(player.x || 0), entry.group.position.z - Number(player.z || 0));
      if (distance > radius) return null;
      return Object.freeze({
        actor: entry.actor,
        actorId: entry.actor.id,
        x: entry.group.position.x,
        y: entry.group.position.y,
        z: entry.group.position.z,
        distance
      });
    }).filter(Boolean).sort((a, b) => a.distance - b.distance)[0] || null;
  }
  function interact(actorId, kind = 'observe') {
    const entry = presentations.find((candidate) => candidate.actor.id === String(actorId || ''));
    if (!entry || !entry.active || entry.completed || entry.interactionUntil > elapsed) return false;
    entry.lastInteraction = String(kind || 'observe');
    entry.interactionUntil = elapsed + 1.15;
    if (kind === 'adopted') entry.completeAfter = elapsed + 1.05;
    return true;
  }
  return Object.freeze({
    update,
    nearest,
    interact,
    snapshot: () => Object.freeze({
      active,
      logical: plan.actors.length,
      completed: presentations.filter((entry) => entry.completed).length,
      maxActors: plan.diagnostics.maxActors,
      models: presentations.map((entry) => ({
        speciesId: entry.actor.speciesId,
        interaction: entry.lastInteraction,
        curatedAssetId: entry.group.userData.curatedAnimalAssetId || null,
        curatedActivity: entry.group.userData.curatedAnimalActivity || null,
        visibleFallbackMeshCount: (() => {
          let count = 0;
          entry.group.traverse((object) => {
            if (object?.isMesh && object.userData?.defaultAnimalFallback === true && object.visible !== false) count += 1;
          });
          return count;
        })(),
        ...entry.profile
      })),
      generatedWithAdditionalProviderQueries: false
    }),
    dispose() {
      disposed = true;
      presentations.forEach((entry) => disposeObject(entry.group));
    }
  });
}

export { compileAmbientWildlifePlan, createAmbientWildlifeRuntime };
