# 차려내라! 한 상

마감 전에 두 요리사가 같은 시장 재료로 5개 코스를 차려내는 2인 실시간 웹 카드게임.

- 상태: 규칙 엔진 완료, 화면과 서버는 아직
- 기획서: `docs/plan.md`
- 카드 디자인 시안: `docs/card-sample.png` (원본 `docs/card-sample.html`)
- localStorage 키는 `hansang:키` 형식을 쓴다.
- 규칙 엔진: `engine/rules.js` (화면, 서버, 테스트가 같이 씀). 테스트는 `cd hansang && npm test` (Node 20 이상, 빌드 없음).
