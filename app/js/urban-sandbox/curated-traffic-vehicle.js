import {detachSceneObject} from '../engine/scene-object-lifecycle.js';
import { loadModelAsset } from '../assets/model-asset-runtime.js?v=16';
import { VEHICLE_ROOT_TO_GROUND_METERS } from '../engine/vehicle-catalog.js?v=6';
import {vehicleWheelRig} from '../transport/vehicle-wheel-motion.js';
import {prepareE34Model} from '../engine/curated-player-car.js?v=7';

const CURATED_TRAFFIC_ASSET_BY_VARIANT = Object.freeze({
  compact: 'traffic-compact-hatchback-v1',
  sedan: 'traffic-four-door-sedan-v1',
  suv: 'traffic-trail-suv-v1',
  pickup: 'traffic-utility-pickup-v1',
  van: 'traffic-city-van-v1',
  delivery_van: 'traffic-city-van-v1',
  taxi: 'traffic-city-taxi-v1',
  box_truck: 'traffic-service-truck-v1',
  city_bus: 'traffic-city-bus-v1',
  delorean: 'road-delorean-dmc12',
  cadillac_coupe: 'road-cadillac-coupe-deville',
  cadillac_fleetwood: 'road-cadillac-fleetwood-brougham',
  golf_ii: 'road-volkswagen-golf-ii',
  datsun_280z: 'road-datsun-280z'
});

const CURATED_RESPONDER_ASSET_ID = 'traffic-police-response-v1';

function syncCuratedVehicleGroundPivot(host) {
  const visual = host?.userData?.curatedTrafficVehicleAttachment?.visual;
  if (!visual) return;
  const pitch = Number(host.rotation?.x || 0);
  const roll = Number(host.rotation?.z || 0);
  const height = VEHICLE_ROOT_TO_GROUND_METERS;
  // The host is positioned above the ground vertically. Inverse-rotate that
  // offset so its mesh still rotates about the sampled ground-contact center.
  visual.position.set(-height * Math.sin(roll) * Math.cos(pitch),
    -height * Math.cos(roll) * Math.cos(pitch), height * Math.sin(pitch));
}

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
      } else if (/TailLights|BrakeLight/i.test(name)) {
        material.color?.setHex?.(0xa52c27);
        material.emissive?.setHex?.(0x7c1118);
        material.emissiveIntensity = .62;
      }
      material.needsUpdate = true;
    });
  });
  visual.userData.curatedTrafficAssetId = record.id;
  visual.userData.wheels = vehicleWheelRig(source);
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
  if(!host?.userData)return false;
  host.userData.curatedTrafficVehicleLoadGeneration=(host.userData.curatedTrafficVehicleLoadGeneration||0)+1;
  host.userData.curatedTrafficVehicleLoadStarted=false;
  const attachment = host?.userData?.curatedTrafficVehicleAttachment;
  if (!attachment) return false;
  const assetId = attachment.instance.record.id;
  detachSceneObject(attachment.visual);
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
  const generation=(host.userData.curatedTrafficVehicleLoadGeneration||0)+1;
  host.userData.curatedTrafficVehicleLoadGeneration=generation;
  host.userData.disposeCuratedTrafficVehicle=()=>disposeCuratedTrafficVehicle(host);
  host.userData.curatedTrafficVehicleLoadStarted = true;
  let instance;
  try {
    instance = await loadModelAsset(THREE, assetId, { signal: options.signal });
    if (host.userData.curatedTrafficVehicleLoadGeneration!==generation || options.isCurrent && !options.isCurrent()) {
      instance.dispose();
      if(host.userData.curatedTrafficVehicleLoadGeneration===generation)host.userData.curatedTrafficVehicleLoadStarted = false;
      return false;
    }
    const visual = instance.record.id==='vehicle-bmw-525i-e34'
      ?prepareE34Model(THREE,instance.root,instance.record):prepareTrafficVisual(THREE, instance, options);
    host.add(visual);
    host.userData.curatedTrafficAssetId = instance.record.id;
    host.userData.curatedTrafficVehicleLoadFailed = false;
    host.userData.curatedTrafficVehicleAttachment = Object.freeze({ instance, visual });
    host.userData.onCuratedTrafficAttached?.(instance.record.id);
    syncCuratedVehicleGroundPivot(host);
    return true;
  } catch (error) {
    if(host.userData.curatedTrafficVehicleLoadGeneration===generation){
      disposeCuratedTrafficVehicle(host);
      host.userData.curatedTrafficVehicleLoadFailed = error?.name !== 'AbortError';
    }
    instance?.dispose();
    if (error?.name !== 'AbortError') console.warn('Curated traffic vehicle unavailable; vehicle remains hidden.', error);
    return false;
  }
}

export {
  CURATED_TRAFFIC_ASSET_BY_VARIANT,
  CURATED_RESPONDER_ASSET_ID,
  attachCuratedTrafficVehicle,
  syncCuratedVehicleGroundPivot,
  disposeCuratedTrafficVehicle
};
