// 차려내라! 한 상: 한 기기에서 번갈아 두기 + 온라인 2인
import {
  COURSES, apply, newGame, viewFor, canPlayOnLane, laneDetail, STAR_CARDS, BASE_COST,
} from './engine/rules.js';
import { THEME, cardTitle, iconSvg, courseIcon } from './cards-data.js';
import { serverUrl } from './config.js';

const PREFIX = 'hansang:';
const store = {
  get(k) { try { return localStorage.getItem(PREFIX + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(PREFIX + k, v); } catch (e) { /* 저장 실패는 무시 */ } },
};

const app = document.getElementById('app');
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let names = ['요리사 1', '요리사 2']; // 한 기기 모드 이름
try {
  const saved = JSON.parse(store.get('names') || 'null');
  if (Array.isArray(saved) && saved.length === 2) names = saved.map(String);
} catch (e) { /* 기본 이름 사용 */ }

let mode = 'local'; // local | online
let screen = 'home'; // home | local-setup | lobby | wait | play | over
let game = null; // 한 기기 모드의 게임 상태
let net = null; // 온라인 모드 상태
let selected = null;
let cover = false;
let sheet = null; // null | {type:'lane', player, course} | {type:'score'}
let starPop = null;
let pendingFly = null;
let toastTimer = null;

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2800);
}

// ---------- 카드 그리기 ----------
const colorVars = (course, reserve = false) => {
  const t = THEME[course];
  return reserve ? '--bg:#F1EDE6;--ink:#1a1a1a' : `--bg:${t.color};--ink:${t.ink}`;
};

function cardHtml(card, { tag = 'div', extra = '', mini = false, sel = false } = {}) {
  const t = THEME[card.course];
  const num = card.step === 0 ? '예' : card.step;
  return `<${tag} class="card${mini ? ' mini' : ''}${sel ? ' sel' : ''}" style="${colorVars(card.course, card.step === 0)}" ${extra}>
    <div class="ct">${cardTitle(card)}</div>
    <div class="ci">${iconSvg(card)}</div>
    <div class="cf"><span>${t.name}</span><b>${num}</b></div>
  </${tag}>`;
}

function laneSummary(lane) {
  const d = laneDetail(lane);
  const steps = lane.filter((c) => c.step > 0);
  const big = steps.length ? steps[steps.length - 1].step : (d.reservations ? `예${d.reservations}` : '–');
  return { d, big, count: lane.length };
}

function myLaneHtml(lanes, course, { target, player }) {
  const lane = lanes[course];
  const t = THEME[course];
  const { d, big, count } = laneSummary(lane);
  const cls = ['lane'];
  if (!d.started) cls.push('empty');
  if (target) cls.push('target');
  else cls.push('dim');
  const star = d.star ? `<span class="star${starPop === course ? ' pop' : ''}" title="별 한 개">★</span>` : '';
  const meta = d.started ? `${count}장${d.reservations ? `<br>예약 ${d.reservations}` : ''}` : '&nbsp;<br>&nbsp;';
  const pt = d.started ? `<div class="pt ${d.score < 0 ? 'neg' : ''}">${d.score > 0 ? '+' : ''}${d.score}</div>` : '<div class="pt" style="opacity:0">0</div>';
  const main = `
    ${star}
    <div class="ic">${courseIcon(course)}</div>
    <div class="nm">${t.name}</div>
    <div class="big">${big}</div>
    <div class="meta">${meta}</div>
    ${pt}`;
  const attrs = `data-mylane="${course}" style="--c:${t.color};--k:${t.ink}"`;
  const info = d.started ? `<button class="info" data-detail="${player}:${course}" aria-label="${t.name} 낸 카드 보기">i</button>` : '';
  if (target) {
    return `<div class="lw"><button class="${cls.join(' ')}" ${attrs} data-lane="${course}" aria-label="${t.name} 줄에 올리기"><span class="tag">올리기</span>${main}</button>${info}</div>`;
  }
  return `<div class="lw"><div class="${cls.join(' ')}" ${attrs}>${main}</div>${info}</div>`;
}

function oppChipHtml(ctx, course) {
  const t = THEME[course];
  const oppIdx = 1 - ctx.me;
  const { d, big, count } = laneSummary(ctx.v.opponentLanes[course]);
  const cls = d.started ? 'opp' : 'opp empty';
  const sc = d.started ? `<span class="m">${count}장</span><span class="m">${d.score > 0 ? '+' : ''}${d.score}</span>` : `<span class="m">${t.name}</span>`;
  return `<button class="${cls}" style="--c:${t.color};--k:${t.ink}" data-detail="${oppIdx}:${course}" ${d.started ? '' : 'disabled'} aria-label="${esc(ctx.nm[oppIdx])} ${t.name} 줄 보기"><span class="n">${big}</span>${sc}</button>`;
}

// ---------- 화면 맥락: 한 기기 / 온라인 ----------
function getCtx() {
  if (mode === 'local') {
    const me = game.turn;
    return { v: viewFor(game, me), me, nm: names, myTurn: true, online: false };
  }
  const v = net.view;
  return { v, me: net.seat, nm: net.names, myTurn: v.turn === net.seat && !v.over, online: true };
}

// ---------- 화면들 ----------
const RULES = `
  <details>
    <summary>규칙 보기</summary>
    <ul>
      <li>내 차례에 ① 카드를 코스 줄에 올리거나 시장 좌판에 내려놓고, ② 식재료 창고나 좌판에서 한 장 가져옵니다.</li>
      <li>코스 줄에는 단계 숫자가 커지는 순서로만 올릴 수 있습니다. 단골 예약은 숫자 카드보다 먼저 냅니다.</li>
      <li>코스 점수 = (숫자 합 − 20) × (1 + 예약 수). 시작하지 않은 코스는 0점입니다.</li>
      <li>예약 포함 8장 이상이면 별 한 개(+20점).</li>
      <li>방금 내려놓은 카드는 같은 차례에 다시 가져올 수 없습니다.</li>
      <li>식재료 창고의 마지막 카드를 가져오면 마감, 한 판이 끝납니다.</li>
    </ul>
  </details>`;

function renderHome() {
  const online = !!serverUrl();
  app.innerHTML = `
  <section class="start">
    <h1>차려내라!<br>한 상</h1>
    <p class="sub">마감 전에 한 상, 누가 더 근사하게 차려낼까요?</p>
    <button class="btn" data-act="go-online" ${online ? '' : 'disabled'}>온라인으로 둘이서</button>
    ${online ? '' : '<p class="note">온라인 서버 주소가 아직 설정되지 않았어요.</p>'}
    <button class="btn ghost" data-act="go-local" style="margin-top:12px">한 기기에서 번갈아</button>
    ${RULES}
  </section>`;
}

function renderLocalSetup() {
  app.innerHTML = `
  <section class="start">
    <h1>한 기기에서<br>번갈아</h1>
    <label for="n0">첫 번째 요리사 (먼저 시작)</label>
    <input id="n0" maxlength="10" value="${esc(names[0])}" autocomplete="off">
    <label for="n1">두 번째 요리사</label>
    <input id="n1" maxlength="10" value="${esc(names[1])}" autocomplete="off">
    <button class="btn" data-act="start-local">주방 열기</button>
    <button class="btn ghost" data-act="home" style="margin-top:10px">처음으로</button>
  </section>`;
}

function renderLobby() {
  const code = net?.prefillCode || '';
  app.innerHTML = `
  <section class="start">
    <h1>온라인으로<br>둘이서</h1>
    <label for="oname">내 이름</label>
    <input id="oname" maxlength="10" value="${esc(store.get('oname') || '')}" placeholder="요리사" autocomplete="off">
    <button class="btn" data-act="create-room">방 만들기</button>
    <label for="ocode" style="margin-top:22px">친구가 만든 방 코드</label>
    <input id="ocode" maxlength="6" value="${esc(code)}" placeholder="예: K7P2X" autocomplete="off" style="text-transform:uppercase">
    <button class="btn ghost" data-act="join-room" style="margin-top:12px">들어가기</button>
    <button class="btn ghost" data-act="home" style="margin-top:10px">처음으로</button>
  </section>`;
}

function renderWait() {
  const link = `${location.origin}${location.pathname}?room=${net.code}`;
  app.innerHTML = `
  <section class="start" style="text-align:center">
    <p class="sub" style="margin:0">친구에게 이 코드를 알려 주세요</p>
    <div class="code">${esc(net.code)}</div>
    <button class="btn" data-act="copy-link" data-link="${esc(link)}">초대 링크 복사</button>
    <p class="note" style="margin-top:16px">${net.connected ? '상대가 들어오면 바로 시작해요.' : '연결이 끊겼어요. 다시 연결하는 중…'}</p>
    <button class="btn ghost" data-act="leave" style="margin-top:10px">나가기</button>
  </section>`;
}

function sheetHtml(ctx) {
  if (!sheet) return '';
  const { v, me, nm } = ctx;
  if (sheet.type === 'score') {
    return `<div class="backdrop" data-act="close"></div>
    <div class="sheet" role="dialog" aria-label="점수">
      <h3>지금까지 점수</h3><p class="sub">코스 점수의 합이에요. 마감 때 확정돼요.</p>
      <div class="sc"><span>${esc(nm[0])}</span><b class="${v.scores[0] < 0 ? 'neg' : ''}">${v.scores[0]}</b></div>
      <div class="sc"><span>${esc(nm[1])}</span><b class="${v.scores[1] < 0 ? 'neg' : ''}">${v.scores[1]}</b></div>
      <button class="btn ghost close" data-act="close">닫기</button>
    </div>`;
  }
  const { player, course } = sheet;
  const lane = (player === me ? v.myLanes : v.opponentLanes)[course];
  const t = THEME[course];
  const d = laneDetail(lane);
  const rows = lane.map((c) => `<div class="li" style="--c:${c.step === 0 ? '#F1EDE6' : t.color};--k:${c.step === 0 ? '#1a1a1a' : t.ink}"><span class="no">${c.step === 0 ? '예' : c.step}</span>${cardTitle(c)}</div>`).join('');
  const calc = `(숫자 합 ${d.sum} − ${BASE_COST}) × ${1 + d.reservations}${d.star ? ' + 별 20' : ''} = <b>${d.score}점</b>`;
  return `<div class="backdrop" data-act="close"></div>
  <div class="sheet" role="dialog" aria-label="${t.name} 줄">
    <h3>${esc(nm[player])}님 · ${t.name}</h3>
    <p class="sub">낸 순서대로 ${lane.length}장</p>
    ${rows || '<p class="sub">아직 낸 카드가 없어요</p>'}
    ${d.started ? `<div class="calc">${calc}</div>` : ''}
    <button class="btn ghost close" data-act="close">닫기</button>
  </div>`;
}

function renderPlay() {
  const ctx = getCtx();
  const { v, me, nm, myTurn, online } = ctx;
  const opp = 1 - me;
  const selCard = selected ? v.myHand.find((c) => c.id === selected) : null;
  if (selected && (!selCard || !myTurn)) selected = null;

  const playing = myTurn && v.phase === 'play';
  const drawing = myTurn && v.phase === 'draw';
  const aim = (playing && !!selCard) || drawing;

  const hand = v.myHand.slice().sort((a, b) => COURSES.indexOf(a.course) - COURSES.indexOf(b.course) || a.step - b.step);
  const deckUrgent = v.deckCount <= 10;
  const deckTarget = drawing && v.deckCount > 0;

  const marketCols = COURSES.map((course) => {
    const pile = v.market[course];
    const top = pile[pile.length - 1];
    const t = THEME[course];
    const canDrawHere = drawing && top && top.id !== v.justDiscarded;
    const canDropHere = playing && selCard && selCard.course === course;
    const body = top ? cardHtml(top, { mini: true }) : `<div class="none" style="--c:${t.color}">${t.name}</div>`;
    const cnt = `<div class="cnt">${pile.length}장</div>`;
    const base = `data-pile="${course}"`;
    if (canDrawHere) return `<button class="pile target" ${base} data-draw="${course}" aria-label="${t.name} 좌판에서 가져오기"><span class="tag">가져오기</span>${body}${cnt}</button>`;
    if (canDropHere) return `<button class="pile target" ${base} data-drop="${course}" aria-label="${t.name} 좌판에 내려놓기"><span class="tag">내려놓기</span>${body}${cnt}</button>`;
    return `<div class="pile ${aim ? 'dim' : ''}" ${base}>${body}${cnt}</div>`;
  }).join('');

  const oppChips = COURSES.map((c) => oppChipHtml(ctx, c)).join('');
  const myLanes = COURSES.map((c) => {
    const target = playing && selCard && selCard.course === c && canPlayOnLane(v.myLanes[c], selCard);
    return myLaneHtml(v.myLanes, c, { target, player: me });
  }).join('');

  const handHtml = hand.map((card) => cardHtml(card, {
    tag: 'button',
    extra: `data-card="${card.id}" aria-pressed="${card.id === selected}" ${playing ? '' : 'disabled'}`,
    sel: card.id === selected,
  })).join('');

  const who = online
    ? (myTurn ? '내 차례예요' : `${esc(nm[opp])}님이 두는 중`)
    : `${esc(nm[me])}님 차례`;
  const tip = !myTurn
    ? '상대가 두는 동안 내 패를 살펴보세요'
    : playing
      ? '<span class="stp">1</span>카드를 골라 코스에 올리거나 좌판에 내려놓기'
      : '<span class="stp">2</span>창고나 좌판에서 한 장 가져오기';

  const banner = online && !net.connected
    ? '<div class="banner bad">연결이 끊겼어요. 다시 연결하는 중…</div>'
    : online && !net.opponentConnected
      ? `<div class="banner">${esc(nm[opp])}님의 연결이 끊겼어요. 돌아올 때까지 기다려요.</div>`
      : '';

  app.innerHTML = `
  ${banner}
  <header class="top">
    ${deckTarget
      ? `<button class="deckbtn target ${deckUrgent ? 'urgent' : ''}" data-draw="deck" aria-label="식재료 창고에서 가져오기"><span class="tag">가져오기</span><small>마감까지</small><b>${v.deckCount}</b></button>`
      : `<div class="deckbtn ${deckUrgent ? 'urgent' : ''}"><small>마감까지</small><b>${v.deckCount}</b></div>`}
    <div class="status">
      <div class="who">${who}</div>
      <div class="tip">${tip}</div>
      ${deckUrgent ? '<div class="late">곧 마감입니다</div>' : ''}
    </div>
    <button class="scorebtn" data-act="score">점수</button>
  </header>
  <main class="board ${aim ? 'aim' : ''}">
    <section>
      <div class="lbl"><span>${esc(nm[opp])}님의 코스</span><span>눌러서 보기</span></div>
      <div class="row" style="margin-top:8px">${oppChips}</div>
    </section>
    <section class="market">
      <div class="lbl"><span>시장 좌판</span></div>
      <div class="row">${marketCols}</div>
    </section>
    <section>
      <div class="lbl"><span>${esc(nm[me])}님의 코스</span></div>
      <div class="row" style="margin-top:8px">${myLanes}</div>
    </section>
  </main>
  <div class="handwrap">
    <div class="handlbl">내 패 ${v.myHand.length}장</div>
    <div class="hand">${handHtml}</div>
  </div>
  ${sheetHtml(ctx)}
  ${!online && cover ? `<div class="cover">
      <h2>${esc(nm[me])}님 차례입니다</h2>
      <p>${esc(nm[opp])}님은 화면을 보지 마세요.<br>준비되면 아래 버튼을 눌러 패를 확인하세요.</p>
      <button class="btn" data-act="reveal">내 패 보기</button>
    </div>` : ''}`;
  starPop = null;
}

function review(result, nm) {
  const w = result.winner;
  const sc = result.scores;
  if (w === null) return ['점수가 똑같습니다. 심사위원이 한 입씩 더 먹어 보기로 했습니다.'];
  const l = 1 - w;
  const big = Math.abs(sc[0] - sc[1]) >= 30;
  return big
    ? [`${nm[w]}님: 오늘 밤 심사위원은 이 주방의 이름을 기억할 겁니다.`,
       `${nm[l]}님: 재료만 늘어놓다 마감 종이 울렸네요. 다음 영업을 노려 보세요.`]
    : [`${nm[w]}님: 한 접시 차이로 별이 갈렸습니다.`,
       `${nm[l]}님: 아쉽지만 다음 상차림이 기대됩니다.`];
}

function renderOver() {
  const ctx = getCtx();
  const { v, nm, me, online } = ctx;
  const r = v.result;
  const w = r.winner;
  const rows = COURSES.map((c) => {
    const t = THEME[c];
    const cell = (d) => (d.started
      ? `${d.sum}${d.reservations ? ` · 예약 ${d.reservations}` : ''}${d.star ? ' · ★' : ''}`
      : '–');
    const sc = (d) => `<td class="${d.score < 0 ? 'neg' : ''}">${d.started ? d.score : 0}</td>`;
    return `<tr><td class="cname" style="--c:${t.color}"><i></i>${t.name}</td><td>${cell(r.lanes[0][c])}</td>${sc(r.lanes[0][c])}<td>${cell(r.lanes[1][c])}</td>${sc(r.lanes[1][c])}</tr>`;
  }).join('');
  const unfinished = [0, 1].filter((p) => COURSES.some((c) => r.lanes[p][c].started && r.lanes[p][c].score < 0));
  const headline = w === null ? '무승부' : online ? (w === me ? '내가 이겼어요!' : `${esc(nm[w])}님 승리`) : `${esc(nm[w])}님 승리`;

  let again = '<button class="btn" data-act="again">한 판 더</button>';
  let hint = '';
  if (online) {
    const mine = net.rematch[me];
    const theirs = net.rematch[1 - me];
    again = `<button class="btn" data-act="again" ${mine ? 'disabled' : ''}>${mine ? '상대를 기다리는 중…' : '한 판 더'}</button>`;
    if (theirs && !mine) hint = `<p class="note" style="text-align:center">${esc(nm[1 - me])}님이 한 판 더를 원해요.</p>`;
  }
  const banner = online && !net.connected ? '<div class="banner bad">연결이 끊겼어요. 다시 연결하는 중…</div>' : '';

  app.innerHTML = `${banner}
  <section class="result">
    <h2>${headline}</h2>
    <div class="tot">
      <div class="${w === 0 ? 'win' : ''}">${esc(nm[0])}<b>${r.scores[0]}</b></div>
      <div class="${w === 1 ? 'win' : ''}">${esc(nm[1])}<b>${r.scores[1]}</b></div>
    </div>
    <table>
      <thead><tr><th>코스</th><th colspan="2">${esc(nm[0])}</th><th colspan="2">${esc(nm[1])}</th></tr>
      <tr><th></th><th>숫자 합</th><th>점수</th><th>숫자 합</th><th>점수</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="note">코스 점수 = (숫자 합 − 20) × (1 + 예약 수), 예약 포함 ${STAR_CARDS}장 이상이면 별 +20점</p>
    <div class="review">${review(r, nm).map((s) => `<p>${esc(s)}</p>`).join('')}
      ${unfinished.length ? `<p class="note">${unfinished.map((p) => esc(nm[p])).join(', ')}: 시작만 하고 마무리 못 한 코스가 있습니다.</p>` : ''}</div>
    ${hint}
    <div class="actions">
      ${again}
      <button class="btn ghost" data-act="${online ? 'leave' : 'home'}">${online ? '나가기' : '처음으로'}</button>
    </div>
  </section>`;
}

function render() {
  const handScroll = app.querySelector('.hand')?.scrollLeft ?? 0;
  if (screen === 'home') renderHome();
  else if (screen === 'local-setup') renderLocalSetup();
  else if (screen === 'lobby') renderLobby();
  else if (screen === 'wait') renderWait();
  else if (screen === 'over') renderOver();
  else renderPlay();
  const hand = app.querySelector('.hand');
  if (hand && handScroll) hand.scrollLeft = handScroll;
}

// ---------- 카드 이동 연출 ----------
function fly(card, fromRect, targetSelector) {
  if (reduceMotion() || !fromRect) return;
  const to = document.querySelector(targetSelector)?.getBoundingClientRect();
  if (!to) return;
  const el = document.createElement('div');
  el.className = 'fly';
  el.innerHTML = cardHtml(card);
  el.firstElementChild.style.setProperty('--w', `${fromRect.width}px`);
  el.style.left = `${fromRect.left}px`;
  el.style.top = `${fromRect.top}px`;
  document.body.appendChild(el);
  const dx = to.left + to.width / 2 - (fromRect.left + fromRect.width / 2);
  const dy = to.top + to.height / 2 - (fromRect.top + fromRect.height / 2);
  const s = Math.min(1, (to.width * 0.8) / fromRect.width);
  el.animate(
    [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: 0.2 }],
    { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' },
  ).finished.then(() => el.remove(), () => el.remove());
}

function runPendingFly() {
  if (!pendingFly) return;
  const { card, fromRect, type } = pendingFly;
  pendingFly = null;
  fly(card, fromRect, type === 'play' ? `[data-mylane="${card.course}"]` : `[data-pile="${card.course}"]`);
}

// ---------- 한 기기 모드 ----------
function startLocal() {
  mode = 'local';
  game = newGame();
  selected = null;
  cover = true;
  sheet = null;
  screen = 'play';
  render();
  window.scrollTo?.(0, 0);
}

function actLocal(action) {
  const srcEl = action.cardId ? document.querySelector(`[data-card="${action.cardId}"]`) : null;
  const fromRect = srcEl?.getBoundingClientRect();
  const movedCard = action.cardId ? game.hands[game.turn].find((c) => c.id === action.cardId) : null;
  const before = movedCard ? game.lanes[game.turn][movedCard.course].length : 0;

  const r = apply(game, game.turn, action);
  if (!r.ok) { toast(r.error); return; }
  const turnBefore = game.turn;
  game = r.state;
  selected = null;
  sheet = null;
  if (game.over) { screen = 'over'; render(); window.scrollTo?.(0, 0); return; }
  if (game.turn !== turnBefore) cover = true;
  if (action.type === 'play' && movedCard) {
    const after = game.lanes[turnBefore][movedCard.course].length;
    if (before < STAR_CARDS && after >= STAR_CARDS) starPop = movedCard.course;
  }
  render();
  if (movedCard) fly(movedCard, fromRect, action.type === 'play' ? `[data-mylane="${movedCard.course}"]` : `[data-pile="${movedCard.course}"]`);
  if (cover) window.scrollTo?.(0, 0);
}

// ---------- 온라인 모드 ----------
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
const makeToken = () => (crypto.randomUUID ? crypto.randomUUID() : makeCode() + makeCode() + Date.now());

function enterOnline(code, name) {
  mode = 'online';
  const token = store.get(`token:${code}`) || makeToken();
  store.set(`token:${code}`, token);
  store.set('oname', name);
  net = {
    code, name, token, ws: null, seat: null, names: [null, null], view: null, status: 'waiting',
    connected: false, opponentConnected: true, rematch: [false, false], retry: 0, closing: false, timer: null, ping: null,
  };
  try { history.replaceState(null, '', `?room=${code}`); } catch (e) { /* 무시 */ }
  screen = 'wait';
  render();
  openSocket();
}

function openSocket() {
  const base = serverUrl();
  if (!base || !net) return;
  const ws = new WebSocket(`${base}/ws/${net.code}`);
  net.ws = ws;
  ws.onopen = () => {
    net.connected = true;
    net.retry = 0;
    ws.send(JSON.stringify({ t: 'join', name: net.name, token: net.token }));
    clearInterval(net.ping);
    net.ping = setInterval(() => { if (ws.readyState === 1) ws.send('{"t":"ping"}'); }, 25000);
    render();
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch (err) { return; }
    if (m.t === 'state') onState(m);
    else if (m.t === 'error') onServerError(m);
  };
  ws.onclose = () => {
    clearInterval(net?.ping);
    if (!net || net.closing || net.ws !== ws) return;
    net.connected = false;
    render();
    const wait = Math.min(5000, 800 * 2 ** net.retry);
    net.retry += 1;
    net.timer = setTimeout(openSocket, wait);
  };
}

function onState(m) {
  const prev = net.view;
  net.seat = m.seat;
  net.names = m.names.map((n, i) => n || `요리사 ${i + 1}`);
  net.status = m.status;
  net.opponentConnected = m.opponentConnected;
  net.rematch = m.rematch;
  net.view = m.view;
  if (m.status === 'waiting') { screen = 'wait'; render(); return; }
  if (prev && m.view) {
    for (const c of COURSES) {
      if (prev.myLanes[c].length < STAR_CARDS && m.view.myLanes[c].length >= STAR_CARDS) starPop = c;
    }
  }
  const wasPlaying = screen === 'play';
  screen = m.status === 'over' ? 'over' : 'play';
  if (screen === 'play' && !wasPlaying) { selected = null; sheet = null; }
  if (screen === 'over') sheet = null;
  render();
  if (screen === 'play') runPendingFly();
}

function onServerError(m) {
  pendingFly = null;
  if (m.fatal) {
    toast(m.error);
    leaveOnline(false);
    screen = 'lobby';
    render();
    return;
  }
  toast(m.error);
}

function sendOnline(obj) {
  if (!net?.ws || net.ws.readyState !== 1) { toast('연결이 끊겨 있어요. 잠시 기다려 주세요.'); return false; }
  net.ws.send(JSON.stringify(obj));
  return true;
}

function actOnline(action) {
  const srcEl = action.cardId ? document.querySelector(`[data-card="${action.cardId}"]`) : null;
  const card = action.cardId ? net.view.myHand.find((c) => c.id === action.cardId) : null;
  if (!sendOnline({ t: 'act', action })) return;
  pendingFly = card ? { card, fromRect: srcEl?.getBoundingClientRect(), type: action.type } : null;
  selected = null;
  sheet = null;
}

function leaveOnline(rerender = true) {
  if (net) {
    net.closing = true;
    clearTimeout(net.timer);
    clearInterval(net.ping);
    try { net.ws?.close(); } catch (e) { /* 이미 닫힘 */ }
  }
  net = null;
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* 무시 */ }
  if (rerender) { screen = 'home'; render(); }
}

function act(action) {
  if (mode === 'online') actOnline(action); else actLocal(action);
}

// ---------- 입력 처리 ----------
app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act],[data-card],[data-lane],[data-drop],[data-draw],[data-detail]');
  if (!t || t.disabled) return;
  const d = t.dataset;
  switch (d.act) {
    case 'home': screen = 'home'; render(); return;
    case 'go-local': screen = 'local-setup'; render(); return;
    case 'go-online': net = null; screen = 'lobby'; render(); return;
    case 'start-local': {
      names = [document.getElementById('n0').value.trim() || '요리사 1', document.getElementById('n1').value.trim() || '요리사 2'];
      store.set('names', JSON.stringify(names));
      startLocal();
      return;
    }
    case 'create-room': {
      const name = document.getElementById('oname').value.trim() || '요리사';
      enterOnline(makeCode(), name);
      return;
    }
    case 'join-room': {
      const name = document.getElementById('oname').value.trim() || '요리사';
      const code = document.getElementById('ocode').value.trim().toUpperCase();
      if (!/^[A-Z2-9]{4,6}$/.test(code)) { toast('방 코드를 확인해 주세요 (4~6자)'); return; }
      enterOnline(code, name);
      return;
    }
    case 'copy-link': {
      const link = d.link;
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(() => toast('초대 링크를 복사했어요'), () => toast(link));
      else toast(link);
      return;
    }
    case 'leave': leaveOnline(); return;
    case 'reveal': cover = false; render(); return;
    case 'again':
      if (mode === 'online') sendOnline({ t: 'rematch' }); else startLocal();
      return;
    case 'score': sheet = { type: 'score' }; render(); return;
    case 'close': sheet = null; render(); return;
    default:
  }
  if (d.detail) {
    const [pl, course] = d.detail.split(':');
    sheet = { type: 'lane', player: Number(pl), course };
    render();
  } else if (d.card) { selected = selected === d.card ? null : d.card; render(); }
  else if (d.lane) act({ type: 'play', cardId: selected });
  else if (d.drop) act({ type: 'discard', cardId: selected });
  else if (d.draw) act({ type: 'draw', from: d.draw });
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheet) { sheet = null; render(); }
});

// 테스트와 디버깅용
window.__hansang = {
  get game() { return game; },
  get net() { return net; },
  get view() { return mode === 'online' ? net?.view : null; },
  get myTurn() { return mode === 'online' && !!net?.view && net.view.turn === net.seat && !net.view.over; },
};

// 초대 링크(?room=CODE)로 들어오면 방 입장 화면으로
(function boot() {
  const code = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  if (/^[A-Z2-9]{4,6}$/.test(code) && serverUrl()) {
    mode = 'online';
    const savedToken = store.get(`token:${code}`);
    const savedName = store.get('oname');
    if (savedToken && savedName) { enterOnline(code, savedName); return; } // 새로고침하면 같은 자리로 복귀
    net = { prefillCode: code };
    screen = 'lobby';
  }
  render();
})();
