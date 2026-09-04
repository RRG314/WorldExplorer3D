function clean(value, max = 100) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function mappedBuildingAddress(tags = {}) {
  const number = clean(tags['addr:housenumber'], 24);
  const street = clean(tags['addr:street'] || tags['addr:place'], 100);
  const locality = clean(tags['addr:city'] || tags['addr:town'] || tags['addr:village'], 80);
  const region = clean(tags['addr:state'] || tags['addr:province'], 80);
  const postalCode = clean(tags['addr:postcode'], 24);
  const country = clean(tags['addr:country'], 48);
  const line1 = [number, street].filter(Boolean).join(' ');
  if (!line1 && !locality && !region && !postalCode) return null;
  const localityLine = [locality, region, postalCode].filter(Boolean).join(', ');
  return Object.freeze({
    line1,
    locality,
    region,
    postalCode,
    country,
    formatted: [line1, localityLine, country].filter(Boolean).join(', '),
    source: 'mapped-building-tags'
  });
}

export { mappedBuildingAddress };
