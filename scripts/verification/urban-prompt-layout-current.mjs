import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = path.resolve(process.env.WE3D_VERIFY_ROOT || '.');
const output = 'output/verification/urban-prompt-layout';
await mkdir(output, { recursive: true });
await writeFile(`${output}/report.json`, JSON.stringify({ ok: false, complete: false }));
const server = await startStaticServer({ rootDir: root, ports: [4495, 4496] });
const base = `http://127.0.0.1:${server.port}/app/`;
const html = (await readFile(path.join(root, 'app/index.html'), 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const buildId = await readFile(path.join(root, 'build-manifest.json'), 'utf8').then(text=>JSON.parse(text).buildId).catch(()=>null);
let browser;
const cases = [], errors = [];
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  for (const viewport of [{width:390,height:844}, {width:360,height:740}, {width:844,height:390}, {width:1280,height:800}]) {
    const mobile = viewport.width < 1000;
    const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile });
    try {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(String(error)));
      await page.setContent(html.replace('<head>', `<head><base href="${base}">`), { waitUntil: 'load' });
      await page.evaluate(() => {
        const prompt = document.getElementById('urbanVehiclePrompt');
        const canvas = document.createElement('canvas');
        canvas.id = 'fixture-world';
        canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;background:#263b48';
        document.body.replaceChildren(canvas, prompt);
        prompt.classList.add('show'); prompt.setAttribute('aria-hidden', 'false');
        document.getElementById('urbanVehiclePromptTitle').textContent = 'Enter Compact hatchback';
        document.getElementById('urbanVehiclePromptMeta').textContent = 'Driver seat • 3.0 m';
        document.getElementById('urbanVehiclePromptButton').textContent = 'Enter Compact hatchback';
        document.getElementById('urbanVehiclePromptSecondaryButton').hidden = false;
        globalThis.fixtureClicks = { world:0, buttons:[] };
        canvas.addEventListener('click', () => globalThis.fixtureClicks.world++);
        prompt.querySelectorAll('button').forEach(button => button.addEventListener('click', () => globalThis.fixtureClicks.buttons.push(button.id)));
      });
      const layout = await page.evaluate(() => {
        const box = node => { const r=node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
        const copy = box(document.querySelector('.urbanVehiclePromptCopy'));
        const point = {x:copy.x+2,y:copy.y+2};
        const buttons = [...document.querySelectorAll('#urbanVehiclePrompt button')].filter(node => node.getClientRects().length)
          .map(node => ({id:node.id,...box(node)}));
        return { point, prompt:box(document.getElementById('urbanVehiclePrompt')),
          hit:document.elementFromPoint(point.x,point.y)?.id,
          centerHit:document.elementFromPoint(innerWidth/2,innerHeight/2)?.id, buttons,
          inBounds:buttons.every(r=>r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight) };
      });
      await page.mouse.click(layout.point.x, layout.point.y);
      // Reproduce the exact center-canvas tap that failed after phone resume.
      if (viewport.width === 390) await page.locator('#fixture-world').click({ timeout:3000 });
      for (const button of layout.buttons) await page.locator(`#${button.id}`).click({ timeout: 3000 });
      const clicks = await page.evaluate(() => globalThis.fixtureClicks);
      const ok = layout.hit === 'fixture-world' && clicks.world === (viewport.width===390 ? 2 : 1) && layout.inBounds &&
        layout.buttons.length === clicks.buttons.length && layout.buttons.every(button=>clicks.buttons.includes(button.id));
      cases.push({ viewport, mobile, ...layout, clicks, ok });
      await page.screenshot({ path:`${output}/prompt-${viewport.width}x${viewport.height}.png` });
    } finally { await context.close(); }
  }
  const report = { ok:cases.every(row=>row.ok)&&errors.length===0, complete:true, servedRoot:root, buildId,
    evidenceScope:'Actual app markup/styles and real pointer actions; lightweight DOM fixture, no WebGL or multiplayer claim', cases, errors };
  await writeFile(`${output}/report.json`, JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  assert.equal(report.ok,true,'Prompt copy must pass pointer input to the world while its visible actions remain reachable');
} finally { await browser?.close(); await server.close(); }
