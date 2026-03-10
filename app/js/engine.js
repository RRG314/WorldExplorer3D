import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
// engine.js - Three.js initialization, renderer, scene, lighting, car mesh
// ============================================================================

// Textures will be created in init()
let asphaltTex,asphaltNormal,asphaltRoughness,windowTextures = {};
let buildingNormalMap = null,buildingRoughnessMap = null;
let currentGpuTier = 'high';
const RENDER_QUALITY_LOW = 'low';
const RENDER_QUALITY_MED = 'med';
const RENDER_QUALITY_HIGH = 'high';
const RENDER_QUALITY_STORAGE_KEY = 'worldExplorerRenderQualityLevel';
const SSAO_STORAGE_KEY = 'worldExplorerSsaoEnabled';
let renderQualityLevel = RENDER_QUALITY_MED;
let hdrEnvMap = null;
let fallbackEnvMap = null;
let hdrLoadRequested = false;
let carPaintMaterial = null;
let ssaoEnabled = false;
const USE_HERO_CAR_ASSET = false;

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures.
  }
}

function normalizeRenderQualityLevel(level) {
  const raw = String(level || '').toLowerCase();
  if (raw === RENDER_QUALITY_LOW || raw === 'performance') return RENDER_QUALITY_LOW;
  if (raw === RENDER_QUALITY_HIGH || raw === 'quality') return RENDER_QUALITY_HIGH;
  return RENDER_QUALITY_MED;
}

function isLikelyMobileDevice() {
  try {
    if (typeof navigator === 'undefined') return false;
    const ua = String(navigator.userAgent || '').toLowerCase();
    const touchPoints = Number(navigator.maxTouchPoints || 0);
    return /android|iphone|ipad|mobile/.test(ua) || touchPoints >= 3;
  } catch {
    return false;
  }
}

function getRenderQualityLevel() {
  return renderQualityLevel;
}

function syncTextureGlobals() {
  appCtx.asphaltTex = asphaltTex;
  appCtx.asphaltNormal = asphaltNormal;
  appCtx.asphaltRoughness = asphaltRoughness;
  appCtx.grassDiffuse = grassDiffuse;
  appCtx.grassNormal = grassNormal;
  appCtx.grassRoughness = grassRoughness;
  appCtx.pavementDiffuse = pavementDiffuse;
  appCtx.pavementNormal = pavementNormal;
  appCtx.pavementRoughness = pavementRoughness;
  appCtx.concreteDiffuse = concreteDiffuse;
  appCtx.concreteNormal = concreteNormal;
  appCtx.concreteRoughness = concreteRoughness;
  appCtx.brickDiffuse = brickDiffuse;
  appCtx.brickNormal = brickNormal;
  appCtx.brickRoughness = brickRoughness;
  appCtx.buildingNormalMap = buildingNormalMap;
  appCtx.buildingRoughnessMap = buildingRoughnessMap;
  appCtx.windowTextures = windowTextures;
}

function clearWindowTextureCache() {
  windowTextures = {};
  appCtx.windowTextures = windowTextures;
}

// PBR ground textures (grass for terrain)
let grassDiffuse = null,grassNormal = null,grassRoughness = null;
// PBR pavement textures (concrete ground around buildings)
let pavementDiffuse = null,pavementNormal = null,pavementRoughness = null;
// PBR building textures (concrete, brick)
let concreteDiffuse = null,concreteNormal = null,concreteRoughness = null;
let brickDiffuse = null,brickNormal = null,brickRoughness = null;
// Track texture loading state
let pbrTexturesLoaded = { grass: false, pavement: false, concrete: false, brick: false };

syncTextureGlobals();

// ===== PROCEDURAL TEXTURES =====
function createAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; // Reduced from 512 for compatibility
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a2a2a';ctx.fillRect(0, 0, 256, 256);
  // RDT-seeded deterministic asphalt speckle
  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xA5FA17) : Math.random.bind(Math);
  for (let i = 0; i < 2000; i++) {
    const x = rng() * 256,y = rng() * 256;
    const brightness = 20 + rng() * 40;
    ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  return texture;
}

function createAsphaltNormal() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; // Reduced from 256
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8080ff';ctx.fillRect(0, 0, 128, 128);
  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xB0B041) : Math.random.bind(Math);
  for (let i = 0; i < 500; i++) {
    const x = rng() * 128,y = rng() * 128;
    ctx.fillStyle = `rgb(${120 + rng() * 20}, ${120 + rng() * 20}, ${230 + rng() * 25})`;
    ctx.fillRect(x, y, 2, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  return texture;
}

function createRoughnessMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  // Asphalt is rough - base level
  ctx.fillStyle = '#e0e0e0'; // High roughness
  ctx.fillRect(0, 0, 128, 128);
  // RDT-seeded deterministic roughness variation
  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xC0FFEE) : Math.random.bind(Math);
  for (let i = 0; i < 800; i++) {
    const x = rng() * 128;
    const y = rng() * 128;
    const brightness = 200 + rng() * 55;
    ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
    ctx.fillRect(x, y, 2, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  return texture;
}

function createBuildingNormalMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  // Flat neutral normal base
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, 128, 256);
  // Horizontal lines for floor separations
  for (let y = 0; y < 256; y += 14) {
    ctx.fillStyle = '#7878ff';
    ctx.fillRect(0, y, 128, 1);
    ctx.fillStyle = '#8888ff';
    ctx.fillRect(0, y + 1, 128, 1);
  }
  // Vertical lines for window frames
  for (let x = 0; x < 128; x += 16) {
    ctx.fillStyle = '#7878ff';
    ctx.fillRect(x, 0, 1, 256);
  }
  // Subtle brick-like variation
  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(0xB21C4) : Math.random.bind(Math);
  for (let i = 0; i < 400; i++) {
    const x = rng() * 128,y = rng() * 256;
    ctx.fillStyle = `rgb(${124 + rng() * 12}, ${124 + rng() * 12}, ${240 + rng() * 15})`;
    ctx.fillRect(x, y, 3, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
}

function createBuildingRoughnessMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  // Moderate roughness base (plaster/concrete)
  ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(0, 0, 64, 128);
  // Window areas are smoother (glass)
  for (let floor = 0; floor < 9; floor++) {
    for (let col = 0; col < 4; col++) {
      ctx.fillStyle = '#404040'; // Low roughness = smooth glass
      ctx.fillRect(col * 14 + 3, floor * 14 + 3, 10, 10);
    }
  }
  // Add variation
  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(0xA0060) : Math.random.bind(Math);
  for (let i = 0; i < 200; i++) {
    const x = rng() * 64,y = rng() * 128;
    const b = 180 + rng() * 55;
    ctx.fillStyle = `rgb(${b}, ${b}, ${b})`;
    ctx.fillRect(x, y, 2, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
}

function createWindowTexture(baseColor, seed) {
  // Cache key includes location seed so textures are deterministic per city
  const cacheKey = baseColor + '_' + (appCtx.rdtSeed || 0);
  if (windowTextures[cacheKey]) return windowTextures[cacheKey];

  const canvas = document.createElement('canvas');
  canvas.width = 64; // Reduced from 128
  canvas.height = 256; // Reduced from 512
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;ctx.fillRect(0, 0, 64, 256);
  const ww = 10,wh = 12,spacing = 3; // Smaller windows

  // Use RDT-seeded random for deterministic window lights per location
  const rng = typeof appCtx.seededRandom === 'function' ?
  appCtx.seededRandom((seed || appCtx.rdtSeed || 42) ^ cacheKey.length) :
  Math.random.bind(Math);

  for (let floor = 0; floor < 18; floor++) {
    for (let col = 0; col < 4; col++) {
      const x = col * (ww + spacing) + spacing;
      const y = floor * (wh + spacing) + spacing;
      const r1 = rng(),r2 = rng();
      ctx.fillStyle = r1 > 0.3 ? `rgba(255, 220, 150, ${0.6 + r2 * 0.4})` : 'rgba(20, 30, 40, 0.8)';
      ctx.fillRect(x, y, ww, wh);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  windowTextures[cacheKey] = texture;
  return texture;
}

// ===== HIGH-QUALITY PROCEDURAL GRASS TEXTURES (fallback for CDN) =====
function createProceduralGrassTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Strong green base - unmistakably grass
  ctx.fillStyle = '#3a6b22';
  ctx.fillRect(0, 0, size, size);

  // Layer 1: Earthy undertone patches (dirt showing through)
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * size,y = Math.random() * size;
    const b = 55 + Math.random() * 40;
    ctx.fillStyle = `rgba(${b + 25}, ${b + 15}, ${b - 5}, ${0.08 + Math.random() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + Math.random() * 12, 3 + Math.random() * 8, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Layer 2: Dark green grass clumps (shadow areas)
  for (let i = 0; i < 2000; i++) {
    const x = Math.random() * size,y = Math.random() * size;
    const g = 60 + Math.random() * 40;
    ctx.fillStyle = `rgba(${20 + Math.random() * 20}, ${g}, ${5 + Math.random() * 15}, 0.3)`;
    ctx.beginPath();
    ctx.ellipse(x, y, 1 + Math.random() * 3, 0.5 + Math.random() * 1.5, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Layer 3: Grass blades - clearly visible green strokes
  ctx.lineCap = 'round';
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * size,y = Math.random() * size;
    const g = 100 + Math.random() * 90;
    const r = 25 + Math.random() * 45;
    const b = 5 + Math.random() * 20;
    const alpha = 0.3 + Math.random() * 0.5;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.2;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    const len = 3 + Math.random() * 8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(angle) * len * 0.5 + (Math.random() - 0.5) * 2,
      y + Math.sin(angle) * len * 0.5,
      x + Math.cos(angle) * len,
      y + Math.sin(angle) * len
    );
    ctx.stroke();
  }

  // Layer 4: Bright highlights on grass tips
  for (let i = 0; i < 2000; i++) {
    const x = Math.random() * size,y = Math.random() * size;
    ctx.fillStyle = `rgba(${70 + Math.random() * 50}, ${150 + Math.random() * 80}, ${20 + Math.random() * 30}, ${0.15 + Math.random() * 0.25})`;
    ctx.fillRect(x, y, 1, 1 + Math.random());
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function createProceduralGrassNormal() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Neutral normal base
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, size, size);

  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xB14DE5) : Math.random.bind(Math);

  // Grass blade normals (directional perturbations)
  for (let i = 0; i < 5000; i++) {
    const x = rng() * size,y = rng() * size;
    const nx = 120 + rng() * 16;
    const ny = 120 + rng() * 16;
    const nz = 220 + rng() * 35;
    ctx.fillStyle = `rgb(${nx}, ${ny}, ${nz})`;
    const angle = rng() * Math.PI;
    const len = 2 + rng() * 5;
    ctx.save();
    ctx.translate(x % size, y % size);
    ctx.rotate(angle);
    ctx.fillRect(-len / 2, -0.5, len, 1);
    ctx.restore();
  }

  // Larger bumps for ground undulation
  for (let i = 0; i < 600; i++) {
    const x = rng() * size,y = rng() * size;
    const perturbX = 118 + rng() * 20;
    const perturbY = 118 + rng() * 20;
    ctx.fillStyle = `rgb(${perturbX}, ${perturbY}, ${230 + rng() * 25})`;
    ctx.beginPath();
    ctx.arc(x % size, y % size, 2 + rng() * 5, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createProceduralGrassRoughness() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Grass is generally rough
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, size, size);

  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xD1B7) : Math.random.bind(Math);

  // Variation - some spots slightly smoother (dewy grass) or rougher (dry patches)
  for (let i = 0; i < 2000; i++) {
    const x = rng() * size,y = rng() * size;
    const brightness = 170 + rng() * 85;
    ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
    ctx.fillRect(x, y, 1 + rng() * 3, 1 + rng() * 3);
  }

  // Dirt patches are slightly smoother
  for (let i = 0; i < 100; i++) {
    const x = rng() * size,y = rng() * size;
    const brightness = 140 + rng() * 40;
    ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, 0.3)`;
    ctx.beginPath();
    ctx.arc(x, y, 3 + rng() * 6, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// ===== IMPROVED BUILDING FACADE TEXTURES =====
function createConcreteFacadeTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Concrete base color
  ctx.fillStyle = '#9a9590';
  ctx.fillRect(0, 0, size, size);

  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xC0C0) : Math.random.bind(Math);

  // Concrete grain noise
  for (let i = 0; i < 8000; i++) {
    const x = rng() * size,y = rng() * size;
    const brightness = 130 + rng() * 50;
    ctx.fillStyle = `rgba(${brightness}, ${brightness - 5}, ${brightness - 8}, 0.15)`;
    ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
  }

  // Concrete panel lines (horizontal)
  for (let y = 0; y < size; y += 64) {
    ctx.fillStyle = 'rgba(80, 75, 70, 0.25)';
    ctx.fillRect(0, y, size, 1);
    ctx.fillStyle = 'rgba(170, 165, 160, 0.2)';
    ctx.fillRect(0, y + 1, size, 1);
  }

  // Stain/weathering patches
  for (let i = 0; i < 30; i++) {
    const x = rng() * size,y = rng() * size;
    const w = 10 + rng() * 40,h = 5 + rng() * 20;
    ctx.fillStyle = `rgba(${70 + rng() * 30}, ${65 + rng() * 30}, ${60 + rng() * 30}, ${0.05 + rng() * 0.1})`;
    ctx.fillRect(x, y, w, h);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function createConcreteNormalMap() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, size, size);

  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xC1C1) : Math.random.bind(Math);

  // Panel joint normals
  for (let y = 0; y < size; y += 64) {
    ctx.fillStyle = '#7070f0';
    ctx.fillRect(0, y, size, 2);
    ctx.fillStyle = '#9090ff';
    ctx.fillRect(0, y + 2, size, 1);
  }

  // Surface texture bumps
  for (let i = 0; i < 3000; i++) {
    const x = rng() * size,y = rng() * size;
    ctx.fillStyle = `rgb(${122 + rng() * 16}, ${122 + rng() * 16}, ${235 + rng() * 20})`;
    ctx.fillRect(x, y, 1 + rng() * 3, 1 + rng() * 3);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createConcreteRoughnessMap() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#cccccc';
  ctx.fillRect(0, 0, size, size);

  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xC2C2) : Math.random.bind(Math);

  for (let i = 0; i < 2000; i++) {
    const x = rng() * size,y = rng() * size;
    const b = 170 + rng() * 70;
    ctx.fillStyle = `rgb(${b}, ${b}, ${b})`;
    ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createBrickFacadeTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');

  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xB41C) : Math.random.bind(Math);

  // Mortar base color
  ctx.fillStyle = '#b0a89a';
  ctx.fillRect(0, 0, size, size);

  // Draw bricks
  const brickH = 16,brickW = 36,mortarW = 3;
  const colors = ['#8b4c39', '#934e3a', '#7d4535', '#a05a42', '#8a4937', '#7e4233'];

  for (let row = 0; row < size / (brickH + mortarW); row++) {
    const offsetX = row % 2 * (brickW / 2); // Stagger every other row
    for (let col = -1; col < size / (brickW + mortarW) + 1; col++) {
      const x = col * (brickW + mortarW) + offsetX;
      const y = row * (brickH + mortarW);

      // Base brick color with variation
      const baseColor = colors[Math.floor(rng() * colors.length)];
      ctx.fillStyle = baseColor;
      ctx.fillRect(x, y, brickW, brickH);

      // Brick surface noise
      for (let n = 0; n < 15; n++) {
        const nx = x + rng() * brickW;
        const ny = y + rng() * brickH;
        const brightness = rng() > 0.5 ? 20 : -20;
        ctx.fillStyle = `rgba(${128 + brightness}, ${60 + brightness}, ${40 + brightness}, 0.15)`;
        ctx.fillRect(nx, ny, 1 + rng() * 3, 1 + rng() * 2);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function createBrickNormalMap() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Neutral normal
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, size, size);

  const brickH = 16,brickW = 36,mortarW = 3;
  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xB41D) : Math.random.bind(Math);

  // Mortar groove normals (recessed)
  for (let row = 0; row < size / (brickH + mortarW); row++) {
    const y = row * (brickH + mortarW);
    // Horizontal mortar lines
    ctx.fillStyle = '#7070e0';
    ctx.fillRect(0, y + brickH, size, mortarW);
  }

  for (let row = 0; row < size / (brickH + mortarW); row++) {
    const offsetX = row % 2 * (brickW / 2);
    for (let col = -1; col < size / (brickW + mortarW) + 1; col++) {
      const x = col * (brickW + mortarW) + offsetX;
      const y = row * (brickH + mortarW);
      // Vertical mortar lines
      ctx.fillStyle = '#7070e0';
      ctx.fillRect(x + brickW, y, mortarW, brickH);

      // Brick surface variation
      for (let n = 0; n < 8; n++) {
        const nx = x + rng() * brickW;
        const ny = y + rng() * brickH;
        ctx.fillStyle = `rgb(${124 + rng() * 12}, ${124 + rng() * 12}, ${240 + rng() * 15})`;
        ctx.fillRect(nx, ny, 2 + rng() * 3, 1 + rng() * 2);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createBrickRoughnessMap() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Brick is moderately rough
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(0, 0, size, size);

  const brickH = 8,mortarW = 2;
  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xB41E) : Math.random.bind(Math);

  // Mortar is rougher than brick
  for (let row = 0; row < size / (brickH + mortarW); row++) {
    const y = row * (brickH + mortarW);
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(0, y + brickH, size, mortarW);
  }

  // Brick surface roughness variation
  for (let i = 0; i < 1500; i++) {
    const x = rng() * size,y = rng() * size;
    const b = 160 + rng() * 70;
    ctx.fillStyle = `rgb(${b}, ${b}, ${b})`;
    ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// ===== PROCEDURAL PAVEMENT/SIDEWALK TEXTURES (fallback for CDN) =====
function createPavementTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Concrete/sidewalk base color - light gray
  ctx.fillStyle = '#b0aba5';
  ctx.fillRect(0, 0, size, size);

  // Concrete grain
  for (let i = 0; i < 10000; i++) {
    const x = Math.random() * size,y = Math.random() * size;
    const b = 140 + Math.random() * 60;
    ctx.fillStyle = `rgba(${b + 5}, ${b}, ${b - 5}, 0.12)`;
    ctx.fillRect(x, y, 1, 1);
  }

  // Sidewalk panel lines (grid pattern)
  ctx.strokeStyle = 'rgba(80, 75, 70, 0.35)';
  ctx.lineWidth = 2;
  for (let x = 0; x < size; x += 128) {
    ctx.beginPath();ctx.moveTo(x, 0);ctx.lineTo(x, size);ctx.stroke();
  }
  for (let y = 0; y < size; y += 128) {
    ctx.beginPath();ctx.moveTo(0, y);ctx.lineTo(size, y);ctx.stroke();
  }

  // Subtle stains/weathering
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size,y = Math.random() * size;
    ctx.fillStyle = `rgba(${80 + Math.random() * 40}, ${75 + Math.random() * 40}, ${70 + Math.random() * 40}, ${0.04 + Math.random() * 0.06})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 5 + Math.random() * 20, 3 + Math.random() * 10, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function createPavementNormalMap() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, size, size);

  // Panel joint grooves
  for (let x = 0; x < size; x += 128) {
    ctx.fillStyle = '#6060e0';
    ctx.fillRect(x - 1, 0, 3, size);
    ctx.fillStyle = '#a0a0ff';
    ctx.fillRect(x + 2, 0, 1, size);
  }
  for (let y = 0; y < size; y += 128) {
    ctx.fillStyle = '#6060e0';
    ctx.fillRect(0, y - 1, size, 3);
    ctx.fillStyle = '#a0a0ff';
    ctx.fillRect(0, y + 2, size, 1);
  }

  // Surface micro-bumps
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * size,y = Math.random() * size;
    ctx.fillStyle = `rgb(${123 + Math.random() * 14}, ${123 + Math.random() * 14}, ${240 + Math.random() * 15})`;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createPavementRoughnessMap() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Concrete is moderately rough
  ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2000; i++) {
    const x = Math.random() * size,y = Math.random() * size;
    const b = 170 + Math.random() * 60;
    ctx.fillStyle = `rgb(${b}, ${b}, ${b})`;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Create terrain-conforming building ground support meshes.
// Returns either a single mesh or an array of meshes (apron + foundation skirt).
function createBuildingGroundPatch(pts, avgElevation) {
  if (!pts || pts.length < 3) return null;
  const footprint = pts.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  if (footprint.length < 3) return null;

  const baseElevation = Number.isFinite(avgElevation) ? avgElevation : 0;

  const sampleTerrainY = (x, z) => {
    const terrainY = typeof appCtx.terrainMeshHeightAt === 'function' ?
    appCtx.terrainMeshHeightAt(x, z) :
    appCtx.elevationWorldYAtWorldXZ(x, z);
    const safeTerrainY = Number.isFinite(terrainY) ? terrainY : baseElevation;
    return safeTerrainY === 0 && Math.abs(baseElevation) > 2 ? baseElevation : safeTerrainY;
  };

  const resultMeshes = [];

  // Expand footprint to create a sidewalk-like terrain patch around the building.
  const cx = footprint.reduce((s, p) => s + p.x, 0) / footprint.length;
  const cz = footprint.reduce((s, p) => s + p.z, 0) / footprint.length;
  const expandFactor = 1.45;
  const expandedPts = footprint.map((p) => ({
    x: cx + (p.x - cx) * expandFactor,
    z: cz + (p.z - cz) * expandFactor
  }));

  const shape = new THREE.Shape();
  expandedPts.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, -p.z);else
    shape.lineTo(p.x, -p.z);
  });
  shape.closePath();

  const apronGeometry = new THREE.ShapeGeometry(shape, 1);
  apronGeometry.rotateX(-Math.PI / 2);

  // Deform the apron to terrain.
  const apronPositions = apronGeometry.attributes.position;
  for (let i = 0; i < apronPositions.count; i++) {
    const x = apronPositions.getX(i);
    const z = apronPositions.getZ(i);
    const useY = sampleTerrainY(x, z);
    apronPositions.setY(i, useY - baseElevation + 0.05);
  }
  apronPositions.needsUpdate = true;
  apronGeometry.computeVertexNormals();

  const apronUvs = apronGeometry.attributes.uv;
  if (apronUvs) {
    for (let i = 0; i < apronUvs.count; i++) {
      const x = apronPositions.getX(i);
      const z = apronPositions.getZ(i);
      apronUvs.setXY(i, x / 8, z / 8);
    }
    apronUvs.needsUpdate = true;
  }

  let apronMaterial;
  if (pbrTexturesLoaded.pavement && pavementDiffuse) {
    apronMaterial = new THREE.MeshStandardMaterial({
      map: pavementDiffuse,
      normalMap: pavementNormal || undefined,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: pavementRoughness || undefined,
      roughness: 0.9,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  } else {
    apronMaterial = new THREE.MeshStandardMaterial({
      color: 0xa8a29e,
      roughness: 0.9,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  }

  const apronMesh = new THREE.Mesh(apronGeometry, apronMaterial);
  apronMesh.position.y = baseElevation;
  apronMesh.renderOrder = 1;
  apronMesh.receiveShadow = true;
  apronMesh.userData.buildingGround = true;
  apronMesh.userData.alwaysVisible = true;
  apronMesh.visible = true;
  resultMeshes.push(apronMesh);

  // Build a vertical skirt at the real building footprint so sloped terrain
  // cannot reveal floating building undersides.
  const skirtPositions = [];
  const skirtUvs = [];
  const skirtIndices = [];
  let skirtVertBase = 0;

  const maxSkirtSegmentLength = 2.0;
  const skirtTopY = 0.04;
  const skirtBaseEmbedDepth = 0.8;

  for (let i = 0; i < footprint.length; i++) {
    const p0 = footprint[i];
    const p1 = footprint[(i + 1) % footprint.length];
    const edgeLength = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    if (!Number.isFinite(edgeLength) || edgeLength < 0.05) continue;

    const segments = Math.max(1, Math.ceil(edgeLength / maxSkirtSegmentLength));
    let edgeU = 0;

    for (let s = 0; s < segments; s++) {
      const t0 = s / segments;
      const t1 = (s + 1) / segments;
      const q0 = {
        x: p0.x + (p1.x - p0.x) * t0,
        z: p0.z + (p1.z - p0.z) * t0
      };
      const q1 = {
        x: p0.x + (p1.x - p0.x) * t1,
        z: p0.z + (p1.z - p0.z) * t1
      };
      const segmentLength = Math.hypot(q1.x - q0.x, q1.z - q0.z);
      if (!Number.isFinite(segmentLength) || segmentLength < 0.01) continue;

      const localTerrain0 = sampleTerrainY(q0.x, q0.z) - baseElevation;
      const localTerrain1 = sampleTerrainY(q1.x, q1.z) - baseElevation;
      const embedDepth0 = skirtBaseEmbedDepth + Math.min(2.5, Math.abs(localTerrain0 - skirtTopY) * 0.15);
      const embedDepth1 = skirtBaseEmbedDepth + Math.min(2.5, Math.abs(localTerrain1 - skirtTopY) * 0.15);
      const bottomY0 = Math.min(localTerrain0, skirtTopY) - embedDepth0;
      const bottomY1 = Math.min(localTerrain1, skirtTopY) - embedDepth1;
      const u0 = edgeU;
      const u1 = edgeU + segmentLength / 6;
      edgeU = u1;

      skirtPositions.push(
        q0.x, skirtTopY, q0.z,
        q1.x, skirtTopY, q1.z,
        q0.x, bottomY0, q0.z,
        q1.x, bottomY1, q1.z
      );

      skirtUvs.push(
        u0, 1,
        u1, 1,
        u0, 0,
        u1, 0
      );

      skirtIndices.push(
        skirtVertBase, skirtVertBase + 2, skirtVertBase + 1,
        skirtVertBase + 1, skirtVertBase + 2, skirtVertBase + 3
      );
      skirtVertBase += 4;
    }
  }

  if (skirtVertBase >= 4) {
    const skirtGeometry = new THREE.BufferGeometry();
    skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3));
    skirtGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(skirtUvs, 2));
    skirtGeometry.setIndex(skirtIndices);
    skirtGeometry.computeVertexNormals();

    let skirtMaterial;
    if (pbrTexturesLoaded.pavement && pavementDiffuse) {
      skirtMaterial = new THREE.MeshStandardMaterial({
        map: pavementDiffuse,
        normalMap: pavementNormal || undefined,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughnessMap: pavementRoughness || undefined,
        roughness: 0.94,
        metalness: 0.0,
        side: THREE.DoubleSide
      });
    } else {
      skirtMaterial = new THREE.MeshStandardMaterial({
        color: 0x968f88,
        roughness: 0.94,
        metalness: 0.0,
        side: THREE.DoubleSide
      });
    }

    const skirtMesh = new THREE.Mesh(skirtGeometry, skirtMaterial);
    skirtMesh.position.y = baseElevation;
    skirtMesh.renderOrder = 0;
    skirtMesh.receiveShadow = true;
    skirtMesh.userData.buildingGround = true;
    skirtMesh.userData.isFoundationSkirt = true;
    skirtMesh.userData.alwaysVisible = true;
    skirtMesh.visible = true;
    resultMeshes.push(skirtMesh);
  }

  return resultMeshes.length === 1 ? resultMeshes[0] : resultMeshes;
}

// ===== PBR TEXTURE LOADER (Poly Haven CDN with procedural fallback) =====
function loadPBRTextureSet(name, urls, onLoaded, fallbackFns) {
  const loader = new THREE.TextureLoader();
  let loadedCount = 0;
  let resolved = false;
  const textures = { diff: null, nor: null, rough: null };
  const total = 3;

  function resolve(fromCDN) {
    if (resolved) return;
    resolved = true;
    if (fromCDN && textures.diff && textures.nor && textures.rough) {
      onLoaded(textures.diff, textures.nor, textures.rough, true);
    } else {
      // Use procedural fallback for any that failed
      const fb = fallbackFns();
      onLoaded(
        textures.diff || fb.diff,
        textures.nor || fb.nor,
        textures.rough || fb.rough,
        false
      );
    }
  }

  function checkDone() {
    loadedCount++;
    if (loadedCount >= total) {
      resolve(!!(textures.diff && textures.nor && textures.rough));
    }
  }

  // Timeout: if CDN loads don't complete in 4 seconds, use procedural fallback
  setTimeout(function () {
    if (!resolved) {
      console.warn('PBR texture CDN timeout (' + name + '), using procedural fallback');
      resolve(false);
    }
  }, 4000);

  function loadTex(key, url, encoding) {
    loader.load(url,
    function (tex) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      if (encoding) tex.encoding = encoding;
      textures[key] = tex;
      checkDone();
    },
    undefined,
    function () {
      console.warn('PBR texture load failed (' + name + ' ' + key + '), using fallback');
      checkDone();
    }
    );
  }

  loadTex('diff', urls.diff, THREE.sRGBEncoding);
  loadTex('nor', urls.nor, null);
  loadTex('rough', urls.rough, null);
}

function initPBRTextures(maxAniso) {
  const aniso = Math.min(maxAniso, 8);

  // --- Grass/Ground textures (forrest_ground_01 - actual ground-level grass) ---
  loadPBRTextureSet('grass', {
    diff: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forrest_ground_01/forrest_ground_01_diff_1k.jpg',
    nor: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forrest_ground_01/forrest_ground_01_nor_gl_1k.jpg',
    rough: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forrest_ground_01/forrest_ground_01_rough_1k.jpg'
  }, function (diff, nor, rough, fromCDN) {
    grassDiffuse = diff;
    grassNormal = nor;
    grassRoughness = rough;
    syncTextureGlobals();
    [grassDiffuse, grassNormal, grassRoughness].forEach((t) => {
      if (t) {t.anisotropy = aniso;t.wrapS = t.wrapT = THREE.RepeatWrapping;}
    });
    pbrTexturesLoaded.grass = true;
    console.log('Grass textures ready (' + (fromCDN ? 'Poly Haven CDN' : 'procedural fallback') + ')');
    // Apply to existing terrain meshes
    applyGrassToTerrain();
  }, function () {
    return {
      diff: createProceduralGrassTexture(),
      nor: createProceduralGrassNormal(),
      rough: createProceduralGrassRoughness()
    };
  });

  // --- Pavement/sidewalk textures (brushed concrete for ground around buildings) ---
  loadPBRTextureSet('pavement', {
    diff: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brushed_concrete/brushed_concrete_diff_1k.jpg',
    nor: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brushed_concrete/brushed_concrete_nor_gl_1k.jpg',
    rough: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brushed_concrete/brushed_concrete_rough_1k.jpg'
  }, function (diff, nor, rough, fromCDN) {
    pavementDiffuse = diff;
    pavementNormal = nor;
    pavementRoughness = rough;
    syncTextureGlobals();
    [pavementDiffuse, pavementNormal, pavementRoughness].forEach((t) => {
      if (t) {t.anisotropy = aniso;t.wrapS = t.wrapT = THREE.RepeatWrapping;}
    });
    pbrTexturesLoaded.pavement = true;
    console.log('Pavement textures ready (' + (fromCDN ? 'Poly Haven CDN' : 'procedural fallback') + ')');
  }, function () {
    return {
      diff: createPavementTexture(),
      nor: createPavementNormalMap(),
      rough: createPavementRoughnessMap()
    };
  });

  // --- Concrete building textures ---
  loadPBRTextureSet('concrete', {
    diff: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete/concrete_diff_1k.jpg',
    nor: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete/concrete_nor_gl_1k.jpg',
    rough: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete/concrete_rough_1k.jpg'
  }, function (diff, nor, rough, fromCDN) {
    concreteDiffuse = diff;
    concreteNormal = nor;
    concreteRoughness = rough;
    syncTextureGlobals();
    [concreteDiffuse, concreteNormal, concreteRoughness].forEach((t) => {
      if (t) {t.anisotropy = aniso;t.wrapS = t.wrapT = THREE.RepeatWrapping;}
    });
    pbrTexturesLoaded.concrete = true;
    console.log('Concrete textures ready (' + (fromCDN ? 'Poly Haven CDN' : 'procedural fallback') + ')');
  }, function () {
    return {
      diff: createConcreteFacadeTexture(),
      nor: createConcreteNormalMap(),
      rough: createConcreteRoughnessMap()
    };
  });

  // --- Brick building textures ---
  loadPBRTextureSet('brick', {
    diff: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_diffuse_1k.jpg',
    nor: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_nor_gl_1k.jpg',
    rough: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_rough_1k.jpg'
  }, function (diff, nor, rough, fromCDN) {
    brickDiffuse = diff;
    brickNormal = nor;
    brickRoughness = rough;
    syncTextureGlobals();
    [brickDiffuse, brickNormal, brickRoughness].forEach((t) => {
      if (t) {t.anisotropy = aniso;t.wrapS = t.wrapT = THREE.RepeatWrapping;}
    });
    pbrTexturesLoaded.brick = true;
    console.log('Brick textures ready (' + (fromCDN ? 'Poly Haven CDN' : 'procedural fallback') + ')');
  }, function () {
    return {
      diff: createBrickFacadeTexture(),
      nor: createBrickNormalMap(),
      rough: createBrickRoughnessMap()
    };
  });
}

// Apply grass textures to existing terrain meshes (called after textures load)
function applyGrassToTerrain() {
  if (!grassDiffuse || !appCtx.terrainGroup) return;
  appCtx.terrainGroup.children.forEach(function (mesh) {
    if (!mesh.userData || !mesh.userData.terrainTile) return;
    const mat = mesh.material;
    if (!mat) return;

    // Calculate tile world size for proper texture tiling
    const info = mesh.userData.terrainTile;
    const bounds = info.bounds;
    const pNW = appCtx.geoToWorld(bounds.latN, bounds.lonW);
    const pNE = appCtx.geoToWorld(bounds.latN, bounds.lonE);
    const tileWidth = Math.abs(pNE.x - pNW.x);
    // Tile grass every ~25 world units (~28 meters) for visible detail
    const repeats = Math.max(10, Math.round(tileWidth / 25));

    if (typeof appCtx.classifyTerrainVisualProfile === 'function' &&
      typeof appCtx.applyTerrainVisualProfile === 'function')
    {
      const profile = appCtx.classifyTerrainVisualProfile(
        bounds,
        mesh.userData?.minElevationMeters,
        mesh.userData?.maxElevationMeters,
        mesh.userData?.elevationStatsMeters
      );
      appCtx.applyTerrainVisualProfile(mesh, profile, repeats);
      return;
    }

    mat.map = grassDiffuse.clone();
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
    mat.map.repeat.set(repeats, repeats);

    if (grassNormal) {
      mat.normalMap = grassNormal.clone();
      mat.normalMap.wrapS = mat.normalMap.wrapT = THREE.RepeatWrapping;
      mat.normalMap.repeat.set(repeats, repeats);
      mat.normalScale = new THREE.Vector2(0.6, 0.6);
    }
    if (grassRoughness) {
      mat.roughnessMap = grassRoughness.clone();
      mat.roughnessMap.wrapS = mat.roughnessMap.wrapT = THREE.RepeatWrapping;
      mat.roughnessMap.repeat.set(repeats, repeats);
    }
    mat.color.set(0xffffff); // Let the texture drive the color
    mat.needsUpdate = true;
  });
}

// Get building material based on building type (deterministic per building)
function getBuildingMaterial(buildingType, bSeed, baseColorHex) {
  const br1 = appCtx.rand01FromInt(bSeed);
  const br2 = appCtx.rand01FromInt(bSeed ^ 0x12345);

  // Decide facade type based on building type and seed
  let facadeType = 'window'; // default: procedural windows

  if (buildingType === 'industrial' || buildingType === 'warehouse') {
    facadeType = 'concrete';
  } else if (buildingType === 'house' || buildingType === 'residential' || buildingType === 'detached') {
    facadeType = br1 > 0.4 ? 'brick' : 'window';
  } else if (buildingType === 'apartments') {
    facadeType = br1 > 0.6 ? 'concrete' : 'window';
  } else if (buildingType === 'church' || buildingType === 'cathedral') {
    facadeType = 'brick';
  } else {
    // Mixed: ~30% concrete, ~25% brick, ~45% windowed
    if (br2 < 0.30) facadeType = 'concrete';else
    if (br2 < 0.55) facadeType = 'brick';
  }

  if (facadeType === 'concrete' && pbrTexturesLoaded.concrete && concreteDiffuse) {
    const mat = new THREE.MeshStandardMaterial({
      map: concreteDiffuse,
      normalMap: concreteNormal,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: concreteRoughness,
      roughness: 0.9,
      metalness: 0.02
    });
    return mat;
  }

  if (facadeType === 'brick' && pbrTexturesLoaded.brick && brickDiffuse) {
    const mat = new THREE.MeshStandardMaterial({
      map: brickDiffuse,
      normalMap: brickNormal,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughnessMap: brickRoughness,
      roughness: 0.88,
      metalness: 0.02
    });
    return mat;
  }

  // Default: procedural windows (existing system)
  const windowTex = createWindowTexture(baseColorHex, bSeed);
  const mat = new THREE.MeshStandardMaterial({
    map: windowTex,
    color: baseColorHex,
    roughness: 0.85,
    metalness: 0.05
  });
  if (buildingNormalMap) {
    mat.normalMap = buildingNormalMap;
    mat.normalScale = new THREE.Vector2(0.4, 0.4);
  }
  if (buildingRoughnessMap) {
    mat.roughnessMap = buildingRoughnessMap;
  }
  return mat;
}

const CFG = {
  maxSpd: 120, offMax: 60, accel: 12, boostAccel: 25, brake: 150, friction: 25, offFriction: 120,
  boostMax: 140, boostDur: 2.5,
  brakeForce: 4.0, // Strong braking
  // Grip settings - realistic car physics
  gripRoad: 0.88, // Normal road grip - realistic
  gripOff: 0.70, // Off-road grip
  gripBrake: 0.56, // Grip while handbraking
  gripDrift: 0.34, // Lower grip while drifting for rear-heavy slides
  driftRec: 5, // Car realignment speed after releasing drift
  // Turn settings - realistic steering
  turnLow: 1.8, // Turn rate at low speed - more realistic
  turnHigh: 0.8, // Turn rate at high speed - realistic
  turnMin: 30, // Speed where turn rate starts reducing
  // Road boundary settings
  roadForce: 0.93, // How much car slows when leaving road (strong)
  roadPushback: 0.3, // How much car is pushed back toward road
  maxOffDist: 15, // Max distance off road before strong pushback
  cpRadius: 25, trialTime: 120, policeSpd: 140, policeAccel: 60, policeDist: 800
};

// ESM compatibility bridge:
// physics/game/hud reference CFG as a global symbol.
Object.assign(appCtx, { CFG });

function createProceduralEnvironmentMap(pmremGenerator) {
  if (!pmremGenerator) return null;
  try {
    const envScene = new THREE.Scene();
    const envGeo = new THREE.SphereGeometry(120, 8, 8);
    const envMat = new THREE.MeshBasicMaterial({
      color: 0x87ceeb,
      side: THREE.BackSide
    });
    const envMesh = new THREE.Mesh(envGeo, envMat);
    envScene.add(envMesh);
    return pmremGenerator.fromScene(envScene, 0.04).texture;
  } catch (err) {
    console.warn('Procedural environment map generation failed:', err);
    return null;
  }
}

function getShadowMapResolution(level) {
  const normalized = normalizeRenderQualityLevel(level);
  if (normalized === RENDER_QUALITY_LOW) return 0;
  if (currentGpuTier === 'low') return normalized === RENDER_QUALITY_HIGH ? 512 : 256;
  if (currentGpuTier === 'mid') return normalized === RENDER_QUALITY_HIGH ? 1024 : 512;
  return normalized === RENDER_QUALITY_HIGH ? 2048 : 1024;
}

function applyRenderQuality(level, options = {}) {
  const normalized = normalizeRenderQualityLevel(level);
  renderQualityLevel = normalized;
  appCtx.renderQualityLevel = normalized;
  if (options.persist !== false) writeStorage(RENDER_QUALITY_STORAGE_KEY, normalized);

  if (appCtx.renderer) {
    const enableShadows = normalized !== RENDER_QUALITY_LOW;
    appCtx.renderer.shadowMap.enabled = enableShadows;
    appCtx.renderer.shadowMap.type = normalized === RENDER_QUALITY_HIGH ?
    THREE.PCFSoftShadowMap :
    THREE.BasicShadowMap;
    appCtx.renderer.toneMappingExposure = normalized === RENDER_QUALITY_HIGH ? 0.95 : normalized === RENDER_QUALITY_MED ? 0.9 : 0.85;
  }

  if (appCtx.sun) {
    const shadowRes = getShadowMapResolution(normalized);
    appCtx.sun.castShadow = shadowRes > 0;
    appCtx.sun.shadow.mapSize.width = shadowRes || 1;
    appCtx.sun.shadow.mapSize.height = shadowRes || 1;
    appCtx.sun.shadow.radius = normalized === RENDER_QUALITY_HIGH ? 3 : 1;
    appCtx.sun.shadow.needsUpdate = true;
  }

  if (normalized === RENDER_QUALITY_LOW) {
    appCtx.scene.environment = fallbackEnvMap || null;
  } else if (hdrEnvMap) {
    appCtx.scene.environment = hdrEnvMap;
  } else if (fallbackEnvMap) {
    appCtx.scene.environment = fallbackEnvMap;
  }

  if (carPaintMaterial) {
    const high = normalized === RENDER_QUALITY_HIGH;
    carPaintMaterial.envMapIntensity = high ? 1.5 : normalized === RENDER_QUALITY_MED ? 1.2 : 0.65;
    carPaintMaterial.roughness = high ? 0.14 : 0.2;
    carPaintMaterial.metalness = high ? 0.95 : 0.88;
    // Keep car finish simple and lightweight across tiers (no clearcoat layer).
    if ('clearcoat' in carPaintMaterial) {
      carPaintMaterial.clearcoat = 0.0;
      carPaintMaterial.clearcoatRoughness = 1.0;
    }
    carPaintMaterial.needsUpdate = true;
  }

  if (appCtx.ssaoPass) {
    appCtx.ssaoPass.enabled = ssaoEnabled && normalized === RENDER_QUALITY_HIGH;
  }
  if (appCtx.bloomPass) {
    // Keep bloom for medium/high only; low quality runs without post-fx.
    appCtx.bloomPass.enabled = normalized !== RENDER_QUALITY_LOW;
  }
  if (appCtx.smaaPass) {
    appCtx.smaaPass.enabled = normalized !== RENDER_QUALITY_LOW;
  }

  if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
  return normalized;
}

function ensureHdrEnvironment() {
  if (hdrLoadRequested || !appCtx.renderer || typeof THREE.RGBELoader === 'undefined') return;
  hdrLoadRequested = true;

  const pmremGenerator = appCtx.pmremGenerator;
  if (!pmremGenerator) return;

  const rgbeLoader = new THREE.RGBELoader();
  rgbeLoader.setDataType(THREE.UnsignedByteType);

  const applyHdrTexture = (hdrTexture) => {
    hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
    hdrEnvMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
    hdrTexture.dispose();
    if (renderQualityLevel !== RENDER_QUALITY_LOW) appCtx.scene.environment = hdrEnvMap;
    if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
  };

  rgbeLoader.load(
    'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_06_1k.hdr',
    applyHdrTexture,
    undefined,
    (err) => {
      console.warn('HDR environment load failed; using fallback environment only.', err);
    }
  );
}

function setRenderQualityLevel(level, options = {}) {
  const next = applyRenderQuality(level, options);
  if (next !== RENDER_QUALITY_LOW) ensureHdrEnvironment();
  return next;
}

function getHighQualityEnabled() {
  return renderQualityLevel === RENDER_QUALITY_HIGH;
}

function setHighQualityEnabled(enabled, options = {}) {
  if (enabled) return setRenderQualityLevel(RENDER_QUALITY_HIGH, options);
  const fallbackLevel = normalizeRenderQualityLevel(options.fallbackLevel || RENDER_QUALITY_MED);
  return setRenderQualityLevel(fallbackLevel, options);
}

function canUseSsao() {
  return !isLikelyMobileDevice() && currentGpuTier !== 'low';
}

function getSsaoEnabled() {
  return !!ssaoEnabled;
}

function setSsaoEnabled(enabled, options = {}) {
  ssaoEnabled = !!enabled && canUseSsao();
  appCtx.ssaoEnabled = ssaoEnabled;
  if (options.persist !== false) writeStorage(SSAO_STORAGE_KEY, ssaoEnabled ? '1' : '0');
  if (appCtx.ssaoPass) {
    appCtx.ssaoPass.enabled = ssaoEnabled && renderQualityLevel === RENDER_QUALITY_HIGH;
  }
  if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
  return ssaoEnabled;
}

function setupPostProcessingPipeline() {
  if (!appCtx.renderer || !appCtx.scene || !appCtx.camera) return false;
  if (currentGpuTier === 'low') return false;
  if (typeof THREE.EffectComposer === 'undefined' || typeof THREE.RenderPass === 'undefined') return false;

  try {
    appCtx.composer = new THREE.EffectComposer(appCtx.renderer);
    appCtx.composer.setSize(innerWidth, innerHeight);

    const renderPass = new THREE.RenderPass(appCtx.scene, appCtx.camera);
    appCtx.composer.addPass(renderPass);

    appCtx.ssaoPass = null;
    if (typeof THREE.SSAOPass !== 'undefined' && canUseSsao()) {
      try {
        appCtx.ssaoPass = new THREE.SSAOPass(appCtx.scene, appCtx.camera, innerWidth, innerHeight);
        appCtx.ssaoPass.kernelRadius = 10;
        appCtx.ssaoPass.minDistance = 0.001;
        appCtx.ssaoPass.maxDistance = 0.06;
        appCtx.ssaoPass.enabled = ssaoEnabled && renderQualityLevel === RENDER_QUALITY_HIGH;
        appCtx.composer.addPass(appCtx.ssaoPass);
      } catch (e) {
        console.warn('SSAO not available:', e);
        appCtx.ssaoPass = null;
      }
    }

    appCtx.bloomPass = null;
    if (typeof THREE.UnrealBloomPass !== 'undefined') {
      try {
        const bloomW = Math.floor(innerWidth / 2);
        const bloomH = Math.floor(innerHeight / 2);
        appCtx.bloomPass = new THREE.UnrealBloomPass(
          new THREE.Vector2(bloomW, bloomH),
          0.15, // strength - very subtle
          0.4, // radius
          0.85 // threshold - only bright things bloom
        );
        appCtx.bloomPass.enabled = renderQualityLevel !== RENDER_QUALITY_LOW;
        appCtx.composer.addPass(appCtx.bloomPass);
      } catch (e) {
        console.warn('Bloom not available:', e);
      }
    }

    appCtx.smaaPass = null;
    if (typeof THREE.SMAAPass !== 'undefined') {
      try {
        appCtx.smaaPass = new THREE.SMAAPass(
          innerWidth * appCtx.renderer.getPixelRatio(),
          innerHeight * appCtx.renderer.getPixelRatio()
        );
        appCtx.smaaPass.enabled = renderQualityLevel !== RENDER_QUALITY_LOW;
        appCtx.composer.addPass(appCtx.smaaPass);
      } catch (e) {
        console.warn('SMAA not available:', e);
      }
    }

    return true;
  } catch (e) {
    console.warn('Post-processing not available:', e);
    appCtx.composer = null;
    appCtx.ssaoPass = null;
    appCtx.bloomPass = null;
    appCtx.smaaPass = null;
    return false;
  }
}

function tryEnablePostProcessing() {
  if (appCtx.composer) return true;
  const enabled = setupPostProcessingPipeline();
  if (enabled) {
    console.log('[engine] Post-processing enabled after deferred script load.');
  }
  return enabled;
}

function normalizeLoadedCarModel(root) {
  if (!root) return;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);

  // Most DCC exports are X-forward. Rotate to Z-forward for this runtime.
  if (size.x > size.z * 1.15) {
    root.rotation.y = -Math.PI * 0.5;
    root.updateMatrixWorld(true);
    box.setFromObject(root);
    box.getSize(size);
  }

  const targetLength = 3.6;
  const sourceLength = Math.max(0.01, size.z);
  const scale = targetLength / sourceLength;
  root.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);

  box.setFromObject(root);
  const center = new THREE.Vector3();
  box.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
}

function createHeroCarMaterialSet() {
  const heroRed = 0xc31421;
  const body = new THREE.MeshPhysicalMaterial({
    color: heroRed,
    metalness: 0.95,
    roughness: 0.16,
    clearcoat: 0.5,
    clearcoatRoughness: 0.14,
    envMapIntensity: 1.4
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x97b9d6,
    metalness: 0,
    roughness: 0.08,
    transmission: 0.0,
    transparent: true,
    opacity: 0.34,
    envMapIntensity: 0.9
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0x1e2228,
    roughness: 0.62,
    metalness: 0.35
  });
  const light = new THREE.MeshStandardMaterial({
    color: 0xfff1d8,
    emissive: 0xfff1d8,
    emissiveIntensity: 0.7,
    roughness: 0.18,
    metalness: 0.05
  });

  const bodyLow = new THREE.MeshStandardMaterial({
    color: heroRed,
    metalness: 0.72,
    roughness: 0.3,
    envMapIntensity: 0.4
  });
  const glassLow = new THREE.MeshStandardMaterial({
    color: 0x8aa8be,
    roughness: 0.2,
    metalness: 0,
    transparent: true,
    opacity: 0.25
  });
  const trimLow = new THREE.MeshStandardMaterial({
    color: 0x22272c,
    roughness: 0.74,
    metalness: 0.1
  });
  const lightLow = new THREE.MeshStandardMaterial({
    color: 0xd8d0c4,
    emissive: 0x8f8a80,
    emissiveIntensity: 0.18,
    roughness: 0.36,
    metalness: 0
  });

  carPaintMaterial = body;
  return {
    high: { body, glass, trim, light },
    low: { body: bodyLow, glass: glassLow, trim: trimLow, light: lightLow }
  };
}

function heroCarBucketFromName(name = '') {
  const id = String(name || '').toLowerCase();
  if (id.includes('glass') || id.includes('window') || id.includes('windshield')) return 'glass';
  if (id.includes('light') || id.includes('lamp') || id.includes('head') || id.includes('tail')) return 'light';
  if (id.includes('wheel') || id.includes('tire') || id.includes('tyre') || id.includes('rim')) return 'trim';
  return 'body';
}

function applyHeroCarMaterialBudget(root, materialSet, options = {}) {
  const tier = options.tier === 'low' ? 'low' : 'high';
  const mats = materialSet[tier];
  const wheelMeshes = [];
  root.traverse((obj) => {
    if (!obj || !obj.isMesh) return;
    const id = String(obj.name || '').toLowerCase();
    const bucket = heroCarBucketFromName(id);
    obj.material = mats[bucket] || mats.body;
    // Keep hero-car shadows inexpensive: body/trim cast, glass/light meshes do not.
    obj.castShadow = tier === 'high' && bucket !== 'glass' && bucket !== 'light' && !id.includes('interior');
    obj.receiveShadow = false;
    if (bucket === 'trim' && wheelMeshes.length < 6) wheelMeshes.push(obj);
  });
  return wheelMeshes;
}

function pruneHeroCarLod1(root) {
  const hiddenNameParts = [
  'interior',
  'seat',
  'mirror',
  'logo',
  'badge',
  'license',
  'wiper',
  'exhaust',
  'steering',
  'dashboard'];
  root.traverse((obj) => {
    if (!obj || !obj.isMesh) return;
    const id = String(obj.name || '').toLowerCase();
    if (hiddenNameParts.some((part) => id.includes(part))) {
      obj.visible = false;
    }
  });
}

function upgradeCarMeshWithHeroAsset(carGroup) {
  if (!carGroup || typeof THREE.GLTFLoader === 'undefined') return;

  const loader = new THREE.GLTFLoader();
  if (typeof THREE.DRACOLoader !== 'undefined') {
    try {
      const draco = new THREE.DRACOLoader();
      draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
      loader.setDRACOLoader(draco);
    } catch (err) {
      console.warn('Car DRACO loader unavailable:', err);
    }
  }

  const onLoaded = (gltf) => {
    const root = gltf?.scene || gltf?.scenes?.[0];
    if (!root) return;

    normalizeLoadedCarModel(root);
    // Current hero model's local forward axis is flipped versus runtime forward (+Z).
    // Rotate once so chase camera sees rear by default and forward driving is correct.
    root.rotation.y += Math.PI;
    root.updateMatrixWorld(true);
    const materialSet = createHeroCarMaterialSet();
    const lod0Wheels = applyHeroCarMaterialBudget(root, materialSet, { tier: 'high' });

    const lod1 = root.clone(true);
    pruneHeroCarLod1(lod1);
    applyHeroCarMaterialBudget(lod1, materialSet, { tier: 'low' });

    const lod = new THREE.LOD();
    lod.addLevel(root, 0);
    lod.addLevel(lod1, 58);
    lod.position.y = -1.1;
    lod.updateMatrixWorld(true);

    while (carGroup.children.length) carGroup.remove(carGroup.children[0]);
    carGroup.add(lod);
    carGroup.castShadow = true;
    carGroup.traverse((obj) => {
      if (obj && obj.isMesh) {
        obj.frustumCulled = true;
      }
    });
    appCtx.wheelMeshes = lod0Wheels;
    applyRenderQuality(renderQualityLevel, { persist: false });
  };

  const tryUrls = ['assets/models/bmw-e34.glb'];
  const tryNext = (idx) => {
    if (idx >= tryUrls.length) return;
    loader.load(
      tryUrls[idx],
      onLoaded,
      undefined,
      () => tryNext(idx + 1)
    );
  };

  tryNext(0);
}

function init() {
  // === WEBGL COMPATIBILITY CHECK ===
  const canvas = document.createElement('canvas');
  let gl = null;
  const contextNames = ['webgl2', 'webgl', 'experimental-webgl', 'webkit-3d', 'moz-webgl'];

  for (let i = 0; i < contextNames.length; i++) {
    try {
      gl = canvas.getContext(contextNames[i], {
        alpha: false,
        antialias: false,
        stencil: false,
        depth: true,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false
      });
      if (gl) {
        // Debug log removed
        break;
      }
    } catch (e) {
      console.warn('Failed context:', contextNames[i], e);
    }
  }

  if (!gl) {
    alert('WebGL is not supported on this device. Please try:\n1. Updating your graphics drivers\n2. Enabling hardware acceleration in browser settings\n3. Using a different browser (Chrome/Firefox)');
    document.getElementById('loading').innerHTML = '<div style="color:#f66;padding:40px;text-align:center;">WebGL Not Supported<br><br>Please update your graphics drivers or try a different browser.</div>';
    return;
  }

  // Log GPU info
  try {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      // Debug log removed
    }
  } catch (e) {
    console.warn('Could not get GPU info:', e);
  }

  appCtx.scene = new THREE.Scene();
  appCtx.scene.background = new THREE.Color(0x87ceeb);
  appCtx.scene.fog = new THREE.FogExp2(0xb8d4e8, 0.00035);

  // Camera - tighter near/far ratio improves depth precision.
  // Stars are at r=5000 so far must cover that. logarithmicDepthBuffer (below)
  // compensates for the wide range.
  appCtx.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.5, 12000);

  // === RENDERER WITH MAXIMUM COMPATIBILITY ===
  let rendererCreated = false;
  const rendererOptions = [
  // Try 1: Logarithmic depth buffer for z-fighting prevention
  {
    antialias: false,
    alpha: false,
    stencil: false,
    depth: true,
    logarithmicDepthBuffer: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'default',
    failIfMajorPerformanceCaveat: false,
    precision: 'mediump'
  },
  // Try 2: Without logarithmic depth (fallback)
  {
    antialias: false,
    alpha: false,
    stencil: false,
    depth: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'default',
    failIfMajorPerformanceCaveat: false,
    precision: 'mediump'
  },
  // Try 3: Even more basic
  {
    antialias: false,
    powerPreference: 'default',
    failIfMajorPerformanceCaveat: false
  },
  // Try 4: Absolute minimum
  {
    failIfMajorPerformanceCaveat: false
  }];


  for (let i = 0; i < rendererOptions.length && !rendererCreated; i++) {
    try {
      // Debug log removed
      appCtx.renderer = new THREE.WebGLRenderer(rendererOptions[i]);
      rendererCreated = true;
      // Debug log removed
    } catch (e) {
      console.warn('Renderer attempt', i + 1, 'failed:', e);
    }
  }

  if (!rendererCreated || !appCtx.renderer) {
    alert('Failed to create 3D renderer. Your graphics card may not support WebGL properly.');
    document.getElementById('loading').innerHTML = '<div style="color:#f66;padding:40px;text-align:center;">Renderer Creation Failed<br><br>Your GPU may not support the required features.</div>';
    return;
  }

  appCtx.renderer.setSize(innerWidth, innerHeight);
  try {
    // When using post-processing we need manual resets so renderer.info
    // accumulates all passes in a frame instead of only the final pass.
    appCtx.renderer.info.autoReset = false;
  } catch {




    // Ignore unsupported renderer.info configurations.
  } // === GPU TIER DETECTION ===
  // Detect GPU capability to adapt quality settings across the board
  let gpuTier = 'high'; // high, mid, low
  try {const debugExt = appCtx.renderer.getContext().getExtension('WEBGL_debug_renderer_info');if (debugExt) {
      const gpuRenderer = appCtx.renderer.getContext().getParameter(debugExt.UNMASKED_RENDERER_WEBGL).toLowerCase();
      const isMobile = /mobile|mali|adreno|powervr|apple gpu|sgx|tegra/.test(gpuRenderer);
      const isIntegrated = /intel|uhd|iris|hd graphics|mesa|swiftshader|llvmpipe/.test(gpuRenderer);
      if (isMobile || /swiftshader|llvmpipe/.test(gpuRenderer)) {
        gpuTier = 'low';
      } else if (isIntegrated) {
        gpuTier = 'mid';
      }
    }
    // Small screens are likely weak devices
    if (innerWidth * innerHeight < 500000) gpuTier = 'low';
  } catch (e) {/* keep default high */}
  console.log('GPU tier:', gpuTier);

  // Adaptive pixel ratio: high=1.5, mid=1.25, low=1
  const pixelRatioCap = gpuTier === 'high' ? 1.5 : gpuTier === 'mid' ? 1.25 : 1;
  appCtx.renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));

  // Physically correct lighting for realistic PBR
  try {
    appCtx.renderer.physicallyCorrectLights = true;
  } catch (e) {
    console.warn('Physically correct lights not supported');
  }

  try {
    appCtx.renderer.outputEncoding = THREE.sRGBEncoding;
  } catch (e) {
    console.warn('sRGB encoding not supported');
  }

  try {
    appCtx.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    appCtx.renderer.toneMappingExposure = 0.9;
  } catch (e) {
    console.warn('Tone mapping not supported');
  }

  try {
    appCtx.renderer.shadowMap.enabled = true;
    // PCFSoft on high/mid, Basic on low
    appCtx.renderer.shadowMap.type = gpuTier === 'low' ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  } catch (e) {
    console.warn('Shadows not supported, trying basic');
    try {
      appCtx.renderer.shadowMap.enabled = true;
      appCtx.renderer.shadowMap.type = THREE.BasicShadowMap;
    } catch (e2) {
      console.warn('Shadows not supported at all');
    }
  }

  document.body.prepend(appCtx.renderer.domElement);

  currentGpuTier = gpuTier;
  const savedRenderQuality = readStorage(RENDER_QUALITY_STORAGE_KEY);
  const savedSsao = readStorage(SSAO_STORAGE_KEY);
  const initialRenderQuality = savedRenderQuality ?
  normalizeRenderQualityLevel(savedRenderQuality) :
  isLikelyMobileDevice() || gpuTier === 'low' ? RENDER_QUALITY_LOW : RENDER_QUALITY_MED;
  renderQualityLevel = initialRenderQuality;
  appCtx.renderQualityLevel = initialRenderQuality;
  setSsaoEnabled(savedSsao === '1', { persist: false });

  if (!setupPostProcessingPipeline()) {
    console.log('Post-processing skipped (GPU tier: ' + gpuTier + ')');
  }

  // Create textures after Three.js is loaded
  try {
    asphaltTex = createAsphaltTexture();
    asphaltNormal = createAsphaltNormal();
    asphaltRoughness = createRoughnessMap();

    // Create building textures
    buildingNormalMap = createBuildingNormalMap();
    buildingRoughnessMap = createBuildingRoughnessMap();

    // Apply anisotropic filtering to ground textures for sharper distant roads
    const maxAniso = appCtx.renderer.capabilities.getMaxAnisotropy();
    const aniso = Math.min(maxAniso, 8);
    if (asphaltTex) asphaltTex.anisotropy = aniso;
    if (asphaltNormal) asphaltNormal.anisotropy = aniso;
    if (asphaltRoughness) asphaltRoughness.anisotropy = aniso;

    // Load PBR textures for ground and buildings (from Poly Haven CDN with procedural fallback)
    initPBRTextures(maxAniso);
    syncTextureGlobals();
  } catch (e) {
    console.error('Texture creation failed:', e);
    syncTextureGlobals();
    // Textures will be null, code will use fallback solid colors
  }

  // PMREM + fallback environment map used by quality tiers.
  try {
    appCtx.pmremGenerator = new THREE.PMREMGenerator(appCtx.renderer);
    appCtx.pmremGenerator.compileEquirectangularShader();
    fallbackEnvMap = createProceduralEnvironmentMap(appCtx.pmremGenerator);
    if (renderQualityLevel === RENDER_QUALITY_LOW) {
      appCtx.scene.environment = fallbackEnvMap || null;
    } else {
      ensureHdrEnvironment();
    }
  } catch (e) {
    console.warn('PMREM initialization failed (non-critical):', e);
  }

  // Advanced lighting - store references for day/night cycle
  appCtx.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x545454, 0.4);
  appCtx.scene.add(appCtx.hemiLight);

  appCtx.sun = new THREE.DirectionalLight(0xfff5e1, 1.2);
  appCtx.sun.position.set(100, 150, 50);
  appCtx.sun.castShadow = true;
  const shadowRes = gpuTier === 'high' ? 1024 : gpuTier === 'mid' ? 512 : 256;
  appCtx.sun.shadow.mapSize.width = shadowRes;
  appCtx.sun.shadow.mapSize.height = shadowRes;
  appCtx.sun.shadow.camera.left = -120;
  appCtx.sun.shadow.camera.right = 120;
  appCtx.sun.shadow.camera.top = 120;
  appCtx.sun.shadow.camera.bottom = -120;
  appCtx.sun.shadow.camera.near = 0.5;
  appCtx.sun.shadow.camera.far = 500;
  appCtx.sun.shadow.bias = -0.0001;
  appCtx.sun.shadow.normalBias = 0.02;
  appCtx.sun.shadow.radius = 3; // Soft shadow edges (PCFSoftShadowMap)
  appCtx.scene.add(appCtx.sun);

  appCtx.fillLight = new THREE.DirectionalLight(0x9db4ff, 0.3);
  appCtx.fillLight.position.set(-50, 50, -50);
  appCtx.scene.add(appCtx.fillLight);

  appCtx.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  appCtx.scene.add(appCtx.ambientLight);

  // Apply initial quality now that lights/shadows exist.
  setRenderQualityLevel(initialRenderQuality, { persist: false });

  // === ADD SUN VISUAL ===
  appCtx.sunSphere = new THREE.Mesh(
    new THREE.SphereGeometry(40, 16, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffdd00,
      fog: false
    })
  );
  appCtx.sunSphere.position.set(500, 800, 200); // Much higher: 800 units up, above clouds
  appCtx.scene.add(appCtx.sunSphere);

  // Add sun glow effect
  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(60, 12, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffee88,
      transparent: true,
      opacity: 0.3,
      fog: false
    })
  );
  sunGlow.position.copy(appCtx.sunSphere.position);
  appCtx.scene.add(sunGlow);

  // Store reference to sun glow for toggling
  appCtx.sunSphere.userData.glow = sunGlow;

  // === ADD MOON VISUAL ===
  appCtx.moonSphere = new THREE.Mesh(
    new THREE.SphereGeometry(35, 16, 8),
    new THREE.MeshBasicMaterial({
      color: 0xccccdd,
      fog: false
    })
  );
  appCtx.moonSphere.position.set(-500, 800, -200);
  appCtx.moonSphere.visible = false; // Hidden during day
  appCtx.scene.add(appCtx.moonSphere);

  // Add moon glow
  const moonGlow = new THREE.Mesh(
    new THREE.SphereGeometry(50, 12, 8),
    new THREE.MeshBasicMaterial({
      color: 0x9999bb,
      transparent: true,
      opacity: 0.2,
      fog: false
    })
  );
  moonGlow.position.copy(appCtx.moonSphere.position);
  moonGlow.visible = false;
  appCtx.scene.add(moonGlow);

  // Store reference to moon glow for toggling
  appCtx.moonSphere.userData.glow = moonGlow;

  // === ADD CLOUDS ===
  appCtx.cloudGroup = new THREE.Group();
  const cloudMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.82
  });

  // Clouds — fewer draw calls: use lower-poly spheres and fewer puffs
  const cloudCount = gpuTier === 'low' ? 8 : 15;
  for (let i = 0; i < cloudCount; i++) {
    const cloud = new THREE.Group();
    const numPuffs = 2 + Math.floor(Math.random() * 2);
    for (let j = 0; j < numPuffs; j++) {
      const size = 15 + Math.random() * 12;
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(size, 4, 3),
        cloudMat
      );
      sphere.position.set(
        (Math.random() - 0.5) * 35,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 35
      );
      cloud.add(sphere);
    }
    cloud.position.set(
      (Math.random() - 0.5) * 4000,
      300 + Math.random() * 200,
      (Math.random() - 0.5) * 4000
    );
    appCtx.cloudGroup.add(cloud);
  }

  // A few large clouds
  const largeClouds = gpuTier === 'low' ? 1 : 3;
  for (let i = 0; i < largeClouds; i++) {
    const largeCloud = new THREE.Group();
    const numPuffs = 3 + Math.floor(Math.random() * 2);
    for (let j = 0; j < numPuffs; j++) {
      const size = 30 + Math.random() * 30;
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(size, 4, 3),
        cloudMat
      );
      sphere.position.set(
        (Math.random() - 0.5) * 80,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 80
      );
      largeCloud.add(sphere);
    }
    largeCloud.position.set(
      (Math.random() - 0.5) * 5000,
      350 + Math.random() * 150,
      (Math.random() - 0.5) * 5000
    );
    appCtx.cloudGroup.add(largeCloud);
  }

  appCtx.scene.add(appCtx.cloudGroup);

  // Create star field (hidden during day, visible at night)
  appCtx.starField = appCtx.createStarField();

  // Ground plane - solid green fallback beneath terrain (no texture to avoid sky-like artifacts)
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a7a2e, roughness: 0.95, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1; // Slightly below terrain tiles (acts as fallback)
  ground.receiveShadow = true;
  ground.userData.isGroundPlane = true;
  appCtx.scene.add(ground);

  // Car with REALISTIC PBR materials (with error handling)
  try {
    appCtx.carMesh = new THREE.Group();

    // === CAR PAINT (MeshStandardMaterial - good look, better perf) ===
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xc31421,
      metalness: 0.45,
      roughness: 0.38,
      envMapIntensity: 0.6
    });
    carPaintMaterial = bodyMat;

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 3.5), bodyMat);
    body.position.y = 0.5;body.castShadow = true;body.receiveShadow = false;
    appCtx.carMesh.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.5), bodyMat);
    roof.position.set(0, 0.95, -0.2);roof.castShadow = true;
    appCtx.carMesh.add(roof);

    // === GLASS (MeshStandardMaterial - transparent, better perf) ===
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      metalness: 0.1,
      roughness: 0.05,
      envMapIntensity: 0.8,
      transparent: true,
      opacity: 0.4
    });

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 0.1), glassMat);
    windshield.position.set(0, 0.85, 0.55);
    windshield.rotation.x = -0.3;
    appCtx.carMesh.add(windshield);

    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.1 });
    const wheelPositions = [[-0.85, 0.35, 1.1], [0.85, 0.35, 1.1], [-0.85, 0.35, -1.1], [0.85, 0.35, -1.1]];
    appCtx.wheelMeshes = [];
    wheelPositions.forEach((pos) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos[0], pos[1], pos[2]);
      wheel.castShadow = true;
      appCtx.carMesh.add(wheel);
      appCtx.wheelMeshes.push(wheel);
    });

    const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffaa, emissiveIntensity: 1.0, roughness: 0.1, metalness: 0.1 });
    const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), lightMat);
    hl1.position.set(-0.55, 0.45, 1.76);
    appCtx.carMesh.add(hl1);
    const hl2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), lightMat);
    hl2.position.set(0.55, 0.45, 1.76);
    appCtx.carMesh.add(hl2);

    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.1 });
    const tl1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), tailMat);
    tl1.position.set(-0.55, 0.45, -1.76);
    appCtx.carMesh.add(tl1);
    const tl2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), tailMat);
    tl2.position.set(0.55, 0.45, -1.76);
    appCtx.carMesh.add(tl2);

    // Keep car.y physics semantics unchanged; only lower rendered geometry to ground tires.
    const CAR_VISUAL_Y_OFFSET = -1.1;
    appCtx.carMesh.children.forEach((child) => {
      if (child && child.position) child.position.y += CAR_VISUAL_Y_OFFSET;
    });

    appCtx.scene.add(appCtx.carMesh);

    // Car casts shadow but doesn't need to receive
    appCtx.carMesh.castShadow = true;
    appCtx.carMesh.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });

    // Debug log removed
  } catch (e) {
    console.error('Car creation failed:', e);
    alert('Failed to create 3D car model. The game may not work properly.');
    return;
  }

  if (USE_HERO_CAR_ASSET) {
    upgradeCarMeshWithHeroAsset(appCtx.carMesh);
  }

  // Initialize Walking Module
  try {
    appCtx.Walk = appCtx.createWalkingModule({
      THREE,
      scene: appCtx.scene,
      camera: appCtx.camera,
      keys: appCtx.keys,
      car: appCtx.car,
      carMesh: appCtx.carMesh,
      getBuildingsArray: () => appCtx.buildings, // Pass function for dynamic buildings access
      getNearbyBuildings: (x, z, radius) =>
      typeof appCtx.getNearbyBuildings === 'function' ?
      appCtx.getNearbyBuildings(x, z, radius) : appCtx.buildings,


      isPointInPolygon: appCtx.pointInPolygon
    });
    window.Walk = appCtx.Walk;
    // Start in walking mode by default (character visible, car hidden)
    appCtx.Walk.setModeWalk();
  } catch (e) {
    console.error('Walking module initialization failed:', e);
    console.error('Stack:', e.stack);
  }

  // Initialize sky raycaster for star selection
  appCtx.skyRaycaster = new THREE.Raycaster();
  appCtx.skyRaycaster.far = 10000; // Reach stars on enlarged celestial sphere (5000m radius)

  addEventListener('resize', () => {
    appCtx.camera.aspect = innerWidth / innerHeight;
    appCtx.camera.updateProjectionMatrix();
    appCtx.renderer.setSize(innerWidth, innerHeight);
    if (appCtx.composer) appCtx.composer.setSize(innerWidth, innerHeight);
    if (appCtx.ssaoPass && typeof appCtx.ssaoPass.setSize === 'function') {
      appCtx.ssaoPass.setSize(innerWidth, innerHeight);
    }
    if (appCtx.smaaPass) appCtx.smaaPass.setSize(innerWidth * appCtx.renderer.getPixelRatio(), innerHeight * appCtx.renderer.getPixelRatio());
  });
  addEventListener('keydown', (e) => {appCtx.keys[e.code] = true;appCtx.onKey(e.code, e);});
  addEventListener('keyup', (e) => appCtx.keys[e.code] = false);

  // Mouse movement for camera control
  let lastMouseX = 0;
  let lastMouseY = 0;
  let mouseActive = false;
  window.walkMouseLookActive = false;

  addEventListener('mousedown', (e) => {
    if (!appCtx.gameStarted) return;

    // Left click - check for Apollo 11 flag click
    if (e.button === 0 && appCtx.onMoon && appCtx.apollo11Flag) {
      const mouse = new THREE.Vector2();
      mouse.x = e.clientX / window.innerWidth * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, appCtx.camera);

      // Check all children of the flag group (including invisible hitbox)
      const intersects = raycaster.intersectObjects(appCtx.apollo11Flag.children, true);
      if (intersects.length > 0) {
        // Clicked on Apollo 11 flag!
        appCtx.showApollo11Info();
        return;
      }
    }

    // Right click or middle click for camera control
    if (e.button === 2 || e.button === 1) {
      mouseActive = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      e.preventDefault();
    }
  });

  addEventListener('mouseup', (e) => {
    if (e.button === 2 || e.button === 1) {
      mouseActive = false;
    }
  });

  addEventListener('mousemove', (e) => {
    if (!appCtx.gameStarted) return;

    // Walking mode: respond to right-click/middle-click hold
    const walkLookActive = appCtx.Walk && appCtx.Walk.state.mode === 'walk' && window.walkMouseLookActive;
    if (!mouseActive && !walkLookActive) return;

    const deltaX = e.clientX - lastMouseX;
    const deltaY = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    const sensitivity = 0.005;

    // Drone mode camera control
    if (appCtx.droneMode) {
      appCtx.drone.yaw -= deltaX * sensitivity;
      appCtx.drone.pitch += deltaY * sensitivity;
      appCtx.drone.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, appCtx.drone.pitch));
    }
    // Walking mode camera control
    else if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') {
      appCtx.Walk.state.walker.yaw -= deltaX * sensitivity;
      appCtx.Walk.state.walker.pitch += deltaY * sensitivity;
      appCtx.Walk.state.walker.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, appCtx.Walk.state.walker.pitch));
    }
  });

  // Prevent context menu on right click
  addEventListener('contextmenu', (e) => {
    if (appCtx.gameStarted && (appCtx.droneMode || appCtx.Walk && appCtx.Walk.state.mode === 'walk')) {
      e.preventDefault();
    }
  });

  // Click event for star selection
  addEventListener('click', (e) => {
    if (!appCtx.gameStarted) return;

    if (typeof appCtx.handleBlockBuilderClick === 'function' && appCtx.handleBlockBuilderClick(e)) {
      return;
    }

    // Check for moon click FIRST (higher priority than stars)
    if (appCtx.checkMoonClick(e.clientX, e.clientY)) {
      return; // Moon was clicked, don't check stars
    }

    appCtx.checkStarClick(e.clientX, e.clientY);
  });

  // Touch fallback for mobile browsers that do not reliably emit click on canvas taps.
  addEventListener('touchend', (e) => {
    if (!appCtx.gameStarted) return;
    if (typeof appCtx.handleBlockBuilderClick !== 'function') return;
    if (!e.changedTouches || e.changedTouches.length === 0) return;
    const handled = appCtx.handleBlockBuilderClick(e);
    if (handled) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
  }, { passive: false });

}

Object.assign(appCtx, {
  canUseSsao,
  clearWindowTextureCache,
  createBuildingGroundPatch,
  getHighQualityEnabled,
  getBuildingMaterial,
  getRenderQualityLevel,
  getSsaoEnabled,
  init,
  setSsaoEnabled,
  setHighQualityEnabled,
  setRenderQualityLevel,
  tryEnablePostProcessing
});

export {
  canUseSsao,
  clearWindowTextureCache,
  createBuildingGroundPatch,
  getHighQualityEnabled,
  getBuildingMaterial,
  getRenderQualityLevel,
  getSsaoEnabled,
  init,
  setSsaoEnabled,
  setHighQualityEnabled,
  setRenderQualityLevel,
  tryEnablePostProcessing };
