/* ==========================================================================
   NEXUS — Air Quality page logic
   ========================================================================== */

initNexusChrome("air-quality");

const CAT_COLOR = {
  good: "#3BD17B",
  moderate: "#EAB42F",
  unhealthy: "#FF8C22",
  "very-unhealthy": "#E33E3A",
  hazardous: "#9B6BFF",
};

const SENSOR_STATUS_COLOR = { online: "#3BD17B", delayed: "#EAB42F", offline: "#E33E3A" };

let aqMap = null;
let selectedZoneId = null;
let trendChart = null;
let currentRange = "24h";

// ---------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------

function computeAqStats() {
  const cityAqi = Math.round(AQ_ZONES.reduce((s, z) => s + z.aqi, 0) / AQ_ZONES.length);
  const cityCat = categorizeAqi(cityAqi);
  const cityTrend = AQ_ZONES.reduce((s, z) => s + z.trend, 0) / AQ_ZONES.length;

  const online = AIR_SENSORS.filter((s) => s.status === "online").length;
  const delayed = AIR_SENSORS.filter((s) => s.status === "delayed").length;
  const offline = AIR_SENSORS.filter((s) => s.status === "offline").length;
  const total = AIR_SENSORS.length;

  const zonesMonitored = AQ_ZONES.length;
  const criticalZones = AQ_ZONES.filter((z) =>
    ["unhealthy", "very-unhealthy", "hazardous"].includes(z.category)
  ).length;

  return { cityAqi, cityCat, cityTrend, online, delayed, offline, total, zonesMonitored, criticalZones };
}

function renderAqStats() {
  const s = computeAqStats();
  const grid = document.getElementById("statGrid");
  const trendUp = s.cityTrend >= 0;

  grid.innerHTML = `
    <div class="stat-card ${s.cityCat.category === "hazardous" || s.cityCat.category === "very-unhealthy" ? "stat-critical" : ""}">
      <div class="stat-icon bg-cyan tone-cyan">${icon("wind")}</div>
      <div class="stat-label">City AQI</div>
      <div class="stat-value">${s.cityAqi}</div>
      <div class="stat-foot cat-${s.cityCat.category}">${s.cityCat.label.toUpperCase()}
        <span style="display:inline-flex;align-items:center;gap:3px;margin-left:6px;color:${trendUp ? "var(--critical-red)" : "var(--normal-green)"};">
          <span style="display:inline-flex;transform:rotate(${trendUp ? "0deg" : "180deg"});width:11px;height:11px;">${icon("arrowUpCircle")}</span>${Math.abs(s.cityTrend).toFixed(1)}%
        </span>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon bg-green tone-green">${icon("sensor")}</div>
      <div class="stat-label">Sensors Online</div>
      <div class="stat-value">${s.online}/${s.total}</div>
      <div class="stat-foot tone-green">${Math.round((s.online / s.total) * 100)}% Operational</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon bg-cyan tone-cyan">${icon("cityMap")}</div>
      <div class="stat-label">Zones Monitored</div>
      <div class="stat-value">${s.zonesMonitored}</div>
      <div class="stat-foot tone-muted">Across City</div>
    </div>
    <div class="stat-card ${s.criticalZones > 0 ? "stat-critical" : ""}">
      <div class="stat-icon bg-red tone-red">${icon("warningTriangle")}</div>
      <div class="stat-label">Critical Zones</div>
      <div class="stat-value">${s.criticalZones}</div>
      <div class="stat-foot tone-red">Unhealthy or Worse</div>
    </div>
  `;
}

function renderSensorStatusRow() {
  const s = computeAqStats();
  document.getElementById("sensorStatusRow").innerHTML = `
    <span class="ss-item"><span class="ss-dot" style="background:${SENSOR_STATUS_COLOR.online}"></span><b>${s.online}</b>&nbsp;Online</span>
    <span class="ss-item"><span class="ss-dot" style="background:${SENSOR_STATUS_COLOR.delayed}"></span><b>${s.delayed}</b>&nbsp;Delayed</span>
    <span class="ss-item"><span class="ss-dot" style="background:${SENSOR_STATUS_COLOR.offline}"></span><b>${s.offline}</b>&nbsp;Offline</span>
    <span class="ss-item" style="margin-left:auto;color:var(--text-muted);">Network total: ${s.total} sensors</span>
  `;
}

// ---------------------------------------------------------------------------
// Zone details panel
// ---------------------------------------------------------------------------

function selectZone(id) {
  selectedZoneId = id;
  const zone = AQ_ZONES.find((z) => z.id === id);
  if (!zone) return;

  document.getElementById("detailsCatBadge").outerHTML =
    `<span class="badge" id="detailsCatBadge" style="color:${CAT_COLOR[zone.category]};background:${CAT_COLOR[zone.category]}22;">${zone.categoryLabel}</span>`;

  const trendUp = zone.trend >= 0;

  document.getElementById("zoneDetailsBody").innerHTML = `
    <div class="details-id-row"><span>SENSOR ID</span><span>${zone.sensorId}</span></div>
    <div class="details-title">${escapeHtml(zone.name.toUpperCase())}</div>
    <div class="details-sub">Zone ${zone.id}</div>

    <div class="details-grid">
      <div><div class="dg-label">AQI</div><div class="dg-value cat-${zone.category}">${zone.aqi}</div></div>
      <div><div class="dg-label">Category</div><div class="dg-value cat-${zone.category}">${zone.categoryLabel}</div></div>
      <div><div class="dg-label">Trend</div><div class="dg-value" style="color:${trendUp ? "var(--critical-red)" : "var(--normal-green)"}">${trendUp ? "+" : ""}${zone.trend.toFixed(1)}%</div></div>
    </div>

    <div class="details-desc-label">Pollutants</div>
    <div class="details-desc" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div>PM2.5 <b style="color:var(--text-primary)">${zone.pollutants.pm25} µg/m³</b></div>
      <div>PM10 <b style="color:var(--text-primary)">${zone.pollutants.pm10} µg/m³</b></div>
      <div>NO₂ <b style="color:var(--text-primary)">${zone.pollutants.no2} ppb</b></div>
      <div>SO₂ <b style="color:var(--text-primary)">${zone.pollutants.so2} ppb</b></div>
      <div>CO <b style="color:var(--text-primary)">${zone.pollutants.co} ppm</b></div>
    </div>

    <div class="details-desc-label">Last Update</div>
    <div class="details-desc"><span data-time-ago="${zone.lastUpdate}">${timeAgo(zone.lastUpdate)}</span> · ${formatClock(zone.lastUpdate)}</div>
  `;

  if (aqMarkers[id]) aqMap.panTo(aqMarkers[id].getLatLng());
}

// ---------------------------------------------------------------------------
// Zone list
// ---------------------------------------------------------------------------

function renderZoneList() {
  const list = document.getElementById("zoneList");
  list.innerHTML = AQ_ZONES
    .slice()
    .sort((a, b) => b.aqi - a.aqi)
    .map((z) => `
      <div class="aq-zone-row" data-id="${z.id}">
        <div class="zone-chip bg-cat-${z.category} cat-${z.category}">${z.aqi}</div>
        <div>
          <div class="zone-name">${escapeHtml(z.name)}</div>
          <div class="zone-cat cat-${z.category}">${z.categoryLabel} · updated <span data-time-ago="${z.lastUpdate}">${timeAgo(z.lastUpdate)}</span></div>
        </div>
        <div class="zone-trend" style="color:${z.trend >= 0 ? "var(--critical-red)" : "var(--normal-green)"}">${z.trend >= 0 ? "+" : ""}${z.trend.toFixed(1)}%</div>
      </div>
    `).join("");

  list.querySelectorAll(".aq-zone-row").forEach((row) => {
    row.addEventListener("click", () => selectZone(row.dataset.id));
  });
}

// ---------------------------------------------------------------------------
// Pollutants panel (city average)
// ---------------------------------------------------------------------------

function renderPollutants() {
  const avg = (key) => AQ_ZONES.reduce((s, z) => s + z.pollutants[key], 0) / AQ_ZONES.length;
  const rows = [
    { key: "pm25", label: "PM2.5", value: avg("pm25") },
    { key: "pm10", label: "PM10", value: avg("pm10") },
    { key: "no2", label: "NO₂", value: avg("no2") },
    { key: "so2", label: "SO₂", value: avg("so2") },
    { key: "co", label: "CO", value: avg("co") },
  ];

  document.getElementById("pollutantsList").innerHTML = rows.map((r) => {
    const value = r.key === "co" ? r.value.toFixed(1) : Math.round(r.value);
    const limit = POLLUTANT_LIMITS[r.key];
    const pct = Math.min(100, (r.value / limit.max) * 100);
    const status = pollutantStatus(r.key, r.value);
    return `
      <div class="pollutant-row">
        <div class="pollutant-name">${r.label}</div>
        <div class="pollutant-bar-track"><div class="pollutant-bar-fill" style="width:${pct}%;background:${{ red: "var(--critical-red)", orange: "var(--warning-orange)", yellow: "var(--yellow)", green: "var(--normal-green)" }[status.tone]}"></div></div>
        <div class="pollutant-value">${value} <span style="color:var(--text-muted);font-size:10px;">${limit.unit}</span></div>
        <div class="pollutant-status tone-${status.tone}">${status.label}</div>
      </div>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// Leaflet map
// ---------------------------------------------------------------------------

const aqMarkers = {};

function initAqMap() {
  aqMap = L.map("leafletAirMap", { zoomControl: false, attributionControl: false })
    .setView([CITY_CENTER.lat, CITY_CENTER.lng], CITY_ZOOM);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(aqMap);

  AQ_ZONES.forEach((zone) => {
    const color = CAT_COLOR[zone.category];
    const marker = L.circleMarker([zone.location.lat, zone.location.lng], {
      radius: 16,
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.45,
    })
      .addTo(aqMap)
      .bindPopup(`
        <div class="nexus-popup">
          <span class="badge pop-badge" style="color:${color};background:${color}22;">${zone.categoryLabel}</span>
          <div class="pop-id">${zone.id} · ${zone.sensorId}</div>
          <div class="pop-title">${escapeHtml(zone.name)}</div>
          <div class="pop-meta">
            <span>AQI: ${zone.aqi}</span>
            <span>PM2.5: ${zone.pollutants.pm25} µg/m³ · PM10: ${zone.pollutants.pm10} µg/m³</span>
            <span>Updated: ${timeAgo(zone.lastUpdate)}</span>
          </div>
          <div class="pop-actions">
            <button class="primary" data-zone-action="view" data-id="${zone.id}">View Details</button>
          </div>
        </div>
      `);

    marker.on("click", () => selectZone(zone.id));
    aqMarkers[zone.id] = marker;
  });

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
  document.getElementById("locateBtn").addEventListener("click", () => {
    aqMap.flyTo([CITY_CENTER.lat, CITY_CENTER.lng], CITY_ZOOM);
  });
  document.getElementById("mapFullscreenBtn").addEventListener("click", () => {
    const wrap = document.querySelectorAll(".map-wrap")[0];
    if (!document.fullscreenElement) {
      wrap.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setTimeout(() => aqMap.invalidateSize(), 250);
  });
}

// ---------------------------------------------------------------------------
// Chart.js AQI trend
// ---------------------------------------------------------------------------

function renderTrendChart(range) {
  const data = buildAqiTrend(range);
  const ctx = document.getElementById("aqiTrendChart").getContext("2d");

  const datasets = [
    { label: "AQI", data: data.aqi, borderColor: "#13C6D1", backgroundColor: "#13C6D122", tension: 0.35, pointRadius: 0, borderWidth: 2.4 },
    { label: "PM2.5", data: data.pm25, borderColor: "#FF751C", backgroundColor: "#FF751C22", tension: 0.35, pointRadius: 0, borderWidth: 1.8 },
    { label: "PM10", data: data.pm10, borderColor: "#EAB42F", backgroundColor: "#EAB42F22", tension: 0.35, pointRadius: 0, borderWidth: 1.8 },
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
        tooltip: {
          backgroundColor: "#08131C",
          borderColor: "#182C38",
          borderWidth: 1,
          titleColor: "#E9F1F6",
          bodyColor: "#8CA0AD",
          padding: 10,
        },
      },
      scales: {
        x: { grid: { color: "#12212B" }, ticks: { color: "#4F6572", font: { size: 10 } } },
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

renderAqStats();
renderSensorStatusRow();
renderZoneList();
renderPollutants();
initAqMap();
initChartTabs();
renderTrendChart(currentRange);
selectZone(AQ_ZONES.slice().sort((a, b) => b.aqi - a.aqi)[0].id);

refreshEvery(30, () => {
  document.querySelectorAll("[data-time-ago]").forEach((el) => {
    el.textContent = timeAgo(el.dataset.timeAgo);
  });
});
