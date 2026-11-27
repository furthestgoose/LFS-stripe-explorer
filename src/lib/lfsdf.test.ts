import { describe, expect, it } from "vitest";
import { parseLfsDf } from "./lfsdf";

const LFS_DF = `UUID                       1K-blocks        Used   Available Use% Mounted on
lustre-MDT0000_UUID         1048576       51200     979456   5% serverA@tcp:/lustre
lustre-OST0000_UUID         8388608      442368    7946240   6% serverA@tcp:/lustre
lustre-OST0001_UUID         8388608      104857   8284031   2% serverA@tcp:/lustre

filesystem_summary:         16777216      547205   16230011   4% serverA@tcp:/lustre`;

const LFS_DF_I = `UUID                       1K-blocks        Used   Available Use% Inodes IUsed IFree IUse%
lustre-OST0000_UUID         8388608      442368    7946240   6%    4200    55  4145   2%
lustre-OST0001_UUID         8388608      104857   8284031   2%    4200    12  4188   1%`;

describe("parseLfsDf", () => {
  it("parses one row per OST with KiB units", () => {
    const rows = parseLfsDf(LFS_DF);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: "lustre-OST0000_UUID",
      totalK: 8388608,
      usedK: 442368,
      freeK: 7946240,
      usePct: 6,
    });
    expect(rows[1].name).toBe("lustre-OST0001_UUID");
  });

  it("ignores MDTs, headers and filesystem_summary rows", () => {
    const rows = parseLfsDf(LFS_DF);
    expect(rows.map((r) => r.name)).not.toContain("lustre-MDT0000_UUID");
  });

  it("merges inode counts from lfs df -i output", () => {
    const rows = parseLfsDf(LFS_DF_I);
    expect(rows).toHaveLength(2);
    expect(rows[0].inodesTotal).toBe(4200);
    expect(rows[0].inodesUsed).toBe(55);
    expect(rows[1].inodesUsed).toBe(12);
  });

  it("returns no rows for empty or unexpected output", () => {
    expect(parseLfsDf("")).toEqual([]);
    expect(parseLfsDf("garbage")).toEqual([]);
  });
});
