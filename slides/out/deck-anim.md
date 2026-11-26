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
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
</style><g class="fx pop" style="--d:0.2s"><rect x="30" y="10" width="160" height="160" rx="32" fill="#00788c"/><rect x="58" y="44" width="14" height="92" rx="5" fill="#ffffff"/><rect x="148" y="44" width="14" height="92" rx="5" fill="#ffffff"/></g><g class="fx arm" style="--d:0.9s"><rect x="65" y="80" width="90" height="16" rx="6" fill="#ff6b7d"/></g></svg></div>

# ProofGate

synthで止める、権限昇格の道

---

<!-- _class: image-full -->
<!-- _header: 概要 -->

# cdk synth の直後に関門を置く

<div class="fig" style="--w:1180px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 370" width="1180" height="370" font-family="'Hiragino Maru Gothic ProN','Zen Maru Gothic','Hiragino Sans',sans-serif"><defs><linearGradient id="ov-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2c35"/><stop offset="1" stop-color="#18181e"/></linearGradient><marker id="ov-ar-g" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#a09aa4"/></marker><marker id="ov-ar-r" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ff6b7d"/></marker><marker id="ov-ar-c" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#00c4e4"/></marker><marker id="ov-ar-ok" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#3ddc97"/></marker><marker id="ov-ar-a" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ffb020"/></marker></defs><style>
.fx{transform-box:fill-box;transform-origin:center}
.hold{opacity:0}
@keyframes pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes holdout{0%{opacity:1}99%{opacity:1}100%{opacity:0}}
@keyframes arm{from{transform:rotate(-78deg)}to{transform:rotate(0)}}
@keyframes mag{0%{transform:translateY(-180px)}35%{transform:translateY(-180px)}60%{transform:translateY(-90px)}85%,100%{transform:translateY(0)}}
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
</style><g class="fx pop" style="--d:0.3s"><rect x="62.0" y="127.0" width="96" height="96" rx="19" fill="url(#ov-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(110 175) scale(1.0)"><text x="0" y="12" font-family="'SF Mono',Menlo,Monaco,monospace" font-size="36" font-weight="700" text-anchor="middle" fill="#00c4e4">&lt;/&gt;</text></g><text x="110" y="263" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">CDK アプリ</text></g><g class="fx fade" style="--d:0.9s"><line x1="175" y1="175" x2="312" y2="175" stroke="#a09aa4" stroke-width="5" stroke-linecap="round" marker-end="url(#ov-ar-g)"/><text x="244" y="151" font-size="24" font-weight="600" fill="#a09aa4" text-anchor="middle">cdk synth</text></g><g class="fx pop" style="--d:1.3s"><rect x="332.0" y="127.0" width="96" height="96" rx="19" fill="url(#ov-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(380 175) scale(1.0)"><path d="M-21 -31 H7 L23 -15 V31 H-21 Z" fill="none" stroke="#00c4e4" stroke-width="4.5" stroke-linejoin="round"/><path d="M7 -31 V-15 H23" fill="none" stroke="#00c4e4" stroke-width="4.5" stroke-linejoin="round"/><rect x="-11" y="0" width="22" height="4.5" rx="2" fill="#00c4e4"/><rect x="-11" y="11" width="22" height="4.5" rx="2" fill="#00c4e4"/><rect x="-11" y="22" width="13" height="4.5" rx="2" fill="#00c4e4"/></g><text x="380" y="263" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">CloudFormation</text></g><g class="fx fade" style="--d:1.9s"><line x1="448" y1="175" x2="580" y2="175" stroke="#a09aa4" stroke-width="5" stroke-linecap="round" marker-end="url(#ov-ar-g)"/></g><g class="fx pop" style="--d:2.3s"><rect x="610" y="95" width="160" height="160" rx="32" fill="#00788c"/><rect x="638" y="129" width="14" height="92" rx="5" fill="#ffffff"/><rect x="728" y="129" width="14" height="92" rx="5" fill="#ffffff"/></g><g class="fx arm" style="--d:3.0s"><rect x="645" y="165" width="90" height="16" rx="6" fill="#ff6b7d"/></g><text x="690" y="293" font-size="30" font-weight="700" fill="#00c4e4" text-anchor="middle">ProofGate</text><g class="fx fade" style="--d:4.2s"><line x1="776" y1="143" x2="922" y2="88" stroke="#3ddc97" stroke-width="5" stroke-linecap="round" marker-end="url(#ov-ar-ok)"/><line x1="776" y1="207" x2="922" y2="262" stroke="#ff6b7d" stroke-width="5" stroke-linecap="round" marker-end="url(#ov-ar-r)"/></g><g class="fx pop" style="--d:4.4s"><rect x="936.0" y="44.0" width="88" height="88" rx="18" fill="#1f7a55" stroke="none" stroke-width="2"/><g transform="translate(980 88) scale(1.0)"><path d="M-16 2 L-5 14 L17 -13" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></g><text x="1044" y="99" font-size="30" font-weight="700" fill="#3ddc97" text-anchor="start">通す</text></g><g class="fx pop" style="--d:4.8s"><rect x="936.0" y="218.0" width="88" height="88" rx="18" fill="#b3263a" stroke="none" stroke-width="2"/><g transform="translate(980 262) scale(1.0)"><path d="M-14 -14 L14 14 M14 -14 L-14 14" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/></g><text x="1044" y="273" font-size="30" font-weight="700" fill="#ff6b7d" text-anchor="start">止める</text></g></svg></div>

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
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
</style><g class="fx pop" style="--d:0.3s"><rect x="10" y="12" width="350" height="72" rx="28" fill="url(#od-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(56 48.0) scale(0.7)"><circle cx="-14" cy="0" r="13" fill="none" stroke="#00c4e4" stroke-width="5"/><circle cx="-14" cy="0" r="3.5" fill="#00c4e4"/><rect x="-1" y="-3" width="35" height="6.5" rx="3" fill="#00c4e4"/><rect x="19" y="2" width="6" height="13" rx="2" fill="#00c4e4"/><rect x="29" y="2" width="6" height="9" rx="2" fill="#00c4e4"/></g><text x="98" y="57.0" font-size="26" font-weight="700" fill="#ffffff" text-anchor="start">ロールを渡せる</text><circle cx="324" cy="48.0" r="19" fill="#1f7a55"/><g transform="translate(324 48.0) scale(0.72)"><path d="M-16 2 L-5 14 L17 -13" fill="none" stroke="#ffffff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/></g></g><g class="fx pop" style="--d:0.8999999999999999s"><rect x="415" y="12" width="350" height="72" rx="28" fill="url(#od-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(461 48.0) scale(0.7)"><text x="0" y="19" font-size="58" font-weight="700" text-anchor="middle" fill="#00c4e4">λ</text></g><text x="503" y="57.0" font-size="26" font-weight="700" fill="#ffffff" text-anchor="start">関数を作れる</text><circle cx="729" cy="48.0" r="19" fill="#1f7a55"/><g transform="translate(729 48.0) scale(0.72)"><path d="M-16 2 L-5 14 L17 -13" fill="none" stroke="#ffffff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/></g></g><g class="fx pop" style="--d:1.5s"><rect x="820" y="12" width="350" height="72" rx="28" fill="url(#od-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(866 48.0) scale(0.7)"><ellipse cx="0" cy="-22" rx="28" ry="9" fill="none" stroke="#00c4e4" stroke-width="4.5"/><path d="M-28 -22 L-22 25 Q0 36 22 25 L28 -22" fill="none" stroke="#00c4e4" stroke-width="4.5" stroke-linejoin="round"/><path d="M-26 -3 Q0 9 26 -3" fill="none" stroke="#00c4e4" stroke-width="4"/></g><text x="908" y="57.0" font-size="26" font-weight="700" fill="#ffffff" text-anchor="start">S3を読み書き</text><circle cx="1134" cy="48.0" r="19" fill="#1f7a55"/><g transform="translate(1134 48.0) scale(0.72)"><path d="M-16 2 L-5 14 L17 -13" fill="none" stroke="#ffffff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/></g></g><g class="fx pop" style="--d:2.2s"><rect x="82.0" y="222.0" width="96" height="96" rx="19" fill="url(#od-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(130 270) scale(1.0)"><circle cx="0" cy="-15" r="12" fill="#ffffff"/><path d="M-25 27 C-25 6 -12 0 0 0 C12 0 25 6 25 27 Z" fill="#ffffff"/></g><text x="130" y="360" font-size="24" font-weight="600" fill="#ffffff" text-anchor="middle">DeveloperRole</text></g><g class="fx pop" style="--d:2.6500000000000004s"><rect x="382.0" y="222.0" width="96" height="96" rx="19" fill="url(#od-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(430 270) scale(1.0)"><text x="0" y="19" font-size="58" font-weight="700" text-anchor="middle" fill="#ffffff">λ</text></g><text x="430" y="360" font-size="24" font-weight="600" fill="#ffffff" text-anchor="middle">Lambda</text></g><g class="fx pop" style="--d:3.1s"><rect x="682.0" y="222.0" width="96" height="96" rx="19" fill="url(#od-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(730 270) scale(1.0)"><rect x="-24" y="-31" width="48" height="62" rx="9" fill="none" stroke="#ffffff" stroke-width="4.5"/><circle cx="0" cy="-12" r="7.5" fill="#ffffff"/><rect x="-14" y="3" width="28" height="5" rx="2.5" fill="#ffffff"/><rect x="-14" y="14" width="19" height="5" rx="2.5" fill="#ffffff"/></g><text x="730" y="360" font-size="24" font-weight="600" fill="#ffffff" text-anchor="middle">ProtectedDataRole</text></g><g class="fx pop" style="--d:3.5500000000000003s"><rect x="982.0" y="222.0" width="96" height="96" rx="19" fill="#b3263a" stroke="none" stroke-width="2"/><g transform="translate(1030 270) scale(1.0)"><ellipse cx="0" cy="-22" rx="28" ry="9" fill="none" stroke="#ffffff" stroke-width="4.5"/><path d="M-28 -22 L-22 25 Q0 36 22 25 L28 -22" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/><path d="M-26 -3 Q0 9 26 -3" fill="none" stroke="#ffffff" stroke-width="4"/></g><text x="1030" y="360" font-size="24" font-weight="600" fill="#ffffff" text-anchor="middle">S3バケット</text></g><g class="fx fade" style="--d:2.45s"><line x1="192" y1="270" x2="368" y2="270" stroke="#ff6b7d" stroke-width="6" stroke-linecap="round" marker-end="url(#od-ar-r)"/><text x="280.0" y="248" font-size="24" font-weight="700" fill="#ff6b7d" text-anchor="middle">渡す</text></g><g class="fx fade" style="--d:2.9000000000000004s"><line x1="492" y1="270" x2="668" y2="270" stroke="#ff6b7d" stroke-width="6" stroke-linecap="round" marker-end="url(#od-ar-r)"/><text x="580.0" y="248" font-size="24" font-weight="700" fill="#ff6b7d" text-anchor="middle">動かす</text></g><g class="fx fade" style="--d:3.35s"><line x1="792" y1="270" x2="968" y2="270" stroke="#ff6b7d" stroke-width="6" stroke-linecap="round" marker-end="url(#od-ar-r)"/><text x="880.0" y="248" font-size="24" font-weight="700" fill="#ff6b7d" text-anchor="middle">届く</text></g></svg></div>

---

<!-- _class: image-full -->
<!-- _header: 課題 -->

# 1文ずつ見るツールには死角がある

<div class="fig" style="--w:1180px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 360" width="1180" height="360" font-family="'Hiragino Maru Gothic ProN','Zen Maru Gothic','Hiragino Sans',sans-serif"><defs><linearGradient id="bs-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2c35"/><stop offset="1" stop-color="#18181e"/></linearGradient><marker id="bs-ar-g" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#a09aa4"/></marker><marker id="bs-ar-r" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ff6b7d"/></marker><marker id="bs-ar-c" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#00c4e4"/></marker><marker id="bs-ar-ok" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#3ddc97"/></marker><marker id="bs-ar-a" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ffb020"/></marker></defs><style>
.fx{transform-box:fill-box;transform-origin:center}
.hold{opacity:0}
@keyframes pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes holdout{0%{opacity:1}99%{opacity:1}100%{opacity:0}}
@keyframes arm{from{transform:rotate(-78deg)}to{transform:rotate(0)}}
@keyframes mag{0%{transform:translateY(-180px)}35%{transform:translateY(-180px)}60%{transform:translateY(-90px)}85%,100%{transform:translateY(0)}}
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
</style><text x="290" y="34" font-size="28" font-weight="700" fill="#a09aa4" text-anchor="middle">1文ずつ見る</text><text x="880" y="34" font-size="28" font-weight="700" fill="#7fe3f5" text-anchor="middle">つなげて見る</text><line x1="590" y1="20" x2="590" y2="350" stroke="#3c3c46" stroke-width="2"/><g class="fx pop" style="--d:0.3s"><rect x="30" y="70" width="440" height="72" rx="28" fill="url(#bs-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(76 106.0) scale(0.7)"><circle cx="-14" cy="0" r="13" fill="none" stroke="#00c4e4" stroke-width="5"/><circle cx="-14" cy="0" r="3.5" fill="#00c4e4"/><rect x="-1" y="-3" width="35" height="6.5" rx="3" fill="#00c4e4"/><rect x="19" y="2" width="6" height="13" rx="2" fill="#00c4e4"/><rect x="29" y="2" width="6" height="9" rx="2" fill="#00c4e4"/></g><text x="118" y="115.0" font-size="26" font-weight="700" fill="#ffffff" text-anchor="start">ロールを渡せる</text><circle cx="434" cy="106.0" r="19" fill="#1f7a55"/><g transform="translate(434 106.0) scale(0.72)"><path d="M-16 2 L-5 14 L17 -13" fill="none" stroke="#ffffff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/></g></g><g class="fx pop" style="--d:1.2s"><rect x="30" y="160" width="440" height="72" rx="28" fill="url(#bs-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(76 196.0) scale(0.7)"><text x="0" y="19" font-size="58" font-weight="700" text-anchor="middle" fill="#00c4e4">λ</text></g><text x="118" y="205.0" font-size="26" font-weight="700" fill="#ffffff" text-anchor="start">関数を作れる</text><circle cx="434" cy="196.0" r="19" fill="#1f7a55"/><g transform="translate(434 196.0) scale(0.72)"><path d="M-16 2 L-5 14 L17 -13" fill="none" stroke="#ffffff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/></g></g><g class="fx pop" style="--d:2.1s"><rect x="30" y="250" width="440" height="72" rx="28" fill="url(#bs-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(76 286.0) scale(0.7)"><ellipse cx="0" cy="-22" rx="28" ry="9" fill="none" stroke="#00c4e4" stroke-width="4.5"/><path d="M-28 -22 L-22 25 Q0 36 22 25 L28 -22" fill="none" stroke="#00c4e4" stroke-width="4.5" stroke-linejoin="round"/><path d="M-26 -3 Q0 9 26 -3" fill="none" stroke="#00c4e4" stroke-width="4"/></g><text x="118" y="295.0" font-size="26" font-weight="700" fill="#ffffff" text-anchor="start">S3を読み書き</text><circle cx="434" cy="286.0" r="19" fill="#1f7a55"/><g transform="translate(434 286.0) scale(0.72)"><path d="M-16 2 L-5 14 L17 -13" fill="none" stroke="#ffffff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/></g></g><g class="fx mag" style="--d:0.2s"><g transform="translate(530 290) scale(1.3)"><circle cx="-7" cy="-7" r="17" fill="rgba(0,0,0,.45)" stroke="#ffffff" stroke-width="6"/><path d="M6 6 L26 26" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/></g></g><g class="fx pop" style="--d:1.2s"><rect x="652.0" y="132.0" width="76" height="76" rx="15" fill="url(#bs-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(690 170) scale(0.7)"><circle cx="0" cy="-15" r="12" fill="#ffffff"/><path d="M-25 27 C-25 6 -12 0 0 0 C12 0 25 6 25 27 Z" fill="#ffffff"/></g></g><g class="fx pop" style="--d:1.5499999999999998s"><rect x="797.0" y="132.0" width="76" height="76" rx="15" fill="url(#bs-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(835 170) scale(0.7)"><text x="0" y="19" font-size="58" font-weight="700" text-anchor="middle" fill="#ffffff">λ</text></g></g><g class="fx pop" style="--d:1.9s"><rect x="942.0" y="132.0" width="76" height="76" rx="15" fill="url(#bs-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(980 170) scale(0.7)"><rect x="-24" y="-31" width="48" height="62" rx="9" fill="none" stroke="#ffffff" stroke-width="4.5"/><circle cx="0" cy="-12" r="7.5" fill="#ffffff"/><rect x="-14" y="3" width="28" height="5" rx="2.5" fill="#ffffff"/><rect x="-14" y="14" width="19" height="5" rx="2.5" fill="#ffffff"/></g></g><g class="fx pop" style="--d:2.25s"><rect x="1087.0" y="132.0" width="76" height="76" rx="15" fill="#b3263a" stroke="none" stroke-width="2"/><g transform="translate(1125 170) scale(0.7)"><ellipse cx="0" cy="-22" rx="28" ry="9" fill="none" stroke="#ffffff" stroke-width="4.5"/><path d="M-28 -22 L-22 25 Q0 36 22 25 L28 -22" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/><path d="M-26 -3 Q0 9 26 -3" fill="none" stroke="#ffffff" stroke-width="4"/></g></g><g class="fx fade" style="--d:1.4s"><line x1="734" y1="170" x2="791" y2="170" stroke="#ff6b7d" stroke-width="5" stroke-linecap="round" marker-end="url(#bs-ar-r)"/></g><g class="fx fade" style="--d:1.75s"><line x1="879" y1="170" x2="936" y2="170" stroke="#ff6b7d" stroke-width="5" stroke-linecap="round" marker-end="url(#bs-ar-r)"/></g><g class="fx fade" style="--d:2.0999999999999996s"><line x1="1024" y1="170" x2="1081" y2="170" stroke="#ff6b7d" stroke-width="5" stroke-linecap="round" marker-end="url(#bs-ar-r)"/></g><g class="fx pop" style="--d:2.8s"><rect x="800" y="262" width="300" height="64" rx="32" fill="#b3263a"/><text x="950" y="304" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle">経路が見える</text></g></svg></div>

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
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
</style><g class="fx pop" style="--d:0.3s"><rect x="45" y="14" width="240" height="250" rx="34" fill="url(#fo-tile)" stroke="#3c3c46" stroke-width="2"/><circle cx="83" cy="54" r="22" fill="#00788c"/><text x="83" y="63" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">1</text><g transform="translate(165 125) scale(1.7)"><circle cx="-14" cy="0" r="13" fill="none" stroke="#00c4e4" stroke-width="5"/><circle cx="-14" cy="0" r="3.5" fill="#00c4e4"/><rect x="-1" y="-3" width="35" height="6.5" rx="3" fill="#00c4e4"/><rect x="19" y="2" width="6" height="13" rx="2" fill="#00c4e4"/><rect x="29" y="2" width="6" height="9" rx="2" fill="#00c4e4"/></g><text x="165" y="232" font-size="32" font-weight="700" fill="#ffffff" text-anchor="middle">渡せる</text></g><g class="fx fade" style="--d:0.8s"><text x="310" y="152" font-size="40" font-weight="700" fill="#ff6b7d" text-anchor="middle">＋</text></g><g class="fx pop" style="--d:1.0s"><rect x="335" y="14" width="240" height="250" rx="34" fill="url(#fo-tile)" stroke="#3c3c46" stroke-width="2"/><circle cx="373" cy="54" r="22" fill="#00788c"/><text x="373" y="63" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">2</text><g transform="translate(455 125) scale(1.7)"><circle cx="0" cy="0" r="27" fill="none" stroke="#00c4e4" stroke-width="4.5"/><path d="M-8 -14 L16 0 L-8 14 Z" fill="#00c4e4"/></g><text x="455" y="232" font-size="32" font-weight="700" fill="#ffffff" text-anchor="middle">起動できる</text></g><g class="fx fade" style="--d:1.5s"><text x="600" y="152" font-size="40" font-weight="700" fill="#ff6b7d" text-anchor="middle">＋</text></g><g class="fx pop" style="--d:1.7s"><rect x="625" y="14" width="240" height="250" rx="34" fill="url(#fo-tile)" stroke="#3c3c46" stroke-width="2"/><circle cx="663" cy="54" r="22" fill="#00788c"/><text x="663" y="63" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">3</text><g transform="translate(745 125) scale(1.7)"><rect x="-30" y="-12" width="40" height="24" rx="12" fill="none" stroke="#00c4e4" stroke-width="5" transform="rotate(-38 -10 0) translate(-2 8)"/><rect x="-10" y="-12" width="40" height="24" rx="12" fill="none" stroke="#00c4e4" stroke-width="5" transform="rotate(-38 10 0) translate(2 -8)"/></g><text x="745" y="232" font-size="32" font-weight="700" fill="#ffffff" text-anchor="middle">信頼される</text></g><g class="fx fade" style="--d:2.2s"><text x="890" y="152" font-size="40" font-weight="700" fill="#ff6b7d" text-anchor="middle">＋</text></g><g class="fx pop" style="--d:2.3999999999999995s"><rect x="915" y="14" width="240" height="250" rx="34" fill="url(#fo-tile)" stroke="#3c3c46" stroke-width="2"/><circle cx="953" cy="54" r="22" fill="#00788c"/><text x="953" y="63" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">4</text><g transform="translate(1035 125) scale(1.7)"><ellipse cx="0" cy="-22" rx="28" ry="9" fill="none" stroke="#00c4e4" stroke-width="4.5"/><path d="M-28 -22 L-22 25 Q0 36 22 25 L28 -22" fill="none" stroke="#00c4e4" stroke-width="4.5" stroke-linejoin="round"/><path d="M-26 -3 Q0 9 26 -3" fill="none" stroke="#00c4e4" stroke-width="4"/></g><text x="1035" y="232" font-size="32" font-weight="700" fill="#ffffff" text-anchor="middle">届く</text></g><g class="fx pop" style="--d:3.4s"><rect x="140" y="306" width="900" height="72" rx="36" fill="#b3263a"/><text x="190" y="355" font-size="32" font-weight="700" fill="#ffffff" text-anchor="start">全部そろうと、権限昇格の経路あり</text><text x="1000" y="353" font-family="'SF Mono',Menlo,Monaco,monospace" font-size="26" fill="#ffd2d8" text-anchor="end">PG-IAM-004</text></g></svg></div>

---

<!-- _class: image-full -->
<!-- _header: アプローチ -->

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
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
</style><g class="fx pop" style="--d:0.3s"><rect x="70.0" y="110.0" width="120" height="120" rx="24" fill="url(#pl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(130 170) scale(1.3)"><path d="M-21 -31 H7 L23 -15 V31 H-21 Z" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/><path d="M7 -31 V-15 H23" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/><rect x="-11" y="0" width="22" height="4.5" rx="2" fill="#ffffff"/><rect x="-11" y="11" width="22" height="4.5" rx="2" fill="#ffffff"/><rect x="-11" y="22" width="13" height="4.5" rx="2" fill="#ffffff"/></g><text x="130" y="274" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle">テンプレート</text></g><g class="fx fade" style="--d:0.7s"><line x1="206" y1="170" x2="354" y2="170" stroke="#00c4e4" stroke-width="5" stroke-linecap="round" marker-end="url(#pl-ar-c)"/></g><g class="fx pop" style="--d:1.1s"><rect x="370.0" y="110.0" width="120" height="120" rx="24" fill="url(#pl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(430 170) scale(1.3)"><path d="M-18 14 L0 -16 L20 12" fill="none" stroke="#ffffff" stroke-width="4"/><circle cx="-18" cy="14" r="8" fill="#ffffff"/><circle cx="0" cy="-16" r="8" fill="#ffffff"/><circle cx="20" cy="12" r="8" fill="#ffffff"/></g><text x="430" y="274" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle">モデル</text></g><g class="fx fade" style="--d:1.5s"><line x1="506" y1="170" x2="654" y2="170" stroke="#00c4e4" stroke-width="5" stroke-linecap="round" marker-end="url(#pl-ar-c)"/></g><g class="fx pop" style="--d:1.9000000000000001s"><rect x="670.0" y="110.0" width="120" height="120" rx="24" fill="url(#pl-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(730 170) scale(1.3)"><circle cx="-20" cy="-18" r="4.5" fill="#ffffff"/><rect x="-9" y="-21.5" width="32" height="7" rx="3.5" fill="#ffffff"/><circle cx="-20" cy="0" r="4.5" fill="#ffffff"/><rect x="-9" y="-3.5" width="26" height="7" rx="3.5" fill="#ffffff"/><circle cx="-20" cy="18" r="4.5" fill="#ffffff"/><rect x="-9" y="14.5" width="32" height="7" rx="3.5" fill="#ffffff"/></g><text x="730" y="274" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle">候補の経路</text></g><g class="fx fade" style="--d:2.3s"><line x1="806" y1="170" x2="954" y2="170" stroke="#00c4e4" stroke-width="5" stroke-linecap="round" marker-end="url(#pl-ar-c)"/></g><g class="fx pop" style="--d:2.7s"><rect x="970.0" y="110.0" width="120" height="120" rx="24" fill="#00788c" stroke="none" stroke-width="2"/><g transform="translate(1030 170) scale(1.3)"><text x="0" y="19" font-size="62" font-weight="700" text-anchor="middle" fill="#ffffff">∀</text></g><text x="1030" y="274" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle">証明</text></g><g class="fx fade" style="--d:2.0s"><path d="M370 94 V82 H790 V94" fill="none" stroke="#7fe3f5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="580" y="58" font-size="26" font-weight="700" fill="#7fe3f5" text-anchor="middle">TypeScript</text></g><g class="fx fade" style="--d:2.9s"><path d="M970 94 V82 H1090 V94" fill="none" stroke="#7fe3f5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="1030" y="58" font-size="26" font-weight="700" fill="#7fe3f5" text-anchor="middle">Lean 4</text></g></svg></div>

---

<!-- _class: image-full -->
<!-- _header: アプローチ -->

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
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
</style><text x="40" y="105" font-size="30" font-weight="700" fill="#ffffff" text-anchor="start">渡せる</text><g class="hold" style="--d:0.6s"><rect x="300" y="65" width="130" height="60" rx="30" fill="#3a3640"/><text x="365" y="104" font-size="26" font-weight="700" fill="#a09aa4" text-anchor="middle">false</text></g><g class="fx pop" style="--d:0.6s"><rect x="300" y="65" width="130" height="60" rx="30" fill="#b3263a"/><text x="365" y="104" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">true</text></g><line x1="440" y1="95" x2="560" y2="95" stroke="#3c3c46" stroke-width="4"/><text x="40" y="175" font-size="30" font-weight="700" fill="#ffffff" text-anchor="start">起動できる</text><g class="hold" style="--d:1.2999999999999998s"><rect x="300" y="135" width="130" height="60" rx="30" fill="#3a3640"/><text x="365" y="174" font-size="26" font-weight="700" fill="#a09aa4" text-anchor="middle">false</text></g><g class="fx pop" style="--d:1.2999999999999998s"><rect x="300" y="135" width="130" height="60" rx="30" fill="#b3263a"/><text x="365" y="174" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">true</text></g><line x1="440" y1="165" x2="560" y2="165" stroke="#3c3c46" stroke-width="4"/><text x="40" y="245" font-size="30" font-weight="700" fill="#ffffff" text-anchor="start">信頼される</text><g class="hold" style="--d:2.0s"><rect x="300" y="205" width="130" height="60" rx="30" fill="#3a3640"/><text x="365" y="244" font-size="26" font-weight="700" fill="#a09aa4" text-anchor="middle">false</text></g><g class="fx pop" style="--d:2.0s"><rect x="300" y="205" width="130" height="60" rx="30" fill="#b3263a"/><text x="365" y="244" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">true</text></g><line x1="440" y1="235" x2="560" y2="235" stroke="#3c3c46" stroke-width="4"/><text x="40" y="315" font-size="30" font-weight="700" fill="#ffffff" text-anchor="start">届く</text><g class="hold" style="--d:2.6999999999999997s"><rect x="300" y="275" width="130" height="60" rx="30" fill="#3a3640"/><text x="365" y="314" font-size="26" font-weight="700" fill="#a09aa4" text-anchor="middle">false</text></g><g class="fx pop" style="--d:2.6999999999999997s"><rect x="300" y="275" width="130" height="60" rx="30" fill="#b3263a"/><text x="365" y="314" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">true</text></g><line x1="440" y1="305" x2="560" y2="305" stroke="#3c3c46" stroke-width="4"/><path d="M560 60 H645 A135 135 0 0 1 645 330 H560 Z" fill="url(#bl-tile)" stroke="#00c4e4" stroke-width="3"/><text x="640" y="207" font-size="34" font-weight="700" fill="#00c4e4" text-anchor="middle">AND</text><line x1="780" y1="195" x2="826" y2="195" stroke="#3c3c46" stroke-width="4"/><g class="hold" style="--d:3.4s"><rect x="830" y="135" width="330" height="120" rx="26" fill="#1f7a55"/><text x="995" y="214" font-size="50" font-weight="700" fill="#ffffff" text-anchor="middle">SAFE</text></g><g class="fx pop" style="--d:3.4s"><rect x="830" y="135" width="330" height="120" rx="26" fill="#b3263a"/><text x="995" y="214" font-size="50" font-weight="700" fill="#ffffff" text-anchor="middle">UNSAFE</text></g></svg></div>

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
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
</style><g class="fx pop" style="--d:0.3s"><rect x="44.0" y="109.0" width="112" height="112" rx="22" fill="url(#fc-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(100 165) scale(1.2)"><path d="M-21 -31 H7 L23 -15 V31 H-21 Z" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/><path d="M7 -31 V-15 H23" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linejoin="round"/><rect x="-11" y="0" width="22" height="4.5" rx="2" fill="#ffffff"/><rect x="-11" y="11" width="22" height="4.5" rx="2" fill="#ffffff"/><rect x="-11" y="22" width="13" height="4.5" rx="2" fill="#ffffff"/></g><text x="100" y="259" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">テンプレート</text></g><g class="fx fade" style="--d:0.9s"><path d="M162 165 C250 165 250 70 350 70" fill="none" stroke="#3ddc97" stroke-width="4" marker-end="url(#fc-ar-ok)"/></g><g class="fx pop" style="--d:1.1s"><rect x="364" y="20" width="796" height="100" rx="26" fill="url(#fc-tile)" stroke="#3ddc97" stroke-width="3"/><text x="400" y="83" font-size="32" font-weight="700" fill="#ffffff" text-anchor="start">経路なし</text><rect x="990" y="38" width="150" height="64" rx="32" fill="#1f7a55"/><text x="1065" y="82" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">通す</text></g><g class="fx fade" style="--d:1.6s"><path d="M162 165 C250 165 250 190 350 190" fill="none" stroke="#ff6b7d" stroke-width="4" marker-end="url(#fc-ar-r)"/></g><g class="fx pop" style="--d:1.8s"><rect x="364" y="140" width="796" height="100" rx="26" fill="url(#fc-tile)" stroke="#ff6b7d" stroke-width="3"/><text x="400" y="203" font-size="32" font-weight="700" fill="#ffffff" text-anchor="start">経路あり</text><text x="730" y="201" font-family="'SF Mono',Menlo,Monaco,monospace" font-size="24" fill="#a09aa4">PG-IAM-004 / 005</text><rect x="990" y="158" width="150" height="64" rx="32" fill="#b3263a"/><text x="1065" y="202" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">止める</text></g><g class="fx fade" style="--d:2.3s"><path d="M162 165 C250 165 250 310 350 310" fill="none" stroke="#ffb020" stroke-width="4" marker-end="url(#fc-ar-a)"/></g><g class="fx pop" style="--d:2.5s"><rect x="364" y="260" width="796" height="100" rx="26" fill="url(#fc-tile)" stroke="#ffb020" stroke-width="3"/><text x="400" y="323" font-size="32" font-weight="700" fill="#ffffff" text-anchor="start">読めない・食い違い</text><text x="730" y="321" font-family="'SF Mono',Menlo,Monaco,monospace" font-size="24" fill="#a09aa4">PG-IAM-003</text><rect x="990" y="278" width="150" height="64" rx="32" fill="#8a5a00"/><text x="1065" y="322" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">止める</text></g></svg></div>

---

<!-- _class: crosshead -->

# さっそく止めてみます！

---

<!-- _class: image-full -->
<!-- _header: まとめ -->

# 経路ごと、デプロイ前に止める

<p class="lead">SCP・権限境界・ロール連鎖は、まだ対象外です。</p>

<div class="fig" style="--w:1010px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 14 1180 426" width="1180" height="426" font-family="'Hiragino Maru Gothic ProN','Zen Maru Gothic','Hiragino Sans',sans-serif"><defs><linearGradient id="sm-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2c35"/><stop offset="1" stop-color="#18181e"/></linearGradient><marker id="sm-ar-g" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#a09aa4"/></marker><marker id="sm-ar-r" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ff6b7d"/></marker><marker id="sm-ar-c" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#00c4e4"/></marker><marker id="sm-ar-ok" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#3ddc97"/></marker><marker id="sm-ar-a" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="#ffb020"/></marker></defs><style>
.fx{transform-box:fill-box;transform-origin:center}
.hold{opacity:0}
@keyframes pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes holdout{0%{opacity:1}99%{opacity:1}100%{opacity:0}}
@keyframes arm{from{transform:rotate(-78deg)}to{transform:rotate(0)}}
@keyframes mag{0%{transform:translateY(-180px)}35%{transform:translateY(-180px)}60%{transform:translateY(-90px)}85%,100%{transform:translateY(0)}}
@keyframes glow{0%,100%{opacity:.35}50%{opacity:1}}
.bespoke-marp-active .pop{animation:pop .5s cubic-bezier(.2,1.4,.4,1) var(--d,0s) both}
.bespoke-marp-active .fade{animation:fade .6s ease-out var(--d,0s) both}
.bespoke-marp-active .up{animation:up .6s ease-out var(--d,0s) both}
.bespoke-marp-active .hold{animation:holdout var(--d,1s) linear both}
.bespoke-marp-active .arm{animation:arm 1.1s ease-in var(--d,0s) both}
.bespoke-marp-active .mag{animation:mag 3.2s ease-in-out var(--d,0s) both}
.bespoke-marp-active .glow{animation:glow 1.6s ease-in-out var(--d,0s) infinite}
.arm{transform-origin:0% 50%}
</style><text x="40" y="40" font-size="28" font-weight="700" fill="#7fe3f5" text-anchor="start">ここまでの検査</text><g class="fx up" style="--d:0.3s"><text x="40" y="132" font-size="84" font-weight="700" fill="#ffffff">879</text><text x="40" y="174" font-size="28" font-weight="700" fill="#a09aa4" text-anchor="start">起動アクションを検査</text></g><g class="fx up" style="--d:0.9s"><text x="40" y="264" font-size="84" font-weight="700" fill="#ffffff">60/91</text><text x="40" y="306" font-size="28" font-weight="700" fill="#a09aa4" text-anchor="start">既知の昇格経路を検出</text></g><line x1="600" y1="20" x2="600" y2="322" stroke="#3c3c46" stroke-width="2"/><text x="660" y="40" font-size="28" font-weight="700" fill="#7fe3f5" text-anchor="start">Kiro で作った</text><g class="fx pop" style="--d:1.5s"><rect x="660" y="80" width="240" height="100" rx="38" fill="url(#sm-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(706 130.0) scale(0.85)"><rect x="-22" y="-26" width="44" height="56" rx="7" fill="none" stroke="#00c4e4" stroke-width="4.5"/><rect x="-11" y="-32" width="22" height="12" rx="4" fill="#00c4e4"/><rect x="-12" y="-4" width="24" height="4.5" rx="2" fill="#00c4e4"/><rect x="-12" y="8" width="24" height="4.5" rx="2" fill="#00c4e4"/><rect x="-12" y="20" width="14" height="4.5" rx="2" fill="#00c4e4"/></g><text x="752" y="139.0" font-size="26" font-weight="700" fill="#ffffff" text-anchor="start">spec × 7</text></g><g class="fx pop" style="--d:1.85s"><rect x="920" y="80" width="240" height="100" rx="38" fill="url(#sm-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(966 130.0) scale(0.85)"><circle cx="0" cy="0" r="28" fill="none" stroke="#00c4e4" stroke-width="4.5"/><path d="M0 -17 L8 0 L0 17 L-8 0 Z" fill="#00c4e4" transform="rotate(40)"/></g><text x="1012" y="139.0" font-size="26" font-weight="700" fill="#ffffff" text-anchor="start">steering</text></g><g class="fx pop" style="--d:2.2s"><rect x="660" y="195" width="240" height="100" rx="38" fill="url(#sm-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(706 245.0) scale(0.85)"><circle cx="0" cy="-24" r="6" fill="#00c4e4"/><path d="M0 -18 V10 A13 13 0 0 1 -26 10 M-26 10 L-33 3 M-26 10 L-19 3" fill="none" stroke="#00c4e4" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" transform="translate(13 0)"/></g><text x="752" y="254.0" font-size="26" font-weight="700" fill="#ffffff" text-anchor="start">hook</text></g><g class="fx pop" style="--d:2.55s"><rect x="920" y="195" width="240" height="100" rx="38" fill="url(#sm-tile)" stroke="#3c3c46" stroke-width="2"/><g transform="translate(966 245.0) scale(0.85)"><rect x="-14" y="-30" width="7" height="18" rx="3" fill="#00c4e4"/><rect x="7" y="-30" width="7" height="18" rx="3" fill="#00c4e4"/><rect x="-22" y="-14" width="44" height="26" rx="9" fill="none" stroke="#00c4e4" stroke-width="4.5"/><path d="M0 12 V24 Q0 31 -9 31" fill="none" stroke="#00c4e4" stroke-width="4.5" stroke-linecap="round"/></g><text x="1012" y="254.0" font-size="26" font-weight="700" fill="#ffffff" text-anchor="start">MCP</text></g><g class="fx up" style="--d:3.2s"><rect x="250" y="370" width="680" height="68" rx="34" fill="#00788c"/><text x="590" y="415" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">次は ロール連鎖とデータ境界へ</text></g></svg></div>

---

<!-- _class: appendix -->
<!-- _header: 補足 -->

# ルールID一覧

| ルールID | 見つけるもの | 例 |
| --- | --- | --- |
| PG-IAM-003 | 読めない構文、判定の食い違い | 読めないものは止める |
| PG-IAM-004 | 保護したいS3に届く権限昇格の経路 | 渡す → 起動 → S3 |
| PG-IAM-005 | ロールが自分でIAMを書き換えられる構成 | 自分に権限を付与 |
