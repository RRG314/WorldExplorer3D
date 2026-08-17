import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

// A source-data count is not visual evidence. This journey points the installed
// Chrome renderer at representative bridges and tunnels, verifies that the
// selected road owns the compiled structure contract, and then performs an A/B
// framebuffer comparison with the structure publisher enabled and disabled.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'engineered-transport-landmarks');
await fs.mkdir(outputDir, { recursive: true });

const scenarioCatalog = [
  {
    id: 'baltimore',
    preset: 'baltimore',
    landmarks: [
      {
        id: 'jones-falls-expressway',
        kind: 'bridge',
        lat: 39.3094,
        lon: -76.6217,
        expectedName: /Jones Falls|I[ -]?83/i,
        maximumDistanceMeters: 320
      },
      {
        id: 'fort-mchenry-tunnel',
        kind: 'tunnel',
        lat: 39.2648,
        lon: -76.5873,
        expectedName: /Fort McHenry|I[ -]?95/i,
        maximumDistanceMeters: 320
      }
    ]
  },
  {
    id: 'sanfrancisco',
    preset: 'sanfrancisco',
    landmarks: [
      {
        id: 'san-francisco-oakland-bay-bridge',
        kind: 'bridge',
        lat: 37.8148,
        lon: -122.35935,
        expectedName: /Bay Bridge|San Francisco.*Oakland|I[ -]?80/i,
        maximumDistanceMeters: 420,
        minimumSurfaceY: 5.5
      },
      {
        id: 'yerba-buena-tunnel',
        kind: 'tunnel',
        lat: 37.8108,
        lon: -122.3666,
        expectedName: /Yerba Buena|I[ -]?80/i,
        maximumDistanceMeters: 420
      }
    ]
  }
];

const requestedScenario = String(process.env.WE_TRANSPORT_SCENARIO || '').trim().toLowerCase();
const scenarios = requestedScenario
  ? scenarioCatalog.filter((scenario) => scenario.id === requestedScenario)
  : scenarioCatalog;
assert.ok(scenarios.length > 0, `Unknown engineered transport scenario: ${requestedScenario}`);

const server = await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4310, 4311, 4312, 4313]
});
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.route('**/*', (route) => (
  route.request().resourceType() === 'font' ? route.abort() : route.continue()
));

const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (/Failed to load resource|blocked by CORS|Could not reach Cloud Firestore/i.test(text)) return;
  consoleErrors.push(text);
});

try {
  await page.goto(`http://127.0.0.1:${server.port}/app/?engineered-transport-landmarks=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await page.evaluate(async () => {
    const deadline = performance.now() + 120000;
    while (performance.now() < deadline) {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      if (typeof ctx?.loadRoads === 'function' && typeof ctx?.selectPresetLocation === 'function') {
        await ctx.ensureEarthRuntimeReady?.();
        if (ctx.getEarthRuntimeSnapshot?.().ready === true) {
          window.__engineeredTransportCtx = ctx;
          return;
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    throw new Error('Earth runtime bootstrap timed out');
  });
  await page.addStyleTag({ content: '#tutorialHintCard { display: none !important; }' });

  const reports = [];
  for (const scenario of scenarios) {
    const startedAt = Date.now();
    await page.evaluate(async ({ preset }) => {
      const ctx = window.__engineeredTransportCtx;
      if (!ctx.selectPresetLocation(preset)) throw new Error(`${preset} preset selection failed`);
      ctx.gameMode = 'free';
      ctx.gameStarted = true;
      ctx.paused = false;
      ctx.switchEnv?.(ctx.ENV.EARTH);
      document.getElementById('titleScreen')?.classList.add('hidden');
      document.getElementById('globeSelectorScreen')?.classList.remove('show');
      document.getElementById('tutorialOverlay')?.classList.add('hidden');
      await ctx.loadRoads();
    }, scenario);
    await page.waitForFunction((preset) => {
      const ctx = window.__engineeredTransportCtx;
      return ctx.worldLoading !== true &&
        ctx.worldLoadRuntimeState?.status === 'ready' &&
        ctx.worldPublication?.requestId?.endsWith?.(`:${preset}`) &&
        Number(ctx.roads?.length || 0) > 0;
    }, scenario.preset, { timeout: 120000 });
    await page.waitForFunction(() => (
      window.__engineeredTransportCtx?.farTerrainClipmapState?.status === 'ready'
    ), null, { timeout: 120000 });

    const scenarioReport = await page.evaluate(({ id, landmarks }) => {
      const ctx = window.__engineeredTransportCtx;
      const project = (road, target) => {
        let best = null;
        let accumulatedDistance = 0;
        for (let index = 0; index < (road?.pts || []).length - 1; index += 1) {
          const a = road.pts[index];
          const b = road.pts[index + 1];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const lengthSq = dx * dx + dz * dz;
          const t = lengthSq > 0
            ? Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.z - a.z) * dz) / lengthSq))
            : 0;
          const x = a.x + dx * t;
          const z = a.z + dz * t;
          const distance = Math.hypot(x - target.x, z - target.z);
          const length = Math.sqrt(lengthSq) || 1;
          if (!best || distance < best.distance) {
            best = {
              x,
              z,
              distance,
              distanceAlong: accumulatedDistance + length * t,
              tangentX: dx / length,
              tangentZ: dz / length
            };
          }
          accumulatedDistance += length;
        }
        return best;
      };
      const sampleCompiledSurface = (road, distance) => {
        const model = road?.transportSurfaceModel;
        const distances = model?.distances;
        const heights = model?.centerHeights;
        if (!distances?.length || !heights?.length) return NaN;
        const target = Math.max(0, Math.min(Number(distances[distances.length - 1]), Number(distance) || 0));
        let index = 0;
        while (index < distances.length - 2 && Number(distances[index + 1]) < target) index += 1;
        const startDistance = Number(distances[index]);
        const endDistance = Number(distances[Math.min(distances.length - 1, index + 1)]);
        const span = Math.max(1e-6, endDistance - startDistance);
        const t = Math.max(0, Math.min(1, (target - startDistance) / span));
        return Number(heights[index]) + (Number(heights[Math.min(heights.length - 1, index + 1)]) - Number(heights[index])) * t;
      };
      const sampleRoadAtDistance = (road, requestedDistance) => {
        let remaining = Math.max(0, Number(requestedDistance) || 0);
        for (let index = 0; index < (road?.pts || []).length - 1; index += 1) {
          const a = road.pts[index];
          const b = road.pts[index + 1];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const length = Math.hypot(dx, dz);
          if (!(length > 0)) continue;
          if (remaining <= length || index === road.pts.length - 2) {
            const t = Math.max(0, Math.min(1, remaining / length));
            return {
              x: a.x + dx * t,
              z: a.z + dz * t,
              tangentX: dx / length,
              tangentZ: dz / length,
              distance: Number(requestedDistance),
              total: Number(road?.tunnelSystemModel?.total || 0)
            };
          }
          remaining -= length;
        }
        return null;
      };
      const connectedTunnelSystem = (root) => {
        if (!root?.structureSemantics?.isTunnel) return [];
        const layer = Number(root.structureSemantics?.layer) || 0;
        const queue = [root];
        const seen = new Set();
        const system = [];
        while (queue.length) {
          const feature = queue.shift();
          if (!feature || seen.has(feature)) continue;
          seen.add(feature);
          system.push(feature);
          for (const endpoint of ['start', 'end']) {
            for (const link of feature.connectedFeatures?.[endpoint] || []) {
              const other = link?.feature;
              if (
                other?.structureSemantics?.isTunnel === true &&
                (Number(other.structureSemantics?.layer) || 0) === layer &&
                !seen.has(other)
              ) queue.push(other);
            }
          }
        }
        return system;
      };
      return {
        id,
        roads: Number(ctx.roads?.length || 0),
        transientStructureWaterAreas: Number(ctx.fixedRegionalStructureWaterAreas?.length || 0),
        fixedRegionalContextRadiusWorld: Number(ctx.fixedRegionalContextRadiusWorld || 0),
        terrainCoverage: ctx.farTerrainClipmapState?.terrainCoverage || null,
        structureVisuals: (ctx.structureVisualMeshes || []).map((mesh) => ({
          type: mesh?.userData?.structureVisualType || null,
          visible: mesh?.visible !== false,
          instances: Number(mesh?.count || 0),
          vertices: Number(mesh?.geometry?.attributes?.position?.count || 0)
        })),
        landmarks: landmarks.map((landmark) => {
          const target = ctx.geoToWorld(landmark.lat, landmark.lon);
          const candidates = (ctx.roads || []).filter((road) => landmark.kind === 'tunnel'
            ? road?.structureSemantics?.isTunnel === true
            : road?.structureSemantics?.terrainMode === 'elevated'
          );
          // Long engineered structures frequently change OSM way/name/ref at
          // a deck, bore, anchorage, or jurisdiction boundary. Spatial
          // identity must select the visible structure first; a famous-name
          // string is useful evidence but cannot redirect the test to a more
          // distant segment carrying I-80/I-95 metadata.
          const nearest = candidates.reduce((best, road) => {
            const point = project(road, target);
            return point && (!best || point.distance < best.point.distance) ? { road, point } : best;
          }, null);
          const nearestLossless = candidates
            .filter((candidate) => candidate?.transportRecord?.completeness === 'lossless')
            .reduce((best, candidate) => {
              const candidatePoint = project(candidate, target);
              return candidatePoint && (!best || candidatePoint.distance < best.point.distance)
                ? { road: candidate, point: candidatePoint }
                : best;
            }, null);
          const road = nearest?.road || null;
          let point = nearest?.point || null;
          if (landmark.kind === 'tunnel') {
            const shellRanges = Array.isArray(road?.tunnelSystemModel?.shellRanges)
              ? road.tunnelSystemModel.shellRanges
              : [];
            const longestShell = shellRanges.reduce((best, range) => {
              const length = Math.max(0, Number(range?.end) - Number(range?.start));
              return !best || length > best.length ? { range, length } : best;
            }, null);
            const portals = (road?.tunnelSystemModel?.portalDistances || [])
              .map((distance) => sampleRoadAtDistance(road, distance))
              .filter(Boolean);
            if (longestShell?.range) {
              point = sampleRoadAtDistance(
                road,
                (Number(longestShell.range.start) + Number(longestShell.range.end)) * 0.5
              );
              if (point) point.interior = true;
            } else if (portals.length > 0) {
              point = portals.reduce((best, candidate) => {
                const distance = Math.hypot(candidate.x - target.x, candidate.z - target.z);
                return !best || distance < best.distance ? { ...candidate, distance } : best;
              }, null);
            }
          }
          const querySurface = point
            ? ctx.SurfaceQuery?.driveAt?.(point.x, point.z, { preferRoad: true })
            : null;
          const compiledSurfaceY = sampleCompiledSurface(road, point?.distanceAlong ?? point?.distance);
          const tunnelSystem = landmark.kind === 'tunnel' ? connectedTunnelSystem(road) : [];
          const tunnelPortalCount = tunnelSystem.reduce(
            (count, feature) => count + Number(feature?.tunnelSystemModel?.portalDistances?.length || 0),
            0
          );
          return {
            ...landmark,
            expectedName: String(landmark.expectedName),
            roadName: road?.name || null,
            roadType: road?.type || null,
            completeness: road?.transportRecord?.completeness || null,
            providerNamespace: road?.transportRecord?.providerNamespace || null,
            sourceIdentity: road?.transportRecord?.identity || null,
            structureTerrainMode: road?.structureSemantics?.terrainMode || null,
            structureKind: road?.transportStructureRef?.kind || null,
            publishBody: road?.transportStructureAssembly?.publishBody === true,
            bodyCoverage: Number(road?.transportStructureAssembly?.bodyCoverage || 0),
            tunnelVisualKind: road?.tunnelSystemModel?.visualKind || null,
            tunnelShellRanges: Number(road?.tunnelSystemModel?.shellRanges?.length || 0),
            tunnelPortalCount,
            selectedSegmentPortalCount: Number(road?.tunnelSystemModel?.portalDistances?.length || 0),
            tunnelSystemSegments: tunnelSystem.length,
            nearestDistanceMeters: Number(nearest?.point?.distance?.toFixed?.(2)),
            nearestLosslessDistanceMeters: Number(nearestLossless?.point?.distance?.toFixed?.(2)),
            surfaceY: compiledSurfaceY,
            surfaceKind: Number.isFinite(compiledSurfaceY) ? 'road' : null,
            querySurfaceY: Number(querySurface?.position?.y),
            point: point ? {
              x: Number(point.x),
              z: Number(point.z),
              tangentX: Number(point.tangentX || 0),
              tangentZ: Number(point.tangentZ || 0),
              interior: point.interior === true,
              portalOutsideDirection: Number(point.distanceAlong ?? point.distance) <= Number(point.total) * 0.5 ? -1 : 1
            } : null
          };
        })
      };
    }, scenario);
    scenarioReport.loadMs = Date.now() - startedAt;

    for (const landmark of scenarioReport.landmarks) {
      assert.ok(landmark.point, `${landmark.id} has no mapped structure point: ${JSON.stringify(landmark)}`);
      await page.evaluate(({ kind, point, surfaceY: compiledSurfaceY }) => {
        const ctx = window.__engineeredTransportCtx;
        const surfaceY = Number(compiledSurfaceY || 0);
        ctx.setTravelMode?.('drone', { source: 'engineered-transport-visual-proof', force: true });
        const tangentLength = Math.hypot(Number(point.tangentX), Number(point.tangentZ));
        const tangentX = tangentLength > 0.5 ? Number(point.tangentX) / tangentLength : 0;
        const tangentZ = tangentLength > 0.5 ? Number(point.tangentZ) / tangentLength : 1;
        const normalX = -tangentZ;
        const normalZ = tangentX;
        const portalDirection = Number(point.portalOutsideDirection || -1);
        const tunnelInterior = kind === 'tunnel' && point.interior === true;
        const viewX = kind === 'tunnel'
          ? tangentX * (tunnelInterior ? -22 : portalDirection * 48) + normalX * (tunnelInterior ? 1 : 8)
          : normalX * 92 - tangentX * 38;
        const viewZ = kind === 'tunnel'
          ? tangentZ * (tunnelInterior ? -22 : portalDirection * 48) + normalZ * (tunnelInterior ? 1 : 8)
          : normalZ * 92 - tangentZ * 38;
        const viewY = kind === 'tunnel' ? (tunnelInterior ? 2.25 : 13) : 48;
        ctx.drone.x = point.x + viewX;
        ctx.drone.y = surfaceY + viewY;
        ctx.drone.z = point.z + viewZ;
        ctx.drone.yaw = Math.atan2(viewX, viewZ);
        ctx.drone.pitch = tunnelInterior
          ? 0
          : -Math.atan2(viewY - (kind === 'tunnel' ? 3 : 5), Math.hypot(viewX, viewZ));
        ctx.drone.roll = 0;
        ctx.drone.cameraYawOffset = 0;
        ctx.paused = true;
        document.querySelectorAll('.tutorial-overlay, #tutorialOverlay, #tutorialHintCard, .discovery-hud, .ar-hud')
          .forEach((element) => {
            element.classList.add('hidden');
            element.hidden = true;
          });
        ctx.updateStructureVisualVisibility?.(true);
      }, landmark);
      await page.waitForTimeout(300);

      const visualProof = await page.evaluate(async () => {
        const ctx = window.__engineeredTransportCtx;
        const renderer = ctx.renderer;
        const gl = renderer?.getContext?.();
        if (!renderer || !gl || !ctx.scene || !ctx.camera) throw new Error('WebGL render authority unavailable');
        const readFrame = () => {
          renderer.render(ctx.scene, ctx.camera);
          const width = gl.drawingBufferWidth;
          const height = gl.drawingBufferHeight;
          const pixels = new Uint8Array(width * height * 4);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          return { width, height, pixels };
        };
        const visibility = (ctx.structureVisualMeshes || []).map((mesh) => mesh.visible !== false);
        (ctx.structureVisualMeshes || []).forEach((mesh) => { mesh.visible = true; });
        const withStructures = readFrame();
        (ctx.structureVisualMeshes || []).forEach((mesh) => { mesh.visible = false; });
        const withoutStructures = readFrame();
        let changedPixels = 0;
        let strongChangedPixels = 0;
        let totalDifference = 0;
        const minX = Math.floor(withStructures.width * 0.16);
        const maxX = Math.ceil(withStructures.width * 0.84);
        const minY = Math.floor(withStructures.height * 0.12);
        const maxY = Math.ceil(withStructures.height * 0.88);
        for (let y = minY; y < maxY; y += 1) {
          for (let x = minX; x < maxX; x += 1) {
            const index = (y * withStructures.width + x) * 4;
            const difference =
              Math.abs(withStructures.pixels[index] - withoutStructures.pixels[index]) +
              Math.abs(withStructures.pixels[index + 1] - withoutStructures.pixels[index + 1]) +
              Math.abs(withStructures.pixels[index + 2] - withoutStructures.pixels[index + 2]);
            if (difference > 12) changedPixels += 1;
            if (difference > 60) strongChangedPixels += 1;
            totalDifference += difference;
          }
        }
        (ctx.structureVisualMeshes || []).forEach((mesh, index) => { mesh.visible = visibility[index]; });
        renderer.render(ctx.scene, ctx.camera);
        return {
          width: withStructures.width,
          height: withStructures.height,
          changedPixels,
          strongChangedPixels,
          totalDifference
        };
      });
      landmark.visualProof = visualProof;
      await page.screenshot({ path: path.join(outputDir, `${scenario.id}-${landmark.id}.png`) });
    }

    reports.push(scenarioReport);
    assert.equal(
      scenarioReport.terrainCoverage?.unownedCells,
      0,
      `${scenario.id} contains unowned terrain cells: ${JSON.stringify(scenarioReport.terrainCoverage)}`
    );
    assert.equal(
      scenarioReport.transientStructureWaterAreas,
      0,
      `${scenario.id} retained transient regional water polygons after structure compilation`
    );
    for (const landmark of scenarioReport.landmarks) {
      assert.ok(
        Number.isFinite(landmark.nearestDistanceMeters) &&
          landmark.nearestDistanceMeters <= landmark.maximumDistanceMeters,
        `${landmark.id} mapped geometry is outside its landmark envelope: ${JSON.stringify(landmark)}`
      );
      assert.ok(
        landmark.surfaceKind === 'road' && Number.isFinite(landmark.surfaceY),
        `${landmark.id} has no finite driveable surface: ${JSON.stringify(landmark)}`
      );
      assert.ok(
        ['lossless', 'generalized'].includes(landmark.completeness),
        `${landmark.id} has no accepted exact or regional structure source: ${JSON.stringify(landmark)}`
      );
      if (
        Number.isFinite(landmark.nearestLosslessDistanceMeters) &&
        landmark.nearestLosslessDistanceMeters <= landmark.maximumDistanceMeters
      ) {
        assert.equal(
          landmark.completeness,
          'lossless',
          `${landmark.id} selected generalized geometry despite an exact landmark candidate: ${JSON.stringify(landmark)}`
        );
      }
      if (Number.isFinite(landmark.minimumSurfaceY)) {
        assert.ok(
          landmark.surfaceY >= landmark.minimumSurfaceY,
          `${landmark.id} compiled below its minimum landmark elevation: ${JSON.stringify(landmark)}`
        );
      }
      if (landmark.kind === 'bridge') {
        assert.equal(landmark.structureTerrainMode, 'elevated', `${landmark.id} lost elevated semantics`);
        assert.equal(landmark.publishBody, true, `${landmark.id} did not publish a bridge/elevated body`);
        assert.ok(landmark.bodyCoverage >= 0.999, `${landmark.id} body does not cover the mapped road`);
      } else {
        assert.equal(landmark.structureTerrainMode, 'subgrade', `${landmark.id} lost subgrade semantics`);
        assert.ok(
          ['tunnel', 'underpass'].includes(landmark.tunnelVisualKind) && landmark.tunnelShellRanges > 0,
          `${landmark.id} has no compiled visible tunnel shell: ${JSON.stringify(landmark)}`
        );
        assert.ok(
          landmark.tunnelPortalCount > 0,
          `${landmark.id} has no compiled portal boundary: ${JSON.stringify(landmark)}`
        );
      }
      assert.ok(
        landmark.visualProof.changedPixels >= 180 && landmark.visualProof.strongChangedPixels >= 45,
        `${landmark.id} structure publisher produced no meaningful visible-frame contribution: ${JSON.stringify(landmark.visualProof)}`
      );
    }
  }

  assert.equal(consoleErrors.length, 0, `Engineered transport journey emitted errors: ${consoleErrors.join(' | ')}`);
  const report = { generatedAt: new Date().toISOString(), reports, consoleErrors };
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, reports }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
