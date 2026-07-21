import { aircraftService } from '../geospatial/aircraft.js?v=1';
import { marineService } from '../geospatial/marine.js?v=1';
import { operationalFeedService } from '../geospatial/operational-feeds.js?v=1';
import { streetImageryService } from '../geospatial/street-imagery.js?v=1';

function ageLabel(timestamp, now = Date.now()) {
  const ageMs = Math.max(0, Number(now) - Number(timestamp || 0));
  if (!timestamp) return 'never';
  if (ageMs < 60 * 1000) return 'under 1 min ago';
  if (ageMs < 60 * 60 * 1000) return `${Math.floor(ageMs / 60000)} min ago`;
  return `${Math.floor(ageMs / 3600000)} hr ago`;
}

function describeProviderHealth(snapshot, providerId, now = Date.now()) {
  const provider = snapshot?.providers?.find((entry) => entry.id === providerId);
  if (!provider) return Object.freeze({ providerId, status: 'unavailable', label: 'Provider unavailable' });
  const cacheLabel = provider.cachedQueries ? `${provider.cachedQueries} cached` : 'cache empty';
  if (provider.status === 'loading') {
    return Object.freeze({ ...provider, label: `Loading · ${cacheLabel}` });
  }
  if (provider.status === 'ready') {
    return Object.freeze({ ...provider, label: `Healthy · updated ${ageLabel(provider.lastSuccessAt, now)} · ${cacheLabel}` });
  }
  if (provider.status === 'degraded') {
    const success = provider.lastSuccessAt ? `last good ${ageLabel(provider.lastSuccessAt, now)}` : 'no successful response';
    return Object.freeze({ ...provider, label: `Degraded · ${success} · ${cacheLabel}` });
  }
  if (provider.status === 'failed') {
    return Object.freeze({ ...provider, label: `Failed ${ageLabel(provider.lastFailureAt, now)} · ${cacheLabel}` });
  }
  return Object.freeze({ ...provider, label: `Not requested · ${cacheLabel}` });
}

function collectLiveEarthProviderHealth(state, now = Date.now()) {
  const operational = operationalFeedService.diagnostics();
  const street = streetImageryService.diagnostics();
  const marine = marineService.diagnostics();
  const aircraft = aircraftService.inspect();
  const streetProvider = state?.streetImageryProviderId || 'panoramax';
  return Object.freeze({
    satellites: describeProviderHealth(operational, 'celestrak-gp', now),
    earthquakes: describeProviderHealth(operational, 'usgs-earthquakes-day', now),
    weather: describeProviderHealth(operational, 'open-meteo-current', now),
    streetImagery: describeProviderHealth(street, streetProvider, now),
    aircraft: describeProviderHealth(aircraft, 'opensky', now),
    marineModel: describeProviderHealth(marine, 'open-meteo-marine', now),
    marineObservation: describeProviderHealth(marine, 'noaa-water-level', now)
  });
}

export { ageLabel, collectLiveEarthProviderHealth, describeProviderHealth };
