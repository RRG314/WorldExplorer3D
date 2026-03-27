export const CONTINUOUS_WORLD_LOCATIONS = {
  baltimore: { id: 'baltimore', kind: 'preset', key: 'baltimore', label: 'Baltimore, Maryland' },
  newyork: { id: 'newyork', kind: 'preset', key: 'newyork', label: 'New York, New York' },
  losangeles: { id: 'losangeles', kind: 'preset', key: 'losangeles', label: 'Los Angeles, California' },
  sanfrancisco: { id: 'sanfrancisco', kind: 'preset', key: 'sanfrancisco', label: 'San Francisco, California' },
  seattle: { id: 'seattle', kind: 'preset', key: 'seattle', label: 'Seattle, Washington' },
  monaco: { id: 'monaco', kind: 'preset', key: 'monaco', label: 'Monaco' },
  miami: { id: 'miami', kind: 'preset', key: 'miami', label: 'Miami, Florida' }
};

export const CONTINUOUS_WORLD_SCENARIOS = [
  {
    id: 'long_drive_corridors',
    kind: 'drive_route',
    selector: 'long_drive',
    surfaceExpectation: 'at_grade',
    allowLinks: false,
    allowService: false,
    locationIds: ['baltimore', 'newyork', 'losangeles'],
    sampleCount: 18,
    minRoadLength: 480,
    thresholds: {
      maxRoundTripError: 0.45,
      maxMinimapCenterDrift: 42,
      maxSurfaceDeltaAbs: 2.2,
      maxTerrainDeltaBelow: -2.6,
      maxMissingActiveTerrainMeshes: 0,
      maxDuplicateTerrainMeshes: 0,
      warnMaxStaleTerrainMeshes: 12,
      warnMaxFrameMs: 150
    }
  },
  {
    id: 'urban_entry_corridors',
    kind: 'drive_route',
    selector: 'urban_entry',
    surfaceExpectation: 'at_grade',
    allowLinks: false,
    allowService: false,
    locationIds: ['baltimore', 'newyork', 'sanfrancisco'],
    sampleCount: 16,
    minRoadLength: 360,
    thresholds: {
      maxRoundTripError: 0.45,
      maxMinimapCenterDrift: 42,
      maxSurfaceDeltaAbs: 2.1,
      maxTerrainDeltaBelow: -2.8,
      maxMissingActiveTerrainMeshes: 0,
      maxDuplicateTerrainMeshes: 0,
      warnMaxStaleTerrainMeshes: 12,
      warnMaxFrameMs: 160
    }
  },
  {
    id: 'elevated_structure_routes',
    kind: 'drive_route',
    selector: 'elevated',
    surfaceExpectation: 'elevated',
    allowLinks: true,
    allowService: false,
    locationIds: ['baltimore', 'newyork', 'sanfrancisco', 'seattle'],
    sampleCount: 14,
    minRoadLength: 220,
    thresholds: {
      maxRoundTripError: 0.45,
      maxMinimapCenterDrift: 42,
      maxSurfaceDeltaAbs: 1.7,
      maxMissingActiveTerrainMeshes: 0,
      maxDuplicateTerrainMeshes: 0,
      warnMaxStaleTerrainMeshes: 12,
      warnMaxFrameMs: 170
    }
  },
  {
    id: 'tunnel_routes',
    kind: 'drive_route',
    selector: 'tunnel',
    surfaceExpectation: 'tunnel',
    allowLinks: true,
    allowService: false,
    locationIds: ['monaco', 'sanfrancisco', 'seattle', 'baltimore'],
    sampleCount: 12,
    minRoadLength: 180,
    thresholds: {
      maxRoundTripError: 0.45,
      maxMinimapCenterDrift: 42,
      maxSurfaceDeltaAbs: 1.9,
      maxMissingActiveTerrainMeshes: 0,
      maxDuplicateTerrainMeshes: 0,
      warnMaxStaleTerrainMeshes: 12,
      warnMaxFrameMs: 180
    }
  },
  {
    id: 'boat_continuity_routes',
    kind: 'boat_route',
    selector: 'water',
    surfaceExpectation: 'water',
    locationIds: ['miami', 'monaco', 'baltimore'],
    sampleCount: 12,
    minRoadLength: 0,
    thresholds: {
      maxRoundTripError: 0.65,
      maxMinimapCenterDrift: 56,
      maxMissingActiveTerrainMeshes: 0,
      maxDuplicateTerrainMeshes: 0,
      warnMaxStaleTerrainMeshes: 14,
      warnMaxFrameMs: 180
    }
  }
];
