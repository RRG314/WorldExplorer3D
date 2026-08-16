const GEOLOCATION_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 120000
});

function geolocationErrorMessage(error) {
  const code = Number(error?.code);
  if (code === 1) return 'Location access denied. You can still pick a location manually.';
  if (code === 2) return 'Could not determine your location. Try again or choose manually.';
  if (code === 3) return 'Location request timed out. Try again or choose manually.';
  return 'Could not determine your location. You can still choose manually.';
}

function requestCurrentPosition(geolocation = globalThis.navigator?.geolocation) {
  return new Promise((resolve, reject) => {
    if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') {
      reject({ userMessage: 'Geolocation is not supported in this browser.' });
      return;
    }
    geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position?.coords?.latitude);
        const lon = Number(position?.coords?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          reject({ userMessage: 'Could not determine your location. Try again or choose manually.' });
          return;
        }
        resolve({ lat, lon });
      },
      (error) => reject({ ...error, userMessage: geolocationErrorMessage(error) }),
      GEOLOCATION_OPTIONS
    );
  });
}

function clampDetectedCoords(lat, lon) {
  const safeLat = Math.max(-90, Math.min(90, Number(lat) || 0));
  let safeLon = Number(lon) || 0;
  while (safeLon > 180) safeLon -= 360;
  while (safeLon < -180) safeLon += 360;
  return { lat: safeLat, lon: safeLon };
}

export {
  GEOLOCATION_OPTIONS,
  clampDetectedCoords,
  geolocationErrorMessage,
  requestCurrentPosition
};
