/* ==========================================================================
   NEXUS — shared time / formatting utilities
   All "live" values in the UI (clock, relative times, durations) are
   derived from real Date objects here — nothing is hardcoded text.
   ========================================================================== */

/** Live header clock — ticks every second from a real Date. */
function startLiveClock(timeElId, dateElId) {
  const timeEl = document.getElementById(timeElId);
  const dateEl = document.getElementById(dateElId);

  function tick() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    if (timeEl) timeEl.textContent = `${hh}:${mm}:${ss}`;
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
  }

  tick();
  setInterval(tick, 1000);
}

/** "2 min ago", "1h 12m ago", "just now" — computed from a real ISO timestamp. */
function timeAgo(isoTimestamp) {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));

  if (sec < 15) return "just now";
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;

  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  if (hr < 24) return remMin ? `${hr}h ${remMin}m ago` : `${hr}h ago`;

  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

/** mm:ss or hh:mm:ss live duration between an ISO start and now. */
function formatDuration(isoStart, isoEnd) {
  const startMs = new Date(isoStart).getTime();
  const endMs = isoEnd ? new Date(isoEnd).getTime() : Date.now();
  const totalSec = Math.max(0, Math.floor((endMs - startMs) / 1000));

  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "12m 45s" style short duration, for averages etc. */
function formatShortDuration(totalSeconds) {
  const s = Math.round(totalSeconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  return `${m}m ${String(rem).padStart(2, "0")}s`;
}

/** Formats an ISO timestamp as a local HH:MM:SS clock string. */
function formatClock(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

/** Registers a callback to re-run on an interval (for periodic UI refresh of relative times). */
function refreshEvery(seconds, cb) {
  cb();
  setInterval(cb, seconds * 1000);
}

/** Minimal inline SVG sparkline from an array of numbers. */
function renderSparkline(values, opts = {}) {
  const w = opts.width || 100;
  const h = opts.height || 24;
  const stroke = opts.stroke || "#3BD17B";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/** Ring/donut progress SVG (percentage 0-100) used for System Health etc. */
function renderRing(percent, opts = {}) {
  const size = opts.size || 108;
  const stroke = opts.strokeWidth || 9;
  const color = opts.color || "#3BD17B";
  const track = opts.trackColor || "#12212B";
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
  </svg>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
