// 일꾼 규칙 난이도 확인 도구. 세 가지 방식으로 자동 플레이해서 장날을 몇 번째까지 넘기는지 센다.
// 실행: node tools/sim-work.js
require('../js/engine.js');
require('../js/data.js');
const ST = globalThis.ST, W = ST.work, q = ST.QUESTS[0];

// 조각 종류별로 놓을 자리(앞에서부터). smart는 조합이 생기게, plain은 밭을 빵집 옆에만.
const SLOTS = {
  smart: { bakery: [12, 2], field: [7, 11, 13, 1, 3], well: [6, 8], mill: [17, 0], house: [21, 23, 16, 18, 15, 19], orchard: [22, 10, 14] },
  plain: { bakery: [12, 2], field: [7, 11, 13, 17, 1, 3], well: [24, 23], mill: [21, 22], house: [0, 5, 10, 15, 9, 14], orchard: [19, 18] }
};
function placeAll(s, kind) {
  for (const id in s.inv) while (s.inv[id] > 0) {
    const c = (SLOTS[kind][id] || []).find(x => !s.board[x]);
    if (c === undefined || !W.build(s, id, c)) break;
  }
}
function count(s, id) { return s.board.filter(x => x && x.k === 'b' && x.id === id).length + (s.inv[id] || 0); }
function shop(s, kind) {
  const P = {}; ST.PACKS.forEach(p => P[p.id] = p);
  for (let n = 0; n < 6; n++) {
    let want = null;
    if (kind === 'plain') { if (count(s, 'field') < 4) want = P.farm; }
    else if (count(s, 'field') < 3 || count(s, 'well') < 1) want = P.farm;
    else if (count(s, 'mill') < 1) want = P.shop;
    else if (count(s, 'house') < 3) want = P.town;
    if (!want || s.gold < want.cost) return;
    W.buy(s, want); placeAll(s, kind);
  }
}
function workDay(s) {
  while (W.idle(s)) {
    let best = -1, bv = 0;
    for (let c = 0; c < 25; c++) {
      const b = s.board[c];
      if (!b || b.k !== 'b' || W.canWork(s, c)) continue;
      let v = 0;
      if (b.id === 'bakery') { const t = W.takeable(s, c), f = W.adj(s, c, 'field'); v = t >= f ? 10 + t : (W.daysLeft(s) === 1 ? 5 + t : 0); }
      else if (b.id === 'field') v = (W.adj(s, c, 'bakery') ? 4 : 0.5) - b.w;
      else if (b.id === 'orchard') v = 1;
      if (v > bv) { bv = v; best = c; }
    }
    if (best < 0) break;
    W.work(s, best);
  }
}
function randomDay(s, r) {
  for (const id in s.inv) while (s.inv[id] > 0) { const e = []; s.board.forEach((x, i) => { if (!x) e.push(i); }); W.build(s, id, e[r() % e.length]); }
  const p = ST.PACKS[r() % ST.PACKS.length]; if (s.gold >= p.cost) W.buy(s, p);
  for (let n = 0; n < 20 && W.idle(s); n++) W.work(s, r() % 25);
}
function run(kind, seed, quota) {
  const s = W.newGame(q, seed);
  if (quota) s.quota = quota.slice();
  let x = seed * 7919 + 1; const r = () => (x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff) >> 8;
  let total = 0;
  while (s.phase !== 'over') {
    if (s.phase === 'market') { W.next(s); continue; }
    if (kind === 'random') randomDay(s, r);
    else { placeAll(s, kind); shop(s, kind); workDay(s); }
    const before = s.stat.baked; W.endDay(s); total = s.stat.baked;
  }
  return { week: s.week, won: s.won, baked: total, stars: W.evaluate(s, q).stars, res: W.residents(s), pages: s.found.length };
}
const quota = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
console.log('장날 요구량:', (quota || q.work.quota).join(', '));
['random', 'plain', 'smart'].forEach(kind => {
  const R = []; for (let i = 1; i <= 300; i++) R.push(run(kind, i, quota));
  const avg = f => (R.reduce((a, r) => a + f(r), 0) / R.length).toFixed(1);
  const pct = f => Math.round(R.filter(f).length / R.length * 100) + '%';
  console.log(kind.padEnd(7), '통과', pct(r => r.won), '| 1주', pct(r => r.week >= 1), '2주', pct(r => r.week >= 2),
    '| 구운 빵', avg(r => r.baked), '별', avg(r => r.stars), '주민', avg(r => r.res), '노트', avg(r => r.pages));
});
