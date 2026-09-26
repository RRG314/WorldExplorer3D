import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPerformanceHost, requirePerformanceHost, requireHardwareGraphics } from '../scripts/verification/performance-host.mjs';

const physical = { platform: 'darwin', architecture: 'arm64', model: 'Macmini9,1', cpu: 'Apple M1', memoryBytes: 8 * 1024 ** 3, ci: false };

test('performance authority accepts the declared host without claiming measured performance', () => {
  assert.equal(requirePerformanceHost(physical).ok, true);
  assert.match(assessPerformanceHost(physical).evidenceScope, /not a performance measurement/);
  requireHardwareGraphics('ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)');
});

test('performance authority rejects CI and every mismatched hardware dimension', () => {
  for (const change of [{ ci: true }, { platform: 'linux' }, { architecture: 'x64' },
    { model: 'VirtualMac2,1' }, { cpu: 'Apple M2' }, { memoryBytes: 16 * 1024 ** 3 }]) {
    assert.throws(() => requirePerformanceHost({ ...physical, ...change }), /declared physical/);
  }
});

test('performance authority rejects software, unknown and mismatched renderers', () => {
  for (const renderer of [undefined, '', 'SwiftShader Device', 'Apple M1 software', 'Apple M2', 'llvmpipe']) {
    assert.throws(() => requireHardwareGraphics(renderer), /hardware renderer/);
  }
});
