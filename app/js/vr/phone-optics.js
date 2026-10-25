// Physical values are metres; projection extents are tangents of view angles.
// Cardboard's published screen-to-texture polynomial and profile schema:
// https://github.com/googlevr/cardboard/blob/master/proto/cardboard_device.proto
// https://github.com/googlevr/cardboard/blob/master/sdk/lens_distortion.cc
const finite=(value,low,high)=>Number.isFinite(value)&&value>=low&&value<=high;
export function validatePhoneOptics(input){
  if(!input||!finite(input.screenWidth,.07,.22)||!finite(input.screenHeight,.035,.15)||
    !finite(input.lensDistance,.025,.08)||!finite(input.lensSeparation,.04,.085)||
    input.lensSeparation>=input.screenWidth||!finite(input.lensY,.012,input.screenHeight-.012)||
    !Array.isArray(input.fov)||input.fov.length!==4||!input.fov.every(value=>finite(value,10,80))||
    !Array.isArray(input.distortion)||input.distortion.length>2||!input.distortion.every(value=>finite(value,0,2))||
    !finite(input.eyeSeparation??input.lensSeparation,.04,.085))throw new TypeError('Check the viewer profile and measured screen dimensions.');
  return Object.freeze({screenWidth:input.screenWidth,screenHeight:input.screenHeight,lensDistance:input.lensDistance,
    lensSeparation:input.lensSeparation,lensY:input.lensY,eyeSeparation:input.eyeSeparation??input.lensSeparation,
    fov:Object.freeze([...input.fov]),distortion:Object.freeze([input.distortion[0]||0,input.distortion[1]||0])});
}
export function radialDistortion(radius,coefficients){
  const squared=radius*radius;return radius*(1+(coefficients[0]||0)*squared+(coefficients[1]||0)*squared*squared);
}
export function phoneEyeProjection(input,eye='left'){
  const p=validatePhoneOptics(input);if(!['left','right'].includes(eye))throw new TypeError('Unknown stereo eye.');
  const distances=[(p.screenWidth-p.lensSeparation)/2,p.lensSeparation/2,p.lensY,p.screenHeight-p.lensY];
  const limits=distances.map((distance,index)=>Math.min(Math.tan(p.fov[index]*Math.PI/180),radialDistortion(distance/p.lensDistance,p.distortion)));
  const [outer,inner,bottom,top]=limits;
  return Object.freeze({left:eye==='left'?outer:inner,right:eye==='left'?inner:outer,bottom,top,
    lensX:(p.screenWidth+(eye==='left'?-p.lensSeparation:p.lensSeparation))/2,lensY:p.lensY,
    eyeOffset:(eye==='left'?-.5:.5)*p.eyeSeparation});
}
export function phoneTextureUv(input,eye,screenU,screenV){
  const p=validatePhoneOptics(input),projection=phoneEyeProjection(p,eye);
  const x=(screenU*p.screenWidth-projection.lensX)/p.lensDistance,y=(screenV*p.screenHeight-p.lensY)/p.lensDistance;
  const r2=x*x+y*y,factor=1+p.distortion[0]*r2+p.distortion[1]*r2*r2;
  return {u:(x*factor+projection.left)/(projection.left+projection.right),v:(y*factor+projection.bottom)/(projection.bottom+projection.top)};
}

// Decode only the viewer fields we use, with bounded protobuf parsing. URL
// parsing never fetches a remote address or executes its contents. Unknown
// hardware is calibrated explicitly, never silently treated as Cardboard v2.
export function parseCardboardViewerUrl(value,{screenWidth,screenHeight,eyeSeparation}={}){
  const url=new URL(value);
  if(url.protocol!=='https:'||!['google.com','www.google.com'].includes(url.hostname)||url.pathname!=='/cardboard/cfg'||url.username||url.password)throw new TypeError('Use the expanded Google Cardboard viewer profile link from your viewer’s QR code.');
  const encoded=url.searchParams.get('p');if(!encoded||!/^[a-zA-Z0-9_-]{1,4096}={0,2}$/.test(encoded))throw new TypeError('This viewer profile is incomplete.');
  const data=Uint8Array.from(atob(encoded.replaceAll('-','+').replaceAll('_','/')),letter=>letter.charCodeAt(0));
  const view=new DataView(data.buffer);let offset=0;const fields={};
  function integer(){let result=0,multiplier=1;for(let count=0;count<5&&offset<data.length;count++){
    const byte=data[offset++];result+=(byte&127)*multiplier;if(!(byte&128))return result;multiplier*=128;
  }throw new TypeError('Invalid viewer profile encoding.');}
  while(offset<data.length){const tag=integer(),field=tag>>>3,wire=tag&7;if(!field)throw new TypeError('Invalid viewer field.');
    if(wire===0)fields[field]=integer();
    else if(wire===5){if(offset+4>data.length)throw new TypeError('Truncated viewer profile.');const number=view.getFloat32(offset,true);offset+=4;fields[field]=field===5||field===7?[...(fields[field]||[]),number]:number;}
    else if(wire===2){const length=integer(),end=offset+length;if(end>data.length)throw new TypeError('Truncated viewer profile.');
      if(field===5||field===7){if(length%4)throw new TypeError('Invalid viewer angles.');fields[field]??=[];while(offset<end){fields[field].push(view.getFloat32(offset,true));offset+=4;}}
      else offset=end;
    }else if(wire===1){offset+=8;if(offset>data.length)throw new TypeError('Truncated viewer profile.');}
    else throw new TypeError('Unsupported viewer profile encoding.');
  }
  const alignment=fields[11]??0;if(![0,1,2].includes(alignment))throw new TypeError('Unknown viewer alignment.');
  const lensY=alignment===1?screenHeight/2:alignment===2?screenHeight-fields[6]-.003:fields[6]-.003;
  return validatePhoneOptics({screenWidth,screenHeight,eyeSeparation,lensDistance:fields[3],lensSeparation:fields[4],
    lensY,fov:fields[5],distortion:fields[7]||[]});
}
