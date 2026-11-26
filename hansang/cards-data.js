// 카드 표시용 데이터: 코스 이름, 색, 단계 이름, 아이콘(SVG)
// 모든 그림은 이 파일에서 직접 만든 도형이다. 외부 이미지를 쓰지 않는다.

export const THEME = {
  ban: { name: '밑반찬', color: '#A5CF4A', ink: '#1a1a1a' },
  guk: { name: '국·탕', color: '#F28C28', ink: '#1a1a1a' },
  noodle: { name: '면', color: '#8E5BD0', ink: '#ffffff' },
  fish: { name: '생선구이', color: '#2F5FD0', ink: '#ffffff' },
  meat: { name: '불고기', color: '#E0402F', ink: '#ffffff' },
  sweet: { name: '후식', color: '#F2A7C0', ink: '#1a1a1a' },
};

export const STEP_NAMES = {
  ban: { 2: '다듬기', 3: '씻기', 4: '데치기', 5: '찬물에 헹구기', 6: '물기 짜기', 7: '양념 만들기', 8: '조물조물 무치기', 9: '참기름 한 방울', 10: '깨 솔솔' },
  guk: { 2: '재료 씻기', 3: '무 썰기', 4: '멸치 육수 내기', 5: '고기 볶기', 6: '한소끔 끓이기', 7: '국간장 간 맞추기', 8: '대파 송송 얹기', 9: '뚝배기에 옮기기', 10: '팔팔 끓여 내기' },
  noodle: { 2: '밀가루 반죽', 3: '숙성시키기', 4: '밀기', 5: '썰기', 6: '육수 끓이기', 7: '면 삶기', 8: '찬물에 헹구기', 9: '그릇에 담기', 10: '고명 올리기' },
  fish: { 2: '비늘 긁기', 3: '내장 손질', 4: '소금 뿌리기', 5: '물기 닦기', 6: '석쇠 달구기', 7: '앞면 굽기', 8: '뒤집기', 9: '껍질 바삭하게', 10: '접시에 올리기' },
  meat: { 2: '핏물 빼기', 3: '얇게 썰기', 4: '양념장 만들기', 5: '재워 두기', 6: '채소 썰기', 7: '팬 달구기', 8: '센 불에 볶기', 9: '국물 자작하게 졸이기', 10: '깨 뿌려 내기' },
  sweet: { 2: '밀가루 체치기', 3: '참기름 섞기', 4: '반죽하기', 5: '모양 내기', 6: '기름 온도 맞추기', 7: '튀기기', 8: '조청 시럽 끓이기', 9: '꿀에 담그기', 10: '잣 올려 내기' },
};

// 예약 카드는 글자 없이 예약 손님 그림과 ×2로 나타낸다.
export const cardTitle = (card) => (card.step === 0 ? '' : STEP_NAMES[card.course][card.step]);

const ICONS = {
  ban: `<path d="M100 18C150 58 150 140 100 182C50 140 50 58 100 18Z" fill="#1F5A2A"/><path d="M62 120C30 100 22 62 40 40C70 54 80 90 62 120Z" fill="#2F7A3A"/><path d="M138 120C170 100 178 62 160 40C130 54 120 90 138 120Z" fill="#2F7A3A"/><path d="M100 40V170" stroke="#A5CF4A" stroke-width="6" stroke-linecap="round"/>`,
  guk: `<circle cx="70" cy="34" r="12" fill="#FFF1DC"/><circle cx="104" cy="22" r="9" fill="#FFF1DC"/><circle cx="134" cy="38" r="12" fill="#FFF1DC"/><rect x="30" y="72" width="140" height="16" rx="8" fill="#5A2A10"/><path d="M42 92H158V130C158 160 136 182 100 182C64 182 42 160 42 130Z" fill="#5A2A10"/><circle cx="26" cy="108" r="10" fill="#5A2A10"/><circle cx="174" cy="108" r="10" fill="#5A2A10"/>`,
  fish: `<polygon points="146,100 192,64 192,136" fill="#fff"/><ellipse cx="90" cy="100" rx="64" ry="40" fill="#fff"/><circle cx="58" cy="90" r="6" fill="#2F5FD0"/><path d="M96 70Q112 100 96 130M118 74Q132 100 118 126" stroke="#2F5FD0" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  meat: `<path d="M100 14C112 56 158 76 152 132C147 168 124 188 100 188C76 188 53 168 48 132C44 102 68 92 76 62C88 74 94 48 100 14Z" fill="#FFD23F"/><path d="M100 98C108 120 128 128 126 152C124 168 112 176 100 176C88 176 76 168 74 152C72 132 94 124 100 98Z" fill="#FFF1DC"/>`,
  sweet: `<rect x="30" y="30" width="140" height="140" rx="34" fill="#8A4B1F"/><rect x="52" y="52" width="96" height="96" rx="22" fill="none" stroke="#F5D9A8" stroke-width="5"/><circle cx="100" cy="100" r="14" fill="#F5D9A8"/><circle cx="72" cy="72" r="6" fill="#F5D9A8"/><circle cx="128" cy="72" r="6" fill="#F5D9A8"/><circle cx="72" cy="128" r="6" fill="#F5D9A8"/><circle cx="128" cy="128" r="6" fill="#F5D9A8"/>`,
};

// 면: 국수 그릇, 위로 올라온 면발, 젓가락
ICONS.noodle = `<line x1="112" y1="14" x2="146" y2="96" stroke="#3a2a22" stroke-width="7" stroke-linecap="round"/><line x1="128" y1="12" x2="158" y2="92" stroke="#3a2a22" stroke-width="7" stroke-linecap="round"/><path d="M48 104C54 62 70 62 78 104M82 104C90 56 108 56 116 104M120 104C128 70 142 70 150 104" stroke="#FFE9B8" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M26 104H174C174 152 142 184 100 184C58 184 26 152 26 104Z" fill="#F5EBDD"/><rect x="26" y="104" width="148" height="12" fill="#FFD23F"/>`;

// 예약 손님: 코스 색 옷을 입고, 앞에 코스 색 점이 찍힌 탁상 팻말을 둔다.
const guest = (color) => `<path d="M26 196C26 144 58 116 100 116C142 116 174 144 174 196Z" fill="${color}"/><circle cx="100" cy="76" r="36" fill="#F0C8A0"/><path d="M62 74C60 38 88 24 108 28C132 32 140 54 138 76C126 58 100 50 62 74Z" fill="#3a2a22"/><circle cx="87" cy="80" r="3.5" fill="#3a2a22"/><circle cx="113" cy="80" r="3.5" fill="#3a2a22"/><path d="M89 94Q100 104 111 94" stroke="#3a2a22" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M68 150L132 150L124 190L76 190Z" fill="#ffffff"/><circle cx="100" cy="168" r="7" fill="${color}"/>`;

export function iconSvg(card) {
  if (card.step === 0) return `<svg viewBox="0 0 200 200" aria-hidden="true">${guest(THEME[card.course].color)}</svg>`;
  return `<svg viewBox="0 0 200 200" aria-hidden="true">${ICONS[card.course]}</svg>`;
}

// 코스 줄과 좌판에서 쓰는 코스 아이콘 (카드와 같은 그림)
export const courseIcon = (course) => `<svg viewBox="0 0 200 200" aria-hidden="true">${ICONS[course]}</svg>`;

// ---------- 심사위원 과제 표시 ----------
// 글자를 줄이기 위해 칩에는 짧은 기호만 쓰고, 자세한 문장은 과제 창에서 보여 준다.
const DOTS = (n) => '<i class="dots">' + '<b></b>'.repeat(n) + '</i>';
export function taskUi(id) {
  const [base, course] = id.split(':');
  const name = course ? THEME[course].name : '';
  switch (base) {
    case 'first3': return { chip: `<i class="dot" style="background:${THEME[course].color}"></i>3`, text: `${name}에 카드 3장을 먼저 (예약 포함)`, unit: '장' };
    case 'seq3': return { chip: '123', text: '한 코스에 숫자 3장 연속을 먼저 (예: 4·5·6)', unit: '장' };
    case 'wide3': return { chip: DOTS(3), text: '카드가 1장 이상 놓인 코스 3개를 먼저', unit: '코스' };
    case 'deep5': return { chip: '5장', text: '한 코스에 카드 5장을 먼저 (예약 포함)', unit: '장' };
    case 'lowhand': return { chip: '패↓', text: '마감 때 손패 숫자 합이 가장 작은 사람', unit: '' };
    case 'mostcourses': return { chip: '코스↑', text: '마감 때 카드가 1장 이상 놓인 코스가 더 많은 사람', unit: '코스' };
    case 'bestplain': return { chip: '점↑', text: '마감 때 예약 손님 없는 코스의 최고 점수가 더 높은 사람', unit: '점' };
    default: return { chip: '?', text: id, unit: '' };
  }
}
