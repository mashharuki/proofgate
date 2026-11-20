import { Bucket } from "aws-cdk-lib/aws-s3";
import { escalationPath, inlineFunction, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/**
 * 正解は危険です（リテラルのロールの組がRS-02と同じ経路を作ります）。
 * 同じスタックに、無関係なLambdaとgrantReadを足すだけで、ProofGateはテンプレート全体を読めなくなります。
 * 危険な経路が結果に見えるかどうかを確かめます。
 */
export const rs11: Pattern = {
  id: "RS-11",
  title: "The escalation path next to an unrelated grantRead",
  description:
    "The literal escalation path of RS-02, in a stack that also holds an unrelated Lambda function with bucket.grantRead. The extra function is harmless, but the template now has syntax that ProofGate does not read.",
  groundTruth: "unsafe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    escalationPath(stack);
    new Bucket(stack, "Other").grantRead(inlineFunction(stack, "Unrelated"));
  },
};
