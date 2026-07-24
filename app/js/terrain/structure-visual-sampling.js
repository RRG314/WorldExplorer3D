function sampleStructureVisualPolyline(points, spacing = 4, cornerDegrees = 12) {
  if (!Array.isArray(points) || points.length < 3) return Array.isArray(points) ? points.slice() : [];
  const targetSpacing = Math.max(0.5, Number(spacing) || 4);
  const cornerDot = Math.cos(Math.max(1, Number(cornerDegrees) || 12) * Math.PI / 180);
  const sampled = [points[0]];
  let accumulated = 0;

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const next = points[index + 1];
    const incomingX = point.x - previous.x;
    const incomingZ = point.z - previous.z;
    const outgoingX = next.x - point.x;
    const outgoingZ = next.z - point.z;
    const incomingLength = Math.hypot(incomingX, incomingZ);
    const outgoingLength = Math.hypot(outgoingX, outgoingZ);
    accumulated += incomingLength;
    const directionDot = incomingLength > 1e-6 && outgoingLength > 1e-6
      ? (incomingX * outgoingX + incomingZ * outgoingZ) / (incomingLength * outgoingLength)
      : 1;
    if (accumulated < targetSpacing && directionDot >= cornerDot) continue;
    sampled.push(point);
    accumulated = 0;
  }

  const last = points[points.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

export { sampleStructureVisualPolyline };
