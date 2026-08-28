import { ctx as appCtx } from '../shared-context.js?v=55';
import { planetarySurfaceYAtRenderXZ } from './runtime/surface-query.js?v=1';

const TRACK_CAPACITY = 320;
const TRACK_SPACING = 2.1;
const TRACK_EMIT_DISTANCE = 1.15;
const transform = new THREE.Object3D();
let trackMesh = null;
let trackIndex = 0;
let lastPosition = null;
let activeBody = '';

function ensureTrackMesh() {
  if (trackMesh) return trackMesh;
  const geometry = new THREE.BoxGeometry(0.28, 0.014, 0.82);
  const material = new THREE.MeshBasicMaterial({
    color: 0x2b211d,
    transparent: true,
    opacity: 0.3,
    depthWrite: false
  });
  trackMesh = new THREE.InstancedMesh(geometry, material, TRACK_CAPACITY);
  trackMesh.name = 'Planetary Rover Tracks';
  trackMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trackMesh.frustumCulled = false;
  trackMesh.count = 0;
  trackMesh.userData.planetaryBody = 'tracks';
  appCtx.scene.add(trackMesh);
  return trackMesh;
}

function writeTrack(x, z, y, angle) {
  const mesh = ensureTrackMesh();
  transform.position.set(x, y + 0.025, z);
  transform.rotation.set(0, angle, 0);
  transform.scale.set(1, 1, 1);
  transform.updateMatrix();
  mesh.setMatrixAt(trackIndex, transform.matrix);
  trackIndex = (trackIndex + 1) % TRACK_CAPACITY;
  mesh.count = Math.min(TRACK_CAPACITY, mesh.count + 1);
  mesh.instanceMatrix.needsUpdate = true;
}

function clearPlanetaryTracks() {
  trackIndex = 0;
  lastPosition = null;
  activeBody = '';
  if (trackMesh) trackMesh.count = 0;
}

function updatePlanetaryTracks() {
  const body = appCtx.onMars ? 'mars' : appCtx.onMoon ? 'moon' : '';
  if (!body || appCtx.droneMode || appCtx.Walk?.state?.mode === 'walk') {
    if (trackMesh) trackMesh.visible = false;
    lastPosition = null;
    return;
  }
  const mesh = ensureTrackMesh();
  mesh.visible = true;
  if (body !== activeBody) {
    clearPlanetaryTracks();
    activeBody = body;
  }
  const x = Number(appCtx.car?.x) || 0;
  const z = Number(appCtx.car?.z) || 0;
  if (!lastPosition) {
    lastPosition = { x, z };
    return;
  }
  const distance = Math.hypot(x - lastPosition.x, z - lastPosition.z);
  if (distance < TRACK_EMIT_DISTANCE || Math.abs(Number(appCtx.car?.speed) || 0) < 0.35) return;

  const angle = Number(appCtx.car?.angle) || 0;
  const lateralX = Math.cos(angle) * TRACK_SPACING * 0.5;
  const lateralZ = -Math.sin(angle) * TRACK_SPACING * 0.5;
  const sampledY = planetarySurfaceYAtRenderXZ(appCtx, x, z, { bodyId: body });
  const y = Number.isFinite(sampledY) ? sampledY : (Number(appCtx.car?.y) || 0) - 1.2;
  writeTrack(x + lateralX, z + lateralZ, y, angle);
  writeTrack(x - lateralX, z - lateralZ, y, angle);
  lastPosition = { x, z };
}

Object.assign(appCtx, { clearPlanetaryTracks, updatePlanetaryTracks });

export { clearPlanetaryTracks, updatePlanetaryTracks };
