import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { catalog } from "./catalog.js";
import { ClassificationError, classify, RESULTS } from "./classify.js";
import { constructProbeCatalog } from "./construct-probe/catalog.js";
import { createApp } from "./create-app.js";
import { holdoutCatalog } from "./holdout/catalog.js";
import { launchProbeCatalog } from "./launch-probe/catalog.js";
import type { Pattern } from "./pattern.js";

/**
 * 全Patternを、ProofGateなし・ありで合成し、実プラグインの結果を読み取って、
 * 期待表（data/expected-results.json）と比べるランナーです。AWSの認証情報もネットワークも使いません。
 *
 * 終了コード: 0 = すべて一致、1 = 差がある、2 = ハーネスの異常（Pattern自体が合成できない等）。
 */

/** ハーネス側の異常です。ProofGateの結果の差とは区別して報告します。 */
class HarnessError extends Error {}

interface Observed {
  readonly id: string;
  readonly result: string;
  readonly class: string;
  readonly reasons: string[];
  readonly rules: string[];
  readonly locations: string[];
  readonly milliseconds: number;
}

interface Expected {
  readonly id: string;
  readonly result: string;
  readonly class: string;
  readonly reasons: string[];
  readonly locations: string[];
}

interface ReportViolation {
  readonly ruleName: string;
  readonly description: string;
  readonly violatingConstructs?: readonly { readonly constructPath?: string }[];
}
interface Report {
  readonly pluginReports?: readonly { readonly violations?: readonly ReportViolation[] }[];
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE = ["RS-01", "RS-02", "RS-05"];
const UNSUPPORTED_PREFIX = "Unsupported IAM syntax: ";
/** テンプレート全体に対する指摘（空虚な証明の拒否）は、構成要素のパスを持ちません。 */
const NO_CONSTRUCT = "(no construct path)";

interface Synthesis {
  readonly threw: boolean;
  readonly message: string;
  readonly violations: readonly ReportViolation[];
}

/** プロセス内で合成します。検証に失敗するとCDKは例外を投げ、レポートを出力先へ書きます。 */
function synthesize(pattern: Pattern, gated: boolean): Synthesis {
  const outdir = mkdtempSync(join(tmpdir(), "real-stacks-"));
  try {
    const app = createApp({ gated, outdir, pattern: pattern.id });
    let threw = false;
    let message = "";
    try {
      app.synth();
    } catch (error) {
      threw = true;
      message = error instanceof Error ? error.message : String(error);
    }
    const file = join(outdir, "validation-report.json");
    const report: Report = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as Report)
      : {};
    const violations = (report.pluginReports ?? []).flatMap((entry) => entry.violations ?? []);
    return { threw, message, violations };
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}

const unique = (values: string[]) => [...new Set(values)].sort();

function observe(pattern: Pattern): Observed {
  const started = performance.now();
  const plain = synthesize(pattern, false);
  if (plain.threw) {
    throw new HarnessError(`${pattern.id} does not synthesize without ProofGate: ${plain.message}`);
  }
  const gated = synthesize(pattern, true);
  const { violations } = gated;
  if (gated.threw && violations.length === 0) {
    throw new HarnessError(
      `${pattern.id} threw with ProofGate but the report has no violation: ${gated.message}`,
    );
  }
  if (!gated.threw && violations.length > 0) {
    throw new HarnessError(`${pattern.id} has violations in the report but synth did not throw`);
  }
  const rules = unique(violations.map((violation) => violation.ruleName));
  const result = rules.length === 0 ? "accepted" : rules.join("+");
  if (!(RESULTS as readonly string[]).includes(result)) {
    throw new HarnessError(`${pattern.id} gave a result that is not known: ${result}`);
  }
  let className: string;
  try {
    className = classify({ groundTruth: pattern.groundTruth, inScope: pattern.inScope, result });
  } catch (error) {
    if (!(error instanceof ClassificationError)) throw error;
    className = `UNCLASSIFIED: ${error.message}`;
  }
  const reasons = unique(
    violations
      .filter((violation) => violation.ruleName === "PG-IAM-003")
      .map(
        (violation) =>
          // ヒント（". Hint: "の後）は比べず、理由の文だけを表と比べます。
          (violation.description.startsWith(UNSUPPORTED_PREFIX)
            ? violation.description.slice(UNSUPPORTED_PREFIX.length)
            : violation.description
          ).split(". Hint: ")[0] as string,
      ),
  );
  const locations = unique(
    violations.flatMap((violation) =>
      (violation.violatingConstructs ?? []).map(
        (construct) => construct.constructPath || NO_CONSTRUCT,
      ),
    ),
  );
  return {
    id: pattern.id,
    result,
    class: className,
    reasons,
    rules,
    locations,
    milliseconds: Math.round(performance.now() - started),
  };
}

/** 実際のcdk synthのCLIで、終了コードと出力のルールIDを確かめます。問題があれば文章で返します。 */
function checkCli(pattern: Pattern, observed: Observed): string[] {
  const problems: string[] = [];
  const cdk = join(root, "node_modules", ".bin", "cdk");
  for (const gated of [false, true]) {
    const output = mkdtempSync(join(tmpdir(), "real-stacks-cli-"));
    try {
      const env = { ...process.env };
      delete env.PROOFGATE;
      if (gated) env.PROOFGATE = "1";
      const run = spawnSync(
        cdk,
        ["synth", "--quiet", "-c", `pattern=${pattern.id}`, "--output", output],
        {
          cwd: root,
          env,
          encoding: "utf8",
          timeout: 120_000,
        },
      );
      const text = `${run.stdout}\n${run.stderr}`;
      const expectedExit = gated && observed.result !== "accepted" ? 1 : 0;
      const label = `${pattern.id} cdk synth ${gated ? "with" : "without"} ProofGate`;
      if (run.status !== expectedExit) {
        problems.push(`${label}: exit code ${String(run.status)}, expected ${expectedExit}`);
      }
      if (gated) {
        for (const rule of observed.rules) {
          if (!text.includes(rule)) problems.push(`${label}: the output does not mention ${rule}`);
        }
      }
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  }
  return problems;
}

function loadExpected(): Map<string, Expected> {
  const file = join(root, "data", "expected-results.json");
  if (!existsSync(file)) {
    throw new HarnessError(`${file} does not exist. Run with --print first and review the result.`);
  }
  const data = JSON.parse(readFileSync(file, "utf8")) as { patterns: Expected[] };
  return new Map(data.patterns.map((entry) => [entry.id, entry]));
}

function differences(observed: Observed, expected: Expected | undefined): string[] {
  if (expected === undefined) return [`${observed.id}: there is no entry in expected-results.json`];
  const found: string[] = [];
  if (observed.result !== expected.result) {
    found.push(`result: expected ${expected.result}, observed ${observed.result}`);
  }
  if (observed.class !== expected.class) {
    found.push(`class: expected ${expected.class}, observed ${observed.class}`);
  }
  const expectedReasons = [...expected.reasons].sort().join(" | ");
  if (observed.reasons.join(" | ") !== expectedReasons) {
    found.push(
      `reasons: expected [${expectedReasons}], observed [${observed.reasons.join(" | ")}]`,
    );
  }
  const expectedLocations = [...expected.locations].sort().join(" | ");
  if (observed.locations.join(" | ") !== expectedLocations) {
    found.push(
      `locations: expected [${expectedLocations}], observed [${observed.locations.join(" | ")}]`,
    );
  }
  return found.map((line) => `${observed.id}: ${line}`);
}

interface Options {
  readonly print: boolean;
  readonly only: string | undefined;
  readonly cli: "none" | "sample" | "all";
  /** holdoutとprobeは、ホールドアウトと構成の試しのPatternを観測だけします（期待表はなく、--printと同じ出力です）。 */
  readonly set: "main" | "holdout" | "probe" | "launch";
}

function parseArguments(argv: string[]): Options {
  let print = false;
  let only: string | undefined;
  let cli: Options["cli"] = "sample";
  let set: Options["set"] = "main";
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--print") print = true;
    else if (argument === "--only") only = argv[++i];
    else if (argument === "--holdout") set = "holdout";
    else if (argument === "--probe") set = "probe";
    else if (argument === "--launch") set = "launch";
    else if (argument === "--cli") {
      const mode = argv[++i];
      if (mode !== "none" && mode !== "sample" && mode !== "all") {
        throw new HarnessError(`--cli takes none, sample, or all (got ${String(mode)})`);
      }
      cli = mode;
    } else if (argument !== "--") throw new HarnessError(`Unknown argument: ${String(argument)}`);
  }
  return { print, only, cli, set };
}

function main(): number {
  const started = performance.now();
  const options = parseArguments(process.argv.slice(2));
  const sets = {
    main: catalog,
    holdout: holdoutCatalog,
    probe: constructProbeCatalog,
    launch: launchProbeCatalog,
  };
  const patterns = sets[options.set].filter(
    (pattern) => options.only === undefined || pattern.id === options.only,
  );
  if (patterns.length === 0)
    throw new HarnessError(`No Pattern matches --only ${String(options.only)}`);

  // 期待表がなければ、Patternを実行する前に止めます（先に--printで観測して、確認します）。
  const expected =
    options.print || options.set !== "main" ? new Map<string, Expected>() : loadExpected();
  const observedAll = patterns.map(observe);
  const problems: string[] = [];

  if (options.print || options.set !== "main") {
    console.log(JSON.stringify({ version: 1, patterns: observedAll }, null, 2));
  } else {
    for (const observed of observedAll) {
      const found = differences(observed, expected.get(observed.id));
      problems.push(...found);
      const status = found.length === 0 ? "ok  " : "DIFF";
      console.log(
        `${status} ${observed.id.padEnd(6)} ${observed.result.padEnd(22)} ${observed.class.padEnd(32)} ${observed.milliseconds} ms`,
      );
    }
  }

  if (options.cli !== "none") {
    const chosen = patterns.filter(
      (pattern) => options.cli === "all" || SAMPLE.includes(pattern.id),
    );
    for (const pattern of chosen) {
      const observed = observedAll.find((entry) => entry.id === pattern.id);
      if (observed !== undefined) problems.push(...checkCli(pattern, observed));
    }
    if (!options.print && options.set === "main")
      console.log(`cdk synth was run for ${chosen.map((p) => p.id).join(", ") || "no Pattern"}`);
  }

  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  if (!options.print && options.set === "main")
    console.log(`${patterns.length} Patterns in ${seconds} s`);
  for (const problem of problems) console.error(`DIFFERENCE ${problem}`);
  return problems.length === 0 ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`HARNESS ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
