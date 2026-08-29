// ============================================================================
// state.js - Global application state variables
// ============================================================================
import { ctx as appCtx } from "./shared-context.js?v=55";
import { BRIGHT_STARS, CONSTELLATION_LINES } from "./sky/catalog.js?v=1";

// Property State
let properties = [];
let propMarkers = [];
let realEstateMode = false;
let propertyTypeFilter = 'all'; // all, sale, or rent
let selectedProperty = null;
let navigationRoute = null;
let navigationRoutePoints = [];
let navigationRouteDistance = 0;
let navigationMarker = null;
let showNavigation = false;
let propertyRadius = 1; // Default 1km radius
let propertySort = 'distance'; // Sort by: distance, price-low, price-high

// Historic Sites State
let historicSites = [];
let historicMarkers = [];
let historicMode = false;
let selectedHistoric = null;

// POI Display State
let poiMode = false;

// Map Layer Visibility
let mapLayers = {
  properties: true,
  navigation: true,
  // POI categories
  schools: true,
  healthcare: true,
  emergency: true,
  food: true,
  shopping: true,
  culture: true,
  historic: true,
  parks: true,
  parking: true,
  fuel: true,
  banks: true,
  postal: true,
  hotels: true,
  tourism: true,
  // Game elements
  checkpoints: true,
  destination: true,
  customTrack: true,
  activities: true,
  // Police
  police: true,
  // Roads
  roads: true,
  paths: false,
  interiors: true,
  contributions: true,
  // Memory markers
  memoryPins: true,
  memoryFlowers: true
};

// Property UI References
const PropertyUI = {
  panel: null,
  list: null,
  modal: null,
  modalTitle: null,
  modalBody: null,
  button: null
};

const car = {
  x: 0, z: 0, y: 0, angle: 0, speed: 0, vx: 0, vz: 0, vy: 0,
  grip: 1, onRoad: true, road: null, boost: false, boostTime: 0,
  boostReady: true, boostDecayTime: 0, driftAngle: 0,
  condition: 1,
  durabilityPolicy: 'exploration_unlimited',
  resistance: 175,
  transportCatalogId: 'sedan'
};
const boat = {
  x: 0,
  z: 0,
  y: 0,
  angle: 0,
  speed: 0,
  turnRate: 0,
  pitch: 0,
  roll: 0,
  heave: 0,
  vx: 0,
  vz: 0,
  throttle: 0,
  forwardSpeed: 0,
  lateralSpeed: 0,
  verticalVelocity: 0,
  bowLift: 0,
  heaveVelocity: 0,
  pitchVelocity: 0,
  rollVelocity: 0,
  surfaceSteepness: 0
};
let boatMode = {
  active: false,
  available: false,
  seaState: 'moderate',
  waveIntensity: 0.46,
  waterKind: null,
  promptLabel: '',
  promptMessage: '',
  offshoreDistance: 0,
  shorelineDistance: 0,
  detailBias: 1,
  waveDirectionX: 0,
  waveDirectionZ: 1,
  cameraYawOffset: 0,
  cameraPitch: 0,
  cameraLookTimer: 0,
  currentWater: null,
  lastEntryMode: 'walk',
  previousCameraMode: null,
  candidate: null,
  mesh: null,
  waterPatch: null,
  wakeStrength: 0,
  wakeSpread: 0,
  bowWaveStrength: 0,
  bowSplashStrength: 0,
  sternFoamStrength: 0,
  slamStrength: 0,
  manualExitPending: false
};
const keys = {};
let roads = [],roadMeshes = [],urbanSurfaceMeshes = [],buildingMeshes = [],buildings = [],dynamicBuildingColliders = [],landuses = [],surfaceFeatureHints = [],landuseMeshes = [],waterAreas = [],waterways = [],linearFeatures = [],linearFeatureMeshes = [],structureVisualMeshes = [],pois = [],poiMeshes = [],scene,camera,renderer,carMesh,wheelMeshes = [];
let urbanSurfaceStats = {
  sidewalkBatchCount: 0,
  sidewalkVertices: 0,
  sidewalkTriangles: 0,
  skippedBuildingAprons: 0
};
let waterWaveVisuals = [];
let streetFurnitureMeshes = [];
let vegetationFeatures = [],vegetationMeshes = [];
let activityDiscoveryCatalog = [], activityDiscoveryMapMarkers = [];
let editorApprovedSubmissions = [], editorApprovedMeshes = [];
let overlayPublishedFeatures = [], overlayDraftPreviewFeatures = [], overlayRuntimeRoads = [], overlayRuntimeLinearFeatures = [], overlayRuntimePois = [], overlayRuntimeBuildingColliders = [];
let overlaySuppression = {
  roadIds: new Set(),
  buildingIds: new Set()
};
let activeInterior = null;
let interiorHint = null;
let nearestPOI = null;
let traversalNetworks = { walk: null, drive: null };
let gameStarted = false,paused = false,gameMode = 'free',gameTimer = 0,camMode = 0,selLoc = 'baltimore'; // camMode: 0=chase/third-person, 1=hood, 2=overhead
let onMoon = false; // Are we on the moon?
let travelingToMoon = false; // Currently traveling animation
let moonSurface = null; // Moon terrain mesh
let earthPosition = null; // Store Earth position before moon travel
let policeOn = false,police = [],policeMeshes = [],policeHits = 0;
let checkpoints = [],cpMeshes = [],cpCollected = 0;
let destination = null,destMesh = null,trialDone = false;
let customTrack = [],isRecording = false;
let lastTime = 0;
// Drone camera variables
let droneMode = false;
const drone = { x: 0, y: 50, z: 0, pitch: 0, yaw: 0, roll: 0, speed: 30, cameraYawOffset: 0, cameraPitchOffset: 0, cameraLookTimer: 0 };
// Walking module - will be initialized after THREE is loaded
let Walk = null;

// Time of day system
let skyMode = 'live'; // 'live', 'day', 'sunset', 'night', 'sunrise'
let timeOfDay = 'day'; // current visible phase: 'day', 'sunset', 'night', 'sunrise'
let skyState = null;
let sun, hemiLight, fillLight, ambientLight, sunSphere, moonSphere;

// Star field and sky interaction
let starField = null;
let skyRaycaster = null;
let selectedStar = null;
let highlightedConstellation = null;
let raycaster = null;
let mouse = new THREE.Vector2();
let constellationHighlight = null;
let cloudGroup = null;
let cloudsVisible = true;
let constellationsVisible = false;
let allConstellationLines = null;

// Post-processing
let composer = null,ssaoPass = null,bloomPass = null,smaaPass = null;

// Map / minimap state
let showLargeMap = false;
let largeMapZoom = 14;
let minimapZoom = 15;
let satelliteView = false;
let landUseVisible = false;
let showRoads = true;
let showPathOverlays = false;
let worldLoading = false;
// RA (Right Ascension) in hours (0-24), Dec (Declination) in degrees (-90 to 90)
// Mag (Apparent magnitude) - lower is brighter. Naked eye limit ~6.0
// Star field system - Real astronomical data from Yale Bright Star Catalog
// RA (Right Ascension) in hours (0-24), Dec (Declination) in degrees (-90 to 90)
// Mag (Apparent magnitude) - lower is brighter. Naked eye limit ~6.0
// ========================================================================
// ASTRONOMICALLY ACCURATE STAR DATA
// Based on Yale Bright Star Catalog and Hipparcos
// RA in hours (0-24), Dec in degrees (-90 to +90)
// Distances in light years, Magnitudes (lower = brighter)
// ========================================================================

Object.assign(appCtx, {
  BRIGHT_STARS,
  CONSTELLATION_LINES,
  PropertyUI,
  Walk,
  allConstellationLines,
  ambientLight,
  bloomPass,
  buildingMeshes,
  buildings,
  dynamicBuildingColliders,
  editorApprovedMeshes,
  editorApprovedSubmissions,
  activityDiscoveryCatalog,
  activityDiscoveryMapMarkers,
  overlayDraftPreviewFeatures,
  overlayPublishedFeatures,
  overlayRuntimeLinearFeatures,
  overlayRuntimeBuildingColliders,
  overlayRuntimePois,
  overlayRuntimeRoads,
  overlaySuppression,
  camMode,
  camera,
  car,
  carMesh,
  boat,
  boatMode,
  checkpoints,
  cloudGroup,
  cloudsVisible,
  composer,
  constellationHighlight,
  constellationsVisible,
  cpCollected,
  cpMeshes,
  customTrack,
  destMesh,
  destination,
  drone,
  droneMode,
  earthPosition,
  fillLight,
  gameMode,
  gameStarted,
  gameTimer,
  hemiLight,
  highlightedConstellation,
  historicMarkers,
  historicMode,
  historicSites,
  isRecording,
  keys,
  landUseVisible,
  landuseMeshes,
  landuses,
  linearFeatureMeshes,
  linearFeatures,
  structureVisualMeshes,
  interiorHint,
  activeInterior,
  waterAreas,
  waterways,
  largeMapZoom,
  minimapZoom,
  lastTime,
  mapLayers,
  moonSphere,
  moonSurface,
  mouse,
  navigationMarker,
  navigationRoute,
  navigationRouteDistance,
  navigationRoutePoints,
  nearestPOI,
  onMoon,
  paused,
  poiMeshes,
  poiMode,
  pois,
  police,
  policeHits,
  policeMeshes,
  policeOn,
  propMarkers,
  properties,
  propertyRadius,
  propertySort,
  propertyTypeFilter,
  raycaster,
  realEstateMode,
  renderer,
  roadMeshes,
  roads,
  urbanSurfaceMeshes,
  urbanSurfaceStats,
  waterWaveVisuals,
  satelliteView,
  scene,
  selectedHistoric,
  selectedProperty,
  selectedStar,
  selLoc,
  showLargeMap,
  showNavigation,
  showPathOverlays,
  showRoads,
  worldLoading,
  skyRaycaster,
  skyMode,
  smaaPass,
  ssaoPass,
  starField,
  streetFurnitureMeshes,
  surfaceFeatureHints,
  vegetationFeatures,
  vegetationMeshes,
  skyState,
  sun,
  sunSphere,
  timeOfDay,
  traversalNetworks,
  travelingToMoon,
  trialDone,
  wheelMeshes
});

export {
  BRIGHT_STARS,
  CONSTELLATION_LINES,
  PropertyUI,
  Walk,
  allConstellationLines,
  ambientLight,
  bloomPass,
  buildingMeshes,
  buildings,
  dynamicBuildingColliders,
  editorApprovedMeshes,
  editorApprovedSubmissions,
  activityDiscoveryCatalog,
  activityDiscoveryMapMarkers,
  overlayDraftPreviewFeatures,
  overlayPublishedFeatures,
  overlayRuntimeLinearFeatures,
  overlayRuntimeBuildingColliders,
  overlayRuntimePois,
  overlayRuntimeRoads,
  overlaySuppression,
  camMode,
  camera,
  car,
  carMesh,
  boat,
  boatMode,
  checkpoints,
  cloudGroup,
  cloudsVisible,
  composer,
  constellationHighlight,
  constellationsVisible,
  cpCollected,
  cpMeshes,
  customTrack,
  destMesh,
  destination,
  drone,
  droneMode,
  earthPosition,
  fillLight,
  gameMode,
  gameStarted,
  gameTimer,
  hemiLight,
  highlightedConstellation,
  historicMarkers,
  historicMode,
  historicSites,
  isRecording,
  keys,
  landUseVisible,
  landuseMeshes,
  landuses,
  linearFeatureMeshes,
  linearFeatures,
  structureVisualMeshes,
  interiorHint,
  activeInterior,
  waterAreas,
  waterways,
  largeMapZoom,
  minimapZoom,
  lastTime,
  mapLayers,
  moonSphere,
  moonSurface,
  mouse,
  navigationMarker,
  navigationRoute,
  navigationRouteDistance,
  navigationRoutePoints,
  nearestPOI,
  onMoon,
  paused,
  poiMeshes,
  poiMode,
  pois,
  police,
  policeHits,
  policeMeshes,
  policeOn,
  propMarkers,
  properties,
  propertyRadius,
  propertySort,
  propertyTypeFilter,
  raycaster,
  realEstateMode,
  renderer,
  roadMeshes,
  roads,
  urbanSurfaceMeshes,
  urbanSurfaceStats,
  waterWaveVisuals,
  satelliteView,
  scene,
  selectedHistoric,
  selectedProperty,
  selectedStar,
  selLoc,
  showLargeMap,
  showNavigation,
  showPathOverlays,
  showRoads,
  worldLoading,
  skyRaycaster,
  skyMode,
  smaaPass,
  ssaoPass,
  starField,
  streetFurnitureMeshes,
  surfaceFeatureHints,
  vegetationFeatures,
  vegetationMeshes,
  skyState,
  sun,
  sunSphere,
  timeOfDay,
  traversalNetworks,
  travelingToMoon,
  trialDone,
  wheelMeshes };
