function canUseEquippedItemOnMobile(equipped) {
  if (!equipped || typeof equipped !== 'object') return false;
  if (Array.isArray(equipped.verbs)) return equipped.verbs.includes('use') || equipped.verbs.includes('use-context');
  return !!equipped.projectileKind || !!equipped.actionLabel;
}

export { canUseEquippedItemOnMobile };
