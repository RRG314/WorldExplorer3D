import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePhoneOptics,phoneEyeProjection,phoneTextureUv,parseCardboardViewerUrl} from '../app/js/vr/phone-optics.js';
const profile={screenWidth:.12,screenHeight:.0675,lensDistance:.04,lensSeparation:.064,lensY:.03375,fov:[45,45,45,45],distortion:[.34,.55]};
test('measured optics produce mirrored asymmetric eyes with physical separation',()=>{
  const left=phoneEyeProjection(profile,'left'),right=phoneEyeProjection(profile,'right');assert.equal(left.left,right.right);assert.equal(left.right,right.left);assert.equal(left.bottom,right.bottom);
  assert.ok(left.left<left.right);assert.ok(Math.abs(right.eyeOffset-left.eyeOffset-.064)<1e-12);
  assert.equal(left.lensX+right.lensX,profile.screenWidth);
});
test('lens centres sample the optical centres and the two eyes remain separate',()=>{
  for(const eye of ['left','right']){const p=phoneEyeProjection(profile,eye),uv=phoneTextureUv(profile,eye,p.lensX/profile.screenWidth,.5);assert.equal(uv.u,p.left/(p.left+p.right));assert.equal(uv.v,.5);}
  assert.ok(phoneTextureUv(profile,'left',0,0).u<0,'outside the nominal FOV becomes black rather than wrapping into the other eye');
});
test('unknown/unsafe calibration cannot be silently accepted',()=>{
  for(const input of [null,{...profile,screenWidth:NaN},{...profile,lensDistance:0},{...profile,lensY:.2},{...profile,eyeSeparation:.2},{...profile,fov:[90,45,45,45]},{...profile,distortion:[-1]}])assert.throws(()=>validatePhoneOptics(input));
  assert.throws(()=>phoneEyeProjection(profile,'middle'));
});
function viewer(){
  const chunks=[];const scalar=(field,value)=>{const bytes=Buffer.alloc(5);bytes[0]=(field<<3)|5;bytes.writeFloatLE(value,1);chunks.push(bytes);};
  scalar(3,.04);scalar(4,.064);scalar(6,.035);
  for(const [field,values] of [[5,[45,45,45,45]],[7,[.34,.55]]]){const bytes=Buffer.alloc(2+values.length*4);bytes[0]=(field<<3)|2;bytes[1]=values.length*4;values.forEach((value,index)=>bytes.writeFloatLE(value,2+index*4));chunks.push(bytes);}
  chunks.push(Buffer.from([11<<3,1]));return `https://google.com/cardboard/cfg?p=${Buffer.concat(chunks).toString('base64url')}`;
}
test('actual bounded protobuf decoder reads a standard Cardboard profile without fetching its URL',()=>{
  const p=parseCardboardViewerUrl(viewer(),{screenWidth:.12,screenHeight:.0675});assert.ok(Math.abs(p.lensSeparation-.064)<1e-7);assert.equal(p.lensY,.03375);assert.deepEqual(p.fov,[45,45,45,45]);assert.equal(p.distortion.length,2);
});
test('viewer URL validation rejects private/foreign links, credentials and malformed protobuf',()=>{
  for(const value of ['http://google.com/cardboard/cfg?p=AA','https://localhost/cardboard/cfg?p=AA','https://evil.example/cardboard/cfg?p=AA','https://user:secret@google.com/cardboard/cfg?p=AA','https://google.com/cardboard/cfg?p=AA','https://google.com/cardboard/cfg?p=IA'])assert.throws(()=>parseCardboardViewerUrl(value,{screenWidth:.12,screenHeight:.0675}));
});
