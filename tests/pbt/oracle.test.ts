import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SEED } from "./support/config.js";
import { compileGlob, intersects, literalTokens, matchTokens } from "./support/glob.js";
import { BOUNDARY_COUNT, generateCases } from "./support/model-gen.js";
import { oracleVerdict } from "./support/oracle.js";
import { createRng } from "./support/prng.js";

// 独立オラクルの照合規則を確認します（Property: P2, P16）。
describe("oracle glob matching", () => {
  it("supports * and ? in ARNs and actions", () => {
    expect(matchTokens(compileGlob("iam:Pass*"), "iam:PassRole")).toBe(true);
    expect(matchTokens(compileGlob("iam:PassRol?"), "iam:PassRole")).toBe(true);
    expect(matchTokens(compileGlob("iam:PassRol?"), "iam:PassRol")).toBe(false);
    expect(matchTokens(compileGlob("a?c"), "abc")).toBe(true);
  });

  // Changed by the user's approval ("b", 2026-11-21): the earlier test of this name asserted that only a segment-final
  // `*` crosses a colon and that a `?` never does (Decision 8.2). The real IAM engine does not do that
  // (`tests/pbt/aws-observations*.json`): a colon is an ordinary character for `*` and `?`.
  it("lets * and ? stand for a colon anywhere (observed in the real IAM engine)", () => {
    expect(matchTokens(compileGlob("arn:aws:s3:*"), "arn:aws:s3:::bucket/key")).toBe(true);
    expect(matchTokens(compileGlob("arn:aws:s3:::*"), "arn:aws:s3:::bucket/key")).toBe(true);
    expect(matchTokens(compileGlob("arn:aws:s3:*bucket/*"), "arn:aws:s3:::bucket/key")).toBe(true);
    expect(matchTokens(compileGlob("a*c"), "a:c")).toBe(true);
    expect(matchTokens(compileGlob("a?c"), "a:c")).toBe(true);
    expect(matchTokens(compileGlob("arn:aws:s3:?:b/k"), "arn:aws:s3:::b/k")).toBe(true);
    // A `?` is still exactly one character.
    expect(matchTokens(compileGlob("arn:aws:s3:?b/k"), "arn:aws:s3:::b/k")).toBe(false);
  });
  it("is case-sensitive for literals", () => {
    expect(matchTokens(compileGlob("role/Data"), "role/data")).toBe(false);
  });
});

/** 小さなアルファベット上で、2つのパターンの共通部分を総当たりで確かめます。 */
function bruteForceIntersects(a: string, b: string): boolean {
  const left = compileGlob(a);
  const right = compileGlob(b);
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
    // Seeds 2026 + i and 2026 + i + 10000 were used for the two readings before; both are kept so that the
    // random patterns of the old run are still covered by the one reading.
    for (const offset of [0, 10000]) {
      for (let i = 0; i < 400; i++) {
        const rng = createRng(2026, i + offset);
        const a = randomPattern(rng);
        const b = randomPattern(rng);
        expect(intersects(compileGlob(a), compileGlob(b)), `${a} ~ ${b}`).toBe(
          bruteForceIntersects(a, b),
        );
      }
    }
  });

  it("is symmetric", () => {
    for (let i = 0; i < 300; i++) {
      const rng = createRng(77, i);
      const a = compileGlob(randomPattern(rng));
      const b = compileGlob(randomPattern(rng));
      expect(intersects(a, b)).toBe(intersects(b, a));
    }
  });

  it("matches a literal exactly when the pattern matches it", () => {
    for (let i = 0; i < 300; i++) {
      const rng = createRng(78, i);
      const pattern = compileGlob(randomPattern(rng));
      const text = Array.from({ length: rng.int(0, 5) }, () => rng.pick(["a", "b", ":"])).join("");
      expect(intersects(pattern, literalTokens(text))).toBe(matchTokens(pattern, text));
    }
  });

  it("treats a lone star as intersecting everything", () => {
    expect(intersects(compileGlob("*"), compileGlob("a:b"))).toBe(true);
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
