import test from 'node:test';
import assert from 'node:assert/strict';
import {contextWrites,checkContextOwnership} from '../scripts/verification/context-ownership.mjs';
test('ownership guard detects direct, injected, aliased and reflective property writes',()=>{
 assert.deepEqual(contextWrites("import {ctx as game} from './shared-context.js'; game.car.x=2; const vehicle=game.boat; vehicle.y++; Object.assign(game,{camera:{}}); Object.defineProperty(game,'paused',{}); function draw(ctx){ctx.scene={};}"),['boat','camera','car','paused','scene']);
 assert.deepEqual(contextWrites('const x=appCtx.car.x; const y=appCtx.scene;'),[]);
 assert.deepEqual(contextWrites('let car=ctx.car; car=null;'),[]);
 assert.deepEqual(contextWrites('let car=ctx.car; car=null; car.x=2;'),['car']);
});
test('current legacy writers remain inside the reviewed ownership boundary',async()=>{await checkContextOwnership();});


test('local canvas bindings do not hide imported or injected game context writes',()=>{
 assert.deepEqual(contextWrites("import {ctx} from './shared-context.js'; function texture(){const ctx=canvas.getContext('2d');ctx.strokeStyle='#fff';ctx.lineWidth=2;} ctx.car.x=2;"),['car']);
 assert.deepEqual(contextWrites("function texture(){const ctx=canvas.getContext('2d');ctx.lineWidth=2;} function drive(ctx){ctx.car.x=2;}"),['car']);
 assert.deepEqual(contextWrites("import {ctx} from './shared-context.js'; {const ctx=canvas.getContext('2d');ctx.lineWidth=2;} ctx.paused=true;"),['paused']);
 assert.deepEqual(contextWrites("function drive(ctx){if(true){var car=ctx.car;} car.x=2;}"),['car']);
});
