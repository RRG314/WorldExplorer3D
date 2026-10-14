import assert from 'node:assert/strict';

// This belongs to the separate retention phase, after every live timing window.
// Natural used heap includes unreachable objects awaiting the browser's next
// collection. Preserve that reading; never substitute the collected value in
// a frame sample or describe it as the browser's peak process/GPU memory.
export async function measureRetainedHeap(cdp,{timingComplete,label}={}) {
  assert.equal(timingComplete,true,'Finish all timing windows before collecting retained heap');
  assert.ok(typeof label==='string'&&label.length>0,'Identify the occupied scene');
  const read=async()=>{
    const {metrics}=await cdp.send('Performance.getMetrics');
    const bytes=metrics?.find(metric=>metric.name==='JSHeapUsedSize')?.value;
    assert.ok(Number.isFinite(bytes)&&bytes>0,'A missing heap metric cannot count as zero memory');
    return bytes;
  };
  const naturalBytes=await read();
  await cdp.send('HeapProfiler.collectGarbage');
  const retainedBytes=await read();
  return {label,naturalBytes,retainedBytes,
    scope:'Post-timing retained JavaScript heap in the occupied scene; raw samples and frame timing remain separate'};
}
