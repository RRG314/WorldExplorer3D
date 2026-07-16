import {
  deleteIfEmpty,
  ensureTags,
  ensureThreeD,
  getConnectorLevels,
  getIndoorShellLevels,
  getRelationValue,
  getTag,
  normalizeBoolean,
  normalizeNumberInput,
  numberField,
  sanitizeText,
  selectField,
  setBooleanTag,
  setBuildingRefValue,
  setConnectorLevels,
  setIndoorShellLevels,
  setLevelValue,
  setNumericTag,
  setTag,
  textField,
  textareaField,
  toggleField
} from './config-core.js?v=1';

export const TRANSPORT_OVERLAY_FIELDS = Object.freeze([
textField({
    id: 'name',
    label: 'Name',
    helpText: 'Public-facing name shown in labels, review summaries, and point markers when relevant.',
    example: 'Union Station',
    advancedMapping: [
      { path: 'tags.name', label: 'Name tag' }
    ],
    readValue: (feature) => getTag(feature, 'name'),
    applyValue: (feature, value) => setTag(feature, 'name', value, 120),
    summarize: (value) => sanitizeText(value || '', 120)
  }),
  textField({
    id: 'ref',
    label: 'Reference',
    helpText: 'Short code or room/reference label used to identify the feature without a full public name.',
    example: 'A-214',
    advancedMapping: [
      { path: 'tags.ref', label: 'Reference tag' }
    ],
    readValue: (feature) => getTag(feature, 'ref'),
    applyValue: (feature, value) => setTag(feature, 'ref', value, 80),
    summarize: (value) => value ? `Ref ${sanitizeText(value, 80)}` : ''
  }),
  selectField({
    id: 'road_class',
    label: 'Road Class',
    helpText: 'Choose the road hierarchy that best matches how this segment behaves in the world.',
    example: 'residential',
    options: [
      { value: 'residential', label: 'Residential', description: 'Local neighborhood roads.' },
      { value: 'service', label: 'Service', description: 'Access roads, alleys, and service areas.' },
      { value: 'living_street', label: 'Living Street', description: 'Pedestrian-priority shared streets.' },
      { value: 'tertiary', label: 'Tertiary', description: 'Minor connector roads.' },
      { value: 'secondary', label: 'Secondary', description: 'Important connectors or district roads.' },
      { value: 'primary', label: 'Primary', description: 'Major through roads.' }
    ],
    advancedMapping: [
      { path: 'tags.highway', label: 'Road class tag' }
    ],
    readValue: (feature) => getTag(feature, 'highway') || 'residential',
    applyValue: (feature, value) => setTag(feature, 'highway', value, 40),
    summarize: (value, field) => value ? `${field.options.find((entry) => entry.value === value)?.label || value} road` : ''
  }),
  numberField({
    id: 'lanes',
    label: 'Lanes',
    helpText: 'Use the total lane count when it is known and materially affects traversal or rendering.',
    example: '2',
    min: 1,
    max: 16,
    step: 1,
    advancedMapping: [
      { path: 'tags.lanes', label: 'Lane count tag' }
    ],
    readValue: (feature) => getTag(feature, 'lanes'),
    applyValue: (feature, value) => setNumericTag(feature, 'lanes', normalizeNumberInput(value, { min: 1, max: 16 })),
    summarize: (value) => value ? `${value} lanes` : ''
  }),
  toggleField({
    id: 'oneway',
    label: 'One Way',
    helpText: 'Enable when movement on this segment should be interpreted in a single direction.',
    advancedMapping: [
      { path: 'tags.oneway', label: 'Directionality tag' }
    ],
    readValue: (feature) => getTag(feature, 'oneway') === 'yes',
    applyValue: (feature, value) => {
      const enabled = normalizeBoolean(value);
      setBooleanTag(feature, 'oneway', enabled);
    },
    summarize: (value) => value ? 'One way' : ''
  }),
  selectField({
    id: 'surface',
    label: 'Surface',
    helpText: 'Surface helps rendering, accessibility review, and route interpretation.',
    example: 'asphalt',
    options: [
      { value: 'asphalt', label: 'Asphalt' },
      { value: 'paved', label: 'Paved' },
      { value: 'concrete', label: 'Concrete' },
      { value: 'gravel', label: 'Gravel' },
      { value: 'dirt', label: 'Dirt' },
      { value: 'grass', label: 'Grass' },
      { value: 'ballast', label: 'Ballast' },
      { value: 'wood', label: 'Wood' }
    ],
    advancedMapping: [
      { path: 'tags.surface', label: 'Surface tag' },
      { path: 'threeD.surface', label: 'Render surface' }
    ],
    readValue: (feature) => feature?.threeD?.surface || getTag(feature, 'surface'),
    applyValue: (feature, value) => {
      const cleanValue = sanitizeText(value, 60).toLowerCase();
      setTag(feature, 'surface', cleanValue, 60);
      const threeD = ensureThreeD(feature);
      if (!cleanValue) delete threeD.surface;
      else threeD.surface = cleanValue;
    },
    summarize: (value) => value ? `${sanitizeText(value, 40)} surface` : ''
  }),
  toggleField({
    id: 'bridge',
    label: 'Bridge',
    helpText: 'Use this when the feature is elevated over another traversable feature or terrain.',
    advancedMapping: [
      { path: 'threeD.bridge', label: 'Bridge flag' },
      { path: 'tags.bridge', label: 'Bridge tag' }
    ],
    readValue: (feature) => feature?.threeD?.bridge === true,
    applyValue: (feature, value) => {
      const enabled = normalizeBoolean(value);
      const threeD = ensureThreeD(feature);
      threeD.bridge = enabled;
      setBooleanTag(feature, 'bridge', enabled);
    },
    summarize: (value) => value ? 'Bridge' : ''
  }),
  toggleField({
    id: 'tunnel',
    label: 'Tunnel',
    helpText: 'Use this when the feature passes under terrain or another structure.',
    advancedMapping: [
      { path: 'threeD.tunnel', label: 'Tunnel flag' },
      { path: 'tags.tunnel', label: 'Tunnel tag' }
    ],
    readValue: (feature) => feature?.threeD?.tunnel === true,
    applyValue: (feature, value) => {
      const enabled = normalizeBoolean(value);
      const threeD = ensureThreeD(feature);
      threeD.tunnel = enabled;
      setBooleanTag(feature, 'tunnel', enabled);
    },
    summarize: (value) => value ? 'Tunnel' : ''
  }),
  numberField({
    id: 'layer',
    label: 'Layer',
    helpText: 'Layer helps order stacked roads, paths, bridges, tunnels, and indoor connectors.',
    example: '1',
    step: 1,
    min: -5,
    max: 12,
    advancedMapping: [
      { path: 'threeD.layer', label: 'Render layer' },
      { path: 'tags.layer', label: 'Layer tag' }
    ],
    readValue: (feature) => Number.isFinite(Number(feature?.threeD?.layer)) ? String(feature.threeD.layer) : '0',
    applyValue: (feature, value) => {
      const next = normalizeNumberInput(value, { min: -5, max: 12 });
      const threeD = ensureThreeD(feature);
      threeD.layer = Number.isFinite(next) ? Math.round(next) : 0;
      setNumericTag(feature, 'layer', threeD.layer);
    },
    summarize: (value) => String(value || '0') !== '0' ? `Layer ${value}` : ''
  }),
  selectField({
    id: 'footway_type',
    label: 'Footpath Type',
    helpText: 'Choose the pedestrian use that best matches how this path is intended to work.',
    options: [
      { value: 'sidewalk', label: 'Sidewalk' },
      { value: 'crossing', label: 'Crossing' },
      { value: 'path', label: 'Path' },
      { value: 'pedestrian', label: 'Pedestrian Way' }
    ],
    advancedMapping: [
      { path: 'tags.highway', label: 'Pedestrian class tag' },
      { path: 'tags.footway', label: 'Footway subtype tag' }
    ],
    readValue: (feature) => getTag(feature, 'footway') || getTag(feature, 'highway') || 'sidewalk',
    applyValue: (feature, value) => {
      const cleanValue = sanitizeText(value, 40).toLowerCase() || 'sidewalk';
      setTag(feature, 'highway', cleanValue === 'pedestrian' ? 'pedestrian' : 'footway', 40);
      if (cleanValue === 'pedestrian') deleteIfEmpty(ensureTags(feature), 'footway');
      else setTag(feature, 'footway', cleanValue, 40);
    },
    summarize: (value) => value ? sanitizeText(value, 40) : ''
  }),
  selectField({
    id: 'cycleway_type',
    label: 'Bike Path Type',
    helpText: 'Describe how bicycle traffic should be treated on this segment.',
    options: [
      { value: 'cycleway', label: 'Dedicated Cycleway' },
      { value: 'shared_path', label: 'Shared Path' },
      { value: 'lane', label: 'Bike Lane' }
    ],
    advancedMapping: [
      { path: 'tags.highway', label: 'Path class tag' },
      { path: 'tags.bicycle', label: 'Bicycle access tag' },
      { path: 'tags.cycleway', label: 'Cycleway subtype tag' }
    ],
    readValue: (feature) => {
      if (getTag(feature, 'cycleway')) return getTag(feature, 'cycleway');
      if (getTag(feature, 'highway') === 'cycleway') return 'cycleway';
      return 'cycleway';
    },
    applyValue: (feature, value) => {
      const cleanValue = sanitizeText(value, 40).toLowerCase() || 'cycleway';
      setTag(feature, 'bicycle', 'designated', 40);
      if (cleanValue === 'cycleway') {
        setTag(feature, 'highway', 'cycleway', 40);
        deleteIfEmpty(ensureTags(feature), 'cycleway');
      } else {
        setTag(feature, 'highway', 'path', 40);
        setTag(feature, 'cycleway', cleanValue === 'shared_path' ? 'shared' : cleanValue, 40);
      }
    },
    summarize: (value) => value ? sanitizeText(value, 40) : ''
  }),
  selectField({
    id: 'access',
    label: 'Access',
    helpText: 'Use access when the feature is restricted, staff-only, customers-only, or otherwise not open to everyone.',
    options: [
      { value: 'yes', label: 'Public' },
      { value: 'permissive', label: 'Permissive' },
      { value: 'customers', label: 'Customers' },
      { value: 'private', label: 'Private' },
      { value: 'no', label: 'No Access' }
    ],
    advancedMapping: [
      { path: 'tags.access', label: 'Access tag' }
    ],
    readValue: (feature) => getTag(feature, 'access') || 'yes',
    applyValue: (feature, value) => setTag(feature, 'access', value || 'yes', 40),
    summarize: (value, field) => value && value !== 'yes'
      ? field.options.find((entry) => entry.value === value)?.label || value
      : ''
  }),
  selectField({
    id: 'railway_type',
    label: 'Railway Type',
    helpText: 'Describe the rail service being represented so routing and visualization stay clear.',
    options: [
      { value: 'rail', label: 'Rail' },
      { value: 'light_rail', label: 'Light Rail' },
      { value: 'tram', label: 'Tram' },
      { value: 'subway', label: 'Subway' }
    ],
    advancedMapping: [
      { path: 'tags.railway', label: 'Railway type tag' }
    ],
    readValue: (feature) => getTag(feature, 'railway') || 'rail',
    applyValue: (feature, value) => setTag(feature, 'railway', value || 'rail', 40),
    summarize: (value) => value ? sanitizeText(value.replace('_', ' '), 40) : ''
  }),
  selectField({
    id: 'electrified',
    label: 'Electrified',
    helpText: 'Optional detail for rail lines when power infrastructure meaningfully affects the feature.',
    options: [
      { value: 'no', label: 'No' },
      { value: 'yes', label: 'Yes' }
    ],
    advancedMapping: [
      { path: 'tags.electrified', label: 'Electrified tag' }
    ],
    readValue: (feature) => getTag(feature, 'electrified') || 'no',
    applyValue: (feature, value) => setTag(feature, 'electrified', value || 'no', 40),
    summarize: (value) => value === 'yes' ? 'Electrified' : ''
  }),
]);
