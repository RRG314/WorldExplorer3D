import { loadModelAsset } from '../assets/model-asset-runtime.js?v=14';

const RESIDENTIAL_HOME_PATTERN = /house|residential|apartments|terrace|townhouse|detached|semidetached|bungalow|dormitory|condo/i;

function clean(value) {
  return String(value ?? '').trim();
}

function supportSourceId(support) {
  const building = support?.building || support?.destination || {};
  return clean(building.sourceBuildingId || building.sourceFeatureId || building.id);
}

function homeMatchesSource(home, sourceId) {
  if (!home || !sourceId) return false;
  const identities = [home.sourceBuildingId, home.worldPropertyId, home.propertyId, home.id]
    .map(clean)
    .filter(Boolean);
  return identities.some((identity) => identity === sourceId || identity === `world:${sourceId}` || identity.endsWith(`:${sourceId}`));
}

function findOwnedHomeForInteriorSupport(support, propertySnapshot) {
  const building = support?.building || support?.destination || {};
  const buildingType = clean(building.buildingType || building.kind || building.type);
  if (!RESIDENTIAL_HOME_PATTERN.test(buildingType)) return null;
  const sourceId = supportSourceId(support);
  const homes = Array.isArray(propertySnapshot?.homes) ? propertySnapshot.homes : [];
  return homes.find((home) => home?.owned !== false && !home?.rentedByMe && homeMatchesSource(home, sourceId)) || null;
}

function footprintBounds(points = []) {
  const xs = points.map((point) => Number(point?.x)).filter(Number.isFinite);
  const zs = points.map((point) => Number(point?.z)).filter(Number.isFinite);
  if (!xs.length || !zs.length) return null;
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

function prepareFurnishedHomeVisual(THREE, instance, active) {
  const source = instance.root;
  source.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(source);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const target = footprintBounds(active.usableFootprint);
  if (!target || sourceBounds.isEmpty()) throw new Error('The furnished-home presentation has no usable bounds.');

  const usableWidth = Math.max(4, target.maxX - target.minX - 1.2);
  const usableDepth = Math.max(5, target.maxZ - target.minZ - 1.2);
  const horizontalScale = Math.min(usableWidth / Math.max(.001, sourceSize.x), usableDepth / Math.max(.001, sourceSize.z));
  const availableHeight = Math.max(3, Number(active.floorPlan?.storyHeight || 3.4) * Math.min(3, active.floorPlan?.floorCount || 1));
  const scale = Math.max(.28, Math.min(1.35, horizontalScale, availableHeight / Math.max(.001, sourceSize.y)));

  source.position.x -= sourceCenter.x;
  source.position.y -= sourceBounds.min.y;
  source.position.z -= sourceCenter.z;
  source.updateMatrix();
  const normalized = new THREE.Group();
  normalized.name = `${instance.record.label} normalized source`;
  normalized.scale.setScalar(scale);
  normalized.add(source);
  const visual = new THREE.Group();
  visual.name = `${instance.record.label} presentation`;
  visual.position.set((target.minX + target.maxX) * .5, Number(active.floorBaseY || 0) + .025, (target.minZ + target.maxZ) * .5);
  visual.add(normalized);
  visual.userData.curatedHomeAssetId = instance.record.id;
  visual.userData.presentationOnly = true;
  visual.userData.collisionAuthority = instance.record.collisionPolicy;
  visual.userData.performanceProfile = Object.freeze({
    sourceBytes: instance.record.budgets.bytes,
    triangles: instance.record.budgets.triangles,
    maxInstances: instance.record.budgets.maxInstances,
    scale
  });
  source.traverse((object) => {
    if (!object?.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = true;
  });
  return visual;
}

function disposeCuratedHomeFurnishing(active) {
  const attachment = active?.curatedHomeFurnishing;
  if (!attachment) return false;
  attachment.visual?.removeFromParent?.();
  attachment.instance?.dispose?.();
  active.curatedHomeFurnishing = null;
  return true;
}

async function attachCuratedHomeFurnishing(THREE, active, options = {}) {
  if (!active?.group || !active?.ownedHome || active.curatedHomeFurnishing?.status === 'loading') return false;
  disposeCuratedHomeFurnishing(active);
  const token = {};
  active.curatedHomeFurnishing = Object.freeze({ status: 'loading', token });
  try {
    const instance = await loadModelAsset(THREE, 'interior-furnished-explorer-home-v1');
    if (options.isCurrent && !options.isCurrent(active)) {
      instance.dispose();
      return false;
    }
    const visual = prepareFurnishedHomeVisual(THREE, instance, active);
    active.group.add(visual);
    active.curatedHomeFurnishing = Object.freeze({ status: 'ready', instance, visual, token });
    return true;
  } catch (error) {
    if (active.curatedHomeFurnishing?.token === token) active.curatedHomeFurnishing = null;
    console.warn('Curated home furnishing unavailable; keeping the functional generated interior.', error);
    return false;
  }
}

export { attachCuratedHomeFurnishing, disposeCuratedHomeFurnishing, findOwnedHomeForInteriorSupport, prepareFurnishedHomeVisual };
