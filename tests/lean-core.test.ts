import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractStack } from "@proofgate-cdk/extractor";
import { describe, expect, it } from "vitest";
import { LAUNCH_ACTIONS } from "../packages/core/src/aws-tables.generated.js";
import { LAUNCH_SUPPLEMENTS } from "../packages/core/src/launch-supplements.js";
// @ts-expect-error JavaScriptのスクリプトをテストから直接読み込みます（tests/は型検査の対象外）。
import { renderLeanTables, launchGroups as untypedLaunchGroups } from "../scripts/lean-tables.mjs";

const launchGroups = untypedLaunchGroups as () => [string, [string, string[]][]][];
// spec proofgate-lean-evaluator, Step 1 (tasks 3.2 to 3.4): the Lean core and the premises it relies on.
// Leanの中核（照合、交差、表、規則）と、それが頼る前提を確かめます。
const lean = join(process.cwd(), "packages/cdk-plugin/lean");
const read = (file: string) => readFileSync(join(lean, file), "utf8");
const roleTemplate = (properties: Record<string, unknown>, resource = "*") => ({
  Resources: {
    R: {
      Type: "AWS::IAM::Role",
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "lambda.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        },
        Policies: [
          {
            PolicyName: "p",
            PolicyDocument: {
              Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: resource }],
            },
          },
        ],
        ...properties,
      },
    },
  },
});
describe("Lean tables (task 3.2)", () => {
  it("Tables.lean is the generated output of the current TypeScript tables", () => {
    expect(read("ProofGate/Tables.lean")).toBe(renderLeanTables());
  });
  it("the grouped launch table holds every action and service of the TypeScript tables", () => {
    const flat = new Map(
      launchGroups().flatMap(([prefix, entries]) =>
        entries.map(([name, services]): [string, string[]] => [
          `${prefix}:${name}`,
          [...services].sort(),
        ]),
      ),
    );
    expect(flat.size).toBe(Object.keys(LAUNCH_ACTIONS).length);
    for (const [action, services] of Object.entries(LAUNCH_ACTIONS)) {
      const expected = [...new Set([...services, ...(LAUNCH_SUPPLEMENTS[action] ?? [])])].sort();
      expect(flat.get(action), action).toEqual(expected);
    }
  });
});
describe("premises of the Lean rule (task 3.3, design 4.1)", () => {
  it("RoleIdent writes a role ARN without a path, so the extractor must reject role paths other than /", () => {
    const spec = read("ProofGate/Spec.lean");
    const roleIdent = spec.slice(spec.indexOf("def RoleIdent"), spec.indexOf("def launchTable"));
    expect(roleIdent).toContain('":role/".toList ++ n');
    // If RoleIdent ever gets a path part, this test must change together with the extractor (design 4.1.5).
    expect(roleIdent.toLowerCase()).not.toContain("path");
    const result = extractStack(roleTemplate({ Path: "/service-role/" }));
    expect(result.model).toBeUndefined();
    expect(result.unsupported.map((u) => u.reason)).toContain(
      "Non-default IAM role paths are not supported in the first vertical slice",
    );
  });
  it("the extractor rejects a policy string with the reserved character U+0000 (design 4.1.4)", () => {
    const result = extractStack(roleTemplate({}, "arn:aws:s3:::b/\u0000x"));
    expect(result.model).toBeUndefined();
    expect(result.unsupported.map((u) => u.reason)).toContain(
      "A policy string contains the reserved character U+0000",
    );
  });
  it("the extractor rejects a role name with U+0000", () => {
    const result = extractStack(roleTemplate({ RoleName: "data\u0000role" }));
    expect(result.model).toBeUndefined();
  });
});
describe("axioms of the Lean core (tasks 3.4 and 5.x)", () => {
  const STANDARD = new Set(["propext", "Quot.sound", "Classical.choice"]);
  // Every theorem of these modules, with its namespace. A new theorem is covered without changing this test.
  const MODULES: readonly (readonly [string, string])[] = [
    ["ProofGate/Glob.lean", "ProofGate.Glob"],
    ["ProofGate/Eval.lean", "ProofGate.Eval"],
    ["ProofGate/Legacy.lean", "ProofGate.Legacy"],
  ];
  it("every theorem of Glob, Eval, and Legacy uses only Lean's standard axioms", () => {
    const names = MODULES.flatMap(([file, ns]) =>
      [...read(file).matchAll(/^theorem (\w+)/gm)].map((m) => `${ns}.${m[1] as string}`),
    );
    expect(names.length).toBeGreaterThan(40);
    expect(names).toEqual(
      expect.arrayContaining([
        "ProofGate.Glob.globMatch_iff",
        "ProofGate.Glob.intersect_iff",
        "ProofGate.Eval.findings_iff",
        "ProofGate.Eval.safe_iff",
        "ProofGate.Eval.findings_mono",
        "ProofGate.Eval.findings_exempt",
        "ProofGate.Eval.findings_iff_wf",
        "ProofGate.Legacy.legacy_s3_unsound",
        "ProofGate.Legacy.legacy_passrole_unsound",
      ]),
    );
    const build = spawnSync("lake", ["build"], { cwd: lean, encoding: "utf8" });
    expect(build.status, `${build.stdout}${build.stderr}`).toBe(0);
    const dir = mkdtempSync(join(tmpdir(), "proofgate-axioms-"));
    try {
      const file = join(dir, "Axioms.lean");
      writeFileSync(
        file,
        ["import ProofGate", ...names.map((n) => `#print axioms ${n}`)].join("\n"),
      );
      const run = spawnSync("lake", ["env", "lean", file], { cwd: lean, encoding: "utf8" });
      expect(run.status, run.stderr).toBe(0);
      const lines = run.stdout
        .split("\n")
        .filter((l) => l.includes("depends on axioms") || l.includes("does not depend"));
      expect(lines).toHaveLength(names.length);
      for (const line of lines) {
        const used =
          /\[(.*)\]/
            .exec(line)?.[1]
            ?.split(",")
            .map((a) => a.trim())
            .filter(Boolean) ?? [];
        for (const axiom of used) expect(STANDARD.has(axiom), line).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);
});
