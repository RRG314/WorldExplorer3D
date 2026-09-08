import { loadModelAsset } from '../assets/model-asset-runtime.js?v=15';
import { VEHICLE_ROOT_TO_GROUND_METERS } from '../engine/vehicle-catalog.js?v=6';

const CURATED_TRAFFIC_ASSET_BY_VARIANT = Object.freeze({
  compact: 'traffic-compact-hatchback-v1',
  sedan: 'traffic-four-door-sedan-v1',
  suv: 'traffic-trail-suv-v1',
  pickup: 'traffic-utility-pickup-v1',
  van: 'traffic-city-van-v1',
  delivery_van: 'traffic-city-van-v1',
  taxi: 'traffic-city-taxi-v1',
  box_truck: 'traffic-service-truck-v1',
  city_bus: 'traffic-city-bus-v1'
});

const CURATED_RESPONDER_ASSET_ID = 'traffic-police-response-v1';

function prepareTrafficVisual(THREE, instance, options = {}) {
  const { record, root: source } = instance;
  source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const requested = options.dimensionsMeters || {};
  const target = {
    width: Number(requested.width || record.dimensionsMeters.width),
    height: Number(requested.height || record.dimensionsMeters.height),
    length: Number(requested.length || record.dimensionsMeters.length)
  };
  source.position.x -= center.x;
  source.position.y -= bounds.min.y;
  source.position.z -= center.z;
  source.updateMatrix();

  const normalized = new THREE.Group();
  normalized.name = `${record.label} source transform`;
  normalized.scale.set(
    target.width / Math.max(.001, size.x),
    target.height / Math.max(.001, size.y),
    target.length / Math.max(.001, size.z)
  );
  normalized.add(source);

  const visual = new THREE.Group();
  visual.name = `${record.label} curated traffic visual`;
  visual.position.y = -VEHICLE_ROOT_TO_GROUND_METERS;
  visual.add(normalized);
  const paintNames = new Set(record.paintMaterialNames || []);
  source.traverse((object) => {
    if (!object?.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      const name = String(material?.name || '');
      if (paintNames.has(name)) {
        material.color?.setHex?.(Number(options.color || 0x52697a));
        material.roughness = .5;
        material.metalness = .28;
      } else if (/Windows/i.test(name)) {
        material.color?.setHex?.(0x172932);
        material.roughness = .2;
        material.metalness = .34;
      } else if (/Headlights/i.test(name)) {
        material.emissive?.setHex?.(0xffd784);
        material.emissiveIntensity = .5;
      } else if (/TailLights/i.test(name)) {
        material.emissive?.setHex?.(0x7c1118);
        material.emissiveIntensity = .62;
      }
      material.needsUpdate = true;
    });
  });
  visual.userData.curatedTrafficAssetId = record.id;
  visual.userData.collisionPolicy = record.collisionPolicy;
  visual.userData.performanceProfile = Object.freeze({
    style: 'licensed-curated-world-traffic',
    sourceBytes: record.budgets.bytes,
    triangles: record.budgets.triangles,
    maxInstances: record.budgets.maxInstances,
    textureEdgePixels: record.budgets.textureEdgePixels
  });
  return visual;
}

function disposeCuratedTrafficVehicle(host) {
  const attachment = host?.userData?.curatedTrafficVehicleAttachment;
  if (!attachment) return false;
  const assetId = attachment.instance.record.id;
  attachment.visual.removeFromParent?.();
  attachment.instance.dispose();
  delete host.userData.curatedTrafficVehicleAttachment;
  delete host.userData.curatedTrafficAssetId;
  host.userData.onCuratedTrafficDetached?.(assetId);
  return true;
}

async function attachCuratedTrafficVehicle(THREE, host, options = {}) {
  if (!host || host.userData.curatedTrafficVehicleLoadStarted) return false;
  const assetId = options.assetId || (options.responder
    ? CURATED_RESPONDER_ASSET_ID
    : CURATED_TRAFFIC_ASSET_BY_VARIANT[String(options.variantId || '')]);
  if (!assetId) return false;
  host.userData.curatedTrafficVehicleLoadStarted = true;
  try {
    const instance = await loadModelAsset(THREE, assetId, { signal: options.signal });
    if (options.isCurrent && !options.isCurrent()) {
      instance.dispose();
      host.userData.curatedTrafficVehicleLoadStarted = false;
      return false;
    }
    const visual = prepareTrafficVisual(THREE, instance, options);
    host.add(visual);
    host.userData.curatedTrafficAssetId = instance.record.id;
    host.userData.curatedTrafficVehicleLoadFailed = false;
    host.userData.curatedTrafficVehicleAttachment = Object.freeze({ instance, visual });
    host.userData.onCuratedTrafficAttached?.(instance.record.id);
    return true;
  } catch (error) {
    host.userData.curatedTrafficVehicleLoadStarted = false;
    host.userData.curatedTrafficVehicleLoadFailed = error?.name !== 'AbortError';
    if (error?.name !== 'AbortError') console.warn('Curated traffic vehicle unavailable; vehicle remains hidden.', error);
    return false;
  }
}

export {
  CURATED_TRAFFIC_ASSET_BY_VARIANT,
  CURATED_RESPONDER_ASSET_ID,
  attachCuratedTrafficVehicle,
  disposeCuratedTrafficVehicle
};
