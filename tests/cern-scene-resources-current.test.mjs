import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { CERN_SITE_REFERENCE } from '../app/js/interiors/cern-site-reference.js';
import { earthCoordinateFrame } from '../app/js/earth-core/coordinate-frame.js?v=1';
import { resolveCernInterior } from '../app/js/interiors/cern-content.js';
import { buildCernInterior } from '../app/js/interiors/cern-scene.js';
import { createInteriorRuntimeUiApi } from '../app/js/interiors/runtime-ui.js?v=4';
test('native r128 CERN architecture owns readable front/back signs, one texture disposal and actual lift prompts', () => {
  const sandbox = {};
  vm.runInNewContext(
    fs.readFileSync(new URL('../app/vendor/three/build/three.min.js', import.meta.url), 'utf8'),
    sandbox
  );
  const T = sandbox.THREE,
    previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }),
  };
  try {
    for (const site of CERN_SITE_REFERENCE) {
      const frame = earthCoordinateFrame(site.footprint[0], 100000),
        ctx = {
          geoToWorld: (lat, lon) => frame.toWorld(lat, lon),
          METERS_PER_WORLD_UNIT: 1.11,
          Walk: { CFG: { eyeHeight: 1.7 } },
        },
        pts = site.footprint.map((p) => ctx.geoToWorld(p.lat, p.lon)),
        support = {
          key: site.sourceBuildingId,
          enterable: true,
          building: {
            sourceBuildingId: site.sourceBuildingId,
            pts,
            baseY: 0,
            buildingProvenance: { valid: true },
          },
          entryAnchor: { x: (pts[0].x + pts[1].x) / 2, z: (pts[0].z + pts[1].z) / 2 },
        },
        definition = resolveCernInterior(ctx, support, { mode: 'generated', support }),
        state = buildCernInterior(T, ctx, definition),
        owners = new Map(),
        signs = [];
      state.group.traverse((o) => {
        for (const t of o.userData.ownedInteriorTextures || []) owners.set(t, 0);
        if (o.material?.map) signs.push(o);
      });
      assert.ok(owners.size >= 5);
      assert.equal(signs.length, owners.size * 2);
      for (const mesh of signs) assert.equal(mesh.material.side, T.FrontSide);
      for (const [texture] of owners)
        texture.addEventListener('dispose', () => owners.set(texture, owners.get(texture) + 1));
      if (site.id === 'cms-point-five') {
        assert.equal(state.interactions.filter((i) => i.kind === 'elevator').length, 2);
        assert.equal(state.activeLevel, 1);
      } else assert.equal(state.group.userData.cernVisit.stationMeshes.focus.quadrupoles.length, 4);
      createInteriorRuntimeUiApi().disposeObject3D(state.group);
      for (const count of owners.values()) assert.equal(count, 1);
    }
  } finally {
    globalThis.document = previous;
  }
});
