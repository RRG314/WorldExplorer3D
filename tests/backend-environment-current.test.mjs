import assert from 'node:assert/strict';
import test from 'node:test';
import { backendVerificationCommand } from '../scripts/verification/backend-environment.mjs';
test('standalone backend verification creates the explicit staging emulator lifecycle',()=>{
 const c=backendVerificationCommand({});assert.equal(c[0],'firebase');assert.ok(c.includes('we3d-staging-20260712'));
});
test('an existing complete emulator lifecycle runs backend assertions without nesting emulators',()=>{
 assert.deepEqual(backendVerificationCommand({FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199'}),[process.execPath,'scripts/verification/backend-release.mjs']);
});
test('a partial emulator environment fails closed',()=>{
 assert.throws(()=>backendVerificationCommand({FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}),/partial environment/);
});
