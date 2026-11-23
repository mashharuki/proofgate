#!/usr/bin/env node
// 同じデモのスタックを、通常の合成、cdk-nag、ProofGateで合成し、出力をそのまま保存します（docs/submission/comparison.md）。
// Synthesizes the same demo stack with plain synth, cdk-nag, and ProofGate, and stores the outputs unchanged
// (docs/submission/comparison.md). Run `npm ci` here first. Commands run with argument arrays, never through a shell.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyPatch } from "../../scripts/apply-patch.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const source = readFileSync(join(repo, "examples/vulnerable-app/src/app.ts"), "utf8");
const patch = readFileSync(join(repo, "examples/vulnerable-app/fix.patch"), "utf8");
const results = join(here, "results");
const bin = (name) => join(here, "node_modules", ".bin", name);
if (!existsSync(bin("cdk"))) {
  console.error("Run `npm ci` in comparison/cdk-nag first.");
  process.exit(2);
}

// cdk-nagを、CDK_NAG=1のときだけ足します。ほかの行は変えません。cdk-nag 3はAspectではなく、ProofGateと同じ
// CDKの検証プラグインとして登録します（cdk-nag 3.1.0のREADMEとMIGRATION.md）。
// Add cdk-nag only when CDK_NAG=1; no other line changes. cdk-nag 3 registers as a CDK validation plugin, like ProofGate,
// not as an Aspect (README and MIGRATION.md of cdk-nag 3.1.0).
const NAG_IMPORTS = 'import { AwsSolutionsChecks } from "cdk-nag";\n';
const NAG_LINE =
  'if (process.env.CDK_NAG === "1") Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));\n';
function withNag(text) {
  if (text.split("\napp.synth();").length !== 2)
    throw new Error("expected exactly one app.synth()");
  return NAG_IMPORTS + text.replace("\napp.synth();", `\n${NAG_LINE}app.synth();`);
}
const inputs = { before: withNag(source), after: withNag(applyPatch(source, patch)) };
const runs = {
  plain: {},
  "cdk-nag": { CDK_NAG: "1" },
  proofgate: { PROOFGATE: "1" },
};

// コピーは、リポジトリの外の一時ディレクトリに置きます（品質ツールがコピーを検査しないように）。node_modulesはここを参照します。
// The copies go to a temporary directory outside the repository, so the quality tools do not check them; node_modules points here.
const work = mkdtempSync(join(tmpdir(), "proofgate-comparison-"));
symlinkSync(join(here, "node_modules"), join(work, "node_modules"), "dir");
rmSync(results, { recursive: true, force: true });
const summary = [];
for (const [input, text] of Object.entries(inputs)) {
  const dir = join(work, input);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "app.ts"), text);
  writeFileSync(
    join(dir, "tsconfig.json"),
    `${JSON.stringify({ extends: join(here, "tsconfig.json"), compilerOptions: { rootDir: "src", outDir: "dist" }, include: ["src/**/*.ts"] }, null, 2)}\n`,
  );
  const tsc = spawnSync(bin("tsc"), ["-p", join(dir, "tsconfig.json")], {
    cwd: here,
    encoding: "utf8",
  });
  if (tsc.status !== 0) throw new Error(`${input} does not compile:\n${tsc.stdout}${tsc.stderr}`);
  for (const [run, extra] of Object.entries(runs)) {
    const env = { ...process.env, ...extra };
    if (!("CDK_NAG" in extra)) delete env.CDK_NAG;
    if (!("PROOFGATE" in extra)) delete env.PROOFGATE;
    const out = join(results, `${input}-${run}`);
    const cdkOut = join(work, `${input}-${run}.out`);
    const result = spawnSync(
      bin("cdk"),
      ["synth", "--quiet", "--app", `node "${join(dir, "dist", "app.js")}"`, "--output", cdkOut],
      { cwd: here, encoding: "utf8", env },
    );
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "terminal.txt"), `${result.stdout ?? ""}${result.stderr ?? ""}`);
    writeFileSync(join(out, "exit-code.txt"), `${result.status}\n`);
    for (const file of existsSync(cdkOut) ? readdirSync(cdkOut) : []) {
      if (file === "validation-report.json" || file.endsWith("NagReport.csv")) {
        cpSync(join(cdkOut, file), join(out, file));
      }
    }
    summary.push(`${input} ${run}: exit ${result.status}`);
  }
}
writeFileSync(
  join(results, "versions.txt"),
  `${["aws-cdk-lib", "cdk-nag", "constructs", "@proofgate-cdk/cdk-plugin", "aws-cdk", "typescript"]
    .map((name) => {
      const manifest = JSON.parse(
        readFileSync(join(here, "node_modules", name, "package.json"), "utf8"),
      );
      return `${name} ${manifest.version}`;
    })
    .join("\n")}\nnode ${process.version}\n`,
);
console.log(summary.join("\n"));
console.log(`Copies and cdk.out directories: ${work}`);
