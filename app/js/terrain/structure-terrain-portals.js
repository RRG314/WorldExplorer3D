// Texture-backed descriptors avoid the former silent 32-opening truncation.
const MAX_PORTAL_MASKS_PER_TERRAIN_MESH = Infinity;
// The aperture must remove terrain at the pavement too. Leaving twelve
// centimetres above it produces grass bands across shallow graded approaches.
// Keep the same bounded volume for rendering, raycasts and support queries.
const PORTAL_FLOOR_MARGIN = -0.02;

export function portalFloorAt(mask, x, z) {
  const dx = x - mask.x;
  const dz = z - mask.z;
  const along = dx * mask.tangentX + dz * mask.tangentZ;
  const across = -dx * mask.tangentZ + dz * mask.tangentX;
  if (Math.abs(across) > mask.halfWidth || Math.abs(along) > mask.halfDepth) return NaN;
  return mask.roadY + along * (mask.grade || 0);
}

export function terrainPointRemovedByPortal(mask, point) {
  const floor = portalFloorAt(mask, point.x, point.z);
  return Number.isFinite(floor) && point.y > floor + PORTAL_FLOOR_MARGIN &&
    point.y < floor + (Number(mask.cutHeight) || 6);
}

export function terrainHeightWithPortalCuts(masks, x, z, terrainY) {
  let height = terrainY;
  for (const mask of masks || []) {
    if (terrainPointRemovedByPortal(mask, { x, y: terrainY, z })) {
      height = Math.min(height, portalFloorAt(mask, x, z));
    }
  }
  return height;
}

function maskRadius(mask) {
  return Math.hypot(Number(mask?.halfWidth) || 0, Number(mask?.halfDepth) || 0) + 2;
}

export function selectPortalMasksForBounds(bounds, masks = [], limit = MAX_PORTAL_MASKS_PER_TERRAIN_MESH) {
  if (!bounds) return [];
  const centerX = (Number(bounds.minX) + Number(bounds.maxX)) * 0.5;
  const centerZ = (Number(bounds.minZ) + Number(bounds.maxZ)) * 0.5;
  return masks
    .filter((mask) => {
      const radius = maskRadius(mask);
      return Number(mask?.x) + radius >= Number(bounds.minX) &&
        Number(mask?.x) - radius <= Number(bounds.maxX) &&
        Number(mask?.z) + radius >= Number(bounds.minZ) &&
        Number(mask?.z) - radius <= Number(bounds.maxZ);
    })
    .sort((left, right) =>
      Math.hypot(Number(left.x) - centerX, Number(left.z) - centerZ) -
      Math.hypot(Number(right.x) - centerX, Number(right.z) - centerZ)
    )
    .slice(0, Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : undefined);
}

function terrainMeshBounds(mesh) {
  const geometry = mesh?.geometry;
  if (!geometry) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox?.();
  const box = geometry.boundingBox;
  if (!box) return null;
  return {
    minX: Number(box.min.x) + Number(mesh.position?.x || 0),
    maxX: Number(box.max.x) + Number(mesh.position?.x || 0),
    minZ: Number(box.min.z) + Number(mesh.position?.z || 0),
    maxZ: Number(box.max.z) + Number(mesh.position?.z || 0)
  };
}

function installPortalMaskShader(material, masks) {
  if (!material || !Array.isArray(masks) || typeof THREE === 'undefined') return false;
  material.userData = material.userData || {};
  let state = material.userData.structurePortalShaderState;
  if (!state && masks.length === 0) return false;
  if (!state) {
    const previousOnBeforeCompile = material.onBeforeCompile;
    const previousProgramCacheKey = material.customProgramCacheKey?.bind(material);
    state = { count: 0, uniform: { value: null } };
    material.userData.structurePortalShaderState = state;
    // Install once: pavement and other later hooks must survive portal refreshes.
    // Keep the uniform object stable because Three reuses programs without
    // calling onBeforeCompile again when the mask count is unchanged.
    material.onBeforeCompile = (shader, renderer) => {
      previousOnBeforeCompile?.call(material, shader, renderer);
      shader.uniforms.structurePortalMasks = state.uniform;
      if (state.count === 0) return;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vStructurePortalWorldPosition;'
        )
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvStructurePortalWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        );
      const fragmentPrelude = [
        '#include <common>',
        'varying vec3 vStructurePortalWorldPosition;',
        'uniform sampler2D structurePortalMasks;'
      ].join('\n');
      const fragmentCut = [
        '#include <clipping_planes_fragment>',
        `for (int structurePortalIndex = 0; structurePortalIndex < ${state.count}; structurePortalIndex++) {`,
        `  float portalRow = (float(structurePortalIndex) + 0.5) / ${state.count}.0;`,
        '  vec4 portalA = texture2D(structurePortalMasks, vec2(0.16666667, portalRow));',
        '  vec4 portalB = texture2D(structurePortalMasks, vec2(0.5, portalRow));',
        '  float cutHeight = texture2D(structurePortalMasks, vec2(0.83333333, portalRow)).x;',
        '  vec2 portalDelta = vStructurePortalWorldPosition.xz - portalA.xy;',
        '  float portalAlong = dot(portalDelta, portalA.zw);',
        '  float portalAcross = dot(portalDelta, vec2(-portalA.w, portalA.z));',
        '  float portalRoadY = portalB.x + portalAlong * portalB.y;',
        `  if (abs(portalAcross) <= portalB.z && abs(portalAlong) <= portalB.w && vStructurePortalWorldPosition.y > portalRoadY + ${PORTAL_FLOOR_MARGIN} && vStructurePortalWorldPosition.y < portalRoadY + cutHeight) discard;`,
        '}'
      ].join('\n');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', fragmentPrelude)
        .replace('#include <clipping_planes_fragment>', fragmentCut);
    };
    material.customProgramCacheKey = () => [
      previousProgramCacheKey?.() || '',
      `structure-terrain-portals-v4:${state.count}`
    ].join(':');
    material.addEventListener('dispose', () => {
      state.uniform.value?.dispose();
      state.uniform.value = null;
      material.userData.structurePortalTexture = null;
    });
  }
  const previousCount = state.count;
  let texture = state.uniform.value;
  if (masks.length === 0) {
    texture?.dispose();
    texture = null;
  } else {
    if (!texture || texture.image.height !== masks.length) {
      texture?.dispose();
      texture = new THREE.DataTexture(new Float32Array(masks.length * 12), 3,
        masks.length, THREE.RGBAFormat, THREE.FloatType);
    }
    masks.forEach((mask, index) => texture.image.data.set([
      mask.x, mask.z, mask.tangentX, mask.tangentZ,
      mask.roadY, mask.grade || 0, mask.halfWidth, mask.halfDepth,
      Number(mask.cutHeight) || 6, 0, 0, 0
    ], index * 12));
    texture.needsUpdate = true;
  }
  state.count = masks.length;
  state.uniform.value = texture;
  material.userData.structurePortalTexture = texture;
  material.userData.structurePortalMaskCount = masks.length;
  if (previousCount !== state.count) material.needsUpdate = true;
  return masks.length > 0;
}

export function applyTerrainPortalMasksForContext(appCtx, masks = []) {
  appCtx.structureTerrainPortalDescriptors = masks;
  const terrainMeshes = (appCtx?.terrainGroup?.children || []).filter(
    (mesh) => (mesh?.userData?.isTerrainMesh === true || mesh?.userData?.isFarTerrainClipmap === true) &&
      mesh?.material && !Array.isArray(mesh.material)
  );
  let maskedMeshes = 0;
  let publishedMasks = 0;
  for (const mesh of terrainMeshes) {
    const selected = selectPortalMasksForBounds(terrainMeshBounds(mesh), masks);
    mesh.userData.structureTerrainPortalDescriptors = selected;
    if (!mesh.userData.structurePortalOriginalRaycast) {
      mesh.userData.structurePortalOriginalRaycast = mesh.raycast;
      mesh.raycast = function (raycaster, intersects) {
        const hits = [];
        this.userData.structurePortalOriginalRaycast.call(this, raycaster, hits);
        intersects.push(...hits.filter((hit) => !(this.userData.structureTerrainPortalDescriptors || [])
          .some((mask) => terrainPointRemovedByPortal(mask, hit.point))));
      };
    }
    if (selected.length === 0) {
      installPortalMaskShader(mesh.material, []);
      mesh.userData.structureTerrainPortalMasks = 0;
      continue;
    }
    if (installPortalMaskShader(mesh.material, selected)) {
      mesh.userData.structureTerrainPortalMasks = selected.length;
      maskedMeshes += 1;
      publishedMasks += selected.length;
    }
  }
  appCtx.structureTerrainPortalMaskStats = Object.freeze({
    authority: 'compiled-tunnel-portal-fragment-mask',
    sourceMasks: Array.isArray(masks) ? masks.length : 0,
    publishedMasks,
    maskedMeshes
  });
  return appCtx.structureTerrainPortalMaskStats;
}

export { MAX_PORTAL_MASKS_PER_TERRAIN_MESH };
