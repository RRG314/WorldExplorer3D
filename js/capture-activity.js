import {initFirebase} from './firebase-init.js?v=58';
import {observeAuth} from './auth-ui.js?v=56';
import {collection,query,orderBy,limit,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

// Reuses the existing owner-only account notification collection. No photos,
// private building details or signed asset URLs are delivered in a notification.
export function mountCaptureActivity(host,{open}={}){
  const section=document.createElement('section');section.className='panel captureActivity';section.hidden=true;
  const heading=document.createElement('h3');heading.textContent='Contribution updates';
  const list=document.createElement('div');list.setAttribute('aria-live','polite');section.append(heading,list);host.append(section);
  let stop=()=>{},disposed=false;
  const authStop=observeAuth(user=>{
    stop();list.replaceChildren();section.hidden=true;
    if(!user||user.isAnonymous||disposed)return;
    const services=initFirebase();if(!services)return;
    stop=onSnapshot(query(collection(services.db,'users',user.uid,'notifications'),orderBy('createdAtMs','desc'),limit(20)),snapshot=>{
      if(disposed)return;list.replaceChildren();
      for(const doc of snapshot.docs){const n=doc.data();if(n.type!=='reality_capture'||!/^[-\w]{1,180}$/.test(n.captureId||''))continue;
        const row=document.createElement('p'),button=document.createElement(open?'button':'a');button.textContent=String(n.title||'View contribution update');
        if(open){button.type='button';button.onclick=()=>open(n.captureId);}else button.href=`/app/capture.html#capture=${encodeURIComponent(n.captureId)}`;
        row.append(button,document.createTextNode(` · ${new Date(n.createdAtMs).toLocaleDateString()}`));list.append(row);
      }
      section.hidden=!list.children.length;
    },()=>{section.hidden=false;list.textContent='Updates could not be loaded. Open My contributions to check your saved work.';});
  });
  return ()=>{disposed=true;stop();authStop();section.remove();};
}
