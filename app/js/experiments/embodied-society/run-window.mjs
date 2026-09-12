// Fixed-step study windows. Acceleration advances physics, needs and jobs together.
export const RUN_WINDOWS=Object.freeze({
 'fast-needs-6h':Object.freeze({id:'fast-needs-6h',label:'6 world-hours in a shorter session',maxSeconds:21600,maxWallMs:3000000,maxCalls:380,clockIntervalSeconds:30,maxEvents:4096,timeScale:12,minDecisionIntervalMs:5000,minSimulatedDecisionSeconds:60}),
 'pilot-15m':Object.freeze({id:'pilot-15m',label:'15-minute integration pilot',maxSeconds:900,maxWallMs:1200000,maxCalls:20,clockIntervalSeconds:1,maxEvents:1000,timeScale:1,minDecisionIntervalMs:60000,minSimulatedDecisionSeconds:1}),
 'needs-8h':Object.freeze({id:'needs-8h',label:'8-hour needs observation',maxSeconds:28800,maxWallMs:36000000,maxCalls:600,clockIntervalSeconds:30,maxEvents:4096,timeScale:1,minDecisionIntervalMs:60000,minSimulatedDecisionSeconds:1})
});
export function runWindow(id='pilot-15m'){
 if(!Object.hasOwn(RUN_WINDOWS,id))throw Error('Unknown research run window.');
 return RUN_WINDOWS[id];
}

export function simulatedDecisionReady(window,frames,lastDecisionFrame){
 return frames-lastDecisionFrame>=60*window.minSimulatedDecisionSeconds;
}
