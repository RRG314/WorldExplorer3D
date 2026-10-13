import assert from 'node:assert/strict';

// Read the displayed route, then operate only real mouse/keyboard controls.
// Unlike research-station-walk, this never advances controller time, changes
// pose, or replaces the input reader. Suitable for ordinary hosted captures.
export async function walkResearchStationWithInput(page, id, { context = 'marineCtx' } = {}) {
  await page.getByLabel('Deck destination').selectOption(id);
  await page.waitForFunction(({ context, id }) => {
    const deck = globalThis[context]?.boatDeck?.snapshot();
    return deck?.targetId === id && deck.route?.length > 1 && deck.route.at(-1)?.id === id;
  }, { context, id });
  const route = await page.evaluate(context => globalThis[context].boatDeck.snapshot().route, context);
  for (const target of route.slice(1)) {
    const deadline = Date.now() + 12000;
    let reached = false;
    while (Date.now() < deadline) {
      const pose = await page.evaluate(context => globalThis[context].boatDeck.snapshot().pose, context);
      const distance = Math.hypot(target.x - pose.x, target.z - pose.z);
      if (distance < .24) { reached = true; break; }
      const heading = Math.atan2(target.x - pose.x, target.z - pose.z);
      let turn = Math.atan2(Math.sin(heading - pose.yaw), Math.cos(heading - pose.yaw));
      while (Math.abs(turn) > .008) {
        const step = Math.max(-1, Math.min(1, turn));
        const viewport = page.viewportSize();
        const x = viewport.width / 2, y = viewport.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x - step / .005, y, { steps: 4 });
        await page.mouse.up();
        turn -= step;
      }
      await page.keyboard.down('KeyW');
      try {
        // Short input bursts keep corners and door thresholds under control.
        await page.waitForTimeout(Math.max(35, Math.min(250, distance * 160)));
      } finally { await page.keyboard.up('KeyW'); }
    }
    assert.ok(reached, `Normal input did not reach ${id} route point (${target.x}, ${target.z})`);
  }
  const distance = await page.evaluate(({ context, id }) => globalThis[context].boatDeck.stationDistance(id), { context, id });
  assert.ok(distance < .6, `Normal input ended ${distance} units from ${id}`);
  return { id, routePoints: route.length, distance };
}
