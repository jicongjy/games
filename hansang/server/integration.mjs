// 실행 중인 서버(wrangler dev 또는 배포된 주소)에 붙어서 두 클라이언트가 한 판을 끝까지 두는 확인용 스크립트
// 사용법: node server/integration.mjs ws://localhost:8787
import { canPlayOnLane } from '../engine/rules.js';

const base = process.argv[2] || 'ws://localhost:8787';
const code = 'T' + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[01OIL]/g, 'X');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name, token) {
  const c = { name, token, last: null, errors: [] };
  c.ws = new WebSocket(`${base}/ws/${code}`);
  c.ready = new Promise((res, rej) => { c.ws.onopen = res; c.ws.onerror = () => rej(new Error('connect failed')); });
  c.ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'state') c.last = m; else if (m.t === 'error') c.errors.push(m);
  };
  c.send = (o) => c.ws.send(JSON.stringify(o));
  c.join = () => c.send({ t: 'join', name, token, courses: Number(process.env.COURSES || 5) });
  return c;
}
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };

const a = client('지영', 'token-aaaaaaaa-1');
const b = client('민수', 'token-bbbbbbbb-2');
await Promise.all([a.ready, b.ready]);
a.join(); await sleep(300);
assert(a.last && a.last.status === 'waiting' && a.last.seat === 0, 'A가 대기 상태여야 함');
b.join(); await sleep(300);
assert(a.last.status === 'playing' && b.last.status === 'playing' && b.last.seat === 1, '둘이 들어오면 시작');
const want = Number(process.env.COURSES || 5);
assert(a.last.view.courses.length === want && b.last.view.courses.length === want, `코스 수 ${want}`);
assert(a.last.view.bonus.length === 5, '과제 5장');
assert(a.last.view.deckCount === (want === 6 ? 56 : 44), '창고 장수');

// 숨김 정보 확인: 서로의 view에 상대 패 카드 id가 없어야 한다
const aHand = a.last.view.myHand.map((c) => c.id);
const bText = JSON.stringify(b.last);
assert(aHand.every((id) => !bText.includes(`"${id}"`)), '상대 패 노출됨');
assert(b.last.view.opponentHandCount === 8 && b.last.view.deckCount === (want === 6 ? 56 : 44), '장수 정보');

// 세 번째 사람은 거절
const c3 = client('구경꾼', 'token-cccccccc-3'); await c3.ready; c3.join(); await sleep(300);
assert(c3.errors.some((e) => e.fatal), '세 번째 접속은 거절돼야 함');

// 차례 아닌 사람의 행동은 거절
b.errors.length = 0;
b.send({ t: 'act', action: { type: 'discard', cardId: b.last.view.myHand[0].id } }); await sleep(200);
assert(b.errors.length === 1, '차례 위반은 거절돼야 함');

// 재접속: B가 끊었다가 같은 토큰으로 돌아옴
b.ws.close(); await sleep(300);
assert(a.last.opponentConnected === false, '상대 끊김 표시');
const b2 = client('민수', 'token-bbbbbbbb-2'); await b2.ready; b2.join(); await sleep(300);
assert(a.last.opponentConnected === true && b2.last.seat === 1, '재접속 복귀');

// 끝까지 두기 (단순 봇: 올릴 수 있으면 올리고, 아니면 내려놓고, 창고에서 뽑기)
const players = [a, b2];
let steps = 0;
while (!(a.last.status === 'over')) {
  assert(++steps < 600, '끝나지 않음');
  const turnSeat = a.last.view.turn;
  const p = players[turnSeat];
  const v = p.last.view;
  if (v.phase === 'play') {
    const playable = v.myHand.find((card) => canPlayOnLane(v.myLanes[card.course], card));
    const card = playable || v.myHand[0];
    p.send({ t: 'act', action: { type: playable ? 'play' : 'discard', cardId: card.id } });
  } else {
    p.send({ t: 'act', action: { type: 'draw', from: 'deck' } });
  }
  await sleep(25);
}
await sleep(200);
assert(a.last.view.result && b2.last.view.result, '결과가 양쪽에 있어야 함');
assert(JSON.stringify(a.last.view.result.scores) === JSON.stringify(b2.last.view.result.scores), '양쪽 점수가 같아야 함');
console.log('결과 점수:', a.last.view.result.scores, '단계 수:', steps);

// 한 판 더
a.send({ t: 'rematch' }); await sleep(200);
assert(a.last.status === 'over' && a.last.rematch[0] === true, '재대결 대기');
b2.send({ t: 'rematch' }); await sleep(300);
assert(a.last.status === 'playing' && a.last.view.turn === 1, '새 판 시작, 선공 교대');
console.log('통합 테스트 통과:', code);
process.exit(0);
