const exteriorMaterialPool = new Map();
const facadeTexturePool = new Map();

const FACADE_TEXTURES = Object.freeze({
  brick: '/app/assets/textures/facades/brick-classic-v1.webp',
  stone: '/app/assets/textures/facades/stone-civic-v1.webp',
  glass: '/app/assets/textures/facades/glass-curtain-v1.webp',
  neutral: '/app/assets/textures/facades/neutral-urban-v1.webp',
  residential: '/app/assets/textures/facades/residential-warm-v1.webp'
});

const MATERIAL_PROFILES = Object.freeze({
  brick: { color: 0x9b6652, roughness: 0.9, metalness: 0.0 },
  sandstone: { color: 0xc8ad82, roughness: 0.88, metalness: 0.0 },
  limestone: { color: 0xc5c0ae, roughness: 0.86, metalness: 0.0 },
  marble: { color: 0xd7d5cf, roughness: 0.7, metalness: 0.0 },
  stone: { color: 0x999489, roughness: 0.92, metalness: 0.0 },
  concrete: { color: 0xa6a5a0, roughness: 0.91, metalness: 0.0 },
  stucco: { color: 0xc9c2b4, roughness: 0.88, metalness: 0.0 },
  wood: { color: 0x8d7258, roughness: 0.86, metalness: 0.0 },
  glass: { color: 0x758997, roughness: 0.34, metalness: 0.12 },
  metal: { color: 0x92999c, roughness: 0.52, metalness: 0.58 },
  neutral: { color: 0x8d9292, roughness: 0.9, metalness: 0.0 }
});

const ROOF_PROFILES = Object.freeze({
  clay_tile: { colorA: 0x5d3d34, colorB: 0x865641, roughness: 0.9, metalness: 0.0, grainScale: 0.54 },
  slate: { colorA: 0x252c30, colorB: 0x414b50, roughness: 0.88, metalness: 0.02, grainScale: 0.7 },
  metal: { colorA: 0x4c5a60, colorB: 0x718084, roughness: 0.62, metalness: 0.3, grainScale: 0.34 },
  concrete: { colorA: 0x555752, colorB: 0x787971, roughness: 0.94, metalness: 0.0, grainScale: 0.42 },
  membrane: { colorA: 0x444a4a, colorB: 0x676c68, roughness: 0.96, metalness: 0.0, grainScale: 0.36 },
  gravel: { colorA: 0x504e48, colorB: 0x777268, roughness: 0.98, metalness: 0.0, grainScale: 0.82 }
});

function roofPresentation(mappedMaterial = '', mappedColor = '', buildingType = '', buildingSeed = 0) {
  const material = String(mappedMaterial || '').trim().toLowerCase();
  let key =
    /clay|terracotta|tile/.test(material) ? 'clay_tile' :
    /slate|shingle/.test(material) ? 'slate' :
    /metal|steel|zinc|copper|aluminium|aluminum/.test(material) ? 'metal' :
    /concrete|cement/.test(material) ? 'concrete' :
    /gravel|aggregate|stone/.test(material) ? 'gravel' :
    'membrane';
  if (!material) {
    const type = String(buildingType || '').toLowerCase();
    if (['house', 'residential', 'detached', 'terrace', 'townhouse'].includes(type)) {
      key = ((Number(buildingSeed) || 0) & 1) === 0 ? 'clay_tile' : 'slate';
    } else if (['industrial', 'warehouse', 'hangar'].includes(type)) {
      key = 'metal';
    } else {
      key = ((Number(buildingSeed) || 0) & 1) === 0 ? 'membrane' : 'gravel';
    }
  }
  const base = ROOF_PROFILES[key];
  const colorMapped = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(mappedColor || '').trim());
  if (!colorMapped) return { key, colorMapped, ...base };
  const mapped = new THREE.Color(mappedColor);
  const dark = mapped.clone().multiplyScalar(0.72);
  const light = mapped.clone().lerp(new THREE.Color(0xffffff), 0.24);
  return {
    key: `${key}-mapped-${mapped.getHexString()}`,
    colorMapped,
    colorA: dark.getHex(),
    colorB: light.getHex(),
    roughness: base.roughness,
    metalness: base.metalness,
    grainScale: base.grainScale
  };
}

function normalizeMappedMaterial(value = '') {
  const material = String(value || '').trim().toLowerCase();
  if (!material) return null;
  if (/sandstone/.test(material)) return 'sandstone';
  if (/limestone/.test(material)) return 'limestone';
  if (/marble/.test(material)) return 'marble';
  if (/brick|masonry/.test(material)) return 'brick';
  if (/granite|slate|stone|rock/.test(material)) return 'stone';
  if (/concrete|cement/.test(material)) return 'concrete';
  if (/stucco|plaster|render/.test(material)) return 'stucco';
  if (/timber|wood/.test(material)) return 'wood';
  if (/glass|mirror/.test(material)) return 'glass';
  if (/metal|steel|aluminium|aluminum|copper|zinc/.test(material)) return 'metal';
  return null;
}

function neutralProfileForType(buildingType = '') {
  const type = String(buildingType || '').trim().toLowerCase();
  if (type === 'church' || type === 'cathedral' || type === 'chapel' || type === 'religious' || type === 'civic') {
    return { ...MATERIAL_PROFILES.neutral, color: 0x887a69 };
  }
  if (type === 'industrial' || type === 'warehouse' || type === 'hangar' || type === 'transportation' || type === 'service') {
    return { ...MATERIAL_PROFILES.neutral, color: 0x747f83 };
  }
  if (type === 'house' || type === 'residential' || type === 'detached' || type === 'outbuilding') {
    return { ...MATERIAL_PROFILES.neutral, color: 0x927d70 };
  }
  if (type === 'commercial' || type === 'office' || type === 'hotel') {
    return { ...MATERIAL_PROFILES.neutral, color: 0x73828a, roughness: 0.76, metalness: 0.04 };
  }
  if (type === 'medical' || type === 'education') {
    return { ...MATERIAL_PROFILES.neutral, color: 0x9b9387 };
  }
  return MATERIAL_PROFILES.neutral;
}

function quantizedColor(baseColor, fallback) {
  const source = new THREE.Color(baseColor || fallback);
  const hsl = { h: 0, s: 0, l: 0 };
  source.getHSL(hsl);
  const hue = Math.round(hsl.h * 18) / 18;
  const saturation = Math.round(Math.min(0.55, hsl.s) * 8) / 8;
  // Source palettes commonly publish pure white, which clips under daylight
  // and erases massing/shadow detail across entire downtowns. Preserve the
  // mapped hue while keeping exterior reflectance inside a readable range.
  const lightness = Math.round(Math.max(0.24, Math.min(0.68, hsl.l)) * 10) / 10;
  return new THREE.Color().setHSL(hue, saturation, lightness);
}

function materialPoolKey(family, color, lodTier, variant) {
  return `${lodTier === 'mid' ? 'mid' : 'near'}:${family}:v${variant}:${color.getHexString()}`;
}

function usesOccupiedFacade(type) {
  return ![
    'barn', 'bridge', 'canopy', 'carport', 'garage', 'garages', 'greenhouse',
    'hangar', 'industrial', 'parking', 'parking_garage', 'roof', 'service',
    'shed', 'silo', 'storage_tank', 'warehouse'
  ].includes(String(type || '').toLowerCase());
}

function prefersStructuredUrbanFacade(buildingType, options = {}) {
  const type = String(buildingType || '').toLowerCase();
  const heightMeters = Number(options.heightMeters || 0);
  const footprintArea = Number(options.footprintArea || 0);
  const denseUrban = options.denseUrban === true;
  if (type === 'skyscraper') return true;
  if (['office', 'commercial', 'hotel'].includes(type)) {
    return heightMeters >= 28 || (heightMeters >= 20 && footprintArea >= 260) || (denseUrban && heightMeters >= 24);
  }
  if (type === 'retail') return (heightMeters >= 18 && footprintArea >= 320) || (denseUrban && heightMeters >= 22);
  if (type === 'apartments') return heightMeters >= 38 || (heightMeters >= 28 && footprintArea >= 520);
  return type === 'yes' && denseUrban && (heightMeters >= 40 || (heightMeters >= 30 && footprintArea >= 560));
}

function facadePresentation(family, buildingType = '', options = {}, buildingSeed = 0) {
  const type = String(buildingType || '').trim().toLowerCase();
  const variant = ((Number(buildingSeed) || 0) >>> 0) % 3;
  if (family === 'brick') {
    return {
      atlasStyle: 'brick',
      facadeStyle: ['church', 'cathedral'].includes(type) ? 'historic_punched' : variant === 0 ? 'townhouse' : 'residential_punched'
    };
  }
  if (['sandstone', 'limestone', 'marble', 'stone'].includes(family)) {
    return { atlasStyle: 'stone', facadeStyle: ['church', 'cathedral', 'civic'].includes(type) ? 'historic_punched' : 'office_grid' };
  }
  if (family === 'glass') return { atlasStyle: 'glass', facadeStyle: type === 'hotel' ? 'hotel_vertical' : 'curtain_wall' };
  if (family === 'metal') return { atlasStyle: 'glass', facadeStyle: 'industrial_panel' };
  if (['commercial', 'office', 'retail', 'skyscraper'].includes(type)) {
    return { atlasStyle: 'glass', facadeStyle: variant === 0 ? 'curtain_wall' : variant === 1 ? 'office_grid' : 'hotel_vertical' };
  }
  if (type === 'hotel') return { atlasStyle: 'glass', facadeStyle: 'hotel_vertical' };
  if (type === 'apartments') {
    return { atlasStyle: 'residential', facadeStyle: variant === 0 ? 'apartment_balcony' : 'residential_punched' };
  }
  if (['house', 'residential', 'apartments', 'detached', 'terrace', 'townhouse', 'outbuilding'].includes(type)) {
    return { atlasStyle: 'residential', facadeStyle: variant === 0 ? 'townhouse' : 'residential_punched' };
  }
  if (['church', 'cathedral', 'chapel', 'religious', 'civic', 'medical', 'education'].includes(type)) {
    return { atlasStyle: 'stone', facadeStyle: 'historic_punched' };
  }
  if (['industrial', 'warehouse', 'hangar', 'transportation', 'service'].includes(type)) {
    return { atlasStyle: 'neutral', facadeStyle: 'industrial_panel' };
  }
  if (prefersStructuredUrbanFacade(type, options) || usesOccupiedFacade(type)) {
    return {
      atlasStyle: prefersStructuredUrbanFacade(type, options) ? 'neutral' : variant === 0 ? 'residential' : 'neutral',
      facadeStyle: ['office_grid', 'residential_punched', 'apartment_balcony'][variant]
    };
  }
  return { atlasStyle: 'neutral', facadeStyle: 'industrial_panel' };
}

function facadeTextureRepeat(facadeStyle) {
  // ExtrudeGeometry side UVs are meter-scaled. Each static atlas contains
  // four or five complete storeys, so its full height must repeat every
  // roughly 13-17 m. The former 32-54 m scale exposed only narrow slices of
  // the atlas on ordinary buildings, which read as blue/beige stripes rather
  // than windows and masonry.
  if (facadeStyle === 'curtain_wall') return { x: 0.075, y: 1 / 15.5 };
  if (facadeStyle === 'townhouse') return { x: 0.065, y: 1 / 13 };
  if (facadeStyle === 'industrial_panel') return { x: 0.08, y: 1 / 17 };
  if (facadeStyle === 'hotel_vertical') return { x: 0.08, y: 1 / 15.5 };
  if (facadeStyle === 'apartment_balcony') return { x: 0.07, y: 1 / 16 };
  if (facadeStyle === 'historic_punched') return { x: 0.09, y: 1 / 14 };
  return { x: 0.08, y: 1 / 16 };
}

function facadeTexture(appCtx, atlasStyle, facadeStyle, variant = 0) {
  const variantIndex = Math.max(0, Math.min(3, Number(variant) | 0));
  const poolKey = `${atlasStyle}:${facadeStyle}:v${variantIndex}`;
  const cached = facadeTexturePool.get(poolKey);
  if (cached) return cached;
  const url = FACADE_TEXTURES[atlasStyle] || FACADE_TEXTURES.neutral;
  const repeat = facadeTextureRepeat(facadeStyle);
  const texture = new THREE.TextureLoader().load(
    url,
    () => {
      texture.userData ||= {};
      texture.userData.loadStatus = 'ready';
      texture.needsUpdate = true;
    },
    undefined,
    () => {
      texture.userData ||= {};
      texture.userData.loadStatus = 'failed';
    }
  );
  texture.name = `building-facade-atlas:${atlasStyle}:${facadeStyle}:v${variantIndex}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat.x, repeat.y);
  // Preserve the proven deterministic facade phasing from the Phase 4
  // renderer without recreating a texture per building.
  // V stays aligned across buildings so a wall begins with a complete
  // storey instead of a random horizontal slice. U phasing is enough to
  // prevent identical neighboring window columns.
  texture.offset.set(variantIndex * 0.173, 0);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  else texture.encoding = THREE.sRGBEncoding;
  const maximumAnisotropy = Number(appCtx?.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  texture.anisotropy = Math.max(1, Math.min(8, maximumAnisotropy));
  texture.userData = {
    owner: 'engine/building-facade-materials',
    facadeStyle,
    facadeAtlasStyle: atlasStyle,
    facadeVariant: variantIndex,
    source: 'project-authored-static-atlas',
    assetUrl: url,
    loadStatus: 'loading',
    sharedRuntimeTexture: true
  };
  facadeTexturePool.set(poolKey, texture);
  return texture;
}

function glslColor(hex) {
  const color = new THREE.Color(hex);
  return `vec3(${color.r.toFixed(5)}, ${color.g.toFixed(5)}, ${color.b.toFixed(5)})`;
}

function applyWallOnlyFacadeMap(material, roof) {
  const roofA = glslColor(roof.colorA);
  const roofB = glslColor(roof.colorB);
  const grainScale = Number(roof.grainScale || 0.6).toFixed(4);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying float vFacadeWallMask;\nvarying vec2 vFacadeRoofPosition;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      [
        '#include <beginnormal_vertex>',
        'vFacadeWallMask = smoothstep(0.18, 0.72, 1.0 - abs(objectNormal.y));',
        'vFacadeRoofPosition = position.xz;'
      ].join('\n')
    );
    shader.fragmentShader = [
      'varying float vFacadeWallMask;',
      'varying vec2 vFacadeRoofPosition;',
      'float facadeRoofHash(vec2 p) {',
      '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
      '}',
      'float facadeRoofNoise(vec2 p) {',
      '  vec2 cell = floor(p);',
      '  vec2 fraction = fract(p);',
      '  vec2 blend = fraction * fraction * (3.0 - 2.0 * fraction);',
      '  float a = facadeRoofHash(cell);',
      '  float b = facadeRoofHash(cell + vec2(1.0, 0.0));',
      '  float c = facadeRoofHash(cell + vec2(0.0, 1.0));',
      '  float d = facadeRoofHash(cell + vec2(1.0, 1.0));',
      '  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);',
      '}',
      shader.fragmentShader
    ].join('\n');
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        [
        '#ifdef USE_MAP',
        '  vec4 facadeTexel = mapTexelToLinear(texture2D(map, vUv));',
        `  float roofGrain = facadeRoofNoise(vFacadeRoofPosition * ${grainScale});`,
        `  vec3 roofSurface = mix(${roofA}, ${roofB}, 0.18 + roofGrain * 0.64);`,
        '  diffuseColor.rgb = mix(roofSurface, diffuseColor.rgb * facadeTexel.rgb, vFacadeWallMask);',
        '  diffuseColor.a *= facadeTexel.a;',
        '#endif'
      ].join('\n')
    );
  };
  material.customProgramCacheKey = () => `building-facade-roof-surface-v2:${roof.key}`;
}

export function getBuildingMaterial(engineContext, buildingType, buildingSeed, baseColorHex, options = {}) {
  const appCtx = engineContext?.appCtx || engineContext;
  const mappedFamily = normalizeMappedMaterial(options.facadeMaterial);
  const family = mappedFamily || 'neutral';
  const profile = mappedFamily ? MATERIAL_PROFILES[family] : neutralProfileForType(buildingType);
  const mappedColor = options.facadeColorMapped === true;
  const color = quantizedColor(mappedColor ? baseColorHex : null, profile.color);
  const lodTier = options.lodTier === 'mid' ? 'mid' : 'near';
  const presentation = facadePresentation(family, buildingType, options, buildingSeed);
  const roof = roofPresentation(options.roofMaterial, options.roofColor, buildingType, buildingSeed);
  const facadeStyle = presentation.facadeStyle;
  const facadeAtlasStyle = presentation.atlasStyle;
  const facadeVariant = ((Number(buildingSeed) || 0) >>> 0) % 4;
  const tint = color.clone().lerp(
    new THREE.Color(0xffffff),
    mappedColor ? 0.5 : mappedFamily ? 0.34 : 0.7
  );
  const key = materialPoolKey(
    `${family}:${facadeAtlasStyle}:${facadeStyle}:roof-${roof.key}`,
    mappedColor ? tint : new THREE.Color(0xffffff),
    lodTier,
    facadeVariant
  );
  const cached = exteriorMaterialPool.get(key);
  if (cached) return cached;

  const material = new THREE.MeshStandardMaterial({
    color: tint,
    map: facadeTexture(appCtx, facadeAtlasStyle, facadeStyle, facadeVariant),
    roughness: Math.min(1, profile.roughness + (lodTier === 'mid' ? 0.04 : 0)),
    metalness: Math.max(profile.metalness, roof.metalness * 0.08)
  });
  applyWallOnlyFacadeMap(material, roof);
  material.name = `building-exterior:${key}`;
  material.userData = {
    buildingBatchKey: `building-exterior:${key}`,
    buildingExterior: true,
    facadeAtlas: true,
    facadeShaderOwner: 'engine/building-facade-materials',
    wallOnlyTexture: true,
    facadeStyle,
    facadeAtlasStyle,
    facadeVariant,
    facadeAssetUrl: FACADE_TEXTURES[facadeAtlasStyle],
    sharedRuntimeMaterial: true,
    exteriorFamily: family,
    materialClaim: mappedFamily ? 'mapped' : 'neutral-fallback',
    materialSource: mappedFamily ? 'building:material' : 'unmapped',
    facadeSelection: mappedFamily ? 'mapped-material-family' : 'type-inferred-fallback',
    colorClaim: mappedColor ? 'mapped' : 'profile-default',
    colorSource: mappedColor ? 'building:colour' : 'material-profile',
    roofSurfaceOwner: 'engine/building-facade-materials',
    roofSurfaceStyle: roof.key,
    roofMaterialClaim: options.roofMaterial ? 'mapped' : 'type-inferred-fallback',
    roofMaterialSource: options.roofMaterial ? 'roof:material' : 'building-type',
    roofColorClaim: roof.colorMapped ? 'mapped' : 'profile-default',
    roofColorSource: roof.colorMapped ? 'roof:colour' : 'roof-profile'
  };
  exteriorMaterialPool.set(key, material);
  return material;
}

export function buildingExteriorMaterialPoolSnapshot() {
  const claims = {};
  exteriorMaterialPool.forEach((material) => {
    const claim = material.userData?.materialClaim || 'unknown';
    claims[claim] = (claims[claim] || 0) + 1;
  });
  return {
    materialCount: exteriorMaterialPool.size,
    claims,
    textures: Array.from(facadeTexturePool.entries()).map(([style, texture]) => ({
      style,
      status: texture.userData?.loadStatus || 'unknown',
      assetUrl: texture.userData?.assetUrl || null
    }))
  };
}

export function clearBuildingExteriorMaterialPool() {
  exteriorMaterialPool.forEach((material) => material.dispose?.());
  exteriorMaterialPool.clear();
  facadeTexturePool.forEach((texture) => texture.dispose?.());
  facadeTexturePool.clear();
}
