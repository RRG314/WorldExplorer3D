// ============================================================================
// world.js - OSM data loading, roads, buildings, landuse, POIs
// ============================================================================

async function loadRoads() {
    const locName = selLoc === 'custom' ? (customLoc?.name || 'Custom') : LOCS[selLoc].name;
    showLoad('Loading ' + locName + '...');
    roadMeshes.forEach(m => scene.remove(m)); roadMeshes = []; roads = [];
    buildingMeshes.forEach(m => scene.remove(m)); buildingMeshes = []; buildings = [];
    landuseMeshes.forEach(m => scene.remove(m)); landuseMeshes = []; landuses = [];
    poiMeshes.forEach(m => scene.remove(m)); poiMeshes = []; pois = [];
    historicMarkers.forEach(m => scene.remove(m)); historicMarkers = []; historicSites = [];
    streetFurnitureMeshes.forEach(m => scene.remove(m)); streetFurnitureMeshes = [];
    _signTextureCache.clear(); _geoSignText = null;

    // Flag that roads will need rebuilding after terrain loads
    roadsNeedRebuild = true;

    if (selLoc === 'custom') {
        const lat = parseFloat(document.getElementById('customLat').value);
        const lon = parseFloat(document.getElementById('customLon').value);
        if (isNaN(lat) || isNaN(lon)) { showLoad('Enter valid coordinates'); return; }
        LOC = { lat, lon };
        customLoc = { lat, lon, name: customLoc?.name || 'Custom' };
    } else {
        LOC = { lat: LOCS[selLoc].lat, lon: LOCS[selLoc].lon };
    }

    const radii = [0.02, 0.025, 0.03];
    let loaded = false;

    for (const r of radii) {
        if (loaded) break;
        try {
            showLoad('Loading map data...');
            // Load roads, buildings, landuse, and POIs in one comprehensive query
            const q = `[out:json][timeout:30];(
                way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential)$"](${LOC.lat-r},${LOC.lon-r},${LOC.lat+r},${LOC.lon+r});
                way["building"](${LOC.lat-r},${LOC.lon-r},${LOC.lat+r},${LOC.lon+r});
                way["landuse"](${LOC.lat-r},${LOC.lon-r},${LOC.lat+r},${LOC.lon+r});
                way["natural"~"water|wood"](${LOC.lat-r},${LOC.lon-r},${LOC.lat+r},${LOC.lon+r});
                way["leisure"="park"](${LOC.lat-r},${LOC.lon-r},${LOC.lat+r},${LOC.lon+r});
                node["amenity"~"school|hospital|police|fire_station|parking|fuel|restaurant|cafe|bank|pharmacy|post_office"](${LOC.lat-r},${LOC.lon-r},${LOC.lat+r},${LOC.lon+r});
                node["shop"](${LOC.lat-r},${LOC.lon-r},${LOC.lat+r},${LOC.lon+r});
                node["tourism"](${LOC.lat-r},${LOC.lon-r},${LOC.lat+r},${LOC.lon+r});
                node["historic"](${LOC.lat-r},${LOC.lon-r},${LOC.lat+r},${LOC.lon+r});
                node["leisure"~"park|stadium|sports_centre|playground"](${LOC.lat-r},${LOC.lon-r},${LOC.lat+r},${LOC.lon+r});
            );out body;>;out skel qt;`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);
            const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: controller.signal });
            clearTimeout(timeoutId);
            const data = await res.json();
            const nodes = {};
            data.elements.filter(e => e.type === 'node').forEach(n => nodes[n.id] = n);

            // Process roads
            data.elements.filter(e => e.type === 'way' && e.tags?.highway).forEach(way => {
                const pts = way.nodes.map(id => nodes[id]).filter(n => n).map(n => geoToWorld(n.lat, n.lon));
                if (pts.length < 2) return;
                const type = way.tags?.highway || 'residential';
                const width = type.includes('motorway') ? 16 : type.includes('trunk') ? 14 : type.includes('primary') ? 12 : type.includes('secondary') ? 10 : 8;
                const limit = type.includes('motorway') ? 65 : type.includes('trunk') ? 55 : type.includes('primary') ? 40 : type.includes('secondary') ? 35 : 25;
                const name = way.tags?.name || type.charAt(0).toUpperCase() + type.slice(1);
                roads.push({ pts, width, limit, name, type });
                const hw = width / 2;
                const verts = [], indices = [];
                for (let i = 0; i < pts.length; i++) {
                    const p = pts[i];
                    let dx, dz;
                    if (i === 0) { dx = pts[1].x - p.x; dz = pts[1].z - p.z; }
                    else if (i === pts.length - 1) { dx = p.x - pts[i-1].x; dz = p.z - pts[i-1].z; }
                    else { dx = pts[i+1].x - pts[i-1].x; dz = pts[i+1].z - pts[i-1].z; }
                    const len = Math.sqrt(dx*dx + dz*dz) || 1;
                    const nx = -dz / len, nz = dx / len;

                    // Get terrain elevation at each road edge vertex directly
                    const _tmh = typeof terrainMeshHeightAt === 'function' ? terrainMeshHeightAt : elevationWorldYAtWorldXZ;
                    const y1 = _tmh(p.x + nx * hw, p.z + nz * hw) + 0.2;
                    const y2 = _tmh(p.x - nx * hw, p.z - nz * hw) + 0.2;
                    verts.push(p.x + nx * hw, y1, p.z + nz * hw);
                    verts.push(p.x - nx * hw, y2, p.z - nz * hw);
                    if (i < pts.length - 1) { const vi = i * 2; indices.push(vi, vi+1, vi+2, vi+1, vi+3, vi+2); }
                }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
                geo.setIndex(indices);
                geo.computeVertexNormals();
                const roadMat = asphaltTex ? new THREE.MeshStandardMaterial({
                    map: asphaltTex,
                    roughness: 0.95,
                    metalness: 0.05,
                    side: THREE.DoubleSide,
                    polygonOffset: true,
                    polygonOffsetFactor: -2,
                    polygonOffsetUnits: -2
                }) : new THREE.MeshStandardMaterial({
                    color: 0x333333,
                    roughness: 0.95,
                    metalness: 0.05,
                    side: THREE.DoubleSide,
                    polygonOffset: true,
                    polygonOffsetFactor: -2,
                    polygonOffsetUnits: -2
                });
                const mesh = new THREE.Mesh(geo, roadMat);
                mesh.renderOrder = 2;
                mesh.receiveShadow = true;
                mesh.frustumCulled = false;
                scene.add(mesh); roadMeshes.push(mesh);

                // Add lane markings only for major roads (performance optimization)
                if (width >= 12 && (type.includes('motorway') || type.includes('trunk') || type.includes('primary'))) {
                    const markVerts = [], markIdx = [];
                    const mw = 0.15, dashLen = 6, gapLen = 6; // Increased gap for performance
                    let dist = 0;
                    for (let i = 0; i < pts.length - 1; i++) {
                        const p1 = pts[i], p2 = pts[i + 1];
                        const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
                        const dx = (p2.x - p1.x) / segLen, dz = (p2.z - p1.z) / segLen;
                        const nx = -dz, nz = dx;
                        let segDist = 0;
                        while (segDist < segLen) {
                            if (Math.floor((dist + segDist) / (dashLen + gapLen)) % 2 === 0) {
                                const x = p1.x + dx * segDist, z = p1.z + dz * segDist;
                                const len = Math.min(dashLen, segLen - segDist);
                                const y = (typeof terrainMeshHeightAt === 'function' ? terrainMeshHeightAt(x, z) : elevationWorldYAtWorldXZ(x, z)) + 0.25; // Just above road surface
                                const vi = markVerts.length / 3;
                                markVerts.push(
                                    x + nx * mw, y, z + nz * mw,
                                    x - nx * mw, y, z - nz * mw,
                                    x + dx * len + nx * mw, y, z + dz * len + nz * mw,
                                    x + dx * len - nx * mw, y, z + dz * len - nz * mw
                                );
                                markIdx.push(vi, vi+1, vi+2, vi+1, vi+3, vi+2);
                            }
                            segDist += dashLen + gapLen;
                        }
                        dist += segLen;
                    }
                    if (markVerts.length > 0) {
                        const markGeo = new THREE.BufferGeometry();
                        markGeo.setAttribute('position', new THREE.Float32BufferAttribute(markVerts, 3));
                        markGeo.setIndex(markIdx);
                        const markMesh = new THREE.Mesh(markGeo, new THREE.MeshStandardMaterial({
                            color: 0xffffee,
                            emissive: 0x444444,
                            emissiveIntensity: 0.3,
                            roughness: 0.8,
                            polygonOffset: true,
                            polygonOffsetFactor: -3,
                            polygonOffsetUnits: -3
                        }));
                        markMesh.renderOrder = 3; // Layer 3 - renders on top of roads
                        scene.add(markMesh); roadMeshes.push(markMesh);
                    }
                }
            });

            // Process buildings
            showLoad('Loading buildings...');
            const buildingColors = [0x8899aa, 0x998877, 0x7788aa, 0x887799, 0x778899, 0x667788, 0x998877];
            data.elements.filter(e => e.type === 'way' && e.tags?.building).forEach(way => {
                const pts = way.nodes.map(id => nodes[id]).filter(n => n).map(n => geoToWorld(n.lat, n.lon));
                if (pts.length < 3) return;

                // Get building height from tags or estimate
                let height = 10; // default
                if (way.tags['building:levels']) {
                    height = parseFloat(way.tags['building:levels']) * 3.5;
                } else if (way.tags.height) {
                    height = parseFloat(way.tags.height) || 10;
                } else {
                    // Random height based on building type
                    const bt = way.tags.building;
                    if (bt === 'house' || bt === 'residential' || bt === 'detached') height = 6 + Math.random() * 4;
                    else if (bt === 'apartments' || bt === 'commercial') height = 12 + Math.random() * 20;
                    else if (bt === 'industrial' || bt === 'warehouse') height = 8 + Math.random() * 6;
                    else if (bt === 'church' || bt === 'cathedral') height = 15 + Math.random() * 15;
                    else if (bt === 'skyscraper' || bt === 'office') height = 30 + Math.random() * 50;
                    else height = 8 + Math.random() * 12;
                }

                // Store building collision data (2D polygon with pre-computed bounding box)
                let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
                pts.forEach(p => {
                    minX = Math.min(minX, p.x);
                    maxX = Math.max(maxX, p.x);
                    minZ = Math.min(minZ, p.z);
                    maxZ = Math.max(maxZ, p.z);
                });
                buildings.push({ pts: pts, minX, maxX, minZ, maxZ, height });

                // Create extruded building shape
                const shape = new THREE.Shape();
                pts.forEach((p, i) => {
                    if (i === 0) shape.moveTo(p.x, -p.z);
                    else shape.lineTo(p.x, -p.z);
                });
                shape.closePath();

                const extrudeSettings = { depth: height, bevelEnabled: false };
                const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
                geo.rotateX(-Math.PI / 2);

                const colors = ['#888888', '#7788aa', '#998877', '#667788'];
                const baseColor = colors[Math.floor(Math.random() * colors.length)];
                const windowTex = createWindowTexture(baseColor);

                const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
                    map: windowTex,
                    color: baseColor
                }));

                // Calculate average terrain elevation for building footprint
                let avgElevation = 0;
                pts.forEach(p => {
                    avgElevation += elevationWorldYAtWorldXZ(p.x, p.z);
                });
                avgElevation /= pts.length;

                mesh.position.y = avgElevation;
                mesh.userData.buildingFootprint = pts;
                mesh.receiveShadow = false;
                scene.add(mesh);
                buildingMeshes.push(mesh);
            });

            // Process landuse for ground truth visual realism
            showLoad('Loading land use...');
            data.elements.filter(e => e.type === 'way' && e.tags).forEach(way => {
                const tags = way.tags;
                let landuseType = null;

                // Check for landuse tags
                if (tags.landuse && LANDUSE_STYLES[tags.landuse]) {
                    landuseType = tags.landuse;
                } else if (tags.natural === 'water') {
                    landuseType = 'water';
                } else if (tags.natural === 'wood') {
                    landuseType = 'wood';
                } else if (tags.leisure === 'park') {
                    landuseType = 'park';
                }

                if (landuseType) {
                    const pts = way.nodes.map(id => nodes[id]).filter(n => n).map(n => geoToWorld(n.lat, n.lon));
                    if (pts.length < 3) return;

                    // Calculate average terrain elevation for this land use area
                    let avgElevation = 0;
                    pts.forEach(p => {
                        avgElevation += elevationWorldYAtWorldXZ(p.x, p.z);
                    });
                    avgElevation /= pts.length;

                    // Create landuse polygon that CONFORMS to terrain (not flat!)
                    const shape = new THREE.Shape();
                    pts.forEach((p, i) => {
                        if (i === 0) shape.moveTo(p.x, -p.z);
                        else shape.lineTo(p.x, -p.z);
                    });
                    shape.closePath();

                    // Create subdivided geometry so it can bend to terrain
                    const geometry = new THREE.ShapeGeometry(shape, 20); // 20 segments for detail
                    geometry.rotateX(-Math.PI / 2);

                    // Deform each vertex to follow actual terrain elevation (RELATIVE to mesh position)
                    // If terrain tile not loaded yet (returns 0), use avgElevation as fallback
                    const positions = geometry.attributes.position;
                    for (let i = 0; i < positions.count; i++) {
                        const x = positions.getX(i);
                        const z = positions.getZ(i);
                        const terrainY = elevationWorldYAtWorldXZ(x, z);
                        // Guard against unloaded tiles: if terrain returns 0 but avg is clearly above 0
                        const useY = (terrainY === 0 && Math.abs(avgElevation) > 2) ? avgElevation : terrainY;
                        positions.setY(i, (useY - avgElevation) + 0.02);
                    }
                    positions.needsUpdate = true;
                    geometry.computeVertexNormals();

                    const material = new THREE.MeshLambertMaterial({
                        color: LANDUSE_STYLES[landuseType].color,
                        transparent: true,
                        opacity: 0.85,
                        depthWrite: true,
                        polygonOffset: true,
                        polygonOffsetFactor: -2,
                        polygonOffsetUnits: -2
                    });

                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.renderOrder = 1;
                    mesh.position.y = avgElevation;
                    mesh.userData.landuseFootprint = pts;
                    mesh.userData.avgElevation = avgElevation;

                    mesh.receiveShadow = false;
                    scene.add(mesh);
                    landuseMeshes.push(mesh);
                    landuses.push({ type: landuseType, pts });
                }
            });

            // Process POIs for meaning in the world
            showLoad('Loading POIs...');
            data.elements.filter(e => e.type === 'node' && e.tags).forEach(node => {
                const tags = node.tags;
                let poiKey = null;

                // Determine POI type
                if (tags.amenity) {
                    poiKey = `amenity=${tags.amenity}`;
                } else if (tags.shop === 'supermarket') {
                    poiKey = 'shop=supermarket';
                } else if (tags.shop === 'mall') {
                    poiKey = 'shop=mall';
                } else if (tags.shop === 'convenience') {
                    poiKey = 'shop=convenience';
                } else if (tags.tourism) {
                    poiKey = `tourism=${tags.tourism}`;
                } else if (tags.historic) {
                    poiKey = tags.historic === 'monument' ? 'historic=monument' : 'historic=memorial';
                } else if (tags.leisure) {
                    poiKey = `leisure=${tags.leisure}`;
                }

                if (poiKey && POI_TYPES[poiKey]) {
                    const pos = geoToWorld(node.lat, node.lon);
                    const poiData = POI_TYPES[poiKey];

                    // Get terrain elevation at POI location
                    const terrainY = elevationWorldYAtWorldXZ(pos.x, pos.z);

                    // Create POI marker
                    const geometry = new THREE.CylinderGeometry(1.5, 1.5, 4, 8);
                    const material = new THREE.MeshLambertMaterial({
                        color: poiData.color,
                        emissive: poiData.color,
                        emissiveIntensity: 0.3
                    });
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.position.set(pos.x, terrainY + 2, pos.z);
                    mesh.userData.poiPosition = { x: pos.x, z: pos.z };
                    mesh.castShadow = false;
                    scene.add(mesh);
                    poiMeshes.push(mesh);

                    // Add top sphere cap
                    const capGeo = new THREE.SphereGeometry(1.8, 8, 6);
                    const capMat = new THREE.MeshLambertMaterial({
                        color: poiData.color,
                        emissive: poiData.color,
                        emissiveIntensity: 0.4
                    });
                    const cap = new THREE.Mesh(capGeo, capMat);
                    cap.position.set(pos.x, terrainY + 4, pos.z);
                    cap.userData.poiPosition = { x: pos.x, z: pos.z }; // Store for repositioning
                    cap.userData.isCapMesh = true; // Mark as cap (2 units higher)
                    scene.add(cap);
                    poiMeshes.push(cap);

                    // Store POI data
                    pois.push({
                        x: pos.x,
                        z: pos.z,
                        type: poiKey,
                        name: tags.name || poiData.category,
                        ...poiData
                    });

                    // Store historic sites separately for historic panel
                    if (tags.historic) {
                        historicSites.push({
                            x: pos.x,
                            z: pos.z,
                            lat: node.lat,
                            lon: node.lon,
                            type: tags.historic,
                            name: tags.name || 'Historic Site',
                            description: tags.description || tags['name:en'] || null,
                            wikipedia: tags.wikipedia || tags['wikipedia:en'] || null,
                            wikidata: tags.wikidata || null,
                            ...poiData
                        });
                    }
                }
            });

            if (roads.length > 0) {
                // Generate street furniture (signs, trees, lights, trash cans)
                showLoad('Adding details...');
                generateStreetFurniture();

                loaded = true;
                spawnOnRoad();
                hideLoad();
                // Align star field to current location
                alignStarFieldToLocation(LOC.lat, LOC.lon);
                if (gameStarted) startMode();
                // Debug log removed
            }
            else {
                console.warn('No roads found in data, trying larger area...');
                showLoad('No roads found, trying larger area...');
            }
        } catch (e) {
            console.error('Road loading error:', e);
            // If this is the last attempt and we still have no roads, create a default environment
            if (r === radii[radii.length - 1] && roads.length === 0) {
                // Debug log removed
                showLoad('Creating default environment...');

                // Create a simple crossroad
                const makeRoad = (x1, z1, x2, z2, width = 10) => {
                    const pts = [{x: x1, z: z1}, {x: x2, z: z2}];
                    roads.push({ pts, width, limit: 35, name: 'Main Street', type: 'primary' });

                    const hw = width / 2;
                    const verts = [], indices = [];
                    for (let i = 0; i < pts.length; i++) {
                        const p = pts[i];
                        const dx = pts[1].x - pts[0].x, dz = pts[1].z - pts[0].z;
                        const len = Math.sqrt(dx*dx + dz*dz) || 1;
                        const nx = -dz / len, nz = dx / len;
                        const y1 = elevationWorldYAtWorldXZ(p.x + nx * hw, p.z + nz * hw) + 0.3;
                        const y2 = elevationWorldYAtWorldXZ(p.x - nx * hw, p.z - nz * hw) + 0.3;
                        verts.push(p.x + nx * hw, y1, p.z + nz * hw);
                        verts.push(p.x - nx * hw, y2, p.z - nz * hw);
                        if (i < pts.length - 1) { const vi = i * 2; indices.push(vi, vi+1, vi+2, vi+1, vi+3, vi+2); }
                    }
                    const geo = new THREE.BufferGeometry();
                    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
                    geo.setIndex(indices);
                    geo.computeVertexNormals();
                    const roadMat = new THREE.MeshStandardMaterial({
                        color: 0x333333,
                        roughness: 0.95,
                        metalness: 0.05,
                        polygonOffset: true,
                        polygonOffsetFactor: -2,
                        polygonOffsetUnits: -2
                    });
                    const mesh = new THREE.Mesh(geo, roadMat);
                    mesh.renderOrder = 2;
                    mesh.receiveShadow = true;
                    mesh.frustumCulled = false;
                    scene.add(mesh); roadMeshes.push(mesh);
                };

                // Create roads in a cross pattern
                makeRoad(-200, 0, 200, 0, 12); // Horizontal
                makeRoad(0, -200, 0, 200, 12); // Vertical
                makeRoad(-150, -150, 150, 150, 10); // Diagonal 1
                makeRoad(-150, 150, 150, -150, 10); // Diagonal 2

                // Create a few simple buildings
                const makeBuilding = (x, z, w, d, h) => {
                    const pts = [
                        {x: x - w/2, z: z - d/2},
                        {x: x + w/2, z: z - d/2},
                        {x: x + w/2, z: z + d/2},
                        {x: x - w/2, z: z + d/2}
                    ];
                    buildings.push({ pts, height: h, minX: x - w/2, maxX: x + w/2, minZ: z - d/2, maxZ: z + d/2 });

                    const shape = new THREE.Shape();
                    shape.moveTo(pts[0].x, pts[0].z);
                    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].z);
                    shape.lineTo(pts[0].x, pts[0].z);

                    const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
                    geo.rotateX(-Math.PI / 2);
                    const color = [0x8899aa, 0x887766, 0x7788aa, 0x887799][Math.floor(Math.random() * 4)];
                    const mat = new THREE.MeshLambertMaterial({ color });
                    const mesh = new THREE.Mesh(geo, mat);

                    // Calculate average terrain elevation for building
                    let avgElevation = 0;
                    pts.forEach(p => {
                        avgElevation += elevationWorldYAtWorldXZ(p.x, p.z);
                    });
                    avgElevation /= pts.length;
                    mesh.position.y = avgElevation;
                    mesh.userData.buildingFootprint = pts; // Store for repositioning

                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    scene.add(mesh);
                    buildingMeshes.push(mesh);
                };

                // Add buildings around the crossroad
                makeBuilding(-80, -80, 40, 30, 15);
                makeBuilding(80, -80, 35, 40, 20);
                makeBuilding(-80, 80, 45, 35, 18);
                makeBuilding(80, 80, 30, 35, 12);
                makeBuilding(-50, 50, 25, 20, 10);
                makeBuilding(50, -50, 30, 25, 14);

                loaded = true;
                spawnOnRoad();
                hideLoad();
                if (gameStarted) startMode();
                // Debug log removed
            } else {
                showLoad('Retrying...');
            }
        }
    }
    if (!loaded) { showLoad('Failed to load. Click to retry.'); document.getElementById('loading').onclick = () => { document.getElementById('loading').onclick = null; loadRoads(); }; }
}

function spawnOnRoad() {
    const rd = roads.find(r => r.type.includes('primary') || r.type.includes('secondary')) || roads[0];
    if (!rd) return;
    const mid = Math.floor(rd.pts.length / 2);
    car.x = rd.pts[mid].x; car.z = rd.pts[mid].z;
    if (mid < rd.pts.length - 1) car.angle = Math.atan2(rd.pts[mid+1].x - rd.pts[mid].x, rd.pts[mid+1].z - rd.pts[mid].z);
    car.speed = 0; car.vx = 0; car.vz = 0;
    const _spawnH = typeof terrainMeshHeightAt === 'function' ? terrainMeshHeightAt : elevationWorldYAtWorldXZ;
    const spawnY = _spawnH(car.x, car.z) + 1.2;
    car.y = spawnY;
    carMesh.position.set(car.x, spawnY, car.z);
    carMesh.rotation.y = car.angle;
}

function teleportToLocation(worldX, worldZ) {
    // Try to snap to nearest road if available
    const nearest = findNearestRoad(worldX, worldZ);
    let targetX = worldX, targetZ = worldZ;
    let targetAngle = car.angle;

    // If we found a road within reasonable distance, snap to it
    if (nearest.road && nearest.dist < 50) {
        targetX = nearest.pt.x;
        targetZ = nearest.pt.z;

        // Find the road segment angle
        const road = nearest.road;
        let closestSegment = 0;
        let minDist = Infinity;
        for (let i = 0; i < road.pts.length - 1; i++) {
            const p1 = road.pts[i], p2 = road.pts[i+1];
            const midX = (p1.x + p2.x) / 2;
            const midZ = (p1.z + p2.z) / 2;
            const d = Math.hypot(targetX - midX, targetZ - midZ);
            if (d < minDist) {
                minDist = d;
                closestSegment = i;
            }
        }
        if (closestSegment < road.pts.length - 1) {
            const p1 = road.pts[closestSegment];
            const p2 = road.pts[closestSegment + 1];
            targetAngle = Math.atan2(p2.x - p1.x, p2.z - p1.z);
        }
    }

    // Update car position
    car.x = targetX;
    car.z = targetZ;
    car.angle = targetAngle;
    car.speed = 0;
    car.vx = 0;
    car.vz = 0;
    const _teleH = typeof terrainMeshHeightAt === 'function' ? terrainMeshHeightAt : elevationWorldYAtWorldXZ;
    const teleportY = _teleH(car.x, car.z) + 1.2;
    car.y = teleportY;
    carMesh.position.set(car.x, teleportY, car.z);
    carMesh.rotation.y = car.angle;

    // Update walker position if in walk mode
    if (Walk && Walk.state.mode === 'walk') {
        Walk.state.walker.x = targetX;
        Walk.state.walker.z = targetZ;
        Walk.state.walker.angle = targetAngle;
        Walk.state.walker.speed = 0;
        if (Walk.state.characterMesh) {
            Walk.state.characterMesh.position.set(targetX, 0, targetZ);
            Walk.state.characterMesh.rotation.y = targetAngle;
        }
    }

    // Update drone position if in drone mode
    if (droneMode) {
        drone.x = targetX;
        drone.z = targetZ;
        drone.yaw = targetAngle;
    }

    // Debug log removed
}

// Convert minimap screen coordinates to world coordinates
function minimapScreenToWorld(screenX, screenY) {
    const ref = Walk ? Walk.getMapRefPosition(droneMode, drone) : { x: car.x, z: car.z };
    const refLat = LOC.lat - (ref.z / SCALE);
    const refLon = LOC.lon + (ref.x / (SCALE * Math.cos(LOC.lat * Math.PI / 180)));

    const zoom = 17; // Minimap zoom level
    const n = Math.pow(2, zoom);
    const xtile_float = (refLon + 180) / 360 * n;
    const ytile_float = (1 - Math.log(Math.tan(refLat * Math.PI / 180) + 1 / Math.cos(refLat * Math.PI / 180)) / Math.PI) / 2 * n;

    const centerTileX = Math.floor(xtile_float);
    const centerTileY = Math.floor(ytile_float);
    const pixelOffsetX = (xtile_float - centerTileX) * 256;
    const pixelOffsetY = (ytile_float - centerTileY) * 256;

    // Convert screen coords to tile coords
    const mx = 75, my = 75; // Minimap center (150x150 canvas / 2)
    const px = screenX - mx;
    const py = screenY - my;

    const xt = centerTileX + (px + pixelOffsetX) / 256;
    const yt = centerTileY + (py + pixelOffsetY) / 256;

    // Convert tile coords to lat/lon
    const lon = xt / n * 360 - 180;
    const lat_rad = Math.atan(Math.sinh(Math.PI * (1 - 2 * yt / n)));
    const lat = lat_rad * 180 / Math.PI;

    // Convert lat/lon to world coords
    const worldX = (lon - LOC.lon) * SCALE * Math.cos(LOC.lat * Math.PI / 180);
    const worldZ = -(lat - LOC.lat) * SCALE;

    return { x: worldX, z: worldZ };
}

// Convert large map screen coordinates to world coordinates
function largeMapScreenToWorld(screenX, screenY) {
    const ref = Walk ? Walk.getMapRefPosition(droneMode, drone) : { x: car.x, z: car.z };
    const refLat = LOC.lat - (ref.z / SCALE);
    const refLon = LOC.lon + (ref.x / (SCALE * Math.cos(LOC.lat * Math.PI / 180)));

    const zoom = largeMapZoom;
    const n = Math.pow(2, zoom);
    const xtile_float = (refLon + 180) / 360 * n;
    const ytile_float = (1 - Math.log(Math.tan(refLat * Math.PI / 180) + 1 / Math.cos(refLat * Math.PI / 180)) / Math.PI) / 2 * n;

    const centerTileX = Math.floor(xtile_float);
    const centerTileY = Math.floor(ytile_float);
    const pixelOffsetX = (xtile_float - centerTileX) * 256;
    const pixelOffsetY = (ytile_float - centerTileY) * 256;

    // Convert screen coords to tile coords
    const mx = 400, my = 400; // Large map center (800x800 canvas / 2)
    const px = screenX - mx;
    const py = screenY - my;

    const xt = centerTileX + (px + pixelOffsetX) / 256;
    const yt = centerTileY + (py + pixelOffsetY) / 256;

    // Convert tile coords to lat/lon
    const lon = xt / n * 360 - 180;
    const lat_rad = Math.atan(Math.sinh(Math.PI * (1 - 2 * yt / n)));
    const lat = lat_rad * 180 / Math.PI;

    // Convert lat/lon to world coords
    const worldX = (lon - LOC.lon) * SCALE * Math.cos(LOC.lat * Math.PI / 180);
    const worldZ = -(lat - LOC.lat) * SCALE;

    return { x: worldX, z: worldZ };
}

// Reuse result object to avoid GC
const _nearRoadResult = { road: null, dist: Infinity, pt: { x: 0, z: 0 } };

function findNearestRoad(x, z) {
    _nearRoadResult.road = null;
    _nearRoadResult.dist = Infinity;

    for (let r = 0; r < roads.length; r++) {
        const road = roads[r];
        const pts = road.pts;
        // Quick bounding box skip: check if first point is way too far
        const fp = pts[0];
        const roughDist = Math.abs(x - fp.x) + Math.abs(z - fp.z);
        if (roughDist > _nearRoadResult.dist + 500) continue;

        for (let i = 0; i < pts.length - 1; i++) {
            const p1 = pts[i], p2 = pts[i+1];
            const dx = p2.x - p1.x, dz = p2.z - p1.z, len2 = dx*dx + dz*dz;
            if (len2 === 0) continue;
            let t = ((x - p1.x)*dx + (z - p1.z)*dz) / len2;
            t = Math.max(0, Math.min(1, t));
            const nx = p1.x + t*dx, nz = p1.z + t*dz;
            const ddx = x - nx, ddz = z - nz;
            const d = Math.sqrt(ddx*ddx + ddz*ddz);
            if (d < _nearRoadResult.dist) {
                _nearRoadResult.road = road;
                _nearRoadResult.dist = d;
                _nearRoadResult.pt.x = nx;
                _nearRoadResult.pt.z = nz;
            }
        }
    }
    return _nearRoadResult;
}

// Point-in-polygon test using ray casting algorithm
function pointInPolygon(x, z, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, zi = polygon[i].z;
        const xj = polygon[j].x, zj = polygon[j].z;
        const intersect = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// ============================================================================
// Street Furniture - signs, trees, light posts, trash cans
// ============================================================================

// Shared materials (created once, reused for all instances)
let _furnitureMatsReady = false;
let _matPole, _matSignBg, _matTreeShades, _matTrunk, _matLampHead, _matTrashBody, _matTrashLid;

function _initFurnitureMaterials() {
    if (_furnitureMatsReady) return;
    _matPole = new THREE.MeshLambertMaterial({ color: 0x666666 });
    _matSignBg = new THREE.MeshLambertMaterial({ color: 0x2a6e2a });
    _matTreeShades = [
        new THREE.MeshLambertMaterial({ color: 0x1a5c1a }),
        new THREE.MeshLambertMaterial({ color: 0x2d7a2d }),
        new THREE.MeshLambertMaterial({ color: 0x3d8b3d }),
        new THREE.MeshLambertMaterial({ color: 0x4a9e3a }),
        new THREE.MeshLambertMaterial({ color: 0x2a6b3e }),
        new THREE.MeshLambertMaterial({ color: 0x1f6e2f }),
    ];
    _matTrunk = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
    _matLampHead = new THREE.MeshLambertMaterial({ color: 0xdddddd, emissive: 0xffffaa, emissiveIntensity: 0.5 });
    _matTrashBody = new THREE.MeshLambertMaterial({ color: 0x3a5a3a });
    _matTrashLid = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
    _furnitureMatsReady = true;
}

// Shared geometries (created once)
let _geoSignPole, _geoSignBoard, _geoTreeCanopy, _geoTreeTrunk, _geoLampPole, _geoLampHead, _geoTrashBody, _geoTrashLid;
let _furnitureGeosReady = false;

function _initFurnitureGeometries() {
    if (_furnitureGeosReady) return;
    _geoSignPole = new THREE.CylinderGeometry(0.1, 0.1, 3.5, 6);
    _geoSignBoard = new THREE.BoxGeometry(4, 0.8, 0.1);
    _geoTreeTrunk = new THREE.CylinderGeometry(0.3, 0.5, 4, 6);
    _geoTreeCanopy = new THREE.SphereGeometry(3, 8, 6);
    _geoLampPole = new THREE.CylinderGeometry(0.12, 0.15, 6, 6);
    _geoLampHead = new THREE.SphereGeometry(0.5, 8, 6);
    _geoTrashBody = new THREE.CylinderGeometry(0.4, 0.35, 1.0, 8);
    _geoTrashLid = new THREE.CylinderGeometry(0.45, 0.45, 0.1, 8);
    _furnitureGeosReady = true;
}

// Cache sign textures/materials by road name to avoid redundant canvas creation
const _signTextureCache = new Map();
let _geoSignText = null;

function _getSignMaterial(name) {
    if (_signTextureCache.has(name)) return _signTextureCache.get(name);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2a6e2a';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 252, 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let displayName = name.length > 18 ? name.substring(0, 17) + '…' : name;
    ctx.fillText(displayName, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: texture });
    _signTextureCache.set(name, mat);
    return mat;
}

function createStreetSign(x, z, name, roadAngle) {
    const y = typeof terrainMeshHeightAt === 'function' ? terrainMeshHeightAt(x, z) : elevationWorldYAtWorldXZ(x, z);
    const group = new THREE.Group();

    // Pole
    const pole = new THREE.Mesh(_geoSignPole, _matPole);
    pole.position.y = 1.75;
    group.add(pole);

    // Sign board
    const board = new THREE.Mesh(_geoSignBoard, _matSignBg);
    board.position.y = 3.6;
    group.add(board);

    // Text label - cached per road name
    if (!_geoSignText) _geoSignText = new THREE.PlaneGeometry(4, 0.8);
    const textMat = _getSignMaterial(name);
    const textPlane = new THREE.Mesh(_geoSignText, textMat);
    textPlane.position.y = 3.6;
    textPlane.position.z = 0.06;
    group.add(textPlane);

    // Back side text (same name readable from other side)
    const textPlaneBack = new THREE.Mesh(_geoSignText, textMat);
    textPlaneBack.position.y = 3.6;
    textPlaneBack.position.z = -0.06;
    textPlaneBack.rotation.y = Math.PI;
    group.add(textPlaneBack);

    group.position.set(x, y, z);
    group.rotation.y = roadAngle;
    group.userData.furniturePos = { x, z };
    scene.add(group);
    streetFurnitureMeshes.push(group);
}

function createTree(x, z, sizeVariation) {
    const y = typeof terrainMeshHeightAt === 'function' ? terrainMeshHeightAt(x, z) : elevationWorldYAtWorldXZ(x, z);
    const group = new THREE.Group();
    const scale = 0.7 + sizeVariation * 0.8;

    // Trunk
    const trunk = new THREE.Mesh(_geoTreeTrunk, _matTrunk);
    trunk.position.y = 2 * scale;
    trunk.scale.set(scale, scale, scale);
    group.add(trunk);

    // Canopy - pick random shade from pre-made pool
    const canopy = new THREE.Mesh(_geoTreeCanopy, _matTreeShades[Math.floor(Math.random() * _matTreeShades.length)]);
    canopy.position.y = (4 + 2.5) * scale;
    canopy.scale.set(scale, scale * (0.8 + Math.random() * 0.4), scale);
    canopy.castShadow = false; // Disabled for performance
    group.add(canopy);

    group.position.set(x, y, z);
    group.userData.furniturePos = { x, z };
    scene.add(group);
    streetFurnitureMeshes.push(group);
}

function createLightPost(x, z) {
    const y = typeof terrainMeshHeightAt === 'function' ? terrainMeshHeightAt(x, z) : elevationWorldYAtWorldXZ(x, z);
    const group = new THREE.Group();

    const pole = new THREE.Mesh(_geoLampPole, _matPole);
    pole.position.y = 3;
    group.add(pole);

    const head = new THREE.Mesh(_geoLampHead, _matLampHead);
    head.position.y = 6.2;
    group.add(head);

    group.position.set(x, y, z);
    group.userData.furniturePos = { x, z };
    scene.add(group);
    streetFurnitureMeshes.push(group);
}

function createTrashCan(x, z) {
    const y = typeof terrainMeshHeightAt === 'function' ? terrainMeshHeightAt(x, z) : elevationWorldYAtWorldXZ(x, z);
    const group = new THREE.Group();

    const body = new THREE.Mesh(_geoTrashBody, _matTrashBody);
    body.position.y = 0.5;
    group.add(body);

    const lid = new THREE.Mesh(_geoTrashLid, _matTrashLid);
    lid.position.y = 1.05;
    group.add(lid);

    group.position.set(x, y, z);
    group.userData.furniturePos = { x, z };
    scene.add(group);
    streetFurnitureMeshes.push(group);
}

function generateStreetFurniture() {
    _initFurnitureMaterials();
    _initFurnitureGeometries();

    // --- STREET SIGNS: place at intervals along named roads ---
    const signSpacing = 120; // One sign every ~120 world units
    const signedRoads = new Set();
    roads.forEach(road => {
        if (!road.name || road.name === road.type.charAt(0).toUpperCase() + road.type.slice(1)) return;
        if (signedRoads.has(road.name)) return;
        signedRoads.add(road.name);

        let distAccum = 0;
        let signsPlaced = 0;
        for (let i = 0; i < road.pts.length - 1 && signsPlaced < 2; i++) {
            const p1 = road.pts[i], p2 = road.pts[i + 1];
            const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
            distAccum += segLen;

            if (distAccum >= signSpacing) {
                distAccum = 0;
                signsPlaced++;
                const dx = p2.x - p1.x, dz = p2.z - p1.z;
                const angle = Math.atan2(dx, dz);
                // Offset sign to the side of the road
                const nx = -dz / (Math.hypot(dx, dz) || 1);
                const nz = dx / (Math.hypot(dx, dz) || 1);
                const offset = road.width / 2 + 2;
                createStreetSign(
                    p1.x + nx * offset,
                    p1.z + nz * offset,
                    road.name,
                    angle
                );
            }
        }
    });

    // --- TREES: place in parks and green areas ---
    landuses.forEach(lu => {
        if (lu.type !== 'park' && lu.type !== 'wood' && lu.type !== 'forest' &&
            lu.type !== 'garden' && lu.type !== 'grass' && lu.type !== 'meadow' &&
            lu.type !== 'village_green' && lu.type !== 'recreation_ground') return;

        // Get bounding box of this landuse area
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        lu.pts.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        });

        const areaWidth = maxX - minX;
        const areaDepth = maxZ - minZ;
        const area = areaWidth * areaDepth;

        // Tree density based on type: woods are denser
        const isWoods = (lu.type === 'wood' || lu.type === 'forest');
        const spacing = isWoods ? 25 : 35;
        const maxTrees = Math.min(isWoods ? 20 : 8, Math.floor(area / (spacing * spacing)));

        let treesPlaced = 0;
        for (let attempt = 0; attempt < maxTrees * 3 && treesPlaced < maxTrees; attempt++) {
            const tx = minX + Math.random() * areaWidth;
            const tz = minZ + Math.random() * areaDepth;

            // Check point is inside the polygon AND not on/near a road
            if (pointInPolygon(tx, tz, lu.pts)) {
                const nr = findNearestRoad(tx, tz);
                const roadClearance = nr.road ? nr.road.width / 2 + 4 : 0;
                if (!nr.road || nr.dist > roadClearance) {
                    createTree(tx, tz, Math.random());
                    treesPlaced++;
                }
            }
        }
    });

    // --- LIGHT POSTS: along major roads at intervals ---
    const lampSpacing = 80;
    roads.forEach(road => {
        if (road.width < 12) return; // Only major roads
        let distAccum = 0;
        for (let i = 0; i < road.pts.length - 1; i++) {
            const p1 = road.pts[i], p2 = road.pts[i + 1];
            const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
            distAccum += segLen;

            if (distAccum >= lampSpacing) {
                distAccum = 0;
                const dx = p2.x - p1.x, dz = p2.z - p1.z;
                const len = Math.hypot(dx, dz) || 1;
                const nx = -dz / len, nz = dx / len;
                const offset = road.width / 2 + 1.5;
                createLightPost(p1.x + nx * offset, p1.z + nz * offset);
            }
        }
    });

    // --- TRASH CANS: near some POIs ---
    pois.forEach((poi, i) => {
        if (i % 5 !== 0) return; // Every 5th POI
        const offset = 3 + Math.random() * 2;
        const angle = Math.random() * Math.PI * 2;
        createTrashCan(poi.x + Math.cos(angle) * offset, poi.z + Math.sin(angle) * offset);
    });
}

