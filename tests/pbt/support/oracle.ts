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
 * - S3 access points and Multi-Region Access Points (a Resource on an access point ARN does not
 *   intersect the bucket ARN)
 *
 * S3 access (spec proofgate-brushup, Requirement 1). The actions come from the AWS Service Reference
 * (`aws-facts.ts`, data only): the 44 actions that take the `object` resource count on the object set of
 * the protected bucket, and the bucket actions that can give others access, or copy or expire every
 * object (permission management, replication, lifecycle), count on the bucket ARN itself.
 */
import type { ProofGateConfig, RoleModel, StackModel, StatementModel } from "@proofgate-cdk/model";
import { BUCKET_GRANT_ACTIONS, LAUNCH_ACTIONS, OBJECT_ACTIONS } from "./aws-facts.js";
import { ANY_SUFFIX, compileGlob, intersects, literalTokens, matchTokens } from "./glob.js";

export type OracleVerdict = "unsafe" | "safe";

/** オラクルが見つけた経路です。診断とテストの照合に使います。 */
interface OraclePath {
  readonly principal: string;
  readonly target: string;
  readonly bucketArn: string;
}

// Decision 8.2: Action name case. Prefix and action name are case-insensitive.
function actionMatches(pattern: string, action: string): boolean {
  return matchTokens(compileGlob(pattern.toLowerCase()), action);
}

const allows = (statement: StatementModel, action: string) =>
  statement.effect === "Allow" && statement.actions.some((p) => actionMatches(p, action));

// Decision 8.2: iam:PassRole Resource. The Resource names the roles that can be passed.
// Wildcards and "*" are allowed. Names are case-sensitive.
// Partition and account are not constrained because they are unknown at synthesis time.
function passRoleResourceMatches(resource: string, target: RoleModel): boolean {
  if (/^\*+$/.test(resource)) return true;
  const parts = resource.split(":");
  const [prefix, , service, region] = parts;
  const rest = parts.slice(5).join(":");
  if (parts.length < 6 || prefix !== "arn" || service !== "iam" || region !== "") return false;
  if (!rest.startsWith("role/")) return false;
  const namePattern = rest.slice("role/".length);
  // spec proofgate-cdk-construct-support, rule R0 (design 2.3 and 5). A role without RoleName gets a
  // name from CloudFormation that is unknown at synthesis. It is read as the opaque name
  // "_generated_<LogicalId>". A pattern whose role-name part has a wildcard may match the real
  // generated name, so it counts; a plain literal name cannot be the generated one, so it only
  // counts if it is the opaque name itself (an exact reference such as role.roleArn).
  // 名前のないロールは、CloudFormationが付ける未知の名前を、不透明な名前として読みます。
  if (target.roleName === undefined) {
    if (/[*?]/.test(namePattern)) return true;
    return matchTokens(compileGlob(namePattern), `_generated_${target.logicalId}`);
  }
  return matchTokens(compileGlob(namePattern), target.roleName);
}

/** 保護バケット内の全オブジェクトを表す集合です（末尾のスラッシュは取り除きます）。 */
function protectedObjects(bucketArn: string) {
  return [...literalTokens(`${bucketArn.replace(/\/$/, "")}/`), ANY_SUFFIX];
}

// Decision 8.2: S3 bucket vs object ARN, and D1. A Resource gives access when the set of ARNs it
// denotes intersects the object set of the protected bucket. A bucket-level ARN alone does not.
// Resources are case-sensitive.
function resourceReachesBucket(resource: string, bucketArn: string): boolean {
  return intersects(compileGlob(resource), protectedObjects(bucketArn));
}

function canPassRole(principal: RoleModel, target: RoleModel): boolean {
  return principal.statements.some(
    (s) => allows(s, "iam:passrole") && s.resources.some((r) => passRoleResourceMatches(r, target)),
  );
}

// Launch services (spec proofgate-brushup, Step 5, design 5.1 and 5.2). An action of the generated table
// (LAUNCH_ACTIONS: write or permission-management actions of operations that authorize iam:PassRole) gives the
// service principals that the passed role can be handed to. "*" in a value means the Service Reference names no
// service: any service. Lambda is no longer special: lambda:CreateFunction and lambda:UpdateFunctionConfiguration
// are entries of the table (UpdateFunctionConfiguration can change Role and Layers, read 2026-11-20).
// 起動サービスの集合です。表の各アクションが、ロールを渡せるサービスを返します。Lambdaも表の1項目です。
function launchServices(principal: RoleModel): Set<string> {
  const services = new Set<string>();
  for (const statement of principal.statements) {
    if (statement.effect !== "Allow") continue;
    for (const [action, values] of Object.entries(LAUNCH_ACTIONS)) {
      if (statement.actions.some((pattern) => actionMatches(pattern, action))) {
        for (const value of values) services.add(value.toLowerCase());
      }
    }
  }
  return services;
}
// Follow-up a (data verification 2026-11-21): Step Functions documents the principal both as
// states.amazonaws.com and states.<region>.amazonaws.com. A regional form is read as the global one.
// リージョン付きのサービスプリンシパルは、リージョンなしの形として読みます。
const REGIONAL_PRINCIPAL = /^([a-z0-9-]+)\.[a-z]{2}(?:-[a-z]+)+-\d+\.amazonaws\.com$/;
function normalizeService(service: string): string {
  const lower = service.toLowerCase();
  const match = REGIONAL_PRINCIPAL.exec(lower);
  return match === null ? lower : `${match[1]}.amazonaws.com`;
}
// The oracle reads the trust principal "*" strictly: it is not a service. ProofGate treats it as assumable by
// every launchable service on purpose (TRUST_STAR, a conservative over-approximation, tagged in the Cases).
function trustedServices(target: RoleModel): Set<string> {
  return new Set(target.trustServices.filter((s) => s !== "*").map(normalizeService));
}
/** The principal can hand the target role to a service that the target trusts. */
function launchMatches(principal: RoleModel, target: RoleModel): boolean {
  const launch = launchServices(principal);
  const trusted = trustedServices(target);
  if (launch.size === 0 || trusted.size === 0) return false;
  if (launch.has("*")) return true;
  return [...trusted].some((service) => launch.has(service));
}
/** Every service principal that appears in a value of the table. */
const KNOWN_LAUNCH_SERVICES: ReadonlySet<string> = new Set(
  Object.values(LAUNCH_ACTIONS).flatMap((values) => values.map((v) => v.toLowerCase())),
);
// A bucket action is applied to the bucket ARN itself (no key part).
function resourceReachesBucketArn(resource: string, bucketArn: string): boolean {
  return intersects(compileGlob(resource), literalTokens(bucketArn.replace(/\/$/, "")));
}
function canReachBucket(target: RoleModel, bucketArn: string): boolean {
  return target.statements.some(
    (s) =>
      (OBJECT_ACTIONS.some((a) => allows(s, a)) &&
        s.resources.some((r) => resourceReachesBucket(r, bucketArn))) ||
      (BUCKET_GRANT_ACTIONS.some((a) => allows(s, a)) &&
        s.resources.some((r) => resourceReachesBucketArn(r, bucketArn))),
  );
}

function reaches(
  model: StackModel,
  config: ProofGateConfig,
  check: (p: RoleModel, t: RoleModel, b: string) => boolean,
) {
  const found: OraclePath[] = [];
  for (const principal of model.roles) {
    for (const target of model.roles) {
      // allowedPassRoleTargets is defined by ProofGate, not by AWS: a listed Logical ID is never a target.
      if (principal.logicalId === target.logicalId) continue;
      if (config.allowedPassRoleTargets?.includes(target.logicalId)) continue;
      for (const bucketArn of config.protectedBucketArns) {
        if (check(principal, target, bucketArn)) {
          found.push({ principal: principal.logicalId, target: target.logicalId, bucketArn });
        }
      }
    }
  }
  return found;
}
/** 4条件をすべて満たす経路を列挙します。 */
function oraclePaths(model: StackModel, config: ProofGateConfig): OraclePath[] {
  return reaches(
    model,
    config,
    (principal, target, bucketArn) =>
      canPassRole(principal, target) &&
      launchMatches(principal, target) &&
      canReachBucket(target, bucketArn),
  );
}
/**
 * Design 5.4. A role that can be passed and reaches a protected bucket, and that trusts a service principal
 * that appears in no value of the launch table (and is not "*"): ProofGate cannot tell whether that service
 * runs code with a passed role, so the stack is not accepted (PG-IAM-003).
 * 渡せて保護バケットに届くロールが、表にないサービスを信頼しているとき、PG-IAM-003にする対象です。
 */
export function oracleUnknownTrusts(
  model: StackModel,
  config: ProofGateConfig,
): { readonly target: string; readonly service: string }[] {
  const out = new Map<string, { target: string; service: string }>();
  const byId = new Map(model.roles.map((role) => [role.logicalId, role]));
  for (const path of reaches(
    model,
    config,
    (principal, target, bucketArn) =>
      canPassRole(principal, target) && canReachBucket(target, bucketArn),
  )) {
    for (const service of trustedServices(byId.get(path.target) as RoleModel)) {
      if (!KNOWN_LAUNCH_SERVICES.has(service)) {
        out.set(`${path.target}|${service}`, { target: path.target, service });
      }
    }
  }
  return [...out.values()];
}
/** モデルが危険か安全かを返します。 */
export function oracleVerdict(model: StackModel, config: ProofGateConfig): OracleVerdict {
  return oraclePaths(model, config).length > 0 ? "unsafe" : "safe";
}
