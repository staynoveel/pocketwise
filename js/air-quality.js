/* ==========================================================================
   NEXUS — Air Quality page logic

   REAL (live, free, keyless APIs, centered on the operator's real
   location or a searched place):
     - current AQI + PM2.5/PM10/NO2/SO2/CO reading  -> Open-Meteo Air Quality API
     - the AQI Trend chart (24H/7D/30D)              -> Open-Meteo's own hourly
       history for the same point (past_days), aggregated to daily for 7D/30D
     - "Monitored Zones" — real nearby neighbourhoods (OpenStreetMap Overpass),
       each queried individually against Open-Meteo for its own real reading
     - "Sensors" — a real count of OpenStreetMap-tagged monitoring stations
       nearby (see honest limitation below)
     - City AQI trend %, Critical Zones, Sensors Found, Zones Monitored —
       all computed from the above, nothing hardcoded

   Honest limitation: no free API exposes live per-sensor telemetry (online/
   delayed/offline). The Sensor panel shows a real count of OSM-tagged
   monitoring points and says so plainly, instead of fabricating a status
   breakdown for infrastructure this app has no live link to.
   ========================================================================== */

initNexusChrome("air-quality");

const CAT_COLOR = {
  good: "#3BD17B",
  moderate: "#EAB42F",
  unhealthy: "#FF8C22",
  "very-unhealthy": "#E33E3A",
  hazardous: "#9B6BFF",
};

const ZONE_RADIUS_M = 7000;
const SENSOR_RADIUS_M = 4000;
const MAX_ZONES = 6;
const REFRESH_MS = 120000;

let aqMap = null;
let selectedZoneId = null;
let trendChart = null;
let currentRange = "24h";
let currentCenter = null;
let primaryReading = null;
let aqiHistory = null;
let zones = [];
let sensorCount = 0;
let layersPanel = null;
const aqMarkers = {};
const zoneLayer = L.layerGroup();
const sensorLayer = L.layerGroup();
let heatLayer = null;

// ---------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------

function computeTrendPercent() {
  if (!aqiHistory || !aqiHistory.us_aqi || aqiHistory.us_aqi.length < 25) return 0;
  const series = aqiHistory.us_aqi.filter((v) => v != null);
  const last = series[series.length - 1];
  const dayAgo = series[Math.max(0, series.length - 25)];
  if (!dayAgo) return 0;
  return ((last - dayAgo) / dayAgo) * 100;
}

function renderAqStats() {
  const grid = document.getElementById("statGrid");
  const aqi = primaryReading ? primaryReading.aqi : null;
  const cat = aqi != null ? categorizeAqi(aqi) : { category: "moderate", label: "—" };
  const trendPct = computeTrendPercent();
  const trendUp = trendPct >= 0;
  const criticalZones = zones.filter((z) => ["unhealthy", "very-unhealthy", "hazardous"].includes(z.category)).length;

  grid.innerHTML = `
    <div class="stat-card ${cat.category === "hazardous" || cat.category === "very-unhealthy" ? "stat-critical" : ""}">
      <div class="stat-icon bg-cyan tone-cyan">${icon("wind")}</div>
      <div class="stat-label">City AQI (Live)</div>
      <div class="stat-value">${aqi != null ? aqi : "—"}</div>
      <div class="stat-foot cat-${cat.category}">${cat.label.toUpperCase()}
        <span style="display:inline-flex;align-items:center;gap:3px;margin-left:6px;color:${trendUp ? "var(--critical-red)" : "var(--normal-green)"};">
          <span style="display:inline-flex;transform:rotate(${trendUp ? "0deg" : "180deg"});width:11px;height:11px;">${icon("arrowUpCircle")}</span>${Math.abs(trendPct).toFixed(1)}% vs 24h ago
        </span>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon bg-green tone-green">${icon("sensor")}</div>
      <div class="stat-label">Sensors Found</div>
      <div class="stat-value">${sensorCount}</div>
      <div class="stat-foot tone-green">OpenStreetMap, Nearby</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon bg-cyan tone-cyan">${icon("cityMap")}</div>
      <div class="stat-label">Zones Monitored</div>
      <div class="stat-value">${zones.length}</div>
      <div class="stat-foot tone-muted">Real Neighborhoods</div>
    </div>
    <div class="stat-card ${criticalZones > 0 ? "stat-critical" : ""}">
      <div class="stat-icon bg-red tone-red">${icon("warningTriangle")}</div>
      <div class="stat-label">Critical Zones</div>
      <div class="stat-value">${criticalZones}</div>
      <div class="stat-foot tone-red">Unhealthy or Worse</div>
    </div>
  `;
}

function renderSensorStatusRow() {
  document.getElementById("sensorStatusRow").innerHTML = `
    <span class="ss-item"><span class="ss-dot" style="background:${CAT_COLOR.good}"></span><b>${sensorCount}</b>&nbsp;OpenStreetMap-tagged monitoring point${sensorCount === 1 ? "" : "s"} found within ${(SENSOR_RADIUS_M / 1000).toFixed(0)}km</span>
    <span class="ss-item" style="margin-left:auto;color:var(--text-muted);">No free API exposes live per-sensor status — locations only</span>
  `;
}

// ---------------------------------------------------------------------------
// Zone details panel
// ---------------------------------------------------------------------------

function selectZone(id) {
  selectedZoneId = id;
  const zone = zones.find((z) => z.id === id);
  if (!zone) return;

  document.getElementById("detailsCatBadge").outerHTML =
    `<span class="badge" id="detailsCatBadge" style="color:${CAT_COLOR[zone.category]};background:${CAT_COLOR[zone.category]}22;">${zone.categoryLabel}</span>`;

  document.getElementById("zoneDetailsBody").innerHTML = `
    <div class="details-id-row"><span>SOURCE</span><span>Open-Meteo (live)</span></div>
    <div class="details-title">${escapeHtml(zone.name.toUpperCase())}</div>
    <div class="details-sub">${zone.lat.toFixed(4)}, ${zone.lon.toFixed(4)}</div>
    <div class="details-grid">
      <div><div class="dg-label">AQI</div><div class="dg-value cat-${zone.category}">${zone.aqi ?? "—"}</div></div>
      <div><div class="dg-label">Category</div><div class="dg-value cat-${zone.category}">${zone.categoryLabel}</div></div>
      <div><div class="dg-label">Updated</div><div class="dg-value" style="font-size:11px;" data-time-ago="${zone.fetchedAt}">${timeAgo(zone.fetchedAt)}</div></div>
    </div>
    <div class="details-desc-label">Pollutants</div>
    <div class="details-desc" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div>PM2.5 <b style="color:var(--text-primary)">${zone.pollutants.pm25 ?? "—"} µg/m³</b></div>
      <div>PM10 <b style="color:var(--text-primary)">${zone.pollutants.pm10 ?? "—"} µg/m³</b></div>
      <div>NO₂ <b style="color:var(--text-primary)">${zone.pollutants.no2 ?? "—"} µg/m³</b></div>
      <div>SO₂ <b style="color:var(--text-primary)">${zone.pollutants.so2 ?? "—"} µg/m³</b></div>
      <div>CO <b style="color:var(--text-primary)">${zone.pollutants.co ?? "—"} µg/m³</b></div>
    </div>
  `;

  if (aqMarkers[id]) aqMap.panTo(aqMarkers[id].getLatLng());
}

// ---------------------------------------------------------------------------
// Zone list + pollutants (primary reading)
// ---------------------------------------------------------------------------

function renderZoneList() {
  const list = document.getElementById("zoneList");
  if (!zones.length) {
    list.innerHTML = `<div style="padding:28px 18px;text-align:center;color:var(--text-muted);font-size:12.5px;">No named neighborhoods found via OpenStreetMap within ${(ZONE_RADIUS_M / 1000).toFixed(0)}km of this location.</div>`;
    return;
  }
  list.innerHTML = zones.slice().sort((a, b) => (b.aqi ?? 0) - (a.aqi ?? 0)).map((z) => `
    <div class="aq-zone-row" data-id="${z.id}">
      <div class="zone-chip bg-cat-${z.category} cat-${z.category}">${z.aqi ?? "—"}</div>
      <div>
        <div class="zone-name">${escapeHtml(z.name)}</div>
        <div class="zone-cat cat-${z.category}">${z.categoryLabel} · updated <span data-time-ago="${z.fetchedAt}">${timeAgo(z.fetchedAt)}</span></div>
      </div>
    </div>
  `).join("");
  list.querySelectorAll(".aq-zone-row").forEach((row) => row.addEventListener("click", () => selectZone(row.dataset.id)));
}

function renderPollutants() {
  const p = primaryReading;
  const rows = [
    { key: "pm25", label: "PM2.5", value: p ? p.pm25 : null },
    { key: "pm10", label: "PM10", value: p ? p.pm10 : null },
    { key: "no2", label: "NO₂", value: p ? p.no2 : null },
    { key: "so2", label: "SO₂", value: p ? p.so2 : null },
    { key: "co", label: "CO", value: p ? p.co : null },
  ];
  document.getElementById("pollutantsList").innerHTML = rows.map((r) => {
    if (r.value == null) {
      return `<div class="pollutant-row"><div class="pollutant-name">${r.label}</div><div style="flex:1;color:var(--text-muted);font-size:11px;">No live reading</div></div>`;
    }
    // every pollutant is µg/m³ now, so they all round the same way
    const value = Math.round(r.value);
    const limit = POLLUTANT_LIMITS[r.key];
    const pct = Math.min(100, (r.value / limit.max) * 100);
    const status = pollutantStatus(r.key, r.value);
    const color = { red: "var(--critical-red)", orange: "var(--warning-orange)", yellow: "var(--yellow)", green: "var(--normal-green)" }[status.tone];
    return `
      <div class="pollutant-row">
        <div class="pollutant-name">${r.label}</div>
        <div class="pollutant-bar-track"><div class="pollutant-bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="pollutant-value">${value} <span style="color:var(--text-muted);font-size:10px;">${limit.unit}</span></div>
        <div class="pollutant-status tone-${status.tone}">${status.label}</div>
      </div>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// Live data loading
// ---------------------------------------------------------------------------

async function loadZones(center) {
  const query = `[out:json][timeout:25];(
    node["place"~"^(suburb|neighbourhood|quarter|town)$"](around:${ZONE_RADIUS_M},${center[0]},${center[1]});
  );out center;`;

  let elements = [];
  try { elements = await fetchOverpass(query); } catch { return []; }

  const uniq = {};
  elements.forEach((el) => {
    const ll = elLatLon(el);
    if (!ll || !el.tags?.name) return;
    if (!uniq[el.tags.name]) uniq[el.tags.name] = { name: el.tags.name, lat: ll[0], lon: ll[1] };
  });
  const picked = Object.values(uniq).slice(0, MAX_ZONES);

  const readings = await Promise.all(picked.map(async (n) => {
    try {
      const r = await fetchCurrentAqi(n.lat, n.lon);
      if (!r || r.aqi == null) return null;
      const cat = categorizeAqi(r.aqi);
      return {
        id: `Z-${n.name}`,
        name: n.name,
        lat: n.lat,
        lon: n.lon,
        aqi: Math.round(r.aqi),
        category: cat.category,
        categoryLabel: cat.label,
        pollutants: { pm25: r.pm25, pm10: r.pm10, no2: r.no2, so2: r.so2, co: r.co },
        fetchedAt: new Date().toISOString(),
      };
    } catch { return null; }
  }));

  return readings.filter(Boolean);
}

async function loadSensorCount(center) {
  const query = `[out:json][timeout:25];(
    node["man_made"="monitoring_station"](around:${SENSOR_RADIUS_M},${center[0]},${center[1]});
  );out center;`;
  try {
    const elements = await fetchOverpass(query);
    sensorLayer.clearLayers();
    elements.forEach((el) => {
      const ll = elLatLon(el);
      if (ll) L.marker(ll, { icon: liveDivIcon(CAT_COLOR.good, "gauge") }).bindTooltip("Monitoring station (OSM)").addTo(sensorLayer);
    });
    return elements.length;
  } catch {
    return 0;
  }
}

function renderZoneMarkers() {
  zoneLayer.clearLayers();
  Object.keys(aqMarkers).forEach((k) => delete aqMarkers[k]);
  const heatPts = [];

  zones.forEach((zone) => {
    const color = CAT_COLOR[zone.category];
    const marker = L.circleMarker([zone.lat, zone.lon], { radius: 16, color, weight: 2, fillColor: color, fillOpacity: 0.45 })
      .bindPopup(`
        <div class="nexus-popup">
          <span class="badge pop-badge" style="color:${color};background:${color}22;">${zone.categoryLabel}</span>
          <div class="pop-id">${escapeHtml(zone.name)}</div>
          <div class="pop-title">AQI ${zone.aqi ?? "—"}</div>
          <div class="pop-meta">
            <span>PM2.5: ${zone.pollutants.pm25 ?? "—"} µg/m³ · PM10: ${zone.pollutants.pm10 ?? "—"} µg/m³</span>
            <span>Updated: ${timeAgo(zone.fetchedAt)}</span>
          </div>
          <div class="pop-actions"><button class="primary" data-zone-action="view" data-id="${zone.id}">View Details</button></div>
        </div>
      `);
    marker.on("click", () => selectZone(zone.id));
    marker.addTo(zoneLayer);
    aqMarkers[zone.id] = marker;
    if (zone.aqi != null) heatPts.push([zone.lat, zone.lon, Math.min(1, zone.aqi / 300)]);
  });

  if (primaryReading && primaryReading.aqi != null && currentCenter) {
    heatPts.push([currentCenter[0], currentCenter[1], Math.min(1, primaryReading.aqi / 300)]);
  }
  if (heatLayer) heatLayer.setLatLngs(heatPts);
}

async function loadLiveAirQuality(center) {
  currentCenter = center;
  layersPanel.setStatus("Loading live data…");

  let readingOk = true;
  try { primaryReading = await fetchCurrentAqi(center[0], center[1]); }
  catch { primaryReading = null; readingOk = false; }

  try { aqiHistory = await fetchAqiHistory(center[0], center[1], 30); }
  catch { aqiHistory = null; }

  zones = await loadZones(center);
  sensorCount = await loadSensorCount(center);

  renderZoneMarkers();
  renderAqStats();
  renderSensorStatusRow();
  renderZoneList();
  renderPollutants();
  renderTrendChart(currentRange);

  if (zones.length && !zones.find((z) => z.id === selectedZoneId)) selectZone(zones[0].id);
  else if (!zones.length) {
    document.getElementById("zoneDetailsBody").innerHTML = `<div class="details-empty">No named zones found nearby — try monitoring a busier city via the search box on the map.</div>`;
  }

  if (!readingOk) {
    layersPanel.setStatus("Live data unavailable here (network/CSP blocked the request) — map tiles still work", "err");
  } else {
    layersPanel.setStatus(`Live: AQI ${primaryReading.aqi ?? "—"} · ${zones.length} zones · ${sensorCount} sensors nearby`, "ok");
  }
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

function initAqMap() {
  aqMap = L.map("leafletAirMap", { zoomControl: false, attributionControl: true }).setView([CITY_CENTER.lat, CITY_CENTER.lng], CITY_ZOOM);
  addLiveTileLayer(aqMap);
  zoneLayer.addTo(aqMap);
  sensorLayer.addTo(aqMap);
  if (typeof L.heatLayer === "function") {
    heatLayer = L.heatLayer([], { radius: 34, blur: 28, maxZoom: 17, gradient: { 0.2: "#3BD17B", 0.5: "#EAB42F", 0.8: "#FF8C22", 1: "#E33E3A" } });
  }

  const mapWrap = document.querySelector(".map-wrap");
  attachHud(mapWrap, aqMap);
  attachYouAreHere(aqMap);
  attachSearchBox(mapWrap, (place) => {
    const c = [parseFloat(place.lat), parseFloat(place.lon)];
    aqMap.setView(c, CITY_ZOOM);
    loadLiveAirQuality(c);
  });

  const layerDefs = [
    { key: "zones", label: "Zone Readings", group: zoneLayer, defaultOn: true },
    { key: "sensors", label: "Monitoring Stations", group: sensorLayer, defaultOn: true },
  ];
  if (heatLayer) layerDefs.splice(1, 0, { key: "heatmap", label: "AQI Heatmap", group: heatLayer, defaultOn: true });
  layersPanel = attachLayersPanel(mapWrap, aqMap, layerDefs, { posKey: "nexus-air-layers-pos" });

  document.getElementById("leafletAirMap").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-zone-action]");
    if (!btn) return;
    selectZone(btn.dataset.id);
    aqMap.closePopup();
  });

  document.getElementById("zoomInBtn").innerHTML = icon("plus");
  document.getElementById("zoomOutBtn").innerHTML = icon("minus");
  document.getElementById("locateBtn").innerHTML = icon("locate");
  document.getElementById("mapFullscreenBtn").innerHTML = icon("expand");

  document.getElementById("zoomInBtn").addEventListener("click", () => aqMap.zoomIn());
  document.getElementById("zoomOutBtn").addEventListener("click", () => aqMap.zoomOut());
  document.getElementById("locateBtn").addEventListener("click", () => { if (currentCenter) aqMap.flyTo(currentCenter, CITY_ZOOM); });
  document.getElementById("mapFullscreenBtn").addEventListener("click", () => {
    const wrap = document.querySelectorAll(".map-wrap")[0];
    if (!document.fullscreenElement) wrap.requestFullscreen?.(); else document.exitFullscreen?.();
    setTimeout(() => aqMap.invalidateSize(), 250);
  });

  setTimeout(() => aqMap.invalidateSize(), 200);
  window.addEventListener("resize", () => aqMap.invalidateSize());
}

// ---------------------------------------------------------------------------
// Chart.js AQI trend — built entirely from real Open-Meteo hourly history
// ---------------------------------------------------------------------------

function buildTrendFromHistory(range) {
  if (!aqiHistory || !aqiHistory.time?.length) return { labels: [], aqi: [], pm25: [], pm10: [] };

  const n = aqiHistory.time.length;
  if (range === "24h") {
    const start = Math.max(0, n - 24);
    return {
      labels: aqiHistory.time.slice(start).map((t) => new Date(t + "Z").toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })),
      aqi: aqiHistory.us_aqi.slice(start),
      pm25: aqiHistory.pm2_5.slice(start),
      pm10: aqiHistory.pm10.slice(start),
    };
  }

  const dayMap = {};
  for (let i = 0; i < n; i++) {
    const day = aqiHistory.time[i].slice(0, 10);
    if (!dayMap[day]) dayMap[day] = { aqi: [], pm25: [], pm10: [] };
    if (aqiHistory.us_aqi[i] != null) dayMap[day].aqi.push(aqiHistory.us_aqi[i]);
    if (aqiHistory.pm2_5[i] != null) dayMap[day].pm25.push(aqiHistory.pm2_5[i]);
    if (aqiHistory.pm10[i] != null) dayMap[day].pm10.push(aqiHistory.pm10[i]);
  }
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  const days = Object.keys(dayMap).sort();
  const wanted = range === "7d" ? 7 : 30;
  const picked = days.slice(-wanted);
  return {
    labels: picked.map((d) => d.slice(5)),
    aqi: picked.map((d) => avg(dayMap[d].aqi)),
    pm25: picked.map((d) => avg(dayMap[d].pm25)),
    pm10: picked.map((d) => avg(dayMap[d].pm10)),
  };
}

function renderTrendChart(range) {
  if (typeof Chart === "undefined") {
    const wrap = document.querySelector(".chart-canvas-wrap");
    if (wrap) wrap.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--text-muted);font-size:12px;">Chart library failed to load — the rest of the page still works.</div>`;
    return;
  }

  const data = buildTrendFromHistory(range);
  const ctx = document.getElementById("aqiTrendChart").getContext("2d");

  const datasets = [
    { label: "AQI", data: data.aqi, borderColor: "#13C6D1", backgroundColor: "#13C6D122", tension: 0.35, pointRadius: 0, borderWidth: 2.4, spanGaps: true },
    { label: "PM2.5", data: data.pm25, borderColor: "#FF751C", backgroundColor: "#FF751C22", tension: 0.35, pointRadius: 0, borderWidth: 1.8, spanGaps: true },
    { label: "PM10", data: data.pm10, borderColor: "#EAB42F", backgroundColor: "#EAB42F22", tension: 0.35, pointRadius: 0, borderWidth: 1.8, spanGaps: true },
  ];

  if (trendChart) {
    trendChart.data.labels = data.labels;
    trendChart.data.datasets.forEach((ds, i) => { ds.data = datasets[i].data; });
    trendChart.update();
    return;
  }

  trendChart = new Chart(ctx, {
    type: "line",
    data: { labels: data.labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#8CA0AD", boxWidth: 12, font: { size: 11 } } },
        tooltip: { backgroundColor: "#08131C", borderColor: "#182C38", borderWidth: 1, titleColor: "#E9F1F6", bodyColor: "#8CA0AD", padding: 10 },
      },
      scales: {
        x: { grid: { color: "#12212B" }, ticks: { color: "#4F6572", font: { size: 10 }, maxTicksLimit: 12 } },
        y: { grid: { color: "#12212B" }, ticks: { color: "#4F6572", font: { size: 10 } } },
      },
    },
  });
}

function initChartTabs() {
  document.querySelectorAll(".chart-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".chart-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentRange = tab.dataset.range;
      renderTrendChart(currentRange);
    });
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

initAqMap();
initChartTabs();

resolveStartCenter((center) => {
  aqMap.setView(center, CITY_ZOOM);
  loadLiveAirQuality(center);
});

refreshEvery(30, () => {
  document.querySelectorAll("[data-time-ago]").forEach((el) => { el.textContent = timeAgo(el.dataset.timeAgo); });
});
setInterval(() => { if (currentCenter) loadLiveAirQuality(currentCenter); }, REFRESH_MS);
