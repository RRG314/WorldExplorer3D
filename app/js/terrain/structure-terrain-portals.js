const MAX_PORTAL_MASKS_PER_TERRAIN_MESH = 32;

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
    .slice(0, Math.max(1, Math.floor(Number(limit) || MAX_PORTAL_MASKS_PER_TERRAIN_MESH)));
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
  const maskA = masks.map((mask) => new THREE.Vector4(
    Number(mask.x),
    Number(mask.z),
    Number(mask.tangentX),
    Number(mask.tangentZ)
  ));
  const maskB = masks.map((mask) => new THREE.Vector4(
    Number(mask.roadY),
    Number(mask.grade) || 0,
    Number(mask.halfWidth),
    Number(mask.halfDepth)
  ));
  material.userData.structurePortalMaskCount = masks.length;
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile?.(shader, renderer);
    shader.uniforms.structurePortalMaskA = { value: maskA };
    shader.uniforms.structurePortalMaskB = { value: maskB };
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
      `uniform vec4 structurePortalMaskA[${masks.length}];`,
      `uniform vec4 structurePortalMaskB[${masks.length}];`
    ].join('\n');
    const fragmentCut = [
      '#include <clipping_planes_fragment>',
      `for (int structurePortalIndex = 0; structurePortalIndex < ${masks.length}; structurePortalIndex++) {`,
      '  vec4 portalA = structurePortalMaskA[structurePortalIndex];',
      '  vec4 portalB = structurePortalMaskB[structurePortalIndex];',
      '  vec2 portalDelta = vStructurePortalWorldPosition.xz - portalA.xy;',
      '  float portalAlong = dot(portalDelta, portalA.zw);',
      '  float portalAcross = dot(portalDelta, vec2(-portalA.w, portalA.z));',
      '  float portalRoadY = portalB.x + portalAlong * portalB.y;',
      '  if (abs(portalAcross) <= portalB.z && abs(portalAlong) <= portalB.w && vStructurePortalWorldPosition.y > portalRoadY + 0.12) discard;',
      '}'
    ].join('\n');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', fragmentPrelude)
      .replace('#include <clipping_planes_fragment>', fragmentCut);
  };
  material.customProgramCacheKey = () => [
    previousProgramCacheKey?.() || '',
    `structure-terrain-portals-v1:${masks.length}`
  ].join(':');
  material.needsUpdate = true;
  return true;
}

export function applyTerrainPortalMasksForContext(appCtx, masks = []) {
  const terrainMeshes = (appCtx?.terrainGroup?.children || []).filter(
    (mesh) => mesh?.userData?.isTerrainMesh === true && mesh?.material && !Array.isArray(mesh.material)
  );
  let maskedMeshes = 0;
  let publishedMasks = 0;
  for (const mesh of terrainMeshes) {
    const selected = selectPortalMasksForBounds(terrainMeshBounds(mesh), masks);
    if (selected.length === 0) continue;
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
