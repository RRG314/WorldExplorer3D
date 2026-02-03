# Technical Documentation 🔧

Developer guide for World Explorer 3D. Architecture, code structure, and customization.

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [File Structure](#file-structure)
- [Core Systems](#core-systems)
- [API Integration](#api-integration)
- [Rendering Pipeline](#rendering-pipeline)
- [Performance Optimization](#performance-optimization)
- [Customization Guide](#customization-guide)
- [Troubleshooting](#troubleshooting)

## Architecture Overview

### Design Philosophy

World Explorer 3D is built as a **single-file application**:
- No build process required
- No dependencies to install
- Easy to deploy and share
- Self-contained HTML file with embedded CSS and JavaScript

### High-Level Architecture

```
┌─────────────────────────────────────────┐
│          HTML5 Application              │
├─────────────────────────────────────────┤
│  UI Layer (HTML/CSS)                    │
│  ├─ Main Menu                           │
│  ├─ HUD System                          │
│  ├─ Property Panel                      │
│  └─ Map Interface                       │
├─────────────────────────────────────────┤
│  Game Logic (JavaScript)                │
│  ├─ Input Handler                       │
│  ├─ Physics Engine                      │
│  ├─ Game Mode Controller                │
│  └─ State Manager                       │
├─────────────────────────────────────────┤
│  3D Graphics (Three.js)                 │
│  ├─ Scene Management                    │
│  ├─ Camera System                       │
│  ├─ Mesh Generation                     │
│  └─ Material System                     │
├─────────────────────────────────────────┤
│  Data Layer                             │
│  ├─ Google Maps API                     │
│  ├─ Real Estate APIs                    │
│  ├─ LocalStorage                        │
│  └─ Configuration                       │
└─────────────────────────────────────────┘
```

## Technology Stack

### Core Technologies

**Three.js r128**
- 3D rendering engine
- Scene graph management
- WebGL abstraction
- Geometry and material system

**Vanilla JavaScript (ES6+)**
- No frameworks or libraries (except Three.js)
- Modern ES6+ features
- Async/await for API calls
- Class-based architecture

**HTML5**
- Semantic markup
- Canvas elements (2D map, WebGL)
- Local storage API
- Geolocation API (future)

**CSS3**
- Flexbox/Grid layouts
- Animations and transitions
- Media queries for responsive design
- Custom properties (CSS variables)

### External APIs

**Google Maps**
- Satellite imagery tiles
- Geocoding
- Elevation data
- Roads data

**Real Estate APIs**
- Rentcast: Property valuations
- Attom: Property details
- Estated: Market data

## File Structure

### Single File Organization

The HTML file is organized into logical sections:

```
world-explorer-complete.html
├─ <!DOCTYPE html>
├─ <head>
│  ├─ Meta tags
│  ├─ Title
│  ├─ Google Fonts
│  └─ <style> CSS Block
│     ├─ Reset & Base Styles
│     ├─ Title Screen
│     ├─ Main Menu
│     ├─ HUD Components
│     ├─ Float Menu
│     ├─ Property Panel
│     ├─ Map System
│     ├─ Modals
│     └─ Responsive Media Queries
├─ <body>
│  ├─ Title Screen
│  ├─ Main Menu Container
│  │  ├─ Location Tab
│  │  ├─ Settings Tab
│  │  └─ Controls Tab
│  ├─ HUD Elements
│  ├─ Float Menu
│  ├─ Property Panel
│  ├─ Map Canvas
│  ├─ Modals & Overlays
│  └─ <script> JavaScript Block
│     ├─ Constants & Configuration
│     ├─ State Variables
│     ├─ Three.js Setup
│     ├─ Terrain Generation
│     ├─ Physics System
│     ├─ Input Handling
│     ├─ Game Modes
│     ├─ API Integration
│     ├─ UI Controllers
│     ├─ Map System
│     ├─ Moon/Space System
│     └─ Main Game Loop
└─ </body>
```

### Code Organization Principles

1. **Configuration First**: Constants and config at top
2. **State Declaration**: Global state variables
3. **Initialization**: Setup functions
4. **Core Systems**: Physics, rendering, input
5. **Game Logic**: Modes, objectives, scoring
6. **UI Controllers**: Menu, HUD, panels
7. **Utilities**: Helper functions
8. **Event Handlers**: Last section

## Core Systems

### 1. Initialization System

```javascript
async function init() {
    // 1. Setup Three.js scene
    // 2. Initialize camera
    // 3. Setup renderer
    // 4. Create lights
    // 5. Initialize input handlers
    // 6. Setup UI event listeners
    // 7. Start render loop
}
```

**Key Functions**:
- `init()`: Main initialization
- `setupUI()`: UI event binding
- `createScene()`: Three.js scene creation
- `initMap()`: 2D map initialization

### 2. State Management

**Global State Object**:
```javascript
const state = {
    mode: 'drive',        // 'drive', 'walk', 'drone'
    gameMode: 'free',     // 'free', 'trial', 'checkpoint'
    paused: false,
    onMoon: false,
    walker: { x, y, z, angle, vy, onGround },
    car: { x, z, angle, velocity, wheelAngle }
}
```

**State Updates**:
- Physics loop updates state
- Render loop reads state
- Input handlers modify state
- Game modes control state transitions

### 3. Physics Engine

**Vehicle Physics**:
```javascript
function updateCarPhysics(dt) {
    // Acceleration from input
    // Friction and drag
    // Turning mechanics
    // Collision detection
    // Position integration
}
```

**Walking Physics**:
```javascript
function updateWalkerPhysics(dt) {
    // Movement input
    // Gravity simulation
    // Ground detection
    // Jump mechanics
    // Collision handling
}
```

**Drone Physics**:
```javascript
function updateDronePhysics(dt) {
    // Free-form movement
    // No gravity
    // No collisions
    // 6-DOF control
}
```

### 4. Input System

**Keyboard Handling**:
```javascript
const keys = {};

addEventListener('keydown', (e) => {
    keys[e.code] = true;
    onKey(e.code); // Handle special keys
});

addEventListener('keyup', (e) => {
    keys[e.code] = false;
});
```

**Mouse Handling**:
```javascript
addEventListener('mousedown', (e) => {
    if (e.button === 2) { // Right click
        mouseActive = true;
        // Camera control
    }
});

addEventListener('click', (e) => {
    // Moon click
    // Star click
    // UI interactions
});
```

### 5. Rendering Pipeline

**Main Render Loop**:
```javascript
function renderLoop() {
    requestAnimationFrame(renderLoop);
    
    const dt = getDeltaTime();
    
    // Update physics
    updatePhysics(dt);
    
    // Update camera
    updateCamera();
    
    // Update HUD
    updateHUD();
    
    // Update map
    updateMinimap();
    
    // Render 3D scene
    renderer.render(scene, camera);
}
```

**Rendering Order**:
1. Clear buffers
2. Update matrices
3. Frustum culling
4. Depth sorting (transparent objects)
5. Draw opaque objects
6. Draw transparent objects
7. Post-processing (if any)

### 6. Camera System

**Camera Modes**:
```javascript
const cameraMode = 0; // 0: third-person, 1: first-person, 2: overhead

function updateCamera() {
    switch(cameraMode) {
        case 0: updateThirdPersonCamera(); break;
        case 1: updateFirstPersonCamera(); break;
        case 2: updateOverheadCamera(); break;
    }
}
```

**Camera Positioning**:
- Smooth interpolation (lerp)
- Target tracking
- Collision avoidance
- Mode-specific offset

## API Integration

### Google Maps Integration

**Tile Loading System**:
```javascript
function loadGoogleMapTile(lat, lon, zoom) {
    const tileCoords = latLonToTile(lat, lon, zoom);
    const url = `https://mt1.google.com/vt/lyrs=s&x=${tileCoords.x}&y=${tileCoords.y}&z=${zoom}`;
    
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}
```

**Coordinate Conversion**:
```javascript
// Lat/Lon to Tile Coordinates
function latLonToTile(lat, lon, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lon + 180) / 360 * n);
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 
        1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
    return { x, y };
}

// Lat/Lon to World Coordinates
function latLonToWorld(lat, lon) {
    const x = (lon - centerLon) * metersPerDegree;
    const z = (centerLat - lat) * metersPerDegree;
    return { x, z };
}
```

### Real Estate APIs

**API Call Structure**:
```javascript
async function fetchPropertyData(lat, lon) {
    const promises = [];
    
    // Try Rentcast
    if (apiConfig.rentcast) {
        promises.push(fetchRentcast(lat, lon));
    }
    
    // Try Attom
    if (apiConfig.attom) {
        promises.push(fetchAttom(lat, lon));
    }
    
    // Try Estated
    if (apiConfig.estated) {
        promises.push(fetchEstated(lat, lon));
    }
    
    const results = await Promise.allSettled(promises);
    return mergePropertyData(results);
}
```

**Error Handling**:
```javascript
async function fetchWithRetry(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}
```

## Rendering Pipeline

### Terrain Generation

**Height Map Creation**:
```javascript
function generateTerrain(width, height, resolution) {
    const geometry = new THREE.PlaneGeometry(
        width, height, 
        resolution, resolution
    );
    
    // Apply elevation data
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const elevation = getElevation(positions.getX(i), positions.getZ(i));
        positions.setY(i, elevation);
    }
    
    geometry.computeVertexNormals();
    return geometry;
}
```

**Texture Application**:
```javascript
function createTerrainMaterial(satelliteImage) {
    const texture = new THREE.Texture(satelliteImage);
    texture.needsUpdate = true;
    
    return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.8,
        metalness: 0.2
    });
}
```

### Building Generation

**Procedural Buildings**:
```javascript
function createBuilding(x, z, width, depth, height) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
        color: randomBuildingColor(),
        roughness: 0.7,
        metalness: 0.3
    });
    
    const building = new THREE.Mesh(geometry, material);
    building.position.set(x, height / 2, z);
    building.castShadow = true;
    building.receiveShadow = true;
    
    return building;
}
```

**Building Placement**:
```javascript
function placeBuildings(roads, density) {
    const buildings = [];
    
    for (const road of roads) {
        const buildingsAlongRoad = generateBuildingsAlongRoad(road, density);
        buildings.push(...buildingsAlongRoad);
    }
    
    return buildings;
}
```

### Lighting System

**Dynamic Lighting**:
```javascript
function updateLighting(timeOfDay) {
    // Sun position
    const sunAngle = (timeOfDay / 24) * Math.PI * 2;
    directionalLight.position.set(
        Math.cos(sunAngle) * 1000,
        Math.sin(sunAngle) * 1000,
        0
    );
    
    // Ambient light intensity
    ambientLight.intensity = 0.3 + Math.sin(sunAngle) * 0.2;
    
    // Sky color
    const skyColor = getSkyColor(timeOfDay);
    scene.background = new THREE.Color(skyColor);
}
```

### Sky System

**Sky Gradient**:
```javascript
function createSky() {
    const skyGeometry = new THREE.SphereGeometry(5000, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x0077ff) },
            bottomColor: { value: new THREE.Color(0xffffff) },
            offset: { value: 400 },
            exponent: { value: 0.6 }
        },
        vertexShader: `...`,
        fragmentShader: `...`,
        side: THREE.BackSide
    });
    
    return new THREE.Mesh(skyGeometry, skyMaterial);
}
```

## Performance Optimization

### Rendering Optimizations

**Level of Detail (LOD)**:
```javascript
// Use simpler meshes for distant objects
function createLODBuilding(x, z, distance) {
    if (distance > 1000) {
        return createSimpleBox(x, z);
    } else if (distance > 500) {
        return createMediumDetailBuilding(x, z);
    } else {
        return createHighDetailBuilding(x, z);
    }
}
```

**Frustum Culling**:
- Automatic via Three.js
- Only visible objects rendered
- Significant performance gain

**Instanced Rendering**:
```javascript
// For repeated objects (trees, lampposts)
const instancedGeometry = new THREE.InstancedBufferGeometry();
const instancedMesh = new THREE.InstancedMesh(
    geometry,
    material,
    count
);
```

### Memory Management

**Texture Management**:
```javascript
function disposeTexture(texture) {
    if (texture) {
        texture.dispose();
        texture = null;
    }
}

function clearOldTiles() {
    const visibleTiles = getVisibleTiles();
    for (const tile of loadedTiles) {
        if (!visibleTiles.includes(tile)) {
            disposeTile(tile);
        }
    }
}
```

**Geometry Pooling**:
```javascript
const geometryPool = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 16, 16),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 16)
};

// Reuse geometries instead of creating new ones
```

### Update Optimizations

**Delta Time**:
```javascript
let lastTime = performance.now();

function getDeltaTime() {
    const currentTime = performance.now();
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    return Math.min(dt, 0.1); // Cap at 100ms
}
```

**Update Frequency**:
```javascript
let physicsAccumulator = 0;
const PHYSICS_TIMESTEP = 1/60;

function update(dt) {
    physicsAccumulator += dt;
    
    while (physicsAccumulator >= PHYSICS_TIMESTEP) {
        updatePhysics(PHYSICS_TIMESTEP);
        physicsAccumulator -= PHYSICS_TIMESTEP;
    }
    
    updateCamera(dt);
    updateHUD(dt);
}
```

## Customization Guide

### Adding New Cities

```javascript
const locations = {
    // Add your city here
    mycity: {
        name: 'My City',
        region: 'My State, My Country',
        lat: 12.3456,
        lon: -78.9012
    }
};
```

Then add HTML:
```html
<div class="loc" data-loc="mycity">
    <div class="loc-name">My City</div>
    <div class="loc-region">My State, My Country</div>
</div>
```

### Customizing Physics

**Car Handling**:
```javascript
// At top of file, find these constants
const MAX_SPEED = 35;           // Maximum speed
const ACCELERATION = 15;        // Acceleration rate
const FRICTION = 0.95;          // Friction coefficient
const TURN_SPEED = 2.0;         // Turning sensitivity
const DRIFT_FACTOR = 0.7;       // Drift amount
```

**Walking Speed**:
```javascript
const WALK_SPEED = 8;           // Walking speed
const RUN_MULTIPLIER = 2;       // Running speed multiplier
const JUMP_VELOCITY = 10;       // Jump strength
const GRAVITY = -25;            // Gravity strength
```

### Adding New Game Modes

```javascript
// 1. Add mode to menu
<div class="mode" data-mode="mymode">
    <div class="mode-icon">🎮</div>
    <div>
        <div class="mode-name">My Mode</div>
        <div class="mode-desc">Description of my mode</div>
    </div>
    <div class="mode-check">✓</div>
</div>

// 2. Add mode logic
function startMyMode() {
    gameMode = 'mymode';
    // Initialize mode
}

function updateMyMode(dt) {
    // Mode-specific logic
}

// 3. Add to mode switcher
function startMode() {
    switch(gameMode) {
        case 'mymode': startMyMode(); break;
        // ... other modes
    }
}
```

### Customizing Graphics

**Building Colors**:
```javascript
function randomBuildingColor() {
    const colors = [
        0xcccccc,  // Gray
        0xdddddd,  // Light gray
        0xe8d5b7,  // Beige
        // Add your colors here (hex format)
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}
```

**Car Appearance**:
```javascript
const carMaterial = new THREE.MeshStandardMaterial({
    color: 0xff0000,        // Change color
    metalness: 0.8,         // Change metallicness
    roughness: 0.2          // Change roughness
});
```

### Adding UI Elements

```html
<!-- Add to HTML section -->
<div id="myElement" class="my-class">
    Content here
</div>
```

```javascript
// Add event handler in setupUI()
document.getElementById('myElement').addEventListener('click', () => {
    // Handle click
});
```

## Troubleshooting

### Common Issues

**Issue: Black Screen**
- **Cause**: WebGL not supported or initialization failed
- **Fix**: Check browser console, update graphics drivers

**Issue: Terrain Not Loading**
- **Cause**: Google Maps API rate limit or network error
- **Fix**: Check console, wait a moment, try again

**Issue: Poor Performance**
- **Cause**: Too many objects, old hardware
- **Fix**: Reduce building density, lower resolution

**Issue**: Properties Not Showing**
- **Cause**: API keys missing or invalid
- **Fix**: Check configuration, verify keys in dashboards

### Debugging Tools

**Console Logging**:
```javascript
// Enable debug mode
const DEBUG = true;

function debugLog(message, data) {
    if (DEBUG) {
        console.log(`[DEBUG] ${message}`, data);
    }
}
```

**Performance Monitoring**:
```javascript
// Three.js stats
import Stats from 'three/examples/jsm/libs/stats.module.js';

const stats = new Stats();
document.body.appendChild(stats.dom);

function renderLoop() {
    stats.begin();
    // ... render code
    stats.end();
}
```

**Network Monitoring**:
- Use browser DevTools Network tab
- Check API response codes
- Monitor payload sizes

### Performance Profiling

**Chrome DevTools**:
1. Open DevTools (F12)
2. Go to Performance tab
3. Click Record
4. Perform actions
5. Stop recording
6. Analyze flame graph

**Key Metrics**:
- Frame time (should be < 16.67ms for 60fps)
- JavaScript execution time
- Rendering time
- Memory usage

## Best Practices

### Code Organization

1. **Constants at Top**: Easy to find and modify
2. **Functions Before Use**: Avoid hoisting confusion
3. **Comment Complex Logic**: Explain the "why"
4. **Consistent Naming**: camelCase for variables/functions
5. **Single Responsibility**: One function, one purpose

### Performance

1. **Minimize DOM Access**: Cache elements
2. **Use RequestAnimationFrame**: For smooth rendering
3. **Throttle Heavy Operations**: Use timers
4. **Dispose Unused Objects**: Prevent memory leaks
5. **Profile Regularly**: Find bottlenecks early

### API Usage

1. **Cache Responses**: Avoid redundant calls
2. **Handle Errors Gracefully**: Don't crash on API failure
3. **Respect Rate Limits**: Implement delays
4. **Validate Data**: Check API responses
5. **Provide Fallbacks**: Multiple API sources

---

**For More Information**: See [README](README.md) and [User Guide](USER_GUIDE.md)

**Last Updated**: February 2026
