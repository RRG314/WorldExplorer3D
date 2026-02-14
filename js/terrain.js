// ============================================================================
// terrain.js - Terrain elevation system (Terrarium tiles)
// ============================================================================

// =====================
// TERRAIN HELPER FUNCTIONS
// =====================

// Namespace for terrain internal state
const terrain = {
  _rebuildTimer: null,
  _raycaster: null,
  _rayOrigin: null,
  _rayDir: null,
  // Performance optimization caching
  _lastUpdatePos: { x: 0, z: 0 },
  _cachedIntersections: null,
  _lastRoadCount: 0,
  _lastTerrainTileCount: 0
};

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

// =====================
// TERRAIN HEIGHT CACHE
// Cache terrain height lookups to avoid repeated queries during road generation
// =====================
const terrainHeightCache = new Map();
let terrainHeightCacheEnabled = true;

function cachedTerrainHeight(x, z) {
  if (!terrainHeightCacheEnabled) return terrainMeshHeightAt(x, z);

  // Round to 0.1 precision for caching (10cm grid)
  const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
  if (terrainHeightCache.has(key)) return terrainHeightCache.get(key);

  const h = terrainMeshHeightAt(x, z);
  terrainHeightCache.set(key, h);
  return h;
}

function clearTerrainHeightCache() {
  terrainHeightCache.clear();
}

// =====================
// CURVATURE-AWARE ROAD RESAMPLING
// Subdivides road polylines with adaptive density based on curvature
// =====================

// Calculate curvature at point i using neighboring points
function calculateCurvature(pts, i) {
  if (i === 0 || i >= pts.length - 1) return 0;

  const p0 = pts[i - 1];
  const p1 = pts[i];
  const p2 = pts[i + 1];

  // Vector from p0 to p1
  const dx1 = p1.x - p0.x;
  const dz1 = p1.z - p0.z;
  const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1) || 1;

  // Vector from p1 to p2
  const dx2 = p2.x - p1.x;
  const dz2 = p2.z - p1.z;
  const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;

  // Normalize
  const nx1 = dx1 / len1, nz1 = dz1 / len1;
  const nx2 = dx2 / len2, nz2 = dz2 / len2;

  // Dot product gives cos(angle)
  const dot = nx1 * nx2 + nz1 * nz2;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

  // Curvature = angle / average segment length
  const avgLen = (len1 + len2) / 2;
  return angle / (avgLen || 1);
}

// Subdivide road points with curvature-aware adaptive sampling
// Straight segments: 2-5 meters, Curves: 0.5-2 meters
function subdivideRoadPoints(pts, maxDist) {
  if (pts.length < 2) return pts;

  const result = [pts[0]];

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const dx = cur.x - prev.x;
    const dz = cur.z - prev.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Calculate curvature at prev and cur points
    const curvPrev = calculateCurvature(pts, i - 1);
    const curvCur = calculateCurvature(pts, i);
    const avgCurv = (curvPrev + curvCur) / 2;

    // Adaptive spacing based on curvature
    // Low curvature (< 0.1): use maxDist (2-5m)
    // High curvature (> 0.5): use minDist (0.5-2m)
    const minDist = maxDist * 0.2; // 0.5-1m for tight curves
    const curvFactor = Math.max(0, Math.min(1, avgCurv / 0.5));
    const adaptiveDist = maxDist * (1 - curvFactor * 0.8) || maxDist;

    if (dist > adaptiveDist) {
      const steps = Math.ceil(dist / adaptiveDist);
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
  const pCenter = geoToWorld((bounds.latN + bounds.latS) * 0.5, (bounds.lonW + bounds.lonE) * 0.5);

  const width = Math.hypot(pNE.x - pNW.x, pNE.z - pNW.z);
  const depth = Math.hypot(pSW.x - pNW.x, pSW.z - pNW.z);

  const cx = pCenter.x;
  const cz = pCenter.z;

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
    mat.map.needsUpdate = true;
  }
  if (typeof grassNormal !== 'undefined' && grassNormal) {
    mat.normalMap = grassNormal.clone();
    mat.normalMap.wrapS = mat.normalMap.wrapT = THREE.RepeatWrapping;
    mat.normalMap.repeat.set(repeats, repeats);
    mat.normalMap.needsUpdate = true;
    mat.normalScale = new THREE.Vector2(0.6, 0.6);
  }
  if (typeof grassRoughness !== 'undefined' && grassRoughness) {
    mat.roughnessMap = grassRoughness.clone();
    mat.roughnessMap.wrapS = mat.roughnessMap.wrapT = THREE.RepeatWrapping;
    mat.roughnessMap.repeat.set(repeats, repeats);
    mat.roughnessMap.needsUpdate = true;
  }

  // Mark material for update
  mat.needsUpdate = true;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 0;
  mesh.position.set(cx, 0, cz);
  mesh.receiveShadow = true;
  mesh.castShadow = false; // Terrain doesn't cast shadows (performance)
  mesh.frustumCulled = false; // Don't cull terrain - always render it
  mesh.userData = { terrainTile: { z, tx, ty, bounds } };
  mesh.userData.isTerrainMesh = true; // Mark as terrain for debug mode

  applyHeightsToTerrainMesh(mesh);
  if (mesh.userData.pendingTerrainTile) {
    mesh.visible = false;
  }

  return mesh;
}

function applyHeightsToTerrainMesh(mesh) {
  const info = mesh.userData?.terrainTile;
  if (!info) return;

  const { z, tx, ty, bounds } = info;
  const tile = getOrLoadTerrainTile(z, tx, ty);
  if (!tile.loaded) {
    mesh.userData.pendingTerrainTile = true;
    mesh.visible = false;
    return;
  }

  const pos = mesh.geometry.attributes.position;
  const latRange = bounds.latN - bounds.latS || 1;
  const lonRange = bounds.lonE - bounds.lonW || 1;

  // First pass: sample elevations and find range
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  const elevations = [];

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + mesh.position.x;
    const wz = pos.getZ(i) + mesh.position.z;
    const { lat, lon } = worldToLatLon(wx, wz);
    const u = (lon - bounds.lonW) / lonRange;
    const v = (bounds.latN - lat) / latRange;
    const meters = sampleTileElevationMeters(tile, u, v);
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
  mesh.userData.pendingTerrainTile = false;
  mesh.visible = true;

  // Store elevation range for debugging
  mesh.userData.minElevation = minElevation;
  mesh.userData.maxElevation = maxElevation;
}

function resetTerrainStreamingState() {
  lastTerrainCenterKey = null;
  terrain._lastUpdatePos.x = 0;
  terrain._lastUpdatePos.z = 0;
  terrain._cachedIntersections = null;
  terrain._lastRoadCount = 0;
  clearTerrainHeightCache();
}

// =====================
// INTERSECTION DETECTION
// Detect road intersections by finding shared endpoint nodes
// =====================

function detectRoadIntersections(roads) {
  const intersections = new Map(); // key: "x,z" -> array of road indices

  roads.forEach((road, roadIdx) => {
    if (!road.pts || road.pts.length < 2) return;

    // Check first and last points (endpoints)
    [0, road.pts.length - 1].forEach(idx => {
      const pt = road.pts[idx];
      const key = `${Math.round(pt.x * 10)},${Math.round(pt.z * 10)}`; // 0.1 precision

      if (!intersections.has(key)) {
        intersections.set(key, { x: pt.x, z: pt.z, roads: [] });
      }
      intersections.get(key).roads.push({ roadIdx, ptIdx: idx, width: road.width || 8 });
    });
  });

  // Filter to only actual intersections (2+ roads meeting)
  const result = [];
  intersections.forEach((data, key) => {
    if (data.roads.length >= 2) {
      // Calculate max width for intersection cap sizing
      const maxWidth = Math.max(...data.roads.map(r => r.width));
      result.push({ x: data.x, z: data.z, roads: data.roads, maxWidth });
    }
  });

  return result;
}

// Build road skirts (vertical curtains) to hide terrain peeking
function buildRoadSkirts(leftEdge, rightEdge, skirtDepth = 1.5) {
  const verts = [];
  const indices = [];

  // Left skirt (curtain hanging down from left edge)
  for (let i = 0; i < leftEdge.length; i++) {
    const top = leftEdge[i];
    verts.push(top.x, top.y, top.z); // Top vertex
    verts.push(top.x, top.y - skirtDepth, top.z); // Bottom vertex

    if (i < leftEdge.length - 1) {
      const vi = i * 2;
      // Two triangles forming a quad
      indices.push(vi, vi + 1, vi + 2);
      indices.push(vi + 1, vi + 3, vi + 2);
    }
  }

  const leftSkirtStartIdx = indices.length;

  // Right skirt (curtain hanging down from right edge)
  for (let i = 0; i < rightEdge.length; i++) {
    const top = rightEdge[i];
    const baseIdx = leftEdge.length * 2 + i * 2;
    verts.push(top.x, top.y, top.z); // Top vertex
    verts.push(top.x, top.y - skirtDepth, top.z); // Bottom vertex

    if (i < rightEdge.length - 1) {
      const vi = baseIdx;
      indices.push(vi, vi + 1, vi + 2);
      indices.push(vi + 1, vi + 3, vi + 2);
    }
  }

  return { verts, indices };
}

// Build intersection cap patch (circular/square mesh covering intersection)
function buildIntersectionCap(x, z, radius, segments = 16) {
  const verts = [];
  const indices = [];

  // Center vertex
  const centerY = cachedTerrainHeight(x, z) + 0.25; // Slightly above roads
  verts.push(x, centerY, z);

  // Ring vertices
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const pz = z + Math.sin(angle) * radius;
    const py = cachedTerrainHeight(px, pz) + 0.25;
    verts.push(px, py, pz);
  }

  // Triangles from center to ring
  for (let i = 0; i < segments; i++) {
    indices.push(0, i + 1, i + 2);
  }

  return { verts, indices };
}

let lastTerrainCenterKey = null;

function updateTerrainAround(x, z) {
  if (!terrainEnabled) return;

  ensureTerrainGroup();

  const { lat, lon } = worldToLatLon(x, z);
  const t = latLonToTileXY(lat, lon, TERRAIN_ZOOM);
  const centerKey = `${TERRAIN_ZOOM}/${t.x}/${t.y}`;

  // OPTIMIZATION: Skip if same tile AND haven't moved enough (but always run on first call)
  if (lastTerrainCenterKey !== null) {
    const dx = x - terrain._lastUpdatePos.x;
    const dz = z - terrain._lastUpdatePos.z;
    const distMoved = Math.sqrt(dx * dx + dz * dz);

    if (centerKey === lastTerrainCenterKey && distMoved < 5.0) return;
  }

  const tilesChanged = centerKey !== lastTerrainCenterKey;
  lastTerrainCenterKey = centerKey;
  terrain._lastUpdatePos.x = x;
  terrain._lastUpdatePos.z = z;

  // Only rebuild terrain meshes if tiles actually changed
  if (tilesChanged) {
    clearTerrainMeshes();

    for (let dx = -TERRAIN_RING; dx <= TERRAIN_RING; dx++) {
      for (let dy = -TERRAIN_RING; dy <= TERRAIN_RING; dy++) {
        const tx = t.x + dx;
        const ty = t.y + dy;
        const mesh = buildTerrainTileMesh(TERRAIN_ZOOM, tx, ty);
        terrainGroup.add(mesh);
      }
    }

    // Only rebuild roads when terrain tiles actually change (not every frame)
    if (roads.length > 0 && !onMoon) {
      rebuildRoadsWithTerrain();
      repositionBuildingsWithTerrain();
    }
  }
}

// Rebuild roads to follow current terrain elevation with improved conformance
function rebuildRoadsWithTerrain() {
  if (!terrainEnabled || roads.length === 0 || onMoon) return;

  // Disable debug mode before rebuild to prevent stuck materials
  if (roadDebugMode && typeof disableRoadDebugMode === 'function') {
    disableRoadDebugMode();
  }

  // Check if terrain tiles are loaded
  let tilesLoaded = 0;
  let tilesTotal = 0;
  terrainTileCache.forEach(tile => {
    tilesTotal++;
    if (tile.loaded) tilesLoaded++;
  });

  if (tilesLoaded === 0 || tilesTotal === 0) return;

  // OPTIMIZATION: Only clear height cache if road count changed (roads added/removed)
  // Otherwise keep cached heights for better performance
  const roadCountChanged = roads.length !== terrain._lastRoadCount;
  if (roadCountChanged) {
    clearTerrainHeightCache();
    terrain._lastRoadCount = roads.length;
  }

  // Remove old road meshes
  roadMeshes.forEach(m => {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  });
  roadMeshes = [];

  // OPTIMIZATION: Cache intersection detection - only recalculate if roads changed
  let intersections;
  if (roadCountChanged || !terrain._cachedIntersections) {
    intersections = detectRoadIntersections(roads);
    terrain._cachedIntersections = intersections;
  } else {
    intersections = terrain._cachedIntersections;
  }

  // Rebuild each road with improved terrain conformance
  roads.forEach((road, roadIdx) => {
    const { width } = road;
    const hw = width / 2;

    // Curvature-aware subdivision: straight = 2-5m, curves = 0.5-2m
    const pts = subdivideRoadPoints(road.pts, 3.5);

    const verts = [], indices = [];
    const leftEdge = [], rightEdge = [];

    // First pass: sample terrain heights at center of each road point
    const centerHeights = new Float64Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      centerHeights[i] = cachedTerrainHeight(pts[i].x, pts[i].z);
    }

    // OPTIMIZATION: Smooth center heights to eliminate stair-stepping (reduced from 3 to 1 pass)
    for (let pass = 0; pass < 1; pass++) {
      for (let i = 1; i < pts.length - 1; i++) {
        centerHeights[i] = centerHeights[i] * 0.6 +
          (centerHeights[i - 1] + centerHeights[i + 1]) * 0.2;
      }
    }

    // Build road strip with DIRECT edge snapping (not tilt from center)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];

      // Calculate tangent direction
      let dx, dz;
      if (i === 0) {
        dx = pts[1].x - p.x;
        dz = pts[1].z - p.z;
      } else if (i === pts.length - 1) {
        dx = p.x - pts[i-1].x;
        dz = p.z - pts[i-1].z;
      } else {
        dx = pts[i+1].x - pts[i-1].x;
        dz = pts[i+1].z - pts[i-1].z;
      }

      const len = Math.sqrt(dx*dx + dz*dz) || 1;
      const nx = -dz / len, nz = dx / len; // Perpendicular (left direction)

      // Calculate left and right edge positions
      const leftX = p.x + nx * hw;
      const leftZ = p.z + nz * hw;
      const rightX = p.x - nx * hw;
      const rightZ = p.z - nz * hw;

      // DIRECTLY snap BOTH edges to terrain (no tilt clamping!)
      let leftY = cachedTerrainHeight(leftX, leftZ);
      let rightY = cachedTerrainHeight(rightX, rightZ);

      // Add vertical bias to prevent z-fighting and terrain peeking
      // Increased from 0.10 to 0.25 to handle steep slopes
      const verticalBias = 0.25; // 25cm above terrain
      leftY += verticalBias;
      rightY += verticalBias;

      // Store edge vertices (will be smoothed later)
      leftEdge.push({ x: leftX, y: leftY, z: leftZ });
      rightEdge.push({ x: rightX, y: rightY, z: rightZ });
    }

    // OPTIMIZATION: Smooth edge heights to eliminate micro-bumps (reduced from 2 to 1 pass)
    // This prevents terrain from poking through at vertices
    for (let pass = 0; pass < 1; pass++) {
      for (let i = 1; i < leftEdge.length - 1; i++) {
        leftEdge[i].y = leftEdge[i].y * 0.6 + (leftEdge[i-1].y + leftEdge[i+1].y) * 0.2;
        rightEdge[i].y = rightEdge[i].y * 0.6 + (rightEdge[i-1].y + rightEdge[i+1].y) * 0.2;
      }
    }

    // Now push smoothed vertices to geometry
    for (let i = 0; i < leftEdge.length; i++) {
      verts.push(leftEdge[i].x, leftEdge[i].y, leftEdge[i].z);
      verts.push(rightEdge[i].x, rightEdge[i].y, rightEdge[i].z);

      // Create quad indices
      if (i < leftEdge.length - 1) {
        const vi = i * 2;
        indices.push(vi, vi+1, vi+2, vi+1, vi+3, vi+2);
      }
    }

    // Build main road mesh
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    // Road material with improved polygon offset
    const roadMat = (typeof asphaltTex !== 'undefined' && asphaltTex) ? new THREE.MeshStandardMaterial({
      map: asphaltTex,
      normalMap: asphaltNormal || undefined,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: asphaltRoughness || undefined,
      roughness: 0.95,
      metalness: 0.05,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      depthWrite: true,
      depthTest: true
    }) : new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.95,
      metalness: 0.05,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      depthWrite: true,
      depthTest: true
    });

    const mesh = new THREE.Mesh(geo, roadMat);
    mesh.renderOrder = 2;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.roadIdx = roadIdx;
    scene.add(mesh);
    roadMeshes.push(mesh);

    // Build road skirts (edge curtains) to hide terrain peeking
    // Increased depth from 1.5 to 3.0 for better coverage on steep slopes
    const skirtData = buildRoadSkirts(leftEdge, rightEdge, 3.0);
    if (skirtData.verts.length > 0) {
      const skirtGeo = new THREE.BufferGeometry();
      skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(skirtData.verts, 3));
      skirtGeo.setIndex(skirtData.indices);
      skirtGeo.computeVertexNormals();

      // Skirt material (same as road, slightly darker)
      const skirtMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.95,
        metalness: 0.05,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });

      const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
      skirtMesh.renderOrder = 1;
      skirtMesh.receiveShadow = true;
      skirtMesh.frustumCulled = false;
      skirtMesh.userData.isRoadSkirt = true;
      skirtMesh.userData.roadIdx = roadIdx;
      scene.add(skirtMesh);
      roadMeshes.push(skirtMesh);
    }
  });

  // Build intersection cap patches
  intersections.forEach(intersection => {
    // FIXED: Reduced radius from 0.7 to 0.5 to prevent bulging beyond road edges
    // Use average width instead of max to better fit the actual intersection
    const avgWidth = intersection.roads.reduce((sum, r) => sum + r.width, 0) / intersection.roads.length;
    const radius = avgWidth * 0.5; // Tighter fit - half the average road width
    const capData = buildIntersectionCap(intersection.x, intersection.z, radius, 24);

    const capGeo = new THREE.BufferGeometry();
    capGeo.setAttribute('position', new THREE.Float32BufferAttribute(capData.verts, 3));
    capGeo.setIndex(capData.indices);
    capGeo.computeVertexNormals();

    // Intersection cap material (slightly brighter than roads to stand out)
    const capMat = (typeof asphaltTex !== 'undefined' && asphaltTex) ? new THREE.MeshStandardMaterial({
      map: asphaltTex,
      normalMap: asphaltNormal || undefined,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: asphaltRoughness || undefined,
      roughness: 0.95,
      metalness: 0.05,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      depthWrite: true,
      depthTest: true
    }) : new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      roughness: 0.95,
      metalness: 0.05,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      depthWrite: true,
      depthTest: true
    });

    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.renderOrder = 3;
    capMesh.receiveShadow = true;
    capMesh.frustumCulled = false;
    capMesh.userData.isIntersectionCap = true;
    scene.add(capMesh);
    roadMeshes.push(capMesh);
  });

  roadsNeedRebuild = false;

  // Run validation if enabled
  if (typeof validateRoadTerrainConformance === 'function') {
    setTimeout(() => validateRoadTerrainConformance(), 100);
  }
}

function reprojectWaterwayMeshToTerrain(mesh) {
  const centerline = mesh.userData?.waterwayCenterline;
  if (!centerline || centerline.length < 2) return false;

  const width = mesh.userData?.waterwayWidth || 6;
  const halfWidth = width * 0.5;
  const verticalBias = Number.isFinite(mesh.userData?.waterwayBias) ? mesh.userData.waterwayBias : 0.08;
  const positions = mesh.geometry?.attributes?.position;
  if (!positions || positions.count < centerline.length * 2) return false;

  for (let i = 0; i < centerline.length; i++) {
    const p = centerline[i];

    let dx, dz;
    if (i === 0) {
      dx = centerline[1].x - p.x;
      dz = centerline[1].z - p.z;
    } else if (i === centerline.length - 1) {
      dx = p.x - centerline[i - 1].x;
      dz = p.z - centerline[i - 1].z;
    } else {
      dx = centerline[i + 1].x - centerline[i - 1].x;
      dz = centerline[i + 1].z - centerline[i - 1].z;
    }

    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;

    const leftX = p.x + nx * halfWidth;
    const leftZ = p.z + nz * halfWidth;
    const rightX = p.x - nx * halfWidth;
    const rightZ = p.z - nz * halfWidth;
    const leftY = terrainMeshHeightAt(leftX, leftZ) + verticalBias;
    const rightY = terrainMeshHeightAt(rightX, rightZ) + verticalBias;

    positions.setXYZ(i * 2, leftX, leftY, leftZ);
    positions.setXYZ(i * 2 + 1, rightX, rightY, rightZ);
  }

  positions.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  return true;
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

    const fallbackElevation = Number.isFinite(mesh.userData?.avgElevation)
      ? mesh.userData.avgElevation
      : 0;

    // Use minimum elevation of footprint corners so building sits on terrain.
    // Prefer terrain mesh samples; if unavailable, fall back to base elevation
    // model to avoid buildings popping/floating while tiles stream in.
    let minElevation = Infinity;
    let sampleCount = 0;
    pts.forEach(p => {
      let h = terrainMeshHeightAt(p.x, p.z);
      if ((!Number.isFinite(h) || h === 0) && typeof elevationWorldYAtWorldXZ === 'function') {
        h = elevationWorldYAtWorldXZ(p.x, p.z);
      }
      if (h === 0 && Math.abs(fallbackElevation) > 2) h = fallbackElevation;
      if (!Number.isFinite(h)) return;
      minElevation = Math.min(minElevation, h);
      sampleCount++;
    });
    if (!Number.isFinite(minElevation) || sampleCount === 0) {
      minElevation = Number.isFinite(fallbackElevation) ? fallbackElevation : 0;
    }

    mesh.position.y = minElevation;
    buildingsRepositioned++;
  });

  // Reposition landuse areas - deform vertices to follow terrain mesh surface
  landuseMeshes.forEach(mesh => {
    if (mesh.userData?.isWaterwayLine) {
      if (reprojectWaterwayMeshToTerrain(mesh)) landuseRepositioned++;
      return;
    }

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
      const isWaterPolygon = mesh.userData?.landuseType === 'water';
      const flattenFactor = isWaterPolygon
        ? (Number.isFinite(mesh.userData?.waterFlattenFactor) ? mesh.userData.waterFlattenFactor : 0.12)
        : 1.0;
      const vertexOffset = isWaterPolygon ? 0.08 : 0.05;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const tY = terrainMeshHeightAt(x, z);
        positions.setY(i, ((tY - avgElevation) * flattenFactor) + vertexOffset);
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

// =====================
// ROAD DEBUG MODE
// Toggle with 'R' key to visualize road-terrain conformance issues
// =====================
let roadDebugMode = false;
let roadDebugMeshes = [];

// Force disable debug mode and restore materials (useful if stuck)
function disableRoadDebugMode() {
  if (!roadDebugMode) return;

  roadDebugMode = false;

  // Clear debug meshes
  roadDebugMeshes.forEach(m => {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  });
  roadDebugMeshes = [];

  // DISABLED: Terrain materials are no longer overridden in debug mode
  // No need to restore them
  /*
  if (terrainGroup) {
    terrainGroup.children.forEach(mesh => {
      if (mesh.userData._originalMaterial) {
        mesh.material.dispose();
        mesh.material = mesh.userData._originalMaterial;
        delete mesh.userData._originalMaterial;
      }
    });
  }
  */

  // Restore original road materials
  roadMeshes.forEach(mesh => {
    if (mesh.userData._originalMaterial) {
      mesh.material.dispose();
      mesh.material = mesh.userData._originalMaterial;
      delete mesh.userData._originalMaterial;
    }
  });

  console.log('🔍 Road Debug Mode FORCE DISABLED - Materials restored');
}

function toggleRoadDebugMode() {
  roadDebugMode = !roadDebugMode;

  // Clear existing debug meshes
  roadDebugMeshes.forEach(m => {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  });
  roadDebugMeshes = [];

  if (roadDebugMode) {
    console.log('🔍 Road Debug Mode ENABLED');

    // DISABLED: Do NOT override terrain materials - keep grass visible
    // Users complained grass disappeared in debug mode
    // Terrain stays normal, only roads are highlighted
    /*
    if (terrainGroup) {
      terrainGroup.children.forEach(mesh => {
        if (!mesh.userData._originalMaterial) {
          mesh.userData._originalMaterial = mesh.material;
        }
        mesh.material = new THREE.MeshBasicMaterial({
          color: 0x00ff00, // Green terrain
          wireframe: false
        });
      });
    }
    */

    // Override road materials with solid color
    roadMeshes.forEach(mesh => {
      if (mesh.userData.isRoadSkirt || mesh.userData.isIntersectionCap) return;

      if (!mesh.userData._originalMaterial) {
        mesh.userData._originalMaterial = mesh.material;
      }
      mesh.material = new THREE.MeshBasicMaterial({
        color: 0xff0000, // Red roads
        side: THREE.DoubleSide
      });
    });

    // Draw road edge lines and sample points
    roadMeshes.forEach(mesh => {
      if (mesh.userData.isRoadSkirt || mesh.userData.isIntersectionCap) return;

      const pos = mesh.geometry.attributes.position;
      if (!pos) return;

      // Extract edge points
      const points = [];
      for (let i = 0; i < pos.count; i += 2) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        points.push(new THREE.Vector3(x, y + 0.5, z));
      }

      // Draw yellow line along edge
      if (points.length > 1) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
        const line = new THREE.Line(lineGeo, lineMat);
        scene.add(line);
        roadDebugMeshes.push(line);
      }

      // Draw sample point spheres every 10 points
      for (let i = 0; i < points.length; i += 10) {
        const sphereGeo = new THREE.SphereGeometry(0.3, 8, 8);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.copy(points[i]);
        scene.add(sphere);
        roadDebugMeshes.push(sphere);
      }
    });

    // Highlight problem areas (road below terrain)
    roadMeshes.forEach(mesh => {
      if (mesh.userData.isRoadSkirt || mesh.userData.isIntersectionCap) return;

      const pos = mesh.geometry.attributes.position;
      if (!pos) return;

      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const terrainY = terrainMeshHeightAt(x, z);
        const delta = y - terrainY;

        // Flag if road is significantly below terrain
        if (delta < -0.05) {
          const markerGeo = new THREE.BoxGeometry(0.5, 2, 0.5);
          const markerMat = new THREE.MeshBasicMaterial({ color: 0xff00ff }); // Magenta warning
          const marker = new THREE.Mesh(markerGeo, markerMat);
          marker.position.set(x, y + 1, z);
          scene.add(marker);
          roadDebugMeshes.push(marker);
        }
      }
    });

  } else {
    console.log('🔍 Road Debug Mode DISABLED');

    // DISABLED: Terrain materials are never overridden now, so nothing to restore
    /*
    if (terrainGroup) {
      terrainGroup.children.forEach(mesh => {
        if (mesh.userData._originalMaterial) {
          mesh.material = mesh.userData._originalMaterial;
          delete mesh.userData._originalMaterial;
        }
      });
    }
    */

    // Restore original road materials
    roadMeshes.forEach(mesh => {
      if (mesh.userData._originalMaterial) {
        mesh.material = mesh.userData._originalMaterial;
        delete mesh.userData._originalMaterial;
      }
    });
  }
}

// =====================
// ROAD-TERRAIN CONFORMANCE VALIDATOR
// Automated runtime checks for road-terrain alignment
// =====================

function validateRoadTerrainConformance() {
  if (!terrainEnabled || roads.length === 0 || onMoon) return;

  console.log('🔬 Validating road-terrain conformance...');

  let totalSamples = 0;
  let issuesFound = 0;
  const worstDeltas = [];

  roadMeshes.forEach((mesh, meshIdx) => {
    if (mesh.userData.isRoadSkirt || mesh.userData.isIntersectionCap) return;

    const pos = mesh.geometry.attributes.position;
    if (!pos) return;

    const roadIdx = mesh.userData.roadIdx;
    const road = roads[roadIdx];
    if (!road) return;

    // Sample every 5th vertex (performance)
    for (let i = 0; i < pos.count; i += 5) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      const terrainY = terrainMeshHeightAt(x, z);
      const delta = y - terrainY;

      totalSamples++;

      // Flag issues
      if (delta < -0.05) {
        issuesFound++;
        const { lat, lon } = worldToLatLon(x, z);
        worstDeltas.push({
          roadName: road.name || `Road ${roadIdx}`,
          delta: delta.toFixed(3),
          lat: lat.toFixed(6),
          lon: lon.toFixed(6),
          worldPos: `(${x.toFixed(1)}, ${z.toFixed(1)})`
        });
      }
    }
  });

  // Sort by worst delta
  worstDeltas.sort((a, b) => parseFloat(a.delta) - parseFloat(b.delta));

  console.log(`✅ Validation complete: ${totalSamples} samples checked`);

  if (issuesFound > 0) {
    console.warn(`⚠️  Found ${issuesFound} points where road is below terrain (delta < -0.05)`);
    console.warn('Worst 10 deltas:');
    worstDeltas.slice(0, 10).forEach(d => {
      console.warn(`  ${d.roadName}: delta=${d.delta}m at ${d.worldPos} (${d.lat}, ${d.lon})`);
    });
  } else {
    console.log('✅ No issues found - all roads conform to terrain!');
  }

  // Check for gaps at intersections
  const intersections = detectRoadIntersections(roads);
  console.log(`📍 Detected ${intersections.length} intersections`);

  return {
    totalSamples,
    issuesFound,
    worstDeltas: worstDeltas.slice(0, 10),
    intersectionCount: intersections.length
  };
}

Object.assign(globalThis, {
  applyHeightsToTerrainMesh,
  buildRoadSkirts,
  buildTerrainTileMesh,
  cachedTerrainHeight,
  clearTerrainHeightCache,
  clearTerrainMeshes,
  decodeTerrariumRGB,
  detectRoadIntersections,
  elevationMetersAtLatLon,
  elevationWorldYAtWorldXZ,
  ensureTerrainGroup,
  getOrLoadTerrainTile,
  latLonToTileXY,
  rebuildRoadsWithTerrain,
  repositionBuildingsWithTerrain,
  resetTerrainStreamingState,
  sampleTileElevationMeters,
  terrainMeshHeightAt,
  tileXYToLatLonBounds,
  updateTerrainAround,
  validateRoadTerrainConformance,
  worldToLatLon
});

export {
  applyHeightsToTerrainMesh,
  buildRoadSkirts,
  buildTerrainTileMesh,
  cachedTerrainHeight,
  clearTerrainHeightCache,
  clearTerrainMeshes,
  decodeTerrariumRGB,
  detectRoadIntersections,
  elevationMetersAtLatLon,
  elevationWorldYAtWorldXZ,
  ensureTerrainGroup,
  getOrLoadTerrainTile,
  latLonToTileXY,
  rebuildRoadsWithTerrain,
  repositionBuildingsWithTerrain,
  resetTerrainStreamingState,
  sampleTileElevationMeters,
  terrainMeshHeightAt,
  tileXYToLatLonBounds,
  updateTerrainAround,
  validateRoadTerrainConformance,
  worldToLatLon
};
