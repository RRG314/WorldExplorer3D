import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveBoatCameraFraming } from '../app/js/hud/boat-camera.js';

test('large ships use a bounded navigation camera in harbors and channels', () => {
  const channel = resolveBoatCameraFraming({
    waterKind: 'channel', classLength: 290, classHeight: 34,
    speedNorm: 1, waveIntensity: .4
  });
  const ocean = resolveBoatCameraFraming({
    waterKind: 'open_ocean', classLength: 290, classHeight: 34,
    speedNorm: 1, waveIntensity: .4
  });
  assert.ok(channel.chaseDistance > channel.classLength * .5 + 4);
  assert.ok(channel.chaseDistance < ocean.chaseDistance);
  assert.ok(channel.lookAhead > channel.classLength * .5 + 15);
  assert.ok(channel.chaseHeight >= channel.classHeight * .8);
});

test('small boats retain a close readable chase view in a harbor', () => {
  const framing = resolveBoatCameraFraming({
    waterKind: 'harbor', classLength: 7, classHeight: 2,
    speedNorm: .5, waveIntensity: .3
  });
  assert.ok(framing.chaseDistance >= 9 && framing.chaseDistance < 12);
  assert.ok(framing.lookAhead >= 10 && framing.lookAhead < 14);
});
