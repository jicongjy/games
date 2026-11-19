// 카드 표시용 데이터: 코스 이름, 색, 단계 이름, 아이콘(SVG), 예약 문구
// 모든 그림은 이 파일에서 직접 만든 도형이다. 외부 이미지를 쓰지 않는다.

export const THEME = {
  ban: { name: '밑반찬', color: '#A5CF4A', ink: '#1a1a1a' },
  guk: { name: '국·탕', color: '#F28C28', ink: '#1a1a1a' },
  fish: { name: '생선구이', color: '#2F5FD0', ink: '#ffffff' },
  meat: { name: '불고기', color: '#E0402F', ink: '#ffffff' },
  sweet: { name: '후식', color: '#F2A7C0', ink: '#1a1a1a' },
};

export const STEP_NAMES = {
  ban: { 2: '다듬기', 3: '씻기', 4: '데치기', 5: '찬물에 헹구기', 6: '물기 짜기', 7: '양념 만들기', 8: '조물조물 무치기', 9: '참기름 한 방울', 10: '깨 솔솔' },
  guk: { 2: '재료 씻기', 3: '무 썰기', 4: '멸치 육수 내기', 5: '고기 볶기', 6: '한소끔 끓이기', 7: '국간장 간 맞추기', 8: '대파 송송 얹기', 9: '뚝배기에 옮기기', 10: '팔팔 끓여 내기' },
  fish: { 2: '비늘 긁기', 3: '내장 손질', 4: '소금 뿌리기', 5: '물기 닦기', 6: '석쇠 달구기', 7: '앞면 굽기', 8: '뒤집기', 9: '껍질 바삭하게', 10: '접시에 올리기' },
  meat: { 2: '핏물 빼기', 3: '얇게 썰기', 4: '양념장 만들기', 5: '재워 두기', 6: '채소 썰기', 7: '팬 달구기', 8: '센 불에 볶기', 9: '국물 자작하게 졸이기', 10: '깨 뿌려 내기' },
  sweet: { 2: '밀가루 체치기', 3: '참기름 섞기', 4: '반죽하기', 5: '모양 내기', 6: '기름 온도 맞추기', 7: '튀기기', 8: '조청 시럽 끓이기', 9: '꿀에 담그기', 10: '잣 올려 내기' },
};

export const RESERVE_TEXT = {
  ban: '나물 한 접시, 오늘 책임져 주세요',
  guk: '뜨끈한 국물, 오늘 책임져 주세요',
  fish: '노릇한 생선 한 마리, 오늘 책임져 주세요',
  meat: '달큰한 불고기, 오늘 책임져 주세요',
  sweet: '달콤한 마무리, 오늘 책임져 주세요',
};

export const cardTitle = (card) => (card.step === 0 ? '단골 예약' : STEP_NAMES[card.course][card.step]);

const ICONS = {
  ban: `<path d="M100 18C150 58 150 140 100 182C50 140 50 58 100 18Z" fill="#1F5A2A"/><path d="M62 120C30 100 22 62 40 40C70 54 80 90 62 120Z" fill="#2F7A3A"/><path d="M138 120C170 100 178 62 160 40C130 54 120 90 138 120Z" fill="#2F7A3A"/><path d="M100 40V170" stroke="#A5CF4A" stroke-width="6" stroke-linecap="round"/>`,
  guk: `<circle cx="70" cy="34" r="12" fill="#FFF1DC"/><circle cx="104" cy="22" r="9" fill="#FFF1DC"/><circle cx="134" cy="38" r="12" fill="#FFF1DC"/><rect x="30" y="72" width="140" height="16" rx="8" fill="#5A2A10"/><path d="M42 92H158V130C158 160 136 182 100 182C64 182 42 160 42 130Z" fill="#5A2A10"/><circle cx="26" cy="108" r="10" fill="#5A2A10"/><circle cx="174" cy="108" r="10" fill="#5A2A10"/>`,
  fish: `<polygon points="146,100 192,64 192,136" fill="#fff"/><ellipse cx="90" cy="100" rx="64" ry="40" fill="#fff"/><circle cx="58" cy="90" r="6" fill="#2F5FD0"/><path d="M96 70Q112 100 96 130M118 74Q132 100 118 126" stroke="#2F5FD0" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  meat: `<path d="M100 14C112 56 158 76 152 132C147 168 124 188 100 188C76 188 53 168 48 132C44 102 68 92 76 62C88 74 94 48 100 14Z" fill="#FFD23F"/><path d="M100 98C108 120 128 128 126 152C124 168 112 176 100 176C88 176 76 168 74 152C72 132 94 124 100 98Z" fill="#FFF1DC"/>`,
  sweet: `<rect x="30" y="30" width="140" height="140" rx="34" fill="#8A4B1F"/><rect x="52" y="52" width="96" height="96" rx="22" fill="none" stroke="#F5D9A8" stroke-width="5"/><circle cx="100" cy="100" r="14" fill="#F5D9A8"/><circle cx="72" cy="72" r="6" fill="#F5D9A8"/><circle cx="128" cy="72" r="6" fill="#F5D9A8"/><circle cx="72" cy="128" r="6" fill="#F5D9A8"/><circle cx="128" cy="128" r="6" fill="#F5D9A8"/>`,
};

const BURST = '100,8 118,44 152,24 150,64 190,66 166,98 198,124 158,134 168,174 130,162 116,196 100,164 84,196 70,162 32,174 42,134 2,124 34,98 10,66 50,64 48,24 82,44';

export function iconSvg(card) {
  if (card.step === 0) {
    const t = THEME[card.course];
    return `<svg viewBox="0 0 200 200" aria-hidden="true"><polygon points="${BURST}" fill="${t.color}"/><text x="100" y="112" text-anchor="middle" font-size="${t.name.length > 3 ? 28 : 34}" font-weight="900" fill="${t.ink}" font-family="inherit">${t.name}</text></svg>`;
  }
  return `<svg viewBox="0 0 200 200" aria-hidden="true">${ICONS[card.course]}</svg>`;
}

// 코스 줄과 좌판에서 쓰는 코스 아이콘 (카드와 같은 그림)
export const courseIcon = (course) => `<svg viewBox="0 0 200 200" aria-hidden="true">${ICONS[course]}</svg>`;
