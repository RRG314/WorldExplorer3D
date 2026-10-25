import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';
import {captureEnvironmentSession} from '../session-coordinator.js?v=2';
import {createPhoneVrSession} from './phone-session.js';
import {parseCardboardViewerUrl,validatePhoneOptics} from './phone-optics.js';
import {getScreenLayoutService} from '../ui/screen-layout.js?v=2';
import {createTrackedVrSession} from './xr-session.js';
import {inspectLocalRoadRide,createLocalRoadRide} from './road-ride.js';

const STORAGE='we3d:vr-phone-optics:1';
export function createVrPlatform(ctx,{target=window}={}){
  ctx.screenLayout ||= getScreenLayoutService(target.document);
  const scope=createLifecycleScope('vr-platform'),doc=target.document;
  let session=null,ride=null,previewRide=null,disposed=false;
  const dialog=doc.createElement('dialog');dialog.id='vrSetup';dialog.setAttribute('aria-labelledby','vrSetupTitle');
  dialog.innerHTML=`<form method="dialog"><button type="submit" class="vrClose" aria-label="Close VR setup">✕</button></form><p class="vrEyebrow">Optional · seated experience</p><h2 id="vrSetupTitle">Virtual reality</h2>
    <p>Stay seated in a clear space. Start with a stationary view. Look slightly down at the in-world Start, Recenter and Exit buttons for a moment to select them. You can also tap a viewer trigger while looking at a button.</p>
    <section aria-labelledby="vrRoadRideTitle"><h3 id="vrRoadRideTitle">Optional guided road ride</h3><p>A short ride follows an existing lane in this loaded location and stops before its next junction. Preparation moves your car to the start. Look at Start inside VR to begin; steering or using a pedal returns to manual driving.</p><p id="vrRidePreview" class="vrSmall"></p><button id="vrPrepareRide" type="button" disabled>Prepare road ride</button><p id="vrRideStatus" role="status"></p></section>
    <section aria-labelledby="vrTrackedTitle"><h3 id="vrTrackedTitle">Tracked headset</h3><p>Use a headset browser with WebXR support. Head movement changes your view independently of the vehicle. You can select the in-world controls with a controller or pinch where supported.</p><p>With standard paired XR controllers: the left stick steers a car; the right trigger accelerates and the left trigger brakes. For aircraft, the left stick banks, the right stick pitches and the triggers change throttle. Release the controls before starting.</p><button id="vrStartTracked" type="button" disabled>Enter headset VR</button><p id="vrTrackedStatus" class="vrSmall" role="status">Checking headset support…</p></section>
    <h3>Phone in a viewer</h3><p>Phone viewer mode provides stereo viewing and head rotation. It does not track your position. A gamepad or keyboard controls the vehicle; looking around does not steer it.</p>
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
  scope.listen(dialog,'close',()=>{if(session?.active&&!session.snapshot().started)session.stop('setup-closed');if(!session?.active){ride?.dispose();ride=null;}ctx.setPauseReason?.('vr-setup',false);ctx.screenLayout?.setPanelLayer?.('vr-setup',false);});
  const emergency=doc.createElement('button');emergency.id='vrEmergencyExit';emergency.type='button';emergency.textContent='Exit VR';emergency.hidden=true;doc.body.append(emergency);scope.defer(()=>emergency.remove());
  scope.listen(emergency,'click',()=>session?.stop('touch-exit'));
  scope.listen(byId('vrPrepareRide'),'click',()=>{
    if(disposed||session?.active)return;
    let prepared;
    try{
      const plan=previewRide;if(!plan)throw new Error('No supported nearby road ride is ready.');
      prepared=createLocalRoadRide(ctx,plan,{captureSession:captureEnvironmentSession});
      if(!prepared.admit())throw new Error('The road start is not clear. You can keep using manual controls.');
      ride?.dispose();ride=prepared;byId('vrRideStatus').textContent='Ready on '+plan.name+'. Enter VR, then look at Start to begin.';byId('vrPrepareRide').textContent='Road ride ready';byId('vrPrepareRide').disabled=true;
    }catch(error){prepared?.dispose();byId('vrRideStatus').textContent=error.message;}
  });
  function exitHandler(initiated,reason){
    if(disposed||session!==initiated)return;emergency.hidden=true;
    if(!['user-exit','touch-exit','escape','session-ended'].includes(reason))ctx.showToast?.(reason==='motion-unavailable'?'Motion access is unavailable. Your normal controls are ready.':'VR ended because the view or travel mode changed. Your normal controls are ready.');
  }
  function begin(initiated,button,onAccepted){
    session=initiated;button.disabled=true;
    void initiated.start().then(accepted=>{
      if(disposed||session!==initiated)return;
      if(!accepted){status('VR was not started. You can try again or keep using normal controls.');return;}
      onAccepted?.();emergency.hidden=false;dialog.close();
    }).catch(error=>{initiated.stop('start-failed');if(!disposed&&session===initiated)status(error.message);}).finally(()=>{if(!disposed&&session===initiated)button.disabled=false;});
  }
  scope.listen(byId('vrStartTracked'),'click',()=>{
    if(disposed||session?.active)return;
    try{
      let initiated;initiated=createTrackedVrSession({ctx,THREE:ctx.THREE||target.THREE,target,ride,captureSession:captureEnvironmentSession,onExit:reason=>exitHandler(initiated,reason)});
      begin(initiated,byId('vrStartTracked'));
    }catch(error){ride?.dispose();ride=null;status(error.message);}
  });
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
      let initiated;initiated=createPhoneVrSession({ctx,THREE,optics,target,ride,captureSession:captureEnvironmentSession,onExit:reason=>exitHandler(initiated,reason)});
      // start() requests permission synchronously in this click/submit gesture.
      begin(initiated,byId('vrStartPhone'),()=>{
        try{target.localStorage.setItem(STORAGE,JSON.stringify({optics,viewport:viewport()}));}catch{}
      });
    }catch(error){ride?.dispose();ride=null;status(error.message);}
  });
  return Object.freeze({
    openSettings(){
      if(disposed)return false;if(session?.active)return false;
      const layer=ctx.screenLayout?.snapshot?.().panelLayer;
      if(layer&&layer!=='vr-setup'){ctx.showToast?.('Close the current panel before opening VR setup.');return false;}
      ctx.setPauseReason?.('vr-setup',true);ctx.screenLayout?.setPanelLayer?.('vr-setup',true);dialog.showModal();status(stored?'Check the saved calibration if your phone, viewer or orientation has changed.':'Measure your screen and match your viewer before entering.');
      ride?.dispose();ride=null;previewRide=inspectLocalRoadRide(ctx);byId('vrPrepareRide').textContent='Prepare road ride';byId('vrPrepareRide').disabled=!previewRide;byId('vrRideStatus').textContent='';byId('vrRidePreview').textContent=previewRide?previewRide.name+' · about '+Math.round(previewRide.length*previewRide.metersPerWorldUnit)+' metres.':'A suitable road ride is not available here. Manual viewing and driving remain available.';
      const supported=target.isSecureContext&&target.navigator?.xr?.isSessionSupported?.('immersive-vr');
      void Promise.resolve(supported).then(available=>{if(disposed)return;byId('vrStartTracked').disabled=!available;byId('vrTrackedStatus').textContent=available?'Headset VR is available. Your browser will ask before entering.':'No tracked headset is available in this browser. Phone viewer mode is separate.';}).catch(()=>{if(!disposed)byId('vrTrackedStatus').textContent='Headset support could not be checked. Normal play and phone viewer mode remain available.';});return true;
    },
    snapshot:()=>session?.snapshot()||{active:false,kind:null},
    dispose(){if(disposed)return;disposed=true;session?.stop('platform-disposed');ride?.dispose();ride=previewRide=null;ctx.setPauseReason?.('vr-setup',false);ctx.screenLayout?.setPanelLayer?.('vr-setup',false);scope.dispose('VR platform ended');}
  });
}
