let sceneVisual = null;

function hexColor(value, fallback = 0x78909c) {
  try {
    return new THREE.Color(value || fallback);
  } catch (_) {
    return new THREE.Color(fallback);
  }
}

function createFishMesh(fish) {
  if (typeof THREE === 'undefined' || !fish) return null;
  const group = new THREE.Group();
  group.name = `Fishing catch: ${fish.species}`;

  const visual = fish.visual || {};
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: hexColor(visual.body), roughness: 0.48, metalness: 0.08
  });
  const bellyMaterial = new THREE.MeshStandardMaterial({
    color: hexColor(visual.belly, 0xdde4df), roughness: 0.56, metalness: 0.02
  });
  const finMaterial = new THREE.MeshStandardMaterial({
    color: hexColor(visual.fin, visual.body), roughness: 0.52, metalness: 0.03,
    side: THREE.DoubleSide
  });

  const proportions = {
    long: [1.8, 0.44, 0.5], trout: [1.5, 0.55, 0.58], deep: [1.3, 0.78, 0.5],
    flat: [1.25, 0.18, 0.78], tuna: [1.65, 0.58, 0.62], mahi: [1.55, 0.72, 0.42],
    tarpon: [1.65, 0.48, 0.55], billfish: [1.8, 0.46, 0.52], catfish: [1.48, 0.62, 0.64],
    drum: [1.42, 0.7, 0.54], bass: [1.48, 0.62, 0.58]
  }[visual.shape] || [1.48, 0.6, 0.56];

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 14), bodyMaterial);
  body.scale.set(proportions[0], proportions[1], proportions[2]);
  body.castShadow = true;
  group.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.66, 20, 12), bellyMaterial);
  belly.scale.set(proportions[0] * 0.94, proportions[1] * 0.62, proportions[2] * 0.9);
  belly.position.y = -proportions[1] * 0.28;
  group.add(belly);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.95, 3), finMaterial);
  tail.name = 'fishingFishTail';
  tail.rotation.z = -Math.PI * 0.5;
  tail.position.x = -proportions[0] * 0.82 - 0.32;
  tail.scale.z = 0.3;
  group.add(tail);

  const dorsalHeight = visual.sail ? 1.2 : 0.48;
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.22, dorsalHeight, visual.sail ? 5 : 3), finMaterial);
  dorsal.position.set(-0.1, proportions[1] * 0.72 + dorsalHeight * 0.32, 0);
  dorsal.rotation.z = visual.sail ? 0.18 : 0;
  dorsal.scale.z = visual.sail ? 2.4 : 0.8;
  group.add(dorsal);

  const pectoral = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.58, 3), finMaterial);
  pectoral.position.set(0.25, -0.12, proportions[2] * 0.62);
  pectoral.rotation.x = Math.PI * 0.42;
  pectoral.rotation.z = -0.38;
  group.add(pectoral);

  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x050a0d, roughness: 0.16 });
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), eyeMaterial);
    eye.position.set(proportions[0] * 0.64, proportions[1] * 0.2, side * proportions[2] * 0.62);
    group.add(eye);
  });

  if (visual.shape === 'billfish') {
    const bill = new THREE.Mesh(new THREE.ConeGeometry(0.055, 1.35, 8), bodyMaterial);
    bill.rotation.z = -Math.PI * 0.5;
    bill.position.x = proportions[0] + 0.55;
    group.add(bill);
  }

  if (visual.whiskers) {
    const whiskerMaterial = new THREE.LineBasicMaterial({ color: 0xc8c7b8 });
    [-1, 1].forEach((side) => {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(proportions[0] * 0.68, -0.08, side * 0.28),
          new THREE.Vector3(proportions[0] * 1.35, -0.22, side * 0.5)
        ]),
        whiskerMaterial
      );
      group.add(line);
    });
  }

  const scale = Math.max(0.42, Math.min(2.6, fish.lengthCm / 75));
  group.scale.setScalar(scale);
  group.userData.fishScale = scale;
  return group;
}

function disposeVisual() {
  if (!sceneVisual) return;
  const { fishMesh, line } = sceneVisual;
  [fishMesh, line].forEach((object) => {
    object?.parent?.remove(object);
    object?.traverse?.((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
      else child.material?.dispose?.();
    });
  });
  sceneVisual = null;
}

function ensureSceneVisual(fish, appCtx) {
  if (!appCtx.scene || !fish) return null;
  if (sceneVisual?.fishId === fish.id) return sceneVisual;
  disposeVisual();
  const fishMesh = createFishMesh(fish);
  if (!fishMesh) return null;
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(
    lineGeometry,
    new THREE.LineBasicMaterial({ color: 0xd9eef5, transparent: true, opacity: 0.78 })
  );
  line.frustumCulled = false;
  appCtx.scene.add(fishMesh);
  appCtx.scene.add(line);
  sceneVisual = { fishId: fish.id, fishMesh, line, phase: Math.random() * Math.PI * 2 };
  return sceneVisual;
}

function updateFishingScene(state, appCtx, dt) {
  if (!state?.fish || !['bite', 'fighting', 'landed'].includes(state.stage) || !appCtx.boatMode?.active) {
    if (sceneVisual) disposeVisual();
    return;
  }
  const visual = ensureSceneVisual(state.fish, appCtx);
  if (!visual) return;
  visual.phase += dt * (state.stage === 'fighting' ? 3.2 + state.currentBurst * 5 : 1.1);
  const boat = appCtx.boat || { x: 0, y: 0, z: 0, angle: 0 };
  const direction = Number(state.fishDirection || 1);
  const distance = state.stage === 'landed' ? 3.2 : 8 + (1 - state.reelProgress) * 18;
  const side = direction * (4 + Math.sin(visual.phase * 0.7) * 3.5);
  const forwardX = Math.sin(boat.angle);
  const forwardZ = Math.cos(boat.angle);
  const rightX = Math.cos(boat.angle);
  const rightZ = -Math.sin(boat.angle);
  const fishX = boat.x + forwardX * distance + rightX * side;
  const fishZ = boat.z + forwardZ * distance + rightZ * side;
  const surfaceY = Number(appCtx.waterSurfaceYAt?.(fishX, fishZ));
  const waterY = Number.isFinite(surfaceY) ? surfaceY : Number(boat.y) || 0;
  const fishY = state.stage === 'landed'
    ? waterY + 1.4
    : waterY - 0.7 - state.currentBurst * 1.1 + Math.sin(visual.phase) * 0.22;

  visual.fishMesh.visible = true;
  visual.fishMesh.position.set(fishX, fishY, fishZ);
  visual.fishMesh.rotation.order = 'YXZ';
  visual.fishMesh.rotation.y = boat.angle + Math.PI * 0.5 * direction + Math.sin(visual.phase * 0.45) * 0.38;
  visual.fishMesh.rotation.z = state.stage === 'landed' ? -0.18 : Math.sin(visual.phase * 0.8) * 0.14;
  const tail = visual.fishMesh.getObjectByName('fishingFishTail');
  if (tail) tail.rotation.y = Math.sin(visual.phase * 2.1) * (0.25 + state.currentBurst * 0.35);

  const rodX = boat.x + forwardX * 1.4 + rightX * 0.7;
  const rodZ = boat.z + forwardZ * 1.4 + rightZ * 0.7;
  const positions = visual.line.geometry.attributes.position.array;
  positions[0] = rodX;
  positions[1] = (Number(boat.y) || 0) + 2.4;
  positions[2] = rodZ;
  positions[3] = fishX;
  positions[4] = fishY + 0.2;
  positions[5] = fishZ;
  visual.line.geometry.attributes.position.needsUpdate = true;
  visual.line.visible = state.stage !== 'landed';
}

function roundedFishPath(ctx, cx, cy, width, height, shape = 'bass') {
  const nose = shape === 'billfish' ? 0.57 : 0.48;
  ctx.beginPath();
  ctx.moveTo(cx + width * nose, cy);
  ctx.bezierCurveTo(cx + width * 0.32, cy - height * 0.58, cx - width * 0.24, cy - height * 0.56, cx - width * 0.48, cy);
  ctx.bezierCurveTo(cx - width * 0.24, cy + height * 0.56, cx + width * 0.32, cy + height * 0.58, cx + width * nose, cy);
  ctx.closePath();
}

function drawFishPortrait(canvas, fish, animation = {}) {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#08354a');
  gradient.addColorStop(1, '#071c29');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 18; i++) {
    const x = (i * 83 + 29) % width;
    const y = (i * 47 + 17) % height;
    ctx.fillStyle = `rgba(160,220,235,${0.06 + i % 3 * 0.025})`;
    ctx.beginPath();
    ctx.arc(x, y, 1 + i % 3, 0, Math.PI * 2);
    ctx.fill();
  }

  const stage = String(animation.stage || 'idle');
  const phase = Number(animation.phase || 0);
  const tension = Math.max(0, Math.min(1, Number(animation.tension) || 0));
  const progress = Math.max(0, Math.min(1, Number(animation.progress) || 0));
  const burst = Math.max(0, Math.min(1, Number(animation.burst) || 0));
  const rodDirection = Math.max(-1, Math.min(1, Number(animation.rodDirection) || 0));

  const surfaceY = height * 0.22;
  ctx.strokeStyle = 'rgba(150,226,242,0.34)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= width; x += 8) {
    const y = surfaceY + Math.sin(x * 0.055 + phase * 1.3) * 2.2;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const rodBaseX = width * 0.9;
  const rodBaseY = height * 0.92;
  const rodTipX = width * (0.72 + rodDirection * 0.08);
  const rodTipY = height * (0.12 + tension * 0.1);
  ctx.strokeStyle = '#d4a373';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(rodBaseX, rodBaseY);
  ctx.quadraticCurveTo(width * 0.88, height * 0.48, rodTipX, rodTipY);
  ctx.stroke();

  if (!fish) {
    if (stage === 'casting' || stage === 'waiting') {
      const bobberX = width * 0.36 + Math.sin(phase * 0.8) * 9;
      const bobberY = surfaceY + Math.sin(phase * 2.1) * 2;
      ctx.strokeStyle = 'rgba(222,244,248,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rodTipX, rodTipY);
      ctx.quadraticCurveTo(width * 0.57, height * 0.02, bobberX, bobberY);
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(bobberX, bobberY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(bobberX - 5, bobberY - 5, 10, 5);
      ctx.strokeStyle = 'rgba(186,230,253,0.35)';
      ctx.beginPath();
      ctx.ellipse(bobberX, bobberY + 4, 13 + Math.sin(phase) * 2, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(221,241,247,0.72)';
      ctx.font = '600 15px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Cast into open water', width * 0.43, height * 0.56);
    }
    return;
  }

  const visual = fish.visual || {};
  const direction = animation.direction === -1 ? -1 : 1;
  const cx = width * (0.48 + direction * (1 - progress) * 0.18) + Math.sin(phase) * (5 + burst * 9);
  const cy = height * (0.5 + burst * 0.13) + Math.cos(phase * 0.72) * (3 + burst * 5);
  const fishWidth = Math.min(width * 0.64, 250);
  const shapeHeight = visual.shape === 'long' || visual.shape === 'billfish' ? 52 : visual.shape === 'deep' ? 84 : 68;

  const mouthX = cx + direction * fishWidth * 0.45;
  const mouthY = cy - shapeHeight * 0.05;
  ctx.strokeStyle = tension > 0.84 ? '#fb7185' : tension < 0.18 && stage === 'fighting' ? '#facc15' : 'rgba(224,247,250,0.88)';
  ctx.lineWidth = 1.4 + tension * 1.8;
  ctx.beginPath();
  ctx.moveTo(rodTipX, rodTipY);
  const sag = (1 - tension) * 35;
  ctx.quadraticCurveTo((rodTipX + mouthX) * 0.5, Math.min(height - 8, (rodTipY + mouthY) * 0.5 + sag), mouthX, mouthY);
  ctx.stroke();

  if (burst > 0.32) {
    const splashX = Math.max(18, Math.min(width - 18, cx));
    const splashAlpha = Math.min(0.8, 0.2 + burst * 0.65);
    ctx.strokeStyle = `rgba(186,230,253,${splashAlpha})`;
    for (let i = 0; i < 3; i++) {
      const radius = 8 + i * 10 + Math.sin(phase * 2 + i) * 3;
      ctx.beginPath();
      ctx.ellipse(splashX, surfaceY + 3, radius, radius * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(direction, 1);
  ctx.translate(-cx, -cy);
  const tailWave = Math.sin(phase * 2.4) * 8;
  ctx.fillStyle = visual.fin || visual.body;
  ctx.beginPath();
  ctx.moveTo(cx - fishWidth * 0.46, cy);
  ctx.lineTo(cx - fishWidth * 0.65, cy - shapeHeight * 0.58 + tailWave);
  ctx.lineTo(cx - fishWidth * 0.61, cy);
  ctx.lineTo(cx - fishWidth * 0.65, cy + shapeHeight * 0.58 - tailWave);
  ctx.closePath();
  ctx.fill();

  const bodyGradient = ctx.createLinearGradient(cx, cy - shapeHeight, cx, cy + shapeHeight);
  bodyGradient.addColorStop(0, visual.body || '#78909c');
  bodyGradient.addColorStop(0.58, visual.body || '#78909c');
  bodyGradient.addColorStop(1, visual.belly || '#e5e7df');
  roundedFishPath(ctx, cx, cy, fishWidth, shapeHeight, visual.shape);
  ctx.fillStyle = bodyGradient;
  ctx.fill();
  ctx.strokeStyle = 'rgba(230,245,245,0.24)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (visual.stripes) {
    ctx.strokeStyle = visual.stripe || '#263b43';
    ctx.lineWidth = 3;
    for (let i = 0; i < visual.stripes; i++) {
      const y = cy - shapeHeight * 0.28 + i * shapeHeight * 0.14;
      ctx.beginPath();
      ctx.moveTo(cx - fishWidth * 0.28, y);
      ctx.lineTo(cx + fishWidth * 0.34, y + 3);
      ctx.stroke();
    }
  } else if (visual.stripe) {
    ctx.strokeStyle = visual.stripe;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - fishWidth * 0.32, cy);
    ctx.quadraticCurveTo(cx, cy - 5, cx + fishWidth * 0.36, cy - 1);
    ctx.stroke();
  }

  if (visual.spots) {
    ctx.fillStyle = visual.stripe || 'rgba(30,45,48,0.7)';
    for (let i = 0; i < 14; i++) {
      const x = cx - fishWidth * 0.28 + i % 7 * fishWidth * 0.09;
      const y = cy - shapeHeight * 0.28 + Math.floor(i / 7) * shapeHeight * 0.34 + (i % 2) * 3;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + i % 3 * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = visual.fin || visual.body;
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy - shapeHeight * 0.45);
  ctx.lineTo(cx + 25, cy - shapeHeight * (visual.sail ? 1.1 : 0.72));
  ctx.lineTo(cx + 46, cy - shapeHeight * 0.4);
  ctx.closePath();
  ctx.fill();

  if (visual.shape === 'billfish') {
    ctx.fillStyle = visual.body;
    ctx.beginPath();
    ctx.moveTo(cx + fishWidth * 0.45, cy - 3);
    ctx.lineTo(cx + fishWidth * 0.72, cy);
    ctx.lineTo(cx + fishWidth * 0.45, cy + 3);
    ctx.closePath();
    ctx.fill();
  }

  const eyeX = cx + fishWidth * 0.34;
  ctx.fillStyle = '#eef6f3';
  ctx.beginPath();
  ctx.arc(eyeX, cy - shapeHeight * 0.15, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#061017';
  ctx.beginPath();
  ctx.arc(eyeX + 1.2, cy - shapeHeight * 0.15, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export { disposeVisual as clearFishingScene, drawFishPortrait, updateFishingScene };
