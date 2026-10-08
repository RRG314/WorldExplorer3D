import { ctx as appCtx } from "../shared-context.js?v=55";
import { getAstronomicalBody, normalizeAstronomicalBodyId, LANDING_MODE } from '../astronomy/body-catalog.js?v=3';
import { SPACE_CONSTANTS } from "./constants.js?v=3";
import { evaluateAtmosphericEntry } from './atmospheric-descent-authority.js?v=2';
import { spacecraftOperationTuning } from '../character/spacecraft-assistance.js?v=1';
import { SPACE_CRAFT_IDENTITY } from './craft-identity.js?v=1';

import { resolveFlightTarget, flightLandingReadout } from './navigation-presentation.js?v=1';

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
      <span aria-hidden="true">✦</span><strong id="sfFlightTitle">SPACE FLIGHT</strong>
      <button id="sfHudToggle" type="button" aria-expanded="true" aria-label="Collapse flight instruments">−</button>
    </div>
    <div id="sfFlightStatus" class="spaceFlightHudStatus">Preparing flight</div>
    <div id="sfPodPhase" class="spaceFlightPodPhase" hidden></div>
    <div class="spaceFlightHudBody">
    <div id="sfFlightRead" class="spaceFlightHudRead">Basic flight guidance</div>
    <div class="spaceFlightMetric"><span>Destination</span><b id="sfDestination">---</b></div>
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
    <button id="sfAssistBtn" class="spaceFlightAction primary" type="button">
      ENGAGE FLIGHT ASSIST
    </button>
    <button id="sfExpeditionBtn" class="spaceFlightAction" type="button">
      SHIP &amp; EXPEDITION
    </button>
    <button id="sfLandBtn" class="spaceFlightAction primary" type="button" disabled>
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
    const runtime = await import('../expedition/runtime.js?v=52');
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
      showFlightMessage(String(result?.reason || 'Flight assist is not available here').replaceAll('-', ' ').toUpperCase(), '#f59e0b');
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
  document.body.classList.add('space-flight-active');
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
  document.body.classList.remove('space-flight-active');
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
  const travelSession = appCtx.getSpaceTravelSession?.();
  const podActive = travelSession?.activeCraftId === SPACE_CRAFT_IDENTITY.pod.id;
  const starshipActive = travelSession?.activeCraftId === SPACE_CRAFT_IDENTITY.starship.id;
  const travelPhase = String(travelSession?.phase || '');
  const title = document.getElementById('sfFlightTitle');
  const phaseBadge = document.getElementById('sfPodPhase');
  if (title) title.textContent = podActive ? 'PATHFINDER POD' : starshipActive ? 'SOLIS REACH' : 'SPACE FLIGHT';
  if (phaseBadge) {
    phaseBadge.hidden = !travelPhase || travelPhase === 'free-flight';
    phaseBadge.textContent = travelPhase ? travelPhase.replaceAll('-', ' ').toUpperCase() : '';
  }
  const resolvedTarget = resolveFlightTarget(appCtx, findLandableBodyByName);
  const readout = flightLandingReadout(appCtx, resolvedTarget);
  const universeTarget = resolvedTarget.kind === 'universe' ? resolvedTarget.body : null;
  const expeditionDockTarget = resolvedTarget.kind === 'dock' ? resolvedTarget.body : null;
  const activeHudBody = resolvedTarget.body || { name: 'Destination unavailable', radius: 0, landable: false };
  const activeDist = readout.distance ?? Infinity;
  // Local proximity remains independent of the selected course (gravity/slow-zone owner).
  appCtx.spaceFlight._nearestBody = resolvedTarget.kind !== 'body' ? resolvedTarget.body
    : (appCtx.getAllSpaceBodies?.() || []).filter(body => body.position).reduce((nearest, body) =>
      !nearest || appCtx.spaceFlight.rocket.position.distanceTo(body.position) < appCtx.spaceFlight.rocket.position.distanceTo(nearest.position) ? body : nearest, null);
  document.getElementById('sfDestination').textContent = activeHudBody.name;
  const courseSelect = document.getElementById('spaceDestinationSelect');
  const selectedBodyId = resolvedTarget.kind === 'body' ? normalizeAstronomicalBodyId(activeHudBody.name) : '';
  if (courseSelect && [...courseSelect.options].some(option => option.value === selectedBodyId)) courseSelect.value = selectedBodyId;
  const altitude = readout.altitude ?? 0;
  const displaySpeed = appCtx.spaceFlight.velocity ? appCtx.spaceFlight.velocity.length() : appCtx.spaceFlight.speed;
  const zoneLabel = document.getElementById('sfZoneLabel');
  const flightStatus = document.getElementById('sfFlightStatus');
  const assistBtn = document.getElementById('sfAssistBtn');
  const flightRead = document.getElementById('sfFlightRead');
  const environmentText = document.getElementById('sfEnvironment');
  const destinationName = travelSession?.destination?.id || appCtx.spaceJourneyEphemeris?.destination?.bodyId || appCtx.spaceFlight.destination || 'destination';
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
      : travelSession?.guidance === 'assisted' && travelSession?.destination
      ? `Assisted flight to ${travelSession.destination.name}`
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
    const earthLanding = appCtx.spaceFlight.destination === 'earth'
      ? appCtx.getEarthLandingSelection?.()
      : null;
    const eastLabel = earthLanding ? `${Math.abs(Math.round(earthLanding.eastOffset))} m ${earthLanding.eastOffset < 0 ? 'west' : 'east'}` : '';
    const northLabel = earthLanding ? `${Math.abs(Math.round(earthLanding.northOffset))} m ${earthLanding.northOffset < 0 ? 'south' : 'north'}` : '';
    flightRead.textContent = earthLanding
      ? `Landing area · ${eastLabel} · ${northLabel} · steer around Earth to adjust`
      : universeTarget
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
      environmentText.textContent = 'Compressed survey approach · modeled world';
    } else if (universeTarget) {
      environmentText.textContent = 'Deep-space navigation frame';
    } else if (!readout.si || !environment) {
      environmentText.textContent = readout.si ? 'Physical flight · measured distances' : 'Compressed flight · game distances';
    } else if (environment.pressurePa > 0.5) {
      const pressure = environment.pressurePa >= 1000
        ? `${(environment.pressurePa / 1000).toFixed(1)} kPa`
        : `${Math.round(environment.pressurePa)} Pa`;
      environmentText.textContent = `${environment.bodyId[0].toUpperCase()}${environment.bodyId.slice(1)} atmosphere · ${pressure} · ${Math.round(environment.temperatureK - 273.15)}°C`;
    } else {
      environmentText.textContent = `${environment.bodyId[0].toUpperCase()}${environment.bodyId.slice(1)} vacuum · ${environment.gravityMagnitudeMps2.toFixed(2)} m/s²`;
    }
  }

  if (expeditionDockTarget?.position) {
    const approachRange = Math.max(0, activeDist - Number(expeditionDockTarget.radius || 0));
    const relativeSpeed = Number(expeditionDockTarget.relativeSpeed || 0);
    setMetric('sfAltitudeLabel', 'sfAltitude', 'sfAltitudeUnit', 'Approach range', Math.round(approachRange).toLocaleString(), 'display u');
    setMetric('sfSpeedLabel', 'sfSpeed', 'sfSpeedUnit', 'Relative speed', relativeSpeed.toFixed(1), 'display u/s');
    setMetric('sfDistanceLabel', 'sfDistance', 'sfDistanceUnit', 'Separation', Math.round(activeDist).toLocaleString(), 'display u');
    if (zoneLabel) zoneLabel.textContent = 'DOCKING APPROACH';
  } else if (universeTarget?.targetKind === 'exoplanet') {
    setMetric('sfAltitudeLabel', 'sfAltitude', 'sfAltitudeUnit', 'Approach range', Math.round(altitude).toLocaleString(), 'display u');
    setMetric('sfSpeedLabel', 'sfSpeed', 'sfSpeedUnit', 'Velocity', displaySpeed.toFixed(1), 'display u/s');
    setMetric('sfDistanceLabel', 'sfDistance', 'sfDistanceUnit', 'Center distance', Math.round(activeDist).toLocaleString(), 'display u');
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
    const physicalNavigation = readout.navigation;
    setMetric('sfAltitudeLabel', 'sfAltitude', 'sfAltitudeUnit', physicalNavigation ? 'Altitude' : 'Approach range',
      physicalNavigation ? (physicalNavigation.altitudeM / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) : Math.round(altitude).toLocaleString(),
      physicalNavigation ? 'km' : 'display u');
    setMetric('sfSpeedLabel', 'sfSpeed', 'sfSpeedUnit', 'Relative speed',
      physicalNavigation ? Math.round(physicalNavigation.relativeSpeedMps).toLocaleString() : displaySpeed.toFixed(1),
      physicalNavigation ? 'm/s' : 'display u/s');
    setMetric('sfDistanceLabel', 'sfDistance', 'sfDistanceUnit', 'Center distance',
      physicalNavigation ? Math.round(physicalNavigation.centerDistanceM / 1000).toLocaleString() : Math.round(activeDist).toLocaleString(),
      physicalNavigation ? 'km' : 'display u');
    if (readout.si && !physicalNavigation) {
      for (const [label, value, unit, title] of [['sfAltitudeLabel','sfAltitude','sfAltitudeUnit','Altitude'], ['sfSpeedLabel','sfSpeed','sfSpeedUnit','Relative speed'], ['sfDistanceLabel','sfDistance','sfDistanceUnit','Center distance']]) setMetric(label, value, unit, title, '—', '');
    }
    if (zoneLabel) zoneLabel.textContent = 'LANDING ZONE';
  }

  const landingProgress = Math.max(0, Math.min(1, 1 - (readout.si ? (readout.navigation?.altitudeM ?? Infinity) / 25000 : altitude / SPACE_CONSTANTS.LANDING_DISTANCE)));
  const landingBar = document.getElementById('sfLandingBar');
  const landingText = document.getElementById('sfLandingText');
  const landBtn = document.getElementById('sfLandBtn');

  if (landingBar) {
    landingBar.style.transition = landingProgress === 0 ? 'none' : 'width 0.3s';
    landingBar.style.width = landingProgress * 100 + '%';
  }

  const physicalLanding = readout.physical;
  const targetBody = getAstronomicalBody(String(activeHudBody.name || '').toLowerCase());
  const atmosphericTarget = targetBody?.exploration?.landingMode === LANDING_MODE.ATMOSPHERIC_DESCENT;
  const atmosphericExploration = readout.si && appCtx.spaceJourney?.phase === 'atmospheric_exploration'
    ? appCtx.spaceAtmosphereExploration
    : null;
  const atmosphericEntry = atmosphericTarget && physicalLanding?.navigation
    ? evaluateAtmosphericEntry(targetBody.id, physicalLanding.navigation)
    : null;
  const canLand = readout.eligible;

  if (expeditionDockTarget) {
    const starshipName = String(expeditionDockTarget.name || 'starship');
    const dockingRange = expeditionDockTarget.radius + 24;
    const canDock = expeditionDockTarget.canDock === true;
    const inDockingRange = activeDist < dockingRange;
    const dockingProgress = Math.max(0, 1 - Math.max(0, activeDist - expeditionDockTarget.radius) / 220);
    if (zoneLabel) zoneLabel.textContent = 'DOCKING APPROACH';
    if (landingBar) landingBar.style.width = `${Math.round(dockingProgress * 100)}%`;
    if (landingText) landingText.textContent = canDock
      ? 'Docking corridor acquired · match speed and dock'
      : inDockingRange
      ? `Reduce relative speed to dock · ${Number(expeditionDockTarget.relativeSpeed || 0).toFixed(1)} display units/s`
      : `Manual approach to ${starshipName} · ${Math.max(0, Math.round(activeDist - expeditionDockTarget.radius))} display units`;
    if (landBtn) {
      landBtn.disabled = !canDock;
      landBtn.style.opacity = canDock ? '1' : '0.7';
      landBtn.style.background = canDock ? '#10b981' : '#315d9d';
      landBtn.textContent = canDock
        ? `DOCK WITH ${starshipName.toUpperCase()}`
        : `APPROACH ${starshipName.toUpperCase()}`;
    }
  } else if (universeTarget) {
    const supportedSurface = universeTarget.targetKind === 'exoplanet' && universeTarget.landable === true;
    const surveyDescentDistance = Math.max(18, universeTarget.radius * 3);
    const surveyCanLand = readout.eligible;
    const surveyProgress = supportedSurface ? Math.max(0, 1 - (activeDist - universeTarget.radius) / surveyDescentDistance) : 0;
    if (landingBar) landingBar.style.width = supportedSurface ? `${Math.round(surveyProgress * 100)}%` : '0%';
    if (landingText) {
      const dilation = universeTarget.encounter?.timeDilation;
      const generatedEncounter = universeTarget.encounter?.type === 'generated-asteroids'
        ? `Asteroid field · X pulse · ${universeTarget.encounter.active} remaining`
        : '';
      landingText.textContent = supportedSurface
        ? surveyCanLand ? 'Compressed approach complete · begin survey descent' : `Approach ${universeTarget.name} to begin descent`
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
      const horizontalSpeed = Math.round(Number(atmosphericExploration.horizontalSpeedMps) || 0);
      landingText.textContent = depthLimit
        ? `Safe depth limit reached · ${horizontalSpeed.toLocaleString()} m/s across the cloud deck · no solid surface`
        : `Space accelerates · arrows steer · hold Climb to rise · ${horizontalSpeed.toLocaleString()} m/s across the cloud deck`;
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
    if (landingText) landingText.textContent = readout.si ? 'Landing corridor ready · begin guided descent' : 'Compressed approach complete · begin guided descent';
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
      landingText.textContent = readout.si ? readout.reason
        : !activeHudBody.landable ? `${activeHudBody.name} · orbital exploration only`
        : `Approach ${activeHudBody.name} · ${Math.round(altitude).toLocaleString()} display units`;

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
