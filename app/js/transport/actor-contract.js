import {resolveControlState} from './control-state.js';
import { ctx as appCtx } from '../shared-context.js?v=55';
import { transportDamagePresentation } from './damage-model.js?v=1';
import { getAviationCatalogEntry } from './aviation-catalog.js?v=5';
import { getMaritimeCatalogEntry } from './maritime-catalog.js?v=1';

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function currentTransportMode() { return resolveControlState(appCtx).mode; }

function actorRecord(mode, actor, options = {}) {
  if (!actor) return null;
  const x = finite(actor.x ?? actor.position?.x, NaN);
  const y = finite(actor.y ?? actor.position?.y, NaN);
  const z = finite(actor.z ?? actor.position?.z, NaN);
  if (![x, y, z].every(Number.isFinite)) return null;
  const condition = transportDamagePresentation(actor.condition ?? options.condition ?? 1);
  return {
    mode,
    source: mode,
    identity: {
      entityId: String(options.entityId || actor.id || actor.transportEntityId || ''),
      catalogId: String(options.catalogId || actor.transportCatalogId || actor.vehicleVariantId || mode),
      domain: String(options.domain || (mode === 'boat' || mode === 'ocean' ? 'maritime' : mode === 'plane' || mode === 'drone' ? 'aviation' : mode === 'rocket' ? 'space' : mode === 'walk' ? 'person' : 'road'))
    },
    position: { x, y, z },
    velocity: {
      x: finite(actor.vx ?? actor.velocity?.x),
      y: finite(actor.vy ?? actor.velocity?.y ?? actor.climbRate),
      z: finite(actor.vz ?? actor.velocity?.z)
    },
    orientation: {
      yaw: finite(actor.yaw ?? actor.angle),
      pitch: finite(actor.pitch),
      roll: finite(actor.roll)
    },
    bounds: options.bounds || { radius: 1, height: 2 },
    contact: {
      grounded: options.grounded ?? !actor.airborne,
      kind: String(options.contactKind || actor.contactKind || '')
    },
    condition: {
      value: condition.condition,
      band: condition.band,
      operable: condition.operable,
      durabilityPolicy: String(options.durabilityPolicy || actor.durabilityPolicy || 'standard')
    },
    interaction: {
      playable: options.playable !== false,
      enterable: options.enterable !== false,
      companionAboard: options.companionAboard !== false
    }
  };
}

// Position readers share the same selection without allocating condition,
// catalog, bounds and interaction snapshots on the map/activity frame path.
function controlledBody(context, control) {
  switch (control.mode) {
    case 'ocean': return control.locomotion === 'swim'
      ? context.oceanMode?.diver?.navigationActor() : context.oceanMode?.submarine;
    case 'rocket': return context.spaceFlight?.rocket;
    case 'boat': return control.occupancy === 'vessel-deck'
      ? context.boatDeck?.navigationActor() : context.boat;
    case 'plane': return context.planeMode;
    case 'drone': return context.drone;
    case 'walk': return context.Walk?.state?.walker;
    default: return context.car;
  }
}

function resolveTransportActor(appCtx) {
  const control = resolveControlState(appCtx);
  const mode = control.mode;
  const body = controlledBody(appCtx, control);
  const record = options => {
    const result = actorRecord(mode, body, options);
    return result ? {...result, ...control} : null;
  };
  if (mode === 'ocean' && appCtx.oceanMode?.diver?.active) {
    return record({domain:'person',catalogId:'scuba-explorer',bounds:{radius:.35,height:1.7},grounded:false,contactKind:'water_column',enterable:false,companionAboard:false});
  }
  if (mode === 'ocean') {
    return record({
      bounds: { radius: 2.6, height: 2.4 },
      grounded: false,
      contactKind: 'water_column'
    });
  }
  if (mode === 'rocket') {
    return record({
      bounds: { radius: 2, height: 5 },
      grounded: false,
      contactKind: 'space'
    });
  }
  if (mode === 'boat' && appCtx.boatDeck?.active) {
    return record({domain:'person',catalogId:'research-deck-explorer',bounds:{radius:.35,height:1.7},grounded:true,contactKind:'vessel_deck',enterable:false,companionAboard:false});
  }
  if (mode === 'boat') {
    const catalog = getMaritimeCatalogEntry(appCtx.boatMode?.transportCatalogId);
    return record({
      bounds: { radius: Math.max(catalog.dimensions.width, catalog.dimensions.length) * .5, height: catalog.dimensions.height },
      grounded: false,
      contactKind: appCtx.boatMode?.waterKind || 'water',
      entityId: appCtx.boatMode?.transportEntityId,
      catalogId: catalog.id,
      durabilityPolicy: catalog.damage.durabilityPolicy
    });
  }
  if (mode === 'plane') {
    const catalog = getAviationCatalogEntry(appCtx.planeMode?.transportCatalogId);
    return record({
      bounds: { radius: Math.max(catalog.dimensions.length, catalog.dimensions.wingspan) * .5, height: catalog.dimensions.height },
      grounded: !appCtx.planeMode?.airborne,
      entityId: appCtx.planeMode?.transportEntityId,
      catalogId: catalog.id,
      durabilityPolicy: catalog.damage.durabilityPolicy
    });
  }
  if (mode === 'drone') {
    return record({
      bounds: { radius: 0.8, height: 0.5 },
      grounded: false,
      contactKind: 'air'
    });
  }
  if (mode === 'walk') {
    return record({
      bounds: { radius: 0.35, height: 1.7 },
      grounded: control.locomotion !== 'swim' && appCtx.Walk?.state?.walker?.onGround !== false,
      contactKind: control.locomotion === 'swim' ? 'water_column' : appCtx.Walk?.state?.walker?.onBuilding ? 'building' : 'ground'
    });
  }
  return record({
    bounds: { radius: 2, height: 1.9 },
    grounded: !appCtx.car?.isAirborne,
    contactKind: appCtx.car?.onRoad ? 'road' : 'terrain',
    entityId: appCtx.urbanSandboxRuntime?.activeVehicle?.id || 'player-default-car',
    catalogId: appCtx.car?.vehicleVariantId || appCtx.car?.transportCatalogId || 'sedan'
  });
}

function activeTransportActor() { return resolveTransportActor(appCtx); }

function bodyPose(body, control) {
  const x = body?.x ?? body?.position?.x;
  const y = body?.y ?? body?.position?.y;
  const z = body?.z ?? body?.position?.z;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return {x:NaN,y:NaN,z:NaN,yaw:0,mode:'unavailable',frame:control.frame};
  }
  return {x,y,z,yaw:finite(body.yaw ?? body.angle),mode:control.locomotion,
    transportMode:control.mode,occupancy:control.occupancy,frame:control.frame,source:control.mode};
}

export function activeActorPose(context = appCtx) {
  const control = resolveControlState(context);
  return bodyPose(controlledBody(context, control), control);
}

function activeEarthActorPosition() {
  const control = resolveControlState(appCtx);
  if (control.frame !== 'surface') return null;
  const body = controlledBody(appCtx, control);
  const pose = bodyPose(body, control);
  if (pose.mode === 'unavailable') return null;
  return {
    x: pose.x, y: pose.y, z: pose.z,
    vx: finite(body.vx ?? body.velocity?.x),
    vy: finite(body.vy ?? body.velocity?.y ?? body.climbRate),
    vz: finite(body.vz ?? body.velocity?.z),
    source: control.mode, occupancy: control.occupancy, locomotion: control.locomotion
  };
}

Object.assign(appCtx, {
  activeEarthActorPosition,
  activeTransportActor,
  currentTransportMode
});

export { activeEarthActorPosition, activeTransportActor, currentTransportMode, resolveTransportActor };
