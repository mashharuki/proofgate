import type { StackModel } from "@proofgate/model";

/**
 * StackModelを、Extractorが受理する最小のCloudFormationテンプレートへ変換します。
 * 各ロールの全Statementを`Policies[0]`のインラインポリシーへ入れるため、
 * `sourcePath`は`Resources.<Id>.Properties.Policies[0].PolicyDocument.Statement[<i>]`形式になります。
 */
export function statementPath(logicalId: string, index: number): string {
  return `Resources.${logicalId}.Properties.Policies[0].PolicyDocument.Statement[${index}]`;
}

/** テンプレートを作ります。trust principalが`*`のロールは`Principal: "*"`として出力します。 */
export function renderTemplate(model: StackModel): unknown {
  const resources: Record<string, unknown> = {};
  for (const role of model.roles) {
    const principal =
      role.trustServices.length === 1 && role.trustServices[0] === "*"
        ? "*"
        : { Service: [...role.trustServices] };
    const properties: Record<string, unknown> = {
      AssumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: principal, Action: "sts:AssumeRole" }],
      },
    };
    if (role.roleName !== undefined) properties.RoleName = role.roleName;
    if (role.statements.length > 0) {
      properties.Policies = [
        {
          PolicyName: "inline",
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: role.statements.map((s) => ({
              Effect: s.effect,
              Action: [...s.actions],
              Resource: [...s.resources],
            })),
          },
        },
      ];
    }
    resources[role.logicalId] = { Type: "AWS::IAM::Role", Properties: properties };
  }
  return { Resources: resources };
}
