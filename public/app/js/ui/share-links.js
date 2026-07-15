import { ctx as appCtx } from "../shared-context.js?v=55";

function readSharedExperienceParams() {
  const params = new URLSearchParams(window.location.search);
  const hasKnown = params.has('loc') || params.has('lat') || params.has('lon') || params.has('gm') || params.has('mode') || params.has('camMode') || params.has('seed');
  if (!hasKnown) return null;

  const toNum = (key) => {
    const raw = params.get(key);
    if (raw === null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const normalizeLaunch = (value) => value === 'moon' || value === 'mars' || value === 'space' || value === 'ocean' ? value : 'earth';
  const normalizeGameMode = (value) => {
    if (value === 'trial' || value === 'checkpoint' || value === 'painttown' || value === 'police' || value === 'flower') return value;
    return value === 'free' ? 'free' : null;
  };
  const normalizeTravelMode = (value) => {
    if (value === 'driving' || value === 'walking' || value === 'drone' || value === 'plane' || value === 'boat' || value === 'rocket' || value === 'submarine') return value;
    return null;
  };

  return {
    loc: params.get('loc') || null,
    lat: toNum('lat'),
    lon: toNum('lon'),
    name: params.get('lname') || null,
    launch: params.has('launch') ? normalizeLaunch(params.get('launch')) : null,
    gameMode: normalizeGameMode(params.get('gm')),
    perfMode: params.get('pm') === 'baseline' ? 'baseline' : params.get('pm') === 'rdt' ? 'rdt' : null,
    seed: toNum('seed'),
    travelMode: normalizeTravelMode(params.get('mode')),
    camMode: (() => {
      const value = toNum('camMode');
      return Number.isFinite(value) ? Math.max(0, Math.min(2, Math.round(value))) : null;
    })(),
    refX: toNum('rx'),
    refY: toNum('ry'),
    refZ: toNum('rz'),
    yaw: toNum('yaw'),
    pitch: toNum('pitch')
  };
}

function initShareUi({ bindTouchFriendlyPress, closeAllFloatMenus, getTitleLaunchMode }) {
  const shareExperienceBtn = document.getElementById('shareExperienceBtn');
  const shareExperienceStatus = document.getElementById('shareExperienceStatus');
  const titleShareNative = document.getElementById('titleShareNative');
  const titleShareFacebook = document.getElementById('titleShareFacebook');
  const titleShareTwitter = document.getElementById('titleShareTwitter');
  const titleShareInstagram = document.getElementById('titleShareInstagram');
  const titleShareText = document.getElementById('titleShareText');
  const gameShareFloatBtn = document.getElementById('gameShareFloatBtn');
  const gameShareMenu = document.getElementById('gameShareMenu');
  const gameShareStatus = document.getElementById('gameShareStatus');
  const gameShareCopy = document.getElementById('gameShareCopy');
  const gameShareNative = document.getElementById('gameShareNative');
  const gameShareFacebook = document.getElementById('gameShareFacebook');
  const gameShareTwitter = document.getElementById('gameShareTwitter');
  const gameShareInstagram = document.getElementById('gameShareInstagram');
  const gameShareText = document.getElementById('gameShareText');
  const coordsReadout = document.getElementById('coords');

  function getCurrentTravelMode() {
    if ((typeof appCtx.isEnv === 'function' && typeof appCtx.ENV !== 'undefined' && appCtx.isEnv(appCtx.ENV.OCEAN)) || appCtx.oceanMode?.active) {
      return 'submarine';
    }
    if (typeof appCtx.isEnv === 'function' && typeof appCtx.ENV !== 'undefined' && appCtx.isEnv(appCtx.ENV.SPACE_FLIGHT)) return 'rocket';
    if (appCtx.boatMode?.active) return 'boat';
    if (appCtx.planeMode?.active) return 'plane';
    if (appCtx.droneMode) return 'drone';
    if (appCtx.Walk?.state?.mode === 'walk') return 'walking';
    return 'driving';
  }

  function applySharedRuntimeState() {
    const pending = appCtx.pendingExperienceState;
    if (!pending || typeof pending !== 'object') return;

    const setDriveMode = () => {
      appCtx.droneMode = false;
      if (appCtx.Walk) appCtx.Walk.setModeDrive();
      if (appCtx.carMesh) appCtx.carMesh.visible = true;
      document.getElementById('fDriving')?.classList.add('on');
      document.getElementById('fWalk')?.classList.remove('on');
      document.getElementById('fDrone')?.classList.remove('on');
      document.getElementById('fPlane')?.classList.remove('on');
    };
    const setWalkMode = () => {
      appCtx.droneMode = false;
      if (appCtx.Walk?.state?.mode !== 'walk') appCtx.Walk?.toggleWalk?.();
      document.getElementById('fDriving')?.classList.remove('on');
      document.getElementById('fWalk')?.classList.add('on');
      document.getElementById('fDrone')?.classList.remove('on');
      document.getElementById('fPlane')?.classList.remove('on');
    };
    const setDroneMode = () => {
      if (!appCtx.droneMode) {
        appCtx.droneMode = true;
        if (appCtx.Walk?.state?.mode === 'walk') appCtx.Walk.setModeDrive();
      }
      document.getElementById('fDriving')?.classList.remove('on');
      document.getElementById('fWalk')?.classList.remove('on');
      document.getElementById('fDrone')?.classList.add('on');
      document.getElementById('fPlane')?.classList.remove('on');
    };
    const setPlaneMode = () => {
      appCtx.droneMode = false;
      if (appCtx.Walk?.state?.mode === 'walk') appCtx.Walk.setModeDrive();
      document.getElementById('fDriving')?.classList.remove('on');
      document.getElementById('fWalk')?.classList.remove('on');
      document.getElementById('fDrone')?.classList.remove('on');
      document.getElementById('fPlane')?.classList.add('on');
    };

    const mode = pending.travelMode || getCurrentTravelMode();
    if (pending.travelMode === 'walking') setWalkMode();
    else if (pending.travelMode === 'drone') setDroneMode();
    else if (pending.travelMode === 'plane') setPlaneMode();
    else if (pending.travelMode === 'driving') setDriveMode();

    const x = Number.isFinite(pending.refX) ? pending.refX : null;
    const y = Number.isFinite(pending.refY) ? pending.refY : null;
    const z = Number.isFinite(pending.refZ) ? pending.refZ : null;
    const yaw = Number.isFinite(pending.yaw) ? pending.yaw : null;
    const pitch = Number.isFinite(pending.pitch) ? pending.pitch : null;
    const terrainYAt = (tx, tz) => typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(tx, tz) : appCtx.elevationWorldYAtWorldXZ(tx, tz);

    if (mode === 'plane') {
      appCtx.startPlaneMode?.({
        x: Number.isFinite(x) ? x : undefined,
        y: Number.isFinite(y) ? y : undefined,
        z: Number.isFinite(z) ? z : undefined,
        yaw: Number.isFinite(yaw) ? yaw : undefined,
        pitch: Number.isFinite(pitch) ? pitch : undefined,
        airborne: Number.isFinite(y) && y > terrainYAt(x || 0, z || 0) + 1.4
      });
    } else if (mode === 'drone') {
      if (Number.isFinite(x)) appCtx.drone.x = x;
      if (Number.isFinite(z)) appCtx.drone.z = z;
      appCtx.drone.y = Number.isFinite(y) ? y : terrainYAt(appCtx.drone.x, appCtx.drone.z) + 45;
      if (Number.isFinite(yaw)) appCtx.drone.yaw = yaw;
      if (Number.isFinite(pitch)) appCtx.drone.pitch = pitch;
    } else if (mode === 'walking' && appCtx.Walk?.state?.walker) {
      const walker = appCtx.Walk.state.walker;
      if (Number.isFinite(x)) walker.x = x;
      if (Number.isFinite(z)) walker.z = z;
      walker.y = Number.isFinite(y) ? y : terrainYAt(walker.x, walker.z) + 1.7;
      walker.vy = 0;
      if (Number.isFinite(yaw)) {
        walker.yaw = yaw;
        walker.angle = yaw;
      }
      if (appCtx.Walk.state.characterMesh) {
        appCtx.Walk.state.characterMesh.position.set(walker.x, walker.y - 1.7, walker.z);
        appCtx.Walk.state.characterMesh.rotation.y = Number.isFinite(yaw) ? yaw : appCtx.Walk.state.characterMesh.rotation.y;
      }
      appCtx.car.x = walker.x;
      appCtx.car.z = walker.z;
      appCtx.car.angle = Number.isFinite(yaw) ? yaw : appCtx.car.angle;
    } else if (mode === 'boat') {
      if (Number.isFinite(x)) appCtx.boat.x = x;
      if (Number.isFinite(z)) appCtx.boat.z = z;
      if (Number.isFinite(y)) appCtx.boat.y = y;
      if (Number.isFinite(yaw)) appCtx.boat.angle = yaw;
      if (typeof appCtx.startBoatMode === 'function') {
        appCtx.startBoatMode({
          source: 'shared_state',
          spawnX: Number.isFinite(x) ? x : undefined,
          spawnZ: Number.isFinite(z) ? z : undefined,
          yaw: Number.isFinite(yaw) ? yaw : undefined
        });
      }
    } else {
      if (Number.isFinite(x)) appCtx.car.x = x;
      if (Number.isFinite(z)) appCtx.car.z = z;
      appCtx.car.y = Number.isFinite(y) ? y : terrainYAt(appCtx.car.x, appCtx.car.z) + 1.2;
      if (Number.isFinite(yaw)) appCtx.car.angle = yaw;
      appCtx.car.speed = 0;
      appCtx.car.vx = 0;
      appCtx.car.vz = 0;
      if (appCtx.carMesh) {
        appCtx.carMesh.position.set(appCtx.car.x, appCtx.car.y, appCtx.car.z);
        appCtx.carMesh.rotation.y = appCtx.car.angle;
      }
    }

    if (Number.isFinite(pending.camMode)) appCtx.camMode = pending.camMode;
    if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
    if (typeof appCtx.updateCamera === 'function') appCtx.updateCamera();
    appCtx.pendingExperienceState = null;
  }

  function buildShareableExperienceLink() {
    const url = new URL(window.location.href);
    const params = new URLSearchParams();
    const pending = appCtx.pendingExperienceState && typeof appCtx.pendingExperienceState === 'object' ? appCtx.pendingExperienceState : null;
    const mode = !appCtx.gameStarted && pending?.travelMode ? pending.travelMode : getCurrentTravelMode();
    const launchMode =
      typeof appCtx.isEnv === 'function' && typeof appCtx.ENV !== 'undefined' && appCtx.isEnv(appCtx.ENV.OCEAN) ? 'ocean' :
      typeof appCtx.isEnv === 'function' && typeof appCtx.ENV !== 'undefined' && appCtx.isEnv(appCtx.ENV.SPACE_FLIGHT) ? 'space' :
      appCtx.onMars ? 'mars' :
      appCtx.onMoon ? 'moon' :
      (appCtx.loadingScreenMode === 'moon' || appCtx.loadingScreenMode === 'mars' || appCtx.loadingScreenMode === 'space' || appCtx.loadingScreenMode === 'ocean' ? appCtx.loadingScreenMode : getTitleLaunchMode?.() || 'earth');
    const fmt = (value, digits = 3) => Number(value).toFixed(digits);

    if (appCtx.selLoc === 'custom') {
      params.set('loc', 'custom');
      const lat = Number(appCtx.customLoc?.lat);
      const lon = Number(appCtx.customLoc?.lon);
      if (Number.isFinite(lat)) params.set('lat', lat.toFixed(6));
      if (Number.isFinite(lon)) params.set('lon', lon.toFixed(6));
      const name = (appCtx.customLoc?.name || 'Custom Location').trim();
      if (name) params.set('lname', name.slice(0, 80));
    } else if (appCtx.selLoc && appCtx.LOCS?.[appCtx.selLoc]) {
      params.set('loc', appCtx.selLoc);
    }

    if (launchMode) params.set('launch', launchMode);
    if (appCtx.gameMode) params.set('gm', appCtx.gameMode);
    if (typeof appCtx.getPerfMode === 'function') params.set('pm', appCtx.getPerfMode());
    const seedValue = Number.isFinite(Number(appCtx.sharedSeedOverride)) ? Number(appCtx.sharedSeedOverride) : Number(appCtx.rdtSeed);
    if (Number.isFinite(seedValue)) params.set('seed', String((Math.floor(seedValue) | 0) >>> 0));
    const cameraMode = !appCtx.gameStarted && pending && Number.isFinite(pending.camMode) ? pending.camMode : appCtx.camMode;
    if (Number.isFinite(cameraMode)) params.set('camMode', String(Math.max(0, Math.min(2, cameraMode | 0))));
    params.set('mode', mode);

    const pendingX = pending && Number.isFinite(pending.refX) ? pending.refX : null;
    const pendingY = pending && Number.isFinite(pending.refY) ? pending.refY : null;
    const pendingZ = pending && Number.isFinite(pending.refZ) ? pending.refZ : null;
    const pendingYaw = pending && Number.isFinite(pending.yaw) ? pending.yaw : null;
    const pendingPitch = pending && Number.isFinite(pending.pitch) ? pending.pitch : null;

    if (mode === 'plane') {
      params.set('rx', fmt(pendingX ?? appCtx.planeMode?.x ?? 0));
      params.set('ry', fmt(pendingY ?? appCtx.planeMode?.y ?? 0));
      params.set('rz', fmt(pendingZ ?? appCtx.planeMode?.z ?? 0));
      params.set('yaw', fmt(pendingYaw ?? appCtx.planeMode?.yaw ?? 0, 4));
      params.set('pitch', fmt(pendingPitch ?? appCtx.planeMode?.pitch ?? 0, 4));
    } else if (mode === 'drone') {
      params.set('rx', fmt(pendingX ?? appCtx.drone?.x ?? 0));
      params.set('ry', fmt(pendingY ?? appCtx.drone?.y ?? 0));
      params.set('rz', fmt(pendingZ ?? appCtx.drone?.z ?? 0));
      params.set('yaw', fmt(pendingYaw ?? appCtx.drone?.yaw ?? 0, 4));
      params.set('pitch', fmt(pendingPitch ?? appCtx.drone?.pitch ?? 0, 4));
    } else if (mode === 'walking') {
      const walker = appCtx.Walk?.state?.walker || null;
      params.set('rx', fmt(pendingX ?? walker?.x ?? 0));
      params.set('ry', fmt(pendingY ?? walker?.y ?? 1.7));
      params.set('rz', fmt(pendingZ ?? walker?.z ?? 0));
      params.set('yaw', fmt(pendingYaw ?? walker?.yaw ?? walker?.angle ?? 0, 4));
    } else {
      params.set('rx', fmt(pendingX ?? appCtx.car?.x ?? 0));
      params.set('ry', fmt(pendingY ?? appCtx.car?.y ?? 0));
      params.set('rz', fmt(pendingZ ?? appCtx.car?.z ?? 0));
      params.set('yaw', fmt(pendingYaw ?? appCtx.car?.angle ?? 0, 4));
    }

    url.search = params.toString();
    url.hash = '';
    return url.toString();
  }

  const setGameShareStatus = (message = '') => {
    if (gameShareStatus) gameShareStatus.textContent = message;
  };
  const setTitleShareStatus = (message = '') => {
    if (shareExperienceStatus) shareExperienceStatus.textContent = message;
  };
  const closeGameShareMenu = () => {
    gameShareMenu?.classList.remove('show');
    setGameShareStatus('');
  };

  async function copyShareLinkWithFallback(link) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(link);
        return true;
      } catch (_) {}
    }
    window.prompt('Copy experience link:', link);
    return false;
  }

  function openShareWindow(targetUrl, onBlocked = null) {
    const popup = window.open(targetUrl, '_blank', 'noopener,noreferrer');
    if (popup && typeof popup.focus === 'function') popup.focus();
    if (popup) return true;
    if (typeof onBlocked === 'function') onBlocked();
    else setGameShareStatus('Popup blocked. Allow popups to open share links.');
    return false;
  }

  coordsReadout?.addEventListener('click', async (event) => {
    if (event.target?.closest?.('[data-osm-location-link]')) return;
    event.stopPropagation();
    try {
      await copyShareLinkWithFallback(buildShareableExperienceLink());
    } catch (error) {
      console.warn('[share] Unable to copy coords share link:', error);
    }
  });

  document.querySelectorAll('[data-osm-location-link]').forEach((link) => {
    link.addEventListener('click', (event) => event.stopPropagation());
  });

  shareExperienceBtn?.addEventListener('click', async () => {
    try {
      const copied = await copyShareLinkWithFallback(buildShareableExperienceLink());
      setTitleShareStatus(copied ? 'Experience link copied to clipboard.' : 'Experience link generated.');
    } catch (error) {
      setTitleShareStatus(`Unable to build share link: ${error?.message || error}`);
    }
  });

  if (titleShareNative && !(navigator.share && typeof navigator.share === 'function')) titleShareNative.style.display = 'none';
  titleShareNative?.addEventListener('click', async () => {
    const link = buildShareableExperienceLink();
    const payload = { title: 'World Explorer 3D', text: 'Check out my World Explorer 3D experience.', url: link };
    try {
      if (navigator.share && typeof navigator.share === 'function') {
        await navigator.share(payload);
        setTitleShareStatus('Share completed.');
      } else {
        await copyShareLinkWithFallback(link);
        setTitleShareStatus('Link copied to clipboard.');
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      try {
        await copyShareLinkWithFallback(link);
        setTitleShareStatus('Share cancelled. Link copied to clipboard.');
      } catch (copyError) {
        setTitleShareStatus(`Unable to share link: ${copyError?.message || copyError}`);
      }
    }
  });

  titleShareFacebook?.addEventListener('click', async () => {
    const link = buildShareableExperienceLink();
    const opened = openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, () => setTitleShareStatus('Popup blocked. Link copied for manual share.'));
    if (!opened) await copyShareLinkWithFallback(link);
    else setTitleShareStatus('Opened Facebook share.');
  });

  titleShareTwitter?.addEventListener('click', async () => {
    const link = buildShareableExperienceLink();
    const text = 'Check out my World Explorer 3D experience.';
    const opened = openShareWindow(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`, () => setTitleShareStatus('Popup blocked. Link copied for manual share.'));
    if (!opened) await copyShareLinkWithFallback(link);
    else setTitleShareStatus('Opened Twitter share.');
  });

  titleShareText?.addEventListener('click', async () => {
    const link = buildShareableExperienceLink();
    const body = encodeURIComponent(`Check out my World Explorer 3D experience: ${link}`);
    const smsUrl = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? `sms:&body=${body}` : `sms:?body=${body}`;
    const opened = openShareWindow(smsUrl, () => setTitleShareStatus('Text share blocked. Link copied for manual share.'));
    if (!opened) await copyShareLinkWithFallback(link);
    else setTitleShareStatus('Opened text share.');
  });

  titleShareInstagram?.addEventListener('click', async () => {
    const link = buildShareableExperienceLink();
    await copyShareLinkWithFallback(link);
    openShareWindow('https://www.instagram.com/', () => setTitleShareStatus('Instagram blocked. Link copied for manual share.'));
    setTitleShareStatus('Link copied. Paste into Instagram DM, story, or bio.');
  });

  if (gameShareFloatBtn && gameShareMenu) {
    bindTouchFriendlyPress?.(gameShareFloatBtn, (event) => {
      event.stopPropagation();
      const shouldOpen = !gameShareMenu.classList.contains('show');
      closeAllFloatMenus?.();
      if (shouldOpen) gameShareMenu.classList.add('show');
    });
    gameShareMenu.addEventListener('click', (event) => event.stopPropagation());
  }

  if (gameShareNative && !(navigator.share && typeof navigator.share === 'function')) gameShareNative.style.display = 'none';
  gameShareCopy?.addEventListener('click', async (event) => {
    event.stopPropagation();
    try {
      await copyShareLinkWithFallback(buildShareableExperienceLink());
      setGameShareStatus('Link copied to clipboard.');
      setTimeout(() => closeGameShareMenu(), 900);
    } catch (error) {
      setGameShareStatus(`Could not copy link: ${error?.message || error}`);
    }
  });

  gameShareNative?.addEventListener('click', async (event) => {
    event.stopPropagation();
    const link = buildShareableExperienceLink();
    const payload = { title: 'World Explorer 3D', text: 'Check out my World Explorer 3D experience.', url: link };
    try {
      if (navigator.share && typeof navigator.share === 'function') {
        await navigator.share(payload);
        closeGameShareMenu();
      } else {
        await copyShareLinkWithFallback(link);
        setGameShareStatus('Link copied to clipboard.');
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      try {
        await copyShareLinkWithFallback(link);
        setGameShareStatus('Share cancelled. Link copied to clipboard.');
      } catch (copyError) {
        setGameShareStatus(`Unable to share link: ${copyError?.message || copyError}`);
      }
    }
  });

  gameShareFacebook?.addEventListener('click', async (event) => {
    event.stopPropagation();
    const link = buildShareableExperienceLink();
    const opened = openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`);
    if (!opened) {
      await copyShareLinkWithFallback(link);
      setGameShareStatus('Link copied. Paste manually if popup is blocked.');
      return;
    }
    closeGameShareMenu();
  });

  gameShareTwitter?.addEventListener('click', async (event) => {
    event.stopPropagation();
    const link = buildShareableExperienceLink();
    const text = 'Check out my World Explorer 3D experience.';
    const opened = openShareWindow(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`);
    if (!opened) {
      await copyShareLinkWithFallback(link);
      setGameShareStatus('Link copied. Paste manually if popup is blocked.');
      return;
    }
    closeGameShareMenu();
  });

  gameShareText?.addEventListener('click', async (event) => {
    event.stopPropagation();
    const link = buildShareableExperienceLink();
    const body = encodeURIComponent(`Check out my World Explorer 3D experience: ${link}`);
    const smsUrl = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? `sms:&body=${body}` : `sms:?body=${body}`;
    const opened = openShareWindow(smsUrl);
    if (!opened) {
      await copyShareLinkWithFallback(link);
      setGameShareStatus('Text app link blocked. Link copied for manual share.');
      return;
    }
    closeGameShareMenu();
  });

  gameShareInstagram?.addEventListener('click', async (event) => {
    event.stopPropagation();
    try {
      await copyShareLinkWithFallback(buildShareableExperienceLink());
      setGameShareStatus('Link copied. Paste into Instagram DM, Story, or bio.');
    } catch (_) {
      setGameShareStatus('Could not copy link automatically. Use the title-screen share button.');
    }
    openShareWindow('https://www.instagram.com/');
    setTimeout(() => closeGameShareMenu(), 2600);
  });

  return {
    applySharedRuntimeState,
    closeGameShareMenu,
    sharedExperienceParams: readSharedExperienceParams()
  };
}

export { initShareUi, readSharedExperienceParams };
