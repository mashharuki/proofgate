/**
 * Model-level生成テストのCaseジェネレータです（design 4.2）。
 *
 * - `unsafe` / `safe` / `boundary`は、AWSの意味論で有効な形式だけで作ります。
 * - ProofGateが意図的に過剰検出する形式（タグ付き）は`conservative`カテゴリにだけ現れ、
 *   AWSの意味論ではsafeです。
 * - `label`は常に「AWSの意味論での判定」（O1）です。「ProofGateが言うはずの判定」ではありません。
 */
import type { ProofGateConfig, RoleModel, StackModel } from "@proofgate-cdk/model";
import type { Rng } from "./prng.js";
import { createRng } from "./prng.js";
import { statementPath } from "./render.js";

export type Category = "unsafe" | "safe" | "boundary" | "conservative";
export type Tag = "PASSROLE_ALIAS" | "TRUST_STAR" | "ARN_CASE" | "ARN_STAR_SPAN";
type Label = "unsafe" | "safe";

export const TAGS: readonly Tag[] = ["PASSROLE_ALIAS", "TRUST_STAR", "ARN_CASE", "ARN_STAR_SPAN"];
export const CATEGORIES: readonly Category[] = ["unsafe", "safe", "boundary", "conservative"];

/** タグ付きの形式を使ったStatementとロールを指す証跡です。 */
interface Witness {
  /** タグ付きの形式を含むStatementのsourcePathです。 */
  readonly paths: readonly string[];
  /** trust principalが`*`のロールのLogical IDです（trustはviolationのsourcePathsに現れないため）。 */
  readonly roles: readonly string[];
}

export interface Case {
  readonly id: number;
  readonly model: StackModel;
  readonly config: ProofGateConfig;
  readonly category: Category;
  /** O1: AWSの意味論での判定です。 */
  readonly label: Label;
  readonly tags: readonly Tag[];
  readonly witness: Witness;
  /** 網羅カウンタ用に、使った形式の名前を記録します。 */
  readonly forms: readonly string[];
}

// ---------------------------------------------------------------------------------------------
// ロール仕様（sourcePathを割り当てる前の中間表現）
// ---------------------------------------------------------------------------------------------

interface StatementSpec {
  readonly actions: string[];
  readonly resources: string[];
  /** タグ付きの形式を含むStatementならtrue。 */
  readonly witness?: boolean;
}

interface RoleSpec {
  readonly logicalId: string;
  readonly roleName: string;
  readonly trust: string[];
  readonly statements: StatementSpec[];
  /** trust principalがタグ付き（`*`）ならtrue。 */
  readonly witness?: boolean;
}

function buildModel(roles: readonly RoleSpec[]): {
  model: StackModel;
  witness: Witness;
} {
  const sorted = [...roles].sort((a, b) => (a.logicalId < b.logicalId ? -1 : 1));
  const paths: string[] = [];
  const witnessRoles: string[] = [];
  const modelRoles: RoleModel[] = sorted.map((role) => {
    if (role.witness) witnessRoles.push(role.logicalId);
    return {
      logicalId: role.logicalId,
      roleName: role.roleName,
      trustServices: role.trust,
      statements: role.statements.map((s, index) => {
        const sourcePath = statementPath(role.logicalId, index);
        if (s.witness) paths.push(sourcePath);
        return { effect: "Allow", actions: s.actions, resources: s.resources, sourcePath };
      }),
    };
  });
  return {
    model: { version: "1", roles: modelRoles },
    witness: { paths, roles: witnessRoles },
  };
}

// ---------------------------------------------------------------------------------------------
// 形式のカタログ
// ---------------------------------------------------------------------------------------------

const ACCOUNT = "123456789012";
const BUCKET_A = "protected-a";
const BUCKET_B = "protected-b";
const arnOf = (bucket: string) => `arn:aws:s3:::${bucket}`;
const LAMBDA = "lambda.amazonaws.com";

interface Chosen<T> {
  readonly value: T;
  readonly form: string;
}

interface Target {
  readonly logicalId: string;
  readonly roleName: string;
  /** 他のロール名と重ならない先頭部分（`r<n>x`）です。 */
  readonly prefix: string;
}

function passActions(rng: Rng): Chosen<string[]> {
  return rng.pick<Chosen<string[]>>([
    { value: ["iam:PassRole"], form: "pass:exact" },
    { value: ["iam:Pass*"], form: "pass:star" },
    { value: ["iam:PassRol?"], form: "pass:question" },
    { value: ["iam:*"], form: "pass:service-star" },
    { value: ["*"], form: "pass:all" },
    { value: ["IAM:passrole"], form: "pass:mixed-case" },
  ]);
}

function passResource(rng: Rng, target: Target): Chosen<string> {
  const name = target.roleName;
  return rng.pick<Chosen<string>>([
    { value: `arn:aws:iam::${ACCOUNT}:role/${name}`, form: "passres:arn-exact" },
    { value: `arn:aws:iam::*:role/${name}`, form: "passres:account-star" },
    { value: `arn:*:iam::*:role/${name}`, form: "passres:partition-star" },
    { value: `arn:aws:iam::${ACCOUNT}:role/${target.prefix}*`, form: "passres:prefix-star" },
    {
      value: `arn:aws:iam::${ACCOUNT}:role/${name.slice(0, -1)}?`,
      form: "passres:question",
    },
    { value: "*", form: "passres:star" },
  ]);
}

function lambdaStatements(rng: Rng): Chosen<StatementSpec[]> {
  const resource = rng.pick(["*", "arn:aws:lambda:*:*:function:*"]);
  const single = (action: string): StatementSpec => ({
    actions: [action],
    resources: [resource],
  });
  return rng.pick<Chosen<StatementSpec[]>>([
    { value: [single("lambda:CreateFunction")], form: "lambda:create" },
    { value: [single("lambda:*")], form: "lambda:service-star" },
    { value: [single("lambda:*Function*")], form: "lambda:create-glob" },
    {
      value: [single("lambda:UpdateFunctionConfiguration"), single("lambda:UpdateFunctionCode")],
      form: "lambda:config-code-split",
    },
    { value: [single("lambda:UpdateFunction*")], form: "lambda:config-code-one" },
  ]);
}

function accessActions(rng: Rng): Chosen<string[]> {
  return rng.pick<Chosen<string[]>>([
    { value: ["s3:GetObject"], form: "accessact:get" },
    { value: ["s3:Put*"], form: "accessact:put-star" },
    { value: ["s3:*"], form: "accessact:service-star" },
    { value: ["S3:getobject"], form: "accessact:mixed-case" },
    { value: ["s3:Get*", "s3:Delete*"], form: "accessact:two-patterns" },
    { value: ["*"], form: "accessact:all" },
    { value: ["s3:Delete?bject"], form: "accessact:question" },
  ]);
}

/** 保護バケットのオブジェクト集合と交差する、AWS上有効なResource形式です（D1）。 */
function accessResource(rng: Rng, bucket: string): Chosen<string> {
  return rng.pick<Chosen<string>>([
    { value: `${arnOf(bucket)}/*`, form: "access:bucket-star" },
    { value: `${arnOf(bucket)}/reports/*`, form: "access:prefix" },
    { value: `${arnOf(bucket)}/file.csv`, form: "access:object" },
    { value: `${arnOf(bucket)}*`, form: "access:bucket-trailing-star" },
    { value: "arn:aws:s3:::protected-*/*", form: "access:bucket-wildcard" },
    { value: "arn:aws:s3:::*", form: "access:all-s3" },
    { value: `${arnOf(bucket)}/?`, form: "access:question-key" },
    { value: `arn:aws:s3:::*${bucket}/*`, form: "access:mid-star" },
    { value: "arn:aws:s3:::protected-?/*", form: "access:question-bucket" },
  ]);
}

const INERT_ACTIONS = [
  "logs:PutLogEvents",
  "dynamodb:GetItem",
  "sqs:SendMessage",
  "s3:ListBucket",
  "kms:Decrypt",
];
const INERT_RESOURCES = ["*", "arn:aws:logs:*:*:*", "arn:aws:s3:::other-x", "arn:aws:sqs:*:*:q"];

function inertStatement(rng: Rng): StatementSpec {
  return { actions: [rng.pick(INERT_ACTIONS)], resources: [rng.pick(INERT_RESOURCES)] };
}

// ---------------------------------------------------------------------------------------------
// 計画（どの条件をどの形式で成立させるか）
// ---------------------------------------------------------------------------------------------

type PassMode = "valid" | "broken" | "alias" | "arnCase";
type LambdaMode = "valid" | "none" | "only-code" | "only-config";
type TrustMode = "valid" | "broken" | "star";
type AccessMode =
  | "valid"
  | "other-bucket"
  | "bucket-level"
  | "disjoint-wildcard"
  | "non-data-action"
  | "none"
  | "arnCase"
  | "starSpan";

interface Plan {
  readonly pass: PassMode;
  readonly lambda: LambdaMode;
  readonly trust: TrustMode;
  readonly access: AccessMode;
  readonly allowed: boolean;
}

const VALID_PLAN: Plan = {
  pass: "valid",
  lambda: "valid",
  trust: "valid",
  access: "valid",
  allowed: false,
};

function planLabel(plan: Plan): Label {
  const allValid =
    plan.pass === "valid" &&
    plan.lambda === "valid" &&
    plan.trust === "valid" &&
    plan.access === "valid" &&
    !plan.allowed;
  return allValid ? "unsafe" : "safe";
}

function planTags(plan: Plan): Tag[] {
  const tags = new Set<Tag>();
  if (plan.pass === "alias") tags.add("PASSROLE_ALIAS");
  if (plan.pass === "arnCase" || plan.access === "arnCase") tags.add("ARN_CASE");
  if (plan.trust === "star") tags.add("TRUST_STAR");
  if (plan.access === "starSpan") tags.add("ARN_STAR_SPAN");
  return TAGS.filter((tag) => tags.has(tag));
}

/** 1条件を壊す方法の一覧です（safe Caseの派生に使います）。 */
const BREAKS: readonly Partial<Plan>[] = [
  { pass: "broken" },
  { lambda: "none" },
  { lambda: "only-code" },
  { lambda: "only-config" },
  { trust: "broken" },
  { access: "other-bucket" },
  { access: "bucket-level" },
  { access: "disjoint-wildcard" },
  { access: "non-data-action" },
  { access: "none" },
  { allowed: true },
];

/** conservative Caseで置き換える形式の組み合わせです。置き換える条件は互いに異なります。 */
const CONSERVATIVE_PLANS: readonly Partial<Plan>[] = [
  { pass: "alias" },
  { trust: "star" },
  { pass: "arnCase" },
  { access: "arnCase" },
  { access: "starSpan" },
  { pass: "alias", trust: "star" },
  { pass: "arnCase", access: "starSpan" },
  { pass: "alias", access: "starSpan" },
  { trust: "star", access: "arnCase" },
];

interface Built {
  readonly roles: RoleSpec[];
  readonly config: ProofGateConfig;
  readonly forms: string[];
}

function buildFromPlan(rng: Rng, plan: Plan): Built {
  const forms: string[] = [];
  const noiseCount = rng.int(0, 2);
  const indexes = rng.shuffle(Array.from({ length: 2 + noiseCount }, (_, i) => i));
  const [pIndex = 0, tIndex = 1, ...noiseIndexes] = indexes;
  const roleOf = (n: number): Target => ({
    logicalId: `Role${n}`,
    roleName: `r${n}x-${rng.pick(["data", "admin", "batch", "report"])}`,
    prefix: `r${n}x`,
  });
  const principal = roleOf(pIndex);
  const target = roleOf(tIndex);

  // 保護バケット。まれに2つにしたり、末尾スラッシュ付きで指定したりします。
  const twoBuckets = rng.chance(0.2);
  const trailingSlash = rng.chance(0.1);
  const bucketNames = twoBuckets ? [BUCKET_A, BUCKET_B] : [BUCKET_A];
  if (twoBuckets) forms.push("two-buckets");
  if (trailingSlash) forms.push("trailing-slash-bucket");
  const protectedBucketArns = bucketNames.map((name, i) =>
    i === 0 && trailingSlash ? `${arnOf(name)}/` : arnOf(name),
  );
  const grantedBucket = rng.pick(bucketNames);

  // principalのStatement: PassRole、Lambda制御、無関係なStatement。
  const principalStatements: StatementSpec[] = [];
  if (plan.pass === "valid") {
    let actions = passActions(rng);
    // Action `*`はLambda操作も許可してしまうため、Lambda条件を壊すPlanでは使えません。
    if (plan.lambda !== "valid" && actions.form === "pass:all") {
      actions = { value: ["iam:*"], form: "pass:service-star" };
    }
    const resource = passResource(rng, target);
    forms.push(actions.form, resource.form);
    principalStatements.push({ actions: actions.value, resources: [resource.value] });
  } else if (plan.pass === "arnCase") {
    // ロール名の大文字小文字だけが異なるARNです。AWSのResourceは大文字小文字を区別します。
    principalStatements.push({
      actions: ["iam:PassRole"],
      resources: [`arn:aws:iam::${ACCOUNT}:role/${target.roleName.toUpperCase()}`],
      witness: true,
    });
  } else if (plan.pass === "alias") {
    principalStatements.push({
      actions: ["iam:PassRole"],
      resources: [rng.pick([target.logicalId, target.roleName])],
      witness: true,
    });
  } else {
    // 無関係なロール名へ向け直します。
    principalStatements.push({
      actions: rng.pick([["iam:PassRole"], ["iam:Pass*"], ["iam:*"]]),
      resources: [`arn:aws:iam::${ACCOUNT}:role/unrelated-role`],
    });
  }
  if (plan.lambda === "valid") {
    const lambda = lambdaStatements(rng);
    forms.push(lambda.form);
    principalStatements.push(...lambda.value);
  } else if (plan.lambda === "only-code") {
    principalStatements.push({ actions: ["lambda:UpdateFunctionCode"], resources: ["*"] });
  } else if (plan.lambda === "only-config") {
    principalStatements.push({ actions: ["lambda:UpdateFunctionConfiguration"], resources: ["*"] });
  }
  for (let i = rng.int(0, 2); i > 0; i--) principalStatements.push(inertStatement(rng));
  if (principalStatements.length > 2) forms.push("split-statements");

  // targetのStatement: S3アクセスと無関係なStatement。
  const targetStatements: StatementSpec[] = [];
  const bucketArn = arnOf(grantedBucket);
  if (plan.access === "valid") {
    const resource = accessResource(rng, grantedBucket);
    const actions = accessActions(rng);
    forms.push(resource.form, actions.form);
    targetStatements.push({ actions: actions.value, resources: [resource.value] });
  } else if (plan.access === "arnCase") {
    targetStatements.push({
      actions: ["s3:GetObject"],
      resources: [`arn:aws:s3:::${grantedBucket.toUpperCase()}/*`],
      witness: true,
    });
  } else if (plan.access === "starSpan") {
    targetStatements.push({
      actions: ["s3:GetObject"],
      resources: [`arn:aws:s3:*${grantedBucket}/*`],
      witness: true,
    });
  } else if (plan.access === "other-bucket") {
    targetStatements.push({ actions: ["s3:GetObject"], resources: ["arn:aws:s3:::other-x/*"] });
  } else if (plan.access === "bucket-level") {
    targetStatements.push({ actions: ["s3:GetObject"], resources: [bucketArn] });
  } else if (plan.access === "disjoint-wildcard") {
    targetStatements.push({ actions: ["s3:GetObject"], resources: ["arn:aws:s3:::other-*/*"] });
  } else if (plan.access === "non-data-action") {
    targetStatements.push({ actions: ["s3:ListBucket"], resources: [`${bucketArn}/*`] });
  }
  for (let i = rng.int(0, 2); i > 0; i--) targetStatements.push(inertStatement(rng));

  const trust =
    plan.trust === "valid"
      ? rng.pick([[LAMBDA], ["ec2.amazonaws.com", LAMBDA]])
      : plan.trust === "star"
        ? ["*"]
        : rng.pick([["ec2.amazonaws.com"], ["ecs-tasks.amazonaws.com"]]);

  const roles: RoleSpec[] = [
    {
      logicalId: principal.logicalId,
      roleName: principal.roleName,
      trust: ["ec2.amazonaws.com"],
      statements: rng.shuffle(principalStatements),
    },
    {
      logicalId: target.logicalId,
      roleName: target.roleName,
      trust,
      statements: rng.shuffle(targetStatements),
      witness: plan.trust === "star",
    },
  ];

  // ノイズロール。PassRoleは持たず、「trust」「アクセス」「Lambda制御」のうち高々1つだけを持ちます。
  // こうすると、principalとtarget以外で4条件がそろうことはありません。
  const noiseIds: string[] = [];
  for (const n of noiseIndexes) {
    const noise = roleOf(n);
    noiseIds.push(noise.logicalId);
    const kind = rng.pick(["lambda-only", "trust-only", "access-only", "inert"] as const);
    const statements: StatementSpec[] = [inertStatement(rng)];
    let noiseTrust = ["ec2.amazonaws.com"];
    if (kind === "lambda-only") statements.push(...lambdaStatements(rng).value);
    if (kind === "trust-only") noiseTrust = [LAMBDA];
    if (kind === "access-only") {
      statements.push({
        actions: accessActions(rng).value,
        resources: [accessResource(rng, BUCKET_A).value],
      });
    }
    roles.push({
      logicalId: noise.logicalId,
      roleName: noise.roleName,
      trust: noiseTrust,
      statements,
    });
  }
  if (noiseIds.length > 0) forms.push("noise-roles");

  // allowedPassRoleTargets: 安全化のときはtarget自身、そうでないときはまれに無関係なロールを指定します。
  let allowedPassRoleTargets: string[] | undefined;
  if (plan.allowed) {
    allowedPassRoleTargets = [target.logicalId];
    forms.push("allowed-target");
  } else if (noiseIds.length > 0 && rng.chance(0.15)) {
    allowedPassRoleTargets = [noiseIds[0] as string];
    forms.push("allowed-other");
  }

  return {
    roles,
    config:
      allowedPassRoleTargets === undefined
        ? { protectedBucketArns }
        : { protectedBucketArns, allowedPassRoleTargets },
    forms,
  };
}

function caseFromPlan(id: number, category: Category, rng: Rng, plan: Plan): Case {
  const built = buildFromPlan(rng, plan);
  const { model, witness } = buildModel(built.roles);
  const tags = planTags(plan);
  return {
    id,
    model,
    config: built.config,
    category,
    label: planLabel(plan),
    tags,
    witness: tags.length > 0 ? witness : { paths: [], roles: [] },
    forms: built.forms,
  };
}

// ---------------------------------------------------------------------------------------------
// 固定の境界Case（design 4.2.2 の5、6.2のD1回帰を含む）
// ---------------------------------------------------------------------------------------------

const PB = "arn:aws:s3:::protected-bucket";

interface Fixed {
  readonly name: string;
  readonly label: Label;
  readonly config: ProofGateConfig;
  readonly roles: RoleSpec[];
}

/** 典型的なprincipalロールです。PassRoleとLambda作成を持ちます。 */
const devRole = (passResources: string[], extra: StatementSpec[] = []): RoleSpec => ({
  logicalId: "Dev",
  roleName: "dev-role",
  trust: ["ec2.amazonaws.com"],
  statements: [
    { actions: ["iam:PassRole"], resources: passResources },
    { actions: ["lambda:CreateFunction"], resources: ["*"] },
    ...extra,
  ],
});

const dataRole = (accessResources: string[], actions = ["s3:GetObject"]): RoleSpec => ({
  logicalId: "Data",
  roleName: "data-role",
  trust: [LAMBDA],
  statements: [{ actions, resources: accessResources }],
});

const PASS_DATA = [`arn:aws:iam::${ACCOUNT}:role/data-role`];

function d1(name: string, label: Label, accessResource: string): Fixed {
  return {
    name,
    label,
    config: { protectedBucketArns: [PB] },
    roles: [devRole(PASS_DATA), dataRole([accessResource])],
  };
}

const FIXED: readonly Fixed[] = [
  {
    name: "single-role",
    label: "safe",
    config: { protectedBucketArns: [PB] },
    roles: [dataRole([`${PB}/*`])],
  },
  {
    name: "principal-equals-target",
    label: "safe",
    config: { protectedBucketArns: [PB] },
    roles: [
      {
        logicalId: "Self",
        roleName: "self-role",
        trust: [LAMBDA],
        statements: [
          { actions: ["iam:PassRole"], resources: ["*"] },
          { actions: ["lambda:CreateFunction"], resources: ["*"] },
          { actions: ["s3:GetObject"], resources: [`${PB}/*`] },
        ],
      },
    ],
  },
  {
    name: "target-without-access",
    label: "safe",
    config: { protectedBucketArns: [PB] },
    roles: [devRole(PASS_DATA), dataRole(["arn:aws:s3:::another-bucket/*"])],
  },
  {
    name: "split-statements",
    label: "unsafe",
    config: { protectedBucketArns: [PB] },
    roles: [
      {
        ...devRole(PASS_DATA),
        statements: [
          { actions: ["iam:PassRole"], resources: PASS_DATA },
          { actions: ["lambda:UpdateFunctionConfiguration"], resources: ["*"] },
          { actions: ["lambda:UpdateFunctionCode"], resources: ["*"] },
        ],
      },
      {
        ...dataRole([`${PB}/*`]),
        statements: [
          { actions: ["s3:PutObject"], resources: [`${PB}/a/*`] },
          { actions: ["s3:DeleteObject"], resources: [`${PB}/b/*`] },
        ],
      },
    ],
  },
  {
    name: "two-buckets",
    label: "unsafe",
    config: { protectedBucketArns: [arnOf(BUCKET_A), arnOf(BUCKET_B)] },
    roles: [devRole(PASS_DATA), dataRole([`${arnOf(BUCKET_B)}/*`])],
  },
  {
    name: "trailing-slash-config",
    label: "unsafe",
    config: { protectedBucketArns: [`${arnOf(BUCKET_A)}/`] },
    roles: [devRole(PASS_DATA), dataRole([`${arnOf(BUCKET_A)}/*`])],
  },
  {
    name: "max-roles",
    label: "unsafe",
    config: { protectedBucketArns: [PB] },
    roles: [
      devRole(PASS_DATA),
      dataRole([`${PB}/*`]),
      {
        logicalId: "NoiseA",
        roleName: "noise-a",
        trust: [LAMBDA],
        statements: [{ actions: ["logs:PutLogEvents"], resources: ["*"] }],
      },
      {
        logicalId: "NoiseB",
        roleName: "noise-b",
        trust: ["ec2.amazonaws.com"],
        statements: [{ actions: ["lambda:CreateFunction"], resources: ["*"] }],
      },
    ],
  },
  {
    name: "allowed-target",
    label: "safe",
    config: { protectedBucketArns: [PB], allowedPassRoleTargets: ["Data"] },
    roles: [devRole(PASS_DATA), dataRole([`${PB}/*`])],
  },
  d1("d1-1-prefix-star", "unsafe", `${PB}/reports/*`),
  d1("d1-2-prefix-object", "unsafe", `${PB}/reports/file.csv`),
  d1("d1-3-another-bucket", "safe", "arn:aws:s3:::another-bucket/reports/*"),
  d1("d1-4-bucket-level-only", "safe", PB),
  d1("d1-5-intersecting-bucket-wildcard", "unsafe", "arn:aws:s3:::protected-*/*"),
  d1("d1-6-disjoint-bucket-wildcard", "safe", "arn:aws:s3:::other-*/*"),
  d1("d1-7-bucket-trailing-star", "unsafe", `${PB}*`),
  d1("d1-8-all-s3", "unsafe", "arn:aws:s3:::*"),
  d1("d1-10-question-key", "unsafe", `${PB}/?`),
  {
    name: "question-wildcards",
    label: "unsafe",
    config: { protectedBucketArns: [PB] },
    roles: [
      {
        ...devRole([`arn:aws:iam::${ACCOUNT}:role/data-rol?`]),
        statements: [
          { actions: ["iam:PassRol?"], resources: [`arn:aws:iam::${ACCOUNT}:role/data-rol?`] },
          { actions: ["lambda:CreateFunction"], resources: ["*"] },
        ],
      },
      dataRole([`${PB}/*`]),
    ],
  },
];

/** 固定の境界Caseの件数です。 */
export const BOUNDARY_COUNT = FIXED.length;

function boundaryCase(id: number, fixed: Fixed): Case {
  const { model } = buildModel(fixed.roles);
  return {
    id,
    model,
    config: fixed.config,
    category: "boundary",
    label: fixed.label,
    tags: [],
    witness: { paths: [], roles: [] },
    forms: [`boundary:${fixed.name}`],
  };
}

// ---------------------------------------------------------------------------------------------
// 層別の割り当てと公開API
// ---------------------------------------------------------------------------------------------

/** 20件ごとの周期で、unsafe 8件、safe 8件、conservative 4件を割り当てます。 */
function slotCategory(slot: number): Category {
  if (slot < 8) return "unsafe";
  if (slot < 16) return "safe";
  return "conservative";
}

/** seedとindexからCaseを1件生成します。同じ入力なら必ず同じCaseです。 */
export function generateCase(seed: number, index: number): Case {
  const fixed = FIXED[index];
  if (fixed !== undefined) return boundaryCase(index, fixed);
  const k = index - BOUNDARY_COUNT;
  const rng = createRng(seed, index);
  const category = slotCategory(k % 20);
  if (category === "unsafe") return caseFromPlan(index, "unsafe", rng, VALID_PLAN);
  if (category === "safe") {
    return caseFromPlan(index, "safe", rng, { ...VALID_PLAN, ...rng.pick(BREAKS) });
  }
  const variant = CONSERVATIVE_PLANS[Math.floor(k / 20) % CONSERVATIVE_PLANS.length];
  return caseFromPlan(index, "conservative", rng, { ...VALID_PLAN, ...variant });
}

/** 先頭からcount件のCaseを生成します。 */
export function generateCases(seed: number, count: number): Case[] {
  return Array.from({ length: count }, (_, index) => generateCase(seed, index));
}

/** AWS上有効な形式のうち、既定の実行で1件以上現れるべきものです。 */
const REQUIRED_FORMS: readonly string[] = [
  "pass:exact",
  "pass:star",
  "pass:question",
  "pass:service-star",
  "pass:all",
  "pass:mixed-case",
  "passres:arn-exact",
  "passres:account-star",
  "passres:partition-star",
  "passres:prefix-star",
  "passres:question",
  "passres:star",
  "lambda:create",
  "lambda:service-star",
  "lambda:create-glob",
  "lambda:config-code-split",
  "lambda:config-code-one",
  "accessact:get",
  "accessact:put-star",
  "accessact:service-star",
  "accessact:mixed-case",
  "accessact:two-patterns",
  "accessact:all",
  "accessact:question",
  "access:bucket-star",
  "access:prefix",
  "access:object",
  "access:bucket-trailing-star",
  "access:bucket-wildcard",
  "access:all-s3",
  "access:question-key",
  "access:mid-star",
  "access:question-bucket",
  "split-statements",
  "trailing-slash-bucket",
  "two-buckets",
  "allowed-target",
  "allowed-other",
  "noise-roles",
  ...FIXED.map((f) => `boundary:${f.name}`),
];

/** 既定の実行で、カテゴリ・タグ・形式のカウンタがすべて1件以上になる必要があります。 */
export function requiredCoverageKeys(): string[] {
  return [
    ...CATEGORIES.map((c) => `category:${c}`),
    ...TAGS.map((t) => `tag:${t}`),
    ...REQUIRED_FORMS.map((f) => `form:${f}`),
  ];
}
