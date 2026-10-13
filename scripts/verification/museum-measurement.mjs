import {sampleFrameWindow} from './frame-window.mjs';
import {frameHitches} from './frame-hitches.mjs';

// Read-only instrumentation. Timed windows use ordinary live RAF and actual
// keyboard input, never advanceTime or a replaced renderer/controller.
export async function beginMuseumEntryMeasurement(page) {
  return page.evaluateHandle(() => {
    performance.setResourceTimingBufferSize(10000);
    // Keep browser-native observer ownership in one handle; no global manager.
    const state={startedAt:performance.now(),receivedAt:null,playableAt:null,longTasks:[]};
    const entered=event=>{
      if(event.code!=='KeyE')return;
      state.receivedAt=performance.now();
      removeEventListener('keydown',entered,true);
      const observe=()=>{
        if(globalThis.museumCtx.activeInterior?.gallery)state.playableAt=performance.now();
        else if(performance.now()-state.receivedAt<20000)requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    };
    addEventListener('keydown',entered,true);
    state.observer=new PerformanceObserver(list=>{
      for(const entry of list.getEntries())state.longTasks.push({startTime:entry.startTime,duration:entry.duration});
    });
    state.observer.observe({type:'longtask'});
    return state;
  });
}

export async function sampleMuseumWindow(page, cdp, entry, {label,playableMs,readyMs,budgets,hitchBudgets}) {
  const input = await page.evaluateHandle(() => {
    const walker=globalThis.museumCtx.Walk.state.walker;
    globalThis.__museumMeasuredActor=walker;
    const state={before:walker.yaw,startedAt:null,changedAt:null};
    const received=event=>{
      if(event.code!=='ArrowLeft')return;
      state.startedAt=performance.now();
      removeEventListener('keydown',received,true);
      const observe=()=>{
        if(walker.yaw!==state.before)state.changedAt=performance.now();
        else if(performance.now()-state.startedAt<2000)requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    };
    addEventListener('keydown',received,true);
    return state;
  });
  let sample;
  await page.keyboard.down('ArrowLeft');
  try { sample=await page.evaluate(sampleFrameWindow,{durationMs:10000,actorKey:'__museumMeasuredActor',collectDiagnostics:false}); }
  finally { await page.keyboard.up('ArrowLeft'); }
  const entryStats=await entry.evaluate(state=>{
    state.observer.disconnect();
    const now=performance.now();
    return {elapsedMs:now-state.startedAt,longTasks:state.longTasks,
      modelTransfers:performance.getEntriesByType('resource').filter(r=>r.startTime>=state.startedAt&&/\/interiors\/(museum|personal-workspace)\//.test(r.name)).map(r=>({file:r.name.split('/').at(-1),transferBytes:r.transferSize,decodedBytes:r.decodedBodySize,durationMs:r.duration}))};
  });
  const inputStats=await input.evaluate(s=>({inputToSimulationMs:s.changedAt===null?null:s.changedAt-s.startedAt}));
  const originalYaw=await input.evaluate(s=>s.before);
  await input.dispose();await entry.dispose();
  const metrics=await cdp.send('Performance.getMetrics');
  const heapBytes=metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value||0;
  const ordered=[...sample.deltas].sort((a,b)=>a-b),p=q=>ordered[Math.min(ordered.length-1,Math.ceil(ordered.length*q)-1)]||0;
  // Full diagnostics traverse the outdoor scene. Read them after timing so
  // instrumentation cannot manufacture a first-input hitch.
  const renderer=await page.evaluate(()=>{delete globalThis.__museumMeasuredActor;return globalThis.getWorldExplorerRuntimeDiagnostics().renderer;});
  const hitches=frameHitches(sample.deltas,hitchBudgets);
  const result={label,playableMs,readyMs,...entryStats,...inputStats,heapBytes,renderer,
    averageFps:sample.deltas.length/(sample.elapsedMs/1000),p95FrameMs:p(.95),p99FrameMs:p(.99),hitches,rawFrameMs:sample.deltas};
  result.checks={
    playableWithinExistingModeBudget:playableMs<=budgets.maximumModeActivationMs,
    averageFps:result.averageFps>=budgets.minimumAverageFps,
    p95Frame:result.p95FrameMs<=budgets.maximumP95FrameMs,
    p99Frame:result.p99FrameMs<=budgets.maximumP99FrameMs,
    frameHitches:hitches.passed,
    heap:heapBytes<=budgets.maximumJsHeapUsedBytes,
    drawCalls:renderer.calls<=budgets.maximumDrawCalls,
    triangles:renderer.triangles<=budgets.maximumTriangles,
    programs:renderer.programs<=budgets.maximumPrograms,
    geometries:renderer.geometries<=budgets.maximumGeometries,
    textures:renderer.textures<=budgets.maximumTextures,
    keyboardChangesLiveSimulation:Number.isFinite(result.inputToSimulationMs)
  };
  // Leave the subsequent walking route facing the entry hall. Use real input
  // after the timed window; do not assign camera or actor transforms.
  for(let i=0;i<60;i++){
    const yaw=await page.evaluate(()=>globalThis.museumCtx.Walk.state.walker.yaw);
    const delta=Math.atan2(Math.sin(originalYaw-yaw),Math.cos(originalYaw-yaw));
    if(Math.abs(delta)<.055)break;
    const key=delta>0?'ArrowLeft':'ArrowRight';
    await page.keyboard.down(key);
    try{await page.waitForTimeout(Math.max(16,Math.min(100,Math.abs(delta)/2.6*800)));}
    finally{await page.keyboard.up(key);}
  }
  return result;
}
