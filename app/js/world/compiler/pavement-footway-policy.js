import {isGroundStreet} from './street-frontage-policy.js';

// Mapped pedestrian centerlines need the same area/material/contact owner as
// inferred sidewalks. Missing sidewalk tags do not make a second surface.
// Keep trails, stairs, structures and explicitly unpaved paths with their
// existing owner; never relabel the source to infer a sidewalk designation.
export function isPavementFootway(feature) {
  if (!feature || feature.kind !== 'footway' || !isGroundStreet(feature) ||
      !['sidewalk', 'footway', 'pedestrian'].includes(feature.subtype)) return false;
  const tags = feature.sourceTags || feature.transportRecord?.sourceTags || feature.tags || {};
  const surface = String(tags.surface || '').trim().toLowerCase();
  return !surface || /^(paved|asphalt|concrete(?::plates|:lanes)?|paving_stones|sett|cobblestone(?::flattened)?|bricks|metal|wood)$/.test(surface);
}

export function isPavementCrossing(feature) {
  return !!feature && feature.kind === 'footway' && feature.subtype === 'crossing' && isGroundStreet(feature);
}

export function isMappedPedestrianArea(feature) {
  if(!isGroundStreet(feature))return false;
  const tags=feature.tags||feature.sourceTags||{};
  const present=value=>!['','no','false','0'].includes(String(value??'').trim().toLowerCase());
  if(present(tags.bridge)||present(tags.tunnel)||present(tags.indoor))return false;
  return ['footway','pedestrian'].includes(tags['area:highway']) ||
    (['footway','pedestrian'].includes(tags.highway)&&tags.area==='yes') ||
    (tags.place==='square'&&/^(paved|asphalt|concrete(?::plates)?|paving_stones|sett|cobblestone|bricks)$/.test(tags.surface||''));
}
