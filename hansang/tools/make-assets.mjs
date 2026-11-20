// 파비콘, 홈 화면 아이콘, 공유 이미지(og.png)를 favicon.svg와 scene.js에서 다시 만드는 도구.
// 사용법: node tools/make-assets.mjs <hansang 폴더 경로> <임시 폴더 경로> <PretendardVariable.woff2 경로>
// playwright가 설치돼 있어야 한다. 폰트는 npm 패키지 pretendard에 들어 있다.
import { chromium } from 'playwright';
import fs from 'node:fs';

const [root, tmp, fontPath] = process.argv.slice(2);
const svg = fs.readFileSync(`${root}/favicon.svg`, 'utf8');
const inner = svg.replace(/^[\s\S]*?<rect width="64" height="64" rx="8" fill="#0b1024"\/>/, '').replace(/<\/svg>\s*$/, '');
const solid = (scale) => {
  const t = (64 - 64 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0b1024"/><g transform="translate(${t} ${t}) scale(${scale})">${inner}</g></svg>`;
};
const { nightScene } = await import(`file://${root}/scene.js`);

const b = await chromium.launch();
async function shot(markup, w, h, file, transparent = false) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${w}px;height:${h}px}</style>${markup}`);
  await p.screenshot({ path: file, omitBackground: transparent });
  await p.close();
}
for (const n of [16, 32, 48]) await shot(svg, n, n, `${tmp}/f${n}.png`, true);
fs.copyFileSync(`${tmp}/f32.png`, `${root}/favicon-32.png`);
await shot(solid(0.76), 180, 180, `${root}/apple-touch-icon.png`);
await shot(solid(0.76), 192, 192, `${root}/icon-192.png`);
await shot(solid(0.76), 512, 512, `${root}/icon-512.png`);
await shot(solid(0.6), 512, 512, `${root}/icon-maskable-512.png`); // 가장자리가 잘려도 안전한 영역 안에 그림을 둔다

// favicon.ico: 16, 32, 48 PNG를 담는다
const pngs = [16, 32, 48].map((n) => ({ n, data: fs.readFileSync(`${tmp}/f${n}.png`) }));
const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
let offset = 6 + 16 * pngs.length;
const dirs = pngs.map(({ n, data }) => {
  const d = Buffer.alloc(16);
  d.writeUInt8(n, 0); d.writeUInt8(n, 1); d.writeUInt8(0, 2); d.writeUInt8(0, 3);
  d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6); d.writeUInt32LE(data.length, 8); d.writeUInt32LE(offset, 12);
  offset += data.length;
  return d;
});
fs.writeFileSync(`${root}/favicon.ico`, Buffer.concat([head, ...dirs, ...pngs.map((x) => x.data)]));

// OG 이미지 1200x630: 밤 풍경 위에 제목
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:P;src:url(file://${fontPath}) format('woff2');font-weight:45 920}
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b1024;font-family:P,sans-serif;font-weight:400;color:#FFF1DC}
.scene{position:absolute;inset:0;width:1200px;height:630px}.smoke{opacity:.22}
.t{position:absolute;left:84px;top:96px}
h1{margin:0;font-size:112px;line-height:1.08;letter-spacing:-.03em;font-weight:400;text-shadow:0 0 10px rgba(255,210,63,.65),0 0 44px rgba(255,210,63,.4)}
p{margin:22px 0 0;font-size:34px;color:#aeb6d6}
.chips{position:absolute;left:84px;bottom:58px;display:flex;gap:14px}
.chips span{font-size:25px;padding:10px 18px;border:1px solid rgba(255,241,220,.5);border-radius:6px;background:rgba(11,16,36,.55)}
</style>${nightScene()}
<div class="t"><h1>차려내라!<br>한 상</h1><p>마감 전에 한 상, 2인 카드게임</p></div>
<div class="chips"><span>온라인 2인</span><span>5코스 · 6코스</span><span>심사위원 과제</span></div>`;
fs.writeFileSync(`${tmp}/og.html`, html);
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto(`file://${tmp}/og.html`);
await p.waitForTimeout(400);
await p.screenshot({ path: `${root}/og.png` });
await p.close();

// 비교 시트
const b64 = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
const row = (bg, fg) => `<div style="font:14px sans-serif;display:flex;gap:28px;align-items:center;padding:20px 24px;background:${bg};color:${fg}">
  <div><div>16px</div><img src="${b64(`${tmp}/f16.png`)}" width="16" height="16"></div>
  <div><div>32px</div><img src="${b64(`${tmp}/f32.png`)}" width="32" height="32"></div>
  <div><div>16 x8</div><img src="${b64(`${tmp}/f16.png`)}" width="128" height="128" style="image-rendering:pixelated"></div>
  <div><div>32 x4</div><img src="${b64(`${tmp}/f32.png`)}" width="128" height="128" style="image-rendering:pixelated"></div>
  <div><div>홈 화면 180</div><img src="${b64(`${root}/apple-touch-icon.png`)}" width="128" height="128" style="border-radius:28px"></div>
</div>`;
const sp = await b.newPage({ viewport: { width: 760, height: 380 } });
await sp.setContent(row('#dee1e6', '#222') + row('#202124', '#eee'));
await sp.screenshot({ path: `${tmp}/preview.png` });
await b.close();
console.log(fs.readdirSync(root).filter((f) => /\.(png|ico|svg)$/.test(f)).map((f) => `${f} ${fs.statSync(`${root}/${f}`).size}B`).join('\n'));
