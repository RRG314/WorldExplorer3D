import {doc,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {getCurrentUser} from '../../../js/auth-ui.js?v=56';
import {initFirebase} from '../../../js/firebase-init.js?v=58';
import {mutateSharedExpedition} from '../../../js/expedition-api.js?v=2';
import {getCurrentRoom} from '../multiplayer/rooms.js?v=67';
export function createMarineTransport(){
 const user=getCurrentUser(),room=getCurrentRoom(),db=initFirebase()?.db;
 if(!user?.uid||!room?.code||!db)throw Error('Open Community and join a room, then return to Shared crew.');
 return {uid:user.uid,roomCode:room.code,isCurrent:()=>getCurrentRoom()?.code===room.code&&getCurrentUser()?.uid===user.uid,
  subscribe:(next,error)=>onSnapshot(doc(db,'rooms',room.code,'expeditions','marine'),s=>next(s.exists()?s.data():null),error),
  send:command=>mutateSharedExpedition({roomCode:room.code,domain:'marine',command,forceRefreshToken:false})};
}
