import assert from 'node:assert/strict';

// Exercise the real occupied-world panel after a field result is revealed.
// Repeated unchanged renders must preserve its DOM; a changed result must still
// update immediately. This is functional regression evidence, not a timing run.
export async function verifyDiscoveryDomStability(page) {
  const result = await page.evaluate(() => {
    const state = globalThis.__sandboxTestContext.worldDiscoveryRuntime;
    const panel = document.getElementById('discoveryPanel');
    const message = document.getElementById('discoveryMessage');
    const { actions, lastSnapshot: snapshot, activeActivityId: activity } = state;
    state.ui.render(actions, snapshot, activity);
    const observer = new MutationObserver(() => {});
    observer.observe(panel, { childList: true, subtree: true, characterData: true });
    const link = document.querySelector('#discoveryInspection a');
    if (link) link.focus();
    const before = message.textContent;
    let unchangedMutations, focusedLinkPreserved, changedMessage, restoredMessage;
    try {
      for (let index = 0; index < 120; index++) state.ui.render(actions, snapshot, activity);
      unchangedMutations = observer.takeRecords().length;
      focusedLinkPreserved = !link || document.activeElement === link;
      const next = 'A different live field message';
      state.ui.render(actions, { ...snapshot, error: '', message: next }, activity);
      changedMessage = message.textContent === next;
    } finally {
      observer.disconnect();
      state.ui.render(actions, snapshot, activity);
      restoredMessage = message.textContent === before;
    }
    return { unchangedMutations, focusedLinkPreserved, changedMessage, restoredMessage };
  });
  assert.equal(result.unchangedMutations, 0, 'Unchanged field frames replace live panel nodes');
  assert.equal(result.focusedLinkPreserved, true, 'Field rendering steals reference-link focus');
  assert.equal(result.changedMessage, true, 'A changed field message must render immediately');
  assert.equal(result.restoredMessage, true, 'The actual field result must remain intact');
  return result;
}
