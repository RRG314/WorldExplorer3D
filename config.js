// Game configuration and constants
export const LOCATIONS = {
    baltimore: { name: 'Baltimore', lat: 39.2904, lon: -76.6122 },
    hollywood: { name: 'Hollywood', lat: 34.0928, lon: -118.3287 },
    newyork: { name: 'New York', lat: 40.7580, lon: -73.9855 },
    miami: { name: 'Miami', lat: 25.7617, lon: -80.1918 },
    tokyo: { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
    monaco: { name: 'Monaco', lat: 43.7384, lon: 7.4246 },
    nurburgring: { name: 'Nürburgring', lat: 50.3356, lon: 6.9475 },
    lasvegas: { name: 'Las Vegas', lat: 36.1699, lon: -115.1398 },
    london: { name: 'London', lat: 51.5074, lon: -0.1278 },
    paris: { name: 'Paris', lat: 48.8566, lon: 2.3522 },
    dubai: { name: 'Dubai', lat: 25.2048, lon: 55.2708 }
};

export const SCALE = 100000;

export const PHYSICS_CONFIG = {
    maxSpd: 120,
    offMax: 60,
    accel: 25,
    boostAccel: 45,
    brake: 150,
    friction: 25,
    offFriction: 120,
    boostMax: 140,
    boostDur: 2.5,
    brakeForce: 2.5,

    // Grip settings - realistic car physics
    gripRoad: 0.88,
    gripOff: 0.70,
    gripBrake: 0.60,
    gripDrift: 0.45,
    driftRec: 6,

    // Turn settings - realistic steering
    turnLow: 1.8,
    turnHigh: 0.8,
    turnMin: 30,

    // Road boundary settings
    roadForce: 0.93,
    roadPushback: 0.3,
    maxOffDist: 15,

    // Game modes
    cpRadius: 25,
    trialTime: 120,
    policeSpd: 140,
    policeAccel: 60,
    policeDist: 800
};

export const CAMERA_MODES = {
    FOLLOW: 0,
    CHASE: 1,
    TOP: 2,
    HOOD: 3
};
