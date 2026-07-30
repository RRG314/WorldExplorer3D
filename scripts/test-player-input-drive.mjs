import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { classifyEvidence } from './production-readiness.mjs';

const rootDir = process.cwd();
const outputDir = path.join(
  rootDir,
  'output',
  'playwright',
  'player-input-drive'
);
const reportPath = path.join(outputDir, 'report.json');
const requestedSeconds = Number(process.env.PLAYER_DRIVE_SECONDS || 60);
const targetSeconds = Math.max(20, requestedSeconds);
const headed = process.env.PLAYER_DRIVE_HEADED === '1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function signedAngleDelta(from, to) {
  let delta = Number(to) - Number(from);
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = Number(server.address()?.port);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startPreviewServer() {
  const port = await reservePort();
  const child = spawn(process.execPath, ['scripts/serve-local-preview.mjs'], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Preview server did not start: ${stderr}`));
    }, 20000);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Preview server exited with status ${code}: ${stderr}`));
    });
    child.stdout.on('data', (chunk) => {
      if (!String(chunk).includes('Local preview server running')) return;
      clearTimeout(timeout);
      resolve();
    });
  });
  return {
    port,
    close: async () => {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 5000);
        child.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
  };
}

async function launchFromUserInterface(page) {
  await page.waitForFunction(() => {
    const globe = document.getElementById('globeSelectorScreen');
    const start = document.getElementById('startBtn');
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        element.getBoundingClientRect().width > 0 &&
        element.getBoundingClientRect().height > 0;
    };
    return visible(globe) || (visible(start) && !start.disabled);
  }, { timeout: 60000 });
  let globeVisible = await page.locator('#globeSelectorScreen').isVisible();
  if (!globeVisible) {
    const gamesTab = page.locator('.tab-btn[data-tab="games"]');
    if (await gamesTab.isVisible()) await gamesTab.click();
    const freeMode = page.locator('.mode[data-mode="free"]');
    if (await freeMode.isVisible()) await freeMode.click();
    await page.locator('#startBtn').click();
    await page.waitForFunction(() => {
      const titleHidden =
        document.getElementById('titleScreen')?.classList.contains('hidden');
      const selectorVisible =
        document.getElementById('globeSelectorScreen')?.classList.contains('show');
      return titleHidden || selectorVisible;
    }, { timeout: 60000 });
    globeVisible = await page.locator('#globeSelectorScreen').isVisible();
  }
  if (globeVisible) {
    await page.locator('#globeLocationSearch').fill('Baltimore, USA');
    await page.locator('#globeCustomLat').fill('39.2904');
    await page.locator('#globeCustomLon').fill('-76.6122');
    await page.locator('#globeSelectorStartBtn').click();
  }

  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const deadline = performance.now() + 120000;
    let consecutiveReadySamples = 0;
    while (performance.now() < deadline && consecutiveReadySamples < 6) {
      const loading = document.getElementById('loading');
      const ready = (
        ctx?.gameStarted === true &&
        ctx?.worldLoading === false &&
        Array.isArray(ctx?.roads) &&
        ctx.roads.length > 300 &&
        Number.isFinite(Number(ctx?.car?.x)) &&
        Number.isFinite(Number(ctx?.car?.z)) &&
        !loading?.classList.contains('show')
      );
      consecutiveReadySamples = ready ? consecutiveReadySamples + 1 : 0;
      if (consecutiveReadySamples < 6) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (consecutiveReadySamples < 6) {
      throw new Error('Earth runtime never reached a stable player-ready state');
    }
  });
}

async function pose(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const surface = ctx?.SurfaceQuery?.driveAt?.(
      Number(ctx?.car?.x),
      Number(ctx?.car?.z),
      Number(ctx?.car?.y) - 1.2
    );
    return {
      timestamp: performance.now(),
      gameStarted: ctx?.gameStarted === true,
      paused: ctx?.paused === true,
      mode: String(ctx?.getCurrentTravelMode?.() || ''),
      actions: ctx?.readControlActions?.('drive') || null,
      x: Number(ctx?.car?.x),
      y: Number(ctx?.car?.y),
      z: Number(ctx?.car?.z),
      angle: Number(ctx?.car?.angle),
      speed: Number(ctx?.car?.speed),
      surfaceY: Number(surface?.position?.y),
      camera: {
        x: Number(ctx?.camera?.position?.x),
        y: Number(ctx?.camera?.position?.y),
        z: Number(ctx?.camera?.position?.z)
      }
    };
  });
}

async function enterDriveModeFromKeyboard(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const mode = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return String(ctx?.getCurrentTravelMode?.() || '');
    });
    if (mode === 'drive') return { mode, keyPresses: attempt };
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(500);
  }
  const mode = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return String(ctx?.getCurrentTravelMode?.() || '');
  });
  return { mode, keyPresses: 5 };
}

async function holdAndSample(page, keys, durationMs, samples) {
  for (const key of keys) await page.keyboard.down(key);
  const deadline = Date.now() + durationMs;
  try {
    while (Date.now() < deadline) {
      await page.waitForTimeout(Math.min(250, Math.max(1, deadline - Date.now())));
      samples.push(await pose(page));
    }
  } finally {
    for (const key of [...keys].reverse()) await page.keyboard.up(key);
  }
}

async function holdAndSampleUntil(
  page,
  keys,
  timeoutMs,
  samples,
  predicate
) {
  for (const key of keys) await page.keyboard.down(key);
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  try {
    while (Date.now() < deadline) {
      await page.waitForTimeout(250);
      latest = await pose(page);
      samples.push(latest);
      if (predicate(latest)) return latest;
    }
    return latest;
  } finally {
    for (const key of [...keys].reverse()) await page.keyboard.up(key);
  }
}

await fs.mkdir(outputDir, { recursive: true });
const server = await startPreviewServer();
const browser = await chromium.launch({ headless: !headed });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) {
    consoleErrors.push(message.text());
  }
});

let report = null;
try {
  await page.goto(`http://127.0.0.1:${server.port}/app/`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await launchFromUserInterface(page);
  const gpu = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const gl = ctx?.renderer?.getContext?.();
    const extension = gl?.getExtension?.('WEBGL_debug_renderer_info');
    const vendor = extension ?
      gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) :
      gl?.getParameter?.(gl.VENDOR) || '';
    const renderer = extension ?
      gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) :
      gl?.getParameter?.(gl.RENDERER) || '';
    return { vendor: String(vendor), renderer: String(renderer) };
  });
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(
    `${gpu.vendor} ${gpu.renderer}`
  );
  const driveModeEntry = await enterDriveModeFromKeyboard(page);
  assert(
    driveModeEntry.mode === 'drive',
    `player input could not enter drive mode (got ${driveModeEntry.mode})`
  );

  const samples = [await pose(page)];
  const wallClockStartedAt = Date.now();

  const forwardRightStart = await pose(page);
  await holdAndSample(page, ['ArrowUp', 'ArrowRight'], 4000, samples);
  const forwardRightEnd = await pose(page);
  const reverseReady = await holdAndSampleUntil(
    page,
    ['ArrowDown'],
    12000,
    samples,
    (sample) => sample.speed < -1
  );
  const reverseMotionObserved = reverseReady?.speed < -1;
  if (!softwareRenderer) {
    assert(
      reverseMotionObserved,
      `real input never reached reverse speed (got ${reverseReady?.speed})`
    );
  }

  const reverseRightStart = await pose(page);
  await holdAndSample(page, ['ArrowDown', 'ArrowRight'], 5000, samples);
  const reverseRightEnd = await pose(page);

  const elapsedBeforeSoak = (Date.now() - wallClockStartedAt) / 1000;
  const remainingMs = Math.max(0, (targetSeconds - elapsedBeforeSoak) * 1000);
  let segment = 0;
  let remaining = remainingMs;
  while (remaining > 0) {
    const duration = Math.min(5000, remaining);
    const steeringKey = segment % 2 === 0 ? 'ArrowLeft' : 'ArrowRight';
    await holdAndSample(page, ['ArrowUp', steeringKey], duration, samples);
    remaining -= duration;
    segment += 1;
  }

  const wallClockSeconds = (Date.now() - wallClockStartedAt) / 1000;
  const displacements = samples.slice(1).map((sample, index) =>
    Math.hypot(
      sample.x - samples[index].x,
      sample.z - samples[index].z
    )
  );
  const first = samples[0];
  const last = samples.at(-1);
  const cameraSpan = Math.hypot(
    last.camera.x - first.camera.x,
    last.camera.y - first.camera.y,
    last.camera.z - first.camera.z
  );
  const finiteSurfaceSamples = samples.filter((sample) =>
    Number.isFinite(sample.surfaceY)
  );
  const maximumSurfaceGap = Math.max(
    0,
    ...finiteSurfaceSamples.map((sample) =>
      Math.abs((sample.y - 1.2) - sample.surfaceY)
    )
  );
  const forwardRightAngleDelta = signedAngleDelta(
    forwardRightStart.angle,
    forwardRightEnd.angle
  );
  const reverseRightAngleDelta = signedAngleDelta(
    reverseRightStart.angle,
    reverseRightEnd.angle
  );

  report = {
    ok: false,
    generatedAt: new Date().toISOString(),
    location: 'Baltimore',
    targetSeconds,
    wallClockSeconds: Number(wallClockSeconds.toFixed(2)),
    sampleCount: samples.length,
    initialRuntime: {
      gameStarted: first.gameStarted,
      paused: first.paused,
      mode: first.mode,
      actions: first.actions
    },
    finalRuntime: {
      gameStarted: last.gameStarted,
      paused: last.paused,
      mode: last.mode,
      actions: last.actions
    },
    maximumObservedThrottle: Math.max(
      0,
      ...samples.map((sample) => Number(sample.actions?.throttle || 0))
    ),
    maximumObservedReverse: Math.max(
      0,
      ...samples.map((sample) => Number(sample.actions?.reverse || 0))
    ),
    reverseMotionObserved,
    displacement: Number(
      Math.hypot(last.x - first.x, last.z - first.z).toFixed(2)
    ),
    pathDistance: Number(
      displacements.reduce((sum, value) => sum + value, 0).toFixed(2)
    ),
    maximumStep: Number(Math.max(0, ...displacements).toFixed(3)),
    maximumSurfaceGap: Number(maximumSurfaceGap.toFixed(3)),
    surfaceSampleCount: finiteSurfaceSamples.length,
    cameraSpan: Number(cameraSpan.toFixed(2)),
    forwardRightAngleDelta: Number(forwardRightAngleDelta.toFixed(4)),
    reverseRightAngleDelta: Number(reverseRightAngleDelta.toFixed(4)),
    gpu: { ...gpu, softwareRenderer },
    functionalMinimums: softwareRenderer
      ? {
          sampleCount: 8,
          pathDistance: 2,
          cameraSpan: 5,
          budgetEligible: false
        }
      : {
          sampleCount: Math.max(20, targetSeconds),
          pathDistance: 100,
          cameraSpan: 20,
          budgetEligible: true
        },
    driveModeEntry,
    consoleErrors,
    evidence: classifyEvidence({
      kind: 'player-gameplay',
      realInput: true,
      wallClockSeconds,
      softwareRenderer,
      visualReviewApproved: false
    })
  };

  await page.screenshot({
    path: path.join(outputDir, 'final.png'),
    fullPage: false
  });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  assert(
    wallClockSeconds >= targetSeconds - 0.5,
    `real-input drive ended early at ${wallClockSeconds.toFixed(2)} seconds`
  );
  assert(
    samples.length >= report.functionalMinimums.sampleCount,
    `real-input sampling was too sparse: ${samples.length} samples`
  );
  assert(
    report.pathDistance >= report.functionalMinimums.pathDistance,
    `real-input drive moved only ${report.pathDistance} m`
  );
  assert(report.maximumStep <= 15, `real-input drive teleported ${report.maximumStep} m`);
  assert(report.surfaceSampleCount >= samples.length * 0.9, 'drive surface was unavailable for too many real-input samples');
  assert(report.maximumSurfaceGap <= 1, `real-input suspension gap reached ${report.maximumSurfaceGap} m`);
  assert(
    report.cameraSpan >= report.functionalMinimums.cameraSpan,
    'camera did not follow the real-input drive'
  );
  assert(
    Math.abs(forwardRightAngleDelta) >= 0.02,
    'forward-right input did not steer'
  );
  if (reverseMotionObserved) {
    assert(
      Math.abs(reverseRightAngleDelta) >= 0.02,
      'reverse-right input did not steer'
    );
    assert(
      Math.sign(forwardRightAngleDelta) !== Math.sign(reverseRightAngleDelta),
      `forward/reverse steering signs did not invert: ${JSON.stringify({
        forwardRightAngleDelta,
        reverseRightAngleDelta
      })}`
    );
  }
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join('; ')}`);

  report.ok = true;
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await fs.writeFile(reportPath, JSON.stringify({
    ...(report || {}),
    ok: false,
    error: String(error?.message || error)
  }, null, 2));
  throw error;
} finally {
  await browser.close();
  await server.close();
}
