import {
  getAstronomicalBody,
  SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS
} from '../astronomy/body-catalog.js?v=3';

function setInfoMetricBlock(metaLabel, metric1Label, metric1Value, metric2Label, metric2Value, metric3Label, metric3Value) {
  const metaEl = document.getElementById('ssInfoMetaLabel');
  const metric1LabelEl = document.getElementById('ssInfoMetric1Label');
  const metric2LabelEl = document.getElementById('ssInfoMetric2Label');
  const metric3LabelEl = document.getElementById('ssInfoMetric3Label');
  const metric1ValueEl = document.getElementById('ssInfoDistAU');
  const metric2ValueEl = document.getElementById('ssInfoDistKM');
  const metric3ValueEl = document.getElementById('ssInfoDistEarth');

  if (metaEl) metaEl.textContent = metaLabel;
  if (metric1LabelEl) metric1LabelEl.textContent = metric1Label;
  if (metric2LabelEl) metric2LabelEl.textContent = metric2Label;
  if (metric3LabelEl) metric3LabelEl.textContent = metric3Label;
  if (metric1ValueEl) metric1ValueEl.textContent = metric1Value;
  if (metric2ValueEl) metric2ValueEl.textContent = metric2Value;
  if (metric3ValueEl) metric3ValueEl.textContent = metric3Value;
}

function formatKM(km) {
  if (km >= 1e9) return (km / 1e9).toFixed(1) + 'B';
  if (km >= 1e6) return (km / 1e6).toFixed(1) + 'M';
  if (km >= 1e3) return (km / 1e3).toFixed(0) + 'K';
  return Math.round(km).toString();
}

function formatLightYears(ly) {
  if (ly >= 1e9) return (ly / 1e9).toFixed(2) + ' billion';
  if (ly >= 1e6) return (ly / 1e6).toFixed(2) + ' million';
  if (ly >= 1e3) return (ly / 1e3).toFixed(1) + ' thousand';
  return Math.round(ly).toString();
}

function hidePlanetInfo(ctx) {
  if (ctx.solarSystem.infoPanel) {
    ctx.solarSystem.infoPanel.style.display = 'none';
  }
  document.body?.classList.remove('space-destination-details-open');
  ctx.solarSystem.selectedPlanet = null;
  ctx.solarSystem.selectedBodyId = null;
}

function openPlanetInfo(ctx) {
  ctx.solarSystem.infoPanel.style.display = 'block';
  document.body?.classList.add('space-destination-details-open');
}

function configureSetCourse(ctx, bodyId, label) {
  const setCourse = document.getElementById('ssInfoSetCourse');
  if (!setCourse) return;
  const selectable = SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS.includes(bodyId);
  const journey = ctx.appCtx.spaceJourney;
  const currentDestination = journey?.destinationBodyId;
  const canRetarget = selectable && bodyId !== 'earth' && (
    !ctx.appCtx.spacecraftState ||
    !['descent', 'home_descent', 'surface', 'complete'].includes(journey?.phase) ||
    currentDestination === bodyId
  );
  const alreadySet = currentDestination === bodyId;
  setCourse.style.display = selectable && bodyId !== 'earth' ? 'block' : 'none';
  setCourse.disabled = !canRetarget;
  setCourse.style.opacity = canRetarget ? '1' : '0.55';
  setCourse.textContent = alreadySet
    ? `COURSE SET · ${label.toUpperCase()}`
    : canRetarget
      ? `SET COURSE TO ${label.toUpperCase()}`
      : 'FINISH CURRENT APPROACH FIRST';
  ctx.solarSystem.selectedBodyId = selectable ? bodyId : null;
}

function showPlanetInfo(ctx, entry) {
  const planet = entry.planet;
  const now = new Date();
  const earthPos = ctx.getEarthHelioPos(now);
  const distEarth = ctx.distanceAU(entry.realPosition, earthPos);
  const distEarthKM = distEarth * 149597870.7;

  document.getElementById('ssInfoTitle').textContent = planet.name;
  document.getElementById('ssInfoType').textContent = planet.type;
  document.getElementById('ssInfoDesc').textContent = planet.description;
  setInfoMetricBlock(
    'ORBITAL DATA',
    'Mean Distance',
    planet.meanDistanceAU.toFixed(3) + ' AU',
    'Mean Distance',
    formatKM(planet.meanDistanceKM) + ' km',
    'Current from Earth',
    distEarth.toFixed(3) + ' AU (' + formatKM(distEarthKM) + ' km)'
  );

  openPlanetInfo(ctx);
  ctx.solarSystem.selectedPlanet = entry;
  configureSetCourse(ctx, planet.bodyId, planet.name);

  ctx.solarSystem.planetMeshes.forEach((planetEntry) => {
    if (!planetEntry.mesh.children) return;
    planetEntry.mesh.children.forEach((child) => {
      if (child.name && child.name.endsWith('_label') && child.material) {
        child.material.opacity = planetEntry === entry ? 1.0 : 0.7;
      }
    });
  });
}

function showSunInfo(ctx) {
  document.getElementById('ssInfoTitle').textContent = 'Sun';
  document.getElementById('ssInfoType').textContent = 'G-type Main Sequence Star';
  document.getElementById('ssInfoDesc').textContent =
    'Our star. Contains 99.86% of the solar system\'s mass. Surface temperature ~5,500°C.';

  const now = new Date();
  const earthPos = ctx.getEarthHelioPos(now);
  const distSun = Math.sqrt(earthPos.x * earthPos.x + earthPos.y * earthPos.y + earthPos.z * earthPos.z);
  const distSunKM = distSun * 149597870.7;
  setInfoMetricBlock(
    'STELLAR DATA',
    'Position',
    '0 AU (center)',
    'Reference Distance',
    '0 km',
    'Current from Earth',
    distSun.toFixed(3) + ' AU (' + formatKM(distSunKM) + ' km)'
  );

  openPlanetInfo(ctx);
  ctx.solarSystem.selectedPlanet = null;
  configureSetCourse(ctx, null, '');
}

function showAsteroidInfo(ctx, entry) {
  const asteroid = entry.asteroid;
  const now = new Date();
  const earthPos = ctx.getEarthHelioPos(now);
  const distEarth = ctx.distanceAU(entry.realPosition, earthPos);
  const distEarthKM = distEarth * 149597870.7;

  document.getElementById('ssInfoTitle').textContent = asteroid.name;
  document.getElementById('ssInfoType').textContent = asteroid.type + ' (' + (asteroid.region || 'Asteroid Belt') + ')';
  document.getElementById('ssInfoDesc').textContent = asteroid.description;
  setInfoMetricBlock(
    'BELT OBJECT DATA',
    'Mean Distance',
    asteroid.meanDistanceAU.toFixed(3) + ' AU',
    'Mean Distance',
    formatKM(asteroid.meanDistanceKM) + ' km',
    'Current from Earth',
    distEarth.toFixed(3) + ' AU (' + formatKM(distEarthKM) + ' km)'
  );

  openPlanetInfo(ctx);
  ctx.solarSystem.selectedPlanet = entry;
  const bodyId = getAstronomicalBody(asteroid.name)?.id || null;
  configureSetCourse(ctx, bodyId, asteroid.name);
}

function showMoonInfo(ctx, entry) {
  const body = getAstronomicalBody(entry.name);
  if (!body) return;
  const parent = getAstronomicalBody(body.parentId);
  document.getElementById('ssInfoTitle').textContent = body.name;
  document.getElementById('ssInfoType').textContent = `Natural satellite of ${parent?.name || 'its planet'}`;
  document.getElementById('ssInfoDesc').textContent = body.exploration.experienceTier === 'featured'
    ? `${body.presentation.surfaceLabel}. A featured solid-world destination with body-specific environment and fieldwork.`
    : `${body.presentation.surfaceLabel}. Cataloged for a later regional-quality surface pack.`;
  setInfoMetricBlock(
    'PHYSICAL DATA',
    'Mean radius',
    `${formatKM(body.physical.meanRadiusM / 1000)} km`,
    'Surface gravity',
    `${body.physical.surfaceGravityMps2.toFixed(3)} m/s²`,
    'Orbital period',
    `${Math.abs(body.physical.orbitalPeriodS / 86400).toFixed(2)} days`
  );
  openPlanetInfo(ctx);
  ctx.solarSystem.selectedPlanet = null;
  configureSetCourse(ctx, body.id, body.name);
}

function showSpacecraftInfo(ctx, entry) {
  const craft = entry.spacecraft;
  document.getElementById('ssInfoTitle').textContent = craft.name;
  document.getElementById('ssInfoType').textContent = craft.type;
  document.getElementById('ssInfoDesc').textContent = craft.description;

  let distAUText;
  if (craft.orbit === 'heliocentric') distAUText = craft.realDistanceAU + ' AU (actual)';
  else if (craft.orbit === 'L2') distAUText = 'Sun-Earth L2 Point';
  else distAUText = craft.realDistanceKM + ' km altitude';

  let sceneDistText = '---';
  if (ctx.appCtx.spaceFlight.rocket) {
    const dist = Math.floor(ctx.appCtx.spaceFlight.rocket.position.distanceTo(entry.mesh.position));
    sceneDistText = dist + ' (scene distance)';
  }

  setInfoMetricBlock(
    'MISSION DATA',
    'Reference Distance',
    distAUText,
    'From Earth',
    formatKM(craft.realDistanceKM) + ' km',
    'Current from Rocket',
    sceneDistText
  );

  openPlanetInfo(ctx);
  ctx.solarSystem.selectedPlanet = null;
  configureSetCourse(ctx, null, '');
}

function showGalaxyInfo(ctx, entry) {
  const galaxy = entry.galaxy;
  document.getElementById('ssInfoTitle').textContent = galaxy.name;
  document.getElementById('ssInfoType').textContent = galaxy.type + ' • ' + galaxy.constellation;
  document.getElementById('ssInfoDesc').textContent = galaxy.description;

  let sceneDistText = '---';
  if (ctx.appCtx.spaceFlight.rocket) {
    const dist = Math.floor(ctx.appCtx.spaceFlight.rocket.position.distanceTo(entry.mesh.position));
    sceneDistText = dist + ' (scene distance)';
  }

  setInfoMetricBlock(
    'DEEP SKY DATA',
    'Sky Position',
    'RA ' + galaxy.raText + ' | Dec ' + galaxy.decText,
    'Distance',
    formatLightYears(galaxy.distanceLy) + ' ly',
    'Current from Rocket',
    sceneDistText
  );

  openPlanetInfo(ctx);
  ctx.solarSystem.selectedPlanet = null;
  configureSetCourse(ctx, null, '');
}

function handleSpaceReturnAction(ctx) {
  if (typeof ctx.appCtx.onMoon !== 'undefined' && ctx.appCtx.onMoon) {
    if (typeof ctx.appCtx.returnToEarth === 'function') ctx.appCtx.returnToEarth();
    return;
  }

  if (ctx.appCtx.spaceFlight && ctx.appCtx.spaceFlight.active) {
    if (ctx.appCtx.universeRuntime?.current?.id && ctx.appCtx.universeRuntime.current.id !== 'sol') {
      ctx.appCtx.returnToEarthFromUniverse?.();
      return;
    }
    if (
      ctx.appCtx.spaceJourney?.phase === 'atmospheric_exploration' &&
      typeof ctx.appCtx.requestRenderedAtmosphericDeparture === 'function'
    ) {
      const departure = ctx.appCtx.requestRenderedAtmosphericDeparture();
      if (departure?.accepted) return;
    }
    const course = ctx.appCtx.setSolarSystemCourse?.('earth');
    ctx.appCtx.showSpaceFlightMessage?.(
      course?.accepted ? 'EARTH COURSE SET · USE FLIGHT ASSIST OR FLY MANUALLY' : String(course?.reason || 'Earth course unavailable').replaceAll('-', ' ').toUpperCase(),
      course?.accepted ? '#6fe8ff' : '#f59e0b'
    );
    return;
  }

  if (typeof ctx.appCtx.returnToEarth === 'function') ctx.appCtx.returnToEarth();
}

function handleMoonLandingAction(ctx) {
  if (ctx.appCtx.spaceFlight && ctx.appCtx.spaceFlight.active) {
    const course = ctx.appCtx.setSolarSystemCourse?.('moon');
    ctx.appCtx.showSpaceFlightMessage?.(
      course?.accepted ? 'MOON COURSE SET · USE FLIGHT ASSIST OR FLY MANUALLY' : String(course?.reason || 'Moon course unavailable').replaceAll('-', ' ').toUpperCase(),
      course?.accepted ? '#6fe8ff' : '#f59e0b'
    );
    return;
  }

  if (
    typeof ctx.appCtx.directTravelToMoon === 'function' &&
    !(typeof ctx.appCtx.travelingToMoon !== 'undefined' && ctx.appCtx.travelingToMoon)
  ) {
    ctx.appCtx.directTravelToMoon();
  }
}

function handleMarsLandingAction(ctx) {
  if (ctx.appCtx.onMars) return;
  if (ctx.appCtx.spaceFlight?.active) {
    const course = ctx.appCtx.setSolarSystemCourse?.('mars');
    ctx.appCtx.showSpaceFlightMessage?.(
      course?.accepted ? 'MARS COURSE SET · USE FLIGHT ASSIST OR FLY MANUALLY' : String(course?.reason || 'Mars course unavailable').replaceAll('-', ' ').toUpperCase(),
      course?.accepted ? '#6fe8ff' : '#f59e0b'
    );
    return;
  }
  ctx.appCtx.startSpaceFlightToMars?.();
}

export {
  handleMarsLandingAction,
  handleMoonLandingAction,
  handleSpaceReturnAction,
  hidePlanetInfo,
  showAsteroidInfo,
  showGalaxyInfo,
  showMoonInfo,
  showPlanetInfo,
  showSpacecraftInfo,
  showSunInfo
};
