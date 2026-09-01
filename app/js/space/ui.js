import { ctx as appCtx } from "../shared-context.js?v=55";
import { getAstronomicalBody, LANDING_MODE } from '../astronomy/body-catalog.js?v=2';
import { SPACE_CONSTANTS } from "./constants.js?v=1";
import { evaluateAtmosphericEntry } from './atmospheric-descent-authority.js?v=1';
import {
  computeBodyRelativeNavigation,
  evaluateLandingEligibility
} from './spacecraft-authority.js?v=2';
import { spacecraftOperationTuning } from '../character/spacecraft-assistance.js?v=1';

const MAX_LOCAL_SPACECRAFT_SPEED_KM_S = 192.2;

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

function normalizedSpaceKey(event) {
  if (event.code === 'Space' || event.key === ' ') return ' ';
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') return 'shift';
  if (event.code?.startsWith('Arrow')) return event.code.toLowerCase();
  return String(event.key || '').toLowerCase();
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
  hud.className = 'spaceFlightHud';
  hud.innerHTML = `
    <div class="spaceFlightHudHead">
      <span aria-hidden="true">✦</span><strong>WAYFINDER FLIGHT</strong>
      <button id="sfHudToggle" type="button" aria-expanded="true" aria-label="Collapse flight instruments">−</button>
    </div>
    <div id="sfFlightStatus" class="spaceFlightHudStatus">Preparing flight</div>
    <div class="spaceFlightHudBody">
    <div id="sfFlightRead" class="spaceFlightHudRead">Basic flight guidance</div>
    <div class="spaceFlightMetric"><span>Nearest</span><b id="sfDestination">---</b></div>
    <div class="spaceFlightMetric"><span id="sfAltitudeLabel">Altitude</span><b><span id="sfAltitude">0</span> <span id="sfAltitudeUnit">km</span></b></div>
    <div class="spaceFlightMetric"><span id="sfSpeedLabel">Velocity</span><b><span id="sfSpeed">0</span> <span id="sfSpeedUnit">km/s</span></b></div>
    <div class="spaceFlightMetric"><span id="sfDistanceLabel">Distance</span><b><span id="sfDistance">---</span> <span id="sfDistanceUnit">km</span></b></div>
    <div id="sfEnvironment" class="spaceFlightHudEnvironment">Deep space</div>
    <div class="spaceFlightZone">
      <div id="sfZoneLabel" style="font-size:11px;opacity:0.8;margin-bottom:6px;">LANDING ZONE</div>
      <div style="height:8px;background:rgba(0,0,0,0.3);border-radius:4px;overflow:hidden;">
        <div id="sfLandingBar" style="height:100%;width:0%;background:linear-gradient(90deg,#10b981,#34d399);transition:width 0.3s;"></div>
      </div>
      <div id="sfLandingText" style="font-size:10px;margin-top:4px;opacity:0.7;">Fly closer to land</div>
    </div>
    <button id="sfAssistBtn" style="width:100%;padding:12px;margin-bottom:8px;background:#315d9d;border:1px solid #60a5fa;border-radius:8px;color:#fff;font-weight:600;cursor:pointer;font-family:Orbitron,sans-serif;transition:all 0.2s;">
      ENGAGE FLIGHT ASSIST
    </button>
    <button id="sfExpeditionBtn" style="width:100%;padding:11px;margin-bottom:8px;background:#152b4f;border:1px solid #38bdf8;border-radius:8px;color:#e0f2fe;font-weight:600;cursor:pointer;font-family:Orbitron,sans-serif;transition:all 0.2s;">
      INTERSTELLAR EXPEDITION
    </button>
    <button id="sfLandBtn" style="width:100%;padding:12px;background:#667eea;border:none;border-radius:8px;color:#fff;font-weight:600;cursor:pointer;font-family:Orbitron,sans-serif;transition:all 0.2s;opacity:0.5;" disabled>
      EXPLORE SOLAR SYSTEM
    </button>
    </div>
  `;
  document.body.appendChild(hud);
  appCtx.spaceFlight.hud = hud;

  setupSpaceFlightControls(attemptLanding, lifecycleScope);
  prepareSpaceFlightHudForEntry();
}

export function setSpaceFlightHudCollapsed(collapsed) {
  const hud = document.getElementById('spaceFlightHUD');
  const isCollapsed = Boolean(collapsed);
  hud?.classList.toggle('collapsed', isCollapsed);
  const isVisible = hud ? globalThis.getComputedStyle?.(hud).display !== 'none' : false;
  document.body.classList.toggle('space-flight-hud-expanded', !isCollapsed && isVisible);
  const toggle = document.getElementById('sfHudToggle');
  if (toggle) {
    toggle.textContent = isCollapsed ? '+' : '−';
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
    toggle.setAttribute('aria-label', isCollapsed ? 'Expand flight instruments' : 'Collapse flight instruments');
  }
  return isCollapsed;
}

export function prepareSpaceFlightHudForEntry() {
  const hud = document.getElementById('spaceFlightHUD');
  const mobile = globalThis.matchMedia?.('(max-width: 768px)').matches === true;
  return setSpaceFlightHudCollapsed(mobile || hud?.classList.contains('collapsed'));
}

function setupSpaceFlightControls(attemptLanding, lifecycleScope = null) {
  const listen = lifecycleScope?.listen?.bind(lifecycleScope) || ((target, eventName, listener, options) => {
    target.addEventListener(eventName, listener, options);
  });
  listen(document.getElementById('sfLandBtn'), 'click', attemptLanding);
  listen(document.getElementById('sfExpeditionBtn'), 'click', async () => {
    const runtime = await import('../expedition/runtime.js?v=24');
    runtime.openExpeditionPlanner(appCtx);
  });
  listen(document.getElementById('sfHudToggle'), 'click', () => {
    const hud = document.getElementById('spaceFlightHUD');
    setSpaceFlightHudCollapsed(!hud?.classList.contains('collapsed'));
  });
  listen(document.getElementById('sfAssistBtn'), 'click', () => {
    if (appCtx.spaceJourney?.phase === 'atmospheric_exploration') return;
    const universeTarget = appCtx.getUniverseHudTarget?.();
    const result = universeTarget
      ? appCtx.toggleUniverseCourseAssist?.()
      : appCtx.toggleRenderedJourneyAssist?.();
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
      const key = normalizedSpaceKey(e);
      appCtx.spaceFlight.keys[key] = true;
      if ([' ', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
      }
    }
  });

  listen(document, 'keyup', (e) => {
    if (appCtx.spaceFlight.active) {
      appCtx.spaceFlight.keys[normalizedSpaceKey(e)] = false;
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
  const flightRead = document.getElementById('sfFlightRead');
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
    const universeAssistActive = universeTarget?.course?.guidance === 'assisted';
    const copy = universeTarget
      ? universeAssistActive ? `Assisted approach to ${universeTarget.name}` : `Course set for ${universeTarget.name}`
      : appCtx.spaceFlight.presentationAuthority === 'classic'
      ? appCtx.spaceFlight.speed > 0 ? 'Manual flight' : 'Ready to fly'
      : phaseCopy[appCtx.spaceJourney?.phase] || 'Manual flight';
    flightStatus.textContent = copy;
  }
  if (flightRead) {
    const characterFlight = appCtx.spaceFlight.characterHandling || spacecraftOperationTuning(
      appCtx.resolveCharacterCapability?.('spacecraft', { vehicleAvailable: true, environment: 'SPACE_FLIGHT' })
    );
    const flightRate = Number(appCtx.spaceFlight.manualFlightRate) || 1;
    flightRead.textContent = universeTarget
      ? universeTarget.course?.guidance === 'assisted' ? 'Wayfinder guidance · assisted flight' : 'Wayfinder guidance · manual flight'
      : flightRate > 1
      ? `${characterFlight.guidanceLabel} · manual flight ×${flightRate}`
      : characterFlight.guidanceLabel;
  }
  if (assistBtn) {
    const assist = appCtx.spaceJourneyAssistState;
    const atmosphericClimb = appCtx.spaceJourney?.phase === 'atmospheric_exploration';
    const universeAssistAvailable = Boolean(
      universeTarget?.course?.status === 'active' && universeTarget.targetKind !== 'course-transit'
    );
    assistBtn.style.display = universeTarget || assist?.available !== false || atmosphericClimb ? '' : 'none';
    assistBtn.disabled = universeTarget
      ? !universeAssistAvailable
      : atmosphericClimb
      ? false
      : !assist?.available || !['launch', 'ascent', 'parking_orbit', 'transfer', 'return_transfer'].includes(appCtx.spaceJourney?.phase);
    assistBtn.style.opacity = assistBtn.disabled ? '0.55' : '1';
    assistBtn.textContent = universeTarget
      ? universeTarget.targetKind === 'course-transit'
        ? `ASSIST READY AFTER ARRIVAL`
        : universeTarget.course?.guidance === 'assisted'
          ? `RESUME MANUAL FLIGHT`
          : `ASSIST TO ${String(universeTarget.name).toUpperCase()}`
      : atmosphericClimb
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
    if (universeTarget?.targetKind === 'exoplanet') {
      environmentText.textContent = 'Deep-space orbital approach · appearance model labeled in Wayfinder';
    } else if (universeTarget) {
      environmentText.textContent = 'Deep-space navigation frame';
    } else if (!environment) {
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

  if (universeTarget?.targetKind === 'exoplanet') {
    const sceneToKm = universeTarget.physicalRadiusKm && universeTarget.radius > 0
      ? universeTarget.physicalRadiusKm / universeTarget.radius
      : null;
    const rangeKm = sceneToKm ? Math.max(0, activeDist - universeTarget.radius) * sceneToKm : null;
    const speedKmS = sceneToKm ? displaySpeed * sceneToKm : null;
    setMetric(
      'sfAltitudeLabel',
      'sfAltitude',
      'sfAltitudeUnit',
      'Approach range',
      rangeKm == null ? Math.floor(activeDist).toLocaleString() : Math.round(rangeKm).toLocaleString(),
      rangeKm == null ? 'display u' : 'km'
    );
    setMetric(
      'sfSpeedLabel',
      'sfSpeed',
      'sfSpeedUnit',
      'Relative speed',
      speedKmS == null ? displaySpeed.toFixed(1) : speedKmS.toFixed(1),
      speedKmS == null ? 'display u/s' : 'km/s'
    );
    setMetric(
      'sfDistanceLabel',
      'sfDistance',
      'sfDistanceUnit',
      'Center distance',
      sceneToKm == null ? Math.floor(activeDist).toLocaleString() : Math.round(activeDist * sceneToKm).toLocaleString(),
      sceneToKm == null ? 'display u' : 'km'
    );
    if (zoneLabel) zoneLabel.textContent = 'PLANET APPROACH';
  } else if (universeTarget?.navigation) {
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
    const physicalNavigation = appCtx.spaceFlight.presentationAuthority === 'si' && appCtx.spacecraftState && missionBody
      ? computeBodyRelativeNavigation(appCtx.spacecraftState, missionBody)
      : null;
    const physicalRadius = getAstronomicalBody(physicalBodyId)?.physical?.meanRadiusM / 1000;
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
    const supportedSurface = universeTarget.targetKind === 'exoplanet' && universeTarget.landable === true;
    const surveyDescentDistance = Math.max(18, universeTarget.radius * 3);
    const surveyCanLand = supportedSurface && activeDist < universeTarget.radius + surveyDescentDistance;
    const surveyProgress = supportedSurface ? Math.max(0, 1 - (activeDist - universeTarget.radius) / surveyDescentDistance) : 0;
    if (landingBar) landingBar.style.width = supportedSurface ? `${Math.round(surveyProgress * 100)}%` : '0%';
    if (landingText) {
      const dilation = universeTarget.encounter?.timeDilation;
      const generatedEncounter = universeTarget.encounter?.type === 'generated-asteroids'
        ? `Asteroid field · X pulse · ${universeTarget.encounter.active} remaining`
        : '';
      landingText.textContent = supportedSurface
        ? surveyCanLand ? 'Survey landing corridor ready' : `Approach ${universeTarget.name} to begin descent`
        : universeTarget.targetKind === 'exoplanet'
        ? `Course locked · orbital survey only`
        : Number.isFinite(dilation)
        ? `Relativistic clock rate: ${(dilation * 100).toFixed(1)}%`
        : generatedEncounter || `${formatAcceleration(universeTarget.navigation?.timeAcceleration)} · ${universeTarget.address}`;
    }
    if (landBtn) {
      landBtn.disabled = !surveyCanLand;
      landBtn.style.opacity = surveyCanLand ? '1' : '0.7';
      landBtn.style.background = surveyCanLand ? '#10b981' : '#315d9d';
      landBtn.textContent = supportedSurface
        ? surveyCanLand ? 'LAND ON ' + activeHudBody.name.toUpperCase() : 'APPROACH ' + activeHudBody.name.toUpperCase()
        : universeTarget.targetKind === 'exoplanet'
        ? 'ORBIT TARGET · ' + activeHudBody.name.toUpperCase()
        : 'EXPLORING ' + activeHudBody.name.toUpperCase();
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
  msg.className = 'spaceFlightMessage';
  msg.style.setProperty('--space-flight-message-color', color);
  msg.textContent = text;
  document.body.appendChild(msg);

  setTimeout(() => {
    msg.style.transition = 'opacity 0.5s';
    msg.style.opacity = '0';
    setTimeout(() => msg.remove(), 500);
  }, 1200);
}
