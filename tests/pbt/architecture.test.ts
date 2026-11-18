import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

// Extractor-levelの生成テストが、Leanも本番の評価器もプロセス起動も使わないことを、
// importの調査で保証します（Requirement 4.7）。実行時のカウンタには頼りません。
//
// - Extractor側のファイルから、相対importを再帰的にたどります。
// - 型だけのimport（`import type`）は実行時に存在しないため、対象外です。
// - 禁止対象: lean-batch、@proofgate-cdk/core、@proofgate-cdk/cdk-plugin、child_process。
const FORBIDDEN = [
  /(^|\/)lean-batch(\.js|\.ts)?$/,
  /^@proofgate-cdk\/core$/,
  /^@proofgate-cdk\/cdk-plugin$/,
];
const FORBIDDEN_BUILTIN = new Set(["node:child_process", "child_process"]);

const IMPORT = /^\s*(?:import|export)\s+(type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/gm;

/** ソースが実行時にimportするモジュール名を返します。 */
function runtimeImports(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT)) {
    if (match[1] === undefined && match[2] !== undefined) found.push(match[2]);
  }
  return found;
}

/** 入口ファイルから相対importを再帰的にたどり、禁止されたimportの経路を返します。 */
function violations(entry: string, read: (path: string) => string | undefined): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const visit = (path: string, trail: string[]) => {
    if (seen.has(path)) return;
    seen.add(path);
    const source = read(path);
    if (source === undefined) return;
    for (const specifier of runtimeImports(source)) {
      const isForbidden =
        FORBIDDEN.some((pattern) => pattern.test(specifier)) || FORBIDDEN_BUILTIN.has(specifier);
      if (isForbidden) problems.push(`${[...trail, path].join(" -> ")} imports ${specifier}`);
      if (specifier.startsWith(".")) {
        visit(normalize(join(dirname(path), specifier.replace(/\.js$/, ".ts"))), [...trail, path]);
      }
    }
  };
  visit(entry, []);
  return problems;
}

const readFromDisk = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : undefined);

describe("Extractor-level tests stay independent of Lean and the evaluator", () => {
  it("has no forbidden runtime import in tests/pbt/extractor.test.ts or anything it imports", () => {
    expect(violations("tests/pbt/extractor.test.ts", readFromDisk)).toEqual([]);
  });

  it("covers the Extractor test support files (they are reachable from the entry)", () => {
    const reached = new Set<string>();
    const spy = (path: string) => {
      reached.add(path);
      return readFromDisk(path);
    };
    violations("tests/pbt/extractor.test.ts", spy);
    for (const file of [
      "template-gen.ts",
      "extractor-run.ts",
      "shrink.ts",
      "report.ts",
      "prng.ts",
    ]) {
      expect(reached.has(`tests/pbt/support/${file}`), file).toBe(true);
    }
  });

  // 負の自己検査: 禁止importを含むファイルを、同じ検査器が検出できること。
  describe("negative self-check", () => {
    const fake = (files: Record<string, string>) => (path: string) => files[path];

    it("detects a direct import of lean-batch", () => {
      const problems = violations(
        "tests/pbt/entry.test.ts",
        fake({ "tests/pbt/entry.test.ts": `import { runBatch } from "./support/lean-batch.js";` }),
      );
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("lean-batch");
    });

    it("detects forbidden imports reached through a helper", () => {
      const problems = violations(
        "tests/pbt/entry.test.ts",
        fake({
          "tests/pbt/entry.test.ts": `import { helper } from "./support/helper.js";`,
          "tests/pbt/support/helper.ts": `import { spawnSync } from "node:child_process";\nimport { evaluate } from "@proofgate-cdk/core";`,
        }),
      );
      expect(problems).toHaveLength(2);
      expect(problems.join("\n")).toContain("node:child_process");
      expect(problems.join("\n")).toContain("@proofgate-cdk/core");
    });

    it("detects @proofgate-cdk/cdk-plugin", () => {
      const problems = violations(
        "tests/pbt/entry.test.ts",
        fake({
          "tests/pbt/entry.test.ts": `import { ProofGateValidator } from "@proofgate-cdk/cdk-plugin";`,
        }),
      );
      expect(problems).toHaveLength(1);
    });

    it("ignores type-only imports and allowed modules", () => {
      const problems = violations(
        "tests/pbt/entry.test.ts",
        fake({
          "tests/pbt/entry.test.ts": [
            `import type { Counterexample } from "./support/lean-batch.js";`,
            `import { extractStack } from "@proofgate-cdk/extractor";`,
            `import type { StackModel } from "@proofgate-cdk/model";`,
            `import { describe } from "vitest";`,
          ].join("\n"),
        }),
      );
      expect(problems).toEqual([]);
    });
  });
});
