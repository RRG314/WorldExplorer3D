import { setupEngineInputHandlers } from "./input-handlers.js?v=6";
import { createVehicleHeadlightRig } from "./night-lighting.js?v=6";
import { applyDirectionalShadowPolicy } from "./shadow-policy.js?v=1";
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
  cloudCanvas.width = 128;
  cloudCanvas.height = 128;
  const cloudContext = cloudCanvas.getContext('2d');
  const cloudGradient = cloudContext.createRadialGradient(64, 62, 5, 64, 64, 62);
  cloudGradient.addColorStop(0, 'rgba(255,255,255,0.96)');
  cloudGradient.addColorStop(0.46, 'rgba(255,255,255,0.82)');
  cloudGradient.addColorStop(0.78, 'rgba(255,255,255,0.28)');
  cloudGradient.addColorStop(1, 'rgba(255,255,255,0)');
  cloudContext.fillStyle = cloudGradient;
  cloudContext.fillRect(0, 0, 128, 128);
  const cloudPixels = cloudContext.getImageData(0, 0, 128, 128);
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

  const cloudCount = gpuTier === 'low' ? 28 : 52;
  const cloudPositions = new Float32Array(cloudCount * 3);
  for (let i = 0; i < cloudCount; i++) {
    const cluster = Math.floor(i / 3);
    const clusterAngle = cluster * 2.399963229728653;
    const clusterRadius = 520 + (cluster % 9) * 230;
    cloudPositions[i * 3] = Math.cos(clusterAngle) * clusterRadius + (i % 3 - 1) * 72;
    cloudPositions[i * 3 + 1] = 320 + (cluster % 5) * 38 + (i % 3) * 9;
    cloudPositions[i * 3 + 2] = Math.sin(clusterAngle) * clusterRadius + ((i * 37) % 3 - 1) * 68;
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
  appCtx.carMesh = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xc31421,
    metalness: 0.45,
    roughness: 0.38,
    envMapIntensity: 0.6
  });
  state.carPaintMaterial = bodyMat;

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 3.5), bodyMat);
  body.position.y = 0.5;
  body.castShadow = true;
  appCtx.carMesh.add(body);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.5), bodyMat);
  roof.position.set(0, 0.95, -0.2);
  roof.castShadow = true;
  appCtx.carMesh.add(roof);

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x88ccff,
    metalness: 0.1,
    roughness: 0.05,
    envMapIntensity: 0.8,
    transparent: true,
    opacity: 0.4
  });
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 0.1), glassMat);
  windshield.position.set(0, 0.85, 0.55);
  windshield.rotation.x = -0.3;
  appCtx.carMesh.add(windshield);

  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.1 });
  const wheelPositions = [[-0.85, 0.35, 1.1], [0.85, 0.35, 1.1], [-0.85, 0.35, -1.1], [0.85, 0.35, -1.1]];
  appCtx.wheelMeshes = [];
  wheelPositions.forEach((pos) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(pos[0], pos[1], pos[2]);
    wheel.castShadow = true;
    appCtx.carMesh.add(wheel);
    appCtx.wheelMeshes.push(wheel);
  });

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffee,
    emissive: 0xffffaa,
    emissiveIntensity: 1.0,
    roughness: 0.1,
    metalness: 0.1
  });
  const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), headlightMat);
  hl1.userData.vehicleHeadlightLens = true;
  hl1.position.set(-0.55, 0.45, 1.76);
  appCtx.carMesh.add(hl1);
  const hl2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), headlightMat);
  hl2.userData.vehicleHeadlightLens = true;
  hl2.position.set(0.55, 0.45, 1.76);
  appCtx.carMesh.add(hl2);

  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0xff0000,
    emissiveIntensity: 0.8,
    roughness: 0.2,
    metalness: 0.1
  });
  const tl1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), tailMat);
  tl1.position.set(-0.55, 0.45, -1.76);
  appCtx.carMesh.add(tl1);
  const tl2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), tailMat);
  tl2.position.set(0.55, 0.45, -1.76);
  appCtx.carMesh.add(tl2);

  const carVisualYOffset = -1.1;
  appCtx.carMesh.children.forEach((child) => {
    if (child && child.position) child.position.y += carVisualYOffset;
  });
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
