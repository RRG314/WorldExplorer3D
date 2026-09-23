import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const root = path.resolve(process.env.WE3D_VERIFY_ROOT || '.');
const out = 'output/verification/title-header-layout';
await fs.mkdir(out, { recursive: true });
const server = await startStaticServer({ rootDir: root, ports: [4475, 4476] });
const html = (await fs.readFile(path.join(root, 'app/index.html'), 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  const page = await browser.newPage();
  await page.setContent(html.replace('<head>', `<head><base href="http://127.0.0.1:${server.port}/app/">`), { waitUntil: 'load' });
  await page.evaluate(async () => {
    const globe = document.getElementById('globeSelectorScreen');
    const auth = document.getElementById('appSignInBtn');
    const panel = document.getElementById('authFloatPanel');
    document.body.replaceChildren(globe, ...(globe.contains(auth) ? [] : [auth]), panel);
    document.body.className = 'start-hub-open globe-selector-open';
    globe.classList.add('show');
    auth.hidden = false;
    await document.fonts.ready;
  });
  for (const width of [360, 390, 520, 768, 900, 901, 1100, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const signedIn of [false, true]) {
      const result = await page.evaluate(signedIn => {
        document.getElementById('appSignInBtn').textContent = signedIn ? 'Account' : 'Sign In / Sign Up';
        const nodes = [...new Set([document.getElementById('appSignInBtn'), document.getElementById('globeLocationSearchBtn'), ...document.querySelectorAll('.globe-hub-tools button')])];
        const targets = nodes.map(node => {
          const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.x+r.width/2, r.y+r.height/2);
          return { id: node.id || node.getAttribute('aria-label'), x:r.x, y:r.y, width:r.width, height:r.height, hit: hit===node || node.contains(hit), inBounds:r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight };
        }).filter(r => r.width && r.height);
        const overlaps = [];
        for (let i=0;i<targets.length;i++) for (let j=i+1;j<targets.length;j++) {
          const a=targets[i],b=targets[j];
          if(a.x<b.x+b.width && b.x<a.x+a.width && a.y<b.y+b.height && b.y<a.y+a.height) overlaps.push([a.id,b.id]);
        }
        const panel = document.getElementById('authFloatPanel');
        panel.hidden = false;
        const toggle = document.getElementById('appSignInBtn');
        const r = toggle.getBoundingClientRect();
        const panelDoesNotCoverToggle = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2) === toggle;
        panel.hidden = true;
        return { targets, overlaps, panelDoesNotCoverToggle, ok: panelDoesNotCoverToggle && overlaps.length===0 && targets.every(r=>r.hit && r.inBounds && r.width>=34 && r.height>=34) };
      }, signedIn);
      results.push({ width, signedIn, ...result });
      if (width===1100 || width===390) await page.screenshot({ path: `${out}/${width}-${signedIn?'account':'sign-in'}.png` });
    }
  }
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ ok:results.every(r=>r.ok), evidenceScope:'real production markup/styles, isolated title header hit testing', results },null,2));
  console.log(JSON.stringify(results.map(({width,signedIn,ok,overlaps})=>({width,signedIn,ok,overlaps}))));
  assert.ok(results.every(r=>r.ok), 'Title actions must not cover one another');
} finally {
  await browser.close();
  await server.close();
}
