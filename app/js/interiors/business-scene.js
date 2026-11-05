import { createBusinessFixturePlan, businessFixtureBounds } from './business-plan.js';
import { addFlatSurfaceMesh } from './core.js?v=4';
import { INTERIOR_FLOOR_OFFSET } from './constants.js?v=1';
import { loadModelAsset } from '../assets/model-asset-runtime.js?v=16';

const palettes = {
  'food-service': [0xb1916b, 0x3b5148, 0xf0e5cb],
  'hotel-lobby': [0xc1beb2, 0x384b61, 0xb08a4c],
  'medical-service': [0xc5cfce, 0x407b86, 0xe4ece9],
  'automotive-service': [0x777d82, 0xc48232, 0x2b333a],
  banking: [0xb9b5a7, 0x254b50, 0xc9a85e],
  postal: [0xb9b7ac, 0x26456c, 0xd8b168],
  education: [0xad926d, 0x3d6158, 0xe2c575],
  library: [0xb09677, 0x634b3a, 0xe5d4b4],
  'civic-service': [0xb7bcc0, 0x3a5268, 0xd3d9da],
  'visitor-gallery': [0xbeb8ae, 0x715c4c, 0xf0eae0],
  office: [0xb2b7b7, 0x3d555f, 0xb2a17c],
};
function surfaceTexture(T, program) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d');
  const wood = ['food-service', 'library', 'education'].includes(program);
  c.fillStyle = wood ? '#9f7c54' : '#b9b9b2';
  c.fillRect(0, 0, 256, 256);
  for (let n = 0; n < 16; n++) {
    const y = n * 16;
    c.fillStyle = wood
      ? `rgba(45,27,11,${0.04 + (n % 4) * 0.025})`
      : `rgba(70,80,80,${0.02 + (n % 3) * 0.015})`;
    c.fillRect(0, y, 256, 15);
    if (wood) {
      c.strokeStyle = '#775b3e';
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(256, y);
      c.stroke();
      c.beginPath();
      c.moveTo((n % 3) * 85, y);
      c.lineTo((n % 3) * 85, y + 16);
      c.stroke();
    }
  }
  if (!wood) {
    c.strokeStyle = '#8b9291';
    c.lineWidth = 1;
    for (let n = 0; n <= 4; n++) {
      c.beginPath();
      c.moveTo(n * 64, 0);
      c.lineTo(n * 64, 256);
      c.moveTo(0, n * 64);
      c.lineTo(256, n * 64);
      c.stroke();
    }
  }
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(1 / 3, 1 / 3);
  texture.colorSpace = T.SRGBColorSpace;
  texture.encoding = T.sRGBEncoding;
  return texture;
}

export function addBusinessFixtures(T, state, definition, program) {
  const palette = palettes[program] || [0xb1a58a, 0x3e5750, 0xd4bf91];
  if (state.businessMaterials) {
    state.businessMaterials.wallMaterial.color.setHex(
      program === 'food-service' ? 0xcfc6b5 : 0xc6cece
    );
    state.businessMaterials.accentWallMaterial.color.setHex(palette[1]);
  }
  // Normalize only this room's generated lights, leaving the world and renderer unchanged.
  state.group.traverse((o) => {
    if (o.isLight) o.intensity *= 0.3;
  });
  const root = new T.Group();
  root.name = `business:${program}`;
  root.userData.ownedInteriorTextures = [];
  const mats = {
    wood: new T.MeshStandardMaterial({ color: 0x8b6847, roughness: 0.64 }),
    stone: new T.MeshStandardMaterial({ color: palette[0], roughness: 0.64 }),
    accent: new T.MeshStandardMaterial({ color: palette[1], roughness: 0.55 }),
    light: new T.MeshStandardMaterial({ color: palette[2], roughness: 0.7 }),
    metal: new T.MeshStandardMaterial({ color: 0x40484d, metalness: 0.6, roughness: 0.32 }),
    paper: new T.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.96 }),
    glass: new T.MeshStandardMaterial({
      color: 0xd4edf0,
      transparent: true,
      opacity: 0.28,
      roughness: 0.08,
      metalness: 0.1,
    }),
  };
  const y = state.floorY + INTERIOR_FLOOR_OFFSET + 0.035;
  const floor = new T.MeshStandardMaterial({ map: surfaceTexture(T, program), roughness: 0.8 });
  root.userData.ownedInteriorTextures.push(floor.map);
  addFlatSurfaceMesh(root, state.usableFootprint, y, floor, 8);
  for (let i = 0; i < state.usableFootprint.length; i++) {
    const a = state.usableFootprint[i],
      b = state.usableFootprint[(i + 1) % state.usableFootprint.length],
      length = Math.hypot(b.x - a.x, b.z - a.z);
    const mx = (a.x + b.x) / 2,
      mz = (a.z + b.z) / 2,
      dx = state.center.x - mx,
      dz = state.center.z - mz,
      n = Math.hypot(dx, dz) || 1;
    const trim = box(
      root,
      length,
      0.12,
      0.045,
      mx + (dx / n) * 0.18,
      y + 0.06,
      mz + (dz / n) * 0.18,
      mats.accent
    );
    trim.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
  }
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const sc = shadowCanvas.getContext('2d'),
    gradient = sc.createRadialGradient(32, 32, 3, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(0,0,0,.42)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  sc.fillStyle = gradient;
  sc.fillRect(0, 0, 64, 64);
  const shadowMaterial = new T.MeshBasicMaterial({
    map: new T.CanvasTexture(shadowCanvas),
    transparent: true,
    depthWrite: false,
  });
  root.userData.ownedInteriorTextures.push(shadowMaterial.map);
  const plan = createBusinessFixturePlan({
    footprint: state.usableFootprint,
    entry: state.entryPoint,
    colliders: state.dynamicColliders,
    program,
  });
  const placements = [];
  let chairs = 0,
    tables = 0;
  function box(parent, w, h, d, x, cy, z, mat = mats.wood) {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, cy, z);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const tube = (parent, r, h, x, cy, z, mat = mats.metal) => {
    const mesh = new T.Mesh(new T.CylinderGeometry(r, r, h, 12), mat);
    mesh.position.set(x, cy, z);
    parent.add(mesh);
    return mesh;
  };
  function label(parent, text, w = 1.5, h = 0.28, cy = 1.75) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const c = canvas.getContext('2d');
    c.fillStyle = '#203431';
    c.fillRect(0, 0, 512, 128);
    c.fillStyle = '#f4ead6';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '600 34px sans-serif';
    c.fillText(text, 256, 64, 480);
    const tex = new T.CanvasTexture(canvas);
    root.userData.ownedInteriorTextures.push(tex);
    tex.colorSpace = T.SRGBColorSpace;
    tex.encoding = T.sRGBEncoding;
    const mesh = new T.Mesh(
      new T.PlaneGeometry(w, h),
      new T.MeshStandardMaterial({ map: tex, roughness: 0.9 })
    );
    mesh.position.set(0, cy, 0.815);
    parent.add(mesh);
  }
  function chair(parent, x, z, yaw = 0) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    parent.add(g);
    const fallback = new T.Group();
    g.add(fallback);
    box(fallback, 0.48, 0.06, 0.48, 0, 0.46, 0, mats.accent);
    box(fallback, 0.48, 0.5, 0.06, 0, 0.75, 0.2, mats.accent);
    for (const a of [-0.19, 0.19])
      for (const b of [-0.19, 0.19]) tube(fallback, 0.025, 0.44, a, 0.22, b);
    if (chairs++ < 24)
      placements.push({
        assetId: 'workspace-chair',
        parent: g,
        fallback,
        height: 0.98,
        width: 0.58,
        depth: 0.62,
      });
  }
  function table(parent, x = 0, z = 0, w = 1.3, d = 0.8) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    parent.add(g);
    const fallback = new T.Group();
    g.add(fallback);
    box(fallback, w, 0.065, d, 0, 0.735, 0, mats.wood);
    for (const a of [-w * 0.4, w * 0.4])
      for (const b of [-d * 0.36, d * 0.36]) tube(fallback, 0.035, 0.7, a, 0.35, b);
    if (tables++ < 12)
      placements.push({
        assetId: 'workspace-table',
        parent: g,
        fallback,
        height: 0.78,
        width: w,
        depth: d,
      });
  }
  function shelves(g, books = false, parcels = false) {
    box(g, 1.7, 1.9, 0.09, 0, 0.95, -0.58, mats.wood);
    for (const x of [-0.83, 0.83]) box(g, 0.06, 1.94, 1.12, x, 0.97, 0, mats.metal);
    for (let row = 0; row < 4; row++) {
      const h = 0.12 + row * 0.47;
      box(g, 1.7, 0.055, 1.15, 0, h, 0, mats.wood);
      for (let col = 0; col < 6; col++) {
        const mat = [mats.accent, mats.light, mats.paper, mats.wood][(row + col) % 4];
        box(
          g,
          books ? 0.16 : 0.22,
          books ? 0.32 : 0.2 + (col % 2) * 0.08,
          books ? 0.44 : 0.3,
          -0.67 + col * 0.265,
          h + (books ? 0.2 : 0.15),
          0.16,
          mat
        );
      }
    }
    label(g, books ? 'LIBRARY' : parcels ? 'COLLECTIONS' : 'SUPPLIES', 1.3, 0.2, 2.1);
  }
  for (const f of plan) {
    const g = new T.Group();
    g.name = `business-fixture:${f.kind}`;
    g.position.set(f.x, y, f.z);
    g.rotation.y = f.yaw;
    root.add(g);
    const shadow = new T.Mesh(new T.PlaneGeometry(f.width * 1.2, f.depth * 1.2), shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.003;
    g.add(shadow);
    if (f.kind === 'dining') {
      table(g, 0, 0, 1.25, 0.8);
      chair(g, -0.88, 0, Math.PI / 2);
      chair(g, 0.88, 0, -Math.PI / 2);
      tube(g, 0.065, 0.17, 0, 0.88, 0, mats.light);
      tube(g, 0.09, 0.04, 0.3, 0.81, 0, mats.paper);
    } else if (['desk', 'reception', 'workbench'].includes(f.kind)) {
      table(g, 0, 0, 1.65, 0.7);
      chair(g, 0, -0.56, Math.PI);
      if (f.kind === 'reception') {
        box(g, 0.36, 0.28, 0.04, 0.45, 1.03, 0.16, mats.metal);
        box(g, 0.38, 0.025, 0.18, 0.45, 0.8, 0.05, mats.accent);
        if (program === 'food-service') {
          box(g, 0.55, 0.46, 0.34, -0.45, 1, 0.02, mats.metal);
          tube(g, 0.065, 0.14, -0.45, 0.84, 0.3, mats.paper);
        }
        box(g, 1.8, 0.7, 0.12, 0, 0.36, 0.46, mats.accent);
        label(
          g,
          program === 'postal'
            ? 'POST OFFICE'
            : program === 'medical-service'
              ? 'RECEPTION'
              : program === 'food-service'
                ? 'ORDER HERE'
                : program === 'banking'
                  ? 'CLIENT SERVICES'
                  : program === 'general-retail'
                    ? 'CHECKOUT'
                    : 'INFORMATION',
          1.3,
          0.2,
          0.48
        );
      } else if (f.kind === 'workbench') {
        box(g, 0.9, 0.6, 0.08, 0, 1.15, -0.36, mats.accent);
        for (let i = 0; i < 5; i++)
          box(g, 0.06, 0.25, 0.07, -0.3 + i * 0.15, 1.18, -0.3, mats.metal);
      } else {
        box(g, 0.5, 0.32, 0.04, 0, 1.02, -0.17, mats.metal);
        box(g, 0.45, 0.02, 0.15, 0, 0.79, 0.1, mats.accent);
        box(g, 0.35, 0.035, 0.27, 0.56, 0.8, 0.05, mats.paper);
      }
    } else if (f.kind === 'planter') {
      tube(g, 0.24, 0.5, 0, 0.25, 0, mats.light);
      const plantHolder = new T.Group();
      plantHolder.position.y = 0.46;
      g.add(plantHolder);
      const fallback = new T.Group();
      plantHolder.add(fallback);
      placements.push({
        assetId: 'nature-fern',
        parent: plantHolder,
        fallback,
        height: 0.85,
        width: 0.9,
        depth: 0.9,
      });
      for (let i = 0; i < 8; i++) {
        const leaf = new T.Mesh(new T.ConeGeometry(0.19, 0.8, 6), mats.accent);
        leaf.position.set(Math.cos(i) * 0.16, 0.36, Math.sin(i) * 0.16);
        leaf.rotation.z = Math.cos(i) * 0.3;
        fallback.add(leaf);
      }
    } else if (f.kind === 'lounge') {
      box(g, 1.8, 0.38, 0.72, 0, 0.3, 0, mats.accent);
      box(g, 1.8, 0.65, 0.12, 0, 0.64, -0.31, mats.accent);
      for (const x of [-0.86, 0.86]) box(g, 0.13, 0.5, 0.75, x, 0.45, 0, mats.accent);
      box(g, 0.55, 0.09, 0.5, 0, 0.26, 0.7, mats.wood);
    } else if (f.kind === 'luggage' || f.kind === 'locker') {
      for (const x of [-0.55, 0, 0.55]) {
        box(
          g,
          0.46,
          f.kind === 'locker' ? 1.8 : 0.7,
          0.5,
          x,
          f.kind === 'locker' ? 0.9 : 0.35,
          0,
          mats.accent
        );
        box(g, 0.22, 0.03, 0.04, x, f.kind === 'locker' ? 1.3 : 0.73, 0.27, mats.metal);
      }
    } else if (f.kind === 'medical') {
      box(g, 1.65, 0.14, 0.65, 0, 0.72, 0, mats.paper);
      box(g, 1.45, 0.55, 0.55, 0, 0.3, 0, mats.light);
      box(g, 0.38, 0.12, 0.55, -0.55, 0.86, 0, mats.paper);
      tube(g, 0.025, 1.8, 0.85, 0.9, 0);
      tube(g, 0.15, 0.08, 0.85, 1.83, 0, mats.light);
    } else if (f.kind === 'wheels') {
      for (const x of [-0.5, 0.5])
        for (const h of [0.22, 0.58, 0.94]) {
          const wheel = new T.Mesh(new T.TorusGeometry(0.26, 0.1, 8, 20), mats.metal);
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(x, h, 0);
          g.add(wheel);
        }
    } else if (f.kind === 'exhibit') {
      box(g, 0.9, 0.7, 0.9, 0, 0.35, 0, mats.light);
      box(g, 0.9, 0.65, 0.9, 0, 1.03, 0, mats.glass);
      const model = new T.Mesh(new T.DodecahedronGeometry(0.24, 0), mats.accent);
      model.position.y = 1.02;
      g.add(model);
      label(g, 'COLLECTION', 1.1, 0.18, 0.4);
    } else shelves(g, f.kind === 'books', f.kind === 'parcels');
    g.updateMatrixWorld(true);
    const visibleBounds = new T.Box3().setFromObject(g),
      fixtureHeight = Math.max(0.4, visibleBounds.max.y - y);
    state.dynamicColliders.push({
      ...businessFixtureBounds(f),
      minY: y,
      maxY: y + fixtureHeight,
      baseY: y,
      height: fixtureHeight,
      collisionKind: 'interior-furniture',
      isInteriorCollider: true,
      buildingType: 'interior_furniture',
    });
  }
  state.group.add(root);
  state.businessProgram = program;
  state.businessModelPlacements = placements;
  state.businessFixturePlan = plan;
  root.userData.businessProgram = program;
  root.userData.representativeInterior = true;
  root.userData.fixtureCount = plan.length;
  return root;
}

export function disposeBusinessAssets(active) {
  const attachment = active?.businessAssetAttachment;
  if (!attachment) return;
  active.businessAssetAttachment = null;
  for (const { instance, holder, fallback } of attachment.instances) {
    holder.parent?.remove(holder);
    instance.dispose();
    if (fallback) fallback.visible = true;
  }
}
export async function attachBusinessAssets(
  T,
  active,
  { isCurrent = () => true, loadAsset = loadModelAsset } = {}
) {
  disposeBusinessAssets(active);
  if (!active?.businessModelPlacements?.length) return false;
  const attachment = { instances: [], status: 'loading' };
  active.businessAssetAttachment = attachment;
  for (const slot of active.businessModelPlacements) {
    if (!isCurrent(active) || active.businessAssetAttachment !== attachment) return false;
    let instance;
    try {
      instance = await loadAsset(T, slot.assetId);
      if (!isCurrent(active) || active.businessAssetAttachment !== attachment) {
        instance.dispose();
        return false;
      }
      const source = instance.root;
      source.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(source),
        size = box.getSize(new T.Vector3()),
        center = box.getCenter(new T.Vector3());
      if (box.isEmpty() || size.y <= 0) throw Error('Furniture asset has no measurable bounds');
      const scale = Math.min(
        slot.height / size.y,
        slot.width / Math.max(0.001, size.x),
        slot.depth / Math.max(0.001, size.z)
      );
      const holder = new T.Group(),
        pivot = new T.Group();
      pivot.scale.setScalar(scale);
      pivot.add(source);
      pivot.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      holder.add(pivot);
      slot.parent.add(holder);
      slot.fallback.visible = false;
      attachment.instances.push({ instance, holder, fallback: slot.fallback });
      instance = null;
    } catch (error) {
      instance?.dispose();
      console.warn(
        '[Interior] Furniture remains available in its local presentation.',
        error.message
      );
    }
  }
  if (active.businessAssetAttachment === attachment) attachment.status = 'ready';
  return true;
}
