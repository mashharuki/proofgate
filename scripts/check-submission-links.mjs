#!/usr/bin/env node
// 提出用の文書（docs/submission/*.md と docs/GETTING_STARTED.en.md）のリンクを確かめます（spec proofgate-kiroween-submission, task 11.3）。
// 相対リンクはファイルかディレクトリが存在すること、このリポジトリのコミットへのリンクはそのコミットが存在することを見ます。
// ほかのURLは一覧にするだけで、ネットワークは使いません。
// Checks the links of the submission documents: a relative link must point at an existing file or directory, and a link to a
// commit of this repository must name a commit on origin/main. Other URLs are listed only; no network is used.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  join(repo, "docs", "GETTING_STARTED.en.md"),
  ...readdirSync(join(repo, "docs", "submission"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(repo, "docs", "submission", f)),
];
const COMMIT = /^https:\/\/github\.com\/mashharuki\/proofgate\/commit\/([0-9a-f]{7,40})$/;
let broken = 0;
const external = new Set();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const commit = COMMIT.exec(target);
    if (commit !== null) {
      // 公開されたmainから到達できるコミットだけを数えます。 Count only commits reachable from the published main.
      const ok =
        spawnSync("git", ["merge-base", "--is-ancestor", commit[1], "origin/main"], { cwd: repo })
          .status === 0;
      if (!ok) {
        console.log(`BROKEN ${file}: commit ${commit[1]} is not on origin/main`);
        broken++;
      }
      continue;
    }
    if (/^[a-z]+:/.test(target)) {
      external.add(target);
      continue;
    }
    const path = resolve(dirname(file), target.split("#")[0]);
    if (!existsSync(path)) {
      console.log(`BROKEN ${file}: ${target}`);
      broken++;
    }
  }
}
for (const url of [...external].sort()) console.log(`external (not checked): ${url}`);
console.log(`${files.length} files, ${broken} broken links`);
process.exitCode = broken > 0 ? 1 : 0;
