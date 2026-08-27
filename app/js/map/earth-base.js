import { ctx as appCtx } from "../shared-context.js?v=55";
import { getOverlayPreset } from "../editor/preset-registry.js?v=1";
import { geometryPolygonRings } from "../editor/schema.js?v=1";
import { loadTile } from "./tiles.js?v=5";

const ROAD_MAP_INDEX_CELL_SIZE = 256;
let roadMapIndex = null;

function roadMapIndexIsCurrent(roads) {
  return roadMapIndex?.source === roads &&
    roadMapIndex.length === roads.length &&
    roadMapIndex.first === roads[0] &&
    roadMapIndex.last === roads[roads.length - 1];
}

function rebuildRoadMapIndex(roads) {
  const cells = new Map();
  const boundsByRoad = new WeakMap();
  for (const road of roads) {
    const points = Array.isArray(road?.pts) ? road.pts : [];
    if (points.length < 2) continue;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const point of points) {
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) continue;
      minX = Math.min(minX, point.x);
      minZ = Math.min(minZ, point.z);
      maxX = Math.max(maxX, point.x);
      maxZ = Math.max(maxZ, point.z);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minZ) ||
        !Number.isFinite(maxX) || !Number.isFinite(maxZ)) continue;
    const bounds = { minX, minZ, maxX, maxZ };
    boundsByRoad.set(road, bounds);
    const minCellX = Math.floor(minX / ROAD_MAP_INDEX_CELL_SIZE);
    const minCellZ = Math.floor(minZ / ROAD_MAP_INDEX_CELL_SIZE);
    const maxCellX = Math.floor(maxX / ROAD_MAP_INDEX_CELL_SIZE);
    const maxCellZ = Math.floor(maxZ / ROAD_MAP_INDEX_CELL_SIZE);
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const key = `${cellX}:${cellZ}`;
        const cell = cells.get(key) || [];
        cell.push(road);
        cells.set(key, cell);
      }
    }
  }
  roadMapIndex = {
    source: roads,
    length: roads.length,
    first: roads[0],
    last: roads[roads.length - 1],
    cells,
    boundsByRoad
  };
  return roadMapIndex;
}

function visibleRoadMapCandidates(roads, view, w, h) {
  const index = roadMapIndexIsCurrent(roads) ? roadMapIndex : rebuildRoadMapIndex(roads);
  const refX = Number(view?.ref?.x);
  const refZ = Number(view?.ref?.z);
  if (!Number.isFinite(refX) || !Number.isFinite(refZ)) return roads;

  const origin = view.worldToScreen(refX, refZ);
  const sampleDistance = 100;
  const sampleX = view.worldToScreen(refX + sampleDistance, refZ);
  const sampleZ = view.worldToScreen(refX, refZ + sampleDistance);
  const pixelsPerWorldX = Math.abs(sampleX.x - origin.x) / sampleDistance;
  const pixelsPerWorldZ = Math.abs(sampleZ.y - origin.y) / sampleDistance;
  if (!(pixelsPerWorldX > 0) || !(pixelsPerWorldZ > 0)) return roads;

  // Query twice the visible half-extent. The padding preserves roads whose
  // wide strokes or crossing segments enter the canvas from outside its edge.
  const halfWorldX = w / pixelsPerWorldX;
  const halfWorldZ = h / pixelsPerWorldZ;
  const minX = refX - halfWorldX;
  const maxX = refX + halfWorldX;
  const minZ = refZ - halfWorldZ;
  const maxZ = refZ + halfWorldZ;
  const minCellX = Math.floor(minX / ROAD_MAP_INDEX_CELL_SIZE);
  const minCellZ = Math.floor(minZ / ROAD_MAP_INDEX_CELL_SIZE);
  const maxCellX = Math.floor(maxX / ROAD_MAP_INDEX_CELL_SIZE);
  const maxCellZ = Math.floor(maxZ / ROAD_MAP_INDEX_CELL_SIZE);
  const candidates = new Set();
  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      for (const road of index.cells.get(`${cellX}:${cellZ}`) || []) {
        const bounds = index.boundsByRoad.get(road);
        if (bounds && bounds.maxX >= minX && bounds.minX <= maxX &&
            bounds.maxZ >= minZ && bounds.minZ <= maxZ) {
          candidates.add(road);
        }
      }
    }
  }
  return [...candidates];
}

function drawEarthBaseLayers(ctx, w, h, isLarge, view) {
  const {
    zoom,
    centerTileX,
    centerTileY,
    pixelOffsetX,
    pixelOffsetY,
    mx,
    my,
    startX,
    startY,
    tilesWide,
    tilesHigh,
    worldToScreen,
    latLonToScreen
  } = view;

  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, w, h);

  for (let dx = -Math.ceil(tilesWide / 2); dx <= Math.ceil(tilesWide / 2); dx += 1) {
    for (let dy = -Math.ceil(tilesHigh / 2); dy <= Math.ceil(tilesHigh / 2); dy += 1) {
      const tx = centerTileX + dx;
      const ty = centerTileY + dy;
      const maxTile = Math.pow(2, zoom) - 1;
      if (tx < 0 || tx > maxTile || ty < 0 || ty > maxTile) continue;

      const tile = loadTile(tx, ty, zoom);
      if (tile.loaded) {
        ctx.drawImage(tile.img, startX + dx * 256, startY + dy * 256, 256, 256);
      }
    }
  }

  drawWaterLayers(ctx, w, h, isLarge, worldToScreen, mx, my);
  drawLinearFeatureLayers(ctx, w, h, isLarge, worldToScreen, mx, my);
  drawRoadLayers(ctx, w, h, isLarge, view, worldToScreen);
  drawInteriorLayer(ctx, w, h, isLarge, worldToScreen, mx, my);
  drawContributionOverlayLayer(ctx, w, h, isLarge, latLonToScreen, mx, my);
}

function drawWaterLayers(ctx, w, h, isLarge, worldToScreen, mx, my) {
  if (!(appCtx.waterAreas.length > 0 || appCtx.waterways.length > 0)) return;

  const viewPad = isLarge ? 100 : 45;

  if (appCtx.waterAreas.length > 0) {
    ctx.save();
    ctx.fillStyle = isLarge ? "rgba(66, 142, 224, 0.30)" : "rgba(66, 142, 224, 0.24)";
    ctx.strokeStyle = isLarge ? "rgba(160, 220, 255, 0.55)" : "rgba(160, 220, 255, 0.45)";
    ctx.lineWidth = isLarge ? 1.8 : 1.0;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    appCtx.waterAreas.forEach((area) => {
      if (!area?.pts || area.pts.length < 3) return;
      let inView = false;
      ctx.beginPath();
      area.pts.forEach((pt, idx) => {
        const pos = worldToScreen(pt.x, pt.z);
        if (Math.abs(pos.x - mx) < w / 2 + viewPad && Math.abs(pos.y - my) < h / 2 + viewPad) {
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

  if (appCtx.waterways.length > 0) {
    ctx.save();
    ctx.strokeStyle = isLarge ? "rgba(70, 160, 240, 0.90)" : "rgba(70, 160, 240, 0.82)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    appCtx.waterways.forEach((way) => {
      if (!way?.pts || way.pts.length < 2) return;
      let inView = false;
      ctx.lineWidth = Math.max(
        isLarge ? 1.0 : 0.8,
        Math.min(isLarge ? 4.8 : 2.8, (way.width || 6) * (isLarge ? 0.20 : 0.12))
      );
      ctx.beginPath();
      way.pts.forEach((pt, idx) => {
        const pos = worldToScreen(pt.x, pt.z);
        if (Math.abs(pos.x - mx) < w / 2 + viewPad && Math.abs(pos.y - my) < h / 2 + viewPad) {
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

function drawLinearFeatureLayers(ctx, w, h, isLarge, worldToScreen, mx, my) {
  if (!(appCtx.showPathOverlays && appCtx.linearFeatures.length > 0)) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  appCtx.linearFeatures.forEach((feature) => {
    if (!feature?.pts || feature.pts.length < 2) return;

    let strokeStyle = "rgba(200, 190, 170, 0.78)";
    let lineWidth = isLarge ? 1.2 : 0.8;
    let dash = [];

    if (feature.kind === "railway") {
      strokeStyle = isLarge ? "rgba(92, 101, 114, 0.95)" : "rgba(92, 101, 114, 0.88)";
      lineWidth = isLarge ? 2.1 : 1.2;
      dash = isLarge ? [8, 5] : [5, 4];
    } else if (feature.kind === "cycleway") {
      strokeStyle = isLarge ? "rgba(86, 144, 116, 0.92)" : "rgba(86, 144, 116, 0.86)";
      lineWidth = isLarge ? 1.8 : 1.0;
    } else if (feature.subtype === "pedestrian") {
      strokeStyle = isLarge ? "rgba(214, 198, 171, 0.82)" : "rgba(214, 198, 171, 0.74)";
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
      if (i === 0) ctx.moveTo(pos.x, pos.y);
      else ctx.lineTo(pos.x, pos.y);
    });

    if (!inView) return;
    ctx.stroke();
  });

  ctx.setLineDash([]);
  ctx.restore();
}

function drawRoadLayers(ctx, w, h, isLarge, view, worldToScreen) {
  if (!(appCtx.showRoads && appCtx.roads.length > 0)) return;

  visibleRoadMapCandidates(appCtx.roads, view, w, h).forEach((road) => {
    if (!road.pts || road.pts.length < 2) return;

    let roadColor;
    let roadWidth;
    let outlineColor;
    const roadType = road.type || "residential";

    if (roadType === "motorway" || roadType === "trunk") {
      roadColor = "#ff8800";
      outlineColor = "#cc6600";
      roadWidth = isLarge ? 6 : 3;
    } else if (roadType === "primary" || roadType === "secondary") {
      roadColor = "#ffcc00";
      outlineColor = "#cc9900";
      roadWidth = isLarge ? 5 : 2.5;
    } else if (roadType === "tertiary") {
      roadColor = "#ffffff";
      outlineColor = "#999999";
      roadWidth = isLarge ? 4 : 2;
    } else {
      roadColor = "#ffffff";
      outlineColor = "#aaaaaa";
      roadWidth = isLarge ? 3 : 1.5;
    }

    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = roadWidth + (isLarge ? 2 : 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    road.pts.forEach((pt, i) => {
      const pos = worldToScreen(pt.x, pt.z);
      if (i === 0) ctx.moveTo(pos.x, pos.y);
      else ctx.lineTo(pos.x, pos.y);
    });
    ctx.stroke();

    ctx.strokeStyle = roadColor;
    ctx.lineWidth = roadWidth;
    ctx.beginPath();
    road.pts.forEach((pt, i) => {
      const pos = worldToScreen(pt.x, pt.z);
      if (i === 0) ctx.moveTo(pos.x, pos.y);
      else ctx.lineTo(pos.x, pos.y);
    });
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  });
}

function drawInteriorLayer(ctx, w, h, isLarge, worldToScreen, mx, my) {
  if (!(appCtx.mapLayers.interiors !== false && Array.isArray(appCtx.interiorLegendEntries) && appCtx.interiorLegendEntries.length > 0)) {
    return;
  }

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  appCtx.interiorLegendEntries.forEach((entry) => {
    if (!entry || !Number.isFinite(entry.x) || !Number.isFinite(entry.z)) return;
    const pos = worldToScreen(entry.x, entry.z);
    if (Math.abs(pos.x - mx) >= w / 2 + 24 || Math.abs(pos.y - my) >= h / 2 + 24) return;

    const size = isLarge ? 6 : 4;
    ctx.fillStyle = "rgba(0, 255, 255, 0.92)";
    ctx.strokeStyle = "#062a33";
    ctx.lineWidth = isLarge ? 2 : 1;
    ctx.beginPath();
    ctx.rect(pos.x - size, pos.y - size, size * 2, size * 2);
    ctx.fill();
    ctx.stroke();

    if (isLarge) {
      const label = String(entry.label || "Interior");
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "#d9fdff";
      ctx.strokeStyle = "#062a33";
      ctx.lineWidth = 3;
      ctx.strokeText(label, pos.x, pos.y - size - 4);
      ctx.fillText(label, pos.x, pos.y - size - 4);
    }
  });

  ctx.restore();
}

function drawContributionOverlayLayer(ctx, w, h, isLarge, latLonToScreen, mx, my) {
  const overlayMapFeatures = [];
  if (Array.isArray(appCtx.overlayPublishedFeatures)) {
    appCtx.overlayPublishedFeatures.forEach((feature) => overlayMapFeatures.push({ feature, draft: false }));
  }
  if (Array.isArray(appCtx.overlayDraftPreviewFeatures)) {
    appCtx.overlayDraftPreviewFeatures.forEach((feature) => overlayMapFeatures.push({ feature, draft: true }));
  }
  if (!(appCtx.mapLayers.contributions !== false && overlayMapFeatures.length > 0)) return;

  ctx.save();
  overlayMapFeatures.forEach(({ feature, draft }) => {
    if (!feature || feature.worldKind !== "earth") return;
    const preset = getOverlayPreset(feature.presetId);
    const stroke = draft ? "#fde047" : preset.color;
    const fill = draft ? "rgba(253,224,71,0.22)" : `${preset.color}33`;
    ctx.lineWidth = isLarge ? 2 : 1.3;
    ctx.strokeStyle = stroke;
    ctx.fillStyle = fill;

    if (feature.geometryType === "Point") {
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
        const label = String(feature.tags?.name || feature.summary || preset.label || "Overlay");
        ctx.font = "bold 10px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.strokeStyle = "#082032";
        ctx.lineWidth = 3;
        ctx.strokeText(label.slice(0, 32), pos.x, pos.y - radius - 4);
        ctx.fillStyle = draft ? "#fef3c7" : "#e0f2fe";
        ctx.fillText(label.slice(0, 32), pos.x, pos.y - radius - 4);
      }
      return;
    }

    if (feature.geometryType === "LineString") {
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

    if (feature.geometryType === "Polygon") {
      const ring = geometryPolygonRings(feature.geometry || {})[0] || [];
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

export { drawEarthBaseLayers };
