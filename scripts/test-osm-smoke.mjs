import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4173, 4174, 4175, 4176, 4177];
const outputDir = path.join(rootDir, 'output', 'playwright', 'osm-smoke');

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

      if (stat && stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

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

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  return server;
}

async function startServer() {
  for (const port of candidatePorts) {
    try {
      const server = await serveStaticRoot(port);
      return { server, port, owned: true };
    } catch {
      // try next candidate
    }
  }
  throw new Error(`Unable to start local static server on ports: ${candidatePorts.join(', ')}`);
}

function isTransientNetworkConsoleError(text = '') {
  const msg = String(text || '');
  return /Failed to load resource:\s+the server responded with a status of\s+(429|500|502|503|504)/i.test(msg);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForUiReady(page) {
  await page.waitForFunction(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx;
    return !!(
      ctx &&
      typeof ctx.setTitleLocationMode === 'function' &&
      typeof ctx.switchEnv === 'function'
    );
  }, { timeout: 90000 });
}

async function resolveRuntimeState(page) {
  return await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    return {
      env: typeof ctx.getEnv === 'function' ? ctx.getEnv() : null,
      oceanActive: !!ctx?.oceanMode?.active,
      titleHidden: !!document.getElementById('titleScreen')?.classList.contains('hidden')
    };
  });
}

async function launchFromTitle(page, launchMode = 'earth') {
  const modePrepared = await page.evaluate(async (mode) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    if (typeof ctx.setTitleLocationMode === 'function') {
      ctx.setTitleLocationMode(mode === 'ocean' ? 'ocean' : 'earth');
      return true;
    }
    return false;
  }, launchMode);
  if (!modePrepared) {
    if (launchMode === 'ocean') {
      await page.click('#oceanLaunchToggle', { force: true });
    } else {
      await page.click('#earthLaunchToggle', { force: true });
    }
  }

  await page.click('#startBtn', { force: true });

  const pollForGate = async (timeoutMs) => {
    let gate = null;
    let lastState = null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      lastState = await page.evaluate(async () => {
        const titleHidden = !!document.getElementById('titleScreen')?.classList.contains('hidden');
        const globeVisible = !!document.getElementById('globeSelectorScreen')?.classList.contains('show');
        const mod = await import('/app/js/shared-context.js?v=55');
        const ctx = mod?.ctx || {};
        return {
          titleHidden,
          globeVisible,
          gameStarted: !!ctx.gameStarted,
          loadingScreenMode: ctx.loadingScreenMode || null,
          selLoc: ctx.selLoc || null
        };
      });
      if (lastState.titleHidden) {
        gate = 'title_hidden';
        break;
      }
      if (lastState.globeVisible) {
        gate = 'globe';
        break;
      }
      await page.waitForTimeout(350);
    }
    return { gate, lastState };
  };

  let { gate, lastState } = await pollForGate(40000);
  if (!gate) {
    await page.evaluate(() => {
      const btn = document.getElementById('startBtn');
      if (!btn) return;
      btn.click();
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    });
    const retry = await pollForGate(20000);
    gate = retry.gate;
    lastState = retry.lastState;
  }
  if (!gate) {
    throw new Error(`Launch did not transition from title. Last state: ${JSON.stringify(lastState || {})}`);
  }

  if (gate === 'globe') {
    await page.fill('#globeCustomLat', '39.2904');
    await page.fill('#globeCustomLon', '-76.6122');
    await page.click('#globeSelectorStartBtn', { force: true });
    const hiddenHandle = await page.waitForFunction(
      () => !!document.getElementById('titleScreen')?.classList.contains('hidden'),
      { timeout: 90000 }
    );
    await hiddenHandle.dispose();
  }
}

async function main() {
  await mkdirp(outputDir);

  const serverHandle = await startServer();
  const baseUrl = `http://${host}:${serverHandle.port}/app/`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });

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

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#startBtn', { timeout: 30000 });
    await waitForUiReady(page);

    const titlePresence = await page.evaluate(() => {
      const titleGeoBtn = document.getElementById('titleUseMyLocationBtn');
      const globeGeoBtn = document.getElementById('globeSelectorLocateBtn');
      const oceanToggle = document.getElementById('oceanLaunchToggle');
      return {
        hasTitleGeolocation: !!titleGeoBtn,
        titleGeolocationLabel: titleGeoBtn?.textContent?.trim() || null,
        hasGlobeGeolocation: !!globeGeoBtn,
        globeGeolocationLabel: globeGeoBtn?.textContent?.trim() || null,
        hasOceanLaunchToggle: !!oceanToggle,
        oceanLaunchLabel: oceanToggle?.textContent?.trim() || null
      };
    });

    await page.screenshot({ path: path.join(outputDir, 'title.png'), fullPage: true });

    assert(titlePresence.hasTitleGeolocation, 'Missing #titleUseMyLocationBtn');
    assert(titlePresence.hasGlobeGeolocation, 'Missing #globeSelectorLocateBtn');
    assert(titlePresence.hasOceanLaunchToggle, 'Missing #oceanLaunchToggle');

    await launchFromTitle(page, 'earth');
    await page.waitForTimeout(1800);
    const earthStateAfterTitleLaunch = await resolveRuntimeState(page);

    const oceanSwitchIssued = await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      if (typeof ctx.startOceanMode === 'function') {
        ctx.startOceanMode();
        return true;
      }
      return false;
    });
    assert(oceanSwitchIssued, 'startOceanMode() is unavailable on app context');

    await page.waitForFunction(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      const env = typeof ctx.getEnv === 'function' ? ctx.getEnv() : null;
      return !!(ctx?.oceanMode?.active || env === 'OCEAN');
    }, { timeout: 90000 });
    await page.waitForTimeout(1200);
    const oceanState = await resolveRuntimeState(page);
    await page.screenshot({ path: path.join(outputDir, 'ocean-mode.png'), fullPage: true });
    assert(oceanState.oceanActive || oceanState.env === 'OCEAN', `Ocean mode not active (env=${oceanState.env})`);

    await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      if (ctx?.oceanMode?.active && typeof ctx.stopOceanMode === 'function') {
        ctx.stopOceanMode();
      }
      if (typeof ctx.switchEnv === 'function' && ctx.ENV?.EARTH) {
        ctx.switchEnv(ctx.ENV.EARTH);
      }
    });
    await page.waitForFunction(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      const env = typeof ctx.getEnv === 'function' ? ctx.getEnv() : null;
      return env === 'EARTH' && !ctx?.oceanMode?.active;
    }, { timeout: 90000 });
    await page.waitForTimeout(1200);
    const earthState = await resolveRuntimeState(page);
    await page.screenshot({ path: path.join(outputDir, 'earth-mode.png'), fullPage: true });

    assert(earthStateAfterTitleLaunch.env === 'EARTH', `Expected EARTH env after title launch (got ${earthStateAfterTitleLaunch.env})`);
    assert(earthState.env === 'EARTH', `Expected EARTH env after ocean return (got ${earthState.env})`);
    assert(!earthState.oceanActive, 'Ocean renderer remained active after Earth return');

    const checks = {
      titleGeolocationPresent: titlePresence.hasTitleGeolocation,
      globeGeolocationPresent: titlePresence.hasGlobeGeolocation,
      oceanLaunchTogglePresent: titlePresence.hasOceanLaunchToggle,
      oceanLaunchWorks: oceanState.oceanActive || oceanState.env === 'OCEAN',
      earthLaunchWorks:
        earthStateAfterTitleLaunch.env === 'EARTH' &&
        earthState.env === 'EARTH' &&
        !earthState.oceanActive,
      noConsoleErrors: consoleErrors.length === 0
    };

    const report = {
      ok: Object.values(checks).every(Boolean),
      url: baseUrl,
      checks,
      titlePresence,
      earthStateAfterTitleLaunch,
      oceanState,
      earthState,
      consoleErrors
    };

    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));

    assert(checks.noConsoleErrors, `Console/page errors present: ${consoleErrors.length}`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    if (serverHandle.server && serverHandle.owned) {
      await new Promise((resolve) => serverHandle.server.close(resolve));
    }
  }
}

main().catch(async (err) => {
  const fallback = {
    ok: false,
    error: err?.message || String(err)
  };
  try {
    await mkdirp(outputDir);
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(fallback, null, 2));
  } catch {
    // best-effort only
  }
  console.error('[test-osm-smoke] Failed:', err?.stack || err?.message || String(err));
  process.exit(1);
});
