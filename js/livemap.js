/* ==========================================================================
   NEXUS — shared live-map layer
   Real, free, keyless public APIs — no backend, no API key:
     - OpenStreetMap Overpass API  -> real nearby infrastructure/hazards
     - Open-Meteo Air Quality API  -> real current + historical AQI/pollutants
     - OpenStreetMap Nominatim     -> real city search / geocoding
     - navigator.geolocation       -> the operator's real position
   Honest limitation: there is no free, keyless, truly LIVE incident /
   crime / accident dispatch feed anywhere. Where this file stands in for
   one, it uses OSM's own hazard/roadwork tags as the closest real proxy —
   real data, but not a live 911-style feed. Each page says so explicitly.
   ========================================================================== */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const AQI_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function elLatLon(el) {
  if (el.lat != null && el.lon != null) return [el.lat, el.lon];
  if (el.center) return [el.center.lat, el.center.lon];
  return null;
}

async function fetchOverpass(query) {
  const res = await fetch(OVERPASS_URL, { method: "POST", body: query });
  if (!res.ok) throw new Error("overpass request failed");
  const data = await res.json();
  return data.elements || [];
}

async function geocodePlaces(q) {
  const url = `${NOMINATIM_URL}?format=jsonv2&q=${encodeURIComponent(q)}&limit=6`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!res.ok) throw new Error("geocode failed");
  return res.json();
}

/** Real current AQI + pollutant reading at a point (Open-Meteo, no key). */
async function fetchCurrentAqi(lat, lon) {
  const url = `${AQI_URL}?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("aqi request failed");
  const data = await res.json();
  const c = data.current;
  if (!c) return null;
  return {
    time: c.time,
    aqi: c.us_aqi,
    pm25: c.pm2_5,
    pm10: c.pm10,
    no2: c.nitrogen_dioxide,
    so2: c.sulphur_dioxide,
    co: c.carbon_monoxide,
  };
}

/** Real hourly AQI/PM history for the last N days (Open-Meteo, no key). */
async function fetchAqiHistory(lat, lon, pastDays) {
  const url = `${AQI_URL}?latitude=${lat}&longitude=${lon}&hourly=us_aqi,pm2_5,pm10&past_days=${pastDays}&forecast_days=0`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("aqi history failed");
  const data = await res.json();
  return data.hourly || null;
}

function statusFor(score) {
  if (score >= 6) return { cls: "critical", label: "CRITICAL" };
  if (score >= 4) return { cls: "high", label: "HIGH RISK" };
  if (score >= 2) return { cls: "warning", label: "WARNING" };
  return { cls: "", label: "NORMAL" };
}

/** Dark CartoDB tiles with an automatic fallback to plain OSM tiles. */
function addLiveTileLayer(map) {
  let failCount = 0;
  let usingFallback = false;
  let layer = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  layer.on("tileerror", () => {
    failCount++;
    if (failCount > 6 && !usingFallback) {
      usingFallback = true;
      map.removeLayer(layer);
      layer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
    }
  });
  return layer;
}

/** LAT/LON/ZOOM HUD chip, bottom-right of the map. */
function attachHud(mapWrap, map) {
  const hud = document.createElement("div");
  hud.className = "map-hud";
  hud.innerHTML = `<span id="hudLat">LAT —</span><span id="hudLon">LON —</span><span id="hudZoom">ZOOM —</span>`;
  mapWrap.appendChild(hud);

  const latEl = hud.querySelector("#hudLat");
  const lonEl = hud.querySelector("#hudLon");
  const zEl = hud.querySelector("#hudZoom");

  function update() {
    const c = map.getCenter();
    latEl.textContent = `LAT ${c.lat.toFixed(4)}°`;
    lonEl.textContent = `LON ${c.lng.toFixed(4)}°`;
    zEl.textContent = `ZOOM ${map.getZoom().toFixed(1)}×`;
  }
  map.on("move zoom", update);
  update();
}

/** Real city search box (Nominatim) — "monitor another location". */
function attachSearchBox(mapWrap, onSelectPlace) {
  const box = document.createElement("div");
  box.className = "map-search";
  box.innerHTML = `
    <input type="text" placeholder="Monitor another location…" autocomplete="off" />
    <div class="city-suggestions" hidden></div>
  `;
  mapWrap.appendChild(box);

  const input = box.querySelector("input");
  const suggBox = box.querySelector(".city-suggestions");
  let debounceId = null;

  function renderSuggestions(list) {
    if (!list.length) {
      suggBox.hidden = true;
      suggBox.innerHTML = "";
      return;
    }
    suggBox.innerHTML = list.map((item, i) =>
      `<div class="city-suggestion" data-i="${i}">${escapeHtml(item.display_name)}</div>`
    ).join("");
    suggBox.hidden = false;
    suggBox.querySelectorAll(".city-suggestion").forEach((el, i) => {
      el.addEventListener("click", () => {
        suggBox.hidden = true;
        input.value = list[i].display_name.split(",")[0];
        onSelectPlace(list[i]);
      });
    });
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(debounceId);
    if (q.length < 3) { renderSuggestions([]); return; }
    debounceId = setTimeout(async () => {
      try { renderSuggestions(await geocodePlaces(q)); }
      catch { renderSuggestions([]); }
    }, 400);
  });

  input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    try {
      const list = await geocodePlaces(q);
      if (list.length) { suggBox.hidden = true; onSelectPlace(list[0]); }
    } catch { /* no-op: keeps current view on a failed lookup */ }
  });

  document.addEventListener("click", (e) => {
    if (!suggBox.hidden && !suggBox.contains(e.target) && e.target !== input) suggBox.hidden = true;
  });

  return { input };
}

/**
 * Draggable "Map Layers" panel wired straight to real Leaflet layer groups.
 * layerDefs: [{ key, label, glyph, group, defaultOn }]
 */
function attachLayersPanel(mapWrap, map, layerDefs, opts = {}) {
  const panel = document.createElement("div");
  panel.className = "map-layers";
  panel.innerHTML = `
    <div class="layers-head" data-drag-handle>
      <span>MAP LAYERS<br><small>Drag to rearrange</small></span>
      <button data-close title="Hide panel">×</button>
    </div>
    <div class="live-status" data-status>Loading live data…</div>
    ${layerDefs.map((d) => `
      <label><input type="checkbox" data-layer="${d.key}" ${d.defaultOn ? "checked" : ""}> ${d.glyph || ""} ${d.label}</label>
    `).join("")}
    <button class="map-layers-reset" data-reset>Reset Layers</button>
  `;
  mapWrap.appendChild(panel);

  const reopenBtn = document.createElement("button");
  reopenBtn.className = "map-layers-reopen";
  reopenBtn.hidden = true;
  reopenBtn.textContent = "☰ MAP LAYERS";
  mapWrap.appendChild(reopenBtn);

  layerDefs.forEach((d) => {
    if (d.defaultOn) d.group.addTo(map);
    const input = panel.querySelector(`[data-layer="${d.key}"]`);
    input.addEventListener("change", () => {
      if (input.checked) map.addLayer(d.group); else map.removeLayer(d.group);
    });
  });

  panel.querySelector("[data-close]").addEventListener("click", () => {
    panel.hidden = true;
    reopenBtn.hidden = false;
  });
  reopenBtn.addEventListener("click", () => {
    panel.hidden = false;
    reopenBtn.hidden = true;
  });

  panel.querySelector("[data-reset]").addEventListener("click", () => {
    panel.style.left = "";
    panel.style.top = "";
    panel.style.right = "12px";
    try { localStorage.removeItem(opts.posKey || "nexus-layers-pos"); } catch { /* storage unavailable */ }
    layerDefs.forEach((d) => {
      const input = panel.querySelector(`[data-layer="${d.key}"]`);
      input.checked = !!d.defaultOn;
      input.dispatchEvent(new Event("change"));
    });
    opts.onReset && opts.onReset();
  });

  // --- dragging (pointer events cover mouse + touch) ---
  const handle = panel.querySelector("[data-drag-handle]");
  const posKey = opts.posKey || "nexus-layers-pos";
  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;

  function clamp(x, y) {
    const r = mapWrap.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    return {
      x: Math.max(8, Math.min(x, r.width - p.width - 8)),
      y: Math.max(8, Math.min(y, r.height - p.height - 8)),
    };
  }
  function applySaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(posKey));
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        panel.style.right = "auto";
        panel.style.left = saved.x + "px";
        panel.style.top = saved.y + "px";
      }
    } catch { /* ignore malformed/absent saved position */ }
  }
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    const r = panel.getBoundingClientRect();
    const mr = mapWrap.getBoundingClientRect();
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    ox = r.left - mr.left; oy = r.top - mr.top;
    panel.classList.add("dragging");
    handle.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const p = clamp(ox + e.clientX - sx, oy + e.clientY - sy);
    panel.style.right = "auto";
    panel.style.left = p.x + "px";
    panel.style.top = p.y + "px";
  });
  function stopDrag() {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove("dragging");
    try {
      localStorage.setItem(posKey, JSON.stringify({ x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }));
    } catch { /* storage unavailable */ }
  }
  handle.addEventListener("pointerup", stopDrag);
  handle.addEventListener("pointercancel", stopDrag);
  applySaved();

  const statusEl = panel.querySelector("[data-status]");
  return {
    setStatus(text, state) {
      statusEl.textContent = text;
      statusEl.classList.remove("ok", "err");
      if (state) statusEl.classList.add(state);
    },
  };
}

/** Real, continuously-updating "you are here" dot from the browser's geolocation. */
function attachYouAreHere(map) {
  let marker = null;
  function update(lat, lon) {
    const icon = L.divIcon({
      className: "",
      html: '<div class="you-are-here"><div class="yah-pulse"></div><div class="yah-dot"></div></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    if (!marker) marker = L.marker([lat, lon], { icon, zIndexOffset: 1000, interactive: false }).addTo(map).bindTooltip("You are here");
    else marker.setLatLng([lat, lon]);
  }
  if (navigator.geolocation && navigator.geolocation.watchPosition) {
    navigator.geolocation.watchPosition(
      (pos) => update(pos.coords.latitude, pos.coords.longitude),
      () => { /* silently skip if the browser denies/lacks geolocation */ },
      { enableHighAccuracy: true, maximumAge: 15000 }
    );
  }
}

/** Resolve a real starting center: the operator's own location, else CITY_CENTER. */
function resolveStartCenter(onReady) {
  let started = false;
  function once(center, label) {
    if (started) return;
    started = true;
    onReady(center, label);
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => once([pos.coords.latitude, pos.coords.longitude], "Your location"),
      () => once([CITY_CENTER.lat, CITY_CENTER.lng], CITY_CENTER.name),
      { enableHighAccuracy: true, timeout: 8000 }
    );
    setTimeout(() => once([CITY_CENTER.lat, CITY_CENTER.lng], CITY_CENTER.name), 8500);
  } else {
    once([CITY_CENTER.lat, CITY_CENTER.lng], CITY_CENTER.name);
  }
}

function liveDivIcon(colorVar, iconName) {
  const html = `<div class="nexus-marker"><span class="dot-core" style="background:${colorVar};color:${colorVar}">${icon(iconName)}</span></div>`;
  return L.divIcon({ html, className: "", iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -14] });
}
