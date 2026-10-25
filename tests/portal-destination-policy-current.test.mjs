import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldLoadRequest} from '../app/js/earth-core/world-load-request.js';
import {createWorldSnapshot, WORLD_SNAPSHOT_LAYERS} from '../app/js/earth-core/world-snapshot.js';
import {isEarthWorldUsable} from '../app/js/earth-core/world-readiness.js';
import {
  PORTAL_QUALITY_CHECKS, evaluatePortalOffer, evaluatePortalWorldReadiness,
  portalDestinationRequirements
} from '../app/js/earth-core/portal-destination-policy.js';

// Synthetic qualification records exercise the gate, not an approval of any
// real place, device or currently shipped destination catalog.
function fixture(kind = 'city') {
  const destination = {
    type:'PortalDestination', schemaVersion:1, id:'fixture:harbor', revision:'v1',
    contentVersion:'fixture-content:1', environment:'EARTH', kind,
    origin:{lat:39.29,lon:-76.61}, bounds:{south:39.28,north:39.30,west:-76.62,east:-76.60},
    arrival:{lat:39.291,lon:-76.611,mode:'walk'}, experienceIds:['fixture:survey','fixture:lookout']
  };
  const assessment = {
    type:'PortalQualification', schemaVersion:1, status:'approved',
    destinationId:destination.id, destinationRevision:destination.revision, kind,
    contentVersion:destination.contentVersion, renderContractVersion:'earth-render:1',
    origin:{...destination.origin}, bounds:{...destination.bounds}, arrival:{...destination.arrival},
    deviceProfile:'fixture-phone', testedBuildId:'5.6.1+fixture.production',
    checkedAt:1000,validUntil:3000,evidenceId:'fixture:qa',
    checks:Object.fromEntries(PORTAL_QUALITY_CHECKS.map(check=>[check,'passed'])),
    layers:Object.fromEntries(WORLD_SNAPSHOT_LAYERS.map(layer=>[layer,'verified'])),
    experienceIds:[...destination.experienceIds]
  };
  const context = {now:2000,deviceProfile:assessment.deviceProfile,
    renderContractVersion:assessment.renderContractVersion,contentVersion:destination.contentVersion};
  return {destination,assessment,context};
}
const offer = ({destination,assessment,context}) => evaluatePortalOffer(destination,assessment,context);
function published(f, {sequence=1, location=f.destination.origin, absent=[]}={}) {
  const request=createWorldLoadRequest({...location,key:'custom',name:'Fixture harbor'},sequence);
  const layers=Object.fromEntries(WORLD_SNAPSHOT_LAYERS.filter(layer=>!absent.includes(layer)).map(layer=>[
    layer,{authority:`fixture-${layer}`,completeness:'partial',records:[{id:`fixture:${layer}`}]}]));
  const publication=createWorldSnapshot({request,layers});
  const ctx={getEnv:()=> 'EARTH',initialEarthWorldReady:true,worldLoading:false,
    _worldLoadSequence:sequence,worldPublication:publication,worldLoadRuntimeState:{sequence,publication,
      status:'ready',geometryReady:true,gameplayRuntimesReady:true,session:{state:'published',requestId:request.id}}};
  const result={state:'published',requestId:request.id,sequence};
  return {ctx,result};
}
const world = (f,p) => evaluatePortalWorldReadiness(p.ctx,p.result,f.destination,f.assessment,f.context);

test('Portal requires scoped approved evidence and never approves a coordinate alone',()=>{
  const f=fixture(),before=JSON.stringify(f);
  assert.equal(offer(f).eligible,true);
  assert.equal(JSON.stringify(f),before);
  for(const assessment of [null,{status:'approved'}, {...f.assessment,status:'pending'},
    {...f.assessment,evidenceId:''},{...f.assessment,testedBuildId:''}]) {
    assert.equal(offer({...f,assessment}).eligible,false);
  }
  assert.ok(Object.isFrozen(offer(f)));
  assert.ok(Object.isFrozen(offer(f).requiredLayers));
  assert.ok(Object.isFrozen(offer(f).reasons));
});

test('Portal rejects invalid geometry, unsupported bodies and unrestricted arrival modes',()=>{
  for(const patch of [{environment:'MARS'},{origin:{lat:91,lon:0}},{origin:{lat:null,lon:0}},
    {origin:{lat:'39.29',lon:-76.61}},{arrival:{lat:39.29,lon:-76.61,mode:'plane'}},
    {bounds:{south:39,north:38,west:-77,east:-76}}, {bounds:{south:0,north:90,west:180,east:-180}},
    {experienceIds:[]},{kind:'unknown'},{origin:{lat:39.29,lon:181}}]) {
    const f=fixture();Object.assign(f.destination,patch);
    assert.deepEqual(offer(f).reasons,['invalid-destination']);
  }
});

test('Portal evidence cannot authorize a different origin, extent, arrival, identity or revision',()=>{
  for(const patch of [{origin:{lat:39.295,lon:-76.61}},{bounds:{south:39.28,north:39.31,west:-76.62,east:-76.60}},
    {arrival:{lat:39.292,lon:-76.611,mode:'walk'}},{arrival:{lat:39.291,lon:-76.611,mode:'drive'}},
    {destinationId:'other:harbor'},{destinationRevision:'v2'},{kind:'nature'}]) {
    const f=fixture();Object.assign(f.assessment,patch);
    assert.ok(offer(f).reasons.includes('qualification-scope-mismatch'));
  }
});

test('Portal qualification expires, rejects future checks and requires explicit version context',()=>{
  assert.equal(offer({...fixture(),context:null}).eligible,false);
  for(const patch of [{now:3000},{now:999},{now:NaN},{now:0},{contentVersion:'different:source'},
    {renderContractVersion:'different:renderer'}]) {
    const f=fixture();Object.assign(f.context,patch);assert.equal(offer(f).eligible,false);
  }
  for(const patch of [{checkedAt:4000},{validUntil:1000},{validUntil:Infinity},{schemaVersion:99}]) {
    const f=fixture();Object.assign(f.assessment,patch);assert.equal(offer(f).eligible,false);
  }
});

test('Portal approval is specific to the qualified device and affected content contract',()=>{
  const f=fixture();f.context.deviceProfile='another-phone';
  assert.ok(offer(f).reasons.includes('device-not-qualified'));
  f.context.deviceProfile=f.assessment.deviceProfile;
  // Tested build remains provenance. An unrelated commit need not invalidate
  // unchanged rendering/content contracts or force a worldwide test sweep.
  f.context.currentDocumentationCommit='unrelated-docs';assert.equal(offer(f).eligible,true);
  f.destination.contentVersion='new-content';assert.equal(offer(f).eligible,false);
});

test('Every quality check, required layer and advertised activity needs its own evidence',()=>{
  for(const check of PORTAL_QUALITY_CHECKS) {
    const f=fixture();f.assessment.checks[check]='unknown';
    assert.ok(offer(f).reasons.includes(`unverified-${check}`));
  }
  const f=fixture();delete f.assessment.layers.buildings;
  assert.ok(offer(f).reasons.includes('unverified-layer:buildings'));
  f.assessment.layers.buildings='verified';f.assessment.experienceIds=['fixture:lookout'];
  assert.ok(offer(f).reasons.includes('unverified-experience'));
});

test('Nature does not require invented buildings; coastal and driving offers retain their own requirements',()=>{
  const nature=fixture('nature');delete nature.assessment.layers.buildings;delete nature.assessment.layers.transport;
  assert.equal(offer(nature).eligible,true);
  assert.deepEqual(portalDestinationRequirements(nature.destination),['terrain','landuse','places']);
  nature.destination.arrival.mode=nature.assessment.arrival.mode='drive';
  assert.ok(offer(nature).reasons.includes('unverified-layer:transport'));
  const coast=fixture('coast');delete coast.assessment.layers.hydrology;
  assert.ok(offer(coast).reasons.includes('unverified-layer:hydrology'));
});

test('Geographic scopes admit antimeridian destinations without treating the rest of Earth as inside',()=>{
  const f=fixture('nature');
  f.destination.bounds=f.assessment.bounds={south:-19,north:-16,west:175,east:-175};
  f.destination.origin=f.assessment.origin={lat:-17,lon:179};
  f.destination.arrival=f.assessment.arrival={lat:-17,lon:-179,mode:'walk'};
  assert.equal(offer(f).eligible,true);
  f.destination.arrival=f.assessment.arrival={lat:-17,lon:0,mode:'walk'};
  assert.equal(offer(f).eligible,false);
  f.destination.bounds=f.assessment.bounds={south:-19,north:-16,west:175,east:180};
  f.destination.arrival=f.assessment.arrival={lat:-17,lon:-180,mode:'walk'};
  assert.equal(offer(f).eligible,true);
  f.destination.arrival=f.assessment.arrival={lat:-17,lon:180,mode:'walk'};
  assert.equal(offer(f).eligible,true);
});

test('Portal uses the actual world-readiness owner and immutable publication, not a loaded flag',()=>{
  const f=fixture(),p=published(f);
  assert.equal(world(f,p).eligible,true);
  assert.equal(isEarthWorldUsable(p.ctx,p.result),true);
  for(const field of ['initialEarthWorldReady','gameplayRuntimesReady','geometryReady']) {
    const next=published(f);
    if(field==='initialEarthWorldReady')next.ctx[field]=false;else next.ctx.worldLoadRuntimeState[field]=false;
    assert.equal(world(f,next).eligible,false);
  }
  p.ctx.worldLoading=true;assert.equal(world(f,p).eligible,false);
});

test('A technically ready sparse world cannot fulfill a qualified rich city offer',()=>{
  const f=fixture(),p=published(f,{absent:['buildings','places']});
  assert.equal(isEarthWorldUsable(p.ctx,p.result),true);
  assert.equal(world(f,p).eligible,false);
  assert.ok(world(f,p).reasons.includes('published-layer-missing:buildings'));
  assert.ok(world(f,p).reasons.includes('published-layer-missing:places'));
});

test('Wrong locations and obsolete publication results cannot become Portal arrivals',()=>{
  const f=fixture(),wrong=published(f,{location:{lat:51.5,lon:0}});
  assert.equal(isEarthWorldUsable(wrong.ctx,wrong.result),true);
  assert.ok(world(f,wrong).reasons.includes('published-location-mismatch'));
  const old=published(f),replacement=published(f,{sequence:2});
  assert.equal(world(f,{ctx:replacement.ctx,result:old.result}).eligible,false);
  replacement.ctx.getEnv=()=> 'OCEAN';assert.equal(world(f,replacement).eligible,false);
});

test('Publication readiness rechecks qualification after loading and does not grant a visit receipt',()=>{
  const f=fixture(),p=published(f),before=JSON.stringify(p);
  assert.equal(offer(f).eligible,true);
  f.context.now=3000;assert.equal(world(f,p).eligible,false);
  f.context.now=2000;const result=world(f,p);
  assert.equal(result.eligible,true);
  assert.equal(Object.hasOwn(result,'visited'),false);
  assert.equal(JSON.stringify(p),before);
});
