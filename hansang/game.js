// 차려내라! 한 상: 밤 분위기, 가로형. 한 기기에서 번갈아 두기 + 온라인 2인
import {
  COURSES, apply, newGame, viewFor, canPlayOnLane, laneDetail, STAR_CARDS, timeoutPlan,
} from './engine/rules.js';
import { THEME, cardTitle, iconSvg, courseIcon, taskUi } from './cards-data.js';
import { nightScene } from './scene.js';
import { serverUrl } from './config.js';
import { makeTutorialGame, OPP_SCRIPTS, TUT_STEPS } from './tutorial.js';

const PREFIX = 'hansang:';
const store = {
  get(k) { try { return localStorage.getItem(PREFIX + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(PREFIX + k, v); } catch (e) { /* 저장 실패는 무시 */ } },
  del(k) { try { localStorage.removeItem(PREFIX + k); } catch (e) { /* 무시 */ } },
};

const app = document.getElementById('app');
const stage = document.getElementById('stage');
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// 세로로 든 폰에서는 화면 전체를 눕혀서 보여 준다(style.css). 이때는 화면 좌표 계산이 필요한 연출을 건너뛴다.
const rotatedStage = () => window.matchMedia?.('(orientation: portrait) and (max-width: 1000px)').matches;
const minus = (n) => (n < 0 ? `−${-n}` : String(n));
// 점수는 직접 계산한다. 화면에는 카드 장수만 칸으로 보여 준다(예약 손님은 속이 빈 칸).
const pips = (lane) => lane.map((c) => `<i${c.step === 0 ? ' class="r"' : ''}></i>`).join('');
// 옛 서버(코스 수, 과제가 없는 상태)와도 깨지지 않게 기본값을 채운다
const norm = (v) => ({ ...v, courses: v.courses ?? COURSES, bonus: v.bonus ?? [], bonusPoints: v.bonusPoints ?? [0, 0] });

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
let sheet = null; // null | {type:'lane', player, course} | {type:'tasks'} | {type:'rules'}
let starPop = null;
let pendingFly = null;
let toastTimer = null;
let courseCount = Number(store.get('courses')) === 6 ? 6 : 5; // 코스 수 (5 또는 6)
let intro = null; // 판 시작 때 과제 소개 { ids, leaving }
let introTimer = null;
let introThenCover = false; // 한 기기 모드: 과제 소개가 끝나면 첫 번째 플레이어 가림 화면
const TURN_CHOICES = [0, 20, 30, 45, 60]; // 턴 제한(초), 0은 없음
let turnSec = TURN_CHOICES.includes(Number(store.get('turnsec') ?? 30)) ? Number(store.get('turnsec') ?? 30) : 30;
let localDeadline = null; // 한 기기 모드: 이번 차례 마감 시각(ms)
let tut = null; // 연습 중이면 { game, step, ret, busy, note, friend, ext }
let askTut = false; // 처음 방문: 연습할지 한 번 묻는다
const draft = {}; // 입력 중인 값(화면이 다시 그려져도 유지)
let seenClaims = {}; // 이미 알린 과제 달성

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  stage.appendChild(el);
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
    <span class="cnt">${pips(lanes[course])}</span>`;
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
    <span class="cnt">${pips(ctx.v.opponentLanes[course])}</span>
    ${mul ? `<span class="x">${mul}</span>` : ''}
  </button>`;
}

// ---------- 맥락: 한 기기 / 온라인 ----------
function getCtx() {
  if (tut) {
    const g = tut.game;
    return { v: norm(viewFor(g, 0)), me: 0, nm: ['나', '상대'], myTurn: g.turn === 0 && !tut.busy && !g.over, online: false };
  }
  if (mode === 'local') {
    const me = game.turn;
    return { v: norm(viewFor(game, me)), me, nm: names, myTurn: true, online: false };
  }
  const v = norm(net.view);
  return { v, me: net.seat, nm: net.names, myTurn: v.turn === net.seat && !v.over, online: true };
}

// ---------- 화면들 ----------
const rulesHtml = () => `
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
      <li>5코스는 기본 규칙이에요. 6코스(확장)에는 면 코스와 심사위원 과제가 더해져요.</li>
      <li>6코스에서는 판마다 심사위원 과제 5장이 공개돼요. 채우면 +10점. 먼저 채우는 과제는 먼저 한 사람이, 마감 때 비교하는 과제는 가장 앞선 사람이 받고, 동점이면 아무도 못 받아요.</li>
      <li>방금 내려놓은 카드는 같은 차례에 다시 못 가져와요.</li>
      <li>창고의 마지막 카드를 가져오면 마감, 한 판이 끝나요.</li>
    </ul>
    ${!tut && screen !== 'play' ? '<button class="btn ghost" data-act="tut-start">연습해 보기</button>' : ''}
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
        <button class="link" data-act="tut-start">처음이세요? 연습하기</button>
      </div>
      ${online ? '' : '<p class="note">온라인 서버가 아직 설정되지 않았어요</p>'}
    </div>
  </div>`;
}

const courseNote = () => `<p class="cnote">${courseCount === 6
  ? '면, 심사위원 과제 추가 · 카드 72장'
  : '기본 규칙 · 카드 60장'}</p>`;

function introHtml() {
  const ctx = getCtx();
  const tilt = [-2.5, 1.5, -1, 2.5, -2];
  const cards = ctx.v.bonus.map((b, i) => {
    const ui = taskUi(b.id);
    return `<div class="icard" style="--r:${tilt[i % tilt.length]}deg;--d:${(0.2 + i * 0.13).toFixed(2)}s"><div class="paper"><span class="pin"></span><span class="ichip">${ui.chip}</span><span class="itext">${esc(ui.text)}</span><span class="stamp">+10</span></div></div>`;
  }).join('');
  return `<div class="intro" data-act="intro-go" role="dialog" aria-label="이번 판 심사위원 과제">
    <div class="ibg"></div>
    <div class="itop"><span class="itt">이번 판 심사위원 과제</span><span class="its">채우면 한 장당 +10점</span></div>
    <div class="icards">${cards}</div>
    <button class="btn igo" data-act="intro-go">시작</button>
  </div>`;
}

// 판이 막 시작했는지(새로고침으로 중간에 들어온 경우와 구분)
function isFresh(v) {
  const courses = v.courses ?? COURSES;
  const full = courses.length === 6 ? 56 : 44;
  const empty = (lanes) => courses.every((c) => lanes[c].length === 0);
  return v.deckCount === full && empty(v.myLanes) && empty(v.opponentLanes) && courses.every((c) => v.market[c].length === 0);
}

function finishIntro() {
  intro = null;
  if (introThenCover) { introThenCover = false; cover = true; }
  render();
}

function startIntro() {
  const v = getCtx().v;
  if (!v.bonus.length) return;
  intro = { leaving: false };
  clearTimeout(introTimer);
  introTimer = setTimeout(dismissIntro, 6500);
}

// 소개 카드 5장이 왼쪽 레일의 칩 자리로 날아 들어간다
function dismissIntro() {
  if (!intro || intro.leaving) return;
  clearTimeout(introTimer);
  const el = document.querySelector('.intro');
  const chips = [...document.querySelectorAll('.rail .tchip')];
  const cards = el ? [...el.querySelectorAll('.icard')] : [];
  if (!el || reduceMotion() || rotatedStage() || cards.length !== chips.length) { finishIntro(); return; }
  intro.leaving = true;
  const done = cards.map((c, i) => {
    const from = c.getBoundingClientRect();
    const to = chips[i].getBoundingClientRect();
    const start = getComputedStyle(c).transform;
    c.style.animation = 'none';
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    c.querySelector('.itext')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' });
    return c.animate(
      [{ transform: start }, { transform: `translate(${dx}px,${dy}px) scale(${to.width / from.width},${to.height / from.height})` }],
      { duration: 640, delay: i * 70, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
    ).finished;
  });
  el.querySelector('.ibg')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 480, delay: 260, fill: 'forwards' });
  el.querySelectorAll('.itop,.igo').forEach((n) => n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }));
  Promise.allSettled(done).then(finishIntro);
}

const courseToggle = () => `<div class="seg" role="group" aria-label="코스 수">
  <button class="${courseCount === 5 ? 'on' : ''}" data-act="set-courses" data-n="5" aria-pressed="${courseCount === 5}">5코스 · 기본</button>
  <button class="${courseCount === 6 ? 'on' : ''}" data-act="set-courses" data-n="6" aria-pressed="${courseCount === 6}">6코스 · 확장</button>
</div>`;

const turnToggle = () => `<span class="tlabel">턴 시간</span><div class="seg turn" role="group" aria-label="턴 시간">
  ${TURN_CHOICES.map((n) => `<button class="${turnSec === n ? 'on' : ''}" data-act="set-turn" data-n="${n}" aria-pressed="${turnSec === n}">${n ? `${n}초` : '없음'}</button>`).join('')}
</div>`;

// 남은 시간 표시. 숫자와 막대는 tick()이 1초에 몇 번씩 고쳐 쓴다.
function clockInfo() {
  if (tut || screen !== 'play') return null;
  if (mode === 'online') {
    if (!net?.deadline || net.view?.over) return null;
    return { left: (net.deadline - (Date.now() + (net.offset || 0))) / 1000, total: net.turnSeconds };
  }
  if (!localDeadline || !game || game.over) return null;
  return { left: (localDeadline - Date.now()) / 1000, total: turnSec };
}
const clockHtml = () => {
  const c = clockInfo();
  if (!c) return '<div class="clock off"><i></i><b></b></div>';
  const left = Math.max(0, Math.ceil(c.left));
  return `<div class="clock${left <= 10 ? ' low' : ''}" aria-label="남은 시간 ${left}초"><i style="transform:scaleX(${Math.max(0, Math.min(1, c.left / c.total))})"></i><b>${left}</b></div>`;
};
function tick() {
  if (tut) return;
  if (mode === 'local' && screen === 'play' && game && !game.over && turnSec > 0) {
    if (cover || intro) localDeadline = null; // 가림 화면, 소개 중에는 시간이 흐르지 않는다
    else if (localDeadline === null) localDeadline = Date.now() + turnSec * 1000;
    else if (Date.now() >= localDeadline) {
      localDeadline = null;
      toast('시간이 다 돼서 자동으로 냈어요');
      for (const a of timeoutPlan(game, game.turn)) { if (game.over) break; actLocal(a); }
      return;
    }
  }
  const el = document.querySelector('.clock');
  const c = clockInfo();
  if (!el) return;
  if (!c) { if (!el.classList.contains('off')) el.outerHTML = clockHtml(); return; }
  if (el.classList.contains('off')) { el.outerHTML = clockHtml(); return; }
  const left = Math.max(0, Math.ceil(c.left));
  el.classList.toggle('low', left <= 10);
  el.querySelector('b').textContent = left;
  el.querySelector('i').style.transform = `scaleX(${Math.max(0, Math.min(1, c.left / c.total))})`;
}
setInterval(tick, 250);

function taskChipsHtml(ctx) {
  const { v, me } = ctx;
  return v.bonus.map((b) => {
    const ui = taskUi(b.id);
    const cls = b.claimedBy === null ? '' : b.claimedBy === me ? ' me' : ' opp';
    return `<button class="tchip${cls}${intro ? ' hide' : ''}" data-act="tasks" aria-label="${esc(ui.text)}">${ui.chip}</button>`;
  }).join('');
}

function tasksSheetHtml(ctx) {
  const { v, me, nm } = ctx;
  const rows = v.bonus.map((b) => {
    const ui = taskUi(b.id);
    const cls = b.claimedBy === null ? '' : b.claimedBy === me ? ' me' : ' opp';
    const mine = b.progress[me];
    const theirs = b.progress[1 - me];
    const sumTask = b.id === 'lowhand' && !v.over; // 손패 숫자 합은 판 중에는 숨기고, 끝나면 공개
    const fmt = (n) => (sumTask ? '' : b.id === 'bestplain' && n === null ? '-' : n === null || n === undefined ? '?' : String(b.kind === 'first' ? Math.min(n, b.target) : n));
    const prog = b.kind === 'first'
      ? `<span class="pg">${fmt(mine)}/${b.target}</span><span class="pg dim">${fmt(theirs)}/${b.target}</span>`
      : `<span class="pg">${fmt(mine)}</span><span class="pg dim">${fmt(theirs)}</span>`;
    const owner = b.claimedBy === null ? '<span class="own"></span>' : `<span class="own${b.claimedBy === me ? ' me' : ''}">✓ ${esc(nm[b.claimedBy])}</span>`;
    return `<div class="trow${sheet?.focus === b.id ? ' focus' : ''}"><span class="tchip static${cls}">${ui.chip}</span><span class="ttext">${esc(ui.text)}</span>${prog}${owner}</div>`;
  }).join('');
  return `<div class="backdrop" data-act="close"></div>
  <div class="panel tasks" role="dialog" aria-label="심사위원 과제">
    <button class="x" data-act="close" aria-label="닫기">✕</button>
    <div class="thead"><span class="tt">심사위원 과제 +10</span><span class="pg">${esc(nm[me])}</span><span class="pg dim">${esc(nm[1 - me])}</span><span class="own"></span></div>
    ${rows}
    <p class="note" style="margin-top:calc(var(--u) * 10)">마감 때 비교하는 과제는 동점이면 아무도 받지 못해요</p>
  </div>`;
}

// 과제를 누가 처음 채웠는지 알려 준다
function notifyBonus(v, me, nm, online) {
  if (!v.bonus) return;
  for (const b of v.bonus) {
    const prev = seenClaims[b.id] ?? null;
    if (prev === null && b.claimedBy !== null && !v.over) {
      toast(online && b.claimedBy === me ? '과제 달성! +10' : `${nm[b.claimedBy]} 과제 달성 +10`);
    }
    seenClaims[b.id] = b.claimedBy;
  }
}

function localSetupHtml() {
  return `<div class="screen">${nightScene()}
    <button class="back" data-act="home" aria-label="처음으로">←</button>
    <div class="side">
      <div class="form">
        <input id="n0" class="field" maxlength="10" value="${esc(draft.n0 ?? names[0])}" placeholder="먼저 시작하는 사람" aria-label="첫 번째 요리사 이름" autocomplete="off">
        <input id="n1" class="field" maxlength="10" value="${esc(draft.n1 ?? names[1])}" placeholder="다음 사람" aria-label="두 번째 요리사 이름" autocomplete="off">
        ${courseToggle()}${turnToggle()}${courseNote()}
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
        <input id="oname" class="field" maxlength="10" value="${esc(draft.oname ?? (store.get('oname') || ''))}" placeholder="내 이름" aria-label="내 이름" autocomplete="off">
        ${courseToggle()}${turnToggle()}${courseNote()}
        <button class="btn" data-act="create-room">방 만들기</button>
        <span class="or">또는</span>
        <input id="ocode" class="field" maxlength="6" value="${esc(draft.ocode ?? code)}" placeholder="방 코드" aria-label="방 코드" autocomplete="off" style="text-transform:uppercase">
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
      <p class="note" style="margin:0 0 calc(var(--u) * 14)">${net.courses ?? courseCount}코스 · ${(net.turnSeconds ?? turnSec) ? `턴 ${net.turnSeconds ?? turnSec}초` : '시간 제한 없음'}</p>
      <div class="menu">
        <button class="btn" data-act="copy-link" data-link="${esc(link)}">초대 링크 복사</button>
        <button class="btn ghost" data-act="tut-start">기다리는 동안 연습하기</button>
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

// 게임 끝내기 확인 창: 끝내면 내가 지고 상대가 이긴 것으로 기록된다
function endSheetHtml() {
  return `<div class="backdrop" data-act="close"></div>
  <div class="panel ask" role="dialog" aria-label="게임 끝내기">
    <h3>게임을 끝낼까요?</h3>
    <p class="note" style="margin:0 0 calc(var(--u) * 16)">끝내면 패배로 기록되고 상대가 이긴 것으로 처리돼요. 끝내지 않고 나갔다면 같은 링크로 다시 들어올 수 있어요.</p>
    <button class="btn" data-act="end-yes">게임 끝내기</button>
    <button class="btn ghost" style="margin-top:calc(var(--u) * 10)" data-act="close">계속하기</button>
  </div>`;
}

function sheetHtml(ctx) {
  if (!sheet) return '';
  if (sheet.type === 'rules') return rulesHtml();
  if (sheet.type === 'tasks') return tasksSheetHtml(ctx);
  if (sheet.type === 'end') return endSheetHtml();
  const { v, me, nm } = ctx;
  const { player, course } = sheet;
  const lane = (player === me ? v.myLanes : v.opponentLanes)[course];
  const t = THEME[course];
  const rows = lane.map((c) => (c.step === 0
    ? `<div class="row"><span class="no" style="--c:#F1EDE6;--k:#1a1a1a">×2</span></div>`
    : `<div class="row"><span class="no" style="--c:${t.color};--k:${t.ink}">${c.step}</span>${cardTitle(c)}</div>`)).join('');
  return `<div class="backdrop" data-act="close"></div>
  <div class="panel narrow" role="dialog" aria-label="${t.name} 줄">
    <button class="x" data-act="close" aria-label="닫기">✕</button>
    <div class="detail">
      <div class="list">
        <div class="who"><span class="ib" style="--c:${t.color}">${courseIcon(course)}</span>${esc(nm[player])}<span class="n">${lane.length}장</span></div>
        ${rows}
      </div>
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

  const courses = v.courses;
  const cols = courses.map((course) => {
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

  const hand = v.myHand.slice().sort((a, b) => courses.indexOf(a.course) - courses.indexOf(b.course) || a.step - b.step)
    .map((card) => cardHtml(card, {
      tag: 'button',
      extra: `data-card="${card.id}" aria-pressed="${card.id === selected}" ${playing ? '' : 'disabled'}`,
      sel: card.id === selected,
    })).join('');

  const turnText = tut ? (myTurn ? '내 차례' : '상대') : online ? (myTurn ? '내 차례' : esc(nm[opp])) : `${esc(nm[me])} 차례`;
  const banner = online && !net.connected
    ? '<div class="banner bad">연결이 끊겼어요. 다시 연결하는 중…</div>'
    : online && !net.opponentConnected
      ? `<div class="banner">${esc(nm[opp])} 연결 끊김</div>`
      : '';

  const deck = deckTarget
    ? `<button class="deck deckbtn target${urgent ? ' urgent' : ''}" data-draw="deck" aria-label="식재료 창고에서 가져오기"><span class="tag">+</span>${v.deckCount}</button>`
    : `<div class="deck deckbtn${urgent ? ' urgent' : ''}" aria-label="마감까지 ${v.deckCount}장">${v.deckCount}</div>`;

  const html = `<div class="board${aim ? ' aim' : ''}${intro && !online ? ' shield' : ''}">${banner}
    <aside class="rail">
      ${deck}
      <div class="pips"><i class="pip${myTurn ? ' on' : ''}"></i><i class="pip${drawing ? ' go' : ''}"></i></div>
      <div class="turn">${turnText}</div>
      ${tut ? '' : clockHtml()}
      <div class="tasks">${taskChipsHtml(ctx)}</div>
      <div class="grow"></div>
      ${online && !tut ? '<button class="rend" data-act="end" aria-label="게임 끝내기">끝내기</button>' : ''}
      <button class="rhelp" data-act="rules" aria-label="규칙 보기">?</button>
    </aside>
    <main class="main">
      <div class="cols" style="--n:${courses.length}">${cols}</div>
      <div class="hand">${hand}</div>
    </main>
  </div>${sheetHtml(ctx)}${intro ? introHtml() : ''}${!online && cover ? coverHtml(ctx) : ''}`;
  starPop = null;
  return html;
}

// 결과 한 줄 평. 점수 차이(10점 이하 / 11~29 / 30 이상)와 보는 사람(이긴 쪽 / 진 쪽)에 따라 나눈다.
// 한 기기 모드는 누구 화면인지 정해져 있지 않아서 이긴 사람을 기준으로 쓴다.
const REVIEW_TEXT = {
  win: ['한 접시 차이로 이겼어요. 아슬아슬했어요!', '차분하게 앞서 나간 판이었어요.', '오늘 밤 심사위원은 이 주방의 이름을 기억할 거예요.'],
  lose: ['한 접시 차이로 아쉽게 졌어요. 한 판 더 가면 뒤집을 수 있어요.', '조금 뒤처졌어요. 다음 판에는 코스를 더 빨리 채워 봐요.', '이번 판은 크게 밀렸어요. 한 판 더 해 볼까요?'],
  both: ['한 접시 차이로 승부가 갈렸어요.', '차분하게 앞서 나간 판이었어요.', '오늘 밤 심사위원은 이 주방의 이름을 기억할 거예요.'],
};
const gapTier = (gap) => (gap <= 10 ? 0 : gap <= 29 ? 1 : 2);

function review(result, nm, me, online) {
  const w = result.winner;
  if (w === null) return '점수가 똑같아요. 심사위원이 한 입씩 더 먹어 보기로 했어요.';
  const f = result.forfeitBy;
  if (f === 0 || f === 1) { // 한 사람이 게임을 끝냈다
    if (!online) return `${esc(nm[f])}님이 게임을 끝냈어요.`;
    return f === me ? '게임을 끝내서 패배로 기록됐어요.' : `${esc(nm[f])}님이 게임을 끝냈어요. 이번 판은 승리로 기록돼요.`;
  }
  const kind = !online ? 'both' : w === me ? 'win' : 'lose';
  return REVIEW_TEXT[kind][gapTier(Math.abs(result.scores[0] - result.scores[1]))];
}

// 결과 화면: 각자 달성한 심사위원 과제 칩 (금색 = 달성, 흐린 점선 = 못 받음)
function resultTasksHtml(r, p, nm) {
  const list = r.bonus ?? [];
  if (!list.length) return '';
  const chips = list.map((b) => {
    const got = b.claimedBy === p;
    const ui = taskUi(b.id);
    return `<button class="tchip static${got ? ' me' : ' opp'}" data-act="tasks" data-task="${esc(b.id)}" aria-label="${esc(ui.text)}: ${got ? '달성' : '못 받음'}">${ui.chip}</button>`;
  }).join('');
  const n = list.filter((b) => b.claimedBy === p).length;
  return `<div class="rtk" aria-label="${esc(nm[p])} 과제 ${n}개 달성">${chips}</div>`;
}

function overHtml() {
  const ctx = getCtx();
  const { v, nm, me, online } = ctx;
  const r = v.result;
  const w = r.winner;
  const rows = v.courses.map((c) => {
    const a = r.lanes[0][c].started ? r.lanes[0][c].score : 0;
    const b = r.lanes[1][c].started ? r.lanes[1][c].score : 0;
    return `<div class="tr" style="--c:${THEME[c].color}"><i></i><span class="${a >= b ? 'hi' : 'lo'}">${minus(a)}</span><span class="${b >= a ? 'hi' : 'lo'}">${minus(b)}</span></div>`;
  }).join('');
  const bp = r.bonusPoints ?? [0, 0];
  const bpText = (n) => (n ? `+${n}` : '0');
  const bonusRow = !(r.bonus ?? []).length ? '' : `<div class="tr" style="--c:#FFD23F"><i></i><span class="${bp[0] >= bp[1] ? 'hi' : 'lo'}">${bpText(bp[0])}</span><span class="${bp[1] >= bp[0] ? 'hi' : 'lo'}">${bpText(bp[1])}</span></div>`;
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
      <p class="sub">${review(r, nm, me, online)}</p>
      <div class="tot">
        <div class="${w === 0 ? 'win' : ''}"><span>${esc(nm[0])}</span><b>${minus(r.scores[0])}</b>${resultTasksHtml(r, 0, nm)}</div>
        <div class="${w === 1 ? 'win' : ''}"><span>${esc(nm[1])}</span><b>${minus(r.scores[1])}</b>${resultTasksHtml(r, 1, nm)}</div>
      </div>
      ${hint}
      <div class="acts">${again}<button class="btn ghost" data-act="${online ? 'leave' : 'home'}">${online ? '나가기' : '처음으로'}</button></div>
    </div>
    <div class="rtable">
      <div class="th"><span></span><span>${esc(nm[0])}</span><span>${esc(nm[1])}</span></div>
      ${rows}${bonusRow}
    </div>
  </div>`;
}

function render() {
  if (tut) { renderTut(); return; }
  if (screen !== 'play') { intro = null; clearTimeout(introTimer); }
  let html;
  if (screen === 'home') html = homeHtml();
  else if (screen === 'local-setup') html = localSetupHtml();
  else if (screen === 'lobby') html = lobbyHtml();
  else if (screen === 'wait') html = waitHtml();
  else if (screen === 'over') html = overHtml();
  else html = playHtml();
  // 규칙 창은 어느 화면에서나 열 수 있다 (대결 화면은 playHtml 안에서 처리)
  if (screen !== 'play' && sheet?.type === 'rules') html += rulesHtml();
  if (screen === 'over' && sheet?.type === 'tasks') html += tasksSheetHtml(getCtx()); // 결과 화면에서 과제 칩을 누르면 과제 창
  if (askTut && screen === 'home') html += askTutHtml();
  app.innerHTML = html;
}

// ---------- 연습(튜토리얼) ----------
const tutTotal = TUT_STEPS.filter((s) => s.kind !== 'done').length;

function askTutHtml() {
  return `<div class="backdrop"></div>
  <div class="panel ask" role="dialog" aria-label="연습">
    <h3>처음이세요?</h3>
    <p class="note" style="margin:0 0 calc(var(--u) * 16)">카드 몇 장으로 규칙을 익혀 봐요.</p>
    <button class="btn" data-act="tut-ask-yes">연습해 볼래요</button>
    <button class="btn ghost" style="margin-top:calc(var(--u) * 10)" data-act="tut-ask-no">괜찮아요</button>
  </div>`;
}

function scoreStepHtml() {
  const g = tut.game;
  const rows = COURSES.filter((c) => g.lanes[0][c].length).map((c) => {
    const d = laneDetail(g.lanes[0][c]);
    return `<div class="tr" style="--c:${THEME[c].color}"><i></i><span class="hi">${minus(d.score)}</span></div>`;
  }).join('');
  return `<div class="backdrop"></div>
  <div class="panel tutscore" role="dialog" aria-label="점수 계산">
    <h3>점수 계산</h3>
    <ul>
      <li>코스 점수 = (숫자 합 − 20) × 배수</li>
      <li>코스를 시작하면 −20에서 출발해요. 숫자를 20 넘게 쌓아야 점수가 돼요.</li>
      <li>예약 손님이 있으면 이득도 손해도 ×2예요.</li>
      <li>카드 8장 이상이면 별 +20점.</li>
    </ul>
    <div class="now"><span>지금 내 코스</span>${rows}</div>
    <button class="btn" data-act="tut-next">다음</button>
  </div>`;
}

function coachHtml() {
  const st = TUT_STEPS[tut.step];
  const friend = tut.friend
    ? '<div class="banner friend"><span>친구가 들어왔어요</span><button data-act="tut-go">바로 시작</button></div>' : '';
  if (st.kind === 'score' && !tut.busy) return `<div class="tuttop">${friend}</div>${scoreStepHtml()}`;
  const text = tut.busy ? (tut.note || '상대 차례예요') : st.text;
  const next = st.kind === 'info' && !tut.busy ? '<button class="cnext" data-act="tut-next">다음</button>' : '';
  return `<div class="tuttop"><div class="coach${tut.busy ? ' wait' : ''}" role="status">
    <span class="cstep">${Math.min(tut.step + 1, tutTotal)}/${tutTotal}</span><span class="ctext">${text}</span>${next}
    <button class="cskip" data-act="tut-skip">건너뛰기</button>
  </div>${friend}</div>`;
}

function extHtml() {
  const slides = [
    ['6코스 (확장)', ['면 코스가 더해져 카드가 72장이 돼요.', '코스가 여섯이라 한 판이 조금 더 길어요.']],
    ['심사위원 과제', ['판마다 과제 5장이 공개돼요.', '채우면 한 장당 +10점이에요.', '먼저 채우는 과제는 먼저 한 사람이, 마감 때 비교하는 과제는 가장 앞선 사람이 받아요.']],
  ];
  const [title, lines] = slides[tut.ext];
  const last = tut.ext === slides.length - 1;
  return `<div class="screen">${nightScene()}
    <div class="side">
      <h2 class="exth">${title}</h2>
      <div class="extp">${lines.map((l) => `<p>${l}</p>`).join('')}</div>
      <div class="menu">
        <button class="btn" data-act="${last ? 'tut-go' : 'tut-ext-next'}">${last ? '시작하기' : '다음'}</button>
      </div>
      <span class="extn">${tut.ext + 1}/${slides.length}</span>
    </div>
  </div>`;
}

function doneHtml() {
  return `<div class="screen">${nightScene()}
    <div class="side">
      <h2 class="exth">연습 끝</h2>
      <p class="sub">이제 진짜 한 판이에요.</p>
      <div class="menu">
        <button class="btn" data-act="tut-go">${tut.ret === 'wait' ? '친구 기다리기' : '시작하기'}</button>
        <button class="btn ghost" data-act="tut-ext">6코스는 뭐가 달라요?</button>
        <button class="btn ghost" data-act="tut-again">한 번 더 연습</button>
      </div>
    </div>
  </div>`;
}

function renderTut() {
  intro = null; clearTimeout(introTimer);
  if (tut.ext !== null) { app.innerHTML = extHtml(); return; }
  if (TUT_STEPS[tut.step].kind === 'done') { app.innerHTML = doneHtml(); return; }
  app.innerHTML = playHtml() + coachHtml();
  applyTutFocus();
}

// 지금 눌러야 할 곳을 빛내고, 나머지 손패는 흐리게
function applyTutFocus() {
  const st = TUT_STEPS[tut.step];
  const board = app.querySelector('.board');
  if (!board || tut.busy) return;
  const mark = (sel) => app.querySelectorAll(sel).forEach((n) => n.classList.add('tut-focus'));
  if (st.kind === 'info') { (st.focus || []).forEach(mark); return; }
  if (st.kind !== 'act') return;
  board.classList.add('tutdim');
  const a = st.allow;
  (a.cards || []).forEach((id) => mark(`[data-card="${id}"]`));
  if (a.lane && selected) mark(`[data-lane="${a.lane}"]`);
  if (a.drop && selected) mark(`[data-drop="${a.drop}"]`);
  (a.draw || []).forEach((d) => mark(`[data-draw="${d}"]`));
}

function startTutorial() {
  const ret = mode === 'online' && net?.ws && screen === 'wait' ? 'wait' : 'home';
  store.set('tutorial', '1');
  askTut = false;
  sheet = null;
  selected = null;
  seenClaims = {};
  tut = { game: makeTutorialGame(), step: 0, ret, busy: false, note: '', friend: false, ext: null };
  render();
}

function exitTutorial() {
  const ret = tut.ret;
  tut = null;
  selected = null;
  sheet = null;
  if (ret === 'wait' && net) {
    if (net.last && net.last.status !== 'waiting') { screen = 'wait'; onState(net.last); return; }
    screen = 'wait';
  } else {
    screen = 'home';
  }
  render();
}

function nudge() {
  const c = app.querySelector('.coach');
  if (!c) return;
  c.classList.remove('shake');
  void c.offsetWidth;
  c.classList.add('shake');
}

const NOTE = { discard: '상대가 카드를 좌판에 내려놓았어요', play: '상대가 코스에 카드를 올렸어요', draw: '상대가 한 장 가져갔어요' };

function runOpp(idx) {
  const mine = tut;
  const script = OPP_SCRIPTS[idx];
  const delay = reduceMotion() ? 120 : 800;
  let i = 0;
  const next = () => {
    if (tut !== mine) return;
    if (i >= script.length) { mine.step += 1; mine.busy = false; mine.note = ''; render(); return; }
    const a = script[i++];
    const r = apply(mine.game, 1, a);
    if (r.ok) mine.game = r.state;
    mine.note = NOTE[a.type];
    render();
    setTimeout(next, delay);
  };
  mine.note = '상대 차례예요';
  render();
  setTimeout(next, delay);
}

function tutAct(action) {
  const st = TUT_STEPS[tut.step];
  const srcEl = action.cardId ? document.querySelector(`[data-card="${action.cardId}"]`) : null;
  const fromRect = srcEl?.getBoundingClientRect();
  const movedCard = action.cardId ? tut.game.hands[0].find((c) => c.id === action.cardId) : null;
  const r = apply(tut.game, 0, action);
  if (!r.ok) { toast(r.error); return; }
  tut.game = r.state;
  selected = null;
  if (st.expect !== action.type) { render(); return; }
  if (st.then !== undefined) {
    tut.busy = true;
    render();
    if (movedCard) fly(movedCard, fromRect, `[data-pile="${movedCard.course}"]`);
    runOpp(st.then);
    return;
  }
  tut.step += 1;
  render();
  if (movedCard) fly(movedCard, fromRect, action.type === 'play' ? `[data-mylane="${movedCard.course}"]` : `[data-pile="${movedCard.course}"]`);
}

// 연습 중 눌림: 정해진 곳만 받는다
function tutorialClick(t) {
  const d = t.dataset;
  switch (d.act) {
    case 'tut-next': tut.step += 1; render(); return;
    case 'tut-skip': exitTutorial(); return;
    case 'tut-go': exitTutorial(); return;
    case 'tut-again': tut = { ...tut, game: makeTutorialGame(), step: 0, busy: false, note: '', ext: null }; selected = null; render(); return;
    case 'tut-ext': tut.ext = 0; render(); return;
    case 'tut-ext-next': tut.ext += 1; render(); return;
    case 'rules': sheet = { type: 'rules' }; render(); return;
    case 'close': sheet = null; render(); return;
    default:
  }
  if (d.act) return;
  const st = TUT_STEPS[tut.step];
  if (st.kind !== 'act' || tut.busy) { nudge(); return; }
  const a = st.allow;
  if (d.card) {
    if ((a.cards || []).includes(d.card)) { selected = selected === d.card ? null : d.card; render(); } else nudge();
  } else if (d.lane) {
    if (selected && a.lane === d.lane) tutAct({ type: 'play', cardId: selected }); else nudge();
  } else if (d.drop) {
    if (selected && a.drop === d.drop) tutAct({ type: 'discard', cardId: selected }); else nudge();
  } else if (d.draw) {
    if ((a.draw || []).includes(d.draw)) tutAct({ type: 'draw', from: d.draw }); else nudge();
  } else nudge();
}

// ---------- 카드 이동 연출 ----------
function fly(card, fromRect, targetSelector) {
  if (reduceMotion() || rotatedStage() || !fromRect) return;
  const to = document.querySelector(targetSelector)?.getBoundingClientRect();
  if (!to) return;
  const el = document.createElement('div');
  el.className = 'fly';
  el.innerHTML = cardHtml(card);
  el.firstElementChild.style.setProperty('--cw', `${fromRect.width}px`);
  el.style.left = `${fromRect.left}px`;
  el.style.top = `${fromRect.top}px`;
  stage.appendChild(el);
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
  game = newGame(Math.random, { courses: courseCount });
  localDeadline = null;
  seenClaims = {};
  selected = null;
  sheet = null;
  screen = 'play';
  cover = true;
  if (game.bonus.length) { // 6코스: 소개가 먼저, 끝나면 첫 번째 플레이어 가림 화면
    cover = false;
    introThenCover = true;
    startIntro();
  }
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
  if (game.turn !== turnBefore) { cover = true; localDeadline = null; }
  if (action.type === 'play' && movedCard) {
    const after = game.lanes[turnBefore][movedCard.course].length;
    if (before < STAR_CARDS && after >= STAR_CARDS) starPop = movedCard.course;
  }
  notifyBonus(viewFor(game, game.turn), game.turn, names, false);
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
    connected: false, courses: courseCount, turnSeconds: turnSec, deadline: null, offset: 0, autoSeq: undefined, opponentConnected: true, rematch: [false, false], retry: 0, closing: false, timer: null, ping: null,
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
    ws.send(JSON.stringify({ t: 'join', name: net.name, token: net.token, courses: courseCount, turnSeconds: turnSec }));
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
  net.last = m;
  const prev = net.view;
  net.seat = m.seat;
  net.names = m.names.map((n, i) => n || `요리사 ${i + 1}`);
  net.status = m.status;
  net.opponentConnected = m.opponentConnected;
  net.rematch = m.rematch;
  net.view = m.view;
  net.courses = m.settings?.courses ?? 5;
  net.turnSeconds = m.settings?.turnSeconds ?? 0;
  net.deadline = m.deadline ?? null;
  net.offset = m.now ? m.now - Date.now() : 0;
  const seq = m.auto?.seq ?? 0;
  if (!tut && net.autoSeq !== undefined && seq > net.autoSeq) {
    toast(m.auto.seat === m.seat ? '시간이 다 돼서 자동으로 냈어요' : `${net.names[m.auto.seat]}님 시간 초과`);
  }
  net.autoSeq = seq;
  if (tut) { if (m.status !== 'waiting') tut.friend = true; render(); return; }
  if (m.status === 'waiting') { screen = 'wait'; render(); return; }
  if (prev && m.view) {
    for (const c of (m.view.courses ?? COURSES)) {
      if (prev.myLanes[c].length < STAR_CARDS && m.view.myLanes[c].length >= STAR_CARDS) starPop = c;
    }
  }
  const wasPlaying = screen === 'play';
  if (m.view && (!wasPlaying || (prev && prev.over && !m.view.over))) seenClaims = {};
  if (m.view) notifyBonus(m.view, m.seat, net.names, true);
  screen = m.status === 'over' ? 'over' : 'play';
  if (screen === 'play' && !wasPlaying) { selected = null; sheet = null; if (m.view && isFresh(m.view)) startIntro(); }
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
    if (net.code) store.del(`token:${net.code}`); // 나가기를 누르면 이 방으로 자동 복귀하지 않는다
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
  if (tut) { tutorialClick(t); return; }
  switch (d.act) {
    case 'tut-start': startTutorial(); return;
    case 'tut-ask-yes': startTutorial(); return;
    case 'tut-ask-no': askTut = false; store.set('tutorial', '1'); render(); return;
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
    case 'end': sheet = { type: 'end' }; render(); return;
    case 'end-yes': sheet = null; if (mode === 'online') sendOnline({ t: 'forfeit' }); render(); return;
    case 'reveal': cover = false; render(); return;
    case 'intro-go': dismissIntro(); return;
    case 'again':
      if (mode === 'online') sendOnline({ t: 'rematch' }); else startLocal();
      return;
    case 'rules': sheet = { type: 'rules' }; render(); return;
    case 'tasks': sheet = { type: 'tasks', focus: d.task || null }; render(); return;
    case 'set-turn': turnSec = TURN_CHOICES.includes(Number(d.n)) ? Number(d.n) : 30; store.set('turnsec', String(turnSec)); render(); return;
    case 'set-courses': courseCount = Number(d.n) === 6 ? 6 : 5; store.set('courses', String(courseCount)); render(); return;
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

app.addEventListener('input', (e) => { if (e.target.id) draft[e.target.id] = e.target.value; });

// 테스트와 디버깅용
window.__hansang = {
  get game() { return game; },
  get net() { return net; },
  get view() { return mode === 'online' ? net?.view : null; },
  get tutStep() { return tut ? tut.step : null; },
  get tutGame() { return tut?.game ?? null; },
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
  } else if (!store.get('tutorial')) {
    askTut = true;
  }
  render();
})();
