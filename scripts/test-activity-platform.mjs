import assert from 'node:assert/strict';
import {
  createDefaultAnchorDraft,
  defaultTemplateForTraversalMode,
  getActivityTemplate,
  listActivityTemplates,
  orderedRouteAnchors
} from '../app/js/activity-editor/schema.js';
import { validateActivityDraft } from '../app/js/activity-editor/validation.js';
import { discoveryCategoryForTemplate } from '../app/js/activity-discovery/schema.js';

function anchorsFor(templateId) {
  const template = getActivityTemplate(templateId);
  let index = 0;
  return template.requiredAnchors.flatMap((requirement) => (
    Array.from({ length: requirement.min }, () => {
      index += 1;
      return createDefaultAnchorDraft(requirement.id, {
        id: `${templateId}_${requirement.id}_${index}`,
        x: index * 20,
        y: requirement.id === 'checkpoint' || requirement.id === 'search_zone' ? 30 + index * 4 : 0,
        z: index * 13,
        baseY: 0,
        heightOffset: requirement.id === 'checkpoint' || requirement.id === 'search_zone' ? 30 + index * 4 : 0,
        environment: template.preferredSurface === 'air' ? 'air' : template.preferredSurface,
        valid: true
      });
    })
  ));
}

const requiredTemplates = ['rally_route', 'plane_course', 'location_hunt', 'search_rescue'];
const allTemplates = listActivityTemplates();
for (const templateId of requiredTemplates) {
  assert.ok(allTemplates.some((template) => template.id === templateId), `${templateId} is missing from the creator catalog`);
  const anchors = anchorsFor(templateId);
  const validation = validateActivityDraft({ templateId, anchors });
  assert.equal(validation.valid, true, `${templateId} minimum contract is not playable: ${JSON.stringify(validation.issues)}`);
  assert.ok(orderedRouteAnchors(anchors).length >= 3, `${templateId} does not produce a playable sequence`);
}

assert.equal(defaultTemplateForTraversalMode('plane').id, 'plane_course');
assert.equal(discoveryCategoryForTemplate('plane_course', 'plane'), 'flight');
assert.equal(discoveryCategoryForTemplate('location_hunt', 'walk'), 'search');
assert.equal(discoveryCategoryForTemplate('search_rescue', 'drone'), 'search');

console.log(JSON.stringify({
  ok: true,
  templateCount: allTemplates.length,
  verifiedTemplates: requiredTemplates
}, null, 2));
