import {SHIP_DECKS, SHIP_ROOMS} from './ship-layout.js?v=6';
import {polar} from './ship-ring-plan.js';

export const EXTERIOR_VIEWS = Object.freeze([
  {id:'forward',label:'Forward',direction:[0,1,0]},
  {id:'aft',label:'Aft',direction:[0,-1,0]},
  {id:'port',label:'Port',direction:[-1,0,0]},
  {id:'starboard',label:'Starboard',direction:[1,0,0]},
  {id:'above',label:'Above',direction:[0,0,-1]},
  {id:'below',label:'Below',direction:[0,0,1]}
]);

export function createShipObservation(THREE, ctx, session) {
  const views=[...EXTERIOR_VIEWS.map(v=>({...v,kind:'exterior',group:'Outside the ship'})),
    ...SHIP_ROOMS.map(room=>({id:room.id,label:room.label,kind:'interior',group:SHIP_DECKS.find(d=>d.id===room.deckId).shortLabel,room}))];
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=432;
  canvas.setAttribute('aria-label','Live observation camera view');
  const paint=canvas.getContext('2d'),pixels=new Uint8Array(canvas.width*canvas.height*4),frame=paint.createImageData(canvas.width,canvas.height);
  const target=new THREE.WebGLRenderTarget(canvas.width,canvas.height,{depthBuffer:true});
  target.texture.colorSpace=THREE.SRGBColorSpace;
  const camera=new THREE.PerspectiveCamera(70,canvas.width/canvas.height,.05,10000);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(6.4,3.2),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));
  // The gallery screen is at its exterior wall, facing the room. Its lower
  // edge stays above the floor and clear of the entrance and viewing seats.
  screen.name='observation-view-screen';screen.position.set(0,1.9,-31.2);
  session.sceneState.deckStates.get('command').group.add(screen);
  const panel=document.createElement('section');panel.id='shipObservationPanel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','shipObservationTitle');
  panel.innerHTML=`<div class="ship-observation-shell"><header><div><small>SOLIS REACH · OBSERVATION GALLERY</small><h2 id="shipObservationTitle">Ship cameras</h2></div><button type="button" data-observation-close aria-label="Close observation screen">Close</button></header><p>Look around outside or check any ship area. Viewing a camera keeps you in your current location.</p><label for="shipObservationView">Camera view</label><select id="shipObservationView">${[...new Set(views.map(v=>v.group))].map(group=>`<optgroup label="${group}">${views.filter(v=>v.group===group).map(v=>`<option value="${v.id}">${v.label}</option>`).join('')}</optgroup>`).join('')}</select><div class="ship-observation-picture"></div><footer><button type="button" data-observation-previous>Previous view</button><div role="status" aria-live="polite" data-observation-status></div><button type="button" data-observation-next>Next view</button></footer><small data-observation-location></small></div>`;
  panel.querySelector('.ship-observation-picture').append(canvas);document.body.append(panel);
  let selected=0,elapsed=1,open=false,previousEnabled=true,frames=0,disposed=false;
  const select=panel.querySelector('select');
  function choose(index){selected=(index+views.length)%views.length;select.value=views[selected].id;elapsed=1;panel.querySelector('[data-observation-status]').textContent=`${views[selected].group} · ${views[selected].label} (${selected+1} of ${views.length})`;}
  function close(){if(!open)return;open=false;panel.classList.remove('show');ctx.Walk.state.enabled=previousEnabled;ctx.clearControlInputState?.('observation-close');document.activeElement?.blur?.();}
  function show(){if(disposed||session.podLaunch)return false;if(!open){previousEnabled=ctx.Walk.state.enabled;ctx.Walk.state.enabled=false;}open=true;ctx.clearControlInputState?.('observation-open');panel.classList.add('show');panel.querySelector('[data-observation-location]').textContent=`Your location: ${SHIP_DECKS.find(d=>d.id===session.activeDeckId)?.label}. Close the screen to continue walking.`;select.focus();elapsed=1;return true;}
  select.addEventListener('change',()=>choose(views.findIndex(v=>v.id===select.value)));
  panel.querySelector('[data-observation-previous]').addEventListener('click',()=>choose(selected-1));
  panel.querySelector('[data-observation-next]').addEventListener('click',()=>choose(selected+1));
  panel.querySelector('[data-observation-close]').addEventListener('click',close);
  const keys=event=>{if(!open)return;if(event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}else if(event.code==='Tab'){
    const controls=[...panel.querySelectorAll('button,select')];const i=controls.indexOf(document.activeElement);
    if(event.shiftKey&&i===0){event.preventDefault();controls.at(-1).focus();}else if(!event.shiftKey&&i===controls.length-1){event.preventDefault();controls[0].focus();}
  }else if(event.code!=='Tab'){event.stopPropagation();}};
  document.addEventListener('keydown',keys,true);choose(0);
  function update(dt){
    const walker=ctx.Walk?.state?.walker;
    if(disposed||(!open&&!(session.activeDeckId==='command'&&walker?.z<-24&&Math.abs(walker.x)<10)))return;
    elapsed+=Math.max(0,dt||0);if(elapsed<.2)return;elapsed=0;
    const view=views[selected],saved=[];let renderer,scene;
    const change=(object,visible)=>{if(object){saved.push([object,object.visible]);object.visible=visible;}};
    if(view.kind==='exterior'){
      const flight=ctx.spaceFlight;if(!flight?.rocket||!flight.renderer||!flight.scene)return;
      renderer=flight.renderer;scene=flight.scene;
      const position=new THREE.Vector3(),quaternion=new THREE.Quaternion();flight.rocket.updateMatrixWorld(true);flight.rocket.getWorldPosition(position);flight.rocket.getWorldQuaternion(quaternion);
      const direction=new THREE.Vector3(...view.direction).applyQuaternion(quaternion);
      camera.position.copy(position).addScaledVector(direction,18);camera.up.set(...(['above','below'].includes(view.id)?[0,1,0]:[0,0,-1])).applyQuaternion(quaternion);
      camera.far=flight.camera?.far||10000;camera.lookAt(position.clone().addScaledVector(direction,2200));change(flight.rocket,false);
    }else{
      renderer=ctx.renderer;scene=ctx.scene;const room=view.room,inner=room.id==='storm-shelter';
      const position=polar(inner?16.9:24.4,room.angle);camera.position.set(position.x,room.deckId==='engineering'?4.3:2.65,position.z);camera.up.set(0,1,0);camera.far=90;camera.lookAt(room.center.x,1.1,room.center.z);
      session.sceneState.deckStates.forEach((state,id)=>change(state.group,id===room.deckId));
      session.sceneState.crewMeshes.forEach(mesh=>change(mesh,mesh.userData.deckId===room.deckId));change(screen,false);
    }
    camera.updateProjectionMatrix();const oldTarget=renderer.getRenderTarget(),oldXr=renderer.xr.enabled;renderer.xr.enabled=false;
    try{
      renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,canvas.width,canvas.height,pixels);
      const stride=canvas.width*4;for(let y=0;y<canvas.height;y++)frame.data.set(pixels.subarray(y*stride,(y+1)*stride),(canvas.height-y-1)*stride);
      paint.putImageData(frame,0,0);texture.needsUpdate=true;frames++;
    }finally{renderer.setRenderTarget(oldTarget);renderer.xr.enabled=oldXr;saved.forEach(([object,visible])=>{object.visible=visible;});}
  }
  return {show,close,update,snapshot:()=>({open,selectedViewId:views[selected].id,viewCount:views.length,frames}),dispose(){close();disposed=true;document.removeEventListener('keydown',keys,true);panel.remove();screen.parent?.remove(screen);screen.geometry.dispose();screen.material.dispose();texture.dispose();target.dispose();}};
}
