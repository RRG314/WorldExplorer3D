import { ctx as appCtx } from "../shared-context.js?v=55";
import { getSeaStateConfig } from "../water-dynamics.js?v=8";
import { clamp } from "./dynamics.js?v=1";

let boatFoamTexture = null;
let boatFoamFx = null;
const boatFoamSprites = [];
let sternFoamCarry = 0;
let bowFoamCarry = 0;

function getBoatFoamTexture() {
  if (boatFoamTexture || typeof THREE === 'undefined' || typeof document === 'undefined') return boatFoamTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return null;
  const gradient = ctx2d.createRadialGradient(64, 64, 8, 64, 64, 58);
  gradient.addColorStop(0, 'rgba(255,255,255,0.96)');
  gradient.addColorStop(0.34, 'rgba(244,249,255,0.82)');
  gradient.addColorStop(0.68, 'rgba(169,210,235,0.24)');
  gradient.addColorStop(1, 'rgba(120,170,205,0)');
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0, 0, 128, 128);
  boatFoamTexture = new THREE.CanvasTexture(canvas);
  boatFoamTexture.needsUpdate = true;
  return boatFoamTexture;
}

function ensureBoatFoamFx() {
  if (boatFoamFx || typeof THREE === 'undefined' || !appCtx.scene) return boatFoamFx;
  const group = new THREE.Group();
  group.name = 'BoatFoamFx';
  group.visible = false;
  group.renderOrder = 4;
  group.frustumCulled = false;
  const texture = getBoatFoamTexture();
  for (let i = 0; i < 84; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: 0xf7fbff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.scale.setScalar(0.01);
    Object.assign(sprite.userData, {
      active: false,
      kind: 'stern',
      life: 0,
      maxLife: 1,
      vx: 0,
      vy: 0,
      vz: 0
    });
    sprite.frustumCulled = false;
    group.add(sprite);
    boatFoamSprites.push(sprite);
  }
  appCtx.scene.add(group);
  boatFoamFx = group;
  return group;
}

function resetBoatFoamFx() {
  sternFoamCarry = 0;
  bowFoamCarry = 0;
  if (!boatFoamFx) return;
  boatFoamFx.visible = false;
  for (const sprite of boatFoamSprites) {
    if (!sprite) continue;
    sprite.visible = false;
    sprite.userData.active = false;
    sprite.userData.life = 0;
    if (sprite.material) sprite.material.opacity = 0;
  }
}

function spawnBoatFoamParticle(kind, x, y, z, vx, vy, vz, life, size) {
  ensureBoatFoamFx();
  const sprite = boatFoamSprites.find((entry) => entry && !entry.userData.active);
  if (!sprite) return false;
  sprite.visible = true;
  sprite.position.set(x, y, z);
  sprite.scale.setScalar(size);
  sprite.material.opacity = kind === 'bow' ? 0.74 : 0.56;
  Object.assign(sprite.userData, { active: true, kind, life, maxLife: life, vx, vy, vz });
  return true;
}

function updateBoatFoamFx(dt, profile) {
  const group = ensureBoatFoamFx();
  if (!group) return false;
  if (!appCtx.boatMode?.active) {
    resetBoatFoamFx();
    return false;
  }
  group.visible = true;
  const maxSpeed = Math.max(1, getSeaStateConfig().speedMax || 1);
  const speedNorm = clamp(Math.abs(appCtx.boat.forwardSpeed || appCtx.boat.speed || 0) / maxSpeed, 0, 1.6);
  const forwardX = Math.sin(appCtx.boat.angle || 0);
  const forwardZ = Math.cos(appCtx.boat.angle || 0);
  const rightX = Math.cos(appCtx.boat.angle || 0);
  const rightZ = -Math.sin(appCtx.boat.angle || 0);
  const waveDirX = Number.isFinite(appCtx.boatMode.waveDirectionX) ? appCtx.boatMode.waveDirectionX : forwardX;
  const waveDirZ = Number.isFinite(appCtx.boatMode.waveDirectionZ) ? appCtx.boatMode.waveDirectionZ : forwardZ;

  const sternRate = (0.4 + appCtx.boatMode.wakeStrength * 5.4 + speedNorm * 2.8) * (1 + profile.intensity * 0.12);
  const bowRate = (appCtx.boatMode.bowSplashStrength * 3.2 + appCtx.boatMode.slamStrength * 2.6) * (0.65 + speedNorm * 0.55);
  sternFoamCarry += sternRate * dt;
  bowFoamCarry += bowRate * dt;

  while (sternFoamCarry >= 1) {
    sternFoamCarry -= 1;
    const lateral = (Math.random() * 2 - 1) * (0.8 + appCtx.boatMode.wakeSpread * 0.9);
    const behind = 3.2 + Math.random() * 1.2;
    spawnBoatFoamParticle(
      'stern',
      appCtx.boat.x - forwardX * behind + rightX * lateral,
      appCtx.boat.y + 0.14 + Math.random() * 0.16,
      appCtx.boat.z - forwardZ * behind + rightZ * lateral,
      -forwardX * (0.8 + speedNorm * 2.8 + Math.random() * 1.1) + waveDirX * 0.45 + rightX * lateral * 0.18,
      0.12 + appCtx.boatMode.sternFoamStrength * 0.18 + Math.random() * 0.12,
      -forwardZ * (0.8 + speedNorm * 2.8 + Math.random() * 1.1) + waveDirZ * 0.45 + rightZ * lateral * 0.18,
      0.9 + Math.random() * 0.55,
      1.1 + Math.random() * 1.2
    );
  }

  while (bowFoamCarry >= 1) {
    bowFoamCarry -= 1;
    const lateral = (Math.random() * 2 - 1) * 0.75;
    const ahead = 3.6 + Math.random() * 0.9;
    spawnBoatFoamParticle(
      'bow',
      appCtx.boat.x + forwardX * ahead + rightX * lateral,
      appCtx.boat.y + 0.22 + Math.random() * 0.22,
      appCtx.boat.z + forwardZ * ahead + rightZ * lateral,
      forwardX * (0.6 + appCtx.boatMode.bowSplashStrength * 1.2) + waveDirX * 0.3 + rightX * lateral * 0.24,
      0.4 + appCtx.boatMode.slamStrength * 0.7 + Math.random() * 0.34,
      forwardZ * (0.6 + appCtx.boatMode.bowSplashStrength * 1.2) + waveDirZ * 0.3 + rightZ * lateral * 0.24,
      0.58 + Math.random() * 0.44,
      0.9 + Math.random() * 0.9
    );
  }

  for (const sprite of boatFoamSprites) {
    if (!sprite?.userData?.active) continue;
    sprite.userData.life -= dt;
    if (sprite.userData.life <= 0) {
      sprite.userData.active = false;
      sprite.visible = false;
      if (sprite.material) sprite.material.opacity = 0;
      continue;
    }
    const lifeT = sprite.userData.life / Math.max(0.001, sprite.userData.maxLife);
    sprite.position.x += sprite.userData.vx * dt;
    sprite.position.y += sprite.userData.vy * dt;
    sprite.position.z += sprite.userData.vz * dt;
    sprite.userData.vx *= Math.exp(-1.6 * dt);
    sprite.userData.vy = sprite.userData.vy * Math.exp(-1.9 * dt) - 0.42 * dt;
    sprite.userData.vz *= Math.exp(-1.6 * dt);
    const swellLift = 1 + (1 - lifeT) * (sprite.userData.kind === 'bow' ? 1.2 : 0.8);
    sprite.scale.setScalar((sprite.userData.kind === 'bow' ? 1.1 : 0.9) * swellLift);
    sprite.material.opacity = (sprite.userData.kind === 'bow' ? 0.82 : 0.62) * Math.min(1, lifeT * 1.8);
  }
  return true;
}

export { resetBoatFoamFx, updateBoatFoamFx };
