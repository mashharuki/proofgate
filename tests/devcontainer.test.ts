import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// spec proofgate-kiroween-submission, R5.5: 開発コンテナは、リポジトリが固定している版だけを使います。
// The dev container uses only the versions that the repository pins.
const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
describe("dev container", () => {
  const container = JSON.parse(read(".devcontainer/devcontainer.json")) as {
    features: Record<string, { version: string; pnpmVersion: string }>;
  };
  const node = Object.entries(container.features).find(([id]) =>
    id.startsWith("ghcr.io/devcontainers/features/node:"),
  )?.[1];
  it("installs the Node.js version of .nvmrc", () => {
    expect(node?.version).toBe(read(".nvmrc").trim());
  });
  it("installs the pnpm version of the packageManager field", () => {
    const pinned = (JSON.parse(read("package.json")) as { packageManager: string }).packageManager;
    expect(`pnpm@${node?.pnpmVersion}`).toBe(pinned);
  });
  it("configures no AWS tool and no secret", () => {
    const text = read(".devcontainer/devcontainer.json") + read(".devcontainer/post-create.sh");
    expect(text).not.toMatch(/aws-cli|features\/aws|AWS_ACCESS_KEY|AWS_SECRET|secrets/i);
  });
});
