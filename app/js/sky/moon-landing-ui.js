import { createApollo11SiteEquipment } from './apollo11-site.js?v=1';

function createMoonLandingUiApi(context) {
  const {
    THREE,
    appCtx,
    onReturnToEarth
  } = context;

  let apollo11Flag = null;
  const landingSite = { x: 200, z: -500 };
  // Keep the playable vehicle clear of Eagle Crater and the historical marker.
  const playerSpawn = { x: 200, z: -950 };

  function getApollo11Flag() {
    return apollo11Flag;
  }

  function positionCarOnMoon() {
    appCtx.car.x = playerSpawn.x;
    appCtx.car.z = playerSpawn.z;
    if (typeof appCtx.invalidateRoadCache === 'function') appCtx.invalidateRoadCache();

    appCtx.moonSurface.updateMatrixWorld(true);

    const spawnRaycaster = new THREE.Raycaster();
    const spawnRayStart = new THREE.Vector3(appCtx.car.x, 1000, appCtx.car.z);
    const spawnRayDir = new THREE.Vector3(0, -1, 0);
    spawnRaycaster.set(spawnRayStart, spawnRayDir);

    const spawnHits = spawnRaycaster.intersectObject(appCtx.moonSurface, false);
    let groundHeight;
    if (spawnHits.length > 0) {
      groundHeight = spawnHits[0].point.y;
      appCtx.car.y = groundHeight + 1.2;
    } else {
      groundHeight = appCtx.moonSurface.position.y;
      appCtx.car.y = groundHeight + 2;
      console.warn('Spawn raycast failed, using fallback Y=' + appCtx.car.y);
    }

    appCtx.car.vx = 0;
    appCtx.car.vz = 0;
    appCtx.car.vy = 0;
    appCtx.car.vFwd = 0;
    appCtx.car.vLat = 0;
    appCtx.car.speed = 0;
    appCtx.car.driftAngle = 0;
    appCtx.car.isAirborne = false;
    appCtx.car._lastSurfaceY = null;
    appCtx.car.angle = 0;

    appCtx.drone.x = appCtx.car.x;
    appCtx.drone.z = appCtx.car.z;
    appCtx.drone.y = groundHeight + 10;
    appCtx.drone.pitch = -0.2;
    appCtx.drone.yaw = 0;
    appCtx.drone.roll = 0;

    if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.walker) {
      appCtx.Walk.state.walker.x = appCtx.car.x;
      appCtx.Walk.state.walker.z = appCtx.car.z;
      appCtx.Walk.state.walker.y = groundHeight + 1.7;
      appCtx.Walk.state.walker.vy = 0;
      appCtx.Walk.state.walker.angle = 0;
      appCtx.Walk.state.walker.yaw = 0;
    }
  }

  function createApollo11LandingSite() {
    const landingX = landingSite.x;
    const landingZ = landingSite.z;
    if (!Array.isArray(window._moonObjects)) window._moonObjects = [];

    const raycaster = new THREE.Raycaster();
    const rayStart = new THREE.Vector3(landingX, 1000, landingZ);
    const rayDir = new THREE.Vector3(0, -1, 0);
    raycaster.set(rayStart, rayDir);

    const hits = raycaster.intersectObject(appCtx.moonSurface, false);
    if (hits.length === 0) {
      console.error('Could not find ground at Apollo 11 site.');
      return;
    }

    const groundY = hits[0].point.y;

    const groundAt = (x, z) => {
      raycaster.set(new THREE.Vector3(x, 1000, z), rayDir);
      return raycaster.intersectObject(appCtx.moonSurface, false)[0]?.point?.y ?? groundY;
    };
    const site = createApollo11SiteEquipment({ THREE, appCtx, landingX, landingZ, groundAt });
    apollo11Flag = site.flag;
    window._moonObjects.push(...site.moonObjects.filter((object) => object !== apollo11Flag));
    apollo11Flag.userData.info = {
      mission: 'Apollo 11',
      date: 'July 20, 1969',
      crew: 'Neil Armstrong, Buzz Aldrin, Michael Collins',
      location: 'Mare Tranquillitatis',
      coordinates: '0.67408°N, 23.47297°E',
      landingTime: '20:17:40 UTC',
      quote: '"That\'s one small step for man, one giant leap for mankind."'
    };
    // The flag and plaque identify the site without putting the camera inside a
    // large artificial beacon or washing out the lunar surface.
    window.apollo11Beacon = null;

    const footprintMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 1,
      metalness: 0
    });
    for (let i = 0; i < 30; i++) {
      const angle = i / 30 * Math.PI * 2;
      const radius = 5 + Math.random() * 10;
      const footprint = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), footprintMaterial);
      const fpRayStart = new THREE.Vector3(
        landingX + Math.cos(angle) * radius,
        1000,
        landingZ + Math.sin(angle) * radius
      );
      raycaster.set(fpRayStart, rayDir);
      const fpHits = raycaster.intersectObject(appCtx.moonSurface, false);
      if (fpHits.length > 0) {
        footprint.position.set(
          landingX + Math.cos(angle) * radius,
          fpHits[0].point.y + 0.02,
          landingZ + Math.sin(angle) * radius
        );
        footprint.rotation.x = -Math.PI / 2;
        footprint.userData.moonObject = true;
        appCtx.scene.add(footprint);
        window._moonObjects.push(footprint);
      }
    }
  }

  function showApollo11Info() {
    const info = apollo11Flag?.userData?.info;
    if (!info) return;

    const panel = document.createElement('div');
    panel.style.cssText = [
      'position: fixed',
      'top: 50%',
      'left: 50%',
      'transform: translate(-50%, -50%)',
      'background: rgba(0, 0, 0, 0.95)',
      'color: #ffffff',
      'padding: 30px 40px',
      'border-radius: 15px',
      'border: 3px solid #d4af37',
      'box-shadow: 0 0 30px rgba(212, 175, 55, 0.5)',
      'z-index: 10000',
      'font-family: Courier New, monospace',
      'max-width: 600px',
      'backdrop-filter: blur(10px)'
    ].join(';');
    panel.innerHTML = `
      <div style="text-align:center;margin-bottom:20px;">
        <h2 style="color:#d4af37;margin:0;font-size:28px;text-shadow:0 0 10px rgba(212,175,55,0.8);">
          Apollo 11 Landing Site
        </h2>
        <div style="color:#888;font-size:14px;margin-top:5px;">Mare Tranquillitatis</div>
      </div>
      <div style="line-height:1.8;font-size:16px;">
        <div style="margin:15px 0;"><strong style="color:#d4af37;">Date:</strong> ${info.date}</div>
        <div style="margin:15px 0;"><strong style="color:#d4af37;">Crew:</strong> ${info.crew}</div>
        <div style="margin:15px 0;"><strong style="color:#d4af37;">Coordinates:</strong> ${info.coordinates}</div>
        <div style="margin:15px 0;"><strong style="color:#d4af37;">Landing Time:</strong> ${info.landingTime}</div>
        <div style="margin:15px 0;"><strong style="color:#d4af37;">Location:</strong> ${info.location}</div>
      </div>
      <div style="margin:20px 0;padding:15px;background:rgba(212,175,55,0.1);border-left:3px solid #d4af37;font-style:italic;">
        ${info.quote}<br><span style="color:#888;font-size:14px;">Neil Armstrong</span>
      </div>
      <div style="text-align:center;margin-top:20px;">
        <button id="apollo11CloseBtn" style="background:#d4af37;color:#000;border:none;padding:12px 30px;font-size:16px;font-weight:bold;border-radius:5px;cursor:pointer;font-family:Courier New, monospace;">
          Close
        </button>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('apollo11CloseBtn')?.addEventListener('click', () => {
      if (document.body.contains(panel)) document.body.removeChild(panel);
    });

    const escHandler = (event) => {
      if (event.key !== 'Escape') return;
      if (document.body.contains(panel)) document.body.removeChild(panel);
      document.removeEventListener('keydown', escHandler);
    };
    document.addEventListener('keydown', escHandler);
  }

  function showReturnToEarthButton() {
    let btn = document.getElementById('returnToEarthBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'returnToEarthBtn';
      btn.className = 'game-btn';
      btn.textContent = 'Return to Earth';
      btn.style.position = 'fixed';
      btn.style.top = '82px';
      btn.style.right = '20px';
      btn.style.zIndex = '1000';
      btn.style.padding = '10px 20px';
      btn.style.fontSize = '16px';
      btn.style.backgroundColor = '#4CAF50';
      btn.style.color = 'white';
      btn.style.border = 'none';
      btn.style.borderRadius = '5px';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', onReturnToEarth);
      document.body.appendChild(btn);
    }
    btn.style.display = 'block';
  }

  function hideReturnToEarthButton() {
    const btn = document.getElementById('returnToEarthBtn');
    if (btn) btn.style.display = 'none';
  }

  return {
    createApollo11LandingSite,
    getApollo11Flag,
    hideReturnToEarthButton,
    positionCarOnMoon,
    showApollo11Info,
    showReturnToEarthButton
  };
}

export { createMoonLandingUiApi };
