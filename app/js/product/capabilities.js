import { ACTIVITY_TEMPLATES } from '../activity-discovery/schema-core.js?v=1';
import { ACTIVITY_CATALOG, TOOL_CATALOG } from '../discovery/catalog.js?v=4';
import { LIVE_EARTH_LAYERS } from '../live-earth/registry.js?v=11';

// Product descriptions, not permissions. Runtime owners remain responsible for
// eligibility, persistence and multiplayer authority. Review new catalog entries
// before promoting their conservative "limited" status.
export const CAPABILITY_STATUS = Object.freeze({ playable: 'Available', limited: 'Limited', experimental: 'Preview', planned: 'Unavailable' });
export const CAPABILITY_GROUPS = Object.freeze({ worlds: 'Worlds & travel', activities: 'Activities', fieldwork: 'Fieldwork & tools', creation: 'Build & create', progress: 'Progress & together', data: 'Earth data' });
const localJournal = 'Journal and character progress stay in this browser. Signing in does not copy them to another device.';
const session = 'Your position and active controls last for the current visit.';
function row(id, label, group, status, summary, persistence) {
  return Object.freeze({ id, label, group, status, summary, persistence });
}
const core = [
  row('public-cameras', 'Public camera stills', 'data', 'limited', 'Browse Finland and California district 3/4 road-camera stills, switch views or open a four-view camera wall, and explore the mapped location. Capture time is shown when supplied; live video and worldwide coverage are unavailable.', 'Favorites and remote-view Journal references stay on this device and are included in Journal backup. Remote views award no visit or progress. The camera wall lasts for this session.'),
  row('maps', 'Maps, routes & saved places', 'worlds', 'limited', 'Use location search, supported navigation and saved places. Ocean uses its local seabed map; a full-screen ocean chart is not available.', 'Saved places and preferences are local to this browser. A shared link opens a destination; it does not transfer a save.'),
  row('sharing', 'Share a destination', 'progress', 'playable', 'Share a link to supported location and launch settings. Recipients start their own session.', 'Links carry destination settings, not your Journal, inventory or whole saved world.'),
  row('account', 'Account & contributions', 'progress', 'limited', 'Sign in to manage your profile, friends and building contributions.', 'Account and shared records save online. Your Journal and solo progress stay in this browser.'),
  row('controls', 'Controls & accessibility', 'progress', 'limited', 'Choose keyboard, touch or gamepad controls and adjust accessibility settings. Available controls depend on your browser and device.', 'Control and accessibility preferences are stored on this device.'),
  row('graphics', 'Graphics & performance settings', 'progress', 'playable', 'Adjust supported rendering and performance options for your browser.', 'Rendering preferences are local to this device.'),
  row('earth', 'Earth exploration', 'worlds', 'limited', 'Explore a detailed district around a selected real location. Optional regional scenery loads terrain and mapped buildings as you travel; detailed roads, interiors and activities remain in the starting district. Coverage depends on map availability.', session),
  row('walk', 'Walking & interiors', 'worlds', 'playable', 'Walk, interact and enter supported buildings. Mapped shallow water slows walking; deep water starts swimming.', session),
  row('drive', 'Road vehicles', 'worlds', 'playable', 'Drive supported roads and vehicles, switch cameras and recover to safe ground. Vehicle physics are a game simulation.', session),
  row('drone', 'Drone exploration', 'worlds', 'playable', 'Fly a local drone view with altitude and camera controls.', session),
  row('plane', 'Aircraft', 'worlds', 'limited', 'Fly the personal plane or board supported aircraft at eligible facilities. Airport availability depends on mapped coverage.', session),
  row('boat', 'Surface vessels', 'worlds', 'limited', 'Pilot supported vessel classes on mapped water. The research vessel has a walkable deck and working stations; the last ship/sub voyage can be resumed on this device.', 'Your last Ocean voyage saves on this device, including its ship and submarine. Other boat trips last for the current visit.'),
  row('ocean', 'Submarine exploration', 'worlds', 'limited', 'Pilot a submarine around an eligible ocean site. Coral Shelf has an authored reef pack, landmarks, optional sound and a complete research outing that earns longer scanner range. Seabed models, species and habitats are not a real-time ocean survey.', 'Your last voyage, ship, submarine, condition and location save on this device. Return aboard the submarine after reloading. Your Backpack and Journal save separately.'),
  row('swimming', 'Swimming & scuba diving', 'worlds', 'limited', 'Enter mapped deep water in Earth Walking mode, or stop the Ocean submarine at 1–16 m simulated depth and choose Explore outside submarine. Scuba equips automatically. Space/Shift and Rise/Dive control depth; Recover returns to safety. Swim within 8 m to board the parked sub. Stopped surface vessels in loaded mapped deep water also offer ladder entry and boarding; the same vessel remains moored.', 'Earth swimming retains air in a local surface checkpoint for up to 24 hours. Standalone Ocean dives last for the current session; board before leaving. Boarding replenishes dive air. The parent ship/sub voyage saves locally; an active diver resumes aboard the submarine after reload.'),
  row('research-ship', 'Research ship & sub deployment', 'worlds', 'limited', 'Walk the research deck, use the bridge chart, record modeled water conditions in the Journal, moor, swim from the ladder in loaded deep water, and deploy/recover the submarine from its cradle.', 'Lab reviews and your last voyage save in this browser. Recovery keeps your ship and submarine together. Your Backpack and Journal save separately. This research voyage is solo.'),
  row('moon', 'Moon exploration', 'worlds', 'limited', 'Explore the Moon with the supported surface tools and vehicles. Terrain and travel use game scales.', 'Field records and expedition progress save separately. Your surface position lasts for the current visit.'),
  row('mars', 'Mars exploration', 'worlds', 'limited', 'Explore Mars with a rover and supported field activities. This is not a full scientific simulation.', 'Field records and expedition progress save separately. Your surface position lasts for the current visit.'),
  row('space', 'Space flight & planetary destinations', 'worlds', 'experimental', 'Fly freely, follow Wayfinder courses and travel to supported destinations. The HUD shows your course, distance and landing guidance.', 'Your free-flight position lasts for the current visit. Expedition progress saves separately.'),
  row('solis', 'Solis Reach & Pathfinder', 'worlds', 'experimental', 'Explore the ship and observation views. The first planetary survey connects briefing, pod landing, three field records, partial recovery, lab analysis and Field Link II for longer-range remote stations on later worlds.', 'Solo expedition progress saves in this browser. Shared expedition progress belongs to the room. Your personal Journal saves separately.'),
  row('fishing', 'Fishing', 'activities', 'playable', 'Fish from supported contexts, complete the catch interaction and review catch records. Catalog availability is not a live fish sighting.', 'Catch history saves on this device. Online scores require a successful upload.'),
  row('flowers', 'Flower Sprint', 'activities', 'playable', 'Collect the marked flowers before time runs out. Review completion in the Journal; rankings are a separate online result.', localJournal),
  row('paint-town', 'Paint Town', 'activities', 'limited', 'An optional paint activity with its own controls and score. It does not permanently repaint real-world map buildings.', 'Paint effects last for the activity. Online rankings save separately.'),
  row('deflock', 'DeFlock activity', 'activities', 'limited', 'Explore mapped camera context and the supported game activity. Missing mapped records do not prove that no cameras exist.', 'Online activities and scores require an internet connection.'),
  row('journal', 'Journal, Field Guide & character', 'progress', 'playable', 'Record fieldwork, review discoveries and develop your Explorer skills and specialties.', localJournal),
  row('backpack', 'Backpack & equipment', 'progress', 'limited', 'Carry equipment for fieldwork and exploration. Select a tool to see where and how you can use it.', 'Your Backpack saves on this device. Trading and shared item changes need an internet connection; wait for confirmation before leaving.'),
  row('companions', 'Companions', 'progress', 'limited', 'Care for eligible companions and travel with them in supported environments and vehicles.', localJournal),
  row('rooms', 'Multiplayer rooms & chat', 'progress', 'limited', 'Join bounded rooms with presence, chat and supported shared building, vehicles and activities. Not every solo action is shared.', 'Shared changes need a connection and room permission. Personal Journal progress remains separate.'),
  row('economy', 'Credits, services & upgrades', 'progress', 'limited', 'Use game credits and supported services. In-game property, prices and credits do not represent real-world ownership or money.', 'Online purchases and upgrades are complete when confirmed. Your Journal and solo exploration progress save on this device.'),
  row('blocks', 'Build with Blocks', 'creation', 'playable', 'Place blocks, change shapes/materials and undo work. Room edit permissions apply to shared creations.', 'Solo blocks save by location on this device. Room blocks save through the shared room and require acknowledgement.'),
  row('property', 'Homes & virtual property', 'creation', 'limited', 'Manage supported game properties and home layouts. A game claim is not legal ownership of a building or parcel.', 'Buying or changing an online property requires sign-in and confirmation. Draft changes stay separate until published.'),
  row('capture', 'Photo capture & building contributions', 'creation', 'experimental', 'Capture photos, edit supported building representations and submit contributions for review. A saved draft is not a published building.', 'Local drafts, uploaded submissions and approved publications are separate states.'),
  row('gps', 'Live GPS', 'data', 'limited', 'Follow foreground device location when permission and coverage allow. This is not background world streaming.', 'Live GPS works while the app is open. It does not save your route.'),
  row('ar', 'AR & camera view', 'data', 'experimental', 'Camera and AR presentation depend on browser capabilities and permission. Persistent real-world anchors are not established.', 'Camera/AR sessions are temporary; saved captures use the capture workflow.'),
  row('weather', 'Weather, sky & water simulation', 'data', 'limited', 'Weather and marine data provide context. Rendered waves, tides, underwater movement and live measurements are not yet one complete physical simulation.', 'Provider samples have their own validity times; visual simulation is session state.')
];
export const PRODUCT_CAPABILITIES = Object.freeze([
  ...core,
  ...ACTIVITY_TEMPLATES.map(entry => row(`route:${entry.id}`, entry.label, 'activities', 'limited',
    'A route activity using placed anchors and checkpoints. Availability depends on the active environment and a valid route.', 'Your created activities save in this browser. Online results appear after a successful upload.')),
  ...ACTIVITY_CATALOG.map(entry => row(`field:${entry.id}`, entry.label, 'fieldwork', 'limited',
    entry.id === 'dive-survey' ? 'A virtual field record using a survey tool; this does not put your character in the water or equip scuba.' : 'A contextual field activity. Eligible locations and tools determine availability; records are game observations, not verified real-world findings.', localJournal)),
  ...TOOL_CATALOG.map(entry => row(`tool:${entry.id}`, entry.label, 'fieldwork', 'limited',
    entry.id === 'virtual-dive-kit' ? 'Record a virtual dive survey from the fieldwork menu. To swim, enter deep water or leave a stopped submarine; this tool does not equip scuba.' : 'Used by supported field activities. Select the tool to see its available actions and instructions.', localJournal)),
  ...Object.values(LIVE_EARTH_LAYERS).map(entry => row(`layer:${entry.id}`, entry.label, 'data', 'limited',
    entry.summary, 'Earth data does not add Journal progress. Check each layer’s timestamp and source.'))
]);
export function findProductCapabilities({ group = '', query = '' } = {}) {
  const needle = String(query).trim().toLowerCase();
  return PRODUCT_CAPABILITIES.filter(entry => (!group || entry.group === group)
    && (!needle || `${entry.label} ${entry.summary} ${CAPABILITY_STATUS[entry.status]}`.toLowerCase().includes(needle)));
}
