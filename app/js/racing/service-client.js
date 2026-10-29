import {postProtectedFunction} from '../../../js/function-api.js?v=3';
import {getCurrentUser,getCurrentUserToken} from '../../../js/auth-ui.js?v=56';
import {getFirebaseAppCheckToken,readFirebaseConfig} from '../../../js/firebase-init.js?v=58';
export async function racingServiceOptions(ownerUid,signal){
 const current=()=>getCurrentUser()?.uid===ownerUid;
 if(!ownerUid||getCurrentUser()?.isAnonymous||!current())throw Error('race_signed_account_required');
 const descriptor=await postProtectedFunction('getRacingService',{}, {expectedUserId:ownerUid,signal,timeoutMs:10000});
 if(!current())throw Error('race_account_changed');
 const projectNumber=String(readFirebaseConfig()?.appId||'').split(':')[1],url=new URL(descriptor.endpoint);
 if(descriptor.protocolVersion!==1||!/^\d+$/.test(projectNumber)||url.protocol!=='wss:'||url.pathname!=='/race'||url.search||url.hash||
  !new RegExp(`^we3d-racing(?:-staging)?-${projectNumber}\\.us-central1\\.run\\.app$`).test(url.hostname))throw Error('race_secure_service_required');
 return {endpoint:url.href,credentials:async()=>{
  if(!current())throw Error('race_account_changed');
  const [idToken,appCheckToken]=await Promise.all([getCurrentUserToken(true),getFirebaseAppCheckToken()]);
  if(!current())throw Error('race_account_changed');if(!idToken||!appCheckToken)throw Error('race_attestation_required');return {idToken,appCheckToken};
 }};
}
export async function readOnlineRacingRecords({ownerUid,boardId,cursor,signal}={}){
 if(!ownerUid||getCurrentUser()?.uid!==ownerUid)throw Error('race_signed_account_required');
 return postProtectedFunction('getRacingRecords',boardId?{boardId}:cursor?{cursor}:{},{expectedUserId:ownerUid,signal,timeoutMs:10000});
}
export function readRacingCatalog({ownerUid,locationId,cursor,signal}){return postProtectedFunction('getRacingCatalog',{locationId,...(cursor?{cursor}:{})},{expectedUserId:ownerUid,signal,timeoutMs:15000});}
export function commitRacingRoute(ownerUid,input,signal){return postProtectedFunction('commitRacingRoute',input,{expectedUserId:ownerUid,signal,timeoutMs:15000});}
export function reviewRacingRoutes(ownerUid,input,signal){return postProtectedFunction('reviewRacingRoutes',input,{expectedUserId:ownerUid,signal,timeoutMs:15000});}
export function readMyRacingRoutes(ownerUid,signal){return postProtectedFunction('getMyRacingRoutes',{}, {expectedUserId:ownerUid,signal,timeoutMs:15000});}
