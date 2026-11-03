// Archived USGS daily means. Regenerate only with a new versioned reference.
// Source response and hash are retained in app/data/hydrology/.
export const HYDROLOGY_REFERENCE = Object.freeze({
  id: 'usgs-01589300-daily-2024-01-v1',
  truthType: 'archived-public-gauge',
  stationId: 'USGS-01589300',
  stationName: 'Gwynns Falls at Villa Nova, Maryland',
  sourceUrl:
    'https://api.waterdata.usgs.gov/ogcapi/v1/collections/daily/items?f=json&monitoring_location_id=USGS-01589300&parameter_code=00060&statistic_id=00003&time=2024-01-01%2F2024-01-03&limit=10',
  retrievedAt: '2026-11-03T05:55:17.894Z',
  sha256: '076ba22a1404d9b4f637f26ea5e5963402d1f5aa5d6fb66b315b9e6883723766',
  unit: 'ft^3/s',
  statistic: 'daily-mean',
  parameterCode: '00060',
  observations: [
    {
      date: '2024-01-01',
      value: 27.3,
      approval: 'Approved',
      lastModified: '2025-02-24T12:46:11.002487+00:00',
    },
    {
      date: '2024-01-02',
      value: 25.2,
      approval: 'Approved',
      lastModified: '2025-02-24T12:46:11.002487+00:00',
    },
    {
      date: '2024-01-03',
      value: 24.2,
      approval: 'Approved',
      lastModified: '2025-02-24T12:46:11.002487+00:00',
    },
  ],
  limit:
    'Historical daily means at a different real river, not contemporaneous measurements or a cause of the virtual training reach.',
});
