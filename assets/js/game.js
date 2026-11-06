'use strict';
/* Tampilan, input sentuh/keyboard, suara, layar penuh. Tanpa innerHTML/eval/jaringan. */
(() => {
  const E = window.BrawlEngine; if (!E) return;
  const W = E.W, H = E.H, GY = E.GY, TAU = Math.PI * 2;
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);

  /* latar kota neon (dirender sekali) */
  const bg = document.createElement('canvas'); bg.width = W * dpr; bg.height = H * dpr;
  { const c = bg.getContext('2d'); c.scale(dpr, dpr);
    const sky = c.createLinearGradient(0, 0, 0, GY); sky.addColorStop(0, '#0a0420'); sky.addColorStop(0.7, '#2a0a45'); sky.addColorStop(1, '#5b1456'); c.fillStyle = sky; c.fillRect(0, 0, W, H);
    const moon = c.createRadialGradient(780, 120, 4, 780, 120, 150); moon.addColorStop(0, '#fff0'); c.fillStyle = '#f9a8d4'; c.beginPath(); c.arc(780, 120, 46, 0, TAU); c.fill();
    const h = (n) => { const v = Math.sin(n * 91.7) * 43758.5453; return v - Math.floor(v); };
    for (let layer = 0; layer < 2; layer++) { let x = -20; let i = 0; while (x < W) { const bw = 50 + h(i + layer * 50) * 70, bh = (layer ? 120 : 190) + h(i * 3 + layer) * (layer ? 100 : 150); c.fillStyle = layer ? '#150a2e' : '#0d0620'; c.fillRect(x, GY - bh, bw, bh);
      c.fillStyle = layer ? 'rgba(34,211,238,.35)' : 'rgba(244,114,182,.4)'; for (let wy = GY - bh + 12; wy < GY - 20; wy += 22) for (let wx = x + 8; wx < x + bw - 10; wx += 16) if (h(wx * 7 + wy * 3 + layer) > 0.62) c.fillRect(wx, wy, 6, 8); x += bw + 4 + h(i) * 10; i++; } }
    const fl = c.createLinearGradient(0, GY, 0, H); fl.addColorStop(0, '#1b0a33'); fl.addColorStop(1, '#07030f'); c.fillStyle = fl; c.fillRect(0, GY, W, H - GY);
    c.strokeStyle = 'rgba(34,211,238,.9)'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, GY + 2); c.lineTo(W, GY + 2); c.stroke();
    c.strokeStyle = 'rgba(236,72,153,.28)'; c.lineWidth = 1; c.beginPath(); for (let i = -10; i <= 20; i++) { c.moveTo(W / 2 + i * 40, GY + 2); c.lineTo(W / 2 + i * 160, H); } for (let y = GY + 14; y < H; y += 14 + (y - GY) * 0.2) { c.moveTo(0, y); c.lineTo(W, y); } c.stroke(); }

  const KW = 'brawl.wins';
  const loadWins = () => { try { const n = parseInt(localStorage.getItem(KW), 10); return Number.isInteger(n) && n >= 0 && n < 1e6 ? n : 0; } catch { return 0; } };
  const saveWins = n => { try { localStorage.setItem(KW, String(n)); } catch { /* abaikan */ } };

  let mode = '1p', level = 2, g = E.createGame({ mode, level }), state = 'ready', wins = loadWins(), muted = false, ac = null, last = 0, shake = 0, freeze = 0, wake = null, bannerTO = 0;
  const keys = new Set(), touch = { l: 0, r: 0, b: 0 }, fx = [], ghost = [100, 100], cache = {};
  const COL = ['#22d3ee', '#f472b6'];

  const beep = (f, d = 0.1, type = 'square', v = 0.04, to) => {
    if (muted) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), gn = ac.createGain(), t = ac.currentTime;
      o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
      gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(gn); gn.connect(ac.destination); o.start(t); o.stop(t + d);
    } catch { /* audio tidak tersedia */ }
  };
  const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* abaikan */ } };
  const burst = (x, y, c, n = 12, sp = 220) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 40 + Math.random() * sp, l = 0.25 + Math.random() * 0.3; fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l, m: l, c, r: 1.5 + Math.random() * 2.5 }); } };
  const banner = (t, sub) => { const b = $('banner'); b.textContent = t; if (sub) { const s = document.createElement('small'); s.textContent = sub; b.append(s); } b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); clearTimeout(bannerTO); bannerTO = setTimeout(() => b.classList.remove('show'), 1600); };

  /* layar penuh, orientasi, wake lock */
  const reqFS = stage.requestFullscreen || stage.webkitRequestFullscreen;
  const isFS = () => (document.fullscreenElement || document.webkitFullscreenElement) === stage;
  const toggleFS = async () => {
    try {
      if (isFS()) { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); try { screen.orientation.unlock(); } catch { /* abaikan */ } }
      else { await reqFS.call(stage); try { await screen.orientation.lock('landscape'); } catch { /* tidak didukung */ } }
    } catch { banner('Layar penuh ditolak'); }
  };
  const syncFS = () => { $('bFs').textContent = isFS() ? '🗗' : '⛶'; $('bFs').setAttribute('aria-label', isFS() ? 'Keluar layar penuh' : 'Layar penuh'); };
  if (!reqFS) { $('bFs').disabled = true; $('bFs').title = 'Browser ini tidak mendukung layar penuh'; }
  $('bFs').addEventListener('click', toggleFS);
  document.addEventListener('fullscreenchange', syncFS); document.addEventListener('webkitfullscreenchange', syncFS);
  const getWake = async () => { try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch { /* abaikan */ } };
  $('bMute').addEventListener('click', () => { muted = !muted; $('bMute').textContent = muted ? '🔇' : '🔊'; });

  /* alur */
  const releaseAll = () => { keys.clear(); touch.l = touch.r = touch.b = 0; document.querySelectorAll('.cb.on').forEach(b => b.classList.remove('on')); if (g) { g.setHeld(0, 0, 0, 0); if (mode === '2p') g.setHeld(1, 0, 0, 0); } };
  const overlay = (t, p, b, sel) => { $('ovT').textContent = t; $('ovP').textContent = p; $('btn').textContent = b; $('sel').hidden = !sel; $('ov').hidden = false; $('btn').focus({ preventScroll: true }); };
  const start = () => { releaseAll(); g = E.createGame({ mode, level }); fx.length = 0; ghost[0] = ghost[1] = 100; state = 'play'; $('ov').hidden = true; $('n1').textContent = mode === '2p' ? 'P2' : 'CPU'; $('n0').textContent = mode === '2p' ? 'P1' : 'KAMU'; getWake(); last = performance.now(); handle(); };
  const pause = () => { if (state === 'play') { state = 'pause'; releaseAll(); overlay('Jeda', 'Pertarungan ditahan sebentar.', 'Lanjutkan', false); } };
  const resume = () => { state = 'play'; $('ov').hidden = true; last = performance.now(); getWake(); };
  const finish = () => {
    state = 'over'; releaseAll(); const w = g.winner; let t, p = 'Ronde: ' + g.f[0].wins + ' – ' + g.f[1].wins;
    if (w === -1) t = 'Seri! 🤝'; else if (mode === '2p') t = '🏆 Pemain ' + (w + 1) + ' menang!';
    else if (w === 0) { t = 'KAMU MENANG! 🏆'; wins++; saveWins(wins); } else t = 'Kamu kalah… 💀';
    if (mode === '1p') p += ' · Total kemenangan: ' + wins;
    overlay(t, p, 'Bertarung Lagi', true);
  };
  overlay('Neon Brawl', 'Menangkan 2 dari 3 ronde. Energi 🔥 terisi saat memukul & dipukul.' + (wins ? ' Kemenanganmu: ' + wins : ''), 'Mulai Duel', true);
  $('btn').addEventListener('click', () => (state === 'pause' ? resume() : start()));
  $('bPause').addEventListener('click', () => (state === 'play' ? pause() : state === 'pause' && resume()));
  const seg = (id, attr, set) => $(id).querySelectorAll('button').forEach(b => b.addEventListener('click', () => { set(b.dataset[attr]); $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
  seg('selMode', 'm', v => { mode = v === '2p' ? '2p' : '1p'; $('selLv').hidden = mode === '2p'; }); seg('selLv', 'l', v => { level = Math.min(3, Math.max(1, Number(v) || 2)); });

  const handle = () => {
    for (const e of g.events) {
      if (e.type === 'intro') { banner('RONDE ' + e.n); ghost[0] = ghost[1] = 100; beep(330, 0.2, 'sine', 0.05); }
      else if (e.type === 'fight') { banner('FIGHT!'); beep(660, 0.3, 'sawtooth', 0.05, 990); }
      else if (e.type === 'hit') {
        const c = e.blocked ? '#93c5fd' : '#fff'; burst(e.x, e.y, c, e.blocked ? 6 : e.big ? 22 : 14); fx.push({ x: e.x, y: e.y, vx: 0, vy: 0, l: 0.12, m: 0.12, c: '#fff', r: e.blocked ? 18 : 30 });
        if (!e.blocked) { shake = e.big ? 0.22 : 0.12; freeze = e.big ? 0.07 : 0.04; beep(e.big ? 110 : 170, 0.12, 'square', 0.07); if (e.side === 0 && mode === '1p') buzz(e.big ? 50 : 30); } else beep(260, 0.06, 'triangle', 0.05);
      }
      else if (e.type === 'special') beep(300, 0.3, 'sawtooth', 0.05, 900);
      else if (e.type === 'attack') beep(e.a === 'k' ? 200 : 260, 0.05, 'triangle', 0.02, 120);
      else if (e.type === 'jump') beep(180, 0.1, 'sine', 0.03, 380);
      else if (e.type === 'noen') { const b = $('e' + e.side).parentElement; b.classList.remove('nrg'); void b.offsetWidth; b.classList.add('nrg'); beep(90, 0.1, 'sawtooth', 0.04); }
      else if (e.type === 'ko') { shake = 0.4; freeze = 0.14; beep(70, 0.5, 'sawtooth', 0.08); buzz(150); }
      else if (e.type === 'roundEnd') banner(e.reason === 'time' ? 'WAKTU HABIS' : 'K.O.!', e.winner < 0 ? 'SERI' : (mode === '2p' ? 'PEMAIN ' + (e.winner + 1) : e.winner === 0 ? 'KAMU' : 'CPU') + ' MENANG RONDE');
    }
    g.events.length = 0;
    if (g.over) finish();
  };

  /* input */
  const holdBtn = (btn, k) => {
    const on = e => { e.preventDefault(); touch[k] = 1; btn.classList.add('on'); try { btn.setPointerCapture(e.pointerId); } catch { /* abaikan */ } };
    const off = () => { touch[k] = 0; btn.classList.remove('on'); };
    btn.addEventListener('pointerdown', on); ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => btn.addEventListener(t, off));
  };
  const tapBtn = (btn, a) => {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.classList.add('on'); if (state === 'play') { g.act(0, a); } try { btn.setPointerCapture(e.pointerId); } catch { /* abaikan */ } });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => btn.addEventListener(t, () => btn.classList.remove('on')));
  };
  document.querySelectorAll('[data-h]').forEach(b => holdBtn(b, b.dataset.h)); document.querySelectorAll('[data-a]').forEach(b => tapBtn(b, b.dataset.a));
  stage.addEventListener('contextmenu', e => e.preventDefault());
  const A1 = { w: 'j', j: 'p', k: 'k', l: 's' }, A2 = { arrowup: 'j', ',': 'p', '.': 'k', '/': 's' }, PREV = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', '/', "'"];
  addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase(); if (PREV.includes(k) && e.target === document.body) e.preventDefault();
    keys.add(k); if (e.repeat) return;
    if (state === 'play') { if (A1[k]) g.act(0, A1[k]); if (mode === '2p' && A2[k]) g.act(1, A2[k]); }
    if (k === 'f') toggleFS(); else if (k === 'm') $('bMute').click(); else if (k === 'p' || k === 'escape') $('bPause').click(); else if (k === 'enter' && state === 'over') start();
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { releaseAll(); pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseAll(); pause(); } else if (state === 'play') getWake(); });

  /* gambar petarung */
  function fighter(f, i, t) {
    const s = f.face, st = f.st; let col = COL[i]; if (st === 'hurt' && Math.floor(t * 30) % 2) col = '#ffffff';
    const A = f.atk ? E.ATK[f.atk] : null; let e = 0;
    if (A) e = f.atk === 'a' ? Math.min(1, f.t / 0.06) : f.t < A.su ? f.t / A.su : f.t < A.su + A.ac ? 1 : Math.max(0, 1 - (f.t - A.su - A.ac) / A.rc);
    ctx.save(); ctx.translate(f.x, f.y);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(0, GY - f.y + 4, Math.max(14, 34 - (GY - f.y) * 0.08), 8, 0, 0, TAU); ctx.fill();
    if (st === 'ko') { ctx.rotate(-s * (f.y < GY ? 0.9 : 1.5)); ctx.translate(0, -4); }
    const lean = st === 'hurt' ? -s * 9 : f.atk === 'p' || f.atk === 'k' ? s * 5 * e : 0, bob = st === 'idle' ? Math.sin(t * 4 + i) * 2 : 0, ph = t * 11;
    const hip = [0, -52 + bob], sh = [lean, -92 + bob], hd = [lean * 1.3, -110 + bob];
    let ff = [s * 16, 0], bf = [-s * 16, 0], fh = [s * 26, -96 + bob], bh = [s * 13, -88 + bob];
    if (f.y < GY - 4 && st !== 'ko') { ff = [s * 16, -30]; bf = [-s * 10, -22]; }
    else if (st === 'walk') { ff = [s * Math.sin(ph) * 22, -Math.max(0, Math.cos(ph)) * 9]; bf = [-s * Math.sin(ph) * 22, -Math.max(0, -Math.cos(ph)) * 9]; fh = [s * (22 + Math.sin(ph) * 6), -94]; }
    if (st === 'block') { fh = [s * 24, -102]; bh = [s * 20, -90]; }
    else if (st === 'hurt' || st === 'ko') { fh = [-s * 10, -80]; bh = [-s * 18, -74]; ff = [s * 8, 0]; bf = [-s * 20, 0]; }
    else if (f.atk === 'p') fh = [s * (24 + e * 58), -90];
    else if (f.atk === 'k') ff = [s * (18 + e * 76), -22 - e * 30];
    else if (f.atk === 'a') ff = [s * 58 * e, -26];
    else if (f.atk === 's') { fh = [s * (30 + e * 28), -86]; bh = [s * (26 + e * 26), -80]; }
    const segs = [[hip, sh], [hip, ff], [hip, bf], [sh, fh], [sh, bh]];
    for (const [w, a] of [[13, 0.2], [5.5, 1]]) {
      ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); for (const [p, q] of segs) { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); } ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.fillStyle = '#10081f'; ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(hd[0], hd[1], 14, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(hd[0] + s * 6, hd[1] - 2, 3, 0, TAU); ctx.fill();
    for (const p of [fh, bh]) { ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, TAU); ctx.fill(); }
    if (f.inv > 0 && st !== 'hurt' && st !== 'ko') { ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -55, 62, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.restore();
  }
  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(bg, 0, 0, W, H);
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 40, (Math.random() - 0.5) * shake * 40);
    g.f.forEach((f, i) => fighter(f, i, t));
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of g.proj) { const c = COL[p.owner], gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 44); gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, c); gr.addColorStop(1, c + '00'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, 44, 0, TAU); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 8; ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.sign(p.vx) * 90, p.y); ctx.stroke(); ctx.globalAlpha = 1; }
    for (const f of fx) { ctx.globalAlpha = Math.max(0, f.l / f.m); ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill(); }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  const hud = dt => {
    g.f.forEach((f, i) => {
      if (ghost[i] > f.hp) ghost[i] = Math.max(f.hp, ghost[i] - 40 * dt); else ghost[i] = f.hp;
      $('h' + i).style.setProperty('--v', f.hp.toFixed(1)); $('g' + i).style.setProperty('--v', ghost[i].toFixed(1)); $('e' + i).style.setProperty('--v', f.en.toFixed(1));
      $('e' + i).parentElement.classList.toggle('rdy', f.en >= E.SPECIAL_COST);
      const k = 'w' + i + f.wins; if (cache['w' + i] !== k) { cache['w' + i] = k; const box = $('w' + i); box.textContent = ''; for (let n = 0; n < f.wins; n++) box.append(document.createElement('u')); }
    });
    $('bSp').classList.toggle('rdy', g.f[0].en >= E.SPECIAL_COST);
    const tm = String(Math.ceil(g.timer)), rd = 'RONDE ' + g.round; if (cache.tm !== tm) { cache.tm = tm; $('tm').textContent = tm; } if (cache.rd !== rd) { cache.rd = rd; $('rd').textContent = rd; }
  };

  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (state === 'play') {
      if (freeze > 0) freeze -= dt;
      else {
        g.setHeld(0, touch.l || keys.has('a'), touch.r || keys.has('d'), touch.b || keys.has('s') || keys.has('shift'));
        if (mode === '2p') g.setHeld(1, keys.has('arrowleft'), keys.has('arrowright'), keys.has('arrowdown'));
        g.tick(dt); handle();
      }
    }
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.l -= dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.l <= 0) fx.splice(i, 1); }
    if (fx.length > 300) fx.splice(0, fx.length - 300); shake = Math.max(0, shake - dt);
    draw(ts / 1000); hud(dt);
  }
  requestAnimationFrame(frame);
})();
