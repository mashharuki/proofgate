// Writes the launch table (879 actions with services) as Lean data, to measure kernel evaluation over the full table.
import { writeFileSync } from "node:fs";
import { LAUNCH_ACTIONS } from "/Users/harukikondo/git/proofgate/packages/core/dist/aws-tables.generated.js";
const entries = Object.entries(LAUNCH_ACTIONS);
const lean = (s) => JSON.stringify(s);
const rows = entries.map(([a, svcs]) => `  (${lean(a)}, [${svcs.map(lean).join(", ")}])`).join(",\n");
writeFileSync(
  "/tmp/lean-spike/Table.lean",
  `def launchTable : List (String × List String) := [\n${rows}\n]\n`,
);
console.log(entries.length);
