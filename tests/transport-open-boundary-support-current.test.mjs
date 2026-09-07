import test from 'node:test';
import assert from 'node:assert/strict';

import { compileTransportStructureAssemblies } from '../app/js/world/compiler/transport-structure-assembly.js';

test('generalized bridge open boundaries publish seabed terminal supports', () => {
  const feature = {
    sourceFeatureId: 'current:test:water-open-boundary',
    name: 'Mapped bridge',
    type: 'motorway',
    width: 10,
    driveable: true,
    pts: [
      { x: 0, z: 0 },
      { x: 0, z: 20 }
    ],
    transportRecord: {
      completeness: 'generalized',
      routeState: 'complete',
      safeForDriving: true
    },
    structureSemantics: {
      terrainMode: 'elevated',
      gradeSeparated: true,
      isBridge: true,
      featureCategory: 'road'
    },
    transportSurfaceModel: {
      distances: new Float32Array([0, 20]),
      centerHeights: new Float32Array([12, 12])
    },
    transportStructureRef: {
      featureId: 'current:test:water-open-boundary',
      start: { state: 'open_boundary', policy: 'transition_to_ground' },
      end: { state: 'open_boundary', policy: 'transition_to_ground' },
      specification: { deckThickness: 0.8 }
    },
    connectedFeatures: { start: [], end: [] },
    transportGraphRef: { totalDistance: 20, stations: [] }
  };

  compileTransportStructureAssemblies([feature], () => 0, {
    pointInMappedWater: () => true,
    supportConflict: () => false,
    supportSpanConflict: () => false
  });
  const assembly = feature.transportStructureAssembly;

  assert.equal(assembly.authority, 'compiled_transport_structure_assembly');
  assert.deepEqual(
    assembly.terminalSupports.map((support) => support.terminalFor).sort(),
    ['end', 'start']
  );
  assert.ok(assembly.terminalSupports.every((support) =>
    support.columns.length > 0 && support.columns.every((column) => column.height > 0)
  ));
});

test('terminal supports move beyond parallel road corridors', () => {
  const feature = {
    sourceFeatureId: 'current:test:parallel-road-open-boundary',
    width: 10,
    driveable: true,
    pts: [{ x: 0, z: 0 }, { x: 0, z: 20 }],
    transportRecord: {
      completeness: 'generalized',
      routeState: 'complete',
      safeForDriving: true
    },
    structureSemantics: {
      terrainMode: 'elevated',
      gradeSeparated: true,
      isBridge: true,
      featureCategory: 'road'
    },
    transportSurfaceModel: {
      distances: new Float32Array([0, 20]),
      centerHeights: new Float32Array([12, 12])
    },
    transportStructureRef: {
      featureId: 'current:test:parallel-road-open-boundary',
      start: { state: 'open_boundary', policy: 'transition_to_ground' },
      end: { state: 'open_boundary', policy: 'transition_to_ground' },
      specification: { deckThickness: 0.8 }
    },
    connectedFeatures: { start: [], end: [] },
    transportGraphRef: { totalDistance: 20, stations: [] }
  };

  compileTransportStructureAssemblies([feature], () => 0, {
    pointInMappedWater: () => false,
    supportConflict: (_feature, column) => Math.abs(column.x) < 16,
    supportSpanConflict: () => true
  });

  assert.deepEqual(
    feature.transportStructureAssembly.terminalSupports
      .map((support) => support.terminalFor).sort(),
    ['end', 'start']
  );
  assert.ok(feature.transportStructureAssembly.terminalSupports.every((support) =>
    support.columns.every((column) => Math.abs(column.x) >= 16)
  ));
});

test('shallow clipped bridge ends use the tapered local deck thickness', () => {
  const feature = {
    sourceFeatureId: 'current:test:shallow-open-boundary',
    width: 8,
    driveable: true,
    pts: [{ x: 0, z: 0 }, { x: 0, z: 8 }],
    transportRecord: { completeness: 'generalized', routeState: 'complete', safeForDriving: true },
    structureSemantics: {
      terrainMode: 'elevated',
      gradeSeparated: true,
      isBridge: true,
      featureCategory: 'road'
    },
    transportSurfaceModel: {
      distances: new Float32Array([0, 8]),
      centerHeights: new Float32Array([1.3, 1.3])
    },
    transportStructureRef: {
      featureId: 'current:test:shallow-open-boundary',
      start: { state: 'open_boundary', policy: 'transition_to_ground' },
      end: { state: 'open_boundary', policy: 'transition_to_ground' },
      specification: { deckThickness: 1.2 }
    },
    connectedFeatures: { start: [], end: [] },
    transportGraphRef: { totalDistance: 8, stations: [] }
  };

  compileTransportStructureAssemblies([feature], () => 0, {
    pointInMappedWater: () => false,
    supportConflict: () => false,
    supportSpanConflict: () => true
  });

  assert.deepEqual(
    feature.transportStructureAssembly.terminalSupports
      .map((support) => support.terminalFor).sort(),
    ['end', 'start']
  );
  assert.ok(feature.transportStructureAssembly.terminalSupports.every((support) =>
    support.columns.every((column) => column.height > 0.18)
  ));
});

test('terminal portal columns search beyond dense parallel corridors', () => {
  const feature = {
    sourceFeatureId: 'current:test:dense-corridor-open-boundary',
    width: 10,
    driveable: true,
    pts: [{ x: 0, z: 0 }, { x: 0, z: 20 }],
    transportRecord: { completeness: 'generalized', routeState: 'complete', safeForDriving: true },
    structureSemantics: {
      terrainMode: 'elevated',
      gradeSeparated: true,
      isBridge: true,
      featureCategory: 'road'
    },
    transportSurfaceModel: {
      distances: new Float32Array([0, 20]),
      centerHeights: new Float32Array([12, 12])
    },
    transportStructureRef: {
      featureId: 'current:test:dense-corridor-open-boundary',
      start: { state: 'open_boundary', policy: 'transition_to_ground' },
      end: { state: 'open_boundary', policy: 'transition_to_ground' },
      specification: { deckThickness: 0.8 }
    },
    connectedFeatures: { start: [], end: [] },
    transportGraphRef: { totalDistance: 20, stations: [] }
  };

  compileTransportStructureAssemblies([feature], () => 0, {
    pointInMappedWater: () => false,
    supportConflict: (_feature, column) => Math.abs(column.x) < 48,
    supportSpanConflict: () => true
  });

  assert.deepEqual(
    feature.transportStructureAssembly.terminalSupports
      .map((support) => support.terminalFor).sort(),
    ['end', 'start']
  );
  assert.ok(feature.transportStructureAssembly.terminalSupports.every((support) =>
    support.columns.every((column) => Math.abs(column.x) >= 48)
  ));
});
