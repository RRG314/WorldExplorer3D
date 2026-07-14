import {
  createAsphaltNormal,
  createAsphaltTexture,
  createBrickFacadeTexture,
  createBrickNormalMap,
  createBrickRoughnessMap,
  createBuildingNormalMap,
  createBuildingRoughnessMap,
  createConcreteFacadeTexture,
  createConcreteNormalMap,
  createConcreteRoughnessMap,
  createPavementNormalMap,
  createPavementRoughnessMap,
  createPavementTexture,
  createProceduralGrassNormal,
  createProceduralGrassRoughness,
  createProceduralGrassTexture,
  createRoughnessMap,
  getWindowTextureCache
} from "./procedural-textures.js?v=1";
import {
  getBuildingMaterial,
  refreshBuildingFacadeMaterials
} from "./building-facade-materials.js?v=4";

const USE_REMOTE_PBR_TEXTURES = false;

export function syncTextureGlobals(ctx) {
  const { appCtx, state } = ctx;
  appCtx.asphaltTex = state.asphaltTex;
  appCtx.asphaltNormal = state.asphaltNormal;
  appCtx.asphaltRoughness = state.asphaltRoughness;
  appCtx.grassDiffuse = state.grassDiffuse;
  appCtx.grassNormal = state.grassNormal;
  appCtx.grassRoughness = state.grassRoughness;
  appCtx.pavementDiffuse = state.pavementDiffuse;
  appCtx.pavementNormal = state.pavementNormal;
  appCtx.pavementRoughness = state.pavementRoughness;
  appCtx.concreteDiffuse = state.concreteDiffuse;
  appCtx.concreteNormal = state.concreteNormal;
  appCtx.concreteRoughness = state.concreteRoughness;
  appCtx.brickDiffuse = state.brickDiffuse;
  appCtx.brickNormal = state.brickNormal;
  appCtx.brickRoughness = state.brickRoughness;
  appCtx.buildingNormalMap = state.buildingNormalMap;
  appCtx.buildingRoughnessMap = state.buildingRoughnessMap;
  appCtx.windowTextures = getWindowTextureCache();
}

function createGroundPatchMaterial(state, type) {
  if (type === 'apron' && state.pbrTexturesLoaded.pavement && state.pavementDiffuse) {
    return new THREE.MeshStandardMaterial({
      map: state.pavementDiffuse,
      normalMap: state.pavementNormal || undefined,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: state.pavementRoughness || undefined,
      roughness: 0.9,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  }

  if (type === 'skirt' && state.pbrTexturesLoaded.pavement && state.pavementDiffuse) {
    return new THREE.MeshStandardMaterial({
      map: state.pavementDiffuse,
      normalMap: state.pavementNormal || undefined,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughnessMap: state.pavementRoughness || undefined,
      roughness: 0.94,
      metalness: 0.0,
      side: THREE.DoubleSide
    });
  }

  if (type === 'apron') {
    return new THREE.MeshStandardMaterial({
      color: 0xa8a29e,
      roughness: 0.9,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  }

  return new THREE.MeshStandardMaterial({
    color: 0x968f88,
    roughness: 0.94,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
}

export function createBuildingGroundPatch(ctx, pts, avgElevation, options = {}) {
  const { appCtx, state } = ctx;
  if (!pts || pts.length < 3) return null;
  const footprint = pts.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  if (footprint.length < 3) return null;
  const opts = options && typeof options === 'object' ? options : {};
  const allowApron = opts.allowApron === true;

  const baseElevation = Number.isFinite(avgElevation) ? avgElevation : 0;
  const sampleTerrainY = (x, z) => {
    const terrainY = typeof appCtx.terrainMeshHeightAt === 'function'
      ? appCtx.terrainMeshHeightAt(x, z)
      : appCtx.elevationWorldYAtWorldXZ(x, z);
    const safeTerrainY = Number.isFinite(terrainY) ? terrainY : baseElevation;
    return safeTerrainY === 0 && Math.abs(baseElevation) > 2 ? baseElevation : safeTerrainY;
  };

  const resultMeshes = [];
  const cx = footprint.reduce((sum, point) => sum + point.x, 0) / footprint.length;
  const cz = footprint.reduce((sum, point) => sum + point.z, 0) / footprint.length;
  const maxRadius = footprint.reduce((best, point) => {
    return Math.max(best, Math.hypot(point.x - cx, point.z - cz));
  }, 0);
  const footprintArea = Number.isFinite(opts.footprintArea) ? opts.footprintArea : polygonAreaXZ(footprint);
  const heightMeters = Number.isFinite(opts.heightMeters) ? opts.heightMeters : 0;
  const denseUrban = opts.denseUrban === true;
  const roadside = opts.roadside === true;
  const allowFoundationSkirt = opts.allowFoundationSkirt !== false;
  const baseOutset = denseUrban
    ? Math.min(0.72, Math.max(0.26, maxRadius * 0.028))
    : Math.min(1.1, Math.max(0.45, maxRadius * 0.05));
  const apronOutset = Math.min(
    denseUrban ? 0.92 : 1.55,
    Math.max(
      baseOutset,
      baseOutset +
      (denseUrban ? 0.04 : 0) +
      (roadside ? 0.08 : 0) +
      Math.min(denseUrban ? 0.08 : 0.18, Math.max(0, heightMeters - 18) * (denseUrban ? 0.004 : 0.008)) +
      Math.min(denseUrban ? 0.06 : 0.12, Math.max(0, footprintArea - 160) * (denseUrban ? 0.00016 : 0.00035))
    )
  );
  const expandedPts = footprint.map((point) => {
    const dx = point.x - cx;
    const dz = point.z - cz;
    const len = Math.max(1e-4, Math.hypot(dx, dz));
    return {
      x: point.x + dx / len * apronOutset,
      z: point.z + dz / len * apronOutset
    };
  });

  const shape = new THREE.Shape();
  expandedPts.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, -point.z);
    else shape.lineTo(point.x, -point.z);
  });
  shape.closePath();

  if (allowApron) {
    const apronGeometry = new THREE.ShapeGeometry(shape, 1);
    apronGeometry.rotateX(-Math.PI / 2);

    const apronPositions = apronGeometry.attributes.position;
    for (let i = 0; i < apronPositions.count; i++) {
      const x = apronPositions.getX(i);
      const z = apronPositions.getZ(i);
      apronPositions.setY(i, sampleTerrainY(x, z) - baseElevation + 0.05);
    }
    apronPositions.needsUpdate = true;
    apronGeometry.computeVertexNormals();

    const apronUvs = apronGeometry.attributes.uv;
    if (apronUvs) {
      for (let i = 0; i < apronUvs.count; i++) {
        apronUvs.setXY(i, apronPositions.getX(i) / 8, apronPositions.getZ(i) / 8);
      }
      apronUvs.needsUpdate = true;
    }

    const apronMesh = new THREE.Mesh(apronGeometry, createGroundPatchMaterial(state, 'apron'));
    apronMesh.position.y = baseElevation;
    apronMesh.renderOrder = 1;
    apronMesh.receiveShadow = true;
    apronMesh.userData.buildingGround = true;
    apronMesh.userData.isGroundApron = true;
    apronMesh.userData.apronOutset = apronOutset;
    apronMesh.userData.alwaysVisible = true;
    apronMesh.visible = true;
    resultMeshes.push(apronMesh);
  }

  const skirtPositions = [];
  const skirtUvs = [];
  const skirtIndices = [];
  let skirtVertBase = 0;

  const maxSkirtSegmentLength = 2.0;
  const skirtTopY = 0.04;
  const skirtBaseEmbedDepth = denseUrban ? 0.42 : 0.8;

  if (allowFoundationSkirt) {
    for (let i = 0; i < footprint.length; i++) {
      const p0 = footprint[i];
      const p1 = footprint[(i + 1) % footprint.length];
      const edgeLength = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      if (!Number.isFinite(edgeLength) || edgeLength < 0.05) continue;

      const segments = Math.max(1, Math.ceil(edgeLength / maxSkirtSegmentLength));
      let edgeU = 0;

      for (let s = 0; s < segments; s++) {
        const t0 = s / segments;
        const t1 = (s + 1) / segments;
        const q0 = {
          x: p0.x + (p1.x - p0.x) * t0,
          z: p0.z + (p1.z - p0.z) * t0
        };
        const q1 = {
          x: p0.x + (p1.x - p0.x) * t1,
          z: p0.z + (p1.z - p0.z) * t1
        };
        const segmentLength = Math.hypot(q1.x - q0.x, q1.z - q0.z);
        if (!Number.isFinite(segmentLength) || segmentLength < 0.01) continue;

        const localTerrain0 = sampleTerrainY(q0.x, q0.z) - baseElevation;
        const localTerrain1 = sampleTerrainY(q1.x, q1.z) - baseElevation;
        const embedDepth0 = skirtBaseEmbedDepth + Math.min(denseUrban ? 1.2 : 2.5, Math.abs(localTerrain0 - skirtTopY) * 0.15);
        const embedDepth1 = skirtBaseEmbedDepth + Math.min(denseUrban ? 1.2 : 2.5, Math.abs(localTerrain1 - skirtTopY) * 0.15);
        const bottomY0 = Math.min(localTerrain0, skirtTopY) - embedDepth0;
        const bottomY1 = Math.min(localTerrain1, skirtTopY) - embedDepth1;
        const u0 = edgeU;
        const u1 = edgeU + segmentLength / 6;
        edgeU = u1;

        skirtPositions.push(
          q0.x, skirtTopY, q0.z,
          q1.x, skirtTopY, q1.z,
          q0.x, bottomY0, q0.z,
          q1.x, bottomY1, q1.z
        );
        skirtUvs.push(u0, 1, u1, 1, u0, 0, u1, 0);
        skirtIndices.push(
          skirtVertBase, skirtVertBase + 2, skirtVertBase + 1,
          skirtVertBase + 1, skirtVertBase + 2, skirtVertBase + 3
        );
        skirtVertBase += 4;
      }
    }
  }

  if (skirtVertBase >= 4) {
    const skirtGeometry = new THREE.BufferGeometry();
    skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3));
    skirtGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(skirtUvs, 2));
    skirtGeometry.setIndex(skirtIndices);
    skirtGeometry.computeVertexNormals();

    const skirtMesh = new THREE.Mesh(skirtGeometry, createGroundPatchMaterial(state, 'skirt'));
    skirtMesh.position.y = baseElevation;
    skirtMesh.renderOrder = 0;
    skirtMesh.receiveShadow = true;
    skirtMesh.userData.buildingGround = true;
    skirtMesh.userData.isFoundationSkirt = true;
    skirtMesh.userData.alwaysVisible = true;
    skirtMesh.visible = true;
    resultMeshes.push(skirtMesh);
  }

  return resultMeshes.length === 1 ? resultMeshes[0] : resultMeshes;
}

function loadPbrTextureSet(name, urls, onLoaded, fallbackFns) {
  if (!USE_REMOTE_PBR_TEXTURES) {
    const fallback = fallbackFns();
    onLoaded(fallback.diff, fallback.nor, fallback.rough, false);
    return;
  }
  const loader = new THREE.TextureLoader();
  let loadedCount = 0;
  let resolved = false;
  const textures = { diff: null, nor: null, rough: null };
  const total = 3;

  const resolve = (fromCDN) => {
    if (resolved) return;
    resolved = true;
    if (fromCDN && textures.diff && textures.nor && textures.rough) {
      onLoaded(textures.diff, textures.nor, textures.rough, true);
      return;
    }
    const fallback = fallbackFns();
    onLoaded(
      textures.diff || fallback.diff,
      textures.nor || fallback.nor,
      textures.rough || fallback.rough,
      false
    );
  };

  const checkDone = () => {
    loadedCount += 1;
    if (loadedCount >= total) {
      resolve(!!(textures.diff && textures.nor && textures.rough));
    }
  };

  setTimeout(() => {
    if (!resolved) {
      console.warn('PBR texture CDN timeout (' + name + '), using procedural fallback');
      resolve(false);
    }
  }, 4000);

  const loadTex = (key, url, encoding) => {
    loader.load(
      url,
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        if (encoding) tex.encoding = encoding;
        textures[key] = tex;
        checkDone();
      },
      undefined,
      () => {
        console.warn('PBR texture load failed (' + name + ' ' + key + '), using fallback');
        checkDone();
      }
    );
  };

  loadTex('diff', urls.diff, THREE.sRGBEncoding);
  loadTex('nor', urls.nor, null);
  loadTex('rough', urls.rough, null);
}

function applyGrassToTerrain(ctx) {
  const { appCtx, state } = ctx;
  if (!state.grassDiffuse || !appCtx.terrainGroup) return;

  appCtx.terrainGroup.children.forEach((mesh) => {
    if (!mesh.userData || !mesh.userData.terrainTile || !mesh.material) return;
    const info = mesh.userData.terrainTile;
    const bounds = info.bounds;
    const pNW = appCtx.geoToWorld(bounds.latN, bounds.lonW);
    const pNE = appCtx.geoToWorld(bounds.latN, bounds.lonE);
    const tileWidth = Math.abs(pNE.x - pNW.x);
    const repeats = Math.max(10, Math.round(tileWidth / 25));

    if (
      typeof appCtx.classifyTerrainVisualProfile === 'function' &&
      typeof appCtx.applyTerrainVisualProfile === 'function'
    ) {
      const profile = appCtx.classifyTerrainVisualProfile(
        bounds,
        mesh.userData?.minElevationMeters,
        mesh.userData?.maxElevationMeters,
        mesh.userData?.elevationStatsMeters
      );
      appCtx.applyTerrainVisualProfile(mesh, profile, repeats);
      return;
    }

    mesh.material.map = state.grassDiffuse.clone();
    mesh.material.map.wrapS = mesh.material.map.wrapT = THREE.RepeatWrapping;
    mesh.material.map.repeat.set(repeats, repeats);

    if (state.grassNormal) {
      mesh.material.normalMap = state.grassNormal.clone();
      mesh.material.normalMap.wrapS = mesh.material.normalMap.wrapT = THREE.RepeatWrapping;
      mesh.material.normalMap.repeat.set(repeats, repeats);
      mesh.material.normalScale = new THREE.Vector2(0.6, 0.6);
    }
    if (state.grassRoughness) {
      mesh.material.roughnessMap = state.grassRoughness.clone();
      mesh.material.roughnessMap.wrapS = mesh.material.roughnessMap.wrapT = THREE.RepeatWrapping;
      mesh.material.roughnessMap.repeat.set(repeats, repeats);
    }
    mesh.material.color.set(0xffffff);
    mesh.material.needsUpdate = true;
  });
}

function initPbrTextures(ctx, maxAniso) {
  const { state } = ctx;
  const aniso = Math.min(maxAniso, 8);
  const tuneSet = (textures) => {
    textures.forEach((tex) => {
      if (tex) {
        tex.anisotropy = aniso;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      }
    });
  };

  loadPbrTextureSet('grass', {
    diff: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forrest_ground_01/forrest_ground_01_diff_1k.jpg',
    nor: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forrest_ground_01/forrest_ground_01_nor_gl_1k.jpg',
    rough: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forrest_ground_01/forrest_ground_01_rough_1k.jpg'
  }, (diff, nor, rough, fromCDN) => {
    state.grassDiffuse = diff;
    state.grassNormal = nor;
    state.grassRoughness = rough;
    syncTextureGlobals(ctx);
    tuneSet([state.grassDiffuse, state.grassNormal, state.grassRoughness]);
    state.pbrTexturesLoaded.grass = true;
    console.log('Grass textures ready (' + (fromCDN ? 'Poly Haven CDN' : 'procedural fallback') + ')');
    applyGrassToTerrain(ctx);
  }, () => {
    return {
      diff: createProceduralGrassTexture(),
      nor: createProceduralGrassNormal(),
      rough: createProceduralGrassRoughness()
    };
  });

  loadPbrTextureSet('pavement', {
    diff: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brushed_concrete/brushed_concrete_diff_1k.jpg',
    nor: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brushed_concrete/brushed_concrete_nor_gl_1k.jpg',
    rough: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brushed_concrete/brushed_concrete_rough_1k.jpg'
  }, (diff, nor, rough, fromCDN) => {
    state.pavementDiffuse = diff;
    state.pavementNormal = nor;
    state.pavementRoughness = rough;
    syncTextureGlobals(ctx);
    tuneSet([state.pavementDiffuse, state.pavementNormal, state.pavementRoughness]);
    state.pbrTexturesLoaded.pavement = true;
    console.log('Pavement textures ready (' + (fromCDN ? 'Poly Haven CDN' : 'procedural fallback') + ')');
  }, () => {
    return {
      diff: createPavementTexture(),
      nor: createPavementNormalMap(),
      rough: createPavementRoughnessMap()
    };
  });

  loadPbrTextureSet('concrete', {
    diff: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete/concrete_diff_1k.jpg',
    nor: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete/concrete_nor_gl_1k.jpg',
    rough: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete/concrete_rough_1k.jpg'
  }, (diff, nor, rough, fromCDN) => {
    state.concreteDiffuse = diff;
    state.concreteNormal = nor;
    state.concreteRoughness = rough;
    syncTextureGlobals(ctx);
    tuneSet([state.concreteDiffuse, state.concreteNormal, state.concreteRoughness]);
    state.pbrTexturesLoaded.concrete = true;
    console.log('Concrete textures ready (' + (fromCDN ? 'Poly Haven CDN' : 'procedural fallback') + ')');
    refreshBuildingFacadeMaterials(ctx);
  }, () => {
    return {
      diff: createConcreteFacadeTexture(),
      nor: createConcreteNormalMap(),
      rough: createConcreteRoughnessMap()
    };
  });

  loadPbrTextureSet('brick', {
    diff: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_diffuse_1k.jpg',
    nor: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_nor_gl_1k.jpg',
    rough: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_rough_1k.jpg'
  }, (diff, nor, rough, fromCDN) => {
    state.brickDiffuse = diff;
    state.brickNormal = nor;
    state.brickRoughness = rough;
    syncTextureGlobals(ctx);
    tuneSet([state.brickDiffuse, state.brickNormal, state.brickRoughness]);
    state.pbrTexturesLoaded.brick = true;
    console.log('Brick textures ready (' + (fromCDN ? 'Poly Haven CDN' : 'procedural fallback') + ')');
    refreshBuildingFacadeMaterials(ctx);
  }, () => {
    return {
      diff: createBrickFacadeTexture(),
      nor: createBrickNormalMap(),
      rough: createBrickRoughnessMap()
    };
  });
}

export function initEngineTextures(ctx, renderer) {
  const { state } = ctx;
  state.asphaltTex = createAsphaltTexture();
  state.asphaltNormal = createAsphaltNormal();
  state.asphaltRoughness = createRoughnessMap();
  state.buildingNormalMap = createBuildingNormalMap();
  state.buildingRoughnessMap = createBuildingRoughnessMap();

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const aniso = Math.min(maxAniso, 8);
  if (state.asphaltTex) state.asphaltTex.anisotropy = aniso;
  if (state.asphaltNormal) state.asphaltNormal.anisotropy = aniso;
  if (state.asphaltRoughness) state.asphaltRoughness.anisotropy = aniso;

  initPbrTextures(ctx, maxAniso);
  syncTextureGlobals(ctx);
}

export { getBuildingMaterial };
