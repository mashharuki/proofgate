import type {
  ProofGateConfig,
  RoleModel,
  StackModel,
  StatementModel,
  UnsupportedFinding,
  Violation,
} from "@proofgate-cdk/model";
import { RULE_ID } from "@proofgate-cdk/model";
import { BUCKET_GRANT_ACTIONS, LAUNCH_ACTIONS, OBJECT_ACTIONS } from "./aws-tables.generated.js";

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
 */
function allowsPassRoleTarget(statement: StatementModel, target: RoleModel): boolean {
  if (!allowsAction(statement, ["iam:PassRole"])) return false;
  const directIdentifiers = [target.logicalId, target.roleName].filter((value): value is string =>
    Boolean(value),
  );
  return statement.resources.some((resourcePattern) => {
    if (directIdentifiers.some((identifier) => matches(resourcePattern, identifier))) return true;
    const roleMarker = ":role/";
    const markerIndex = resourcePattern.indexOf(roleMarker);
    if (markerIndex < 0) return false;
    const scope = resourcePattern.slice(0, markerIndex + roleMarker.length);
    if (!target.roleName) {
      // 名前のないロール: CloudFormationが付ける名前は合成時に不明なため、不透明な名前
      // `_generated_<LogicalId>`として読みます（spec proofgate-cdk-construct-support, R0）。
      // ロール名部分にワイルドカードがあるPatternは、実際の生成名に一致しうるので対象にします
      // （過剰検出の側です）。リテラルは、不透明な名前そのもの（role.roleArnなど）のときだけ一致します。
      // A role without RoleName: its real name is unknown at synthesis, so it is read as the opaque
      // name `_generated_<LogicalId>`. A pattern with a wildcard in the role-name part may match the
      // real generated name and counts (over-approximation); a literal counts only if it is the opaque name.
      if (/[*?]/.test(resourcePattern.slice(scope.length))) return true;
      return matches(resourcePattern, `${scope}_generated_${target.logicalId}`);
    }
    // partitionやアカウント部分はPolicy側の値を保ち、ロール名部分だけを検査対象へ置き換えます。
    return matches(resourcePattern, `${scope}${target.roleName}`);
  });
}

/**
 * `s3:*`の1要素は、1.1.2までのリストに入っていたものです。アクションのパターンを文字列`s3:*`と比べる読み方のため、
 * `s3:?`のような実在しないパターンも一致していました。指摘が減らないように残します（過剰検出の側）。
 * `s3:*` was in the list of 1.1.2; it is kept so that no finding disappears (over-approximation).
 */
const OBJECT_ACTIONS_AND_STAR: readonly string[] = [...OBJECT_ACTIONS, "s3:*"];

/** 起動アクションの表の項目です（小文字のアクション名と、渡し先のサービス）。 */
const LAUNCH_ENTRIES: readonly (readonly [string, readonly string[]])[] =
  Object.entries(LAUNCH_ACTIONS);
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
  return violations;
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
  return `import ProofGate.Security\n\ndef generatedPaths : List ProofGate.EscalationPath := [${paths.join(",\n  ")}]\n\n#eval if ProofGate.safe generatedPaths then "PROOFGATE_SAFE" else "PROOFGATE_UNSAFE"\n\ntheorem generatedStackIsSafe : ProofGate.safe generatedPaths = true := by\n  native_decide\n`;
}
