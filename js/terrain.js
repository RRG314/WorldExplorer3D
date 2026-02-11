// ============================================================================
// terrain.js - Terrain elevation system (Terrarium tiles)
// ============================================================================

// =====================
// TERRAIN HELPER FUNCTIONS
// =====================

// Namespace for terrain internal state
const terrain = { _rebuildTimer: null, _raycaster: null, _rayOrigin: null, _rayDir: null };

// =====================
// TERRAIN MESH GRID SAMPLER
// Reads vertex heights directly from terrain mesh geometry - O(1) per query.
// This gives the exact same height as the rendered terrain surface without
// expensive raycasting (which was O(triangles) and caused browser freezes).
// =====================
function terrainMeshHeightAt(x, z) {
  if (!terrainGroup || terrainGroup.children.length === 0) {
    return elevationWorldYAtWorldXZ(x, z);
  }

  const segs = TERRAIN_SEGMENTS;
  const vps = segs + 1; // vertices per side

  for (let c = 0; c < terrainGroup.children.length; c++) {
    const mesh = terrainGroup.children[c];
    const info = mesh.userData?.terrainTile;
    if (!info) continue;

    const pos = mesh.geometry.attributes.position;
    if (!pos || pos.count < 4) continue;

    // Convert world position to mesh local space
    const lx = x - mesh.position.x;
    const lz = z - mesh.position.z;

    // Get mesh extents from corner vertices
    // Vertex 0 = top-left (-width/2, ?, -depth/2)
    // Vertex [segs] = top-right (width/2, ?, -depth/2)
    // Vertex [segs*vps] = bottom-left (-width/2, ?, depth/2)
    const x0 = pos.getX(0);
    const x1 = pos.getX(segs);
    const z0 = pos.getZ(0);
    const z1 = pos.getZ(segs * vps);

    // Bounds check - is point within this terrain tile?
    if (lx < x0 || lx > x1 || lz < z0 || lz > z1) continue;

    // Compute grid cell coordinates
    const fx = (lx - x0) / (x1 - x0) * segs;
    const fz = (lz - z0) / (z1 - z0) * segs;

    const col = Math.max(0, Math.min(segs - 1, Math.floor(fx)));
    const row = Math.max(0, Math.min(segs - 1, Math.floor(fz)));

    const sx = fx - col; // 0..1 within cell
    const sz = fz - row;

    // Get four corner vertex Y values + mesh base position
    const baseY = mesh.position.y;
    const y00 = pos.getY(row * vps + col) + baseY;
    const y10 = pos.getY(row * vps + col + 1) + baseY;
    const y01 = pos.getY((row + 1) * vps + col) + baseY;
    const y11 = pos.getY((row + 1) * vps + col + 1) + baseY;

    // Bilinear interpolation - matches GPU linear triangle interpolation
    const y0 = y00 + (y10 - y00) * sx;
    const y1 = y01 + (y11 - y01) * sx;
    return y0 + (y1 - y0) * sz;
  }

  // Point not on any terrain tile - use raw elevation
  return elevationWorldYAtWorldXZ(x, z);
}

// Subdivide road points so no segment is longer than maxDist world units.
// This ensures roads follow terrain contours even for long OSM segments.
function subdivideRoadPoints(pts, maxDist) {
  if (pts.length < 2) return pts;
  const result = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const dx = cur.x - prev.x;
    const dz = cur.z - prev.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > maxDist) {
      const steps = Math.ceil(dist / maxDist);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        result.push({ x: prev.x + dx * t, z: prev.z + dz * t });
      }
    }
    result.push(cur);
  }
  return result;
}

function latLonToTileXY(lat, lon, z) {
  const n = Math.pow(2, z);
  const xt = (lon + 180) / 360 * n;
  const yt = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  return { x: Math.floor(xt), y: Math.floor(yt), xf: xt, yf: yt };
}

function tileXYToLatLonBounds(x, y, z) {
  const n = Math.pow(2, z);
  const lonW = x / n * 360 - 180;
  const lonE = (x + 1) / n * 360 - 180;

  const latN = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * (y / n))));
  const latS = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * ((y + 1) / n))));

  return { latN, latS, lonW, lonE };
}

// Terrarium encoding: height_m = (R*256 + G + B/256) - 32768
function decodeTerrariumRGB(r, g, b) {
  return (r * 256 + g + b / 256) - 32768;
}

function getOrLoadTerrainTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (terrainTileCache.has(key)) return terrainTileCache.get(key);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = TERRAIN_TILE_URL(z, x, y);

  const tile = { img, loaded: false, elev: null, w: 256, h: 256 };
  terrainTileCache.set(key, tile);

  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, 256, 256);

      // Store elevation as Float32Array (meters)
      const elev = new Float32Array(256 * 256);
      for (let i = 0, p = 0; i < elev.length; i++, p += 4) {
        elev[i] = decodeTerrariumRGB(data[p], data[p + 1], data[p + 2]);
      }

      tile.loaded = true;
      tile.elev = elev;
      
      // IMPORTANT: After tile loads, reapply heights to any terrain meshes using this tile
      if (terrainGroup) {
        terrainGroup.children.forEach(mesh => {
          const tileInfo = mesh.userData?.terrainTile;
          if (tileInfo && tileInfo.z === z && tileInfo.tx === x && tileInfo.ty === y) {
            // Tile loaded - reapply heights
            applyHeightsToTerrainMesh(mesh);
          }
        });
      }
      
      // Immediately schedule road + building rebuild when terrain data arrives
      // Use a short debounce (60ms) so multiple tiles loading at once batch together
      roadsNeedRebuild = true;
      if (!terrain._rebuildTimer) {
        terrain._rebuildTimer = setTimeout(() => {
          terrain._rebuildTimer = null;
          if (roadsNeedRebuild && !onMoon) {
            rebuildRoadsWithTerrain();
            repositionBuildingsWithTerrain();
          }
        }, 60);
      }
    } catch (e) {
      console.warn('Terrain tile decode failed:', z, x, y, e);
      tile.loaded = false;
      tile.elev = null;
    }
  };

  img.onerror = () => {
    tile.loaded = false;
    tile.elev = null;
  };

  return tile;
}

// Sample elevation (meters) from a loaded tile using bilinear interpolation
function sampleTileElevationMeters(tile, u, v) {
  if (!tile || !tile.loaded || !tile.elev) return 0;

  const w = 256, h = 256;
  const x = Math.max(0, Math.min(w - 1, u * (w - 1)));
  const y = Math.max(0, Math.min(h - 1, v * (h - 1)));

  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);

  const sx = x - x0, sy = y - y0;

  const i00 = y0 * w + x0;
  const i10 = y0 * w + x1;
  const i01 = y1 * w + x0;
  const i11 = y1 * w + x1;

  const e00 = tile.elev[i00], e10 = tile.elev[i10], e01 = tile.elev[i01], e11 = tile.elev[i11];

  const ex0 = e00 + (e10 - e00) * sx;
  const ex1 = e01 + (e11 - e01) * sx;
  return ex0 + (ex1 - ex0) * sy;
}

function worldToLatLon(x, z) {
  const lat = LOC.lat - (z / SCALE);
  const lon = LOC.lon + (x / (SCALE * Math.cos(LOC.lat * Math.PI / 180)));
  return { lat, lon };
}

function elevationMetersAtLatLon(lat, lon) {
  const t = latLonToTileXY(lat, lon, TERRAIN_ZOOM);
  const tile = getOrLoadTerrainTile(TERRAIN_ZOOM, t.x, t.y);
  if (!tile.loaded) return 0;

  const u = t.xf - t.x;
  const v = t.yf - t.y;
  return sampleTileElevationMeters(tile, u, v);
}

function elevationWorldYAtWorldXZ(x, z) {
  const { lat, lon } = worldToLatLon(x, z);
  const meters = elevationMetersAtLatLon(lat, lon);
  return meters * WORLD_UNITS_PER_METER * TERRAIN_Y_EXAGGERATION;
}

function ensureTerrainGroup() {
  if (!terrainGroup) {
    terrainGroup = new THREE.Group();
    terrainGroup.name = 'TerrainGroup';
    scene.add(terrainGroup);
  }
}

function clearTerrainMeshes() {
  if (!terrainGroup) return;
  while (terrainGroup.children.length) {
    const m = terrainGroup.children.pop();
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  }
}

function buildTerrainTileMesh(z, tx, ty) {
  const bounds = tileXYToLatLonBounds(tx, ty, z);
  const pNW = geoToWorld(bounds.latN, bounds.lonW);
  const pNE = geoToWorld(bounds.latN, bounds.lonE);
  const pSW = geoToWorld(bounds.latS, bounds.lonW);

  const width = Math.hypot(pNE.x - pNW.x, pNE.z - pNW.z);
  const depth = Math.hypot(pSW.x - pNW.x, pSW.z - pNW.z);

  const cx = (pNW.x + pNE.x + pSW.x) / 3;
  const cz = (pNW.z + pNE.z + pSW.z) / 3;

  const geo = new THREE.PlaneGeometry(width, depth, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  // Tile grass every ~25 world units (~28 meters) for visible detail from car/walking
  const repeats = Math.max(10, Math.round(width / 25));

  const mat = new THREE.MeshStandardMaterial({
    color: (typeof grassDiffuse !== 'undefined' && grassDiffuse) ? 0xffffff : 0x6b8e4a,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    wireframe: false
  });

  // Apply grass PBR textures if loaded
  if (typeof grassDiffuse !== 'undefined' && grassDiffuse) {
    mat.map = grassDiffuse.clone();
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
    mat.map.repeat.set(repeats, repeats);
  }
  if (typeof grassNormal !== 'undefined' && grassNormal) {
    mat.normalMap = grassNormal.clone();
    mat.normalMap.wrapS = mat.normalMap.wrapT = THREE.RepeatWrapping;
    mat.normalMap.repeat.set(repeats, repeats);
    mat.normalScale = new THREE.Vector2(0.6, 0.6);
  }
  if (typeof grassRoughness !== 'undefined' && grassRoughness) {
    mat.roughnessMap = grassRoughness.clone();
    mat.roughnessMap.wrapS = mat.roughnessMap.wrapT = THREE.RepeatWrapping;
    mat.roughnessMap.repeat.set(repeats, repeats);
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 0;
  mesh.position.set(cx, 0, cz);
  mesh.receiveShadow = true;
  mesh.castShadow = false; // Terrain doesn't cast shadows (performance)
  mesh.frustumCulled = false; // Don't cull terrain - always render it
  mesh.userData = { terrainTile: { z, tx, ty, bounds } };

  applyHeightsToTerrainMesh(mesh);

  return mesh;
}

function applyHeightsToTerrainMesh(mesh) {
  const info = mesh.userData?.terrainTile;
  if (!info) return;

  const { z, tx, ty, bounds } = info;

  const tile = getOrLoadTerrainTile(z, tx, ty);
  if (!tile.loaded) return;

  const pos = mesh.geometry.attributes.position;

  // First pass: sample elevations and find range
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  const elevations = [];

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + mesh.position.x;
    const wz = pos.getZ(i) + mesh.position.z;
    const { lat, lon } = worldToLatLon(wx, wz);
    const meters = elevationMetersAtLatLon(lat, lon);
    const y = meters * WORLD_UNITS_PER_METER * TERRAIN_Y_EXAGGERATION;
    elevations.push(y);
    minElevation = Math.min(minElevation, y);
    maxElevation = Math.max(maxElevation, y);
  }

  // Position mesh base well below all vertices
  mesh.position.y = minElevation - 10;

  // Second pass: set vertex Y relative to mesh base
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, elevations[i] - mesh.position.y);
  }

  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();

  // Store elevation range for debugging
  mesh.userData.minElevation = minElevation;
  mesh.userData.maxElevation = maxElevation;
}

let lastTerrainCenterKey = null;

function updateTerrainAround(x, z) {
  if (!terrainEnabled) return;

  ensureTerrainGroup();

  const { lat, lon } = worldToLatLon(x, z);
  const t = latLonToTileXY(lat, lon, TERRAIN_ZOOM);
  const centerKey = `${TERRAIN_ZOOM}/${t.x}/${t.y}`;
  if (centerKey === lastTerrainCenterKey) return;
  lastTerrainCenterKey = centerKey;

  clearTerrainMeshes();

  for (let dx = -TERRAIN_RING; dx <= TERRAIN_RING; dx++) {
    for (let dy = -TERRAIN_RING; dy <= TERRAIN_RING; dy++) {
      const tx = t.x + dx;
      const ty = t.y + dy;
      const mesh = buildTerrainTileMesh(TERRAIN_ZOOM, tx, ty);
      terrainGroup.add(mesh);
    }
  }

  // Immediately rebuild roads and reposition objects when terrain tiles change
  // so they stay aligned with the new terrain grid (no stale gaps)
  if (roads.length > 0 && !onMoon) {
    rebuildRoadsWithTerrain();
    repositionBuildingsWithTerrain();
  }

  // terrain tiles updated
}

// Rebuild roads to follow current terrain elevation
function rebuildRoadsWithTerrain() {
  if (!terrainEnabled || roads.length === 0 || onMoon) return;

  // Check if terrain tiles are loaded
  let tilesLoaded = 0;
  let tilesTotal = 0;
  terrainTileCache.forEach(tile => {
    tilesTotal++;
    if (tile.loaded) tilesLoaded++;
  });

  if (tilesLoaded === 0 || tilesTotal === 0) return;

  // Remove old road meshes
  roadMeshes.forEach(m => {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  });
  roadMeshes = [];

  // Rebuild each road with terrain elevation using terrain mesh sampling
  roads.forEach(road => {
    const { width } = road;
    const hw = width / 2;

    // Subdivide road points so segments are at most 5 world units long
    // Denser subdivision = smoother roads on steep terrain (Monaco, SF hills)
    const pts = subdivideRoadPoints(road.pts, 5);

    const verts = [], indices = [];

    // First pass: sample terrain heights at center of each road point
    const centerHeights = new Float64Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      centerHeights[i] = terrainMeshHeightAt(pts[i].x, pts[i].z);
    }

    // Smooth center heights to eliminate stair-stepping on steep terrain
    // This is critical for hilly cities like Monaco, San Francisco
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < pts.length - 1; i++) {
        centerHeights[i] = centerHeights[i] * 0.6 +
          (centerHeights[i - 1] + centerHeights[i + 1]) * 0.2;
      }
    }

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let dx, dz;
      if (i === 0) { dx = pts[1].x - p.x; dz = pts[1].z - p.z; }
      else if (i === pts.length - 1) { dx = p.x - pts[i-1].x; dz = p.z - pts[i-1].z; }
      else { dx = pts[i+1].x - pts[i-1].x; dz = pts[i+1].z - pts[i-1].z; }

      const len = Math.sqrt(dx*dx + dz*dz) || 1;
      const nx = -dz / len, nz = dx / len;

      // Use smoothed center height + cross-slope tilt from terrain
      const baseY = centerHeights[i] + 0.2;

      // Sample cross-slope at edges for natural tilt on banked roads
      const edgeY1 = terrainMeshHeightAt(p.x + nx * hw, p.z + nz * hw);
      const edgeY2 = terrainMeshHeightAt(p.x - nx * hw, p.z - nz * hw);
      const crossTilt1 = edgeY1 - terrainMeshHeightAt(p.x, p.z);
      const crossTilt2 = edgeY2 - terrainMeshHeightAt(p.x, p.z);

      // Clamp cross-slope tilt to prevent extreme values
      const maxTilt = 2.0;
      const tilt1 = Math.max(-maxTilt, Math.min(maxTilt, crossTilt1));
      const tilt2 = Math.max(-maxTilt, Math.min(maxTilt, crossTilt2));

      const y1 = baseY + tilt1;
      const y2 = baseY + tilt2;

      verts.push(p.x + nx * hw, y1, p.z + nz * hw);
      verts.push(p.x - nx * hw, y2, p.z - nz * hw);

      if (i < pts.length - 1) {
        const vi = i * 2;
        indices.push(vi, vi+1, vi+2, vi+1, vi+3, vi+2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    // Use asphalt PBR textures if available (same as initial road load in world.js)
    const roadMat = (typeof asphaltTex !== 'undefined' && asphaltTex) ? new THREE.MeshStandardMaterial({
      map: asphaltTex,
      normalMap: asphaltNormal || undefined,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: asphaltRoughness || undefined,
      roughness: 0.95,
      metalness: 0.05,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    }) : new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.95,
      metalness: 0.05,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    });

    const mesh = new THREE.Mesh(geo, roadMat);
    mesh.renderOrder = 2;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    roadMeshes.push(mesh);
  });

  roadsNeedRebuild = false;
}

// Reposition buildings and landuse to follow terrain
function repositionBuildingsWithTerrain() {
  if (!terrainEnabled || onMoon) return;

  let buildingsRepositioned = 0;
  let landuseRepositioned = 0;
  let poisRepositioned = 0;

  // Reposition buildings using terrain mesh surface
  buildingMeshes.forEach(mesh => {
    const pts = mesh.userData.buildingFootprint;
    if (!pts || pts.length === 0) return;

    // Use minimum elevation of footprint corners so building sits ON terrain
    let minElevation = Infinity;
    pts.forEach(p => {
      const h = terrainMeshHeightAt(p.x, p.z);
      minElevation = Math.min(minElevation, h);
    });
    if (!isFinite(minElevation)) minElevation = 0;

    mesh.position.y = minElevation;
    buildingsRepositioned++;
  });

  // Reposition landuse areas - deform vertices to follow terrain mesh surface
  landuseMeshes.forEach(mesh => {
    const pts = mesh.userData.landuseFootprint;
    if (!pts || pts.length === 0) return;

    // Recalculate average elevation from terrain mesh
    let avgElevation = 0;
    pts.forEach(p => {
      avgElevation += terrainMeshHeightAt(p.x, p.z);
    });
    avgElevation /= pts.length;

    mesh.position.y = avgElevation;

    // Deform each vertex to follow actual terrain mesh surface
    const positions = mesh.geometry.attributes.position;
    if (positions) {
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const tY = terrainMeshHeightAt(x, z);
        positions.setY(i, (tY - avgElevation) + 0.05);
      }
      positions.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      landuseRepositioned++;
    }
  });

  // Reposition POI markers using terrain mesh surface
  poiMeshes.forEach(mesh => {
    const pos = mesh.userData.poiPosition;
    if (!pos) return;

    const tY = terrainMeshHeightAt(pos.x, pos.z);
    const offset = mesh.userData.isCapMesh ? 4 : 2;
    mesh.position.y = tY + offset;
    poisRepositioned++;
  });

  // Reposition street furniture using terrain mesh surface
  streetFurnitureMeshes.forEach(group => {
    if (!group.userData || !group.userData.furniturePos) return;
    const pos = group.userData.furniturePos;
    const tY = terrainMeshHeightAt(pos.x, pos.z);
    group.position.y = tY;
  });

  // Debug log removed
}
