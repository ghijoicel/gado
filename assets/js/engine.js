'use strict';
/* Mesin pertarungan murni (tanpa DOM), bisa diuji di Node. */
(function (root) {
  const W = 960, H = 540, GY = 450, SPD = 230, JUMP = -640, GRAV = 1900, STEP = 1 / 60, ROUND_T = 60, WINS = 2, SPECIAL_COST = 50;
  const ATK = {
    p: { su: 0.07, ac: 0.08, rc: 0.14, dmg: 7, reach: 72, hh: 26, cy: -62, kb: 150, stun: 0.3, en: 8 },
    k: { su: 0.13, ac: 0.1, rc: 0.22, dmg: 12, reach: 98, hh: 24, cy: -46, kb: 280, stun: 0.44, en: 12 },
    s: { su: 0.22, ac: 0.02, rc: 0.34 },
    a: { su: 0.04, ac: 99, rc: 0, dmg: 10, reach: 70, hh: 34, cy: -40, kb: 200, stun: 0.36, en: 9 }
  };
  const PROJ = { dmg: 16, kb: 230, stun: 0.4, en: 6 };
  const AI = { 1: { react: 0.5, aggr: 0.3, block: 0.2, spec: 0.1 }, 2: { react: 0.3, aggr: 0.5, block: 0.45, spec: 0.25 }, 3: { react: 0.16, aggr: 0.7, block: 0.7, spec: 0.4 } };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function createGame(opts, rngFn) {
    opts = opts || {}; const rng = typeof rngFn === 'function' ? rngFn : Math.random;
    const twoP = opts.mode === '2p', level = [1, 2, 3].includes(opts.level) ? opts.level : 2;
    const mk = (side, cpu) => ({ side, x: 0, y: GY, vx: 0, vy: 0, face: 1, hp: 100, en: 0, st: 'idle', t: 0, atk: null, hit: false, proj: false,
      stun: 0, inv: 0, held: { l: 0, r: 0, b: 0 }, buf: null, wins: 0, airAtk: false, cpu, aiT: 0.4 });
    const g = { W, H, GY, f: [mk(0, 0), mk(1, twoP ? 0 : level)], proj: [], phase: 'intro', pt: 1.4, timer: ROUND_T, round: 1, winner: -2, events: [], over: false };
    const ev = (type, o) => { if (g.events.length < 200) g.events.push(Object.assign({ type }, o)); };
    const resetRound = () => {
      g.f.forEach((f, i) => { Object.assign(f, { x: i ? 660 : 300, y: GY, vx: 0, vy: 0, face: i ? -1 : 1, hp: 100, en: 0, st: 'idle', t: 0, atk: null, hit: false, proj: false, stun: 0, inv: 0, buf: null, airAtk: false, aiT: 0.4 }); });
      g.proj.length = 0; g.timer = ROUND_T; g.phase = 'intro'; g.pt = 1.4; ev('intro', { n: g.round });
    };
    ev('intro', { n: 1 }); resetRound.first = true;

    g.setHeld = (side, l, r, b) => { const f = g.f[side]; if (f) { f.held.l = l ? 1 : 0; f.held.r = r ? 1 : 0; f.held.b = b ? 1 : 0; } };
    g.act = (side, a) => { const f = g.f[side]; if (f && g.phase === 'fight' && 'jpks'.includes(a) && a.length === 1) f.buf = { a, t: 0.18 }; };

    const endRound = reason => {
      if (g.phase !== 'fight') return;
      const [a, b] = g.f; let w;
      if (reason === 'ko') w = a.hp <= 0 && b.hp <= 0 ? -1 : a.hp <= 0 ? 1 : 0; else w = a.hp === b.hp ? -1 : a.hp > b.hp ? 0 : 1;
      if (w < 0) { a.wins++; b.wins++; } else g.f[w].wins++;
      g.phase = 'ko'; g.pt = 2.4; ev('roundEnd', { winner: w, reason });
    };
    const hit = (att, def, d, x, y) => {
      if (def.st === 'ko' || def.inv > 0 || g.phase !== 'fight') return false;
      const blocking = def.st === 'block' && def.y >= GY && (att.x - def.x) * def.face > 0;
      if (blocking) {
        const dmg = Math.max(1, Math.round(d.dmg * 0.15)); def.hp -= dmg; def.vx = (def.x >= att.x ? 1 : -1) * d.kb * 0.5; att.en = Math.min(100, att.en + 3);
        ev('hit', { side: def.side, dmg, blocked: true, x, y });
      } else {
        def.hp -= d.dmg; def.st = 'hurt'; def.stun = d.stun; def.atk = null; def.buf = null; def.vx = (def.x >= att.x ? 1 : -1) * d.kb; if (def.y < GY) def.vy = -150;
        att.en = Math.min(100, att.en + d.en); def.en = Math.min(100, def.en + 8);
        ev('hit', { side: def.side, dmg: d.dmg, blocked: false, x, y, big: d.dmg >= 12 });
      }
      if (def.hp <= 0) { def.hp = 0; def.st = 'ko'; def.atk = null; def.vy = -300; def.vx = (def.x >= att.x ? 1 : -1) * 300; ev('ko', { side: def.side }); endRound('ko'); }
      return true;
    };
    const startAtk = (f, a) => { f.st = 'atk'; f.atk = a; f.t = 0; f.hit = false; f.proj = false; if (f.y >= GY) f.vx = 0; ev('attack', { side: f.side, a }); };
    const ai = (f, o) => {
      const L = AI[f.cpu] || AI[2]; if (f.aiT > 0) return; f.aiT = L.react * (0.5 + rng());
      const dx = o.x - f.x, d = Math.abs(dx), dir = dx >= 0 ? 1 : -1; f.held.l = f.held.r = f.held.b = 0;
      if (o.st === 'atk' && d < 140 && rng() < L.block) { f.held.b = 1; return; }
      if (o.st === 'ko') return;
      if (d > 260 && f.en >= SPECIAL_COST && rng() < L.spec) { g.act(f.side, 's'); return; }
      if (d > 110) { if (dir > 0) f.held.r = 1; else f.held.l = 1; if (rng() < 0.07) g.act(f.side, 'j'); return; }
      const r = rng();
      if (r < L.aggr) g.act(f.side, rng() < 0.55 ? 'p' : 'k');
      else if (r < L.aggr + 0.15) { if (dir > 0) f.held.l = 1; else f.held.r = 1; }
      else if (r < L.aggr + 0.25) f.held.b = 1;
    };
    const actionable = f => f.st === 'idle' || f.st === 'walk' || f.st === 'block' || f.st === 'jump';
    const updFighter = (f, o, dt) => {
      f.inv = Math.max(0, f.inv - dt); f.aiT -= dt;
      if (f.buf) { f.buf.t -= dt; if (f.buf.t <= 0) f.buf = null; }
      if (f.cpu && g.phase === 'fight') ai(f, o);
      const air = f.y < GY;
      if (f.st === 'ko') { /* hanya fisika */ }
      else if (f.stun > 0) { f.stun -= dt; if (f.stun <= 0) { f.stun = 0; f.st = air ? 'jump' : 'idle'; f.inv = 0.35; } }
      else if (f.st === 'atk') {
        f.t += dt; const A = ATK[f.atk];
        if (f.atk === 's') {
          if (!f.proj && f.t >= A.su) { f.proj = true; g.proj.push({ x: f.x + f.face * 50, y: f.y - 60, vx: f.face * 520, owner: f.side, life: 2 }); ev('special', { side: f.side }); }
        } else if (!f.hit && f.t >= A.su && f.t < A.su + A.ac && g.phase === 'fight') {
          const cx = f.x + f.face * (A.reach / 2 + 14), cy = f.y + A.cy;
          if (Math.abs(cx - o.x) < A.reach / 2 + 24 && Math.abs(cy - (o.y - 55)) < A.hh + 55 && o.st !== 'ko') { if (hit(f, o, A, cx, cy)) f.hit = true; }
        }
        if (f.atk !== 'a' && f.t >= A.su + A.ac + A.rc) { f.st = 'idle'; f.atk = null; }
      } else if (g.phase === 'fight' || g.phase === 'ko') {
        const act = g.phase === 'fight' && actionable(f);
        if (act && f.buf) {
          const a = f.buf.a, gr = f.y >= GY;
          if (a === 'j') { if (gr) { f.vy = JUMP; f.vx = (f.held.r - f.held.l) * SPD * 0.9; f.st = 'jump'; ev('jump', { side: f.side }); } f.buf = null; }
          else if (a === 's') { if (gr && f.en >= SPECIAL_COST) { f.en -= SPECIAL_COST; startAtk(f, 's'); } else ev('noen', { side: f.side }); f.buf = null; }
          else if (gr) { startAtk(f, a); f.buf = null; }
          else if (!f.airAtk) { f.airAtk = true; startAtk(f, 'a'); f.buf = null; } else f.buf = null;
        }
        if (f.st !== 'atk' && f.y >= GY && (act || f.st === 'idle' || f.st === 'walk' || f.st === 'block')) {
          if (g.phase === 'fight') {
            const dir = f.held.r - f.held.l; f.face = o.x >= f.x ? 1 : -1;
            if (f.held.b) { f.st = 'block'; f.vx = 0; } else if (dir) { f.st = 'walk'; f.vx = dir * SPD; } else { f.st = 'idle'; f.vx = 0; }
          } else { f.st = 'idle'; f.vx = 0; }
        }
      }
      // fisika
      if (f.y < GY || f.vy < 0) f.vy += GRAV * dt;
      f.y += f.vy * dt; f.x += f.vx * dt;
      if (f.y >= GY) { f.y = GY; f.vy = 0; f.airAtk = false; if (f.st === 'jump') f.st = 'idle'; if (f.st === 'atk' && f.atk === 'a') { f.st = 'idle'; f.atk = null; } if (f.st === 'ko') f.vx *= 0.9; }
      if (f.stun > 0 || f.st === 'ko' || f.st === 'block') f.vx *= 1 - Math.min(1, 9 * dt);
      f.x = clamp(f.x, 40, W - 40);
    };
    const step = dt => {
      const [a, b] = g.f;
      if (g.phase === 'intro') { g.pt -= dt; if (g.pt <= 0) { g.phase = 'fight'; ev('fight'); } }
      else if (g.phase === 'fight') { g.timer -= dt; if (g.timer <= 0) { g.timer = 0; endRound('time'); } }
      else if (g.phase === 'ko') {
        g.pt -= dt;
        if (g.pt <= 0) {
          if (a.wins >= WINS || b.wins >= WINS) { g.phase = 'over'; g.over = true; g.winner = a.wins === b.wins ? -1 : a.wins > b.wins ? 0 : 1; ev('match', { winner: g.winner }); }
          else { g.round++; resetRound(); }
        }
      }
      if (g.over) return;
      updFighter(a, b, dt); updFighter(b, a, dt);
      const m = 46, d = b.x - a.x; // dorong agar tidak menumpuk (di tanah)
      if (a.y >= GY - 30 && b.y >= GY - 30 && Math.abs(d) < m && a.st !== 'ko' && b.st !== 'ko') { const o = (m - Math.abs(d)) / 2, s = d >= 0 ? 1 : -1; a.x = clamp(a.x - s * o, 40, W - 40); b.x = clamp(b.x + s * o, 40, W - 40); }
      for (const p of g.proj) {
        p.x += p.vx * dt; p.life -= dt; const o = g.f[1 - p.owner];
        if (p.x < -20 || p.x > W + 20) p.life = 0;
        if (p.life > 0 && o.st !== 'ko' && Math.abs(p.x - o.x) < 34 && Math.abs(p.y - (o.y - 55)) < 65) { if (o.inv > 0) { /* kebal sesaat: lewati */ } else { hit(g.f[p.owner], o, PROJ, p.x, p.y); p.life = 0; } }
      }
      g.proj = g.proj.filter(p => p.life > 0);
    };
    g.tick = dt => {
      if (g.over || !(dt > 0)) return;
      let rem = Math.min(dt, 0.1); while (rem > 1e-6 && !g.over) { const s = Math.min(rem, STEP); step(s); rem -= s; }
    };
    resetRound.first = false; resetRound();
    g.events.length = 1; g.events[0] = { type: 'intro', n: 1 };
    return g;
  }
  const api = { createGame, W, H, GY, ROUND_T, SPECIAL_COST, ATK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BrawlEngine = api;
})(typeof self !== 'undefined' ? self : this);
