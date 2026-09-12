import { COMMERCE_ITEM_DEFINITIONS } from '../../urban-sandbox/commerce-model.js?v=5';
// Designed experimental affordances, not claims about real-world material science.
// Nothing here is imported by normal World Explorer entry points.
const material = (id, massGrams, capabilities = []) => Object.freeze({
  id: `research:${id}`, label: id.replaceAll('-', ' '), category: capabilities.length ? 'tool' : 'material',
  stackLimit: 64, massGrams, capabilities: Object.freeze(capabilities), verbs: ['inspect', ...(capabilities.length ? ['equip'] : [])]
});
export const MATERIALS = Object.freeze([
  ...COMMERCE_ITEM_DEFINITIONS.filter(d=>['trail-water','route-snack'].includes(d.id)).map(d=>Object.freeze({...d,needRestore:Object.freeze(d.id==='trail-water'?{water:.4}:{food:.3}),description:d.id==='trail-water'?'Drink one carried unit to restore 0.40 water reserve (0 empty, 1 full), capped at 1; also restores the listed health amount.':'Eat one carried unit to restore 0.30 food reserve (0 empty, 1 full), capped at 1; also restores the listed health amount.',massGrams:d.id==='trail-water'?500:200,capabilities:Object.freeze([]),stackLimit:12})),
  material('branch', 500), material('stone', 500), material('fiber', 100),
  material('cord', 200), material('stone-axe', 1200, ['cut-wood']),
  material('timber', 1000), material('plank', 500),
  material('workbench-kit', 4000, ['woodworking']),
  material('storage-kit', 3000, ['storage']), material('wall-kit', 2000, ['wall']),
  material('shelter-kit', 5000, ['shelter'])
]);
const quantities = entries => Object.freeze(Object.fromEntries(Object.entries(entries).map(([id,n])=>[`research:${id}`,n])));
const recipe = (id, inputs, outputs, durationTicks, tools = [], station = null) => Object.freeze({
  id, inputs: quantities(inputs), outputs: quantities(outputs), durationTicks,
  tools: Object.freeze(tools.map(id=>`research:${id}`)), station
});
export const RECIPES = Object.freeze([
  recipe('twist-cord', {fiber:2}, {cord:1}, 2),
  recipe('lash-stone-axe', {branch:1,stone:1,cord:1}, {'stone-axe':1}, 4),
  recipe('split-timber', {timber:1}, {plank:2}, 3, ['stone-axe']),
  recipe('assemble-workbench', {plank:8}, {'workbench-kit':1}, 8, ['stone-axe']),
  recipe('assemble-storage', {plank:6}, {'storage-kit':1}, 6, ['stone-axe'], 'woodworking'),
  recipe('assemble-wall', {plank:4}, {'wall-kit':1}, 4, ['stone-axe'], 'woodworking'),
  recipe('assemble-shelter', {plank:10}, {'shelter-kit':1}, 12, ['stone-axe'], 'woodworking')
]);
export const MATERIAL_RULESET = 'research-materials-v1';
export function validateMaterialRules() {
  const byId = new Map(MATERIALS.map(m=>[m.id,m]));
  for (const r of RECIPES) {
    const mass = side => Object.entries(side).reduce((sum,[id,n])=>{
      if (!byId.has(id) || !Number.isInteger(n) || n<=0) throw new Error(`Invalid recipe quantity: ${r.id}`);
      return sum + byId.get(id).massGrams*n;
    },0);
    if (mass(r.inputs)!==mass(r.outputs)) throw new Error(`Unaccounted material mass: ${r.id}`);
    if (!Number.isInteger(r.durationTicks) || r.durationTicks<=0) throw new Error('Invalid work duration.');
  }
  return true;
}
validateMaterialRules();
