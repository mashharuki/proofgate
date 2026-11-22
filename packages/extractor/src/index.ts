import type {
  ExtractionResult,
  RoleModel,
  StatementModel,
  UnsupportedFinding,
} from "@proofgate-cdk/model";
import { parseManagedPolicies } from "./managed-policies.js";
import { type ResolveContext, resolveResources, resolveValue } from "./resolve.js";
import { parseRoleBearingResources } from "./resources.js";

/**
 * CloudFormation JSONから、ProofGateが扱うIAMの有限モデルを抽出します。
 * 解釈が曖昧な構文を推測で通さず、Unsupportedとして記録することがこの層の責務です。
 */
type JsonObject = Record<string, unknown>;
/** IAMポリシー変数の構文（`${`から`}`まで）です。 */
const POLICY_VARIABLE = /\$\{[^}]*\}/;

// unknownのまま受け取ったJSONを、必要な形へ段階的に絞り込みます。
const object = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): string[] | undefined =>
  typeof value === "string"
    ? [value]
    : Array.isArray(value) && value.every((entry) => typeof entry === "string")
      ? value
      : undefined;

/**
 * 通常のIAM Policy Statementを、文字列だけで構成された決定的なモデルへ変換します。
 */
function parseStatements(
  document: unknown,
  path: string,
  unsupported: UnsupportedFinding[],
  context: ResolveContext,
): StatementModel[] {
  if (!object(document) || !Array.isArray(document.Statement)) {
    unsupported.push({ sourcePath: path, reason: "PolicyDocument.Statement must be an array" });
    return [];
  }

  return document.Statement.flatMap((raw, index) => {
    const sourcePath = `${path}.Statement[${index}]`;
    if (!object(raw)) {
      unsupported.push({ sourcePath, reason: "Statement must be an object" });
      return [];
    }
    // 否定形式やConditionは意味を過小評価する危険があるため、初期版では必ず拒否します。
    for (const key of ["NotAction", "NotResource", "Condition"] as const) {
      if (key in raw)
        unsupported.push({ sourcePath: `${sourcePath}.${key}`, reason: `${key} is not supported` });
    }
    const actions = strings(raw.Action);
    // Resourceは、リテラルに加えて、Fn::Join・Ref・Fn::GetAtt（R1）も読みます。Actionはリテラルのままです。
    const resources = resolveResources(raw.Resource, context);
    if (!actions || !resources) {
      unsupported.push({
        sourcePath,
        reason: "Action and Resource must be literal strings or arrays of strings",
      });
      return [];
    }
    if (raw.Effect !== "Allow" && raw.Effect !== "Deny") {
      unsupported.push({
        sourcePath: `${sourcePath}.Effect`,
        reason: "Effect must be Allow or Deny",
      });
      return [];
    }
    // IAMポリシー変数（`${aws:username}`など）は評価せず、未対応として拒否します。
    // 実行時に展開されるため、リテラル文字列として扱うと権限を過小評価する危険があるためです。
    // CloudFormationのintrinsicで既に未対応になったResourceは、上のfindingだけを維持します。
    // 変数の位置は、テンプレートの要素の添字で報告します（解決した候補の添字ではありません。R1でパーティションが複数の候補になるためです）。
    // The position is the index of the template entry, not of the resolved alternatives (R1 expands partitions).
    const entries: unknown[] = Array.isArray(raw.Resource) ? raw.Resource : [raw.Resource];
    const variableFindings = entries.flatMap((entry, index) =>
      (resolveValue(entry, context) ?? []).some((resource) => POLICY_VARIABLE.test(resource))
        ? [
            {
              sourcePath: `${sourcePath}.Resource${Array.isArray(raw.Resource) ? `[${index}]` : ""}`,
              reason: "IAM policy variables in Resource are not supported",
            },
          ]
        : [],
    );
    if (variableFindings.length > 0) {
      unsupported.push(...variableFindings);
      return [];
    }
    return [{ effect: raw.Effect, actions, resources, sourcePath }];
  });
}

/**
 * Trust Policyから、ロールを引き受けられるAWSサービスだけを抽出します。
 */
function parseTrustServices(
  document: unknown,
  path: string,
  unsupported: UnsupportedFinding[],
): string[] {
  if (!object(document) || !Array.isArray(document.Statement)) {
    unsupported.push({
      sourcePath: path,
      reason: "AssumeRolePolicyDocument.Statement must be an array",
    });
    return [];
  }

  const services: string[] = [];
  document.Statement.forEach((raw, index) => {
    const sourcePath = `${path}.Statement[${index}]`;
    if (!object(raw)) {
      unsupported.push({ sourcePath, reason: "Trust statement must be an object" });
      return;
    }
    for (const key of ["NotAction", "NotPrincipal", "Condition"] as const) {
      // Allowの信頼Statementに付いたオブジェクトのConditionは、無いものとして読みます（R3）。
      // Conditionは引き受けられる主体を狭めるだけなので、無視すると指摘が増える側です。
      // An object Condition on an Allow trust statement is read as absent: it can only narrow who may
      // assume the role, so ignoring it only adds findings. Deny, and a Condition that is not an object, stay unsupported.
      if (key === "Condition" && raw.Effect === "Allow" && object(raw.Condition)) continue;
      if (key in raw)
        unsupported.push({
          sourcePath: `${sourcePath}.${key}`,
          reason: `${key} is not supported in trust policies`,
        });
    }
    const actions = strings(raw.Action);
    if (!actions) {
      unsupported.push({
        sourcePath: `${sourcePath}.Action`,
        reason: "Trust policy Action must contain literal strings",
      });
      return;
    }
    if (raw.Effect !== "Allow" && raw.Effect !== "Deny") {
      unsupported.push({
        sourcePath: `${sourcePath}.Effect`,
        reason: "Trust policy Effect must be Allow or Deny",
      });
      return;
    }
    // Allowされたsts:AssumeRoleだけが、サービスによる引き受け経路を作ります。
    if (
      raw.Effect !== "Allow" ||
      !actions.some((action) => ["*", "sts:*", "sts:assumerole"].includes(action.toLowerCase()))
    )
      return;
    if (raw.Principal === "*") {
      services.push("*");
      return;
    }
    if (!object(raw.Principal)) {
      unsupported.push({
        sourcePath: `${sourcePath}.Principal`,
        reason: "Trust policy Principal must be a literal object or *",
      });
      return;
    }
    for (const [principalType, values] of Object.entries(raw.Principal)) {
      const parsed = strings(values);
      if (!parsed) {
        unsupported.push({
          sourcePath: `${sourcePath}.Principal.${principalType}`,
          reason: "Trust principals must contain literal strings",
        });
      } else if (principalType === "Service") {
        services.push(...parsed.map((service) => service.toLowerCase()));
      }
    }
  });
  return [...new Set(services)].sort();
}

/** テンプレートの先頭レベルまたは入れ子に、マクロや変換が現れるかを調べます。 */
const usesTransform = (template: JsonObject): boolean =>
  "Transform" in template || JSON.stringify(template).includes('"Fn::Transform"');
/**
 * テンプレートに、IAMのプリンシパルが現れないと言い切れるかを判定します。迷うときは言い切りません（Fail Closed）。
 * 言い切らないのは次の場合です。
 * - 型がAWS::IAM::で始まるリソースがある
 * - ネストされたスタック（AWS::CloudFormation::Stack）。ロールは別のテンプレートにあるかもしれません
 * - SAM（AWS::Serverless::）や、TransformとFn::Transform。デプロイ時にテンプレートにないロールが作られます
 * - オブジェクトでない項目や、Typeが文字列でない項目（読めないものを「IAMなし」とは言えません）
 * Whether the template certainly has no IAM principal; when in doubt it does not say so (fail closed).
 */
function hasNoIamResources(template: JsonObject): boolean {
  if (!object(template.Resources) || usesTransform(template)) return false;
  return Object.values(template.Resources).every((resource) => {
    if (!object(resource) || typeof resource.Type !== "string") return false;
    return !(
      resource.Type.startsWith("AWS::IAM::") ||
      resource.Type.startsWith("AWS::Serverless::") ||
      resource.Type === "AWS::CloudFormation::Stack"
    );
  });
}
/**
 * 1つのCloudFormationテンプレートを正規化します。
 * 未対応構文があれば部分的なモデルを返さず、呼び出し側がFail Closedにできるようにします。
 */
export function extractStack(template: unknown): ExtractionResult {
  const unsupported: UnsupportedFinding[] = [];
  if (!object(template) || !object(template.Resources)) {
    return {
      unsupported: [
        { sourcePath: "Resources", reason: "CloudFormation Resources object is required" },
      ],
    };
  }

  const context: ResolveContext = { resources: template.Resources };
  const roles = new Map<string, RoleModel>();
  // 第1段階: AWS::IAM::Role本体とロール内インラインポリシーを収集します。
  for (const [logicalId, rawResource] of Object.entries(template.Resources)) {
    if (object(rawResource) && rawResource.Type === "AWS::IAM::ManagedPolicy") {
      unsupported.push({
        sourcePath: `Resources.${logicalId}`,
        reason: "AWS::IAM::ManagedPolicy is not supported in the first vertical slice",
      });
      continue;
    }
    if (
      object(rawResource) &&
      typeof rawResource.Type === "string" &&
      rawResource.Type.startsWith("AWS::IAM::") &&
      !["AWS::IAM::Role", "AWS::IAM::Policy", "AWS::IAM::InstanceProfile"].includes(
        rawResource.Type,
      )
    ) {
      unsupported.push({
        sourcePath: `Resources.${logicalId}`,
        reason: `${rawResource.Type} is not supported in the first vertical slice`,
      });
      continue;
    }
    if (
      !object(rawResource) ||
      rawResource.Type !== "AWS::IAM::Role" ||
      !object(rawResource.Properties)
    )
      continue;
    const statements: StatementModel[] = [];
    const trustPath = `Resources.${logicalId}.Properties.AssumeRolePolicyDocument`;
    const trustServices = parseTrustServices(
      rawResource.Properties.AssumeRolePolicyDocument,
      trustPath,
      unsupported,
    );
    const policies = rawResource.Properties.Policies;
    if (policies !== undefined) {
      if (!Array.isArray(policies)) {
        unsupported.push({
          sourcePath: `Resources.${logicalId}.Properties.Policies`,
          reason: "Policies must be an array",
        });
      } else {
        policies.forEach((policy, index) => {
          const path = `Resources.${logicalId}.Properties.Policies[${index}].PolicyDocument`;
          if (!object(policy))
            unsupported.push({ sourcePath: path, reason: "Inline policy must be an object" });
          else
            statements.push(...parseStatements(policy.PolicyDocument, path, unsupported, context));
        });
      }
    }
    if (rawResource.Properties.ManagedPolicyArns !== undefined) {
      statements.push(
        ...parseManagedPolicies(
          rawResource.Properties.ManagedPolicyArns,
          `Resources.${logicalId}.Properties.ManagedPolicyArns`,
          unsupported,
        ),
      );
    }
    if (
      rawResource.Properties.RoleName !== undefined &&
      typeof rawResource.Properties.RoleName !== "string"
    ) {
      unsupported.push({
        sourcePath: `Resources.${logicalId}.Properties.RoleName`,
        reason: "RoleName must be a literal string when present",
      });
    }
    if (rawResource.Properties.Path !== undefined && rawResource.Properties.Path !== "/") {
      unsupported.push({
        sourcePath: `Resources.${logicalId}.Properties.Path`,
        reason: "Non-default IAM role paths are not supported in the first vertical slice",
      });
    }
    const roleName =
      typeof rawResource.Properties.RoleName === "string"
        ? rawResource.Properties.RoleName
        : undefined;
    roles.set(logicalId, { logicalId, roleName, trustServices, statements });
  }

  // 第2段階: 独立したAWS::IAM::Policyを、Refで指定されたローカルロールへ結合します。
  for (const [logicalId, rawResource] of Object.entries(template.Resources)) {
    if (
      !object(rawResource) ||
      rawResource.Type !== "AWS::IAM::Policy" ||
      !object(rawResource.Properties)
    )
      continue;
    const path = `Resources.${logicalId}.Properties.PolicyDocument`;
    const statements = parseStatements(
      rawResource.Properties.PolicyDocument,
      path,
      unsupported,
      context,
    );
    const roleRefs = rawResource.Properties.Roles;
    if (!Array.isArray(roleRefs)) {
      unsupported.push({
        sourcePath: `Resources.${logicalId}.Properties.Roles`,
        reason: "Policy Roles must be an array",
      });
      continue;
    }
    for (const [index, roleRef] of roleRefs.entries()) {
      if (!object(roleRef) || typeof roleRef.Ref !== "string" || !roles.has(roleRef.Ref)) {
        unsupported.push({
          sourcePath: `Resources.${logicalId}.Properties.Roles[${index}]`,
          reason: "Only local role Ref targets are supported",
        });
        continue;
      }
      const role = roles.get(roleRef.Ref);
      if (!role) continue;
      roles.set(role.logicalId, { ...role, statements: [...role.statements, ...statements] });
    }
  }

  // 第3段階: AWS::IAM::InstanceProfileを読みます（spec proofgate-brushup, Step 5, design 5.3）。
  // プロファイルは権限を増やさないため、モデルには入れません。Rolesは、テンプレート内のロールへのRefか、リテラルの名前だけを許します。
  // An instance profile adds no permission and does not enter the model. Its Roles must be local role Refs or literal names.
  for (const [logicalId, rawResource] of Object.entries(template.Resources)) {
    if (!object(rawResource) || rawResource.Type !== "AWS::IAM::InstanceProfile") continue;
    const profileRoles = object(rawResource.Properties) ? rawResource.Properties.Roles : undefined;
    const readable =
      Array.isArray(profileRoles) &&
      profileRoles.length > 0 &&
      profileRoles.every(
        (entry) =>
          (typeof entry === "string" && entry.length > 0) ||
          (object(entry) &&
            Object.keys(entry).length === 1 &&
            typeof entry.Ref === "string" &&
            roles.has(entry.Ref)),
      );
    if (!readable) {
      unsupported.push({
        sourcePath: `Resources.${logicalId}.Properties.Roles`,
        reason: "Instance profile Roles must be local role Refs or literal role names",
      });
    }
  }
  // IAMリソースが1つもないテンプレートは、検査するプリンシパルがないため、空のモデルを返します
  // （spec proofgate-brushup, 要件3）。「証明済み」ではなく「このテンプレートにIAMプリンシパルがない」という意味です。
  // A template without any IAM resource returns an empty model: there is no principal to check. It does not mean "proved safe".
  if (unsupported.length === 0 && roles.size === 0 && hasNoIamResources(template)) {
    return { model: { version: "1", roles: [] }, unsupported };
  }
  // 検査対象が空のときに定理が自明に成立する「空虚な証明」を防ぎます。
  if (roles.size === 0)
    unsupported.push({
      sourcePath: "Resources",
      reason: "No IAM roles were found; refusing a vacuous proof",
    });
  if ([...roles.values()].every((role) => role.statements.length === 0)) {
    unsupported.push({
      sourcePath: "Resources",
      reason: "No supported IAM policy statements were found; refusing a vacuous proof",
    });
  }
  if (unsupported.length > 0) return { unsupported };
  // ロールで動くリソース（spec proofgate-implicit-role-paths）。ないときは`resources`を付けません（既存のモデルを変えないためです）。
  const resources = parseRoleBearingResources(template.Resources, roles, context);
  return {
    model: {
      version: "1",
      roles: [...roles.values()].sort((a, b) => a.logicalId.localeCompare(b.logicalId)),
      ...(resources.length > 0 ? { resources } : {}),
    },
    unsupported,
  };
}
