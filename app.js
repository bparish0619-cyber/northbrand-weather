// app.js
document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.getElementById('search-form');
  const locationInput = document.getElementById('location-input');
  
  // Elements
  const alertsContainer = document.getElementById('alerts-container');
  const risksContainer = document.getElementById('risks-container');
  const hourlyGrid = document.getElementById('hourly-grid');
  const forecastGrid = document.getElementById('forecast-grid');
  const loadingIndicator = document.getElementById('loading-indicator');
  const metarStation = document.getElementById('metar-station');
  const metarData = document.getElementById('metar-data');
  const tafStation = document.getElementById('taf-station');
  const tafData = document.getElementById('taf-data');
  const discussionData = document.getElementById('discussion-data');
  const geoButton = document.getElementById('geo-button');
  const refreshSelect = document.getElementById('auto-refresh-select');
  const clockContainer = document.getElementById('clock-container');
  const solarContainer = document.getElementById('solar-container');
  
  // Initialize Collapsibles
  document.querySelectorAll('.section-header-toggle').forEach(header => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('collapsed');
    });
  });

  // Global State
  let map, radarLayer, locationMarker, warningsLayer;
  let isDarkMode = false;
  let baseLayer;
  let currentLat = null;
  let currentLon = null;
  // The forecast location's timezone (from the NWS points response, e.g.
  // "America/Chicago"). Every time on the page renders in THIS zone, never
  // the viewing device's, so a screen set to UTC still shows local weather
  // time. Set in fetchAllWeatherData once the points data lands.
  let locationTimeZone = null;
  let refreshTimerId = null;
  let clockTimerId = null;

  // ============================================================
  // DEFAULT LOCATION *** Brandon: change this to change the
  // city the page opens on ***
  //
  // The page loads this location automatically when the address
  // does not name a place (no lat/lon and no q in the URL) and
  // the visitor has not previously chosen "always use GPS".
  // It is also the fallback when an automatic GPS load fails,
  // so the dashboard never opens blank.
  //
  // Set to Abilene, TX on 2026-11-06 at Brandon's request.
  // Coordinates are Abilene city center.
  // To use a different starting city, change name, lat, and lon
  // here only: search, the GPS button, and URL parameters still
  // override this default exactly as before.
  // ============================================================
  const DEFAULT_LOCATION = {
    name: 'Abilene, TX',
    lat: 32.4487,
    lon: -99.7331
  };

  // Load the default location above and label the search box
  // with its name, so the starting city is visible on screen.
  function loadDefaultLocation() {
    locationInput.value = DEFAULT_LOCATION.name;
    fetchDashboardDataByCoords(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon);
  }

  // --- Basemap Provider ---
  // CARTO's basemap CDN now requires an API key. Anonymous requests still return
  // tiles, but they are stamped with an "API KEY REQUIRED" watermark, which is what
  // shows up over the radar in production. Leave CARTO_API_KEY empty to use the
  // keyless Esri Canvas basemaps, or paste a CARTO key here to go back to CARTO.
  const CARTO_API_KEY = '';

  const BASEMAP = CARTO_API_KEY
    ? {
        light: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?api_key=${CARTO_API_KEY}`,
        dark: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${CARTO_API_KEY}`,
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxNativeZoom: 20
      }
    : {
        light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        attribution: '&copy; OpenStreetMap contributors, &copy; Esri, HERE, Garmin',
        subdomains: 'abc',
        maxNativeZoom: 16
      };

  function initMap() {
    const initialUrlParams = new URLSearchParams(window.location.search);
    const initialZoom = parseInt(initialUrlParams.get('zoom')) || 4;
    map = L.map('radar-map').setView([39.828, -98.579], initialZoom); 
    
    map.on('zoomend', () => {
       if (currentLat !== null) updateURLParams();
    });

    baseLayer = L.tileLayer(BASEMAP.light, {
      attribution: BASEMAP.attribution,
      subdomains: BASEMAP.subdomains,
      maxNativeZoom: BASEMAP.maxNativeZoom,
      maxZoom: 20
    }).addTo(map);

    radarLayer = L.tileLayer.wms("https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi", {
        layers: 'nexrad-n0q-900913',
        format: 'image/png',
        transparent: true,
        opacity: 0.7
    }).addTo(map);

    // Active storm warnings/tracks overlay
    warningsLayer = L.tileLayer.wms("https://mesonet.agron.iastate.edu/cgi-bin/wms/us/wwa.cgi", {
        layers: 'warnings_c',
        format: 'image/png',
        transparent: true,
        opacity: 0.85
    }).addTo(map);

    const opacitySlider = document.getElementById('radar-opacity-slider');
    if (opacitySlider) {
      opacitySlider.addEventListener('input', (e) => {
        if (radarLayer) radarLayer.setOpacity(parseFloat(e.target.value));
      });
    }

    const themeBtn = document.getElementById('map-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        isDarkMode = !isDarkMode;
        themeBtn.innerText = isDarkMode ? "Switch to Light Map" : "Switch to Dark Map";
        baseLayer.setUrl(isDarkMode ? BASEMAP.dark : BASEMAP.light);
      });
    }
  }
  
  initMap();

  function formatMilitaryTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date)) return '';
    // Render in the forecast location's timezone (see locationTimeZone), not
    // the viewing device's. Falls back to the device timezone only if the
    // points data has not loaded yet or the zone name is unrecognized.
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: locationTimeZone || undefined,
        hourCycle: 'h23', hour: '2-digit', minute: '2-digit'
      }).formatToParts(date);
      const hh = parts.find(p => p.type === 'hour').value;
      const mm = parts.find(p => p.type === 'minute').value;
      return `${hh}${mm}`;
    } catch (e) {
      return `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
    }
  }

  // --- URL State Management ---
  function updateURLParams() {
    const url = new URL(window.location);
    if (currentLat !== null && currentLon !== null) {
      url.searchParams.set('lat', currentLat.toFixed(4));
      url.searchParams.set('lon', currentLon.toFixed(4));
      url.searchParams.delete('q');
    }
    if (map) {
      url.searchParams.set('zoom', map.getZoom());
    }
    if (refreshSelect && refreshSelect.value !== "0") {
      url.searchParams.set('refresh', refreshSelect.value);
    } else {
      url.searchParams.delete('refresh');
    }
    if (document.body.classList.contains('kiosk-mode')) {
      url.searchParams.set('kiosk', 'true');
    } else {
      url.searchParams.delete('kiosk');
    }
    // Nostalgia Mode rides the address the same way kiosk does, so an
    // AbleSign URL can carry it (see the Nostalgia Mode section below).
    if (document.body.classList.contains('nostalgia-mode')) {
      url.searchParams.set('nostalgia', 'on');
    } else {
      url.searchParams.delete('nostalgia');
    }
    window.history.replaceState({}, '', url);
  }

  // --- Auto Refresh Logic ---
  if (refreshSelect) {
    refreshSelect.addEventListener('change', (e) => { 
      setupAutoRefresh(parseInt(e.target.value)); 
      updateURLParams();
    });
  }

  function setupAutoRefresh(minutes) {
    if (refreshTimerId) clearInterval(refreshTimerId);
    if (minutes > 0 && currentLat !== null && currentLon !== null) {
      refreshTimerId = setInterval(() => {
        console.log(`Auto-refreshing dashboard data... (${minutes} min)`);
        fetchDashboardDataByCoords(currentLat, currentLon, true);
      }, minutes * 60 * 1000); // ms conversion
    }
  }

  // --- Clock & Solar Geometrics ---
  function startClocks(timeZone) {
    if (clockTimerId) clearInterval(clockTimerId);
    if (!timeZone) return;
    clockContainer.classList.remove('hidden');
    function update() {
      const now = new Date();
      try {
        const localStr = now.toLocaleTimeString('en-US', { timeZone: timeZone, hour12: false, hour: '2-digit', minute:'2-digit' });
        const zuluStr = now.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false, hour: '2-digit', minute:'2-digit' }) + 'Z';
        clockContainer.innerHTML = `<span class="clock-label">Local:</span> ${localStr} &nbsp; <span class="clock-label">Z:</span> ${zuluStr}`;
      } catch (e) {
        clockContainer.innerHTML = 'Clock Error';
      }
    }
    update();
    clockTimerId = setInterval(update, 60000);
  }

  async function fetchSunriseSunset(lat, lon) {
    if (!solarContainer) return;
    solarContainer.classList.add('hidden');
    try {
      const res = await fetch(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`);
      const data = await res.json();
      if (data.status === "OK") {
        // Output as strictly 24hr military time
        const sunrise = new Date(data.results.sunrise).toLocaleTimeString('en-US', {timeZone: locationTimeZone || undefined, hour12: false, hour: '2-digit', minute:'2-digit'});
        const sunset = new Date(data.results.sunset).toLocaleTimeString('en-US', {timeZone: locationTimeZone || undefined, hour12: false, hour: '2-digit', minute:'2-digit'});
        solarContainer.innerHTML = `☀ Rise: ${sunrise} | Set: ${sunset}`;
        solarContainer.classList.remove('hidden');
      }
    } catch(e) { } // safe fail
  }

  // --- Search & Geolocation Config ---
  function executeGeolocation(isAutoLoad = false) {
     if ("geolocation" in navigator) {
        if (geoButton) geoButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 8l-8 3.5 2.5 1.5 1.5 2.5z"></path></svg>`;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
             localStorage.setItem('alwaysUseGPS', 'true');
             const lat = pos.coords.latitude;
             const lon = pos.coords.longitude;
             locationInput.value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
             if (geoButton) geoButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 8l-8 3.5 2.5 1.5 1.5 2.5z"></path></svg>`;
             fetchDashboardDataByCoords(lat, lon);
          },
          (err) => {
             if (geoButton) geoButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 8l-8 3.5 2.5 1.5 1.5 2.5z"></path></svg>`;
             if (!isAutoLoad) {
               alert("Geolocation failed: " + err.message);
             } else {
               // An automatic GPS load failed (denied, timed out, or
               // no fix available): fall back to the default location
               // (Abilene, TX, see DEFAULT_LOCATION above) so the
               // dashboard still shows weather instead of opening blank.
               loadDefaultLocation();
             }
          }
        );
      } else {
         if (!isAutoLoad) {
           alert("Geolocation not supported by your browser.");
         } else {
           // Same fallback as the error case above: no geolocation
           // support on an automatic load means the default location.
           loadDefaultLocation();
         }
      }
  }

  if (geoButton) {
    geoButton.addEventListener('click', () => executeGeolocation(false));
  }

  // ============================================================
  // NOSTALGIA MODE (added 2026-11-09 at Brandon's request)
  //
  // A retro Weather Channel style full-screen skin over the modern
  // dashboard: a Current Conditions screen and a Local Forecast
  // screen that swap on a timer, over a scrolling bottom crawl.
  // OFF by default; the modern dashboard is never changed by it.
  //
  // Three ways in, checked in this order at load:
  //   1. ?nostalgia=on in the address (this is what AbleSign uses;
  //      ?nostalgia=off in the address forces the modern look).
  //   2. The choice remembered from the Nostalgia button in the
  //      top bar (localStorage, per device).
  //   3. The Nostalgia button itself, which flips the mode and
  //      remembers the choice for next time.
  // Ways out: the Exit button on the retro screen, the Esc key,
  // or the top bar button once you are back on the dashboard.
  //
  // It READS data the dashboard already fetched: the latest
  // station observation (updateNostalgiaConditions, called from
  // fetchAviation) and the forecast periods (nostalgiaPeriods, set
  // in fetchForecastExt). The radar screen MOVES the dashboard's
  // own map into the retro screen while it is up and moves it back
  // untouched when it leaves, and animates it as a loop of recent
  // RainViewer frames over the same map; the only request the mode
  // makes itself is that one RainViewer frame list.
  //
  // The screens rotate: Current Conditions, Local Forecast, Local
  // Radar. A screen joins the rotation only when its data exists.
  // The Area Forecast Discussion screen was tried on 2026-11-09
  // and removed the same day at Brandon's direction.
  //
  // *** Settings Brandon may want to change ***
  // SECONDS: how long each screen stays up per visit.
  // RADAR_FRAMES: how many past radar frames the loop plays.
  // RADAR_FRAME_MS: time per animation frame; smaller is faster.
  // RADAR_DEFAULT_ZOOM: the radar framing when the web address
  //   carries no zoom of its own (an address zoom always wins).
  //   Higher numbers are closer in; 8 is the local framing the
  //   AbleSign address uses, 4 is the whole country.
  // TICKER_SECONDS_PER_CHAR: crawl speed; smaller is faster.
  // ============================================================
  const NOSTALGIA = {
    SECONDS: { current: 10, forecast: 10, radar: 10 },
    RADAR_FRAMES: 8,
    RADAR_FRAME_MS: 700,
    RADAR_DEFAULT_ZOOM: 8,
    TICKER_SECONDS_PER_CHAR: 0.22
  };
  let nostalgiaOn = false;
  let nostalgiaObs = null;      // latest observation properties (metric, as NWS sends them)
  let nostalgiaStation = '';    // station id for the current observation, e.g. KABI
  let nostalgiaPeriods = [];    // forecast periods, reused for the crawl and forecast screen
  let nostalgiaCityLabel = '';  // "Abilene, TX", from the points response
  let nostalgiaCityShort = '';  // "Abilene"
  // The zoom the page was OPENED with, captured now, during the
  // first synchronous pass, before the app's own URL sync
  // (updateURLParams) starts rewriting the address to match the
  // map's current zoom. The radar screen honors this value, which
  // is what "zoom from the web address" means for AbleSign.
  const nostalgiaAddressZoom = parseInt(new URLSearchParams(window.location.search).get('zoom'), 10);
  let nostalgiaScreen = 'current'; // name of the screen currently up
  let nostalgiaTimers = [];     // interval ids, all cleared when the mode turns off
  let nostalgiaAdvanceId = null;   // timeout id for the next screen swap
  let nostalgiaRvLayers = [];      // RainViewer animation layers, on the map only during the radar screen
  let nostalgiaRvTimer = null;     // interval id for the radar animation
  let nostalgiaRvIdx = 0;          // animation frame currently showing
  let nostalgiaRvHold = false;     // true while pausing on the newest frame
  let nostalgiaRadarWasOn = false; // the dashboard's own radar layer was hidden for the animation

  const nxEl = id => document.getElementById(id);

  function setNostalgiaMode(on, remember = true) {
    nostalgiaOn = on;
    document.body.classList.toggle('nostalgia-mode', on);
    const screen = nxEl('nostalgia-screen');
    if (screen) screen.hidden = !on;
    const btn = nxEl('nostalgia-toggle');
    if (btn) btn.textContent = on ? 'Nostalgia: On' : 'Nostalgia: Off';
    if (remember) {
      try { localStorage.setItem('nostalgiaMode', on ? 'on' : 'off'); } catch (e) {}
    }
    nostalgiaTimers.forEach(clearInterval);
    nostalgiaTimers = [];
    if (nostalgiaAdvanceId) { clearTimeout(nostalgiaAdvanceId); nostalgiaAdvanceId = null; }
    stopNostalgiaRadarAnimation();
    if (on) {
      nostalgiaScreen = 'current';
      applyNostalgiaScreen();
      renderNostalgiaClock();
      renderNostalgiaObserved();
      // Fetch the radar animation frames now so the loop is ready
      // when the radar screen's turn comes.
      prepareNostalgiaRadarFrames();
      // 1s keeps the retro clock honest; 30s refreshes the
      // "Observed: X Min Ago" line; the rotation runs on its own
      // per-screen timeouts (see scheduleNostalgiaAdvance).
      nostalgiaTimers.push(setInterval(renderNostalgiaClock, 1000));
      nostalgiaTimers.push(setInterval(renderNostalgiaObserved, 30000));
      scheduleNostalgiaAdvance();
    } else {
      // Leaving the mode entirely: the radar map goes home first.
      restoreNostalgiaRadar();
    }
    updateURLParams();
  }

  // The screens in rotation order, with their panel ids and titles.
  // A screen is only offered when its data exists (checked in
  // nostalgiaScreensInRotation below).
  const NOSTALGIA_SCREENS = {
    current:  { panel: 'nx-panel-current',  title: 'Current Conditions' },
    forecast: { panel: 'nx-panel-forecast', title: 'Local Forecast' },
    radar:    { panel: 'nx-panel-radar',    title: 'Local Radar' }
  };

  function nostalgiaScreensInRotation() {
    const list = ['current'];
    if (nostalgiaPeriods.length > 0) list.push('forecast');
    list.push('radar');
    return list;
  }

  function scheduleNostalgiaAdvance() {
    if (!nostalgiaOn) return;
    if (nostalgiaAdvanceId) clearTimeout(nostalgiaAdvanceId);
    const seconds = NOSTALGIA.SECONDS[nostalgiaScreen] || 20;
    nostalgiaAdvanceId = setTimeout(() => {
      const list = nostalgiaScreensInRotation();
      const idx = list.indexOf(nostalgiaScreen);
      nostalgiaScreen = list[(idx + 1) % list.length];
      applyNostalgiaScreen();
      scheduleNostalgiaAdvance();
    }, seconds * 1000);
  }

  function applyNostalgiaScreen() {
    const title = nxEl('nx-screen-title');
    for (const [name, def] of Object.entries(NOSTALGIA_SCREENS)) {
      const panel = nxEl(def.panel);
      if (panel) panel.hidden = name !== nostalgiaScreen;
    }
    if (title) title.textContent = NOSTALGIA_SCREENS[nostalgiaScreen].title;
    // The radar map lives in the retro screen only while that
    // screen is up, and its animation loop runs only then; every
    // other screen sends it home first, animation off.
    if (nostalgiaScreen === 'radar') {
      moveNostalgiaRadarIn();
      startNostalgiaRadarAnimation();
    } else {
      restoreNostalgiaRadar();
    }
  }

  // --- The radar move ---
  // The dashboard's Leaflet map element is moved into the retro
  // screen's host div and back. Its home position is remembered the
  // first time, and Leaflet is told to re-measure after each move
  // (invalidateSize), which is all a moved Leaflet map needs.
  let nostalgiaRadarHome = null; // { parent, next } of #radar-map
  function moveNostalgiaRadarIn() {
    const host = nxEl('nx-radar-host');
    const mapEl = document.getElementById('radar-map');
    if (!host || !mapEl || mapEl.parentElement === host) return;
    if (!nostalgiaRadarHome) nostalgiaRadarHome = { parent: mapEl.parentElement, next: mapEl.nextSibling };
    host.appendChild(mapEl);
    mapEl.classList.add('nx-radar-map');
    settleNostalgiaRadarMap(true);
  }
  function restoreNostalgiaRadar() {
    stopNostalgiaRadarAnimation();
    const mapEl = document.getElementById('radar-map');
    if (!mapEl || !nostalgiaRadarHome || mapEl.parentElement === nostalgiaRadarHome.parent) return;
    nostalgiaRadarHome.parent.insertBefore(mapEl, nostalgiaRadarHome.next);
    mapEl.classList.remove('nx-radar-map');
    settleNostalgiaRadarMap(false);
  }
  // After a move, Leaflet must re-measure its container, and one
  // early attempt is not enough, so measure twice (next frames,
  // then a beat later). On the way IN, also re-assert the address
  // zoom without animation. Tiles for the wider overlay size then
  // stream in on their own, center first; do NOT redraw the tile
  // layers here, that would throw away the tiles already loaded.
  // Honor the zoom from the web address (Brandon, 2026-11-09): the
  // value captured at load, before the app's URL sync could rewrite
  // it. One exception, learned from Brandon's phone the same day:
  // the app itself writes zoom=4 into the address (its whole
  // country default), so an address zoom of 4 or wider carries no
  // framing intent and the radar screen frames the local area at
  // RADAR_DEFAULT_ZOOM instead. An address zoom closer than 4 (the
  // AbleSign address carries 8) always wins.
  function settleNostalgiaRadarMap(withZoom) {
    if (!map) return;
    const apply = () => {
      if (!map) return;
      map.invalidateSize();
      if (withZoom && nostalgiaScreen === 'radar') {
        const targetZoom = (!isNaN(nostalgiaAddressZoom) && nostalgiaAddressZoom > 4) ? nostalgiaAddressZoom : NOSTALGIA.RADAR_DEFAULT_ZOOM;
        map.setView([currentLat ?? DEFAULT_LOCATION.lat, currentLon ?? DEFAULT_LOCATION.lon], targetZoom, { animate: false });
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(apply));
    setTimeout(apply, 350);
  }

  // --- The radar animation loop ---
  // RainViewer publishes recent radar frames as ordinary Leaflet
  // tile layers. During the radar screen, the newest RADAR_FRAMES
  // frames are stacked on the map and cycled like the old broadcast
  // radar loops (color scheme 2 is RainViewer's "The Weather
  // Channel" palette, a fitting accident). The dashboard's own
  // NEXRAD layer steps aside while the loop plays so precipitation
  // is not drawn twice, and comes back when the screen leaves.
  // If the frame list cannot be fetched, the screen simply shows
  // the dashboard's normal radar, no harm done.
  let nostalgiaRvFramePaths = null; // { host, paths: [] } once fetched
  async function prepareNostalgiaRadarFrames() {
    if (nostalgiaRvFramePaths) return;
    try {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      const data = await res.json();
      const past = data?.radar?.past || [];
      if (past.length > 0) {
        nostalgiaRvFramePaths = {
          host: data.host || 'https://tilecache.rainviewer.com',
          paths: past.slice(-NOSTALGIA.RADAR_FRAMES).map(f => f.path)
        };
      }
    } catch (e) { /* the static radar still shows; nothing to report */ }
    // If the radar screen is already up (frames arrived late), start now.
    if (nostalgiaOn && nostalgiaScreen === 'radar') startNostalgiaRadarAnimation();
  }
  function startNostalgiaRadarAnimation() {
    if (!map || nostalgiaRvLayers.length > 0) return;
    if (!nostalgiaRvFramePaths) { prepareNostalgiaRadarFrames(); return; }
    const { host, paths } = nostalgiaRvFramePaths;
    if (radarLayer && map.hasLayer(radarLayer)) {
      map.removeLayer(radarLayer);
      nostalgiaRadarWasOn = true;
    }
    nostalgiaRvLayers = paths.map(p => L.tileLayer(`${host}${p}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: 0, zIndex: 500 }).addTo(map));
    nostalgiaRvIdx = nostalgiaRvLayers.length - 1;
    nostalgiaRvHold = false;
    showNostalgiaRadarFrame();
    nostalgiaRvTimer = setInterval(() => {
      // Pause one extra beat on the newest frame, like the old loops.
      if (nostalgiaRvIdx === nostalgiaRvLayers.length - 1 && !nostalgiaRvHold) { nostalgiaRvHold = true; return; }
      nostalgiaRvHold = false;
      nostalgiaRvIdx = (nostalgiaRvIdx + 1) % nostalgiaRvLayers.length;
      showNostalgiaRadarFrame();
    }, NOSTALGIA.RADAR_FRAME_MS);
  }
  function showNostalgiaRadarFrame() {
    nostalgiaRvLayers.forEach((layer, i) => layer.setOpacity(i === nostalgiaRvIdx ? 0.85 : 0));
  }
  function stopNostalgiaRadarAnimation() {
    if (nostalgiaRvTimer) { clearInterval(nostalgiaRvTimer); nostalgiaRvTimer = null; }
    if (map && nostalgiaRvLayers.length > 0) {
      nostalgiaRvLayers.forEach(layer => map.removeLayer(layer));
    }
    nostalgiaRvLayers = [];
    if (map && nostalgiaRadarWasOn && radarLayer && !map.hasLayer(radarLayer)) {
      radarLayer.addTo(map);
    }
    nostalgiaRadarWasOn = false;
  }

  // City labels on the logo box and the conditions panel.
  function renderNostalgiaChrome() {
    const city = nxEl('nx-city');
    if (city && nostalgiaCityLabel) city.textContent = nostalgiaCityLabel;
    const loc = nxEl('nx-loc');
    if (loc && nostalgiaCityShort) loc.textContent = nostalgiaCityShort;
  }

  // The retro clock, pinned to the forecast location's timezone like
  // every other time on this page (the TV's own clock may be UTC).
  // 24-hour, matching the rest of the page.
  function renderNostalgiaClock() {
    if (!nostalgiaOn) return;
    const clockEl = nxEl('nx-clock');
    const dateEl = nxEl('nx-date');
    if (!clockEl || !dateEl) return;
    try {
      const now = new Date();
      const tz = locationTimeZone || undefined;
      clockEl.textContent = now.toLocaleTimeString('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).formatToParts(now);
      const wd = parts.find(p => p.type === 'weekday').value.toUpperCase();
      const mo = parts.find(p => p.type === 'month').value.toUpperCase();
      const dy = parts.find(p => p.type === 'day').value;
      dateEl.textContent = `${wd} ${mo} ${dy}`;
    } catch (e) { /* clock keeps its last value */ }
  }

  function nostalgiaCompass(deg) {
    if (deg == null || isNaN(deg)) return '';
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  // Flat two-color icons in the old broadcast style, picked from the
  // condition words. Sun or moon depends on day or night.
  function nostalgiaIcon(text, isDay) {
    const t = (text || '').toLowerCase();
    const sunG = '<g><circle cx="28" cy="26" r="12" fill="#ffd23c"/><g stroke="#ffd23c" stroke-width="4" stroke-linecap="round"><line x1="28" y1="4" x2="28" y2="10"/><line x1="28" y1="42" x2="28" y2="48"/><line x1="6" y1="26" x2="12" y2="26"/><line x1="44" y1="26" x2="50" y2="26"/><line x1="12" y1="10" x2="17" y2="15"/><line x1="39" y1="37" x2="44" y2="42"/><line x1="44" y1="10" x2="39" y2="15"/><line x1="17" y1="37" x2="12" y2="42"/></g></g>';
    const moonG = '<path d="M44 6a24 24 0 1 0 16 38A27 27 0 0 1 44 6z" fill="#f4f3ec"/>';
    const cloudG = '<g fill="#eaf2ff"><circle cx="24" cy="44" r="10"/><circle cx="40" cy="35" r="14"/><circle cx="53" cy="45" r="9"/><rect x="15" y="43" width="46" height="11" rx="5.5"/></g>';
    const drops = '<g stroke="#7ec8ff" stroke-width="4" stroke-linecap="round"><line x1="26" y1="58" x2="23" y2="65"/><line x1="38" y1="58" x2="35" y2="65"/><line x1="50" y1="58" x2="47" y2="65"/></g>';
    const bolt = '<path d="M40 52 L29 65 L37 65 L33 71 L49 59 L41 59 L46 52 Z" fill="#ffe14d"/>';
    const flakes = '<g fill="#ffffff"><circle cx="26" cy="62" r="3"/><circle cx="38" cy="65" r="3"/><circle cx="50" cy="62" r="3"/></g>';
    const fogLines = '<g stroke="#cfd8ea" stroke-width="4" stroke-linecap="round"><line x1="18" y1="59" x2="54" y2="59"/><line x1="24" y1="66" x2="60" y2="66"/></g>';
    let inner;
    if (/thunder|storm|lightning/.test(t)) inner = cloudG + bolt;
    else if (/snow|flurr|blizzard|sleet|ice/.test(t)) inner = cloudG + flakes;
    else if (/rain|shower|drizzle/.test(t)) inner = cloudG + drops;
    else if (/fog|mist|haze|smoke/.test(t)) inner = cloudG + fogLines;
    else if (/partly|mostly sunny|mostly clear|mostly cloudy|few clouds|scattered/.test(t)) inner = (isDay ? sunG : moonG) + '<g transform="translate(10,14) scale(0.88)">' + cloudG + '</g>';
    else if (/cloud|overcast/.test(t)) inner = cloudG;
    else inner = isDay ? sunG : moonG;
    const label = (text || '').replace(/"/g, '');
    return `<svg viewBox="0 0 68 72" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">${inner}</svg>`;
  }

  // Called from fetchAviation with the same observation the aviation
  // card renders. NWS observations arrive metric (deg C, km/h,
  // meters, pascals); the retro screen shows Fahrenheit, mph, miles,
  // and inches of mercury, like the original broadcast screen.
  function updateNostalgiaConditions(props, station) {
    if (!props) return;
    nostalgiaObs = props;
    nostalgiaStation = station || '';
    const cToF = c => (c == null || isNaN(c)) ? null : Math.round(c * 1.8 + 32);
    const set = (id, val) => { const el = nxEl(id); if (el) el.textContent = val; };

    const tempF = cToF(props.temperature?.value);
    // The degree sign rides in its own span: the Silkscreen pixel font
    // draws its degree glyph like a plus sign at small sizes, so the
    // .nx-deg span renders it in a plain font where it reads cleanly.
    if (tempF != null) { const tEl = nxEl('nx-temp'); if (tEl) tEl.innerHTML = tempF + '<span class="nx-deg">&deg;</span>'; }
    const desc = props.textDescription || '';
    if (desc) set('nx-cond', desc);

    // Day or night for the icon, by the hour at the forecast location.
    let isDay = true;
    try {
      const h = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: locationTimeZone || undefined, hour: 'numeric', hourCycle: 'h23' }).format(new Date()), 10);
      if (!isNaN(h)) isDay = h >= 6 && h < 20;
    } catch (e) {}
    const iconEl = nxEl('nx-icon');
    if (iconEl && desc) iconEl.innerHTML = nostalgiaIcon(desc, isDay);

    if (props.windSpeed?.value != null) {
      const mph = Math.round(props.windSpeed.value * 0.621371);
      if (mph < 3) set('nx-wind', 'Wind: Calm');
      else {
        const dir = nostalgiaCompass(props.windDirection?.value);
        set('nx-wind', 'Wind: ' + (dir ? dir + ' ' : '') + mph + ' mph');
      }
    }
    if (props.relativeHumidity?.value != null) set('nx-hum', Math.round(props.relativeHumidity.value) + '%');
    const dewF = cToF(props.dewpoint?.value);
    if (dewF != null) { const dEl = nxEl('nx-dew'); if (dEl) dEl.innerHTML = dewF + '<span class="nx-deg">&deg;</span>'; }
    if (props.visibility?.value != null) {
      const miles = props.visibility.value * 0.000621371;
      set('nx-vis', (miles >= 9.95 ? '10' : miles.toFixed(1)) + ' Mi');
    }
    // Some observations carry sea-level pressure instead of station
    // pressure; either one reads the same on this screen. When the
    // feed reports neither (KABI's NWS feed currently sends both as
    // null), the row hides rather than showing a placeholder.
    const pressurePa = props.barometricPressure?.value ?? props.seaLevelPressure?.value;
    const presRow = nxEl('nx-row-pres');
    if (pressurePa != null) {
      const inHg = (pressurePa * 0.0002953).toFixed(1);
      set('nx-pres', nostalgiaStation ? `${inHg} (${nostalgiaStation})` : inHg);
      if (presRow) presRow.style.display = '';
    } else if (presRow) {
      presRow.style.display = 'none';
    }
    const stEl = nxEl('nx-ticker-station');
    if (stEl && nostalgiaStation) stEl.textContent = nostalgiaStation;
    renderNostalgiaObserved();
    renderNostalgiaChrome();
  }

  function renderNostalgiaObserved() {
    const el = nxEl('nx-obs');
    if (!el || !nostalgiaObs?.timestamp) return;
    const then = new Date(nostalgiaObs.timestamp).getTime();
    if (isNaN(then)) return;
    const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
    el.textContent = mins === 0 ? 'Just Now' : `${mins} Min Ago`;
  }

  // The bottom crawl: one line per forecast period, old LDL style.
  // The track holds two copies of the text and scrolls by half its
  // width, so the loop is seamless; speed scales with text length.
  function buildNostalgiaTicker() {
    const a = nxEl('nx-ticker-text');
    const b = nxEl('nx-ticker-text-2');
    if (!a || !b) return;
    let text;
    if (nostalgiaPeriods.length > 0) {
      text = nostalgiaPeriods.slice(0, 6).map(p => {
        const pop = p.probabilityOfPrecipitation?.value;
        const popTxt = pop == null ? '0' : String(Math.round(pop));
        return `${(p.name || '').toUpperCase()}: ${p.temperature} DEGREES, ${(p.shortForecast || '').toUpperCase()}, PRECIPITATION ${popTxt} PERCENT.`;
      }).join('   ');
    } else {
      text = 'NORTHBRAND WEATHER' + (nostalgiaCityLabel ? ' FOR ' + nostalgiaCityLabel.toUpperCase() : '');
    }
    text += '   ';
    a.textContent = text;
    b.textContent = text;
    const track = a.parentElement;
    if (track) track.style.animationDuration = Math.max(20, Math.round(text.length * NOSTALGIA.TICKER_SECONDS_PER_CHAR)) + 's';
  }

  // The Local Forecast screen: the next four periods, retro rows.
  function renderNostalgiaForecast() {
    const wrap = nxEl('nx-fc-rows');
    if (!wrap) return;
    if (nostalgiaPeriods.length === 0) { wrap.innerHTML = ''; return; }
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    wrap.innerHTML = nostalgiaPeriods.slice(0, 4).map(p => {
      const pop = p.probabilityOfPrecipitation?.value;
      const popTxt = (pop != null && pop > 0) ? Math.round(pop) + '%' : '';
      return `<div class="nx-fc-row"><span class="nx-fc-name">${esc(p.name)}</span><span class="nx-fc-icon">${nostalgiaIcon(p.shortForecast, p.isDaytime)}</span><span class="nx-fc-cond">${esc(p.shortForecast)}</span><span class="nx-fc-pop">${popTxt}</span><span class="nx-fc-temp">${p.temperature}<span class="nx-deg">&deg;</span></span></div>`;
    }).join('');
  }

  // Nostalgia Mode controls: top bar button, retro screen Exit
  // button, and the Esc key.
  const nostalgiaToggleBtn = nxEl('nostalgia-toggle');
  if (nostalgiaToggleBtn) nostalgiaToggleBtn.addEventListener('click', () => setNostalgiaMode(!nostalgiaOn));
  const nostalgiaExitBtn = nxEl('nostalgia-exit');
  if (nostalgiaExitBtn) nostalgiaExitBtn.addEventListener('click', () => setNostalgiaMode(false));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nostalgiaOn) setNostalgiaMode(false);
  });

  // Auto-Load & URL Param Parsing Hook
  const urlParams = new URLSearchParams(window.location.search);
  const pKiosk = urlParams.get('kiosk');
  const pRefresh = urlParams.get('refresh');
  const pLat = urlParams.get('lat');
  const pLon = urlParams.get('lon');
  const pQ = urlParams.get('q');

  if (pKiosk === 'true') {
     document.body.classList.add('kiosk-mode');
  }

  // Nostalgia Mode at load: the address wins over the remembered
  // choice, so ?nostalgia=off always gets the modern dashboard back
  // and ?nostalgia=on (the AbleSign address) always starts retro.
  const pNostalgia = urlParams.get('nostalgia');
  if (pNostalgia === 'on' || pNostalgia === '1' || pNostalgia === 'true') {
     setNostalgiaMode(true, false);
  } else if (pNostalgia !== 'off' && pNostalgia !== '0' && pNostalgia !== 'false') {
     let rememberedNostalgia = null;
     try { rememberedNostalgia = localStorage.getItem('nostalgiaMode'); } catch (e) {}
     if (rememberedNostalgia === 'on') setNostalgiaMode(true, false);
  }

  if (pRefresh && refreshSelect) {
     let optExists = Array.from(refreshSelect.options).some(o => o.value === pRefresh);
     if (!optExists) {
        refreshSelect.add(new Option(`${pRefresh} Minutes`, pRefresh));
     }
     refreshSelect.value = pRefresh;
  }

  if (pLat && pLon) {
     const lat = parseFloat(pLat);
     const lon = parseFloat(pLon);
     if (!isNaN(lat) && !isNaN(lon)) {
        locationInput.value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        fetchDashboardDataByCoords(lat, lon);
     }
  } else if (pQ) {
     locationInput.value = pQ;
     searchForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  } else if (localStorage.getItem('alwaysUseGPS') === 'true') {
     executeGeolocation(true);
  } else {
     // No place named in the URL and no saved GPS choice: open on
     // the default location (Abilene, TX, see DEFAULT_LOCATION
     // above). Before 2026-11-06 this branch did not exist, so a
     // plain visit to the page loaded no weather at all.
     loadDefaultLocation();
  }

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = locationInput.value.trim();
    if (!query) return;

    clearUI();
    loadingIndicator.classList.remove('hidden');

    try {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
      const geoData = await geoRes.json();
      if (!geoData || geoData.length === 0) throw new Error("Location not found.");
      fetchDashboardDataByCoords(geoData[0].lat, geoData[0].lon);
    } catch (err) { handleError(err); }
  });

  // --- Core API Processor Algorithm ---
  async function fetchDashboardDataByCoords(lat, lon, isRefresh = false) {
    currentLat = lat;
    currentLon = lon;
    if (geoButton) geoButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 8l-8 3.5 2.5 1.5 1.5 2.5z"></path></svg>`;

    if (refreshSelect) setupAutoRefresh(parseInt(refreshSelect.value));
    
    if (!isRefresh) {
      clearUI();
      loadingIndicator.classList.remove('hidden');
    }

    try {
      const liveUrlParams = new URLSearchParams(window.location.search);
      const zoomToUse = parseInt(liveUrlParams.get('zoom')) || 8;
      if (map) {
        map.invalidateSize();
        map.setView([lat, lon], zoomToUse);
      }
      if (locationMarker) map.removeLayer(locationMarker);
      locationMarker = L.marker([lat, lon]).addTo(map);
      
      if (radarLayer) map.removeLayer(radarLayer);
      radarLayer = L.tileLayer.wms("https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi?" + new Date().getTime(), {
          layers: 'nexrad-n0q-900913',
          format: 'image/png', transparent: true, opacity: 0.7
      }).addTo(map);

      if (warningsLayer) map.removeLayer(warningsLayer);
      warningsLayer = L.tileLayer.wms("https://mesonet.agron.iastate.edu/cgi-bin/wms/us/wwa.cgi?" + new Date().getTime(), {
          layers: 'warnings_c',
          format: 'image/png', transparent: true, opacity: 0.85
      }).addTo(map);

      const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
      if (!pointsRes.ok) throw new Error("Weather data not available for this location.");
      const pointsData = await pointsRes.json();

      // Pin the page timezone to the forecast location before anything
      // renders a time (solar strip, microcast labels, alert times).
      locationTimeZone = pointsData.properties.timeZone || null;

      // Nostalgia Mode labels its screens with the forecast location's
      // city and state from this same response (e.g. "Abilene, TX").
      const relLoc = pointsData.properties.relativeLocation?.properties;
      if (relLoc && relLoc.city) {
        nostalgiaCityShort = relLoc.city;
        nostalgiaCityLabel = relLoc.state ? `${relLoc.city}, ${relLoc.state}` : relLoc.city;
        renderNostalgiaChrome();
      }

      // Invoke Solar Parallel Execution (after the timezone is known, so
      // sunrise and sunset render in the location's zone)
      fetchSunriseSunset(lat, lon);

      startClocks(pointsData.properties.timeZone);

      const wfo = pointsData.properties.cwa;
      const forecastUrl = pointsData.properties.forecast;
      const gridUrl = pointsData.properties.forecastGridData;
      const forecastHourlyUrl = pointsData.properties.forecastHourly;
      const stationsUrl = pointsData.properties.observationStations;

      // Extract Grid Raw Properties
      let gridProps = null;
      try {
        const gridRes = await fetch(gridUrl);
        const gridData = await gridRes.json();
        gridProps = gridData.properties;
      } catch(e) { console.warn("Grid API Failed", e); }

      const fetches = [
        fetchForecastExt(forecastUrl, lat, lon, gridProps),
        fetchHourlyForecast(forecastHourlyUrl, gridProps),
        fetchAviation(stationsUrl),
        fetchDiscussion(wfo)
      ];

      await Promise.all(fetches);
      updateURLParams();
    } catch (err) {
      if (!isRefresh) handleError(err);
    } finally {
      loadingIndicator.classList.add('hidden');
    }
  }

  function handleError(err) {
      alertsContainer.innerHTML = `
        <div class="alert-banner">
          <div class="alert-header"><span class="alert-title">System Alert</span></div>
          <div class="alert-desc">${err.message || 'Failed to load weather data streams.'}</div>
        </div>
      `;
      loadingIndicator.classList.add('hidden');
  }

  // --- Translators & Utilities ---
  function getWeatherSVG(shortForecast, isDay) {
    if (!shortForecast) return '';
    const text = shortForecast.toLowerCase();
    let svg = '';
    if (text.includes('thunder') || text.includes('t-storm') || text.includes('lightning')) {
      svg = `<svg class="simple-icon-svg" viewBox="0 0 24 24"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>`;
    } else if (text.includes('rain') || text.includes('showers') || text.includes('drizzle')) {
      svg = `<svg class="simple-icon-svg" viewBox="0 0 24 24"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>`;
    } else if (text.includes('snow') || text.includes('ice') || text.includes('flurries')) {
      svg = `<svg class="simple-icon-svg" viewBox="0 0 24 24"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><path d="M8 16h.01"/><path d="M8 20h.01"/><path d="M12 18h.01"/><path d="M12 22h.01"/><path d="M16 16h.01"/><path d="M16 20h.01"/></svg>`;
    } else if (text.includes('cloud') || text.includes('overcast')) {
      svg = `<svg class="simple-icon-svg" viewBox="0 0 24 24"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
    } else {
      if (isDay) { 
        svg = `<svg class="simple-icon-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
      } else { 
        svg = `<svg class="simple-icon-svg" viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
      }
    }
    return svg;
  }

  function getGridVals(valuesArr, matchDateStr) {
     if (!valuesArr) return [];
     return valuesArr.filter(v => typeof v.validTime === 'string' && v.validTime.startsWith(matchDateStr)).map(v => v.value).filter(v => v !== null);
  }

  function getExactHourGridVal(valuesArr, exactTimeStr) {
     if (!valuesArr) return null;
     const targetTime = new Date(exactTimeStr).getTime();
     for (let v of valuesArr) {
        const parts = v.validTime.split('/'); // ["2026-04-11T16:00:00+00:00", "PT1H"]
        const start = new Date(parts[0]).getTime();
        let durationHours = 1;
        if (parts[1] && parts[1].includes('H')) {
           durationHours = parseInt(parts[1].replace('PT', '').replace('H', ''));
        }
        const end = start + (durationHours * 60 * 60 * 1000);
        
        if (targetTime >= start && targetTime < end) { return v.value; }
     }
     return null;
  }

  function getGridRateForHour(valuesArr, hourlyStartTimeStr) {
     if (!valuesArr) return 0;
     const targetTime = new Date(hourlyStartTimeStr).getTime();
     for (let v of valuesArr) {
        const parts = v.validTime.split('/');
        const start = new Date(parts[0]).getTime();
        let durationHours = 1;
        if (parts[1] && parts[1].includes('H')) {
           durationHours = parseInt(parts[1].replace('PT', '').replace('H', ''));
        }
        const end = start + (durationHours * 60 * 60 * 1000);
        
        if (targetTime >= start && targetTime < end) {
            return (v.value * 0.0393701) / durationHours; // mm to inches per hour
        }
     }
     return 0;
  }

  // --- Sub Routines ---
  async function fetchHourlyForecast(url, gridProps) {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const periods = data.properties.periods.slice(0, 12);
    
    let html = '';
    periods.forEach(p => {
      const timeStr = formatMilitaryTime(p.startTime);
      const icon = getWeatherSVG(p.shortForecast, p.isDaytime);
      
      const feelTempC = getExactHourGridVal(gridProps?.apparentTemperature?.values, p.startTime) ?? p.apparentTemperature?.value;
      const feelTempF = typeof feelTempC === 'number' ? Math.round((feelTempC * 9/5) + 32) : 'N/A';
      
      const gridRh = getExactHourGridVal(gridProps?.relativeHumidity?.values, p.startTime) ?? p.relativeHumidity?.value;
      const humidity = typeof gridRh === 'number' ? Math.round(gridRh) : 'N/A';
      
      const precipProb = p.probabilityOfPrecipitation?.value || 0;
      
      const rateInches = getGridRateForHour(gridProps?.quantitativePrecipitation?.values, p.startTime);
      const rateStr = rateInches > 0 ? rateInches.toFixed(2) : '0';

      html += `
        <div class="hourly-card glass-panel" style="min-width: 140px; align-items: stretch;">
          <div class="hourly-time" style="text-align: center;">${timeStr}</div>
          <div style="text-align:center;">${icon}</div>
          <div class="hourly-temp" style="text-align:center;">${p.temperature}&deg;</div>
          
          <div class="forecast-metric"><span class="label">Wind</span> <span> ${p.windSpeed || '0'}</span></div>
          <div class="forecast-metric"><span class="label">Feels Like</span> <span>${feelTempF}&deg;</span></div>
          <div class="forecast-metric"><span class="label">Humidity</span> <span>${humidity}%</span></div>
          <div class="forecast-metric"><span class="label">Precip</span> <span>${precipProb}%</span></div>
          <div class="forecast-metric" style="color:#fcd34d;"><span class="label">Rate</span> <span>${rateStr}"/hr</span></div>
        </div>
      `;
    });
    hourlyGrid.innerHTML = html;
  }

  async function fetchForecastExt(url, lat, lon, gridProps) {
    const [res, alertsRisks] = await Promise.all([ fetch(url), fetchAlertsExt(lat, lon) ]);
    if(!res.ok) return;
    const data = await res.json();
    const periods = data.properties.periods;

    // Nostalgia Mode reuses these same periods for its bottom crawl and
    // its Local Forecast screen; it never fetches anything itself.
    nostalgiaPeriods = periods;
    buildNostalgiaTicker();
    renderNostalgiaForecast();

    let html = '';
    let hasExtremeHeat = false, hasExtremeCold = false, hasSnowRisk = false, hasLightningRisk = false;

    // Grouping strictly by Date completely guarantees Day/Night structural order
    const groupedByDate = {};
    for (let p of periods) {
       const dateStr = p.startTime.split('T')[0];
       if (!groupedByDate[dateStr]) groupedByDate[dateStr] = { day: null, night: null };
       if (p.isDaytime) groupedByDate[dateStr].day = p;
       else groupedByDate[dateStr].night = p;
    }

    const validDates = Object.keys(groupedByDate).slice(0, 7);
    
    function minifyDesc(sc) {
       if (!sc) return '--';
       let s = sc.split(' then ')[0].split(' likely')[0];
       if (s.length > 25) s = s.split(' and ')[0];
       return s.trim();
    }

    for (const targetDate of validDates) {
      const g = groupedByDate[targetDate];
      const dayP = g.day;
      const nightP = g.night;
      const primary = dayP || nightP;
      if (!primary) continue;
      
      let highTemp = '-';
      let lowTemp = '-';
      if (dayP && nightP) {
         highTemp = Math.max(dayP.temperature, nightP.temperature);
         lowTemp = Math.min(dayP.temperature, nightP.temperature);
      } else if (dayP) { highTemp = lowTemp = dayP.temperature; }
      else if (nightP) { highTemp = lowTemp = nightP.temperature; }
      
      // NOTE (2026-10-28): the risk flags (heat, cold, snow, lightning) are no
      // longer set in this day loop. They are computed after the loop from the
      // raw periods inside a short look-ahead window; see "Risk calibration"
      // below. This loop only builds the 7-day cards now.

      const rainProb = dayP?.probabilityOfPrecipitation?.value || nightP?.probabilityOfPrecipitation?.value || 0;
      const windSpeed = primary.windSpeed;
      
      const rhVals = getGridVals(gridProps?.relativeHumidity?.values, targetDate);
      let rhStr = "N/A";
      if (rhVals.length > 0) rhStr = Math.round(rhVals.reduce((a,b)=>a+b,0)/rhVals.length) + "%";

      const atVals = getGridVals(gridProps?.apparentTemperature?.values, targetDate);
      let feelStr = "N/A";
      if (atVals.length > 0) {
         let avgC = atVals.reduce((a,b)=>a+b,0)/atVals.length;
         feelStr = Math.round((avgC * 9/5) + 32) + "&deg;F";
      }

      const precVals = getGridVals(gridProps?.quantitativePrecipitation?.values, targetDate);
      let precipAccumulationStr = '0.00"';
      if (precVals.length > 0) precipAccumulationStr = (precVals.reduce((a,b)=>a+b,0) * 0.0393701).toFixed(2) + `"`;

      const simpleIcon = getWeatherSVG(primary.shortForecast, primary.isDaytime);
      
      // Clean header (ignoring exact day.name which shifts unreliably)
      let cleanHeaderName = new Date(targetDate + "T12:00:00").toLocaleDateString('en-US', {weekday: 'long'});
      if (primary.name.toLowerCase() === 'today' || primary.name.toLowerCase() === 'tonight' || primary.name.toLowerCase() === 'this afternoon') {
          cleanHeaderName = 'Today';
      }

      html += `
        <div class="forecast-card glass-panel" style="align-items: stretch;">
          <div class="forecast-name" style="text-align:center;">${cleanHeaderName}</div>
          <div style="text-align:center;">${simpleIcon}</div>
          <div class="forecast-temp" style="justify-content:center;"><span class="high">H: ${highTemp}&deg;</span> <span class="low">L: ${lowTemp}&deg;</span></div>
          
          <div class="forecast-metric" style="flex-direction:column; align-items:flex-start; gap:6px; padding-top:8px;">
            <div style="font-size:0.85rem;"><span style="color:var(--accent); font-weight:700;">Day:</span> <span style="color:var(--text-muted);">${minifyDesc(dayP?.shortForecast)}</span></div>
            <div style="font-size:0.85rem;"><span style="color:var(--text-muted); font-weight:700;">Night:</span> <span style="color:var(--text-muted);">${minifyDesc(nightP?.shortForecast)}</span></div>
          </div>
          
          <!-- Detailed Block -->
          <div class="forecast-metric"><span class="label">Wind</span> <span> ${windSpeed}</span></div>
          <div class="forecast-metric"><span class="label">Precip</span> <span>${rainProb}%</span></div>
          <div class="forecast-metric" style="color:#fcd34d;"><span class="label">24 HR Precip</span> <span>${precipAccumulationStr}</span></div>
          <div class="forecast-metric"><span class="label">Humidity</span> <span>${rhStr}</span></div>
          <div class="forecast-metric"><span class="label">Feels Like</span> <span>${feelStr}</span></div>

          <!-- Kiosk-only second line (Option B, chosen 2026-10-28): on the TV
               the metric rows above are hidden, so rain and wind ride on this
               one line instead. The amount appears only when the forecast
               expects measurable precipitation. Hidden outside kiosk mode,
               where the metric rows already carry the same facts. -->
          <div class="forecast-subline"><span>Rain <b>${rainProb}%</b>${parseFloat(precipAccumulationStr) >= 0.05 ? `<span style="white-space:nowrap"> · <b>${precipAccumulationStr.replace('"', ' in')}</b> expected</span>` : ''}</span><span class="sub-wind">Wind <b>${primary.windDirection ? primary.windDirection + ' ' : ''}${windSpeed}</b></span></div>
        </div>
      `;
    }
    forecastGrid.innerHTML = html;

    // --- Risk calibration (set 2026-10-28 at Brandon's request) ---
    // The risk banners under the header (Heat Danger, Freeze Warning, Snow
    // Expected, Thunderstorm Risk) only look RISK_WINDOW_HOURS ahead instead
    // of scanning the whole 7-day outlook, so a marginal mention days out no
    // longer pins a banner to the top of the page. Thunder also has to be
    // more than a whisper: "slight chance" or "isolated" wording alone does
    // not flag unless that period's precipitation probability reaches
    // THUNDER_POP_FLOOR. To retune the banners, change these two numbers.
    // Official NWS alerts (the alert banners and their hail, wind, and
    // tornado risks) are NOT filtered here; they are in effect now by
    // definition and always show.
    const RISK_WINDOW_HOURS = 12;
    const THUNDER_POP_FLOOR = 40;
    const riskWindowEnd = Date.now() + RISK_WINDOW_HOURS * 3600 * 1000;
    for (const p of periods) {
      const starts = new Date(p.startTime).getTime();
      const ends = new Date(p.endTime).getTime();
      if (starts >= riskWindowEnd || ends <= Date.now()) continue; // outside the window
      const text = (p.shortForecast || '').toLowerCase();
      if (p.temperature >= 100) hasExtremeHeat = true;
      if (p.temperature <= 32) hasExtremeCold = true;
      if (text.includes('snow')) hasSnowRisk = true;
      if (text.includes('thunder')) {
        const pop = p.probabilityOfPrecipitation?.value ?? 0;
        const weakWording = text.includes('slight chance') || text.includes('isolated');
        if (pop >= THUNDER_POP_FLOOR || !weakWording) hasLightningRisk = true;
      }
    }

    // Compile Expansion Risk Blocks
    let allRisks = [...alertsRisks];
    if (hasExtremeHeat) allRisks.push({title:'Heat Danger', desc:'Temperatures over 100°F expected. Drink plenty of water and stay cool.'});
    if (hasExtremeCold) allRisks.push({title:'Freeze Warning', desc:'Temperatures dropping below 32°F. Protect plants and bring pets inside.'});
    if (hasSnowRisk) allRisks.push({title:'Snow Expected', desc:'Snow is in the forecast. Watch out for slick roads.'});
    if (hasLightningRisk) allRisks.push({title:'Thunderstorm Risk', desc:'Thunderstorms expected. Head indoors if you hear thunder.'});

    if (allRisks.length > 0) {
      risksContainer.innerHTML = allRisks.map(r => `
        <div class="risk-briefing">
          <span class="risk-title">${r.title}</span>
          <span class="risk-value">${r.desc}</span>
        </div>
      `).join('');
    } else { risksContainer.innerHTML = ''; }
  }

  async function fetchAlertsExt(lat, lon) {
    const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`);
    if(!res.ok) return [];
    const data = await res.json();
    const features = data.features;
    let alertsHtml = '';
    let risks = [];

    if (features.length === 0) {
      alertsContainer.innerHTML = '';
      return risks;
    }

    features.forEach(f => {
      const props = f.properties;
      const startTime = formatMilitaryTime(props.effective);
      const endTime = formatMilitaryTime(props.expires);
      let timeStr = (startTime && endTime) ? `<span class="alert-time">${startTime} - ${endTime}</span>` : '';

      alertsHtml += `<div class="alert-banner"><div class="alert-header"><span class="alert-title">${props.event} (${props.severity})</span>${timeStr}</div><div class="alert-desc">${props.headline || props.description.substring(0, 200) + '...'}</div></div>`;
      
      if (props.parameters) {
        if (props.parameters.maxHailSize && props.parameters.maxHailSize[0]) {
           risks.push({title: 'Severe Hail', desc:`Watch out for large hail up to ${props.parameters.maxHailSize[0]} in diameter. Seek cover.`});
        }
        if (props.parameters.maxWindGust && props.parameters.maxWindGust[0]) {
           risks.push({title: 'Extreme Wind', desc: `Damaging winds up to ${props.parameters.maxWindGust[0]} expected. Bring loose items inside.`});
        }
        if (props.parameters.tornadoDetection && props.parameters.tornadoDetection[0]) {
           risks.push({title: 'Tornado Warning', desc:`A tornado has been detected. Take cover immediately!`});
        }
      }
    });

    alertsContainer.innerHTML = alertsHtml;
    const uniqueRisksMap = new Map();
    risks.forEach(r => uniqueRisksMap.set(r.title, r));
    return Array.from(uniqueRisksMap.values());
  }

  // Translates TAF shorthand
  function translateTAF(text) {
     if (!text) return text;
     let lines = text.split('\n');
     return lines.map(line => {
       let parsed = line.trim();
       if (!parsed) return '';
       parsed = parsed
          .replace(/BKN/g, 'Broken Clouds at ')
          .replace(/OVC/g, 'Overcast Clouds at ')
          .replace(/SCT/g, 'Scattered Clouds at ')
          .replace(/FEW/g, 'Few Clouds at ')
          .replace(/KT/g, ' knots ')
          .replace(/SM/g, ' statute miles ')
          .replace(/TSRA/g, 'Thunderstorm Rain ')
          .replace(/SHRA/g, 'Rain Showers ')
          .replace(/VCTS/g, 'Thunderstorms in vicinity ')
          .replace(/BR/g, 'Mist ')
          .replace(/\bFM(\d{6})\b/g, '▶ From $1')
          .replace(/TEMPO/g, '▶ Temporary Condition: ')
          .replace(/PROB30/g, '▶ 30% Probability ');
       return parsed;
     }).filter(l => l.length > 0).join('\n\n');
  }

  // Translates NWS JSON observation payload to English
  // Translates NWS JSON observation payload into label/value rows for the
  // two-column data grid (Option A, 2026-10-28). This replaces the old
  // hand-padded text lines, whose columns only lined up in a monospace font.
  function translateMETAR(props) {
     if (!props) return [];
     const rows = [];
     rows.push({label: 'Current Condition', value: props.textDescription || 'N/A'});
     if (props.temperature?.value != null) {
         let f = Math.round(props.temperature.value * 1.8 + 32);
         rows.push({label: 'Temperature', value: `${f}°F (${Math.round(props.temperature.value)}°C)`});
     }
     if (props.dewpoint?.value != null) {
         let df = Math.round(props.dewpoint.value * 1.8 + 32);
         rows.push({label: 'Dewpoint', value: `${df}°F`});
     }
     if (props.relativeHumidity?.value != null) {
         rows.push({label: 'Humidity', value: `${Math.round(props.relativeHumidity.value)}%`});
     }
     if (props.windDirection?.value != null && props.windSpeed?.value != null) {
         let wT = Math.round(props.windSpeed.value * 0.539957); // kmh to kt
         rows.push({label: 'Wind', value: `${props.windDirection.value}° at ${wT} knots`});
     }
     if (props.visibility?.value != null) {
         let v = (props.visibility.value * 0.000621371).toFixed(1); // meters to miles
         rows.push({label: 'Visibility', value: `${v} miles`});
     }
     return rows;
  }

  // Turns the decoded TAF text into label/value rows for the same grid:
  // each forecast segment (base, From groups, Temporary, probability) gets
  // its time or kind as the label and its conditions as the value. The
  // transmission header lines (000, FTUS.., TAFxx, TAF) are dropped, since
  // the card title already says what the product is. Anything unrecognized
  // is appended to the previous row, so no forecast text is ever lost; if
  // nothing parses, the caller falls back to the plain decoded text.
  function tafRows(translated) {
     const clean = t => t.replace(/=\s*$/, '').replace(/\s+/g, ' ').trim();
     const ordinal = d => { const s = ['th', 'st', 'nd', 'rd'], v = d % 100; return d + (s[(v - 20) % 10] || s[v] || s[0]); };
     const rows = [];
     let baseDay = null;
     for (const seg of translated.split('\n\n').map(x => x.trim()).filter(Boolean)) {
        if (/^\d{3}$/.test(seg) || /^FT[A-Z]{2}\d{2}\b/.test(seg) || /^TAF[A-Z]{2,4}$/.test(seg) || seg === 'TAF' || /^TAF (AMD|COR|RTD)$/.test(seg)) continue;
        let m = seg.match(/^([A-Z]{4})\s+\d{6}Z\s+(?:(COR|AMD|RTD)\s+)?(\d{2})\d{2}\/(\d{2})\d{2}\s+([\s\S]*)$/);
        if (m) { baseDay = parseInt(m[3], 10); rows.push({label: 'Base', value: clean(m[5])}); continue; }
        m = seg.match(/^▶ From (\d{2})(\d{2})(\d{2})\s+([\s\S]*)$/);
        if (m) {
           const day = parseInt(m[1], 10);
           const label = `From ${m[2]}:${m[3]}Z` + (baseDay !== null && day !== baseDay ? ` (${ordinal(day)})` : '');
           rows.push({label, value: clean(m[4])}); continue;
        }
        m = seg.match(/^▶ Temporary Condition:\s*([\s\S]*)$/);
        if (m) { rows.push({label: 'Temporary', value: clean(m[1])}); continue; }
        m = seg.match(/^▶ (\d+)% Probability\s+([\s\S]*)$/);
        if (m) { rows.push({label: `${m[1]}% Prob`, value: clean(m[2])}); continue; }
        m = seg.match(/^BECMG\s+([\s\S]*)$/);
        if (m) { rows.push({label: 'Becoming', value: clean(m[1])}); continue; }
        if (rows.length > 0) rows[rows.length - 1].value += ' ' + clean(seg);
        else rows.push({label: '', value: clean(seg)});
     }
     return rows;
  }

  // Renders label/value rows into an aviation card as the two-column grid.
  function renderDataGrid(el, rows) {
     const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
     el.innerHTML = `<div class="data-grid">${rows.map(r => `<span class="dg-label">${esc(r.label)}</span><span class="dg-value">${esc(r.value)}</span>`).join('')}</div>`;
  }

  async function fetchAviation(stationsUrl) {
    const res = await fetch(stationsUrl);
    if (!res.ok) return;
    const data = await res.json();
    
    if (!data.features || data.features.length === 0) {
      metarData.innerText = "No nearby aviation hubs identified.";
      tafData.innerText = "No nearby aviation hubs identified.";
      return;
    }

    const checkStations = data.features.slice(0, 10).map(f => f.properties.stationIdentifier);
    let validStation = null;
    let metarResult = null;
    let tafResult = null;

    for (let station of checkStations) {
       try {
         const shortStation = station.length === 4 ? station.substring(1) : station;
         const tafListRes = await fetch(`https://api.weather.gov/products/types/TAF/locations/${shortStation}`);
         if (tafListRes.ok) {
           const tafListJson = await tafListRes.json();
           if (tafListJson["@graph"] && tafListJson["@graph"].length > 0) {
              validStation = station;
              
              const tafId = tafListJson["@graph"][0]["@id"];
              const tafRes = await fetch(tafId);
              tafResult = await tafRes.json();
              
              const metarRes = await fetch(`https://api.weather.gov/stations/${station}/observations/latest`);
              if (metarRes.ok) { metarResult = await metarRes.json(); }

              // A station's newest report sometimes posts with the
              // headline fields still empty (temperature, dewpoint,
              // humidity null) and fills in afterward; Brandon hit
              // one on 2026-11-09 and the Current Conditions screen
              // showed dashes. If the newest report has no
              // temperature, walk back through the station's recent
              // reports and use the newest one that carries one.
              // Reports are minutes apart, so the fallback is fresh.
              if (metarResult?.properties?.temperature?.value == null) {
                try {
                  const recentRes = await fetch(`https://api.weather.gov/stations/${station}/observations?limit=5`);
                  if (recentRes.ok) {
                    const recent = await recentRes.json();
                    const complete = (recent.features || []).find(f => f.properties?.temperature?.value != null);
                    if (complete) metarResult = complete;
                  }
                } catch (e) { /* keep the original report */ }
              }
              
              break; 
           }
         }
       } catch (err) { continue; }
    }

    const footerStation = document.getElementById('footer-station');

    if (!validStation) {
      metarStation.innerText = `(N/A)`;
      tafStation.innerText = `(N/A)`;
      metarData.innerText = "No nearby aviation hubs identified.";
      tafData.innerText = "No valid TAF structures found for surrounding grid.";
      if (footerStation) footerStation.innerText = "No connection established";
      return;
    }

    metarStation.innerText = `(${validStation}) TRANSLATED`;
    tafStation.innerText = `(${validStation}) DECODED`;
    if (footerStation) footerStation.innerText = `Sector ${validStation}`;

    if (metarResult) {
      // Nostalgia Mode's Current Conditions screen reads this same
      // observation (temperature, dewpoint, humidity, wind, visibility,
      // pressure, time) instead of making a second request.
      updateNostalgiaConditions(metarResult.properties, validStation);
      const metarRows = translateMETAR(metarResult.properties);
      if (metarRows.length > 0) renderDataGrid(metarData, metarRows);
      else metarData.innerText = "No valid METAR properties found.";
    } else { metarData.innerText = "Error loading METAR telemetry."; }

    if (tafResult) {
       const cleanText = tafResult.productText.replace(/\r\n/g, '\n');
       const decoded = translateTAF(cleanText);
       const rows = decoded ? tafRows(decoded) : [];
       if (rows.length > 0) renderDataGrid(tafData, rows);
       else tafData.innerText = decoded || "No valid TAF string found.";
    } else { tafData.innerText = "Error loading TAF structures."; }
  }

  async function fetchDiscussion(wfo) {
    try {
      const listRes = await fetch(`https://api.weather.gov/products/types/AFD/locations/${wfo}`);
      if (!listRes.ok) throw new Error("No discussion available.");
      const listData = await listRes.json();
      
      if(listData["@graph"] && listData["@graph"].length > 0) {
        const docId = listData["@graph"][0]["@id"];
        const textRes = await fetch(docId);
        const textData = await textRes.json();
        discussionData.innerText = textData.productText.replace(/\n\s*\n/g, '\n\n');
      } else { discussionData.innerText = "No ambient discussion payloads."; }
    } catch (err) { discussionData.innerText = "Discussion parsing failure.\n" + err.message; }
  }

  function clearUI() {
    alertsContainer.innerHTML = '';
    risksContainer.innerHTML = '';
    hourlyGrid.innerHTML = '';
    forecastGrid.innerHTML = '';
    metarStation.innerText = '';
    metarData.innerText = 'Loading...';
    tafStation.innerText = '';
    tafData.innerText = 'Loading...';
    discussionData.innerText = 'Loading...';
    if (clockTimerId) clearInterval(clockTimerId);
    if (clockContainer) clockContainer.classList.add('hidden');
    if (solarContainer) solarContainer.classList.add('hidden');
  }

  // Safety refresh of map layout size on initial load
  setTimeout(() => {
     if (map) {
        map.invalidateSize();
        if (currentLat !== null && currentLon !== null) {
           const liveUrlParams = new URLSearchParams(window.location.search);
           const zoomToUse = parseInt(liveUrlParams.get('zoom')) || 8;
           map.setView([currentLat, currentLon], zoomToUse);
        }
     }
  }, 600);
});
