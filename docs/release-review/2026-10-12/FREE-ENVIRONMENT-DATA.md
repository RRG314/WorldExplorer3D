# Public environmental data review — October 12, 2026

This update continues to use public weather and ocean data. It does not require
an Open-Meteo plan. This source/operating review is separate from a deployed
endpoint acceptance receipt; the final receipt must identify the actual build,
endpoint configuration and verified backend version.

## Source rights and attribution

- MET Norway Locationforecast: [licensing](https://docs.api.met.no/doc/License.html)
  and [service terms](https://api.met.no/doc/TermsOfService) permit reuse under
  CC BY 4.0 / NLOD. The application identifies MET Norway, links the license and
  identifies conversions. Requests use an identifying User-Agent, coordinates
  rounded to two decimals, shared caching and conditional revalidation.
- PacIOOS WaveWatch III: the [specific global dataset metadata](https://pae-paha.pacioos.hawaii.edu/erddap/info/ww3_global/index.htmlTable)
  permits free use and redistribution, without a suitability or accuracy warranty.
  [PacIOOS attribution guidance](https://www.pacioos.hawaii.edu/data-access/) is
  retained in the source acknowledgements. The live dataset may be unavailable;
  the existing NOAA fallback retains its own source and time.
- NOAA WaveWatch III via Unidata: [NOAA disclaimer](https://www.weather.gov/disclaimer)
  covers the public forecast data. The adapter identifies the actual NOAA source;
  unavailable swell values stay absent instead of being invented.
- HYCOM current and surface temperature: the [provider acknowledgement](https://www.hycom.org/publications/acknowledgements/hycom-data)
  identifies publicly released Distribution A data. The [provider's commercial-use answer](https://groups.google.com/a/hycom.org/g/forum/c/Ry2SV_c6ODA)
  confirms public-domain use. Attribution and model limitations remain visible.

These sources are numerical model guidance. They are not observed conditions,
real animal sightings, navigation certification or diving safety advice. This
review does not grant rights to unrelated imagery or 3D assets.

## Request control review

The fixed provider URLs, validation and unit mappings live in
`functions/environment-models.js`. `functions/environment-data.js` authenticates
before work, coalesces identical requests, shares cache and request control across
instances, respects expiry and Retry-After, bounds response size/time, and retains
source/time/missing-value distinctions.

The [HYCOM NCSS operating guidance](https://groups.google.com/a/hycom.org/g/forum)
requires at most one simultaneous subset connection per IP. The earlier one-second
start spacing did not enforce this. The October 12 change adds an exclusive
Firestore reservation shared across locations and instances. Cache hits need no
upstream connection; busy uncached current requests remain explicitly unavailable.
The lease expires after the bounded request lifetime and releases only for its
own request identity. Focused tests cover overlapping locations, independent
instances, cache reads, failure cleanup and a late former owner.

This repair must reach staging and production before the final deployment is
called covered. At initial inventory, production and staging still used the
previous environmental gateway; a source edit is not deployment evidence.
