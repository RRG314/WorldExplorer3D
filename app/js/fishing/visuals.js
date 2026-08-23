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
  appCtx.scene.add(fishMesh);
  sceneVisual = { fishId: fish.id, fishMesh, line: null, phase: Math.random() * Math.PI * 2 };
  return sceneVisual;
}

function updateFishingScene(state, appCtx, dt) {
  const shoreActor = state?.accessMode === 'shore' ? appCtx.Walk?.state?.walker : null;
  if (!state?.fish || !['bite', 'fighting', 'landed'].includes(state.stage) || (!appCtx.boatMode?.active && !shoreActor)) {
    if (sceneVisual) disposeVisual();
    return;
  }
  const visual = ensureSceneVisual(state.fish, appCtx);
  if (!visual) return;
  visual.phase += dt * (state.stage === 'fighting' ? 3.2 + state.currentBurst * 5 : 1.1);
  const boat = shoreActor || appCtx.boat || { x: 0, y: 0, z: 0, angle: 0 };
  const direction = Number(state.fishDirection || 1);
  const outboard = state.stage === 'landed' ? 2.4 : 8 + (1 - state.reelProgress) * 15;
  const foreAft = 4 + direction * (2.4 + Math.sin(visual.phase * 0.7) * 2.8);
  const forwardX = Math.sin(boat.angle);
  const forwardZ = Math.cos(boat.angle);
  const rightX = Math.cos(boat.angle);
  const rightZ = -Math.sin(boat.angle);
  const fishX = boat.x + forwardX * foreAft + rightX * outboard;
  const fishZ = boat.z + forwardZ * foreAft + rightZ * outboard;
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

  // The screen-space rod owns the single readable line presentation in the
  // deck camera. The world fish remains the authoritative 3D target.
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
  const stage = String(animation.stage || 'idle');
  const phase = Number(animation.phase || 0);
  const tension = Math.max(0, Math.min(1, Number(animation.tension) || 0));
  const progress = Math.max(0, Math.min(1, Number(animation.progress) || 0));
  const burst = Math.max(0, Math.min(1, Number(animation.burst) || 0));
  const rodDirection = Math.max(-1, Math.min(1, Number(animation.rodDirection) || 0));
  const pixel = Math.max(1, Math.min(width / 1280, height / 720));
  const surfaceY = height * 0.54;
  const direction = animation.direction === -1 ? -1 : 1;
  const targetX = width * (0.5 + direction * (0.12 + (1 - progress) * 0.12)) + Math.sin(phase * 0.8) * width * 0.018;
  const targetY = surfaceY + Math.sin(phase * 1.6) * 4 * pixel;
  const rodBaseX = width * 0.91;
  const rodBaseY = height * 0.96;
  const rodTipX = width * (0.68 + rodDirection * 0.09);
  const rodTipY = height * (0.3 + tension * 0.08);

  const vignette = ctx.createLinearGradient(0, height * 0.55, 0, height);
  vignette.addColorStop(0, 'rgba(2,9,15,0)');
  vignette.addColorStop(1, 'rgba(2,9,15,.25)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, height * 0.55, width, height * 0.45);

  ctx.strokeStyle = tension > 0.84 ? '#ff5869' : '#d8ad78';
  ctx.lineWidth = 8 * pixel;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(rodBaseX, rodBaseY);
  ctx.quadraticCurveTo(width * (0.84 + rodDirection * 0.025), height * (0.58 + tension * 0.07), rodTipX, rodTipY);
  ctx.stroke();

  const lineVisible = ['casting', 'waiting', 'bite', 'fighting'].includes(stage);
  if (lineVisible) {
    const lineTargetX = fish ? targetX : width * 0.45;
    const lineTargetY = fish ? targetY : surfaceY;
    ctx.strokeStyle = tension > 0.84 ? '#ff5869' : tension < 0.16 && stage === 'fighting' ? '#f4c85d' : 'rgba(230,246,252,.92)';
    ctx.lineWidth = (1.6 + tension * 1.5) * pixel;
    ctx.beginPath();
    ctx.moveTo(rodTipX, rodTipY);
    const sag = stage === 'fighting' ? (1 - tension) * height * 0.05 : height * 0.035;
    ctx.quadraticCurveTo((rodTipX + lineTargetX) * 0.5, Math.min(height * 0.7, (rodTipY + lineTargetY) * 0.5 + sag), lineTargetX, lineTargetY);
    ctx.stroke();

    const biteScale = stage === 'bite' ? 1.5 + Math.sin(phase * 10) * 0.28 : 1;
    ctx.fillStyle = '#f4f7f8';
    ctx.beginPath();
    ctx.arc(lineTargetX, lineTargetY, 6 * pixel * biteScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f05a5a';
    ctx.fillRect(lineTargetX - 6 * pixel * biteScale, lineTargetY - 6 * pixel * biteScale, 12 * pixel * biteScale, 5 * pixel * biteScale);

    const splash = stage === 'bite' ? 1 : Math.max(burst, stage === 'casting' ? 0.42 : 0.12);
    ctx.strokeStyle = `rgba(201,239,251,${Math.min(.9, .2 + splash * .7)})`;
    ctx.lineWidth = 1.5 * pixel;
    for (let ring = 0; ring < 3; ring += 1) {
      const radius = (11 + ring * 13 + Math.sin(phase * 2 + ring) * 3) * pixel * (0.75 + splash * 0.45);
      ctx.beginPath();
      ctx.ellipse(lineTargetX, lineTargetY + 5 * pixel, radius, radius * .24, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (stage === 'fighting' && fish) {
    const pull = direction < 0 ? -1 : 1;
    ctx.strokeStyle = tension > .84 ? '#ff5869' : '#9fceff';
    ctx.lineWidth = 3 * pixel;
    for (let index = 0; index < 3; index += 1) {
      const x = targetX - pull * index * 18 * pixel;
      const y = targetY - 34 * pixel;
      ctx.beginPath();
      ctx.moveTo(x - pull * 10 * pixel, y - 8 * pixel);
      ctx.lineTo(x, y);
      ctx.lineTo(x - pull * 10 * pixel, y + 8 * pixel);
      ctx.stroke();
    }
  }
}

export { disposeVisual as clearFishingScene, drawFishPortrait, updateFishingScene };
