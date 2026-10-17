# Public environmental data review — October 14, 2026

The candidate continues to use the existing public-data gateway. No paid
weather or ocean-data subscription has been introduced.

Current primary-source review:

- [MET Norway licensing](https://api.met.no/doc/License) provides CC BY 4.0 /
  NLOD data. Its [service terms](https://api.met.no/doc/TermsOfService) require
  identification, attribution, caching, bounded traffic and rounded coordinates.
  The current gateway identifies the application, honors Expires, conditionally
  revalidates with Last-Modified and shares cache/rate controls across instances.
- [PacIOOS global WW3 dataset metadata](https://pae-paha.pacioos.hawaii.edu/erddap/info/ww3_global/index.htmlTable)
  permits free use and redistribution with its stated accuracy and warranty
  limitations. The model remains attributed to PacIOOS when selected.
- [NOAA's disclaimer](https://www.weather.gov/disclaimer) permits lawful reuse
  of its public-domain information without claiming authorship, endorsement or
  that modified output is official government material. The fallback retains
  the actual NOAA source and forecast time.
- [HYCOM's data server](https://www.hycom.org/dataserver) and
  [acknowledgement](https://www.hycom.org/publications/acknowledgements/hycom-data)
  identify publicly released Distribution A model output and its limitations.
  The candidate's provider-wide reservation prevents overlapping uncached
  subset requests; cache reads do not reserve an upstream request.

The application identifies numerical guidance and conversions. Missing values
stay absent. Model coverage and service availability are distinct from reuse
rights; this review does not certify accurate real-world navigation or diving.

Read-only cloud inventory at 2026-10-14 14:30 UTC found all 80 functions active
in each project. Production environmental and place gateways still have
October 7 deployment timestamps. Staging gateways were updated October 13.
Commerce and interior-representation functions also need exact source and
deployment review before coordinated promotion. Safe metadata is recorded in
`output/release-evidence/production-backend-inventory-20261014.json`.

This document is a source/operating review. It is not a passing final
weather-entitlement receipt: that receipt must bind the final package, visible
attribution, live gateway verification and deployed backend configuration.
