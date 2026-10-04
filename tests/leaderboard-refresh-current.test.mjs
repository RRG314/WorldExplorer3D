import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlowerChallengeLeaderboardApi} from '../app/js/flower-challenge/leaderboard.js';

test('new board replaces old rows immediately and rejects delayed replies including same-board refreshes',async()=>{
 const previous=globalThis.WORLD_EXPLORER_FIREBASE;
 globalThis.WORLD_EXPLORER_FIREBASE={apiKey:'fixture',projectId:'fixture',appId:'fixture'};
 const waiting=[],renders=[];
 const element=()=>({textContent:'',style:{},dataset:{},classList:{toggle(){},remove(){}},setAttribute(){},removeAttribute(){}});
 const ui={titleBadge:element(),titleHint:element(),titleScope:element(),status:element(),titleRefreshBtn:element()};
 const challengeState={firebaseInitPromise:Promise.resolve(true),firebase:{db:{},firestoreMod:{collection:(_,name)=>name,query:name=>name,orderBy(){},limit(){},getDocs:()=>new Promise(resolve=>waiting.push(resolve))}}};
 const api=createFlowerChallengeLeaderboardApi({appCtx:{},challengeState,ui,constants:{FIREBASE_COLLECTION:'flower',FIREBASE_FISHING_COLLECTION:'fishing'},LEADERBOARD_LIMIT:10,
  normalizeChallengeType:type=>type,normalizeLeaderboardEntry:entry=>entry,readLocalLeaderboard:type=>[{id:`local-${type}`}],renderLeaderboard:rows=>renders.push(rows.map(row=>row.id))});
 try{
  const old=api.refreshFlowerLeaderboard('flower');await new Promise(setImmediate);
  const next=api.refreshFlowerLeaderboard('fishing');await new Promise(setImmediate);
  assert.deepEqual(renders.at(-1),['local-fishing']);assert.equal(ui.titleBadge.textContent,'Fishing');assert.match(ui.titleHint.textContent,/Player-reported/);
  waiting[1]({docs:[{id:'new',data:()=>({score:2})}]});await next;
  const newest=JSON.stringify({renders,hint:ui.titleHint.textContent,status:ui.status.textContent});
  waiting[0]({docs:[{id:'old',data:()=>({timeMs:10})}]});assert.equal(await old,null);
  assert.equal(JSON.stringify({renders,hint:ui.titleHint.textContent,status:ui.status.textContent}),newest);
  const same1=api.refreshFlowerLeaderboard('fishing');await new Promise(setImmediate);
  const same2=api.refreshFlowerLeaderboard('fishing');await new Promise(setImmediate);
  waiting[3]({docs:[]});await same2;const count=renders.length;
  waiting[2]({docs:[]});assert.equal(await same1,null);assert.equal(renders.length,count);
 }finally{globalThis.WORLD_EXPLORER_FIREBASE=previous;}
});
