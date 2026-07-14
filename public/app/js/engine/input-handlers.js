export function setupEngineInputHandlers(appCtx) {
  addEventListener('resize', () => {
    appCtx.camera.aspect = innerWidth / innerHeight;
    appCtx.camera.updateProjectionMatrix();
    appCtx.renderer.setSize(innerWidth, innerHeight);
    if (appCtx.composer) appCtx.composer.setSize(innerWidth, innerHeight);
    if (appCtx.ssaoPass && typeof appCtx.ssaoPass.setSize === 'function') {
      appCtx.ssaoPass.setSize(innerWidth, innerHeight);
    }
    if (appCtx.smaaPass) {
      const pixelRatio = appCtx.renderer.getPixelRatio();
      appCtx.smaaPass.setSize(innerWidth * pixelRatio, innerHeight * pixelRatio);
    }
  });

  addEventListener('keydown', (e) => {
    appCtx.keys[e.code] = true;
    appCtx.onKey(e.code, e);
  });
  addEventListener('keyup', (e) => {
    appCtx.keys[e.code] = false;
  });

  let lastMouseX = 0;
  let lastMouseY = 0;
  let mouseActive = false;
  window.walkMouseLookActive = false;

  addEventListener('mousedown', (e) => {
    if (!appCtx.gameStarted) return;

    if (e.button === 0 && appCtx.onMoon && appCtx.apollo11Flag) {
      const mouse = new THREE.Vector2();
      mouse.x = e.clientX / window.innerWidth * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, appCtx.camera);

      const intersects = raycaster.intersectObjects(appCtx.apollo11Flag.children, true);
      if (intersects.length > 0) {
        appCtx.showApollo11Info();
        return;
      }
    }

    if (e.button === 2 || e.button === 1) {
      mouseActive = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      e.preventDefault();
    }
  });

  addEventListener('mouseup', (e) => {
    if (e.button === 2 || e.button === 1) {
      mouseActive = false;
    }
  });

  addEventListener('mousemove', (e) => {
    if (!appCtx.gameStarted) return;

    const walkLookActive = appCtx.Walk && appCtx.Walk.state.mode === 'walk' && window.walkMouseLookActive;
    if (!mouseActive && !walkLookActive) return;

    const deltaX = e.clientX - lastMouseX;
    const deltaY = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    const sensitivity = 0.005;
    if (appCtx.droneMode) {
      appCtx.drone.cameraYawOffset = Math.max(
        -1.4,
        Math.min(1.4, (Number(appCtx.drone.cameraYawOffset) || 0) - deltaX * sensitivity)
      );
      appCtx.drone.pitch += deltaY * sensitivity;
      appCtx.drone.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, appCtx.drone.pitch));
    } else if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') {
      appCtx.Walk.state.walker.lookYawOffset = Math.max(
        -1.4,
        Math.min(1.4, (Number(appCtx.Walk.state.walker.lookYawOffset) || 0) - deltaX * sensitivity)
      );
      appCtx.Walk.state.walker.pitch += deltaY * sensitivity;
      appCtx.Walk.state.walker.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, appCtx.Walk.state.walker.pitch));
    }
  });

  addEventListener('contextmenu', (e) => {
    if (appCtx.gameStarted && (appCtx.droneMode || appCtx.Walk && appCtx.Walk.state.mode === 'walk')) {
      e.preventDefault();
    }
  });

  addEventListener('click', (e) => {
    if (!appCtx.gameStarted) return;

    if (typeof appCtx.handleBlockBuilderClick === 'function' && appCtx.handleBlockBuilderClick(e)) {
      return;
    }
    if (appCtx.checkMoonClick(e.clientX, e.clientY)) return;
    appCtx.checkStarClick(e.clientX, e.clientY);
  });

  addEventListener('touchend', (e) => {
    if (!appCtx.gameStarted) return;
    if (typeof appCtx.handleBlockBuilderClick !== 'function') return;
    if (!e.changedTouches || e.changedTouches.length === 0) return;
    const handled = appCtx.handleBlockBuilderClick(e);
    if (handled) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
  }, { passive: false });
}
