import { Queue } from "aws-cdk-lib/aws-sqs";
import { inlineFunction, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";
/** 正解は安全です。Lambdaがキューへ送信できるだけで、PassRoleもLambda作成もありません。 */
export const rs16: Pattern = {
  id: "RS-16",
  title: "An SQS queue with grantSendMessages to a Lambda function",
  description:
    "A Lambda function may send messages to a CDK-created queue. Nobody can pass a role or create a function, so the stack is safe.",
  groundTruth: "safe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    new Queue(stack, "Jobs").grantSendMessages(inlineFunction(stack, "Producer"));
  },
};
