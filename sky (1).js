// ============================================================================
// sky.js - Time of day, starfield, constellations, moon system
// ============================================================================

function setTimeOfDay(time) {
    timeOfDay = time;

    const times = {
        day: {
            skyColor: 0x87ceeb,
            groundColor: 0x545454,
            hemiIntensity: 0.5,
            sunColor: 0xfff5e1,
            sunIntensity: 1.3,
            sunPos: [100, 150, 50],
            fillColor: 0x9db4ff,
            fillIntensity: 0.35,
            ambientColor: 0xffffff,
            ambientIntensity: 0.35,
            fogColor: 0xb8d4e8,
            fogNear: 200,
            fogFar: 2500,
            exposure: 0.95,
            icon: '☀️'
        },
        sunset: {
            skyColor: 0xff7e5f,
            groundColor: 0x3d2817,
            hemiIntensity: 0.35,
            sunColor: 0xff6b35,
            sunIntensity: 0.9,
            sunPos: [120, 40, 80],
            fillColor: 0xff8c69,
            fillIntensity: 0.25,
            ambientColor: 0xffa07a,
            ambientIntensity: 0.28,
            fogColor: 0xff9a76,
            fogNear: 150,
            fogFar: 1800,
            exposure: 1.1,
            icon: '🌅'
        },
        night: {
            skyColor: 0x0a0e27,
            groundColor: 0x000000,
            hemiIntensity: 0.15,
            sunColor: 0x6b8cff,
            sunIntensity: 0.3,
            sunPos: [50, 180, 30],
            fillColor: 0x1a2a4a,
            fillIntensity: 0.15,
            ambientColor: 0x404060,
            ambientIntensity: 0.2,
            fogColor: 0x0d1128,
            fogNear: 500,
            fogFar: 15000,
            exposure: 0.5,
            icon: '🌙'
        },
        sunrise: {
            skyColor: 0xffc4a3,
            groundColor: 0x4a3428,
            hemiIntensity: 0.4,
            sunColor: 0xffe4b5,
            sunIntensity: 1.0,
            sunPos: [120, 30, -80],
            fillColor: 0xffb8a8,
            fillIntensity: 0.28,
            ambientColor: 0xffd4a3,
            ambientIntensity: 0.3,
            fogColor: 0xffd4b8,
            fogNear: 150,
            fogFar: 2000,
            exposure: 1.0,
            icon: '🌄'
        }
    };

    const config = times[time];

    // Update sky background color
    scene.background.setHex(config.skyColor);

    // Update lights
    hemiLight.color.setHex(config.skyColor);
    hemiLight.groundColor.setHex(config.groundColor);
    hemiLight.intensity = config.hemiIntensity;

    sun.color.setHex(config.sunColor);
    sun.intensity = config.sunIntensity;
    sun.position.set(...config.sunPos);

    fillLight.color.setHex(config.fillColor);
    fillLight.intensity = config.fillIntensity;

    ambientLight.color.setHex(config.ambientColor);
    ambientLight.intensity = config.ambientIntensity;

    // Update sun sphere
    if (sunSphere) {
        sunSphere.position.copy(sun.position);
        sunSphere.material.color.setHex(config.sunColor);
        if (sunSphere.material.emissive) {
            sunSphere.material.emissive.setHex(config.sunColor);
        }
        // Show sun during day/sunrise/sunset, hide at night
        sunSphere.visible = (time !== 'night');
        if (sunSphere.userData.glow) {
            sunSphere.userData.glow.visible = (time !== 'night');
        }
    }

    // Show moon only at night
    if (moonSphere) {
        moonSphere.visible = (time === 'night');
        if (moonSphere.userData.glow) {
            moonSphere.userData.glow.visible = (time === 'night');
        }
    }

    // Show stars at night and during sunrise/sunset (dimmer)
    if (starField) {
        if (time === 'night') {
            starField.visible = true;
            // Full brightness at night
            starField.children.forEach(child => {
                if (child.material) {
                    child.material.opacity = child.userData.baseOpacity || child.material.opacity;
                }
            });
        } else if (time === 'sunset' || time === 'sunrise') {
            starField.visible = true;
            // Dim stars during twilight
            starField.children.forEach(child => {
                if (child.material && child.material.transparent) {
                    if (!child.userData.baseOpacity) {
                        child.userData.baseOpacity = child.material.opacity;
                    }
                    child.material.opacity = child.userData.baseOpacity * 0.3;
                }
            });
        } else {
            starField.visible = false;
        }
    }

    // Update fog
    scene.fog = new THREE.Fog(config.fogColor, config.fogNear, config.fogFar);

    // Update tone mapping exposure
    if (renderer) {
        renderer.toneMappingExposure = config.exposure;
    }

    // Update button icon
    const btn = document.getElementById('fTimeOfDay');
    if (btn) {
        btn.textContent = config.icon + ' ' + time.charAt(0).toUpperCase() + time.slice(1);
    }

    // Debug log removed
}

function cycleTimeOfDay() {
    const cycle = ['day', 'sunset', 'night', 'sunrise'];
    const currentIndex = cycle.indexOf(timeOfDay);
    const nextIndex = (currentIndex + 1) % cycle.length;
    setTimeOfDay(cycle[nextIndex]);
}

function createStarField() {
    // Create a group to hold all stars and constellation lines
    const group = new THREE.Group();

    // Sky dome radius - increased to 5000 for better star separation and accuracy
    const radius = 5000;


    // Convert astronomical coordinates to 3D position on celestial sphere
    function raDecToVector(ra, dec) {
        // RA: hours (0-24) -> radians (0-2π)
        // Dec: degrees (-90 to 90) -> radians (-π/2 to π/2)
        const raRad = (ra / 24) * Math.PI * 2;
        const decRad = (dec * Math.PI) / 180;

        // Spherical to Cartesian coordinates
        const x = radius * Math.cos(decRad) * Math.cos(raRad);
        const y = radius * Math.sin(decRad);
        const z = radius * Math.cos(decRad) * Math.sin(raRad);

        return new THREE.Vector3(x, y, z);
    }

    // Create individual star points
    BRIGHT_STARS.forEach(star => {
        const pos = raDecToVector(star.ra, star.dec);

        // SIZE BASED ON REALISTIC APPEARANCE
        let size;
        if (star.isPlanet && star.angularSize) {
            // Planets: Use angular size directly with moderate scaling
            // Angular sizes are already very small (0.0001-0.0006), so scale appropriately
            size = star.angularSize * 200000; // Scale for visibility at 5000m
        } else {
            // Stars: All appear as tiny point sources regardless of distance
            // Only magnitude affects brightness/perceived size
            const brightnessFactor = Math.pow(2.512, -star.mag); // Brighter = slightly bigger
            size = Math.max(8, Math.min(brightnessFactor * 15, 25)); // Stars: 8-25 units (small!)
        }

        // Create star/planet as a sphere
        const starGeometry = new THREE.SphereGeometry(size, 16, 16);

        // Planets get extra glow for visibility
        const starMaterial = star.isPlanet ?
            new THREE.MeshBasicMaterial({
                color: star.color,
                emissive: star.color,
                emissiveIntensity: 0.8,
                fog: false
            }) :
            new THREE.MeshBasicMaterial({
                color: star.color,
                fog: false
            });

        const starMesh = new THREE.Mesh(starGeometry, starMaterial);
        starMesh.position.copy(pos);

        // CRITICAL: Add larger invisible hitbox for easier clicking
        // Stars are now tiny (8-25), planets are bigger (16-140)
        // Use larger multiplier for stars to keep them clickable
        const hitboxSize = star.isPlanet ?
            Math.max(size * 3, 50) :  // Planets: 3x size, min 50
            Math.max(size * 8, 80);   // Stars: 8x size, min 80 (they're tiny!)
        const hitboxGeometry = new THREE.SphereGeometry(hitboxSize, 8, 8);
        const hitboxMaterial = new THREE.MeshBasicMaterial({
            visible: false
        });
        const hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
        hitbox.position.copy(pos);

        // Store star data for interaction on BOTH meshes
        const userData = {
            name: star.name,
            proper: star.proper || star.name,
            mag: star.mag,
            dist: star.dist,
            constellation: star.constellation,
            isPlanet: star.isPlanet || false,
            isClickable: true,
            ra: star.ra,
            dec: star.dec
        };
        starMesh.userData = userData;
        hitbox.userData = userData;

        // NO HALOS for stars (only moon will have halo)

        group.add(starMesh);
        group.add(hitbox); // Add invisible hitbox for easier clicking
    });

    // Create constellation lines grouped by constellation - store for toggling
    allConstellationLines = new THREE.Group();
    allConstellationLines.visible = false; // Hidden by default

    const normalLineMaterial = new THREE.LineBasicMaterial({
        color: 0x4488aa,
        transparent: true,
        opacity: 0.5, // Increased from 0.3 for better visibility at 5000m
        fog: false
    });

    Object.entries(CONSTELLATION_LINES).forEach(([constellationName, lines]) => {
        lines.forEach(line => {
            const points = [];
            points.push(raDecToVector(line[0][0], line[0][1]));
            points.push(raDecToVector(line[1][0], line[1][1]));

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const lineSegment = new THREE.Line(geometry, normalLineMaterial);
            lineSegment.userData = { constellation: constellationName };
            allConstellationLines.add(lineSegment);
        });
    });

    group.add(allConstellationLines);

    // Add some fainter background stars for depth
    const faintStarCount = 2000;
    const faintStarGeometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];

    for (let i = 0; i < faintStarCount; i++) {
        // Random position on sphere
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);

        positions.push(x, y, z);

        // Slight color variation
        const c = 0.8 + Math.random() * 0.2;
        colors.push(c, c, c + 0.1);
    }

    faintStarGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    faintStarGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const faintStarMaterial = new THREE.PointsMaterial({
        size: 2,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        fog: false
    });

    const faintStars = new THREE.Points(faintStarGeometry, faintStarMaterial);
    group.add(faintStars);

    group.visible = false; // Hidden during day
    scene.add(group);

    // Debug log removed
    return group;
}

// Function to align star field with current location
function alignStarFieldToLocation(lat, lng) {
    if (!starField) return;

    // Reset rotation
    starField.rotation.set(0, 0, 0);

    // Rotate based on latitude (tilt the celestial sphere)
    // At equator (0°), Polaris is on horizon
    // At North Pole (90°), Polaris is overhead
    const latRad = (lat * Math.PI) / 180;
    starField.rotation.x = (Math.PI / 2) - latRad; // Tilt sphere

    // Rotate based on longitude (rotate around polar axis)
    // This simulates Earth's rotation
    const lngRad = (lng * Math.PI) / 180;
    starField.rotation.y = -lngRad; // Rotate to match longitude

    // Debug log removed
}

function highlightConstellation(constellationName) {
    // Clear previous highlight
    if (highlightedConstellation) {
        highlightedConstellation.parent.remove(highlightedConstellation);
        highlightedConstellation = null;
    }

    if (!constellationName || constellationName === "Planet") return;

    const lines = CONSTELLATION_LINES[constellationName];
    if (!lines) return;

    // Create highlighted version
    const group = new THREE.Group();
    const highlightMaterial = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.9,
        linewidth: 3,
        fog: false
    });

    function raDecToVector(ra, dec) {
        const radius = 5000; // Must match the radius in createStarField()
        const raRad = (ra / 24) * Math.PI * 2;
        const decRad = (dec * Math.PI) / 180;
        const x = radius * Math.cos(decRad) * Math.cos(raRad);
        const y = radius * Math.sin(decRad);
        const z = radius * Math.cos(decRad) * Math.sin(raRad);
        return new THREE.Vector3(x, y, z);
    }

    lines.forEach(line => {
        const points = [];
        points.push(raDecToVector(line[0][0], line[0][1]));
        points.push(raDecToVector(line[1][0], line[1][1]));

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const lineSegment = new THREE.Line(geometry, highlightMaterial);
        group.add(lineSegment);
    });

    starField.add(group);
    highlightedConstellation = group;
    // Debug log removed
}

function showStarInfo(star) {
    let infoDiv = document.getElementById('starInfo');
    if (!infoDiv) {
        // Create info panel
        infoDiv = document.createElement('div');
        infoDiv.id = 'starInfo';
        infoDiv.style.cssText = 'position:fixed;top:20px;right:20px;background:rgba(0,0,0,0.95);color:#fff;padding:20px;border-radius:12px;font-family:Inter,sans-serif;min-width:300px;box-shadow:0 8px 32px rgba(0,255,255,0.4);border:2px solid #00ffff;z-index:1000;';
        document.body.appendChild(infoDiv);
    }

    const type = star.isPlanet ? '🪐 Planet' : '⭐ Star';
    const properStr = star.proper && star.proper !== star.name ? `<div style="font-size:13px;color:#888;margin-top:5px;">Designation: ${star.proper}</div>` : '';
    const magStr = `<div style="font-size:12px;color:#aaa;margin-top:5px;">Apparent Magnitude: ${star.mag.toFixed(2)}</div>`;

    // Format distance appropriately
    let distStr = '';
    if (star.dist) {
        if (star.isPlanet) {
            // Planets are in light years from our calculation, convert to AU or km
            const distAU = star.dist * 63241; // 1 ly = 63,241 AU
            if (distAU < 1) {
                const distKm = distAU * 149597870.7;
                distStr = `<div style="font-size:12px;color:#aaa;margin-top:5px;">Distance: ${distKm.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km</div>`;
            } else {
                distStr = `<div style="font-size:12px;color:#aaa;margin-top:5px;">Distance: ${distAU.toFixed(2)} AU</div>`;
            }
        } else {
            // Stars in light years
            distStr = `<div style="font-size:12px;color:#aaa;margin-top:5px;">Distance: ${star.dist.toFixed(1)} light years</div>`;
        }
    }

    const constStr = star.constellation !== "Planet" ? `<div style="font-size:14px;color:#00ffff;margin-top:10px;font-weight:600;">Constellation: ${star.constellation}</div>` : '';

    infoDiv.innerHTML = `
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">${type}</div>
        <div style="font-size:24px;font-weight:700;margin:8px 0;color:#00ffff;">${star.name}</div>
        ${properStr}
        ${magStr}
        ${distStr}
        ${constStr}
        <div style="font-size:11px;color:#666;margin-top:10px;">RA: ${star.ra.toFixed(2)}h • Dec: ${star.dec.toFixed(2)}°</div>
        <button onclick="clearStarSelection()" style="margin-top:15px;background:#00ffff;color:#000;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;width:100%;font-family:Inter,sans-serif;">Close</button>
    `;
    infoDiv.style.display = 'block';
}

function clearStarSelection() {
    const info = document.getElementById('starInfo');
    if (info) info.style.display = 'none';

    if (highlightedConstellation) {
        highlightedConstellation.parent.remove(highlightedConstellation);
        highlightedConstellation = null;
    }

    selectedStar = null;
}

function checkStarClick(clientX, clientY) {
    if (!starField || !starField.visible || !skyRaycaster) return;

    // Calculate mouse position in normalized device coordinates
    const mouse = new THREE.Vector2();
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    skyRaycaster.setFromCamera(mouse, camera);

    // Get all clickable stars
    const clickableStars = [];
    starField.traverse(obj => {
        if (obj.userData && obj.userData.isClickable) {
            clickableStars.push(obj);
        }
    });

    const intersects = skyRaycaster.intersectObjects(clickableStars);

    if (intersects.length > 0) {
        const star = intersects[0].object.userData;
        selectedStar = star;
        showStarInfo(star);
        highlightConstellation(star.constellation);
        // Debug log removed
        return true;
    }
    return false;
}

// Check if moon was clicked
function checkMoonClick(clientX, clientY) {
    if (!moonSphere || !moonSphere.visible || travelingToMoon || onMoon) return false;

    const mouse = new THREE.Vector2();
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    if (!skyRaycaster) {
        skyRaycaster = new THREE.Raycaster();
    }
    skyRaycaster.setFromCamera(mouse, camera);

    const intersects = skyRaycaster.intersectObject(moonSphere);

    if (intersects.length > 0) {
        // Debug log removed
        travelToMoon();
        return true;
    }
    return false;
}

// Direct travel to moon (bypasses space flight module)
function directTravelToMoon() {
    if (travelingToMoon || onMoon) return;

    travelingToMoon = true;

    // Save Earth position
    earthPosition = {
        x: car.x,
        z: car.z,
        angle: car.angle
    };

    paused = true;
    scene.background = new THREE.Color(0x000000);

    if (terrainGroup) { terrainGroup.visible = false; scene.remove(terrainGroup); }
    if (cloudGroup) { cloudGroup.visible = false; scene.remove(cloudGroup); }
    roadMeshes.forEach(m => { m.visible = false; scene.remove(m); });
    buildingMeshes.forEach(m => { m.visible = false; scene.remove(m); });
    landuseMeshes.forEach(m => { m.visible = false; scene.remove(m); });
    poiMeshes.forEach(m => { m.visible = false; scene.remove(m); });
    streetFurnitureMeshes.forEach(m => { m.visible = false; scene.remove(m); });

    const moonPos = moonSphere.position.clone();
    const startPos = camera.position.clone();
    const startTime = Date.now();
    const duration = 3000;

    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        camera.position.lerpVectors(startPos, moonPos, eased);
        camera.lookAt(moonPos);
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            arriveAtMoon();
        }
    }
    animate();
}

// Direct return to Earth (bypasses space flight module)
function returnToEarthDirect() {
    if (!onMoon || travelingToMoon) return;

    travelingToMoon = true;
    paused = true;
    hideReturnToEarthButton();

    const startPos = camera.position.clone();
    const earthCameraPos = new THREE.Vector3(
        earthPosition.x, 50, earthPosition.z + 20
    );
    const startTime = Date.now();
    const duration = 3000;

    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        camera.position.lerpVectors(startPos, earthCameraPos, eased);
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            arriveAtEarth();
        }
    }
    animate();
}

// Travel to the moon with smooth animation
function travelToMoon() {
    if (travelingToMoon || onMoon) return;

    // Use the new space flight system if available
    if (typeof startSpaceFlightToMoon === 'function') {
        startSpaceFlightToMoon();
        return;
    }

    // Fallback to original behavior if space.js not loaded
    travelingToMoon = true;

    // Save Earth position
    earthPosition = {
        x: car.x,
        z: car.z,
        angle: car.angle
    };

    // Disable controls during travel
    paused = true;

    // IMMEDIATELY set background to black for space
    scene.background = new THREE.Color(0x000000);

    // IMMEDIATELY hide Earth terrain to prevent "green sheet" during travel
    if (terrainGroup) {
        terrainGroup.visible = false;
        scene.remove(terrainGroup);
    }
    if (cloudGroup) {
        cloudGroup.visible = false;
        scene.remove(cloudGroup);
    }

    // Remove all city meshes from scene
    roadMeshes.forEach(m => {
        m.visible = false;
        scene.remove(m);
    });
    buildingMeshes.forEach(m => {
        m.visible = false;
        scene.remove(m);
    });
    landuseMeshes.forEach(m => {
        m.visible = false;
        scene.remove(m);
    });
    poiMeshes.forEach(m => {
        m.visible = false;
        scene.remove(m);
    });

    // Get moon position
    const moonPos = moonSphere.position.clone();
    const startPos = camera.position.clone();
    const startTime = Date.now();
    const duration = 3000; // 3 second travel

    // Animation function
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Smooth easing (ease-in-out)
        const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        // Interpolate camera to moon
        camera.position.lerpVectors(startPos, moonPos, eased);
        camera.lookAt(moonPos);

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Arrived at moon!
            arriveAtMoon();
        }
    }

    // Debug log removed
    animate();
}

// Create moon surface when arriving
function arriveAtMoon() {
    // Debug log removed

    switchEnv(ENV.MOON); // sets onMoon=true, travelingToMoon=false

    // Update space menu button labels
    const directBtn = document.getElementById('fSpaceDirect');
    const rocketBtn = document.getElementById('fSpaceRocket');
    if (directBtn) directBtn.textContent = '🌍 Return to Earth';
    if (rocketBtn) rocketBtn.textContent = '🌍 Return to Earth';

    // Earth terrain already hidden during travel animation

    // Hide moon sphere (we're on it now!)
    moonSphere.visible = false;
    if (moonSphere.userData.glow) moonSphere.userData.glow.visible = false;

    // Create moon surface
    if (!moonSurface) {
        createMoonSurface();
        // Car positioning will happen after moonSurface is fully created
    } else {
        // Re-add and show all moon objects (safe even if already in scene)
        moonSurface.visible = true;
        scene.add(moonSurface);
        if (window.apollo11Beacon) { window.apollo11Beacon.visible = true; scene.add(window.apollo11Beacon); }
        if (apollo11Flag) { apollo11Flag.visible = true; scene.add(apollo11Flag); }
        // Re-add tagged moon objects (plaque, pole, footprints)
        if (window._moonObjects) {
            window._moonObjects.forEach(obj => { obj.visible = true; scene.add(obj); });
        }
        // Position car immediately if moonSurface already exists
        positionCarOnMoon();
    }

    // Ensure DRIVING MODE (not walking!) on moon
    if (Walk && Walk.state.mode === 'walk') {
        Walk.toggleWalk(); // Switch back to driving
    }

    // Set night sky for moon
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 1000, 10000);

    // Adjust lighting for moon - stronger sun for better shading and shadows
    if (sun) {
        sun.intensity = 2.0; // Brighter sun for stronger shadows on moon
        sun.position.set(100, 200, 100); // Higher angle for better shadow casting
    }
    if (ambientLight) {
        ambientLight.intensity = 0.15; // Lower ambient for more dramatic shadows
    }
    if (fillLight) {
        fillLight.intensity = 0.1; // Very low fill light
    }

    // ALWAYS show stars on the moon (no atmosphere to block them!)
    if (starField) {
        starField.visible = true;
        // Full brightness for stars on moon
        starField.children.forEach(child => {
            if (child.material) {
                child.material.opacity = child.userData.baseOpacity || 1.0;
            }
        });
        // Debug log removed
    }

    // Re-enable controls
    paused = false;

    // Show return button
    showReturnToEarthButton();

    // Debug log removed
}

// Create REAL lunar surface based on Apollo mission data and lunar surveys
function createMoonSurface() {
    // Debug log removed

    const size = 10000;  // 10km x 10km (matches Apollo landing site scale)
    const segments = 200;  // High resolution for detail

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    // REAL LUNAR FEATURES based on Apollo 11 landing site (Mare Tranquillitatis)
    // And data from Lunar Reconnaissance Orbiter (LRO)

    // Major craters from real lunar data (Apollo 11 landing site area)
    const realCraters = [
        // Based on real Apollo 11 site craters
        { cx: -2000, cz: 1500, radius: 600, depth: 120 },   // West Crater
        { cx: 3500, cz: -2000, radius: 800, depth: 150 },   // Maskelyne
        { cx: -3000, cz: -3000, radius: 700, depth: 140 },  // Moltke
        { cx: 2500, cz: 3000, radius: 900, depth: 180 },    // Sabine (largest)
        { cx: -1500, cz: -2500, radius: 550, depth: 100 },  // Ritter
        { cx: 3800, cz: 2500, radius: 650, depth: 130 },    // Schmidt
        { cx: 1000, cz: -1000, radius: 750, depth: 160 },   // Arago
        { cx: -3500, cz: 2000, radius: 600, depth: 110 },   // Dionysius
        { cx: 500, cz: 3500, radius: 450, depth: 85 },      // Ranger VIII
        { cx: 2800, cz: -3200, radius: 500, depth: 95 },    // Surveyor V
        { cx: 200, cz: -500, radius: 350, depth: 70 },      // Eagle Crater (Apollo 11)
        { cx: -800, cz: 800, radius: 280, depth: 55 }       // Little West
    ];

    // Debug log removed

    // Track min/max height for color mapping
    let minHeight = Infinity;
    let maxHeight = -Infinity;

    const positions = geometry.attributes.position;
    const heights = new Array(positions.count);

    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);

        let height = 0;

        // Apply REAL crater data
        for (let crater of realCraters) {
            const dist = Math.sqrt((x - crater.cx) ** 2 + (z - crater.cz) ** 2);
            if (dist < crater.radius) {
                const t = dist / crater.radius;
                // Real crater profile: parabolic bowl with sharp raised rim
                const bowlDepth = -crater.depth * (1 - t * t * t);  // Cubic for realistic shape
                // Rim height based on real lunar crater data (rim is ~15-20% of depth)
                const rimHeight = (t > 0.75) ? crater.depth * 0.18 * Math.pow((t - 0.75) / 0.25, 2) * (1 - t) * 4 : 0;
                height += bowlDepth + rimHeight;
            }
        }

        // Mare Tranquillitatis terrain (real lunar mare characteristics)
        // Gentle undulations - lunar maria are relatively flat with gentle slopes
        const mareUndulation = Math.sin(x * 0.002) * Math.cos(z * 0.0025) * 25;
        height += mareUndulation;

        // Regolith texture (lunar soil) - real moon surface is covered in fine dust
        const regolith = Math.sin(x * 0.3) * Math.cos(z * 0.35) * 2;
        height += regolith;

        // Small impact craters and rocks (secondary cratering)
        const microCraters = Math.abs(Math.sin(x * 0.08)) * Math.abs(Math.cos(z * 0.09)) * 4;
        height += microCraters;

        // Add subtle directional slope (lunar maria have slight tilt)
        const mareSlope = (x * 0.001) + (z * 0.0008);
        height += mareSlope;

        positions.setY(i, height);
        heights[i] = height;

        minHeight = Math.min(minHeight, height);
        maxHeight = Math.max(maxHeight, height);
    }

    // Debug log removed

    // REAL LUNAR COLORS based on Apollo photos and LRO imagery
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
        const height = heights[i];
        const t = (height - minHeight) / (maxHeight - minHeight);

        // Improved lunar surface colors with better contrast and shading
        // Wider range for visual interest while maintaining realism
        let r, g, b;
        if (t < 0.25) {
            // Deep crater floors - very dark shadows
            r = 0.08 + t * 0.12;      // 0.08 to 0.20
            g = 0.07 + t * 0.11;      // 0.07 to 0.18
            b = 0.06 + t * 0.10;      // 0.06 to 0.16
        } else if (t < 0.5) {
            // Crater walls - dark to medium with variation
            const mt = (t - 0.25) / 0.25;
            r = 0.20 + mt * 0.20;     // 0.20 to 0.40
            g = 0.18 + mt * 0.19;     // 0.18 to 0.37
            b = 0.16 + mt * 0.17;     // 0.16 to 0.33
        } else if (t < 0.75) {
            // Mare surface - medium gray with good contrast
            const ht = (t - 0.5) / 0.25;
            r = 0.40 + ht * 0.25;     // 0.40 to 0.65
            g = 0.37 + ht * 0.23;     // 0.37 to 0.60
            b = 0.33 + ht * 0.20;     // 0.33 to 0.53
        } else {
            // Crater rims and peaks - bright sun-exposed rock
            const pt = (t - 0.75) / 0.25;
            r = 0.65 + pt * 0.30;     // 0.65 to 0.95 (much brighter!)
            g = 0.60 + pt * 0.28;     // 0.60 to 0.88
            b = 0.53 + pt * 0.25;     // 0.53 to 0.78
        }

        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,  // Slightly less rough so light reveals terrain contours
        metalness: 0.02,
        flatShading: false
    });

    moonSurface = new THREE.Mesh(geometry, material);
    moonSurface.receiveShadow = true;
    moonSurface.castShadow = true;
    moonSurface.frustumCulled = false; // Always render - prevents disappearing at high drone altitude
    moonSurface.position.y = -100;
    scene.add(moonSurface);

    // Delay Apollo 11 landing site creation to ensure moonSurface is fully in scene
    setTimeout(() => {
        createApollo11LandingSite();
        // Position car after both moonSurface and landing site are ready
        positionCarOnMoon();
    }, 150);

    // Debug log removed
    // Debug log removed
    // Debug log removed
}

// Position car on moon surface at correct height
function positionCarOnMoon() {
    // Position car on moon surface at APOLLO 11 LANDING SITE!
    // Eagle Crater location from real Apollo 11 data
    car.x = 200;   // Apollo 11 Eagle Crater X coordinate
    car.z = -500;  // Apollo 11 Eagle Crater Z coordinate

    // Find the ACTUAL ground height at spawn position using raycasting
    const spawnRaycaster = new THREE.Raycaster();
    const spawnRayStart = new THREE.Vector3(car.x, 1000, car.z);
    const spawnRayDir = new THREE.Vector3(0, -1, 0);
    spawnRaycaster.set(spawnRayStart, spawnRayDir);

    const spawnHits = spawnRaycaster.intersectObject(moonSurface, false);
    if (spawnHits.length > 0) {
        const groundHeight = spawnHits[0].point.y;
        car.y = groundHeight + 1.2; // Car height above ground
        // Debug log removed
    } else {
        // Fallback if raycast fails
        car.y = -100 + 2;
        console.warn('⚠️ Spawn raycast failed, using fallback Y=' + car.y);
    }

    car.vx = 0;
    car.vz = 0;
    car.vy = 0; // No initial vertical velocity
    car.angle = 0;

    // Debug log removed
    // Debug log removed
}

// Global variable for Apollo 11 landing site flag
let apollo11Flag = null;

// Create Apollo 11 landing site markers
function createApollo11LandingSite() {
    // REAL Apollo 11 coordinates: 0.67408°N, 23.47297°E (Mare Tranquillitatis)
    // Eagle Crater location (where we spawn)
    const landingX = 200;
    const landingZ = -500;
    window._moonObjects = []; // Track moon objects for cleanup

    // Debug log removed

    // Find the actual ground height at this location using raycasting
    const raycaster = new THREE.Raycaster();
    const rayStart = new THREE.Vector3(landingX, 1000, landingZ); // Start MUCH higher
    const rayDir = new THREE.Vector3(0, -1, 0);
    raycaster.set(rayStart, rayDir);

    // Debug log removed
    const hits = raycaster.intersectObject(moonSurface, false);

    if (hits.length === 0) {
        console.error('❌ Could not find ground at Apollo 11 site!');
        console.error('Moon surface exists:', !!moonSurface);
        console.error('Moon surface in scene:', scene.children.includes(moonSurface));
        console.error('Moon surface position:', moonSurface ? moonSurface.position : 'N/A');
        return;
    }

    const groundY = hits[0].point.y;
    // Debug log removed

    // Create a plaque/marker at the landing site (not clickable)
    const plaqueGeometry = new THREE.BoxGeometry(12, 0.3, 12);
    const plaqueMaterial = new THREE.MeshStandardMaterial({
        color: 0xd4af37, // Gold color
        metalness: 0.8,
        roughness: 0.2,
        emissive: 0x806020,
        emissiveIntensity: 0.3
    });
    const plaque = new THREE.Mesh(plaqueGeometry, plaqueMaterial);
    plaque.position.set(landingX, groundY + 0.15, landingZ);
    plaque.castShadow = true;
    plaque.receiveShadow = true;
    plaque.userData.moonObject = true;
    scene.add(plaque);
    window._moonObjects.push(plaque);

    // Add a tall marker pole so it's visible from a distance
    const poleGeometry = new THREE.CylinderGeometry(0.4, 0.4, 8, 16);
    const poleMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.9,
        roughness: 0.1,
        emissive: 0xcccccc,
        emissiveIntensity: 0.2
    });
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.set(landingX - 8, groundY + 4, landingZ);
    pole.castShadow = true;
    pole.userData.moonObject = true;
    scene.add(pole);
    window._moonObjects.push(pole);

    // Create American flag as a GROUP (makes it easier to click)
    apollo11Flag = new THREE.Group();

    // Flag pole
    const flagPoleGeometry = new THREE.CylinderGeometry(0.25, 0.25, 10, 16);
    const flagPoleMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 0.8,
        roughness: 0.2
    });
    const flagPole = new THREE.Mesh(flagPoleGeometry, flagPoleMaterial);
    flagPole.position.set(0, 5, 0);
    flagPole.castShadow = true;
    apollo11Flag.add(flagPole);

    // Flag fabric - LARGER and more visible (US flag colors)
    const flagGeometry = new THREE.PlaneGeometry(8, 5);
    const flagMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        emissive: 0x999999,
        emissiveIntensity: 0.3
    });
    const flag = new THREE.Mesh(flagGeometry, flagMaterial);
    flag.position.set(4.5, 7.5, 0);
    flag.rotation.y = Math.PI / 2;
    flag.castShadow = true;
    apollo11Flag.add(flag);

    // Red stripes on flag - make them bigger
    const stripeGeometry = new THREE.PlaneGeometry(8, 0.7);
    const stripeMaterial = new THREE.MeshStandardMaterial({
        color: 0xcc0000,
        side: THREE.DoubleSide,
        emissive: 0x660000,
        emissiveIntensity: 0.4
    });
    for (let i = 0; i < 7; i++) {
        const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
        stripe.position.set(4.51, 5.7 + i * 0.7, 0);
        stripe.rotation.y = Math.PI / 2;
        stripe.castShadow = true;
        apollo11Flag.add(stripe);
    }

    // Blue field with stars - make it bigger
    const blueFieldGeometry = new THREE.PlaneGeometry(3.2, 2.5);
    const blueFieldMaterial = new THREE.MeshStandardMaterial({
        color: 0x0033aa,
        side: THREE.DoubleSide,
        emissive: 0x002288,
        emissiveIntensity: 0.5
    });
    const blueField = new THREE.Mesh(blueFieldGeometry, blueFieldMaterial);
    blueField.position.set(4.52, 8.75, 0);
    blueField.rotation.y = Math.PI / 2;
    blueField.castShadow = true;
    apollo11Flag.add(blueField);

    // Add invisible hitbox for easier clicking
    const hitboxGeometry = new THREE.BoxGeometry(10, 12, 3);
    const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
    hitbox.position.set(4, 6, 0);
    apollo11Flag.add(hitbox);

    // Position the entire flag group
    apollo11Flag.position.set(landingX + 15, groundY, landingZ - 10);

    // Store mission info in the flag group's userData
    apollo11Flag.userData.isApollo11 = true;
    apollo11Flag.userData.info = {
        mission: 'Apollo 11',
        date: 'July 20, 1969',
        crew: 'Neil Armstrong, Buzz Aldrin, Michael Collins',
        location: 'Mare Tranquillitatis',
        coordinates: '0.67408°N, 23.47297°E',
        landingTime: '20:17:40 UTC',
        quote: '"That\'s one small step for man, one giant leap for mankind."'
    };

    scene.add(apollo11Flag);

    // Add BEACON - tall light beam visible from anywhere on the moon
    const beaconGroup = new THREE.Group();

    // Create tall glowing cylinder as the beacon light beam
    const beaconHeight = 500; // 500 meters tall!
    const beaconGeometry = new THREE.CylinderGeometry(3, 5, beaconHeight, 20, 1, true);
    const beaconMaterial = new THREE.MeshBasicMaterial({
        color: 0xd4af37, // Gold
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        fog: false // Don't let fog affect the beacon
    });
    const beaconBeam = new THREE.Mesh(beaconGeometry, beaconMaterial);
    beaconBeam.position.y = beaconHeight / 2;
    beaconGroup.add(beaconBeam);

    // Add bright glow at the base
    const glowGeometry = new THREE.SphereGeometry(8, 24, 24);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffdd77,
        transparent: true,
        opacity: 0.8,
        fog: false
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.y = 3;
    beaconGroup.add(glow);

    // Add point light at base for illumination
    const beaconLight = new THREE.PointLight(0xd4af37, 2, 100);
    beaconLight.position.y = 5;
    beaconGroup.add(beaconLight);

    // Position beacon at landing site
    beaconGroup.position.set(landingX, groundY, landingZ);
    scene.add(beaconGroup);

    // Store reference for animation
    window.apollo11Beacon = beaconGroup;

    // Debug log removed

    // Footprints around landing site (astronaut tracks)
    const footprintMaterial = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 1.0,
        metalness: 0.0
    });

    // Create footprint trail
    for (let i = 0; i < 30; i++) {
        const footprint = new THREE.Mesh(
            new THREE.CircleGeometry(0.4, 12),
            footprintMaterial
        );
        const angle = (i / 30) * Math.PI * 2;
        const radius = 5 + Math.random() * 10;

        // Raycast to get exact ground height for each footprint
        const fpRayStart = new THREE.Vector3(
            landingX + Math.cos(angle) * radius,
            1000, // Start from much higher
            landingZ + Math.sin(angle) * radius
        );
        raycaster.set(fpRayStart, rayDir);
        const fpHits = raycaster.intersectObject(moonSurface, false);
        if (fpHits.length > 0) {
            footprint.position.set(
                landingX + Math.cos(angle) * radius,
                fpHits[0].point.y + 0.02,
                landingZ + Math.sin(angle) * radius
            );
            footprint.rotation.x = -Math.PI / 2;
            footprint.userData.moonObject = true;
            scene.add(footprint);
            window._moonObjects.push(footprint);
        }
    }

    // Debug log removed
    // Debug log removed
    // Debug log removed
    // Debug log removed
}

// Show Apollo 11 mission information
function showApollo11Info() {
    const info = apollo11Flag.userData.info;

    // Create info panel
    const panel = document.createElement('div');
    panel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.95);
        color: #ffffff;
        padding: 30px 40px;
        border-radius: 15px;
        border: 3px solid #d4af37;
        box-shadow: 0 0 30px rgba(212, 175, 55, 0.5);
        z-index: 10000;
        font-family: 'Courier New', monospace;
        max-width: 600px;
        backdrop-filter: blur(10px);
    `;

    panel.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #d4af37; margin: 0; font-size: 28px; text-shadow: 0 0 10px rgba(212, 175, 55, 0.8);">
                🚀 ${info.mission} Landing Site
            </h2>
            <div style="color: #888; font-size: 14px; margin-top: 5px;">Mare Tranquillitatis</div>
        </div>

        <div style="line-height: 1.8; font-size: 16px;">
            <div style="margin: 15px 0;"><strong style="color: #d4af37;">📅 Date:</strong> ${info.date}</div>
            <div style="margin: 15px 0;"><strong style="color: #d4af37;">👨‍🚀 Crew:</strong> ${info.crew}</div>
            <div style="margin: 15px 0;"><strong style="color: #d4af37;">📍 Coordinates:</strong> ${info.coordinates}</div>
            <div style="margin: 15px 0;"><strong style="color: #d4af37;">🕐 Landing Time:</strong> ${info.landingTime}</div>
            <div style="margin: 15px 0;"><strong style="color: #d4af37;">🌍 Location:</strong> ${info.location}</div>
        </div>

        <div style="margin: 20px 0; padding: 15px; background: rgba(212, 175, 55, 0.1); border-left: 3px solid #d4af37; font-style: italic;">
            ${info.quote}<br>
            <span style="color: #888; font-size: 14px;">— Neil Armstrong</span>
        </div>

        <div style="text-align: center; margin-top: 20px;">
            <button id="apollo11CloseBtn" style="
                background: #d4af37;
                color: #000;
                border: none;
                padding: 12px 30px;
                font-size: 16px;
                font-weight: bold;
                border-radius: 5px;
                cursor: pointer;
                font-family: 'Courier New', monospace;
                box-shadow: 0 4px 15px rgba(212, 175, 55, 0.4);
                transition: all 0.3s;
            ">
                ✕ Close
            </button>
        </div>
    `;

    document.body.appendChild(panel);

    // Close button handler
    document.getElementById('apollo11CloseBtn').addEventListener('click', () => {
        document.body.removeChild(panel);
    });

    // Close on Escape key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            if (document.body.contains(panel)) {
                document.body.removeChild(panel);
            }
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Debug log removed
}

// Return to Earth
function returnToEarth() {
    if (!onMoon || travelingToMoon) return;

    // Always use direct travel for return (no space flight)

    travelingToMoon = true;
    paused = true;

    // Hide return button
    hideReturnToEarthButton();

    const startPos = camera.position.clone();
    const earthCameraPos = new THREE.Vector3(
        earthPosition.x,
        50,
        earthPosition.z + 20
    );
    const startTime = Date.now();
    const duration = 3000;

    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        camera.position.lerpVectors(startPos, earthCameraPos, eased);

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            arriveAtEarth();
        }
    }

    animate();
}

// Arrive back at Earth
function arriveAtEarth() {
    switchEnv(ENV.EARTH); // sets onMoon=false, travelingToMoon=false

    // Update space menu button labels
    const directBtn = document.getElementById('fSpaceDirect');
    const rocketBtn = document.getElementById('fSpaceRocket');
    if (directBtn) directBtn.textContent = '🌙 Direct to Moon';
    if (rocketBtn) rocketBtn.textContent = '🚀 Rocket to Moon';

    // Restore Earth position
    car.x = earthPosition.x;
    car.z = earthPosition.z;
    car.angle = earthPosition.angle;
    car.vx = 0;
    car.vz = 0;
    car.vy = 0;  // Reset vertical velocity
    car.y = 0;   // Reset vertical position

    // Show Earth terrain and objects - RE-ADD to scene
    if (terrainGroup) {
        terrainGroup.visible = true;
        scene.add(terrainGroup);
    }
    if (cloudGroup) {
        cloudGroup.visible = true;
        scene.add(cloudGroup);
    }

    // Re-add all city meshes to scene
    roadMeshes.forEach(m => {
        m.visible = true;
        scene.add(m);
    });
    buildingMeshes.forEach(m => {
        m.visible = true;
        scene.add(m);
    });
    landuseMeshes.forEach(m => {
        m.visible = true;
        scene.add(m);
    });
    poiMeshes.forEach(m => {
        m.visible = true;
        scene.add(m);
    });
    streetFurnitureMeshes.forEach(m => {
        m.visible = true;
        scene.add(m);
    });

    // Hide moon surface
    // Hide ALL moon objects (surface, flag, beacon, plaque, pole, footprints)
    if (moonSurface) { moonSurface.visible = false; scene.remove(moonSurface); }
    if (window.apollo11Beacon) { window.apollo11Beacon.visible = false; scene.remove(window.apollo11Beacon); }
    if (apollo11Flag) { apollo11Flag.visible = false; scene.remove(apollo11Flag); }
    if (window._moonObjects) {
        window._moonObjects.forEach(obj => { obj.visible = false; scene.remove(obj); });
    }

    // Restore Earth lighting
    if (sun) {
        sun.intensity = 1.2; // Normal Earth sun intensity
        sun.position.set(100, 150, 50); // Normal Earth sun position
    }
    if (ambientLight) {
        ambientLight.intensity = 0.3; // Normal ambient light
    }
    if (fillLight) {
        fillLight.intensity = 0.3; // Normal fill light
    }

    // Restore sky based on time of day
    setTimeOfDay(timeOfDay);

    paused = false;

    // Debug log removed
}

// Show return to Earth button
function showReturnToEarthButton() {
    let btn = document.getElementById('returnToEarthBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'returnToEarthBtn';
        btn.className = 'game-btn';
        btn.textContent = '🌍 Return to Earth';
        btn.style.position = 'fixed';
        btn.style.top = '20px';
        btn.style.right = '20px';
        btn.style.zIndex = '1000';
        btn.style.padding = '10px 20px';
        btn.style.fontSize = '16px';
        btn.style.backgroundColor = '#4CAF50';
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.borderRadius = '5px';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', returnToEarth);
        document.body.appendChild(btn);
    }
    btn.style.display = 'block';
}

// Hide return to Earth button
function hideReturnToEarthButton() {
    const btn = document.getElementById('returnToEarthBtn');
    if (btn) btn.style.display = 'none';
}


// Check if car collides with any building and return collision info
