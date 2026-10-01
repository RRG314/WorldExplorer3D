// Run the prescribed game client, adding only the app's ship-entry readiness.
import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {stagingCaptureAttestation} from './staging-capture-attestation.mjs';
import {startStaticServer} from './static-server.mjs';
const out='output/verification/ship-action-client';await mkdir(out,{recursive:true});
let source=await readFile(path.join(process.env.HOME,'.codex/skills/develop-web-game/scripts/web_game_playwright_client.js'),'utf8');
source=source.replace('args: ["--use-gl=angle", "--use-angle=swiftshader"],','channel:"chrome",');
source=source.replace('await page.waitForTimeout(500);',`await page.waitForFunction(()=>globalThis.__WE3D_RUNTIME_READY__,null,{timeout:120000});
if(await page.locator('#analyticsConsentDenyBtn').isVisible())await page.locator('#analyticsConsentDenyBtn').click();
await page.evaluate(()=>{document.getElementById('spaceLaunchToggle')?.click();document.getElementById('startBtn')?.click();});
await page.waitForFunction(()=>JSON.parse(globalThis.render_game_to_text?.()||'{}').modes?.space===true,null,{timeout:120000});
if(await page.locator('#spaceFlightHUD').evaluate(e=>e.classList.contains('collapsed')))await page.locator('#sfHudToggle').click();
await page.locator('#sfExpeditionBtn').click();await page.locator('#expeditionPlan').click();
await page.waitForFunction(()=>document.querySelector('.expeditionSummary .is-ready')?.textContent?.includes('READY'));
await page.locator('#expeditionEnterShip').click();
await page.waitForFunction(()=>JSON.parse(globalThis.render_game_to_text?.()||'{}').expeditionShipInterior?.active);`);
source=source.replace('await captureScreenshot(page, canvas, shotPath);','await page.screenshot({path:shotPath});');
source=source.replace('if (freshErrors.length) {','if (freshErrors.length) { process.exitCode=1;');
const attestationModule=new URL('./staging-app-check.mjs',import.meta.url).href;
source=source.replace('await page.goto(args.url, { waitUntil: "domcontentloaded" });',`await (await import(${JSON.stringify(attestationModule)})).configureStagingAppCheck(page,args.url);\nawait page.goto(args.url, { waitUntil: "domcontentloaded" });`);
const privateDir=await mkdtemp(path.join(tmpdir(),'we3d-ship-actions-'));let identity;
const server=await startStaticServer({rootDir:process.cwd(),ports:[4487]});
try{
 identity=await stagingCaptureAttestation();const credential=path.join(privateDir,'credential.json');
 await writeFile(credential,JSON.stringify({projectId:'we3d-staging-20260712',appId:'1:524178734996:web:f59acbc9014f0e26f51981',expiresAt:new Date(Date.now()+600000).toISOString(),token:identity.token}),{mode:0o600});process.env.WE3D_STAGING_APP_CHECK_FILE=credential;
 const child=spawn(process.execPath,['--input-type=module','-','--url',`http://127.0.0.1:${server.port}/app/?launch=space`,'--actions-json',JSON.stringify({steps:[{buttons:['left'],frames:35},{buttons:['up'],frames:45},{buttons:[],frames:10}]}),'--iterations','2','--screenshot-dir',out],{stdio:['pipe','inherit','inherit'],cwd:process.cwd()});
 child.stdin.end(source);process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve(code??1));});
}finally{await server.close();try{await identity?.cleanup();}finally{await rm(privateDir,{recursive:true,force:true});}}
