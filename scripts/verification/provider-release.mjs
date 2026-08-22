import assert from 'node:assert/strict';
import {
  OVERTURE_RELEASE_POLICY,
  overtureThemeArchiveUrl
} from '../../app/js/world/overture-tile-source.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINIMUM_RELEASE_LIFE_REMAINING_DAYS = 14;
const releaseDate = Date.parse(`${OVERTURE_RELEASE_POLICY.release.slice(0, 10)}T00:00:00Z`);
const expiresAt = releaseDate + Number(OVERTURE_RELEASE_POLICY.publicRetentionDays) * DAY_MS;
const remainingDays = Math.floor((expiresAt - Date.now()) / DAY_MS);
const archiveUrl = overtureThemeArchiveUrl('buildings');

assert.equal(OVERTURE_RELEASE_POLICY.authority, 'build-pinned-reviewed-overture-release');
assert.ok(Number.isFinite(releaseDate), 'Pinned Overture release date is invalid.');
assert.ok(
  remainingDays >= MINIMUM_RELEASE_LIFE_REMAINING_DAYS,
  `Pinned Overture release ${OVERTURE_RELEASE_POLICY.release} has only ${remainingDays} public-retention days remaining. ` +
  'Review and pin a current release before creating a candidate.'
);

const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 15000);
let response;
try {
  response = await fetch(archiveUrl, {
    headers: { Range: 'bytes=0-0' },
    signal: controller.signal
  });
} finally {
  clearTimeout(timeoutId);
}

try {
  assert.equal(
    response.status,
    206,
    `Pinned Overture building archive is not byte-range reachable: HTTP ${response.status}`
  );
  assert.match(
    String(response.headers.get('content-range') || ''),
    /^bytes 0-0\/\d+$/,
    'Pinned Overture archive did not return a valid content range.'
  );
} finally {
  await response.body?.cancel().catch(() => {});
}

console.log(JSON.stringify({
  ok: true,
  authority: OVERTURE_RELEASE_POLICY.authority,
  release: OVERTURE_RELEASE_POLICY.release,
  reviewedOn: OVERTURE_RELEASE_POLICY.reviewedOn,
  archiveUrl,
  remainingPublicRetentionDays: remainingDays,
  minimumRequiredDays: MINIMUM_RELEASE_LIFE_REMAINING_DAYS,
  httpStatus: response.status
}, null, 2));
