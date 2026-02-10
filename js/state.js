// ============================================================================
// state.js - Global application state variables
// ============================================================================

// Property State
let properties = [];
let propMarkers = [];
let realEstateMode = false;
let propertyTypeFilter = 'all'; // all, sale, or rent
let selectedProperty = null;
let navigationRoute = null;
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
  // Police
  police: true,
  // Roads
  roads: true
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

const car = { x:0, z:0, y:0, angle:0, speed:0, vx:0, vz:0, vy:0, grip:1, onRoad:true, road:null, boost:false, boostTime:0, boostReady:true, boostDecayTime:0, driftAngle:0 };
const keys = {};
let roads = [], roadMeshes = [], buildingMeshes = [], buildings = [], landuses = [], landuseMeshes = [], pois = [], poiMeshes = [], scene, camera, renderer, carMesh, wheelMeshes = [];
let streetFurnitureMeshes = [];
let nearestPOI = null;
let gameStarted = false, paused = false, gameMode = 'free', gameTimer = 0, camMode = 0, selLoc = 'baltimore';
let onMoon = false;          // Are we on the moon?
let travelingToMoon = false; // Currently traveling animation
let moonSurface = null;      // Moon terrain mesh
let earthPosition = null;    // Store Earth position before moon travel
let policeOn = false, police = [], policeMeshes = [], policeHits = 0;
let checkpoints = [], cpMeshes = [], cpCollected = 0;
let destination = null, destMesh = null, trialDone = false;
let customTrack = [], trackMesh = null, isRecording = false;
let lastTime = 0;
// Drone camera variables
let droneMode = false;
const drone = { x: 0, y: 50, z: 0, pitch: 0, yaw: 0, roll: 0, speed: 30 };
// Walking module - will be initialized after THREE is loaded
let Walk = null;

// Time of day system
let timeOfDay = 'day'; // 'day', 'sunset', 'night', 'sunrise'
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
let composer = null, ssaoPass = null, bloomPass = null, smaaPass = null;

// Map / minimap state
let showLargeMap = false;
let largeMapZoom = 14;
let satelliteView = false;
let landUseVisible = true;
let showRoads = true;
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

const BRIGHT_STARS = [
  // ===================================================================
  // ZODIAC CONSTELLATIONS (All 12 - in order along ecliptic)
  // ===================================================================

  // === ARIES (The Ram) - Mar 21-Apr 19 ===
  {ra:2.119,dec:23.463,mag:2.00,dist:66,name:"Hamal",proper:"α Ari",color:0xffcc88,constellation:"Aries"},
  {ra:1.911,dec:20.808,mag:2.64,dist:59,name:"Sheratan",proper:"β Ari",color:0xffffff,constellation:"Aries"},
  {ra:2.656,dec:27.260,mag:3.88,dist:164,name:"Mesarthim",proper:"γ Ari",color:0xffffff,constellation:"Aries"},
  {ra:3.226,dec:19.726,mag:4.35,dist:170,name:"Botein",proper:"δ Ari",color:0xffe4b5,constellation:"Aries"},

  // === TAURUS (The Bull) - Apr 20-May 20 ===
  {ra:4.599,dec:16.509,mag:0.85,dist:65,name:"Aldebaran",proper:"α Tau",color:0xff8844,constellation:"Taurus"},
  {ra:5.438,dec:28.608,mag:2.87,dist:444,name:"Alcyone",proper:"η Tau",color:0xadd8e6,constellation:"Taurus"},  // Pleiades
  {ra:4.476,dec:15.871,mag:1.65,dist:131,name:"Elnath",proper:"β Tau",color:0xb5d4ff,constellation:"Taurus"},
  {ra:5.627,dec:21.143,mag:3.00,dist:150,name:"Electra",proper:"17 Tau",color:0xadd8e6,constellation:"Taurus"},  // Pleiades
  {ra:3.797,dec:24.105,mag:3.53,dist:150,name:"Ain",proper:"ε Tau",color:0xffaa77,constellation:"Taurus"},
  {ra:5.449,dec:24.368,mag:3.70,dist:440,name:"Atlas",proper:"27 Tau",color:0xadd8e6,constellation:"Taurus"},  // Pleiades

  // === GEMINI (The Twins) - May 21-Jun 20 ===
  {ra:7.755,dec:28.026,mag:1.14,dist:34,name:"Pollux",proper:"β Gem",color:0xffcc66,constellation:"Gemini"},
  {ra:7.577,dec:31.888,mag:1.58,dist:51,name:"Castor",proper:"α Gem",color:0xffffff,constellation:"Gemini"},
  {ra:6.628,dec:22.514,mag:1.93,dist:109,name:"Alhena",proper:"γ Gem",color:0xffffff,constellation:"Gemini"},
  {ra:6.383,dec:22.507,mag:2.88,dist:121,name:"Mebsuta",proper:"ε Gem",color:0xffbb77,constellation:"Gemini"},
  {ra:7.068,dec:20.570,mag:3.53,dist:840,name:"Tejat",proper:"μ Gem",color:0xff8866,constellation:"Gemini"},
  {ra:6.248,dec:12.896,mag:3.36,dist:350,name:"Propus",proper:"η Gem",color:0xff6644,constellation:"Gemini"},

  // === CANCER (The Crab) - Jun 21-Jul 22 ===
  {ra:8.975,dec:11.858,mag:3.52,dist:174,name:"Al Tarf",proper:"β Cnc",color:0xffaa77,constellation:"Cancer"},
  {ra:8.722,dec:21.469,mag:3.94,dist:158,name:"Asellus Borealis",proper:"γ Cnc",color:0xffffff,constellation:"Cancer"},
  {ra:8.745,dec:18.154,mag:3.94,dist:136,name:"Asellus Australis",proper:"δ Cnc",color:0xffaa77,constellation:"Cancer"},
  {ra:8.775,dec:28.760,mag:4.02,dist:290,name:"Acubens",proper:"α Cnc",color:0xffffff,constellation:"Cancer"},
  {ra:9.188,dec:12.653,mag:5.43,dist:577,name:"Iota Cancri",proper:"ι Cnc",color:0xffffff,constellation:"Cancer"},

  // === LEO (The Lion) - Jul 23-Aug 22 ===
  {ra:10.139,dec:11.967,mag:1.35,dist:79,name:"Regulus",proper:"α Leo",color:0xd4e4ff,constellation:"Leo"},
  {ra:11.818,dec:14.572,mag:2.14,dist:36,name:"Denebola",proper:"β Leo",color:0xffffff,constellation:"Leo"},
  {ra:9.763,dec:23.774,mag:2.61,dist:130,name:"Algieba",proper:"γ Leo",color:0xffaa77,constellation:"Leo"},
  {ra:11.235,dec:20.524,mag:2.56,dist:58,name:"Zosma",proper:"δ Leo",color:0xffffff,constellation:"Leo"},
  {ra:9.879,dec:26.152,mag:3.44,dist:274,name:"Adhafera",proper:"ζ Leo",color:0xfff4e8,constellation:"Leo"},
  {ra:10.278,dec:16.763,mag:3.33,dist:165,name:"Chertan",proper:"θ Leo",color:0xffffff,constellation:"Leo"},

  // === VIRGO (The Virgin) - Aug 23-Sep 22 ===
  {ra:13.420,dec:-11.161,mag:0.98,dist:250,name:"Spica",proper:"α Vir",color:0xadd8e6,constellation:"Virgo"},
  {ra:12.694,dec:-1.449,mag:2.74,dist:38,name:"Porrima",proper:"γ Vir",color:0xffffff,constellation:"Virgo"},
  {ra:13.037,dec:10.959,mag:2.85,dist:102,name:"Vindemiatrix",proper:"ε Vir",color:0xffbb77,constellation:"Virgo"},
  {ra:14.780,dec:1.544,mag:3.38,dist:74,name:"Heze",proper:"ζ Vir",color:0xffffff,constellation:"Virgo"},
  {ra:12.333,dec:-0.667,mag:3.61,dist:35,name:"Zavijava",proper:"β Vir",color:0xffffff,constellation:"Virgo"},
  {ra:14.016,dec:1.545,mag:3.89,dist:265,name:"Zaniah",proper:"η Vir",color:0xffffff,constellation:"Virgo"},

  // === LIBRA (The Scales) - Sep 23-Oct 22 ===
  {ra:15.283,dec:-9.383,mag:2.61,dist:185,name:"Zubeneschamali",proper:"β Lib",color:0xadd8e6,constellation:"Libra"},
  {ra:14.849,dec:-16.042,mag:2.75,dist:77,name:"Zubenelgenubi",proper:"α Lib",color:0xffffff,constellation:"Libra"},
  {ra:15.592,dec:-14.789,mag:3.29,dist:143,name:"Zubenelakrab",proper:"γ Lib",color:0xffaa77,constellation:"Libra"},
  {ra:15.061,dec:-25.282,mag:3.91,dist:185,name:"Brachium",proper:"σ Lib",color:0xff8866,constellation:"Libra"},

  // === SCORPIUS (The Scorpion) - Oct 23-Nov 21 ===
  {ra:16.490,dec:-26.432,mag:0.96,dist:550,name:"Antares",proper:"α Sco",color:0xff4422,constellation:"Scorpius"},
  {ra:17.560,dec:-37.104,mag:1.63,dist:464,name:"Shaula",proper:"λ Sco",color:0xadd8e6,constellation:"Scorpius"},
  {ra:16.836,dec:-34.293,mag:2.29,dist:700,name:"Sargas",proper:"θ Sco",color:0xfff4e8,constellation:"Scorpius"},
  {ra:16.960,dec:-42.998,mag:2.32,dist:272,name:"Girtab",proper:"κ Sco",color:0xadd8e6,constellation:"Scorpius"},
  {ra:16.005,dec:-19.805,mag:2.32,dist:402,name:"Dschubba",proper:"δ Sco",color:0xadd8e6,constellation:"Scorpius"},
  {ra:16.090,dec:-19.461,mag:2.89,dist:590,name:"Pi Scorpii",proper:"π Sco",color:0xadd8e6,constellation:"Scorpius"},
  {ra:17.202,dec:-37.296,mag:2.70,dist:96,name:"Lesath",proper:"υ Sco",color:0xadd8e6,constellation:"Scorpius"},

  // === SAGITTARIUS (The Archer) - Nov 22-Dec 21 ===
  {ra:19.396,dec:-40.616,mag:1.85,dist:143,name:"Kaus Australis",proper:"ε Sgr",color:0xadd8e6,constellation:"Sagittarius"},
  {ra:18.921,dec:-26.297,mag:2.02,dist:228,name:"Nunki",proper:"σ Sgr",color:0xadd8e6,constellation:"Sagittarius"},
  {ra:19.163,dec:-29.880,mag:2.59,dist:88,name:"Ascella",proper:"ζ Sgr",color:0xffffff,constellation:"Sagittarius"},
  {ra:19.093,dec:-21.024,mag:2.70,dist:306,name:"Kaus Media",proper:"δ Sgr",color:0xffe4b5,constellation:"Sagittarius"},
  {ra:18.466,dec:-34.384,mag:2.81,dist:77,name:"Kaus Borealis",proper:"λ Sgr",color:0xffe4b5,constellation:"Sagittarius"},
  {ra:19.375,dec:-24.883,mag:2.98,dist:96,name:"Alnasl",proper:"γ Sgr",color:0xffaa77,constellation:"Sagittarius"},
  {ra:18.350,dec:-25.422,mag:3.17,dist:120,name:"Albaldah",proper:"π Sgr",color:0xffffff,constellation:"Sagittarius"},

  // === CAPRICORNUS (The Sea-Goat) - Dec 22-Jan 19 ===
  {ra:21.784,dec:-16.127,mag:2.87,dist:39,name:"Deneb Algedi",proper:"δ Cap",color:0xffffff,constellation:"Capricornus"},
  {ra:20.350,dec:-12.508,mag:2.85,dist:344,name:"Dabih",proper:"β Cap",color:0xffaa77,constellation:"Capricornus"},
  {ra:21.099,dec:-16.662,mag:3.57,dist:139,name:"Nashira",proper:"γ Cap",color:0xffffff,constellation:"Capricornus"},
  {ra:20.298,dec:-14.781,mag:4.07,dist:670,name:"Alshat",proper:"ν Cap",color:0xffffff,constellation:"Capricornus"},
  {ra:21.618,dec:-19.466,mag:4.08,dist:290,name:"Omega Capricorni",proper:"ω Cap",color:0xffe4b5,constellation:"Capricornus"},

  // === AQUARIUS (The Water-Bearer) - Jan 20-Feb 18 ===
  {ra:22.096,dec:-0.320,mag:2.91,dist:612,name:"Sadalsuud",proper:"β Aqr",color:0xfff4e8,constellation:"Aquarius"},
  {ra:22.877,dec:-15.821,mag:2.96,dist:758,name:"Sadalmelik",proper:"α Aqr",color:0xfff4e8,constellation:"Aquarius"},
  {ra:21.526,dec:-5.571,mag:3.27,dist:160,name:"Skat",proper:"δ Aqr",color:0xffffff,constellation:"Aquarius"},
  {ra:22.361,dec:-1.387,mag:3.84,dist:319,name:"Sadachbia",proper:"γ Aqr",color:0xffffff,constellation:"Aquarius"},
  {ra:22.825,dec:-7.579,mag:4.01,dist:98,name:"Albali",proper:"ε Aqr",color:0xffffff,constellation:"Aquarius"},

  // === PISCES (The Fishes) - Feb 19-Mar 20 ===
  {ra:1.297,dec:7.890,mag:3.82,dist:139,name:"Alrescha",proper:"α Psc",color:0xffffff,constellation:"Pisces"},
  {ra:23.666,dec:1.256,mag:3.69,dist:294,name:"Gamma Piscium",proper:"γ Psc",color:0xffffff,constellation:"Pisces"},
  {ra:23.286,dec:3.820,mag:3.62,dist:294,name:"Eta Piscium",proper:"η Psc",color:0xfff4e8,constellation:"Pisces"},
  {ra:1.226,dec:15.346,mag:4.33,dist:130,name:"Omega Piscium",proper:"ω Psc",color:0xffffff,constellation:"Pisces"},
  {ra:0.811,dec:7.585,mag:4.28,dist:151,name:"Iota Piscium",proper:"ι Psc",color:0xffffff,constellation:"Pisces"},

  // ===================================================================
  // OTHER MAJOR CONSTELLATIONS
  // ===================================================================

  // === ORION (The Hunter) ===
  {ra:5.919,dec:7.407,mag:0.50,dist:548,name:"Betelgeuse",proper:"α Ori",color:0xff6347,constellation:"Orion"},
  {ra:5.242,dec:-8.202,mag:0.13,dist:863,name:"Rigel",proper:"β Ori",color:0x9bb0ff,constellation:"Orion"},
  {ra:5.439,dec:6.350,mag:1.64,dist:243,name:"Bellatrix",proper:"γ Ori",color:0xb0d0ff,constellation:"Orion"},
  {ra:5.603,dec:-1.202,mag:1.69,dist:2000,name:"Alnilam",proper:"ε Ori",color:0xabc4ff,constellation:"Orion"},  // Belt center
  {ra:5.679,dec:-1.943,mag:1.77,dist:1260,name:"Alnitak",proper:"ζ Ori",color:0xabc4ff,constellation:"Orion"},  // Belt east
  {ra:5.533,dec:-0.299,mag:2.23,dist:1200,name:"Mintaka",proper:"δ Ori",color:0xb5d4ff,constellation:"Orion"},  // Belt west
  {ra:5.533,dec:-9.670,mag:2.06,dist:724,name:"Saiph",proper:"κ Ori",color:0xa0c8ff,constellation:"Orion"},
  {ra:5.350,dec:9.934,mag:3.39,dist:1100,name:"Meissa",proper:"λ Ori",color:0xb0d0ff,constellation:"Orion"},

  // === URSA MAJOR (Big Dipper) ===
  {ra:11.062,dec:61.751,mag:1.79,dist:123,name:"Dubhe",proper:"α UMa",color:0xffcc88,constellation:"Ursa Major"},
  {ra:11.030,dec:56.382,mag:2.37,dist:79,name:"Merak",proper:"β UMa",color:0xffffff,constellation:"Ursa Major"},
  {ra:11.897,dec:53.695,mag:2.44,dist:84,name:"Phecda",proper:"γ UMa",color:0xffffff,constellation:"Ursa Major"},
  {ra:12.257,dec:57.032,mag:3.31,dist:81,name:"Megrez",proper:"δ UMa",color:0xffffff,constellation:"Ursa Major"},
  {ra:12.900,dec:55.960,mag:1.77,dist:81,name:"Alioth",proper:"ε UMa",color:0xffffff,constellation:"Ursa Major"},
  {ra:13.398,dec:54.925,mag:2.27,dist:78,name:"Mizar",proper:"ζ UMa",color:0xffffff,constellation:"Ursa Major"},
  {ra:13.792,dec:49.313,mag:1.86,dist:101,name:"Alkaid",proper:"η UMa",color:0xffffff,constellation:"Ursa Major"},

  // === URSA MINOR (Little Dipper with Polaris) ===
  {ra:2.530,dec:89.264,mag:1.98,dist:433,name:"Polaris",proper:"α UMi",color:0xfff4e8,constellation:"Ursa Minor"},
  {ra:14.845,dec:74.155,mag:2.08,dist:126,name:"Kochab",proper:"β UMi",color:0xffaa77,constellation:"Ursa Minor"},
  {ra:15.345,dec:71.834,mag:3.05,dist:480,name:"Pherkad",proper:"γ UMi",color:0xffffff,constellation:"Ursa Minor"},

  // === CASSIOPEIA (The Queen) ===
  {ra:0.675,dec:60.717,mag:2.27,dist:54,name:"Caph",proper:"β Cas",color:0xffffff,constellation:"Cassiopeia"},
  {ra:0.153,dec:59.150,mag:2.23,dist:229,name:"Schedar",proper:"α Cas",color:0xffcc88,constellation:"Cassiopeia"},
  {ra:1.430,dec:60.235,mag:2.47,dist:613,name:"Navi",proper:"γ Cas",color:0xadd8e6,constellation:"Cassiopeia"},
  {ra:0.945,dec:60.235,mag:2.68,dist:99,name:"Ruchbah",proper:"δ Cas",color:0xffffff,constellation:"Cassiopeia"},
  {ra:1.906,dec:63.670,mag:3.38,dist:442,name:"Segin",proper:"ε Cas",color:0xadd8e6,constellation:"Cassiopeia"},

  // === CYGNUS (The Swan / Northern Cross) ===
  {ra:20.691,dec:45.280,mag:1.25,dist:2615,name:"Deneb",proper:"α Cyg",color:0xffffff,constellation:"Cygnus"},
  {ra:19.512,dec:27.960,mag:2.20,dist:1833,name:"Sadr",proper:"γ Cyg",color:0xfff4e8,constellation:"Cygnus"},
  {ra:20.371,dec:40.257,mag:2.46,dist:72,name:"Gienah",proper:"ε Cyg",color:0xffaa77,constellation:"Cygnus"},
  {ra:19.511,dec:51.731,mag:2.87,dist:165,name:"Delta Cygni",proper:"δ Cyg",color:0xadd8e6,constellation:"Cygnus"},
  {ra:19.748,dec:33.971,mag:2.48,dist:390,name:"Albireo",proper:"β Cyg",color:0xffaa77,constellation:"Cygnus"},

  // === BOÖTES (The Herdsman) ===
  {ra:14.261,dec:19.182,mag:-0.05,dist:37,name:"Arcturus",proper:"α Boo",color:0xff8c00,constellation:"Boötes"},
  {ra:14.749,dec:27.074,mag:2.37,dist:203,name:"Izar",proper:"ε Boo",color:0xffaa77,constellation:"Boötes"},
  {ra:15.032,dec:40.390,mag:2.68,dist:37,name:"Muphrid",proper:"η Boo",color:0xfff4e8,constellation:"Boötes"},
  {ra:13.911,dec:18.398,mag:3.03,dist:225,name:"Seginus",proper:"γ Boo",color:0xffffff,constellation:"Boötes"},

  // === LYRA (The Lyre) ===
  {ra:18.616,dec:38.783,mag:0.03,dist:25,name:"Vega",proper:"α Lyr",color:0xffffff,constellation:"Lyra"},
  {ra:18.983,dec:32.689,mag:3.45,dist:960,name:"Sheliak",proper:"β Lyr",color:0xffffff,constellation:"Lyra"},
  {ra:18.746,dec:39.610,mag:3.24,dist:620,name:"Sulafat",proper:"γ Lyr",color:0xadd8e6,constellation:"Lyra"},

  // === AQUILA (The Eagle) ===
  {ra:19.847,dec:8.868,mag:0.77,dist:17,name:"Altair",proper:"α Aql",color:0xffffff,constellation:"Aquila"},
  {ra:19.771,dec:1.006,mag:2.72,dist:45,name:"Alshain",proper:"β Aql",color:0xffffff,constellation:"Aquila"},
  {ra:19.771,dec:10.613,mag:2.99,dist:461,name:"Tarazed",proper:"γ Aql",color:0xffaa77,constellation:"Aquila"},

  // === PERSEUS (The Hero) ===
  {ra:3.405,dec:49.861,mag:1.80,dist:510,name:"Mirfak",proper:"α Per",color:0xfff4e8,constellation:"Perseus"},
  {ra:3.136,dec:40.955,mag:2.12,dist:93,name:"Algol",proper:"β Per",color:0xffffff,constellation:"Perseus"},
  {ra:3.902,dec:47.787,mag:2.93,dist:243,name:"Gamma Persei",proper:"γ Per",color:0xffffff,constellation:"Perseus"},
  {ra:3.079,dec:53.506,mag:3.01,dist:520,name:"Delta Persei",proper:"δ Per",color:0xadd8e6,constellation:"Perseus"},

  // === ANDROMEDA (The Princess) ===
  {ra:0.140,dec:29.091,mag:2.06,dist:97,name:"Alpheratz",proper:"α And",color:0xffffff,constellation:"Andromeda"},
  {ra:1.162,dec:35.620,mag:2.06,dist:200,name:"Mirach",proper:"β And",color:0xff8866,constellation:"Andromeda"},
  {ra:2.065,dec:42.330,mag:2.26,dist:355,name:"Almach",proper:"γ And",color:0xffaa77,constellation:"Andromeda"},
  {ra:0.657,dec:30.861,mag:3.27,dist:101,name:"Delta Andromedae",proper:"δ And",color:0xffaa77,constellation:"Andromeda"},

  // === PEGASUS (The Winged Horse) ===
  {ra:23.079,dec:15.205,mag:2.49,dist:133,name:"Markab",proper:"α Peg",color:0xadd8e6,constellation:"Pegasus"},
  {ra:23.063,dec:28.083,mag:2.42,dist:196,name:"Scheat",proper:"β Peg",color:0xff8866,constellation:"Pegasus"},
  {ra:0.220,dec:15.184,mag:2.83,dist:391,name:"Algenib",proper:"γ Peg",color:0xadd8e6,constellation:"Pegasus"},
  {ra:22.717,dec:10.831,mag:2.39,dist:672,name:"Enif",proper:"ε Peg",color:0xffaa77,constellation:"Pegasus"},

  // === CANIS MAJOR (The Great Dog) ===
  {ra:6.752,dec:-16.716,mag:-1.46,dist:8.6,name:"Sirius",proper:"α CMa",color:0xffffff,constellation:"Canis Major"},
  {ra:6.378,dec:-17.956,mag:1.50,dist:500,name:"Adhara",proper:"ε CMa",color:0xadd8e6,constellation:"Canis Major"},
  {ra:7.140,dec:-26.771,mag:1.83,dist:405,name:"Wezen",proper:"δ CMa",color:0xfff4e8,constellation:"Canis Major"},

  // === CANIS MINOR (The Lesser Dog) ===
  {ra:7.655,dec:5.225,mag:0.38,dist:11.5,name:"Procyon",proper:"α CMi",color:0xfff8dc,constellation:"Canis Minor"},
  {ra:7.453,dec:8.289,mag:2.90,dist:170,name:"Gomeisa",proper:"β CMi",color:0xffffff,constellation:"Canis Minor"},

  // === AURIGA (The Charioteer) ===
  {ra:5.278,dec:45.998,mag:0.08,dist:42,name:"Capella",proper:"α Aur",color:0xfff5e1,constellation:"Auriga"},
  {ra:5.992,dec:44.948,mag:1.90,dist:82,name:"Menkalinan",proper:"β Aur",color:0xffffff,constellation:"Auriga"},
  {ra:4.950,dec:43.823,mag:2.69,dist:512,name:"Almaaz",proper:"ε Aur",color:0xffffff,constellation:"Auriga"},

  // === CENTAURUS (The Centaur) ===
  {ra:14.661,dec:-60.835,mag:-0.27,dist:4.37,name:"Rigil Kentaurus",proper:"α Cen",color:0xfff4e6,constellation:"Centaurus"},
  {ra:14.063,dec:-60.373,mag:0.61,dist:525,name:"Hadar",proper:"β Cen",color:0xadd8e6,constellation:"Centaurus"},
  {ra:12.139,dec:-50.722,mag:2.17,dist:61,name:"Menkent",proper:"θ Cen",color:0xffaa77,constellation:"Centaurus"},

  // === CRUX (Southern Cross) ===
  {ra:12.443,dec:-63.099,mag:0.77,dist:321,name:"Acrux",proper:"α Cru",color:0xadd8e6,constellation:"Crux"},
  {ra:12.795,dec:-59.689,mag:1.25,dist:280,name:"Mimosa",proper:"β Cru",color:0xadd8e6,constellation:"Crux"},
  {ra:12.519,dec:-57.113,mag:1.63,dist:88,name:"Gacrux",proper:"γ Cru",color:0xff6644,constellation:"Crux"},
  {ra:12.253,dec:-58.749,mag:2.80,dist:345,name:"Delta Crucis",proper:"δ Cru",color:0xadd8e6,constellation:"Crux"},

  // === CARINA (The Keel) ===
  {ra:6.399,dec:-52.696,mag:-0.72,dist:310,name:"Canopus",proper:"α Car",color:0xfff4e8,constellation:"Carina"},
  {ra:8.375,dec:-59.509,mag:1.68,dist:113,name:"Miaplacidus",proper:"β Car",color:0xffffff,constellation:"Carina"},
  {ra:9.220,dec:-59.275,mag:1.86,dist:632,name:"Avior",proper:"ε Car",color:0xffaa77,constellation:"Carina"},

  // === ERIDANUS (The River) ===
  {ra:1.628,dec:-57.237,mag:0.46,dist:139,name:"Achernar",proper:"α Eri",color:0xadd8e6,constellation:"Eridanus"},
  {ra:3.549,dec:-9.458,mag:2.95,dist:143,name:"Cursa",proper:"β Eri",color:0xffffff,constellation:"Eridanus"},

  // === PISCIS AUSTRINUS (The Southern Fish) ===
  {ra:22.961,dec:-29.622,mag:1.16,dist:25,name:"Fomalhaut",proper:"α PsA",color:0xffffff,constellation:"Piscis Austrinus"},

  // === DRACO (The Dragon) ===
  {ra:14.073,dec:64.376,mag:3.65,dist:303,name:"Thuban",proper:"α Dra",color:0xffffff,constellation:"Draco"},
  {ra:17.943,dec:51.489,mag:2.79,dist:380,name:"Eltanin",proper:"γ Dra",color:0xffaa77,constellation:"Draco"},
  {ra:17.507,dec:52.301,mag:2.73,dist:362,name:"Rastaban",proper:"β Dra",color:0xfff4e8,constellation:"Draco"},

  // === OPHIUCHUS (The Serpent Bearer) ===
  {ra:17.582,dec:12.560,mag:2.08,dist:47,name:"Rasalhague",proper:"α Oph",color:0xffffff,constellation:"Ophiuchus"},
  {ra:16.961,dec:-10.567,mag:2.43,dist:170,name:"Sabik",proper:"η Oph",color:0xffffff,constellation:"Ophiuchus"},

  // === HERCULES (The Hero) ===
  {ra:17.244,dec:14.390,mag:2.77,dist:139,name:"Kornephoros",proper:"β Her",color:0xfff4e8,constellation:"Hercules"},
  {ra:16.716,dec:31.603,mag:3.48,dist:359,name:"Rasalgethi",proper:"α Her",color:0xff8866,constellation:"Hercules"},
  {ra:17.250,dec:24.839,mag:2.81,dist:35,name:"Zeta Herculis",proper:"ζ Her",color:0xfff4e8,constellation:"Hercules"}
];
// ========================================================================
// CONSTELLATION LINE DEFINITIONS
// Each array contains pairs of [RA, Dec] coordinates to connect with lines
// Based on traditional IAU constellation patterns
// ========================================================================

const CONSTELLATION_LINES = {
  // ===================================================================
  // ZODIAC CONSTELLATIONS
  // ===================================================================

  "Aries": [
    // Triangle shape
    [[2.119,23.463],[1.911,20.808]], // Hamal-Sheratan
    [[1.911,20.808],[2.656,27.260]], // Sheratan-Mesarthim
    [[2.656,27.260],[2.119,23.463]], // Mesarthim-Hamal (close triangle)
    [[2.119,23.463],[3.226,19.726]], // Hamal-Botein (extension)
  ],

  "Taurus": [
    // V-shaped head (Hyades cluster)
    [[4.599,16.509],[3.797,24.105]], // Aldebaran-Ain
    [[4.599,16.509],[4.476,15.871]], // Aldebaran-Elnath (horn)
    // Connection to Pleiades
    [[3.797,24.105],[5.438,28.608]], // Ain-Alcyone (Pleiades)
    [[5.438,28.608],[5.449,24.368]], // Alcyone-Atlas (Pleiades cluster)
    [[5.438,28.608],[5.627,21.143]], // Alcyone-Electra (Pleiades)
  ],

  "Gemini": [
    // The two parallel twins
    [[7.755,28.026],[7.577,31.888]], // Pollux-Castor (heads)
    [[7.755,28.026],[6.628,22.514]], // Pollux-Alhena (Pollux's body)
    [[6.628,22.514],[6.383,22.507]], // Alhena-Mebsuta
    [[6.383,22.507],[6.248,12.896]], // Mebsuta-Propus (foot)
    [[7.577,31.888],[7.068,20.570]], // Castor-Tejat (Castor's body)
    [[7.068,20.570],[6.628,22.514]], // Tejat-Alhena (connecting twins)
  ],

  "Cancer": [
    // Upside-down Y shape
    [[8.975,11.858],[8.775,28.760]], // Al Tarf-Acubens (left arm)
    [[8.975,11.858],[8.745,18.154]], // Al Tarf-Asellus Australis (center)
    [[8.745,18.154],[8.722,21.469]], // Asellus Australis-Asellus Borealis
    [[8.722,21.469],[9.188,12.653]], // Asellus Borealis-Iota (right side)
  ],

  "Leo": [
    // The Lion - Sickle (head) and triangle (body)
    // Sickle (backwards question mark)
    [[10.139,11.967],[9.763,23.774]], // Regulus-Algieba
    [[9.763,23.774],[9.879,26.152]], // Algieba-Adhafera
    [[9.879,26.152],[10.278,16.763]], // Adhafera-Chertan
    [[10.278,16.763],[10.139,11.967]], // Chertan-Regulus (close sickle)
    // Triangle (hindquarters)
    [[10.139,11.967],[11.235,20.524]], // Regulus-Zosma
    [[11.235,20.524],[11.818,14.572]], // Zosma-Denebola (tail)
    [[11.818,14.572],[10.278,16.763]], // Denebola-Chertan (back to body)
  ],

  "Virgo": [
    // Y-shape with Spica at bottom
    [[13.420,-11.161],[12.694,-1.449]], // Spica-Porrima (stem)
    [[12.694,-1.449],[13.037,10.959]], // Porrima-Vindemiatrix (left branch)
    [[12.694,-1.449],[12.333,-0.667]], // Porrima-Zavijava (right branch)
    [[12.333,-0.667],[14.780,1.544]], // Zavijava-Heze (extend right)
    [[14.780,1.544],[14.016,1.545]], // Heze-Zaniah (far right)
  ],

  "Libra": [
    // Balance scales
    [[14.849,-16.042],[15.283,-9.383]], // Zubenelgenubi-Zubeneschamali (beam)
    [[14.849,-16.042],[15.592,-14.789]], // Zubenelgenubi-Zubenelakrab (left pan)
    [[15.283,-9.383],[15.592,-14.789]], // Zubeneschamali-Zubenelakrab (triangle)
    [[15.592,-14.789],[15.061,-25.282]], // Zubenelakrab-Brachium (weight)
  ],

  "Scorpius": [
    // Scorpion with curved tail
    // Head and claws
    [[16.005,-19.805],[16.090,-19.461]], // Dschubba-Pi Sco (head)
    [[16.090,-19.461],[16.490,-26.432]], // Pi Sco-Antares (heart)
    // Body and curved tail
    [[16.490,-26.432],[16.836,-34.293]], // Antares-Sargas
    [[16.836,-34.293],[16.960,-42.998]], // Sargas-Girtab
    [[16.960,-42.998],[17.560,-37.104]], // Girtab-Shaula (curve)
    [[17.560,-37.104],[17.202,-37.296]], // Shaula-Lesath (tail sting)
  ],

  "Sagittarius": [
    // Teapot shape
    [[19.396,-40.616],[18.466,-34.384]], // Kaus Australis-Kaus Borealis (handle side)
    [[18.466,-34.384],[19.093,-21.024]], // Kaus Borealis-Kaus Media (handle top)
    [[19.093,-21.024],[18.921,-26.297]], // Kaus Media-Nunki (lid)
    [[18.921,-26.297],[18.350,-25.422]], // Nunki-Albaldah (spout base)
    [[19.093,-21.024],[19.375,-24.883]], // Kaus Media-Alnasl (spout)
    [[19.375,-24.883],[19.163,-29.880]], // Alnasl-Ascella
    [[19.163,-29.880],[19.396,-40.616]], // Ascella-Kaus Australis (close teapot)
  ],

  "Capricornus": [
    // Sea-goat triangle
    [[21.784,-16.127],[20.350,-12.508]], // Deneb Algedi-Dabih
    [[20.350,-12.508],[21.099,-16.662]], // Dabih-Nashira
    [[21.099,-16.662],[21.784,-16.127]], // Nashira-Deneb Algedi (close triangle)
    [[21.099,-16.662],[20.298,-14.781]], // Nashira-Alshat (tail)
    [[21.784,-16.127],[21.618,-19.466]], // Deneb Algedi-Omega (fin)
  ],

  "Aquarius": [
    // Water jar and flowing stream
    [[22.096,-0.320],[22.361,-1.387]], // Sadalsuud-Sadachbia (jar top)
    [[22.361,-1.387],[22.877,-15.821]], // Sadachbia-Sadalmelik (jar side)
    [[22.877,-15.821],[21.526,-5.571]], // Sadalmelik-Skat (water stream)
    [[21.526,-5.571],[22.825,-7.579]], // Skat-Albali (stream flow)
  ],

  "Pisces": [
    // Two fish connected by cord (V-shape)
    [[1.297,7.890],[1.226,15.346]], // Alrescha-Omega (western fish)
    [[1.226,15.346],[0.811,7.585]], // Omega-Iota (western fish body)
    [[1.297,7.890],[23.666,1.256]], // Alrescha-Gamma (cord)
    [[23.666,1.256],[23.286,3.820]], // Gamma-Eta (eastern fish)
    [[23.286,3.820],[23.666,1.256]], // Eta-Gamma (eastern fish body)
  ],

  // ===================================================================
  // OTHER MAJOR CONSTELLATIONS
  // ===================================================================

  "Orion": [
    // Shoulders (top horizontal)
    [[5.919,7.407],[5.439,6.350]], // Betelgeuse (right shoulder) - Bellatrix (left shoulder)

    // Left side - from Bellatrix down through belt to Rigel
    [[5.439,6.350],[5.533,-0.299]], // Bellatrix - Mintaka (belt west)
    [[5.533,-0.299],[5.242,-8.202]], // Mintaka - Rigel (left foot)

    // Right side - from Betelgeuse down through belt to Saiph
    [[5.919,7.407],[5.679,-1.943]], // Betelgeuse - Alnitak (belt east)
    [[5.679,-1.943],[5.533,-9.670]], // Alnitak - Saiph (right foot)

    // Belt (Orion's Belt) - three stars in a row
    [[5.679,-1.943],[5.603,-1.202]], // Alnitak - Alnilam (center)
    [[5.603,-1.202],[5.533,-0.299]], // Alnilam - Mintaka

    // Feet (bottom horizontal)
    [[5.242,-8.202],[5.533,-9.670]], // Rigel - Saiph

    // Head (Meissa)
    [[5.439,6.350],[5.350,9.934]], // Bellatrix - Meissa
    [[5.919,7.407],[5.350,9.934]], // Betelgeuse - Meissa
  ],

  "Ursa Major": [
    // Big Dipper bowl
    [[11.062,61.751],[11.030,56.382]], // Dubhe-Merak
    [[11.030,56.382],[11.897,53.695]], // Merak-Phecda
    [[11.897,53.695],[12.257,57.032]], // Phecda-Megrez
    [[12.257,57.032],[11.062,61.751]], // Megrez-Dubhe (close bowl)
    // Handle
    [[12.257,57.032],[12.900,55.960]], // Megrez-Alioth
    [[12.900,55.960],[13.398,54.925]], // Alioth-Mizar
    [[13.398,54.925],[13.792,49.313]], // Mizar-Alkaid (tip of handle)
  ],

  "Ursa Minor": [
    // Little Dipper
    [[2.530,89.264],[14.845,74.155]], // Polaris-Kochab (handle to bowl)
    [[14.845,74.155],[15.345,71.834]], // Kochab-Pherkad (bowl)
  ],

  "Cassiopeia": [
    // W shape
    [[0.675,60.717],[0.153,59.150]], // Caph-Schedar
    [[0.153,59.150],[1.430,60.235]], // Schedar-Navi (center)
    [[1.430,60.235],[0.945,60.235]], // Navi-Ruchbah
    [[0.945,60.235],[1.906,63.670]], // Ruchbah-Segin
  ],

  "Cygnus": [
    // Northern Cross
    [[20.691,45.280],[19.748,33.971]], // Deneb-Albireo (long axis)
    [[20.691,45.280],[19.511,51.731]], // Deneb-Delta (top of cross)
    [[19.511,51.731],[19.512,27.960]], // Delta-Sadr (center)
    [[19.512,27.960],[19.748,33.971]], // Sadr-Albireo (complete vertical)
    [[20.371,40.257],[19.512,27.960]], // Gienah-Sadr (cross beam)
  ],

  "Lyra": [
    // Small parallelogram
    [[18.616,38.783],[18.983,32.689]], // Vega-Sheliak
    [[18.616,38.783],[18.746,39.610]], // Vega-Sulafat
    [[18.983,32.689],[18.746,39.610]], // Sheliak-Sulafat (triangle)
  ],

  "Aquila": [
    // Eagle in flight
    [[19.847,8.868],[19.771,1.006]], // Altair-Alshain
    [[19.847,8.868],[19.771,10.613]], // Altair-Tarazed
  ],

  "Boötes": [
    // Kite shape
    [[14.261,19.182],[14.749,27.074]], // Arcturus-Izar
    [[14.749,27.074],[15.032,40.390]], // Izar-Muphrid
    [[15.032,40.390],[13.911,18.398]], // Muphrid-Seginus
    [[13.911,18.398],[14.261,19.182]], // Seginus-Arcturus (close kite)
  ],

  "Perseus": [
    // Hero shape
    [[3.405,49.861],[3.136,40.955]], // Mirfak-Algol
    [[3.405,49.861],[3.902,47.787]], // Mirfak-Gamma
    [[3.902,47.787],[3.079,53.506]], // Gamma-Delta
    [[3.079,53.506],[3.405,49.861]], // Delta-Mirfak (close shape)
  ],

  "Andromeda": [
    // Chain from Pegasus
    [[0.140,29.091],[1.162,35.620]], // Alpheratz-Mirach
    [[1.162,35.620],[2.065,42.330]], // Mirach-Almach
    [[1.162,35.620],[0.657,30.861]], // Mirach-Delta (branch)
  ],

  "Pegasus": [
    // Great Square
    [[23.079,15.205],[23.063,28.083]], // Markab-Scheat
    [[23.063,28.083],[0.140,29.091]], // Scheat-Alpheratz
    [[0.140,29.091],[0.220,15.184]], // Alpheratz-Algenib
    [[0.220,15.184],[23.079,15.205]], // Algenib-Markab (close square)
    // Nose
    [[23.063,28.083],[22.717,10.831]], // Scheat-Enif
  ],

  "Canis Major": [
    // The dog
    [[6.752,-16.716],[6.378,-17.956]], // Sirius-Adhara
    [[6.378,-17.956],[7.140,-26.771]], // Adhara-Wezen
  ],

  "Canis Minor": [
    // Simple pair
    [[7.655,5.225],[7.453,8.289]], // Procyon-Gomeisa
  ],

  "Auriga": [
    // Pentagon with Capella
    [[5.278,45.998],[5.992,44.948]], // Capella-Menkalinan
    [[5.992,44.948],[4.950,43.823]], // Menkalinan-Almaaz
  ],

  "Centaurus": [
    // The Centaur
    [[14.661,-60.835],[14.063,-60.373]], // Rigil Kentaurus-Hadar
    [[14.063,-60.373],[12.139,-50.722]], // Hadar-Menkent
  ],

  "Crux": [
    // Southern Cross
    [[12.443,-63.099],[12.519,-57.113]], // Acrux-Gacrux (vertical)
    [[12.795,-59.689],[12.253,-58.749]], // Mimosa-Delta (horizontal)
  ],

  "Carina": [
    // The Keel
    [[6.399,-52.696],[8.375,-59.509]], // Canopus-Miaplacidus
    [[8.375,-59.509],[9.220,-59.275]], // Miaplacidus-Avior
  ],

  "Draco": [
    // The Dragon
    [[14.073,64.376],[17.943,51.489]], // Thuban-Eltanin
    [[17.943,51.489],[17.507,52.301]], // Eltanin-Rastaban
  ],

  "Ophiuchus": [
    // Serpent bearer
    [[17.582,12.560],[16.961,-10.567]], // Rasalhague-Sabik
  ],

  "Hercules": [
    // Keystone asterism
    [[17.244,14.390],[16.716,31.603]], // Kornephoros-Rasalgethi
    [[16.716,31.603],[17.250,24.839]], // Rasalgethi-Zeta
  ]
};
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
  // Police
  police: true,
  // Roads
  roads: true
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

const car = { x:0, z:0, y:0, angle:0, speed:0, vx:0, vz:0, vy:0, grip:1, onRoad:true, road:null, boost:false, boostTime:0, boostReady:true, boostDecayTime:0, driftAngle:0 };
const keys = {};
let roads = [], roadMeshes = [], buildingMeshes = [], buildings = [], landuses = [], landuseMeshes = [], pois = [], poiMeshes = [], scene, camera, renderer, carMesh, wheelMeshes = [];
let streetFurnitureMeshes = [];
let nearestPOI = null;
let gameStarted = false, paused = false, gameMode = 'free', gameTimer = 0, camMode = 0, selLoc = 'baltimore';
let onMoon = false;          // Are we on the moon?
let travelingToMoon = false; // Currently traveling animation
let moonSurface = null;      // Moon terrain mesh
let earthPosition = null;    // Store Earth position before moon travel
let policeOn = false, police = [], policeMeshes = [], policeHits = 0;
let checkpoints = [], cpMeshes = [], cpCollected = 0;
let destination = null, destMesh = null, trialDone = false;
let customTrack = [], trackMesh = null, isRecording = false;
let lastTime = 0;
// Drone camera variables
let droneMode = false;
const drone = { x: 0, y: 50, z: 0, pitch: 0, yaw: 0, roll: 0, speed: 30 };
// Walking module - will be initialized after THREE is loaded
let Walk = null;

// Time of day system
let timeOfDay = 'day'; // 'day', 'sunset', 'night', 'sunrise'
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
let composer = null, ssaoPass = null, bloomPass = null, smaaPass = null;

// Map / minimap state
let showLargeMap = false;
let largeMapZoom = 14;
let satelliteView = false;
let landUseVisible = true;
let showRoads = true;
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

const BRIGHT_STARS = [
  // ===================================================================
  // ZODIAC CONSTELLATIONS (All 12 - in order along ecliptic)
  // ===================================================================

  // === ARIES (The Ram) - Mar 21-Apr 19 ===
  {ra:2.119,dec:23.463,mag:2.00,dist:66,name:"Hamal",proper:"α Ari",color:0xffcc88,constellation:"Aries"},
  {ra:1.911,dec:20.808,mag:2.64,dist:59,name:"Sheratan",proper:"β Ari",color:0xffffff,constellation:"Aries"},
  {ra:2.656,dec:27.260,mag:3.88,dist:164,name:"Mesarthim",proper:"γ Ari",color:0xffffff,constellation:"Aries"},
  {ra:3.226,dec:19.726,mag:4.35,dist:170,name:"Botein",proper:"δ Ari",color:0xffe4b5,constellation:"Aries"},

  // === TAURUS (The Bull) - Apr 20-May 20 ===
  {ra:4.599,dec:16.509,mag:0.85,dist:65,name:"Aldebaran",proper:"α Tau",color:0xff8844,constellation:"Taurus"},
  {ra:5.438,dec:28.608,mag:2.87,dist:444,name:"Alcyone",proper:"η Tau",color:0xadd8e6,constellation:"Taurus"},  // Pleiades
  {ra:4.476,dec:15.871,mag:1.65,dist:131,name:"Elnath",proper:"β Tau",color:0xb5d4ff,constellation:"Taurus"},
  {ra:5.627,dec:21.143,mag:3.00,dist:150,name:"Electra",proper:"17 Tau",color:0xadd8e6,constellation:"Taurus"},  // Pleiades
  {ra:3.797,dec:24.105,mag:3.53,dist:150,name:"Ain",proper:"ε Tau",color:0xffaa77,constellation:"Taurus"},
  {ra:5.449,dec:24.368,mag:3.70,dist:440,name:"Atlas",proper:"27 Tau",color:0xadd8e6,constellation:"Taurus"},  // Pleiades

  // === GEMINI (The Twins) - May 21-Jun 20 ===
  {ra:7.755,dec:28.026,mag:1.14,dist:34,name:"Pollux",proper:"β Gem",color:0xffcc66,constellation:"Gemini"},
  {ra:7.577,dec:31.888,mag:1.58,dist:51,name:"Castor",proper:"α Gem",color:0xffffff,constellation:"Gemini"},
  {ra:6.628,dec:22.514,mag:1.93,dist:109,name:"Alhena",proper:"γ Gem",color:0xffffff,constellation:"Gemini"},
  {ra:6.383,dec:22.507,mag:2.88,dist:121,name:"Mebsuta",proper:"ε Gem",color:0xffbb77,constellation:"Gemini"},
  {ra:7.068,dec:20.570,mag:3.53,dist:840,name:"Tejat",proper:"μ Gem",color:0xff8866,constellation:"Gemini"},
  {ra:6.248,dec:12.896,mag:3.36,dist:350,name:"Propus",proper:"η Gem",color:0xff6644,constellation:"Gemini"},

  // === CANCER (The Crab) - Jun 21-Jul 22 ===
  {ra:8.975,dec:11.858,mag:3.52,dist:174,name:"Al Tarf",proper:"β Cnc",color:0xffaa77,constellation:"Cancer"},
  {ra:8.722,dec:21.469,mag:3.94,dist:158,name:"Asellus Borealis",proper:"γ Cnc",color:0xffffff,constellation:"Cancer"},
  {ra:8.745,dec:18.154,mag:3.94,dist:136,name:"Asellus Australis",proper:"δ Cnc",color:0xffaa77,constellation:"Cancer"},
  {ra:8.775,dec:28.760,mag:4.02,dist:290,name:"Acubens",proper:"α Cnc",color:0xffffff,constellation:"Cancer"},
  {ra:9.188,dec:12.653,mag:5.43,dist:577,name:"Iota Cancri",proper:"ι Cnc",color:0xffffff,constellation:"Cancer"},

  // === LEO (The Lion) - Jul 23-Aug 22 ===
  {ra:10.139,dec:11.967,mag:1.35,dist:79,name:"Regulus",proper:"α Leo",color:0xd4e4ff,constellation:"Leo"},
  {ra:11.818,dec:14.572,mag:2.14,dist:36,name:"Denebola",proper:"β Leo",color:0xffffff,constellation:"Leo"},
  {ra:9.763,dec:23.774,mag:2.61,dist:130,name:"Algieba",proper:"γ Leo",color:0xffaa77,constellation:"Leo"},
  {ra:11.235,dec:20.524,mag:2.56,dist:58,name:"Zosma",proper:"δ Leo",color:0xffffff,constellation:"Leo"},
  {ra:9.879,dec:26.152,mag:3.44,dist:274,name:"Adhafera",proper:"ζ Leo",color:0xfff4e8,constellation:"Leo"},
  {ra:10.278,dec:16.763,mag:3.33,dist:165,name:"Chertan",proper:"θ Leo",color:0xffffff,constellation:"Leo"},

  // === VIRGO (The Virgin) - Aug 23-Sep 22 ===
  {ra:13.420,dec:-11.161,mag:0.98,dist:250,name:"Spica",proper:"α Vir",color:0xadd8e6,constellation:"Virgo"},
  {ra:12.694,dec:-1.449,mag:2.74,dist:38,name:"Porrima",proper:"γ Vir",color:0xffffff,constellation:"Virgo"},
  {ra:13.037,dec:10.959,mag:2.85,dist:102,name:"Vindemiatrix",proper:"ε Vir",color:0xffbb77,constellation:"Virgo"},
  {ra:14.780,dec:1.544,mag:3.38,dist:74,name:"Heze",proper:"ζ Vir",color:0xffffff,constellation:"Virgo"},
  {ra:12.333,dec:-0.667,mag:3.61,dist:35,name:"Zavijava",proper:"β Vir",color:0xffffff,constellation:"Virgo"},
  {ra:14.016,dec:1.545,mag:3.89,dist:265,name:"Zaniah",proper:"η Vir",color:0xffffff,constellation:"Virgo"},

  // === LIBRA (The Scales) - Sep 23-Oct 22 ===
  {ra:15.283,dec:-9.383,mag:2.61,dist:185,name:"Zubeneschamali",proper:"β Lib",color:0xadd8e6,constellation:"Libra"},
  {ra:14.849,dec:-16.042,mag:2.75,dist:77,name:"Zubenelgenubi",proper:"α Lib",color:0xffffff,constellation:"Libra"},
  {ra:15.592,dec:-14.789,mag:3.29,dist:143,name:"Zubenelakrab",proper:"γ Lib",color:0xffaa77,constellation:"Libra"},
  {ra:15.061,dec:-25.282,mag:3.91,dist:185,name:"Brachium",proper:"σ Lib",color:0xff8866,constellation:"Libra"},

  // === SCORPIUS (The Scorpion) - Oct 23-Nov 21 ===
  {ra:16.490,dec:-26.432,mag:0.96,dist:550,name:"Antares",proper:"α Sco",color:0xff4422,constellation:"Scorpius"},
  {ra:17.560,dec:-37.104,mag:1.63,dist:464,name:"Shaula",proper:"λ Sco",color:0xadd8e6,constellation:"Scorpius"},
  {ra:16.836,dec:-34.293,mag:2.29,dist:700,name:"Sargas",proper:"θ Sco",color:0xfff4e8,constellation:"Scorpius"},
  {ra:16.960,dec:-42.998,mag:2.32,dist:272,name:"Girtab",proper:"κ Sco",color:0xadd8e6,constellation:"Scorpius"},
  {ra:16.005,dec:-19.805,mag:2.32,dist:402,name:"Dschubba",proper:"δ Sco",color:0xadd8e6,constellation:"Scorpius"},
  {ra:16.090,dec:-19.461,mag:2.89,dist:590,name:"Pi Scorpii",proper:"π Sco",color:0xadd8e6,constellation:"Scorpius"},
  {ra:17.202,dec:-37.296,mag:2.70,dist:96,name:"Lesath",proper:"υ Sco",color:0xadd8e6,constellation:"Scorpius"},

  // === SAGITTARIUS (The Archer) - Nov 22-Dec 21 ===
  {ra:19.396,dec:-40.616,mag:1.85,dist:143,name:"Kaus Australis",proper:"ε Sgr",color:0xadd8e6,constellation:"Sagittarius"},
  {ra:18.921,dec:-26.297,mag:2.02,dist:228,name:"Nunki",proper:"σ Sgr",color:0xadd8e6,constellation:"Sagittarius"},
  {ra:19.163,dec:-29.880,mag:2.59,dist:88,name:"Ascella",proper:"ζ Sgr",color:0xffffff,constellation:"Sagittarius"},
  {ra:19.093,dec:-21.024,mag:2.70,dist:306,name:"Kaus Media",proper:"δ Sgr",color:0xffe4b5,constellation:"Sagittarius"},
  {ra:18.466,dec:-34.384,mag:2.81,dist:77,name:"Kaus Borealis",proper:"λ Sgr",color:0xffe4b5,constellation:"Sagittarius"},
  {ra:19.375,dec:-24.883,mag:2.98,dist:96,name:"Alnasl",proper:"γ Sgr",color:0xffaa77,constellation:"Sagittarius"},
  {ra:18.350,dec:-25.422,mag:3.17,dist:120,name:"Albaldah",proper:"π Sgr",color:0xffffff,constellation:"Sagittarius"},

  // === CAPRICORNUS (The Sea-Goat) - Dec 22-Jan 19 ===
  {ra:21.784,dec:-16.127,mag:2.87,dist:39,name:"Deneb Algedi",proper:"δ Cap",color:0xffffff,constellation:"Capricornus"},
  {ra:20.350,dec:-12.508,mag:2.85,dist:344,name:"Dabih",proper:"β Cap",color:0xffaa77,constellation:"Capricornus"},
  {ra:21.099,dec:-16.662,mag:3.57,dist:139,name:"Nashira",proper:"γ Cap",color:0xffffff,constellation:"Capricornus"},
  {ra:20.298,dec:-14.781,mag:4.07,dist:670,name:"Alshat",proper:"ν Cap",color:0xffffff,constellation:"Capricornus"},
  {ra:21.618,dec:-19.466,mag:4.08,dist:290,name:"Omega Capricorni",proper:"ω Cap",color:0xffe4b5,constellation:"Capricornus"},

  // === AQUARIUS (The Water-Bearer) - Jan 20-Feb 18 ===
  {ra:22.096,dec:-0.320,mag:2.91,dist:612,name:"Sadalsuud",proper:"β Aqr",color:0xfff4e8,constellation:"Aquarius"},
  {ra:22.877,dec:-15.821,mag:2.96,dist:758,name:"Sadalmelik",proper:"α Aqr",color:0xfff4e8,constellation:"Aquarius"},
  {ra:21.526,dec:-5.571,mag:3.27,dist:160,name:"Skat",proper:"δ Aqr",color:0xffffff,constellation:"Aquarius"},
  {ra:22.361,dec:-1.387,mag:3.84,dist:319,name:"Sadachbia",proper:"γ Aqr",color:0xffffff,constellation:"Aquarius"},
  {ra:22.825,dec:-7.579,mag:4.01,dist:98,name:"Albali",proper:"ε Aqr",color:0xffffff,constellation:"Aquarius"},

  // === PISCES (The Fishes) - Feb 19-Mar 20 ===
  {ra:1.297,dec:7.890,mag:3.82,dist:139,name:"Alrescha",proper:"α Psc",color:0xffffff,constellation:"Pisces"},
  {ra:23.666,dec:1.256,mag:3.69,dist:294,name:"Gamma Piscium",proper:"γ Psc",color:0xffffff,constellation:"Pisces"},
  {ra:23.286,dec:3.820,mag:3.62,dist:294,name:"Eta Piscium",proper:"η Psc",color:0xfff4e8,constellation:"Pisces"},
  {ra:1.226,dec:15.346,mag:4.33,dist:130,name:"Omega Piscium",proper:"ω Psc",color:0xffffff,constellation:"Pisces"},
  {ra:0.811,dec:7.585,mag:4.28,dist:151,name:"Iota Piscium",proper:"ι Psc",color:0xffffff,constellation:"Pisces"},

  // ===================================================================
  // OTHER MAJOR CONSTELLATIONS
  // ===================================================================

  // === ORION (The Hunter) ===
  {ra:5.919,dec:7.407,mag:0.50,dist:548,name:"Betelgeuse",proper:"α Ori",color:0xff6347,constellation:"Orion"},
  {ra:5.242,dec:-8.202,mag:0.13,dist:863,name:"Rigel",proper:"β Ori",color:0x9bb0ff,constellation:"Orion"},
  {ra:5.439,dec:6.350,mag:1.64,dist:243,name:"Bellatrix",proper:"γ Ori",color:0xb0d0ff,constellation:"Orion"},
  {ra:5.603,dec:-1.202,mag:1.69,dist:2000,name:"Alnilam",proper:"ε Ori",color:0xabc4ff,constellation:"Orion"},  // Belt center
  {ra:5.679,dec:-1.943,mag:1.77,dist:1260,name:"Alnitak",proper:"ζ Ori",color:0xabc4ff,constellation:"Orion"},  // Belt east
  {ra:5.533,dec:-0.299,mag:2.23,dist:1200,name:"Mintaka",proper:"δ Ori",color:0xb5d4ff,constellation:"Orion"},  // Belt west
  {ra:5.533,dec:-9.670,mag:2.06,dist:724,name:"Saiph",proper:"κ Ori",color:0xa0c8ff,constellation:"Orion"},
  {ra:5.350,dec:9.934,mag:3.39,dist:1100,name:"Meissa",proper:"λ Ori",color:0xb0d0ff,constellation:"Orion"},

  // === URSA MAJOR (Big Dipper) ===
  {ra:11.062,dec:61.751,mag:1.79,dist:123,name:"Dubhe",proper:"α UMa",color:0xffcc88,constellation:"Ursa Major"},
  {ra:11.030,dec:56.382,mag:2.37,dist:79,name:"Merak",proper:"β UMa",color:0xffffff,constellation:"Ursa Major"},
  {ra:11.897,dec:53.695,mag:2.44,dist:84,name:"Phecda",proper:"γ UMa",color:0xffffff,constellation:"Ursa Major"},
  {ra:12.257,dec:57.032,mag:3.31,dist:81,name:"Megrez",proper:"δ UMa",color:0xffffff,constellation:"Ursa Major"},
  {ra:12.900,dec:55.960,mag:1.77,dist:81,name:"Alioth",proper:"ε UMa",color:0xffffff,constellation:"Ursa Major"},
  {ra:13.398,dec:54.925,mag:2.27,dist:78,name:"Mizar",proper:"ζ UMa",color:0xffffff,constellation:"Ursa Major"},
  {ra:13.792,dec:49.313,mag:1.86,dist:101,name:"Alkaid",proper:"η UMa",color:0xffffff,constellation:"Ursa Major"},

  // === URSA MINOR (Little Dipper with Polaris) ===
  {ra:2.530,dec:89.264,mag:1.98,dist:433,name:"Polaris",proper:"α UMi",color:0xfff4e8,constellation:"Ursa Minor"},
  {ra:14.845,dec:74.155,mag:2.08,dist:126,name:"Kochab",proper:"β UMi",color:0xffaa77,constellation:"Ursa Minor"},
  {ra:15.345,dec:71.834,mag:3.05,dist:480,name:"Pherkad",proper:"γ UMi",color:0xffffff,constellation:"Ursa Minor"},

  // === CASSIOPEIA (The Queen) ===
  {ra:0.675,dec:60.717,mag:2.27,dist:54,name:"Caph",proper:"β Cas",color:0xffffff,constellation:"Cassiopeia"},
  {ra:0.153,dec:59.150,mag:2.23,dist:229,name:"Schedar",proper:"α Cas",color:0xffcc88,constellation:"Cassiopeia"},
  {ra:1.430,dec:60.235,mag:2.47,dist:613,name:"Navi",proper:"γ Cas",color:0xadd8e6,constellation:"Cassiopeia"},
  {ra:0.945,dec:60.235,mag:2.68,dist:99,name:"Ruchbah",proper:"δ Cas",color:0xffffff,constellation:"Cassiopeia"},
  {ra:1.906,dec:63.670,mag:3.38,dist:442,name:"Segin",proper:"ε Cas",color:0xadd8e6,constellation:"Cassiopeia"},

  // === CYGNUS (The Swan / Northern Cross) ===
  {ra:20.691,dec:45.280,mag:1.25,dist:2615,name:"Deneb",proper:"α Cyg",color:0xffffff,constellation:"Cygnus"},
  {ra:19.512,dec:27.960,mag:2.20,dist:1833,name:"Sadr",proper:"γ Cyg",color:0xfff4e8,constellation:"Cygnus"},
  {ra:20.371,dec:40.257,mag:2.46,dist:72,name:"Gienah",proper:"ε Cyg",color:0xffaa77,constellation:"Cygnus"},
  {ra:19.511,dec:51.731,mag:2.87,dist:165,name:"Delta Cygni",proper:"δ Cyg",color:0xadd8e6,constellation:"Cygnus"},
  {ra:19.748,dec:33.971,mag:2.48,dist:390,name:"Albireo",proper:"β Cyg",color:0xffaa77,constellation:"Cygnus"},

  // === BOÖTES (The Herdsman) ===
  {ra:14.261,dec:19.182,mag:-0.05,dist:37,name:"Arcturus",proper:"α Boo",color:0xff8c00,constellation:"Boötes"},
  {ra:14.749,dec:27.074,mag:2.37,dist:203,name:"Izar",proper:"ε Boo",color:0xffaa77,constellation:"Boötes"},
  {ra:15.032,dec:40.390,mag:2.68,dist:37,name:"Muphrid",proper:"η Boo",color:0xfff4e8,constellation:"Boötes"},
  {ra:13.911,dec:18.398,mag:3.03,dist:225,name:"Seginus",proper:"γ Boo",color:0xffffff,constellation:"Boötes"},

  // === LYRA (The Lyre) ===
  {ra:18.616,dec:38.783,mag:0.03,dist:25,name:"Vega",proper:"α Lyr",color:0xffffff,constellation:"Lyra"},
  {ra:18.983,dec:32.689,mag:3.45,dist:960,name:"Sheliak",proper:"β Lyr",color:0xffffff,constellation:"Lyra"},
  {ra:18.746,dec:39.610,mag:3.24,dist:620,name:"Sulafat",proper:"γ Lyr",color:0xadd8e6,constellation:"Lyra"},

  // === AQUILA (The Eagle) ===
  {ra:19.847,dec:8.868,mag:0.77,dist:17,name:"Altair",proper:"α Aql",color:0xffffff,constellation:"Aquila"},
  {ra:19.771,dec:1.006,mag:2.72,dist:45,name:"Alshain",proper:"β Aql",color:0xffffff,constellation:"Aquila"},
  {ra:19.771,dec:10.613,mag:2.99,dist:461,name:"Tarazed",proper:"γ Aql",color:0xffaa77,constellation:"Aquila"},

  // === PERSEUS (The Hero) ===
  {ra:3.405,dec:49.861,mag:1.80,dist:510,name:"Mirfak",proper:"α Per",color:0xfff4e8,constellation:"Perseus"},
  {ra:3.136,dec:40.955,mag:2.12,dist:93,name:"Algol",proper:"β Per",color:0xffffff,constellation:"Perseus"},
  {ra:3.902,dec:47.787,mag:2.93,dist:243,name:"Gamma Persei",proper:"γ Per",color:0xffffff,constellation:"Perseus"},
  {ra:3.079,dec:53.506,mag:3.01,dist:520,name:"Delta Persei",proper:"δ Per",color:0xadd8e6,constellation:"Perseus"},

  // === ANDROMEDA (The Princess) ===
  {ra:0.140,dec:29.091,mag:2.06,dist:97,name:"Alpheratz",proper:"α And",color:0xffffff,constellation:"Andromeda"},
  {ra:1.162,dec:35.620,mag:2.06,dist:200,name:"Mirach",proper:"β And",color:0xff8866,constellation:"Andromeda"},
  {ra:2.065,dec:42.330,mag:2.26,dist:355,name:"Almach",proper:"γ And",color:0xffaa77,constellation:"Andromeda"},
  {ra:0.657,dec:30.861,mag:3.27,dist:101,name:"Delta Andromedae",proper:"δ And",color:0xffaa77,constellation:"Andromeda"},

  // === PEGASUS (The Winged Horse) ===
  {ra:23.079,dec:15.205,mag:2.49,dist:133,name:"Markab",proper:"α Peg",color:0xadd8e6,constellation:"Pegasus"},
  {ra:23.063,dec:28.083,mag:2.42,dist:196,name:"Scheat",proper:"β Peg",color:0xff8866,constellation:"Pegasus"},
  {ra:0.220,dec:15.184,mag:2.83,dist:391,name:"Algenib",proper:"γ Peg",color:0xadd8e6,constellation:"Pegasus"},
  {ra:22.717,dec:10.831,mag:2.39,dist:672,name:"Enif",proper:"ε Peg",color:0xffaa77,constellation:"Pegasus"},

  // === CANIS MAJOR (The Great Dog) ===
  {ra:6.752,dec:-16.716,mag:-1.46,dist:8.6,name:"Sirius",proper:"α CMa",color:0xffffff,constellation:"Canis Major"},
  {ra:6.378,dec:-17.956,mag:1.50,dist:500,name:"Adhara",proper:"ε CMa",color:0xadd8e6,constellation:"Canis Major"},
  {ra:7.140,dec:-26.771,mag:1.83,dist:405,name:"Wezen",proper:"δ CMa",color:0xfff4e8,constellation:"Canis Major"},

  // === CANIS MINOR (The Lesser Dog) ===
  {ra:7.655,dec:5.225,mag:0.38,dist:11.5,name:"Procyon",proper:"α CMi",color:0xfff8dc,constellation:"Canis Minor"},
  {ra:7.453,dec:8.289,mag:2.90,dist:170,name:"Gomeisa",proper:"β CMi",color:0xffffff,constellation:"Canis Minor"},

  // === AURIGA (The Charioteer) ===
  {ra:5.278,dec:45.998,mag:0.08,dist:42,name:"Capella",proper:"α Aur",color:0xfff5e1,constellation:"Auriga"},
  {ra:5.992,dec:44.948,mag:1.90,dist:82,name:"Menkalinan",proper:"β Aur",color:0xffffff,constellation:"Auriga"},
  {ra:4.950,dec:43.823,mag:2.69,dist:512,name:"Almaaz",proper:"ε Aur",color:0xffffff,constellation:"Auriga"},

  // === CENTAURUS (The Centaur) ===
  {ra:14.661,dec:-60.835,mag:-0.27,dist:4.37,name:"Rigil Kentaurus",proper:"α Cen",color:0xfff4e6,constellation:"Centaurus"},
  {ra:14.063,dec:-60.373,mag:0.61,dist:525,name:"Hadar",proper:"β Cen",color:0xadd8e6,constellation:"Centaurus"},
  {ra:12.139,dec:-50.722,mag:2.17,dist:61,name:"Menkent",proper:"θ Cen",color:0xffaa77,constellation:"Centaurus"},

  // === CRUX (Southern Cross) ===
  {ra:12.443,dec:-63.099,mag:0.77,dist:321,name:"Acrux",proper:"α Cru",color:0xadd8e6,constellation:"Crux"},
  {ra:12.795,dec:-59.689,mag:1.25,dist:280,name:"Mimosa",proper:"β Cru",color:0xadd8e6,constellation:"Crux"},
  {ra:12.519,dec:-57.113,mag:1.63,dist:88,name:"Gacrux",proper:"γ Cru",color:0xff6644,constellation:"Crux"},
  {ra:12.253,dec:-58.749,mag:2.80,dist:345,name:"Delta Crucis",proper:"δ Cru",color:0xadd8e6,constellation:"Crux"},

  // === CARINA (The Keel) ===
  {ra:6.399,dec:-52.696,mag:-0.72,dist:310,name:"Canopus",proper:"α Car",color:0xfff4e8,constellation:"Carina"},
  {ra:8.375,dec:-59.509,mag:1.68,dist:113,name:"Miaplacidus",proper:"β Car",color:0xffffff,constellation:"Carina"},
  {ra:9.220,dec:-59.275,mag:1.86,dist:632,name:"Avior",proper:"ε Car",color:0xffaa77,constellation:"Carina"},

  // === ERIDANUS (The River) ===
  {ra:1.628,dec:-57.237,mag:0.46,dist:139,name:"Achernar",proper:"α Eri",color:0xadd8e6,constellation:"Eridanus"},
  {ra:3.549,dec:-9.458,mag:2.95,dist:143,name:"Cursa",proper:"β Eri",color:0xffffff,constellation:"Eridanus"},

  // === PISCIS AUSTRINUS (The Southern Fish) ===
  {ra:22.961,dec:-29.622,mag:1.16,dist:25,name:"Fomalhaut",proper:"α PsA",color:0xffffff,constellation:"Piscis Austrinus"},

  // === DRACO (The Dragon) ===
  {ra:14.073,dec:64.376,mag:3.65,dist:303,name:"Thuban",proper:"α Dra",color:0xffffff,constellation:"Draco"},
  {ra:17.943,dec:51.489,mag:2.79,dist:380,name:"Eltanin",proper:"γ Dra",color:0xffaa77,constellation:"Draco"},
  {ra:17.507,dec:52.301,mag:2.73,dist:362,name:"Rastaban",proper:"β Dra",color:0xfff4e8,constellation:"Draco"},

  // === OPHIUCHUS (The Serpent Bearer) ===
  {ra:17.582,dec:12.560,mag:2.08,dist:47,name:"Rasalhague",proper:"α Oph",color:0xffffff,constellation:"Ophiuchus"},
  {ra:16.961,dec:-10.567,mag:2.43,dist:170,name:"Sabik",proper:"η Oph",color:0xffffff,constellation:"Ophiuchus"},

  // === HERCULES (The Hero) ===
  {ra:17.244,dec:14.390,mag:2.77,dist:139,name:"Kornephoros",proper:"β Her",color:0xfff4e8,constellation:"Hercules"},
  {ra:16.716,dec:31.603,mag:3.48,dist:359,name:"Rasalgethi",proper:"α Her",color:0xff8866,constellation:"Hercules"},
  {ra:17.250,dec:24.839,mag:2.81,dist:35,name:"Zeta Herculis",proper:"ζ Her",color:0xfff4e8,constellation:"Hercules"}
];
// ========================================================================
// CONSTELLATION LINE DEFINITIONS
// Each array contains pairs of [RA, Dec] coordinates to connect with lines
// Based on traditional IAU constellation patterns
// ========================================================================

const CONSTELLATION_LINES = {
  // ===================================================================
  // ZODIAC CONSTELLATIONS
  // ===================================================================

  "Aries": [
    // Triangle shape
    [[2.119,23.463],[1.911,20.808]], // Hamal-Sheratan
    [[1.911,20.808],[2.656,27.260]], // Sheratan-Mesarthim
    [[2.656,27.260],[2.119,23.463]], // Mesarthim-Hamal (close triangle)
    [[2.119,23.463],[3.226,19.726]], // Hamal-Botein (extension)
  ],

  "Taurus": [
    // V-shaped head (Hyades cluster)
    [[4.599,16.509],[3.797,24.105]], // Aldebaran-Ain
    [[4.599,16.509],[4.476,15.871]], // Aldebaran-Elnath (horn)
    // Connection to Pleiades
    [[3.797,24.105],[5.438,28.608]], // Ain-Alcyone (Pleiades)
    [[5.438,28.608],[5.449,24.368]], // Alcyone-Atlas (Pleiades cluster)
    [[5.438,28.608],[5.627,21.143]], // Alcyone-Electra (Pleiades)
  ],

  "Gemini": [
    // The two parallel twins
    [[7.755,28.026],[7.577,31.888]], // Pollux-Castor (heads)
    [[7.755,28.026],[6.628,22.514]], // Pollux-Alhena (Pollux's body)
    [[6.628,22.514],[6.383,22.507]], // Alhena-Mebsuta
    [[6.383,22.507],[6.248,12.896]], // Mebsuta-Propus (foot)
    [[7.577,31.888],[7.068,20.570]], // Castor-Tejat (Castor's body)
    [[7.068,20.570],[6.628,22.514]], // Tejat-Alhena (connecting twins)
  ],

  "Cancer": [
    // Upside-down Y shape
    [[8.975,11.858],[8.775,28.760]], // Al Tarf-Acubens (left arm)
    [[8.975,11.858],[8.745,18.154]], // Al Tarf-Asellus Australis (center)
    [[8.745,18.154],[8.722,21.469]], // Asellus Australis-Asellus Borealis
    [[8.722,21.469],[9.188,12.653]], // Asellus Borealis-Iota (right side)
  ],

  "Leo": [
    // The Lion - Sickle (head) and triangle (body)
    // Sickle (backwards question mark)
    [[10.139,11.967],[9.763,23.774]], // Regulus-Algieba
    [[9.763,23.774],[9.879,26.152]], // Algieba-Adhafera
    [[9.879,26.152],[10.278,16.763]], // Adhafera-Chertan
    [[10.278,16.763],[10.139,11.967]], // Chertan-Regulus (close sickle)
    // Triangle (hindquarters)
    [[10.139,11.967],[11.235,20.524]], // Regulus-Zosma
    [[11.235,20.524],[11.818,14.572]], // Zosma-Denebola (tail)
    [[11.818,14.572],[10.278,16.763]], // Denebola-Chertan (back to body)
  ],

  "Virgo": [
    // Y-shape with Spica at bottom
    [[13.420,-11.161],[12.694,-1.449]], // Spica-Porrima (stem)
    [[12.694,-1.449],[13.037,10.959]], // Porrima-Vindemiatrix (left branch)
    [[12.694,-1.449],[12.333,-0.667]], // Porrima-Zavijava (right branch)
    [[12.333,-0.667],[14.780,1.544]], // Zavijava-Heze (extend right)
    [[14.780,1.544],[14.016,1.545]], // Heze-Zaniah (far right)
  ],

  "Libra": [
    // Balance scales
    [[14.849,-16.042],[15.283,-9.383]], // Zubenelgenubi-Zubeneschamali (beam)
    [[14.849,-16.042],[15.592,-14.789]], // Zubenelgenubi-Zubenelakrab (left pan)
    [[15.283,-9.383],[15.592,-14.789]], // Zubeneschamali-Zubenelakrab (triangle)
    [[15.592,-14.789],[15.061,-25.282]], // Zubenelakrab-Brachium (weight)
  ],

  "Scorpius": [
    // Scorpion with curved tail
    // Head and claws
    [[16.005,-19.805],[16.090,-19.461]], // Dschubba-Pi Sco (head)
    [[16.090,-19.461],[16.490,-26.432]], // Pi Sco-Antares (heart)
    // Body and curved tail
    [[16.490,-26.432],[16.836,-34.293]], // Antares-Sargas
    [[16.836,-34.293],[16.960,-42.998]], // Sargas-Girtab
    [[16.960,-42.998],[17.560,-37.104]], // Girtab-Shaula (curve)
    [[17.560,-37.104],[17.202,-37.296]], // Shaula-Lesath (tail sting)
  ],

  "Sagittarius": [
    // Teapot shape
    [[19.396,-40.616],[18.466,-34.384]], // Kaus Australis-Kaus Borealis (handle side)
    [[18.466,-34.384],[19.093,-21.024]], // Kaus Borealis-Kaus Media (handle top)
    [[19.093,-21.024],[18.921,-26.297]], // Kaus Media-Nunki (lid)
    [[18.921,-26.297],[18.350,-25.422]], // Nunki-Albaldah (spout base)
    [[19.093,-21.024],[19.375,-24.883]], // Kaus Media-Alnasl (spout)
    [[19.375,-24.883],[19.163,-29.880]], // Alnasl-Ascella
    [[19.163,-29.880],[19.396,-40.616]], // Ascella-Kaus Australis (close teapot)
  ],

  "Capricornus": [
    // Sea-goat triangle
    [[21.784,-16.127],[20.350,-12.508]], // Deneb Algedi-Dabih
    [[20.350,-12.508],[21.099,-16.662]], // Dabih-Nashira
    [[21.099,-16.662],[21.784,-16.127]], // Nashira-Deneb Algedi (close triangle)
    [[21.099,-16.662],[20.298,-14.781]], // Nashira-Alshat (tail)
    [[21.784,-16.127],[21.618,-19.466]], // Deneb Algedi-Omega (fin)
  ],

  "Aquarius": [
    // Water jar and flowing stream
    [[22.096,-0.320],[22.361,-1.387]], // Sadalsuud-Sadachbia (jar top)
    [[22.361,-1.387],[22.877,-15.821]], // Sadachbia-Sadalmelik (jar side)
    [[22.877,-15.821],[21.526,-5.571]], // Sadalmelik-Skat (water stream)
    [[21.526,-5.571],[22.825,-7.579]], // Skat-Albali (stream flow)
  ],

  "Pisces": [
    // Two fish connected by cord (V-shape)
    [[1.297,7.890],[1.226,15.346]], // Alrescha-Omega (western fish)
    [[1.226,15.346],[0.811,7.585]], // Omega-Iota (western fish body)
    [[1.297,7.890],[23.666,1.256]], // Alrescha-Gamma (cord)
    [[23.666,1.256],[23.286,3.820]], // Gamma-Eta (eastern fish)
    [[23.286,3.820],[23.666,1.256]], // Eta-Gamma (eastern fish body)
  ],

  // ===================================================================
  // OTHER MAJOR CONSTELLATIONS
  // ===================================================================

  "Orion": [
    // Shoulders (top horizontal)
    [[5.919,7.407],[5.439,6.350]], // Betelgeuse (right shoulder) - Bellatrix (left shoulder)

    // Left side - from Bellatrix down through belt to Rigel
    [[5.439,6.350],[5.533,-0.299]], // Bellatrix - Mintaka (belt west)
    [[5.533,-0.299],[5.242,-8.202]], // Mintaka - Rigel (left foot)

    // Right side - from Betelgeuse down through belt to Saiph
    [[5.919,7.407],[5.679,-1.943]], // Betelgeuse - Alnitak (belt east)
    [[5.679,-1.943],[5.533,-9.670]], // Alnitak - Saiph (right foot)

    // Belt (Orion's Belt) - three stars in a row
    [[5.679,-1.943],[5.603,-1.202]], // Alnitak - Alnilam (center)
    [[5.603,-1.202],[5.533,-0.299]], // Alnilam - Mintaka

    // Feet (bottom horizontal)
    [[5.242,-8.202],[5.533,-9.670]], // Rigel - Saiph

    // Head (Meissa)
    [[5.439,6.350],[5.350,9.934]], // Bellatrix - Meissa
    [[5.919,7.407],[5.350,9.934]], // Betelgeuse - Meissa
  ],

  "Ursa Major": [
    // Big Dipper bowl
    [[11.062,61.751],[11.030,56.382]], // Dubhe-Merak
    [[11.030,56.382],[11.897,53.695]], // Merak-Phecda
    [[11.897,53.695],[12.257,57.032]], // Phecda-Megrez
    [[12.257,57.032],[11.062,61.751]], // Megrez-Dubhe (close bowl)
    // Handle
    [[12.257,57.032],[12.900,55.960]], // Megrez-Alioth
    [[12.900,55.960],[13.398,54.925]], // Alioth-Mizar
    [[13.398,54.925],[13.792,49.313]], // Mizar-Alkaid (tip of handle)
  ],

  "Ursa Minor": [
    // Little Dipper
    [[2.530,89.264],[14.845,74.155]], // Polaris-Kochab (handle to bowl)
    [[14.845,74.155],[15.345,71.834]], // Kochab-Pherkad (bowl)
  ],

  "Cassiopeia": [
    // W shape
    [[0.675,60.717],[0.153,59.150]], // Caph-Schedar
    [[0.153,59.150],[1.430,60.235]], // Schedar-Navi (center)
    [[1.430,60.235],[0.945,60.235]], // Navi-Ruchbah
    [[0.945,60.235],[1.906,63.670]], // Ruchbah-Segin
  ],

  "Cygnus": [
    // Northern Cross
    [[20.691,45.280],[19.748,33.971]], // Deneb-Albireo (long axis)
    [[20.691,45.280],[19.511,51.731]], // Deneb-Delta (top of cross)
    [[19.511,51.731],[19.512,27.960]], // Delta-Sadr (center)
    [[19.512,27.960],[19.748,33.971]], // Sadr-Albireo (complete vertical)
    [[20.371,40.257],[19.512,27.960]], // Gienah-Sadr (cross beam)
  ],

  "Lyra": [
    // Small parallelogram
    [[18.616,38.783],[18.983,32.689]], // Vega-Sheliak
    [[18.616,38.783],[18.746,39.610]], // Vega-Sulafat
    [[18.983,32.689],[18.746,39.610]], // Sheliak-Sulafat (triangle)
  ],

  "Aquila": [
    // Eagle in flight
    [[19.847,8.868],[19.771,1.006]], // Altair-Alshain
    [[19.847,8.868],[19.771,10.613]], // Altair-Tarazed
  ],

  "Boötes": [
    // Kite shape
    [[14.261,19.182],[14.749,27.074]], // Arcturus-Izar
    [[14.749,27.074],[15.032,40.390]], // Izar-Muphrid
    [[15.032,40.390],[13.911,18.398]], // Muphrid-Seginus
    [[13.911,18.398],[14.261,19.182]], // Seginus-Arcturus (close kite)
  ],

  "Perseus": [
    // Hero shape
    [[3.405,49.861],[3.136,40.955]], // Mirfak-Algol
    [[3.405,49.861],[3.902,47.787]], // Mirfak-Gamma
    [[3.902,47.787],[3.079,53.506]], // Gamma-Delta
    [[3.079,53.506],[3.405,49.861]], // Delta-Mirfak (close shape)
  ],

  "Andromeda": [
    // Chain from Pegasus
    [[0.140,29.091],[1.162,35.620]], // Alpheratz-Mirach
    [[1.162,35.620],[2.065,42.330]], // Mirach-Almach
    [[1.162,35.620],[0.657,30.861]], // Mirach-Delta (branch)
  ],

  "Pegasus": [
    // Great Square
    [[23.079,15.205],[23.063,28.083]], // Markab-Scheat
    [[23.063,28.083],[0.140,29.091]], // Scheat-Alpheratz
    [[0.140,29.091],[0.220,15.184]], // Alpheratz-Algenib
    [[0.220,15.184],[23.079,15.205]], // Algenib-Markab (close square)
    // Nose
    [[23.063,28.083],[22.717,10.831]], // Scheat-Enif
  ],

  "Canis Major": [
    // The dog
    [[6.752,-16.716],[6.378,-17.956]], // Sirius-Adhara
    [[6.378,-17.956],[7.140,-26.771]], // Adhara-Wezen
  ],

  "Canis Minor": [
    // Simple pair
    [[7.655,5.225],[7.453,8.289]], // Procyon-Gomeisa
  ],

  "Auriga": [
    // Pentagon with Capella
    [[5.278,45.998],[5.992,44.948]], // Capella-Menkalinan
    [[5.992,44.948],[4.950,43.823]], // Menkalinan-Almaaz
  ],

  "Centaurus": [
    // The Centaur
    [[14.661,-60.835],[14.063,-60.373]], // Rigil Kentaurus-Hadar
    [[14.063,-60.373],[12.139,-50.722]], // Hadar-Menkent
  ],

  "Crux": [
    // Southern Cross
    [[12.443,-63.099],[12.519,-57.113]], // Acrux-Gacrux (vertical)
    [[12.795,-59.689],[12.253,-58.749]], // Mimosa-Delta (horizontal)
  ],

  "Carina": [
    // The Keel
    [[6.399,-52.696],[8.375,-59.509]], // Canopus-Miaplacidus
    [[8.375,-59.509],[9.220,-59.275]], // Miaplacidus-Avior
  ],

  "Draco": [
    // The Dragon
    [[14.073,64.376],[17.943,51.489]], // Thuban-Eltanin
    [[17.943,51.489],[17.507,52.301]], // Eltanin-Rastaban
  ],

  "Ophiuchus": [
    // Serpent bearer
    [[17.582,12.560],[16.961,-10.567]], // Rasalhague-Sabik
  ],

  "Hercules": [
    // Keystone asterism
    [[17.244,14.390],[16.716,31.603]], // Kornephoros-Rasalgethi
    [[16.716,31.603],[17.250,24.839]], // Rasalgethi-Zeta
  ]
};
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
  // Police
  police: true,
  // Roads
  roads: true
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

const car = { x:0, z:0, y:0, angle:0, speed:0, vx:0, vz:0, vy:0, grip:1, onRoad:true, road:null, boost:false, boostTime:0, boostReady:true, boostDecayTime:0, driftAngle:0 };
const keys = {};
let roads = [], roadMeshes = [], buildingMeshes = [], buildings = [], landuses = [], landuseMeshes = [], pois = [], poiMeshes = [], scene, camera, renderer, carMesh, wheelMeshes = [];
let streetFurnitureMeshes = [];
let nearestPOI = null;
let gameStarted = false, paused = false, gameMode = 'free', gameTimer = 0, camMode = 0, selLoc = 'baltimore';
let onMoon = false;          // Are we on the moon?
let travelingToMoon = false; // Currently traveling animation
let moonSurface = null;      // Moon terrain mesh
let earthPosition = null;    // Store Earth position before moon travel
let policeOn = false, police = [], policeMeshes = [], policeHits = 0;
let checkpoints = [], cpMeshes = [], cpCollected = 0;
let destination = null, destMesh = null, trialDone = false;
let customTrack = [], trackMesh = null, isRecording = false;
let lastTime = 0;
// Drone camera variables
let droneMode = false;
const drone = { x: 0, y: 50, z: 0, pitch: 0, yaw: 0, roll: 0, speed: 30 };
// Walking module - will be initialized after THREE is loaded
let Walk = null;

// Time of day system
let timeOfDay = 'day'; // 'day', 'sunset', 'night', 'sunrise'
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

// Map / minimap state
let showLargeMap = false;
let largeMapZoom = 14;
let satelliteView = false;
let landUseVisible = true;
let showRoads = true;
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

const BRIGHT_STARS = [
  // ===================================================================
  // ZODIAC CONSTELLATIONS (All 12 - in order along ecliptic)
  // ===================================================================

  // === ARIES (The Ram) - Mar 21-Apr 19 ===
  {ra:2.119,dec:23.463,mag:2.00,dist:66,name:"Hamal",proper:"α Ari",color:0xffcc88,constellation:"Aries"},
  {ra:1.911,dec:20.808,mag:2.64,dist:59,name:"Sheratan",proper:"β Ari",color:0xffffff,constellation:"Aries"},
  {ra:2.656,dec:27.260,mag:3.88,dist:164,name:"Mesarthim",proper:"γ Ari",color:0xffffff,constellation:"Aries"},
  {ra:3.226,dec:19.726,mag:4.35,dist:170,name:"Botein",proper:"δ Ari",color:0xffe4b5,constellation:"Aries"},

  // === TAURUS (The Bull) - Apr 20-May 20 ===
  {ra:4.599,dec:16.509,mag:0.85,dist:65,name:"Aldebaran",proper:"α Tau",color:0xff8844,constellation:"Taurus"},
  {ra:5.438,dec:28.608,mag:2.87,dist:444,name:"Alcyone",proper:"η Tau",color:0xadd8e6,constellation:"Taurus"},  // Pleiades
  {ra:4.476,dec:15.871,mag:1.65,dist:131,name:"Elnath",proper:"β Tau",color:0xb5d4ff,constellation:"Taurus"},
  {ra:5.627,dec:21.143,mag:3.00,dist:150,name:"Electra",proper:"17 Tau",color:0xadd8e6,constellation:"Taurus"},  // Pleiades
  {ra:3.797,dec:24.105,mag:3.53,dist:150,name:"Ain",proper:"ε Tau",color:0xffaa77,constellation:"Taurus"},
  {ra:5.449,dec:24.368,mag:3.70,dist:440,name:"Atlas",proper:"27 Tau",color:0xadd8e6,constellation:"Taurus"},  // Pleiades

  // === GEMINI (The Twins) - May 21-Jun 20 ===
  {ra:7.755,dec:28.026,mag:1.14,dist:34,name:"Pollux",proper:"β Gem",color:0xffcc66,constellation:"Gemini"},
  {ra:7.577,dec:31.888,mag:1.58,dist:51,name:"Castor",proper:"α Gem",color:0xffffff,constellation:"Gemini"},
  {ra:6.628,dec:22.514,mag:1.93,dist:109,name:"Alhena",proper:"γ Gem",color:0xffffff,constellation:"Gemini"},
  {ra:6.383,dec:22.507,mag:2.88,dist:121,name:"Mebsuta",proper:"ε Gem",color:0xffbb77,constellation:"Gemini"},
  {ra:7.068,dec:20.570,mag:3.53,dist:840,name:"Tejat",proper:"μ Gem",color:0xff8866,constellation:"Gemini"},
  {ra:6.248,dec:12.896,mag:3.36,dist:350,name:"Propus",proper:"η Gem",color:0xff6644,constellation:"Gemini"},

  // === CANCER (The Crab) - Jun 21-Jul 22 ===
  {ra:8.975,dec:11.858,mag:3.52,dist:174,name:"Al Tarf",proper:"β Cnc",color:0xffaa77,constellation:"Cancer"},
  {ra:8.722,dec:21.469,mag:3.94,dist:158,name:"Asellus Borealis",proper:"γ Cnc",color:0xffffff,constellation:"Cancer"},
  {ra:8.745,dec:18.154,mag:3.94,dist:136,name:"Asellus Australis",proper:"δ Cnc",color:0xffaa77,constellation:"Cancer"},
  {ra:8.775,dec:28.760,mag:4.02,dist:290,name:"Acubens",proper:"α Cnc",color:0xffffff,constellation:"Cancer"},
  {ra:9.188,dec:12.653,mag:5.43,dist:577,name:"Iota Cancri",proper:"ι Cnc",color:0xffffff,constellation:"Cancer"},

  // === LEO (The Lion) - Jul 23-Aug 22 ===
  {ra:10.139,dec:11.967,mag:1.35,dist:79,name:"Regulus",proper:"α Leo",color:0xd4e4ff,constellation:"Leo"},
  {ra:11.818,dec:14.572,mag:2.14,dist:36,name:"Denebola",proper:"β Leo",color:0xffffff,constellation:"Leo"},
  {ra:9.763,dec:23.774,mag:2.61,dist:130,name:"Algieba",proper:"γ Leo",color:0xffaa77,constellation:"Leo"},
  {ra:11.235,dec:20.524,mag:2.56,dist:58,name:"Zosma",proper:"δ Leo",color:0xffffff,constellation:"Leo"},
  {ra:9.879,dec:26.152,mag:3.44,dist:274,name:"Adhafera",proper:"ζ Leo",color:0xfff4e8,constellation:"Leo"},
  {ra:10.278,dec:16.763,mag:3.33,dist:165,name:"Chertan",proper:"θ Leo",color:0xffffff,constellation:"Leo"},

  // === VIRGO (The Virgin) - Aug 23-Sep 22 ===
  {ra:13.420,dec:-11.161,mag:0.98,dist:250,name:"Spica",proper:"α Vir",color:0xadd8e6,constellation:"Virgo"},
  {ra:12.694,dec:-1.449,mag:2.74,dist:38,name:"Porrima",proper:"γ Vir",color:0xffffff,constellation:"Virgo"},
  {ra:13.037,dec:10.959,mag:2.85,dist:102,name:"Vindemiatrix",proper:"ε Vir",color:0xffbb77,constellation:"Virgo"},
  {ra:14.780,dec:1.544,mag:3.38,dist:74,name:"Heze",proper:"ζ Vir",color:0xffffff,constellation:"Virgo"},
  {ra:12.333,dec:-0.667,mag:3.61,dist:35,name:"Zavijava",proper:"β Vir",color:0xffffff,constellation:"Virgo"},
  {ra:14.016,dec:1.545,mag:3.89,dist:265,name:"Zaniah",proper:"η Vir",color:0xffffff,constellation:"Virgo"},

  // === LIBRA (The Scales) - Sep 23-Oct 22 ===
  {ra:15.283,dec:-9.383,mag:2.61,dist:185,name:"Zubeneschamali",proper:"β Lib",color:0xadd8e6,constellation:"Libra"},
  {ra:14.849,dec:-16.042,mag:2.75,dist:77,name:"Zubenelgenubi",proper:"α Lib",color:0xffffff,constellation:"Libra"},
  {ra:15.592,dec:-14.789,mag:3.29,dist:143,name:"Zubenelakrab",proper:"γ Lib",color:0xffaa77,constellation:"Libra"},
  {ra:15.061,dec:-25.282,mag:3.91,dist:185,name:"Brachium",proper:"σ Lib",color:0xff8866,constellation:"Libra"},

  // === SCORPIUS (The Scorpion) - Oct 23-Nov 21 ===
  {ra:16.490,dec:-26.432,mag:0.96,dist:550,name:"Antares",proper:"α Sco",color:0xff4422,constellation:"Scorpius"},
  {ra:17.560,dec:-37.104,mag:1.63,dist:464,name:"Shaula",proper:"λ Sco",color:0xadd8e6,constellation:"Scorpius"},
  {ra:16.836,dec:-34.293,mag:2.29,dist:700,name:"Sargas",proper:"θ Sco",color:0xfff4e8,constellation:"Scorpius"},
  {ra:16.960,dec:-42.998,mag:2.32,dist:272,name:"Girtab",proper:"κ Sco",color:0xadd8e6,constellation:"Scorpius"},
  {ra:16.005,dec:-19.805,mag:2.32,dist:402,name:"Dschubba",proper:"δ Sco",color:0xadd8e6,constellation:"Scorpius"},
  {ra:16.090,dec:-19.461,mag:2.89,dist:590,name:"Pi Scorpii",proper:"π Sco",color:0xadd8e6,constellation:"Scorpius"},
  {ra:17.202,dec:-37.296,mag:2.70,dist:96,name:"Lesath",proper:"υ Sco",color:0xadd8e6,constellation:"Scorpius"},

  // === SAGITTARIUS (The Archer) - Nov 22-Dec 21 ===
  {ra:19.396,dec:-40.616,mag:1.85,dist:143,name:"Kaus Australis",proper:"ε Sgr",color:0xadd8e6,constellation:"Sagittarius"},
  {ra:18.921,dec:-26.297,mag:2.02,dist:228,name:"Nunki",proper:"σ Sgr",color:0xadd8e6,constellation:"Sagittarius"},
  {ra:19.163,dec:-29.880,mag:2.59,dist:88,name:"Ascella",proper:"ζ Sgr",color:0xffffff,constellation:"Sagittarius"},
  {ra:19.093,dec:-21.024,mag:2.70,dist:306,name:"Kaus Media",proper:"δ Sgr",color:0xffe4b5,constellation:"Sagittarius"},
  {ra:18.466,dec:-34.384,mag:2.81,dist:77,name:"Kaus Borealis",proper:"λ Sgr",color:0xffe4b5,constellation:"Sagittarius"},
  {ra:19.375,dec:-24.883,mag:2.98,dist:96,name:"Alnasl",proper:"γ Sgr",color:0xffaa77,constellation:"Sagittarius"},
  {ra:18.350,dec:-25.422,mag:3.17,dist:120,name:"Albaldah",proper:"π Sgr",color:0xffffff,constellation:"Sagittarius"},

  // === CAPRICORNUS (The Sea-Goat) - Dec 22-Jan 19 ===
  {ra:21.784,dec:-16.127,mag:2.87,dist:39,name:"Deneb Algedi",proper:"δ Cap",color:0xffffff,constellation:"Capricornus"},
  {ra:20.350,dec:-12.508,mag:2.85,dist:344,name:"Dabih",proper:"β Cap",color:0xffaa77,constellation:"Capricornus"},
  {ra:21.099,dec:-16.662,mag:3.57,dist:139,name:"Nashira",proper:"γ Cap",color:0xffffff,constellation:"Capricornus"},
  {ra:20.298,dec:-14.781,mag:4.07,dist:670,name:"Alshat",proper:"ν Cap",color:0xffffff,constellation:"Capricornus"},
  {ra:21.618,dec:-19.466,mag:4.08,dist:290,name:"Omega Capricorni",proper:"ω Cap",color:0xffe4b5,constellation:"Capricornus"},

  // === AQUARIUS (The Water-Bearer) - Jan 20-Feb 18 ===
  {ra:22.096,dec:-0.320,mag:2.91,dist:612,name:"Sadalsuud",proper:"β Aqr",color:0xfff4e8,constellation:"Aquarius"},
  {ra:22.877,dec:-15.821,mag:2.96,dist:758,name:"Sadalmelik",proper:"α Aqr",color:0xfff4e8,constellation:"Aquarius"},
  {ra:21.526,dec:-5.571,mag:3.27,dist:160,name:"Skat",proper:"δ Aqr",color:0xffffff,constellation:"Aquarius"},
  {ra:22.361,dec:-1.387,mag:3.84,dist:319,name:"Sadachbia",proper:"γ Aqr",color:0xffffff,constellation:"Aquarius"},
  {ra:22.825,dec:-7.579,mag:4.01,dist:98,name:"Albali",proper:"ε Aqr",color:0xffffff,constellation:"Aquarius"},

  // === PISCES (The Fishes) - Feb 19-Mar 20 ===
  {ra:1.297,dec:7.890,mag:3.82,dist:139,name:"Alrescha",proper:"α Psc",color:0xffffff,constellation:"Pisces"},
  {ra:23.666,dec:1.256,mag:3.69,dist:294,name:"Gamma Piscium",proper:"γ Psc",color:0xffffff,constellation:"Pisces"},
  {ra:23.286,dec:3.820,mag:3.62,dist:294,name:"Eta Piscium",proper:"η Psc",color:0xfff4e8,constellation:"Pisces"},
  {ra:1.226,dec:15.346,mag:4.33,dist:130,name:"Omega Piscium",proper:"ω Psc",color:0xffffff,constellation:"Pisces"},
  {ra:0.811,dec:7.585,mag:4.28,dist:151,name:"Iota Piscium",proper:"ι Psc",color:0xffffff,constellation:"Pisces"},

  // ===================================================================
  // OTHER MAJOR CONSTELLATIONS
  // ===================================================================

  // === ORION (The Hunter) ===
  {ra:5.919,dec:7.407,mag:0.50,dist:548,name:"Betelgeuse",proper:"α Ori",color:0xff6347,constellation:"Orion"},
  {ra:5.242,dec:-8.202,mag:0.13,dist:863,name:"Rigel",proper:"β Ori",color:0x9bb0ff,constellation:"Orion"},
  {ra:5.439,dec:6.350,mag:1.64,dist:243,name:"Bellatrix",proper:"γ Ori",color:0xb0d0ff,constellation:"Orion"},
  {ra:5.603,dec:-1.202,mag:1.69,dist:2000,name:"Alnilam",proper:"ε Ori",color:0xabc4ff,constellation:"Orion"},  // Belt center
  {ra:5.679,dec:-1.943,mag:1.77,dist:1260,name:"Alnitak",proper:"ζ Ori",color:0xabc4ff,constellation:"Orion"},  // Belt east
  {ra:5.533,dec:-0.299,mag:2.23,dist:1200,name:"Mintaka",proper:"δ Ori",color:0xb5d4ff,constellation:"Orion"},  // Belt west
  {ra:5.533,dec:-9.670,mag:2.06,dist:724,name:"Saiph",proper:"κ Ori",color:0xa0c8ff,constellation:"Orion"},
  {ra:5.350,dec:9.934,mag:3.39,dist:1100,name:"Meissa",proper:"λ Ori",color:0xb0d0ff,constellation:"Orion"},

  // === URSA MAJOR (Big Dipper) ===
  {ra:11.062,dec:61.751,mag:1.79,dist:123,name:"Dubhe",proper:"α UMa",color:0xffcc88,constellation:"Ursa Major"},
  {ra:11.030,dec:56.382,mag:2.37,dist:79,name:"Merak",proper:"β UMa",color:0xffffff,constellation:"Ursa Major"},
  {ra:11.897,dec:53.695,mag:2.44,dist:84,name:"Phecda",proper:"γ UMa",color:0xffffff,constellation:"Ursa Major"},
  {ra:12.257,dec:57.032,mag:3.31,dist:81,name:"Megrez",proper:"δ UMa",color:0xffffff,constellation:"Ursa Major"},
  {ra:12.900,dec:55.960,mag:1.77,dist:81,name:"Alioth",proper:"ε UMa",color:0xffffff,constellation:"Ursa Major"},
  {ra:13.398,dec:54.925,mag:2.27,dist:78,name:"Mizar",proper:"ζ UMa",color:0xffffff,constellation:"Ursa Major"},
  {ra:13.792,dec:49.313,mag:1.86,dist:101,name:"Alkaid",proper:"η UMa",color:0xffffff,constellation:"Ursa Major"},

  // === URSA MINOR (Little Dipper with Polaris) ===
  {ra:2.530,dec:89.264,mag:1.98,dist:433,name:"Polaris",proper:"α UMi",color:0xfff4e8,constellation:"Ursa Minor"},
  {ra:14.845,dec:74.155,mag:2.08,dist:126,name:"Kochab",proper:"β UMi",color:0xffaa77,constellation:"Ursa Minor"},
  {ra:15.345,dec:71.834,mag:3.05,dist:480,name:"Pherkad",proper:"γ UMi",color:0xffffff,constellation:"Ursa Minor"},

  // === CASSIOPEIA (The Queen) ===
  {ra:0.675,dec:60.717,mag:2.27,dist:54,name:"Caph",proper:"β Cas",color:0xffffff,constellation:"Cassiopeia"},
  {ra:0.153,dec:59.150,mag:2.23,dist:229,name:"Schedar",proper:"α Cas",color:0xffcc88,constellation:"Cassiopeia"},
  {ra:1.430,dec:60.235,mag:2.47,dist:613,name:"Navi",proper:"γ Cas",color:0xadd8e6,constellation:"Cassiopeia"},
  {ra:0.945,dec:60.235,mag:2.68,dist:99,name:"Ruchbah",proper:"δ Cas",color:0xffffff,constellation:"Cassiopeia"},
  {ra:1.906,dec:63.670,mag:3.38,dist:442,name:"Segin",proper:"ε Cas",color:0xadd8e6,constellation:"Cassiopeia"},

  // === CYGNUS (The Swan / Northern Cross) ===
  {ra:20.691,dec:45.280,mag:1.25,dist:2615,name:"Deneb",proper:"α Cyg",color:0xffffff,constellation:"Cygnus"},
  {ra:19.512,dec:27.960,mag:2.20,dist:1833,name:"Sadr",proper:"γ Cyg",color:0xfff4e8,constellation:"Cygnus"},
  {ra:20.371,dec:40.257,mag:2.46,dist:72,name:"Gienah",proper:"ε Cyg",color:0xffaa77,constellation:"Cygnus"},
  {ra:19.511,dec:51.731,mag:2.87,dist:165,name:"Delta Cygni",proper:"δ Cyg",color:0xadd8e6,constellation:"Cygnus"},
  {ra:19.748,dec:33.971,mag:2.48,dist:390,name:"Albireo",proper:"β Cyg",color:0xffaa77,constellation:"Cygnus"},

  // === BOÖTES (The Herdsman) ===
  {ra:14.261,dec:19.182,mag:-0.05,dist:37,name:"Arcturus",proper:"α Boo",color:0xff8c00,constellation:"Boötes"},
  {ra:14.749,dec:27.074,mag:2.37,dist:203,name:"Izar",proper:"ε Boo",color:0xffaa77,constellation:"Boötes"},
  {ra:15.032,dec:40.390,mag:2.68,dist:37,name:"Muphrid",proper:"η Boo",color:0xfff4e8,constellation:"Boötes"},
  {ra:13.911,dec:18.398,mag:3.03,dist:225,name:"Seginus",proper:"γ Boo",color:0xffffff,constellation:"Boötes"},

  // === LYRA (The Lyre) ===
  {ra:18.616,dec:38.783,mag:0.03,dist:25,name:"Vega",proper:"α Lyr",color:0xffffff,constellation:"Lyra"},
  {ra:18.983,dec:32.689,mag:3.45,dist:960,name:"Sheliak",proper:"β Lyr",color:0xffffff,constellation:"Lyra"},
  {ra:18.746,dec:39.610,mag:3.24,dist:620,name:"Sulafat",proper:"γ Lyr",color:0xadd8e6,constellation:"Lyra"},

  // === AQUILA (The Eagle) ===
  {ra:19.847,dec:8.868,mag:0.77,dist:17,name:"Altair",proper:"α Aql",color:0xffffff,constellation:"Aquila"},
  {ra:19.771,dec:1.006,mag:2.72,dist:45,name:"Alshain",proper:"β Aql",color:0xffffff,constellation:"Aquila"},
  {ra:19.771,dec:10.613,mag:2.99,dist:461,name:"Tarazed",proper:"γ Aql",color:0xffaa77,constellation:"Aquila"},

  // === PERSEUS (The Hero) ===
  {ra:3.405,dec:49.861,mag:1.80,dist:510,name:"Mirfak",proper:"α Per",color:0xfff4e8,constellation:"Perseus"},
  {ra:3.136,dec:40.955,mag:2.12,dist:93,name:"Algol",proper:"β Per",color:0xffffff,constellation:"Perseus"},
  {ra:3.902,dec:47.787,mag:2.93,dist:243,name:"Gamma Persei",proper:"γ Per",color:0xffffff,constellation:"Perseus"},
  {ra:3.079,dec:53.506,mag:3.01,dist:520,name:"Delta Persei",proper:"δ Per",color:0xadd8e6,constellation:"Perseus"},

  // === ANDROMEDA (The Princess) ===
  {ra:0.140,dec:29.091,mag:2.06,dist:97,name:"Alpheratz",proper:"α And",color:0xffffff,constellation:"Andromeda"},
  {ra:1.162,dec:35.620,mag:2.06,dist:200,name:"Mirach",proper:"β And",color:0xff8866,constellation:"Andromeda"},
  {ra:2.065,dec:42.330,mag:2.26,dist:355,name:"Almach",proper:"γ And",color:0xffaa77,constellation:"Andromeda"},
  {ra:0.657,dec:30.861,mag:3.27,dist:101,name:"Delta Andromedae",proper:"δ And",color:0xffaa77,constellation:"Andromeda"},

  // === PEGASUS (The Winged Horse) ===
  {ra:23.079,dec:15.205,mag:2.49,dist:133,name:"Markab",proper:"α Peg",color:0xadd8e6,constellation:"Pegasus"},
  {ra:23.063,dec:28.083,mag:2.42,dist:196,name:"Scheat",proper:"β Peg",color:0xff8866,constellation:"Pegasus"},
  {ra:0.220,dec:15.184,mag:2.83,dist:391,name:"Algenib",proper:"γ Peg",color:0xadd8e6,constellation:"Pegasus"},
  {ra:22.717,dec:10.831,mag:2.39,dist:672,name:"Enif",proper:"ε Peg",color:0xffaa77,constellation:"Pegasus"},

  // === CANIS MAJOR (The Great Dog) ===
  {ra:6.752,dec:-16.716,mag:-1.46,dist:8.6,name:"Sirius",proper:"α CMa",color:0xffffff,constellation:"Canis Major"},
  {ra:6.378,dec:-17.956,mag:1.50,dist:500,name:"Adhara",proper:"ε CMa",color:0xadd8e6,constellation:"Canis Major"},
  {ra:7.140,dec:-26.771,mag:1.83,dist:405,name:"Wezen",proper:"δ CMa",color:0xfff4e8,constellation:"Canis Major"},

  // === CANIS MINOR (The Lesser Dog) ===
  {ra:7.655,dec:5.225,mag:0.38,dist:11.5,name:"Procyon",proper:"α CMi",color:0xfff8dc,constellation:"Canis Minor"},
  {ra:7.453,dec:8.289,mag:2.90,dist:170,name:"Gomeisa",proper:"β CMi",color:0xffffff,constellation:"Canis Minor"},

  // === AURIGA (The Charioteer) ===
  {ra:5.278,dec:45.998,mag:0.08,dist:42,name:"Capella",proper:"α Aur",color:0xfff5e1,constellation:"Auriga"},
  {ra:5.992,dec:44.948,mag:1.90,dist:82,name:"Menkalinan",proper:"β Aur",color:0xffffff,constellation:"Auriga"},
  {ra:4.950,dec:43.823,mag:2.69,dist:512,name:"Almaaz",proper:"ε Aur",color:0xffffff,constellation:"Auriga"},

  // === CENTAURUS (The Centaur) ===
  {ra:14.661,dec:-60.835,mag:-0.27,dist:4.37,name:"Rigil Kentaurus",proper:"α Cen",color:0xfff4e6,constellation:"Centaurus"},
  {ra:14.063,dec:-60.373,mag:0.61,dist:525,name:"Hadar",proper:"β Cen",color:0xadd8e6,constellation:"Centaurus"},
  {ra:12.139,dec:-50.722,mag:2.17,dist:61,name:"Menkent",proper:"θ Cen",color:0xffaa77,constellation:"Centaurus"},

  // === CRUX (Southern Cross) ===
  {ra:12.443,dec:-63.099,mag:0.77,dist:321,name:"Acrux",proper:"α Cru",color:0xadd8e6,constellation:"Crux"},
  {ra:12.795,dec:-59.689,mag:1.25,dist:280,name:"Mimosa",proper:"β Cru",color:0xadd8e6,constellation:"Crux"},
  {ra:12.519,dec:-57.113,mag:1.63,dist:88,name:"Gacrux",proper:"γ Cru",color:0xff6644,constellation:"Crux"},
  {ra:12.253,dec:-58.749,mag:2.80,dist:345,name:"Delta Crucis",proper:"δ Cru",color:0xadd8e6,constellation:"Crux"},

  // === CARINA (The Keel) ===
  {ra:6.399,dec:-52.696,mag:-0.72,dist:310,name:"Canopus",proper:"α Car",color:0xfff4e8,constellation:"Carina"},
  {ra:8.375,dec:-59.509,mag:1.68,dist:113,name:"Miaplacidus",proper:"β Car",color:0xffffff,constellation:"Carina"},
  {ra:9.220,dec:-59.275,mag:1.86,dist:632,name:"Avior",proper:"ε Car",color:0xffaa77,constellation:"Carina"},

  // === ERIDANUS (The River) ===
  {ra:1.628,dec:-57.237,mag:0.46,dist:139,name:"Achernar",proper:"α Eri",color:0xadd8e6,constellation:"Eridanus"},
  {ra:3.549,dec:-9.458,mag:2.95,dist:143,name:"Cursa",proper:"β Eri",color:0xffffff,constellation:"Eridanus"},

  // === PISCIS AUSTRINUS (The Southern Fish) ===
  {ra:22.961,dec:-29.622,mag:1.16,dist:25,name:"Fomalhaut",proper:"α PsA",color:0xffffff,constellation:"Piscis Austrinus"},

  // === DRACO (The Dragon) ===
  {ra:14.073,dec:64.376,mag:3.65,dist:303,name:"Thuban",proper:"α Dra",color:0xffffff,constellation:"Draco"},
  {ra:17.943,dec:51.489,mag:2.79,dist:380,name:"Eltanin",proper:"γ Dra",color:0xffaa77,constellation:"Draco"},
  {ra:17.507,dec:52.301,mag:2.73,dist:362,name:"Rastaban",proper:"β Dra",color:0xfff4e8,constellation:"Draco"},

  // === OPHIUCHUS (The Serpent Bearer) ===
  {ra:17.582,dec:12.560,mag:2.08,dist:47,name:"Rasalhague",proper:"α Oph",color:0xffffff,constellation:"Ophiuchus"},
  {ra:16.961,dec:-10.567,mag:2.43,dist:170,name:"Sabik",proper:"η Oph",color:0xffffff,constellation:"Ophiuchus"},

  // === HERCULES (The Hero) ===
  {ra:17.244,dec:14.390,mag:2.77,dist:139,name:"Kornephoros",proper:"β Her",color:0xfff4e8,constellation:"Hercules"},
  {ra:16.716,dec:31.603,mag:3.48,dist:359,name:"Rasalgethi",proper:"α Her",color:0xff8866,constellation:"Hercules"},
  {ra:17.250,dec:24.839,mag:2.81,dist:35,name:"Zeta Herculis",proper:"ζ Her",color:0xfff4e8,constellation:"Hercules"}
];
// ========================================================================
// CONSTELLATION LINE DEFINITIONS
// Each array contains pairs of [RA, Dec] coordinates to connect with lines
// Based on traditional IAU constellation patterns
// ========================================================================

const CONSTELLATION_LINES = {
  // ===================================================================
  // ZODIAC CONSTELLATIONS
  // ===================================================================

  "Aries": [
    // Triangle shape
    [[2.119,23.463],[1.911,20.808]], // Hamal-Sheratan
    [[1.911,20.808],[2.656,27.260]], // Sheratan-Mesarthim
    [[2.656,27.260],[2.119,23.463]], // Mesarthim-Hamal (close triangle)
    [[2.119,23.463],[3.226,19.726]], // Hamal-Botein (extension)
  ],

  "Taurus": [
    // V-shaped head (Hyades cluster)
    [[4.599,16.509],[3.797,24.105]], // Aldebaran-Ain
    [[4.599,16.509],[4.476,15.871]], // Aldebaran-Elnath (horn)
    // Connection to Pleiades
    [[3.797,24.105],[5.438,28.608]], // Ain-Alcyone (Pleiades)
    [[5.438,28.608],[5.449,24.368]], // Alcyone-Atlas (Pleiades cluster)
    [[5.438,28.608],[5.627,21.143]], // Alcyone-Electra (Pleiades)
  ],

  "Gemini": [
    // The two parallel twins
    [[7.755,28.026],[7.577,31.888]], // Pollux-Castor (heads)
    [[7.755,28.026],[6.628,22.514]], // Pollux-Alhena (Pollux's body)
    [[6.628,22.514],[6.383,22.507]], // Alhena-Mebsuta
    [[6.383,22.507],[6.248,12.896]], // Mebsuta-Propus (foot)
    [[7.577,31.888],[7.068,20.570]], // Castor-Tejat (Castor's body)
    [[7.068,20.570],[6.628,22.514]], // Tejat-Alhena (connecting twins)
  ],

  "Cancer": [
    // Upside-down Y shape
    [[8.975,11.858],[8.775,28.760]], // Al Tarf-Acubens (left arm)
    [[8.975,11.858],[8.745,18.154]], // Al Tarf-Asellus Australis (center)
    [[8.745,18.154],[8.722,21.469]], // Asellus Australis-Asellus Borealis
    [[8.722,21.469],[9.188,12.653]], // Asellus Borealis-Iota (right side)
  ],

  "Leo": [
    // The Lion - Sickle (head) and triangle (body)
    // Sickle (backwards question mark)
    [[10.139,11.967],[9.763,23.774]], // Regulus-Algieba
    [[9.763,23.774],[9.879,26.152]], // Algieba-Adhafera
    [[9.879,26.152],[10.278,16.763]], // Adhafera-Chertan
    [[10.278,16.763],[10.139,11.967]], // Chertan-Regulus (close sickle)
    // Triangle (hindquarters)
    [[10.139,11.967],[11.235,20.524]], // Regulus-Zosma
    [[11.235,20.524],[11.818,14.572]], // Zosma-Denebola (tail)
    [[11.818,14.572],[10.278,16.763]], // Denebola-Chertan (back to body)
  ],

  "Virgo": [
    // Y-shape with Spica at bottom
    [[13.420,-11.161],[12.694,-1.449]], // Spica-Porrima (stem)
    [[12.694,-1.449],[13.037,10.959]], // Porrima-Vindemiatrix (left branch)
    [[12.694,-1.449],[12.333,-0.667]], // Porrima-Zavijava (right branch)
    [[12.333,-0.667],[14.780,1.544]], // Zavijava-Heze (extend right)
    [[14.780,1.544],[14.016,1.545]], // Heze-Zaniah (far right)
  ],

  "Libra": [
    // Balance scales
    [[14.849,-16.042],[15.283,-9.383]], // Zubenelgenubi-Zubeneschamali (beam)
    [[14.849,-16.042],[15.592,-14.789]], // Zubenelgenubi-Zubenelakrab (left pan)
    [[15.283,-9.383],[15.592,-14.789]], // Zubeneschamali-Zubenelakrab (triangle)
    [[15.592,-14.789],[15.061,-25.282]], // Zubenelakrab-Brachium (weight)
  ],

  "Scorpius": [
    // Scorpion with curved tail
    // Head and claws
    [[16.005,-19.805],[16.090,-19.461]], // Dschubba-Pi Sco (head)
    [[16.090,-19.461],[16.490,-26.432]], // Pi Sco-Antares (heart)
    // Body and curved tail
    [[16.490,-26.432],[16.836,-34.293]], // Antares-Sargas
    [[16.836,-34.293],[16.960,-42.998]], // Sargas-Girtab
    [[16.960,-42.998],[17.560,-37.104]], // Girtab-Shaula (curve)
    [[17.560,-37.104],[17.202,-37.296]], // Shaula-Lesath (tail sting)
  ],

  "Sagittarius": [
    // Teapot shape
    [[19.396,-40.616],[18.466,-34.384]], // Kaus Australis-Kaus Borealis (handle side)
    [[18.466,-34.384],[19.093,-21.024]], // Kaus Borealis-Kaus Media (handle top)
    [[19.093,-21.024],[18.921,-26.297]], // Kaus Media-Nunki (lid)
    [[18.921,-26.297],[18.350,-25.422]], // Nunki-Albaldah (spout base)
    [[19.093,-21.024],[19.375,-24.883]], // Kaus Media-Alnasl (spout)
    [[19.375,-24.883],[19.163,-29.880]], // Alnasl-Ascella
    [[19.163,-29.880],[19.396,-40.616]], // Ascella-Kaus Australis (close teapot)
  ],

  "Capricornus": [
    // Sea-goat triangle
    [[21.784,-16.127],[20.350,-12.508]], // Deneb Algedi-Dabih
    [[20.350,-12.508],[21.099,-16.662]], // Dabih-Nashira
    [[21.099,-16.662],[21.784,-16.127]], // Nashira-Deneb Algedi (close triangle)
    [[21.099,-16.662],[20.298,-14.781]], // Nashira-Alshat (tail)
    [[21.784,-16.127],[21.618,-19.466]], // Deneb Algedi-Omega (fin)
  ],

  "Aquarius": [
    // Water jar and flowing stream
    [[22.096,-0.320],[22.361,-1.387]], // Sadalsuud-Sadachbia (jar top)
    [[22.361,-1.387],[22.877,-15.821]], // Sadachbia-Sadalmelik (jar side)
    [[22.877,-15.821],[21.526,-5.571]], // Sadalmelik-Skat (water stream)
    [[21.526,-5.571],[22.825,-7.579]], // Skat-Albali (stream flow)
  ],

  "Pisces": [
    // Two fish connected by cord (V-shape)
    [[1.297,7.890],[1.226,15.346]], // Alrescha-Omega (western fish)
    [[1.226,15.346],[0.811,7.585]], // Omega-Iota (western fish body)
    [[1.297,7.890],[23.666,1.256]], // Alrescha-Gamma (cord)
    [[23.666,1.256],[23.286,3.820]], // Gamma-Eta (eastern fish)
    [[23.286,3.820],[23.666,1.256]], // Eta-Gamma (eastern fish body)
  ],

  // ===================================================================
  // OTHER MAJOR CONSTELLATIONS
  // ===================================================================

  "Orion": [
    // Shoulders (top horizontal)
    [[5.919,7.407],[5.439,6.350]], // Betelgeuse (right shoulder) - Bellatrix (left shoulder)

    // Left side - from Bellatrix down through belt to Rigel
    [[5.439,6.350],[5.533,-0.299]], // Bellatrix - Mintaka (belt west)
    [[5.533,-0.299],[5.242,-8.202]], // Mintaka - Rigel (left foot)

    // Right side - from Betelgeuse down through belt to Saiph
    [[5.919,7.407],[5.679,-1.943]], // Betelgeuse - Alnitak (belt east)
    [[5.679,-1.943],[5.533,-9.670]], // Alnitak - Saiph (right foot)

    // Belt (Orion's Belt) - three stars in a row
    [[5.679,-1.943],[5.603,-1.202]], // Alnitak - Alnilam (center)
    [[5.603,-1.202],[5.533,-0.299]], // Alnilam - Mintaka

    // Feet (bottom horizontal)
    [[5.242,-8.202],[5.533,-9.670]], // Rigel - Saiph

    // Head (Meissa)
    [[5.439,6.350],[5.350,9.934]], // Bellatrix - Meissa
    [[5.919,7.407],[5.350,9.934]], // Betelgeuse - Meissa
  ],

  "Ursa Major": [
    // Big Dipper bowl
    [[11.062,61.751],[11.030,56.382]], // Dubhe-Merak
    [[11.030,56.382],[11.897,53.695]], // Merak-Phecda
    [[11.897,53.695],[12.257,57.032]], // Phecda-Megrez
    [[12.257,57.032],[11.062,61.751]], // Megrez-Dubhe (close bowl)
    // Handle
    [[12.257,57.032],[12.900,55.960]], // Megrez-Alioth
    [[12.900,55.960],[13.398,54.925]], // Alioth-Mizar
    [[13.398,54.925],[13.792,49.313]], // Mizar-Alkaid (tip of handle)
  ],

  "Ursa Minor": [
    // Little Dipper
    [[2.530,89.264],[14.845,74.155]], // Polaris-Kochab (handle to bowl)
    [[14.845,74.155],[15.345,71.834]], // Kochab-Pherkad (bowl)
  ],

  "Cassiopeia": [
    // W shape
    [[0.675,60.717],[0.153,59.150]], // Caph-Schedar
    [[0.153,59.150],[1.430,60.235]], // Schedar-Navi (center)
    [[1.430,60.235],[0.945,60.235]], // Navi-Ruchbah
    [[0.945,60.235],[1.906,63.670]], // Ruchbah-Segin
  ],

  "Cygnus": [
    // Northern Cross
    [[20.691,45.280],[19.748,33.971]], // Deneb-Albireo (long axis)
    [[20.691,45.280],[19.511,51.731]], // Deneb-Delta (top of cross)
    [[19.511,51.731],[19.512,27.960]], // Delta-Sadr (center)
    [[19.512,27.960],[19.748,33.971]], // Sadr-Albireo (complete vertical)
    [[20.371,40.257],[19.512,27.960]], // Gienah-Sadr (cross beam)
  ],

  "Lyra": [
    // Small parallelogram
    [[18.616,38.783],[18.983,32.689]], // Vega-Sheliak
    [[18.616,38.783],[18.746,39.610]], // Vega-Sulafat
    [[18.983,32.689],[18.746,39.610]], // Sheliak-Sulafat (triangle)
  ],

  "Aquila": [
    // Eagle in flight
    [[19.847,8.868],[19.771,1.006]], // Altair-Alshain
    [[19.847,8.868],[19.771,10.613]], // Altair-Tarazed
  ],

  "Boötes": [
    // Kite shape
    [[14.261,19.182],[14.749,27.074]], // Arcturus-Izar
    [[14.749,27.074],[15.032,40.390]], // Izar-Muphrid
    [[15.032,40.390],[13.911,18.398]], // Muphrid-Seginus
    [[13.911,18.398],[14.261,19.182]], // Seginus-Arcturus (close kite)
  ],

  "Perseus": [
    // Hero shape
    [[3.405,49.861],[3.136,40.955]], // Mirfak-Algol
    [[3.405,49.861],[3.902,47.787]], // Mirfak-Gamma
    [[3.902,47.787],[3.079,53.506]], // Gamma-Delta
    [[3.079,53.506],[3.405,49.861]], // Delta-Mirfak (close shape)
  ],

  "Andromeda": [
    // Chain from Pegasus
    [[0.140,29.091],[1.162,35.620]], // Alpheratz-Mirach
    [[1.162,35.620],[2.065,42.330]], // Mirach-Almach
    [[1.162,35.620],[0.657,30.861]], // Mirach-Delta (branch)
  ],

  "Pegasus": [
    // Great Square
    [[23.079,15.205],[23.063,28.083]], // Markab-Scheat
    [[23.063,28.083],[0.140,29.091]], // Scheat-Alpheratz
    [[0.140,29.091],[0.220,15.184]], // Alpheratz-Algenib
    [[0.220,15.184],[23.079,15.205]], // Algenib-Markab (close square)
    // Nose
    [[23.063,28.083],[22.717,10.831]], // Scheat-Enif
  ],

  "Canis Major": [
    // The dog
    [[6.752,-16.716],[6.378,-17.956]], // Sirius-Adhara
    [[6.378,-17.956],[7.140,-26.771]], // Adhara-Wezen
  ],

  "Canis Minor": [
    // Simple pair
    [[7.655,5.225],[7.453,8.289]], // Procyon-Gomeisa
  ],

  "Auriga": [
    // Pentagon with Capella
    [[5.278,45.998],[5.992,44.948]], // Capella-Menkalinan
    [[5.992,44.948],[4.950,43.823]], // Menkalinan-Almaaz
  ],

  "Centaurus": [
    // The Centaur
    [[14.661,-60.835],[14.063,-60.373]], // Rigil Kentaurus-Hadar
    [[14.063,-60.373],[12.139,-50.722]], // Hadar-Menkent
  ],

  "Crux": [
    // Southern Cross
    [[12.443,-63.099],[12.519,-57.113]], // Acrux-Gacrux (vertical)
    [[12.795,-59.689],[12.253,-58.749]], // Mimosa-Delta (horizontal)
  ],

  "Carina": [
    // The Keel
    [[6.399,-52.696],[8.375,-59.509]], // Canopus-Miaplacidus
    [[8.375,-59.509],[9.220,-59.275]], // Miaplacidus-Avior
  ],

  "Draco": [
    // The Dragon
    [[14.073,64.376],[17.943,51.489]], // Thuban-Eltanin
    [[17.943,51.489],[17.507,52.301]], // Eltanin-Rastaban
  ],

  "Ophiuchus": [
    // Serpent bearer
    [[17.582,12.560],[16.961,-10.567]], // Rasalhague-Sabik
  ],

  "Hercules": [
    // Keystone asterism
    [[17.244,14.390],[16.716,31.603]], // Kornephoros-Rasalgethi
    [[16.716,31.603],[17.250,24.839]], // Rasalgethi-Zeta
  ]
};

