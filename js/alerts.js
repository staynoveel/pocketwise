/* ==========================================================================
   NEXUS — Alerts & Incidents page logic
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
  active: "ACTIVE",
  monitoring: "MONITORING",
  investigating: "INVESTIGATING",
  resolved: "RESOLVED",
};

let selectedIncidentId = null;
let map = null;
const markers = {};

const state = {
  severity: "all",
  type: "all",
  district: "all",
  hours: 9999,
  search: "",
};

// ---------------------------------------------------------------------------
// Stat cards — always computed from INCIDENTS, never hardcoded
// ---------------------------------------------------------------------------

function computeStats() {
  const total = INCIDENTS.length;
  const critical = INCIDENTS.filter((i) => i.severity === "critical" && i.status !== "resolved").length;
  const open = INCIDENTS.filter((i) => i.status === "open").length;
  const resolvedToday = INCIDENTS.filter((i) => i.status === "resolved").length;
  const escalated = INCIDENTS.filter((i) => i.escalated).length;

  const responseTimes = INCIDENTS
    .map((i) => {
      const notified = i.timeline.find((t) => t.label === "Response Team Notified");
      if (!notified) return null;
      return (new Date(notified.at) - new Date(i.startedAt)) / 1000;
    })
    .filter((v) => v !== null);
  const avgResponseSec = responseTimes.reduce((a, b) => a + b, 0) / (responseTimes.length || 1);

  return { total, critical, open, resolvedToday, escalated, avgResponseSec };
}

function renderStats() {
  const s = computeStats();
  const grid = document.getElementById("statGrid");

  const cards = [
    { label: "Total Alerts", value: s.total, icon: "bell", tone: "muted", bg: "cyan", foot: "All Time" },
    { label: "Critical", value: String(s.critical).padStart(2, "0"), icon: "shield", tone: "red", bg: "red", foot: "Active", critical: true },
    { label: "Open Incidents", value: String(s.open).padStart(2, "0"), icon: "clock", tone: "orange", bg: "orange", foot: "Awaiting Response" },
    { label: "Resolved", value: String(s.resolvedToday).padStart(2, "0"), icon: "checkCircle", tone: "green", bg: "green", foot: "Today" },
    { label: "Average Response", value: formatShortDuration(s.avgResponseSec), icon: "purpleClock", tone: "purple", bg: "purple", foot: "vs Yesterday" },
    { label: "Escalated", value: String(s.escalated).padStart(2, "0"), icon: "arrowUpCircle", tone: "purple", bg: "purple", foot: "Requires Attention" },
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
// Filtering
// ---------------------------------------------------------------------------

function populateDistrictFilter() {
  const sel = document.getElementById("filterDistrict");
  const names = [...new Set(INCIDENTS.map((i) => i.location.name.split(" · ")[0]))].sort();
  names.forEach((n) => {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    sel.appendChild(opt);
  });
}

function getFilteredIncidents() {
  const cutoff = Date.now() - state.hours * 3600000;
  return INCIDENTS.filter((i) => {
    if (state.severity !== "all" && i.severity !== state.severity) return false;
    if (state.type !== "all" && i.type !== state.type) return false;
    if (state.district !== "all" && !i.location.name.startsWith(state.district)) return false;
    if (new Date(i.startedAt).getTime() < cutoff) return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      const hay = `${i.id} ${i.title} ${i.location.name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

// ---------------------------------------------------------------------------
// Feed table
// ---------------------------------------------------------------------------

function renderFeed() {
  const tbody = document.getElementById("feedBody");
  const list = getFilteredIncidents();

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:32px 18px;text-align:center;color:var(--text-muted);">No incidents match the current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((i) => `
    <tr class="feed-row" data-id="${i.id}">
      <td>
        <span class="sev-cell tone-${severityTone(i.severity)}">${icon(i.severity === "critical" ? "shield" : "warningTriangle")}${i.severity.charAt(0).toUpperCase() + i.severity.slice(1)}</span>
      </td>
      <td>
        <div class="inc-title">${escapeHtml(i.title)}</div>
        <div class="inc-sub">${escapeHtml(i.description.slice(0, 46))}${i.description.length > 46 ? "…" : ""}</div>
      </td>
      <td>
        <div class="loc-primary">${escapeHtml(i.location.name.split(" · ")[0])}</div>
        <div class="loc-sub">Zone ${i.affectedZones.join(", ")}</div>
      </td>
      <td class="time-cell" data-time-ago="${i.startedAt}">${timeAgo(i.startedAt)}</td>
      <td><span class="badge badge-${i.status}">${STATUS_LABEL[i.status]}</span></td>
      <td>
        <div class="resp-cell">${icon("team")}
          <div>
            <div class="resp-team">${escapeHtml(i.responsibleTeam)}</div>
            <div class="resp-units">${i.unitsAssigned} Unit${i.unitsAssigned === 1 ? "" : "s"}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="row-actions">
          <button data-action="view" data-id="${i.id}">VIEW</button>
          <button data-action="ack" data-id="${i.id}">ACKNOWLEDGE</button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".feed-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      selectIncident(row.dataset.id);
    });
  });
  tbody.querySelectorAll('button[data-action="view"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectIncident(btn.dataset.id);
    });
  });
  tbody.querySelectorAll('button[data-action="ack"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectIncident(btn.dataset.id);
      btn.textContent = "ACKNOWLEDGED";
      btn.disabled = true;
    });
  });
}

function severityTone(sev) {
  return { critical: "red", high: "orange", medium: "yellow", low: "blue" }[sev] || "muted";
}

function refreshFeedTimes() {
  document.querySelectorAll("[data-time-ago]").forEach((el) => {
    el.textContent = timeAgo(el.dataset.timeAgo);
  });
}

// ---------------------------------------------------------------------------
// Incident details + timeline panel
// ---------------------------------------------------------------------------

function selectIncident(id) {
  selectedIncidentId = id;
  const incident = INCIDENTS.find((i) => i.id === id);
  if (!incident) return;

  document.getElementById("detailsSeverityBadge").outerHTML =
    `<span class="badge badge-${incident.severity}" id="detailsSeverityBadge">${incident.severity}</span>`;

  document.getElementById("detailsBody").innerHTML = `
    <div class="details-id-row">
      <span>INCIDENT ID</span>
      <span>${incident.id}</span>
    </div>
    <div class="details-title">${escapeHtml(incident.title.toUpperCase())}</div>
    <div class="details-sub">${escapeHtml(incident.location.name)}</div>

    <div class="details-grid">
      <div><div class="dg-label">Started</div><div class="dg-value">${formatClock(incident.startedAt)}</div></div>
      <div><div class="dg-label">Duration</div><div class="dg-value" id="detailsDuration">${formatDuration(incident.startedAt)}</div></div>
      <div><div class="dg-label">Severity</div><div class="dg-value tone-${severityTone(incident.severity)}">${incident.severity}</div></div>
    </div>
    <div class="details-grid">
      <div><div class="dg-label">Affected Zones</div><div class="dg-value">${incident.affectedZones.length} Zones</div></div>
      <div><div class="dg-label">Estimated Impact</div><div class="dg-value tone-orange">${incident.estimatedImpact}</div></div>
      <div><div class="dg-label">Status</div><div class="dg-value">${STATUS_LABEL[incident.status]}</div></div>
    </div>

    <div class="details-desc-label">Description</div>
    <div class="details-desc">${escapeHtml(incident.description)}</div>

    <div class="details-actions">
      <button class="btn btn-primary" id="dispatchBtn">DISPATCH RESPONSE</button>
      <button class="btn btn-outline">VIEW FULL DETAILS</button>
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
    document.getElementById("dispatchBtn").textContent = "RESPONSE DISPATCHED";
    document.getElementById("dispatchBtn").disabled = true;
  });

  if (markers[id]) {
    map.panTo(markers[id].getLatLng());
  }
}

function tickDuration() {
  if (!selectedIncidentId) return;
  const incident = INCIDENTS.find((i) => i.id === selectedIncidentId);
  const el = document.getElementById("detailsDuration");
  if (incident && el) el.textContent = formatDuration(incident.startedAt);
}

// ---------------------------------------------------------------------------
// Leaflet map
// ---------------------------------------------------------------------------

function buildMarkerIcon(incident) {
  const color = SEVERITY_COLOR[incident.severity];
  const pulse = incident.severity === "critical"
    ? `<span class="pulse" style="color:${color}"></span>`
    : "";
  const html = `
    <div class="nexus-marker">
      ${pulse}
      <span class="dot-core" style="background:${color};color:${color}">${icon(TYPE_ICON[incident.type])}</span>
    </div>`;
  return L.divIcon({ html, className: "", iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -14] });
}

function buildPopupHtml(incident) {
  return `
    <div class="nexus-popup">
      <span class="badge badge-${incident.severity} pop-badge">${incident.severity}</span>
      <div class="pop-id">${incident.id}</div>
      <div class="pop-title">${escapeHtml(incident.title)}</div>
      <div class="pop-meta">
        <span>${escapeHtml(incident.location.name)}</span>
        <span>Started: ${timeAgo(incident.startedAt)}</span>
        <span>Affected Zones: ${incident.affectedZones.length}</span>
      </div>
      <div class="pop-actions">
        <button class="primary" data-popup-action="view" data-id="${incident.id}">View Details</button>
        <button data-popup-action="dispatch" data-id="${incident.id}">Dispatch</button>
      </div>
    </div>`;
}

function initMap() {
  map = L.map("leafletMap", { zoomControl: false, attributionControl: false })
    .setView([CITY_CENTER.lat, CITY_CENTER.lng], CITY_ZOOM);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  INCIDENTS.forEach((incident) => {
    const marker = L.marker([incident.location.lat, incident.location.lng], {
      icon: buildMarkerIcon(incident),
    })
      .addTo(map)
      .bindPopup(buildPopupHtml(incident));

    marker.on("click", () => selectIncident(incident.id));

    markers[incident.id] = marker;
  });

  document.getElementById("leafletMap").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-popup-action]");
    if (!btn) return;
    selectIncident(btn.dataset.id);
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
    map.flyTo([CITY_CENTER.lat, CITY_CENTER.lng], CITY_ZOOM);
  });
  document.getElementById("mapFullscreenBtn").addEventListener("click", () => {
    const wrap = document.querySelector(".map-wrap");
    if (!document.fullscreenElement) {
      wrap.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setTimeout(() => map.invalidateSize(), 250);
  });
}

// ---------------------------------------------------------------------------
// Wire up controls
// ---------------------------------------------------------------------------

function initControls() {
  document.getElementById("filterType").addEventListener("change", (e) => {
    state.type = e.target.value;
    renderFeed();
  });
  document.getElementById("filterDistrict").addEventListener("change", (e) => {
    state.district = e.target.value;
    renderFeed();
  });
  document.getElementById("filterTime").addEventListener("change", (e) => {
    state.hours = Number(e.target.value);
    renderFeed();
  });
  document.getElementById("searchInput").addEventListener("input", (e) => {
    state.search = e.target.value.trim();
    renderFeed();
  });
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

renderStats();
populateDistrictFilter();
renderFeed();
initControls();
initMap();
selectIncident(INCIDENTS[0].id);

refreshEvery(30, () => {
  refreshFeedTimes();
  renderStats();
});
setInterval(tickDuration, 1000);
