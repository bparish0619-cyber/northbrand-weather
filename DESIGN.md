# DESIGN.md: Northbrand Weather

The local design record for weather.northbrand.net. It sits under the Northbrand design DNA (~/workspace/northbrand-hub/DESIGN.md), which governs everything shared; this file governs what is specific to the weather page. Read both before restyling.

## 1. Theme

V1 "Ink and Amber" (chosen by Brandon 2026-10-28): the hub's dark dress applied to a data dashboard. Flat Northbrand Ink, hairline panels, serif title, and weather's local accent, amber, doing all the accent work the old sky blue used to do. Calm and legible at distance, because the page's main screen is a television.

Hard constraints (Brandon, 2026-10-28, do not relitigate):
- The layout is frozen. Same header, same sections, same grid, same kiosk behavior. Theme changes are variables, type, and the logo asset only.
- No avatar or character art of Zyra anywhere on this page, ever. It displays on a TV in a work breakroom via AbleSign on Google TV.
- app.js is behavior, not design space: data flow, radar, and kiosk parameters stay untouched by design passes.

## 2. Palette

All values live as variables in :root at the top of styles.css; retint there, never by hunting rules.
- Background: Ink `#14161c`, flat (no gradient, no glass blur since V1)
- Panel surface: `#1b1e27` (the old glass variables keep their names: --glass-bg, --glass-border, --glass-shadow)
- Hairline border: `#2c303e`
- Text: Paper `#f4f3ec`; Muted `#a7aabc`
- Accent: Amber `#fbbf24` (weather's local accent, the Gold Bright tint); hover Gold Bright `#e8b33c`
- Danger (alerts only): `#ef4444` family, unchanged, it is data meaning
- The radar map, its tiles, and the Leaflet pin keep their own colors: they are data, not theme.

## 3. Typography

- Site title: Georgia serif, 600 weight (the wordmark moment the DNA asks for). Kiosk mode shrinks it via the existing kiosk rules.
- Everything else: Inter, the page's long-standing stack, unchanged.
- Times render in 24-hour format (the app's clocks already do). No em dashes in page copy.

## 4. Components

- Header: gold serif "N" mark (the hub's favicon art, icon-512) in the existing logo slot at the existing sizes, site title beside it, clocks and controls unchanged.
- Panels: flat surface, 1px hairline border, 16px radius, one whisper shadow (0 2px 10px at 25 percent black).
- Accent moments: section headings, clocks, the solar strip, the search button, and the radar opacity slider (accent-color) all take var(--accent).
- Footer: the standard closing line above the credits, "A Northbrand Collective project · northbrand.net" with the link in the accent. Kiosk mode hides the footer by the app's own rule; that is expected and fine.

## 5. Layout

Frozen as shipped: top nav, alert strip, radar, 12-hour microcast, 7-day outlook, aviation, forecast discussion, footer. Dashboard width cap 1500px in the wrapper. Kiosk mode (body.kiosk-mode, driven by the app's URL parameters) compacts the header and enlarges section type for TV distance; theme tokens apply identically in both modes.

## 6. Depth

Flat. No backdrop blur, no glass, no stacked shadows. Hairlines separate; the single whisper shadow on panels is the ceiling.

## 7. Do's and Don'ts

Do:
- Change theme through the :root variables and the few marked rules (title, panels, slider) only
- Keep the risk banners calibrated (set 2026-10-28): they scan only the next 12 hours (RISK_WINDOW_HOURS in app.js), and Thunderstorm Risk needs substance, meaning the period text is stronger than "slight chance" or "isolated" wording, or its precipitation probability is at least 40 (THUNDER_POP_FLOOR). Official NWS alerts are never filtered. If the banners feel off again, retune those two numbers instead of rewriting the logic
- Keep every displayed time pinned to the forecast location's timezone (the NWS points response, stored as locationTimeZone in app.js; set 2026-10-28): the microcast labels, alert times, and sunrise/sunset all render through it. The breakroom TV's clock is set to UTC, and device time must never leak into a label again
- Keep both the regular and kiosk renders in mind: check the page with the AbleSign parameters after any theme touch (lat 32.4254, lon -99.8443, zoom 8, refresh 15, kiosk true)
- Keep the footer lockup wording exact

Don't:
- No layout changes, no new sections, no avatar or mascot art
- No blue accents: the old sky blue #38bdf8 and the indigo gradient are retired; if blue appears, it is a bug, except inside the map itself
- No new hues without updating the DNA file first

## 8. Responsive

The dashboard grid and breakpoints are the app's own and unchanged. On phones the page stacks by its existing rules; on the breakroom TV it runs at full width in kiosk mode. Tap targets were sized for the desktop and TV use this page actually gets.

## 9. Agent Prompt Guide

Tokens: Ink `#14161c`, Panel `#1b1e27`, Line `#2c303e`, Text `#f4f3ec`, Muted `#a7aabc`, Accent Amber `#fbbf24`, Accent Hover `#e8b33c`, radius 16px, Georgia serif title, Inter body, footer lockup "A Northbrand Collective project · northbrand.net".

Facts: master files live in ~/workspace/cloudflare-sites/northbrandweather/ (index.html, styles.css, app.js, assets/); deploy is a Cloudflare Pages direct upload to project northbrandweather, live at weather.northbrand.net; GitHub repo bparish0619-cyber/Northbrand-Weather is the archive of record. The breakroom TV reaches the page through AbleSign pointed at weather.northbrand.net with kiosk parameters (repointed from the old Vercel address on 2026-10-28). There is no refresh job; the app reads live National Weather Service data in the browser.

Prompt seed: "Theme this page with the Northbrand Weather design in ~/workspace/cloudflare-sites/northbrandweather/DESIGN.md: flat Ink #14161c, hairline panels, amber #fbbf24 as the only accent, Georgia serif title, hub gold N logo, layout and app behavior untouched, no avatar art, 24-hour times, no em dashes."
