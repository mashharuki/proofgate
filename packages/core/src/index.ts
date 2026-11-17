import type { ProofGateConfig, RoleModel, StackModel, StatementModel, Violation } from "@proofgate/model";
import { RULE_ID } from "@proofgate/model";

const lower = (value: string) => value.toLowerCase();
const matches = (pattern: string, value: string): boolean => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
};
const allowsAction = (statement: StatementModel, actions: readonly string[]) =>
  statement.effect === "Allow" && statement.actions.some((pattern) => actions.some((action) => matches(lower(pattern), lower(action))));
const allowsResource = (statement: StatementModel, resource: string) => statement.resources.some((pattern) => matches(pattern, resource));
const statementsAllow = (role: RoleModel, actions: readonly string[], resource: string) =>
  role.statements.filter((statement) => allowsAction(statement, actions) && allowsResource(statement, resource));

function allowsPassRoleTarget(statement: StatementModel, target: RoleModel): boolean {
  if (!allowsAction(statement, ["iam:PassRole"])) return false;
  const directIdentifiers = [target.logicalId, target.roleName].filter((value): value is string => Boolean(value));
  return statement.resources.some((resourcePattern) => {
    if (directIdentifiers.some((identifier) => matches(resourcePattern, identifier))) return true;
    if (!target.roleName) return false;
    const roleMarker = ":role/";
    const markerIndex = resourcePattern.indexOf(roleMarker);
    if (markerIndex < 0) return false;
    const candidateWithSameArnScope = `${resourcePattern.slice(0, markerIndex + roleMarker.length)}${target.roleName}`;
    return matches(resourcePattern, candidateWithSameArnScope);
  });
}

const S3_DATA_ACTIONS = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:*"] as const;

function lambdaControlStatements(role: RoleModel): StatementModel[] {
  const create = role.statements.filter((statement) => allowsAction(statement, ["lambda:CreateFunction"]));
  if (create.length > 0) return create;
  const configure = role.statements.filter((statement) => allowsAction(statement, ["lambda:UpdateFunctionConfiguration"]));
  const code = role.statements.filter((statement) => allowsAction(statement, ["lambda:UpdateFunctionCode"]));
  return configure.length > 0 && code.length > 0 ? [...new Set([...configure, ...code])] : [];
}

interface CandidatePath {
  readonly principal: RoleModel;
  readonly target: RoleModel;
  readonly bucketArn: string;
  readonly passRole: readonly StatementModel[];
  readonly lambdaControl: readonly StatementModel[];
  readonly targetIsLambdaAssumable: boolean;
  readonly bucketAccess: readonly StatementModel[];
}

function candidatePaths(model: StackModel, config: ProofGateConfig): CandidatePath[] {
  const candidates: CandidatePath[] = [];
  for (const principal of model.roles) {
    for (const target of model.roles) {
      if (principal.logicalId === target.logicalId || config.allowedPassRoleTargets?.includes(target.logicalId)) continue;
      const passRole = principal.statements.filter((statement) => allowsPassRoleTarget(statement, target));
      const lambdaControl = lambdaControlStatements(principal);
      const targetIsLambdaAssumable = target.trustServices.some((service) => service === "*" || service === "lambda.amazonaws.com");
      for (const bucketArn of config.protectedBucketArns) {
        const objectArn = `${bucketArn.replace(/\/$/, "")}/*`;
        candidates.push({
          principal,
          target,
          bucketArn,
          passRole,
          lambdaControl,
          targetIsLambdaAssumable,
          bucketAccess: statementsAllow(target, S3_DATA_ACTIONS, objectArn),
        });
      }
    }
  }
  return candidates;
}

export function evaluate(model: StackModel, config: ProofGateConfig): Violation[] {
  const violations: Violation[] = [];
  for (const { principal, target, bucketArn, passRole, lambdaControl, targetIsLambdaAssumable, bucketAccess } of candidatePaths(
    model,
    config,
  )) {
    if (passRole.length === 0 || lambdaControl.length === 0 || !targetIsLambdaAssumable || bucketAccess.length === 0) continue;
    violations.push({
      ruleId: RULE_ID,
      principalLogicalId: principal.logicalId,
      targetRoleLogicalId: target.logicalId,
      protectedBucketArn: bucketArn,
      sourcePaths: [...new Set([...passRole, ...lambdaControl, ...bucketAccess].map((statement) => statement.sourcePath))],
      explanation: `${principal.logicalId} can pass Lambda-assumable role ${target.logicalId} and control Lambda code or configuration; ${target.logicalId} can access protected bucket ${bucketArn}.`,
    });
  }
  return violations;
}

const leanString = (value: string) => JSON.stringify(value);
export function generateLean(model: StackModel, config: ProofGateConfig): string {
  const paths = candidatePaths(model, config).map(
    ({ principal, target, bucketArn, passRole, lambdaControl, targetIsLambdaAssumable, bucketAccess }) =>
      `{ principal := ${leanString(principal.logicalId)}, target := ${leanString(target.logicalId)}, protectedResource := ${leanString(bucketArn)}, canPassRole := ${passRole.length > 0}, canControlLambda := ${lambdaControl.length > 0}, targetIsLambdaAssumable := ${targetIsLambdaAssumable}, targetCanAccess := ${bucketAccess.length > 0} }`,
  );
  return `import ProofGate.Security\n\ndef generatedPaths : List ProofGate.EscalationPath := [${paths.join(",\n  ")}]\n\n#eval if ProofGate.safe generatedPaths then "PROOFGATE_SAFE" else "PROOFGATE_UNSAFE"\n\ntheorem generatedStackIsSafe : ProofGate.safe generatedPaths = true := by\n  native_decide\n`;
}
