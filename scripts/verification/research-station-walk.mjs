import assert from 'node:assert/strict';
// Follow the published walking route using the actual movement controller.
// This advances controller time; it is not elapsed-time performance evidence.
export async function walkResearchStation(page,id,{fixture=false}={}){
 await page.getByLabel('Deck destination').selectOption(id);
 const result=await page.evaluate(({id,fixture})=>{
  const ctx=fixture?researchTest.ctx:marineCtx,previous=ctx.readControlActions;let actions={};ctx.readControlActions=()=>actions;
  try{ctx.boatDeck.select(id);ctx.boatDeck.update(.7);const route=ctx.boatDeck.snapshot().route;
   if(!route?.length)return {ok:false,reason:'No route',snapshot:ctx.boatDeck.snapshot()};let steps=0;
   for(const target of route.slice(1)){let reached=false;for(let i=0;i<1200;i++){
    const p=ctx.boatDeck.snapshot().pose,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);if(d<.05){reached=true;break;}
    const length=Math.max(d,.11);actions={move:(Math.sin(p.yaw)*dx+Math.cos(p.yaw)*dz)/length,strafe:(-Math.cos(p.yaw)*dx+Math.sin(p.yaw)*dz)/length};ctx.boatDeck.update(.05);steps++;
   }if(!reached)return {ok:false,target,pose:ctx.boatDeck.snapshot().pose,mapOpen:ctx.boatDeck.snapshot().mapOpen,steps};}
   return {ok:true,steps,pose:ctx.boatDeck.snapshot().pose,distance:ctx.boatDeck.stationDistance(id)};
  }finally{actions={};ctx.readControlActions=previous;}
 },{id,fixture});
 assert.equal(result.ok,true,JSON.stringify(result));assert.ok(result.distance<.2,JSON.stringify(result));await page.waitForTimeout(100);return result;
}
