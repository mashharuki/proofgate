import { describe, expect, it } from "vitest";
// @ts-expect-error JavaScriptのスクリプトをテストから直接読み込みます（tests/は型検査の対象外）。
import { unexpectedEntries } from "../scripts/pack-rules.mjs";

// 公開パッケージへテスト専用コードが混入しないことを保証する規則の検査です（Property: P25）。
describe("package tarball rules", () => {
  const good = [
    "package/package.json",
    "package/README.md",
    "package/LICENSE",
    "package/dist/index.js",
    "package/dist/index.d.ts",
    "package/dist/index.js.map",
    "package/lean/lean-toolchain",
    "package/lean/ProofGate/Security.lean",
  ];

  it("accepts exactly the files a package may contain", () => {
    expect(unexpectedEntries(good)).toEqual([]);
    expect(unexpectedEntries(new Set([...good, "package/"]))).toEqual([]);
  });

  it.each([
    "package/tests/pbt/support/oracle.ts",
    "package/pbt/oracle.ts",
    "package/dist/pbt/oracle.js",
    "package/dist/tests/helper.js",
    "package/dist/selfcheck.test.js",
    "package/dist/extractor.test.js",
    "package/lean/tests/Check.lean",
  ])("rejects the test-only file %s", (entry) => {
    expect(unexpectedEntries([...good, entry])).toEqual([entry]);
  });

  it.each([
    "package/src/index.ts",
    "package/scripts/check-packages.mjs",
    "package/.kiro/steering/product.md",
    "package/biome.json",
    "package/tsconfig.json",
    "package/node_modules/x/index.js",
  ])("rejects the file %s that is outside the allowed set", (entry) => {
    expect(unexpectedEntries([...good, entry])).toEqual([entry]);
  });
});
