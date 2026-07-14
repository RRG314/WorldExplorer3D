import { ctx as appCtx } from "../shared-context.js?v=55";
import { SPACE_CONSTANTS } from "./constants.js?v=1";

export function initSpaceFlightUI(attemptLanding) {
  console.log("Initializing Space Flight UI...");

  appCtx.spaceFlight.velocity = new THREE.Vector3();
  appCtx.spaceFlight._gravityVec = new THREE.Vector3();
  appCtx.spaceFlight.gravityVelocity = new THREE.Vector3();

  const canvas = document.createElement('canvas');
  canvas.id = 'spaceFlightCanvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:10000;display:none;';
  document.body.appendChild(canvas);
  appCtx.spaceFlight.canvas = canvas;

  const hud = document.createElement('div');
  hud.id = 'spaceFlightHUD';
  hud.style.cssText = 'position:fixed;bottom:20px;left:20px;background:rgba(10,10,30,0.95);border:2px solid #667eea;border-radius:12px;padding:16px;color:#fff;font-family:Orbitron,sans-serif;font-size:13px;z-index:10001;display:none;min-width:248px;';
  hud.innerHTML = `
    <div style="font-size:16px;color:#667eea;margin-bottom:12px;font-weight:700;display:flex;align-items:center;gap:8px;">
      <span style="font-size:24px;">🚀</span> SPACE FLIGHT
    </div>
    <div style="margin-bottom:6px;">Nearest: <span id="sfDestination" style="color:#10b981;font-weight:600;">---</span></div>
    <div style="margin-bottom:6px;">Altitude: <span id="sfAltitude">0</span> km</div>
    <div style="margin-bottom:6px;">Speed: <span id="sfSpeed">0</span> km/s</div>
    <div style="margin-bottom:12px;">Distance: <span id="sfDistance" style="color:#fbbf24;">---</span> km</div>
    <div style="background:rgba(102,126,234,0.2);border-radius:8px;padding:10px;margin-bottom:12px;">
      <div style="font-size:11px;opacity:0.8;margin-bottom:6px;">LANDING ZONE</div>
      <div style="height:8px;background:rgba(0,0,0,0.3);border-radius:4px;overflow:hidden;">
        <div id="sfLandingBar" style="height:100%;width:0%;background:linear-gradient(90deg,#10b981,#34d399);transition:width 0.3s;"></div>
      </div>
      <div id="sfLandingText" style="font-size:10px;margin-top:4px;opacity:0.7;">Fly closer to land</div>
    </div>
    <button id="sfLandBtn" style="width:100%;padding:12px;background:#667eea;border:none;border-radius:8px;color:#fff;font-weight:600;cursor:pointer;font-family:Orbitron,sans-serif;transition:all 0.2s;opacity:0.5;" disabled>
      EXPLORE SOLAR SYSTEM
    </button>
  `;
  document.body.appendChild(hud);
  appCtx.spaceFlight.hud = hud;

  setupSpaceFlightControls(attemptLanding);
}

function setupSpaceFlightControls(attemptLanding) {
  document.getElementById('sfLandBtn').addEventListener('click', attemptLanding);

  document.addEventListener('keydown', (e) => {
    if (appCtx.spaceFlight.active) {
      appCtx.spaceFlight.keys[e.key.toLowerCase()] = true;
      if ([' ', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (appCtx.spaceFlight.active) {
      appCtx.spaceFlight.keys[e.key.toLowerCase()] = false;
    }
  });

  window.addEventListener('resize', () => {
    if (appCtx.spaceFlight.active && appCtx.spaceFlight.camera && appCtx.spaceFlight.renderer) {
      appCtx.spaceFlight.camera.aspect = window.innerWidth / window.innerHeight;
      appCtx.spaceFlight.camera.updateProjectionMatrix();
      appCtx.spaceFlight.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  });
}

export function hideGameUI() {
  const elementsToHide = [
    'hud',
    'minimap',
    'minimapZoomControls',
    'coords',
    'floatMenuContainer',
    'controlsTab',
    'police',
    'navigationHud',
    'interiorPrompt',
    'boatPrompt',
    'boatWaveDock',
    'flowerChallengeHud',
    'buildModeIndicator'
  ];
  elementsToHide.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

export function showGameUI() {
  const elementsToShow = [
    'hud',
    'minimap',
    'minimapZoomControls',
    'coords',
    'floatMenuContainer',
    'controlsTab',
    'interiorPrompt',
    'boatPrompt',
    'boatWaveDock',
    'flowerChallengeHud',
    'buildModeIndicator'
  ];
  elementsToShow.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
  if (typeof appCtx.policeOn !== 'undefined' && appCtx.policeOn) {
    const policeEl = document.getElementById('police');
    if (policeEl) policeEl.style.display = '';
  }
}

export function updateSpaceFlightHUD(findLandableBodyByName) {
  const rocket = appCtx.spaceFlight.rocket;
  const manualTargetBody = findLandableBodyByName(appCtx.spaceFlight._manualLandingTarget);

  let nearestBody = null;
  let nearestDist = Infinity;

  if (typeof appCtx.getAllSpaceBodies === 'function') {
    const bodies = appCtx.getAllSpaceBodies();
    bodies.forEach((body) => {
      const dist = rocket.position.distanceTo(body.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestBody = body;
      }
    });
  }

  if (!nearestBody) {
    const target = appCtx.spaceFlight.destination === 'moon' ? appCtx.spaceFlight.moon : appCtx.spaceFlight.earth;
    const targetRadius = appCtx.spaceFlight.destination === 'moon' ? SPACE_CONSTANTS.MOON_SIZE : SPACE_CONSTANTS.EARTH_SIZE;
    nearestDist = rocket.position.distanceTo(target.position);
    nearestBody = {
      name: appCtx.spaceFlight.destination === 'moon' ? 'Moon' : 'Earth',
      position: target.position,
      radius: targetRadius,
      mesh: target,
      landable: true
    };
  }

  appCtx.spaceFlight._nearestBody = nearestBody;

  let activeHudBody = nearestBody;
  let activeDist = nearestDist;
  if (manualTargetBody && manualTargetBody.position) {
    activeHudBody = manualTargetBody;
    activeDist = rocket.position.distanceTo(manualTargetBody.position);
  }

  document.getElementById('sfDestination').textContent = activeHudBody.name;
  const altitude = Math.max(0, activeDist - activeHudBody.radius);
  document.getElementById('sfAltitude').textContent = Math.floor(altitude);
  const displaySpeed = appCtx.spaceFlight.velocity ? appCtx.spaceFlight.velocity.length() : appCtx.spaceFlight.speed;
  document.getElementById('sfSpeed').textContent = displaySpeed.toFixed(1);
  document.getElementById('sfDistance').textContent = Math.floor(activeDist);

  const landingProgress = Math.max(0, 1 - (activeDist - activeHudBody.radius) / SPACE_CONSTANTS.LANDING_DISTANCE);
  const landingBar = document.getElementById('sfLandingBar');
  const landingText = document.getElementById('sfLandingText');
  const landBtn = document.getElementById('sfLandBtn');

  if (landingBar) landingBar.style.width = landingProgress * 100 + '%';

  const canLand = activeDist < SPACE_CONSTANTS.LANDING_DISTANCE + activeHudBody.radius;

  if (canLand && activeHudBody.landable) {
    if (landingText) landingText.textContent = 'IN RANGE - Ready to land!';
    if (landBtn) {
      landBtn.disabled = false;
      landBtn.style.opacity = '1';
      landBtn.style.background = '#10b981';
      landBtn.textContent = 'LAND ON ' + activeHudBody.name.toUpperCase();
    }
  } else if (canLand && !activeHudBody.landable) {
    if (landingText) landingText.textContent = 'Orbiting ' + activeHudBody.name + ' (flyby)';
    if (landingBar) landingBar.style.background = 'linear-gradient(90deg,#fbbf24,#f59e0b)';
    if (landBtn) {
      landBtn.disabled = true;
      landBtn.style.opacity = '0.7';
      landBtn.style.background = '#b45309';
      landBtn.textContent = 'ORBITING ' + activeHudBody.name.toUpperCase();
    }
  } else {
    if (landingBar) landingBar.style.background = 'linear-gradient(90deg,#10b981,#34d399)';
    if (landingText) landingText.textContent = 'Nearest: ' + activeHudBody.name + ' (' + Math.floor(altitude) + ' km)';
    if (landBtn) {
      landBtn.disabled = true;
      landBtn.style.opacity = '0.5';
      landBtn.style.background = '#667eea';
      landBtn.textContent = 'FLY TO ' + activeHudBody.name.toUpperCase();
    }
  }
}

export function showFlightMessage(text, color) {
  const existing = document.getElementById('sfMessage');
  if (existing) existing.remove();

  const msg = document.createElement('div');
  msg.id = 'sfMessage';
  msg.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.9);border:3px solid ${color};border-radius:16px;padding:24px 48px;color:${color};font-family:Orbitron,sans-serif;font-size:24px;font-weight:700;z-index:10002;text-align:center;pointer-events:none;`;
  msg.textContent = text;
  document.body.appendChild(msg);

  setTimeout(() => {
    msg.style.transition = 'opacity 0.5s';
    msg.style.opacity = '0';
    setTimeout(() => msg.remove(), 500);
  }, 2000);
}
