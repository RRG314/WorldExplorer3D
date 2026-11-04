import test from 'node:test';
import assert from 'node:assert/strict';
import { CERN_SITE_REFERENCE } from '../app/js/interiors/cern-site-reference.js';
import { createCernPlan } from '../app/js/interiors/cern-layout.js';
import { resolveCernInterior } from '../app/js/interiors/cern-content.js';
import { earthCoordinateFrame } from '../app/js/earth-core/coordinate-frame.js?v=1';
import {
  compileLayout,
  containsRegion,
  roomRing,
  liftShaftGeometry,
} from '../functions/interior-layout.mjs';
test('fixed CERN plans connect separate physical rooms and supported CMS landings without changing ordinary home authoring limits', () => {
  for (const site of CERN_SITE_REFERENCE) {
    const frame = earthCoordinateFrame(site.footprint[0], 100000),
      ctx = { geoToWorld: (lat, lon) => frame.toWorld(lat, lon), METERS_PER_WORLD_UNIT: 1.11 },
      pts = site.footprint.map((p) => ctx.geoToWorld(p.lat, p.lon)),
      support = {
        key: site.sourceBuildingId,
        enterable: true,
        building: {
          sourceBuildingId: site.sourceBuildingId,
          pts,
          buildingProvenance: { valid: true },
        },
        entryAnchor: { x: (pts[0].x + pts[1].x) / 2, z: (pts[0].z + pts[1].z) / 2 },
      },
      definition = resolveCernInterior(ctx, support, { mode: 'generated', support }),
      p = createCernPlan(ctx, definition),
      compiled = compileLayout(p.layout);
    assert.ok(p.layout.floors.every((f) => compiled.floors.some((s) => s.floorId === f.id)));
    if (site.id === 'cms-point-five') {
      assert.deepEqual(
        p.layout.floors.map((f) => f.elevation),
        [-100, 0]
      );
      assert.equal(p.entryLevel, 1);
      const lift = p.layout.lifts[0],
        core = liftShaftGeometry(lift);
      assert.equal(compiled.cores.length, 1);
      assert.equal(compiled.solids.filter((s) => s.coreId === lift.id).length, 4);
      for (const stop of lift.stops) {
        const f = p.layout.floors.find((f) => f.id === stop.floorId);
        assert.ok(
          containsRegion(
            roomRing(
              f,
              f.rooms.find((r) => r.id === stop.roomId)
            ),
            core.outline
          )
        );
      }
    } else assert.equal(p.layout.floors[0].rooms.length, 4);
    const rejected = { ...definition, contentAssociation: { accuracy: 'nearby-name' } };
    assert.throws(() => createCernPlan(ctx, rejected), /mapped entry/);
  }
});
