# 차려내라! 한 상

마감 전에 두 요리사가 같은 시장 재료로 5개 코스를 차려내는 2인 실시간 웹 카드게임.

- 상태: 한 기기에서 둘이 번갈아 두는 버전 완료. 실시간 서버 연결은 아직
- 기획서: `docs/plan.md`
- 카드 디자인 시안: `docs/card-sample.png` (원본 `docs/card-sample.html`)
- localStorage 키는 `hansang:키` 형식을 쓴다.
- 규칙 엔진: `engine/rules.js` (화면, 서버, 테스트가 같이 씀). 테스트는 `cd hansang && npm test` (Node 20 이상, 빌드 없음).
- 화면: `index.html`, `style.css`, `game.js`, `cards-data.js`(코스 이름, 색, 단계 이름, 아이콘). 폰트는 Pretendard(jsDelivr 고정 버전). 차례가 바뀔 때마다 가림 화면이 나와서 상대 패가 보이지 않는다.
- 화면 구조: 상단 한 줄(마감 장수, 내 차례와 할 일, 점수), 상대 코스 요약, 시장 좌판, 내 코스 요약(탭하면 낸 카드와 점수 계산), 하단 고정 손패.
- 로컬 실행: `cd hansang && python3 -m http.server 8000` 후 http://localhost:8000 (ES module이라 file://로는 안 열린다).
