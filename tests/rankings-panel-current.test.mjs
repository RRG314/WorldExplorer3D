import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import {parse} from '@babel/parser';
import {createScreenLayoutService} from '../app/js/ui/screen-layout.js';
const source=await readFile(new URL('../app/js/flower-challenge.js',import.meta.url),'utf8'),ast=parse(source,{sourceType:'module'}),fn=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='setTitlePanelOpen');
function classes(){const values=new Set();return {add:(...v)=>v.forEach(x=>values.add(x)),remove:(...v)=>v.forEach(x=>values.delete(x)),contains:v=>values.has(v),toggle(v,on){on?values.add(v):values.delete(v);}};}
test('Rankings pauses the current local actor and closing releases only its own UI reasons',()=>{
 const panel={classList:classes()},title={classList:classes()},reasons=new Set(['other-activity']),clear=[],doc={body:{classList:classes(),dataset:{},querySelectorAll:()=>[]},getElementById:()=>title};
 const ctx={gameStarted:true,setPauseReason:(id,active)=>active?reasons.add(id):reasons.delete(id),clearControlInputState:id=>clear.push(id),screenLayout:createScreenLayoutService(doc)};
 const box={appCtx:ctx,ui:{titlePanel:panel},document:doc};vm.runInNewContext(source.slice(fn.start,fn.end)+';this.openPanel=setTitlePanelOpen;',box);
 box.openPanel(true);assert.ok(reasons.has('rankings'));assert.equal(ctx.screenLayout.getPanelLayer(),'rankings');assert.ok(panel.classList.contains('open'));assert.deepEqual(clear,['rankings-open']);
 box.openPanel(true);assert.deepEqual(clear,['rankings-open'],'refresh does not clear controls twice');ctx.screenLayout.setPanelLayer('backpack',true);
 box.openPanel(false);assert.deepEqual([...reasons],['other-activity']);assert.equal(ctx.screenLayout.getPanelLayer(),'backpack');assert.deepEqual(clear,['rankings-open','rankings-close']);
 ctx.gameStarted=false;box.openPanel(true);assert.equal(reasons.has('rankings'),false,'title board cannot prevent a later world launch');box.openPanel(false);
});
