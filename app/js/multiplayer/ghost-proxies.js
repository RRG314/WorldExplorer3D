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

function proxyTypeForPlayer(player, helpers = {}) {
  const { finiteNumber, normalizeMode } = helpers;
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

function createProxyByType(THREE, proxyType) {
  if (proxyType === 'car') return createCarProxy(THREE);
  if (proxyType === 'drone') return createDroneProxy(THREE);
  if (proxyType === 'space') return createSpaceProxy(THREE);
  return createWalkerProxy(THREE);
}

export {
  createNameTag,
  createProxyByType,
  nameTagHeightForProxy,
  proxyTypeForPlayer,
  yOffsetForProxy
};
