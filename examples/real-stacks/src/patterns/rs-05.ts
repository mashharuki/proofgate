import { Bucket } from "aws-cdk-lib/aws-s3";
import { inlineFunction, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/**
 * 正解は安全です。PassRoleもLambda制御もなく、権限昇格経路の条件が成り立ちません。
 * 一方、CDKの標準的な書き方（grantRead）が作るロールは、管理ポリシーと非リテラルなResourceを含みます。
 */
export const rs05: Pattern = {
  id: "RS-05",
  title: "A Lambda function with bucket.grantRead",
  description:
    "A Lambda function with inline code reads a CDK-created bucket through grantRead. Nobody can pass a role or create a function, so the stack is safe. The generated execution role uses a managed policy and a resource built from CloudFormation functions.",
  groundTruth: "safe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    new Bucket(stack, "Data").grantRead(inlineFunction(stack, "Reader"));
  },
};
