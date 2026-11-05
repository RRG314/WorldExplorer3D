import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { createFieldworkQaSession } from '../verification/fieldwork-qa-session.mjs';
const output = path.resolve(
    process.env.WE3D_AUDIT_OUTPUT ||
      `output/research/career-world-20261105/onboarding-${Date.now()}`
  ),
  base =
    process.env.WE3D_AUDIT_URL || 'https://we3d-staging-20260712--trail-20261104-78mwznd9.web.app';
const started = Date.now(),
  report = {
    scope:
      'Clean disposable profile, ordinary URL and UI input only. No diagnostics, injected saves, game-context calls, pose writes, grants or time acceleration. Developer-informed automation, not an uncoached human usability study.',
    base,
    actions: [],
    observations: [],
    actionErrors: [],
  };
let qa;
const elapsed = () => Date.now() - started;
async function observe(label) {
  const page = qa.page;
  const state = await page.evaluate(() => {
    const visible = (e) => {
      if (
        !e ||
        e.hidden ||
        e.closest('[hidden]') ||
        getComputedStyle(e).display === 'none' ||
        getComputedStyle(e).visibility === 'hidden'
      )
        return false;
      const r = e.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        r.left < innerWidth &&
        r.right > 0 &&
        r.top < innerHeight &&
        r.bottom > 0
      );
    };
    const tutorial = document.getElementById('tutorialHintCard');
    return {
      title: document.title,
      url: location.href,
      focus: document.activeElement?.id || document.activeElement?.tagName,
      visibleButtons: [...document.querySelectorAll('button,[role="button"],summary')]
        .filter(visible)
        .map((e) => ({
          id: e.id,
          text: e.innerText?.trim().slice(0, 160),
          label: e.getAttribute('aria-label'),
        })),
      tutorial: tutorial
        ? {
            hidden: tutorial.hidden,
            display: getComputedStyle(tutorial).display,
            stage: tutorial.dataset.tutorialStage,
            text: tutorial.innerText,
          }
        : null,
      tutorialStored: localStorage.getItem('worldExplorer3D.tutorialState.v6'),
      panels: [...document.querySelectorAll('dialog,section[id],aside[id]')]
        .filter(visible)
        .map((e) => ({ id: e.id, text: e.innerText?.slice(0, 4000) })),
      timing: {
        navigation: performance
          .getEntriesByType('navigation')
          .map((e) => ({ domContentLoaded: e.domContentLoadedEventEnd, duration: e.duration })),
        heap: performance.memory?.usedJSHeapSize || null,
      },
    };
  });
  report.observations.push({ label, elapsedMs: elapsed(), state });
  await page.screenshot({ path: path.join(output, label + '.png') });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      label,
      elapsedMs: elapsed(),
      tutorial: state.tutorial,
      buttons: state.visibleButtons,
      panels: state.panels,
    })
  );
}
async function command(c) {
  const page = qa.page;
  report.actions.push({ elapsedMs: elapsed(), ...c });
  if (c.action === 'click') await page.locator(c.selector).click();
  else if (c.action === 'key') await page.keyboard.press(c.key);
  else if (c.action === 'hold') {
    await page.keyboard.down(c.key);
    await page.waitForTimeout(Math.min(6000, c.ms || 1000));
    await page.keyboard.up(c.key);
  } else if (c.action === 'drag') {
    await page.mouse.move(...c.from);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(...c.to, { steps: 8 });
    await page.mouse.up({ button: 'right' });
  } else if (c.action === 'reload') await page.reload();
  else if (c.action === 'wait')
    await page.locator(c.selector).waitFor({ state: c.state || 'visible', timeout: 240000 });
  else if (c.action === 'touch-hold') {
    const r = await page.locator(c.selector).boundingBox(),
      cdp = await page.context().newCDPSession(page),
      x = r.x + r.width / 2,
      y = r.y + r.height / 2;
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + (c.dy || -40) }],
      });
      await page.waitForTimeout(Math.min(6000, c.ms || 2500));
    } finally {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    }
  } else if (c.action === 'select') await page.locator(c.selector).selectOption(c.value);
  else if (c.action === 'scroll')
    await page.locator(c.selector).evaluate((e, pixels) => e.scrollBy(0, pixels), c.pixels || 300);
  else if (c.action === 'shot') {
  } else if (c.action === 'finish') return false;
  else throw Error('Unsupported normal-input audit action');
  await observe(c.label || 'action-' + report.actions.length);
  return true;
}
try {
  qa = await createFieldworkQaSession({
    rootDir: process.cwd(),
    output,
    careerId: 'explorer',
    maximumDurationMs: 20 * 60 * 1000,
    pageOptions: process.env.WE3D_AUDIT_TOUCH === '1' ? { hasTouch: true, isMobile: true } : {},
  });
  await qa.page.setViewportSize(
    process.env.WE3D_AUDIT_TOUCH === '1'
      ? { width: 390, height: 844 }
      : { width: 1280, height: 800 }
  );
  await qa.page.goto(base + '/app/');
  await qa.page.locator('#globeGuidedStartBtn').waitFor({ state: 'visible', timeout: 60000 });
  await observe('01-first-launch');
  await command({ action: 'click', selector: '#globeGuidedStartBtn', label: '02-guided-loading' });
  await qa.page.locator('#hud.show').waitFor({ state: 'visible', timeout: 240000 });
  await qa.page.locator('#loading').waitFor({ state: 'hidden', timeout: 240000 });
  await observe('03-ready');
  console.log('READY normal-input actions, one JSON line per command.');
  if (process.env.WE3D_AUDIT_ACTIONS) {
    for (const c of JSON.parse(await fs.readFile(process.env.WE3D_AUDIT_ACTIONS, 'utf8')))
      if (!(await command(c))) break;
  } else {
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        if (!(await command(JSON.parse(line)))) break;
      } catch (error) {
        report.actionErrors.push({ elapsedMs: elapsed(), error: error.stack });
        console.log(JSON.stringify({ actionError: error.message }));
        await observe('action-error-' + report.actions.length);
      }
    }
  }
  report.captureCompleted = true;
  report.ok = report.actionErrors.length === 0;
} catch (error) {
  report.ok = false;
  report.failure = error.stack;
  console.log(JSON.stringify({ failure: error.message }));
} finally {
  if (qa) {
    report.errors = qa.report.errors;
    report.providerErrors = qa.report.providerErrors;
    await qa.close();
  }
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({ closed: true, output, ok: report.ok, actions: report.actions.length })
  );
}
