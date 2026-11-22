import { describe, expect, it } from "vitest";
import { validatorConfigFor } from "../examples/real-stacks/src/create-app.js";
import type { Pattern } from "../examples/real-stacks/src/pattern.js";
// spec proofgate-self-escalation, task 1.5: a Pattern may add fields to the ProofGate configuration (for example
// allowedPolicyWriters), computed after the Pattern has built its stacks. The protected bucket stays fixed.
// Patternが、ProofGateの設定へ項目を足せます（スタックを作った後に計算します）。保護対象バケットは固定です。
// The helper does not read the App; the Pattern receives it. A stand-in object is enough here.
const APP = {} as never;
const fake = (configFor?: Pattern["configFor"]): Pattern => ({
  id: "RS-99",
  title: "t",
  description: "d",
  groundTruth: "safe",
  inScope: true,
  build: () => {},
  ...(configFor === undefined ? {} : { configFor }),
});
describe("validatorConfigFor", () => {
  it("is only the protected bucket for a Pattern without configFor", () => {
    expect(validatorConfigFor(fake(), APP)).toEqual({
      protectedBucketArns: ["arn:aws:s3:::proofgate-protected-data"],
    });
  });
  it("adds the fields that the Pattern returns", () => {
    const config = validatorConfigFor(fake(() => ({ allowedPolicyWriters: ["PipelineRole"] })), APP);
    expect(config).toEqual({
      protectedBucketArns: ["arn:aws:s3:::proofgate-protected-data"],
      allowedPolicyWriters: ["PipelineRole"],
    });
  });
  it("never lets a Pattern replace the protected bucket", () => {
    const config = validatorConfigFor(
      fake(() => ({ protectedBucketArns: ["arn:aws:s3:::other"] }) as never),
      APP,
    );
    expect(config.protectedBucketArns).toEqual(["arn:aws:s3:::proofgate-protected-data"]);
  });
});
