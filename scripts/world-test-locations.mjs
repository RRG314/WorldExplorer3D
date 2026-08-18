export const WORLD_TEST_LOCATIONS = [
  {
    id: 'baltimore',
    kind: 'preset',
    key: 'baltimore',
    label: 'Baltimore, Maryland',
    category: 'dense_downtown_river',
    minimumAuthoritativeBuildingParts: 20,
    minimumMappedSkylineHeight: 60,
    minimumMappedHighRises: 8
  },
  {
    id: 'hollywood',
    kind: 'preset',
    key: 'hollywood',
    label: 'Hollywood, California',
    category: 'dense_urban_hills'
  },
  {
    id: 'newyork',
    kind: 'preset',
    key: 'newyork',
    label: 'New York, New York',
    category: 'dense_downtown_coastal',
    minimumAuthoritativeBuildingParts: 100,
    minimumMappedSkylineHeight: 100,
    minimumMappedHighRises: 25
  },
  {
    id: 'miami',
    kind: 'preset',
    key: 'miami',
    label: 'Miami, Florida',
    category: 'flat_coastal_water_heavy'
  },
  {
    id: 'tokyo',
    kind: 'preset',
    key: 'tokyo',
    label: 'Tokyo, Japan',
    category: 'dense_international_city',
    minimumBuildings: 5000
  },
  {
    id: 'monaco',
    kind: 'preset',
    key: 'monaco',
    label: 'Monaco',
    category: 'coastal_water_heavy',
    minimumBuildings: 1000
  },
  {
    id: 'monaco_sainte_devote_custom',
    kind: 'custom',
    lat: 43.7364,
    lon: 7.4197,
    label: 'Sainte-Dévote tunnel approaches, Monaco',
    category: 'mountain_tunnel_elevated_interchange_custom',
    expectedStart: 'land'
  },
  {
    id: 'tokyo_shinjuku_custom',
    kind: 'custom',
    lat: 35.6896,
    lon: 139.6917,
    label: 'Shinjuku, Tokyo, Japan',
    category: 'dense_highrise_custom'
  },
  {
    id: 'sanfrancisco',
    kind: 'preset',
    key: 'sanfrancisco',
    label: 'San Francisco, California',
    category: 'mixed_terrain_coastal'
  },
  {
    id: 'nurburgring',
    kind: 'preset',
    key: 'nurburgring',
    label: 'Nurburgring, Germany',
    category: 'sparse_rural_unusual_layout'
  },
  {
    id: 'lasvegas',
    kind: 'preset',
    key: 'lasvegas',
    label: 'Las Vegas, Nevada',
    category: 'arid_dense_city'
  },
  {
    id: 'london',
    kind: 'preset',
    key: 'london',
    label: 'London, United Kingdom',
    category: 'dense_historic_river_city'
  },
  {
    id: 'paris',
    kind: 'preset',
    key: 'paris',
    label: 'Paris, France',
    category: 'dense_historic_city'
  },
  {
    id: 'dubai',
    kind: 'preset',
    key: 'dubai',
    label: 'Dubai, United Arab Emirates',
    category: 'arid_coastal_city'
  },
  {
    id: 'losangeles',
    kind: 'preset',
    key: 'losangeles',
    label: 'Los Angeles, California',
    category: 'large_urban_basin'
  },
  {
    id: 'chicago',
    kind: 'preset',
    key: 'chicago',
    label: 'Chicago, Illinois',
    category: 'dense_lakeside_city'
  },
  {
    id: 'seattle',
    kind: 'preset',
    key: 'seattle',
    label: 'Seattle, Washington',
    category: 'hilly_coastal_city'
  },
  {
    id: 'chapel_hill_custom',
    kind: 'custom',
    lat: 39.4015,
    lon: -76.6006,
    label: 'Towson, Maryland',
    category: 'suburban_custom'
  },
  {
    id: 'shenandoah_custom',
    kind: 'custom',
    lat: 50.327,
    lon: 6.94,
    label: 'Eifel Region, Germany',
    category: 'rural_mixed_terrain_custom'
  },
  {
    id: 'great_pyramids_custom',
    kind: 'custom',
    lat: 29.9792,
    lon: 31.1342,
    label: 'Great Pyramids of Giza',
    category: 'historic_arid_custom',
    expectedStart: 'land',
    expectedTerrainMode: 'sand',
    expectedLandmarkKind: 'pyramid'
  },
  {
    id: 'great_wall_custom',
    kind: 'custom',
    lat: 40.4319,
    lon: 116.5704,
    label: 'Great Wall of China',
    category: 'historic_mountain_custom',
    expectedStart: 'land',
    expectedLandmarkKind: 'historic_wall'
  },
  {
    id: 'atlantic_ocean_custom',
    kind: 'custom',
    lat: 30,
    lon: -40,
    label: 'North Atlantic Ocean',
    category: 'open_ocean_custom',
    expectedStart: 'water',
    expectedWaterKind: 'open_ocean',
    expectedWaterElevationRange: [-2, 2]
  },
  {
    id: 'swiss_alps_custom',
    kind: 'custom',
    lat: 46.5367,
    lon: 7.9626,
    label: 'Jungfrau Region, Switzerland',
    category: 'alpine_snow_rock_custom',
    expectedStart: 'land',
    expectedTerrainMode: 'snowRock',
    acceptableTerrainModes: ['snow', 'snowRock'],
    acceptableStartTerrainModes: ['snow', 'snowRock']
  },
  {
    id: 'antarctica_glacier_custom',
    kind: 'custom',
    lat: -77.846,
    lon: 166.668,
    label: 'Antarctica Glacier',
    category: 'polar_glacier_custom',
    expectedStart: 'land',
    expectedTerrainMode: 'snowRock',
    acceptableTerrainModes: ['snow', 'snowRock'],
    acceptableStartTerrainModes: ['snow', 'snowRock']
  },
  {
    id: 'north_pole_custom',
    kind: 'custom',
    lat: 90,
    lon: 0,
    label: 'North Pole, Arctic Ocean',
    category: 'polar_sea_ice_custom',
    expectedStart: 'land',
    expectedSurfaceDomain: 'cryosphere'
  },
  {
    id: 'south_pole_custom',
    kind: 'custom',
    lat: -90,
    lon: 0,
    label: 'South Pole, Antarctica',
    category: 'polar_ice_sheet_custom',
    expectedStart: 'land',
    expectedSurfaceDomain: 'cryosphere'
  },
  {
    id: 'sahara_custom',
    kind: 'custom',
    lat: 31.1342,
    lon: -4.012,
    label: 'Erg Chebbi, Morocco',
    category: 'desert_dune_custom',
    expectedStart: 'land',
    expectedTerrainMode: 'sand'
  },
  {
    id: 'amazon_custom',
    kind: 'custom',
    lat: -3.4653,
    lon: -62.2159,
    label: 'Amazon Basin, Brazil',
    category: 'tropical_forest_river_custom',
    expectedStart: 'land',
    minimumWaterways: 1,
    minimumVegetationFeatures: 10000,
    minimumVegetationMeshes: 4,
    minimumVegetationRenderedCrowns: 60000
  },
  {
    id: 'ivory_coast_inland_regression',
    kind: 'custom',
    lat: 7.8939,
    lon: -4.9369,
    label: 'Gbêkê, Vallée du Bandama, Côte d’Ivoire',
    category: 'inland_surface_authority_regression',
    expectedStart: 'land',
    expectedSurfaceDomain: 'land',
    regressionOnly: true
  },
  {
    id: 'svalbard_land_regression',
    kind: 'custom',
    lat: 78.2232,
    lon: 15.6469,
    label: 'Longyearbyen, Svalbard',
    category: 'arctic_land_surface_authority_regression',
    expectedStart: 'land',
    expectedSurfaceDomain: 'land',
    regressionOnly: true
  },
  {
    id: 'grand_canyon_custom',
    kind: 'custom',
    lat: 36.1069,
    lon: -112.1129,
    label: 'Grand Canyon, Arizona',
    category: 'canyon_geology_custom',
    expectedStart: 'land'
  },
  {
    id: 'saopaulo_custom',
    kind: 'custom',
    lat: -23.5505,
    lon: -46.6333,
    label: 'Sao Paulo, Brazil',
    category: 'dense_south_american_city',
    expectedStart: 'land'
  },
  {
    id: 'nairobi_custom',
    kind: 'custom',
    lat: -1.2864,
    lon: 36.8172,
    label: 'Nairobi, Kenya',
    category: 'east_african_city',
    expectedStart: 'land'
  },
  {
    id: 'sydney_custom',
    kind: 'custom',
    lat: -33.8688,
    lon: 151.2093,
    label: 'Sydney, Australia',
    category: 'dense_oceanian_coastal_city',
    expectedStart: 'land'
  },
  {
    id: 'everglades_custom',
    kind: 'custom',
    lat: 25.2866,
    lon: -80.8987,
    label: 'Everglades, Florida',
    category: 'wetland_waterway_custom',
    expectedStart: 'land',
    minimumWaterAreas: 1
  },
  {
    id: 'iowa_farmland_custom',
    kind: 'custom',
    lat: 42.08,
    lon: -93.87,
    label: 'Central Iowa Farmland',
    category: 'rural_farmland_custom',
    expectedStart: 'land'
  },
  {
    id: 'miami_beach_custom',
    kind: 'custom',
    lat: 25.7907,
    lon: -80.13,
    label: 'Miami Beach, Florida',
    category: 'beach_coastal_urban_custom',
    expectedStart: 'land',
    minimumWaterAreas: 1
  },
  {
    id: 'lake_tahoe_custom',
    kind: 'custom',
    lat: 39.0968,
    lon: -120.0324,
    label: 'Lake Tahoe',
    category: 'mountain_lake_custom',
    expectedStart: 'water',
    expectedWaterKind: 'lake',
    expectedWaterElevationRange: [1500, 2200],
    minimumWaterAreas: 1
  },
  {
    id: 'golden_gate_custom',
    kind: 'custom',
    lat: 37.8202408,
    lon: -122.47857,
    label: 'Golden Gate Bridge',
    category: 'major_bridge_coastal_custom',
    expectedStart: 'land',
    expectedRoadStructure: 'bridge',
    minimumStructureClearance: 6
  },
  {
    id: 'holland_tunnel_custom',
    kind: 'custom',
    lat: 40.726368,
    lon: -74.014159,
    label: 'Holland Tunnel',
    category: 'urban_tunnel_custom',
    expectedStart: 'land',
    expectedRoadStructure: 'tunnel'
  },
  {
    id: 'pregerson_interchange_custom',
    kind: 'custom',
    lat: 33.928746,
    lon: -118.280939,
    label: 'Judge Harry Pregerson Interchange',
    category: 'multi_level_urban_interchange_custom',
    expectedStart: 'land',
    expectedRoadStructure: 'bridge'
  },
  {
    id: 'panama_canal_custom',
    kind: 'custom',
    lat: 9.1657587,
    lon: -79.9436744,
    label: 'Gatun Lake, Panama Canal',
    category: 'canal_reservoir_tropical_custom',
    expectedStart: 'water',
    expectedWaterKind: 'lake',
    expectedWaterElevationRange: [15, 40],
    minimumWaterAreas: 1
  }
];

export default WORLD_TEST_LOCATIONS;
