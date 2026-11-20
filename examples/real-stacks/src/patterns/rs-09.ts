import { Duration } from "aws-cdk-lib";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { inlineFunction, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/** 正解は安全です。ルールがLambdaを呼ぶだけで、PassRoleもLambda作成もありません。 */
export const rs09: Pattern = {
  id: "RS-09",
  title: "An EventBridge rule with a Lambda target",
  description:
    "A scheduled EventBridge rule invokes a Lambda function. Nobody can pass a role or create a function, so the stack is safe. The execution role of the function uses a managed policy.",
  groundTruth: "safe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    const rule = new Rule(stack, "Hourly", { schedule: Schedule.rate(Duration.hours(1)) });
    rule.addTarget(new LambdaFunction(inlineFunction(stack, "Task")));
  },
};
