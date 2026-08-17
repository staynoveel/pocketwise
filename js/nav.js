/* NEXUS — shared sidebar navigation + header chrome, used by every page. */

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard", href: null },
  { key: "city-map", label: "City Map", icon: "cityMap", href: null },
  { key: "traffic", label: "Traffic", icon: "traffic", href: null },
  { key: "power-grid", label: "Power Grid", icon: "powerGrid", href: null },
  { key: "air-quality", label: "Air Quality", icon: "airQuality", href: "air-quality.html" },
  { key: "water-system", label: "Water System", icon: "waterSystem", href: null },
  { key: "metro-transit", label: "Metro & Transit", icon: "metro", href: null },
  { key: "security", label: "Security", icon: "security", href: null },
  { key: "alerts-incidents", label: "Alerts & Incidents", icon: "alerts", href: "index.html" },
  { key: "analysis", label: "Analysis", icon: "analysis", href: null },
  { key: "reports", label: "Reports", icon: "reports", href: null },
  { key: "settings", label: "Settings", icon: "settings", href: null },
];

function initNexusChrome(activeKey) {
  const logoMark = document.getElementById("logoMark");
  if (logoMark) logoMark.innerHTML = icon("logo");

  const opAvatar = document.getElementById("opAvatar");
  if (opAvatar) opAvatar.innerHTML = icon("user");

  const menuBtn = document.getElementById("menuBtn");
  if (menuBtn) menuBtn.innerHTML = icon("menu");

  const nav = document.getElementById("sidebarNav");
  if (nav) {
    nav.innerHTML = NAV_ITEMS.map((item) => {
      const isActive = item.key === activeKey;
      const tag = item.href ? "a" : "div";
      const hrefAttr = item.href ? `href="${item.href}"` : "";
      const cls = `nav-item${isActive ? " active" : ""}${!item.href ? " disabled" : ""}`;
      return `<${tag} class="${cls}" ${hrefAttr} title="${item.href ? "" : "Not available in this demo"}">${icon(item.icon)}<span>${item.label}</span></${tag}>`;
    }).join("");
  }

  startLiveClock("clockTime", "clockDate");
  initSystemHealth();
}

function initSystemHealth() {
  const ringEl = document.getElementById("healthRing");
  const sparkEl = document.getElementById("healthSpark");
  if (!ringEl) return;

  const percent = 92;
  ringEl.innerHTML = renderRing(percent, { color: "#13C6D1" }) +
    `<div class="ring-value">${percent}%</div>`;

  if (sparkEl) {
    const points = [88, 90, 87, 91, 93, 92, 94, 92];
    sparkEl.innerHTML = renderSparkline(points, { stroke: "#3BD17B", width: 180, height: 24 });
  }
}
