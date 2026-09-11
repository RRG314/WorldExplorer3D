'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { inspectGlb } = require('../scripts/reality-capture/glb-inspection.cjs');

test('worker GLB gate accepts a current embedded runtime model', () => {
  const file = path.join(__dirname, '..', 'app', 'assets', 'models', 'vehicles', 'traffic', 'compact-hatchback-v1.glb');
  const report = inspectGlb(fs.readFileSync(file));
  assert.ok(report.bytes > 0);
  assert.ok(report.meshes > 0);
});

test('worker GLB gate rejects disguised and truncated uploads', () => {
  assert.throws(() => inspectGlb(Buffer.from('not a glb')), /invalid_glb_header/);
  const fake = Buffer.alloc(24);
  fake.write('glTF', 0, 'ascii');
  fake.writeUInt32LE(2, 4);
  fake.writeUInt32LE(999, 8);
  assert.throws(() => inspectGlb(fake), /invalid_glb_length/);
});
