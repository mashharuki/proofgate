import { DefinitionBody, StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { inlineFunction, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/** 正解は安全です。ステートマシンのロールはLambdaを呼ぶだけで、PassRoleもLambda作成もありません。 */
export const rs07: Pattern = {
  id: "RS-07",
  title: "A Step Functions state machine that invokes a Lambda function",
  description:
    "A state machine with one LambdaInvoke task. The state machine role may only invoke the function, so the stack is safe. The generated trust policy has a condition on the account, which ProofGate does not evaluate.",
  groundTruth: "safe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    const task = new LambdaInvoke(stack, "Call", {
      lambdaFunction: inlineFunction(stack, "Worker"),
    });
    new StateMachine(stack, "Flow", { definitionBody: DefinitionBody.fromChainable(task) });
  },
};
