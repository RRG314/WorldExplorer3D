import { COMPANION_CATALOG } from './catalog.js?v=4';
import {
  awardCompanionXp,
  careForCompanion,
  createCompanionInstance,
  normalizeCompanionInstance,
  resolveCompanionTravelPolicy,
} from './companions.js?v=4';
import { animateAnimalModel, createAnimalModel } from './animal-models.js?v=2';
import { sampleDiscoverySurfaceY } from './surface.js?v=1';

function disposeObject(object) {
  object?.parent?.remove?.(object);
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material?.dispose?.();
  });
}

function createCompanionMesh(appCtx, catalogId) {
  const THREE = globalThis.THREE;
  if (!THREE) return null;
  const catalog = COMPANION_CATALOG.find((entry) => entry.id === String(catalogId)) || COMPANION_CATALOG[0];
  const group = createAnimalModel(THREE, catalogId || 'trail-hound');
  group.name = `World Discovery Active Companion ${catalogId || 'trail-hound'}`;
  group.visible = false;
  group.userData.worldDiscoveryCompanion = true;
  const rawHeight = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()).y;
  appCtx.addEarthWorldObject?.(group);
  return { group, catalogId, catalog, rawHeight, scale: 1, clearance: 0, profile: group.userData.performanceProfile || {} };
}

function resolveCompanionFollowTarget(actor, { archetype = 'dog' } = {}) {
  const angle = Number(actor?.angle || actor?.yaw || 0);
  const airborne = archetype === 'bird';
  const largeLivestock = ['livestock-cattle', 'livestock-horse'].includes(archetype);
  const smallLivestock = archetype.startsWith('livestock-');
  const followBack = airborne ? .45 : largeLivestock ? 2.4 : smallLivestock ? 1.45 : archetype === 'cat' ? 1.05 : .85;
  const followSide = airborne ? 2.6 : largeLivestock ? 2.8 : smallLivestock ? 1.8 : archetype === 'cat' ? 1.15 : 1.8;
  return Object.freeze({
    x: Number(actor?.x || 0) - Math.sin(angle) * followBack + Math.cos(angle) * followSide,
    z: Number(actor?.z || 0) - Math.cos(angle) * followBack - Math.sin(angle) * followSide
  });
}

function resolveCompanionVehicleTarget(actor, { mode = 'car' } = {}) {
  const angle = Number(actor?.angle || actor?.yaw || 0);
  const rear = mode === 'boat' ? .25 : .42;
  const side = mode === 'boat' ? .52 : .38;
  return Object.freeze({
    x: Number(actor?.x || 0) - Math.sin(angle) * rear + Math.cos(angle) * side,
    y: Number(actor?.y || 0) + (mode === 'boat' ? .42 : .78),
    z: Number(actor?.z || 0) - Math.cos(angle) * rear - Math.sin(angle) * side,
    yaw: angle
  });
}

function normalizedCompanion(instance = {}) {
  return normalizeCompanionInstance(instance);
}

async function createCompanionRuntime(appCtx, options = {}) {
  const profileStore = options.profileStore;
  if (!profileStore?.listCompanions) throw new TypeError('Companion runtime requires the discovery profile store.');
  const storedCompanions = await profileStore.listCompanions();
  let companions = storedCompanions.map(normalizedCompanion).filter(Boolean);
  for (const companion of companions) {
    const original = storedCompanions.find((entry) => entry.instanceId === companion.instanceId);
    if (original?.schemaVersion !== companion.schemaVersion || original?.progression?.schemaVersion !== companion.progression.schemaVersion) {
      await profileStore.saveCompanion(companion);
    }
  }
  let active = companions.find((entry) => entry.active) || null;
  let presentation = active ? createCompanionMesh(appCtx, active.catalogId) : null;
  let elapsed = 0;
  let disposed = false;
  let positionInitialized = false;
  let travelState = active ? 'following' : 'none';
  let progressWrites = Promise.resolve();
  let exercise = null;
  let exerciseWritePending = false;

  function syncPresentation() {
    if (!active) {
      disposeObject(presentation?.group);
      presentation = null;
      return;
    }
    if (!presentation || presentation.catalogId !== active.catalogId) {
      disposeObject(presentation?.group);
      presentation = createCompanionMesh(appCtx, active.catalogId);
    }
    presentation.scale = Number(active?.visualVariation?.size || 1) * Number(presentation.catalog?.worldScale || .42);
    presentation.group.scale.setScalar(presentation.scale);
    positionInitialized = false;
  }

  async function refresh() {
    companions = (await profileStore.listCompanions()).map(normalizedCompanion).filter(Boolean);
    active = companions.find((entry) => entry.active) || null;
    syncPresentation();
    options.onChange?.(snapshot());
    return companions;
  }

  async function adopt(catalogId, adoptOptions = {}) {
    const catalog = COMPANION_CATALOG.find((entry) => entry.id === String(catalogId));
    if (!catalog) throw new Error('Unknown companion.');
    const companion = createCompanionInstance(catalog.id, {
      worldIdentity: options.worldIdentity,
      discoveryId: adoptOptions.discoveryId || `companion-encounter:${catalog.id}:${Date.now().toString(36)}`,
      name: adoptOptions.name
    });
    await profileStore.saveCompanion(companion);
    await profileStore.setActiveCompanion(companion.instanceId);
    return refresh();
  }

  async function setActive(instanceId) {
    await profileStore.setActiveCompanion(instanceId);
    return refresh();
  }

  function beginRecallExercise(instanceId, actor = {}) {
    const target = companions.find((entry) => entry.instanceId === String(instanceId));
    if (!target || target.instanceId !== active?.instanceId || Number(target.progression?.level || 1) < 2) return false;
    const player = { x: Number(actor.x || 0), z: Number(actor.z || 0) };
    exercise = {
      type: 'recall', instanceId: target.instanceId, phase: 'move-away',
      startedAt: Date.now(), playerStart: player,
      anchor: presentation?.group ? { x: presentation.group.position.x, z: presentation.group.position.z } : player
    };
    options.onExerciseChange?.(exerciseSnapshot(actor));
    return true;
  }

  function exerciseSnapshot(actor = {}) {
    if (!exercise) return Object.freeze({ active: false });
    const distance = Math.hypot(Number(actor.x || 0) - exercise.playerStart.x, Number(actor.z || 0) - exercise.playerStart.z);
    return Object.freeze({
      active: true,
      type: exercise.type,
      phase: exercise.phase,
      instanceId: exercise.instanceId,
      playerDistance: Number(distance.toFixed(1)),
      readyToCall: exercise.phase === 'move-away' && distance >= 6
    });
  }

  function callRecall(actor = {}) {
    const snapshot = exerciseSnapshot(actor);
    if (!snapshot.readyToCall || exercise?.type !== 'recall') return false;
    exercise.phase = 'returning';
    options.onExerciseChange?.(exerciseSnapshot(actor));
    return true;
  }

  function completeRecallExercise() {
    if (!exercise || exerciseWritePending) return;
    const completed = exercise;
    exerciseWritePending = true;
    progressWrites = progressWrites.then(async () => {
      const current = companions.find((entry) => entry.instanceId === completed.instanceId);
      if (!current) return false;
      const learned = [...new Set([...(current.training?.learnedCommands || ['follow']), 'recall'])];
      const records = { ...(current.training?.records || {}), recall: { completed: true, completedAt: Date.now() } };
      const trained = Object.freeze({ ...current, training: Object.freeze({ ...current.training, learnedCommands: Object.freeze(learned), records: Object.freeze(records) }) });
      const result = awardCompanionXp(trained, {
        receiptId: `training:${current.instanceId}:recall:first-clear`,
        reasonId: 'training-first-clear'
      });
      const next = result.companion;
      await profileStore.saveCompanion(next);
      companions = companions.map((entry) => entry.instanceId === next.instanceId ? next : entry);
      active = next;
      if (result.awarded) options.onXpAward?.(next, result);
      options.onTrainingComplete?.(next, 'recall');
      options.onChange?.(snapshot());
      return true;
    }).catch((error) => {
      console.warn('[companions] Recall training could not be saved.', error);
      return false;
    }).finally(() => {
      exercise = null;
      exerciseWritePending = false;
      options.onExerciseChange?.(Object.freeze({ active: false }));
    });
  }

  async function care(instanceId, interaction = 'pet') {
    const current = companions.find((entry) => entry.instanceId === String(instanceId));
    if (!current) return false;
    await profileStore.saveCompanion(careForCompanion(current, interaction));
    await refresh();
    return true;
  }

  function queueAward(award = {}) {
    const instanceId = active?.instanceId;
    if (!instanceId) return progressWrites;
    progressWrites = progressWrites.then(async () => {
      const current = companions.find((entry) => entry.instanceId === instanceId);
      if (!current) return false;
      const result = awardCompanionXp(current, award);
      if (!result.awarded) return false;
      const next = result.companion;
      await profileStore.saveCompanion(next);
      companions = companions.map((entry) => entry.instanceId === instanceId ? next : entry);
      if (active?.instanceId === instanceId) active = next;
      options.onXpAward?.(next, result);
      if (result.level > result.previousLevel) options.onLevelUp?.(next, result.previousLevel);
      options.onChange?.(snapshot());
      return result;
    }).catch((error) => {
      console.warn('[companions] Progress could not be saved.', error);
      return false;
    });
    return progressWrites;
  }

  function awardXp(award = {}) {
    if (!active) return Promise.resolve(false);
    return queueAward(award);
  }

  function update(actor, dt, mode = 'walk', environment = 'EARTH') {
    if (disposed || !presentation) return;
    const policy = resolveCompanionTravelPolicy(active, mode, environment);
    travelState = policy.state;
    presentation.group.visible = policy.visible;
    if (!policy.visible || !actor) {
      if (policy.positionMode === 'interior') {
        exercise = null;
        positionInitialized = false;
      }
      return;
    }
    elapsed += Math.max(0, Number(dt) || 0);
    if (policy.positionMode === 'aboard') {
      exercise = null;
      const target = resolveCompanionVehicleTarget(actor, { mode });
      presentation.group.position.set(target.x, target.y, target.z);
      presentation.group.rotation.y = target.yaw;
      presentation.group.scale.setScalar(presentation.scale * .72);
      presentation.clearance = 0;
      positionInitialized = true;
      animateAnimalModel(presentation.group, elapsed, .18);
      return;
    }
    presentation.group.scale.setScalar(presentation.scale);
    const archetype = active?.speciesArchetype || (presentation.catalog?.behaviorArchetype === 'air-follower' ? 'bird' : 'dog');
    const airborne = archetype === 'bird';
    const target = resolveCompanionFollowTarget(actor, { archetype });
    const holdingRecall = exercise?.type === 'recall' && exercise.phase === 'move-away';
    const targetX = holdingRecall ? exercise.anchor.x : target.x;
    const targetZ = holdingRecall ? exercise.anchor.z : target.z;
    const largeLivestock = ['livestock-cattle', 'livestock-horse'].includes(archetype);
    const response = 1 - Math.exp(-Math.max(0, Number(dt) || 0) * (airborne ? 3.4 : largeLivestock ? 2.25 : archetype.startsWith('livestock-') ? 3.0 : archetype === 'cat' ? 3.55 : 4.2));
    const separation = Math.hypot(targetX - presentation.group.position.x, targetZ - presentation.group.position.z);
    if (!positionInitialized || separation > 25) {
      presentation.group.position.x = targetX;
      presentation.group.position.z = targetZ;
      positionInitialized = true;
    } else {
      presentation.group.position.x += (targetX - presentation.group.position.x) * response;
      presentation.group.position.z += (targetZ - presentation.group.position.z) * response;
    }
    const surface = sampleDiscoverySurfaceY(appCtx, presentation.group.position.x, presentation.group.position.z);
    const surfaceY = Number.isFinite(surface) ? surface : Number(actor.y || 0) - 1.7;
    presentation.group.position.y = airborne
      ? surfaceY + Number(presentation.catalog?.flightHeight || 1.4) + Math.sin(elapsed * 2.6) * .1
      : surfaceY;
    presentation.clearance = presentation.group.position.y - surfaceY;
    presentation.group.rotation.y = Math.atan2(Number(actor.x || 0) - presentation.group.position.x, Number(actor.z || 0) - presentation.group.position.z);
    animateAnimalModel(presentation.group, elapsed, (airborne ? 1.35 : .8) + Number(active?.personality?.energy || 0) * .35);
    if (exercise?.type === 'recall' && exercise.phase === 'returning' && separation < 1.4) completeRecallExercise();
  }

  function snapshot() {
    return Object.freeze({
      owned: companions.length,
      activeInstanceId: active?.instanceId || null,
      activeCatalogId: active?.catalogId || null,
      activeName: active?.name || '',
      companions: companions.map((entry) => ({
        instanceId: entry.instanceId, catalogId: entry.catalogId, name: entry.name,
        active: !!entry.active, care: entry.care, training: entry.training,
        progression: entry.progression, speciesArchetype: entry.speciesArchetype,
        personality: entry.personality, visualVariation: entry.visualVariation,
        favorite: entry.favorite, archived: entry.archived, legacyContent: entry.legacyContent, tradeable: false
      })),
      presentation: {
        meshes: presentation?.profile?.meshes || 0,
        triangles: presentation?.profile?.triangles || 0,
        materials: presentation?.profile?.materials || 0,
        distinctSpeciesModel: active?.catalogId || null,
        behaviorArchetype: presentation?.catalog?.behaviorArchetype || null,
        travelState,
        vehicleOccupant: travelState === 'vehicle-occupant' || travelState === 'aboard',
        sizeClass: presentation?.catalog?.sizeClass || null,
        renderedHeight: Number(((presentation?.rawHeight || 0) * (presentation?.scale || 0)).toFixed(3)),
        clearance: Number((presentation?.clearance || 0).toFixed(3)),
        visible: presentation?.group?.visible === true,
        position: presentation?.group ? {
          x: Number(presentation.group.position.x.toFixed(3)),
          y: Number(presentation.group.position.y.toFixed(3)),
          z: Number(presentation.group.position.z.toFixed(3))
        } : null
      },
      exercise: exerciseSnapshot(),
      generatedWithAdditionalProviderQueries: false
    });
  }

  syncPresentation();
  return Object.freeze({
    adopt, awardXp, beginRecallExercise, callRecall, care, exerciseSnapshot, refresh, setActive, snapshot, update,
    dispose() {
      disposed = true;
      disposeObject(presentation?.group);
    }
  });
}

export { createCompanionRuntime, resolveCompanionFollowTarget, resolveCompanionVehicleTarget };
