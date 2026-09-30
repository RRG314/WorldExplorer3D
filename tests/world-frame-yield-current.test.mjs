import test from 'node:test';
import assert from 'node:assert/strict';
import {yieldToWorldFrame} from '../app/js/world/cooperative-scheduling.js';

function clock(hidden = false) {
  let next = 0;
  const timers = new Map(), frames = new Map();
  return {timers, frames, document: {hidden},
    setTimeout(fn, delay) { const id = ++next; timers.set(id, {fn, delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id = ++next; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); }
  };
}

test('refinement yields past the next frame, with no lingering deadline', async () => {
  const host = clock(); let completed = false;
  const pending = yieldToWorldFrame(host).then(() => { completed = true; });
  const [id, callback] = host.frames.entries().next().value;
  host.frames.delete(id); callback();
  await Promise.resolve(); assert.equal(completed, false);
  [...host.timers.values()].find(timer => timer.delay === 0).fn();
  await pending;
  assert.equal(completed, true); assert.equal(host.timers.size, 0);
});

test('a suspended frame cannot leave world cleanup waiting indefinitely', async () => {
  const host = clock(); const pending = yieldToWorldFrame(host);
  [...host.timers.values()].find(timer => timer.delay === 100).fn();
  await pending;
  assert.equal(host.frames.size, 0); assert.equal(host.timers.size, 0);
});

test('hidden tabs use a bounded timer without requesting a frame', async () => {
  const host = clock(true); const pending = yieldToWorldFrame(host);
  assert.equal(host.frames.size, 0);
  const timer = [...host.timers.values()][0]; assert.equal(timer.delay, 16);
  timer.fn(); await pending;
});

test('concurrent producers resume fairly across separate rendered frames',async()=>{
 const host=clock(),completed=[];
 const pending=['roads','vegetation','overview'].map(name=>yieldToWorldFrame(host).then(()=>completed.push(name)));
 for(const name of ['roads','vegetation','overview']){
  assert.equal(host.frames.size,1);
  const [id,callback]=host.frames.entries().next().value;host.frames.delete(id);callback();
  [...host.timers.values()].find(timer=>timer.delay===0).fn();
  await Promise.resolve();await Promise.resolve();
  assert.equal(completed.at(-1),name);
 }
 await Promise.all(pending);assert.deepEqual(completed,['roads','vegetation','overview']);
 assert.equal(host.frames.size,0);assert.equal(host.timers.size,0);
});
