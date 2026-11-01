// Polygon construction and readers share this precision boundary. Keep it
// independent of the polygon engine so a read-only query need not load Clipper.
export const STREET_POLYGON_GRID_WORLD = 0.001;
