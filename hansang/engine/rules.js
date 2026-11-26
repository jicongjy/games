// 차려내라! 한 상: 규칙 엔진
// 화면, 서버, 테스트가 같은 코드를 쓴다. 빌드 없이 브라우저(ES module)와 Node에서 모두 동작한다.
// 모든 함수는 상태를 바꾸지 않고 새 상태를 돌려준다.

// 코스: 5코스 모드와 6코스 모드(면이 추가됨). 식사 순서대로 늘어놓는다.
export const COURSES_5 = ['ban', 'guk', 'fish', 'meat', 'sweet'];
export const COURSES_6 = ['ban', 'guk', 'noodle', 'fish', 'meat', 'sweet'];
export const COURSES = COURSES_5; // 5코스 기본값(기존 코드 호환)
export const courseList = (n) => (n === 6 ? COURSES_6 : COURSES_5);
export const COURSE_NAMES = {
  ban: '밑반찬',
  guk: '국·탕',
  noodle: '면',
  fish: '생선구이',
  meat: '불고기',
  sweet: '후식',
};
export const HAND_SIZE = 8;
export const RESERVATIONS_PER_COURSE = 3; // 단골 예약 카드 수
export const MIN_STEP = 2;
export const MAX_STEP = 10;
export const BASE_COST = 20; // 기본 재료비
export const STAR_CARDS = 8; // 별 한 개를 받는 카드 수 (예약 카드 포함)
export const STAR_BONUS = 20;
export const TASK_BONUS = 10; // 심사위원 과제 한 장당 점수
export const TASKS_PER_GAME = 5; // 한 판에 공개하는 과제 수

// ---------- 심사위원 과제 ----------
// kind 'first': 조건을 먼저 채운 사람이 그 자리에서 받는다.
// kind 'end'  : 마감 때 비교해서 가장 앞선 사람이 받는다. 동점이면 아무도 받지 못한다.
// 원작 목표 카드 11종(2026-11-26 사용자 확인). 카드 N장은 모두 예약 손님 포함.
const FIRST_TASKS = {
  seq3: 3, // 한 코스에 연속 숫자 3장
  wide3: 3, // 카드가 1장 이상인 코스 3개
  deep5: 5, // 한 코스에 카드 5장(예약 포함)
};
const END_TASKS = ['lowhand', 'mostcourses', 'bestplain'];

export function taskPool(courses) {
  return [
    ...courses.map((c) => `first3:${c}`), // 코스별로 조리 카드 3장을 먼저
    ...Object.keys(FIRST_TASKS),
    ...END_TASKS,
  ];
}

export function taskInfo(id) {
  const [base, course] = id.split(':');
  if (base === 'first3') return { id, base, kind: 'first', target: 3, course };
  if (base in FIRST_TASKS) return { id, base, kind: 'first', target: FIRST_TASKS[base] };
  return { id, base, kind: 'end', target: null, lowerIsBetter: base === 'lowhand' };
}

const stepsOf = (lane) => lane.filter((c) => c.step > 0);
const startedCount = (state, p) => state.courses.filter((c) => state.lanes[p][c].length > 0).length;

// 숫자 하나로 환산한 진행 정도. 첫 번째 종류는 목표와 비교하고, 두 번째 종류는 서로 비교한다.
export function taskMeasure(id, state, p) {
  const info = taskInfo(id);
  const lanes = state.courses.map((c) => state.lanes[p][c]);
  switch (info.base) {
    case 'first3': return state.lanes[p][info.course].length; // 예약 포함
    case 'seq3':
    case 'seq5': {
      let best = 0;
      for (const lane of lanes) {
        const s = stepsOf(lane).map((c) => c.step);
        let run = 0;
        for (let i = 0; i < s.length; i++) {
          run = i > 0 && s[i] === s[i - 1] + 1 ? run + 1 : 1;
          if (run > best) best = run;
        }
      }
      return best;
    }
    case 'wide3':
    case 'mostcourses': return startedCount(state, p);
    case 'deep5': return Math.max(...lanes.map((l) => l.length));
    case 'lowhand': return state.hands[p].reduce((s, c) => s + c.step, 0);
    case 'bestplain': { // 예약 손님이 없는 코스 중 최고 코스 점수(별 보너스 포함). 그런 코스가 없으면 null = 비교 대상 없음
      const plain = lanes.filter((l) => l.length > 0 && !l.some((c) => c.step === 0)).map(scoreLane);
      return plain.length ? Math.max(...plain) : null;
    }
    default: return 0;
  }
}

// ---------- 덱과 새 판 ----------
// step 0 = 단골 예약, 2~10 = 조리 단계
export function makeDeck(courses = COURSES_5) {
  const deck = [];
  for (const course of courses) {
    for (let i = 1; i <= RESERVATIONS_PER_COURSE; i++) {
      deck.push({ id: `${course}-r${i}`, course, step: 0 });
    }
    for (let step = MIN_STEP; step <= MAX_STEP; step++) {
      deck.push({ id: `${course}-${step}`, course, step });
    }
  }
  return deck;
}

// rng는 0 이상 1 미만의 수를 돌려주는 함수. 테스트에서는 고정 시드 함수를 넣는다.
export function shuffle(cards, rng = Math.random) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// options.courses: 5(기본 규칙) 또는 6(확장: 면과 심사위원 과제)
export function newGame(rng = Math.random, options = {}) {
  const courses = courseList(options.courses === 6 ? 6 : 5);
  const deck = shuffle(makeDeck(courses), rng);
  const hands = [[], []];
  for (let i = 0; i < HAND_SIZE; i++) {
    hands[0].push(deck.pop());
    hands[1].push(deck.pop());
  }
  const lanes = [0, 1].map(() => Object.fromEntries(courses.map((c) => [c, []])));
  const market = Object.fromEntries(courses.map((c) => [c, []])); // 마지막 원소가 맨 위
  // 5코스는 기본 규칙이라 과제가 없고, 6코스(확장)에서만 심사위원 과제 5장을 공개한다.
  const bonus = courses.length === 6
    ? shuffle(taskPool(courses), rng).slice(0, TASKS_PER_GAME).map((id) => ({ id, claimedBy: null }))
    : [];
  return {
    courses, // 이번 판의 코스 목록
    deck, // 마지막 원소가 맨 위
    hands,
    lanes, // lanes[플레이어][코스] = 낸 카드 순서
    market,
    bonus, // 이번 판의 심사위원 과제 { id, claimedBy }
    turn: 0,
    phase: 'play', // 'play'(내기) -> 'draw'(가져오기)
    justDiscarded: null, // 이번 차례에 좌판에 내려놓은 카드 id
    over: false,
  };
}

// 코스 줄에 카드를 올릴 수 있는지
export function canPlayOnLane(lane, card) {
  const steps = lane.filter((c) => c.step > 0);
  if (card.step === 0) return steps.length === 0; // 예약은 조리 카드보다 먼저
  if (steps.length === 0) return true;
  return card.step > steps[steps.length - 1].step; // 오름차순만
}

export function scoreLane(lane) {
  if (lane.length === 0) return 0;
  const reservations = lane.filter((c) => c.step === 0).length;
  const sum = lane.reduce((s, c) => s + c.step, 0);
  const star = lane.length >= STAR_CARDS;
  return (sum - BASE_COST) * (1 + reservations) + (star ? STAR_BONUS : 0);
}

export function laneDetail(lane) {
  const reservations = lane.filter((c) => c.step === 0).length;
  const sum = lane.reduce((s, c) => s + c.step, 0);
  return {
    started: lane.length > 0,
    sum,
    reservations,
    star: lane.length >= STAR_CARDS,
    score: scoreLane(lane),
  };
}

// 과제로 받은 점수
export function bonusPoints(state) {
  return [0, 1].map((p) => state.bonus.filter((b) => b.claimedBy === p).length * TASK_BONUS);
}

// 코스 점수만 더한 값
export function laneTotals(state) {
  return [0, 1].map((p) => state.courses.reduce((s, c) => s + scoreLane(state.lanes[p][c]), 0));
}

// 총점 = 코스 점수 + 과제 점수
export function scores(state) {
  const lanes = laneTotals(state);
  const bonus = bonusPoints(state);
  return [lanes[0] + bonus[0], lanes[1] + bonus[1]];
}

// 한 사람이 게임을 끝내면(포기) 점수와 관계없이 상대가 이긴다.
export function forfeit(state, player) {
  if (state.over) return fail('이미 끝난 게임입니다');
  const next = structuredClone(state);
  next.over = true;
  next.forfeitBy = player;
  settleEnd(next);
  return { ok: true, state: next };
}

export function winner(state) {
  if (state.forfeitBy === 0 || state.forfeitBy === 1) return 1 - state.forfeitBy;
  const [a, b] = scores(state);
  return a === b ? null : a > b ? 0 : 1;
}

// 방금 카드를 낸 사람이 먼저 채운 '선착' 과제를 가져간다.
function claimFirst(state, player) {
  for (const b of state.bonus) {
    if (b.claimedBy !== null) continue;
    const info = taskInfo(b.id);
    if (info.kind === 'first' && taskMeasure(b.id, state, player) >= info.target) b.claimedBy = player;
  }
}

// 마감 때 비교하는 과제를 정한다. 동점이면 아무도 받지 못한다.
function settleEnd(state) {
  for (const b of state.bonus) {
    const info = taskInfo(b.id);
    if (info.kind !== 'end') continue;
    const v = [taskMeasure(b.id, state, 0), taskMeasure(b.id, state, 1)];
    b.values = v;
    if (v[0] === v[1]) b.claimedBy = null;
    else if (v[0] === null || v[1] === null) b.claimedBy = v[0] === null ? 1 : 0; // 비교 대상 없음: 있는 쪽이 받는다
    else if (info.lowerIsBetter) b.claimedBy = v[0] < v[1] ? 0 : 1;
    else b.claimedBy = v[0] > v[1] ? 0 : 1;
    b.settled = true;
  }
}

const fail = (error) => ({ ok: false, error });

// action:
//   { type: 'play',    cardId }          내 코스 줄에 올리기
//   { type: 'discard', cardId }          시장 좌판에 내려놓기
//   { type: 'draw',    from: 'deck' }    식재료 창고에서 가져오기
//   { type: 'draw',    from: <코스> }    시장 좌판에서 가져오기
export function apply(state, player, action) {
  if (state.over) return fail('이미 끝난 게임입니다');
  if (player !== state.turn) return fail('상대 차례입니다');

  if (action.type === 'play' || action.type === 'discard') {
    if (state.phase !== 'play') return fail('먼저 카드를 가져와야 합니다');
    const idx = state.hands[player].findIndex((c) => c.id === action.cardId);
    if (idx < 0) return fail('손에 없는 카드입니다');
    const next = structuredClone(state);
    const [card] = next.hands[player].splice(idx, 1);
    if (action.type === 'play') {
      if (!canPlayOnLane(next.lanes[player][card.course], card)) {
        return fail('이 코스 줄에는 낼 수 없는 카드입니다');
      }
      next.lanes[player][card.course].push(card);
      next.justDiscarded = null;
      claimFirst(next, player);
    } else {
      next.market[card.course].push(card);
      next.justDiscarded = card.id;
    }
    next.phase = 'draw';
    return { ok: true, state: next };
  }

  if (action.type === 'draw') {
    if (state.phase !== 'draw') return fail('먼저 카드를 내야 합니다');
    const next = structuredClone(state);
    if (action.from === 'deck') {
      if (next.deck.length === 0) return fail('식재료 창고가 비었습니다');
      next.hands[player].push(next.deck.pop());
    } else if (state.courses.includes(action.from)) {
      const pile = next.market[action.from];
      if (pile.length === 0) return fail('그 좌판은 비어 있습니다');
      if (pile[pile.length - 1].id === state.justDiscarded) {
        return fail('방금 내려놓은 카드는 다시 가져올 수 없습니다');
      }
      next.hands[player].push(pile.pop());
    } else {
      return fail('가져올 곳이 올바르지 않습니다');
    }
    next.justDiscarded = null;
    next.phase = 'play';
    next.turn = 1 - player;
    // 창고의 마지막 카드를 뽑는 순간 마감
    if (next.deck.length === 0) {
      next.over = true;
      settleEnd(next);
    }
    return { ok: true, state: next };
  }

  return fail('알 수 없는 행동입니다');
}

// 가능한 모든 행동 (자동 테스트와 봇에 쓴다)
export function legalActions(state, player) {
  if (state.over || player !== state.turn) return [];
  const out = [];
  if (state.phase === 'play') {
    for (const card of state.hands[player]) {
      if (canPlayOnLane(state.lanes[player][card.course], card)) {
        out.push({ type: 'play', cardId: card.id });
      }
      out.push({ type: 'discard', cardId: card.id });
    }
  } else {
    if (state.deck.length > 0) out.push({ type: 'draw', from: 'deck' });
    for (const c of state.courses) {
      const pile = state.market[c];
      if (pile.length > 0 && pile[pile.length - 1].id !== state.justDiscarded) {
        out.push({ type: 'draw', from: c });
      }
    }
  }
  return out;
}

// 화면에 보여 줄 과제 한 장. 상대 손패 합처럼 숨겨진 값은 null로 돌려준다.
function bonusView(state, player, b) {
  const info = taskInfo(b.id);
  const hidden = info.base === 'lowhand' && !state.over;
  const progress = [0, 1].map((p) => (hidden && p !== player ? null : taskMeasure(b.id, state, p)));
  return {
    id: b.id,
    kind: info.kind,
    course: info.course ?? null,
    target: info.target,
    claimedBy: b.claimedBy,
    progress,
    settled: !!b.settled,
  };
}

// 플레이어에게 보여 줄 상태. 덱 순서와 상대 패는 숨긴다.
export function viewFor(state, player) {
  const opp = 1 - player;
  const view = {
    you: player,
    courses: state.courses,
    turn: state.turn,
    phase: state.phase,
    over: state.over,
    deckCount: state.deck.length,
    myHand: state.hands[player],
    opponentHandCount: state.hands[opp].length,
    myLanes: state.lanes[player],
    opponentLanes: state.lanes[opp],
    market: state.market,
    justDiscarded: state.justDiscarded,
    bonus: state.bonus.map((b) => bonusView(state, player, b)), // 과제 목록과 진행 상황
    bonusPoints: bonusPoints(state),
    scores: scores(state), // 코스 줄은 둘 다 공개 정보라서 지금까지 점수도 공개
  };
  if (state.over) {
    view.result = {
      scores: scores(state),
      laneTotals: laneTotals(state),
      bonusPoints: bonusPoints(state),
      winner: winner(state),
      forfeitBy: state.forfeitBy ?? null, // 게임을 끝낸 사람(없으면 null)
      lanes: [0, 1].map((p) =>
        Object.fromEntries(state.courses.map((c) => [c, laneDetail(state.lanes[p][c])])),
      ),
      bonus: state.bonus.map((b) => ({ ...bonusView(state, player, b), values: b.values ?? null })),
    };
  }
  return view;
}

// 시간 초과 때 대신 두는 수: 낼 수 없는 카드 중 가장 낮은 숫자를 좌판에 내려놓고, 창고에서 한 장 가져온다.
// (낼 수 없는 카드가 없으면 예약이 아닌 카드 중 가장 낮은 것, 그것도 없으면 아무거나)
export function timeoutPlan(state, player) {
  if (state.over || player !== state.turn) return [];
  const plan = [];
  if (state.phase === 'play') {
    const hand = state.hands[player];
    const pool = hand.filter((c) => !canPlayOnLane(state.lanes[player][c.course], c));
    const cand = (pool.length ? pool : hand.filter((c) => c.step > 0)).slice();
    const pick = (cand.length ? cand : hand).slice().sort((a, b) => (a.step || 99) - (b.step || 99) || (a.id < b.id ? -1 : 1))[0];
    plan.push({ type: 'discard', cardId: pick.id });
  }
  plan.push({ type: 'draw', from: 'deck' });
  return plan;
}
