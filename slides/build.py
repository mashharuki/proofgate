#!/usr/bin/env python3
"""
デモ動画用スライド（Marp）のビルドスクリプトです。
Build script for the demo-video slides (Marp).

  python3 slides/build.py           図(SVG)を生成し、PDFとアニメーション付きHTMLを書き出す
  python3 slides/build.py svg       図(SVG)だけを生成する

- 図は slides/images/*.svg に出力します。素材は自作の汎用イラストで、ロゴは使いません。
- PDFは静止画です（アニメーションの最終状態）。
- HTMLは図をインラインSVGに差し替え、表示中のスライドだけが動きます（画面録画用）。
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IMAGES = ROOT / "images"
OUT = ROOT / "out"

FONT = "'Hiragino Maru Gothic ProN','Zen Maru Gothic','Hiragino Sans',sans-serif"
MONO = "'SF Mono',Menlo,Monaco,monospace"
CY = "#00c4e4"
CYL = "#7fe3f5"
CYD = "#00788c"
RED = "#ff6b7d"
REDD = "#b3263a"
GRN = "#3ddc97"
GRND = "#1f7a55"
AMB = "#ffb020"
AMBD = "#8a5a00"
GRAY = "#a09aa4"
LINE = "#3c3c46"
WHITE = "#ffffff"

# 全SVGで共通のアニメーション。`.bespoke-marp-active`（表示中のスライド）の下でだけ動く。
# 付いていない場合（PDF・画像）は最終状態の静止画になる。
BASE_CSS = """
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
"""


def fx(kind: str, delay: float) -> str:
    return f'class="fx {kind}" style="--d:{delay}s"'


def svg(w: int, h: int, body: str, uid: str) -> str:
    """共通のdefs（タイルのグラデーションと矢尻）を持つSVGを返す。uidは同じ文書内でidを重複させないための接頭辞。"""
    markers = "".join(
        f'<marker id="{uid}-{name}" markerUnits="userSpaceOnUse" markerWidth="20" markerHeight="20" '
        f'refX="17" refY="10" orient="auto"><path d="M0 1 L18 10 L0 19 Z" fill="{color}"/></marker>'
        for name, color in (("ar-g", GRAY), ("ar-r", RED), ("ar-c", CY), ("ar-ok", GRN), ("ar-a", AMB))
    )
    defs = (
        f'<linearGradient id="{uid}-tile" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#2c2c35"/><stop offset="1" stop-color="#18181e"/></linearGradient>'
        + markers
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
        f'font-family="{FONT}"><defs>{defs}</defs><style>{BASE_CSS}</style>{body}</svg>'
    )


# ---------------------------------------------------------------------------------------------
# アイコン（中心が原点、±32px前後）。ロゴではなく汎用の形です。
# Icons centered on the origin. Generic shapes, not logos.
# ---------------------------------------------------------------------------------------------
def i_person(c: str) -> str:
    return (
        f'<circle cx="0" cy="-15" r="12" fill="{c}"/>'
        f'<path d="M-25 27 C-25 6 -12 0 0 0 C12 0 25 6 25 27 Z" fill="{c}"/>'
    )


def i_badge(c: str) -> str:
    return (
        f'<rect x="-24" y="-31" width="48" height="62" rx="9" fill="none" stroke="{c}" stroke-width="4.5"/>'
        f'<circle cx="0" cy="-12" r="7.5" fill="{c}"/>'
        f'<rect x="-14" y="3" width="28" height="5" rx="2.5" fill="{c}"/>'
        f'<rect x="-14" y="14" width="19" height="5" rx="2.5" fill="{c}"/>'
    )


def i_key(c: str) -> str:
    return (
        f'<circle cx="-14" cy="0" r="13" fill="none" stroke="{c}" stroke-width="5"/>'
        f'<circle cx="-14" cy="0" r="3.5" fill="{c}"/>'
        f'<rect x="-1" y="-3" width="35" height="6.5" rx="3" fill="{c}"/>'
        f'<rect x="19" y="2" width="6" height="13" rx="2" fill="{c}"/>'
        f'<rect x="29" y="2" width="6" height="9" rx="2" fill="{c}"/>'
    )


def i_fn(c: str) -> str:
    return f'<text x="0" y="19" font-size="58" font-weight="700" text-anchor="middle" fill="{c}">λ</text>'


def i_bucket(c: str) -> str:
    return (
        f'<ellipse cx="0" cy="-22" rx="28" ry="9" fill="none" stroke="{c}" stroke-width="4.5"/>'
        f'<path d="M-28 -22 L-22 25 Q0 36 22 25 L28 -22" fill="none" stroke="{c}" stroke-width="4.5" stroke-linejoin="round"/>'
        f'<path d="M-26 -3 Q0 9 26 -3" fill="none" stroke="{c}" stroke-width="4"/>'
    )


def i_doc(c: str) -> str:
    return (
        f'<path d="M-21 -31 H7 L23 -15 V31 H-21 Z" fill="none" stroke="{c}" stroke-width="4.5" stroke-linejoin="round"/>'
        f'<path d="M7 -31 V-15 H23" fill="none" stroke="{c}" stroke-width="4.5" stroke-linejoin="round"/>'
        f'<rect x="-11" y="0" width="22" height="4.5" rx="2" fill="{c}"/>'
        f'<rect x="-11" y="11" width="22" height="4.5" rx="2" fill="{c}"/>'
        f'<rect x="-11" y="22" width="13" height="4.5" rx="2" fill="{c}"/>'
    )


def i_code(c: str) -> str:
    return f'<text x="0" y="12" font-family="{MONO}" font-size="36" font-weight="700" text-anchor="middle" fill="{c}">&lt;/&gt;</text>'


def i_check(c: str, w: float = 7) -> str:
    return f'<path d="M-16 2 L-5 14 L17 -13" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'


def i_cross(c: str, w: float = 7) -> str:
    return f'<path d="M-14 -14 L14 14 M14 -14 L-14 14" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round"/>'


def i_play(c: str) -> str:
    return (
        f'<circle cx="0" cy="0" r="27" fill="none" stroke="{c}" stroke-width="4.5"/>'
        f'<path d="M-8 -14 L16 0 L-8 14 Z" fill="{c}"/>'
    )


def i_link(c: str) -> str:
    return (
        f'<rect x="-30" y="-12" width="40" height="24" rx="12" fill="none" stroke="{c}" stroke-width="5" transform="rotate(-38 -10 0) translate(-2 8)"/>'
        f'<rect x="-10" y="-12" width="40" height="24" rx="12" fill="none" stroke="{c}" stroke-width="5" transform="rotate(-38 10 0) translate(2 -8)"/>'
    )


def i_graph(c: str) -> str:
    return (
        f'<path d="M-18 14 L0 -16 L20 12" fill="none" stroke="{c}" stroke-width="4"/>'
        f'<circle cx="-18" cy="14" r="8" fill="{c}"/><circle cx="0" cy="-16" r="8" fill="{c}"/>'
        f'<circle cx="20" cy="12" r="8" fill="{c}"/>'
    )


def i_list(c: str) -> str:
    rows = "".join(
        f'<circle cx="-20" cy="{y}" r="4.5" fill="{c}"/><rect x="-9" y="{y - 3.5}" width="{w}" height="7" rx="3.5" fill="{c}"/>'
        for y, w in ((-18, 32), (0, 26), (18, 32))
    )
    return rows


def i_forall(c: str) -> str:
    return f'<text x="0" y="19" font-size="62" font-weight="700" text-anchor="middle" fill="{c}">∀</text>'


def i_clip(c: str) -> str:
    return (
        f'<rect x="-22" y="-26" width="44" height="56" rx="7" fill="none" stroke="{c}" stroke-width="4.5"/>'
        f'<rect x="-11" y="-32" width="22" height="12" rx="4" fill="{c}"/>'
        f'<rect x="-12" y="-4" width="24" height="4.5" rx="2" fill="{c}"/>'
        f'<rect x="-12" y="8" width="24" height="4.5" rx="2" fill="{c}"/>'
        f'<rect x="-12" y="20" width="14" height="4.5" rx="2" fill="{c}"/>'
    )


def i_compass(c: str) -> str:
    return (
        f'<circle cx="0" cy="0" r="28" fill="none" stroke="{c}" stroke-width="4.5"/>'
        f'<path d="M0 -17 L8 0 L0 17 L-8 0 Z" fill="{c}" transform="rotate(40)"/>'
    )


def i_hook(c: str) -> str:
    return (
        f'<circle cx="0" cy="-24" r="6" fill="{c}"/>'
        f'<path d="M0 -18 V10 A13 13 0 0 1 -26 10 M-26 10 L-33 3 M-26 10 L-19 3" fill="none" stroke="{c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" transform="translate(13 0)"/>'
    )


def i_plug(c: str) -> str:
    return (
        f'<rect x="-14" y="-30" width="7" height="18" rx="3" fill="{c}"/><rect x="7" y="-30" width="7" height="18" rx="3" fill="{c}"/>'
        f'<rect x="-22" y="-14" width="44" height="26" rx="9" fill="none" stroke="{c}" stroke-width="4.5"/>'
        f'<path d="M0 12 V24 Q0 31 -9 31" fill="none" stroke="{c}" stroke-width="4.5" stroke-linecap="round"/>'
    )


def i_magnifier(c: str) -> str:
    return (
        f'<circle cx="-7" cy="-7" r="17" fill="rgba(0,0,0,.45)" stroke="{c}" stroke-width="6"/>'
        f'<path d="M6 6 L26 26" stroke="{c}" stroke-width="8" stroke-linecap="round"/>'
    )


def g(x: float, y: float, inner: str, scale: float = 1.0) -> str:
    return f'<g transform="translate({x} {y}) scale({scale})">{inner}</g>'


def tile(cx: float, cy: float, icon: str, s: float = 96, fill: str | None = None, uid: str = "u", scale: float = 1.0) -> str:
    fill = fill or f"url(#{uid}-tile)"
    stroke = "none" if fill and not fill.startswith("url") else LINE
    return (
        f'<rect x="{cx - s / 2}" y="{cy - s / 2}" width="{s}" height="{s}" rx="{s * 0.2:.0f}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>'
        + g(cx, cy, icon, scale)
    )


def label(x: float, y: float, text: str, size: int = 24, color: str = WHITE, weight: int = 700, anchor: str = "middle") -> str:
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}">{text}</text>'


def chip(x: float, y: float, w: float, h: float, icon: str, text: str, uid: str, mark: str | None = None, icon_scale: float = 0.7) -> str:
    """権限を表す札。左にアイコン、右に✓。"""
    out = (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h / 2.6:.0f}" fill="url(#{uid}-tile)" stroke="{LINE}" stroke-width="2"/>'
        + g(x + 46, y + h / 2, icon, icon_scale)
        + label(x + 88, y + h / 2 + 9, text, 26, WHITE, 700, "start")
    )
    if mark == "ok":
        out += (
            f'<circle cx="{x + w - 36}" cy="{y + h / 2}" r="19" fill="{GRND}"/>'
            + g(x + w - 36, y + h / 2, i_check(WHITE, 6.5), 0.72)
        )
    return out


def arrow(x1: float, y1: float, x2: float, y2: float, color: str, uid: str, kind: str, width: float = 5) -> str:
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}" stroke-linecap="round" marker-end="url(#{uid}-{kind})"/>'


# ---------------------------------------------------------------------------------------------
# 図
# ---------------------------------------------------------------------------------------------
def fig_overview() -> str:
    u = "ov"
    cy = 175
    body = ""
    body += f'<g {fx("pop", 0.3)}>' + tile(110, cy, i_code(CY), uid=u) + label(110, cy + 88, "CDK アプリ", 24) + "</g>"
    body += f'<g {fx("fade", 0.9)}>' + arrow(175, cy, 312, cy, GRAY, u, "ar-g") + label(244, cy - 24, "cdk synth", 24, GRAY, 600) + "</g>"
    body += f'<g {fx("pop", 1.3)}>' + tile(380, cy, i_doc(CY), uid=u) + label(380, cy + 88, "CloudFormation", 24) + "</g>"
    body += f'<g {fx("fade", 1.9)}>' + arrow(448, cy, 580, cy, GRAY, u, "ar-g") + "</g>"
    # 関門: 台座、2本の柱、下りる遮断棒
    gx = 690
    body += f'<g {fx("pop", 2.3)}>'
    body += f'<rect x="{gx - 80}" y="{cy - 80}" width="160" height="160" rx="32" fill="{CYD}"/>'
    body += f'<rect x="{gx - 52}" y="{cy - 46}" width="14" height="92" rx="5" fill="{WHITE}"/>'
    body += f'<rect x="{gx + 38}" y="{cy - 46}" width="14" height="92" rx="5" fill="{WHITE}"/>'
    body += "</g>"
    body += f'<g {fx("arm", 3.0)}><rect x="{gx - 45}" y="{cy - 10}" width="90" height="16" rx="6" fill="{RED}"/></g>'
    body += label(gx, cy + 118, "ProofGate", 30, CY)
    body += f'<g {fx("fade", 4.2)}>'
    body += arrow(776, cy - 32, 922, 88, GRN, u, "ar-ok") + arrow(776, cy + 32, 922, 262, RED, u, "ar-r")
    body += "</g>"
    body += f'<g {fx("pop", 4.4)}>' + tile(980, 88, i_check(WHITE, 8), 88, GRND, u) + label(1044, 99, "通す", 30, GRN, 700, "start") + "</g>"
    body += f'<g {fx("pop", 4.8)}>' + tile(980, 262, i_cross(WHITE, 8), 88, REDD, u) + label(1044, 273, "止める", 30, RED, 700, "start") + "</g>"
    return svg(1180, 370, body, u)


def fig_ordinary() -> str:
    u = "od"
    body = ""
    chips = (
        (10, i_key(CY), "ロールを渡せる"),
        (415, i_fn(CY), "関数を作れる"),
        (820, i_bucket(CY), "S3を読み書き"),
    )
    for n, (x, icon, text) in enumerate(chips):
        body += f'<g {fx("pop", 0.3 + n * 0.6)}>' + chip(x, 12, 350, 72, icon, text, u, "ok") + "</g>"
    y = 270
    xs = (130, 430, 730, 1030)
    icons = (i_person(WHITE), i_fn(WHITE), i_badge(WHITE), i_bucket(WHITE))
    names = ("DeveloperRole", "Lambda", "ProtectedDataRole", "S3バケット")
    for n, (x, icon, name) in enumerate(zip(xs, icons, names)):
        fill = REDD if n == 3 else None
        body += f'<g {fx("pop", 2.2 + n * 0.45)}>' + tile(x, y, icon, 96, fill, u) + label(x, y + 90, name, 24, WHITE, 600) + "</g>"
    verbs = ("渡す", "動かす", "届く")
    for n, v in enumerate(verbs):
        x0, x1 = xs[n] + 62, xs[n + 1] - 62
        body += f'<g {fx("fade", 2.45 + n * 0.45)}>' + arrow(x0, y, x1, y, RED, u, "ar-r", 6) + label((x0 + x1) / 2, y - 22, v, 24, RED, 700) + "</g>"
    return svg(1180, 390, body, u)


def fig_blindspot() -> str:
    u = "bs"
    body = ""
    body += label(290, 34, "1つずつ見る", 28, GRAY, 700)
    body += label(880, 34, "つなげて見る", 28, CYL, 700)
    body += f'<line x1="590" y1="20" x2="590" y2="350" stroke="{LINE}" stroke-width="2"/>'
    rows = ((70, i_key(CY), "ロールを渡せる"), (160, i_fn(CY), "関数を作れる"), (250, i_bucket(CY), "S3を読み書き"))
    for n, (y, icon, text) in enumerate(rows):
        body += f'<g {fx("pop", 0.3 + n * 0.9)}>' + chip(30, y, 440, 72, icon, text, u, "ok") + "</g>"
    # 虫眼鏡は上の札から順に下へ動き、最終状態では一番下の札の右側に置く
    body += f'<g {fx("mag", 0.2)}>' + g(530, 290, i_magnifier(WHITE), 1.3) + "</g>"
    xs = (690, 835, 980, 1125)
    icons = (i_person(WHITE), i_fn(WHITE), i_badge(WHITE), i_bucket(WHITE))
    for n, (x, icon) in enumerate(zip(xs, icons)):
        fill = REDD if n == 3 else None
        body += f'<g {fx("pop", 1.2 + n * 0.35)}>' + tile(x, 170, icon, 76, fill, u, 0.7) + "</g>"
    for n in range(3):
        body += f'<g {fx("fade", 1.4 + n * 0.35)}>' + arrow(xs[n] + 44, 170, xs[n + 1] - 44, 170, RED, u, "ar-r", 5) + "</g>"
    body += f'<g {fx("pop", 2.8)}><rect x="800" y="262" width="300" height="64" rx="32" fill="{REDD}"/>' + label(950, 304, "経路が見える", 28, WHITE) + "</g>"
    return svg(1180, 360, body, u)


def fig_four() -> str:
    u = "fo"
    body = ""
    cards = (
        (i_key(CY), "渡せる"),
        (i_play(CY), "起動できる"),
        (i_link(CY), "信頼される"),
        (i_bucket(CY), "届く"),
    )
    for n, (icon, text) in enumerate(cards):
        x = 45 + n * 290
        d = 0.3 + n * 0.7
        body += f'<g {fx("pop", d)}>'
        body += f'<rect x="{x}" y="14" width="240" height="250" rx="34" fill="url(#{u}-tile)" stroke="{LINE}" stroke-width="2"/>'
        body += f'<circle cx="{x + 38}" cy="54" r="22" fill="{CYD}"/>' + label(x + 38, 63, str(n + 1), 26, WHITE)
        body += g(x + 120, 125, icon, 1.7)
        body += label(x + 120, 232, text, 32, WHITE)
        body += "</g>"
        if n < 3:
            body += f'<g {fx("fade", d + 0.5)}>' + label(x + 265, 152, "＋", 40, RED, 700) + "</g>"
    body += f'<g {fx("pop", 3.4)}><rect x="140" y="306" width="900" height="72" rx="36" fill="{REDD}"/>'
    body += label(190, 355, "全部そろうと、権限昇格の経路あり", 32, WHITE, 700, "start")
    body += f'<text x="1000" y="353" font-family="{MONO}" font-size="26" fill="#ffd2d8" text-anchor="end">PG-IAM-004</text></g>'
    return svg(1180, 400, body, u)


def fig_pipeline() -> str:
    u = "pl"
    body = ""
    xs = (130, 430, 730, 1030)
    steps = ((i_doc(WHITE), "テンプレート"), (i_graph(WHITE), "モデル"), (i_list(WHITE), "候補の経路"), (i_forall(WHITE), "証明"))
    for n, (x, (icon, name)) in enumerate(zip(xs, steps)):
        fill = CYD if n == 3 else None
        body += f'<g {fx("pop", 0.3 + n * 0.8)}>' + tile(x, 170, icon, 120, fill, u, 1.3) + label(x, 170 + 60 + 44, name, 28, WHITE) + "</g>"
        if n < 3:
            body += f'<g {fx("fade", 0.7 + n * 0.8)}>' + arrow(x + 76, 170, xs[n + 1] - 76, 170, CY, u, "ar-c", 5) + "</g>"
    # 担当の帯: モデルと候補はTypeScript、証明はLean
    body += f'<g {fx("fade", 2.0)}>'
    body += f'<path d="M370 94 V82 H790 V94" fill="none" stroke="{CYL}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' + label(580, 58, "TypeScript", 26, CYL)
    body += "</g>"
    body += f'<g {fx("fade", 2.9)}>'
    body += f'<path d="M970 94 V82 H1090 V94" fill="none" stroke="{CYL}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' + label(1030, 58, "Lean 4", 26, CYL)
    body += "</g>"
    return svg(1180, 320, body, u)


def fig_booleans() -> str:
    u = "bl"
    body = ""
    names = ("渡せる", "起動できる", "信頼される", "届く")
    ys = (95, 165, 235, 305)
    for n, (name, y) in enumerate(zip(names, ys)):
        d = 0.6 + n * 0.7
        body += label(40, y + 10, name, 30, WHITE, 700, "start")
        # false（灰）は最初だけ見える。最終状態はtrue（赤）。
        body += f'<g class="hold" style="--d:{d}s"><rect x="300" y="{y - 30}" width="130" height="60" rx="30" fill="#3a3640"/>' + label(365, y + 9, "false", 26, GRAY) + "</g>"
        body += f'<g {fx("pop", d)}><rect x="300" y="{y - 30}" width="130" height="60" rx="30" fill="{REDD}"/>' + label(365, y + 9, "true", 26, WHITE) + "</g>"
        body += f'<line x1="440" y1="{y}" x2="560" y2="{y}" stroke="{LINE}" stroke-width="4"/>'
    body += f'<path d="M560 60 H645 A135 135 0 0 1 645 330 H560 Z" fill="url(#{u}-tile)" stroke="{CY}" stroke-width="3"/>'
    body += label(640, 207, "AND", 34, CY)
    body += f'<line x1="780" y1="195" x2="826" y2="195" stroke="{LINE}" stroke-width="4"/>'
    d = 3.4
    body += f'<g class="hold" style="--d:{d}s"><rect x="830" y="135" width="330" height="120" rx="26" fill="{GRND}"/>' + label(995, 214, "SAFE", 50, WHITE) + "</g>"
    body += f'<g {fx("pop", d)}><rect x="830" y="135" width="330" height="120" rx="26" fill="{REDD}"/>' + label(995, 214, "UNSAFE", 50, WHITE) + "</g>"
    return svg(1180, 370, body, u)


def fig_failclosed() -> str:
    u = "fc"
    body = ""
    body += f'<g {fx("pop", 0.3)}>' + tile(100, 165, i_doc(WHITE), 112, None, u, 1.2) + label(100, 165 + 56 + 38, "テンプレート", 24, WHITE) + "</g>"
    cards = (
        (20, GRN, "経路なし", "", "通す", GRND, "ar-ok"),
        (140, RED, "経路あり", "PG-IAM-004 / 005", "止める", REDD, "ar-r"),
        (260, AMB, "読めない", "PG-IAM-003", "止める", AMBD, "ar-a"),
    )
    for n, (y, edge, cond, code, act, fill, mk) in enumerate(cards):
        d = 0.9 + n * 0.7
        body += f'<g {fx("fade", d)}><path d="M162 165 C250 165 250 {y + 50} 350 {y + 50}" fill="none" stroke="{edge}" stroke-width="4" marker-end="url(#{u}-{mk})"/></g>'
        body += f'<g {fx("pop", d + 0.2)}>'
        body += f'<rect x="364" y="{y}" width="796" height="100" rx="26" fill="url(#{u}-tile)" stroke="{edge}" stroke-width="3"/>'
        body += label(400, y + 63, cond, 32, WHITE, 700, "start")
        if code:
            body += f'<text x="730" y="{y + 61}" font-family="{MONO}" font-size="24" fill="{GRAY}">{code}</text>'
        body += f'<rect x="990" y="{y + 18}" width="150" height="64" rx="32" fill="{fill}"/>' + label(1065, y + 62, act, 30, WHITE)
        body += "</g>"
    return svg(1180, 380, body, u)


def fig_summary() -> str:
    u = "sm"
    body = ""
    body += label(40, 40, "まだ対象外", 28, CYL, 700, "start")
    for i, (t, d) in enumerate([("SCP", 0.3), ("権限境界", 0.9), ("ロールの連鎖", 1.5)]):
        x = 40 + i * 380
        body += f'<g {fx("up", d)}><rect x="{x}" y="80" width="340" height="150" rx="20" fill="none" stroke="{LINE}" stroke-width="2"/>' + label(x + 170, 168, t, 40, WHITE) + "</g>"
    body += f'<g {fx("up", 2.4)}><rect x="250" y="300" width="680" height="68" rx="34" fill="{CYD}"/>' + label(590, 345, "次は ロール連鎖とデータ境界へ", 30, WHITE) + "</g>"
    body += f'<g {fx("fade", 3.0)}><text x="590" y="440" font-family="{MONO}" font-size="28" fill="{CYL}" text-anchor="middle">github.com/mashharuki/proofgate</text></g>'
    return svg(1180, 470, body, u)
def fig_cover() -> str:
    u = "cv"
    gx, cy = 110, 90
    body = ""
    body += f'<g {fx("pop", 0.2)}>'
    body += f'<rect x="{gx - 80}" y="{cy - 80}" width="160" height="160" rx="32" fill="{CYD}"/>'
    body += f'<rect x="{gx - 52}" y="{cy - 46}" width="14" height="92" rx="5" fill="{WHITE}"/>'
    body += f'<rect x="{gx + 38}" y="{cy - 46}" width="14" height="92" rx="5" fill="{WHITE}"/>'
    body += "</g>"
    body += f'<g {fx("arm", 0.9)}><rect x="{gx - 45}" y="{cy - 10}" width="90" height="16" rx="6" fill="{RED}"/></g>'
    return svg(220, 180, body, u)


def fig_verify() -> str:
    u = "vf"
    rows = (
        ("ロールを渡して新しく動かす", 46, 47, True),
        ("動いているものを書き換える", 6, 22, False),
        ("ほかの主体に成りすます", 6, 14, False),
        ("自分の権限を書き換える", 2, 8, False),
    )
    body = ""
    x0, track = 470, 480
    for n, (name, hit, total, lead) in enumerate(rows):
        y = 50 + n * 78
        d = 0.3 + n * 0.5
        body += f'<g {fx("fade", d)}>' + label(40, y + 10, name, 28, WHITE, 700, "start") + "</g>"
        body += f'<rect x="{x0}" y="{y - 20}" width="{track}" height="40" rx="20" fill="#2a2830"/>'
        body += f'<rect {fx("grow", d)} x="{x0}" y="{y - 20}" width="{track * hit / total:.0f}" height="40" rx="20" fill="{CYD if lead else "#4a8a96"}"/>'
        body += f'<g {fx("fade", d + 0.5)}><text x="1140" y="{y + 14}" font-size="44" font-weight="700" fill="{WHITE}" text-anchor="end">{hit}/{total}</text></g>'
    body += f'<line x1="40" y1="334" x2="1140" y2="334" stroke="{LINE}" stroke-width="2"/>'
    body += f'<g {fx("up", 2.6)}>' + label(40, 392, "全部で", 28, GRAY, 700, "start") + f'<text x="1140" y="398" font-size="64" font-weight="700" fill="{CYL}" text-anchor="end">60/91</text></g>'
    body += f'<g {fx("up", 3.2)}>' + label(40, 456, "未検出31件の内訳: IAMユーザー・グループ11、既存リソースの書き換え16、ほか4", 26, GRAY, 600, "start") + "</g>"
    return svg(1180, 470, body, u).replace('viewBox="0 0 1180 470" width="1180" height="470"', 'viewBox="0 6 1180 464" width="1180" height="464"')


def fig_tools() -> str:
    """既存ツールの指摘は1か所、ProofGateは経路。丸の枠は、ツールが指す場所。"""
    u = "tl"
    rows = (("cdk-nag", False), ("Checkov", False), ("Access Analyzer", False), ("ProofGate", True))
    xs = (560, 720, 880, 1040)
    icons = (i_person(WHITE), i_fn(WHITE), i_badge(WHITE), i_bucket(WHITE))
    body = ""
    for n, (name, chain) in enumerate(rows):
        y = 58 + n * 104 + (22 if chain else 0)
        d = 0.3 + n * 0.7
        body += f'<g {fx("fade", d)}>' + label(40, y + 10, name, 30, CYL if chain else WHITE, 700, "start") + "</g>"
        for k, (x, icon) in enumerate(zip(xs, icons)):
            lit = chain or k == 0
            fill = REDD if (chain and k == 3) else None
            op = 1 if lit else 0.22
            body += f'<g {fx("pop", d + 0.1)} opacity="{op}">' + tile(x, y, icon, 76, fill, u, 0.7) + "</g>"
        if chain:
            for k in range(3):
                body += f'<g {fx("fade", d + 0.5 + k * 0.3)}>' + arrow(xs[k] + 46, y, xs[k + 1] - 46, y, RED, u, "ar-r", 5) + "</g>"
        else:
            body += f'<g {fx("pop", d + 0.4)}><rect x="{xs[0] - 45}" y="{y - 45}" width="90" height="90" rx="22" fill="none" stroke="{AMB}" stroke-width="5"/></g>'
    return svg(1180, 450, body, u).replace('viewBox="0 0 1180 450" width="1180" height="450"', 'viewBox="0 -40 1180 490" width="1180" height="490"')


def fig_agree() -> str:
    """TypeScriptとLeanが別々に判定し、食い違えば止める。"""
    u = "ag"
    body = ""
    body += f'<g {fx("pop", 0.3)}>' + tile(100, 200, i_graph(WHITE), 96, None, u, 1.1) + label(100, 288, "モデル", 24, WHITE, 600) + "</g>"
    lanes = ((100, i_code(CY), "TypeScript"), (300, i_forall(WHITE), "Lean 4"))
    for n, (y, icon, name) in enumerate(lanes):
        d = 0.9 + n * 0.8
        fill = CYD if n == 1 else None
        body += f'<g {fx("fade", d)}>' + arrow(160, 200, 276, y + (22 if n == 0 else -22), GRAY, u, "ar-g") + "</g>"
        body += f'<g {fx("pop", d + 0.2)}>' + tile(330, y, icon, 92, fill, u, 0.8) + label(396, y + 10, name, 28, WHITE, 700, "start") + "</g>"
        body += f'<g {fx("pop", d + 0.6)}><rect x="570" y="{y - 26}" width="110" height="52" rx="26" fill="{REDD}"/>' + label(625, y + 9, "判定", 26, WHITE) + "</g>"
        body += f'<g {fx("fade", d + 0.8)}>' + arrow(684, y, 722, 200 + (-32 if n == 0 else 32), GRAY, u, "ar-g", 4) + "</g>"
    body += f'<g {fx("pop", 2.9)}><circle cx="770" cy="200" r="62" fill="url(#{u}-tile)" stroke="{CY}" stroke-width="3"/>' + label(770, 210, "一致？", 26, CYL) + "</g>"
    body += f'<g {fx("fade", 3.4)}>' + arrow(824, 164, 888, 112, GRN, u, "ar-ok", 4) + arrow(824, 236, 888, 288, AMB, u, "ar-a", 4) + "</g>"
    body += f'<g {fx("pop", 3.6)}><rect x="892" y="80" width="268" height="64" rx="32" fill="{GRND}"/>' + label(1026, 121, "一致 → そのまま", 26, WHITE) + "</g>"
    body += f'<g {fx("pop", 4.0)}><rect x="892" y="256" width="268" height="64" rx="32" fill="{AMBD}"/>' + label(1026, 297, "食い違い → 止める", 26, WHITE) + f'<text x="1026" y="352" font-family="{MONO}" font-size="24" fill="{GRAY}" text-anchor="middle">PG-IAM-003</text></g>'
    return svg(1180, 380, body, u)


FIGURES = {
    "s4-tools": fig_tools,
    "s7-agree": fig_agree,
    "s9-verify": fig_verify,
    "s1-cover": fig_cover,
    "s2-overview": fig_overview,
    "s3-ordinary": fig_ordinary,
    "s4-blindspot": fig_blindspot,
    "s5-four": fig_four,
    "s6-pipeline": fig_pipeline,
    "s7-booleans": fig_booleans,
    "s8-failclosed": fig_failclosed,
    "s10-summary": fig_summary,
}


def write_svgs() -> None:
    IMAGES.mkdir(parents=True, exist_ok=True)
    for name, fn in FIGURES.items():
        (IMAGES / f"{name}.svg").write_text(fn(), encoding="utf-8")
    print(f"svg: {len(FIGURES)} files -> {IMAGES}")


# ---------------------------------------------------------------------------------------------
# 書き出し
# ---------------------------------------------------------------------------------------------
def run(cmd: list[str]) -> None:
    print("$", " ".join(cmd))
    subprocess.run(cmd, check=True, cwd=ROOT)


def inline_svgs(markdown: str) -> str:
    """`![...](images/x.svg)` をインラインSVGへ置き換える（CSSアニメーションを動かすため）。"""

    def repl(match: re.Match[str]) -> str:
        text = (IMAGES / Path(match.group(2)).name).read_text(encoding="utf-8")
        text = re.sub(r">\s+<", "><", text.strip())
        width = re.search(r"w:(\d+)", match.group(1))
        style = f' style="--w:{width.group(1)}px"' if width else ""
        return f'<div class="fig"{style}>{text}</div>'

    return re.sub(r"!\[([^\]]*)\]\((images/[^)]+\.svg)\)", repl, markdown)


def build() -> None:
    write_svgs()
    OUT.mkdir(exist_ok=True)
    theme = str(ROOT / "theme" / "minorun-dark.css")
    run(["marp", "--no-stdin", "deck.md", "--pdf", "--theme", theme, "--allow-local-files", "-o", "out/deck.pdf"])
    anim = ROOT / "out" / "deck-anim.md"
    anim.write_text(inline_svgs((ROOT / "deck.md").read_text(encoding="utf-8")), encoding="utf-8")
    run(["marp", "--no-stdin", "out/deck-anim.md", "--html", "--theme", theme, "--allow-local-files", "-o", "out/deck.html"])


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "svg":
        write_svgs()
    else:
        build()
