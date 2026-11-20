import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLASSES, classify, RESULTS } from "../examples/real-stacks/src/classify.js";

// 実スタックの試験の記録（予想と、確認した結果の表）が、Patternの定義と矛盾していないことを確認します。
// ファイルを読むだけで、合成もLeanも使いません（数ミリ秒）。Property: P5, P12。
const base = join(process.cwd(), "examples/real-stacks");
const read = (path: string) => readFileSync(join(base, path), "utf8");

interface Prediction {
  id: string;
  groundTruth: string;
  inScope: boolean;
  boundary?: string;
  predictedResult: string;
  predictedReasons: string[];
  predictedPathVisibleInResult?: boolean;
  basis: string;
}
interface Row {
  id: string;
  groundTruth: string;
  inScope: boolean;
  boundary?: string;
  result: string;
  class: string;
  reasons: string[];
  locations: string[];
  pathVisibleInResult?: boolean;
  deviation: string | null;
}

const predictions = (JSON.parse(read("data/predictions.json")) as { patterns: Prediction[] })
  .patterns;
const expectedFile = JSON.parse(read("data/expected-results.json")) as {
  knownDefects: string[];
  patterns: Row[];
};
const rows = expectedFile.patterns;

/** Patternのファイルから、宣言された値を読みます。 */
const patternFiles = readdirSync(join(base, "src/patterns")).filter((f) => /^rs-\d+\.ts$/.test(f));
const declared = new Map(
  patternFiles.map((file) => {
    const text = read(`src/patterns/${file}`);
    const pick = (re: RegExp) => re.exec(text)?.[1];
    return [
      (pick(/id: "(RS-\d+)"/) ?? file) as string,
      {
        groundTruth: pick(/groundTruth: "(safe|unsafe)"/),
        inScope: pick(/inScope: (true|false)/) === "true",
        boundary: pick(/boundary: "([a-z-]+)"/),
        file,
      },
    ] as const;
  }),
);
const catalogText = read("src/catalog.ts");

const ids = (values: { id: string }[]) => values.map((v) => v.id).sort();

describe("real-stack results table", () => {
  it("lists exactly the Patterns that exist, once each, in predictions and in results", () => {
    const fromFiles = [...declared.keys()].sort();
    expect(fromFiles.length).toBeGreaterThanOrEqual(14);
    expect(ids(predictions)).toEqual(fromFiles);
    expect(ids(rows)).toEqual(fromFiles);
    expect(new Set(ids(rows)).size).toBe(rows.length);
    for (const [id, info] of declared) {
      const name = `rs${id.slice(3)}`;
      expect(catalogText, `${id} is registered in catalog.ts`).toContain(name);
      expect(info.file).toBe(`rs-${id.slice(3)}.ts`);
    }
  });

  it("uses only allowed values", () => {
    for (const row of rows) {
      expect(["safe", "unsafe"], row.id).toContain(row.groundTruth);
      expect(RESULTS as readonly string[], row.id).toContain(row.result);
      expect(CLASSES as readonly string[], row.id).toContain(row.class);
    }
    for (const prediction of predictions) {
      expect(RESULTS as readonly string[], prediction.id).toContain(prediction.predictedResult);
    }
  });

  it("agrees with the Pattern files about the ground truth and the scope", () => {
    for (const row of rows) {
      const info = declared.get(row.id);
      expect(row.groundTruth, row.id).toBe(info?.groundTruth);
      expect(row.inScope, row.id).toBe(info?.inScope);
      expect(row.boundary, row.id).toBe(info?.boundary);
    }
    for (const prediction of predictions) {
      const row = rows.find((r) => r.id === prediction.id);
      expect(prediction.groundTruth, prediction.id).toBe(row?.groundTruth);
      expect(prediction.inScope, prediction.id).toBe(row?.inScope);
      expect(prediction.boundary, prediction.id).toBe(row?.boundary);
    }
  });

  it("gives every Pattern outside the modeled scope a boundary, and no other Pattern one", () => {
    for (const row of rows) {
      if (row.inScope) expect(row.boundary, row.id).toBeUndefined();
      else expect(["cross-template", "acknowledged"], row.id).toContain(row.boundary);
    }
  });

  it("has the class that the classification function gives for the ground truth and the result", () => {
    for (const row of rows) {
      expect(row.class, row.id).toBe(
        classify({ groundTruth: row.groundTruth, inScope: row.inScope, result: row.result }),
      );
    }
  });

  it("never files an unsafe in-scope Pattern as a false negative unless it is a known defect", () => {
    for (const row of rows) {
      if (row.class === "false negative") {
        expect(expectedFile.knownDefects, `${row.id} is a false negative`).toContain(row.id);
      }
      if (row.groundTruth === "unsafe" && row.inScope) {
        expect(row.result === "accepted" ? "accepted" : "reported", row.id).toBe("reported");
      }
    }
    for (const id of expectedFile.knownDefects) expect(ids(rows)).toContain(id);
  });

  it("records, for an unsafe in-scope Pattern, whether the path is visible in the Result", () => {
    for (const row of rows) {
      if (row.groundTruth === "unsafe" && row.inScope) {
        expect(row.pathVisibleInResult, row.id).toBe(row.result.includes("PG-IAM-004"));
      } else {
        expect(row.pathVisibleInResult, row.id).toBeUndefined();
      }
    }
  });

  it("explains every difference between the prediction and the result", () => {
    for (const row of rows) {
      const prediction = predictions.find((p) => p.id === row.id) as Prediction;
      const differs =
        prediction.predictedResult !== row.result ||
        [...prediction.predictedReasons].sort().join("|") !== [...row.reasons].sort().join("|") ||
        (prediction.predictedPathVisibleInResult !== undefined &&
          prediction.predictedPathVisibleInResult !== row.pathVisibleInResult);
      if (differs) {
        expect(row.deviation, `${row.id} differs from its prediction`).toMatch(/\S{10,}/);
      } else {
        expect(row.deviation, `${row.id} matches its prediction`).toBeNull();
      }
    }
  });

  it("gives every unsupported result its reasons and the locations that ProofGate reports", () => {
    for (const row of rows) {
      if (row.result.includes("PG-IAM-003")) {
        expect(row.reasons.length, row.id).toBeGreaterThan(0);
        expect(row.locations.length, row.id).toBeGreaterThan(0);
      }
      if (row.result === "accepted") {
        expect(row.reasons, row.id).toEqual([]);
        expect(row.locations, row.id).toEqual([]);
      }
    }
  });
});
