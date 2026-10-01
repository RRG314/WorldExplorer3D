import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSandboxPath, resultMatchesSandboxPath} from '../app/js/tutorial/sandbox-paths.js';
test('chosen intentions accept only earned matching work', () => {
  assert.equal(normalizeSandboxPath('toString'), '');
  assert.equal(normalizeSandboxPath('build'), 'build');
  assert.equal(resultMatchesSandboxPath('build', {eventType:'discovery-recorded'}), false);
  assert.equal(resultMatchesSandboxPath('build', {eventType:'building-milestone'}), true);
  assert.equal(resultMatchesSandboxPath('together', {eventType:'room-joined', shared:true}), false);
  assert.equal(resultMatchesSandboxPath('together', {eventType:'building-milestone', shared:false}), false);
  assert.equal(resultMatchesSandboxPath('together', {eventType:'building-milestone', shared:true}), true);
  assert.equal(resultMatchesSandboxPath('together', {eventType:'activity-completed', shared:true}), true);
  assert.equal(resultMatchesSandboxPath('explore', {eventType:'activity-completed'}), true);
});
