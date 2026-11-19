// 차려내라! 한 상: 규칙 엔진
// 화면, 서버, 테스트가 같은 코드를 쓴다. 빌드 없이 브라우저(ES module)와 Node에서 모두 동작한다.
// 모든 함수는 상태를 바꾸지 않고 새 상태를 돌려준다.

export const COURSES = ['ban', 'guk', 'fish', 'meat', 'sweet'];
export const COURSE_NAMES = {
  ban: '밑반찬',
  guk: '국·탕',
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

// step 0 = 단골 예약, 2~10 = 조리 단계
export function makeDeck() {
  const deck = [];
  for (const course of COURSES) {
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

export function newGame(rng = Math.random) {
  const deck = shuffle(makeDeck(), rng);
  const hands = [[], []];
  for (let i = 0; i < HAND_SIZE; i++) {
    hands[0].push(deck.pop());
    hands[1].push(deck.pop());
  }
  const lanes = [0, 1].map(() => Object.fromEntries(COURSES.map((c) => [c, []])));
  const market = Object.fromEntries(COURSES.map((c) => [c, []])); // 마지막 원소가 맨 위
  return {
    deck, // 마지막 원소가 맨 위
    hands,
    lanes, // lanes[플레이어][코스] = 낸 카드 순서
    market,
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

export function scores(state) {
  return [0, 1].map((p) => COURSES.reduce((s, c) => s + scoreLane(state.lanes[p][c]), 0));
}

export function winner(state) {
  const [a, b] = scores(state);
  return a === b ? null : a > b ? 0 : 1;
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
    } else if (COURSES.includes(action.from)) {
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
    if (next.deck.length === 0) next.over = true;
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
    for (const c of COURSES) {
      const pile = state.market[c];
      if (pile.length > 0 && pile[pile.length - 1].id !== state.justDiscarded) {
        out.push({ type: 'draw', from: c });
      }
    }
  }
  return out;
}

// 플레이어에게 보여 줄 상태. 덱 순서와 상대 패는 숨긴다.
export function viewFor(state, player) {
  const opp = 1 - player;
  const view = {
    you: player,
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
    scores: scores(state), // 코스 줄은 둘 다 공개 정보라서 지금까지 점수도 공개
  };
  if (state.over) {
    view.result = {
      scores: scores(state),
      winner: winner(state),
      lanes: [0, 1].map((p) =>
        Object.fromEntries(COURSES.map((c) => [c, laneDetail(state.lanes[p][c])])),
      ),
    };
  }
  return view;
}
