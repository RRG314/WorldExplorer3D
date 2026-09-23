import assert from 'node:assert/strict';
import test from 'node:test';
import { backendVerificationCommand } from '../scripts/verification/backend-environment.mjs';
import { backendGroups, backendSteps, backendStageTimeoutMs, backendGroupTimeoutMs } from '../scripts/verification/backend-steps.mjs';
import {readFileSync} from 'node:fs';
test('nested backend deadlines leave CI multiplayer time for both worlds and emulator cleanup',()=>{
 const group=backendGroups.find(group=>group.some(step=>step.id==='multiplayer'));
 assert.equal(backendStageTimeoutMs(group[0],{}),600_000);
 assert.equal(backendGroupTimeoutMs(group,{}),600_000);
 assert.equal(backendStageTimeoutMs(group[0],{CI:'true'}),900_000);
 assert.ok(backendGroupTimeoutMs(group,{CI:'true'})>=backendStageTimeoutMs(group[0],{CI:'true'})+60_000);
 const gate=JSON.parse(readFileSync(new URL('../config/system-release-gates.json',import.meta.url))).gates.backend;
 assert.ok(gate.timeoutMs>=backendGroupTimeoutMs(group,{CI:'true'})+600_000,'whole-suite deadline must also leave room for the other backend groups');
});
test('standalone backend verification creates the explicit staging emulator lifecycle',()=>{
 assert.deepEqual(backendVerificationCommand({}),[process.execPath,'scripts/verification/backend-isolated.mjs']);
});
test('isolated backend groups cover every assertion stage exactly once and preserve multiplayer stages',()=>{
 assert.deepEqual(backendGroups.flat(),backendSteps);
 assert.equal(new Set(backendGroups.flat().map(step=>step.id)).size,13);
 assert.deepEqual(backendGroups.slice(1).map(group=>group.map(step=>step.id)),
   [['shared-expedition'],['connected-property-multiplayer'],['room-chat-gameplay'],['multiplayer'],['account-backend']]);
});
test('an existing complete emulator lifecycle runs backend assertions without nesting emulators',()=>{
 assert.deepEqual(backendVerificationCommand({FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199'}),[process.execPath,'scripts/verification/backend-release.mjs']);
});
test('a partial emulator environment fails closed',()=>{
 assert.throws(()=>backendVerificationCommand({FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}),/partial environment/);
});
