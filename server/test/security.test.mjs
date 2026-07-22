import assert from 'node:assert/strict';
import test from 'node:test';
import { identityFromFirebaseToken, testIdentityFromToken } from '../src/auth/identity.js';

test('room identities never expose authentication email addresses', () => {
  const unnamed = identityFromFirebaseToken({
    uid: 'firebase-user-1',
    email: 'private@example.com',
    firebase: { sign_in_provider: 'password' }
  });
  assert.equal(unnamed.displayName, 'Explorer');
  assert.equal(JSON.stringify(unnamed).includes('private@example.com'), false);

  const named = identityFromFirebaseToken({
    uid: 'firebase-user-2',
    name: '  Public   Explorer  ',
    email: 'also-private@example.com'
  });
  assert.equal(named.displayName, 'Public Explorer');
});

test('local test identities remain bounded and explicit', () => {
  const identity = testIdentityFromToken('test:local-player:Local Player');
  assert.deepEqual(identity, {
    uid: 'local-player',
    displayName: 'Local Player',
    provider: 'local-test'
  });
  assert.throws(() => testIdentityFromToken('test:x'), /Invalid local test identity/);
});
