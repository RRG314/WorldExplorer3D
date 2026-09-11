import { ctx as appCtx } from "../shared-context.js?v=55";

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
