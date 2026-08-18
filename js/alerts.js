/* ==========================================================================
   NEXUS — Alerts & Incidents page logic

   REAL (live, from free keyless APIs, centered on the operator's real
   location or whatever place is searched):
     - every marker on the map (hazards, roadworks, cameras, sensors,
       power substations, water points, traffic signals, police stations)
     - the incident feed, stat cards, filters, search, and details panel —
       built entirely from those same live results, not from a fixture file
     - "Zones" — real nearby neighbourhoods, coloured from real nearby
       hazard/AQI data
     - each incident's "Started" time — the underlying OSM tag's real
       edit timestamp (when available), or the live AQI reading's own time

   Honest limitation: there is no free, keyless, truly LIVE incident/
   accident/crime dispatch feed anywhere. "Hazard" and "Road Construction"
   incidents use OSM's own hazard/roadwork tags as the closest real proxy —
   real data, but not a live 911-style feed. DISPATCH RESPONSE / ACKNOWLEDGE
   are local operator actions in this UI, not a real dispatch system.
   ========================================================================== */

initNexusChrome("alerts-incidents");

const SEVERITY_COLOR = {
  critical: "#E33E3A",
  high: "#FF8C22",
  medium: "#EAB42F",
  low: "#3B9EFF",
};

const TYPE_ICON = {
  power: "powerGrid",
  traffic: "traffic",
  air: "wind",
  water: "waterSystem",
  security: "security",
};

const STATUS_LABEL = {
  open: "OPEN",
  monitoring: "MONITORING",
  resolved: "RESOLVED",
};

const INFRA_RADIUS_M = 5000;
const ZONE_RADIUS_M = 6000;
const REFRESH_MS = 90000;

let map = null;
let selectedIncidentId = null;
let currentCenter = null;
let incidents = [];
const markers = {};
const acknowledged = new Set();
const dispatched = new Set();
const infraLayers = {
  incidents: L.layerGroup(),
  cameras: L.layerGroup(),
  sensors: L.layerGroup(),
  power: L.layerGroup(),
  water: L.layerGroup(),
  traffic: L.layerGroup(),
  police: L.layerGroup(),
  zones: L.layerGroup(),
};
let layersPanel = null;

// hours defaults to 24 to match the "24 Hours" option pre-selected in the
// filterTime <select> — keeping these in sync avoids a filter that looks
// applied in the UI but silently isn't.
const state = { severity: "all", type: "all", district: "all", hours: 24, search: "" };

// ---------------------------------------------------------------------------
// OSM tag -> incident mapping
// ---------------------------------------------------------------------------

function hazardToIncidentType(tags) {
  const h = (tags.hazard || "").toLowerCase();
  if (h.includes("flood") || h.includes("water")) return "water";
  if (h.includes("fire") || h.includes("gas") || h.includes("explos")) return "security";
  return "security";
}

function buildIncidentsFromOverpass(elements, center) {
  const neighborhoods = [];
  const infra = { cameras: [], sensors: [], power: [], water: [], traffic: [], police: [] };
  const out = [];

  elements.forEach((el) => {
    const ll = elLatLon(el);
    if (!ll) return;
    const t = el.tags || {};

    if (t.place && /^(suburb|neighbourhood|quarter|town)$/.test(t.place) && t.name) {
      neighborhoods.push({ name: t.name, lat: ll[0], lon: ll[1] });
      return;
    }
    if (t.hazard) {
      out.push(makeIncident(el, ll, hazardToIncidentType(t), "high", `Hazard Reported: ${t.hazard}`,
        `OpenStreetMap-tagged hazard ("${t.hazard}") near this location.`, "open"));
      return;
    }
    if (t.emergency === "danger_area") {
      out.push(makeIncident(el, ll, "security", "high", "Danger Area Reported",
        "OpenStreetMap-tagged emergency danger area.", "open"));
      return;
    }
    if (t.highway === "construction") {
      out.push(makeIncident(el, ll, "traffic", "medium", "Road Construction / Closure",
        "Roadway under construction, tagged in OpenStreetMap.", "open"));
      return;
    }
    if (t.man_made === "surveillance") { infra.cameras.push(ll); L.marker(ll, { icon: liveDivIcon(SEVERITY_COLOR.low, "security") }).bindTooltip("Surveillance camera (OSM)").addTo(infraLayers.cameras); return; }
    if (t.man_made === "monitoring_station") { infra.sensors.push(ll); L.marker(ll, { icon: liveDivIcon(SEVERITY_COLOR.low, "gauge") }).bindTooltip("Monitoring sensor (OSM)").addTo(infraLayers.sensors); return; }
    if (t.power === "substation") { infra.power.push(ll); L.marker(ll, { icon: liveDivIcon("#EAB42F", "powerGrid") }).bindTooltip("Power substation (OSM)").addTo(infraLayers.power); return; }
    if (t.natural === "water" || t.amenity === "drinking_water") { infra.water.push(ll); L.marker(ll, { icon: liveDivIcon("#3B9EFF", "waterSystem") }).bindTooltip("Water point (OSM)").addTo(infraLayers.water); return; }
    if (t.highway === "traffic_signals") { infra.traffic.push(ll); L.marker(ll, { icon: liveDivIcon(SEVERITY_COLOR.low, "traffic") }).bindTooltip("Traffic signal (OSM)").addTo(infraLayers.traffic); return; }
    if (t.amenity === "police") { infra.police.push(ll); L.marker(ll, { icon: liveDivIcon("#9B6BFF", "shield") }).bindTooltip("Police station (OSM)").addTo(infraLayers.police); return; }
  });

  return { incidents: out, neighborhoods, infra };
}

function makeIncident(el, ll, type, severity, title, description, status) {
  const startedAt = el.timestamp ? new Date(el.timestamp).toISOString() : new Date().toISOString();
  return {
    id: `OSM-${el.type ? el.type[0].toUpperCase() : "N"}${el.id}`,
    type,
    severity,
    title,
    description,
    location: { lat: ll[0], lng: ll[1], name: null },
    affectedZones: [],
    startedAt,
    status,
    responsibleTeam: type === "traffic" ? "Traffic Control" : type === "water" ? "Water Team" : type === "air" ? "Environmental" : "Security Team",
    unitsAssigned: 0,
    estimatedImpact: severity === "critical" ? "high" : severity === "high" ? "medium" : "low",
    escalated: severity === "critical",
    source: "osm",
    timeline: [{
      at: startedAt,
      label: "Detected via OpenStreetMap",
      note: "Real hazard/roadwork tag found in OpenStreetMap live data.",
    }],
  };
}

function makeAqiIncident(aqiReading, center) {
  const aqi = aqiReading.aqi;
  if (aqi == null || aqi <= 100) return null;
  const severity = aqi > 200 ? "critical" : aqi > 150 ? "high" : "medium";
  const startedAt = new Date(aqiReading.time ? aqiReading.time + "Z" : Date.now()).toISOString();
  return {
    id: `AQI-${Math.round(center[0] * 1000)}-${Math.round(center[1] * 1000)}`,
    type: "air",
    severity,
    title: "AQI Threshold Exceeded",
    description: `Live air quality reading (Open-Meteo) is ${aqi} US AQI at this location — above the healthy threshold.`,
    location: { lat: center[0], lng: center[1], name: null },
    affectedZones: [],
    startedAt,
    status: "monitoring",
    responsibleTeam: "Environmental",
    unitsAssigned: 0,
    estimatedImpact: severity === "critical" ? "high" : severity === "high" ? "medium" : "low",
    escalated: severity === "critical",
    source: "aqi",
    timeline: [{
      at: startedAt,
      label: "Threshold Exceeded",
      note: `Live AQI reading from Open-Meteo (${aqi} US AQI) exceeded the safe threshold.`,
    }],
  };
}

function assignZoneNames(incidentList, neighborhoods) {
  incidentList.forEach((inc) => {
    let nearest = null, nearestDist = Infinity;
    neighborhoods.forEach((n) => {
      const d = distKm(inc.location.lat, inc.location.lng, n.lat, n.lon);
      if (d < nearestDist) { nearestDist = d; nearest = n; }
    });
    if (nearest && nearestDist < 2) {
      inc.location.name = nearest.name;
      inc.affectedZones = [nearest.name.slice(0, 2).toUpperCase()];
    } else {
      inc.location.name = "Unclassified Area";
      inc.affectedZones = ["—"];
    }
  });
}

// ---------------------------------------------------------------------------
// Stat cards — computed from the live incident set
// ---------------------------------------------------------------------------

function computeStats(neighborhoods, infra) {
  const total = incidents.length;
  const critical = incidents.filter((i) => i.severity === "critical").length;
  const open = incidents.filter((i) => i.status === "open").length;
  const zonesMonitored = neighborhoods.length;
  const infraNearby = Object.values(infra).reduce((s, arr) => s + arr.length, 0);

  const ages = incidents.map((i) => (Date.now() - new Date(i.startedAt).getTime()) / 1000).filter((v) => v >= 0);
  const avgAgeSec = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;

  return { total, critical, open, zonesMonitored, infraNearby, avgAgeSec };
}

function formatAge(sec) {
  if (sec < 3600) return formatShortDuration(sec);
  const days = Math.floor(sec / 86400);
  const hrs = Math.floor((sec % 86400) / 3600);
  if (days > 0) return `${days}d ${hrs}h`;
  const hours = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function renderStats(neighborhoods, infra) {
  const s = computeStats(neighborhoods, infra);
  const grid = document.getElementById("statGrid");
  const cards = [
    { label: "Total Alerts", value: s.total, icon: "bell", tone: "muted", bg: "cyan", foot: "Live, Nearby" },
    { label: "Critical", value: String(s.critical).padStart(2, "0"), icon: "shield", tone: "red", bg: "red", foot: "Severity Critical", critical: s.critical > 0 },
    { label: "Open Incidents", value: String(s.open).padStart(2, "0"), icon: "clock", tone: "orange", bg: "orange", foot: "Awaiting Response" },
    { label: "Zones Monitored", value: s.zonesMonitored, icon: "cityMap", tone: "green", bg: "green", foot: "Real Neighborhoods" },
    { label: "Avg Data Age", value: s.total ? formatAge(s.avgAgeSec) : "—", icon: "purpleClock", tone: "purple", bg: "purple", foot: "OSM / AQI Timestamp" },
    { label: "Infra Nearby", value: s.infraNearby, icon: "sensor", tone: "cyan", bg: "cyan", foot: "Cameras, Sensors, Grid…" },
  ];
  grid.innerHTML = cards.map((c) => `
    <div class="stat-card ${c.critical ? "stat-critical" : ""}">
      <div class="stat-icon bg-${c.bg} tone-${c.tone}">${icon(c.icon)}</div>
      <div class="stat-label">${c.label}</div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-foot tone-${c.tone}">${c.foot}</div>
    </div>
  `).join("");
}

// ---------------------------------------------------------------------------
// Filtering + feed
// ---------------------------------------------------------------------------

function populateDistrictFilter() {
  const sel = document.getElementById("filterDistrict");
  const current = sel.value;
  const names = [...new Set(incidents.map((i) => i.location.name).filter(Boolean))].sort();
  sel.innerHTML = `<option value="all">All Districts</option>` + names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  sel.value = names.includes(current) ? current : "all";
  if (sel.value !== current) state.district = sel.value;
}

function getFilteredIncidents() {
  const cutoff = Date.now() - state.hours * 3600000;
  return incidents.filter((i) => {
    if (state.severity !== "all" && i.severity !== state.severity) return false;
    if (state.type !== "all" && i.type !== state.type) return false;
    if (state.district !== "all" && i.location.name !== state.district) return false;
    if (new Date(i.startedAt).getTime() < cutoff) return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      const hay = `${i.id} ${i.title} ${i.location.name || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

function severityTone(sev) { return { critical: "red", high: "orange", medium: "yellow", low: "blue" }[sev] || "muted"; }

function renderFeed() {
  const tbody = document.getElementById("feedBody");
  const list = getFilteredIncidents();

  if (!list.length) {
    const reason = incidents.length
      ? "No incidents match the current filters."
      : "No hazards, roadworks, or AQI alerts are currently tagged near this location. Try monitoring a busier city with the search box on the map.";
    tbody.innerHTML = `<tr><td colspan="7" style="padding:32px 18px;text-align:center;color:var(--text-muted);">${reason}</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((i) => `
    <tr class="feed-row" data-id="${i.id}">
      <td><span class="sev-cell tone-${severityTone(i.severity)}">${icon(i.severity === "critical" ? "shield" : "warningTriangle")}${i.severity.charAt(0).toUpperCase() + i.severity.slice(1)}</span></td>
      <td>
        <div class="inc-title">${escapeHtml(i.title)}</div>
        <div class="inc-sub">${escapeHtml(i.description.slice(0, 46))}${i.description.length > 46 ? "…" : ""}</div>
      </td>
      <td>
        <div class="loc-primary">${escapeHtml(i.location.name || "Unclassified Area")}</div>
        <div class="loc-sub">${i.location.lat.toFixed(3)}, ${i.location.lng.toFixed(3)}</div>
      </td>
      <td class="time-cell" data-time-ago="${i.startedAt}">${timeAgo(i.startedAt)}</td>
      <td><span class="badge badge-${i.status}">${STATUS_LABEL[i.status]}</span></td>
      <td>
        <div class="resp-cell">${icon("team")}
          <div>
            <div class="resp-team">${escapeHtml(i.responsibleTeam)}</div>
            <div class="resp-units">${dispatched.has(i.id) ? "Dispatched" : "Not dispatched"}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="row-actions">
          <button data-action="view" data-id="${i.id}">VIEW</button>
          <button data-action="ack" data-id="${i.id}" ${acknowledged.has(i.id) ? "disabled" : ""}>${acknowledged.has(i.id) ? "ACKNOWLEDGED" : "ACKNOWLEDGE"}</button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".feed-row").forEach((row) => {
    row.addEventListener("click", (e) => { if (!e.target.closest("button")) selectIncident(row.dataset.id); });
  });
  tbody.querySelectorAll('button[data-action="view"]').forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); selectIncident(btn.dataset.id); });
  });
  tbody.querySelectorAll('button[data-action="ack"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectIncident(btn.dataset.id);
      acknowledged.add(btn.dataset.id);
      btn.textContent = "ACKNOWLEDGED";
      btn.disabled = true;
    });
  });
}

function refreshFeedTimes() {
  document.querySelectorAll("[data-time-ago]").forEach((el) => { el.textContent = timeAgo(el.dataset.timeAgo); });
}

// ---------------------------------------------------------------------------
// Details + timeline
// ---------------------------------------------------------------------------

function selectIncident(id) {
  selectedIncidentId = id;
  const incident = incidents.find((i) => i.id === id);
  if (!incident) return;

  document.getElementById("detailsSeverityBadge").outerHTML =
    `<span class="badge badge-${incident.severity}" id="detailsSeverityBadge">${incident.severity}</span>`;

  document.getElementById("detailsBody").innerHTML = `
    <div class="details-id-row"><span>SOURCE</span><span>${incident.source === "aqi" ? "Open-Meteo (live)" : "OpenStreetMap (live)"}</span></div>
    <div class="details-title">${escapeHtml(incident.title.toUpperCase())}</div>
    <div class="details-sub">${escapeHtml(incident.location.name || "Unclassified Area")}</div>
    <div class="details-grid">
      <div><div class="dg-label">Started</div><div class="dg-value">${formatClock(incident.startedAt)}</div></div>
      <div><div class="dg-label">Age</div><div class="dg-value" id="detailsDuration">${formatDuration(incident.startedAt)}</div></div>
      <div><div class="dg-label">Severity</div><div class="dg-value tone-${severityTone(incident.severity)}">${incident.severity}</div></div>
    </div>
    <div class="details-grid">
      <div><div class="dg-label">Coordinates</div><div class="dg-value" style="font-size:11px;">${incident.location.lat.toFixed(4)}, ${incident.location.lng.toFixed(4)}</div></div>
      <div><div class="dg-label">Estimated Impact</div><div class="dg-value tone-orange">${incident.estimatedImpact}</div></div>
      <div><div class="dg-label">Status</div><div class="dg-value">${STATUS_LABEL[incident.status]}</div></div>
    </div>
    <div class="details-desc-label">Description</div>
    <div class="details-desc">${escapeHtml(incident.description)}</div>
    <div class="details-actions">
      <button class="btn btn-primary" id="dispatchBtn" ${dispatched.has(incident.id) ? "disabled" : ""}>${dispatched.has(incident.id) ? "RESPONSE DISPATCHED" : "DISPATCH RESPONSE"}</button>
      <button class="btn btn-outline" id="flyToBtn">CENTER ON MAP</button>
    </div>
  `;

  document.getElementById("detailsTimeline").innerHTML = incident.timeline.map((t) => `
    <div class="timeline-item">
      <div class="t-dot" style="background:${SEVERITY_COLOR[incident.severity]}"></div>
      <div class="t-time">${formatClock(t.at)}</div>
      <div class="t-label">${escapeHtml(t.label)}</div>
      <div class="t-note">${escapeHtml(t.note)}</div>
    </div>
  `).join("");

  document.getElementById("dispatchBtn").addEventListener("click", () => {
    dispatched.add(incident.id);
    document.getElementById("dispatchBtn").textContent = "RESPONSE DISPATCHED";
    document.getElementById("dispatchBtn").disabled = true;
    renderFeed();
  });
  document.getElementById("flyToBtn").addEventListener("click", () => {
    map.flyTo([incident.location.lat, incident.location.lng], Math.max(map.getZoom(), 15));
  });

  if (markers[id]) map.panTo(markers[id].getLatLng());
}

function tickDuration() {
  if (!selectedIncidentId) return;
  const incident = incidents.find((i) => i.id === selectedIncidentId);
  const el = document.getElementById("detailsDuration");
  if (incident && el) el.textContent = formatDuration(incident.startedAt);
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

function buildPopupHtml(incident) {
  return `
    <div class="nexus-popup">
      <span class="badge badge-${incident.severity} pop-badge">${incident.severity}</span>
      <div class="pop-id">${incident.id}</div>
      <div class="pop-title">${escapeHtml(incident.title)}</div>
      <div class="pop-meta">
        <span>${escapeHtml(incident.location.name || "Unclassified Area")}</span>
        <span>Started: ${timeAgo(incident.startedAt)}</span>
      </div>
      <div class="pop-actions">
        <button class="primary" data-popup-action="view" data-id="${incident.id}">View Details</button>
        <button data-popup-action="dispatch" data-id="${incident.id}">Dispatch</button>
      </div>
    </div>`;
}

function renderZones(neighborhoods, infra, aqi) {
  infraLayers.zones.clearLayers();
  const uniq = {};
  neighborhoods.forEach((n) => { if (!uniq[n.name]) uniq[n.name] = n; });
  Object.values(uniq).slice(0, 8).forEach((n) => {
    const nearIncidents = incidents.filter((i) => distKm(n.lat, n.lon, i.location.lat, i.location.lng) < 1.5).length;
    const score = (nearIncidents > 0 ? 4 : 0) + (aqi && aqi.aqi > 150 ? 3 : 0);
    const st = statusFor(score);
    const html = `<div class="geo-tag ${st.cls}"><strong>${escapeHtml(n.name)}</strong><span>${st.label}</span></div>`;
    const geoIcon = L.divIcon({ className: "", html, iconSize: [130, 40], iconAnchor: [65, 20] });
    L.marker([n.lat, n.lon], { icon: geoIcon }).addTo(infraLayers.zones);
  });
}

function clearIncidentMarkers() {
  infraLayers.incidents.clearLayers();
  for (const k in markers) delete markers[k];
}

function renderIncidentMarkers() {
  clearIncidentMarkers();
  incidents.forEach((incident) => {
    const marker = L.marker([incident.location.lat, incident.location.lng], {
      icon: liveDivIcon(SEVERITY_COLOR[incident.severity], TYPE_ICON[incident.type]),
    }).bindPopup(buildPopupHtml(incident));
    marker.on("click", () => selectIncident(incident.id));
    marker.addTo(infraLayers.incidents);
    markers[incident.id] = marker;
  });
}

async function loadLiveIncidents(center) {
  currentCenter = center;
  layersPanel.setStatus("Loading live data…");

  const query = `[out:json][timeout:25];(
    node["hazard"](around:${INFRA_RADIUS_M},${center[0]},${center[1]});
    way["hazard"](around:${INFRA_RADIUS_M},${center[0]},${center[1]});
    node["emergency"="danger_area"](around:${INFRA_RADIUS_M},${center[0]},${center[1]});
    way["highway"="construction"](around:${INFRA_RADIUS_M},${center[0]},${center[1]});
    node["man_made"="surveillance"](around:3000,${center[0]},${center[1]});
    node["man_made"="monitoring_station"](around:3000,${center[0]},${center[1]});
    node["power"="substation"](around:3000,${center[0]},${center[1]});
    way["power"="substation"](around:3000,${center[0]},${center[1]});
    node["natural"="water"](around:3000,${center[0]},${center[1]});
    node["amenity"="drinking_water"](around:3000,${center[0]},${center[1]});
    node["highway"="traffic_signals"](around:3000,${center[0]},${center[1]});
    node["amenity"="police"](around:4000,${center[0]},${center[1]});
    node["place"~"^(suburb|neighbourhood|quarter|town)$"](around:${ZONE_RADIUS_M},${center[0]},${center[1]});
  );out center meta;`;

  let elements = [];
  let overpassOk = true;
  try {
    elements = await fetchOverpass(query);
  } catch {
    overpassOk = false;
  }

  let aqiReading = null;
  try { aqiReading = await fetchCurrentAqi(center[0], center[1]); } catch { /* AQI unavailable */ }

  Object.values(infraLayers).forEach((g) => g.clearLayers());
  const built = overpassOk ? buildIncidentsFromOverpass(elements, center) : { incidents: [], neighborhoods: [], infra: { cameras: [], sensors: [], power: [], water: [], traffic: [], police: [] } };

  incidents = built.incidents;
  const aqiIncident = aqiReading ? makeAqiIncident(aqiReading, center) : null;
  if (aqiIncident) incidents.push(aqiIncident);

  assignZoneNames(incidents, built.neighborhoods);
  renderIncidentMarkers();
  renderZones(built.neighborhoods, built.infra, aqiReading);
  renderStats(built.neighborhoods, built.infra);
  populateDistrictFilter();
  renderFeed();

  if (!overpassOk) {
    layersPanel.setStatus("Live data unavailable here (network/CSP blocked the request) — map tiles still work", "err");
  } else {
    layersPanel.setStatus(
      `Live: ${incidents.length} alerts · ${built.neighborhoods.length} zones · ${built.infra.cameras.length} cams · AQI ${aqiReading ? aqiReading.aqi : "—"}`,
      "ok"
    );
  }

  if (incidents.length && !incidents.find((i) => i.id === selectedIncidentId)) {
    selectIncident(incidents[0].id);
  } else if (!incidents.length) {
    document.getElementById("detailsBody").innerHTML = `<div class="details-empty">No live incidents found near this location right now.</div>`;
    document.getElementById("detailsTimeline").innerHTML = "";
  }
}

function initMap() {
  map = L.map("leafletMap", { zoomControl: false, attributionControl: true }).setView([CITY_CENTER.lat, CITY_CENTER.lng], CITY_ZOOM);
  addLiveTileLayer(map);
  Object.values(infraLayers).forEach((g) => g.addTo(map));

  const mapWrap = document.querySelector(".map-wrap");
  attachHud(mapWrap, map);
  attachYouAreHere(map);
  attachSearchBox(mapWrap, (place) => {
    const c = [parseFloat(place.lat), parseFloat(place.lon)];
    map.setView(c, CITY_ZOOM);
    loadLiveIncidents(c);
  });
  layersPanel = attachLayersPanel(mapWrap, map, [
    { key: "incidents", label: "Hazards & Incidents", group: infraLayers.incidents, defaultOn: true },
    { key: "zones", label: "Zone Status", group: infraLayers.zones, defaultOn: true },
    { key: "cameras", label: "Cameras", group: infraLayers.cameras, defaultOn: true },
    { key: "sensors", label: "Sensors", group: infraLayers.sensors, defaultOn: true },
    { key: "power", label: "Power Substations", group: infraLayers.power, defaultOn: false },
    { key: "water", label: "Water Points", group: infraLayers.water, defaultOn: false },
    { key: "traffic", label: "Traffic Signals", group: infraLayers.traffic, defaultOn: false },
    { key: "police", label: "Police", group: infraLayers.police, defaultOn: false },
  ], { posKey: "nexus-alerts-layers-pos" });

  document.getElementById("leafletMap").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-popup-action]");
    if (!btn) return;
    selectIncident(btn.dataset.id);
    if (btn.dataset.popupAction === "dispatch") {
      dispatched.add(btn.dataset.id);
      const dBtn = document.getElementById("dispatchBtn");
      dBtn.textContent = "RESPONSE DISPATCHED";
      dBtn.disabled = true;
      renderFeed();
    }
    map.closePopup();
  });

  document.getElementById("zoomInBtn").innerHTML = icon("plus");
  document.getElementById("zoomOutBtn").innerHTML = icon("minus");
  document.getElementById("locateBtn").innerHTML = icon("locate");
  document.getElementById("mapFullscreenBtn").innerHTML = icon("expand");
  document.getElementById("searchIcon").innerHTML = icon("search");

  document.getElementById("zoomInBtn").addEventListener("click", () => map.zoomIn());
  document.getElementById("zoomOutBtn").addEventListener("click", () => map.zoomOut());
  document.getElementById("locateBtn").addEventListener("click", () => {
    if (currentCenter) map.flyTo(currentCenter, CITY_ZOOM);
  });
  document.getElementById("mapFullscreenBtn").addEventListener("click", () => {
    const wrap = document.querySelector(".map-wrap");
    if (!document.fullscreenElement) wrap.requestFullscreen?.(); else document.exitFullscreen?.();
    setTimeout(() => map.invalidateSize(), 250);
  });

  setTimeout(() => map.invalidateSize(), 200);
  window.addEventListener("resize", () => map.invalidateSize());
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function initControls() {
  document.getElementById("filterType").addEventListener("change", (e) => { state.type = e.target.value; renderFeed(); });
  document.getElementById("filterDistrict").addEventListener("change", (e) => { state.district = e.target.value; renderFeed(); });
  document.getElementById("filterTime").addEventListener("change", (e) => { state.hours = Number(e.target.value); renderFeed(); });
  document.getElementById("searchInput").addEventListener("input", (e) => { state.search = e.target.value.trim(); renderFeed(); });
  document.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      state.severity = pill.dataset.sev;
      renderFeed();
    });
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

initControls();
initMap();
resolveStartCenter((center) => {
  map.setView(center, CITY_ZOOM);
  loadLiveIncidents(center);
});

refreshEvery(30, refreshFeedTimes);
setInterval(tickDuration, 1000);
setInterval(() => { if (currentCenter) loadLiveIncidents(currentCenter); }, REFRESH_MS);
