import { ctx as appCtx } from "../shared-context.js?v=55";

const terrainMapCache = new WeakMap();
function terrainMapRaster(surface,onMars) {
  const geometry=surface.geometry;
  const cached=terrainMapCache.get(geometry);
  if(cached?.version===geometry.attributes.position.version)return cached;
  geometry.computeBoundingBox();
  const bounds=geometry.boundingBox,positions=geometry.attributes.position;
  const width=(geometry.parameters.widthSegments||144)+1,height=(geometry.parameters.heightSegments||640)+1;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d'),pixels=context.createImageData(width,height);
  const relief=Math.max(1,bounds.max.y-bounds.min.y);
  for(let i=0;i<positions.count;i++) {
    const x=Math.round((positions.getX(i)-bounds.min.x)/(bounds.max.x-bounds.min.x)*(width-1));
    const z=Math.round((positions.getZ(i)-bounds.min.z)/(bounds.max.z-bounds.min.z)*(height-1));
    const shade=.28+.65*(positions.getY(i)-bounds.min.y)/relief,offset=(z*width+x)*4;
    pixels.data[offset]=Math.round((onMars?190:205)*shade);
    pixels.data[offset+1]=Math.round((onMars?120:205)*shade);
    pixels.data[offset+2]=Math.round((onMars?84:200)*shade);pixels.data[offset+3]=255;
  }
  context.putImageData(pixels,0,0);const result={canvas,bounds,version:positions.version};terrainMapCache.set(geometry,result);return result;
}

function drawMoonMap(ctx, w, h, isLarge) {
  const surface = appCtx.onMars ? appCtx.marsSurface : appCtx.onMoon ? appCtx.moonSurface : null;
  if (!surface) {
    return false;
  }

  const onMars = !!appCtx.onMars;
  ctx.fillStyle = onMars ? "#3b1710" : "#000000";
  ctx.fillRect(0, 0, w, h);

  const centerX = appCtx.Walk && appCtx.Walk.state.mode === "walk" ? appCtx.Walk.state.walker.x : appCtx.car.x;
  const centerZ = appCtx.Walk && appCtx.Walk.state.mode === "walk" ? appCtx.Walk.state.walker.z : appCtx.car.z;
  const mapRange = isLarge ? (onMars ? 6500 : 2000) : (onMars ? 1600 : 500);
  const raster=terrainMapRaster(surface,onMars),bounds=raster.bounds;
  const sx=w/(mapRange*2),sz=h/(mapRange*2);
  ctx.drawImage(raster.canvas,(bounds.min.x+surface.position.x-centerX)*sx+w/2,
    (bounds.min.z+surface.position.z-centerZ)*sz+h/2,
    (bounds.max.x-bounds.min.x)*sx,(bounds.max.z-bounds.min.z)*sz);

  drawMoonCompass(ctx, w, isLarge);
  drawMoonPlayer(ctx, w, h);
  if (!onMars) drawApollo11Marker(ctx, w, h, isLarge, centerX, centerZ, mapRange);
  else drawMarsLandmark(ctx, w, h, isLarge, centerX, centerZ, mapRange);

  ctx.fillStyle = "#ffffff";
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  ctx.fillText(onMars ? "OLYMPUS MONS" : "LUNAR TERRAIN", w / 2, 12);

  return true;
}

function drawMarsLandmark(ctx, w, h, isLarge, centerX, centerZ, mapRange) {
  const dx = -centerX;
  const dz = -centerZ;
  if (Math.abs(dx) >= mapRange || Math.abs(dz) >= mapRange) return;
  const x = dx / mapRange * (w / 2) + w / 2;
  const y = dz / mapRange * (h / 2) + h / 2;
  ctx.save();
  ctx.strokeStyle = '#ffd2b8';
  ctx.fillStyle = 'rgba(226, 111, 69, 0.35)';
  ctx.lineWidth = isLarge ? 3 : 2;
  ctx.beginPath();
  ctx.arc(x, y, isLarge ? 18 : 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (isLarge) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Olympus Mons summit', x, y + 34);
  }
  ctx.restore();
}

function drawMoonCompass(ctx, w, isLarge) {
  const compassSize = isLarge ? 40 : 25;
  const compassX = w - compassSize - 10;
  const compassY = compassSize + 10;

  ctx.save();
  ctx.translate(compassX, compassY);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, compassSize, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = `bold ${isLarge ? 14 : 10}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#ff4444";
  ctx.fillText("N", 0, -compassSize + 8);

  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.fillText("E", compassSize - 8, 0);
  ctx.fillText("S", 0, compassSize - 8);
  ctx.fillText("W", -compassSize + 8, 0);

  ctx.fillStyle = "#ff4444";
  ctx.beginPath();
  ctx.moveTo(0, -compassSize + 2);
  ctx.lineTo(-5, -compassSize + 12);
  ctx.lineTo(0, -compassSize + 8);
  ctx.lineTo(5, -compassSize + 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawMoonPlayer(ctx, w, h) {
  if (appCtx.Walk && appCtx.Walk.state.mode === "walk") {
    ctx.fillStyle = "#00ff00";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
    return;
  }

  ctx.save();
  ctx.translate(w / 2, h / 2);
  const speed = Math.sqrt(appCtx.car.vx * appCtx.car.vx + appCtx.car.vz * appCtx.car.vz);
  const directionAngle = speed > 0.1 ? Math.atan2(appCtx.car.vx, -appCtx.car.vz) : appCtx.car.angle;
  ctx.rotate(directionAngle);
  ctx.fillStyle = "#ff3333";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(-6, 6);
  ctx.lineTo(6, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawApollo11Marker(ctx, w, h, isLarge, centerX, centerZ, mapRange) {
  const apollo11X = 200;
  const apollo11Z = -500;
  const dx11 = apollo11X - centerX;
  const dz11 = apollo11Z - centerZ;

  if (!(Math.abs(dx11) < mapRange && Math.abs(dz11) < mapRange)) {
    return;
  }

  const screenX11 = dx11 / mapRange * (w / 2) + w / 2;
  const screenZ11 = dz11 / mapRange * (h / 2) + h / 2;
  const pulseTime = Date.now() / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(pulseTime * 3);
  const glowRadius = (isLarge ? 25 : 15) * (0.7 + pulse * 0.3);

  const gradient = ctx.createRadialGradient(screenX11, screenZ11, 0, screenX11, screenZ11, glowRadius);
  gradient.addColorStop(0, `rgba(212, 175, 55, ${0.8 * pulse})`);
  gradient.addColorStop(0.5, `rgba(212, 175, 55, ${0.3 * pulse})`);
  gradient.addColorStop(1, "rgba(212, 175, 55, 0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(screenX11, screenZ11, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(screenX11, screenZ11);
  ctx.fillStyle = "#d4af37";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const spikes = 5;
  const outerRadius = isLarge ? 12 : 8;
  const innerRadius = isLarge ? 6 : 4;
  for (let i = 0; i < spikes * 2; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = i * Math.PI / spikes;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (isLarge) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Apollo 11", 0, 25);
    ctx.font = "10px Arial";
    ctx.fillText("Landing Site", 0, 37);
  }

  ctx.restore();
}

export { drawMoonMap };
