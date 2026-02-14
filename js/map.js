// ============================================================================
// map.js - Minimap and large map rendering
// ============================================================================

// Map canvas contexts and tile cache
const mctx = document.getElementById('minimap').getContext('2d');
const largeMapCtx = document.getElementById('largeMapCanvas').getContext('2d');
const tileCache = new Map();

function latLonToTile(lat, lon, zoom) {
    const n = Math.pow(2, zoom);
    const xtile = Math.floor((lon + 180) / 360 * n);
    const ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
    return { x: xtile, y: ytile, zoom };
}

function loadTile(x, y, zoom) {
    const key = `${satelliteView ? 'sat' : 'osm'}-${zoom}/${x}/${y}`;
    if (tileCache.has(key)) {
        return tileCache.get(key);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    if (satelliteView) {
        // OPTION 1: Esri World Imagery (Free, open to use, high quality)
        // This is from ArcGIS Online and is widely used in open-source projects
        img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;

        // OPTION 2 (Alternative): OpenAerialMap - Truly open source imagery
        // Uncomment to use OAM instead (less coverage but fully open)
        // img.src = `https://tiles.openaerialmap.org/5a926f71e5f6930006b8c7ff/0/${zoom}/${x}/${y}`;
    } else {
        // OpenStreetMap standard tiles
        img.src = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
    }

    const tileData = { img, loaded: false };
    tileCache.set(key, tileData);

    img.onload = () => {
        tileData.loaded = true;
    };

    return tileData;
}

function drawMinimap() {
    drawMapOnCanvas(mctx, 150, 150, false);
}

function drawLargeMap() {
    drawMapOnCanvas(largeMapCtx, 800, 800, true);
}

function worldToScreenLarge(worldX, worldZ) {
    // Convert world coords to lat/lon
    const lat = LOC.lat - (worldZ / SCALE);
    const lon = LOC.lon + (worldX / (SCALE * Math.cos(LOC.lat * Math.PI / 180)));

    // Use Walk module for proper reference position
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

    const xt = (lon + 180) / 360 * n;
    const yt = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;

    const px = (xt - centerTileX) * 256 - pixelOffsetX;
    const py = (yt - centerTileY) * 256 - pixelOffsetY;

    return { x: 400 + px, y: 400 + py };
}

function drawMapOnCanvas(ctx, w, h, isLarge) {
    // MOON MAP - Show actual terrain surface with craters (dotted version)
    if (onMoon && moonSurface) {
        // Clear with black space background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);

        // Get current position for map centering
        const centerX = Walk && Walk.state.mode === 'walk' ? Walk.state.walker.x : car.x;
        const centerZ = Walk && Walk.state.mode === 'walk' ? Walk.state.walker.z : car.z;

        // Map scale: show area around player
        const mapRange = isLarge ? 2000 : 500; // meters to show

        // Sample moon surface geometry for minimap
        const geometry = moonSurface.geometry;
        const positions = geometry.attributes.position;
        const colors = geometry.attributes.color;

        // Draw terrain as top-down view (DOTS)
        const pixelSize = w / (mapRange * 2);

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = positions.getZ(i);
            const y = positions.getY(i);

            // Check if this vertex is in view range
            const dx = x - centerX;
            const dz = z - centerZ;

            if (Math.abs(dx) < mapRange && Math.abs(dz) < mapRange) {
                // Convert world coords to screen coords
                const screenX = (dx / mapRange) * (w / 2) + w / 2;
                const screenZ = (dz / mapRange) * (h / 2) + h / 2;

                // Get color from vertex colors
                const r = Math.floor(colors.getX(i) * 255);
                const g = Math.floor(colors.getY(i) * 255);
                const b = Math.floor(colors.getZ(i) * 255);

                ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
                ctx.fillRect(screenX, screenZ, Math.max(2, pixelSize), Math.max(2, pixelSize));
            }
        }

        // Draw compass rose in top-right corner
        const compassSize = isLarge ? 40 : 25;
        const compassX = w - compassSize - 10;
        const compassY = compassSize + 10;

        ctx.save();
        ctx.translate(compassX, compassY);

        // Draw compass circle
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, compassSize, 0, Math.PI * 2);
        ctx.stroke();

        // Draw cardinal directions
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = `bold ${isLarge ? 14 : 10}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // North (red)
        ctx.fillStyle = '#ff4444';
        ctx.fillText('N', 0, -compassSize + 8);

        // Other directions (white)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillText('E', compassSize - 8, 0);
        ctx.fillText('S', 0, compassSize - 8);
        ctx.fillText('W', -compassSize + 8, 0);

        // Draw north arrow
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.moveTo(0, -compassSize + 2);
        ctx.lineTo(-5, -compassSize + 12);
        ctx.lineTo(0, -compassSize + 8);
        ctx.lineTo(5, -compassSize + 12);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        // Draw player position
        if (Walk && Walk.state.mode === 'walk') {
            // Walking - draw as person icon
            ctx.fillStyle = '#00ff00';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(w/2, h/2, 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fill();
        } else {
            // Driving - draw as TRIANGLE with front pointing in direction of travel
            ctx.save();
            ctx.translate(w/2, h/2);

            // Calculate heading from velocity direction (actual travel direction)
            // On minimap: X is horizontal, Z maps to vertical
            // Triangle tip at (0,-8) points "up" so we need angle from -Y axis
            const speed = Math.sqrt(car.vx * car.vx + car.vz * car.vz);
            let directionAngle;
            if (speed > 0.1) {
                // Use velocity direction when moving
                directionAngle = Math.atan2(car.vx, -car.vz);
            } else {
                // Use car angle when stationary (keeps last direction)
                directionAngle = car.angle;
            }
            ctx.rotate(directionAngle);

            ctx.fillStyle = '#ff3333';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.moveTo(0, -8);      // Tip/front - points UP when angle=0
            ctx.lineTo(-6, 6);      // Back left corner
            ctx.lineTo(6, 6);       // Back right corner
            ctx.closePath();

            ctx.fill();
            ctx.stroke();

            ctx.restore();
        }

        // Draw Apollo 11 landing site marker
        const apollo11X = 200;
        const apollo11Z = -500;
        const dx11 = apollo11X - centerX;
        const dz11 = apollo11Z - centerZ;

        // Check if Apollo 11 site is in view
        if (Math.abs(dx11) < mapRange && Math.abs(dz11) < mapRange) {
            const screenX11 = (dx11 / mapRange) * (w / 2) + w / 2;
            const screenZ11 = (dz11 / mapRange) * (h / 2) + h / 2;

            // Draw pulsing glow
            const pulseTime = Date.now() / 1000;
            const pulse = 0.5 + 0.5 * Math.sin(pulseTime * 3);
            const glowRadius = (isLarge ? 25 : 15) * (0.7 + pulse * 0.3);

            const gradient = ctx.createRadialGradient(screenX11, screenZ11, 0, screenX11, screenZ11, glowRadius);
            gradient.addColorStop(0, 'rgba(212, 175, 55, ' + (0.8 * pulse) + ')');
            gradient.addColorStop(0.5, 'rgba(212, 175, 55, ' + (0.3 * pulse) + ')');
            gradient.addColorStop(1, 'rgba(212, 175, 55, 0)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(screenX11, screenZ11, glowRadius, 0, Math.PI * 2);
            ctx.fill();

            // Draw gold star marker
            ctx.save();
            ctx.translate(screenX11, screenZ11);

            // Draw star shape
            ctx.fillStyle = '#d4af37'; // Gold
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const spikes = 5;
            const outerRadius = isLarge ? 12 : 8;
            const innerRadius = isLarge ? 6 : 4;
            for (let i = 0; i < spikes * 2; i++) {
                const radius = i % 2 === 0 ? outerRadius : innerRadius;
                const angle = (i * Math.PI) / spikes;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Add label if large map
            if (isLarge) {
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Apollo 11', 0, 25);
                ctx.font = '10px Arial';
                ctx.fillText('Landing Site', 0, 37);
            }

            ctx.restore();
        }

        // Add label
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('LUNAR TERRAIN', w/2, 12);

        return; // Skip Earth map rendering
    }

    // Use Walk module for proper reference position
    const ref = Walk ? Walk.getMapRefPosition(droneMode, drone) : { x: car.x, z: car.z };

    // Convert world coords back to lat/lon
    const refLat = LOC.lat - (ref.z / SCALE);
    const refLon = LOC.lon + (ref.x / (SCALE * Math.cos(LOC.lat * Math.PI / 180)));

    // Zoom level based on map size
    const zoom = isLarge ? largeMapZoom : 17;

    // Get tile coordinates and pixel position within tile
    const n = Math.pow(2, zoom);
    const xtile_float = (refLon + 180) / 360 * n;
    const ytile_float = (1 - Math.log(Math.tan(refLat * Math.PI / 180) + 1 / Math.cos(refLat * Math.PI / 180)) / Math.PI) / 2 * n;

    const centerTileX = Math.floor(xtile_float);
    const centerTileY = Math.floor(ytile_float);

    // Pixel offset within the center tile (0-256)
    const pixelOffsetX = (xtile_float - centerTileX) * 256;
    const pixelOffsetY = (ytile_float - centerTileY) * 256;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);

    // Draw OSM tiles at 1:1 scale (256px tiles)
    // Calculate which tiles are visible
    const tilesWide = Math.ceil(w / 256) + 1;
    const tilesHigh = Math.ceil(h / 256) + 1;

    // Calculate the top-left corner position
    const startX = w / 2 - pixelOffsetX;
    const startY = h / 2 - pixelOffsetY;

    for (let dx = -Math.ceil(tilesWide / 2); dx <= Math.ceil(tilesWide / 2); dx++) {
        for (let dy = -Math.ceil(tilesHigh / 2); dy <= Math.ceil(tilesHigh / 2); dy++) {
            const tx = centerTileX + dx;
            const ty = centerTileY + dy;

            // Clamp tile coordinates
            const maxTile = Math.pow(2, zoom) - 1;
            if (tx < 0 || tx > maxTile || ty < 0 || ty > maxTile) continue;

            const tile = loadTile(tx, ty, zoom);
            if (tile.loaded) {
                const screenX = startX + dx * 256;
                const screenY = startY + dy * 256;
                ctx.drawImage(tile.img, screenX, screenY, 256, 256);
            }
        }
    }

    // Center point for drawing indicators (vehicle is always at center)
    const mx = w / 2;
    const my = h / 2;

    // Helper function to convert world coords to screen position
    const worldToScreen = (worldX, worldZ) => {
        const lat = LOC.lat - (worldZ / SCALE);
        const lon = LOC.lon + (worldX / (SCALE * Math.cos(LOC.lat * Math.PI / 180)));

        const n = Math.pow(2, zoom);
        const xt = (lon + 180) / 360 * n;
        const yt = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;

        const px = (xt - centerTileX) * 256 - pixelOffsetX;
        const py = (yt - centerTileY) * 256 - pixelOffsetY;

        return { x: mx + px, y: my + py };
    };
    const latLonToScreen = (lat, lon) => {
        const n = Math.pow(2, zoom);
        const xt = (lon + 180) / 360 * n;
        const yt = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
        const px = (xt - centerTileX) * 256 - pixelOffsetX;
        const py = (yt - centerTileY) * 256 - pixelOffsetY;
        return { x: mx + px, y: my + py };
    };

    // Draw explicit OSM-derived water overlays (harbors/lakes/rivers/canals)
    // so water stays readable even where custom vector layers dominate the view.
    if (waterAreas.length > 0 || waterways.length > 0) {
        const viewPad = isLarge ? 100 : 45;

        if (waterAreas.length > 0) {
            ctx.save();
            ctx.fillStyle = isLarge ? 'rgba(66, 142, 224, 0.30)' : 'rgba(66, 142, 224, 0.24)';
            ctx.strokeStyle = isLarge ? 'rgba(160, 220, 255, 0.55)' : 'rgba(160, 220, 255, 0.45)';
            ctx.lineWidth = isLarge ? 1.8 : 1.0;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            waterAreas.forEach(area => {
                if (!area?.pts || area.pts.length < 3) return;

                let inView = false;
                ctx.beginPath();
                area.pts.forEach((pt, idx) => {
                    const pos = worldToScreen(pt.x, pt.z);
                    if (Math.abs(pos.x - mx) < (w / 2 + viewPad) && Math.abs(pos.y - my) < (h / 2 + viewPad)) {
                        inView = true;
                    }
                    if (idx === 0) ctx.moveTo(pos.x, pos.y);
                    else ctx.lineTo(pos.x, pos.y);
                });
                ctx.closePath();
                if (!inView) return;
                ctx.fill();
                ctx.stroke();
            });
            ctx.restore();
        }

        if (waterways.length > 0) {
            ctx.save();
            ctx.strokeStyle = isLarge ? 'rgba(70, 160, 240, 0.90)' : 'rgba(70, 160, 240, 0.82)';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            waterways.forEach(way => {
                if (!way?.pts || way.pts.length < 2) return;

                let inView = false;
                const lineWidth = Math.max(
                    isLarge ? 1.0 : 0.8,
                    Math.min(isLarge ? 4.8 : 2.8, (way.width || 6) * (isLarge ? 0.20 : 0.12))
                );
                ctx.lineWidth = lineWidth;
                ctx.beginPath();
                way.pts.forEach((pt, idx) => {
                    const pos = worldToScreen(pt.x, pt.z);
                    if (Math.abs(pos.x - mx) < (w / 2 + viewPad) && Math.abs(pos.y - my) < (h / 2 + viewPad)) {
                        inView = true;
                    }
                    if (idx === 0) ctx.moveTo(pos.x, pos.y);
                    else ctx.lineTo(pos.x, pos.y);
                });
                if (!inView) return;
                ctx.stroke();
            });
            ctx.restore();
        }
    }

    // Draw road overlay (if enabled)
    if (showRoads && roads.length > 0) {
        roads.forEach(road => {
            if (!road.pts || road.pts.length < 2) return;

            // Determine road color and width based on type
            let roadColor, roadWidth, outlineColor;
            const roadType = road.type || 'residential';

            if (roadType === 'motorway' || roadType === 'trunk') {
                roadColor = '#ff8800'; // Orange for highways
                outlineColor = '#cc6600';
                roadWidth = isLarge ? 6 : 3;
            } else if (roadType === 'primary' || roadType === 'secondary') {
                roadColor = '#ffcc00'; // Yellow for major roads
                outlineColor = '#cc9900';
                roadWidth = isLarge ? 5 : 2.5;
            } else if (roadType === 'tertiary') {
                roadColor = '#ffffff'; // White for tertiary roads
                outlineColor = '#999999';
                roadWidth = isLarge ? 4 : 2;
            } else {
                roadColor = '#ffffff'; // White for residential
                outlineColor = '#aaaaaa';
                roadWidth = isLarge ? 3 : 1.5;
            }

            // Draw road outline first (darker)
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = roadWidth + (isLarge ? 2 : 1);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = 0.8;
            ctx.beginPath();

            road.pts.forEach((pt, i) => {
                const pos = worldToScreen(pt.x, pt.z);
                // Only draw if within reasonable distance from center
                if (Math.abs(pos.x - mx) < w && Math.abs(pos.y - my) < h) {
                    if (i === 0) ctx.moveTo(pos.x, pos.y);
                    else ctx.lineTo(pos.x, pos.y);
                }
            });
            ctx.stroke();

            // Draw road fill (lighter color)
            ctx.strokeStyle = roadColor;
            ctx.lineWidth = roadWidth;
            ctx.beginPath();

            road.pts.forEach((pt, i) => {
                const pos = worldToScreen(pt.x, pt.z);
                if (Math.abs(pos.x - mx) < w && Math.abs(pos.y - my) < h) {
                    if (i === 0) ctx.moveTo(pos.x, pos.y);
                    else ctx.lineTo(pos.x, pos.y);
                }
            });
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        });
    }

    // Draw game elements using proper coordinate conversion
    if (mapLayers.checkpoints && gameMode === 'checkpoint') {
        checkpoints.forEach(cp => {
            if (cp.collected) return;
            const pos = worldToScreen(cp.x, cp.z);
            if (Math.abs(pos.x - mx) < w/2 && Math.abs(pos.y - my) < h/2) {
                ctx.fillStyle = '#f36';
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, isLarge ? 8 : 4, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }

    if (mapLayers.destination && gameMode === 'trial' && destination) {
        const pos = worldToScreen(destination.x, destination.z);
        ctx.fillStyle = trialDone ? '#0f8' : '#fc0';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, isLarge ? 10 : 5, 0, Math.PI * 2);
        ctx.fill();
    }

    if (mapLayers.police && policeOn) {
        police.forEach(cop => {
            const pos = worldToScreen(cop.x, cop.z);
            if (Math.abs(pos.x - mx) < w/2 && Math.abs(pos.y - my) < h/2) {
                ctx.fillStyle = cop.chasing ? '#f00' : '#06f';
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, isLarge ? 6 : 3, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }

    // Draw POIs on minimap
    if (poiMode && pois.length > 0) {
        pois.forEach(poi => {
            // Check if this POI category is visible
            if (!isPOIVisible(poi.type)) return;

            const pos = worldToScreen(poi.x, poi.z);
            const dist = Math.sqrt(Math.pow(pos.x - mx, 2) + Math.pow(pos.y - my, 2));

            // Only show POIs within visible range
            if (Math.abs(pos.x - mx) < w/2 && Math.abs(pos.y - my) < h/2) {
                // Convert color to hex string
                const colorHex = '#' + poi.color.toString(16).padStart(6, '0');
                ctx.fillStyle = colorHex;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = isLarge ? 2 : 1;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, isLarge ? 5 : 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Draw icon for large map
                if (isLarge && dist < 200) {
                    ctx.font = isLarge ? '16px Arial' : '10px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(poi.icon, pos.x, pos.y - (isLarge ? 12 : 8));
                }
            }
        });
    }

    // Draw memory pins/flowers on both minimap and large map
    if (typeof getMemoryEntriesForCurrentLocation === 'function') {
        const memoryEntries = getMemoryEntriesForCurrentLocation();
        if (Array.isArray(memoryEntries) && memoryEntries.length > 0) {
            memoryEntries.forEach((entry) => {
                if (!entry || !Number.isFinite(entry.lat) || !Number.isFinite(entry.lon)) return;
                const pos = latLonToScreen(entry.lat, entry.lon);
                if (Math.abs(pos.x - mx) >= w / 2 || Math.abs(pos.y - my) >= h / 2) return;

                const base = isLarge ? 6 : 4;
                if (entry.type === 'flower') {
                    ctx.fillStyle = '#ec4899';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = isLarge ? 2 : 1;
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, base, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    ctx.fillStyle = '#facc15';
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, base * 0.45, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillStyle = '#ef4444';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = isLarge ? 2 : 1;
                    ctx.save();
                    ctx.translate(pos.x, pos.y);
                    ctx.beginPath();
                    ctx.arc(0, -base * 0.2, base * 0.75, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(0, base * 1.25);
                    ctx.lineTo(-base * 0.35, base * 0.2);
                    ctx.lineTo(base * 0.35, base * 0.2);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    ctx.restore();
                }
            });
        }
    }

    // Draw properties on minimap
    if (mapLayers.properties && realEstateMode && properties.length > 0) {
        properties.forEach(prop => {
            const pos = worldToScreen(prop.x, prop.z);

            // Only show properties within visible range
            if (Math.abs(pos.x - mx) < w/2 && Math.abs(pos.y - my) < h/2) {
                // Color based on listing type
                const colorHex = prop.priceType === 'sale' ? '#10b981' : '#3b82f6';
                ctx.fillStyle = colorHex;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = isLarge ? 2 : 1;

                // Draw marker
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, isLarge ? 6 : 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Draw price on large map
                if (isLarge) {
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillStyle = '#fff';
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 2;
                    const priceText = '$' + Math.round(prop.price / 1000) + 'K';
                    ctx.strokeText(priceText, pos.x, pos.y - 8);
                    ctx.fillText(priceText, pos.x, pos.y - 8);
                }
            }
        });
    }

    // Draw navigation route if active
    if (mapLayers.navigation && showNavigation) {
        const destination = selectedProperty || selectedHistoric;
        if (destination) {
            // Use Walk module to get proper player position
            const ref = Walk ? Walk.getMapRefPosition(droneMode, drone) : { x: car.x, z: car.z };
            const playerPos = worldToScreen(ref.x, ref.z);
            const destPos = worldToScreen(destination.x, destination.z);

            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = isLarge ? 4 : 2;
            ctx.setLineDash([isLarge ? 10 : 5, isLarge ? 5 : 3]);
            ctx.beginPath();
            ctx.moveTo(playerPos.x, playerPos.y);
            ctx.lineTo(destPos.x, destPos.y);
            ctx.stroke();
            ctx.setLineDash([]); // Reset dash

            // Draw destination marker
            ctx.fillStyle = '#00ff88';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = isLarge ? 3 : 2;
            ctx.beginPath();
            ctx.arc(destPos.x, destPos.y, isLarge ? 8 : 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Draw distance label on large map
            if (isLarge) {
                const dx = destination.x - car.x;
                const dz = destination.z - car.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 3;
                const distText = Math.round(dist) + 'm';
                ctx.strokeText(distText, destPos.x, destPos.y - 15);
                ctx.fillText(distText, destPos.x, destPos.y - 15);
            }
        }
    }

    if (mapLayers.customTrack && customTrack.length >= 2) {
        ctx.strokeStyle = isRecording ? '#f64' : '#fa0';
        ctx.lineWidth = isLarge ? 5 : 3;
        ctx.beginPath();
        customTrack.forEach((p, i) => {
            const pos = worldToScreen(p.x, p.z);
            if (i === 0) ctx.moveTo(pos.x, pos.y);
            else ctx.lineTo(pos.x, pos.y);
        });
        ctx.stroke();
    }

    // Draw vehicle icons
    const iconSize = isLarge ? 16 : 8;

    if (droneMode && isLarge) {
        // Show car position on large map when in drone mode
        const carPos = worldToScreen(car.x, car.z);
        if (Math.abs(carPos.x - mx) < w/2 && Math.abs(carPos.y - my) < h/2) {
            ctx.save();
            ctx.translate(carPos.x, carPos.y);
            ctx.rotate(car.angle);
            ctx.fillStyle = '#f36';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -iconSize);           // Tip/front points UP
            ctx.lineTo(-iconSize/2, iconSize);   // Back left
            ctx.lineTo(iconSize/2, iconSize);    // Back right
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }

    // Draw drone or car or walker icon at center (always at mx, my)
    if (droneMode) {
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(-drone.yaw);
        ctx.fillStyle = '#0cf';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = isLarge ? 3 : 2;
        ctx.beginPath();
        ctx.arc(0, 0, iconSize * 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-iconSize/2, -iconSize/2);
        ctx.lineTo(iconSize/2, iconSize/2);
        ctx.moveTo(iconSize/2, -iconSize/2);
        ctx.lineTo(-iconSize/2, iconSize/2);
        ctx.stroke();
        ctx.restore();
    } else if (Walk && Walk.state.mode === 'walk') {
        // Walking mode - show person icon
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(-Walk.state.walker.angle);
        ctx.fillStyle = '#4488ff';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = isLarge ? 3 : 2;
        ctx.beginPath();
        ctx.arc(0, -iconSize/2, iconSize/3, 0, Math.PI * 2); // Head
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -iconSize/6);
        ctx.lineTo(0, iconSize/2); // Body
        ctx.moveTo(-iconSize/3, 0);
        ctx.lineTo(iconSize/3, 0); // Arms
        ctx.moveTo(0, iconSize/2);
        ctx.lineTo(-iconSize/4, iconSize); // Left leg
        ctx.moveTo(0, iconSize/2);
        ctx.lineTo(iconSize/4, iconSize); // Right leg
        ctx.stroke();
        ctx.restore();
    } else {
        // Driving mode - show car icon as TRIANGLE (tip = direction of travel)
        ctx.save();
        ctx.translate(mx, my);

        // Calculate heading from velocity direction (actual travel direction)
        // On minimap: X is horizontal, Z maps to vertical
        // Triangle tip at (0,-iconSize) points "up" so we need angle from -Y axis
        const speed = Math.sqrt(car.vx * car.vx + car.vz * car.vz);
        let directionAngle;
        if (speed > 0.1) {
            // Use velocity direction when moving
            directionAngle = Math.atan2(car.vx, -car.vz);
        } else {
            // Use car angle when stationary (keeps last direction)
            directionAngle = car.angle;
        }
        ctx.rotate(directionAngle);

        ctx.fillStyle = '#f36';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = isLarge ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(0, -iconSize);           // Tip/front points UP when angle=0
        ctx.lineTo(-iconSize/2, iconSize);   // Back left
        ctx.lineTo(iconSize/2, iconSize);    // Back right
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // Draw North indicator
    const compassSize = isLarge ? 40 : 25;
    const compassX = isLarge ? w - compassSize - 15 : w - compassSize - 8;
    const compassY = isLarge ? compassSize + 15 : compassSize + 8;

    // Compass circle background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = isLarge ? 2 : 1.5;
    ctx.beginPath();
    ctx.arc(compassX, compassY, compassSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // North arrow (always points up since map is north-oriented)
    ctx.save();
    ctx.translate(compassX, compassY);

    // Red north arrow
    ctx.fillStyle = '#ff4444';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = isLarge ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(0, -compassSize / 2.5); // Top point
    ctx.lineTo(-compassSize / 6, compassSize / 6); // Bottom left
    ctx.lineTo(0, 0); // Center
    ctx.lineTo(compassSize / 6, compassSize / 6); // Bottom right
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // "N" letter
    ctx.font = `bold ${isLarge ? 14 : 10}px Arial`;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = isLarge ? 3 : 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('N', 0, -compassSize / 3.5);
    ctx.fillText('N', 0, -compassSize / 3.5);

    ctx.restore();
}


Object.assign(globalThis, {
    drawLargeMap,
    drawMapOnCanvas,
    drawMinimap,
    latLonToTile,
    loadTile,
    worldToScreenLarge
});

export {
    drawLargeMap,
    drawMapOnCanvas,
    drawMinimap,
    latLonToTile,
    loadTile,
    worldToScreenLarge
};
