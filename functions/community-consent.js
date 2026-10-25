'use strict';
const COMMUNITY_TERMS_VERSION = 'community-2026-10-24';
async function requireCommunityConsent(db, uid) {
  const record = await db.collection('users').doc(uid).collection('consents').doc('community').get();
  if (!record.exists || record.data()?.version !== COMMUNITY_TERMS_VERSION) {
    throw Object.assign(new Error('Agree to the community rules in the app before sharing content.'), {status:403});
  }
}
module.exports = {COMMUNITY_TERMS_VERSION, requireCommunityConsent};
