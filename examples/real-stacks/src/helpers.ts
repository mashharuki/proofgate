import type { App } from "aws-cdk-lib";
import { Stack } from "aws-cdk-lib";
import { PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, Function as LambdaFunction, Runtime } from "aws-cdk-lib/aws-lambda";
import type { Construct } from "constructs";
import { PROTECTED_BUCKET_ARN } from "./config.js";

/** 開発者ロールのiam:PassRoleが指す、データロールのARNです。 */
export const DATA_ROLE_ARN = "arn:aws:iam::123456789012:role/data-role";

/** 権限の付け方です。defaultは`addToPolicy`（CDKが別の`AWS::IAM::Policy`を作る）、inlineはロール自身の`Policies`です。 */
type Style = "default" | "inline";

/** Appへ名前付きスタックを1つ追加します。 */
export const stackOf = (app: App, id = "RealStack"): Stack => new Stack(app, id);

/** iam:PassRoleのStatementです。 */
export const passRole = (resources: string[]): PolicyStatement =>
  new PolicyStatement({ actions: ["iam:PassRole"], resources });

/** Lambda関数の作成権限のStatementです。 */
export const createFunction = (): PolicyStatement =>
  new PolicyStatement({ actions: ["lambda:CreateFunction"], resources: ["*"] });

/** 保護対象バケット内のすべてのオブジェクトを表すResourceです。 */
export const ALL_PROTECTED_OBJECTS = `${PROTECTED_BUCKET_ARN}/*`;

/**
 * ロールを作り、Statementを付けます。
 * defaultは`addToPolicy`で、テンプレートでは`AWS::IAM::Policy`（`Roles`でロールを指す）になります。
 * inlineはRoleの`inlinePolicies`で、テンプレートでは`AWS::IAM::Role`の`Policies`になります。
 */
function roleWith(
  scope: Construct,
  id: string,
  props: { roleName?: string; service: string },
  statements: PolicyStatement[],
  style: Style,
): Role {
  const role = new Role(scope, id, {
    ...(props.roleName === undefined ? {} : { roleName: props.roleName }),
    assumedBy: new ServicePrincipal(props.service),
    ...(style === "inline"
      ? { inlinePolicies: { Access: new PolicyDocument({ statements }) } }
      : {}),
  });
  if (style === "default") for (const statement of statements) role.addToPolicy(statement);
  return role;
}

/** Lambdaが引き受けられ、指定したResourceのオブジェクトを読めるデータロールです。 */
export function dataRole(scope: Construct, resources: string[], style: Style = "default"): Role {
  const read = new PolicyStatement({ actions: ["s3:GetObject"], resources });
  return roleWith(
    scope,
    "DataRole",
    { roleName: "data-role", service: "lambda.amazonaws.com" },
    [read],
    style,
  );
}

/** EC2が引き受ける開発者ロールです。渡したStatementを持ちます。 */
export function developerRole(
  scope: Construct,
  statements: PolicyStatement[],
  style: Style = "default",
): Role {
  return roleWith(scope, "DeveloperRole", { service: "ec2.amazonaws.com" }, statements, style);
}

/** ネットワークやアセットを使わない、インラインコードのLambda関数です。 */
export function inlineFunction(scope: Construct, id: string): LambdaFunction {
  return new LambdaFunction(scope, id, {
    runtime: Runtime.NODEJS_22_X,
    handler: "index.handler",
    code: Code.fromInline("exports.handler = async () => ({});"),
  });
}

/**
 * 権限昇格経路の4条件がそろう、リテラルのロールの組を作ります（RS-02、RS-11、RS-14で共用）。
 * 開発者ロールがデータロールを渡してLambdaを作成でき、データロールは保護対象バケットの全オブジェクトを読めます。
 */
export function escalationPath(scope: Construct): void {
  dataRole(scope, [ALL_PROTECTED_OBJECTS]);
  developerRole(scope, [passRole([DATA_ROLE_ARN]), createFunction()]);
}
