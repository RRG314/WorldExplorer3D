import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
const server = await startStaticServer({ rootDir: process.cwd(), ports: [4493, 4494] });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const directory = 'output/verification/painttown-hud';
try {
  await fs.mkdir(directory, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.port}/404.html`);
  const result = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { ensurePaintTownState, updatePaintTownHud, setPaintTownPlayerColor } = await import('/app/js/game/paint-town/core.js?v=1');
    document.body.replaceChildren(); document.body.style.background = '#152d3a';
    const state = ensurePaintTownState();
    Object.assign(state, { active: true, timerSec: 120, totalBuildings: 100, paintedBuildings: 0 });
    updatePaintTownHud();
    const host = document.getElementById('paintTownHud');
    const toggle = host.querySelector('[data-paint-toggle]'); toggle.focus();
    for (let n = 119; n >= 115; n--) { state.timerSec = n; updatePaintTownHud(); }
    const compactStable = toggle.isConnected && document.activeElement === toggle;
    const compactTimeUpdated = host.textContent.includes('01:55');
    host.querySelector('[data-paint-toggle]').click();
    const tool = host.querySelector('[data-paint-tool="touch"]'); tool.click(); tool.focus();
    const selectedTool = host.querySelector('[data-paint-tool="touch"]');
    state.timerSec = 114; state.paintedBuildings = 3; state.lastHint = '<img src=x onerror="alert(1)">';
    updatePaintTownHud();
    const expandedStable = tool === selectedTool && tool.isConnected && document.activeElement === tool;
    const countUpdated = host.textContent.includes('3/100') && host.textContent.includes('01:54');
    const hintIsText = host.textContent.includes('<img src=x') && !host.querySelector('img');
    setPaintTownPlayerColor('#2563EB');
    const colorDoesNotReplaceTool = host.querySelector('[data-paint-tool="touch"]') === tool;
    state.rules.allowPaintballGun = false; updatePaintTownHud();
    const gunDisabled = host.querySelector('[data-paint-tool="gun"]').disabled;
    const collapse = host.querySelector('[data-paint-toggle="close"]'); collapse.click();
    const collapsed = !!host.querySelector('[data-paint-toggle="open"]');
    state.active = false; updatePaintTownHud(); const hidden = getComputedStyle(host).display === 'none';
    state.active = true; state.hudExpanded = true; updatePaintTownHud();
    return { compactStable, compactTimeUpdated, expandedStable, countUpdated, hintIsText, colorDoesNotReplaceTool, gunDisabled, collapsed, hidden };
  });
  await page.screenshot({ path: `${directory}/hud.png` });
  const report = { ok: Object.values(result).every(Boolean) && errors.length === 0, checks: result, errors, scope: 'actual HUD module and DOM, without a world or WebGL context' };
  await fs.writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report)); assert.equal(report.ok, true);
} finally { await browser.close(); await server.close(); }
