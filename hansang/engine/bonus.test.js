import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSES_5, COURSES_6, newGame, apply, legalActions, viewFor, scores, laneTotals, bonusPoints,
  taskPool, taskInfo, taskMeasure, TASK_BONUS, TASKS_PER_GAME, makeDeck, courseList,
} from './rules.js';

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
const card = (course, step, n = 1) => ({ id: step === 0 ? `${course}-r${n}` : `${course}-${step}`, course, step });
// 과제 하나만 걸고, 0번 플레이어가 낼 카드를 손에 쥐여 준 판
function setup(taskId, { courses = 5, lanes0 = {}, lanes1 = {}, hand0 = [], hand1 = null } = {}) {
  const s = newGame(seeded(11), { courses });
  s.bonus = [{ id: taskId, claimedBy: null }];
  for (const [c, cards] of Object.entries(lanes0)) s.lanes[0][c] = cards;
  for (const [c, cards] of Object.entries(lanes1)) s.lanes[1][c] = cards;
  s.hands[0] = hand0.concat(s.hands[0].slice(0, 8 - hand0.length));
  if (hand1) s.hands[1] = hand1;
  return s;
}
const playCard = (s, p, c) => { const r = apply(s, p, { type: 'play', cardId: c.id }); assert.ok(r.ok, r.error); return r.state; };

test('5코스는 60장 창고 44장, 6코스는 72장 창고 56장(면 포함)', () => {
  const a = newGame(seeded(1));
  assert.equal(a.courses.length, 5);
  assert.equal(a.deck.length, 44);
  const b = newGame(seeded(1), { courses: 6 });
  assert.deepEqual(b.courses, COURSES_6);
  assert.equal(b.deck.length, 56);
  assert.equal(makeDeck(COURSES_6).length, 72);
  assert.equal(new Set(makeDeck(COURSES_6).map((c) => c.id)).size, 72);
  assert.ok(Object.keys(b.lanes[0]).includes('noodle') && Object.keys(b.market).includes('noodle'));
  assert.deepEqual(courseList(5), COURSES_5);
  assert.deepEqual(newGame(seeded(1), { courses: 7 }).courses, COURSES_5); // 이상한 값은 5코스
});

test('6코스(확장)는 과제 5장이 겹치지 않게 뽑히고, 5코스(기본)에는 과제가 없다', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = newGame(seeded(seed), { courses: 6 });
    assert.equal(g.bonus.length, TASKS_PER_GAME);
    assert.equal(new Set(g.bonus.map((b) => b.id)).size, TASKS_PER_GAME);
    assert.ok(g.bonus.every((b) => b.claimedBy === null));
    assert.equal(newGame(seeded(seed)).bonus.length, 0);
    assert.equal(newGame(seeded(seed), { courses: 5 }).bonus.length, 0);
  }
  assert.ok(taskPool(COURSES_6).includes('first3:noodle'));
  assert.ok(!taskPool(COURSES_5).includes('first3:noodle'));
});

test('5코스는 기본 규칙: 과제 점수가 없고 총점은 코스 점수의 합', () => {
  const rng = seeded(21);
  let s = newGame(rng);
  let guard = 0;
  while (!s.over) {
    assert.ok(++guard < 4000);
    const acts = legalActions(s, s.turn);
    s = apply(s, s.turn, acts[Math.floor(rng() * acts.length)]).state;
  }
  assert.deepEqual(bonusPoints(s), [0, 0]);
  assert.deepEqual(scores(s), laneTotals(s));
  assert.deepEqual(viewFor(s, 0).bonus, []);
});

test('코스별 선착: 카드 3장을 먼저 낸 사람이 받고, 뒤따른 사람은 못 받는다', () => {
  let s = setup('first3:ban', { lanes0: { ban: [card('ban', 2), card('ban', 3)] }, hand0: [card('ban', 4)] });
  s = playCard(s, 0, card('ban', 4));
  assert.equal(s.bonus[0].claimedBy, 0);
  assert.deepEqual(bonusPoints(s), [TASK_BONUS, 0]);
  // 상대가 나중에 3장을 채워도 가져가지 못한다
  s.turn = 1; s.phase = 'play';
  s.lanes[1].ban = [card('ban', 5), card('ban', 6)];
  s.hands[1][0] = card('ban', 7);
  s = playCard(s, 1, card('ban', 7));
  assert.equal(s.bonus[0].claimedBy, 0);
});

test('예약 카드도 코스별 선착의 카드 3장에 센다', () => {
  let s = setup('first3:guk', { lanes0: { guk: [card('guk', 0, 1), card('guk', 0, 2)] }, hand0: [card('guk', 0, 3)] });
  s = playCard(s, 0, card('guk', 0, 3));
  assert.equal(s.bonus[0].claimedBy, 0);
});

test('예약만 놓인 코스도 시작한 코스로 센다(코스 3개 선착, 마감 비교)', () => {
  let s = setup('wide3', { lanes0: { ban: [card('ban', 0, 1)], guk: [card('guk', 0, 1)] }, hand0: [card('fish', 0, 1)] });
  s = playCard(s, 0, card('fish', 0, 1));
  assert.equal(s.bonus[0].claimedBy, 0);
  assert.equal(taskMeasure('mostcourses', s, 0), 3);
});

test('연속 과제: 이어지는 숫자 3장이어야 하고 띄엄띄엄은 안 된다', () => {
  let a = setup('seq3', { lanes0: { fish: [card('fish', 4), card('fish', 5)] }, hand0: [card('fish', 6)] });
  a = playCard(a, 0, card('fish', 6));
  assert.equal(a.bonus[0].claimedBy, 0);
  let b = setup('seq3', { lanes0: { fish: [card('fish', 2), card('fish', 4)] }, hand0: [card('fish', 5)] });
  b = playCard(b, 0, card('fish', 5)); // 2, 4, 5 = 연속은 2장뿐
  assert.equal(b.bonus[0].claimedBy, null);
  assert.equal(taskMeasure('seq3', b, 0), 2);
});

test('폭 과제: 코스 3개를 먼저 시작하면 받는다', () => {
  let s = setup('wide3', { lanes0: { ban: [card('ban', 2)], guk: [card('guk', 3)] }, hand0: [card('fish', 4)] });
  s = playCard(s, 0, card('fish', 4));
  assert.equal(s.bonus[0].claimedBy, 0);
});

test('깊이 과제: 한 코스에 예약 포함 5장', () => {
  let d = setup('deep5', { lanes0: { sweet: [2, 3, 4, 5].map((n) => card('sweet', n)) }, hand0: [card('sweet', 6)] });
  d = playCard(d, 0, card('sweet', 6));
  assert.equal(d.bonus[0].claimedBy, 0);
});

test('6코스: 면 코스에 낼 수 있고 면 과제도 동작한다', () => {
  let s = setup('first3:noodle', { courses: 6, lanes0: { noodle: [card('noodle', 2), card('noodle', 3)] }, hand0: [card('noodle', 4)] });
  s = playCard(s, 0, card('noodle', 4));
  assert.equal(s.bonus[0].claimedBy, 0);
});

// 마감 직전 상태를 만들어 마지막 카드를 뽑게 한다
function finish(s) {
  s.deck = [card('sweet', 10)];
  s.phase = 'draw'; s.turn = 0; s.justDiscarded = null;
  const r = apply(s, 0, { type: 'draw', from: 'deck' });
  assert.ok(r.ok, r.error);
  assert.equal(r.state.over, true);
  return r.state;
}

test('마감 과제(손패): 손에 남은 숫자 합이 가장 작은 사람이 받는다', () => {
  const s = setup('lowhand', { hand0: [], hand1: [card('ban', 9), card('guk', 9)] });
  s.hands[0] = [card('ban', 2), card('guk', 2)];
  const e = finish(s); // 0번은 마지막 카드(후식 10)를 받아 14, 1번은 18
  assert.deepEqual(e.bonus[0].values, [14, 18]);
  assert.equal(e.bonus[0].claimedBy, 0);
  assert.equal(bonusPoints(e)[0], TASK_BONUS);
});

test('마감 과제 동점이면 아무도 받지 못한다', () => {
  const s = setup('mostcourses', { lanes0: { ban: [card('ban', 2)], guk: [card('guk', 2)] }, lanes1: { fish: [card('fish', 2)], meat: [card('meat', 2)] } });
  s.hands[0] = [card('ban', 3)];
  const e = finish(s);
  assert.deepEqual(e.bonus[0].values, [2, 2]);
  assert.equal(e.bonus[0].claimedBy, null);
  assert.deepEqual(bonusPoints(e), [0, 0]);
  assert.ok(e.bonus[0].settled);
});

test('총점은 코스 점수와 과제 점수의 합', () => {
  let s = setup('first3:ban', { lanes0: { ban: [card('ban', 2), card('ban', 3)] }, hand0: [card('ban', 4)] });
  const before = laneTotals(s)[0];
  s = playCard(s, 0, card('ban', 4));
  assert.equal(scores(s)[0], laneTotals(s)[0] + TASK_BONUS);
  assert.ok(laneTotals(s)[0] > before);
});

test('상대 손패 합은 마감 전에는 보이지 않고, 마감 뒤에는 둘 다 공개된다', () => {
  const s = setup('lowhand', { hand0: [] });
  const mid = viewFor(s, 0).bonus[0];
  assert.equal(typeof mid.progress[0], 'number');
  assert.equal(mid.progress[1], null);
  assert.equal(viewFor(s, 1).bonus[0].progress[0], null);
  const e = finish(s);
  const v = viewFor(e, 0);
  assert.ok(v.result.bonus[0].values.every((x) => typeof x === 'number'));
  assert.ok(v.bonus[0].progress.every((x) => typeof x === 'number'));
  assert.ok(!JSON.stringify(viewFor(newGame(seeded(5)), 0)).includes('"deck"'));
});

test('무작위로 끝까지 5코스, 6코스 각 60판: 카드 수 보존, 과제 정합성', () => {
  for (const courses of [5, 6]) {
    const total = courses === 6 ? 72 : 60;
    for (let seed = 1; seed <= 60; seed++) {
      const rng = seeded(seed * 7 + courses);
      let s = newGame(rng, { courses });
      let guard = 0;
      while (!s.over) {
        assert.ok(++guard < 4000);
        const acts = legalActions(s, s.turn);
        assert.ok(acts.length > 0);
        const r = apply(s, s.turn, acts[Math.floor(rng() * acts.length)]);
        assert.ok(r.ok, r.error);
        s = r.state;
        const n = s.deck.length + s.hands[0].length + s.hands[1].length
          + s.courses.reduce((x, c) => x + s.market[c].length + s.lanes[0][c].length + s.lanes[1][c].length, 0);
        assert.equal(n, total);
      }
      assert.ok(s.bonus.every((b) => [null, 0, 1].includes(b.claimedBy)));
      assert.ok(s.bonus.filter((b) => taskInfo(b.id).kind === 'end').every((b) => b.settled));
      const sc = scores(s);
      assert.equal(sc[0], laneTotals(s)[0] + bonusPoints(s)[0]);
      assert.equal(sc[1], laneTotals(s)[1] + bonusPoints(s)[1]);
    }
  }
});

test('마감 과제(예약 없는 코스의 최고 점수): 예약이 있는 코스는 점수가 커도 세지 않는다', () => {
  const s = setup('bestplain', {
    lanes0: { ban: [card('ban', 2), card('ban', 3), card('ban', 4)] }, // 예약 없음, 합 9 → (9-20)×1 = -11
    lanes1: { guk: [card('guk', 0, 1), card('guk', 10), card('guk', 9)], fish: [card('fish', 3), card('fish', 4)] }, // 예약 코스는 제외, 예약 없는 코스 합 7 → -13
  });
  const e = finish(s);
  assert.deepEqual(e.bonus[0].values, [-11, -13]);
  assert.equal(e.bonus[0].claimedBy, 0);
});

test('최고 점수 과제는 별 보너스(+20)를 포함해서 비교한다', () => {
  const seven = [10, 9, 8, 7, 6, 5, 4].map((n) => card('meat', n)); // 합 49 → 29점
  const eight = [2, 3, 4, 5, 6, 7, 8, 9].map((n) => card('fish', n)); // 합 44 → 24 + 20 = 44점
  const s = setup('bestplain', { lanes0: { meat: seven }, lanes1: { fish: eight } });
  const e = finish(s);
  assert.deepEqual(e.bonus[0].values, [29, 44]);
  assert.equal(e.bonus[0].claimedBy, 1); // 숫자 합으로 비교했다면 0번이 이겼을 것
});

test('예약 없는 코스가 한쪽에만 없으면 있는 쪽이 받는다(마이너스 점수여도)', () => {
  const s = setup('bestplain', {
    lanes0: { ban: [card('ban', 0, 1), card('ban', 5)] }, // 예약 코스뿐 → 비교 대상 없음
    lanes1: { fish: [card('fish', 2), card('fish', 3)] }, // 합 5 → -15
  });
  const e = finish(s);
  assert.deepEqual(e.bonus[0].values, [null, -15]);
  assert.equal(e.bonus[0].claimedBy, 1);
  assert.deepEqual(bonusPoints(e), [0, TASK_BONUS]);
});

test('예약 없는 코스가 둘 다 없으면 아무도 받지 못한다', () => {
  const s = setup('bestplain', {
    lanes0: { ban: [card('ban', 0, 1), card('ban', 5)] },
    lanes1: {},
  });
  const e = finish(s);
  assert.deepEqual(e.bonus[0].values, [null, null]);
  assert.equal(e.bonus[0].claimedBy, null);
});

test('과제 풀은 원작 목표 카드 11종 기준: 5코스 11장, 6코스 12장(코스별 3장 6개)', () => {
  assert.equal(taskPool(COURSES_5).length, 11);
  assert.equal(taskPool(COURSES_6).length, 12);
  const six = taskPool(COURSES_6);
  for (const id of ['seq5', 'wide4', 'star', 'mostrsv', 'mostcards']) assert.ok(!six.includes(id), id);
  for (const id of ['deep5', 'wide3', 'seq3', 'mostcourses', 'bestplain', 'lowhand']) assert.ok(six.includes(id), id);
  assert.equal(six.filter((id) => id.startsWith('first3:')).length, 6);
});
