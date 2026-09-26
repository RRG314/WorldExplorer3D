import {observeAuth,getCurrentUser} from '../js/auth-ui.js?v=56';
import {mountReviewWorkspace,mountContributionWorkspace} from '../app/js/reality-capture/review-workspace.js';
let dispose=()=>{},mounted='';
function update(){
  const section=new URL(location.href).searchParams.get('section')||'overview',user=getCurrentUser(),key=`${user?.uid||''}:${section}`;
  if(key===mounted)return;dispose();dispose=()=>{};mounted=key;
  if(!user||user.isAnonymous)return;
  if(!['review','contributions'].includes(section))return;
  const host=document.querySelector(`[data-account-view="${section}"] [data-contribution-workspace]`);if(!host)return;
  const onEdit=async id=>{const {openRealityCaptureSession}=await import('../app/js/reality-capture/ui.js?v=2');await openRealityCaptureSession(id);};
  if(section==='review')dispose=mountReviewWorkspace(host,{captureId:new URL(location.href).searchParams.get('capture')||'',onEdit});
  if(section==='contributions')dispose=mountContributionWorkspace(host,{onEdit});
}
window.addEventListener('we3d:account-section',update);window.addEventListener('popstate',update);observeAuth(update);update();
