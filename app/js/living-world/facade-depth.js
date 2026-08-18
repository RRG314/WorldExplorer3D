const FACADE_BUDGET_BY_TIER = Object.freeze({
  low: Object.freeze({ doors: 36, storefronts: 14, windows: 96 }),
  performance: Object.freeze({ doors: 56, storefronts: 24, windows: 180 }),
  balanced: Object.freeze({ doors: 112, storefronts: 52, windows: 420 }),
  quality: Object.freeze({ doors: 180, storefronts: 88, windows: 760 })
});

const DOOR_PALETTES = Object.freeze([
  0x183446, 0x315542, 0x5a2e2b, 0x51412f,
  0x263039, 0x24475b, 0x574f47, 0x29423f
]);
const GLASS_PALETTES = Object.freeze([0x729baa, 0x668997, 0x83a6b0, 0x607e8d]);
const FRAME_PALETTES = Object.freeze([0x172027, 0x293238, 0x3a3630, 0x263942]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function disposeMaterial(material) {
  if (Array.isArray(material)) material.forEach((entry) => entry?.dispose?.());
  else material?.dispose?.();
}

function entranceDetail(entrance) {
  const archetype = String(entrance?.archetype || (entrance?.commercial ? 'storefront' : 'urban'));
  const variant = Math.max(0, finite(entrance?.visualVariant, 0) | 0) % 8;
  const style = String(entrance?.doorStyle || 'paneled');
  const doubleDoor = style === 'glass_double' || archetype === 'storefront';
  const industrial = archetype === 'industrial';
  const civic = archetype === 'civic';
  const office = archetype === 'office';
  const width = doubleDoor ? 1.72 : industrial ? 1.46 : civic ? 1.38 : 1.08 + (variant % 2) * 0.1;
  const height = industrial ? 2.5 : civic || office || doubleDoor ? 2.48 : 2.22;
  return {
    archetype,
    variant,
    style,
    width,
    height,
    surroundWidth: width + (civic ? 0.54 : 0.34),
    surroundHeight: height + (civic ? 0.48 : 0.32),
    panelColor: DOOR_PALETTES[variant],
    frameColor: FRAME_PALETTES[(variant + (civic ? 2 : 0)) % FRAME_PALETTES.length],
    glassColor: GLASS_PALETTES[variant % GLASS_PALETTES.length],
    hasLite: !industrial && style !== 'paneled',
    hasCanopy: archetype === 'storefront' || office || (civic && variant % 2 === 0)
  };
}

function placement(entrance, values = {}) {
  return {
    entrance,
    tangentOffset: finite(values.tangentOffset, 0),
    outwardOffset: finite(values.outwardOffset, 0),
    heightOffset: finite(values.heightOffset, 0),
    width: Math.max(0.01, finite(values.width, 1)),
    height: Math.max(0.01, finite(values.height, 1)),
    depth: Math.max(0.01, finite(values.depth, 1)),
    color: Number(values.color || 0xffffff),
    kind: String(values.kind || 'detail')
  };
}

function pushFrame(target, entrance, values = {}) {
  const width = Math.max(0.2, finite(values.width, 1));
  const height = Math.max(0.2, finite(values.height, 1));
  const thickness = clamp(finite(values.thickness, 0.13), 0.08, 0.24);
  const common = {
    kind: String(values.kind || 'frame'),
    depth: finite(values.depth, 0.085),
    outwardOffset: finite(values.outwardOffset, 0.09),
    color: Number(values.color || 0xffffff)
  };
  const tangentOffset = finite(values.tangentOffset, 0);
  const heightOffset = finite(values.heightOffset, height * 0.5);
  target.push(
    placement(entrance, { ...common, width: thickness, height, tangentOffset: tangentOffset - width * 0.5 + thickness * 0.5, heightOffset }),
    placement(entrance, { ...common, width: thickness, height, tangentOffset: tangentOffset + width * 0.5 - thickness * 0.5, heightOffset }),
    placement(entrance, { ...common, width, height: thickness, tangentOffset, heightOffset: heightOffset - height * 0.5 + thickness * 0.5 }),
    placement(entrance, { ...common, width, height: thickness, tangentOffset, heightOffset: heightOffset + height * 0.5 - thickness * 0.5 })
  );
}

export function compileFacadeDetailPlan(options = {}) {
  const entrances = Array.isArray(options.entrances) ? options.entrances : [];
  const tier = String(options.tier || 'balanced').toLowerCase();
  const budget = FACADE_BUDGET_BY_TIER[tier] || FACADE_BUDGET_BY_TIER.balanced;
  const selectedDoors = entrances.slice(0, budget.doors);
  const selectedStorefronts = selectedDoors
    .filter((entry) => entry.commercial || ['storefront', 'office'].includes(entry.archetype))
    .slice(0, budget.storefronts);
  const doors = [];
  const surrounds = [];
  const glass = [];
  const trim = [];
  const handles = [];
  const accents = [];
  const archetypes = {};

  for (const entrance of selectedDoors) {
    const detail = entranceDetail(entrance);
    archetypes[detail.archetype] = (archetypes[detail.archetype] || 0) + 1;
    pushFrame(surrounds, entrance, {
      kind: 'door_surround', width: detail.surroundWidth, height: detail.surroundHeight,
      depth: 0.18, heightOffset: detail.surroundHeight * 0.5, outwardOffset: 0.035,
      thickness: detail.archetype === 'civic' ? 0.18 : 0.13,
      color: detail.frameColor
    });
    doors.push(placement(entrance, {
      kind: detail.style, width: detail.width, height: detail.height, depth: 0.105,
      heightOffset: detail.height * 0.5 + 0.04, outwardOffset: 0.14,
      color: detail.panelColor
    }));
    handles.push(placement(entrance, {
      kind: 'door_handle', width: 0.055, height: detail.style === 'glass_double' ? 0.62 : 0.38,
      depth: 0.055, heightOffset: 1.16, outwardOffset: 0.225,
      tangentOffset: detail.style === 'glass_double' ? 0.11 : detail.width * 0.32,
      color: detail.archetype === 'industrial' ? 0xb9c1c4 : 0xc5a465
    }));
    accents.push(placement(entrance, {
      kind: 'threshold', width: detail.surroundWidth + 0.16, height: 0.09, depth: 0.48,
      heightOffset: 0.045, outwardOffset: 0.26, color: 0x555b5d
    }));
    if (detail.hasLite) {
      glass.push(placement(entrance, {
        kind: 'door_lite', width: detail.style === 'glass_double' ? detail.width - 0.24 : detail.width * 0.58,
        height: detail.style === 'glass_double' ? detail.height - 0.3 : detail.height * 0.42,
        depth: 0.035, heightOffset: detail.style === 'glass_double' ? detail.height * 0.51 : detail.height * 0.67,
        outwardOffset: 0.205, color: detail.glassColor
      }));
    }
    if (detail.hasCanopy) {
      accents.push(placement(entrance, {
        kind: 'canopy', width: detail.surroundWidth + 0.8, height: 0.13, depth: 1.05,
        heightOffset: detail.surroundHeight + 0.18, outwardOffset: 0.55,
        color: detail.frameColor
      }));
    }
  }

  for (const entrance of selectedStorefronts) {
    const detail = entranceDetail(entrance);
    const width = Math.min(5.6, Math.max(2.8, finite(entrance.facadeWidth, 5) * 0.58));
    const paneWidth = clamp((width - detail.width - 0.56) * 0.5, 0.68, 1.35);
    [-1, 1].forEach((side) => {
      const tangentOffset = side * (detail.width * 0.5 + paneWidth * 0.5 + 0.2);
      pushFrame(trim, entrance, {
        kind: 'storefront_frame', width: paneWidth + 0.18, height: 2.34, depth: 0.1,
        heightOffset: 1.23, tangentOffset, outwardOffset: 0.12, thickness: 0.11, color: detail.frameColor
      });
      glass.push(placement(entrance, {
        kind: 'storefront_glass', width: paneWidth, height: 2.14, depth: 0.045,
        heightOffset: 1.23, tangentOffset, outwardOffset: 0.19, color: detail.glassColor
      }));
    });
  }

  // The project-authored facade atlases already provide correctly projected,
  // high-resolution upper-storey windows. Additional geometry is deliberately
  // limited to doors and ground-floor storefronts so neighboring entrance
  // batches cannot stack duplicate windows over the authoritative facade art.
  return Object.freeze({
    tier,
    doors: Object.freeze(doors),
    surrounds: Object.freeze(surrounds),
    glass: Object.freeze(glass),
    trim: Object.freeze(trim),
    handles: Object.freeze(handles),
    accents: Object.freeze(accents),
    diagnostics: Object.freeze({
      tier,
      doors: doors.length,
      storefronts: selectedStorefronts.length,
      windows: 0,
      doorLites: glass.filter((entry) => entry.kind === 'door_lite').length,
      canopies: accents.filter((entry) => entry.kind === 'canopy').length,
      archetypes: Object.freeze({ ...archetypes })
    })
  });
}

function setInstanceTransform(mesh, index, item) {
  const entrance = item.entrance;
  const x = entrance.x + entrance.tangentX * item.tangentOffset + entrance.normalX * item.outwardOffset;
  const z = entrance.z + entrance.tangentZ * item.tangentOffset + entrance.normalZ * item.outwardOffset;
  const position = new THREE.Vector3(x, entrance.y + item.heightOffset, z);
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), entrance.yaw);
  const scale = new THREE.Vector3(item.width, item.height, item.depth);
  mesh.setMatrixAt(index, new THREE.Matrix4().compose(position, rotation, scale));
  mesh.setColorAt?.(index, new THREE.Color(item.color));
}

function createInstances(items, material, name) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, items.length);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  // Three.js r128 does not maintain an instance-aware bounding sphere here;
  // culling against the unit source box makes doors disappear away from the
  // world origin. The three bounded batches are cheaper and correct when always
  // submitted, while each instance remains inside the close-world budget.
  mesh.frustumCulled = false;
  mesh.userData.livingWorldFacade = true;
  items.forEach((item, index) => setInstanceTransform(mesh, index, item));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

export function createFacadeDepthPresentation(options = {}) {
  const plan = compileFacadeDetailPlan(options);
  const group = new THREE.Group();
  group.name = 'Living World Facade Depth';
  group.userData.livingWorldFacade = true;

  const structureMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.18 });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.28,
    metalness: 0.48,
    emissive: 0x203a48,
    emissiveIntensity: 0.05
  });
  const handleMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.34, metalness: 0.72 });

  const meshes = [
    createInstances(
      [...plan.surrounds, ...plan.doors, ...plan.trim, ...plan.accents],
      structureMaterial,
      'Living World Entrance Structure'
    ),
    createInstances(plan.glass, glassMaterial, 'Living World Architectural Glass'),
    createInstances(plan.handles, handleMaterial, 'Living World Door Hardware')
  ].filter(Boolean);
  meshes.forEach((mesh) => group.add(mesh));

  const diagnostics = Object.freeze({
    ...plan.diagnostics,
    drawCalls: meshes.length,
    detailInstances: plan.surrounds.length + plan.doors.length + plan.trim.length +
      plan.glass.length + plan.handles.length + plan.accents.length,
    transparentMaterials: 0
  });

  return Object.freeze({
    group,
    plan,
    diagnostics,
    updateNightLighting(phase = 'day') {
      glassMaterial.emissiveIntensity = phase === 'night'
        ? 0.66
        : phase === 'sunset' || phase === 'sunrise' ? 0.3 : 0.05;
    },
    dispose() {
      group.removeFromParent?.();
      meshes.forEach((mesh) => mesh.geometry?.dispose?.());
      [structureMaterial, glassMaterial, handleMaterial]
        .forEach(disposeMaterial);
    }
  });
}

export { FACADE_BUDGET_BY_TIER };
