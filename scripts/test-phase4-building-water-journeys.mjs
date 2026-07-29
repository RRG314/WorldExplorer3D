import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { classifyEvidence } from './production-readiness.mjs';
import { captureDroneView, captureViewport } from './world-matrix-visuals.mjs';
import { mkdirp, startServer } from './runtime-test-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'phase4-building-water-journeys');
const host = '127.0.0.1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadWorld(page, spec) {
  return page.evaluate(async (location) => {
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
    if (location.kind === 'custom') {
      ctx.customLoc = {
        lat: Number(location.lat),
        lon: Number(location.lon),
        name: String(location.label)
      };
      ctx.customLocTransient = false;
      ctx.selLoc = 'custom';
    } else {
      ctx.selLoc = String(location.key);
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
      source: 'phase4_building_water_journey',
      emitTutorial: false,
      force: true
    });
    ctx.startMode?.();
    return {
      ok: true,
      roads: Number(ctx.roads?.length || 0),
      acceptedGround: ctx.getAcceptedGroundRuntimeSnapshot?.() || null,
      buildingDetail: ctx.worldDetailState?.buildings || null
    };
  }, spec);
}

async function waitForWorld(page) {
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return (
      ctx?.worldLoading === false &&
      Number(ctx?.roads?.length || 0) > 50 &&
      ctx?.buildingProvenanceModel?.authority === 'compiled_building_provenance' &&
      ctx?.waterSurfaceRegistry?.snapshot?.()?.authority === 'water_surface_registry'
    );
  }, null, { timeout: 180000 });
}

async function collectAuthorityEvidence(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const building = ctx.buildingProvenanceModel;
    const water = ctx.waterSurfaceRegistry?.snapshot?.();
    const records = building?.records || [];
    const waterBodies = [...(ctx.waterAreas || []), ...(ctx.waterways || [])];
    const registryBodies = ctx.waterSurfaceRegistry?.entries?.() || [];
    const relevantMeshes = (ctx.buildingMeshes || []).filter((mesh) =>
      mesh?.userData?.isBuildingBatch || mesh?.userData?.sourceBuildingId
    );
    const foundations = records.filter((record) =>
      record?.identity?.role === 'outline' &&
      Number(record?.foundation?.sampleCount || 0) > 0
    );
    const invalidFoundations = foundations.filter((record) => {
      const base = Number(record.foundation.groundBaseY);
      const low = Number(record.foundation.minimumGroundY);
      const high = Number(record.foundation.maximumGroundY);
      return !Number.isFinite(base) || !Number.isFinite(low) || !Number.isFinite(high) ||
        base < low - 0.15 || base > high + 0.15 ||
        record.foundation.terrainMutation !== false;
    });
    const mappedFieldCounts = {};
    const inferredFieldCounts = {};
    records.forEach((record) => {
      Object.entries(record.fields || {}).forEach(([field, value]) => {
        if (value?.status === 'mapped') mappedFieldCounts[field] = (mappedFieldCounts[field] || 0) + 1;
        if (value?.status === 'inferred') inferredFieldCounts[field] = (inferredFieldCounts[field] || 0) + 1;
      });
    });
    const registryIds = waterBodies.map((body) => body?.registryId).filter(Boolean);
    return {
      building: {
        authority: building?.authority || null,
        featureCount: Number(building?.featureCount || 0),
        validCount: Number(building?.validCount || 0),
        outlines: Number(building?.outlineCount || 0),
        parts: Number(building?.partCount || 0),
        ambiguousMetadata: Number(building?.ambiguousMetadataCount || 0),
        duplicateFeatureIds: building?.duplicateFeatureIds || [],
        relevantMeshCount: relevantMeshes.length,
        unownedMeshCount: relevantMeshes.filter((mesh) =>
          mesh?.userData?.isBuildingBatch
            ? !(mesh.userData.buildingProvenanceRecords || []).length
            : !mesh?.userData?.buildingProvenance
        ).length,
        foundationSamples: foundations.length,
        invalidFoundations: invalidFoundations.length,
        protectedMappedLandmarks: records.filter((record) =>
          record?.landmark?.mapped === true &&
          record?.landmark?.genericOverrideAllowed === false
        ).length,
        mappedFieldCounts,
        inferredFieldCounts
      },
      water: {
        authority: water?.authority || null,
        registrySurfaces: Number(water?.surfaceCount || 0),
        publishedBodies: waterBodies.length,
        navigableSurfaces: Number(water?.navigableCount || 0),
        duplicateRegistryIds: [
          ...new Set(registryIds.filter((id, index) => registryIds.indexOf(id) !== index))
        ],
        orphanedBodies: waterBodies.filter((body) => !registryBodies.includes(body)).length,
        unownedBodies: waterBodies.filter((body) =>
          body?.registryProvenance?.authority !== 'water_surface_registry'
        ).length,
        unownedMeshes: (ctx.landuseMeshes || []).filter((mesh) =>
          (mesh?.userData?.landuseType === 'water' || mesh?.userData?.isWaterwayLine) &&
          mesh?.userData?.waterSurfaceProvenance?.authority !== 'water_surface_registry'
        ).length
      },
      render: {
        buildingMeshes: Number(ctx.buildingMeshes?.length || 0),
        buildingColliders: Number(ctx.buildings?.length || 0),
        waterMeshes: (ctx.landuseMeshes || []).filter((mesh) =>
          mesh?.userData?.landuseType === 'water' || mesh?.userData?.isWaterwayLine
        ).length,
        contextLost: !!ctx.renderer?.getContext?.().isContextLost?.()
      }
    };
  });
}

async function inspectWaterAdjacentTunnel(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    let horizontallyContainedSamples = 0;
    let verticallyRejectedSamples = 0;
    const verticallyAcceptedSamples = [];
    for (const road of ctx.roads || []) {
      if (road?.structureSemantics?.terrainMode !== 'subgrade') continue;
      const points = road.pts || [];
      const firstInteriorIndex = Math.max(0, Math.floor(points.length * 0.2));
      const lastInteriorIndex = Math.max(firstInteriorIndex, Math.floor((points.length - 1) * 0.8));
      const sampleStep = Math.max(1, Math.floor((lastInteriorIndex - firstInteriorIndex + 1) / 6));
      for (
        let index = firstInteriorIndex;
        index <= lastInteriorIndex;
        index += sampleStep
      ) {
        const point = points[index];
        const horizontal = ctx.inspectBoatCandidate?.(point.x, point.z, 58);
        if (!horizontal) continue;
        horizontallyContainedSamples += 1;
        const roadY = Number(
          ctx.SurfaceQuery?.driveAt?.(point.x, point.z, { preferRoad: true })?.position?.y
        );
        const vertical = ctx.inspectBoatCandidate?.(point.x, point.z, 58, {
          referenceY: roadY + 1.2,
          structureTerrainMode: 'subgrade'
        });
        if (!vertical) verticallyRejectedSamples += 1;
        else {
          verticallyAcceptedSamples.push({
            roadY,
            waterY: Number(horizontal.surfaceY),
            separation: Math.abs((roadY + 1.2) - Number(horizontal.surfaceY))
          });
        }
      }
    }
    return { horizontallyContainedSamples, verticallyRejectedSamples, verticallyAcceptedSamples };
  });
}

async function prepareBoatEntry(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    let selected = null;
    for (const area of ctx.waterAreas || []) {
      if (area?.navigable !== true || !area.bounds) continue;
      const bounds = area.bounds;
      for (let xi = 1; xi < 10 && !selected; xi++) {
        for (let zi = 1; zi < 10 && !selected; zi++) {
          const x = bounds.minX + (bounds.maxX - bounds.minX) * (xi / 10);
          const z = bounds.minZ + (bounds.maxZ - bounds.minZ) * (zi / 10);
          const surfaceY = Number(area.surfaceY);
          if (!Number.isFinite(surfaceY)) continue;
          const candidate = ctx.inspectBoatCandidate?.(x, z, 58, {
            referenceY: surfaceY + 1.2
          });
          if (
            candidate?.inside === true &&
            Number(candidate.shorelineDistance || 0) >= 5 &&
            Number(candidate.shorelineDistance || 0) <= 88
          ) {
            selected = { candidate, x, z, surfaceY };
          }
        }
      }
      if (selected) break;
    }
    if (!selected) return { ok: false, reason: 'no contained navigable boat entry point' };
    ctx.setDroneModeActive?.(false);
    ctx.setTravelMode?.('drive', {
      source: 'phase4_boat_entry',
      emitTutorial: false,
      force: true
    });
    ctx.car.x = selected.x;
    ctx.car.z = selected.z;
    ctx.car.y = selected.surfaceY + 1.2;
    ctx.car.speed = 0;
    ctx.car.vFwd = 0;
    ctx.car.vLat = 0;
    ctx.boatMode.candidate = selected.candidate;
    ctx.boatMode.available = true;
    // Freeze the drive controller between positioning and the real G key so it
    // cannot snap the test actor from the water-entry point back to a road.
    ctx.paused = true;
    return {
      ok: true,
      x: selected.x,
      z: selected.z,
      surfaceY: selected.surfaceY,
      shorelineDistance: selected.candidate.shorelineDistance,
      registryId: selected.candidate.source?.registryId || null
    };
  });
}

async function runBoatJourney(page) {
  const setup = await prepareBoatEntry(page);
  assert(setup.ok, `boat entry setup failed: ${JSON.stringify(setup)}`);
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.focus();
    globalThis.__phase4KeyEvents = [];
    globalThis.addEventListener('keydown', (event) => {
      globalThis.__phase4KeyEvents.push({
        code: event.code,
        key: event.key,
        target: event.target?.tagName || null
      });
    }, { once: true, capture: true });
  });
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(250);
  const entered = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      active: ctx?.boatMode?.active === true,
      keyEvents: globalThis.__phase4KeyEvents,
      candidate: ctx?.boatMode?.candidate ? {
        inside: ctx.boatMode.candidate.inside,
        navigable: ctx.boatMode.candidate.navigable,
        registryId: ctx.boatMode.candidate.source?.registryId || null
      } : null,
      reference: {
        x: ctx.car?.x,
        y: ctx.car?.y,
        z: ctx.car?.z,
        drone: ctx.droneMode,
        walk: ctx.Walk?.state?.mode
      }
    };
  });
  assert(entered.active, `real G input did not enter boat mode: ${JSON.stringify(entered)}`);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.paused = false;
  });
  const start = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return { x: ctx.boat.x, z: ctx.boat.z };
  });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(250);
  const inputSnapshot = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      keyDown: ctx.keys?.ArrowUp === true,
      actions: ctx.readControlActions?.('boat') || null,
      paused: ctx.paused,
      gameStarted: ctx.gameStarted,
      active: ctx.boatMode?.active,
      forwardSpeed: ctx.boat?.forwardSpeed
    };
  });
  assert(
    inputSnapshot.keyDown && Number(inputSnapshot.actions?.throttle || 0) > 0.5,
    `real ArrowUp input did not reach boat controls: ${JSON.stringify(inputSnapshot)}`
  );
  await page.waitForTimeout(3250);
  await page.keyboard.up('ArrowUp');
  await captureViewport(page, path.join(outputDir, 'golden-gate-boat-journey.png'));
  const active = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      x: ctx.boat.x,
      z: ctx.boat.z,
      active: ctx.boatMode.active,
      registryAuthority:
        ctx.boatMode.currentWater?.source?.registryProvenance?.authority ||
        ctx.boatMode.currentWater?.registryProvenance?.authority ||
        null,
      shorelineDistance: ctx.boatMode.shorelineDistance,
      forwardSpeed: ctx.boat.forwardSpeed,
      keyDown: ctx.keys?.ArrowUp === true,
      paused: ctx.paused,
      gameStarted: ctx.gameStarted,
      controller: ctx.getEarthTransportControllerSnapshot?.() || null,
    };
  });
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(250);
  const exited = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx?.boatMode?.active !== true;
  });
  assert(exited, 'real G input did not exit boat mode');
  const moved = Math.hypot(active.x - start.x, active.z - start.z);
  assert(
    moved > 0.25 &&
    Number(active.forwardSpeed || 0) > 1 &&
    Number(active.controller?.controllers?.find((entry) => entry.id === 'boat')?.updates || 0) > 10,
    `real ArrowUp input did not move the boat: ${JSON.stringify({ moved, start, inputSnapshot, active })}`
  );
  assert(
    active.registryAuthority === 'water_surface_registry',
    `boat detached from water registry: ${JSON.stringify(active)}`
  );
  return {
    setup,
    moved: Number(moved.toFixed(2)),
    inputSnapshot,
    exitedByRealInput: true,
    activeSnapshot: active,
    screenshot: 'output/playwright/phase4-building-water-journeys/golden-gate-boat-journey.png'
  };
}

await mkdirp(outputDir);
const server = await startServer({
  rootDir,
  host,
  candidatePorts: [4193, 4194, 4195, 4196]
});
const browser = await chromium.launch({
  headless: process.env.PHASE4_HEADED !== '1'
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) {
    consoleErrors.push(message.text());
  }
});

const locations = [
  { id: 'baltimore', kind: 'preset', key: 'baltimore', label: 'Baltimore', category: 'dense_city' },
  { id: 'monaco', kind: 'preset', key: 'monaco', label: 'Monaco', category: 'mountain_coastal_city' },
  {
    id: 'golden-gate',
    kind: 'custom',
    lat: 37.8202408,
    lon: -122.47857,
    label: 'Golden Gate',
    category: 'coastal_city'
  },
  {
    id: 'holland-tunnel',
    kind: 'custom',
    lat: 40.726368,
    lon: -74.014159,
    label: 'Holland Tunnel',
    category: 'water_adjacent_tunnel'
  },
  {
    id: 'dead-sea',
    kind: 'custom',
    lat: 31.5,
    lon: 35.5,
    label: 'Dead Sea',
    category: 'inland_water_below_sea'
  }
];
const requestedLocation = String(process.env.PHASE4_LOCATION || '').trim();
const journeyLocations = requestedLocation ?
  locations.filter((location) => location.id === requestedLocation) :
  locations;
assert(journeyLocations.length > 0, `unknown PHASE4_LOCATION: ${requestedLocation}`);

try {
  const evidence = [];
  let boatJourney = null;
  for (let index = 0; index < journeyLocations.length; index++) {
    const location = journeyLocations[index];
    await page.goto(`http://${host}:${server.port}/app/`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    const boot = await loadWorld(page, location);
    assert(boot.ok, `${location.label} load failed: ${JSON.stringify(boot)}`);
    await waitForWorld(page);
    const authority = await collectAuthorityEvidence(page);
    assert(
      boot.acceptedGround?.status === 'accepted',
      `${location.label} did not load accepted ground: ${JSON.stringify(boot.acceptedGround)}`
    );
    assert(
      authority.building.featureCount === authority.building.validCount &&
      authority.building.ambiguousMetadata === 0 &&
      authority.building.duplicateFeatureIds.length === 0 &&
      authority.building.unownedMeshCount === 0 &&
      authority.building.invalidFoundations === 0,
      `${location.label} building authority failed: ${JSON.stringify(authority.building)}`
    );
    assert(
      authority.water.registrySurfaces === authority.water.publishedBodies &&
      authority.water.duplicateRegistryIds.length === 0 &&
      authority.water.orphanedBodies === 0 &&
      authority.water.unownedBodies === 0 &&
      authority.water.unownedMeshes === 0,
      `${location.label} water authority failed: ${JSON.stringify(authority.water)}`
    );
    assert(!authority.render.contextLost, `${location.label} lost the WebGL context`);
    if (location.id === 'golden-gate') {
      boatJourney = await runBoatJourney(page);
    }
    const visualResult = {};
    await captureDroneView(page, location, visualResult, outputDir);
    let tunnelBoatGate = null;
    if (location.id === 'holland-tunnel') {
      tunnelBoatGate = await inspectWaterAdjacentTunnel(page);
      assert(
        tunnelBoatGate.horizontallyContainedSamples > 0 &&
        tunnelBoatGate.verticallyRejectedSamples === tunnelBoatGate.horizontallyContainedSamples,
        `Holland tunnel water gate failed: ${JSON.stringify(tunnelBoatGate)}`
      );
    }
    evidence.push({
      id: location.id,
      label: location.label,
      acceptedGround: boot.acceptedGround,
      buildingDetail: boot.buildingDetail,
      authority,
      dronePresentation: visualResult.dronePresentation,
      tunnelBoatGate,
      screenshot: `output/playwright/phase4-building-water-journeys/${location.id}-drone.png`
    });
    console.log(
      `[phase4-journeys] ${location.id}: ` +
      `${authority.building.featureCount} buildings, ${authority.water.registrySurfaces} water surfaces`
    );
  }
  if (!requestedLocation || requestedLocation === 'golden-gate') {
    assert(boatJourney?.exitedByRealInput === true, 'coastal boat entry/exit journey did not complete');
  }
  assert(consoleErrors.length === 0, `console errors: ${JSON.stringify(consoleErrors)}`);
  const gpu = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const gl = ctx?.renderer?.getContext?.();
    const extension = gl?.getExtension?.('WEBGL_debug_renderer_info');
    return {
      vendor: String(extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : ''),
      renderer: String(extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : '')
    };
  });
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(`${gpu.vendor} ${gpu.renderer}`);
  const report = {
    ok: true,
    evidence: classifyEvidence({
      kind: 'player-gameplay',
      realInput: true,
      wallClockSeconds: 2.5,
      softwareRenderer,
      visualReviewApproved: false
    }),
    gpu,
    locations: evidence,
    boatJourney,
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
