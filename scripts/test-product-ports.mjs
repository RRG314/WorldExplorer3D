import assert from 'node:assert/strict';
import {
  PRODUCT_PORT_METHODS,
  createProductPorts
} from '../app/js/runtime/product-ports.js';

const ports = createProductPorts();
assert.deepEqual(Object.keys(PRODUCT_PORT_METHODS), [
  'shell',
  'input',
  'persistence',
  'multiplayer'
]);
assert.throws(
  () => ports.bind('input', { update() {} }),
  /missing: snapshot/
);
assert.throws(
  () => ports.call('unknown', 'update'),
  /Unknown product port/
);
assert.throws(
  () => ports.call('input', 'capture'),
  /Unknown product port method/
);
assert.equal(ports.tryCall('input', 'update'), undefined);

let updates = 0;
const unbindInput = ports.bind('input', {
  update() {
    updates++;
    return true;
  },
  snapshot() {
    return { device: 'test' };
  }
});
assert.equal(ports.call('input', 'update'), true);
assert.deepEqual(ports.call('input', 'snapshot'), { device: 'test' });
assert.equal(updates, 1);

const snapshot = ports.snapshot();
const input = snapshot.ports.find((port) => port.name === 'input');
assert.equal(input.bound, true);
assert.equal(input.calls, 2);
assert.equal(input.misses, 1);
assert.deepEqual(input.methods, ['snapshot', 'update']);
assert.equal(unbindInput(), true);
assert.equal(unbindInput(), false);
assert.throws(
  () => ports.call('input', 'update'),
  /is unavailable/
);

console.log(JSON.stringify({
  ok: true,
  ports: ports.snapshot().ports
}, null, 2));
