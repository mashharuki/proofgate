import { join } from "node:path";
import { evaluate, generateLean, unknownRoleFindings } from "@proofgate-cdk/core";
import type {
  ProofGateConfig,
  ResourceModel,
  StackModel,
  StatementModel,
} from "@proofgate-cdk/model";
import { describe, expect, it } from "vitest";
import { tsVerdict } from "./support/compare.js";
import { type BatchCase, runBatch } from "./support/lean-batch.js";
import { oracleUnknownRoles, oracleVerdict } from "./support/oracle.js";

// spec proofgate-implicit-role-paths, Step 3 (tasks 5.3 and 5.4): the path without iam:PassRole. Every row is checked by the
// independent oracle, the evaluator, and Lean (one launch).
// PassRoleの要らない経路です。独立オラクル、評価器、Leanの3者で確かめます。
const config: ProofGateConfig = { protectedBucketArns: ["arn:aws:s3:::protected-bucket"] };
const statement = (
  actions: string[],
  resources: string[],
  id: string,
  i: number,
): StatementModel => ({
  effect: "Allow",
  actions,
  resources,
  sourcePath: `Resources.${id}.Properties.Policies[0].PolicyDocument.Statement[${i}]`,
});
const FN: ResourceModel = {
  logicalId: "F",
  kind: "lambda-function",
  name: "fn-a",
  roleLogicalId: "Data",
  sourcePath: "Resources.F.Properties.Role",
};
const build = (
  resource: ResourceModel | undefined,
  dev: StatementModel[],
  data: { actions: string[]; resources: string[] } = {
    actions: ["s3:GetObject"],
    resources: ["arn:aws:s3:::protected-bucket/*"],
  },
  extra: Partial<StackModel> = {},
): StackModel => ({
  version: "1",
  roles: [
    {
      logicalId: "Data",
      roleName: "data-role",
      trustServices: ["lambda.amazonaws.com"],
      statements: [statement(data.actions, data.resources, "Data", 0)],
    },
    {
      logicalId: "Dev",
      roleName: "dev-role",
      trustServices: ["ec2.amazonaws.com"],
      statements: dev,
    },
  ],
  ...(resource === undefined ? {} : { resources: [resource] }),
  ...extra,
});
const dev = (actions: string[], resources: string[] = ["*"]) => [
  statement(actions, resources, "Dev", 0),
];
const LAMBDA = (name: string) => `arn:aws:lambda:us-east-1:123456789012:function:${name}`;
type Row = readonly [name: string, model: StackModel, expected: "unsafe" | "safe"];
const kindRows: Row[] = [
  ["lambda:UpdateFunctionCode", build(FN, dev(["lambda:UpdateFunctionCode"])), "unsafe"],
  [
    "lambda:UpdateFunctionConfiguration",
    build(FN, dev(["lambda:UpdateFunctionConfiguration"])),
    "unsafe",
  ],
  ["lambda:UpdateFunction* (glob)", build(FN, dev(["lambda:UpdateFunction*"])), "unsafe"],
  ["lambda:* (service star)", build(FN, dev(["lambda:*"])), "unsafe"],
  ["mixed case LAMBDA:updatefunctioncode", build(FN, dev(["LAMBDA:updatefunctioncode"])), "unsafe"],
  [
    "codebuild:StartBuild",
    build(
      { ...FN, logicalId: "P", kind: "codebuild-project", name: "build-a" },
      dev(["codebuild:StartBuild"]),
    ),
    "unsafe",
  ],
  [
    "codebuild:StartBuildBatch",
    build(
      { ...FN, logicalId: "P", kind: "codebuild-project", name: "build-a" },
      dev(["codebuild:StartBuildBatch"]),
    ),
    "unsafe",
  ],
  [
    "states:UpdateStateMachine",
    build(
      { ...FN, logicalId: "M", kind: "stepfunctions-state-machine", name: "flow-a" },
      dev(["states:UpdateStateMachine"]),
    ),
    "unsafe",
  ],
  // The action must match the kind of the resource.
  [
    "a Lambda action on a CodeBuild project",
    build(
      { ...FN, logicalId: "P", kind: "codebuild-project", name: "build-a" },
      dev(["lambda:UpdateFunctionCode"]),
    ),
    "safe",
  ],
  ["a CodeBuild action on a Lambda function", build(FN, dev(["codebuild:StartBuild"])), "safe"],
  [
    "lambda:InvokeFunction does not change the function",
    build(FN, dev(["lambda:InvokeFunction"])),
    "safe",
  ],
  ["lambda:GetFunction", build(FN, dev(["lambda:GetFunction"])), "safe"],
  ["no action at all", build(FN, dev(["s3:ListBucket"])), "safe"],
];
const exclusionRows: Row[] = [
  [
    "the principal is the role of the resource (decision 4)",
    {
      version: "1",
      roles: [
        {
          logicalId: "Data",
          roleName: "data-role",
          trustServices: ["lambda.amazonaws.com"],
          statements: [
            statement(["s3:GetObject"], ["arn:aws:s3:::protected-bucket/*"], "Data", 0),
            statement(["lambda:UpdateFunctionCode"], ["*"], "Data", 1),
          ],
        },
      ],
      resources: [FN],
    },
    "safe",
  ],
  [
    "the role is in allowedPassRoleTargets (decision 1)",
    build(FN, dev(["lambda:UpdateFunctionCode"])),
    "safe", // config is replaced below for this row
  ],
  [
    "the role cannot reach the protected bucket",
    build(FN, dev(["lambda:UpdateFunctionCode"]), {
      actions: ["s3:GetObject"],
      resources: ["arn:aws:s3:::other/*"],
    }),
    "safe",
  ],
  [
    "the role reaches the bucket by a bucket-policy action on the bucket ARN",
    build(FN, dev(["lambda:UpdateFunctionCode"]), {
      actions: ["s3:PutBucketPolicy"],
      resources: ["arn:aws:s3:::protected-bucket"],
    }),
    "unsafe",
  ],
  [
    "the function has an unknown role: no path (the rejection is a separate finding)",
    build(
      { ...FN, roleLogicalId: undefined, roleUnknown: true } as ResourceModel,
      dev(["lambda:UpdateFunctionCode"]),
    ),
    "safe",
  ],
  [
    "the role of the resource is not a role of the template",
    build({ ...FN, roleLogicalId: "Missing" }, dev(["lambda:UpdateFunctionCode"])),
    "safe",
  ],
];
const scopeRows: Row[] = [
  [
    "Resource is the ARN of this function",
    build(FN, dev(["lambda:UpdateFunctionCode"], [LAMBDA("fn-a")])),
    "unsafe",
  ],
  [
    "Resource is the ARN of another function",
    build(FN, dev(["lambda:UpdateFunctionCode"], [LAMBDA("fn-b")])),
    "safe",
  ],
  [
    "Resource is a name prefix that matches",
    build(FN, dev(["lambda:UpdateFunctionCode"], [LAMBDA("fn-*")])),
    "unsafe",
  ],
  [
    "Resource is a name prefix that does not match",
    build(FN, dev(["lambda:UpdateFunctionCode"], [LAMBDA("other-*")])),
    "safe",
  ],
  [
    "Resource is every function",
    build(FN, dev(["lambda:UpdateFunctionCode"], [LAMBDA("*")])),
    "unsafe",
  ],
  [
    "Resource is every Lambda resource",
    build(FN, dev(["lambda:UpdateFunctionCode"], ["arn:aws:lambda:*:*:*"])),
    "unsafe",
  ],
  [
    "Resource is a name with a question mark",
    build(FN, dev(["lambda:UpdateFunctionCode"], [LAMBDA("fn-?")])),
    "unsafe",
  ],
  [
    "Resource is a CodeBuild ARN for a Lambda action",
    build(FN, dev(["lambda:UpdateFunctionCode"], ["arn:aws:codebuild:*:*:project/fn-a"])),
    "safe",
  ],
  [
    "Resource is an S3 ARN",
    build(FN, dev(["lambda:UpdateFunctionCode"], ["arn:aws:s3:::fn-a"])),
    "safe",
  ],
  [
    "Resource is a bare logical ID (not an ARN, not counted)",
    build(FN, dev(["lambda:UpdateFunctionCode"], ["F"])),
    "safe",
  ],
  [
    "Resource is a bare name (not an ARN, not counted)",
    build(FN, dev(["lambda:UpdateFunctionCode"], ["fn-a"])),
    "safe",
  ],
  [
    "one of two Resources matches",
    build(FN, dev(["lambda:UpdateFunctionCode"], [LAMBDA("fn-b"), LAMBDA("fn-a")])),
    "unsafe",
  ],
  [
    "the action and the Resource are in different statements",
    build(FN, [
      statement(["lambda:UpdateFunctionCode"], [LAMBDA("fn-b")], "Dev", 0),
      statement(["s3:ListBucket"], [LAMBDA("fn-a")], "Dev", 1),
    ]),
    "safe",
  ],
  [
    "an unnamed function: its opaque name",
    build({ ...FN, name: undefined }, dev(["lambda:UpdateFunctionCode"], [LAMBDA("_generated_F")])),
    "unsafe",
  ],
  [
    "an unnamed function: another literal name",
    build({ ...FN, name: undefined }, dev(["lambda:UpdateFunctionCode"], [LAMBDA("fn-b")])),
    "safe",
  ],
  [
    "an unnamed function: a wildcard in the name may match the generated name",
    build({ ...FN, name: undefined }, dev(["lambda:UpdateFunctionCode"], [LAMBDA("fn-*")])),
    "unsafe",
  ],
  [
    "an unnamed function: another opaque name",
    build({ ...FN, name: undefined }, dev(["lambda:UpdateFunctionCode"], [LAMBDA("_generated_G")])),
    "safe",
  ],
  [
    "a function whose name is unknown: any pattern may match",
    build(
      { ...FN, name: undefined, nameUnknown: true },
      dev(["lambda:UpdateFunctionCode"], [LAMBDA("fn-b")]),
    ),
    "unsafe",
  ],
  [
    "CodeBuild project ARN uses project/",
    build(
      { ...FN, logicalId: "P", kind: "codebuild-project", name: "build-a" },
      dev(["codebuild:StartBuild"], ["arn:aws:codebuild:us-east-1:123456789012:project/build-a"]),
    ),
    "unsafe",
  ],
  [
    "state machine ARN uses stateMachine:",
    build(
      { ...FN, logicalId: "M", kind: "stepfunctions-state-machine", name: "flow-a" },
      dev(
        ["states:UpdateStateMachine"],
        ["arn:aws:states:us-east-1:123456789012:stateMachine:flow-a"],
      ),
    ),
    "unsafe",
  ],
  [
    "state machine: another machine",
    build(
      { ...FN, logicalId: "M", kind: "stepfunctions-state-machine", name: "flow-a" },
      dev(
        ["states:UpdateStateMachine"],
        ["arn:aws:states:us-east-1:123456789012:stateMachine:flow-b"],
      ),
    ),
    "safe",
  ],
];
const rows: readonly Row[] = [...kindRows, ...exclusionRows, ...scopeRows];
const configFor = (name: string): ProofGateConfig =>
  name.includes("allowedPassRoleTargets")
    ? { ...config, allowedPassRoleTargets: ["Data"] }
    : config;

describe("paths without iam:PassRole (design 5)", () => {
  for (const [name, model, expected] of rows) {
    it(`${name}: ${expected}`, () => {
      const cfg = configFor(name);
      expect(oracleVerdict(model, cfg), "oracle").toBe(expected);
      expect(tsVerdict(evaluate(model, cfg)), "evaluate").toBe(expected);
    });
  }
  it("names the resource, the action, the role, and the bucket in the violation", () => {
    const [violation] = evaluate(build(FN, dev(["lambda:UpdateFunctionCode"])), config);
    expect(violation?.ruleId).toBe("PG-IAM-004");
    expect(violation?.principalLogicalId).toBe("Dev");
    expect(violation?.targetRoleLogicalId).toBe("Data");
    expect(violation?.resourceLogicalId).toBe("F");
    expect(violation?.protectedBucketArn).toBe("arn:aws:s3:::protected-bucket");
    expect(violation?.explanation).toContain("lambda:UpdateFunctionCode");
    expect(violation?.explanation).toContain("F");
    expect(violation?.explanation).toContain("Data");
    expect(violation?.explanation).not.toContain("pass role");
    expect(violation?.sourcePaths).toEqual(
      expect.arrayContaining([
        "Resources.Dev.Properties.Policies[0].PolicyDocument.Statement[0]",
        "Resources.F.Properties.Role",
        "Resources.Data.Properties.Policies[0].PolicyDocument.Statement[0]",
      ]),
    );
  });
  it("leaves the PassRole violation without a resourceLogicalId", () => {
    const passRoleModel: StackModel = {
      version: "1",
      roles: [
        {
          logicalId: "Data",
          roleName: "data-role",
          trustServices: ["lambda.amazonaws.com"],
          statements: [statement(["s3:GetObject"], ["arn:aws:s3:::protected-bucket/*"], "Data", 0)],
        },
        {
          logicalId: "Dev",
          trustServices: ["ec2.amazonaws.com"],
          statements: [
            statement(["iam:PassRole"], ["arn:aws:iam::123456789012:role/data-role"], "Dev", 0),
            statement(["lambda:CreateFunction"], ["*"], "Dev", 1),
          ],
        },
      ],
    };
    const [violation] = evaluate(passRoleModel, config);
    expect(violation).toBeDefined();
    expect(violation?.resourceLogicalId).toBeUndefined();
  });
  it("gives one violation per principal, resource, and bucket", () => {
    const two: StackModel = {
      ...build(FN, dev(["lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration"])),
    };
    expect(evaluate(two, config)).toHaveLength(1);
  });
  it("generates the second Lean list and the second theorem", () => {
    const lean = generateLean(build(FN, dev(["lambda:UpdateFunctionCode"])), config);
    expect(lean).toContain("def generatedImplicit : List ProofGate.ImplicitPath :=");
    expect(lean).toContain("canChange := true");
    expect(lean).toContain("runsAsTarget := true");
    expect(lean).toContain("targetCanAccess := true");
    expect(lean).toContain("theorem generatedStackIsSafe : ProofGate.safe generatedPaths = true");
    expect(lean).toContain(
      "theorem generatedImplicitIsSafe : ProofGate.safeImplicit generatedImplicit = true",
    );
  });
  it("emits an empty second list for a model without resources", () => {
    const lean = generateLean(build(undefined, dev(["lambda:UpdateFunctionCode"])), config);
    expect(lean).toContain("def generatedImplicit : List ProofGate.ImplicitPath := []");
  });
  it("agrees with Lean on every row, in one launch", () => {
    const batch: BatchCase[] = rows.map(([name, model], id) => ({
      id,
      model,
      config: configFor(name),
      ts: tsVerdict(evaluate(model, configFor(name))),
    }));
    const result = runBatch(batch, generateLean, {
      leanDirectory: join(process.cwd(), "packages/cdk-plugin/lean"),
    });
    expect(result.failed.size).toBe(0);
    for (const b of batch) expect(result.verdicts.get(b.id), String(b.id)).toBe(b.ts);
    for (const [index, [, , expected]] of rows.entries()) {
      expect(result.verdicts.get(index), rows[index]?.[0]).toBe(expected);
    }
  }, 120_000);
});

describe("a resource whose role cannot be identified (design 6)", () => {
  const unknownFn: ResourceModel = {
    logicalId: "F",
    kind: "lambda-function",
    name: "fn-a",
    roleUnknown: true,
    sourcePath: "Resources.F.Properties.Role",
  };
  const finding = {
    sourcePath: "Resources.F.Properties.Role",
    reason: "F runs as a role that ProofGate cannot identify, and a principal can change it",
  };
  it("is rejected when a principal can change it", () => {
    const model = build(unknownFn, dev(["lambda:UpdateFunctionCode"]));
    expect(oracleUnknownRoles(model)).toEqual([{ resource: "F" }]);
    expect(unknownRoleFindings(model, config)).toEqual([finding]);
  });
  const quiet: [string, StackModel][] = [
    ["nobody has an action of its kind", build(unknownFn, dev(["lambda:InvokeFunction"]))],
    ["the action is of another kind", build(unknownFn, dev(["codebuild:StartBuild"]))],
    [
      "the Resource is another function",
      build(unknownFn, dev(["lambda:UpdateFunctionCode"], [LAMBDA("fn-b")])),
    ],
    ["the template has no resources", build(undefined, dev(["lambda:UpdateFunctionCode"]))],
    ["the role is known", build(FN, dev(["lambda:UpdateFunctionCode"], [LAMBDA("fn-b")]))],
  ];
  for (const [name, model] of quiet) {
    it(`is not reported when ${name}`, () => {
      expect(oracleUnknownRoles(model)).toEqual([]);
      expect(unknownRoleFindings(model, config)).toEqual([]);
    });
  }
  it("is rejected when the Resource may denote it by a wildcard", () => {
    const model = build(unknownFn, dev(["lambda:UpdateFunction*"], [LAMBDA("fn-*")]));
    expect(oracleUnknownRoles(model)).toEqual([{ resource: "F" }]);
    expect(unknownRoleFindings(model, config)).toHaveLength(1);
  });
  it("is rejected even when the changing role is the only role (nothing excludes it)", () => {
    const single: StackModel = {
      version: "1",
      roles: [
        {
          logicalId: "Dev",
          trustServices: ["ec2.amazonaws.com"],
          statements: dev(["lambda:UpdateFunctionCode"]),
        },
      ],
      resources: [unknownFn],
    };
    expect(oracleUnknownRoles(single)).toEqual([{ resource: "F" }]);
    expect(unknownRoleFindings(single, config)).toHaveLength(1);
  });
});
