# Planetary Texture Attribution

- `earth_atmos_2048.jpg`: NASA Visible Earth Blue Marble imagery. NASA media usage guidelines apply. Source: https://visibleearth.nasa.gov/collection/1484/blue-marble
- `moon_lroc_2048.jpg`: NASA Scientific Visualization Studio CGI Moon Kit, derived from Lunar Reconnaissance Orbiter Camera data. Source: https://svs.gsfc.nasa.gov/4720
- `moon/apollo11_lroc_dtm_8m.png`: Runtime conversion of the LROC NAC Apollo 11 Landing Site DTM. The source product is a 2 m/post, LOLA-controlled elevation model; this browser asset is an 8 m/post RGBA height field with the source no-data mask preserved. Source: https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_APOLLO11
- `moon/apollo11_lroc_ortho_8m.jpg`: Runtime-sized copy of the LROC NAC Apollo 11 Landing Site orthophoto `NAC_DTM_APOLLO11_M150368601_2M`. Source: https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_APOLLO11
- `mars_viking_4096.jpg`: USGS Astrogeology Mars Viking MDIM 2.1 colorized global mosaic, public domain. Resized locally for interactive use. Source: https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m
- `mars_olympus_viking_900.jpg`: Local Olympus Mons crop derived from the USGS Viking MDIM 2.1 global mosaic above.
- `mars_mola_olympus_dem_512.jpg`: Local Olympus Mons elevation crop derived from the public-domain USGS Mars MGS MOLA DEM 463m browse raster. The runtime combines this measured elevation field with a controlled Olympus profile so the real regional relief remains traversable at game scale. Source: https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m
- `mercury_messenger.jpg`: NASA MESSENGER global Mercury mosaic (PIA12397), assembled with USGS and mission imagery. Source: https://science.nasa.gov/photojournal/full-global-mercury-mosaic/
- `venus_magellan.jpg`: NASA/JPL-Caltech Venus map stitched from Magellan radar imagery for NASA 3D resources. Source: https://science.nasa.gov/3d-resources/venus/
- `jupiter_voyager.jpg`: NASA/JPL-Caltech Jupiter map derived from Voyager imagery for NASA 3D resources. Source: https://science.nasa.gov/3d-resources/jupiter/
- `saturn_jpl.jpg`: NASA/JPL-Caltech synthesized Saturn map for NASA 3D resources. It is documented by NASA as fictional rather than measured global imagery. Source: https://science.nasa.gov/3d-resources/saturn/
- `uranus_jpl.jpg`: JPL/Caltech Uranus map. JPL documents it as a synthesized solid atmospheric color because available global detail is limited. Source: https://space.jpl.nasa.gov/tmaps/uranus.html
- `neptune_jpl.jpg`: Don Davis/JPL-Caltech synthesized Neptune cloud map for NASA 3D resources. It is documented by NASA as fictional. Source: https://science.nasa.gov/3d-resources/neptune/

## Universe Observations

- `universe/sun-sdo-2025.jpg`: NASA/GSFC Solar Dynamics Observatory image of the Sun, observed September 10, 2025. Source: https://science.nasa.gov/photojournal/image-of-sun-from-nasas-solar-dynamics-observatory/
- `universe/orion-nebula-nasa.jpg`: NASA/ESA Hubble Orion Treasury Project mosaic, resized to 2000 × 960 for interactive use. Source: https://science.nasa.gov/asset/hubble/orion-nebula-3/
- `universe/carina-nebula-webb.jpg`: NASA/ESA/CSA/STScI Webb NIRCam and MIRI Cosmic Cliffs composite, resized to 2000 × 692 for interactive use. Source: https://science.nasa.gov/asset/webb/cosmic-cliffs-in-the-carina-nebula-nircam-and-miri-composite-image/
- `universe/crab-nebula-webb.jpg`: NASA/ESA/CSA/STScI Webb NIRCam and MIRI Crab Nebula composite; image processing by Joseph DePasquale (STScI), resized to 2000 × 1741 for interactive use. Source: https://science.nasa.gov/asset/webb/crab-nebula-nircam-and-miri-image/
- `universe/milky-way-spitzer.jpg`: NASA/JPL-Caltech/University of Wisconsin Spitzer GLIMPSE Galactic Plane panorama. Source: https://science.nasa.gov/photojournal/glimpse-the-galaxy-all-the-way-around/

## Earth Surface Materials

The diffuse, OpenGL normal, and roughness maps under `earth/` are resized local copies of CC0 materials:

- `grass_001_*`: ambientCG Grass 001. Source: https://ambientcg.com/view?id=Grass001
- `forest_ground_04_*`: Forest Ground 04. Source: https://polyhaven.com/a/forest_ground_04
- `sand_01_*`: Sand 01. Source: https://polyhaven.com/a/sand_01
- `rock_ground_*`: Rock Ground. Source: https://polyhaven.com/a/rock_ground
- `dirt_*`: Dirt. Source: https://polyhaven.com/a/dirt
- `snow_01_*`: Snow 01. Source: https://polyhaven.com/a/snow_01
- `brushed_concrete_*`: Brushed Concrete. Source: https://polyhaven.com/a/brushed_concrete
- `concrete_*`: Concrete. Source: https://polyhaven.com/a/concrete
- `brick_wall_001_*`: Brick Wall 001. Source: https://polyhaven.com/a/brick_wall_001

## Live Data Providers

- Aircraft state vectors: The OpenSky Network live API, used under OpenSky terms for research and non-commercial use. Source: https://openskynetwork.github.io/opensky-api/
- Street imagery: Panoramax and KartaView community observations, CC BY-SA 4.0.
- Global marine model guidance: Open-Meteo Marine Weather API under provider terms. Source: https://open-meteo.com/en/docs/marine-weather-api
- United States water-level observations and tide predictions: NOAA Center for Operational Oceanographic Products and Services. Source: https://tidesandcurrents.noaa.gov/
