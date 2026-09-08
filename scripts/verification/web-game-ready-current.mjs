// Use the prescribed action/screenshot client, adding this app's explicit
// readiness contract. Its generic 500ms menu delay is insufficient here.
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const client=process.env.WE3D_GAME_CLIENT || '/Users/stevenreid/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js';
let source=await readFile(client,'utf8');
const patches=[
 ['await page.waitForTimeout(500);', `await page.waitForFunction(() => window.__WE3D_RUNTIME_READY__, null, {timeout:45000});`],
 ['await page.click(args.clickSelector, { timeout: 5000 });', 'await page.click(args.clickSelector, { timeout: 15000 });'],
 ['await page.waitForTimeout(250);', `await page.waitForFunction(() => { const s=window.getWorldExplorerRuntimeDiagnostics?.(); return s?.gameStarted && !s.worldLoading && !document.getElementById('loading')?.classList.contains('show'); }, null, {timeout:90000});`]
];
for(const [before,after] of patches){
 if(!source.includes(before)) throw new Error('Prescribed client changed; review readiness adapter before running.');
 source=source.replace(before,after);
}
// A failed start is a failed test, not a successful menu screenshot.
source=source.replace('console.warn("Failed to click selector", args.clickSelector, err);','throw err;');
// WebGL's default non-preserved drawing buffer may be cleared before toDataURL.
// Capture the composited page instead, including the real player-facing HUD.
source=source.replace('await captureScreenshot(page, canvas, shotPath);', 'await page.screenshot({path:shotPath, type:"png"});');
const child=spawn(process.execPath,['--input-type=module','-',...process.argv.slice(2)],{stdio:['pipe','inherit','inherit']});
const deadline=setTimeout(()=>child.kill('SIGTERM'),150000);
child.stdin.end(source);
child.on('exit',code=>{clearTimeout(deadline);process.exitCode=code ?? 1;});
