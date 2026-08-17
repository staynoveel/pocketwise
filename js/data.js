/* ==========================================================================
   NEXUS — data layer
   Backend-ready shape: every timestamp is a real ISO string. Right now they
   are generated relative to "now" (so the demo always looks live); swapping
   this file for a `fetch('/api/incidents')` / `fetch('/api/air-quality')`
   call requires no UI changes as long as the same shape is returned.
   ========================================================================== */

// Default city center — swap for any other city without touching the UI.
const CITY_CENTER = { lat: 35.7219, lng: 51.3347, name: "Tehran" };
const CITY_ZOOM = 12;

function minutesAgo(min) {
  return new Date(Date.now() - min * 60000).toISOString();
}

function afterStart(startIso, seconds) {
  return new Date(new Date(startIso).getTime() + seconds * 1000).toISOString();
}

function buildTimeline(startIso, steps) {
  // steps: [{ afterSec, label, note }]
  return steps.map((s) => ({
    at: afterStart(startIso, s.afterSec),
    label: s.label,
    note: s.note,
  }));
}

// ---------------------------------------------------------------------------
// Incidents (Alerts & Incidents page)
// ---------------------------------------------------------------------------

const INCIDENT_DEFS = [
  {
    id: "NXS-204", type: "power", severity: "critical", title: "Power Grid Failure",
    description: "Power grid failure detected in South District. Multiple substations affected. Emergency response required.",
    location: { lat: 35.6805, lng: 51.3902, name: "South District" },
    affectedZones: ["S4", "S5", "S6"], startedMinAgo: 4.3, status: "open",
    responsibleTeam: "Power Team", unitsAssigned: 5, estimatedImpact: "high", escalated: true,
    timelineSteps: [
      { afterSec: 0, label: "Incident Detected", note: "Power anomaly detected by AI system" },
      { afterSec: 13, label: "Alert Generated", note: "System generated critical alert" },
      { afterSec: 27, label: "Verified", note: "Incident verified by monitoring system" },
      { afterSec: 56, label: "Escalated", note: "Escalated to critical level" },
      { afterSec: 100, label: "Response Team Notified", note: "Emergency team dispatched" },
      { afterSec: 127, label: "On Site", note: "Response team on site" },
      { afterSec: 240, label: "Investigation Ongoing", note: "Investigation in progress" },
    ],
  },
  {
    id: "NXS-198", type: "traffic", severity: "high", title: "Traffic Collision",
    description: "Multiple vehicles involved in a collision blocking two lanes. Ambulance and traffic control on route.",
    location: { lat: 35.7148, lng: 51.4102, name: "District B4 · Main Street & 5th Ave" },
    affectedZones: ["B4"], startedMinAgo: 8, status: "active",
    responsibleTeam: "Traffic Control", unitsAssigned: 3, estimatedImpact: "medium", escalated: false,
    timelineSteps: [
      { afterSec: 0, label: "Incident Detected", note: "Collision reported by traffic camera" },
      { afterSec: 40, label: "Alert Generated", note: "System generated high-priority alert" },
      { afterSec: 300, label: "Response Team Notified", note: "Traffic control unit dispatched" },
    ],
  },
  {
    id: "NXS-195", type: "air", severity: "medium", title: "AQI Threshold Exceeded",
    description: "Air quality above threshold in industrial zone. Monitoring for further deterioration.",
    location: { lat: 35.6604, lng: 51.3204, name: "Zone A1 · Industrial Area" },
    affectedZones: ["A1"], startedMinAgo: 12, status: "monitoring",
    responsibleTeam: "Environmental", unitsAssigned: 2, estimatedImpact: "medium", escalated: false,
    timelineSteps: [
      { afterSec: 0, label: "Incident Detected", note: "AQI sensor threshold breach" },
      { afterSec: 90, label: "Alert Generated", note: "System generated medium alert" },
      { afterSec: 480, label: "Response Team Notified", note: "Environmental team notified" },
    ],
  },
  {
    id: "NXS-190", type: "water", severity: "low", title: "Water Pressure Drop",
    description: "Water pressure below normal operating range in residential distribution line.",
    location: { lat: 35.7604, lng: 51.3108, name: "District C2 · Residential Area" },
    affectedZones: ["C2"], startedMinAgo: 18, status: "investigating",
    responsibleTeam: "Water Team", unitsAssigned: 2, estimatedImpact: "low", escalated: false,
    timelineSteps: [
      { afterSec: 0, label: "Incident Detected", note: "Pressure drop flagged by SCADA" },
      { afterSec: 120, label: "Alert Generated", note: "System generated low-priority alert" },
      { afterSec: 900, label: "Response Team Notified", note: "Water team investigating" },
    ],
  },
  {
    id: "NXS-188", type: "security", severity: "medium", title: "Security Camera Offline",
    description: "Camera connection lost in commercial district monitoring cluster.",
    location: { lat: 35.7051, lng: 51.4502, name: "District D1 · Commercial Area" },
    affectedZones: ["D1"], startedMinAgo: 25, status: "resolved",
    responsibleTeam: "Security Team", unitsAssigned: 1, estimatedImpact: "low", escalated: false,
    timelineSteps: [
      { afterSec: 0, label: "Incident Detected", note: "Camera heartbeat lost" },
      { afterSec: 60, label: "Alert Generated", note: "System generated medium alert" },
      { afterSec: 600, label: "Response Team Notified", note: "Security team dispatched" },
      { afterSec: 1180, label: "Resolved", note: "Connection restored, camera back online" },
    ],
  },
  {
    id: "NXS-185", type: "power", severity: "critical", title: "Substation Overload",
    description: "Substation load exceeding safe capacity. Risk of cascading outage in North District.",
    location: { lat: 35.8008, lng: 51.4001, name: "North District" },
    affectedZones: ["N1", "N2"], startedMinAgo: 35, status: "open",
    responsibleTeam: "Power Team", unitsAssigned: 4, estimatedImpact: "high", escalated: true,
    timelineSteps: [
      { afterSec: 0, label: "Incident Detected", note: "Load threshold breach detected" },
      { afterSec: 30, label: "Alert Generated", note: "System generated critical alert" },
      { afterSec: 360, label: "Response Team Notified", note: "Power team dispatched" },
    ],
  },
  {
    id: "NXS-180", type: "security", severity: "critical", title: "Gas Leak Detected",
    description: "Gas leak reported near District E3 pipeline junction. Area cordoned off pending inspection.",
    location: { lat: 35.7402, lng: 51.2503, name: "District E3" },
    affectedZones: ["E3"], startedMinAgo: 50, status: "open",
    responsibleTeam: "Security Team", unitsAssigned: 4, estimatedImpact: "high", escalated: false,
    timelineSteps: [
      { afterSec: 0, label: "Incident Detected", note: "Gas sensor triggered alarm" },
      { afterSec: 45, label: "Alert Generated", note: "System generated critical alert" },
      { afterSec: 900, label: "Response Team Notified", note: "Hazmat-trained unit dispatched" },
    ],
  },
  {
    id: "NXS-176", type: "power", severity: "high", title: "Signal Outage",
    description: "Traffic signal network outage affecting four intersections in West District.",
    location: { lat: 35.7001, lng: 51.2301, name: "West District" },
    affectedZones: ["W2"], startedMinAgo: 60, status: "open",
    responsibleTeam: "Traffic Control", unitsAssigned: 2, estimatedImpact: "medium", escalated: false,
    timelineSteps: [
      { afterSec: 0, label: "Incident Detected", note: "Signal controller offline" },
      { afterSec: 50, label: "Alert Generated", note: "System generated high alert" },
      { afterSec: 540, label: "Response Team Notified", note: "Traffic control unit en route" },
    ],
  },
  {
    id: "NXS-172", type: "water", severity: "medium", title: "Illegal Dumping Reported",
    description: "Waste dumping reported near stormwater drainage in East District.",
    location: { lat: 35.7301, lng: 51.4801, name: "East District" },
    affectedZones: ["E1"], startedMinAgo: 80, status: "open",
    responsibleTeam: "Environmental", unitsAssigned: 2, estimatedImpact: "low", escalated: false,
    timelineSteps: [
      { afterSec: 0, label: "Incident Detected", note: "Reported via citizen app" },
      { afterSec: 200, label: "Alert Generated", note: "System generated medium alert" },
      { afterSec: 1500, label: "Response Team Notified", note: "Environmental team notified" },
    ],
  },
  {
    id: "NXS-168", type: "water", severity: "high", title: "Road Flooding",
    description: "Localized flooding on Central District arterial road following drainage blockage.",
    location: { lat: 35.7151, lng: 51.4001, name: "Central District" },
    affectedZones: ["C1"], startedMinAgo: 105, status: "open",
    responsibleTeam: "Water Team", unitsAssigned: 3, estimatedImpact: "medium", escalated: false,
    timelineSteps: [
      { afterSec: 0, label: "Incident Detected", note: "Flooding reported by patrol unit" },
      { afterSec: 90, label: "Alert Generated", note: "System generated high alert" },
      { afterSec: 240, label: "Response Team Notified", note: "Water team dispatched" },
    ],
  },
  {
    id: "NXS-160", type: "security", severity: "medium", title: "Unauthorized Access Attempt",
    description: "Access control system flagged repeated badge failures at District F2 facility gate.",
    location: { lat: 35.6702, lng: 51.4302, name: "District F2" },
    affectedZones: ["F2"], startedMinAgo: 120, status: "resolved",
    responsibleTeam: "Security Team", unitsAssigned: 2, estimatedImpact: "low", escalated: false,
    timelineSteps: [
      { afterSec: 0, label: "Incident Detected", note: "Repeated badge failures logged" },
      { afterSec: 60, label: "Alert Generated", note: "System generated medium alert" },
      { afterSec: 1800, label: "Response Team Notified", note: "Security team dispatched" },
      { afterSec: 3200, label: "Resolved", note: "Confirmed false alarm, gate secured" },
    ],
  },
  {
    id: "NXS-155", type: "traffic", severity: "low", title: "Metro Delay",
    description: "Line 2 experiencing minor delays due to signal maintenance at District G4 station.",
    location: { lat: 35.7803, lng: 51.3301, name: "District G4" },
    affectedZones: ["G4"], startedMinAgo: 150, status: "open",
    responsibleTeam: "Traffic Control", unitsAssigned: 1, estimatedImpact: "low", escalated: false,
    timelineSteps: [
      { afterSec: 0, label: "Incident Detected", note: "Delay flagged by transit control" },
      { afterSec: 100, label: "Alert Generated", note: "System generated low alert" },
      { afterSec: 180, label: "Response Team Notified", note: "Maintenance crew notified" },
    ],
  },
  {
    id: "NXS-150", type: "water", severity: "high", title: "Water Main Break",
    description: "Main line rupture on District H5 avenue caused local outage and road subsidence risk.",
    location: { lat: 35.6901, lng: 51.3601, name: "District H5" },
    affectedZones: ["H5"], startedMinAgo: 180, status: "resolved",
    responsibleTeam: "Water Team", unitsAssigned: 4, estimatedImpact: "high", escalated: false,
    timelineSteps: [
      { afterSec: 0, label: "Incident Detected", note: "Pressure loss triggered SCADA alarm" },
      { afterSec: 45, label: "Alert Generated", note: "System generated high alert" },
      { afterSec: 2700, label: "Response Team Notified", note: "Water team dispatched with crew" },
      { afterSec: 5800, label: "Resolved", note: "Main repaired, service restored" },
    ],
  },
  {
    id: "NXS-145", type: "power", severity: "low", title: "Streetlight Outage",
    description: "Cluster of streetlights offline along South District boulevard.",
    location: { lat: 35.6752, lng: 51.3701, name: "South District" },
    affectedZones: ["S2"], startedMinAgo: 240, status: "resolved",
    responsibleTeam: "Power Team", unitsAssigned: 1, estimatedImpact: "low", escalated: false,
    timelineSteps: [
      { afterSec: 0, label: "Incident Detected", note: "Outage reported by patrol" },
      { afterSec: 300, label: "Alert Generated", note: "System generated low alert" },
      { afterSec: 2400, label: "Response Team Notified", note: "Power team crew dispatched" },
      { afterSec: 6600, label: "Resolved", note: "Fuses replaced, lights restored" },
    ],
  },
];

const INCIDENTS = INCIDENT_DEFS.map((d) => {
  const startedAt = minutesAgo(d.startedMinAgo);
  return {
    id: d.id,
    type: d.type,
    severity: d.severity,
    title: d.title,
    description: d.description,
    location: d.location,
    affectedZones: d.affectedZones,
    startedAt,
    status: d.status,
    responsibleTeam: d.responsibleTeam,
    unitsAssigned: d.unitsAssigned,
    estimatedImpact: d.estimatedImpact,
    escalated: d.escalated,
    timeline: buildTimeline(startedAt, d.timelineSteps),
  };
});

// ---------------------------------------------------------------------------
// Air Quality (Air Quality page)
// ---------------------------------------------------------------------------

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

const AQ_ZONE_DEFS = [
  { id: "AQZ-01", name: "Zone A1 · Industrial Area", lat: 35.6604, lng: 51.3204, aqi: 168, pm25: 92, pm10: 148, no2: 58, so2: 34, co: 3.1, trend: 6.4, sensorId: "SNS-014", updatedMinAgo: 2 },
  { id: "AQZ-02", name: "South District", lat: 35.6805, lng: 51.3902, aqi: 141, pm25: 71, pm10: 118, no2: 44, so2: 21, co: 2.2, trend: 3.1, sensorId: "SNS-027", updatedMinAgo: 4 },
  { id: "AQZ-03", name: "District B4 · Downtown", lat: 35.7148, lng: 51.4102, aqi: 96, pm25: 42, pm10: 78, no2: 39, so2: 18, co: 1.6, trend: -1.8, sensorId: "SNS-003", updatedMinAgo: 1 },
  { id: "AQZ-04", name: "District C2 · Residential", lat: 35.7604, lng: 51.3108, aqi: 58, pm25: 21, pm10: 45, no2: 19, so2: 9, co: 0.8, trend: -4.2, sensorId: "SNS-019", updatedMinAgo: 3 },
  { id: "AQZ-05", name: "North District", lat: 35.8008, lng: 51.4001, aqi: 41, pm25: 14, pm10: 30, no2: 12, so2: 6, co: 0.5, trend: -6.7, sensorId: "SNS-031", updatedMinAgo: 5 },
  { id: "AQZ-06", name: "West District", lat: 35.7001, lng: 51.2301, aqi: 74, pm25: 33, pm10: 60, no2: 27, so2: 14, co: 1.1, trend: 1.2, sensorId: "SNS-008", updatedMinAgo: 2 },
  { id: "AQZ-07", name: "East District", lat: 35.7301, lng: 51.4801, aqi: 112, pm25: 58, pm10: 96, no2: 47, so2: 24, co: 2.0, trend: 4.5, sensorId: "SNS-022", updatedMinAgo: 6 },
  { id: "AQZ-08", name: "District E3", lat: 35.7402, lng: 51.2503, aqi: 205, pm25: 118, pm10: 190, no2: 71, so2: 46, co: 4.4, trend: 9.8, sensorId: "SNS-040", updatedMinAgo: 1 },
  { id: "AQZ-09", name: "District H5", lat: 35.6901, lng: 51.3601, aqi: 63, pm25: 24, pm10: 49, no2: 21, so2: 10, co: 0.9, trend: -2.3, sensorId: "SNS-011", updatedMinAgo: 3 },
];

const AQ_ZONES = AQ_ZONE_DEFS.map((z) => {
  const cat = categorizeAqi(z.aqi);
  return {
    id: z.id,
    name: z.name,
    location: { lat: z.lat, lng: z.lng, name: z.name },
    aqi: z.aqi,
    category: cat.category,
    categoryLabel: cat.label,
    pollutants: { pm25: z.pm25, pm10: z.pm10, no2: z.no2, so2: z.so2, co: z.co },
    trend: z.trend,
    sensorId: z.sensorId,
    lastUpdate: minutesAgo(z.updatedMinAgo),
  };
});

// 45-sensor network — a handful are notably delayed/offline (matches project's
// "sensors can be corrupted/delayed" challenge); Sensors Online is computed
// by filtering this array, never hardcoded.
const AIR_SENSORS = Array.from({ length: 45 }, (_, i) => {
  const n = i + 1;
  let status = "online";
  if (n === 11 || n === 33) status = "delayed";
  if (n === 40) status = "offline";
  const zone = AQ_ZONES[i % AQ_ZONES.length];
  return {
    id: `SNS-${String(n).padStart(3, "0")}`,
    zoneId: zone.id,
    status,
    lastSeen: minutesAgo(status === "offline" ? 52 : status === "delayed" ? 9 : (n % 5) * 0.6),
  };
});

// AQI trend series generator — deterministic pseudo-noise around each zone's
// current reading, one point per hour/day depending on range.
function buildAqiTrend(rangeKey) {
  const cfg = {
    "24h": { points: 24, label: (i) => `${23 - i}h` },
    "7d": { points: 7, label: (i) => `D-${6 - i}` },
    "30d": { points: 30, label: (i) => `D-${29 - i}` },
  }[rangeKey];

  const cityAqiNow = Math.round(AQ_ZONES.reduce((s, z) => s + z.aqi, 0) / AQ_ZONES.length);
  const cityPm25Now = Math.round(AQ_ZONES.reduce((s, z) => s + z.pollutants.pm25, 0) / AQ_ZONES.length);
  const cityPm10Now = Math.round(AQ_ZONES.reduce((s, z) => s + z.pollutants.pm10, 0) / AQ_ZONES.length);

  const labels = [];
  const aqi = [];
  const pm25 = [];
  const pm10 = [];

  for (let i = 0; i < cfg.points; i++) {
    const seed = Math.sin(i * 12.9898) * 43758.5453;
    const noise = seed - Math.floor(seed); // deterministic 0..1
    const wave = Math.sin((i / cfg.points) * Math.PI * 2) * 0.12;
    const factor = 0.82 + noise * 0.28 + wave;
    labels.push(cfg.label(i));
    aqi.push(Math.max(10, Math.round(cityAqiNow * factor)));
    pm25.push(Math.max(4, Math.round(cityPm25Now * factor)));
    pm10.push(Math.max(6, Math.round(cityPm10Now * factor)));
  }

  // last point = actual current reading, so the chart ends "live"
  aqi[aqi.length - 1] = cityAqiNow;
  pm25[pm25.length - 1] = cityPm25Now;
  pm10[pm10.length - 1] = cityPm10Now;

  return { labels, aqi, pm25, pm10 };
}
