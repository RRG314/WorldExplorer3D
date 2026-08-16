#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

function parseArgs(argv) {
  const args = {
    url: 'http://127.0.0.1:5173/app/',
    out: 'output/playwright/perf-overlay.json',
    waitMs: 12000
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--url' && next) {
      args.url = next;
      i++;
    } else if (arg === '--out' && next) {
      args.out = next;
      i++;
    } else if (arg === '--wait-ms' && next) {
      const value = Number(next);
      if (Number.isFinite(value) && value > 0) args.waitMs = value;
      i++;
    }
  }
  return args;
}

function parseHumanNumber(raw) {
  if (!raw) return 0;
  const text = String(raw).trim().toUpperCase();
  const match = text.match(/^(-?\d+(?:\.\d+)?)([KMB])?$/);
  if (!match) {
    const direct = Number(text.replace(/[^\d.-]/g, ''));
    return Number.isFinite(direct) ? direct : 0;
  }
  const value = Number(match[1]);
  const suffix = match[2] || '';
  const scale = suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : suffix === 'B' ? 1e9 : 1;
  return Math.round(value * scale);
}

function parsePanelText(panelText) {
  const lines = String(panelText || '').split('\n');
  const findLine = (prefix) => lines.find((line) => line.startsWith(prefix)) || '';
  const fpsLine = findLine('FPS:');
  const drawLine = findLine('DRAW:');
  const geoLine = findLine('GEO:');
  const qualityLine = findLine('QUALITY:');

  const fpsMatch = fpsLine.match(/FPS:\s*([\d.]+)\s*CUR\s*\|\s*([\d.]+)\s*AVG\s*\|\s*FRAME:\s*([\d.]+)\s*ms/i);
  const drawMatch = drawLine.match(/DRAW:\s*([0-9.KMB-]+)\s*\|\s*TRI:\s*([0-9.KMB-]+)/i);
  const texMatch = geoLine.match(/TEX:\s*([0-9.KMB-]+)/i);

  return {
    fpsCurrent: fpsMatch ? Number(fpsMatch[1]) : 0,
    fpsAverage: fpsMatch ? Number(fpsMatch[2]) : 0,
    frameMs: fpsMatch ? Number(fpsMatch[3]) : 0,
    drawCalls: drawMatch ? parseHumanNumber(drawMatch[1]) : 0,
    triangles: drawMatch ? parseHumanNumber(drawMatch[2]) : 0,
    textures: texMatch ? parseHumanNumber(texMatch[1]) : 0,
    quality: qualityLine.replace(/^QUALITY:\s*/i, '').trim()
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const baselineLogs = [];

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('BASELINE:')) baselineLogs.push(text);
  });

  await page.goto(args.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  try {
    await page.click('#startBtn', { timeout: 8000 });
  } catch {
    // If the title screen is already hidden, continue.
  }

  await page.waitForTimeout(args.waitMs);
  await page.keyboard.press('F8');
  await page.waitForTimeout(900);

  const panelText = await page.evaluate(() => {
    const panel = document.getElementById('perfPanel');
    return panel ? panel.textContent || '' : '';
  });
  const parsed = parsePanelText(panelText);
  const payload = {
    ok: true,
    url: args.url,
    capturedAt: new Date().toISOString(),
    ...parsed,
    panelText,
    baselineLogs
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(payload, null, 2));
  await browser.close();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
