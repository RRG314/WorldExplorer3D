import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import {
  isRoadSurfaceReachable,
  roadBehavesGradeSeparated,
  retainRoadSurfaceContact,
  shouldLockRetainedRoadContact,
  sampleFeatureSurfaceY
} from "./structure-semantics.js?v=26";
// ground.js - Unified Ground Height Service
// Single source of truth for y(x,z) used by terrain, roads, and vehicles
// ============================================================================

const DRIVE_ROAD_RETAIN_OPTIONS = Object.freeze({
  extraLateralPadding: 0.95,
  extraVerticalAllowance: 1.45,
  minimumRetentionVerticalDelta: 6.2
});

const DRIVE_ROAD_REACHABILITY_OPTIONS = Object.freeze({
  extraVerticalAllowance: 0.7
});

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
  _roadSurfaceMeshes: null,
  _roadSurfaceMeshSource: null,
  _roadSurfaceMeshCount: 0,

  _preferredRoadForSampling() {
    return appCtx.car?.road || appCtx.car?._lastStableRoad || null;
  },

  _retainedRoadSurface(currentRoad, x, z, currentY = NaN) {
    const speed = Math.abs(Number(appCtx.car?.speed || 0));
    const speedRetentionBlend = Math.max(0, Math.min(1, (speed - 6) / 20));
    return retainRoadSurfaceContact(currentRoad, x, z, currentY, {
      extraLateralPadding:
        DRIVE_ROAD_RETAIN_OPTIONS.extraLateralPadding +
        speedRetentionBlend * 0.85,
      extraVerticalAllowance:
        DRIVE_ROAD_RETAIN_OPTIONS.extraVerticalAllowance +
        speedRetentionBlend * 0.35,
      minimumRetentionVerticalDelta:
        DRIVE_ROAD_RETAIN_OPTIONS.minimumRetentionVerticalDelta +
        speedRetentionBlend * 0.75
    });
  },

  _shouldLockRetainedRoadSurface(retainedRoad) {
    return shouldLockRetainedRoadContact(retainedRoad);
  },

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

  _raycastMeshY(objects, x, z, startY, maxDrop = Infinity) {
    if (typeof THREE === 'undefined') return null;
    if (!Array.isArray(objects) || objects.length === 0) return null;
    if (!Number.isFinite(startY)) return null;

    this._ensureVectors();
    if (!this._roadRaycaster || !this._roadRayStart || !this._roadRayDir) return null;

    this._roadRayStart.set(x, startY, z);
    this._roadRaycaster.set(this._roadRayStart, this._roadRayDir);
    this._roadRaycaster.far = Number.isFinite(maxDrop) ? Math.max(0.1, maxDrop) : Infinity;
    const hits = this._roadRaycaster.intersectObjects(objects, false);
    this._roadRaycaster.far = Infinity;
    if (!hits || hits.length === 0) return null;
    const y = hits[0]?.point?.y;
    return Number.isFinite(y) ? y : null;
  },

  _shouldUseRoadMeshHeight(road, meshY, profileY, roadSample = null) {
    if (!Number.isFinite(meshY)) return false;
    if (!Number.isFinite(profileY)) return true;
    const delta = Math.abs(meshY - profileY);
    const semantics = road?.structureSemantics || null;
    const gradeSeparatedLike =
      semantics?.terrainMode === 'elevated' ||
      semantics?.terrainMode === 'subgrade' ||
      roadBehavesGradeSeparated(road);
    const hasTransitionAnchors = Array.isArray(road?.structureTransitionAnchors) && road.structureTransitionAnchors.length > 0;
    const nearTransitionZone =
      Number.isFinite(roadSample?.distanceToTransitionZone) &&
      roadSample.distanceToTransitionZone <= (semantics?.rampCandidate ? 6.5 : 4.2);
    const nearEndpoint =
      Number.isFinite(roadSample?.distanceToEndpoint) &&
      roadSample.distanceToEndpoint <= (semantics?.rampCandidate ? 16 : 10);
    const transitionSensitive =
      (semantics?.rampCandidate || hasTransitionAnchors || gradeSeparatedLike) &&
      (nearTransitionZone || nearEndpoint);

    if (transitionSensitive) {
      const transitionDelta =
        semantics?.rampCandidate ? 0.2 :
        gradeSeparatedLike ? 0.26 :
        hasTransitionAnchors ? 0.22 :
        0.35;
      return delta <= transitionDelta;
    }
    if (meshY > profileY && (semantics?.rampCandidate || hasTransitionAnchors)) {
      return delta <= 0.35;
    }
    if (meshY > profileY && gradeSeparatedLike) {
      return delta <= 0.55;
    }
    if (meshY > profileY && (semantics?.terrainMode === 'elevated' || semantics?.terrainMode === 'subgrade')) {
      return delta <= 0.75;
    }
    if (delta <= 0.65) return true;
    return false;
  },

  _getRoadSurfaceMeshes() {
    const source = Array.isArray(appCtx.roadMeshes) ? appCtx.roadMeshes : null;
    if (!source) return null;
    if (this._roadSurfaceMeshSource !== source || this._roadSurfaceMeshCount !== source.length) {
      this._roadSurfaceMeshSource = source;
      this._roadSurfaceMeshCount = source.length;
      this._roadSurfaceMeshes = source.filter((mesh) => mesh && mesh.userData?.isRoadSkirt !== true);
    }
    return this._roadSurfaceMeshes;
  },

  resolveDriveRoadContact(x, z, currentY = NaN, options = {}) {
    const preferredRoad =
      options?.preferredRoad !== undefined ?
        options.preferredRoad :
        this._preferredRoadForSampling();
    const retained = this._retainedRoadSurface(preferredRoad, x, z, currentY);
    const lockedRetained = this._shouldLockRetainedRoadSurface(retained);
    const nearestRoad =
      options?.nearestRoad ||
      (typeof appCtx.findNearestRoad === 'function' ? appCtx.findNearestRoad(x, z, {
        y: Number.isFinite(currentY) ? currentY : NaN,
        maxVerticalDelta: 18,
        preferredRoad
      }) : null);
    const roadReachable = isRoadSurfaceReachable(nearestRoad, {
      currentRoad: preferredRoad,
      ...DRIVE_ROAD_REACHABILITY_OPTIONS
    });

    let resolved = nearestRoad;
    let onRoad = roadReachable;
    if (lockedRetained && retained) {
      resolved = retained;
      onRoad = true;
    } else if (!onRoad && retained) {
      resolved = retained;
      onRoad = true;
    } else if (onRoad && retained && nearestRoad?.road !== preferredRoad && this._shouldLockRetainedRoadSurface(retained)) {
      resolved = retained;
      onRoad = true;
    }

    if (!resolved?.pt) {
      if (retained?.pt) resolved = { ...resolved, pt: { x: retained.pt.x, z: retained.pt.z } };
      else if (nearestRoad) resolved = { ...nearestRoad, pt: nearestRoad.pt ? { x: nearestRoad.pt.x, z: nearestRoad.pt.z } : { x, z } };
    }

    return {
      preferredRoad,
      retained,
      lockedRetained,
      nearestRoad,
      resolved,
      onRoad: !!onRoad,
      road: resolved?.road || null
    };
  },

  // Exact road mesh sample from rendered road geometry. Falls back to null if unavailable.
  roadMeshY(x, z, currentY = NaN, options = {}) {
    const roadSurfaceMeshes = this._getRoadSurfaceMeshes();
    const roadState = options?.roadState || this.resolveDriveRoadContact(x, z, currentY);
    const retained = roadState.retained;
    if (roadState.lockedRetained && Number.isFinite(retained?.y)) {
      const localStartY = Number.isFinite(currentY) ? currentY + 5.5 : retained.y + 6;
      const localMeshY = this._raycastMeshY(roadSurfaceMeshes, x, z, localStartY, 26);
      if (this._shouldUseRoadMeshHeight(retained?.road, localMeshY, retained?.y, retained)) {
        return Math.max(retained.y, localMeshY);
      }
      return retained.y;
    }
    const nearestRoad = roadState.resolved;
    const roadReachable = roadState.onRoad;

    if (roadReachable && Number.isFinite(currentY)) {
      const localStartY = currentY + 5.5;
      const localMeshY = this._raycastMeshY(roadSurfaceMeshes, x, z, localStartY, 26);
      if (Number.isFinite(localMeshY)) {
        const profileY = Number(nearestRoad?.y);
        if (this._shouldUseRoadMeshHeight(nearestRoad?.road, localMeshY, profileY, nearestRoad)) {
          return Number.isFinite(profileY) ? Math.max(profileY, localMeshY) : localMeshY;
        }
      }
    }

    if (roadReachable && Number.isFinite(nearestRoad?.y)) {
      return nearestRoad.y;
    }

    if (retained && Number.isFinite(retained.y)) {
      return retained.y;
    }

    const fallbackStartY = Number.isFinite(currentY) ? currentY + 20 : 1500;
    const fallbackDrop = Number.isFinite(currentY) ? 80 : Infinity;
    const worldMeshY = this._raycastMeshY(roadSurfaceMeshes, x, z, fallbackStartY, fallbackDrop);
    if (Number.isFinite(worldMeshY)) return worldMeshY;

    if (typeof appCtx.findNearestRoad === 'function') {
      const fallbackRoad = appCtx.findNearestRoad(x, z, {
        y: Number.isFinite(currentY) ? currentY : NaN,
        maxVerticalDelta: 16,
        preferredRoad: roadState.preferredRoad
      });
      if (isRoadSurfaceReachable(fallbackRoad, {
        currentRoad: roadState.preferredRoad,
        ...DRIVE_ROAD_REACHABILITY_OPTIONS
      }) && Number.isFinite(fallbackRoad?.y)) {
        return fallbackRoad.y;
      }
    }
    return null;
  },

  linearFeatureMeshY(x, z) {
    return this._raycastMeshY(appCtx.linearFeatureMeshes, x, z, 1500, Infinity);
  },

  urbanSurfaceMeshY(x, z) {
    return this._raycastMeshY(appCtx.urbanSurfaceMeshes, x, z, 1500, Infinity);
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

  walkSurfaceInfo(x, z, currentY = NaN) {
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
    const nr = typeof appCtx.findNearestRoad === 'function' ? appCtx.findNearestRoad(x, z, {
      y: Number.isFinite(currentY) ? currentY : NaN,
      maxVerticalDelta: 14
    }) : null;
    const roadOnSurface = isRoadSurfaceReachable(nr, {
      currentRoad: null,
      extraLateralPadding: -0.1
    });
    const urbanSurfaceY = this.urbanSurfaceMeshY(x, z);
    const onUrbanSurface = Number.isFinite(urbanSurfaceY) && urbanSurfaceY > terrainY + 0.12;

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
      const sampledY = sampleFeatureSurfaceY(feature, sampleX, sampleZ, linear);
      const meshY = Number.isFinite(sampledY) ? sampledY : this.linearFeatureMeshY(sampleX, sampleZ);
      const baseY = this.terrainY(sampleX, sampleZ);
      return {
        y: Number.isFinite(meshY) ? meshY : baseY + featureBias + 0.02,
        source: String(feature?.kind || feature?.networkKind || 'path'),
        feature,
        dist: linear.dist,
        pt: linear.pt ? { x: linear.pt.x, z: linear.pt.z } : null
      };
    }

    if (onUrbanSurface) {
      return {
        y: urbanSurfaceY + 0.02,
        source: 'urban_surface',
        feature: null,
        dist: 0,
        pt: { x, z }
      };
    }

    if (roadOnSurface) {
      const sampleX = Number.isFinite(nr?.pt?.x) ? nr.pt.x : x;
      const sampleZ = Number.isFinite(nr?.pt?.z) ? nr.pt.z : z;
      const meshY = this.roadMeshY(sampleX, sampleZ, currentY, {
        roadState: {
          preferredRoad: null,
          retained: null,
          lockedRetained: false,
          nearestRoad: nr,
          resolved: nr,
          onRoad: true,
          road: nr?.road || null
        }
      });
      const roadY =
        this._shouldUseRoadMeshHeight(nr?.road, meshY, nr?.y, nr) ?
          Math.max(Number.isFinite(nr?.y) ? nr.y : -Infinity, meshY) :
        Number.isFinite(nr?.y) ? nr.y :
          meshY;
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

  walkSurfaceY(x, z, currentY = NaN) {
    return this.walkSurfaceInfo(x, z, currentY).y;
  },

  // Ground used for driving. Prefer exact road mesh height when available.
  driveSurfaceY(x, z, preferRoad = true, currentY = NaN, options = {}) {
    let roadPreference = preferRoad;
    let sampleY = currentY;
    let sampleOptions = options;
    // Backward compatibility: older callers passed the current Y as the third argument.
    if (typeof roadPreference === 'number' && arguments.length < 4) {
      sampleY = roadPreference;
      roadPreference = true;
      sampleOptions = {};
    }
    if (roadPreference || this._preferredRoadForSampling()) {
      const roadState = sampleOptions?.roadState || this.resolveDriveRoadContact(x, z, sampleY);
      const roadContact = roadState.resolved;
      if (roadState.lockedRetained && Number.isFinite(roadState.retained?.y)) {
        return roadState.retained.y;
      }
      if (roadState.onRoad && roadContact) {
        const sampleX = Number.isFinite(roadContact?.pt?.x) ? roadContact.pt.x : x;
        const sampleZ = Number.isFinite(roadContact?.pt?.z) ? roadContact.pt.z : z;
        const meshY = this.roadMeshY(sampleX, sampleZ, sampleY, { roadState });
        if (this._shouldUseRoadMeshHeight(roadContact?.road, meshY, roadContact?.y, roadContact)) {
          return Math.max(Number.isFinite(roadContact?.y) ? roadContact.y : -Infinity, meshY);
        }
        if (Number.isFinite(roadContact?.y)) {
          return roadContact.y;
        }
      }
      if (roadState.retained && Number.isFinite(roadState.retained.y)) {
        const meshY = this.roadMeshY(roadState.retained.pt.x, roadState.retained.pt.z, sampleY, { roadState });
        if (this._shouldUseRoadMeshHeight(roadState.retained.road, meshY, roadState.retained.y, roadState.retained)) {
          return Math.max(roadState.retained.y, meshY);
        }
        return roadState.retained.y;
      }
    }
    return this.terrainY(x, z);
  },

  // Standard car center Y (car origin), derived from surface height.
  carCenterY(x, z, preferRoad = true, centerHeight = 1.2, currentY = NaN) {
    const surfaceY = this.driveSurfaceY(x, z, preferRoad, currentY);
    return surfaceY + centerHeight;
  },

  /**
   * Full ground query used by vehicles / physics.
   * Returns {y, normal, source:'road'|'terrain', roadDist, road, roadPt}
   *
   * `normal` is written into an internal vector; clone it if you need to keep it.
   */
  sample(x, z, currentY = NaN) {
    this._ensureVectors();

    const tY = this.terrainY(x, z);
    const roadState = this.resolveDriveRoadContact(x, z, currentY);
    const nr = roadState.resolved || roadState.nearestRoad || { road: null, dist: Infinity, pt: null, y: NaN };
    let y, source;
    if (roadState.onRoad && nr?.road) {
      // On a road
      const sampleX = Number.isFinite(nr?.pt?.x) ? nr.pt.x : x;
      const sampleZ = Number.isFinite(nr?.pt?.z) ? nr.pt.z : z;
      const meshY = this.roadMeshY(sampleX, sampleZ, currentY);
      y =
        this._shouldUseRoadMeshHeight(nr?.road, meshY, nr?.y) ?
          Math.max(Number.isFinite(nr?.y) ? nr.y : -Infinity, meshY) :
        Number.isFinite(nr?.y) ? nr.y :
          tY + this.ROAD_OFFSET + 0.05;
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
    this._roadSurfaceMeshes = null;
    this._roadSurfaceMeshSource = null;
    this._roadSurfaceMeshCount = 0;
    // Currently stateless per-call; placeholder for future caching.
  } };
Object.assign(appCtx, { GroundHeight });

export { GroundHeight };
