// 統一差分を当てる小さな関数です。demo-fix.mjsと比較実験（comparison/cdk-nag/run.mjs）が使います。
// A small unified-diff applier, used by demo-fix.mjs and the comparison (comparison/cdk-nag/run.mjs).
/**
 * 統一差分を当てます。文脈の行が一致しないときは、推測せずに失敗します。
 * Applies a unified diff. If a context line does not match, it fails instead of guessing.
 */
export function applyPatch(source, patch) {
  const lines = source.split("\n");
  const hunks = patch.split("\n@@").slice(1);
  let offset = 0;
  for (const hunk of hunks) {
    const [header, ...body] = hunk.split("\n");
    const start = Number(/-(\d+)/.exec(header)?.[1]) - 1;
    const old = [];
    const next = [];
    for (const line of body) {
      if (line.startsWith("-")) old.push(line.slice(1));
      else if (line.startsWith("+")) next.push(line.slice(1));
      else if (line.startsWith(" ")) {
        old.push(line.slice(1));
        next.push(line.slice(1));
      }
    }
    const at = start + offset;
    const current = lines.slice(at, at + old.length);
    if (current.join("\n") !== old.join("\n")) {
      throw new Error(`the patch does not match the source near line ${start + 1}`);
    }
    lines.splice(at, old.length, ...next);
    offset += next.length - old.length;
  }
  return lines.join("\n");
}
