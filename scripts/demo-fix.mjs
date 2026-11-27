#!/usr/bin/env node
// 同じCDKスタックで、ProofGateの判定から修正までを4つの手順で見せます（spec proofgate-kiroween-submission, R2）。
//   1. 通常の合成（ProofGateなし）は成功します。
//   2. ProofGateを有効にした合成は、PG-IAM-004で拒否されます。
//   3. 過剰な許可（iam:PassRoleのStatement）を取り除く差分を、リポジトリの外の一時ディレクトリのコピーに当てます。
//   4. 修正した同じスタックを、ProofGateを有効にして合成すると成功します。
// 例外承認（acknowledge）や許可リストは使いません。追跡しているファイルは変更しません。
// Shows, on one CDK stack, ProofGate's verdict and the fix in four steps:
//   1. plain synth (no ProofGate) succeeds; 2. gated synth is rejected with PG-IAM-004;
//   3. the diff that removes the excess permission (the iam:PassRole statement) is applied to a copy in a temporary directory;
//   4. gated synth of the same, fixed stack succeeds.
// No acknowledgement and no allow list is used. No tracked file is changed.
//
// Usage: node scripts/demo-fix.mjs [--app-dir <dir>]
//   --app-dir: the app to use (default examples/vulnerable-app). It must have src/app.ts, cdk.json, and node_modules with
//   aws-cdk and @proofgate-cdk/cdk-plugin, and dist/ built from src/ (run `pnpm build` first in this repository).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyPatch } from "./apply-patch.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const at = process.argv.indexOf("--app-dir");
const appDir = resolve(
  at < 0 ? join(repo, "examples/vulnerable-app") : (process.argv[at + 1] ?? ""),
);
const patchFile = join(repo, "examples/vulnerable-app/fix.patch");
const RULE = "PG-IAM-004";
// アプリは、ゲートを有効にしたときにこの行を出します。成功時はCDKがプラグインの結果を表示しないため、ゲートが動いた証拠にします。
// The app prints this line when the gate is on. CDK prints nothing for a plugin that passes, so this shows that the gate ran.
const GATE_ON = "ProofGate is on:";

const fail = (message) => {
  console.error(`demo:fix FAILED: ${message}`);
  process.exit(1);
};
/** アプリのnode_modules、なければリポジトリのnode_modulesから実行ファイルを探します。 Finds a binary of the app, else of the repo. */
const bin = (name) => {
  for (const base of [appDir, repo]) {
    const candidate = join(base, "node_modules", ".bin", name);
    if (existsSync(candidate)) return candidate;
  }
  return fail(
    `${name} was not found in ${appDir}/node_modules or ${repo}/node_modules. Run pnpm install.`,
  );
};
/** シェルを通さず、引数の配列で実行します。 Runs with an argument array, without a shell. */
const run = (command, args, gated) => {
  const env = { ...process.env };
  delete env.PROOFGATE;
  if (gated) env.PROOFGATE = "1";
  const result = spawnSync(command, args, { cwd: appDir, encoding: "utf8", env });
  if (result.error !== undefined) fail(`${command} could not be started: ${result.error.message}`);
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
};
/** CDKの検証レポートから、ProofGateの違反のルール名を読みます。 Reads ProofGate's rule names from CDK's validation report. */
const proofGateRules = (outDir) => {
  const file = join(outDir, "validation-report.json");
  if (!existsSync(file)) return [];
  const report = JSON.parse(readFileSync(file, "utf8"));
  return (report.pluginReports ?? [])
    .filter((p) => p.pluginName === "ProofGate")
    .flatMap((p) => p.violations ?? [])
    .map((v) => v.ruleName);
};
const indent = (text) =>
  text
    .split("\n")
    .filter((line) => line.trim() !== "" && !/feature flags are not configured/.test(line))
    .map((line) => `    ${line}`)
    .join("\n");

if (!existsSync(join(appDir, "dist", "app.js")))
  fail(`${appDir}/dist/app.js is missing. Run pnpm build first.`);
const cdk = bin("cdk");
console.log(`ProofGate demo on one stack: ${appDir}`);

// 1. 通常の合成。 Plain synth.
// 手順1と2も一時ディレクトリに出力します。同時に走るほかの合成（テストなど）と、アプリのcdk.outを取り合わないためです。
// Steps 1 and 2 also write to a temporary directory, so that they never share the app's cdk.out with another synth running
// at the same time (the CDK CLI locks the output directory; a test run in parallel failed on it).
const workDir = mkdtempSync(join(tmpdir(), "proofgate-demo-"));
const plainOut = join(workDir, "plain.out");
const gatedOut = join(workDir, "gated.out");
const plain = run(cdk, ["synth", "--quiet", "--output", plainOut], false);
if (plain.status !== 0)
  fail(`step 1 plain synth exited ${plain.status}, expected 0.\n${indent(plain.output)}`);
if (plain.output.includes(GATE_ON))
  fail("step 1 plain synth ran with the gate on; PROOFGATE must be unset.");
console.log("step 1/4 plain synth: exit 0 (as expected)");

// 2. ProofGateを有効にした合成。 Gated synth.
const gated = run(cdk, ["synth", "--quiet", "--output", gatedOut], true);
const rules = proofGateRules(gatedOut);
if (gated.status !== 1 || !rules.includes(RULE) || !gated.output.includes(GATE_ON)) {
  fail(
    `step 2 gated synth exited ${gated.status} with rules [${rules.join(", ")}], expected 1 with ${RULE}.\n${indent(gated.output)}`,
  );
}
console.log(`step 2/4 gated synth: exit 1, ${RULE} (as expected)`);
const report = JSON.parse(readFileSync(join(gatedOut, "validation-report.json"), "utf8"));
const proofGate = (report.pluginReports ?? []).find((p) => p.pluginName === "ProofGate");
console.log(`    ProofGate version in the CDK report: ${proofGate?.pluginVersion ?? "unknown"}`);
console.log(indent(gated.output));

// 3. 修正を、リポジトリの外の一時ディレクトリのコピーに当てます。コピーはアプリのnode_modulesを参照します。
// Apply the fix to a copy in a temporary directory outside the repository. The copy uses the app's node_modules.
const patch = readFileSync(patchFile, "utf8");
const fixedDir = mkdtempSync(join(tmpdir(), "proofgate-demo-fixed-"));
symlinkSync(join(appDir, "node_modules"), join(fixedDir, "node_modules"), "dir");
cpSync(join(appDir, "src"), join(fixedDir, "src"), { recursive: true });
let fixedSource;
try {
  fixedSource = applyPatch(readFileSync(join(fixedDir, "src", "app.ts"), "utf8"), patch);
} catch (error) {
  fail(`fix.patch does not match ${appDir}/src/app.ts: ${error.message}.`);
}
writeFileSync(join(fixedDir, "src", "app.ts"), fixedSource);
// アプリのtsconfigを継承し、入出力だけをコピーに向けます。型定義はアプリとリポジトリのnode_modulesから探します。
// Extend the app's tsconfig; only input and output point at the copy. Types are looked up in the app's and the repo's node_modules.
const typeRoots = [
  join(appDir, "node_modules", "@types"),
  join(repo, "node_modules", "@types"),
].filter((d) => existsSync(d));
writeFileSync(
  join(fixedDir, "tsconfig.json"),
  `${JSON.stringify({ extends: join(appDir, "tsconfig.json"), compilerOptions: { rootDir: "src", outDir: "dist", typeRoots }, include: ["src/**/*.ts"] }, null, 2)}\n`,
);
const compiled = spawnSync(bin("tsc"), ["-p", join(fixedDir, "tsconfig.json")], {
  cwd: appDir,
  encoding: "utf8",
});
if (compiled.status !== 0)
  fail(`the fixed copy does not compile.\n${indent(`${compiled.stdout}${compiled.stderr}`)}`);
console.log("step 3/4 fix: removed the iam:PassRole statement (examples/vulnerable-app/fix.patch)");
console.log(indent(patch));

// 4. 修正した同じスタックを、ProofGateを有効にして合成します。 Gated synth of the fixed stack.
const outDir = join(fixedDir, "cdk.out");
const fixed = run(
  cdk,
  ["synth", "--quiet", "--app", `node "${join(fixedDir, "dist", "app.js")}"`, "--output", outDir],
  true,
);
const fixedRules = proofGateRules(outDir);
if (fixed.status !== 0 || fixedRules.length > 0 || !fixed.output.includes(GATE_ON)) {
  fail(
    `step 4 gated synth of the fixed stack exited ${fixed.status} with rules [${fixedRules.join(", ")}], expected 0 and none.\n${indent(fixed.output)}`,
  );
}
console.log("step 4/4 gated synth of the fixed stack: exit 0 (as expected)");
console.log(indent(fixed.output));
console.log(`The fixed source is in ${join(fixedDir, "src", "app.ts")}.`);
