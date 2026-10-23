import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';import {parse} from '@babel/parser';
test('early coverage sees building-normalized transport facts before vertical construction starts',async()=>{
 const source=await fs.readFile(new URL('../app/js/world/structure-aware.js',import.meta.url),'utf8'),tree=parse(source,{sourceType:'module'}),node=tree.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='compileStructureAwareFeatureProfileSteps');
 const roads=[{id:'road',resolvedCrossSection:Object.freeze({width:3})}],connectors=[{id:'covered'}],events=[];
 const make=vm.runInNewContext('('+source.slice(node.start,node.end)+')',{appCtx:{roads},runtime:{getNearbyBuildings:()=>[]},createNumericPublicationStore:()=>({}),structureAwareLinearFeatures:()=>connectors,createFeatureBoundsIndex:()=>null,applyBuildingContextSemanticsToFeature:f=>{f.structureSemantics={terrainMode:'at_grade',embeddedInBuilding:f.id==='covered'};events.push('normalize:'+f.id);},compileTunnelObstructionLimits:()=>[],assignFeatureConnections:()=>{throw Error('Vertical compilation must not precede the facts callback');}});
 const steps=make({onSurfaceFactsReady(){assert.equal(roads[0].structureSemantics.terrainMode,'at_grade');assert.equal(connectors[0].structureSemantics.embeddedInBuilding,true);assert.equal(roads[0].resolvedCrossSection.width,3);events.push('coverage');}});
 assert.equal(steps.next().done,false);assert.deepEqual(events,['normalize:road','normalize:covered','coverage']);steps.return();
});
test('initial mask bulk fill preserves every byte and resumes incremental uploads after handoff',async t=>{
 const saved=globalThis.THREE;t.after(()=>{globalThis.THREE=saved;});const textures=[],copies=[];
 class Texture{constructor(data,width,height,format){this.image={data,width,height};this.format=format;textures.push(this);}set needsUpdate(v){if(v)this.version=(this.version||0)+1;}dispose(){}}
 class Vector{set(...v){this.values=v;return this;}}
 globalThis.THREE={DataTexture:Texture,Vector2:Vector,Vector4:Vector,RedFormat:1,RGBAFormat:4};
 const {createPavementTerrainMask}=await import('../app/js/world/pavement-terrain-mask.js');const context={renderer:{capabilities:{maxTextureSize:4096},copyTextureToTexture:(_p,src)=>copies.push(src.image.data.slice())}};
 const keys=['0:0','1:0','-1:1'],normal=createPavementTerrainMask(context,keys),bulk=createPavementTerrainMask(context,keys,{deferUpload:true});const normalTextures=textures.slice(0,2),bulkTextures=textures.slice(4,6);
 for(let i=0;i<keys.length;i++){const values=Uint8Array.from({length:normal.layout.resolution**2},(_,n)=>(n+i*17)%256);normal.publish(keys[i],values);bulk.publish(keys[i],values);}
 assert.equal(copies.length,keys.length*2);assert.deepEqual(bulkTextures[0].image.data,normalTextures[0].image.data);assert.deepEqual(bulkTextures[1].image.data,normalTextures[1].image.data);
 bulk.finishBulkUpload();bulk.publish('0:0',new Uint8Array(bulk.layout.resolution**2).fill(7));assert.equal(copies.length,keys.length*2+2);normal.dispose();bulk.dispose();
});
