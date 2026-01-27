// Three.js engine initialization and 3D rendering
import { state } from './state.js';
import { PHYSICS_CONFIG } from './config.js';

// ===== PROCEDURAL TEXTURES =====
export function createAsphaltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2000; i++) {
        const x = Math.random() * 256, y = Math.random() * 256;
        const brightness = 20 + Math.random() * 40;
        ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
        ctx.fillRect(x, y, 1.5, 1.5);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
}

export function createAsphaltNormal() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) {
        const x = Math.random() * 128, y = Math.random() * 128;
        ctx.fillStyle = `rgb(${120 + Math.random() * 20}, ${120 + Math.random() * 20}, ${230 + Math.random() * 25})`;
        ctx.fillRect(x, y, 2, 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
}

export function createRoughnessMap() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 800; i++) {
        const x = Math.random() * 128;
        const y = Math.random() * 128;
        const brightness = 200 + Math.random() * 55;
        ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
        ctx.fillRect(x, y, 2, 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    return texture;
}

export function createWindowTexture(baseColor) {
    if (state.windowTextures[baseColor]) return state.windowTextures[baseColor];

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 64, 256);
    const ww = 10, wh = 12, spacing = 3;
    for (let floor = 0; floor < 18; floor++) {
        for (let col = 0; col < 4; col++) {
            const x = col * (ww + spacing) + spacing;
            const y = floor * (wh + spacing) + spacing;
            ctx.fillStyle = Math.random() > 0.3 ? `rgba(255, 220, 150, ${0.6 + Math.random() * 0.4})` : 'rgba(20, 30, 40, 0.8)';
            ctx.fillRect(x, y, ww, wh);
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    state.windowTextures[baseColor] = texture;
    return texture;
}

// ===== WEBGL SUPPORT CHECK =====
export function checkWebGLSupport() {
    const canvas = document.createElement('canvas');
    const contextNames = ['webgl2', 'webgl', 'experimental-webgl', 'webkit-3d', 'moz-webgl'];

    for (const name of contextNames) {
        try {
            const gl = canvas.getContext(name, {
                alpha: false,
                antialias: false,
                stencil: false,
                depth: true,
                premultipliedAlpha: true,
                preserveDrawingBuffer: false,
                powerPreference: 'default',
                failIfMajorPerformanceCaveat: false
            });
            if (gl) {
                console.log('✓ WebGL context:', name);
                return gl;
            }
        } catch(e) {
            console.warn('Failed context:', name, e);
        }
    }
    return null;
}

// ===== INITIALIZE THREE.JS =====
export function initThreeJS() {
    const gl = checkWebGLSupport();

    if (!gl) {
        alert('WebGL is not supported on this device. Please try:\n1. Updating your graphics drivers\n2. Enabling hardware acceleration in browser settings\n3. Using a different browser (Chrome/Firefox)');
        return false;
    }

    // Log GPU info
    try {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            const gpuInfo = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            console.log('GPU:', gpuInfo);
        }
    } catch(e) {
        console.warn('Could not get GPU info:', e);
    }

    // Scene
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x87ceeb);
    state.scene.fog = new THREE.FogExp2(0x9db4c8, 0.0008);

    // Camera
    state.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2500);

    // Renderer with fallbacks
    const rendererOptions = [
        { antialias: false, alpha: false, stencil: false, depth: true, powerPreference: 'default', failIfMajorPerformanceCaveat: false, precision: 'lowp' },
        { antialias: false, powerPreference: 'default', failIfMajorPerformanceCaveat: false },
        { failIfMajorPerformanceCaveat: false }
    ];

    for (const options of rendererOptions) {
        try {
            state.renderer = new THREE.WebGLRenderer(options);
            console.log('✓ Renderer created');
            break;
        } catch(e) {
            console.warn('Renderer attempt failed:', e);
        }
    }

    if (!state.renderer) {
        alert('Failed to create 3D renderer');
        return false;
    }

    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.setPixelRatio(1);

    // Advanced features with fallbacks
    try { state.renderer.outputEncoding = THREE.sRGBEncoding; } catch(e) {}
    try { state.renderer.toneMapping = THREE.ACESFilmicToneMapping; state.renderer.toneMappingExposure = 0.9; } catch(e) {}
    try { state.renderer.shadowMap.enabled = true; state.renderer.shadowMap.type = THREE.PCFSoftShadowMap; } catch(e) {}

    document.body.prepend(state.renderer.domElement);

    // Create textures
    try {
        state.asphaltTex = createAsphaltTexture();
        state.asphaltNormal = createAsphaltNormal();
        state.asphaltRoughness = createRoughnessMap();
        console.log('✓ PBR textures created');
    } catch(e) {
        console.error('Texture creation failed:', e);
    }

    // Setup scene
    setupLighting();
    setupEnvironment();
    createSkyObjects();
    createGround();
    createCar();

    // Handle window resize
    window.addEventListener('resize', () => {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return true;
}

function setupLighting() {
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x545454, 0.4);
    state.scene.add(hemiLight);

    const sun = new THREE.DirectionalLight(0xfff5e1, 1.2);
    sun.position.set(100, 150, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    sun.shadow.bias = -0.0001;
    sun.shadow.normalBias = 0.02;
    state.scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0x9db4ff, 0.3);
    fillLight.position.set(-50, 50, -50);
    state.scene.add(fillLight);

    state.scene.add(new THREE.AmbientLight(0xffffff, 0.3));
}

function setupEnvironment() {
    try {
        const pmremGenerator = new THREE.PMREMGenerator(state.renderer);
        pmremGenerator.compileEquirectangularShader();

        const rgbeLoader = new THREE.RGBELoader();
        rgbeLoader.setDataType(THREE.UnsignedByteType);

        rgbeLoader.load(
            'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_06_1k.hdr',
            (hdrTexture) => {
                hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
                const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
                state.scene.environment = envMap;
                hdrTexture.dispose();
                pmremGenerator.dispose();
                console.log('✓ HDR environment loaded');
            },
            undefined,
            (error) => {
                console.warn('HDR load failed, using fallback');
                createFallbackEnvironment(pmremGenerator);
            }
        );
    } catch(e) {
        console.warn('HDR environment failed:', e);
    }
}

function createFallbackEnvironment(pmremGenerator) {
    try {
        const envScene = new THREE.Scene();
        const envGeo = new THREE.SphereGeometry(100, 8, 8);
        const envMat = new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide });
        const envMesh = new THREE.Mesh(envGeo, envMat);
        envScene.add(envMesh);
        const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
        state.scene.environment = envMap;
        pmremGenerator.dispose();
    } catch(e) {
        console.warn('Fallback environment failed:', e);
    }
}

function createSkyObjects() {
    // Sun
    const sunSphere = new THREE.Mesh(
        new THREE.SphereGeometry(40, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0xffdd00, fog: false })
    );
    sunSphere.position.set(500, 800, 200);
    state.scene.add(sunSphere);

    const sunGlow = new THREE.Mesh(
        new THREE.SphereGeometry(60, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.3, fog: false })
    );
    sunGlow.position.copy(sunSphere.position);
    state.scene.add(sunGlow);

    // Clouds
    const cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        roughness: 1,
        metalness: 0
    });

    for (let i = 0; i < 100; i++) {
        const cloud = new THREE.Group();
        const numPuffs = 4 + Math.floor(Math.random() * 4);
        for (let j = 0; j < numPuffs; j++) {
            const size = 12 + Math.random() * 10;
            const sphere = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), cloudMat);
            sphere.position.set(
                (Math.random() - 0.5) * 35,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 35
            );
            cloud.add(sphere);
        }
        cloud.position.set(
            (Math.random() - 0.5) * 4000,
            300 + Math.random() * 200,
            (Math.random() - 0.5) * 4000
        );
        cloudGroup.add(cloud);
    }

    for (let i = 0; i < 15; i++) {
        const largeCloud = new THREE.Group();
        const numPuffs = 10 + Math.floor(Math.random() * 8);
        for (let j = 0; j < numPuffs; j++) {
            const size = 25 + Math.random() * 25;
            const sphere = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 10), cloudMat);
            sphere.position.set(
                (Math.random() - 0.5) * 80,
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 80
            );
            largeCloud.add(sphere);
        }
        largeCloud.position.set(
            (Math.random() - 0.5) * 5000,
            350 + Math.random() * 150,
            (Math.random() - 0.5) * 5000
        );
        cloudGroup.add(largeCloud);
    }

    state.scene.add(cloudGroup);
}

function createGround() {
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(10000, 10000),
        new THREE.MeshStandardMaterial({ color: 0x3a5a3f, roughness: 0.95, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    state.scene.add(ground);
}

function createCar() {
    try {
        state.carMesh = new THREE.Group();

        // Realistic car paint with clearcoat
        const bodyMat = new THREE.MeshPhysicalMaterial({
            color: 0xff3366,
            metalness: 0.9,
            roughness: 0.2,
            clearcoat: 1.0,
            clearcoatRoughness: 0.03,
            envMapIntensity: 1.5,
            reflectivity: 1.0
        });

        const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 3.5), bodyMat);
        body.position.y = 0.5;
        body.castShadow = true;
        body.receiveShadow = true;
        state.carMesh.add(body);

        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.5), bodyMat);
        roof.position.set(0, 0.95, -0.2);
        roof.castShadow = true;
        state.carMesh.add(roof);

        // Realistic glass
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0.0,
            roughness: 0.05,
            transmission: 0.9,
            thickness: 0.5,
            ior: 1.5,
            envMapIntensity: 1.0,
            transparent: true,
            opacity: 1.0
        });

        const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 0.1), glassMat);
        windshield.position.set(0, 0.85, 0.55);
        windshield.rotation.x = -0.3;
        state.carMesh.add(windshield);

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.1 });
        const wheelPositions = [[-0.85, 0.35, 1.1], [0.85, 0.35, 1.1], [-0.85, 0.35, -1.1], [0.85, 0.35, -1.1]];
        state.wheelMeshes = [];
        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(pos[0], pos[1], pos[2]);
            wheel.castShadow = true;
            state.carMesh.add(wheel);
            state.wheelMeshes.push(wheel);
        });

        // Headlights
        const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffaa, emissiveIntensity: 1.0, roughness: 0.1, metalness: 0.1 });
        const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), lightMat);
        hl1.position.set(-0.55, 0.45, 1.76);
        state.carMesh.add(hl1);
        const hl2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), lightMat);
        hl2.position.set(0.55, 0.45, 1.76);
        state.carMesh.add(hl2);

        // Taillights
        const tailMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.1 });
        const tl1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), tailMat);
        tl1.position.set(-0.55, 0.45, -1.76);
        state.carMesh.add(tl1);
        const tl2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), tailMat);
        tl2.position.set(0.55, 0.45, -1.76);
        state.carMesh.add(tl2);

        state.scene.add(state.carMesh);
        console.log('✓ Car created with Physical materials');
    } catch(e) {
        console.error('Car creation failed:', e);
    }
}

// ===== RENDER LOOP =====
export function renderLoop(t = 0) {
    requestAnimationFrame(renderLoop);
    const dt = Math.min((t - state.lastTime) / 1000, 0.1);
    state.lastTime = t;

    if (state.renderer && state.scene && state.camera) {
        state.renderer.render(state.scene, state.camera);
    }
}
