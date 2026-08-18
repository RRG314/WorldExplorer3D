import { COMPANION_CATALOG } from './catalog.js?v=1';
import { createCompanionInstance, feedCompanion, resolveCompanionTravelPolicy, trainCompanion } from './companions.js?v=1';
import { animateAnimalModel, createAnimalModel } from './animal-models.js?v=1';
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

function resolveCompanionFollowTarget(actor, { airborne = false } = {}) {
  const angle = Number(actor?.angle || actor?.yaw || 0);
  const followBack = airborne ? .45 : .85;
  const followSide = airborne ? 2.6 : 1.8;
  return Object.freeze({
    x: Number(actor?.x || 0) - Math.sin(angle) * followBack + Math.cos(angle) * followSide,
    z: Number(actor?.z || 0) - Math.cos(angle) * followBack - Math.sin(angle) * followSide
  });
}

async function createCompanionRuntime(appCtx, options = {}) {
  const profileStore = options.profileStore;
  if (!profileStore?.listCompanions) throw new TypeError('Companion runtime requires the discovery profile store.');
  let companions = await profileStore.listCompanions();
  let active = companions.find((entry) => entry.active) || null;
  let presentation = active ? createCompanionMesh(appCtx, active.catalogId) : null;
  let elapsed = 0;
  let disposed = false;
  let positionInitialized = false;

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
    companions = await profileStore.listCompanions();
    active = companions.find((entry) => entry.active) || null;
    syncPresentation();
    options.onChange?.(snapshot());
    return companions;
  }

  async function adopt(catalogId) {
    const catalog = COMPANION_CATALOG.find((entry) => entry.id === String(catalogId));
    if (!catalog) throw new Error('Unknown companion.');
    const existing = companions.find((entry) => entry.catalogId === catalog.id);
    if (existing) return setActive(existing.instanceId);
    const companion = createCompanionInstance(catalog.id, {
      worldIdentity: options.worldIdentity,
      discoveryId: `companion-unlock:${catalog.id}`
    });
    await profileStore.saveCompanion(companion);
    await profileStore.setActiveCompanion(companion.instanceId);
    return refresh();
  }

  async function setActive(instanceId) {
    await profileStore.setActiveCompanion(instanceId);
    return refresh();
  }

  async function feed(instanceId) {
    const current = companions.find((entry) => entry.instanceId === String(instanceId));
    if (!current) return false;
    await profileStore.saveCompanion(feedCompanion(current));
    await refresh();
    return true;
  }

  async function train(instanceId, skill = 'find') {
    const current = companions.find((entry) => entry.instanceId === String(instanceId));
    if (!current) return false;
    await profileStore.saveCompanion(trainCompanion(current, skill));
    await refresh();
    return true;
  }

  function update(actor, dt, mode = 'walk', environment = 'EARTH') {
    if (disposed || !presentation) return;
    const policy = resolveCompanionTravelPolicy(active, mode, environment);
    presentation.group.visible = policy.visible;
    if (!policy.visible || !actor) return;
    elapsed += Math.max(0, Number(dt) || 0);
    const airborne = presentation.catalog?.behaviorArchetype === 'air-follower';
    const target = resolveCompanionFollowTarget(actor, { airborne });
    const targetX = target.x;
    const targetZ = target.z;
    const response = 1 - Math.exp(-Math.max(0, Number(dt) || 0) * (airborne ? 3.4 : 4.2));
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
        personality: entry.personality, visualVariation: entry.visualVariation, tradeable: false
      })),
      presentation: {
        meshes: presentation?.profile?.meshes || 0,
        triangles: presentation?.profile?.triangles || 0,
        materials: presentation?.profile?.materials || 0,
        distinctSpeciesModel: active?.catalogId || null,
        behaviorArchetype: presentation?.catalog?.behaviorArchetype || null,
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
      generatedWithAdditionalProviderQueries: false
    });
  }

  syncPresentation();
  return Object.freeze({
    adopt, feed, refresh, setActive, snapshot, train, update,
    dispose() { disposed = true; disposeObject(presentation?.group); }
  });
}

export { createCompanionRuntime, resolveCompanionFollowTarget };
