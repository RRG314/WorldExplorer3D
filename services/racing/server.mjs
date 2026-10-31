import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getAppCheck} from 'firebase-admin/app-check';
import {getFirestore} from 'firebase-admin/firestore';
import {createRaceServer} from './transport.mjs';
import {createFirestoreRaceStore} from './firestore-store.mjs';
import {readPublishedRaceCourse} from './generated/engine.mjs';

const projectId=process.env.GOOGLE_CLOUD_PROJECT||process.env.GCLOUD_PROJECT;
if(!projectId)throw Error('race_project_required');
// This entry point never contains a production auth/App Check bypass.
if(process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.FIRESTORE_EMULATOR_HOST)throw Error('Use the isolated verification entry point for emulators.');
const app=initializeApp({projectId}),db=getFirestore(app),auth=getAuth(app),check=getAppCheck(app);
const origins=(process.env.RACE_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
if(origins.some(s=>{try{const u=new URL(s);return u.protocol!=='https:'||u.origin!==s;}catch{return true;}}))throw Error('race_https_origins_required');
const appIds=(process.env.RACE_APP_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);if(!appIds.length)throw Error('race_app_ids_required');
const store=createFirestoreRaceStore({db,loadCourse:(id,uid,roomCode)=>readPublishedRaceCourse({id,uid,roomCode,read:async path=>{const s=await db.doc(path).get();return s.exists?s.data():null;}})});
const wallAnchor=Date.now(),clockAnchor=performance.now();
const service=createRaceServer({store,origins,now:()=>wallAnchor+performance.now()-clockAnchor,authenticate:async ({idToken,appCheckToken})=>{
 const [identity,attestation]=await Promise.all([auth.verifyIdToken(idToken,true),check.verifyToken(appCheckToken)]);
 if(!appIds.includes(attestation.appId)||identity.firebase?.sign_in_provider==='anonymous')throw Error('race_signed_account_required');
 return {uid:identity.uid,expiresAtMs:Math.min(identity.exp,attestation.token.exp)*1000};
}});
service.server.listen(Number(process.env.PORT)||8080,'0.0.0.0');
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>void service.close().then(()=>process.exit(0),()=>process.exit(1)));
