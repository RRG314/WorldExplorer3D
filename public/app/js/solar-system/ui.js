import {
  handleMarsLandingAction,
  handleMoonLandingAction,
  handleSpaceReturnAction,
  hidePlanetInfo,
  showAsteroidInfo,
  showGalaxyInfo,
  showPlanetInfo,
  showSpacecraftInfo,
  showSunInfo
} from "./info-panel.js?v=2";

export function onSolarSystemClick(ctx, event) {
  if (!ctx.appCtx.spaceFlight.active || !ctx.solarSystem.visible || !ctx.solarSystem.group) return;

  ctx.solarSystem.mouse.x = event.clientX / window.innerWidth * 2 - 1;
  ctx.solarSystem.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  ctx.solarSystem.raycaster.setFromCamera(ctx.solarSystem.mouse, ctx.appCtx.spaceFlight.camera);

  const clickables = [];
  ctx.solarSystem.planetMeshes.forEach((entry) => {
    clickables.push(entry.mesh, entry.hitbox);
  });
  ctx.solarSystem.asteroidMeshes.forEach((entry) => {
    clickables.push(entry.mesh, entry.hitbox);
  });
  ctx.solarSystem.spacecraftMeshes.forEach((entry) => {
    clickables.push(entry.mesh, entry.hitbox);
  });
  ctx.solarSystem.galaxyMeshes.forEach((entry) => {
    clickables.push(entry.mesh, entry.hitbox);
  });
  const celestialCatalog = ctx.appCtx.spaceFlight?.celestialCatalog;
  celestialCatalog?.starEntries?.forEach((entry) => clickables.push(entry.mesh, entry.hitbox));
  celestialCatalog?.constellationEntries?.forEach((entry) => clickables.push(entry.line));
  clickables.push(ctx.solarSystem.sunMesh);

  ctx.solarSystem.raycaster.params.Line.threshold = 1400;
  const intersects = ctx.solarSystem.raycaster.intersectObjects(clickables, true);
  if (intersects.length === 0) {
    hidePlanetInfo(ctx);
    return;
  }

  const hit = intersects[0].object;
  let target = hit;
  while (
    target &&
    !target.userData.isPlanet &&
    !target.userData.isAsteroid &&
    !target.userData.isSpacecraft &&
    !target.userData.isGalaxy &&
    !target.userData.isCatalogStar &&
    !target.userData.isSpaceConstellation &&
    target.parent
  ) {
    target = target.parent;
  }

  if (target && target.userData.isPlanet) {
    const idx = target.userData.planetIndex;
    const entry = ctx.solarSystem.planetMeshes.find((item) => item.planet === ctx.SOLAR_SYSTEM_PLANETS[idx]);
    if (entry) showPlanetInfo(ctx, entry);
  } else if (target && target.userData.isAsteroid) {
    const idx = target.userData.asteroidIndex;
    const entry = ctx.solarSystem.asteroidMeshes.find((item) => item.asteroid === ctx.NAMED_ASTEROIDS[idx]);
    if (entry) showAsteroidInfo(ctx, entry);
  } else if (target && target.userData.isSpacecraft) {
    const idx = target.userData.spacecraftIndex;
    const entry = ctx.solarSystem.spacecraftMeshes.find((item) => item.spacecraft === ctx.SPACECRAFT[idx]);
    if (entry) showSpacecraftInfo(ctx, entry);
  } else if (target && target.userData.isGalaxy) {
    const idx = target.userData.galaxyIndex;
    const entry = ctx.solarSystem.galaxyMeshes.find((item) => item.galaxy === ctx.GALAXIES[idx]);
    if (entry) showGalaxyInfo(ctx, entry);
  } else if (target && target.userData.isCatalogStar) {
    const star = target.userData.star;
    if (star) {
      ctx.appCtx.showStarInfo?.(star);
      ctx.appCtx.highlightSpaceConstellation?.(star.constellation);
    }
  } else if (target && target.userData.isSpaceConstellation) {
    ctx.appCtx.showSpaceConstellationInfo?.(target.userData.constellationName);
  } else if (hit === ctx.solarSystem.sunMesh || hit.parent === ctx.solarSystem.sunMesh) {
    showSunInfo(ctx);
  }
}

export function createInfoPanel(ctx) {
  const panel = document.createElement('div');
  panel.id = 'solarSystemInfo';
  panel.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(10, 10, 30, 0.95);
    border: 2px solid #667eea;
    border-radius: 12px;
    padding: 20px;
    color: #fff;
    font-family: Orbitron, sans-serif;
    font-size: 12px;
    z-index: 10001;
    display: none;
    min-width: 280px;
    max-width: 320px;
    line-height: 1.6;
    box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
  `;
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div id="ssInfoTitle" style="font-size:18px;color:#667eea;font-weight:700;"></div>
      <button id="ssInfoClose" style="background:none;border:none;color:#667eea;font-size:20px;cursor:pointer;padding:0 4px;">x</button>
    </div>
    <div id="ssInfoType" style="margin-bottom:8px;color:#10b981;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:1px;"></div>
    <div id="ssInfoDesc" style="margin-bottom:12px;color:#94a3b8;font-family:Inter,sans-serif;font-size:12px;"></div>
    <div style="background:rgba(102,126,234,0.15);border-radius:8px;padding:12px;margin-bottom:0;">
      <div id="ssInfoMetaLabel" style="font-size:10px;opacity:0.7;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">ORBITAL DATA</div>
      <div style="margin-bottom:6px;"><span id="ssInfoMetric1Label">Mean Distance</span>: <span id="ssInfoDistAU" style="color:#fbbf24;font-weight:600;"></span></div>
      <div style="margin-bottom:6px;"><span id="ssInfoMetric2Label">Mean Distance</span>: <span id="ssInfoDistKM" style="color:#fbbf24;font-weight:600;"></span></div>
      <div><span id="ssInfoMetric3Label">Current from Earth</span>: <span id="ssInfoDistEarth" style="color:#0fc;font-weight:600;"></span></div>
    </div>
  `;
  document.body.appendChild(panel);
  ctx.solarSystem.infoPanel = panel;
  document.getElementById('ssInfoClose').addEventListener('click', () => hidePlanetInfo(ctx));
}

export function createToggleButton(ctx) {
  const container = document.createElement('div');
  container.id = 'ssToggleContainer';
  container.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    display: none;
    flex-direction: column;
    gap: 6px;
    z-index: 10001;
  `;

  const btn = document.createElement('button');
  btn.id = 'solarSystemToggle';
  btn.className = 'ssToggleBtn';
  btn.style.cssText = `
    background: rgba(10, 10, 30, 0.9);
    border: 2px solid #3b82f6;
    border-radius: 8px;
    padding: 8px 14px;
    color: #fff;
    font-family: Orbitron, sans-serif;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  `;
  btn.textContent = 'RETURN TO EARTH';
  btn.addEventListener('click', () => handleSpaceReturnAction(ctx));
  container.appendChild(btn);

  const orbitBtn = document.createElement('button');
  orbitBtn.id = 'orbitsToggle';
  orbitBtn.className = 'ssToggleBtn';
  orbitBtn.style.cssText = `
    background: rgba(10, 10, 30, 0.9);
    border: 2px solid #10b981;
    border-radius: 8px;
    padding: 8px 14px;
    color: #fff;
    font-family: Orbitron, sans-serif;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  `;
  orbitBtn.textContent = 'LAND ON MOON';
  orbitBtn.addEventListener('click', () => handleMoonLandingAction(ctx));
  container.appendChild(orbitBtn);

  const marsBtn = document.createElement('button');
  marsBtn.id = 'marsLandingToggle';
  marsBtn.className = 'ssToggleBtn';
  marsBtn.style.cssText = orbitBtn.style.cssText.replace('#10b981', '#d97745');
  marsBtn.textContent = 'LAND ON MARS';
  marsBtn.addEventListener('click', () => handleMarsLandingAction(ctx));
  container.appendChild(marsBtn);

  document.body.appendChild(container);
}

export function toggleSolarSystem(ctx) {
  handleSpaceReturnAction(ctx);
}

export function toggleOrbits(ctx) {
  handleMoonLandingAction(ctx);
}

export function showSolarSystemUI(ctx) {
  const container = document.getElementById('ssToggleContainer');
  if (container) container.style.display = 'flex';
  const returnBtn = document.getElementById('solarSystemToggle');
  const landMoonBtn = document.getElementById('orbitsToggle');
  const landMarsBtn = document.getElementById('marsLandingToggle');
  if (returnBtn) returnBtn.textContent = 'RETURN TO EARTH';
  if (landMoonBtn) landMoonBtn.textContent = 'LAND ON MOON';
  if (landMarsBtn) landMarsBtn.textContent = 'LAND ON MARS';
  ctx?.appCtx?.showUniverseUI?.();
}

export function hideSolarSystemUI(ctx) {
  const container = document.getElementById('ssToggleContainer');
  if (container) container.style.display = 'none';
  ctx?.appCtx?.hideUniverseUI?.();
  hidePlanetInfo(ctx);
}

export function updateSolarSystem(ctx) {
  if (!ctx.solarSystem.group || !ctx.solarSystem.visible) return;

  if (!ctx.solarSystem._loggedActive) {
    console.log('[SolarSystem] Active - rendering', ctx.solarSystem.planetMeshes.length, 'planets');
    ctx.solarSystem._loggedActive = true;
  }

  if (!ctx.solarSystem._frameCount) ctx.solarSystem._frameCount = 0;
  ctx.solarSystem._frameCount++;
  if (ctx.solarSystem._frameCount % 60 === 0) {
    ctx.updateSolarSystemPositions(new Date());
  }

  ctx.updateMoonPositions(new Date());
  ctx.updateSpacecraftPositions();

  ctx.solarSystem.planetMeshes.forEach((entry) => {
    entry.mesh.rotation.y += 0.002;
  });
  ctx.solarSystem.asteroidMeshes.forEach((entry) => {
    entry.mesh.rotation.y += 0.005;
    entry.mesh.rotation.x += 0.003;
  });
  if (ctx.solarSystem.sunMesh) {
    ctx.solarSystem.sunMesh.rotation.y += 0.001;
  }

  if (ctx.solarSystem.orbitsVisible) {
    const pulseT = Date.now() * 0.003;
    ctx.solarSystem.orbitMarkers.forEach((entry) => {
      const pulse = entry.mesh.getObjectByName('pulse');
      if (pulse) {
        const scale = 1.0 + Math.sin(pulseT) * 0.4;
        pulse.scale.setScalar(scale);
        pulse.material.opacity = 0.15 + Math.sin(pulseT) * 0.1;
      }
    });
  }

  updateProximityHUD(ctx);

  if (ctx.solarSystem.selectedPlanet && ctx.solarSystem.infoPanel.style.display !== 'none') {
    const now = new Date();
    const ep = ctx.getEarthHelioPos(now);
    const dist = ctx.distanceAU(ctx.solarSystem.selectedPlanet.realPosition, ep);
    const distKM = dist * 149597870.7;
    const el = document.getElementById('ssInfoDistEarth');
    if (el) {
      el.textContent = dist.toFixed(3) + ' AU (' + formatKM(distKM) + ' km)';
    }
  }
}

export function updateProximityHUD(ctx) {
  if (!ctx.appCtx.spaceFlight.rocket) return;

  const rocketWorldPos = ctx.appCtx.spaceFlight.rocket.position;
  let closestDist = Infinity;
  let closestName = '';

  ctx.solarSystem.planetMeshes.forEach((entry) => {
    const worldX = ctx.solarSystem.group.position.x + entry.mesh.position.x;
    const worldY = ctx.solarSystem.group.position.y + entry.mesh.position.y;
    const worldZ = ctx.solarSystem.group.position.z + entry.mesh.position.z;
    const dx = rocketWorldPos.x - worldX;
    const dy = rocketWorldPos.y - worldY;
    const dz = rocketWorldPos.z - worldZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < closestDist) {
      closestDist = dist;
      closestName = entry.planet.name;
    }
  });

  ctx.solarSystem.moonMeshes.forEach((entry) => {
    const worldPos = new THREE.Vector3();
    entry.mesh.getWorldPosition(worldPos);
    const dist = rocketWorldPos.distanceTo(worldPos);
    if (dist < closestDist) {
      closestDist = dist;
      closestName = entry.name;
    }
  });

  ctx.solarSystem.asteroidMeshes.forEach((entry) => {
    const worldX = ctx.solarSystem.group.position.x + entry.mesh.position.x;
    const worldY = ctx.solarSystem.group.position.y + entry.mesh.position.y;
    const worldZ = ctx.solarSystem.group.position.z + entry.mesh.position.z;
    const dx = rocketWorldPos.x - worldX;
    const dy = rocketWorldPos.y - worldY;
    const dz = rocketWorldPos.z - worldZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < closestDist) {
      closestDist = dist;
      closestName = entry.asteroid.name;
    }
  });

  ctx.solarSystem.spacecraftMeshes.forEach((entry) => {
    const dist = rocketWorldPos.distanceTo(entry.mesh.position);
    if (dist < closestDist) {
      closestDist = dist;
      closestName = entry.spacecraft.name;
    }
  });

  const rocketDistFromSun = Math.sqrt(
    (rocketWorldPos.x - ctx.solarSystem.group.position.x) ** 2 +
    (rocketWorldPos.z - ctx.solarSystem.group.position.z) ** 2
  );
  const beltInnerScene = ctx.ASTEROID_BELT.innerAU * ctx.AU_TO_SCENE;
  const beltOuterScene = ctx.ASTEROID_BELT.outerAU * ctx.AU_TO_SCENE;
  const inBelt = rocketDistFromSun > beltInnerScene * 0.9 && rocketDistFromSun < beltOuterScene * 1.1;

  const kuiperInnerScene = ctx.KUIPER_BELT.innerAU * ctx.AU_TO_SCENE;
  const kuiperOuterScene = ctx.KUIPER_BELT.outerAU * ctx.AU_TO_SCENE;
  const inKuiperBelt =
    rocketDistFromSun > kuiperInnerScene * 0.95 &&
    rocketDistFromSun < kuiperOuterScene * 1.05;

  if (ctx.solarSystem.sunMesh) {
    const worldX = ctx.solarSystem.group.position.x + ctx.solarSystem.sunMesh.position.x;
    const worldY = ctx.solarSystem.group.position.y + ctx.solarSystem.sunMesh.position.y;
    const worldZ = ctx.solarSystem.group.position.z + ctx.solarSystem.sunMesh.position.z;
    const dx = rocketWorldPos.x - worldX;
    const dy = rocketWorldPos.y - worldY;
    const dz = rocketWorldPos.z - worldZ;
    const sunDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (sunDist < closestDist) {
      closestDist = sunDist;
      closestName = 'Sun';
    }
  }

  if (ctx.appCtx.spaceFlight.earth) {
    const dist = rocketWorldPos.distanceTo(ctx.appCtx.spaceFlight.earth.position);
    if (dist < closestDist) {
      closestDist = dist;
      closestName = 'Earth';
    }
  }
  if (ctx.appCtx.spaceFlight.moon) {
    const dist = rocketWorldPos.distanceTo(ctx.appCtx.spaceFlight.moon.position);
    if (dist < closestDist) {
      closestDist = dist;
      closestName = 'Moon';
    }
  }

  let indicator = document.getElementById('ssProximity');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'ssProximity';
    indicator.style.cssText =
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-120px);' +
      'background:rgba(10,10,30,0.85);border:1px solid #667eea;border-radius:8px;' +
      'padding:8px 16px;color:#fff;font-family:Orbitron,sans-serif;font-size:12px;' +
      'z-index:10001;display:none;text-align:center;pointer-events:none;';
    document.body.appendChild(indicator);
  }

  const threshold = ctx.solarSystem.PROXIMITY_DIST;
  if (closestDist < threshold * 5) {
    const distText = Math.floor(closestDist);
    if (closestDist < threshold) {
      indicator.innerHTML =
        '<span style="color:#10b981;font-weight:700;">' + closestName +
        '</span><br><span style="font-size:10px;opacity:0.8;">Click to inspect</span>';
    } else {
      indicator.innerHTML =
        '<span style="color:#fbbf24;">' + closestName +
        '</span> <span style="font-size:10px;opacity:0.7;">' + distText + ' km</span>';
    }
    if (inBelt) {
      indicator.innerHTML += '<br><span style="font-size:9px;color:#a08060;opacity:0.8;">ASTEROID BELT REGION</span>';
    }
    if (inKuiperBelt) {
      indicator.innerHTML += '<br><span style="font-size:9px;color:#7aa6d8;opacity:0.85;">KUIPER BELT REGION</span>';
    }
    indicator.style.display = 'block';
  } else if (inBelt) {
    indicator.innerHTML =
      '<span style="color:#a08060;font-weight:600;">ASTEROID BELT</span>' +
      '<br><span style="font-size:10px;opacity:0.7;">' + ctx.ASTEROID_BELT.innerAU.toFixed(1) +
      ' - ' + ctx.ASTEROID_BELT.outerAU.toFixed(1) + ' AU from Sun</span>';
    indicator.style.display = 'block';
  } else if (inKuiperBelt) {
    indicator.innerHTML =
      '<span style="color:#7aa6d8;font-weight:600;">KUIPER BELT</span>' +
      '<br><span style="font-size:10px;opacity:0.7;">' + ctx.KUIPER_BELT.innerAU.toFixed(1) +
      ' - ' + ctx.KUIPER_BELT.outerAU.toFixed(1) + ' AU from Sun</span>';
    indicator.style.display = 'block';
  } else {
    indicator.style.display = 'none';
  }
}
