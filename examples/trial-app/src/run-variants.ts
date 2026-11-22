/**
 * 試用アプリのすべての変種を、ProofGateを有効にして合成し、結果を期待表と比べます。
 * 終了コード: 0 一致、1 差がある、2 ハーネスの異常（終了コードと指摘が食い違うなど）。
 * Synthesizes every variant of the trial app with ProofGate and compares the results with an expected table.
 * Exit code: 0 match, 1 difference, 2 harness error (for example, the exit code and the findings disagree).
 *
 * 使い方 / Usage:
 *   node dist/run-variants.js [--cwd <app dir>] [--expected <file>]
 * `--cwd`は、npmの公開版を入れたコピー（scripts/prepare-npm-copy.mjs）を指すときに使います。
 * `--cwd` points at a copy that uses a published npm version (scripts/prepare-npm-copy.mjs).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VARIANTS } from "./variants.js";

const here = dirname(fileURLToPath(import.meta.url));
const option = (name: string): string | undefined => {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : process.argv[at + 1];
};
const cwd = resolve(option("--cwd") ?? join(here, ".."));
const expectedPath = resolve(
  option("--expected") ?? join(here, "..", "data", "expected-main.json"),
);
const expected = (
  JSON.parse(readFileSync(expectedPath, "utf8")) as { results: Record<string, string> }
).results;
// pnpmでもnpmでも、アプリのnode_modulesにあるcdkを直接起動します（シェルを通しません）。
// Run the cdk of the app's node_modules directly, with an argument array and no shell.
const cdk = join(cwd, "node_modules", ".bin", "cdk");

let differences = 0;
let harnessErrors = 0;
for (const variant of VARIANTS) {
  const run = spawnSync(cdk, ["synth", "--quiet", "-c", `variant=${variant}`], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, PROOFGATE: "1" },
  });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const rules = [...new Set(output.match(/PG-IAM-00[345]/g) ?? [])].sort();
  const code = run.status;
  let result: string;
  if (code === 0 && rules.length === 0) result = "accepted";
  else if (code === 1 && rules.length > 0) result = rules.join("+");
  else {
    result = `HARNESS ERROR (exit ${String(code)}, rules ${rules.join("+") || "none"})`;
    harnessErrors++;
  }
  const message = (output.split("\n").find((line) => /can |Unsupported/.test(line)) ?? "")
    .trim()
    .slice(0, 160);
  const want = expected[variant];
  const mark = want === result ? "" : `  DIFFERS (expected ${want ?? "no entry"})`;
  if (mark !== "" && !result.startsWith("HARNESS")) differences++;
  console.log(
    `${variant} exit=${String(code)} ${result === "accepted" ? "" : result}  ${message}${mark}`,
  );
}
for (const name of Object.keys(expected)) {
  if (!(VARIANTS as readonly string[]).includes(name)) {
    console.log(`${name}: in the expected table but not a variant`);
    harnessErrors++;
  }
}
console.log(
  `\n${VARIANTS.length} variants, ${differences} differences, ${harnessErrors} harness errors`,
);
process.exitCode = harnessErrors > 0 ? 2 : differences > 0 ? 1 : 0;
