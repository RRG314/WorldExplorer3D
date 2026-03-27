import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4173, 4174, 4175, 4176, 4177];
const outputDir = path.join(rootDir, 'output', 'playwright', 'build-block-regression');
const BUILD_STORAGE_KEY = 'worldExplorer3D.buildBlocks.v1';
const BUILD_MIGRATION_KEY = 'worldExplorer3D.buildBlocks.migrated.v2';

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
      const resolved = path.resolve(path.join(root, relPath));
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
      if (stat?.isDirectory()) filePath = path.join(filePath, 'index.html');
      if (!(await exists(filePath))) {
        res.writeHead(404).end('not found');
        return;
      }

      const contentType = mime.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
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
    if (
      !ctx ||
      typeof ctx.loadRoads !== 'function' ||
      typeof ctx.switchEnv !== 'function' ||
      !ctx.ENV?.EARTH
    ) {
      return { ok: false, reason: 'runtime boot helpers unavailable' };
    }

    ctx.selLoc = key;
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
      ok: true,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0
    };
  }, locKey);
}

async function waitForRuntimeReady(page, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(async ({ storageKey, migrationKey }) => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      const buildGroup = ctx.scene?.getObjectByName?.('buildBlocksGroup') || null;
      return {
        worldLoading: !!ctx.worldLoading,
        roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
        buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0,
        buildGroupChildren: Array.isArray(buildGroup?.children) ? buildGroup.children.length : 0,
        buildModeEnabled: !!document.getElementById('fBlockBuild')?.classList.contains('on'),
        storageRaw: globalThis.localStorage?.getItem(storageKey),
        migration: globalThis.localStorage?.getItem(migrationKey)
      };
    }, { storageKey: BUILD_STORAGE_KEY, migrationKey: BUILD_MIGRATION_KEY });
    if (last.worldLoading === false && last.roads > 300 && last.buildings > 1000) {
      return last;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error(`Timed out waiting for runtime readiness. Last snapshot: ${JSON.stringify(last || {})}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await mkdirp(outputDir);
  const serverHandle = await startServer();
  const baseUrl = `http://${host}:${serverHandle.port}`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1536, height: 960 } });
  const page = await context.newPage();

  await page.addInitScript(([storageKey]) => {
    const seeded = [
      {
        id: 'legacy-a',
        locationKey: '39.29040,-76.61220',
        lat: 39.2904,
        lon: -76.6122,
        gx: 0,
        gy: 1,
        gz: 0,
        materialIndex: 0,
        createdAt: new Date().toISOString()
      },
      {
        id: 'legacy-b',
        locationKey: '39.29040,-76.61220',
        lat: 39.2904002,
        lon: -76.6121998,
        gx: 1,
        gy: 1,
        gz: 0,
        materialIndex: 1,
        createdAt: new Date().toISOString()
      }
    ];
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(seeded));
  }, [BUILD_STORAGE_KEY]);

  const report = {
    bootstrap: null,
    runtime: null
  };

  try {
    await page.goto(`${baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(4000);
    report.bootstrap = await bootstrapEarthRuntime(page, 'baltimore');
    assert(report.bootstrap?.ok === true, `Failed to bootstrap Earth runtime: ${JSON.stringify(report.bootstrap || {})}`);
    report.runtime = await waitForRuntimeReady(page);
    await page.screenshot({ path: path.join(outputDir, 'runtime.png'), fullPage: true });
    assert(report.runtime.buildGroupChildren === 0, `Legacy build blocks still rendered: ${report.runtime.buildGroupChildren}`);
    assert(report.runtime.storageRaw === null, 'Legacy build storage key still present after migration cleanup.');
    assert(report.runtime.migration === 'done', 'Legacy build migration flag was not set.');
  } finally {
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
    await serverHandle.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
