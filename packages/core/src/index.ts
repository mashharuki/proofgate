import type {
  ProofGateConfig,
  RoleModel,
  StackModel,
  StatementModel,
  Violation,
} from "@proofgate-cdk/model";
import { RULE_ID } from "@proofgate-cdk/model";

/**
 * 正規化済みIAMモデルから権限昇格の候補経路を組み立て、
 * TypeScript参照実装での判定と、同じ事実を検査するLeanコード生成を提供します。
 */
const lower = (value: string) => value.toLowerCase();

// IAMのAction・Resourceで使用される`*`（任意長）と`?`（任意の1文字）を、文字列全体に対するglobとして扱います。
const matches = (pattern: string, value: string): boolean => {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^${escaped}$`, "i").test(value);
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
 * 保護バケットのオブジェクト（`<バケット>/`で始まる任意のキー）に届くStatementを返します。
 * バケットレベルのARNだけではオブジェクト操作に届かず、`bucket/reports/*`のような一部のプレフィックスは届きます。
 */
function bucketAccessStatements(role: RoleModel, bucketArn: string): StatementModel[] {
  const objects = [...literalOf(`${bucketArn.replace(/\/$/, "")}/`), STAR];
  // 名前のないバケットは、抽出器が不透明な名前`_generated_<LogicalId>`で表します（spec proofgate-cdk-construct-support, design 5）。
  // 保護バケットの名前にワイルドカードがあると、実際の生成名がそれに一致しうるため、不透明な名前を`*`として読みます（過剰検出の側）。
  // リテラルの保護バケットには、生成名は一致しません（ARN文字列のまま比べます）。
  // An unnamed bucket is written as the opaque name `_generated_<LogicalId>`. If the protected bucket
  // name has a wildcard, the real generated name may match it, so the opaque name is read as `*`.
  const protectedHasWildcard = /[*?]/.test(bucketArn);
  const pattern = (resource: string) =>
    protectedHasWildcard ? resource.replace(GENERATED_NAME, "*") : resource;
  return role.statements.filter(
    (statement) =>
      allowsAction(statement, S3_DATA_ACTIONS) &&
      statement.resources.some((resource) => globsIntersect(globOf(pattern(resource)), objects)),
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

const S3_DATA_ACTIONS = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:*"] as const;

/**
 * 任意コードを対象ロールで実行できるLambda操作の根拠を返します。
 * 新規作成は単独で成立します。既存関数の悪用には、ロール設定とコードの両方の更新を要求します。
 */
function lambdaControlStatements(role: RoleModel): StatementModel[] {
  const create = role.statements.filter((statement) =>
    allowsAction(statement, ["lambda:CreateFunction"]),
  );
  if (create.length > 0) return create;
  const configure = role.statements.filter((statement) =>
    allowsAction(statement, ["lambda:UpdateFunctionConfiguration"]),
  );
  const code = role.statements.filter((statement) =>
    allowsAction(statement, ["lambda:UpdateFunctionCode"]),
  );
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

/** すべての「起点ロール × 対象ロール × 保護バケット」の有限な組み合わせを列挙します。 */
function candidatePaths(model: StackModel, config: ProofGateConfig): CandidatePath[] {
  const candidates: CandidatePath[] = [];
  for (const principal of model.roles) {
    for (const target of model.roles) {
      if (
        principal.logicalId === target.logicalId ||
        config.allowedPassRoleTargets?.includes(target.logicalId)
      )
        continue;
      const passRole = principal.statements.filter((statement) =>
        allowsPassRoleTarget(statement, target),
      );
      const lambdaControl = lambdaControlStatements(principal);
      const targetIsLambdaAssumable = target.trustServices.some(
        (service) => service === "*" || service === "lambda.amazonaws.com",
      );
      for (const bucketArn of config.protectedBucketArns) {
        candidates.push({
          principal,
          target,
          bucketArn,
          passRole,
          lambdaControl,
          targetIsLambdaAssumable,
          bucketAccess: bucketAccessStatements(target, bucketArn),
        });
      }
    }
  }
  return candidates;
}

/** 4条件をすべて満たす経路を、説明可能なViolationへ変換するTypeScript参照実装です。 */
export function evaluate(model: StackModel, config: ProofGateConfig): Violation[] {
  const violations: Violation[] = [];
  for (const {
    principal,
    target,
    bucketArn,
    passRole,
    lambdaControl,
    targetIsLambdaAssumable,
    bucketAccess,
  } of candidatePaths(model, config)) {
    if (
      passRole.length === 0 ||
      lambdaControl.length === 0 ||
      !targetIsLambdaAssumable ||
      bucketAccess.length === 0
    )
      continue;
    violations.push({
      ruleId: RULE_ID,
      principalLogicalId: principal.logicalId,
      targetRoleLogicalId: target.logicalId,
      protectedBucketArn: bucketArn,
      sourcePaths: [
        ...new Set(
          [...passRole, ...lambdaControl, ...bucketAccess].map((statement) => statement.sourcePath),
        ),
      ],
      explanation: `${principal.logicalId} can pass Lambda-assumable role ${target.logicalId} and control Lambda code or configuration; ${target.logicalId} can access protected bucket ${bucketArn}.`,
    });
  }
  return violations;
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
      passRole,
      lambdaControl,
      targetIsLambdaAssumable,
      bucketAccess,
    }) =>
      `{ principal := ${leanString(principal.logicalId)}, target := ${leanString(target.logicalId)}, protectedResource := ${leanString(bucketArn)}, canPassRole := ${passRole.length > 0}, canControlLambda := ${lambdaControl.length > 0}, targetIsLambdaAssumable := ${targetIsLambdaAssumable}, targetCanAccess := ${bucketAccess.length > 0} }`,
  );
  return `import ProofGate.Security\n\ndef generatedPaths : List ProofGate.EscalationPath := [${paths.join(",\n  ")}]\n\n#eval if ProofGate.safe generatedPaths then "PROOFGATE_SAFE" else "PROOFGATE_UNSAFE"\n\ntheorem generatedStackIsSafe : ProofGate.safe generatedPaths = true := by\n  native_decide\n`;
}
