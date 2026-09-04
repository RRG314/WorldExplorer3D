import assert from 'node:assert/strict';

const projectId = String(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'we3d-staging-20260712');
const authOrigin = `http://${String(process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099')}`;
const functionsOrigin = `http://${String(process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001')}/${projectId}/us-central1`;
const email = `account-release-${Date.now()}@example.test`;

const signupResponse = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-key`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password: 'WorldExplorer3D-Test-Only-93!', returnSecureToken: true })
});
const signup = await signupResponse.json();
assert.equal(signupResponse.ok, true, JSON.stringify(signup));
const user = { uid: signup.localId, token: signup.idToken };

async function post(path, body = {}, auth = user) {
  const response = await fetch(`${functionsOrigin}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(auth?.token ? { authorization: `Bearer ${auth.token}` } : {})
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

const unauthenticated = await post('/getAccountOverview', {}, null);
assert.equal(unauthenticated.status, 401, JSON.stringify(unauthenticated.body));

const initial = await post('/getAccountOverview');
assert.equal(initial.status, 200, JSON.stringify(initial.body));
assert.equal(initial.body.overview.uid, user.uid);
assert.equal(initial.body.overview.plan, 'free');

const updated = await post('/updateAccountProfile', {
  displayName: 'Release Explorer',
  bio: 'Exploring Earth and beyond.',
  avatar: '🧭'
});
assert.equal(updated.status, 200, JSON.stringify(updated.body));
assert.equal(updated.body.displayName, 'Release Explorer');
assert.equal(updated.body.creatorProfile.bio, 'Exploring Earth and beyond.');

const activated = await post('/startTrial');
assert.equal(activated.status, 200, JSON.stringify(activated.body));
assert.equal(activated.body.status, 'activated');
assert.equal(activated.body.plan, 'trial');
assert.ok(Number(activated.body.trialEndsAtMs) > Date.now());

const repeatedTrial = await post('/startTrial');
assert.equal(repeatedTrial.status, 200, JSON.stringify(repeatedTrial.body));
assert.equal(repeatedTrial.body.status, 'already-active');

const receipts = await post('/listBillingReceipts');
assert.equal(receipts.status, 200, JSON.stringify(receipts.body));
assert.deepEqual(receipts.body.receipts, []);

const refreshed = await post('/getAccountOverview');
assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body));
assert.equal(refreshed.body.overview.displayName, 'Release Explorer');
assert.equal(refreshed.body.overview.plan, 'trial');
assert.equal(refreshed.body.overview.subscriptionStatus, 'none');

const rejectedDelete = await post('/deleteAccount', { confirmation: 'delete' });
assert.equal(rejectedDelete.status, 400, JSON.stringify(rejectedDelete.body));

const deleted = await post('/deleteAccount', { confirmation: 'DELETE' });
assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
assert.equal(deleted.body.deleted, true);

const lookupDeleted = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=emulator-key`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ idToken: user.token })
});
assert.equal(lookupDeleted.ok, false, 'Deleted authentication identity remained usable.');

console.log(JSON.stringify({
  ok: true,
  checks: {
    authenticationRequired: true,
    overviewLoaded: true,
    profilePersisted: true,
    trialActivatedOnce: true,
    emptyBillingHistoryHandled: true,
    refreshedOverviewMatches: true,
    deletionRequiresExactConfirmation: true,
    accountAndIdentityDeleted: true
  }
}, null, 2));
