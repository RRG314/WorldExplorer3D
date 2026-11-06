import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEntryIntent} from '../app/js/ui/entry-intent.js';
function fixture(entry='character',blocked=false){
 const events=[];
 const intent=createEntryIntent({href:`https://worldexplorer3d.io/app/?entry=${entry}&distribution=google-play#place`,blocked,replaceHref:href=>events.push(['url',href]),openCharacter:()=>events.push(['character']),openCareers:()=>events.push(['careers'])});
 return {intent,events};
}
test('an explicit character path cannot cover an unresolved account/save choice',()=>{
 const {intent,events}=fixture();intent.globeOpened();intent.accountState({blocking:true});assert.deepEqual(events,[]);
 intent.accountState({blocking:false});intent.accountState({blocking:false});assert.deepEqual(events.map(e=>e[0]),['url','character']);
});
test('account readiness before the globe waits for the original initial screen',()=>{
 const {intent,events}=fixture('careers');intent.accountState({blocking:false});assert.equal(events.length,0);intent.globeOpened();
 assert.equal(events[1][0],'careers');const url=new URL(events[0][1]);assert.equal(url.pathname,'/app/');assert.equal(url.searchParams.has('entry'),false);assert.equal(url.searchParams.get('distribution'),'google-play');assert.equal(url.hash,'#place');
});
test('shared or Portal review and unknown entry values never open another flow',()=>{
 for(const [entry,blocked] of [['character',true],['careers',true],['unknown',false]]){const {intent,events}=fixture(entry,blocked);intent.globeOpened();intent.accountState({blocking:false});assert.deepEqual(events,[]);}
});
test('missing account state does not imply permission to open setup',()=>{
 const {intent,events}=fixture();intent.globeOpened();intent.accountState();intent.accountState({});assert.deepEqual(events,[]);
});
