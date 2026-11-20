// 차려내라! 한 상: 밤 분위기, 가로형. 한 기기에서 번갈아 두기 + 온라인 2인
import {
  COURSES, apply, newGame, viewFor, canPlayOnLane, laneDetail, STAR_CARDS, BASE_COST,
} from './engine/rules.js';
import { THEME, cardTitle, iconSvg, courseIcon } from './cards-data.js';
import { nightScene } from './scene.js';
import { serverUrl } from './config.js';

const PREFIX = 'hansang:';
const store = {
  get(k) { try { return localStorage.getItem(PREFIX + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(PREFIX + k, v); } catch (e) { /* 저장 실패는 무시 */ } },
};

const app = document.getElementById('app');
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const minus = (n) => (n < 0 ? `−${-n}` : String(n));
const signed = (n) => (n > 0 ? `+${n}` : minus(n));

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
let cover = false; // 한 기기 모드의 차례 넘김 가림 화면
let sheet = null; // null | {type:'lane', player, course} | {type:'score'} | {type:'rules'}
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

// ---------- 카드와 코스 그리기 ----------
function cardHtml(card, { tag = 'div', extra = '', sel = false } = {}) {
  const t = THEME[card.course];
  const rsv = card.step === 0;
  const label = rsv ? `${t.name} 예약 손님` : `${t.name} ${card.step} ${cardTitle(card)}`;
  return `<${tag} class="card${rsv ? ' rsv' : ''}${sel ? ' sel' : ''}" style="--bg:${rsv ? '#F1EDE6' : t.color};--ink:${rsv ? '#1a1a1a' : t.ink}" aria-label="${label}" ${extra}>
    <div class="ct">${cardTitle(card)}</div>
    <div class="ci">${iconSvg(card)}</div>
    <div class="cn"><span>${rsv ? '×2' : card.step}</span></div>
  </${tag}>`;
}

function laneSummary(lane) {
  const d = laneDetail(lane);
  const steps = lane.filter((c) => c.step > 0);
  return { d, big: steps.length ? steps[steps.length - 1].step : '', mul: d.reservations ? `×${1 + d.reservations}` : '' };
}

function laneHtml(lanes, course, { target, player }) {
  const t = THEME[course];
  const { d, big, mul } = laneSummary(lanes[course]);
  const cls = ['lane'];
  if (!d.started) cls.push('empty');
  cls.push(target ? 'target' : 'dim');
  const star = d.star ? `<span class="star${starPop === course ? ' pop' : ''}" aria-label="별">★</span>` : '';
  const inner = `${target ? '<span class="tag">↑</span>' : ''}${star}
    <div class="ic">${courseIcon(course)}</div>
    <span class="big">${big}</span>
    <span class="mul">${mul}</span>
    <span class="pt${d.score > 0 ? ' pos' : d.score < 0 ? ' neg' : ''}">${d.started ? signed(d.score) : '0'}</span>`;
  const attrs = `data-mylane="${course}" style="--c:${t.color};--k:${t.ink}"`;
  if (target) return `<button class="${cls.join(' ')}" ${attrs} data-lane="${course}" aria-label="${t.name} 줄에 올리기">${inner}</button>`;
  return `<button class="${cls.join(' ')}" ${attrs} data-detail="${player}:${course}" ${d.started ? '' : 'disabled'} aria-label="${t.name} 낸 카드 보기">${inner}</button>`;
}

function oppChipHtml(ctx, course) {
  const t = THEME[course];
  const oppIdx = 1 - ctx.me;
  const { d, big, mul } = laneSummary(ctx.v.opponentLanes[course]);
  return `<button class="chip${d.started ? '' : ' empty'}" style="--c:${t.color};--k:${t.ink}" data-detail="${oppIdx}:${course}" ${d.started ? '' : 'disabled'} aria-label="${esc(ctx.nm[oppIdx])} ${t.name} 줄 보기">
    <span class="n">${d.started ? (big || '–') : '–'}</span>
    <span class="m">${d.started ? signed(d.score) : ''}</span>
    ${mul ? `<span class="x">${mul}</span>` : ''}
  </button>`;
}

// ---------- 맥락: 한 기기 / 온라인 ----------
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
  <div class="backdrop" data-act="close"></div>
  <div class="panel rules" role="dialog" aria-label="규칙">
    <button class="x" data-act="close" aria-label="닫기">✕</button>
    <h3>규칙</h3>
    <ul>
      <li>내 차례에 카드 한 장을 코스에 올리거나 좌판에 내려놓고, 창고나 좌판에서 한 장 가져와요.</li>
      <li>코스에는 숫자가 커지는 순서로만 올릴 수 있어요.</li>
      <li>예약 손님(×2)은 숫자 카드보다 먼저 내요. 한 명 늘 때마다 배수가 1씩 올라요.</li>
      <li>코스 점수 = (숫자 합 − 20) × 배수. 시작하지 않은 코스는 0점이에요.</li>
      <li>코스에 카드 8장 이상이면 별 +20점.</li>
      <li>방금 내려놓은 카드는 같은 차례에 다시 못 가져와요.</li>
      <li>창고의 마지막 카드를 가져오면 마감, 한 판이 끝나요.</li>
    </ul>
    <button class="btn ghost" data-act="close">닫기</button>
  </div>`;

function homeHtml() {
  const online = !!serverUrl();
  return `<div class="screen">${nightScene()}
    <button class="help" data-act="rules" aria-label="규칙 보기">?</button>
    <div class="side">
      <h1 class="logo">차려내라!<br>한 상</h1>
      <p class="sub">마감 전에 한 상</p>
      <div class="menu">
        <button class="btn" data-act="go-online" ${online ? '' : 'disabled'}>온라인으로</button>
        <button class="btn ghost" data-act="go-local">한 기기에서</button>
      </div>
      ${online ? '' : '<p class="note">온라인 서버가 아직 설정되지 않았어요</p>'}
    </div>
  </div>`;
}

function localSetupHtml() {
  return `<div class="screen">${nightScene()}
    <button class="back" data-act="home" aria-label="처음으로">←</button>
    <div class="side">
      <div class="form">
        <input id="n0" class="field" maxlength="10" value="${esc(names[0])}" placeholder="먼저 시작하는 사람" aria-label="첫 번째 요리사 이름" autocomplete="off">
        <input id="n1" class="field" maxlength="10" value="${esc(names[1])}" placeholder="다음 사람" aria-label="두 번째 요리사 이름" autocomplete="off">
        <button class="btn" data-act="start-local">시작</button>
      </div>
    </div>
  </div>`;
}

function lobbyHtml() {
  const code = net?.prefillCode || '';
  return `<div class="screen">${nightScene()}
    <button class="back" data-act="home" aria-label="처음으로">←</button>
    <div class="side">
      <div class="form">
        <input id="oname" class="field" maxlength="10" value="${esc(store.get('oname') || '')}" placeholder="내 이름" aria-label="내 이름" autocomplete="off">
        <button class="btn" data-act="create-room">방 만들기</button>
        <span class="or">또는</span>
        <input id="ocode" class="field" maxlength="6" value="${esc(code)}" placeholder="방 코드" aria-label="방 코드" autocomplete="off" style="text-transform:uppercase">
        <button class="btn ghost" data-act="join-room">들어가기</button>
      </div>
    </div>
  </div>`;
}

function waitHtml() {
  const link = `${location.origin}${location.pathname}?room=${net.code}`;
  return `<div class="screen">${nightScene()}
    <div class="side">
      <p class="sub" style="margin:0">친구에게 코드를 알려 주세요</p>
      <div class="code">${esc(net.code)}</div>
      <div class="menu">
        <button class="btn" data-act="copy-link" data-link="${esc(link)}">초대 링크 복사</button>
        <button class="btn ghost" data-act="leave">나가기</button>
      </div>
      ${net.connected ? '' : '<p class="note">연결이 끊겼어요. 다시 연결하는 중…</p>'}
    </div>
  </div>`;
}

function coverHtml(ctx) {
  const { me, nm } = ctx;
  return `<div class="screen cover" style="z-index:30">
    <div class="side">
      <h1 class="logo" style="font-size:calc(var(--u) * 40)">${esc(nm[me])}님 차례</h1>
      <p class="sub">${esc(nm[1 - me])}님은 화면을 보지 마세요</p>
      <div class="menu"><button class="btn" data-act="reveal">내 패 보기</button></div>
    </div>
  </div>`;
}

function sheetHtml(ctx) {
  if (!sheet) return '';
  if (sheet.type === 'rules') return RULES;
  const { v, me, nm } = ctx;
  if (sheet.type === 'score') {
    return `<div class="backdrop" data-act="close"></div>
    <div class="panel" role="dialog" aria-label="점수">
      <button class="x" data-act="close" aria-label="닫기">✕</button>
      <div class="scoresheet">
        <div>${esc(nm[0])}<b>${minus(v.scores[0])}</b></div>
        <div>${esc(nm[1])}<b>${minus(v.scores[1])}</b></div>
      </div>
    </div>`;
  }
  const { player, course } = sheet;
  const lane = (player === me ? v.myLanes : v.opponentLanes)[course];
  const t = THEME[course];
  const d = laneDetail(lane);
  const rows = lane.map((c) => (c.step === 0
    ? `<div class="row"><span class="no" style="--c:#F1EDE6;--k:#1a1a1a">×2</span></div>`
    : `<div class="row"><span class="no" style="--c:${t.color};--k:${t.ink}">${c.step}</span>${cardTitle(c)}</div>`)).join('');
  const formula = `(${d.sum} − ${BASE_COST}) × ${1 + d.reservations}${d.star ? ' + 20' : ''}`;
  return `<div class="backdrop" data-act="close"></div>
  <div class="panel" role="dialog" aria-label="${t.name} 줄">
    <button class="x" data-act="close" aria-label="닫기">✕</button>
    <div class="detail">
      <div class="list">
        <div class="who"><span class="ib" style="--c:${t.color}">${courseIcon(course)}</span>${esc(nm[player])}</div>
        ${rows}
      </div>
      <div class="total"><div class="v${d.score > 0 ? ' pos' : ''}">${minus(d.score)}</div><div class="f">${formula}</div></div>
    </div>
  </div>`;
}

function playHtml() {
  const ctx = getCtx();
  const { v, me, nm, myTurn, online } = ctx;
  const opp = 1 - me;
  const selCard = selected ? v.myHand.find((c) => c.id === selected) : null;
  if (selected && (!selCard || !myTurn)) selected = null;

  const playing = myTurn && v.phase === 'play';
  const drawing = myTurn && v.phase === 'draw';
  const aim = (playing && !!selCard) || drawing;
  const urgent = v.deckCount <= 10;
  const deckTarget = drawing && v.deckCount > 0;

  const cols = COURSES.map((course) => {
    const pile = v.market[course];
    const top = pile[pile.length - 1];
    const t = THEME[course];
    const canDraw = drawing && top && top.id !== v.justDiscarded;
    const canDrop = playing && selCard && selCard.course === course;
    const body = top ? cardHtml(top) : `<div class="none" style="--c:${t.color}"></div>`;
    const base = `data-pile="${course}"`;
    let pileHtml;
    if (canDraw) pileHtml = `<button class="pile target" ${base} data-draw="${course}" aria-label="${t.name} 좌판에서 가져오기"><span class="tag">+</span>${body}</button>`;
    else if (canDrop) pileHtml = `<button class="pile target" ${base} data-drop="${course}" aria-label="${t.name} 좌판에 내려놓기"><span class="tag">↓</span>${body}</button>`;
    else pileHtml = `<div class="pile ${aim ? 'dim' : ''}" ${base}>${body}</div>`;
    const laneTarget = playing && selCard && selCard.course === course && canPlayOnLane(v.myLanes[course], selCard);
    return `<div class="col">${oppChipHtml(ctx, course)}${pileHtml}${laneHtml(v.myLanes, course, { target: laneTarget, player: me })}</div>`;
  }).join('');

  const hand = v.myHand.slice().sort((a, b) => COURSES.indexOf(a.course) - COURSES.indexOf(b.course) || a.step - b.step)
    .map((card) => cardHtml(card, {
      tag: 'button',
      extra: `data-card="${card.id}" aria-pressed="${card.id === selected}" ${playing ? '' : 'disabled'}`,
      sel: card.id === selected,
    })).join('');

  const turnText = online ? (myTurn ? '내 차례' : esc(nm[opp])) : `${esc(nm[me])} 차례`;
  const banner = online && !net.connected
    ? '<div class="banner bad">연결이 끊겼어요. 다시 연결하는 중…</div>'
    : online && !net.opponentConnected
      ? `<div class="banner">${esc(nm[opp])} 연결 끊김</div>`
      : '';

  const deck = deckTarget
    ? `<button class="deck deckbtn target${urgent ? ' urgent' : ''}" data-draw="deck" aria-label="식재료 창고에서 가져오기"><span class="tag">+</span>${v.deckCount}</button>`
    : `<div class="deck deckbtn${urgent ? ' urgent' : ''}" aria-label="마감까지 ${v.deckCount}장">${v.deckCount}</div>`;

  const html = `<div class="board${aim ? ' aim' : ''}">${banner}
    <aside class="rail">
      ${deck}
      <div class="pips"><i class="pip${myTurn ? ' on' : ''}"></i><i class="pip${drawing ? ' go' : ''}"></i></div>
      <div class="turn">${turnText}</div>
      <div class="grow"></div>
      <button class="scores" data-act="score" aria-label="점수 보기">
        <div class="sc me"><span>${esc(nm[me])}</span><span>${minus(v.scores[me])}</span></div>
        <div class="sc"><span>${esc(nm[opp])}</span><span>${minus(v.scores[opp])}</span></div>
      </button>
      <button class="rhelp" data-act="rules" aria-label="규칙 보기">?</button>
    </aside>
    <main class="main">
      <div class="cols">${cols}</div>
      <div class="hand">${hand}</div>
    </main>
  </div>${sheetHtml(ctx)}${!online && cover ? coverHtml(ctx) : ''}`;
  starPop = null;
  return html;
}

function review(result, nm) {
  const w = result.winner;
  if (w === null) return '점수가 똑같아요. 심사위원이 한 입씩 더 먹어 보기로 했어요.';
  return Math.abs(result.scores[0] - result.scores[1]) >= 30
    ? '오늘 밤 심사위원은 이 주방의 이름을 기억할 거예요.'
    : '한 접시 차이로 별이 갈렸어요.';
}

function overHtml() {
  const ctx = getCtx();
  const { v, nm, me, online } = ctx;
  const r = v.result;
  const w = r.winner;
  const rows = COURSES.map((c) => {
    const a = r.lanes[0][c].started ? r.lanes[0][c].score : 0;
    const b = r.lanes[1][c].started ? r.lanes[1][c].score : 0;
    return `<div class="tr" style="--c:${THEME[c].color}"><i></i><span class="${a >= b ? 'hi' : 'lo'}">${minus(a)}</span><span class="${b >= a ? 'hi' : 'lo'}">${minus(b)}</span></div>`;
  }).join('');
  const headline = w === null ? '무승부' : online ? (w === me ? '내가 이겼어요!' : `${esc(nm[w])}님 승리`) : `${esc(nm[w])}님 승리`;

  let again = '<button class="btn" data-act="again">한 판 더</button>';
  let hint = '';
  if (online) {
    const mine = net.rematch[me];
    again = `<button class="btn" data-act="again" ${mine ? 'disabled' : ''}>${mine ? '기다리는 중…' : '한 판 더'}</button>`;
    if (net.rematch[1 - me] && !mine) hint = `<p class="note">${esc(nm[1 - me])}님이 한 판 더를 원해요</p>`;
  }
  const banner = online && !net.connected ? '<div class="banner bad">연결이 끊겼어요. 다시 연결하는 중…</div>' : '';

  return `<div class="screen result">${nightScene()}${banner}
    <div class="side">
      <h2>${headline}</h2>
      <p class="sub">${review(r, nm)}</p>
      <div class="tot">
        <div class="${w === 0 ? 'win' : ''}"><span>${esc(nm[0])}</span><b>${minus(r.scores[0])}</b></div>
        <div class="${w === 1 ? 'win' : ''}"><span>${esc(nm[1])}</span><b>${minus(r.scores[1])}</b></div>
      </div>
      ${hint}
      <div class="acts">${again}<button class="btn ghost" data-act="${online ? 'leave' : 'home'}">${online ? '나가기' : '처음으로'}</button></div>
    </div>
    <div class="rtable">
      <div class="th"><span></span><span>${esc(nm[0])}</span><span>${esc(nm[1])}</span></div>
      ${rows}
    </div>
  </div>`;
}

function render() {
  let html;
  if (screen === 'home') html = homeHtml();
  else if (screen === 'local-setup') html = localSetupHtml();
  else if (screen === 'lobby') html = lobbyHtml();
  else if (screen === 'wait') html = waitHtml();
  else if (screen === 'over') html = overHtml();
  else html = playHtml();
  // 규칙 창은 어느 화면에서나 열 수 있다 (대결 화면은 playHtml 안에서 처리)
  if (screen !== 'play' && sheet?.type === 'rules') html += RULES;
  app.innerHTML = html;
}

// ---------- 카드 이동 연출 ----------
function fly(card, fromRect, targetSelector) {
  if (reduceMotion() || !fromRect) return;
  const to = document.querySelector(targetSelector)?.getBoundingClientRect();
  if (!to) return;
  const el = document.createElement('div');
  el.className = 'fly';
  el.innerHTML = cardHtml(card);
  el.firstElementChild.style.setProperty('--cw', `${fromRect.width}px`);
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
  if (game.over) { screen = 'over'; render(); return; }
  if (game.turn !== turnBefore) cover = true;
  if (action.type === 'play' && movedCard) {
    const after = game.lanes[turnBefore][movedCard.course].length;
    if (before < STAR_CARDS && after >= STAR_CARDS) starPop = movedCard.course;
  }
  render();
  if (movedCard) fly(movedCard, fromRect, action.type === 'play' ? `[data-mylane="${movedCard.course}"]` : `[data-pile="${movedCard.course}"]`);
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
    case 'home': screen = 'home'; sheet = null; render(); return;
    case 'go-local': screen = 'local-setup'; render(); return;
    case 'go-online': net = null; screen = 'lobby'; render(); return;
    case 'start-local': {
      names = [document.getElementById('n0').value.trim() || '요리사 1', document.getElementById('n1').value.trim() || '요리사 2'];
      store.set('names', JSON.stringify(names));
      startLocal();
      return;
    }
    case 'create-room': enterOnline(makeCode(), document.getElementById('oname').value.trim() || '요리사'); return;
    case 'join-room': {
      const name = document.getElementById('oname').value.trim() || '요리사';
      const code = document.getElementById('ocode').value.trim().toUpperCase();
      if (!/^[A-Z2-9]{4,6}$/.test(code)) { toast('방 코드를 확인해 주세요'); return; }
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
    case 'rules': sheet = { type: 'rules' }; render(); return;
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
