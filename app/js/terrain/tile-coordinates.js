import {
  decodeTerrariumRgb,
  geographicToXyzTile,
  xyzTileBounds
} from './source-contract.js?v=2';

function latLonToTileXY(lat, lon, z) {
  const tile = geographicToXyzTile(lat, lon, z);
  return {
    x: tile.x,
    y: tile.y,
    xf: tile.x + tile.xFraction,
    yf: tile.y + tile.yFraction
  };
}

function tileXYToLatLonBounds(x, y, z) {
  const bounds = xyzTileBounds(x, y, z);
  return {
    latN: bounds.north,
    latS: bounds.south,
    lonW: bounds.west,
    lonE: bounds.east
  };
}

function decodeTerrariumRGB(r, g, b) {
  return decodeTerrariumRgb(r, g, b);
}

export { decodeTerrariumRGB, latLonToTileXY, tileXYToLatLonBounds };
