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
        terrainRockMap: { value: null }
      }
    };
    material.userData.terrainSurfaceMaterialBlend = state;
    material.onBeforeCompile = (shader, renderer) => {
      previousOnBeforeCompile?.(shader, renderer);
      Object.assign(shader.uniforms, state.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec4 terrainSurfaceMixA;\nattribute vec2 terrainSurfaceMixB;\nvarying vec4 vTerrainSurfaceMixA;\nvarying vec2 vTerrainSurfaceMixB;'
        )
        .replace(
          '#include <color_vertex>',
          '#include <color_vertex>\nvTerrainSurfaceMixA = terrainSurfaceMixA;\nvTerrainSurfaceMixB = terrainSurfaceMixB;'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D terrainUrbanMap;\nuniform sampler2D terrainSandMap;\nuniform sampler2D terrainForestMap;\nuniform sampler2D terrainSoilMap;\nuniform sampler2D terrainRockMap;\nvarying vec4 vTerrainSurfaceMixA;\nvarying vec2 vTerrainSurfaceMixB;'
        )
        .replace(
          '#include <map_fragment>',
          [
            '#ifdef USE_MAP',
            '  vec4 terrainGrassColor = mapTexelToLinear(texture2D(map, vUv));',
            '  vec4 terrainUrbanColor = mapTexelToLinear(texture2D(terrainUrbanMap, vUv));',
            '  vec4 terrainSandColor = mapTexelToLinear(texture2D(terrainSandMap, vUv));',
            '  vec4 terrainForestColor = mapTexelToLinear(texture2D(terrainForestMap, vUv));',
            '  vec4 terrainSoilColor = mapTexelToLinear(texture2D(terrainSoilMap, vUv));',
            '  vec4 terrainRockColor = mapTexelToLinear(texture2D(terrainRockMap, vUv));',
            '  float terrainSnowWeight = clamp(vTerrainSurfaceMixB.y, 0.0, 1.0);',
            '  float terrainClassWeight = clamp(dot(vTerrainSurfaceMixA, vec4(1.0)) + vTerrainSurfaceMixB.x + terrainSnowWeight, 0.0, 1.0);',
            '  vec4 terrainSurfaceColor = terrainGrassColor * (1.0 - terrainClassWeight);',
            '  terrainSurfaceColor += terrainUrbanColor * max(0.0, vTerrainSurfaceMixA.x);',
            '  terrainSurfaceColor += terrainSandColor * max(0.0, vTerrainSurfaceMixA.y);',
            '  terrainSurfaceColor += terrainForestColor * max(0.0, vTerrainSurfaceMixA.z);',
            '  terrainSurfaceColor += terrainSoilColor * max(0.0, vTerrainSurfaceMixA.w);',
            '  terrainSurfaceColor += terrainRockColor * max(0.0, vTerrainSurfaceMixB.x);',
            '  terrainSurfaceColor += vec4(0.94, 0.96, 1.0, 1.0) * terrainSnowWeight;',
            '  diffuseColor *= terrainSurfaceColor;',
            '#endif'
          ].join('\n')
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.84, clamp(vTerrainSurfaceMixA.x, 0.0, 1.0));'
        );
    };
    material.customProgramCacheKey = () => [
      previousProgramCacheKey?.() || '',
      'terrain-semantic-pbr-material-mix-v1'
    ].join(':');
  }
  state.uniforms.terrainUrbanMap.value = textureSets.urban?.map || material.map;
  state.uniforms.terrainSandMap.value = textureSets.sand?.map || material.map;
  state.uniforms.terrainForestMap.value = textureSets.forest?.map || material.map;
  state.uniforms.terrainSoilMap.value = textureSets.soil?.map || material.map;
  state.uniforms.terrainRockMap.value = textureSets.rock?.map || material.map;
  material.needsUpdate = true;
  mesh.userData.terrainSurfaceMaterialBlend = {
    authority: 'single-terrain-semantic-pbr-material',
    classes: ['grass', 'urban', 'sand', 'forest', 'soil', 'rock', 'snow']
  };
  return true;
}
