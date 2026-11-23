#!/usr/bin/env node
// デモのスタック（examples/vulnerable-app）のコピーを作り、npmの公開版のProofGateを使うようにします（spec proofgate-kiroween-submission, R4, R5）。
// 審査員が見る出力を、公開版の出力にするためです。コピーの中で`npm install`と`tsc`を実行し、そのあと
// `node scripts/demo-fix.mjs --app-dir <dir>`で4つの手順を流します。このスクリプト自体はネットワークを使いません。
// Makes a copy of the demo stack (examples/vulnerable-app) that uses a published npm version of ProofGate, so that what a
// judge sees is the published output. Run `npm install` and `tsc` in the copy, then
// `node scripts/demo-fix.mjs --app-dir <dir>`. This script does not use the network.
//
// Usage: node scripts/prepare-npm-demo.mjs <target dir> <version, for example 1.2.0>
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [target, version] = process.argv.slice(2);
if (target === undefined || version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: node scripts/prepare-npm-demo.mjs <target dir> <version>");
  process.exit(2);
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(repo, "examples", "vulnerable-app");
const out = resolve(target);
if (existsSync(join(out, "package.json"))) {
  console.error(`${out} already has a package.json; use an empty directory.`);
  process.exit(2);
}
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
cpSync(join(app, "src"), join(out, "src"), { recursive: true });
cpSync(join(app, "cdk.json"), join(out, "cdk.json"));
const pkg = read(join(app, "package.json"));
const root = read(join(repo, "package.json"));
// 依存の版は、リポジトリで固定しているものを使います。 Dependency versions are the ones this repository pins.
const manifest = {
  name: "proofgate-npm-demo",
  private: true,
  type: "module",
  dependencies: { ...pkg.dependencies, "@proofgate-cdk/cdk-plugin": version },
  devDependencies: {
    ...pkg.devDependencies,
    typescript: root.devDependencies.typescript,
    "@types/node": root.devDependencies["@types/node"],
  },
};
writeFileSync(join(out, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
// コピーは../../tsconfig.base.jsonを継承できないため、基本の設定を書き出します。
// The copy cannot extend ../../tsconfig.base.json, so the base options are written out.
const base = read(join(repo, "tsconfig.base.json"));
const tsconfig = {
  compilerOptions: { ...base.compilerOptions, outDir: "dist", rootDir: "src" },
  include: ["src/**/*.ts"],
};
writeFileSync(join(out, "tsconfig.json"), `${JSON.stringify(tsconfig, null, 2)}\n`);
console.log(`Prepared ${out} with @proofgate-cdk/cdk-plugin ${version}.`);
console.log(
  `Next: cd ${out} && npm install && npx tsc -p tsconfig.json && node ${join(repo, "scripts", "demo-fix.mjs")} --app-dir ${out}`,
);
