import { setupEngineInputHandlers } from "./input-handlers.js?v=11";
import { createVehicleHeadlightRig } from "./night-lighting.js?v=8";
import { createClassicUtilityCar } from './classic-utility-car.js?v=3';
import { applyDirectionalShadowPolicy } from "./shadow-policy.js?v=1";
import {
  buildEarthAtmosphereProfile,
  createEarthAtmosphereVisual
} from '../sky/earth-atmosphere.js?v=1';
import {
  recordStartupDiagnostic,
  showStartupDiagnostics,
  summarizeStartupError
} from "../startup-diagnostics.js?v=2";

function probeWebglContexts() {
  const canvas = document.createElement('canvas');
  const contextNames = ['webgl2', 'webgl', 'experimental-webgl'];
  const results = {
    hasWebGLRenderingContext: typeof globalThis.WebGLRenderingContext !== 'undefined',
    hasWebGL2RenderingContext: typeof globalThis.WebGL2RenderingContext !== 'undefined',
    contexts: []
  };

  contextNames.forEach((name) => {
    try {
      const context = canvas.getContext(name, {
        alpha: false,
        antialias: false,
        depth: true,
        stencil: false,
        failIfMajorPerformanceCaveat: false
      });
      results.contexts.push({
        name,
        ok: !!context,
        type: context ? Object.prototype.toString.call(context) : null
      });
    } catch (error) {
      results.contexts.push({
        name,
        ok: false,
        error: error?.message || String(error)
      });
    }
  });

  return results;
}

function buildManualRendererCandidates() {
  const sharedContextAttributes = {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: false
  };
  return [
    {
      label: 'manual-webgl2',
      contextName: 'webgl2',
      rendererOptions: {
        alpha: false,
        antialias: false,
        depth: true,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false
      },
      contextAttributes: sharedContextAttributes
    },
    {
      label: 'manual-webgl1',
      contextName: 'webgl',
      rendererOptions: {
        alpha: false,
        antialias: false,
        depth: true,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false,
        precision: 'mediump'
      },
      contextAttributes: sharedContextAttributes
    },
    {
      label: 'manual-experimental-webgl',
      contextName: 'experimental-webgl',
      rendererOptions: {
        alpha: false,
        antialias: false,
        depth: true,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false,
        precision: 'mediump'
      },
      contextAttributes: sharedContextAttributes
    }
  ];
}

function showInitFailure(alertText, loadingHtml) {
  const probe = probeWebglContexts();
  recordStartupDiagnostic("renderer", "showing init failure", { alertText, probe });
  const loading = document.getElementById('loading');
  if (loading) {
    loading.innerHTML = loadingHtml;
    loading.classList.add('show');
  }
  showStartupDiagnostics("Renderer startup failed");
}

function detectGpuTier(renderer) {
  let gpuTier = 'high';
  try {
    const debugExt = renderer.getContext().getExtension('WEBGL_debug_renderer_info');
    if (debugExt) {
      const gpuRenderer = renderer.getContext().getParameter(debugExt.UNMASKED_RENDERER_WEBGL).toLowerCase();
      const isMobile = /mobile|mali|adreno|powervr|apple gpu|sgx|tegra/.test(gpuRenderer);
      const isIntegrated = /intel|uhd|iris|hd graphics|mesa|swiftshader|llvmpipe/.test(gpuRenderer);
      if (isMobile || /swiftshader|llvmpipe/.test(gpuRenderer)) {
        gpuTier = 'low';
      } else if (isIntegrated) {
        gpuTier = 'mid';
      }
    }
    if (innerWidth * innerHeight < 500000) gpuTier = 'low';
  } catch {
    // Keep the optimistic default.
  }
  console.log('GPU tier:', gpuTier);
  return gpuTier;
}

function createRendererWithFallback() {
  const manualCandidates = buildManualRendererCandidates();
  for (let i = 0; i < manualCandidates.length; i++) {
    const candidate = manualCandidates[i];
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext(candidate.contextName, candidate.contextAttributes);
      recordStartupDiagnostic("renderer", `${candidate.label} context`, {
        contextName: candidate.contextName,
        ok: !!context
      });
      if (!context) continue;
      return new THREE.WebGLRenderer({
        canvas,
        context,
        ...candidate.rendererOptions
      });
    } catch (error) {
      recordStartupDiagnostic("renderer", `${candidate.label} failed`, summarizeStartupError(error));
      console.warn('Manual renderer candidate failed:', candidate.label, error);
    }
  }

  const rendererOptions = [
    {
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
      failIfMajorPerformanceCaveat: false
    },
    {
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
      failIfMajorPerformanceCaveat: false,
      precision: 'mediump'
    },
    {
      antialias: false,
      powerPreference: 'default',
      failIfMajorPerformanceCaveat: false
    },
    {
      failIfMajorPerformanceCaveat: false
    }
  ];

  for (let i = 0; i < rendererOptions.length; i++) {
    try {
      recordStartupDiagnostic("renderer", `renderer attempt ${i + 1}`, rendererOptions[i]);
      return new THREE.WebGLRenderer(rendererOptions[i]);
    } catch (error) {
      recordStartupDiagnostic("renderer", `renderer attempt ${i + 1} failed`, summarizeStartupError(error));
      console.warn('Renderer attempt', i + 1, 'failed:', error);
    }
  }
  recordStartupDiagnostic("renderer", "all renderer attempts failed");
  return null;
}

function addSkyVisuals(appCtx, gpuTier) {
  const initialAtmosphereProfile = buildEarthAtmosphereProfile(null, null, {
    phase: 'day',
    backgroundHex: 0x87ceeb
  });
  appCtx.earthAtmosphereProfile = initialAtmosphereProfile;
  appCtx.earthAtmosphere = createEarthAtmosphereVisual(initialAtmosphereProfile);
  if (appCtx.earthAtmosphere) appCtx.scene.add(appCtx.earthAtmosphere);

  appCtx.sunSphere = new THREE.Mesh(
    new THREE.SphereGeometry(40, 16, 8),
    new THREE.MeshBasicMaterial({ color: 0xffdd00, fog: false })
  );
  appCtx.sunSphere.position.set(500, 800, 200);
  appCtx.scene.add(appCtx.sunSphere);

  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(60, 12, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffee88,
      transparent: true,
      opacity: 0.3,
      fog: false
    })
  );
  sunGlow.position.copy(appCtx.sunSphere.position);
  appCtx.scene.add(sunGlow);
  appCtx.sunSphere.userData.glow = sunGlow;

  appCtx.moonSphere = new THREE.Mesh(
    new THREE.SphereGeometry(35, 16, 8),
    new THREE.MeshBasicMaterial({ color: 0xccccdd, fog: false })
  );
  appCtx.moonSphere.position.set(-500, 800, -200);
  appCtx.moonSphere.visible = false;
  appCtx.scene.add(appCtx.moonSphere);

  const moonGlow = new THREE.Mesh(
    new THREE.SphereGeometry(50, 12, 8),
    new THREE.MeshBasicMaterial({
      color: 0x9999bb,
      transparent: true,
      opacity: 0.2,
      fog: false
    })
  );
  moonGlow.position.copy(appCtx.moonSphere.position);
  moonGlow.visible = false;
  appCtx.scene.add(moonGlow);
  appCtx.moonSphere.userData.glow = moonGlow;

  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 256;
  cloudCanvas.height = 256;
  const cloudContext = cloudCanvas.getContext('2d');
  // Keep clouds under the existing sky owner, but give each point an
  // asymmetric multi-lobe silhouette instead of the previous circular disc.
  // These dimensions are artistic presentation values, not weather measures.
  const cloudLobes = [
    [70, 143, 47, 0.56],
    [104, 124, 58, 0.72],
    [145, 116, 66, 0.78],
    [185, 139, 50, 0.58],
    [127, 153, 73, 0.64]
  ];
  for (const [x, y, radius, alpha] of cloudLobes) {
    const cloudGradient = cloudContext.createRadialGradient(x, y, radius * 0.08, x, y, radius);
    cloudGradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    cloudGradient.addColorStop(0.5, `rgba(255,255,255,${alpha * 0.82})`);
    cloudGradient.addColorStop(0.82, `rgba(255,255,255,${alpha * 0.24})`);
    cloudGradient.addColorStop(1, 'rgba(255,255,255,0)');
    cloudContext.fillStyle = cloudGradient;
    cloudContext.fillRect(0, 0, cloudCanvas.width, cloudCanvas.height);
  }
  const cloudPixels = cloudContext.getImageData(0, 0, cloudCanvas.width, cloudCanvas.height);
  for (let i = 3; i < cloudPixels.data.length; i += 4) {
    if (cloudPixels.data[i] === 0) continue;
    const dither = ((i * 17) % 9) - 4;
    cloudPixels.data[i] = Math.max(0, Math.min(255, cloudPixels.data[i] + dither));
  }
  cloudContext.putImageData(cloudPixels, 0, 0);
  const cloudTexture = new THREE.CanvasTexture(cloudCanvas);
  cloudTexture.colorSpace = THREE.SRGBColorSpace;

  appCtx.cloudGroup = new THREE.Group();
  const cloudMat = new THREE.PointsMaterial({
    color: 0xffffff,
    map: cloudTexture,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    alphaTest: 0.015,
    size: gpuTier === 'low' ? 110 : 135,
    sizeAttenuation: true,
    fog: true
  });

  const cloudCount = gpuTier === 'low' ? 22 : 36;
  const cloudPositions = new Float32Array(cloudCount * 3);
  for (let i = 0; i < cloudCount; i++) {
    const angle = i * 2.399963229728653;
    const radius = 540 + (i % 10) * 205;
    cloudPositions[i * 3] = Math.cos(angle) * radius;
    cloudPositions[i * 3 + 1] = 350 + (i % 6) * 41;
    cloudPositions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const cloudGeometry = new THREE.BufferGeometry();
  cloudGeometry.setAttribute('position', new THREE.BufferAttribute(cloudPositions, 3));
  const cloudField = new THREE.Points(cloudGeometry, cloudMat);
  cloudField.frustumCulled = false;
  cloudField.renderOrder = -10;
  appCtx.cloudGroup.add(cloudField);

  appCtx.cloudGroup.userData.sharedMaterial = cloudMat;
  appCtx.cloudGroup.userData.sharedTexture = cloudTexture;
  appCtx.cloudGroup.userData.weatherDeck = null;
  appCtx.cloudGroup.userData.weatherDeckMaterial = null;
  appCtx.scene.add(appCtx.cloudGroup);

  appCtx.starField = appCtx.createStarField();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10000, 10000),
    new THREE.MeshStandardMaterial({ color: 0x4a7a2e, roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  ground.userData.isGroundPlane = true;
  ground.userData.isLoadingPlaceholder = true;
  appCtx.groundFallbackMesh = ground;
  appCtx.showGroundFallbackPlaceholder = () => {
    const parent = appCtx.earthSceneRoot || appCtx.scene;
    if (!ground.parent && parent) parent.add(ground);
    ground.visible = true;
    return true;
  };
  appCtx.suppressGroundFallbackPlaceholder = () => {
    ground.visible = false;
    ground.parent?.remove?.(ground);
    return true;
  };
  appCtx.retireGroundFallbackPlaceholder = () => {
    const hasReadyTerrain = (appCtx.terrainGroup?.children || []).some((mesh) =>
      mesh?.userData?.isTerrainMesh && mesh.userData.pendingTerrainTile === false
    );
    if (!hasReadyTerrain) return false;
    ground.visible = false;
    ground.parent?.remove?.(ground);
    return true;
  };
  appCtx.scene.add(ground);
}

function createDefaultCarMesh(ctx) {
  const { appCtx, state } = ctx;
  const visual = createClassicUtilityCar(THREE);
  appCtx.carMesh = visual.car;
  appCtx.wheelMeshes = visual.wheels;
  state.carPaintMaterial = visual.paintMaterial;
  createVehicleHeadlightRig(appCtx.carMesh);

  appCtx.scene.add(appCtx.carMesh);
  appCtx.carMesh.castShadow = true;
  appCtx.carMesh.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = false;
    }
  });
}

function initWalkingModule(appCtx) {
  try {
    appCtx.Walk = appCtx.createWalkingModule({
      THREE,
      scene: appCtx.scene,
      camera: appCtx.camera,
      keys: appCtx.keys,
      car: appCtx.car,
      carMesh: appCtx.carMesh,
      getBuildingsArray: () => appCtx.buildings,
      getNearbyBuildings: (x, z, radius) =>
        typeof appCtx.getNearbyBuildings === 'function'
          ? appCtx.getNearbyBuildings(x, z, radius)
          : appCtx.buildings,
      isPointInPolygon: appCtx.pointInPolygon
    });
    window.Walk = appCtx.Walk;
    appCtx.Walk.setModeWalk();
  } catch (error) {
    console.error('Walking module initialization failed:', error);
    console.error('Stack:', error.stack);
  }
}

export function initEngineRuntime(ctx) {
  const { appCtx, state } = ctx;
  recordStartupDiagnostic("renderer", "initEngineRuntime start");
  appCtx.engineInitFailed = false;
  appCtx.scene = new THREE.Scene();
  appCtx.scene.background = new THREE.Color(0x87ceeb);
  appCtx.scene.fog = new THREE.FogExp2(0xb8d4e8, 0.00035);
  appCtx.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.5, 12000);

  appCtx.renderer = createRendererWithFallback();
  if (!appCtx.renderer) {
    appCtx.engineInitFailed = true;
    showInitFailure(
      'Failed to create 3D renderer. Please try reloading this page or enabling hardware acceleration in your browser settings.',
      '<div style="color:#f66;padding:40px;text-align:center;">Renderer Creation Failed<br><br>The 3D renderer could not start.<br><br>Startup diagnostics are shown at the bottom of the page.</div>'
    );
    return false;
  }

  try {
    const gl = appCtx.renderer.getContext?.();
    const debugInfo = gl?.getExtension?.('WEBGL_debug_renderer_info');
    if (debugInfo) gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    recordStartupDiagnostic("renderer", "renderer created", {
      hasContext: !!gl,
      hasDebugInfo: !!debugInfo
    });
  } catch (error) {
    recordStartupDiagnostic("renderer", "gpu info lookup failed", summarizeStartupError(error));
    console.warn('Could not get GPU info:', error);
  }

  appCtx.renderer.setSize(innerWidth, innerHeight);
  try {
    appCtx.renderer.info.autoReset = false;
  } catch {
    // Ignore unsupported renderer.info configurations.
  }

  state.currentGpuTier = detectGpuTier(appCtx.renderer);
  const pixelRatioCap = state.currentGpuTier === 'high' ? 1.5 : state.currentGpuTier === 'mid' ? 1.25 : 1;
  appCtx.renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));

  try {
    appCtx.renderer.physicallyCorrectLights = true;
  } catch {
    console.warn('Physically correct lights not supported');
  }
  try {
    appCtx.renderer.outputEncoding = THREE.sRGBEncoding;
  } catch {
    console.warn('sRGB encoding not supported');
  }
  try {
    appCtx.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    appCtx.renderer.toneMappingExposure = 0.9;
  } catch {
    console.warn('Tone mapping not supported');
  }
  try {
    appCtx.renderer.shadowMap.enabled = true;
    appCtx.renderer.shadowMap.type = state.currentGpuTier === 'low' ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  } catch {
    console.warn('Shadows not supported, trying basic');
    try {
      appCtx.renderer.shadowMap.enabled = true;
      appCtx.renderer.shadowMap.type = THREE.BasicShadowMap;
    } catch {
      console.warn('Shadows not supported at all');
    }
  }

  document.body.prepend(appCtx.renderer.domElement);

  const savedRenderQuality = ctx.readStorage(ctx.RENDER_QUALITY_STORAGE_KEY);
  const savedSsao = ctx.readStorage(ctx.SSAO_STORAGE_KEY);
  const initialRenderQuality = savedRenderQuality
    ? ctx.normalizeRenderQualityLevel(savedRenderQuality)
    : ctx.isLikelyMobileDevice() || state.currentGpuTier === 'low'
      ? ctx.RENDER_QUALITY_LOW
      : ctx.RENDER_QUALITY_MED;
  state.renderQualityLevel = initialRenderQuality;
  appCtx.renderQualityLevel = initialRenderQuality;
  ctx.setSsaoEnabled(savedSsao === '1', { persist: false });

  if (!ctx.setupPostProcessingPipeline()) {
    console.log('Post-processing skipped (GPU tier: ' + state.currentGpuTier + ')');
  }

  try {
    ctx.initEngineTextures(appCtx.renderer);
  } catch (error) {
    console.error('Texture creation failed:', error);
    ctx.syncTextureGlobals();
  }

  try {
    appCtx.pmremGenerator = new THREE.PMREMGenerator(appCtx.renderer);
    appCtx.pmremGenerator.compileEquirectangularShader();
    state.fallbackEnvMap = ctx.createProceduralEnvironmentMap(appCtx.pmremGenerator);
    if (state.renderQualityLevel === ctx.RENDER_QUALITY_LOW) {
      appCtx.scene.environment = state.fallbackEnvMap || null;
    } else {
      ctx.ensureHdrEnvironment();
    }
  } catch (error) {
    console.warn('PMREM initialization failed (non-critical):', error);
  }

  appCtx.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x545454, 0.4);
  appCtx.scene.add(appCtx.hemiLight);

  appCtx.sun = new THREE.DirectionalLight(0xfff5e1, 1.2);
  appCtx.sun.position.set(100, 150, 50);
  appCtx.scene.add(appCtx.sun);
  appCtx.scene.add(appCtx.sun.target);
  applyDirectionalShadowPolicy(appCtx, {
    gpuTier: state.currentGpuTier,
    quality: state.renderQualityLevel
  });

  appCtx.fillLight = new THREE.DirectionalLight(0x9db4ff, 0.3);
  appCtx.fillLight.position.set(-50, 50, -50);
  appCtx.scene.add(appCtx.fillLight);
  appCtx.scene.add(appCtx.fillLight.target);

  appCtx.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  appCtx.scene.add(appCtx.ambientLight);

  ctx.setRenderQualityLevel(initialRenderQuality, { persist: false });
  addSkyVisuals(appCtx, state.currentGpuTier);

  try {
    createDefaultCarMesh(ctx);
  } catch (error) {
    console.error('Car creation failed:', error);
    alert('Failed to create 3D car model. The game may not work properly.');
    return;
  }

  initWalkingModule(appCtx);
  appCtx.skyRaycaster = new THREE.Raycaster();
  appCtx.skyRaycaster.far = 10000;
  setupEngineInputHandlers(appCtx);
  return true;
}
