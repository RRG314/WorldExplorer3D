import assert from 'node:assert/strict';

// Explicit browser sensor fixture. Repeated CDP geolocation overrides emit a
// POSITION_UNAVAILABLE error between fixes in current Chrome, so they cannot
// represent an uninterrupted phone watch. This replaces only the sensor API;
// consent, freshness, accuracy, movement and field progress use shipped code.
export async function installGpsSensorFixture(page, initialFix) {
  await page.addInitScript(fix => {
    let current = fix, nextWatch = 1;
    const watches = new Map();
    const position = () => ({
      coords: { latitude: current.latitude, longitude: current.longitude,
        accuracy: current.accuracy ?? 6, altitude: null, altitudeAccuracy: null,
        heading: current.heading ?? 0, speed: current.speed ?? 0 },
      timestamp: Date.now()
    });
    const geolocation = {
      getCurrentPosition(success) { queueMicrotask(() => success(position())); },
      watchPosition(success, error) {
        const id = nextWatch++;
        watches.set(id, { success, error });
        queueMicrotask(() => { if (watches.has(id)) success(position()); });
        return id;
      },
      clearWatch(id) { watches.delete(id); }
    };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geolocation });
    Object.defineProperty(globalThis, '__WE3D_GPS_SENSOR_FIXTURE__', { value: {
      deliver(next) { current = next; for (const watch of watches.values()) watch.success(position()); },
      fail(code) { for (const watch of watches.values()) watch.error?.({ code, message: 'Injected sensor failure' }); },
      snapshot() { return { activeWatches: watches.size, input: 'simulated-browser-geolocation' }; }
    } });
  }, initialFix);
  return {
    async send(method, fix) {
      assert.equal(method, 'Emulation.setGeolocationOverride');
      assert.ok(Number.isFinite(fix.latitude) && Number.isFinite(fix.longitude));
      await page.evaluate(next => globalThis.__WE3D_GPS_SENSOR_FIXTURE__.deliver(next), fix);
    },
    async fail(code = 2) {
      assert.ok([1, 2, 3].includes(code));
      await page.evaluate(value => globalThis.__WE3D_GPS_SENSOR_FIXTURE__.fail(value), code);
    }
  };
}
