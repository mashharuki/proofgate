import { Project, Source } from "aws-cdk-lib/aws-codebuild";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { ALL_PROTECTED_OBJECTS, dataRole, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/**
 * 正解は危険です。CodeBuildプロジェクトのロールは、任意のロールを渡せ（iam:PassRole、Resourceは*）、
 * Lambdaを作成でき、同じスタックのデータロールはLambdaが引き受けられて保護対象バケットを読めます。
 * ただしCodeBuildのロールには、CDKが作るログ用の非リテラルなStatementも含まれます。
 */
export const rs10: Pattern = {
  id: "RS-10",
  title: "A CodeBuild project that can pass any role and create functions",
  description:
    "A CodeBuild project role gets iam:PassRole on every role and lambda:CreateFunction. The same stack has a literal data role that Lambda can assume and that reads the protected bucket. The project role also has statements that CDK builds from CloudFormation functions.",
  groundTruth: "unsafe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    const project = new Project(stack, "Build", {
      source: Source.gitHub({ owner: "example", repo: "example" }),
    });
    project.addToRolePolicy(new PolicyStatement({ actions: ["iam:PassRole"], resources: ["*"] }));
    project.addToRolePolicy(
      new PolicyStatement({ actions: ["lambda:CreateFunction"], resources: ["*"] }),
    );
    dataRole(stack, [ALL_PROTECTED_OBJECTS]);
  },
};
