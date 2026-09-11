let seabedTextureSet = null;
let rockTextureSet = null;

function makeCanvasTexture(canvas, isColor = false) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(26, 26);
  if (isColor) {
    if (typeof texture.colorSpace !== "undefined" && typeof THREE.SRGBColorSpace !== "undefined") {
      texture.colorSpace = THREE.SRGBColorSpace;
    } else if (typeof texture.encoding !== "undefined" && typeof THREE.sRGBEncoding !== "undefined") {
      texture.encoding = THREE.sRGBEncoding;
    }
  }
  texture.userData = texture.userData || {};
  texture.userData.sharedOceanTexture = true;
  texture.needsUpdate = true;
  return texture;
}

function applyTextureSetAnisotropy(textureSet, renderer) {
  if (!renderer || !textureSet) return;
  const maxAniso = renderer.capabilities && typeof renderer.capabilities.getMaxAnisotropy === "function" ?
    renderer.capabilities.getMaxAnisotropy() :
    1;
  const anisotropy = Math.min(8, Math.max(1, maxAniso));
  Object.values(textureSet).forEach((texture) => {
    if (!texture) return;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
  });
}

function createSeabedTextureSet(size = 384, deps = {}) {
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext("2d");
  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext("2d");
  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext("2d");

  if (!colorCtx || !normalCtx || !roughCtx) {
    return { map: null, normalMap: null, roughnessMap: null };
  }

  const colorImage = colorCtx.createImageData(size, size);
  const normalImage = normalCtx.createImageData(size, size);
  const roughImage = roughCtx.createImageData(size, size);
  const heightField = new Float32Array(size * size);
  const reefField = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const yNorm = y / (size - 1);
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const p = idx * 4;
      const macro = deps.valueNoise2D(x * 0.018, y * 0.018, 5);
      const detail = deps.valueNoise2D(x * 0.07 + 16, y * 0.07 - 8, 11);
      const micro = deps.valueNoise2D(x * 0.21 - 37, y * 0.21 + 13, 17);
      const crack = Math.abs(deps.valueNoise2D(x * 0.042 + 61, y * 0.042 - 29, 23) - 0.5);

      const reef = deps.smoothstep(0.38, 0.85, macro * 0.72 + detail * 0.4 - yNorm * 0.24 + micro * 0.18);
      const algae = deps.smoothstep(0.48, 0.92, detail + micro * 0.35);
      const heightValue = macro * 0.58 + detail * 0.28 + micro * 0.16 + crack * 0.24;
      heightField[idx] = heightValue;
      reefField[idx] = reef;

      const sandR = 182 + macro * 36 + detail * 18;
      const sandG = 196 + macro * 28 + detail * 16;
      const sandB = 171 + macro * 22 + detail * 10;
      const reefR = 126 + detail * 52 + micro * 32;
      const reefG = 152 + detail * 58 + micro * 28;
      const reefB = 132 + detail * 42 + micro * 22;
      const algaeR = 98 + algae * 32;
      const algaeG = 138 + algae * 56;
      const algaeB = 103 + algae * 20;

      const r = deps.lerp(deps.lerp(sandR, reefR, reef * 0.82), algaeR, algae * 0.28);
      const g = deps.lerp(deps.lerp(sandG, reefG, reef * 0.82), algaeG, algae * 0.34);
      const b = deps.lerp(deps.lerp(sandB, reefB, reef * 0.82), algaeB, algae * 0.25);
      colorImage.data[p] = Math.max(0, Math.min(255, Math.round(r)));
      colorImage.data[p + 1] = Math.max(0, Math.min(255, Math.round(g)));
      colorImage.data[p + 2] = Math.max(0, Math.min(255, Math.round(b)));
      colorImage.data[p + 3] = 255;

      const rough = 170 + (1 - reef) * 34 + crack * 48 + micro * 18;
      const roughClamped = Math.max(0, Math.min(255, Math.round(rough)));
      roughImage.data[p] = roughClamped;
      roughImage.data[p + 1] = roughClamped;
      roughImage.data[p + 2] = roughClamped;
      roughImage.data[p + 3] = 255;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const p = idx * 4;
      const xL = x > 0 ? x - 1 : x;
      const xR = x < size - 1 ? x + 1 : x;
      const yT = y > 0 ? y - 1 : y;
      const yB = y < size - 1 ? y + 1 : y;
      const hL = heightField[y * size + xL];
      const hR = heightField[y * size + xR];
      const hT = heightField[yT * size + x];
      const hB = heightField[yB * size + x];
      const dx = hR - hL;
      const dy = hB - hT;
      const nx = -dx * 2.1;
      const ny = -dy * 2.1;
      const nz = 1.0;
      const invLen = 1 / Math.max(0.00001, Math.sqrt(nx * nx + ny * ny + nz * nz));

      normalImage.data[p] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      normalImage.data[p + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      normalImage.data[p + 2] = 255;
      normalImage.data[p + 3] = 255;

      if (reefField[idx] > 0.68) {
        const sparkle = Math.round(reefField[idx] * 8);
        colorImage.data[p] = Math.min(255, colorImage.data[p] + sparkle);
        colorImage.data[p + 1] = Math.min(255, colorImage.data[p + 1] + sparkle);
      }
    }
  }

  colorCtx.putImageData(colorImage, 0, 0);
  normalCtx.putImageData(normalImage, 0, 0);
  roughCtx.putImageData(roughImage, 0, 0);
  return {
    map: makeCanvasTexture(colorCanvas, true),
    normalMap: makeCanvasTexture(normalCanvas, false),
    roughnessMap: makeCanvasTexture(roughCanvas, false)
  };
}

function createRockTextureSet(size = 256, deps = {}) {
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext("2d");
  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext("2d");
  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext("2d");

  if (!colorCtx || !normalCtx || !roughCtx) {
    return { map: null, normalMap: null, roughnessMap: null };
  }

  const colorImage = colorCtx.createImageData(size, size);
  const normalImage = normalCtx.createImageData(size, size);
  const roughImage = roughCtx.createImageData(size, size);
  const heightField = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const p = idx * 4;
      const macro = deps.valueNoise2D(x * 0.022 + 41, y * 0.022 - 17, 41);
      const detail = deps.valueNoise2D(x * 0.085 - 22, y * 0.085 + 61, 53);
      const cracks = Math.abs(deps.valueNoise2D(x * 0.16 + 73, y * 0.16 - 37, 67) - 0.5);
      const h = macro * 0.64 + detail * 0.28 + cracks * 0.32;
      heightField[idx] = h;

      const r = 88 + macro * 62 + detail * 42;
      const g = 102 + macro * 56 + detail * 34;
      const b = 111 + macro * 52 + detail * 30;
      colorImage.data[p] = Math.max(0, Math.min(255, Math.round(r)));
      colorImage.data[p + 1] = Math.max(0, Math.min(255, Math.round(g)));
      colorImage.data[p + 2] = Math.max(0, Math.min(255, Math.round(b)));
      colorImage.data[p + 3] = 255;

      const rough = 148 + cracks * 96 + (1 - detail) * 28;
      const roughClamped = Math.max(0, Math.min(255, Math.round(rough)));
      roughImage.data[p] = roughClamped;
      roughImage.data[p + 1] = roughClamped;
      roughImage.data[p + 2] = roughClamped;
      roughImage.data[p + 3] = 255;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const p = idx * 4;
      const xL = x > 0 ? x - 1 : x;
      const xR = x < size - 1 ? x + 1 : x;
      const yT = y > 0 ? y - 1 : y;
      const yB = y < size - 1 ? y + 1 : y;
      const hL = heightField[y * size + xL];
      const hR = heightField[y * size + xR];
      const hT = heightField[yT * size + x];
      const hB = heightField[yB * size + x];

      const nx = -(hR - hL) * 2.3;
      const ny = -(hB - hT) * 2.3;
      const nz = 1;
      const invLen = 1 / Math.max(0.00001, Math.sqrt(nx * nx + ny * ny + nz * nz));
      normalImage.data[p] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      normalImage.data[p + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      normalImage.data[p + 2] = 255;
      normalImage.data[p + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImage, 0, 0);
  normalCtx.putImageData(normalImage, 0, 0);
  roughCtx.putImageData(roughImage, 0, 0);
  return {
    map: makeCanvasTexture(colorCanvas, true),
    normalMap: makeCanvasTexture(normalCanvas, false),
    roughnessMap: makeCanvasTexture(roughCanvas, false)
  };
}

export function getSeabedTextureSet(renderer = null, deps = {}) {
  if (!seabedTextureSet) seabedTextureSet = createSeabedTextureSet(384, deps);
  applyTextureSetAnisotropy(seabedTextureSet, renderer);
  return seabedTextureSet;
}

export function getRockTextureSet(renderer = null, deps = {}) {
  if (!rockTextureSet) rockTextureSet = createRockTextureSet(256, deps);
  applyTextureSetAnisotropy(rockTextureSet, renderer);
  return rockTextureSet;
}
