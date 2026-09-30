// Run the prescribed action client with disposable staging attestation.
// Credentials live only in an owner-private temporary directory, never evidence.
import {stagingCaptureAttestation} from './staging-capture-attestation.mjs';
import {startStaticServer} from './static-server.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import path from 'node:path';
const privateDir=await mkdtemp(path.join(tmpdir(),'we3d-action-attestation-'));
let identity,server;
const plane = process.env.WE3D_ACTION_MODE === 'plane';
try {
  identity=await stagingCaptureAttestation();
  const credential=path.join(privateDir,'credential.json');
  await writeFile(credential,JSON.stringify({projectId:'we3d-staging-20260712',appId:'1:524178734996:web:f59acbc9014f0e26f51981',expiresAt:new Date(Date.now()+600000).toISOString(),token:identity.token}),{mode:0o600});
  server=await startStaticServer({rootDir:process.cwd(),ports:[4491]});
  const child=spawn(process.execPath,['scripts/verification/web-game-ready-current.mjs',
    '--url',`http://127.0.0.1:${server.port}/app/?loc=custom&lat=39.2904&lon=-76.6122&lname=Baltimore&launch=earth&gm=free&mode=driving`,
    '--click-selector','#globeSelectorStartBtn','--actions-json',JSON.stringify({steps:plane?[{buttons:['space'],frames:60},{buttons:['space','left'],frames:18},{buttons:[],frames:12}]:[{buttons:['up'],frames:60},{buttons:['up','left'],frames:18},{buttons:[],frames:12}]}),
    '--iterations',plane?'4':'2','--screenshot-dir',process.env.WE3D_ACTION_OUTPUT || 'output/architecture-evaluation/movement-source-actions-recorded-noaa'],
    {stdio:'inherit',env:{...process.env,WE3D_STAGING_APP_CHECK_FILE:credential,
      WE3D_GAME_CLIENT:process.env.WE3D_GAME_CLIENT || path.join(process.env.HOME,'.codex/skills/develop-web-game/scripts/web_game_playwright_client.js'),
      WE3D_REAL_GPU:'1',WE3D_TEST_DAY:'1',WE3D_ACTION_ROAD_START:plane?'0':'1'}});
  process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve(code??1));});
} finally {
  await server?.close();
  try {await identity?.cleanup();} finally {await rm(privateDir,{recursive:true,force:true});}
}
