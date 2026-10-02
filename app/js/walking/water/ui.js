export function createSwimmingHud({recover,id='swimmingHud'}) {
  const panel=document.createElement('section');
  panel.id=id;panel.setAttribute('aria-label','Swimming');
  Object.assign(panel.style,{position:'fixed',left:'50%',bottom:'calc(100px + env(safe-area-inset-bottom))',transform:'translateX(-50%)',zIndex:'120',maxWidth:'calc(100vw - 24px)',width:'340px',boxSizing:'border-box',padding:'10px 12px',borderRadius:'12px',background:'rgba(5,27,40,.94)',border:'1px solid #5896a9',color:'#f3fbff',font:'13px/1.4 system-ui',pointerEvents:'auto'});
  const layoutStyle=document.createElement('style');layoutStyle.textContent=`body:has(#${id}:not([hidden])) #boatPrompt{bottom:calc(250px + env(safe-area-inset-bottom))}`;document.head.append(layoutStyle);
  const label=document.createElement('strong'),status=document.createElement('div'),controls=document.createElement('div');
  controls.style.cssText='display:flex;gap:8px;margin-top:8px';
  let held=0;
  for(const [title,value] of [['Rise',1],['Dive',-1],['Recover',0]]) {
    const button=document.createElement('button');button.textContent=title;button.type='button';
    button.style.cssText='flex:1;min-height:44px;border:1px solid #82b9ca;border-radius:7px;background:#123e53;color:white;font:inherit;touch-action:none';
    if(value) {
      button.onpointerdown=e=>{e.preventDefault();e.stopPropagation();held=value;button.setPointerCapture(e.pointerId)};
      button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>{held=0};
      button.onkeydown=e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();held=value}};
      button.onkeyup=button.onblur=()=>{held=0};
    } else button.onclick=()=>{button.blur();recover()};
    controls.append(button);
  }
  panel.append(label,status,controls);document.body.append(panel);panel.hidden=true;
  return {dispose:()=>{held=0;panel.remove();layoutStyle.remove()},vertical:()=>held,hide:()=>{panel.hidden=true;held=0},show:state=>{
    panel.hidden=false;
    const heading=state.recovering?(state.submerged?'Low air — returning to surface':'Low air — return to shore'):state.submerged?'Diving':'Swimming';
    if(label.textContent!==heading)label.textContent=heading;
    let detail=state.equipment==='scuba'?`Scuba auto-equipped · Air ${Math.ceil(state.airSeconds)}s · Sim. depth ${state.depthMeters.toFixed(1)}m`:'Space: rise · Shift: dive · Scuba equips for deep water';
    if(state.checkpointStatus==='session-only')detail+=' · Local saving unavailable';
    if(status.textContent!==detail)status.textContent=detail;
  }};
}
