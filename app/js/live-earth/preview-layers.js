function normalizePreviewId(value) {
  return String(value || '').trim().toLowerCase();
}

export const STATIC_PREVIEW_LAYER_ITEMS = Object.freeze({
  'near-earth-objects': [
    {
      id: 'apophis',
      label: '99942 Apophis',
      meta: 'Close-approach awareness • April 2029',
      description: 'A well-known near-Earth asteroid used as a good public-awareness reference for close approach geometry.'
    },
    {
      id: 'bennu',
      label: '101955 Bennu',
      meta: 'OSIRIS-REx target',
      description: 'Useful for explaining how Earth-observation and asteroid science overlap in the near-Earth neighborhood.'
    },
    {
      id: 'didymos',
      label: '65803 Didymos',
      meta: 'DART target system',
      description: 'A practical reference object for impact-redirection research and public NEO education.'
    }
  ],
  'rocket-launches': [
    {
      id: 'cape-canaveral',
      label: 'Cape Canaveral',
      meta: 'Florida • Active orbital launch range',
      description: 'The primary US east-coast orbital range for crew, commercial, and science launches.'
    },
    {
      id: 'vandenberg',
      label: 'Vandenberg',
      meta: 'California • Polar launch corridor',
      description: 'A key west-coast launch region for polar and sun-synchronous missions.'
    },
    {
      id: 'kourou',
      label: 'Kourou',
      meta: 'French Guiana • Equatorial access',
      description: 'An equatorial launch site useful for geostationary and heavy-lift trajectories.'
    },
    {
      id: 'boca-chica',
      label: 'Starbase / Boca Chica',
      meta: 'Texas • Test + launch development',
      description: 'A modern launch-development region useful for following heavy-lift testing and coastal operations.'
    }
  ],
  volcanoes: [
    {
      id: 'kilauea',
      label: 'Kilauea',
      meta: 'Hawaii • Shield volcano',
      description: 'A major basaltic volcanic system that is useful for broad public monitoring and travel awareness.'
    },
    {
      id: 'etna',
      label: 'Mount Etna',
      meta: 'Sicily • Persistent activity',
      description: 'One of the most recognizable active volcanic systems with frequent observatory reporting.'
    },
    {
      id: 'popocatepetl',
      label: 'Popocatepetl',
      meta: 'Mexico • Populated-region impact',
      description: 'Important for showing how volcanic monitoring connects to nearby city populations.'
    },
    {
      id: 'fagradalsfjall',
      label: 'Fagradalsfjall',
      meta: 'Iceland • Rift activity',
      description: 'A good example of modern fissure-style volcanic events that capture global attention.'
    }
  ],
  ships: [
    {
      id: 'singapore-port',
      label: 'Port of Singapore',
      meta: 'Global shipping hub',
      description: 'A major maritime node for explaining why marine traffic layers matter at planetary scale.'
    },
    {
      id: 'rotterdam',
      label: 'Port of Rotterdam',
      meta: 'North Sea gateway',
      description: 'A high-value port region for European shipping and coastal logistics context.'
    },
    {
      id: 'los-angeles',
      label: 'Los Angeles / Long Beach',
      meta: 'Pacific cargo corridor',
      description: 'A strong west-coast reference region for container traffic and port operations.'
    }
  ],
  aircraft: [
    {
      id: 'atlanta',
      label: 'Atlanta',
      meta: 'Global hub airport region',
      description: 'A major passenger hub that helps explain dense flight-corridor activity.'
    },
    {
      id: 'heathrow',
      label: 'London Heathrow',
      meta: 'Transatlantic connector',
      description: 'Useful for understanding long-haul corridor concentration and European airspace density.'
    },
    {
      id: 'dubai',
      label: 'Dubai',
      meta: 'Long-haul transfer hub',
      description: 'A strong midpoint example for global east-west aviation flows.'
    }
  ],
  'live-media': [
    {
      id: 'times-square',
      label: 'Times Square',
      meta: 'High-visibility city media node',
      description: 'A good example of the kind of public-viewing location a curated live-media layer can surface.'
    },
    {
      id: 'shibuya',
      label: 'Shibuya Crossing',
      meta: 'Dense public-facing urban scene',
      description: 'Represents places where a curated camera or media window system makes sense.'
    },
    {
      id: 'monaco-harbor',
      label: 'Monaco Harbor',
      meta: 'Waterfront event region',
      description: 'Shows how scenic waterfront places can anchor future public media windows.'
    }
  ]
});

export function previewLayerItems(ctx, state, layerId = '') {
  if (layerId === 'space-weather') {
    const localWeather = typeof ctx.appCtx.getWeatherSnapshot === 'function' ? ctx.appCtx.getWeatherSnapshot() : null;
    const look = state.localSatelliteLook;
    const visibleState = look && Number.isFinite(look.elevationDeg)
      ? (look.elevationDeg >= 0 ? 'Selected satellite is above your local horizon.' : 'Selected satellite is below your local horizon right now.')
      : 'Open Satellites to check above-horizon passes for your current world location.';
    return [
      {
        id: 'orbital-context',
        label: 'Orbital Context',
        meta: `${ctx.filteredSatelliteItems(state).length} curated satellites loaded`,
        description: 'Use the curated orbital catalog to understand when overhead passes or weather-satellite coverage matter for your current place.'
      },
      {
        id: 'local-sky',
        label: 'Local Sky Readiness',
        meta: visibleState,
        description: 'Live Earth now ties local sky visibility, horizon checks, and orbital context together in one place.'
      },
      {
        id: 'viewing-conditions',
        label: 'Viewing Conditions',
        meta: localWeather ? `${localWeather.conditionLabel || 'Weather'} • ${Math.round(localWeather.cloudCover || 0)}% clouds` : 'Waiting on local weather',
        description: 'Cloud cover, haze, and local visibility still matter for any sky-based observing or space-weather awareness.'
      }
    ];
  }
  if (layerId === 'wildfires') {
    return ctx.fireWeatherSamples(state).slice(0, 6).map((sample) => ({
      id: sample.id,
      label: sample.label,
      meta: `Risk ${sample.fireRisk} • ${sample.snapshot?.conditionLabel || 'Dry pattern'} • wind ${Math.round(sample.snapshot?.windMph || 0)} mph`,
      description: 'This beta wildfire preview is currently a fire-weather watchpoint layer based on heat, dryness, and wind in the sampled region.'
    }));
  }
  return STATIC_PREVIEW_LAYER_ITEMS[layerId] || [];
}

function previewSelection(ctx, state, layerId = '') {
  const items = previewLayerItems(ctx, state, layerId);
  const selectedId = normalizePreviewId(state.previewSelections?.[layerId] || '');
  return items.find((entry) => normalizePreviewId(entry.id) === selectedId) || items[0] || null;
}

export function setPreviewSelection(ctx, state, layerId = '', itemId = '') {
  if (!state.previewSelections || typeof state.previewSelections !== 'object') {
    state.previewSelections = {};
  }
  state.previewSelections[layerId] = normalizePreviewId(itemId);
}

function relatedImplementedLayer(layerId = '') {
  if (['space-weather', 'near-earth-objects', 'rocket-launches'].includes(layerId)) return 'satellites';
  if (['volcanoes', 'wildfires'].includes(layerId)) return 'earthquakes';
  if (['ships', 'aircraft', 'live-media'].includes(layerId)) return 'weather';
  return '';
}

export function renderPreviewLayerDetails(ctx, state, layer) {
  const items = previewLayerItems(ctx, state, layer.id);
  const selected = previewSelection(ctx, state, layer.id);
  const relatedLayerId = relatedImplementedLayer(layer.id);
  const relatedLayer = relatedLayerId ? ctx.getLiveEarthLayer(relatedLayerId) : null;
  const list = items.length
    ? items.map((entry) => {
        const active = normalizePreviewId(entry.id) === normalizePreviewId(selected?.id) ? ' active' : '';
        return `<button class="globe-selector-live-list-item${active}" type="button" data-live-earth-action="select-preview" data-layer="${ctx.escapeHtml(layer.id)}" data-id="${ctx.escapeHtml(entry.id)}">
          <span>${ctx.escapeHtml(entry.label)}</span>
          <small>${ctx.escapeHtml(entry.meta || '')}</small>
        </button>`;
      }).join('')
    : '<div class="globe-selector-live-placeholder">No preview entries are available for this layer right now.</div>';
  ctx.setDetailsHtml(state, `
    <div class="globe-selector-live-detail-card">
      <div class="globe-selector-live-detail-heading">${ctx.escapeHtml(selected?.label || layer.label)}</div>
      <div class="globe-selector-live-detail-copy">${ctx.escapeHtml(selected?.description || layer.summary)}</div>
      <div class="globe-selector-live-detail-meta">${ctx.escapeHtml(selected?.meta || layer.localSummary || layer.summary)}</div>
      <div class="globe-selector-live-detail-meta">${ctx.escapeHtml(layer.localSummary || 'This preview layer is live in the UI now and ready for a future data-feed upgrade.')}</div>
      ${relatedLayer ? `
        <div class="globe-selector-live-detail-actions">
          <button class="globe-selector-live-action-btn secondary" type="button" data-live-earth-action="open-related-layer" data-id="${ctx.escapeHtml(relatedLayer.id)}">
            Open ${ctx.escapeHtml(relatedLayer.label)}
          </button>
        </div>
      ` : ''}
      <div class="globe-selector-live-list">${list}</div>
    </div>
  `);
}
