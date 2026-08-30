const FIELD_RANKS = Object.freeze([
  Object.freeze({ id: 'trailhead', label: 'Trailhead', minimumRecords: 0, maxSlotIndex: 0, rarityBands: Object.freeze(['common', 'uncommon']) }),
  Object.freeze({ id: 'surveyor', label: 'Surveyor', minimumRecords: 3, maxSlotIndex: 1, rarityBands: Object.freeze(['common', 'uncommon', 'rare']) }),
  Object.freeze({ id: 'naturalist', label: 'Naturalist', minimumRecords: 10, maxSlotIndex: 2, rarityBands: Object.freeze(['common', 'uncommon', 'rare']) }),
  Object.freeze({ id: 'field-specialist', label: 'Field Specialist', minimumRecords: 24, maxSlotIndex: 3, rarityBands: Object.freeze(['common', 'uncommon', 'rare']) })
]);

function fieldRankForCount(recordCount = 0) {
  const count = Math.max(0, Number(recordCount) || 0);
  return FIELD_RANKS.slice().reverse().find((rank) => count >= rank.minimumRecords) || FIELD_RANKS[0];
}

function fieldProgress(profile = {}) {
  const records = Math.max(
    0,
    Number(profile.collectionCount) || 0,
    Number(profile.explorerProgress?.totalRecords) || 0
  );
  const rank = fieldRankForCount(records);
  const rankIndex = FIELD_RANKS.indexOf(rank);
  const next = FIELD_RANKS[rankIndex + 1] || null;
  return Object.freeze({
    records,
    rankId: rank.id,
    rankLabel: rank.label,
    maxSlotIndex: rank.maxSlotIndex,
    rarityBands: rank.rarityBands,
    next: next ? Object.freeze({ id: next.id, label: next.label, recordsRemaining: Math.max(0, next.minimumRecords - records) }) : null
  });
}

function slotAvailableAtProgress(slot, progress) {
  const rarityBand = String(slot?.rarityBand || 'common');
  if (Number(slot?.slotIndex || 0) > Number(progress?.maxSlotIndex || 0)) return false;
  return (progress?.rarityBands || FIELD_RANKS[0].rarityBands).includes(rarityBand);
}

function prioritizeProgressiveSlots(slots = [], options = {}) {
  const claimedIds = options.claimedIds instanceof Set ? options.claimedIds : new Set(options.claimedIds || []);
  const observedCatalogIds = options.observedCatalogIds instanceof Set ? options.observedCatalogIds : new Set(options.observedCatalogIds || []);
  const progress = options.progress || fieldProgress({ collectionCount: options.collectionCount || 0 });
  return slots
    .filter((slot) => !claimedIds.has(slot.claimId) && slotAvailableAtProgress(slot, progress))
    .slice()
    .sort((a, b) => {
      const aSeen = observedCatalogIds.has(a.catalogId) ? 1 : 0;
      const bSeen = observedCatalogIds.has(b.catalogId) ? 1 : 0;
      return aSeen - bSeen || Number(a.slotIndex || 0) - Number(b.slotIndex || 0) || a.id.localeCompare(b.id);
    });
}

export { FIELD_RANKS, fieldProgress, fieldRankForCount, prioritizeProgressiveSlots, slotAvailableAtProgress };
