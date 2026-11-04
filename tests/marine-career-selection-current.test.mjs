import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarineCareerSelection } from '../app/js/campaign/marine-career-selection.js';
test('a superseded asynchronous marine entry cannot activate beside the selected career', async () => {
  let release,
    selected = null;
  const calls = [];
  const domain = (id) => ({
    pause() {
      if (selected === id) selected = null;
      calls.push(['pause', id]);
    },
    async choose(variant, { isCurrent }) {
      if (id === 'oceanography') await new Promise((r) => (release = r));
      if (!isCurrent()) return false;
      selected = id;
      calls.push(['choose', id, variant]);
      return true;
    },
    snapshot: () => ({ id }),
  });
  const selection = createMarineCareerSelection({
    oceanography: domain('oceanography'),
    biology: domain('biology'),
  });
  const pending = selection.choose('oceanography', 'campaign');
  await selection.choose('biology', 'campaign');
  release();
  assert.equal(await pending, false);
  assert.equal(selected, 'biology');
  assert.equal(selection.selected, 'biology');
  assert.deepEqual(selection.snapshot(), { id: 'biology' });
  selection.pause();
  assert.equal(selected, null);
  assert.equal(selection.snapshot(), null);
  assert.equal(calls.filter((c) => c[0] === 'choose').length, 1);
});
test('cancelled admission never pauses the current study or reads another domain', async () => {
  let paused = 0;
  const career = {
    pause() {
      paused++;
    },
    choose() {
      throw Error('must not choose');
    },
    snapshot() {
      return {};
    },
  };
  const selection = createMarineCareerSelection({ biology: career });
  assert.equal(await selection.choose('biology', 'campaign', { isCurrent: () => false }), false);
  assert.equal(paused, 0);
  await assert.rejects(() => selection.choose('unknown', 'campaign'), /available/);
});
