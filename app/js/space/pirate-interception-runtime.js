import { loadModelAsset } from '../assets/model-asset-runtime.js?v=15';
import { keyboardBindingCode, keyboardBindingLabel, keyMatchesKeyboardAction } from '../controls/keyboard-bindings.js?v=2';
import { createSolisReachExteriorMesh } from './solis-reach-exterior-mesh.js?v=1';

const PIRATE_ASSET_ID = 'space-pirate-insurgent-raider-v1';
const COMBAT_RADIUS = 1_150;
const WARNING_RADIUS = 930;
const PLAYER_PROJECTILE_SPEED = 330;
const ENEMY_PROJECTILE_SPEED = 205;
const MAX_PROJECTILES = 52;
const MAX_IMPACTS = 14;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function seeded(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function setBar(id, value) {
  const element = document.getElementById(id);
  if (element) element.style.width = `${Math.round(clamp(value) * 100)}%`;
}

function formatRole(role) {
  return String(role || '').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function makePulseMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}

function createPirateInterceptionRuntime(appCtx, options = {}) {
  const runtime = {
    active: false,
    phase: 'INACTIVE',
    encounter: null,
    group: null,
    solisReach: null,
    enemies: [],
    projectiles: [],
    impacts: [],
    disposables: [],
    elapsedS: 0,
    combatElapsedS: 0,
    phaseElapsedS: 0,
    fireCooldownS: 0,
    playerCondition: 1,
    solisReachCondition: 1,
    solisReachHitCount: 0,
    enemiesDestroyed: 0,
    enemiesRepelled: 0,
    boardingProgress: 0,
    currentTargetId: '',
    boundWarning: false,
    resolving: false,
    loading: false,
    solarSystemWasVisible: null,
    input: { fire: false, gamepadFire: false },
    random: Math.random,
    hooks: {}
  };

  function sound(kind) {
    try {
      const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextCtor) return;
      runtime.audio ||= new AudioContextCtor();
      if (runtime.audio.state === 'suspended') void runtime.audio.resume();
      const now = runtime.audio.currentTime;
      const gain = runtime.audio.createGain();
      const osc = runtime.audio.createOscillator();
      const config = {
        contact: [220, 420, 0.38, 'sine'],
        alarm: [520, 260, 0.48, 'sawtooth'],
        playerFire: [760, 420, 0.09, 'square'],
        enemyFire: [180, 110, 0.12, 'sawtooth'],
        impact: [120, 58, 0.18, 'triangle'],
        success: [360, 720, 0.65, 'sine'],
        boarded: [170, 90, 0.8, 'sawtooth']
      }[kind] || [300, 200, 0.12, 'sine'];
      osc.type = config[3];
      osc.frequency.setValueAtTime(config[0], now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, config[1]), now + config[2]);
      gain.gain.setValueAtTime(kind === 'alarm' ? 0.045 : 0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + config[2]);
      osc.connect(gain).connect(runtime.audio.destination);
      osc.start(now);
      osc.stop(now + config[2]);
    } catch { /* audio is optional presentation */ }
  }

  function ensureHud() {
    let hud = document.getElementById('pirateCombatHUD');
    if (hud) return hud;
    hud = document.createElement('section');
    hud.id = 'pirateCombatHUD';
    hud.className = 'pirateCombatHud';
    hud.setAttribute('aria-label', 'Pirate interception combat status');
    hud.innerHTML = `
      <header><span id="pirateCombatAlert">UNIDENTIFIED CONTACTS</span><strong>DEFEND SOLIS REACH</strong></header>
      <p id="pirateCombatObjective">Hold course while sensors classify the approaching craft.</p>
      <div class="pirateCombatCondition"><span>PATHFINDER</span><i><b id="piratePlayerCondition"></b></i><em id="piratePlayerConditionText">100%</em></div>
      <div class="pirateCombatCondition"><span>SOLIS REACH</span><i><b id="pirateShipCondition"></b></i><em id="pirateShipConditionText">100%</em></div>
      <div class="pirateCombatTarget"><span>TARGET</span><strong id="pirateTargetRead">SCANNING</strong><small id="pirateTargetDistance">—</small></div>
      <div id="pirateBoardingThreat" class="pirateBoardingThreat" hidden><span>BOARDING APPROACH</span><i><b id="pirateBoardingBar"></b></i><strong id="pirateBoardingText">0%</strong></div>
      <small id="pirateCombatControls">WASD/ARROWS FLY · ${keyboardBindingLabel('primary_action')} THRUST · ${keyboardBindingLabel('use_item')} FIRE · MOUSE AIMS</small>
      <button id="pirateFireButton" type="button" aria-label="Fire Pathfinder energy cannons">FIRE</button>
      <div id="pirateCombatResult" class="pirateCombatResult" hidden></div>`;
    document.body.appendChild(hud);
    const fire = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      runtime.input.fire = true;
      firePlayerWeapon();
    };
    const release = () => { runtime.input.fire = false; };
    hud.querySelector('#pirateFireButton')?.addEventListener('pointerdown', fire);
    hud.querySelector('#pirateFireButton')?.addEventListener('pointerup', release);
    hud.querySelector('#pirateFireButton')?.addEventListener('pointercancel', release);
    return hud;
  }

  function announce(alert, objective, color = '#ff9b68') {
    const alertEl = document.getElementById('pirateCombatAlert');
    const objectiveEl = document.getElementById('pirateCombatObjective');
    if (alertEl) {
      alertEl.textContent = alert;
      alertEl.style.color = color;
    }
    if (objectiveEl) objectiveEl.textContent = objective;
    appCtx.showSpaceFlightMessage?.(`${alert} · ${objective}`, color);
  }

  function clearObject(object) {
    object?.parent?.remove?.(object);
    object?.traverse?.((entry) => {
      if (!entry?.isMesh) return;
      if (entry.userData.sharedPirateGeometry !== true) entry.geometry?.dispose?.();
      const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
      materials.forEach((material) => material?.dispose?.());
    });
  }

  function normalizedPirateVisual(instance, role) {
    const source = instance.root;
    source.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(source);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    source.position.sub(center);
    source.traverse((entry) => {
      if (!entry?.isMesh) return;
      entry.userData.sharedPirateGeometry = true;
      const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
      materials.forEach((material) => {
        if (!material) return;
        material.emissive?.setHex?.(role === 'boarding-craft' ? 0x3d001d : 0x27000b);
        material.emissiveIntensity = role === 'boarding-craft' ? 0.58 : 0.32;
      });
    });
    const scale = (role === 'boarding-craft' ? 17 : role === 'attacker' ? 14 : 12) / Math.max(0.001, size.z);
    const normalized = new THREE.Group();
    normalized.scale.setScalar(scale);
    normalized.add(source);
    const oriented = new THREE.Group();
    oriented.rotation.x = -Math.PI * 0.5;
    oriented.add(normalized);
    return oriented;
  }

  async function createEnemy(index, count) {
    const role = index === count - 1 ? 'boarding-craft' : index === 0 ? 'attacker' : 'interceptor';
    const instance = await loadModelAsset(THREE, PIRATE_ASSET_ID);
    const host = new THREE.Group();
    host.name = `pirate-${role}-${index + 1}`;
    host.add(normalizedPirateVisual(instance, role));
    const angle = count > 1 ? (index / count) * Math.PI * 2 : 0;
    const radius = role === 'boarding-craft' ? 78 : 86 + runtime.random() * 48;
    host.position.set(Math.cos(angle) * radius, 190 + runtime.random() * 72, Math.sin(angle) * radius * 0.64);
    host.visible = false;
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(role === 'boarding-craft' ? 10 : 7, 0.42, 8, 30),
      makePulseMaterial(role === 'boarding-craft' ? 0xffd166 : 0xff4d78, 0.88)
    );
    marker.name = 'target-marker';
    marker.rotation.x = Math.PI * 0.5;
    marker.position.y = 1.5;
    host.add(marker);
    runtime.group.add(host);
    const maxHealth = role === 'boarding-craft' ? 5 : role === 'attacker' ? 3 : 2;
    return {
      id: host.name,
      role,
      host,
      instance,
      health: maxHealth,
      maxHealth,
      state: 'INTERCEPT',
      velocity: new THREE.Vector3(),
      fireCooldownS: 1.1 + index * 0.38 + runtime.random(),
      evadeS: 0,
      alive: true,
      retreating: false
    };
  }

  function createProjectileMesh(team) {
    const player = team === 'player';
    const material = makePulseMaterial(player ? 0x55eaff : 0xff3d75, 0.96);
    const mesh = new THREE.Mesh(
      player ? new THREE.CylinderGeometry(0.28, 0.28, 7.5, 8) : new THREE.OctahedronGeometry(1.25, 0),
      material
    );
    mesh.visible = false;
    mesh.renderOrder = 8;
    runtime.group.add(mesh);
    runtime.disposables.push(mesh);
    return { team, mesh, active: false, position: mesh.position, velocity: new THREE.Vector3(), lifeS: 0, target: '' };
  }

  function acquireProjectile(team) {
    let projectile = runtime.projectiles.find((entry) => entry.team === team && !entry.active);
    if (!projectile && runtime.projectiles.length < MAX_PROJECTILES) {
      projectile = createProjectileMesh(team);
      runtime.projectiles.push(projectile);
    }
    return projectile || null;
  }

  function fireProjectile(team, origin, direction, target = '') {
    const projectile = acquireProjectile(team);
    if (!projectile) return false;
    projectile.active = true;
    projectile.mesh.visible = true;
    projectile.position.copy(origin);
    projectile.velocity.copy(direction).normalize().multiplyScalar(team === 'player' ? PLAYER_PROJECTILE_SPEED : ENEMY_PROJECTILE_SPEED);
    projectile.lifeS = team === 'player' ? 3.4 : 4.4;
    projectile.target = target;
    projectile.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    projectile.mesh.scale.set(1, team === 'player' ? 1 : 2.2, 1);
    sound(team === 'player' ? 'playerFire' : 'enemyFire');
    return true;
  }

  function impact(position, team) {
    if (document.documentElement.dataset.we3dEffects === 'reduce') return;
    let effect = runtime.impacts.find((entry) => !entry.active);
    if (!effect && runtime.impacts.length < MAX_IMPACTS) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), makePulseMaterial(team === 'player' ? 0x8ff6ff : 0xff8aa8, 0.75));
      mesh.visible = false;
      runtime.group.add(mesh);
      runtime.disposables.push(mesh);
      effect = { mesh, active: false, ageS: 0 };
      runtime.impacts.push(effect);
    }
    if (!effect) return;
    effect.active = true;
    effect.ageS = 0;
    effect.mesh.visible = true;
    effect.mesh.position.copy(position);
    effect.mesh.scale.setScalar(0.5);
    effect.mesh.material.opacity = 0.75;
    sound('impact');
  }

  function aliveEnemies() {
    return runtime.enemies.filter((enemy) => enemy.alive && !enemy.retreating);
  }

  function selectedTarget() {
    const rocket = appCtx.spaceFlight?.rocket;
    if (!rocket) return null;
    const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(rocket.quaternion).normalize();
    let best = null;
    let bestScore = -Infinity;
    for (const enemy of aliveEnemies()) {
      const offset = enemy.host.position.clone().sub(rocket.position);
      const distance = offset.length();
      const alignment = offset.normalize().dot(forward);
      const score = alignment * 2.5 - distance / 1200 + (enemy.role === 'boarding-craft' ? 0.22 : 0);
      if (alignment > 0.35 && score > bestScore) {
        best = enemy;
        bestScore = score;
      }
    }
    return best || aliveEnemies().sort((left, right) => left.host.position.distanceTo(rocket.position) - right.host.position.distanceTo(rocket.position))[0] || null;
  }

  function firePlayerWeapon() {
    if (!runtime.active || !['COMBAT_ACTIVE', 'BOARDING_THREAT'].includes(runtime.phase) || runtime.fireCooldownS > 0) return false;
    const rocket = appCtx.spaceFlight?.rocket;
    if (!rocket) return false;
    const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(rocket.quaternion).normalize();
    const target = selectedTarget();
    const assist = Number(runtime.encounter?.difficulty?.aimAssist ?? 0.7);
    if (target) {
      const targetDirection = target.host.position.clone().sub(rocket.position).normalize();
      const alignment = forward.dot(targetDirection);
      if (alignment > 0.45) forward.lerp(targetDirection, assist * 0.48).normalize();
    }
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rocket.quaternion);
    const origin = rocket.position.clone().addScaledVector(forward, 8);
    let fired = false;
    [-1, 1].forEach((side) => {
      fired = fireProjectile('player', origin.clone().addScaledVector(right, side * 1.25), forward, target?.id || '') || fired;
    });
    if (fired) runtime.fireCooldownS = 0.22;
    return fired;
  }

  function fireEnemyWeapon(enemy, targetPosition, targetKind) {
    const direction = targetPosition.clone().sub(enemy.host.position);
    const distance = direction.length();
    if (distance > 780 || distance < 35) return false;
    const accuracy = Number(runtime.encounter?.difficulty?.enemyAccuracy ?? 0.5);
    const spread = (1 - accuracy) * 0.15;
    direction.normalize();
    direction.x += (runtime.random() - 0.5) * spread;
    direction.y += (runtime.random() - 0.5) * spread;
    direction.z += (runtime.random() - 0.5) * spread;
    return fireProjectile('enemy', enemy.host.position.clone().addScaledVector(direction, 7), direction, targetKind);
  }

  function destroyEnemy(enemy) {
    enemy.alive = false;
    enemy.host.visible = false;
    runtime.enemiesDestroyed += 1;
    runtime.enemiesRepelled += 1;
    impact(enemy.host.position, 'player');
    const boardingAlive = runtime.enemies.some((entry) => entry.alive && entry.role === 'boarding-craft');
    const required = Math.max(3, Math.ceil(runtime.enemies.length * 0.6));
    if (!boardingAlive && runtime.enemiesDestroyed >= required) beginRetreat();
  }

  function beginRetreat() {
    if (runtime.resolving) return;
    runtime.resolving = true;
    runtime.enemies.forEach((enemy) => {
      if (!enemy.alive) return;
      enemy.retreating = true;
      enemy.state = 'RETREAT';
      runtime.enemiesRepelled += 1;
    });
    announce('HOSTILES RETREATING', 'The boarding attempt has failed. Hold position while Solis Reach assesses damage.', '#72f1b8');
    sound('success');
    globalThis.setTimeout(() => finish({ outcome: 'repelled', boardingPrevented: true }), 2300);
  }

  function updateEnemy(enemy, dtS) {
    if (!enemy.alive) return;
    const rocket = appCtx.spaceFlight.rocket;
    const target = enemy.role === 'boarding-craft' ? runtime.solisReach.position : rocket.position;
    if (enemy.retreating) {
      const away = enemy.host.position.clone().sub(runtime.solisReach.position).normalize();
      enemy.velocity.lerp(away.multiplyScalar(155), clamp(dtS * 1.8));
      enemy.host.position.addScaledVector(enemy.velocity, dtS);
      return;
    }
    const offset = target.clone().sub(enemy.host.position);
    const distance = offset.length();
    const direction = offset.normalize();
    if (enemy.evadeS > 0) {
      enemy.evadeS -= dtS;
      enemy.state = 'EVADE';
      direction.x += Math.sin(runtime.combatElapsedS * 5 + enemy.maxHealth) * 0.8;
      direction.z += Math.cos(runtime.combatElapsedS * 4 + enemy.maxHealth) * 0.65;
      direction.normalize();
    } else if (enemy.role === 'boarding-craft') {
      enemy.state = distance < 105 ? 'BOARDING_APPROACH' : 'INTERCEPT';
    } else {
      enemy.state = distance < 210 ? 'ATTACK_RUN' : 'PURSUE';
      if (distance < 120) direction.add(enemy.host.position.clone().sub(target).normalize().multiplyScalar(1.8)).normalize();
    }
    const speed = enemy.role === 'boarding-craft' ? 23 : enemy.role === 'attacker' ? 38 : 48;
    enemy.velocity.lerp(direction.multiplyScalar(speed), clamp(dtS * 1.9));
    enemy.host.position.addScaledVector(enemy.velocity, dtS);
    if (enemy.velocity.lengthSq() > 0.01) {
      const desired = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), enemy.velocity.clone().normalize());
      enemy.host.quaternion.slerp(desired, clamp(dtS * 3.2));
    }
    const marker = enemy.host.getObjectByName('target-marker');
    if (marker) {
      const hostWorldRotation = enemy.host.getWorldQuaternion(new THREE.Quaternion()).invert();
      marker.quaternion.copy(hostWorldRotation.multiply(appCtx.spaceFlight.camera.quaternion));
      marker.rotateZ(dtS * 0.8);
    }
    enemy.fireCooldownS -= dtS;
    if (enemy.fireCooldownS <= 0 && enemy.role !== 'boarding-craft') {
      if (fireEnemyWeapon(enemy, rocket.position, 'pathfinder')) enemy.fireCooldownS = 1.6 + runtime.random() * 1.6;
      else enemy.fireCooldownS = 0.5;
    } else if (enemy.fireCooldownS <= 0 && enemy.role === 'boarding-craft' && distance < 360) {
      if (fireEnemyWeapon(enemy, runtime.solisReach.position, 'solis-reach')) enemy.fireCooldownS = 2.1 + runtime.random() * 1.5;
      else enemy.fireCooldownS = 0.6;
    }
    if (enemy.role === 'boarding-craft' && distance < 105) {
      runtime.boardingProgress = clamp(runtime.boardingProgress + dtS / Number(runtime.encounter?.difficulty?.boardingDurationS || 34));
      if (runtime.phase !== 'BOARDING_THREAT') {
        runtime.phase = 'BOARDING_THREAT';
        runtime.hooks.onPhase?.('boarding_threat');
        announce('BOARDING LOCK DETECTED', 'Break the amber boarding craft away from Solis Reach before the lock completes.', '#ffd166');
        sound('alarm');
      }
      if (runtime.boardingProgress >= 1) finish({ outcome: 'boarded', boardingPrevented: false });
    }
  }

  function updateProjectiles(dtS) {
    const rocket = appCtx.spaceFlight.rocket;
    for (const projectile of runtime.projectiles) {
      if (!projectile.active) continue;
      projectile.lifeS -= dtS;
      projectile.position.addScaledVector(projectile.velocity, dtS);
      if (projectile.lifeS <= 0) {
        projectile.active = false;
        projectile.mesh.visible = false;
        continue;
      }
      if (projectile.team === 'player') {
        const enemy = runtime.enemies.find((entry) => entry.alive && projectile.position.distanceTo(entry.host.position) < (entry.role === 'boarding-craft' ? 13 : 9));
        if (!enemy) continue;
        projectile.active = false;
        projectile.mesh.visible = false;
        enemy.health -= 1;
        enemy.evadeS = 0.7;
        impact(projectile.position, 'player');
        if (enemy.health <= 0) destroyEnemy(enemy);
      } else {
        const hitSolis = projectile.target === 'solis-reach' && projectile.position.distanceTo(runtime.solisReach.position) < 38;
        const hitPlayer = projectile.target === 'pathfinder' && projectile.position.distanceTo(rocket.position) < 6.5;
        if (!hitSolis && !hitPlayer) continue;
        projectile.active = false;
        projectile.mesh.visible = false;
        impact(projectile.position, 'enemy');
        if (hitSolis) {
          runtime.solisReachHitCount += 1;
          runtime.solisReachCondition = clamp(runtime.solisReachCondition - 0.028 * Number(runtime.encounter?.difficulty?.enemyDamage || 1));
        } else {
          runtime.playerCondition = clamp(runtime.playerCondition - 0.095 * Number(runtime.encounter?.difficulty?.enemyDamage || 1));
          if (runtime.playerCondition <= 0.001) finish({ outcome: 'defensive-craft-disabled', boardingPrevented: runtime.boardingProgress < 1 });
        }
      }
    }
    for (const effect of runtime.impacts) {
      if (!effect.active) continue;
      effect.ageS += dtS;
      effect.mesh.scale.setScalar(0.5 + effect.ageS * 9);
      effect.mesh.material.opacity = Math.max(0, 0.75 - effect.ageS * 2.5);
      if (effect.ageS >= 0.3) {
        effect.active = false;
        effect.mesh.visible = false;
      }
    }
  }

  function updateTargetHud() {
    const rocket = appCtx.spaceFlight?.rocket;
    const target = selectedTarget();
    runtime.currentTargetId = target?.id || '';
    const read = document.getElementById('pirateTargetRead');
    const distance = document.getElementById('pirateTargetDistance');
    if (read) read.textContent = target ? `${formatRole(target.role)} · ${Math.max(0, target.health)}/${target.maxHealth}` : 'NO ACTIVE TARGET';
    if (distance) distance.textContent = target && rocket ? `${Math.round(target.host.position.distanceTo(rocket.position))} m · lead assist ${Math.round(Number(runtime.encounter?.difficulty?.aimAssist || 0) * 100)}%` : '—';
    setBar('piratePlayerCondition', runtime.playerCondition);
    setBar('pirateShipCondition', runtime.solisReachCondition);
    setBar('pirateBoardingBar', runtime.boardingProgress);
    const playerText = document.getElementById('piratePlayerConditionText');
    const shipText = document.getElementById('pirateShipConditionText');
    const boardingText = document.getElementById('pirateBoardingText');
    const boardingThreat = document.getElementById('pirateBoardingThreat');
    if (playerText) playerText.textContent = `${Math.round(runtime.playerCondition * 100)}%`;
    if (shipText) shipText.textContent = `${Math.round(runtime.solisReachCondition * 100)}%`;
    if (boardingText) boardingText.textContent = `${Math.round(runtime.boardingProgress * 100)}%`;
    if (boardingThreat) boardingThreat.hidden = runtime.boardingProgress <= 0 && !runtime.enemies.some((enemy) => enemy.alive && enemy.role === 'boarding-craft');
  }

  function updateBounds(dtS) {
    const rocket = appCtx.spaceFlight?.rocket;
    if (!rocket) return;
    const distance = rocket.position.length();
    runtime.boundWarning = distance > WARNING_RADIUS;
    document.body.classList.toggle('pirate-combat-bound-warning', runtime.boundWarning);
    if (runtime.boundWarning) {
      const direction = rocket.position.clone().normalize();
      appCtx.spaceFlight.velocity?.addScaledVector?.(direction, -0.7 * dtS);
      if (distance > COMBAT_RADIUS) rocket.position.setLength(COMBAT_RADIUS);
    }
  }

  function updateEscalation(dtS) {
    runtime.phaseElapsedS += dtS;
    if (runtime.phase === 'CONTACT_DETECTED' && runtime.phaseElapsedS >= 1.8) {
      runtime.phase = 'HOSTILITY_CONFIRMED';
      runtime.phaseElapsedS = 0;
      runtime.hooks.onPhase?.('confirm_hostility');
      runtime.enemies.forEach((enemy) => { enemy.host.visible = true; });
      announce('HOSTILE INTENT CONFIRMED', 'Multiple craft are accelerating toward Solis Reach.', '#ff6b7d');
      sound('alarm');
    } else if (runtime.phase === 'HOSTILITY_CONFIRMED' && runtime.phaseElapsedS >= 1.8) {
      runtime.phase = 'DEFENSE_PREPARATION';
      runtime.phaseElapsedS = 0;
      runtime.hooks.onPhase?.('prepare_defense');
      announce('BOARDING ATTEMPT INBOUND', 'Pathfinder launch authorized. Take defensive control.', '#ffd166');
    } else if (runtime.phase === 'DEFENSE_PREPARATION' && runtime.phaseElapsedS >= 2.1) {
      runtime.phase = 'COMBAT_ACTIVE';
      runtime.phaseElapsedS = 0;
      runtime.hooks.onPhase?.('begin_combat');
      announce('DEFENSIVE CONTROL ACTIVE', 'Repel enough attackers and stop the amber boarding craft.', '#61e8ff');
      document.getElementById('pirateFireButton')?.focus?.({ preventScroll: true });
    }
  }

  function update(dtS = 1 / 60) {
    if (!runtime.active || runtime.loading || !appCtx.spaceFlight?.rocket) return false;
    const dt = Math.min(0.05, Math.max(0.001, Number(dtS) || 1 / 60));
    runtime.elapsedS += dt;
    runtime.fireCooldownS = Math.max(0, runtime.fireCooldownS - dt);
    if (!['COMBAT_ACTIVE', 'BOARDING_THREAT'].includes(runtime.phase)) {
      updateEscalation(dt);
      updateTargetHud();
      return true;
    }
    runtime.combatElapsedS += dt;
    runtime.enemies.forEach((enemy) => updateEnemy(enemy, dt));
    updateProjectiles(dt);
    updateBounds(dt);
    const useCode = keyboardBindingCode('use_item');
    const normalizedUse = useCode.startsWith('Key') ? useCode.slice(3).toLowerCase() : useCode.toLowerCase();
    const gamepad = Array.from(globalThis.navigator?.getGamepads?.() || []).find((pad) => pad?.connected);
    const gamepadFire = gamepad?.buttons?.[2]?.pressed === true;
    if (runtime.input.fire || appCtx.spaceFlight.keys?.fire || appCtx.spaceFlight.keys?.[normalizedUse] || (gamepadFire && !runtime.input.gamepadFire)) firePlayerWeapon();
    runtime.input.gamepadFire = gamepadFire;
    updateTargetHud();
    return true;
  }

  async function finish(partial) {
    if (runtime.phase === 'AFTERMATH' || runtime.phase === 'COMPLETE') return false;
    runtime.resolving = true;
    runtime.phase = 'COMBAT_RESOLVING';
    const result = Object.freeze({
      ...partial,
      enemiesDestroyed: runtime.enemiesDestroyed,
      enemiesRepelled: Math.max(runtime.enemiesRepelled, runtime.enemiesDestroyed),
      boardingProgress: runtime.boardingProgress,
      pathfinderCondition: runtime.playerCondition,
      solisReachHitCount: runtime.solisReachHitCount,
      elapsedS: runtime.combatElapsedS
    });
    const persisted = await runtime.hooks.onResolve?.(result);
    runtime.phase = 'AFTERMATH';
    const boarded = result.outcome === 'boarded';
    const resultCard = document.getElementById('pirateCombatResult');
    if (resultCard) {
      resultCard.hidden = false;
      resultCard.innerHTML = `<span>${boarded ? 'BOARDING CONTAINED' : result.outcome === 'repelled' ? 'INTERCEPTION REPELLED' : 'PATHFINDER RECOVERED'}</span>
        <strong>${boarded ? 'Ship security has the outer lock.' : 'Solis Reach remains underway.'}</strong>
        <p>${persisted?.activeEncounter?.result?.summary || (boarded ? 'Damage control and medical teams are responding.' : 'Surviving hostiles have left the combat region.')}</p>
        <small>${result.enemiesDestroyed} destroyed · ${result.enemiesRepelled} repelled · Pathfinder ${Math.round(result.pathfinderCondition * 100)}%</small>
        <button id="pirateAftermathButton" type="button">Review damage and resume course</button>`;
      resultCard.querySelector('button')?.addEventListener('click', async () => {
        await runtime.hooks.onComplete?.();
        stop('complete');
      });
    }
    announce(boarded ? 'BOARDING PARTY CONTAINED' : 'COMBAT COMPLETE', 'Damage control is assessing Solis Reach.', boarded ? '#ffd166' : '#72f1b8');
    sound(boarded ? 'boarded' : 'success');
    return true;
  }

  async function begin(encounter, hooks = {}) {
    if (!encounter || !appCtx.spaceFlight?.scene || !appCtx.spaceFlight?.rocket) return false;
    stop('replace');
    const solarSystemGroup = appCtx.spaceFlight.scene.getObjectByName?.('solarSystemGroup');
    const resumedFromCheckpoint = encounter.phase === 'COMBAT_ACTIVE' || encounter.phase === 'BOARDING_THREAT';
    Object.assign(runtime, {
      active: true,
      phase: resumedFromCheckpoint ? 'COMBAT_ACTIVE' : 'CONTACT_DETECTED',
      encounter,
      elapsedS: 0,
      combatElapsedS: 0,
      phaseElapsedS: 0,
      fireCooldownS: 0,
      playerCondition: 1,
      solisReachCondition: 1,
      solisReachHitCount: 0,
      enemiesDestroyed: 0,
      enemiesRepelled: 0,
      boardingProgress: 0,
      currentTargetId: '',
      boundWarning: false,
      resolving: false,
      loading: true,
      solarSystemWasVisible: solarSystemGroup?.visible ?? null,
      random: seeded(encounter.seed),
      hooks
    });
    runtime.group = new THREE.Group();
    runtime.group.name = 'Pirate Boarding Interception';
    appCtx.spaceFlight.scene.add(runtime.group);
    const combatFill = new THREE.AmbientLight(0x8aa8c8, 0.72);
    combatFill.name = 'Interception combat fill';
    const combatRim = new THREE.PointLight(0xff3d75, 1.25, 760, 1.3);
    combatRim.name = 'Interception hostile rim';
    combatRim.position.set(-90, 105, 95);
    runtime.group.add(combatFill, combatRim);
    runtime.solisReach = createSolisReachExteriorMesh();
    runtime.solisReach.name = 'Solis Reach Combat Anchor';
    runtime.solisReach.position.set(102, 235, -48);
    runtime.solisReach.scale.multiplyScalar(0.86);
    runtime.group.add(runtime.solisReach);
    appCtx.spaceFlight.rocket.position.set(0, 0, 0);
    appCtx.spaceFlight.rocket.quaternion.identity();
    appCtx.spaceFlight.overviewMode = false;
    appCtx.spaceFlight._snapCameraToCraft = true;
    appCtx.spaceFlight.speed = 0.75;
    appCtx.spaceFlight.gravityVelocity?.set?.(0, 0, 0);
    ensureHud();
    document.body.classList.add('pirate-interception-active');
    if (solarSystemGroup) solarSystemGroup.visible = false;
    const ordinaryProximity = document.getElementById('ssProximity');
    if (ordinaryProximity) ordinaryProximity.style.display = 'none';
    document.getElementById('pirateCombatHUD').hidden = false;
    announce(
      resumedFromCheckpoint ? 'DEFENSIVE CONTROL RESTORING' : 'UNIDENTIFIED CONTACTS',
      resumedFromCheckpoint ? 'Pathfinder is returning to the saved pre-combat position.' : 'Sensors show several craft altering course toward Solis Reach.',
      resumedFromCheckpoint ? '#61e8ff' : '#ff9b68'
    );
    sound('contact');
    try {
      const count = Math.max(3, Math.min(6, Number(encounter.difficulty?.enemyCount) || 4));
      runtime.enemies = await Promise.all(Array.from({ length: count }, (_, index) => createEnemy(index, count)));
      if (!runtime.active) return false;
      runtime.loading = false;
      runtime.enemies.forEach((enemy) => { enemy.host.visible = runtime.phase === 'COMBAT_ACTIVE'; });
      if (resumedFromCheckpoint) {
        announce('DEFENSIVE CONTROL RESUMED', 'Repel enough attackers and stop the amber boarding craft.', '#61e8ff');
      }
      appCtx.updateControlsModeUI?.();
      return true;
    } catch (error) {
      console.error('Pirate interception assets could not be prepared.', error);
      announce('DEFENSIVE LAUNCH DELAYED', 'The hostile craft presentation could not be loaded. Retry from the Expedition panel.', '#ff6b7d');
      stop('asset-load-failed');
      return false;
    }
  }

  function stop(reason = 'runtime') {
    if (runtime.enemies.length) runtime.enemies.forEach((enemy) => {
      const marker = enemy.host?.getObjectByName?.('target-marker');
      marker?.geometry?.dispose?.();
      marker?.material?.dispose?.();
      enemy.instance?.dispose?.();
      enemy.host?.parent?.remove?.(enemy.host);
    });
    runtime.projectiles.forEach((projectile) => clearObject(projectile.mesh));
    runtime.impacts.forEach((effect) => clearObject(effect.mesh));
    runtime.solisReach?.parent?.remove?.(runtime.solisReach);
    runtime.group?.parent?.remove?.(runtime.group);
    runtime.enemies = [];
    runtime.projectiles = [];
    runtime.impacts = [];
    runtime.disposables = [];
    runtime.group = null;
    runtime.solisReach = null;
    const solarSystemGroup = appCtx.spaceFlight?.scene?.getObjectByName?.('solarSystemGroup');
    if (solarSystemGroup && runtime.solarSystemWasVisible != null) {
      solarSystemGroup.visible = runtime.solarSystemWasVisible;
    }
    runtime.solarSystemWasVisible = null;
    runtime.active = false;
    runtime.loading = false;
    runtime.phase = reason === 'complete' ? 'COMPLETE' : 'INACTIVE';
    runtime.input.fire = false;
    runtime.input.gamepadFire = false;
    document.body.classList.remove('pirate-interception-active', 'pirate-combat-bound-warning');
    const hud = document.getElementById('pirateCombatHUD');
    if (hud) hud.hidden = true;
    appCtx.spaceFlight.keys.fire = false;
    appCtx.updateControlsModeUI?.();
    return true;
  }

  function snapshot() {
    const rocket = appCtx.spaceFlight?.rocket;
    return Object.freeze({
      active: runtime.active,
      phase: runtime.phase,
      coordinateSystem: 'Local combat frame; Solis Reach is near (0,-260,0), +Y is craft-forward, units are presentation meters.',
      combatRadius: COMBAT_RADIUS,
      elapsedS: Number(runtime.combatElapsedS.toFixed(2)),
      player: rocket ? {
        x: Number(rocket.position.x.toFixed(1)), y: Number(rocket.position.y.toFixed(1)), z: Number(rocket.position.z.toFixed(1)),
        condition: Number(runtime.playerCondition.toFixed(3)), speed: Number(appCtx.spaceFlight.speed || 0)
      } : null,
      solisReach: runtime.solisReach ? {
        x: Number(runtime.solisReach.position.x.toFixed(1)), y: Number(runtime.solisReach.position.y.toFixed(1)), z: Number(runtime.solisReach.position.z.toFixed(1)),
        condition: Number(runtime.solisReachCondition.toFixed(3)), hitCount: runtime.solisReachHitCount
      } : null,
      objective: runtime.encounter?.objective || '',
      targetId: runtime.currentTargetId,
      boardingProgress: Number(runtime.boardingProgress.toFixed(3)),
      enemiesDestroyed: runtime.enemiesDestroyed,
      enemiesRepelled: runtime.enemiesRepelled,
      enemies: runtime.enemies.filter((enemy) => enemy.alive).map((enemy) => ({
        id: enemy.id, role: enemy.role, state: enemy.state,
        health: enemy.health, maxHealth: enemy.maxHealth,
        x: Number(enemy.host.position.x.toFixed(1)), y: Number(enemy.host.position.y.toFixed(1)), z: Number(enemy.host.position.z.toFixed(1))
      })),
      activeProjectiles: runtime.projectiles.filter((entry) => entry.active).length,
      projectilePoolSize: runtime.projectiles.length,
      impactPoolSize: runtime.impacts.length,
      maxProjectiles: MAX_PROJECTILES,
      boundWarning: runtime.boundWarning,
      controls: {
        fly: 'configured movement actions or arrows',
        thrust: keyboardBindingLabel('primary_action'),
        brake: keyboardBindingLabel('modifier_action'),
        fire: keyboardBindingLabel('use_item'),
        mobile: 'flight pad plus FIRE action',
        gamepad: 'left stick fly, A thrust, X fire'
      }
    });
  }

  function verificationAlignEnemy(enemyId, distance = 86) {
    const diagnosticsEnabled = new URLSearchParams(globalThis.location?.search || '').get('diagnostics') === '1';
    if (!diagnosticsEnabled || !runtime.active || !appCtx.spaceFlight?.rocket) return false;
    const enemy = runtime.enemies.find((entry) => entry.alive && (entry.id === enemyId || entry.role === enemyId));
    if (!enemy) return false;
    const rocket = appCtx.spaceFlight.rocket;
    const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(rocket.quaternion).normalize();
    enemy.host.position.copy(rocket.position).addScaledVector(forward, Math.max(40, Math.min(180, Number(distance) || 86)));
    enemy.velocity.set(0, 0, 0);
    runtime.fireCooldownS = 0;
    runtime.currentTargetId = enemy.id;
    return true;
  }

  globalThis.addEventListener?.('keydown', (event) => {
    if (!runtime.active || !keyMatchesKeyboardAction(event.code, 'use_item')) return;
    event.preventDefault();
    firePlayerWeapon();
  }, true);
  appCtx.spaceFlight?.canvas?.addEventListener?.('pointerdown', (event) => {
    if (!runtime.active || event.button !== 0 || event.pointerType === 'touch') return;
    firePlayerWeapon();
  });

  return Object.freeze({
    get active() { return runtime.active; },
    begin,
    fire: firePlayerWeapon,
    finish,
    snapshot,
    stop,
    update,
    verification: Object.freeze({ alignEnemy: verificationAlignEnemy })
  });
}

export {
  COMBAT_RADIUS,
  ENEMY_PROJECTILE_SPEED,
  MAX_PROJECTILES,
  PIRATE_ASSET_ID,
  PLAYER_PROJECTILE_SPEED,
  createPirateInterceptionRuntime
};
