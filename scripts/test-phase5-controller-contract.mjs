import assert from 'node:assert/strict';
import { ctx } from '../app/js/shared-context.js?v=55';
import {
  clearControlInputState,
  readControlActions
} from '../app/js/controls/action-input.js';

ctx.keys = {};
ctx.keys.ArrowUp = true;
ctx.keys.ArrowRight = true;
let actions = readControlActions('drive');
assert.equal(actions.throttle, 1);
assert.equal(actions.reverse, 0);
assert.equal(actions.steer, -1);

ctx.keys.ArrowUp = false;
ctx.keys.ArrowDown = true;
actions = readControlActions('drive');
assert.equal(actions.throttle, 0);
assert.equal(actions.reverse, 1);
assert.equal(actions.steer, -1);

clearControlInputState('controller-contract');
actions = readControlActions('drive');
assert.equal(actions.throttle, 0);
assert.equal(actions.reverse, 0);
assert.equal(actions.steer, 0);
assert.equal(actions.brake, 0);

ctx.keys.ArrowUp = true;
ctx.keys.Space = true;
clearControlInputState('focus-lost');
actions = readControlActions('drone');
assert.equal(actions.move, 0);
assert.equal(actions.vertical, 0);

console.log(JSON.stringify({
  ok: true,
  contract: 'phase5-controller-input',
  staleKeyboardStateCleared: true,
  forwardReverseChannelsIndependent: true
}, null, 2));
