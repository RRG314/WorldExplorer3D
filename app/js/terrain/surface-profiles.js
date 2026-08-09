import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  classifyTerrainSurfaceProfile as classifySharedTerrainSurfaceProfile
} from "../surface-rules.js?v=17";
import {
  classifyWorldCoverSurface,
  loadWorldCoverBaseline,
  worldCoverSupportsBounds
} from "./worldcover-baseline.js?v=13";
import { applyWorldCoverBuiltSurfaceMaterial } from "./worldcover-surface-material.js?v=1";
import { resolveWorldCoverDetailMode } from './worldcover-detail-mode.js?v=1';

const SNOW_COLOR_HEX = 0xffffff;
const ALPINE_SNOW_COLOR_HEX = 0xe5ebf2;
const SAND_COLOR_HEX = 0xd7c08a;
export const TERRAIN_GRASS_COLOR_HEX = 0x6b8e4a;
const URBAN_GROUND_HEX = 0x8b8f96;
const SOIL_COLOR_HEX = 0x8c6b47;
const ROCK_COLOR_HEX = 0x7b7e82;
const FOREST_COLOR_HEX = 0x4d633b;
const GROUND_FALLBACK_GRASS_HEX = 0x4a7a2e;
const GROUND_FALLBACK_SNOW_HEX = 0xd6e2ef;
const GROUND_FALLBACK_ALPINE_HEX = 0xc6d0d8;
const GROUND_FALLBACK_SAND_HEX = 0xc8aa70;
const GROUND_FALLBACK_URBAN_HEX = 0x767a82;
const GROUND_FALLBACK_SOIL_HEX = 0x7d5e3d;
const GROUND_FALLBACK_ROCK_HEX = 0x6e7279;
const GROUND_FALLBACK_FOREST_HEX = 0x3f5633;

function cloneTerrainTextureWithRepeat(sourceTexture, repeats) {
  if (!sourceTexture) return null;
  const texture = sourceTexture.clone();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeats, repeats);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const maximumAnisotropy = Number(appCtx.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  texture.anisotropy = Math.max(1, Math.min(8, maximumAnisotropy));
  texture.needsUpdate = true;
  return texture;
}

const proceduralTerrainTextureBases = {
  snow: null,
  snowRock: null,
  sand: null,
  built: null,
  urban: null,
  soil: null,
  rock: null
};

function hashNoise2D(x, y, seed = 1) {
  const v = Math.sin((x * 127.1 + y * 311.7 + seed * 101.3) * 0.017453292519943295) * 43758.5453123;
  return v - Math.floor(v);
}

function makeProceduralTerrainTextureSet(mode = "snow", size = 128) {
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext("2d");
  if (!colorCtx) return null;
  const colorImage = colorCtx.createImageData(size, size);

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext("2d");
  if (!normalCtx) return null;
  const normalImage = normalCtx.createImageData(size, size);

  const roughnessCanvas = document.createElement("canvas");
  roughnessCanvas.width = size;
  roughnessCanvas.height = size;
  const roughnessCtx = roughnessCanvas.getContext("2d");
  if (!roughnessCtx) return null;
  const roughnessImage = roughnessCtx.createImageData(size, size);

  const isAlpine = mode === "snowRock";
  const isSand = mode === "sand";
  const isBuilt = mode === "built";
  const isUrban = mode === "urban";
  const isSoil = mode === "soil";
  const isRock = mode === "rock";
  const colorSeed = isAlpine ? 9 : 5;
  const normalSeed = isAlpine ? 12 : 7;
  const roughSeed = isAlpine ? 15 : 11;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const macro = hashNoise2D(x * 0.06, y * 0.06, colorSeed);
      const micro = hashNoise2D(x * 0.26, y * 0.26, colorSeed + 3);
      let r = 0;
      let g = 0;
      let b = 0;
      if (isSand) {
        const duneBlend = hashNoise2D(x * 0.075 + 17, y * 0.075 - 9, colorSeed + 5);
        const baseTone = 196 + macro * 22 + micro * 10;
        const warmTone = 22 + duneBlend * 14;
        r = baseTone + warmTone;
        g = baseTone * 0.91 + duneBlend * 11;
        b = baseTone * 0.72 + duneBlend * 6;
      } else if (isBuilt) {
        const baseTone = 116 + macro * 17 + micro * 9;
        r = baseTone;
        g = baseTone + 3;
        b = baseTone + 8;
      } else if (isUrban) {
        const grime = hashNoise2D(x * 0.24, y * 0.24, colorSeed + 6);
        const baseTone = 118 + macro * 20 + micro * 10;
        r = baseTone - grime * 9;
        g = baseTone + 4 - grime * 8;
        b = baseTone + 10 - grime * 7;
      } else if (isSoil) {
        const clump = hashNoise2D(x * 0.31, y * 0.31, colorSeed + 8);
        const baseTone = 118 + macro * 26 + micro * 12;
        r = baseTone + 20 + clump * 7;
        g = baseTone * 0.74 + clump * 12;
        b = baseTone * 0.48 + clump * 5;
      } else if (isRock) {
        const fracture = Math.sin((x * 0.16 + y * 0.08) + macro * 5.1);
        const grain = hashNoise2D(x * 0.34, y * 0.34, colorSeed + 10);
        const baseTone = 122 + macro * 30 + micro * 18;
        r = baseTone + fracture * 8;
        g = baseTone + 4 + fracture * 6;
        b = baseTone + 10 + grain * 10;
      } else {
        const rockMaskRaw = isAlpine ? Math.max(0, macro * 1.25 - 0.55) : 0;
        const rockMask = isAlpine ? Math.min(1, Math.max(0, rockMaskRaw * 1.8 + micro * 0.22)) : 0;
        const snowTone = 232 + macro * 18 + micro * 10;
        const rockTone = 122 + macro * 34 + micro * 26;
        const tintBlue = isAlpine ? 2 : 6;

        r = snowTone * (1 - rockMask) + rockTone * rockMask;
        g = (snowTone + 3) * (1 - rockMask) + (rockTone + 7) * rockMask;
        b = (snowTone + tintBlue) * (1 - rockMask) + (rockTone + 14) * rockMask;
      }

      colorImage.data[idx] = Math.max(0, Math.min(255, Math.round(r)));
      colorImage.data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      colorImage.data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      colorImage.data[idx + 3] = 255;

      const nx = isSand ?
        (hashNoise2D(x * 0.19, y * 0.19, normalSeed) - 0.5) * 28 :
        isBuilt ?
          (hashNoise2D(x * 0.1, y * 0.1, normalSeed) - 0.5) * 7 :
          isUrban ?
          (hashNoise2D(x * 0.14, y * 0.14, normalSeed) - 0.5) * 12 :
          isSoil ?
            (hashNoise2D(x * 0.16, y * 0.16, normalSeed) - 0.5) * 28 :
            isRock ?
              (hashNoise2D(x * 0.16, y * 0.16, normalSeed) - 0.5) * 52 :
              (hashNoise2D(x * 0.16, y * 0.16, normalSeed) - 0.5) * (isAlpine ? 54 : 34);
      const ny = isSand ?
        (hashNoise2D(x * 0.19 + 41, y * 0.19 - 29, normalSeed + 2) - 0.5) * 24 :
        isBuilt ?
          (hashNoise2D(x * 0.1 + 41, y * 0.1 - 29, normalSeed + 2) - 0.5) * 7 :
          isUrban ?
          (hashNoise2D(x * 0.14 + 41, y * 0.14 - 29, normalSeed + 2) - 0.5) * 12 :
          isSoil ?
            (hashNoise2D(x * 0.16 + 41, y * 0.16 - 29, normalSeed + 2) - 0.5) * 28 :
            isRock ?
              (hashNoise2D(x * 0.16 + 41, y * 0.16 - 29, normalSeed + 2) - 0.5) * 52 :
              (hashNoise2D(x * 0.16 + 41, y * 0.16 - 29, normalSeed + 2) - 0.5) * (isAlpine ? 54 : 34);
      normalImage.data[idx] = Math.max(0, Math.min(255, Math.round(128 + nx)));
      normalImage.data[idx + 1] = Math.max(0, Math.min(255, Math.round(128 + ny)));
      normalImage.data[idx + 2] = 255;
      normalImage.data[idx + 3] = 255;

      const roughBase = isSand ? 204 : isAlpine ? 168 : isBuilt ? 185 : isUrban ? 148 : isSoil ? 196 : isRock ? 176 : 224;
      const roughVar = hashNoise2D(x * 0.18, y * 0.18, roughSeed) * (isSand ? 38 : isAlpine ? 64 : isBuilt ? 18 : isUrban ? 26 : isSoil ? 34 : isRock ? 52 : 28);
      const roughMask = isSand ? 12 : isAlpine ? Math.max(0, macro * 18) : isUrban ? Math.max(0, micro * 12) : isRock ? Math.max(0, macro * 22) : 0;
      const rough = Math.max(0, Math.min(255, Math.round(roughBase + roughVar + roughMask)));
      roughnessImage.data[idx] = rough;
      roughnessImage.data[idx + 1] = rough;
      roughnessImage.data[idx + 2] = rough;
      roughnessImage.data[idx + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImage, 0, 0);
  normalCtx.putImageData(normalImage, 0, 0);
  roughnessCtx.putImageData(roughnessImage, 0, 0);

  const makeTexture = (canvas, isColor = false) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    if (isColor) {
      if (typeof texture.colorSpace !== "undefined" && typeof THREE.SRGBColorSpace !== "undefined") {
        texture.colorSpace = THREE.SRGBColorSpace;
      } else if (typeof texture.encoding !== "undefined" && typeof THREE.sRGBEncoding !== "undefined") {
        texture.encoding = THREE.sRGBEncoding;
      }
    }
    texture.needsUpdate = true;
    return texture;
  };

  return {
    map: makeTexture(colorCanvas, true),
    normalMap: makeTexture(normalCanvas, false),
    roughnessMap: makeTexture(roughnessCanvas, false)
  };
}

function getProceduralTerrainTextureBase(mode = "snow") {
  const key =
    mode === "snowRock" ? "snowRock" :
    mode === "sand" ? "sand" :
    mode === "built" ? "built" :
    mode === "urban" ? "urban" :
    mode === "soil" ? "soil" :
    mode === "rock" ? "rock" :
    "snow";
  if (!proceduralTerrainTextureBases[key]) {
    proceduralTerrainTextureBases[key] = makeProceduralTerrainTextureSet(key, 128);
  }
  return proceduralTerrainTextureBases[key];
}

function ensureTerrainTextureSet(mesh, repeats, mode = "grass") {
  if (!mesh || !mesh.userData) return null;
  if (!mesh.userData.terrainTextureSetsByMode) mesh.userData.terrainTextureSetsByMode = {};
  const modeKey =
    mode === "snowRock" ? "snowRock" :
    mode === "snow" ? "snow" :
    mode === "sand" ? "sand" :
    mode === "built" ? "built" :
    mode === "urban" ? "urban" :
    mode === "soil" ? "soil" :
    mode === "rock" ? "rock" :
    mode === "forest" ? "forest" :
    "grass";
  let source = null;
  const registeredMode = modeKey === 'snowRock' ? 'rock' : modeKey;
  if (appCtx.surfaceTextureSets?.[registeredMode]?.map) {
    source = appCtx.surfaceTextureSets[registeredMode];
  } else if (modeKey === "grass" || modeKey === "forest") {
    source = {
      map: appCtx.grassDiffuse,
      normalMap: appCtx.grassNormal,
      roughnessMap: appCtx.grassRoughness
    };
  } else if (modeKey === "built") {
    source = getProceduralTerrainTextureBase(modeKey);
  } else if (modeKey === "urban") {
    source =
      (appCtx.pavementDiffuse ? {
        map: appCtx.pavementDiffuse,
        normalMap: appCtx.pavementNormal,
        roughnessMap: appCtx.pavementRoughness
      } : null) ||
      (appCtx.concreteDiffuse ? {
        map: appCtx.concreteDiffuse,
        normalMap: appCtx.concreteNormal,
        roughnessMap: appCtx.concreteRoughness
      } : null) ||
      getProceduralTerrainTextureBase(modeKey);
  } else {
    source = getProceduralTerrainTextureBase(modeKey);
  }
  if (!source) return null;

  const textureCacheKey = [
    modeKey,
    Number(repeats) || 12,
    source.map?.uuid || 'none',
    source.normalMap?.uuid || 'none',
    source.roughnessMap?.uuid || 'none'
  ].join(':');
  if (mesh.userData.terrainTextureSetsByMode[textureCacheKey]) {
    mesh.userData.terrainTextureSet = mesh.userData.terrainTextureSetsByMode[textureCacheKey];
    return mesh.userData.terrainTextureSet;
  }

  const textureSet = {
    map: cloneTerrainTextureWithRepeat(source.map, repeats),
    normalMap: cloneTerrainTextureWithRepeat(source.normalMap, repeats),
    roughnessMap: cloneTerrainTextureWithRepeat(source.roughnessMap, repeats)
  };
  mesh.userData.terrainTextureSetsByMode[textureCacheKey] = textureSet;
  mesh.userData.terrainTextureSet = textureSet;
  return textureSet;
}

let cachedGroundFallbackMesh = null;

function getGroundFallbackMesh() {
  if (cachedGroundFallbackMesh && cachedGroundFallbackMesh.parent) return cachedGroundFallbackMesh;
  cachedGroundFallbackMesh = null;
  if (!appCtx.scene) return null;
  for (let i = 0; i < appCtx.scene.children.length; i++) {
    const child = appCtx.scene.children[i];
    if (child?.userData?.isGroundPlane) {
      cachedGroundFallbackMesh = child;
      break;
    }
  }
  return cachedGroundFallbackMesh;
}

function applyGroundFallbackProfile(profile = null) {
  const ground = getGroundFallbackMesh();
  const material = ground?.material;
  if (!ground || !material || Array.isArray(material)) return;
  const requestedMode = profile?.visualMode || profile?.mode;
  const mode = ["snow", "snowRock", "sand", "built", "urban", "soil", "rock", "forest"].includes(requestedMode) ? requestedMode : "grass";
  const colorHex = mode === "snow" ?
    GROUND_FALLBACK_SNOW_HEX :
    mode === "snowRock" ?
      GROUND_FALLBACK_ALPINE_HEX :
      mode === "sand" ?
        GROUND_FALLBACK_SAND_HEX :
        mode === "built" || mode === "urban" ?
          GROUND_FALLBACK_URBAN_HEX :
          mode === "soil" ?
            GROUND_FALLBACK_SOIL_HEX :
            mode === "rock" ?
              GROUND_FALLBACK_ROCK_HEX :
              mode === "forest" ?
                GROUND_FALLBACK_FOREST_HEX :
              GROUND_FALLBACK_GRASS_HEX;
  material.color.setHex(colorHex);
  material.roughness =
    mode === "grass" ? 0.95 :
    mode === "sand" ? 0.92 :
    mode === "built" ? 0.9 :
    mode === "urban" ? 0.84 :
    mode === "soil" ? 0.9 :
    mode === "rock" ? 0.87 :
    0.86;
  material.metalness = mode === "urban" ? 0.03 : mode === "built" || mode === "grass" || mode === "soil" || mode === "sand" ? 0 : 0.02;
  material.needsUpdate = true;
}

export function computeElevationStatsMeters(samplesMeters) {
  if (!Array.isArray(samplesMeters) || samplesMeters.length === 0) {
    return { min: 0, max: 0, p75: 0, p90: 0 };
  }
  const sorted = samplesMeters.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return { min: 0, max: 0, p75: 0, p90: 0 };
  const pick = (p) => {
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
    return sorted[idx];
  };
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p75: pick(0.75),
    p90: pick(0.9)
  };
}

export function classifyTerrainVisualProfile(bounds, minElevationMeters = null, maxElevationMeters = null, elevationStats = null) {
  return classifySharedTerrainSurfaceProfile({
    bounds,
    minElevationMeters,
    maxElevationMeters,
    elevationStats,
    worldSurfaceProfile: appCtx.worldSurfaceProfile || null
  });
}

function worldCoverStats() {
  if (!appCtx.worldCoverStats) {
    appCtx.worldCoverStats = {
      requested: 0,
      ready: 0,
      failed: 0,
      network: 0,
      persistentCache: 0,
      classes: {}
    };
  }
  return appCtx.worldCoverStats;
}

function classifyWorldCoverSurfaceProfile(mesh, result) {
  const current = mesh?.userData?.terrainVisualProfile || null;
  const bounds = mesh?.userData?.terrainTile?.bounds || null;
  const centerLat = Number.isFinite(bounds?.latN) && Number.isFinite(bounds?.latS) ?
    (bounds.latN + bounds.latS) * 0.5 :
    Number(appCtx.LOC?.lat || 0);
  const semantic = classifyWorldCoverSurface(result, centerLat);
  if (!semantic) return current;
  return {
    ...current,
    mode: semantic.mode,
    visualMode: semantic.mode,
    reason: semantic.reason,
    worldCoverConfidence: semantic.confidence
  };
}

function applyWorldCoverVertexTints(mesh, result) {
  const geometry = mesh?.geometry;
  const uvs = geometry?.attributes?.uv;
  const tints = result?.surfaceTints;
  const size = Number(result?.surfaceTintSize || 0);
  const encodingScale = Number(result?.surfaceTintEncodingScale || 170);
  if (!geometry || !uvs || !tints || size < 2 || encodingScale <= 0) return false;

  const colors = new Float32Array(uvs.count * 3);
  const sample = (x, y, channel) => tints[(y * size + x) * 3 + channel] / encodingScale;
  for (let index = 0; index < uvs.count; index += 1) {
    const sourceX = Math.max(0, Math.min(size - 1, uvs.getX(index) * (size - 1)));
    const sourceY = Math.max(0, Math.min(size - 1, (1 - uvs.getY(index)) * (size - 1)));
    const x0 = Math.floor(sourceX);
    const y0 = Math.floor(sourceY);
    const x1 = Math.min(size - 1, x0 + 1);
    const y1 = Math.min(size - 1, y0 + 1);
    const tx = sourceX - x0;
    const ty = sourceY - y0;
    for (let channel = 0; channel < 3; channel += 1) {
      const north = sample(x0, y0, channel) * (1 - tx) + sample(x1, y0, channel) * tx;
      const south = sample(x0, y1, channel) * (1 - tx) + sample(x1, y1, channel) * tx;
      colors[index * 3 + channel] = north * (1 - ty) + south * ty;
    }
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.attributes.color.needsUpdate = true;
  mesh.material.vertexColors = true;
  return true;
}

function applyLoadedWorldCoverBaseline(mesh) {
  const result = mesh?.userData?.worldCoverResult;
  const material = mesh?.material;
  if (!result || !material || Array.isArray(material) || mesh.userData?.terrainDisposed) return false;
  mesh.userData.worldCoverStatus = 'ready';
  mesh.userData.worldCoverSummary = {
    key: result.key,
    source: result.source,
    dominantClass: result.dominantClass,
    counts: result.counts,
    recognizedPixels: result.recognizedPixels,
    totalPixels: result.totalPixels
  };
  const semanticProfile = classifyWorldCoverSurfaceProfile(mesh, result);
  if (semanticProfile) {
    mesh.userData.terrainVisualProfile = semanticProfile;
    mesh.userData.worldCoverSurfaceMode = semanticProfile.mode;
    applyTerrainVisualProfile(mesh, semanticProfile, null, { queueWorldCover: false });
  }
  if (result.surfaceTints) {
    const ownDetailMode = resolveWorldCoverDetailMode(semanticProfile, result);
    const ownerDistance = Math.hypot(Number(mesh.position?.x || 0), Number(mesh.position?.z || 0));
    const previousOwnerDistance = Number.isFinite(Number(appCtx.worldCoverBaseDetailModeOwnerDistance)) ?
      Number(appCtx.worldCoverBaseDetailModeOwnerDistance) : Infinity;
    const becomesLocationOwner = ownerDistance + 1e-6 < previousOwnerDistance;
    const previousLocationDetailMode = appCtx.worldCoverBaseDetailMode || null;
    if (becomesLocationOwner) {
      appCtx.worldCoverBaseDetailMode = ownDetailMode;
      appCtx.worldCoverBaseDetailModeOwnerDistance = ownerDistance;
    }
    const detailMode = appCtx.worldCoverBaseDetailMode || ownDetailMode;
    const detailTextures = ensureTerrainTextureSet(
      mesh,
      Number(mesh.userData.terrainTextureRepeats) || 12,
      detailMode
    );
    const builtTextures = ensureTerrainTextureSet(
      mesh,
      Number(mesh.userData.terrainTextureRepeats) || 12,
      'built'
    );
    mesh.userData.terrainTextureSet = detailTextures;
    // One center-tile PBR mode owns the whole fixed location. WorldCover's
    // spatial tint still varies within each tile, but neighboring tiles cannot
    // expose categorical grass/soil/forest texture changes as square borders.
    material.map = detailTextures?.map || null;
    material.normalMap = detailTextures?.normalMap || null;
    material.roughnessMap = detailTextures?.roughnessMap || null;
    if (material.normalMap) {
      const normalStrength =
        detailMode === 'sand' ? [0.78, 0.42] :
        detailMode === 'rock' ? [0.56, 0.56] :
        detailMode === 'soil' ? [0.48, 0.48] :
        detailMode === 'forest' ? [0.48, 0.48] :
        [0.6, 0.6];
      material.normalScale = new THREE.Vector2(normalStrength[0], normalStrength[1]);
    }
    applyWorldCoverVertexTints(mesh, result);
    const builtSurfaceBlended = applyWorldCoverBuiltSurfaceMaterial(mesh, result, builtTextures);
    material.color.setHex(0xffffff);
    material.emissiveMap = null;
    material.emissiveIntensity = 0;
    material.roughness = 0.96;
    material.metalness = 0;
    material.needsUpdate = true;
    mesh.userData.terrainDetailProvenance = {
      kind: builtSurfaceBlended ? 'smoothed-worldcover-built-blended-pbr' : 'smoothed-worldcover-tinted-pbr',
      source: result.source,
      mode: detailMode,
      builtSurfaceBlended
    };
    if (becomesLocationOwner && previousLocationDetailMode !== ownDetailMode &&
        !appCtx.worldCoverDetailModeRefreshQueued) {
      appCtx.worldCoverDetailModeRefreshQueued = true;
      queueMicrotask(() => {
        appCtx.worldCoverDetailModeRefreshQueued = false;
        for (const candidate of appCtx.terrainGroup?.children || []) {
          if (candidate !== mesh && candidate?.userData?.worldCoverResult && !candidate.userData?.terrainDisposed) {
            applyLoadedWorldCoverBaseline(candidate);
          }
        }
      });
    }
  } else {
    mesh.userData.terrainDetailProvenance = null;
  }
  appCtx.scheduleWorldCoverVegetationRefresh?.();
  appCtx.scheduleFarTerrainSurfaceRefresh?.();
  return true;
}

function queueWorldCoverBaseline(mesh, bounds) {
  if (!mesh?.userData || !worldCoverSupportsBounds(bounds)) return;
  if (mesh.userData.worldCoverResult) {
    applyLoadedWorldCoverBaseline(mesh);
    return;
  }
  if (mesh.userData.worldCoverPromise || mesh.userData.worldCoverStatus === 'unavailable') return;

  const stats = worldCoverStats();
  const key = String(mesh.userData.terrainTileKey || [
    bounds.latS,
    bounds.lonW,
    bounds.latN,
    bounds.lonE
  ].map((value) => Number(value).toFixed(6)).join(':'));
  mesh.userData.worldCoverStatus = 'loading';
  stats.requested += 1;
  const controller = new AbortController();
  mesh.userData.worldCoverAbortController = controller;
  const distanceFromWorldCenter = Math.hypot(Number(mesh.position?.x || 0), Number(mesh.position?.z || 0));
  mesh.userData.worldCoverPromise = loadWorldCoverBaseline(bounds, {
    key,
    size: 128,
    signal: controller.signal,
    priority: Math.max(0, 100000 - distanceFromWorldCenter)
  })
    .then((result) => {
      mesh.userData.worldCoverPromise = null;
      mesh.userData.worldCoverAbortController = null;
      if (!result || mesh.userData.terrainDisposed) {
        return;
      }
      mesh.userData.worldCoverResult = result;
      stats.ready += 1;
      if (result.source === 'persistent-cache' || result.source === 'memory-cache') stats.persistentCache += 1;
      else stats.network += 1;
      Object.entries(result.counts || {}).forEach(([className, count]) => {
        stats.classes[className] = Number(stats.classes[className] || 0) + Number(count || 0);
      });
      applyLoadedWorldCoverBaseline(mesh);
    })
    .catch(() => {
      mesh.userData.worldCoverPromise = null;
      mesh.userData.worldCoverAbortController = null;
      if (mesh.userData.terrainDisposed) return;
      mesh.userData.worldCoverStatus = 'unavailable';
      stats.failed += 1;
    });
}

export function applyTerrainVisualProfile(mesh, profile, repeats = null, options = {}) {
  if (!mesh || !mesh.material || Array.isArray(mesh.material)) return;
  if (!mesh.userData) mesh.userData = {};
  const mat = mesh.material;
  const tileBounds = mesh.userData.terrainTile?.bounds || null;
  const nextProfile = profile || classifyTerrainVisualProfile(tileBounds);
  const nextMode =
    nextProfile.visualMode === "built" ? "built" :
    nextProfile.mode === "snowRock" ? "snowRock" :
    nextProfile.mode === "snow" ? "snow" :
    nextProfile.mode === "sand" ? "sand" :
    nextProfile.mode === "urban" ? "urban" :
    nextProfile.mode === "soil" ? "soil" :
    nextProfile.mode === "rock" ? "rock" :
    nextProfile.mode === "forest" ? "forest" :
    "grass";
  const textureRepeats = Number.isFinite(repeats) && repeats > 0 ?
    repeats :
    Number(mesh.userData.terrainTextureRepeats) || 12;
  mesh.userData.terrainTextureRepeats = textureRepeats;

  if (nextMode === "snow" || nextMode === "snowRock") {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats, nextMode);
    // Snow uses clean material response instead of the registered repeating
    // ground scan. On large alpine slopes that directional scan produced
    // visible diagonal bands and moire that read as terrain geometry.
    mat.map = nextMode === "snow" ? null : textures?.map || null;
    mat.normalMap = nextMode === "snow" ? null : textures?.normalMap || null;
    mat.roughnessMap = nextMode === "snow" ? null : textures?.roughnessMap || null;
    mat.color.setHex(nextMode === "snow" ? SNOW_COLOR_HEX : ALPINE_SNOW_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = nextMode === "snow" ? 0.94 : 0.86;
    mat.metalness = 0.01;
    mat.normalScale = nextMode === "snow" ? new THREE.Vector2(0, 0) : new THREE.Vector2(0.2, 0.2);
  } else if (nextMode === "sand") {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats * 1.3, "sand");
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : SAND_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.92;
    mat.metalness = 0.0;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.78, 0.42);
  } else if (nextMode === "built") {
    // A city classification describes the surrounding settlement; it does
    // not mean every unmapped square metre is concrete. Roads, parking and
    // mapped hardscape have their own geometry, while the base terrain should
    // remain natural until the spatial WorldCover texture arrives.
    const textures = ensureTerrainTextureSet(mesh, textureRepeats, "grass");
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : TERRAIN_GRASS_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.95;
    mat.metalness = 0;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.6, 0.6);
  } else if (nextMode === "urban") {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats * 1.1, "urban");
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : URBAN_GROUND_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.84;
    mat.metalness = 0.03;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.28, 0.28);
  } else if (nextMode === "soil") {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats * 1.05, "soil");
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : SOIL_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.9;
    mat.metalness = 0.0;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.48, 0.48);
  } else if (nextMode === "rock") {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats * 0.95, "rock");
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : ROCK_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.87;
    mat.metalness = 0.02;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.56, 0.56);
  } else if (nextMode === "forest") {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats * 1.1, "forest");
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : FOREST_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.96;
    mat.metalness = 0;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.48, 0.48);
  } else {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats, "grass");
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : TERRAIN_GRASS_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.95;
    mat.metalness = 0.0;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.6, 0.6);
  }

  mesh.userData.terrainVisualProfile = nextProfile;
  applyGroundFallbackProfile(nextProfile);
  mat.emissiveMap = null;
  mat.needsUpdate = true;
  if (options.queueWorldCover !== false) queueWorldCoverBaseline(mesh, tileBounds);
}

export function refreshTerrainSurfaceProfiles(profile = null) {
  const nextProfile = profile || appCtx.worldSurfaceProfile || null;
  if (appCtx.terrainGroup?.children?.length) {
    appCtx.terrainGroup.children.forEach((mesh) => {
      if (!mesh?.userData?.isTerrainMesh) return;
      const bounds = mesh.userData?.terrainTile?.bounds || null;
      const minMeters = Number(mesh.userData?.minElevationMeters);
      const maxMeters = Number(mesh.userData?.maxElevationMeters);
      const elevationStats = mesh.userData?.elevationStatsMeters || null;
      applyTerrainVisualProfile(
        mesh,
        classifyTerrainVisualProfile(
          bounds,
          Number.isFinite(minMeters) ? minMeters : null,
          Number.isFinite(maxMeters) ? maxMeters : null,
          elevationStats
        )
      );
    });
    return;
  }
  applyGroundFallbackProfile(nextProfile);
}

export function setWorldSurfaceProfile(profile = null) {
  appCtx.worldSurfaceProfile = profile || null;
  refreshTerrainSurfaceProfiles(profile || null);
}
