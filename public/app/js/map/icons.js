import { ctx as appCtx } from "../shared-context.js?v=55";

function drawMapPlayerIcons(ctx, w, h, isLarge, view) {
  const { worldToScreen, mx, my } = view;
  const iconSize = isLarge ? 16 : 8;

  if (appCtx.droneMode && isLarge) {
    const carPos = worldToScreen(appCtx.car.x, appCtx.car.z);
    if (Math.abs(carPos.x - mx) < w / 2 && Math.abs(carPos.y - my) < h / 2) {
      ctx.save();
      ctx.translate(carPos.x, carPos.y);
      ctx.rotate(appCtx.car.angle);
      ctx.fillStyle = "#f36";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -iconSize);
      ctx.lineTo(-iconSize / 2, iconSize);
      ctx.lineTo(iconSize / 2, iconSize);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  if (appCtx.droneMode) {
    drawDroneIcon(ctx, mx, my, iconSize, isLarge);
  } else if (appCtx.Walk && appCtx.Walk.state.mode === "walk") {
    drawWalkerIcon(ctx, mx, my, iconSize, isLarge);
  } else {
    drawCarIcon(ctx, mx, my, iconSize, isLarge);
  }
}

function drawDroneIcon(ctx, mx, my, iconSize, isLarge) {
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(-appCtx.drone.yaw);
  ctx.fillStyle = "#0cf";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = isLarge ? 3 : 2;
  ctx.beginPath();
  ctx.arc(0, 0, iconSize * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-iconSize / 2, -iconSize / 2);
  ctx.lineTo(iconSize / 2, iconSize / 2);
  ctx.moveTo(iconSize / 2, -iconSize / 2);
  ctx.lineTo(-iconSize / 2, iconSize / 2);
  ctx.stroke();
  ctx.restore();
}

function drawWalkerIcon(ctx, mx, my, iconSize, isLarge) {
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(-appCtx.Walk.state.walker.angle);
  ctx.fillStyle = "#4488ff";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = isLarge ? 3 : 2;
  ctx.beginPath();
  ctx.arc(0, -iconSize / 2, iconSize / 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -iconSize / 6);
  ctx.lineTo(0, iconSize / 2);
  ctx.moveTo(-iconSize / 3, 0);
  ctx.lineTo(iconSize / 3, 0);
  ctx.moveTo(0, iconSize / 2);
  ctx.lineTo(-iconSize / 4, iconSize);
  ctx.moveTo(0, iconSize / 2);
  ctx.lineTo(iconSize / 4, iconSize);
  ctx.stroke();
  ctx.restore();
}

function drawCarIcon(ctx, mx, my, iconSize, isLarge) {
  ctx.save();
  ctx.translate(mx, my);

  const speed = Math.sqrt(appCtx.car.vx * appCtx.car.vx + appCtx.car.vz * appCtx.car.vz);
  const directionAngle = speed > 0.1 ? Math.atan2(appCtx.car.vx, -appCtx.car.vz) : appCtx.car.angle;
  ctx.rotate(directionAngle);

  ctx.fillStyle = "#f36";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = isLarge ? 3 : 2;
  ctx.beginPath();
  ctx.moveTo(0, -iconSize);
  ctx.lineTo(-iconSize / 2, iconSize);
  ctx.lineTo(iconSize / 2, iconSize);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMapCompass(ctx, w, h, isLarge) {
  const compassSize = isLarge ? 40 : 25;
  const compassX = isLarge ? w - compassSize - 15 : w - compassSize - 8;
  const compassY = isLarge ? compassSize + 15 : compassSize + 8;

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = isLarge ? 2 : 1.5;
  ctx.beginPath();
  ctx.arc(compassX, compassY, compassSize / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.translate(compassX, compassY);
  ctx.fillStyle = "#ff4444";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = isLarge ? 2 : 1;
  ctx.beginPath();
  ctx.moveTo(0, -compassSize / 2.5);
  ctx.lineTo(-compassSize / 6, compassSize / 6);
  ctx.lineTo(0, 0);
  ctx.lineTo(compassSize / 6, compassSize / 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = `bold ${isLarge ? 14 : 10}px Arial`;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = isLarge ? 3 : 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeText("N", 0, -compassSize / 3.5);
  ctx.fillText("N", 0, -compassSize / 3.5);
  ctx.restore();
}

export { drawMapCompass, drawMapPlayerIcons };
