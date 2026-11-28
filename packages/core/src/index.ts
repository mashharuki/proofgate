import type {
  ProofGateConfig,
  ResourceModel,
  RoleModel,
  StackModel,
  StatementModel,
  UnsupportedFinding,
  Violation,
} from "@proofgate-cdk/model";
import { RULE_ID, RULE_ID_POLICY_WRITE } from "@proofgate-cdk/model";
import { BUCKET_GRANT_ACTIONS, LAUNCH_ACTIONS, OBJECT_ACTIONS } from "./aws-tables.generated.js";
import { IMPLICIT_ACTIONS } from "./implicit-actions.js";
import { LAUNCH_SUPPLEMENTS } from "./launch-supplements.js";
import { POLICY_WRITE_ACTIONS, type PolicyWriteShape } from "./policy-write-actions.js";

/**
 * 正規化済みIAMモデルから権限昇格の候補経路を組み立て、
 * TypeScript参照実装での判定と、同じ事実を検査するLeanコード生成を提供します。
 */
const lower = (value: string) => value.toLowerCase();

// IAMのAction・Resourceで使用される`*`（任意長）と`?`（任意の1文字）を、文字列全体に対するglobとして扱います。
const compiled = new Map<string, RegExp>();
const matches = (pattern: string, value: string): boolean => {
  let regex = compiled.get(pattern);
  if (regex === undefined) {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replaceAll("*", ".*")
      .replaceAll("?", ".");
    regex = new RegExp(`^${escaped}$`, "i");
    compiled.set(pattern, regex);
  }
  return regex.test(value);
};

const allowsAction = (statement: StatementModel, actions: readonly string[]) =>
  statement.effect === "Allow" &&
  statement.actions.some((pattern) =>
    actions.some((action) => matches(lower(pattern), lower(action))),
  );

// --- globで表した2つのARN集合が交わるかの判定（保護バケットのアクセス判定に使用） ---
type GlobToken =
  | { readonly kind: "lit"; readonly char: string }
  | { readonly kind: "one" }
  | { readonly kind: "star" };
const STAR: GlobToken = { kind: "star" };
/** IAMのglobを、`*`（任意長）と`?`（任意の1文字）を含むトークン列へ変換します。比較は大文字小文字を区別しません。 */
const globOf = (pattern: string): GlobToken[] =>
  [...pattern].map((char) =>
    char === "*" ? STAR : char === "?" ? { kind: "one" } : { kind: "lit", char: lower(char) },
  );
/** ワイルドカードを解釈しない、完全に固定した文字列のトークン列です。 */
const literalOf = (text: string): GlobToken[] =>
  [...text].map((char) => ({ kind: "lit", char: lower(char) }));
const isStar = (token: GlobToken | undefined) => token?.kind === "star";
/** 非`*`同士のトークンが、同じ1文字を受理できるかを判定します。 */
const compatible = (a: GlobToken, b: GlobToken) =>
  a.kind === "one" ||
  b.kind === "one" ||
  (a.kind === "lit" && b.kind === "lit" && a.char === b.char);
/**
 * 2つのglobが表す文字列集合の共通部分が空でないかを判定します。
 * 一方を他方の文字列として照合する一方向のマッチではなく、集合同士の交差を調べます。
 */
function globsIntersect(a: readonly GlobToken[], b: readonly GlobToken[]): boolean {
  const memo = new Map<number, boolean>();
  const width = b.length + 1;
  const go = (i: number, j: number): boolean => {
    const key = i * width + j;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const left = a[i];
    const right = b[j];
    let result = left === undefined && right === undefined;
    if (!result && isStar(left)) result = go(i + 1, j);
    if (!result && isStar(right)) result = go(i, j + 1);
    if (!result && left !== undefined && right !== undefined) {
      if (!isStar(left) && !isStar(right)) result = compatible(left, right) && go(i + 1, j + 1);
      // 片方が`*`のとき、もう片方の1文字を`*`が吸収します。
      else if (isStar(left) && !isStar(right)) result = go(i, j + 1);
      else if (!isStar(left) && isStar(right)) result = go(i + 1, j);
    }
    memo.set(key, result);
    return result;
  };
  return go(0, 0);
}
/**
 * 保護バケットへのアクセスを与えるStatementを返します（spec proofgate-brushup, 要件1）。
 * - オブジェクトに対するアクション（AWS Service Referenceで`object`リソースを取る44個）は、
 *   `<バケット>/`で始まる任意のキーに届くResourceで数えます。`bucket/reports/*`のような一部のプレフィックスも届きます。
 *   バケットレベルのARNだけでは、オブジェクト操作に届きません。
 * - バケットの権限を変えるアクションと、複製・ライフサイクルの設定は、バケットのARNそのものに届くResourceで数えます。
 *   バケットポリシーやACLで他のプリンシパルにアクセスを与えたり、全オブジェクトを写したり期限切れにしたりできるためです。
 * 以前は`GetObject`、`PutObject`、`DeleteObject`の3つだけを数えていました（指摘が増える方向だけの変更です）。
 * Statements that give access to the protected bucket: the 44 actions that take the S3 `object` resource, on the
 * object set; and the bucket actions that can give others access, copy, or expire every object, on the bucket ARN.
 */
function bucketAccessStatements(role: RoleModel, bucketArn: string): StatementModel[] {
  const bucket = bucketArn.replace(/\/$/, "");
  const objects = [...literalOf(`${bucket}/`), STAR];
  const bucketItself = literalOf(bucket);
  // 名前のないバケットは、抽出器が不透明な名前`_generated_<LogicalId>`で表します（spec proofgate-cdk-construct-support, design 5）。
  // 保護バケットの名前にワイルドカードがあると、実際の生成名がそれに一致しうるため、不透明な名前を`*`として読みます（過剰検出の側）。
  // リテラルの保護バケットには、生成名は一致しません（ARN文字列のまま比べます）。
  // An unnamed bucket is written as the opaque name `_generated_<LogicalId>`. If the protected bucket
  // name has a wildcard, the real generated name may match it, so the opaque name is read as `*`.
  const protectedHasWildcard = /[*?]/.test(bucketArn);
  const pattern = (resource: string) =>
    protectedHasWildcard ? resource.replace(GENERATED_NAME, "*") : resource;
  const reaches = (statement: StatementModel, target: readonly GlobToken[]) =>
    statement.resources.some((resource) => globsIntersect(globOf(pattern(resource)), target));
  return role.statements.filter(
    (statement) =>
      (allowsAction(statement, OBJECT_ACTIONS_AND_STAR) && reaches(statement, objects)) ||
      (allowsAction(statement, BUCKET_GRANT_ACTIONS) && reaches(statement, bucketItself)),
  );
}
/** 抽出器が名前のないリソースに付ける不透明な名前です（`@proofgate-cdk/extractor`の`GENERATED_PREFIX`と同じ形）。 */
const GENERATED_NAME = /_generated_[A-Za-z0-9]+/g;
/**
 * StatementのResourceが、指定した対象ロールを表しているかを判定します。
 * ResourceのパターンとロールのARNの交差で調べます（spec proofgate-lean-evaluator, L0, F1）。1.2.0までは、Resourceに
 * 文字列`:role/`がないと数えなかったため、IAMが許可する`arn:aws:iam::*:role*`、`arn:aws:iam::<アカウント>:*`、`arn:*`
 * などを見逃していました。パーティション、リージョン、アカウントはコロンを含まない文字列です（NSTAR）。
 * Does a Resource of the statement denote the target role? Decided by intersection with the role's ARN (F1). Up to 1.2.0
 * a Resource without the substring `:role/` never counted, so `arn:aws:iam::*:role*`, `arn:aws:iam::<account>:*`, and
 * `arn:*`, which IAM allows, were missed. Partition, region, and account are runs without a colon (NSTAR).
 */
function allowsPassRoleTarget(statement: StatementModel, target: RoleModel): boolean {
  if (!allowsAction(statement, ["iam:PassRole"])) return false;
  // ロールの論理IDや裸の名前も、対象を表すものとして数えます（過剰検出の側。IAMはARNでないResourceを受け付けません）。
  // A logical ID or a bare role name also counts (decided over-approximation; IAM rejects a Resource that is no ARN).
  const directIdentifiers = [target.logicalId, target.roleName].filter((value): value is string =>
    Boolean(value),
  );
  return statement.resources.some(
    (resourcePattern) =>
      directIdentifiers.some((identifier) => matches(resourcePattern, identifier)) ||
      passRoleDenotesRole(resourcePattern, target),
  );
}
/** どのポリシーのリテラルにも含まれない文字です（抽出器が拒否します）。 A character that no policy literal contains. */
const FRESH: StructuredToken = { kind: "lit", char: "\u0000" };
function passRoleDenotesRole(pattern: string, target: RoleModel): boolean {
  const glob = globOf(pattern);
  const prefix = arnPrefixOf(ROLE_SHAPE);
  if (target.roleName !== undefined) {
    return intersectsStructured(glob, [...prefix, ...literalOf(target.roleName)]);
  }
  // 名前のないロール: CloudFormationが付ける名前は合成時に不明です（spec proofgate-cdk-construct-support, R0）。
  // 不透明な名前`_generated_<LogicalId>`（role.roleArnの参照）か、どのリテラルにも含まれない文字を含み、コロンを含まない
  // 未知の名前として読みます。後者には、名前の部分のワイルドカードだけが一致します（過剰検出の側）。
  // A role without RoleName: the opaque name `_generated_<LogicalId>` (a reference such as role.roleArn), or an unknown name
  // that contains a character no literal contains and no colon; only a wildcard in the name part meets the latter.
  return (
    intersectsStructured(glob, [...prefix, ...literalOf(`_generated_${target.logicalId}`)]) ||
    intersectsStructured(glob, [...prefix, NSTAR, FRESH, NSTAR])
  );
}
/**
 * `s3:*`の1要素は、1.1.2までのリストに入っていたものです。アクションのパターンを文字列`s3:*`と比べる読み方のため、
 * `s3:?`のような実在しないパターンも一致していました。指摘が減らないように残します（過剰検出の側）。
 * `s3:*` was in the list of 1.1.2; it is kept so that no finding disappears (over-approximation).
 */
const OBJECT_ACTIONS_AND_STAR: readonly string[] = [...OBJECT_ACTIONS, "s3:*"];

/** 起動アクションの表の項目です（小文字のアクション名と、渡し先のサービス）。 */
const LAUNCH_ENTRIES: readonly (readonly [string, readonly string[]])[] = Object.entries(
  LAUNCH_ACTIONS,
).map(([action, services]) => [action, [...services, ...(LAUNCH_SUPPLEMENTS[action] ?? [])]]);
/** 表の値に現れるサービスプリンシパルです。`*`は含みません。 */
const KNOWN_SERVICES: ReadonlySet<string> = new Set(
  LAUNCH_ENTRIES.flatMap(([, services]) => services).filter((service) => service !== "*"),
);
/** 表の`*`（Service Referenceが渡し先のサービスを書いていない項目）です。どのサービスにも渡せるものとして読みます。 */
const ANY_SERVICE = "*";
const LAMBDA_SERVICE = "lambda.amazonaws.com";
/**
 * リージョン付きのサービスプリンシパル（`states.us-east-1.amazonaws.com`）を、リージョンなしの形にします。
 * Step Functionsは両方の形を文書に書いています（data verification 2026-11-21, follow-up a）。
 * A regional service principal is read as the global one (Step Functions documents both forms).
 */
const REGIONAL_PRINCIPAL = /^([a-z0-9-]+)\.[a-z]{2}(?:-[a-z]+)+-\d+\.amazonaws\.com$/;
function normalizeService(service: string): string {
  const value = lower(service);
  const match = REGIONAL_PRINCIPAL.exec(value);
  return match === null ? value : `${match[1]}.amazonaws.com`;
}
/**
 * ロールが起動できるサービスと、その根拠のStatementです（spec proofgate-brushup, Step 5, design 5.1）。
 * 起動アクションは、AWS Service Referenceから生成した表（`iam:PassRole`を認可に含む操作の、書き込みまたは権限管理の
 * アクション）です。Lambdaも表の1項目です（`lambda:CreateFunction`、`lambda:UpdateFunctionConfiguration`）。
 * The services a role can launch with a passed role, from the generated table, with the statements that allow it.
 * Lambda is one entry of the table, like every other service.
 */
function launchStatementsByService(role: RoleModel): Map<string, StatementModel[]> {
  const byService = new Map<string, StatementModel[]>();
  for (const statement of role.statements) {
    if (statement.effect !== "Allow") continue;
    const services = new Set(statement.actions.flatMap(launchServicesOfPattern));
    for (const service of services) {
      byService.set(service, [...(byService.get(service) ?? []), statement]);
    }
  }
  return byService;
}
const servicesByPattern = new Map<string, readonly string[]>();
/** 1つのActionパターンが起動できるサービスです。パターンごとに覚えておきます（速さのためだけで、結果は変わりません）。 */
function launchServicesOfPattern(pattern: string): readonly string[] {
  const key = lower(pattern);
  let services = servicesByPattern.get(key);
  if (services === undefined) {
    const found = new Set<string>();
    for (const [action, values] of LAUNCH_ENTRIES) {
      if (matches(key, action)) for (const value of values) found.add(value);
    }
    services = [...found];
    servicesByPattern.set(key, services);
  }
  return services;
}
/** ロールが信頼するサービスです（正規化済み）。`*`は別に扱います。 */
const trustedServices = (role: RoleModel): Set<string> =>
  new Set(role.trustServices.filter((service) => service !== "*").map(normalizeService));
interface CandidatePath {
  readonly principal: RoleModel;
  readonly target: RoleModel;
  readonly bucketArn: string;
  readonly service: string;
  readonly passRole: readonly StatementModel[];
  readonly launch: readonly StatementModel[];
  readonly targetTrustsService: boolean;
  readonly bucketAccess: readonly StatementModel[];
}
/**
 * 「起点ロール × 対象ロール × サービス × 保護バケット」の有限な組み合わせを列挙します。
 * サービスは、Lambda（どの組にも1つは候補があるように）、対象ロールが信頼するサービス、
 * 対象ロールが`*`を信頼するときは起点ロールが起動できるサービスのうち最初の1つです。
 * `*`の信頼は、どのサービスにも引き受けられるものとして読みます（過剰検出の側、1.1.2までのLambdaと同じ扱い）。
 * Candidates per principal, target, service, and bucket. The services are Lambda (so every pair has a candidate),
 * the services the target trusts, and, if the target trusts "*", the first service the principal can launch.
 */
function candidatePaths(model: StackModel, config: ProofGateConfig): CandidatePath[] {
  const candidates: CandidatePath[] = [];
  const launchOf = new Map(
    model.roles.map((role) => [role.logicalId, launchStatementsByService(role)]),
  );
  for (const principal of model.roles) {
    const launchBy = launchOf.get(principal.logicalId) ?? new Map<string, StatementModel[]>();
    const anyService = launchBy.get(ANY_SERVICE) ?? [];
    for (const target of model.roles) {
      if (
        principal.logicalId === target.logicalId ||
        config.allowedPassRoleTargets?.includes(target.logicalId)
      )
        continue;
      const passRole = principal.statements.filter((statement) =>
        allowsPassRoleTarget(statement, target),
      );
      const trusted = trustedServices(target);
      const trustsStar = target.trustServices.includes("*");
      const services = new Set([LAMBDA_SERVICE, ...trusted]);
      if (trustsStar) {
        const first = [...launchBy.keys()].filter((service) => service !== ANY_SERVICE).sort()[0];
        if (first !== undefined) services.add(first);
      }
      for (const service of [...services].sort()) {
        const launch = [...(launchBy.get(service) ?? []), ...anyService];
        const targetTrustsService = trustsStar || trusted.has(service);
        for (const bucketArn of config.protectedBucketArns) {
          candidates.push({
            principal,
            target,
            bucketArn,
            service,
            passRole,
            launch: [...new Set(launch)],
            targetTrustsService,
            bucketAccess: bucketAccessStatements(target, bucketArn),
          });
        }
      }
    }
  }
  return candidates;
}
// ---------------------------------------------------------------------------------------------------------------
// iam:PassRoleの要らない経路（spec proofgate-implicit-role-paths, 設計5と6）。
// 主体Pが、すでにロールTで動くリソースRを変更でき、Tが保護バケットに届くとき、経路があります。
// P = Tと、allowedPassRoleTargetsのTは除きます。Resourceが「Rを表しうるか」は、ARNのglobの交差で調べます。
// 名前のないリソースは、不透明な名前`_generated_<LogicalId>`として読みます。名前の部分にワイルドカードのあるパターンは、
// 実際の生成名に一致しうるので数え、リテラルは不透明な名前そのものでなければ数えません。
// ARNでもない裸の名前は数えません（IAMはそのResourceを受け付けません）。
// ---------------------------------------------------------------------------------------------------------------
// ARNのパーティション、リージョン、アカウントは、コロンを含まない任意の文字列です（NSTAR）。
// 一方、IAMのResourceパターンの`*`はコロンも表します。ARN側の`*`を普通の`*`にすると、`function:other-*`のようなパターンが、
// 「関数名が`...:function:...`を含む」ような実在しない文字列を介して、どの関数にも交わってしまいます。
// Partition, region, and account of an ARN are any run of characters without a colon (NSTAR). With an ordinary `*` on the ARN
// side, a pattern such as `function:other-*` would meet every function through strings that are no ARN.
type StructuredToken = GlobToken | { readonly kind: "nstar" };
const NSTAR: StructuredToken = { kind: "nstar" };
const RESOURCE_SHAPES: Readonly<
  Record<ResourceModel["kind"], { service: string; separator: string }>
> = {
  "lambda-function": { service: "lambda", separator: ":function:" },
  "codebuild-project": { service: "codebuild", separator: ":project/" },
  "stepfunctions-state-machine": { service: "states", separator: ":stateMachine:" },
};
/** ARNの形です（サービスと、名前の前の区切り）。 */
interface ArnShape {
  readonly service: string;
  readonly separator: string;
}
/** IAMのロールのARNの形です。`arn:<p>:iam::<account>:role/<name>`（リージョンは空です）。 */
const ROLE_SHAPE: ArnShape = { service: "iam", separator: ":role/" };
/** `arn:<NSTAR>:<service>:<NSTAR>:<NSTAR><separator>`の部分です。 */
const arnPrefixOf = ({ service, separator }: ArnShape): StructuredToken[] => [
  ...literalOf("arn:"),
  NSTAR,
  ...literalOf(`:${service}:`),
  NSTAR,
  ...literalOf(":"),
  NSTAR,
  ...literalOf(separator),
];
/** `*`はどの文字列、NSTARはコロンを含まない文字列を表すglobの交差判定です。 */
function intersectsStructured(
  a: readonly StructuredToken[],
  b: readonly StructuredToken[],
): boolean {
  const memo = new Map<number, boolean>();
  const width = b.length + 1;
  const sequence = (t: StructuredToken | undefined) => t?.kind === "star" || t?.kind === "nstar";
  const compat = (x: StructuredToken, y: StructuredToken): boolean => {
    if (x.kind === "lit" && y.kind === "lit") return x.char === y.char;
    if (x.kind === "lit" && y.kind === "nstar") return x.char !== ":";
    if (x.kind === "nstar" && y.kind === "lit") return y.char !== ":";
    return true;
  };
  const go = (i: number, j: number): boolean => {
    const key = i * width + j;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    memo.set(key, false); // 再入した状態は新しい情報を持ちません。
    const left = a[i];
    const right = b[j];
    let result = left === undefined && right === undefined;
    if (!result && sequence(left)) result = go(i + 1, j);
    if (!result && sequence(right)) result = go(i, j + 1);
    if (!result && left !== undefined && right !== undefined && compat(left, right)) {
      result = go(sequence(left) ? i : i + 1, sequence(right) ? j : j + 1);
    }
    memo.set(key, result);
    return result;
  };
  return go(0, 0);
}
/** 名前の情報です。literalは物理名、unknownは読めない名前、opaqueは名前のないときの不透明な名前です。 */
interface NameInfo {
  readonly literal: string | undefined;
  readonly unknown: boolean;
  readonly opaque: string;
}
/**
 * パターンがARNの集合（形と名前で決まる）に交わるかを調べます。名前のない対象は不透明な名前として読み、
 * 名前の部分にワイルドカードのあるパターンは、実際の生成名に一致しうるので数えます。
 */
function denotesArn(pattern: string, shape: ArnShape, name: NameInfo): boolean {
  if (/^\*+$/.test(pattern)) return true;
  const unnamed = name.literal === undefined && !name.unknown;
  const nameTokens: StructuredToken[] = name.unknown
    ? [NSTAR]
    : literalOf(name.literal ?? name.opaque);
  const prefix = arnPrefixOf(shape);
  if (intersectsStructured(globOf(pattern), [...prefix, ...nameTokens])) return true;
  if (!unnamed) return false;
  const at = lower(pattern).indexOf(lower(shape.separator));
  if (at < 0) return false;
  return (
    /[*?]/.test(pattern.slice(at + shape.separator.length)) &&
    intersectsStructured(globOf(pattern), [...prefix, NSTAR])
  );
}
const resourceDenoted = (pattern: string, resource: ResourceModel): boolean =>
  denotesArn(pattern, RESOURCE_SHAPES[resource.kind], {
    literal: resource.name,
    unknown: resource.nameUnknown === true,
    opaque: `_generated_${resource.logicalId}`,
  });
const roleDenoted = (pattern: string, role: RoleModel): boolean =>
  denotesArn(pattern, ROLE_SHAPE, {
    literal: role.roleName,
    unknown: false,
    opaque: `_generated_${role.logicalId}`,
  });
const implicitActionsOf = (resource: ResourceModel): string[] =>
  IMPLICIT_ACTIONS.filter((entry) => entry.kind === resource.kind).map((entry) => entry.action);
/** 主体がリソースを変更できる根拠のStatementです。 */
function changeStatements(principal: RoleModel, resource: ResourceModel): StatementModel[] {
  const actions = implicitActionsOf(resource);
  return principal.statements.filter(
    (statement) =>
      allowsAction(statement, actions) &&
      statement.resources.some((pattern) => resourceDenoted(pattern, resource)),
  );
}
interface ImplicitCandidate {
  readonly principal: RoleModel;
  readonly resource: ResourceModel;
  readonly target: RoleModel;
  readonly bucketArn: string;
  readonly change: readonly StatementModel[];
  readonly bucketAccess: readonly StatementModel[];
}
function implicitCandidates(model: StackModel, config: ProofGateConfig): ImplicitCandidate[] {
  const candidates: ImplicitCandidate[] = [];
  const roles = new Map(model.roles.map((role) => [role.logicalId, role]));
  for (const resource of model.resources ?? []) {
    const target =
      resource.roleLogicalId === undefined ? undefined : roles.get(resource.roleLogicalId);
    if (target === undefined || config.allowedPassRoleTargets?.includes(target.logicalId)) continue;
    for (const principal of model.roles) {
      if (principal.logicalId === target.logicalId) continue;
      const change = changeStatements(principal, resource);
      for (const bucketArn of config.protectedBucketArns) {
        candidates.push({
          principal,
          resource,
          target,
          bucketArn,
          change,
          bucketAccess: bucketAccessStatements(target, bucketArn),
        });
      }
    }
  }
  return candidates;
}
/** ロールを特定できないリソースを、どの主体が変更できるかを調べ、PG-IAM-003の対象を返します（設計6）。 */
export function unknownRoleFindings(
  model: StackModel,
  _config: ProofGateConfig,
): UnsupportedFinding[] {
  return (model.resources ?? [])
    .filter(
      (resource) =>
        resource.roleUnknown === true &&
        model.roles.some((principal) => changeStatements(principal, resource).length > 0),
    )
    .map((resource) => ({
      sourcePath: resource.sourcePath,
      reason: `${resource.logicalId} runs as a role that ProofGate cannot identify, and a principal can change it`,
    }));
}
// ---------------------------------------------------------------------------------------------------------------
// ロール自身がIAMを書き換える経路（spec proofgate-self-escalation, 設計4）: PG-IAM-005。
// - 自分への付与: Pが、自分のロールのARNを表しうるResourceに、iam:PutRolePolicyかiam:AttachRolePolicyを持つ。付与の後は
//   すべてのバケットに届くので、今バケットに届くかにかかわらず、保護バケットごとに指摘する。
// - 乗っ取り: Pが、ロールTのARNを表しうるResourceにiam:UpdateAssumeRolePolicyを持ち（TはPではない）、Tがバケットに届く。
// - 作成して付与: Pが、iam:CreateRoleと書き込みのアクションを持ち、ロールのARNの形をした2つのResourceが交わる。
// Pが allowedPolicyWriters にあれば3つとも除く。Tが allowedPassRoleTargets にあれば乗っ取りを除く。
// 除外された組も、Leanには行として渡す（notExemptがfalse）。
// ---------------------------------------------------------------------------------------------------------------
type PolicyWriteKind = "self-grant" | "creation-grant" | "take-over";
interface PolicyWriteCandidate {
  readonly kind: PolicyWriteKind;
  readonly principal: RoleModel;
  readonly target: RoleModel;
  readonly bucketArn: string;
  readonly write: readonly StatementModel[];
  readonly bucketAccess: readonly StatementModel[];
  readonly canWrite: boolean;
  readonly reachesAfterWrite: boolean;
  readonly notExempt: boolean;
}
const policyActions = (shape: PolicyWriteShape): string[] =>
  POLICY_WRITE_ACTIONS.filter((entry) => entry.shape === shape).map((entry) => entry.action);
const holdingPolicy = (role: RoleModel, shape: PolicyWriteShape): StatementModel[] =>
  role.statements.filter((statement) => allowsAction(statement, policyActions(shape)));
const isRoleArnPattern = (pattern: string): boolean =>
  intersectsStructured(globOf(pattern), [...arnPrefixOf(ROLE_SHAPE), STAR]);
/** 作成して付与: 作成のStatementと書き込みのStatementで、ロールのARNの形をしたResourceが交わる組を返します。 */
function creationGrantStatements(role: RoleModel): StatementModel[] {
  const creating = holdingPolicy(role, "creating");
  const writing = holdingPolicy(role, "self-grant");
  const involved = new Set<StatementModel>();
  for (const c of creating) {
    for (const w of writing) {
      const crossing = c.resources
        .filter(isRoleArnPattern)
        .some((a) =>
          w.resources.filter(isRoleArnPattern).some((b) => globsIntersect(globOf(a), globOf(b))),
        );
      if (crossing) {
        involved.add(c);
        involved.add(w);
      }
    }
  }
  return [...involved];
}
function policyWriteCandidates(model: StackModel, config: ProofGateConfig): PolicyWriteCandidate[] {
  const candidates: PolicyWriteCandidate[] = [];
  for (const principal of model.roles) {
    const writer = config.allowedPolicyWriters?.includes(principal.logicalId) !== true;
    const selfWrite = holdingPolicy(principal, "self-grant").filter((s) =>
      s.resources.some((r) => roleDenoted(r, principal)),
    );
    const creation = creationGrantStatements(principal);
    for (const bucketArn of config.protectedBucketArns) {
      const base = { principal, bucketArn, reachesAfterWrite: true, notExempt: writer };
      candidates.push({
        ...base,
        kind: "self-grant",
        target: principal,
        write: selfWrite,
        bucketAccess: [],
        canWrite: selfWrite.length > 0,
      });
      candidates.push({
        ...base,
        kind: "creation-grant",
        target: principal,
        write: creation,
        bucketAccess: [],
        canWrite: creation.length > 0,
      });
      for (const target of model.roles) {
        if (target.logicalId === principal.logicalId) continue;
        const takeOver = holdingPolicy(principal, "take-over").filter((s) =>
          s.resources.some((r) => roleDenoted(r, target)),
        );
        const bucketAccess = bucketAccessStatements(target, bucketArn);
        candidates.push({
          ...base,
          kind: "take-over",
          target,
          write: takeOver,
          bucketAccess,
          canWrite: takeOver.length > 0,
          reachesAfterWrite: bucketAccess.length > 0,
          notExempt: writer && config.allowedPassRoleTargets?.includes(target.logicalId) !== true,
        });
      }
    }
  }
  return candidates;
}
/** 根拠のStatementのアクションのうち、表のアクションに一致するパターンです（説明文用）。 */
function policyActionPatterns(statements: readonly StatementModel[]): string[] {
  const all = POLICY_WRITE_ACTIONS.map((entry) => entry.action);
  return [
    ...new Set(
      statements.flatMap((statement) =>
        statement.actions.filter((pattern) =>
          all.some((action) => matches(lower(pattern), action)),
        ),
      ),
    ),
  ];
}
function policyWriteViolations(model: StackModel, config: ProofGateConfig): Violation[] {
  const violations: Violation[] = [];
  const selfGranted = new Set<string>();
  for (const c of policyWriteCandidates(model, config)) {
    if (!(c.canWrite && c.reachesAfterWrite && c.notExempt)) continue;
    const key = `${c.principal.logicalId}|${c.bucketArn}`;
    if (c.kind === "creation-grant" && selfGranted.has(key)) continue;
    if (c.kind === "self-grant") selfGranted.add(key);
    const actions = policyActionPatterns(c.write).join(", ");
    const P = c.principal.logicalId;
    const explanation =
      c.kind === "self-grant"
        ? `${P} can write a policy to its own role (${actions}), so it can give itself access to ${c.bucketArn} and every other bucket.`
        : c.kind === "creation-grant"
          ? `${P} can create a role and attach a policy to it (${actions}), so it can give a new role access to ${c.bucketArn} and every other bucket.`
          : `${P} can rewrite the trust policy of ${c.target.logicalId} (${actions}); ${c.target.logicalId} can access protected bucket ${c.bucketArn}.`;
    violations.push({
      ruleId: RULE_ID_POLICY_WRITE,
      principalLogicalId: P,
      targetRoleLogicalId: c.target.logicalId,
      protectedBucketArn: c.bucketArn,
      sourcePaths: [
        ...new Set([...c.write, ...c.bucketAccess].map((statement) => statement.sourcePath)),
      ],
      explanation,
    });
  }
  return violations;
}
const isEscalation = (c: CandidatePath) =>
  c.passRole.length > 0 &&
  c.launch.length > 0 &&
  c.targetTrustsService &&
  c.bucketAccess.length > 0;
/** 起動の根拠になったアクションのパターンです（説明文用）。 */
function launchActionsOf(statements: readonly StatementModel[], service: string): string[] {
  const out = new Set<string>();
  for (const statement of statements) {
    for (const pattern of statement.actions) {
      if (
        LAUNCH_ENTRIES.some(
          ([action, values]) =>
            (values.includes(service) || values.includes(ANY_SERVICE)) &&
            matches(lower(pattern), action),
        )
      )
        out.add(pattern);
    }
  }
  return [...out];
}
/**
 * 4条件をすべて満たす経路を、説明可能なViolationへ変換するTypeScript参照実装です。
 * 起点・対象・バケットの組ごとに1件です（最初に見つかったサービスで説明します）。
 * One violation per principal, target, and bucket, explained with the first service that gives a path.
 */
export function evaluate(model: StackModel, config: ProofGateConfig): Violation[] {
  const violations: Violation[] = [];
  const seen = new Set<string>();
  for (const candidate of candidatePaths(model, config)) {
    if (!isEscalation(candidate)) continue;
    const { principal, target, bucketArn, service, passRole, launch, bucketAccess } = candidate;
    const key = JSON.stringify([principal.logicalId, target.logicalId, bucketArn]);
    if (seen.has(key)) continue;
    seen.add(key);
    violations.push({
      ruleId: RULE_ID,
      principalLogicalId: principal.logicalId,
      targetRoleLogicalId: target.logicalId,
      protectedBucketArn: bucketArn,
      sourcePaths: [
        ...new Set(
          [...passRole, ...launch, ...bucketAccess].map((statement) => statement.sourcePath),
        ),
      ],
      explanation: `${principal.logicalId} can pass role ${target.logicalId} to ${service} and launch it (${launchActionsOf(launch, service).join(", ")}); ${target.logicalId} trusts ${service} and can access protected bucket ${bucketArn}.`,
    });
  }
  for (const c of implicitCandidates(model, config)) {
    if (c.change.length === 0 || c.bucketAccess.length === 0) continue;
    const actions = new Set(
      c.change.flatMap((statement) =>
        statement.actions.filter((pattern) =>
          allowsAction({ ...statement, actions: [pattern] }, implicitActionsOf(c.resource)),
        ),
      ),
    );
    violations.push({
      ruleId: RULE_ID,
      principalLogicalId: c.principal.logicalId,
      targetRoleLogicalId: c.target.logicalId,
      protectedBucketArn: c.bucketArn,
      resourceLogicalId: c.resource.logicalId,
      sourcePaths: [
        ...new Set(
          [...c.change, ...c.bucketAccess]
            .map((statement) => statement.sourcePath)
            .concat(c.resource.sourcePath),
        ),
      ],
      explanation: `${c.principal.logicalId} can change ${c.resource.logicalId} (${[...actions].join(", ")}), which runs as ${c.target.logicalId}; ${c.target.logicalId} can access protected bucket ${c.bucketArn}.`,
    });
  }
  return [...violations, ...policyWriteViolations(model, config)];
}
/**
 * 渡せて保護バケットに届くロールが、起動アクションの表のどの値にもないサービスを信頼しているときの指摘です（design 5.4）。
 * そのサービスが渡されたロールでコードを動かすかどうかをProofGateは判断できないため、PG-IAM-003にします。
 * A role that can be passed and reaches a protected bucket, and that trusts a service that appears in no value of the
 * launch table: ProofGate cannot tell whether that service runs code with a passed role (PG-IAM-003).
 */
export function unknownTrustFindings(
  model: StackModel,
  config: ProofGateConfig,
): UnsupportedFinding[] {
  const found = new Map<string, UnsupportedFinding>();
  for (const target of model.roles) {
    if (config.allowedPassRoleTargets?.includes(target.logicalId)) continue;
    const unknown = [...trustedServices(target)].filter((service) => !KNOWN_SERVICES.has(service));
    if (unknown.length === 0) continue;
    const passable = model.roles.some(
      (principal) =>
        principal.logicalId !== target.logicalId &&
        principal.statements.some((statement) => allowsPassRoleTarget(statement, target)),
    );
    const reaches = config.protectedBucketArns.some(
      (bucketArn) => bucketAccessStatements(target, bucketArn).length > 0,
    );
    if (!passable || !reaches) continue;
    for (const service of unknown) {
      found.set(`${target.logicalId}|${service}`, {
        sourcePath: `Resources.${target.logicalId}.Properties.AssumeRolePolicyDocument`,
        reason: `Role trusts ${service}, which ProofGate cannot tell runs code with a passed role`,
      });
    }
  }
  return [...found.values()];
}
const leanString = (value: string) => JSON.stringify(value);
/**
 * 候補経路を具体的なLean値として直列化し、安全性定理を決定的に生成します。
 * #evalのマーカーは「定理が偽」と「Lean自体の実行失敗」を呼び出し側が区別するために使います。
 */
export function generateLean(model: StackModel, config: ProofGateConfig): string {
  const paths = candidatePaths(model, config).map(
    ({
      principal,
      target,
      bucketArn,
      service,
      passRole,
      launch,
      targetTrustsService,
      bucketAccess,
    }) =>
      `{ principal := ${leanString(principal.logicalId)}, target := ${leanString(target.logicalId)}, protectedResource := ${leanString(bucketArn)}, service := ${leanString(service)}, canPassRole := ${passRole.length > 0}, canLaunch := ${launch.length > 0}, targetTrustsService := ${targetTrustsService}, targetCanAccess := ${bucketAccess.length > 0} }`,
  );
  const implicit = implicitCandidates(model, config).map(
    ({ principal, resource, target, bucketArn, change, bucketAccess }) =>
      `{ principal := ${leanString(principal.logicalId)}, resource := ${leanString(resource.logicalId)}, target := ${leanString(target.logicalId)}, protectedResource := ${leanString(bucketArn)}, canChange := ${change.length > 0}, runsAsTarget := true, targetCanAccess := ${bucketAccess.length > 0} }`,
  );
  const policyWrite = policyWriteCandidates(model, config).map(
    ({ kind, principal, target, bucketArn, canWrite, reachesAfterWrite, notExempt }) =>
      `{ principal := ${leanString(principal.logicalId)}, target := ${leanString(target.logicalId)}, protectedResource := ${leanString(bucketArn)}, shape := ${leanString(kind)}, canWrite := ${canWrite}, reachesAfterWrite := ${reachesAfterWrite}, notExempt := ${notExempt} }`,
  );
  return `import ProofGate.Security\n\ndef generatedPaths : List ProofGate.EscalationPath := [${paths.join(",\n  ")}]\n\ndef generatedImplicit : List ProofGate.ImplicitPath := [${implicit.join(",\n  ")}]\n\ndef generatedPolicyWrite : List ProofGate.PolicyWritePath := [${policyWrite.join(",\n  ")}]\n\n#eval if ProofGate.safe generatedPaths && ProofGate.safeImplicit generatedImplicit && ProofGate.safePolicyWrite generatedPolicyWrite then "PROOFGATE_SAFE" else "PROOFGATE_UNSAFE"\n\ntheorem generatedStackIsSafe : ProofGate.safe generatedPaths = true := by\n  native_decide\n\ntheorem generatedImplicitIsSafe : ProofGate.safeImplicit generatedImplicit = true := by\n  native_decide\n\ntheorem generatedPolicyWriteIsSafe : ProofGate.safePolicyWrite generatedPolicyWrite = true := by\n  native_decide\n`;
}
