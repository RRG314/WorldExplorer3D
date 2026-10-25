import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';
import {captureEnvironmentSession} from '../session-coordinator.js?v=2';
import {createPhoneVrSession} from './phone-session.js';
import {parseCardboardViewerUrl,validatePhoneOptics} from './phone-optics.js';
import {getScreenLayoutService} from '../ui/screen-layout.js?v=2';

const STORAGE='we3d:vr-phone-optics:1';
export function createVrPlatform(ctx,{target=window}={}){
  ctx.screenLayout ||= getScreenLayoutService(target.document);
  const scope=createLifecycleScope('vr-platform'),doc=target.document;
  let session=null,disposed=false;
  const dialog=doc.createElement('dialog');dialog.id='vrSetup';dialog.setAttribute('aria-labelledby','vrSetupTitle');
  dialog.innerHTML=`<form method="dialog"><button type="submit" class="vrClose" aria-label="Close VR setup">✕</button></form><p class="vrEyebrow">Optional · seated experience</p><h2 id="vrSetupTitle">Virtual reality</h2>
    <p>Phone viewer mode provides stereo viewing and head rotation. It does not track your position. Your gamepad or keyboard controls the vehicle; looking around does not steer it.</p>
    <p>Stay seated in a clear space. Start with a stationary view. Look slightly down at the in-world Start, Recenter and Exit buttons for a moment to select them. You can also tap a viewer trigger while looking at a button.</p>
    <button id="vrFullScreen" type="button">Use full screen before calibrating</button>
    <form id="vrCalibration"><h3>1. Measure your screen</h3><p>Turn the phone sideways. Adjust this line to match <b>50 mm on a ruler</b>, then use the measurement. Measure the active screen, not its outer case.</p>
      <div class="vrRuler"><div id="vrRulerLine" style="width:150px"></div></div><label>Calibration line width<input id="vrRulerWidth" type="range" min="60" max="320" value="150"></label><button id="vrMeasure" type="button">Use this measurement</button>
      <div class="vrGrid"><label>Screen width (mm)<input name="screenWidth" type="number" min="70" max="220" step="0.1" required></label><label>Screen height (mm)<input name="screenHeight" type="number" min="35" max="150" step="0.1" required></label></div>
      <h3>2. Match your viewer</h3><label>Google Cardboard viewer-profile link<input name="viewerUrl" type="url" placeholder="https://google.com/cardboard/cfg?p=…" autocomplete="off"></label><p class="vrSmall">Paste the expanded link from your viewer’s QR code. A profile describes its lenses; a phone’s screen size alone is not enough.</p>
      <details><summary>Manual lens calibration</summary><p>Use your viewer manufacturer’s values. Leave the profile link empty to use these settings.</p><div class="vrGrid">
        <label>Screen to lens (mm)<input name="lensDistance" type="number" min="25" max="80" step="0.1"></label><label>Lens separation (mm)<input name="lensSeparation" type="number" min="40" max="85" step="0.1"></label><label>Lens height above screen bottom (mm)<input name="lensY" type="number" min="12" max="140" step="0.1"></label><label>Eye separation (mm, optional)<input name="eyeSeparation" type="number" min="40" max="85" step="0.1"></label><label>Left eye: outer FOV (degrees)<input name="fov0" type="number" min="10" max="80"></label><label>Inner FOV (degrees)<input name="fov1" type="number" min="10" max="80"></label><label>Bottom FOV (degrees)<input name="fov2" type="number" min="10" max="80"></label><label>Top FOV (degrees)<input name="fov3" type="number" min="10" max="80"></label><label>Distortion K1<input name="k1" type="number" min="0" max="2" step="0.001"></label><label>Distortion K2<input name="k2" type="number" min="0" max="2" step="0.001"></label></div></details>
      <label class="vrConsent"><input name="confirmed" type="checkbox" required><span>I matched the screen measurement and my viewer’s lens settings. I’ll stop if the view feels uncomfortable.</span></label>
      <button id="vrStartPhone" type="submit">Enter phone viewer</button>
    </form><p id="vrSetupStatus" role="status" aria-live="polite"></p>`;
  doc.body.append(dialog);scope.defer(()=>dialog.remove());
  const byId=id=>dialog.querySelector('#'+id),form=byId('vrCalibration'),status=message=>byId('vrSetupStatus').textContent=message;
  let stored=null;try{stored=JSON.parse(target.localStorage.getItem(STORAGE));if(stored)stored.optics=validatePhoneOptics(stored.optics);}catch{stored=null;}
  function viewport(){return {width:target.innerWidth,height:target.innerHeight,angle:Number(target.screen?.orientation?.angle??target.orientation)||0};}
  if(stored){
    for(const key of ['screenWidth','screenHeight','lensDistance','lensSeparation','lensY','eyeSeparation'])form.elements[key].value=String(Math.round(stored.optics[key]*10000)/10);
    stored.optics.fov.forEach((value,index)=>form.elements['fov'+index].value=value);form.elements.k1.value=stored.optics.distortion[0];form.elements.k2.value=stored.optics.distortion[1];
  }
  scope.listen(byId('vrRulerWidth'),'input',event=>byId('vrRulerLine').style.width=event.target.value+'px');
  scope.listen(byId('vrMeasure'),'click',()=>{
    const pixels=byId('vrRulerLine').getBoundingClientRect().width;
    form.elements.screenWidth.value=(target.innerWidth*50/pixels).toFixed(1);form.elements.screenHeight.value=(target.innerHeight*50/pixels).toFixed(1);status('Screen measurement applied. Now match your viewer’s lenses.');
  });
  scope.listen(byId('vrFullScreen'),'click',()=>{
    const request=doc.documentElement.requestFullscreen?.();if(!request){status('Full screen is unavailable here. You can use the installed home-screen app, or calibrate the current screen area.');return;}
    void request.then(()=>status('Measure the screen in this full-screen orientation.')).catch(()=>status('Full screen was not enabled. Calibrate the current screen area.'));
  });
  scope.listen(dialog,'close',()=>{if(session?.active&&!session.snapshot().started)session.stop('setup-closed');ctx.setPauseReason?.('vr-setup',false);ctx.screenLayout?.setPanelLayer?.('vr-setup',false);});
  const emergency=doc.createElement('button');emergency.id='vrEmergencyExit';emergency.type='button';emergency.textContent='Exit VR';emergency.hidden=true;doc.body.append(emergency);scope.defer(()=>emergency.remove());
  scope.listen(emergency,'click',()=>session?.stop('touch-exit'));
  scope.listen(form,'submit',event=>{
    event.preventDefault();if(disposed)return;
    if(target.innerWidth<target.innerHeight){status('Turn your phone sideways, then measure and calibrate in that orientation.');return;}
    if(session?.active){status('A VR view is already open.');return;}
    let optics;
    try{
      const number=name=>form.elements[name].value.trim()===''?NaN:Number(form.elements[name].value);
      const physical={screenWidth:number('screenWidth')/1000,screenHeight:number('screenHeight')/1000,
        ...(Number.isFinite(number('eyeSeparation'))?{eyeSeparation:number('eyeSeparation')/1000}:{})};
      optics=form.elements.viewerUrl.value.trim()?parseCardboardViewerUrl(form.elements.viewerUrl.value.trim(),physical):validatePhoneOptics({...physical,
        lensDistance:number('lensDistance')/1000,lensSeparation:number('lensSeparation')/1000,lensY:number('lensY')/1000,
        fov:[0,1,2,3].map(index=>number('fov'+index)),distortion:[number('k1'),number('k2')]});
      const THREE=ctx.THREE||target.THREE;
      session=createPhoneVrSession({ctx,THREE,optics,target,captureSession:captureEnvironmentSession,onExit:reason=>{
        emergency.hidden=true;
        if(reason!=='user-exit'&&reason!=='touch-exit'&&reason!=='escape')ctx.showToast?.(reason==='motion-unavailable'?'Motion access is unavailable. Your normal controls are ready.':'VR ended because the view or travel mode changed. Your normal controls are ready.');
      }});
      byId('vrStartPhone').disabled=true;
      // start() requests permission synchronously in this click/submit gesture.
      void session.start().then(accepted=>{
        if(!accepted){status('Motion access was not enabled. You can try again or keep using normal controls.');return;}
        try{target.localStorage.setItem(STORAGE,JSON.stringify({optics,viewport:viewport()}));}catch{}
        emergency.hidden=false;dialog.close();
      }).catch(error=>{session?.stop('start-failed');status(error.message);}).finally(()=>byId('vrStartPhone').disabled=false);
    }catch(error){status(error.message);}
  });
  return Object.freeze({
    openSettings(){
      if(disposed)return false;if(session?.active)return false;
      const layer=ctx.screenLayout?.snapshot?.().panelLayer;
      if(layer&&layer!=='vr-setup'){ctx.showToast?.('Close the current panel before opening VR setup.');return false;}
      ctx.setPauseReason?.('vr-setup',true);ctx.screenLayout?.setPanelLayer?.('vr-setup',true);dialog.showModal();status(stored?'Check the saved calibration if your phone, viewer or orientation has changed.':'Measure your screen and match your viewer before entering.');return true;
    },
    snapshot:()=>session?.snapshot()||{active:false,kind:null},
    dispose(){if(disposed)return;disposed=true;session?.stop('platform-disposed');ctx.setPauseReason?.('vr-setup',false);ctx.screenLayout?.setPanelLayer?.('vr-setup',false);scope.dispose('VR platform ended');}
  });
}
