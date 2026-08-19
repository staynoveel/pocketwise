# NEXUS — Smart City Crisis Management Dashboard

**Innoverse 2026 · Team SMA-W1**

NEXUS is an operations dashboard for a city crisis-management centre. Ten
screens cover the city's critical systems — traffic, power, air quality,
water, physical security, and the incident queue that ties them together.

The core of the project is that **the maps and the air-quality readings are
real**. NEXUS is not a mockup of a dashboard; four of its screens run live
Leaflet maps against public APIs, resolve to the operator's actual location,
and render whatever OpenStreetMap and Open-Meteo return for that place right
now. Point it at Tehran, Boston, or Nairobi and it shows that city.

---

## Quick start

The project is plain HTML, CSS and JavaScript. There is no build step, no
package manager, and no server-side code.

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000
```

Open `index.html` (the login screen) and press **Secure Access** to enter the
command centre.

> **Serve it over HTTP — don't open the files with `file://`.** Browsers block
> `fetch()` and geolocation on `file://` origins, so the live data layers
> silently fail and you get an empty map. Any static server works
> (`python3 -m http.server`, `npx serve`, VS Code Live Server).

**Browser support:** any current Chrome, Edge, Firefox or Safari. Grant the
location permission when prompted to centre the maps on you; deny it and the
maps fall back to Tehran (35.7219 N, 51.3347 E) after ~8 seconds.

---

## The ten screens

| # | Screen | File | What it does |
|---|--------|------|--------------|
| 1 | Login | `index.html` | Entry screen for the command centre |
| 2 | Dashboard | `dashboard.html` | City-wide overview: system KPIs, map, live event feed |
| 3 | City Map | `city-map.html` | **Live map** — traffic signals, substations, transit stops, cameras, sensors from OSM |
| 4 | Traffic | `traffic.html` | Congestion by corridor, signal status, incident list |
| 5 | Power Grid | `power-grid.html` | Load, substation health, outage timeline |
| 6 | Air Quality | `air-quality.html` | **Live AQI** — current readings, 30-day history, per-zone map |
| 7 | Water System | `water-system.html` | Network schematic, reservoirs, pumps, valves, quality by zone |
| 8 | Security | `security.html` | **Live map** — cameras, police stations, hazards, zone status |
| 9 | Alerts & Incidents | `alerts.html` | **Live incidents** — the operational queue, filterable, with dispatch |
| 10 | Settings | `settings.html` | Report centre and system configuration |

Every screen shares one sidebar, one header, one brand mark and one design
system, and every sidebar entry links to a page that exists — there are no
dead or disabled entries left.

---

## What is real, and what is illustrative

We think being precise about this matters more than claiming everything is
live, so here is the honest breakdown.

### Genuinely live

**City Map, Security, Alerts & Incidents, Air Quality** run real
[Leaflet](https://leafletjs.com) maps with real tiles and real queries:

| Source | API | Used for |
|--------|-----|----------|
| OpenStreetMap **Overpass** | `overpass-api.de/api/interpreter` | Hazards, roadworks, danger areas, power substations, traffic signals, transit stops, surveillance cameras, monitoring stations, police stations, neighbourhood names |
| **Open-Meteo Air Quality** | `air-quality-api.open-meteo.com` | Current AQI and PM2.5 / PM10 / NO₂ / SO₂ / CO, plus 30 days of hourly history |
| **Nominatim** | `nominatim.openstreetmap.org` | Search box geocoding |
| **CARTO / OpenStreetMap tiles** | `basemaps.cartocdn.com`, `tile.openstreetmap.org` | Dark base map, with automatic fallback to plain OSM tiles if CARTO is unreachable |

All four are keyless and free — nothing to configure, no API key to paste in.

Also real on every page: **the clocks and timestamps**. Header clocks tick
from `new Date()`, and incident ages ("4 min ago") are computed from real
elapsed time, not typed in.

And on the live pages, the **stat cards are computed from the data**, not
hardcoded. The incident counts on Alerts and the pollutant readings on Air
Quality are derived from what the API actually returned; change the data and
the numbers change with it.

### Illustrative

**Dashboard, Traffic, Power Grid, Water System** and the **Settings** report
tables use
representative sample values. Cities do not publish free, keyless, real-time
feeds for grid load or signal-by-signal congestion, so those screens
demonstrate the interface an operator would use once a city connects its own
SCADA, traffic-management and water-utility systems.

The **login screen is a UI flow, not authentication.** It accepts any input
and navigates to the dashboard. It is deliberately not an access-control
boundary and is commented as such in the source.

Incident markers sourced from OSM are labelled honestly in their tooltips
(*"OSM-reported hazard/roadwork — not a live accident feed"*) rather than
being presented as live emergency dispatch.

---

## Architecture

```
.
├── index.html              login
├── dashboard.html          ┐
├── city-map.html           │
├── traffic.html            ├─ the ten screens
├── power-grid.html         │
├── air-quality.html        │
├── water-system.html       │
├── security.html           │
├── alerts.html             │
├── settings.html           ┘
│
├── assets/
│   ├── nexus-mark.png      the NEXUS knot, sidebar brand mark on every screen
│   └── favicon.png         the same mark, 64px, as the browser-tab icon
│
├── css/
│   └── style.css           design tokens + shared chrome
│
├── js/
│   ├── nav.js              single source of truth for the sidebar
│   ├── icons.js            the icon set
│   ├── utils.js            live clock, relative time, rings, sparklines
│   ├── data.js             shared constants (city centre, AQI + pollutant thresholds)
│   ├── livemap.js          the live-data layer — Overpass, Open-Meteo, Nominatim,
│   │                       tiles, geolocation, HUD, search, layers panel
│   ├── alerts.js           Alerts & Incidents
│   └── air-quality.js      Air Quality
│
└── vendor/                 third-party libraries, vendored locally
    ├── leaflet/            Leaflet 1.9.4 + marker images
    ├── leaflet.heat/       heatmap plugin
    └── chartjs/            Chart.js 4.4.4
```

**No CDN for libraries.** Leaflet, leaflet.heat and Chart.js are committed
into `vendor/` and loaded from disk. The dashboard renders and stays usable
on a venue's flaky conference Wi-Fi; only the live data itself needs the
network, and every fetch degrades gracefully when it is unavailable.

**Separation of concerns.** Markup is in the HTML, the design system is in
`css/style.css`, and the data layer is isolated in `js/data.js` and
`js/livemap.js` — so swapping a public API for a city's own backend means
editing one module, not ten pages.

---

## Design system

One palette, one type scale, one set of components, defined as CSS custom
properties in `css/style.css`:

| Token | Value | Role |
|-------|-------|------|
| `--bg` | `#080A0C` | Page background |
| `--panel` | `#101316` | Panel surface |
| `--border` | `#2A3035` | Panel borders |
| `--nexus-orange` | `#FF5A00` | Primary accent, active nav |
| `--nexus-cyan` | `#00D9D9` | Secondary accent, data |
| `--critical-red` | `#FF3B30` | Critical severity |
| `--warning-orange` | `#FF7A18` | Warning severity |
| `--yellow` | `#FFB020` | Elevated severity |
| `--normal-green` | `#18C77A` | Normal / operational |
| `--text-primary` | `#F2F2F2` | Body text |
| `--text-secondary` | `#8A9198` | Labels, secondary text |

The NEXUS knot is the brand mark on every screen except the login page, shown
in the primary accent at 34px in the sidebar and as the browser-tab icon.

Type is **Inter** for the interface and **JetBrains Mono** for numbers,
timestamps and coordinates, so figures stay aligned as they tick.

Severity always reads the same way across all ten screens — green normal,
yellow elevated, orange warning, red critical — and status is never signalled
by colour alone; every state carries a text label too.

The layout is responsive down to tablet width: the sidebar collapses to icons
below 1000px and becomes a drawer below 768px.

---

## Accessibility

- Every functional control is reachable and operable by keyboard. The map-layer
  toggles on the Traffic page are `role="checkbox"` with `aria-checked`, and
  respond to Space and Enter as well as the mouse; the sidebar, filters, search
  and buttons are native `<a>`, `<button>`, `<input>` and `<select>` elements.
- Visible focus rings on interactive controls.
- Colour is never the only carrier of meaning — severity, status and trend all
  have text labels alongside the colour.
- Contrast is measured, not assumed. Against the page (`#080A0C`) and panel
  (`#101316`) backgrounds, body text is 16.6:1, secondary text 5.8:1, and every
  status colour is between 5.2:1 and 10.6:1 — all clearing WCAG AA. The one
  exception is `--text-muted` at ~3.1:1, which is used only for de-emphasised
  labels and does not carry information on its own.
- Every page declares `lang="en"`.
- Sections with no page yet are marked `title="No page built for this section
  yet"` rather than presented as working links.

Known gap: the illustrative screens (Dashboard, Power Grid, Water System and
parts of Settings) contain elements styled as clickable — dropdowns, "view all" links —
that are not wired to behaviour. They are layout placeholders for a real
backend, and they are not keyboard-focusable because there is nothing yet to
activate.

## Known limitations

We would rather list these than have a judge find them.

- **Overpass is rate-limited.** It is a free community service; under load it
  can return an error page or drop the connection. When that happens the map
  keeps its tiles and reports the failure in the page status line instead of
  showing stale or invented data.
- **Traffic, Power Grid and Water System are illustrative** (see above).
- **The login screen does not authenticate.**
- **Air-quality history is a 30-day window**, which is what Open-Meteo's free
  tier serves; longer trends would need a stored backend.
- **Some corporate and school networks block Overpass and Open-Meteo.** If the
  live layers come up empty, that is usually the network, not the app —
  the maps and tiles will still render.

---

## Verification

The site is checked with [Playwright](https://playwright.dev) against a local
server. The suite asserts that every page loads with **no JavaScript errors
and no 404s**, that all ten sidebars render the same nine entries in the same
order with exactly one active item, that every internal link resolves, and
that the header clocks actually advance and match wall time.

---

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, ODbL. Air-quality data from
[Open-Meteo](https://open-meteo.com/) (CC BY 4.0). Base map tiles ©
[CARTO](https://carto.com/attributions). Built with
[Leaflet](https://leafletjs.com) and [Chart.js](https://www.chartjs.org).

Built by **Team SMA-W1** for **Innoverse 2026**.
