import { describe, expect, it } from "vitest";
import { filesCsv, scanJson, treeCsv, treeOstCsv } from "./exporters";
import { buildTree } from "./tree";
import type { FileStripeInfo, ScanResult } from "./types";

function file(path: string, size: number, osts: number[]): FileStripeInfo {
  return {
    path,
    size,
    layout: { type: "raid0", stripe_count: Math.max(1, osts.length), stripe_size: 1048576, pool: null },
    stripes: osts.map((ost, i) => ({ start: i, end: i, ost, mirror: 0 })),
    raw: null,
  };
}

function result(files: FileStripeInfo[]): ScanResult {
  return {
    root: "/data",
    stats: {
      files: files.length,
      dirs: 0,
      totalSize: files.reduce((a, f) => a + f.size, 0),
      totalStripes: files.reduce((a, f) => a + f.stripes.length, 0),
      ostCount: 0,
      minPerOST: 0,
      maxPerOST: 0,
      stdevPerOST: 0,
      balancePct: 100,
      meanStripeSize: 1048576,
      meanFileSize: 0,
      layouts: {},
      elapsedMs: 1,
    },
    statsExtra: { depthHistogram: [], stripeSizeHistogram: [], fileHistogram: [], layoutHistogram: [], topDirs: [] },
    ostProfile: { perOST: [], countSpread: [], countVsBytesCorrelation: 0, countVsBytesSlope: 0, countGini: 0, countCV: 0 },
    files,
    errors: [],
    ostNames: {},
    byteDistributions: [],
    source: "simulated",
  };
}

describe("filesCsv", () => {
  it("emits one row per file with comma-joined OST list", () => {
    const csv = filesCsv(result([file("/data/a", 1024, [0, 1]), file("/data/b", 5, [-1])]));
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe("path,size_bytes,size_human,layout,stripe_count,stripe_size,stripes_used,osts");
    expect(lines[1]).toBe("/data/a,1024,1.0 KiB,raid0 count=2 size=1048576,2,1048576,2,0;1");
    // Unplaced stripe (ost -1) still counts in stripes_used but is absent from osts.
    expect(lines[2]).toBe("/data/b,5,5 B,raid0 count=1 size=1048576,1,1048576,1,");
  });
});

describe("treeCsv / treeOstCsv", () => {
  it("one row per directory, tallies rolled up", () => {
    const files = [file("/data/a/x", 100, [0]), file("/data/b/y", 50, [1])];
    const r = result(files);
    const tree = buildTree("/data", files);
    const csv = treeCsv(r, tree);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe("dir,files,bytes,stripes,OSTs");
    expect(lines).toContain("a,1,100,1,0:1");
    expect(lines).toContain(".,2,150,2,0:1;1:1");
    expect(lines).toContain("b,1,50,1,1:1");

    const ostCsv = treeOstCsv(r, tree);
    const ostLines = ostCsv.trimEnd().split("\n");
    expect(ostLines[0]).toBe("dir,ost,count");
    expect(ostLines).toContain(".,0,1");
    expect(ostLines).toContain(".,1,1");
    expect(ostLines).toContain("a,0,1");
  });
});

describe("scanJson", () => {
  it("round-trips the scan result losslessly", () => {
    const r = result([file("/data/a", 1, [0])]);
    expect(JSON.parse(scanJson(r))).toEqual(r);
  });
});
