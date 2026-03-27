import { ctx as appCtx } from '../shared-context.js?v=55';
import { getOverlayPreset } from './preset-registry.js?v=1';
import { featureWorldCenter, geometryToWorldData, sampleSurfaceY } from './geometry.js?v=1';

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function colorHex(input, fallback = 0x22c55e) {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  const value = String(input || '').trim();
  if (!value) return fallback;
  const normalized = value.startsWith('#') ? value.slice(1) : value;
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function disposeMaterial(material) {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach((entry) => entry?.dispose?.());
    return;
  }
  material.dispose?.();
}

function disposeObject3D(object) {
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (child.material) disposeMaterial(child.material);
  });
}

function buildLineRibbon(points = [], width = 3, style = '#38bdf8', yBias = 0.18) {
  if (typeof THREE === 'undefined' || !Array.isArray(points) || points.length < 2) return null;
  const styleOptions = style && typeof style === 'object' ? style : { color: style };
  const halfWidth = Math.max(0.35, finiteNumber(width, 3) * 0.5);
  const verts = [];
  const indices = [];

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    let dx = 0;
    let dz = 0;
    if (i === 0) {
      dx = points[1].x - point.x;
      dz = points[1].z - point.z;
    } else if (i === points.length - 1) {
      dx = point.x - points[i - 1].x;
      dz = point.z - points[i - 1].z;
    } else {
      dx = points[i + 1].x - points[i - 1].x;
      dz = points[i + 1].z - points[i - 1].z;
    }
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const leftX = point.x + nx * halfWidth;
    const leftZ = point.z + nz * halfWidth;
    const rightX = point.x - nx * halfWidth;
    const rightZ = point.z - nz * halfWidth;
    const leftY = sampleSurfaceY(leftX, leftZ, 0) + yBias;
    const rightY = sampleSurfaceY(rightX, rightZ, 0) + yBias;
    verts.push(leftX, leftY, leftZ);
    verts.push(rightX, rightY, rightZ);
    if (i < points.length - 1) {
      const vi = i * 2;
      indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
    }
  }

  if (verts.length < 12 || indices.length < 6) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const baseColor = colorHex(styleOptions.color, 0x38bdf8);
  const material = new THREE.MeshStandardMaterial({
    color: baseColor,
    emissive: baseColor,
    emissiveIntensity: finiteNumber(styleOptions.emissiveIntensity, 0.08),
    roughness: finiteNumber(styleOptions.roughness, 0.92),
    metalness: finiteNumber(styleOptions.metalness, 0.03),
    side: THREE.DoubleSide,
    transparent: finiteNumber(styleOptions.opacity, 1) < 1,
    opacity: finiteNumber(styleOptions.opacity, 1),
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 6;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

function offsetPolyline(points = [], offset = 0) {
  if (!Array.isArray(points) || points.length < 2) return [];
  return points.map((point, index) => {
    let dx = 0;
    let dz = 0;
    if (index === 0) {
      dx = points[1].x - point.x;
      dz = points[1].z - point.z;
    } else if (index === points.length - 1) {
      dx = point.x - points[index - 1].x;
      dz = point.z - points[index - 1].z;
    } else {
      dx = points[index + 1].x - points[index - 1].x;
      dz = points[index + 1].z - points[index - 1].z;
    }
    const len = Math.hypot(dx, dz) || 1;
    return {
      x: point.x + (-dz / len) * offset,
      z: point.z + (dx / len) * offset
    };
  });
}

function buildRailwayFeature(points = [], color = '#94a3b8') {
  if (typeof THREE === 'undefined' || points.length < 2) return null;
  const group = new THREE.Group();
  const ballast = buildLineRibbon(points, 3.4, { color: '#6b7280', emissiveIntensity: 0.03, roughness: 0.98 }, 0.14);
  if (ballast) group.add(ballast);
  const leftRail = buildLineRibbon(offsetPolyline(points, 0.78), 0.18, { color, emissiveIntensity: 0.02, roughness: 0.45, metalness: 0.78 }, 0.22);
  const rightRail = buildLineRibbon(offsetPolyline(points, -0.78), 0.18, { color, emissiveIntensity: 0.02, roughness: 0.45, metalness: 0.78 }, 0.22);
  if (leftRail) group.add(leftRail);
  if (rightRail) group.add(rightRail);
  return group;
}

function buildStyledLinearFeature(feature = {}, preset = {}, options = {}) {
  const world = geometryToWorldData(feature.geometry || {});
  const points = Array.isArray(world.coordinates) ? world.coordinates : [];
  if (points.length < 2) return null;
  const featureClass = String(feature.featureClass || preset.featureClass || '').toLowerCase();
  if (featureClass === 'railway') {
    return buildRailwayFeature(points, options.color || '#cbd5e1');
  }
  const group = new THREE.Group();
  const styleMap = {
    road: {
      width: finiteNumber(feature?.tags?.width, 8),
      base: { color: options.color || '#2f3640', emissiveIntensity: 0.03, roughness: 0.96, metalness: 0.04 },
      stripe: { width: 0.3, style: { color: '#f8fafc', emissiveIntensity: 0.03, roughness: 0.88, metalness: 0.02 } }
    },
    footway: {
      width: finiteNumber(feature?.tags?.width, 2.6),
      base: { color: options.color || '#d6d3d1', emissiveIntensity: 0.02, roughness: 0.97, metalness: 0.01 },
      stripe: null
    },
    cycleway: {
      width: finiteNumber(feature?.tags?.width, 2.9),
      base: { color: options.color || '#16a34a', emissiveIntensity: 0.08, roughness: 0.92, metalness: 0.02 },
      stripe: { width: 0.22, style: { color: '#dcfce7', emissiveIntensity: 0.03, roughness: 0.88, metalness: 0.01 } }
    },
    corridor: {
      width: finiteNumber(feature?.tags?.width, 2.4),
      base: { color: options.color || '#7dd3fc', emissiveIntensity: 0.06, roughness: 0.94, metalness: 0.01 },
      stripe: null
    },
    stairs: {
      width: finiteNumber(feature?.tags?.width, 1.8),
      base: { color: options.color || '#f59e0b', emissiveIntensity: 0.08, roughness: 0.94, metalness: 0.01 },
      stripe: { width: 0.16, style: { color: '#fef3c7', emissiveIntensity: 0.02, roughness: 0.9, metalness: 0.01 } }
    }
  };
  const style = styleMap[featureClass] || {
    width: finiteNumber(feature?.tags?.width, 2.4),
    base: { color: options.color || preset.color || '#38bdf8', emissiveIntensity: 0.05, roughness: 0.94, metalness: 0.02 },
    stripe: null
  };
  const baseRibbon = buildLineRibbon(points, style.width, style.base, options.yBias ?? 0.2);
  if (baseRibbon) group.add(baseRibbon);
  if (style.stripe) {
    const stripeRibbon = buildLineRibbon(points, style.stripe.width, style.stripe.style, (options.yBias ?? 0.2) + 0.04);
    if (stripeRibbon) group.add(stripeRibbon);
  }
  return group;
}

function buildPointMarker(feature = {}, options = {}) {
  if (typeof THREE === 'undefined') return null;
  const preset = getOverlayPreset(feature.presetId);
  const world = geometryToWorldData(feature.geometry || {});
  const point = world.coordinates || { x: 0, z: 0 };
  const color = colorHex(options.color || preset.color, 0xf97316);
  const y = sampleSurfaceY(point.x, point.z, 0);
  const featureClass = String(feature.featureClass || preset.featureClass || '').toLowerCase();
  const group = new THREE.Group();

  if (featureClass === 'tree') {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, 1.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x7c4a1f, roughness: 0.92, metalness: 0.02 })
    );
    trunk.position.y = 0.9;
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x14532d, emissiveIntensity: 0.08, roughness: 0.88, metalness: 0.01 })
    );
    canopy.position.y = 2.05;
    group.add(trunk);
    group.add(canopy);
  } else if (featureClass === 'entrance') {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2.2, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.64, metalness: 0.12 })
    );
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 1.92, 0.08),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.06, roughness: 0.68, metalness: 0.08 })
    );
    frame.position.y = 1.1;
    door.position.y = 1.08;
    door.position.z = 0.06;
    group.add(frame);
    group.add(door);
  } else {
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18 })
    );
    stem.position.y = 0.8;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(options.radius || 0.34, 10, 8),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22, roughness: 0.78, metalness: 0.04 })
    );
    head.position.y = 1.85;
    group.add(stem);
    group.add(head);
  }

  group.position.set(point.x, y + 0.02, point.z);
  group.renderOrder = 7;
  return group;
}

function polygonShapeFromRing(ring = []) {
  if (!Array.isArray(ring) || ring.length < 3 || typeof THREE === 'undefined') return null;
  const shape = new THREE.Shape();
  ring.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, -point.z);
    else shape.lineTo(point.x, -point.z);
  });
  shape.closePath();
  return shape;
}

function ringBounds(points = []) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  });
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(0, maxX - minX),
    depth: Math.max(0, maxZ - minZ)
  };
}

function worldBoundsFromFeature(feature = {}) {
  const world = geometryToWorldData(feature.geometry || {});
  if (world.type === 'Point') {
    const point = world.coordinates || {};
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
    return {
      minX: point.x,
      maxX: point.x,
      minZ: point.z,
      maxZ: point.z
    };
  }
  const points = world.type === 'LineString'
    ? world.coordinates || []
    : Array.isArray(world.coordinates) ? world.coordinates[0] || [] : [];
  if (!Array.isArray(points) || points.length === 0) return null;
  const bounds = ringBounds(points);
  if (
    !Number.isFinite(bounds?.minX) ||
    !Number.isFinite(bounds?.maxX) ||
    !Number.isFinite(bounds?.minZ) ||
    !Number.isFinite(bounds?.maxZ)
  ) {
    return null;
  }
  return bounds;
}

function buildRoofAccent(ring = [], feature = {}, baseY = 0, height = 6, color = '#60a5fa') {
  if (typeof THREE === 'undefined') return null;
  const roofShape = String(feature?.threeD?.roofShape || 'flat').toLowerCase();
  if (roofShape === 'flat') return null;
  const bounds = ringBounds(ring);
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const roofHeight = Math.max(0.8, Math.min(3.2, height * 0.16));
  let geometry = null;

  if (roofShape === 'dome') {
    geometry = new THREE.SphereGeometry(Math.max(1, Math.min(bounds.width, bounds.depth) * 0.3), 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  } else if (roofShape === 'shed') {
    geometry = new THREE.BoxGeometry(Math.max(2, bounds.width * 0.88), roofHeight, Math.max(2, bounds.depth * 0.88));
  } else {
    geometry = new THREE.ConeGeometry(Math.max(1.4, Math.min(bounds.width, bounds.depth) * 0.42), roofHeight, roofShape === 'hipped' ? 4 : 3);
    geometry.rotateY(Math.PI * 0.25);
  }
  const material = new THREE.MeshStandardMaterial({
    color: colorHex(color, 0x60a5fa),
    roughness: 0.9,
    metalness: 0.02
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(centerX, baseY + height + roofHeight * 0.5 + 0.02, centerZ);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildBuildingEntranceGroup(feature = {}, baseY = 0, minHeight = 0) {
  if (typeof THREE === 'undefined') return null;
  const entrances = Array.isArray(feature?.threeD?.entrances) ? feature.threeD.entrances : [];
  if (!entrances.length) return null;
  const group = new THREE.Group();
  entrances.forEach((entry) => {
    if (!Number.isFinite(entry?.lat) || !Number.isFinite(entry?.lon)) return;
    const point = geometryToWorldData({ type: 'Point', coordinates: { lat: entry.lat, lon: entry.lon } }).coordinates;
    if (!point) return;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2.2, 0.16),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.64, metalness: 0.12 })
    );
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 1.92, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0x7f1d1d, emissiveIntensity: 0.08, roughness: 0.68, metalness: 0.08 })
    );
    frame.position.y = 1.1 + finiteNumber(entry?.elevation, 0);
    door.position.y = 1.08 + finiteNumber(entry?.elevation, 0);
    door.position.z = 0.06;
    const doorGroup = new THREE.Group();
    doorGroup.position.set(point.x, baseY + minHeight, point.z);
    doorGroup.rotation.y = Number.isFinite(Number(entry?.yaw)) ? Number(entry.yaw) : 0;
    doorGroup.add(frame);
    doorGroup.add(door);
    group.add(doorGroup);
  });
  return group;
}

function finalizeRenderableObject(object) {
  object?.traverse?.((child) => {
    child.frustumCulled = false;
  });
  return object;
}

function buildPolygonFeature(feature = {}, options = {}) {
  if (typeof THREE === 'undefined') return null;
  const preset = getOverlayPreset(feature.presetId);
  const world = geometryToWorldData(feature.geometry || {});
  const ring = Array.isArray(world.coordinates) ? world.coordinates[0] || [] : [];
  if (ring.length < 3) return null;
  const shape = polygonShapeFromRing(ring);
  if (!shape) return null;
  const color = options.color || preset.color;
  const sampleHeights = ring.map((point) => sampleSurfaceY(point.x, point.z, 0));
  const baseY = sampleHeights.length ? sampleHeights.reduce((sum, value) => sum + value, 0) / sampleHeights.length : 0;
  const isBuilding = preset.featureClass === 'building';

  const group = new THREE.Group();
  if (isBuilding) {
    const levelHeight = 3.3;
    const height = Math.max(
      3,
      finiteNumber(feature?.threeD?.height, 0) ||
      finiteNumber(feature?.threeD?.buildingLevels, 0) * levelHeight ||
      finiteNumber(feature?.tags?.height, 0) ||
      finiteNumber(feature?.tags?.['building:levels'], 0) * levelHeight ||
      9
    );
    const minHeight = Math.max(0, finiteNumber(feature?.threeD?.minHeight, 0));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({
      color: colorHex(color, 0x60a5fa),
      roughness: 0.86,
      metalness: 0.03
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = baseY + minHeight;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const roof = buildRoofAccent(ring, feature, baseY + minHeight, height, color);
    if (roof) group.add(roof);
    const entrances = buildBuildingEntranceGroup(feature, baseY, minHeight);
    if (entrances) group.add(entrances);
  } else {
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({
      color: colorHex(color, 0x22c55e),
      emissive: colorHex(color, 0x22c55e),
      emissiveIntensity: 0.05,
      roughness: 0.94,
      metalness: 0.02,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = baseY + 0.12;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const outline = buildLineRibbon([...ring, ring[0]], 0.45, color, 0.22);
  if (outline) group.add(outline);
  return finalizeRenderableObject(group);
}

function buildOverlayFeatureObject(feature = {}, options = {}) {
  const preset = getOverlayPreset(feature.presetId);
  const color = options.color || preset.color;
  let object = null;
  if (feature.geometryType === 'Point') {
    object = buildPointMarker(feature, { color, radius: options.pointRadius });
  } else if (feature.geometryType === 'LineString') {
    object = buildStyledLinearFeature(feature, preset, { color, yBias: options.yBias ?? 0.2 });
  } else if (feature.geometryType === 'Polygon') {
    object = buildPolygonFeature(feature, { color });
  }
  if (object) {
    finalizeRenderableObject(object);
    const center = featureWorldCenter(feature);
    const bounds = worldBoundsFromFeature(feature);
    object.userData.overlayFeatureId = feature.featureId || '';
    object.userData.overlayFeatureClass = feature.featureClass || preset.featureClass;
    object.userData.overlayGeometryType = feature.geometryType || preset.geometryType;
    object.userData.overlayPublished = options.published === true;
    if (Number.isFinite(center?.x) && Number.isFinite(center?.z)) {
      object.userData.lodCenter = { x: center.x, z: center.z };
    }
    if (bounds) {
      object.userData.localBounds = {
        minX: bounds.minX,
        maxX: bounds.maxX,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ
      };
    }
    if (String(object.userData.overlayFeatureClass || '').toLowerCase() === 'building') {
      object.userData.sourceBuildingId = `overlay:${feature.featureId || ''}`;
    }
  }
  return object;
}

function buildEditorHandles(feature = {}, options = {}) {
  if (typeof THREE === 'undefined') return null;
  const group = new THREE.Group();
  const world = geometryToWorldData(feature.geometry || {});
  const points = world.type === 'Point'
    ? [world.coordinates]
    : world.type === 'LineString'
      ? world.coordinates || []
      : Array.isArray(world.coordinates) ? world.coordinates[0] || [] : [];
  points.forEach((point, index) => {
    const sphere = new THREE.Mesh(
      new THREE.BoxGeometry(index === options.activeVertexIndex ? 0.54 : 0.36, index === options.activeVertexIndex ? 0.54 : 0.36, index === options.activeVertexIndex ? 0.54 : 0.36),
      new THREE.MeshStandardMaterial({
        color: index === options.activeVertexIndex ? 0xfef08a : 0xffffff,
        emissive: index === options.activeVertexIndex ? 0xfacc15 : 0x94a3b8,
        emissiveIntensity: 0.22
      })
    );
    sphere.position.set(point.x, sampleSurfaceY(point.x, point.z, 0) + 0.36, point.z);
    sphere.userData.overlayVertexIndex = index;
    group.add(sphere);
  });
  return finalizeRenderableObject(group);
}

function buildSnapMarker(point = null) {
  if (typeof THREE === 'undefined' || !point) return null;
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.95
    })
  );
  marker.position.set(point.x, sampleSurfaceY(point.x, point.z, 0) + 0.4, point.z);
  return finalizeRenderableObject(marker);
}

export {
  buildEditorHandles,
  buildOverlayFeatureObject,
  buildSnapMarker,
  disposeObject3D
};
