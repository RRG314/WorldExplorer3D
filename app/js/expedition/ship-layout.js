const SHIP_DECK_BOUNDS = Object.freeze({ minX: -13, maxX: 13, minZ: -36, maxZ: 36 });

function freezeRoom(room) { return Object.freeze({ ...room }); }
function freezeStation(station) { return Object.freeze({ radius: 2.15, ...station }); }
function deck(id, label, shortLabel, rooms, stations) {
  return Object.freeze({
    id, label, shortLabel,
    rooms: Object.freeze(rooms.map((room) => freezeRoom({ ...room, deckId: id }))),
    stations: Object.freeze(stations.map((station) => freezeStation({ ...station, deckId: id })))
  });
}

const SHIP_DECKS = Object.freeze([
  deck('command', 'Deck 1 · Command & Science', 'Command', [
    { id: 'bridge', label: 'Bridge', side: 'full', minX: -12.4, maxX: 12.4, minZ: 24, maxZ: 35, systemId: 'navigation' },
    { id: 'navigation-cartography', label: 'Navigation & Cartography', side: 'port', minX: -12.4, maxX: -2.7, minZ: 9, maxZ: 22, systemId: 'navigation' },
    { id: 'communications', label: 'Communications', side: 'starboard', minX: 2.7, maxX: 12.4, minZ: 9, maxZ: 22, systemId: 'navigation' },
    { id: 'science', label: 'Physical Sciences', side: 'port', minX: -12.4, maxX: -2.7, minZ: -6, maxZ: 7, systemId: 'sensors' },
    { id: 'sensor-control', label: 'Sensor Control', side: 'starboard', minX: 2.7, maxX: 12.4, minZ: -6, maxZ: 7, systemId: 'sensors' },
    { id: 'analysis-data', label: 'Analysis & Data', side: 'port', minX: -12.4, maxX: -2.7, minZ: -21, maxZ: -8, systemId: 'sensors' },
    { id: 'briefing', label: 'Briefing Room', side: 'starboard', minX: 2.7, maxX: 12.4, minZ: -21, maxZ: -8, systemId: 'navigation' },
    { id: 'observation-gallery', label: 'Observation Gallery', side: 'full', minX: -12.4, maxX: 12.4, minZ: -35, maxZ: -23, systemId: 'sensors' }
  ], [
    { id: 'bridge-flight', roomId: 'bridge', label: 'Flight controls', x: 7, z: 31 },
    { id: 'bridge-log', roomId: 'bridge', label: "Review Captain's Log", x: 0, z: 25.5 },
    { id: 'navigation-course', roomId: 'navigation-cartography', label: 'Review route and margins', x: -5.1, z: 15.5 },
    { id: 'communications-status', roomId: 'communications', label: 'Review mission communications', x: 5.1, z: 15.5 },
    { id: 'science-survey', roomId: 'science', label: 'Record stellar survey', x: -5.1, z: 0.5 },
    { id: 'sensor-scan', roomId: 'sensor-control', label: 'Configure sensor scan', x: 5.1, z: 0.5 },
    { id: 'analysis-review', roomId: 'analysis-data', label: 'Review observation evidence', x: -5.1, z: -14.5 },
    { id: 'briefing-status', roomId: 'briefing', label: 'Review crew priorities', x: 3.7, z: -14.5 },
    { id: 'observation-view', roomId: 'observation-gallery', label: 'Observe local space', x: 0, z: -30 }
  ]),
  deck('habitat', 'Deck 2 · Habitat & Health', 'Habitat', [
    { id: 'galley-wardroom', label: 'Galley & Wardroom', side: 'full', minX: -12.4, maxX: 12.4, minZ: 24, maxZ: 35, systemId: 'food-production' },
    { id: 'medical', label: 'Medical Bay', side: 'port', minX: -12.4, maxX: -2.7, minZ: 9, maxZ: 22, systemId: 'medical' },
    { id: 'exercise-bay', label: 'Exercise Bay', side: 'starboard', minX: 2.7, maxX: 12.4, minZ: 9, maxZ: 22, systemId: 'medical' },
    { id: 'quarters', label: 'Port Quarters', side: 'port', minX: -12.4, maxX: -2.7, minZ: -6, maxZ: 7, systemId: 'life-support' },
    { id: 'quarters-starboard', label: 'Starboard Quarters', side: 'starboard', minX: 2.7, maxX: 12.4, minZ: -6, maxZ: 7, systemId: 'life-support' },
    { id: 'hygiene-waste', label: 'Hygiene & Waste', side: 'port', minX: -12.4, maxX: -2.7, minZ: -21, maxZ: -8, systemId: 'life-support' },
    { id: 'life-support', label: 'Life-Support Control', side: 'starboard', minX: 2.7, maxX: 12.4, minZ: -21, maxZ: -8, systemId: 'life-support' },
    { id: 'hydroponics', label: 'Hydroponics', side: 'port', minX: -12.4, maxX: -2.7, minZ: -35, maxZ: -23, systemId: 'food-production' },
    { id: 'storm-shelter', label: 'Storm Shelter', side: 'starboard', minX: 2.7, maxX: 12.4, minZ: -35, maxZ: -23, systemId: 'hull' }
  ], [
    { id: 'galley-meal', roomId: 'galley-wardroom', label: 'Prepare crew meal', x: 0, z: 27.9 },
    { id: 'medical-status', roomId: 'medical', label: 'Review crew health', x: -4.2, z: 15.5 },
    { id: 'medical-treatment', roomId: 'medical', label: 'Prepare treatment', x: -4.2, z: 11.2 },
    { id: 'exercise-session', roomId: 'exercise-bay', label: 'Begin exercise session', x: 4.2, z: 15.5 },
    { id: 'quarters-status', roomId: 'quarters', label: 'Review personal assignment', x: -7.5, z: 0.5 },
    { id: 'hygiene-status', roomId: 'hygiene-waste', label: 'Inspect water recovery', x: -7.5, z: -14.5 },
    { id: 'life-support-status', roomId: 'life-support', label: 'Inspect life support', x: 7.5, z: -14.5 },
    { id: 'hydroponics-tend', roomId: 'hydroponics', label: 'Tend hydroponics', x: -4.2, z: -29 },
    { id: 'storm-shelter-status', roomId: 'storm-shelter', label: 'Inspect storm shelter', x: 4.2, z: -29 }
  ]),
  deck('engineering', 'Deck 3 · Engineering & Mission', 'Engineering', [
    { id: 'engineering', label: 'Main Engineering', side: 'full', minX: -12.4, maxX: 12.4, minZ: 24, maxZ: 35, systemId: 'propulsion' },
    { id: 'power-control', label: 'Power Control', side: 'port', minX: -12.4, maxX: -2.7, minZ: 9, maxZ: 22, systemId: 'power' },
    { id: 'thermal-control', label: 'Thermal Control', side: 'starboard', minX: 2.7, maxX: 12.4, minZ: 9, maxZ: 22, systemId: 'thermal' },
    { id: 'cargo-fabrication', label: 'Fabrication Shop', side: 'port', minX: -12.4, maxX: -2.7, minZ: -6, maxZ: 7, systemId: 'fabrication' },
    { id: 'cargo-hold', label: 'Cargo Hold', side: 'starboard', minX: 2.7, maxX: 12.4, minZ: -6, maxZ: 7, systemId: 'hull' },
    { id: 'resource-processing', label: 'Resource Processing', side: 'port', minX: -12.4, maxX: -2.7, minZ: -21, maxZ: -8, systemId: 'fabrication' },
    { id: 'eva-airlock', label: 'EVA Airlock', side: 'starboard', minX: 2.7, maxX: 12.4, minZ: -21, maxZ: -8, systemId: 'hull' },
    { id: 'local-craft-bay', label: 'Local-Craft Bay', side: 'full', minX: -12.4, maxX: 12.4, minZ: -35, maxZ: -23, systemId: 'hull' }
  ], [
    { id: 'engineering-status', roomId: 'engineering', label: 'Review ship systems', x: 0, z: 25.2 },
    { id: 'engineering-repair', roomId: 'engineering', label: 'Prepare repair', x: -7, z: 30 },
    { id: 'power-status', roomId: 'power-control', label: 'Review power distribution', x: -7.5, z: 15.5 },
    { id: 'thermal-status', roomId: 'thermal-control', label: 'Review thermal loops', x: 7.5, z: 15.5 },
    { id: 'fabricator-status', roomId: 'cargo-fabrication', label: 'Inspect fabrication stores', x: -4.3, z: 0.5 },
    { id: 'cargo-status', roomId: 'cargo-hold', label: 'Review cargo manifest', x: 4.3, z: 0.5 },
    { id: 'resource-processor-status', roomId: 'resource-processing', label: 'Inspect resource processor', x: -4.3, z: -14.5 },
    { id: 'airlock-status', roomId: 'eva-airlock', label: 'Inspect EVA readiness', x: 4.3, z: -14.5 },
    { id: 'craft-bay-status', roomId: 'local-craft-bay', label: 'Inspect local craft bay', x: 5.4, z: -29 }
  ])
]);

const SHIP_ROOMS = Object.freeze(SHIP_DECKS.flatMap((entry) => entry.rooms));
const SHIP_STATIONS = Object.freeze(SHIP_DECKS.flatMap((entry) => [
  ...entry.stations,
  freezeStation({ id: `deck-lift:${entry.id}`, roomId: null, deckId: entry.id, label: 'Use deck lift', x: 0, z: 0, radius: 2 })
]));
const SHIP_DOORS = Object.freeze(SHIP_ROOMS.map((room) => {
  const sideDoor = room.side === 'port' || room.side === 'starboard';
  const fore = room.side === 'full' && room.minZ >= 23;
  return Object.freeze({
    id: `door:${room.id}`, deckId: room.deckId, roomId: room.id,
    label: `${room.label} pressure door`,
    x: sideDoor ? (room.side === 'port' ? -2.7 : 2.7) : 0,
    z: sideDoor ? (room.minZ + room.maxZ) * 0.5 : fore ? room.minZ : room.maxZ,
    orientation: sideDoor ? 'side' : 'cross', radius: 1.8
  });
}));
const SHIP_CREW_POSTS = Object.freeze([
  Object.freeze({ crewId: 'crew-nav', deckId: 'command', roomId: 'bridge', x: -4.5, z: 29.5, yaw: Math.PI }),
  Object.freeze({ crewId: 'crew-flight', deckId: 'command', roomId: 'bridge', x: 4.5, z: 29.5, yaw: Math.PI }),
  Object.freeze({ crewId: 'crew-science', deckId: 'command', roomId: 'science', x: -8.5, z: 3, yaw: Math.PI / 2 }),
  Object.freeze({ crewId: 'crew-med', deckId: 'habitat', roomId: 'medical', x: -8.5, z: 18, yaw: Math.PI / 2 }),
  Object.freeze({ crewId: 'crew-life', deckId: 'habitat', roomId: 'life-support', x: 8.5, z: -12, yaw: -Math.PI / 2 }),
  Object.freeze({ crewId: 'crew-systems', deckId: 'engineering', roomId: 'cargo-fabrication', x: -8.5, z: 3, yaw: Math.PI / 2 }),
  Object.freeze({ crewId: 'crew-eng', deckId: 'engineering', roomId: 'engineering', x: -4.2, z: 30, yaw: 0 })
]);

function getShipDeck(deckId) { return SHIP_DECKS.find((entry) => entry.id === deckId) || null; }
function getShipRoom(roomId) { return SHIP_ROOMS.find((room) => room.id === roomId) || null; }
function getShipDeckForRoom(roomId) { return getShipRoom(roomId)?.deckId || null; }

function validateShipLayout() {
  const roomIds = new Set(SHIP_ROOMS.map((room) => room.id));
  const deckIds = new Set(SHIP_DECKS.map((entry) => entry.id));
  const duplicateRoomIds = SHIP_ROOMS.filter((room, index) => SHIP_ROOMS.findIndex((entry) => entry.id === room.id) !== index).map((room) => room.id);
  const invalidRooms = SHIP_ROOMS.filter((room) => !deckIds.has(room.deckId) || room.minX < SHIP_DECK_BOUNDS.minX || room.maxX > SHIP_DECK_BOUNDS.maxX || room.minZ < SHIP_DECK_BOUNDS.minZ || room.maxZ > SHIP_DECK_BOUNDS.maxZ || room.minX >= room.maxX || room.minZ >= room.maxZ);
  const invalidStations = SHIP_STATIONS.filter((station) => !deckIds.has(station.deckId) || (station.roomId && !roomIds.has(station.roomId)) || station.x < SHIP_DECK_BOUNDS.minX || station.x > SHIP_DECK_BOUNDS.maxX || station.z < SHIP_DECK_BOUNDS.minZ || station.z > SHIP_DECK_BOUNDS.maxZ);
  const invalidDoors = SHIP_DOORS.filter((door) => !deckIds.has(door.deckId) || !roomIds.has(door.roomId));
  const invalidCrewPosts = SHIP_CREW_POSTS.filter((post) => !deckIds.has(post.deckId) || !roomIds.has(post.roomId));
  return Object.freeze({
    valid: duplicateRoomIds.length === 0 && invalidRooms.length === 0 && invalidStations.length === 0 && invalidDoors.length === 0 && invalidCrewPosts.length === 0,
    duplicateRoomIds: Object.freeze(duplicateRoomIds),
    invalidRooms: Object.freeze(invalidRooms.map((room) => room.id)),
    invalidStations: Object.freeze(invalidStations.map((station) => station.id)),
    invalidDoors: Object.freeze(invalidDoors.map((door) => door.id)),
    invalidCrewPosts: Object.freeze(invalidCrewPosts.map((post) => post.crewId)),
    deckCount: SHIP_DECKS.length, roomCount: SHIP_ROOMS.length, stationCount: SHIP_STATIONS.length,
    doorCount: SHIP_DOORS.length, crewPostCount: SHIP_CREW_POSTS.length
  });
}

export { getShipDeck, getShipDeckForRoom, getShipRoom, SHIP_CREW_POSTS, SHIP_DECK_BOUNDS, SHIP_DECKS, SHIP_DOORS, SHIP_ROOMS, SHIP_STATIONS, validateShipLayout };
