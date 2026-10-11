// Explicitly controlled environmental fields for component/gameplay geometry
// acceptance. This never counts as live-provider, coverage or attestation proof.
export async function installControlledMarineWeather(page){
 const requested=[];
 await page.route('**/api/geospatial/weather?**',route=>{
  const url=new URL(route.request().url()),latitude=Number(url.searchParams.get('latitude')||0),longitude=Number(url.searchParams.get('longitude')||0);requested.push('weather');
  return route.fulfill({json:[{latitude,longitude,timezone:'UTC',sourceId:'controlled-verification',current:{time:new Date().toISOString(),temperature_2m:22,relative_humidity_2m:65,is_day:1,weather_code:0,cloud_cover:15,wind_speed_10m:8,wind_direction_10m:90,precipitation:0}}]});
 });
 await page.route('**/api/geospatial/marine?**',route=>{
  const url=new URL(route.request().url()),latitude=Number(url.searchParams.get('latitude')||0),longitude=Number(url.searchParams.get('longitude')||0);requested.push('marine');
  return route.fulfill({json:{latitude,longitude,sources:[{sourceId:'controlled-verification',latitude,longitude}],current:{time:new Date().toISOString(),wave_height:.5,wave_period:8,wave_direction:90,wind_wave_height:.2,swell_wave_height:.3,swell_wave_period:8,swell_wave_direction:90,ocean_current_velocity:0,ocean_current_direction:0,sea_surface_temperature:22,sea_level_height_msl:0},warnings:[]}});
 });
 return {kind:'controlled-gameplay-fixture',requested};
}
