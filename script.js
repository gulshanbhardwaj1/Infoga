(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const NA = 'Not available';
  const fmtBytes = (b) => {
    if (b == null || isNaN(b)) return NA;
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return b.toFixed(b >= 100 || i === 0 ? 0 : 1) + ' ' + u[i];
  };
  const fmtTime = (s) => {
    if (!isFinite(s) || s <= 0) return NA;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + 'h ' : '') + m + 'm';
  };

  let toastTimer;
  const toast = (msg) => {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  };

  /* render rows into a card */
  const render = (id, rows) => {
    const dl = $(`#${id} .rows`);
    dl.innerHTML = '';
    rows.forEach(([k, v]) => {
      const d = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = k;
      dd.textContent = v ?? NA;
      d.append(dt, dd);
      dl.append(d);
    });
  };

  const setTag = (key, text, cls = '') => {
    document.querySelectorAll(`[data-tag="${key}"]`).forEach((el) => {
      el.textContent = text;
      el.className = 'tag ' + cls;
    });
  };

  const permTag = (key, state) => {
    const map = { granted: ['granted', 'ok'], denied: ['denied', 'bad'], prompt: ['ask', 'warn'] };
    const [txt, cls] = map[state] || ['n/a', ''];
    setTag(key, txt, cls);
  };

  /* ---------- clock ---------- */
  setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString('en-GB'); }, 1000);
  $('#clock').textContent = new Date().toLocaleTimeString('en-GB');

  /* ---------- device identity ---------- */
  async function identity() {
    const ua = navigator.userAgent;
    let brand = '', model = '', platform = navigator.platform || '', platVer = '';
    const uad = navigator.userAgentData;
    if (uad) {
      brand = (uad.brands || []).filter((b) => !/not.?a/i.test(b.brand)).map((b) => b.brand + ' ' + b.version).join(', ');
      try {
        const h = await uad.getHighEntropyValues(['model', 'platformVersion', 'platform']);
        model = h.model || '';
        platVer = h.platformVersion || '';
        platform = h.platform || platform;
      } catch (_) {}
    }
    if (!model) {
      const m = ua.match(/;\s*([^;)]+)\s+Build\//) || ua.match(/Android[^;]*;\s*([^;)]+)\)/);
      if (m) model = m[1].trim();
    }
    if (/iPhone/.test(ua)) model = model || 'iPhone';
    if (/iPad/.test(ua)) model = model || 'iPad';
    $('#deviceName').textContent = model || (/Mobi|Android|iPhone/.test(ua) ? 'Mobile device' : 'Desktop / Laptop');
    $('#deviceSub').textContent = `${platform} ${platVer}`.trim() + (brand ? ' · ' + brand : '');
    const chips = [];
    chips.push(/Mobi|Android|iPhone/.test(ua) ? 'MOBILE' : 'DESKTOP');
    if (navigator.maxTouchPoints > 0) chips.push('TOUCH ' + navigator.maxTouchPoints);
    if (window.isSecureContext) chips.push('SECURE'); else chips.push('INSECURE (use HTTPS)');
    $('#heroChips').innerHTML = chips.map((c) => `<span class="chip">${c}</span>`).join('');
    return { ua, platform, platVer, brand, model };
  }

  /* ---------- battery ---------- */
  let batteryObj;
  async function battery() {
    if (!navigator.getBattery) {
      render('c-battery', [['Status', 'API not supported (Safari/Firefox)']]);
      setTag('battery', 'n/a');
      $('#batPct').textContent = 'N/A';
      return;
    }
    try {
      batteryObj = batteryObj || (await navigator.getBattery());
      const b = batteryObj;
      const update = () => {
        const pct = Math.round(b.level * 100);
        $('#batPct').textContent = pct + '%';
        $('#batState').textContent = b.charging ? 'Charging' : 'On battery';
        const ring = $('#batRing');
        ring.style.setProperty('--p', pct);
        ring.style.setProperty('--c', pct <= 20 && !b.charging ? 'var(--red)' : b.charging ? 'var(--lime)' : 'var(--cyan)');
        $('#batBar').style.width = pct + '%';
        render('c-battery', [
          ['Level', pct + '%'],
          ['Charging', b.charging ? 'Yes ⚡' : 'No'],
          ['Time to full', b.charging ? fmtTime(b.chargingTime) : '—'],
          ['Time remaining', !b.charging ? fmtTime(b.dischargingTime) : '—'],
          ['Power saver hint', pct <= 20 && !b.charging ? 'Recommended' : 'Not needed'],
        ]);
      };
      update();
      ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'].forEach((e) => b.addEventListener(e, update));
      setTag('battery', 'live', 'ok');
    } catch (e) {
      render('c-battery', [['Error', e.message]]);
      setTag('battery', 'blocked', 'bad');
    }
  }

  /* ---------- storage ---------- */
  async function storage() {
    if (!navigator.storage || !navigator.storage.estimate) {
      render('c-storage', [['Status', 'Not supported']]);
      setTag('storage', 'n/a');
      return;
    }
    const { usage, quota } = await navigator.storage.estimate();
    const pct = quota ? (usage / quota) * 100 : 0;
    $('#stoBar').style.width = Math.max(pct, 1) + '%';
    let persisted = NA;
    try { persisted = (await navigator.storage.persisted()) ? 'Yes' : 'No'; } catch (_) {}
    render('c-storage', [
      ['Used by this site', fmtBytes(usage)],
      ['Browser quota', fmtBytes(quota)],
      ['Quota used', pct.toFixed(3) + '%'],
      ['Persistent', persisted],
    ]);
    setTag('storage', 'live', 'ok');
  }

  /* ---------- display ---------- */
  let fps = 0;
  function measureFps() {
    let frames = 0;
    const start = performance.now();
    const loop = (t) => {
      frames++;
      if (t - start < 1000) requestAnimationFrame(loop);
      else { fps = Math.round(frames * 1000 / (t - start)); display(); }
    };
    requestAnimationFrame(loop);
  }
  function display() {
    const mq = (q) => window.matchMedia(q).matches;
    const s = screen;
    const o = (s.orientation && s.orientation.type) || (innerWidth > innerHeight ? 'landscape' : 'portrait');
    render('c-display', [
      ['Resolution', `${s.width} × ${s.height}`],
      ['Physical pixels', `${Math.round(s.width * devicePixelRatio)} × ${Math.round(s.height * devicePixelRatio)}`],
      ['Viewport', `${innerWidth} × ${innerHeight}`],
      ['Pixel ratio', devicePixelRatio.toFixed(2) + 'x'],
      ['Color depth', s.colorDepth + '-bit'],
      ['Refresh rate', fps ? '~' + fps + ' Hz' : 'measuring…'],
      ['Orientation', o],
      ['Color gamut', mq('(color-gamut: rec2020)') ? 'Rec.2020' : mq('(color-gamut: p3)') ? 'Display P3' : 'sRGB'],
      ['HDR', mq('(dynamic-range: high)') ? 'Supported' : 'No'],
      ['Theme', mq('(prefers-color-scheme: dark)') ? 'Dark' : 'Light'],
      ['Fullscreen', document.fullscreenElement ? 'Yes' : 'No'],
    ]);
  }

  /* ---------- network ---------- */
  function network() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const on = navigator.onLine;
    const pill = $('#netPill');
    pill.classList.toggle('off', !on);
    pill.querySelector('b').textContent = on ? (c && c.effectiveType ? c.effectiveType.toUpperCase() : 'ONLINE') : 'OFFLINE';
    render('c-network', [
      ['Status', on ? 'Online' : 'Offline'],
      ['Type', c && c.type ? c.type : NA],
      ['Effective', c && c.effectiveType ? c.effectiveType : NA],
      ['Downlink', c && c.downlink != null ? c.downlink + ' Mbps' : NA],
      ['Latency (RTT)', c && c.rtt != null ? c.rtt + ' ms' : NA],
      ['Data saver', c && c.saveData ? 'On' : 'Off'],
    ]);
    setTag('network', on ? 'live' : 'offline', on ? 'ok' : 'bad');
    if (c && !c._bound) { c.addEventListener('change', network); c._bound = true; }
  }
  async function speedTest() {
    const btn = $('#speedBtn');
    btn.textContent = 'Testing…';
    try {
      const t0 = performance.now();
      const r = await fetch('https://speed.cloudflare.com/__down?bytes=3000000', { cache: 'no-store' });
      const buf = await r.arrayBuffer();
      const sec = (performance.now() - t0) / 1000;
      const mbps = (buf.byteLength * 8) / sec / 1e6;
      btn.textContent = `Download: ${mbps.toFixed(1)} Mbps · tap to retest`;
    } catch (_) {
      btn.textContent = 'Speed test failed · retry';
    }
  }

  /* ---------- hardware ---------- */
  function hardware() {
    render('c-hardware', [
      ['CPU threads', navigator.hardwareConcurrency || NA],
      ['RAM (approx, capped)', navigator.deviceMemory ? '≥ ' + navigator.deviceMemory + ' GB' : NA],
      ['Touch points', navigator.maxTouchPoints ?? NA],
      ['Pointer', matchMedia('(pointer: coarse)').matches ? 'Touch' : 'Mouse'],
      ['Hover', matchMedia('(hover: hover)').matches ? 'Yes' : 'No'],
      ['Bluetooth API', 'bluetooth' in navigator ? 'Yes' : 'No'],
      ['USB API', 'usb' in navigator ? 'Yes' : 'No'],
      ['NFC API', 'NDEFReader' in window ? 'Yes' : 'No'],
    ]);
  }

  /* ---------- gpu ---------- */
  function gpu() {
    let rows = [['WebGL', 'Not supported']];
    try {
      const cv = document.createElement('canvas');
      const gl = cv.getContext('webgl2') || cv.getContext('webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        rows = [
          ['Vendor', ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)],
          ['Renderer', ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)],
          ['WebGL', gl.getParameter(gl.VERSION)],
          ['Max texture', gl.getParameter(gl.MAX_TEXTURE_SIZE) + ' px'],
          ['WebGPU', 'gpu' in navigator ? 'Supported' : 'No'],
        ];
      }
    } catch (_) {}
    render('c-gpu', rows);
  }

  /* ---------- system ---------- */
  function system(id) {
    render('c-system', [
      ['Platform', id.platform || NA],
      ['Language', navigator.language],
      ['Timezone', Intl.DateTimeFormat().resolvedOptions().timeZone],
      ['Cookies', navigator.cookieEnabled ? 'Enabled' : 'Disabled'],
      ['Do Not Track', navigator.doNotTrack === '1' ? 'On' : 'Off'],
      ['PWA mode', matchMedia('(display-mode: standalone)').matches ? 'Installed' : 'Browser tab'],
      ['Secure context', window.isSecureContext ? 'Yes (HTTPS)' : 'No'],
    ]);
  }

  /* ---------- audio ---------- */
  let micStream, micCtx, micRaf;
  async function audioDevices() {
    let ins = 0, outs = 0, names = [];
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      ins = devs.filter((d) => d.kind === 'audioinput').length;
      outs = devs.filter((d) => d.kind === 'audiooutput').length;
      names = devs.filter((d) => d.kind === 'audiooutput' && d.label).map((d) => d.label);
    } catch (_) {}
    render('c-sound', [
      ['Microphones', ins || NA],
      ['Speakers / outputs', outs || (ins ? '1 (default)' : NA)],
      ['Output name', names[0] || 'Visible after mic permission'],
      ['AudioContext rate', (() => { try { const c = new (window.AudioContext || window.webkitAudioContext)(); const r = c.sampleRate; c.close(); return r + ' Hz'; } catch (_) { return NA; } })()],
      ['Media volume', 'Browser cannot read device volume'],
    ]);
  }
  async function micTest() {
    if (micStream) { stopMic(); return; }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = micCtx.createMediaStreamSource(micStream);
      const an = micCtx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        an.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        $('#micBar').style.width = Math.min(100, peak * 1.6) + '%';
        micRaf = requestAnimationFrame(tick);
      };
      tick();
      $('#micBtn').textContent = '⏹ Stop mic';
      setTag('audio', 'granted', 'ok');
      audioDevices();
      toast('Microphone live — bolkar dekho 🎙');
    } catch (e) {
      setTag('audio', 'denied', 'bad');
      toast('Mic permission denied');
    }
  }
  function stopMic() {
    cancelAnimationFrame(micRaf);
    micStream && micStream.getTracks().forEach((t) => t.stop());
    micCtx && micCtx.close();
    micStream = micCtx = null;
    $('#micBar').style.width = '0';
    $('#micBtn').textContent = '🎙 Mic test';
  }
  function speakerTest() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6);
      osc.connect(gain);
      if (pan) {
        gain.connect(pan).connect(ctx.destination);
        pan.pan.setValueAtTime(-1, ctx.currentTime);
        pan.pan.setValueAtTime(1, ctx.currentTime + 0.8);
      } else gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1.7);
      toast('Left → Right tone chal raha hai 🔈');
    } catch (_) { toast('Audio not supported'); }
  }

  /* ---------- camera ---------- */
  let camStream;
  async function cameraInfo() {
    let n = 0;
    try { n = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length; } catch (_) {}
    render('c-camera', [['Cameras found', n || NA], ['Facing', camStream ? 'Active (rear preferred)' : 'Inactive']]);
  }
  async function cameraToggle() {
    const v = $('#camView');
    if (camStream) {
      camStream.getTracks().forEach((t) => t.stop());
      camStream = null; v.hidden = true; $('#camBtn').textContent = 'Open camera';
      cameraInfo();
      return;
    }
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      v.srcObject = camStream; v.hidden = false; await v.play();
      const st = camStream.getVideoTracks()[0].getSettings();
      render('c-camera', [
        ['Resolution', `${st.width} × ${st.height}`],
        ['Frame rate', (st.frameRate || '?') + ' fps'],
        ['Facing', st.facingMode || 'unknown'],
      ]);
      $('#camBtn').textContent = 'Close camera';
      setTag('camera', 'granted', 'ok');
    } catch (_) { setTag('camera', 'denied', 'bad'); toast('Camera permission denied'); }
  }

  /* ---------- location ---------- */
  function locate() {
    if (!navigator.geolocation) return toast('Geolocation not supported');
    toast('Location maang rahe hain…');
    navigator.geolocation.getCurrentPosition((p) => {
      const c = p.coords;
      render('c-location', [
        ['Latitude', c.latitude.toFixed(6)],
        ['Longitude', c.longitude.toFixed(6)],
        ['Accuracy', Math.round(c.accuracy) + ' m'],
        ['Altitude', c.altitude != null ? Math.round(c.altitude) + ' m' : NA],
        ['Speed', c.speed != null ? (c.speed * 3.6).toFixed(1) + ' km/h' : NA],
        ['Heading', c.heading != null ? Math.round(c.heading) + '°' : NA],
      ]);
      setTag('geolocation', 'granted', 'ok');
    }, (e) => {
      setTag('geolocation', 'denied', 'bad');
      toast('Location: ' + e.message);
    }, { enableHighAccuracy: true, timeout: 12000 });
  }

  /* ---------- motion ---------- */
  let motionOn = false;
  const mv = { ax: 0, ay: 0, az: 0, a: 0, b: 0, g: 0 };
  function motionRows() {
    render('c-motion', [
      ['Accel X / Y / Z', `${mv.ax.toFixed(2)} / ${mv.ay.toFixed(2)} / ${mv.az.toFixed(2)}`],
      ['Tilt (β / γ)', `${mv.b.toFixed(0)}° / ${mv.g.toFixed(0)}°`],
      ['Compass (α)', mv.a.toFixed(0) + '°'],
    ]);
  }
  async function motionEnable() {
    try {
      if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== 'granted') throw new Error('denied');
      }
      if (motionOn) return;
      motionOn = true;
      window.addEventListener('deviceorientation', (e) => {
        mv.a = e.alpha || 0; mv.b = e.beta || 0; mv.g = e.gamma || 0;
        const x = Math.max(-1, Math.min(1, mv.g / 45)) * 45;
        const y = Math.max(-1, Math.min(1, (mv.b - 0) / 45)) * 12;
        $('#tiltDot').style.transform = `translate(${x * 2.2}px,${y}px)`;
        motionRows();
      });
      window.addEventListener('devicemotion', (e) => {
        const a = e.accelerationIncludingGravity || {};
        mv.ax = a.x || 0; mv.ay = a.y || 0; mv.az = a.z || 0;
      });
      setTag('motion', 'live', 'ok');
      $('#motionBtn').textContent = 'Sensors active';
      toast('Phone ko tilt karke dekho 🧭');
    } catch (_) { setTag('motion', 'denied', 'bad'); toast('Motion permission denied'); }
  }

  /* ---------- permissions center ---------- */
  const PERMS = [
    ['geolocation', 'Location', 'geolocation'],
    ['camera', 'Camera', 'camera'],
    ['microphone', 'Microphone', 'audio'],
    ['notifications', 'Notifications', null],
    ['clipboard-read', 'Clipboard', null],
    ['accelerometer', 'Motion', 'motion'],
    ['persistent-storage', 'Storage', null],
    ['midi', 'MIDI', null],
  ];
  async function permissions() {
    const box = $('#permList');
    box.innerHTML = '';
    for (const [name, label, tagKey] of PERMS) {
      let state = 'na';
      try { state = (await navigator.permissions.query({ name })).state; } catch (_) {}
      const el = document.createElement('div');
      el.className = 'perm ' + state;
      el.innerHTML = `<span>${label}</span><b>${state === 'na' ? 'n/a' : state}</b>`;
      box.append(el);
      if (tagKey && state !== 'na') permTag(tagKey, state);
    }
  }
  async function notif() {
    if (!('Notification' in window)) return toast('Notifications not supported');
    const r = await Notification.requestPermission();
    toast('Notifications: ' + r);
    permissions();
  }
  function vibrate() {
    if (navigator.vibrate) { navigator.vibrate([120, 60, 120, 60, 240]); toast('Vibrating 📳'); }
    else toast('Vibration not supported on this device');
  }

  /* ---------- boot ---------- */
  let ident;
  async function boot() {
    ident = await identity();
    await Promise.all([battery(), storage(), audioDevices(), cameraInfo()]);
    display(); measureFps(); network(); hardware(); gpu(); system(ident);
    render('c-location', [['Status', 'Tap the button to share location']]);
    motionRows();
    permissions();
  }

  async function scanAll() {
    toast('Permissions ek-ek karke maangi ja rahi hain…');
    await motionEnable();
    await new Promise((r) => { navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => { locate(); r(); }, () => { setTag('geolocation', 'denied', 'bad'); r(); }) : r(); });
    await micTest();
    await notif();
    await boot();
  }

  $('#scanAll').addEventListener('click', scanAll);
  $('#speedBtn').addEventListener('click', speedTest);
  $('#micBtn').addEventListener('click', micTest);
  $('#spkBtn').addEventListener('click', speakerTest);
  $('#camBtn').addEventListener('click', cameraToggle);
  $('#geoBtn').addEventListener('click', locate);
  $('#motionBtn').addEventListener('click', motionEnable);
  $('#notifBtn').addEventListener('click', notif);
  $('#vibBtn').addEventListener('click', vibrate);

  window.addEventListener('online', network);
  window.addEventListener('offline', network);
  window.addEventListener('resize', display);
  window.addEventListener('orientationchange', () => setTimeout(display, 250));
  setInterval(() => { battery(); storage(); }, 30000);

  boot();
})();
