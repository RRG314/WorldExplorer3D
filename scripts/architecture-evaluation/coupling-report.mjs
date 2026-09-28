import { readFile, writeFile } from 'node:fs/promises';
const data = JSON.parse(await readFile('docs/architecture-evaluation/evidence/coupling-accesses.json', 'utf8'));
const manual = {
  'game/property-ui.js': ['H/G/I', 'housing UI and diagnostic fixture', 'Normal UI uses the housing authority and active world. Direct LOC/buildings replacement is gated behind developerDiagnosticsEnabled in stageMappedFixture, not ordinary property interaction.', 'Existing Housing commands plus read-only actor/location/building candidate view; keep the diagnostic fixture distinct from production mutation ownership.', 'medium', 'high'],
  'terrain/material-cache.js': ['B', 'shared road material cache', 'Reads three asphalt textures; delegates material creation and disposal to road-render. Cache is owned by terrainState, not portable terrain semantics.', 'RoadMaterialInputs plus existing terrainState cache owner; keep Three resources in the browser adapter.', 'low', 'medium'],
  'world/geometry-batching.js': ['B/J', 'geometry batching', 'Unused shared-context import; geometry inputs are already parameters.', 'Remove unused import when this adapter is next edited.', 'low', 'low'],
  'walking/geometry.js': ['E/J', 'walking geometry', 'Only polygon predicate arrives through context.', 'Inject or import the existing polygon predicate; retain one implementation.', 'high', 'low'],
  'world/load-selection.js': ['E/J', 'geographic selection', 'Distance ordering reads the active location implicitly.', 'Pass immutable location frame to existing selection functions.', 'high', 'medium'],
  'world/building-spatial-index.js': ['E/F', 'building queries', 'Index combines static, dynamic and ship colliders with suppression policy.', 'WorldCollisionView plus suppression predicate; retain index and ownership.', 'high', 'high'],
  'world/navigation.js': ['E/F/A', 'navigation and teleportation', 'Road queries, map transforms and actor mutation share a module.', 'Separate query inputs from actor teleport command; preserve exact surface rules.', 'high', 'high'],
  'procedural-random.js': ['A', 'procedural identity', 'Compatibility accessor delegates to the existing RDT seed.', 'Retain RDT ownership; no parallel random generator.', 'medium', 'medium'],
  'engine/night-lighting.js': ['B', 'lighting presentation', 'Reads actor, environment and scene; owns pooled lights.', 'LightingFrame {actorPose, nightFactor, fixtures, budget} plus scene owner.', 'low', 'medium'],
  'multiplayer/ui-room-pose.js': ['A/G', 'network pose adapter', 'Projects current environment and actor state into neutral room pose.', 'ActorPoseSource feeding existing room schema; keep engine orientation conversion here.', 'high', 'high'],
  'transport/actor-contract.js': ['A/F', 'active actor projection', 'Already centralizes which travel controller supplies the active actor.', 'Retain and type the existing actor contract; avoid another selector.', 'high', 'high'],
  'ground.js': ['E/F/B', 'surface queries', 'Published surface authority with renderer fallback raycasts.', 'Type SurfaceQuery result/inputs; keep mesh raycasts behind browser adapter.', 'high', 'high'],
  'game/paint-town/claims.js': ['D/B', 'paint ownership', 'Gameplay identity/footprints are read from rendered mesh userData.', 'ClaimableBuildingView from canonical building records; renderer only applies color.', 'high', 'high'],
  'runtime-diagnostics.js': ['I', 'diagnostics', 'Collects broad runtime snapshots on request.', 'Read-only diagnostic view; measure call frequency before changing snapshots.', 'low', 'medium'],
  'state.js': ['A', 'composition state', 'Initializes shared application state and compatibility bindings.', 'Retain composition root; typed domain views should narrow consumers.', 'low', 'high']
};
function role(row) {
  const f=row.file.replace('app/js/','');
  if(manual[f])return manual[f];
  const roots=[...new Set([...row.reads,...row.writes,...row.calls].map(x=>x.split('.')[1]).filter(Boolean))];
  if(/diagnostic|debug-tools|^perf\.js/.test(f))return ['I','diagnostics','Reads runtime for inspection and counters.','Read-only diagnostics interface; preserve optional instrumentation.','low','medium'];
  if(/(^ui[/.]|^hud[/.]|^map\/|tutorial|ui-room|navigation-ui|property-ui|historic-ui|(^|\/)ui\.js$|(^|\/)ui-)/.test(f))return ['H/A','UI and input','Connects UI actions/state to the active runtime.','UI-facing command/query adapter over existing authorities.','low','medium'];
  if(/^(main|app-entry|config|engine|game|env|pause-state|session-coordinator|earth-session|location-session|travel-mode|camera-mode|input)\.js$|^runtime\//.test(f))return ['A/C','application orchestration','Composes services, controllers or environment lifecycle.','Retain composition context; narrow service interfaces at consumers.','medium','high'];
  if(/^(creator|real-estate|multiplayer)|room-authority/.test(f))return ['G/A','persistence adapter','Connects account/room/persistence services to active gameplay.','Existing authority commands and neutral result records; no duplicate backend.','high','high'];
  if(/^(planetary|space|universe|interiors|ocean|expedition)|^(sky|solar-system|boat-mode)\.js/.test(f))return ['C/B','environment runtime','Coordinates environment state and its presentation or lifecycle.','Environment owner with explicit enter/update/exit and frame inputs.','medium','high'];
  if(/^(physics|walking|plane-mode)|responder-runtime/.test(f))return ['F/A','actor simulation','Reads active controller, world surface and collision state.','Simulation inputs plus SurfaceQuery/CollisionQuery and actor output.','high','high'];
  if(/^(world|terrain|surface-rules|earth-location|water-dynamics|weather|rdt)/.test(f))return [Object.keys(row.three).length?'E/B':'E','world and environment','Consumes or publishes location/world state through runtime context.','Existing world/session data plus explicit presentation or query adapter.','high','high'];
  if(Object.keys(row.three).length && /material|texture|marker|visual|effects|lighting/.test(f))return ['B','presentation','Uses active scene, material or visual state.','Renderer-owned resources with immutable frame/domain input.','low','medium'];
  return ['D/A','gameplay integration',`Connects gameplay with ${roots.slice(0,4).join(', ') || 'runtime registration'}.`,'Existing domain commands and read-only actor/world views.','high','high'];
}
const problems={
 'universe/navigation-scale.js':'Replace the temporary Vector3 arithmetic with a numeric scene-offset record; keep physical radius/speed policy unchanged.',
 'universe/mission-runtime.js':'Mission rule inputs should be numeric pose/distance and evidence records; keep visual/scene queries in the runtime adapter.',
 'game/paint-town/claims.js':'Use canonical building ID/footprint records for claims; map IDs to mesh/material only in presentation.',
 'planetary/catalog.js':'Keep astronomy projections neutral; move configureColorTexture to the presentation adapter. Preserve body-catalog authority.'
};
function threeClass(row){
 const f=row.file.replace('app/js/','');
 if(!Object.keys(row.three).length)return ['COMMENT ONLY','No executable THREE member access; do not refactor this as renderer coupling.'];
 if(problems[f])return ['PORTABILITY PROBLEM',problems[f]];
 if(/runtime|population|physics|ground\.js|water-query|interiors\/core|load-building|load-geometry|load-support|field-activities|ship-interior|^space\.js|^boat-mode\.js|ui-room-pose|^world\.js|^state\.js/.test(f))return ['ADAPTER CANDIDATE','Keep scene/physics presentation here; expose existing semantic records and numeric poses through a narrow boundary. Domain logic needs function-level review before extraction.'];
 return ['PRESENTATION — KEEP THREE','Three geometry/materials/cameras/asset transforms are appropriate presentation dependencies. Export semantic data separately only where another consumer needs it.'];
}
const roots=xs=>[...new Set(xs.map(x=>x.split('.').slice(1,2).join('.')).filter(Boolean))].sort().map(x=>'`'+x+'`').join(', ')||'—';
let md='# Coupling classification\n\nSource-access inventory covers all 166 context-import modules and all 191 lexical THREE modules in the established baseline. Babel parsed 285 distinct files. Two THREE matches are comments only (`config.js`, `terrain/height-sampling.js`); 189 contain executable member expressions. These are modules, not systems, defects or leaks.\n\n**Review status:** the tables are a source-access triage matrix, not a completed whole-program semantic audit. Named exceptions below received targeted source review. Other rows use explicit role rules and still require transitive call/lifecycle review before implementation. No global context removal is proposed.\n\n## Access evidence\n\n[Machine-readable evidence](evidence/coupling-accesses.json) contains each module hash, full nested read/write paths, deletions, calls, escapes and source lines. The compact table groups paths by context root for readability. Calls can mutate objects even where direct writes are empty. Constant aliases/destructuring are followed; dynamic keys, mutable aliases and callee side effects are not silently treated as known. Whole-context escapes require manual review. This limitation matters particularly for runtime initializers.\n\nA orchestration; B presentation; C environment lifecycle; D gameplay; E geographic/world; F simulation; G persistence; H UI; I diagnostics; J avoidable coupling.\n\n## Shared-context consumers\n\n| Module | Category / domain | Reads (roots) | Direct writes (roots) | Why / appropriateness | Proposed interface | Portability value | Risk |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n';
const assignments=[];
for(const row of data.rows){
 const f=row.file.replace('app/js/','');const info=role(row),three=threeClass(row);
 assignments.push({file:row.file,contextClassification:row.sharedContext?info:null,threeClassification:row.lexicalThreeCount?three:null,review:manual[f]||problems[f]?'targeted source review':'role triage; transitive review outstanding'});
 if(!row.sharedContext)continue;
 md+=`| ${f} | ${info[0]} / ${info[1]} | ${roots(row.reads)} | ${roots(row.writes)} | ${info[2]} ${info[0].includes('J')?'Narrow extraction warranted.':'Context is reasonable at the adapter/composition boundary; domain details need review.'} | ${info[3]} | ${info[4]} | ${info[5]} |\n`;
}
md+='\n## Direct Three.js coupling\n\n| Module | Classification | Referenced APIs | Direction / minimal neutral representation |\n| --- | --- | --- | --- |\n';
for(const row of data.rows.filter(x=>x.lexicalThreeCount)){
 const [category,direction]=threeClass(row);md+=`| ${row.file.replace('app/js/','')} | ${category} | ${Object.keys(row.three).join(', ')||'comment'} | ${direction} |\n`;
}
md+='\n## First extraction candidates\n\n1. Geographic selection: explicit location frame rather than active global location. Preserve provider selection ordering.\n2. Building claims: canonical identity/footprint view rather than mesh metadata as gameplay authority. This requires parity checks across batched buildings and multiplayer claims.\n3. Numeric universe navigation metrics: plain coordinate input; no reason for a renderer allocation.\n4. Surface and actor interfaces: type existing contracts and retain their ownership; do not build another query service.\n\nThe apparent unused context import in geometry batching is a cleanliness issue, not a meaningful FPS optimization. Renderer-specific batching and GLB presentation should remain Three-specific.\n';
await writeFile('docs/architecture-evaluation/COUPLING_CLASSIFICATION.md',md);
await writeFile('docs/architecture-evaluation/evidence/coupling-classifications.json',JSON.stringify(assignments,null,2)+'\n');
console.log(`Wrote ${data.counts.context} context rows and ${data.counts.lexicalThree} lexical Three rows; transitive review explicitly outstanding.`);
