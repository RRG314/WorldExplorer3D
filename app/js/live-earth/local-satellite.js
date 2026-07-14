function disposeSprite(sprite) {
  if (!sprite) return;
  sprite.material?.map?.dispose?.();
  sprite.material?.dispose?.();
}

function createSatelliteLabelSprite(label = 'Satellite') {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const text = String(label || 'Satellite').trim() || 'Satellite';
  const x = 42;
  const y = 34;
  const w = canvas.width - x * 2;
  const h = 168;
  const r = 42;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(6,12,24,0.94)';
  ctx.strokeStyle = 'rgba(194,236,255,0.98)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  let fontSize = 124;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  while (fontSize > 56) {
    ctx.font = `700 ${fontSize}px Poppins, Inter, sans-serif`;
    if (ctx.measureText(text).width <= (w - 160)) break;
    fontSize -= 6;
  }

  ctx.strokeStyle = 'rgba(4, 10, 20, 0.96)';
  ctx.lineWidth = Math.max(10, Math.round(fontSize * 0.18));
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 3;
  ctx.strokeText(text, canvas.width / 2, y + h / 2 + 4);
  ctx.fillText(text, canvas.width / 2, y + h / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if ('encoding' in texture && THREE.sRGBEncoding) {
    texture.encoding = THREE.sRGBEncoding;
  }
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: false,
    fog: false,
    toneMapped: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(620, 156, 1);
  sprite.position.set(0, 82, 0);
  sprite.renderOrder = 999;
  sprite.frustumCulled = false;
  sprite.userData.labelText = text;
  return sprite;
}

function ensureLocalSatelliteVisual(ctx, state) {
  if (state.localSatelliteVisual || !ctx.appCtx.scene) return;
  const group = new THREE.Group();
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(8, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x9ed9ff, transparent: true, opacity: 0.34, depthWrite: false, fog: false, toneMapped: false })
  );
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, fog: false, toneMapped: false })
  );
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 18, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.38, depthWrite: false, fog: false, toneMapped: false })
  );
  beacon.rotation.z = Math.PI * 0.5;
  beacon.position.y = -2;
  group.add(glow);
  group.add(core);
  group.add(beacon);
  group.visible = false;
  group.renderOrder = 999;
  group.traverse((child) => {
    child.frustumCulled = false;
    child.renderOrder = 999;
  });
  ctx.appCtx.scene.add(group);
  state.localSatelliteVisual = group;
}

function updateLocalSatelliteLabel(ctx, state) {
  const group = state.localSatelliteVisual;
  if (!group) return;
  const label = ctx.selectedSatelliteEntry(state)?.label || 'Satellite';
  const current = group.userData?.labelSprite || null;
  if (current?.userData?.labelText === label) return;
  if (current) {
    group.remove(current);
    disposeSprite(current);
  }
  const next = createSatelliteLabelSprite(label);
  if (!group.userData) group.userData = {};
  group.userData.labelSprite = next;
  if (next) group.add(next);
}

function positionLocalSatelliteVisual(ctx, state, look) {
  if (!state.localSatelliteVisual || !look || !ctx.appCtx.camera) return;
  const vector = horizontalToWorldVector(look.azimuthDeg, look.elevationDeg);
  const anchor = 1180;
  state.localSatelliteVisual.position.set(
    ctx.appCtx.camera.position.x + vector.x * anchor,
    ctx.appCtx.camera.position.y + vector.y * anchor,
    ctx.appCtx.camera.position.z + vector.z * anchor
  );
  state.localSatelliteVisual.lookAt(ctx.appCtx.camera.position);
  state.localSatelliteVisual.visible = true;
}

export function updateLocalSatelliteVisual(ctx, state) {
  if (!state.selectedSatelliteId || !ctx.appCtx.camera || ctx.appCtx.onMoon || ctx.appCtx.travelingToMoon) {
    if (state.localSatelliteVisual) state.localSatelliteVisual.visible = false;
    return;
  }
  ensureLocalSatelliteVisual(ctx, state);
  updateLocalSatelliteLabel(ctx, state);
  const observer = ctx.resolveObservedEarthLocation();
  if (!Number.isFinite(observer?.lat) || !Number.isFinite(observer?.lon)) {
    if (state.localSatelliteVisual) state.localSatelliteVisual.visible = false;
    return;
  }
  const observerKey = `${state.selectedSatelliteId}:${observer.lat.toFixed(2)}:${observer.lon.toFixed(2)}`;
  const now = Date.now();
  if (state.localSatelliteLook && state.localSatelliteObserverKey === observerKey && (now - state.localSatelliteLookAt) < 5000) {
    const look = state.localSatelliteLook;
    if (!state.localSatelliteVisual || !look || look.elevationDeg < 4) {
      if (state.localSatelliteVisual) state.localSatelliteVisual.visible = false;
      return;
    }
    positionLocalSatelliteVisual(ctx, state, look);
    return;
  }
  ctx.getSatelliteLookAngles(state.selectedSatelliteId, observer, new Date()).then((look) => {
    state.localSatelliteLook = look;
    state.localSatelliteLookAt = now;
    state.localSatelliteObserverKey = observerKey;
    if (!state.localSatelliteVisual || !look || look.elevationDeg < 4) {
      if (state.localSatelliteVisual) state.localSatelliteVisual.visible = false;
      ctx.renderLiveEarthUi(state);
      return;
    }
    positionLocalSatelliteVisual(ctx, state, look);
    ctx.renderLiveEarthUi(state);
  }).catch(() => {
    if (state.localSatelliteVisual) state.localSatelliteVisual.visible = false;
  });
}
function horizontalToWorldVector(azimuthDeg, elevationDeg) {
  const azimuth = (Number(azimuthDeg) || 0) * Math.PI / 180;
  const altitude = (Number(elevationDeg) || 0) * Math.PI / 180;
  const azimuthFromNorth = azimuth + Math.PI;
  const cosAltitude = Math.cos(altitude);
  return new THREE.Vector3(
    cosAltitude * Math.sin(azimuthFromNorth),
    Math.sin(altitude),
    -cosAltitude * Math.cos(azimuthFromNorth)
  ).normalize();
}
