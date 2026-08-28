function canUseEquippedItemOnMobile(equipped) {
  if (!equipped || typeof equipped !== 'object') return false;
  if (Array.isArray(equipped.verbs)) return equipped.verbs.includes('use');
  return !!equipped.projectileKind || !!equipped.actionLabel;
}

export { canUseEquippedItemOnMobile };
