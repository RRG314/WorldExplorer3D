// Original repeatable wire pattern, shared by permanent venue and event owners.
// The caller owns this texture and retires it with its existing scene root.
export function createChainLinkTexture(T){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
 ctx.strokeStyle='#a8b1b4';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,32);ctx.lineTo(32,0);ctx.lineTo(64,32);ctx.lineTo(32,64);ctx.closePath();ctx.stroke();
 const texture=new T.CanvasTexture(canvas);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=4;return texture;
}
