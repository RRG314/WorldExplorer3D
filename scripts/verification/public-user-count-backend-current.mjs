import assert from 'node:assert/strict';

const projectId = String(process.env.GCLOUD_PROJECT || process.env.GCLOUD_PROJECT_ID || 'we3d-staging-20260712');
const authHost = String(process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099');
const functionsHost = String(process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001');
const authUrl = `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-test`;

async function createAuthUser(body) {
  const response = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, returnSecureToken: false })
  });
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload.localId;
}

await createAuthUser({ email: `count-one-${Date.now()}@example.test`, password: 'sample-password-1' });
await createAuthUser({ email: `count-two-${Date.now()}@example.test`, password: 'sample-password-2' });
await createAuthUser({});

const endpoint = `http://${functionsHost}/${projectId}/us-central1/getPublicSiteStats`;
const response = await fetch(endpoint, {
  headers: {
    Accept: 'application/json',
    Origin: 'http://127.0.0.1:4192'
  }
});
const payload = await response.json();
assert.equal(response.status, 200, JSON.stringify(payload));
assert.deepEqual(Object.keys(payload), ['totalUsers']);
assert.equal(payload.totalUsers, 2, 'Anonymous guest sessions must not be presented as registered explorers.');
assert.match(String(response.headers.get('cache-control') || ''), /s-maxage=300/);
assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:4192');

const methodResponse = await fetch(endpoint, {
  method: 'POST',
  headers: { Origin: 'http://127.0.0.1:4192' }
});
assert.equal(methodResponse.status, 405);

console.log(JSON.stringify({
  ok: true,
  registeredUsers: payload.totalUsers,
  anonymousUsersExcluded: 1,
  responseFields: Object.keys(payload).sort(),
  cacheControl: response.headers.get('cache-control')
}, null, 2));
