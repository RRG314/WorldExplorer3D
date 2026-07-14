const galaxyTextureCache = new Map();

function createGalaxySpriteTexture(colorHex, type = '') {
  const key = `${colorHex}:${type}`;
  if (galaxyTextureCache.has(key)) return galaxyTextureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const color = new THREE.Color(colorHex);
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);

  const grad = ctx.createRadialGradient(128, 128, 3, 128, 128, 118);
  grad.addColorStop(0.0, 'rgba(255,255,255,0.98)');
  grad.addColorStop(0.2, 'rgba(' + r + ',' + g + ',' + b + ',0.95)');
  grad.addColorStop(0.65, 'rgba(' + r + ',' + g + ',' + b + ',0.35)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.fill();

  const typeName = String(type).toLowerCase();
  if (typeName.includes('spiral')) {
    ctx.save();
    ctx.translate(128, 128);
    ctx.scale(1, typeName.includes('barred') ? 0.48 : 0.58);
    ctx.globalCompositeOperation = 'screen';
    for (let arm = 0; arm < 3; arm++) {
      for (let i = 0; i < 170; i++) {
        const t = i / 169;
        const angle = arm * Math.PI * 2 / 3 + t * Math.PI * 3.6;
        const radius = 8 + t * 102;
        const width = 1.1 + (1 - t) * 2.8;
        ctx.fillStyle = `rgba(${r},${g},${b},${0.34 * (1 - t * 0.72)})`;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, width, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (typeName.includes('barred')) {
      ctx.strokeStyle = `rgba(${r},${g},${b},0.72)`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-42, 0);
      ctx.lineTo(42, 0);
      ctx.stroke();
    }
    ctx.restore();
  } else if (typeName.includes('elliptical')) {
    ctx.save();
    ctx.translate(128, 128);
    ctx.scale(1, 0.58);
    ctx.strokeStyle = `rgba(${r},${g},${b},0.42)`;
    for (let radius = 24; radius < 108; radius += 12) {
      ctx.globalAlpha = 1 - radius / 150;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 90; i++) {
      const angle = i * 2.399963;
      const radius = 16 + (i * 47 % 96);
      const x = 128 + Math.cos(angle) * radius;
      const y = 128 + Math.sin(angle) * radius * 0.68;
      ctx.fillStyle = `rgba(${r},${g},${b},${0.16 + (i % 5) * 0.035})`;
      ctx.fillRect(x, y, 2 + i % 3, 2 + i % 3);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  galaxyTextureCache.set(key, texture);
  return texture;
}

export function createGalaxies(ctx) {
  ctx.solarSystem.galaxyMeshes = [];

  ctx.GALAXIES.forEach((galaxy, i) => {
    const group = new THREE.Group();
    group.name = galaxy.name;
    group.userData = { isGalaxy: true, galaxyIndex: i };

    const visualDistance = ctx.mapGalaxyDistanceToScene(galaxy.distanceLy);
    const pos = ctx.raDecToScenePosition(galaxy.raDeg, galaxy.decDeg, visualDistance);
    group.position.copy(pos);

    const texture = createGalaxySpriteTexture(galaxy.color, galaxy.type);
    const coreSize = (galaxy.visualSize || 820) * ctx.GALAXY_VISUAL_SCALE;

    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    }));
    core.scale.set(coreSize, coreSize, 1);
    core.renderOrder = 4;
    group.add(core);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    }));
    halo.scale.set(coreSize * 2.2, coreSize * 2.2, 1);
    halo.renderOrder = 3;
    group.add(halo);

    const hitbox = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(coreSize * 0.45, 300), 8, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.userData = { isGalaxy: true, galaxyIndex: i };
    group.add(hitbox);

    ctx.solarSystem.group.add(group);
    ctx.solarSystem.galaxyMeshes.push({
      mesh: group,
      hitbox,
      galaxy,
      visualDistance
    });
  });
}
