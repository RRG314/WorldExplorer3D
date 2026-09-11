# Astronomical Catalog Snapshot

`gaia-dr3-nearby-bright.csv` is a 5,000-row snapshot from the official ESA Gaia DR3 TAP service. It replaces generated background-star positions in the Earth, Moon, Mars, Solar System, and universe navigation skies.

- Source: ESA Gaia DR3 `gaiadr3.gaia_source`
- Retrieved: 2026-07-18
- Selection: the 5,000 lowest `phot_g_mean_mag` rows with positive parallax and a reported G magnitude
- Fields: source ID, ICRS right ascension and declination, parallax, G magnitude, BP-RP color, proper motion, and radial velocity
- Epoch: Gaia DR3 astrometry is referenced to J2016.0

The runtime maps Gaia BP-RP color index to an approximate display color. That color conversion and point size are visualization choices; sky directions and relative distances are catalog-derived.

Source documentation: <https://gea.esac.esa.int/archive/documentation/GDR3/>
