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
import type {
  ProofGateConfig,
  ResourceModel,
  RoleModel,
  StackModel,
  StatementModel,
} from "@proofgate-cdk/model";
import { BUCKET_GRANT_ACTIONS, LAUNCH_ACTIONS, OBJECT_ACTIONS } from "./aws-facts.js";
import { IMPLICIT_ACTIONS } from "./aws-implicit.js";
import { POLICY_WRITE_ACTIONS } from "./aws-policy-write.js";
import { LAUNCH_SUPPLEMENTS } from "./aws-supplements.js";
import {
  ANY_SUFFIX,
  compileGlob,
  intersects,
  literalTokens,
  matchTokens,
  type Token,
} from "./glob.js";

export type OracleVerdict = "unsafe" | "safe";

/** オラクルが見つけた経路です。診断とテストの照合に使います。 */
interface OraclePath {
  readonly principal: string;
  readonly target: string;
  readonly bucketArn: string;
}

// Decision 8.2: Action name case. Prefix and action name are case-insensitive.
// Compiled action patterns are cached: the launch table has 879 actions, so each pattern is matched many times.
// The cache changes only speed, not the result.
const compiledActions = new Map<string, ReturnType<typeof compileGlob>>();
function actionMatches(pattern: string, action: string): boolean {
  const key = pattern.toLowerCase();
  let tokens = compiledActions.get(key);
  if (tokens === undefined) {
    tokens = compileGlob(key);
    compiledActions.set(key, tokens);
  }
  return matchTokens(tokens, action);
}

const allows = (statement: StatementModel, action: string) =>
  statement.effect === "Allow" && statement.actions.some((p) => actionMatches(p, action));

// Decision 8.2: iam:PassRole Resource. The Resource names the roles that can be passed.
// Wildcards and "*" are allowed. Names are case-sensitive.
// Partition, region, and account are not constrained because they are unknown at synthesis time, but they contain no
// colon (a run without a colon, NSTAR), as in every real ARN.
// spec proofgate-lean-evaluator, L0 (F1, 2026-11-28): the Resource is read as a pattern that may denote the role's ARN,
// by intersection. Before, the oracle split the Resource at colons and required "role/" in the sixth part, so it never
// counted Resources such as arn:aws:iam::*:role*, arn:aws:iam:*role/x, arn:aws:iam::<account>:*, or arn:*, which the real
// IAM engine allows (observations P10, P11, P14). The evaluator had the same blind spot, so no test could see it.
// PassRoleのResourceは、ロールのARNを表しうるかを、交差で調べます（F1）。以前は「:role/」を要求していたため、
// IAMエンジンが許可するパターンを数えていませんでした。
// The reserved character U+0000 stands for a character that no policy literal contains (the extractor rejects it).
const FRESH: Wide = { kind: "lit", char: "\u0000" };
function passRoleResourceMatches(resource: string, target: RoleModel): boolean {
  const pattern = compileGlob(resource);
  if (target.roleName !== undefined) {
    return wideIntersects(pattern, [...ROLE_HEAD, ...literalTokens(target.roleName)]);
  }
  // spec proofgate-cdk-construct-support, rule R0 (design 2.3 and 5). A role without RoleName gets a name from
  // CloudFormation that is unknown at synthesis. It may be the opaque name "_generated_<LogicalId>" (an exact reference
  // such as role.roleArn), or an unknown name, read as a string that contains a character no literal can contain and
  // no colon (role names have no colon): a pattern meets it only through a wildcard in the name part. With a plain star
  // instead of NSTAR, the account `*` of arn:aws:iam::*:role/data-role would reach into the name (found by the fixed rows).
  // 名前のないロールは、不透明な名前か、どのリテラルにも含まれない文字を含む未知の名前として読みます。
  const opaque = literalTokens(`_generated_${target.logicalId}`);
  return (
    wideIntersects(pattern, [...ROLE_HEAD, ...opaque]) ||
    wideIntersects(pattern, [...ROLE_HEAD, NSTAR, FRESH, NSTAR])
  );
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
// The generated table plus the hand-written supplements (more trusted services of actions that already are in the table).
const LAUNCH_ENTRIES: [string, readonly string[]][] = Object.entries(LAUNCH_ACTIONS).map(
  ([action, values]) => [action, [...values, ...(LAUNCH_SUPPLEMENTS[action] ?? [])]],
);
const servicesOfPattern = new Map<string, readonly string[]>();
/** The services that one action pattern can launch (cached per pattern; speed only). */
function launchServicesOfPattern(pattern: string): readonly string[] {
  const key = pattern.toLowerCase();
  let services = servicesOfPattern.get(key);
  if (services === undefined) {
    const found = new Set<string>();
    for (const [action, values] of LAUNCH_ENTRIES) {
      if (actionMatches(key, action)) for (const value of values) found.add(value.toLowerCase());
    }
    services = [...found];
    servicesOfPattern.set(key, services);
  }
  return services;
}
function launchServices(principal: RoleModel): Set<string> {
  const services = new Set<string>();
  for (const statement of principal.statements) {
    if (statement.effect !== "Allow") continue;
    for (const pattern of statement.actions) {
      for (const service of launchServicesOfPattern(pattern)) services.add(service);
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
  LAUNCH_ENTRIES.flatMap(([, values]) => values.map((v) => v.toLowerCase())),
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
// ---------------------------------------------------------------------------------------------------------------
// Paths without iam:PassRole (spec proofgate-implicit-role-paths, design 5 and 6).
// A principal P can change a resource R that already runs as role T (an action of IMPLICIT_ACTIONS of R's kind, on a
// Resource that may denote R), and T reaches a protected bucket. Excluded: P = T, and T in allowedPassRoleTargets.
// The oracle matches resource ARNs with its own glob code, case-sensitively (ARNs are case-sensitive in IAM), and does not
// count a bare logical ID or physical name as a Resource (IAM rejects a Resource that is not an ARN or "*").
// PassRoleの要らない経路です。主体Pが、すでにロールTで動くリソースRを変更でき、Tが保護バケットに届くとき、経路があります。
// ---------------------------------------------------------------------------------------------------------------
// Partition, region, and account of an ARN contain no colon, but a `*` of a Resource pattern may stand for a colon. So the ARN
// side uses a token for "any run without a colon" (NSTAR); with an ordinary `*` a pattern such as `function:other-*` would
// meet every function through strings that are no ARN. The oracle has its own copy of the intersection for this token.
// ARN側のパーティション、リージョン、アカウントはコロンを含みません。専用のトークン（NSTAR）で表します。
type Wide = Token | { readonly kind: "nstar" };
const NSTAR: Wide = { kind: "nstar" };
const RESOURCE_SHAPES: Readonly<Record<ResourceModel["kind"], { head: string; tail: string }>> = {
  "lambda-function": { head: ":lambda:", tail: ":function:" },
  "codebuild-project": { head: ":codebuild:", tail: ":project/" },
  "stepfunctions-state-machine": { head: ":states:", tail: ":stateMachine:" },
};
function wideIntersects(a: readonly Wide[], b: readonly Wide[]): boolean {
  const memo = new Map<string, boolean>();
  const runs = (t: Wide | undefined) => t?.kind === "star" || t?.kind === "nstar";
  const share = (x: Wide, y: Wide): boolean => {
    if (x.kind === "lit" && y.kind === "lit") return x.char === y.char;
    if (x.kind === "lit" && y.kind === "nstar") return x.char !== ":";
    if (x.kind === "nstar" && y.kind === "lit") return y.char !== ":";
    return true;
  };
  const go = (i: number, j: number): boolean => {
    const key = `${i},${j}`;
    const seen = memo.get(key);
    if (seen !== undefined) return seen;
    memo.set(key, false);
    const x = a[i];
    const y = b[j];
    let ok = x === undefined && y === undefined;
    if (!ok && runs(x)) ok = go(i + 1, j);
    if (!ok && runs(y)) ok = go(i, j + 1);
    if (!ok && x !== undefined && y !== undefined && share(x, y)) {
      ok = go(runs(x) ? i : i + 1, runs(y) ? j : j + 1);
    }
    memo.set(key, ok);
    return ok;
  };
  return go(0, 0);
}
/** The ARN of the resource up to the name: arn:<p>:<service>:<region>:<account>:<type separator>. */
const arnHead = (resource: ResourceModel): Wide[] => {
  const { head, tail } = RESOURCE_SHAPES[resource.kind];
  return [
    ...literalTokens("arn:"),
    NSTAR,
    ...literalTokens(head),
    NSTAR,
    ...literalTokens(":"),
    NSTAR,
    ...literalTokens(tail),
  ];
};
/** Does the Resource pattern denote the ARN of the resource? An unnamed resource is read as its opaque name. */
function resourceDenotes(pattern: string, resource: ResourceModel): boolean {
  if (/^\*+$/.test(pattern)) return true;
  const unnamed = resource.name === undefined && resource.nameUnknown !== true;
  const name: Wide[] =
    resource.nameUnknown === true
      ? [NSTAR]
      : literalTokens(resource.name ?? `_generated_${resource.logicalId}`);
  if (wideIntersects(compileGlob(pattern), [...arnHead(resource), ...name])) return true;
  // An unnamed resource gets a name from CloudFormation that is unknown at synthesis: a wildcard in the name part of the
  // pattern may match it, a literal name cannot.
  if (!unnamed) return false;
  const tail = RESOURCE_SHAPES[resource.kind].tail;
  const at = pattern.indexOf(tail);
  if (at < 0) return false;
  return (
    /[*?]/.test(pattern.slice(at + tail.length)) &&
    wideIntersects(compileGlob(pattern), [...arnHead(resource), NSTAR])
  );
}
function canChangeResource(
  principal: RoleModel,
  resource: ResourceModel,
): readonly StatementModel[] {
  const actions = IMPLICIT_ACTIONS.filter((entry) => entry.kind === resource.kind);
  return principal.statements.filter(
    (s) =>
      s.effect === "Allow" &&
      actions.some((entry) => allows(s, entry.action)) &&
      s.resources.some((r) => resourceDenotes(r, resource)),
  );
}
function implicitPaths(model: StackModel, config: ProofGateConfig): OraclePath[] {
  const found: OraclePath[] = [];
  const roles = new Map(model.roles.map((role) => [role.logicalId, role]));
  for (const resource of model.resources ?? []) {
    const target =
      resource.roleLogicalId === undefined ? undefined : roles.get(resource.roleLogicalId);
    if (target === undefined) continue;
    if (config.allowedPassRoleTargets?.includes(target.logicalId)) continue;
    for (const principal of model.roles) {
      if (principal.logicalId === target.logicalId) continue;
      if (canChangeResource(principal, resource).length === 0) continue;
      for (const bucketArn of config.protectedBucketArns) {
        if (canReachBucket(target, bucketArn)) {
          found.push({ principal: principal.logicalId, target: target.logicalId, bucketArn });
        }
      }
    }
  }
  return found;
}
/** Design 6: a resource whose role cannot be identified, that some principal can change, is rejected (PG-IAM-003). */
export function oracleUnknownRoles(model: StackModel): { readonly resource: string }[] {
  return (model.resources ?? [])
    .filter(
      (resource) =>
        resource.roleUnknown === true &&
        model.roles.some((principal) => canChangeResource(principal, resource).length > 0),
    )
    .map((resource) => ({ resource: resource.logicalId }));
}
// ---------------------------------------------------------------------------------------------------------------
// Roles that change IAM itself (spec proofgate-self-escalation, design 4): PG-IAM-005.
// - self-grant: P holds iam:PutRolePolicy or iam:AttachRolePolicy on a Resource that may denote P's own role ARN. After
//   it P can reach every bucket, so it is a finding for every protected bucket, whatever P reaches today.
// - take-over: P holds iam:UpdateAssumeRolePolicy on a Resource that may denote the role ARN of T (T is not P), and T reaches
//   the bucket. T in allowedPassRoleTargets is excluded.
// - creation grant: P holds iam:CreateRole (S1) and a self-grant action (S2) whose Resources, both of the shape of a role ARN,
//   intersect (the Unit 42 sequence of 2024). The created role is not in the template.
// - P in allowedPolicyWriters is excluded from all three.
// The oracle matches role ARNs with its own code, case-sensitively, and does not count a bare name (IAM rejects it).
// ロール自身がIAMを書き換える経路です（PG-IAM-005）。自分への付与、乗っ取り、作成して付与の3つです。
// ---------------------------------------------------------------------------------------------------------------
const ROLE_HEAD: Wide[] = [
  ...literalTokens("arn:"),
  NSTAR,
  ...literalTokens(":iam:"),
  NSTAR,
  ...literalTokens(":"),
  NSTAR,
  ...literalTokens(":role/"),
];
/** Does the Resource pattern denote the ARN of the role? An unnamed role is read as its opaque name. */
function roleDenotes(pattern: string, role: RoleModel): boolean {
  if (/^\*+$/.test(pattern)) return true;
  const unnamed = role.roleName === undefined;
  const name = literalTokens(role.roleName ?? `_generated_${role.logicalId}`);
  if (wideIntersects(compileGlob(pattern), [...ROLE_HEAD, ...name])) return true;
  if (!unnamed) return false;
  const at = pattern.indexOf(":role/");
  if (at < 0) return false;
  return (
    /[*?]/.test(pattern.slice(at + ":role/".length)) &&
    wideIntersects(compileGlob(pattern), [...ROLE_HEAD, ANY_SUFFIX])
  );
}
const policyActions = (shape: "self-grant" | "take-over" | "creating") =>
  POLICY_WRITE_ACTIONS.filter((entry) => entry.shape === shape).map((entry) => entry.action);
const holding = (role: RoleModel, shape: "self-grant" | "take-over" | "creating") =>
  role.statements.filter(
    (s) => s.effect === "Allow" && policyActions(shape).some((action) => allows(s, action)),
  );
const isRoleShape = (pattern: string) =>
  wideIntersects(compileGlob(pattern), [...ROLE_HEAD, ANY_SUFFIX]);
function hasSelfGrant(role: RoleModel): boolean {
  return holding(role, "self-grant").some((s) => s.resources.some((r) => roleDenotes(r, role)));
}
function hasCreationGrant(role: RoleModel): boolean {
  const creating = holding(role, "creating")
    .flatMap((s) => s.resources)
    .filter(isRoleShape);
  const writing = holding(role, "self-grant")
    .flatMap((s) => s.resources)
    .filter(isRoleShape);
  return creating.some((a) => writing.some((b) => intersects(compileGlob(a), compileGlob(b))));
}
function hasTakeOver(principal: RoleModel, target: RoleModel): boolean {
  return holding(principal, "take-over").some((s) =>
    s.resources.some((r) => roleDenotes(r, target)),
  );
}
function policyWritePaths(model: StackModel, config: ProofGateConfig): OraclePath[] {
  const found: OraclePath[] = [];
  for (const principal of model.roles) {
    if (config.allowedPolicyWriters?.includes(principal.logicalId)) continue;
    for (const bucketArn of config.protectedBucketArns) {
      if (hasSelfGrant(principal) || hasCreationGrant(principal)) {
        found.push({ principal: principal.logicalId, target: principal.logicalId, bucketArn });
      }
      for (const target of model.roles) {
        if (target.logicalId === principal.logicalId) continue;
        if (config.allowedPassRoleTargets?.includes(target.logicalId)) continue;
        if (hasTakeOver(principal, target) && canReachBucket(target, bucketArn)) {
          found.push({ principal: principal.logicalId, target: target.logicalId, bucketArn });
        }
      }
    }
  }
  return found;
}
/** モデルが危険か安全かを返します。 */
export function oracleVerdict(model: StackModel, config: ProofGateConfig): OracleVerdict {
  return oraclePaths(model, config).length > 0 ||
    implicitPaths(model, config).length > 0 ||
    policyWritePaths(model, config).length > 0
    ? "unsafe"
    : "safe";
}
