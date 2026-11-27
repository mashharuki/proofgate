# ProofGate ナレーション台本（日本語の要点 → やさしい英語）
# ProofGate narration script (Japanese key points, then plain English)

前提 / Assumptions
- 3分以内の1本にする。スライド約73秒 + 動画 93.6秒 = 約167秒（余裕 約13秒）。
- スライド2を削除し、順序は 1, 3〜8, 10, 9, 動画 とする（提案。承認待ち。`deck.md` はまだ直していない）。
- 英語の語数は、1秒あたり約2.3語までに抑えた（合成音声の標準速度で、聞き取りやすい速さ）。
- 動画の部分は、画面の字幕をそのままナレーションにする（すでに短く平易な英語）。
- 「Lean が証明する」とは言わない。Lean は TypeScript が出した4つの真偽値を検査する（`docs/ASSUMPTIONS.md`）。
- 合成音声での読み: `PG-IAM-004` は「P G, I A M, zero zero four」と読ませる（ハイフンで切る）。`S3` は「S three」。`SCP` は「S C P」。

## A. スライド部分（約73秒）

| # | 見出し | 秒 | 語数の上限 |
|---|---|---|---|
| 1 | 表紙 | 4 | 9 |
| 3 | 1つずつ見ればふつうの権限 | 9 | 20 |
| 4 | 既存ツールの指摘はポリシー単位だった | 8 | 18 |
| 5 | 4つそろうと道ができる | 12 | 27 |
| 6 | 2つの実装が食い違えば止める | 10 | 23 |
| 7 | 分からないものは通さない | 8 | 18 |
| 8 | 公開されている91の昇格経路で試した | 11 | 25 |
| 10 | 経路ごと、デプロイ前に止める（限界と次） | 8 | 18 |
| 9 | 中扉 | 3 | 7 |

### 1. 表紙（4秒）
- 日本語: ProofGate は、synth の時点で、権限昇格の道を止めます。
- English (8 words): ProofGate stops privilege escalation paths at synth time.

### 3. 課題（9秒）
- 日本語: ロールを渡せる、関数を作れる、S3を読み書きできる。1つずつ見れば、ふつうの権限です。でも、つなぐと、開発者から Lambda を通って、保護したいバケットに届きます。
- English (17 words): Each permission looks normal alone. But together, a developer can reach a protected bucket through Lambda.

### 4. 既存ツールとの違い（8秒）
- 日本語: 既存ツールは、ポリシーを1つずつ見ます。ProofGate は、バケットまでの道をつなげて見ます。
- English (16 words): The checks we ran reported policy-level findings. ProofGate showed the path to the protected bucket.
- 言わないこと: 「ほかのツールは検出できない」（Access Analyzer は PassRole の有無を検出できる。`deck-notes.md` 参照）。

### 5. 道ができる条件（12秒）
- 日本語: 道には4つの条件があります。ロールを渡せる。サービスを起動できる。そのサービスがロールを信頼する。ロールがバケットに届く。全部そろうと、PG-IAM-004 です。
- English (32 words): A path needs four things: pass a role, launch a service, the role's trust policy allows the service to assume it, and the role reaches the bucket. All four together mean PG-IAM-004.

### 6. 2つの実装が食い違えば止める（10秒）
- 日本語: 同じモデルを、TypeScript と Lean 4 が別々に判定します。Lean が見るのは、4つの真偽値です。食い違えば、止めます。
- English (20 words): TypeScript and Lean 4 judge the same model separately. Lean checks four true-or-false values. If they disagree, ProofGate stops.

### 7. 分からないものは通さない（8秒）
- 日本語: 読めない構文や、判定の食い違いも止めます。PG-IAM-003 です。
- English (15 words): ProofGate also stops what it does not understand. Unsupported syntax or a disagreement gives PG-IAM-003.

### 8. 検証（11秒）
- 日本語: 公開されている91の昇格経路で試しました。60件を検出します。ロールを渡す形は47件中46件です。残り31件は、今はまだ扱っていない形です。
- English (23 words): We tried 91 public escalation paths. ProofGate found 60. That includes 46 of 47 role-passing paths. The other 31 are not handled yet.
- 注意: 「対象外のため」とは言わない。今後の対応を約束しない（`deck-notes.md`）。

### 10. まとめ（8秒）
- 日本語: SCP、権限境界、ロールの連鎖は、まだ対象外です。次は、ロール連鎖とデータ境界です。
- English (15 words): Not covered yet: S C P s, permissions boundaries, and role chains. Role chains and data perimeters come next.
- 注意: 532件の話は、動画の後半にあるので、ここでは言わない（重複を避ける）。

### 9. 中扉（3秒）
- 日本語: 止まったら、どう直すのか。
- English (7 words): Once blocked, how do you fix it?

## B. 動画部分（93.6秒）：画面の字幕をそのまま読む

字幕は5秒おきの抽出とOCRで読んだもの。実際の切り替わり時刻は、合成の前に動画で確認する。

| 目安 | 字幕（= ナレーション） | 語数 |
|---|---|---|
| 0〜5秒 | Would you approve this CDK change? （見出しを読む） | 6 |
| 5〜10秒 | Would you approve it for a stack that handles customer data? | 12 |
| 10〜15秒 | ProofGate finds an IAM path to the protected bucket. | 10 |
| 15〜20秒 | PG-IAM-004 stops synthesis before the change can ship. | 8 |
| 20〜25秒 | With ProofGate still enabled, synthesis succeeds. | 7 |
| 25〜35秒 | ProofGate is an AWS CDK validation plugin for platform and security engineers. | 12 |
| 35〜40秒 | It checks a model of the synthesized template with Lean and reports findings during synthesis. | 15 |
| 40〜45秒 | （字幕なし。コード画面。無音か、短い説明を足す） | |
| 45〜50秒 | This policy uses a variable that ProofGate cannot evaluate. | 10 |
| 50〜55秒 | PG-IAM-003 blocks synthesis when that input is unsupported. | 8 |
| 55〜60秒 | In a local rerun, we restrict the policy to one demo folder. | 12 |
| 60〜65秒 | With ProofGate enabled, synthesis exits with code zero. | 9 |
| 65〜70秒 | In Kiro IDE, we used the AWS Documentation MCP to study the rules. | 13 |
| 70〜75秒 | Then we wrote a spec for a case we had missed: access to part of a bucket. | 16 |
| 75〜80秒 | The generated test suite started with 532 missed-path failures. | 10 |
| 80〜85秒 | After fixing the question-mark wildcard, 178 failures remained. | 9 |
| 85〜90秒 | Fixing how we counted access to part of a bucket brought that to zero. | 14 |
| 90〜94秒 | Lean checks the finite model built from the synthesized CDK template. | 11 |

- 5秒あたり 16語の行（70〜75秒）が最長で、約3.2語/秒。合成音声の速度を少し上げるか、行を短くする必要がある。「Then we wrote a spec for a missed case: access to part of a bucket.」（14語）にすると収まる。
- 最後の行は、スライド6の説明（Lean は有限のモデルを検査する）と重なる。動画の最後は、リンクの紹介（`github.com/mashharuki/proofgate`、バージョン 1.2.0）に変えるほうが、締めとして自然。
- 動画の字幕の2つ目の画面（5〜10秒）は、動画の画面の見出しと合わせて、CI の結果を見せる時間。

## C. 英語を作るときの決まり

- 1文は15語以内。主語と動詞をはっきり書く。
- 受け身と関係代名詞を避ける。
- 数字は、そのまま読める形で書く（91, 60, 46 of 47, 532, 178）。
- ルールIDは `PG-IAM-004` のように書き、読み方は合成の設定で指定する。
- 「prove」「proof」は使わない。「check」を使う。
