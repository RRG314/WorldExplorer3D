const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildCommunityRealityCaptureExports}=require('../functions/community-reality-capture.js');
test('related captures are queried with owner and provider building with compatible-world filtering',async()=>{
  const filters=[];
  const query={orderBy:()=>query,where:(...args)=>{filters.push(args);return query;},limit:n=>{assert.equal(n,61);return query;},get:async()=>({docs:[]})};
  const api=buildCommunityRealityCaptureExports({db:{collection:name=>{assert.equal(name,'realityCaptures');return query;}},bucket:{},setCors:()=>false,verifyAuth:async()=>({uid:'owner'}),verifyAppCheck:async()=>true});
  const response={status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
  await api.listMyRealityCaptures({method:'POST',body:{building:{worldId:'earth',sourceBuildingId:'overture:building'}},headers:{}},response);
  assert.equal(response.code,200);
  assert.deepEqual(filters,[['ownerUid','==','owner'],['building.sourceBuildingId','==','overture:building']]);
  assert.deepEqual(response.body,{captures:[],truncated:false,nextCursor:null,buildingScoped:true});
});
