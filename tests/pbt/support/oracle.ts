/**
 * Independent oracle (O2) for ProofGate generated tests.
 *
 * It decides, for any valid StackModel, whether a PG-IAM-004 escalation path exists under the
 * AWS semantics recorded in design.md section 8.2. It imports no production code (only
 * model types) and does not use the production matcher.
 *
 * Coverage limits (Requirement 2.5). The oracle does NOT cover:
 * - Explicit Deny (Deny statements are ignored; ProofGate's evaluator also ignores them,
 *   which can only add findings)
 * - SCPs, permissions boundaries, session policies, resource policies
 * - IAM Condition elements and policy variables (the extractor rejects both)
 * - cross-account semantics: the partition and account parts of a PassRole ARN are not
 *   checked because they are unknown when the template is synthesized
 * - Lambda resource scoping (lambda:* Resource is not evaluated; this is conservative)
 * - S3 data actions beyond GetObject, PutObject, DeleteObject (see design.md section 18)
 */
import type { ProofGateConfig, RoleModel, StackModel, StatementModel } from "@proofgate-cdk/model";
import { ANY_SUFFIX, compileGlob, intersects, literalTokens, matchTokens } from "./glob.js";

export type OracleVerdict = "unsafe" | "safe";

/** オラクルが見つけた経路です。診断とテストの照合に使います。 */
interface OraclePath {
  readonly principal: string;
  readonly target: string;
  readonly bucketArn: string;
}

const LAMBDA_SERVICE = "lambda.amazonaws.com";
const S3_DATA_ACTIONS = ["s3:getobject", "s3:putobject", "s3:deleteobject"] as const;

// Decision 8.2: Action name case. Prefix and action name are case-insensitive.
function actionMatches(pattern: string, action: string): boolean {
  return matchTokens(compileGlob(pattern.toLowerCase(), { colonAware: false }), action);
}

const allows = (statement: StatementModel, action: string) =>
  statement.effect === "Allow" && statement.actions.some((p) => actionMatches(p, action));

// Decision 8.2: iam:PassRole Resource. The Resource names the roles that can be passed.
// Wildcards and "*" are allowed. Names are case-sensitive.
// Partition and account are not constrained because they are unknown at synthesis time.
function passRoleResourceMatches(resource: string, target: RoleModel): boolean {
  if (/^\*+$/.test(resource)) return true;
  if (target.roleName === undefined) return false;
  const parts = resource.split(":");
  const [prefix, , service, region] = parts;
  const rest = parts.slice(5).join(":");
  if (parts.length < 6 || prefix !== "arn" || service !== "iam" || region !== "") return false;
  if (!rest.startsWith("role/")) return false;
  const namePattern = rest.slice("role/".length);
  return matchTokens(compileGlob(namePattern, { colonAware: false }), target.roleName);
}

/** 保護バケット内の全オブジェクトを表す集合です（末尾のスラッシュは取り除きます）。 */
function protectedObjects(bucketArn: string) {
  return [...literalTokens(`${bucketArn.replace(/\/$/, "")}/`), ANY_SUFFIX];
}

// Decision 8.2: S3 bucket vs object ARN, and D1. A Resource gives access when the set of ARNs it
// denotes intersects the object set of the protected bucket. A bucket-level ARN alone does not.
// Resources are case-sensitive.
function resourceReachesBucket(resource: string, bucketArn: string): boolean {
  return intersects(compileGlob(resource, { colonAware: true }), protectedObjects(bucketArn));
}

function canPassRole(principal: RoleModel, target: RoleModel): boolean {
  return principal.statements.some(
    (s) => allows(s, "iam:passrole") && s.resources.some((r) => passRoleResourceMatches(r, target)),
  );
}

function canControlLambda(principal: RoleModel): boolean {
  if (principal.statements.some((s) => allows(s, "lambda:createfunction"))) return true;
  const configure = principal.statements.some((s) =>
    allows(s, "lambda:updatefunctionconfiguration"),
  );
  const code = principal.statements.some((s) => allows(s, "lambda:updatefunctioncode"));
  return configure && code;
}

// Decision 8.2: Lambda trust principal. Only lambda.amazonaws.com (case-insensitive) is Lambda trust.
// The principal "*" is NOT Lambda trust here; ProofGate treats it as Lambda-assumable on purpose (TRUST_STAR).
function trustsLambda(target: RoleModel): boolean {
  return target.trustServices.some((s) => s.toLowerCase() === LAMBDA_SERVICE);
}

function canReachBucket(target: RoleModel, bucketArn: string): boolean {
  return target.statements.some(
    (s) =>
      S3_DATA_ACTIONS.some((a) => allows(s, a)) &&
      s.resources.some((r) => resourceReachesBucket(r, bucketArn)),
  );
}

/** 4条件をすべて満たす経路を列挙します。 */
function oraclePaths(model: StackModel, config: ProofGateConfig): OraclePath[] {
  const paths: OraclePath[] = [];
  for (const principal of model.roles) {
    if (!canControlLambda(principal)) continue;
    for (const target of model.roles) {
      // allowedPassRoleTargets is defined by ProofGate, not by AWS: a listed Logical ID is never a target.
      if (principal.logicalId === target.logicalId) continue;
      if (config.allowedPassRoleTargets?.includes(target.logicalId)) continue;
      if (!trustsLambda(target) || !canPassRole(principal, target)) continue;
      for (const bucketArn of config.protectedBucketArns) {
        if (canReachBucket(target, bucketArn)) {
          paths.push({
            principal: principal.logicalId,
            target: target.logicalId,
            bucketArn,
          });
        }
      }
    }
  }
  return paths;
}

/** モデルが危険か安全かを返します。 */
export function oracleVerdict(model: StackModel, config: ProofGateConfig): OracleVerdict {
  return oraclePaths(model, config).length > 0 ? "unsafe" : "safe";
}
