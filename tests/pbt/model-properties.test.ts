import { evaluate } from "@proofgate/core";
import { extractStack } from "@proofgate/extractor";
import type { ProofGateConfig, RoleModel, StackModel } from "@proofgate/model";
import { describe, expect, it } from "vitest";
import { readConfig } from "./support/config.js";
import { assertCoverage, Coverage } from "./support/coverage.js";
import {
  CATEGORIES,
  type Case,
  generateCase,
  generateCases,
  requiredCoverageKeys,
  TAGS,
} from "./support/model-gen.js";
import { oracleVerdict } from "./support/oracle.js";
import { createRng } from "./support/prng.js";
import { renderTemplate } from "./support/render.js";

const { seed, cases: caseCount } = readConfig();
const cases = generateCases(seed, caseCount);
const describeCase = (c: Case) => JSON.stringify({ seed, ...c });

// ジェネレータ自身の整合性（Property: P1, P2, P3, P4, P26）。
describe("generator self-consistency", () => {
  it("is deterministic for the same seed and index", () => {
    for (const c of cases.slice(0, 200)) {
      expect(JSON.stringify(generateCase(seed, c.id))).toBe(JSON.stringify(c));
    }
  });

  it("produces different Cases for different seeds", () => {
    const other = generateCases(seed + 1, 200);
    const same = other.filter(
      (c, i) => JSON.stringify(c.model) === JSON.stringify(cases[i]?.model),
    );
    expect(same.length).toBeLessThan(40);
  });

  it("keeps invariants I1 to I4 on every Case", () => {
    for (const c of cases) {
      // I2: タグがあるのはconservative Caseだけ
      expect(c.tags.length > 0, describeCase(c)).toBe(c.category === "conservative");
      // I3: conservative Caseのlabelはsafe
      if (c.category === "conservative") expect(c.label, describeCase(c)).toBe("safe");
      // I4: タグなしCaseは、タグ付きの証跡を持たない
      if (c.category !== "conservative") {
        expect(c.witness, describeCase(c)).toEqual({ paths: [], roles: [] });
      }
      // タグ付きCaseは、証跡を必ず持つ
      if (c.tags.length > 0) {
        expect(c.witness.paths.length + c.witness.roles.length, describeCase(c)).toBeGreaterThan(0);
      }
    }
  });

  it("keeps I5: O1 (construction label) equals O2 (independent oracle) for every Case", () => {
    // 食い違いは製品の欠陥ではなく、ジェネレータまたはオラクルの欠陥です。
    for (const c of cases) {
      expect(oracleVerdict(c.model, c.config), `HARNESS ERROR O1!=O2 ${describeCase(c)}`).toBe(
        c.label,
      );
    }
  });

  it("builds Valid StackModels within the generator bounds", () => {
    for (const c of cases) {
      expect(c.model.roles.length, describeCase(c)).toBeGreaterThanOrEqual(1);
      expect(c.model.roles.length, describeCase(c)).toBeLessThanOrEqual(4);
      expect(
        c.model.roles.reduce((n, r) => n + r.statements.length, 0),
        describeCase(c),
      ).toBeGreaterThanOrEqual(1);
      for (const role of c.model.roles) {
        expect(role.statements.length, describeCase(c)).toBeLessThanOrEqual(6);
      }
      expect(c.config.protectedBucketArns.length, describeCase(c)).toBeGreaterThanOrEqual(1);
      expect(c.config.protectedBucketArns.length, describeCase(c)).toBeLessThanOrEqual(2);
      expect(
        c.config.protectedBucketArns.every((arn) => arn.trim().length > 0),
        describeCase(c),
      ).toBe(true);
      const paths = c.model.roles.flatMap((r) => r.statements.map((s) => s.sourcePath));
      expect(new Set(paths).size, `unique sourcePaths ${describeCase(c)}`).toBe(paths.length);
    }
  });

  it("renders into templates that the extractor accepts and reads back unchanged", () => {
    for (const c of cases.filter((_, i) => i % 7 === 0)) {
      const extraction = extractStack(renderTemplate(c.model));
      expect(extraction.unsupported, describeCase(c)).toEqual([]);
      expect(extraction.model, describeCase(c)).toEqual(c.model);
    }
  });

  it("reaches every required category, tag, and form in a default-size run", () => {
    if (caseCount < 2000) return; // 小さな実行では、全項目に届くとは限りません。
    const coverage = new Coverage();
    for (const c of cases) {
      coverage.add(`category:${c.category}`);
      for (const tag of c.tags) coverage.add(`tag:${tag}`);
      for (const form of c.forms) coverage.add(`form:${form}`);
    }
    assertCoverage(coverage, requiredCoverageKeys());
    for (const category of CATEGORIES) {
      expect(coverage.get(`category:${category}`)).toBeGreaterThan(0);
    }
    for (const tag of TAGS) expect(coverage.get(`tag:${tag}`)).toBeGreaterThanOrEqual(50);
    console.log(`PBT coverage (seed ${seed}, ${caseCount} Cases):\n${coverage.summary()}`);
  });
});

// ---------------------------------------------------------------------------------------------
// メタモルフィックな性質（Property: P14, P15）。期待値は不要で、TypeScriptとオラクルの両方に課します。
// ---------------------------------------------------------------------------------------------

const verdicts = (model: StackModel, config: ProofGateConfig) => ({
  oracle: oracleVerdict(model, config),
  ts: evaluate(model, config).length > 0 ? "unsafe" : "safe",
});

const INERT_ROLE: RoleModel = {
  logicalId: "ZInert",
  roleName: "inert-role",
  trustServices: ["ec2.amazonaws.com"],
  statements: [
    { effect: "Allow", actions: ["logs:PutLogEvents"], resources: ["*"], sourcePath: "inert" },
  ],
};

const sample = cases.filter((_, i) => i % 5 === 0);

describe("metamorphic properties", () => {
  it("ignores an added inert role", () => {
    for (const c of sample) {
      const before = verdicts(c.model, c.config);
      const after = verdicts({ ...c.model, roles: [...c.model.roles, INERT_ROLE] }, c.config);
      expect(after, describeCase(c)).toEqual(before);
    }
  });

  it("ignores an added inert statement", () => {
    for (const c of sample) {
      const first = c.model.roles[0] as RoleModel;
      const added: RoleModel = {
        ...first,
        statements: [
          ...first.statements,
          {
            effect: "Allow",
            actions: ["dynamodb:GetItem"],
            resources: ["*"],
            sourcePath: "inert-statement",
          },
        ],
      };
      const model = { ...c.model, roles: [added, ...c.model.roles.slice(1)] };
      expect(verdicts(model, c.config), describeCase(c)).toEqual(verdicts(c.model, c.config));
    }
  });

  it("does not depend on the order of roles or statements", () => {
    for (const c of sample) {
      const rng = createRng(seed, c.id + 50000);
      const roles = rng
        .shuffle(c.model.roles)
        .map((role) => ({ ...role, statements: rng.shuffle(role.statements) }));
      expect(verdicts({ ...c.model, roles }, c.config), describeCase(c)).toEqual(
        verdicts(c.model, c.config),
      );
    }
  });

  it("never turns an unsafe Case safe when an Allow statement is added", () => {
    const pool: [string[], string[]][] = [
      [["s3:GetObject"], ["arn:aws:s3:::other-x/*"]],
      [["lambda:InvokeFunction"], ["*"]],
      [["iam:GetRole"], ["*"]],
      [["sqs:SendMessage"], ["*"]],
      [["iam:PassRole"], ["arn:aws:iam::123456789012:role/unrelated"]],
    ];
    for (const c of sample) {
      const before = verdicts(c.model, c.config);
      if (before.oracle !== "unsafe" && before.ts !== "unsafe") continue;
      const rng = createRng(seed, c.id + 90000);
      const [actions, resources] = rng.pick(pool);
      const index = rng.int(0, c.model.roles.length - 1);
      const roles = c.model.roles.map((role, i) =>
        i === index
          ? {
              ...role,
              statements: [
                ...role.statements,
                { effect: "Allow" as const, actions, resources, sourcePath: "added" },
              ],
            }
          : role,
      );
      const after = verdicts({ ...c.model, roles }, c.config);
      // それぞれの評価器について、追加前にunsafeなら追加後もunsafeです。
      if (before.oracle === "unsafe") expect(after.oracle, describeCase(c)).toBe("unsafe");
      if (before.ts === "unsafe") expect(after.ts, describeCase(c)).toBe("unsafe");
    }
  });
});
