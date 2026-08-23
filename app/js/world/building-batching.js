import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  boundingSphereCenter,
  buildMergedGeometry,
  disposeSceneMesh,
  materialBatchKey,
  appendGeometryWithTransform
} from "./geometry-batching.js?v=6";
import { yieldToMainThread as defaultYieldToMainThread } from './cooperative-scheduling.js?v=1';

const NEAR_BUILDING_BATCH_CELL_METERS = 360;
const MID_BUILDING_BATCH_CELL_METERS = 960;

function midFacadeBatchKey(material) {
  if (material?.userData?.buildingExterior !== true) return null;
  const atlas = String(material.userData.facadeAssetUrl || material.userData.facadeAtlasStyle || 'neutral');
  const roughness = Number(material.roughness || 0).toFixed(3);
  const metalness = Number(material.metalness || 0).toFixed(3);
  return `building-mid-facade:${atlas}:${roughness}:${metalness}`;
}

function appendMidFacadeAttributes(batch, material, vertexStart, vertexCount) {
  const wallColor = material?.color instanceof THREE.Color
    ? material.color
    : new THREE.Color(0x8d9292);
  const roofColorA = new THREE.Color(material?.userData?.roofSurfaceColorA ?? wallColor.getHex());
  const roofColorB = new THREE.Color(material?.userData?.roofSurfaceColorB ?? wallColor.getHex());
  const roofGrainScale = Number(material?.userData?.roofSurfaceGrainScale || 0.6);
  const repeatX = Number(material?.map?.repeat?.x || 0.08);
  const repeatY = Number(material?.map?.repeat?.y || (1 / 16));
  const offsetX = Number(material?.map?.offset?.x || 0);
  const offsetY = Number(material?.map?.offset?.y || 0);
  for (let vertexIndex = vertexStart; vertexIndex < vertexStart + vertexCount; vertexIndex += 1) {
    const normalY = Number(batch.normals[vertexIndex * 3 + 1] || 0);
    const wallMask = Math.max(0, Math.min(1, (1 - Math.abs(normalY) - 0.18) / 0.54));
    batch.colors.push(wallColor.r, wallColor.g, wallColor.b);
    batch.facadeParams.push(repeatX, repeatY, offsetX, offsetY);
    batch.roofAParams.push(roofColorA.r, roofColorA.g, roofColorA.b, roofGrainScale);
    batch.roofColorsB.push(roofColorB.r, roofColorB.g, roofColorB.b, wallMask);
  }
}

function createMidFacadeBatchMaterial(sourceMaterial, batchKey) {
  const material = sourceMaterial.clone();
  material.color.setHex(0xffffff);
  material.vertexColors = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = [
      'attribute vec4 buildingFacadeParams;',
      'attribute vec4 buildingRoofAParams;',
      'attribute vec4 buildingRoofColorB;',
      'varying vec4 vBuildingFacadeParams;',
      'varying vec4 vBuildingRoofAParams;',
      'varying vec4 vBuildingRoofColorB;',
      'varying float vBuildingWallMask;',
      'varying vec2 vBuildingRoofPosition;',
      'varying vec2 vBuildingFacadeWorldPosition;',
      shader.vertexShader
    ].join('\n');
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      [
        '#include <beginnormal_vertex>',
        'vBuildingFacadeParams = buildingFacadeParams;',
        'vBuildingRoofAParams = buildingRoofAParams;',
        'vBuildingRoofColorB = buildingRoofColorB;',
        'vBuildingWallMask = smoothstep(0.18, 0.72, 1.0 - abs(objectNormal.y));',
        'vBuildingRoofPosition = position.xz;',
        'float buildingFacadeHorizontal = abs(objectNormal.x) > abs(objectNormal.z) ? position.z : position.x;',
        'vBuildingFacadeWorldPosition = vec2(buildingFacadeHorizontal, position.y);'
      ].join('\n')
    );
    shader.fragmentShader = [
      'varying vec4 vBuildingFacadeParams;',
      'varying vec4 vBuildingRoofAParams;',
      'varying vec4 vBuildingRoofColorB;',
      'varying float vBuildingWallMask;',
      'varying vec2 vBuildingRoofPosition;',
      'varying vec2 vBuildingFacadeWorldPosition;',
      'float buildingMidRoofHash(vec2 p) {',
      '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
      '}',
      'float buildingMidRoofNoise(vec2 p) {',
      '  vec2 cell = floor(p);',
      '  vec2 fraction = fract(p);',
      '  vec2 blend = fraction * fraction * (3.0 - 2.0 * fraction);',
      '  float a = buildingMidRoofHash(cell);',
      '  float b = buildingMidRoofHash(cell + vec2(1.0, 0.0));',
      '  float c = buildingMidRoofHash(cell + vec2(0.0, 1.0));',
      '  float d = buildingMidRoofHash(cell + vec2(1.0, 1.0));',
      '  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);',
      '}',
      shader.fragmentShader
    ].join('\n');
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      [
        '#ifdef USE_MAP',
        '  vec2 buildingFacadeUv = vBuildingFacadeWorldPosition * vBuildingFacadeParams.xy + vBuildingFacadeParams.zw;',
        '  vec4 buildingFacadeTexel = mapTexelToLinear(texture2D(map, buildingFacadeUv));',
        '  float buildingRoofGrain = buildingMidRoofNoise(vBuildingRoofPosition * vBuildingRoofAParams.w);',
        '  vec3 buildingRoofSurface = mix(vBuildingRoofAParams.rgb, vBuildingRoofColorB.rgb, 0.18 + buildingRoofGrain * 0.64);',
        '  diffuseColor.rgb = mix(buildingRoofSurface, diffuseColor.rgb * buildingFacadeTexel.rgb, vBuildingWallMask);',
        '  diffuseColor.a *= mix(1.0, buildingFacadeTexel.a, vBuildingWallMask);',
        '#endif'
      ].join('\n')
    );
  };
  material.customProgramCacheKey = () => 'building-mid-facade-batch-v3-production-shader-parity';
  material.userData = {
    ...(material.userData || {}),
    buildingMidFacadeBatch: true,
    buildingBatchKey: batchKey
  };
  return material;
}

function buildingMeshCenter(mesh) {
  const footprint = mesh?.userData?.buildingFootprint;
  if (Array.isArray(footprint) && footprint.length > 0) {
    let x = 0;
    let z = 0;
    for (let i = 0; i < footprint.length; i++) {
      x += footprint[i].x;
      z += footprint[i].z;
    }
    return { x: x / footprint.length, z: z / footprint.length };
  }
  return boundingSphereCenter(mesh, Number(mesh?.position?.x || 0), Number(mesh?.position?.z || 0));
}

function visualTopOffsetMeters(mesh, provenance) {
  const groundBaseY = Number(provenance?.foundation?.groundBaseY);
  if (!Number.isFinite(groundBaseY) || !mesh?.geometry) return null;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  if (!mesh.geometry.boundingBox) return null;
  const worldBounds = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
  // Downhill foundation skirts extend the body below the accepted high-side
  // ground plane. They are visible/collidable support, not mapped building
  // height, so remove that exact published rise from the structure-top check.
  const foundationRise = Math.max(0, Number(mesh.userData?.terrainFoundationRise) || 0);
  const topOffset = worldBounds.max.y - groundBaseY - foundationRise;
  return Number.isFinite(topOffset) ? topOffset : null;
}

export async function batchMidLodBuildingMeshes(options = {}) {
  return batchBuildingMeshesByTier(['mid'], options);
}

async function batchBuildingMeshesByTier(tiers = ['near'], options = {}) {
  try {
    if (!Array.isArray(appCtx.buildingMeshes) || appCtx.buildingMeshes.length < 2) return 0;
    const tierSet = new Set(Array.isArray(tiers) ? tiers : ['near']);

    const keep = [];
    const groups = new Map();
    const yieldEveryGroups = Math.max(1, Math.floor(Number(options.yieldEveryGroups) || 4));
    const yieldEveryMeshes = Math.max(1, Math.floor(Number(options.yieldEveryMeshes) || 32));
    const yieldToMainThread = typeof options.yieldToMainThread === 'function'
      ? options.yieldToMainThread
      : defaultYieldToMainThread;

    for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
      const mesh = appCtx.buildingMeshes[i];
      try {
      if (!mesh) continue;
      if (mesh.userData?.isMappedVessel) {
        keep.push(mesh);
        continue;
      }
      const tier = mesh.userData?.lodTier || 'near';
      if (!tierSet.has(tier) || mesh.userData?.isBuildingBatch) {
        keep.push(mesh);
        continue;
      }
      if (!mesh.geometry || !mesh.material || Array.isArray(mesh.material)) {
        keep.push(mesh);
        continue;
      }

      const midFacadeKey = tier === 'mid' ? midFacadeBatchKey(mesh.material) : null;
      const matKey = midFacadeKey || materialBatchKey(mesh.material);
      if (!matKey) {
        keep.push(mesh);
        continue;
      }
      const center = buildingMeshCenter(mesh);
      // Near geometry keeps smaller cells for precise view culling. Mid-LOD
      // geometry is already a skyline representation, so larger cells remove
      // thousands of material/cell draw-call fragments in dense cities.
      const cellSize = tier === 'mid'
        ? MID_BUILDING_BATCH_CELL_METERS
        : NEAR_BUILDING_BATCH_CELL_METERS;
      const cellX = Math.floor(center.x / cellSize);
      const cellZ = Math.floor(center.z / cellSize);
      const key = `${tier}|${cellX},${cellZ}|${matKey}`;
      if (!groups.has(key)) {
        groups.set(key, {
          meshes: [],
          material: mesh.material,
          renderOrder: mesh.renderOrder || 0,
          lodTier: tier,
          midFacadeBatch: !!midFacadeKey,
          batchKey: matKey
        });
      }
      groups.get(key).meshes.push(mesh);
      } finally {
        if ((i + 1) % yieldEveryMeshes === 0 && i + 1 < appCtx.buildingMeshes.length) {
          await yieldToMainThread();
        }
      }
    }

    if (groups.size === 0) return 0;

    const batchedMeshes = [];
    let sourceMeshCount = 0;

    const groupEntries = [...groups.values()];
    for (let groupIndex = 0; groupIndex < groupEntries.length; groupIndex += 1) {
      const group = groupEntries[groupIndex];
      try {
      if (!group || !Array.isArray(group.meshes) || group.meshes.length < 2) {
        if (group?.meshes?.length === 1) keep.push(group.meshes[0]);
        continue;
      }

      const batch = { positions: [], normals: [], uvs: [], indices: [] };
      if (group.lodTier === 'near') batch.facadeEntrances = [];
      if (group.midFacadeBatch) {
        batch.colors = [];
        batch.facadeParams = [];
        batch.roofAParams = [];
        batch.roofColorsB = [];
      }
      const sourceMeshes = [];
      const xzPoints = [];
      const provenanceByFeatureId = new Map();
      const visualTopOffsetByFeatureId = new Map();
      const editableIndexRanges = [];

      for (let i = 0; i < group.meshes.length; i++) {
        const mesh = group.meshes[i];
        try {
        mesh.updateMatrixWorld(true);
        const vertexStart = batch.positions.length / 3;
        const indexStart = batch.indices.length;
        const appendCount = appendGeometryWithTransform(batch, mesh.geometry, mesh.matrixWorld);
        if (appendCount <= 0) {
          keep.push(mesh);
          continue;
        }
        if (group.midFacadeBatch) {
          appendMidFacadeAttributes(batch, mesh.material, vertexStart, appendCount);
        }
        sourceMeshes.push(mesh);
        const provenance = mesh.userData?.buildingProvenance;
        const featureId = provenance?.identity?.featureId;
        if (featureId) {
          provenanceByFeatureId.set(featureId, provenance);
          const topOffset = visualTopOffsetMeters(mesh, provenance);
          if (Number.isFinite(topOffset)) {
            visualTopOffsetByFeatureId.set(
              featureId,
              Math.max(topOffset, Number(visualTopOffsetByFeatureId.get(featureId)) || -Infinity)
            );
          }
        }
        const sourceBuildingId = String(mesh.userData?.sourceBuildingId || featureId || '');
        const indexCount = batch.indices.length - indexStart;
        if (sourceBuildingId && indexCount > 0) {
          editableIndexRanges.push(Object.freeze({
            sourceBuildingId,
            start: indexStart,
            count: indexCount
          }));
        }

        xzPoints.push(buildingMeshCenter(mesh));
        } finally {
          if ((i + 1) % yieldEveryMeshes === 0 && i + 1 < group.meshes.length) {
            await yieldToMainThread();
          }
        }
      }

      if (sourceMeshes.length < 2) {
        keep.push(...sourceMeshes);
        continue;
      }

      const geometry = buildMergedGeometry(batch);
      if (!geometry) {
        keep.push(...sourceMeshes);
        continue;
      }

      const material = group.midFacadeBatch
        ? createMidFacadeBatchMaterial(group.material, group.batchKey)
        : group.material.clone();
      // THREE.Material.clone() does not preserve custom shader callbacks.
      // Building batches must keep the single facade owner's wall mask so the
      // shared atlas never spills across horizontal roof caps.
      if (!group.midFacadeBatch) {
        material.onBeforeCompile = group.material.onBeforeCompile;
        material.customProgramCacheKey = group.material.customProgramCacheKey;
      }
      material.userData = {
        ...(material.userData || {}),
        sharedRuntimeMaterial: false,
        buildingBatchMaterial: true
      };
      const mergedMesh = new THREE.Mesh(geometry, material);
      mergedMesh.renderOrder = group.renderOrder;
      // The shadow camera only covers the near field. Rendering every distant
      // skyline batch into that pass doubles dense-city draw pressure and
      // creates the broad, unstable building shadow bands seen from aircraft.
      mergedMesh.castShadow = group.lodTier !== 'mid';
      mergedMesh.receiveShadow = true;
      mergedMesh.frustumCulled = true;

      let centerX = 0;
      let centerZ = 0;
      for (let i = 0; i < xzPoints.length; i++) {
        centerX += xzPoints[i].x;
        centerZ += xzPoints[i].z;
      }
      centerX /= xzPoints.length;
      centerZ /= xzPoints.length;

      let maxRadius = 0;
      for (let i = 0; i < xzPoints.length; i++) {
        maxRadius = Math.max(maxRadius, Math.hypot(xzPoints[i].x - centerX, xzPoints[i].z - centerZ));
      }

      mergedMesh.userData = {
        lodTier: group.lodTier || 'near',
        isBuildingBatch: true,
        isNearBuildingBatch: true,
        batchCount: sourceMeshes.length,
        buildingProvenanceRecords: Object.freeze([...provenanceByFeatureId.values()]),
        buildingVisualTopOffsetsByFeatureId: Object.freeze(Object.fromEntries(visualTopOffsetByFeatureId)),
        editableBuildingIndexRanges: Object.freeze(editableIndexRanges),
        lodCenter: { x: centerX, z: centerZ },
        lodRadius: maxRadius
      };

      appCtx.addEarthWorldObject(mergedMesh);
      batchedMeshes.push(mergedMesh);
      for (let i = 0; i < sourceMeshes.length; i++) disposeSceneMesh(sourceMeshes[i]);
      sourceMeshCount += sourceMeshes.length;
      } finally {
        if ((groupIndex + 1) % yieldEveryGroups === 0 && groupIndex + 1 < groupEntries.length) {
          await yieldToMainThread();
        }
      }
    }

    if (!batchedMeshes.length) {
      appCtx._lastBuildingBatchStats = { groupCount: groups.size, batchMeshCount: 0, sourceMeshCount: 0 };
      return 0;
    }
    appCtx.replaceWorldCollection('buildingMeshes', [...keep, ...batchedMeshes]);
    appCtx._lastBuildingBatchStats = {
      groupCount: groups.size,
      batchMeshCount: batchedMeshes.length,
      sourceMeshCount
    };
    return sourceMeshCount;
  } catch (err) {
    console.warn('[WorldLoad] batchNearLodBuildingMeshes failed:', err);
    appCtx._lastBuildingBatchStats = {
      groupCount: 0,
      batchMeshCount: 0,
      sourceMeshCount: 0,
      error: err?.message || String(err)
    };
    return 0;
  }
}

export async function batchNearLodBuildingMeshes(options = {}) {
  return batchBuildingMeshesByTier(['near'], options);
}
