const FULL_TURN_RAD = Math.PI * 2;
const VALID_MODES = new Set(['drive', 'walk', 'drone', 'space', 'moon']);
const GHOST_TICK_INTERVAL_MS = 1000 / 30;
const MIN_DT_SECONDS = 0.001;
const MAX_DT_SECONDS = 0.09;
const MAX_EXTRAPOLATE_SECONDS = 3.5;
const MAX_NETWORK_SPEED = 90;
const MAX_NETWORK_SPEED_EPSILON = 0.001;
const SERVER_TIME_PAST_WINDOW_MS = 12000;
const SERVER_TIME_FUTURE_WINDOW_MS = 50;
const WALK_MOVE_THRESHOLD = 0.35;
const WALK_MAX_SWING_SPEED = 11;
const WALK_SWING_BASE_SPEED = 4;
const WALK_SWING_SPEED_SCALE = 0.75;
const WALK_LEG_SWING = 0.48;
const WALK_ARM_SWING = 0.36;
const WALK_BOB_AMPLITUDE = 0.05;
const WALK_IDLE_DECAY_RATE = 6;
const CAR_WHEEL_SPIN_SCALE = 2.1;
const DRONE_ROTOR_BASE_SPIN = 12;
const DRONE_ROTOR_SPEED_SCALE = 0.6;
const AUTO_FACING_SPEED_THRESHOLD = 0.2;
const YAW_STIFFNESS = 12;
const TELEPORT_DISTANCE_BY_PROXY = Object.freeze({
  walker: 60,
  car: 60,
  drone: 120,
  space: 220
});
const SMOOTHING_FAR_DISTANCE = 25;
const SMOOTHING_MID_DISTANCE = 8;
const SMOOTHING_NEAR_STIFFNESS = 8.2;
const SMOOTHING_MID_STIFFNESS = 10.5;
const SMOOTHING_FAR_STIFFNESS = 14;
const POSITION_ALPHA_MIN = 0.06;
const POSITION_ALPHA_MAX = 0.92;
const YAW_ALPHA_MIN = 0.08;
const YAW_ALPHA_MAX = 0.9;

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toMillis(value, fallback = Date.now()) {
  if (!value) return fallback;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function shortestAngleDelta(target, current) {
  let delta = (target - current) % FULL_TURN_RAD;
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function normalizeMode(rawMode) {
  const mode = String(rawMode || '').toLowerCase();
  return VALID_MODES.has(mode) ? mode : 'walk';
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }

  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function createNameTag(THREE, labelText) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const text = String(labelText || 'Explorer').slice(0, 24);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8, 20, 38, 0.86)';
  ctx.strokeStyle = 'rgba(83, 196, 255, 0.95)';
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, 8, 12, canvas.width - 16, canvas.height - 24, 24);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#e6f4ff';
  ctx.font = '600 44px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(8, 2, 1);

  return { canvas, texture, sprite };
}

function createWalkerProxy(THREE) {
  const group = new THREE.Group();
  const scale = 1.35;
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x7eb6f2 });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xf3dcc2 });
  const legMat = new THREE.MeshBasicMaterial({ color: 0x6b7280 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42 * scale, 0.62 * scale, 0.28 * scale), bodyMat);
  body.position.y = 1.0 * scale;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 16, 14), headMat);
  head.position.y = 1.55 * scale;
  group.add(head);

  const legLeftPivot = new THREE.Group();
  const legLeft = new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.62 * scale, 0.16 * scale), legMat);
  legLeft.position.y = -0.31 * scale;
  legLeftPivot.position.set(-0.11 * scale, 0.71 * scale, 0);
  legLeftPivot.add(legLeft);
  group.add(legLeftPivot);

  const legRightPivot = new THREE.Group();
  const legRight = new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.62 * scale, 0.16 * scale), legMat);
  legRight.position.y = -0.31 * scale;
  legRightPivot.position.set(0.11 * scale, 0.71 * scale, 0);
  legRightPivot.add(legRight);
  group.add(legRightPivot);

  const armMat = bodyMat.clone();
  armMat.color.setHex(0x6ea8ec);

  const armLeftPivot = new THREE.Group();
  const armLeft = new THREE.Mesh(new THREE.BoxGeometry(0.10 * scale, 0.52 * scale, 0.10 * scale), armMat);
  armLeft.position.y = -0.26 * scale;
  armLeftPivot.position.set(-0.26 * scale, 1.21 * scale, 0);
  armLeftPivot.add(armLeft);
  group.add(armLeftPivot);

  const armRightPivot = new THREE.Group();
  const armRight = new THREE.Mesh(new THREE.BoxGeometry(0.10 * scale, 0.52 * scale, 0.10 * scale), armMat);
  armRight.position.y = -0.26 * scale;
  armRightPivot.position.set(0.26 * scale, 1.21 * scale, 0);
  armRightPivot.add(armRight);
  group.add(armRightPivot);

  group.userData.limbs = {
    scale,
    body,
    legLeftPivot,
    legRightPivot,
    armLeftPivot,
    armRightPivot
  };

  return group;
}

function createCarProxy(THREE) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x247de8 });
  const trimMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x7ec8ff, transparent: true, opacity: 0.65 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 3.4), bodyMat);
  body.position.y = 0.52;
  group.add(body);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.35, 1.5), bodyMat);
  roof.position.set(0, 0.94, -0.08);
  group.add(roof);

  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.44), glassMat);
  windshield.position.set(0, 0.95, 0.48);
  windshield.rotation.x = -0.45;
  group.add(windshield);

  const wheelGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 12);
  const wheelOffsets = [
    [-0.78, 0.24, 1.08],
    [0.78, 0.24, 1.08],
    [-0.78, 0.24, -1.08],
    [0.78, 0.24, -1.08]
  ];
  const wheels = [];
  for (const [x, y, z] of wheelOffsets) {
    const wheel = new THREE.Mesh(wheelGeom, trimMat);
    wheel.position.set(x, y, z);
    wheel.rotation.z = Math.PI * 0.5;
    group.add(wheel);
    wheels.push(wheel);
  }

  const lightMat = new THREE.MeshBasicMaterial({ color: 0xbbe9ff });
  const headLeft = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), lightMat);
  headLeft.position.set(-0.52, 0.54, 1.66);
  group.add(headLeft);
  const headRight = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), lightMat);
  headRight.position.set(0.52, 0.54, 1.66);
  group.add(headRight);

  group.userData.wheels = wheels;
  return group;
}

function createDroneProxy(THREE) {
  const group = new THREE.Group();
  const shellMat = new THREE.MeshBasicMaterial({ color: 0x3ba7ff });
  const propMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), shellMat);
  body.position.y = 0.5;
  group.add(body);

  const armGeom = new THREE.BoxGeometry(1.1, 0.08, 0.08);
  const armA = new THREE.Mesh(armGeom, propMat);
  armA.position.y = 0.5;
  group.add(armA);

  const armB = new THREE.Mesh(armGeom, propMat);
  armB.position.y = 0.5;
  armB.rotation.y = Math.PI * 0.5;
  group.add(armB);

  const rotorGeom = new THREE.CylinderGeometry(0.16, 0.16, 0.03, 16);
  const rotorOffsets = [
    [0.55, 0.56, 0],
    [-0.55, 0.56, 0],
    [0, 0.56, 0.55],
    [0, 0.56, -0.55]
  ];
  const rotors = [];
  for (const [x, y, z] of rotorOffsets) {
    const rotor = new THREE.Mesh(rotorGeom, propMat);
    rotor.position.set(x, y, z);
    rotor.rotation.x = Math.PI * 0.5;
    group.add(rotor);
    rotors.push(rotor);
  }

  group.userData.rotors = rotors;
  return group;
}

function createSpaceProxy(THREE) {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1 });
  const accentMat = new THREE.MeshBasicMaterial({ color: 0x2563eb });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.1, 10), hullMat);
  body.position.y = 0.56;
  group.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 10), accentMat);
  nose.position.y = 1.32;
  group.add(nose);

  const finGeom = new THREE.BoxGeometry(0.04, 0.32, 0.2);
  for (const sign of [-1, 1]) {
    const fin = new THREE.Mesh(finGeom, accentMat);
    fin.position.set(sign * 0.18, 0.18, -0.04);
    group.add(fin);
  }

  return group;
}

function nameTagHeightForProxy(proxyType) {
  if (proxyType === 'car') return 2.55;
  if (proxyType === 'drone') return 2.25;
  if (proxyType === 'space') return 3.0;
  return 3.3;
}

function yOffsetForProxy(proxyType) {
  if (proxyType === 'walker') return -1.7;
  if (proxyType === 'drone') return -0.45;
  return 0;
}

function proxyTypeForPlayer(player) {
  const mode = normalizeMode(player?.mode);
  const speed = Math.hypot(
    finiteNumber(player?.pose?.vx, 0),
    finiteNumber(player?.pose?.vz, 0)
  );

  if (mode === 'drive') return 'car';
  if (mode === 'walk') return 'walker';
  if (mode === 'drone') return 'drone';
  if (mode === 'space') return 'space';
  if (mode === 'moon') return speed > 1.2 ? 'car' : 'walker';
  return 'walker';
}

function clampVelocityVector(vx, vy, vz, maxSpeed = MAX_NETWORK_SPEED) {
  const speed = Math.hypot(vx, vy, vz);
  if (speed > maxSpeed && speed > MAX_NETWORK_SPEED_EPSILON) {
    const scale = maxSpeed / speed;
    return {
      x: vx * scale,
      y: vy * scale,
      z: vz * scale
    };
  }
  return { x: vx, y: vy, z: vz };
}

function teleportDistanceForProxy(proxyType) {
  return TELEPORT_DISTANCE_BY_PROXY[proxyType] || TELEPORT_DISTANCE_BY_PROXY.walker;
}

function stiffnessForDistance(distance) {
  if (distance > SMOOTHING_FAR_DISTANCE) return SMOOTHING_FAR_STIFFNESS;
  if (distance > SMOOTHING_MID_DISTANCE) return SMOOTHING_MID_STIFFNESS;
  return SMOOTHING_NEAR_STIFFNESS;
}

function createProxyByType(THREE, proxyType) {
  if (proxyType === 'car') return createCarProxy(THREE);
  if (proxyType === 'drone') return createDroneProxy(THREE);
  if (proxyType === 'space') return createSpaceProxy(THREE);
  return createWalkerProxy(THREE);
}

function disposeMaterial(material) {
  if (!material) return;
  if (Array.isArray(material)) {
    for (const m of material) {
      if (m && typeof m.dispose === 'function') m.dispose();
    }
    return;
  }
  if (typeof material.dispose === 'function') material.dispose();
}

function disposeObject3D(rootObject) {
  if (!rootObject || typeof rootObject.traverse !== 'function') return;
  rootObject.traverse((node) => {
    if (node && node.isMesh) {
      if (node.geometry && typeof node.geometry.dispose === 'function') node.geometry.dispose();
      disposeMaterial(node.material);
    }
  });
}

function disposeGhostEntry(entry) {
  if (!entry) return;
  if (entry.nameTag?.texture) entry.nameTag.texture.dispose();
  if (entry.nameTag?.sprite?.material) entry.nameTag.sprite.material.dispose();
  disposeObject3D(entry.proxy);
}

function createGhostManager(scene, options = {}) {
  const THREE = globalThis.THREE;
  if (!scene || !THREE) {
    const noop = () => {};
    return {
      updateGhosts: noop,
      tick: noop,
      clear: noop,
      destroy: noop,
      setVisible: noop,
      isVisible: () => false
    };
  }

  const root = new THREE.Group();
  root.name = 'multiplayer-ghost-root';
  scene.add(root);

  const entries = new Map();
  let visible = true;
  let lastTickAt = 0;
  const tickIntervalMs = GHOST_TICK_INTERVAL_MS;

  function getSelfUid() {
    if (typeof options.getSelfUid === 'function') return String(options.getSelfUid() || '');
    return String(globalThis.__WE3D_AUTH_UID__ || '');
  }

  function createEntry(player, nowEpochMs) {
    const proxyType = proxyTypeForPlayer(player);
    const proxy = createProxyByType(THREE, proxyType);
    const holder = new THREE.Group();
    holder.add(proxy);

    const nameTag = createNameTag(THREE, player.displayName || 'Explorer');
    if (nameTag?.sprite) {
      nameTag.sprite.position.set(0, nameTagHeightForProxy(proxyType), 0);
      holder.add(nameTag.sprite);
    }

    root.add(holder);

    const offsetY = yOffsetForProxy(proxyType);
    const targetX = finiteNumber(player.pose?.x, 0);
    const targetY = finiteNumber(player.pose?.y, 0) + offsetY;
    const targetZ = finiteNumber(player.pose?.z, 0);
    const yaw = finiteNumber(player.pose?.yaw, 0);

    return {
      uid: String(player.uid || ''),
      holder,
      proxy,
      proxyType,
      nameTag,
      displayName: String(player.displayName || 'Explorer').slice(0, 24),
      offsetY,
      current: { x: targetX, y: targetY, z: targetZ },
      target: { x: targetX, y: targetY, z: targetZ },
      velocity: {
        x: finiteNumber(player.pose?.vx, 0),
        y: finiteNumber(player.pose?.vy, 0),
        z: finiteNumber(player.pose?.vz, 0)
      },
      targetYaw: yaw,
      currentYaw: yaw,
      lastPoseAtMs: toMillis(player.lastSeenAt, nowEpochMs),
      lastReceiveAtMs: nowEpochMs,
      animTime: 0
    };
  }

  function updateLabel(entry, label) {
    const normalized = String(label || 'Explorer').slice(0, 24);
    if (normalized === entry.displayName) return;
    entry.displayName = normalized;

    if (entry.nameTag?.texture) entry.nameTag.texture.dispose();
    if (entry.nameTag?.sprite?.material) entry.nameTag.sprite.material.dispose();
    if (entry.nameTag?.sprite) entry.holder.remove(entry.nameTag.sprite);

    const replacement = createNameTag(THREE, normalized);
    entry.nameTag = replacement;
    if (replacement?.sprite) {
      replacement.sprite.position.set(0, nameTagHeightForProxy(entry.proxyType), 0);
      entry.holder.add(replacement.sprite);
    }
  }

  function rebuildProxy(entry, nextProxyType) {
    if (entry.proxyType === nextProxyType) return;

    if (entry.proxy) {
      entry.holder.remove(entry.proxy);
      disposeObject3D(entry.proxy);
    }

    entry.proxyType = nextProxyType;
    entry.offsetY = yOffsetForProxy(nextProxyType);
    entry.proxy = createProxyByType(THREE, nextProxyType);
    entry.holder.add(entry.proxy);

    if (entry.nameTag?.sprite) {
      entry.nameTag.sprite.position.set(0, nameTagHeightForProxy(nextProxyType), 0);
    }
  }

  function updateEntryFromPlayer(entry, player, nowEpochMs) {
    const nextProxyType = proxyTypeForPlayer(player);
    rebuildProxy(entry, nextProxyType);
    updateLabel(entry, player.displayName || 'Explorer');

    const pose = player.pose || {};
    const tx = finiteNumber(pose.x, entry.target.x);
    const ty = finiteNumber(pose.y, entry.target.y - entry.offsetY) + entry.offsetY;
    const tz = finiteNumber(pose.z, entry.target.z);

    entry.target.x = tx;
    entry.target.y = ty;
    entry.target.z = tz;

    const vx = finiteNumber(pose.vx, entry.velocity.x);
    const vy = finiteNumber(pose.vy, entry.velocity.y);
    const vz = finiteNumber(pose.vz, entry.velocity.z);
    const velocity = clampVelocityVector(vx, vy, vz);
    entry.velocity.x = velocity.x;
    entry.velocity.y = velocity.y;
    entry.velocity.z = velocity.z;

    const yaw = finiteNumber(pose.yaw, entry.targetYaw);
    entry.targetYaw = yaw;

    const fromServerMs = toMillis(player.lastSeenAt, nowEpochMs);
    entry.lastPoseAtMs = clamp(
      fromServerMs,
      nowEpochMs - SERVER_TIME_PAST_WINDOW_MS,
      nowEpochMs + SERVER_TIME_FUTURE_WINDOW_MS
    );
    entry.lastReceiveAtMs = nowEpochMs;
  }

  function removeEntry(uid) {
    const entry = entries.get(uid);
    if (!entry) return;
    entries.delete(uid);
    root.remove(entry.holder);
    disposeGhostEntry(entry);
  }

  function animateProxy(entry, dtSeconds) {
    const planarSpeed = Math.hypot(entry.velocity.x, entry.velocity.z);

    if (entry.proxyType === 'walker') {
      const limbs = entry.proxy?.userData?.limbs;
      if (!limbs) return;

      const isMoving =
        planarSpeed > WALK_MOVE_THRESHOLD ||
        Math.hypot(entry.target.x - entry.current.x, entry.target.z - entry.current.z) > WALK_MOVE_THRESHOLD;
      if (isMoving) {
        entry.animTime += dtSeconds * Math.min(
          WALK_MAX_SWING_SPEED,
          WALK_SWING_BASE_SPEED + planarSpeed * WALK_SWING_SPEED_SCALE
        );
        const t = entry.animTime;
        const legSwing = Math.sin(t) * WALK_LEG_SWING;
        const armSwing = Math.sin(t) * WALK_ARM_SWING;

        limbs.legLeftPivot.rotation.x = legSwing;
        limbs.legRightPivot.rotation.x = -legSwing;
        limbs.armLeftPivot.rotation.x = -armSwing;
        limbs.armRightPivot.rotation.x = armSwing;
        limbs.body.position.y = 1.0 * limbs.scale + Math.abs(Math.sin(t * 2)) * WALK_BOB_AMPLITUDE * limbs.scale;
      } else {
        const decay = clamp(dtSeconds * WALK_IDLE_DECAY_RATE, 0, 1);
        limbs.legLeftPivot.rotation.x *= 1 - decay;
        limbs.legRightPivot.rotation.x *= 1 - decay;
        limbs.armLeftPivot.rotation.x *= 1 - decay;
        limbs.armRightPivot.rotation.x *= 1 - decay;
        limbs.body.position.y = 1.0 * limbs.scale;
      }
      return;
    }

    if (entry.proxyType === 'car') {
      const wheels = entry.proxy?.userData?.wheels;
      if (!Array.isArray(wheels) || !wheels.length) return;
      const wheelSpin = planarSpeed * dtSeconds * CAR_WHEEL_SPIN_SCALE;
      for (const wheel of wheels) {
        if (wheel) wheel.rotation.x -= wheelSpin;
      }
      return;
    }

    if (entry.proxyType === 'drone') {
      const rotors = entry.proxy?.userData?.rotors;
      if (!Array.isArray(rotors) || !rotors.length) return;
      const spin = dtSeconds * (DRONE_ROTOR_BASE_SPIN + planarSpeed * DRONE_ROTOR_SPEED_SCALE);
      for (const rotor of rotors) {
        if (rotor) rotor.rotation.z += spin;
      }
    }
  }

  function updateGhosts(playersSnapshot = []) {
    const nowEpochMs = Date.now();
    const selfUid = getSelfUid();
    const seen = new Set();

    for (const player of playersSnapshot) {
      const uid = String(player?.uid || '');
      if (!uid || uid === selfUid) continue;
      seen.add(uid);

      let entry = entries.get(uid);
      if (!entry) {
        entry = createEntry(player, nowEpochMs);
        entries.set(uid, entry);
      }

      updateEntryFromPlayer(entry, player, nowEpochMs);
    }

    for (const uid of entries.keys()) {
      if (!seen.has(uid)) removeEntry(uid);
    }
  }

  function tick(nowMs = performance.now()) {
    if (!visible) return;
    if (nowMs - lastTickAt < tickIntervalMs) return;

    const deltaMs = lastTickAt <= 0 ? tickIntervalMs : nowMs - lastTickAt;
    const dtSeconds = clamp(deltaMs / 1000, MIN_DT_SECONDS, MAX_DT_SECONDS);
    lastTickAt = nowMs;

    const nowEpochMs = Date.now();

    for (const entry of entries.values()) {
      // Predict from the last network pose and smooth toward that target.
      const extrapolateSec = clamp((nowEpochMs - entry.lastPoseAtMs) / 1000, 0, MAX_EXTRAPOLATE_SECONDS);
      const predictedX = entry.target.x + entry.velocity.x * extrapolateSec;
      const predictedY = entry.target.y + entry.velocity.y * extrapolateSec;
      const predictedZ = entry.target.z + entry.velocity.z * extrapolateSec;

      const dx = predictedX - entry.current.x;
      const dy = predictedY - entry.current.y;
      const dz = predictedZ - entry.current.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      const teleportDistance = teleportDistanceForProxy(entry.proxyType);
      if (distSq > teleportDistance * teleportDistance) {
        entry.current.x = predictedX;
        entry.current.y = predictedY;
        entry.current.z = predictedZ;
      } else {
        const distance = Math.sqrt(distSq);
        const stiffness = stiffnessForDistance(distance);
        const alpha = clamp(1 - Math.exp(-dtSeconds * stiffness), POSITION_ALPHA_MIN, POSITION_ALPHA_MAX);

        entry.current.x += dx * alpha;
        entry.current.y += dy * alpha;
        entry.current.z += dz * alpha;
      }

      const planarSpeed = Math.hypot(entry.velocity.x, entry.velocity.z);
      if (
        planarSpeed > AUTO_FACING_SPEED_THRESHOLD &&
        (entry.proxyType === 'car' || entry.proxyType === 'drone' || entry.proxyType === 'walker')
      ) {
        entry.targetYaw = Math.atan2(entry.velocity.x, entry.velocity.z);
      }

      const yawAlpha = clamp(1 - Math.exp(-dtSeconds * YAW_STIFFNESS), YAW_ALPHA_MIN, YAW_ALPHA_MAX);
      entry.currentYaw += shortestAngleDelta(entry.targetYaw, entry.currentYaw) * yawAlpha;

      animateProxy(entry, dtSeconds);
      entry.holder.position.set(entry.current.x, entry.current.y, entry.current.z);
      entry.holder.rotation.y = entry.currentYaw;
    }
  }

  function clear() {
    for (const uid of Array.from(entries.keys())) {
      removeEntry(uid);
    }
  }

  function setVisible(nextVisible) {
    visible = !!nextVisible;
    root.visible = visible;
  }

  function destroy() {
    clear();
    scene.remove(root);
  }

  setVisible(true);

  return {
    updateGhosts,
    tick,
    clear,
    destroy,
    setVisible,
    isVisible: () => visible
  };
}

export { createGhostManager };
