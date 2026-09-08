import test from 'node:test';
import assert from 'node:assert/strict';
import { captureDraftKey, capturePhoneUrl, mergedCapturePhotos, captureIsEditable } from '../app/js/reality-capture/capture-session.js';
test('local private drafts are account-scoped and server capture-scoped', () => {
  const target = { worldId: 'earth', sourceBuildingId: 'osm:way:1' };
  assert.notEqual(captureDraftKey('alice', target, 'exterior'), captureDraftKey('bob', target, 'exterior'));
  assert.notEqual(captureDraftKey('alice', target, 'interior_room', 'room1'), captureDraftKey('alice', target, 'interior_room', 'room2'));
  assert.throws(() => captureDraftKey('', target, 'exterior'));
});
test('phone links identify only the capture and reject localhost, insecure and malformed targets', () => {
  const url = capturePhoneUrl('capture-123', 'https://world.example/app/?candidate=old');
  assert.equal(url, 'https://world.example/app/capture.html#capture=capture-123');
  for (const base of ['http://localhost:4195/app/', 'https://localhost/app/', 'http://192.168.1.1/app/']) assert.throws(() => capturePhoneUrl('capture-123', base));
  assert.throws(() => capturePhoneUrl('../secret', 'https://world.example/app/'));
});
test('uploaded and local photo IDs merge without duplicate counts; submitted captures are read-only', () => {
  assert.deepEqual(mergedCapturePhotos([{ id: 'a', sector: 1 }], [{ id: 'a', sector: 1 }, { id: 'b', sector: 2 }]), [{ id: 'a', sector: 1 }, { id: 'b', sector: 2 }]);
  assert.equal(captureIsEditable({ status: 'draft' }), true);
  for (const status of ['queued', 'approved', 'processing', 'processing_failed']) assert.equal(captureIsEditable({ status }), false);
});
