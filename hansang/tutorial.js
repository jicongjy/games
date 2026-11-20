// 연습(튜토리얼): 정해진 패와 정해진 상대 수로 한 판의 처음 몇 수를 직접 해 본다.
// 실제 규칙 엔진(engine/rules.js)을 그대로 쓰므로, 연습에서 배운 규칙이 곧 실제 규칙이다.
import { makeDeck, newGame, shuffle } from './engine/rules.js';

// 5코스(기본 규칙) 한 판의 시작 상태. 내 패와 덱 위쪽 카드, 상대 패가 정해져 있다.
export function makeTutorialGame() {
  const g = newGame(() => 0.5, { courses: 5 });
  const all = makeDeck();
  const take = (id) => {
    const i = all.findIndex((c) => c.id === id);
    if (i < 0) throw new Error(`연습 카드가 없음: ${id}`);
    return all.splice(i, 1)[0];
  };
  const mine = ['ban-4', 'guk-r1', 'meat-3', 'sweet-5', 'fish-9', 'guk-8', 'meat-6', 'sweet-9'].map(take);
  const theirs = ['fish-6', 'fish-3', 'ban-8', 'guk-3', 'sweet-2', 'meat-8', 'sweet-6', 'guk-9'].map(take);
  // 덱은 끝에서부터 뽑힌다: 내 첫 가져오기 ban-2, 상대 meat-2, 상대 fish-2, 내 마지막 가져오기 sweet-3
  const tail = ['sweet-3', 'fish-2', 'meat-2', 'ban-2'].map(take);
  let seed = 7;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  g.deck = shuffle(all, rng).concat(tail);
  g.hands = [mine, theirs];
  g.turn = 0;
  g.phase = 'play';
  g.bonus = [];
  return g;
}

// 내가 한 가져오기가 끝나면 상대가 두는 정해진 수
export const OPP_SCRIPTS = [
  [{ type: 'discard', cardId: 'fish-6' }, { type: 'draw', from: 'deck' }],
  [{ type: 'play', cardId: 'fish-3' }, { type: 'draw', from: 'deck' }],
];

// kind: info(읽고 다음) | act(정해진 곳만 누를 수 있음) | score(점수 계산 설명) | done(끝)
// allow: 누를 수 있는 카드, 코스, 좌판, 가져올 곳. expect: 이 행동이 끝나면 다음 단계. then: 이어서 상대가 두는 수
export const TUT_STEPS = [
  { kind: 'info', text: '코스마다 숫자가 커지는 순서로 카드를 쌓아요.', focus: ['.cols'] },
  { kind: 'act', text: '카드를 골라 같은 색 코스에 올려요.', allow: { cards: ['ban-4'], lane: 'ban' }, expect: 'play' },
  { kind: 'act', text: '내고 나면 한 장 가져와요.', allow: { draw: ['deck'] }, expect: 'draw', then: 0 },
  { kind: 'act', text: '작은 숫자는 올릴 수 없어요. 좌판에 내려놓아요.', allow: { cards: ['ban-2'], drop: 'ban' }, expect: 'discard' },
  { kind: 'act', text: '좌판의 카드도 가져올 수 있어요.', allow: { draw: ['fish'] }, expect: 'draw', then: 1 },
  { kind: 'act', text: '예약 손님(×2)은 숫자 카드보다 먼저 내요.', allow: { cards: ['guk-r1'], lane: 'guk' }, expect: 'play' },
  { kind: 'act', text: '한 장 가져와요.', allow: { draw: ['deck'] }, expect: 'draw' },
  { kind: 'score' },
  { kind: 'info', text: '창고가 바닥나면 끝나요. 남은 장수는 왼쪽에 있어요.', focus: ['.deck'] },
  { kind: 'done' },
];
