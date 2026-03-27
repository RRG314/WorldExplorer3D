import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4173, 4174, 4175, 4176, 4177];
const outputDir = path.join(rootDir, 'output', 'playwright', 'live-earth');

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
      // try next port
    }
  }
  throw new Error(`Unable to start local static server on ports: ${candidatePorts.join(', ')}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isTransientNetworkConsoleError(text = '') {
  const msg = String(text || '');
  return (
    /Failed to load resource:\s+the server responded with a status of\s+(400|429|500|502|503|504)/i.test(msg) ||
    /Missing or insufficient permissions/i.test(msg)
  );
}

async function waitForLiveEarth(page, predicate, timeoutMs, errorLabel) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      return {
        summary: typeof ctx.getLiveEarthSummary === 'function' ? ctx.getLiveEarthSummary() : null,
        debug: typeof ctx.inspectLiveEarthState === 'function' ? ctx.inspectLiveEarthState() : null,
        globeVisible: !!document.getElementById('globeSelectorScreen')?.classList.contains('show'),
        titleHidden: !!document.getElementById('titleScreen')?.classList.contains('hidden'),
        detailText: document.getElementById('globeLiveEarthDetails')?.innerText?.trim() || '',
        statusText: document.getElementById('globeLiveEarthStatus')?.textContent?.trim() || ''
      };
    });
    if (predicate(last)) return last;
    await page.waitForTimeout(500);
  }
  throw new Error(`${errorLabel}. Last state: ${JSON.stringify(last || {})}`);
}

async function ensureLiveEarthOpen(page, layerId = 'satellites', timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(async (nextLayerId) => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      ctx.openGlobeSelector?.();
      ctx.liveEarth?.setPanelMode?.('live-earth');
      if (typeof ctx.liveEarth?.setActiveLayer === 'function') {
        await ctx.liveEarth.setActiveLayer(nextLayerId);
      }
      return {
        summary: typeof ctx.getLiveEarthSummary === 'function' ? ctx.getLiveEarthSummary() : null,
        debug: typeof ctx.inspectLiveEarthState === 'function' ? ctx.inspectLiveEarthState() : null,
        globeVisible: !!document.getElementById('globeSelectorScreen')?.classList.contains('show')
      };
    }, layerId);
    if (last.globeVisible && last.debug?.panelMode === 'live-earth' && last.summary?.activeLayerId === layerId) {
      return last;
    }
    await page.waitForTimeout(700);
  }
  throw new Error(`Timed out opening Live Earth selector for ${layerId}. Last state: ${JSON.stringify(last || {})}`);
}

async function main() {
  await mkdirp(outputDir);
  const serverHandle = await startServer();
  const baseUrl = `http://${host}:${serverHandle.port}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!isTransientNetworkConsoleError(text)) {
        consoleErrors.push({ type: 'console.error', text });
      }
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push({ type: 'pageerror', text: String(err?.message || err) });
  });

  const report = {
    satellites: null,
    earthquakes: null,
    weather: null,
    ships: null,
    aircraft: null,
    travel: null,
    localSatellite: null,
    consoleErrors
  };

  try {
    await page.goto(`${baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      return typeof ctx.openLiveEarthSelector === 'function' &&
        typeof ctx.getLiveEarthSummary === 'function' &&
        typeof ctx.inspectLiveEarthState === 'function';
    }, { timeout: 120000 });
    await page.waitForTimeout(4000);

    await ensureLiveEarthOpen(page, 'satellites');

    const satelliteState = await waitForLiveEarth(
      page,
      (state) => state.globeVisible && state.summary?.activeLayerId === 'satellites' && Number(state.summary?.satellites || 0) >= 8,
      60000,
      'Timed out waiting for Live Earth satellite layer'
    );
    report.satellites = satelliteState;
    await page.screenshot({ path: path.join(outputDir, 'satellites.png'), fullPage: true });

    await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      await ctx.liveEarth?.setActiveLayer?.('earthquakes');
    });
    const earthquakeState = await waitForLiveEarth(
      page,
      (state) => state.summary?.activeLayerId === 'earthquakes' && Number(state.summary?.earthquakes || 0) >= 20,
      60000,
      'Timed out waiting for Live Earth earthquake layer'
    );
    report.earthquakes = earthquakeState;
    await page.screenshot({ path: path.join(outputDir, 'earthquakes.png'), fullPage: true });

    await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      await ctx.liveEarth?.setActiveLayer?.('weather');
    });
    const weatherState = await waitForLiveEarth(
      page,
      (state) => state.summary?.activeLayerId === 'weather' && Number(state.summary?.weatherSamples || 0) >= 5,
      60000,
      'Timed out waiting for Live Earth weather layer'
    );
    report.weather = weatherState;
    await page.screenshot({ path: path.join(outputDir, 'weather.png'), fullPage: true });

    await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      await ctx.liveEarth?.setActiveLayer?.('ships');
    });
    const shipState = await waitForLiveEarth(
      page,
      (state) => state.summary?.activeLayerId === 'ships' && Number(state.summary?.ships || 0) >= 10,
      30000,
      'Timed out waiting for Live Earth ships layer'
    );
    report.ships = shipState;
    await page.screenshot({ path: path.join(outputDir, 'ships.png'), fullPage: true });

    await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      await ctx.liveEarth?.setActiveLayer?.('aircraft');
    });
    const aircraftState = await waitForLiveEarth(
      page,
      (state) => state.summary?.activeLayerId === 'aircraft' && Number(state.summary?.aircraft || 0) >= 12,
      30000,
      'Timed out waiting for Live Earth aircraft layer'
    );
    report.aircraft = aircraftState;
    await page.screenshot({ path: path.join(outputDir, 'aircraft.png'), fullPage: true });

    await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      await ctx.liveEarth?.setActiveLayer?.('earthquakes');
    });
    await waitForLiveEarth(
      page,
      (state) => state.summary?.activeLayerId === 'earthquakes' && Number(state.summary?.earthquakes || 0) >= 20,
      30000,
      'Timed out switching back to earthquakes'
    );
    await page.click('[data-live-earth-action="travel-earthquake"]', { force: true });

    const travelState = await waitForLiveEarth(
      page,
      (state) => state.titleHidden && !!state.debug?.localEventId,
      120000,
      'Timed out waiting for local earthquake travel activation'
    );
    report.travel = travelState;
    await page.screenshot({ path: path.join(outputDir, 'earthquake-local.png'), fullPage: true });

    await ensureLiveEarthOpen(page, 'satellites');
    await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      ctx.globeSelector?.setSelection?.(39.2904, -76.6122, {
        name: 'Baltimore',
        focus: true,
        skipAutoFavorite: true
      });
      await new Promise((resolve) => setTimeout(resolve, 2500));
      if (ctx.liveEarth?.state) {
        ctx.liveEarth.state.selectedSatelliteId = 'goes-16';
      }
      if (typeof ctx.liveEarth?.setActiveLayer === 'function') {
        await ctx.liveEarth.setActiveLayer('satellites');
      }
      document.getElementById('globeSelectorStartBtn')?.click();
    });

    const localSatelliteState = await waitForLiveEarth(
      page,
      (state) => !!state.debug?.localSatelliteLook && Number(state.debug.localSatelliteLook.elevationDeg || -90) > 0,
      90000,
      'Timed out waiting for local satellite visibility context'
    );
    report.localSatellite = localSatelliteState;
    await page.screenshot({ path: path.join(outputDir, 'local-satellite.png'), fullPage: true });

    assert(report.satellites.summary.satellites >= 8, 'Expected curated satellite set to load.');
    assert(report.earthquakes.summary.earthquakes >= 20, 'Expected recent earthquakes to load.');
    assert(report.weather.summary.weatherSamples >= 5, 'Expected Live Earth weather samples to load.');
    assert(report.ships.summary.ships >= 10, 'Expected ship corridor traffic to load.');
    assert(report.aircraft.summary.aircraft >= 12, 'Expected aircraft corridor traffic to load.');
    assert(!!report.travel.debug?.localEventId, 'Expected local earthquake event context after travel.');
    assert(Number(report.localSatellite.debug?.localSatelliteLook?.elevationDeg || -90) > 0, 'Expected selected satellite to be above local horizon.');
    assert(consoleErrors.length === 0, `Console/page errors present: ${JSON.stringify(consoleErrors)}`);

    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    await serverHandle.close();
  }
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
});
