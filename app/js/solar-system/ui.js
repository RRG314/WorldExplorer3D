import {
  handleMoonLandingAction,
  handleSpaceReturnAction,
  hidePlanetInfo,
  showAsteroidInfo,
  showGalaxyInfo,
  showMoonInfo,
  showPlanetInfo,
  showSpacecraftInfo,
  showSunInfo
} from "./info-panel.js?v=3";
import {
  getAstronomicalBody,
  SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS
} from '../astronomy/body-catalog.js?v=3';

function formatKilometers(km) {
  if (km >= 1e9) return (km / 1e9).toFixed(1) + 'B';
  if (km >= 1e6) return (km / 1e6).toFixed(1) + 'M';
  if (km >= 1e3) return (km / 1e3).toFixed(0) + 'K';
  return Math.round(km).toString();
}

export function onSolarSystemClick(ctx, event) {
  if (!ctx.appCtx.spaceFlight.active || !ctx.solarSystem.visible || !ctx.solarSystem.group) return;

  ctx.solarSystem.mouse.x = event.clientX / window.innerWidth * 2 - 1;
  ctx.solarSystem.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  ctx.solarSystem.raycaster.setFromCamera(ctx.solarSystem.mouse, ctx.appCtx.spaceFlight.camera);

  const clickables = [];
  ctx.solarSystem.planetMeshes.forEach((entry) => {
    clickables.push(entry.mesh, entry.hitbox);
  });
  ctx.solarSystem.moonMeshes.forEach((entry) => clickables.push(entry.mesh, entry.hitbox));
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
    !target.userData.isMoon &&
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
  } else if (target && target.userData.isMoon) {
    const entry = ctx.solarSystem.moonMeshes[target.userData.moonIndex];
    if (entry) showMoonInfo(ctx, entry);
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
    <div style="background:rgba(102,126,234,0.15);border-radius:8px;padding:12px;margin-bottom:12px;">
      <div id="ssInfoMetaLabel" style="font-size:10px;opacity:0.7;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">ORBITAL DATA</div>
      <div style="margin-bottom:6px;"><span id="ssInfoMetric1Label">Mean Distance</span>: <span id="ssInfoDistAU" style="color:#fbbf24;font-weight:600;"></span></div>
      <div style="margin-bottom:6px;"><span id="ssInfoMetric2Label">Mean Distance</span>: <span id="ssInfoDistKM" style="color:#fbbf24;font-weight:600;"></span></div>
      <div><span id="ssInfoMetric3Label">Current from Earth</span>: <span id="ssInfoDistEarth" style="color:#0fc;font-weight:600;"></span></div>
    </div>
    <button id="ssInfoSetCourse" style="display:none;width:100%;padding:10px;background:#315d9d;border:1px solid #8ab4ff;border-radius:7px;color:#fff;font:600 11px Orbitron,sans-serif;cursor:pointer;">SET COURSE</button>
  `;
  document.body.appendChild(panel);
  ctx.solarSystem.infoPanel = panel;
  document.getElementById('ssInfoClose').addEventListener('click', () => hidePlanetInfo(ctx));
  document.getElementById('ssInfoSetCourse').addEventListener('click', () => {
    const bodyId = ctx.solarSystem.selectedBodyId;
    const result = ctx.appCtx.retargetRenderedSpaceJourney?.(bodyId);
    if (result?.accepted) hidePlanetInfo(ctx);
  });
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

  const destinationSelect = document.createElement('select');
  destinationSelect.id = 'spaceDestinationSelect';
  destinationSelect.className = 'ssToggleBtn';
  destinationSelect.setAttribute('aria-label', 'Choose a Solar System destination');
  destinationSelect.style.cssText = `
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
  destinationSelect.innerHTML = `
    <option value="">SET COURSE...</option>
    ${SOLAR_SYSTEM_EXPLORATION_DESTINATION_IDS
      .map((bodyId) => getAstronomicalBody(bodyId))
      .filter(Boolean)
      .map((body) => `<option value="${body.id}">${body.name.toUpperCase()}</option>`)
      .join('')}
  `;
  destinationSelect.addEventListener('change', () => {
    const bodyId = destinationSelect.value;
    if (!bodyId) return;
    const result = ctx.appCtx.retargetRenderedSpaceJourney?.(bodyId);
    if (!result?.accepted) {
      destinationSelect.value = '';
      destinationSelect.title = 'Course changes are available from parking orbit.';
    }
  });
  container.appendChild(destinationSelect);

  document.body.appendChild(container);
  createSolarSystemScale(ctx);
}

function createSolarSystemScale(ctx) {
  if (document.getElementById('solarSystemScale')) return;
  const panel = document.createElement('aside');
  panel.id = 'solarSystemScale';
  panel.className = 'solar-system-scale';
  panel.setAttribute('aria-label', 'Top-down logarithmic Solar System map showing the asteroid and Kuiper belts');
  const canvas = document.createElement('canvas');
  canvas.width = 440;
  canvas.height = 260;
  canvas.setAttribute('aria-hidden', 'true');
  panel.appendChild(canvas);
  document.body.appendChild(panel);

  const draw = canvas.getContext('2d');
  if (!draw) return;
  draw.scale(2, 2);
  const centerX = 64;
  const centerY = 70;
  const maxRadius = 52;
  const radiusForAu = (au) => Math.log10(Math.max(0, au) + 1) / Math.log10(51) * maxRadius;
  draw.fillStyle = 'rgba(7, 12, 25, 0.93)';
  draw.fillRect(0, 0, 220, 130);
  draw.fillStyle = '#a9bdd9';
  draw.font = '600 8px Inter, sans-serif';
  draw.fillText('SOLAR SYSTEM | TOP VIEW | LOG AU', 10, 13);

  const drawBand = (inner, outer, color, opacity) => {
    const innerRadius = radiusForAu(inner);
    const outerRadius = radiusForAu(outer);
    draw.save();
    draw.strokeStyle = color;
    draw.globalAlpha = opacity;
    draw.lineWidth = Math.max(3, outerRadius - innerRadius);
    draw.beginPath();
    draw.arc(centerX, centerY, (innerRadius + outerRadius) / 2, 0, Math.PI * 2);
    draw.stroke();
    draw.restore();
  };
  drawBand(ctx.ASTEROID_BELT.innerAU, ctx.ASTEROID_BELT.outerAU, '#c49368', 0.8);
  drawBand(ctx.KUIPER_BELT.innerAU, ctx.KUIPER_BELT.outerAU, '#6eafe3', 0.55);

  const planetDistances = [0.387, 0.723, 1, 1.524, 5.203, 9.537, 19.189, 30.07];
  const planetColors = ['#b9aaa0', '#e8c080', '#65a6e8', '#d36b45', '#d7b37a', '#d9c88c', '#92d8de', '#6388df'];
  planetDistances.forEach((au, index) => {
    const angle = -0.7 + index * 0.92;
    const radius = radiusForAu(au);
    draw.fillStyle = planetColors[index];
    draw.beginPath();
    draw.arc(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, index < 4 ? 1.5 : 2, 0, Math.PI * 2);
    draw.fill();
  });

  draw.fillStyle = '#ffd76a';
  draw.beginPath();
  draw.arc(centerX, centerY, 4, 0, Math.PI * 2);
  draw.fill();

  draw.fillStyle = '#eef6ff';
  draw.font = '600 8px Inter, sans-serif';
  draw.fillText(`ASTEROID BELT`, 126, 47);
  draw.fillStyle = '#c7a17f';
  draw.fillText(`${ctx.ASTEROID_BELT.innerAU.toFixed(1)}-${ctx.ASTEROID_BELT.outerAU.toFixed(1)} AU`, 126, 58);
  draw.fillStyle = '#eef6ff';
  draw.fillText('KUIPER BELT', 126, 82);
  draw.fillStyle = '#8fc5f2';
  draw.fillText(`${ctx.KUIPER_BELT.innerAU.toFixed(0)}-${ctx.KUIPER_BELT.outerAU.toFixed(0)} AU`, 126, 93);
  draw.fillStyle = '#8297b4';
  draw.font = '500 7px Inter, sans-serif';
  draw.fillText('REAL ORBITAL POSITIONS', 126, 113);
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
  const destinationSelect = document.getElementById('spaceDestinationSelect');
  if (returnBtn) returnBtn.textContent = 'RETURN TO EARTH';
  if (destinationSelect) destinationSelect.value = '';
  const scale = document.getElementById('solarSystemScale');
  if (scale) scale.style.display = 'block';
  ctx?.appCtx?.showUniverseUI?.();
}

export function hideSolarSystemUI(ctx) {
  const container = document.getElementById('ssToggleContainer');
  if (container) container.style.display = 'none';
  if (ctx?.appCtx?.spaceFlight) ctx.appCtx.spaceFlight.overviewMode = false;
  const scale = document.getElementById('solarSystemScale');
  if (scale) scale.style.display = 'none';
  const proximity = document.getElementById('ssProximity');
  if (proximity) proximity.style.display = 'none';
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
      el.textContent = dist.toFixed(3) + ' AU (' + formatKilometers(distKM) + ' km)';
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
  const beltVisualScale = Number(ctx.ASTEROID_BELT.visualScale) || 1;
  const beltInnerScene = ctx.ASTEROID_BELT.innerAU * ctx.AU_TO_SCENE * beltVisualScale;
  const beltOuterScene = ctx.ASTEROID_BELT.outerAU * ctx.AU_TO_SCENE * beltVisualScale;
  const inBelt = rocketDistFromSun > beltInnerScene * 0.9 && rocketDistFromSun < beltOuterScene * 1.1;

  const kuiperVisualScale = Number(ctx.KUIPER_BELT.visualScale) || 1;
  const kuiperInnerScene = ctx.KUIPER_BELT.innerAU * ctx.AU_TO_SCENE * kuiperVisualScale;
  const kuiperOuterScene = ctx.KUIPER_BELT.outerAU * ctx.AU_TO_SCENE * kuiperVisualScale;
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
