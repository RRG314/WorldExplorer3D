// A read-only projection of the existing room directory. This view never joins
// a room, creates a guest identity, polls presence or changes the game session.
export function portalPublicRooms(rows) {
  const found=new Set(), text=value=>String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80);
  return (Array.isArray(rows)?rows:[]).flatMap(room=>{
    const code=String(room?.code||room?.id||'');
    if(room?.visibility!=='public'||room.systemKind==='weekly'||!/^[A-Z0-9]{6}$/.test(code)||found.has(code)||!['earth','moon','space'].includes(room.world?.kind))return [];
    found.add(code);
    return [{code,name:text(room.name)||`Room ${code}`,city:text(room.locationTag?.city||room.locationTag?.label),kind:room.world.kind}];
  }).slice(0,8);
}

export function createPortalRoomsView({scope,readRooms,onChange=()=>{},now=Date.now,isOnline=()=>globalThis.navigator?.onLine!==false}) {
  let visible=false,disposed=false,work=null;
  let state={status:'idle',rooms:[],checkedAt:null,error:''};
  const current=()=>!disposed&&scope.isActive();
  const snapshot=()=>({...state,rooms:state.rooms.map(room=>({...room}))});
  const publish=()=>{if(current()&&visible)onChange(snapshot());};
  function refresh() {
    if(!current()||!visible)return Promise.resolve(false);
    if(work)return work;
    if(!isOnline()) {state={...state,status:'offline',error:'You’re offline. Reconnect to check public rooms.'};publish();return Promise.resolve(false);}
    state={...state,status:'loading',error:''};
    // Adopt the pending request before any render callback can request another.
    const pending=Promise.resolve().then(()=>current()?readRooms():null).then(rows=>{
      if(!current())return false;
      if(rows===null){state={...state,status:'idle',error:''};return false;}
      state={status:'ready',rooms:portalPublicRooms(rows),checkedAt:now(),error:''};publish();return true;
    },()=>{
      if(!current())return false;
      state={...state,status:'error',error:'Public rooms could not be refreshed. You can still open Multiplayer and try there.'};publish();return false;
    });
    work=pending;
    const finish=()=>{if(work===pending)work=null;};pending.then(finish,finish);
    publish();return pending;
  }
  const api={snapshot,refresh,setVisible(next){
    if(!current()||visible===!!next)return;
    visible=!!next;
    if(visible&&(state.status==='idle'||state.checkedAt===null||now()-state.checkedAt>300000))void refresh();
  },dispose(){if(disposed)return;disposed=true;visible=false;work=null;state={status:'closed',rooms:[],checkedAt:null,error:''};}};
  scope.defer(()=>api.dispose());
  return Object.freeze(api);
}
