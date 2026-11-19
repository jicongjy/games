// 차려내라! 한 상: 한 기기에서 둘이 번갈아 두는 화면
import {
  COURSES, apply, newGame, viewFor, canPlayOnLane, laneDetail, scores, winner, STAR_CARDS, BASE_COST,
} from './engine/rules.js';
import { THEME, cardTitle, iconSvg, courseIcon } from './cards-data.js';

const PREFIX = 'hansang:';
const store = {
  get(k) { try { return localStorage.getItem(PREFIX + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(PREFIX + k, v); } catch (e) { /* 저장 실패는 무시 */ } },
};

const app = document.getElementById('app');
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let names = ['요리사 1', '요리사 2'];
try {
  const saved = JSON.parse(store.get('names') || 'null');
  if (Array.isArray(saved) && saved.length === 2) names = saved.map(String);
} catch (e) { /* 기본 이름 사용 */ }

let screen = 'start'; // start | play | over
let game = null;
let selected = null; // 선택한 손패 카드 id
let cover = false; // 차례 넘김 가림 화면
let sheet = null; // null | {type:'lane', player, course} | {type:'score'}
let starPop = null; // 방금 별을 받은 코스
let toastTimer = null;

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

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

// 코스 줄 요약: 마지막으로 낸 단계 숫자를 크게
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

function oppChipHtml(oppLanes, course, oppIdx) {
  const t = THEME[course];
  const { d, big, count } = laneSummary(oppLanes[course]);
  const cls = d.started ? 'opp' : 'opp empty';
  const sc = d.started ? `<span class="m">${count}장</span><span class="m">${d.score > 0 ? '+' : ''}${d.score}</span>` : `<span class="m">${t.name}</span>`;
  return `<button class="${cls}" style="--c:${t.color};--k:${t.ink}" data-detail="${oppIdx}:${course}" ${d.started ? '' : 'disabled'} aria-label="${esc(names[oppIdx])} ${t.name} 줄 보기"><span class="n">${big}</span>${sc}</button>`;
}

function renderStart() {
  app.innerHTML = `
  <section class="start">
    <h1>차려내라!<br>한 상</h1>
    <p class="sub">마감 전에 한 상, 누가 더 근사하게 차려낼까요? 한 기기에서 둘이 번갈아 두는 버전입니다.</p>
    <label for="n0">첫 번째 요리사 (먼저 시작)</label>
    <input id="n0" maxlength="10" value="${esc(names[0])}" autocomplete="off">
    <label for="n1">두 번째 요리사</label>
    <input id="n1" maxlength="10" value="${esc(names[1])}" autocomplete="off">
    <button class="btn" data-act="start">주방 열기</button>
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
    </details>
  </section>`;
}

function sheetHtml() {
  if (!sheet) return '';
  if (sheet.type === 'score') {
    const sc = scores(game);
    return `<div class="backdrop" data-act="close"></div>
    <div class="sheet" role="dialog" aria-label="점수">
      <h3>지금까지 점수</h3><p class="sub">코스 점수의 합이에요. 마감 때 확정돼요.</p>
      <div class="sc"><span>${esc(names[0])}</span><b class="${sc[0] < 0 ? 'neg' : ''}">${sc[0]}</b></div>
      <div class="sc"><span>${esc(names[1])}</span><b class="${sc[1] < 0 ? 'neg' : ''}">${sc[1]}</b></div>
      <button class="btn ghost close" data-act="close">닫기</button>
    </div>`;
  }
  const { player, course } = sheet;
  const lane = game.lanes[player][course];
  const t = THEME[course];
  const d = laneDetail(lane);
  const rows = lane.map((c) => `<div class="li" style="--c:${c.step === 0 ? '#F1EDE6' : t.color};--k:${c.step === 0 ? '#1a1a1a' : t.ink}"><span class="no">${c.step === 0 ? '예' : c.step}</span>${cardTitle(c)}</div>`).join('');
  const calc = `(숫자 합 ${d.sum} − ${BASE_COST}) × ${1 + d.reservations}${d.star ? ' + 별 20' : ''} = <b>${d.score}점</b>`;
  return `<div class="backdrop" data-act="close"></div>
  <div class="sheet" role="dialog" aria-label="${t.name} 줄">
    <h3>${esc(names[player])}님 · ${t.name}</h3>
    <p class="sub">낸 순서대로 ${lane.length}장</p>
    ${rows || '<p class="sub">아직 낸 카드가 없어요</p>'}
    ${d.started ? `<div class="calc">${calc}</div>` : ''}
    <button class="btn ghost close" data-act="close">닫기</button>
  </div>`;
}

function renderPlay() {
  const p = game.turn;
  const opp = 1 - p;
  const v = viewFor(game, p);
  const selCard = selected ? v.myHand.find((c) => c.id === selected) : null;
  if (selected && !selCard) selected = null;

  const playing = v.phase === 'play';
  const drawing = v.phase === 'draw';
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
    const target = canDrawHere || canDropHere;
    const body = top ? cardHtml(top, { mini: true }) : `<div class="none" style="--c:${t.color}">${t.name}</div>`;
    const cnt = `<div class="cnt">${pile.length}장</div>`;
    const base = `data-pile="${course}"`;
    if (canDrawHere) return `<button class="pile target" ${base} data-draw="${course}" aria-label="${t.name} 좌판에서 가져오기"><span class="tag">가져오기</span>${body}${cnt}</button>`;
    if (canDropHere) return `<button class="pile target" ${base} data-drop="${course}" aria-label="${t.name} 좌판에 내려놓기"><span class="tag">내려놓기</span>${body}${cnt}</button>`;
    return `<div class="pile ${aim ? 'dim' : ''}" ${base}>${body}${cnt}</div>`;
  }).join('');

  const oppChips = COURSES.map((c) => oppChipHtml(v.opponentLanes, c, opp)).join('');
  const myLanes = COURSES.map((c) => {
    const target = playing && selCard && selCard.course === c && canPlayOnLane(v.myLanes[c], selCard);
    return myLaneHtml(v.myLanes, c, { target, player: p });
  }).join('');

  const handHtml = hand.map((card) => cardHtml(card, {
    tag: 'button',
    extra: `data-card="${card.id}" aria-pressed="${card.id === selected}" ${playing ? '' : 'disabled'}`,
    sel: card.id === selected,
  })).join('');

  const tip = playing
    ? '<span class="stp">1</span>카드를 골라 코스에 올리거나 좌판에 내려놓기'
    : '<span class="stp">2</span>창고나 좌판에서 한 장 가져오기';

  app.innerHTML = `
  <header class="top">
    ${deckTarget
      ? `<button class="deckbtn target ${deckUrgent ? 'urgent' : ''}" data-draw="deck" aria-label="식재료 창고에서 가져오기"><span class="tag">가져오기</span><small>마감까지</small><b>${v.deckCount}</b></button>`
      : `<div class="deckbtn ${deckUrgent ? 'urgent' : ''}"><small>마감까지</small><b>${v.deckCount}</b></div>`}
    <div class="status">
      <div class="who">${esc(names[p])}님 차례</div>
      <div class="tip">${tip}</div>
      ${deckUrgent ? '<div class="late">곧 마감입니다</div>' : ''}
    </div>
    <button class="scorebtn" data-act="score">점수</button>
  </header>
  <main class="board ${aim ? 'aim' : ''}">
    <section>
      <div class="lbl"><span>${esc(names[opp])}님의 코스</span><span>눌러서 보기</span></div>
      <div class="row" style="margin-top:8px">${oppChips}</div>
    </section>
    <section class="market">
      <div class="lbl"><span>시장 좌판</span></div>
      <div class="row">${marketCols}</div>
    </section>
    <section>
      <div class="lbl"><span>${esc(names[p])}님의 코스</span></div>
      <div class="row" style="margin-top:8px">${myLanes}</div>
    </section>
  </main>
  <div class="handwrap">
    <div class="handlbl">내 패 ${v.myHand.length}장</div>
    <div class="hand">${handHtml}</div>
  </div>
  ${sheetHtml()}
  ${cover ? `<div class="cover">
      <h2>${esc(names[p])}님 차례입니다</h2>
      <p>${esc(names[opp])}님은 화면을 보지 마세요.<br>준비되면 아래 버튼을 눌러 패를 확인하세요.</p>
      <button class="btn" data-act="reveal">내 패 보기</button>
    </div>` : ''}`;
  starPop = null;
}

function review() {
  const w = winner(game);
  const sc = scores(game);
  if (w === null) return ['점수가 똑같습니다. 심사위원이 한 입씩 더 먹어 보기로 했습니다.'];
  const l = 1 - w;
  const big = Math.abs(sc[0] - sc[1]) >= 30;
  return big
    ? [`${names[w]}님: 오늘 밤 심사위원은 이 주방의 이름을 기억할 겁니다.`,
       `${names[l]}님: 재료만 늘어놓다 마감 종이 울렸네요. 다음 영업을 노려 보세요.`]
    : [`${names[w]}님: 한 접시 차이로 별이 갈렸습니다.`,
       `${names[l]}님: 아쉽지만 다음 상차림이 기대됩니다.`];
}

function renderOver() {
  const v = viewFor(game, 0);
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
  app.innerHTML = `
  <section class="result">
    <h2>${w === null ? '무승부' : `${esc(names[w])}님 승리`}</h2>
    <div class="tot">
      <div class="${w === 0 ? 'win' : ''}">${esc(names[0])}<b>${r.scores[0]}</b></div>
      <div class="${w === 1 ? 'win' : ''}">${esc(names[1])}<b>${r.scores[1]}</b></div>
    </div>
    <table>
      <thead><tr><th>코스</th><th colspan="2">${esc(names[0])}</th><th colspan="2">${esc(names[1])}</th></tr>
      <tr><th></th><th>숫자 합</th><th>점수</th><th>숫자 합</th><th>점수</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="note">코스 점수 = (숫자 합 − 20) × (1 + 예약 수), 예약 포함 ${STAR_CARDS}장 이상이면 별 +20점</p>
    <div class="review">${review().map((s) => `<p>${esc(s)}</p>`).join('')}
      ${unfinished.length ? `<p class="note">${unfinished.map((p) => esc(names[p])).join(', ')}: 시작만 하고 마무리 못 한 코스가 있습니다.</p>` : ''}</div>
    <div class="actions">
      <button class="btn" data-act="again">한 판 더</button>
      <button class="btn ghost" data-act="home">이름 바꾸기</button>
    </div>
  </section>`;
}

function render() {
  if (screen === 'start') renderStart();
  else if (screen === 'over') renderOver();
  else renderPlay();
}

function startGame() {
  game = newGame();
  selected = null;
  cover = true;
  sheet = null;
  screen = 'play';
  render();
  window.scrollTo?.(0, 0);
}

// 카드가 손에서 줄이나 좌판으로 날아가는 짧은 움직임 (같은 차례 안에서만)
function fly(card, fromRect, targetSelector) {
  if (reduceMotion() || !fromRect) return;
  const to = document.querySelector(targetSelector)?.getBoundingClientRect();
  if (!to) return;
  const el = document.createElement('div');
  el.className = 'fly';
  el.innerHTML = cardHtml(card, { extra: '' });
  const c = el.firstElementChild;
  c.style.setProperty('--w', `${fromRect.width}px`);
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

function act(action) {
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
  if (movedCard) {
    fly(movedCard, fromRect, action.type === 'play' ? `[data-mylane="${movedCard.course}"]` : `[data-pile="${movedCard.course}"]`);
  }
  if (cover) window.scrollTo?.(0, 0);
}

app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act],[data-card],[data-lane],[data-drop],[data-draw],[data-detail]');
  if (!t) return;
  const d = t.dataset;
  if (d.act === 'start') {
    const n0 = document.getElementById('n0').value.trim() || '요리사 1';
    const n1 = document.getElementById('n1').value.trim() || '요리사 2';
    names = [n0, n1];
    store.set('names', JSON.stringify(names));
    startGame();
  } else if (d.act === 'reveal') { cover = false; render(); }
  else if (d.act === 'again') startGame();
  else if (d.act === 'home') { screen = 'start'; render(); }
  else if (d.act === 'score') { sheet = { type: 'score' }; render(); }
  else if (d.act === 'close') { sheet = null; render(); }
  else if (d.detail) {
    const [pl, course] = d.detail.split(':');
    sheet = { type: 'lane', player: Number(pl), course };
    render();
  }
  else if (d.card) { selected = selected === d.card ? null : d.card; render(); }
  else if (d.lane) act({ type: 'play', cardId: selected });
  else if (d.drop) act({ type: 'discard', cardId: selected });
  else if (d.draw) act({ type: 'draw', from: d.draw });
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheet) { sheet = null; render(); }
});

// 테스트와 디버깅용
window.__hansang = { get game() { return game; } };

render();
