// Global application state
import { LOCATIONS, SCALE } from './config.js';

export const state = {
    // Location
    LOC: { lat: 39.2904, lon: -76.6122 },
    customLoc: null,
    selectedLocation: 'baltimore',

    // Car state
    car: {
        x: 0,
        z: 0,
        angle: 0,
        speed: 0,
        vx: 0,
        vz: 0,
        grip: 1,
        onRoad: true,
        road: null,
        boost: false,
        boostTime: 0,
        boostReady: true,
        driftAngle: 0
    },

    // Input
    keys: {},

    // World data
    roads: [],
    buildings: [],

    // Three.js objects
    scene: null,
    camera: null,
    renderer: null,
    carMesh: null,
    wheelMeshes: [],
    roadMeshes: [],
    buildingMeshes: [],

    // Game state
    gameStarted: false,
    paused: false,
    gameMode: 'free',
    gameTimer: 0,

    // Camera
    camMode: 0,

    // Police
    policeOn: false,
    police: [],
    policeMeshes: [],
    policeHits: 0,

    // Objectives
    checkpoints: [],
    cpMeshes: [],
    cpCollected: 0,
    destination: null,
    destMesh: null,
    trialDone: false,

    // Track recording
    customTrack: [],
    trackMesh: null,
    isRecording: false,

    // Drone mode
    droneMode: false,
    drone: {
        x: 0,
        y: 50,
        z: 0,
        pitch: 0,
        yaw: 0,
        roll: 0,
        speed: 30
    },

    // Minimap
    tileCache: new Map(),
    showLargeMap: false,
    largeMapZoom: 14,

    // Timing
    lastTime: 0,

    // Textures
    asphaltTex: null,
    asphaltNormal: null,
    asphaltRoughness: null,
    windowTextures: {}
};

// Helper function for coordinate conversion
export function geoToWorld(lat, lon) {
    return {
        x: (lon - state.LOC.lon) * SCALE * Math.cos(state.LOC.lat * Math.PI / 180),
        z: -(lat - state.LOC.lat) * SCALE
    };
}
