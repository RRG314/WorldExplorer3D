const SHIP_DECK_BOUNDS = Object.freeze({ minX: -13, maxX: 13, minZ: -36, maxZ: 36 });

const SHIP_ROOMS = Object.freeze([
  Object.freeze({ id: 'bridge', label: 'Bridge', side: 'full', minX: -12.4, maxX: 12.4, minZ: 24, maxZ: 35 }),
  Object.freeze({ id: 'science', label: 'Science Lab', side: 'port', minX: -12.4, maxX: -2.7, minZ: 9, maxZ: 22 }),
  Object.freeze({ id: 'medical', label: 'Medical', side: 'starboard', minX: 2.7, maxX: 12.4, minZ: 9, maxZ: 22 }),
  Object.freeze({ id: 'quarters', label: 'Crew Quarters', side: 'port', minX: -12.4, maxX: -2.7, minZ: -6, maxZ: 7 }),
  Object.freeze({ id: 'life-support', label: 'Life Support', side: 'starboard', minX: 2.7, maxX: 12.4, minZ: -6, maxZ: 7 }),
  Object.freeze({ id: 'cargo-fabrication', label: 'Cargo & Fabrication', side: 'port', minX: -12.4, maxX: -2.7, minZ: -21, maxZ: -8 }),
  Object.freeze({ id: 'local-craft-bay', label: 'Local Craft Bay', side: 'starboard', minX: 2.7, maxX: 12.4, minZ: -21, maxZ: -8 }),
  Object.freeze({ id: 'engineering', label: 'Engineering', side: 'full', minX: -12.4, maxX: 12.4, minZ: -35, maxZ: -23 })
]);

const SHIP_STATIONS = Object.freeze([
  Object.freeze({ id: 'bridge-log', roomId: 'bridge', label: "Review Captain's Log", x: 0, z: 31, radius: 2.4 }),
  Object.freeze({ id: 'science-survey', roomId: 'science', label: 'Record stellar survey', x: -7.4, z: 15.5, radius: 2.2 }),
  Object.freeze({ id: 'medical-status', roomId: 'medical', label: 'Review crew health', x: 7.4, z: 15.5, radius: 2.2 }),
  Object.freeze({ id: 'life-support-status', roomId: 'life-support', label: 'Inspect life support', x: 7.4, z: 0.5, radius: 2.2 }),
  Object.freeze({ id: 'fabricator-status', roomId: 'cargo-fabrication', label: 'Inspect fabrication stores', x: -7.4, z: -14.5, radius: 2.2 }),
  Object.freeze({ id: 'craft-bay-status', roomId: 'local-craft-bay', label: 'Inspect local craft bay', x: 7.4, z: -14.5, radius: 2.2 }),
  Object.freeze({ id: 'engineering-status', roomId: 'engineering', label: 'Review ship systems', x: 0, z: -30, radius: 2.4 }),
  Object.freeze({ id: 'return-to-flight', roomId: 'bridge', label: 'Return to flight controls', x: 0, z: 25.8, radius: 2.1 })
]);

const SHIP_CREW_POSTS = Object.freeze([
  Object.freeze({ crewId: 'crew-nav', roomId: 'bridge', x: -4.5, z: 29.5, yaw: Math.PI }),
  Object.freeze({ crewId: 'crew-flight', roomId: 'bridge', x: 4.5, z: 29.5, yaw: Math.PI }),
  Object.freeze({ crewId: 'crew-science', roomId: 'science', x: -8.5, z: 18, yaw: Math.PI / 2 }),
  Object.freeze({ crewId: 'crew-med', roomId: 'medical', x: 8.5, z: 18, yaw: -Math.PI / 2 }),
  Object.freeze({ crewId: 'crew-life', roomId: 'life-support', x: 8.5, z: 2.5, yaw: -Math.PI / 2 }),
  Object.freeze({ crewId: 'crew-systems', roomId: 'cargo-fabrication', x: -8.5, z: -12, yaw: Math.PI / 2 }),
  Object.freeze({ crewId: 'crew-eng', roomId: 'engineering', x: -4.2, z: -30, yaw: 0 })
]);

function validateShipLayout() {
  const roomIds = new Set(SHIP_ROOMS.map((room) => room.id));
  const invalidRooms = SHIP_ROOMS.filter((room) =>
    room.minX < SHIP_DECK_BOUNDS.minX || room.maxX > SHIP_DECK_BOUNDS.maxX ||
    room.minZ < SHIP_DECK_BOUNDS.minZ || room.maxZ > SHIP_DECK_BOUNDS.maxZ ||
    room.minX >= room.maxX || room.minZ >= room.maxZ
  );
  const invalidStations = SHIP_STATIONS.filter((station) =>
    !roomIds.has(station.roomId) || station.x < SHIP_DECK_BOUNDS.minX || station.x > SHIP_DECK_BOUNDS.maxX ||
    station.z < SHIP_DECK_BOUNDS.minZ || station.z > SHIP_DECK_BOUNDS.maxZ
  );
  const invalidCrewPosts = SHIP_CREW_POSTS.filter((post) => !roomIds.has(post.roomId));
  return Object.freeze({
    valid: invalidRooms.length === 0 && invalidStations.length === 0 && invalidCrewPosts.length === 0,
    invalidRooms: Object.freeze(invalidRooms.map((room) => room.id)),
    invalidStations: Object.freeze(invalidStations.map((station) => station.id)),
    invalidCrewPosts: Object.freeze(invalidCrewPosts.map((post) => post.crewId)),
    roomCount: SHIP_ROOMS.length,
    stationCount: SHIP_STATIONS.length,
    crewPostCount: SHIP_CREW_POSTS.length
  });
}

export { SHIP_CREW_POSTS, SHIP_DECK_BOUNDS, SHIP_ROOMS, SHIP_STATIONS, validateShipLayout };
