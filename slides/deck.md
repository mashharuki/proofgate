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

![w:220](images/s1-cover.svg)

# ProofGate

synthで止める、権限昇格の道

---

<!-- _class: image-full -->
<!-- _header: 課題 -->

# 1つずつ見ればふつうの権限

![w:1180](images/s3-ordinary.svg)

---

<!-- _class: image-full -->
<!-- _header: 課題 -->

# 既存ツールの指摘はポリシー単位だった

![w:1100](images/s4-tools.svg)

---

<!-- _class: image-full -->
<!-- _header: 課題 -->

# 4つそろうと道ができる

![w:1180](images/s5-four.svg)

---

<!-- _class: image-full -->
<!-- _header: アプローチ -->

# 2つの実装が食い違えば止める

<p class="lead">TypeScript が出した4つの真偽値を、Lean が検査します。</p>

![w:1180](images/s7-agree.svg)

---

<!-- _class: image-full -->
<!-- _header: アプローチ -->

# 分からないものは通さない

![w:1180](images/s8-failclosed.svg)

---

<!-- _class: image-full -->
<!-- _header: 検証 -->

# 公開されている91の昇格経路で試した

![w:1100](images/s9-verify.svg)

---

<!-- _class: image-full -->
<!-- _header: まとめ -->

# 経路ごと、デプロイ前に止める


![w:900](images/s10-summary.svg)

---

<!-- _class: crosshead -->

# 止まったら、どう直す？

---

<!-- _class: image-full -->
<!-- _header: 補足 -->

# テンプレートから証明まで

![w:1180](images/s6-pipeline.svg)

---

<!-- _class: image-full -->
<!-- _header: 補足 -->

# Leanが見るのは4つの○×

<p class="lead">TypeScript が計算した4つの真偽値を、Lean が検査します。</p>

![w:1180](images/s7-booleans.svg)

---

<!-- _class: appendix -->
<!-- _header: 補足 -->

# ルールID一覧

| ルールID | 見つけるもの | 例 |
| --- | --- | --- |
| PG-IAM-003 | 読めない構文、判定の食い違い | 読めないものは止める |
| PG-IAM-004 | 保護したいS3に届く権限昇格の経路 | 渡す → 起動 → S3 |
| PG-IAM-005 | ロールが自分でIAMを書き換えられる構成 | 自分に権限を付与 |
