import { createApp } from "./create-app.js";

/**
 * 実際のCDKコードに近いPatternを、名前（-c pattern=RS-02）で選んで合成するアプリです。
 * PROOFGATE=1のときだけ、ProofGateの検証プラグインを登録します（デモアプリと同じ切り替えです）。
 */
createApp({ gated: process.env.PROOFGATE === "1" }).synth();
