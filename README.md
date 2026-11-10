# Northbrand Weather

**Live:** [weather.northbrand.net](https://weather.northbrand.net) (Cloudflare Pages, project `northbrandweather`; also answers at northbrandweather.pages.dev)

A Northbrand Collective page: a plain, quick weather board for Abilene and the surrounding country, styled to the shared design DNA (Gold Bright amber accent on the Northbrand shell; the DNA lives in the northbrand-hub repo).

This repo is the archive of record. The live files are the static app in `~/workspace/cloudflare-sites/northbrandweather/`, published by direct upload to Cloudflare Pages. There is no refresh job: the page reads live weather data in the visitor's browser, so updating the site means editing the app files, redeploying, and committing the same files here.

## What the board shows

- A Leaflet radar map over Esri canvas basemaps, with place search and GPS
- A 12-hour microcast (wind, humidity, feels-like temperature, rainfall) and a 7-day outlook
- Aviation weather: METAR observations and TAF forecasts, decoded into plain label and value rows
- National Weather Service alerts, plus risk banners calibrated to the next 12 hours
- Sunrise and sunset, with every displayed time pinned to the forecast location's time zone

The board also runs in a kiosk mode on a work breakroom TV. An opt-in Nostalgia Mode (added 2026-11-09) overlays a retro Weather Channel style presentation (current conditions, local forecast, and animated radar on a 10-second rotation); it never changes the default dashboard.

## Files

- `index.html`: the page markup
- `styles.css`: the styles; theme values are the variables in `:root` at the top
- `app.js`: data fetching, rendering, the radar map, kiosk mode, and Nostalgia Mode
- `assets/`: icons and images
- `DESIGN.md`: this page's design record. The layout is frozen; theme changes go through the CSS variables only

## Data sources

- **National Weather Service** (`api.weather.gov`): forecasts, hourly and 7-day grids, station observations (METAR and TAF), and active alerts
- **RainViewer**: the animated radar frames used by Nostalgia Mode
- **OpenStreetMap / Nominatim**: place search
- **Sunrise-Sunset.org**: sunrise and sunset times

No API keys are required anywhere in the app.

### Basemap note

CARTO's basemap CDN now requires an API key, and unauthenticated requests still return tiles, but stamped with an `API KEY REQUIRED` watermark that showed through under the radar. The app therefore uses Esri's keyless Light and Dark Grey Canvas basemaps. To go back to CARTO, get a key from <https://carto.com/basemaps/> and set it in `CARTO_API_KEY` at the top of `app.js`; leaving it empty keeps the Esri basemaps.
