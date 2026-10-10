let guidedRequested = false;
export function requestGuidedJourney() { guidedRequested = true; }
export function consumeGuidedJourney() { const value = guidedRequested; guidedRequested = false; return value; }

// This resumes a place, not an exact actor pose or a cloud save.
export function readReturnPlace(storage, key, locations = {}) {
  try {
    const raw = storage.getItem(key) || 'null';
    if (raw.length > 8192) return null;
    const saved = JSON.parse(raw);
    if (!saved || !['earth', 'ocean', 'moon', 'mars', 'space'].includes(saved.launchMode)) return null;
    const place = saved.selLoc === 'custom' ? saved.customLoc : Object.hasOwn(locations, saved.selLoc) ? locations[saved.selLoc] : null;
    if (!place || typeof place.lat !== 'number' || typeof place.lon !== 'number' || !Number.isFinite(place.lat) || !Number.isFinite(place.lon) || Math.abs(place.lat) > 90 || Math.abs(place.lon) > 180) return null;
    const name = saved.launchMode === 'moon' ? 'the Moon' : saved.launchMode === 'mars' ? 'Mars'
      : saved.launchMode === 'space' ? 'space' : String(place.name || 'your last place').slice(0, 100);
    return { record: saved, name };
  } catch { return null; }
}
