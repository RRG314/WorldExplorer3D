import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
// ground.js - Unified Ground Height Service
// Single source of truth for y(x,z) used by terrain, roads, and vehicles
// ============================================================================

const GroundHeight = {
  // Road surface sits this far above raw terrain (prevents z-fighting)
  ROAD_OFFSET: 0.2,

  // Finite-difference step for normal estimation (world units)
  NORMAL_SAMPLE_DIST: 2.0,

  // Road smoothing: number of passes when assigning road vertex heights
  ROAD_SMOOTH_PASSES: 2,
  ROAD_SMOOTH_ALPHA: 0.3,

  // --- reusable scratch vectors (allocated once) ---
  _normal: null,
  _roadRaycaster: null,
  _roadRayStart: null,
  _roadRayDir: null,
  _walkFeatureCache: null,

  _ensureVectors() {
    if (!this._normal && typeof THREE !== 'undefined') {
      this._normal = new THREE.Vector3(0, 1, 0);
    }
    if (!this._roadRaycaster && typeof THREE !== 'undefined') {
      this._roadRaycaster = new THREE.Raycaster();
      this._roadRayStart = new THREE.Vector3();
      this._roadRayDir = new THREE.Vector3(0, -1, 0);
    }
  },

  // -------------------------------------------------------------------------
  // Core height queries
  // -------------------------------------------------------------------------

  /**
   * Raw terrain height at world (x, z). Returns world-Y in engine units.
   * This is the authoritative terrain sample; everything else layers on top.
   */
  terrainY(x, z) {
    // Use terrain mesh grid sampling when available for accurate surface height
    if (typeof appCtx.terrainMeshHeightAt === 'function') {
      return appCtx.terrainMeshHeightAt(x, z);
    }
    return appCtx.elevationWorldYAtWorldXZ(x, z);
  },

  /**
   * Height the road surface should be at world (x, z).
   * = terrain + ROAD_OFFSET
   */
  roadSurfaceY(x, z) {
    return this.terrainY(x, z) + this.ROAD_OFFSET;
  },

  // Exact road mesh sample from rendered road geometry. Falls back to null if unavailable.
  roadMeshY(x, z) {
    if (typeof THREE === 'undefined') return null;
    if (!Array.isArray(appCtx.roadMeshes) || appCtx.roadMeshes.length === 0) return null;

    this._ensureVectors();
    if (!this._roadRaycaster || !this._roadRayStart || !this._roadRayDir) return null;

    this._roadRayStart.set(x, 1500, z);
    this._roadRaycaster.set(this._roadRayStart, this._roadRayDir);
    const hits = this._roadRaycaster.intersectObjects(appCtx.roadMeshes, false);
    if (!hits || hits.length === 0) return null;
    const y = hits[0]?.point?.y;
    return Number.isFinite(y) ? y : null;
  },

  linearFeatureMeshY(x, z) {
    if (typeof THREE === 'undefined') return null;
    if (!Array.isArray(appCtx.linearFeatureMeshes) || appCtx.linearFeatureMeshes.length === 0) return null;

    this._ensureVectors();
    if (!this._roadRaycaster || !this._roadRayStart || !this._roadRayDir) return null;

    this._roadRayStart.set(x, 1500, z);
    this._roadRaycaster.set(this._roadRayStart, this._roadRayDir);
    const hits = this._roadRaycaster.intersectObjects(appCtx.linearFeatureMeshes, false);
    if (!hits || hits.length === 0) return null;
    const y = hits[0]?.point?.y;
    return Number.isFinite(y) ? y : null;
  },

  _projectPointToFeature(feature, x, z) {
    if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2) return null;
    let best = null;
    for (let i = 0; i < feature.pts.length - 1; i++) {
      const p1 = feature.pts[i];
      const p2 = feature.pts[i + 1];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const len2 = dx * dx + dz * dz;
      if (len2 <= 1e-9) continue;
      let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = p1.x + dx * t;
      const pz = p1.z + dz * t;
      const dist = Math.hypot(x - px, z - pz);
      if (!best || dist < best.dist) {
        best = {
          dist,
          pt: { x: px, z: pz },
          segIndex: i
        };
      }
    }
    return best;
  },

  _nearestLinearWalkFeature(x, z) {
    if (!Array.isArray(appCtx.linearFeatures) || appCtx.linearFeatures.length === 0) {
      this._walkFeatureCache = null;
      return null;
    }

    const cachedFeature = this._walkFeatureCache?.feature || null;
    if (cachedFeature) {
      const cachedProjection = this._projectPointToFeature(cachedFeature, x, z);
      const reuseRadius = Math.max(4, (Number(cachedFeature.width) || 2) * 1.5 + 3);
      if (cachedProjection && cachedProjection.dist <= reuseRadius) {
        return {
          feature: cachedFeature,
          dist: cachedProjection.dist,
          pt: cachedProjection.pt,
          segIndex: cachedProjection.segIndex
        };
      }
    }

    if (typeof appCtx.findNearestTraversalFeature !== 'function') {
      this._walkFeatureCache = null;
      return null;
    }

    const nearest = appCtx.findNearestTraversalFeature(x, z, {
      mode: 'walk',
      maxDistance: 16
    });
    const feature = nearest?.feature || null;
    const kind = String(feature?.kind || feature?.networkKind || '').toLowerCase();
    if (!feature || kind === 'road') {
      this._walkFeatureCache = null;
      return null;
    }

    this._walkFeatureCache = { feature };
    return nearest;
  },

  walkSurfaceInfo(x, z) {
    const interiorSurface = typeof appCtx.sampleInteriorWalkSurface === 'function' ?
      appCtx.sampleInteriorWalkSurface(x, z) :
      null;
    if (interiorSurface && Number.isFinite(interiorSurface.y)) {
      return {
        y: interiorSurface.y,
        source: interiorSurface.source || 'interior',
        feature: interiorSurface.feature || null,
        dist: Number.isFinite(interiorSurface.dist) ? interiorSurface.dist : 0,
        pt: interiorSurface.pt ? { x: interiorSurface.pt.x, z: interiorSurface.pt.z } : null
      };
    }

    const terrainY = this.terrainY(x, z);
    const nr = typeof appCtx.findNearestRoad === 'function' ? appCtx.findNearestRoad(x, z) : null;
    const roadHW = nr?.road ? nr.road.width / 2 : 0;
    const roadOnSurface = !!(nr?.road && Number.isFinite(nr.dist) && nr.dist <= roadHW + 1.25);

    const linear = this._nearestLinearWalkFeature(x, z);
    const featureWidth = Number(linear?.feature?.width) || 0;
    const onLinear = !!(
      linear &&
      Number.isFinite(linear.dist) &&
      linear.dist <= Math.max(0.9, featureWidth * 0.5 + 0.8)
    );
    const preferLinear = !!(
      onLinear &&
      (!roadOnSurface || linear.dist <= (Number.isFinite(nr?.dist) ? nr.dist + 0.15 : Infinity))
    );

    if (preferLinear) {
      const feature = linear.feature;
      const sampleX = Number.isFinite(linear?.pt?.x) ? linear.pt.x : x;
      const sampleZ = Number.isFinite(linear?.pt?.z) ? linear.pt.z : z;
      const featureBias = Number.isFinite(feature?.surfaceBias) ?
        feature.surfaceBias :
        Number.isFinite(feature?.bias) ?
          feature.bias :
          0.05;
      const meshY = this.linearFeatureMeshY(sampleX, sampleZ);
      const baseY = this.terrainY(sampleX, sampleZ);
      return {
        y: Number.isFinite(meshY) ? meshY : baseY + featureBias + 0.02,
        source: String(feature?.kind || feature?.networkKind || 'path'),
        feature,
        dist: linear.dist,
        pt: linear.pt ? { x: linear.pt.x, z: linear.pt.z } : null
      };
    }

    if (roadOnSurface) {
      const sampleX = Number.isFinite(nr?.pt?.x) ? nr.pt.x : x;
      const sampleZ = Number.isFinite(nr?.pt?.z) ? nr.pt.z : z;
      const roadY = this.roadMeshY(sampleX, sampleZ);
      return {
        y: Number.isFinite(roadY) ? roadY : this.roadSurfaceY(sampleX, sampleZ) + 0.05,
        source: 'road',
        feature: nr.road,
        dist: nr.dist,
        pt: nr.pt ? { x: nr.pt.x, z: nr.pt.z } : null
      };
    }

    return {
      y: terrainY,
      source: 'terrain',
      feature: null,
      dist: Infinity,
      pt: null
    };
  },

  walkSurfaceY(x, z) {
    return this.walkSurfaceInfo(x, z).y;
  },

  // Ground used for driving. Prefer exact road mesh height when available.
  driveSurfaceY(x, z, preferRoad = true) {
    if (preferRoad) {
      const roadY = this.roadMeshY(x, z);
      if (Number.isFinite(roadY)) return roadY;
    }
    return this.terrainY(x, z);
  },

  // Standard car center Y (car origin), derived from surface height.
  carCenterY(x, z, preferRoad = true, centerHeight = 1.2) {
    const surfaceY = this.driveSurfaceY(x, z, preferRoad);
    return surfaceY + centerHeight;
  },

  /**
   * Full ground query used by vehicles / physics.
   * Returns {y, normal, source:'road'|'terrain', roadDist, road, roadPt}
   *
   * `normal` is written into an internal vector; clone it if you need to keep it.
   */
  sample(x, z) {
    this._ensureVectors();

    const tY = this.terrainY(x, z);
    const nr = appCtx.findNearestRoad(x, z);
    const roadHW = nr.road ? nr.road.width / 2 : 0;

    let y, source;
    if (nr.road && nr.dist < roadHW + 1.5) {
      // On a road
      y = tY + this.ROAD_OFFSET + 0.05; // tiny extra clearance above road mesh
      source = 'road';
    } else {
      y = tY + 0.15; // ground clearance for off-road
      source = 'terrain';
    }

    const normal = this._computeNormal(x, z);

    return {
      y,
      normal,
      source,
      roadDist: nr.dist,
      road: nr.road,
      roadPt: nr.pt ? { x: nr.pt.x, z: nr.pt.z } : null
    };
  },

  // -------------------------------------------------------------------------
  // Ground normal via central finite differences
  // -------------------------------------------------------------------------
  _computeNormal(x, z) {
    if (!this._normal) {
      this._ensureVectors();
      if (!this._normal) return new THREE.Vector3(0, 1, 0);
    }

    const d = this.NORMAL_SAMPLE_DIST;
    const hL = this.terrainY(x - d, z);
    const hR = this.terrainY(x + d, z);
    const hD = this.terrainY(x, z + d);
    const hU = this.terrainY(x, z - d);

    // tangent vectors: T_x = (2d, hR-hL, 0),  T_z = (0, hU-hD, 2d)
    // normal = T_x x T_z
    this._normal.set(
      hL - hR,
      2 * d,
      hD - hU
    ).normalize();

    return this._normal;
  },

  // -------------------------------------------------------------------------
  // Road vertex smoothing helper
  // Smooths an array of Y values along a polyline to reduce stair-stepping.
  // -------------------------------------------------------------------------
  smoothRoadHeights(yArray, passes, alpha) {
    passes = passes || this.ROAD_SMOOTH_PASSES;
    alpha = alpha || this.ROAD_SMOOTH_ALPHA;
    const n = yArray.length;
    if (n < 3) return yArray;

    for (let p = 0; p < passes; p++) {
      for (let i = 1; i < n - 1; i++) {
        yArray[i] = yArray[i] * (1 - alpha) +
        (yArray[i - 1] + yArray[i + 1]) * 0.5 * alpha;
      }
    }
    return yArray;
  },

  // -------------------------------------------------------------------------
  // Invalidation (call when terrain tiles change)
  // -------------------------------------------------------------------------
  invalidate() {
    this._walkFeatureCache = null;
    // Currently stateless per-call; placeholder for future caching.
  } };
Object.assign(appCtx, { GroundHeight });

export { GroundHeight };
