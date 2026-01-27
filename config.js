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

// Land use styles for massive visual realism - ground truth rendering
export const LANDUSE_STYLES = {
    residential: { color: 0xd4d4d4, name: 'Residential' },
    industrial: { color: 0x8c8c8c, name: 'Industrial' },
    commercial: { color: 0xb8b8b8, name: 'Commercial' },
    retail: { color: 0xc9c9c9, name: 'Retail' },
    forest: { color: 0x2d5016, name: 'Forest' },
    farmland: { color: 0x8b7355, name: 'Farmland' },
    grass: { color: 0x7cb342, name: 'Grass' },
    meadow: { color: 0x8bc34a, name: 'Meadow' },
    orchard: { color: 0x689f38, name: 'Orchard' },
    vineyard: { color: 0x7cb342, name: 'Vineyard' },
    water: { color: 0x4a90e2, name: 'Water' },
    wood: { color: 0x1b4d0d, name: 'Woods' },
    park: { color: 0x66bb6a, name: 'Park' },
    garden: { color: 0x81c784, name: 'Garden' },
    cemetery: { color: 0x558b2f, name: 'Cemetery' },
    allotments: { color: 0x8bc34a, name: 'Allotments' },
    recreation_ground: { color: 0x66bb6a, name: 'Recreation' },
    village_green: { color: 0x7cb342, name: 'Village Green' },
    quarry: { color: 0x9e9e9e, name: 'Quarry' },
    landfill: { color: 0x757575, name: 'Landfill' },
    construction: { color: 0xbdbdbd, name: 'Construction' },
    brownfield: { color: 0xa1887f, name: 'Brownfield' },
    greenfield: { color: 0x9ccc65, name: 'Greenfield' }
};

// POI types with icons and colors
export const POI_TYPES = {
    'amenity=school': { icon: '🏫', category: 'Education', color: 0x2196f3 },
    'amenity=hospital': { icon: '🏥', category: 'Healthcare', color: 0xf44336 },
    'amenity=clinic': { icon: '🏥', category: 'Healthcare', color: 0xe91e63 },
    'amenity=police': { icon: '👮', category: 'Safety', color: 0x1976d2 },
    'amenity=fire_station': { icon: '🚒', category: 'Safety', color: 0xff5722 },
    'amenity=parking': { icon: '🅿️', category: 'Transport', color: 0x607d8b },
    'amenity=fuel': { icon: '⛽', category: 'Services', color: 0xff9800 },
    'amenity=restaurant': { icon: '🍽️', category: 'Food', color: 0xef5350 },
    'amenity=cafe': { icon: '☕', category: 'Food', color: 0x8d6e63 },
    'amenity=bank': { icon: '🏦', category: 'Finance', color: 0x43a047 },
    'amenity=pharmacy': { icon: '💊', category: 'Healthcare', color: 0x66bb6a },
    'amenity=post_office': { icon: '📮', category: 'Services', color: 0x1e88e5 },
    'shop=supermarket': { icon: '🏪', category: 'Shopping', color: 0x4caf50 },
    'shop=mall': { icon: '🏬', category: 'Shopping', color: 0x9c27b0 },
    'shop=convenience': { icon: '🏪', category: 'Shopping', color: 0x66bb6a },
    'tourism=museum': { icon: '🏛️', category: 'Culture', color: 0x795548 },
    'tourism=hotel': { icon: '🏨', category: 'Hospitality', color: 0x00bcd4 },
    'tourism=attraction': { icon: '⭐', category: 'Tourism', color: 0xffc107 },
    'tourism=viewpoint': { icon: '👁️', category: 'Tourism', color: 0xff9800 },
    'historic=monument': { icon: '🗿', category: 'Historic', color: 0x8d6e63 },
    'historic=memorial': { icon: '🗿', category: 'Historic', color: 0x6d4c41 },
    'leisure=park': { icon: '🌳', category: 'Recreation', color: 0x66bb6a },
    'leisure=stadium': { icon: '🏟️', category: 'Sports', color: 0xffc107 },
    'leisure=sports_centre': { icon: '⚽', category: 'Sports', color: 0xff9800 }
};

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
