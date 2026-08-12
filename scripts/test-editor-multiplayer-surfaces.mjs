import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4185, 4186, 4179, 4178];
const outputDir = path.join(rootDir, 'output', 'playwright', 'editor-multiplayer-surfaces');

async function mkdirp(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function serveStaticRoot(port) {
  const sockets = new Set();
  const mime = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.svg', 'image/svg+xml'],
    ['.webp', 'image/webp'],
    ['.ico', 'image/x-icon'],
    ['.map', 'application/json; charset=utf-8']
  ]);

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', `http://${host}:${port}`);
      let relPath = decodeURIComponent(reqUrl.pathname || '/');
      if (relPath === '/') relPath = '/index.html';

      const resolved = path.resolve(path.join(rootDir, relPath));
      if (!resolved.startsWith(rootDir)) {
        res.writeHead(403).end('forbidden');
        return;
      }

      let filePath = resolved;
      const stat = await fs.stat(filePath).catch(() => null);
      if (stat?.isDirectory()) filePath = path.join(filePath, 'index.html');
      if (!(await exists(filePath))) {
        res.writeHead(404).end('not found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mime.get(ext) || 'application/octet-stream';
      const buf = await fs.readFile(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(buf);
    } catch (err) {
      res.writeHead(500).end(String(err?.message || err));
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  return {
    port,
    close: () => new Promise((resolve) => {
      for (const socket of sockets) {
        if (socket instanceof net.Socket) socket.destroy();
      }
      server.close(resolve);
    })
  };
}

async function startServer() {
  for (const port of candidatePorts) {
    try {
      return await serveStaticRoot(port);
    } catch {
      // try next
    }
  }
  throw new Error(`Unable to start local static server on ports: ${candidatePorts.join(', ')}`);
}

async function bootstrapEarthRuntime(page, baseUrl) {
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });

  const boot = await page.evaluate(async () => {
    const deadline = performance.now() + 120000;
    let ctx = null;
    while (performance.now() < deadline) {
      const mod = await import('/app/js/shared-context.js?v=55');
      ctx = mod?.ctx || {};
      if (
        ctx &&
        typeof ctx.loadRoads === 'function' &&
        typeof ctx.switchEnv === 'function' &&
        ctx.ENV?.EARTH
      ) {
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    if (!ctx?.ENV?.EARTH) {
      throw new Error('Earth runtime helpers were not ready during editor/multiplayer bootstrap.');
    }
    ctx.selLoc = 'baltimore';
    ctx.gameMode = 'free';
    ctx.loadingScreenMode = 'earth';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    ['hud', 'minimap', 'floatMenuContainer', 'mainMenuBtn', 'controlsTab', 'coords', 'historicBtn'].forEach((id) => {
      document.getElementById(id)?.classList.add('show');
    });
    await ctx.loadRoads();
    if (ctx.Walk?.setModeWalk) ctx.Walk.setModeWalk();
    if (typeof ctx.startMode === 'function') ctx.startMode();
    return {
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0
    };
  });

  if (!boot.roads) throw new Error('Earth runtime bootstrap did not load roads.');
  return boot;
}

async function waitFor(page, predicateSource, timeout = 20000) {
  await page.waitForFunction(predicateSource, { timeout });
}

async function settleVisualFrame(page) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(500);
}

async function readPanelVisualState(page, panelId) {
  return page.evaluate((id) => {
    const panel = document.getElementById(id);
    if (!panel) return { exists: false };
    const style = getComputedStyle(panel);
    const rect = panel.getBoundingClientRect();
    return {
      exists: true,
      rootedInBody: panel.parentElement === document.body,
      show: panel.classList.contains('show'),
      display: style.display,
      visibility: style.visibility,
      opacity: Number(style.opacity),
      width: rect.width,
      height: rect.height,
      childCount: panel.children.length,
      position: style.position,
      inset: [style.top, style.right, style.bottom, style.left]
    };
  }, panelId);
}

async function runBlockBuilderAudit(page) {
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const buildingStatus = ctx.worldDetailState?.buildings?.status;
    return ctx.worldLoading !== true && !!buildingStatus && buildingStatus !== 'loading';
  }, null, { timeout: 120000 });

  const visual = await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    await ctx.ensureBlockBuilderReady?.();
    ctx.Walk?.setModeWalk?.();
    ctx.setTimeOfDay?.('day');
    ctx.clearAllBuildBlocks?.({ persist: false });
    ctx.setBuildModeEnabled?.(true);

    const walker = ctx.Walk?.state?.walker;
    const angle = Number(walker?.angle) || 0;
    const forward = { x: Math.sin(angle), z: Math.cos(angle) };
    const right = { x: Math.cos(angle), z: -Math.sin(angle) };
    const shapes = ['cube', 'slab', 'ramp', 'column'];
    const sides = [-2.4, -0.8, 0.8, 2.4];
    const placed = shapes.map((shape, index) => {
      const gx = Math.round(walker.x + forward.x * 5 + right.x * sides[index]);
      const gz = Math.round(walker.z + forward.z * 5 + right.z * sides[index]);
      const ground = ctx.terrainMeshHeightAt?.(gx, gz) ?? 0;
      return ctx.placeBuildBlock?.(gx, Math.round(ground + 0.5), gz, index, {
        shape,
        rotation: index,
        persist: false
      });
    });
    const meshes = ctx.scene?.getObjectByName('buildBlocksGroup')?.children || [];
    return {
      shapeControls: document.querySelectorAll('[data-block-shape]').length,
      colorControls: document.querySelectorAll('[data-block-material]').length,
      maxCount: ctx.getBlockBuilderSnapshot?.().maxCount,
      placed,
      meshes: meshes.map((mesh) => ({
        shape: mesh.userData?.shape,
        rotation: mesh.userData?.rotation,
        color: mesh.material?.color?.getHexString?.() || '',
        vertices: mesh.geometry?.attributes?.position?.count || 0
      }))
    };
  });
  await settleVisualFrame(page);
  await page.screenshot({ path: path.join(outputDir, 'block-builder-shapes.png') });

  const jumpSetup = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.clearAllBuildBlocks({ persist: false });
    const walker = ctx.Walk.state.walker;
    const gx = Math.round(walker.x);
    const gz = Math.round(walker.z);
    const ground = ctx.terrainMeshHeightAt?.(gx, gz) ?? ctx.elevationWorldYAtWorldXZ?.(gx, gz) ?? 0;
    const gy = Math.round(ground + 0.5);
    ctx.placeBuildBlock(gx, gy, gz, 0, { shape: 'cube', persist: false });
    walker.x = gx;
    walker.z = gz;
    walker.y = ground + 1.7;
    walker.vy = 0;
    walker.onGround = true;
    return { blockTop: gy + 0.5, startY: walker.y };
  });
  await page.waitForTimeout(200);
  const jumpSamples = [];
  await page.keyboard.down('Space');
  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(20);
    jumpSamples.push(await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const walker = ctx.Walk.state.walker;
      return { y: walker.y, feetY: walker.y - 1.7, onGround: walker.onGround };
    }));
  }
  await page.keyboard.up('Space');
  for (let i = 0; i < 45; i += 1) {
    const sample = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const walker = ctx.Walk.state.walker;
      return { y: walker.y, feetY: walker.y - 1.7, onGround: walker.onGround };
    });
    jumpSamples.push(sample);
    if (sample.onGround && Math.abs(sample.feetY - jumpSetup.blockTop) <= 0.1) break;
    await page.waitForTimeout(50);
  }
  const jump = await page.evaluate(async (blockTop) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const walker = ctx.Walk.state.walker;
    return { feetY: walker.y - 1.7, onGround: walker.onGround, blockTop };
  }, jumpSetup.blockTop);
  jump.airborneSamples = jumpSamples.filter((sample) => !sample.onGround).length;
  jump.maxY = Math.max(...jumpSamples.map((sample) => sample.y));
  jump.startY = jumpSetup.startY;
  await settleVisualFrame(page);
  await page.screenshot({ path: path.join(outputDir, 'block-builder-jump.png') });

  const limit = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.clearAllBuildBlocks({ persist: false });
    let accepted = 0;
    for (let i = 0; i < 200; i += 1) {
      if (ctx.placeBuildBlock(100 + (i % 20), 10, 100 + Math.floor(i / 20), i % 8, {
        shape: ['cube', 'slab', 'ramp', 'column'][i % 4],
        rotation: i % 4,
        persist: false
      })) accepted += 1;
    }
    const overflowAccepted = ctx.placeBuildBlock(150, 10, 150, 0, { shape: 'cube', persist: false });
    const rendered = ctx.scene?.getObjectByName('buildBlocksGroup')?.children?.length || 0;
    ctx.clearAllBuildBlocks({ persist: false });
    return { accepted, overflowAccepted, rendered };
  });

  const vehicle = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.clearAllBuildBlocks({ persist: false });
    ctx.placeBuildBlock(0, 0, 0, 4, { shape: 'cube', persist: false });
    const cube = ctx.getBuildVehicleContact(-6, 0, 6, 0, -0.5, Math.PI / 2);
    ctx.clearAllBuildBlocks({ persist: false });
    ctx.placeBuildBlock(0, 0, 0, 2, { shape: 'ramp', rotation: 0, persist: false });
    const ramp = ctx.getBuildVehicleContact(0, -0.45, 0, 0.45, -0.5, 0);
    ctx.clearAllBuildBlocks({ persist: false });
    ctx.setBuildModeEnabled(false);
    return { cube, ramp };
  });

  return { visual, limit, jump, vehicle };
}

async function runAudit(page, baseUrl) {
  const report = {
    baseUrl,
    builder: {},
    editor: {},
    activityCreator: {},
    creatorLibrary: {},
    overlayRuntime: {},
    multiplayer: {}
  };

  console.log('[audit] block builder');
  report.builder = await runBlockBuilderAudit(page);

  console.log('[audit] init multiplayer');
  const multiplayerInit = await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    const api = await ctx.ensureMultiplayerPlatformReady();
    return {
      hasApi: !!api,
      methods: {
        createRoom: typeof api?.createRoom === 'function',
        joinRoomByCode: typeof api?.joinRoomByCode === 'function',
        syncRoomWorldContext: typeof api?.syncRoomWorldContext === 'function'
      }
    };
  });
  report.multiplayer.init = multiplayerInit;

  console.log('[audit] open editor');
  await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    await mod.ctx.openEditorSession({ skipTutorial: true });
  });
  await waitFor(page, () => !!document.getElementById('editorPanel')?.classList.contains('show'));
  report.editor.open = await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    return mod.ctx.getEditorSnapshot();
  });
  await settleVisualFrame(page);
  report.editor.openVisual = await readPanelVisualState(page, 'editorPanel');
  await page.screenshot({ path: path.join(outputDir, 'editor-open.png') });
  console.log('[audit] close editor');
  await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    await mod.ctx.closeEditorSession();
  });
  await waitFor(page, () => !document.getElementById('editorPanel')?.classList.contains('show'));
  report.editor.closed = await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    return mod.ctx.getEditorSnapshot();
  });

  console.log('[audit] open activity creator');
  await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    await mod.ctx.openActivityCreator();
  });
  await waitFor(page, () => !!document.getElementById('activityCreatorPanel')?.classList.contains('show'));
  report.activityCreator.open = await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    return mod.ctx.getActivityCreatorSnapshot();
  });
  await settleVisualFrame(page);
  report.activityCreator.openVisual = await readPanelVisualState(page, 'activityCreatorPanel');
  await page.screenshot({ path: path.join(outputDir, 'activity-creator-open.png') });
  console.log('[audit] close activity creator');
  await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    await mod.ctx.closeActivityCreator();
  });
  await waitFor(page, () => !document.getElementById('activityCreatorPanel')?.classList.contains('show'));
  report.activityCreator.closed = await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    return mod.ctx.getActivityCreatorSnapshot();
  });

  console.log('[audit] creator library roundtrip');
  report.creatorLibrary = await page.evaluate(async () => {
    const lib = await import('/app/js/activity-discovery/library.js?v=2');
    const before = lib.listStoredActivities().length;
    const saved = lib.saveCreatorActivityDraft({
      templateId: 'walking_route',
      anchors: [
        { id: 'start_audit', typeId: 'start', label: 'Start', x: 0, y: 0, z: 0 },
        { id: 'finish_audit', typeId: 'finish', label: 'Finish', x: 18, y: 0, z: 6 }
      ],
      name: 'Audit Creator Save'
    }, {
      title: 'Audit Creator Save',
      description: 'Verification draft',
      creatorName: 'Audit'
    });
    const afterSave = lib.listStoredActivities().length;
    const removed = lib.removeStoredActivity(saved.id);
    const afterRemove = lib.listStoredActivities().length;
    return {
      before,
      savedId: saved.id,
      afterSave,
      removed,
      afterRemove
    };
  });

  console.log('[audit] overlay runtime');
  report.overlayRuntime = await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    if (typeof ctx.ensureOverlayRuntimeReady === 'function') {
      await Promise.race([
        ctx.ensureOverlayRuntimeReady(),
        new Promise((resolve) => window.setTimeout(() => resolve('timeout'), 20000))
      ]);
    }
    return ctx.getApprovedEditorContributionSnapshot?.() || null;
  });

  const earthRoom = {
    id: 'audit_earth',
    code: 'AE1234',
    name: 'Audit Earth Room',
    world: { kind: 'earth', lat: 39.2904, lon: -76.6122, seed: 'latlon:39.29040,-76.61220' },
    rules: {}
  };
  const moonRoom = {
    id: 'audit_moon',
    code: 'AM1234',
    name: 'Audit Moon Room',
    world: { kind: 'moon', lat: 0, lon: 0, seed: 'moon' },
    rules: {}
  };
  const spaceRoom = {
    id: 'audit_space',
    code: 'AS1234',
    name: 'Audit Space Room',
    world: { kind: 'space', lat: 0, lon: 0, seed: 'space' },
    rules: {}
  };

  console.log('[audit] sync earth room');
  report.multiplayer.earthSync = await page.evaluate(async (room) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    await ctx.syncMultiplayerRoomWorld(room, { force: true, respawn: false });
    return {
      selLoc: ctx.selLoc,
      customLoc: ctx.customLoc,
      onMoon: !!ctx.onMoon,
      spaceFlightActive: !!ctx.spaceFlight?.active
    };
  }, earthRoom);

  console.log('[audit] sync moon room');
  report.multiplayer.moonSync = await page.evaluate(async (room) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    await ctx.syncMultiplayerRoomWorld(room, { force: true, respawn: false });
    return {
      onMoon: !!ctx.onMoon,
      spaceFlightActive: !!ctx.spaceFlight?.active,
      envMoon: typeof ctx.isEnv === 'function' ? ctx.isEnv(ctx.ENV.MOON) : null
    };
  }, moonRoom);

  console.log('[audit] sync space room');
  report.multiplayer.spaceSync = await page.evaluate(async (room) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    await ctx.syncMultiplayerRoomWorld(room, { force: true, respawn: false });
    return {
      onMoon: !!ctx.onMoon,
      spaceFlightActive: !!ctx.spaceFlight?.active,
      envSpace: typeof ctx.isEnv === 'function' ? ctx.isEnv(ctx.ENV.SPACE_FLIGHT) : null
    };
  }, spaceRoom);

  console.log('[audit] cleanup to earth');
  report.multiplayer.cleanupBefore = await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    return {
      env: ctx.getEnv?.() || null,
      initialEarthWorldReady: ctx.initialEarthWorldReady === true,
      loadedSelectionCurrent: ctx.isLoadedLocationSelectionCurrent?.() ?? null,
      buildingDetailStatus: ctx.worldDetailState?.buildings?.status || null,
      roads: Number(ctx.roads?.length || 0),
      buildings: Number(ctx.buildings?.length || 0),
      worldLoading: ctx.worldLoading === true,
      coordinator: ctx.getSessionCoordinatorDebugState?.() || null
    };
  });
  console.log('[audit] cleanup state', JSON.stringify(report.multiplayer.cleanupBefore));
  report.multiplayer.cleanupTransition = await page.evaluate(async (room) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    let outcome = 'room_sync';
    if (ctx.spaceFlight?.active && typeof ctx.arriveAtEarth === 'function') {
      outcome = await Promise.race([
        ctx.arriveAtEarth().then((value) => value === false ? 'superseded' : 'arrived'),
        new Promise((resolve) => window.setTimeout(() => resolve('timeout'), 25000))
      ]);
    } else {
      await ctx.syncMultiplayerRoomWorld(room, { force: true, respawn: false });
    }
    return {
      outcome,
      env: ctx.getEnv?.() || null,
      initialEarthWorldReady: ctx.initialEarthWorldReady === true,
      loadedSelectionCurrent: ctx.isLoadedLocationSelectionCurrent?.() ?? null,
      roads: Number(ctx.roads?.length || 0),
      buildings: Number(ctx.buildings?.length || 0),
      worldLoading: ctx.worldLoading === true,
      earthResumePending: ctx.earthResumePending === true,
      earthResumeDiagnostics: ctx.earthResumeDiagnostics || null,
      transition: ctx.getSessionCoordinatorDebugState?.() || null
    };
  }, earthRoom);

  console.log('[audit] final snapshot');
  report.multiplayer.cleanup = await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    return {
      onMoon: !!ctx.onMoon,
      spaceFlightActive: !!ctx.spaceFlight?.active,
      selLoc: ctx.selLoc,
      earthSceneRoot: {
        attached: ctx.earthSceneRoot?.parent === ctx.scene,
        children: Number(ctx.earthSceneRoot?.children?.length || 0),
        visible: ctx.earthSceneRoot?.visible === true
      }
    };
  });
  await settleVisualFrame(page);
  await page.screenshot({ path: path.join(outputDir, 'earth-after-space-return.png') });

  return report;
}

function assertReport(report) {
  if (report.builder.visual?.shapeControls !== 4) throw new Error('Builder shape controls are incomplete.');
  if (report.builder.visual?.colorControls !== 8) throw new Error('Builder color controls are incomplete.');
  if (report.builder.visual?.maxCount !== 200) throw new Error('Builder limit is not 200 blocks.');
  if (report.builder.visual?.placed?.some((placed) => placed !== true)) throw new Error('A builder shape did not render.');
  if (new Set(report.builder.visual?.meshes?.map((mesh) => mesh.shape)).size !== 4) throw new Error('Rendered builder shapes are not distinct.');
  if (new Set(report.builder.visual?.meshes?.map((mesh) => mesh.color)).size !== 4) throw new Error('Rendered builder colors are not distinct.');
  if (report.builder.limit?.accepted !== 200 || report.builder.limit?.overflowAccepted !== false) throw new Error('Builder 200-block boundary failed.');
  const jumpArcObserved = report.builder.jump?.airborneSamples >= 1 ||
    report.builder.jump?.maxY > report.builder.jump?.startY + 0.5;
  if (!jumpArcObserved || report.builder.jump?.onGround !== true ||
    Math.abs(report.builder.jump.feetY - report.builder.jump.blockTop) > 0.15) throw new Error('Walker did not jump and land on a block.');
  if (report.builder.vehicle?.cube?.blocked !== true) throw new Error('Car did not collide with a cube.');
  if (report.builder.vehicle?.ramp?.blocked !== false || !Number.isFinite(report.builder.vehicle?.ramp?.supportTopY)) {
    throw new Error('Car ramp contact is not driveable.');
  }
  if (!report.multiplayer.init?.hasApi) throw new Error('Multiplayer API did not initialize.');
  if (!report.multiplayer.init?.methods?.syncRoomWorldContext) throw new Error('Multiplayer world sync API is missing.');
  if (report.editor.open?.active !== true) throw new Error('Editor did not open.');
  if (report.editor.openVisual?.rootedInBody !== true || report.editor.openVisual?.show !== true ||
    report.editor.openVisual?.display === 'none' ||
    report.editor.openVisual?.visibility === 'hidden' || report.editor.openVisual?.opacity <= 0 ||
    report.editor.openVisual?.width < 1 || report.editor.openVisual?.height < 1) {
    throw new Error(`Editor panel is not visibly rendered: ${JSON.stringify(report.editor.openVisual)}`);
  }
  if (report.editor.closed?.active !== false) throw new Error('Editor did not close cleanly.');
  if (report.activityCreator.open?.active !== true) throw new Error('Activity creator did not open.');
  if (report.activityCreator.openVisual?.rootedInBody !== true || report.activityCreator.openVisual?.show !== true ||
    report.activityCreator.openVisual?.display === 'none' ||
    report.activityCreator.openVisual?.visibility === 'hidden' || report.activityCreator.openVisual?.opacity <= 0 ||
    report.activityCreator.openVisual?.width < 1 || report.activityCreator.openVisual?.height < 1) {
    throw new Error(`Activity creator panel is not visibly rendered: ${JSON.stringify(report.activityCreator.openVisual)}`);
  }
  if (report.activityCreator.closed?.active !== false) throw new Error('Activity creator did not close cleanly.');
  if (!(report.creatorLibrary.afterSave > report.creatorLibrary.before)) throw new Error('Creator library save did not persist.');
  if (!(report.creatorLibrary.afterRemove <= report.creatorLibrary.afterSave - 1)) throw new Error('Creator library cleanup did not remove the saved draft.');
  if (report.multiplayer.earthSync?.selLoc !== 'custom') throw new Error('Earth room sync did not set custom Earth location.');
  if (report.multiplayer.moonSync?.onMoon !== true) throw new Error('Moon room sync did not enter Moon runtime.');
  if (report.multiplayer.spaceSync?.spaceFlightActive !== true) throw new Error('Space room sync did not enter Space runtime.');
  if (report.multiplayer.cleanupTransition?.outcome !== 'arrived') {
    throw new Error(`Space-to-Earth cleanup did not finish: ${JSON.stringify(report.multiplayer.cleanupTransition)}`);
  }
  if (report.multiplayer.cleanup?.onMoon !== false || report.multiplayer.cleanup?.spaceFlightActive !== false) {
    throw new Error('Cleanup did not return runtime to Earth.');
  }
  if (!report.multiplayer.cleanup?.earthSceneRoot?.attached ||
    !report.multiplayer.cleanup?.earthSceneRoot?.visible ||
    report.multiplayer.cleanup?.earthSceneRoot?.children < 1) {
    throw new Error('Cleanup returned to Earth without a visible, populated Earth scene owner.');
  }
}

const server = await startServer();
await mkdirp(outputDir);

const headed = process.env.WE3D_HEADED === '1';
const browserChannel = String(process.env.WE3D_BROWSER_CHANNEL || '').trim();
const browser = await chromium.launch({
  headless: !headed,
  ...(browserChannel ? { channel: browserChannel } : {})
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

try {
  await bootstrapEarthRuntime(page, `http://${host}:${server.port}`);
  const report = await runAudit(page, `http://${host}:${server.port}`);
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  assertReport(report);
  console.log(JSON.stringify({ ok: true, report }, null, 2));
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
