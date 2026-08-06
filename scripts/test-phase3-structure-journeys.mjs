import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { classifyEvidence } from './production-readiness.mjs';
import { mkdirp, startServer } from './runtime-test-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'phase3-structure-journeys');
const host = '127.0.0.1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadWorld(page, locationSpec) {
  return page.evaluate(async (spec) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const deadline = performance.now() + 60000;
    while (
      performance.now() < deadline &&
      (
        typeof ctx?.loadRoads !== 'function' ||
        typeof ctx?.switchEnv !== 'function' ||
        !ctx?.ENV?.EARTH
      )
    ) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (typeof ctx?.loadRoads !== 'function' || !ctx?.ENV?.EARTH) {
      return { ok: false, reason: 'runtime helpers unavailable' };
    }
    if (spec.kind === 'custom') {
      ctx.customLoc = {
        lat: Number(spec.lat),
        lon: Number(spec.lon),
        name: String(spec.label)
      };
      ctx.customLocTransient = false;
      ctx.selLoc = 'custom';
    } else {
      ctx.selLoc = String(spec.key);
    }
    ctx.gameMode = 'free';
    ctx.loadingScreenMode = 'earth';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    ['hud', 'minimap', 'floatMenuContainer', 'mainMenuBtn', 'controlsTab', 'coords'].forEach((id) => {
      document.getElementById(id)?.classList.add('show');
    });
    await ctx.loadRoads();
    ctx.setTravelMode?.('drive', {
      source: 'phase3_structure_journey',
      emitTutorial: false,
      force: true
    });
    return {
      ok: true,
      acceptedGround: ctx.getAcceptedGroundRuntimeSnapshot?.() || null,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      structures: (ctx.roads || []).reduce((counts, road) => {
        const kind = String(
          road?.transportStructureRef?.kind ||
          road?.structureSemantics?.structureKind ||
          'at_grade'
        );
        counts[kind] = (counts[kind] || 0) + 1;
        const visualKind = String(road?.tunnelSystemModel?.visualKind || '');
        if (visualKind) counts[`visual:${visualKind}`] = (counts[`visual:${visualKind}`] || 0) + 1;
        return counts;
      }, {})
    };
  }, locationSpec);
}

async function waitForWorld(page) {
  await page.waitForFunction(() => {
    const loading = document.getElementById('loading');
    return !loading?.classList.contains('show');
  }, null, { timeout: 150000 });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return (
      ctx?.worldLoading === false &&
      Array.isArray(ctx?.roads) &&
      ctx.roads.length > 300 &&
      ctx?.transportStructureModel?.authority === 'compiled_transport_structures'
    );
  }, null, { timeout: 150000 });
}

async function journeyAvailability(page, journeySpecs) {
  return page.evaluate(async (specs) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return specs.map((spec) => {
      const candidates = (ctx.roads || []).filter((road) =>
        road?.structureSemantics?.structureKind === spec.kind &&
        (!spec.refKind || road?.transportStructureRef?.kind === spec.refKind) &&
        (!spec.visualKind || road?.tunnelSystemModel?.visualKind === spec.visualKind) &&
        road?.transportStructureRef?.driveable === true &&
        Array.isArray(road?.pts) &&
        road.pts.length >= 2
      );
      return {
        id: spec.id,
        available: candidates.length > 0,
        candidateCount: candidates.length
      };
    });
  }, journeySpecs);
}

async function prepareJourney(page, journeySpec) {
  return page.evaluate(async (spec) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (!ctx) return { ok: false, reason: 'shared context unavailable' };
    const targetKind = String(spec.kind);
    const segmentLength = (road, index) => Math.hypot(
      road.pts[index + 1].x - road.pts[index].x,
      road.pts[index + 1].z - road.pts[index].z
    );
    const candidates = (ctx.roads || [])
      .filter((road) =>
        road?.structureSemantics?.structureKind === targetKind &&
        (!spec.refKind || road?.transportStructureRef?.kind === spec.refKind) &&
        (!spec.visualKind || road?.tunnelSystemModel?.visualKind === spec.visualKind) &&
        road?.transportStructureRef?.driveable === true &&
        Array.isArray(road?.pts) &&
        road.pts.length >= 2
      )
      .map((road) => {
        let totalLength = 0;
        let bestIndex = 0;
        let bestLength = 0;
        for (let index = 0; index < road.pts.length - 1; index += 1) {
          const length = segmentLength(road, index);
          totalLength += length;
          if (length > bestLength) {
            bestLength = length;
            bestIndex = index;
          }
        }
        const shellRange = targetKind === 'tunnel'
          ? [...(road?.tunnelSystemModel?.shellRanges || [])]
              .filter((range) =>
                Number.isFinite(range?.start) &&
                Number.isFinite(range?.end)
              )
              .sort((left, right) =>
                (right.end - right.start) - (left.end - left.start)
              )[0] || null
          : null;
        return { road, segmentIndex: bestIndex, segmentLength: bestLength, totalLength, shellRange };
      })
      .filter((candidate) =>
        candidate.segmentLength >= 12 &&
        (
          targetKind !== 'tunnel' ||
          candidate.shellRange?.end - candidate.shellRange?.start >= 12
        ) &&
        (
          !spec.physicalExit ||
          candidate.road?.transportStructureRef?.end?.state !== 'structure_continuation'
        ) &&
        (
          !spec.requireEndConnection ||
          (candidate.road?.connectedFeatures?.end || []).some((link) =>
            link?.feature?.driveable !== false &&
            Array.isArray(link?.feature?.pts)
          )
        )
      )
      .sort((left, right) => right.segmentLength - left.segmentLength);
    const candidateIndex = Math.max(0, Math.floor(Number(spec.candidateIndex) || 0));
    const target = candidates[candidateIndex] || null;
    if (!target) {
      return {
        ok: false,
        reason: `no driveable ${targetKind} segment`,
        availableKinds: (ctx.roads || []).reduce((counts, road) => {
          const kind = road?.structureSemantics?.structureKind;
          if (kind && kind !== 'at_grade') counts[kind] = (counts[kind] || 0) + 1;
          return counts;
        }, {})
      };
    }
    let selectedSegmentIndex = target.segmentIndex;
    let t = target.segmentLength > 45 ? 0.25 : 0.45;
    if (target.shellRange || Number.isFinite(Number(spec.startDistanceFromEnd))) {
      const shellProgress = Number.isFinite(Number(spec.shellProgress))
        ? Math.max(0.1, Math.min(0.9, Number(spec.shellProgress)))
        : 0.5;
      const station = target.shellRange
        ? target.shellRange.start +
          (target.shellRange.end - target.shellRange.start) * shellProgress
        : Math.max(
            0,
            target.totalLength - Math.max(6, Number(spec.startDistanceFromEnd))
          );
      let traveled = 0;
      for (let index = 0; index < target.road.pts.length - 1; index += 1) {
        const length = segmentLength(target.road, index);
        if (station <= traveled + length || index === target.road.pts.length - 2) {
          selectedSegmentIndex = index;
          t = Math.max(0, Math.min(1, (station - traveled) / Math.max(0.001, length)));
          break;
        }
        traveled += length;
      }
    }
    const start = target.road.pts[selectedSegmentIndex];
    const end = target.road.pts[selectedSegmentIndex + 1];
    const x = start.x + (end.x - start.x) * t;
    const z = start.z + (end.z - start.z) * t;
    const angle = Math.atan2(end.x - start.x, end.z - start.z);
    const surfaceY = Number(ctx.sampleFeatureSurfaceY?.(
      target.road,
      x,
      z,
      { segIndex: selectedSegmentIndex, t }
    ));
    if (!Number.isFinite(surfaceY)) {
      return { ok: false, reason: `${targetKind} surface unavailable` };
    }
    ctx.setTravelMode?.('drive', {
      source: 'phase3_structure_journey',
      emitTutorial: false,
      force: true
    });
    ctx.applyResolvedWorldSpawn?.({
      valid: true,
      mode: 'drive',
      x,
      z,
      angle,
      carY: surfaceY + 1.2,
      walkY: surfaceY + 1.7,
      onRoad: true,
      road: target.road,
      source: 'phase3_structure_journey_setup'
    }, { mode: 'drive' });
    Object.assign(ctx.car, {
      speed: 0,
      vFwd: 0,
      vLat: 0,
      vx: 0,
      vz: 0,
      yawRate: 0
    });
    const enclosed = targetKind === 'tunnel' || targetKind === 'covered';
    const cameraDistance = enclosed ? 6.5 : 10;
    const cameraHeight = enclosed ? 2.35 : 5;
    ctx.camera?.position?.set?.(
      x - Math.sin(angle) * cameraDistance,
      surfaceY + cameraHeight,
      z - Math.cos(angle) * cameraDistance
    );
    if (ctx.camera?.userData) {
      ctx.camera.userData.lookTarget = { x, y: surfaceY + 0.5, z };
    }
    ctx.camera?.lookAt?.(x, surfaceY + 0.5, z);
    ctx.__phase3JourneyRoad = target.road;
    ctx.__phase3JourneyKind = targetKind;
    return {
      ok: true,
      kind: targetKind,
      sourceFeatureId: String(target.road.sourceFeatureId || ''),
      chainId: String(target.road.transportStructureRef?.chainId || ''),
      routeState: String(target.road.transportStructureRef?.routeState || ''),
      endState: String(target.road.transportStructureRef?.end?.state || ''),
      segmentLength: Number(target.segmentLength.toFixed(2)),
      shellRange: target.shellRange
        ? {
            start: Number(target.shellRange.start.toFixed(2)),
            end: Number(target.shellRange.end.toFixed(2))
          }
        : null,
      start: { x, y: surfaceY, z, angle }
    };
  }, journeySpec);
}

async function sampleJourney(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const feetY = Number(ctx?.car?.y) - 1.2;
    const nearest = ctx?.findNearestRoad?.(
      Number(ctx?.car?.x),
      Number(ctx?.car?.z),
      {
        y: feetY,
        maxVerticalDelta: 8,
        preferredRoad: ctx?.__phase3JourneyRoad
      }
    );
    const collision = ctx?.checkBuildingCollision?.(
      Number(ctx?.car?.x),
      Number(ctx?.car?.z),
      1.15,
      { actorBaseY: feetY, actorHeight: 1.9 }
    );
    const journeyRoad = ctx?.__phase3JourneyRoad;
    const tunnelRanges = journeyRoad?.tunnelSystemModel?.shellRanges || [];
    const nearestTunnelRanges = nearest?.road?.tunnelSystemModel?.shellRanges || [];
    let distanceAlong = NaN;
    let traveled = 0;
    let bestDistanceSquared = Infinity;
    for (let index = 0; index < (journeyRoad?.pts?.length || 0) - 1; index += 1) {
      const start = journeyRoad.pts[index];
      const end = journeyRoad.pts[index + 1];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const lengthSquared = dx * dx + dz * dz;
      const length = Math.sqrt(lengthSquared);
      const t = lengthSquared > 1e-9
        ? Math.max(0, Math.min(1, (
            (Number(ctx?.car?.x) - start.x) * dx +
            (Number(ctx?.car?.z) - start.z) * dz
          ) / lengthSquared))
        : 0;
      const projectedX = start.x + dx * t;
      const projectedZ = start.z + dz * t;
      const distanceSquared =
        (Number(ctx?.car?.x) - projectedX) ** 2 +
        (Number(ctx?.car?.z) - projectedZ) ** 2;
      if (distanceSquared < bestDistanceSquared) {
        bestDistanceSquared = distanceSquared;
        distanceAlong = traveled + length * t;
      }
      traveled += length;
    }
    return {
      x: Number(ctx?.car?.x),
      y: Number(ctx?.car?.y),
      z: Number(ctx?.car?.z),
      speed: Number(ctx?.car?.speed),
      throttle: Number(ctx?.readControlActions?.('drive')?.throttle || 0),
      nearestKind: String(nearest?.road?.structureSemantics?.structureKind || ''),
      nearestRefKind: String(nearest?.road?.transportStructureRef?.kind || ''),
      nearestChainId: String(nearest?.road?.transportStructureRef?.chainId || ''),
      nearestSourceFeatureId: String(nearest?.road?.sourceFeatureId || ''),
      distanceAlong: Number.isFinite(distanceAlong) ? distanceAlong : null,
      insideTunnelShell: Number.isFinite(distanceAlong) && tunnelRanges.some((range) =>
        distanceAlong >= Number(range?.start) &&
        distanceAlong <= Number(range?.end)
      ),
      insideNearestTunnelShell:
        Number.isFinite(Number(nearest?.distanceAlong)) &&
        nearestTunnelRanges.some((range) =>
          Number(nearest.distanceAlong) >= Number(range?.start) &&
          Number(nearest.distanceAlong) <= Number(range?.end)
        ),
      surfaceError: Number.isFinite(Number(nearest?.y))
        ? Math.abs(feetY - Number(nearest.y))
        : null,
      lateralError: Number.isFinite(Number(nearest?.dist)) ? Number(nearest.dist) : null,
      collision: collision?.collision === true,
      cameraDistance: Math.hypot(
        Number(ctx?.camera?.position?.x) - Number(ctx?.car?.x),
        Number(ctx?.camera?.position?.z) - Number(ctx?.car?.z)
      ),
      cameraHeight: Number(ctx?.camera?.position?.y) - feetY
    };
  });
}

async function diagnoseCameraRay(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (typeof THREE === 'undefined' || !ctx?.camera || !ctx?.scene || !ctx?.car) return [];
    const origin = ctx.camera.position.clone();
    const target = new THREE.Vector3(
      Number(ctx.car.x),
      Number(ctx.car.y),
      Number(ctx.car.z)
    );
    const direction = target.clone().sub(origin);
    const distance = direction.length();
    if (!(distance > 0.2)) return [];
    const raycaster = new THREE.Raycaster(
      origin,
      direction.multiplyScalar(1 / distance),
      0.1,
      distance + 1
    );
    return raycaster.intersectObjects(ctx.scene.children, true)
      .filter((hit) => {
        let owner = hit.object;
        while (owner) {
          if (owner.visible === false) return false;
          owner = owner.parent;
        }
        return true;
      })
      .slice(0, 12)
      .map((hit) => {
        const ancestors = [];
        let owner = hit.object;
        while (owner) {
          ancestors.push(owner);
          owner = owner.parent;
        }
        const belongsTo = (collection) =>
          Array.isArray(collection) &&
          ancestors.some((candidate) => collection.includes(candidate));
        return {
          distance: Number(hit.distance.toFixed(3)),
          name: String(hit.object?.name || ''),
          structureVisualType: String(
            ancestors.find((candidate) => candidate?.userData?.structureVisualType)
              ?.userData?.structureVisualType || ''
          ),
          isCar: ancestors.includes(ctx.carMesh),
          owner: belongsTo(ctx.roadMeshes)
            ? 'road'
            : belongsTo(ctx.structureVisualMeshes)
              ? 'structure_visual'
              : belongsTo(ctx.terrainGroup?.children)
                ? 'terrain'
                : belongsTo(ctx.urbanSurfaceMeshes)
                  ? 'urban_surface'
              : belongsTo(ctx.buildingMeshes)
                ? 'building'
                : belongsTo(ctx.landuseMeshes)
                  ? 'landuse'
                  : 'scene',
          color: hit.object?.material?.color?.getHexString?.() || null
        };
      });
  });
}

async function verifyModeSwitch(page, label) {
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(350);
  const walk = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const walker = ctx?.Walk?.state?.walker;
    const collision = ctx?.checkBuildingCollision?.(
      Number(walker?.x),
      Number(walker?.z),
      0.35,
      { actorBaseY: Number(walker?.y) - 1.7, actorHeight: 1.7 }
    );
    return {
      mode: String(ctx?.Walk?.state?.mode || ''),
      y: Number(walker?.y),
      collision: collision?.collision === true
    };
  });
  assert(walk.mode === 'walk', `${label} real F input did not enter walk mode`);
  assert(Number.isFinite(walk.y), `${label} walk spawn was unavailable`);
  assert(!walk.collision, `${label} walk mode spawned inside a structure collider`);
  const returnModes = [];
  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(350);
    returnModes.push(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return String(ctx?.getCurrentTravelMode?.() || '');
    }));
  }
  const driveMode = returnModes.at(-1);
  assert(driveMode === 'drive', `${label} real F cycle did not return to drive: ${returnModes.join(',')}`);
  return { walk, returnModes, driveMode };
}

async function runJourney(page, journeySpec, softwareRenderer) {
  const kind = journeySpec.kind;
  const label = journeySpec.id;
  let setup = await prepareJourney(page, journeySpec);
  assert(setup.ok, `${label} journey setup failed: ${JSON.stringify(setup)}`);
  await page.waitForTimeout(500);
  const modeSwitch = journeySpec.modeSwitch
    ? await verifyModeSwitch(page, label)
    : null;
  if (modeSwitch) {
    setup = await prepareJourney(page, journeySpec);
    assert(setup.ok, `${label} post-switch setup failed: ${JSON.stringify(setup)}`);
    await page.waitForTimeout(350);
  }
  const initialCameraRayHits = await diagnoseCameraRay(page);
  const startScreenshot = journeySpec.captureStart
    ? path.join(outputDir, `${label}-start.png`)
    : null;
  if (startScreenshot) {
    await page.screenshot({ path: startScreenshot, fullPage: false });
  }
  const samples = [await sampleJourney(page)];
  const startedAt = Date.now();
  const durationMs = softwareRenderer
    ? Number(journeySpec.softwareDurationMs || journeySpec.durationMs) || 3000
    : Number(journeySpec.hardwareDurationMs || journeySpec.durationMs) || 3000;
  await page.keyboard.down('ArrowUp');
  try {
    const deadline = Date.now() + durationMs;
    while (Date.now() < deadline) {
      await page.waitForTimeout(250);
      samples.push(await sampleJourney(page));
    }
  } finally {
    await page.keyboard.up('ArrowUp');
  }
  await page.waitForTimeout(250);
  samples.push(await sampleJourney(page));
  const wallClockSeconds = (Date.now() - startedAt) / 1000;
  const first = samples[0];
  const last = samples.at(-1);
  const moved = Math.hypot(last.x - first.x, last.z - first.z);
  const matchingSamples = samples.filter((sample) => {
    if (journeySpec.requireStructureTransition) {
      return Number.isFinite(sample.surfaceError) && sample.lateralError <= 8;
    }
    if (journeySpec.allowStructureFamilyTransition) {
      return ['bridge', 'ramp', 'overpass'].includes(sample.nearestRefKind);
    }
    return sample.nearestKind === kind && sample.nearestChainId === setup.chainId;
  }).length;
  const maximumSurfaceError = Math.max(
    0,
    ...samples.map((sample) => Number(sample.surfaceError) || 0)
  );
  const maximumLateralError = Math.max(
    0,
    ...samples.map((sample) => Number(sample.lateralError) || 0)
  );
  const centerCollisionSamples = samples.filter((sample) => sample.collision).length;
  const structureTransitionObserved = samples.some((sample) =>
    sample.nearestChainId !== setup.chainId ||
    sample.nearestSourceFeatureId !== setup.sourceFeatureId
  );
  const shellInteriorSamples = samples.filter((sample) => sample.insideTunnelShell).length;
  const shellExitObserved =
    shellInteriorSamples > 0 &&
    samples.slice(samples.findIndex((sample) => sample.insideTunnelShell) + 1)
      .some((sample) => !sample.insideTunnelShell);
  const physicalShellExitObserved =
    shellInteriorSamples > 0 &&
    samples.slice(samples.findIndex((sample) => sample.insideTunnelShell) + 1)
      .some((sample) =>
        !sample.insideTunnelShell &&
        !sample.insideNearestTunnelShell
      );
  const maximumSpeed = Math.max(0, ...samples.map((sample) => Math.abs(sample.speed)));
  const minimumCameraDistance = Math.min(
    ...samples.map((sample) => Number(sample.cameraDistance) || 0)
  );
  const maximumCameraHeight = Math.max(
    ...samples.map((sample) => Number(sample.cameraHeight) || 0)
  );
  const enclosedSamples = samples.filter((sample) =>
    sample.insideTunnelShell ||
    ['covered', 'indoor_covered', 'building_passage'].includes(sample.nearestRefKind)
  );
  const maximumEnclosedCameraHeight = Math.max(
    0,
    ...enclosedSamples.map((sample) => Number(sample.cameraHeight) || 0)
  );
  const screenshot = path.join(outputDir, `${label}-player-journey.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  const cameraRayHits = await diagnoseCameraRay(page);
  const cameraEvidenceHits = journeySpec.cameraEvidenceAt === 'start'
    ? initialCameraRayHits
    : cameraRayHits;
  const firstCarCameraHit = cameraEvidenceHits.find((hit) => hit.isCar) || null;
  const cameraOcclusionGap = firstCarCameraHit && cameraEvidenceHits[0]
    ? Math.max(0, Number(firstCarCameraHit.distance) - Number(cameraEvidenceHits[0].distance))
    : Infinity;
  assert(samples.some((sample) => sample.throttle > 0.9), `${label} did not receive real keyboard throttle`);
  assert(
    moved >= (softwareRenderer ? 0.1 : 2),
    `${label} journey was trapped after ${moved.toFixed(2)}m`
  );
  assert(maximumSpeed >= 0.3, `${label} never accelerated beyond ${maximumSpeed.toFixed(2)}m/s`);
  const surfaceErrorLimit = softwareRenderer ? 0.5 : 0.6;
  assert(
    maximumSurfaceError <= surfaceErrorLimit,
    `${label} surface error reached ${maximumSurfaceError.toFixed(3)}m`
  );
  assert(maximumLateralError <= 8, `${label} lateral error reached ${maximumLateralError.toFixed(3)}m`);
  assert(centerCollisionSamples === 0, `${label} centerline hit ${centerCollisionSamples} structure colliders`);
  assert(minimumCameraDistance >= 1.5, `${label} camera collapsed into the vehicle`);
  assert(
    cameraEvidenceHits[0]?.isCar === true || cameraOcclusionGap <= 0.75,
    `${label} chase camera view was occluded before the vehicle: ${JSON.stringify(cameraEvidenceHits)}`
  );
  if (kind === 'tunnel' || kind === 'covered') {
    assert(enclosedSamples.length > 0, `${label} did not sample its enclosed camera state`);
    assert(
      maximumEnclosedCameraHeight <= 3.5,
      `${label} camera exceeded enclosed clearance`
    );
  }
  if (journeySpec.requireShellExit && !softwareRenderer) {
    assert(
      journeySpec.physicalExit ? physicalShellExitObserved : shellExitObserved,
      `${label} did not cross a compiled shell portal: ${JSON.stringify(
        samples.map((sample) => ({
          distanceAlong: sample.distanceAlong,
          inside: sample.insideTunnelShell,
          insideNearest: sample.insideNearestTunnelShell,
          speed: sample.speed
        }))
      )}`
    );
  }
  if (journeySpec.requireStructureTransition && !softwareRenderer) {
    assert(structureTransitionObserved, `${label} did not cross its compiled endpoint`);
  }
  assert(matchingSamples / samples.length >= 0.45, `${label} left compiled structure authority too early`);
  return {
    id: label,
    kind,
    setup,
    wallClockSeconds: Number(wallClockSeconds.toFixed(2)),
    sampleCount: samples.length,
    moved: Number(moved.toFixed(2)),
    maximumSpeed: Number(maximumSpeed.toFixed(2)),
    matchingLayerPct: Number((matchingSamples / samples.length * 100).toFixed(2)),
    maximumSurfaceError: Number(maximumSurfaceError.toFixed(3)),
    surfaceErrorLimit,
    maximumLateralError: Number(maximumLateralError.toFixed(3)),
    centerCollisionSamples,
    shellInteriorSamples,
    shellExitObserved,
    physicalShellExitObserved,
    structureTransitionObserved,
    minimumCameraDistance: Number(minimumCameraDistance.toFixed(2)),
    maximumCameraHeight: Number(maximumCameraHeight.toFixed(2)),
    maximumEnclosedCameraHeight: Number(maximumEnclosedCameraHeight.toFixed(2)),
    modeSwitch,
    initialCameraRayHits,
    cameraRayHits,
    cameraOcclusionGap: Number.isFinite(cameraOcclusionGap)
      ? Number(cameraOcclusionGap.toFixed(3))
      : null,
    startScreenshot: startScreenshot ? path.relative(rootDir, startScreenshot) : null,
    screenshot: path.relative(rootDir, screenshot)
  };
}

await mkdirp(outputDir);
const server = await startServer({
  rootDir,
  host,
  candidatePorts: [4183, 4184, 4185, 4186]
});
const browser = await chromium.launch({
  headless: process.env.PHASE3_HEADED !== '1'
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) {
    consoleErrors.push(message.text());
  }
});

try {
  await page.goto(`http://${host}:${server.port}/app/`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  const allLocations = [
    {
      id: 'golden-gate',
      kind: 'custom',
      lat: 37.8202408,
      lon: -122.47857,
      label: 'Golden Gate Bridge',
      journeys: [
        { id: 'golden-gate-bridge', kind: 'bridge' }
      ]
    },
    {
      id: 'holland-tunnel',
      kind: 'custom',
      lat: 40.726368,
      lon: -74.014159,
      label: 'Holland Tunnel',
      journeys: [
        {
          id: 'holland-tunnel',
          kind: 'tunnel',
          visualKind: 'tunnel',
          modeSwitch: true,
          shellProgress: 0.75,
          physicalExit: true,
          requireShellExit: true
        },
        {
          id: 'holland-short-underpass',
          kind: 'tunnel',
          visualKind: 'underpass',
          captureStart: true,
          cameraEvidenceAt: 'start',
          requireShellExit: true
        },
        {
          id: 'holland-covered-road',
          kind: 'covered',
          refKind: 'covered',
          hardwareDurationMs: 1200
        },
        {
          id: 'holland-building-passage',
          kind: 'covered',
          refKind: 'building_passage',
          candidateIndex: 1,
          hardwareDurationMs: 1200
        }
      ]
    },
    {
      id: 'pregerson-interchange',
      kind: 'custom',
      lat: 33.928746,
      lon: -118.280939,
      label: 'Judge Harry Pregerson Interchange',
      journeys: [
        {
          id: 'pregerson-ramp-merge',
          kind: 'bridge',
          durationMs: 3000,
          allowStructureFamilyTransition: true,
          requireEndConnection: true,
          startDistanceFromEnd: 20,
          requireStructureTransition: true
        }
      ]
    },
    {
      id: 'baltimore',
      kind: 'preset',
      key: 'baltimore',
      label: 'Baltimore, Maryland',
      journeys: [
        { id: 'baltimore-second-bridge', kind: 'bridge' },
        {
          id: 'baltimore-second-tunnel',
          kind: 'tunnel',
          visualKind: 'tunnel',
          captureStart: true,
          cameraEvidenceAt: 'start',
          requireShellExit: true
        }
      ]
    }
  ];
  const requestedLocationIds = new Set(
    String(process.env.PHASE3_JOURNEY_LOCATIONS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const locations = requestedLocationIds.size > 0
    ? allLocations.filter((location) => requestedLocationIds.has(location.id))
    : allLocations;
  assert(locations.length > 0, 'no Phase 3 journey locations were selected');
  const firstBoot = await loadWorld(page, locations[0]);
  assert(firstBoot.ok, `initial world bootstrap failed: ${JSON.stringify(firstBoot)}`);
  await waitForWorld(page);
  const gpu = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const gl = ctx?.renderer?.getContext?.();
    const extension = gl?.getExtension?.('WEBGL_debug_renderer_info');
    return {
      vendor: String(extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : ''),
      renderer: String(extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : '')
    };
  });
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(
    `${gpu.vendor} ${gpu.renderer}`
  );
  const journeys = [];
  const worldEvidence = [];
  for (let index = 0; index < locations.length; index += 1) {
    const location = locations[index];
    if (index > 0) {
      await page.goto(`http://${host}:${server.port}/app/`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
    }
    let boot = index === 0 ? firstBoot : await loadWorld(page, location);
    assert(boot.ok, `${location.label} bootstrap failed: ${JSON.stringify(boot)}`);
    await waitForWorld(page);
    let availability = await journeyAvailability(page, location.journeys);
    for (
      let attempt = 1;
      attempt < 3 && availability.some((entry) => !entry.available);
      attempt += 1
    ) {
      boot = await loadWorld(page, location);
      assert(boot.ok, `${location.label} reload failed: ${JSON.stringify(boot)}`);
      await waitForWorld(page);
      availability = await journeyAvailability(page, location.journeys);
    }
    assert(
      availability.every((entry) => entry.available),
      `${location.label} public transport snapshot remained incomplete: ${JSON.stringify(availability)}`
    );
    console.log(`[phase3-journeys] ready ${location.id}: ${boot.roads} roads ${JSON.stringify(availability)}`);
    worldEvidence.push({
      id: location.id,
      label: location.label,
      acceptedGround: boot.acceptedGround,
      roads: boot.roads,
      structures: boot.structures,
      journeyAvailability: availability
    });
    for (const journey of location.journeys) {
      journeys.push({
        locationId: location.id,
        ...(await runJourney(page, journey, softwareRenderer))
      });
    }
  }
  assert(consoleErrors.length === 0, `console errors: ${JSON.stringify(consoleErrors)}`);
  const wallClockSeconds = journeys.reduce((sum, journey) => sum + journey.wallClockSeconds, 0);
  const report = {
    ok: true,
    locations: worldEvidence,
    evidence: classifyEvidence({
      kind: 'player-gameplay',
      realInput: true,
      wallClockSeconds,
      softwareRenderer,
      visualReviewApproved: false
    }),
    gpu,
    journeys,
    consoleErrors
  };
  await fs.writeFile(
    path.join(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  if (server.owned) await server.close();
}
