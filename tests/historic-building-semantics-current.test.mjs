import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretBuildingSemantics} from '../app/js/building-semantics.js';
import {selectBuildingExteriorProfile} from '../app/js/world/building-exterior-catalog.js';
test('documented ruins get low inferred massing without residential openings or equipment',()=>{
 const tags={building:'ruins',historic:'ruins'};
 const result=interpretBuildingSemantics(tags,{fallbackHeight:15});
 assert.equal(result.heightMeters,1.6);
 assert.equal(result.shouldCreateRoofDetail,false);
 assert.equal(result.shouldCreateGroundPatch,false);
 const exterior=selectBuildingExteriorProfile({buildingType:'ruins',tags});
 assert.equal(exterior.openings,false);
 assert.deepEqual(exterior.details,[]);
 assert.equal(exterior.storefrontStyle,'none');
 assert.equal(interpretBuildingSemantics({...tags,height:'4.2'}).heightMeters,4.2);
 assert.equal(interpretBuildingSemantics({building:'house'},{fallbackHeight:8}).heightMeters,8);
});
