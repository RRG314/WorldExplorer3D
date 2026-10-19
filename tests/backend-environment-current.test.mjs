import assert from 'node:assert/strict';
import test from 'node:test';
import { backendVerificationCommand, browserEmulatorSettings } from '../scripts/verification/backend-environment.mjs';
import { selectBackendGroups, backendGroups, backendSteps, backendStageTimeoutMs, backendGroupTimeoutMs } from '../scripts/verification/backend-steps.mjs';
import {readFileSync} from 'node:fs';
test('browser clients follow the selected emulator ports without mutating the environment', () => {
 const environment=Object.freeze({FIREBASE_AUTH_EMULATOR_HOST:'localhost:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8084',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9198'});
 assert.deepEqual(browserEmulatorSettings(environment),{enabled:true,host:'127.0.0.1',authPort:9099,firestorePort:8084,storagePort:9198});
 assert.deepEqual(browserEmulatorSettings({FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'localhost:8080'}),{enabled:true,host:'127.0.0.1',authPort:9099,firestorePort:8080});
});
test('browser emulator configuration rejects missing, remote and malformed endpoints', () => {
 const base={FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8084'};
 for(const key of ['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST'])for(const value of ['', 'example.com:8080','127.0.0.1:0','127.0.0.1:65536','127.0.0.1:8080/path','http://localhost:8080'])assert.throws(()=>browserEmulatorSettings({...base,[key]:value}),/selected local emulator endpoint/);
 assert.throws(()=>browserEmulatorSettings({...base,FIREBASE_STORAGE_EMULATOR_HOST:'example.com:9199'}),/selected local emulator endpoint/);
});
test('nested backend deadlines leave CI multiplayer time for both worlds and emulator cleanup',()=>{
 const group=backendGroups.find(group=>group.some(step=>step.id==='multiplayer'));
 assert.equal(backendStageTimeoutMs(group[0],{}),600_000);
 assert.equal(backendGroupTimeoutMs(group,{}),600_000);
 assert.equal(backendStageTimeoutMs(group[0],{CI:'true'}),1_800_000);
 assert.ok(backendGroupTimeoutMs(group,{CI:'true'})>=backendStageTimeoutMs(group[0],{CI:'true'})+60_000);
 const gate=JSON.parse(readFileSync(new URL('../config/system-release-gates.json',import.meta.url))).gates.backend;
 assert.ok(gate.timeoutMs>=backendGroupTimeoutMs(group,{CI:'true'})+600_000,'whole-suite deadline must also leave room for the other backend groups');
});
test('standalone backend verification creates the explicit staging emulator lifecycle',()=>{
 assert.deepEqual(backendVerificationCommand({}),[process.execPath,'scripts/verification/backend-isolated.mjs']);
});
test('isolated backend groups cover every assertion stage exactly once and preserve multiplayer stages',()=>{
 assert.deepEqual(backendGroups.flat(),backendSteps);
 assert.ok(backendGroups[0].some(step=>step.id==='environment-data'),'public environmental HTTP/cache/rules checks run in the backend release');
 assert.ok(backendGroups[0].some(step=>step.id==='commerce-backend'));
 assert.equal(new Set(backendGroups.flat().map(step=>step.id)).size,15);
 assert.deepEqual(backendGroups.slice(1).map(group=>group.map(step=>step.id)),
   [['shared-expedition'],['connected-property-multiplayer'],['room-chat-gameplay'],['multiplayer'],['account-backend']]);
});
test('an existing complete emulator lifecycle runs backend assertions without nesting emulators',()=>{
 assert.deepEqual(backendVerificationCommand({FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199'}),[process.execPath,'scripts/verification/backend-release.mjs']);
});
test('a partial emulator environment fails closed',()=>{
 assert.throws(()=>backendVerificationCommand({FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}),/partial environment/);
});

test('backend diagnostics preserve default coverage and label every explicit subset incomplete', () => {
  assert.equal(selectBackendGroups().completeGate, true);
  assert.deepEqual(selectBackendGroups().groups, backendGroups);
  const subset = selectBackendGroups('room-chat-gameplay,multiplayer');
  assert.equal(subset.completeGate, false);
  assert.deepEqual(subset.groups.map(group => group.map(step => step.id)), [['room-chat-gameplay'], ['multiplayer']]);
  assert.equal(selectBackendGroups(backendSteps.map(step => step.id).join(',')).completeGate, false);
});
test('invalid diagnostic selections fail before starting any emulator', () => {
  for (const value of ['', 'unknown', 'multiplayer,multiplayer', 'multiplayer,', 'multiplayer; echo unsafe']) {
    assert.throws(() => selectBackendGroups(value), /Invalid backend diagnostic/);
  }
});
