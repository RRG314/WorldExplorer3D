import assert from 'node:assert/strict';
import { createAccountService } from '../app/js/platform/account-service.js';

let observer = null;
let unsubscribed = 0;
const seen = [];
const service = createAccountService({
  getCurrentUser: () => null,
  observeAuth(callback) {
    observer = callback;
    return () => unsubscribed++;
  }
});

service.subscribe((user) => seen.push(user?.uid || 'guest'));
service.start();
service.start();
observer({ uid: 'user-1', isAnonymous: false, providerData: [{ providerId: 'password' }] });
assert.equal(service.getUser().uid, 'user-1');
assert.deepEqual(service.snapshot(), {
  started: true,
  signedIn: true,
  anonymous: false,
  providerCount: 1,
  revision: 1
});
assert.deepEqual(seen, ['guest', 'user-1']);
service.dispose();
assert.equal(unsubscribed, 1);
assert.equal(service.snapshot().started, false);

console.log(JSON.stringify({ ok: true, seen, unsubscribed }, null, 2));
