import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// spec proofgate-kiroween-submission, R2: 同じスタックで「通常の合成 → ゲートの拒否 → 許可の修正 → ゲートの通過」を確かめます。
// The same stack: plain synth passes, the gate rejects it, the fix removes the excess permission, and the gate accepts it.
const root = resolve(".");
const status = () =>
  spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).stdout;
describe("pnpm demo:fix", () => {
  it("runs the four steps on the same stack and leaves no tracked file changed", () => {
    const before = status();
    const run = spawnSync("node", ["scripts/demo-fix.mjs"], { cwd: root, encoding: "utf8" });
    const output = `${run.stdout}\n${run.stderr}`;
    expect(run.status, output).toBe(0);
    expect(output).toContain("step 1/4 plain synth: exit 0 (as expected)");
    expect(output).toContain("step 2/4 gated synth: exit 1, PG-IAM-004 (as expected)");
    expect(output).toContain("step 3/4 fix: removed the iam:PassRole statement");
    expect(output).toContain("step 4/4 gated synth of the fixed stack: exit 0 (as expected)");
    // 手順2と4でゲートが動いたこと。 The gate ran in steps 2 and 4.
    expect(
      output.match(/ProofGate is on: protected bucket arn:aws:s3:::proofgate-protected-data/g),
    ).toHaveLength(2);
    // 修正にも、例外承認や許可リストを使いません。 The fix uses no acknowledgement and no allow list.
    expect(output).not.toMatch(/acknowledge\(|allowedPassRoleTargets|allowedPolicyWriters/);
    expect(status()).toBe(before);
  }, 120_000);
});
