import {writeFileSync,mkdirSync} from 'node:fs';
import {createPortalTrailEntry,queuePortalAction,acceptPortalSync,portalTrailView,emptyPortalTrailState} from '../app/js/portal/trail-model.js';
const id='baltimore-harbor',owner='account:native-fixture';
const action=(operationId,kind,createdAt)=>({operationId,kind,destinationId:id,createdAt,...(kind==='investigate'?{contentVersion:'learning-v1'}:{})});
const commands=[action('save-one','save',1000),action('unsave-newer','unsave',2000),action('learn-one','investigate',3000)];
const remote={...emptyPortalTrailState(id),revision:3,firstOfferedAt:500,lastOfferedAt:900,saved:true,savedAt:900,visitedAt:800,expeditionIds:['confirmed-game-expedition']};
const scenarios=[];let entry=createPortalTrailEntry(owner,id);
for(const command of commands){const before=entry;entry=queuePortalAction(entry,command);scenarios.push({kind:'queue',before,command,expected:entry,view:portalTrailView(entry)});}
for(const [revision,operationId] of [[3,'save-one'],[2,'unsave-newer'],[4,'learn-one']]){
 const before=entry,response={ownerScope:owner,operationId,state:{...remote,revision}};
 entry=acceptPortalSync(entry,response,owner);scenarios.push({kind:'accept',before,response,expected:entry,view:portalTrailView(entry)});
}
const guest=createPortalTrailEntry('device-guest',id),command=action('guest-save','save',4000),next=queuePortalAction(guest,command);
scenarios.push({kind:'queue',before:guest,command,expected:next,view:portalTrailView(next)});
const directory=new URL('../android/app/src/debug/assets/',import.meta.url);mkdirSync(directory,{recursive:true});
writeFileSync(new URL('portal-trail-contracts.json',directory),JSON.stringify({scope:'Generated from the browser/server wire model. Debug-only native conformance fixture.',scenarios},null,2)+'\n');
