# 차려내라! 한 상

마감 전에 두 요리사가 같은 시장 재료로 5개 코스를 차려내는 2인 실시간 웹 카드게임.

- 상태: 한 기기 모드와 온라인 2인 모드 구현 완료. 화면은 밤 분위기의 가로형(폰 가로 화면, PC)이다. 온라인 서버는 Cloudflare에 배포됨(`wss://hansang.hansang-server.workers.dev`, `config.js`의 `SERVER_URL`).
- 기획서: `docs/plan.md`
- 카드 디자인 시안: `docs/card-sample.png` (원본 `docs/card-sample.html`)
- localStorage 키는 `hansang:키` 형식을 쓴다.
- 규칙 엔진: `engine/rules.js` (화면, 서버, 테스트가 같이 씀). 테스트는 `cd hansang && npm test` (Node 20 이상, 빌드 없음).
- 화면: `index.html`, `style.css`, `game.js`, `cards-data.js`(코스 이름, 색, 단계 이름, 아이콘). 폰트는 Pretendard(jsDelivr 고정 버전). 차례가 바뀔 때마다 가림 화면이 나와서 상대 패가 보이지 않는다.
- 화면 구조: 상단 한 줄(마감 장수, 내 차례와 할 일, 점수), 상대 코스 요약, 시장 좌판, 내 코스 요약(탭하면 낸 카드와 점수 계산), 하단 고정 손패.
- 로컬 실행: `cd hansang && python3 -m http.server 8000` 후 http://localhost:8000 (ES module이라 file://로는 안 열린다).

## 온라인 서버 (`server/`)

- 구조: Cloudflare Workers + Durable Objects. 방 코드 하나가 객체 하나이고, 덱과 패와 규칙 판정은 서버가 한다. 각 접속자에게는 내 패, 상대 패 장수, 창고 남은 장수만 보낸다.
- `server/src/room-logic.js`: 방 상태와 규칙 처리(Cloudflare와 무관, Node 테스트 가능), `server/src/index.js`: Worker와 Durable Object 연결부
- 테스트: `cd hansang && npm test` (규칙 엔진 + 방 로직)
- 로컬 실행: `cd hansang/server && npm install && npx wrangler dev` (8787 포트), 다른 터미널에서 `python3 -m http.server 8000`을 `hansang/`에서 실행하고 `http://localhost:8000` 접속. localhost에서는 자동으로 `ws://localhost:8787`에 붙는다.
- 통합 확인: `node server/integration.mjs ws://localhost:8787` (두 클라이언트가 한 판을 끝까지 둠)
- 배포: `cd hansang/server && npx wrangler login && npx wrangler deploy`. 나온 주소(`https://hansang.<계정>.workers.dev`)를 `wss://`로 바꿔 `config.js`의 `SERVER_URL`에 넣는다. `wrangler.toml`의 `ALLOWED_ORIGINS`에는 게임을 서비스하는 주소(GitHub Pages)가 들어 있다.
- 방은 6시간 동안 아무 일이 없으면 삭제된다. 무료 요금제 한도는 Cloudflare 요금 문서를 확인한다.

## 화면과 디자인 (v2)

- 가로형 전용: 모든 크기가 `--u`(화면 단위) 기준이라 폰 가로(844×390)와 PC에서 같은 구조로 보인다. 세로로 들면 "폰을 가로로 돌려 주세요" 안내가 뜬다(`index.html`의 `.rotate`).
- 글씨는 Pretendard 400 한 가지만 쓴다. 둥글기는 6px 안팎이고, 글자는 최소로 줄였다(코스 이름, 예약 글자 없음).
- 예약은 예약 손님 그림과 `×2`, 코스 줄에는 지금 배수(`×2`, `×3`)로 나타낸다.
- 밤 풍경(`scene.js`): 문 닫기 직전의 식당 거리. 별 반짝임, 창문 불빛, 굴뚝 연기, 마감 팻말 흔들림은 CSS 움직임이고, 움직임 줄이기 설정을 켜면 모두 꺼진다.
- 규칙 보기는 표지 오른쪽 위 `?`, 대결 화면 왼쪽 아래 `?`에서 연다.
- 디자인 시안은 `docs/`가 아니라 Claude 디자인 캔버스에서 관리했다(이 저장소에는 없음).

## 6코스와 심사위원 과제 (v3)

- 시작할 때 5코스/6코스를 고른다. 6코스는 면(보라색)이 더해지고 카드 72장이 된다.
- 판마다 심사위원 과제 5장이 공개되고, 채우면 한 장당 +10점이다. 마감 때 비교하는 과제는 동점이면 아무도 받지 못한다.
- 자세한 규칙은 `docs/rules-v2.md`.
- 서버(`server/`)가 과제 판정을 하므로, 온라인 모드에서 쓰려면 Worker를 다시 배포해야 한다.
