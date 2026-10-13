// Personal photographs and observations. These are game records, never GPS
// presence proof, a currency grant or a publication to the shared world.
export const THREE_VIEWS = Object.freeze({
  id:'three-views', albumId:'album:local-explorer:three-views:v1',
  receiptId:'event:campaign-completed:three-views:v1', maxPhotoBytes:384*1024,
  kinds:Object.freeze(['context','detail','setting'])
});
const copy=value=>structuredClone(value);
const finite=Number.isFinite;
const label=value=>typeof value==='string'&&value.trim().length>0&&value.length<=180;
const geo=p=>p&&finite(p.lat)&&finite(p.lon)&&finite(p.y)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
export function viewDistance(a,b){return Math.hypot((a.lat-b.lat)*111000,(a.lon-b.lon)*111000*Math.cos(a.lat*Math.PI/180));}
export function normalizeThreeViews(value){
  if(value?.schemaVersion>1)return copy(value);
  return value?.phase?copy(value):{schemaVersion:1,revision:0,phase:'available',views:[]};
}
export function emptyPhotoAlbum(){return {id:THREE_VIEWS.albumId,kind:'personal-photo-album',schemaVersion:1,photos:[]};}

export function validateAlbumPhoto(photo){
  if(!THREE_VIEWS.kinds.includes(photo?.kind)||photo.id!==`three-views:${photo.kind}`||!Number.isInteger(photo.width)||!Number.isInteger(photo.height)
    ||photo.width<64||photo.height<64||photo.width>1280||photo.height>1280||photo.width*photo.height>1280*960
    ||typeof photo.dataUrl!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo.dataUrl)
    ||photo.dataUrl.length>Math.ceil(THREE_VIEWS.maxPhotoBytes*4/3)+32)throw Error('This photograph is too large or damaged. Take it again.');
  const bytes=atob(photo.dataUrl.slice(23));
  if(bytes.length<128||bytes.length>THREE_VIEWS.maxPhotoBytes||bytes.charCodeAt(0)!==255||bytes.charCodeAt(1)!==216
    ||bytes.charCodeAt(bytes.length-2)!==255||bytes.charCodeAt(bytes.length-1)!==217)throw Error('This photograph is not a complete JPEG.');
  let dimensions=null;
  for(let i=2;i+8<bytes.length;){
    if(bytes.charCodeAt(i++)!==255)break;
    while(bytes.charCodeAt(i)===255)i++;
    const marker=bytes.charCodeAt(i++),size=bytes.charCodeAt(i)*256+bytes.charCodeAt(i+1);
    if(marker===218||marker===217)break;
    if(size<2||i+size>bytes.length)break;
    if([192,193,194].includes(marker)){dimensions={height:bytes.charCodeAt(i+3)*256+bytes.charCodeAt(i+4),width:bytes.charCodeAt(i+5)*256+bytes.charCodeAt(i+6)};break;}
    i+=size;
  }
  if(dimensions?.width!==photo.width||dimensions?.height!==photo.height)throw Error('Photograph dimensions do not match its image.');
  return photo;
}
function validateSubject(subject){
  if(!label(subject?.id)||!label(subject.name)||!label(subject.regionId)||!label(subject.regionLabel)||!geo(subject.position))throw Error('Choose a visible mapped building in the current region.');
}
export function validateView(state,view){
  if(!view||!THREE_VIEWS.kinds.includes(view.kind)||!geo(view.position)||!finite(view.bearing)||!finite(view.range)||view.range<3||view.range>180
    ||view.subjectId!==state.subject?.id||view.regionId!==state.regionId||view.environment!=='EARTH'||view.travelMode!=='walk'
    ||view.visible!==true||view.liveGps===true||!finite(view.coverage)||view.coverage<=0||view.coverage>1)throw Error('Keep the selected building in view while exploring on foot.');
  const previous=state.views.filter(v=>v.kind!==view.kind);
  for(const prior of previous){
    const angle=Math.abs(Math.atan2(Math.sin(view.bearing-prior.bearing),Math.cos(view.bearing-prior.bearing)));
    const ratio=Math.max(view.range,prior.range)/Math.min(view.range,prior.range);
    if(viewDistance(view.position,prior.position)<6||(angle<.20&&ratio<1.4))throw Error('Move to a different viewpoint: change your angle or move closer or farther away.');
    if(state.mode==='photo'&&prior.fingerprint===view.fingerprint)throw Error('These views look identical. Find a different composition.');
  }
  const context=state.views.find(v=>v.kind==='context');
  if(view.kind==='context'&&view.range<12)throw Error('Step back to show the building and some of the street.');
  if(view.kind==='detail'&&(!context||view.range>context.range*.72))throw Error('For the detail, move closer than your street view and frame part of the facade.');
  if(view.kind==='setting'&&(!context||view.range<context.range*.9||view.coverage>.8))throw Error('Step back and leave room around the building to show its place in the district.');
  if(state.mode==='photo'&&(typeof view.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(view.fingerprint)))throw Error('The frame could not be verified. Take the photograph again.');
  return view;
}
export function threeViewsReceipt(state){
  return {eventId:THREE_VIEWS.receiptId,eventType:'campaign-completed',sourceSystem:'explorer-campaign',sourceId:THREE_VIEWS.id,pathId:'field',
    name:state.mode==='photo'?'A Place in Three Views · album':'A Place in Three Views · observations',
    detail:`${state.subject.name}: street context, facade detail and district setting ${state.mode==='photo'?'photographed':'observed'}.`,
    regionId:state.regionId,regionLabel:state.regionLabel,environment:'EARTH',occurredAt:state.completedAt,points:0,
    projections:{profile:false,place:false},metadata:{chapterId:THREE_VIEWS.id,mode:state.mode,subjectId:state.subject.id,viewCount:3,reward:state.mode==='photo'?'three-view-album':'three-view-observations'}};
}
export function transitionThreeViews(input,albumInput,command,now=Date.now()){
  const state=normalizeThreeViews(input),album=copy(albumInput||emptyPhotoAlbum());
  if(state.schemaVersion!==1)throw Error('This album needs a newer World Explorer version.');
  if(state.revision!==command.revision)throw Error('This job changed in another window. Reopen the Journal.');
  let next={...state,revision:state.revision+1};
  if(command.type==='accept'){
    if(state.phase!=='available'||!['photo','observation'].includes(command.mode)||!label(command.regionId)||!label(command.regionLabel))throw Error('Choose the photo or observation job in a loaded region.');
    next={...next,phase:'choose',mode:command.mode,regionId:command.regionId,regionLabel:command.regionLabel,acceptedAt:now,views:[],subject:null};
  }else if(command.type==='choose'){
    if(state.phase!=='choose')throw Error('Finish or leave your current subject before choosing another.');
    validateSubject(command.subject);if(command.subject.regionId!==state.regionId)throw Error('Return to the accepted region.');
    next={...next,subject:copy(command.subject),phase:'framing'};
  }else if(command.type==='keep'){
    if(state.phase!=='framing')throw Error('Choose a building before keeping a view.');
    const view=validateView(state,command.view);
    if(state.views.some(v=>v.kind===view.kind))throw Error('Remove the existing view before replacing it.');
    if(state.mode==='photo'){
      const photo=validateAlbumPhoto(command.photo);
      if(photo.kind!==view.kind)throw Error('Photograph and view do not match.');
      album.photos.push(copy(photo));
    }else if(command.photo)throw Error('Observation records cannot include an invented photograph.');
    next.views=[...state.views,copy(view)];next.phase=next.views.length===3?'review':'framing';
  }else if(command.type==='remove'){
    if(!['framing','review'].includes(state.phase)||!state.views.some(v=>v.kind===command.kind))throw Error('Only an unfinished view can be retaken.');
    next.views=state.views.filter(v=>v.kind!==command.kind);album.photos=album.photos.filter(p=>p.kind!==command.kind);next.phase='framing';
    // A new context must remain the reference for the other compositions.
    if(command.kind==='context'){next.views=[];album.photos=[];}
  }else if(command.type==='finish'){
    if(state.phase==='complete')return {state,album,event:null};
    if(state.phase!=='review'||state.views.length!==3)throw Error('Keep all three views, then review the album.');
    next={...next,phase:'complete',completedAt:now,mediaDeleted:false};
  }else if(command.type==='delete-photos'){
    if(state.phase!=='complete'||state.mode!=='photo')throw Error('Only saved album photographs can be deleted here.');
    album.photos=[];next.mediaDeleted=true;next.mediaDeletedAt=now;
  }else if(command.type==='display'){
    if(state.phase!=='complete'||state.mediaDeleted||!label(command.homeId))throw Error('Enter an owned home to display your completed record.');
    next.displayHomeId=command.homeId;
  }else if(command.type==='abandon'){
    if(state.phase==='complete')throw Error('Your completed record is kept. Delete its photographs separately.');
    next={schemaVersion:1,revision:next.revision,phase:'available',views:[]};album.photos=[];
  }else throw Error('Unknown album action.');
  return {state:next,album,event:command.type==='finish'?threeViewsReceipt(next):null};
}
export function validateThreeViewsBackup(stateInput,albumInput,events){
  const state=normalizeThreeViews(stateInput),album=albumInput||emptyPhotoAlbum();
  if(album.id!==THREE_VIEWS.albumId||album.schemaVersion!==1||album.kind!=='personal-photo-album'||!Array.isArray(album.photos)||album.photos.length>3)throw Error('Invalid album document.');
  const kinds=new Set();for(const photo of album.photos){validateAlbumPhoto(photo);if(kinds.has(photo.kind))throw Error('Duplicate album photograph.');kinds.add(photo.kind);}
  if(state.schemaVersion>1)return;
  if(!Number.isInteger(state.revision)||state.revision<0||!['available','choose','framing','review','complete'].includes(state.phase)||!Array.isArray(state.views)||state.views.length>3)throw Error('Invalid three-view progress.');
  if(state.phase==='available'){if(state.views.length||album.photos.length)throw Error('Inactive job retains photographs.');return;}
  if(!['photo','observation'].includes(state.mode)||!label(state.regionId)||!label(state.regionLabel))throw Error('Invalid album region.');
  if(state.phase==='choose'&&(state.views.length||state.subject))throw Error('Unselected subject retains views.');
  if(state.mediaDeleted&&(state.phase!=='complete'||state.mode!=='photo'||!finite(state.mediaDeletedAt)))throw Error('Invalid media deletion.');
  if(state.displayHomeId&&(!label(state.displayHomeId)||state.phase!=='complete'))throw Error('Invalid home display.');
  if(state.phase!=='choose'){validateSubject(state.subject);if(state.subject.regionId!==state.regionId)throw Error('Subject region does not match the job.');}
  if(state.phase==='framing'&&state.views.length===3)throw Error('Finished views must be reviewed.');
  const distinct=new Set();for(const view of state.views){validateView({...state,views:state.views.filter(v=>v!==view)},view);if(distinct.has(view.kind))throw Error('Duplicate saved view.');distinct.add(view.kind);}
  const needsPhotos=state.mode==='photo'&&!state.mediaDeleted;
  if(album.photos.length!==(needsPhotos?state.views.length:0)||needsPhotos&&state.views.some(v=>!kinds.has(v.kind)))throw Error('Referenced photographs are missing.');
  if(['review','complete'].includes(state.phase)&&state.views.length!==3)throw Error('The three-view record is incomplete.');
  if(state.phase==='complete'&&(!state.completedAt||!events.some(e=>e.eventId===THREE_VIEWS.receiptId&&e.eventType==='campaign-completed'&&e.metadata?.mode===state.mode&&e.metadata?.subjectId===state.subject.id)))throw Error('Album completion receipt is missing.');
}

export function threeViewsBadge(value){
  const state=normalizeThreeViews(value);
  return state.schemaVersion===1&&state.phase==='complete'?{id:'three-view-explorer',label:'Three-view Explorer',detail:state.mode==='photo'?'A mapped place photographed from three viewpoints.':'A mapped place observed from three viewpoints.',earnedAt:state.completedAt}:null;
}
