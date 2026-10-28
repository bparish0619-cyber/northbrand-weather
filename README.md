# Northbrand Weather

**Live:** [weather.northbrand.net](https://weather.northbrand.net) (Cloudflare Pages, project `northbrandweather`; also answers at northbrandweather.pages.dev)

A Northbrand Collective page: a plain, quick weather board for Abilene and the surrounding country, styled to the shared design DNA (Gold Bright amber accent on the Northbrand shell; the DNA lives in the northbrand-hub repo).

This repo is the archive of record. The live files are the static app in `~/workspace/cloudflare-sites/northbrandweather/`, published by direct upload to Cloudflare Pages. There is no refresh job: the page reads live weather data in the visitor's browser, so updating the site means editing the app files, redeploying, and committing the same files here.

The original project notes follow, unedited.

---

**Northbrand Weather** is a professional-grade, high-performance web dashboard providing deep, proxy-less access into localized meteorological constraints via National Weather Service API pipelines. Designed from the ground up for power users, aviation enthusiasts, and meteorologists, the dashboard fuses rich mapping visuals with granular quantitative models native entirely to the client's web-browser.

## Features

- 🛰 **Live NEXRAD Nexus Radar:** High-density raw weather radar rendering directly atop dynamic basemaps, powered natively by Iowa State University's Mesonet WMS infrastructure.
- ⏱ **12-Hour Microcast:** View pinpoint hourly trajectories of Wind, Exact Humidity, "Feels Like" Apparent Temperatures, and dynamically aggregated Hourly Rainfall Rates down to the thousandth of an inch.
- 📆 **7-Day Atmospheric Outlook:** A full-width panoramic forecast detailing strict High/Low boundaries, 24-Hour Precipitation Totals mapped per day, and dynamically modeled weather context grids.
- ✈️ **Translated Aviation Telemetry:** Access natively processed `METAR` observation feeds and cleanly decoded `TAF` String models for immediate aviation terminal clarity, without needing third-party proxy tools.
- 🔴 **Dynamic Risk Expansion Text:** Severe thresholds native to the NWS API payload (such as SPC calculated Hail Size boundaries, Severe Wind vectors, or Tornado constraints) trigger full context Briefing notifications autonomously if breached.
- ☀ **Geometric Solar Tracking:** Secure mathematical offsets map exact Sunrise and Sunset boundaries rigidly calibrated locally to the active `LCL/ZULU` internal clocks.

## Tech Stack
- **HTML5 / CSS3** (Advanced structural CSS Grids & Premium Glassmorphism styling profiles).
- **Vanilla JavaScript Engine**: Extremely lightweight. Zero build-chains or complex dependencies inherently required for data execution (React/Node.js free).
- **Leaflet.js:** Fast native interactive cartography engine embedded.

### Data Sources
- **United States National Weather Service (`api.weather.gov`):** Raw point data, Quantitative precipitation grids, active textual alerts, and Terminal descriptions natively decoded natively via JS matrix hooks.
- **OpenStreetMap / Nominatim:** Real-time Geocoding search parameters.
- **Sunrise-Sunset.org**: Lightweight dynamic coordinate constraints for Solar timing offsets. 
- **Esri Canvas Basemaps (`server.arcgisonline.com`):** Keyless light/dark grey basemap tiles rendered beneath the NEXRAD overlay.

## Getting Started

Because of its architecture natively traversing API streams built for modern web standards, Northbrand Weather is completely self-contained. 

1. `git clone` or Download the repository locally to your machine.
2. Double-click to open `index.html` natively within any modern web-browser. 
3. *That's it*. The internal UI architecture and telemetry hooks initialize upon window execution. Click the "GPS" tracker icon or utilize the primary search bar to inject new dynamic location tracking sequences. 

## Security & API Key Policies

Northbrand Weather intentionally utilizes completely open, proxy-free, authentication-exempt infrastructural pipelines. There are natively **0 API keys, passwords, or secret authorization tokens** within this codebase required to execute or scale the platform natively against tracking limits.

### Basemap tiles

The basemap previously used CARTO's public tile CDN. CARTO now requires an API key for
its basemaps, and unauthenticated requests still return tiles — but stamped with an
`API KEY REQUIRED` watermark, which showed through on the deployed site. The basemap
now uses Esri's Light/Dark Grey Canvas tiles, which need no key.

To go back to CARTO, get a key from <https://carto.com/basemaps/> and set it at the top
of `app.js`:

```js
const CARTO_API_KEY = 'your-key-here';
```

Leaving it empty keeps the keyless Esri basemaps.
