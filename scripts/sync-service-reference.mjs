// AWS Service Referenceから、ProofGateの3つの表を作ります（spec proofgate-brushup, 設計 3 から 5）。
// Builds the three tables of ProofGate from the AWS Service Reference (design sections 3 to 5).
//
// 開発時にだけ使います。ネットワークを使うため、テストにもCIにも組み込みません。
// Dev-time only. It needs the network, so tests and CI never run it.
//
// 使い方 / Usage:
//   node scripts/sync-service-reference.mjs [--out <file>] [--from-dir <dir>] [--date YYYY-MM-DD]
//   --from-dir: 取得済みのJSON（index.jsonと各サービスのJSON）を読みます。ネットワークは使いません。
//
// 出力 / Output: packages/core/src/aws-tables.generated.ts（手で編集しません）
//   OBJECT_ACTIONS        S3の`object`リソースを取るアクション（小文字、`s3:`付き）
//   BUCKET_GRANT_ACTIONS  バケットの権限を変えるアクションと、複製・ライフサイクルの設定
//   LAUNCH_ACTIONS        `iam:PassRole`を伴うアクション -> 渡し先のサービスプリンシパル（"*"は不明）
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const SOURCE = "https://servicereference.us-east-1.amazonaws.com/";
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const out = resolve(argument("--out") ?? join(root, "packages/core/src/aws-tables.generated.ts"));
const fromDir = argument("--from-dir");
const date = argument("--date") ?? new Date().toISOString().slice(0, 10);

/** 取得済みのディレクトリ、またはネットワークから、indexと各サービスのJSONを読みます。 */
async function load() {
  if (fromDir !== undefined) {
    const dir = resolve(fromDir);
    const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
    const services = index.map((entry) =>
      JSON.parse(readFileSync(join(dir, `${entry.service}.json`), "utf8")),
    );
    return { index, services };
  }
  const index = await (await fetch(SOURCE)).json();
  const services = new Array(index.length);
  let next = 0;
  const worker = async () => {
    while (next < index.length) {
      const i = next++;
      const response = await fetch(index[i].url);
      if (!response.ok) throw new Error(`${index[i].url}: HTTP ${response.status}`);
      services[i] = await response.json();
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));
  return { index, services };
}

const { index, services } = await load();
const lower = (value) => value.toLowerCase();
const properties = (action) => action.Annotations?.Properties ?? {};

// 1. S3: `object`リソースを取るアクションと、バケットの権限を変えるアクション。
const s3 = services.find((service) => service.Name === "s3");
if (s3 === undefined) throw new Error("the service file of s3 is missing");
const resourceNames = (action) => (action.Resources ?? []).map((resource) => resource.Name);
const objectActions = s3.Actions.filter((action) => resourceNames(action).includes("object")).map(
  (action) => `s3:${lower(action.Name)}`,
);
const bucketGrant = new Set(
  s3.Actions.filter(
    (action) =>
      resourceNames(action).includes("bucket") &&
      properties(action).IsPermissionManagement === true,
  ).map((action) => `s3:${lower(action.Name)}`),
);
// 設計 4: 複製の設定（全オブジェクトを別のバケットへ写せる）とライフサイクルの設定（全オブジェクトを期限切れにできる）。
for (const name of ["PutReplicationConfiguration", "PutLifecycleConfiguration"]) {
  if (!s3.Actions.some((action) => action.Name === name)) throw new Error(`s3:${name} is missing`);
  bucketGrant.add(`s3:${lower(name)}`);
}

// 2. 起動アクション: `iam:PassRole`を伴うAPI操作の、同じサービスの、タグ付けだけではないアクション。
const taggingOnly = new Set();
for (const service of services) {
  for (const action of service.Actions ?? []) {
    if (properties(action).IsTaggingOnly === true)
      taggingOnly.add(`${service.Name}:${lower(action.Name)}`);
  }
}
const launch = new Map();
let withoutContext = 0;
for (const service of services) {
  for (const operation of service.Operations ?? []) {
    const authorized = operation.AuthorizedActions ?? [];
    const passRoles = authorized.filter((a) => a.Service === "iam" && a.Name === "PassRole");
    if (passRoles.length === 0) continue;
    const targets = new Set();
    for (const passRole of passRoles) {
      const values = passRole.Context?.["iam:PassedToService"];
      if (Array.isArray(values) && values.length > 0)
        for (const value of values) targets.add(lower(value));
      else targets.add("*");
    }
    for (const action of authorized) {
      if (action.Service !== service.Name) continue; // 他のサービスの副次的なアクションは入れません
      // `iam:PassRole`自体は起動アクションではありません。入れると、PassRoleを持つだけで起動できることになります。
      if (action.Service === "iam" && action.Name === "PassRole") continue;
      const key = `${service.Name}:${lower(action.Name)}`;
      if (taggingOnly.has(key)) continue;
      const set = launch.get(key) ?? new Set();
      for (const target of targets) set.add(target);
      launch.set(key, set);
      if (targets.has("*")) withoutContext++;
    }
  }
}

const sorted = (values) => [...values].sort();
const objectSorted = sorted(new Set(objectActions));
const grantSorted = sorted(bucketGrant);
const launchEntries = sorted(launch.keys()).map((key) => [key, sorted(launch.get(key))]);
const modified = Math.max(...index.map((entry) => entry.modified ?? 0));
const body = [
  "// このファイルは`scripts/sync-service-reference.mjs`が生成します。手で編集しません。",
  "// Generated by `scripts/sync-service-reference.mjs`. Do not edit by hand.",
  `// Source: ${SOURCE} (AWS Service Reference), snapshot ${date}, newest file modified ${new Date(modified * 1000).toISOString().slice(0, 10)}.`,
  `// Counts: ${objectSorted.length} object actions, ${grantSorted.length} bucket grant actions, ${launchEntries.length} launch actions.`,
  `// ${services.length} service files were read; ${withoutContext} launch entries have no iam:PassedToService value (read as "*").`,
  "",
  "/** S3の`object`リソースを取るアクションです（小文字）。 */",
  `export const OBJECT_ACTIONS: readonly string[] = ${JSON.stringify(objectSorted)};`,
  "",
  "/** バケットの権限を変えるアクションと、複製・ライフサイクルの設定です（小文字）。 */",
  `export const BUCKET_GRANT_ACTIONS: readonly string[] = ${JSON.stringify(grantSorted)};`,
  "",
  "/**",
  " * `iam:PassRole`を伴うアクションと、ロールの渡し先のサービスプリンシパルです（小文字）。",
  ' * `"*"`は、AWSのデータに渡し先が書かれていないことを表し、どのサービスにも渡せるものとして読みます。',
  " */",
  `export const LAUNCH_ACTIONS: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(Object.fromEntries(launchEntries))};`,
  "",
].join("\n");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, body);
console.log(
  `wrote ${out}: ${objectSorted.length} object actions, ${grantSorted.length} bucket grant actions, ` +
    `${launchEntries.length} launch actions, ${withoutContext} without a passed-to service, ${taggingOnly.size} tagging-only actions known`,
);
