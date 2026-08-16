import assert from 'node:assert/strict';
import { resolveWorldCoverDetailMode } from '../app/js/terrain/worldcover-detail-mode.js';

assert.equal(
  resolveWorldCoverDetailMode({ mode: 'soil' }, { dominantClass: 'grass' }),
  'soil',
  'an accepted soil profile must not publish a grass tile solely because grass has the plurality'
);
assert.equal(resolveWorldCoverDetailMode({ mode: 'sand' }, { dominantClass: 'bare' }), 'sand');
assert.equal(resolveWorldCoverDetailMode({ mode: 'built' }, { dominantClass: 'built' }), 'grass');
assert.equal(resolveWorldCoverDetailMode({ mode: 'snowRock' }, { dominantClass: 'snow' }), 'rock');
assert.equal(resolveWorldCoverDetailMode(null, { dominantClass: 'crop' }), 'soil');
assert.equal(resolveWorldCoverDetailMode(null, { dominantClass: 'tree' }), 'forest');

console.log(JSON.stringify({
  ok: true,
  contract: 'worldcover-detail-mode',
  verified: ['semantic-profile-authority', 'mixed-tile-continuity', 'dominant-class-fallback']
}, null, 2));
