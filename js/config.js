// ============================================================================
// config.js - Game configuration, locations, and constants
// ============================================================================

const LOCS = {
    baltimore: { name: 'Baltimore', lat: 39.2904, lon: -76.6122 },
    hollywood: { name: 'Hollywood', lat: 34.0928, lon: -118.3287 },
    newyork: { name: 'New York', lat: 40.7580, lon: -73.9855 },
    miami: { name: 'Miami', lat: 25.7617, lon: -80.1918 },
    tokyo: { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
    monaco: { name: 'Monaco', lat: 43.7384, lon: 7.4246 },
    nurburgring: { name: 'Nürburgring', lat: 50.3356, lon: 6.9475 },
    lasvegas: { name: 'Las Vegas', lat: 36.1699, lon: -115.1398 },
    london: { name: 'London', lat: 51.5074, lon: -0.1278 },
    paris: { name: 'Paris', lat: 48.8566, lon: 2.3522 },
    dubai: { name: 'Dubai', lat: 25.2048, lon: 55.2708 }
};
const locKeys = Object.keys(LOCS);
const SCALE = 100000;
let LOC = { lat: 39.2904, lon: -76.6122 };
let customLoc = null;
const geoToWorld = (lat, lon) => ({ x: (lon - LOC.lon) * SCALE * Math.cos(LOC.lat * Math.PI / 180), z: -(lat - LOC.lat) * SCALE });

// =====================
// TERRAIN (Terrarium tiles)
// =====================

// AWS Terrarium tiles for elevation data
const TERRAIN_TILE_URL = (z, x, y) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

// Terrain settings
const TERRAIN_ZOOM = 13;           // 12–14 is typical for driving
const TERRAIN_RING = 1;            // 1 => 3x3 tiles around player
const TERRAIN_SEGMENTS = 128;       // mesh resolution per tile (128 for accurate road-terrain alignment)
const TERRAIN_Y_EXAGGERATION = 1.0; // 1.0 = real elevation

// Conversion factors
const METERS_PER_WORLD_UNIT = 111000 / SCALE;      // ~1.11
const WORLD_UNITS_PER_METER = 1 / METERS_PER_WORLD_UNIT; // ~0.90

// Tile caches
const terrainTileCache = new Map(); // key: `${z}/${x}/${y}` => {loaded, elev, w, h}
let terrainGroup = null;            // THREE.Group holding terrain meshes
let terrainEnabled = true;          // toggle for terrain system
let roadsNeedRebuild = true;        // rebuild roads after terrain loads
let lastRoadRebuildCheck = 0;       // throttle rebuild checks

// Land use styles for massive visual realism - ground truth rendering
const LANDUSE_STYLES = {
    residential: { color: 0xd4d4d4, name: 'Residential' },
    industrial: { color: 0x8c8c8c, name: 'Industrial' },
    commercial: { color: 0xb8b8b8, name: 'Commercial' },
    retail: { color: 0xc9c9c9, name: 'Retail' },
    forest: { color: 0x2d5016, name: 'Forest' },
    farmland: { color: 0x8b7355, name: 'Farmland' },
    grass: { color: 0x7cb342, name: 'Grass' },
    meadow: { color: 0x8bc34a, name: 'Meadow' },
    orchard: { color: 0x689f38, name: 'Orchard' },
    vineyard: { color: 0x7cb342, name: 'Vineyard' },
    water: { color: 0x4a90e2, name: 'Water' },
    wood: { color: 0x1b4d0d, name: 'Woods' },
    park: { color: 0x66bb6a, name: 'Park' },
    garden: { color: 0x81c784, name: 'Garden' },
    cemetery: { color: 0x558b2f, name: 'Cemetery' },
    allotments: { color: 0x8bc34a, name: 'Allotments' },
    recreation_ground: { color: 0x66bb6a, name: 'Recreation' },
    village_green: { color: 0x7cb342, name: 'Village Green' },
    quarry: { color: 0x9e9e9e, name: 'Quarry' },
    landfill: { color: 0x757575, name: 'Landfill' },
    construction: { color: 0xbdbdbd, name: 'Construction' },
    brownfield: { color: 0xa1887f, name: 'Brownfield' },
    greenfield: { color: 0x9ccc65, name: 'Greenfield' }
};

// POI types with icons and colors for meaning in the world
const POI_TYPES = {
    'amenity=school': { icon: '🏫', category: 'Education', color: 0x2196f3 },
    'amenity=hospital': { icon: '🏥', category: 'Healthcare', color: 0xf44336 },
    'amenity=clinic': { icon: '🏥', category: 'Healthcare', color: 0xe91e63 },
    'amenity=police': { icon: '👮', category: 'Safety', color: 0x1976d2 },
    'amenity=fire_station': { icon: '🚒', category: 'Safety', color: 0xff5722 },
    'amenity=parking': { icon: '🅿️', category: 'Transport', color: 0x607d8b },
    'amenity=fuel': { icon: '⛽', category: 'Services', color: 0xff9800 },
    'amenity=restaurant': { icon: '🍽️', category: 'Food', color: 0xef5350 },
    'amenity=cafe': { icon: '☕', category: 'Food', color: 0x8d6e63 },
    'amenity=bank': { icon: '🏦', category: 'Finance', color: 0x43a047 },
    'amenity=pharmacy': { icon: '💊', category: 'Healthcare', color: 0x66bb6a },
    'amenity=post_office': { icon: '📮', category: 'Services', color: 0x1e88e5 },
    'shop=supermarket': { icon: '🏪', category: 'Shopping', color: 0x4caf50 },
    'shop=mall': { icon: '🏬', category: 'Shopping', color: 0x9c27b0 },
    'shop=convenience': { icon: '🏪', category: 'Shopping', color: 0x66bb6a },
    'tourism=museum': { icon: '🏛️', category: 'Culture', color: 0x795548 },
    'tourism=hotel': { icon: '🏨', category: 'Hospitality', color: 0x00bcd4 },
    'tourism=attraction': { icon: '⭐', category: 'Tourism', color: 0xffc107 },
    'tourism=viewpoint': { icon: '👁️', category: 'Tourism', color: 0xff9800 },
    'historic=monument': { icon: '🗿', category: 'Historic', color: 0x8d6e63 },
    'historic=memorial': { icon: '🗿', category: 'Historic', color: 0x6d4c41 },
    'leisure=park': { icon: '🌳', category: 'Recreation', color: 0x66bb6a },
    'leisure=stadium': { icon: '🏟️', category: 'Sports', color: 0xffc107 },
    'leisure=sports_centre': { icon: '⚽', category: 'Sports', color: 0xff9800 },
    'leisure=playground': { icon: '🎪', category: 'Recreation', color: 0xe91e63 }
};    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (realEstateMode) loadPropertiesAtCurrentLocation();
        });
    }

    // Property type filter buttons
    const propertyTypeButtons = document.querySelectorAll('.property-type-btn');

    propertyTypeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons
            propertyTypeButtons.forEach(b => {
                b.style.background = '#e2e8f0';
                b.style.color = '#64748b';
                b.classList.remove('active');
            });

            // Add active class to clicked button
            btn.style.background = '#667eea';
            btn.style.color = '#ffffff';
            btn.classList.add('active');

            propertyTypeFilter = btn.dataset.type;

            // Update the panel
            if (realEstateMode) updatePropertyPanel();
        });
    });

    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', clearNavigation);
    }

    // Large Map Canvas Click Detection
    const largeMapCanvas = document.getElementById('largeMapCanvas');
    if (largeMapCanvas) {
        largeMapCanvas.addEventListener('click', (e) => {
            if (!showLargeMap) return;

            const rect = largeMapCanvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // Check if click is on a property marker
            if (mapLayers.properties && realEstateMode) {
                for (const prop of properties) {
                    const screenPos = worldToScreenLarge(prop.x, prop.z);
                    const dist = Math.sqrt((clickX - screenPos.x)**2 + (clickY - screenPos.y)**2);
                    if (dist < 10) {
                        showMapInfo('property', prop);
                        return;
                    }
                }
            }

            // Check if click is on a POI marker
            for (const poi of pois) {
                if (!isPOIVisible(poi.type)) continue;
                const screenPos = worldToScreenLarge(poi.x, poi.z);
                const dist = Math.sqrt((clickX - screenPos.x)**2 + (clickY - screenPos.y)**2);
                if (dist < 8) {
                    showMapInfo('poi', poi);
                    return;
                }
            }

            // Check if click is on a historic site
            if (mapLayers.historic && historicSites.length > 0) {
                for (const site of historicSites) {
                    const screenPos = worldToScreenLarge(site.x, site.z);
                    const dist = Math.sqrt((clickX - screenPos.x)**2 + (clickY - screenPos.y)**2);
                    if (dist < 8) {
                        showMapInfo('historic', site);
                        return;
                    }
                }
            }
        });

        largeMapCanvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!showLargeMap) return;

            const rect = largeMapCanvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const worldPos = largeMapScreenToWorld(clickX, clickY);
            teleportToLocation(worldPos.x, worldPos.z);
        });
    }

    // Settings Tab - API Keys
    const rentcastKeyInput = document.getElementById('rentcastKeyInput');
    const attomKeyInput = document.getElementById('attomKeyInput');
    const estatedKeyInput = document.getElementById('estatedKeyInput');
    const saveApiKeyBtn = document.getElementById('saveApiKey');
    const realEstateToggle = document.getElementById('realEstateToggle');
    const toggleLabel = document.getElementById('realEstateToggleLabel');

    // Load saved API keys from localStorage
    const savedRentcast = localStorage.getItem('rentcastApiKey');
    const savedAttom = localStorage.getItem('attomApiKey');
    const savedEstated = localStorage.getItem('estatedApiKey');

    if (savedRentcast) {
        apiConfig.rentcast = savedRentcast;
        if (rentcastKeyInput) rentcastKeyInput.value = savedRentcast;
    }
    if (savedAttom) {
        apiConfig.attom = savedAttom;
        if (attomKeyInput) attomKeyInput.value = savedAttom;
    }
    if (savedEstated) {
        apiConfig.estated = savedEstated;
        if (estatedKeyInput) estatedKeyInput.value = savedEstated;
    }

    // Load real estate mode preference
    const savedRealEstateMode = localStorage.getItem('realEstateEnabled');
    if (savedRealEstateMode === 'true') {
        if (realEstateToggle) realEstateToggle.checked = true;
        if (toggleLabel) toggleLabel.style.background = '#f0f4ff';
    }

    // Save API keys
    if (saveApiKeyBtn) {
        saveApiKeyBtn.addEventListener('click', () => {
            let savedCount = 0;

            // Save Estated
            if (estatedKeyInput) {
                const key = estatedKeyInput.value.trim();
                if (key) {
                    apiConfig.estated = key;
                    localStorage.setItem('estatedApiKey', key);
                    savedCount++;
                } else {
                    apiConfig.estated = null;
                    localStorage.removeItem('estatedApiKey');
                }
            }

            // Save ATTOM
            if (attomKeyInput) {
                const key = attomKeyInput.value.trim();
                if (key) {
                    apiConfig.attom = key;
                    localStorage.setItem('attomApiKey', key);
                    savedCount++;
                } else {
                    apiConfig.attom = null;
                    localStorage.removeItem('attomApiKey');
                }
            }

            // Save RentCast
            if (rentcastKeyInput) {
                const key = rentcastKeyInput.value.trim();
                if (key) {
                    apiConfig.rentcast = key;
                    localStorage.setItem('rentcastApiKey', key);
                    savedCount++;
                } else {
                    apiConfig.rentcast = null;
                    localStorage.removeItem('rentcastApiKey');
                }
            }

            // Show feedback
            if (savedCount > 0) {
                saveApiKeyBtn.textContent = `✓ Saved ${savedCount} API Key${savedCount > 1 ? 's' : ''}!`;
                saveApiKeyBtn.style.background = '#10b981';
            } else {
                saveApiKeyBtn.textContent = '✓ All Keys Cleared!';
                saveApiKeyBtn.style.background = '#64748b';
            }

            setTimeout(() => {
                saveApiKeyBtn.textContent = '💾 Save All API Keys';
                saveApiKeyBtn.style.background = '#667eea';
            }, 2000);
        });
    }

    // Real estate toggle
    if (realEstateToggle && toggleLabel) {
        realEstateToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            localStorage.setItem('realEstateEnabled', enabled);
            toggleLabel.style.background = enabled ? '#f0f4ff' : '#f8fafc';
            toggleLabel.style.borderColor = enabled ? '#667eea' : '#e2e8f0';
        });
    }

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    }));
    // Locations
    document.querySelectorAll('.loc').forEach(el => el.addEventListener('click', () => {
        document.querySelectorAll('.loc').forEach(e => e.classList.remove('sel'));
        el.classList.add('sel');
        selLoc = el.dataset.loc;
        document.getElementById('customPanel').classList.toggle('show', selLoc === 'custom');
    }));
    // Custom location search - universal search for any location
    document.getElementById('locationSearchBtn').addEventListener('click', searchLocation);
    document.getElementById('locationSearch').addEventListener('keypress', e => { if (e.key === 'Enter') searchLocation(); });
    // Game modes
    document.querySelectorAll('.mode').forEach(el => el.addEventListener('click', () => {
        document.querySelectorAll('.mode').forEach(e => e.classList.remove('sel'));
        el.classList.add('sel');
        gameMode = el.dataset.mode;
    }));
    // Start
    document.getElementById('startBtn').addEventListener('click', async () => {
        document.getElementById('titleScreen').classList.add('hidden');
        document.getElementById('hud').classList.add('show');
        document.getElementById('minimap').classList.add('show');
        document.getElementById('modeHud').classList.add('show');
        document.getElementById('floatMenuContainer').classList.add('show');
        document.getElementById('mainMenuBtn').classList.add('show');
        document.getElementById('controlsTab').classList.add('show');
        document.getElementById('coords').classList.add('show');
        document.getElementById('historicBtn').classList.add('show');
        gameStarted = true;
        switchEnv(ENV.EARTH);

        // Show exploration mode message
        const explorationMsg = document.getElementById('explorationModeMsg');
        // Debug log removed
        let explorationMsgTimeout;

        if (explorationMsg) {
            // Debug log removed
            explorationMsg.style.display = 'block';
            explorationMsg.style.opacity = '0';

            // Function to hide the message
            const hideExplorationMsg = () => {
                // Debug log removed
                if (explorationMsgTimeout) clearTimeout(explorationMsgTimeout);
                explorationMsg.style.opacity = '0';
                setTimeout(() => {
                    explorationMsg.style.display = 'none';
                }, 500);
            };

            // Hide on click
            explorationMsg.addEventListener('click', hideExplorationMsg, { once: true });

            // Fade in
            setTimeout(() => {
                explorationMsg.style.transition = 'opacity 0.5s';
                explorationMsg.style.opacity = '1';
                // Debug log removed
            }, 100);

            // Fade out after 5 seconds
            explorationMsgTimeout = setTimeout(() => {
                hideExplorationMsg();
            }, 5000);
        }

        // Always start in driving mode
        if (carMesh) carMesh.visible = true;
        if (Walk && Walk.state.characterMesh) Walk.state.characterMesh.visible = false;

        // Set initial mode button state
        document.getElementById('fDriving').classList.add('on');
        document.getElementById('fWalk').classList.remove('on');
        document.getElementById('fDrone').classList.remove('on');

        // Set initial map view button states
        document.getElementById('mapRoadsToggle').classList.add('active'); // Roads on by default
        document.getElementById('fLandUse').classList.add('on'); // Land use on by default
        document.getElementById('fLandUseRE').classList.add('on'); // Land use on by default

        await loadRoads();
    });

    // Helper function to close all float menus
    function closeAllFloatMenus() {
        document.querySelectorAll('.floatMenu').forEach(m => m.classList.remove('open'));
    }

    // Float menu
    // Three separate float menu buttons
    document.getElementById('travelBtn').addEventListener('click', () => {
        const menu = document.getElementById('travelMenu');
        const isOpen = menu.classList.contains('open');
        // Close all menus
        document.querySelectorAll('.floatMenu').forEach(m => m.classList.remove('open'));
        // Toggle this menu
        if (!isOpen) menu.classList.add('open');
    });
    document.getElementById('realEstateFloatBtn').addEventListener('click', () => {
        const menu = document.getElementById('realEstateMenu');
        const isOpen = menu.classList.contains('open');
        document.querySelectorAll('.floatMenu').forEach(m => m.classList.remove('open'));
        if (!isOpen) menu.classList.add('open');
    });
    document.getElementById('exploreBtn').addEventListener('click', () => {
        const menu = document.getElementById('exploreMenu');
        const isOpen = menu.classList.contains('open');
        document.querySelectorAll('.floatMenu').forEach(m => m.classList.remove('open'));
        if (!isOpen) menu.classList.add('open');
    });
    document.getElementById('gameBtn').addEventListener('click', () => {
        const menu = document.getElementById('gameMenu');
        const isOpen = menu.classList.contains('open');
        document.querySelectorAll('.floatMenu').forEach(m => m.classList.remove('open'));
        if (!isOpen) menu.classList.add('open');
    });

    document.getElementById('fHome').addEventListener('click', () => {
        gameStarted = false; paused = false; clearObjectives(); clearPolice(); policeOn = false; eraseTrack(); closePropertyPanel(); closeHistoricPanel(); clearPropertyMarkers(); realEstateMode = false; historicMode = false;
        document.querySelectorAll('.floatMenu').forEach(m => m.classList.remove('open'));
        document.getElementById('titleScreen').classList.remove('hidden');
        ['hud','minimap','modeHud','police','floatMenuContainer','mainMenuBtn','pauseScreen','resultScreen','caughtScreen','controlsTab','coords','realEstateBtn','historicBtn'].forEach(id => document.getElementById(id).classList.remove('show'));
    });
    document.getElementById('fNextCity').addEventListener('click', () => { nextCity(); closeAllFloatMenus(); });
    document.getElementById('fSatellite').addEventListener('click', () => {
        satelliteView = !satelliteView;
        document.getElementById('fSatellite').classList.toggle('on', satelliteView);
        document.getElementById('mapSatelliteToggle').classList.toggle('active', satelliteView);
        closeAllFloatMenus();
    });
    document.getElementById('fRoads').addEventListener('click', () => {
        showRoads = !showRoads;
        document.getElementById('fRoads').classList.toggle('on', showRoads);
        document.getElementById('mapRoadsToggle').classList.toggle('active', showRoads);
        closeAllFloatMenus();
    });
    document.getElementById('fLandUse').addEventListener('click', () => {
        landUseVisible = !landUseVisible;
        document.getElementById('fLandUse').classList.toggle('on', landUseVisible);
        document.getElementById('fLandUseRE').classList.toggle('on', landUseVisible);
        // Update visibility of land use meshes
        landuseMeshes.forEach(m => { m.visible = landUseVisible; });
        closeAllFloatMenus();
    });
    document.getElementById('fLandUseRE').addEventListener('click', () => {
        landUseVisible = !landUseVisible;
        document.getElementById('fLandUse').classList.toggle('on', landUseVisible);
        document.getElementById('fLandUseRE').classList.toggle('on', landUseVisible);
        // Update visibility of land use meshes
        landuseMeshes.forEach(m => { m.visible = landUseVisible; });
        closeAllFloatMenus();
    });
    document.getElementById('fTimeOfDay').addEventListener('click', () => { cycleTimeOfDay(); });
    document.getElementById('fPolice').addEventListener('click', () => {
        policeOn = !policeOn;
        document.getElementById('fPolice').classList.toggle('on', policeOn);
        document.getElementById('police').classList.toggle('show', policeOn);
        if (policeOn) spawnPolice(); else clearPolice();
        closeAllFloatMenus();
    });
    // Travel mode switchers - mutually exclusive
    document.getElementById('fDriving').addEventListener('click', () => {
        // Switch to driving mode
        droneMode = false;
        if (Walk && Walk.state.mode === 'walk') {
            Walk.setModeDrive();
        }

        // Clear star selection
        clearStarSelection();

        // Update button states
        document.getElementById('fDriving').classList.add('on');
        document.getElementById('fWalk').classList.remove('on');
        document.getElementById('fDrone').classList.remove('on');
        closeAllFloatMenus();
    });

    document.getElementById('fWalk').addEventListener('click', () => {
        // Switch to walking mode
        droneMode = false;
        if (Walk) {
            if (Walk.state.mode !== 'walk') {
                Walk.toggleWalk();
            }

            // Clear star selection
            clearStarSelection();

            // Update button states
            document.getElementById('fDriving').classList.remove('on');
            document.getElementById('fWalk').classList.add('on');
            document.getElementById('fDrone').classList.remove('on');
        }
        closeAllFloatMenus();
    });

    document.getElementById('fDrone').addEventListener('click', () => {
        // Switch to drone mode
        if (!droneMode) {
            droneMode = true;

            // Disable walking mode if active
            if (Walk && Walk.state.mode === 'walk') {
                Walk.setModeDrive();
            }

            // Initialize drone position above current position
            const ref = Walk ? Walk.getMapRefPosition(false, null) : { x: car.x, z: car.z };
            drone.x = ref.x;
            drone.y = 50;
            drone.z = ref.z;
            drone.pitch = -0.3;
            drone.yaw = car.angle;
            drone.roll = 0;
        }

        // Clear star selection
        clearStarSelection();

        // Update button states
        document.getElementById('fDriving').classList.remove('on');
        document.getElementById('fWalk').classList.remove('on');
        document.getElementById('fDrone').classList.add('on');
        closeAllFloatMenus();
    });

    document.getElementById('fSpaceDirect').addEventListener('click', () => {
        if (onMoon) {
            returnToEarth();
        } else if (!travelingToMoon) {
            directTravelToMoon();
        }
        closeAllFloatMenus();
    });
    document.getElementById('fSpaceRocket').addEventListener('click', () => {
        if (onMoon) {
            returnToEarth();
        } else if (!travelingToMoon) {
            travelToMoon();
        }
        closeAllFloatMenus();
    });
    document.getElementById('fRealEstate').addEventListener('click', () => {
        toggleRealEstate();
        document.getElementById('fRealEstate').classList.toggle('on', realEstateMode);
        closeAllFloatMenus();
    });
    document.getElementById('fHistoric').addEventListener('click', () => {
        toggleHistoric();
        document.getElementById('fHistoric').classList.toggle('on', historicMode);
        closeAllFloatMenus();
    });
    document.getElementById('fPOI').addEventListener('click', () => {
        poiMode = !poiMode;
        document.getElementById('fPOI').classList.toggle('on', poiMode);
        closeAllFloatMenus();
    });
    document.getElementById('fRespawn').addEventListener('click', () => { spawnOnRoad(); closeAllFloatMenus(); });
    document.getElementById('fRespawnRand').addEventListener('click', () => {
        if (roads.length > 0) {
            const rd = roads[Math.floor(Math.random() * roads.length)];
            const idx = Math.floor(Math.random() * rd.pts.length);
            car.x = rd.pts[idx].x; car.z = rd.pts[idx].z;
            if (idx < rd.pts.length - 1) car.angle = Math.atan2(rd.pts[idx+1].x - rd.pts[idx].x, rd.pts[idx+1].z - rd.pts[idx].z);
            car.speed = 0; car.vx = 0; car.vz = 0;
            carMesh.position.set(car.x, 0, car.z); carMesh.rotation.y = car.angle;
        }
        closeAllFloatMenus();
    });
    document.getElementById('fTrack').addEventListener('click', () => { toggleTrackRecording(); closeAllFloatMenus(); });
    document.getElementById('fEraseTrack').addEventListener('click', () => { eraseTrack(); closeAllFloatMenus(); });
    document.getElementById('fClouds').addEventListener('click', () => {
        cloudsVisible = !cloudsVisible;
        if (cloudGroup) cloudGroup.visible = cloudsVisible;
        document.getElementById('fClouds').classList.toggle('on', !cloudsVisible);
        closeAllFloatMenus();
    });
    document.getElementById('fConstellations').addEventListener('click', () => {
        constellationsVisible = !constellationsVisible;
        if (allConstellationLines) allConstellationLines.visible = constellationsVisible;
        document.getElementById('fConstellations').classList.toggle('on', constellationsVisible);
        closeAllFloatMenus();
    });
    document.getElementById('ctrlHeader').addEventListener('click', () => document.getElementById('ctrlContent').classList.toggle('hidden'));

    // Main Menu Button
    document.getElementById('mainMenuBtn').addEventListener('click', () => {
        document.getElementById('fHome').click();
    });

    // Close float menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!gameStarted) return;

        // Check if click is outside float menu container
        const floatContainer = document.getElementById('floatMenuContainer');
        const mainMenuBtn = document.getElementById('mainMenuBtn');

        if (!floatContainer.contains(e.target) && e.target !== mainMenuBtn) {
            closeAllFloatMenus();
        }
    });

    document.getElementById('resumeBtn').addEventListener('click', () => { paused = false; document.getElementById('pauseScreen').classList.remove('show'); });
    document.getElementById('restartBtn').addEventListener('click', () => { paused = false; document.getElementById('pauseScreen').classList.remove('show'); startMode(); });
    document.getElementById('menuBtn').addEventListener('click', () => document.getElementById('fHome').click());
    document.getElementById('caughtBtn').addEventListener('click', () => { document.getElementById('caughtScreen').classList.remove('show'); policeHits = 0; paused = false; document.getElementById('police').textContent = '💔 0/3'; spawnOnRoad(); });
    document.getElementById('againBtn').addEventListener('click', () => { hideResult(); paused = false; startMode(); });
    document.getElementById('freeBtn').addEventListener('click', () => { hideResult(); paused = false; gameMode = 'free'; clearObjectives(); });
    document.getElementById('resMenuBtn').addEventListener('click', () => { hideResult(); document.getElementById('fHome').click(); });

    // Map controls
    document.getElementById('minimap').addEventListener('click', () => {
        showLargeMap = true;
        document.getElementById('largeMap').classList.add('show');
    });
    document.getElementById('minimap').addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const worldPos = minimapScreenToWorld(x, y);
        teleportToLocation(worldPos.x, worldPos.z);
    });
    document.getElementById('mapClose').addEventListener('click', () => {
        showLargeMap = false;
        document.getElementById('largeMap').classList.remove('show');
    });
    document.getElementById('mapLegend').addEventListener('click', (e) => {
        e.stopPropagation();
        const legend = document.getElementById('legendPanel');
        legend.style.display = legend.style.display === 'none' ? 'block' : 'none';
    });
    document.getElementById('largeMap').addEventListener('click', (e) => {
        if (e.target.id === 'largeMap') {
            showLargeMap = false;
            document.getElementById('largeMap').classList.remove('show');
        }
    });
    document.getElementById('mapSatelliteToggle').addEventListener('click', (e) => {
        e.stopPropagation();
        satelliteView = !satelliteView;
        document.getElementById('mapSatelliteToggle').classList.toggle('active', satelliteView);
        document.getElementById('fSatellite').classList.toggle('on', satelliteView);
    });
    document.getElementById('mapRoadsToggle').addEventListener('click', (e) => {
        e.stopPropagation();
        showRoads = !showRoads;
        document.getElementById('mapRoadsToggle').classList.toggle('active', showRoads);
        document.getElementById('fRoads').classList.toggle('on', showRoads);
    });
    document.getElementById('mapZoomIn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (largeMapZoom < 18) {
            largeMapZoom++;
            document.getElementById('zoomLevel').textContent = 'Z: ' + largeMapZoom;
        }
    });
    document.getElementById('mapZoomOut').addEventListener('click', (e) => {
        e.stopPropagation();
        if (largeMapZoom > 10) {
            largeMapZoom--;
            document.getElementById('zoomLevel').textContent = 'Z: ' + largeMapZoom;
        }
    });
}

// Entry point - initialize the application
init();
// Conversion factors
const METERS_PER_WORLD_UNIT = 111000 / SCALE;      // ~1.11
const WORLD_UNITS_PER_METER = 1 / METERS_PER_WORLD_UNIT; // ~0.90

// Tile caches
const terrainTileCache = new Map(); // key: `${z}/${x}/${y}` => {loaded, elev, w, h}
let terrainGroup = null;            // THREE.Group holding terrain meshes
let terrainEnabled = true;          // toggle for terrain system
let roadsNeedRebuild = true;        // rebuild roads after terrain loads
let lastRoadRebuildCheck = 0;       // throttle rebuild checks

// Land use styles for massive visual realism - ground truth rendering
const LANDUSE_STYLES = {
    residential: { color: 0xd4d4d4, name: 'Residential' },
    industrial: { color: 0x8c8c8c, name: 'Industrial' },
    commercial: { color: 0xb8b8b8, name: 'Commercial' },
    retail: { color: 0xc9c9c9, name: 'Retail' },
    forest: { color: 0x2d5016, name: 'Forest' },
    farmland: { color: 0x8b7355, name: 'Farmland' },
    grass: { color: 0x7cb342, name: 'Grass' },
    meadow: { color: 0x8bc34a, name: 'Meadow' },
    orchard: { color: 0x689f38, name: 'Orchard' },
    vineyard: { color: 0x7cb342, name: 'Vineyard' },
    water: { color: 0x4a90e2, name: 'Water' },
    wood: { color: 0x1b4d0d, name: 'Woods' },
    park: { color: 0x66bb6a, name: 'Park' },
    garden: { color: 0x81c784, name: 'Garden' },
    cemetery: { color: 0x558b2f, name: 'Cemetery' },
    allotments: { color: 0x8bc34a, name: 'Allotments' },
    recreation_ground: { color: 0x66bb6a, name: 'Recreation' },
    village_green: { color: 0x7cb342, name: 'Village Green' },
    quarry: { color: 0x9e9e9e, name: 'Quarry' },
    landfill: { color: 0x757575, name: 'Landfill' },
    construction: { color: 0xbdbdbd, name: 'Construction' },
    brownfield: { color: 0xa1887f, name: 'Brownfield' },
    greenfield: { color: 0x9ccc65, name: 'Greenfield' }
};

// POI types with icons and colors for meaning in the world
const POI_TYPES = {
    'amenity=school': { icon: '🏫', category: 'Education', color: 0x2196f3 },
    'amenity=hospital': { icon: '🏥', category: 'Healthcare', color: 0xf44336 },
    'amenity=clinic': { icon: '🏥', category: 'Healthcare', color: 0xe91e63 },
    'amenity=police': { icon: '👮', category: 'Safety', color: 0x1976d2 },
    'amenity=fire_station': { icon: '🚒', category: 'Safety', color: 0xff5722 },
    'amenity=parking': { icon: '🅿️', category: 'Transport', color: 0x607d8b },
    'amenity=fuel': { icon: '⛽', category: 'Services', color: 0xff9800 },
    'amenity=restaurant': { icon: '🍽️', category: 'Food', color: 0xef5350 },
    'amenity=cafe': { icon: '☕', category: 'Food', color: 0x8d6e63 },
    'amenity=bank': { icon: '🏦', category: 'Finance', color: 0x43a047 },
    'amenity=pharmacy': { icon: '💊', category: 'Healthcare', color: 0x66bb6a },
    'amenity=post_office': { icon: '📮', category: 'Services', color: 0x1e88e5 },
    'shop=supermarket': { icon: '🏪', category: 'Shopping', color: 0x4caf50 },
    'shop=mall': { icon: '🏬', category: 'Shopping', color: 0x9c27b0 },
    'shop=convenience': { icon: '🏪', category: 'Shopping', color: 0x66bb6a },
    'tourism=museum': { icon: '🏛️', category: 'Culture', color: 0x795548 },
    'tourism=hotel': { icon: '🏨', category: 'Hospitality', color: 0x00bcd4 },
    'tourism=attraction': { icon: '⭐', category: 'Tourism', color: 0xffc107 },
    'tourism=viewpoint': { icon: '👁️', category: 'Tourism', color: 0xff9800 },
    'historic=monument': { icon: '🗿', category: 'Historic', color: 0x8d6e63 },
    'historic=memorial': { icon: '🗿', category: 'Historic', color: 0x6d4c41 },
    'leisure=park': { icon: '🌳', category: 'Recreation', color: 0x66bb6a },
    'leisure=stadium': { icon: '🏟️', category: 'Sports', color: 0xffc107 },
    'leisure=sports_centre': { icon: '⚽', category: 'Sports', color: 0xff9800 },
    'leisure=playground': { icon: '🎪', category: 'Recreation', color: 0xe91e63 }
};
