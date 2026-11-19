// 유물 효과 단위 시험. 실행: node tools/test-relics.js
require('../js/engine.js');
require('../js/data.js');
const ST = globalThis.ST, W = ST.work, Q = ST.QUESTS;
let ok = 0, bad = 0;
const t = (name, cond) => { console.log((cond ? 'OK  ' : 'FAIL'), name); cond ? ok++ : bad++; };
function game(qi, relics, inv) { const s = W.newGame(Q[qi], 7, relics); Object.assign(s.inv, inv || {}); return s; }

// 낡은 나침반: 모서리(0)는 2배, 가운데(12)는 1배. 밭 칸 한도(4)는 그대로
let s = game(0, ['compass'], { field: 4 });
W.build(s, 'field', 0); W.build(s, 'field', 12);
W.work(s, 0); t('나침반: 모서리 밭 곡식 2개', s.board[0].w === 2);
W.work(s, 12); t('나침반: 가운데 밭 곡식 1개', s.board[12].w === 1);
s = game(0, [], { field: 2 }); W.build(s, 'field', 0); W.work(s, 0); t('유물 없음: 모서리 밭 곡식 1개', s.board[0].w === 1);

// 새벽 종: 주의 첫날의 첫 일만 +1. 그날 둘째 일, 둘째 날은 보통
s = game(0, ['dawnbell'], { field: 4 });
[6, 7, 8, 9].forEach(c => W.build(s, 'field', c));
t('새벽 종: 주의 첫날 첫 일의 보너스는 1', W.first(s) === 1);
W.work(s, 6); t('새벽 종: 주의 첫날 첫 일 +1(곡식 2개)', s.board[6].w === 2);
W.work(s, 7); t('새벽 종: 그날 둘째 일은 보통(곡식 1개)', s.board[7].w === 1);
W.endDay(s); W.work(s, 8); t('새벽 종: 둘째 날 첫 일은 보통(곡식 1개)', s.board[8].w === 1);
// 빵집: 곡식 1개 → 빵 1개 + 1
s = game(0, ['dawnbell'], { field: 1, bakery: 1 }); W.build(s, 'field', 6); W.build(s, 'bakery', 7); s.board[6].w = 1;
t('새벽 종: 빵집 미리보기 2개', W.bakeOut(s, 7) === 2);
W.work(s, 7); t('새벽 종: 첫 일이 빵집이면 빵 2개(곡식 1개 → 1 + 1)', s.bread === 2 && s.board[6].w === 0);
// 나침반과 새벽 종이 겹치면 (기본 × 2) + 1
s = game(0, ['compass', 'dawnbell'], { field: 1, bakery: 1 }); W.build(s, 'field', 1); W.build(s, 'bakery', 0); s.board[1].w = 1;
t('나침반+새벽 종: 모서리 빵집 첫 일 (1 × 2) + 1 = 3', W.bakeOut(s, 0) === 3);

// 돋보기
s = game(0, ['magnifier']); const p = ST.packsFor(Q[0])[0];
t('돋보기: 꾸러미 값 -1', W.cost(s, p) === p.cost - 1);
s.gold = p.cost - 1; const got = W.buy(s, p);
t('돋보기: 깎인 값으로 살 수 있음(남은 금화는 해 볼 일 상금뿐)', !!got && s.gold === Q[0].work.todo.find(x => x.id === 'buy').gold);
t('돋보기: 1개 밑으로는 안 내려감', W.cost(s, { cost: 1 }) === 1);
t('유물 없음: 값 그대로', W.cost(game(0, []), p) === p.cost);

// 당근 주머니: 두부가 한 마리 더. 장날(주의 마지막 날)에만 일한다
s = game(0, ['carrot']);
t('당근: 일꾼 3명, 첫날 쉬는 일꾼은 2명(당근 두부는 장날만)', s.workers.length === 3 && W.idle(s) === 2);
for (let d = 1; d < s.perWeek; d++) { t('당근: ' + d + '일째 쉬는 일꾼 2명', W.idle(s) === 2); W.endDay(s); if (s.phase === 'event') W.choose(s, ST.WEVENTS[s.event].choices.find(c => W.canChoose(s, c))); }
t('당근: 장날(' + s.perWeek + '일째)에는 쉬는 일꾼 3명', W.idle(s) === 3);
t('당근: 5번 의뢰 조각 한도 7', game(4, ['carrot']).limit === 7);
t('유물 없음: 5번 의뢰 조각 한도 6', game(4, []).limit === 6);
t('당근: 한도 없는 의뢰는 한도 0 그대로', game(0, ['carrot']).limit === 0);

// 몽당연필
s = game(1, ['pencil'], { house: 2 }); W.build(s, 'house', 0);
const before = { workers: s.workers.length, inv: s.inv.house };
t('연필: 지우기 가능', W.canErase(s));
t('연필: 지움', W.erase(s, 0) && s.board[0] === null && s.inv.house === before.inv + 1 && s.workers.length === before.workers - 1);
t('연필: 판마다 한 번', !W.canErase(s) && !W.erase(s, 0));
s = game(1, [], { house: 1 }); W.build(s, 'house', 0); t('연필 없으면 못 지움', !W.erase(s, 0));
s = game(4, ['pencil'], { field: 3, bakery: 1 }); W.build(s, 'field', 1); const pl = s.placed; W.erase(s, 1); t('연필: 5번 의뢰 지은 조각 수도 돌아감', s.placed === pl - 1);

console.log('\n통과', ok, '실패', bad);
process.exit(bad ? 1 : 0);
