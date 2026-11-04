import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createFieldworkQaSession} from './fieldwork-qa-session.mjs';
const output=path.resolve(process.env.WE3D_UI_OUTPUT||`output/verification/trail-ui-20261104/layout-${Date.now()}`);
const contexts=(process.env.WE3D_UI_CONTEXTS||'earth,space,hub').split(',');
const selected=new Set((process.env.WE3D_UI_LAYOUT_CASES||'').split(',').filter(Boolean));
const report={scope:'Actual extracted application DOM and production styles; geometry and control exposure only. No live world, travel, renderer or hardware claim.',cases:[]};
let qa;
try{
  qa=await createFieldworkQaSession({rootDir:process.cwd(),output,careerId:'explorer',maximumDurationMs:4*60*1000});const {page}=qa;
  for(const context of contexts){
    await page.goto(`http://127.0.0.1:4192/tests/fixtures/ui-layout.html?context=${context}`);await page.waitForFunction(()=>window.uiLayoutReady);
    for(const [width,height] of [[1440,960],[390,844],[844,390]])for(const scale of ['100','200']){
      if(selected.size&&!selected.has(`${context}-${width}-${scale}`))continue;
      await page.setViewportSize({width,height});await page.evaluate(scale=>document.documentElement.dataset.we3dTextScale=scale,scale);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const navigation=context==='hub'?'.globe-app-rail':'.explorer-global-navigation';
      const buttons=page.locator(navigation+' button');
      assert.equal(await buttons.count(),5);
      const boxes=[];
      for(let i=0;i<5;i++){
        const button=buttons.nth(i);await button.scrollIntoViewIfNeeded();
        const geometry=await button.evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),textFits:e.scrollWidth<=e.clientWidth+1};});
        report.failureCase={context,width,height,scale,button:i,geometry};
        assert.ok(geometry.width>=44&&geometry.height>=44,'usable navigation target');assert.ok(geometry.hit,'uncovered target');assert.ok(geometry.x>=-.5&&geometry.right<=width+.5&&geometry.y>=-.5&&geometry.bottom<=height+.5,'target scrolls fully into view');
        assert.ok(geometry.textFits,'navigation labels fit their targets');boxes.push(geometry);
      }
      if(context==='earth'&&width>1100){const r=await page.locator('#explorerGameHeader').boundingBox(),hud=await page.locator('#hudBox').boundingBox();assert.ok(r.y<=1&&r.width>=width-1,'masthead uses viewport, not filtered dock');assert.ok(hud.y>=r.y+r.height,'HUD clears masthead');}
      if(context==='space')assert.equal(await page.locator('.explorer-context-actions').isVisible(),false,'Earth-only dock stays hidden in Space');
      await page.screenshot({path:path.join(output,`${context}-${width}-${scale}.png`)});
      report.cases.push({context,width,height,scale,boxes,ok:true});
      delete report.failureCase;
    }
  }
  assert.deepEqual(qa.report.errors,[]);report.ok=true;
}catch(error){report.ok=false;report.failure=error.stack;await qa?.fail(error);}
finally{await qa?.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({ok:report.ok,output,cases:report.cases.length,failure:report.failure}));if(!report.ok)process.exitCode=1;
