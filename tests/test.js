// Jalankan: node tests/test.js
const E = require('../assets/js/engine.js'); const assert = require('assert');
let seed = 1; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const EV = ['intro', 'fight', 'attack', 'jump', 'hit', 'special', 'ko', 'roundEnd', 'match', 'noen'], seen = new Set();
const inv = g => {
  g.f.forEach(f => { [f.x, f.y, f.vx, f.vy].forEach(v => assert(Number.isFinite(v), 'NaN/Infinity')); assert(f.hp >= 0 && f.hp <= 100 && f.en >= 0 && f.en <= 100, 'hp/energi di luar batas'); assert(f.x >= 40 && f.x <= E.W - 40 && f.y <= E.GY, 'posisi di luar arena'); assert(f.wins <= 2); });
  g.events.forEach(e => { assert(EV.includes(e.type), 'event tak dikenal ' + e.type); seen.add(e.type); }); g.events.length = 0;
};
const adv = (g, sec) => { for (let i = 0; i < sec * 60; i++) g.tick(1 / 60); };
const play = (g, human, maxT = 900) => { let n = 0; while (!g.over && g.f[0].wins + g.f[1].wins < 99 && n++ < maxT * 30) { human && human(g); g.tick(1 / 30); inv(g); } return g; };
// 1) fuzz: input acak untuk dua pemain, dt aneh, semua jenis aksi
for (let r = 0; r < 40; r++) { seed = r * 17 + 3; const g = E.createGame({ mode: r % 2 ? '2p' : '1p', level: 1 + r % 3 }, rng);
  for (let k = 0; k < 6000 && !g.over; k++) { for (const s of [0, 1]) { if (rng() < 0.3) g.setHeld(s, rng() < 0.5, rng() < 0.5, rng() < 0.3); if (rng() < 0.25) g.act(s, 'jpks'[rng() * 4 | 0]); } g.act(0, 'x'); g.act(7, 'p'); g.setHeld(9, 1, 1, 1);
    g.tick([0.016, 0.5, -1, NaN, 0, 0.033][k % 6]); inv(g); } }
// 2) CPU vs CPU: pertandingan selesai, kedua sisi saling memukul, level tinggi menang lebih sering
let hi = 0, tot = 0;
for (let r = 0; r < 24; r++) { seed = 200 + r; const g = E.createGame({ mode: '1p', level: 1 }, rng); g.f[0].cpu = 3; play(g); assert(g.over, 'match tidak selesai'); tot++; if (g.winner === 0) hi++; }
assert(hi / tot >= 0.6, 'level Sulit harus mengalahkan Mudah mayoritas: ' + hi + '/' + tot);
// 3) pemain diam kalah dari CPU; blok mengurangi damage; spam pukulan tidak menjadi combo tak terbatas
{ seed = 4; const g = E.createGame({ mode: '1p', level: 3 }, rng); play(g); assert(g.winner === 1, 'pemain diam harus kalah'); }
{ const mk = held => { const g = E.createGame({ mode: '2p' }, rng); adv(g, 1.5); g.f[0].x = 400; g.f[1].x = 450; g.setHeld(1, 0, 0, held); return g; };
  const dmg = held => { const g = mk(held); g.act(0, 'k'); for (let i = 0; i < 40; i++) { g.tick(1 / 60); g.f[0].inv = 0; } return 100 - g.f[1].hp; };
  const free = dmg(0), blocked = dmg(1); assert(free === 12 && blocked >= 1 && blocked < free / 3, 'blok harus memotong damage: ' + free + ' vs ' + blocked); }
{ const g = E.createGame({ mode: '2p' }, rng); adv(g, 1.5); g.f[0].x = 400; g.f[1].x = 440; const times = []; let last = 100, t = 0;
  for (let i = 0; i < 60 * 40 && g.f[1].hp > 0; i++, t += 1 / 60) { g.f[0].x = Math.max(40, g.f[1].x - 45); g.act(0, 'p'); g.tick(1 / 60); if (g.f[1].hp < last) { times.push(t); last = g.f[1].hp; } }
  assert(g.f[1].hp === 0 && times.length >= 14, 'spam pukulan harus akhirnya KO setelah banyak pukulan: ' + g.f[1].hp); const gaps = times.slice(1).map((x, k) => x - times[k]); assert(Math.min(...gaps) >= 0.25, 'jarak antar pukulan terlalu rapat (combo tak terbatas): ' + Math.min(...gaps)); }
// 4) energi: spesial butuh 50 & mengurangi energi; proyektil mengenai lawan
{ const g = E.createGame({ mode: '2p' }, rng); adv(g, 1.5); g.f[0].x = 200; g.f[1].x = 700; g.act(0, 's'); g.tick(0.1); assert(g.f[0].st !== 'atk', 'spesial tanpa energi tak boleh jalan');
  g.f[0].en = 100; g.act(0, 's'); adv(g, 2); assert(g.f[0].en === 56 && g.f[1].hp === 84, 'proyektil harus mengenai: hp ' + g.f[1].hp); }
['intro', 'fight', 'attack', 'jump', 'hit', 'special', 'ko', 'roundEnd', 'match', 'noen'].forEach(t => assert(seen.has(t), 'event tak pernah muncul: ' + t));
console.log('OK — fuzz, CPU vs CPU (Sulit menang ' + hi + '/' + tot + ' vs Mudah), blok, anti-combo, spesial, event lengkap');
