const TYPE_BYTES = Object.freeze({
  3: 2,
  4: 4
});
const REQUIRED_TAGS = new Set([
  256,
  257,
  258,
  259,
  273,
  277,
  278,
  279,
  322,
  323,
  324,
  325,
  339
]);

function readValues(view, entryOffset, type, count, littleEndian) {
  const bytesPerValue = TYPE_BYTES[type];
  if (!bytesPerValue) throw new Error(`unsupported TIFF field type ${type}`);
  const byteLength = bytesPerValue * count;
  const valueOffset = byteLength <= 4
    ? entryOffset + 8
    : view.getUint32(entryOffset + 8, littleEndian);
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const offset = valueOffset + index * bytesPerValue;
    values.push(type === 3
      ? view.getUint16(offset, littleEndian)
      : view.getUint32(offset, littleEndian));
  }
  return values;
}

export function decodeUncompressedFloat32Tiff(bytes) {
  const buffer = bytes instanceof Uint8Array
    ? bytes
    : new Uint8Array(bytes);
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );
  const byteOrder = String.fromCharCode(view.getUint8(0), view.getUint8(1));
  const littleEndian = byteOrder === 'II';
  if (!littleEndian && byteOrder !== 'MM') {
    throw new Error('TIFF byte order is invalid');
  }
  if (view.getUint16(2, littleEndian) !== 42) {
    throw new Error('TIFF magic value is invalid');
  }
  const ifdOffset = view.getUint32(4, littleEndian);
  const entryCount = view.getUint16(ifdOffset, littleEndian);
  const fields = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    const tag = view.getUint16(entryOffset, littleEndian);
    if (!REQUIRED_TAGS.has(tag)) continue;
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    fields.set(tag, readValues(
      view,
      entryOffset,
      type,
      count,
      littleEndian
    ));
  }
  const scalar = (tag) => Number(fields.get(tag)?.[0]);
  const width = scalar(256);
  const height = scalar(257);
  const bitsPerSample = scalar(258);
  const compression = scalar(259);
  const samplesPerPixel = scalar(277);
  const sampleFormat = scalar(339);
  const stripOffsets = fields.get(273) || [];
  const stripByteCounts = fields.get(279) || [];
  const tileWidth = scalar(322);
  const tileHeight = scalar(323);
  const tileOffsets = fields.get(324) || [];
  const tileByteCounts = fields.get(325) || [];
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error('TIFF dimensions are invalid');
  }
  if (
    bitsPerSample !== 32 ||
    compression !== 1 ||
    samplesPerPixel !== 1 ||
    sampleFormat !== 3
  ) {
    throw new Error(
      'TIFF must be uncompressed, single-band IEEE Float32'
    );
  }
  const values = new Float32Array(width * height);
  if (
    stripOffsets.length > 0 &&
    stripOffsets.length === stripByteCounts.length
  ) {
    let outputIndex = 0;
    for (let strip = 0; strip < stripOffsets.length; strip += 1) {
      const start = stripOffsets[strip];
      const end = start + stripByteCounts[strip];
      for (
        let offset = start;
        offset + 4 <= end && outputIndex < values.length;
        offset += 4
      ) {
        values[outputIndex++] = view.getFloat32(offset, littleEndian);
      }
    }
    if (outputIndex !== values.length) {
      throw new Error(
        `TIFF contains ${outputIndex} of ${values.length} expected samples`
      );
    }
  } else if (
    Number.isInteger(tileWidth) &&
    Number.isInteger(tileHeight) &&
    tileOffsets.length > 0 &&
    tileOffsets.length === tileByteCounts.length
  ) {
    const tilesAcross = Math.ceil(width / tileWidth);
    for (let tileIndex = 0; tileIndex < tileOffsets.length; tileIndex += 1) {
      const tileColumn = tileIndex % tilesAcross;
      const tileRow = Math.floor(tileIndex / tilesAcross);
      const start = tileOffsets[tileIndex];
      const expectedBytes = tileWidth * tileHeight * 4;
      if (tileByteCounts[tileIndex] < expectedBytes) {
        throw new Error('TIFF tile byte count is incomplete');
      }
      for (let row = 0; row < tileHeight; row += 1) {
        const outputRow = tileRow * tileHeight + row;
        if (outputRow >= height) break;
        for (let column = 0; column < tileWidth; column += 1) {
          const outputColumn = tileColumn * tileWidth + column;
          if (outputColumn >= width) break;
          const sourceIndex = row * tileWidth + column;
          values[outputRow * width + outputColumn] = view.getFloat32(
            start + sourceIndex * 4,
            littleEndian
          );
        }
      }
    }
  } else {
    throw new Error('TIFF strip/tile table is invalid');
  }
  return Object.freeze({ width, height, values });
}
