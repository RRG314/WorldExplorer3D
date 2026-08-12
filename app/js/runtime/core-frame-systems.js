function createCoreFrameSystems(appCtx, hooks = {}) {
  appCtx.presentationPose = null;
  let hudTimer = 0;
  let mapTimer = 0;
  let lodTimer = 0;
  let weatherTimer = 0;
  let weatherUiTimer = 0;
  let boatTimer = 0;
  let liveEarthTimer = 0;
  const workspaceOpen = () => hooks.isEditorWorkspaceOpen?.() || hooks.isActivityCreatorOpen?.();

  return [
    {
      id: 'core.frame-metrics',
      owner: 'engine',
      phase: 'input',
      priority: -100,
      update(frame) {
        appCtx.lastTime = frame.timestamp;
        appCtx.recordPerfFrame?.(frame.dt);
        appCtx.tutorialUpdate?.(frame.dt);
        if (appCtx.renderer?.info?.autoReset === false) appCtx.renderer.info.reset?.();
      }
    },
    {
      id: 'core.input',
      owner: 'engine',
      phase: 'input',
      enabled: () => !!appCtx.gameStarted,
      update() {
        appCtx.updateControlInput?.();
      }
    },
    {
      id: 'core.simulation',
      owner: 'engine',
      phase: 'simulation',
      enabled: () => !!appCtx.gameStarted,
      update(frame) {
        appCtx.update(frame.dt);
      }
    },
    {
      id: 'core.world',
      owner: 'world',
      phase: 'world',
      enabled: () => !!appCtx.gameStarted,
      update(frame) {
        appCtx.kickOptionalRuntimeBoot?.('main_loop');
        appCtx.updatePlanetaryTracks?.();
        if (!appCtx.onMars) appCtx.refreshAstronomicalSky?.(false);
        appCtx.updateWaterWaveVisuals?.();

        weatherTimer += frame.dt;
        if (weatherTimer > 5) {
          weatherTimer = 0;
          if (!appCtx.onMoon && !appCtx.onMars) void appCtx.refreshLiveWeather?.(false);
        }

        boatTimer += frame.dt;
        const interval = appCtx.boatMode?.active ? 0.85 : appCtx.planeMode?.active ? 1.2 : appCtx.droneMode ? 0.65 : 0.25;
        if (boatTimer > interval) {
          boatTimer = 0;
          appCtx.refreshBoatAvailability?.(false);
        }
      }
    },
    {
      id: 'core.camera',
      owner: 'camera',
      phase: 'camera',
      enabled: () => !!appCtx.gameStarted,
      update(frame) {
        appCtx.updateCamera(frame.dt);
        appCtx.updatePlanetarySky?.();
      }
    },
    {
      id: 'platform.activities',
      owner: 'platform',
      phase: 'camera',
      priority: 20,
      enabled: () => !!appCtx.gameStarted,
      update(frame) {
        appCtx.updateActivityCreator?.(frame.dt, frame.timestamp);
        appCtx.updateActivityDiscovery?.(frame.dt, frame.timestamp);
        appCtx.liveEarth?.updateFrame?.(frame.dt);

        liveEarthTimer += frame.dt;
        if (liveEarthTimer > 4) {
          liveEarthTimer = 0;
          appCtx.liveEarth?.updateSelectorFrame?.();
        }
      }
    },
    {
      id: 'core.presentation',
      owner: 'presentation',
      phase: 'presentation',
      enabled: () => !!appCtx.gameStarted,
      update(frame) {
        weatherUiTimer += frame.dt;
        if (weatherUiTimer >= 1) {
          weatherUiTimer %= 1;
          appCtx.updateWeatherUi?.();
        }
        hudTimer += frame.dt;
        if (hudTimer > 0.066) {
          hudTimer = 0;
          frame.flags.hudRefreshed = true;
          if (!workspaceOpen()) {
            appCtx.updateHUD();
            hooks.positionTopOverlays?.();
          }
        }

        mapTimer += frame.dt;
        // Five updates per second keeps the navigation display responsive
        // without rebuilding every vector layer ten times per second.
        const interval = appCtx.planeMode?.active ? 0.25 : 0.2;
        if (mapTimer > interval) {
          mapTimer = 0;
          if (!workspaceOpen()) {
            appCtx.drawMinimap();
            if (appCtx.showLargeMap) appCtx.drawLargeMap();
          }
        }

        lodTimer += frame.dt;
        if (lodTimer > 0.2) {
          lodTimer = 0;
          appCtx.enforceEnvironmentSceneOwnership?.();
        }
      }
    }
  ];
}

export { createCoreFrameSystems };
