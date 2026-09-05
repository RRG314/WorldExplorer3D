import { COMPANION_CATALOG } from './catalog.js?v=4';
import {
  assignCompanionHome,
  awardCompanionXp,
  careForCompanion,
  createCompanionInstance,
  createStarterCompanionInstance,
  normalizeCompanionInstance,
  renameCompanion,
  resolveCompanionTravelPolicy,
} from './companions.js?v=7';
import { animateAnimalModel, createAnimalModel } from './animal-models.js?v=3';
import {
  attachCuratedAnimalVisual,
  disposeCuratedAnimal,
  updateCuratedAnimalAnimation
} from './curated-animal-visual.js?v=2';
import { sampleDiscoverySurfaceY } from './surface.js?v=1';

function disposeObject(object) {
  object?.userData?.disposeCuratedAnimal?.();
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
  group.userData.disposeCuratedAnimal = () => disposeCuratedAnimal(group);
  appCtx.addEarthWorldObject?.(group);
  void attachCuratedAnimalVisual(THREE, group, {
    speciesId: catalogId,
    targetLocalHeight: rawHeight,
    isCurrent: () => group.parent != null && group.userData.worldDiscoveryCompanion === true
  });
  return { group, catalogId, catalog, rawHeight, scale: 1, clearance: 0, profile: group.userData.performanceProfile || {}, activityUntil: 0, activity: 'idle' };
}

function resolveCompanionFollowTarget(actor, { archetype = 'dog' } = {}) {
  const angle = Number(actor?.angle || actor?.yaw || 0);
  const airborne = archetype === 'bird';
  const largeLivestock = ['livestock-cattle', 'livestock-horse'].includes(archetype);
  const smallLivestock = archetype.startsWith('livestock-');
  const followBack = airborne ? .45 : largeLivestock ? 2.4 : smallLivestock ? 1.45 : archetype === 'cat' ? .72 : .42;
  const followSide = airborne ? 2.6 : largeLivestock ? 2.8 : smallLivestock ? 1.8 : archetype === 'cat' ? 1.02 : 1.08;
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

async function ensureStarterCompanion(profileStore, options = {}) {
  if (!profileStore?.listCompanions || !profileStore?.saveCompanion) {
    throw new TypeError('Starter companion bootstrap requires companion persistence.');
  }
  const now = Math.max(1, Number(options.now) || Date.now());
  let profile = null;
  try {
    if (profileStore.getProfile) profile = await profileStore.getProfile();
  } catch (_) {
    profile = null;
  }
  const stored = await profileStore.listCompanions();
  const companions = stored.map(normalizedCompanion).filter(Boolean);
  const marker = profile?.companionOnboarding || {};
  let starter = companions.find((entry) => entry.isStarterCompanion) || null;
  if (!starter) {
    const created = createStarterCompanionInstance({
      profileIdentity: profile?.id || options.profileIdentity || 'local-explorer',
      adoptedAt: marker.starterDogGrantedAt || now
    });
    starter = normalizeCompanionInstance(marker.starterDogInstanceId
      ? { ...created, instanceId: marker.starterDogInstanceId }
      : created);
    await profileStore.saveCompanion(starter);
    companions.push(starter);
  }
  const active = companions.find((entry) => entry.active) || null;
  const primaryHomeId = String(marker.primaryHomeId || '').slice(0, 420);
  if (!active) {
    await profileStore.setActiveCompanion(starter.instanceId, { homeId: primaryHomeId, now });
    starter = normalizeCompanionInstance({
      ...starter,
      active: true,
      residence: { state: 'traveling', homeId: primaryHomeId, updatedAt: now }
    });
  }
  if (profileStore.saveProfile && profile) {
    await profileStore.saveProfile({
      ...profile,
      activeCompanionId: active?.instanceId || starter.instanceId,
      companionOnboarding: {
        ...marker,
        schemaVersion: 1,
        starterDogGranted: true,
        starterDogInstanceId: starter.instanceId,
        starterDogGrantedAt: Number(marker.starterDogGrantedAt) || starter.adoptedAt || now,
        starterDogFirstNamedAt: Number(marker.starterDogFirstNamedAt) || 0,
        primaryHomeId
      }
    });
  }
  return Object.freeze({ starter, created: !stored.some((entry) => entry.instanceId === starter.instanceId), activeInstanceId: active?.instanceId || starter.instanceId, primaryHomeId });
}

async function createCompanionRuntime(appCtx, options = {}) {
  const profileStore = options.profileStore;
  if (!profileStore?.listCompanions) throw new TypeError('Companion runtime requires the discovery profile store.');
  const starterBootstrap = await ensureStarterCompanion(profileStore, {
    profileIdentity: options.profileIdentity,
    now: options.now?.()
  });
  let primaryHomeId = starterBootstrap.primaryHomeId;
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
    if (!presentation) return;
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
    await profileStore.setActiveCompanion(instanceId, { homeId: primaryHomeId });
    return refresh();
  }

  async function leaveAtHome(instanceId) {
    const target = companions.find((entry) => entry.instanceId === String(instanceId));
    if (!target) return false;
    if (target.active) await profileStore.setActiveCompanion(null, { homeId: target.residence?.homeId || primaryHomeId });
    else await profileStore.saveCompanion(assignCompanionHome(target, target.residence?.homeId || primaryHomeId));
    await refresh();
    return true;
  }

  async function rename(instanceId, requestedName) {
    const current = companions.find((entry) => entry.instanceId === String(instanceId));
    const result = renameCompanion(current, requestedName);
    if (!result.renamed) return result;
    await profileStore.saveCompanion(result.companion);
    if (result.firstStarterNaming && profileStore.getProfile && profileStore.saveProfile) {
      const profile = await profileStore.getProfile();
      await profileStore.saveProfile({
        ...profile,
        companionOnboarding: {
          ...(profile.companionOnboarding || {}),
          starterDogGranted: true,
          starterDogInstanceId: result.companion.instanceId,
          starterDogFirstNamedAt: result.companion.namedAt
        }
      });
    }
    await refresh();
    options.onRename?.(result.companion, result);
    return result;
  }

  async function assignPrimaryHome(homeId) {
    primaryHomeId = String(homeId || '').trim().slice(0, 420);
    const now = Date.now();
    const updates = companions
      .filter((entry) => entry.isStarterCompanion || !entry.residence?.homeId)
      .map((entry) => assignCompanionHome(entry, primaryHomeId, now))
      .filter(Boolean);
    await Promise.all(updates.map((entry) => profileStore.saveCompanion(entry)));
    if (profileStore.getProfile && profileStore.saveProfile) {
      const profile = await profileStore.getProfile();
      await profileStore.saveProfile({
        ...profile,
        companionOnboarding: { ...(profile.companionOnboarding || {}), primaryHomeId }
      });
    }
    await refresh();
    return primaryHomeId;
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
    if (presentation) {
      presentation.activity = interaction === 'feed' ? 'eat' : 'idle';
      presentation.activityUntil = elapsed + 1.8;
    }
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
      if (!updateCuratedAnimalAnimation(presentation.group, dt, 'idle')) {
        animateAnimalModel(presentation.group, elapsed, .18);
      }
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
    const motionActivity = separation > 5 ? 'run' : separation > .45 ? 'walk' : 'idle';
    const activity = presentation.activityUntil > elapsed ? presentation.activity : motionActivity;
    if (!updateCuratedAnimalAnimation(presentation.group, dt, activity)) {
      animateAnimalModel(presentation.group, elapsed, (airborne ? 1.35 : .8) + Number(active?.personality?.energy || 0) * .35);
    }
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
        originKind: entry.originKind, isStarterCompanion: entry.isStarterCompanion,
        nameStatus: entry.nameStatus, namedAt: entry.namedAt, residence: entry.residence,
        personality: entry.personality, visualVariation: entry.visualVariation,
        favorite: entry.favorite, archived: entry.archived, legacyContent: entry.legacyContent, tradeable: false
      })),
      presentation: {
        meshes: presentation?.profile?.meshes || 0,
        triangles: presentation?.profile?.triangles || 0,
        materials: presentation?.profile?.materials || 0,
        distinctSpeciesModel: active?.catalogId || null,
        curatedAssetId: presentation?.group?.userData?.curatedAnimalAssetId || null,
        curatedActivity: presentation?.group?.userData?.curatedAnimalActivity || null,
        visibleFallbackMeshCount: (() => {
          let count = 0;
          presentation?.group?.traverse?.((object) => {
            if (object?.isMesh && object.userData?.defaultAnimalFallback === true && object.visible !== false) count += 1;
          });
          return count;
        })(),
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
    adopt, assignPrimaryHome, awardXp, beginRecallExercise, callRecall, care, exerciseSnapshot, leaveAtHome, refresh, rename, setActive, snapshot, update,
    dispose() {
      disposed = true;
      disposeObject(presentation?.group);
    }
  });
}

export { createCompanionRuntime, ensureStarterCompanion, resolveCompanionFollowTarget, resolveCompanionVehicleTarget };
