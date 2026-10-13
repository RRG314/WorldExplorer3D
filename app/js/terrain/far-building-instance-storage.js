const STRIDE=15;
const MAX_INSTANCES=1200000;

// Private construction storage, never a published scene/resource owner. Keep
// double precision until Three writes the final Float32 instance transforms.
// Dense cities must not retain a second object and colour array per footprint.
export class FarBuildingInstanceStorage {
  constructor(capacity) {
    if(!Number.isInteger(capacity)||capacity<0||capacity>MAX_INSTANCES)throw new RangeError('Invalid regional building storage capacity');
    this.data=new Float64Array(capacity*STRIDE);this.length=0;this.disposed=false;
  }
  append(x,z,baseY,width,depth,height,rotationY,color,roofFraction=0,facadeStyle=[0,0,0,0x50565b]) {
    if(this.disposed||this.length*STRIDE>=this.data.length)throw new RangeError('Regional building storage exhausted or retired');
    const at=this.length++*STRIDE,a=this.data;
    a[at]=x;a[at+1]=z;a[at+2]=baseY;a[at+3]=width;a[at+4]=depth;
    a[at+5]=height;a[at+6]=rotationY;a[at+7]=color[0];a[at+8]=color[1];a[at+9]=color[2];a[at+10]=roofFraction;
    for(let k=0;k<4;k++)a[at+11+k]=facadeStyle[k];
  }
  read(index,target) {
    if(this.disposed||!Number.isInteger(index)||index<0||index>=this.length)throw new RangeError('Invalid regional building storage index');
    const at=index*STRIDE,a=this.data;
    target.x=a[at];target.z=a[at+1];target.baseY=a[at+2];target.width=a[at+3];target.depth=a[at+4];
    target.height=a[at+5];target.rotationY=a[at+6];target.color[0]=a[at+7];target.color[1]=a[at+8];target.color[2]=a[at+9];
    target.roofFraction=a[at+10];
    target.facadeStyle ||= [0,0,0,0];for(let k=0;k<4;k++)target.facadeStyle[k]=a[at+11+k];
    return target;
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    // Detach only this exclusive scratch allocation, never final GPU arrays.
    // Older browsers still release their sole reference through the assignment.
    if(typeof this.data.buffer.transfer==='function')this.data.buffer.transfer(0);
    this.data=new Float64Array(0);this.length=0;
  }
}
