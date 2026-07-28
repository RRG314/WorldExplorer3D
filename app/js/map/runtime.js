import { ctx as appCtx } from "../shared-context.js?v=55";
import { drawEarthBaseLayers } from "./earth-base.js?v=2";
import { drawEarthMarkerLayers } from "./earth-markers.js?v=2";
import { drawMapCompass, drawMapPlayerIcons } from "./icons.js?v=2";
import { drawMoonMap } from "./moon.js?v=1";
import {
  latLonToTile,
  loadTile,
  mapTileCacheSnapshot,
  resetMinimapView,
  resolveMapView,
  worldToScreenLarge
} from "./tiles.js?v=2";

const mctx = document.getElementById("minimap").getContext("2d");
const largeMapCtx = document.getElementById("largeMapCanvas").getContext("2d");
let minimapViewSnapshot = null;

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
  if (!isLarge) {
    const actor = view.worldToScreen(view.ref.x, view.ref.z);
    minimapViewSnapshot = {
      actorX: Number(actor.x.toFixed(2)),
      actorY: Number(actor.y.toFixed(2)),
      centerX: view.mx,
      centerY: view.my,
      zoom: view.zoom
    };
  }
  drawEarthBaseLayers(ctx, w, h, isLarge, view);
  drawEarthMarkerLayers(ctx, w, h, isLarge, view);
  drawMapPlayerIcons(ctx, w, h, isLarge, view);
  drawMapCompass(ctx, w, h, isLarge);
}

Object.assign(appCtx, {
  drawLargeMap,
  drawMapOnCanvas,
  drawMinimap,
  getMinimapViewSnapshot: () => minimapViewSnapshot,
  latLonToTile,
  loadTile,
  mapTileCacheSnapshot,
  resetMinimapView,
  worldToScreenLarge
});

export {
  drawLargeMap,
  drawMapOnCanvas,
  drawMinimap,
  latLonToTile,
  loadTile,
  mapTileCacheSnapshot,
  resetMinimapView,
  worldToScreenLarge
};
