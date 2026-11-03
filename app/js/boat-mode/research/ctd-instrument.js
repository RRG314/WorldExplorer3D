// Presentation attachment to the existing research-vessel root. Its normal
// voyage update moves the probe; the boat owner retires the attachment with
// disposeVesselAttachment. No world, movement, collision or render owner here.
export function createResearchCtdInstrument(
  T,
  vessel,
  { metersPerUnit = 1, signal, isCurrent = () => true } = {}
) {
  const u = metersPerUnit,
    root = new T.Group(),
    geometries = new Set(),
    materials = new Set(),
    floor = 1.944;
  root.name = 'Oceanographic training winch and CTD';
  root.userData.excludeShipNavigation = true;
  let disposed = false,
    recovered = true;
  const material = (color, options = {}) => {
      const m = new T.MeshStandardMaterial({ color, roughness: 0.65, ...options });
      m.color.convertSRGBToLinear();
      materials.add(m);
      return m;
    },
    steel = material(0x83969b, { metalness: 0.65 }),
    yellow = material(0xe6b858),
    dark = material(0x142f3b),
    sensorMaterial = material(0x75cdd0, { metalness: 0.4 });
  const add = (parent, geometry, mat, x, y, z) => {
      geometries.add(geometry);
      const object = new T.Mesh(geometry, mat);
      object.position.set(x, y, z);
      object.castShadow = object.receiveShadow = true;
      object.userData.excludeShipNavigation = parent !== root;
      parent.add(object);
      return object;
    },
    box = (w, h, d, mat, x, y, z) => add(root, new T.BoxGeometry(w, h, d), mat, x, y, z);
  box(0.5, 0.12, 0.75, steel, -7.3, floor + 0.06, -31.5);
  box(0.14, 3.2, 0.14, yellow, -7.3, floor + 1.6, -31.5);
  box(2.6, 0.16, 0.18, yellow, -8.4, floor + 3.2, -31.5);
  box(0.35, 1.05, 0.3, steel, -2.4, floor + 0.525, -32.3);
  box(0.5, 0.3, 0.2, dark, -2.4, floor + 1.15, -32.3);
  box(0.3, 0.13, 0.02, sensorMaterial, -2.4, floor + 1.18, -32.19);
  const probe = new T.Group();
  probe.name = 'Training CTD rosette';
  root.add(probe);
  for (const y of [-0.25, 0.25]) {
    const ring = add(probe, new T.TorusGeometry(0.34 / u, 0.035 / u, 8, 24), steel, 0, y / u, 0);
    ring.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 6; i++) {
    const theta = (i * Math.PI) / 3,
      x = (Math.cos(theta) * 0.24) / u,
      z = (Math.sin(theta) * 0.24) / u;
    add(probe, new T.CylinderGeometry(0.055 / u, 0.055 / u, 0.43 / u, 8), yellow, x, 0, z);
  }
  add(
    probe,
    new T.CylinderGeometry(0.035 / u, 0.035 / u, 0.18 / u, 8),
    sensorMaterial,
    0,
    -0.3 / u,
    0
  );
  const tip = new T.Object3D();
  tip.name = 'CTD sensing point';
  tip.position.y = -0.39 / u;
  probe.add(tip);
  const cableGeometry = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
  geometries.add(cableGeometry);
  const cableMaterial = new T.LineBasicMaterial({ color: 0xb5b6a1 });
  materials.add(cableMaterial);
  const cable = new T.Line(cableGeometry, cableMaterial);
  cable.frustumCulled = false;
  root.add(cable);
  const home = new T.Vector3(-9.5, floor + 0.95, -31.5),
    anchor = new T.Vector3(-9.5, floor + 3.2, -31.5),
    scratch = new T.Vector3(),
    waterPoint = new T.Vector3();
  probe.position.copy(home);
  probe.position.y += 0.39 / u;
  vessel.add(root);
  root.userData.disposeVesselAttachment = dispose;
  function current() {
    return !disposed && isCurrent() && root.parent === vessel && vessel.parent;
  }
  function read(runtime) {
    if (!current()) throw Error('The research instrument is no longer attached to this vessel.');
    tip.updateWorldMatrix(true, false);
    const p = tip.getWorldPosition(new T.Vector3()),
      waterY = runtime.waterSurfaceYAt?.(p.x, p.z, runtime.boatMode?.currentWater);
    if (!Number.isFinite(waterY))
      throw Error('The water surface at the instrument is unavailable.');
    return { depthMeters: (waterY - p.y) * u, sensorPosition: { x: p.x, y: p.y, z: p.z }, waterY };
  }
  function update(dt, targetDepthMeters = null, runtime) {
    if (!current()) return false;
    root.updateWorldMatrix(true, false);
    const before = read(runtime);
    if (
      targetDepthMeters !== null &&
      (!Number.isFinite(targetDepthMeters) || targetDepthMeters < 0 || targetDepthMeters > 6.2)
    )
      throw Error('Keep the training downcast inside its six-metre envelope.');
    waterPoint.copy(home);
    root.localToWorld(waterPoint);
    const desiredY =
        targetDepthMeters === null ? waterPoint.y : before.waterY - targetDepthMeters / u,
      maxStep = Math.min(0.1, Math.max(0, Number(dt) || 0)) / u,
      nextY =
        before.sensorPosition.y +
        Math.max(-maxStep, Math.min(maxStep, desiredY - before.sensorPosition.y));
    scratch.set(before.sensorPosition.x, nextY, before.sensorPosition.z);
    root.worldToLocal(scratch);
    probe.position.copy(scratch);
    probe.position.y += 0.39 / u;
    probe.updateWorldMatrix(true, true);
    const points = cable.geometry.attributes.position;
    points.setXYZ(0, anchor.x, anchor.y, anchor.z);
    points.setXYZ(1, probe.position.x, probe.position.y + 0.28 / u, probe.position.z);
    points.needsUpdate = true;
    const sample = read(runtime);
    recovered = targetDepthMeters === null && Math.abs(nextY - desiredY) * u < 0.025;
    return {
      ...sample,
      recovered
    };
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    root.parent?.remove(root);
    for (const geometry of geometries) geometry.dispose();
    for (const mat of materials) mat.dispose();
    signal?.removeEventListener('abort', dispose);
  }
  signal?.addEventListener('abort', dispose, { once: true });
  if (signal?.aborted) dispose();
  const initialCable = cable.geometry.attributes.position;
  initialCable.setXYZ(0, anchor.x, anchor.y, anchor.z);
  initialCable.setXYZ(1, probe.position.x, probe.position.y + 0.28 / u, probe.position.z);
  initialCable.needsUpdate = true;
  let meshCount = 0,
    vertices = 0;
  root.traverse((o) => {
    if (o.isMesh) meshCount++;
    vertices += o.geometry?.attributes?.position?.count || 0;
  });
  return {
    root,
    get recovered() {
      return recovered;
    },
    probe,
    tip,
    read,
    update,
    dispose,
    get budget() {
      return {
        meshes: meshCount,
        vertices,
        geometries: geometries.size,
        materials: materials.size
      };
    }
  };
}
