import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  buildingKey,
  buildingLabel,
  distanceToFootprint,
  listEnterableBuildingSupportsNear,
  pickNearbyEnterableBuildingSupport,
  summarizeSupportType
} from "../building-entry.js?v=7";
import { createInteriorRuntimeUiApi } from "./runtime-ui.js?v=3";
import { elevatorFloorChoices } from './elevator-authority.js?v=1';

let nearbyInteriorScanPromise = null;
let elevatorFloorPicker = null;
const {
  clearPrompt,
  collectInteriorWorldSuppressionStates,
  currentSupportDisplayType,
  disposeObject3D,
  getCandidateCache,
  getTransientHint,
  interiorReferencePosition,
  pointToSegmentDistance,
  prepareExteriorShellForInterior,
  publishInteriorLegendState,
  resetInteriorInteractionCache,
  restoreExteriorShellState,
  restoreInteriorWorldSuppression,
  setCandidateCache,
  setPrompt,
  setTransientHint,
  shortLabel
} = createInteriorRuntimeUiApi();

export function sampleInteriorWalkSurface(x, z, currentY, deps) {
  const active = appCtx.activeInterior;
  if (!active || !Array.isArray(active.walkSurfaces)) return null;
  const walkerFeetY = Number.isFinite(currentY)
    ? Number(currentY)
    : Number.isFinite(appCtx.Walk?.state?.walker?.y)
      ? appCtx.Walk.state.walker.y - (appCtx.Walk?.CFG?.eyeHeight || 1.7)
      : NaN;
  const activeFloorY = Number(active.floorBaseY || 0) + Number(active.activeLevel || 0) * Number(active.floorPlan?.storyHeight || 3.4);
  let best = null;
  const consider = (candidate, priority = 0) => {
    const referenceY = Number.isFinite(walkerFeetY) ? walkerFeetY : activeFloorY;
    const score = Math.abs(candidate.y - referenceY) + priority;
    if (!best || score < best.score) best = { ...candidate, score };
  };
  for (let i = 0; i < active.walkSurfaces.length; i++) {
    const surface = active.walkSurfaces[i];
    if (surface.kind === 'ramp' && surface.start && surface.end) {
      const dx = surface.end.x - surface.start.x;
      const dz = surface.end.z - surface.start.z;
      const lengthSquared = dx * dx + dz * dz;
      if (!(lengthSquared > 0.01)) continue;
      const t = Math.max(0, Math.min(1, ((x - surface.start.x) * dx + (z - surface.start.z) * dz) / lengthSquared));
      const px = surface.start.x + dx * t;
      const pz = surface.start.z + dz * t;
      const lateral = Math.hypot(x - px, z - pz);
      if (lateral > Math.max(0.7, deps.finiteNumber(surface.halfWidth, 1))) continue;
      const rampY = surface.yStart + (surface.yEnd - surface.yStart) * t;
      const referenceY = Number.isFinite(walkerFeetY) ? walkerFeetY : activeFloorY;
      // Stair ramps and floor polygons intentionally overlap in plan view. A
      // walker already following the ramp must keep that continuous surface;
      // otherwise the flat floor wins as soon as the ramp rises by a few
      // centimetres and the character walks through the stairs at lobby height.
      // A vertically distant ramp remains ineligible, preventing a mid-flight
      // snap from the floor to the middle of a staircase.
      const continuousRamp = Math.abs(rampY - referenceY) <= 0.55;
      consider({
        y: rampY,
        source: 'interior_stairs',
        feature: surface,
        dist: lateral,
        pt: { x: px, z: pz }
      }, continuousRamp ? -0.7 : 0.25);
      continue;
    }
    if (surface.kind === "polygon") {
      if (!Array.isArray(surface.pts) || surface.pts.length < 3) continue;
      if (!deps.pointInPolygonSafe(x, z, surface.pts)) continue;
      consider({
        y: surface.y,
        source: "interior",
        feature: surface,
        dist: 0
      });
      continue;
    }
    if (surface.kind === "line" && Array.isArray(surface.pts) && surface.pts.length >= 2) {
      let bestLineDist = Infinity;
      let bestPoint = null;
      for (let p = 0; p < surface.pts.length - 1; p++) {
        const hit = pointToSegmentDistance(x, z, surface.pts[p], surface.pts[p + 1]);
        if (hit.dist < bestLineDist) {
          bestLineDist = hit.dist;
          bestPoint = { x: hit.x, z: hit.z };
        }
      }
      const maxDist = Math.max(0.85, deps.finiteNumber(surface.halfWidth, 1));
      if (bestLineDist <= maxDist) {
        consider({
          y: surface.y,
          source: "interior",
          feature: surface,
          dist: bestLineDist,
          pt: bestPoint
        }, bestLineDist * 0.01);
      }
    }
  }
  if (best) delete best.score;
  return best;
}

function applyInteriorSceneState(active, sceneState) {
  active.mode = sceneState.mode;
  active.group = sceneState.group;
  active.walkSurfaces = sceneState.walkSurfaces;
  active.placementTargets = sceneState.placementTargets;
  active.center = sceneState.center;
  active.usableFootprint = sceneState.usableFootprint;
  active.shellClearanceMin = sceneState.shellClearanceMin;
  active.requiredShellClearance = sceneState.requiredShellClearance;
  active.exteriorArea = sceneState.exteriorArea;
  active.usableArea = sceneState.usableArea;
  active.partitionCount = sceneState.partitionCount;
  active.layoutKind = sceneState.layoutKind;
  active.floorPlan = sceneState.floorPlan;
  active.floorId = sceneState.floorId;
  active.floorLabel = sceneState.floorLabel;
  active.floorBaseY = sceneState.floorBaseY;
  active.activeLevel = sceneState.activeLevel;
  active.loadedLevels = sceneState.loadedLevels;
  active.connector = sceneState.connector;
  active.stairs = sceneState.stairs;
  active.interactions = sceneState.interactions;
  active.floorEntryPoint = { ...sceneState.entryPoint };
  active.lobbyEntryPoint = { ...sceneState.lobbyEntryPoint };
}

function replaceActiveInteriorFloor(active, targetLevel, deps) {
  if (!active?.definition || active.floorTransitionPending) return false;
  const nextLevel = Math.max(0, Math.min(active.floorPlan.floorCount - 1, Math.round(targetLevel)));
  if (nextLevel === active.activeLevel) return true;
  active.floorTransitionPending = true;
  const previousGroup = active.group;
  try {
    const sceneState = deps.buildInteriorScene(active.definition, {
      activeLevel: nextLevel,
      floorBaseY: active.floorBaseY,
      curatedHome: !!active.ownedHome
    });
    deps.disposeCuratedHomeFurnishing?.(active);
    appCtx.scene.add(sceneState.group);
    appCtx.replaceWorldCollection('dynamicBuildingColliders', sceneState.dynamicColliders.slice());
    applyInteriorSceneState(active, sceneState);
    disposeObject3D(previousGroup);
    void deps.attachCuratedHomeFurnishing?.(active);
    resetInteriorInteractionCache();
    return true;
  } finally {
    active.floorTransitionPending = false;
  }
}

function nearestInteriorInteraction(active, walker) {
  if (!active || !walker || !Array.isArray(active.interactions)) return null;
  const feetY = walker.y - (appCtx.Walk?.CFG?.eyeHeight || 1.7);
  const traversalPriority = {
    'ship-exit': 0,
    'ship-door': 1,
    'ship-lift': 2,
    'ship-incident-step': 3,
    'ship-station': 4,
    'ship-crew': 5
  };
  return active.interactions.map((interaction) => ({
    ...interaction,
    interactionPriority: traversalPriority[interaction.kind] ?? 4,
    distance: Math.hypot(interaction.x - walker.x, interaction.z - walker.z),
    verticalDistance: Math.abs(
      active.floorBaseY + interaction.level * active.floorPlan.storyHeight - feetY
    )
  })).filter((interaction) => interaction.distance <= interaction.radius && interaction.verticalDistance <= 1.15)
    .sort((a, b) => {
      // Moving crew can cross a doorway while the player is trying to use it.
      // Conversation must not mask a nearby door, lift, exit, or workstation;
      // the crew remains available once no fixed interaction is in range.
      if ((a.kind === 'ship-crew') !== (b.kind === 'ship-crew')) {
        return a.kind === 'ship-crew' ? 1 : -1;
      }
      // Adjacent pressure doors and workstations have intentionally generous
      // touch radii. Prefer the clearly closer object so a doorway cannot
      // consume E while the player is standing directly at a console.
      if (Math.abs(a.distance - b.distance) > 0.35) return a.distance - b.distance;
      return a.interactionPriority - b.interactionPriority || a.distance - b.distance;
    })[0] || null;
}

function closeElevatorFloorPicker(active = appCtx.activeInterior) {
  elevatorFloorPicker?.remove?.();
  elevatorFloorPicker = null;
  if (active) active.elevatorPickerOpen = false;
}

function travelByElevator(active, targetLevel, deps) {
  if (!Number.isFinite(Number(targetLevel))) return false;
  closeElevatorFloorPicker(active);
  if (!replaceActiveInteriorFloor(active, Number(targetLevel), deps)) return false;
  const walker = appCtx.Walk?.state?.walker;
  if (!walker || !active.connector) return false;
  const eyeHeight = appCtx.Walk?.CFG?.eyeHeight || 1.7;
  walker.x = active.connector.elevator.x + active.connector.axis.x * 1.45;
  walker.z = active.connector.elevator.z + active.connector.axis.z * 1.45;
  walker.y = active.floorBaseY + active.activeLevel * active.floorPlan.storyHeight + eyeHeight + 0.05;
  walker.vy = 0;
  walker._resolvedGroundState = null;
  active.lastValidPosition = {
    x: walker.x,
    z: walker.z,
    y: walker.y,
    yaw: deps.finiteNumber(walker.yaw || walker.angle, 0),
    angle: deps.finiteNumber(walker.angle, 0)
  };
  setTransientHint(`${active.floorLabel} · doors opening.`, 1500, deps);
  return true;
}

function openElevatorFloorPicker(active, deps) {
  if (!active?.floorPlan || active.floorPlan.floorCount <= 1 || typeof document === 'undefined') return false;
  closeElevatorFloorPicker(active);
  const choices = elevatorFloorChoices(active.floorPlan, active.activeLevel);
  const picker = document.createElement('section');
  picker.id = 'interiorElevatorFloorPicker';
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-label', 'Choose an elevator floor');
  picker.style.cssText = 'position:fixed;left:50%;bottom:max(92px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:10020;width:min(360px,calc(100vw - 24px));max-height:min(56vh,430px);overflow:auto;padding:14px;border:1px solid rgba(148,197,255,.65);border-radius:12px;background:rgba(8,18,28,.96);box-shadow:0 18px 50px rgba(0,0,0,.45);color:#f8fafc;font:500 13px Inter,sans-serif;';
  picker.innerHTML = `<div style="display:flex;align-items:start;justify-content:space-between;gap:12px;margin-bottom:10px;"><div><strong style="display:block;font:700 16px Orbitron,sans-serif;">Elevator</strong><span style="display:block;margin-top:3px;color:#b8c7d9;">Choose a floor</span></div><button type="button" data-elevator-close aria-label="Close elevator controls" style="border:0;background:transparent;color:#fff;font-size:22px;line-height:1;cursor:pointer;">×</button></div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">${choices.map((choice) => `<button type="button" data-elevator-level="${choice.level}" ${choice.current ? 'disabled aria-current="true"' : ''} style="min-height:46px;padding:9px 10px;border:1px solid ${choice.current ? '#64748b' : '#60a5fa'};border-radius:8px;background:${choice.current ? 'rgba(71,85,105,.55)' : 'rgba(30,64,175,.5)'};color:#fff;font:700 12px Inter,sans-serif;cursor:${choice.current ? 'default' : 'pointer'};">${choice.direction === 'up' ? '↑ ' : choice.direction === 'down' ? '↓ ' : '• '}${choice.label}${choice.current ? ' · Here' : ''}</button>`).join('')}</div>`;
  picker.querySelector('[data-elevator-close]')?.addEventListener('click', () => closeElevatorFloorPicker(active));
  picker.querySelectorAll('[data-elevator-level]').forEach((button) => {
    button.addEventListener('click', () => travelByElevator(active, Number(button.dataset.elevatorLevel), deps));
  });
  document.body.appendChild(picker);
  elevatorFloorPicker = picker;
  active.elevatorPickerOpen = true;
  picker.querySelector('[data-elevator-level]:not([disabled])')?.focus?.();
  return true;
}

function refreshActiveFloorFromHeight(active, walker, deps) {
  if (!active?.floorPlan || active.floorPlan.floorCount <= 1 || active.floorTransitionPending) return;
  const feetY = walker.y - (appCtx.Walk?.CFG?.eyeHeight || 1.7);
  const relative = (feetY - active.floorBaseY) / active.floorPlan.storyHeight;
  const nearestLevel = Math.max(0, Math.min(active.floorPlan.floorCount - 1, Math.round(relative)));
  const targetFloorY = active.floorBaseY + nearestLevel * active.floorPlan.storyHeight;
  if (nearestLevel === active.activeLevel || Math.abs(feetY - targetFloorY) > 0.45) return;
  replaceActiveInteriorFloor(active, nearestLevel, deps);
}

export function listSupportedInteriorsNear(x, z, radius = 220, limit = 8, deps) {
  const supports = listEnterableBuildingSupportsNear(x, z, radius, limit, { allowSynthetic: true });
  return supports.map((support) => {
    const cached = support?.key ? deps.interiorCache.get(support.key) : null;
    const mappedState = cached?.mode === "mapped" ? "mapped" : cached?.mode === "generated" ? "generated" : "unknown";
    const badge = summarizeSupportType(support, mappedState);
    const building = support.building || support.destination || {};
    const exteriorEntrance = support.exteriorEntrance || null;
    return {
      key: support.key,
      label: support.label || buildingLabel(support.building || support.destination),
      x: deps.finiteNumber(support.center?.x, deps.finiteNumber(support.entryAnchor?.x, 0)),
      z: deps.finiteNumber(support.center?.z, deps.finiteNumber(support.entryAnchor?.z, 0)),
      distance: deps.finiteNumber(support.distance, 0),
      sourceBuildingId: String(building.sourceBuildingId || building.id || ''),
      sourceLevels: Number.isFinite(Number(building.levels)) ? Number(building.levels) : null,
      sourceHeight: Number.isFinite(Number(building.height)) ? Number(building.height) : null,
      bounds: {
        minX: deps.finiteNumber(building.minX, 0),
        maxX: deps.finiteNumber(building.maxX, 0),
        minZ: deps.finiteNumber(building.minZ, 0),
        maxZ: deps.finiteNumber(building.maxZ, 0)
      },
      entryAnchor: support.entryAnchor ? {
        x: deps.finiteNumber(support.entryAnchor.x, 0),
        z: deps.finiteNumber(support.entryAnchor.z, 0)
      } : null,
      approachTarget: exteriorEntrance ? {
        x: deps.finiteNumber(exteriorEntrance.approachX, exteriorEntrance.x),
        z: deps.finiteNumber(exteriorEntrance.approachZ, exteriorEntrance.z)
      } : support.entryAnchor ? {
        x: deps.finiteNumber(support.entryAnchor.x, 0),
        z: deps.finiteNumber(support.entryAnchor.z, 0)
      } : null,
      mappedEntrance: exteriorEntrance != null,
      connectorEligible: deps.canPublishInteriorConnector?.(support) === true,
      supportType: badge,
      mode: cached?.mode || null,
      destinationKind: support.destinationKind || "",
      synthetic: !!support.synthetic
    };
  });
}

export async function scanNearbyInteriorSupport(options = {}, deps) {
  if (nearbyInteriorScanPromise) return nearbyInteriorScanPromise;

  const radius = Number.isFinite(options.radius) ? Math.max(40, options.radius) : 240;
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(8, options.limit)) : 6;
  const ref = interiorReferencePosition(deps);
  const supports = listEnterableBuildingSupportsNear(ref.x, ref.z, radius, limit, { allowSynthetic: true });

  publishInteriorLegendState({
    loading: supports.length > 0,
    message: supports.length > 0 ? "Scanning nearby enterable buildings..." : "No enterable buildings nearby yet.",
    items: listSupportedInteriorsNear(ref.x, ref.z, radius, limit, deps)
  }, deps);

  nearbyInteriorScanPromise = (async () => {
    for (let i = 0; i < supports.length; i++) {
      const support = supports[i];
      if (!support?.allowMappedData) continue;
      try {
        await deps.warmMappedInteriorDefinition(support);
        publishInteriorLegendState({
          loading: true,
          message: "Scanning nearby enterable buildings...",
          items: listSupportedInteriorsNear(ref.x, ref.z, radius, limit, deps)
        }, deps);
      } catch (error) {
        console.warn("[Interior] Nearby support scan failed for", support.label, error);
      }
    }

    const items = listSupportedInteriorsNear(ref.x, ref.z, radius, limit, deps);
    publishInteriorLegendState({
      loading: false,
      message: items.length > 0 ? "" : "No enterable buildings identified nearby yet.",
      items
    }, deps);
    nearbyInteriorScanPromise = null;
    return items;
  })();

  return nearbyInteriorScanPromise;
}

export async function enterInteriorForSupport(support, deps) {
  if (!support?.enterable || !deps.isWalkModeActive()) return false;
  const key = support.key;
  if (appCtx.activeInterior && appCtx.activeInterior.key === key) {
    return true;
  }
  if (appCtx.activeInterior && appCtx.activeInterior.key !== key) {
    clearActiveInterior({ restorePlayer: true, preserveCache: true }, deps);
  }

  const definition = await deps.resolveInteriorDefinitionForEntry(support);
  if (!definition) {
    setTransientHint(`${support.label || "This building"} is not enterable right now.`, deps.INTERIOR_NOTICE_MS, deps);
    return false;
  }

  const ownedHome = deps.findOwnedHomeForInteriorSupport?.(support) || null;
  const sceneState = deps.buildInteriorScene(definition, { curatedHome: !!ownedHome });
  appCtx.scene.add(sceneState.group);
  appCtx.replaceWorldCollection('dynamicBuildingColliders', sceneState.dynamicColliders.slice());

  const exteriorShellState = support.synthetic ? [] : prepareExteriorShellForInterior(support.building);
  const suppressedWorldMeshes = collectInteriorWorldSuppressionStates(
    sceneState.exteriorFootprint,
    sceneState.center,
    sceneState.suppressionRadius || 48,
    deps
  );
  if (support.building && !support.synthetic) {
    support.building.collisionDisabled = true;
  }

  const walker = appCtx.Walk.state.walker;
  const outsideState = {
    x: deps.finiteNumber(walker.x, 0),
    z: deps.finiteNumber(walker.z, 0),
    y: deps.finiteNumber(walker.y, 0),
    yaw: deps.finiteNumber(walker.yaw || walker.angle, 0),
    angle: deps.finiteNumber(walker.angle, 0),
    pitch: deps.finiteNumber(walker.pitch, 0),
    lookYawOffset: deps.finiteNumber(walker.lookYawOffset, 0)
  };

  walker.x = sceneState.entryPoint.x;
  walker.z = sceneState.entryPoint.z;
  walker.y = sceneState.entryPoint.y;
  const entryYaw = Math.atan2(sceneState.center.x - walker.x, sceneState.center.z - walker.z);
  walker.angle = entryYaw;
  walker.yaw = entryYaw;
  walker.pitch = 0;
  walker.lookYawOffset = 0;
  walker.vy = 0;
  if (appCtx.car) {
    appCtx.car.x = walker.x;
    appCtx.car.z = walker.z;
  }
  const previousView = appCtx.Walk?.state?.view || "third";
  if (appCtx.Walk?.state) {
    appCtx.Walk.state.view = "first";
    if (appCtx.Walk.state.characterMesh) {
      appCtx.Walk.state.characterMesh.visible = false;
    }
  }

  const entryHeight = sceneState.entryPoint.y;
  appCtx.activeInterior = {
    key,
    label: definition.label,
    mode: sceneState.mode,
    definition,
    support,
    building: support.building,
    ownedHome,
    group: sceneState.group,
    exteriorShellState,
    suppressedWorldMeshes,
    walkSurfaces: sceneState.walkSurfaces,
    placementTargets: sceneState.placementTargets,
    center: sceneState.center,
    usableFootprint: sceneState.usableFootprint,
    shellClearanceMin: sceneState.shellClearanceMin,
    requiredShellClearance: sceneState.requiredShellClearance,
    exteriorArea: sceneState.exteriorArea,
    usableArea: sceneState.usableArea,
    partitionCount: sceneState.partitionCount,
    layoutKind: sceneState.layoutKind,
    outsideState,
    previousView,
    entryPoint: { ...sceneState.entryPoint },
    lastValidPosition: {
      x: sceneState.entryPoint.x,
      z: sceneState.entryPoint.z,
      y: entryHeight,
      yaw: deps.finiteNumber(walker.yaw || walker.angle, 0),
      angle: deps.finiteNumber(walker.angle, 0)
    },
    containmentNoticeUntil: 0,
    floorTransitionPending: false
  };
  applyInteriorSceneState(appCtx.activeInterior, sceneState);
  void deps.attachCuratedHomeFurnishing?.(appCtx.activeInterior);
  appCtx.interiorHint = {
    state: "inside",
    label: definition.label,
    mode: sceneState.mode
  };
  resetInteriorInteractionCache();
  publishInteriorLegendState({}, deps);
  return true;
}

export function clearActiveInterior(options = {}, deps) {
  const active = appCtx.activeInterior;
  if (active?.environmentKind === 'expedition-ship' && options.shipInternal !== true) {
    return appCtx.exitExpeditionShipInterior?.() === true;
  }
  if (!active) {
    closeElevatorFloorPicker(null);
    appCtx.replaceWorldCollection('dynamicBuildingColliders');
    if (!options.preservePrompt) clearPrompt();
    return false;
  }

  closeElevatorFloorPicker(active);

  if (options.restorePlayer !== false && deps.isWalkModeActive() && active.outsideState) {
    const walker = appCtx.Walk.state.walker;
    walker.x = active.outsideState.x;
    walker.z = active.outsideState.z;
    walker.y = active.outsideState.y;
    walker.yaw = active.outsideState.yaw;
    walker.angle = active.outsideState.angle;
    walker.pitch = deps.finiteNumber(active.outsideState.pitch, 0);
    walker.lookYawOffset = deps.finiteNumber(active.outsideState.lookYawOffset, 0);
    walker.vy = 0;
    if (appCtx.car) {
      appCtx.car.x = walker.x;
      appCtx.car.z = walker.z;
    }
  }

  if (appCtx.Walk?.state) {
    appCtx.Walk.state.view = active.previousView || "third";
    if (appCtx.Walk.state.characterMesh) {
      appCtx.Walk.state.characterMesh.visible = appCtx.Walk.state.view !== "first";
    }
  }

  if (active.building && !active.support?.synthetic) {
    active.building.collisionDisabled = false;
  }
  restoreExteriorShellState(active.exteriorShellState);
  restoreInteriorWorldSuppression(active.suppressedWorldMeshes);
  appCtx.replaceWorldCollection('dynamicBuildingColliders');
  deps.disposeCuratedHomeFurnishing?.(active);
  disposeObject3D(active.group);
  appCtx.activeInterior = null;
  appCtx.interiorHint = null;
  resetInteriorInteractionCache();
  publishInteriorLegendState({}, deps);
  if (!options.preservePrompt) clearPrompt();
  return true;
}

function keepActiveInteriorContained(deps) {
  const active = appCtx.activeInterior;
  if (!active || !deps.isWalkModeActive()) return;
  const walker = appCtx.Walk?.state?.walker;
  if (!walker) return;

  const interiorSurface = sampleInteriorWalkSurface(
    walker.x,
    walker.z,
    walker.y - (appCtx.Walk?.CFG?.eyeHeight || 1.7),
    deps
  );
  const inside = Array.isArray(active.usableFootprint) && active.usableFootprint.length >= 3 ?
    deps.pointInPolygonSafe(walker.x, walker.z, active.usableFootprint) :
    true;

  if (interiorSurface && inside) {
    refreshActiveFloorFromHeight(active, walker, deps);
    active.lastValidPosition = {
      x: walker.x,
      z: walker.z,
      y: deps.finiteNumber(walker.y, active.entryPoint?.y || 0),
      yaw: deps.finiteNumber(walker.yaw || walker.angle, 0),
      angle: deps.finiteNumber(walker.angle, 0)
    };
    return;
  }

  const footprintHit = Array.isArray(active.usableFootprint) && active.usableFootprint.length >= 3 ?
    distanceToFootprint(walker.x, walker.z, { pts: active.usableFootprint }) :
    { dist: Infinity };
  if (inside || footprintHit.dist <= 0.55) return;

  const now = performance.now();
  if (now < deps.finiteNumber(active.containmentNoticeUntil, 0)) return;

  const safe = active.lastValidPosition || active.entryPoint || active.outsideState;
  if (!safe) return;
  walker.x = deps.finiteNumber(safe.x, walker.x);
  walker.z = deps.finiteNumber(safe.z, walker.z);
  walker.y = deps.finiteNumber(safe.y, walker.y);
  walker.yaw = deps.finiteNumber(safe.yaw || safe.angle, walker.yaw || walker.angle);
  walker.angle = deps.finiteNumber(safe.angle || safe.yaw, walker.angle);
  walker.vy = 0;
  if (appCtx.car) {
    appCtx.car.x = walker.x;
    appCtx.car.z = walker.z;
  }
  active.containmentNoticeUntil = now + 900;
}

function pickNearbyBuildingCandidate(force = false, deps) {
  if (!deps.isWalkModeActive()) return null;
  const walker = appCtx.Walk.state.walker;
  const now = performance.now();
  const candidateCache = getCandidateCache();
  const movedDistance =
    Number.isFinite(candidateCache.x) && Number.isFinite(candidateCache.z) ?
      Math.hypot(walker.x - candidateCache.x, walker.z - candidateCache.z) :
      Infinity;
  if (
    !force &&
    now - candidateCache.at <= deps.INTERIOR_INTERACTION_REFRESH_MS &&
    movedDistance <= deps.INTERIOR_INTERACTION_MOVE_EPSILON
  ) {
    return candidateCache.candidate;
  }

  const candidate = pickNearbyEnterableBuildingSupport(walker.x, walker.z, {
    radius: deps.INTERIOR_ENTRY_RADIUS,
    allowSynthetic: true,
    actorBaseY: Number.isFinite(walker.y) ?
      walker.y - (appCtx.Walk?.CFG?.eyeHeight || 1.7) :
      NaN,
    actorHeight: (appCtx.Walk?.CFG?.eyeHeight || 1.7) * 0.95
  });
  setCandidateCache({
    at: now,
    x: walker.x,
    z: walker.z,
    candidate
  });
  return candidate;
}

export async function handleInteriorAction(deps) {
  if (appCtx.activeInterior) {
    const active = appCtx.activeInterior;
    const interaction = nearestInteriorInteraction(active, appCtx.Walk?.state?.walker);
    if (['ship-station', 'ship-exit', 'ship-door', 'ship-lift', 'ship-incident-step', 'ship-crew'].includes(interaction?.kind)) {
      return (await appCtx.handleShipInteriorInteraction?.(interaction)) !== false;
    }
    if (interaction?.kind === 'exit') {
      clearActiveInterior({ restorePlayer: true, preserveCache: true }, deps);
      return true;
    }
    if (interaction?.kind === 'elevator') return openElevatorFloorPicker(active, deps);
    return false;
  }
  const candidate = pickNearbyBuildingCandidate(true, deps);
  if (!candidate?.support?.enterable) return false;
  await enterInteriorForSupport(candidate.support, deps);
  return true;
}

export function updateInteriorInteraction(deps) {
  const now = performance.now();

  if (!deps.isWalkModeActive()) {
    closeElevatorFloorPicker(appCtx.activeInterior);
    appCtx.interiorHint = null;
    resetInteriorInteractionCache();
    const transientHint = getTransientHint();
    if (transientHint.text && transientHint.until > now) {
      setPrompt(transientHint.text, "notice");
      return;
    }
    clearPrompt();
    return;
  }

  if (appCtx.activeInterior) {
    keepActiveInteriorContained(deps);
    const active = appCtx.activeInterior;
    const label = active.label || "Interior";
    const interaction = nearestInteriorInteraction(active, appCtx.Walk?.state?.walker);
    appCtx.interiorHint = {
      state: "inside",
      label,
      mode: active.mode || "generated",
      floorId: active.floorId || '',
      floorLabel: active.floorLabel || 'Lobby',
      activeLevel: active.activeLevel || 0,
      loadedLevels: active.loadedLevels || []
    };
    resetInteriorInteractionCache();
    if (interaction) setPrompt(
      interaction.kind === 'elevator' ? 'E Choose elevator floor' : `E ${interaction.label}`,
      interaction.kind === 'elevator' ? 'supported' : 'active'
    );
    else clearPrompt();
    return;
  }

  const candidate = pickNearbyBuildingCandidate(false, deps);
  if (candidate?.support?.enterable) {
    const support = candidate.support;
    const type = currentSupportDisplayType(support, deps);
    const label = support.label || buildingLabel(support.building || support.destination);
    appCtx.interiorHint = {
      state: "enterable",
      key: support.key || '',
      sourceBuildingId: buildingKey(support.building || support.destination),
      label,
      type,
      distance: candidate.distance
    };
    setPrompt(`E Enter ${shortLabel(label, 24)}`, type === "Mapped" ? "supported" : "inspect");
    return;
  }

  appCtx.interiorHint = null;
  const transientHint = getTransientHint();
  if (transientHint.text && transientHint.until > now) {
    setPrompt(transientHint.text, "notice");
    return;
  }
  clearPrompt();
}
