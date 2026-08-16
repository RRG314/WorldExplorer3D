import { ctx as appCtx } from '../shared-context.js?v=55';
import {
  getActivityAnchorType,
  orderedRouteAnchors
} from './schema.js?v=2';

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function colorHex(input, fallback = 0x38bdf8) {
  const text = String(input || '').trim();
  if (!text) return fallback;
  const normalized = text.startsWith('#') ? text.slice(1) : text;
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function disposeMaterial(material) {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach((entry) => disposeMaterial(entry));
    return;
  }
  if (material.map?.dispose) material.map.dispose();
  material.dispose?.();
}

function disposeObject3D(object) {
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (child.material) disposeMaterial(child.material);
  });
}

function buildLabelSprite(text, options = {}) {
  if (typeof THREE === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 112;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = options.background || 'rgba(8, 15, 28, 0.86)';
  context.strokeStyle = options.border || 'rgba(125, 211, 252, 0.85)';
  context.lineWidth = 6;
  const radius = 18;
  context.beginPath();
  context.moveTo(radius, 6);
  context.lineTo(canvas.width - radius, 6);
  context.quadraticCurveTo(canvas.width - 6, 6, canvas.width - 6, radius);
  context.lineTo(canvas.width - 6, canvas.height - radius - 18);
  context.quadraticCurveTo(canvas.width - 6, canvas.height - 18, canvas.width - radius, canvas.height - 18);
  context.lineTo(canvas.width * 0.58, canvas.height - 18);
  context.lineTo(canvas.width * 0.5, canvas.height - 2);
  context.lineTo(canvas.width * 0.42, canvas.height - 18);
  context.lineTo(radius, canvas.height - 18);
  context.quadraticCurveTo(6, canvas.height - 18, 6, canvas.height - radius - 18);
  context.lineTo(6, radius);
  context.quadraticCurveTo(6, 6, radius, 6);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = options.color || '#ecfeff';
  context.font = '700 34px Orbitron, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(text || '').slice(0, 18), canvas.width * 0.5, 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(options.width || 9, options.height || 3.1, 1);
  sprite.renderOrder = 12;
  return sprite;
}

function addPulseHalo(group, color) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.36, 0.06, 10, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    })
  );
  ring.rotation.x = Math.PI * 0.5;
  ring.position.y = 0.1;
  group.add(ring);
}

function makeHitProxy(anchorId, radius = 1.4, y = 1.4) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
  );
  mesh.position.y = y;
  mesh.userData.activityAnchorId = anchorId;
  return mesh;
}

function buildStartAnchor(anchor, color) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.2, 0.24, 24),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18, roughness: 0.6, metalness: 0.1 })
  );
  base.position.y = 0.14;
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.2, 16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.5, metalness: 0.08 })
  );
  cone.position.y = 1.1;
  group.add(base);
  group.add(cone);
  return group;
}

function buildCheckpointAnchor(anchor, color) {
  const group = new THREE.Group();
  const left = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 2.2, 12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.16, roughness: 0.62 })
  );
  const right = left.clone();
  left.position.set(-1.05, 1.1, 0);
  right.position.set(1.05, 1.1, 0);
  const gate = new THREE.Mesh(
    new THREE.TorusGeometry(1.14, 0.12, 10, 32),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.24, roughness: 0.42, metalness: 0.08 })
  );
  gate.rotation.x = Math.PI * 0.5;
  gate.position.y = 1.2;
  group.add(left);
  group.add(right);
  group.add(gate);
  return group;
}

function buildFinishAnchor(anchor, color) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 2.8, 10),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.45, metalness: 0.38 })
  );
  pole.position.y = 1.4;
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.9, 1, 1),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.16, side: THREE.DoubleSide, roughness: 0.52 })
  );
  flag.position.set(0.85, 2.0, 0);
  flag.rotation.y = -0.22;
  group.add(pole);
  group.add(flag);
  return group;
}

function buildTriggerZoneAnchor(anchor, color) {
  const width = Math.max(1.2, finiteNumber(anchor.sizeX, 12));
  const height = Math.max(1, finiteNumber(anchor.sizeY, 6));
  const depth = Math.max(1.2, finiteNumber(anchor.sizeZ, 12));
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.18,
      emissive: color,
      emissiveIntensity: 0.12,
      depthWrite: false
    })
  );
  mesh.position.y = height * 0.5;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)),
    new THREE.LineBasicMaterial({ color })
  );
  edges.position.y = height * 0.5;
  group.add(mesh);
  group.add(edges);
  return group;
}

function buildBarrierAnchor(anchor, color) {
  const group = new THREE.Group();
  const legMaterial = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.68, metalness: 0.14 });
  const boardMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18, roughness: 0.44, metalness: 0.08 });
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 0.12), legMaterial);
  const rightLeg = leftLeg.clone();
  leftLeg.position.set(-1.1, 0.52, 0);
  rightLeg.position.set(1.1, 0.52, 0);
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.42, 0.18), boardMaterial);
  board.position.y = 1.0;
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.52, metalness: 0.04 });
  const stripeA = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 0.2), stripeMaterial);
  const stripeB = stripeA.clone();
  stripeA.position.set(-0.54, 1.0, 0.02);
  stripeB.position.set(0.54, 1.0, 0.02);
  stripeA.rotation.z = -0.32;
  stripeB.rotation.z = 0.32;
  group.add(leftLeg);
  group.add(rightLeg);
  group.add(board);
  group.add(stripeA);
  group.add(stripeB);
  return group;
}

function buildHazardZoneAnchor(anchor, color) {
  const radius = Math.max(3, Math.max(finiteNumber(anchor.sizeX, 16), finiteNumber(anchor.sizeZ, 16)) * 0.32);
  const height = Math.max(1.8, finiteNumber(anchor.sizeY, 6));
  const group = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 28, 1, true),
    new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      emissive: color,
      emissiveIntensity: 0.18,
      depthWrite: false
    })
  );
  dome.position.y = height * 0.5;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.12, 10, 42),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.84, depthWrite: false })
  );
  rim.rotation.x = Math.PI * 0.5;
  rim.position.y = 0.08;
  group.add(dome);
  group.add(rim);
  return group;
}

function buildBoostRingAnchor(anchor, color) {
  const radius = Math.max(2.6, finiteNumber(anchor.radius, 6));
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.18, 14, 48),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.26, roughness: 0.32, metalness: 0.1 })
  );
  ring.rotation.y = Math.PI * 0.5;
  ring.position.y = radius;
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 1.2, 12),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xf8fafc, emissiveIntensity: 0.08, roughness: 0.38 })
  );
  arrow.position.set(0, radius, 0);
  arrow.rotation.z = -Math.PI * 0.5;
  group.add(ring);
  group.add(arrow);
  return group;
}

function buildCollectibleAnchor(anchor, color) {
  const group = new THREE.Group();
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.58, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.24, roughness: 0.34, metalness: 0.15 })
  );
  gem.position.y = 1.4;
  group.add(gem);
  return group;
}

function buildFishingZoneAnchor(anchor, color) {
  const radius = Math.max(4, finiteNumber(anchor.radius, 18));
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.18, 12, 72),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18, transparent: true, opacity: 0.78, roughness: 0.54 })
  );
  ring.rotation.x = Math.PI * 0.5;
  ring.position.y = 0.08;
  const fish = new THREE.Mesh(
    new THREE.ConeGeometry(0.46, 1.2, 12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.16, roughness: 0.46 })
  );
  fish.rotation.z = Math.PI * 0.5;
  fish.position.y = 1.0;
  group.add(ring);
  group.add(fish);
  return group;
}

function buildBuoyGateAnchor(anchor, color) {
  const spread = Math.max(4, finiteNumber(anchor.radius, 10));
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.16, roughness: 0.5 });
  const left = new THREE.Mesh(new THREE.SphereGeometry(0.56, 14, 12), material);
  const right = left.clone();
  left.position.set(-spread * 0.5, 0.56, 0);
  right.position.set(spread * 0.5, 0.56, 0);
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(spread * 0.5, 0.12, 10, 34, Math.PI),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, roughness: 0.42 })
  );
  arch.rotation.z = Math.PI;
  arch.position.y = 1.72;
  group.add(left);
  group.add(right);
  group.add(arch);
  return group;
}

function buildDockAnchor(anchor, color) {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 2.2, 10),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.54 })
  );
  stem.position.y = 1.1;
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.14, roughness: 0.54 })
  );
  arm.position.y = 1.82;
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.26, 0.72, 12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22, roughness: 0.48 })
  );
  arrow.rotation.x = Math.PI * 0.5;
  arrow.position.set(0, 0.5, 1.05);
  group.add(stem);
  group.add(arm);
  group.add(arrow);
  return group;
}

function buildAnchorVisual(anchor, options = {}) {
  if (typeof THREE === 'undefined') return null;
  const anchorType = getActivityAnchorType(anchor.typeId);
  const isGhost = options.ghost === true;
  const baseColor = anchor.valid === false ? '#ef4444' : (options.color || anchorType.color);
  const color = colorHex(baseColor, 0x38bdf8);
  const group = new THREE.Group();
  group.position.set(finiteNumber(anchor.x), finiteNumber(anchor.y), finiteNumber(anchor.z));
  group.rotation.y = finiteNumber(anchor.yaw, 0);
  group.renderOrder = isGhost ? 9 : 7;

  let visual = null;
  if (anchor.typeId === 'start') visual = buildStartAnchor(anchor, color);
  else if (anchor.typeId === 'checkpoint') visual = buildCheckpointAnchor(anchor, color);
  else if (anchor.typeId === 'finish') visual = buildFinishAnchor(anchor, color);
  else if (anchor.typeId === 'trigger_zone') visual = buildTriggerZoneAnchor(anchor, color);
  else if (anchor.typeId === 'obstacle_barrier') visual = buildBarrierAnchor(anchor, color);
  else if (anchor.typeId === 'hazard_zone') visual = buildHazardZoneAnchor(anchor, color);
  else if (anchor.typeId === 'boost_ring') visual = buildBoostRingAnchor(anchor, color);
  else if (anchor.typeId === 'collectible') visual = buildCollectibleAnchor(anchor, color);
  else if (anchor.typeId === 'fishing_zone') visual = buildFishingZoneAnchor(anchor, color);
  else if (anchor.typeId === 'buoy_gate') visual = buildBuoyGateAnchor(anchor, color);
  else if (anchor.typeId === 'dock_point') visual = buildDockAnchor(anchor, color);
  if (visual) group.add(visual);

  if (options.selected === true) addPulseHalo(group, color);
  if (options.ghost === true) {
    group.traverse((child) => {
      if (child.material) {
        child.material.transparent = true;
        child.material.opacity = Math.min(0.72, child.material.opacity ?? 0.72);
        child.material.depthWrite = false;
      }
    });
  } else {
    const label = buildLabelSprite(options.badgeText || anchor.label || anchorType.label, {
      background: 'rgba(8, 15, 28, 0.82)',
      border: anchor.valid === false ? 'rgba(248, 113, 113, 0.95)' : 'rgba(125, 211, 252, 0.92)',
      width: 7.2,
      height: 2.6
    });
    if (label) {
      label.position.set(
        0,
        anchor.typeId === 'trigger_zone' || anchor.typeId === 'hazard_zone'
          ? Math.max(4.2, finiteNumber(anchor.sizeY, 6) + 1.6)
          : anchor.typeId === 'boost_ring'
            ? Math.max(4.2, finiteNumber(anchor.radius, 6) * 1.85)
            : 3.4,
        0
      );
      group.add(label);
    }
    group.add(
      makeHitProxy(
        anchor.id,
        anchor.typeId === 'trigger_zone' || anchor.typeId === 'hazard_zone'
          ? Math.max(1.8, finiteNumber(anchor.sizeX, 12) * 0.18)
          : anchor.typeId === 'boost_ring' || anchor.typeId === 'buoy_gate'
            ? Math.max(1.8, finiteNumber(anchor.radius, 6) * 0.2)
            : 1.5,
        1.5
      )
    );
  }
  group.userData.activityAnchorId = anchor.id;
  return group;
}

function buildRouteVisualization(anchors = [], options = {}) {
  if (typeof THREE === 'undefined') return null;
  const route = orderedRouteAnchors(anchors);
  if (route.length < 2) return null;
  const group = new THREE.Group();
  const points = route.map((anchor) => new THREE.Vector3(anchor.x, anchor.y + 0.35, anchor.z));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineDashedMaterial({
    color: colorHex(options.color || '#67e8f9', 0x67e8f9),
    dashSize: 4,
    gapSize: 2,
    transparent: true,
    opacity: 0.92,
    depthWrite: false
  });
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances();
  line.renderOrder = 5;
  group.add(line);

  for (let index = 1; index < route.length; index += 1) {
    const prev = route[index - 1];
    const next = route[index];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.5) continue;
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.92, 10),
      new THREE.MeshStandardMaterial({ color: colorHex(options.color || '#67e8f9', 0x67e8f9), emissive: colorHex(options.color || '#67e8f9', 0x67e8f9), emissiveIntensity: 0.12 })
    );
    const angle = Math.atan2(dx, dz);
    arrow.rotation.x = Math.PI * 0.5;
    arrow.rotation.z = Math.PI;
    arrow.rotation.y = -angle;
    arrow.position.set((prev.x + next.x) * 0.5, (prev.y + next.y) * 0.5 + 0.42, (prev.z + next.z) * 0.5);
    group.add(arrow);
  }
  group.renderOrder = 5;
  return group;
}

function buildSelectedHandles(anchor, options = {}) {
  if (typeof THREE === 'undefined' || !anchor) return null;
  const color = colorHex(options.color || '#f8fafc', 0xf8fafc);
  const group = new THREE.Group();
  group.position.set(anchor.x, anchor.y, anchor.z);
  group.rotation.y = anchor.yaw || 0;

  const moveRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.8, 0.05, 8, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false })
  );
  moveRing.rotation.x = Math.PI * 0.5;
  moveRing.position.y = 0.08;
  group.add(moveRing);

  const heightStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8),
    new THREE.MeshBasicMaterial({ color })
  );
  heightStem.position.y = 1.15;
  const heightCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.42, 10),
    new THREE.MeshBasicMaterial({ color })
  );
  heightCone.position.y = 2.5;
  group.add(heightStem);
  group.add(heightCone);

  const rotateRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.5, 0.04, 8, 56),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.82, depthWrite: false })
  );
  rotateRing.rotation.z = Math.PI * 0.5;
  rotateRing.position.y = 1.05;
  group.add(rotateRing);

  if (anchor.typeId === 'trigger_zone' || anchor.typeId === 'hazard_zone' || anchor.typeId === 'fishing_zone' || anchor.typeId === 'boost_ring' || anchor.typeId === 'buoy_gate') {
    const radial = anchor.typeId === 'fishing_zone' || anchor.typeId === 'boost_ring' || anchor.typeId === 'buoy_gate';
    const width = radial ? Math.max(4, finiteNumber(anchor.radius, anchor.typeId === 'buoy_gate' ? 10 : 18) * 2) : Math.max(1.2, finiteNumber(anchor.sizeX, 12));
    const height = anchor.typeId === 'fishing_zone'
      ? 0.2
      : anchor.typeId === 'boost_ring'
        ? Math.max(3, finiteNumber(anchor.radius, 6) * 1.9)
        : Math.max(1, finiteNumber(anchor.sizeY, 6));
    const depth = radial ? Math.max(4, finiteNumber(anchor.radius, anchor.typeId === 'buoy_gate' ? 10 : 18) * 2) : Math.max(1.2, finiteNumber(anchor.sizeZ, 12));
    const bounds = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)),
      new THREE.LineBasicMaterial({ color: 0xf472b6 })
    );
    bounds.position.y = anchor.typeId === 'fishing_zone' ? 0.12 : height * 0.5;
    group.add(bounds);
  }
  group.renderOrder = 11;
  return group;
}

function ensureSceneGroups(sceneState) {
  if (sceneState.initialized || !appCtx.scene || typeof THREE === 'undefined') return sceneState;
  sceneState.routeGroup = new THREE.Group();
  sceneState.anchorGroup = new THREE.Group();
  sceneState.ghostGroup = new THREE.Group();
  sceneState.handleGroup = new THREE.Group();
  sceneState.routeGroup.name = 'ActivityCreatorRouteGroup';
  sceneState.anchorGroup.name = 'ActivityCreatorAnchorGroup';
  sceneState.ghostGroup.name = 'ActivityCreatorGhostGroup';
  sceneState.handleGroup.name = 'ActivityCreatorHandleGroup';
  appCtx.scene.add(sceneState.routeGroup);
  appCtx.scene.add(sceneState.anchorGroup);
  appCtx.scene.add(sceneState.ghostGroup);
  appCtx.scene.add(sceneState.handleGroup);
  sceneState.initialized = true;
  return sceneState;
}

function clearGroup(group) {
  if (!group) return;
  while (group.children.length > 0) {
    const child = group.children.pop();
    group.remove(child);
    disposeObject3D(child);
  }
}

function refreshActivityScene(sceneState, activityState = {}) {
  ensureSceneGroups(sceneState);
  clearGroup(sceneState.routeGroup);
  clearGroup(sceneState.anchorGroup);
  clearGroup(sceneState.ghostGroup);
  clearGroup(sceneState.handleGroup);
  if (!activityState.active) return;

  const routeObject = buildRouteVisualization(activityState.anchors || [], {
    color: activityState.testing?.active ? '#22d3ee' : '#67e8f9'
  });
  if (routeObject) sceneState.routeGroup.add(routeObject);

  const ordered = orderedRouteAnchors(activityState.anchors || []);
  const routeIndexMap = new Map();
  ordered.forEach((anchor, index) => {
    const badge = anchor.typeId === 'start' ? 'S' : anchor.typeId === 'finish' ? 'F' : String(index);
    routeIndexMap.set(anchor.id, badge);
  });

  for (const anchor of activityState.anchors || []) {
    const isSelected = anchor.id === activityState.selectedAnchorId;
    const isTarget = activityState.testing?.active && anchor.id === activityState.testing.currentTargetId;
    const object = buildAnchorVisual(anchor, {
      selected: isSelected || isTarget,
      color: isTarget ? '#f8fafc' : undefined,
      badgeText: routeIndexMap.get(anchor.id) || anchor.label
    });
    if (object) sceneState.anchorGroup.add(object);
    if (isSelected) {
      const handles = buildSelectedHandles(anchor);
      if (handles) sceneState.handleGroup.add(handles);
    }
  }

  if (activityState.cursor && activityState.tool === 'place') {
    const ghostAnchor = {
      id: 'ghost',
      typeId: activityState.anchorTypeId,
      label: 'Preview',
      x: activityState.cursor.x,
      y: activityState.cursor.y,
      z: activityState.cursor.z,
      yaw: activityState.cursorYaw || 0,
      radius: activityState.cursorRadius || 18,
      sizeX: activityState.cursorSizeX || 14,
      sizeY: activityState.cursorSizeY || 6,
      sizeZ: activityState.cursorSizeZ || 14,
      valid: activityState.cursor.valid !== false
    };
    const ghost = buildAnchorVisual(ghostAnchor, {
      ghost: true,
      color: activityState.cursor.valid === false ? '#ef4444' : '#34d399'
    });
    if (ghost) sceneState.ghostGroup.add(ghost);
  }
}

export {
  clearGroup,
  disposeObject3D,
  ensureSceneGroups,
  refreshActivityScene
};
