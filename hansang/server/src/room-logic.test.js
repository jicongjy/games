import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, join, act, rematch, payload, setConnected, startGame } from './room-logic.js';
import { legalActions } from '../../engine/rules.js';

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
const T1 = 'token-aaaaaaaa';
const T2 = 'token-bbbbbbbb';
const T3 = 'token-cccccccc';

function twoPlayers(rng = seeded(1)) {
  const room = createRoom();
  assert.deepEqual(join(room, { token: T1, name: '지영' }, rng), { ok: true, seat: 0 });
  assert.equal(room.status, 'waiting');
  assert.deepEqual(join(room, { token: T2, name: '민수' }, rng), { ok: true, seat: 1 });
  return room;
}

test('두 명이 들어오면 시작하고, 첫 판은 방장(0번)이 선공', () => {
  const room = twoPlayers();
  assert.equal(room.status, 'playing');
  assert.equal(room.game.turn, 0);
});

test('같은 토큰으로 다시 접속하면 같은 자리로 돌아온다', () => {
  const room = twoPlayers();
  setConnected(room, 1, false);
  assert.equal(payload(room, 0).opponentConnected, false);
  assert.deepEqual(join(room, { token: T2, name: '민수' }), { ok: true, seat: 1 });
  assert.equal(payload(room, 0).opponentConnected, true);
});

test('세 번째 사람은 거절', () => {
  const room = twoPlayers();
  const r = join(room, { token: T3, name: '구경꾼' });
  assert.equal(r.ok, false);
});

test('잘못된 토큰은 거절하고 이름은 정리한다', () => {
  const room = createRoom();
  assert.equal(join(room, { token: 'x', name: 'a' }).ok, false);
  assert.equal(join(room, { token: 12345, name: 'a' }).ok, false);
  join(room, { token: T1, name: '  <b>아주아주아주긴이름입니다</b>  ' });
  assert.ok(room.players[0].name.length <= 10);
  assert.ok(!room.players[0].name.includes('<'));
  join(room, { token: T2, name: '' });
  assert.equal(room.players[1].name, '요리사 2');
});

test('상대에게 상대 패와 덱이 노출되지 않는다', () => {
  const room = twoPlayers();
  const p0 = JSON.stringify(payload(room, 0));
  for (const c of room.game.hands[1]) assert.ok(!p0.includes(`"${c.id}"`));
  for (const c of room.game.deck) assert.ok(!p0.includes(`"${c.id}"`));
  assert.equal(payload(room, 0).view.deckCount, 44);
  assert.equal(payload(room, 1).view.opponentHandCount, 8);
});

test('차례가 아닌 사람의 행동은 거절하고 상태는 그대로', () => {
  const room = twoPlayers();
  const before = JSON.stringify(room.game);
  const r = act(room, 1, { type: 'discard', cardId: room.game.hands[1][0].id });
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(room.game), before);
});

test('이상한 행동 형식은 거절', () => {
  const room = twoPlayers();
  assert.equal(act(room, 0, null).ok, false);
  assert.equal(act(room, 0, { type: 'hack' }).ok, false);
  assert.equal(act(room, 0, { type: 'discard', cardId: { $ne: 1 } }).ok, false);
  assert.equal(act(createRoom(), 0, { type: 'draw', from: 'deck' }).ok, false);
});

test('끝까지 두면 over가 되고, 둘 다 누르면 새 판(선공 교대)', () => {
  const rng = seeded(4);
  const room = twoPlayers(rng);
  let guard = 0;
  while (room.status === 'playing') {
    assert.ok(++guard < 3000);
    const g = room.game;
    const acts = legalActions(g, g.turn);
    const a = g.phase === 'draw' ? (acts.find((x) => x.from === 'deck') || acts[0]) : acts[Math.floor(rng() * acts.length)];
    assert.ok(act(room, g.turn, a).ok);
  }
  assert.equal(room.status, 'over');
  assert.ok(payload(room, 0).view.result);
  assert.equal(rematch(room, 0, seeded(9)).ok, true);
  assert.equal(room.status, 'over'); // 상대가 아직
  assert.deepEqual(payload(room, 1).rematch, [true, false]);
  rematch(room, 1, seeded(9));
  assert.equal(room.status, 'playing');
  assert.equal(room.game.turn, 1); // 선공 교대
  assert.equal(room.game.deck.length, 44);
});

test('진행 중 재대결 요청은 거절', () => {
  const room = twoPlayers();
  assert.equal(rematch(room, 0).ok, false);
});

test('방장이 정한 코스 수로 시작하고, 두 번째 사람이 다른 값을 보내도 무시한다', () => {
  const room = createRoom();
  join(room, { token: T1, name: '지영', courses: 6 }, seeded(2));
  join(room, { token: T2, name: '민수', courses: 5 }, seeded(2));
  assert.equal(room.settings.courses, 6);
  assert.equal(room.game.courses.length, 6);
  assert.equal(room.game.deck.length, 56);
  assert.equal(payload(room, 1).settings.courses, 6);
  assert.equal(payload(room, 1).view.courses.length, 6);
  assert.equal(payload(room, 0).view.bonus.length, 5);
});

test('코스 수를 안 정하거나 이상한 값이면 5코스', () => {
  const a = createRoom();
  join(a, { token: T1, name: 'a' }); join(a, { token: T2, name: 'b' });
  assert.equal(a.game.courses.length, 5);
  const b = createRoom();
  join(b, { token: T1, name: 'a', courses: 99 }); join(b, { token: T2, name: 'b' });
  assert.equal(b.game.courses.length, 5);
});

test('재대결해도 코스 수 설정이 유지되고 과제는 새로 뽑힌다', () => {
  const room = createRoom();
  join(room, { token: T1, name: 'a', courses: 6 }, seeded(3));
  join(room, { token: T2, name: 'b' }, seeded(3));
  const first = room.game.bonus.map((b) => b.id).join(',');
  room.status = 'over';
  rematch(room, 0, seeded(99)); rematch(room, 1, seeded(99));
  assert.equal(room.game.courses.length, 6);
  assert.notEqual(room.game.bonus.map((b) => b.id).join(','), first);
  assert.ok(room.game.bonus.every((b) => b.claimedBy === null));
});
