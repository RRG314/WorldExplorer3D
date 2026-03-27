import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4173, 4174, 4175, 4176, 4177];
const outputDir = path.join(rootDir, 'output', 'playwright', 'terrain-texture-binding');

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
  const root = rootDir;
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
      const joined = path.join(root, relPath);
      const resolved = path.resolve(joined);
      if (!resolved.startsWith(root)) {
        res.writeHead(403).end('forbidden');
        return;
      }

      let filePath = resolved;
      let stat = null;
      try {
        stat = await fs.stat(filePath);
      } catch {
        stat = null;
      }
      if (stat && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
      if (!(await exists(filePath))) {
        res.writeHead(404).end('not found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mime.get(ext) || 'application/octet-stream' });
      res.end(await fs.readFile(filePath));
    } catch (error) {
      res.writeHead(500).end(String(error?.message || error));
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
      const handle = await serveStaticRoot(port);
      return { ...handle, owned: true };
    } catch {
      // try next candidate
    }
  }
  throw new Error(`Unable to start local static server on ports: ${candidatePorts.join(', ')}`);
}

async function bootstrapEarthRuntime(page, locKey = 'baltimore') {
  return await page.evaluate(async (key) => {
    const deadline = performance.now() + 60000;
    let ctx = null;
    while (performance.now() < deadline) {
      const mod = await import('/app/js/shared-context.js?v=55');
      ctx = mod?.ctx || {};
      if (
        typeof ctx.loadRoads === 'function' &&
        typeof ctx.switchEnv === 'function' &&
        ctx.ENV?.EARTH
      ) {
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    if (!ctx?.ENV?.EARTH) return { ok: false, reason: 'runtime boot helpers unavailable' };

    ctx.selLoc = key;
    ctx.gameMode = 'free';
    ctx.loadingScreenMode = 'earth';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    ['hud', 'minimap', 'floatMenuContainer', 'mainMenuBtn', 'controlsTab', 'coords', 'historicBtn'].forEach((id) => {
      document.getElementById(id)?.classList.add('show');
    });
    await ctx.loadRoads();
    ctx.Walk?.setModeDrive?.();
    ctx.startMode?.();
    return { ok: true, roads: ctx.roads.length, buildings: ctx.buildings.length };
  }, locKey);
}

async function inspectTerrainTextureBinding(page) {
  return await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    const target = ctx.geoToWorld(39.3003, -76.6020);
    ctx.car.x = target.x;
    ctx.car.z = target.z;
    ctx.updateTerrainAround(target.x, target.z);
    await new Promise((resolve) => window.setTimeout(resolve, 5000));

    const mesh = Array.isArray(ctx.terrainGroup?.children) ?
      ctx.terrainGroup.children.find((candidate) => candidate?.userData?.terrainTile) :
      null;
    const textureSet = mesh?.userData?.terrainTextureSet || null;
    return {
      ok: true,
      terrainModeHint: ctx.worldSurfaceProfile?.terrainModeHint || null,
      terrainVisualMode: mesh?.userData?.terrainVisualProfile?.mode || null,
      grassDiffuseReady: !!ctx.grassDiffuse,
      terrainTextureSetMap: !!textureSet?.map,
      terrainTextureSetMapImage: !!textureSet?.map?.image,
      terrainMaterialMap: !!mesh?.material?.map,
      terrainMaterialMapImage: !!mesh?.material?.map?.image,
      terrainMaterialNormal: !!mesh?.material?.normalMap,
      terrainMaterialRoughness: !!mesh?.material?.roughnessMap
    };
  });
}

async function main() {
  await mkdirp(outputDir);
  const serverHandle = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

  try {
    await page.goto(`http://${host}:${serverHandle.port}/app/`, { waitUntil: 'domcontentloaded' });
    const bootstrap = await bootstrapEarthRuntime(page, 'baltimore');
    if (!bootstrap.ok) throw new Error(`bootstrap failed: ${bootstrap.reason || 'unknown'}`);
    const report = await inspectTerrainTextureBinding(page);
    if (!report.ok) throw new Error('terrain texture inspection failed');
    if (report.terrainModeHint !== 'grass' || report.terrainVisualMode !== 'grass') {
      throw new Error(`unexpected terrain mode: ${JSON.stringify(report)}`);
    }
    if (!report.grassDiffuseReady) {
      throw new Error(`grass texture source never became ready: ${JSON.stringify(report)}`);
    }
    if (!report.terrainTextureSetMap || !report.terrainMaterialMap) {
      throw new Error(`grass terrain texture binding failed: ${JSON.stringify(report)}`);
    }

    await page.screenshot({ path: path.join(outputDir, 'runtime.png') });
    await fs.writeFile(
      path.join(outputDir, 'report.json'),
      JSON.stringify({ ok: true, bootstrap, report, errors }, null, 2)
    );
  } finally {
    await context.close();
    await browser.close();
    await serverHandle.close();
  }
}

main().catch(async (error) => {
  await mkdirp(outputDir);
  await fs.writeFile(
    path.join(outputDir, 'report.json'),
    JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2)
  );
  console.error(error);
  process.exitCode = 1;
});
