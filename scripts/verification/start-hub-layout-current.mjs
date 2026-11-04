import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { startStaticServer } from './static-server.mjs';

const root = process.cwd();
const output = path.resolve(
  process.env.WE3D_HUB_LAYOUT_OUTPUT ||
    `output/verification/coherence-whole-ui-20261103/selector-${Date.now()}`
);
const external = process.env.WE3D_VERIFY_BASE_URL;
const server = external
  ? null
  : await startStaticServer({
      rootDir: path.resolve(process.env.WE3D_VERIFY_ROOT || root),
      ports: [4398, 4399],
    });
const base = external || `http://127.0.0.1:${server.port}`;
const selected = new Set(
  String(process.env.WE3D_HUB_LAYOUT_CASES || '')
    .split(',')
    .filter(Boolean)
);
const coarse = process.env.WE3D_HUB_LAYOUT_COARSE === '1';
let qa;
const report = {
  scope:
    'Actual pre-game selector only: original settings, scrolling, focus, navigation and invitation. No world load, gameplay replay, email submission or hardware keyboard claim.',
  pointer: coarse ? 'browser-emulated-coarse' : 'fine',
  selected: [...selected],
  cases: [],
};
console.log('Selector layout evidence: ' + output);
try {
  qa = await createFieldworkQaSession({
    rootDir: root,
    output,
    careerId: 'companions',
    maximumDurationMs: 4 * 60 * 1000,
    pageOptions: coarse ? { hasTouch: true } : {},
  });
  const { page } = qa;
  await page.goto(`${base}/app/?diagnostics=1`);
  await page.locator('#globeSelectorStartBtn').waitFor({ state: 'visible' });
  const box = (selector) => page.locator(selector).boundingBox();
  const overlap = (a, b) =>
    a &&
    b &&
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5;
  async function exposed(selector, viewport) {
    const bounds = await box(selector),
      rail = await box('.globe-app-rail');
    assert.ok(
      bounds && bounds.width >= 44 && bounds.height >= 44,
      selector + ' has a usable target'
    );
    assert.ok(
      bounds.x >= -0.5 &&
        bounds.y >= -0.5 &&
        bounds.x + bounds.width <= viewport.width + 0.5 &&
        bounds.y + bounds.height <= viewport.height + 0.5,
      selector + ' stays in view'
    );
    assert.equal(overlap(bounds, rail), false, selector + ' clears navigation');
    const hit = await page.locator(selector).evaluate((e) => {
      const r = e.getBoundingClientRect();
      return [
        [0.5, 0.5],
        [0.15, 0.2],
        [0.85, 0.8],
      ].every(([x, y]) =>
        e.contains(document.elementFromPoint(r.x + r.width * x, r.y + r.height * y))
      );
    });
    assert.ok(hit, selector + ' is not covered by another panel');
    return bounds;
  }
  async function scale(value) {
    await page.getByRole('button', { name: 'Open settings', exact: true }).click();
    await page.locator('#accessibilityTextScale').selectOption(value);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.we3dTextScale), value);
  }
  const viewports = [
    { name: 'desktop', width: 1440, height: 960 },
    { name: 'portrait', width: 390, height: 844 },
    { name: 'short-landscape', width: 844, height: 390 },
  ];
  const fonts = new Map();
  for (const text of ['100', '200'])
    for (const viewport of viewports) {
      const name = `${viewport.name}-${text}`;
      if (selected.size && !selected.has(name)) continue;
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      if (text === '200' && !fonts.has(viewport.name)) {
        await scale('100');
        fonts.set(
          viewport.name,
          await page
            .locator('#coralResearchStart')
            .evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
        );
      }
      await scale(text);
      await page.evaluate(() => {
        for (const s of document.querySelectorAll('.globe-selector-shell,.globe-selector-side'))
          s.scrollTo(0, 0);
      });
      await page.waitForTimeout(100);
      const primary = await exposed('#globeSelectorStartBtn', viewport);
      const invitation = await box('#testerInvitation');
      assert.equal(overlap(primary, invitation), false, 'invitation never covers launch');
      await page.locator('#coralResearchStart').scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      const coastal = await exposed('#coralResearchStart', viewport);
      const font = await page
        .locator('#coralResearchStart')
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      if (text === '100') fonts.set(viewport.name, font);
      else
        assert.ok(
          font >= fonts.get(viewport.name) * 1.95,
          'the real text preference enlarges type'
        );
      report.cases.push({ name, primary, coastal, font });
      await page.screenshot({ path: path.join(output, name + '.png') });
    }
  if (!selected.size || selected.has('form')) {
    await page.setViewportSize({ width: 390, height: 500 });
    await page.locator('#testerInvitationOpen').click();
    assert.equal(
      await page.locator('#testerInvitationAddress').evaluate((e) => e === document.activeElement),
      true
    );
    await page.locator('#testerInvitationAddress').scrollIntoViewIfNeeded();
    await exposed('#testerInvitationAddress', { width: 390, height: 500 });
    await page.locator('#testerInvitationClose').click();
    assert.equal(await page.locator('#testerInvitation').isVisible(), false);
    assert.equal(
      await page.locator('#globeSelectorStartBtn').evaluate((e) => e === document.activeElement),
      true
    );
    await exposed('#globeSelectorStartBtn', { width: 390, height: 500 });
    report.cases.push({
      name: 'invitation-form-reduced-viewport-dismiss-focus',
      emailSubmitted: false,
    });
  }
  assert.deepEqual(qa.report.errors, []);
  report.ok = true;
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, output, cases: report.cases.map((row) => row.name) }));
} catch (error) {
  report.ok = false;
  report.failure = error.stack;
  await fs.mkdir(output, { recursive: true });
  report.layout = await qa?.page
    .evaluate(() =>
      Object.fromEntries(
        [
          '.globe-selector-shell',
          '.globe-selector-side',
          '.globe-app-rail',
          '#globeSelectorStartBtn',
          '#coralResearchStart',
          '#testerInvitation',
        ].map((selector) => {
          const e = document.querySelector(selector),
            r = e?.getBoundingClientRect(),
            s = e && getComputedStyle(e);
          return [
            selector,
            e
              ? {
                  rect: { x: r.x, y: r.y, width: r.width, height: r.height },
                  display: s.display,
                  position: s.position,
                  rows: s.gridTemplateRows,
                  scrollTop: e.scrollTop,
                }
              : null,
          ];
        })
      )
    )
    .catch(() => null);
  await qa?.page.screenshot({ path: path.join(output, 'failed.png') }).catch(() => {});
  await fs.writeFile(path.join(output, 'failed.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally {
  await qa?.close();
  await server?.close();
}
