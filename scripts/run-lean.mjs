import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// elanが同梱lean-toolchainを確実に検出できるよう、Leanプロジェクト内でLakeを起動します。
const leanDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../packages/cdk-plugin/lean",
);
const args = process.argv.slice(2);
const result = spawnSync("lake", args, { cwd: leanDirectory, stdio: "inherit" });

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
