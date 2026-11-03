import { createBuildingCollisionQuery } from '../physics/building-collision.js?v=5';
// A hand-drawn exhibit carrier follows existing supported walking positions.
// It owns no locomotion, timer, render loop, stock or durable writes.
export function createMiningCarrier(runtime, qualified, presentation) {
  const T = globalThis.THREE,
    u = qualified.metersPerUnit,
    cart = presentation.cart,
    query = createBuildingCollisionQuery(runtime);
  let disposed = false,
    attached = false,
    last = null,
    lastAt = 0,
    reason = '',
    distanceMeters = 0;
  const copyPosition = (p) => ({ x: p.x, y: p.y, z: p.z });
  function sampleGround(x, z) {
    const s = runtime.SurfaceQuery.walkAt?.(x, z),
      y = s?.position?.y,
      water = runtime.SurfaceQuery.waterAt?.(x, z);
    if (
      !Number.isFinite(y) ||
      (water?.feature && Number.isFinite(water.position?.y) && water.position.y > y - 0.1 / u)
    )
      return null;
    return y;
  }
  function panHeight(x, z) {
    const p = presentation.scaleGroup.position;
    return Math.abs(x - p.x) * u < 0.6 && Math.abs(z - p.z) * u < 0.45
      ? presentation.scaleTopY()
      : null;
  }
  function updateProxy() {
    presentation.syncCarrierProxy();
  }
  function supportAt(x, z) {
    const points = [
      [-0.37, -0.24],
      [0.37, -0.24],
      [-0.37, 0.24],
      [0.37, 0.24],
    ].map(([dx, dz]) => {
      const px = x + dx / u,
        pz = z + dz / u,
        y = panHeight(px, pz) ?? sampleGround(px, pz);
      return { x: px, z: pz, y };
    });
    if (points.some((p) => p.y === null)) return null;
    const left = (points[0].y + points[2].y) / 2,
      right = (points[1].y + points[3].y) / 2,
      back = (points[0].y + points[1].y) / 2,
      front = (points[2].y + points[3].y) / 2,
      sx = (right - left) / (0.74 / u),
      sz = (front - back) / (0.48 / u),
      center = points.reduce((n, p) => n + p.y, 0) / 4;
    if (Math.hypot(sx, sz) > 0.25) return null;
    if (points.some((p) => Math.abs(p.y - (center + sx * (p.x - x) + sz * (p.z - z))) * u > 0.018))
      return null;
    return { y: center - 0.01 / u, normal: new T.Vector3(-sx, 1, -sz).normalize() };
  }
  function place(x, z, { initial = false } = {}) {
    if (disposed) return false;
    const move = Math.hypot(x - cart.position.x, z - cart.position.z) * u;
    if (!initial && move > 0.35) {
      reason = 'Move the carrier with supported walking, one frame at a time.';
      return false;
    }
    const support = supportAt(x, z);
    if (!support) {
      reason = 'The carrier needs a supported dry route with all four wheels in contact.';
      return false;
    }
    const collision = query(x, z, 0.57 / u, {
      actorBaseY: support.y,
      actorHeight: 1.15 / u,
      acceptCollision: (c) => c.building !== presentation.cartProxy,
    });
    if (collision.collision) {
      reason = 'The carrier is blocked. Walk a clear return route.';
      return false;
    }
    cart.position.set(x, support.y, z);
    cart.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), support.normal);
    for (const wheel of presentation.wheels) wheel.rotateY(move / 0.13);
    cart.updateWorldMatrix(true, true);
    updateProxy();
    distanceMeters += initial ? 0 : move;
    reason = 'Carrier moving on supported ground.';
    return true;
  }
  function actor() {
    const w = runtime.Walk?.state?.walker;
    return w &&
      w.onGround === true &&
      runtime.getEnv?.() === 'EARTH' &&
      runtime.getCurrentTravelMode?.() === 'walk' &&
      !runtime.worldLoading &&
      !runtime.activeInterior &&
      !runtime.getLiveGpsSnapshot?.().active
      ? w
      : null;
  }
  function attach() {
    const w = actor();
    if (disposed || !w || Math.hypot(w.x - cart.position.x, w.z - cart.position.z) * u > 1.6)
      throw Error('Stand beside the loaded carrier on supported ground.');
    if (!presentation.cargo.children.length)
      throw Error('Load the sorted batch before moving the carrier.');
    if (!place(cart.position.x, cart.position.z, { initial: true })) throw Error(reason);
    last = copyPosition(w);
    lastAt = performance.now();
    attached = true;
    distanceMeters = 0;
    return snapshot();
  }
  function tick() {
    if (disposed || !attached) return;
    const w = actor(),
      now = performance.now(),
      elapsed = (now - lastAt) / 1000;
    lastAt = now;
    if (runtime.paused || document.hidden) {
      if (w) last = copyPosition(w);
      reason = 'Carrier movement paused.';
      return;
    }
    if (!w) {
      attached = false;
      reason = 'Return to supported walking and attach the carrier again.';
      return;
    }
    const delta = Math.hypot(w.x - last.x, w.z - last.z) * u;
    if (delta > Math.max(1, elapsed * 8)) {
      attached = false;
      reason = 'The position changed too far; return to the carrier.';
      return;
    }
    last = copyPosition(w);
    if (delta < 0.0005) return;
    // Keep the retained drawbar offset while translating with the actual walk.
    const distance = Math.hypot(w.x - cart.position.x, w.z - cart.position.z) * u;
    if (distance > 2.1) {
      attached = false;
      reason = 'The carrier is too far behind. Return to its handle.';
      return;
    }
    const excess = Math.max(0, distance - 1.0),
      step = Math.min(excess, delta * 1.3, 0.3),
      ratio = distance ? step / distance : 0;
    if (step)
      place(
        cart.position.x + (w.x - cart.position.x) * ratio,
        cart.position.z + (w.z - cart.position.z) * ratio
      );
  }
  function snapshot() {
    return {
      attached,
      reason,
      distanceMeters,
      position: copyPosition(cart.position),
      onPan: presentation.readScale().onPan,
      blocked: /blocked|supported dry/.test(reason),
    };
  }
  return {
    attach,
    tick,
    snapshot,
    place,
    detach() {
      attached = false;
      last = null;
    },
    dispose() {
      disposed = true;
      attached = false;
      last = null;
    },
  };
}
