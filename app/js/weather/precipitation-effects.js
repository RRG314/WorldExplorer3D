function makeSnowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const gradient = context.createRadialGradient(16, 16, 1, 16, 16, 14);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.58, 'rgba(245,250,255,0.9)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function seededUnit(index, salt = 0) {
  const value = Math.sin((index + 1) * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function createPrecipitationEffects(appCtx) {
  const rainCount = 180;
  const snowCount = 130;
  const rainPositions = new Float32Array(rainCount * 6);
  const snowPositions = new Float32Array(snowCount * 3);
  let rain = null;
  let snow = null;
  let currentCategory = '';
  let lastCenterX = NaN;
  let lastCenterZ = NaN;

  function ensureObjects() {
    if (!appCtx.scene || typeof THREE === 'undefined') return false;
    if (!rain) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
      rain = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
        color: 0xb9d9ee,
        transparent: true,
        opacity: 0.58,
        depthWrite: false
      }));
      rain.frustumCulled = false;
      rain.renderOrder = 30;
      rain.userData.isWeatherEffect = true;
      appCtx.scene.add(rain);
    } else if (rain.parent !== appCtx.scene) {
      appCtx.scene.add(rain);
    }
    if (!snow) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
      snow = new THREE.Points(geometry, new THREE.PointsMaterial({
        color: 0xffffff,
        map: makeSnowTexture(),
        size: 0.34,
        transparent: true,
        opacity: 0.9,
        alphaTest: 0.08,
        depthWrite: false,
        sizeAttenuation: true
      }));
      snow.frustumCulled = false;
      snow.renderOrder = 30;
      snow.userData.isWeatherEffect = true;
      appCtx.scene.add(snow);
    } else if (snow.parent !== appCtx.scene) {
      appCtx.scene.add(snow);
    }
    return true;
  }

  function resetAroundCamera() {
    const center = appCtx.camera?.position || { x: 0, y: 12, z: 0 };
    lastCenterX = center.x;
    lastCenterZ = center.z;
    for (let i = 0; i < rainCount; i++) {
      const x = center.x + (seededUnit(i, 1) - 0.5) * 54;
      const y = center.y - 8 + seededUnit(i, 2) * 35;
      const z = center.z + (seededUnit(i, 3) - 0.5) * 54;
      const offset = i * 6;
      rainPositions[offset] = x;
      rainPositions[offset + 1] = y;
      rainPositions[offset + 2] = z;
      rainPositions[offset + 3] = x - 0.12;
      rainPositions[offset + 4] = y - 1.7;
      rainPositions[offset + 5] = z + 0.08;
    }
    for (let i = 0; i < snowCount; i++) {
      const offset = i * 3;
      snowPositions[offset] = center.x + (seededUnit(i, 4) - 0.5) * 48;
      snowPositions[offset + 1] = center.y - 6 + seededUnit(i, 5) * 30;
      snowPositions[offset + 2] = center.z + (seededUnit(i, 6) - 0.5) * 48;
    }
    rain?.geometry?.attributes?.position && (rain.geometry.attributes.position.needsUpdate = true);
    snow?.geometry?.attributes?.position && (snow.geometry.attributes.position.needsUpdate = true);
  }

  function setWeatherState(state) {
    currentCategory = String(state?.category || '');
    if (!ensureObjects()) return;
    const earthVisible = !appCtx.onMoon && !appCtx.onMars && !appCtx.spaceFlight?.active;
    rain.visible = earthVisible && (currentCategory === 'rain' || currentCategory === 'storm');
    snow.visible = earthVisible && currentCategory === 'snow';
    if (rain.visible || snow.visible) resetAroundCamera();
  }

  function update(dt = 0) {
    if (!ensureObjects()) return;
    const earthVisible = !appCtx.onMoon && !appCtx.onMars && !appCtx.spaceFlight?.active;
    rain.visible = earthVisible && (currentCategory === 'rain' || currentCategory === 'storm');
    snow.visible = earthVisible && currentCategory === 'snow';
    if (!rain.visible && !snow.visible) return;
    const center = appCtx.camera?.position || { x: 0, y: 12, z: 0 };
    if (!Number.isFinite(lastCenterX) || Math.hypot(center.x - lastCenterX, center.z - lastCenterZ) > 12) {
      resetAroundCamera();
    }
    if (rain.visible) {
      for (let i = 0; i < rainCount; i++) {
        const offset = i * 6;
        let y = rainPositions[offset + 1] - Math.max(0.08, dt * 32);
        if (y < center.y - 10) y = center.y + 22 + seededUnit(i, Math.floor(performance.now() / 1000) % 97) * 8;
        rainPositions[offset + 1] = y;
        rainPositions[offset + 4] = y - 1.7;
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
    if (snow.visible) {
      for (let i = 0; i < snowCount; i++) {
        const offset = i * 3;
        let y = snowPositions[offset + 1] - Math.max(0.02, dt * 3.2);
        if (y < center.y - 8) y = center.y + 20 + seededUnit(i, Math.floor(performance.now() / 1000) % 83) * 8;
        snowPositions[offset] += Math.sin(y * 0.13 + i) * dt * 0.6;
        snowPositions[offset + 1] = y;
      }
      snow.geometry.attributes.position.needsUpdate = true;
    }
  }

  return { setWeatherState, update };
}

export { createPrecipitationEffects };
