import { ctx as appCtx } from "../shared-context.js?v=55";
import { getAstronomicalBody, LANDING_MODE } from '../astronomy/body-catalog.js?v=1';
import { SPACE_CONSTANTS } from "./constants.js?v=1";
import { evaluateAtmosphericEntry } from './atmospheric-descent-authority.js?v=1';
import {
  computeBodyRelativeNavigation,
  evaluateLandingEligibility
} from './spacecraft-authority.js?v=1';

const MAX_LOCAL_SPACECRAFT_SPEED_KM_S = 192.2;
const BODY_RADIUS_KM = Object.freeze({
  sun: 695700,
  mercury: 2439.7,
  venus: 6051.8,
  earth: 6371,
  moon: 1737.4,
  mars: 3389.5,
  jupiter: 69911,
  saturn: 58232,
  uranus: 25362,
  neptune: 24622
});

function setMetric(labelId, valueId, unitId, label, value, unit) {
  const labelElement = document.getElementById(labelId);
  const valueElement = document.getElementById(valueId);
  const unitElement = document.getElementById(unitId);
  if (labelElement) labelElement.textContent = label;
  if (valueElement) valueElement.textContent = value;
  if (unitElement) unitElement.textContent = unit;
}

function formatLightYears(value) {
  if (!Number.isFinite(value)) return { value: '---', unit: '' };
  if (value >= 1e6) return { value: (value / 1e6).toFixed(value >= 1e7 ? 1 : 2), unit: 'million ly' };
  if (value >= 1000) return { value: Math.round(value).toLocaleString(), unit: 'ly' };
  if (value >= 1) return { value: value.toFixed(value >= 100 ? 0 : 1), unit: 'ly' };
  const au = value * 63241.077;
  return { value: au.toFixed(au >= 100 ? 0 : 1), unit: 'AU' };
}

function formatAcceleration(value) {
  if (!Number.isFinite(value) || value <= 1) return 'real time';
  return `time acceleration ×${value.toExponential(1)}`;
}

export function initSpaceFlightUI(attemptLanding, lifecycleScope = null) {
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
    <div id="sfFlightStatus" style="margin-bottom:9px;color:#a5b4fc;font-size:11px;letter-spacing:0.04em;">Preparing flight</div>
    <div style="margin-bottom:6px;">Nearest: <span id="sfDestination" style="color:#10b981;font-weight:600;">---</span></div>
    <div style="margin-bottom:6px;"><span id="sfAltitudeLabel">Altitude</span>: <span id="sfAltitude">0</span> <span id="sfAltitudeUnit">km</span></div>
    <div style="margin-bottom:6px;"><span id="sfSpeedLabel">Velocity</span>: <span id="sfSpeed">0</span> <span id="sfSpeedUnit">km/s</span></div>
    <div style="margin-bottom:12px;"><span id="sfDistanceLabel">Distance</span>: <span id="sfDistance" style="color:#fbbf24;">---</span> <span id="sfDistanceUnit">km</span></div>
    <div id="sfEnvironment" style="margin:-4px 0 12px;color:#cbd5e1;font-size:10px;line-height:1.45;">Deep space</div>
    <div style="background:rgba(102,126,234,0.2);border-radius:8px;padding:10px;margin-bottom:12px;">
      <div id="sfZoneLabel" style="font-size:11px;opacity:0.8;margin-bottom:6px;">LANDING ZONE</div>
      <div style="height:8px;background:rgba(0,0,0,0.3);border-radius:4px;overflow:hidden;">
        <div id="sfLandingBar" style="height:100%;width:0%;background:linear-gradient(90deg,#10b981,#34d399);transition:width 0.3s;"></div>
      </div>
      <div id="sfLandingText" style="font-size:10px;margin-top:4px;opacity:0.7;">Fly closer to land</div>
    </div>
    <button id="sfAssistBtn" style="width:100%;padding:12px;margin-bottom:8px;background:#315d9d;border:1px solid #60a5fa;border-radius:8px;color:#fff;font-weight:600;cursor:pointer;font-family:Orbitron,sans-serif;transition:all 0.2s;">
      ENGAGE FLIGHT ASSIST
    </button>
    <button id="sfLandBtn" style="width:100%;padding:12px;background:#667eea;border:none;border-radius:8px;color:#fff;font-weight:600;cursor:pointer;font-family:Orbitron,sans-serif;transition:all 0.2s;opacity:0.5;" disabled>
      EXPLORE SOLAR SYSTEM
    </button>
  `;
  document.body.appendChild(hud);
  appCtx.spaceFlight.hud = hud;

  setupSpaceFlightControls(attemptLanding, lifecycleScope);
}

function setupSpaceFlightControls(attemptLanding, lifecycleScope = null) {
  const listen = lifecycleScope?.listen?.bind(lifecycleScope) || ((target, eventName, listener, options) => {
    target.addEventListener(eventName, listener, options);
  });
  listen(document.getElementById('sfLandBtn'), 'click', attemptLanding);
  listen(document.getElementById('sfAssistBtn'), 'click', () => {
    if (appCtx.spaceJourney?.phase === 'atmospheric_exploration') return;
    const result = appCtx.toggleRenderedJourneyAssist?.();
    if (!result?.accepted) {
      showFlightMessage('FLIGHT ASSIST IS NOT AVAILABLE HERE', '#f59e0b');
    } else if (result.active === false) {
      showFlightMessage('MANUAL CONTROL', '#60a5fa');
    } else {
      showFlightMessage('FLIGHT ASSIST ENGAGED', '#10b981');
    }
  });
  const climbButton = document.getElementById('sfAssistBtn');
  const setAtmosphericClimb = (active, event) => {
    if (appCtx.spaceJourney?.phase !== 'atmospheric_exploration') return;
    event?.preventDefault?.();
    appCtx.spaceFlight._atmosphericClimbRequested = active;
  };
  listen(climbButton, 'pointerdown', (event) => setAtmosphericClimb(true, event));
  listen(climbButton, 'pointerup', (event) => setAtmosphericClimb(false, event));
  listen(climbButton, 'pointercancel', (event) => setAtmosphericClimb(false, event));
  listen(climbButton, 'pointerleave', (event) => setAtmosphericClimb(false, event));

  listen(document, 'keydown', (e) => {
    if (appCtx.spaceFlight.active) {
      appCtx.spaceFlight.keys[e.key.toLowerCase()] = true;
      if ([' ', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    }
  });

  listen(document, 'keyup', (e) => {
    if (appCtx.spaceFlight.active) {
      appCtx.spaceFlight.keys[e.key.toLowerCase()] = false;
    }
  });

  listen(window, 'resize', () => {
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
  const universeTarget = appCtx.getUniverseHudTarget?.();

  if (universeTarget?.position) {
    nearestBody = universeTarget;
    nearestDist = rocket.position.distanceTo(universeTarget.position);
  } else if (typeof appCtx.getAllSpaceBodies === 'function') {
    const bodies = appCtx.getAllSpaceBodies();
    bodies.forEach((body) => {
      const dist = rocket.position.distanceTo(body.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestBody = body;
      }
    });
  }

  if (!nearestBody && !universeTarget) {
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
  const displaySpeed = appCtx.spaceFlight.velocity ? appCtx.spaceFlight.velocity.length() : appCtx.spaceFlight.speed;
  const zoneLabel = document.getElementById('sfZoneLabel');
  const flightStatus = document.getElementById('sfFlightStatus');
  const assistBtn = document.getElementById('sfAssistBtn');
  const environmentText = document.getElementById('sfEnvironment');
  const destinationName = appCtx.spaceJourneyEphemeris?.destination?.bodyId || appCtx.spaceFlight.destination || 'destination';
  const departureName = appCtx.spaceJourneyEphemeris?.source?.bodyId || appCtx.spaceJourney?.sourceBodyId || 'departure point';
  const destinationLabel = getAstronomicalBody(destinationName)?.name || destinationName;
  const departureLabel = getAstronomicalBody(departureName)?.name || departureName;
  const sourceLabel = getAstronomicalBody(appCtx.spaceJourney?.sourceBodyId)?.name || appCtx.spaceJourney?.sourceBodyId || 'Earth';
  const phaseCopy = {
    preparing: 'Preparing flight',
    launch: 'Leaving the surface',
    parking_orbit: `${sourceLabel} orbit`,
    transfer: `Cruising to ${destinationLabel}`,
    approach: `${destinationLabel} approach`,
    atmospheric_exploration: `Exploring ${destinationLabel}'s atmosphere`,
    descent: `Landing on ${destinationLabel}`,
    surface: `On ${destinationLabel}`,
    ascent: `Leaving ${departureLabel}`,
    return_transfer: `Returning to ${destinationLabel}`,
    home_approach: `${destinationLabel} approach`,
    home_descent: `Landing on ${destinationLabel}`,
    complete: 'Journey complete'
  };
  if (flightStatus) {
    const copy = phaseCopy[appCtx.spaceJourney?.phase] || 'Manual flight';
    flightStatus.textContent = copy;
  }
  if (assistBtn) {
    const assist = appCtx.spaceJourneyAssistState;
    const atmosphericClimb = appCtx.spaceJourney?.phase === 'atmospheric_exploration';
    assistBtn.style.display = assist?.available === false && !atmosphericClimb ? 'none' : '';
    assistBtn.disabled = atmosphericClimb
      ? false
      : !assist?.available || !['parking_orbit', 'transfer', 'return_transfer'].includes(appCtx.spaceJourney?.phase);
    assistBtn.style.opacity = assistBtn.disabled ? '0.55' : '1';
    assistBtn.textContent = atmosphericClimb
      ? 'HOLD TO CLIMB'
      : assist?.holding
      ? 'APPROACH HOLD · PRESS SPACE FOR MANUAL'
      : assist?.active
      ? assist.kind === 'ascent'
        ? `ASSISTED TAKEOFF · ${Math.round((assist.progress || 0) * 100)}%`
        : `TAKE MANUAL CONTROL · ${Math.round((assist.progress || 0) * 100)}%`
      : `FLY TO ${String(destinationName).toUpperCase()} WITH ASSIST`;
  }
  if (environmentText) {
    const environment = appCtx.spaceFlightEnvironment;
    if (!environment) {
      environmentText.textContent = 'Deep space';
    } else if (environment.pressurePa > 0.5) {
      const pressure = environment.pressurePa >= 1000
        ? `${(environment.pressurePa / 1000).toFixed(1)} kPa`
        : `${Math.round(environment.pressurePa)} Pa`;
      environmentText.textContent = `${environment.bodyId[0].toUpperCase()}${environment.bodyId.slice(1)} atmosphere · ${pressure} · ${Math.round(environment.temperatureK - 273.15)}°C`;
    } else {
      environmentText.textContent = `${environment.bodyId[0].toUpperCase()}${environment.bodyId.slice(1)} vacuum · ${environment.gravityMagnitudeMps2.toFixed(2)} m/s²`;
    }
  }

  if (universeTarget?.navigation) {
    const navigation = universeTarget.navigation;
    const offset = formatLightYears(navigation.offsetLy);
    const span = formatLightYears(navigation.frameSpanLy);
    const velocityIsRelativistic = navigation.velocityC >= 0.01;
    setMetric('sfAltitudeLabel', 'sfAltitude', 'sfAltitudeUnit', 'Frame offset', offset.value, offset.unit);
    setMetric(
      'sfSpeedLabel',
      'sfSpeed',
      'sfSpeedUnit',
      'Velocity',
      velocityIsRelativistic ? navigation.velocityC.toFixed(3) : navigation.velocityKmS.toFixed(0),
      velocityIsRelativistic ? 'c' : 'km/s'
    );
    setMetric('sfDistanceLabel', 'sfDistance', 'sfDistanceUnit', 'Frame span', span.value, span.unit);
    if (zoneLabel) zoneLabel.textContent = 'NAVIGATION FRAME';
  } else {
    const physicalBodyId = String(activeHudBody.name || '').toLowerCase();
    const missionBody = appCtx.spaceJourneyEphemeris?.source?.bodyId === physicalBodyId
      ? appCtx.spaceJourneyEphemeris.source
      : appCtx.spaceJourneyEphemeris?.destination?.bodyId === physicalBodyId
        ? appCtx.spaceJourneyEphemeris.destination
        : null;
    const physicalNavigation = appCtx.spacecraftState && missionBody
      ? computeBodyRelativeNavigation(appCtx.spacecraftState, missionBody)
      : null;
    const physicalRadius = BODY_RADIUS_KM[physicalBodyId];
    const sceneToKm = physicalRadius && activeHudBody.radius > 0
      ? physicalRadius / activeHudBody.radius
      : null;
    const speedKmS = physicalNavigation
      ? physicalNavigation.relativeSpeedMps / 1000
      : Math.max(0, Math.min(1, displaySpeed / SPACE_CONSTANTS.MAX_SPEED)) * MAX_LOCAL_SPACECRAFT_SPEED_KM_S;
    setMetric(
      'sfAltitudeLabel',
      'sfAltitude',
      'sfAltitudeUnit',
      'Altitude',
      physicalNavigation
        ? Math.round(physicalNavigation.altitudeM / 1000).toLocaleString()
        : sceneToKm ? Math.round(altitude * sceneToKm).toLocaleString() : Math.floor(altitude).toLocaleString(),
      physicalNavigation || sceneToKm ? 'km' : 'display u'
    );
    setMetric('sfSpeedLabel', 'sfSpeed', 'sfSpeedUnit', 'Velocity', speedKmS.toFixed(1), 'km/s');
    setMetric(
      'sfDistanceLabel',
      'sfDistance',
      'sfDistanceUnit',
      'Distance',
      physicalNavigation
        ? Math.round(physicalNavigation.centerDistanceM / 1000).toLocaleString()
        : sceneToKm ? Math.round(activeDist * sceneToKm).toLocaleString() : Math.floor(activeDist).toLocaleString(),
      physicalNavigation || sceneToKm ? 'km' : 'display u'
    );
    if (zoneLabel) zoneLabel.textContent = 'LANDING ZONE';
  }

  const landingProgress = Math.max(0, 1 - (activeDist - activeHudBody.radius) / SPACE_CONSTANTS.LANDING_DISTANCE);
  const landingBar = document.getElementById('sfLandingBar');
  const landingText = document.getElementById('sfLandingText');
  const landBtn = document.getElementById('sfLandBtn');

  if (landingBar) landingBar.style.width = landingProgress * 100 + '%';

  const physicalLanding = appCtx.spacecraftState && appCtx.spaceJourneyEphemeris?.destination
    ? evaluateLandingEligibility(appCtx.spacecraftState, appCtx.spaceJourneyEphemeris.destination)
    : null;
  const targetBody = getAstronomicalBody(String(activeHudBody.name || '').toLowerCase());
  const atmosphericTarget = targetBody?.exploration?.landingMode === LANDING_MODE.ATMOSPHERIC_DESCENT;
  const atmosphericExploration = appCtx.spaceJourney?.phase === 'atmospheric_exploration'
    ? appCtx.spaceAtmosphereExploration
    : null;
  const atmosphericEntry = atmosphericTarget && physicalLanding?.navigation
    ? evaluateAtmosphericEntry(targetBody.id, physicalLanding.navigation)
    : null;
  const canLand = physicalLanding
    ? physicalLanding.eligible && ['approach', 'home_approach'].includes(appCtx.spaceJourney?.phase)
    : activeDist < SPACE_CONSTANTS.LANDING_DISTANCE + activeHudBody.radius;

  if (universeTarget) {
    if (landingBar) landingBar.style.width = '0%';
    if (landingText) {
      const dilation = universeTarget.encounter?.timeDilation;
      const generatedEncounter = universeTarget.encounter?.type === 'generated-asteroids'
        ? `Asteroid field · X pulse · ${universeTarget.encounter.active} remaining`
        : '';
      landingText.textContent = Number.isFinite(dilation)
        ? `Relativistic clock rate: ${(dilation * 100).toFixed(1)}%`
        : generatedEncounter || `${formatAcceleration(universeTarget.navigation?.timeAcceleration)} · ${universeTarget.address}`;
    }
    if (landBtn) {
      landBtn.disabled = true;
      landBtn.style.opacity = '0.7';
      landBtn.style.background = '#315d9d';
      landBtn.textContent = 'EXPLORING ' + activeHudBody.name.toUpperCase();
    }
  } else if (atmosphericExploration) {
    const pressurePa = Number(atmosphericExploration.environment?.pressurePa) || 0;
    const pressureRatio = Math.max(0, Math.min(1, pressurePa / atmosphericExploration.pressureLimitPa));
    const depthLimit = atmosphericExploration.phase === 'depth_limit';
    if (zoneLabel) zoneLabel.textContent = 'FLIGHT ENVELOPE';
    if (landingBar) {
      landingBar.style.width = `${pressureRatio * 100}%`;
      landingBar.style.background = 'linear-gradient(90deg,#38bdf8,#f59e0b)';
    }
    if (landingText) {
      landingText.textContent = depthLimit
        ? 'Safe depth limit reached · no solid surface'
        : 'Descending through the atmosphere · hold Climb to rise';
    }
    if (landBtn) {
      landBtn.disabled = false;
      landBtn.style.opacity = '1';
      landBtn.style.background = '#2563eb';
      landBtn.textContent = 'EXIT ATMOSPHERE AND RETURN';
    }
  } else if (atmosphericEntry?.authorized && appCtx.spaceJourney?.phase === 'approach') {
    if (zoneLabel) zoneLabel.textContent = 'ATMOSPHERIC ENTRY';
    if (landingBar) {
      landingBar.style.width = '100%';
      landingBar.style.background = 'linear-gradient(90deg,#38bdf8,#2563eb)';
    }
    if (landingText) landingText.textContent = 'Entry corridor ready · this world has no solid surface';
    if (landBtn) {
      landBtn.disabled = false;
      landBtn.style.opacity = '1';
      landBtn.style.background = '#2563eb';
      landBtn.textContent = 'ENTER ' + activeHudBody.name.toUpperCase() + ' ATMOSPHERE';
    }
  } else if (canLand && activeHudBody.landable) {
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
    if (landingText) {
      const physicalAltitudeKm = physicalLanding?.navigation?.altitudeM;
      landingText.textContent = appCtx.spaceJourney?.phase === 'transfer'
        ? `Cruising to ${activeHudBody.name}`
        : appCtx.spaceJourney?.phase === 'parking_orbit'
          ? 'Choose flight assist or take manual control'
          : 'Distance to ' + activeHudBody.name + ': ' + (
            Number.isFinite(physicalAltitudeKm)
              ? Math.round(physicalAltitudeKm / 1000).toLocaleString()
              : Math.floor(altitude).toLocaleString()
          ) + ' km';
    }
    if (landBtn) {
      landBtn.disabled = true;
      landBtn.style.opacity = '0.5';
      landBtn.style.background = '#667eea';
      landBtn.textContent = 'LANDING NOT YET AVAILABLE';
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
