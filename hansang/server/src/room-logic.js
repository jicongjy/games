// 방 하나의 상태와 규칙 처리. Cloudflare 런타임에 의존하지 않아서 Node에서 테스트할 수 있다.
// 상태는 JSON으로 저장 가능한 순수 객체다.
import { newGame, apply, viewFor, timeoutPlan } from '../../engine/rules.js';

export const MAX_NAME = 10;
const ACTION_TYPES = new Set(['play', 'discard', 'draw']);
export const TURN_CHOICES = [0, 20, 30, 45, 60]; // 턴 제한 시간(초). 0은 제한 없음
export const GRACE_MS = 1000; // 통신 지연을 봐주는 여유
const INTRO_MS = 7000; // 6코스 판 시작 때 과제 소개를 보는 시간

export function createRoom() {
  return {
    players: [null, null], // { token, name, connected }
    game: null,
    status: 'waiting', // waiting | playing | over
    rematch: [false, false],
    games: 0, // 지금까지 시작한 판 수 (선공 번갈아 정하는 데 씀)
    settings: { courses: 5, turnSeconds: 0 }, // 방장이 정한 코스 수(5 또는 6)와 턴 제한(초)
    deadline: null, // 이번 차례 마감 시각(ms). 제한이 없으면 null
    autoSeq: 0, // 시간 초과로 대신 둔 횟수
    autoSeat: null, // 마지막으로 대신 둔 자리
  };
}

const cleanName = (name, fallback) => {
  const s = typeof name === 'string' ? name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, MAX_NAME) : '';
  return s || fallback;
};

export function startGame(room, rng = Math.random) {
  room.game = newGame(rng, { courses: room.settings?.courses === 6 ? 6 : 5 });
  room.game.turn = room.games % 2; // 판마다 선공을 번갈아
  room.games += 1;
  room.status = 'playing';
  room.rematch = [false, false];
  armTimer(room, Date.now(), room.game.bonus.length ? INTRO_MS : 0);
}

// 차례가 시작될 때 마감 시각을 정한다
export function armTimer(room, now = Date.now(), extra = 0) {
  const sec = room.settings?.turnSeconds ?? 0;
  room.deadline = room.status === 'playing' && sec > 0 ? now + sec * 1000 + extra : null;
}

// 시간이 지났으면 대신 둔다. 둔 게 있으면 true
export function timeout(room, now = Date.now()) {
  if (room.status !== 'playing' || !room.deadline || now < room.deadline + GRACE_MS - 50) return false;
  const seat = room.game.turn;
  for (const a of timeoutPlan(room.game, seat)) {
    const r = apply(room.game, seat, a);
    if (!r.ok) break;
    room.game = r.state;
  }
  room.autoSeq = (room.autoSeq ?? 0) + 1;
  room.autoSeat = seat;
  if (room.game.over) room.status = 'over';
  armTimer(room, now);
  return true;
}

// courses는 방을 처음 만드는 사람(첫 입장)만 정할 수 있다.
export function join(room, { token, name, courses, turnSeconds }, rng = Math.random) {
  if (typeof token !== 'string' || token.length < 8 || token.length > 64) {
    return { ok: false, error: '잘못된 접속 정보입니다' };
  }
  const seat = room.players.findIndex((p) => p && p.token === token);
  if (seat >= 0) { // 같은 사람이 다시 접속
    room.players[seat].connected = true;
    if (typeof name === 'string' && name.trim()) room.players[seat].name = cleanName(name, room.players[seat].name);
    return { ok: true, seat };
  }
  const free = room.players.findIndex((p) => !p);
  if (free < 0) return { ok: false, error: '방이 가득 찼어요' };
  if (free === 0) room.settings = { courses: courses === 6 ? 6 : 5, turnSeconds: TURN_CHOICES.includes(turnSeconds) ? turnSeconds : 0 };
  room.players[free] = { token, name: cleanName(name, `요리사 ${free + 1}`), connected: true };
  if (room.players[0] && room.players[1] && !room.game) startGame(room, rng);
  return { ok: true, seat: free };
}

export function setConnected(room, seat, connected) {
  if (room.players[seat]) room.players[seat].connected = connected;
}

export function act(room, seat, action) {
  if (room.status !== 'playing') return { ok: false, error: '지금은 둘 수 없어요' };
  if (!action || typeof action !== 'object' || !ACTION_TYPES.has(action.type)) {
    return { ok: false, error: '알 수 없는 행동입니다' };
  }
  const clean = { type: action.type };
  if (typeof action.cardId === 'string') clean.cardId = action.cardId.slice(0, 20);
  if (typeof action.from === 'string') clean.from = action.from.slice(0, 20);
  const r = apply(room.game, seat, clean);
  if (!r.ok) return r;
  const turnBefore = room.game.turn;
  room.game = r.state;
  if (room.game.over) room.status = 'over';
  if (room.game.turn !== turnBefore || room.status !== 'playing') armTimer(room);
  return { ok: true };
}

export function rematch(room, seat, rng = Math.random) {
  if (room.status !== 'over') return { ok: false, error: '아직 끝나지 않았어요' };
  room.rematch[seat] = true;
  if (room.rematch[0] && room.rematch[1]) startGame(room, rng);
  return { ok: true };
}

// 접속한 사람에게 보낼 내용. 상대 패와 덱 순서는 viewFor가 이미 뺀다.
export function payload(room, seat) {
  const opp = 1 - seat;
  return {
    t: 'state',
    status: room.status,
    seat,
    names: room.players.map((p) => (p ? p.name : null)),
    opponentConnected: !!(room.players[opp] && room.players[opp].connected),
    rematch: room.rematch,
    settings: room.settings ?? { courses: 5, turnSeconds: 0 },
    deadline: room.status === 'playing' ? room.deadline ?? null : null,
    now: Date.now(),
    auto: room.autoSeq ? { seq: room.autoSeq, seat: room.autoSeat } : null,
    view: room.game ? viewFor(room.game, seat) : null,
  };
}
