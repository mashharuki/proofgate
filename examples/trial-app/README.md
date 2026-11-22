# 試用アプリ（trial-app）

ProofGateを、利用者と同じ形で試すためのCDKアプリです。ふつうのCDKの書き方（`grantRead`、Lambda、API Gateway、ECSなど）に、危険な権限や読めない構文を1つずつ足した変種を、`-c variant=<名前>`で選びます。2026-11-20から2026-11-22まで、リポジトリの外（`~/git/proofgate-trial`）で使い、2026-11-22にここへ移しました。公開しないパッケージです。

保護対象バケットは`arn:aws:s3:::proofgate-trial-customer-data`です。AWSの認証情報もネットワークも使いません（合成だけです）。

## 実行方法

```bash
pnpm build
pnpm --filter @proofgate-cdk/trial-app variants   # 24の変種を合成し、data/expected-main.jsonと比べます（0: 一致、1: 差、2: ハーネスの異常）
cd examples/trial-app && PROOFGATE=1 pnpm exec cdk synth --quiet -c variant=risky   # 1つの変種
```

npmの公開版と比べるときは、公開版を使うコピーを作ります（ネットワークを使うのは`npm install`だけです）。

```bash
node examples/trial-app/scripts/prepare-npm-copy.mjs /tmp/trial-npm 1.1.2
cd /tmp/trial-npm && npm install && npx tsc -p tsconfig.json && node dist/run-variants.js --expected data/expected-npm-1.1.2.json
```

## ファイル

- `src/app.ts`: 変種のアプリ。`src/variants.ts`: 変種の一覧。`src/run-variants.ts`: すべての変種を合成して期待表と比べます。
- `src/probe.ts`: よく使うCDKのConstructを1つずつ試す探索用のアプリです（`PROBE=<名前>`、レビューした試験ではありません）。
- `data/predictions-*.txt`: 足した変種の予想です。どれも最初の実行の前に書きました。
- `data/results-*.txt`: 実行の記録です（日付、変種の数、比べた版）。`data/expected-*.json`は、最新の記録から作った期待表です。
- 結果のまとめは`docs/REAL_STACKS.md`の「npmの1.1.1を使った試用」と「今のコードを使った試用」にあります。

English: a CDK app that tries ProofGate the way a user does. Each variant (`-c variant=<name>`) adds one risky permission or one unreadable construct to an ordinary CDK layout. It was used outside the repository (`~/git/proofgate-trial`) from 2026-11-20 to 2026-11-22 and moved here on 2026-11-22; it is not published. `pnpm --filter @proofgate-cdk/trial-app variants` synthesizes all 24 variants with ProofGate and compares them with `data/expected-main.json` (exit 0 match, 1 difference, 2 harness error). To compare with a published version, `scripts/prepare-npm-copy.mjs <dir> <version>` makes a copy that uses that version from npm; then run `npm install`, `npx tsc`, and `node dist/run-variants.js --expected data/expected-npm-<version>.json` in it. `data/predictions-*.txt` were written before the first run of the variants they describe; `data/results-*.txt` are the run records. `src/probe.ts` is an exploratory probe of common constructs, not a reviewed test.
