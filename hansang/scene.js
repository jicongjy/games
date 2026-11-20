// 밤 풍경: 문 닫기 직전의 식당 거리. 표지, 대기, 결과 화면의 배경으로 쓴다.
// 움직임(별 반짝임, 창문 불빛, 굴뚝 연기, 마감 팻말 흔들림)은 style.css의 .scene 규칙이 맡는다.

const STARS = [
  [60, 60, 2], [150, 140, 1.5], [240, 40, 2.5], [330, 200, 1.5], [420, 90, 2], [510, 30, 1.5], [590, 170, 2],
  [700, 70, 2.5], [780, 150, 1.5], [860, 40, 2], [940, 110, 1.5], [1010, 50, 2.5], [1120, 150, 2], [1200, 60, 1.5],
  [1240, 210, 2], [90, 290, 1.5], [300, 330, 2], [480, 280, 1.5], [660, 320, 2],
];

const stars = STARS.map(([x, y, r], i) => (
  `<circle class="star" cx="${x}" cy="${y}" r="${r}" fill="#FFE9B8" style="animation-delay:${((i * 0.37) % 3).toFixed(2)}s;animation-duration:${(2.4 + (i % 4) * 0.7).toFixed(1)}s"/>`
)).join('');

const AWNING = ['#A5CF4A', '#F28C28', '#2F5FD0', '#E0402F', '#F2A7C0'];
const awning = Array.from({ length: 10 }, (_, i) => {
  const c = AWNING[i % 5];
  const x = 10 + i * 38;
  return `<rect x="${x}" y="52" width="38" height="50" fill="${c}"/><circle cx="${x + 19}" cy="102" r="19" fill="${c}"/>`;
}).join('');

export function nightScene() {
  return `<svg class="scene" viewBox="0 0 1280 800" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1024"/><stop offset=".6" stop-color="#1d2748"/><stop offset="1" stop-color="#34406b"/></linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#FFD23F" stop-opacity=".4"/><stop offset="1" stop-color="#FFD23F" stop-opacity="0"/></radialGradient>
    <radialGradient id="moonglow"><stop offset="0" stop-color="#FFE9B8" stop-opacity=".22"/><stop offset="1" stop-color="#FFE9B8" stop-opacity="0"/></radialGradient>
    <radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
  </defs>
  <rect width="1280" height="800" fill="url(#sky)"/>
  ${stars}
  <mask id="crescent"><rect x="1000" y="200" width="200" height="200" fill="#fff"/><circle cx="1178" cy="286" r="38" fill="#000"/></mask>
  <circle cx="1150" cy="300" r="110" fill="url(#moonglow)"/>
  <circle cx="1150" cy="300" r="44" fill="#FFE9B8" mask="url(#crescent)"/>

  <rect x="0" y="610" width="90" height="100" fill="#161c38"/><rect x="90" y="560" width="70" height="150" fill="#1a2140"/>
  <rect x="160" y="630" width="60" height="80" fill="#161c38"/><rect x="220" y="590" width="100" height="120" fill="#1a2140"/>
  <rect x="320" y="645" width="80" height="65" fill="#161c38"/><rect x="400" y="600" width="90" height="110" fill="#1a2140"/>
  <rect x="490" y="640" width="70" height="70" fill="#161c38"/><rect x="1180" y="600" width="100" height="110" fill="#1a2140"/>
  <rect x="1140" y="650" width="50" height="60" fill="#161c38"/>
  <rect class="blink" x="106" y="580" width="6" height="8" fill="#FFD23F" opacity=".55"/><rect class="blink d2" x="126" y="620" width="6" height="8" fill="#FFD23F" opacity=".4"/>
  <rect class="blink d3" x="240" y="610" width="6" height="8" fill="#FFD23F" opacity=".5"/><rect class="blink" x="280" y="640" width="6" height="8" fill="#FFD23F" opacity=".35"/>
  <rect class="blink d2" x="420" y="620" width="6" height="8" fill="#FFD23F" opacity=".5"/><rect class="blink d3" x="1210" y="625" width="6" height="8" fill="#FFD23F" opacity=".5"/>
  <rect x="0" y="700" width="1280" height="100" fill="#0f1329"/><rect x="0" y="700" width="1280" height="10" fill="#1c2240"/>

  <polygon points="612,486 628,486 700,700 540,700" fill="#FFD23F" opacity=".06"/>
  <rect x="616" y="474" width="8" height="226" fill="#0a0e20"/><rect x="596" y="462" width="48" height="10" rx="3" fill="#0a0e20"/>
  <circle class="lamp" cx="620" cy="480" r="80" fill="url(#glow)"/><circle cx="620" cy="480" r="9" fill="#FFD23F"/>

  <g transform="translate(700 346) scale(1.1)">
    <rect x="310" y="18" width="26" height="46" fill="#2a2f4d"/>
    <path class="smoke" d="M323 12C310 0 336 -10 323 -24C314 -34 330 -42 322 -52" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path class="smoke s2" d="M338 6C328 -6 348 -14 338 -26" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path class="smoke s3" d="M316 10C306 -2 326 -12 316 -22" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>

    <rect x="20" y="96" width="360" height="226" fill="#3b4166"/>
    <rect x="130" y="8" width="140" height="32" rx="3" fill="#14182e"/><rect x="130" y="8" width="140" height="32" rx="3" fill="none" stroke="#FFD23F" stroke-width="1.5" opacity=".8"/>
    <text class="sign" x="200" y="30" text-anchor="middle" font-size="17" fill="#FFE9B8" font-family="Pretendard Variable, sans-serif" letter-spacing="4">한 상</text>
    ${awning}

    <g class="win"><rect x="24" y="120" width="132" height="132" fill="#FFD23F" opacity=".14"/><rect x="244" y="120" width="132" height="132" fill="#FFD23F" opacity=".14"/></g>
    <rect x="40" y="136" width="100" height="100" fill="#FFE9B8"/><rect x="40" y="136" width="100" height="100" fill="none" stroke="#14182e" stroke-width="4"/>
    <line x1="90" y1="136" x2="90" y2="236" stroke="#14182e" stroke-width="3"/><circle cx="65" cy="158" r="7" fill="#FFD23F"/><line x1="65" y1="136" x2="65" y2="151" stroke="#5A2A10" stroke-width="2"/>
    <line x1="46" y1="206" x2="134" y2="206" stroke="#5A2A10" stroke-width="5"/><path d="M104 206V186H120V206Z" fill="#5A2A10"/>
    <line x1="52" y1="206" x2="52" y2="230" stroke="#5A2A10" stroke-width="4"/><line x1="128" y1="206" x2="128" y2="230" stroke="#5A2A10" stroke-width="4"/>
    <rect x="260" y="136" width="100" height="100" fill="#FFE9B8"/><rect x="260" y="136" width="100" height="100" fill="none" stroke="#14182e" stroke-width="4"/>
    <line x1="310" y1="136" x2="310" y2="236" stroke="#14182e" stroke-width="3"/>
    <path d="M278 206A14 14 0 0 1 306 206Z" fill="#F28C28"/><path d="M316 206A14 14 0 0 1 344 206Z" fill="#E0402F"/>
    <line x1="266" y1="206" x2="354" y2="206" stroke="#5A2A10" stroke-width="5"/><circle cx="335" cy="160" r="7" fill="#FFD23F"/><line x1="335" y1="136" x2="335" y2="153" stroke="#5A2A10" stroke-width="2"/>

    <rect x="160" y="138" width="80" height="184" fill="#5A2A10"/><rect x="170" y="150" width="60" height="76" fill="#FFE9B8"/>
    <rect x="170" y="150" width="60" height="76" fill="none" stroke="#14182e" stroke-width="3"/><circle cx="226" cy="262" r="4" fill="#FFD23F"/>
    <g class="tag-sign"><line x1="200" y1="150" x2="200" y2="176" stroke="#fff" stroke-width="1.5"/><circle cx="200" cy="200" r="24" fill="#E0402F"/>
    <text x="200" y="206" text-anchor="middle" font-size="16" fill="#fff" font-family="Pretendard Variable, sans-serif">마감</text></g>
    <circle class="lamp" cx="200" cy="120" r="26" fill="url(#glow)"/><circle cx="200" cy="120" r="6" fill="#FFD23F"/>
    <ellipse cx="200" cy="326" rx="110" ry="9" fill="#FFD23F" opacity=".22"/>
  </g>
  <rect width="1280" height="800" fill="url(#vig)"/>
</svg>`;
}
