import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import {
  currentMapReferenceGeoPosition,
  currentMapReferenceWorldPosition,
  worldPointToGeo
} from "./map-coordinates.js?v=1";
// map.js - Minimap and large map rendering
// ============================================================================

// Map canvas contexts and tile cache
const mctx = document.getElementById('minimap').getContext('2d');
const largeMapCtx = document.getElementById('largeMapCanvas').getContext('2d');
const tileCache = new Map();
const mapLayerCaches = {
  minimap: createMapLayerCache(),
  large: createMapLayerCache()
};
const moonMapSampleCaches = {
  minimap: { key: '', samples: [] },
  large: { key: '', samples: [] }
};

function createMapLayerCache() {
  return {
    canvas: typeof document !== 'undefined' ? document.createElement('canvas') : null,
    ctx: null,
    width: 0,
    height: 0,
    margin: 0,
    key: '',
    centerXT: 0,
    centerYT: 0,
    lastRenderAt: 0,
    incomplete: true
  };
}

function normalizeOverlayPoint(point = {}) {
  return {
    lat: Number(point?.lat),
    lon: Number(point?.lon)
  };
}

function overlayGeometryPolygonRings(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  if (Array.isArray(source.rings)) {
    return source.rings
      .map((ring) => {
        if (Array.isArray(ring?.points)) return ring.points;
        if (Array.isArray(ring?.coordinates)) return ring.coordinates;
        return Array.isArray(ring) ? ring : [];
      })
      .map((ring) => ring.map((point) => normalizeOverlayPoint(point)))
      .filter((ring) => ring.length > 0);
  }
  if (Array.isArray(source.coordinates)) {
    if (source.coordinates.length && Array.isArray(source.coordinates[0])) {
      return source.coordinates
        .map((ring) => Array.isArray(ring) ? ring.map((point) => normalizeOverlayPoint(point)) : [])
        .filter((ring) => ring.length > 0);
    }
    return [
      source.coordinates.map((point) => normalizeOverlayPoint(point))
    ].filter((ring) => ring.length > 0);
  }
  return [];
}

function overlayMapFeatureColor(feature = {}) {
  const featureClass = String(feature?.featureClass || '').toLowerCase();
  const presetId = String(feature?.presetId || '').toLowerCase();
  if (featureClass === 'building' || presetId.includes('building')) return '#f97316';
  if (featureClass === 'road' || presetId.includes('road')) return '#38bdf8';
  if (featureClass === 'railway' || presetId.includes('rail')) return '#a78bfa';
  if (presetId.includes('entrance') || presetId.includes('interior')) return '#14b8a6';
  return '#f59e0b';
}

function overlayMapFeatureLabel(feature = {}) {
  return String(feature?.tags?.name || feature?.summary || feature?.presetId || 'Overlay').trim() || 'Overlay';
}

function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const xtile = Math.floor((lon + 180) / 360 * n);
  const ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  return { x: xtile, y: ytile, zoom };
}

function loadTile(x, y, zoom) {
  const key = `${appCtx.satelliteView ? 'sat' : 'osm'}-${zoom}/${x}/${y}`;
  if (tileCache.has(key)) {
    return tileCache.get(key);
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';

  if (appCtx.satelliteView) {
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

function ensureMapLayerCacheCanvas(cache, width, height) {
  if (!cache.canvas) return null;
  if (cache.width !== width || cache.height !== height) {
    cache.width = width;
    cache.height = height;
    cache.canvas.width = width;
    cache.canvas.height = height;
    cache.ctx = cache.canvas.getContext('2d');
    cache.incomplete = true;
  } else if (!cache.ctx) {
    cache.ctx = cache.canvas.getContext('2d');
  }
  return cache.ctx;
}

function renderEarthTileCache(cache, width, height, zoom, centerXT, centerYT) {
  const cacheCtx = ensureMapLayerCacheCanvas(cache, width, height);
  if (!cacheCtx) return false;

  const centerTileX = Math.floor(centerXT);
  const centerTileY = Math.floor(centerYT);
  const pixelOffsetX = (centerXT - centerTileX) * 256;
  const pixelOffsetY = (centerYT - centerTileY) * 256;
  const tilesWide = Math.ceil(width / 256) + 1;
  const tilesHigh = Math.ceil(height / 256) + 1;
  const startX = width / 2 - pixelOffsetX;
  const startY = height / 2 - pixelOffsetY;
  let missingTiles = 0;

  cacheCtx.fillStyle = '#1a1a1a';
  cacheCtx.fillRect(0, 0, width, height);

  for (let dx = -Math.ceil(tilesWide / 2); dx <= Math.ceil(tilesWide / 2); dx++) {
    for (let dy = -Math.ceil(tilesHigh / 2); dy <= Math.ceil(tilesHigh / 2); dy++) {
      const tx = centerTileX + dx;
      const ty = centerTileY + dy;
      const maxTile = Math.pow(2, zoom) - 1;
      if (tx < 0 || tx > maxTile || ty < 0 || ty > maxTile) continue;

      const tile = loadTile(tx, ty, zoom);
      if (!tile.loaded) {
        missingTiles += 1;
        continue;
      }
      const screenX = startX + dx * 256;
      const screenY = startY + dy * 256;
      cacheCtx.drawImage(tile.img, screenX, screenY, 256, 256);
    }
  }

  cache.centerXT = centerXT;
  cache.centerYT = centerYT;
  cache.lastRenderAt = performance.now();
  cache.incomplete = missingTiles > 0;
  return true;
}

function drawEarthTileLayer(ctx, w, h, isLarge, zoom, centerXT, centerYT) {
  const cache = isLarge ? mapLayerCaches.large : mapLayerCaches.minimap;
  const margin = isLarge ? 256 : 128;
  const cacheKey = `${appCtx.satelliteView ? 'sat' : 'osm'}:${zoom}:${isLarge ? 'large' : 'mini'}`;
  const cacheWidth = w + margin * 2;
  const cacheHeight = h + margin * 2;
  const shiftXPx = (centerXT - cache.centerXT) * 256;
  const shiftYPx = (centerYT - cache.centerYT) * 256;
  const tooFarFromCachedCenter = Math.abs(shiftXPx) > margin * 0.6 || Math.abs(shiftYPx) > margin * 0.6;
  const needsRender =
    cache.key !== cacheKey ||
    cache.width !== cacheWidth ||
    cache.height !== cacheHeight ||
    tooFarFromCachedCenter ||
    (cache.incomplete && performance.now() - cache.lastRenderAt > 180);

  cache.margin = margin;
  if (needsRender) {
    cache.key = cacheKey;
    renderEarthTileCache(cache, cacheWidth, cacheHeight, zoom, centerXT, centerYT);
  }

  if (!cache.canvas) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const srcX = margin + (centerXT - cache.centerXT) * 256;
  const srcY = margin + (centerYT - cache.centerYT) * 256;
  ctx.drawImage(cache.canvas, srcX, srcY, w, h, 0, 0, w, h);
}

function getMoonMapSamples(isLarge) {
  const surface = appCtx.moonSurface;
  const geometry = surface?.geometry;
  const positions = geometry?.attributes?.position;
  const colors = geometry?.attributes?.color;
  if (!positions || !colors) return [];

  const cache = isLarge ? moonMapSampleCaches.large : moonMapSampleCaches.minimap;
  const budget = isLarge ? 14000 : 5000;
  const key = `${geometry.uuid}:${positions.count}:${isLarge ? 'large' : 'mini'}`;
  if (cache.key === key && Array.isArray(cache.samples) && cache.samples.length > 0) {
    return cache.samples;
  }

  const stride = Math.max(1, Math.floor(positions.count / budget));
  const samples = [];
  for (let i = 0; i < positions.count; i += stride) {
    samples.push({
      x: positions.getX(i),
      z: positions.getZ(i),
      color: `rgb(${Math.floor(colors.getX(i) * 255)},${Math.floor(colors.getY(i) * 255)},${Math.floor(colors.getZ(i) * 255)})`
    });
  }
  cache.key = key;
  cache.samples = samples;
  return samples;
}

function drawMinimap() {
  drawMapOnCanvas(mctx, 150, 150, false);
}

function drawLargeMap() {
  drawMapOnCanvas(largeMapCtx, 800, 800, true);
}

function worldToScreenLarge(worldX, worldZ) {
  const geo = worldPointToGeo(worldX, worldZ);
  const refGeo = currentMapReferenceGeoPosition();
  const lat = Number(geo?.lat);
  const lon = Number(geo?.lon);
  const refLat = Number(refGeo?.lat);
  const refLon = Number(refGeo?.lon);

  const zoom = appCtx.largeMapZoom;
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
  if (appCtx.onMoon && appCtx.moonSurface) {
    // Clear with black space background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Get current position for map centering
    const centerX = appCtx.Walk && appCtx.Walk.state.mode === 'walk' ? appCtx.Walk.state.walker.x : appCtx.car.x;
    const centerZ = appCtx.Walk && appCtx.Walk.state.mode === 'walk' ? appCtx.Walk.state.walker.z : appCtx.car.z;

    // Map scale: show area around player
    const mapRange = isLarge ? 2000 : 500; // meters to show

    // Sample moon surface geometry for minimap
    // Draw terrain as top-down view (DOTS)
    const pixelSize = w / (mapRange * 2);
    const moonSamples = getMoonMapSamples(isLarge);

    for (let i = 0; i < moonSamples.length; i++) {
      const sample = moonSamples[i];
      const x = sample.x;
      const z = sample.z;

      // Check if this vertex is in view range
      const dx = x - centerX;
      const dz = z - centerZ;

      if (Math.abs(dx) < mapRange && Math.abs(dz) < mapRange) {
        // Convert world coords to screen coords
        const screenX = dx / mapRange * (w / 2) + w / 2;
        const screenZ = dz / mapRange * (h / 2) + h / 2;

        ctx.fillStyle = sample.color;
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
    if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') {
      // Walking - draw as person icon
      ctx.fillStyle = '#00ff00';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
    } else {
      // Driving - draw as TRIANGLE with front pointing in direction of travel
      ctx.save();
      ctx.translate(w / 2, h / 2);

      // Calculate heading from velocity direction (actual travel direction)
      // On minimap: X is horizontal, Z maps to vertical
      // Triangle tip at (0,-8) points "up" so we need angle from -Y axis
      const speed = Math.sqrt(appCtx.car.vx * appCtx.car.vx + appCtx.car.vz * appCtx.car.vz);
      let directionAngle;
      if (speed > 0.1) {
        // Use velocity direction when moving
        directionAngle = Math.atan2(appCtx.car.vx, -appCtx.car.vz);
      } else {
        // Use car angle when stationary (keeps last direction)
        directionAngle = appCtx.car.angle;
      }
      ctx.rotate(directionAngle);

      ctx.fillStyle = '#ff3333';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(0, -8); // Tip/front - points UP when angle=0
      ctx.lineTo(-6, 6); // Back left corner
      ctx.lineTo(6, 6); // Back right corner
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
      const screenX11 = dx11 / mapRange * (w / 2) + w / 2;
      const screenZ11 = dz11 / mapRange * (h / 2) + h / 2;

      // Draw pulsing glow
      const pulseTime = Date.now() / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(pulseTime * 3);
      const glowRadius = (isLarge ? 25 : 15) * (0.7 + pulse * 0.3);

      const gradient = ctx.createRadialGradient(screenX11, screenZ11, 0, screenX11, screenZ11, glowRadius);
      gradient.addColorStop(0, 'rgba(212, 175, 55, ' + 0.8 * pulse + ')');
      gradient.addColorStop(0.5, 'rgba(212, 175, 55, ' + 0.3 * pulse + ')');
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
        const angle = i * Math.PI / spikes;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);else
        ctx.lineTo(x, y);
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
    ctx.fillText('LUNAR TERRAIN', w / 2, 12);

    return; // Skip Earth map rendering
  }

  // Use Walk module for proper reference position
  const ref = currentMapReferenceWorldPosition();
  const refGeo = currentMapReferenceGeoPosition();
  const refLat = Number(refGeo?.lat);
  const refLon = Number(refGeo?.lon);
  const reducedRuntimeDetail = !isLarge && String(appCtx.minimapPerfMode || 'full') === 'reduced';
  const lightweightMinimap = !isLarge;
  const drawRuntimeBaseOverlay = isLarge || !!appCtx.satelliteView;
  const drawRuntimeContextOverlays = !lightweightMinimap && !reducedRuntimeDetail;
  const worldViewRadius = isLarge ? null : (reducedRuntimeDetail ? 760 : 1120);
  const worldViewBounds = Number.isFinite(ref?.x) && Number.isFinite(ref?.z) && Number.isFinite(worldViewRadius) ? {
    minX: ref.x - worldViewRadius,
    maxX: ref.x + worldViewRadius,
    minZ: ref.z - worldViewRadius,
    maxZ: ref.z + worldViewRadius
  } : null;
  const boundsLikelyVisible = (bounds, pad = 120) => {
    if (!worldViewBounds || !bounds) return true;
    return !(
      Number(bounds.maxX) < worldViewBounds.minX - pad ||
      Number(bounds.minX) > worldViewBounds.maxX + pad ||
      Number(bounds.maxZ) < worldViewBounds.minZ - pad ||
      Number(bounds.minZ) > worldViewBounds.maxZ + pad
    );
  };

  // Zoom level based on map size
  const zoom = isLarge ? appCtx.largeMapZoom : appCtx.minimapZoom;

  // Get tile coordinates and pixel position within tile
  const n = Math.pow(2, zoom);
  const xtile_float = (refLon + 180) / 360 * n;
  const ytile_float = (1 - Math.log(Math.tan(refLat * Math.PI / 180) + 1 / Math.cos(refLat * Math.PI / 180)) / Math.PI) / 2 * n;

  const centerTileX = Math.floor(xtile_float);
  const centerTileY = Math.floor(ytile_float);

  // Pixel offset within the center tile (0-256)
  const pixelOffsetX = (xtile_float - centerTileX) * 256;
  const pixelOffsetY = (ytile_float - centerTileY) * 256;

  drawEarthTileLayer(ctx, w, h, isLarge, zoom, xtile_float, ytile_float);

  // Center point for drawing indicators (vehicle is always at center)
  const mx = w / 2;
  const my = h / 2;

  // Helper function to convert world coords to screen position
  const worldToScreen = (worldX, worldZ) => {
    const geo = worldPointToGeo(worldX, worldZ);
    const lat = Number(geo?.lat);
    const lon = Number(geo?.lon);

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
  if (drawRuntimeBaseOverlay && !reducedRuntimeDetail && (appCtx.waterAreas.length > 0 || appCtx.waterways.length > 0)) {
    const viewPad = isLarge ? 100 : 45;

    if (appCtx.waterAreas.length > 0) {
      ctx.save();
      ctx.fillStyle = isLarge ? 'rgba(66, 142, 224, 0.30)' : 'rgba(66, 142, 224, 0.24)';
      ctx.strokeStyle = isLarge ? 'rgba(160, 220, 255, 0.55)' : 'rgba(160, 220, 255, 0.45)';
      ctx.lineWidth = isLarge ? 1.8 : 1.0;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      appCtx.waterAreas.forEach((area) => {
        if (!area?.pts || area.pts.length < 3) return;
        if (!boundsLikelyVisible(area?.bounds, 180)) return;

        let inView = false;
        ctx.beginPath();
        area.pts.forEach((pt, idx) => {
          const pos = worldToScreen(pt.x, pt.z);
          if (Math.abs(pos.x - mx) < w / 2 + viewPad && Math.abs(pos.y - my) < h / 2 + viewPad) {
            inView = true;
          }
          if (idx === 0) ctx.moveTo(pos.x, pos.y);else
          ctx.lineTo(pos.x, pos.y);
        });
        ctx.closePath();
        if (!inView) return;
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }

    if (appCtx.waterways.length > 0) {
      ctx.save();
      ctx.strokeStyle = isLarge ? 'rgba(70, 160, 240, 0.90)' : 'rgba(70, 160, 240, 0.82)';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      appCtx.waterways.forEach((way) => {
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
          if (Math.abs(pos.x - mx) < w / 2 + viewPad && Math.abs(pos.y - my) < h / 2 + viewPad) {
            inView = true;
          }
          if (idx === 0) ctx.moveTo(pos.x, pos.y);else
          ctx.lineTo(pos.x, pos.y);
        });
        if (!inView) return;
        ctx.stroke();
      });
      ctx.restore();
    }
  }

  if (drawRuntimeBaseOverlay && appCtx.showPathOverlays && appCtx.linearFeatures.length > 0) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    appCtx.linearFeatures.forEach((feature) => {
      if (!feature?.pts || feature.pts.length < 2) return;
      if (!boundsLikelyVisible(feature?.bounds, 180)) return;

      let strokeStyle = 'rgba(200, 190, 170, 0.78)';
      let lineWidth = isLarge ? 1.2 : 0.8;
      let dash = [];

      if (feature.kind === 'railway') {
        strokeStyle = isLarge ? 'rgba(92, 101, 114, 0.95)' : 'rgba(92, 101, 114, 0.88)';
        lineWidth = isLarge ? 2.1 : 1.2;
        dash = isLarge ? [8, 5] : [5, 4];
      } else if (feature.kind === 'cycleway') {
        strokeStyle = isLarge ? 'rgba(86, 144, 116, 0.92)' : 'rgba(86, 144, 116, 0.86)';
        lineWidth = isLarge ? 1.8 : 1.0;
      } else if (feature.subtype === 'pedestrian') {
        strokeStyle = isLarge ? 'rgba(214, 198, 171, 0.82)' : 'rgba(214, 198, 171, 0.74)';
        lineWidth = isLarge ? 1.4 : 0.9;
      }

      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dash);
      ctx.beginPath();

      let inView = false;
      feature.pts.forEach((pt, i) => {
        const pos = worldToScreen(pt.x, pt.z);
        if (Math.abs(pos.x - mx) < w && Math.abs(pos.y - my) < h) {
          inView = true;
        }
        if (i === 0) ctx.moveTo(pos.x, pos.y);else
        ctx.lineTo(pos.x, pos.y);
      });

      if (!inView) return;
      ctx.stroke();
    });

    ctx.setLineDash([]);
    ctx.restore();
  }

  // Draw road overlay (if enabled)
  if (drawRuntimeBaseOverlay && appCtx.showRoads && appCtx.roads.length > 0) {
    appCtx.roads.forEach((road) => {
      if (!road.pts || road.pts.length < 2) return;
      if (!boundsLikelyVisible(road?.bounds, 180)) return;

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
          if (i === 0) ctx.moveTo(pos.x, pos.y);else
          ctx.lineTo(pos.x, pos.y);
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
          if (i === 0) ctx.moveTo(pos.x, pos.y);else
          ctx.lineTo(pos.x, pos.y);
        }
      });
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    });
  }

  if (drawRuntimeContextOverlays && appCtx.mapLayers.interiors !== false && Array.isArray(appCtx.interiorLegendEntries) && appCtx.interiorLegendEntries.length > 0) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    appCtx.interiorLegendEntries.forEach((entry) => {
      if (!entry || !Number.isFinite(entry.x) || !Number.isFinite(entry.z)) return;
      const pos = worldToScreen(entry.x, entry.z);
      if (Math.abs(pos.x - mx) >= w / 2 + 24 || Math.abs(pos.y - my) >= h / 2 + 24) return;

      const size = isLarge ? 6 : 4;
      ctx.fillStyle = 'rgba(0, 255, 255, 0.92)';
      ctx.strokeStyle = '#062a33';
      ctx.lineWidth = isLarge ? 2 : 1;
      ctx.beginPath();
      ctx.rect(pos.x - size, pos.y - size, size * 2, size * 2);
      ctx.fill();
      ctx.stroke();

      if (isLarge) {
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#d9fdff';
        ctx.strokeStyle = '#062a33';
        ctx.lineWidth = 3;
        const label = String(entry.label || 'Interior');
        ctx.strokeText(label, pos.x, pos.y - size - 4);
        ctx.fillText(label, pos.x, pos.y - size - 4);
      }
    });
    ctx.restore();
  }

  if (drawRuntimeContextOverlays && appCtx.mapLayers.contributions !== false) {
    const overlayMapFeatures = [];
    if (Array.isArray(appCtx.overlayPublishedFeatures)) {
      appCtx.overlayPublishedFeatures.forEach((feature) => overlayMapFeatures.push({ feature, draft: false }));
    }
    if (Array.isArray(appCtx.overlayDraftPreviewFeatures)) {
      appCtx.overlayDraftPreviewFeatures.forEach((feature) => overlayMapFeatures.push({ feature, draft: true }));
    }
    if (overlayMapFeatures.length > 0) {
    ctx.save();
    overlayMapFeatures.forEach(({ feature, draft }) => {
      if (!feature || feature.worldKind !== 'earth') return;
      const featureColor = overlayMapFeatureColor(feature);
      const stroke = draft ? '#fde047' : featureColor;
      const fill = draft ? 'rgba(253,224,71,0.22)' : `${featureColor}33`;
      ctx.lineWidth = isLarge ? 2 : 1.3;
      ctx.strokeStyle = stroke;
      ctx.fillStyle = fill;

      if (feature.geometryType === 'Point') {
        const lat = Number(feature.geometry?.coordinates?.lat);
        const lon = Number(feature.geometry?.coordinates?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const pos = latLonToScreen(lat, lon);
        if (Math.abs(pos.x - mx) >= w / 2 || Math.abs(pos.y - my) >= h / 2) return;
        const radius = isLarge ? 6 : 4;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (isLarge) {
          const label = overlayMapFeatureLabel(feature);
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.strokeStyle = '#082032';
          ctx.lineWidth = 3;
          ctx.strokeText(label.slice(0, 32), pos.x, pos.y - radius - 4);
          ctx.fillStyle = draft ? '#fef3c7' : '#e0f2fe';
          ctx.fillText(label.slice(0, 32), pos.x, pos.y - radius - 4);
        }
        return;
      }

      if (feature.geometryType === 'LineString') {
        const coords = Array.isArray(feature.geometry?.coordinates) ? feature.geometry.coordinates : [];
        if (coords.length < 2) return;
        ctx.beginPath();
        coords.forEach((point, index) => {
          const pos = latLonToScreen(Number(point.lat), Number(point.lon));
          if (index === 0) ctx.moveTo(pos.x, pos.y);
          else ctx.lineTo(pos.x, pos.y);
        });
        ctx.stroke();
        return;
      }

      if (feature.geometryType === 'Polygon') {
        const ring = overlayGeometryPolygonRings(feature.geometry || {})[0] || [];
        if (ring.length < 3) return;
        ctx.beginPath();
        ring.forEach((point, index) => {
          const pos = latLonToScreen(Number(point.lat), Number(point.lon));
          if (index === 0) ctx.moveTo(pos.x, pos.y);
          else ctx.lineTo(pos.x, pos.y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    });
    ctx.restore();
    }
  }

  // Draw game elements using proper coordinate conversion
  if (!lightweightMinimap && appCtx.mapLayers.checkpoints && appCtx.gameMode === 'checkpoint') {
    appCtx.checkpoints.forEach((cp) => {
      if (cp.collected) return;
      const pos = worldToScreen(cp.x, cp.z);
      if (Math.abs(pos.x - mx) < w / 2 && Math.abs(pos.y - my) < h / 2) {
        ctx.fillStyle = '#f36';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, isLarge ? 8 : 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  if (!lightweightMinimap && appCtx.mapLayers.destination && appCtx.gameMode === 'trial' && appCtx.destination) {
    const pos = worldToScreen(appCtx.destination.x, appCtx.destination.z);
    ctx.fillStyle = appCtx.trialDone ? '#0f8' : '#fc0';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, isLarge ? 10 : 5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!lightweightMinimap && appCtx.mapLayers.police && appCtx.policeOn) {
    appCtx.police.forEach((cop) => {
      const pos = worldToScreen(cop.x, cop.z);
      if (Math.abs(pos.x - mx) < w / 2 && Math.abs(pos.y - my) < h / 2) {
        ctx.fillStyle = cop.chasing ? '#f00' : '#06f';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, isLarge ? 6 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // Draw POIs on minimap and large map based on legend layer filters
  if (drawRuntimeContextOverlays && appCtx.pois.length > 0) {
    appCtx.pois.forEach((poi) => {
      // Check if this POI category is visible
      if (!appCtx.isPOIVisible(poi.type)) return;

      const pos = worldToScreen(poi.x, poi.z);
      const dist = Math.sqrt(Math.pow(pos.x - mx, 2) + Math.pow(pos.y - my, 2));

      // Only show POIs within visible range
      if (Math.abs(pos.x - mx) < w / 2 && Math.abs(pos.y - my) < h / 2) {
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
  if (drawRuntimeContextOverlays && typeof appCtx.getMemoryEntriesForCurrentLocation === 'function') {
    const showPins = appCtx.mapLayers.memoryPins !== false;
    const showFlowers = appCtx.mapLayers.memoryFlowers !== false;
    if ((showPins || showFlowers) && !reducedRuntimeDetail) {
      const memoryEntries = appCtx.getMemoryEntriesForCurrentLocation();
      if (Array.isArray(memoryEntries) && memoryEntries.length > 0) {
        memoryEntries.forEach((entry) => {
          if (!entry || !Number.isFinite(entry.lat) || !Number.isFinite(entry.lon)) return;
          if (entry.type === 'flower' && !showFlowers) return;
          if (entry.type !== 'flower' && !showPins) return;
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
  }

  // Draw multiplayer room markers (public markers visible to all; user rooms when signed in).
  const mpMapState = appCtx.multiplayerMapRooms;
  const publicRooms = Array.isArray(mpMapState?.publicRooms) ? mpMapState.publicRooms : [];
  const userRooms = mpMapState?.signedIn && Array.isArray(mpMapState?.userRooms) ? mpMapState.userRooms : [];
  const activeRoomCode = String(mpMapState?.currentRoomCode || '');
  if (drawRuntimeContextOverlays && (publicRooms.length > 0 || userRooms.length > 0)) {
    const drawRoomMarker = (room, kind = 'public') => {
      if (!room || !Number.isFinite(Number(room.lat)) || !Number.isFinite(Number(room.lon))) return;
      const pos = latLonToScreen(Number(room.lat), Number(room.lon));
      if (Math.abs(pos.x - mx) >= w / 2 || Math.abs(pos.y - my) >= h / 2) return;

      const code = String(room.code || '').toUpperCase();
      const isActive = code && code === activeRoomCode;
      const baseRadius = isLarge ? 6 : 4;
      const radius = isActive ? baseRadius + 2 : baseRadius;
      let fill = '#f59e0b';
      if (kind === 'user') fill = '#0ea5e9';
      if (room.isWeekly) fill = '#8b5cf6';

      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = isLarge ? 2 : 1.2;
      ctx.fillStyle = fill;

      if (kind === 'user') {
        // User rooms are drawn as diamonds.
        ctx.translate(pos.x, pos.y);
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.rect(-radius, -radius, radius * 2, radius * 2);
        ctx.fill();
        ctx.stroke();
        ctx.rotate(-Math.PI / 4);
        if (isLarge) {
          const label = String(room.name || room.locationLabel || code || 'My Room');
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#e0f2fe';
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 3;
          ctx.strokeText(label, 0, radius + 12);
          ctx.fillText(label, 0, radius + 12);
        }
      } else {
        // Public rooms are circles.
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (isLarge) {
          const label = String(room.name || room.locationLabel || code || 'Public Room');
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'center';
          ctx.fillStyle = room.isWeekly ? '#e9d5ff' : '#fde68a';
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 3;
          ctx.strokeText(label, pos.x, pos.y + radius + 12);
          ctx.fillText(label, pos.x, pos.y + radius + 12);
        }
      }
      ctx.restore();
    };

    publicRooms.forEach((room) => drawRoomMarker(room, 'public'));
    userRooms.forEach((room) => drawRoomMarker(room, 'user'));
  }

  const activityMarkers = drawRuntimeContextOverlays && appCtx.mapLayers.activities !== false && Array.isArray(appCtx.activityDiscoveryMapMarkers)
    ? appCtx.activityDiscoveryMapMarkers
    : [];
  if (activityMarkers.length > 0) {
    activityMarkers.forEach((activity) => {
      if (!activity || !Number.isFinite(activity.x) || !Number.isFinite(activity.z)) return;
      const pos = worldToScreen(activity.x, activity.z);
      if (Math.abs(pos.x - mx) >= w / 2 || Math.abs(pos.y - my) >= h / 2) return;
      const color = String(activity.color || '#fbbf24');
      const radius = isLarge ? (activity.featured ? 7 : 5) : (activity.featured ? 5 : 4);
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = isLarge ? 2 : 1.25;
      if (activity.categoryId === 'room') {
        ctx.translate(pos.x, pos.y);
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.rect(-radius, -radius, radius * 2, radius * 2);
        ctx.fill();
        ctx.stroke();
      } else if (activity.categoryId === 'boat' || activity.categoryId === 'fishing') {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, Math.max(1, radius * 0.42), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15,23,42,0.88)';
        ctx.fill();
      } else if (activity.categoryId === 'drone') {
        ctx.translate(pos.x, pos.y);
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const angle = Math.PI / 6 + i * Math.PI / 3;
          const px = Math.cos(angle) * radius;
          const py = Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - radius - 2);
        ctx.lineTo(pos.x - radius * 0.8, pos.y + radius);
        ctx.lineTo(pos.x + radius * 0.8, pos.y + radius);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      if (isLarge) {
        const label = String(activity.title || 'Activity');
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.strokeText(label, pos.x, pos.y + radius + 13);
        ctx.fillText(label, pos.x, pos.y + radius + 13);
      }
    });
  }

  // Draw properties on minimap
  if (drawRuntimeContextOverlays && appCtx.mapLayers.properties && appCtx.realEstateMode && appCtx.properties.length > 0) {
    appCtx.properties.forEach((prop) => {
      const pos = worldToScreen(prop.x, prop.z);

      // Only show properties within visible range
      if (Math.abs(pos.x - mx) < w / 2 && Math.abs(pos.y - my) < h / 2) {
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

  // Keep the minimap cheap and uncluttered while driving.
  // Route overlays remain available on the large map only.
  if (isLarge && appCtx.mapLayers.navigation && appCtx.showNavigation) {
    const destination = appCtx.selectedProperty || appCtx.selectedHistoric;
    if (destination) {
      // Use Walk module to get proper player position
      const ref = appCtx.Walk ? appCtx.Walk.getMapRefPosition(appCtx.droneMode, appCtx.drone) : { x: appCtx.car.x, z: appCtx.car.z };
      const destPos = worldToScreen(destination.x, destination.z);
      const routePoints = Array.isArray(appCtx.navigationRoutePoints) && appCtx.navigationRoutePoints.length >= 2 ?
        appCtx.navigationRoutePoints :
        [{ x: ref.x, z: ref.z }, { x: destination.x, z: destination.z }];

      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = isLarge ? 4 : 2;
      ctx.setLineDash([isLarge ? 10 : 5, isLarge ? 5 : 3]);
      ctx.beginPath();
      routePoints.forEach((point, index) => {
        const pos = worldToScreen(point.x, point.z);
        if (index === 0) ctx.moveTo(pos.x, pos.y); else ctx.lineTo(pos.x, pos.y);
      });
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
        const dist = typeof appCtx.measureRemainingPolylineDistance === 'function' && routePoints.length > 1 ?
          appCtx.measureRemainingPolylineDistance(ref.x, ref.z, routePoints) :
          Math.sqrt((destination.x - ref.x) * (destination.x - ref.x) + (destination.z - ref.z) * (destination.z - ref.z));
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

  // Draw vehicle icons
  const iconSize = isLarge ? 16 : 8;

  if (appCtx.droneMode && isLarge) {
    // Show car position on large map when in drone mode
    const carPos = worldToScreen(appCtx.car.x, appCtx.car.z);
    if (Math.abs(carPos.x - mx) < w / 2 && Math.abs(carPos.y - my) < h / 2) {
      ctx.save();
      ctx.translate(carPos.x, carPos.y);
      ctx.rotate(appCtx.car.angle);
      ctx.fillStyle = '#f36';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -iconSize); // Tip/front points UP
      ctx.lineTo(-iconSize / 2, iconSize); // Back left
      ctx.lineTo(iconSize / 2, iconSize); // Back right
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // Draw drone or car or walker icon at center (always at mx, my)
  if (appCtx.droneMode) {
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(-appCtx.drone.yaw);
    ctx.fillStyle = '#0cf';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = isLarge ? 3 : 2;
    ctx.beginPath();
    ctx.arc(0, 0, iconSize * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-iconSize / 2, -iconSize / 2);
    ctx.lineTo(iconSize / 2, iconSize / 2);
    ctx.moveTo(iconSize / 2, -iconSize / 2);
    ctx.lineTo(-iconSize / 2, iconSize / 2);
    ctx.stroke();
    ctx.restore();
  } else if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') {
    // Walking mode - show person icon
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(-appCtx.Walk.state.walker.angle);
    ctx.fillStyle = '#4488ff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = isLarge ? 3 : 2;
    ctx.beginPath();
    ctx.arc(0, -iconSize / 2, iconSize / 3, 0, Math.PI * 2); // Head
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -iconSize / 6);
    ctx.lineTo(0, iconSize / 2); // Body
    ctx.moveTo(-iconSize / 3, 0);
    ctx.lineTo(iconSize / 3, 0); // Arms
    ctx.moveTo(0, iconSize / 2);
    ctx.lineTo(-iconSize / 4, iconSize); // Left leg
    ctx.moveTo(0, iconSize / 2);
    ctx.lineTo(iconSize / 4, iconSize); // Right leg
    ctx.stroke();
    ctx.restore();
  } else {
    // Driving mode - show car icon as TRIANGLE (tip = direction of travel)
    ctx.save();
    ctx.translate(mx, my);

    // Calculate heading from velocity direction (actual travel direction)
    // On minimap: X is horizontal, Z maps to vertical
    // Triangle tip at (0,-iconSize) points "up" so we need angle from -Y axis
    const speed = Math.sqrt(appCtx.car.vx * appCtx.car.vx + appCtx.car.vz * appCtx.car.vz);
    let directionAngle;
    if (speed > 0.1) {
      // Use velocity direction when moving
      directionAngle = Math.atan2(appCtx.car.vx, -appCtx.car.vz);
    } else {
      // Use car angle when stationary (keeps last direction)
      directionAngle = appCtx.car.angle;
    }
    ctx.rotate(directionAngle);

    ctx.fillStyle = '#f36';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = isLarge ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(0, -iconSize); // Tip/front points UP when angle=0
    ctx.lineTo(-iconSize / 2, iconSize); // Back left
    ctx.lineTo(iconSize / 2, iconSize); // Back right
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


Object.assign(appCtx, {
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
  worldToScreenLarge };
