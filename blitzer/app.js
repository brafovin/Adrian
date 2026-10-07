/* Blitzer-Warner – Karte + Warnton. Blitzerdaten: OpenStreetMap (Overpass API). */
(() => {
  'use strict';

  const RADIUS_M = 40000;               // Anzeigeradius: 40 km
  const REFETCH_DIST_M = 8000;          // nach so viel Bewegung Daten neu laden
  const CACHE_MAX_AGE_MS = 12 * 3600e3; // Daten höchstens 12 h alt
  const CACHE_KEY = 'blitzer.cache.v1';
  const SETTINGS_KEY = 'blitzer.settings.v1';
  const MIN_ALERT_SPEED = 2.5;          // m/s (~9 km/h), darunter keine Warnung
  const OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];

  const $ = id => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* voll/gesperrt */ } }
  };

  const settings = Object.assign(
    { warnDist: 2000, sound: true, vibrate: true, follow: true, headingOnly: true },
    store.get(SETTINGS_KEY, {})
  );

  /* ---------- Geometrie ---------- */
  const R = 6371000, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  function dist(a, b, c, d) {
    const dLat = rad(c - a), dLon = rad(d - b);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function bearing(a, b, c, d) {
    const y = Math.sin(rad(d - b)) * Math.cos(rad(c));
    const x = Math.cos(rad(a)) * Math.sin(rad(c)) - Math.sin(rad(a)) * Math.cos(rad(c)) * Math.cos(rad(d - b));
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }
  function angDiff(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
  function destination(lat, lon, brg, m) {
    const δ = m / R, θ = rad(brg), φ1 = rad(lat), λ1 = rad(lon);
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
    return [deg(φ2), deg(λ2)];
  }
  function fmtDist(m) {
    if (m < 1000) return Math.max(10, Math.round(m / 10) * 10) + ' m';
    return (m / 1000).toFixed(1).replace('.', ',') + ' km';
  }

  /* ---------- Karte ---------- */
  const map = L.map('map', { zoomControl: false, preferCanvas: true, attributionControl: true })
    .setView(store.get('blitzer.lastpos', [51.16, 10.45]), store.get('blitzer.lastpos') ? 12 : 6);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  const canvas = L.canvas({ padding: 0.5 });
  const camLayer = L.layerGroup().addTo(map);
  const radiusCircle = L.circle([0, 0], { radius: RADIUS_M, color: '#3b82f6', weight: 2, dashArray: '8 8', fill: false, interactive: false });
  const meMarker = L.marker([0, 0], {
    icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
    interactive: false, zIndexOffset: 1000
  });
  camLayer.on('click', e => {
    const c = e.layer && e.layer.options && e.layer.options.cam;
    if (!c) return;
    const info = [c.maxspeed ? `Tempolimit: ${c.maxspeed} km/h` : 'Tempolimit unbekannt'];
    if (me) info.push(`Entfernung: ${fmtDist(dist(me.lat, me.lon, c.lat, c.lon))}`);
    L.popup().setLatLng([c.lat, c.lon]).setContent(`<div class="cam-pop"><b>📸 Blitzer</b>${info.join('<br>')}</div>`).openOn(map);
  });

  /* ---------- Blitzerdaten ---------- */
  let cameras = [];           // {id, lat, lon, maxspeed}
  let fetchCenter = null;     // [lat, lon] der letzten Abfrage
  let fetching = false;

  function renderCameras() {
    camLayer.clearLayers();
    for (const c of cameras) {
      L.circleMarker([c.lat, c.lon], {
        renderer: canvas, radius: c.demo ? 9 : 7, color: '#fff', weight: 2,
        fillColor: c.demo ? '#f59e0b' : '#ef4444', fillOpacity: 1, cam: c
      }).addTo(camLayer);
    }
    $('count').textContent = cameras.filter(c => !c.demo).length;
  }

  function parseOverpass(json) {
    const seen = new Set(), out = [];
    for (const el of json.elements || []) {
      if (el.type !== 'node' || seen.has(el.id)) continue;
      seen.add(el.id);
      const ms = parseInt(el.tags && el.tags.maxspeed, 10);
      out.push({ id: el.id, lat: el.lat, lon: el.lon, maxspeed: Number.isFinite(ms) ? ms : null });
    }
    return out;
  }

  async function overpassFetch(lat, lon) {
    const q = `[out:json][timeout:25];(node["highway"="speed_camera"](around:${RADIUS_M},${lat},${lon});` +
      `node["enforcement"="maxspeed"](around:${RADIUS_M},${lat},${lon}););out body;`;
    let lastErr;
    for (const url of OVERPASS) {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 30000);
      try {
        const r = await fetch(url, {
          method: 'POST', signal: ctl.signal,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(q)
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return parseOverpass(await r.json());
      } catch (e) { lastErr = e; } finally { clearTimeout(t); }
    }
    throw lastErr || new Error('Overpass nicht erreichbar');
  }

  async function loadCameras(lat, lon, force) {
    if (fetching || demo) return;
    if (!force && fetchCenter && dist(lat, lon, fetchCenter[0], fetchCenter[1]) < REFETCH_DIST_M) return;
    // Zwischenspeicher nutzen, wenn passend und frisch
    const cache = store.get(CACHE_KEY);
    if (!force && cache && Date.now() - cache.t < CACHE_MAX_AGE_MS &&
        dist(lat, lon, cache.lat, cache.lon) < REFETCH_DIST_M) {
      cameras = cache.cams.map(a => ({ id: a[0], lat: a[1], lon: a[2], maxspeed: a[3] }));
      fetchCenter = [cache.lat, cache.lon];
      renderCameras();
      evaluate();
      return;
    }
    fetching = true;
    toast('Lade Blitzer im Umkreis von 40 km …', 60000);
    try {
      const cams = await overpassFetch(lat, lon);
      cameras = cams;
      fetchCenter = [lat, lon];
      store.set(CACHE_KEY, { t: Date.now(), lat, lon, cams: cams.map(c => [c.id, c.lat, c.lon, c.maxspeed]) });
      renderCameras();
      evaluate();
      toast(`${cams.length} Blitzer geladen`);
    } catch (e) {
      toast('Blitzer konnten nicht geladen werden – bitte Internet prüfen');
    } finally { fetching = false; }
  }

  /* ---------- Ton / Vibration / Display an ---------- */
  let audio = null;
  function initAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch { audio = null; }
  }
  function beep(freq, count, gap) {
    if (settings.sound && audio) {
      const t0 = audio.currentTime + 0.02;
      for (let i = 0; i < count; i++) {
        const o = audio.createOscillator(), g = audio.createGain();
        const t = t0 + i * gap;
        o.type = 'square'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
        g.gain.setValueAtTime(0.5, t + 0.16);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(g).connect(audio.destination);
        o.start(t); o.stop(t + 0.22);
      }
    }
    if (settings.vibrate && navigator.vibrate) {
      const p = []; for (let i = 0; i < count; i++) p.push(200, gap * 1000 - 200 > 0 ? gap * 1000 - 200 : 50);
      navigator.vibrate(p);
    }
  }
  // Stufe 0 = erste Warnung (z. B. 2 km), danach 1 km / 500 m / 250 m – immer dringlicher
  const STAGE_SOUND = [
    { f: 880, n: 2, gap: 0.35 }, { f: 988, n: 3, gap: 0.3 },
    { f: 1175, n: 4, gap: 0.25 }, { f: 1319, n: 6, gap: 0.18 }
  ];

  let wakeLock = null;
  async function keepAwake() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* nicht verfügbar */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && armed) { keepAwake(); if (audio && audio.state === 'suspended') audio.resume(); }
  });

  /* ---------- Position & Warnlogik ---------- */
  let me = null;            // {lat, lon, heading|null, speed (m/s)}
  let armed = false;        // Warnung aktiv
  let demo = null;          // Demo-Fahrt (Timer)
  const stageOf = new Map(); // Blitzer-ID -> höchste bereits gemeldete Stufe
  let prevPos = null, lastHeadingPos = null;

  function stages() {
    return [settings.warnDist, ...[1000, 500, 250].filter(s => s < settings.warnDist)];
  }
  function allowedAngle(d) { return d > 1000 ? 35 : d > 400 ? 50 : 75; }

  function onPosition(lat, lon, acc, gpsHeading, gpsSpeed, ts) {
    // Geschwindigkeit
    let speed = Number.isFinite(gpsSpeed) ? gpsSpeed : null;
    if (speed === null && prevPos && ts > prevPos.ts) {
      speed = dist(prevPos.lat, prevPos.lon, lat, lon) / ((ts - prevPos.ts) / 1000);
    }
    speed = speed || 0;
    prevPos = { lat, lon, ts };

    // Fahrtrichtung
    let heading = me ? me.heading : null;
    if (Number.isFinite(gpsHeading) && speed > 1.5) heading = gpsHeading;
    else {
      if (!lastHeadingPos) lastHeadingPos = [lat, lon];
      else if (dist(lastHeadingPos[0], lastHeadingPos[1], lat, lon) > 15) {
        heading = bearing(lastHeadingPos[0], lastHeadingPos[1], lat, lon);
        lastHeadingPos = [lat, lon];
      }
    }
    me = { lat, lon, heading, speed };

    if (!meMarker._map) { meMarker.addTo(map); radiusCircle.addTo(map); }
    meMarker.setLatLng([lat, lon]);
    radiusCircle.setLatLng([lat, lon]);
    $('speedVal').textContent = Math.round(speed * 3.6);
    store.set('blitzer.lastpos', [lat, lon]);
    if (settings.follow) {
      if (map.getZoom() < 13) map.setView([lat, lon], 14, { animate: false });
      else map.panTo([lat, lon], { animate: false });
    }
    loadCameras(lat, lon, false);
    evaluate();
  }

  function evaluate() {
    if (!me) return;
    const warn = settings.warnDist, st = stages();
    const moving = me.speed >= MIN_ALERT_SPEED;
    let nearest = null;          // nächster Blitzer voraus (egal wie weit, innerhalb Radius)
    let nearestAlert = null;     // nächster Blitzer innerhalb Warnabstand
    for (const c of cameras) {
      const d = dist(me.lat, me.lon, c.lat, c.lon);
      if (d > warn + 400) stageOf.delete(c.id);
      if (d > RADIUS_M) continue;
      let ahead = true;
      if (me.heading !== null && moving) {
        ahead = angDiff(me.heading, bearing(me.lat, me.lon, c.lat, c.lon)) <= allowedAngle(d);
      }
      if (!settings.headingOnly) ahead = true;
      if (!ahead) continue;
      if (!nearest || d < nearest.d) nearest = { c, d };
      if (d <= warn && (!nearestAlert || d < nearestAlert.d)) nearestAlert = { c, d };
      if (armed && moving && d <= warn) {
        let s = 0; while (s + 1 < st.length && d <= st[s + 1]) s++;
        const prev = stageOf.has(c.id) ? stageOf.get(c.id) : -1;
        if (s > prev) {
          stageOf.set(c.id, s);
          const snd = STAGE_SOUND[Math.min(s, STAGE_SOUND.length - 1)];
          beep(snd.f, snd.n, snd.gap);
        }
      }
    }
    $('nextDist').textContent = nearest ? fmtDist(nearest.d) : '–';

    const box = $('alert');
    if (nearestAlert && (moving || demo)) {
      box.classList.remove('hidden');
      box.classList.toggle('near', nearestAlert.d <= 500);
      $('alertDist').textContent = fmtDist(nearestAlert.d);
      const lim = nearestAlert.c.maxspeed ? ` · Tempo ${nearestAlert.c.maxspeed}` : '';
      $('alertInfo').textContent = (armed ? 'Blitzer voraus' : 'Blitzer voraus (Warnton aus – „Warnung starten“)') + lim;
    } else box.classList.add('hidden');
  }

  /* ---------- GPS ---------- */
  let watchId = null;
  function setStatus(txt, cls) { const s = $('status'); s.textContent = txt; s.className = cls || ''; }
  function startGps() {
    if (!navigator.geolocation) { setStatus('Kein GPS in diesem Browser', 'err'); return; }
    if (watchId !== null) return;
    watchId = navigator.geolocation.watchPosition(p => {
      if (demo) return;
      const c = p.coords;
      setStatus(`GPS ok · ±${Math.round(c.accuracy)} m`, 'ok');
      onPosition(c.latitude, c.longitude, c.accuracy, c.heading, c.speed, p.timestamp);
    }, err => {
      setStatus(err.code === 1 ? 'Standortzugriff verweigert – bitte erlauben' : 'GPS-Signal fehlt', 'err');
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  }

  /* ---------- Demo-Fahrt ---------- */
  function startDemo() {
    stopDemo();
    const start = me ? [me.lat, me.lon] : [map.getCenter().lat, map.getCenter().lng];
    const camPos = destination(start[0], start[1], 0, 2600);
    const fake = { id: 'demo', lat: camPos[0], lon: camPos[1], maxspeed: 50, demo: true };
    cameras = cameras.filter(c => !c.demo).concat(fake);
    renderCameras();
    stageOf.clear(); prevPos = null; lastHeadingPos = null; me = null;
    if (!armed) setArmed(true);
    let travelled = 0; const v = 120 / 3.6, dt = 0.5;
    demo = setInterval(() => {
      travelled += v * dt;
      const p = destination(start[0], start[1], 0, travelled);
      setStatus('Demo-Fahrt · 120 km/h', 'ok');
      onPosition(p[0], p[1], 5, 0, v, Date.now());
      if (travelled > 3000) stopDemo();
    }, dt * 1000);
    settings.follow = true; $('optFollow').checked = true;
    toast('Demo-Fahrt: Blitzer in 2,6 km – du hörst die Warnungen ab 2 km');
  }
  function stopDemo() {
    if (!demo) return;
    clearInterval(demo); demo = null;
    cameras = cameras.filter(c => !c.demo);
    stageOf.delete('demo'); renderCameras();
    setStatus('Demo beendet', ''); $('alert').classList.add('hidden');
    if (fetchCenter === null && me) loadCameras(me.lat, me.lon, true);
  }

  /* ---------- UI ---------- */
  let toastTimer;
  function toast(msg, ms = 3500) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
  }
  function setArmed(on) {
    armed = on;
    const b = $('startBtn');
    b.textContent = on ? '■ Warnung läuft – stoppen' : '▶ Warnung starten';
    b.classList.toggle('on', on);
    if (on) { initAudio(); keepAwake(); beep(880, 1, 0.3); }
    else if (wakeLock) { try { wakeLock.release(); } catch { /* egal */ } wakeLock = null; }
    evaluate();
  }

  $('startBtn').onclick = () => { if (demo && armed) stopDemo(); setArmed(!armed); if (armed) startGps(); };
  $('locBtn').onclick = () => {
    settings.follow = true; $('optFollow').checked = true; saveSettings();
    if (me) map.setView([me.lat, me.lon], Math.max(map.getZoom(), 13)); else startGps();
  };
  $('count').parentElement.onclick = () => { if (me) map.fitBounds(radiusCircle.getBounds()); };
  $('menuBtn').onclick = () => $('sheet').classList.remove('hidden');
  $('closeSheet').onclick = () => $('sheet').classList.add('hidden');
  $('testBeep').onclick = () => { initAudio(); const s = STAGE_SOUND[0]; beep(s.f, s.n, s.gap); };
  $('demoBtn').onclick = () => { initAudio(); $('sheet').classList.add('hidden'); startDemo(); };
  $('reloadBtn').onclick = () => {
    $('sheet').classList.add('hidden');
    const c = me ? [me.lat, me.lon] : [map.getCenter().lat, map.getCenter().lng];
    loadCameras(c[0], c[1], true);
  };

  function saveSettings() { store.set(SETTINGS_KEY, settings); }
  $('warnDist').value = String(settings.warnDist);
  for (const [id, key] of [['optSound', 'sound'], ['optVibrate', 'vibrate'], ['optFollow', 'follow'], ['optHeading', 'headingOnly']]) {
    $(id).checked = !!settings[key];
    $(id).onchange = e => { settings[key] = e.target.checked; saveSettings(); evaluate(); };
  }
  $('warnDist').onchange = e => { settings.warnDist = +e.target.value; stageOf.clear(); saveSettings(); evaluate(); };
  // Sobald der Nutzer die Karte selbst verschiebt, nicht mehr automatisch zentrieren
  map.on('dragstart', () => { settings.follow = false; $('optFollow').checked = false; });

  $('radiusLbl').textContent = RADIUS_M / 1000;
  startGps();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* optional */ });
  }
})();
