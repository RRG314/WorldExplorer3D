// Declared real-time study windows. Needs and physics are never accelerated.
export const RUN_WINDOWS=Object.freeze({
 'pilot-15m':Object.freeze({id:'pilot-15m',label:'15-minute integration pilot',maxSeconds:900,maxWallMs:1200000,maxCalls:20,clockIntervalSeconds:1,maxEvents:1000}),
 'needs-8h':Object.freeze({id:'needs-8h',label:'8-hour needs observation',maxSeconds:28800,maxWallMs:36000000,maxCalls:600,clockIntervalSeconds:30,maxEvents:4096})
});
export function runWindow(id='pilot-15m'){
 if(!Object.hasOwn(RUN_WINDOWS,id))throw Error('Unknown research run window.');
 return RUN_WINDOWS[id];
}
