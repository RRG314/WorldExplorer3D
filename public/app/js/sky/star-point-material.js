let starTexture = null;

function getRoundStarTexture() {
  if (starTexture) return starTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 18);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.98)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.42)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(32, 32, 18, 0, Math.PI * 2);
  ctx.fill();

  const horizontal = ctx.createLinearGradient(5, 32, 59, 32);
  horizontal.addColorStop(0, 'rgba(255,255,255,0)');
  horizontal.addColorStop(0.5, 'rgba(255,255,255,0.62)');
  horizontal.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = horizontal;
  ctx.beginPath();
  ctx.moveTo(5, 32);
  ctx.lineTo(32, 30.5);
  ctx.lineTo(59, 32);
  ctx.lineTo(32, 33.5);
  ctx.closePath();
  ctx.fill();

  const vertical = ctx.createLinearGradient(32, 8, 32, 56);
  vertical.addColorStop(0, 'rgba(255,255,255,0)');
  vertical.addColorStop(0.5, 'rgba(255,255,255,0.48)');
  vertical.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = vertical;
  ctx.beginPath();
  ctx.moveTo(32, 8);
  ctx.lineTo(30.8, 32);
  ctx.lineTo(32, 56);
  ctx.lineTo(33.2, 32);
  ctx.closePath();
  ctx.fill();

  starTexture = new THREE.CanvasTexture(canvas);
  starTexture.needsUpdate = true;
  return starTexture;
}

export function createRoundStarMaterial(options = {}) {
  return new THREE.PointsMaterial({
    ...options,
    map: options.map || getRoundStarTexture(),
    color: options.color || 0xffffff,
    alphaTest: Number.isFinite(options.alphaTest) ? options.alphaTest : 0.04,
    depthWrite: false
  });
}
