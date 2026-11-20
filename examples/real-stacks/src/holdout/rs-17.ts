import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb";
import { inlineFunction, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";
/** 正解は安全です。Lambdaがテーブルを読み書きできるだけで、PassRoleもLambda作成もありません。 */
export const rs17: Pattern = {
  id: "RS-17",
  title: "A DynamoDB table with grantReadWriteData to a Lambda function",
  description:
    "A Lambda function may read and write a CDK-created table. Nobody can pass a role or create a function, so the stack is safe.",
  groundTruth: "safe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    const table = new Table(stack, "Items", {
      partitionKey: { name: "id", type: AttributeType.STRING },
    });
    table.grantReadWriteData(inlineFunction(stack, "Worker"));
  },
};
