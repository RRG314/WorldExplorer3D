import assert from 'node:assert/strict';

async function focusWorld(page) {
  if (await page.evaluate(() => ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement?.tagName))) {
    const canvas = page.locator('body > canvas:not(#minimap):visible');
    const box = await canvas.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 8, y, { steps: 2 });
    await page.mouse.move(x, y, { steps: 2 });
    await page.mouse.up();
    assert.ok(await page.evaluate(() => !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement?.tagName)), 'World input must regain focus after the ordinary canvas gesture');
  }
}

// Read the player pose, then walk with ordinary held keys. No teleportation,
// controller stepping, camera replacement, or changes to the game clock.
export async function walkVenueWithInput(page, target, { tolerance = .6, context = 'marineCtx' } = {}) {
  await focusWorld(page);
  const read = () => page.evaluate(context => {
    const w = globalThis[context].Walk.state.walker;
    return { x: w.x, z: w.z, yaw: w.yaw ?? w.angle };
  }, context);
  const deadline = Date.now() + 90000;
  let previous = Infinity, stalled = 0;
  while (Date.now() < deadline) {
    const pose = await read(), distance = Math.hypot(target.x - pose.x, target.z - pose.z);
    if (distance < tolerance) return { target, pose, distance };
    const heading = Math.atan2(target.x - pose.x, target.z - pose.z);
    const delta = Math.atan2(Math.sin(heading - pose.yaw), Math.cos(heading - pose.yaw));
    const key = Math.abs(delta) > .055 ? (delta > 0 ? 'ArrowLeft' : 'ArrowRight') : 'ArrowUp';
    const duration = key === 'ArrowUp' ? Math.min(300, Math.max(30, (distance - tolerance) * 180))
      : Math.min(350, Math.max(18, Math.abs(delta) / 2.6 * 850));
    await page.keyboard.down(key);
    try { await page.waitForTimeout(duration); } finally { await page.keyboard.up(key); }
    if (key === 'ArrowUp') {
      stalled = distance > previous - .01 ? stalled + 1 : 0;
      previous = distance;
      assert.ok(stalled < 14, `Normal walking is blocked: ${JSON.stringify({ target, pose, distance })}`);
    }
  }
  throw new Error(`Normal walking timed out: ${JSON.stringify({ target, pose: await read() })}`);
}

export async function faceVenueWithInput(page, target, context = 'marineCtx') {
  await focusWorld(page);
  for (let attempt = 0; attempt < 40; attempt++) {
    const p = await page.evaluate(context => {
      const w = globalThis[context].Walk.state.walker;
      return { x: w.x, z: w.z, yaw: w.yaw ?? w.angle };
    }, context);
    const heading = Math.atan2(target.x - p.x, target.z - p.z);
    const delta = Math.atan2(Math.sin(heading - p.yaw), Math.cos(heading - p.yaw));
    if (Math.abs(delta) < .035) return;
    const key = delta > 0 ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.down(key);
    try { await page.waitForTimeout(Math.min(350, Math.max(18, Math.abs(delta) / 2.6 * 850))); }
    finally { await page.keyboard.up(key); }
  }
  throw new Error('Could not face the exhibit using ordinary turn controls');
}
