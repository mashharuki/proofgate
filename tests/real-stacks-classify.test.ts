import { describe, expect, it } from "vitest";
import {
  CLASSES,
  ClassificationError,
  classify,
  RESULTS,
} from "../examples/real-stacks/src/classify.js";

// 実測結果の分類規則を確認します（Property: P5）。
const c = (groundTruth: string, inScope: boolean, result: string): string =>
  classify({ groundTruth, inScope, result });

describe("classification of a measured Result", () => {
  it("is a correct detection when an unsafe in-scope Pattern gives PG-IAM-004", () => {
    expect(c("unsafe", true, "PG-IAM-004")).toBe("correct detection");
    expect(c("unsafe", true, "PG-IAM-003+PG-IAM-004")).toBe("correct detection");
  });

  it("is a correct acceptance when a safe Pattern is accepted", () => {
    expect(c("safe", true, "accepted")).toBe("correct acceptance");
  });

  it("is rejected as unsupported when only PG-IAM-003 is reported, whatever the ground truth", () => {
    expect(c("safe", true, "PG-IAM-003")).toBe("rejected as unsupported");
    expect(c("unsafe", true, "PG-IAM-003")).toBe("rejected as unsupported");
  });

  it("is a false negative when an unsafe in-scope Pattern is accepted", () => {
    expect(c("unsafe", true, "accepted")).toBe("false negative");
  });

  it("is a false positive when a safe Pattern gets PG-IAM-004", () => {
    expect(c("safe", true, "PG-IAM-004")).toBe("false positive");
    expect(c("safe", true, "PG-IAM-003+PG-IAM-004")).toBe("false positive");
  });

  it("is outside the documented boundary when an unsafe Pattern outside the scope is accepted", () => {
    expect(c("unsafe", false, "accepted")).toBe("outside the documented boundary");
  });

  it("refuses to file an unsafe Pattern outside the scope that was not accepted", () => {
    for (const result of ["PG-IAM-003", "PG-IAM-004", "PG-IAM-003+PG-IAM-004"]) {
      expect(() => c("unsafe", false, result)).toThrow(ClassificationError);
    }
  });

  it("refuses unknown inputs instead of guessing", () => {
    expect(() => c("maybe", true, "accepted")).toThrow(ClassificationError);
    expect(() => c("safe", true, "rejected")).toThrow(ClassificationError);
    expect(() => c("safe", true, "")).toThrow(ClassificationError);
  });

  it("gives every combination of the allowed values a class or an explicit error", () => {
    const seen = new Set<string>();
    for (const groundTruth of ["safe", "unsafe"]) {
      for (const inScope of [true, false]) {
        for (const result of RESULTS) {
          try {
            const name = c(groundTruth, inScope, result);
            expect(CLASSES).toContain(name);
            seen.add(name);
          } catch (error) {
            expect(error).toBeInstanceOf(ClassificationError);
          }
        }
      }
    }
    // 6つの分類がすべて到達できること。
    expect([...seen].sort()).toEqual([...CLASSES].sort());
  });
});
