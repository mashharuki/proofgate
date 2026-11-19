import { describe, expect, it } from "vitest";
import { selectPattern } from "../examples/real-stacks/src/catalog.js";
import type { Pattern } from "../examples/real-stacks/src/pattern.js";

// Patternの選択規則を確認します（Property: P2）。cdkは起動せず、選択関数だけを呼びます。
const fake = (id: `RS-${string}`): Pattern => ({
  id,
  title: "t",
  description: "d",
  groundTruth: "safe",
  inScope: true,
  build: () => {},
});
const list = [fake("RS-01"), fake("RS-02")];

describe("Pattern selection", () => {
  it("returns the Pattern with the given id", () => {
    expect(selectPattern("RS-02", list).id).toBe("RS-02");
  });

  it.each([undefined, null, "", 42, {}])(
    "rejects a missing or invalid id (%s) and lists the valid ids",
    (id) => {
      expect(() => selectPattern(id, list)).toThrow("RS-01, RS-02");
    },
  );

  it("rejects an unknown id without falling back to a default", () => {
    expect(() => selectPattern("RS-99", list)).toThrow('Unknown pattern "RS-99"');
    expect(() => selectPattern("rs-01", list)).toThrow("Unknown pattern");
  });

  it("says so when the catalogue is empty", () => {
    expect(() => selectPattern("RS-01", [])).toThrow("(none)");
  });
});
