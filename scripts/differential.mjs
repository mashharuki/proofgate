// 差分確認（spec proofgate-cdk-construct-support, Task 9.1, Properties P1 and P2）です。
// 1.0.1の抽出器と評価器、今の抽出器と評価器を、同じ入力に適用して比べます。
// Differential check of the 1.0.1 extractor and evaluator against the current ones (Task 9.1).
//
// 使い方 / Usage (see tasks.md, Task 9.1):
//   node scripts/differential.mjs --old <worktree of 1.0.1 with built packages> --support <compiled tests/pbt/support>
//
// 入力: 実スタックの14 Patternのテンプレート、回帰JSONのモデル、Model-levelの生成Case、Extractor-levelの生成断片。
// 出力: 消えた指摘（P1、1件でもあれば終了コード1）、PG-IAM-003から受理に変わった入力と、それを読めるようにした規則（P2）、
// 新しく増えた指摘。Leanは使いません（TypeScriptとLeanの一致は既存のテストが検査します）。
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const argument = (name) => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined) throw new Error(`${name} <dir> is required`);
  return resolve(value);
};
const oldRoot = argument("--old");
const support = argument("--support");
const load = (path) => import(pathToFileURL(path).href);

const oldExtractor = await load(join(oldRoot, "packages/extractor/dist/index.js"));
const oldCore = await load(join(oldRoot, "packages/core/dist/index.js"));
const newExtractor = await load(join(root, "packages/extractor/dist/index.js"));
const newCore = await load(join(root, "packages/core/dist/index.js"));
const templateGen = await load(join(support, "pbt/support/template-gen.js"));
const modelGen = await load(join(support, "pbt/support/model-gen.js"));
const { DEFAULT_SEED } = await load(join(support, "pbt/support/config.js"));
const { createApp } = await load(join(root, "examples/real-stacks/dist/create-app.js"));
const { catalog } = await load(join(root, "examples/real-stacks/dist/catalog.js"));

const key = (v) => `${v.principalLogicalId}->${v.targetRoleLogicalId}@${v.protectedBucketArn}`;
/** 1つのテンプレートの結果です: 未対応なら理由の一覧、そうでなければ指摘の集合。 */
function outcome(extractor, core, template, config) {
  const result = extractor.extractStack(structuredClone(template));
  if (result.model === undefined) {
    return {
      kind: "PG-IAM-003",
      reasons: [...new Set(result.unsupported.map((f) => f.reason))].sort(),
    };
  }
  const findings = core.evaluate(result.model, config).map(key).sort();
  return { kind: findings.length > 0 ? "PG-IAM-004" : "accepted", findings };
}
/** 1.0.1で未対応だった理由から、どの規則で読めるようになったかを推定します。 */
function rulesFor(reasons) {
  const rules = new Set();
  for (const reason of reasons) {
    if (reason.startsWith("Managed policies")) rules.add("R2");
    else if (reason.startsWith("Condition is not supported in trust")) rules.add("R3");
    else if (reason.startsWith("Action and Resource must be literal")) rules.add("R1");
  }
  return [...rules].sort().join("+") || "(no rule; check by hand)";
}

const lost = [];
const readable = [];
const added = [];
let inputs = 0;
function compare(label, before, after) {
  inputs++;
  if (before.kind !== "PG-IAM-003") {
    // P1: 1.0.1の指摘（PG-IAM-004）は、今も同じ経路として残るか、未対応の拒否になる必要があります。
    for (const finding of before.findings) {
      if (after.kind === "PG-IAM-003") continue;
      if (!after.findings.includes(finding)) lost.push(`${label}: ${finding} (now ${after.kind})`);
    }
  }
  if (before.kind === "PG-IAM-003" && after.kind !== "PG-IAM-003") {
    readable.push(`${label}: PG-IAM-003 -> ${after.kind} by ${rulesFor(before.reasons)}`);
  }
  const old = before.kind === "PG-IAM-003" ? [] : before.findings;
  if (after.kind !== "PG-IAM-003") {
    const extra = after.findings.filter((f) => !old.includes(f));
    if (extra.length > 0)
      added.push(`${label}: ${before.kind} -> ${after.kind}, new ${extra.join(", ")}`);
  }
}
const modelOutcome = (core, model, config) => {
  const findings = core.evaluate(model, config).map(key).sort();
  return { kind: findings.length > 0 ? "PG-IAM-004" : "accepted", findings };
};

// 1. 実スタックの14 Pattern（ホールドアウトは含めません。1回だけ実行するためです）。
const protectedBucketArns = ["arn:aws:s3:::proofgate-protected-data"];
for (const pattern of catalog) {
  const outdir = mkdtempSync(join(tmpdir(), "differential-"));
  try {
    createApp({ gated: false, outdir, pattern: pattern.id }).synth();
    for (const file of readdirSync(outdir).filter((f) => f.endsWith(".template.json"))) {
      const template = JSON.parse(readFileSync(join(outdir, file), "utf8"));
      const config = { protectedBucketArns };
      compare(
        `${pattern.id} ${file}`,
        outcome(oldExtractor, oldCore, template, config),
        outcome(newExtractor, newCore, template, config),
      );
    }
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}
// 2. 回帰JSONのモデル。
const regressions = join(root, "tests/pbt/regressions");
for (const file of readdirSync(regressions)
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const r = JSON.parse(readFileSync(join(regressions, file), "utf8"));
  compare(
    `regression ${r.name}`,
    modelOutcome(oldCore, r.model, r.config),
    modelOutcome(newCore, r.model, r.config),
  );
}
// 3. Model-levelの生成Case。
for (const c of modelGen.generateCases(DEFAULT_SEED, 2000)) {
  compare(
    `model case ${c.id}`,
    modelOutcome(oldCore, c.model, c.config),
    modelOutcome(newCore, c.model, c.config),
  );
}
// 4. Extractor-levelの生成断片。
const fragmentConfig = { protectedBucketArns: ["arn:aws:s3:::protected-bucket"] };
for (let i = 0; i < 1000; i++) {
  const { template } = templateGen.build(templateGen.generateTemplateSpec(DEFAULT_SEED, i));
  compare(
    `fragment ${i}`,
    outcome(oldExtractor, oldCore, template, fragmentConfig),
    outcome(newExtractor, newCore, template, fragmentConfig),
  );
}

const section = (title, lines, limit = Number.POSITIVE_INFINITY) => {
  console.log(`\n## ${title}: ${lines.length}`);
  for (const line of lines.slice(0, limit)) console.log(`- ${line}`);
  if (lines.length > limit) console.log(`- ... ${lines.length - limit} more`);
};
console.log(`# Differential: 1.0.1 (${oldRoot}) against the current code, ${inputs} inputs`);
section("P1: findings of 1.0.1 that disappeared (must be 0)", lost);
const readableNonFragment = readable.filter((l) => !l.startsWith("fragment "));
section("P2: PG-IAM-003 -> readable (real stacks and regressions)", readableNonFragment);
const readableFragments = readable.filter((l) => l.startsWith("fragment "));
const byRule = {};
for (const line of readableFragments) {
  const rule = line.slice(line.lastIndexOf(" by ") + 4);
  byRule[rule] = (byRule[rule] ?? 0) + 1;
}
section(
  "P2: PG-IAM-003 -> readable (generated fragments, counted by rule)",
  Object.entries(byRule).map(([rule, n]) => `${rule}: ${n}`),
);
const transitions = {};
for (const line of added) {
  const t = line.slice(line.indexOf(": ") + 2, line.indexOf(", new"));
  transitions[t] = (transitions[t] ?? 0) + 1;
}
section(
  "New findings by transition (allowed: they only add findings)",
  Object.entries(transitions).map(([t, n]) => `${t}: ${n}`),
);
section(
  "New findings outside the generated fragments",
  added.filter((l) => !l.startsWith("fragment ")),
);
process.exitCode = lost.length === 0 ? 0 : 1;
