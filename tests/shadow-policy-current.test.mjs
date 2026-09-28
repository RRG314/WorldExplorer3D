import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { applyDirectionalShadowPolicy } from '../app/js/engine/shadow-policy.js';

import {
  computeDirectionalShadowPlacement,
  updateStableDirectionalShadow
} from '../app/js/engine/shadow-policy.js';

test('directional shadow anchors remain fixed during ordinary camera movement', () => {
  const direction = { x: .52, y: .82, z: .22 };
  const start = computeDirectionalShadowPlacement(direction, { x: 100, y: 8, z: -40 }, {
    radiusWorldUnits: 150,
    resolution: 1024
  });
  const nearby = computeDirectionalShadowPlacement(direction, { x: 101, y: 8.15, z: -39.4 }, {
    radiusWorldUnits: 150,
    resolution: 1024
  });
  assert.equal(start.signature, nearby.signature);
  assert.equal(start.anchorStep, 9.375);
});

test('directional shadow anchors move in exact shadow-texel groups', () => {
  const direction = { x: .52, y: .82, z: .22 };
  const start = computeDirectionalShadowPlacement(direction, { x: 0, y: 6, z: 0 }, {
    radiusWorldUnits: 150,
    resolution: 1024
  });
  const moved = computeDirectionalShadowPlacement(direction, { x: 30, y: 6, z: 0 }, {
    radiusWorldUnits: 150,
    resolution: 1024
  });
  assert.notEqual(start.signature, moved.signature);
  assert.equal(start.anchorStep / start.texelWorldSize, 32);
  assert.equal(moved.anchorStep / moved.texelWorldSize, 32);
});

test('tiny astronomical direction changes do not churn the runtime shadow map', () => {
  const assigned = [];
  const appCtx = {
    renderer: { shadowMap: { needsUpdate: false } },
    sun: {
      position: { set: (...values) => assigned.push(['sun', ...values]) },
      target: {
        position: { set: (...values) => assigned.push(['target', ...values]) },
        updateMatrixWorld() {}
      },
      userData: {
        shadowPolicy: {
          radiusWorldUnits: 150,
          refreshIntervalMs: 84,
          resolution: 2048
        }
      }
    }
  };
  const observer = { x: 80, y: 10, z: -120 };
  assert.equal(updateStableDirectionalShadow(appCtx, { x: .52, y: .82, z: .22 }, observer, { nowMs: 100 }), true);
  appCtx.renderer.shadowMap.needsUpdate = false;
  assert.equal(updateStableDirectionalShadow(appCtx, { x: .5201, y: .8199, z: .2201 }, observer, { nowMs: 110 }), false);
  assert.equal(appCtx.renderer.shadowMap.needsUpdate, false);
  assert.equal(assigned.length, 2);
});

 test('shadow quality changes retire mismatched GPU targets and preserve matching targets', () => {
  globalThis.THREE = THREE;
  try {
    const sun = new THREE.DirectionalLight();
    const appCtx = {sun, renderer:{shadowMap:{}}};
    const target = new THREE.WebGLRenderTarget(2048,2048);
    let disposed = 0; target.addEventListener('dispose',()=>disposed++);
    sun.shadow.map = target;
    applyDirectionalShadowPolicy(appCtx,{quality:'high',gpuTier:'high'});
    assert.equal(sun.shadow.map,target); assert.equal(disposed,0);
    applyDirectionalShadowPolicy(appCtx,{quality:'med',gpuTier:'high'});
    assert.equal(sun.shadow.map,null); assert.equal(disposed,1);
    assert.equal(sun.shadow.mapSize.x,1024);
    const smaller = new THREE.WebGLRenderTarget(1024,1024);
    smaller.addEventListener('dispose',()=>disposed++); sun.shadow.map=smaller;
    applyDirectionalShadowPolicy(appCtx,{quality:'low',gpuTier:'high'});
    assert.equal(sun.shadow.map,null); assert.equal(disposed,2);
    assert.equal(appCtx.renderer.shadowMap.enabled,false);
  } finally { delete globalThis.THREE; }
});
