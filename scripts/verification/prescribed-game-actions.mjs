import {readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// Keep the skill's exact keyboard/mouse choreography while reusing the single
// owned, already-attested browser. This adapter never starts another world.
export async function runPrescribedGameActions(page,dir,steps,canvas='#oceanModeCanvas') {
 const source=await readFile(`${process.env.HOME}/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`,'utf8');
 const marker='main().catch((err) => {';assert.ok(source.includes(marker));
 const adapter=resolve(dir,'prescribed-actions.mjs');
 await writeFile(adapter,source.slice(0,source.indexOf(marker))+'\nexport {doChoreography};\n');
 try {
  const {doChoreography}=await import(pathToFileURL(adapter));
  await page.evaluate(canvas=>{
    if(canvas==='#oceanModeCanvas'&&window.getOceanModeDebugState?.().active){
      window.__prescribedPreviousAdvanceTime=window.advanceTime;
      // Ocean owns a separate RAF loop. The Earth kernel hook returns before
      // an Ocean frame; wait for its real frames while keys remain pressed.
      window.advanceTime=async ms=>{const start=performance.now();do{await new Promise(requestAnimationFrame);}while(performance.now()-start<ms);};
    }
    if(typeof window.advanceTime!=='function')window.advanceTime=async ms=>{for(let left=ms;left>0;left-=1000/60)await new Promise(requestAnimationFrame);};
    if(typeof window.render_game_to_text!=='function')window.render_game_to_text=()=>JSON.stringify({coordinateSystem:'x east, y up, z south; Ocean launch origin',ocean:window.getOceanModeDebugState?.()});
  },canvas);
  await doChoreography(page,await page.locator(canvas).elementHandle(),steps);
 } finally {await page.evaluate(()=>{if('__prescribedPreviousAdvanceTime' in window){window.advanceTime=window.__prescribedPreviousAdvanceTime;delete window.__prescribedPreviousAdvanceTime;}}).catch(()=>{});await unlink(adapter);}
}
