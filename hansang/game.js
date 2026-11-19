// 차려내라! 한 상: 한 기기에서 둘이 번갈아 두는 화면
import {
  COURSES, apply, newGame, viewFor, canPlayOnLane, laneDetail, scores, winner, STAR_CARDS,
} from './engine/rules.js';
import { THEME, RESERVE_TEXT, cardTitle, iconSvg } from './cards-data.js';

const PREFIX = 'hansang:';
const store = {
  get(k) { try { return localStorage.getItem(PREFIX + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(PREFIX + k, v); } catch (e) { /* 저장 실패는 무시 */ } },
};

const app = document.getElementById('app');
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

let names = ['요리사 1', '요리사 2'];
try {
  const saved = JSON.parse(store.get('names') || 'null');
  if (Array.isArray(saved) && saved.length === 2) names = saved.map(String);
} catch (e) { /* 기본 이름 사용 */ }

let screen = 'start'; // start | play | over
let game = null;
let selected = null; // 선택한 손패 카드 id
let cover = false; // 차례 넘김 가림 화면
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

function cardHtml(card, { tag = 'div', extra = '', mini = false, sel = false } = {}) {
  const t = THEME[card.course];
  const bg = card.step === 0 ? '#F1EDE6' : t.color;
  const ink = card.step === 0 ? '#1a1a1a' : t.ink;
  const num = card.step === 0 ? '예' : card.step;
  return `<${tag} class="card${mini ? ' mini' : ''}${sel ? ' sel' : ''}" style="--bg:${bg};--ink:${ink}" ${extra}>
    <div class="ct">${cardTitle(card)}</div>
    <div class="ci">${iconSvg(card)}</div>
    <div class="cf"><span>${t.name}</span><b>${num}</b></div>
  </${tag}>`;
}

function stripHtml(card) {
  const t = THEME[card.course];
  const label = card.step === 0 ? '단골 예약' : cardTitle(card);
  const num = card.step === 0 ? '예' : card.step;
  const bg = card.step === 0 ? '#F1EDE6' : t.color;
  const ink = card.step === 0 ? '#1a1a1a' : t.ink;
  const reserveBorder = card.step === 0 ? `;border:2px solid ${t.color}` : '';
  return `<div class="strip" style="--bg:${bg};--ink:${ink}${reserveBorder}" title="${esc(label)}"><b>${num}</b><span>${esc(label)}</span></div>`;
}

function badgeHtml(lane) {
  const d = laneDetail(lane);
  if (!d.started) return '<div class="badge">&nbsp;</div>';
  const star = d.star ? '<span class="star">★ 별 </span>' : '';
  return `<div class="badge ${d.score < 0 ? 'neg' : ''}">${star}${d.score > 0 ? '+' : ''}${d.score}점</div>`;
}

function laneHtml(lanes, course, { mine, target }) {
  const lane = lanes[course];
  const t = THEME[course];
  const cls = ['lane'];
  if (lane.length === 0) cls.push('empty');
  if (target) cls.push('target');
  const attrs = target ? `data-lane="${course}" role="button" tabindex="0" aria-label="${t.name} 줄에 올리기"` : '';
  const strips = lane.length
    ? lane.map(stripHtml).join('')
    : `<div class="ph">${t.name}</div>`;
  const badge = badgeHtml(lane);
  // 시장과 가까운 쪽에 점수 표시: 상대는 아래, 나는 위
  return `<div class="${cls.join(' ')}" style="--c:${t.color}" ${attrs}>${mine ? badge + strips : strips + badge}</div>`;
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

function statusTip(v) {
  return v.phase === 'play'
    ? '① 카드를 골라 코스 줄에 올리거나, 시장 좌판에 내려놓으세요'
    : '② 식재료 창고에서 한 장, 혹은 시장 좌판에서 한 장 가져오세요';
}

function renderPlay() {
  const p = game.turn;
  const opp = 1 - p;
  const v = viewFor(game, p);
  const sc = scores(game);
  const selCard = selected ? v.myHand.find((c) => c.id === selected) : null;
  if (selected && !selCard) selected = null;

  const playing = v.phase === 'play';
  const drawing = v.phase === 'draw';

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
    const attrs = canDrawHere
      ? `data-draw="${course}" role="button" tabindex="0" aria-label="${t.name} 좌판에서 가져오기"`
      : canDropHere
        ? `data-drop="${course}" role="button" tabindex="0" aria-label="${t.name} 좌판에 내려놓기"`
        : '';
    const body = top ? cardHtml(top, { mini: true }) : `<div class="none" style="--c:${t.color}">${t.name}<br>좌판</div>`;
    return `<div class="pile ${target ? 'target' : ''}" ${attrs}>${body}<div class="cnt">${pile.length}장</div></div>`;
  }).join('');

  const oppLanes = COURSES.map((c) => laneHtml(v.opponentLanes, c, { mine: false, target: false })).join('');
  const myLanes = COURSES.map((c) => {
    const target = playing && selCard && selCard.course === c && canPlayOnLane(v.myLanes[c], selCard);
    return laneHtml(v.myLanes, c, { mine: true, target });
  }).join('');

  const handHtml = hand.map((card) => cardHtml(card, {
    tag: 'button',
    extra: `data-card="${card.id}" aria-pressed="${card.id === selected}" ${playing ? '' : 'disabled'}`,
    sel: card.id === selected,
  })).join('');

  app.innerHTML = `
  <header class="top">
    <div class="deck ${deckUrgent ? 'urgent' : ''} ${deckTarget ? 'target' : ''}" ${deckTarget ? 'data-draw="deck" role="button" tabindex="0" aria-label="식재료 창고에서 가져오기"' : ''}>
      <span>마감까지</span><b>${v.deckCount}</b><span>장</span>
    </div>
    <div class="status">
      <div class="who">${esc(names[p])}님 차례</div>
      <div class="tip">${statusTip(v)}</div>
      ${deckUrgent ? '<div class="urgent-note">곧 마감입니다</div>' : ''}
    </div>
    <div class="score">
      <div>${esc(names[0])} <b>${sc[0]}</b></div>
      <div>${esc(names[1])} <b>${sc[1]}</b></div>
    </div>
  </header>
  <main class="board">
    <div class="side-label">${esc(names[opp])}님의 코스</div>
    <div class="row">${oppLanes}</div>
    <div class="market">
      <div class="side-label" style="margin-bottom:6px">시장 좌판</div>
      <div class="row">${marketCols}</div>
    </div>
    <div class="row">${myLanes}</div>
    <div class="side-label">${esc(names[p])}님의 코스 · 내 패 ${v.myHand.length}장</div>
    <div class="hand">${handHtml}</div>
  </main>
  ${cover ? `<div class="cover">
      <h2>${esc(names[p])}님 차례입니다</h2>
      <p>${esc(names[opp])}님은 화면을 보지 마세요.<br>준비되면 아래 버튼을 눌러 패를 확인하세요.</p>
      <button class="btn" data-act="reveal">내 패 보기</button>
    </div>` : ''}`;
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
    return `<tr><td class="c" style="--c:${t.color}"><i></i>${t.name}</td><td>${cell(r.lanes[0][c])}</td>${sc(r.lanes[0][c])}<td>${cell(r.lanes[1][c])}</td>${sc(r.lanes[1][c])}</tr>`;
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
  window.scrollTo?.(0, 0);
}

function startGame() {
  game = newGame();
  selected = null;
  cover = true;
  screen = 'play';
  render();
}

function act(action) {
  const r = apply(game, game.turn, action);
  if (!r.ok) { toast(r.error); return; }
  const turnBefore = game.turn;
  game = r.state;
  selected = null;
  if (game.over) { screen = 'over'; render(); return; }
  if (game.turn !== turnBefore) cover = true;
  const keepScroll = window.scrollY;
  render();
  if (!cover) window.scrollTo?.(0, keepScroll);
}

app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act],[data-card],[data-lane],[data-drop],[data-draw]');
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
  else if (d.card) { selected = selected === d.card ? null : d.card; render(); }
  else if (d.lane) act({ type: 'play', cardId: selected });
  else if (d.drop) act({ type: 'discard', cardId: selected });
  else if (d.draw) act({ type: 'draw', from: d.draw });
});

app.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"]')) {
    e.preventDefault();
    e.target.click();
  }
});

// 테스트와 디버깅용 (콘솔에서 확인)
window.__hansang = { get game() { return game; } };

render();
