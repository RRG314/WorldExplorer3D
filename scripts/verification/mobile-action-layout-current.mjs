import './urban-prompt-layout-current.mjs';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { showWorldSelectionNotice } from '../../app/js/interaction/world-click-router.js';
const root = path.resolve(process.env.WE3D_VERIFY_ROOT || '.');
const server = await startStaticServer({ rootDir: root, ports: [4467, 4468] });
const base = `http://127.0.0.1:${server.port}/app/`;
const html = (await readFile(path.join(root, 'app/index.html'), 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: devices['iPhone 13'].userAgent });
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
  const selectionResults = [];
  await page.addScriptTag({ content: `globalThis.showSelectionForLayout = ${showWorldSelectionNotice.toString()};` });
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 412, height: 915 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const handedness of ['standard', 'southpaw']) {
      const result = await page.evaluate((handedness) => {
        const controls = document.getElementById('mobileTouchControls');
        controls.dataset.handedness = handedness;
        globalThis.showSelectionForLayout('The Munsey Building',
          'Approach an entrance to enter, open Real Estate, or help improve this mapped place.',
          { label: 'Improve this place', onClick() {} });
        const card = document.getElementById('worldSelectionNotice');
        const bounds = node => { const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
        const cardBox = bounds(card);
        const targets = ['controlsBarBtn', 'mobileMovePad', 'mobileLookPad', 'mobileActionPrimary', 'mobileActionSecondary', 'mobileEquipmentUse', 'urbanEquipmentToggle'].map(id => document.getElementById(id));
        const blocked = targets.filter(node => {
          const r = bounds(node), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return (r.x < cardBox.right && cardBox.x < r.right && r.y < cardBox.bottom && cardBox.y < r.bottom) || !(hit === node || node.contains(hit));
        }).map(node => node.id);
        const actions = [...card.querySelectorAll('button:not([hidden])')].map(node => {
          const r = bounds(node), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { ...r, hit: hit === node || node.contains(hit) };
        });
        return { cardBox, blocked, actions, ok: blocked.length === 0 && cardBox.x >= 0 && cardBox.right <= innerWidth && cardBox.y >= 0 && cardBox.bottom <= innerHeight && actions.every(r => r.hit && r.width >= 44 && r.height >= 44) };
      }, handedness);
      selectionResults.push({ viewport, handedness, ...result });
      await mkdir('output/verification/mobile-action-layout', { recursive: true });
      await page.screenshot({ path: `output/verification/mobile-action-layout/selection-${viewport.width}x${viewport.height}-${handedness}.png` });
    }
  }
  const gpsResults = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    const gpsContext = await browser.newContext({ viewport, hasTouch: viewport.width < 1000, isMobile: viewport.width < 1000 });
    const gpsPage = await gpsContext.newPage();
    try {
      await gpsPage.setContent(html.replace('<head>', `<head><base href="${base}">`), { waitUntil: 'load' });
      const layout = await gpsPage.evaluate((mobile) => {
        for (const id of ['titleScreen', 'globeSelectorScreen', 'loading']) {
          const node = document.getElementById(id);
          if (node) node.style.display = 'none';
        }
        document.body.classList.add('live-gps-active');
        const gps = document.getElementById('liveGpsHud');
        gps.classList.add('show');
        if (mobile) document.getElementById('mobileTouchControls').className = 'show mode-walking';
        document.getElementById('liveGpsStatus').textContent = 'GPS connected. Keep this screen open while exploring.';
        const quick = document.getElementById('worldQuickControls');
        quick.hidden = false;
        quick.classList.add('show');
        const share = document.getElementById('gameShareFloatBtn');
        share.hidden = false;
        share.style.display = 'flex';
        const box = node => { const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
        const gpsBox = box(gps);
        const controls = [quick, share].map(node => ({ id:node.id, ...box(node) }));
        const overlaps = controls.filter(r => r.width > 0 && r.height > 0 && r.x < gpsBox.right && gpsBox.x < r.right && r.y < gpsBox.bottom && gpsBox.y < r.bottom);
        const playTargets = mobile ? ['mobileMovePad', 'mobileLookPad', 'mobileActionPrimary', 'mobileActionSecondary'].map(id => document.getElementById(id)) : [];
        const targets = [...quick.querySelectorAll('button'), ...gps.querySelectorAll('button:not([hidden])'), ...playTargets].map(node => {
          const r = node.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x+r.width/2, r.y+r.height/2);
          return { id:node.id, hit:node === hit || node.contains(hit) };
        });
        return { gpsBox, controls, overlaps, targets, ok:overlaps.length === 0 && targets.every(t=>t.hit) && gpsBox.bottom <= innerHeight };
      }, viewport.width < 1000);
      gpsResults.push({ viewport, ...layout });
      await mkdir('output/verification/mobile-action-layout', { recursive: true });
      await gpsPage.screenshot({ path:`output/verification/mobile-action-layout/gps-${viewport.width}x${viewport.height}.png` });
    } finally { await gpsContext.close(); }
  }
  const report = { ok: results.every(r=>r.ok) && gpsResults.every(r=>r.ok) && selectionResults.every(r=>r.ok), evidence: 'Actual app markup/styles and selection-card renderer in Chrome; layout fixture without world runtime', results, gpsResults, selectionResults };
  const output = path.resolve('output/verification/mobile-action-layout'); await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify({ ok: report.ok, cases: results.length + gpsResults.length + selectionResults.length, failures: [...results, ...gpsResults, ...selectionResults].filter(r=>!r.ok) },null,2));
  assert.equal(report.ok, true, 'Mobile action targets overlap or cannot receive touches');
} finally { await browser.close(); await server.close(); }
