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

- 가로형 전용: 모든 크기가 `--u`(화면 단위) 기준이라 폰 가로(844×390)와 PC에서 같은 구조로 보인다. 세로로 든 폰에서는 안내 없이 화면 전체(`#stage`)를 90도 눕혀 가로 디자인 그대로 보여 준다(`style.css` 맨 아래). 이때는 좌표 계산이 필요한 카드 이동 연출을 건너뛴다.
- 글씨는 Pretendard 400 한 가지만 쓴다. 둥글기는 6px 안팎이고, 글자는 최소로 줄였다(코스 이름, 예약 글자 없음).
- 예약은 예약 손님 그림과 `×2`, 코스 줄에는 지금 배수(`×2`, `×3`)로 나타낸다.
- 밤 풍경(`scene.js`): 문 닫기 직전의 식당 거리. 별 반짝임, 창문 불빛, 굴뚝 연기, 마감 팻말 흔들림은 CSS 움직임이고, 움직임 줄이기 설정을 켜면 모두 꺼진다.
- 규칙 보기는 표지 오른쪽 위 `?`, 대결 화면 왼쪽 아래 `?`에서 연다.
- 디자인 시안은 `docs/`가 아니라 Claude 디자인 캔버스에서 관리했다(이 저장소에는 없음).

## 6코스와 심사위원 과제 (v3)

- 시작할 때 **5코스(기본)** 와 **6코스(확장)** 중에 고른다. 5코스는 기본 규칙(카드 60장)이고, 6코스는 면(보라색)과 심사위원 과제가 더해진다(카드 72장).
- 심사위원 과제는 6코스에서만 판마다 5장이 공개되고, 채우면 한 장당 +10점이다. 마감 때 비교하는 과제는 동점이면 아무도 받지 못한다.
- 자세한 규칙은 `docs/rules-v2.md`.
- 서버(`server/`)가 과제 판정을 하므로, 온라인 모드에서 쓰려면 Worker를 다시 배포해야 한다.

## 아이콘, 공유 미리보기, 검색 정보

- 파비콘은 마감 식당 차양(5코스 색 줄무늬 + 불 켜진 문과 빨간 마감 점)이다. 글자는 넣지 않았다. `favicon.svg`, `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`(홈 화면), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.
- 공유 이미지는 `og.png`(1200×630, 밤 풍경 + 제목). 카카오톡, 페이스북, 슬랙, 트위터 미리보기에 쓰인다.
- `index.html`에 제목, 설명, canonical, Open Graph, Twitter 카드, 구조화 데이터(JSON-LD, VideoGame), 홈 화면용 `manifest.webmanifest`(가로 고정, 남색 배경)가 들어 있다. 자바스크립트를 실행하지 못하는 검색 로봇을 위해 같은 내용의 소개 글도 `#app` 안에 둔다(게임이 시작되면 화면으로 바뀐다).
- 다시 만들 때: `tools/make-assets.mjs`(사용법은 파일 맨 위). 주소(`jicongjy.github.io/games/hansang/`)가 바뀌면 `index.html`의 canonical, og:url, og:image, JSON-LD를 같이 고쳐야 한다.
- `robots.txt`, `sitemap.xml`은 도메인 맨 위(`jicongjy.github.io/`)에만 둘 수 있어서 이 저장소에는 없다.

## 판 시작 소개와 코스 수 설명

- (6코스) 판이 시작되면 심사위원 과제 5장이 화면 가득 소개되고, `시작` 버튼이나 화면을 누르거나 6.5초가 지나면 왼쪽 레일의 칩 자리로 날아 들어간다(`game.js`의 `introHtml`, `dismissIntro`). 한 기기 모드는 첫 가림 화면을 넘긴 뒤에, 온라인은 판이 막 시작했을 때(`isFresh`)만 보여 주고 새로고침으로 중간에 들어오면 건너뛴다.
- 시작 설정 화면의 `5코스 · 기본` / `6코스 · 확장` 선택 아래에 두 모드의 차이를 한 줄로 보여 준다(`기본 규칙 · 카드 60장`, `면, 심사위원 과제 추가 · 카드 72장`).
- 과제 소개 카드는 식당 주문서 모양(핀으로 건 종이, 찢긴 아랫단, `+10` 도장)이다.

## 점수는 직접 계산한다

- 오프라인 게임처럼, 진행 중에는 점수를 자동으로 보여 주지 않는다. 코스 줄과 상대 칩에는 마지막 숫자, 예약 배수(`×2`), 카드 장수(칸 하나가 카드 한 장, 속이 빈 칸은 예약 손님)만 나온다. 낸 카드의 숫자는 코스를 눌러 확인하고 합계는 직접 계산한다.
- 마감 때 결과 화면에서만 코스별 점수와 승패를 보여 준다. 과제를 채운 것은 앱이 판정하고, 숫자 합이 필요한 과제(`패↓`, `합↑`)의 진행 숫자는 감춘다.
- 서버가 보내는 상태에는 점수가 그대로 들어 있지만(`viewFor`의 `scores`) 화면에서 쓰지 않는다. 진짜로 숨겨야 한다면 서버에서 마감 전에는 빼야 한다.
