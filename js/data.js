/* ==========================================================================
   NEXUS — shared constants and AQI/pollutant classification helpers

   Both pages now source their actual incidents/zones/readings live, at
   runtime, from real free APIs (see js/livemap.js) — nothing here is
   fixture data. This file only keeps the small set of values every page
   needs regardless of where the data comes from: the default map center,
   and the thresholds used to label a real AQI/pollutant reading.
   ========================================================================== */

// Default city center — used as a fallback when the operator's browser
// denies/lacks geolocation, and as the initial map view before any real
// data has loaded. Swap for any other city without touching the UI.
const CITY_CENTER = { lat: 35.7219, lng: 51.3347, name: "Tehran" };
const CITY_ZOOM = 12;

const AQI_THRESHOLDS = [
  { max: 50, category: "good", label: "Good" },
  { max: 100, category: "moderate", label: "Moderate" },
  { max: 150, category: "unhealthy", label: "Unhealthy" },
  { max: 200, category: "very-unhealthy", label: "Very Unhealthy" },
  { max: Infinity, category: "hazardous", label: "Hazardous" },
];

function categorizeAqi(aqi) {
  return AQI_THRESHOLDS.find((t) => aqi <= t.max);
}

const POLLUTANT_LIMITS = {
  pm25: { max: 150, unit: "µg/m³" },
  pm10: { max: 250, unit: "µg/m³" },
  no2: { max: 100, unit: "ppb" },
  so2: { max: 75, unit: "ppb" },
  co: { max: 9, unit: "ppm" },
};

function pollutantStatus(key, value) {
  const ratio = value / POLLUTANT_LIMITS[key].max;
  if (ratio >= 0.75) return { label: "Critical", tone: "red" };
  if (ratio >= 0.5) return { label: "High", tone: "orange" };
  if (ratio >= 0.25) return { label: "Moderate", tone: "yellow" };
  return { label: "Normal", tone: "green" };
}
