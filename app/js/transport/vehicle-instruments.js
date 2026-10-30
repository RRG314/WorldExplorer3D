// Instance-owned cockpit displays. The existing vehicle presentation supplies
// accepted telemetry; this module has no timer, input or simulation authority.
export function createVehicleInstruments(THREE, root) {
  const materials = new Set();
  const styles = new Set();
  root.traverse(object => {
    if (object.userData?.vehicleInstrumentDisplay !== true) return;
    styles.add(object.userData.vehicleInstrumentStyle || 'digital');
    for (const material of [object.material].flat()) if (material) materials.add(material);
  });
  if (!materials.size) return null;
  if(styles.size!==1||![...styles].every(style=>['digital','five-dial','four-dial'].includes(style)))throw Error('invalid_vehicle_instrument_style');
  const style = [...styles][0];
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.flipY = false; // Prepared glTF UVs already use the image's top row.
  const previous = [...materials].map(material => ({material,map:material.map,emissiveMap:material.emissiveMap,
    color:material.color.clone(),emissive:material.emissive.clone(),
    emissiveIntensity:material.emissiveIntensity,toneMapped:material.toneMapped}));
  for (const material of materials) {
    // Exporters may fold the uniform placeholder image into dark PBR factors.
    // The live display supplies its own colors and must replace those factors.
    material.color.setHex(0xffffff); material.emissive.setHex(0xffffff);
    material.emissiveIntensity = .65; material.toneMapped = false;
    material.map = texture; material.emissiveMap = texture;
    material.needsUpdate = true;
  }
  let last = '', disposed = false;
  function update(speedMph = 0, engineRpm = 850, driveGear = 1, redlineRpm = 8000, reverse = false) {
    if (disposed) return false;
    const speed = Math.round(Math.abs(Number(speedMph) || 0));
    const rpm = Math.max(0, Math.round((Number(engineRpm) || 0) / 100) * 100);
    const redline = Math.max(1000, Number(redlineRpm) || 8000);
    const gear = reverse ? 'R' : String(Math.max(1, Math.min(8, Math.round(Number(driveGear) || 1))));
    const value = `${speed}/${rpm}/${gear}/${redline}`;
    if (value === last) return false;
    last = value;
    if(style!=='digital'){
      if(style==='four-dial')drawFourDialInstruments(context,speed,rpm,gear,redline);
      else drawFiveDialInstruments(context,speed,rpm,gear,redline);
      texture.needsUpdate=true;
      return true;
    }
    context.fillStyle = '#071015'; context.fillRect(0,0,512,256);
    for(let i=0;i<20;i++) {
      const active = rpm / redline >= (i+1)/20;
      context.fillStyle = active ? i>=18?'#ff5640':i>=15?'#ffcb46':'#78f1ba' : '#18303a';
      context.fillRect(16+i*24,16,19,22);
    }
    context.textAlign = 'left'; context.fillStyle = '#b5d4dd';
    context.font = 'bold 24px sans-serif';
    context.fillText('MPH',20,77); context.fillText('GEAR',362,77);
    context.fillStyle = '#efffff'; context.font = 'bold 112px monospace';
    context.fillText(String(speed),14,183);
    context.fillStyle = '#ffdc6d'; context.fillText(gear,378,183);
    context.fillStyle = '#91bdc9'; context.font = '26px monospace';
    context.fillText(`RPM ${rpm}`,20,232);
    texture.needsUpdate = true;
    return true;
  }
  update();
  return Object.freeze({update,dispose() {
    if(disposed)return; disposed = true;
    for(const {material,map,emissiveMap,color,emissive,emissiveIntensity,toneMapped} of previous){
      material.map=map;material.emissiveMap=emissiveMap;material.color.copy(color);material.emissive.copy(emissive);
      material.emissiveIntensity=emissiveIntensity;material.toneMapped=toneMapped;
    }
    texture.dispose();
  }});
}

function drawAnalogDial(context,cx,cy,r,label,maximum,value,steps,redline) {
  context.beginPath();context.arc(cx,cy,r,0,Math.PI*2);
  context.fillStyle='#10161d';context.fill();context.lineWidth=1.5;
  context.strokeStyle='#77848b';context.stroke();
  const start=Math.PI*.75,sweep=Math.PI*1.5;
  for(let i=0;i<=steps*5;i++){
    const angle=start+sweep*i/(steps*5),major=i%5===0;
    const outside=r*.88,inside=r*(major ? .72 : .80);
    context.beginPath();context.moveTo(cx+Math.cos(angle)*inside,cy+Math.sin(angle)*inside);
    context.lineTo(cx+Math.cos(angle)*outside,cy+Math.sin(angle)*outside);
    context.strokeStyle=label==='RPM ×1000'&&i/(steps*5)*maximum>=redline?'#ed5849':'#c5d2da';
    context.lineWidth=major?1.6:.8;context.stroke();
    if(major&&value!=null){
      context.fillStyle='#d8e4eb';context.textAlign='center';context.font=`${Math.round(r*.17)}px sans-serif`;
      const number=maximum>=1000?i/(steps*5)*maximum/1000:i/(steps*5)*maximum;
      context.fillText(String(Math.round(number)),cx+Math.cos(angle)*r*.56,cy+Math.sin(angle)*r*.56+r*.06);
    }
  }
  context.textAlign='center';context.fillStyle='#c3d1da';context.font=`bold ${Math.round(r*.17)}px sans-serif`;
  context.fillText(label,cx,cy+r*.27);
  if(value==null){context.font=`${Math.round(r*.4)}px sans-serif`;context.fillText('—',cx,cy+r*.02);return;}
  const angle=start+sweep*Math.max(0,Math.min(1,value/maximum));
  context.beginPath();context.moveTo(cx-Math.cos(angle)*r*.12,cy-Math.sin(angle)*r*.12);
  context.lineTo(cx+Math.cos(angle)*r*.69,cy+Math.sin(angle)*r*.69);
  context.strokeStyle='#fc7157';context.lineWidth=2.2;context.stroke();
  context.beginPath();context.arc(cx,cy,r*.065,0,Math.PI*2);context.fillStyle='#b6c5cf';context.fill();
}

export const FOUR_DIAL_INSTRUMENT_LAYOUT=Object.freeze([
 {role:'temperature',x:43,y:128,r:40,label:'TEMP',maximum:120,steps:6},
 {role:'speed',x:170,y:128,r:76,label:'MPH',maximum:180,steps:9},
 {role:'rpm',x:342,y:128,r:76,label:'RPM ×1000',maximum:9000,steps:9},
 {role:'fuel',x:469,y:128,r:40,label:'FUEL',maximum:1,steps:4}
].map(Object.freeze));
function drawFourDialInstruments(context,speed,rpm,gear,redline){
 context.fillStyle='#080d12';context.fillRect(0,0,512,256);
 const readings={speed,rpm,temperature:null,fuel:null};
 for(const d of FOUR_DIAL_INSTRUMENT_LAYOUT)drawAnalogDial(context,d.x,d.y,d.r,d.label,d.maximum,readings[d.role],d.steps,redline);
 context.textAlign='center';context.fillStyle='#e6f3f6';context.font='bold 18px monospace';
 context.fillText(String(speed),170,174);context.fillText(`G ${gear}`,342,174);
}

function drawFiveDialInstruments(context,speed,rpm,gear,redline) {
  context.fillStyle='#080d12';context.fillRect(0,0,512,256);
  drawAnalogDial(context,42,142,36,'TEMP',120,null,6,redline);
  drawAnalogDial(context,130,136,50,'MPH',180,speed,9,redline);
  drawAnalogDial(context,256,118,68,'RPM ×1000',9000,rpm,9,redline);
  drawAnalogDial(context,382,136,50,'OIL',5,null,5,redline);
  drawAnalogDial(context,470,142,36,'FUEL',1,null,4,redline);
  context.textAlign='center';context.fillStyle='#e6f3f6';context.font='bold 17px monospace';
  context.fillText(String(speed),130,171);
  context.font='bold 18px monospace';context.fillText(`G ${gear}`,256,164);
}
