import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSES, HAND_SIZE, makeDeck, newGame, apply, legalActions, scoreLane, scores,
  canPlayOnLane, viewFor, winner,
} from './rules.js';

// 고정 시드 난수 (mulberry32)
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const c = (course, step, n = 1) => ({ id: step === 0 ? `${course}-r${n}` : `${course}-${step}`, course, step });
const lane = (...cards) => cards;

test('덱은 60장이고 카드 id가 모두 다르다', () => {
  const deck = makeDeck();
  assert.equal(deck.length, 60);
  assert.equal(new Set(deck.map((x) => x.id)).size, 60);
  for (const course of COURSES) {
    assert.equal(deck.filter((x) => x.course === course && x.step === 0).length, 3);
    assert.equal(deck.filter((x) => x.course === course && x.step > 0).length, 9);
  }
});

test('시작: 각자 8장, 창고 44장, 1번 플레이어가 먼저', () => {
  const s = newGame(seeded(1));
  assert.equal(s.hands[0].length, HAND_SIZE);
  assert.equal(s.hands[1].length, HAND_SIZE);
  assert.equal(s.deck.length, 44);
  assert.equal(s.turn, 0);
  assert.equal(s.phase, 'play');
});

test('같은 시드면 같은 배분', () => {
  assert.deepEqual(newGame(seeded(7)).hands, newGame(seeded(7)).hands);
});

test('코스 줄: 오름차순만, 같은 숫자와 낮은 숫자는 불가', () => {
  assert.ok(canPlayOnLane(lane(), c('ban', 5)));
  assert.ok(canPlayOnLane(lane(c('ban', 5)), c('ban', 6)));
  assert.ok(!canPlayOnLane(lane(c('ban', 5)), c('ban', 5)));
  assert.ok(!canPlayOnLane(lane(c('ban', 5)), c('ban', 3)));
});

test('코스 줄: 예약은 조리 카드보다 먼저만 낼 수 있다', () => {
  assert.ok(canPlayOnLane(lane(), c('ban', 0, 1)));
  assert.ok(canPlayOnLane(lane(c('ban', 0, 1)), c('ban', 0, 2)));
  assert.ok(!canPlayOnLane(lane(c('ban', 4)), c('ban', 0, 1)));
  assert.ok(canPlayOnLane(lane(c('ban', 0, 1)), c('ban', 2)));
});

test('점수: 시작 안 한 코스 0점, 재료비 -20', () => {
  assert.equal(scoreLane(lane()), 0);
  assert.equal(scoreLane(lane(c('ban', 4), c('ban', 6))), -10); // 10 - 20
  assert.equal(scoreLane(lane(c('ban', 10))), -10);
});

test('점수: 예약 배수', () => {
  // 예약1 + 5,6,7,8,9 = 35 → (35-20) x 2 = 30
  const l = lane(c('guk', 0, 1), c('guk', 5), c('guk', 6), c('guk', 7), c('guk', 8), c('guk', 9));
  assert.equal(scoreLane(l), 30);
  // 예약3 + 10 = 10 → (10-20) x 4 = -40
  assert.equal(scoreLane(lane(c('guk', 0, 1), c('guk', 0, 2), c('guk', 0, 3), c('guk', 10))), -40);
});

test('점수: 예약 포함 8장 이상이면 별 +20 (배수 계산 뒤에 더한다)', () => {
  // 예약1 + 2..8 (7장) = 35 → (35-20) x 2 + 20 = 50, 총 8장
  const l = lane(c('fish', 0, 1), ...[2, 3, 4, 5, 6, 7, 8].map((n) => c('fish', n)));
  assert.equal(l.length, 8);
  assert.equal(scoreLane(l), 50);
  // 7장이면 별 없음: 2..8 = 35 → 15
  assert.equal(scoreLane(lane(...[2, 3, 4, 5, 6, 7, 8].map((n) => c('fish', n)))), 15);
});

test('차례 규칙: 내기 전에 가져올 수 없고, 상대 차례에 움직일 수 없다', () => {
  const s = newGame(seeded(3));
  assert.equal(apply(s, 0, { type: 'draw', from: 'deck' }).ok, false);
  assert.equal(apply(s, 1, { type: 'discard', cardId: s.hands[1][0].id }).ok, false);
  assert.equal(apply(s, 0, { type: 'discard', cardId: 'nope' }).ok, false);
});

test('내려놓은 카드는 같은 차례에 다시 가져올 수 없다', () => {
  const s = newGame(seeded(3));
  const card = s.hands[0][0];
  const r1 = apply(s, 0, { type: 'discard', cardId: card.id });
  assert.ok(r1.ok);
  assert.equal(apply(r1.state, 0, { type: 'draw', from: card.course }).ok, false);
  assert.ok(!legalActions(r1.state, 0).some((a) => a.from === card.course));
  const r2 = apply(r1.state, 0, { type: 'draw', from: 'deck' });
  assert.ok(r2.ok);
  assert.equal(r2.state.turn, 1);
  assert.equal(r2.state.hands[0].length, HAND_SIZE);
  // 다음 차례에는 그 카드를 가져올 수 있다
  const next = r2.state;
  const other = next.hands[1][0];
  const r3 = apply(next, 1, { type: 'discard', cardId: other.id });
  const r4 = apply(r3.state, 1, { type: 'draw', from: card.course === other.course ? 'deck' : card.course });
  assert.ok(r4.ok);
});

test('올릴 수 없는 카드를 내면 거절하고 상태는 그대로', () => {
  const s = newGame(seeded(3));
  s.lanes[0].ban = [c('ban', 9)];
  s.hands[0][0] = c('ban', 4);
  const r = apply(s, 0, { type: 'play', cardId: 'ban-4' });
  assert.equal(r.ok, false);
  assert.equal(s.hands[0][0].id, 'ban-4');
});

test('창고의 마지막 카드를 뽑는 순간 끝난다', () => {
  const s = newGame(seeded(5));
  s.deck = s.deck.slice(0, 2);
  let st = s;
  let player = 0;
  const step = (action) => { const r = apply(st, player, action); assert.ok(r.ok, r.error); st = r.state; };
  step({ type: 'discard', cardId: st.hands[0][0].id });
  step({ type: 'draw', from: 'deck' });
  assert.equal(st.over, false);
  assert.equal(st.deck.length, 1);
  player = 1;
  step({ type: 'discard', cardId: st.hands[1][0].id });
  step({ type: 'draw', from: 'deck' });
  assert.equal(st.deck.length, 0);
  assert.equal(st.over, true);
  assert.equal(apply(st, 0, { type: 'discard', cardId: st.hands[0][0].id }).ok, false);
});

test('상대에게 보이는 상태에 덱 순서와 상대 패가 없다', () => {
  const s = newGame(seeded(9));
  const v = viewFor(s, 0);
  assert.equal(v.deckCount, 44);
  assert.equal(v.opponentHandCount, 8);
  assert.equal(v.myHand.length, 8);
  const text = JSON.stringify(v);
  for (const card of s.hands[1]) assert.ok(!text.includes(`"${card.id}"`), `상대 패 노출: ${card.id}`);
  for (const card of s.deck) assert.ok(!text.includes(`"${card.id}"`), `덱 노출: ${card.id}`);
});

test('무작위로 끝까지 100판: 카드 수가 항상 60장, 패는 항상 8장', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const rng = seeded(seed);
    let s = newGame(rng);
    let guard = 0;
    while (!s.over) {
      assert.ok(++guard < 2000, '끝나지 않음');
      const acts = legalActions(s, s.turn);
      assert.ok(acts.length > 0, '가능한 행동이 없음');
      const r = apply(s, s.turn, acts[Math.floor(rng() * acts.length)]);
      assert.ok(r.ok, r.error);
      s = r.state;
      const total = s.deck.length + s.hands[0].length + s.hands[1].length
        + COURSES.reduce((n, k) => n + s.market[k].length + s.lanes[0][k].length + s.lanes[1][k].length, 0);
      assert.equal(total, 60);
      if (s.phase === 'play') assert.equal(s.hands[0].length + s.hands[1].length, 16);
    }
    const [a, b] = scores(s);
    assert.ok(Number.isInteger(a) && Number.isInteger(b));
    const w = winner(s);
    assert.ok(w === null || w === 0 || w === 1);
    assert.equal(viewFor(s, 0).result.scores.length, 2);
  }
});

import { timeoutPlan } from './rules.js';
test('시간 초과: 내려놓고 창고에서 가져와 차례가 넘어간다', () => {
  let g = newGame(() => 0.3, { courses: 5 });
  const who = g.turn;
  const plan = timeoutPlan(g, who);
  assert.equal(plan.length, 2);
  for (const a of plan) { const r = apply(g, who, a); assert.ok(r.ok, r.error); g = r.state; }
  assert.equal(g.turn, 1 - who);
  assert.equal(g.hands[who].length, 8);
  // 내는 단계가 끝난 뒤에는 가져오기만
  let h = newGame(() => 0.3, { courses: 5 });
  const r1 = apply(h, h.turn, { type: 'discard', cardId: h.hands[h.turn][0].id });
  assert.deepEqual(timeoutPlan(r1.state, h.turn), [{ type: 'draw', from: 'deck' }]);
  assert.deepEqual(timeoutPlan(r1.state, 1 - h.turn), []);
});
