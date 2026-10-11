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
  await page.evaluate(()=>{window.advanceTime=async ms=>{for(let left=ms;left>0;left-=1000/60)await new Promise(requestAnimationFrame);};window.render_game_to_text=()=>JSON.stringify({coordinateSystem:'x east, y up, z south; Ocean launch origin',ocean:window.getOceanModeDebugState?.()});});
  await doChoreography(page,await page.locator(canvas).elementHandle(),steps);
 } finally {await unlink(adapter);}
}
