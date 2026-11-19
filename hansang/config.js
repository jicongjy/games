// 온라인 서버 주소. Cloudflare Worker를 배포한 뒤 아래 값을 배포된 주소로 바꾼다.
// 예: 'wss://hansang.내계정.workers.dev'
export const SERVER_URL = '';

// 같은 컴퓨터에서 개발할 때는 `wrangler dev`의 주소(8787)를 자동으로 쓴다.
export function serverUrl() {
  const h = typeof location !== 'undefined' ? location.hostname : '';
  if (h === 'localhost' || h === '127.0.0.1') return 'ws://localhost:8787';
  return SERVER_URL;
}
