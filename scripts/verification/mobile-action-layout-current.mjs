import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
const root = path.resolve(process.env.WE3D_VERIFY_ROOT || '.');
const server = await startStaticServer({ rootDir: root, ports: [4467, 4468] });
const base = `http://127.0.0.1:${server.port}/app/`;
const html = (await readFile(path.join(root, 'app/index.html'), 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.setContent(html.replace('<head>', `<head><base href="${base}">`), { waitUntil: 'load' });
  await page.evaluate(async () => {
    const controls = document.getElementById('mobileTouchControls');
    const pack = document.getElementById('urbanEquipmentToggle');
    const stack = document.getElementById('mobileActionStack');
    pack.classList.add('mobilePackAction'); stack.append(pack);
    const menus = document.getElementById('floatMenuContainer');
    menus.classList.add('show');
    document.body.replaceChildren(controls, menus);
    await document.fonts.ready;
  });
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const handedness of ['standard', 'southpaw']) for (const equipment of [false, true]) for (const pack of [false, true]) {
      const result = await page.evaluate(({ handedness, equipment, pack }) => {
        const controls = document.getElementById('mobileTouchControls');
        controls.className = `show mode-walking${equipment ? ' has-equipment-action' : ''}`;
        controls.dataset.handedness = handedness;
        const stack = document.getElementById('mobileActionStack');
        stack.classList.toggle('has-pack-action', pack);
        stack.classList.toggle('has-equipment-action', equipment);
        document.getElementById('mobileEquipmentUse').classList.toggle('hidden', !equipment);
        const packButton = document.getElementById('urbanEquipmentToggle');
        packButton.hidden = !pack; packButton.classList.toggle('mobile-mode-hidden', !pack);
        document.getElementById('mobileActionPrimary').textContent = 'Jump';
        document.getElementById('mobileActionSecondary').textContent = 'Run';
        const ids = ['controlsBarBtn','mobileMovePad','mobileLookPad','mobileActionPrimary','mobileActionSecondary', ...(equipment ? ['mobileEquipmentUse'] : []), ...(pack ? ['urbanEquipmentToggle'] : [])];
        const targets = ids.map(id => {
          const node = document.getElementById(id), r = node.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { id, x:r.x, y:r.y, width:r.width, height:r.height, hit: node === hit || node.contains(hit), inBounds: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
        });
        const overlaps = [];
        for (let i=0;i<targets.length;i++) for (let j=i+1;j<targets.length;j++) {
          const a=targets[i],b=targets[j];
          if (a.x < b.x+b.width && b.x < a.x+a.width && a.y < b.y+b.height && b.y < a.y+a.height) overlaps.push([a.id,b.id]);
        }
        return { targets, overlaps, ok: targets.every(t=>t.hit && t.inBounds && t.width>=44 && t.height>=44) && overlaps.length===0 };
      }, { handedness, equipment, pack });
      results.push({ viewport, handedness, equipment, pack, ...result });
    }
  }
  const report = { ok: results.every(r=>r.ok), evidence: 'Actual app markup/styles in Chrome; layout fixture without world runtime', results };
  const output = path.resolve('output/verification/mobile-action-layout'); await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify({ ok: report.ok, cases: results.length, failures: results.filter(r=>!r.ok) },null,2));
  assert.equal(report.ok, true, 'Mobile action targets overlap or cannot receive touches');
} finally { await browser.close(); await server.close(); }
