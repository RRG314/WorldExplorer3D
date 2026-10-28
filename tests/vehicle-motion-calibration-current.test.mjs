import test from'node:test';import assert from'node:assert/strict';import {measureVehicleMotion}from'../scripts/verification/vehicle-motion-benchmark.mjs';
test('road acceleration and stopping allow reaction time without turning ordinary cars into racing rockets',()=>{
 const bmw=measureVehicleMotion('bmw_e34'),classic=measureVehicleMotion('cadillac_fleetwood'),van=measureVehicleMotion('van'),bus=measureVehicleMotion('city_bus');
 assert.ok(bmw.zeroTo60Seconds>6&&bmw.zeroTo60Seconds<11);assert.ok(bmw.oneSecondMph>5&&bmw.oneSecondMph<18);
 assert.ok(bmw.stoppingDistanceMeters>35&&bmw.stoppingDistanceMeters<55);assert.ok(bmw.peakAccelerationMetersPerSecondSquared<9.81);
 assert.ok(classic.zeroTo60Seconds>bmw.zeroTo60Seconds+1);assert.ok(van.zeroTo60Seconds>bmw.zeroTo60Seconds+1);assert.ok(bus.zeroTo60Seconds>20);
});
test('wet grip lengthens stops, while actual engine, brake and tyre upgrades improve their supported dynamics',()=>{
 const dry=measureVehicleMotion('bmw_e34'),wet=measureVehicleMotion('bmw_e34',{grip:.7});
 const engine=measureVehicleMotion('bmw_e34',{levels:{'engine-tune':3}}),brakes=measureVehicleMotion('bmw_e34',{levels:{'street-brakes':1}}),tyres=measureVehicleMotion('bmw_e34',{grip:.7,levels:{'all-road-tires':3}});
 assert.ok(wet.stoppingDistanceMeters>dry.stoppingDistanceMeters*1.2);assert.ok(engine.zeroTo60Seconds<dry.zeroTo60Seconds*.9);
 assert.ok(brakes.stoppingDistanceMeters<dry.stoppingDistanceMeters*.95);assert.ok(tyres.stoppingDistanceMeters<wet.stoppingDistanceMeters*.9);
});
