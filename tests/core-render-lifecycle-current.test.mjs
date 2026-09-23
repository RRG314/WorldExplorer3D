import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeKernel } from '../app/js/runtime/kernel.js';
import { createCoreFrameSystems, createCoreRenderSystem } from '../app/js/runtime/core-frame-systems.js';

for (const composer of [false, true]) test(`manual pause releases drawing while other pause owners retain their presentation (${composer})`, () => {
  let draws = 0, networkTicks = 0;
  const reasons = new Set();
  const app = { gameStarted: true, paused: false, hasPauseReason: reason => reasons.has(reason),
    renderer: { render: () => draws++ }, composer: { render: () => draws++ } };
  const kernel = createRuntimeKernel();
  kernel.registerSystem(createCoreRenderSystem(app, () => composer));
  kernel.registerSystem({ id: 'network', phase: 'presentation', update: () => networkTicks++ });
  kernel.runFrame(0);
  reasons.add('manual_pause'); app.paused = true;
  for (let frame = 1; frame < 100; frame++) kernel.runFrame(frame * 16);
  assert.equal(draws, 1); assert.equal(networkTicks, 100);
  reasons.delete('manual_pause'); reasons.add('activity');
  kernel.runFrame(1600); assert.equal(draws, 2, 'a different activity can still need the world renderer');
  reasons.clear(); app.paused = false;
  kernel.runFrame(1616); assert.equal(draws, 3, 'normal play resumes immediately');
  kernel.dispose();
});

for (const useComposer of [false, true]) {
  test(`city drawing stops at the menu and resumes on entry (${useComposer ? 'composer' : 'direct'})`, () => {
    const draws = [];
    let measurements = 0;
    const app = {
      gameStarted: false, scene: {}, camera: {},
      renderer: { render: (scene, camera) => {
        assert.equal(scene, app.scene);
        assert.equal(camera, app.camera);
        draws.push('direct');
      } },
      composer: { render: () => draws.push('composer') },
      recordPerfRendererInfo: () => measurements++
    };
    const kernel = createRuntimeKernel();
    kernel.registerSystem(createCoreRenderSystem(app, () => useComposer));
    kernel.runFrame(0);
    assert.equal(draws.length, 0);
    app.gameStarted = true;
    kernel.runFrame(16);
    app.gameStarted = false;
    for (let frame = 2; frame < 120; frame++) kernel.runFrame(frame * 16);
    assert.equal(draws.length, 1, 'the retained city must not draw behind the globe');
    assert.equal(measurements, 1);
    app.gameStarted = true;
    kernel.runFrame(120 * 16);
    assert.deepEqual(draws, Array(2).fill(useComposer ? 'composer' : 'direct'));
    assert.equal(measurements, 2);
    assert.equal(kernel.snapshot().phases.render[0].failures, 0);
    kernel.dispose();
  });
}

for(const composer of [false,true])test(`loading suppresses city work and drawing until publication (${composer})`,()=>{
 let updates=0,draws=0;
 const app={gameStarted:true,worldLoading:true,renderer:{render:()=>draws++},composer:{render:()=>draws++},update:()=>updates++,updateControlInput:()=>updates++,updateCamera:()=>updates++,drawMinimap:()=>updates++,refreshLiveWeather:()=>updates++};
 const kernel=createRuntimeKernel();
 for(const system of createCoreFrameSystems(app))kernel.registerSystem(system);
 kernel.registerSystem(createCoreRenderSystem(app,()=>composer));
 for(let i=0;i<200;i++)kernel.runFrame(i*16);
 assert.equal(updates,0);assert.equal(draws,0);
 app.worldLoading=false;kernel.runFrame(3200);
 assert.ok(updates>0);assert.equal(draws,1);
 kernel.dispose();
});


test('flight telemetry records full stalls while simulation catch-up stays bounded',()=>{
 const observed=[],steps=[];
 const app={recordPerfFrame:dt=>observed.push(dt)};
 const kernel=createRuntimeKernel();
 kernel.registerSystem(createCoreFrameSystems(app).find(s=>s.id==='core.frame-metrics'));
 kernel.registerSystem({id:'test.simulation',phase:'simulation',update:frame=>steps.push(frame.dt)});
 for(const timestamp of [0,16,2016,2032])kernel.runFrame(timestamp);
 assert.deepEqual(observed,[0,.016,2,.016]);
 assert.deepEqual(steps,[0,.016,.1,.016]);
 kernel.dispose();
});

for(const composer of [false,true])test(`first-frame preparation uses normal renderer before ready (${composer})`,()=>{
 const events=[];
 const app={gameStarted:true,worldLoading:true,scene:{},camera:{},updateCamera:()=>events.push('camera'),renderer:{render:()=>events.push('direct'),info:{programs:[{}]}},composer:{render:()=>events.push('composer')}};
 const system=createCoreRenderSystem(app,()=>composer);
 assert.throws(()=>app.prepareFirstWorldRender(),/not ready/);assert.deepEqual(events,[]);
 app.worldLoading=false;
 const first=app.prepareFirstWorldRender();
 assert.deepEqual(events,['camera',composer?'composer':'direct']);assert.equal(first.programs,1);assert.ok(first.durationMs>=0);
 system.update();assert.equal(events.length,3);
});

test('overview advances between LOD ticks without adding a timer or background loop',()=>{
 let advances=0;
 const app={gameStarted:true,car:{x:0,z:0},streetOverview:{step:()=>advances++},updateHUD(){},drawMinimap(){}};
 const kernel=createRuntimeKernel();
 kernel.registerSystem(createCoreFrameSystems(app).find(s=>s.id==='core.presentation'));
 for(let i=0;i<10;i++)kernel.runFrame(i*16);
 assert.equal(advances,10);
 app.worldLoading=true;kernel.runFrame(160);assert.equal(advances,10);
 app.worldLoading=false;app._streetPavementUpdating=true;kernel.runFrame(176);assert.equal(advances,10);
 app._streetPavementUpdating=false;app.gameStarted=false;kernel.runFrame(192);assert.equal(advances,10);
 kernel.dispose();
});

for (const composer of [false, true]) test(`title runtime imports suppress stale-world work until launch finishes (${composer})`, () => {
  let updates = 0, draws = 0, maps = 0;
  const app = { gameStarted: true, worldLoading: false, titleLaunchPending: true,
    renderer: { render: () => draws++ }, composer: { render: () => draws++ },
    update: () => updates++, updateControlInput: () => updates++, updateCamera: () => updates++,
    drawMinimap: () => maps++, updateHUD() {}, refreshLiveWeather: () => updates++ };
  const kernel = createRuntimeKernel();
  for (const system of createCoreFrameSystems(app)) kernel.registerSystem(system);
  kernel.registerSystem(createCoreRenderSystem(app, () => composer));
  for (let i = 0; i < 200; i++) kernel.runFrame(i * 16);
  assert.deepEqual({ updates, draws, maps }, { updates: 0, draws: 0, maps: 0 });
  // The world loader can explicitly prepare a completed frame while the title
  // still owns the loading cover; regular simulation must remain suspended.
  app.prepareFirstWorldRender();
  assert.equal(draws, 1);
  app.titleLaunchPending = false;
  for (let i = 200; i < 220; i++) kernel.runFrame(i * 16);
  assert.ok(updates > 1); assert.ok(maps > 0); assert.ok(draws > 1);
  kernel.dispose();
});
