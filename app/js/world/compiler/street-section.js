import { parseMeters } from './transport-source-normalizer.js?v=4';
// Street evidence is interpreted in source-way direction, never driving direction.
const text = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
function metres(value) {
  const n = parseMeters(value);
  return Number.isFinite(n) && n > 0 && n <= 20 ? n : null;
}
export function resolveStreetSection(tags = {}, { urban = false } = {}) {
  const highway = text(tags.highway),
    general = text(tags.sidewalk);
  const excluded =
    /^(motorway|trunk)(?:_link)?$|^(raceway|construction|proposed)$/.test(highway) ||
    !['', 'no', 'false', '0'].includes(text(tags.bridge)) ||
    !['', 'no', 'false', '0'].includes(text(tags.tunnel)) ||
    text(tags.foot) === 'no';
  const sides = {};
  for (const side of ['left', 'right']) {
    const explicit = text(tags[`sidewalk:${side}`]) || text(tags['sidewalk:both']);
    const token =
      explicit ||
      (general === side || general === 'both' || general === 'yes'
        ? 'yes'
        : ['left', 'right', 'no', 'none'].includes(general)
          ? 'no'
          : general);
    let presence = 'unknown',
      source = 'unresolved';
    if (excluded) {
      presence = 'absent';
      source = 'excluded-road';
    } else if (token === 'separate') {
      presence = 'separate';
      source = 'mapped-tag';
    } else if (['no', 'none'].includes(token)) {
      presence = 'absent';
      source = 'mapped-tag';
    } else if (['yes', 'designated'].includes(token)) {
      presence = 'present';
      source = 'mapped-tag';
    } else if (
      !token &&
      urban &&
      /^(residential|living_street|tertiary|secondary|primary|unclassified)$/.test(highway)
    ) {
      presence = 'present';
      source = 'inferred-urban-road';
    }
    const supplied = [
      tags[`sidewalk:${side}:width`],
      tags['sidewalk:both:width'],
      tags['sidewalk:width'],
    ].find((value) => text(value) !== '');
    const width = metres(supplied);
    sides[side] = Object.freeze({
      presence,
      source,
      widthMeters: presence === 'present' ? (width ?? 1.8) : null,
      widthSource: presence !== 'present' ? null : width !== null ? 'mapped-tag' : 'default-1.8m',
      invalidWidth: supplied != null && width === null,
    });
  }
  return Object.freeze({
    schemaVersion: 1,
    direction: 'source-way',
    left: sides.left,
    right: sides.right,
  });
}
