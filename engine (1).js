// ============================================================================
// engine.js - Three.js initialization, renderer, scene, lighting, car mesh
// ============================================================================

// Textures will be created in init()
let asphaltTex, asphaltNormal, asphaltRoughness, windowTextures = {};

// ===== PROCEDURAL TEXTURES =====
function createAsphaltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; // Reduced from 512 for compatibility
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(0, 0, 256, 256);
    // Reduced particle count for performance
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

function createAsphaltNormal() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; // Reduced from 256
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8080ff'; ctx.fillRect(0, 0, 128, 128);
    // Reduced particle count for performance
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

function createRoughnessMap() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    // Asphalt is rough - base level
    ctx.fillStyle = '#e0e0e0'; // High roughness
    ctx.fillRect(0, 0, 128, 128);
    // Add variation
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

function createWindowTexture(baseColor) {
    // Cache textures to avoid recreating them
    if (windowTextures[baseColor]) return windowTextures[baseColor];

    const canvas = document.createElement('canvas');
    canvas.width = 64; // Reduced from 128
    canvas.height = 256; // Reduced from 512
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = baseColor; ctx.fillRect(0, 0, 64, 256);
    const ww = 10, wh = 12, spacing = 3; // Smaller windows
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
    windowTextures[baseColor] = texture;
    return texture;
}

const CFG = {
    maxSpd: 120, offMax: 60, accel: 25, boostAccel: 45, brake: 150, friction: 25, offFriction: 120,
    boostMax: 140, boostDur: 2.5,
    brakeForce: 2.5,     // Realistic braking
    // Grip settings - realistic car physics
    gripRoad: 0.88,      // Normal road grip - realistic
    gripOff: 0.70,       // Off-road grip
    gripBrake: 0.60,     // Grip while braking
    gripDrift: 0.45,     // Grip while drifting
    driftRec: 6,         // Car realignment speed
    // Turn settings - realistic steering
    turnLow: 1.8,        // Turn rate at low speed - more realistic
    turnHigh: 0.8,       // Turn rate at high speed - realistic
    turnMin: 30,         // Speed where turn rate starts reducing
    // Road boundary settings
    roadForce: 0.93,     // How much car slows when leaving road (strong)
    roadPushback: 0.3,   // How much car is pushed back toward road
    maxOffDist: 15,      // Max distance off road before strong pushback
    cpRadius: 25, trialTime: 120, policeSpd: 140, policeAccel: 60, policeDist: 800
};

function init() {
    // === WEBGL COMPATIBILITY CHECK ===
    const canvas = document.createElement('canvas');
    let gl = null;
    const contextNames = ['webgl2', 'webgl', 'experimental-webgl', 'webkit-3d', 'moz-webgl'];

    for (let i = 0; i < contextNames.length; i++) {
        try {
            gl = canvas.getContext(contextNames[i], {
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
                // Debug log removed
                break;
            }
        } catch(e) {
            console.warn('Failed context:', contextNames[i], e);
        }
    }

    if (!gl) {
        alert('WebGL is not supported on this device. Please try:\n1. Updating your graphics drivers\n2. Enabling hardware acceleration in browser settings\n3. Using a different browser (Chrome/Firefox)');
        document.getElementById('loading').innerHTML = '<div style="color:#f66;padding:40px;text-align:center;">WebGL Not Supported<br><br>Please update your graphics drivers or try a different browser.</div>';
        return;
    }

    // Log GPU info
    try {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            const gpuInfo = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            // Debug log removed
        }
    } catch(e) {
        console.warn('Could not get GPU info:', e);
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0xb8d4e8, 200, 2500);

    // Camera - tighter near/far ratio improves depth precision.
    // Stars are at r=5000 so far must cover that. logarithmicDepthBuffer (below)
    // compensates for the wide range.
    camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.5, 12000);

    // === RENDERER WITH MAXIMUM COMPATIBILITY ===
    let rendererCreated = false;
    const rendererOptions = [
        // Try 1: Logarithmic depth buffer for z-fighting prevention
        {
            antialias: false,
            alpha: false,
            stencil: false,
            depth: true,
            logarithmicDepthBuffer: true,
            premultipliedAlpha: true,
            preserveDrawingBuffer: false,
            powerPreference: 'default',
            failIfMajorPerformanceCaveat: false,
            precision: 'mediump'
        },
        // Try 2: Without logarithmic depth (fallback)
        {
            antialias: false,
            alpha: false,
            stencil: false,
            depth: true,
            premultipliedAlpha: true,
            preserveDrawingBuffer: false,
            powerPreference: 'default',
            failIfMajorPerformanceCaveat: false,
            precision: 'mediump'
        },
        // Try 3: Even more basic
        {
            antialias: false,
            powerPreference: 'default',
            failIfMajorPerformanceCaveat: false
        },
        // Try 4: Absolute minimum
        {
            failIfMajorPerformanceCaveat: false
        }
    ];

    for (let i = 0; i < rendererOptions.length && !rendererCreated; i++) {
        try {
            // Debug log removed
            renderer = new THREE.WebGLRenderer(rendererOptions[i]);
            rendererCreated = true;
            // Debug log removed
        } catch(e) {
            console.warn('Renderer attempt', i + 1, 'failed:', e);
        }
    }

    if (!rendererCreated || !renderer) {
        alert('Failed to create 3D renderer. Your graphics card may not support WebGL properly.');
        document.getElementById('loading').innerHTML = '<div style="color:#f66;padding:40px;text-align:center;">Renderer Creation Failed<br><br>Your GPU may not support the required features.</div>';
        return;
    }

    renderer.setSize(innerWidth, innerHeight);
    // Keep pixel ratio at 1 for Chromebook performance
    renderer.setPixelRatio(1);

    // Try advanced features with fallbacks
    try {
        renderer.outputEncoding = THREE.sRGBEncoding;
        // Debug log removed
    } catch(e) {
        console.warn('sRGB encoding not supported');
    }

    try {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.9;
        // Debug log removed
    } catch(e) {
        console.warn('Tone mapping not supported');
    }

    try {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.BasicShadowMap; // Basic shadows for performance
        // Debug log removed
    } catch(e) {
        console.warn('Soft shadows not supported, trying basic');
        try {
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.BasicShadowMap;
        } catch(e2) {
            console.warn('Shadows not supported at all');
        }
    }

    document.body.prepend(renderer.domElement);

    // Create textures after Three.js is loaded
    try {
        asphaltTex = createAsphaltTexture();
        asphaltNormal = createAsphaltNormal();
        asphaltRoughness = createRoughnessMap();
        // Debug log removed
    } catch(e) {
        console.error('Texture creation failed:', e);
        // Textures will be null, code will use fallback solid colors
    }

    // === REAL HDR ENVIRONMENT (Poly Haven - Free) ===
    // Using a real HDR gives massively better reflections on car paint, glass, and buildings
    try {
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();

        // Try loading real HDR from Poly Haven (free CDN)
        const rgbeLoader = new THREE.RGBELoader();
        rgbeLoader.setDataType(THREE.UnsignedByteType);

        // Using "kloppenheim_06" - a nice outdoor city HDR (1k resolution for performance)
        // Free from: https://polyhaven.com/a/kloppenheim_06
        rgbeLoader.load(
            'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_06_1k.hdr',
            function(hdrTexture) {
                hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
                const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
                scene.environment = envMap;
                hdrTexture.dispose();
                pmremGenerator.dispose();
                // Debug log removed
            },
            undefined,
            function(error) {
                console.warn('HDR load failed, using fallback:', error);
                // Fallback to procedural environment
                createProceduralEnvironment(pmremGenerator);
            }
        );
    } catch(e) {
        console.warn('HDR environment failed (non-critical):', e);
        // Game will work fine without reflections
    }

    function createProceduralEnvironment(pmremGenerator) {
        try {
            const envScene = new THREE.Scene();
            const envGeo = new THREE.SphereGeometry(100, 8, 8);
            const envMat = new THREE.MeshBasicMaterial({
                color: 0x87ceeb,
                side: THREE.BackSide
            });
            const envMesh = new THREE.Mesh(envGeo, envMat);
            envScene.add(envMesh);
            const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
            scene.environment = envMap;
            pmremGenerator.dispose();
            // Debug log removed
        } catch(e) {
            console.warn('Even procedural environment failed:', e);
        }
    }

    // Advanced lighting - store references for day/night cycle
    hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x545454, 0.4);
    scene.add(hemiLight);

    sun = new THREE.DirectionalLight(0xfff5e1, 1.2);
    sun.position.set(100, 150, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 512;
    sun.shadow.mapSize.height = 512;
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    sun.shadow.bias = -0.0001;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    fillLight = new THREE.DirectionalLight(0x9db4ff, 0.3);
    fillLight.position.set(-50, 50, -50);
    scene.add(fillLight);

    ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    // === ADD SUN VISUAL ===
    sunSphere = new THREE.Mesh(
        new THREE.SphereGeometry(40, 16, 8),
        new THREE.MeshBasicMaterial({
            color: 0xffdd00,
            fog: false
        })
    );
    sunSphere.position.set(500, 800, 200);  // Much higher: 800 units up, above clouds
    scene.add(sunSphere);

    // Add sun glow effect
    const sunGlow = new THREE.Mesh(
        new THREE.SphereGeometry(60, 12, 8),
        new THREE.MeshBasicMaterial({
            color: 0xffee88,
            transparent: true,
            opacity: 0.3,
            fog: false
        })
    );
    sunGlow.position.copy(sunSphere.position);
    scene.add(sunGlow);

    // Store reference to sun glow for toggling
    sunSphere.userData.glow = sunGlow;

    // === ADD MOON VISUAL ===
    moonSphere = new THREE.Mesh(
        new THREE.SphereGeometry(35, 16, 8),
        new THREE.MeshBasicMaterial({
            color: 0xccccdd,
            fog: false
        })
    );
    moonSphere.position.set(-500, 800, -200);
    moonSphere.visible = false; // Hidden during day
    scene.add(moonSphere);

    // Add moon glow
    const moonGlow = new THREE.Mesh(
        new THREE.SphereGeometry(50, 12, 8),
        new THREE.MeshBasicMaterial({
            color: 0x9999bb,
            transparent: true,
            opacity: 0.2,
            fog: false
        })
    );
    moonGlow.position.copy(moonSphere.position);
    moonGlow.visible = false;
    scene.add(moonGlow);

    // Store reference to moon glow for toggling
    moonSphere.userData.glow = moonGlow;

    // === ADD CLOUDS ===
    cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.82
    });

    // Create clouds - reduced count for performance
    for (let i = 0; i < 20; i++) {
        const cloud = new THREE.Group();
        const numPuffs = 2 + Math.floor(Math.random() * 2);
        for (let j = 0; j < numPuffs; j++) {
            const size = 15 + Math.random() * 12;
            const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(size, 5, 4),
                cloudMat
            );
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

    // Add a few large clouds
    for (let i = 0; i < 3; i++) {
        const largeCloud = new THREE.Group();
        const numPuffs = 4 + Math.floor(Math.random() * 3);
        for (let j = 0; j < numPuffs; j++) {
            const size = 30 + Math.random() * 30;
            const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(size, 6, 5),
                cloudMat
            );
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

    scene.add(cloudGroup);

    // Create star field (hidden during day, visible at night)
    starField = createStarField();

    // Ground plane - fallback beneath terrain
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(10000, 10000),
        new THREE.MeshStandardMaterial({ color: 0x3a5a3f, roughness: 0.95, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1; // Slightly below terrain tiles (acts as fallback)
    ground.receiveShadow = true;
    scene.add(ground);

    // Car with REALISTIC PBR materials (with error handling)
    try {
        carMesh = new THREE.Group();

        // === CAR PAINT (MeshStandardMaterial - good look, better perf) ===
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0xff3366,
            metalness: 0.9,
            roughness: 0.15,
            envMapIntensity: 1.2
        });

        const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 3.5), bodyMat);
        body.position.y = 0.5; body.castShadow = true; body.receiveShadow = true;
        carMesh.add(body);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.5), bodyMat);
        roof.position.set(0, 0.95, -0.2); roof.castShadow = true;
        carMesh.add(roof);

        // === GLASS (MeshStandardMaterial - transparent, better perf) ===
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
        carMesh.add(windshield);

        const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.1 });
        const wheelPositions = [[-0.85, 0.35, 1.1], [0.85, 0.35, 1.1], [-0.85, 0.35, -1.1], [0.85, 0.35, -1.1]];
        wheelMeshes = [];
        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(pos[0], pos[1], pos[2]);
            wheel.castShadow = true;
            carMesh.add(wheel);
            wheelMeshes.push(wheel);
        });

        const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffaa, emissiveIntensity: 1.0, roughness: 0.1, metalness: 0.1 });
        const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), lightMat);
        hl1.position.set(-0.55, 0.45, 1.76);
        carMesh.add(hl1);
        const hl2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), lightMat);
        hl2.position.set(0.55, 0.45, 1.76);
        carMesh.add(hl2);

        const tailMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.1 });
        const tl1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), tailMat);
        tl1.position.set(-0.55, 0.45, -1.76);
        carMesh.add(tl1);
        const tl2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), tailMat);
        tl2.position.set(0.55, 0.45, -1.76);
        carMesh.add(tl2);

        scene.add(carMesh);

        // Car casts shadow but doesn't need to receive
        carMesh.castShadow = true;
        carMesh.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = false;
            }
        });

        // Debug log removed
    } catch(e) {
        console.error('Car creation failed:', e);
        alert('Failed to create 3D car model. The game may not work properly.');
        return;
    }

    // Initialize Walking Module
    try {
        Walk = createWalkingModule({
            THREE,
            scene,
            camera,
            keys,
            car,
            carMesh,
            getBuildingsArray: () => buildings,  // Pass function for dynamic buildings access
            isPointInPolygon: pointInPolygon
        });
        window.Walk = Walk;
        // Debug log removed
    } catch(e) {
        console.error('Walking module initialization failed:', e);
        console.error('Stack:', e.stack);
    }

    // Initialize sky raycaster for star selection
    skyRaycaster = new THREE.Raycaster();
    skyRaycaster.far = 10000; // Reach stars on enlarged celestial sphere (5000m radius)

    addEventListener('resize', () => { camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
    addEventListener('keydown', e => { keys[e.code] = true; onKey(e.code); });
    addEventListener('keyup', e => keys[e.code] = false);

    // Mouse movement for camera control
    let lastMouseX = 0;
    let lastMouseY = 0;
    let mouseActive = false;

    addEventListener('mousedown', (e) => {
        if (!gameStarted) return;

        // Left click - check for Apollo 11 flag click
        if (e.button === 0 && onMoon && apollo11Flag) {
            const mouse = new THREE.Vector2();
            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);

            // Check all children of the flag group (including invisible hitbox)
            const intersects = raycaster.intersectObjects(apollo11Flag.children, true);
            if (intersects.length > 0) {
                // Clicked on Apollo 11 flag!
                showApollo11Info();
                return;
            }
        }

        // Right click or middle click for camera control
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
        if (!gameStarted || !mouseActive) return;

        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;

        const sensitivity = 0.005; // Increased from 0.003 for more responsive control

        // Drone mode camera control
        if (droneMode) {
            drone.yaw -= deltaX * sensitivity;
            drone.pitch += deltaY * sensitivity;
            drone.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, drone.pitch));
        }
        // Walking mode camera control
        else if (Walk && Walk.state.mode === 'walk') {
            // Update walker's view angles
            Walk.state.walker.yaw -= deltaX * sensitivity;
            Walk.state.walker.pitch += deltaY * sensitivity;
            Walk.state.walker.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, Walk.state.walker.pitch));
        }
    });

    // Prevent context menu on right click
    addEventListener('contextmenu', (e) => {
        if (gameStarted && (droneMode || (Walk && Walk.state.mode === 'walk'))) {
            e.preventDefault();
        }
    });

    // Click event for star selection
    addEventListener('click', (e) => {
        if (!gameStarted) return;

        // Check for moon click FIRST (higher priority than stars)
        if (checkMoonClick(e.clientX, e.clientY)) {
            return; // Moon was clicked, don't check stars
        }

        checkStarClick(e.clientX, e.clientY);
    });

    setupUI();
    renderLoop();
}
