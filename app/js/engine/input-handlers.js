import { createLifecycleScope } from '../runtime/lifecycle-scope.js?v=2';

export function setupEngineInputHandlers(appCtx) {
  const inputScope = createLifecycleScope('engine-input');
  const wrapYaw = (angle = 0) => Math.atan2(Math.sin(angle), Math.cos(angle));
  const gameplayKeys = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyX', 'KeyZ'
  ]);
  const isFormControl = (target) => !!target && (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)
  );

  inputScope.listen(globalThis, 'resize', () => {
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

  inputScope.listen(globalThis, 'keydown', (e) => {
    if (isFormControl(e.target)) return;
    if (appCtx.gameStarted && gameplayKeys.has(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat && appCtx.planeMode?.active && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      appCtx.registerPlaneTurnTap?.(e.code, e.timeStamp);
    }
    appCtx.keys[e.code] = true;
    appCtx.onKey(e.code, e);
  });
  inputScope.listen(globalThis, 'keyup', (e) => {
    appCtx.keys[e.code] = false;
  });
  const clearHeldInput = () => {
    appCtx.clearControlInputState?.('focus-lost');
    if (appCtx.spaceFlight?.keys) appCtx.spaceFlight.keys = {};
  };
  inputScope.listen(globalThis, 'blur', clearHeldInput);
  inputScope.listen(document, 'visibilitychange', () => {
    if (document.hidden) clearHeldInput();
  });

  let lastMouseX = 0;
  let lastMouseY = 0;
  let mouseActive = false;
  window.walkMouseLookActive = false;

  inputScope.listen(globalThis, 'mousedown', (e) => {
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

  inputScope.listen(globalThis, 'mouseup', (e) => {
    if (e.button === 2 || e.button === 1) {
      mouseActive = false;
    }
  });

  // Ranged explorer equipment uses the world canvas as its primary action.
  // UI controls, build mode, activities and panels retain their own input.
  inputScope.listen(globalThis, 'pointerdown', (e) => {
    if (e.button !== 0 || e.target !== appCtx.renderer?.domElement) return;
    if (!appCtx.gameStarted || appCtx.paused || appCtx.fishingGame?.open || appCtx.blockBuildMode) return;
    if (appCtx.Walk?.state?.mode !== 'walk' || appCtx.urbanSandboxRuntime?.equipmentOpen || appCtx.worldDiscoveryRuntime?.ui?.open) return;
    const category = appCtx.urbanSandboxRuntime?.equipment?.equipped?.()?.category;
    if (category !== 'sidearm' && category !== 'explosive') return;
    if (appCtx.handleUrbanEquipmentUse?.()) e.preventDefault();
  });

  inputScope.listen(globalThis, 'mousemove', (e) => {
    if (!appCtx.gameStarted) return;

    const walkLookActive = appCtx.Walk && appCtx.Walk.state.mode === 'walk' && window.walkMouseLookActive;
    if (!mouseActive && !walkLookActive) return;

    const deltaX = e.clientX - lastMouseX;
    const deltaY = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    const sensitivity = 0.005;
    if (appCtx.droneMode) {
      appCtx.drone.cameraYawOffset = wrapYaw((Number(appCtx.drone.cameraYawOffset) || 0) - deltaX * sensitivity);
      appCtx.drone.pitch += deltaY * sensitivity;
      appCtx.drone.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, appCtx.drone.pitch));
    } else if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') {
      appCtx.Walk.state.walker.lookYawOffset = wrapYaw((Number(appCtx.Walk.state.walker.lookYawOffset) || 0) - deltaX * sensitivity);
      appCtx.Walk.state.walker.pitch += deltaY * sensitivity;
      appCtx.Walk.state.walker.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, appCtx.Walk.state.walker.pitch));
    }
  });

  inputScope.listen(globalThis, 'contextmenu', (e) => {
    if (appCtx.gameStarted && (appCtx.droneMode || appCtx.Walk && appCtx.Walk.state.mode === 'walk')) {
      e.preventDefault();
    }
  });

  inputScope.listen(globalThis, 'click', (e) => {
    if (!appCtx.gameStarted) return;

    if (typeof appCtx.handleBlockBuilderClick === 'function' && appCtx.handleBlockBuilderClick(e)) {
      return;
    }
    if (appCtx.checkMoonClick(e.clientX, e.clientY)) return;
    appCtx.checkStarClick(e.clientX, e.clientY);
  });

  inputScope.listen(globalThis, 'touchend', (e) => {
    if (!appCtx.gameStarted) return;
    if (typeof appCtx.handleBlockBuilderClick !== 'function') return;
    if (!e.changedTouches || e.changedTouches.length === 0) return;
    const handled = appCtx.handleBlockBuilderClick(e);
    if (handled) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
  }, { passive: false });
  return inputScope;
}
