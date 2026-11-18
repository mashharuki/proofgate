import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unexpectedEntries } from "./pack-rules.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = mkdtempSync(join(tmpdir(), "proofgate-pack-"));

const packages = [
  {
    directory: "packages/model",
    required: [
      "package/dist/index.js",
      "package/dist/index.d.ts",
      "package/README.md",
      "package/LICENSE",
    ],
  },
  {
    directory: "packages/extractor",
    required: [
      "package/dist/index.js",
      "package/dist/index.d.ts",
      "package/README.md",
      "package/LICENSE",
    ],
  },
  {
    directory: "packages/core",
    required: [
      "package/dist/index.js",
      "package/dist/index.d.ts",
      "package/README.md",
      "package/LICENSE",
    ],
  },
  {
    directory: "packages/cdk-plugin",
    required: [
      "package/dist/index.js",
      "package/dist/index.d.ts",
      "package/README.md",
      "package/LICENSE",
      "package/lean/lean-toolchain",
      "package/lean/lakefile.toml",
      "package/lean/ProofGate/Security.lean",
    ],
  },
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
  return result.stdout;
}

try {
  for (const packageSpec of packages) {
    const before = new Set(readdirSync(outputDirectory));
    run("pnpm", ["pack", "--pack-destination", outputDirectory], {
      cwd: join(root, packageSpec.directory),
    });
    const archive = readdirSync(outputDirectory).find(
      (file) => file.endsWith(".tgz") && !before.has(file),
    );
    if (!archive) throw new Error(`No tarball was created for ${packageSpec.directory}`);

    const archivePath = join(outputDirectory, archive);
    const entries = new Set(run("tar", ["-tzf", archivePath]).trim().split("\n"));
    if (
      [...entries].some((entry) => entry.includes("/.lake/") || entry.endsWith("/Generated.lean"))
    ) {
      throw new Error(`${archive} contains generated Lean build files`);
    }
    // 許可されたファイル（package.json、README.md、LICENSE、dist/、lean/）以外と、テスト専用コードを拒否します。
    const unexpected = unexpectedEntries(entries);
    if (unexpected.length > 0) {
      throw new Error(
        `${archive} contains files that must not be published: ${unexpected.join(", ")}`,
      );
    }
    for (const required of packageSpec.required) {
      if (!entries.has(required)) throw new Error(`${archive} does not contain ${required}`);
    }

    const manifest = JSON.parse(run("tar", ["-xOf", archivePath, "package/package.json"]));
    if (manifest.private === true) throw new Error(`${manifest.name} is still private`);
    if (manifest.license !== "Apache-2.0")
      throw new Error(`${manifest.name} does not declare Apache-2.0`);
    if (manifest.publishConfig?.access !== "public")
      throw new Error(`${manifest.name} is not configured for public access`);

    for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
      if (String(version).startsWith("workspace:")) {
        throw new Error(
          `${manifest.name} still contains workspace protocol dependency ${dependency}`,
        );
      }
    }

    console.log(`verified ${manifest.name}@${manifest.version} (${entries.size} files)`);
  }
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
