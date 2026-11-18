import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, generateLean } from "@proofgate/core";
import type { ProofGateConfig, StackModel } from "@proofgate/model";
import { describe, expect, it } from "vitest";
import { tsVerdict } from "./support/compare.js";
import { type BatchCase, runBatch, type Verdict } from "./support/lean-batch.js";
import { oracleVerdict } from "./support/oracle.js";
import { isValid } from "./support/shrink.js";

interface Regression {
  readonly name: string;
  readonly note: string;
  /** AWSの意味論での判定（オラクルが返すべき値）です。 */
  readonly label: Verdict;
  /** 修正後にProofGateが返すべき判定です（過剰検出を許すCaseは含めません）。 */
  readonly expectedTs: Verdict;
  readonly config: ProofGateConfig;
  readonly model: StackModel;
}

const directory = join(process.cwd(), "tests/pbt/regressions");
const regressions: Regression[] = readdirSync(directory)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => JSON.parse(readFileSync(join(directory, file), "utf8")) as Regression);

// 固定した回帰Case（Counterexampleを縮小したもの、D1の回帰表）の再生です（Property: P5, P6, P10, P16）。
describe("regression corpus", () => {
  it("is not empty and every entry is a Valid StackModel with a note", () => {
    expect(regressions.length).toBeGreaterThan(0);
    for (const r of regressions) {
      expect(r.note.length, r.name).toBeGreaterThan(10);
      expect(isValid({ model: r.model, config: r.config }), r.name).toBe(true);
    }
  });

  for (const r of regressions) {
    it(`${r.name}: oracle says ${r.label}, ProofGate says ${r.expectedTs}`, () => {
      expect(oracleVerdict(r.model, r.config), "oracle (AWS semantics)").toBe(r.label);
      expect(tsVerdict(evaluate(r.model, r.config)), "TypeScript evaluate").toBe(r.expectedTs);
    });
  }

  it("agrees with Lean on every entry, in one launch", () => {
    const batch: BatchCase[] = regressions.map((r, id) => ({
      id,
      model: r.model,
      config: r.config,
      ts: tsVerdict(evaluate(r.model, r.config)),
    }));
    const result = runBatch(batch, generateLean, {
      leanDirectory: join(process.cwd(), "packages/cdk-plugin/lean"),
    });
    expect(result.failed.size).toBe(0);
    for (const b of batch) {
      expect(result.verdicts.get(b.id), regressions[b.id]?.name).toBe(b.ts);
    }
  }, 120_000);
});
