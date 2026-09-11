import {
  selectGroundArtifacts
} from './ground-provider-registry.js?v=3';
import {
  loadGroundArtifact
} from './ground-artifact.js?v=4';
import {
  geographicToWebMercatorMeters
} from './source-contract.js?v=2';
import {
  sampleDistrictGroundMeters
} from '../world/compiler/district-ground-model.js?v=2';

function freezeState(state) {
  return Object.freeze({
    generation: Number(state.generation || 0),
    status: String(state.status || 'blocked'),
    reason: state.reason ? String(state.reason) : null,
    location: state.location
      ? Object.freeze({ ...state.location })
      : null,
    artifactId: state.artifactId ? String(state.artifactId) : null,
    providerId: state.providerId ? String(state.providerId) : null,
    sourceRelease: state.sourceRelease ? String(state.sourceRelease) : null,
    verticalDatum: state.verticalDatum ? String(state.verticalDatum) : null,
    contentSha256: state.contentSha256
      ? String(state.contentSha256)
      : null,
    artifactCount: Number(state.artifactCount || 0),
    artifactIds: Object.freeze([...(state.artifactIds || [])].map(String)),
    contentSha256s: Object.freeze([...(state.contentSha256s || [])].map(String))
  });
}

function locationRecord(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError('latitude must be a finite value from -90 through 90');
  }
  if (!Number.isFinite(lon)) {
    throw new TypeError('longitude must be finite');
  }
  return Object.freeze({ latitude: lat, longitude: lon });
}

function unavailable(reason, state, details = {}) {
  return Object.freeze({
    status: 'unavailable',
    reason,
    artifactId: state.artifactId,
    verticalDatum: state.verticalDatum,
    ...details
  });
}

export function createAcceptedGroundRuntime(options = {}) {
  const loadArtifact = typeof options.loadArtifact === 'function'
    ? options.loadArtifact
    : loadGroundArtifact;
  const artifactUrlForManifest =
    typeof options.artifactUrlForManifest === 'function'
      ? options.artifactUrlForManifest
      : (manifest) => manifest?.url || manifest?.artifactUrl || '';
  const worldToLatLon = typeof options.worldToLatLon === 'function'
    ? options.worldToLatLon
    : null;

  let generation = 0;
  let activeArtifacts = [];
  let state = freezeState({
    generation,
    status: 'blocked',
    reason: 'no-ground-artifacts-configured'
  });

  const publish = (next) => {
    state = freezeState({ generation, ...next });
    return state;
  };

  const clear = (reason = 'cleared') => {
    generation += 1;
    activeArtifacts = [];
    return publish({ status: 'blocked', reason });
  };

  const sampleAtLatLon = (latitude, longitude) => {
    const location = locationRecord(latitude, longitude);
    if (activeArtifacts.length === 0 || state.status !== 'accepted') {
      return unavailable('accepted-ground-not-active', state);
    }
    const projected = geographicToWebMercatorMeters(
      location.latitude,
      location.longitude
    );
    for (const activeArtifact of activeArtifacts) {
      const sample = sampleDistrictGroundMeters(
        activeArtifact.model,
        projected.eastingMeters,
        projected.northingMeters
      );
      if (sample.status !== 'available') continue;
      return Object.freeze({
        ...sample,
        artifactId: activeArtifact.artifactId,
        providerId: activeArtifact.providerId,
        sourceRelease: activeArtifact.sourceRelease,
        verticalDatum: activeArtifact.verticalDatum,
        latitude: location.latitude,
        longitude: location.longitude,
        eastingMeters: projected.eastingMeters,
        northingMeters: projected.northingMeters
      });
    }
    return unavailable('outside-accepted-ground-stack', state, {
      latitude: location.latitude,
      longitude: location.longitude,
      eastingMeters: projected.eastingMeters,
      northingMeters: projected.northingMeters
    });
  };

  const sampleAtWorldXZ = (x, z) => {
    if (!worldToLatLon) {
      return unavailable('world-transform-not-configured', state);
    }
    const worldX = Number(x);
    const worldZ = Number(z);
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
      throw new TypeError('world coordinates must be finite');
    }
    const geographic = worldToLatLon(worldX, worldZ);
    return sampleAtLatLon(geographic.lat, geographic.lon);
  };

  const verifyCoverage = (locations = []) => {
    if (!Array.isArray(locations) || locations.length === 0) {
      return Object.freeze({
        status: 'rejected',
        reason: 'coverage-probes-required',
        unavailable: Object.freeze([])
      });
    }
    const missing = [];
    locations.forEach((location, index) => {
      const sample = sampleAtLatLon(
        location?.latitude ?? location?.lat,
        location?.longitude ?? location?.lon
      );
      if (sample.status !== 'available') {
        missing.push(Object.freeze({
          index,
          reason: sample.reason,
          latitude: Number(location?.latitude ?? location?.lat),
          longitude: Number(location?.longitude ?? location?.lon)
        }));
      }
    });
    return Object.freeze({
      status: missing.length === 0 ? 'accepted' : 'rejected',
      reason: missing.length === 0 ? null : 'incomplete-runtime-coverage',
      unavailable: Object.freeze(missing)
    });
  };

  const prepare = async ({
    latitude,
    longitude,
    manifests = [],
    coverageProbes = null,
    signal = null
  } = {}) => {
    const location = locationRecord(latitude, longitude);
    const requestGeneration = ++generation;
    activeArtifacts = [];
    const selection = selectGroundArtifacts({
      latitude: location.latitude,
      longitude: location.longitude,
      manifests
    });
    if (selection.status !== 'accepted') {
      return publish({
        status: 'blocked',
        reason: selection.reason,
        location
      });
    }

    const manifestsWithUrls = selection.manifests.map((manifest) => ({
      manifest,
      url: String(artifactUrlForManifest(manifest) || '')
    }));
    const missingUrl = manifestsWithUrls.find((entry) => !entry.url);
    if (missingUrl) {
      return publish({
        status: 'rejected',
        reason: 'artifact-url-missing',
        location,
        artifactId: missingUrl.manifest.artifactId,
        providerId: missingUrl.manifest.providerId
      });
    }

    publish({
      status: 'loading',
      reason: null,
      location,
      artifactId: selection.manifests[0].artifactId,
      providerId: selection.provider.id,
      artifactCount: selection.manifests.length,
      artifactIds: selection.manifests.map((manifest) => manifest.artifactId)
    });
    const loadedArtifacts = [];
    try {
      for (const entry of manifestsWithUrls) {
        const loaded = await loadArtifact({
          manifest: entry.manifest,
          url: entry.url,
          signal
        });
        if (loaded?.status !== 'accepted') {
          activeArtifacts = [];
          return publish({
            status: 'rejected',
            reason: loaded?.reason || 'artifact-load-rejected',
            location,
            artifactId: entry.manifest.artifactId,
            providerId: entry.manifest.providerId,
            artifactCount: selection.manifests.length,
            artifactIds: selection.manifests.map((manifest) => manifest.artifactId)
          });
        }
        loadedArtifacts.push(loaded);
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      if (requestGeneration !== generation) {
        return freezeState({
          generation: requestGeneration,
          status: 'superseded',
          reason: 'newer-ground-request-active',
          location,
          artifactId: selection.manifests[0].artifactId,
          providerId: selection.provider.id
        });
      }
      activeArtifacts = [];
      return publish({
        status: 'rejected',
        reason: 'artifact-load-threw',
        location,
        artifactId: selection.manifests[0].artifactId,
        providerId: selection.provider.id
      });
    }
    if (signal?.aborted) throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException(String(signal.reason || 'Accepted ground load aborted'), 'AbortError');
    if (requestGeneration !== generation) {
      return freezeState({
        generation: requestGeneration,
        status: 'superseded',
        reason: 'newer-ground-request-active',
        location,
        artifactId: selection.manifests[0].artifactId,
        providerId: selection.provider.id
      });
    }
    activeArtifacts = loadedArtifacts;
    const primary = activeArtifacts[0];
    publish({
      status: 'accepted',
      reason: null,
      location,
      artifactId: primary.artifactId,
      providerId: primary.providerId,
      sourceRelease: primary.sourceRelease,
      verticalDatum: primary.verticalDatum,
      contentSha256: primary.contentSha256,
      artifactCount: activeArtifacts.length,
      artifactIds: activeArtifacts.map((artifact) => artifact.artifactId),
      contentSha256s: activeArtifacts.map((artifact) => artifact.contentSha256)
    });

    const probes = Array.isArray(coverageProbes) && coverageProbes.length > 0
      ? coverageProbes
      : [location];
    const coverage = verifyCoverage(probes);
    if (coverage.status !== 'accepted') {
      activeArtifacts = [];
      return publish({
        status: 'rejected',
        reason: coverage.reason,
        location,
        artifactId: primary.artifactId,
        providerId: primary.providerId,
        sourceRelease: primary.sourceRelease,
        verticalDatum: primary.verticalDatum,
        contentSha256: primary.contentSha256,
        artifactCount: loadedArtifacts.length,
        artifactIds: loadedArtifacts.map((artifact) => artifact.artifactId),
        contentSha256s: loadedArtifacts.map((artifact) => artifact.contentSha256)
      });
    }
    return state;
  };

  return Object.freeze({
    clear,
    prepare,
    sampleAtLatLon,
    sampleAtWorldXZ,
    snapshot: () => state,
    verifyCoverage
  });
}
