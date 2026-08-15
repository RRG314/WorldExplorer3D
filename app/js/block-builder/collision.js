import { getBlockShapeSurface } from './catalog.js?v=2';

function createBuildCollisionQueries(options) {
  const {
    blockKey,
    buildBlocks,
    buildColumns,
    columnKey,
    toGridCoord,
    toWorldCoord
  } = options;

  function forEachBlockAtWorldXZ(x, z, callback) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || typeof callback !== 'function') return;
    const baseGX = toGridCoord(x);
    const baseGZ = toGridCoord(z);

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const gx = baseGX + dx;
        const gz = baseGZ + dz;
        const ys = buildColumns.get(columnKey(gx, gz));
        if (!ys || ys.size === 0) continue;

        ys.forEach((gy) => {
          const mesh = buildBlocks.get(blockKey(gx, gy, gz));
          if (!mesh) return;
          const surface = getBlockShapeSurface(
            mesh.userData?.shape,
            mesh.userData?.rotation,
            toWorldCoord(gx),
            toWorldCoord(gy),
            toWorldCoord(gz),
            x,
            z
          );
          if (surface) callback(surface, mesh);
        });
      }
    }
  }

  function getBuildTopSurfaceAtWorldXZ(x, z, maxTopY = Infinity) {
    let best = -Infinity;
    forEachBlockAtWorldXZ(x, z, (surface) => {
      if (surface.topY <= maxTopY + 0.0001 && surface.topY > best) best = surface.topY;
    });
    return Number.isFinite(best) ? best : null;
  }

  function getBuildCollisionAtWorldXZ(x, z, feetY, stepHeight = 0.65, bodyHeight = 0, queryOptions = {}) {
    if (!Number.isFinite(feetY)) return { blocked: false, stepTopY: null };

    const actorTopY = feetY + Math.max(0, Number.isFinite(bodyHeight) ? bodyHeight : 0);
    let blocked = false;
    let stepTopY = -Infinity;
    let hitShape = null;

    forEachBlockAtWorldXZ(x, z, (surface) => {
      if (actorTopY <= surface.bottomY + 0.02) return;
      if (feetY >= surface.topY - 0.04) return;

      const requiredStep = surface.topY - feetY;
      const rampIsDriveable = queryOptions.allowRamps === true && surface.shape === 'ramp';
      if (rampIsDriveable || requiredStep <= stepHeight + 0.0001) {
        if (surface.topY > stepTopY) stepTopY = surface.topY;
        return;
      }
      blocked = true;
      hitShape = surface.shape;
    });

    return {
      blocked,
      stepTopY: Number.isFinite(stepTopY) ? stepTopY : null,
      shape: hitShape
    };
  }

  function getBuildVehicleContact(fromX, fromZ, toX, toZ, feetY, heading = 0) {
    const distance = Math.hypot(toX - fromX, toZ - fromZ);
    const sweepSteps = Math.max(1, Math.ceil(distance / 0.4));
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    const longitudinal = [-2.2, -1.45, -0.72, 0, 0.72, 1.45, 2.2];
    const lateral = [-1.5, -0.75, 0, 0.75, 1.5];
    let supportTopY = -Infinity;

    for (let step = 1; step <= sweepSteps; step += 1) {
      const t = step / sweepSteps;
      const centerX = fromX + (toX - fromX) * t;
      const centerZ = fromZ + (toZ - fromZ) * t;

      for (let li = 0; li < longitudinal.length; li += 1) {
        for (let wi = 0; wi < lateral.length; wi += 1) {
          const forward = longitudinal[li];
          const right = lateral[wi];
          const sampleX = centerX + sin * forward + cos * right;
          const sampleZ = centerZ + cos * forward - sin * right;
          const hit = getBuildCollisionAtWorldXZ(sampleX, sampleZ, feetY, 0.3, 1.9, { allowRamps: true });
          if (hit.blocked) return { blocked: true, supportTopY: null, shape: hit.shape };
          if (Number.isFinite(hit.stepTopY) && hit.stepTopY > supportTopY) supportTopY = hit.stepTopY;
        }
      }
    }

    return {
      blocked: false,
      supportTopY: Number.isFinite(supportTopY) ? supportTopY : null,
      shape: null
    };
  }

  function getBuildVehicleSurfaceAtWorldXZ(x, z, feetY) {
    let best = -Infinity;
    forEachBlockAtWorldXZ(x, z, (surface) => {
      const reachableSolidTop = Math.abs(surface.topY - feetY) <= 0.36;
      if ((surface.shape === 'ramp' || reachableSolidTop) && surface.topY > best) best = surface.topY;
    });
    return Number.isFinite(best) ? best : null;
  }

  return {
    getBuildCollisionAtWorldXZ,
    getBuildTopSurfaceAtWorldXZ,
    getBuildVehicleContact,
    getBuildVehicleSurfaceAtWorldXZ
  };
}

export { createBuildCollisionQueries };
