const WMO_CODE_MAP = new Map([
  [0, { label: 'Clear', category: 'clear', icon: '☀️' }],
  [1, { label: 'Mostly Clear', category: 'clear', icon: '🌤️' }],
  [2, { label: 'Partly Cloudy', category: 'cloudy', icon: '⛅' }],
  [3, { label: 'Overcast', category: 'overcast', icon: '☁️' }],
  [45, { label: 'Fog', category: 'fog', icon: '🌫️' }],
  [48, { label: 'Rime Fog', category: 'fog', icon: '🌫️' }],
  [51, { label: 'Light Drizzle', category: 'rain', icon: '🌦️' }],
  [53, { label: 'Drizzle', category: 'rain', icon: '🌦️' }],
  [55, { label: 'Dense Drizzle', category: 'rain', icon: '🌧️' }],
  [56, { label: 'Freezing Drizzle', category: 'snow', icon: '🌨️' }],
  [57, { label: 'Dense Freezing Drizzle', category: 'snow', icon: '🌨️' }],
  [61, { label: 'Light Rain', category: 'rain', icon: '🌦️' }],
  [63, { label: 'Rain', category: 'rain', icon: '🌧️' }],
  [65, { label: 'Heavy Rain', category: 'rain', icon: '🌧️' }],
  [66, { label: 'Freezing Rain', category: 'snow', icon: '🌨️' }],
  [67, { label: 'Heavy Freezing Rain', category: 'snow', icon: '🌨️' }],
  [71, { label: 'Light Snow', category: 'snow', icon: '🌨️' }],
  [73, { label: 'Snow', category: 'snow', icon: '❄️' }],
  [75, { label: 'Heavy Snow', category: 'snow', icon: '❄️' }],
  [77, { label: 'Snow Grains', category: 'snow', icon: '❄️' }],
  [80, { label: 'Rain Showers', category: 'rain', icon: '🌦️' }],
  [81, { label: 'Heavy Showers', category: 'rain', icon: '🌧️' }],
  [82, { label: 'Violent Showers', category: 'storm', icon: '⛈️' }],
  [85, { label: 'Snow Showers', category: 'snow', icon: '🌨️' }],
  [86, { label: 'Heavy Snow Showers', category: 'snow', icon: '❄️' }],
  [95, { label: 'Thunderstorm', category: 'storm', icon: '⛈️' }],
  [96, { label: 'Thunderstorm & Hail', category: 'storm', icon: '⛈️' }],
  [99, { label: 'Severe Storm', category: 'storm', icon: '⛈️' }]
]);

function weatherCodeDescriptor(code) {
  return WMO_CODE_MAP.get(Number(code)) || { label: 'Weather', category: 'cloudy', icon: '🌦️' };
}


export { weatherCodeDescriptor };
