import { ContainerImage, FargateTaskDefinition } from "aws-cdk-lib/aws-ecs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/** 正解は安全です。タスクロールにPassRoleはなく、Lambdaも作れません。 */
export const rs08: Pattern = {
  id: "RS-08",
  title: "An ECS Fargate task with grantReadWrite on the task role",
  description:
    "A Fargate task definition with one container from a public registry image. The task role gets read and write access to a CDK-created bucket. The stack has no PassRole permission, so it is safe.",
  groundTruth: "safe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    const task = new FargateTaskDefinition(stack, "Task");
    task.addContainer("App", {
      image: ContainerImage.fromRegistry("public.ecr.aws/docker/library/busybox"),
    });
    new Bucket(stack, "Data").grantReadWrite(task.taskRole);
  },
};
