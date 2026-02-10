// ============================================================================
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

    _ensureVectors() {
        if (!this._normal && typeof THREE !== 'undefined') {
            this._normal = new THREE.Vector3(0, 1, 0);
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
        if (typeof terrainMeshHeightAt === 'function') {
            return terrainMeshHeightAt(x, z);
        }
        return elevationWorldYAtWorldXZ(x, z);
    },

    /**
     * Height the road surface should be at world (x, z).
     * = terrain + ROAD_OFFSET
     */
    roadSurfaceY(x, z) {
        return this.terrainY(x, z) + this.ROAD_OFFSET;
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
        const nr = findNearestRoad(x, z);
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
            (hL - hR),
            2 * d,
            (hD - hU)
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
        // Currently stateless per-call; placeholder for future caching.
    }
};            return terrainMeshHeightAt(x, z);
        }
        return elevationWorldYAtWorldXZ(x, z);
    },

    /**
     * Height the road surface should be at world (x, z).
     * = terrain + ROAD_OFFSET
     */
    roadSurfaceY(x, z) {
        return this.terrainY(x, z) + this.ROAD_OFFSET;
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
        const nr = findNearestRoad(x, z);
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
            (hL - hR),
            2 * d,
            (hD - hU)
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
        // Currently stateless per-call; placeholder for future caching.
    }
};
