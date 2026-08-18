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

// Open-Meteo reports every pollutant in µg/m³ (confirmed by the API's own
// `current_units`), so all ceilings below are µg/m³ too. They were previously
// on the ppm/ppb scale, which mislabelled the units and made a normal CO
// reading (~460 µg/m³) read as "Critical" against a 9 ppm ceiling.
// Ceilings are set near the top of each pollutant's unhealthy range so the
// bars stay comparable: WHO/EPA short-term guidance for NO₂, SO₂ and CO.
const POLLUTANT_LIMITS = {
  pm25: { max: 150, unit: "µg/m³" },
  pm10: { max: 250, unit: "µg/m³" },
  no2: { max: 200, unit: "µg/m³" },
  so2: { max: 350, unit: "µg/m³" },
  co: { max: 4000, unit: "µg/m³" },
};

function pollutantStatus(key, value) {
  const ratio = value / POLLUTANT_LIMITS[key].max;
  if (ratio >= 0.75) return { label: "Critical", tone: "red" };
  if (ratio >= 0.5) return { label: "High", tone: "orange" };
  if (ratio >= 0.25) return { label: "Moderate", tone: "yellow" };
  return { label: "Normal", tone: "green" };
}
