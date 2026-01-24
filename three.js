// Three.js engine initialization
import { state } from '../state.js';

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
                return true;
            }
        } catch(e) {
            console.warn('Failed context:', name, e);
        }
    }
    return false;
}

export function initThreeJS() {
    // Check WebGL support
    if (!checkWebGLSupport()) {
        alert('WebGL is not supported on this device.');
        return false;
    }
    
    // Scene
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x87ceeb);
    state.scene.fog = new THREE.FogExp2(0x9db4c8, 0.0008);
    
    // Camera
    state.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2500);
    
    // Renderer with fallbacks
    const rendererOptions = [
        { antialias: false, alpha: false, stencil: false, depth: true, powerPreference: 'default' },
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
    
    // Setup lighting and environment
    setupLighting();
    setupEnvironment();
    createSkyObjects();
    createGround();
    
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
    
    // Regular clouds
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
    
    // Large clouds
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
