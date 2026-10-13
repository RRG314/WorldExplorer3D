import test from 'node:test';import assert from 'node:assert/strict';
import {completeAirportTransfer} from '../app/js/transport/airport-transfer.js';
function setup(){const events=[],modes=[];const ctx={LOC:{lat:39,lon:-76},worldLoading:false,elevationWorldYAtWorldXZ:()=>12,setTravelMode(mode,options){modes.push({mode,options});return mode;},setCustomLocation(loc){this.LOC=loc;},loadRoads:async()=>({state:'published'}),recordExplorerEvent:async event=>{events.push(event);return {event};}};return{ctx,events,modes};}
const destination={lat:40,lon:-75,name:'Destination'};
test('airport arrival requires accepted publication and successful aircraft entry',async()=>{
 const {ctx,events,modes}=setup();assert.deepEqual(await completeAirportTransfer(ctx,{destination}),{started:true,journalSaved:true});assert.deepEqual(modes.map(m=>m.mode),['walk','plane']);assert.equal(modes[1].options.y,104);assert.equal(events.length,1);assert.equal(events[0].metadata.journeyKind,'destination-transfer');
});
test('failed or superseded world never starts a plane or awards an arrival',async()=>{
 for(const state of ['failed','superseded','disposed',undefined]){const {ctx,events,modes}=setup();ctx.loadRoads=async()=>({state});await assert.rejects(completeAirportTransfer(ctx,{destination}),/finish loading/);assert.equal(events.length,0);assert.deepEqual(modes.map(m=>m.mode),['walk']);}
});
test('invalid location, blocked mode, unknown ground and rejected plane fail without an arrival',async()=>{
 for(const kind of ['coordinates','walk','ground','plane']){const {ctx,events}=setup();if(kind==='walk'||kind==='plane')ctx.setTravelMode=mode=>mode===kind?false:mode;if(kind==='ground')ctx.elevationWorldYAtWorldXZ=()=>null;await assert.rejects(completeAirportTransfer(ctx,{destination:kind==='coordinates'?{lat:null,lon:0}:destination}));assert.equal(events.length,0);}
});
test('an intervening location change cannot be adopted as this flight destination',async()=>{
 const {ctx,events,modes}=setup();ctx.loadRoads=async()=>{ctx.LOC={lat:41,lon:-75};return{state:'published'};};await assert.rejects(completeAirportTransfer(ctx,{destination}),/changed/);assert.equal(events.length,0);assert.equal(modes.length,1);
});
test('Journal outage does not restart a successfully entered aircraft',async()=>{
 const {ctx,modes}=setup();ctx.recordExplorerEvent=async()=>{throw Error('storage unavailable');};assert.deepEqual(await completeAirportTransfer(ctx,{destination,role:'passenger'}),{started:true,journalSaved:false});assert.equal(modes.filter(m=>m.mode==='plane').length,1);assert.equal(modes[1].options.airportPassenger,true);
});
