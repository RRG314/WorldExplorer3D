// Texture-backed descriptors avoid the former silent 32-opening truncation.
const MAX_PORTAL_MASKS_PER_TERRAIN_MESH = Infinity;

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
  return Number.isFinite(floor) && point.y > floor + 0.12 &&
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
  if (!material || !Array.isArray(masks) || masks.length === 0 || typeof THREE === 'undefined') {
    return false;
  }
  material.userData = material.userData || {};
  if (!material.userData.structurePortalOriginalHooks) {
    material.userData.structurePortalOriginalHooks = {
      onBeforeCompile: material.onBeforeCompile,
      programCacheKey: material.customProgramCacheKey?.bind(material)
    };
  }
  const previousOnBeforeCompile = material.userData.structurePortalOriginalHooks.onBeforeCompile;
  const previousProgramCacheKey = material.userData.structurePortalOriginalHooks.programCacheKey;
  material.userData.structurePortalTexture?.dispose();
  const data = new Float32Array(masks.length * 12);
  masks.forEach((mask, index) => data.set([
    mask.x, mask.z, mask.tangentX, mask.tangentZ,
    mask.roadY, mask.grade || 0, mask.halfWidth, mask.halfDepth,
    Number(mask.cutHeight) || 6, 0, 0, 0
  ], index * 12));
  const texture = new THREE.DataTexture(data, 3, masks.length, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  material.userData.structurePortalTexture = texture;
  if (!material.userData.structurePortalDisposeBound) {
    material.addEventListener('dispose', () => material.userData.structurePortalTexture?.dispose());
    material.userData.structurePortalDisposeBound = true;
  }
  material.userData.structurePortalMaskCount = masks.length;
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile?.(shader, renderer);
    shader.uniforms.structurePortalMasks = { value: texture };
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
      `for (int structurePortalIndex = 0; structurePortalIndex < ${masks.length}; structurePortalIndex++) {`,
      `  float portalRow = (float(structurePortalIndex) + 0.5) / ${masks.length}.0;`,
      '  vec4 portalA = texture2D(structurePortalMasks, vec2(0.16666667, portalRow));',
      '  vec4 portalB = texture2D(structurePortalMasks, vec2(0.5, portalRow));',
      '  float cutHeight = texture2D(structurePortalMasks, vec2(0.83333333, portalRow)).x;',
      '  vec2 portalDelta = vStructurePortalWorldPosition.xz - portalA.xy;',
      '  float portalAlong = dot(portalDelta, portalA.zw);',
      '  float portalAcross = dot(portalDelta, vec2(-portalA.w, portalA.z));',
      '  float portalRoadY = portalB.x + portalAlong * portalB.y;',
      '  if (abs(portalAcross) <= portalB.z && abs(portalAlong) <= portalB.w && vStructurePortalWorldPosition.y > portalRoadY + 0.12 && vStructurePortalWorldPosition.y < portalRoadY + cutHeight) discard;',
      '}'
    ].join('\n');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', fragmentPrelude)
      .replace('#include <clipping_planes_fragment>', fragmentCut);
  };
  material.customProgramCacheKey = () => [
    previousProgramCacheKey?.() || '',
    `structure-terrain-portals-v2:${masks.length}`
  ].join(':');
  material.needsUpdate = true;
  return true;
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
      const hooks = mesh.material.userData?.structurePortalOriginalHooks;
      if (hooks) {
        mesh.material.onBeforeCompile = hooks.onBeforeCompile;
        mesh.material.customProgramCacheKey = hooks.programCacheKey;
        mesh.material.userData.structurePortalTexture?.dispose();
        mesh.material.userData.structurePortalTexture = null;
        mesh.material.userData.structurePortalMaskCount = 0;
        mesh.material.needsUpdate = true;
      }
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
