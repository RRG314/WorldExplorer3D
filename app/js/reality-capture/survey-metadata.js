// Private acquisition evidence only. Never treats camera position as a subject ID.
export function normalizeSurveyMetadata(raw = {}) {
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const lat = number(raw.latitude), lon = number(raw.longitude);
  const located = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const heading = number(raw.GPSImgDirection);
  const ref = raw.GPSImgDirectionRef;
  return {
    version: 1,
    location: located ? {latitude:lat, longitude:lon, source:'photo-gps', subjectLocation:false} : null,
    heading: heading !== null && heading >= 0 && heading < 360 && ['T','M','True North','Magnetic North'].includes(ref)
      ? {degrees:heading,reference:['T','True North'].includes(ref)?'true':'magnetic'} : null,
    // EXIF wall-clock dates do not necessarily include a timezone. Preserve that fact.
    capturedLocalTime: typeof raw.DateTimeOriginal === 'string' ? raw.DateTimeOriginal.slice(0,32) : null,
    orientation: Number.isInteger(raw.Orientation) && raw.Orientation >= 1 && raw.Orientation <= 8 ? raw.Orientation : null,
    width: number(raw.ExifImageWidth), height: number(raw.ExifImageHeight),
    locationStatus: located ? 'available' : 'unavailable',
    assignmentStatus: 'unassigned'
  };
}
