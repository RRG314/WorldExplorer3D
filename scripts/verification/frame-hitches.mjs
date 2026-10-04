// Preserve every interval. Tolerance covers sub-millisecond RAF rounding only.
export function frameHitches(deltas, {maximumFrameMs=250,maximumOver100PerMinute=1,minimumHitchGapMs=10000}={}) {
  if(!Array.isArray(deltas)||!deltas.length||deltas.some(dt=>!Number.isFinite(dt)||dt<=0))throw TypeError('Expected positive raw frame intervals');
  let elapsedMs=0,over50=0,over100=0,over250=0,longFrameMs=0,priorHitch=null,minimumGapMs=null,worstFrameMs=0;
  const outliers=[];
  for(const dt of deltas){
    elapsedMs+=dt;worstFrameMs=Math.max(worstFrameMs,dt);
    if(dt>50.05){over50++;longFrameMs+=dt;}
    if(dt>250.05)over250++;
    if(dt>100.05){
      over100++;outliers.push({endedAtMs:elapsedMs,frameMs:dt});
      if(priorHitch!==null)minimumGapMs=Math.min(minimumGapMs??Infinity,elapsedMs-priorHitch);
      priorHitch=elapsedMs;
    }
  }
  const over100PerMinute=over100/(elapsedMs/60000);
  return {elapsedMs,over50,over100,over250,longFrameMs,worstFrameMs,over100PerMinute,minimumGapMs,outliers,
    passed:worstFrameMs<=maximumFrameMs+.05&&over100PerMinute<=maximumOver100PerMinute&&
      (minimumGapMs===null||minimumGapMs>=minimumHitchGapMs)};
}
