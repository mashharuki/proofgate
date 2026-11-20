import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Bucket, EventType } from "aws-cdk-lib/aws-s3";
import { inlineFunction, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";
/**
 * 正解は安全です。バケットへの書き込みでLambdaが起動するだけで、PassRoleもLambda作成もありません。
 * 通知の設定のために、CDKはカスタムリソースのLambdaとそのロールを追加で作ります。
 */
export const rs18: Pattern = {
  id: "RS-18",
  title: "A Lambda function with an S3 event source",
  description:
    "A Lambda function runs when objects are created in a CDK-created bucket. CDK adds a custom resource function and role to configure the bucket notification. Nobody can pass a role or create a function, so the stack is safe.",
  groundTruth: "safe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    const bucket = new Bucket(stack, "Uploads");
    inlineFunction(stack, "OnUpload").addEventSource(
      new S3EventSource(bucket, { events: [EventType.OBJECT_CREATED] }),
    );
  },
};
