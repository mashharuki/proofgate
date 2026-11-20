import { LambdaIntegration, RestApi } from "aws-cdk-lib/aws-apigateway";
import { inlineFunction, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";
/**
 * 正解は安全です。API GatewayがLambdaを呼ぶだけで、PassRoleもLambda作成もありません。
 * RestApiは、アカウント設定用にCloudWatchログのロール（管理ポリシー付き）も作ります。
 */
export const rs15: Pattern = {
  id: "RS-15",
  title: "An API Gateway REST API with a Lambda integration",
  description:
    "A REST API forwards GET requests to a Lambda function. Nobody can pass a role or create a function, so the stack is safe. CDK also creates a CloudWatch logs role for API Gateway that uses a managed policy.",
  groundTruth: "safe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    const api = new RestApi(stack, "Api");
    api.root.addMethod("GET", new LambdaIntegration(inlineFunction(stack, "Handler")));
  },
};
