import { createRenderInterpolator } from './render-interpolation.js?v=1';

function createCoreFrameSystems(appCtx, hooks = {}) {
  const renderInterpolator = createRenderInterpolator(appCtx);
  appCtx.getRenderInterpolationSnapshot = () => renderInterpolator.snapshot();
  appCtx.resetRenderInterpolation = () => renderInterpolator.reset();
  let hudTimer = 0;
  let mapTimer = 0;
  let lodTimer = 0;
  let weatherTimer = 0;
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
      fixedUpdate() {
        appCtx.updateControlInput?.();
      }
    },
    {
      id: 'core.simulation',
      owner: 'engine',
      phase: 'simulation',
      enabled: () => !!appCtx.gameStarted,
      fixedUpdate(frame) {
        renderInterpolator.beginFixedStep();
        appCtx.update(frame.fixedDelta);
        renderInterpolator.endFixedStep();
      }
    },
    {
      id: 'core.world',
      owner: 'world',
      phase: 'world',
      enabled: () => !!appCtx.gameStarted,
      update(frame) {
        appCtx.kickOptionalRuntimeBoot?.('main_loop');
        appCtx.updateEarthWorldStreaming?.(frame.dt);
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
        renderInterpolator.apply(frame.interpolation);
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
        const interval = appCtx.planeMode?.active ? 0.25 : appCtx.droneMode ? 0.16 : 0.1;
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
          appCtx.updateWorldLod?.(false);
          appCtx.enforceEnvironmentSceneOwnership?.();
        }
      }
    }
  ];
}

export { createCoreFrameSystems };
