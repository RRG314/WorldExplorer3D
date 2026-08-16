function initSolarSystemModel(context, spaceScene) {
  const {
    ASTEROID_BELT,
    KUIPER_BELT,
    SOLAR_SYSTEM_PLANETS,
    THREE,
    appCtx,
    computeOrbitPath,
    computePlanetPosition,
    createAsteroidBelt,
    createGalaxies,
    createInfoPanel,
    createKuiperBelt,
    createLabel,
    createMoonSystems,
    createSpacecraft,
    createToggleButton,
    distanceAU,
    getEarthHelioPos,
    onSolarSystemClick,
    solarSystem,
    updateSolarSystemPositions
  } = context;

  if (solarSystem.initialized) return;

  console.log('[SolarSystem] Initializing heliocentric model...');
  solarSystem.mouse = new THREE.Vector2();
  solarSystem.group = new THREE.Group();
  solarSystem.group.name = 'solarSystemGroup';
  solarSystem.raycaster = new THREE.Raycaster();

  const sunGeo = new THREE.SphereGeometry(solarSystem.SUN_SIZE, 32, 32);
  const sunCanvas = document.createElement('canvas');
  sunCanvas.width = 2048;
  sunCanvas.height = 1024;
  const sunCanvasContext = sunCanvas.getContext('2d');
  sunCanvasContext.fillStyle = '#7c3f08';
  sunCanvasContext.fillRect(0, 0, sunCanvas.width, sunCanvas.height);
  const sunTexture = new THREE.CanvasTexture(sunCanvas);
  if (typeof THREE.SRGBColorSpace !== 'undefined') sunTexture.colorSpace = THREE.SRGBColorSpace;
  const sunImage = new Image();
  sunImage.onload = () => {
    const sourceSize = Math.min(sunImage.naturalWidth, sunImage.naturalHeight) * 0.61;
    const sourceX = (sunImage.naturalWidth - sourceSize) / 2;
    const sourceY = (sunImage.naturalHeight - sourceSize) / 2;
    const hemisphereWidth = sunCanvas.width / 2;
    sunCanvasContext.drawImage(
      sunImage,
      sourceX, sourceY, sourceSize, sourceSize,
      0, 0, hemisphereWidth, sunCanvas.height
    );
    sunCanvasContext.save();
    sunCanvasContext.translate(sunCanvas.width, 0);
    sunCanvasContext.scale(-1, 1);
    sunCanvasContext.drawImage(
      sunImage,
      sourceX, sourceY, sourceSize, sourceSize,
      0, 0, hemisphereWidth, sunCanvas.height
    );
    sunCanvasContext.restore();
    sunTexture.needsUpdate = true;
  };
  sunImage.src = '/app/assets/textures/universe/sun-sdo-2025.jpg';
  sunTexture.userData = {
    imageCredit: 'NASA/GSFC/Solar Dynamics Observatory',
    imageSourceUrl: 'https://science.nasa.gov/photojournal/image-of-sun-from-nasas-solar-dynamics-observatory/',
    observationDate: '2025-09-10'
  };
  const sunMat = new THREE.MeshBasicMaterial({ map: sunTexture, color: 0xffffff });
  solarSystem.sunMesh = new THREE.Mesh(sunGeo, sunMat);
  solarSystem.sunMesh.name = 'Sun';
  solarSystem.sunMesh.position.set(0, 0, 0);
  solarSystem.sunMesh.userData = { ...sunTexture.userData, authoritativeSpaceSun: true };
  solarSystem.group.add(solarSystem.sunMesh);

  const sunLight = new THREE.PointLight(0xfff8e0, 0.8, 50000);
  solarSystem.sunMesh.add(sunLight);

  createLabel('Sun', solarSystem.sunMesh, solarSystem.SUN_SIZE);

  const now = new Date();
  const earthPos = getEarthHelioPos(now);

  SOLAR_SYSTEM_PLANETS.forEach((planet, i) => {
    if (planet.name === 'Earth') return;

    const geo = new THREE.SphereGeometry(planet.radiusScaled, 40, 28);
    const texturePath = planet.texture || null;
    const texture = texturePath ? new THREE.TextureLoader().load(texturePath) : null;
    if (texture) {
      if (typeof THREE.SRGBColorSpace !== 'undefined') texture.colorSpace = THREE.SRGBColorSpace;
      else if (typeof THREE.sRGBEncoding !== 'undefined') texture.encoding = THREE.sRGBEncoding;
      texture.anisotropy = Math.min(4, appCtx.spaceFlight?.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    }
    const mat = new THREE.MeshPhongMaterial({
      map: texture,
      color: planet.color,
      emissive: planet.emissive,
      shininess: 30
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = planet.name;
    mesh.userData = { isPlanet: true, planetIndex: i };

    const glowGeo = new THREE.SphereGeometry(planet.radiusScaled * 1.4, 20, 20);
    const glowMat = new THREE.MeshBasicMaterial({
      color: planet.glowColor || planet.color,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide
    });
    mesh.add(new THREE.Mesh(glowGeo, glowMat));

    if (planet.name === 'Saturn') {
      const ringGeo = new THREE.RingGeometry(
        planet.radiusScaled * 1.3,
        planet.radiusScaled * 2.2,
        48
      );
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xccbb88, transparent: true, opacity: 0.6, side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI * 0.4;
      mesh.add(ring);
    }

    const hitRadius = Math.max(planet.radiusScaled * 3, 50);
    const hitGeo = new THREE.SphereGeometry(hitRadius, 8, 8);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(hitGeo, hitMat);
    hitbox.userData = { isPlanet: true, planetIndex: i };
    mesh.add(hitbox);

    createLabel(planet.name, mesh, planet.radiusScaled);

    solarSystem.group.add(mesh);

    const realPos = computePlanetPosition(planet, now);
    const distFromEarth = distanceAU(realPos, earthPos);

    solarSystem.planetMeshes.push({
      mesh,
      hitbox,
      planet,
      realPosition: realPos,
      distFromEarthAU: distFromEarth
    });
  });

  solarSystem.orbitLines = [];
  solarSystem.orbitMarkers = [];
  SOLAR_SYSTEM_PLANETS.forEach((planet) => {
    const orbitPoints = computeOrbitPath(planet, 128);
    orbitPoints.push(orbitPoints[0].clone());

    const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbitMat = new THREE.LineBasicMaterial({
      color: planet.color,
      transparent: true,
      opacity: 0.4,
      linewidth: 1
    });
    const orbitLine = new THREE.LineLoop(orbitGeo, orbitMat);
    orbitLine.name = planet.name + '_orbit';
    solarSystem.group.add(orbitLine);
    solarSystem.orbitLines.push(orbitLine);

    // Space flight owns the full textured Earth. A second marker at the same
    // coordinates can occlude it when the launch camera is nearby.
    if (planet.name === 'Earth') return;

    const markerSize = Math.max(planet.radiusScaled * 0.25, 5);
    const markerGeo = new THREE.SphereGeometry(markerSize, 12, 12);
    const markerMat = new THREE.MeshBasicMaterial({
      color: planet.color,
      transparent: true,
      opacity: 0.9
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.name = planet.name + '_orbitMarker';

    const pulseGeo = new THREE.SphereGeometry(markerSize * 3, 10, 10);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: planet.color,
      transparent: true,
      opacity: 0.2,
      side: THREE.BackSide
    });
    const pulse = new THREE.Mesh(pulseGeo, pulseMat);
    pulse.name = 'pulse';
    marker.add(pulse);

    solarSystem.group.add(marker);
    solarSystem.orbitMarkers.push({ mesh: marker, planet });
  });

  createMoonSystems();
  createAsteroidBelt();
  createKuiperBelt();
  createSpacecraft();
  createGalaxies();

  updateSolarSystemPositions(now);

  spaceScene.add(solarSystem.group);

  solarSystem.spacecraftMeshes.forEach((entry) => {
    if (entry.orbitData.type === 'earthOrbit' || entry.orbitData.type === 'L2') {
      spaceScene.add(entry.mesh);
    }
  });

  createInfoPanel();
  createToggleButton();

  if (appCtx.spaceFlight.canvas) {
    appCtx.spaceFlight.canvas.addEventListener('click', onSolarSystemClick);
  }

  solarSystem.initialized = true;
  console.log('[SolarSystem] Heliocentric model initialized with',
    solarSystem.planetMeshes.length, 'planets +',
    solarSystem.moonMeshes.length, 'moons +',
    solarSystem.asteroidMeshes.length, 'named asteroids +',
    ASTEROID_BELT.count, 'belt particles +',
    KUIPER_BELT.count, 'kuiper particles +',
    solarSystem.spacecraftMeshes.length, 'spacecraft +',
    solarSystem.galaxyMeshes.length, 'galaxies + Sun');
}

export { initSolarSystemModel };
