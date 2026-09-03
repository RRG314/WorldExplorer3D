import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurfaceQuery } from '../app/js/world/surface-contract.js';

function groundHeightAt(y = 4) {
  return {
    terrainY: () => y,
    walkSurfaceInfo: () => ({ y, source: 'terrain', feature: null, pt: null, dist: null }),
    driveSurfaceInfo: () => ({ y, source: 'terrain', road: null, roadPt: null, roadDist: null }),
    _computeNormal: () => ({ x: 0, y: 1, z: 0 })
  };
}

test('published exact runway surface is shared by walking and driving only inside its footprint', () => {
  const appCtx = {
    METERS_PER_WORLD_UNIT: 1,
    transportFacilityVisual: {
      airportLayout: { authority: 'exact-openstreetmap' },
      surfaceYAt: (x, z) => Math.abs(x) <= 20 && z >= 0 && z <= 100 ? 7.25 : null
    }
  };
  const query = createSurfaceQuery(appCtx, groundHeightAt(4));

  const runwayWalk = query.walkAt(0, 50);
  const runwayDrive = query.driveAt(0, 50);
  assert.equal(runwayWalk.position.y, 7.25);
  assert.equal(runwayDrive.position.y, 7.25);
  assert.equal(runwayWalk.kind, 'road');
  assert.equal(runwayDrive.kind, 'road');
  assert.equal(runwayWalk.provenance.source, 'exact_osm_airport_surface');
  assert.equal(runwayDrive.provenance.source, 'exact_osm_airport_surface');

  const outsideWalk = query.walkAt(40, 50);
  const outsideDrive = query.driveAt(40, 50);
  assert.equal(outsideWalk.position.y, 4);
  assert.equal(outsideDrive.position.y, 4);
  assert.equal(outsideWalk.kind, 'terrain');
  assert.equal(outsideDrive.kind, 'terrain');
});

test('a higher existing traversal surface is not replaced by airport pavement below it', () => {
  const appCtx = {
    METERS_PER_WORLD_UNIT: 1,
    transportFacilityVisual: {
      airportLayout: { authority: 'exact-openstreetmap' },
      surfaceYAt: () => 7.25
    }
  };
  const elevatedGround = {
    ...groundHeightAt(4),
    walkSurfaceInfo: () => ({
      y: 18,
      source: 'building_roof',
      feature: { id: 'roof' },
      pt: { x: 0, z: 0 },
      dist: 0
    }),
    driveSurfaceInfo: () => ({
      y: 18,
      source: 'road',
      road: { id: 'bridge' },
      roadPt: { x: 0, z: 0 },
      roadDist: 0
    })
  };
  const query = createSurfaceQuery(appCtx, elevatedGround);

  assert.equal(query.walkAt(0, 0).position.y, 18);
  assert.equal(query.driveAt(0, 0).position.y, 18);
});

test('no airport surface remains no surface below sea level', () => {
  const appCtx = {
    METERS_PER_WORLD_UNIT: 1,
    transportFacilityVisual: {
      airportLayout: null,
      surfaceYAt: () => null
    }
  };
  const query = createSurfaceQuery(appCtx, groundHeightAt(-1.4));
  const walk = query.walkAt(0, 0);
  const drive = query.driveAt(0, 0);
  assert.equal(walk.position.y, -1.4);
  assert.equal(drive.position.y, -1.4);
  assert.equal(walk.kind, 'terrain');
  assert.equal(drive.kind, 'terrain');
  assert.notEqual(walk.provenance.source, 'exact_osm_airport_surface');
  assert.notEqual(drive.provenance.source, 'exact_osm_airport_surface');
});
