// Constant-time support on an indexed THREE.PlaneGeometry rotated into XZ.
// Sampling the source height image again can differ by metres from the lower
// resolution rendered triangles, burying actors and equipment in the mesh.
export function createRenderedHeightGrid(geometry) {
  const positions = geometry?.attributes?.position;
  const columns = geometry?.parameters?.widthSegments, rows = geometry?.parameters?.heightSegments;
  if (!positions || !Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1
    || positions.count !== (columns+1)*(rows+1)) throw new TypeError('A regular XZ surface grid is required.');
  const stride = columns+1;
  const minX = positions.getX(0), maxX = positions.getX(columns);
  const minZ = positions.getZ(0), maxZ = positions.getZ(rows*stride);
  if (!(maxX > minX && maxZ > minZ)) throw new TypeError('Surface grid must increase along X and Z.');
  return (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z) || x < minX-.002 || x > maxX+.002 || z < minZ-.002 || z > maxZ+.002) return null;
    x = Math.max(minX, Math.min(maxX, x)); z = Math.max(minZ, Math.min(maxZ, z));
    let col = Math.min(columns-1, Math.floor((x-minX)/(maxX-minX)*columns));
    let row = Math.min(rows-1, Math.floor((z-minZ)/(maxZ-minZ)*rows));
    // Float32 vertex coordinates can put the arithmetic cell one step across
    // an edge. Correct against those actual coordinates before interpolation.
    if (col > 0 && x < positions.getX(col)) col--;
    else if (col < columns-1 && x > positions.getX(col+1)) col++;
    if (row > 0 && z < positions.getZ(row*stride)) row--;
    else if (row < rows-1 && z > positions.getZ((row+1)*stride)) row++;
    const a = row*stride+col, b = a+stride, d = a+1, c = b+1;
    const u = (x-positions.getX(a))/(positions.getX(d)-positions.getX(a));
    const v = (z-positions.getZ(a))/(positions.getZ(b)-positions.getZ(a));
    return u+v <= 1
      ? positions.getY(a)+u*(positions.getY(d)-positions.getY(a))+v*(positions.getY(b)-positions.getY(a))
      : positions.getY(c)+(1-u)*(positions.getY(b)-positions.getY(c))+(1-v)*(positions.getY(d)-positions.getY(c));
  };
}
