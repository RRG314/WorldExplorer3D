import { ctx as appCtx } from '../shared-context.js?v=55';
import {
  discoveryColorForActivity,
  discoveryIconForActivity,
  discoveryMarkerShape,
  sanitizeText
} from './schema.js?v=2';

const sceneState = {
  initialized: false,
  markerRoot: null,
  routeRoot: null,
  markers: new Map(),
  lastRouteSignature: '',
  clickHandlerBound: false,
  clickCallback: null
};

const _raycaster = typeof THREE !== 'undefined' ? new THREE.Raycaster() : null;
const _pointer = typeof THREE !== 'undefined' ? new THREE.Vector2() : null;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function destroyObject3D(object) {
  if (!object) return;
  object.traverse?.((child) => {
    if (child.geometry?.dispose) child.geometry.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material?.dispose?.();
    if (child.material?.map?.dispose) child.material.map.dispose();
  });
  object.parent?.remove(object);
}

function ensureSceneGroups() {
  if (sceneState.initialized || typeof THREE === 'undefined' || !appCtx.scene) return sceneState;
  sceneState.markerRoot = new THREE.Group();
  sceneState.markerRoot.name = 'ActivityDiscoveryMarkers';
  sceneState.routeRoot = new THREE.Group();
  sceneState.routeRoot.name = 'ActivityDiscoveryRoute';
  appCtx.scene.add(sceneState.markerRoot);
  appCtx.scene.add(sceneState.routeRoot);
  sceneState.initialized = true;
  return sceneState;
}

function canvasTextureLabel(text, color = '#e2e8f0', fill = 'rgba(8,15,28,0.86)') {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fill;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  const radius = 24;
  ctx.moveTo(radius, 8);
  ctx.lineTo(canvas.width - radius, 8);
  ctx.quadraticCurveTo(canvas.width - 8, 8, canvas.width - 8, radius);
  ctx.lineTo(canvas.width - 8, canvas.height - radius);
  ctx.quadraticCurveTo(canvas.width - 8, canvas.height - 8, canvas.width - radius, canvas.height - 8);
  ctx.lineTo(radius, canvas.height - 8);
  ctx.quadraticCurveTo(8, canvas.height - 8, 8, canvas.height - radius);
  ctx.lineTo(8, radius);
  ctx.quadraticCurveTo(8, 8, radius, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = '700 30px Orbitron, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sanitizeText(text, 42), canvas.width * 0.5, canvas.height * 0.52);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function markerTopMesh(shape = 'beacon', color = '#38bdf8') {
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.95
  });
  if (shape === 'diamond') {
    return new THREE.Mesh(new THREE.OctahedronGeometry(3.4, 0), material);
  }
  if (shape === 'triangle') {
    return new THREE.Mesh(new THREE.ConeGeometry(3.2, 6, 3), material);
  }
  if (shape === 'hex') {
    return new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 2.8, 6), material);
  }
  if (shape === 'ring') {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.8, 10, 28), material);
    mesh.rotation.x = Math.PI * 0.5;
    return mesh;
  }
  return new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.8, 6, 5), material);
}

function buildMarker(activity = {}) {
  const group = new THREE.Group();
  group.userData.activityId = activity.id;
  const color = discoveryColorForActivity(activity);
  const beaconMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.28
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 26, 8), beaconMaterial);
  beam.position.y = 13;
  beam.userData.activityId = activity.id;
  group.add(beam);

  const top = markerTopMesh(discoveryMarkerShape(activity), color);
  top.position.y = 27;
  top.userData.activityId = activity.id;
  group.add(top);

  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(4.8, 0.45, 8, 26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.78 })
  );
  baseRing.rotation.x = Math.PI * 0.5;
  baseRing.position.y = 0.35;
  baseRing.userData.activityId = activity.id;
  group.add(baseRing);

  const texture = canvasTextureLabel(`${discoveryIconForActivity(activity)} ${activity.title}`, color);
  if (texture) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    }));
    sprite.position.set(0, 36, 0);
    sprite.scale.set(22, 7.333, 1);
    sprite.userData.activityId = activity.id;
    group.add(sprite);
  }
  return group;
}

function rebuildRoutePreview(activity = null, runtimeTargetId = '', options = {}) {
  ensureSceneGroups();
  if (!sceneState.routeRoot) return;
  const showRoutePreview = options.showRoutePreview === true;
  const points = Array.isArray(activity?.previewRoute) ? activity.previewRoute : [];
  const signature = activity
    ? `${showRoutePreview ? 'route' : 'hidden'}|${sanitizeText(activity.id || '', 120).toLowerCase()}|${sanitizeText(runtimeTargetId || '', 120).toLowerCase()}|${points.map((point) => `${sanitizeText(point.id || point.label || '', 64)}:${Math.round(finiteNumber(point.x, 0))}:${Math.round(finiteNumber(point.y, 0))}:${Math.round(finiteNumber(point.z, 0))}`).join('|')}`
    : '';
  if (signature === sceneState.lastRouteSignature) return;
  sceneState.lastRouteSignature = signature;
  while (sceneState.routeRoot.children.length) {
    destroyObject3D(sceneState.routeRoot.children[0]);
  }
  if (!showRoutePreview || points.length < 2) return;
  if (points.length >= 2) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(point.x, point.y + 0.6, point.z)));
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(discoveryColorForActivity(activity)),
      transparent: true,
      opacity: 0.72
    });
    sceneState.routeRoot.add(new THREE.Line(geometry, material));
  }
  points.forEach((point, index) => {
    const tone = runtimeTargetId && runtimeTargetId === point.id ? '#fbbf24' : discoveryColorForActivity(activity);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(index === 0 ? 1.55 : 1.2, index === 0 ? 1.55 : 1.2, 0.14, 18),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(tone), transparent: true, opacity: index === 0 ? 0.88 : 0.62 })
    );
    disc.position.set(point.x, point.y + 0.16, point.z);
    sceneState.routeRoot.add(disc);
  });
}

function refreshWorldMarkers(activities = [], selectedActivity = null, runtimeSnapshot = null, options = {}) {
  ensureSceneGroups();
  if (!sceneState.markerRoot) return;
  const visibleIds = new Set();
  activities.forEach((activity) => {
    if (!activity || !activity.startPoint) return;
    visibleIds.add(activity.id);
    let marker = sceneState.markers.get(activity.id);
    if (!marker) {
      marker = buildMarker(activity);
      sceneState.markers.set(activity.id, marker);
      sceneState.markerRoot.add(marker);
    }
    marker.position.set(activity.startPoint.x, activity.startPoint.y, activity.startPoint.z);
    const distance = Math.max(60, Math.hypot(
      finiteNumber(appCtx.camera?.position?.x, 0) - activity.startPoint.x,
      finiteNumber(appCtx.camera?.position?.z, 0) - activity.startPoint.z
    ));
    const scale = Math.min(1.9, Math.max(0.85, distance / 420));
    marker.scale.setScalar(scale);
    marker.visible = true;
    marker.children.forEach((child) => {
      if (child.material?.color && activity.id === selectedActivity?.id) {
        child.material.color.set('#fbbf24');
      } else if (child.material?.color) {
        child.material.color.set(discoveryColorForActivity(activity));
      }
    });
  });

  Array.from(sceneState.markers.entries()).forEach(([activityId, marker]) => {
    if (visibleIds.has(activityId)) return;
    destroyObject3D(marker);
    sceneState.markers.delete(activityId);
  });

  rebuildRoutePreview(
    selectedActivity,
    sanitizeText(runtimeSnapshot?.targetId || runtimeSnapshot?.currentTargetId || '', 120).toLowerCase(),
    options
  );
}

function updateMarkerFacing() {
  if (!sceneState.initialized || !appCtx.camera) return;
  sceneState.markers.forEach((marker) => {
    marker.children.forEach((child) => {
      if (child instanceof THREE.Sprite) return;
      if (child.geometry instanceof THREE.TorusGeometry && child.position.y < 1) return;
    });
  });
}

function bindMarkerClicks(onActivityClick) {
  sceneState.clickCallback = typeof onActivityClick === 'function' ? onActivityClick : null;
  if (sceneState.clickHandlerBound || !_raycaster || !_pointer || !appCtx.renderer?.domElement || !appCtx.camera) return;
  const canvas = appCtx.renderer.domElement;
  canvas.addEventListener('click', (event) => {
    if (!sceneState.clickCallback) return;
    const target = event.target;
    if (target !== canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return;
    _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, appCtx.camera);
    const hits = _raycaster.intersectObjects(sceneState.markerRoot?.children || [], true);
    const hit = Array.isArray(hits) ? hits.find((entry) => entry.object?.userData?.activityId || entry.object?.parent?.userData?.activityId) : null;
    if (!hit) return;
    const activityId = sanitizeText(hit.object?.userData?.activityId || hit.object?.parent?.userData?.activityId || '', 120).toLowerCase();
    if (!activityId) return;
    sceneState.clickCallback(activityId, { source: 'world_marker' });
  });
  sceneState.clickHandlerBound = true;
}

export {
  bindMarkerClicks,
  refreshWorldMarkers,
  updateMarkerFacing
};
