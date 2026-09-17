import test from 'node:test';
import assert from 'node:assert/strict';
import { completeReleaseEnvironment } from '../scripts/verification/release-environment.mjs';

test('a developer diagnostic session cannot narrow release coverage', () => {
  const diagnosticSession = {
    WE3D_VERIFY_LOCATIONS: 'london', WE3D_ACTOR_VEHICLE_LOCATIONS: 'london',
    WE3D_BACKEND_FROM: 'account-backend', WE3D_HOTBAR_RESUME_STAGE: '4',
    WE3D_HOTBAR_ONLY_ACTION: 'mobile', WE3D_VERIFY_PROFILE: 'mobile',
    WE3D_VERIFY_AUDIT_ONLY: '1', WE3D_VERIFY_INITIAL_ONLY: '1',
    WE3D_VERIFY_SLICE_ONLY: '1', WE3D_FORCE_TRANSPORT_FALLBACK: '1'
  };
  assert.deepEqual(completeReleaseEnvironment(diagnosticSession), {});
  assert.equal(diagnosticSession.WE3D_VERIFY_PROFILE, 'mobile');
});

test('release isolation preserves emulator routing and artifact/resource configuration', () => {
  const required = {
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
    GCLOUD_PROJECT: 'demo-release', WE3D_VERIFY_ROOT: 'dist',
    WE3D_CAPTURE_RELEASE_EVIDENCE: '1', JAVA_TOOL_OPTIONS: '-Xmx512m',
    PATH: '/local/bin'
  };
  assert.deepEqual(completeReleaseEnvironment(required), required);
});
