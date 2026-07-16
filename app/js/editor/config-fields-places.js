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

export const PLACE_OVERLAY_FIELDS = Object.freeze([
selectField({
    id: 'building_type',
    label: 'Building Type',
    helpText: 'Choose the building use or shell type that best matches how the feature should read in the world.',
    options: [
      { value: 'yes', label: 'Generic Building' },
      { value: 'residential', label: 'Residential' },
      { value: 'commercial', label: 'Commercial' },
      { value: 'retail', label: 'Retail' },
      { value: 'industrial', label: 'Industrial' },
      { value: 'school', label: 'School' },
      { value: 'hospital', label: 'Hospital' },
      { value: 'hotel', label: 'Hotel' }
    ],
    advancedMapping: [
      { path: 'tags.building', label: 'Building tag' }
    ],
    readValue: (feature) => getTag(feature, 'building') || 'yes',
    applyValue: (feature, value) => setTag(feature, 'building', value || 'yes', 40),
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  numberField({
    id: 'building_levels',
    label: 'Building Levels',
    helpText: 'Preferred when you know the floor count more confidently than the absolute height.',
    example: '6',
    min: 0,
    max: 250,
    step: 1,
    advancedMapping: [
      { path: 'threeD.buildingLevels', label: '3D level count' },
      { path: 'tags.building:levels', label: 'Building levels tag' }
    ],
    readValue: (feature) => Number.isFinite(Number(feature?.threeD?.buildingLevels)) ? String(feature.threeD.buildingLevels) : getTag(feature, 'building:levels'),
    applyValue: (feature, value) => {
      const next = normalizeNumberInput(value, { min: 0, max: 250 });
      const threeD = ensureThreeD(feature);
      threeD.buildingLevels = Number.isFinite(next) ? Math.round(next) : null;
      if (threeD.buildingLevels == null) delete threeD.buildingLevels;
      setNumericTag(feature, 'building:levels', threeD.buildingLevels);
    },
    summarize: (value) => value ? `${value} levels` : ''
  }),
  numberField({
    id: 'height',
    label: 'Height',
    helpText: 'Use measured or well-estimated height in meters when available.',
    example: '22.5',
    units: 'm',
    min: 0,
    max: 1200,
    step: 0.1,
    advancedMapping: [
      { path: 'threeD.height', label: '3D height' },
      { path: 'tags.height', label: 'Height tag' }
    ],
    readValue: (feature) => Number.isFinite(Number(feature?.threeD?.height)) ? String(feature.threeD.height) : getTag(feature, 'height'),
    applyValue: (feature, value) => {
      const next = normalizeNumberInput(value, { min: 0, max: 1200 });
      const threeD = ensureThreeD(feature);
      threeD.height = Number.isFinite(next) ? next : null;
      if (threeD.height == null) delete threeD.height;
      setNumericTag(feature, 'height', threeD.height, { precision: 1 });
    },
    summarize: (value) => value ? `${value} m tall` : ''
  }),
  numberField({
    id: 'min_height',
    label: 'Min Height',
    helpText: 'Use when the visible building or path starts above ground, such as an arcade or elevated deck.',
    example: '4',
    units: 'm',
    min: 0,
    max: 200,
    step: 0.1,
    advancedMapping: [
      { path: 'threeD.minHeight', label: '3D minimum height' },
      { path: 'tags.min_height', label: 'Minimum height tag' }
    ],
    readValue: (feature) => Number.isFinite(Number(feature?.threeD?.minHeight)) ? String(feature.threeD.minHeight) : getTag(feature, 'min_height'),
    applyValue: (feature, value) => {
      const next = normalizeNumberInput(value, { min: 0, max: 200 });
      const threeD = ensureThreeD(feature);
      threeD.minHeight = Number.isFinite(next) ? next : 0;
      setNumericTag(feature, 'min_height', threeD.minHeight, { precision: 1 });
    },
    summarize: (value) => Number(value) > 0 ? `Starts ${value} m above grade` : ''
  }),
  selectField({
    id: 'building_part_kind',
    label: 'Building Part',
    helpText: 'Use this for elevated or partial building sections such as roofs, balconies, canopies, or skywalk-like connectors.',
    options: [
      { value: 'part', label: 'General Part' },
      { value: 'roof', label: 'Roof Part' },
      { value: 'balcony', label: 'Balcony' },
      { value: 'canopy', label: 'Canopy / Skywalk' }
    ],
    advancedMapping: [
      { path: 'tags.building:part', label: 'Building part tag' }
    ],
    readValue: (feature) => getTag(feature, 'building:part') || 'part',
    applyValue: (feature, value) => setTag(feature, 'building:part', value || 'part', 40),
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  numberField({
    id: 'building_min_level',
    label: 'Min Levels',
    helpText: 'Use this when the building part starts several floors above the ground and you know the floor count more clearly than the meter height.',
    example: '1',
    min: 0,
    max: 120,
    step: 1,
    advancedMapping: [
      { path: 'tags.building:min_level', label: 'Building minimum level tag' }
    ],
    readValue: (feature) => getTag(feature, 'building:min_level'),
    applyValue: (feature, value) => setNumericTag(feature, 'building:min_level', normalizeNumberInput(value, { min: 0, max: 120 })),
    summarize: (value) => value ? `Starts above ${value} levels` : ''
  }),
  textField({
    id: 'part_level',
    label: 'Part Level',
    helpText: 'Use the specific level for roofs or balconies when the part belongs to a known floor.',
    example: '3',
    advancedMapping: [
      { path: 'tags.level', label: 'OSM level tag' }
    ],
    readValue: (feature) => getTag(feature, 'level'),
    applyValue: (feature, value) => setTag(feature, 'level', value, 40),
    summarize: (value) => value ? `Part level ${sanitizeText(value, 40)}` : ''
  }),
  selectField({
    id: 'roof_shape',
    label: 'Roof Type',
    helpText: 'Use a roof type when it is clearly visible and improves the 3D shell.',
    options: [
      { value: 'flat', label: 'Flat' },
      { value: 'gabled', label: 'Gabled' },
      { value: 'hipped', label: 'Hipped' },
      { value: 'shed', label: 'Shed' },
      { value: 'dome', label: 'Dome' }
    ],
    advancedMapping: [
      { path: 'threeD.roofShape', label: '3D roof shape' },
      { path: 'tags.roof:shape', label: 'Roof shape tag' }
    ],
    readValue: (feature) => sanitizeText(feature?.threeD?.roofShape || getTag(feature, 'roof:shape') || 'flat', 40).toLowerCase() || 'flat',
    applyValue: (feature, value) => {
      const cleanValue = sanitizeText(value, 40).toLowerCase() || 'flat';
      const threeD = ensureThreeD(feature);
      threeD.roofShape = cleanValue;
      setTag(feature, 'roof:shape', cleanValue, 40);
    },
    summarize: (value, field) => {
      const label = field.options.find((entry) => entry.value === value)?.label || value;
      return label && label !== 'Flat' ? `${label} roof` : '';
    }
  }),
  textField({
    id: 'indoor_shell_levels',
    label: 'Shell Levels',
    helpText: 'Optional scaffold for future interior editing. Add comma-separated levels to mark this building as level-aware.',
    example: 'B1, 0, 1, 2',
    advancedMapping: [
      { path: 'relations.indoorShell.enabled', label: 'Indoor shell flag' },
      { path: 'relations.indoorShell.levels[]', label: 'Indoor shell levels' }
    ],
    readValue: (feature) => getIndoorShellLevels(feature),
    applyValue: (feature, value) => setIndoorShellLevels(feature, value),
    summarize: (value) => value ? `Shell levels ${sanitizeText(value, 80)}` : ''
  }),
  selectField({
    id: 'parking_type',
    label: 'Parking Type',
    helpText: 'Use the form that best matches how vehicles are stored here.',
    options: [
      { value: 'surface', label: 'Surface Lot' },
      { value: 'multi-storey', label: 'Multi-storey' },
      { value: 'underground', label: 'Underground' },
      { value: 'street_side', label: 'Street Side' }
    ],
    advancedMapping: [
      { path: 'tags.amenity', label: 'Amenity tag' },
      { path: 'tags.parking', label: 'Parking subtype tag' }
    ],
    readValue: (feature) => getTag(feature, 'parking') || 'surface',
    applyValue: (feature, value) => {
      setTag(feature, 'amenity', 'parking', 40);
      setTag(feature, 'parking', value || 'surface', 40);
    },
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  selectField({
    id: 'water_kind',
    label: 'Water Type',
    helpText: 'Describe what kind of water body or water area this overlay represents.',
    options: [
      { value: 'pond', label: 'Pond' },
      { value: 'lake', label: 'Lake' },
      { value: 'reservoir', label: 'Reservoir' },
      { value: 'basin', label: 'Basin' },
      { value: 'canal', label: 'Canal' }
    ],
    advancedMapping: [
      { path: 'tags.natural', label: 'Natural tag' },
      { path: 'tags.water', label: 'Water subtype tag' }
    ],
    readValue: (feature) => getTag(feature, 'water') || 'pond',
    applyValue: (feature, value) => {
      setTag(feature, 'natural', 'water', 40);
      setTag(feature, 'water', value || 'pond', 40);
    },
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  selectField({
    id: 'park_kind',
    label: 'Landuse / Park Type',
    helpText: 'Choose the outdoor use that best matches how the area should read in the world.',
    options: [
      { value: 'park', label: 'Park' },
      { value: 'garden', label: 'Garden' },
      { value: 'recreation_ground', label: 'Recreation Ground' },
      { value: 'plaza', label: 'Plaza' },
      { value: 'forest', label: 'Forest' }
    ],
    advancedMapping: [
      { path: 'tags.leisure', label: 'Leisure tag' },
      { path: 'tags.landuse', label: 'Landuse tag' },
      { path: 'tags.natural', label: 'Natural tag' }
    ],
    readValue: (feature) => {
      if (getTag(feature, 'leisure')) return getTag(feature, 'leisure');
      if (getTag(feature, 'landuse')) return getTag(feature, 'landuse');
      if (getTag(feature, 'natural') === 'wood') return 'forest';
      return 'park';
    },
    applyValue: (feature, value) => {
      const cleanValue = sanitizeText(value, 40).toLowerCase() || 'park';
      const tags = ensureTags(feature);
      delete tags.leisure;
      delete tags.landuse;
      delete tags.natural;
      delete tags.highway;
      delete tags.area;
      if (cleanValue === 'park') {
        tags.leisure = 'park';
        tags.landuse = 'recreation_ground';
      } else if (cleanValue === 'garden') {
        tags.leisure = 'garden';
      } else if (cleanValue === 'recreation_ground') {
        tags.landuse = 'recreation_ground';
      } else if (cleanValue === 'plaza') {
        tags.highway = 'pedestrian';
        tags.area = 'yes';
      } else if (cleanValue === 'forest') {
        tags.landuse = 'forest';
        tags.natural = 'wood';
      }
    },
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  textField({
    id: 'tree_species',
    label: 'Species',
    helpText: 'Optional species or genus label when it is known and useful.',
    example: 'oak',
    advancedMapping: [
      { path: 'tags.species', label: 'Species tag' }
    ],
    readValue: (feature) => getTag(feature, 'species'),
    applyValue: (feature, value) => setTag(feature, 'species', value, 80),
    summarize: (value) => value ? sanitizeText(value, 80) : ''
  }),
  selectField({
    id: 'poi_kind',
    label: 'POI Type',
    helpText: 'Choose the public-facing kind of point this should appear as in the world.',
    options: [
      { value: 'attraction', label: 'Attraction' },
      { value: 'viewpoint', label: 'Viewpoint' },
      { value: 'information', label: 'Information' },
      { value: 'cafe', label: 'Cafe' },
      { value: 'restaurant', label: 'Restaurant' },
      { value: 'toilets', label: 'Toilets' },
      { value: 'shop', label: 'Shop' },
      { value: 'artwork', label: 'Artwork' },
      { value: 'marker', label: 'Generic Marker' }
    ],
    advancedMapping: [
      { path: 'tags.tourism', label: 'Tourism tag' },
      { path: 'tags.amenity', label: 'Amenity tag' },
      { path: 'tags.shop', label: 'Shop tag' }
    ],
    readValue: (feature) => {
      if (getTag(feature, 'shop')) return 'shop';
      if (getTag(feature, 'amenity')) return getTag(feature, 'amenity');
      if (getTag(feature, 'tourism')) return getTag(feature, 'tourism');
      return 'marker';
    },
    applyValue: (feature, value) => {
      const cleanValue = sanitizeText(value, 40).toLowerCase() || 'marker';
      const tags = ensureTags(feature);
      delete tags.tourism;
      delete tags.amenity;
      delete tags.shop;
      if (cleanValue === 'shop') tags.shop = 'yes';
      else if (['cafe', 'restaurant', 'toilets'].includes(cleanValue)) tags.amenity = cleanValue;
      else if (cleanValue === 'marker') tags.tourism = 'information';
      else tags.tourism = cleanValue;
    },
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  selectField({
    id: 'entrance_type',
    label: 'Entrance Type',
    helpText: 'Use the entrance type that best describes how people should access the building or shell.',
    options: [
      { value: 'main', label: 'Main' },
      { value: 'yes', label: 'Generic' },
      { value: 'service', label: 'Service' },
      { value: 'staircase', label: 'Stair Entrance' },
      { value: 'emergency', label: 'Emergency' }
    ],
    advancedMapping: [
      { path: 'tags.entrance', label: 'Entrance tag' }
    ],
    readValue: (feature) => getTag(feature, 'entrance') || 'yes',
    applyValue: (feature, value) => setTag(feature, 'entrance', value || 'yes', 40),
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  selectField({
    id: 'room_type',
    label: 'Room Type',
    helpText: 'Choose the indoor room use so reviewers understand the intended shell and later interior semantics.',
    options: [
      { value: 'generic', label: 'Generic Room' },
      { value: 'office', label: 'Office' },
      { value: 'classroom', label: 'Classroom' },
      { value: 'retail', label: 'Retail' },
      { value: 'lobby', label: 'Lobby' },
      { value: 'utility', label: 'Utility' },
      { value: 'restroom', label: 'Restroom' },
      { value: 'storage', label: 'Storage' }
    ],
    advancedMapping: [
      { path: 'tags.indoor', label: 'Indoor tag' },
      { path: 'tags.room', label: 'Room type tag' }
    ],
    readValue: (feature) => getTag(feature, 'room') || 'generic',
    applyValue: (feature, value) => {
      setTag(feature, 'indoor', 'room', 40);
      setTag(feature, 'room', value || 'generic', 40);
    },
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  selectField({
    id: 'corridor_type',
    label: 'Corridor Type',
    helpText: 'Use corridor when the geometry marks shared circulation rather than a room shell.',
    options: [
      { value: 'corridor', label: 'Corridor' },
      { value: 'hall', label: 'Hall' },
      { value: 'concourse', label: 'Concourse' }
    ],
    advancedMapping: [
      { path: 'tags.indoor', label: 'Indoor tag' },
      { path: 'tags.corridor', label: 'Corridor subtype tag' }
    ],
    readValue: (feature) => getTag(feature, 'corridor') || 'corridor',
    applyValue: (feature, value) => {
      setTag(feature, 'indoor', 'corridor', 40);
      if ((value || 'corridor') === 'corridor') deleteIfEmpty(ensureTags(feature), 'corridor');
      else setTag(feature, 'corridor', value, 40);
    },
    summarize: (value, field) => field.options.find((entry) => entry.value === value)?.label || value
  }),
  textField({
    id: 'level',
    label: 'Level',
    helpText: 'Required for indoor features and useful for entrances. Use values like 0, 1, 2, B1, or L2.',
    example: '0',
    advancedMapping: [
      { path: 'relations.level', label: 'Overlay level relation' },
      { path: 'level', label: 'Top-level level index' }
    ],
    readValue: (feature) => getRelationValue(feature, 'level') || sanitizeText(feature?.level || '', 40),
    applyValue: (feature, value) => setLevelValue(feature, value),
    summarize: (value) => value ? `Level ${sanitizeText(value, 40)}` : ''
  }),
  textField({
    id: 'building_ref',
    label: 'Building Reference',
    helpText: 'Link indoor or entrance features back to the shell they belong to when the relationship matters.',
    example: 'overlay_building_123',
    advancedMapping: [
      { path: 'relations.buildingRef', label: 'Parent building ref' },
      { path: 'buildingRef', label: 'Top-level building ref' }
    ],
    readValue: (feature) => getRelationValue(feature, 'buildingRef') || sanitizeText(feature?.buildingRef || '', 180),
    applyValue: (feature, value) => setBuildingRefValue(feature, value),
    summarize: (value) => value ? `Building ${sanitizeText(value, 60)}` : ''
  }),
  textField({
    id: 'connector_levels',
    label: 'Served Levels',
    helpText: 'Comma-separated levels this stairs or elevator connects. This is scaffold data for the future interior editor.',
    example: '0, 1, 2',
    advancedMapping: [
      { path: 'threeD.stairs[] / threeD.elevators[]', label: 'Served level lists' }
    ],
    readValue: (feature) => {
      const presetId = sanitizeText(feature?.presetId || '', 80).toLowerCase();
      if (presetId === 'elevator') return getConnectorLevels(feature, 'elevators');
      return getConnectorLevels(feature, 'stairs');
    },
    applyValue: (feature, value) => {
      const presetId = sanitizeText(feature?.presetId || '', 80).toLowerCase();
      if (presetId === 'elevator') setConnectorLevels(feature, 'elevators', value);
      else setConnectorLevels(feature, 'stairs', value);
    },
    summarize: (value) => value ? `Serves ${sanitizeText(value, 80)}` : ''
  }),
  textareaField({
    id: 'contributor_note',
    label: 'Contributor Note',
    helpText: 'Optional review context for moderators. Explain uncertain geometry, source evidence, or why this overlay is needed.',
    example: 'Added the missing side entrance and corrected the building shell height from on-site photos.',
    advancedMapping: [
      { path: 'submission.contributorNote', label: 'Submission note' }
    ],
    readValue: (feature) => sanitizeText(feature?.submission?.contributorNote || '', 320),
    applyValue: (feature, value) => {
      if (!feature.submission || typeof feature.submission !== 'object') feature.submission = {};
      feature.submission.contributorNote = sanitizeText(value, 320);
    },
    summarize: () => ''
  })
]);
