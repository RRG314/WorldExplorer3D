import { ctx as appCtx } from "../shared-context.js?v=55";

let windowTextures = {};

export function getWindowTextureCache() {
  return windowTextures;
}

export function clearWindowTextureCache() {
  windowTextures = {};
}

export function createAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a2a2a';ctx.fillRect(0, 0, 256, 256);
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

export function createAsphaltNormal() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
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

export function createRoughnessMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(0, 0, 128, 128);
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

export function createBuildingNormalMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 14) {
    ctx.fillStyle = '#7878ff';
    ctx.fillRect(0, y, 128, 1);
    ctx.fillStyle = '#8888ff';
    ctx.fillRect(0, y + 1, 128, 1);
  }
  for (let x = 0; x < 128; x += 16) {
    ctx.fillStyle = '#7878ff';
    ctx.fillRect(x, 0, 1, 256);
  }
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

export function createBuildingRoughnessMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(0, 0, 64, 128);
  for (let floor = 0; floor < 9; floor++) {
    for (let col = 0; col < 4; col++) {
      ctx.fillStyle = '#404040';
      ctx.fillRect(col * 14 + 3, floor * 14 + 3, 10, 10);
    }
  }
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

export function createWindowTexture(baseColor, seed, options = {}) {
  const facadeStyle = String(options.style || 'office_grid');
  const variantBucket = ((seed || appCtx.rdtSeed || 42) >>> 0) % 3;
  const cacheKey = `${baseColor}_${appCtx.rdtSeed || 0}_${facadeStyle}_${variantBucket}`;
  if (windowTextures[cacheKey]) return windowTextures[cacheKey];

  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const rng = typeof appCtx.seededRandom === 'function'
    ? appCtx.seededRandom((seed || appCtx.rdtSeed || 42) ^ cacheKey.length)
    : Math.random.bind(Math);

  const wallTone = new THREE.Color(baseColor || '#8793a0');
  const panelTone = wallTone.clone().offsetHSL(0, -0.02, -0.05);
  const frameTone = wallTone.clone().offsetHSL(0, -0.03, -0.14);
  const coolGlass = ['rgba(72, 96, 120, 0.92)', 'rgba(82, 104, 128, 0.9)', 'rgba(64, 86, 108, 0.93)'];
  const warmGlass = ['rgba(210, 182, 132, 0.62)', 'rgba(232, 205, 156, 0.55)', 'rgba(255, 224, 176, 0.48)'];
  const profiles = {
    apartment_balcony: { cols: 4, rows: 12, sidePad: 5, topPad: 6, gutterX: 4, gutterY: 7, balcony: true },
    curtain_wall: { cols: 6, rows: 18, sidePad: 2, topPad: 3, gutterX: 1, gutterY: 2, curtain: true },
    historic_punched: { cols: 3, rows: 10, sidePad: 9, topPad: 8, gutterX: 8, gutterY: 8, historic: true },
    hotel_vertical: { cols: 3, rows: 16, sidePad: 7, topPad: 4, gutterX: 8, gutterY: 3, vertical: true },
    industrial_panel: { cols: 5, rows: 6, sidePad: 4, topPad: 10, gutterX: 3, gutterY: 13, industrial: true },
    residential_punched: { cols: 4, rows: 9, sidePad: 7, topPad: 8, gutterX: 6, gutterY: 9 },
    townhouse: { cols: 2, rows: 6, sidePad: 12, topPad: 10, gutterX: 14, gutterY: 13 },
    office_grid: { cols: 4, rows: 14, sidePad: 6, topPad: 6, gutterX: 4, gutterY: 5 }
  };
  const profile = profiles[facadeStyle] || profiles.office_grid;
  const cols = profile.cols;
  const rows = profile.rows;
  const sidePad = profile.sidePad;
  const topPad = profile.topPad;
  const gutterX = profile.gutterX;
  const gutterY = profile.gutterY;
  const cellW = Math.floor((canvas.width - sidePad * 2 - gutterX * (cols - 1)) / cols);
  const cellH = Math.floor((canvas.height - topPad * 2 - gutterY * (rows - 1)) / rows);
  const insetX = 2;
  const insetY = 2;

  for (let y = 0; y < canvas.height; y += 32) {
    ctx.fillStyle = panelTone.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.04).getStyle();
    ctx.fillRect(0, y, canvas.width, 18 + Math.floor(rng() * 10));
  }

  for (let row = 0; row < rows; row++) {
    const y = topPad + row * (cellH + gutterY);
    ctx.fillStyle = frameTone.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.03).getStyle();
    ctx.fillRect(0, y - 1, canvas.width, 1);
    for (let col = 0; col < cols; col++) {
      const x = sidePad + col * (cellW + gutterX);
      const lit = rng() > 0.83;
      const glassFill = lit
        ? warmGlass[Math.floor(rng() * warmGlass.length)]
        : coolGlass[Math.floor(rng() * coolGlass.length)];

      ctx.fillStyle = frameTone.getStyle();
      ctx.fillRect(x, y, cellW, cellH);

      ctx.fillStyle = glassFill;
      ctx.fillRect(x + insetX, y + insetY, cellW - insetX * 2, cellH - insetY * 2);

      if (profile.curtain) {
        ctx.fillStyle = 'rgba(210,225,238,0.16)';
        ctx.fillRect(x + Math.floor(cellW * 0.48), y + insetY, 1, cellH - insetY * 2);
      } else if (profile.historic) {
        ctx.fillStyle = frameTone.clone().offsetHSL(0, 0, 0.04).getStyle();
        ctx.fillRect(x, y, cellW, Math.max(2, Math.floor(cellH * 0.16)));
      } else if (profile.vertical) {
        ctx.fillStyle = 'rgba(240,244,248,0.14)';
        ctx.fillRect(x + insetX, y + insetY, 2, cellH - insetY * 2);
      } else if (profile.industrial) {
        ctx.fillStyle = 'rgba(230,235,238,0.1)';
        ctx.fillRect(x + insetX, y + insetY, cellW - insetX * 2, Math.max(2, Math.floor(cellH * 0.2)));
      }

      ctx.fillStyle = lit ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + insetX, y + insetY, cellW - insetX * 2, 1);

      if (!lit && rng() > 0.55) {
        ctx.fillStyle = 'rgba(18, 24, 30, 0.18)';
        ctx.fillRect(x + insetX, y + insetY + Math.floor((cellH - insetY * 2) * 0.45), cellW - insetX * 2, 1 + Math.floor(rng() * 2));
      }
    }
    if (profile.balcony) {
      ctx.fillStyle = frameTone.clone().offsetHSL(0, 0, -0.06).getStyle();
      ctx.fillRect(2, Math.min(canvas.height - 2, y + cellH + 2), canvas.width - 4, 2);
    }
  }

  for (let i = 0; i < 220; i++) {
    const x = rng() * canvas.width;
    const y = rng() * canvas.height;
    const alpha = 0.035 + rng() * 0.04;
    const shade = 180 + rng() * 40;
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha})`;
    ctx.fillRect(x, y, 1 + rng() * 1.2, 1 + rng() * 1.8);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.encoding = THREE.sRGBEncoding;
  windowTextures[cacheKey] = texture;
  return texture;
}

export function createProceduralGrassTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a6b22';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 150; i++) {
    const x = Math.random() * size,y = Math.random() * size;
    const b = 55 + Math.random() * 40;
    ctx.fillStyle = `rgba(${b + 25}, ${b + 15}, ${b - 5}, ${0.08 + Math.random() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + Math.random() * 12, 3 + Math.random() * 8, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 2000; i++) {
    const x = Math.random() * size,y = Math.random() * size;
    const g = 60 + Math.random() * 40;
    ctx.fillStyle = `rgba(${20 + Math.random() * 20}, ${g}, ${5 + Math.random() * 15}, 0.3)`;
    ctx.beginPath();
    ctx.ellipse(x, y, 1 + Math.random() * 3, 0.5 + Math.random() * 1.5, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
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

export function createProceduralGrassNormal() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, size, size);

  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xB14DE5) : Math.random.bind(Math);
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

export function createProceduralGrassRoughness() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, size, size);

  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xD1B7) : Math.random.bind(Math);
  for (let i = 0; i < 2000; i++) {
    const x = rng() * size,y = rng() * size;
    const brightness = 170 + rng() * 85;
    ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
    ctx.fillRect(x, y, 1 + rng() * 3, 1 + rng() * 3);
  }
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

export function createConcreteFacadeTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#9a9590';
  ctx.fillRect(0, 0, size, size);

  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xC0C0) : Math.random.bind(Math);
  for (let i = 0; i < 8000; i++) {
    const x = rng() * size,y = rng() * size;
    const brightness = 130 + rng() * 50;
    ctx.fillStyle = `rgba(${brightness}, ${brightness - 5}, ${brightness - 8}, 0.15)`;
    ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
  }
  for (let y = 0; y < size; y += 64) {
    ctx.fillStyle = 'rgba(80, 75, 70, 0.25)';
    ctx.fillRect(0, y, size, 1);
    ctx.fillStyle = 'rgba(170, 165, 160, 0.2)';
    ctx.fillRect(0, y + 1, size, 1);
  }
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

export function createConcreteNormalMap() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, size, size);

  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xC1C1) : Math.random.bind(Math);
  for (let y = 0; y < size; y += 64) {
    ctx.fillStyle = '#7070f0';
    ctx.fillRect(0, y, size, 2);
    ctx.fillStyle = '#9090ff';
    ctx.fillRect(0, y + 2, size, 1);
  }
  for (let i = 0; i < 3000; i++) {
    const x = rng() * size,y = rng() * size;
    ctx.fillStyle = `rgb(${122 + rng() * 16}, ${122 + rng() * 16}, ${235 + rng() * 20})`;
    ctx.fillRect(x, y, 1 + rng() * 3, 1 + rng() * 3);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createConcreteRoughnessMap() {
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

export function createBrickFacadeTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xB41C) : Math.random.bind(Math);

  ctx.fillStyle = '#b0a89a';
  ctx.fillRect(0, 0, size, size);

  const brickH = 16,brickW = 36,mortarW = 3;
  const colors = ['#8b4c39', '#934e3a', '#7d4535', '#a05a42', '#8a4937', '#7e4233'];
  for (let row = 0; row < size / (brickH + mortarW); row++) {
    const offsetX = row % 2 * (brickW / 2);
    for (let col = -1; col < size / (brickW + mortarW) + 1; col++) {
      const x = col * (brickW + mortarW) + offsetX;
      const y = row * (brickH + mortarW);
      const baseColor = colors[Math.floor(rng() * colors.length)];
      ctx.fillStyle = baseColor;
      ctx.fillRect(x, y, brickW, brickH);
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

export function createBrickNormalMap() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, size, size);

  const brickH = 16,brickW = 36,mortarW = 3;
  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xB41D) : Math.random.bind(Math);

  for (let row = 0; row < size / (brickH + mortarW); row++) {
    const y = row * (brickH + mortarW);
    ctx.fillStyle = '#7070e0';
    ctx.fillRect(0, y + brickH, size, mortarW);
  }
  for (let row = 0; row < size / (brickH + mortarW); row++) {
    const offsetX = row % 2 * (brickW / 2);
    for (let col = -1; col < size / (brickW + mortarW) + 1; col++) {
      const x = col * (brickW + mortarW) + offsetX;
      const y = row * (brickH + mortarW);
      ctx.fillStyle = '#7070e0';
      ctx.fillRect(x + brickW, y, mortarW, brickH);
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

export function createBrickRoughnessMap() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(0, 0, size, size);

  const brickH = 8,mortarW = 2;
  const rng = typeof appCtx.seededRandom === 'function' ? appCtx.seededRandom(appCtx.rdtSeed ^ 0xB41E) : Math.random.bind(Math);
  for (let row = 0; row < size / (brickH + mortarW); row++) {
    const y = row * (brickH + mortarW);
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(0, y + brickH, size, mortarW);
  }
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

export function createPavementTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b0aba5';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 10000; i++) {
    const x = Math.random() * size,y = Math.random() * size;
    const b = 140 + Math.random() * 60;
    ctx.fillStyle = `rgba(${b + 5}, ${b}, ${b - 5}, 0.12)`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.strokeStyle = 'rgba(80, 75, 70, 0.35)';
  ctx.lineWidth = 2;
  for (let x = 0; x < size; x += 128) {
    ctx.beginPath();ctx.moveTo(x, 0);ctx.lineTo(x, size);ctx.stroke();
  }
  for (let y = 0; y < size; y += 128) {
    ctx.beginPath();ctx.moveTo(0, y);ctx.lineTo(size, y);ctx.stroke();
  }
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

export function createPavementNormalMap() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, size, size);

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
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * size,y = Math.random() * size;
    ctx.fillStyle = `rgb(${123 + Math.random() * 14}, ${123 + Math.random() * 14}, ${240 + Math.random() * 15})`;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createPavementRoughnessMap() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;canvas.height = size;
  const ctx = canvas.getContext('2d');
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
