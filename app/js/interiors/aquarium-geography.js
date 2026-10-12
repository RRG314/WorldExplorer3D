// OSM relation 14162263 v4: union of its six public building outlines.
// ODbL-1.0 / OpenStreetMap contributors. Geometry is a geographic envelope,
// not permission to enter any roof, bridge, service area or other component.
export const AQUARIUM_GEOGRAPHY = Object.freeze({
  "id": "national-aquarium-baltimore",
  "sourceId": "overture:7bacec0b-326a-401f-ad9f-f3ebed72c8cf",
  "sourceUrl": "https://www.openstreetmap.org/relation/14162263",
  "revision": "osm-r14162263-v4-overture-2026-09-23",
  "entrance": {
    "id": "osm-node-4390760200",
    "lat": 39.2854979,
    "lon": -76.608518
  },
  "component": [
    {
      "lat": 39.28594291790881,
      "lon": -76.60810589790344
    },
    {
      "lat": 39.28563981863567,
      "lon": -76.6080790758133
    },
    {
      "lat": 39.28574777195183,
      "lon": -76.60823464393616
    },
    {
      "lat": 39.28563981863567,
      "lon": -76.60835266113281
    },
    {
      "lat": 39.28559414602873,
      "lon": -76.6082775592804
    },
    {
      "lat": 39.28536993461728,
      "lon": -76.60855114459991
    },
    {
      "lat": 39.285411455303205,
      "lon": -76.60861015319824
    },
    {
      "lat": 39.2854903445386,
      "lon": -76.60861551761627
    }
  ],
  "footprint": [
    {
      "lat": 39.2854888,
      "lon": -76.6086162
    },
    {
      "lat": 39.2854127,
      "lon": -76.6086109
    },
    {
      "lat": 39.2853717,
      "lon": -76.6085536
    },
    {
      "lat": 39.2853456,
      "lon": -76.608586
    },
    {
      "lat": 39.2851721,
      "lon": -76.6085785
    },
    {
      "lat": 39.2851757,
      "lon": -76.6084384
    },
    {
      "lat": 39.2850517,
      "lon": -76.6084263
    },
    {
      "lat": 39.284927,
      "lon": -76.608563
    },
    {
      "lat": 39.284724,
      "lon": -76.6085442
    },
    {
      "lat": 39.2847282,
      "lon": -76.6084614
    },
    {
      "lat": 39.2846816,
      "lon": -76.6084584
    },
    {
      "lat": 39.284685,
      "lon": -76.6083708
    },
    {
      "lat": 39.2845904,
      "lon": -76.6083595
    },
    {
      "lat": 39.2845624,
      "lon": -76.6083534
    },
    {
      "lat": 39.2845398,
      "lon": -76.6083308
    },
    {
      "lat": 39.2845244,
      "lon": -76.6082952
    },
    {
      "lat": 39.2845214,
      "lon": -76.6082583
    },
    {
      "lat": 39.2845298,
      "lon": -76.6082194
    },
    {
      "lat": 39.2845437,
      "lon": -76.608191
    },
    {
      "lat": 39.2845674,
      "lon": -76.6081706
    },
    {
      "lat": 39.2845937,
      "lon": -76.6081594
    },
    {
      "lat": 39.2846005,
      "lon": -76.6081594
    },
    {
      "lat": 39.2846929,
      "lon": -76.60817
    },
    {
      "lat": 39.2846968,
      "lon": -76.6080723
    },
    {
      "lat": 39.2847257,
      "lon": -76.6081247
    },
    {
      "lat": 39.2847534,
      "lon": -76.608091
    },
    {
      "lat": 39.2847624,
      "lon": -76.6079686
    },
    {
      "lat": 39.2848918,
      "lon": -76.607979
    },
    {
      "lat": 39.2849396,
      "lon": -76.607984
    },
    {
      "lat": 39.2849834,
      "lon": -76.6080405
    },
    {
      "lat": 39.2849995,
      "lon": -76.608027
    },
    {
      "lat": 39.2853806,
      "lon": -76.6080579
    },
    {
      "lat": 39.2852771,
      "lon": -76.6081726
    },
    {
      "lat": 39.2852924,
      "lon": -76.6081942
    },
    {
      "lat": 39.2853174,
      "lon": -76.6082287
    },
    {
      "lat": 39.2854417,
      "lon": -76.6080742
    },
    {
      "lat": 39.2855935,
      "lon": -76.6082781
    },
    {
      "lat": 39.2856405,
      "lon": -76.6083542
    },
    {
      "lat": 39.2857283,
      "lon": -76.6082551
    },
    {
      "lat": 39.2857457,
      "lon": -76.6082351
    },
    {
      "lat": 39.2856417,
      "lon": -76.6080809
    },
    {
      "lat": 39.2858615,
      "lon": -76.6081021
    },
    {
      "lat": 39.2859424,
      "lon": -76.6081084
    },
    {
      "lat": 39.2857647,
      "lon": -76.6083092
    }
  ]
});

// Public OSM entrance node, correlated with the institution's Pavilion map.
// The entrance owner still verifies a renderable wall and safe ground approach.
export function aquariumMappedEntrance(ctx){
  if(typeof ctx.geoToWorld!=='function')return [];
  const p=ctx.geoToWorld(AQUARIUM_GEOGRAPHY.entrance.lat,AQUARIUM_GEOGRAPHY.entrance.lon);
  if(!Number.isFinite(p?.x)||!Number.isFinite(p?.z))return [];
  return [{id:AQUARIUM_GEOGRAPHY.entrance.id,buildingSourceId:AQUARIUM_GEOGRAPHY.sourceId,...p,normalX:-.75,normalZ:-.66,maxFacadeProjectionMeters:8}];
}
