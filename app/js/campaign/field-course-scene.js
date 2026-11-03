import { loadModelAsset } from '../assets/model-asset-runtime.js?v=16';
// A bounded presentation lease. It registers no frame loop or locomotion owner.
export function createFieldCourseScene(
  runtime,
  qualified,
  id,
  { signal, isCurrent = () => true } = {}
) {
  const T = globalThis.THREE,
    owner = runtime.dynamicBuildingColliders,
    u = qualified.metersPerUnit;
  if (!T || !runtime.scene || !Array.isArray(owner))
    throw Error('The field presentation is not ready.');
  const root = new T.Group(),
    resources = new Set(),
    proxies = [],
    leases = [];
  root.name = 'Field course · ' + id;
  let disposed = false;
  const resource = (value) => {
    resources.add(value);
    return value;
  };
  const material = (color, options = {}) => {
    const m = new T.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...options });
    m.color.convertSRGBToLinear();
    return resource(m);
  };
  function mesh(parent, geometry, mat, x = 0, y = 0, z = 0) {
    const object = new T.Mesh(resource(geometry), mat);
    object.position.set(x / u, y / u, z / u);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const box = (parent, w, h, d, mat, x = 0, y = 0, z = 0) =>
    mesh(parent, new T.BoxGeometry(w / u, h / u, d / u), mat, x, y, z);
  function at(key) {
    const group = new T.Group(),
      p = qualified.points[key];
    group.position.set(p.x, p.y, p.z);
    root.add(group);
    group.name = id + ' · ' + key;
    return group;
  }
  function collider(key, hx, hz, height) {
    const p = qualified.points[key],
      row = {
        sourceBuildingId: `research-${id}:${key}`,
        buildingType: 'field_furniture',
        isInteriorCollider: true,
        collisionKind: 'solid',
        minX: p.x - hx / u,
        maxX: p.x + hx / u,
        minZ: p.z - hz / u,
        maxZ: p.z + hz / u,
        minY: p.y,
        maxY: p.y + height / u,
        baseY: p.y,
        height: height / u
      };
    owner.push(row);
    proxies.push(row);
  }
  function label(parent, text, x, y, z, width = 2.6, height = 0.65) {
    const canvas = document.createElement('canvas');
    const short = text.length <= 3;
    canvas.width = short ? 200 : 720;
    canvas.height = 200;
    const c = canvas.getContext('2d');
    c.fillStyle = '#17302a';
    c.fillRect(0, 0, canvas.width, 200);
    c.strokeStyle = '#f0ce7e';
    c.lineWidth = 4;
    c.strokeRect(2, 2, canvas.width - 4, 196);
    c.fillStyle = '#fff5dd';
    c.textAlign = 'center';
    c.font = short ? 'bold 160px system-ui' : 'bold 32px system-ui';
    text
      .split('\n')
      .forEach((line, i) =>
        c.fillText(line, canvas.width / 2, short ? 158 : 66 + i * 65, canvas.width - 36)
      );
    const texture = resource(new T.CanvasTexture(canvas));
    texture.encoding = T.sRGBEncoding;
    const sprite = new T.Sprite(resource(new T.SpriteMaterial({ map: texture, depthTest: true })));
    sprite.position.set(x / u, y / u, z / u);
    sprite.scale.set(width / u, height / u, 1);
    parent.add(sprite);
    return sprite;
  }
  async function table(key) {
    const lease = await loadModelAsset(T, 'workspace-table', { signal });
    leases.push(lease);
    if (disposed || !isCurrent()) {
      dispose();
      return null;
    }
    lease.root.scale.multiplyScalar(1 / u);
    const p = qualified.points[key],
      bounds = new T.Box3().setFromObject(lease.root);
    lease.root.position.set(p.x, p.y - bounds.min.y, p.z);
    root.add(lease.root);
    collider(key, 0.7, 0.55, 0.95);
    return lease.root;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    root.parent?.remove(root);
    for (const proxy of proxies) {
      const i = owner.indexOf(proxy);
      if (i >= 0) owner.splice(i, 1);
    }
    for (const lease of leases) lease.dispose();
    for (const r of resources) r.dispose?.();
    signal?.removeEventListener('abort', dispose);
  }
  signal?.addEventListener('abort', dispose, { once: true });
  return {
    T,
    u,
    root,
    resource,
    material,
    mesh,
    box,
    at,
    collider,
    label,
    table,
    dispose,
    attach() {
      if (disposed || !isCurrent()) throw Error('The field course changed.');
      runtime.scene.add(root);
    },
    budget() {
      let meshes = 0,
        vertices = 0;
      root.traverse((row) => {
        if (row.isMesh) {
          meshes++;
          vertices += row.geometry?.attributes?.position?.count || 0;
        }
      });
      return {
        meshes,
        vertices,
        colliders: proxies.length,
        sceneLeases: 1,
        modelLeases: leases.length
      };
    }
  };
}
