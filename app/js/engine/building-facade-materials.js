import { createWindowTexture } from "./procedural-textures.js?v=2";
import { applyFacadeWallMask } from "./building-facade-shader.js?v=1";

function polygonAreaXZ(pts) {
  if (!Array.isArray(pts) || pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    area += p0.x * p1.z - p1.x * p0.z;
  }
  return Math.abs(area) * 0.5;
}

function isGlassForwardBuildingType(type) {
  return type === 'office' ||
    type === 'commercial' ||
    type === 'retail' ||
    type === 'hotel' ||
    type === 'skyscraper';
}

function usesOccupiedFacade(type) {
  return ![
    'barn',
    'bridge',
    'canopy',
    'carport',
    'garage',
    'garages',
    'greenhouse',
    'hangar',
    'industrial',
    'parking',
    'parking_garage',
    'roof',
    'service',
    'shed',
    'silo',
    'storage_tank',
    'warehouse'
  ].includes(String(type || '').toLowerCase());
}

function midFacadeStyle(buildingType, facadeType, facadeStyle, seed) {
  const type = String(buildingType || 'yes').toLowerCase();
  const variant = ((Number(seed) || 0) >>> 0) % 3;
  const adjust = variant === 0 ? -0.035 : variant === 2 ? 0.035 : 0;
  const resolve = (key, color) => {
    const resolved = new THREE.Color(color).offsetHSL(0, 0, adjust);
    return { key: `${facadeType}:${facadeStyle}:${key}:v${variant}`, color: resolved.getHex() };
  };
  if (type === 'industrial' || type === 'warehouse') {
    return resolve('industrial', 0x969b9d);
  }
  if (type === 'church' || type === 'cathedral') {
    return resolve('historic', 0x9d8977);
  }
  if (isGlassForwardBuildingType(type)) {
    return resolve('commercial', 0x8f9da8);
  }
  if (type === 'house' || type === 'residential' || type === 'detached' || type === 'apartments') {
    return resolve('residential', facadeType === 'brick' ? 0xa37f6c : 0xb8b1a7);
  }
  return resolve('general', facadeType === 'brick' ? 0x987565 : 0xaab0b2);
}

function facadeTextureRepeat(facadeType, facadeStyle) {
  // ExtrudeGeometry side UVs use meter-scale coordinates rather than normalized UVs.
  if (facadeType === 'window') {
    if (facadeStyle === 'curtain_wall') return { x: 0.075, y: 1 / 54 };
    if (facadeStyle === 'townhouse') return { x: 0.055, y: 1 / 34 };
    if (facadeStyle === 'industrial_panel') return { x: 0.08, y: 1 / 32 };
    return { x: 0.09, y: 1 / 44.8 };
  }
  if (facadeType === 'brick') return { x: 0.28, y: 0.45 };
  return { x: 0.12, y: 0.12 };
}

function nearFacadeBatchKey(facadeType, facadeStyle, baseColorHex, mappedMaterial = '') {
  const color = new THREE.Color(baseColorHex || '#999999');
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const hue = Math.min(5, Math.floor(hsl.h * 6));
  const saturation = Math.min(1, Math.floor(hsl.s * 2));
  const lightness = Math.min(3, Math.floor(hsl.l * 4));
  const materialClass = /glass|mirror/.test(mappedMaterial) ? 'glass' :
    /brick|masonry|stone/.test(mappedMaterial) ? 'masonry' :
    /metal|steel/.test(mappedMaterial) ? 'metal' :
    'general';
  return `building-near:${facadeType}:${facadeStyle}:${materialClass}:${hue}:${saturation}:${lightness}`;
}

function tagNearFacadeMaterial(material, facadeType, facadeStyle, baseColorHex, mappedMaterial) {
  if (!material) return material;
  material.userData = {
    ...(material.userData || {}),
    buildingBatchKey: nearFacadeBatchKey(facadeType, facadeStyle, baseColorHex, mappedMaterial),
    facadeStyle
  };
  return material;
}

function cloneFacadeTexture(texture, repeatX, repeatY, seed = 0) {
  if (!texture) return null;
  const clone = texture.clone();
  clone.wrapS = clone.wrapT = THREE.RepeatWrapping;
  clone.repeat.set(repeatX, repeatY);
  const phase = (((Number(seed) || 0) >>> 0) % 997) / 997;
  clone.offset.set(phase * 0.37, (phase * 0.19) % 1);
  clone.needsUpdate = true;
  clone.userData = { ...(clone.userData || {}), ownedFacadeClone: true };
  return clone;
}

function disposeOwnedMaterialTextures(material) {
  if (!material) return;
  ['map', 'normalMap', 'roughnessMap'].forEach((key) => {
    const texture = material[key];
    if (texture?.userData?.ownedFacadeClone && typeof texture.dispose === 'function') {
      texture.dispose();
    }
  });
}

function prefersStructuredUrbanFacade(buildingType, options = {}) {
  const type = String(buildingType || '').toLowerCase();
  const heightMeters = Number.isFinite(options.heightMeters) ? options.heightMeters : 0;
  const footprintArea = Number.isFinite(options.footprintArea) ? options.footprintArea : 0;
  const denseUrban = options.denseUrban === true;

  if (type === 'skyscraper') return true;
  if (type === 'office' || type === 'commercial') {
    return heightMeters >= 28 || (heightMeters >= 20 && footprintArea >= 280) || (denseUrban && heightMeters >= 24);
  }
  if (type === 'hotel') {
    return heightMeters >= 28 || (heightMeters >= 20 && footprintArea >= 260) || (denseUrban && heightMeters >= 24);
  }
  if (type === 'retail') {
    return (heightMeters >= 18 && footprintArea >= 320) || (denseUrban && heightMeters >= 22);
  }
  if (type === 'apartments') {
    return heightMeters >= 38 || (heightMeters >= 28 && footprintArea >= 520);
  }
  if (type === 'yes') {
    return denseUrban && (heightMeters >= 40 || (heightMeters >= 30 && footprintArea >= 560));
  }
  return false;
}

function selectFacadeType(buildingType, options, br2) {
  const type = String(buildingType || '').toLowerCase();
  const mappedMaterial = String(options.facadeMaterial || '').trim().toLowerCase();
  const heightMeters = Number.isFinite(options.heightMeters) ? options.heightMeters : 0;
  const footprintArea = Number.isFinite(options.footprintArea) ? options.footprintArea : 0;
  const denseUrban = options.denseUrban === true;
  const largeUrbanMass = denseUrban || heightMeters >= 22 || footprintArea >= 260;

  let facadeType = 'concrete';
  if (/glass|mirror/.test(mappedMaterial)) {
    facadeType = 'window';
  } else if (/brick|masonry|stone/.test(mappedMaterial)) {
    facadeType = 'brick';
  } else if (/concrete|cement|metal|steel|plaster|stucco|wood/.test(mappedMaterial)) {
    facadeType = 'concrete';
  } else if (type === 'church' || type === 'cathedral') {
    facadeType = 'brick';
  } else if (prefersStructuredUrbanFacade(type, options) || usesOccupiedFacade(type)) {
    facadeType = 'window';
  } else if (type === 'industrial' || type === 'warehouse') {
    facadeType = 'concrete';
  } else if (isGlassForwardBuildingType(type)) {
    facadeType = 'window';
  } else if (br2 < 0.46) {
    facadeType = 'concrete';
  } else if (br2 < 0.88) {
    facadeType = 'brick';
  }

  if (facadeType === 'brick' && largeUrbanMass && type !== 'church' && type !== 'cathedral') {
    facadeType = 'concrete';
  }
  return { facadeType, largeUrbanMass };
}

function selectFacadeStyle(buildingType, facadeType, options, seed) {
  const type = String(buildingType || 'yes').toLowerCase();
  const mappedMaterial = String(options.facadeMaterial || '').trim().toLowerCase();
  const variant = ((Number(seed) || 0) >>> 0) % 3;
  if (facadeType === 'brick') return type === 'church' || type === 'cathedral' ? 'historic_punched' : variant === 0 ? 'townhouse' : 'residential_punched';
  if (facadeType === 'concrete') return /metal|steel/.test(mappedMaterial) || type === 'industrial' || type === 'warehouse' ? 'industrial_panel' : variant === 0 ? 'residential_punched' : 'office_grid';
  if (/glass|mirror/.test(mappedMaterial) || type === 'skyscraper') return 'curtain_wall';
  if (type === 'hotel') return 'hotel_vertical';
  if (type === 'apartments') return variant === 0 ? 'apartment_balcony' : 'residential_punched';
  if (type === 'house' || type === 'detached' || type === 'residential') return variant === 0 ? 'townhouse' : 'residential_punched';
  if (type === 'church' || type === 'cathedral') return 'historic_punched';
  if (type === 'office' || type === 'commercial' || type === 'retail') return variant === 0 ? 'curtain_wall' : variant === 1 ? 'office_grid' : 'hotel_vertical';
  return ['office_grid', 'residential_punched', 'apartment_balcony'][variant];
}

function createMidFacadeMaterial(buildingType, facadeType, facadeStyle, textureRepeat, seed) {
  const style = midFacadeStyle(buildingType, facadeType, facadeStyle, seed);
  const midWindowTexture = facadeType === 'window'
    ? createWindowTexture(`#${new THREE.Color(style.color).getHexString()}`, seed, { style: facadeStyle })
    : null;
  if (midWindowTexture) {
    midWindowTexture.wrapS = midWindowTexture.wrapT = THREE.RepeatWrapping;
    midWindowTexture.repeat.set(textureRepeat.x, textureRepeat.y);
    midWindowTexture.needsUpdate = true;
  }
  const materialOptions = {
    color: midWindowTexture ? 0xffffff : style.color,
    roughness: facadeType === 'window' ? 0.8 : 0.9,
    metalness: facadeType === 'window' ? 0.07 : 0.02
  };
  if (midWindowTexture) materialOptions.map = midWindowTexture;
  const material = new THREE.MeshStandardMaterial(materialOptions);
  material.userData = {
    ...(material.userData || {}),
    buildingBatchKey: `building-mid:${style.key}`
  };
  if (midWindowTexture) {
    applyFacadeWallMask(material, new THREE.Color(style.color).offsetHSL(0, -0.04, -0.12));
  }
  return material;
}

export function getBuildingMaterial(ctx, buildingType, bSeed, baseColorHex, options = {}) {
  const { appCtx, state } = ctx;
  const opts = options && typeof options === 'object' ? options : {};
  const br2 = appCtx.rand01FromInt(bSeed ^ 0x12345);
  const mappedMaterial = String(opts.facadeMaterial || '').trim().toLowerCase();
  const tintColor = new THREE.Color(0xf4f1eb);
  if (baseColorHex) tintColor.lerp(new THREE.Color(baseColorHex), 0.12);
  const tintHex = tintColor.getHex();
  const { facadeType, largeUrbanMass } = selectFacadeType(buildingType, opts, br2);
  const facadeStyle = selectFacadeStyle(buildingType, facadeType, opts, bSeed);
  const textureRepeat = facadeTextureRepeat(facadeType, facadeStyle);

  if (opts.lodTier === 'mid') {
    return createMidFacadeMaterial(buildingType, facadeType, facadeStyle, textureRepeat, bSeed);
  }

  if (facadeType === 'concrete' && state.pbrTexturesLoaded.concrete && state.concreteDiffuse) {
    return tagNearFacadeMaterial(new THREE.MeshStandardMaterial({
      color: tintHex,
      map: cloneFacadeTexture(state.concreteDiffuse, textureRepeat.x, textureRepeat.y, bSeed ^ 0x201),
      normalMap: cloneFacadeTexture(state.concreteNormal, textureRepeat.x, textureRepeat.y, bSeed ^ 0x211),
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: cloneFacadeTexture(state.concreteRoughness, textureRepeat.x, textureRepeat.y, bSeed ^ 0x221),
      roughness: 0.9,
      metalness: 0.02
    }), facadeType, facadeStyle, baseColorHex, mappedMaterial);
  }

  if (facadeType === 'brick' && state.pbrTexturesLoaded.brick && state.brickDiffuse) {
    return tagNearFacadeMaterial(new THREE.MeshStandardMaterial({
      color: tintHex,
      map: cloneFacadeTexture(state.brickDiffuse, textureRepeat.x, textureRepeat.y, bSeed ^ 0x301),
      normalMap: cloneFacadeTexture(state.brickNormal, textureRepeat.x, textureRepeat.y, bSeed ^ 0x311),
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughnessMap: cloneFacadeTexture(state.brickRoughness, textureRepeat.x, textureRepeat.y, bSeed ^ 0x321),
      roughness: 0.88,
      metalness: 0.02
    }), facadeType, facadeStyle, baseColorHex, mappedMaterial);
  }

  const windowTex = cloneFacadeTexture(
    createWindowTexture(baseColorHex, bSeed, { style: facadeStyle }),
    textureRepeat.x,
    textureRepeat.y,
    bSeed
  );
  const material = new THREE.MeshStandardMaterial({
    map: windowTex,
    color: 0xffffff,
    roughness: largeUrbanMass ? 0.8 : 0.85,
    metalness: largeUrbanMass ? 0.08 : 0.05
  });
  if (state.buildingNormalMap) {
    material.normalMap = cloneFacadeTexture(
      state.buildingNormalMap,
      textureRepeat.x,
      textureRepeat.y,
      bSeed ^ 0x4101
    );
    material.normalScale = new THREE.Vector2(largeUrbanMass ? 0.28 : 0.4, largeUrbanMass ? 0.28 : 0.4);
  }
  if (state.buildingRoughnessMap) {
    material.roughnessMap = cloneFacadeTexture(
      state.buildingRoughnessMap,
      textureRepeat.x,
      textureRepeat.y,
      bSeed ^ 0x5101
    );
  }
  applyFacadeWallMask(
    material,
    new THREE.Color(baseColorHex || '#777777').offsetHSL(0, -0.04, -0.12)
  );
  return tagNearFacadeMaterial(material, facadeType, facadeStyle, baseColorHex, mappedMaterial);
}

export function refreshBuildingFacadeMaterials(ctx) {
  const { appCtx } = ctx;
  if (!Array.isArray(appCtx.buildingMeshes) || appCtx.buildingMeshes.length === 0) return 0;

  let refreshed = 0;
  for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
    const mesh = appCtx.buildingMeshes[i];
    const data = mesh?.userData || null;
    if (!mesh || !mesh.material || !data || data.isRoofDetail === true) continue;
    if (!Number.isFinite(data.buildingSeed) || !data.baseColorHex) continue;

    const nextMaterial = getBuildingMaterial(
      ctx,
      data.buildingType || 'yes',
      data.buildingSeed,
      data.baseColorHex,
      {
        lodTier: data.lodTier === 'mid' ? 'mid' : 'near',
        heightMeters: Number.isFinite(data.heightMeters) ? data.heightMeters : Number(data.buildingSemantics?.heightMeters || 0),
        footprintWidth: Number.isFinite(data.footprintWidth) ? data.footprintWidth : 0,
        footprintDepth: Number.isFinite(data.footprintDepth) ? data.footprintDepth : 0,
        footprintArea: Number.isFinite(data.footprintArea) ? data.footprintArea : polygonAreaXZ(data.buildingFootprint),
        denseUrban: data.denseUrban === true,
        facadeMaterial: data.facadeMaterial || '',
        structureSemantics: data.structureSemantics || null,
        buildingSemantics: data.buildingSemantics || null
      }
    );
    if (!nextMaterial || nextMaterial === mesh.material) continue;

    const oldMaterial = mesh.material;
    mesh.material = nextMaterial;
    mesh.material.needsUpdate = true;
    disposeOwnedMaterialTextures(oldMaterial);
    if (typeof oldMaterial.dispose === 'function') oldMaterial.dispose();
    refreshed += 1;
  }
  return refreshed;
}
