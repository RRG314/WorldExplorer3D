import { ctx as appCtx } from "../shared-context.js?v=55";
import { drawEarthBaseLayers } from "./earth-base.js?v=3";
import { drawEarthMarkerLayers } from "./earth-markers.js?v=2";
import { drawMapCompass, drawMapPlayerIcons } from "./icons.js?v=3";
import { drawMoonMap } from "./moon.js?v=1";
import { latLonToTile, loadTile, resolveMapView, worldToScreenLarge } from "./tiles.js?v=2";

const mctx = document.getElementById("minimap").getContext("2d");
const largeMapCtx = document.getElementById("largeMapCanvas").getContext("2d");

function drawMinimap() {
  drawMapOnCanvas(mctx, 150, 150, false);
}

function drawLargeMap() {
  drawMapOnCanvas(largeMapCtx, 800, 800, true);
}

function drawMapOnCanvas(ctx, w, h, isLarge) {
  if (drawMoonMap(ctx, w, h, isLarge)) {
    return;
  }

  const view = resolveMapView(w, h, isLarge);
  drawEarthBaseLayers(ctx, w, h, isLarge, view);
  drawEarthMarkerLayers(ctx, w, h, isLarge, view);
  drawMapPlayerIcons(ctx, w, h, isLarge, view);
  drawMapCompass(ctx, w, h, isLarge);
}

Object.assign(appCtx, {
  drawLargeMap,
  drawMapOnCanvas,
  drawMinimap,
  latLonToTile,
  loadTile,
  worldToScreenLarge
});

export {
  drawLargeMap,
  drawMapOnCanvas,
  drawMinimap,
  latLonToTile,
  loadTile,
  worldToScreenLarge
};
