export const TERRAIN_SURFACE_CLASS = Object.freeze({
  grass: 0,
  urban: 1,
  sand: 2,
  forest: 3,
  soil: 4,
  rock: 5,
  snow: 6
});

const MATERIAL_ATTRIBUTE_A = 'terrainSurfaceMixA';
const MATERIAL_ATTRIBUTE_B = 'terrainSurfaceMixB';

export function terrainSurfaceClassForWorldCover(name = '', latitude = 0) {
  const normalized = String(name || '').toLowerCase();
  if (normalized === 'built') return TERRAIN_SURFACE_CLASS.urban;
  if (normalized === 'tree' || normalized === 'mangrove' || normalized === 'wetland') {
    return TERRAIN_SURFACE_CLASS.forest;
  }
  if (normalized === 'crop') return TERRAIN_SURFACE_CLASS.soil;
  if (normalized === 'bare') {
    const absoluteLatitude = Math.abs(Number(latitude) || 0);
    return absoluteLatitude >= 12 && absoluteLatitude <= 35
      ? TERRAIN_SURFACE_CLASS.sand
      : TERRAIN_SURFACE_CLASS.rock;
  }
  if (normalized === 'snow') return TERRAIN_SURFACE_CLASS.snow;
  return TERRAIN_SURFACE_CLASS.grass;
}
export function terrainSurfaceClassForMappedMode(mode = '') {
  const normalized = String(mode || '').toLowerCase();
  if (normalized === 'urban' || normalized === 'built') return TERRAIN_SURFACE_CLASS.urban;
  if (normalized === 'sand') return TERRAIN_SURFACE_CLASS.sand;
  if (normalized === 'forest') return TERRAIN_SURFACE_CLASS.forest;
  if (normalized === 'soil' || normalized === 'agriculture') return TERRAIN_SURFACE_CLASS.soil;
  if (normalized === 'rock' || normalized === 'bare') return TERRAIN_SURFACE_CLASS.rock;
  if (normalized === 'snow') return TERRAIN_SURFACE_CLASS.snow;
  return TERRAIN_SURFACE_CLASS.grass;
}

export function terrainSurfaceMixForClass(surfaceClass = TERRAIN_SURFACE_CLASS.grass) {
  const mixA = [0, 0, 0, 0];
  const mixB = [0, 0];
  if (surfaceClass === TERRAIN_SURFACE_CLASS.urban) mixA[0] = 1;
  else if (surfaceClass === TERRAIN_SURFACE_CLASS.sand) mixA[1] = 1;
  else if (surfaceClass === TERRAIN_SURFACE_CLASS.forest) mixA[2] = 1;
  else if (surfaceClass === TERRAIN_SURFACE_CLASS.soil) mixA[3] = 1;
  else if (surfaceClass === TERRAIN_SURFACE_CLASS.rock) mixB[0] = 1;
  else if (surfaceClass === TERRAIN_SURFACE_CLASS.snow) mixB[1] = 1;
  return { mixA, mixB };
}

export function ensureTerrainSurfaceMixAttributes(geometry) {
  const positions = geometry?.attributes?.position;
  if (!positions || typeof THREE === 'undefined') return null;
  let mixA = geometry.attributes[MATERIAL_ATTRIBUTE_A];
  let mixB = geometry.attributes[MATERIAL_ATTRIBUTE_B];
  if (!mixA || mixA.count !== positions.count) {
    mixA = new THREE.Float32BufferAttribute(new Float32Array(positions.count * 4), 4);
    geometry.setAttribute(MATERIAL_ATTRIBUTE_A, mixA);
  }
  if (!mixB || mixB.count !== positions.count) {
    mixB = new THREE.Float32BufferAttribute(new Float32Array(positions.count * 2), 2);
    geometry.setAttribute(MATERIAL_ATTRIBUTE_B, mixB);
  }
  return { mixA, mixB };
}

function weightedMixForWorldCover(result, u, v) {
  const classes = result?.surfaceMaterialClasses;
  const size = Number(result?.surfaceMaterialClassSize || 0);
  if (!classes || size < 2) return null;
  const sourceX = Math.max(0, Math.min(size - 1, u * (size - 1)));
  const sourceY = Math.max(0, Math.min(size - 1, (1 - v) * (size - 1)));
  const x0 = Math.floor(sourceX);
  const y0 = Math.floor(sourceY);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = sourceX - x0;
  const ty = sourceY - y0;
  const samples = [
    [x0, y0, (1 - tx) * (1 - ty)],
    [x1, y0, tx * (1 - ty)],
    [x0, y1, (1 - tx) * ty],
    [x1, y1, tx * ty]
  ];
  const mixA = [0, 0, 0, 0];
  const mixB = [0, 0];
  for (const [x, y, weight] of samples) {
    if (weight <= 0) continue;
    const mix = terrainSurfaceMixForClass(classes[y * size + x]);
    for (let channel = 0; channel < 4; channel += 1) mixA[channel] += mix.mixA[channel] * weight;
    for (let channel = 0; channel < 2; channel += 1) mixB[channel] += mix.mixB[channel] * weight;
  }
  return { mixA, mixB };
}

export function applyWorldCoverSurfaceMaterialMix(mesh, result) {
  const geometry = mesh?.geometry;
  const uvs = geometry?.attributes?.uv;
  const attributes = ensureTerrainSurfaceMixAttributes(geometry);
  if (!uvs || !attributes || !result?.surfaceMaterialClasses) return false;
  for (let index = 0; index < uvs.count; index += 1) {
    const mix = weightedMixForWorldCover(result, uvs.getX(index), uvs.getY(index));
    if (!mix) return false;
    attributes.mixA.setXYZW(index, ...mix.mixA);
    attributes.mixB.setXY(index, ...mix.mixB);
  }
  attributes.mixA.needsUpdate = true;
  attributes.mixB.needsUpdate = true;
  mesh.userData.terrainSurfaceMaterialAuthority = 'worldcover-per-vertex-material-mix';
  return true;
}

export function setTerrainSurfaceMaterialMixAt(attributes, index, mode) {
  if (!attributes?.mixA || !attributes?.mixB) return false;
  const mix = terrainSurfaceMixForClass(terrainSurfaceClassForMappedMode(mode));
  attributes.mixA.setXYZW(index, ...mix.mixA);
  attributes.mixB.setXY(index, ...mix.mixB);
  return true;
}

export function applyTerrainProfileSurfaceMaterialMix(mesh, mode = 'grass') {
  const geometry = mesh?.geometry;
  const positions = geometry?.attributes?.position;
  const attributes = ensureTerrainSurfaceMixAttributes(geometry);
  if (!positions || !attributes) return 0;
  const surfaceClass = terrainSurfaceClassForMappedMode(mode);
  const mix = terrainSurfaceMixForClass(surfaceClass);
  const colors = geometry.attributes.color;
  for (let index = 0; index < positions.count; index += 1) {
    attributes.mixA.setXYZW(index, ...mix.mixA);
    attributes.mixB.setXY(index, ...mix.mixB);
    if (surfaceClass === TERRAIN_SURFACE_CLASS.urban && colors) {
      colors.setXYZ(index, 1, 1, 1);
    }
  }
  attributes.mixA.needsUpdate = true;
  attributes.mixB.needsUpdate = true;
  if (surfaceClass === TERRAIN_SURFACE_CLASS.urban && colors) colors.needsUpdate = true;
  mesh.userData.terrainSurfaceMaterialAuthority = surfaceClass === TERRAIN_SURFACE_CLASS.grass
    ? 'natural-profile-fallback'
    : 'spatial-profile-fallback';
  return positions.count;
}

export function applyTerrainReliefMaterialMix(mesh) {
  const geometry = mesh?.geometry;
  const positions = geometry?.attributes?.position;
  const attributes = ensureTerrainSurfaceMixAttributes(geometry);
  if (!positions || !attributes) return 0;
  if (!geometry.attributes.normal || geometry.attributes.normal.count !== positions.count) {
    geometry.computeVertexNormals?.();
  }
  const normals = geometry.attributes.normal;
  if (!normals || normals.count !== positions.count) return 0;

  let exposedRockVertices = 0;
  for (let index = 0; index < positions.count; index += 1) {
    // A 23-degree slope begins exposing substrate; by roughly 44 degrees the
    // natural terrain is predominantly rock. Explicit urban, sand and snow
    // ownership remains authoritative over the geomorphic fallback.
    const up = Math.max(0, Math.min(1, Math.abs(Number(normals.getY(index) || 0))));
    const slopeT = Math.max(0, Math.min(1, (0.92 - up) / 0.20));
    const slopeRock = slopeT * slopeT * (3 - 2 * slopeT);
    if (slopeRock <= 0.001) continue;

    const urban = Math.max(0, Number(attributes.mixA.getX(index) || 0));
    const sand = Math.max(0, Number(attributes.mixA.getY(index) || 0));
    const snow = Math.max(0, Number(attributes.mixB.getY(index) || 0));
    const protectedWeight = Math.min(1, urban + sand + snow);
    const rock = Math.max(
      Math.max(0, Number(attributes.mixB.getX(index) || 0)),
      slopeRock * (1 - protectedWeight)
    );
    if (rock <= 0.001) continue;

    const naturalScale = Math.max(0, 1 - rock);
    attributes.mixA.setXYZW(
      index,
      urban,
      sand,
      Math.max(0, Number(attributes.mixA.getZ(index) || 0)) * naturalScale,
      Math.max(0, Number(attributes.mixA.getW(index) || 0)) * naturalScale
    );
    attributes.mixB.setXY(index, rock, snow);
    exposedRockVertices += 1;
  }
  if (exposedRockVertices > 0) {
    attributes.mixA.needsUpdate = true;
    attributes.mixB.needsUpdate = true;
  }
  mesh.userData.terrainReliefMaterialAuthority = {
    kind: 'slope-derived-exposed-rock',
    exposedRockVertices
  };
  return exposedRockVertices;
}

export function configureTerrainSurfaceMaterialBlend(mesh, textureSets = {}) {
  const material = mesh?.material;
  const geometry = mesh?.geometry;
  if (!material || Array.isArray(material) || !ensureTerrainSurfaceMixAttributes(geometry)) return false;
  material.userData = material.userData || {};
  let state = material.userData.terrainSurfaceMaterialBlend;
  if (!state) {
    const previousOnBeforeCompile = material.onBeforeCompile;
    const previousProgramCacheKey = material.customProgramCacheKey?.bind(material);
    state = {
      uniforms: {
        terrainUrbanMap: { value: null },
        terrainSandMap: { value: null },
        terrainForestMap: { value: null },
        terrainSoilMap: { value: null },
        terrainRockMap: { value: null },
        terrainAridWarmth: { value: 0 }
      }
    };
    material.userData.terrainSurfaceMaterialBlend = state;
    material.onBeforeCompile = (shader, renderer) => {
      previousOnBeforeCompile?.(shader, renderer);
      Object.assign(shader.uniforms, state.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec4 terrainSurfaceMixA;\nattribute vec2 terrainSurfaceMixB;\nvarying vec4 vTerrainSurfaceMixA;\nvarying vec2 vTerrainSurfaceMixB;\nvarying float vTerrainWorldHeight;\nvarying float vTerrainWorldHorizontal;'
        )
        .replace(
          '#include <color_vertex>',
          '#include <color_vertex>\nvTerrainSurfaceMixA = terrainSurfaceMixA;\nvTerrainSurfaceMixB = terrainSurfaceMixB;\nvec3 terrainWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;\nvTerrainWorldHeight = terrainWorldPosition.y;\nvTerrainWorldHorizontal = terrainWorldPosition.x * 0.73 + terrainWorldPosition.z * 0.41;'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D terrainUrbanMap;\nuniform sampler2D terrainSandMap;\nuniform sampler2D terrainForestMap;\nuniform sampler2D terrainSoilMap;\nuniform sampler2D terrainRockMap;\nuniform float terrainAridWarmth;\nvarying vec4 vTerrainSurfaceMixA;\nvarying vec2 vTerrainSurfaceMixB;\nvarying float vTerrainWorldHeight;\nvarying float vTerrainWorldHorizontal;'
        )
        .replace(
          '#include <map_fragment>',
          [
            'vec4 terrainGrassColor = vec4(0.29, 0.48, 0.18, 1.0);',
            'vec4 terrainUrbanColor = vec4(0.46, 0.48, 0.51, 1.0);',
            'vec4 terrainSandColor = vec4(0.78, 0.66, 0.44, 1.0);',
            'vec4 terrainForestColor = vec4(0.18, 0.33, 0.14, 1.0);',
            'vec4 terrainSoilColor = vec4(0.49, 0.37, 0.24, 1.0);',
            'vec4 terrainRockColor = vec4(0.48, 0.42, 0.36, 1.0);',
            '#ifdef USE_MAP',
            '  terrainGrassColor = mapTexelToLinear(texture2D(map, vUv));',
            '  terrainUrbanColor = mapTexelToLinear(texture2D(terrainUrbanMap, vUv));',
            '  terrainSandColor = mapTexelToLinear(texture2D(terrainSandMap, vUv));',
            '  terrainForestColor = mapTexelToLinear(texture2D(terrainForestMap, vUv));',
            '  terrainSoilColor = mapTexelToLinear(texture2D(terrainSoilMap, vUv));',
            '  terrainRockColor = mapTexelToLinear(texture2D(terrainRockMap, vUv));',
            '#endif',
            'terrainGrassColor.rgb = mix(terrainGrassColor.rgb, vec3(0.42, 0.36, 0.22), terrainAridWarmth * 0.72);',
            'terrainRockColor.rgb = mix(terrainRockColor.rgb, vec3(0.58, 0.31, 0.15), terrainAridWarmth);',
            'float terrainRockBand = 0.5 + 0.5 * sin(vTerrainWorldHeight * 0.045 + sin(vTerrainWorldHorizontal * 0.013) * 0.8);',
            'terrainRockColor.rgb *= mix(0.94, 1.06, smoothstep(0.12, 0.88, terrainRockBand));',
            'float terrainSnowWeight = clamp(vTerrainSurfaceMixB.y, 0.0, 1.0);',
            'float terrainClassWeight = clamp(dot(vTerrainSurfaceMixA, vec4(1.0)) + vTerrainSurfaceMixB.x + terrainSnowWeight, 0.0, 1.0);',
            'vec4 terrainSurfaceColor = terrainGrassColor * (1.0 - terrainClassWeight);',
            'terrainSurfaceColor += terrainUrbanColor * max(0.0, vTerrainSurfaceMixA.x);',
            'terrainSurfaceColor += terrainSandColor * max(0.0, vTerrainSurfaceMixA.y);',
            'terrainSurfaceColor += terrainForestColor * max(0.0, vTerrainSurfaceMixA.z);',
            'terrainSurfaceColor += terrainSoilColor * max(0.0, vTerrainSurfaceMixA.w);',
            'terrainSurfaceColor += terrainRockColor * max(0.0, vTerrainSurfaceMixB.x);',
            'terrainSurfaceColor += vec4(0.94, 0.96, 1.0, 1.0) * terrainSnowWeight;',
            'diffuseColor *= terrainSurfaceColor;'
          ].join('\n')
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.84, clamp(vTerrainSurfaceMixA.x, 0.0, 1.0));'
        );
    };
    material.customProgramCacheKey = () => [
      previousProgramCacheKey?.() || '',
      'terrain-semantic-pbr-material-mix-v4'
    ].join(':');
  }
  state.uniforms.terrainUrbanMap.value = textureSets.urban?.map || material.map;
  state.uniforms.terrainSandMap.value = textureSets.sand?.map || material.map;
  state.uniforms.terrainForestMap.value = textureSets.forest?.map || material.map;
  state.uniforms.terrainSoilMap.value = textureSets.soil?.map || material.map;
  state.uniforms.terrainRockMap.value = textureSets.rock?.map || material.map;
  state.uniforms.terrainAridWarmth.value = textureSets.biomeId === 'hot-desert' ? 1 : 0;
  material.needsUpdate = true;
  mesh.userData.terrainSurfaceMaterialBlend = {
    authority: 'single-terrain-semantic-pbr-material',
    classes: ['grass', 'urban', 'sand', 'forest', 'soil', 'rock', 'snow']
  };
  return true;
}
