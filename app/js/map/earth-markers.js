import { ctx as appCtx } from "../shared-context.js?v=55";
import { getMapReferencePosition } from "./tiles.js?v=5";

function drawEarthMarkerLayers(ctx, w, h, isLarge, view) {
  const { worldToScreen, latLonToScreen, mx, my } = view;

  drawGameModeMarkers(ctx, w, h, isLarge, worldToScreen, mx, my);
  drawDeFlockMarkers(ctx, w, h, isLarge, worldToScreen, mx, my);
  drawPois(ctx, w, h, isLarge, worldToScreen, mx, my);
  drawMemoryEntries(ctx, w, h, isLarge, latLonToScreen, mx, my);
  drawMultiplayerRooms(ctx, w, h, isLarge, latLonToScreen, mx, my);
  drawActivityMarkers(ctx, w, h, isLarge, worldToScreen, mx, my);
  drawProperties(ctx, w, h, isLarge, worldToScreen, mx, my);
  drawNavigation(ctx, isLarge, worldToScreen);
  drawCustomTrack(ctx, isLarge, worldToScreen);
}

function drawDeFlockMarkers(ctx, w, h, isLarge, worldToScreen, mx, my) {
  if (appCtx.gameMode !== "deflock" || !Array.isArray(appCtx.deFlockMapMarkers)) return;
  const markers = appCtx.deFlockMapMarkers
    .filter((marker) => Number.isFinite(marker?.x) && Number.isFinite(marker?.z))
    .map((marker) => ({ marker, position: worldToScreen(marker.x, marker.z) }))
    .filter(({ position }) => Math.abs(position.x - mx) < w / 2 && Math.abs(position.y - my) < h / 2);
  if (markers.length <= 0) return;

  const detailed = isLarge && Number(appCtx.largeMapZoom || 15) >= 14;
  const cellSize = detailed ? 10 : isLarge ? 22 : 15;
  const clusters = new Map();
  markers.forEach((entry) => {
    const key = detailed && entry.marker.objective
      ? `objective:${entry.marker.sourceId}`
      : `${Math.floor(entry.position.x / cellSize)}:${Math.floor(entry.position.y / cellSize)}`;
    const cluster = clusters.get(key) || [];
    cluster.push(entry);
    clusters.set(key, cluster);
  });

  [...clusters.values()].slice(0, isLarge ? 300 : 60).forEach((cluster) => {
    const x = cluster.reduce((sum, entry) => sum + entry.position.x, 0) / cluster.length;
    const y = cluster.reduce((sum, entry) => sum + entry.position.y, 0) / cluster.length;
    const objective = cluster.some((entry) => entry.marker.objective);
    const states = new Set(cluster.map((entry) => entry.marker.state));
    const color = states.has("discovered") ? "#fbbf24" : states.has("undiscovered") ? "#f43f5e" : "#22d3ee";
    const radius = objective ? (isLarge ? 8 : 6) : (isLarge ? 5 : 3.5);
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = objective ? "#ffffff" : "rgba(255,255,255,.82)";
    ctx.lineWidth = objective ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (objective) {
      ctx.strokeStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (cluster.length > 1 && isLarge) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(cluster.length), x, y);
    }
    ctx.restore();
  });
}

function drawGameModeMarkers(ctx, w, h, isLarge, worldToScreen, mx, my) {
  if (appCtx.mapLayers.checkpoints && appCtx.gameMode === "checkpoint") {
    appCtx.checkpoints.forEach((cp) => {
      if (cp.collected) return;
      const pos = worldToScreen(cp.x, cp.z);
      if (Math.abs(pos.x - mx) < w / 2 && Math.abs(pos.y - my) < h / 2) {
        ctx.fillStyle = "#f36";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, isLarge ? 8 : 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  if (appCtx.mapLayers.destination && appCtx.gameMode === "trial" && appCtx.destination) {
    const pos = worldToScreen(appCtx.destination.x, appCtx.destination.z);
    ctx.fillStyle = appCtx.trialDone ? "#0f8" : "#fc0";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, isLarge ? 10 : 5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (appCtx.mapLayers.police) {
    const response = appCtx.urbanSandboxRuntimeSnapshot?.()?.responders;
    const authoritativeResponders = Array.isArray(response?.responders) ? response.responders : [];
    const legacyPoliceMode = appCtx.gameMode === 'police' && appCtx.policeOn && Array.isArray(appCtx.police);
    const markers = authoritativeResponders.length
      ? authoritativeResponders.map((responder) => ({ ...responder, chasing: ['pursuit', 'contact'].includes(response.phase) }))
      : legacyPoliceMode ? appCtx.police : [];
    markers.forEach((cop) => {
      const pos = worldToScreen(cop.x, cop.z);
      if (Math.abs(pos.x - mx) < w / 2 && Math.abs(pos.y - my) < h / 2) {
        ctx.fillStyle = cop.chasing ? "#f00" : "#06f";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, isLarge ? 6 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
}

function drawPois(ctx, w, h, isLarge, worldToScreen, mx, my) {
  if (appCtx.pois.length <= 0) return;

  appCtx.pois.forEach((poi) => {
    if (!appCtx.isPOIVisible(poi.type)) return;

    const pos = worldToScreen(poi.x, poi.z);
    const dist = Math.sqrt((pos.x - mx) * (pos.x - mx) + (pos.y - my) * (pos.y - my));
    if (!(Math.abs(pos.x - mx) < w / 2 && Math.abs(pos.y - my) < h / 2)) return;

    ctx.fillStyle = `#${poi.color.toString(16).padStart(6, "0")}`;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = isLarge ? 2 : 1;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, isLarge ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (isLarge && dist < 200) {
      ctx.font = isLarge ? "16px Arial" : "10px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(poi.icon, pos.x, pos.y - (isLarge ? 12 : 8));
    }
  });
}

function drawMemoryEntries(ctx, w, h, isLarge, latLonToScreen, mx, my) {
  if (typeof appCtx.getMemoryEntriesForCurrentLocation !== "function") return;

  const showPins = appCtx.mapLayers.memoryPins !== false;
  const showFlowers = appCtx.mapLayers.memoryFlowers !== false;
  if (!(showPins || showFlowers)) return;

  const memoryEntries = appCtx.getMemoryEntriesForCurrentLocation();
  if (!(Array.isArray(memoryEntries) && memoryEntries.length > 0)) return;

  memoryEntries.forEach((entry) => {
    if (!entry || !Number.isFinite(entry.lat) || !Number.isFinite(entry.lon)) return;
    if (entry.type === "flower" && !showFlowers) return;
    if (entry.type !== "flower" && !showPins) return;

    const pos = latLonToScreen(entry.lat, entry.lon);
    if (Math.abs(pos.x - mx) >= w / 2 || Math.abs(pos.y - my) >= h / 2) return;

    const base = isLarge ? 6 : 4;
    if (entry.type === "flower") {
      ctx.fillStyle = "#ec4899";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = isLarge ? 2 : 1;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, base, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, base * 0.45, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.fillStyle = "#ef4444";
    ctx.strokeStyle = "#ffffff";
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
  });
}

function drawMultiplayerRooms(ctx, w, h, isLarge, latLonToScreen, mx, my) {
  const mpMapState = appCtx.multiplayerMapRooms;
  const publicRooms = Array.isArray(mpMapState?.publicRooms) ? mpMapState.publicRooms : [];
  const userRooms = mpMapState?.signedIn && Array.isArray(mpMapState?.userRooms) ? mpMapState.userRooms : [];
  const activeRoomCode = String(mpMapState?.currentRoomCode || "");
  if (!(publicRooms.length > 0 || userRooms.length > 0)) return;

  const drawRoomMarker = (room, kind = "public") => {
    if (!room || !Number.isFinite(Number(room.lat)) || !Number.isFinite(Number(room.lon))) return;
    const pos = latLonToScreen(Number(room.lat), Number(room.lon));
    if (Math.abs(pos.x - mx) >= w / 2 || Math.abs(pos.y - my) >= h / 2) return;

    const code = String(room.code || "").toUpperCase();
    const isActive = code && code === activeRoomCode;
    const baseRadius = isLarge ? 6 : 4;
    const radius = isActive ? baseRadius + 2 : baseRadius;
    let fill = "#f59e0b";
    if (kind === "user") fill = "#0ea5e9";
    if (room.isWeekly) fill = "#8b5cf6";

    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = isLarge ? 2 : 1.2;
    ctx.fillStyle = fill;

    if (kind === "user") {
      ctx.translate(pos.x, pos.y);
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.rect(-radius, -radius, radius * 2, radius * 2);
      ctx.fill();
      ctx.stroke();
      ctx.rotate(-Math.PI / 4);
      if (isLarge) {
        const label = String(room.name || room.locationLabel || code || "My Room");
        ctx.font = "bold 10px Arial";
        ctx.textAlign = "center";
        ctx.fillStyle = "#e0f2fe";
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 3;
        ctx.strokeText(label, 0, radius + 12);
        ctx.fillText(label, 0, radius + 12);
      }
    } else {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (isLarge) {
        const label = String(room.name || room.locationLabel || code || "Public Room");
        ctx.font = "bold 10px Arial";
        ctx.textAlign = "center";
        ctx.fillStyle = room.isWeekly ? "#e9d5ff" : "#fde68a";
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 3;
        ctx.strokeText(label, pos.x, pos.y + radius + 12);
        ctx.fillText(label, pos.x, pos.y + radius + 12);
      }
    }
    ctx.restore();
  };

  publicRooms.forEach((room) => drawRoomMarker(room, "public"));
  userRooms.forEach((room) => drawRoomMarker(room, "user"));
}

function drawActivityMarkers(ctx, w, h, isLarge, worldToScreen, mx, my) {
  const activityMarkers = appCtx.mapLayers.activities !== false && Array.isArray(appCtx.activityDiscoveryMapMarkers)
    ? appCtx.activityDiscoveryMapMarkers
    : [];
  if (activityMarkers.length <= 0) return;

  activityMarkers.forEach((activity) => {
    if (!activity || !Number.isFinite(activity.x) || !Number.isFinite(activity.z)) return;
    const pos = worldToScreen(activity.x, activity.z);
    if (Math.abs(pos.x - mx) >= w / 2 || Math.abs(pos.y - my) >= h / 2) return;

    const color = String(activity.color || "#fbbf24");
    const radius = isLarge ? (activity.featured ? 7 : 5) : (activity.featured ? 5 : 4);
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = isLarge ? 2 : 1.25;

    if (activity.categoryId === "room") {
      ctx.translate(pos.x, pos.y);
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.rect(-radius, -radius, radius * 2, radius * 2);
      ctx.fill();
      ctx.stroke();
    } else if (activity.categoryId === "boat" || activity.categoryId === "fishing") {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, Math.max(1, radius * 0.42), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(15,23,42,0.88)";
      ctx.fill();
    } else if (activity.categoryId === "drone") {
      ctx.translate(pos.x, pos.y);
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = Math.PI / 6 + i * Math.PI / 3;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
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
      const label = String(activity.title || "Activity");
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 3;
      ctx.strokeText(label, pos.x, pos.y + radius + 13);
      ctx.fillText(label, pos.x, pos.y + radius + 13);
    }
  });
}

function drawProperties(ctx, w, h, isLarge, worldToScreen, mx, my) {
  if (!(appCtx.mapLayers.properties && appCtx.realEstateMode && appCtx.properties.length > 0)) return;

  appCtx.properties.forEach((prop) => {
    const pos = worldToScreen(prop.x, prop.z);
    if (!(Math.abs(pos.x - mx) < w / 2 && Math.abs(pos.y - my) < h / 2)) return;

    ctx.fillStyle = prop.priceType === "sale" ? "#10b981" : "#3b82f6";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = isLarge ? 2 : 1;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, isLarge ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (isLarge) {
      const priceText = `$${Math.round(prop.price / 1000)}K`;
      ctx.font = "10px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.strokeText(priceText, pos.x, pos.y - 8);
      ctx.fillText(priceText, pos.x, pos.y - 8);
    }
  });
}

function drawNavigation(ctx, isLarge, worldToScreen) {
  if (!(appCtx.mapLayers.navigation && appCtx.showNavigation)) return;

  const destination = appCtx.selectedProperty || appCtx.selectedHistoric;
  if (!destination) return;

  const ref = getMapReferencePosition();
  const destPos = worldToScreen(destination.x, destination.z);
  const routePoints = Array.isArray(appCtx.navigationRoutePoints) && appCtx.navigationRoutePoints.length >= 2
    ? appCtx.navigationRoutePoints
    : [{ x: ref.x, z: ref.z }, { x: destination.x, z: destination.z }];

  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = isLarge ? 4 : 2;
  ctx.setLineDash([isLarge ? 10 : 5, isLarge ? 5 : 3]);
  ctx.beginPath();
  routePoints.forEach((point, index) => {
    const pos = worldToScreen(point.x, point.z);
    if (index === 0) ctx.moveTo(pos.x, pos.y);
    else ctx.lineTo(pos.x, pos.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#00ff88";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = isLarge ? 3 : 2;
  ctx.beginPath();
  ctx.arc(destPos.x, destPos.y, isLarge ? 8 : 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (isLarge) {
    const dist = typeof appCtx.measureRemainingPolylineDistance === "function" && routePoints.length > 1
      ? appCtx.measureRemainingPolylineDistance(ref.x, ref.z, routePoints)
      : Math.sqrt((destination.x - ref.x) * (destination.x - ref.x) + (destination.z - ref.z) * (destination.z - ref.z));
    const distText = `${Math.round(dist)}m`;
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.strokeText(distText, destPos.x, destPos.y - 15);
    ctx.fillText(distText, destPos.x, destPos.y - 15);
  }
}

function drawCustomTrack(ctx, isLarge, worldToScreen) {
  if (isLarge && appCtx.mapLayers.customTrack && appCtx.customTrack.length >= 2) {
    ctx.strokeStyle = appCtx.isRecording ? "#f64" : "#fa0";
    ctx.lineWidth = isLarge ? 5 : 3;
    ctx.beginPath();
    appCtx.customTrack.forEach((p, i) => {
      const pos = worldToScreen(p.x, p.z);
      if (i === 0) ctx.moveTo(pos.x, pos.y);
      else ctx.lineTo(pos.x, pos.y);
    });
    ctx.stroke();
  }
}

export { drawEarthMarkerLayers };
