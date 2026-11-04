// Reviewed OSM building footprints; geography never grants real access.
export const CERN_SITE_REFERENCE = Object.freeze([
  {
    id: 'cern-science-gateway',
    label: 'Science Gateway \u00b7 Meyrin',
    sourceBuildingId: 'way/1062199727',
    // Reviewed against the loaded authoritative Overture polygon on 2026-11-03:
    // bidirectional edge error 0.241 m, area ratio 1.0056. The normal exact-ID
    // and <=2.5 m footprint admission checks still apply on every visit.
    sourceAliases: ['overture:84e55483-0bbf-45b7-92e2-4d8d7b952048'],
    buildingLabel: 'CERN Reception (82)',
    sourceVersion: 6,
    footprint: [
      {
        lat: 46.2333588,
        lon: 6.0566833,
      },
      {
        lat: 46.2333782,
        lon: 6.0566097,
      },
      {
        lat: 46.2333914,
        lon: 6.0566206,
      },
      {
        lat: 46.2335528,
        lon: 6.0567098,
      },
      {
        lat: 46.2335728,
        lon: 6.0566426,
      },
      {
        lat: 46.2335929,
        lon: 6.0565719,
      },
      {
        lat: 46.233617,
        lon: 6.0564868,
      },
      {
        lat: 46.2336313,
        lon: 6.0564345,
      },
      {
        lat: 46.2336597,
        lon: 6.0564489,
      },
      {
        lat: 46.2338942,
        lon: 6.0565909,
      },
      {
        lat: 46.2339498,
        lon: 6.0566226,
      },
      {
        lat: 46.2338759,
        lon: 6.0568943,
      },
      {
        lat: 46.2339227,
        lon: 6.0569209,
      },
      {
        lat: 46.2340022,
        lon: 6.0569661,
      },
      {
        lat: 46.2339825,
        lon: 6.0570405,
      },
      {
        lat: 46.2338522,
        lon: 6.0569645,
      },
      {
        lat: 46.2338145,
        lon: 6.0570969,
      },
      {
        lat: 46.2334968,
        lon: 6.0569089,
      },
      {
        lat: 46.2335312,
        lon: 6.0567846,
      },
      {
        lat: 46.2333712,
        lon: 6.0566899,
      },
    ],
    footprintSource: 'https://www.openstreetmap.org/way/1062199727',
    footprintLicense: 'ODbL-1.0',
    referenceUrl: 'https://visit.cern/science-gateway',
    scope:
      'Virtual interpretive training spaces at a mapped facility; not a real access permit or surveyed operational floor plan.',
  },
  {
    id: 'cms-point-five',
    label: 'CMS Point 5 \u00b7 Cessy',
    sourceBuildingId: 'way/97132779',
    // Reviewed loaded Overture alias: 0.295 m edge error, 1.0006 area ratio.
    sourceAliases: ['overture:a50c684e-b954-470b-a365-71db93925c35'],
    buildingLabel: 'SX5 \u00b7 building 3585',
    sourceVersion: 7,
    footprint: [
      {
        lat: 46.3097653,
        lon: 6.0783604,
      },
      {
        lat: 46.3097892,
        lon: 6.0781885,
      },
      {
        lat: 46.3098201,
        lon: 6.0779664,
      },
      {
        lat: 46.3098728,
        lon: 6.0775868,
      },
      {
        lat: 46.3098842,
        lon: 6.077505,
      },
      {
        lat: 46.3099145,
        lon: 6.0772869,
      },
      {
        lat: 46.3099303,
        lon: 6.0771731,
      },
      {
        lat: 46.310016,
        lon: 6.0765569,
      },
      {
        lat: 46.3098315,
        lon: 6.0765043,
      },
      {
        lat: 46.3098,
        lon: 6.0764919,
      },
      {
        lat: 46.3097217,
        lon: 6.0770284,
      },
      {
        lat: 46.309685,
        lon: 6.0772924,
      },
      {
        lat: 46.3096585,
        lon: 6.0774711,
      },
      {
        lat: 46.309576,
        lon: 6.0774467,
      },
      {
        lat: 46.3095439,
        lon: 6.0776816,
      },
      {
        lat: 46.3096321,
        lon: 6.0777022,
      },
      {
        lat: 46.3096029,
        lon: 6.0779093,
      },
      {
        lat: 46.3095482,
        lon: 6.0782972,
      },
    ],
    footprintSource: 'https://www.openstreetmap.org/way/97132779',
    footprintLicense: 'ODbL-1.0',
    referenceUrl: 'https://cms.cern/interact-with-cms/on-site-visits',
    scope:
      'Virtual interpretive training spaces at a mapped facility; not a real access permit or surveyed operational floor plan.',
  },
]);
