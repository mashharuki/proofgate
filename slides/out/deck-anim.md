---
marp: true
theme: minorun-dark
paginate: true
transition: fade
---

<style>
/* 章の名札は右上に小さく置く。 */
header {
  position: absolute;
  top: 22px;
  left: auto;
  right: 72px;
  font-size: 17pt;
  color: #7fe3f5;
  letter-spacing: 0.08em;
}
/* 図が主役のスライド。見出しの下の空きの中央に大きく置く。 */
section.image-full {
  padding-top: 2.6rem;
}
section.image-full p:has(img),
section.image-full .fig {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 450px;
  margin: 0;
}
section.image-full img {
  max-height: none;
}
section.image-full .fig svg {
  display: block;
  width: var(--w, 1180px);
  height: auto;
}
section.image-full .lead {
  margin: 0 0 20px;
  text-align: left;
  color: #ffffff;
  font-size: 24pt;
}
/* 表紙。関門のイラスト、題名、帯の中の副題を、帯の境目にまたがらせない。 */
section.top h1 {
  position: absolute;
  top: 215px;
  left: 0;
  right: 0;
}
section.top p {
  position: absolute;
  top: 520px;
  left: 0;
  right: 0;
}
section.top p:has(img) {
  top: 40px;
}
section.top .fig {
  position: absolute;
  top: 40px;
  left: 50%;
  margin-left: -110px;
  width: 220px;
}
/* 補足スライド。表は地を塗らず、罫だけ。 */
section.appendix table { display:table !important; width:100% !important; border-collapse:collapse !important; background:transparent !important; border:none !important; margin-top:36px; }
section.appendix table thead, section.appendix table tbody, section.appendix table tr { background:transparent !important; border:none !important; }
section.appendix table th { background:transparent !important; color:#a09aa4 !important; font-weight:600; font-size:18pt; letter-spacing:.06em; text-align:left; padding:0 .7em .55em; border:none !important; border-bottom:1px solid #3a3640 !important; }
section.appendix table td { background:transparent !important; color:#e9e6ec !important; font-size:20pt; padding:.7em .7em; line-height:1.4; border:none !important; border-bottom:1px solid #221f28 !important; white-space:nowrap; }
section.appendix table tr:last-child td { border-bottom:none !important; }
section.appendix table td:first-child { color:#7fe3f5 !important; font-weight:700; font-family:'SF Mono',Menlo,monospace; }
section.appendix table tr:nth-child(2) td { background:rgba(255,226,120,.12) !important; }
</style>
<!-- _class: top -->
<!-- _paginate: false -->

<div class="fig" style="--w:220px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 180" width="220" height="180" font-family="'Hiragino Maru Gothic ProN','Zen Maru Gothic','Hiragino Sans',sans-serif"><defs><linearGradient id="cv-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2c35"/><stop offset="1" stop-color="#18181e"/></linearGradient><marker id="cv-ar-g" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#a09aa4"/></marker><marker id="cv-ar-r" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ff6b7d"/></marker><marker id="cv-ar-c" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#00c4e4"/></marker><marker id="cv-ar-ok" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#3ddc97"/></marker><marker id="cv-ar-a" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ffb020"/></marker></defs><style>
.fx{transform-box:fill-box;transform-origin:center}
.hold{opacity:0}
@keyframes pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes holdout{0%{opacity:1}99%{opacity:1}100%{opacity:0}}
@keyframes arm{from{transform:rotate(-78deg)}to{transform:rotate(0)}}
@keyframes mag{0%{transform:translateY(-180px)}35%{transform:translateY(-180px)}60%{transform:translateY(-90px)}85%,100%{transform:translateY(0)}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .grow{animation:grow .9s cubic-bezier(.2,.8,.2,1) var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
.grow{transform-box:fill-box;transform-origin:0% 50%}
</style><g class="fx pop" style="--d:0.2s"><rect x="30" y="10" width="160" height="160" rx="32" fill="#00788c"/><rect x="58" y="44" width="14" height="92" rx="5" fill="#ffffff"/><rect x="148" y="44" width="14" height="92" rx="5" fill="#ffffff"/></g><g class="fx arm" style="--d:0.9s"><rect x="65" y="80" width="90" height="16" rx="6" fill="#ff6b7d"/></g></svg></div>

# ProofGate

synthで止める、権限昇格の道

---

<!-- _class: image-full -->
<!-- _header: 課題 -->

# 1つずつ見ればふつうの権限

<div class="fig" style="--w:1180px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 390" width="1180" height="390" font-family="'Hiragino Maru Gothic ProN','Zen Maru Gothic','Hiragino Sans',sans-serif"><defs><linearGradient id="od-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2c35"/><stop offset="1" stop-color="#18181e"/></linearGradient><marker id="od-ar-g" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#a09aa4"/></marker><marker id="od-ar-r" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ff6b7d"/></marker><marker id="od-ar-c" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#00c4e4"/></marker><marker id="od-ar-ok" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#3ddc97"/></marker><marker id="od-ar-a" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ffb020"/></marker></defs><style>
.fx{transform-box:fill-box;transform-origin:center}
.hold{opacity:0}
@keyframes pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes holdout{0%{opacity:1}99%{opacity:1}100%{opacity:0}}
@keyframes arm{from{transform:rotate(-78deg)}to{transform:rotate(0)}}
@keyframes mag{0%{transform:translateY(-180px)}35%{transform:translateY(-180px)}60%{transform:translateY(-90px)}85%,100%{transform:translateY(0)}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .grow{animation:grow .9s cubic-bezier(.2,.8,.2,1) var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
.grow{transform-box:fill-box;transform-origin:0% 50%}
</style><g class="fx pop" style="--d:0.3s"><rect x="10" y="12" width="350" height="72" rx="28" fill="url(#od-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(56 48.0) scale(0.7)"><circle cx="-14" cy="0" r="13" fill="none" stroke="#00c4e4" stroke-width="5"/><circle cx="-14" cy="0" r="3.5" fill="#00c4e4"/><rect x="-1" y="-3" width="35" height="6.5" rx="3" fill="#00c4e4"/><rect x="19" y="2" width="6" height="13" rx="2" fill="#00c4e4"/><rect x="29" y="2" width="6" height="9" rx="2" fill="#00c4e4"/></g><text x="98" y="57.0" font-size="26" font-weight="700" fill="#ffffff" text-anchor="start">ロールを渡せる</text><circle cx="324" cy="48.0" r="19" fill="#1f7a55"/><g transform="translate(324 48.0) scale(0.72)"><path d="M-16 2 L-5 14 L17 -13" fill="none" stroke="#ffffff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/></g></g><g class="fx pop" style="--d:0.8999999999999999s"><rect x="415" y="12" width="350" height="72" rx="28" fill="url(#od-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(461 48.0) scale(0.7)"><text x="0" y="19" font-size="58" font-weight="700" text-anchor="middle" fill="#00c4e4">λ</text></g><text x="503" y="57.0" font-size="26" font-weight="700" fill="#ffffff" text-anchor="start">関数を作れる</text><circle cx="729" cy="48.0" r="19" fill="#1f7a55"/><g transform="translate(729 48.0) scale(0.72)"><path d="M-16 2 L-5 14 L17 -13" fill="none" stroke="#ffffff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/></g></g><g class="fx pop" style="--d:1.5s"><rect x="820" y="12" width="350" height="72" rx="28" fill="url(#od-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(866 48.0) scale(0.7)"><ellipse cx="0" cy="-22" rx="28" ry="9" fill="none" stroke="#00c4e4" stroke-width="4.5"/><path d="M-28 -22 L-22 25 Q0 36 22 25 L28 -22" fill="none" stroke="#00c4e4" stroke-width="4.5" stroke-linejoin="round"/><path d="M-26 -3 Q0 9 26 -3" fill="none" stroke="#00c4e4" stroke-width="4"/></g><text x="908" y="57.0" font-size="26" font-weight="700" fill="#ffffff" text-anchor="start">S3を読み書き</text><circle cx="1134" cy="48.0" r="19" fill="#1f7a55"/><g transform="translate(1134 48.0) scale(0.72)"><path d="M-16 2 L-5 14 L17 -13" fill="none" stroke="#ffffff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/></g></g><g class="fx pop" style="--d:2.2s"><rect x="82.0" y="222.0" width="96" height="96" rx="19" fill="url(#od-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(130 270) scale(1.0)"><circle cx="0" cy="-15" r="12" fill="#ffffff"/><path d="M-25 27 C-25 6 -12 0 0 0 C12 0 25 6 25 27 Z" fill="#ffffff"/></g><text x="130" y="360" font-size="24" font-weight="600" fill="#ffffff" text-anchor="middle">DeveloperRole</text></g><g class="fx pop" style="--d:2.6500000000000004s"><rect x="382.0" y="222.0" width="96" height="96" rx="19" fill="url(#od-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(430 270) scale(1.0)"><text x="0" y="19" font-size="58" font-weight="700" text-anchor="middle" fill="#ffffff">λ</text></g><text x="430" y="360" font-size="24" font-weight="600" fill="#ffffff" text-anchor="middle">Lambda</text></g><g class="fx pop" style="--d:3.1s"><rect x="682.0" y="222.0" width="96" height="96" rx="19" fill="url(#od-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(730 270) scale(1.0)"><rect x="-24" y="-31" width="48" height="62" rx="9" fill="none" stroke="#ffffff" stroke-width="4.5"/><circle cx="0" cy="-12" r="7.5" fill="#ffffff"/><rect x="-14" y="3" width="28" height="5" rx="2.5" fill="#ffffff"/><rect x="-14" y="14" width="19" height="5" rx="2.5" fill="#ffffff"/></g><text x="730" y="360" font-size="24" font-weight="600" fill="#ffffff" text-anchor="middle">ProtectedDataRole</text></g><g class="fx pop" style="--d:3.5500000000000003s"><rect x="982.0" y="222.0" width="96" height="96" rx="19" fill="#b3263a" stroke="none" stroke-width="2"/><g transform="translate(1030 270) scale(1.0)"><ellipse cx="0" cy="-22" rx="28" ry="9" fill="none" stroke="#ffffff" stroke-width="4.5"/><path d="M-28 -22 L-22 25 Q0 36 22 25 L28 -22" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/><path d="M-26 -3 Q0 9 26 -3" fill="none" stroke="#ffffff" stroke-width="4"/></g><text x="1030" y="360" font-size="24" font-weight="600" fill="#ffffff" text-anchor="middle">S3バケット</text></g><g class="fx fade" style="--d:2.45s"><line x1="192" y1="270" x2="368" y2="270" stroke="#ff6b7d" stroke-width="6" stroke-linecap="round" marker-end="url(#od-ar-r)"/><text x="280.0" y="248" font-size="24" font-weight="700" fill="#ff6b7d" text-anchor="middle">渡す</text></g><g class="fx fade" style="--d:2.9000000000000004s"><line x1="492" y1="270" x2="668" y2="270" stroke="#ff6b7d" stroke-width="6" stroke-linecap="round" marker-end="url(#od-ar-r)"/><text x="580.0" y="248" font-size="24" font-weight="700" fill="#ff6b7d" text-anchor="middle">動かす</text></g><g class="fx fade" style="--d:3.35s"><line x1="792" y1="270" x2="968" y2="270" stroke="#ff6b7d" stroke-width="6" stroke-linecap="round" marker-end="url(#od-ar-r)"/><text x="880.0" y="248" font-size="24" font-weight="700" fill="#ff6b7d" text-anchor="middle">届く</text></g></svg></div>

---

<!-- _class: image-full -->
<!-- _header: 課題 -->

# 既存ツールの指摘はポリシー単位だった

<div class="fig" style="--w:1100px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -40 1180 490" width="1180" height="490" font-family="'Hiragino Maru Gothic ProN','Zen Maru Gothic','Hiragino Sans',sans-serif"><defs><linearGradient id="tl-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2c35"/><stop offset="1" stop-color="#18181e"/></linearGradient><marker id="tl-ar-g" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#a09aa4"/></marker><marker id="tl-ar-r" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ff6b7d"/></marker><marker id="tl-ar-c" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#00c4e4"/></marker><marker id="tl-ar-ok" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#3ddc97"/></marker><marker id="tl-ar-a" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ffb020"/></marker></defs><style>
.fx{transform-box:fill-box;transform-origin:center}
.hold{opacity:0}
@keyframes pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes holdout{0%{opacity:1}99%{opacity:1}100%{opacity:0}}
@keyframes arm{from{transform:rotate(-78deg)}to{transform:rotate(0)}}
@keyframes mag{0%{transform:translateY(-180px)}35%{transform:translateY(-180px)}60%{transform:translateY(-90px)}85%,100%{transform:translateY(0)}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .grow{animation:grow .9s cubic-bezier(.2,.8,.2,1) var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
.grow{transform-box:fill-box;transform-origin:0% 50%}
</style><g class="fx fade" style="--d:0.3s"><text x="40" y="68" font-size="30" font-weight="700" fill="#ffffff" text-anchor="start">cdk-nag</text></g><g class="fx pop" style="--d:0.4s" opacity="1"><rect x="522.0" y="20.0" width="76" height="76" rx="15" fill="url(#tl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(560 58) scale(0.7)"><circle cx="0" cy="-15" r="12" fill="#ffffff"/><path d="M-25 27 C-25 6 -12 0 0 0 C12 0 25 6 25 27 Z" fill="#ffffff"/></g></g><g class="fx pop" style="--d:0.4s" opacity="0.22"><rect x="682.0" y="20.0" width="76" height="76" rx="15" fill="url(#tl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(720 58) scale(0.7)"><text x="0" y="19" font-size="58" font-weight="700" text-anchor="middle" fill="#ffffff">λ</text></g></g><g class="fx pop" style="--d:0.4s" opacity="0.22"><rect x="842.0" y="20.0" width="76" height="76" rx="15" fill="url(#tl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(880 58) scale(0.7)"><rect x="-24" y="-31" width="48" height="62" rx="9" fill="none" stroke="#ffffff" stroke-width="4.5"/><circle cx="0" cy="-12" r="7.5" fill="#ffffff"/><rect x="-14" y="3" width="28" height="5" rx="2.5" fill="#ffffff"/><rect x="-14" y="14" width="19" height="5" rx="2.5" fill="#ffffff"/></g></g><g class="fx pop" style="--d:0.4s" opacity="0.22"><rect x="1002.0" y="20.0" width="76" height="76" rx="15" fill="url(#tl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(1040 58) scale(0.7)"><ellipse cx="0" cy="-22" rx="28" ry="9" fill="none" stroke="#ffffff" stroke-width="4.5"/><path d="M-28 -22 L-22 25 Q0 36 22 25 L28 -22" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/><path d="M-26 -3 Q0 9 26 -3" fill="none" stroke="#ffffff" stroke-width="4"/></g></g><g class="fx pop" style="--d:0.7s"><rect x="515" y="13" width="90" height="90" rx="22" fill="none" stroke="#ffb020" stroke-width="5"/></g><g class="fx fade" style="--d:1.0s"><text x="40" y="172" font-size="30" font-weight="700" fill="#ffffff" text-anchor="start">Checkov</text></g><g class="fx pop" style="--d:1.1s" opacity="1"><rect x="522.0" y="124.0" width="76" height="76" rx="15" fill="url(#tl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(560 162) scale(0.7)"><circle cx="0" cy="-15" r="12" fill="#ffffff"/><path d="M-25 27 C-25 6 -12 0 0 0 C12 0 25 6 25 27 Z" fill="#ffffff"/></g></g><g class="fx pop" style="--d:1.1s" opacity="0.22"><rect x="682.0" y="124.0" width="76" height="76" rx="15" fill="url(#tl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(720 162) scale(0.7)"><text x="0" y="19" font-size="58" font-weight="700" text-anchor="middle" fill="#ffffff">λ</text></g></g><g class="fx pop" style="--d:1.1s" opacity="0.22"><rect x="842.0" y="124.0" width="76" height="76" rx="15" fill="url(#tl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(880 162) scale(0.7)"><rect x="-24" y="-31" width="48" height="62" rx="9" fill="none" stroke="#ffffff" stroke-width="4.5"/><circle cx="0" cy="-12" r="7.5" fill="#ffffff"/><rect x="-14" y="3" width="28" height="5" rx="2.5" fill="#ffffff"/><rect x="-14" y="14" width="19" height="5" rx="2.5" fill="#ffffff"/></g></g><g class="fx pop" style="--d:1.1s" opacity="0.22"><rect x="1002.0" y="124.0" width="76" height="76" rx="15" fill="url(#tl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(1040 162) scale(0.7)"><ellipse cx="0" cy="-22" rx="28" ry="9" fill="none" stroke="#ffffff" stroke-width="4.5"/><path d="M-28 -22 L-22 25 Q0 36 22 25 L28 -22" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/><path d="M-26 -3 Q0 9 26 -3" fill="none" stroke="#ffffff" stroke-width="4"/></g></g><g class="fx pop" style="--d:1.4s"><rect x="515" y="117" width="90" height="90" rx="22" fill="none" stroke="#ffb020" stroke-width="5"/></g><g class="fx fade" style="--d:1.7s"><text x="40" y="276" font-size="30" font-weight="700" fill="#ffffff" text-anchor="start">Access Analyzer</text></g><g class="fx pop" style="--d:1.8s" opacity="1"><rect x="522.0" y="228.0" width="76" height="76" rx="15" fill="url(#tl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(560 266) scale(0.7)"><circle cx="0" cy="-15" r="12" fill="#ffffff"/><path d="M-25 27 C-25 6 -12 0 0 0 C12 0 25 6 25 27 Z" fill="#ffffff"/></g></g><g class="fx pop" style="--d:1.8s" opacity="0.22"><rect x="682.0" y="228.0" width="76" height="76" rx="15" fill="url(#tl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(720 266) scale(0.7)"><text x="0" y="19" font-size="58" font-weight="700" text-anchor="middle" fill="#ffffff">λ</text></g></g><g class="fx pop" style="--d:1.8s" opacity="0.22"><rect x="842.0" y="228.0" width="76" height="76" rx="15" fill="url(#tl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(880 266) scale(0.7)"><rect x="-24" y="-31" width="48" height="62" rx="9" fill="none" stroke="#ffffff" stroke-width="4.5"/><circle cx="0" cy="-12" r="7.5" fill="#ffffff"/><rect x="-14" y="3" width="28" height="5" rx="2.5" fill="#ffffff"/><rect x="-14" y="14" width="19" height="5" rx="2.5" fill="#ffffff"/></g></g><g class="fx pop" style="--d:1.8s" opacity="0.22"><rect x="1002.0" y="228.0" width="76" height="76" rx="15" fill="url(#tl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(1040 266) scale(0.7)"><ellipse cx="0" cy="-22" rx="28" ry="9" fill="none" stroke="#ffffff" stroke-width="4.5"/><path d="M-28 -22 L-22 25 Q0 36 22 25 L28 -22" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/><path d="M-26 -3 Q0 9 26 -3" fill="none" stroke="#ffffff" stroke-width="4"/></g></g><g class="fx pop" style="--d:2.1s"><rect x="515" y="221" width="90" height="90" rx="22" fill="none" stroke="#ffb020" stroke-width="5"/></g><g class="fx fade" style="--d:2.3999999999999995s"><text x="40" y="402" font-size="30" font-weight="700" fill="#7fe3f5" text-anchor="start">ProofGate</text></g><g class="fx pop" style="--d:2.4999999999999996s" opacity="1"><rect x="522.0" y="354.0" width="76" height="76" rx="15" fill="url(#tl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(560 392) scale(0.7)"><circle cx="0" cy="-15" r="12" fill="#ffffff"/><path d="M-25 27 C-25 6 -12 0 0 0 C12 0 25 6 25 27 Z" fill="#ffffff"/></g></g><g class="fx pop" style="--d:2.4999999999999996s" opacity="1"><rect x="682.0" y="354.0" width="76" height="76" rx="15" fill="url(#tl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(720 392) scale(0.7)"><text x="0" y="19" font-size="58" font-weight="700" text-anchor="middle" fill="#ffffff">λ</text></g></g><g class="fx pop" style="--d:2.4999999999999996s" opacity="1"><rect x="842.0" y="354.0" width="76" height="76" rx="15" fill="url(#tl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(880 392) scale(0.7)"><rect x="-24" y="-31" width="48" height="62" rx="9" fill="none" stroke="#ffffff" stroke-width="4.5"/><circle cx="0" cy="-12" r="7.5" fill="#ffffff"/><rect x="-14" y="3" width="28" height="5" rx="2.5" fill="#ffffff"/><rect x="-14" y="14" width="19" height="5" rx="2.5" fill="#ffffff"/></g></g><g class="fx pop" style="--d:2.4999999999999996s" opacity="1"><rect x="1002.0" y="354.0" width="76" height="76" rx="15" fill="#b3263a" stroke="none" stroke-width="2"/><g transform="translate(1040 392) scale(0.7)"><ellipse cx="0" cy="-22" rx="28" ry="9" fill="none" stroke="#ffffff" stroke-width="4.5"/><path d="M-28 -22 L-22 25 Q0 36 22 25 L28 -22" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/><path d="M-26 -3 Q0 9 26 -3" fill="none" stroke="#ffffff" stroke-width="4"/></g></g><g class="fx fade" style="--d:2.8999999999999995s"><line x1="606" y1="392" x2="674" y2="392" stroke="#ff6b7d" stroke-width="5" stroke-linecap="round" marker-end="url(#tl-ar-r)"/></g><g class="fx fade" style="--d:3.1999999999999993s"><line x1="766" y1="392" x2="834" y2="392" stroke="#ff6b7d" stroke-width="5" stroke-linecap="round" marker-end="url(#tl-ar-r)"/></g><g class="fx fade" style="--d:3.4999999999999996s"><line x1="926" y1="392" x2="994" y2="392" stroke="#ff6b7d" stroke-width="5" stroke-linecap="round" marker-end="url(#tl-ar-r)"/></g></svg></div>

---

<!-- _class: image-full -->
<!-- _header: 課題 -->

# 4つそろうと道ができる

<div class="fig" style="--w:1180px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 400" width="1180" height="400" font-family="'Hiragino Maru Gothic ProN','Zen Maru Gothic','Hiragino Sans',sans-serif"><defs><linearGradient id="fo-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2c35"/><stop offset="1" stop-color="#18181e"/></linearGradient><marker id="fo-ar-g" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#a09aa4"/></marker><marker id="fo-ar-r" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ff6b7d"/></marker><marker id="fo-ar-c" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#00c4e4"/></marker><marker id="fo-ar-ok" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#3ddc97"/></marker><marker id="fo-ar-a" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ffb020"/></marker></defs><style>
.fx{transform-box:fill-box;transform-origin:center}
.hold{opacity:0}
@keyframes pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes holdout{0%{opacity:1}99%{opacity:1}100%{opacity:0}}
@keyframes arm{from{transform:rotate(-78deg)}to{transform:rotate(0)}}
@keyframes mag{0%{transform:translateY(-180px)}35%{transform:translateY(-180px)}60%{transform:translateY(-90px)}85%,100%{transform:translateY(0)}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .grow{animation:grow .9s cubic-bezier(.2,.8,.2,1) var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
.grow{transform-box:fill-box;transform-origin:0% 50%}
</style><g class="fx pop" style="--d:0.3s"><rect x="45" y="14" width="240" height="250" rx="34" fill="url(#fo-tile)" stroke="#3c3c46" stroke-width="2"/><circle cx="83" cy="54" r="22" fill="#00788c"/><text x="83" y="63" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">1</text><g transform="translate(165 125) scale(1.7)"><circle cx="-14" cy="0" r="13" fill="none" stroke="#00c4e4" stroke-width="5"/><circle cx="-14" cy="0" r="3.5" fill="#00c4e4"/><rect x="-1" y="-3" width="35" height="6.5" rx="3" fill="#00c4e4"/><rect x="19" y="2" width="6" height="13" rx="2" fill="#00c4e4"/><rect x="29" y="2" width="6" height="9" rx="2" fill="#00c4e4"/></g><text x="165" y="232" font-size="32" font-weight="700" fill="#ffffff" text-anchor="middle">渡せる</text></g><g class="fx fade" style="--d:0.8s"><text x="310" y="152" font-size="40" font-weight="700" fill="#ff6b7d" text-anchor="middle">＋</text></g><g class="fx pop" style="--d:1.0s"><rect x="335" y="14" width="240" height="250" rx="34" fill="url(#fo-tile)" stroke="#3c3c46" stroke-width="2"/><circle cx="373" cy="54" r="22" fill="#00788c"/><text x="373" y="63" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">2</text><g transform="translate(455 125) scale(1.7)"><circle cx="0" cy="0" r="27" fill="none" stroke="#00c4e4" stroke-width="4.5"/><path d="M-8 -14 L16 0 L-8 14 Z" fill="#00c4e4"/></g><text x="455" y="232" font-size="32" font-weight="700" fill="#ffffff" text-anchor="middle">起動できる</text></g><g class="fx fade" style="--d:1.5s"><text x="600" y="152" font-size="40" font-weight="700" fill="#ff6b7d" text-anchor="middle">＋</text></g><g class="fx pop" style="--d:1.7s"><rect x="625" y="14" width="240" height="250" rx="34" fill="url(#fo-tile)" stroke="#3c3c46" stroke-width="2"/><circle cx="663" cy="54" r="22" fill="#00788c"/><text x="663" y="63" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">3</text><g transform="translate(745 125) scale(1.7)"><rect x="-30" y="-12" width="40" height="24" rx="12" fill="none" stroke="#00c4e4" stroke-width="5" transform="rotate(-38 -10 0) translate(-2 8)"/><rect x="-10" y="-12" width="40" height="24" rx="12" fill="none" stroke="#00c4e4" stroke-width="5" transform="rotate(-38 10 0) translate(2 -8)"/></g><text x="745" y="232" font-size="32" font-weight="700" fill="#ffffff" text-anchor="middle">信頼される</text></g><g class="fx fade" style="--d:2.2s"><text x="890" y="152" font-size="40" font-weight="700" fill="#ff6b7d" text-anchor="middle">＋</text></g><g class="fx pop" style="--d:2.3999999999999995s"><rect x="915" y="14" width="240" height="250" rx="34" fill="url(#fo-tile)" stroke="#3c3c46" stroke-width="2"/><circle cx="953" cy="54" r="22" fill="#00788c"/><text x="953" y="63" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">4</text><g transform="translate(1035 125) scale(1.7)"><ellipse cx="0" cy="-22" rx="28" ry="9" fill="none" stroke="#00c4e4" stroke-width="4.5"/><path d="M-28 -22 L-22 25 Q0 36 22 25 L28 -22" fill="none" stroke="#00c4e4" stroke-width="4.5" stroke-linejoin="round"/><path d="M-26 -3 Q0 9 26 -3" fill="none" stroke="#00c4e4" stroke-width="4"/></g><text x="1035" y="232" font-size="32" font-weight="700" fill="#ffffff" text-anchor="middle">届く</text></g><g class="fx pop" style="--d:3.4s"><rect x="140" y="306" width="900" height="72" rx="36" fill="#b3263a"/><text x="190" y="355" font-size="32" font-weight="700" fill="#ffffff" text-anchor="start">全部そろうと、権限昇格の経路あり</text><text x="1000" y="353" font-family="'SF Mono',Menlo,Monaco,monospace" font-size="26" fill="#ffd2d8" text-anchor="end">PG-IAM-004</text></g></svg></div>

---

<!-- _class: image-full -->
<!-- _header: アプローチ -->

# 2つの実装が食い違えば止める

<p class="lead">TypeScript が出した4つの真偽値を、Lean が検査します。</p>

<div class="fig" style="--w:1180px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 380" width="1180" height="380" font-family="'Hiragino Maru Gothic ProN','Zen Maru Gothic','Hiragino Sans',sans-serif"><defs><linearGradient id="ag-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2c35"/><stop offset="1" stop-color="#18181e"/></linearGradient><marker id="ag-ar-g" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#a09aa4"/></marker><marker id="ag-ar-r" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ff6b7d"/></marker><marker id="ag-ar-c" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#00c4e4"/></marker><marker id="ag-ar-ok" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#3ddc97"/></marker><marker id="ag-ar-a" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ffb020"/></marker></defs><style>
.fx{transform-box:fill-box;transform-origin:center}
.hold{opacity:0}
@keyframes pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes holdout{0%{opacity:1}99%{opacity:1}100%{opacity:0}}
@keyframes arm{from{transform:rotate(-78deg)}to{transform:rotate(0)}}
@keyframes mag{0%{transform:translateY(-180px)}35%{transform:translateY(-180px)}60%{transform:translateY(-90px)}85%,100%{transform:translateY(0)}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .grow{animation:grow .9s cubic-bezier(.2,.8,.2,1) var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
.grow{transform-box:fill-box;transform-origin:0% 50%}
</style><g class="fx pop" style="--d:0.3s"><rect x="52.0" y="152.0" width="96" height="96" rx="19" fill="url(#ag-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(100 200) scale(1.1)"><path d="M-18 14 L0 -16 L20 12" fill="none" stroke="#ffffff" stroke-width="4"/><circle cx="-18" cy="14" r="8" fill="#ffffff"/><circle cx="0" cy="-16" r="8" fill="#ffffff"/><circle cx="20" cy="12" r="8" fill="#ffffff"/></g><text x="100" y="288" font-size="24" font-weight="600" fill="#ffffff" text-anchor="middle">モデル</text></g><g class="fx fade" style="--d:0.9s"><line x1="160" y1="200" x2="276" y2="122" stroke="#a09aa4" stroke-width="5" stroke-linecap="round" marker-end="url(#ag-ar-g)"/></g><g class="fx pop" style="--d:1.1s"><rect x="284.0" y="54.0" width="92" height="92" rx="18" fill="url(#ag-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(330 100) scale(0.8)"><text x="0" y="12" font-family="'SF Mono',Menlo,Monaco,monospace" font-size="36" font-weight="700" text-anchor="middle" fill="#00c4e4">&lt;/&gt;</text></g><text x="396" y="110" font-size="28" font-weight="700" fill="#ffffff" text-anchor="start">TypeScript</text></g><g class="fx pop" style="--d:1.5s"><rect x="570" y="74" width="110" height="52" rx="26" fill="#b3263a"/><text x="625" y="109" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">判定</text></g><g class="fx fade" style="--d:1.7000000000000002s"><line x1="684" y1="100" x2="722" y2="168" stroke="#a09aa4" stroke-width="4" stroke-linecap="round" marker-end="url(#ag-ar-g)"/></g><g class="fx fade" style="--d:1.7000000000000002s"><line x1="160" y1="200" x2="276" y2="278" stroke="#a09aa4" stroke-width="5" stroke-linecap="round" marker-end="url(#ag-ar-g)"/></g><g class="fx pop" style="--d:1.9000000000000001s"><rect x="284.0" y="254.0" width="92" height="92" rx="18" fill="#00788c" stroke="none" stroke-width="2"/><g transform="translate(330 300) scale(0.8)"><text x="0" y="19" font-size="62" font-weight="700" text-anchor="middle" fill="#ffffff">∀</text></g><text x="396" y="310" font-size="28" font-weight="700" fill="#ffffff" text-anchor="start">Lean 4</text></g><g class="fx pop" style="--d:2.3000000000000003s"><rect x="570" y="274" width="110" height="52" rx="26" fill="#b3263a"/><text x="625" y="309" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">判定</text></g><g class="fx fade" style="--d:2.5s"><line x1="684" y1="300" x2="722" y2="232" stroke="#a09aa4" stroke-width="4" stroke-linecap="round" marker-end="url(#ag-ar-g)"/></g><g class="fx pop" style="--d:2.9s"><circle cx="770" cy="200" r="62" fill="url(#ag-tile)" stroke="#00c4e4" stroke-width="3"/><text x="770" y="210" font-size="26" font-weight="700" fill="#7fe3f5" text-anchor="middle">一致？</text></g><g class="fx fade" style="--d:3.4s"><line x1="824" y1="164" x2="888" y2="112" stroke="#3ddc97" stroke-width="4" stroke-linecap="round" marker-end="url(#ag-ar-ok)"/><line x1="824" y1="236" x2="888" y2="288" stroke="#ffb020" stroke-width="4" stroke-linecap="round" marker-end="url(#ag-ar-a)"/></g><g class="fx pop" style="--d:3.6s"><rect x="892" y="80" width="268" height="64" rx="32" fill="#1f7a55"/><text x="1026" y="121" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">一致 → そのまま</text></g><g class="fx pop" style="--d:4.0s"><rect x="892" y="256" width="268" height="64" rx="32" fill="#8a5a00"/><text x="1026" y="297" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">食い違い → 止める</text><text x="1026" y="352" font-family="'SF Mono',Menlo,Monaco,monospace" font-size="24" fill="#a09aa4" text-anchor="middle">PG-IAM-003</text></g></svg></div>

---

<!-- _class: image-full -->
<!-- _header: アプローチ -->

# 分からないものは通さない

<div class="fig" style="--w:1180px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 380" width="1180" height="380" font-family="'Hiragino Maru Gothic ProN','Zen Maru Gothic','Hiragino Sans',sans-serif"><defs><linearGradient id="fc-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2c35"/><stop offset="1" stop-color="#18181e"/></linearGradient><marker id="fc-ar-g" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#a09aa4"/></marker><marker id="fc-ar-r" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ff6b7d"/></marker><marker id="fc-ar-c" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#00c4e4"/></marker><marker id="fc-ar-ok" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#3ddc97"/></marker><marker id="fc-ar-a" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ffb020"/></marker></defs><style>
.fx{transform-box:fill-box;transform-origin:center}
.hold{opacity:0}
@keyframes pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes holdout{0%{opacity:1}99%{opacity:1}100%{opacity:0}}
@keyframes arm{from{transform:rotate(-78deg)}to{transform:rotate(0)}}
@keyframes mag{0%{transform:translateY(-180px)}35%{transform:translateY(-180px)}60%{transform:translateY(-90px)}85%,100%{transform:translateY(0)}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .grow{animation:grow .9s cubic-bezier(.2,.8,.2,1) var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
.grow{transform-box:fill-box;transform-origin:0% 50%}
</style><g class="fx pop" style="--d:0.3s"><rect x="44.0" y="109.0" width="112" height="112" rx="22" fill="url(#fc-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(100 165) scale(1.2)"><path d="M-21 -31 H7 L23 -15 V31 H-21 Z" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/><path d="M7 -31 V-15 H23" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/><rect x="-11" y="0" width="22" height="4.5" rx="2" fill="#ffffff"/><rect x="-11" y="11" width="22" height="4.5" rx="2" fill="#ffffff"/><rect x="-11" y="22" width="13" height="4.5" rx="2" fill="#ffffff"/></g><text x="100" y="259" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">テンプレート</text></g><g class="fx fade" style="--d:0.9s"><path d="M162 165 C250 165 250 70 350 70" fill="none" stroke="#3ddc97" stroke-width="4" marker-end="url(#fc-ar-ok)"/></g><g class="fx pop" style="--d:1.1s"><rect x="364" y="20" width="796" height="100" rx="26" fill="url(#fc-tile)" stroke="#3ddc97" stroke-width="3"/><text x="400" y="83" font-size="32" font-weight="700" fill="#ffffff" text-anchor="start">経路なし</text><rect x="990" y="38" width="150" height="64" rx="32" fill="#1f7a55"/><text x="1065" y="82" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">通す</text></g><g class="fx fade" style="--d:1.6s"><path d="M162 165 C250 165 250 190 350 190" fill="none" stroke="#ff6b7d" stroke-width="4" marker-end="url(#fc-ar-r)"/></g><g class="fx pop" style="--d:1.8s"><rect x="364" y="140" width="796" height="100" rx="26" fill="url(#fc-tile)" stroke="#ff6b7d" stroke-width="3"/><text x="400" y="203" font-size="32" font-weight="700" fill="#ffffff" text-anchor="start">経路あり</text><text x="730" y="201" font-family="'SF Mono',Menlo,Monaco,monospace" font-size="24" fill="#a09aa4">PG-IAM-004 / 005</text><rect x="990" y="158" width="150" height="64" rx="32" fill="#b3263a"/><text x="1065" y="202" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">止める</text></g><g class="fx fade" style="--d:2.3s"><path d="M162 165 C250 165 250 310 350 310" fill="none" stroke="#ffb020" stroke-width="4" marker-end="url(#fc-ar-a)"/></g><g class="fx pop" style="--d:2.5s"><rect x="364" y="260" width="796" height="100" rx="26" fill="url(#fc-tile)" stroke="#ffb020" stroke-width="3"/><text x="400" y="323" font-size="32" font-weight="700" fill="#ffffff" text-anchor="start">読めない</text><text x="730" y="321" font-family="'SF Mono',Menlo,Monaco,monospace" font-size="24" fill="#a09aa4">PG-IAM-003</text><rect x="990" y="278" width="150" height="64" rx="32" fill="#8a5a00"/><text x="1065" y="322" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">止める</text></g></svg></div>

---

<!-- _class: image-full -->
<!-- _header: 検証 -->

# 公開されている91の昇格経路で試した

<div class="fig" style="--w:1100px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 6 1180 464" width="1180" height="464" font-family="'Hiragino Maru Gothic ProN','Zen Maru Gothic','Hiragino Sans',sans-serif"><defs><linearGradient id="vf-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2c35"/><stop offset="1" stop-color="#18181e"/></linearGradient><marker id="vf-ar-g" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#a09aa4"/></marker><marker id="vf-ar-r" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ff6b7d"/></marker><marker id="vf-ar-c" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#00c4e4"/></marker><marker id="vf-ar-ok" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#3ddc97"/></marker><marker id="vf-ar-a" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ffb020"/></marker></defs><style>
.fx{transform-box:fill-box;transform-origin:center}
.hold{opacity:0}
@keyframes pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes holdout{0%{opacity:1}99%{opacity:1}100%{opacity:0}}
@keyframes arm{from{transform:rotate(-78deg)}to{transform:rotate(0)}}
@keyframes mag{0%{transform:translateY(-180px)}35%{transform:translateY(-180px)}60%{transform:translateY(-90px)}85%,100%{transform:translateY(0)}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .grow{animation:grow .9s cubic-bezier(.2,.8,.2,1) var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
.grow{transform-box:fill-box;transform-origin:0% 50%}
</style><g class="fx fade" style="--d:0.3s"><text x="40" y="60" font-size="28" font-weight="700" fill="#ffffff" text-anchor="start">ロールを渡して新しく動かす</text></g><rect x="470" y="30" width="480" height="40" rx="20" fill="#2a2830"/><rect class="fx grow" style="--d:0.3s" x="470" y="30" width="470" height="40" rx="20" fill="#00788c"/><g class="fx fade" style="--d:0.8s"><text x="1140" y="64" font-size="44" font-weight="700" fill="#ffffff" text-anchor="end">46/47</text></g><g class="fx fade" style="--d:0.8s"><text x="40" y="138" font-size="28" font-weight="700" fill="#ffffff" text-anchor="start">動いているものを書き換える</text></g><rect x="470" y="108" width="480" height="40" rx="20" fill="#2a2830"/><rect class="fx grow" style="--d:0.8s" x="470" y="108" width="131" height="40" rx="20" fill="#4a8a96"/><g class="fx fade" style="--d:1.3s"><text x="1140" y="142" font-size="44" font-weight="700" fill="#ffffff" text-anchor="end">6/22</text></g><g class="fx fade" style="--d:1.3s"><text x="40" y="216" font-size="28" font-weight="700" fill="#ffffff" text-anchor="start">ほかの主体に成りすます</text></g><rect x="470" y="186" width="480" height="40" rx="20" fill="#2a2830"/><rect class="fx grow" style="--d:1.3s" x="470" y="186" width="206" height="40" rx="20" fill="#4a8a96"/><g class="fx fade" style="--d:1.8s"><text x="1140" y="220" font-size="44" font-weight="700" fill="#ffffff" text-anchor="end">6/14</text></g><g class="fx fade" style="--d:1.8s"><text x="40" y="294" font-size="28" font-weight="700" fill="#ffffff" text-anchor="start">自分の権限を書き換える</text></g><rect x="470" y="264" width="480" height="40" rx="20" fill="#2a2830"/><rect class="fx grow" style="--d:1.8s" x="470" y="264" width="120" height="40" rx="20" fill="#4a8a96"/><g class="fx fade" style="--d:2.3s"><text x="1140" y="298" font-size="44" font-weight="700" fill="#ffffff" text-anchor="end">2/8</text></g><line x1="40" y1="334" x2="1140" y2="334" stroke="#3c3c46" stroke-width="2"/><g class="fx up" style="--d:2.6s"><text x="40" y="392" font-size="28" font-weight="700" fill="#a09aa4" text-anchor="start">全部で</text><text x="1140" y="398" font-size="64" font-weight="700" fill="#7fe3f5" text-anchor="end">60/91</text></g><g class="fx up" style="--d:3.2s"><text x="40" y="456" font-size="26" font-weight="600" fill="#a09aa4" text-anchor="start">未検出31件の内訳: IAMユーザー・グループ11、既存リソースの書き換え16、ほか4</text></g></svg></div>

---

<!-- _class: image-full -->
<!-- _header: まとめ -->

# 経路ごと、デプロイ前に止める


<div class="fig" style="--w:900px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 470" width="1180" height="470" font-family="'Hiragino Maru Gothic ProN','Zen Maru Gothic','Hiragino Sans',sans-serif"><defs><linearGradient id="sm-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2c35"/><stop offset="1" stop-color="#18181e"/></linearGradient><marker id="sm-ar-g" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#a09aa4"/></marker><marker id="sm-ar-r" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ff6b7d"/></marker><marker id="sm-ar-c" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#00c4e4"/></marker><marker id="sm-ar-ok" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#3ddc97"/></marker><marker id="sm-ar-a" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ffb020"/></marker></defs><style>
.fx{transform-box:fill-box;transform-origin:center}
.hold{opacity:0}
@keyframes pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes holdout{0%{opacity:1}99%{opacity:1}100%{opacity:0}}
@keyframes arm{from{transform:rotate(-78deg)}to{transform:rotate(0)}}
@keyframes mag{0%{transform:translateY(-180px)}35%{transform:translateY(-180px)}60%{transform:translateY(-90px)}85%,100%{transform:translateY(0)}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .grow{animation:grow .9s cubic-bezier(.2,.8,.2,1) var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
.grow{transform-box:fill-box;transform-origin:0% 50%}
</style><text x="40" y="40" font-size="28" font-weight="700" fill="#7fe3f5" text-anchor="start">まだ対象外</text><g class="fx up" style="--d:0.3s"><rect x="40" y="80" width="340" height="150" rx="20" fill="none" stroke="#3c3c46" stroke-width="2"/><text x="210" y="168" font-size="40" font-weight="700" fill="#ffffff" text-anchor="middle">SCP</text></g><g class="fx up" style="--d:0.9s"><rect x="420" y="80" width="340" height="150" rx="20" fill="none" stroke="#3c3c46" stroke-width="2"/><text x="590" y="168" font-size="40" font-weight="700" fill="#ffffff" text-anchor="middle">権限境界</text></g><g class="fx up" style="--d:1.5s"><rect x="800" y="80" width="340" height="150" rx="20" fill="none" stroke="#3c3c46" stroke-width="2"/><text x="970" y="168" font-size="40" font-weight="700" fill="#ffffff" text-anchor="middle">ロールの連鎖</text></g><g class="fx up" style="--d:2.4s"><rect x="250" y="300" width="680" height="68" rx="34" fill="#00788c"/><text x="590" y="345" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">次は ロール連鎖とデータ境界へ</text></g><g class="fx fade" style="--d:3.0s"><text x="590" y="440" font-family="'SF Mono',Menlo,Monaco,monospace" font-size="28" fill="#7fe3f5" text-anchor="middle">github.com/mashharuki/proofgate</text></g></svg></div>

---

<!-- _class: crosshead -->

# 止まったら、どう直す？

---

<!-- _class: image-full -->
<!-- _header: 補足 -->

# テンプレートから証明まで

<div class="fig" style="--w:1180px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 320" width="1180" height="320" font-family="'Hiragino Maru Gothic ProN','Zen Maru Gothic','Hiragino Sans',sans-serif"><defs><linearGradient id="pl-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2c35"/><stop offset="1" stop-color="#18181e"/></linearGradient><marker id="pl-ar-g" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#a09aa4"/></marker><marker id="pl-ar-r" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ff6b7d"/></marker><marker id="pl-ar-c" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#00c4e4"/></marker><marker id="pl-ar-ok" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#3ddc97"/></marker><marker id="pl-ar-a" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ffb020"/></marker></defs><style>
.fx{transform-box:fill-box;transform-origin:center}
.hold{opacity:0}
@keyframes pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes holdout{0%{opacity:1}99%{opacity:1}100%{opacity:0}}
@keyframes arm{from{transform:rotate(-78deg)}to{transform:rotate(0)}}
@keyframes mag{0%{transform:translateY(-180px)}35%{transform:translateY(-180px)}60%{transform:translateY(-90px)}85%,100%{transform:translateY(0)}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .grow{animation:grow .9s cubic-bezier(.2,.8,.2,1) var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
.grow{transform-box:fill-box;transform-origin:0% 50%}
</style><g class="fx pop" style="--d:0.3s"><rect x="70.0" y="110.0" width="120" height="120" rx="24" fill="url(#pl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(130 170) scale(1.3)"><path d="M-21 -31 H7 L23 -15 V31 H-21 Z" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/><path d="M7 -31 V-15 H23" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/><rect x="-11" y="0" width="22" height="4.5" rx="2" fill="#ffffff"/><rect x="-11" y="11" width="22" height="4.5" rx="2" fill="#ffffff"/><rect x="-11" y="22" width="13" height="4.5" rx="2" fill="#ffffff"/></g><text x="130" y="274" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle">テンプレート</text></g><g class="fx fade" style="--d:0.7s"><line x1="206" y1="170" x2="354" y2="170" stroke="#00c4e4" stroke-width="5" stroke-linecap="round" marker-end="url(#pl-ar-c)"/></g><g class="fx pop" style="--d:1.1s"><rect x="370.0" y="110.0" width="120" height="120" rx="24" fill="url(#pl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(430 170) scale(1.3)"><path d="M-18 14 L0 -16 L20 12" fill="none" stroke="#ffffff" stroke-width="4"/><circle cx="-18" cy="14" r="8" fill="#ffffff"/><circle cx="0" cy="-16" r="8" fill="#ffffff"/><circle cx="20" cy="12" r="8" fill="#ffffff"/></g><text x="430" y="274" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle">モデル</text></g><g class="fx fade" style="--d:1.5s"><line x1="506" y1="170" x2="654" y2="170" stroke="#00c4e4" stroke-width="5" stroke-linecap="round" marker-end="url(#pl-ar-c)"/></g><g class="fx pop" style="--d:1.9000000000000001s"><rect x="670.0" y="110.0" width="120" height="120" rx="24" fill="url(#pl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(730 170) scale(1.3)"><circle cx="-20" cy="-18" r="4.5" fill="#ffffff"/><rect x="-9" y="-21.5" width="32" height="7" rx="3.5" fill="#ffffff"/><circle cx="-20" cy="0" r="4.5" fill="#ffffff"/><rect x="-9" y="-3.5" width="26" height="7" rx="3.5" fill="#ffffff"/><circle cx="-20" cy="18" r="4.5" fill="#ffffff"/><rect x="-9" y="14.5" width="32" height="7" rx="3.5" fill="#ffffff"/></g><text x="730" y="274" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle">候補の経路</text></g><g class="fx fade" style="--d:2.3s"><line x1="806" y1="170" x2="954" y2="170" stroke="#00c4e4" stroke-width="5" stroke-linecap="round" marker-end="url(#pl-ar-c)"/></g><g class="fx pop" style="--d:2.7s"><rect x="970.0" y="110.0" width="120" height="120" rx="24" fill="#00788c" stroke="none" stroke-width="2"/><g transform="translate(1030 170) scale(1.3)"><text x="0" y="19" font-size="62" font-weight="700" text-anchor="middle" fill="#ffffff">∀</text></g><text x="1030" y="274" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle">証明</text></g><g class="fx fade" style="--d:2.0s"><path d="M370 94 V82 H790 V94" fill="none" stroke="#7fe3f5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="580" y="58" font-size="26" font-weight="700" fill="#7fe3f5" text-anchor="middle">TypeScript</text></g><g class="fx fade" style="--d:2.9s"><path d="M970 94 V82 H1090 V94" fill="none" stroke="#7fe3f5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="1030" y="58" font-size="26" font-weight="700" fill="#7fe3f5" text-anchor="middle">Lean 4</text></g></svg></div>

---

<!-- _class: image-full -->
<!-- _header: 補足 -->

# Leanが見るのは4つの○×

<p class="lead">TypeScript が計算した4つの真偽値を、Lean が検査します。</p>

<div class="fig" style="--w:1180px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 370" width="1180" height="370" font-family="'Hiragino Maru Gothic ProN','Zen Maru Gothic','Hiragino Sans',sans-serif"><defs><linearGradient id="bl-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2c35"/><stop offset="1" stop-color="#18181e"/></linearGradient><marker id="bl-ar-g" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#a09aa4"/></marker><marker id="bl-ar-r" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ff6b7d"/></marker><marker id="bl-ar-c" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#00c4e4"/></marker><marker id="bl-ar-ok" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#3ddc97"/></marker><marker id="bl-ar-a" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ffb020"/></marker></defs><style>
.fx{transform-box:fill-box;transform-origin:center}
.hold{opacity:0}
@keyframes pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes holdout{0%{opacity:1}99%{opacity:1}100%{opacity:0}}
@keyframes arm{from{transform:rotate(-78deg)}to{transform:rotate(0)}}
@keyframes mag{0%{transform:translateY(-180px)}35%{transform:translateY(-180px)}60%{transform:translateY(-90px)}85%,100%{transform:translateY(0)}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .grow{animation:grow .9s cubic-bezier(.2,.8,.2,1) var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
.grow{transform-box:fill-box;transform-origin:0% 50%}
</style><text x="40" y="105" font-size="30" font-weight="700" fill="#ffffff" text-anchor="start">渡せる</text><g class="hold" style="--d:0.6s"><rect x="300" y="65" width="130" height="60" rx="30" fill="#3a3640"/><text x="365" y="104" font-size="26" font-weight="700" fill="#a09aa4" text-anchor="middle">false</text></g><g class="fx pop" style="--d:0.6s"><rect x="300" y="65" width="130" height="60" rx="30" fill="#b3263a"/><text x="365" y="104" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">true</text></g><line x1="440" y1="95" x2="560" y2="95" stroke="#3c3c46" stroke-width="4"/><text x="40" y="175" font-size="30" font-weight="700" fill="#ffffff" text-anchor="start">起動できる</text><g class="hold" style="--d:1.2999999999999998s"><rect x="300" y="135" width="130" height="60" rx="30" fill="#3a3640"/><text x="365" y="174" font-size="26" font-weight="700" fill="#a09aa4" text-anchor="middle">false</text></g><g class="fx pop" style="--d:1.2999999999999998s"><rect x="300" y="135" width="130" height="60" rx="30" fill="#b3263a"/><text x="365" y="174" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">true</text></g><line x1="440" y1="165" x2="560" y2="165" stroke="#3c3c46" stroke-width="4"/><text x="40" y="245" font-size="30" font-weight="700" fill="#ffffff" text-anchor="start">信頼される</text><g class="hold" style="--d:2.0s"><rect x="300" y="205" width="130" height="60" rx="30" fill="#3a3640"/><text x="365" y="244" font-size="26" font-weight="700" fill="#a09aa4" text-anchor="middle">false</text></g><g class="fx pop" style="--d:2.0s"><rect x="300" y="205" width="130" height="60" rx="30" fill="#b3263a"/><text x="365" y="244" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">true</text></g><line x1="440" y1="235" x2="560" y2="235" stroke="#3c3c46" stroke-width="4"/><text x="40" y="315" font-size="30" font-weight="700" fill="#ffffff" text-anchor="start">届く</text><g class="hold" style="--d:2.6999999999999997s"><rect x="300" y="275" width="130" height="60" rx="30" fill="#3a3640"/><text x="365" y="314" font-size="26" font-weight="700" fill="#a09aa4" text-anchor="middle">false</text></g><g class="fx pop" style="--d:2.6999999999999997s"><rect x="300" y="275" width="130" height="60" rx="30" fill="#b3263a"/><text x="365" y="314" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">true</text></g><line x1="440" y1="305" x2="560" y2="305" stroke="#3c3c46" stroke-width="4"/><path d="M560 60 H645 A135 135 0 0 1 645 330 H560 Z" fill="url(#bl-tile)" stroke="#00c4e4" stroke-width="3"/><text x="640" y="207" font-size="34" font-weight="700" fill="#00c4e4" text-anchor="middle">AND</text><line x1="780" y1="195" x2="826" y2="195" stroke="#3c3c46" stroke-width="4"/><g class="hold" style="--d:3.4s"><rect x="830" y="135" width="330" height="120" rx="26" fill="#1f7a55"/><text x="995" y="214" font-size="50" font-weight="700" fill="#ffffff" text-anchor="middle">SAFE</text></g><g class="fx pop" style="--d:3.4s"><rect x="830" y="135" width="330" height="120" rx="26" fill="#b3263a"/><text x="995" y="214" font-size="50" font-weight="700" fill="#ffffff" text-anchor="middle">UNSAFE</text></g></svg></div>

---

<!-- _class: appendix -->
<!-- _header: 補足 -->

# ルールID一覧

| ルールID | 見つけるもの | 例 |
| --- | --- | --- |
| PG-IAM-003 | 読めない構文、判定の食い違い | 読めないものは止める |
| PG-IAM-004 | 保護したいS3に届く権限昇格の経路 | 渡す → 起動 → S3 |
| PG-IAM-005 | ロールが自分でIAMを書き換えられる構成 | 自分に権限を付与 |
