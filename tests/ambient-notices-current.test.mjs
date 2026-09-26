import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmbientNoticeDirector } from '../app/js/ui/ambient-notices.js';

test('optional invitations are exclusive, bounded and cannot burst across new lead revisions', () => {
  let time = 0;
  const notices = createAmbientNoticeDirector({ now: () => time, cooldownMs: 30000 });
  assert.equal(notices.request('tutorial', 'move', { durationMs: 8000 }), true);
  assert.equal(notices.request('discovery', '1'), false);
  time = 8001;
  assert.equal(notices.request('tutorial', 'move'), false);
  for (let i = 0; i < 20; i++) assert.equal(notices.request('discovery', String(i)), false);
  time = 38001;
  assert.equal(notices.request('discovery', '20'), true);
  assert.equal(notices.request('tutorial', 'interact'), false);
});

test('a nearby action interrupts a hint, which does not reappear when the action clears', () => {
  let time = 0;
  const notices = createAmbientNoticeDirector({ now: () => time });
  assert.equal(notices.request('discovery', 'lead'), true);
  time = 1000;
  assert.equal(notices.request('discovery', 'lead', { blocked: true }), false);
  assert.equal(notices.snapshot(), null);
  time = 50000;
  assert.equal(notices.request('discovery', 'lead'), false);
  assert.equal(notices.request('tutorial', 'move'), true);
});

test('accessibility persistent notices can be dismissed without blocking all future guidance', () => {
  let time = 0;
  const notices = createAmbientNoticeDirector({ now: () => time });
  notices.request('tutorial', 'move', { durationMs: Infinity });
  time = 60000;
  assert.equal(notices.request('discovery', 'lead'), false);
  notices.release('tutorial');
  time += 30001;
  assert.equal(notices.request('discovery', 'lead'), true);
});
