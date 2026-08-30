const LOOT_PICKUP_SCHEMA_VERSION = 1;

function boundedText(value, fallback = '', max = 180) {
  const clean = String(value ?? '').trim().slice(0, max);
  return clean || fallback;
}

function createLootPickup(input = {}) {
  const sourceActorId = boundedText(input.sourceActorId);
  const catalogId = boundedText(input.catalogId, '', 80);
  if (!sourceActorId || !catalogId) return null;
  const x = Number(input.position?.x);
  const y = Number(input.position?.y);
  const z = Number(input.position?.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return {
    type: 'WorldLootPickup',
    schemaVersion: LOOT_PICKUP_SCHEMA_VERSION,
    id: `loot:${sourceActorId}:${catalogId}`,
    sourceActorId,
    catalogId,
    label: boundedText(input.label, 'Recovered equipment', 80),
    rounds: Math.max(0, Math.min(500, Math.floor(Number(input.rounds) || 0))),
    position: Object.freeze({ x, y, z }),
    authority: boundedText(input.authority, 'anonymous-local', 40),
    provenance: 'recovered-equipment',
    sourceEventId: `downed:${sourceActorId}`,
    claimed: false
  };
}

function claimLootPickup(pickup = {}, inventory = null, at = Date.now()) {
  if (pickup.claimed || !pickup.catalogId || !inventory?.upsertItem || !inventory?.grantAmmo) {
    return Object.freeze({ ok: false, reason: pickup.claimed ? 'already_claimed' : 'inventory_unavailable' });
  }
  if (!inventory.has?.(pickup.catalogId)) {
    inventory.upsertItem({
      instanceId: `recovered:${pickup.sourceActorId}:${pickup.catalogId}`,
      catalogId: pickup.catalogId,
      quantity: 1,
      authority: pickup.authority || 'anonymous-local',
      provenance: pickup.provenance || 'recovered-equipment',
      sourceEventId: pickup.sourceEventId || `downed:${pickup.sourceActorId}`,
      acquiredAt: Math.max(0, Number(at) || Date.now())
    });
  }
  const rounds = inventory.grantAmmo(pickup.catalogId, pickup.rounds);
  pickup.claimed = true;
  return Object.freeze({ ok: true, catalogId: pickup.catalogId, label: pickup.label, rounds });
}

export { LOOT_PICKUP_SCHEMA_VERSION, claimLootPickup, createLootPickup };
