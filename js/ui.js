// ============================================================================
// ui.js - UI setup, event binding, button handlers
// ============================================================================

function setupUI() {
    // Initialize Property UI References
    PropertyUI.panel = document.getElementById('propertyPanel');
    PropertyUI.list = document.getElementById('propertyList');
    PropertyUI.modal = document.getElementById('propertyModal');
    PropertyUI.modalTitle = document.getElementById('modalTitle');
    PropertyUI.modalBody = document.getElementById('modalBody');
    PropertyUI.button = document.getElementById('realEstateBtn');

    // Real Estate Button
    if (PropertyUI.button) {
        PropertyUI.button.addEventListener('click', toggleRealEstate);
    }

    // Historic Sites Button
    const historicBtn = document.getElementById('historicBtn');
    if (historicBtn) {
        historicBtn.addEventListener('click', toggleHistoric);
    }

    // Property Controls
    const radiusSlider = document.getElementById('radiusSlider');
    const radiusValue = document.getElementById('radiusValue');
    const sortSelect = document.getElementById('sortSelect');
    const refreshBtn = document.getElementById('refreshProperties');
    const clearFilterBtn = document.getElementById('clearPropertyFilter');

    if (radiusSlider && radiusValue) {
        radiusSlider.addEventListener('input', (e) => {
            propertyRadius = parseFloat(e.target.value);
            radiusValue.textContent = propertyRadius.toFixed(1) + ' km';
            if (realEstateMode) updatePropertyPanel();
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            propertySort = e.target.value;
            if (realEstateMode) updatePropertyPanel();
        });
    }

    if (refreshBtn) {
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
            if (poiMode && pois.length > 0) {
                for (const poi of pois) {
                    if (!isPOIVisible(poi.type)) continue;
                    const screenPos = worldToScreenLarge(poi.x, poi.z);
                    const dist = Math.sqrt((clickX - screenPos.x)**2 + (clickY - screenPos.y)**2);
                    if (dist < 8) {
                        showMapInfo('poi', poi);
                        return;
                    }
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
    const suggestedPanel = document.getElementById('suggestedPanel');
    const customPanel = document.getElementById('customPanel');

    const getSelectedSuggestedLoc = () => {
        const selected = document.querySelector('#suggestedPanel .loc.sel');
        if (selected) return selected.dataset.loc;
        const fallback = document.querySelector('#suggestedPanel .loc[data-loc="baltimore"]');
        if (fallback) {
            fallback.classList.add('sel');
            return fallback.dataset.loc;
        }
        return 'baltimore';
    };

    const selectSuggestedLocationCard = (targetEl) => {
        if (!suggestedPanel || !targetEl) return;
        const selectedLoc = targetEl.closest('.loc[data-loc]');
        if (!selectedLoc) return;
        suggestedPanel.querySelectorAll('.loc').forEach(e => e.classList.remove('sel'));
        selectedLoc.classList.add('sel');
        selLoc = selectedLoc.dataset.loc;
        if (customPanel) customPanel.classList.add('show');
    };

    if (suggestedPanel) {
        suggestedPanel.addEventListener('click', (event) => {
            const clickTarget = event.target;
            if (!(clickTarget instanceof Element)) return;
            selectSuggestedLocationCard(clickTarget);
        });
    }

    // Exposed so inline handlers and searchLocation can force suggested selection.
    globalThis.selectSuggestedLocationCard = selectSuggestedLocationCard;

    if (customPanel) customPanel.classList.add('show');
    if (suggestedPanel) suggestedPanel.classList.add('show');
    if (selLoc !== 'custom') {
        selLoc = getSelectedSuggestedLoc();
    }

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

        // Load visible terrain immediately so grass appears even while road APIs are pending.
        if (typeof updateTerrainAround === 'function' && terrainEnabled && !onMoon) {
            const startRef = (Walk && Walk.state && Walk.state.walker)
                ? Walk.state.walker
                : car;
            updateTerrainAround(startRef.x || 0, startRef.z || 0);
        }

        // Load roads and world data (may take longer if Overpass endpoints are slow).
        await loadRoads();

        // Refresh terrain around final spawn/reference position after roads finish.
        if (typeof updateTerrainAround === 'function' && terrainEnabled && !onMoon) {
            const postLoadRef = (Walk && Walk.state && Walk.state.mode === 'walk' && Walk.state.walker)
                ? Walk.state.walker
                : car;
            updateTerrainAround(postLoadRef.x || 0, postLoadRef.z || 0);
        }

        // Start in WALKING mode with third-person camera
        if (Walk) {
            Walk.setModeWalk();
            Walk.state.view = 'third'; // Ensure third-person view
            if (carMesh) carMesh.visible = false;
            if (Walk.state.characterMesh) Walk.state.characterMesh.visible = true;

            // Force initial camera to third-person position behind character
            // Without this, camera starts at origin and looks like first person
            const w = Walk.state.walker;
            const back = Walk.CFG.thirdPersonDist;
            const up = Walk.CFG.thirdPersonHeight;
            camera.position.set(
                w.x - Math.sin(w.yaw) * back,
                w.y + up,
                w.z - Math.cos(w.yaw) * back
            );
            camera.lookAt(w.x, w.y, w.z);

            // Update UI button states to reflect walking mode
            document.getElementById('fDriving').classList.remove('on');
            document.getElementById('fWalk').classList.add('on');
            document.getElementById('fDrone').classList.remove('on');
        } else {
            // Fallback to driving if Walk module not available
            if (carMesh) carMesh.visible = true;
            document.getElementById('fDriving').classList.add('on');
            document.getElementById('fWalk').classList.remove('on');
            document.getElementById('fDrone').classList.remove('on');
        }

        // Set initial map view button states
        document.getElementById('mapRoadsToggle').classList.add('active'); // Roads on by default
        // Land use OFF by default (user can toggle on if needed)
        document.getElementById('fLandUse').classList.remove('on');
        document.getElementById('fLandUseRE').classList.remove('on');
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
        // Keep water features visible even when general land-use overlay is off.
        landuseMeshes.forEach(m => { m.visible = landUseVisible || !!m.userData?.alwaysVisible; });
        closeAllFloatMenus();
    });
    document.getElementById('fLandUseRE').addEventListener('click', () => {
        landUseVisible = !landUseVisible;
        document.getElementById('fLandUse').classList.toggle('on', landUseVisible);
        document.getElementById('fLandUseRE').classList.toggle('on', landUseVisible);
        // Keep water features visible even when general land-use overlay is off.
        landuseMeshes.forEach(m => { m.visible = landUseVisible || !!m.userData?.alwaysVisible; });
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
        if (Walk) {
            Walk.setModeDrive();
        }
        if (typeof camMode !== 'undefined') camMode = 0;
        if (carMesh) carMesh.visible = true;

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
            drone.z = ref.z;
            drone.yaw = car.angle;
            drone.roll = 0;

            // On the moon, raycast to find actual ground height so drone spawns near surface
            if (onMoon && moonSurface) {
                const rc = _getPhysRaycaster();
                _physRayStart.set(ref.x, 2000, ref.z);
                rc.set(_physRayStart, _physRayDir);
                const hits = rc.intersectObject(moonSurface, false);
                drone.y = (hits.length > 0 ? hits[0].point.y : -100) + 10;
                drone.pitch = -0.2;
            } else {
                drone.y = 50;
                drone.pitch = -0.3;
            }
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
        poiMeshes.forEach(m => {
            if (m) m.visible = !!poiMode;
        });
        if (!poiMode) {
            const poiInfo = document.getElementById('poiInfo');
            if (poiInfo) poiInfo.style.display = 'none';
        }
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
            const _respawnH = typeof terrainMeshHeightAt === 'function' ? terrainMeshHeightAt : elevationWorldYAtWorldXZ;
            const spawnY = (typeof GroundHeight !== 'undefined' && GroundHeight && typeof GroundHeight.carCenterY === 'function')
                ? GroundHeight.carCenterY(car.x, car.z, true, 1.2)
                : _respawnH(car.x, car.z) + 1.2;
            car.y = spawnY;
            carMesh.position.set(car.x, spawnY, car.z); carMesh.rotation.y = car.angle;
            if (Walk && Walk.state && Walk.state.walker) {
                const groundY = spawnY - 1.2;
                Walk.state.walker.x = car.x;
                Walk.state.walker.z = car.z;
                Walk.state.walker.y = groundY + 1.7;
                Walk.state.walker.vy = 0;
                Walk.state.walker.angle = car.angle;
                Walk.state.walker.yaw = car.angle;
                if (Walk.state.characterMesh && Walk.state.mode === 'walk') {
                    Walk.state.characterMesh.position.set(car.x, groundY, car.z);
                    Walk.state.characterMesh.rotation.y = car.angle;
                }
            }
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
Object.assign(globalThis, { setupUI });

export { setupUI };

init();
