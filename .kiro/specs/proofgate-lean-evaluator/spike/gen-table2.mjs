// Writes the launch table grouped by service prefix (the part before ':'), to measure an indexed lookup in the kernel.
import { writeFileSync } from "node:fs";
import { LAUNCH_ACTIONS } from "/Users/harukikondo/git/proofgate/packages/core/dist/aws-tables.generated.js";
const groups = new Map();
for (const [action, services] of Object.entries(LAUNCH_ACTIONS)) {
  const [prefix, name] = action.split(":");
  if (!groups.has(prefix)) groups.set(prefix, []);
  groups.get(prefix).push([name, services]);
}
const lean = (s) => JSON.stringify(s);
const rows = [...groups.entries()]
  .map(
    ([p, xs]) =>
      `  (${lean(p)}, [${xs.map(([n, s]) => `(${lean(n)}, [${s.map(lean).join(", ")}])`).join(", ")}])`,
  )
  .join(",\n");
writeFileSync(
  "/tmp/lean-spike/Table2.lean",
  `def launchGroups : List (String × List (String × List String)) := [\n${rows}\n]\n`,
);
console.log(groups.size, "groups");
