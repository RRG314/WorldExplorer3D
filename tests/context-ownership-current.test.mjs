import test from 'node:test';
import assert from 'node:assert/strict';
import {contextWrites,checkContextOwnership} from '../scripts/verification/context-ownership.mjs';
test('ownership guard detects direct, injected, aliased and reflective property writes',()=>{
 assert.deepEqual(contextWrites("import {ctx as game} from './shared-context.js'; game.car.x=2; const vehicle=game.boat; vehicle.y++; Object.assign(game,{camera:{}}); Object.defineProperty(game,'paused',{}); function draw(ctx){ctx.scene={};}"),['boat','camera','car','paused','scene']);
 assert.deepEqual(contextWrites('const x=appCtx.car.x; const y=appCtx.scene;'),[]);
});
test('current legacy writers remain inside the reviewed ownership boundary',async()=>{await checkContextOwnership();});
