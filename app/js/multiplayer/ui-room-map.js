export function createUiRoomMapApi({ appCtx, state, helpers }) {
  const {
    buildWeeklyFeaturedRoomCode,
    getWeeklyCitySelection,
    normalizeCode,
    resolveWeeklyFeaturedWorld,
    sanitizeText
  } = helpers;

  function roomToMapMarker(room, type = "public") {
    if (!room || typeof room !== "object") return null;
    const code = normalizeCode(room.code || room.id || "");
    const worldKind = sanitizeText(room.world?.kind || "earth", 16).toLowerCase();
    if (worldKind !== "earth") return null;
    const lat = Number(room.world?.lat);
    const lon = Number(room.world?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const roomName = sanitizeText(room.name || room.locationTag?.label || code || "Room", 80) || "Room";
    const locationLabel = sanitizeText(room.locationTag?.label || room.locationTag?.city || "", 80);
    const visibility = String(room.visibility || "private").toLowerCase() === "public" ? "public" : "private";
    return {
      code: code || "",
      lat,
      lon,
      name: roomName,
      locationLabel,
      ownerUid: sanitizeText(room.ownerUid || room.createdBy || "", 160),
      createdBy: sanitizeText(room.createdBy || room.ownerUid || "", 160),
      type: type === "user" ? "user" : "public",
      visibility
    };
  }

  function dedupeMarkers(markers = []) {
    const out = [];
    const seen = new Set();
    markers.forEach((marker) => {
      if (!marker) return;
      const key = marker.code || `${marker.lat.toFixed(5)},${marker.lon.toFixed(5)},${marker.type}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(marker);
    });
    return out;
  }

  function buildWeeklyFeaturedMarker() {
    const weekly = getWeeklyCitySelection();
    const world = resolveWeeklyFeaturedWorld(weekly);
    if (!Number.isFinite(world.lat) || !Number.isFinite(world.lon)) return null;
    return {
      code: buildWeeklyFeaturedRoomCode(weekly),
      lat: world.lat,
      lon: world.lon,
      name: `Weekly City • ${weekly.city}`,
      locationLabel: weekly.city,
      type: "public",
      visibility: "public",
      isWeekly: true
    };
  }

  function publishMapRoomsToContext() {
    const signedIn = !!state.authUser;
    const userRooms = signedIn
      ? dedupeMarkers([
          ...state.ownedRooms.map((room) => roomToMapMarker(room, "user")),
          roomToMapMarker(state.currentRoom, "user")
        ])
      : [];
    const publicRooms = dedupeMarkers([
      ...state.featuredRooms.map((room) => roomToMapMarker(room, "public")),
      ...state.browseRooms.map((room) => roomToMapMarker(room, "public")),
      roomToMapMarker(
        state.currentRoom && String(state.currentRoom.visibility || "").toLowerCase() === "public" ? state.currentRoom : null,
        "public"
      ),
      buildWeeklyFeaturedMarker()
    ]);
    appCtx.multiplayerMapRooms = {
      signedIn,
      currentRoomCode: normalizeCode(state.currentRoom?.code || ""),
      userRooms,
      publicRooms,
      updatedAt: Date.now()
    };
    appCtx.multiplayerRoomActivities = state.roomActivities.slice();
    appCtx.multiplayerActiveRoomActivity = state.activeRoomActivity ? { ...state.activeRoomActivity } : null;
  }

  return { publishMapRoomsToContext };
}
