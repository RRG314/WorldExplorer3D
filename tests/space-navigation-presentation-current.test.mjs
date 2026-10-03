import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { ctx } from '../app/js/shared-context.js?v=55';
import { attemptLanding } from '../app/js/space/runtime.js';
import { resolveFlightTarget, flightLandingReadout } from '../app/js/space/navigation-presentation.js';
import { createBodyEphemerisState, createSpacecraftState } from '../app/js/space/spacecraft-authority.js';

const moon = { name: 'Moon', radius: 20, position: new Vector3(), landable: true };
const mars = { name: 'Mars', radius: 30, position: new Vector3(1000, 0, 0), landable: true };
const findBody = id => [moon, mars].find(body => body.name.toLowerCase() === String(id).toLowerCase());
function fixture() { return { spaceFlight: { rocket: { position: new Vector3(30, 0, 0) }, presentationAuthority: 'classic', destination: 'moon' }, getAllSpaceBodies: () => [moon, mars] }; }

test('selected course owns target even beside another body; docking and universe take precedence', () => {
  const c = fixture(); c.getSpaceTravelSession = () => ({ destination: { kind: 'body', id: 'mars', name: 'Mars' } });
  assert.equal(resolveFlightTarget(c, findBody).body, mars);
  c.spaceFlight._manualLandingTarget = 'moon';
  assert.equal(resolveFlightTarget(c, findBody).body, mars);
  c.getUniverseHudTarget = () => ({ name: 'Survey world', position: new Vector3() });
  assert.equal(resolveFlightTarget(c, findBody).kind, 'universe');
  c.getSolisReachDockTarget = () => ({ name: 'Solis Reach', position: new Vector3() });
  assert.equal(resolveFlightTarget(c, findBody).kind, 'dock');
});

test('missing selected body fails closed instead of silently landing on the nearest world', () => {
  const c = fixture(); c.spaceFlight.destination = 'missing';
  assert.equal(resolveFlightTarget(c, findBody).body, undefined);
  assert.equal(flightLandingReadout(c, resolveFlightTarget(c, findBody)).eligible, false);
});

test('classic display distance does not use retained SI state; exact corridor edge is rejected', () => {
  const c = fixture(); c.spacecraftState = {}; c.spaceJourneyEphemeris = { destination: { bodyId: 'moon' } };
  assert.equal(flightLandingReadout(c, { kind: 'body', body: moon }).eligible, true);
  assert.equal(flightLandingReadout(c, { kind: 'body', body: moon }).si, false);
  c.spaceFlight.rocket.position.x = 280;
  assert.equal(flightLandingReadout(c, { kind: 'body', body: moon }).eligible, false);
});

test('physical landing uses actual altitude, speed, phase and matching destination, never render distance', () => {
  const c = fixture(); c.spaceFlight.presentationAuthority = 'si';
  const body = createBodyEphemerisState('moon', { epochMs: 0, positionM: {x:0,y:0,z:0}, velocityMps:{x:0,y:0,z:0} });
  c.spaceJourneyEphemeris = { destination: body }; c.spaceJourney = { phase: 'approach' };
  const set = (altitude, speed = 0) => { c.spacecraftState = createSpacecraftState({ epochMs: 0, targetBodyId:'moon', positionM:{x:body.radiusM + altitude,y:0,z:0}, velocityMps:{x:0,y:speed,z:0} }); };
  set(15227000); let result = flightLandingReadout(c, {kind:'body',body:moon});
  assert.equal(result.eligible, false); assert.match(result.reason, /25 km/); assert.equal(result.navigation.altitudeM, 15227000);
  set(20000, 121); assert.match(flightLandingReadout(c,{kind:'body',body:moon}).reason,/120 m\/s/);
  set(20000); assert.equal(flightLandingReadout(c,{kind:'body',body:moon}).eligible,true);
  c.spaceJourney.phase='transfer'; assert.equal(flightLandingReadout(c,{kind:'body',body:moon}).eligible,false);
  c.spaceJourney.phase='approach'; assert.equal(flightLandingReadout(c,{kind:'body',body:mars}).eligible,false);
});

test('unsupported universe target cannot fall through to a nearby Solar landing action', () => {
  const before = Object.fromEntries(['spaceFlight','getUniverseHudTarget','getSolisReachDockTarget','getExpeditionPodDockingTarget','getSpaceTravelSession'].map(key => [key,ctx[key]]));
  try {
    ctx.spaceFlight=fixture().spaceFlight; ctx.getUniverseHudTarget=()=>({targetKind:'exoplanet',landable:false,name:'Gas world',radius:20,position:new Vector3()});
    ctx.getSolisReachDockTarget=()=>null; ctx.getExpeditionPodDockingTarget=()=>null;
    assert.equal(attemptLanding(),false);
    assert.notEqual(ctx.spaceFlight.mode,'landing');
  } finally { Object.assign(ctx,before); }
});
