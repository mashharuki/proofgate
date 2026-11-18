/**
 * 公開パッケージのtarballに入ってよいファイルの規則です。
 * 生成テスト・ハーネス・オラクルなど、テスト専用のコードが公開物へ混入しないことを保証します。
 */

/** tarball直下に置いてよいファイルです。 */
const ALLOWED_FILES = new Set(["package/package.json", "package/README.md", "package/LICENSE"]);

/** 置いてよいディレクトリです（ビルド成果物とLeanプロジェクト）。 */
const ALLOWED_DIRECTORIES = ["package/dist/", "package/lean/"];

/** テスト専用コードを示す名前です。許可ディレクトリの中にあっても拒否します。 */
const TEST_ONLY = [/(^|\/)tests?\//, /(^|\/)pbt\//, /\.test\.[cm]?[jt]s$/, /(^|\/)selfcheck\./];

/**
 * 許可されていないtarballエントリを返します。
 * 許可するのは、package.json、README.md、LICENSE、dist/、lean/ だけです。
 * テスト専用コードの名前を持つものは、許可ディレクトリの中でも拒否します。
 */
export function unexpectedEntries(entries) {
  return [...entries].filter((entry) => {
    if (entry === "package/") return false;
    const allowed =
      ALLOWED_FILES.has(entry) ||
      ALLOWED_DIRECTORIES.some((directory) => entry.startsWith(directory));
    return !allowed || TEST_ONLY.some((pattern) => pattern.test(entry));
  });
}
