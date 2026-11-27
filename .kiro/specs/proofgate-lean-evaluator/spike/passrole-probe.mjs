// Probe: does the evaluator count iam:PassRole Resources that denote a role ARN without the literal ":role/"?
import { evaluate } from "/Users/harukikondo/git/proofgate/packages/core/dist/index.js";
const bucket = "arn:aws:s3:::protected-bucket";
const model = (passResource) => ({
  version: "1",
  roles: [
    {
      logicalId: "Data",
      roleName: "data-role",
      trustServices: ["lambda.amazonaws.com"],
      statements: [{ effect: "Allow", actions: ["s3:GetObject"], resources: [`${bucket}/*`], sourcePath: "d" }],
    },
    {
      logicalId: "Dev",
      roleName: "dev-role",
      trustServices: ["ec2.amazonaws.com"],
      statements: [
        { effect: "Allow", actions: ["iam:PassRole"], resources: [passResource], sourcePath: "p" },
        { effect: "Allow", actions: ["lambda:CreateFunction"], resources: ["*"], sourcePath: "l" },
      ],
    },
  ],
});
for (const r of [
  "*",
  "arn:aws:iam::123456789012:role/data-role",
  "arn:aws:iam::*:role/*",
  "arn:aws:iam::*:*",
  "arn:aws:iam::123456789012:*",
  "arn:aws:iam::*:role*",
  "arn:*:iam::*:*",
  "arn:aws:*",
  "arn:*",
]) {
  const found = evaluate(model(r), { protectedBucketArns: [bucket] }).length > 0;
  console.log(`${found ? "reported" : "MISSED  "}  iam:PassRole on ${r}`);
}
