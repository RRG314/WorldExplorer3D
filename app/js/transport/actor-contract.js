import { ctx as appCtx } from '../shared-context.js?v=55';
import { transportDamagePresentation } from './damage-model.js?v=1';
import { getAviationCatalogEntry } from './aviation-catalog.js?v=2';
import { getMaritimeCatalogEntry } from './maritime-catalog.js?v=1';

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function currentTransportMode() {
  if (appCtx.oceanMode?.active) return 'ocean';
  if (appCtx.spaceFlight?.active) return 'rocket';
  if (appCtx.boatMode?.active) return 'boat';
  if (appCtx.planeMode?.active) return 'plane';
  if (appCtx.droneMode) return 'drone';
  if (appCtx.Walk?.state?.mode === 'walk') return 'walk';
  return 'drive';
}

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

function activeTransportActor() {
  const mode = currentTransportMode();
  if (mode === 'ocean') {
    return actorRecord(mode, appCtx.oceanMode?.submarine, {
      bounds: { radius: 2.6, height: 2.4 },
      grounded: false,
      contactKind: 'water_column'
    });
  }
  if (mode === 'rocket') {
    return actorRecord(mode, appCtx.spaceFlight?.rocket, {
      bounds: { radius: 2, height: 5 },
      grounded: false,
      contactKind: 'space'
    });
  }
  if (mode === 'boat') {
    const catalog = getMaritimeCatalogEntry(appCtx.boatMode?.transportCatalogId);
    return actorRecord(mode, appCtx.boat, {
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
    return actorRecord(mode, appCtx.planeMode, {
      bounds: { radius: Math.max(catalog.dimensions.length, catalog.dimensions.wingspan) * .5, height: catalog.dimensions.height },
      grounded: !appCtx.planeMode?.airborne,
      entityId: appCtx.planeMode?.transportEntityId,
      catalogId: catalog.id,
      durabilityPolicy: catalog.damage.durabilityPolicy
    });
  }
  if (mode === 'drone') {
    return actorRecord(mode, appCtx.drone, {
      bounds: { radius: 0.8, height: 0.5 },
      grounded: false,
      contactKind: 'air'
    });
  }
  if (mode === 'walk') {
    return actorRecord(mode, appCtx.Walk?.state?.walker, {
      bounds: { radius: 0.35, height: 1.7 },
      grounded: appCtx.Walk?.state?.walker?.onGround !== false,
      contactKind: appCtx.Walk?.state?.walker?.onBuilding ? 'building' : 'ground'
    });
  }
  return actorRecord(mode, appCtx.car, {
    bounds: { radius: 2, height: 1.9 },
    grounded: !appCtx.car?.isAirborne,
    contactKind: appCtx.car?.onRoad ? 'road' : 'terrain',
    entityId: appCtx.urbanSandboxRuntime?.activeVehicle?.id || 'player-default-car',
    catalogId: appCtx.car?.vehicleVariantId || appCtx.car?.transportCatalogId || 'sedan'
  });
}

function activeEarthActorPosition() {
  const actor = activeTransportActor();
  if (!actor || actor.mode === 'ocean' || actor.mode === 'rocket') return null;
  return {
    x: actor.position.x,
    y: actor.position.y,
    z: actor.position.z,
    vx: actor.velocity.x,
    vy: actor.velocity.y,
    vz: actor.velocity.z,
    source: actor.source
  };
}

Object.assign(appCtx, {
  activeEarthActorPosition,
  activeTransportActor,
  currentTransportMode
});

export { activeEarthActorPosition, activeTransportActor, currentTransportMode };
