import test from 'node:test';
import assert from 'node:assert/strict';
import {completeBuildingPublicationGroups} from '../app/js/world/building-publication-groups.js';
const part=(id,parent,height)=>({id,tags:{_overtureParentBuildingId:parent,height}});
test('a selected tall upper part brings its mapped lower part within budget',()=>{
 const lower=part('lower','tower',20), upper=part('upper','tower',100), house={id:'house'};
 const result=completeBuildingPublicationGroups([lower,upper,house],[upper,house],2);
 assert.deepEqual(result.ways,[lower,upper]);
 assert.equal(result.restoredParts,1);
});
test('capacity cannot publish a partial group; independent buildings remain eligible',()=>{
 const lower=part('lower','tower',20), upper=part('upper','tower',100), house={id:'house'};
 const result=completeBuildingPublicationGroups([lower,upper,house],[upper,house],1);
 assert.deepEqual(result.ways,[house]);
 assert.equal(result.deferredGroups,1);
});
test('complete selection stays unique and never guesses membership for unlinked features',()=>{
 const a={id:'a'}, b={id:'b'};
 assert.deepEqual(completeBuildingPublicationGroups([a,b],[a,b,a],10).ways,[a,b]);
});
