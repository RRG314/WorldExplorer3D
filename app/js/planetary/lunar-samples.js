import { ensurePlayerBackpackInventory } from '../urban-sandbox/equipment-model.js?v=10';
import { LUNAR_FIELD_PLAN } from './lunar-survey.js';

export const lunarSampleId = evidenceId => `lunar-field-book:${evidenceId}`;

export function lunarSamplesAboard(ctx) {
  return ['mare-sample', 'fragment-sample'].every(id => ctx?.playerBackpackInventory?.has?.(lunarSampleId(id)));
}

export async function secureLunarSample(ctx, activity) {
  const definition = LUNAR_FIELD_PLAN.find(entry => entry.evidenceId === activity?.evidenceId && entry.activityId === 'geology-inspect');
  const eligible = () => ctx?.getEnv?.() === 'MOON' && ctx.Walk?.state?.mode === 'walk'
    && Math.hypot(ctx.Walk.state.walker.x-activity.x, ctx.Walk.state.walker.z-activity.z, ctx.Walk.state.walker.y-activity.y) <= 18;
  if (!definition || !eligible()) return false;
  const inventory = ensurePlayerBackpackInventory(ctx);
  if (!await ctx.playerBackpackSessionReady || !eligible()) return false;
  const id = lunarSampleId(definition.evidenceId);
  const item = { instanceId: id, catalogId: id, sourceEventId: `planetary-field:${activity.id}`, quantity: 1,
    authority: 'anonymous-local', provenance: 'authored-lunar-field-analog', tradeable: false,
    acquiredAt: Date.now(), metadata: { label: definition.evidenceId === 'mare-sample' ? 'Sealed lunar basalt analog' : 'Sealed lunar breccia analog',
      category: 'geology-sample', icon: 'ROCK', bodyId: 'moon', massKg: 0.15, description: definition.description,
      truthClass: 'authored-game-specimen', regionId: activity.regionId, evidenceId: definition.evidenceId } };
  if (inventory.has(id) || inventory.homeStoredQuantity?.(item) > 0) return true;
  const next = inventory.exportState();
  next.items = [...next.items, item];
  // Commit custody before publishing it to the inventory or mission. The
  // already-saved Journal observation is retryable if this write fails.
  if (!ctx.playerBackpackStore.save(next)) return false;
  inventory.registerDefinitions([{ id, label: item.metadata.label, category: 'geology-sample', icon: 'ROCK', verbs: ['inspect'], stackLimit: 1 }]);
  return inventory.applySavedState(next);
}
