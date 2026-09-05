import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyPendingPublishedTransportSurfaceControls,
  compileSharedTransportSurfacePresentations
} from '../app/js/world/transport-surface-controls.js';

test('landmark controls bind after canonical roads become available', () => {
  const control = {
    id: 'current:late-bridge-control',
    physicalSurfaceKind: 'bridge_deck',
    match: {
      mappedName: 'Golden Gate Bridge',
      sourceFeatureIds: ['osm:way:northbound', 'osm:way:southbound'],
      terrainMode: 'elevated',
      maximumDistanceFromReferencePathMeters: 45
    },
    horizontal: {
      kind: 'shared_directional_carriageway_surface',
      widthMeters: 19,
      lanes: 6,
      requiredDirectionalMembers: 2,
      measurementStatus: 'published_reference',
      sourceLabel: 'Fixture authority',
      sourceUrl: 'https://example.test/bridge-width'
    },
    vertical: {
      kind: 'minimum_clearance_above_mapped_water',
      clearanceMeters: 67,
      referenceDatum: 'published_fixture_datum',
      measurementStatus: 'published_reference',
      sourceLabel: 'Fixture authority',
      sourceUrl: 'https://example.test/bridge-clearance'
    }
  };
  const referencePath = [{ x: 0, z: 0 }, { x: 0, z: 100 }];
  let callbackPublication = null;
  const requests = [{
    controls: [control],
    referencePath,
    onApplied(publication) { callbackPublication = publication; }
  }];
  const roads = [
    {
      sourceFeatureId: 'osm:way:northbound',
      name: 'Golden Gate Bridge',
      pts: [{ x: -4, z: 0 }, { x: -4, z: 100 }],
      structureSemantics: { terrainMode: 'elevated' },
      transportRecord: { completeness: 'lossless' },
      baseY: 67
    },
    {
      sourceFeatureId: 'osm:way:southbound',
      name: 'Golden Gate Bridge',
      pts: [{ x: 4, z: 100 }, { x: 4, z: 0 }],
      structureSemantics: { terrainMode: 'elevated' },
      transportRecord: { completeness: 'lossless' },
      baseY: 67
    },
    {
      sourceFeatureId: 'osm:way:approach-fragment',
      name: 'Golden Gate Bridge',
      pts: [{ x: 0, z: 95 }, { x: 0, z: 100 }],
      structureSemantics: { terrainMode: 'elevated' },
      transportRecord: { completeness: 'lossless' },
      baseY: 67
    }
  ];

  const application = applyPendingPublishedTransportSurfaceControls(requests, roads);
  const compilation = compileSharedTransportSurfacePresentations(roads, (road) => road.baseY);

  assert.equal(application.requests, 1);
  assert.equal(application.appliedRoads, 2);
  assert.equal(callbackPublication.appliedRoads, 2);
  assert.equal(compilation.groups, 1);
  assert.equal(compilation.memberRoads, 2);
  assert.equal(roads[0].transportSurfacePresentation, roads[1].transportSurfacePresentation);
  assert.equal(roads[2].transportSurfacePresentation, undefined);
  assert.equal(roads[0].transportSurfacePresentation.physicalSurfaceKind, 'bridge_deck');
});
