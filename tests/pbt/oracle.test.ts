import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SEED } from "./support/config.js";
import { compileGlob, intersects, literalTokens, matchTokens } from "./support/glob.js";
import { BOUNDARY_COUNT, generateCases } from "./support/model-gen.js";
import { oracleVerdict } from "./support/oracle.js";
import { createRng } from "./support/prng.js";

const arn = { colonAware: true } as const;
const plain = { colonAware: false } as const;

// 独立オラクルの照合規則を確認します（Property: P2, P16）。
describe("oracle glob matching", () => {
  it("supports * and ? in ARNs and actions", () => {
    expect(matchTokens(compileGlob("iam:Pass*", plain), "iam:PassRole")).toBe(true);
    expect(matchTokens(compileGlob("iam:PassRol?", plain), "iam:PassRole")).toBe(true);
    expect(matchTokens(compileGlob("iam:PassRol?", plain), "iam:PassRol")).toBe(false);
    expect(matchTokens(compileGlob("a?c", arn), "abc")).toBe(true);
  });

  it("lets only a segment-final * cross a colon (Decision 8.2)", () => {
    // 末尾の*はコロンを越える
    expect(matchTokens(compileGlob("arn:aws:s3:*", arn), "arn:aws:s3:::bucket/key")).toBe(true);
    expect(matchTokens(compileGlob("arn:aws:s3:::*", arn), "arn:aws:s3:::bucket/key")).toBe(true);
    // セグメント途中の*はコロンを越えない
    expect(matchTokens(compileGlob("arn:aws:s3:*bucket/*", arn), "arn:aws:s3:::bucket/key")).toBe(
      false,
    );
    expect(matchTokens(compileGlob("a*c", arn), "a:c")).toBe(false);
    // ARNではない照合（Action名）では制限しない
    expect(matchTokens(compileGlob("a*c", plain), "a:c")).toBe(true);
  });

  it("is case-sensitive for literals", () => {
    expect(matchTokens(compileGlob("role/Data", arn), "role/data")).toBe(false);
  });
});

/** 小さなアルファベット上で、2つのパターンの共通部分を総当たりで確かめます。 */
function bruteForceIntersects(a: string, b: string, options: { colonAware: boolean }): boolean {
  const left = compileGlob(a, options);
  const right = compileGlob(b, options);
  const alphabet = ["a", "b", ":"];
  const queue = [""];
  for (let length = 0; length <= 7; length++) {
    const next: string[] = [];
    for (const text of queue) {
      if (matchTokens(left, text) && matchTokens(right, text)) return true;
      if (length < 7) for (const c of alphabet) next.push(text + c);
    }
    queue.length = 0;
    queue.push(...next);
  }
  return false;
}

function randomPattern(rng: ReturnType<typeof createRng>): string {
  const length = rng.int(0, 4);
  return Array.from({ length }, () => rng.pick(["a", "b", ":", "*", "?"])).join("");
}

describe("oracle glob intersection (D1)", () => {
  it("agrees with a brute-force search on random small patterns", () => {
    for (const options of [arn, plain]) {
      for (let i = 0; i < 400; i++) {
        const rng = createRng(2026, i + (options.colonAware ? 0 : 10000));
        const a = randomPattern(rng);
        const b = randomPattern(rng);
        expect(intersects(compileGlob(a, options), compileGlob(b, options)), `${a} ~ ${b}`).toBe(
          bruteForceIntersects(a, b, options),
        );
      }
    }
  });

  it("is symmetric", () => {
    for (let i = 0; i < 300; i++) {
      const rng = createRng(77, i);
      const a = compileGlob(randomPattern(rng), arn);
      const b = compileGlob(randomPattern(rng), arn);
      expect(intersects(a, b)).toBe(intersects(b, a));
    }
  });

  it("matches a literal exactly when the pattern matches it", () => {
    for (let i = 0; i < 300; i++) {
      const rng = createRng(78, i);
      const pattern = compileGlob(randomPattern(rng), arn);
      const text = Array.from({ length: rng.int(0, 5) }, () => rng.pick(["a", "b", ":"])).join("");
      expect(intersects(pattern, literalTokens(text))).toBe(matchTokens(pattern, text));
    }
  });

  it("treats a lone star as intersecting everything", () => {
    expect(intersects(compileGlob("*", arn), compileGlob("a:b", arn))).toBe(true);
  });
});

// D1の回帰表（design 6.2）。期待値はジェネレータとは別に、ここへ直接書きます。
describe("oracle verdicts for the D1 regression table", () => {
  const expected: Record<string, "unsafe" | "safe"> = {
    "d1-1-prefix-star": "unsafe",
    "d1-2-prefix-object": "unsafe",
    "d1-3-another-bucket": "safe",
    "d1-4-bucket-level-only": "safe",
    "d1-5-intersecting-bucket-wildcard": "unsafe",
    "d1-6-disjoint-bucket-wildcard": "safe",
    "d1-7-bucket-trailing-star": "unsafe",
    "d1-8-all-s3": "unsafe",
    "d1-10-question-key": "unsafe",
    "question-wildcards": "unsafe",
    "single-role": "safe",
    "principal-equals-target": "safe",
    "allowed-target": "safe",
    "two-buckets": "unsafe",
    "trailing-slash-config": "unsafe",
  };
  const boundary = generateCases(DEFAULT_SEED, BOUNDARY_COUNT);

  for (const [name, verdict] of Object.entries(expected)) {
    it(`${name} is ${verdict}`, () => {
      const found = boundary.find((c) => c.forms.includes(`boundary:${name}`));
      expect(found, `fixed case ${name}`).toBeDefined();
      if (found) expect(oracleVerdict(found.model, found.config)).toBe(verdict);
    });
  }
});

describe("oracle independence", () => {
  // Added in spec proofgate-brushup (Step 2): the only door to AWS facts is a re-export of generated data.
  it("reads AWS facts only through aws-facts.ts, which re-exports the generated tables and has no logic", () => {
    const oracle = readFileSync(join(process.cwd(), "tests/pbt/support/oracle.ts"), "utf8");
    expect(oracle).toContain('from "./aws-facts.js"');
    expect(oracle).not.toContain("aws-tables.generated");
    const facts = readFileSync(join(process.cwd(), "tests/pbt/support/aws-facts.ts"), "utf8");
    const code = facts.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code.trim()).toMatch(
      /^export \{[^}]*\} from "\.\.\/\.\.\/\.\.\/packages\/core\/src\/aws-tables\.generated\.js";$/,
    );
  });
  it("imports nothing from the production packages except types", () => {
    for (const file of ["oracle.ts", "glob.ts"]) {
      const source = readFileSync(join(process.cwd(), "tests/pbt/support", file), "utf8");
      expect(source, file).not.toContain("@proofgate-cdk/core");
      expect(source, file).not.toContain("@proofgate-cdk/extractor");
      expect(source, file).not.toContain("@proofgate-cdk/cdk-plugin");
      for (const line of source.split("\n")) {
        if (/^import .*from "@proofgate-cdk\//.test(line)) {
          expect(line, `${file}: ${line}`).toMatch(/^import type /);
        }
      }
    }
  });
});
