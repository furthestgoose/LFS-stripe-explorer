import { describe, expect, it } from "vitest";
import { buildRebalanceSuggestions, formatBytes, pct } from "./rebalance";
import { finalizeScan } from "./scan";
import type { FileStripeInfo, OSTDiskSpace, ScanResult } from "./types";

function file(path: string, sizeMb: number, ost: number): FileStripeInfo {
  const half = Math.floor(sizeMb / 2);
  return {
    path,
    size: sizeMb * 1024 ** 2,
    layout: {
      type: "raid0",
      stripe_count: 2,
      stripe_size: 1048576,
      pool: null,
    },
    stripes: [
      { start: 0, end: half, ost, mirror: -1 },
      { start: half, end: sizeMb, ost, mirror: -1 },
    ],
    raw: "",
  };
}

function space(index: number, usePct: number): OSTDiskSpace {
  const totalK = 1000;
  const usedK = (totalK * usePct) / 100;
  return {
    index,
    name: `lustre-OST000${index}_UUID`,
    totalK,
    usedK,
    freeK: totalK - usedK,
    usePct,
    inodesTotal: null,
    inodesUsed: null,
  };
}

describe("buildRebalanceSuggestions", () => {
  it("suggests moving large files to the coolest OST on a skewed scan", () => {
    const res = finalizeScan(
      "/x",
      [
        file("/heavy-0", 400, 0),
        file("/heavy-1", 380, 0),
        file("/heavy-2", 360, 0),
        file("/light", 20, 1),
      ],
      [],
      1,
      0,
      "simulated",
    );
    const suggestions = buildRebalanceSuggestions(res);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].files.length).toBeGreaterThan(0);
    expect(suggestions[0].files[0].command).toContain("lfs migrate");
    expect(suggestions[0].files[0].command).toContain("--stripe-index 1");
  });

  it("stays silent on a balanced scan", () => {
    const res = finalizeScan(
      "/x",
      [file("/a", 400, 0), file("/b", 400, 1)],
      [],
      1,
      0,
      "simulated",
    );
    expect(buildRebalanceSuggestions(res)).toHaveLength(0);
  });

  it("trusts capacity over scanned bytes when lfs df data is present", () => {
    const res = finalizeScan(
      "/x",
      [file("/a", 400, 0), file("/b", 20, 1)],
      [],
      1,
      0,
      "simulated",
    );
    const balancedCapacity: ScanResult = {
      ...res,
      ostSpace: [space(0, 30), space(1, 29)],
    };
    expect(buildRebalanceSuggestions(balancedCapacity)).toHaveLength(0);
    const skewedCapacity: ScanResult = {
      ...res,
      ostSpace: [space(0, 90), space(1, 10)],
    };
    const suggestions = buildRebalanceSuggestions(skewedCapacity);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].label).toContain("90% full");
  });

  it("returns no suggestions when everything is on one OST", () => {
    const res = finalizeScan(
      "/x",
      [file("/a", 400, 0), file("/b", 300, 0)],
      [],
      1,
      0,
      "simulated",
    );
    expect(buildRebalanceSuggestions(res)).toHaveLength(0);
  });
});

describe("format helpers", () => {
  it("formats bytes in KiB units", () => {
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(0)).toBe("0 B");
    expect(pct(12.34)).toBe(12.3);
  });
});
