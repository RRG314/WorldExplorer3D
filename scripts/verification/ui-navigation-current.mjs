import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
const output=path.resolve(process.env.WE3D_UI_OUTPUT||`output/verification/trail-ui-20261104/navigation-${Date.now()}`),report={scope:'Original shared navigation component with controlled close/target owners. Intent order, busy/refused close and lifecycle only. No game mode, save or service claim.',cases:[]};let qa;
try{
 qa=await createFieldworkQaSession({rootDir:process.cwd(),output,careerId:'explorer',maximumDurationMs:2*60*1000});const {page}=qa;
 await page.goto('http://127.0.0.1:4192/tests/fixtures/ui-client.html');
 for(const[id,close]of [['blockBuilderPanel','blockBuilderClose'],['propertyPanel','closePropertyPanelBtn'],['historicPanel','closeHistoricPanelBtn'],['universeNavigator','universeCloseBtn'],['expeditionOverlay','expeditionClose']]){
  const result=await page.evaluate(async({id,close})=>{
   document.body.replaceChildren();const host=document.createElement('div');host.innerHTML=`<style>[hidden]{display:none!important}</style><button data-explorer-target="fExplorerJournal">Journal</button><button id="fExplorerJournal">Original Journal owner</button><section id="${id}"><button id="${close}">Original close owner</button></section>`;document.body.append(host);
   const events=[];let allowClose=true;const root=document.getElementById(id);document.getElementById(close).onclick=()=>{events.push('close');if(allowClose)root.hidden=true;};document.getElementById('fExplorerJournal').onclick=()=>events.push('target');
   const {bindWorkspaceNavigation}=await import('/app/js/ui/workspace-navigation.js');const binding=bindWorkspaceNavigation(document,{onBlocked:()=>events.push('blocked')});const button=document.querySelector('[data-explorer-target]');
   button.click();const accepted=[...events];events.length=0;root.hidden=false;root.setAttribute('aria-busy','true');button.click();const busy=[...events];events.length=0;root.setAttribute('aria-busy','false');allowClose=false;button.click();const refused=[...events];events.length=0;binding.dispose();button.click();const disposed=[...events];return{accepted,busy,refused,disposed};
  },{id,close});
  assert.deepEqual(result,{accepted:['close','target'],busy:['blocked'],refused:['close','blocked'],disposed:[]});report.cases.push({id,...result,ok:true});
 }
 assert.deepEqual(qa.report.errors,[]);report.ok=true;
}catch(error){report.ok=false;report.failure=error.stack;await qa?.fail(error);}
finally{await qa?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({ok:report.ok,output,cases:report.cases.length,failure:report.failure}));if(!report.ok)process.exitCode=1;
