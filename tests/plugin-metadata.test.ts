import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ProofGateValidator } from "@proofgate-cdk/cdk-plugin";
import { RULE_ID, RULE_ID_POLICY_WRITE } from "@proofgate-cdk/model";
import { describe, expect, it } from "vitest";

// spec proofgate-kiroween-submission, R4.6: CDKのレポートに出る版とルールIDが、公開するパッケージと一致することを確かめます。
// The version and the rule IDs that the CDK report shows match the published package.
const manifest = (name: string) =>
  JSON.parse(readFileSync(join(process.cwd(), "packages", name, "package.json"), "utf8")) as {
    version: string;
  };
describe("plugin metadata", () => {
  const plugin = new ProofGateValidator({ protectedBucketArns: ["arn:aws:s3:::b"] });
  it("reports the version of its own package.json", () => {
    expect(plugin.version).toBe(manifest("cdk-plugin").version);
  });
  it("shares one version with the other published packages", () => {
    const versions = ["model", "extractor", "core", "cdk-plugin"].map((n) => manifest(n).version);
    expect(new Set(versions).size).toBe(1);
  });
  it("lists every rule ID it can report", () => {
    expect([...plugin.ruleIds].sort()).toEqual(
      ["PG-IAM-003", RULE_ID, RULE_ID_POLICY_WRITE].sort(),
    );
  });
});
