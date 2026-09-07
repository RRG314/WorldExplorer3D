// Pure shared math: browser preview and trusted derivative generation use the
// same projection. No DOM, storage, network or authentication dependencies.
export function validateQuad(quad) {
  if(!Array.isArray(quad)||quad.length!==4||quad.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1)))throw Error('Mark four corners inside the photo.');
  for(let i=0;i<4;i++){const a=quad[i],b=quad[(i+1)%4],c=quad[(i+2)%4];if((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])<.0001)throw Error('Corners must follow top-left, top-right, bottom-right, bottom-left without crossing.');}
  return quad;
}
export function photoHomography(quad){
  validateQuad(quad);const rows=[];
  [[0,0],[1,0],[1,1],[0,1]].forEach(([x,y],i)=>{const[u,v]=quad[i];rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);});
  for(let col=0;col<8;col++){
    let pivot=col;for(let r=col+1;r<8;r++)if(Math.abs(rows[r][col])>Math.abs(rows[pivot][col]))pivot=r;
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];const n=rows[col][col];if(Math.abs(n)<1e-10)throw Error('These corners cannot define a stable wall projection.');
    for(let j=col;j<9;j++)rows[col][j]/=n;
    for(let r=0;r<8;r++)if(r!==col){const f=rows[r][col];for(let j=col;j<9;j++)rows[r][j]-=f*rows[col][j];}
  }return [...rows.map(r=>r[8]),1];
}
export function projectPhoto(h,x,y){const d=h[6]*x+h[7]*y+1;return[(h[0]*x+h[1]*y+h[2])/d,(h[3]*x+h[4]*y+h[5])/d];}
