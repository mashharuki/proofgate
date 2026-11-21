/**
 * Resourceの値リゾルバです（spec proofgate-cdk-construct-support, R1）。
 * CloudFormationの値（文字列、`Fn::Join`、`Ref`、`Fn::GetAtt`）を、1つの文字列にします。
 * 読めない値はundefinedを返し、呼び出し側が未対応（PG-IAM-003）として扱います。部分的な結果は返しません。
 *
 * 方針（design 3）: 既知の部分は正確に使い、未知だが必ず存在する部分はワイルドカード`*`で読みます。
 * `*`は実際の1つの値より大きい集合なので、Allowの中で使っても指摘が増えるだけで、経路を隠しません。
 * Resolves a CloudFormation value to one string. A known part is used exactly; an unknown part that
 * certainly exists is read as the wildcard `*` (a larger set, so it can only add findings).
 * Anything else makes the whole value unsupported.
 *
 * パーティションだけは`*`にしません。評価器の`*`はコロンをまたぐため、`arn:*:s3:::x/*`は保護バケットの
 * キーの一部として必ず交わり、すべてのバケットで誤検出になります。そこで、AWSのドキュメントにある3つの
 * パーティションの候補（aws、aws-cn、aws-us-gov）へ展開します。値は候補の集合になります。
 * The partition is expanded to the three documented partitions instead of `*`: the evaluator's `*` crosses
 * colons, so `arn:*:s3:::x/*` would always intersect the protected objects (a false alarm for every bucket).
 * The list is from https://docs.aws.amazon.com/IAM/latest/UserGuide/reference-arns.html (checked 2026-11-19).
 */
type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** リゾルバが参照する、テンプレートの`Resources`です。 */
export interface ResolveContext {
  readonly resources: Readonly<Record<string, unknown>>;
}

/** 名前のないバケットとロールの、不透明な名前の接頭辞です。S3のバケット名として不可能な`_`で始めます。 */
const GENERATED_PREFIX = "_generated_";

/** ARNのパーティションの候補です（AWS公式ドキュメントのsupported partitions）。 */
const PARTITIONS: readonly string[] = ["aws", "aws-cn", "aws-us-gov"];
/** 1つの値の候補数の上限です。超えたら未対応にします（組み合わせの爆発を防ぎます）。 */
const MAX_ALTERNATIVES = 64;

/** `Ref`が`*`になる疑似パラメータです。実際の値は1つなので、`*`はそれより大きい集合です。 */
const WILDCARD_PSEUDO_PARAMETERS = new Set(["AWS::Region", "AWS::AccountId", "AWS::URLSuffix"]);

const resourceOf = (context: ResolveContext, id: string): JsonObject | undefined => {
  const resource = Object.hasOwn(context.resources, id) ? context.resources[id] : undefined;
  return isObject(resource) ? resource : undefined;
};

/**
 * バケットまたはロールの名前です。リテラルの名前はそのまま、名前がなければ不透明な名前、
 * 名前がintrinsicなどで読めなければundefinedです。
 */
function physicalName(
  resource: JsonObject,
  logicalId: string,
  property: string,
): string | undefined {
  const properties = resource.Properties;
  const name = isObject(properties) ? properties[property] : undefined;
  if (name === undefined) return `${GENERATED_PREFIX}${logicalId}`;
  return typeof name === "string" && name.length > 0 ? name : undefined;
}

/** 値の候補の集合です。実際の値は、このどれか1つです。 */
type Alternatives = readonly string[];
const one = (value: string | undefined): Alternatives | undefined =>
  value === undefined ? undefined : [value];

function resolveRef(target: unknown, context: ResolveContext): Alternatives | undefined {
  if (typeof target !== "string") return undefined;
  if (target === "AWS::Partition") return PARTITIONS;
  if (target.startsWith("AWS::")) return WILDCARD_PSEUDO_PARAMETERS.has(target) ? ["*"] : undefined;
  const resource = resourceOf(context, target);
  if (resource === undefined) return undefined; // パラメータや、テンプレートにない名前
  if (resource.Type === "AWS::S3::Bucket") return one(physicalName(resource, target, "BucketName"));
  if (resource.Type === "AWS::IAM::Role") return one(physicalName(resource, target, "RoleName"));
  return ["*"]; // ほかのリソースの物理IDは未知ですが、必ず存在します。
}

function resolveGetAtt(target: unknown, context: ResolveContext): Alternatives | undefined {
  if (!Array.isArray(target) || target.length !== 2) return undefined;
  const [id, attribute] = target;
  if (typeof id !== "string" || typeof attribute !== "string") return undefined;
  const resource = resourceOf(context, id);
  if (resource === undefined) return undefined;
  if (resource.Type === "AWS::S3::Bucket") {
    // この型はよく知っているので、知らない属性は推測せず未対応にします。
    const name = attribute === "Arn" ? physicalName(resource, id, "BucketName") : undefined;
    return name === undefined ? undefined : PARTITIONS.map((p) => `arn:${p}:s3:::${name}`);
  }
  if (resource.Type === "AWS::IAM::Role") {
    const name = attribute === "Arn" ? physicalName(resource, id, "RoleName") : undefined;
    return name === undefined ? undefined : PARTITIONS.map((p) => `arn:${p}:iam::*:role/${name}`);
  }
  return ["*"];
}

/**
 * `Fn::Sub`の文字列形式（変数マップなし）です（spec proofgate-brushup, B4）。
 * `${Name}`は`Ref Name`、`${Id.Attr}`は`Fn::GetAtt [Id, Attr]`と同じに読み、`${!Text}`はリテラルの`${Text}`です。
 * 未知の名前、パラメータ、閉じていない`${`、空の`${}`は読まず、未対応にします（IAMポリシー変数`${aws:username}`も、
 * ここでは名前として未知なので未対応になります）。
 * The string form of Fn::Sub without a variable map. `${!Text}` is the literal `${Text}`
 * (https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/intrinsic-function-reference-sub.html, read 2026-11-21).
 */
function resolveSub(text: unknown, context: ResolveContext): Alternatives | undefined {
  if (typeof text !== "string") return undefined;
  let combined: string[] = [""];
  let rest = text;
  while (rest.length > 0) {
    const start = rest.indexOf("${");
    const literal = start === -1 ? rest : rest.slice(0, start);
    combined = combined.map((left) => `${left}${literal}`);
    if (start === -1) break;
    const end = rest.indexOf("}", start);
    if (end === -1) return undefined;
    const name = rest.slice(start + 2, end);
    rest = rest.slice(end + 1);
    if (name.length === 0) return undefined;
    let alternatives: Alternatives | undefined;
    if (name.startsWith("!")) {
      alternatives = [`\${${name.slice(1)}}`];
    } else {
      const dot = name.indexOf(".");
      alternatives =
        dot === -1
          ? resolveRef(name, context)
          : resolveGetAtt([name.slice(0, dot), name.slice(dot + 1)], context);
    }
    if (alternatives === undefined) return undefined;
    const values = alternatives;
    combined = combined.flatMap((left) => values.map((right) => `${left}${right}`));
    if (combined.length > MAX_ALTERNATIVES) return undefined;
  }
  return [...new Set(combined)];
}
/** 値を、候補の文字列の集合にします。読めなければundefinedです。 */
export function resolveValue(value: unknown, context: ResolveContext): Alternatives | undefined {
  if (typeof value === "string") return [value];
  if (!isObject(value)) return undefined;
  const keys = Object.keys(value);
  if (keys.length !== 1) return undefined;
  if ("Ref" in value) return resolveRef(value.Ref, context);
  if ("Fn::GetAtt" in value) return resolveGetAtt(value["Fn::GetAtt"], context);
  if ("Fn::Sub" in value) return resolveSub(value["Fn::Sub"], context);
  if ("Fn::Join" in value) {
    const join = value["Fn::Join"];
    if (!Array.isArray(join) || join.length !== 2) return undefined;
    const [separator, parts] = join;
    if (typeof separator !== "string" || !Array.isArray(parts)) return undefined;
    let combined: string[] = [];
    for (const [index, part] of parts.entries()) {
      const resolved = resolveValue(part, context);
      if (resolved === undefined) return undefined;
      combined =
        index === 0
          ? [...resolved]
          : combined.flatMap((left) => resolved.map((right) => `${left}${separator}${right}`));
      if (combined.length > MAX_ALTERNATIVES) return undefined;
    }
    return [...new Set(combined)];
  }
  return undefined;
}

/**
 * `Resource`の値（文字列、intrinsic、またはそれらの配列）を、文字列の配列にします。
 * 候補が複数ある要素は、すべての候補を並べます（Allowでは、どれか1つに当たれば当たるため、和集合で正確です）。
 */
export function resolveResources(value: unknown, context: ResolveContext): string[] | undefined {
  const entries = Array.isArray(value) ? value : [value];
  const resolved: string[] = [];
  for (const entry of entries) {
    const alternatives = resolveValue(entry, context);
    if (alternatives === undefined) return undefined;
    resolved.push(...alternatives);
  }
  return [...new Set(resolved)];
}
