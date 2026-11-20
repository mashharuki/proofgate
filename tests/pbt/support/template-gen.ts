/**
 * Extractor-level生成テストの、CloudFormation断片ジェネレータです（design 4.7）。
 *
 * 断片は「レシピ」から作ります。対応する断片では、レシピから独立に期待モデルを計算します。
 * 未対応の断片では、対応するレシピへ「毒」を1つだけ混ぜ、期待するsourcePathを記録します。
 * このファイルは@proofgate-cdk/extractorの型とモデル型だけに依存し、Leanも本番の評価器も使いません。
 */
import type { ExtractionResult, StackModel, StatementModel } from "@proofgate-cdk/model";
import { createRng, type Rng } from "./prng.js";

interface StatementRecipe {
  readonly effect: "Allow" | "Deny";
  readonly actions: readonly string[];
  readonly resources: readonly string[];
  /** 要素が1つのとき、配列ではなく文字列として出力します。 */
  readonly actionAsString: boolean;
  readonly resourceAsString: boolean;
}

interface TrustRecipe {
  /** 書かれたままのService名（大文字小文字は混在します）。 */
  readonly services: readonly string[];
  /** `Principal: "*"`のAllow Statementを追加するか。 */
  readonly star: boolean;
  /** Service以外（AWS）のPrincipalを持つAllow Statementを追加するか。無視されるはずです。 */
  readonly awsPrincipal: boolean;
  /** Deny Statementに書くService名。無視されるはずです。 */
  readonly deniedServices: readonly string[];
  /** trueなら、最初のAllow Statementへオブジェクトの`Condition`を付けます。無視されるはずです（R3）。 */
  readonly condition?: boolean;
}

interface RoleRecipe {
  readonly logicalId: string;
  readonly roleName: string | undefined;
  readonly trust: TrustRecipe;
  readonly policies: readonly (readonly StatementRecipe[])[];
  /** AWSLambdaBasicExecutionRoleを、リテラルのARNまたはCDKのFn::Joinで付けるか（R2）。 */
  readonly managed?: "string" | "join";
  /** R1で読めるResourceを持つ、追加のインラインポリシー（最後のポリシーとして出力します）。 */
  readonly resolvable?: ResolvableForm;
}
/** R1の形の名前です。期待値は、下の`RESOLVABLE`で独立に書きます。 */
type ResolvableForm =
  | "join-literals"
  | "join-separator"
  | "join-region"
  | "getatt-bucket-unnamed"
  | "getatt-bucket-named"
  | "ref-bucket-named"
  | "getatt-role"
  | "getatt-other";

interface AttachedRecipe {
  readonly logicalId: string;
  readonly roles: readonly string[];
  readonly statements: readonly StatementRecipe[];
}

interface TemplateRecipe {
  readonly roles: readonly RoleRecipe[];
  readonly attached: readonly AttachedRecipe[];
  /** IAM以外のリソース数。Extractorは無視するはずです。 */
  readonly noise: number;
  /** trueなら、AWS::IAM::Policyを先に並べます（Extractorは並び順に依存しないはずです）。 */
  readonly attachedFirst: boolean;
}

type PoisonId =
  | "CONDITION"
  | "NOT_ACTION"
  | "NOT_RESOURCE"
  | "NON_LITERAL_ACTION"
  | "NON_LITERAL_RESOURCE"
  | "POLICY_VARIABLE_STRING"
  | "POLICY_VARIABLE_ARRAY"
  | "INTRINSIC_WITH_VARIABLE"
  | "BAD_EFFECT"
  | "STATEMENT_NOT_OBJECT"
  | "MALFORMED_POLICY_DOCUMENT"
  | "INLINE_POLICY_NOT_OBJECT"
  | "POLICIES_NOT_ARRAY"
  | "MANAGED_POLICY_ARNS"
  | "NON_LITERAL_ROLE_NAME"
  | "NON_DEFAULT_PATH"
  | "TRUST_NOT_PRINCIPAL"
  | "TRUST_CONDITION"
  | "TRUST_CONDITION_ON_DENY"
  | "MANAGED_POLICY_MIXED"
  | "MANAGED_POLICY_LOOKALIKE"
  | "TRUST_NON_LITERAL"
  | "RESOURCE_SUB"
  | "RESOURCE_IMPORT_VALUE"
  | "RESOURCE_UNKNOWN_ATTRIBUTE"
  | "RESOURCE_NO_VALUE"
  | "RESOURCE_MISSING_TARGET"
  | "MANAGED_POLICY_RESOURCE"
  | "OTHER_IAM_TYPE"
  | "MISSING_RESOURCES"
  | "ATTACH_ROLES_NOT_ARRAY"
  | "ATTACH_NON_LOCAL_REF";

type EmptyKind = "no-iam" | "roles-without-statements" | "attached-to-missing-role";

/** 毒を入れる位置です。レシピ上の添字で指定します。 */
interface PoisonTarget {
  readonly id: PoisonId;
  readonly roleIndex: number;
  readonly policyIndex: number;
  readonly statementIndex: number;
  readonly attachedIndex: number;
}

export interface TemplateSpec {
  readonly id: number;
  readonly kind: "supported" | "poisoned" | "empty";
  readonly recipe: TemplateRecipe;
  readonly poison?: PoisonTarget;
  readonly empty?: EmptyKind;
  /** 網羅カウンタ用の形式名です。 */
  readonly shapes: readonly string[];
}

type Json = Record<string, unknown>;

// ---------------------------------------------------------------------------------------------
// 描画
// ---------------------------------------------------------------------------------------------

const renderStatement = (s: StatementRecipe): Json => ({
  Effect: s.effect,
  Action: s.actionAsString && s.actions.length === 1 ? s.actions[0] : [...s.actions],
  Resource: s.resourceAsString && s.resources.length === 1 ? s.resources[0] : [...s.resources],
});

const BASIC_NAME = "service-role/AWSLambdaBasicExecutionRole";
const BASIC_ARN = `arn:aws:iam::aws:policy/${BASIC_NAME}`;
/** R1の形の、テンプレートの値と、期待する解決結果です（docs/SUPPORTED_IAM.mdとdesign 4.1から書きます）。 */
const PARTITIONS = ["aws", "aws-cn", "aws-us-gov"];
const RESOLVABLE: Record<ResolvableForm, { readonly value: unknown; readonly expected: string[] }> =
  {
    "join-literals": {
      value: { "Fn::Join": ["", ["arn:aws:s3:::other-bucket", "/*"]] },
      expected: ["arn:aws:s3:::other-bucket/*"],
    },
    "join-separator": {
      value: { "Fn::Join": [":", ["arn", "aws", "s3", "", "", "other-bucket/k"]] },
      expected: ["arn:aws:s3:::other-bucket/k"],
    },
    "join-region": {
      value: {
        "Fn::Join": [
          "",
          ["arn:aws:logs:", { Ref: "AWS::Region" }, ":", { Ref: "AWS::AccountId" }, ":*"],
        ],
      },
      expected: ["arn:aws:logs:*:*:*"],
    },
    "getatt-bucket-unnamed": {
      value: { "Fn::Join": ["", [{ "Fn::GetAtt": ["GenBucket", "Arn"] }, "/*"]] },
      expected: PARTITIONS.map((p) => `arn:${p}:s3:::_generated_GenBucket/*`),
    },
    "getatt-bucket-named": {
      value: { "Fn::GetAtt": ["NamedBucket", "Arn"] },
      expected: PARTITIONS.map((p) => `arn:${p}:s3:::named-bucket`),
    },
    "ref-bucket-named": {
      value: { "Fn::Join": ["", ["arn:aws:s3:::", { Ref: "NamedBucket" }, "/*"]] },
      expected: ["arn:aws:s3:::named-bucket/*"],
    },
    "getatt-role": {
      value: { "Fn::GetAtt": ["Role0", "Arn"] },
      expected: [],
    },
    "getatt-other": { value: { "Fn::GetAtt": ["GenQueue", "Arn"] }, expected: ["*"] },
  };
/** `getatt-role`の期待値は、参照先のロールの名前に依存するため、ここで計算します。 */
function expectedResolvable(form: ResolvableForm, recipe: TemplateRecipe): string[] {
  if (form !== "getatt-role") return RESOLVABLE[form].expected;
  const name = recipe.roles[0]?.roleName ?? "_generated_Role0";
  return PARTITIONS.map((p) => `arn:${p}:iam::*:role/${name}`);
}
const RESOLVABLE_FORMS = Object.keys(RESOLVABLE) as ResolvableForm[];
const serviceValue = (services: readonly string[]) =>
  services.length === 1 ? services[0] : [...services];

function renderTrust(trust: TrustRecipe): Json {
  const statements: Json[] = [
    {
      Effect: "Allow",
      Principal: { Service: serviceValue(trust.services) },
      Action: "sts:AssumeRole",
    },
  ];
  if (trust.condition) {
    (statements[0] as Json).Condition = {
      ArnLike: { "aws:SourceArn": "arn:aws:lambda:*:*:function:*" },
    };
  }
  if (trust.star) statements.push({ Effect: "Allow", Principal: "*", Action: "sts:*" });
  if (trust.awsPrincipal) {
    statements.push({
      Effect: "Allow",
      Principal: { AWS: "arn:aws:iam::123456789012:root" },
      Action: "sts:AssumeRole",
    });
  }
  if (trust.deniedServices.length > 0) {
    statements.push({
      Effect: "Deny",
      Principal: { Service: serviceValue(trust.deniedServices) },
      Action: "sts:AssumeRole",
    });
  }
  return { Version: "2012-10-17", Statement: statements };
}

/** レシピをCloudFormationテンプレートへ変換します。 */
function render(recipe: TemplateRecipe): Json {
  const roles: [string, unknown][] = recipe.roles.map((role) => {
    const properties: Json = { AssumeRolePolicyDocument: renderTrust(role.trust) };
    if (role.roleName !== undefined) properties.RoleName = role.roleName;
    if (role.managed === "string") properties.ManagedPolicyArns = [BASIC_ARN];
    if (role.managed === "join") {
      properties.ManagedPolicyArns = [
        { "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, `:iam::aws:policy/${BASIC_NAME}`]] },
      ];
    }
    if (role.policies.length > 0) {
      properties.Policies = role.policies.map((statements, index) => ({
        PolicyName: `inline-${index}`,
        PolicyDocument: { Version: "2012-10-17", Statement: statements.map(renderStatement) },
      }));
    }
    if (role.resolvable !== undefined) {
      properties.Policies = [
        ...((properties.Policies as Json[] | undefined) ?? []),
        {
          PolicyName: "resolvable",
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: "s3:GetObject",
                Resource: RESOLVABLE[role.resolvable].value,
              },
            ],
          },
        },
      ];
    }
    return [role.logicalId, { Type: "AWS::IAM::Role", Properties: properties }];
  });
  const attached: [string, unknown][] = recipe.attached.map((policy) => [
    policy.logicalId,
    {
      Type: "AWS::IAM::Policy",
      Properties: {
        PolicyName: policy.logicalId,
        Roles: policy.roles.map((Ref) => ({ Ref })),
        PolicyDocument: {
          Version: "2012-10-17",
          Statement: policy.statements.map(renderStatement),
        },
      },
    },
  ]);
  const noise: [string, unknown][] = Array.from({ length: recipe.noise }, (_, i) => [
    `Noise${i}`,
    { Type: i % 2 === 0 ? "AWS::S3::Bucket" : "AWS::Lambda::Function", Properties: { Tag: "x" } },
  ]);
  // R1の参照先です。IAMではないので、Extractorはモデルに入れません。
  if (recipe.roles.some((r) => r.resolvable !== undefined)) {
    noise.push(
      ["GenBucket", { Type: "AWS::S3::Bucket", Properties: {} }],
      ["NamedBucket", { Type: "AWS::S3::Bucket", Properties: { BucketName: "named-bucket" } }],
      ["GenQueue", { Type: "AWS::SQS::Queue", Properties: {} }],
    );
  }
  const ordered = recipe.attachedFirst
    ? [...attached, ...noise, ...roles]
    : [...roles, ...noise, ...attached];
  return { Resources: Object.fromEntries(ordered) };
}

// ---------------------------------------------------------------------------------------------
// 期待モデル（Extractorのコードではなく、docs/SUPPORTED_IAM.mdの記述から独立に計算します）
// ---------------------------------------------------------------------------------------------

const expectedStatement = (s: StatementRecipe, sourcePath: string): StatementModel => ({
  effect: s.effect,
  actions: [...s.actions],
  resources: [...s.resources],
  sourcePath,
});

/** 対応するレシピから、Extractorが返すべきモデルを計算します。 */
function expectedModel(recipe: TemplateRecipe): StackModel {
  const roles = recipe.roles.map((role) => {
    const inline = role.policies.flatMap((statements, p) =>
      statements.map((s, i) =>
        expectedStatement(
          s,
          `Resources.${role.logicalId}.Properties.Policies[${p}].PolicyDocument.Statement[${i}]`,
        ),
      ),
    );
    const attached = recipe.attached
      .filter((a) => a.roles.includes(role.logicalId))
      .flatMap((a) =>
        a.statements.map((s, i) =>
          expectedStatement(
            s,
            `Resources.${a.logicalId}.Properties.PolicyDocument.Statement[${i}]`,
          ),
        ),
      );
    // AWSLambdaBasicExecutionRole (AWS documentation, v1): Allow logs:CreateLogGroup, CreateLogStream, PutLogEvents on "*".
    const managed: StatementModel[] =
      role.managed === undefined
        ? []
        : [
            {
              effect: "Allow",
              actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
              resources: ["*"],
              sourcePath: `Resources.${role.logicalId}.Properties.ManagedPolicyArns[0]`,
            },
          ];
    const resolvable: StatementModel[] =
      role.resolvable === undefined
        ? []
        : [
            {
              effect: "Allow",
              actions: ["s3:GetObject"],
              resources: expectedResolvable(role.resolvable, recipe),
              sourcePath: `Resources.${role.logicalId}.Properties.Policies[${role.policies.length}].PolicyDocument.Statement[0]`,
            },
          ];
    const services = new Set(role.trust.services.map((s) => s.toLowerCase()));
    if (role.trust.star) services.add("*");
    return {
      logicalId: role.logicalId,
      roleName: role.roleName,
      trustServices: [...services].sort(),
      statements: [...inline, ...resolvable, ...managed, ...attached],
    };
  });
  roles.sort((a, b) => (a.logicalId < b.logicalId ? -1 : 1));
  return { version: "1", roles };
}

// ---------------------------------------------------------------------------------------------
// 毒のカタログ
// ---------------------------------------------------------------------------------------------

/** 毒を入れた後の期待です。 */
interface PoisonExpectation {
  /** この位置（またはその配下）にunsupported findingが必要です。 */
  readonly path: string;
  /** "required": ポリシー変数のfindingが必要、"forbidden": 付いてはならない。 */
  readonly variable: "required" | "forbidden";
}

type Applier = (template: Json, recipe: TemplateRecipe, t: PoisonTarget) => PoisonExpectation;

const resourcesOf = (template: Json) => template.Resources as Record<string, Json>;
const propertiesOf = (template: Json, id: string) => resourcesOf(template)[id]?.Properties as Json;
// R1 reads Ref AWS::AccountId as `*`, so the poison uses a Ref to a parameter, which stays unsupported.
// R1はRef AWS::AccountIdを読むため、毒には読めないパラメータへのRefを使います。
const FN_JOIN = { "Fn::Join": ["", ["arn:aws:s3:::b/", { Ref: "BucketParameter" }]] };
const variableOf = (text: string) => `${text}\${aws:username}`;

function inlineStatement(template: Json, recipe: TemplateRecipe, t: PoisonTarget) {
  const role = recipe.roles[t.roleIndex] as RoleRecipe;
  const policies = propertiesOf(template, role.logicalId).Policies as Json[];
  const document = (policies[t.policyIndex] as Json).PolicyDocument as Json;
  const statements = document.Statement as Json[];
  const base = `Resources.${role.logicalId}.Properties.Policies[${t.policyIndex}].PolicyDocument`;
  return {
    role,
    policies,
    statements,
    statement: statements[t.statementIndex] as Json,
    base,
    path: `${base}.Statement[${t.statementIndex}]`,
  };
}

const forbid = (path: string): PoisonExpectation => ({ path, variable: "forbidden" });

const APPLIERS: Record<PoisonId, Applier> = {
  CONDITION: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    s.statement.Condition = { StringEquals: { "aws:username": "x" } };
    return forbid(`${s.path}.Condition`);
  },
  NOT_ACTION: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    s.statement.NotAction = ["s3:*"];
    return forbid(`${s.path}.NotAction`);
  },
  NOT_RESOURCE: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    s.statement.NotResource = ["*"];
    return forbid(`${s.path}.NotResource`);
  },
  NON_LITERAL_ACTION: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    s.statement.Action = { "Fn::Join": ["", ["s3:", "GetObject"]] };
    return forbid(s.path);
  },
  NON_LITERAL_RESOURCE: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    s.statement.Resource = FN_JOIN;
    return forbid(s.path);
  },
  POLICY_VARIABLE_STRING: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    s.statement.Resource = variableOf("arn:aws:s3:::protected-bucket/");
    return { path: `${s.path}.Resource`, variable: "required" };
  },
  POLICY_VARIABLE_ARRAY: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    const existing = [s.statement.Resource].flat() as string[];
    s.statement.Resource = [...existing, variableOf("arn:aws:s3:::protected-bucket/")];
    return { path: `${s.path}.Resource[${existing.length}]`, variable: "required" };
  },
  INTRINSIC_WITH_VARIABLE: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    s.statement.Resource = { "Fn::Sub": variableOf("arn:aws:s3:::protected-bucket/") };
    return forbid(s.path);
  },
  BAD_EFFECT: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    s.statement.Effect = "Maybe";
    return forbid(`${s.path}.Effect`);
  },
  STATEMENT_NOT_OBJECT: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    s.statements[t.statementIndex] = "not-an-object" as unknown as Json;
    return forbid(s.path);
  },
  MALFORMED_POLICY_DOCUMENT: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    (s.policies[t.policyIndex] as Json).PolicyDocument = { Statement: { Effect: "Allow" } };
    return forbid(s.base);
  },
  INLINE_POLICY_NOT_OBJECT: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    s.policies[t.policyIndex] = "not-an-object" as unknown as Json;
    return forbid(s.base);
  },
  POLICIES_NOT_ARRAY: (template, recipe, t) => {
    const role = recipe.roles[t.roleIndex] as RoleRecipe;
    propertiesOf(template, role.logicalId).Policies = { PolicyName: "x" };
    return forbid(`Resources.${role.logicalId}.Properties.Policies`);
  },
  MANAGED_POLICY_ARNS: (template, recipe, t) => {
    const role = recipe.roles[t.roleIndex] as RoleRecipe;
    propertiesOf(template, role.logicalId).ManagedPolicyArns = [
      "arn:aws:iam::aws:policy/ReadOnlyAccess",
    ];
    return forbid(`Resources.${role.logicalId}.Properties.ManagedPolicyArns`);
  },
  NON_LITERAL_ROLE_NAME: (template, recipe, t) => {
    const role = recipe.roles[t.roleIndex] as RoleRecipe;
    propertiesOf(template, role.logicalId).RoleName = { "Fn::Join": ["-", ["a", "b"]] };
    return forbid(`Resources.${role.logicalId}.Properties.RoleName`);
  },
  NON_DEFAULT_PATH: (template, recipe, t) => {
    const role = recipe.roles[t.roleIndex] as RoleRecipe;
    propertiesOf(template, role.logicalId).Path = "/service/";
    return forbid(`Resources.${role.logicalId}.Properties.Path`);
  },
  TRUST_NOT_PRINCIPAL: (template, recipe, t) => {
    const role = recipe.roles[t.roleIndex] as RoleRecipe;
    const document = propertiesOf(template, role.logicalId).AssumeRolePolicyDocument as Json;
    (document.Statement as Json[])[0] = {
      ...((document.Statement as Json[])[0] as Json),
      NotPrincipal: { AWS: "arn:aws:iam::123456789012:root" },
    };
    return forbid(
      `Resources.${role.logicalId}.Properties.AssumeRolePolicyDocument.Statement[0].NotPrincipal`,
    );
  },
  TRUST_CONDITION: (template, recipe, t) => {
    const role = recipe.roles[t.roleIndex] as RoleRecipe;
    const document = propertiesOf(template, role.logicalId).AssumeRolePolicyDocument as Json;
    (document.Statement as Json[])[0] = {
      ...((document.Statement as Json[])[0] as Json),
      // R3: an object Condition on an Allow statement is read as absent, so the poison is a Condition that is not an object.
      Condition: "not-an-object",
    };
    return forbid(
      `Resources.${role.logicalId}.Properties.AssumeRolePolicyDocument.Statement[0].Condition`,
    );
  },
  TRUST_CONDITION_ON_DENY: (template, recipe, t) => {
    const role = recipe.roles[t.roleIndex] as RoleRecipe;
    const document = propertiesOf(template, role.logicalId).AssumeRolePolicyDocument as Json;
    (document.Statement as Json[])[0] = {
      ...((document.Statement as Json[])[0] as Json),
      Effect: "Deny",
      Condition: { StringEquals: { "sts:ExternalId": "x" } },
    };
    return forbid(
      `Resources.${role.logicalId}.Properties.AssumeRolePolicyDocument.Statement[0].Condition`,
    );
  },
  MANAGED_POLICY_MIXED: (template, recipe, t) => {
    const role = recipe.roles[t.roleIndex] as RoleRecipe;
    propertiesOf(template, role.logicalId).ManagedPolicyArns = [
      BASIC_ARN,
      "arn:aws:iam::aws:policy/AdministratorAccess",
    ];
    return forbid(`Resources.${role.logicalId}.Properties.ManagedPolicyArns`);
  },
  MANAGED_POLICY_LOOKALIKE: (template, recipe, t) => {
    const role = recipe.roles[t.roleIndex] as RoleRecipe;
    propertiesOf(template, role.logicalId).ManagedPolicyArns = [
      "arn:aws:iam::aws:policy/AWSLambdaBasicExecutionRole",
    ];
    return forbid(`Resources.${role.logicalId}.Properties.ManagedPolicyArns`);
  },
  RESOURCE_SUB: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    s.statement.Resource = { "Fn::Sub": "arn:aws:s3:::b/x" };
    return forbid(s.path);
  },
  RESOURCE_IMPORT_VALUE: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    s.statement.Resource = { "Fn::ImportValue": "SharedBucketArn" };
    return forbid(s.path);
  },
  RESOURCE_UNKNOWN_ATTRIBUTE: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    const role = recipe.roles[t.roleIndex] as RoleRecipe;
    s.statement.Resource = { "Fn::GetAtt": [role.logicalId, "RoleId"] };
    return forbid(s.path);
  },
  RESOURCE_NO_VALUE: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    s.statement.Resource = { "Fn::Join": ["", ["arn:aws:s3:::b", { Ref: "AWS::NoValue" }]] };
    return forbid(s.path);
  },
  RESOURCE_MISSING_TARGET: (template, recipe, t) => {
    const s = inlineStatement(template, recipe, t);
    s.statement.Resource = { "Fn::GetAtt": ["NoSuchBucket", "Arn"] };
    return forbid(s.path);
  },
  TRUST_NON_LITERAL: (template, recipe, t) => {
    const role = recipe.roles[t.roleIndex] as RoleRecipe;
    const document = propertiesOf(template, role.logicalId).AssumeRolePolicyDocument as Json;
    (document.Statement as Json[])[0] = {
      Effect: "Allow",
      Action: "sts:AssumeRole",
      Principal: { Service: { "Fn::Join": ["", ["lambda", ".amazonaws.com"]] } },
    };
    return forbid(
      `Resources.${role.logicalId}.Properties.AssumeRolePolicyDocument.Statement[0].Principal.Service`,
    );
  },
  MANAGED_POLICY_RESOURCE: (template) => {
    resourcesOf(template).PoisonManaged = {
      Type: "AWS::IAM::ManagedPolicy",
      Properties: { PolicyDocument: { Statement: [] } },
    };
    return forbid("Resources.PoisonManaged");
  },
  OTHER_IAM_TYPE: (template) => {
    resourcesOf(template).PoisonUser = { Type: "AWS::IAM::User", Properties: {} };
    return forbid("Resources.PoisonUser");
  },
  MISSING_RESOURCES: (template) => {
    delete template.Resources;
    return forbid("Resources");
  },
  ATTACH_ROLES_NOT_ARRAY: (template, recipe, t) => {
    const policy = recipe.attached[t.attachedIndex] as AttachedRecipe;
    propertiesOf(template, policy.logicalId).Roles = { Ref: "Role0" };
    return forbid(`Resources.${policy.logicalId}.Properties.Roles`);
  },
  ATTACH_NON_LOCAL_REF: (template, recipe, t) => {
    const policy = recipe.attached[t.attachedIndex] as AttachedRecipe;
    propertiesOf(template, policy.logicalId).Roles = [{ Ref: "NoSuchRole" }];
    return forbid(`Resources.${policy.logicalId}.Properties.Roles[0]`);
  },
};

/** どの位置を必要とする毒か。 */
const NEEDS: Record<PoisonId, "inline" | "role" | "attached" | "none"> = {
  CONDITION: "inline",
  NOT_ACTION: "inline",
  NOT_RESOURCE: "inline",
  NON_LITERAL_ACTION: "inline",
  NON_LITERAL_RESOURCE: "inline",
  POLICY_VARIABLE_STRING: "inline",
  POLICY_VARIABLE_ARRAY: "inline",
  INTRINSIC_WITH_VARIABLE: "inline",
  BAD_EFFECT: "inline",
  STATEMENT_NOT_OBJECT: "inline",
  MALFORMED_POLICY_DOCUMENT: "inline",
  INLINE_POLICY_NOT_OBJECT: "inline",
  POLICIES_NOT_ARRAY: "role",
  MANAGED_POLICY_ARNS: "role",
  NON_LITERAL_ROLE_NAME: "role",
  NON_DEFAULT_PATH: "role",
  TRUST_NOT_PRINCIPAL: "role",
  TRUST_CONDITION: "role",
  TRUST_CONDITION_ON_DENY: "role",
  MANAGED_POLICY_MIXED: "role",
  MANAGED_POLICY_LOOKALIKE: "role",
  TRUST_NON_LITERAL: "role",
  RESOURCE_SUB: "inline",
  RESOURCE_IMPORT_VALUE: "inline",
  RESOURCE_UNKNOWN_ATTRIBUTE: "inline",
  RESOURCE_NO_VALUE: "inline",
  RESOURCE_MISSING_TARGET: "inline",
  MANAGED_POLICY_RESOURCE: "none",
  OTHER_IAM_TYPE: "none",
  MISSING_RESOURCES: "none",
  ATTACH_ROLES_NOT_ARRAY: "attached",
  ATTACH_NON_LOCAL_REF: "attached",
};

const POISON_IDS = Object.keys(APPLIERS) as PoisonId[];
const EMPTY_KINDS: readonly EmptyKind[] = [
  "no-iam",
  "roles-without-statements",
  "attached-to-missing-role",
];

/** 毒の位置がレシピ内に存在するかを判定します。 */
function targetExists(recipe: TemplateRecipe, t: PoisonTarget): boolean {
  const need = NEEDS[t.id];
  if (need === "none") return true;
  if (need === "attached") return recipe.attached[t.attachedIndex] !== undefined;
  const role = recipe.roles[t.roleIndex];
  if (role === undefined) return false;
  if (need === "role") return true;
  return role.policies[t.policyIndex]?.[t.statementIndex] !== undefined;
}

// ---------------------------------------------------------------------------------------------
// 期待を含む断片の組み立てと検査
// ---------------------------------------------------------------------------------------------

type Expectation =
  | { readonly kind: "model"; readonly model: StackModel }
  | ({ readonly kind: "poison" } & PoisonExpectation)
  | { readonly kind: "empty"; readonly path: string };

export interface BuiltCase {
  readonly template: unknown;
  readonly expectation: Expectation;
}

/** 仕様から、テンプレートと期待を作ります。 */
export function build(spec: TemplateSpec): BuiltCase {
  if (spec.kind === "supported") {
    return {
      template: render(spec.recipe),
      expectation: { kind: "model", model: expectedModel(spec.recipe) },
    };
  }
  if (spec.kind === "poisoned" && spec.poison !== undefined) {
    const template = render(spec.recipe);
    const applied = APPLIERS[spec.poison.id](template, spec.recipe, spec.poison);
    return { template, expectation: { kind: "poison", ...applied } };
  }
  const template = render(spec.recipe);
  const path =
    spec.empty === "attached-to-missing-role"
      ? `Resources.${spec.recipe.attached[0]?.logicalId}.Properties.Roles[0]`
      : "Resources";
  return { template, expectation: { kind: "empty", path } };
}

const pathMatches = (found: string, expected: string) =>
  found === expected || found.startsWith(`${expected}.`) || found.startsWith(`${expected}[`);

/**
 * 断片を検査し、期待と食い違えば失敗の種類と詳細を返します。種類は縮小時に「同じ失敗か」の判定に使います。
 * 例: "model-mismatch: ..."
 */
export function check(
  spec: TemplateSpec,
  extract: (template: unknown) => ExtractionResult,
): string | undefined {
  const { template, expectation } = build(spec);
  const result = extract(structuredClone(template));
  if (expectation.kind === "model") {
    if (result.unsupported.length > 0) {
      return `unexpected-unsupported: ${JSON.stringify(result.unsupported)}`;
    }
    const expected = canonical(expectation.model);
    const actual = canonical(result.model);
    return actual === expected ? undefined : `model-mismatch: expected ${expected} got ${actual}`;
  }
  if (result.model !== undefined) {
    return `model-returned: a partial or complete model was returned for a fragment that must be rejected`;
  }
  const matching = result.unsupported.filter((f) => pathMatches(f.sourcePath, expectation.path));
  if (matching.length === 0) {
    return `missing-finding: no finding at ${expectation.path}; got ${JSON.stringify(result.unsupported)}`;
  }
  if (expectation.kind === "poison") {
    const variableFindings = result.unsupported.filter((f) => f.reason.includes("policy variable"));
    if (expectation.variable === "required" && variableFindings.length !== 1) {
      return `variable-finding: expected exactly one policy variable finding, got ${variableFindings.length}`;
    }
    if (expectation.variable === "forbidden" && variableFindings.length > 0) {
      return `variable-finding: unexpected policy variable finding ${JSON.stringify(variableFindings)}`;
    }
  }
  return undefined;
}

/** キーを辞書順に並べたJSON文字列です。`undefined`のキーは落とし、比較がキー順に依存しないようにします。 */
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v !== null && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .filter(([, x]) => x !== undefined)
              .sort(([x], [y]) => (x < y ? -1 : 1))
              .map(([k, x]) => [k, sort(x)]),
          )
        : v;
  return JSON.stringify(sort(value));
}

// ---------------------------------------------------------------------------------------------
// 生成
// ---------------------------------------------------------------------------------------------

const ACTION_POOL = [
  "s3:GetObject",
  "s3:*",
  "iam:PassRole",
  "lambda:CreateFunction",
  "logs:PutLogEvents",
  "dynamodb:*",
  "*",
];
const RESOURCE_POOL = [
  "*",
  "arn:aws:s3:::protected-bucket/*",
  "arn:aws:iam::123456789012:role/data-role",
  "arn:aws:logs:*:*:*",
  "arn:aws:s3:::cost$dollar/{braces}/*",
];
const SERVICE_POOL = [
  "lambda.amazonaws.com",
  "Lambda.amazonaws.com",
  "EC2.amazonaws.com",
  "ecs-tasks.amazonaws.com",
];

function randomStatement(rng: Rng): StatementRecipe {
  const actions = Array.from({ length: rng.int(1, 3) }, () => rng.pick(ACTION_POOL));
  const resources = Array.from({ length: rng.int(1, 3) }, () => rng.pick(RESOURCE_POOL));
  return {
    effect: rng.chance(0.8) ? "Allow" : "Deny",
    actions: [...new Set(actions)],
    resources: [...new Set(resources)],
    actionAsString: rng.chance(0.5),
    resourceAsString: rng.chance(0.5),
  };
}

function randomTrust(rng: Rng): TrustRecipe {
  const services = [
    ...new Set(Array.from({ length: rng.int(1, 2) }, () => rng.pick(SERVICE_POOL))),
  ];
  return {
    services,
    star: rng.chance(0.15),
    awsPrincipal: rng.chance(0.2),
    deniedServices: rng.chance(0.2) ? [rng.pick(SERVICE_POOL)] : [],
  };
}

interface RecipeOptions {
  readonly minRoles: number;
  /** 先頭のロールに、2つ以上のStatementを持つインラインポリシーを必ず作ります。 */
  readonly firstRoleNeedsPolicy: boolean;
  readonly needAttached: boolean;
}

function randomRecipe(rng: Rng, options: RecipeOptions): TemplateRecipe {
  const count = rng.int(options.minRoles, 4);
  const roles: RoleRecipe[] = Array.from({ length: count }, (_, n) => {
    const policyCount = n === 0 && options.firstRoleNeedsPolicy ? rng.int(1, 2) : rng.int(0, 2);
    return {
      logicalId: `Role${n}`,
      roleName: rng.chance(0.7) ? `role-${n}-name` : undefined,
      trust: randomTrust(rng),
      policies: Array.from({ length: policyCount }, (__, p) =>
        Array.from(
          {
            length:
              n === 0 && options.firstRoleNeedsPolicy && p === 0 ? rng.int(2, 3) : rng.int(1, 3),
          },
          () => randomStatement(rng),
        ),
      ),
    };
  });
  const attachedCount = options.needAttached ? rng.int(1, 2) : rng.int(0, 2);
  const attached: AttachedRecipe[] = Array.from({ length: attachedCount }, (_, n) => ({
    logicalId: `Pol${n}`,
    roles: rng.shuffle(roles.map((r) => r.logicalId)).slice(0, rng.int(1, Math.min(2, count))),
    statements: Array.from({ length: rng.int(1, 3) }, () => randomStatement(rng)),
  }));
  return { roles, attached, noise: rng.int(0, 2), attachedFirst: rng.chance(0.3) };
}

function shapesOf(recipe: TemplateRecipe): string[] {
  const statements = [
    ...recipe.roles.flatMap((r) => r.policies.flat()),
    ...recipe.attached.flatMap((a) => a.statements),
  ];
  const shapes: string[] = [];
  const add = (condition: boolean, name: string) => {
    if (condition) shapes.push(name);
  };
  add(
    statements.some((s) => s.actionAsString && s.actions.length === 1),
    "string-action",
  );
  add(
    statements.some((s) => !s.actionAsString || s.actions.length > 1),
    "array-action",
  );
  add(
    statements.some((s) => s.resourceAsString && s.resources.length === 1),
    "string-resource",
  );
  add(
    statements.some((s) => s.effect === "Deny"),
    "deny",
  );
  add(recipe.attached.length > 0, "attached-policy");
  add(recipe.attachedFirst, "attached-first");
  add(
    recipe.roles.some((r) => r.policies.length > 1),
    "multiple-inline-policies",
  );
  add(
    recipe.roles.some((r) => r.trust.star),
    "trust-star",
  );
  add(
    recipe.roles.some((r) => r.trust.services.some((s) => s !== s.toLowerCase())),
    "trust-mixed-case",
  );
  add(
    recipe.roles.some((r) => r.trust.deniedServices.length > 0),
    "trust-deny-ignored",
  );
  add(
    recipe.roles.some((r) => r.trust.awsPrincipal),
    "trust-aws-principal-ignored",
  );
  add(
    recipe.roles.some((r) => r.managed === "string"),
    "managed-basic-string",
  );
  add(
    recipe.roles.some((r) => r.managed === "join"),
    "managed-basic-join",
  );
  add(
    recipe.roles.some((r) => r.trust.condition === true),
    "trust-condition-ignored",
  );
  for (const form of RESOLVABLE_FORMS) {
    add(
      recipe.roles.some((r) => r.resolvable === form),
      `resolvable:${form}`,
    );
  }
  add(recipe.noise > 0, "noise-resource");
  add(
    recipe.roles.some((r) => r.roleName === undefined),
    "no-role-name",
  );
  add(recipe.roles.length > 1, "several-roles");
  return shapes;
}

/** 少なくとも1つのStatementを持つレシピになるまで、先頭のロールへStatementを足します。 */
function ensureStatement(recipe: TemplateRecipe, rng: Rng): TemplateRecipe {
  const has =
    recipe.roles.some((r) => r.policies.some((p) => p.length > 0)) ||
    recipe.attached.some((a) => a.statements.length > 0);
  if (has) return recipe;
  const [first, ...rest] = recipe.roles as [RoleRecipe, ...RoleRecipe[]];
  return { ...recipe, roles: [{ ...first, policies: [[randomStatement(rng)]] }, ...rest] };
}

/** seedとindexから、断片の仕様を1件生成します。10件ごとに、対応5件、毒4件、空1件を割り当てます。 */
export function generateTemplateSpec(seed: number, index: number): TemplateSpec {
  const rng = createRng(seed, index + 700_000);
  const slot = index % 10;
  const round = Math.floor(index / 10);
  if (slot < 5) {
    const base = ensureStatement(
      randomRecipe(rng, { minRoles: 1, firstRoleNeedsPolicy: false, needAttached: false }),
      rng,
    );
    // R2とR3の形は、別の乱数列から付けます。既存の断片の内容を変えないためです。
    const extra = createRng(seed, index + 900_000);
    const recipe: TemplateRecipe = {
      ...base,
      roles: base.roles.map((role, n) => ({
        ...role,
        // 先頭のロールには、round（index / 10）が偶数の断片で必ず付けて、網羅を決定的にします。
        ...(extra.chance(0.35) || (n === 0 && round % 4 === 0)
          ? { managed: round % 8 === 0 ? ("string" as const) : ("join" as const) }
          : {}),
        trust: {
          ...role.trust,
          ...(extra.chance(0.35) || (n === 0 && round % 4 === 1) ? { condition: true } : {}),
        },
        // R1の形（別の乱数列）。先頭のロールにはroundで順番に付けて、すべての形を決定的に網羅します。
        ...(n === 0 && round % 2 === 0
          ? {
              resolvable: RESOLVABLE_FORMS[(round / 2) % RESOLVABLE_FORMS.length] as ResolvableForm,
            }
          : extra.chance(0.25)
            ? { resolvable: extra.pick(RESOLVABLE_FORMS) }
            : {}),
      })),
    };
    return { id: index, kind: "supported", recipe, shapes: shapesOf(recipe) };
  }
  if (slot < 9) {
    const id = POISON_IDS[(round * 4 + (slot - 5)) % POISON_IDS.length] as PoisonId;
    const recipe = randomRecipe(rng, {
      minRoles: 2,
      firstRoleNeedsPolicy: true,
      needAttached: true,
    });
    const poison: PoisonTarget = {
      id,
      roleIndex: 0,
      policyIndex: 0,
      statementIndex: rng.int(
        0,
        ((recipe.roles[0] as RoleRecipe).policies[0] as StatementRecipe[]).length - 1,
      ),
      attachedIndex: 0,
    };
    return { id: index, kind: "poisoned", recipe, poison, shapes: [`poison:${id}`] };
  }
  const empty = EMPTY_KINDS[round % EMPTY_KINDS.length] as EmptyKind;
  const base = randomRecipe(rng, { minRoles: 1, firstRoleNeedsPolicy: false, needAttached: false });
  let recipe: TemplateRecipe;
  if (empty === "no-iam") {
    recipe = { roles: [], attached: [], noise: rng.int(1, 3), attachedFirst: false };
  } else if (empty === "roles-without-statements") {
    recipe = {
      roles: base.roles.map((r) => ({ ...r, policies: [] })),
      attached: [],
      noise: base.noise,
      attachedFirst: false,
    };
  } else {
    recipe = {
      roles: base.roles.map((r) => ({ ...r, policies: [] })),
      attached: [{ logicalId: "Pol0", roles: ["MissingRole"], statements: [randomStatement(rng)] }],
      noise: 0,
      attachedFirst: base.attachedFirst,
    };
  }
  return { id: index, kind: "empty", recipe, empty, shapes: [`empty:${empty}`] };
}

/** 既定の実行で1件以上現れるべき形式名です。 */
export function requiredTemplateShapes(): string[] {
  return [
    "string-action",
    "array-action",
    "string-resource",
    "deny",
    "attached-policy",
    "attached-first",
    "multiple-inline-policies",
    "trust-star",
    "trust-mixed-case",
    "trust-deny-ignored",
    "trust-aws-principal-ignored",
    "managed-basic-string",
    "managed-basic-join",
    "trust-condition-ignored",
    ...RESOLVABLE_FORMS.map((form) => `resolvable:${form}`),
    "noise-resource",
    "no-role-name",
    "several-roles",
    ...POISON_IDS.map((id) => `poison:${id}`),
    ...EMPTY_KINDS.map((kind) => `empty:${kind}`),
  ];
}

// ---------------------------------------------------------------------------------------------
// 縮小（レシピを小さくし、テンプレートと期待を作り直します）
// ---------------------------------------------------------------------------------------------

const without = <T>(items: readonly T[], index: number): T[] => items.filter((_, i) => i !== index);

/** 1ステップで作れる、有効なレシピ縮小の候補を返します。毒の位置は、ずれる分だけ添字を直します。 */
export function templateReductions(spec: TemplateSpec): TemplateSpec[] {
  const { recipe, poison } = spec;
  const out: TemplateSpec[] = [];
  const emit = (next: TemplateRecipe, nextPoison: PoisonTarget | undefined = poison) =>
    out.push({ ...spec, recipe: next, poison: nextPoison });
  const mapRole = (r: number, change: (role: RoleRecipe) => RoleRecipe) =>
    recipe.roles.map((role, i) => (i === r ? change(role) : role));

  recipe.roles.forEach((role, r) => {
    // 毒の対象ロールは消しません。それ以外のロールを消すと、先に並ぶロールの添字がずれます。
    if (recipe.roles.length > 1 && r !== poison?.roleIndex) {
      const attached = recipe.attached.map((a) => ({
        ...a,
        roles: a.roles.filter((id) => id !== role.logicalId),
      }));
      emit(
        { ...recipe, roles: without(recipe.roles, r), attached },
        poison !== undefined && r < poison.roleIndex
          ? { ...poison, roleIndex: poison.roleIndex - 1 }
          : poison,
      );
    }
    role.policies.forEach((statements, p) => {
      const inTargetRole = poison?.roleIndex === r;
      const isTargetPolicy = inTargetRole && poison?.policyIndex === p;
      if (!isTargetPolicy) {
        emit(
          { ...recipe, roles: mapRole(r, (x) => ({ ...x, policies: without(x.policies, p) })) },
          inTargetRole && poison !== undefined && p < poison.policyIndex
            ? { ...poison, policyIndex: poison.policyIndex - 1 }
            : poison,
        );
      }
      const replaceStatements = (next: StatementRecipe[]) => ({
        ...recipe,
        roles: mapRole(r, (x) => ({
          ...x,
          policies: x.policies.map((policy, j) => (j === p ? next : policy)),
        })),
      });
      statements.forEach((statement, s) => {
        const isTarget = isTargetPolicy && poison?.statementIndex === s;
        if (!isTarget && statements.length > 1) {
          emit(
            replaceStatements(without(statements, s)),
            isTargetPolicy && poison !== undefined && s < poison.statementIndex
              ? { ...poison, statementIndex: poison.statementIndex - 1 }
              : poison,
          );
        }
        for (let k = 0; statement.actions.length > 1 && k < statement.actions.length; k++) {
          emit(
            replaceStatements(
              statements.map((st, j) =>
                j === s ? { ...st, actions: without(st.actions, k) } : st,
              ),
            ),
          );
        }
        for (let k = 0; statement.resources.length > 1 && k < statement.resources.length; k++) {
          emit(
            replaceStatements(
              statements.map((st, j) =>
                j === s ? { ...st, resources: without(st.resources, k) } : st,
              ),
            ),
          );
        }
      });
    });
    if (role.trust.services.length > 1) {
      emit({
        ...recipe,
        roles: mapRole(r, (x) => ({
          ...x,
          trust: { ...x.trust, services: x.trust.services.slice(0, 1) },
        })),
      });
    }
    if (role.trust.star || role.trust.awsPrincipal || role.trust.deniedServices.length > 0) {
      emit({
        ...recipe,
        roles: mapRole(r, (x) => ({
          ...x,
          trust: { ...x.trust, star: false, awsPrincipal: false, deniedServices: [] },
        })),
      });
    }
  });
  recipe.attached.forEach((policy, a) => {
    emit(
      { ...recipe, attached: without(recipe.attached, a) },
      poison !== undefined && a < poison.attachedIndex
        ? { ...poison, attachedIndex: poison.attachedIndex - 1 }
        : poison,
    );
    for (let s = 0; policy.statements.length > 1 && s < policy.statements.length; s++) {
      emit({
        ...recipe,
        attached: recipe.attached.map((x, i) =>
          i === a ? { ...x, statements: without(x.statements, s) } : x,
        ),
      });
    }
  });
  if (recipe.noise > 0) emit({ ...recipe, noise: 0 });
  if (recipe.attachedFirst) emit({ ...recipe, attachedFirst: false });
  return out.filter(candidateValid);
}

/** 候補が、同じ種類の有効な仕様のままかを判定します。 */
function candidateValid(spec: TemplateSpec): boolean {
  if (spec.recipe.roles.length === 0 && spec.empty !== "no-iam") return false;
  if (spec.kind === "poisoned")
    return spec.poison !== undefined && targetExists(spec.recipe, spec.poison);
  const statementCount =
    spec.recipe.roles.reduce((n, r) => n + r.policies.flat().length, 0) +
    spec.recipe.attached.reduce((n, a) => n + a.statements.length, 0);
  if (spec.kind === "supported") return statementCount > 0;
  if (spec.empty === "attached-to-missing-role") return spec.recipe.attached.length > 0;
  return true;
}
