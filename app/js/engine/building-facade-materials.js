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

function applyWallOnlyFacadeMap(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying float vFacadeWallMask;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      [
        '#include <beginnormal_vertex>',
        'vFacadeWallMask = smoothstep(0.18, 0.72, 1.0 - abs(objectNormal.y));'
      ].join('\n')
    );
    shader.fragmentShader = `varying float vFacadeWallMask;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        [
        '#ifdef USE_MAP',
        '  vec4 facadeTexel = mapTexelToLinear(texture2D(map, vUv));',
        '  diffuseColor *= mix(vec4(1.0), facadeTexel, vFacadeWallMask);',
        '#endif'
      ].join('\n')
    );
  };
  material.customProgramCacheKey = () => 'building-facade-atlas-wall-mask-v1';
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
  const facadeStyle = presentation.facadeStyle;
  const facadeAtlasStyle = presentation.atlasStyle;
  const facadeVariant = ((Number(buildingSeed) || 0) >>> 0) % 4;
  const tint = color.clone().lerp(
    new THREE.Color(0xffffff),
    mappedColor ? 0.5 : mappedFamily ? 0.34 : 0.7
  );
  const key = materialPoolKey(
    `${family}:${facadeAtlasStyle}:${facadeStyle}`,
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
    metalness: profile.metalness
  });
  applyWallOnlyFacadeMap(material);
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
    colorSource: mappedColor ? 'building:colour' : 'material-profile'
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
