export function isRuinedBuilding(tags = {}) {
  const value = key => String(tags[key] || '').trim().toLowerCase();
  return value('building') === 'ruins' || value('historic') === 'ruins' ||
    (value('ruins') !== '' && value('ruins') !== 'no');
}

export function isHistoricMasonry(tags = {}) {
  return isRuinedBuilding(tags) || tags._landmarkRole === 'fortification_tower' || tags.historic === 'citywalls';
}
