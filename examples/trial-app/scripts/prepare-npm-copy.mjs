// 試用アプリのコピーを作り、ワークスペースの代わりにnpmの公開版のProofGateを使うようにします。
// 公開版との比較に使います。コピーの中で`npm install`を実行してください（このスクリプトはネットワークを使いません）。
// Makes a copy of the trial app that uses a published npm version of ProofGate instead of the workspace,
// for a comparison with that version. Run `npm install` in the copy (this script does not use the network).
//
// Usage: node scripts/prepare-npm-copy.mjs <target dir> <version, for example 1.1.2>
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [target, version] = process.argv.slice(2);
if (target === undefined || version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: node scripts/prepare-npm-copy.mjs <target dir> <version>");
  process.exit(2);
}
const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(target);
if (existsSync(join(out, "package.json"))) {
  console.error(`${out} already has a package.json; use an empty directory.`);
  process.exit(2);
}
for (const name of ["src", "data", "cdk.json"]) {
  cpSync(join(app, name), join(out, name), { recursive: true });
}
const pkg = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
pkg.dependencies["@proofgate-cdk/cdk-plugin"] = version;
// The workspace takes TypeScript and the Node.js types from the repository root; the copy needs its own.
const root = JSON.parse(readFileSync(join(app, "..", "..", "package.json"), "utf8"));
pkg.devDependencies.typescript = root.devDependencies.typescript;
pkg.devDependencies["@types/node"] = root.devDependencies["@types/node"];
writeFileSync(join(out, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
// The copy cannot extend ../../tsconfig.base.json, so the base options are written out.
const base = JSON.parse(readFileSync(join(app, "..", "..", "tsconfig.base.json"), "utf8"));
const tsconfig = {
  compilerOptions: { ...base.compilerOptions, outDir: "dist", rootDir: "src" },
  include: ["src/**/*.ts"],
};
writeFileSync(join(out, "tsconfig.json"), `${JSON.stringify(tsconfig, null, 2)}\n`);
console.log(`Prepared ${out} with @proofgate-cdk/cdk-plugin ${version}.`);
console.log(
  `Next: cd ${out} && npm install && npx tsc -p tsconfig.json && node dist/run-variants.js --expected data/expected-npm-${version}.json`,
);
